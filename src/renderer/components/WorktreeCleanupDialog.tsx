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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--semantic-success)" strokeWidth="2">
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
    background: rgba(13, 14, 20, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal, 400);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .wtc-dialog {
    width: 440px;
    max-width: calc(100vw - 32px);
    background: var(--surface-overlay, #1A1B26);
    border: 1px solid var(--border-default, #292E44);
    border-radius: var(--radius-lg, 10px);
    box-shadow: var(--shadow-xl, 0 24px 64px #000000A0);
    overflow: hidden;
    animation: wtc-fade-in var(--duration-normal, 200ms) var(--ease-out, ease) both;
  }

  @keyframes wtc-fade-in {
    from { opacity: 0; transform: scale(0.96); }
    to   { opacity: 1; transform: scale(1); }
  }

  .wtc-header {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-4, 16px) var(--space-5, 20px);
    border-bottom: 1px solid var(--border-subtle, #1E2030);
  }

  .wtc-title {
    font-size: var(--text-base, 13px);
    font-weight: var(--weight-semibold, 600);
    color: var(--text-primary, #E2E4F0);
    margin: 0;
  }

  .wtc-body {
    padding: var(--space-4, 16px) var(--space-5, 20px);
  }

  .wtc-description {
    font-size: var(--text-sm, 12px);
    color: var(--text-secondary, #9DA3BE);
    line-height: var(--leading-normal, 1.5);
    margin: 0 0 var(--space-4, 16px);
  }

  .wtc-description strong {
    color: var(--semantic-success, #3DD68C);
    font-weight: var(--weight-semibold, 600);
  }

  .wtc-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
    margin-bottom: var(--space-3, 12px);
  }

  .wtc-option {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2, 8px);
    padding: var(--space-2, 8px) var(--space-3, 12px);
    border: 1px solid var(--border-default, #292E44);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: border-color var(--duration-fast, 150ms) var(--ease-inout, ease),
                background-color var(--duration-fast, 150ms) var(--ease-inout, ease);
  }

  .wtc-option:hover {
    border-color: var(--border-strong, #3D4163);
    background: var(--state-hover, #FFFFFF0A);
  }

  .wtc-option.active {
    border-color: var(--semantic-success, #3DD68C);
    background: rgba(61, 214, 140, 0.05);
  }

  .wtc-option.active.danger {
    border-color: var(--semantic-error, #F7678E);
    background: rgba(247, 103, 142, 0.05);
  }

  .wtc-option input {
    accent-color: var(--accent-primary, #00C9A7);
    margin-top: 2px;
    flex-shrink: 0;
  }

  .wtc-option-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .wtc-option-label {
    font-size: var(--text-sm, 12px);
    font-weight: var(--weight-medium, 500);
    color: var(--text-primary, #E2E4F0);
  }

  .wtc-option-desc {
    font-size: var(--text-xs, 11px);
    color: var(--text-tertiary, #5C6080);
    line-height: var(--leading-normal, 1.5);
  }

  .wtc-warning {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-2, 8px) var(--space-3, 12px);
    background: rgba(247, 103, 142, 0.08);
    border: 1px solid rgba(247, 103, 142, 0.2);
    border-radius: var(--radius-md, 6px);
    font-size: var(--text-xs, 11px);
    color: var(--semantic-error, #F7678E);
    margin-bottom: var(--space-3, 12px);
    animation: wtc-slideDown var(--duration-fast, 150ms) var(--ease-out, ease);
  }

  @keyframes wtc-slideDown {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .wtc-remember {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    font-size: var(--text-xs, 11px);
    color: var(--text-tertiary, #5C6080);
    cursor: pointer;
    user-select: none;
  }

  .wtc-checkbox {
    width: 14px;
    height: 14px;
    border: 1px solid var(--border-strong, #3D4163);
    border-radius: var(--radius-sm, 3px);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color var(--duration-fast, 150ms) var(--ease-inout, ease),
                border-color var(--duration-fast, 150ms) var(--ease-inout, ease);
    flex-shrink: 0;
  }

  .wtc-checkbox.checked {
    background: var(--accent-primary, #00C9A7);
    border-color: var(--accent-primary, #00C9A7);
    color: var(--text-inverse, #0D0E14);
  }

  .wtc-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2, 8px);
    padding: var(--space-3, 12px) var(--space-5, 20px);
    border-top: 1px solid var(--border-subtle, #1E2030);
    background: var(--surface-raised, #13141C);
  }

  .wtc-btn {
    height: 32px;
    padding: 0 var(--space-4, 16px);
    font-size: var(--text-sm, 12px);
    font-weight: var(--weight-semibold, 600);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: background-color var(--duration-fast, 150ms) var(--ease-inout, ease),
                border-color var(--duration-fast, 150ms) var(--ease-inout, ease);
  }

  .wtc-btn:focus-visible {
    outline: 2px solid var(--state-focus, #00C9A740);
    outline-offset: 2px;
  }

  .wtc-btn-cancel {
    background: transparent;
    border: 1px solid var(--border-default, #292E44);
    color: var(--text-secondary, #9DA3BE);
  }

  .wtc-btn-cancel:hover {
    background: var(--state-hover, #FFFFFF0A);
    border-color: var(--border-strong, #3D4163);
    color: var(--text-primary, #E2E4F0);
  }

  .wtc-btn-submit {
    background: var(--accent-primary, #00C9A7);
    border: none;
    color: var(--text-inverse, #0D0E14);
  }

  .wtc-btn-submit:hover {
    background: var(--accent-primary-dim, #009E84);
  }

  .wtc-btn-submit.danger {
    background: var(--semantic-error, #F7678E);
  }

  .wtc-btn-submit.danger:hover {
    background: #e8567d;
  }

  @media (prefers-reduced-motion: reduce) {
    .wtc-dialog { animation: none; }
    .wtc-warning { animation: none; }
  }
`;
