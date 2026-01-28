import { Router, Request, Response } from 'express';
import { execSync, ExecSyncOptions } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, rmSync, mkdirSync, renameSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { terminalSessionManager, TerminalSession, SearchResult, WorktreeSessionOptions } from '../core/terminal-session.js';
import { repoRegistry } from '../config/repos.js';
import { gitSandbox } from '../core/git-sandbox.js';
import { workspaceManager } from '../config/workspaces.js';
import { getGitCredentialEnv, cleanupGitCredentialEnv } from '../core/git-credential-helper.js';
import { githubIntegration } from '../core/github-integration.js';
import { gitlabIntegration } from '../core/gitlab-integration.js';
import { usageManager } from '../core/usage-manager.js';
import { settingsManager } from '../config/settings.js';
import { queryClaudeQuota, clearQuotaCache } from '../core/claude-usage-query.js';

/**
 * Try to refresh a GitLab token using the refresh token.
 * Returns the new access token if successful, null otherwise.
 * Also updates the workspace with the new token.
 */
function tryRefreshGitLabToken(workspaceId: string): string | null {
  const tokenData = workspaceManager.getGitLabToken(workspaceId);
  if (!tokenData?.refreshToken) {
    console.log(`[GitLab] No refresh token available for workspace ${workspaceId}`);
    return null;
  }

  const settings = settingsManager.get();
  const clientId = settings.gitlab?.clientId;
  if (!clientId) {
    console.log(`[GitLab] No GitLab clientId configured in settings`);
    return null;
  }

  console.log(`[GitLab] Attempting to refresh token for workspace ${workspaceId}`);

  const tempScriptPath = join(tmpdir(), `gitlab-refresh-${randomUUID()}.mjs`);
  const tempResultPath = join(tmpdir(), `gitlab-refresh-result-${randomUUID()}.json`);

  const scriptContent = `
import { writeFileSync } from 'fs';
try {
  const response = await fetch('https://gitlab.com/oauth/token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: ${JSON.stringify(clientId)},
      refresh_token: ${JSON.stringify(tokenData.refreshToken)},
      grant_type: 'refresh_token',
    }).toString(),
  });

  const text = await response.text();

  if (!response.ok) {
    writeFileSync(${JSON.stringify(tempResultPath)}, JSON.stringify({ success: false, error: text }));
  } else {
    const data = JSON.parse(text);
    if (data.access_token) {
      writeFileSync(${JSON.stringify(tempResultPath)}, JSON.stringify({
        success: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in
      }));
    } else {
      writeFileSync(${JSON.stringify(tempResultPath)}, JSON.stringify({ success: false, error: 'No access_token in response' }));
    }
  }
} catch (e) {
  writeFileSync(${JSON.stringify(tempResultPath)}, JSON.stringify({ success: false, error: e.message }));
}
`;

  try {
    writeFileSync(tempScriptPath, scriptContent);
    execSync(`node "${tempScriptPath}"`, { encoding: 'utf-8', timeout: 15000 });

    const resultJson = readFileSync(tempResultPath, 'utf-8');
    const result = JSON.parse(resultJson);

    if (result.success) {
      // Get the current workspace to preserve other fields
      const workspace = workspaceManager.get(workspaceId);
      if (workspace?.gitlab) {
        // Calculate expiry time
        const expiresAt = result.expiresIn
          ? new Date(Date.now() + result.expiresIn * 1000).toISOString()
          : null;

        // Update the token in workspace
        workspaceManager.setGitLabToken(
          workspaceId,
          result.accessToken,
          workspace.gitlab.username || 'unknown',
          workspace.gitlab.tokenScope || 'api',
          result.refreshToken,
          expiresAt
        );
        console.log(`[GitLab] Token refreshed successfully for workspace ${workspaceId}`);
        return result.accessToken;
      }
    }

    console.log(`[GitLab] Token refresh failed: ${result.error}`);
    return null;
  } catch (error) {
    console.error(`[GitLab] Token refresh error:`, error);
    return null;
  } finally {
    try { unlinkSync(tempScriptPath); } catch {}
    try { unlinkSync(tempResultPath); } catch {}
  }
}

// Lazy path resolution - evaluated when needed, not at module load time
function getAttachmentsDir(): string {
  return join(process.cwd(), 'temp', 'terminal-attachments');
}

