import { execFile } from 'child_process';

/**
 * Probe `claude --version` to determine the installed CLI version.
 * Returns the trimmed version string (e.g. "2.1.139") on success, or `null`
 * if the binary is missing, the probe times out, the exit code is non-zero,
 * or the output can't be parsed.
 *
 * MUST run off the createWindow synchronous critical path (delayed-init only)
 * and uses a 5s timeout — a hung binary cannot block the manager init.
 * (Lesson carried from plans/abandoned/agent-view.plan.md, Learnings item #4.)
 *
 * Uses a manual Promise wrapper (same pattern as git-manager.ts) rather than
 * util.promisify so the mock in tests works against the standard 4-arg callback
 * signature without worrying about util.promisify.custom.
 */
export function probeClaudeVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'claude',
      ['--version'],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve(null);
          return;
        }
        // Claude returns e.g. "2.1.139 (Claude Code)\n" — take the first whitespace-delimited token.
        const trimmed = stdout.trim();
        const firstToken = trimmed.match(/^\S+/)?.[0];
        resolve(firstToken ?? null);
      },
    );
  });
}
