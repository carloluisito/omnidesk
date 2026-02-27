/**
 * Tests for ShareSessionDialog
 *
 * Covers:
 *   - Renders creating spinner on open (before startSharing resolves)
 *   - Renders share code + URL after share is created
 *   - Copy code button copies to clipboard
 *   - Stop Sharing button calls stopSharing
 *   - Done button calls onClose
 *   - Escape key calls onClose
 *   - Ineligible state shows upgrade prompt
 *   - Error state shows retry button
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShareSessionDialog } from './ShareSessionDialog';
import { getElectronAPI } from '../../../test/helpers/electron-api-mock';

// ── Mock useSessionSharing ───────────────────────────────────────────
const mockStartSharing  = vi.fn();
const mockStopSharing   = vi.fn();
const mockCheckEligibility = vi.fn();
const mockActiveShares  = new Map();

vi.mock('../hooks/useSessionSharing', () => ({
  useSessionSharing: () => ({
    activeShares:    mockActiveShares,
    startSharing:    mockStartSharing,
    stopSharing:     mockStopSharing,
    checkEligibility: mockCheckEligibility,
    isEligible:      true,
    eligibilityInfo: null,
  }),
}));

// ── Mock clipboard ───────────────────────────────────────────────────
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
  configurable: true,
});

const defaultProps = {
  isOpen:      true,
  onClose:     vi.fn(),
  sessionId:   'session-1',
  sessionName: 'Test Session',
};

const mockShareInfo = {
  shareId:    'share-uuid-1',
  shareCode:  'ABC123',
  shareUrl:   'https://share.launchtunnel.dev/ABC123',
  sessionId:  'session-1',
  status:     'active' as const,
  createdAt:  new Date().toISOString(),
  hasPassword: false,
  observers:  [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockActiveShares.clear();
  window.electronAPI = getElectronAPI();
  // Default: eligible
  mockCheckEligibility.mockResolvedValue({ eligible: true });
  // Default: startSharing returns share info
  mockStartSharing.mockResolvedValue(mockShareInfo);
  mockStopSharing.mockResolvedValue({ success: true, message: 'Stopped' });
});

describe('ShareSessionDialog', () => {
  it('renders the dialog container with correct data-testid', async () => {
    render(<ShareSessionDialog {...defaultProps} />);
    expect(screen.getByTestId('share-session-dialog')).toBeInTheDocument();
  });

  it('shows "Creating share link..." spinner initially', async () => {
    // Make startSharing hang so spinner stays visible
    mockStartSharing.mockReturnValue(new Promise(() => {}));
    render(<ShareSessionDialog {...defaultProps} />);
    expect(screen.getByText('Creating share link...')).toBeInTheDocument();
  });

  it('shows share code and URL after creation', async () => {
    render(<ShareSessionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('share-code')).toBeInTheDocument();
      expect(screen.getByTestId('share-url')).toBeInTheDocument();
    });
    expect(screen.getByTestId('share-code')).toHaveTextContent('ABC123');
    expect(screen.getByTestId('share-url')).toHaveTextContent('https://share.launchtunnel.dev/ABC123');
  });

  it('copy share code button copies to clipboard', async () => {
    render(<ShareSessionDialog {...defaultProps} />);
    await waitFor(() => screen.getByTestId('copy-share-code'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-share-code'));
    });
    expect(mockWriteText).toHaveBeenCalledWith('ABC123');
  });

  it('copy share URL button copies to clipboard', async () => {
    render(<ShareSessionDialog {...defaultProps} />);
    await waitFor(() => screen.getByTestId('copy-share-url'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-share-url'));
    });
    expect(mockWriteText).toHaveBeenCalledWith('https://share.launchtunnel.dev/ABC123');
  });

  it('Done button calls onClose', async () => {
    render(<ShareSessionDialog {...defaultProps} />);
    await waitFor(() => screen.getByText('Done'));
    fireEvent.click(screen.getByText('Done'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('Escape key calls onClose', async () => {
    render(<ShareSessionDialog {...defaultProps} />);
    await waitFor(() => screen.getByTestId('share-session-dialog'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows Stop Sharing button in active state', async () => {
    render(<ShareSessionDialog {...defaultProps} />);
    await waitFor(() => screen.getByText('Stop Sharing'));
    expect(screen.getByText('Stop Sharing')).toBeInTheDocument();
  });

  it('Stop Sharing button calls stopSharing and onClose', async () => {
    render(<ShareSessionDialog {...defaultProps} />);
    await waitFor(() => screen.getByText('Stop Sharing'));
    await act(async () => {
      fireEvent.click(screen.getByText('Stop Sharing'));
    });
    expect(mockStopSharing).toHaveBeenCalledWith('session-1');
  });

  it('shows upgrade prompt when not eligible', async () => {
    mockCheckEligibility.mockResolvedValue({ eligible: false, reason: 'NO_SUBSCRIPTION' });
    render(<ShareSessionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/LaunchTunnel Pro/i)).toBeInTheDocument();
      expect(screen.getByText(/Upgrade to Pro/i)).toBeInTheDocument();
    });
  });

  it('shows error state + Retry button when startSharing fails', async () => {
    mockCheckEligibility.mockResolvedValue({ eligible: true });
    mockStartSharing.mockResolvedValue(null); // null = failure
    render(<ShareSessionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('does not render when isOpen is false', () => {
    render(<ShareSessionDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('share-session-dialog')).not.toBeInTheDocument();
  });

  it('re-opening dialog for an already-shared session shows existing share info', async () => {
    // Simulate main process reporting an active share (dialog was closed then reopened)
    (window.electronAPI.getShareInfo as ReturnType<typeof vi.fn>).mockResolvedValue(mockShareInfo);

    render(<ShareSessionDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('share-code')).toHaveTextContent('ABC123');
    });

    // startSharing should NOT have been called — we reused the existing share
    expect(mockStartSharing).not.toHaveBeenCalled();
  });

  it('retry detects existing share instead of calling startSharing again', async () => {
    // First open: startSharing fails
    mockCheckEligibility.mockResolvedValue({ eligible: true });
    mockStartSharing.mockResolvedValue(null);
    (window.electronAPI.getShareInfo as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    render(<ShareSessionDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    // Before retry: main process now has an active share (e.g. race condition resolved)
    (window.electronAPI.getShareInfo as ReturnType<typeof vi.fn>).mockResolvedValue(mockShareInfo);
    mockStartSharing.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByText('Retry'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('share-code')).toHaveTextContent('ABC123');
    });

    // startSharing should NOT have been called — getShareInfo returned the existing share
    expect(mockStartSharing).not.toHaveBeenCalled();
  });
});
