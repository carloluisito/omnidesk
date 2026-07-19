// GitHub actions via the `gh` CLI — ship-it (PR) and work intake (issues).
// Copies GitManager's discipline: execFile only (never exec), per-directory
// mutex, non-interactive env, bounded buffers. NOT a message connector.
import { execFile } from 'child_process';
import type {
  CreatePRRequest,
  CreatePRResult,
  GitHubIssue,
  GitHubPreflight,
  ShipItPreview,
} from '../../shared/integration-types';

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const NON_INTERACTIVE_ENV = {
  GH_PROMPT_DISABLED: '1',
  GH_NO_UPDATE_NOTIFIER: '1',
  GIT_TERMINAL_PROMPT: '0',
};

export class GitHubService {
  /** undefined = not probed yet; null = not installed. */
  private ghBinary: string | null | undefined;
  private readonly mutexes = new Map<string, Promise<void>>();

  private exec(binary: string, args: string[], cwd?: string, timeoutMs = 30_000): Promise<ExecResult> {
    return new Promise((resolve) => {
      execFile(
        binary,
        args,
        {
          cwd,
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, ...NON_INTERACTIVE_ENV },
        },
        (err, stdout, stderr) => {
          const code = err && 'code' in err ? (err as { code?: unknown }).code : err ? 1 : 0;
          resolve({
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: typeof code === 'number' ? code : 1,
          });
        }
      );
    });
  }

  private async withMutex<T>(dir: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.mutexes.get(dir) || Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => { release = r; });
    this.mutexes.set(dir, next);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async findGh(): Promise<string | null> {
    if (this.ghBinary !== undefined) return this.ghBinary;
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const res = await this.exec(finder, ['gh'], undefined, 5_000);
    const first = res.stdout.split(/\r?\n/)[0]?.trim();
    this.ghBinary = res.exitCode === 0 && first ? first : null;
    return this.ghBinary;
  }

  async preflight(dir: string): Promise<GitHubPreflight> {
    const gh = await this.findGh();
    if (!gh) {
      return { installed: false, authenticated: false, hasRemote: false, error: 'GitHub CLI (gh) not found — install it with: winget install GitHub.cli' };
    }
    const auth = await this.exec(gh, ['auth', 'status'], dir, 15_000);
    if (auth.exitCode !== 0) {
      return { installed: true, authenticated: false, hasRemote: false, error: 'gh is not authenticated — run: gh auth login' };
    }
    const remote = await this.exec('git', ['remote', 'get-url', 'origin'], dir, 10_000);
    if (remote.exitCode !== 0) {
      return { installed: true, authenticated: true, hasRemote: false, error: 'No "origin" remote in this repository' };
    }
    return { installed: true, authenticated: true, hasRemote: true };
  }

  async listIssues(dir: string): Promise<GitHubIssue[]> {
    return this.withMutex(dir, async () => {
      const gh = await this.requireGh();
      const res = await this.exec(gh, ['issue', 'list', '--state', 'open', '--limit', '50', '--json', 'number,title,body,labels,url'], dir);
      if (res.exitCode !== 0) throw new Error(`gh issue list failed: ${res.stderr.trim() || `exit ${res.exitCode}`}`);
      const raw = JSON.parse(res.stdout || '[]') as Array<{
        number: number; title: string; body: string | null; url: string;
        labels: Array<{ name: string }> | null;
      }>;
      return raw.map((i) => ({
        number: i.number,
        title: i.title,
        body: i.body ?? '',
        labels: (i.labels ?? []).map((l) => l.name),
        url: i.url,
      }));
    });
  }

  async getShipItPreview(dir: string, baseBranch?: string): Promise<ShipItPreview> {
    return this.withMutex(dir, async () => {
      const branchRes = await this.exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], dir);
      if (branchRes.exitCode !== 0) throw new Error('Not a git repository');
      const branch = branchRes.stdout.trim();

      let base = baseBranch;
      if (!base) {
        const hasMain = await this.exec('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], dir);
        base = hasMain.exitCode === 0 ? 'main' : 'master';
      }

      const stat = await this.exec('git', ['diff', '--shortstat', `origin/${base}...HEAD`], dir);
      const { filesChanged, insertions, deletions } = parseShortstat(stat.stdout);

      const logRes = await this.exec('git', ['log', '--oneline', `origin/${base}..HEAD`], dir);
      const commits = logRes.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

      const gh = await this.findGh();
      let existingPrUrl: string | undefined;
      if (gh) {
        const pr = await this.exec(gh, ['pr', 'view', '--json', 'url'], dir, 15_000);
        if (pr.exitCode === 0) {
          try {
            existingPrUrl = (JSON.parse(pr.stdout) as { url?: string }).url;
          } catch { /* no open PR / unexpected output — treat as none */ }
        }
      }

      return { branch, baseBranch: base, filesChanged, insertions, deletions, commits, existingPrUrl };
    });
  }

  async createPR(dir: string, req: CreatePRRequest): Promise<CreatePRResult> {
    return this.withMutex(dir, async () => {
      const gh = await this.requireGh();

      // One PR per branch: creating twice for the same completion must not duplicate.
      const existing = await this.exec(gh, ['pr', 'view', '--json', 'url'], dir, 15_000);
      if (existing.exitCode === 0) {
        try {
          const url = (JSON.parse(existing.stdout) as { url?: string }).url;
          if (url) throw new Error(`pr-exists:${url}`);
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('pr-exists:')) throw err;
        }
      }

      const args = ['pr', 'create', '--title', req.title, '--body', req.body];
      if (req.draft) args.push('--draft');
      const res = await this.exec(gh, args, dir, 60_000);
      if (res.exitCode !== 0) throw new Error(`gh pr create failed: ${res.stderr.trim() || `exit ${res.exitCode}`}`);
      const match = (res.stdout + '\n' + res.stderr).match(/https:\/\/\S+\/pull\/\d+/g);
      const url = match?.at(-1);
      if (!url) throw new Error('PR created but no URL found in gh output');
      return { url };
    });
  }

  private async requireGh(): Promise<string> {
    const gh = await this.findGh();
    if (!gh) throw new Error('GitHub CLI (gh) not found');
    return gh;
  }
}

/** Parse `git diff --shortstat` output (empty string = no changes). */
export function parseShortstat(out: string): { filesChanged: number; insertions: number; deletions: number } {
  const files = out.match(/(\d+) files? changed/);
  const ins = out.match(/(\d+) insertions?\(\+\)/);
  const del = out.match(/(\d+) deletions?\(-\)/);
  return {
    filesChanged: files ? Number(files[1]) : 0,
    insertions: ins ? Number(ins[1]) : 0,
    deletions: del ? Number(del[1]) : 0,
  };
}
