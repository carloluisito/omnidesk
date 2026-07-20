import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({ execFile: vi.fn() }));

import { execFile } from 'child_process';
import { GitHubService, parseShortstat } from './github-service';

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

type Route = (binary: string, args: string[]) => { stdout?: string; stderr?: string; exitCode?: number } | undefined;

/** Route execFile calls by binary+args; unrouted calls succeed with empty output. */
function routeExec(route: Route) {
  mockExecFile.mockImplementation((binary: string, args: string[], _opts: unknown, cb: (e: unknown, so: string, se: string) => void) => {
    const res = route(binary, args) ?? { exitCode: 0 };
    const code = res.exitCode ?? 0;
    cb(code ? { code } : null, res.stdout ?? '', res.stderr ?? '');
  });
}

const ghFound: Route = (bin, args) => {
  if ((bin === 'where' || bin === 'which') && args[0] === 'gh') {
    return { stdout: 'C:\\Program Files\\GitHub CLI\\gh.exe\n' };
  }
  return undefined;
};

beforeEach(() => vi.clearAllMocks());

describe('parseShortstat', () => {
  it('parses plural and singular forms', () => {
    expect(parseShortstat(' 3 files changed, 42 insertions(+), 7 deletions(-)\n'))
      .toEqual({ filesChanged: 3, insertions: 42, deletions: 7 });
    expect(parseShortstat(' 1 file changed, 1 insertion(+)\n'))
      .toEqual({ filesChanged: 1, insertions: 1, deletions: 0 });
    expect(parseShortstat('')).toEqual({ filesChanged: 0, insertions: 0, deletions: 0 });
  });
});

describe('GitHubService.preflight', () => {
  it('reports gh missing with an install hint', async () => {
    routeExec((bin, args) => {
      if ((bin === 'where' || bin === 'which') && args[0] === 'gh') return { exitCode: 1 };
      return undefined;
    });
    const p = await new GitHubService().preflight('C:\\repo');
    expect(p).toMatchObject({ installed: false, authenticated: false, hasRemote: false });
    expect(p.error).toContain('winget install GitHub.cli');
  });

  it('reports unauthenticated with a login hint', async () => {
    routeExec((bin, args) => {
      const found = ghFound(bin, args);
      if (found) return found;
      if (args[0] === 'auth') return { exitCode: 1 };
      return undefined;
    });
    const p = await new GitHubService().preflight('C:\\repo');
    expect(p).toMatchObject({ installed: true, authenticated: false });
    expect(p.error).toContain('gh auth login');
  });

  it('reports missing origin remote', async () => {
    routeExec((bin, args) => {
      const found = ghFound(bin, args);
      if (found) return found;
      if (bin === 'git' && args[0] === 'remote') return { exitCode: 2 };
      return undefined;
    });
    const p = await new GitHubService().preflight('C:\\repo');
    expect(p).toMatchObject({ installed: true, authenticated: true, hasRemote: false });
  });

  it('passes when everything is in place', async () => {
    routeExec((bin, args) => ghFound(bin, args) ?? (bin === 'git' && args[0] === 'remote' ? { stdout: 'git@github.com:a/b.git\n' } : undefined));
    const p = await new GitHubService().preflight('C:\\repo');
    expect(p).toEqual({ installed: true, authenticated: true, hasRemote: true });
  });
});

describe('GitHubService.listIssues', () => {
  it('parses gh JSON and flattens labels', async () => {
    routeExec((bin, args) => {
      const found = ghFound(bin, args);
      if (found) return found;
      if (args[0] === 'issue') {
        return {
          stdout: JSON.stringify([
            { number: 7, title: 'Fix crash', body: 'It crashes', labels: [{ name: 'bug' }], url: 'https://github.com/a/b/issues/7' },
            { number: 9, title: 'No body', body: null, labels: null, url: 'https://github.com/a/b/issues/9' },
          ]),
        };
      }
      return undefined;
    });
    const issues = await new GitHubService().listIssues('C:\\repo');
    expect(issues).toEqual([
      { number: 7, title: 'Fix crash', body: 'It crashes', labels: ['bug'], url: 'https://github.com/a/b/issues/7' },
      { number: 9, title: 'No body', body: '', labels: [], url: 'https://github.com/a/b/issues/9' },
    ]);
  });
});

