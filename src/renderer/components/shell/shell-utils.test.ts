import { describe, it, expect } from 'vitest';
import { resolveSessionWorktree, isSessionStopped, formatWaitDuration } from './shell-utils';

describe('formatWaitDuration', () => {
  it('is "just now" for anything under 5s, including 0', () => {
    expect(formatWaitDuration(0)).toBe('just now');
    expect(formatWaitDuration(4999)).toBe('just now');
  });

  it('renders seconds from 5s up to (not including) 60s', () => {
    expect(formatWaitDuration(5000)).toBe('5s');
    expect(formatWaitDuration(59000)).toBe('59s');
  });

  it('renders minutes from 60s up to (not including) 60m', () => {
    expect(formatWaitDuration(60000)).toBe('1m');
    expect(formatWaitDuration(59 * 60000)).toBe('59m');
  });

  it('renders hours from 60m onward', () => {
    expect(formatWaitDuration(60 * 60000)).toBe('1h');
    expect(formatWaitDuration(5 * 60 * 60000 + 1)).toBe('5h');
  });

  it('clamps negative elapsed (clock skew) to "just now" instead of throwing', () => {
    expect(formatWaitDuration(-500)).toBe('just now');
  });
});

describe('isSessionStopped', () => {
  it('is true only once the process is gone (exited or errored)', () => {
    expect(isSessionStopped('exited')).toBe(true);
    expect(isSessionStopped('error')).toBe(true);
  });

  it('is false while running', () => {
    expect(isSessionStopped('running')).toBe(false);
  });

  it('is false while starting — the restart overlay must not flash during launch', () => {
    // Regression: the old `status !== 'running'` derivation treated 'starting'
    // as stopped, briefly showing the "This session has stopped" overlay.
    expect(isSessionStopped('starting' as never)).toBe(false);
  });
});

describe('resolveSessionWorktree', () => {
  const repo = { path: 'C:/repos/omnidesk', branch: 'main' };

  it('new mode creates a new-branch worktree forked off baseBranch', () => {
    const r = resolveSessionWorktree(
      { worktreeMode: 'new', branch: 'feat/x', baseBranch: 'develop' },
      repo,
    );
    expect(r.cwd).toBe(repo.path);
    expect(r.worktree).toEqual({
      mainRepoPath: repo.path,
      branch: 'feat/x',
      isNewBranch: true,
      baseBranch: 'develop',
    });
  });

  it('existing mode on a DIFFERENT branch creates a worktree', () => {
    const r = resolveSessionWorktree(
      { worktreeMode: 'existing', branch: 'feature-a' },
      repo,
    );
    expect(r.cwd).toBe(repo.path);
    expect(r.worktree).toEqual({
      mainRepoPath: repo.path,
      branch: 'feature-a',
      isNewBranch: false,
    });
  });

  // Regression: picking the repo's CURRENT branch in "Existing" mode must not
  // request a worktree — git forbids a second worktree on the checked-out
  // branch ("'main' is already used by worktree at ..."). Run in main instead.
  it('existing mode on the CURRENT branch runs in the main checkout, no worktree', () => {
    const r = resolveSessionWorktree(
      { worktreeMode: 'existing', branch: 'main' },
      repo,
    );
    expect(r.cwd).toBe(repo.path);
    expect(r.worktree).toBeUndefined();
  });

  it('share mode runs in the donor working directory', () => {
    const r = resolveSessionWorktree(
      { worktreeMode: 'share' },
      repo,
      'C:/repos/omnidesk-worktrees/feature-a',
    );
    expect(r.cwd).toBe('C:/repos/omnidesk-worktrees/feature-a');
    expect(r.worktree).toBeUndefined();
  });

  it('current mode runs in the main checkout, no worktree', () => {
    const r = resolveSessionWorktree({ worktreeMode: 'current' }, repo);
    expect(r.cwd).toBe(repo.path);
    expect(r.worktree).toBeUndefined();
  });
});
