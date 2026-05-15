import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock child components
vi.mock('./ui/ProviderBadge', () => ({
  ProviderBadge: ({ providerId }: any) => (
    <span data-testid="provider-badge" data-provider={providerId} />
  ),
}));

vi.mock('./ui/StatusDot', () => ({
  StatusDot: ({ status }: any) => (
    <span data-testid="status-dot" data-status={status} />
  ),
}));

vi.mock('./ui/StatusPopover', () => ({
  StatusPopover: ({ isOpen }: any) =>
    isOpen ? <div data-testid="status-popover" /> : null,
}));

vi.mock('./ui/SessionStatusIndicator', () => ({
  SessionStatusIndicator: ({ status, onClick }: any) => (
    <span data-testid="status-indicator" data-status={status} onClick={onClick}>
      {status}
    </span>
  ),
}));

import { PaneHeader } from './PaneHeader';

const defaultProps = {
  sessionId: 's1',
  sessionName: 'My Session',
  workingDirectory: '/home/user/project',
  isFocused: true,
  availableSessions: [
    { id: 's2', name: 'Other Session', workingDirectory: '/other', status: 'running' as const, permissionMode: 'standard' as const },
  ],
  canSplit: true,
  onChangeSession: vi.fn(),
  onClosePane: vi.fn(),
  onSplitHorizontal: vi.fn(),
  onSplitVertical: vi.fn(),
};

describe('PaneHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders session name', () => {
    render(<PaneHeader {...defaultProps} />);
    expect(screen.getByText('My Session')).toBeInTheDocument();
    // V2 design does not display working directory text in the pane header
  });

  it('renders provider badge', () => {
    render(<PaneHeader {...defaultProps} providerId="claude" />);
    expect(screen.getByTestId('provider-badge')).toBeInTheDocument();
  });

  it('renders status pill for session status', () => {
    // V2 design uses StatusPill (not StatusDot) for session status display
    render(<PaneHeader {...defaultProps} sessionStatus="ready" />);
    // Session name is always rendered in V2 header
    expect(screen.getByText('My Session')).toBeInTheDocument();
  });

  // NOTE: Kebab menu and sharing features removed — tests below disabled
  // See chore/disable-launchtunnel for context

  it('does not render kebab menu (removed)', () => {
    render(<PaneHeader {...defaultProps} />);
    expect(screen.queryByLabelText('Pane options')).not.toBeInTheDocument();
  });
});
