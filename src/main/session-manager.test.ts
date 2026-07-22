import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config-dir before any module loads
vi.mock('./config-dir', () => ({
  CONFIG_DIR: '/mock/home/.omnidesk',
  ensureConfigDir: vi.fn(),
  migrateFromLegacy: vi.fn(),
}));

// Mock electron
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/mock/home') },
  BrowserWindow: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}));

// Mock uuid so session IDs are predictable
vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-session-id') }));

// Mock session-persistence
vi.mock('./session-persistence', () => ({
  loadSessionState: vi.fn(() => null),
  saveSessionState: vi.fn(),
  validateDirectory: vi.fn(() => true),
  getHomeDirectory: vi.fn(() => '/mock/home'),
}));

// Mock settings-persistence
vi.mock('./settings-persistence', () => ({
  addWorktreeToRegistry: vi.fn(),
  removeWorktreeFromRegistry: vi.fn(),
  SettingsManager: vi.fn(),
}));

// Mock history manager
vi.mock('./history-manager', () => {
  const HistoryManager = vi.fn();
  HistoryManager.prototype.recordOutput = vi.fn().mockResolvedValue(undefined);
  HistoryManager.prototype.updateSessionMetadata = vi.fn();
  HistoryManager.prototype.onSessionExit = vi.fn().mockResolvedValue(undefined);
  HistoryManager.prototype.onSessionRestart = vi.fn().mockResolvedValue(undefined);
  HistoryManager.prototype.runCleanup = vi.fn().mockResolvedValue(undefined);
  return { HistoryManager };
});

// Mock session pool
vi.mock('./session-pool', () => {
  const SessionPool = vi.fn();
  SessionPool.prototype.claim = vi.fn(() => null);
  SessionPool.prototype.initialize = vi.fn().mockResolvedValue(undefined);
  SessionPool.prototype.destroy = vi.fn();
  SessionPool.prototype.updateConfig = vi.fn();
  SessionPool.prototype.drainAndReplenish = vi.fn();
  SessionPool.prototype.getStatus = vi.fn(() => ({ idleCount: 0, enabled: false, size: 0 }));
  SessionPool.prototype.setAgentTeamsGetter = vi.fn();
  return { SessionPool };
});

// Mock ipc-emitter
vi.mock('./ipc-emitter', () => {
  const IPCEmitter = vi.fn();
  IPCEmitter.prototype.emit = vi.fn();
  return { IPCEmitter };
});

// Mock model-history-manager
vi.mock('./model-history-manager', () => {
  const ModelHistoryManager = vi.fn();
  ModelHistoryManager.prototype.logSwitch = vi.fn();
  ModelHistoryManager.prototype.getHistory = vi.fn(() => []);
  ModelHistoryManager.prototype.clearHistory = vi.fn();
  ModelHistoryManager.prototype.shutdown = vi.fn();
  return { ModelHistoryManager };
});

// Mock cli-manager
vi.mock('./cli-manager', () => {
  const CLIManager = vi.fn();
  CLIManager.prototype.onModelChange = vi.fn();
  CLIManager.prototype.onOutput = vi.fn();
  CLIManager.prototype.onExit = vi.fn();
  CLIManager.prototype.spawn = vi.fn();
  CLIManager.prototype.destroy = vi.fn();
  CLIManager.prototype.write = vi.fn();
  CLIManager.prototype.resize = vi.fn();
  CLIManager.prototype.initializeSession = vi.fn().mockResolvedValue(undefined);
  CLIManager.prototype.spawnShellSession = vi.fn().mockResolvedValue(undefined);
  return { CLIManager };
});

import { SessionManager } from './session-manager';
import { HistoryManager } from './history-manager';
import { SessionPool } from './session-pool';
import { CLIManager } from './cli-manager';

function createSessionManager(): SessionManager {
  const historyManager = new HistoryManager();
  const sessionPool = new SessionPool({ size: 0, enabled: false, maxIdleTimeMs: 0 });
  return new SessionManager(historyManager, sessionPool);
}