// Configure multer for terminal attachments with lazy directory creation
const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = getAttachmentsDir();
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    },
  }),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB per file
    files: 10, // Max 10 files per request
  },
  fileFilter: (_req, file, cb) => {
    // Allowed MIME types
    const allowedMimes = [
      // Images
      'image/png', 'image/jpeg', 'image/gif', 'image/webp',
      // Documents
      'application/pdf',
      // Microsoft Office
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'application/msword', // .doc
      'application/vnd.ms-excel', // .xls
      'application/vnd.ms-powerpoint', // .ppt
      // Text
      'text/plain', 'text/markdown', 'text/csv',
      // Code (text/* covers most)
      'text/javascript', 'text/typescript', 'text/html', 'text/css',
      'application/json', 'application/xml', 'text/xml',
      'application/x-yaml', 'text/yaml',
    ];

    // Also allow by extension for code files
    const allowedExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.webp',
      '.pdf',
      // Office documents
      '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.toml',
      '.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs',
      '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
      '.c', '.cpp', '.h', '.hpp', '.cs',
      '.sql', '.sh', '.bash', '.zsh', '.ps1',
      '.dockerfile', '.env', '.gitignore',
      '.html', '.css', '.scss', '.sass', '.less',
    ];

    const ext = extname(file.originalname).toLowerCase();
    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype} (${ext})`));
    }
  },
});

export const terminalRouter = Router();

/**
 * Resolve the correct repo for a session, supporting multi-repo sessions.
 * For multi-repo sessions, accepts an optional repoId from request body/query.
 * Falls back to primary repo (repoIds[0]) if not specified or invalid.
 */
function resolveSessionRepo(
  session: TerminalSession,
  requestedRepoId?: string
): { repo: { id: string; path: string }; repoId: string } | null {
  // If a specific repoId was requested and it's valid for this session, use it
  if (requestedRepoId && session.repoIds.includes(requestedRepoId)) {
    const repo = repoRegistry.get(requestedRepoId);
    if (repo) {
      return { repo, repoId: requestedRepoId };
    }
  }

  // Fall back to primary repo (first in the list)
  const primaryRepoId = session.repoIds[0];
  const repo = repoRegistry.get(primaryRepoId);
  if (repo) {
    return { repo, repoId: primaryRepoId };
  }

  return null;
}

/**
 * Get the working directory for git operations.
 * For worktree sessions, uses the worktree path instead of repo path.
 */
function getWorkingDir(session: TerminalSession, repo: { path: string }): string {
  if (session.worktreeMode && session.worktreePath) {
    return session.worktreePath;
  }
  return repo.path;
}

/**
 * Get exec options for git commands with OAuth credentials if available.
 * Returns both the options and a cleanup function.
 */
function getGitExecOptions(workingDir: string, timeout = 60000): {
  options: ExecSyncOptions;
  cleanup: () => void;
} {
  const creds = workspaceManager.getGitCredentialsForRepo(workingDir);

  let gitCredEnv: Record<string, string> | null = null;
  let env: NodeJS.ProcessEnv = { ...process.env };

  if (creds.token && creds.platform) {
    gitCredEnv = getGitCredentialEnv(creds.token, creds.platform, creds.username || undefined);
    env = { ...env, ...gitCredEnv };
    console.log(`[terminal-routes] Using ${creds.platform} OAuth for git operation`);
  }

  return {
    options: {
      cwd: workingDir,
      encoding: 'utf-8' as BufferEncoding,
      timeout,
      env,
      stdio: ['pipe', 'pipe', 'pipe'] as const,
    },
    cleanup: () => {
      if (gitCredEnv) {
        cleanupGitCredentialEnv(gitCredEnv);
      }
    },
  };
}

// Create a new terminal session (supports both single repo and multi-repo, and worktree mode)
terminalRouter.post('/sessions', (req: Request, res: Response) => {
  try {
    const { repoId, repoIds, worktreeMode, branch, baseBranch, existingWorktreePath } = req.body;

    // Support both single repoId and array of repoIds
    let ids: string[];
    if (repoIds && Array.isArray(repoIds)) {
      ids = repoIds;
    } else if (repoId && typeof repoId === 'string') {
      ids = [repoId];
    } else {
      res.status(400).json({ success: false, error: 'repoId or repoIds is required' });
      return;
    }

    if (ids.length === 0) {
      res.status(400).json({ success: false, error: 'At least one repository is required' });
      return;
    }

    // Build worktree options if worktree mode is requested
    let worktreeOptions: WorktreeSessionOptions | undefined;
    if (worktreeMode) {
      // Either use existing worktree or create new one
      if (existingWorktreePath && typeof existingWorktreePath === 'string') {
        // Use existing worktree
        worktreeOptions = {
          worktreeMode: true,
          existingWorktreePath,
          branch: '', // Will be detected from worktree
        };
      } else if (branch && typeof branch === 'string') {
        // Create new worktree
        worktreeOptions = {
          worktreeMode: true,
          branch,
          baseBranch,
        };
      } else {
        res.status(400).json({ success: false, error: 'Branch name or existingWorktreePath is required when worktreeMode is enabled' });
        return;
      }
    }

    const session = terminalSessionManager.createSession(ids, worktreeOptions);

    res.status(201).json({
      success: true,
      data: {
        id: session.id,
        repoIds: session.repoIds,
        repoId: session.repoIds[0], // Backward compatibility
        isMultiRepo: session.isMultiRepo,
        status: session.status,
        mode: session.mode,
        messages: session.messages,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        // Worktree fields
        worktreeMode: session.worktreeMode,
        worktreePath: session.worktreePath,
        branch: session.branch,
        baseBranch: session.baseBranch,
        ownsWorktree: session.ownsWorktree,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Search across all session messages
terminalRouter.get('/sessions/search', (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!query || query.trim().length === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    const results = terminalSessionManager.searchMessages(query, limit);

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// List all worktree sessions
terminalRouter.get('/sessions/worktrees', (_req: Request, res: Response) => {
  try {
    const sessions = terminalSessionManager.getWorktreeSessions();

    res.json({
      success: true,
      data: sessions.map((session) => ({
        id: session.id,
        repoIds: session.repoIds,
        repoId: session.repoIds[0],
        status: session.status,
        mode: session.mode,
        messageCount: session.messages.length,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        isBookmarked: session.isBookmarked,
        name: session.name,
        // Worktree specific fields
        worktreeMode: session.worktreeMode,
        worktreePath: session.worktreePath,
        branch: session.branch,
        baseBranch: session.baseBranch,
        ownsWorktree: session.ownsWorktree,
      })),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get branches for a repository (for worktree creation UI)
// Pass ?fetch=true to fetch from remote first
terminalRouter.get('/repos/:repoId/branches', (req: Request, res: Response) => {
  try {
    const { repoId } = req.params;
    const shouldFetch = req.query.fetch === 'true';

    const repo = repoRegistry.get(repoId);
    if (!repo) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }

    let localBranches: string[] = [];
    let remoteBranches: string[] = [];
    let currentBranch = '';

    // Fetch from remote first if requested (to get latest branches)
    if (shouldFetch) {
      try {
        // Get exec options with credentials for authenticated fetch
        const { options: execOptions, cleanup } = getGitExecOptions(repo.path, 60000);
        try {
          execSync('git fetch --all --prune', execOptions);
        } finally {
          if (cleanup) cleanup();
        }
      } catch (fetchErr) {
        // Log but don't fail - we can still show local branches
        console.log('[branches] Fetch failed (may need auth):', fetchErr instanceof Error ? fetchErr.message : fetchErr);
      }
    }

    try {
      // Get current branch
      currentBranch = execSync('git branch --show-current', {
        cwd: repo.path,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      // Get all local branches
      const localOutput = execSync('git branch --format="%(refname:short)"', {
        cwd: repo.path,
        encoding: 'utf-8',
        timeout: 10000,
      });

      localBranches = localOutput
        .split('\n')
        .map(b => b.trim())
        .filter(b => b.length > 0);

      // Get all remote branches (strip origin/ prefix for display)
      const remoteOutput = execSync('git branch -r --format="%(refname:short)"', {
        cwd: repo.path,
        encoding: 'utf-8',
        timeout: 10000,
      });

      remoteBranches = remoteOutput
        .split('\n')
        .map(b => b.trim())
        .filter(b => b.length > 0 && !b.includes('HEAD'))
        .map(b => b.replace(/^origin\//, '')); // Strip origin/ prefix

      // Remove duplicates (branches that exist both locally and remotely)
      remoteBranches = remoteBranches.filter(rb => !localBranches.includes(rb));
    } catch {
      // Ignore errors - might not be a git repo
    }

    // Determine main branch
    const mainBranch = gitSandbox.getMainBranch(repo.path);

    // Combine branches: local first, then remote-only
    const allBranches = [...localBranches, ...remoteBranches];

    res.json({
      success: true,
      data: {
        branches: allBranches,
        localBranches,
        remoteBranches,
        currentBranch,
        mainBranch,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// List existing worktrees for a repository
terminalRouter.get('/repos/:repoId/worktrees', (req: Request, res: Response) => {
  try {
    const { repoId } = req.params;

    const repo = repoRegistry.get(repoId);
    if (!repo) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }

    // Get list of worktree paths
    const worktreePaths = gitSandbox.listWorktrees(repo.path);

    // Get branch info for each worktree
    const worktrees = worktreePaths.map((worktreePath) => {
      let branch = '';
      let isMain = false;

      try {
        // Get branch name for this worktree
        branch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: worktreePath,
          encoding: 'utf-8',
          timeout: 5000,
        }).trim();

        // Check if this is the main worktree (same path as repo)
        isMain = worktreePath.replace(/\\/g, '/') === repo.path.replace(/\\/g, '/');
      } catch {
        // Ignore errors - might be a corrupted worktree
      }

      return {
        path: worktreePath,
        branch,
        isMain,
      };
    });

    // Filter out the main worktree and any without a branch (corrupted)
    const usableWorktrees = worktrees.filter(wt => !wt.isMain && wt.branch);

    res.json({
      success: true,
      data: usableWorktrees,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get worktree info for a specific session
terminalRouter.get('/sessions/:id/worktree', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const info = terminalSessionManager.getWorktreeInfo(id);
    if (!info) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    res.json({
      success: true,
      data: info,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// List all sessions
terminalRouter.get('/sessions', (_req: Request, res: Response) => {
  try {
    const sessions = terminalSessionManager.getAllSessions();

    res.json({
      success: true,
      data: sessions.map((session) => ({
        id: session.id,
        repoIds: session.repoIds,
        repoId: session.repoIds[0], // Backward compatibility
        isMultiRepo: session.isMultiRepo,
        status: session.status,
        mode: session.mode,
        messageCount: session.messages.length,
        lastMessage: session.messages[session.messages.length - 1]?.content.slice(0, 100),
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        isBookmarked: session.isBookmarked,
        bookmarkedAt: session.bookmarkedAt,
        name: session.name,
        // Worktree fields
        worktreeMode: session.worktreeMode,
        branch: session.branch,
        baseBranch: session.baseBranch,
        ownsWorktree: session.ownsWorktree,
      })),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get a specific session with full history
terminalRouter.get('/sessions/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = terminalSessionManager.getSession(id);

    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: session.id,
        repoIds: session.repoIds,
        repoId: session.repoIds[0], // Backward compatibility
        isMultiRepo: session.isMultiRepo,
        mergedFromSessionIds: session.mergedFromSessionIds,
        status: session.status,
        mode: session.mode,
        messages: session.messages,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        isBookmarked: session.isBookmarked,
        bookmarkedAt: session.bookmarkedAt,
        name: session.name,
        // Worktree fields
        worktreeMode: session.worktreeMode,
        worktreePath: session.worktreePath,
        branch: session.branch,
        baseBranch: session.baseBranch,
        ownsWorktree: session.ownsWorktree,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Upload file attachments for a session
terminalRouter.post(
  '/sessions/:id/attachments',
  attachmentUpload.array('files', 10),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const files = req.files as Express.Multer.File[];

    try {
      const session = terminalSessionManager.getSession(id);
      if (!session) {
        // Clean up uploaded files if session not found
        files?.forEach((f) => existsSync(f.path) && unlinkSync(f.path));
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      if (!files || files.length === 0) {
        res.status(400).json({ success: false, error: 'No files provided' });
        return;
      }

      // Rename files with session prefix for easier cleanup
      const attachments = files.map((file) => {
        const newFilename = `${id}_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const newPath = join(getAttachmentsDir(), newFilename);
        renameSync(file.path, newPath);

        return {
          id: randomUUID(),
          originalName: file.originalname,
          path: newPath,
          size: file.size,
          mimeType: file.mimetype,
          uploadedAt: new Date().toISOString(),
        };
      });

      res.json({
        success: true,
        data: { attachments },
      });
    } catch (error) {
      // Clean up files on error
      files?.forEach((f) => existsSync(f.path) && unlinkSync(f.path));
      const errorMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: errorMsg });
    }
  }
);

