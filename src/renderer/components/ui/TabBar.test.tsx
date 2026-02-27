import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { getElectronAPI } from '../../../../test/helpers/electron-api-mock';

// Mock child components to isolate TabBar rendering
vi.mock('./Tab', () => ({
  Tab: ({ data, isActive, onSelect, onClose }: any) => (
    <div
      data-testid={`tab-${data.id}`}
      data-active={isActive}
      onClick={onSelect}
    >
      <span>{data.name}</span>
      <button data-testid={`close-${data.id}`} onClick={(e: any) => { e.stopPropagation(); onClose(); }}>close</button>
    </div>
  ),
}));

vi.mock('./NewSessionDialog', () => ({
  NewSessionDialog: ({ isOpen, onClose, onSubmit }: any) =>
    isOpen ? (
      <div data-testid="new-session-dialog">
        <button data-testid="dialog-submit" onClick={() => onSubmit('Test', '/test', 'standard')}>Submit</button>
        <button data-testid="dialog-close" onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

vi.mock('./ContextMenu', () => ({
  ContextMenu: () => null,
}));

// ToolsDropdown is no longer used in new TabBar (moved to ActivityBar)
vi.mock('./ToolsDropdown', () => ({
  ToolsDropdown: () => <div data-testid="tools-dropdown" />,
}));

import { TabBar } from './TabBar';

const mockSessions = [
  { id: 's1', name: 'Session 1', workingDirectory: '/proj1', status: 'running' as const, permissionMode: 'standard' as const },
  { id: 's2', name: 'Session 2', workingDirectory: '/proj2', status: 'running' as const, permissionMode: 'standard' as const },
];

describe('TabBar', () => {
  let api: ReturnType<typeof getElectronAPI>;
  const defaultProps = {
    sessions: mockSessions,
    activeSessionId: 's1',
    onSelectSession: vi.fn(),
    onCloseSession: vi.fn(),
    onCreateSession: vi.fn(),
    onRenameSession: vi.fn(),
    onRestartSession: vi.fn(),
    onDuplicateSession: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    api = getElectronAPI();
    api.getCheckpointCount.mockResolvedValue(0);
    api.onCheckpointCreated.mockReturnValue(vi.fn());
    api.onCheckpointDeleted.mockReturnValue(vi.fn());
  });

  it('renders all session tabs', () => {
    render(<TabBar {...defaultProps} />);
    expect(screen.getByTestId('tab-s1')).toBeInTheDocument();
    expect(screen.getByTestId('tab-s2')).toBeInTheDocument();
  });

  it('marks active tab', () => {
    render(<TabBar {...defaultProps} />);
    expect(screen.getByTestId('tab-s1').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('tab-s2').getAttribute('data-active')).toBe('false');
  });

  it('calls onSelectSession when tab is clicked', () => {
    render(<TabBar {...defaultProps} />);
    fireEvent.click(screen.getByTestId('tab-s2'));
    expect(defaultProps.onSelectSession).toHaveBeenCalledWith('s2');
  });

  it('calls onCloseSession when close button is clicked', () => {
    render(<TabBar {...defaultProps} />);
    fireEvent.click(screen.getByTestId('close-s1'));
    expect(defaultProps.onCloseSession).toHaveBeenCalledWith('s1');
  });

  it('opens new session dialog when + button is clicked', () => {
    render(<TabBar {...defaultProps} />);
    expect(screen.queryByTestId('new-session-dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('New session'));
    expect(screen.getByTestId('new-session-dialog')).toBeInTheDocument();
  });

  it('renders help button when onOpenHelp provided', () => {
    const onOpenHelp = vi.fn();
    render(<TabBar {...defaultProps} onOpenHelp={onOpenHelp} />);
    const helpBtn = screen.getByLabelText('Help & Shortcuts');
    expect(helpBtn).toBeInTheDocument();
    fireEvent.click(helpBtn);
    expect(onOpenHelp).toHaveBeenCalled();
  });

  it('shows tab list role', () => {
    render(<TabBar {...defaultProps} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