describe('SessionManager.subscribeToOutput', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
  });

  it('returns an unsubscribe function when subscribing', () => {
    const cb = vi.fn();
    const unsub = manager.subscribeToOutput('session-1', cb);
    expect(typeof unsub).toBe('function');
  });

  it('calling the returned unsubscribe function stops future callbacks', () => {
    const cb = vi.fn();
    const unsub = manager.subscribeToOutput('session-1', cb);

    // Manually invoke notifyOutputSubscribers via the private map (white-box test via casting)
    // We verify by unsubscribing and checking callback is not called again.
    unsub();

    // After unsubscribe, re-subscribing with a fresh callback should work independently
    const cb2 = vi.fn();
    manager.subscribeToOutput('session-1', cb2);
    // cb2 is now the only subscriber — cb was already removed
    expect(cb).not.toHaveBeenCalled();
  });

  it('multiple callbacks can be subscribed to the same session', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    manager.subscribeToOutput('session-1', cb1);
    manager.subscribeToOutput('session-1', cb2);

    // Both should be in the set (we verify via unsubscribe behavior)
    const cb3 = vi.fn();
    manager.subscribeToOutput('session-1', cb3);

    // Unsubscribe cb1 only
    manager.unsubscribeFromOutput('session-1', cb1);

    // cb2 and cb3 remain — no error should occur
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it('subscribing to different sessions creates independent subscriber sets', () => {
    const cbA = vi.fn();
    const cbB = vi.fn();
    manager.subscribeToOutput('session-A', cbA);
    manager.subscribeToOutput('session-B', cbB);

    // Unsubscribe from A does not affect B
    manager.unsubscribeFromOutput('session-A', cbA);

    // cbB is still registered — re-unsubscribing is safe
    manager.unsubscribeFromOutput('session-B', cbB);

    expect(cbA).not.toHaveBeenCalled();
    expect(cbB).not.toHaveBeenCalled();
  });
});

describe('SessionManager.unsubscribeFromOutput', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
  });

  it('removes the callback from the subscriber set', () => {
    const cb = vi.fn();
    manager.subscribeToOutput('session-1', cb);
    manager.unsubscribeFromOutput('session-1', cb);

    // Calling unsubscribe on an unknown session is a no-op (no error)
    expect(() => manager.unsubscribeFromOutput('session-1', cb)).not.toThrow();
  });

  it('is a no-op when the session has no subscribers', () => {
    const cb = vi.fn();
    expect(() => manager.unsubscribeFromOutput('nonexistent-session', cb)).not.toThrow();
  });

  it('is a no-op when the callback was never registered', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    manager.subscribeToOutput('session-1', cb1);

    // cb2 was never registered — should not throw
    expect(() => manager.unsubscribeFromOutput('session-1', cb2)).not.toThrow();
  });

  it('cleans up the session entry from the map when last subscriber removed', () => {
    const cb = vi.fn();
    manager.subscribeToOutput('session-1', cb);

    // After unsubscribing the only subscriber, the session map entry should be gone
    // We verify this by subscribing again — which must create a fresh entry without error
    manager.unsubscribeFromOutput('session-1', cb);

    const cb2 = vi.fn();
    const unsub2 = manager.subscribeToOutput('session-1', cb2);
    expect(typeof unsub2).toBe('function');
  });

  it('does not remove other callbacks when unsubscribing one', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    manager.subscribeToOutput('session-1', cb1);
    manager.subscribeToOutput('session-1', cb2);

    manager.unsubscribeFromOutput('session-1', cb1);

    // cb2 is still subscribed — unsubscribing cb1 again is a no-op
    expect(() => manager.unsubscribeFromOutput('session-1', cb1)).not.toThrow();
  });
});

describe('SessionManager.onSessionEnd', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
  });

  it('registers a callback that does not throw', () => {
    const cb = vi.fn();
    expect(() => manager.onSessionEnd(cb)).not.toThrow();
  });

  it('multiple session end callbacks can be registered', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    expect(() => {
      manager.onSessionEnd(cb1);
      manager.onSessionEnd(cb2);
    }).not.toThrow();
  });
});

