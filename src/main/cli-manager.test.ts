import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('CLIManager Windows ConPTY rendering workarounds', () => {
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const setPlatform = (value: string) =>
    Object.defineProperty(process, 'platform', { value, configurable: true });

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => Object.defineProperty(process, 'platform', realPlatform));

  function spawnOptions(): Record<string, unknown> {
    const spawnMock = pty.spawn as unknown as ReturnType<typeof vi.fn>;
    return spawnMock.mock.calls[spawnMock.mock.calls.length - 1][2];
  }

  it('opts into the bundled Windows Terminal ConPTY on win32', async () => {
    setPlatform('win32');
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
    await mgr.spawn();
    expect(spawnOptions().useConptyDll).toBe(true);
  });

  it('sets Claude full-repaint + synchronized-output env vars on win32', async () => {
    setPlatform('win32');
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
    await mgr.spawn();
    const env = spawnOptions().env as Record<string, string>;
    expect(env.CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT).toBe('1');
    expect(env.CLAUDE_CODE_FORCE_SYNC_OUTPUT).toBe('1');
  });

  it('leaves non-Windows spawns untouched', async () => {
    setPlatform('linux');
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
    await mgr.spawn();
    const opts = spawnOptions();
    expect('useConptyDll' in opts).toBe(false);
    const env = opts.env as Record<string, string>;
    expect(env.CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT).toBeUndefined();
    expect(env.CLAUDE_CODE_FORCE_SYNC_OUTPUT).toBeUndefined();
  });

  it('answers the bundled ConPTY startup DA1 query from main and strips it', async () => {
    setPlatform('win32');
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
    await mgr.spawn();
    const chunks: string[] = [];
    mgr.onOutput(d => chunks.push(d));

    // The modern conpty.dll's real startup burst (captured from node-pty).
    getOnData()('\x1b[1t\x1b[c\x1b[?1004h\x1b[?9001h');
    await new Promise(r => setTimeout(r, 30));

    expect(writtenText()).toContain('\x1b[?1;2c');            // main answered
    expect(chunks.join('')).not.toContain('\x1b[c');          // query stripped
    expect(chunks.join('')).toContain('\x1b[?1004h');         // rest untouched
  });

  it('stops scanning for DA1 after the startup window', async () => {
    setPlatform('win32');
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
    await mgr.spawn();
    const chunks: string[] = [];
    mgr.onOutput(d => chunks.push(d));

    const onData = getOnData();
    for (let i = 0; i < 16; i++) onData('regular output\r\n');
    const writesBefore = getWrite().mock.calls.length;
    onData('\x1b[c'); // e.g. an app-level DA1 passed through post-startup
    await new Promise(r => setTimeout(r, 30));

    expect(getWrite().mock.calls.length).toBe(writesBefore);  // no auto-reply
    expect(chunks.join('')).toContain('\x1b[c');              // passes through
  });

  it('does not intercept DA1 on non-Windows', async () => {
    setPlatform('linux');
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
    await mgr.spawn();
    const chunks: string[] = [];
    mgr.onOutput(d => chunks.push(d));

    getOnData()('\x1b[c');
    await new Promise(r => setTimeout(r, 30));

    expect(writtenText()).not.toContain('\x1b[?1;2c');
    expect(chunks.join('')).toContain('\x1b[c');
  });
});

