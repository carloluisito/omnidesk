/**
 * Tests for ShareManagementPanel
 *
 * Covers (spec §10.3):
 *   - Renders panel with data-testid="share-management-panel"
 *   - Shows empty state when no shares are active
 *   - Renders share cards for each active share (session name, share code)
 *   - "Stop Sharing" button calls stopSharing with the sessionId
 *   - Observer list expands when ChevronRight is clicked
 *   - "Kick" button calls kickObserver
 *   - "Grant control" button calls grantControl
 *   - "Revoke control" button calls revokeControl when observer has control
 *   - Does not render when isOpen=false
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShareManagementPanel } from './ShareManagementPanel';
import { getElectronAPI } from '../../../test/helpers/electron-api-mock';
import type { ShareInfo, ObserverInfo } from '../../shared/types/sharing-types';

// ── Mock useSessionSharing ────────────────────────────────────────────────────

const mockStopSharing = vi.fn().mockResolvedValue({ success: true, message: 'ok' });
const mockKickObserver = vi.fn().mockResolvedValue({ success: true, message: 'ok' });
const mockGrantControl = vi.fn().mockResolvedValue({ success: true, message: 'ok' });
const mockRevokeControl = vi.fn().mockResolvedValue({ success: true, message: 'ok' });

const mockActiveShares: Map<string, ShareInfo> = new Map();

vi.mock('../hooks/useSessionSharing', () => ({
  useSessionSharing: () => ({
    activeShares:      mockActiveShares,
    observedSessions:  new Map(),
    controlState:      new Map(),
    notifications:     [],
    isEligible:        true,
    eligibilityInfo:   null,
    stopSharing:       mockStopSharing,
    kickObserver:      mockKickObserver,
    grantControl:      mockGrantControl,
    revokeControl:     mockRevokeControl,
    startSharing:      vi.fn(),
    joinSession:       vi.fn(),
    leaveSession:      vi.fn(),
    requestControl:    vi.fn(),
    releaseControl:    vi.fn(),
    checkEligibility:  vi.fn().mockResolvedValue({ eligible: true }),
    registerOutputCallback:   vi.fn(),
    unregisterOutputCallback: vi.fn(),
    registerMetadataCallback:   vi.fn(),
    unregisterMetadataCallback: vi.fn(),
  }),
}));

// ── Mock clipboard ────────────────────────────────────────────────────────────

const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
  configurable: true,
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeObserver(overrides: Partial<ObserverInfo> = {}): ObserverInfo {
  return {
    observerId:  'obs-1',
    displayName: 'Alice',
    role:        'read-only',
    joinedAt:    new Date().toISOString(),
    ...overrides,
  };
}

function makeShare(overrides: Partial<ShareInfo> = {}): ShareInfo {
  return {
    shareId:     'share-uuid-1',
    shareCode:   'ABC123',
    shareUrl:    'https://share.launchtunnel.dev/ABC123',
    sessionId:   'session-1',
    status:      'active',
    createdAt:   new Date().toISOString(),
    hasPassword: false,
    observers:   [],
    ...overrides,
  };
}

const defaultProps = {
  isOpen:       true,
  onClose:      vi.fn(),
  sessionNames: { 'session-1': 'My Test Session' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockActiveShares.clear();
  window.electronAPI = getElectronAPI();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ShareManagementPanel', () => {
  it('does not render when isOpen is false', () => {
    render(<ShareManagementPanel {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('share-management-panel')).not.toBeInTheDocument();
  });

  it('renders with data-testid="share-management-panel"', () => {
    render(<ShareManagementPanel {...defaultProps} />);
    expect(screen.getByTestId('share-management-panel')).toBeInTheDocument();
  });

  it('shows empty state when no shares are active', () => {
    render(<ShareManagementPanel {...defaultProps} />);
    expect(screen.getByText('No active shares')).toBeInTheDocument();
    expect(screen.getByText(/Share a session from/i)).toBeInTheDocument();
  });

  it('renders a share card for an active share', () => {
    mockActiveShares.set('session-1', makeShare());
    render(<ShareManagementPanel {...defaultProps} />);
    expect(screen.getByText('My Test Session')).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText('Stop Sharing')).toBeInTheDocument();
  });

  it('renders multiple share cards', () => {
    mockActiveShares.set('session-1', makeShare({ sessionId: 'session-1', shareCode: 'CODE01' }));
    mockActiveShares.set('session-2', makeShare({ sessionId: 'session-2', shareCode: 'CODE02' }));
    render(<ShareManagementPanel {...defaultProps} sessionNames={{ 'session-1': 'Session A', 'session-2': 'Session B' }} />);
    expect(screen.getByText('Session A')).toBeInTheDocument();
    expect(screen.getByText('Session B')).toBeInTheDocument();
    expect(screen.getByText('CODE01')).toBeInTheDocument();
    expect(screen.getByText('CODE02')).toBeInTheDocument();
  });

  it('calls stopSharing with sessionId when Stop Sharing is clicked', async () => {
    mockActiveShares.set('session-1', makeShare());
    render(<ShareManagementPanel {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Stop Sharing'));
    });
    expect(mockStopSharing).toHaveBeenCalledWith('session-1');
  });

  it('copies share code to clipboard when Copy button is clicked', async () => {
    mockActiveShares.set('session-1', makeShare());
    render(<ShareManagementPanel {...defaultProps} />);
    const copyBtn = screen.getByLabelText('Copy share code');
    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(mockWriteText).toHaveBeenCalledWith('ABC123');
  });

  it('shows observer count badge and expand button when observers present', () => {
    const share = makeShare({ observers: [makeObserver()] });
    mockActiveShares.set('session-1', share);
    render(<ShareManagementPanel {...defaultProps} />);
    expect(screen.getByLabelText('1 observer connected')).toBeInTheDocument();
    expect(screen.getByLabelText('Expand observer list')).toBeInTheDocument();
  });

  it('expands observer list when expand button is clicked', async () => {
    const share = makeShare({ observers: [makeObserver({ displayName: 'Alice' })] });
    mockActiveShares.set('session-1', share);
    render(<ShareManagementPanel {...defaultProps} />);

    // Observer should NOT be visible initially
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();

    // Click expand
    fireEvent.click(screen.getByLabelText('Expand observer list'));

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });

  it('calls kickObserver when Kick button is clicked', async () => {
    const share = makeShare({ observers: [makeObserver({ observerId: 'obs-1', displayName: 'Alice' })] });
    mockActiveShares.set('session-1', share);
    render(<ShareManagementPanel {...defaultProps} />);

    // Expand observer list
    fireEvent.click(screen.getByLabelText('Expand observer list'));
    await waitFor(() => screen.getByLabelText('Kick Alice'));

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Kick Alice'));
    });
    expect(mockKickObserver).toHaveBeenCalledWith('session-1', 'obs-1');
  });

  it('calls grantControl when Grant control button is clicked for read-only observer', async () => {
    const share = makeShare({ observers: [makeObserver({ observerId: 'obs-1', displayName: 'Alice', role: 'read-only' })] });
    mockActiveShares.set('session-1', share);
    render(<ShareManagementPanel {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Expand observer list'));
    await waitFor(() => screen.getByLabelText('Grant control to Alice'));

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Grant control to Alice'));
    });
    expect(mockGrantControl).toHaveBeenCalledWith('session-1', 'obs-1');
  });

  it('calls revokeControl when Revoke control button is clicked for controlling observer', async () => {
    const share = makeShare({ observers: [makeObserver({ observerId: 'obs-1', displayName: 'Bob', role: 'has-control' })] });
    mockActiveShares.set('session-1', share);
    render(<ShareManagementPanel {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Expand observer list'));
    await waitFor(() => screen.getByLabelText('Revoke control from Bob'));

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Revoke control from Bob'));
    });
    expect(mockRevokeControl).toHaveBeenCalledWith('session-1', 'obs-1');
  });

  it('collapses observer list when expand button is clicked again', async () => {
    const share = makeShare({ observers: [makeObserver({ displayName: 'Alice' })] });
    mockActiveShares.set('session-1', share);
    render(<ShareManagementPanel {...defaultProps} />);

    // Expand
    fireEvent.click(screen.getByLabelText('Expand observer list'));
    await waitFor(() => screen.getByText('Alice'));

    // Collapse
    fireEvent.click(screen.getByLabelText('Collapse observer list'));
    await waitFor(() => {
      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    });
  });
});