describe('GitHubService.getShipItPreview', () => {
  it('collects branch, base, stats, commits and existing PR', async () => {
    routeExec((bin, args) => {
      const found = ghFound(bin, args);
      if (found) return found;
      if (bin === 'git' && args[0] === 'rev-parse' && args.includes('--abbrev-ref')) return { stdout: 'feat/x\n' };
      if (bin === 'git' && args[0] === 'rev-parse' && args.includes('origin/main')) return { exitCode: 0 };
      if (bin === 'git' && args[0] === 'diff') return { stdout: ' 2 files changed, 10 insertions(+), 3 deletions(-)\n' };
      if (bin === 'git' && args[0] === 'log') return { stdout: 'abc123 feat: one\ndef456 fix: two\n' };
      if (args[0] === 'pr' && args[1] === 'view') return { stdout: JSON.stringify({ url: 'https://github.com/a/b/pull/3' }) };
      return undefined;
    });
    const preview = await new GitHubService().getShipItPreview('C:\\repo');
    expect(preview).toEqual({
      branch: 'feat/x',
      baseBranch: 'main',
      filesChanged: 2,
      insertions: 10,
      deletions: 3,
      commits: ['abc123 feat: one', 'def456 fix: two'],
      existingPrUrl: 'https://github.com/a/b/pull/3',
    });
  });

  it('uses origin/HEAD to detect a non-main/master default branch', async () => {
    routeExec((bin, args) => {
      const found = ghFound(bin, args);
      if (found) return found;
      if (bin === 'git' && args[0] === 'rev-parse' && args.includes('--abbrev-ref')) return { stdout: 'feat/x\n' };
      if (bin === 'git' && args[0] === 'symbolic-ref') return { stdout: 'origin/develop\n' };
      if (bin === 'git' && args[0] === 'rev-parse' && args.includes('origin/develop')) return { exitCode: 0 };
      if (bin === 'git' && args[0] === 'diff') return { stdout: ' 1 file changed, 4 insertions(+)\n' };
      if (bin === 'git' && args[0] === 'log') return { stdout: 'aaa111 chore: setup\n' };
      if (args[0] === 'pr' && args[1] === 'view') return { exitCode: 1 };
      return undefined;
    });
    const preview = await new GitHubService().getShipItPreview('C:\\repo');
    expect(preview).toEqual({
      branch: 'feat/x',
      baseBranch: 'develop',
      filesChanged: 1,
      insertions: 4,
      deletions: 0,
      commits: ['aaa111 chore: setup'],
      existingPrUrl: undefined,
    });
  });

  it('throws when no base branch can be resolved', async () => {
    routeExec((bin, args) => {
      const found = ghFound(bin, args);
      if (found) return found;
      if (bin === 'git' && args[0] === 'rev-parse' && args.includes('--abbrev-ref')) return { stdout: 'feat/x\n' };
      if (bin === 'git' && args[0] === 'symbolic-ref') return { exitCode: 1 };
      if (bin === 'git' && args[0] === 'rev-parse' && args.includes('origin/main')) return { exitCode: 1 };
      if (bin === 'git' && args[0] === 'rev-parse' && args.includes('origin/master')) return { exitCode: 1 };
      return undefined;
    });
    await expect(new GitHubService().getShipItPreview('C:\\repo'))
      .rejects.toThrow('Could not determine the base branch to compare against');
  });

  it('throws when diff/log commands fail against a resolved base', async () => {
    routeExec((bin, args) => {
      const found = ghFound(bin, args);
      if (found) return found;
      if (bin === 'git' && args[0] === 'rev-parse' && args.includes('--abbrev-ref')) return { stdout: 'feat/x\n' };
      if (bin === 'git' && args[0] === 'rev-parse' && args.includes('origin/main')) return { exitCode: 0 };
      if (bin === 'git' && args[0] === 'diff') return { exitCode: 1, stderr: 'fatal: bad revision\n' };
      return undefined;
    });
    await expect(new GitHubService().getShipItPreview('C:\\repo'))
      .rejects.toThrow('Could not determine the base branch to compare against');
  });
});

describe('GitHubService.createPR', () => {
  it('throws pr-exists when a PR is already open for the branch', async () => {
    routeExec((bin, args) => {
      const found = ghFound(bin, args);
      if (found) return found;
      if (args[0] === 'pr' && args[1] === 'view') return { stdout: JSON.stringify({ url: 'https://github.com/a/b/pull/5' }) };
      return undefined;
    });
    await expect(new GitHubService().createPR('C:\\repo', { title: 't', body: 'b', draft: false }))
      .rejects.toThrow('pr-exists:https://github.com/a/b/pull/5');
  });

  it('creates the PR and extracts the URL', async () => {
    routeExec((bin, args) => {
      const found = ghFound(bin, args);
      if (found) return found;
      if (args[0] === 'pr' && args[1] === 'view') return { exitCode: 1 };
      if (args[0] === 'pr' && args[1] === 'create') {
        expect(args).toContain('--title');
        expect(args).toContain('--draft');
        return { stdout: 'Creating pull request...\nhttps://github.com/a/b/pull/12\n' };
      }
      return undefined;
    });
    const res = await new GitHubService().createPR('C:\\repo', { title: 't', body: 'b', draft: true });
    expect(res).toEqual({ url: 'https://github.com/a/b/pull/12' });
  });
});
