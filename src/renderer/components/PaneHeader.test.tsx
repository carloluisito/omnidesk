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

  it('renders session name and working directory', () => {
    render(<PaneHeader {...defaultProps} />);
    expect(screen.getByText('My Session')).toBeInTheDocument();
    expect(screen.getByText('/home/user/project')).toBeInTheDocument();
  });

  it('renders provider badge', () => {
    render(<PaneHeader {...defaultProps} providerId="claude" />);
    expect(screen.getByTestId('provider-badge')).toBeInTheDocument();
  });

  it('renders status dot', () => {
    render(<PaneHeader {...defaultProps} sessionStatus="ready" />);
    expect(screen.getByTestId('status-dot')).toBeInTheDocument();
  });

  it('renders the pane options kebab button', () => {
    render(<PaneHeader {...defaultProps} />);
    expect(screen.getByLabelText('Pane options')).toBeInTheDocument();
  });

  it('shows split buttons in kebab menu when canSplit is true', () => {
    render(<PaneHeader {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Pane options'));
    expect(screen.getByText('Split left / right')).toBeInTheDocument();
    expect(screen.getByText('Split top / bottom')).toBeInTheDocument();
  });

  it('hides split buttons in kebab menu when canSplit is false', () => {
    render(<PaneHeader {...defaultProps} canSplit={false} />);
    fireEvent.click(screen.getByLabelText('Pane options'));
    expect(screen.queryByText('Split left / right')).not.toBeInTheDocument();
    expect(screen.queryByText('Split top / bottom')).not.toBeInTheDocument();
  });

  it('calls onSplitHorizontal when horizontal split button clicked', () => {
    render(<PaneHeader {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Pane options'));
    fireEvent.click(screen.getByText('Split left / right'));
    expect(defaultProps.onSplitHorizontal).toHaveBeenCalled();
  });

  it('calls onSplitVertical when vertical split button clicked', () => {
    render(<PaneHeader {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Pane options'));
    fireEvent.click(screen.getByText('Split top / bottom'));
    expect(defaultProps.onSplitVertical).toHaveBeenCalled();
  });

  it('calls onClosePane when close pane menu item clicked', () => {
    render(<PaneHeader {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Pane options'));
    fireEvent.click(screen.getByText('Close pane'));
    expect(defaultProps.onClosePane).toHaveBeenCalled();
  });

  it('shows session picker when Change session clicked', () => {
    render(<PaneHeader {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Pane options'));
    fireEvent.click(screen.getByText('Change session'));
    expect(screen.getByText('Other Session')).toBeInTheDocument();
  });
});
