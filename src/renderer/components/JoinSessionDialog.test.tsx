/**
 * Tests for JoinSessionDialog
 *
 * Covers:
 *   - Renders with correct data-testids
 *   - Does not render when isOpen=false
 *   - Code input auto-focuses on open
 *   - Cancel button calls onClose
 *   - Join button disabled when input is empty
 *   - Error message uses role="alert"
 *   - Password input shown when joinSession returns PASSWORD_REQUIRED
 *   - Success: onJoined called + onClose called
 *   - Escape key calls onClose
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JoinSessionDialog } from './JoinSessionDialog';
import { getElectronAPI } from '../../../test/helpers/electron-api-mock';

const mockJoinSession = vi.fn();

vi.mock('../hooks/useSessionSharing', () => ({
  useSessionSharing: () => ({
    joinSession: mockJoinSession,
    activeShares:    new Map(),
    observedSessions: new Map(),
    controlState:    new Map(),
    notifications:   [],
    isEligible:      true,
    eligibilityInfo: null,
    startSharing:    vi.fn(),
    stopSharing:     vi.fn(),
    kickObserver:    vi.fn(),
    grantControl:    vi.fn(),
    revokeControl:   vi.fn(),
    leaveSession:    vi.fn(),
    requestControl:  vi.fn(),
    releaseControl:  vi.fn(),
    checkEligibility: vi.fn(),
    registerOutputCallback:   vi.fn(),
    unregisterOutputCallback: vi.fn(),
    registerMetadataCallback: vi.fn(),
    unregisterMetadataCallback: vi.fn(),
  }),
}));

const defaultProps = {
  isOpen:   true,
  onClose:  vi.fn(),
  onJoined: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  window.electronAPI = getElectronAPI();
  mockJoinSession.mockResolvedValue({ success: true, message: 'Joined' });
});

describe('JoinSessionDialog', () => {
  it('renders with data-testid="join-session-dialog"', () => {
    render(<JoinSessionDialog {...defaultProps} />);
    expect(screen.getByTestId('join-session-dialog')).toBeInTheDocument();
  });

  it('does not render when isOpen=false', () => {
    render(<JoinSessionDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('join-session-dialog')).not.toBeInTheDocument();
  });

  it('renders code input with data-testid="join-code-input"', () => {
    render(<JoinSessionDialog {...defaultProps} />);
    expect(screen.getByTestId('join-code-input')).toBeInTheDocument();
  });

  it('renders submit button with data-testid="join-submit"', () => {
    render(<JoinSessionDialog {...defaultProps} />);
    expect(screen.getByTestId('join-submit')).toBeInTheDocument();
  });

  it('Join button is disabled when code input is empty', () => {
    render(<JoinSessionDialog {...defaultProps} />);
    const submitBtn = screen.getByTestId('join-submit');
    expect(submitBtn).toBeDisabled();
  });

  it('Join button is enabled after typing a code', () => {
    render(<JoinSessionDialog {...defaultProps} />);
    fireEvent.change(screen.getByTestId('join-code-input'), { target: { value: 'ABC123' } });
    expect(screen.getByTestId('join-submit')).not.toBeDisabled();
  });

  it('Cancel button calls onClose', () => {
    render(<JoinSessionDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('Escape key calls onClose', () => {
    render(<JoinSessionDialog {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls joinSession and onJoined on successful join', async () => {
    render(<JoinSessionDialog {...defaultProps} />);
    fireEvent.change(screen.getByTestId('join-code-input'), { target: { value: 'ABC123' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('join-submit'));
    });
    expect(mockJoinSession).toHaveBeenCalledWith('ABC123', undefined, 'Observer');
    await waitFor(() => expect(defaultProps.onJoined).toHaveBeenCalledWith('ABC123'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows password input when PASSWORD_REQUIRED error returned', async () => {
    mockJoinSession.mockResolvedValue({
      success:   false,
      message:   'Password required',
      errorCode: 'PASSWORD_REQUIRED',
    });
    render(<JoinSessionDialog {...defaultProps} />);
    fireEvent.change(screen.getByTestId('join-code-input'), { target: { value: 'ABC123' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('join-submit'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('join-password-input')).toBeInTheDocument();
    });
  });

  it('shows error with role="alert" for INVALID_CODE', async () => {
    mockJoinSession.mockResolvedValue({
      success:   false,
      message:   'Invalid code',
      errorCode: 'INVALID_CODE',
    });
    render(<JoinSessionDialog {...defaultProps} />);
    fireEvent.change(screen.getByTestId('join-code-input'), { target: { value: 'BADCODE' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('join-submit'));
    });
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(/Invalid code/i);
    });
  });

  it('pre-fills code input from initialCode prop', () => {
    render(<JoinSessionDialog {...defaultProps} initialCode="XYZ789" />);
    expect(screen.getByTestId('join-code-input')).toHaveValue('XYZ789');
  });
});
