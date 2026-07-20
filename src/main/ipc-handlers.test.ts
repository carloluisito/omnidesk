import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// getVersionInfo delegates to probeClaudeVersion (execFile with a 5s timeout)
// instead of the old blocking execSync. Mock child_process the same way
// probe-version.test.ts does so we exercise the real probe function.
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
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
