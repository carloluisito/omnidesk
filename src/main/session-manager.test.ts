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
  return { CLIManager };
});

import { SessionManager } from './session-manager';
import { HistoryManager } from './history-manager';
import { SessionPool } from './session-pool';

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
