import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { GitManager } from './git-manager';

// Mock child_process and fs
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  watch: vi.fn(() => ({ close: vi.fn(), on: vi.fn() })),
  promises: {
    readFile: vi.fn(),
  },
}));

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
const mockExistsSync = fs.existsSync as unknown as ReturnType<typeof vi.fn>;
const mockWatch = fs.watch as unknown as ReturnType<typeof vi.fn>;
const mockReadFile = fs.promises.readFile as unknown as ReturnType<typeof vi.fn>;

/** Fake FSWatcher: a real EventEmitter (so `.on('error', ...)` actually works) plus a close() spy. */
function fakeWatcher(): EventEmitter & { close: ReturnType<typeof vi.fn> } {
  const w = new EventEmitter() as EventEmitter & { close: ReturnType<typeof vi.fn> };
  w.close = vi.fn();
  return w;
}

function mockGitResponse(stdout: string, stderr = '', exitCode = 0) {
  mockExecFile.mockImplementationOnce(
    (_binary: string, _args: string[], _opts: any, cb: Function) => {
      cb(exitCode ? { code: exitCode } : null, stdout, stderr);
    }
  );
}

describe('GitManager', () => {
  let manager: GitManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock detectGitBinary (called in constructor)
    mockExecFile.mockImplementation(
      (_binary: string, _args: string[], _opts: any, cb: Function) => {
        if (_args && _args[0] === 'git') {
          // where/which git
          cb(null, 'C:\\Program Files\\Git\\bin\\git.exe\n', '');
        } else {
          cb(null, '', '');
        }
      }
    );
    manager = new GitManager();
    vi.clearAllMocks();
  });

  describe('getStatus', () => {
    it('returns isRepo: false when not a git repo', async () => {
      mockGitResponse('', '', 128); // rev-parse fails
      const status = await manager.getStatus('/test');
      expect(status.isRepo).toBe(false);
    });

    it('parses branch header', async () => {
      mockGitResponse('true', '', 0); // rev-parse
      mockGitResponse('# branch.head main\n', '', 0); // status
      const status = await manager.getStatus('/test');
      expect(status.isRepo).toBe(true);
      expect(status.branch).toBe('main');
    });

    it('detects detached HEAD', async () => {
      mockGitResponse('true', '', 0);
      mockGitResponse('# branch.head (detached)\n', '', 0);
      const status = await manager.getStatus('/test');
      expect(status.isDetached).toBe(true);
      expect(status.branch).toBeNull();
    });

    it('parses upstream', async () => {
      mockGitResponse('true', '', 0);
      mockGitResponse('# branch.head main\n# branch.upstream origin/main\n', '', 0);
      const status = await manager.getStatus('/test');
      expect(status.upstream).toBe('origin/main');
    });

    it('parses ahead/behind counts', async () => {
      mockGitResponse('true', '', 0);
      mockGitResponse('# branch.head main\n# branch.ab +3 -2\n', '', 0);
      const status = await manager.getStatus('/test');
      expect(status.ahead).toBe(3);
      expect(status.behind).toBe(2);
    });

    it('parses staged file', async () => {
      mockGitResponse('true', '', 0);
      mockGitResponse('# branch.head main\n1 M. N... 100644 100644 100644 abc123 def456 src/file.ts\n', '', 0);
      const status = await manager.getStatus('/test');
      expect(status.stagedCount).toBe(1);
      expect(status.files).toHaveLength(1);
      expect(status.files[0].area).toBe('staged');
      expect(status.files[0].indexStatus).toBe('modified');
    });

    it('parses unstaged file', async () => {
      mockGitResponse('true', '', 0);
      mockGitResponse('# branch.head main\n1 .M N... 100644 100644 100644 abc123 def456 src/file.ts\n', '', 0);
      const status = await manager.getStatus('/test');
      expect(status.unstagedCount).toBe(1);
      expect(status.files).toHaveLength(1);
      expect(status.files[0].area).toBe('unstaged');
    });

    it('parses both staged and unstaged changes on same file', async () => {
      mockGitResponse('true', '', 0);
      mockGitResponse('# branch.head main\n1 MM N... 100644 100644 100644 abc123 def456 src/file.ts\n', '', 0);
      const status = await manager.getStatus('/test');
      expect(status.stagedCount).toBe(1);
      expect(status.unstagedCount).toBe(1);
      expect(status.files).toHaveLength(2);
    });

    it('parses untracked files', async () => {
      mockGitResponse('true', '', 0);
      mockGitResponse('# branch.head main\n? new-file.ts\n', '', 0);
      const status = await manager.getStatus('/test');
      expect(status.untrackedCount).toBe(1);
      expect(status.files[0].area).toBe('untracked');
    });

    it('parses renamed entries', async () => {
      mockGitResponse('true', '', 0);
      mockGitResponse('# branch.head main\n2 R. N... 100644 100644 100644 abc123 def456 R100 new.ts\told.ts\n', '', 0);
      const status = await manager.getStatus('/test');
      expect(status.stagedCount).toBe(1);
      expect(status.unstagedCount).toBe(0);
      expect(status.files).toHaveLength(1);
      expect(status.files[0].indexStatus).toBe('renamed');
    });

    it('parses renamed-then-modified entries (RM) as both staged and unstaged', async () => {
      mockGitResponse('true', '', 0);
      mockGitResponse('# branch.head main\n2 RM N... 100644 100644 100644 abc123 def456 R100 new.ts\told.ts\n', '', 0);
      const status = await manager.getStatus('/test');
      expect(status.stagedCount).toBe(1);
      expect(status.unstagedCount).toBe(1);
      expect(status.files).toHaveLength(2);

      const staged = status.files.find(f => f.area === 'staged');
      expect(staged?.indexStatus).toBe('renamed');
      expect(staged?.originalPath).toBe('old.ts');

      const unstaged = status.files.find(f => f.area === 'unstaged');
      expect(unstaged?.workTreeStatus).toBe('modified');
      expect(unstaged?.originalPath).toBe('old.ts');
      expect(unstaged?.path).toBe('new.ts');
    });

    it('parses renamed-then-deleted entries (RD) as an unstaged deletion', async () => {
      mockGitResponse('true', '', 0);
      mockGitResponse('# branch.head main\n2 RD N... 100644 100644 100644 abc123 def456 R100 new.ts\told.ts\n', '', 0);
      const status = await manager.getStatus('/test');
      expect(status.stagedCount).toBe(1);
      expect(status.unstagedCount).toBe(1);

      const unstaged = status.files.find(f => f.area === 'unstaged');
      expect(unstaged?.workTreeStatus).toBe('deleted');
      expect(unstaged?.originalPath).toBe('old.ts');
    });

    it('parses unmerged entries', async () => {
      mockGitResponse('true', '', 0);
      mockGitResponse('# branch.head main\nu UU N... 100644 100644 100644 100644 abc123 def456 ghi789 conflict.ts\n', '', 0);
      const status = await manager.getStatus('/test');
      expect(status.hasConflicts).toBe(true);
      expect(status.conflictedCount).toBe(1);
      expect(status.files[0].area).toBe('conflicted');
    });
  });

  describe('getBranches', () => {
    it('parses current branch with asterisk', async () => {
      mockGitResponse('* main origin/main [ahead 1]\ndev origin/dev\n', '', 0);
      const branches = await manager.getBranches('/test');
      expect(branches).toHaveLength(2);
      expect(branches[0].name).toBe('main');
      expect(branches[0].isCurrent).toBe(true);
      expect(branches[0].upstream).toBe('origin/main');
      expect(branches[0].ahead).toBe(1);
    });

    it('parses branch behind remote', async () => {
      mockGitResponse('* main origin/main [behind 5]\n', '', 0);
      const branches = await manager.getBranches('/test');
      expect(branches[0].behind).toBe(5);
    });

    it('parses ahead and behind', async () => {
      mockGitResponse('* main origin/main [ahead 2, behind 3]\n', '', 0);
      const branches = await manager.getBranches('/test');
      expect(branches[0].ahead).toBe(2);
      expect(branches[0].behind).toBe(3);
    });

    it('handles branch without upstream', async () => {
      mockGitResponse('feature-x\n', '', 0);
      const branches = await manager.getBranches('/test');
      expect(branches[0].name).toBe('feature-x');
      expect(branches[0].upstream).toBeNull();
    });

    it('returns empty on error', async () => {
      mockGitResponse('', 'error', 1);
      const branches = await manager.getBranches('/test');
      expect(branches).toEqual([]);
    });
  });

  describe('commit', () => {
    it('returns success with hash on successful commit', async () => {
      mockGitResponse('[main abc1234] feat: add tests\n 1 file changed', '', 0);
      const result = await manager.commit({
        workingDirectory: '/test',
        message: 'feat: add tests',
        createCheckpoint: false,
        sessionId: null,
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('abc1234');
    });

    it('returns error on failure', async () => {
      mockGitResponse('', 'nothing to commit', 1);
      const result = await manager.commit({
        workingDirectory: '/test',
        message: 'test',
        createCheckpoint: false,
        sessionId: null,
      });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NOTHING_TO_COMMIT');
    });
  });

  describe('generateMessage', () => {
    it('returns low confidence when no staged changes', async () => {
      mockGitResponse('', '', 0); // numstat empty
      mockGitResponse('', '', 0); // name-only empty
      const result = await manager.generateMessage('/test');
      expect(result.confidence).toBe('low');
      expect(result.type).toBe('chore');
    });

    it('detects test commit type', async () => {
      mockGitResponse('5\t0\tsrc/test.spec.ts', '', 0);
      mockGitResponse('src/test.spec.ts', '', 0);
      const result = await manager.generateMessage('/test');
      expect(result.type).toBe('test');
      expect(result.confidence).toBe('high');
    });

    it('detects docs commit type', async () => {
      mockGitResponse('10\t2\tdocs/README.md', '', 0);
      mockGitResponse('docs/README.md', '', 0);
      const result = await manager.generateMessage('/test');
      expect(result.type).toBe('docs');
      expect(result.confidence).toBe('high');
    });

    it('detects CI commit type', async () => {
      mockGitResponse('5\t2\t.github/workflows/ci.yml', '', 0);
      mockGitResponse('.github/workflows/ci.yml', '', 0);
      const result = await manager.generateMessage('/test');
      expect(result.type).toBe('ci');
      expect(result.confidence).toBe('high');
    });

    it('detects build commit type', async () => {
      mockGitResponse('3\t1\tpackage.json', '', 0);
      mockGitResponse('package.json', '', 0);
      const result = await manager.generateMessage('/test');
      expect(result.type).toBe('build');
      expect(result.confidence).toBe('medium');
    });

    it('detects feat type for pure additions', async () => {
      mockGitResponse('50\t0\tsrc/new-feature.ts', '', 0);
      mockGitResponse('src/new-feature.ts', '', 0);
      const result = await manager.generateMessage('/test');
      expect(result.type).toBe('feat');
    });

    it('infers scope from single directory', async () => {
      mockGitResponse('10\t5\tsrc/main/file1.ts\n8\t3\tsrc/main/file2.ts', '', 0);
      mockGitResponse('src/main/file1.ts\nsrc/main/file2.ts', '', 0);
      const result = await manager.generateMessage('/test');
      expect(result.scope).toBe('src');
    });

    it('generates message with conventional commits format', async () => {
      mockGitResponse('10\t0\tsrc/new.ts', '', 0);
      mockGitResponse('src/new.ts', '', 0);
      const result = await manager.generateMessage('/test');
      expect(result.message).toMatch(/^\w+(\(\w+\))?: .+$/);
    });

    it('uses correct verb for additions', async () => {
      mockGitResponse('20\t0\tsrc/component.tsx', '', 0);
      mockGitResponse('src/component.tsx', '', 0);
      const result = await manager.generateMessage('/test');
      expect(result.description).toMatch(/^add /);
    });
  });

  describe('detectErrorCode (via makeError)', () => {
    it('detects NOT_A_REPO', async () => {
      mockGitResponse('', 'fatal: not a git repository', 128);
      const result = await manager.stageFiles('/test', ['file.ts']);
      expect(result.errorCode).toBe('NOT_A_REPO');
    });

    it('detects AUTH_FAILED', async () => {
      mockGitResponse('', 'fatal: Authentication failed for', 128);
      const result = await manager.stageFiles('/test', ['file.ts']);
      expect(result.errorCode).toBe('AUTH_FAILED');
    });

    it('detects MERGE_CONFLICTS', async () => {
      mockGitResponse('', 'error: merge conflict in file.ts', 1);
      const result = await manager.stageFiles('/test', ['file.ts']);
      expect(result.errorCode).toBe('MERGE_CONFLICTS');
    });

    it('detects NO_UPSTREAM', async () => {
      mockGitResponse('', 'fatal: The current branch has no upstream branch', 1);
      const result = await manager.stageFiles('/test', ['file.ts']);
      expect(result.errorCode).toBe('NO_UPSTREAM');
    });

    it('detects PUSH_REJECTED', async () => {
      mockGitResponse('', 'rejected non-fast-forward', 1);
      const result = await manager.stageFiles('/test', ['file.ts']);
      expect(result.errorCode).toBe('PUSH_REJECTED');
    });

    it('detects NOTHING_TO_COMMIT', async () => {
      mockGitResponse('', 'nothing to commit, working tree clean', 1);
      const result = await manager.stageFiles('/test', ['file.ts']);
      expect(result.errorCode).toBe('NOTHING_TO_COMMIT');
    });
  });

  describe('log', () => {
    it('parses commit entries with shortstat', async () => {
      const stdout = [
        'abcdef1234567890abcdef1234567890abcdef12|abc1234|John Doe|john@test.com|2024-01-15T10:30:00+00:00|feat: add feature',
        ' 3 files changed, 45 insertions(+), 12 deletions(-)',
        '',
      ].join('\n');
      mockGitResponse(stdout, '', 0);
      const log = await manager.log('/test', 10);
      expect(log).toHaveLength(1);
      expect(log[0].shortHash).toBe('abc1234');
      expect(log[0].authorName).toBe('John Doe');
      expect(log[0].subject).toBe('feat: add feature');
      expect(log[0].filesChanged).toBe(3);
      expect(log[0].insertions).toBe(45);
      expect(log[0].deletions).toBe(12);
    });

    it('returns empty on error', async () => {
      mockGitResponse('', 'error', 1);
      const log = await manager.log('/test');
      expect(log).toEqual([]);
    });
  });

  describe('commitDiff', () => {
    it('parses log + stat output into a GitCommitInfo, preserving a pipe in the subject', async () => {
      const hash = 'abcdef1234567890abcdef1234567890abcdef12';
      mockGitResponse(
        `${hash}|abc1234|John Doe|john@test.com|2024-01-15T10:30:00+00:00|feat: add A|B feature`,
        '',
        0,
      );
      mockGitResponse(
        [' src/foo.ts | 10 ++++---', ' 1 file changed, 6 insertions(+), 4 deletions(-)', ''].join('\n'),
        '',
        0,
      );

      const commit = await manager.commitDiff('/test', hash);

      expect(mockExecFile).toHaveBeenCalledTimes(2);
      expect(mockExecFile).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        expect.arrayContaining(['log', '-1', hash, '--']),
        expect.anything(),
        expect.any(Function),
      );
      expect(mockExecFile).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.arrayContaining(['diff-tree', hash, '--']),
        expect.anything(),
        expect.any(Function),
      );
      expect(commit.hash).toBe(hash);
      expect(commit.shortHash).toBe('abc1234');
      expect(commit.authorName).toBe('John Doe');
      expect(commit.authorEmail).toBe('john@test.com');
      // Subject contains a literal '|' — must be rejoined, not truncated at the first split.
      expect(commit.subject).toBe('feat: add A|B feature');
      expect(commit.filesChanged).toBe(1);
      expect(commit.insertions).toBe(6);
      expect(commit.deletions).toBe(4);
    });

    it('sets filesChanged from a stat summary with no insertions/deletions parenthetical', async () => {
      const hash = '1234567890abcdef1234567890abcdef12345678';
      mockGitResponse(`${hash}|1234567|Jane Doe|jane@test.com|2024-02-01T00:00:00+00:00|chore: rename files`, '', 0);
      mockGitResponse([' 2 files changed', ''].join('\n'), '', 0);

      const commit = await manager.commitDiff('/test', hash);

      expect(commit.filesChanged).toBe(2);
      expect(commit.insertions).toBe(0);
      expect(commit.deletions).toBe(0);
    });

    it('rejects a hash-like argument that could be parsed by git as an option, without calling execFile', async () => {
      await expect(
        manager.commitDiff('/test', '--output=/tmp/pwned'),
      ).rejects.toThrow(/Invalid commit hash/);
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('rejects a short flag-like hash, without calling execFile', async () => {
      await expect(manager.commitDiff('/test', '-1')).rejects.toThrow(/Invalid commit hash/);
      expect(mockExecFile).not.toHaveBeenCalled();
    });
  });

  describe('switchBranch', () => {
    it('checks out an existing branch', async () => {
      mockGitResponse('', '', 0);

      const result = await manager.switchBranch('/test', 'feature/foo');

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      expect(mockExecFile).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        expect.arrayContaining(['checkout', '--end-of-options', 'feature/foo']),
        expect.anything(),
        expect.any(Function),
      );
      expect(result.success).toBe(true);
    });

    it('rejects a branch name that could be parsed as a git option, without calling execFile', async () => {
      const result = await manager.switchBranch('/test', '-f');

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Invalid branch name/);
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('rejects an --orphan-style branch name, without calling execFile', async () => {
      const result = await manager.switchBranch('/test', '--orphan');

      expect(result.success).toBe(false);
      expect(mockExecFile).not.toHaveBeenCalled();
    });
  });

  describe('createBranch', () => {
    it('creates and checks out a new branch', async () => {
      mockGitResponse('', '', 0);

      const result = await manager.createBranch('/test', 'feature/bar');

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      expect(mockExecFile).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        expect.arrayContaining(['checkout', '-b', '--end-of-options', 'feature/bar']),
        expect.anything(),
        expect.any(Function),
      );
      expect(result.success).toBe(true);
    });

    it('rejects a branch name that could be parsed as a git option, without calling execFile', async () => {
      const result = await manager.createBranch('/test', '-f');

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Invalid branch name/);
      expect(mockExecFile).not.toHaveBeenCalled();
    });
  });

  describe('staging operations', () => {
    it('stageFiles returns success', async () => {
      mockGitResponse('', '', 0);
      const result = await manager.stageFiles('/test', ['file.ts']);
      expect(result.success).toBe(true);
    });

    it('unstageFiles returns success', async () => {
      mockGitResponse('', '', 0);
      const result = await manager.unstageFiles('/test', ['file.ts']);
      expect(result.success).toBe(true);
    });

    it('stageAll returns success', async () => {
      mockGitResponse('', '', 0);
      const result = await manager.stageAll('/test');
      expect(result.success).toBe(true);
    });

    it('unstageAll returns success', async () => {
      mockGitResponse('', '', 0);
      const result = await manager.unstageAll('/test');
      expect(result.success).toBe(true);
    });
  });

  describe('fileContent', () => {
    it('reads a relative path inside workDir and formats it as an add-diff', async () => {
      mockReadFile.mockResolvedValueOnce('line1\nline2\n');
      const result = await manager.fileContent('/test/repo', 'src/foo.ts');

      expect(mockReadFile).toHaveBeenCalledWith(
        path.resolve('/test/repo', 'src/foo.ts'),
        'utf-8',
      );
      expect(result.filePath).toBe('src/foo.ts');
      expect(result.diff).toContain('+line1');
      expect(result.diff).toContain('+line2');
      expect(result.isTruncated).toBe(false);
    });

    it('rejects a ../ traversal path that escapes workDir', async () => {
      await expect(
        manager.fileContent('/test/repo', '../../etc/passwd'),
      ).rejects.toThrow(/escapes workDir/);
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('rejects an absolute path outside workDir', async () => {
      const outside = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd';
      await expect(
        manager.fileContent('/test/repo', outside),
      ).rejects.toThrow(/escapes workDir/);
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('allows a path that traverses out and back in, staying within workDir', async () => {
      mockReadFile.mockResolvedValueOnce('content\n');
      const result = await manager.fileContent('/test/repo', 'sub/../file.txt');

      expect(mockReadFile).toHaveBeenCalledWith(
        path.resolve('/test/repo', 'sub/../file.txt'),
        'utf-8',
      );
      expect(result.diff).toContain('+content');
    });
  });

  describe('watching', () => {
    it('stopWatching returns true even with no watcher', () => {
      const result = manager.stopWatching('/test');
      expect(result).toBe(true);
    });

    describe('watcher error handling (regression for #99)', () => {
      let watchers: Array<EventEmitter & { close: ReturnType<typeof vi.fn> }>;

      beforeEach(() => {
        watchers = [];
        mockExistsSync.mockReturnValue(true); // gitDir and indexPath both "exist"
        mockWatch.mockImplementation(() => {
          const w = fakeWatcher();
          watchers.push(w);
          return w;
        });
      });

      it('registers an error listener on both the dir watcher and the index watcher', () => {
        const ok = manager.startWatching('/repo');
        expect(ok).toBe(true);
        expect(watchers.length).toBe(2); // [0] = .git dir watcher, [1] = .git/index watcher
        expect(watchers[0].listenerCount('error')).toBeGreaterThan(0);
        expect(watchers[1].listenerCount('error')).toBeGreaterThan(0);
      });

      it('dir watcher "error" is caught, logged, and stops watching without throwing', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        manager.startWatching('/repo');
        const [dirWatcher, indexWatcher] = watchers;

        expect(() => dirWatcher.emit('error', new Error('boom'))).not.toThrow();

        expect(warnSpy).toHaveBeenCalledWith('[GitManager] Watch error for', '/repo', expect.any(Error));
        expect(dirWatcher.close).toHaveBeenCalled();
        expect(indexWatcher.close).toHaveBeenCalled(); // stopWatching closes both entries

        warnSpy.mockRestore();
      });

      it('index watcher "error" is caught, logged, and stops watching without throwing (the #99 crash path)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        manager.startWatching('/repo');
        const [dirWatcher, indexWatcher] = watchers;

        // Before the fix, this emit had no listener and Node would throw it as an
        // uncaught exception, crashing the Electron main process.
        expect(() => indexWatcher.emit('error', new Error('boom'))).not.toThrow();

        expect(warnSpy).toHaveBeenCalledWith('[GitManager] Index watch error for', '/repo', expect.any(Error));
        expect(dirWatcher.close).toHaveBeenCalled();
        expect(indexWatcher.close).toHaveBeenCalled();

        warnSpy.mockRestore();
      });
    });
  });

  describe('listWorktrees (parseWorktreeListPorcelain)', () => {
    function mockVersionThenPorcelain(porcelain: string) {
      mockGitResponse('git version 2.42.0', '', 0); // getGitVersion()
      mockGitResponse(porcelain, '', 0); // worktree list --porcelain
    }

    it('returns [] when git version is below 2.5', async () => {
      mockGitResponse('git version 2.4.9', '', 0);
      const result = await manager.listWorktrees('/repo');
      expect(result).toEqual([]);
    });

    it('parses a main worktree plus a linked worktree, marking only the first as main', async () => {
      const porcelain = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo-worktrees/feature',
        'HEAD def456',
        'branch refs/heads/feature-x',
        '',
      ].join('\n');
      mockVersionThenPorcelain(porcelain);

      const result = await manager.listWorktrees('/repo');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        path: '/repo',
        head: 'abc123',
        branch: 'main',
        isMainWorktree: true,
        isBare: false,
        isLocked: false,
        isPrunable: false,
        linkedSessionId: null,
        managedByOmniDesk: false,
      });
      expect(result[1]).toMatchObject({
        path: '/repo-worktrees/feature',
        head: 'def456',
        branch: 'feature-x',
        isMainWorktree: false,
        linkedSessionId: null,
        managedByOmniDesk: false,
      });
    });

    it('parses a detached HEAD worktree with branch: null', async () => {
      const porcelain = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo-worktrees/detached',
        'HEAD 789abc',
        'detached',
        '',
      ].join('\n');
      mockVersionThenPorcelain(porcelain);

      const result = await manager.listWorktrees('/repo');

      expect(result[1]).toMatchObject({
        path: '/repo-worktrees/detached',
        head: '789abc',
        branch: null,
        isMainWorktree: false,
      });
    });

    it('parses the bare flag', async () => {
      const porcelain = ['worktree /repo.git', 'bare', ''].join('\n');
      mockVersionThenPorcelain(porcelain);

      const result = await manager.listWorktrees('/repo');

      expect(result[0]).toMatchObject({ path: '/repo.git', isBare: true, isMainWorktree: true });
    });

    it('parses the locked flag, with and without a reason', async () => {
      const porcelain = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo-worktrees/locked',
        'HEAD def456',
        'branch refs/heads/locked-branch',
        'locked some reason',
        '',
      ].join('\n');
      mockVersionThenPorcelain(porcelain);

      const result = await manager.listWorktrees('/repo');

      expect(result[1]).toMatchObject({ path: '/repo-worktrees/locked', isLocked: true });
    });

    it('parses the prunable flag, with and without a reason', async () => {
      const porcelain = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo-worktrees/gone',
        'HEAD def456',
        'branch refs/heads/gone-branch',
        'prunable gitdir file points to non-existent location',
        '',
      ].join('\n');
      mockVersionThenPorcelain(porcelain);

      const result = await manager.listWorktrees('/repo');

      expect(result[1]).toMatchObject({ path: '/repo-worktrees/gone', isPrunable: true });
    });

    it('preserves worktree paths containing spaces', async () => {
      const porcelain = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo worktrees/my feature',
        'HEAD def456',
        'branch refs/heads/my-feature',
        '',
      ].join('\n');
      mockVersionThenPorcelain(porcelain);

      const result = await manager.listWorktrees('/repo');

      expect(result[1].path).toBe('/repo worktrees/my feature');
    });

    it('always reports linkedSessionId: null and managedByOmniDesk: false at this layer (reconciliation happens in ipc-handlers)', async () => {
      const porcelain = ['worktree /repo', 'HEAD abc123', 'branch refs/heads/main', ''].join('\n');
      mockVersionThenPorcelain(porcelain);

      const result = await manager.listWorktrees('/repo');

      expect(result[0].linkedSessionId).toBeNull();
      expect(result[0].managedByOmniDesk).toBe(false);
    });
  });

  describe('addWorktree', () => {
    const settings = { basePath: 'custom', customBasePath: '/base', cleanupOnSessionClose: 'ask' } as const;

    it('rejects a customPath beginning with "-" without spawning execGit', async () => {
      mockGitResponse('git version 2.42.0', '', 0); // getGitVersion()
      const result = await manager.addWorktree(
        { mainRepoPath: '/repo', branch: 'feature-x', isNewBranch: false, customPath: '--force' },
        settings
      );
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Invalid worktree path/);
      expect(mockExecFile).toHaveBeenCalledTimes(1); // only getGitVersion, no worktree add
    });

    it('rejects a branch beginning with "-" without spawning execGit', async () => {
      mockGitResponse('git version 2.42.0', '', 0);
      const result = await manager.addWorktree(
        { mainRepoPath: '/repo', branch: '--upload-pack=evil', isNewBranch: false },
        settings
      );
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Invalid branch name/);
      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });

    it('rejects a baseBranch beginning with "-" without spawning execGit', async () => {
      mockGitResponse('git version 2.42.0', '', 0);
      const result = await manager.addWorktree(
        { mainRepoPath: '/repo', branch: 'feature-x', isNewBranch: true, baseBranch: '-b' },
        settings
      );
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Invalid base branch name/);
      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });

    it('creates a worktree with a new branch, passing --end-of-options before the path', async () => {
      mockExistsSync.mockReturnValueOnce(true); // parent dir already exists, skip mkdirSync
      mockGitResponse('git version 2.42.0', '', 0);
      mockGitResponse('', '', 0); // worktree add

      const result = await manager.addWorktree(
        { mainRepoPath: '/repo', branch: 'feature-x', isNewBranch: true },
        settings
      );

      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        ['worktree', 'add', '-b', 'feature-x', '--end-of-options', path.join('/base', 'feature-x')],
        expect.anything(),
        expect.any(Function)
      );
    });

    it('creates a worktree with a new branch and baseBranch appended after the path', async () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockGitResponse('git version 2.42.0', '', 0);
      mockGitResponse('', '', 0);

      const result = await manager.addWorktree(
        { mainRepoPath: '/repo', branch: 'feature-x', isNewBranch: true, baseBranch: 'develop' },
        settings
      );

      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        ['worktree', 'add', '-b', 'feature-x', '--end-of-options', path.join('/base', 'feature-x'), 'develop'],
        expect.anything(),
        expect.any(Function)
      );
    });

    it('creates a worktree for an existing branch, with --end-of-options before the path and branch after', async () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockGitResponse('git version 2.42.0', '', 0);
      mockGitResponse('', '', 0);

      const result = await manager.addWorktree(
        { mainRepoPath: '/repo', branch: 'feature-x', isNewBranch: false },
        settings
      );

      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        ['worktree', 'add', '--end-of-options', path.join('/base', 'feature-x'), 'feature-x'],
        expect.anything(),
        expect.any(Function)
      );
    });
  });

  describe('removeWorktree', () => {
    it('rejects a worktreePath beginning with "-" without spawning execGit', async () => {
      const result = await manager.removeWorktree({
        mainRepoPath: '/repo',
        worktreePath: '--force',
        force: false,
      });
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Invalid worktree path/);
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('removes a worktree, passing --end-of-options before the path', async () => {
      mockGitResponse('', '', 0);
      const result = await manager.removeWorktree({
        mainRepoPath: '/repo',
        worktreePath: '/repo-worktrees/feature-x',
        force: false,
      });
      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        ['worktree', 'remove', '--end-of-options', '/repo-worktrees/feature-x'],
        expect.anything(),
        expect.any(Function)
      );
    });

    it('removes a worktree with force, placing --force before --end-of-options', async () => {
      mockGitResponse('', '', 0);
      const result = await manager.removeWorktree({
        mainRepoPath: '/repo',
        worktreePath: '/repo-worktrees/feature-x',
        force: true,
      });
      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        ['worktree', 'remove', '--force', '--end-of-options', '/repo-worktrees/feature-x'],
        expect.anything(),
        expect.any(Function)
      );
    });
  });

  describe('worktree path naming', () => {
    describe('sanitizeBranchNameForDir', () => {
      it('replaces forward slashes with a dash', () => {
        expect(manager.sanitizeBranchNameForDir('feature/foo')).toBe('feature-foo');
      });

      it('replaces backslashes with a dash', () => {
        expect(manager.sanitizeBranchNameForDir('feature\\bar')).toBe('feature-bar');
      });

      it('neutralizes path traversal sequences (no ".." or separator survives)', () => {
        const result = manager.sanitizeBranchNameForDir('../../etc');
        expect(result).not.toContain('..');
        expect(result).not.toMatch(/[/\\]/);
      });

      it('rewrites a leading dot to an underscore', () => {
        expect(manager.sanitizeBranchNameForDir('.hidden')).toBe('_hidden');
      });

      it('rewrites a trailing ".lock" (case-insensitive)', () => {
        expect(manager.sanitizeBranchNameForDir('HEAD.lock')).toBe('HEAD_lock');
        expect(manager.sanitizeBranchNameForDir('HEAD.LOCK')).toBe('HEAD_lock');
      });

      it('strips git-invalid and whitespace characters, then collapses dashes', () => {
        expect(manager.sanitizeBranchNameForDir('wip: fix? [x]')).toBe('wip-fix-x');
      });

      it('collapses repeated dashes produced by adjacent separators', () => {
        expect(manager.sanitizeBranchNameForDir('a//b')).toBe('a-b');
        expect(manager.sanitizeBranchNameForDir('a--b')).toBe('a-b');
      });

      it('trims leading and trailing dashes', () => {
        expect(manager.sanitizeBranchNameForDir('-foo-')).toBe('foo');
      });

      it('caps the result at 100 characters', () => {
        const longName = 'a'.repeat(120);
        const result = manager.sanitizeBranchNameForDir(longName);
        expect(result).toHaveLength(100);
        expect(result).toBe('a'.repeat(100));
      });

      it('falls back to "worktree" when sanitizing yields an empty string', () => {
        expect(manager.sanitizeBranchNameForDir('///')).toBe('worktree');
      });
    });

    describe('computeWorktreePath', () => {
      const mainRepoPath = path.join('some', 'nested', 'myrepo');
      const repoName = path.basename(mainRepoPath);

      it('sibling: joins <dirname(mainRepoPath)>/<repoName>-worktrees/<sanitized>', () => {
        const settings = { basePath: 'sibling', cleanupOnSessionClose: 'ask' } as const;
        const result = manager.computeWorktreePath(mainRepoPath, 'feature/x', settings);
        expect(result).toBe(path.join(path.dirname(mainRepoPath), `${repoName}-worktrees`, 'feature-x'));
      });

      it('subdirectory: joins <mainRepoPath>/.worktrees/<sanitized>', () => {
        const settings = { basePath: 'subdirectory', cleanupOnSessionClose: 'ask' } as const;
        const result = manager.computeWorktreePath(mainRepoPath, 'feature/x', settings);
        expect(result).toBe(path.join(mainRepoPath, '.worktrees', 'feature-x'));
      });

      it('custom with customBasePath: joins <customBasePath>/<sanitized>', () => {
        const customBasePath = path.join('custom', 'base');
        const settings = { basePath: 'custom', customBasePath, cleanupOnSessionClose: 'ask' } as const;
        const result = manager.computeWorktreePath(mainRepoPath, 'feature/x', settings);
        expect(result).toBe(path.join(customBasePath, 'feature-x'));
      });

      it('custom without customBasePath: falls back to the sibling-style default', () => {
        const settings = { basePath: 'custom', cleanupOnSessionClose: 'ask' } as const;
        const result = manager.computeWorktreePath(mainRepoPath, 'feature/x', settings);
        expect(result).toBe(path.join(path.dirname(mainRepoPath), `${repoName}-worktrees`, 'feature-x'));
      });

      it('sanitizes the branch name before joining it into the path', () => {
        const settings = { basePath: 'subdirectory', cleanupOnSessionClose: 'ask' } as const;
        const result = manager.computeWorktreePath(mainRepoPath, 'wip: fix? [x]', settings);
        expect(path.basename(result)).toBe('wip-fix-x');
      });
    });
  });

  describe('destroy', () => {
    it('cleans up watchers and timers', () => {
      manager.destroy();
      // Should not throw
    });
  });
});
