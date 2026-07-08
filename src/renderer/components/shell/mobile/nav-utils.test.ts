import { describe, it, expect } from 'vitest';
import { repoIdForSession } from './nav-utils';

const repos = [
  { id: 'r1', name: 'demo', path: '/demo' },
  { id: 'r2', name: 'api', path: '/api' },
] as any;

const sessions = [
  { id: 's1', name: 'work', mainRepoPath: '/demo', workingDirectory: '/demo' },
  { id: 's2', name: 'tests', mainRepoPath: '/api', workingDirectory: '/api' },
  { id: 's3', name: 'nested', workingDirectory: '/demo/packages/app' }, // path-prefix match
] as any;

describe('repoIdForSession', () => {
  it('maps a session to its owning repo via mainRepoPath', () => {
    expect(repoIdForSession(repos, sessions, 's1')).toBe('r1');
    expect(repoIdForSession(repos, sessions, 's2')).toBe('r2');
  });
  it('maps via working-directory path prefix', () => {
    expect(repoIdForSession(repos, sessions, 's3')).toBe('r1');
  });
  it('returns undefined for an unknown session id', () => {
    expect(repoIdForSession(repos, sessions, 'nope')).toBeUndefined();
  });
  it('returns undefined when no repo matches (orphan session)', () => {
    const orphan = [{ id: 'x', name: 'x', workingDirectory: '/somewhere/else' }] as any;
    expect(repoIdForSession(repos, orphan, 'x')).toBeUndefined();
  });
});
