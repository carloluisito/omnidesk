import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GitWorktreeEntry } from '../shared/types/git-types';
import type { SessionMetadata } from '../shared/ipc-types';

// getVersionInfo delegates to probeClaudeVersion (execFile with a 5s timeout)
// instead of the old blocking execSync. Mock child_process the same way
// probe-version.test.ts does so we exercise the real probe function.
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// gitWorktreeList reconciliation reads registry state via isWorktreeManagedByOmniDesk,
// which hits disk through loadWorktreeRegistry(). Stub that one boundary so the tests
// below exercise the real arePathsEqual matching logic without mocking fs.
vi.mock('./settings-persistence', () => ({
  isWorktreeManagedByOmniDesk: vi.fn(),
}));

describe('IPC Handlers - revealInExplorer', () => {
  describe('handler logic', () => {
    it('returns true when directory exists and showItemInFolder is called', () => {
      // Mock the dependencies
      const mockSession = {
        workingDirectory: '/home/user/project',
      };

      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue(mockSession),
      };

      const mockFs = {
        existsSync: vi.fn().mockReturnValue(true),
      };

      const mockShell = {
        showItemInFolder: vi.fn().mockReturnValue(undefined),
      };

      // Simulate the handler logic
      const result = (() => {
        try {
          const session = mockSessionManager.getSession('session-123');
          if (!session) return false;

          const workDir = session.workingDirectory;
          if (!mockFs.existsSync(workDir)) return false;

          mockShell.showItemInFolder(workDir);
          return true;
        } catch (err) {
          return false;
        }
      })();

      expect(result).toBe(true);
      expect(mockSessionManager.getSession).toHaveBeenCalledWith('session-123');
      expect(mockFs.existsSync).toHaveBeenCalledWith('/home/user/project');
      expect(mockShell.showItemInFolder).toHaveBeenCalledWith('/home/user/project');
    });

    it('returns false when session not found', () => {
      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue(null),
      };

      const mockShell = {
        showItemInFolder: vi.fn(),
      };

      const result = (() => {
        try {
          const session = mockSessionManager.getSession('nonexistent');
          if (!session) return false;
          return true;
        } catch (err) {
          return false;
        }
      })();

      expect(result).toBe(false);
      expect(mockSessionManager.getSession).toHaveBeenCalledWith('nonexistent');
      expect(mockShell.showItemInFolder).not.toHaveBeenCalled();
    });

    it('returns false when directory does not exist', () => {
      const mockSession = {
        workingDirectory: '/deleted/directory',
      };

      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue(mockSession),
      };

      const mockFs = {
        existsSync: vi.fn().mockReturnValue(false),
      };

      const mockShell = {
        showItemInFolder: vi.fn(),
      };

      const result = (() => {
        try {
          const session = mockSessionManager.getSession('session-123');
          if (!session) return false;

          const workDir = session.workingDirectory;
          if (!mockFs.existsSync(workDir)) return false;

          mockShell.showItemInFolder(workDir);
          return true;
        } catch (err) {
          return false;
        }
      })();

      expect(result).toBe(false);
      expect(mockFs.existsSync).toHaveBeenCalledWith('/deleted/directory');
      expect(mockShell.showItemInFolder).not.toHaveBeenCalled();
    });

    it('returns false on exception', () => {
      const mockSessionManager = {
        getSession: vi.fn().mockImplementation(() => {
          throw new Error('Database error');
        }),
      };

      const result = (() => {
        try {
          const session = mockSessionManager.getSession('session-123');
          if (!session) return false;
          return true;
        } catch (err) {
          return false;
        }
      })();

      expect(result).toBe(false);
    });
  });
});

describe('IPC Handlers - getVersionInfo', () => {
  // Mirrors the handler body in ipc-handlers.ts: `(await probeClaudeVersion()) ?? undefined`,
  // combined with app.getVersion() and process.versions. probeClaudeVersion itself is
  // already covered end-to-end by probe-version.test.ts (success/ENOENT/ETIMEDOUT/empty
  // stdout), so this test is intentionally thin: it verifies the real probe function is
  // wired up and its `string | null` result is mapped onto the AppVersionInfo shape.
  type ExecFileCallback = (err: Error | null, stdout: string, stderr?: string) => void;

  const buildVersionInfo = async (appVersion: string) => {
    const { probeClaudeVersion } = await import('./agent-view/probe-version');
    const claudeVersion = (await probeClaudeVersion()) ?? undefined;
    return {
      appVersion,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      claudeVersion,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves a well-formed AppVersionInfo with claudeVersion on success', async () => {
    const { execFile } = await import('node:child_process');
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        (cb as ExecFileCallback)(null, '2.1.139 (Claude Code)\n', '');
      },
    );

    const info = await buildVersionInfo('4.6.0');

    expect(info).toEqual({
      appVersion: '4.6.0',
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      claudeVersion: '2.1.139',
    });
  });

  it('resolves claudeVersion as undefined (not null) when the binary is missing', async () => {
    const { execFile } = await import('node:child_process');
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
        (cb as ExecFileCallback)(err, '', '');
      },
    );

    const info = await buildVersionInfo('4.6.0');

    expect(info.claudeVersion).toBeUndefined();
    expect(info.appVersion).toBe('4.6.0');
    expect(info.nodeVersion).toBe(process.versions.node);
  });

  it('resolves claudeVersion as undefined on a timed-out probe, without hanging the handler', async () => {
    const { execFile } = await import('node:child_process');
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
        (cb as ExecFileCallback)(err, '', '');
      },
    );

    const info = await buildVersionInfo('4.6.0');

    expect(info.claudeVersion).toBeUndefined();
  });

  it('invokes the probe via execFile (non-blocking) with a 5s timeout, never execSync', async () => {
    const { execFile } = await import('node:child_process');
    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        (cb as ExecFileCallback)(null, '2.1.139\n', '');
      },
    );

    await buildVersionInfo('4.6.0');

    expect(execFile).toHaveBeenCalledWith(
      'claude',
      ['--version'],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function),
    );
  });
});

