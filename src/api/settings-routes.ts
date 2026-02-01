import { Router, Request, Response } from 'express';
import { existsSync, statSync, readdirSync } from 'fs';
import { join, dirname, basename, sep } from 'path';
import { homedir } from 'os';
import { settingsManager, SettingsSchema } from '../config/settings.js';
import { workspaceManager } from '../config/workspaces.js';
import { GitHubDeviceAuth } from '../core/github-oauth.js';
import { GitLabDeviceAuth } from '../core/gitlab-oauth.js';
import { encrypt, decrypt, isEncryptedDataEmpty } from '../utils/encryption.js';
import { getClaudeOAuthToken } from '../core/claude-usage-query.js';
import net from 'net';

export const settingsRouter = Router();

// Get all settings
settingsRouter.get('/', (_req: Request, res: Response) => {
  const settings = settingsManager.get();
  res.json({ success: true, data: settings });
});

// Update settings (partial update)
settingsRouter.put('/', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const settings = settingsManager.update(updates);
    res.json({ success: true, data: settings });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Get general settings
settingsRouter.get('/general', (_req: Request, res: Response) => {
  const general = settingsManager.getGeneral();
  res.json({ success: true, data: general });
});

// Update general settings
settingsRouter.put('/general', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const general = settingsManager.updateGeneral(updates);
    res.json({ success: true, data: general });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Get Claude settings (SEC-04: Permission modes)
settingsRouter.get('/claude', (_req: Request, res: Response) => {
  const claude = settingsManager.getClaude();
  res.json({ success: true, data: claude });
});

// Update Claude settings (SEC-04: Permission modes)
settingsRouter.put('/claude', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const claude = settingsManager.updateClaude(updates);
    res.json({ success: true, data: claude });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Get voice settings
settingsRouter.get('/voice', (_req: Request, res: Response) => {
  const voice = settingsManager.getVoice();
  res.json({ success: true, data: voice });
});

// Update voice settings
settingsRouter.put('/voice', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const voice = settingsManager.updateVoice(updates);
    res.json({ success: true, data: voice });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Get notification settings
settingsRouter.get('/notifications', (_req: Request, res: Response) => {
  const notifications = settingsManager.getNotifications();
  res.json({ success: true, data: notifications });
});

// Update notification settings
settingsRouter.put('/notifications', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const notifications = settingsManager.updateNotifications(updates);
    res.json({ success: true, data: notifications });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Get GitHub settings
settingsRouter.get('/github', (_req: Request, res: Response) => {
  const github = settingsManager.getGitHub();
  res.json({ success: true, data: github });
});

// Update GitHub settings
settingsRouter.put('/github', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const github = settingsManager.updateGitHub(updates);
    res.json({ success: true, data: github });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Get GitLab settings
settingsRouter.get('/gitlab', (_req: Request, res: Response) => {
  const gitlab = settingsManager.getGitLab();
  res.json({ success: true, data: gitlab });
});

// Update GitLab settings
settingsRouter.put('/gitlab', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const gitlab = settingsManager.updateGitLab(updates);
    res.json({ success: true, data: gitlab });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Get Agents settings
settingsRouter.get('/agents', (_req: Request, res: Response) => {
  const agents = settingsManager.getAgents();
  res.json({ success: true, data: agents });
});

// Update Agents settings
settingsRouter.put('/agents', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const agents = settingsManager.updateAgents(updates);
    res.json({ success: true, data: agents });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Get favorites
settingsRouter.get('/favorites', (_req: Request, res: Response) => {
  const favorites = settingsManager.getFavorites();
  res.json({ success: true, data: favorites });
});

// Add favorite repo
settingsRouter.post('/favorites/repos/:repoId', (req: Request, res: Response) => {
  const { repoId } = req.params;
  settingsManager.addFavoriteRepo(repoId);
  res.json({ success: true, data: settingsManager.getFavorites() });
});

// Remove favorite repo
settingsRouter.delete('/favorites/repos/:repoId', (req: Request, res: Response) => {
  const { repoId } = req.params;
  settingsManager.removeFavoriteRepo(repoId);
  res.json({ success: true, data: settingsManager.getFavorites() });
});

// Track recent repo usage
settingsRouter.post('/favorites/recent/:repoId', (req: Request, res: Response) => {
  const { repoId } = req.params;
  settingsManager.addRecentRepo(repoId);
  res.json({ success: true, data: settingsManager.getFavorites() });
});

// Get context settings
settingsRouter.get('/context', (_req: Request, res: Response) => {
  const context = settingsManager.getContext();
  res.json({ success: true, data: context });
});

// Update context settings
settingsRouter.put('/context', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const context = settingsManager.updateContext(updates);
    res.json({ success: true, data: context });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Reset settings to defaults
settingsRouter.post('/reset', (_req: Request, res: Response) => {
  const settings = settingsManager.reset();
  res.json({ success: true, data: settings });
});

// Get pinned agents
settingsRouter.get('/agents', (_req: Request, res: Response) => {
  const agents = settingsManager.getAgents();
  res.json({ success: true, data: agents });
});

// Update pinned agents
settingsRouter.put('/agents', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const agents = settingsManager.updateAgents(updates);
    res.json({ success: true, data: agents });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// ============================================
// Path Validation
// ============================================

/**
 * POST /validate-path
 * Validates if a path exists, is a directory, and is not already used by a workspace
 */
settingsRouter.post('/validate-path', (req: Request, res: Response) => {
  try {
    const { path, excludeWorkspaceId } = req.body;

    if (!path || typeof path !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Path is required',
      });
    }

    // Check if path exists
    if (!existsSync(path)) {
      return res.json({
        success: true,
        data: {
          valid: false,
          error: 'Path does not exist',
        },
      });
    }

    // Check if path is a directory
    try {
      const stat = statSync(path);
      if (!stat.isDirectory()) {
        return res.json({
          success: true,
          data: {
            valid: false,
            error: 'Path is not a directory',
          },
        });
      }
    } catch {
      return res.json({
        success: true,
        data: {
          valid: false,
          error: 'Cannot access path',
        },
      });
    }

    // Check if path is already used by another workspace
    const workspaces = workspaceManager.getAll();
    const duplicate = workspaces.find(
      (ws) => ws.scanPath === path && ws.id !== excludeWorkspaceId
    );

    if (duplicate) {
      return res.json({
        success: true,
        data: {
          valid: false,
          error: `Path is already used by workspace "${duplicate.name}"`,
        },
      });
    }

    res.json({
      success: true,
      data: {
        valid: true,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// ============================================
// OAuth Connection Testing
// ============================================

/**
 * POST /github/test
 * Tests GitHub OAuth connection by verifying the stored token
 */
settingsRouter.post('/github/test', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        error: 'Workspace ID is required',
      });
    }

    const workspace = workspaceManager.get(workspaceId);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Get the decrypted token
    const githubToken = workspaceManager.getGitHubToken(workspaceId);

    if (!githubToken) {
      return res.json({
        success: true,
        data: {
          connected: false,
          error: 'No GitHub connection configured',
        },
      });
    }

    // Verify the token by making an API call
    const settings = settingsManager.get();
    if (!settings.github?.clientId) {
      return res.json({
        success: true,
        data: {
          connected: false,
          error: 'GitHub OAuth not configured in settings',
        },
      });
    }

    const auth = new GitHubDeviceAuth(settings.github.clientId);
    const isValid = await auth.verifyToken(githubToken);

    const githubCredentials = workspaceManager.getGitHubCredentials(workspaceId);

    if (isValid) {
      res.json({
        success: true,
        data: {
          connected: true,
          username: githubCredentials?.username || 'Unknown',
        },
      });
    } else {
      res.json({
        success: true,
        data: {
          connected: false,
          error: 'Token is invalid or expired',
        },
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

/**
 * POST /gitlab/test
 * Tests GitLab OAuth connection by verifying the stored token
 */
settingsRouter.post('/gitlab/test', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        error: 'Workspace ID is required',
      });
    }

    const workspace = workspaceManager.get(workspaceId);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Get the decrypted token
    const gitlabTokenData = workspaceManager.getGitLabToken(workspaceId);

    if (!gitlabTokenData) {
      return res.json({
        success: true,
        data: {
          connected: false,
          error: 'No GitLab connection configured',
        },
      });
    }

    // Verify the token by making an API call
    const settings = settingsManager.get();
    if (!settings.gitlab?.clientId) {
      return res.json({
        success: true,
        data: {
          connected: false,
          error: 'GitLab OAuth not configured in settings',
        },
      });
    }

    const auth = new GitLabDeviceAuth(settings.gitlab.clientId);
    const isValid = await auth.verifyToken(gitlabTokenData.accessToken);

    const gitlabCredentials = workspaceManager.getGitLabCredentials(workspaceId);

    if (isValid) {
      res.json({
        success: true,
        data: {
          connected: true,
          username: gitlabCredentials?.username || 'Unknown',
        },
      });
    } else {
      res.json({
        success: true,
        data: {
          connected: false,
          error: 'Token is invalid or expired',
        },
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// ============================================
// Port Conflict Detection
// ============================================

/**
 * Helper to check if a port is in use
 */
function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * GET /check-port
 * Checks if a port is in use (for port conflict detection)
 */
settingsRouter.get('/check-port', async (req: Request, res: Response) => {
  try {
    const port = parseInt(req.query.port as string, 10);

    if (isNaN(port) || port < 1 || port > 65535) {
      return res.status(400).json({
        success: false,
        error: 'Valid port number (1-65535) is required',
      });
    }

    const inUse = await checkPortInUse(port);

    res.json({
      success: true,
      data: {
        port,
        inUse,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// ============================================
// Directory Browsing
// ============================================

interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

/**
 * GET /browse-directories
 * Returns a list of directories at the specified path for web-based folder browsing
 */
settingsRouter.get('/browse-directories', (req: Request, res: Response) => {
  try {
    const requestedPath = req.query.path as string;

    // If no path specified, return common starting points based on OS
    if (!requestedPath) {
      const isWindows = process.platform === 'win32';
      const startingPoints: DirectoryEntry[] = [];

      if (isWindows) {
        // On Windows, dynamically detect available drive letters
        const driveLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        for (const letter of driveLetters) {
          const drivePath = `${letter}:${sep}`;
          try {
            if (existsSync(drivePath)) {
              startingPoints.push({
                name: `${letter}:`,
                path: drivePath,
                isDirectory: true,
              });
            }
          } catch {
            // Skip inaccessible drives
            continue;
          }
        }
      } else {
        // On Unix-like systems, start from root and home
        startingPoints.push(
          {
            name: 'Home',
            path: homedir(),
            isDirectory: true,
          },
          {
            name: 'Root',
            path: '/',
            isDirectory: true,
          }
        );
      }

      return res.json({
        success: true,
        data: {
          currentPath: null,
          parentPath: null,
          entries: startingPoints,
        },
      });
    }

    // Validate and normalize the path
    if (!existsSync(requestedPath)) {
      return res.status(400).json({
        success: false,
        error: 'Path does not exist',
      });
    }

    const stat = statSync(requestedPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({
        success: false,
        error: 'Path is not a directory',
      });
    }

    // Read directory contents
    const entries: DirectoryEntry[] = [];
    try {
      const items = readdirSync(requestedPath);

      for (const item of items) {
        try {
          const fullPath = join(requestedPath, item);
          const itemStat = statSync(fullPath);

          // Only include directories
          if (itemStat.isDirectory()) {
            entries.push({
              name: item,
              path: fullPath,
              isDirectory: true,
            });
          }
        } catch (err) {
          // Skip items we can't access (permission errors, etc.)
          continue;
        }
      }
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: 'Cannot read directory contents',
      });
    }

    // Sort directories alphabetically
    entries.sort((a, b) => a.name.localeCompare(b.name));

    // Get parent directory path
    const parentPath = dirname(requestedPath);
    const hasParent = parentPath !== requestedPath;

    res.json({
      success: true,
      data: {
        currentPath: requestedPath,
        parentPath: hasParent ? parentPath : null,
        entries,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// ============================================
// Claude Token Management
// ============================================

/**
 * GET /claude/token/status
 * Returns current token configuration status
 *
 * Uses getClaudeOAuthToken to check if a token can be found
 * (manual or auto-detected from credential files).
 */
settingsRouter.get('/claude/token/status', async (_req: Request, res: Response) => {
  try {
    const claudeTokenSettings = settingsManager.getClaudeToken();
    const hasManualToken = !isEncryptedDataEmpty(claudeTokenSettings);

    // Determine source
    let source: 'auto' | 'manual' | 'none' = 'none';
    let tokenPreview: string | null = null;

    if (hasManualToken) {
      source = 'manual';
      try {
        const decryptedToken = decrypt({
          encryptedText: claudeTokenSettings.encryptedToken,
          iv: claudeTokenSettings.iv,
          tag: claudeTokenSettings.tag,
        });
        if (decryptedToken && decryptedToken.length > 12) {
          tokenPreview = `${decryptedToken.substring(0, 8)}...${decryptedToken.substring(decryptedToken.length - 4)}`;
        }
      } catch (error) {
        console.error('[settings-routes] Error decrypting manual token:', error);
        // Manual token exists but failed to decrypt - mark as none
        source = 'none';
      }
    } else {
      // No manual token - check if auto-detection can find a token
      const autoToken = await getClaudeOAuthToken();
      if (autoToken) {
        source = 'auto';
        tokenPreview = '(auto-detected)';
      }
    }

    res.json({
      success: true,
      data: {
        source,
        isValid: source !== 'none',
        lastValidated: claudeTokenSettings.lastValidated || null,
        tokenPreview,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

/**
 * POST /claude/token/validate
 * Validates a token by making a test API call
 */
settingsRouter.post('/claude/token/validate', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Token is required',
      });
    }

    // Make a test API call to validate the token
    try {
      const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        res.json({
          success: true,
          data: {
            valid: true,
          },
        });
      } else if (response.status === 401) {
        res.json({
          success: true,
          data: {
            valid: false,
            error: 'invalid_token',
            message: 'Token is invalid or expired',
          },
        });
      } else if (response.status === 403) {
        res.json({
          success: true,
          data: {
            valid: false,
            error: 'expired',
            message: 'Token has expired',
          },
        });
      } else {
        res.json({
          success: true,
          data: {
            valid: false,
            error: 'network_error',
            message: `API returned status ${response.status}`,
          },
        });
      }
    } catch (fetchError) {
      res.json({
        success: true,
        data: {
          valid: false,
          error: 'network_error',
          message: 'Failed to connect to Anthropic API',
        },
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

/**
 * PUT /claude/token
 * Saves a manually configured token (encrypted)
 */
settingsRouter.put('/claude/token', (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Token is required',
      });
    }

    // Encrypt the token
    const encrypted = encrypt(token);

    // Save to settings
    const now = new Date().toISOString();
    settingsManager.updateClaudeToken({
      encryptedToken: encrypted.encryptedText,
      iv: encrypted.iv,
      tag: encrypted.tag,
      savedAt: now,
      lastValidated: now,
    });

    // Create token preview
    const tokenPreview = token.length > 12
      ? `${token.substring(0, 8)}...${token.substring(token.length - 4)}`
      : '***';

    res.json({
      success: true,
      data: {
        saved: true,
        source: 'manual',
        tokenPreview,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

/**
 * DELETE /claude/token
 * Removes the manually configured token
 */
settingsRouter.delete('/claude/token', async (_req: Request, res: Response) => {
  try {
    // Clear the manual token
    settingsManager.updateClaudeToken({
      encryptedToken: '',
      iv: '',
      tag: '',
      savedAt: undefined,
      lastValidated: undefined,
    });

    // Determine new source after deletion
    const autoToken = await getClaudeOAuthToken();
    const newSource = autoToken ? 'auto' : 'none';

    res.json({
      success: true,
      data: {
        deleted: true,
        source: newSource,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});
