import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileShell } from './MobileShell';

const noop = () => {};
const baseProps = {
  repos: [], activeRepo: { id: 'r1', name: 'demo' } as any,
  sessions: [{ id: 's1', name: 'work' }] as any,
  activeSessionId: 's1',
  onSelectSession: noop, onCloseSession: noop, onNewSession: noop, onOpenRemote: noop,
};

describe('MobileShell', () => {
  it('shows the active session name in the top bar', () => {
    render(<MobileShell {...baseProps} />);
    expect(screen.getByText('work')).toBeInTheDocument();
  });
  it('renders an empty state when no repo is active', () => {
    render(<MobileShell {...baseProps} activeRepo={null} sessions={[]} activeSessionId={null} />);
    expect(screen.getByText(/no repository/i)).toBeInTheDocument();
  });
});