describe('CLIManager Windows relocation (cmd.exe %VAR% expansion)', () => {
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const setPlatform = (value: string) =>
    Object.defineProperty(process, 'platform', { value, configurable: true });

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => Object.defineProperty(process, 'platform', realPlatform));

  function spawnCount(): number {
    const spawnMock = pty.spawn as unknown as ReturnType<typeof vi.fn>;
    return spawnMock.mock.calls.length;
  }
  function spawnOptionsAt(index: number): Record<string, unknown> {
    const spawnMock = pty.spawn as unknown as ReturnType<typeof vi.fn>;
    return spawnMock.mock.calls[index][2];
  }
  function ptyInstanceAt(index: number) {
    const spawnMock = pty.spawn as unknown as ReturnType<typeof vi.fn>;
    return spawnMock.mock.results[index].value;
  }

  it('relocates a pooled win32 shell via interactive cd for a plain path', async () => {
    setPlatform('win32');
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
    await mgr.spawnShell();
    await mgr.initializeSession('C:\\Users\\carlo\\project', 'standard');

    expect(spawnCount()).toBe(1); // no respawn needed
    expect(writtenText()).toContain('cd /d "C:\\Users\\carlo\\project"');
  });

  it('relocates a pooled win32 shell via interactive cd for a path with spaces', async () => {
    setPlatform('win32');
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
    await mgr.spawnShell();
    await mgr.initializeSession('C:\\Users\\carlo\\My Project', 'standard');

    expect(spawnCount()).toBe(1);
    expect(writtenText()).toContain('cd /d "C:\\Users\\carlo\\My Project"');
  });

  it('respawns instead of writing an interactive cd when the target path contains %VAR%', async () => {
    setPlatform('win32');
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
    await mgr.spawnShell();
    const firstPty = ptyInstanceAt(0);

    const target = 'C:\\Users\\carlo\\%TEMP%\\project';
    await mgr.initializeSession(target, 'standard');

    // The old pooled pty was killed rather than sent an interactive cd that
    // cmd.exe would silently expand...
    expect(firstPty.kill).toHaveBeenCalled();
    // ...and a fresh pty was spawned directly at the target cwd instead
    // (node-pty hands cwd straight to the OS, bypassing cmd's parser).
    expect(spawnCount()).toBe(2);
    expect(spawnOptionsAt(1).cwd).toBe(target);
    // No interactive command should ever carry the unexpanded %TEMP% token.
    expect(writtenText()).not.toContain('%TEMP%');
    expect(mgr.isInitialized).toBe(true);
  });

  it('ignores a stale exit event from the killed pooled pty after a %VAR% respawn', async () => {
    setPlatform('win32');
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
    await mgr.spawnShell();
    const firstPty = ptyInstanceAt(0);
    const staleOnExit = firstPty.onExit.mock.calls[0][0];

    const onExitCb = vi.fn();
    mgr.onExit(onExitCb);

    await mgr.initializeSession('C:\\Users\\carlo\\%TEMP%\\project', 'standard');

    // The killed pooled pty's exit event can still arrive asynchronously —
    // it must be a no-op against the manager's current (new) session state.
    staleOnExit({ exitCode: 1 });

    expect(onExitCb).not.toHaveBeenCalled();
    expect(mgr.isRunning).toBe(true);
    expect(mgr.isInitialized).toBe(true);
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

describe('CLIManager write() chunking (surrogate-pair safe)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes payloads at or under 1024 chars in a single ptyProcess.write call', async () => {
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
    await mgr.spawn();

    const payload = 'hello world'.repeat(50); // 550 chars, well under the 1024 chunk size
    mgr.write(payload);

    expect(getWrite().mock.calls.length).toBe(1);
    expect(getWrite().mock.calls[0][0]).toBe(payload);
  });

  it('splits a large ASCII write into <=1024-char chunks that reassemble to the original', async () => {
    vi.useFakeTimers();
    try {
      const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
      const spawnPromise = mgr.spawn();
      // createPtyProcess waits ~150ms for shell readiness.
      await vi.advanceTimersByTimeAsync(200);
      await spawnPromise;

      const payload = 'x'.repeat(2500); // spans 3 chunks at WRITE_CHUNK_SIZE = 1024
      mgr.write(payload);
      // Flush the chained setTimeout(writeNextChunk, WRITE_CHUNK_DELAY) calls.
      await vi.advanceTimersByTimeAsync(50);

      const calls = getWrite().mock.calls.map((c: string[]) => c[0]);
      expect(calls.length).toBeGreaterThan(1);
      expect(calls.join('')).toBe(payload);
      for (const chunk of calls) {
        expect(chunk.length).toBeLessThanOrEqual(1024);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('reassembles a large write with an astral emoji straddling the 1024-char chunk boundary', async () => {
    vi.useFakeTimers();
    try {
      const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard' });
      const spawnPromise = mgr.spawn();
      await vi.advanceTimersByTimeAsync(200);
      await spawnPromise;

      // 😀 (U+1F600) is a surrogate pair: high surrogate U+D83D + low surrogate
      // U+DE00. Placed right after 1023 filler chars, the naive chunk boundary
      // (offset 0 + WRITE_CHUNK_SIZE 1024) would land between the two halves —
      // exactly the corruption case the fix guards against.
      const emoji = '\u{1F600}';
      const payload = 'a'.repeat(1023) + emoji + 'b'.repeat(200);
      mgr.write(payload);
      await vi.advanceTimersByTimeAsync(50);

      const calls = getWrite().mock.calls.map((c: string[]) => c[0]);
      expect(calls.length).toBeGreaterThan(1);
      expect(calls.join('')).toBe(payload);

      // No chunk may end with a lone high surrogate or start with a lone low
      // surrogate — that's what causes node-pty's UTF-8 encoder to emit U+FFFD.
      for (const chunk of calls) {
        const lastCode = chunk.charCodeAt(chunk.length - 1);
        expect(lastCode >= 0xd800 && lastCode <= 0xdbff).toBe(false);
        const firstCode = chunk.charCodeAt(0);
        expect(firstCode >= 0xdc00 && firstCode <= 0xdfff).toBe(false);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
