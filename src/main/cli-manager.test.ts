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
});
