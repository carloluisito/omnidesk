/**
 * System Routes - Update checking and cache management endpoints
 */

import { Router, Request, Response } from 'express';
import { existsSync, readdirSync, statSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { updateChecker } from '../core/update-checker.js';
import { terminalSessionManager } from '../core/terminal-session.js';
import { repoRegistry } from '../config/repos.js';

export const systemRouter = Router();

// ============================================
// Update Endpoints
// ============================================

// Force an immediate version check
systemRouter.get('/update/check', async (_req: Request, res: Response) => {
  try {
    const info = await updateChecker.checkForUpdate();
    res.json({ success: true, data: info });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Trigger the update process
systemRouter.post('/update', async (_req: Request, res: Response) => {
  try {
    const info = updateChecker.getInfo();

    // Return instructions for non-auto-updatable methods
    if (!info.canAutoUpdate) {
      const instructions: Record<string, string> = {
        docker: 'Pull the latest image: docker pull ghcr.io/carloluisito/claudedesk:latest',
        npx: 'You are running via npx. Restart with npx claudedesk@latest to get the new version.',
        source: 'You appear to be running from source. Run git pull && npm run build to update.',
        unknown: 'Could not determine install method. Try: npm install -g claudedesk@latest',
      };

      res.json({
        success: true,
        data: {
          status: 'manual',
          installMethod: info.installMethod,
          instructions: instructions[info.installMethod] || instructions.unknown,
        },
      });
      return;
    }

    const result = await updateChecker.performUpdate();

    if (!result.success) {
      // Check if it's a conflict (already updating)
      if (result.message === 'Update already in progress') {
        res.status(409).json({ success: false, error: result.message });
        return;
      }
      res.status(500).json({ success: false, error: result.message });
      return;
    }

    res.json({
      success: true,
      data: {
        status: 'updating',
        message: result.message,
        stoppedSessions: result.stoppedSessions || 0,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Get current update info (lightweight, no network call)
systemRouter.get('/update/info', (_req: Request, res: Response) => {
  try {
    const info = updateChecker.getInfo();
    res.json({ success: true, data: info });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// ============================================
// Cache Endpoints
// ============================================

// Helper: Calculate directory size recursively
function getDirSize(dirPath: string, maxFiles = 10000): { sizeBytes: number; count: number } {
  let sizeBytes = 0;
  let count = 0;

  if (!existsSync(dirPath)) return { sizeBytes: 0, count: 0 };

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (count >= maxFiles) break;
      const fullPath = join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          const sub = getDirSize(fullPath, maxFiles - count);
          sizeBytes += sub.sizeBytes;
          count += sub.count;
        } else {
          const stat = statSync(fullPath);
          sizeBytes += stat.size;
          count++;
        }
      } catch {
        // Skip inaccessible files
      }
    }
  } catch {
    // Directory not readable
  }

  return { sizeBytes, count };
}

// Get cache info for all categories
systemRouter.get('/cache/info', (_req: Request, res: Response) => {
  try {
    const dataDir = process.cwd();

    // Terminal sessions
    const allSessions = terminalSessionManager.getAllSessions();
    const activeSessions = allSessions.filter((s) => s.status === 'running');
    const sessionsFile = join(dataDir, 'config', 'terminal-sessions.json');
    let sessionsSizeBytes = 0;
    try {
      if (existsSync(sessionsFile)) {
        sessionsSizeBytes = statSync(sessionsFile).size;
      }
    } catch { /* ignore */ }

    // Artifacts
    const artifactsDir = join(dataDir, 'artifacts');
    const artifacts = getDirSize(artifactsDir);

    // Orphaned worktrees
    let orphanedWorktreeCount = 0;
    const repos = repoRegistry.getAll();
    const worktreeRepos: { repoId: string; orphanedWorktrees: number }[] = [];

    for (const repo of repos) {
      try {
        const worktreesBaseDir = join(dirname(repo.path), '.claudedesk-terminal-worktrees', repo.id);
        if (!existsSync(worktreesBaseDir)) continue;

        const dirs = readdirSync(worktreesBaseDir, { withFileTypes: true })
          .filter((d) => d.isDirectory());

        let orphaned = 0;
        for (const d of dirs) {
          const session = allSessions.find((s) => s.id === d.name);
          if (!session || !session.worktreeMode) {
            orphaned++;
          }
        }

        if (orphaned > 0) {
          worktreeRepos.push({ repoId: repo.id, orphanedWorktrees: orphaned });
          orphanedWorktreeCount += orphaned;
        }
      } catch {
        // Skip repos we can't access
      }
    }

    // Usage data
    const usageDir = join(dataDir, 'config', 'usage');
    const usage = getDirSize(usageDir);

    res.json({
      success: true,
      data: {
        sessions: {
          count: allSessions.length,
          activeCount: activeSessions.length,
          sizeBytes: sessionsSizeBytes,
        },
        artifacts: {
          count: artifacts.count,
          sizeBytes: artifacts.sizeBytes,
        },
        worktrees: {
          orphanedCount: orphanedWorktreeCount,
          repos: worktreeRepos,
        },
        usage: {
          count: usage.count,
          sizeBytes: usage.sizeBytes,
        },
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Clear terminal session data (idle sessions only)
systemRouter.delete('/cache/sessions', (_req: Request, res: Response) => {
  try {
    const allSessions = terminalSessionManager.getAllSessions();
    const activeSessions = allSessions.filter((s) => s.status === 'running');
    const idleSessions = allSessions.filter((s) => s.status !== 'running');

    let cleared = 0;
    for (const session of idleSessions) {
      try {
        terminalSessionManager.deleteSession(session.id);
        cleared++;
      } catch {
        // Skip sessions that can't be deleted
      }
    }

    const result: Record<string, unknown> = {
      cleared,
      skipped: activeSessions.length,
    };

    if (activeSessions.length > 0) {
      result.warning = `${activeSessions.length} active session(s) were not cleared`;
    }

    res.json({ success: true, data: result });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Clear artifacts directory
systemRouter.delete('/cache/artifacts', (_req: Request, res: Response) => {
  try {
    const artifactsDir = join(process.cwd(), 'artifacts');
    const before = getDirSize(artifactsDir);

    if (existsSync(artifactsDir)) {
      const entries = readdirSync(artifactsDir);
      for (const entry of entries) {
        try {
          rmSync(join(artifactsDir, entry), { recursive: true, force: true });
        } catch {
          // Skip files we can't remove
        }
      }
    }

    res.json({
      success: true,
      data: {
        cleared: before.count,
        freedBytes: before.sizeBytes,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Prune orphaned git worktrees
systemRouter.post('/cache/worktrees/prune', (_req: Request, res: Response) => {
  try {
    const pruned = terminalSessionManager.cleanupOrphanedWorktrees();

    res.json({
      success: true,
      data: {
        pruned,
        errors: [],
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Clear usage data
systemRouter.delete('/cache/usage', (_req: Request, res: Response) => {
  try {
    const usageDir = join(process.cwd(), 'config', 'usage');
    const before = getDirSize(usageDir);

    if (existsSync(usageDir)) {
      const sessionsDir = join(usageDir, 'sessions');
      if (existsSync(sessionsDir)) {
        const entries = readdirSync(sessionsDir);
        for (const entry of entries) {
          try {
            rmSync(join(sessionsDir, entry), { recursive: true, force: true });
          } catch { /* skip */ }
        }
      }
    }

    res.json({
      success: true,
      data: {
        cleared: before.count,
        freedBytes: before.sizeBytes,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Clear all server-side caches
systemRouter.delete('/cache/all', async (_req: Request, res: Response) => {
  try {
    // Sessions
    const allSessions = terminalSessionManager.getAllSessions();
    const idleSessions = allSessions.filter((s) => s.status !== 'running');
    let clearedSessions = 0;
    for (const session of idleSessions) {
      try {
        terminalSessionManager.deleteSession(session.id);
        clearedSessions++;
      } catch { /* skip */ }
    }

    // Artifacts
    const artifactsDir = join(process.cwd(), 'artifacts');
    const artifactsBefore = getDirSize(artifactsDir);
    if (existsSync(artifactsDir)) {
      const entries = readdirSync(artifactsDir);
      for (const entry of entries) {
        try {
          rmSync(join(artifactsDir, entry), { recursive: true, force: true });
        } catch { /* skip */ }
      }
    }

    // Worktrees
    const prunedWorktrees = terminalSessionManager.cleanupOrphanedWorktrees();

    // Usage
    const usageDir = join(process.cwd(), 'config', 'usage', 'sessions');
    const usageBefore = getDirSize(usageDir);
    if (existsSync(usageDir)) {
      const entries = readdirSync(usageDir);
      for (const entry of entries) {
        try {
          rmSync(join(usageDir, entry), { recursive: true, force: true });
        } catch { /* skip */ }
      }
    }

    res.json({
      success: true,
      data: {
        sessions: {
          cleared: clearedSessions,
          skipped: allSessions.length - idleSessions.length,
        },
        artifacts: {
          cleared: artifactsBefore.count,
          freedBytes: artifactsBefore.sizeBytes,
        },
        worktrees: {
          pruned: prunedWorktrees,
        },
        usage: {
          cleared: usageBefore.count,
          freedBytes: usageBefore.sizeBytes,
        },
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});
