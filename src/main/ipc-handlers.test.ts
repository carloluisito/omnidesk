import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GitWorktreeEntry } from '../shared/types/git-types';
import type { SessionMetadata } from '../shared/ipc-types';

// revealSessionInExplorer (extracted from the real revealInExplorer registry
// handler) calls electron's shell.showItemInFolder and node's fs.existsSync.
// Mock both so the test drives production code instead of a hand-copied
// reimplementation of the handler's control flow.
vi.mock('electron', () => ({
  shell: { showItemInFolder: vi.fn(), openExternal: vi.fn() },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when directory exists and showItemInFolder is called', async () => {
    const { revealSessionInExplorer } = await import('./ipc-handlers');
    const { shell } = await import('electron');
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const mockSessionManager = {
      getSession: vi.fn().mockReturnValue({ workingDirectory: '/home/user/project' }),
    };

    const result = await revealSessionInExplorer(mockSessionManager as any, 'session-123');

    expect(result).toBe(true);
    expect(mockSessionManager.getSession).toHaveBeenCalledWith('session-123');
    expect(fs.existsSync).toHaveBeenCalledWith('/home/user/project');
    expect(shell.showItemInFolder).toHaveBeenCalledWith('/home/user/project');
  });

  it('returns false when session not found', async () => {
    const { revealSessionInExplorer } = await import('./ipc-handlers');
    const { shell } = await import('electron');

    const mockSessionManager = {
      getSession: vi.fn().mockReturnValue(null),
    };

    const result = await revealSessionInExplorer(mockSessionManager as any, 'nonexistent');

    expect(result).toBe(false);
    expect(mockSessionManager.getSession).toHaveBeenCalledWith('nonexistent');
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
  });

  it('returns false when directory does not exist', async () => {
    const { revealSessionInExplorer } = await import('./ipc-handlers');
    const { shell } = await import('electron');
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const mockSessionManager = {
      getSession: vi.fn().mockReturnValue({ workingDirectory: '/deleted/directory' }),
    };

    const result = await revealSessionInExplorer(mockSessionManager as any, 'session-123');

    expect(result).toBe(false);
    expect(fs.existsSync).toHaveBeenCalledWith('/deleted/directory');
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
  });

  it('returns false on exception', async () => {
    const { revealSessionInExplorer } = await import('./ipc-handlers');
    const { shell } = await import('electron');

    const mockSessionManager = {
      getSession: vi.fn().mockImplementation(() => {
        throw new Error('Database error');
      }),
    };

    const result = await revealSessionInExplorer(mockSessionManager as any, 'session-123');

    expect(result).toBe(false);
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
  });
});

