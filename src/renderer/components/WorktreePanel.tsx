import { useState, useEffect, useCallback } from 'react';
import type { GitWorktreeEntry, WorktreeRemoveRequest } from '../../shared/types/git-types';

interface WorktreePanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string | null;
}

export function WorktreePanel({ isOpen, onClose, projectPath }: WorktreePanelProps) {
  const [worktrees, setWorktrees] = useState<GitWorktreeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const loadWorktrees = useCallback(async () => {
    if (!projectPath) return;
    setIsLoading(true);
    setError(null);
    try {
      const wt = await window.electronAPI.gitWorktreeList(projectPath);
      setWorktrees(wt);
    } catch (err) {
      setError('Failed to load worktrees');
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    if (isOpen && projectPath) {
      loadWorktrees();
    }
  }, [isOpen, projectPath, loadWorktrees]);

  // Subscribe to worktree events
  useEffect(() => {
    const unsub1 = window.electronAPI.onWorktreeCreated(() => loadWorktrees());
    const unsub2 = window.electronAPI.onWorktreeRemoved(() => loadWorktrees());
    return () => { unsub1(); unsub2(); };
  }, [loadWorktrees]);

  const handleRemove = async (entry: GitWorktreeEntry) => {
    if (!projectPath) return;
    setRemoving(entry.path);
    try {
      const request: WorktreeRemoveRequest = {
        mainRepoPath: projectPath,
        worktreePath: entry.path,
        force: false,
      };
      const result = await window.electronAPI.gitWorktreeRemove(request);
      if (!result.success) {
        setError(result.message);
      }
      await loadWorktrees();
    } catch {
      setError('Failed to remove worktree');
    } finally {
      setRemoving(null);
    }
  };

  const handlePruneAll = async () => {
    if (!projectPath) return;
    try {
      const result = await window.electronAPI.gitWorktreePrune(projectPath);
      if (result.success) {
        await loadWorktrees();
      } else {
        setError(result.message);
      }
    } catch {
      setError('Failed to prune worktrees');
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const linkedWorktrees = worktrees.filter(w => !w.isMainWorktree);
  const hasStale = linkedWorktrees.some(w => w.isPrunable);

  return (
    <div className="wtp-overlay" onClick={handleOverlayClick}>
      <div className="wtp-panel">
        {/* Header */}
        <div className="wtp-header">
          <div className="wtp-header-left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--semantic-success, #3DD68C)" strokeWidth="2">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 01-9 9" />
            </svg>
            <h2 className="wtp-title">Worktrees</h2>
            <span className="wtp-count">{linkedWorktrees.length}</span>
          </div>
          <div className="wtp-header-right">
            <button className="wtp-refresh-btn" onClick={loadWorktrees} title="Refresh">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
              </svg>
            </button>
            <button className="wtp-close-btn" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 2l10 10M12 2L2 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="wtp-content">
          {isLoading ? (
            <div className="wtp-loading">
              <div className="wtp-spinner" />
              <span>Loading worktrees...</span>
            </div>
          ) : linkedWorktrees.length === 0 ? (
            <div className="wtp-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--border-strong, #3D4163)" strokeWidth="1.5">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 01-9 9" />
              </svg>
              <span>No linked worktrees</span>
              <span className="wtp-empty-hint">Create one when starting a new session</span>
            </div>
          ) : (
            <div className="wtp-list">
              {linkedWorktrees.map(wt => (
                <div key={wt.path} className={`wtp-card ${removing === wt.path ? 'removing' : ''}`}>
                  <div className="wtp-card-header">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--semantic-success, #3DD68C)" strokeWidth="2">
                      <line x1="6" y1="3" x2="6" y2="15" />
                      <circle cx="18" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <path d="M18 9a9 9 0 01-9 9" />
                    </svg>
                    <span className="wtp-branch-name">{wt.branch || 'detached'}</span>
                    <span className={`wtp-status-badge ${
                      wt.isLocked ? 'locked' : wt.isPrunable ? 'stale' : wt.linkedSessionId ? 'active' : 'inactive'
                    }`}>
                      {wt.isLocked ? 'Locked' : wt.isPrunable ? 'Stale' : wt.linkedSessionId ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="wtp-card-path">{wt.path}</div>
                  <div className="wtp-card-meta">
                    <span className="wtp-card-head">{wt.head.slice(0, 8)}</span>
                    {(wt.managedByOmniDesk ?? wt.managedByClaudeDesk) && (
                      <span className="wtp-managed-badge">Managed</span>
                    )}
                  </div>
                  <div className="wtp-card-actions">
                    {!wt.linkedSessionId && (
                      <button
                        className="wtp-remove-btn"
                        onClick={() => handleRemove(wt)}
                        disabled={removing !== null}
                      >
                        {removing === wt.path ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                    {wt.linkedSessionId && (
                      <span className="wtp-linked-label">In use by session</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="wtp-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4m0 4h.01" />
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        {linkedWorktrees.length > 0 && (
          <div className="wtp-footer">
            {hasStale && (
              <button className="wtp-prune-btn" onClick={handlePruneAll}>
                Prune All Stale
              </button>
            )}
          </div>
        )}
      </div>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .wtp-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .wtp-panel {
    width: 520px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 64px);
    background: var(--surface-overlay, #1A1B26);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 12px;
    box-shadow:
      0 0 0 1px rgba(61, 214, 140, 0.1),
      0 20px 50px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .wtp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-default, #292E44);
    background: linear-gradient(to bottom, var(--surface-float, #222435), var(--surface-overlay, #1A1B26));
  }

  .wtp-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .wtp-header-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .wtp-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #E2E4F0);
    margin: 0;
  }

  .wtp-count {
    font-size: 11px;
    color: var(--text-tertiary, #5C6080);
    background: var(--border-default, #292E44);
    padding: 2px 8px;
    border-radius: 10px;
  }

  .wtp-refresh-btn,
  .wtp-close-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-tertiary, #5C6080);
    cursor: pointer;
    transition: all 0.15s;
  }

  .wtp-refresh-btn:hover,
  .wtp-close-btn:hover {
    background: var(--border-default, #292E44);
    color: var(--text-primary, #E2E4F0);
  }

  .wtp-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }

  .wtp-loading,
  .wtp-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 0;
    gap: 12px;
    color: var(--border-strong, #3D4163);
    font-size: 12px;
  }

  .wtp-empty-hint {
    font-size: 11px;
    color: var(--border-default, #292E44);
  }

  .wtp-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-default, #292E44);
    border-top-color: var(--semantic-success, #3DD68C);
    border-radius: 50%;
    animation: wtp-spin 0.8s linear infinite;
  }

  @keyframes wtp-spin {
    to { transform: rotate(360deg); }
  }

  .wtp-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .wtp-card {
    padding: 12px;
    background: var(--surface-raised, #13141C);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 8px;
    transition: all 0.15s;
  }

  .wtp-card:hover {
    border-color: var(--border-strong, #3D4163);
  }

  .wtp-card.removing {
    opacity: 0.5;
  }

  .wtp-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .wtp-branch-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #E2E4F0);
    flex: 1;
  }

  .wtp-status-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .wtp-status-badge.active {
    background: rgba(61, 214, 140, 0.15);
    color: var(--semantic-success, #3DD68C);
  }

  .wtp-status-badge.inactive {
    background: var(--border-default, #292E44);
    color: var(--text-secondary, #9DA3BE);
  }

  .wtp-status-badge.locked {
    background: rgba(247, 103, 142, 0.15);
    color: var(--semantic-error, #F7678E);
  }

  .wtp-status-badge.stale {
    background: rgba(247, 168, 74, 0.15);
    color: var(--semantic-warning, #F7A84A);
  }

  .wtp-card-path {
    font-size: 11px;
    color: var(--text-tertiary, #5C6080);
    word-break: break-all;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    margin-bottom: 6px;
  }

  .wtp-card-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .wtp-card-head {
    font-size: 10px;
    color: var(--border-strong, #3D4163);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .wtp-managed-badge {
    font-size: 9px;
    color: var(--semantic-success, #3DD68C);
    background: rgba(61, 214, 140, 0.1);
    padding: 1px 6px;
    border-radius: 8px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .wtp-card-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .wtp-remove-btn {
    height: 26px;
    padding: 0 12px;
    font-size: 11px;
    font-weight: 500;
    font-family: inherit;
    background: transparent;
    border: 1px solid var(--border-default, #292E44);
    border-radius: 6px;
    color: var(--semantic-error, #F7678E);
    cursor: pointer;
    transition: all 0.15s;
  }

  .wtp-remove-btn:hover {
    background: rgba(247, 103, 142, 0.1);
    border-color: var(--semantic-error, #F7678E);
  }

  .wtp-remove-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .wtp-linked-label {
    font-size: 11px;
    color: var(--text-tertiary, #5C6080);
    font-style: italic;
  }

  .wtp-error {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 10px 14px;
    background: rgba(247, 103, 142, 0.1);
    border: 1px solid rgba(247, 103, 142, 0.2);
    border-radius: 8px;
    font-size: 12px;
    color: var(--semantic-error, #F7678E);
  }

  .wtp-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--border-default, #292E44);
    background: var(--surface-raised, #13141C);
    display: flex;
    justify-content: flex-end;
  }

  .wtp-prune-btn {
    height: 30px;
    padding: 0 14px;
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    background: transparent;
    border: 1px solid rgba(247, 168, 74, 0.3);
    border-radius: 6px;
    color: var(--semantic-warning, #F7A84A);
    cursor: pointer;
    transition: all 0.15s;
  }

  .wtp-prune-btn:hover {
    background: rgba(247, 168, 74, 0.1);
    border-color: var(--semantic-warning, #F7A84A);
  }

  .wtp-content::-webkit-scrollbar {
    width: 6px;
  }

  .wtp-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .wtp-content::-webkit-scrollbar-thumb {
    background: var(--border-default, #292E44);
    border-radius: 3px;
  }
`;