// List attachments for a session
terminalRouter.get('/sessions/:id/attachments', (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    // Find all files prefixed with this session ID
    const files = readdirSync(getAttachmentsDir())
      .filter((f) => f.startsWith(`${id}_`))
      .map((filename) => {
        const filePath = join(getAttachmentsDir(), filename);
        const stat = statSync(filePath);
        // Extract original name from filename (format: sessionId_timestamp_originalName)
        const parts = filename.split('_');
        const originalName = parts.slice(2).join('_');
        return {
          id: filename,
          originalName,
          path: filePath,
          size: stat.size,
          uploadedAt: stat.mtime.toISOString(),
        };
      });

    res.json({
      success: true,
      data: { attachments: files },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Delete a specific attachment
terminalRouter.delete('/sessions/:id/attachments/:attachmentId', (req: Request, res: Response) => {
  const { id, attachmentId } = req.params;

  try {
    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    // Ensure the attachment belongs to this session
    if (!attachmentId.startsWith(`${id}_`)) {
      res.status(403).json({ success: false, error: 'Attachment does not belong to this session' });
      return;
    }

    const filePath = join(getAttachmentsDir(), attachmentId);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      res.json({ success: true, data: { deleted: attachmentId } });
    } else {
      res.status(404).json({ success: false, error: 'Attachment not found' });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Send a message to a session (REST fallback for non-WebSocket clients)
terminalRouter.post('/sessions/:id/message', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      res.status(400).json({ success: false, error: 'content is required' });
      return;
    }

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    // This is async but we respond immediately
    // Client should use WebSocket for real-time updates
    terminalSessionManager.sendMessage(id, content).catch((err) => {
      console.error(`[Terminal] Message send error:`, err);
    });

    res.json({
      success: true,
      data: { message: 'Message sent. Use WebSocket for real-time updates.' },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Set session mode
terminalRouter.patch('/sessions/:id/mode', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { mode } = req.body;

    if (mode !== 'plan' && mode !== 'direct') {
      res.status(400).json({ success: false, error: 'mode must be "plan" or "direct"' });
      return;
    }

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    terminalSessionManager.setMode(id, mode);

    res.json({
      success: true,
      data: { mode },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Export session as markdown or JSON
terminalRouter.get('/sessions/:id/export', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const format = (req.query.format as string) || 'markdown';

    if (format !== 'markdown' && format !== 'json') {
      res.status(400).json({ success: false, error: 'format must be "markdown" or "json"' });
      return;
    }

    const content = terminalSessionManager.exportSession(id, format);
    if (!content) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const session = terminalSessionManager.getSession(id);
    const filename = `session-${session?.name || session?.repoIds[0] || id}-${new Date().toISOString().split('T')[0]}`;

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
    } else {
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.md"`);
    }

    res.send(content);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Toggle session bookmark
terminalRouter.patch('/sessions/:id/bookmark', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isBookmarked } = req.body;

    if (typeof isBookmarked !== 'boolean') {
      res.status(400).json({ success: false, error: 'isBookmarked must be a boolean' });
      return;
    }

    const session = terminalSessionManager.setBookmark(id, isBookmarked);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: session.id,
        isBookmarked: session.isBookmarked,
        bookmarkedAt: session.bookmarkedAt,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Cancel running operation
terminalRouter.post('/sessions/:id/cancel', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    terminalSessionManager.cancelSession(id);

    res.json({
      success: true,
      data: { message: 'Cancelled' },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Clear session messages
terminalRouter.post('/sessions/:id/clear', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    terminalSessionManager.clearMessages(id);

    res.json({
      success: true,
      data: { message: 'Messages cleared' },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Delete a session
// For worktree sessions:
// - ?deleteBranch=true to also delete the git branch
// - ?deleteWorktree=false to keep the worktree on disk (close session only)
terminalRouter.delete('/sessions/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleteBranch = req.query.deleteBranch === 'true';
    // Default to true for backwards compatibility - only skip worktree deletion if explicitly set to 'false'
    const deleteWorktree = req.query.deleteWorktree !== 'false';

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const result = terminalSessionManager.deleteSession(id, deleteBranch, deleteWorktree);

    res.json({
      success: true,
      data: {
        message: 'Session deleted',
        worktreeDeleted: result.worktreeDeleted,
        branchDeleted: result.branchDeleted,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Merge multiple sessions into one multi-repo session
terminalRouter.post('/sessions/merge', (req: Request, res: Response) => {
  try {
    const { sessionIds } = req.body;

    if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length < 2) {
      res.status(400).json({
        success: false,
        error: 'sessionIds array with at least 2 session IDs is required',
      });
      return;
    }

    const session = terminalSessionManager.mergeSessions(sessionIds);

    res.status(201).json({
      success: true,
      data: {
        id: session.id,
        repoIds: session.repoIds,
        repoId: session.repoIds[0],
        isMultiRepo: session.isMultiRepo,
        mergedFromSessionIds: session.mergedFromSessionIds,
        status: session.status,
        mode: session.mode,
        messages: session.messages,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Add a repository to an existing session
terminalRouter.post('/sessions/:id/add-repo', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { repoId } = req.body;

    if (!repoId || typeof repoId !== 'string') {
      res.status(400).json({ success: false, error: 'repoId is required' });
      return;
    }

    const session = terminalSessionManager.addRepoToSession(id, repoId);

    res.json({
      success: true,
      data: {
        id: session.id,
        repoIds: session.repoIds,
        isMultiRepo: session.isMultiRepo,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Remove a repository from a session
terminalRouter.post('/sessions/:id/remove-repo', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { repoId } = req.body;

    if (!repoId || typeof repoId !== 'string') {
      res.status(400).json({ success: false, error: 'repoId is required' });
      return;
    }

    const session = terminalSessionManager.removeRepoFromSession(id, repoId);

    res.json({
      success: true,
      data: {
        id: session.id,
        repoIds: session.repoIds,
        isMultiRepo: session.isMultiRepo,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// Get git status for all repositories in a session (multi-repo support)
terminalRouter.get('/sessions/:id/multi-git-status', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const repos: Record<string, {
      repoId: string;
      repoPath: string;
      branch: string;
      modified: number;
      staged: number;
      untracked: number;
      worktreeMode?: boolean;
    }> = {};

    for (const repoId of session.repoIds) {
      const repo = repoRegistry.get(repoId);
      if (!repo) continue;

      // For worktree sessions (single repo), use worktree path
      const workingDir = session.worktreeMode && session.worktreePath
        ? session.worktreePath
        : repo.path;

      let branch = 'unknown';
      let modified = 0;
      let staged = 0;
      let untracked = 0;

      try {
        branch = execSync('git branch --show-current', {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 5000,
        }).trim();
      } catch {
        // Ignore errors
      }

      try {
        const status = execSync('git status --porcelain', {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 5000,
        });

        const lines = status.split('\n').filter((line: string) => line.trim());
        for (const line of lines) {
          const indexStatus = line[0];
          const workTreeStatus = line[1];

          if (indexStatus !== ' ' && indexStatus !== '?') {
            staged++;
          }
          if (workTreeStatus === 'M' || workTreeStatus === 'D') {
            modified++;
          }
          if (indexStatus === '?') {
            untracked++;
          }
        }
      } catch {
        // Ignore errors
      }

      repos[repoId] = {
        repoId,
        repoPath: workingDir,
        branch,
        modified,
        staged,
        untracked,
        worktreeMode: session.worktreeMode,
      };
    }

    res.json({
      success: true,
      data: {
        isMultiRepo: session.isMultiRepo,
        worktreeMode: session.worktreeMode,
        repos,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get git status for a session's repository
terminalRouter.get('/sessions/:id/git-status', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requestedRepoId = req.query.repoId as string | undefined;

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    // Get git branch
    let branch = 'unknown';
    try {
      branch = execSync('git branch --show-current', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
    } catch {
      // Ignore errors
    }

    // Get git status counts and file details
    let modified = 0;
    let staged = 0;
    let untracked = 0;
    const files: Array<{ path: string; status: string }> = [];

    try {
      const status = execSync('git status --porcelain', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      });

      const lines = status.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const indexStatus = line[0];
        const workTreeStatus = line[1];
        // File path starts at position 3 (after "XY ")
        const filePath = line.substring(3).trim();

        if (indexStatus !== ' ' && indexStatus !== '?') {
          staged++;
        }
        if (workTreeStatus === 'M' || workTreeStatus === 'D') {
          modified++;
        }
        if (indexStatus === '?') {
          untracked++;
        }

        // Determine file status for display
        let fileStatus = 'modified';
        if (indexStatus === '?' && workTreeStatus === '?') {
          fileStatus = 'untracked';
        } else if (indexStatus === 'A') {
          fileStatus = 'added';
        } else if (indexStatus === 'D' || workTreeStatus === 'D') {
          fileStatus = 'deleted';
        } else if (indexStatus === 'R') {
          fileStatus = 'renamed';
        } else if (indexStatus === 'M' || workTreeStatus === 'M') {
          fileStatus = 'modified';
        }

        if (filePath) {
          files.push({ path: filePath, status: fileStatus });
        }
      }
    } catch {
      // Ignore errors
    }

    res.json({
      success: true,
      data: { branch, modified, staged, untracked, files, worktreeMode: session.worktreeMode },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Read a file from a session's repository
terminalRouter.post('/sessions/:id/read-file', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath, repoId: requestedRepoId } = req.body;

    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ success: false, error: 'filePath is required' });
      return;
    }

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    // Ensure path is within working dir (security check)
    const fullPath = join(workingDir, filePath);
    if (!fullPath.startsWith(workingDir)) {
      res.status(400).json({ success: false, error: 'Invalid file path' });
      return;
    }

    if (!existsSync(fullPath)) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const content = readFileSync(fullPath, 'utf-8');
    const extension = extname(filePath).slice(1) || 'txt';

    // Map extensions to language names
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      jsx: 'jsx',
      py: 'python',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      sql: 'sql',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      xml: 'xml',
      html: 'html',
      css: 'css',
      scss: 'scss',
      md: 'markdown',
      sh: 'bash',
      bash: 'bash',
      zsh: 'bash',
    };

    res.json({
      success: true,
      data: {
        content,
        language: languageMap[extension] || extension,
        path: filePath,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get git diff for a file
terminalRouter.post('/sessions/:id/file-diff', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath, staged, repoId: requestedRepoId } = req.body;

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    let diff = '';
    try {
      // Use --cached for staged files, regular diff for unstaged
      const cachedFlag = staged ? '--cached' : '';
      if (filePath) {
        // Diff for specific file (use -M to detect renames)
        diff = execSync(`git diff ${cachedFlag} -M -- "${filePath}"`, {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 10000,
        });
      } else {
        // Diff for all changed files
        diff = execSync(`git diff ${cachedFlag} -M`, {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 10000,
        });
      }
    } catch {
      // No changes or git error
      diff = '';
    }

    res.json({
      success: true,
      data: { diff },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get list of changed files
terminalRouter.get('/sessions/:id/changed-files', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requestedRepoId = req.query.repoId as string | undefined;

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    const files: { path: string; status: string }[] = [];

    try {
      const status = execSync('git status --porcelain', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      });

      const lines = status.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const statusCode = line.slice(0, 2);
        const filePath = line.slice(3);

        let fileStatus = 'modified';
        if (statusCode.includes('A')) fileStatus = 'added';
        else if (statusCode.includes('D')) fileStatus = 'deleted';
        else if (statusCode.includes('?')) fileStatus = 'untracked';
        else if (statusCode.includes('M')) fileStatus = 'modified';

        files.push({ path: filePath, status: fileStatus });
      }
    } catch {
      // Ignore errors
    }

    res.json({
      success: true,
      data: { files },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get branch info (current branch and base branch)
terminalRouter.get('/sessions/:id/branch-info', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requestedRepoId = req.query.repoId as string | undefined;

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    let currentBranch = '';
    let baseBranch = 'main'; // Default to main

    try {
      // Get current branch
      currentBranch = execSync('git branch --show-current', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      // Try to find base branch (main or master)
      const branches = execSync('git branch -a', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      });

      if (branches.includes('main')) {
        baseBranch = 'main';
      } else if (branches.includes('master')) {
        baseBranch = 'master';
      }
    } catch {
      // Ignore errors
    }

    // Get commit count ahead of base branch
    let commitsAhead = 0;
    try {
      const count = execSync(`git rev-list --count ${baseBranch}..HEAD`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      commitsAhead = parseInt(count, 10) || 0;
    } catch {
      // Branch may not have diverged yet
    }

    res.json({
      success: true,
      data: { currentBranch, baseBranch, commitsAhead, worktreeMode: session.worktreeMode },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get files changed in current branch vs base branch (main/master)
terminalRouter.get('/sessions/:id/branch-changed-files', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const baseBranch = (req.query.base as string) || 'main';
    const requestedRepoId = req.query.repoId as string | undefined;

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    const files: { path: string; status: string; oldPath?: string }[] = [];

    try {
      // Get files changed between base branch and HEAD
      // Using merge-base to find common ancestor
      const mergeBase = execSync(`git merge-base ${baseBranch} HEAD`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      // Use -M to detect renames
      const diffOutput = execSync(`git diff -M --name-status ${mergeBase} HEAD`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 10000,
      });

      const lines = diffOutput.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const parts = line.split('\t');
        const statusCode = parts[0];

        let fileStatus = 'modified';
        if (statusCode === 'A') fileStatus = 'added';
        else if (statusCode === 'D') fileStatus = 'deleted';
        else if (statusCode === 'M') fileStatus = 'modified';
        else if (statusCode.startsWith('R')) fileStatus = 'renamed';

        // For renames (R###), format is: R###\toldPath\tnewPath
        if (statusCode.startsWith('R') && parts.length >= 3) {
          const oldPath = parts[1];
          const newPath = parts[2];
          if (newPath) {
            files.push({ path: newPath, status: fileStatus, oldPath });
          }
        } else if (parts[1]) {
          files.push({ path: parts[1], status: fileStatus });
        }
      }
    } catch {
      // Ignore errors (e.g., no common ancestor)
    }

    res.json({
      success: true,
      data: { files, baseBranch },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get diff for a file vs base branch
terminalRouter.post('/sessions/:id/branch-file-diff', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath, baseBranch = 'main', repoId: requestedRepoId } = req.body;

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    let diff = '';
    try {
      // Get merge base for accurate diff
      const mergeBase = execSync(`git merge-base ${baseBranch} HEAD`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      if (filePath) {
        // Diff for specific file
        diff = execSync(`git diff ${mergeBase} HEAD -- "${filePath}"`, {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 10000,
        });
      } else {
        // Diff for all changed files
        diff = execSync(`git diff ${mergeBase} HEAD`, {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 30000,
        });
      }
    } catch {
      // No changes or git error
      diff = '';
    }

    res.json({
      success: true,
      data: { diff },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get detailed working tree status (staged vs unstaged)
terminalRouter.get('/sessions/:id/working-status', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requestedRepoId = req.query.repoId as string | undefined;

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    const staged: { path: string; status: string; oldPath?: string }[] = [];
    const unstaged: { path: string; status: string; oldPath?: string }[] = [];

    try {
      // Use -M to detect renames, -unormal to show untracked files/dirs
      const status = execSync('git status --porcelain -M -unormal', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 10000,
      });

      const lines = status.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const indexStatus = line[0]; // Staged status
        const workTreeStatus = line[1]; // Unstaged status
        let filePath = line.slice(3);

        // Handle renamed files: "old-path -> new-path"
        let oldPath: string | null = null;
        if (filePath.includes(' -> ')) {
          const parts = filePath.split(' -> ');
          oldPath = parts[0];
          filePath = parts[1]; // Use the new path as the main path
        }

        // Staged changes (index)
        if (indexStatus !== ' ' && indexStatus !== '?') {
          let fileStatus = 'modified';
          if (indexStatus === 'A') fileStatus = 'added';
          else if (indexStatus === 'D') fileStatus = 'deleted';
          else if (indexStatus === 'M') fileStatus = 'modified';
          else if (indexStatus === 'R') fileStatus = 'renamed';

          if (indexStatus === 'R' && oldPath) {
            // For renames, store oldPath separately
            staged.push({ path: filePath, status: fileStatus, oldPath });
          } else {
            staged.push({ path: filePath, status: fileStatus });
          }
        }

        // Unstaged changes (work tree)
        if (workTreeStatus === 'M' || workTreeStatus === 'D') {
          const fileStatus = workTreeStatus === 'D' ? 'deleted' : 'modified';
          unstaged.push({ path: filePath, status: fileStatus });
        }

        // Skip untracked from git status - we'll get them from ls-files for individual files
      }

      // Get untracked files using ls-files (shows individual files, not just directories)
      try {
        const untrackedOutput = execSync('git ls-files --others --exclude-standard', {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 10000,
        });

        const untrackedFiles = untrackedOutput.split('\n').filter(f => f.trim());
        for (const file of untrackedFiles) {
          unstaged.push({ path: file, status: 'untracked' });
        }
      } catch {
        // Ignore ls-files errors
      }
    } catch {
      // Ignore errors
    }

    res.json({
      success: true,
      data: { staged, unstaged },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Stage files (git add)
terminalRouter.post('/sessions/:id/git-stage', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { files, repoId: requestedRepoId } = req.body; // Array of file paths, or empty for all; repoId for multi-repo

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    try {
      if (files && files.length > 0) {
        // Stage specific files - try to stage all at once first (more efficient)
        // Escape special characters and handle paths properly
        const escapedFiles = files.map((f: string) => `"${f.replace(/"/g, '\\"')}"`).join(' ');
        try {
          execSync(`git add -- ${escapedFiles}`, {
            cwd: workingDir,
            encoding: 'utf-8',
            timeout: 10000,
          });
        } catch {
          // If batch add fails, try adding files individually and collect errors
          const errors: string[] = [];
          const succeeded: string[] = [];
          for (const file of files) {
            try {
              execSync(`git add -- "${file.replace(/"/g, '\\"')}"`, {
                cwd: workingDir,
                encoding: 'utf-8',
                timeout: 5000,
              });
              succeeded.push(file);
            } catch (fileErr) {
              const errMsg = fileErr instanceof Error ? fileErr.message : String(fileErr);
              errors.push(`${file}: ${errMsg}`);
            }
          }

          if (errors.length > 0 && succeeded.length === 0) {
            // All files failed
            res.status(400).json({
              success: false,
              error: `Failed to stage files:\n${errors.join('\n')}`
            });
            return;
          } else if (errors.length > 0) {
            // Some files failed, some succeeded
            res.json({
              success: true,
              data: {
                message: `Staged ${succeeded.length} files, ${errors.length} failed`,
                warnings: errors
              }
            });
            return;
          }
        }
      } else {
        // Stage all
        execSync('git add -A', {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 5000,
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: `Failed to stage: ${errorMsg}` });
      return;
    }

    res.json({ success: true, data: { message: 'Files staged' } });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Unstage files (git reset)
terminalRouter.post('/sessions/:id/git-unstage', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { files, repoId: requestedRepoId } = req.body; // Array of file paths, or empty for all; repoId for multi-repo

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    try {
      if (files && files.length > 0) {
        // Unstage specific files - try to unstage all at once first
        const escapedFiles = files.map((f: string) => `"${f.replace(/"/g, '\\"')}"`).join(' ');
        try {
          execSync(`git reset HEAD -- ${escapedFiles}`, {
            cwd: workingDir,
            encoding: 'utf-8',
            timeout: 10000,
          });
        } catch {
          // If batch reset fails, try individually and collect errors
          const errors: string[] = [];
          const succeeded: string[] = [];
          for (const file of files) {
            try {
              execSync(`git reset HEAD -- "${file.replace(/"/g, '\\"')}"`, {
                cwd: workingDir,
                encoding: 'utf-8',
                timeout: 5000,
              });
              succeeded.push(file);
            } catch (fileErr) {
              const errMsg = fileErr instanceof Error ? fileErr.message : String(fileErr);
              errors.push(`${file}: ${errMsg}`);
            }
          }

          if (errors.length > 0 && succeeded.length === 0) {
            res.status(400).json({
              success: false,
              error: `Failed to unstage files:\n${errors.join('\n')}`
            });
            return;
          } else if (errors.length > 0) {
            res.json({
              success: true,
              data: {
                message: `Unstaged ${succeeded.length} files, ${errors.length} failed`,
                warnings: errors
              }
            });
            return;
          }
        }
      } else {
        // Unstage all
        execSync('git reset HEAD', {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 5000,
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: `Failed to unstage: ${errorMsg}` });
      return;
    }

    res.json({ success: true, data: { message: 'Files unstaged' } });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Discard changes (git restore / git checkout)
terminalRouter.post('/sessions/:id/git-discard', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { files, repoId: requestedRepoId } = req.body; // Array of file paths (required); repoId for multi-repo

    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: 'Files are required' });
      return;
    }

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    try {
      for (const file of files) {
        // Try git restore first (newer), fall back to checkout
        try {
          execSync(`git restore "${file}"`, {
            cwd: workingDir,
            encoding: 'utf-8',
            timeout: 5000,
          });
        } catch {
          execSync(`git checkout -- "${file}"`, {
            cwd: workingDir,
            encoding: 'utf-8',
            timeout: 5000,
          });
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: `Failed to discard: ${errorMsg}` });
      return;
    }

    res.json({ success: true, data: { message: 'Changes discarded' } });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Delete untracked file
terminalRouter.post('/sessions/:id/git-delete-untracked', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { file, repoId: requestedRepoId } = req.body;

    if (!file) {
      res.status(400).json({ success: false, error: 'File path is required' });
      return;
    }

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    const fullPath = join(workingDir, file);

    // Security check - ensure path is within working dir
    if (!fullPath.startsWith(workingDir)) {
      res.status(400).json({ success: false, error: 'Invalid file path' });
      return;
    }

    try {
      // Use rmSync for Windows compatibility (handles both files and directories)
      rmSync(fullPath, { recursive: true, force: true });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: `Failed to delete: ${errorMsg}` });
      return;
    }

    res.json({ success: true, data: { message: 'File deleted' } });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Commit staged changes
terminalRouter.post('/sessions/:id/git-commit', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message, repoId: requestedRepoId } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ success: false, error: 'Commit message is required' });
      return;
    }

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    let commitHash = '';
    try {
      // Escape message for shell
      const escapedMessage = message.replace(/"/g, '\\"');
      execSync(`git commit -m "${escapedMessage}"`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 30000,
      });

      // Get the commit hash
      commitHash = execSync('git rev-parse --short HEAD', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: `Failed to commit: ${errorMsg}` });
      return;
    }

    res.json({ success: true, data: { message: 'Committed', commitHash } });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Push to remote
terminalRouter.post('/sessions/:id/git-push', (req: Request, res: Response) => {
  let cleanup: (() => void) | null = null;

  try {
    const { id } = req.params;
    const { repoId: requestedRepoId } = req.body || {};

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    // Get exec options with OAuth credentials if available
    const { options: execOptions, cleanup: cleanupFn } = getGitExecOptions(workingDir, 120000);
    cleanup = cleanupFn;

    try {
      // Get current branch
      const branch = execSync('git branch --show-current', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      // Push with upstream tracking using OAuth credentials
      execSync(`git push -u origin ${branch}`, execOptions);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: `Failed to push: ${errorMsg}` });
      return;
    } finally {
      if (cleanup) cleanup();
    }

    res.json({ success: true, data: { message: 'Pushed to remote' } });
  } catch (error) {
    if (cleanup) cleanup();
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Checkout/switch to a different branch
terminalRouter.post('/sessions/:id/git-checkout', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { branch, repoId: requestedRepoId } = req.body;

    if (!branch || typeof branch !== 'string') {
      res.status(400).json({ success: false, error: 'Branch name is required' });
      return;
    }

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    try {
      // Check for uncommitted changes first
      const status = execSync('git status --porcelain', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      });

      if (status.trim()) {
        res.status(400).json({
          success: false,
          error: 'Cannot switch branches with uncommitted changes. Please commit or stash your changes first.',
        });
        return;
      }

      // Perform the checkout
      execSync(`git checkout "${branch}"`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 30000,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: `Failed to checkout: ${errorMsg}` });
      return;
    }

    res.json({ success: true, data: { message: `Switched to branch ${branch}`, branch } });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Create a pull request (GitHub) or merge request (GitLab)
terminalRouter.post('/sessions/:id/create-pr', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, body, repoId: requestedRepoId, targetBranch } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ success: false, error: 'PR title is required' });
      return;
    }

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    // Debug logging for PR creation
    console.log(`[create-pr] repo.path: ${repo.path}`);
    console.log(`[create-pr] workingDir: ${workingDir}`);
    console.log(`[create-pr] session.worktreeMode: ${session.worktreeMode}`);

    // Get current branch
    let currentBranch: string;
    try {
      currentBranch = execSync('git branch --show-current', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
    } catch (err) {
      res.status(400).json({ success: false, error: 'Failed to get current branch' });
      return;
    }

    // Get remote URL to detect platform (GitHub vs GitLab)
    let remoteUrl: string;
    try {
      remoteUrl = execSync('git remote get-url origin', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
    } catch (err) {
      res.status(400).json({ success: false, error: 'No remote origin configured' });
      return;
    }

    // Detect platform and create PR/MR
    const isGitLab = remoteUrl.includes('gitlab.com') || remoteUrl.includes('gitlab.');
    const isGitHub = remoteUrl.includes('github.com') || remoteUrl.includes('github.');

    // Pass repo.path for workspace lookup (needed for worktree mode where workingDir is a temp path)
    if (isGitLab) {
      const result = await gitlabIntegration.createMR(workingDir, currentBranch, title.trim(), body || '', repo.path, targetBranch);
      if (result.success) {
        res.json({
          success: true,
          data: {
            url: result.mrUrl,
            type: 'merge_request',
            platform: 'gitlab',
          },
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } else if (isGitHub) {
      const result = await githubIntegration.createPR(workingDir, currentBranch, title.trim(), body || '', repo.path, targetBranch);
      if (result.success) {
        res.json({
          success: true,
          data: {
            url: result.prUrl,
            type: 'pull_request',
            platform: 'github',
          },
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } else {
      res.status(400).json({
        success: false,
        error: 'Could not detect platform from remote URL. Only GitHub and GitLab are supported.',
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Generate PR title and description using AI
terminalRouter.post('/sessions/:id/generate-pr-content', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { repoId: requestedRepoId, targetBranch: requestedTargetBranch } = req.body || {};

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    // Get current branch and base branch
    let currentBranch: string;
    let baseBranch = requestedTargetBranch || 'main';
    try {
      currentBranch = execSync('git branch --show-current', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      // Only auto-detect base branch if not provided
      if (!requestedTargetBranch) {
        const branches = execSync('git branch -a', {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 5000,
        });
        baseBranch = branches.includes('remotes/origin/main') ? 'main' : 'master';
      }
    } catch {
      res.status(400).json({ success: false, error: 'Failed to get branch info' });
      return;
    }

    // Fetch the target branch from remote so we diff against the latest state.
    // Without this, origin/<branch> can be stale and the diff includes
    // commits already merged upstream (e.g. other feature branches).
    let diffRef = baseBranch;
    try {
      const { options: fetchOpts, cleanup: fetchCleanup } = getGitExecOptions(workingDir, 30000);
      try {
        execSync(`git fetch origin ${baseBranch}`, { ...fetchOpts, cwd: workingDir });
      } finally {
        if (fetchCleanup) fetchCleanup();
      }
      diffRef = `origin/${baseBranch}`;
    } catch {
      // Fetch failed (offline, no auth, etc.) - try using existing origin ref
      try {
        execSync(`git rev-parse --verify origin/${baseBranch}`, {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        diffRef = `origin/${baseBranch}`;
      } catch {
        // No origin ref available, fall back to local branch
      }
    }

    // Get commit messages in this branch (skip merge commits for cleaner signal)
    let commitMessages = '';
    try {
      commitMessages = execSync(`git log --no-merges --format="%s" ${diffRef}..HEAD`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 10000,
      }).trim();
    } catch {
      commitMessages = '';
    }

    // If no non-merge commits, fall back to including merge commits
    if (!commitMessages) {
      try {
        commitMessages = execSync(`git log --format="%s" ${diffRef}..HEAD`, {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 10000,
        }).trim();
      } catch {
        commitMessages = '';
      }
    }

    // Get file changes summary (diff stat)
    let fileChanges = '';
    let diffSample = '';
    try {
      const mergeBase = execSync(`git merge-base ${diffRef} HEAD`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      fileChanges = execSync(`git diff --stat ${mergeBase} HEAD`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 10000,
      }).trim();

      // Also get a compact diff summary for better AI context when commit messages are sparse
      const rawDiff = execSync(`git diff --compact-summary ${mergeBase} HEAD`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 10000,
      }).trim();
      // Limit to 3000 chars to avoid token limits
      diffSample = rawDiff.length > 3000 ? rawDiff.substring(0, 3000) + '\n...(truncated)' : rawDiff;
    } catch {
      fileChanges = '';
    }

    // If we have neither commits nor file changes, nothing to summarize
    if (!commitMessages && !fileChanges) {
      res.status(400).json({ success: false, error: 'No changes to summarize' });
      return;
    }

    // Try to read CLAUDE.md for project conventions
    let claudeMd = '';
    const claudeMdPath = join(workingDir, 'CLAUDE.md');
    if (existsSync(claudeMdPath)) {
      try {
        claudeMd = readFileSync(claudeMdPath, 'utf-8');
        // Limit to first 2000 chars to avoid token limits
        if (claudeMd.length > 2000) {
          claudeMd = claudeMd.substring(0, 2000) + '\n...(truncated)';
        }
      } catch {
        claudeMd = '';
      }
    }

    // Build prompt
    const prompt = `Generate a Pull Request title and description for the following changes.

Branch: ${currentBranch} → ${baseBranch}
${commitMessages ? `
Commits in this branch:
${commitMessages}
` : ''}
Files changed:
${fileChanges}
${diffSample ? `
Diff summary:
${diffSample}
` : ''}${claudeMd ? `
Project conventions (from CLAUDE.md):
${claudeMd}
` : ''}
Rules:
- Title: Max 72 characters, imperative mood (e.g., "Add", "Fix", "Update", "Refactor")
- Description: Markdown format with sections: ## Summary (2-3 bullet points), ## Changes (list key changes), ## Test Plan (if applicable)
- IMPORTANT: Only describe changes visible in the diff and file list above. Do NOT infer or guess changes that are not shown.
- Follow any PR conventions mentioned in CLAUDE.md
- Output format must be exactly:
TITLE: <title here>
DESCRIPTION:
<description here>`;

    // Call Claude Code CLI
    const { spawn } = await import('child_process');

    const claudeProcess = spawn('claude', ['--dangerously-skip-permissions', '-p', '-'], {
      cwd: workingDir,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    let errorOutput = '';

    claudeProcess.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    claudeProcess.stderr?.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });

    // Write prompt to stdin
    claudeProcess.stdin?.write(prompt);
    claudeProcess.stdin?.end();

    // Wait for process to complete with timeout
    const timeoutMs = 60000;
    const result = await Promise.race([
      new Promise<{ success: boolean; title?: string; description?: string; error?: string }>((resolve) => {
        claudeProcess.on('close', (code) => {
          if (code === 0 && output.trim()) {
            // Parse output - look for TITLE: and DESCRIPTION:
            const titleMatch = output.match(/TITLE:\s*(.+?)(?:\n|DESCRIPTION:)/s);
            const descMatch = output.match(/DESCRIPTION:\s*([\s\S]+)$/);

            const title = titleMatch ? titleMatch[1].trim() : '';
            const description = descMatch ? descMatch[1].trim() : '';

            if (title) {
              resolve({ success: true, title, description });
            } else {
              // Fallback: use first line as title, rest as description
              const lines = output.trim().split('\n');
              resolve({
                success: true,
                title: lines[0].replace(/^(TITLE:|Title:)\s*/i, '').trim(),
                description: lines.slice(1).join('\n').replace(/^(DESCRIPTION:|Description:)\s*/i, '').trim(),
              });
            }
          } else {
            resolve({ success: false, error: errorOutput || 'Failed to generate PR content' });
          }
        });
      }),
      new Promise<{ success: boolean; error: string }>((resolve) => {
        setTimeout(() => {
          claudeProcess.kill();
          resolve({ success: false, error: 'Timeout generating PR content' });
        }, timeoutMs);
      }),
    ]);

    if (result.success && 'title' in result) {
      // Clean up Claude session
      try {
        const { homedir } = await import('os');
        const projectName = workingDir.replace(/:/g, '-').replace(/\\/g, '-').replace(/\//g, '-');
        const sessionsDir = join(homedir(), '.claude', 'projects', projectName);
        const now = Date.now();
        const files = readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
          const filePath = join(sessionsDir, file);
          const stat = statSync(filePath);
          if (now - stat.mtimeMs < 120000) {
            unlinkSync(filePath);
          }
        }
      } catch {
        // Ignore cleanup errors
      }

      res.json({
        success: true,
        data: {
          title: result.title,
          description: result.description,
        },
      });
    } else {
      res.status(500).json({ success: false, error: result.error || 'Failed to generate content' });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Delete file added in branch (git rm)
terminalRouter.post('/sessions/:id/git-rm-branch-file', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { file, baseBranch = 'main', repoId: requestedRepoId } = req.body;

    if (!file) {
      res.status(400).json({ success: false, error: 'File path is required' });
      return;
    }

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    try {
      // Verify file was added in this branch (not in base branch)
      const mergeBase = execSync(`git merge-base ${baseBranch} HEAD`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      const diffOutput = execSync(`git diff --name-status ${mergeBase} HEAD -- "${file}"`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      });

      // Check if file was added (status 'A')
      if (!diffOutput.trim().startsWith('A')) {
        res.status(400).json({
          success: false,
          error: 'Can only delete files that were added in this branch'
        });
        return;
      }

      // Remove the file using git rm -f (force needed if file has local modifications)
      execSync(`git rm -f "${file}"`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: `Failed to delete: ${errorMsg}` });
      return;
    }

    res.json({ success: true, data: { message: 'File removed (staged for deletion)' } });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Generate commit message using Claude
terminalRouter.post('/sessions/:id/generate-commit-message', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { repoId: requestedRepoId } = req.body || {};

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    // Get staged file statuses (A=added, M=modified, D=deleted, R=renamed)
    let stagedStatus: string;
    try {
      stagedStatus = execSync('git diff --cached --name-status', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      });
    } catch {
      stagedStatus = '';
    }

    if (!stagedStatus.trim()) {
      res.status(400).json({ success: false, error: 'No staged changes to summarize' });
      return;
    }

    // Parse file statuses for summary
    const lines = stagedStatus.trim().split('\n');
    const added = lines.filter(l => l.startsWith('A')).length;
    const modified = lines.filter(l => l.startsWith('M')).length;
    const deleted = lines.filter(l => l.startsWith('D')).length;
    const renamed = lines.filter(l => l.startsWith('R')).length;

    // Build summary
    const summaryParts: string[] = [];
    if (deleted > 0) summaryParts.push(`${deleted} deleted`);
    if (added > 0) summaryParts.push(`${added} added`);
    if (modified > 0) summaryParts.push(`${modified} modified`);
    if (renamed > 0) summaryParts.push(`${renamed} renamed`);

    // Pass file list with statuses - simpler and clearer than full diff
    const prompt = `Generate a commit message for these staged changes:

Files (${summaryParts.join(', ')}):
${stagedStatus}

Rules:
- Max 72 characters
- Imperative mood (e.g., "Remove", "Add", "Update", "Refactor")
- If mostly deletions, use "Remove" or "Delete"
- Output ONLY the commit message text
- No quotes, no explanation`;

    // Call Claude Code CLI
    const { spawn } = await import('child_process');

    // Use --dangerously-skip-permissions to skip prompts, -p for print mode, - for stdin
    const claudeProcess = spawn('claude', ['--dangerously-skip-permissions', '-p', '-'], {
      cwd: workingDir,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    let errorOutput = '';

    claudeProcess.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    claudeProcess.stderr?.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });

    // Write prompt to stdin
    claudeProcess.stdin?.write(prompt);
    claudeProcess.stdin?.end();

    // Wait for process to complete with timeout
    const timeoutMs = 30000;
    const result = await Promise.race([
      new Promise<{ success: boolean; message?: string; error?: string }>((resolve) => {
        claudeProcess.on('close', (code) => {
          if (code === 0 && output.trim()) {
            // Clean up the output - remove any markdown formatting
            let message = output.trim();
            // Remove quotes if wrapped
            if ((message.startsWith('"') && message.endsWith('"')) ||
                (message.startsWith("'") && message.endsWith("'"))) {
              message = message.slice(1, -1);
            }
            // Take only the first line if multiple lines
            message = message.split('\n')[0].trim();
            resolve({ success: true, message });
          } else {
            resolve({ success: false, error: errorOutput || 'Failed to generate commit message' });
          }
        });
      }),
      new Promise<{ success: boolean; error: string }>((resolve) => {
        setTimeout(() => {
          claudeProcess.kill();
          resolve({ success: false, error: 'Timeout generating commit message' });
        }, timeoutMs);
      }),
    ]);

    if (result.success && 'message' in result && result.message) {
      const generatedMessage = result.message;
      // Clean up Claude session to avoid polluting /resume history
      // The session is created in ~/.claude/projects/<project-folder>/
      try {
        const { homedir } = await import('os');
        const { join } = await import('path');
        const { readdirSync, unlinkSync, statSync } = await import('fs');

        const projectName = workingDir.replace(/:/g, '-').replace(/\\/g, '-').replace(/\//g, '-');
        const sessionsDir = join(homedir(), '.claude', 'projects', projectName);

        // Find and delete the most recent session file (created in last 60 seconds)
        const now = Date.now();
        const files = readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
          const filePath = join(sessionsDir, file);
          const stat = statSync(filePath);
          // Delete if created in last 60 seconds (our temp session)
          if (now - stat.mtimeMs < 60000) {
            unlinkSync(filePath);
          }
        }
      } catch {
        // Ignore cleanup errors - session dir might not exist
      }

      res.json({ success: true, data: { message: generatedMessage } });
    } else {
      res.status(500).json({ success: false, error: result.error || 'Failed to generate message' });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get commit log for branch (commits ahead of base branch)
terminalRouter.get('/sessions/:id/commit-log', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const baseBranch = (req.query.base as string) || 'main';
    const limit = parseInt(req.query.limit as string) || 20;
    const before = req.query.before as string | undefined;
    const requestedRepoId = req.query.repoId as string | undefined;

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    interface CommitInfo {
      hash: string;
      fullHash: string;
      message: string;
      author: string;
      authorEmail: string;
      date: string;
      filesCount: number;
    }

    const commits: CommitInfo[] = [];

    try {
      // Get commit log between base branch and HEAD
      // Format: fullHash|shortHash|subject|authorName|authorEmail|isoDate
      let logCommand = `git log --format="%H|%h|%s|%an|%ae|%aI" ${baseBranch}..HEAD`;
      if (before) {
        logCommand = `git log --format="%H|%h|%s|%an|%ae|%aI" ${baseBranch}..${before}^`;
      }

      const logOutput = execSync(logCommand, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 15000,
      });

      const lines = logOutput.trim().split('\n').filter(line => line.trim());

      // Limit the results
      const limitedLines = lines.slice(0, limit + 1); // Get one extra to check hasMore
      const hasMore = lines.length > limit;
      const processLines = limitedLines.slice(0, limit);

      for (const line of processLines) {
        const parts = line.split('|');
        if (parts.length >= 6) {
          const fullHash = parts[0];
          const hash = parts[1];
          const message = parts[2];
          const author = parts[3];
          const authorEmail = parts[4];
          const date = parts[5];

          // Get file count for this commit
          let filesCount = 0;
          try {
            const countOutput = execSync(`git diff-tree --no-commit-id --name-only -r ${fullHash}`, {
              cwd: workingDir,
              encoding: 'utf-8',
              timeout: 5000,
            });
            filesCount = countOutput.trim().split('\n').filter(f => f.trim()).length;
          } catch {
            // Ignore errors
          }

          commits.push({
            hash,
            fullHash,
            message,
            author,
            authorEmail,
            date,
            filesCount,
          });
        }
      }

      res.json({
        success: true,
        data: { commits, hasMore },
      });
    } catch {
      // No commits or error - return empty
      res.json({
        success: true,
        data: { commits: [], hasMore: false },
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get files changed in a specific commit
terminalRouter.get('/sessions/:id/commit-files', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const commitHash = req.query.hash as string;
    const requestedRepoId = req.query.repoId as string | undefined;

    if (!commitHash) {
      res.status(400).json({ success: false, error: 'Commit hash is required' });
      return;
    }

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    const files: { path: string; status: string; oldPath?: string }[] = [];

    try {
      // Get files changed in this commit with rename detection
      const diffOutput = execSync(`git diff-tree --no-commit-id --name-status -r -M ${commitHash}`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 10000,
      });

      const lines = diffOutput.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const parts = line.split('\t');
        const statusCode = parts[0];

        let fileStatus = 'modified';
        if (statusCode === 'A') fileStatus = 'added';
        else if (statusCode === 'D') fileStatus = 'deleted';
        else if (statusCode === 'M') fileStatus = 'modified';
        else if (statusCode.startsWith('R')) fileStatus = 'renamed';

        // For renames (R###), format is: R###\toldPath\tnewPath
        if (statusCode.startsWith('R') && parts.length >= 3) {
          const oldPath = parts[1];
          const newPath = parts[2];
          if (newPath) {
            files.push({ path: newPath, status: fileStatus, oldPath });
          }
        } else if (parts[1]) {
          files.push({ path: parts[1], status: fileStatus });
        }
      }
    } catch {
      // Ignore errors
    }

    res.json({
      success: true,
      data: { files },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get diff for a specific file in a specific commit
terminalRouter.post('/sessions/:id/commit-file-diff', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { commitHash, filePath, repoId: requestedRepoId } = req.body;

    if (!commitHash || !filePath) {
      res.status(400).json({ success: false, error: 'commitHash and filePath are required' });
      return;
    }

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    let diff = '';
    try {
      // Get the diff for this specific file in this commit
      // git show shows the diff introduced by a commit
      diff = execSync(`git show ${commitHash} -- "${filePath}"`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 10000,
      });
    } catch {
      // No changes or git error
      diff = '';
    }

    res.json({
      success: true,
      data: { diff },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// ============================================================================
// Ship Changes Endpoints
// ============================================================================

// Get ship summary (all info needed for the Ship modal)
terminalRouter.get('/sessions/:id/ship-summary', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requestedRepoId = req.query.repoId as string | undefined;

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    // Get current branch
    let currentBranch = '';
    let baseBranch = 'main';
    try {
      currentBranch = execSync('git branch --show-current', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      // Try to find base branch (main or master)
      const branches = execSync('git branch -a', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      });

      if (branches.includes('main')) {
        baseBranch = 'main';
      } else if (branches.includes('master')) {
        baseBranch = 'master';
      }
    } catch {
      // Ignore errors
    }

    // Check for existing PR/MR for this branch
    let existingPR: { url: string; number: number; title: string; state: string } | null = null;
    if (currentBranch && currentBranch !== baseBranch) {
      const workspace = workspaceManager.getWorkspaceForRepo(workingDir);
      const creds = workspaceManager.getGitCredentialsForRepo(workingDir);
      console.log(`[ship-summary] Checking for existing PR/MR. Branch: ${currentBranch}, baseBranch: ${baseBranch}, platform: ${creds.platform}, hasToken: ${!!creds.token}, workspaceId: ${workspace?.id}`);

      if (creds.platform === 'github') {
        // Try gh CLI first
        try {
          const prJson = execSync(`gh pr view --json url,number,title,state`, {
            cwd: workingDir,
            encoding: 'utf-8',
            timeout: 10000,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          const pr = JSON.parse(prJson);
          if (pr.url) {
            existingPR = {
              url: pr.url,
              number: pr.number,
              title: pr.title,
              state: pr.state?.toLowerCase() || 'open',
            };
          }
        } catch {
          // No PR exists or gh not available
        }
      } else if (creds.platform === 'gitlab') {
        console.log(`[ship-summary] GitLab detected, checking for existing MR on branch: ${currentBranch}`);
        // Try glab CLI first with correct -F flag
        let glabWorked = false;
        try {
          const mrJson = execSync(`glab mr view -F json`, {
            cwd: workingDir,
            encoding: 'utf-8',
            timeout: 10000,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          console.log(`[ship-summary] glab mr view output:`, mrJson);
          const mr = JSON.parse(mrJson);
          if (mr.web_url) {
            existingPR = {
              url: mr.web_url,
              number: mr.iid,
              title: mr.title,
              state: mr.state?.toLowerCase() || 'opened',
            };
            glabWorked = true;
            console.log(`[ship-summary] Found existing MR via glab:`, existingPR);
          }
        } catch (glabErr: unknown) {
          // glab not available or no MR - try API fallback
          const err = glabErr as { message?: string; stderr?: string };
          console.log(`[ship-summary] glab mr view failed:`, err.message || err.stderr || 'unknown error');
        }

        // If glab didn't work, try GitLab API with OAuth token
        if (!glabWorked && creds.token) {
          console.log(`[ship-summary] Trying GitLab API fallback with token`);

          // Helper function to make the API call with a given token
          const checkMRWithToken = (token: string): { found: boolean; url?: string; number?: number; title?: string; state?: string; status?: number; error?: string } => {
            try {
              // Get remote URL to determine project path
              const remoteUrl = execSync('git remote get-url origin', {
                cwd: workingDir,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
              }).trim();

              // Parse GitLab project path from remote URL
              const match = remoteUrl.match(/gitlab\.com[:/](.+?)(?:\.git)?$/);
              if (!match) {
                return { found: false, error: 'Could not parse GitLab remote URL' };
              }

              const projectPath = match[1].replace(/\.git$/, '');
              const projectPathEncoded = encodeURIComponent(projectPath);
              const apiUrl = `https://gitlab.com/api/v4/projects/${projectPathEncoded}/merge_requests?source_branch=${encodeURIComponent(currentBranch)}`;
              console.log(`[ship-summary] API URL: ${apiUrl}`);

              const tempScriptPath = join(tmpdir(), `gitlab-mr-check-${randomUUID()}.mjs`);
              const tempResultPath = join(tmpdir(), `gitlab-mr-result-${randomUUID()}.json`);

              const scriptContent = `
import { writeFileSync } from 'fs';
try {
  const response = await fetch(${JSON.stringify(apiUrl)}, {
    headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + ${JSON.stringify(token)},
    },
  });
  const text = await response.text();
  const status = response.status;

  if (!response.ok) {
    writeFileSync(${JSON.stringify(tempResultPath)}, JSON.stringify({
      found: false,
      error: 'HTTP ' + status + ': ' + text.substring(0, 500),
      status: status
    }));
  } else {
    let mrs;
    try {
      mrs = JSON.parse(text);
    } catch (parseErr) {
      writeFileSync(${JSON.stringify(tempResultPath)}, JSON.stringify({
        found: false,
        error: 'Invalid JSON: ' + text.substring(0, 200)
      }));
      process.exit(0);
    }

    if (Array.isArray(mrs) && mrs.length > 0) {
      const mr = mrs[0];
      writeFileSync(${JSON.stringify(tempResultPath)}, JSON.stringify({
        found: true,
        url: mr.web_url,
        number: mr.iid,
        title: mr.title,
        state: mr.state
      }));
    } else {
      writeFileSync(${JSON.stringify(tempResultPath)}, JSON.stringify({
        found: false,
        debug: 'API returned ' + (Array.isArray(mrs) ? mrs.length + ' results' : typeof mrs),
        status: status
      }));
    }
  }
} catch (e) {
  writeFileSync(${JSON.stringify(tempResultPath)}, JSON.stringify({ found: false, error: e.message }));
}
`;
              writeFileSync(tempScriptPath, scriptContent);

              try {
                execSync(`node "${tempScriptPath}"`, {
                  encoding: 'utf-8',
                  timeout: 15000,
                });

                const resultJson = readFileSync(tempResultPath, 'utf-8');
                console.log(`[ship-summary] GitLab API result:`, resultJson);
                return JSON.parse(resultJson);
              } finally {
                try { unlinkSync(tempScriptPath); } catch {}
                try { unlinkSync(tempResultPath); } catch {}
              }
            } catch (e) {
              console.log(`[ship-summary] GitLab API MR check error:`, e);
              return { found: false, error: String(e) };
            }
          };

          // First attempt with current token
          let result = checkMRWithToken(creds.token);

          // If we got a 401, try refreshing the token
          if (result.status === 401 && workspace) {
            console.log(`[ship-summary] Got 401, attempting token refresh for workspace ${workspace.id}`);
            const newToken = tryRefreshGitLabToken(workspace.id);
            if (newToken) {
              console.log(`[ship-summary] Token refreshed, retrying API call`);
              result = checkMRWithToken(newToken);
            }
          }

          if (result.found) {
            existingPR = {
              url: result.url!,
              number: result.number!,
              title: result.title!,
              state: result.state?.toLowerCase() || 'opened',
            };
            console.log(`[ship-summary] Found existing MR via API:`, existingPR);
          } else {
            console.log(`[ship-summary] No MR found via API, error:`, result.error);
          }
        }
      }
    }

    // Get unpushed commits count
    let unpushedCommits = 0;
    try {
      const count = execSync(`git rev-list --count origin/${currentBranch}..HEAD`, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      unpushedCommits = parseInt(count, 10) || 0;
    } catch {
      // Branch may not have upstream or no commits yet
      try {
        // Count all commits on current branch
        unpushedCommits = parseInt(execSync('git rev-list --count HEAD', {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 5000,
        }).trim(), 10) || 0;
      } catch {
        unpushedCommits = 0;
      }
    }

    // Get staged and unstaged files
    let hasStagedChanges = false;
    let hasUnstagedChanges = false;
    try {
      const status = execSync('git status --porcelain', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      });

      const lines = status.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const indexStatus = line[0];
        const workTreeStatus = line[1];

        if (indexStatus !== ' ' && indexStatus !== '?') {
          hasStagedChanges = true;
        }
        if (workTreeStatus === 'M' || workTreeStatus === 'D' || indexStatus === '?') {
          hasUnstagedChanges = true;
        }
      }
    } catch {
      // Ignore errors
    }

    // Get file changes with stats
    interface FileChange {
      path: string;
      insertions: number;
      deletions: number;
      status: 'added' | 'modified' | 'deleted' | 'renamed';
      oldPath?: string;
    }
    const files: FileChange[] = [];
    let totalInsertions = 0;
    let totalDeletions = 0;

    // Show all committed changes on this branch compared to base branch
    // This includes both pushed and unpushed commits
    if (currentBranch && currentBranch !== baseBranch) {
      try {
        // Get files changed on this branch compared to base branch (main/master)
        // This shows ALL committed changes, both pushed and unpushed
        let diffBase = `origin/${baseBranch}`;

        // Check if origin base branch exists
        try {
          execSync(`git rev-parse ${diffBase}`, {
            cwd: workingDir,
            encoding: 'utf-8',
            timeout: 5000,
          });
        } catch {
          // Try local base branch
          diffBase = baseBranch;
          try {
            execSync(`git rev-parse ${diffBase}`, {
              cwd: workingDir,
              encoding: 'utf-8',
              timeout: 5000,
            });
          } catch {
            // No base branch found, skip
            diffBase = '';
          }
        }

        if (diffBase) {
          // Get numstat for all commits on this branch vs base
          const branchNumstat = execSync(`git diff ${diffBase}..HEAD --numstat`, {
            cwd: workingDir,
            encoding: 'utf-8',
            timeout: 10000,
          });

          // Get name-status for branch commits
          const branchStatus = execSync(`git diff ${diffBase}..HEAD --name-status -M`, {
            cwd: workingDir,
            encoding: 'utf-8',
            timeout: 10000,
          });

          // Parse numstat
          const branchNumstatMap = new Map<string, { insertions: number; deletions: number }>();
          branchNumstat.split('\n').filter(l => l.trim()).forEach(line => {
            const parts = line.split('\t');
            if (parts.length >= 3) {
              const ins = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
              const del = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
              const path = parts[2];
              branchNumstatMap.set(path, { insertions: ins, deletions: del });
              totalInsertions += ins;
              totalDeletions += del;
            }
          });

          // Parse name-status
          branchStatus.split('\n').filter(l => l.trim()).forEach(line => {
            const parts = line.split('\t');
            const statusCode = parts[0];

            let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified';
            if (statusCode === 'A') status = 'added';
            else if (statusCode === 'D') status = 'deleted';
            else if (statusCode.startsWith('R')) status = 'renamed';

            if (status === 'renamed' && parts.length >= 3) {
              const oldPath = parts[1];
              const newPath = parts[2];
              const stats = branchNumstatMap.get(newPath) || { insertions: 0, deletions: 0 };
              files.push({
                path: newPath,
                insertions: stats.insertions,
                deletions: stats.deletions,
                status,
                oldPath,
              });
            } else if (parts[1]) {
              const stats = branchNumstatMap.get(parts[1]) || { insertions: 0, deletions: 0 };
              files.push({
                path: parts[1],
                insertions: stats.insertions,
                deletions: stats.deletions,
                status,
              });
            }
          });
        }
      } catch (err) {
        console.log('[ship-summary] Failed to get branch commits diff:', err);
      }
    } else {
      // No unpushed commits - show uncommitted changes (staged, unstaged, untracked)
      try {
        // Get numstat for line counts (staged changes)
        const stagedNumstat = execSync('git diff --cached --numstat', {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 10000,
        });

        // Get name-status for status info (staged changes)
        const stagedStatus = execSync('git diff --cached --name-status -M', {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 10000,
        });

        // Parse numstat
        const numstatMap = new Map<string, { insertions: number; deletions: number }>();
        stagedNumstat.split('\n').filter(l => l.trim()).forEach(line => {
          const parts = line.split('\t');
          if (parts.length >= 3) {
            const ins = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
            const del = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
            const path = parts[2];
            numstatMap.set(path, { insertions: ins, deletions: del });
            totalInsertions += ins;
            totalDeletions += del;
          }
        });

        // Parse name-status
        stagedStatus.split('\n').filter(l => l.trim()).forEach(line => {
          const parts = line.split('\t');
          const statusCode = parts[0];

          let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified';
          if (statusCode === 'A') status = 'added';
          else if (statusCode === 'D') status = 'deleted';
          else if (statusCode.startsWith('R')) status = 'renamed';

          // For renames, format is: R###\toldPath\tnewPath
          if (status === 'renamed' && parts.length >= 3) {
            const oldPath = parts[1];
            const newPath = parts[2];
            const stats = numstatMap.get(newPath) || { insertions: 0, deletions: 0 };
            files.push({
              path: newPath,
              insertions: stats.insertions,
              deletions: stats.deletions,
              status,
              oldPath,
            });
          } else if (parts[1]) {
            const stats = numstatMap.get(parts[1]) || { insertions: 0, deletions: 0 };
            files.push({
              path: parts[1],
              insertions: stats.insertions,
              deletions: stats.deletions,
              status,
            });
          }
        });

        // Also add unstaged changes for complete picture
        const unstagedNumstat = execSync('git diff --numstat', {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 10000,
        });

        const unstagedStatus = execSync('git diff --name-status -M', {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 10000,
        });

        // Parse unstaged numstat
        const unstagedNumstatMap = new Map<string, { insertions: number; deletions: number }>();
        unstagedNumstat.split('\n').filter(l => l.trim()).forEach(line => {
          const parts = line.split('\t');
          if (parts.length >= 3) {
            const ins = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
            const del = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
            const path = parts[2];
            unstagedNumstatMap.set(path, { insertions: ins, deletions: del });
            totalInsertions += ins;
            totalDeletions += del;
          }
        });

        // Parse unstaged name-status (only add if not already in staged)
        const existingPaths = new Set(files.map(f => f.path));
        unstagedStatus.split('\n').filter(l => l.trim()).forEach(line => {
          const parts = line.split('\t');
          const statusCode = parts[0];
          const path = statusCode.startsWith('R') && parts.length >= 3 ? parts[2] : parts[1];

          if (path && !existingPaths.has(path)) {
            let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified';
            if (statusCode === 'A') status = 'added';
            else if (statusCode === 'D') status = 'deleted';
            else if (statusCode.startsWith('R')) status = 'renamed';

            const stats = unstagedNumstatMap.get(path) || { insertions: 0, deletions: 0 };

            if (status === 'renamed' && parts.length >= 3) {
              files.push({
                path,
                insertions: stats.insertions,
                deletions: stats.deletions,
                status,
                oldPath: parts[1],
              });
            } else {
              files.push({
                path,
                insertions: stats.insertions,
                deletions: stats.deletions,
                status,
              });
            }
          }
        });

        // Add untracked files
        const untracked = execSync('git ls-files --others --exclude-standard', {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 5000,
        });

        const existingPathsWithUntracked = new Set(files.map(f => f.path));
        untracked.split('\n').filter(l => l.trim()).forEach(path => {
          if (!existingPathsWithUntracked.has(path)) {
            files.push({
              path,
              insertions: 0,
              deletions: 0,
              status: 'added',
            });
          }
        });
      } catch {
        // Ignore errors
      }
    }

    const hasUncommittedChanges = hasStagedChanges || hasUnstagedChanges;
    const hasChangesToShip = files.length > 0 || unpushedCommits > 0;

    res.json({
      success: true,
      data: {
        files,
        totalInsertions,
        totalDeletions,
        currentBranch,
        baseBranch,
        hasUncommittedChanges,
        hasChangesToShip,
        unpushedCommits,
        hasStagedChanges,
        hasUnstagedChanges,
        existingPR,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Ship changes (stage, commit, push, create PR in one flow)
terminalRouter.post('/sessions/:id/ship', async (req: Request, res: Response) => {
  let cleanup: (() => void) | null = null;

  try {
    const { id } = req.params;
    const {
      commitMessage,
      push = true,
      createPR = true,
      prTitle,
      prBody,
      targetBranch,
      repoId: requestedRepoId,
    } = req.body;

    // Commit message is optional - only required if there are uncommitted changes
    const hasCommitMessage = commitMessage && typeof commitMessage === 'string' && commitMessage.trim();

    const session = terminalSessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const resolved = resolveSessionRepo(session, requestedRepoId);
    if (!resolved) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }
    const { repo } = resolved;
    const workingDir = getWorkingDir(session, repo);

    let committed = false;
    let pushed = false;
    let prUrl: string | undefined;
    let commitHash: string | undefined;

    // Step 1: Stage all changes (including untracked)
    try {
      execSync('git add -A', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 30000,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: `Failed to stage changes: ${errorMsg}` });
      return;
    }

    // Check if there's anything to commit
    let hasChangesToCommit = false;
    try {
      const status = execSync('git status --porcelain', {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 5000,
      });
      hasChangesToCommit = status.trim().length > 0;
    } catch {
      // Ignore
    }

    // Step 2: Commit if there are staged changes AND commit message provided
    if (hasChangesToCommit) {
      if (!hasCommitMessage) {
        res.status(400).json({ success: false, error: 'Commit message is required for uncommitted changes' });
        return;
      }
      try {
        const escapedMessage = commitMessage.replace(/"/g, '\\"');
        execSync(`git commit -m "${escapedMessage}"`, {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 30000,
        });

        commitHash = execSync('git rev-parse --short HEAD', {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 5000,
        }).trim();

        committed = true;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        // Check if it's "nothing to commit"
        if (!errorMsg.includes('nothing to commit')) {
          res.status(400).json({ success: false, error: `Failed to commit: ${errorMsg}` });
          return;
        }
      }
    }

    // Step 3: Push if requested
    if (push) {
      const { options: execOptions, cleanup: cleanupFn } = getGitExecOptions(workingDir, 120000);
      cleanup = cleanupFn;

      try {
        const branch = execSync('git branch --show-current', {
          cwd: workingDir,
          encoding: 'utf-8',
          timeout: 5000,
        }).trim();

        execSync(`git push -u origin ${branch}`, execOptions);
        pushed = true;
      } catch (err) {
        if (cleanup) cleanup();
        cleanup = null;
        const errorMsg = err instanceof Error ? err.message : String(err);
        res.status(400).json({
          success: false,
          error: `Failed to push: ${errorMsg}`,
          committed,
          commitHash,
        });
        return;
      } finally {
        if (cleanup) {
          cleanup();
          cleanup = null;
        }
      }

      // Step 4: Create PR if requested and pushed successfully
      if (createPR && pushed) {
        try {
          const currentBranch = execSync('git branch --show-current', {
            cwd: workingDir,
            encoding: 'utf-8',
            timeout: 5000,
          }).trim();

          // Determine target branch
          let target = targetBranch || 'main';
          if (!targetBranch) {
            const branches = execSync('git branch -a', {
              cwd: workingDir,
              encoding: 'utf-8',
              timeout: 5000,
            });
            if (branches.includes('main')) {
              target = 'main';
            } else if (branches.includes('master')) {
              target = 'master';
            }
          }

          // Detect platform and create PR/MR
          const creds = workspaceManager.getGitCredentialsForRepo(workingDir);
          const title = prTitle?.trim() || commitMessage.trim();
          const body = prBody || '';

          if (creds.platform === 'github' && creds.token) {
            const result = await githubIntegration.createPR(
              workingDir,
              currentBranch,
              title,
              body,
              undefined, // workspaceLookupPath
              target
            );

            if (result.success && result.prUrl) {
              prUrl = result.prUrl;
            }
          } else if (creds.platform === 'gitlab' && creds.token) {
            const result = await gitlabIntegration.createMR(
              workingDir,
              currentBranch,
              title,
              body,
              undefined, // workspaceLookupPath
              target
            );

            if (result.success && result.mrUrl) {
              prUrl = result.mrUrl;
            }
          } else {
            // Try using gh CLI as fallback
            try {
              const escapedTitle = title.replace(/"/g, '\\"');
              const escapedBody = body.replace(/"/g, '\\"');
              const result = execSync(
                `gh pr create --title "${escapedTitle}" --body "${escapedBody}" --base ${target}`,
                {
                  cwd: workingDir,
                  encoding: 'utf-8',
                  timeout: 60000,
                }
              );
              // Extract URL from result
              const urlMatch = result.match(/https:\/\/github\.com\/[^\s]+/);
              if (urlMatch) {
                prUrl = urlMatch[0];
              }
            } catch (ghErr) {
              // PR creation failed but commit and push succeeded
              console.error('[ship] Failed to create PR:', ghErr);
            }
          }
        } catch (prErr) {
          // PR creation failed but commit and push succeeded
          console.error('[ship] Failed to create PR:', prErr);
        }
      }
    }

    res.json({
      success: true,
      data: {
        success: true,
        committed,
        pushed,
        prUrl,
        commitHash,
      },
    });
  } catch (error) {
    if (cleanup) cleanup();
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// ============================================================================
// Usage Tracking Endpoints
// ============================================================================

// Get usage stats for a specific session
terminalRouter.get('/sessions/:sessionId/usage', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = terminalSessionManager.getSession(sessionId);

    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const stats = usageManager.getSessionUsage(sessionId);
    res.json({ success: true, data: stats });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get global usage stats for today
terminalRouter.get('/usage', (req: Request, res: Response) => {
  try {
    const stats = usageManager.getGlobalUsage();
    res.json({ success: true, data: stats });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get weekly usage stats (resets on Sunday)
terminalRouter.get('/usage/weekly', (_req: Request, res: Response) => {
  try {
    const stats = usageManager.getWeeklyUsage();
    res.json({ success: true, data: stats });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get Claude subscription quota (from Anthropic OAuth API)
terminalRouter.get('/usage/quota', async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const quota = await queryClaudeQuota(forceRefresh);
    if (quota) {
      res.json({ success: true, data: quota });
    } else {
      res.json({
        success: true,
        data: null,
        message: 'Claude quota data not available. OAuth token may not be accessible.',
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Refresh Claude subscription quota
terminalRouter.post('/usage/quota/refresh', async (_req: Request, res: Response) => {
  try {
    clearQuotaCache();
    const quota = await queryClaudeQuota(true);
    res.json({ success: true, data: quota });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});
