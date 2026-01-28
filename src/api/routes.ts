import { Router, Request, Response } from 'express';
import { existsSync, readFileSync } from 'fs';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { repoRegistry } from '../config/repos.js';
import { settingsManager } from '../config/settings.js';
import { gitSandbox } from '../core/git-sandbox.js';
import { githubIntegration } from '../core/github-integration.js';
import { detectProject } from '../core/project-detector.js';
import { RepoConfigSchema } from '../types.js';
import { settingsRouter } from './settings-routes.js';
import workspaceRouter from './workspace-routes.js';
import { dockerRouter } from './docker-routes.js';
import { skillRouter } from './skill-routes.js';
import { agentRouter } from './agent-routes.js';
import { tunnelRouter } from './tunnel-routes.js';
import { mcpRouter } from './mcp-routes.js';
import { pinAuthManager } from './pin-auth.js';
import { getAuthToken, isRemoteRequest } from './middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execAsync = promisify(exec);

export const apiRouter = Router();

// Server-side cache for health status (60 second TTL)
let healthStatusCache: { data: unknown; timestamp: number } | null = null;
const HEALTH_CACHE_TTL = 60000; // 60 seconds

// Read package.json version
let packageVersion = '3.0.0';
try {
  const packageJsonPath = join(__dirname, '..', '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  packageVersion = packageJson.version;
} catch (err) {
  console.warn('[Health] Could not read package.json version:', err);
}

// Health check
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      version: packageVersion,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    }
  });
});

// Cookie name for session auth (must match middleware)
const AUTH_COOKIE_NAME = 'claudedesk_session';

// Check session - validates cookie auth and returns token if valid
// This allows PWAs to restore authentication from cookies
apiRouter.get('/auth/session', (req: Request, res: Response) => {
  // Extract token from cookie
  const cookies = req.headers.cookie;
  let cookieToken: string | null = null;

  if (cookies) {
    const match = cookies.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
    if (match) {
      cookieToken = match[1];
    }
  }

  if (!cookieToken) {
    res.json({ success: true, data: { authenticated: false } });
    return;
  }

  // Validate the cookie token
  const expectedToken = getAuthToken();
  const isValid = cookieToken === expectedToken;

  if (isValid) {
    res.json({
      success: true,
      data: {
        authenticated: true,
        token: cookieToken // Return token so frontend can store it
      }
    });
  } else {
    // Invalid cookie - clear it
    res.clearCookie(AUTH_COOKIE_NAME);
    res.json({ success: true, data: { authenticated: false } });
  }
});

// ============================================
// PIN Authentication Endpoints
// ============================================

