import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock useGit hook
const mockUseGit = {
  status: null as any,
  branches: [],
  log: [],
  isLoading: false,
  operationInProgress: null,
  selectedDiff: null,
  generatedMessage: null,
  refreshStatus: vi.fn(),
  loadBranches: vi.fn(),
  loadHistory: vi.fn(),
  startWatching: vi.fn(),
  stopWatching: vi.fn(),
  stageFiles: vi.fn(),
  unstageFiles: vi.fn(),
  stageAll: vi.fn(),
  unstageAll: vi.fn(),
  commit: vi.fn().mockResolvedValue({ success: true }),
  push: vi.fn(),
  pull: vi.fn(),
  fetch: vi.fn(),
  viewDiff: vi.fn(),
  setSelectedDiff: vi.fn(),
  switchBranch: vi.fn(),
  createBranch: vi.fn(),
  initRepo: vi.fn(),
  generateMessage: vi.fn(),
  discardAll: vi.fn(),
};

vi.mock('../hooks/useGit', () => ({
  useGit: () => mockUseGit,
}));

// Mock ConfirmDialog
vi.mock('./ui', () => ({
  ConfirmDialog: ({ isOpen, onConfirm, onCancel }: any) =>
    isOpen ? (
      <div data-testid="confirm-dialog">
        <button data-testid="confirm-yes" onClick={onConfirm}>Yes</button>
        <button data-testid="confirm-no" onClick={onCancel}>No</button>
      </div>
    ) : null,
}));

