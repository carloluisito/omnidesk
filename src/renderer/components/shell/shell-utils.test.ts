import { describe, it, expect } from 'vitest';
import { resolveSessionWorktree, isSessionStopped } from './shell-utils';

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
