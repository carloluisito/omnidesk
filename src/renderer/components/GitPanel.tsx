import { useState, useEffect, useCallback } from 'react';
import { useGit } from '../hooks/useGit';
import { CommitDialog } from './ui/CommitDialog';
import { ConfirmDialog } from './ui';
import { DiffViewer } from './DiffViewer';
import type { GitFileEntry } from '../../shared/types/git-types';

interface GitPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string | null;
  activeSessionId: string | null;
}

export function GitPanel({ isOpen, onClose, projectPath, activeSessionId }: GitPanelProps) {
  const git = useGit(projectPath);
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [diffViewerFile, setDiffViewerFile] = useState<GitFileEntry | null>(null);
  const [stagedCollapsed, setStagedCollapsed] = useState(false);
  const [unstagedCollapsed, setUnstagedCollapsed] = useState(false);
  const [untrackedCollapsed, setUntrackedCollapsed] = useState(false);
  const [conflictedCollapsed, setConflictedCollapsed] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [showDiscardAllConfirm, setShowDiscardAllConfirm] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [newBranchInput, setNewBranchInput] = useState('');
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [branchSearch, setBranchSearch] = useState('');

  // Load data when panel opens
  useEffect(() => {
    if (isOpen && projectPath) {
      git.refreshStatus();
      git.loadBranches();
      git.loadHistory(10);
      git.startWatching();
    }
    if (!isOpen && projectPath) {
      git.stopWatching();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectPath]);

  const handleFileToggle = useCallback(async (file: GitFileEntry) => {
    if (file.area === 'staged') {
      await git.unstageFiles([file.path]);
    } else if (file.area === 'unstaged' || file.area === 'untracked') {
      await git.stageFiles([file.path]);
    }
  }, [git]);

  const handleFileClick = useCallback((file: GitFileEntry) => {
    setDiffViewerFile(file);
    setShowDiffViewer(true);
  }, []);

  const handleBranchSwitch = useCallback(async (branch: string) => {
    setBranchDropdownOpen(false);
    await git.switchBranch(branch);
  }, [git]);

  const handleCreateBranch = useCallback(async () => {
    if (!newBranchInput.trim()) return;
    await git.createBranch(newBranchInput.trim());
    setNewBranchInput('');
    setShowNewBranch(false);
    setBranchDropdownOpen(false);
  }, [git, newBranchInput]);

  if (!isOpen) return null;

  const { status } = git;

  // File grouping
  const stagedFiles = status?.files.filter(f => f.area === 'staged') || [];
  const unstagedFiles = status?.files.filter(f => f.area === 'unstaged') || [];
  const untrackedFiles = status?.files.filter(f => f.area === 'untracked') || [];
  const conflictedFiles = status?.files.filter(f => f.area === 'conflicted') || [];

  // Branch filter
  const filteredBranches = branchSearch
    ? git.branches.filter(b => b.name.toLowerCase().includes(branchSearch.toLowerCase()))
    : git.branches;

  return (
    <>
      <div className="git-panel-overlay" onClick={onClose} />
      <div className="git-panel" role="region" aria-label="Git Integration Panel">
        {/* Header */}
        <div className="git-panel-header">
          <h3 className="git-panel-title">Git</h3>
          {git.operationInProgress && (
            <span className="git-panel-status">{git.operationInProgress}...</span>
          )}
          <button className="git-panel-close" onClick={onClose} aria-label="Close Git panel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Not a git repo */}
        {status && !status.isRepo && (
          <div className="git-panel-empty">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#565f89" strokeWidth="1.5">
              <circle cx="12" cy="12" r="4" />
              <line x1="1.05" y1="12" x2="7" y2="12" />
              <line x1="17.01" y1="12" x2="22.96" y2="12" />
            </svg>
            <h4>Not a Git Repository</h4>
            <p>This directory is not tracked by Git. Initialize a repository to start using version control.</p>
            <button
              className="git-panel-init-btn"
              onClick={git.initRepo}
              disabled={git.operationInProgress !== null}
            >
              {git.operationInProgress === 'initializing' ? 'Initializing...' : 'Initialize Repository'}
            </button>
          </div>
        )}

        {/* Repo content */}
        {status && status.isRepo && (
          <>
            {/* Branch Bar */}
            <div className="git-panel-branch-bar">
              <div className="git-panel-branch-left">
                <div className="git-panel-branch-trigger" onClick={() => {
                  setBranchDropdownOpen(!branchDropdownOpen);
                  if (!branchDropdownOpen) git.loadBranches();
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7aa2f7" strokeWidth="2">
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 01-9 9" />
                  </svg>
                  <span className="git-panel-branch-name" title={status.branch || 'detached'}>
                    {status.isDetached ? `detached` : (status.branch || 'unknown')}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#565f89" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {/* Ahead/Behind */}
                {(status.ahead > 0 || status.behind > 0) && (
                  <div className="git-panel-sync-badges">
                    {status.ahead > 0 && (
                      <span className="git-badge git-badge-ahead" title={`${status.ahead} commit(s) ahead of remote`}>
                        ^{status.ahead > 99 ? '99+' : status.ahead}
                      </span>
                    )}
                    {status.behind > 0 && (
                      <span className="git-badge git-badge-behind" title={`${status.behind} commit(s) behind remote`}>
                        v{status.behind > 99 ? '99+' : status.behind}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="git-panel-branch-actions">
                <button
                  className="git-panel-remote-btn"
                  onClick={() => git.fetch()}
                  disabled={git.operationInProgress !== null}
                  title="Fetch from remote"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="8 17 12 21 16 17" />
                    <line x1="12" y1="12" x2="12" y2="21" />
                    <path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29" />
                  </svg>
                </button>
                <button
                  className="git-panel-remote-btn"
                  onClick={() => git.pull()}
                  disabled={git.operationInProgress !== null}
                  title="Pull from remote"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="7 13 12 18 17 13" />
                    <line x1="12" y1="6" x2="12" y2="18" />
                  </svg>
                </button>
                <button
                  className="git-panel-remote-btn"
                  onClick={() => git.push()}
                  disabled={git.operationInProgress !== null || status.ahead === 0}
                  title="Push to remote"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="17 11 12 6 7 11" />
                    <line x1="12" y1="18" x2="12" y2="6" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Branch dropdown */}
            {branchDropdownOpen && (
              <div className="git-branch-dropdown">
                <input
                  className="git-branch-search"
                  placeholder="Search branches..."
                  value={branchSearch}
                  onChange={(e) => setBranchSearch(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setBranchDropdownOpen(false);
                  }}
                />
                <div className="git-branch-list">
                  <div className="git-branch-section-label">LOCAL BRANCHES</div>
                  {filteredBranches.map((branch) => (
                    <div
                      key={branch.name}
                      className={`git-branch-entry ${branch.isCurrent ? 'current' : ''}`}
                      onClick={() => !branch.isCurrent && handleBranchSwitch(branch.name)}
                    >
                      <span className="git-branch-entry-name">{branch.name}</span>
                      {branch.isCurrent && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7aa2f7" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  ))}
                  {filteredBranches.length === 0 && (
                    <div className="git-branch-empty">No branches found</div>
                  )}
                </div>
                <div className="git-branch-create">
                  {!showNewBranch ? (
                    <div className="git-branch-create-trigger" onClick={() => setShowNewBranch(true)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7aa2f7" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <span>Create new branch...</span>
                    </div>
                  ) : (
                    <div className="git-branch-create-form">
                      <input
                        className="git-branch-create-input"
                        placeholder="new-branch-name"
                        value={newBranchInput}
                        onChange={(e) => setNewBranchInput(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateBranch();
                          if (e.key === 'Escape') { setShowNewBranch(false); setNewBranchInput(''); }
                        }}
                      />
                      <div className="git-branch-create-actions">
                        <button className="git-branch-create-btn" onClick={handleCreateBranch} disabled={!newBranchInput.trim()}>
                          Create
                        </button>
                        <button className="git-branch-cancel-btn" onClick={() => { setShowNewBranch(false); setNewBranchInput(''); }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Detached HEAD banner */}
            {status.isDetached && (
              <div className="git-banner git-banner-info">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7aa2f7" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>Detached HEAD — Create a branch to keep your changes.</span>
                <button className="git-banner-action" onClick={() => { setShowNewBranch(true); setBranchDropdownOpen(true); }}>
                  Create Branch
                </button>
              </div>
            )}

            {/* Conflict banner */}
            {status.hasConflicts && (
              <div className="git-banner git-banner-warning">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e0af68" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>{status.conflictedCount} merge conflict{status.conflictedCount !== 1 ? 's' : ''} need resolution</span>
              </div>
            )}

            {/* Changes section */}
            <div className="git-panel-changes">
              {/* Clean state */}
              {stagedFiles.length === 0 && unstagedFiles.length === 0 && untrackedFiles.length === 0 && conflictedFiles.length === 0 && (
                <div className="git-panel-clean">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ece6a" strokeWidth="1.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <h4>Working tree clean</h4>
                  <p>No changes to commit.</p>
                </div>
              )}

              {/* Conflicted */}
              {conflictedFiles.length > 0 && (
                <FileSection
                  title="Merge Conflicts"
                  files={conflictedFiles}
                  color="#f7768e"
                  collapsed={conflictedCollapsed}
                  onToggleCollapse={() => setConflictedCollapsed(!conflictedCollapsed)}
                  onFileToggle={handleFileToggle}
                  onFileClick={handleFileClick}
                  isConflict
                />
              )}

              {/* Staged */}
              {stagedFiles.length > 0 && (
                <FileSection
                  title="Staged Changes"
                  files={stagedFiles}
                  color="#9ece6a"
                  collapsed={stagedCollapsed}
                  onToggleCollapse={() => setStagedCollapsed(!stagedCollapsed)}
                  onFileToggle={handleFileToggle}
                  onFileClick={handleFileClick}
                  actionLabel="Unstage All"
                  onAction={git.unstageAll}
                />
              )}

              {/* Unstaged */}
              {unstagedFiles.length > 0 && (
                <FileSection
                  title="Unstaged Changes"
                  files={unstagedFiles}
                  color="#e0af68"
                  collapsed={unstagedCollapsed}
                  onToggleCollapse={() => setUnstagedCollapsed(!unstagedCollapsed)}
                  onFileToggle={handleFileToggle}
                  onFileClick={handleFileClick}
                  actionLabel="Stage All"
                  onAction={git.stageAll}
                  secondaryAction="Discard All"
                  onSecondaryAction={() => setShowDiscardAllConfirm(true)}
                />
              )}

              {/* Untracked */}
              {untrackedFiles.length > 0 && (
                <FileSection
                  title="Untracked Files"
                  files={untrackedFiles}
                  color="#565f89"
                  collapsed={untrackedCollapsed}
                  onToggleCollapse={() => setUntrackedCollapsed(!untrackedCollapsed)}
                  onFileToggle={handleFileToggle}
                  onFileClick={handleFileClick}
                  actionLabel="Add All"
                  onAction={git.stageAll}
                />
              )}
            </div>

            {/* Action bar */}
            <div className="git-panel-action-bar">
              <div className="git-panel-action-left">
                {unstagedFiles.length > 0 && (
                  <button className="git-panel-text-btn" onClick={git.stageAll}>Stage All</button>
                )}
                {stagedFiles.length > 0 && (
                  <button className="git-panel-text-btn" onClick={git.unstageAll}>Unstage All</button>
                )}
              </div>
              <div className="git-panel-action-right">
                <button
                  className="git-panel-generate-btn"
                  onClick={async () => {
                    const msg = await git.generateMessage();
                    if (msg) setShowCommitDialog(true);
                  }}
                  disabled={stagedFiles.length === 0 || git.operationInProgress !== null}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Generate
                </button>
                <button
                  className="git-panel-commit-btn"
                  onClick={() => setShowCommitDialog(true)}
                  disabled={stagedFiles.length === 0 || status.hasConflicts}
                >
                  Commit ({stagedFiles.length > 20 ? '20+' : stagedFiles.length})
                </button>
              </div>
            </div>

            {/* Recent commits */}
            <div className="git-panel-history">
              <div
                className="git-section-header"
                onClick={() => setHistoryCollapsed(!historyCollapsed)}
              >
                <div className="git-section-header-left">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#565f89" strokeWidth="2"
                    style={{ transform: historyCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 200ms' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span>RECENT COMMITS</span>
                  <span className="git-section-count">({git.log.length})</span>
                </div>
              </div>
              {!historyCollapsed && (
                <div className="git-history-list">
                  {git.log.length === 0 && (
                    <div className="git-history-empty">
                      <p>No commits yet</p>
                    </div>
                  )}
                  {git.log.map((commit) => (
                    <div key={commit.hash} className="git-commit-entry">
                      <div className="git-commit-top">
                        <span className="git-commit-hash" title={commit.hash}>{commit.shortHash}</span>
                        <span className="git-commit-time">
                          {formatRelativeTime(commit.date)}
                        </span>
                      </div>
                      <div className="git-commit-message">
                        {formatCommitMessage(commit.subject)}
                      </div>
                      <div className="git-commit-meta">
                        <span className="git-commit-author">{commit.authorName}</span>
                        {commit.filesChanged > 0 && (
                          <span className="git-commit-stats">
                            {commit.filesChanged} file{commit.filesChanged !== 1 ? 's' : ''}
                            {commit.insertions > 0 && <span className="git-stat-add"> +{commit.insertions}</span>}
                            {commit.deletions > 0 && <span className="git-stat-del"> -{commit.deletions}</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Loading state */}
        {!status && git.isLoading && (
          <div className="git-panel-loading">
            <div className="git-panel-spinner" />
            <span>Loading git status...</span>
          </div>
        )}
      </div>

      {/* Diff viewer overlay */}
      <DiffViewer
        isOpen={showDiffViewer}
        initialFile={diffViewerFile}
        files={status?.files || []}
        selectedDiff={git.selectedDiff}
        onClose={() => { setShowDiffViewer(false); setDiffViewerFile(null); }}
        viewDiff={git.viewDiff}
        viewFileContent={git.viewFileContent}
        stageFiles={git.stageFiles}
        unstageFiles={git.unstageFiles}
        discardFile={git.discardFile}
      />

      {/* Commit dialog */}
      <CommitDialog
        isOpen={showCommitDialog}
        onClose={() => setShowCommitDialog(false)}
        onCommit={git.commit}
        onGenerateMessage={async () => (await git.generateMessage()) ?? null}
        stagedFiles={stagedFiles}
        workingDirectory={projectPath || ''}
        sessionId={activeSessionId}
        generatedMessage={git.generatedMessage}
        isGenerating={git.operationInProgress === 'generating'}
      />

      {/* Discard all confirmation */}
      <ConfirmDialog
        isOpen={showDiscardAllConfirm}
        title="Discard All Changes?"
        message="This will permanently discard all unstaged changes. This action cannot be undone."
        confirmLabel="Discard"
        cancelLabel="Cancel"
        isDangerous={true}
        onConfirm={() => { git.discardAll(); setShowDiscardAllConfirm(false); }}
        onCancel={() => setShowDiscardAllConfirm(false)}
      />

      <style>{gitPanelStyles}</style>
    </>
  );
}

// ── File Section Component ──

interface FileSectionProps {
  title: string;
  files: GitFileEntry[];
  color: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onFileToggle: (file: GitFileEntry) => void;
  onFileClick: (file: GitFileEntry) => void;
  actionLabel?: string;
  onAction?: () => void;
  secondaryAction?: string;
  onSecondaryAction?: () => void;
  isConflict?: boolean;
}

function FileSection({
  title,
  files,
  color,
  collapsed,
  onToggleCollapse,
  onFileToggle,
  onFileClick,
  actionLabel,
  onAction,
  secondaryAction,
  onSecondaryAction,
  isConflict,
}: FileSectionProps) {
  return (
    <div className="git-file-section" style={{ borderLeftColor: color }}>
      <div className="git-section-header" onClick={onToggleCollapse}>
        <div className="git-section-header-left">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#565f89" strokeWidth="2"
            style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 200ms' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span>{title}</span>
          <span className="git-section-count">({files.length})</span>
        </div>
        <div className="git-section-actions" onClick={(e) => e.stopPropagation()}>
          {actionLabel && onAction && (
            <button className="git-section-action-btn" onClick={onAction}>{actionLabel}</button>
          )}
          {secondaryAction && onSecondaryAction && (
            <>
              <span className="git-section-divider">&middot;</span>
              <button className="git-section-action-btn git-section-action-danger" onClick={onSecondaryAction}>{secondaryAction}</button>
            </>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="git-file-list">
          {files.map((file) => (
            <div key={`${file.area}-${file.path}`} className="git-file-entry">
              {!isConflict ? (
                <input
                  type="checkbox"
                  className="git-file-checkbox"
                  checked={file.area === 'staged'}
                  onChange={() => onFileToggle(file)}
                />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f7768e" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              )}
              <div className="git-file-info" onClick={() => onFileClick(file)}>
                <span className="git-file-name" title={file.path}>
                  {file.path.split('/').pop() || file.path}
                </span>
                {file.path.includes('/') && (
                  <span className="git-file-dir">{file.path.slice(0, file.path.lastIndexOf('/'))}/</span>
                )}
              </div>
              <span className={`git-file-status git-status-${file.indexStatus}`}>
                {statusLabel(file.area === 'staged' ? file.indexStatus : file.workTreeStatus)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'added': return 'A';
    case 'modified': return 'M';
    case 'deleted': return 'D';
    case 'renamed': return 'R';
    case 'copied': return 'C';
    case 'untracked': return 'U';
    case 'unmerged': return '!';
    default: return '?';
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return date.toLocaleDateString();
}

function formatCommitMessage(subject: string): JSX.Element {
  const prefixMatch = subject.match(/^(feat|fix|docs|refactor|style|test|chore|perf|ci|build)(\(.+?\))?:/);
  if (prefixMatch) {
    const prefix = prefixMatch[0];
    const rest = subject.slice(prefix.length);
    const colorMap: Record<string, string> = {
      feat: '#7dcfff', fix: '#9ece6a', docs: '#7aa2f7', refactor: '#bb9af7',
      style: '#e0af68', test: '#9ece6a', chore: '#565f89', perf: '#ff9e64',
      ci: '#7dcfff', build: '#e0af68',
    };
    const type = prefixMatch[1];
    return (
      <>
        <span style={{ color: colorMap[type] || '#c0caf5' }}>{prefix}</span>
        <span>{rest}</span>
      </>
    );
  }
  return <>{subject}</>;
}

const gitPanelStyles = `
  .git-panel-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 7999;
  }

  .git-panel {
    position: fixed;
    top: 36px;
    right: 0;
    width: 420px;
    height: calc(100% - 36px);
    background: #1a1b26;
    border-left: 1px solid #292e42;
    z-index: 8000;
    display: flex;
    flex-direction: column;
    animation: gitPanelSlideIn 200ms ease-out;
    overflow: hidden;
  }

  @keyframes gitPanelSlideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .git-panel-header {
    height: 60px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid #292e42;
    flex-shrink: 0;
  }

  .git-panel-title {
    font-size: 16px;
    font-weight: 600;
    color: #c0caf5;
    margin: 0;
    font-family: 'JetBrains Mono', monospace;
    flex-grow: 1;
  }

  .git-panel-status {
    font-size: 11px;
    color: #7aa2f7;
    font-family: 'JetBrains Mono', monospace;
  }

  .git-panel-close {
    background: none;
    border: none;
    color: #565f89;
    cursor: pointer;
    padding: 8px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .git-panel-close:hover { color: #c0caf5; background: #24283b; }

  .git-panel-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 60px 40px;
    text-align: center;
  }

  .git-panel-empty h4 {
    font-size: 16px;
    font-weight: 600;
    color: #c0caf5;
    margin: 0;
    font-family: 'JetBrains Mono', monospace;
  }

  .git-panel-empty p {
    font-size: 13px;
    color: #565f89;
    max-width: 280px;
    line-height: 1.5;
    margin: 0;
    font-family: 'JetBrains Mono', monospace;
  }

  .git-panel-init-btn {
    padding: 10px 20px;
    background: #7aa2f7;
    border: none;
    border-radius: 4px;
    color: #1a1b26;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .git-panel-init-btn:hover { background: #89b4fa; }
  .git-panel-init-btn:disabled { background: #3b4261; cursor: not-allowed; }

  /* Branch bar */
  .git-panel-branch-bar {
    height: 48px;
    padding: 8px 16px;
    background: #24283b;
    border-bottom: 1px solid #292e42;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .git-panel-branch-left { display: flex; align-items: center; gap: 6px; }

  .git-panel-branch-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 4px;
    cursor: pointer;
    min-width: 120px;
  }

  .git-panel-branch-trigger:hover { border-color: #7aa2f7; }

  .git-panel-branch-name {
    font-size: 13px;
    color: #c0caf5;
    font-family: 'JetBrains Mono', monospace;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .git-panel-sync-badges { display: flex; gap: 4px; }

  .git-badge {
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .git-badge-ahead { color: #7aa2f7; background: rgba(122, 162, 247, 0.15); }
  .git-badge-behind { color: #e0af68; background: rgba(224, 175, 104, 0.15); }

  .git-panel-branch-actions { display: flex; gap: 4px; }

  .git-panel-remote-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 4px;
    color: #565f89;
    cursor: pointer;
  }

  .git-panel-remote-btn:hover:not(:disabled) { border-color: #7aa2f7; color: #7aa2f7; }
  .git-panel-remote-btn:disabled { color: #3b4261; cursor: not-allowed; }

  /* Branch dropdown */
  .git-branch-dropdown {
    background: #24283b;
    border: 1px solid #292e42;
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    max-height: 400px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    margin: 0 8px;
  }

  .git-branch-search {
    padding: 12px;
    background: #1a1b26;
    border: none;
    border-bottom: 1px solid #292e42;
    color: #c0caf5;
    font-size: 13px;
    font-family: 'JetBrains Mono', monospace;
    outline: none;
  }

  .git-branch-search:focus { border-bottom-color: #7aa2f7; }
  .git-branch-search::placeholder { color: #565f89; }

  .git-branch-list { overflow-y: auto; max-height: 250px; }

  .git-branch-section-label {
    padding: 8px 12px;
    font-size: 10px;
    font-weight: 600;
    color: #565f89;
    background: #24283b;
    font-family: 'JetBrains Mono', monospace;
    position: sticky;
    top: 0;
  }

  .git-branch-entry {
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    font-size: 13px;
    color: #c0caf5;
    font-family: 'JetBrains Mono', monospace;
  }

  .git-branch-entry:hover { background: #1a1b26; }

  .git-branch-entry.current {
    background: rgba(122, 162, 247, 0.1);
    border-left: 2px solid #7aa2f7;
  }

  .git-branch-empty {
    padding: 20px;
    text-align: center;
    color: #565f89;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
  }

  .git-branch-create {
    border-top: 1px solid #292e42;
    padding: 8px 12px;
  }

  .git-branch-create-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    color: #7aa2f7;
    font-size: 13px;
    font-family: 'JetBrains Mono', monospace;
    padding: 4px 0;
  }

  .git-branch-create-trigger:hover { color: #89b4fa; }

  .git-branch-create-form { display: flex; flex-direction: column; gap: 8px; }

  .git-branch-create-input {
    width: 100%;
    padding: 6px 8px;
    background: #1a1b26;
    border: 1px solid #7aa2f7;
    border-radius: 4px;
    color: #c0caf5;
    font-size: 13px;
    font-family: 'JetBrains Mono', monospace;
    outline: none;
    box-sizing: border-box;
  }

  .git-branch-create-input::placeholder { color: #565f89; }

  .git-branch-create-actions { display: flex; gap: 8px; }

  .git-branch-create-btn {
    padding: 6px 12px;
    background: #7aa2f7;
    border: none;
    border-radius: 4px;
    color: #1a1b26;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
  }

  .git-branch-create-btn:disabled { background: #3b4261; cursor: not-allowed; }

  .git-branch-cancel-btn {
    padding: 6px 12px;
    background: none;
    border: none;
    color: #7aa2f7;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
  }

  /* Banners */
  .git-banner {
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #c0caf5;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
  }

  .git-banner-info { background: rgba(122, 162, 247, 0.12); border-left: 3px solid #7aa2f7; }
  .git-banner-warning { background: rgba(224, 175, 104, 0.15); border-left: 3px solid #e0af68; }

  .git-banner-action {
    margin-left: auto;
    background: none;
    border: none;
    color: #7aa2f7;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
    white-space: nowrap;
  }

  .git-banner-action:hover { text-decoration: underline; }

  /* Changes section */
  .git-panel-changes {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .git-panel-clean {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px 20px;
    text-align: center;
  }

  .git-panel-clean h4 {
    font-size: 14px;
    font-weight: 600;
    color: #c0caf5;
    margin: 0;
    font-family: 'JetBrains Mono', monospace;
  }

  .git-panel-clean p {
    font-size: 12px;
    color: #565f89;
    margin: 0;
    font-family: 'JetBrains Mono', monospace;
  }

  /* File sections */
  .git-file-section { border-left: 3px solid; }

  .git-section-header {
    padding: 10px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    background: #24283b;
  }

  .git-section-header:hover { background: #2a2f42; }

  .git-section-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: #c0caf5;
    text-transform: uppercase;
    font-family: 'JetBrains Mono', monospace;
  }

  .git-section-count { color: #565f89; font-weight: 400; }

  .git-section-actions { display: flex; align-items: center; gap: 4px; }

  .git-section-action-btn {
    background: none;
    border: none;
    color: #7aa2f7;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
    padding: 2px 4px;
  }

  .git-section-action-btn:hover { text-decoration: underline; color: #89b4fa; }
  .git-section-action-danger { color: #f7768e; }
  .git-section-action-danger:hover { color: #f7768e; }
  .git-section-divider { color: #565f89; padding: 0 4px; }

  /* File entries */
  .git-file-list { background: #1a1b26; }

  .git-file-entry {
    padding: 8px 16px 8px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid #292e42;
    transition: background 100ms;
  }

  .git-file-entry:hover { background: #24283b; }

  .git-file-checkbox {
    width: 16px;
    height: 16px;
    accent-color: #7aa2f7;
    cursor: pointer;
    flex-shrink: 0;
  }

  .git-file-info {
    flex: 1;
    min-width: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .git-file-name {
    font-size: 13px;
    color: #c0caf5;
    font-family: 'JetBrains Mono', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .git-file-dir {
    font-size: 11px;
    color: #565f89;
    font-family: 'JetBrains Mono', monospace;
  }

  .git-file-status {
    font-size: 12px;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
    width: 16px;
    text-align: center;
  }

  .git-status-added { color: #9ece6a; }
  .git-status-modified { color: #e0af68; }
  .git-status-deleted { color: #f7768e; }
  .git-status-renamed { color: #7dcfff; }
  .git-status-untracked { color: #565f89; }
  .git-status-unmerged { color: #f7768e; }

  /* Action bar */
  .git-panel-action-bar {
    height: 56px;
    padding: 12px 16px;
    background: #24283b;
    border-top: 1px solid #292e42;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .git-panel-action-left { display: flex; gap: 8px; }
  .git-panel-action-right { display: flex; gap: 8px; }

  .git-panel-text-btn {
    background: none;
    border: none;
    color: #7aa2f7;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
  }

  .git-panel-text-btn:hover { text-decoration: underline; color: #89b4fa; }

  .git-panel-generate-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #1a1b26;
    border: 1px solid #7aa2f7;
    border-radius: 4px;
    color: #c0caf5;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
  }

  .git-panel-generate-btn:hover:not(:disabled) {
    background: #7aa2f7;
    color: #1a1b26;
  }

  .git-panel-generate-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .git-panel-commit-btn {
    padding: 8px 16px;
    background: #7aa2f7;
    border: none;
    border-radius: 4px;
    color: #1a1b26;
    font-size: 13px;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
  }

  .git-panel-commit-btn:hover:not(:disabled) { background: #89b4fa; }
  .git-panel-commit-btn:disabled { background: #3b4261; cursor: not-allowed; }

  /* History */
  .git-panel-history {
    border-top: 1px solid #292e42;
    max-height: 300px;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .git-history-list { background: #1a1b26; }

  .git-history-empty {
    padding: 40px 20px;
    text-align: center;
    color: #565f89;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
  }

  .git-commit-entry {
    padding: 12px 16px;
    border-bottom: 1px solid #292e42;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .git-commit-entry:hover { background: #24283b; }

  .git-commit-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .git-commit-hash {
    font-size: 11px;
    color: #565f89;
    font-family: 'JetBrains Mono', monospace;
  }

  .git-commit-time {
    font-size: 11px;
    color: #565f89;
    font-family: 'JetBrains Mono', monospace;
  }

  .git-commit-message {
    font-size: 13px;
    color: #c0caf5;
    font-family: 'JetBrains Mono', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .git-commit-meta {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .git-commit-author {
    font-size: 11px;
    color: #565f89;
    font-family: 'JetBrains Mono', monospace;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .git-commit-stats {
    font-size: 11px;
    color: #565f89;
    font-family: 'JetBrains Mono', monospace;
  }

  .git-stat-add { color: #9ece6a; }
  .git-stat-del { color: #f7768e; }

  /* Loading */
  .git-panel-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #565f89;
    font-size: 13px;
    font-family: 'JetBrains Mono', monospace;
  }

  .git-panel-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid #292e42;
    border-top-color: #7aa2f7;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