describe('IPC Handlers - openExternal', () => {
  // openExternalUrl (extracted from the real openExternal registry handler)
  // narrows the allowed-scheme check to http/https only — file:// and any
  // other scheme (e.g. javascript:) must be rejected before shell.openExternal
  // is ever called, matching Electron's guidance against passing untrusted
  // schemes to shell.openExternal (issue #162).
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens an http:// URL and returns true', async () => {
    const { openExternalUrl } = await import('./ipc-handlers');
    const { shell } = await import('electron');

    const result = await openExternalUrl('http://example.com');

    expect(result).toBe(true);
    expect(shell.openExternal).toHaveBeenCalledWith('http://example.com');
  });

  it('opens an https:// URL and returns true', async () => {
    const { openExternalUrl } = await import('./ipc-handlers');
    const { shell } = await import('electron');

    const result = await openExternalUrl('https://example.com/pr/123');

    expect(result).toBe(true);
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com/pr/123');
  });

  it('blocks a file:// URL and does not call shell.openExternal', async () => {
    const { openExternalUrl } = await import('./ipc-handlers');
    const { shell } = await import('electron');

    const result = await openExternalUrl('file:///C:/Windows/System32/calc.exe');

    expect(result).toBe(false);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('blocks an arbitrary non-http scheme (e.g. javascript:) and does not call shell.openExternal', async () => {
    const { openExternalUrl } = await import('./ipc-handlers');
    const { shell } = await import('electron');

    const result = await openExternalUrl('javascript:alert(1)');

    expect(result).toBe(false);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
});

describe('IPC Handlers - exportHistoryMarkdown / exportHistoryJson', () => {
  // exportHistoryMarkdownGated/exportHistoryJsonGated (extracted from the real
  // exportHistoryMarkdown/exportHistoryJson registry handlers) must gate
  // outputPath through the same home/workspaces/approved-picked-root
  // allowlist as writeFile/listSubdirectories/listGitRepos, rather than
  // handing an arbitrary renderer-supplied path straight to HistoryManager
  // (issue #163). isPathAllowedFn below is the real isPathAllowed from
  // ./path-access, not a hand-copied reimplementation.
  const homeDir = '/mock/home';
  const workspaces = ['/mock/workspace'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exportHistoryMarkdown blocks a path outside home/workspaces (forward slashes)', async () => {
    const { exportHistoryMarkdownGated } = await import('./ipc-handlers');
    const { isPathAllowed } = await import('./path-access');
    const historyManager = { exportMarkdown: vi.fn() };
    const isPathAllowedFn = (resolved: string) => isPathAllowed(resolved, homeDir, workspaces);

    const result = await exportHistoryMarkdownGated(
      historyManager as never,
      isPathAllowedFn,
      'session-1',
      '/etc/passwd',
    );

    expect(result).toBe(false);
    expect(historyManager.exportMarkdown).not.toHaveBeenCalled();
  });

  it('exportHistoryMarkdown blocks a path outside home/workspaces (Windows-style)', async () => {
    const { exportHistoryMarkdownGated } = await import('./ipc-handlers');
    const { isPathAllowed } = await import('./path-access');
    const historyManager = { exportMarkdown: vi.fn() };
    const isPathAllowedFn = (resolved: string) => isPathAllowed(resolved, homeDir, workspaces);

    const result = await exportHistoryMarkdownGated(
      historyManager as never,
      isPathAllowedFn,
      'session-1',
      'C:\\Windows\\System32\\evil.md',
    );

    expect(result).toBe(false);
    expect(historyManager.exportMarkdown).not.toHaveBeenCalled();
  });

  it('exportHistoryMarkdown exports when outputPath is under home', async () => {
    const path = await import('path');
    const { exportHistoryMarkdownGated } = await import('./ipc-handlers');
    const { isPathAllowed } = await import('./path-access');
    const historyManager = { exportMarkdown: vi.fn().mockResolvedValue(true) };
    const isPathAllowedFn = (resolved: string) => isPathAllowed(resolved, homeDir, workspaces);
    const inputPath = '/mock/home/exports/session-1.md';

    const result = await exportHistoryMarkdownGated(
      historyManager as never,
      isPathAllowedFn,
      'session-1',
      inputPath,
    );

    expect(result).toBe(true);
    // Compare against path.resolve() of the same input rather than a hardcoded
    // literal — path.resolve() drive-letter-prefixes and backslash-separates
    // Unix-style inputs when tests run on Windows.
    expect(historyManager.exportMarkdown).toHaveBeenCalledWith(
      'session-1',
      path.resolve(inputPath),
    );
  });

  it('exportHistoryJson blocks a path outside home/workspaces (forward slashes)', async () => {
    const { exportHistoryJsonGated } = await import('./ipc-handlers');
    const { isPathAllowed } = await import('./path-access');
    const historyManager = { exportJson: vi.fn() };
    const isPathAllowedFn = (resolved: string) => isPathAllowed(resolved, homeDir, workspaces);

    const result = await exportHistoryJsonGated(
      historyManager as never,
      isPathAllowedFn,
      'session-1',
      '/etc/passwd',
    );

    expect(result).toBe(false);
    expect(historyManager.exportJson).not.toHaveBeenCalled();
  });

  it('exportHistoryJson blocks a path outside home/workspaces (Windows-style)', async () => {
    const { exportHistoryJsonGated } = await import('./ipc-handlers');
    const { isPathAllowed } = await import('./path-access');
    const historyManager = { exportJson: vi.fn() };
    const isPathAllowedFn = (resolved: string) => isPathAllowed(resolved, homeDir, workspaces);

    const result = await exportHistoryJsonGated(
      historyManager as never,
      isPathAllowedFn,
      'session-1',
      'C:\\Windows\\System32\\evil.json',
    );

    expect(result).toBe(false);
    expect(historyManager.exportJson).not.toHaveBeenCalled();
  });

  it('exportHistoryJson exports when outputPath is under a registered workspace', async () => {
    const path = await import('path');
    const { exportHistoryJsonGated } = await import('./ipc-handlers');
    const { isPathAllowed } = await import('./path-access');
    const historyManager = { exportJson: vi.fn().mockResolvedValue(true) };
    const isPathAllowedFn = (resolved: string) => isPathAllowed(resolved, homeDir, workspaces);
    const inputPath = '/mock/workspace/exports/session-1.json';

    const result = await exportHistoryJsonGated(
      historyManager as never,
      isPathAllowedFn,
      'session-1',
      inputPath,
    );

    expect(result).toBe(true);
    // Compare against path.resolve() of the same input rather than a hardcoded
    // literal — see the exportHistoryMarkdown "under home" test above.
    expect(historyManager.exportJson).toHaveBeenCalledWith(
      'session-1',
      path.resolve(inputPath),
    );
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

  it.skipIf(process.platform !== 'win32')('tolerates slash-direction and drive-letter-case differences when matching a session to a worktree', async () => {
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

describe('IPC Handlers - listGitRepos', () => {
  // readGitBranch/listGitReposImpl (extracted from the real listGitRepos
  // registry handler) parse .git entries — a directory for a regular repo, a
  // `gitdir: <path>` pointer file for a linked worktree — to derive a branch
  // label (issue #201). isPathAllowedFn below is the real isPathAllowed from
  // ./path-access, not a hand-copied reimplementation (see the
  // exportHistoryMarkdown tests above for the same rationale).
  const homeDir = '/mock/home';
  const workspaces = ['/mock/workspace'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listGitReposImpl path gate', () => {
    it('blocks a parentPath outside home/workspaces and never reads the directory', async () => {
      const { listGitReposImpl } = await import('./ipc-handlers');
      const { isPathAllowed } = await import('./path-access');
      const fs = await import('fs');
      const isPathAllowedFn = (resolved: string) => isPathAllowed(resolved, homeDir, workspaces);

      const result = listGitReposImpl('/etc', isPathAllowedFn);

      expect(result).toEqual([]);
      expect(fs.readdirSync).not.toHaveBeenCalled();
    });

    it('lists repos under an allowed workspace path', async () => {
      const path = await import('path');
      const { listGitReposImpl } = await import('./ipc-handlers');
      const { isPathAllowed } = await import('./path-access');
      const fs = await import('fs');
      const isPathAllowedFn = (resolved: string) => isPathAllowed(resolved, homeDir, workspaces);
      const resolvedWorkspace = path.resolve('/mock/workspace');

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const resolved = String(p);
        return resolved === path.join(resolvedWorkspace, 'repo-a', '.git');
      });
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'repo-a', isDirectory: () => true },
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('not reached for this test');
      });

      const result = listGitReposImpl('/mock/workspace', isPathAllowedFn);

      expect(result).toEqual([
        {
          name: 'repo-a',
          path: path.join(resolvedWorkspace, 'repo-a'),
          workspacePath: resolvedWorkspace,
          branch: undefined,
        },
      ]);
    });
  });

  describe('listGitReposImpl enumeration contract', () => {
    it('includes the workspace itself when it is a repo, skips dot-dirs and non-repo dirs, and sorts by name', async () => {
      const path = await import('path');
      const { listGitReposImpl } = await import('./ipc-handlers');
      const { isPathAllowed } = await import('./path-access');
      const fs = await import('fs');
      const isPathAllowedFn = (resolved: string) => isPathAllowed(resolved, homeDir, workspaces);
      const resolvedWorkspace = path.resolve('/mock/workspace');

      const gitPaths = new Set([
        path.join(resolvedWorkspace, '.git'),
        path.join(resolvedWorkspace, 'zebra', '.git'),
        path.join(resolvedWorkspace, 'alpha', '.git'),
      ]);
      vi.mocked(fs.existsSync).mockImplementation((p) => gitPaths.has(String(p)));
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'zebra', isDirectory: () => true },
        { name: '.hidden', isDirectory: () => true },
        { name: 'alpha', isDirectory: () => true },
        { name: 'not-a-repo', isDirectory: () => true },
        { name: 'a-file', isDirectory: () => false },
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('branch resolution not under test here');
      });

      const result = listGitReposImpl('/mock/workspace', isPathAllowedFn);

      // Sorted alphabetically by name, including the workspace-itself entry
      // (its name is the workspace's own basename, so it sorts alongside
      // "alpha" and "zebra" rather than always being first).
      expect(result.map((r) => r.name)).toEqual(
        [path.basename(resolvedWorkspace), 'alpha', 'zebra'].sort((a, b) => a.localeCompare(b)),
      );
      expect(result.every((r) => r.workspacePath === resolvedWorkspace)).toBe(true);
    });

    it('returns the repos collected so far if readdirSync throws', async () => {
      const path = await import('path');
      const { listGitReposImpl } = await import('./ipc-handlers');
      const { isPathAllowed } = await import('./path-access');
      const fs = await import('fs');
      const isPathAllowedFn = (resolved: string) => isPathAllowed(resolved, homeDir, workspaces);
      const resolvedWorkspace = path.resolve('/mock/workspace');

      vi.mocked(fs.existsSync).mockImplementation(
        (p) => String(p) === path.join(resolvedWorkspace, '.git'),
      );
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('permission denied');
      });
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('branch resolution not under test here');
      });

      const result = listGitReposImpl('/mock/workspace', isPathAllowedFn);

      expect(result.map((r) => r.name)).toEqual([path.basename(resolvedWorkspace)]);
    });
  });

  describe('readGitBranch', () => {
    it('reads the branch from a regular .git directory on refs/heads', async () => {
      const { readGitBranch } = await import('./ipc-handlers');
      const fs = await import('fs');

      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<
        typeof fs.statSync
      >);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('ref: refs/heads/main\n');

      const result = readGitBranch('/mock/workspace/repo-a/.git');

      expect(result).toBe('main');
    });

    it('falls back to a 7-char short SHA for a detached HEAD', async () => {
      const { readGitBranch } = await import('./ipc-handlers');
      const fs = await import('fs');

      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<
        typeof fs.statSync
      >);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('abcdef1234567890\n');

      const result = readGitBranch('/mock/workspace/repo-a/.git');

      expect(result).toBe('abcdef1');
    });

    it('resolves a worktree .git file with a relative gitdir pointer', async () => {
      const path = await import('path');
      const { readGitBranch } = await import('./ipc-handlers');
      const fs = await import('fs');
      // The .git entry for a worktree checkout, e.g.
      // /mock/workspace/feature-worktree/.git
      const worktreeGitFile = '/mock/workspace/feature-worktree/.git';
      const expectedHead = path.join(
        path.resolve(path.dirname(worktreeGitFile), '../main-repo/.git/worktrees/feature'),
        'HEAD',
      );

      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as ReturnType<
        typeof fs.statSync
      >);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p) === worktreeGitFile) {
          return 'gitdir: ../main-repo/.git/worktrees/feature\n';
        }
        if (String(p) === expectedHead) {
          return 'ref: refs/heads/feature-branch\n';
        }
        throw new Error(`unexpected readFileSync(${String(p)})`);
      });
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === expectedHead);

      const result = readGitBranch(worktreeGitFile);

      expect(result).toBe('feature-branch');
    });

    it('resolves a worktree .git file with an absolute gitdir pointer', async () => {
      const path = await import('path');
      const { readGitBranch } = await import('./ipc-handlers');
      const fs = await import('fs');
      const worktreeGitFile = '/mock/workspace/feature-worktree/.git';
      const absoluteGitDir = path.resolve('/mock/workspace/main-repo/.git/worktrees/feature');
      const expectedHead = path.join(absoluteGitDir, 'HEAD');

      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as ReturnType<
        typeof fs.statSync
      >);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p) === worktreeGitFile) {
          return `gitdir: ${absoluteGitDir}\n`;
        }
        if (String(p) === expectedHead) {
          return 'ref: refs/heads/feature-branch\n';
        }
        throw new Error(`unexpected readFileSync(${String(p)})`);
      });
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === expectedHead);

      const result = readGitBranch(worktreeGitFile);

      expect(result).toBe('feature-branch');
    });

    it('returns undefined when the .git file pointer does not match the gitdir: pattern', async () => {
      const { readGitBranch } = await import('./ipc-handlers');
      const fs = await import('fs');

      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as ReturnType<
        typeof fs.statSync
      >);
      vi.mocked(fs.readFileSync).mockReturnValue('not a gitdir pointer\n');

      const result = readGitBranch('/mock/workspace/feature-worktree/.git');

      expect(result).toBeUndefined();
    });

    it('returns undefined when the resolved HEAD file does not exist', async () => {
      const { readGitBranch } = await import('./ipc-handlers');
      const fs = await import('fs');

      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<
        typeof fs.statSync
      >);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = readGitBranch('/mock/workspace/repo-a/.git');

      expect(result).toBeUndefined();
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('returns undefined when statSync throws', async () => {
      const { readGitBranch } = await import('./ipc-handlers');
      const fs = await import('fs');

      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = readGitBranch('/mock/workspace/repo-a/.git');

      expect(result).toBeUndefined();
    });
  });
});
