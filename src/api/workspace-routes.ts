import { Router, Request, Response } from 'express';
import { workspaceManager } from '../config/workspaces.js';
import { GitHubDeviceAuth } from '../core/github-oauth.js';
import { GitLabDeviceAuth } from '../core/gitlab-oauth.js';
import { settingsManager } from '../config/settings.js';
import { repoRegistry } from '../config/repos.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import https from 'https';

const router = Router();

// Store active device flow instances (workspaceId -> auth instance)
const activeDeviceFlows = new Map<string, {
  auth: GitHubDeviceAuth;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
}>();

// Store active GitLab device flow instances (workspaceId -> auth instance)
const activeGitLabDeviceFlows = new Map<string, {
  auth: GitLabDeviceAuth;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
}>();

// ============================================
// Workspace CRUD
// ============================================

/**
 * GET /workspaces
 * List all workspaces
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const workspaces = workspaceManager.getAll();

    // Return workspaces with GitHub/GitLab connection status (but not the token)
    const result = workspaces.map(ws => ({
      id: ws.id,
      name: ws.name,
      scanPath: ws.scanPath,
      github: ws.github ? {
        username: ws.github.username,
        tokenScope: ws.github.tokenScope,
        connected: true,
      } : null,
      gitlab: ws.gitlab ? {
        username: ws.gitlab.username,
        tokenScope: ws.gitlab.tokenScope,
        connected: true,
      } : null,
      repoConfigs: ws.repoConfigs || {},
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt,
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Failed to list workspaces:', error);
    res.status(500).json({ success: false, error: 'Failed to list workspaces' });
  }
});

/**
 * GET /workspaces/:id
 * Get a single workspace
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const workspace = workspaceManager.get(req.params.id);

    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    res.json({
      success: true,
      data: {
        id: workspace.id,
        name: workspace.name,
        scanPath: workspace.scanPath,
        github: workspace.github ? {
          username: workspace.github.username,
          tokenScope: workspace.github.tokenScope,
          connected: true,
        } : null,
        gitlab: workspace.gitlab ? {
          username: workspace.gitlab.username,
          tokenScope: workspace.gitlab.tokenScope,
          connected: true,
        } : null,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      }
    });
  } catch (error) {
    console.error('Failed to get workspace:', error);
    res.status(500).json({ success: false, error: 'Failed to get workspace' });
  }
});

/**
 * POST /workspaces
 * Create a new workspace
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, scanPath } = req.body;

    if (!name || !scanPath) {
      return res.status(400).json({ success: false, error: 'Name and scanPath are required' });
    }

    const workspace = workspaceManager.create(name, scanPath);

    // Reload repos to pick up the new workspace's scanPath
    repoRegistry.reload();

    res.status(201).json({
      success: true,
      data: {
        id: workspace.id,
        name: workspace.name,
        scanPath: workspace.scanPath,
        github: null,
        gitlab: null,
        createdAt: workspace.createdAt,
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create workspace';
    console.error('Failed to create workspace:', error);
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * PUT /workspaces/:id
 * Update a workspace
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, scanPath } = req.body;
    const updates: { name?: string; scanPath?: string } = {};

    if (name !== undefined) updates.name = name;
    if (scanPath !== undefined) updates.scanPath = scanPath;

    const workspace = workspaceManager.update(req.params.id, updates);

    // Reload repos if scanPath changed
    if (scanPath !== undefined) {
      repoRegistry.reload();
    }

    res.json({
      success: true,
      data: {
        id: workspace.id,
        name: workspace.name,
        scanPath: workspace.scanPath,
        github: workspace.github ? {
          username: workspace.github.username,
          tokenScope: workspace.github.tokenScope,
          connected: true,
        } : null,
        gitlab: workspace.gitlab ? {
          username: workspace.gitlab.username,
          tokenScope: workspace.gitlab.tokenScope,
          connected: true,
        } : null,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update workspace';
    console.error('Failed to update workspace:', error);
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * DELETE /workspaces/:id
 * Delete a workspace
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = workspaceManager.delete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    // Clean up any active device flow for this workspace
    activeDeviceFlows.delete(req.params.id);
    activeGitLabDeviceFlows.delete(req.params.id);

    // Reload repos to remove workspace associations
    repoRegistry.reload();

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('Failed to delete workspace:', error);
    res.status(500).json({ success: false, error: 'Failed to delete workspace' });
  }
});

// ============================================
// GitHub OAuth (Device Flow)
// ============================================

/**
 * POST /workspaces/:id/github/connect
 * Start GitHub device flow for a workspace
 * Returns user_code and verification_uri for user to authorize
 */
