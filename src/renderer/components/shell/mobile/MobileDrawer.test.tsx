import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileDrawer } from './MobileDrawer';

const mk = () => ({
  open: true,
  onClose: vi.fn(),
  repos: [
    { id: 'r1', name: 'demo', path: '/demo' },
    { id: 'r2', name: 'api', path: '/api' },
  ] as any,
  activeRepo: { id: 'r1', name: 'demo', path: '/demo' } as any,
  sessions: [
    { id: 's1', name: 'work', mainRepoPath: '/demo', workingDirectory: '/demo' },
    { id: 's2', name: 'build', mainRepoPath: '/demo', workingDirectory: '/demo' },
    { id: 's3', name: 'tests', mainRepoPath: '/api', workingDirectory: '/api' },
  ] as any,
  activeSessionId: 's1',
  onSelectSession: vi.fn(),
  onSelectRepo: vi.fn(),
  onCloseSession: vi.fn(),
  onNewSession: vi.fn(),
  onAddRepo: vi.fn(),
  onOpenRemote: vi.fn(),
});

describe('MobileDrawer', () => {
  it('groups sessions under their project and shows every open project', () => {
    render(<MobileDrawer {...mk()} />);
    // Both projects are present as headers…
    expect(screen.getByRole('button', { name: /demo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /api/i })).toBeInTheDocument();
    // …and every session is reachable.
    ['work', 'build', 'tests'].forEach(n => expect(screen.getByText(n)).toBeInTheDocument());
  });

  it('selects a session (which sets its project active) and closes', () => {
    const p = mk();
    render(<MobileDrawer {...p} />);
    fireEvent.click(screen.getByText('tests')); // a session in the non-active project
    expect(p.onSelectSession).toHaveBeenCalledWith('s3');
    expect(p.onClose).toHaveBeenCalled();
  });

  it('switches project when a project header is tapped, and closes', () => {
    const p = mk();
    render(<MobileDrawer {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /api/i }));
    expect(p.onSelectRepo).toHaveBeenCalledWith('r2');
    expect(p.onClose).toHaveBeenCalled();
  });

  it('opens a new project via + Open project, and closes', () => {
    const p = mk();
    render(<MobileDrawer {...p} />);
    fireEvent.click(screen.getByText('+ Open project'));
    expect(p.onAddRepo).toHaveBeenCalled();
    expect(p.onClose).toHaveBeenCalled();
  });

  it('keeps sessions whose project is not open reachable under "Other sessions"', () => {
    const p = mk();
    // App feeds the drawer only "open" projects (visibleRepos). Dropping r2 here
    // stands in for a project that isn't in that open set but still has a live
    // session — that session must not vanish.
    p.repos = [{ id: 'r1', name: 'demo', path: '/demo' }] as any;
    render(<MobileDrawer {...p} />);
    expect(screen.getByText('Other sessions')).toBeInTheDocument();
    fireEvent.click(screen.getByText('tests'));
    expect(p.onSelectSession).toHaveBeenCalledWith('s3');
  });

  it('does not render its panel when closed', () => {
    const { container } = render(<MobileDrawer {...mk()} open={false} />);
    expect(container.querySelector('.mdrawer-panel')).toBeNull();
  });
});