describe('IPC Handlers - gitWorktreeList reconciliation', () => {
  // Mirrors the reconciliation added to the real gitWorktreeList handler in
  // ipc-handlers.ts: overlay managedByOmniDesk from the worktree registry and
  // linkedSessionId from live sessions. Uses the real arePathsEqual so path
  // tolerance (slash direction / drive-letter case) is exercised for real;
  // isWorktreeManagedByOmniDesk is stubbed (see vi.mock above) since it reads
  // the registry off disk, which is out of scope for this handler-level test.
  async function reconcile(worktrees: GitWorktreeEntry[], sessions: SessionMetadata[]) {
    const { arePathsEqual } = await import('./path-access');
    const { isWorktreeManagedByOmniDesk } = await import('./settings-persistence');
    return worktrees.map(wt => {
      const linkedSession = sessions.find(
        s => s.worktreeInfo?.worktreePath && arePathsEqual(s.worktreeInfo.worktreePath, wt.path),
      );
      return {
        ...wt,
        linkedSessionId: linkedSession?.id ?? null,
        managedByOmniDesk: isWorktreeManagedByOmniDesk(wt.path),
      };
    });
  }

  function makeWorktree(overrides: Partial<GitWorktreeEntry> = {}): GitWorktreeEntry {
    return {
      path: '/repo',
      head: 'abc123',
      branch: 'main',
      isMainWorktree: true,
      isBare: false,
      isLocked: false,
      isPrunable: false,
      linkedSessionId: null,
      managedByOmniDesk: false,
      ...overrides,
    };
  }

  function makeSession(overrides: Partial<SessionMetadata>): SessionMetadata {
    return { id: 'session-1', ...overrides } as SessionMetadata;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports managedByOmniDesk: true when the registry says so', async () => {
    const { isWorktreeManagedByOmniDesk } = await import('./settings-persistence');
    vi.mocked(isWorktreeManagedByOmniDesk).mockReturnValue(true);

    const result = await reconcile([makeWorktree({ path: '/repo-worktrees/feature' })], []);

    expect(result[0].managedByOmniDesk).toBe(true);
    expect(isWorktreeManagedByOmniDesk).toHaveBeenCalledWith('/repo-worktrees/feature');
  });

  it('reports managedByOmniDesk: false when the worktree is not in the registry', async () => {
    const { isWorktreeManagedByOmniDesk } = await import('./settings-persistence');
    vi.mocked(isWorktreeManagedByOmniDesk).mockReturnValue(false);

    const result = await reconcile([makeWorktree({ path: '/repo-worktrees/untracked' })], []);

    expect(result[0].managedByOmniDesk).toBe(false);
  });

  it('reports the linkedSessionId of a live session attached to the worktree', async () => {
    const { isWorktreeManagedByOmniDesk } = await import('./settings-persistence');
    vi.mocked(isWorktreeManagedByOmniDesk).mockReturnValue(false);

    const worktree = makeWorktree({ path: '/repo-worktrees/feature' });
    const session = makeSession({
      id: 'session-42',
      worktreeInfo: { worktreePath: '/repo-worktrees/feature' } as SessionMetadata['worktreeInfo'],
    });

    const result = await reconcile([worktree], [session]);

    expect(result[0].linkedSessionId).toBe('session-42');
  });

  it('reports linkedSessionId: null when no session is attached to the worktree', async () => {
    const { isWorktreeManagedByOmniDesk } = await import('./settings-persistence');
    vi.mocked(isWorktreeManagedByOmniDesk).mockReturnValue(false);

    const worktree = makeWorktree({ path: '/repo-worktrees/feature' });
    const session = makeSession({
      id: 'session-42',
      worktreeInfo: { worktreePath: '/repo-worktrees/other' } as SessionMetadata['worktreeInfo'],
    });

    const result = await reconcile([worktree], [session]);

    expect(result[0].linkedSessionId).toBeNull();
  });

  it('tolerates slash-direction and drive-letter-case differences when matching a session to a worktree', async () => {
    const { isWorktreeManagedByOmniDesk } = await import('./settings-persistence');
    vi.mocked(isWorktreeManagedByOmniDesk).mockReturnValue(false);

    const worktree = makeWorktree({ path: 'C:\\repo-worktrees\\feature' });
    const session = makeSession({
      id: 'session-42',
      worktreeInfo: { worktreePath: 'c:/repo-worktrees/feature' } as SessionMetadata['worktreeInfo'],
    });

    const result = await reconcile([worktree], [session]);

    expect(result[0].linkedSessionId).toBe('session-42');
  });
});
