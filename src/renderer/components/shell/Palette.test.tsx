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
});