// Generate a new pairing PIN (requires auth)
apiRouter.post('/auth/pin/generate', (_req: Request, res: Response) => {
  try {
    const authToken = getAuthToken();
    const result = pinAuthManager.generatePairingPin(authToken);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Validate a PIN and return auth token (no auth required - this is the auth entry point)
apiRouter.post('/auth/pin/validate', (req: Request, res: Response) => {
  try {
    const { pin } = req.body;

    if (!pin || typeof pin !== 'string') {
      res.status(400).json({ success: false, error: 'PIN is required' });
      return;
    }

    // Get client IP for rate limiting
    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp = forwardedFor
      ? (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : forwardedFor[0])
      : req.ip || req.socket.remoteAddress || 'unknown';

    const result = pinAuthManager.validatePin(pin, clientIp);

    if (result.success && result.token) {
      // Set auth cookie for persistent session
      res.cookie(AUTH_COOKIE_NAME, result.token, {
        httpOnly: true,
        secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      res.json({
        success: true,
        data: { token: result.token },
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        attemptsRemaining: result.attemptsRemaining,
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get status of active PIN (requires auth)
apiRouter.get('/auth/pin/status', (_req: Request, res: Response) => {
  try {
    const status = pinAuthManager.getPinStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Invalidate current PIN (requires auth)
apiRouter.delete('/auth/pin', (_req: Request, res: Response) => {
  try {
    const invalidated = pinAuthManager.invalidatePin();
    res.json({ success: true, data: { invalidated } });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// SEC-02: Remote access status
apiRouter.get('/system/remote-status', (req: Request, res: Response) => {
  const remoteEnabled = process.env.ALLOW_REMOTE === 'true';
  const isRemote = isRemoteRequest(req);
  res.json({ success: true, data: { remoteEnabled, isRemote } });
});

// Health status - comprehensive system status for setup wizard
// Uses parallel execution and caching to reduce response time from ~35s to ~5s
apiRouter.get('/health/status', async (_req: Request, res: Response) => {
  // Check cache first
  if (healthStatusCache && Date.now() - healthStatusCache.timestamp < HEALTH_CACHE_TTL) {
    return res.json({ success: true, data: healthStatusCache.data });
  }

  // Async command checker with timeout
  const checkCommandAsync = async (cmd: string, args: string[]): Promise<boolean> => {
    try {
      await execAsync(`${cmd} ${args.join(' ')}`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  };

  // Sync file check (fast, no need for async)
  const checkClaudeAuth = (): boolean => {
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const claudeConfigPath = join(homeDir, '.claude', 'config.json');
      return existsSync(claudeConfigPath);
    } catch {
      return false;
    }
  };

  try {
    // Run all command checks in parallel
    const [
      cloudflaredInstalled,
      claudeInstalled,
      gitInstalled,
      dockerInstalled,
      dockerRunning,
      whisperInstalled,
      githubConnected,
    ] = await Promise.all([
      checkCommandAsync('cloudflared', ['--version']),
      checkCommandAsync('claude', ['--version']),
      checkCommandAsync('git', ['--version']),
      checkCommandAsync('docker', ['--version']),
      checkCommandAsync('docker', ['info']),
      checkCommandAsync('whisper', ['--help']),
      checkCommandAsync('gh', ['auth', 'status']),
    ]);

    const status = {
      cloudflared: {
        installed: cloudflaredInstalled,
      },
      claude: {
        installed: claudeInstalled,
        authenticated: checkClaudeAuth(),
      },
      git: {
        installed: gitInstalled,
      },
      docker: {
        installed: dockerInstalled,
        running: dockerRunning,
      },
      whisper: {
        installed: whisperInstalled,
      },
      github: {
        connected: githubConnected,
      },
      repos: {
        count: repoRegistry.getAll().length,
      },
      setup: {
        completed: settingsManager.isSetupCompleted(),
      },
    };

    // Cache the result
    healthStatusCache = {
      data: status,
      timestamp: Date.now(),
    };

    res.json({ success: true, data: status });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Mark setup as completed
apiRouter.post('/setup/complete', (_req: Request, res: Response) => {
  try {
    settingsManager.setSetupCompleted(true);
    res.json({ success: true, data: { completed: true } });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// ============================================
// Repository Endpoints
// ============================================

// Get all repos (with computed hasRemote and workspaceId properties)
apiRouter.get('/repos', (_req: Request, res: Response) => {
  const repos = repoRegistry.getAll();

  // Add hasGit and hasRemote properties to each repo (workspaceId is already on repo from registry)
  const reposWithMetadata = repos.map(repo => {
    const hasGit = existsSync(join(repo.path, '.git'));
    const hasRemote = hasGit ? gitSandbox.hasRemote(repo.path) : false;
    return {
      ...repo,
      hasGit,
      hasRemote,
    };
  });
  res.json({ success: true, data: reposWithMetadata });
});

// Create a new repo
apiRouter.post('/repos', (req: Request, res: Response) => {
  try {
    const repoData = req.body;

    // Validate with schema
    const validated = RepoConfigSchema.parse(repoData);

    // Add to registry
    repoRegistry.add(validated);

    // Track as recent
    settingsManager.addRecentRepo(validated.id);

    res.status(201).json({ success: true, data: validated });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Update an existing repo
apiRouter.put('/repos/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if repo exists
    const existing = repoRegistry.get(id);
    if (!existing) {
      res.status(404).json({ success: false, error: `Repo not found: ${id}` });
      return;
    }

    // Merge updates with existing
    const merged = {
      ...existing,
      ...updates,
      id, // Prevent ID change
    };

    // Validate
    const validated = RepoConfigSchema.parse(merged);

    // Remove old and add updated
    repoRegistry.remove(id);
    repoRegistry.add(validated);

    res.json({ success: true, data: validated });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Delete a repo
apiRouter.delete('/repos/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = repoRegistry.remove(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: `Repo not found: ${id}` });
      return;
    }

    // Remove from favorites
    settingsManager.removeFavoriteRepo(id);

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Detect project type from path
apiRouter.post('/repos/detect', async (req: Request, res: Response) => {
  try {
    const { path } = req.body;

    if (!path || typeof path !== 'string') {
      res.status(400).json({ success: false, error: 'Path is required' });
      return;
    }

    const detection = await detectProject(path);
    res.json({ success: true, data: detection });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Toggle favorite status for a repo
apiRouter.post('/repos/:id/favorite', (req: Request, res: Response) => {
  const { id } = req.params;

  // Check if repo exists
  const repo = repoRegistry.get(id);
  if (!repo) {
    res.status(404).json({ success: false, error: `Repo not found: ${id}` });
    return;
  }

  if (settingsManager.isFavoriteRepo(id)) {
    settingsManager.removeFavoriteRepo(id);
    res.json({ success: true, data: { isFavorite: false } });
  } else {
    settingsManager.addFavoriteRepo(id);
    res.json({ success: true, data: { isFavorite: true } });
  }
});

// Publish a local repo to GitHub (create remote repo and push)
apiRouter.post('/repos/:id/publish', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isPrivate = true } = req.body;

    // Check if repo exists
    const repo = repoRegistry.get(id);
    if (!repo) {
      res.status(404).json({ success: false, error: `Repo not found: ${id}` });
      return;
    }

    // Check if repo already has a remote
    if (gitSandbox.hasRemote(repo.path)) {
      res.status(400).json({ success: false, error: 'Repository already has a remote origin' });
      return;
    }

    // Check if gh CLI is available
    if (!githubIntegration.isAvailable()) {
      res.status(400).json({
        success: false,
        error: 'GitHub CLI (gh) is not installed or not authenticated. Run "gh auth login" to authenticate.',
      });
      return;
    }

    // Create repo on GitHub and push
    const result = await githubIntegration.createRepo(repo.path, id, isPrivate);

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      data: {
        repoUrl: result.prUrl,
        message: `Repository published to GitHub successfully`,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// ============================================
// Scan Path Endpoints
// ============================================

// Add a scan path to discover repos
apiRouter.post('/scan-path', (req: Request, res: Response) => {
  try {
    const { path } = req.body;

    if (!path || typeof path !== 'string') {
      res.status(400).json({ success: false, error: 'Path is required' });
      return;
    }

    const result = repoRegistry.addScanPath(path);
    res.json({ success: true, data: result });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Get current scan paths
apiRouter.get('/scan-paths', (_req: Request, res: Response) => {
  const scanPaths = repoRegistry.getScanPaths();
  res.json({ success: true, data: scanPaths });
});

// Remove a scan path
apiRouter.delete('/scan-path', (req: Request, res: Response) => {
  try {
    const { path } = req.body;

    if (!path || typeof path !== 'string') {
      res.status(400).json({ success: false, error: 'Path is required' });
      return;
    }

    const removed = repoRegistry.removeScanPath(path);
    res.json({ success: true, data: { removed } });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// ============================================
// Mount Sub-routers
// ============================================

// Mount settings router
apiRouter.use('/settings', settingsRouter);

// Mount workspaces router for workspace management and GitHub OAuth
apiRouter.use('/workspaces', workspaceRouter);

// Mount docker router for shared Docker environment management
apiRouter.use('/docker', dockerRouter);

// Mount skills router for skill management and execution
apiRouter.use('/skills', skillRouter);

// Mount agents router for Claude Code agents
apiRouter.use('/agents', agentRouter);

// Mount tunnel router for remote access
apiRouter.use('/tunnel', tunnelRouter);

// Mount MCP router for Model Context Protocol integration
apiRouter.use('/mcp', mcpRouter);