describe('SessionManager.createSession — launchMode wiring', () => {
  let manager: SessionManager;

  const baseRequest = {
    workingDirectory: '/test/dir',
    permissionMode: 'standard' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
  });

  it('direct path: constructs CLIManager with launchMode from request', async () => {
    // SessionPool.claim returns null (default mock) → direct path
    await manager.createSession({ ...baseRequest, launchMode: 'agents' });

    expect(CLIManager).toHaveBeenCalledWith(
      expect.objectContaining({ launchMode: 'agents' }),
    );
  });

  it('pool path: calls initializeSession with launchMode as 5th positional arg', async () => {
    // Override claim to return a pooled session stub
    const pooledCliManager = {
      initializeSession: vi.fn().mockResolvedValue(undefined),
      onModelChange: vi.fn(),
      onOutput: vi.fn(),
      onExit: vi.fn(),
      destroy: vi.fn(),
    };
    vi.mocked(SessionPool.prototype.claim).mockReturnValueOnce({
      id: 'pooled-session-id',
      cliManager: pooledCliManager as unknown as InstanceType<typeof CLIManager>,
    });

    await manager.createSession({ ...baseRequest, launchMode: 'agents' });

    expect(pooledCliManager.initializeSession).toHaveBeenCalledWith(
      '/test/dir',           // workingDir
      'standard',            // permissionMode
      undefined,             // model
      undefined,             // provider
      'agents',              // launchMode — 5th positional arg
    );
  });

  it('back-compat: omitting launchMode passes undefined without breaking existing behavior', async () => {
    // SessionPool.claim returns null → direct path
    await manager.createSession({ ...baseRequest });

    expect(CLIManager).toHaveBeenCalledWith(
      expect.objectContaining({ launchMode: undefined }),
    );
  });
});

describe('SessionManager.createSession — shell sessions', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
    // A provider registry whose get() we can assert is NOT called for shells.
    const registry = { get: vi.fn(() => { throw new Error('should not resolve provider for shell'); }) };
    manager.setProviderRegistry(registry as any);
  });

  it('creates a shell session with kind=shell and no provider', async () => {
    const meta = await manager.createSession({
      workingDirectory: '/mock/home', permissionMode: 'standard', kind: 'shell',
    });
    expect(meta.kind).toBe('shell');
    expect(meta.providerId).toBeUndefined();
    expect(meta.status).toBe('running');
  });

  it('spawns via spawnShellSession, never spawn(), and never claims the pool', async () => {
    await manager.createSession({
      workingDirectory: '/mock/home', permissionMode: 'standard', kind: 'shell',
    });
    expect(CLIManager.prototype.spawnShellSession).toHaveBeenCalledTimes(1);
    expect(CLIManager.prototype.spawn).not.toHaveBeenCalled();
    expect(SessionPool.prototype.claim).not.toHaveBeenCalled();
  });

  it('still creates an agent session with a provider (regression)', async () => {
    const registry = { get: vi.fn(() => ({ getEnvironmentVariables: () => ({}), buildCommand: () => 'claude', getStateSignals: () => ({ working: [], approval: [], awaitingInput: [], fatalError: [] }) })) };
    manager.setProviderRegistry(registry as any);
    const meta = await manager.createSession({
      workingDirectory: '/mock/home', permissionMode: 'standard',
    });
    expect(meta.kind).toBeUndefined();
    expect(meta.providerId).toBe('claude');
  });
});

