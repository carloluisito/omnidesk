import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileShell } from './MobileShell';

const noop = () => {};
const baseProps = {
  repos: [], activeRepo: { id: 'r1', name: 'demo' } as any,
  sessions: [{ id: 's1', name: 'work' }] as any,
  activeSessionId: 's1',
  onSelectSession: noop, onSelectRepo: noop, onCloseSession: noop,
  onNewSession: noop, onAddRepo: noop, onOpenRemote: noop,
};

describe('MobileShell', () => {
  it('shows the active session name in the top bar', () => {
    render(<MobileShell {...baseProps} />);
    expect(screen.getByText('work')).toBeInTheDocument();
  });
  it('renders an empty state (with Open project) when no repo is active', () => {
    render(<MobileShell {...baseProps} activeRepo={null} sessions={[]} activeSessionId={null} />);
    expect(screen.getByText(/no project open/i)).toBeInTheDocument();
    expect(screen.getByText(/open project/i)).toBeInTheDocument();
  });
});