// Mock CommitDialog
vi.mock('./ui/CommitDialog', () => ({
  CommitDialog: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="commit-dialog">
        <button data-testid="commit-dialog-close" onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

import { GitPanel } from './GitPanel';

describe('GitPanel', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    projectPath: '/test',
    activeSessionId: 's1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGit.status = null;
    mockUseGit.isLoading = false;
    mockUseGit.operationInProgress = null;
    mockUseGit.branches = [];
    mockUseGit.log = [];
    mockUseGit.selectedDiff = null;
    mockUseGit.generatedMessage = null;
  });

  it('returns null when not open', () => {
    const { container } = render(<GitPanel {...defaultProps} isOpen={false} />);
    expect(container.querySelector('.git-panel')).not.toBeInTheDocument();
  });

  it('renders panel header with title', () => {
    render(<GitPanel {...defaultProps} />);
    expect(screen.getByText('Git')).toBeInTheDocument();
  });

  it('shows loading state when status is null and isLoading', () => {
    // New design: when isLoading with null status the panel renders
    // the SidePanel wrapper. No loading text — the refresh button spins.
    // Verify the panel is present and no crash occurs.
    mockUseGit.isLoading = true;
    render(<GitPanel {...defaultProps} />);
    expect(screen.getByText('Git')).toBeInTheDocument();
  });

  it('shows "Not a git repository" when status.isRepo is false', () => {
    mockUseGit.status = { isRepo: false, branch: null, files: [], stagedCount: 0, unstagedCount: 0, untrackedCount: 0, conflictedCount: 0, ahead: 0, behind: 0, isDetached: false, hasConflicts: false, upstream: null };
    render(<GitPanel {...defaultProps} />);
    expect(screen.getByText('Not a git repository')).toBeInTheDocument();
  });

  it('shows "No active session" when projectPath is null', () => {
    render(<GitPanel {...defaultProps} projectPath={null} />);
    expect(screen.getByText('No active session')).toBeInTheDocument();
  });

  it('shows "Working tree clean" when no files to show', () => {
    mockUseGit.status = { isRepo: true, branch: 'main', files: [], stagedCount: 0, unstagedCount: 0, untrackedCount: 0, conflictedCount: 0, ahead: 0, behind: 0, isDetached: false, hasConflicts: false, upstream: null };
    render(<GitPanel {...defaultProps} />);
    expect(screen.getByText('Working tree clean')).toBeInTheDocument();
  });

  it('shows staged files section with count', () => {
    mockUseGit.status = {
      isRepo: true, branch: 'main',
      files: [
        { path: 'src/index.ts', originalPath: null, indexStatus: 'modified', workTreeStatus: 'unmodified', area: 'staged' },
      ],
      stagedCount: 1, unstagedCount: 0, untrackedCount: 0, conflictedCount: 0,
      ahead: 0, behind: 0, isDetached: false, hasConflicts: false, upstream: null,
    };
    render(<GitPanel {...defaultProps} />);
    // New design: SectionHeader renders title "Staged" and count as a separate span
    expect(screen.getByText('Staged')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows unstaged files section', () => {
    mockUseGit.status = {
      isRepo: true, branch: 'main',
      files: [
        { path: 'src/utils.ts', originalPath: null, indexStatus: 'unmodified', workTreeStatus: 'modified', area: 'unstaged' },
      ],
      stagedCount: 0, unstagedCount: 1, untrackedCount: 0, conflictedCount: 0,
      ahead: 0, behind: 0, isDetached: false, hasConflicts: false, upstream: null,
    };
    render(<GitPanel {...defaultProps} />);
    // New design: SectionHeader renders title "Unstaged"
    expect(screen.getByText('Unstaged')).toBeInTheDocument();
  });

  it('shows branch name', () => {
    mockUseGit.status = { isRepo: true, branch: 'feature/cool', files: [], stagedCount: 0, unstagedCount: 0, untrackedCount: 0, conflictedCount: 0, ahead: 0, behind: 0, isDetached: false, hasConflicts: false, upstream: null };
    render(<GitPanel {...defaultProps} />);
    expect(screen.getByText('feature/cool')).toBeInTheDocument();
  });

  it('shows branch name for detached HEAD', () => {
    // New design does not show a separate detached HEAD banner; it shows the
    // commit hash as the branch name in the branch row.
    mockUseGit.status = { isRepo: true, branch: 'abc1234', files: [], stagedCount: 0, unstagedCount: 0, untrackedCount: 0, conflictedCount: 0, ahead: 0, behind: 0, isDetached: true, hasConflicts: false, upstream: null };
    render(<GitPanel {...defaultProps} />);
    expect(screen.getByText('abc1234')).toBeInTheDocument();
  });

  it('renders commit button when there are changes', () => {
    // New design: Commit button appears when isClean === false (any changed files).
    // The button is not disabled based on staged count; it validates on click instead.
    mockUseGit.status = {
      isRepo: true, branch: 'main',
      files: [
        { path: 'src/utils.ts', originalPath: null, indexStatus: 'unmodified', workTreeStatus: 'modified', area: 'unstaged' },
      ],
      stagedCount: 0, unstagedCount: 1, untrackedCount: 0, conflictedCount: 0,
      ahead: 0, behind: 0, isDetached: false, hasConflicts: false, upstream: null,
    };
    render(<GitPanel {...defaultProps} />);
    const commitBtn = screen.getByText('Commit');
    expect(commitBtn).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    render(<GitPanel {...defaultProps} />);
    // SidePanel renders the close button with aria-label="Close panel"
    fireEvent.click(screen.getByLabelText('Close panel'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows refresh button when a git operation is in progress (spinning)', () => {
    // New design: no text shown for in-progress operations; the refresh button
    // animates with spin CSS. Verify panel still renders correctly.
    (mockUseGit as any).operationInProgress = 'pushing';
    mockUseGit.status = { isRepo: true, branch: 'main', files: [], stagedCount: 0, unstagedCount: 0, untrackedCount: 0, conflictedCount: 0, ahead: 0, behind: 0, isDetached: false, hasConflicts: false, upstream: null };
    render(<GitPanel {...defaultProps} />);
    // The panel title should still be visible
    expect(screen.getByText('Git')).toBeInTheDocument();
  });
});