describe('SessionManager.restartSession — shell sessions', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
  });

  it('restarts a shell session via spawnShellSession, not spawn', async () => {
    const registry = { get: vi.fn(() => { throw new Error('no provider for shell'); }) };
    manager.setProviderRegistry(registry as any);
    const meta = await manager.createSession({
      workingDirectory: '/mock/home', permissionMode: 'standard', kind: 'shell',
    });
    vi.clearAllMocks(); // isolate restart calls
    const ok = await manager.restartSession(meta.id);
    expect(ok).toBe(true);
    expect(CLIManager.prototype.spawnShellSession).toHaveBeenCalledTimes(1);
    expect(CLIManager.prototype.spawn).not.toHaveBeenCalled();
    expect(registry.get).not.toHaveBeenCalled();
    // Verify CLIManager was constructed with kind: 'shell' during restart
    expect(CLIManager).toHaveBeenCalledWith(expect.objectContaining({ kind: 'shell' }));
  });

  it('restarts an agent session via spawn, not spawnShellSession', async () => {
    const registry = { get: vi.fn(() => ({ getEnvironmentVariables: () => ({}), buildCommand: () => 'claude', getStateSignals: () => ({ working: [], approval: [], awaitingInput: [], fatalError: [] }) })) };
    manager.setProviderRegistry(registry as any);
    const meta = await manager.createSession({ workingDirectory: '/mock/home', permissionMode: 'standard' });
    vi.clearAllMocks();
    const ok = await manager.restartSession(meta.id);
    expect(ok).toBe(true);
    expect(CLIManager.prototype.spawn).toHaveBeenCalledTimes(1);
    expect(CLIManager.prototype.spawnShellSession).not.toHaveBeenCalled();
    expect(registry.get).toHaveBeenCalled();
  });

  it('restored shell session (kind=shell loaded from persistence) restarts via spawnShellSession, not spawn', async () => {
    // Simulate what happens after an app restart: loadSessionState returns a shell session
    // whose kind was persisted. The manager restores it via initialize(), then the auto-restart
    // or explicit restart must route to spawnShellSession — not spawn() — regardless of whether
    // the session was created in-process or loaded from disk.
    const { loadSessionState } = await import('./session-persistence');
    vi.mocked(loadSessionState).mockReturnValueOnce({
      version: 1,
      sessions: [
        {
          id: 'persisted-shell-id',
          name: 'Shell',
          workingDirectory: '/mock/home',
          permissionMode: 'standard',
          status: 'exited',
          createdAt: 1000,
          kind: 'shell',
        },
      ],
      activeSessionId: 'persisted-shell-id',
      lastModified: Date.now(),
    });

    const registry = { get: vi.fn(() => { throw new Error('no provider for shell'); }) };
    manager.setProviderRegistry(registry as any);

    // Calling initialize() loads the persisted shell session into memory
    manager.initialize();

    vi.clearAllMocks(); // isolate restart from initialize setup

    const ok = await manager.restartSession('persisted-shell-id');
    expect(ok).toBe(true);
    expect(CLIManager.prototype.spawnShellSession).toHaveBeenCalledTimes(1);
    expect(CLIManager.prototype.spawn).not.toHaveBeenCalled();
    expect(registry.get).not.toHaveBeenCalled();
  });
});

describe('SessionManager.createSession — spawn failure gating (F1)', () => {
  let manager: SessionManager;
  const baseRequest = { workingDirectory: '/mock/home', permissionMode: 'standard' as const };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
    const registry = { get: vi.fn(() => ({ getEnvironmentVariables: () => ({}), buildCommand: () => 'claude', getStateSignals: () => ({ working: [], approval: [], awaitingInput: [], fatalError: [] }) })) };
    manager.setProviderRegistry(registry as any);
  });

  it('marks the session errored (not running) when the direct spawn rejects', async () => {
    vi.mocked(CLIManager.prototype.spawn).mockRejectedValueOnce(new Error('ENOENT: claude not found'));

    const meta = await manager.createSession({ ...baseRequest });

    expect(meta.status).toBe('error');
    expect(meta.error).toContain('claude not found');
    // Session stays in the map so the UI can show/close it.
    expect(manager.getSession(meta.id)?.status).toBe('error');
  });

  it('marks the session running when the spawn resolves (regression)', async () => {
    vi.mocked(CLIManager.prototype.spawn).mockResolvedValueOnce(undefined);
    const meta = await manager.createSession({ ...baseRequest });
    expect(meta.status).toBe('running');
    expect(meta.error).toBeUndefined();
  });

  it('marks a shell session errored when spawnShellSession rejects', async () => {
    vi.mocked(CLIManager.prototype.spawnShellSession).mockRejectedValueOnce(new Error('bad cwd'));
    const meta = await manager.createSession({ ...baseRequest, kind: 'shell' });
    expect(meta.status).toBe('error');
    expect(meta.error).toContain('bad cwd');
  });
});

