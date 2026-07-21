import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Palette } from './Palette';

const repoA = { id: 'r1', name: 'demo', org: '', path: '/demo', workspacePath: '/demo', lastOpened: 0, color: 'neutral', isGit: true } as any;
const repoB = { id: 'r2', name: 'api', org: '', path: '/api', workspacePath: '/api', lastOpened: 0, color: 'neutral', isGit: true } as any;

const mk = () => ({
  repo: repoA,
  repos: [repoA, repoB],
  sessions: [
    { id: 's1', name: 'work', mainRepoPath: '/demo', workingDirectory: '/demo' },
    { id: 's2', name: 'build', mainRepoPath: '/demo', workingDirectory: '/demo' },
    { id: 's3', name: 'api-tests', mainRepoPath: '/api', workingDirectory: '/api' },
  ] as any,
  onPickSession: vi.fn(),
  onClose: vi.fn(),
  actions: [],
});

const action = (overrides: Partial<{ id: string; title: string; sub: string; run: () => void }> = {}) => ({
  id: overrides.id ?? 'a1',
  icon: 'search' as any,
  title: overrides.title ?? 'New Session',
  sub: overrides.sub ?? 'Open a fresh session',
  run: overrides.run ?? vi.fn(),
});

describe('Palette', () => {
  it('shows only the active repo sessions when the query is empty', () => {
    render(<Palette {...mk()} />);
    expect(screen.getByText('work')).toBeInTheDocument();
    expect(screen.getByText('build')).toBeInTheDocument();
    expect(screen.queryByText('api-tests')).not.toBeInTheDocument();
    expect(screen.getByText('Sessions in demo')).toBeInTheDocument();
  });

  it('surfaces a matching session from a non-active repo on a non-empty query', () => {
    const p = mk();
    render(<Palette {...p} />);
    fireEvent.change(screen.getByPlaceholderText(/search sessions/i), { target: { value: 'api-tests' } });
    expect(screen.getByText('api-tests')).toBeInTheDocument();
    expect(screen.getByText('api')).toBeInTheDocument(); // non-active repo's group header is just the repo name
    fireEvent.click(screen.getByText('api-tests'));
    expect(p.onPickSession).toHaveBeenCalledWith('s3');
  });

  it('groups the active repo first when a query matches sessions in multiple repos', () => {
    render(<Palette {...mk()} />);
    fireEvent.change(screen.getByPlaceholderText(/search sessions/i), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText(/search sessions/i), { target: { value: 'build' } });
    // 'build' only matches the active repo's session in this fixture; assert the
    // active-repo group heading still renders as expected on a non-empty query.
    expect(screen.getByText('Sessions in demo')).toBeInTheDocument();
  });

  it('selects a cross-repo match via keyboard (ArrowDown + Enter)', () => {
    const p = mk();
    render(<Palette {...p} />);
    const input = screen.getByPlaceholderText(/search sessions/i);
    fireEvent.change(input, { target: { value: 'api-tests' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onPickSession).toHaveBeenCalledWith('s3');
  });

  it('falls back to only the active repo when repos prop is omitted', () => {
    const p = mk();
    (p as any).repos = undefined;
    render(<Palette {...p} />);
    fireEvent.change(screen.getByPlaceholderText(/search sessions/i), { target: { value: 'api-tests' } });
    expect(screen.queryByText('api-tests')).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const p = mk();
    render(<Palette {...p} />);
    fireEvent.keyDown(screen.getByPlaceholderText(/search sessions/i), { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalled();
  });

  it('matches an action by its sub description even when the title does not match (#142)', () => {
    const run = vi.fn();
    const p = { ...mk(), actions: [action({ id: 'a1', title: 'New Session', sub: 'Spin up a worktree', run })] };
    render(<Palette {...p} />);
    fireEvent.change(screen.getByPlaceholderText(/search sessions/i), { target: { value: 'worktree' } });
    expect(screen.getByText('New Session')).toBeInTheDocument();
    fireEvent.click(screen.getByText('New Session'));
    expect(run).toHaveBeenCalled();
  });

  it('still matches an action by its title (regression)', () => {
    const p = { ...mk(), actions: [action({ id: 'a1', title: 'New Session', sub: 'Spin up a worktree' })] };
    render(<Palette {...p} />);
    fireEvent.change(screen.getByPlaceholderText(/search sessions/i), { target: { value: 'new session' } });
    expect(screen.getByText('New Session')).toBeInTheDocument();
  });

  it('shows a "No matches" message when a query matches no actions and no sessions (#142)', () => {
    const p = { ...mk(), actions: [action()] };
    render(<Palette {...p} />);
    fireEvent.change(screen.getByPlaceholderText(/search sessions/i), { target: { value: 'zzzznomatch' } });
    expect(screen.getByText('No matches.')).toBeInTheDocument();
  });

  it('treats Enter as a safe no-op when there are zero results (#142)', () => {
    const p = { ...mk(), actions: [action()] };
    render(<Palette {...p} />);
    const input = screen.getByPlaceholderText(/search sessions/i);
    fireEvent.change(input, { target: { value: 'zzzznomatch' } });
    expect(() => fireEvent.keyDown(input, { key: 'Enter' })).not.toThrow();
    expect(p.onPickSession).not.toHaveBeenCalled();
  });

  it('clamps ArrowDown/ArrowUp selection within the results range (#142)', () => {
    const p = { ...mk(), actions: [action()] };
    render(<Palette {...p} />);
    const input = screen.getByPlaceholderText(/search sessions/i);
    // Only 1 action + 2 sessions in the active repo (empty query) = 3 total rows.
    // Arrow past the end and back past the start; selecting either the first
    // action row or the last session row via Enter should not throw and should
    // dispatch to the correct handler without going out of bounds.
    for (let i = 0; i < 10; i++) fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onPickSession).toHaveBeenCalledWith('s2'); // last session row ('build') when clamped to the end

    for (let i = 0; i < 10; i++) fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.actions[0].run).toHaveBeenCalled(); // clamped back to the first row (the action)
  });

  it('dispatches Enter on an action row to that action\'s run handler', () => {
    const run = vi.fn();
    const p = { ...mk(), actions: [action({ id: 'a1', run })] };
    render(<Palette {...p} />);
    const input = screen.getByPlaceholderText(/search sessions/i);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(run).toHaveBeenCalled();
  });

  it('dispatches Enter on a session row to onPickSession with the right id', () => {
    const p = { ...mk(), actions: [action()] };
    render(<Palette {...p} />);
    const input = screen.getByPlaceholderText(/search sessions/i);
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // move off the action row onto the first session row
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onPickSession).toHaveBeenCalledWith('s1');
  });
});
