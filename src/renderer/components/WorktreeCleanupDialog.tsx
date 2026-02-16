import { useState } from 'react';
import type { WorktreeInfo } from '../../shared/types/git-types';

interface WorktreeCleanupDialogProps {
  isOpen: boolean;
  worktreeInfo: WorktreeInfo;
  onClose: (removeWorktree: boolean, dontAskAgain: boolean) => void;
}

export function WorktreeCleanupDialog({ isOpen, worktreeInfo, onClose }: WorktreeCleanupDialogProps) {
  const [action, setAction] = useState<'keep' | 'remove'>('keep');
  const [dontAskAgain, setDontAskAgain] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = () => {
    onClose(action === 'remove', dontAskAgain);
  };

  return (
    <div className="wtc-overlay">
      <div className="wtc-dialog">
        <div className="wtc-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ece6a" strokeWidth="2">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 01-9 9" />
          </svg>
          <h2 className="wtc-title">Close Worktree Session</h2>
        </div>

        <div className="wtc-body">
          <p className="wtc-description">
            This session uses a managed worktree on branch <strong>{worktreeInfo.branch}</strong>.
            What would you like to do with the worktree?
          </p>

          <div className="wtc-options">
            <label className={`wtc-option ${action === 'keep' ? 'active' : ''}`}>
              <input
                type="radio"
                name="cleanup-action"
                checked={action === 'keep'}
                onChange={() => setAction('keep')}
              />
              <div className="wtc-option-content">
                <span className="wtc-option-label">Keep worktree</span>
                <span className="wtc-option-desc">The worktree directory remains on disk for later use</span>
              </div>
            </label>

            <label className={`wtc-option ${action === 'remove' ? 'active danger' : ''}`}>
              <input
                type="radio"
                name="cleanup-action"
                checked={action === 'remove'}
                onChange={() => setAction('remove')}
              />
              <div className="wtc-option-content">
                <span className="wtc-option-label">Remove worktree and its files</span>
                <span className="wtc-option-desc">Deletes the worktree directory. Commits are preserved in the main repo.</span>
              </div>
            </label>
          </div>

          {action === 'remove' && (
            <div className="wtc-warning">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              Any uncommitted changes in the worktree will be lost
            </div>
          )}

          <label className="wtc-remember" onClick={() => setDontAskAgain(prev => !prev)}>
            <div className={`wtc-checkbox ${dontAskAgain ? 'checked' : ''}`}>
              {dontAskAgain && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
            Don't ask again
          </label>
        </div>

        <div className="wtc-footer">
          <button className="wtc-btn wtc-btn-cancel" onClick={() => onClose(false, false)}>
            Cancel
          </button>
          <button
            className={`wtc-btn wtc-btn-submit ${action === 'remove' ? 'danger' : ''}`}
            onClick={handleSubmit}
          >
            {action === 'remove' ? 'Close & Remove' : 'Close Session'}
          </button>
        </div>
      </div>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .wtc-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .wtc-dialog {
    width: 440px;
    max-width: calc(100vw - 32px);
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .wtc-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
    border-bottom: 1px solid #292e42;
    background: linear-gradient(to bottom, #1e2030, #1a1b26);
  }

  .wtc-title {
    font-size: 14px;
    font-weight: 600;
    color: #c0caf5;
    margin: 0;
  }

  .wtc-body {
    padding: 16px 20px;
  }

  .wtc-description {
    font-size: 12px;
    color: #a9b1d6;
    line-height: 1.5;
    margin: 0 0 16px;
  }

  .wtc-description strong {
    color: #9ece6a;
    font-weight: 600;
  }

  .wtc-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }

  .wtc-option {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid #292e42;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .wtc-option:hover {
    border-color: #3b4261;
  }

  .wtc-option.active {
    border-color: #9ece6a;
    background: rgba(158, 206, 106, 0.05);
  }

  .wtc-option.active.danger {
    border-color: #f7768e;
    background: rgba(247, 118, 142, 0.05);
  }

  .wtc-option input {
    accent-color: #9ece6a;
    margin-top: 2px;
  }

  .wtc-option.danger input {
    accent-color: #f7768e;
  }

  .wtc-option-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .wtc-option-label {
    font-size: 12px;
    font-weight: 500;
    color: #c0caf5;
  }

  .wtc-option-desc {
    font-size: 11px;
    color: #565f89;
  }

  .wtc-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(247, 118, 142, 0.1);
    border: 1px solid rgba(247, 118, 142, 0.2);
    border-radius: 6px;
    font-size: 11px;
    color: #f7768e;
    margin-bottom: 12px;
    animation: wtc-slideDown 0.15s ease;
  }

  @keyframes wtc-slideDown {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .wtc-remember {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #565f89;
    cursor: pointer;
  }

  .wtc-checkbox {
    width: 14px;
    height: 14px;
    border: 1px solid #3b4261;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .wtc-checkbox.checked {
    background: #7aa2f7;
    border-color: #7aa2f7;
    color: #1a1b26;
  }

  .wtc-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid #292e42;
    background: #16161e;
  }

  .wtc-btn {
    height: 34px;
    padding: 0 16px;
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .wtc-btn-cancel {
    background: transparent;
    border: 1px solid #292e42;
    color: #a9b1d6;
  }

  .wtc-btn-cancel:hover {
    background: #1a1b26;
    border-color: #3b4261;
  }

  .wtc-btn-submit {
    background: #7aa2f7;
    border: none;
    color: #1a1b26;
  }

  .wtc-btn-submit:hover {
    background: #89b4fa;
  }

  .wtc-btn-submit.danger {
    background: #f7768e;
  }

  .wtc-btn-submit.danger:hover {
    background: #ff899b;
  }
`;