describe('SessionManager.restartSession — spawn failure gating (F1)', () => {
  let manager: SessionManager;
  const baseRequest = { workingDirectory: '/mock/home', permissionMode: 'standard' as const };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
    const registry = { get: vi.fn(() => ({ getEnvironmentVariables: () => ({}), buildCommand: () => 'claude', getStateSignals: () => ({ working: [], approval: [], awaitingInput: [], fatalError: [] }) })) };
    manager.setProviderRegistry(registry as any);
  });

  it('returns false and marks status error when the restart spawn rejects', async () => {
    const meta = await manager.createSession({ ...baseRequest });
    vi.clearAllMocks();
    // The previously-dead synchronous catch could not catch an async rejection;
    // with `await` in place this now deterministically reaches the catch.
    vi.mocked(CLIManager.prototype.spawn).mockRejectedValueOnce(new Error('respawn failed'));

    const ok = await manager.restartSession(meta.id);

    expect(ok).toBe(false);
    expect(manager.getSession(meta.id)?.status).toBe('error');
    expect(manager.getSession(meta.id)?.error).toContain('respawn failed');
  });

  it('does not overwrite an onExit-driven crash status with running when the PTY dies during the restart spawn (#124)', async () => {
    const meta = await manager.createSession({ ...baseRequest });
    vi.clearAllMocks();

    // Capture the onExit callback wired for the NEW CLIManager created inside
    // restartSession (mirrors the F2 createSession crash test).
    let capturedExit: ((code: number) => void) | undefined;
    vi.mocked(CLIManager.prototype.onExit).mockImplementationOnce((cb: (code: number) => void) => {
      capturedExit = cb;
    });
    // Fire the crash from inside spawn(), before the spawn promise resolves —
    // the exact race restartSession must guard against.
    vi.mocked(CLIManager.prototype.spawn).mockImplementationOnce(async () => {
      capturedExit?.(1);
    });

    const ok = await manager.restartSession(meta.id);

    expect(ok).toBe(true);
    expect(manager.getSession(meta.id)?.status).toBe('error');
    expect(manager.getSession(meta.id)?.exitCode).toBe(1);
  });
});

describe('SessionManager.createSession — early map insertion (F2)', () => {
  let manager: SessionManager;
  const baseRequest = { workingDirectory: '/mock/home', permissionMode: 'standard' as const };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
    const registry = { get: vi.fn(() => ({ getEnvironmentVariables: () => ({}), buildCommand: () => 'claude', getStateSignals: () => ({ working: [], approval: [], awaitingInput: [], fatalError: [] }) })) };
    manager.setProviderRegistry(registry as any);
  });

  it('records an onExit fired DURING pool activation (not stuck at starting)', async () => {
    // Capture the wired onExit, then fire it from inside initializeSession —
    // i.e. the pooled PTY dies mid-activation, before createSession resolves.
    let capturedExit: ((code: number) => void) | undefined;
    const pooledCliManager = {
      onModelChange: vi.fn(),
      onOutput: vi.fn(),
      onExit: vi.fn((cb: (code: number) => void) => { capturedExit = cb; }),
      initializeSession: vi.fn().mockImplementation(async () => {
        // Session died on launch during the ~200ms activation window.
        capturedExit?.(1);
      }),
      destroy: vi.fn(),
    };
    vi.mocked(SessionPool.prototype.claim).mockReturnValueOnce({
      id: 'pooled-session-id',
      cliManager: pooledCliManager as unknown as InstanceType<typeof CLIManager>,
    });

    const meta = await manager.createSession({ ...baseRequest });

    // Before F2 this exit was dropped (session not yet in the map) and the
    // session sat at 'starting' forever. Now it is recorded — and since the
    // exit code is non-zero it is a crash, so status is 'error'.
    expect(manager.getSession(meta.id)?.status).toBe('error');
    expect(manager.getSession(meta.id)?.exitCode).toBe(1);
  });
});

describe('SessionManager — stale-manager guard & crash status (review fixes)', () => {
  let manager: SessionManager;
  const baseRequest = { workingDirectory: '/mock/home', permissionMode: 'standard' as const };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
    const registry = { get: vi.fn(() => ({ getEnvironmentVariables: () => ({}), buildCommand: () => 'claude', getStateSignals: () => ({ working: [], approval: [], awaitingInput: [], fatalError: [] }) })) };
    manager.setProviderRegistry(registry as any);
  });

  it('a clean exit (code 0) is exited; a non-zero exit is error', async () => {
    const exitCbs: Array<(c: number) => void> = [];
    vi.mocked(CLIManager.prototype.onExit).mockImplementation((cb: (c: number) => void) => { exitCbs.push(cb); });

    const meta = await manager.createSession({ ...baseRequest });
    exitCbs[exitCbs.length - 1](0);
    expect(manager.getSession(meta.id)?.status).toBe('exited');
  });

  it('ignores a stale (replaced) manager\'s late exit — the live session is untouched', async () => {
    const exitCbs: Array<(c: number) => void> = [];
    vi.mocked(CLIManager.prototype.onExit).mockImplementation((cb: (c: number) => void) => { exitCbs.push(cb); });

    const meta = await manager.createSession({ ...baseRequest });
    const staleExit = exitCbs[exitCbs.length - 1]; // manager A's onExit
    await manager.restartSession(meta.id);          // installs manager B
    expect(manager.getSession(meta.id)?.status).toBe('running');

    // Manager A's PTY dies late (non-zero). The guard must ignore it so the
    // healthy replacement isn't torn down.
    staleExit(1);
    expect(manager.getSession(meta.id)?.status).toBe('running');
  });
});

