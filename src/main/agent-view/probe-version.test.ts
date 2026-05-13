import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before importing the module under test.
// probeClaudeVersion uses execFile directly (manual Promise wrapper, same
// pattern as git-manager.ts), so the mock just needs to handle the
// 4-arg callback form: execFile(cmd, args, opts, cb).
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { probeClaudeVersion } from './probe-version';
import { execFile } from 'node:child_process';

// Cast to vi.Mock so we can call mockImplementation
const mockedExecFile = vi.mocked(execFile);

type ExecFileCallback = (err: Error | null, stdout: string, stderr?: string) => void;

describe('probeClaudeVersion()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the first whitespace-delimited token from stdout on success', async () => {
    mockedExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        (cb as ExecFileCallback)(null, '2.1.139 (Claude Code)\n', '');
      },
    );

    const result = await probeClaudeVersion();
    expect(result).toBe('2.1.139');
  });

  it('returns null when execFile fires with an ENOENT error (binary not found)', async () => {
    mockedExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
        (cb as ExecFileCallback)(err, '', '');
      },
    );

    const result = await probeClaudeVersion();
    expect(result).toBeNull();
  });

  it('returns null when execFile fires with a timeout error (ETIMEDOUT)', async () => {
    mockedExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
        (cb as ExecFileCallback)(err, '', '');
      },
    );

    const result = await probeClaudeVersion();
    expect(result).toBeNull();
  });

  it('returns null when stdout is empty', async () => {
    mockedExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        (cb as ExecFileCallback)(null, '', '');
      },
    );

    const result = await probeClaudeVersion();
    expect(result).toBeNull();
  });

  it('returns null when stdout is only whitespace', async () => {
    mockedExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        (cb as ExecFileCallback)(null, '   \n', '');
      },
    );

    const result = await probeClaudeVersion();
    expect(result).toBeNull();
  });

  it('invokes execFile with the "claude" binary, ["--version"], and timeout: 5000', async () => {
    mockedExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        (cb as ExecFileCallback)(null, '2.1.139\n', '');
      },
    );

    await probeClaudeVersion();

    expect(mockedExecFile).toHaveBeenCalledWith(
      'claude',
      ['--version'],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function),
    );
  });
});