router.post('/:id/github/connect', async (req: Request, res: Response) => {
  try {
    const workspace = workspaceManager.get(req.params.id);

    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    // Check if GitLab is already connected
    if (workspace.gitlab) {
      return res.status(400).json({
        success: false,
        error: 'GitLab is already connected. Disconnect GitLab first to connect GitHub.',
      });
    }

    // Get GitHub client ID from settings
    const settings = settingsManager.get();
    const clientId = settings.github?.clientId;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'GitHub OAuth not configured. Set github.clientId in settings.',
      });
    }

    // Create new device flow instance
    const auth = new GitHubDeviceAuth(clientId);
    const deviceCodeResponse = await auth.requestDeviceCode('repo read:user');

    // Store the active flow
    activeDeviceFlows.set(req.params.id, {
      auth,
      deviceCode: deviceCodeResponse.deviceCode,
      userCode: deviceCodeResponse.userCode,
      verificationUri: deviceCodeResponse.verificationUri,
      expiresAt: Date.now() + (deviceCodeResponse.expiresIn * 1000),
    });

    res.json({
      success: true,
      data: {
        userCode: deviceCodeResponse.userCode,
        verificationUri: deviceCodeResponse.verificationUri,
        expiresIn: deviceCodeResponse.expiresIn,
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start GitHub auth';
    console.error('Failed to start GitHub auth:', error);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /workspaces/:id/github/status
 * Poll for GitHub OAuth completion
 * Returns status: 'pending' | 'success' | 'expired' | 'error'
 */
router.get('/:id/github/status', async (req: Request, res: Response) => {
  try {
    const flow = activeDeviceFlows.get(req.params.id);

    if (!flow) {
      console.log(`[GitHub Auth] No active flow found for workspace ${req.params.id}`);
      console.log(`[GitHub Auth] Active flows:`, Array.from(activeDeviceFlows.keys()));
      return res.status(404).json({
        success: false,
        error: 'No active authentication flow for this workspace',
      });
    }

    console.log(`[GitHub Auth] Polling for workspace ${req.params.id}, device code: ${flow.deviceCode.substring(0, 8)}...`);

    // Check if expired
    if (Date.now() > flow.expiresAt) {
      activeDeviceFlows.delete(req.params.id);
      return res.json({ success: true, data: { status: 'expired', error: 'Device code has expired' } });
    }

    // Poll for token
    const result = await flow.auth.pollForToken(flow.deviceCode);
    console.log(`[GitHub Auth] Poll result:`, result.status, result.error || 'no error');

    if (result.status === 'success' && result.token) {
      console.log(`[GitHub Auth] Success! Got access token for user`);
      // Get user info
      const user = await flow.auth.getUser(result.token.accessToken);

      // Save to workspace
      workspaceManager.setGitHubToken(
        req.params.id,
        result.token.accessToken,
        user.login,
        result.token.scope
      );

      // Clean up
      activeDeviceFlows.delete(req.params.id);

      res.json({
        success: true,
        data: {
          status: 'success',
          user: {
            username: user.login,
            name: user.name,
            avatarUrl: user.avatarUrl,
          },
        }
      });
    } else if (result.status === 'pending') {
      res.json({ success: true, data: { status: 'pending' } });
    } else if (result.status === 'expired') {
      activeDeviceFlows.delete(req.params.id);
      res.json({ success: true, data: { status: 'expired', error: result.error } });
    } else {
      res.json({ success: true, data: { status: 'error', error: result.error } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check auth status';
    console.error('Failed to check auth status:', error);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * DELETE /workspaces/:id/github/disconnect
 * Remove GitHub connection from a workspace
 */
router.delete('/:id/github/disconnect', (req: Request, res: Response) => {
  try {
    const workspace = workspaceManager.get(req.params.id);

    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    workspaceManager.clearGitHubToken(req.params.id);

    // Clean up any active device flow
    activeDeviceFlows.delete(req.params.id);

    res.json({ success: true, data: { disconnected: true } });
  } catch (error) {
    console.error('Failed to disconnect GitHub:', error);
    res.status(500).json({ success: false, error: 'Failed to disconnect GitHub' });
  }
});

// ============================================
// GitLab OAuth (Device Flow)
// ============================================

/**
 * POST /workspaces/:id/gitlab/connect
 * Start GitLab device flow for a workspace
 * Returns user_code and verification_uri for user to authorize
 */
router.post('/:id/gitlab/connect', async (req: Request, res: Response) => {
  try {
    const workspace = workspaceManager.get(req.params.id);

    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    // Check if GitHub is already connected
    if (workspace.github) {
      return res.status(400).json({
        success: false,
        error: 'GitHub is already connected. Disconnect GitHub first to connect GitLab.',
      });
    }

    // Get GitLab client ID from settings
    const settings = settingsManager.get();
    const clientId = settings.gitlab?.clientId;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'GitLab OAuth not configured. Set gitlab.clientId in settings.',
      });
    }

    // Create new device flow instance
    const auth = new GitLabDeviceAuth(clientId);
    const deviceCodeResponse = await auth.requestDeviceCode('api read_user');

    // Store the active flow
    activeGitLabDeviceFlows.set(req.params.id, {
      auth,
      deviceCode: deviceCodeResponse.deviceCode,
      userCode: deviceCodeResponse.userCode,
      verificationUri: deviceCodeResponse.verificationUri,
      expiresAt: Date.now() + (deviceCodeResponse.expiresIn * 1000),
    });

    res.json({
      success: true,
      data: {
        userCode: deviceCodeResponse.userCode,
        verificationUri: deviceCodeResponse.verificationUri,
        expiresIn: deviceCodeResponse.expiresIn,
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start GitLab auth';
    console.error('Failed to start GitLab auth:', error);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /workspaces/:id/gitlab/status
 * Poll for GitLab OAuth completion
 * Returns status: 'pending' | 'success' | 'expired' | 'error'
 */
router.get('/:id/gitlab/status', async (req: Request, res: Response) => {
  try {
    const flow = activeGitLabDeviceFlows.get(req.params.id);

    if (!flow) {
      return res.status(404).json({
        success: false,
        error: 'No active authentication flow for this workspace',
      });
    }

    // Check if expired
    if (Date.now() > flow.expiresAt) {
      activeGitLabDeviceFlows.delete(req.params.id);
      return res.json({ success: true, data: { status: 'expired', error: 'Device code has expired' } });
    }

    // Poll for token
    const result = await flow.auth.pollForToken(flow.deviceCode);

    if (result.status === 'success' && result.token) {
      // Get user info
      const user = await flow.auth.getUser(result.token.accessToken);

      // Calculate expiration if provided
      let expiresAt: string | null = null;
      if (result.token.expiresIn) {
        expiresAt = new Date(Date.now() + result.token.expiresIn * 1000).toISOString();
      }

      // Save to workspace
      workspaceManager.setGitLabToken(
        req.params.id,
        result.token.accessToken,
        user.username,
        result.token.scope,
        result.token.refreshToken,
        expiresAt
      );

      // Clean up
      activeGitLabDeviceFlows.delete(req.params.id);

      res.json({
        success: true,
        data: {
          status: 'success',
          user: {
            username: user.username,
            name: user.name,
            avatarUrl: user.avatarUrl,
          },
        }
      });
    } else if (result.status === 'pending') {
      res.json({ success: true, data: { status: 'pending' } });
    } else if (result.status === 'expired') {
      activeGitLabDeviceFlows.delete(req.params.id);
      res.json({ success: true, data: { status: 'expired', error: result.error } });
    } else {
      res.json({ success: true, data: { status: 'error', error: result.error } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check auth status';
    console.error('Failed to check auth status:', error);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * DELETE /workspaces/:id/gitlab/disconnect
 * Remove GitLab connection from a workspace
 */
router.delete('/:id/gitlab/disconnect', (req: Request, res: Response) => {
  try {
    const workspace = workspaceManager.get(req.params.id);

    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    workspaceManager.clearGitLabToken(req.params.id);

    // Clean up any active device flow
    activeGitLabDeviceFlows.delete(req.params.id);

    res.json({ success: true, data: { disconnected: true } });
  } catch (error) {
    console.error('Failed to disconnect GitLab:', error);
    res.status(500).json({ success: false, error: 'Failed to disconnect GitLab' });
  }
});

// ============================================
// Simple Repo Creation
// ============================================

/**
 * POST /workspaces/:id/repos
 * Create a new empty repository folder in workspace
 */
router.post('/:id/repos', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { repoName } = req.body;

    // Validate repo name
    if (!repoName || typeof repoName !== 'string') {
      return res.status(400).json({ success: false, error: 'Repository name is required' });
    }

    // Validate format: lowercase alphanumeric + dashes
    const validName = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
    if (!validName.test(repoName)) {
      return res.status(400).json({
        success: false,
        error: 'Repository name must be lowercase alphanumeric with dashes, and cannot start/end with a dash'
      });
    }

    // Get workspace
    const workspace = workspaceManager.get(id);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    // Create folder path
    const repoPath = path.join(workspace.scanPath, repoName);

    // Check if folder already exists
    if (fs.existsSync(repoPath)) {
      return res.status(409).json({ success: false, error: 'A folder with this name already exists' });
    }

    // Create folder
    fs.mkdirSync(repoPath, { recursive: true });

    // Initialize git
    try {
      execSync('git init', { cwd: repoPath, stdio: 'pipe' });
    } catch {
      // Git init failed, but folder was created - continue
      console.warn(`Git init failed for ${repoPath}, continuing without git`);
    }

    // Create a basic package.json
    const packageJson = {
      name: repoName,
      version: '0.1.0',
      private: true,
      description: '',
      scripts: {},
    };
    fs.writeFileSync(
      path.join(repoPath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Reload repo registry to pick up new folder
    repoRegistry.reload();

    // Find the new repo in registry
    const repos = repoRegistry.getAll();
    const newRepo = repos.find(r => r.path === repoPath);

    res.status(201).json({
      success: true,
      data: {
        repoId: newRepo?.id || repoName,
        path: repoPath,
        name: repoName,
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create repository';
    console.error('Failed to create repository:', error);
    res.status(500).json({ success: false, error: message });
  }
});

// ============================================
// Repo Config Overrides
// ============================================

/**
 * GET /workspaces/:id/repos/:repoId/config
 * Get repo config override for a workspace
 */
router.get('/:id/repos/:repoId/config', (req: Request, res: Response) => {
  try {
    const config = workspaceManager.getRepoConfig(req.params.id, req.params.repoId);
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Failed to get repo config:', error);
    res.status(500).json({ success: false, error: 'Failed to get repo config' });
  }
});

/**
 * PUT /workspaces/:id/repos/:repoId/config
 * Set repo config override for a workspace
 */
router.put('/:id/repos/:repoId/config', (req: Request, res: Response) => {
  try {
    const { proof, port, commands } = req.body;
    workspaceManager.setRepoConfig(req.params.id, req.params.repoId, { proof, port, commands });
    repoRegistry.reload(); // Apply changes immediately
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save repo config';
    console.error('Failed to save repo config:', error);
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * DELETE /workspaces/:id/repos/:repoId/config
 * Delete repo config override for a workspace
 */
router.delete('/:id/repos/:repoId/config', (req: Request, res: Response) => {
  try {
    const deleted = workspaceManager.deleteRepoConfig(req.params.id, req.params.repoId);
    if (deleted) {
      repoRegistry.reload(); // Apply changes immediately
    }
    res.json({ success: true, data: { deleted } });
  } catch (error) {
    console.error('Failed to delete repo config:', error);
    res.status(500).json({ success: false, error: 'Failed to delete repo config' });
  }
});

// ============================================
// Service Config Overrides (Monorepo)
// ============================================

/**
 * GET /workspaces/:id/repos/:repoId/services/:serviceId/config
 * Get service config override for a workspace repo
 */
router.get('/:id/repos/:repoId/services/:serviceId/config', (req: Request, res: Response) => {
  try {
    const config = workspaceManager.getServiceConfig(req.params.id, req.params.repoId, req.params.serviceId);
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Failed to get service config:', error);
    res.status(500).json({ success: false, error: 'Failed to get service config' });
  }
});

/**
 * PUT /workspaces/:id/repos/:repoId/services/:serviceId/config
 * Set service config override for a workspace repo
 */
router.put('/:id/repos/:repoId/services/:serviceId/config', (req: Request, res: Response) => {
  try {
    const { proof, port } = req.body;
    workspaceManager.setServiceConfig(req.params.id, req.params.repoId, req.params.serviceId, { proof, port });
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save service config';
    console.error('Failed to save service config:', error);
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * DELETE /workspaces/:id/repos/:repoId/services/:serviceId/config
 * Delete service config override for a workspace repo
 */
router.delete('/:id/repos/:repoId/services/:serviceId/config', (req: Request, res: Response) => {
  try {
    const deleted = workspaceManager.deleteServiceConfig(req.params.id, req.params.repoId, req.params.serviceId);
    res.json({ success: true, data: { deleted } });
  } catch (error) {
    console.error('Failed to delete service config:', error);
    res.status(500).json({ success: false, error: 'Failed to delete service config' });
  }
});

// ============================================
// Migration
// ============================================

/**
 * POST /workspaces/migrate
 * Migrate existing scan paths to workspaces
 */
router.post('/migrate', (_req: Request, res: Response) => {
  try {
    const scanPaths = repoRegistry.getScanPaths();
    const result = workspaceManager.migrateFromScanPaths(scanPaths);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration failed';
    console.error('Migration failed:', error);
    res.status(500).json({ success: false, error: message });
  }
});

// ============================================
// GitHub Personal Access Token (PAT) Routes
// ============================================

/**
 * POST /workspaces/:workspaceId/github-pat/test
 * Validate a GitHub Personal Access Token
 */
router.post('/:workspaceId/github-pat/test', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Token is required',
      });
    }

    // Validate token format
    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token format. GitHub tokens start with "ghp_" or "github_pat_"',
      });
    }

    // Verify workspace exists
    const workspace = workspaceManager.get(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Test token by calling GitHub API
    const options = {
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'ClaudeDesk-App',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };

    const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, body }));
      });
      req.on('error', reject);
      req.end();
    });

    if (response.statusCode === 200) {
      const userData = JSON.parse(response.body);

      return res.json({
        success: true,
        username: userData.login,
        scopes: ['repo'], // Simplified - assume repo scope
        expiration: null, // GitHub doesn't provide expiration via API
        avatarUrl: userData.avatar_url,
        profileUrl: userData.html_url,
      });
    } else if (response.statusCode === 401) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token. The token may be expired or revoked.',
      });
    } else if (response.statusCode === 403) {
      return res.status(403).json({
        success: false,
        error: 'Token lacks required permissions or rate limit exceeded.',
      });
    } else {
      return res.status(500).json({
        success: false,
        error: `GitHub API error: ${response.statusCode}`,
      });
    }
  } catch (error) {
    console.error('[GitHubPAT] Token validation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to validate token',
    });
  }
});

/**
 * POST /workspaces/:workspaceId/github-pat
 * Save a GitHub Personal Access Token for a workspace
 */
router.post('/:workspaceId/github-pat', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { token, username, scopes, expiresAt } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Token is required',
      });
    }

    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Username is required',
      });
    }

    if (!Array.isArray(scopes)) {
      return res.status(400).json({
        success: false,
        error: 'Scopes must be an array',
      });
    }

    // Verify workspace exists
    const workspace = workspaceManager.get(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Save encrypted PAT
    await workspaceManager.setGitHubPAT(
      workspaceId,
      token,
      username,
      scopes,
      expiresAt || null
    );

    console.log(`[GitHubPAT] Token saved for workspace ${workspaceId}, user ${username}`);

    return res.json({
      success: true,
      message: 'Token saved successfully',
    });
  } catch (error) {
    console.error('[GitHubPAT] Token save error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to save token',
    });
  }
});

/**
 * GET /workspaces/:workspaceId/github-pat/status
 * Get GitHub PAT status (metadata without decrypted token)
 */
router.get('/:workspaceId/github-pat/status', (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;

    // Verify workspace exists
    const workspace = workspaceManager.get(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Get PAT metadata
    const metadata = workspaceManager.getGitHubPATMetadata(workspaceId);

    if (!metadata) {
      return res.json({
        success: true,
        configured: false,
      });
    }

    // Get expiration status
    const expirationStatus = workspaceManager.getGitHubPATExpirationStatus(workspaceId);

    return res.json({
      success: true,
      configured: true,
      username: metadata.username,
      scopes: metadata.scopes,
      expiresAt: metadata.expiresAt,
      createdAt: metadata.createdAt,
      expired: expirationStatus.expired,
      daysUntilExpiration: expirationStatus.daysUntilExpiration,
    });
  } catch (error) {
    console.error('[GitHubPAT] Status check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get token status',
    });
  }
});

/**
 * DELETE /workspaces/:workspaceId/github-pat
 * Delete GitHub Personal Access Token for a workspace
 */
router.delete('/:workspaceId/github-pat', (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;

    // Verify workspace exists
    const workspace = workspaceManager.get(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Delete PAT
    workspaceManager.clearGitHubPAT(workspaceId);

    console.log(`[GitHubPAT] Token deleted for workspace ${workspaceId}`);

    return res.json({
      success: true,
      message: 'Token deleted successfully',
    });
  } catch (error) {
    console.error('[GitHubPAT] Token deletion error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete token',
    });
  }
});

export default router;