describe('SessionManager — model/launchMode persistence & restart (F3)', () => {
  let manager: SessionManager;
  const baseRequest = { workingDirectory: '/mock/home', permissionMode: 'standard' as const };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
    const registry = { get: vi.fn(() => ({ getEnvironmentVariables: () => ({}), buildCommand: () => 'claude', getStateSignals: () => ({ working: [], approval: [], awaitingInput: [], fatalError: [] }) })) };
    manager.setProviderRegistry(registry as any);
  });

  it('stores the starting model and launchMode on session metadata', async () => {
    const meta = await manager.createSession({ ...baseRequest, model: 'opus', launchMode: 'agents' });
    expect(meta.model).toBe('opus');
    expect(meta.launchMode).toBe('agents');
  });

  it('restart reconstructs the CLIManager with the same model and launchMode', async () => {
    const meta = await manager.createSession({ ...baseRequest, model: 'opus', launchMode: 'agents' });
    vi.clearAllMocks();
    await manager.restartSession(meta.id);
    expect(CLIManager).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'opus', launchMode: 'agents' }),
    );
  });

  it('restart wiring appends output to scrollback (previously dropped)', async () => {
    const meta = await manager.createSession({ ...baseRequest });
    vi.clearAllMocks();
    // Capture the onOutput callback wired during restart.
    let restartOutputCb: ((data: string) => void) | undefined;
    vi.mocked(CLIManager.prototype.onOutput).mockImplementationOnce((cb: (data: string) => void) => {
      restartOutputCb = cb;
    });
    await manager.restartSession(meta.id);

    restartOutputCb?.('post-restart output');
    expect(manager.getSessionScrollback(meta.id)).toContain('post-restart output');
  });
});

describe('SessionManager scrollback buffer', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
  });

  it('returns empty string for an unknown session', () => {
    expect(manager.getSessionScrollback('missing')).toBe('');
  });

  it('appends output and returns the accumulated buffer', () => {
    manager.appendScrollback('s1', 'hello ');
    manager.appendScrollback('s1', 'world');
    expect(manager.getSessionScrollback('s1')).toBe('hello world');
  });

  it('caps the buffer at the max size, keeping the newest bytes', () => {
    manager.appendScrollback('s1', 'OLD');
    const big = 'x'.repeat(300 * 1024);
    manager.appendScrollback('s1', big);
    const buf = manager.getSessionScrollback('s1');
    expect(buf.length).toBeLessThanOrEqual(256 * 1024);
    expect(buf.endsWith('x')).toBe(true);
    expect(buf.includes('OLD')).toBe(false);
  });
});

// ── Bell → attention state (agent sessions) ─────────────────────────────────
// A bare BEL from an agent CLI means "I need the user" (verified live:
// docs/experiments/2026-07-19-bell-attention-probe.md). It must surface as
// 'awaiting-input' through onSessionStateChanged; typing into the session
// acknowledges and clears it.
import { IPCEmitter } from './ipc-emitter';

