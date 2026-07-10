import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as pty from 'node-pty';

// Stop the fresh-env probe from shelling out to powershell/login shell.
vi.mock('child_process', () => ({
  execFileSync: vi.fn(() => 'PATH=/usr/bin\n'),
  execFile: vi.fn(),
}));

import { CLIManager } from './cli-manager';

// Grab the onData handler the CLIManager registers on the mocked pty.
function getOnData(): (data: string) => void {
  const spawnMock = pty.spawn as unknown as ReturnType<typeof vi.fn>;
  const ptyInstance = spawnMock.mock.results[spawnMock.mock.results.length - 1].value;
  return ptyInstance.onData.mock.calls[0][0];
}
function getWrite(): ReturnType<typeof vi.fn> {
  const spawnMock = pty.spawn as unknown as ReturnType<typeof vi.fn>;
  const ptyInstance = spawnMock.mock.results[spawnMock.mock.results.length - 1].value;
  return ptyInstance.write;
}
function getResize(): ReturnType<typeof vi.fn> {
  const spawnMock = pty.spawn as unknown as ReturnType<typeof vi.fn>;
  const ptyInstance = spawnMock.mock.results[spawnMock.mock.results.length - 1].value;
  return ptyInstance.resize;
}
function writtenText(): string {
  return getWrite().mock.calls.map((c: string[]) => c[0]).join('');
}

describe('CLIManager shell sessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('spawnShellSession launches no CLI command', async () => {
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard', kind: 'shell' });
    await mgr.spawnShellSession();
    expect(mgr.isInitialized).toBe(true);
    const writeCalls = getWrite().mock.calls.map((c: string[]) => c[0]).join('');
    expect(writeCalls).not.toContain('claude');
  });

  it('skips model detection for shell sessions', async () => {
    const onModel = vi.fn();
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard', kind: 'shell' });
    mgr.onModelChange(onModel);
    await mgr.spawnShellSession();
    getOnData()('Welcome to Claude Code\nSonnet 4.6\nTips for getting started');
    expect(onModel).not.toHaveBeenCalled();
  });

  it('shell session resize never launches a provider command', async () => {
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard', kind: 'shell' });
    await mgr.spawnShellSession();
    mgr.resize({ cols: 180, rows: 50 });
    expect(getResize()).toHaveBeenCalledWith(180, 50);
    expect(writtenText()).not.toContain('claude');
  });
});

describe('CLIManager deferred provider launch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('spawn does not launch the provider until the first resize arrives', async () => {
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
    await mgr.spawn();
    expect(mgr.isInitialized).toBe(true);
    // Provider CLI must NOT be launched yet — we wait for the real terminal size.
    expect(writtenText()).not.toContain('claude');

    // First resize sizes the PTY correctly, THEN releases the launch.
    mgr.resize({ cols: 180, rows: 50 });
    expect(getResize()).toHaveBeenCalledWith(180, 50);
    expect(writtenText()).toContain('claude');
  });

  it('resizes the PTY before writing the launch command', async () => {
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
    await mgr.spawn();
    mgr.resize({ cols: 200, rows: 60 });

    const resizeOrder = getResize().mock.invocationCallOrder[0];
    const claudeWrite = getWrite().mock.calls.find((c: string[]) => c[0].includes('claude'));
    expect(claudeWrite).toBeDefined();
    const claudeWriteIdx = getWrite().mock.calls.indexOf(claudeWrite!);
    const claudeWriteOrder = getWrite().mock.invocationCallOrder[claudeWriteIdx];
    expect(resizeOrder).toBeLessThan(claudeWriteOrder);
  });

  it('launches the provider command exactly once across multiple resizes', async () => {
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
    await mgr.spawn();
    mgr.resize({ cols: 180, rows: 50 });
    mgr.resize({ cols: 120, rows: 40 });
    mgr.resize({ cols: 200, rows: 60 });

    const launchCount = writtenText().split('claude').length - 1;
    expect(launchCount).toBe(1);
  });

  it('falls back to launching without a resize after the timeout', async () => {
    vi.useFakeTimers();
    try {
      const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
      const spawnPromise = mgr.spawn();
      // createPtyProcess waits ~150ms for shell readiness.
      await vi.advanceTimersByTimeAsync(200);
      await spawnPromise;
      expect(writtenText()).not.toContain('claude');

      // No resize ever arrives (e.g. pane hidden at create) — fallback fires.
      await vi.advanceTimersByTimeAsync(600);
      expect(writtenText()).toContain('claude');
    } finally {
      vi.useRealTimers();
    }
  });
});
