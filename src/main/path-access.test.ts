import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import { isPathAllowed, approvePickedRoot, _resetApprovedRoots } from './path-access';

// Build absolute paths valid on whatever OS runs the test (Windows or POSIX).
const home = path.resolve(path.sep + path.join('users', 'me'));
const outsideRoot = path.resolve(path.sep + path.join('code', 'external'));
const repo = path.join(outsideRoot, 'omnidesk');

describe('isPathAllowed', () => {
  beforeEach(() => _resetApprovedRoots());

  it('allows paths within the home directory', () => {
    expect(isPathAllowed(path.join(home, 'project'), home, [])).toBe(true);
  });

  it('allows paths within a registered workspace', () => {
    expect(isPathAllowed(repo, home, [outsideRoot])).toBe(true);
  });

  it('blocks paths outside home and workspaces by default', () => {
    expect(isPathAllowed(repo, home, [])).toBe(false);
  });

  it('allows a folder the user explicitly picked via the native dialog', () => {
    approvePickedRoot(repo);
    expect(isPathAllowed(repo, home, [])).toBe(true);
  });

  it('allows descendants of a picked folder so repo detection can scan it', () => {
    approvePickedRoot(outsideRoot);
    expect(isPathAllowed(path.join(outsideRoot, 'omnidesk', '.git'), home, [])).toBe(true);
  });

  it('does not approve siblings of a picked folder', () => {
    approvePickedRoot(repo);
    const sibling = path.join(outsideRoot, 'other-repo');
    expect(isPathAllowed(sibling, home, [])).toBe(false);
  });
});