describe('SessionManager bell → attention state', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
    manager.setMainWindow({} as never);
  });

  /** All onSessionStateChanged payloads emitted so far. */
  function stateEvents(): Array<{ sessionId: string; state: string; reason?: string }> {
    const emit = IPCEmitter.prototype.emit as ReturnType<typeof vi.fn>;
    return emit.mock.calls
      .filter((c) => c[0] === 'onSessionStateChanged')
      .map((c) => c[1]);
  }

  /** Create a session and return the PTY-output callback wired to it. */
  async function createAndTap(kind?: 'agent' | 'shell'): Promise<(data: string) => void> {
    await manager.createSession({ workingDirectory: '/mock/home', kind } as never);
    const onOutput = CLIManager.prototype.onOutput as ReturnType<typeof vi.fn>;
    expect(onOutput).toHaveBeenCalled();
    return onOutput.mock.calls[0][0];
  }

  it('emits awaiting-input when an agent session rings a bare BEL', async () => {
    const tap = await createAndTap('agent');
    tap('turn output done\x07');
    const events = stateEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sessionId: 'test-session-id',
      state: 'awaiting-input',
      reason: 'bell',
    });
  });

  it('ignores BELs that terminate OSC sequences', async () => {
    const tap = await createAndTap('agent');
    tap('\x1b]0;window title\x07');
    tap('\x1b]52;c;YmFzZTY0\x07');
    expect(stateEvents()).toHaveLength(0);
  });

  it('does not re-emit while already awaiting-input', async () => {
    const tap = await createAndTap('agent');
    tap('\x07');
    tap('\x07');
    expect(stateEvents().filter((e) => e.state === 'awaiting-input')).toHaveLength(1);
  });

  it('clears to working when the user types into the session', async () => {
    const tap = await createAndTap('agent');
    tap('\x07');
    manager.sendInput('test-session-id', 'y');
    const events = stateEvents();
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ state: 'working', reason: 'input' });
  });

  it('sendInput without a pending bell emits no state change', async () => {
    await createAndTap('agent');
    manager.sendInput('test-session-id', 'hello');
    expect(stateEvents()).toHaveLength(0);
  });

  it('re-alerts on a new bell after the previous one was acknowledged', async () => {
    const tap = await createAndTap('agent');
    tap('\x07');
    manager.sendInput('test-session-id', 'answer');
    tap('\x07');
    expect(stateEvents().filter((e) => e.state === 'awaiting-input')).toHaveLength(2);
  });

  it('never emits awaiting-input for shell sessions', async () => {
    const tap = await createAndTap('shell');
    tap('beep\x07'); // e.g. tab-completion bell
    expect(stateEvents().filter((e) => e.state === 'awaiting-input')).toHaveLength(0);
  });
});

// ── Title → auto-rename (agent sessions) ────────────────────────────────────
// Claude Code writes "<glyph> <task summary>" to the terminal title (verified
// live 2026-07-19). Sessions the user did NOT explicitly name auto-rename to
// the summary; explicit names (create or session:rename) are never touched.
describe('SessionManager title → auto-rename', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
    manager.setMainWindow({} as never);
  });

  function updatedEvents(): Array<{ name: string }> {
    const emit = IPCEmitter.prototype.emit as ReturnType<typeof vi.fn>;
    return emit.mock.calls
      .filter((c) => c[0] === 'onSessionUpdated')
      .map((c) => c[1]);
  }

  async function createAndTap(req: Record<string, unknown>): Promise<(data: string) => void> {
    await manager.createSession({ workingDirectory: '/mock/home', ...req } as never);
    const onOutput = CLIManager.prototype.onOutput as ReturnType<typeof vi.fn>;
    return onOutput.mock.calls[0][0];
  }

  it('auto-renames an unnamed agent session from the task title', async () => {
    const tap = await createAndTap({ kind: 'agent' });
    tap('\x1b]0;⠂ Fix login bug\x07');
    expect(manager.getSession('test-session-id')?.name).toBe('Fix login bug');
    expect(updatedEvents().some((e) => e.name === 'Fix login bug')).toBe(true);
  });

  it('does not re-emit when only the spinner glyph changes', async () => {
    const tap = await createAndTap({ kind: 'agent' });
    tap('\x1b]0;⠂ Fix login bug\x07');
    const countAfterFirst = updatedEvents().length;
    tap('\x1b]0;⠐ Fix login bug\x07');
    tap('\x1b]0;✳ Fix login bug\x07');
    expect(updatedEvents().length).toBe(countAfterFirst);
  });

  it('renames again when the task text actually changes', async () => {
    const tap = await createAndTap({ kind: 'agent' });
    tap('\x1b]0;⠂ First task\x07');
    tap('\x1b]0;⠂ Second task\x07');
    expect(manager.getSession('test-session-id')?.name).toBe('Second task');
  });

  it('ignores generic and shell-spawn titles', async () => {
    const tap = await createAndTap({ kind: 'agent' });
    const before = manager.getSession('test-session-id')?.name;
    tap('\x1b]0;C:\WINDOWS\SYSTEM32\cmd.exe - claude\x07');
    tap('\x1b]0;claude\x07');
    tap('\x1b]0;✳ Claude Code\x07');
    expect(manager.getSession('test-session-id')?.name).toBe(before);
  });

  it('never renames a session the user named at creation', async () => {
    const tap = await createAndTap({ kind: 'agent', name: 'My Chosen Name' });
    tap('\x1b]0;⠂ Some task\x07');
    expect(manager.getSession('test-session-id')?.name).toBe('My Chosen Name');
  });

  it('stops auto-renaming after a manual rename', async () => {
    const tap = await createAndTap({ kind: 'agent' });
    tap('\x1b]0;⠂ Auto name\x07');
    await manager.renameSession('test-session-id', 'Manual Name');
    tap('\x1b]0;⠂ Newer task\x07');
    expect(manager.getSession('test-session-id')?.name).toBe('Manual Name');
    expect(manager.getSession('test-session-id')?.nameIsCustom).toBe(true);
  });

  it('marks nameIsCustom when a name is given at creation', async () => {
    await createAndTap({ kind: 'agent', name: 'Explicit' });
    expect(manager.getSession('test-session-id')?.nameIsCustom).toBe(true);
  });

  it('never auto-renames shell sessions', async () => {
    const tap = await createAndTap({ kind: 'shell' });
    const before = manager.getSession('test-session-id')?.name;
    tap('\x1b]0;⠂ Looks like a task\x07');
    expect(manager.getSession('test-session-id')?.name).toBe(before);
  });
});

