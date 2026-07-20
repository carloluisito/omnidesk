/**
 * Boundary tests for the createSession IPC handler — verifies the REAL
 * setupIPCHandlers registration (not a re-implementation). createSession is
 * reachable over the unauthenticated-by-path remote WS bridge, so it must
 * gate the effective working directory behind the same isPathAllowed
 * allowlist as writeFile/listSubdirectories/listGitRepos, rather than
 * blindly handing an arbitrary path to sessionManager.createSession.
 *
 * See issue #115.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _resetApprovedRoots, approvePickedRoot } from './path-access';

const handleSpy = vi.fn();
const onSpy = vi.fn();

vi.mock('./ipc-registry', () => ({
  IPCRegistry: class {
    handle = handleSpy;
    on = onSpy;
  },
}));

import { setupIPCHandlers } from './ipc-handlers';

type Handler = (...args: unknown[]) => Promise<unknown>;

function getHandler(name: string): Handler {
  const call = handleSpy.mock.calls.find((c) => c[0] === name);
  if (!call) throw new Error(`handler not registered: ${name}`);
  return call[1] as Handler;
}

describe('createSession IPC handler — path allowlist', () => {
  // test/setup-main.ts mocks electron's app.getPath('home') to '/mock/home'.
  const sessionManager = {
    setMainWindow: vi.fn(),
    createSession: vi.fn(async (req: unknown) => ({ id: 'sess-1', ...(req as object) })),
  };
  const settingsManager = {
    getWorkspaces: vi.fn(() => [{ path: '/mock/workspace' }]),
  };
  const checkpointManager = { setMainWindow: vi.fn() };

  beforeEach(() => {
    handleSpy.mockClear();
    sessionManager.createSession.mockClear();
    _resetApprovedRoots();
    setupIPCHandlers(
      {} as never, // mainWindow
      sessionManager as never,
      settingsManager as never,
      {} as never, // historyManager
      checkpointManager as never,
      {} as never, // sessionPool
      {} as never, // gitManager
      {} as never, // providerRegistry
      {} as never, // remoteAuth
      {} as never, // sttManager
      {} as never, // integrationManager
      {} as never, // githubService
    );
  });

  it('rejects a workingDirectory outside home/workspaces/approved roots', async () => {
    await expect(
      getHandler('createSession')({}, {
        workingDirectory: 'C:\\Windows\\System32',
        permissionMode: 'standard',
      }),
    ).rejects.toThrow('Working directory not allowed');
    expect(sessionManager.createSession).not.toHaveBeenCalled();
  });

  it('accepts a workingDirectory under the home directory', async () => {
    await getHandler('createSession')({}, {
      workingDirectory: '/mock/home/projects/foo',
      permissionMode: 'standard',
    });
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);
  });

  it('accepts a workingDirectory under a registered workspace', async () => {
    await getHandler('createSession')({}, {
      workingDirectory: '/mock/workspace/sub-project',
      permissionMode: 'standard',
    });
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);
  });

  it('accepts a workingDirectory under a user-approved picked root', async () => {
    approvePickedRoot('/some/picked/root');
    await getHandler('createSession')({}, {
      workingDirectory: '/some/picked/root/nested',
      permissionMode: 'standard',
    });
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);
  });

  it('defaults to the home directory and succeeds when workingDirectory is empty', async () => {
    await getHandler('createSession')({}, {
      workingDirectory: '',
      permissionMode: 'standard',
    });
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);
  });

  it('validates worktree.mainRepoPath rather than the eventual worktree path', async () => {
    await getHandler('createSession')({}, {
      workingDirectory: '/mock/home/repo',
      permissionMode: 'standard',
      worktree: {
        mainRepoPath: '/mock/home/repo',
        branch: 'feature',
        isNewBranch: true,
      },
    });
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);
  });

  it('rejects a worktree request whose mainRepoPath is outside the allowlist', async () => {
    await expect(
      getHandler('createSession')({}, {
        workingDirectory: '/mock/home/repo',
        permissionMode: 'standard',
        worktree: {
          mainRepoPath: 'C:\\Windows\\System32',
          branch: 'feature',
          isNewBranch: true,
        },
      }),
    ).rejects.toThrow('Working directory not allowed');
    expect(sessionManager.createSession).not.toHaveBeenCalled();
  });
});