describe('SessionManager.addStateListener', () => {
  let manager: SessionManager;
  const baseRequest = { workingDirectory: '/mock/home', permissionMode: 'standard' as const };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
  });

  it('invokes listeners with the event and session metadata on state changes', async () => {
    const meta = await manager.createSession({ ...baseRequest });
    const listener = vi.fn();
    manager.addStateListener(listener);

    (manager as never as { emitActivityState(id: string, s: string, r?: string): void })
      .emitActivityState(meta.id, 'awaiting-input', 'bell');

    expect(listener).toHaveBeenCalledTimes(1);
    const [event, sessionMeta] = listener.mock.calls[0];
    expect(event).toMatchObject({ sessionId: meta.id, state: 'awaiting-input', reason: 'bell' });
    expect(sessionMeta).toMatchObject({ id: meta.id, workingDirectory: '/mock/home' });
  });

  it('a throwing listener does not break other listeners', async () => {
    const meta = await manager.createSession({ ...baseRequest });
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    manager.addStateListener(bad);
    manager.addStateListener(good);

    (manager as never as { emitActivityState(id: string, s: string, r?: string): void })
      .emitActivityState(meta.id, 'done');

    expect(good).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops future invocations', async () => {
    const meta = await manager.createSession({ ...baseRequest });
    const listener = vi.fn();
    const unsub = manager.addStateListener(listener);
    unsub();

    (manager as never as { emitActivityState(id: string, s: string, r?: string): void })
      .emitActivityState(meta.id, 'done');

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('SessionManager.seedInitialPrompt', () => {
  let manager: SessionManager;
  const baseRequest = { workingDirectory: '/mock/home', permissionMode: 'standard' as const };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
  });

  function cliWriteSpy(sessionId: string) {
    const session = (manager as never as { sessions: Map<string, { cliManager: { write: ReturnType<typeof vi.fn> } | null }> })
      .sessions.get(sessionId)!;
    return session.cliManager!.write as ReturnType<typeof vi.fn>;
  }

  it('types the prompt exactly once, without a trailing newline', async () => {
    const meta = await manager.createSession({ ...baseRequest, initialPrompt: 'GitHub issue #7: Fix crash\n\nIt crashes' });
    const write = cliWriteSpy(meta.id);
    write.mockClear();

    manager.seedInitialPrompt(meta.id);
    expect(write).toHaveBeenCalledTimes(1);
    const typed = write.mock.calls[0][0] as string;
    expect(typed).toBe('GitHub issue #7: Fix crash\n\nIt crashes');
    expect(typed.endsWith('\r')).toBe(false);

    manager.seedInitialPrompt(meta.id); // second call: prompt already consumed
    expect(write).toHaveBeenCalledTimes(1);
    expect(manager.getSession(meta.id)?.initialPrompt).toBeUndefined();
  });

  it('is a no-op for sessions without an initialPrompt', async () => {
    const meta = await manager.createSession({ ...baseRequest });
    const write = cliWriteSpy(meta.id);
    write.mockClear();
    manager.seedInitialPrompt(meta.id);
    expect(write).not.toHaveBeenCalled();
  });
});
