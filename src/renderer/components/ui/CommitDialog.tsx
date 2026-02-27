import { useState, useEffect, useRef } from 'react';
import type { GitFileEntry, GitCommitRequest, GeneratedCommitMessage } from '../../../shared/types/git-types';

interface CommitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (request: GitCommitRequest) => Promise<any>;
  onGenerateMessage: () => Promise<GeneratedCommitMessage | null>;
  stagedFiles: GitFileEntry[];
  workingDirectory: string;
  sessionId: string | null;
  generatedMessage: GeneratedCommitMessage | null;
  isGenerating: boolean;
}

export function CommitDialog({
  isOpen,
  onClose,
  onCommit,
  onGenerateMessage,
  stagedFiles,
  workingDirectory,
  sessionId,
  generatedMessage,
  isGenerating,
}: CommitDialogProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [createCheckpoint, setCreateCheckpoint] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Auto-focus title input on open
  useEffect(() => {
    if (isOpen && titleRef.current) {
      setTimeout(() => titleRef.current?.focus(), 100);
    }
    if (!isOpen) {
      setTitle('');
      setBody('');
      setCommitError(null);
    }
  }, [isOpen]);

  // Populate from generated message
  useEffect(() => {
    if (generatedMessage && isOpen) {
      setTitle(generatedMessage.message);
      setBody('');
    }
  }, [generatedMessage, isOpen]);

  if (!isOpen) return null;

  const handleCommit = async () => {
    if (!title.trim()) return;
    setIsCommitting(true);
    setCommitError(null);

    const fullMessage = body.trim()
      ? `${title.trim()}\n\n${body.trim()}`
      : title.trim();

    const request: GitCommitRequest = {
      workingDirectory,
      message: fullMessage,
      createCheckpoint,
      sessionId,
    };

    try {
      const result = await onCommit(request);
      if (result?.success) {
        onClose();
      } else {
        setCommitError(result?.message || 'Commit failed');
      }
    } catch (err) {
      setCommitError('Commit failed');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && title.trim()) {
      e.preventDefault();
      handleCommit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="commit-dialog-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="commit-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="commit-dialog-header">
          <h3 className="commit-dialog-title">Commit Changes</h3>
          <button className="commit-dialog-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Summary */}
        <div className="commit-dialog-summary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-accent, #00C9A7)" strokeWidth="2">
            <circle cx="12" cy="12" r="4" />
            <line x1="1.05" y1="12" x2="7" y2="12" />
            <line x1="17.01" y1="12" x2="22.96" y2="12" />
          </svg>
          <span>{stagedFiles.length} file{stagedFiles.length !== 1 ? 's' : ''} staged</span>
        </div>

        {/* Title input */}
        <div className="commit-dialog-field">
          <label className="commit-dialog-label">Commit message</label>
          <input
            ref={titleRef}
            className="commit-dialog-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="type(scope): description"
            maxLength={200}
            disabled={isCommitting}
          />
          <div className={`commit-dialog-char-count ${title.length > 72 ? 'warning' : ''}`}>
            {title.length}/72
          </div>
        </div>

        {/* Body textarea */}
        <div className="commit-dialog-field">
          <label className="commit-dialog-label">Description (optional)</label>
          <textarea
            className="commit-dialog-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Provide additional context (optional)..."
            disabled={isCommitting}
          />
        </div>

        {/* Options row */}
        <div className="commit-dialog-options">
          <label className="commit-dialog-checkbox-label">
            <input
              type="checkbox"
              checked={createCheckpoint}
              onChange={(e) => setCreateCheckpoint(e.target.checked)}
              disabled={isCommitting}
            />
            <span>Create checkpoint after commit</span>
          </label>
          <button
            className="commit-dialog-generate-btn"
            onClick={async () => {
              const msg = await onGenerateMessage();
              if (msg) {
                setTitle(msg.message);
                setBody('');
              }
            }}
            disabled={isGenerating || stagedFiles.length === 0 || isCommitting}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={isGenerating ? 'spinning' : ''}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
        </div>

        {/* Confidence badge */}
        {generatedMessage && (
          <div className={`commit-dialog-confidence confidence-${generatedMessage.confidence}`}>
            {generatedMessage.confidence} confidence: {generatedMessage.reasoning}
          </div>
        )}

        {/* Error message */}
        {commitError && (
          <div className="commit-dialog-error">{commitError}</div>
        )}

        {/* Footer */}
        <div className="commit-dialog-footer">
          <button className="commit-dialog-cancel" onClick={onClose} disabled={isCommitting}>
            Cancel
          </button>
          <button
            className="commit-dialog-commit"
            onClick={handleCommit}
            disabled={!title.trim() || isCommitting || stagedFiles.length === 0}
          >
            {isCommitting ? 'Committing...' : `Commit (${stagedFiles.length})`}
          </button>
        </div>
      </div>

      <style>{commitDialogStyles}</style>
    </div>
  );
}

const commitDialogStyles = `
  .commit-dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(13, 14, 20, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal, 400);
  }

  .commit-dialog {
    width: 560px;
    background: var(--surface-overlay, #1A1B26);
    border: 1px solid var(--border-default, #292E44);
    border-radius: var(--radius-lg, 10px);
    box-shadow: var(--shadow-xl, 0 24px 64px #000000A0);
    padding: var(--space-6, 24px);
    display: flex;
    flex-direction: column;
    gap: var(--space-4, 16px);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    animation: commit-dialog-in var(--duration-normal, 200ms) var(--ease-out, ease) both;
  }

  @keyframes commit-dialog-in {
    from { opacity: 0; transform: scale(0.96); }
    to   { opacity: 1; transform: scale(1); }
  }

  .commit-dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .commit-dialog-title {
    font-size: var(--text-base, 13px);
    font-weight: var(--weight-semibold, 600);
    color: var(--text-primary, #E2E4F0);
    margin: 0;
  }

  .commit-dialog-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: none;
    border: none;
    color: var(--text-tertiary, #5C6080);
    cursor: pointer;
    border-radius: var(--radius-sm, 3px);
    transition: color var(--duration-fast, 150ms) ease,
                background var(--duration-fast, 150ms) ease;
  }

  .commit-dialog-close:hover {
    color: var(--text-primary, #E2E4F0);
    background: var(--state-hover, #FFFFFF0A);
  }

  .commit-dialog-summary {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-2, 8px) var(--space-3, 12px);
    background: var(--accent-primary-muted, #00C9A714);
    border-left: 2px solid var(--border-accent, #00C9A7);
    border-radius: var(--radius-sm, 3px);
    font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
    font-size: var(--text-xs, 11px);
    color: var(--text-secondary, #9DA3BE);
  }

  .commit-dialog-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
  }

  .commit-dialog-label {
    font-size: var(--text-xs, 11px);
    font-weight: var(--weight-medium, 500);
    color: var(--text-tertiary, #5C6080);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide, 0.05em);
  }

  .commit-dialog-input {
    width: 100%;
    padding: var(--space-2, 8px) var(--space-3, 12px);
    background: var(--surface-float, #222435);
    border: 1px solid var(--border-default, #292E44);
    border-radius: var(--radius-md, 6px);
    font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
    font-size: var(--text-sm, 12px);
    color: var(--text-primary, #E2E4F0);
    outline: none;
    box-sizing: border-box;
    transition: border-color var(--duration-fast, 150ms) ease;
  }

  .commit-dialog-input:focus {
    border-color: var(--border-accent, #00C9A7);
  }

  .commit-dialog-input::placeholder {
    color: var(--text-tertiary, #5C6080);
  }

  .commit-dialog-char-count {
    font-size: var(--text-xs, 11px);
    color: var(--text-tertiary, #5C6080);
    text-align: right;
    font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
  }

  .commit-dialog-char-count.warning {
    color: var(--semantic-error, #F7678E);
  }

  .commit-dialog-textarea {
    width: 100%;
    min-height: 100px;
    padding: var(--space-2, 8px) var(--space-3, 12px);
    background: var(--surface-float, #222435);
    border: 1px solid var(--border-default, #292E44);
    border-radius: var(--radius-md, 6px);
    font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
    font-size: var(--text-xs, 11px);
    color: var(--text-primary, #E2E4F0);
    outline: none;
    resize: vertical;
    box-sizing: border-box;
    line-height: var(--leading-normal, 1.5);
    transition: border-color var(--duration-fast, 150ms) ease;
  }

  .commit-dialog-textarea:focus {
    border-color: var(--border-accent, #00C9A7);
  }

  .commit-dialog-textarea::placeholder {
    color: var(--text-tertiary, #5C6080);
  }

  .commit-dialog-options {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .commit-dialog-checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    font-size: var(--text-xs, 11px);
    color: var(--text-secondary, #9DA3BE);
    cursor: pointer;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .commit-dialog-checkbox-label input[type="checkbox"] {
    accent-color: var(--accent-primary, #00C9A7);
  }

  .commit-dialog-generate-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px var(--space-3, 12px);
    background: transparent;
    border: 1px solid var(--border-accent, #00C9A7);
    border-radius: var(--radius-md, 6px);
    color: var(--text-accent, #00C9A7);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    font-size: var(--text-xs, 11px);
    cursor: pointer;
    transition: background var(--duration-fast, 150ms) ease,
                color var(--duration-fast, 150ms) ease;
  }

  .commit-dialog-generate-btn:hover:not(:disabled) {
    background: var(--accent-primary, #00C9A7);
    color: var(--text-inverse, #0D0E14);
  }

  .commit-dialog-generate-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .commit-dialog-generate-btn .spinning {
    animation: spin 1s linear infinite;
  }

  .commit-dialog-confidence {
    font-size: var(--text-xs, 11px);
    font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
    padding: 6px var(--space-2, 8px);
    border-radius: var(--radius-sm, 3px);
  }

  .commit-dialog-confidence.confidence-high {
    color: var(--semantic-success, #3DD68C);
    background: rgba(61, 214, 140, 0.08);
  }

  .commit-dialog-confidence.confidence-medium {
    color: var(--semantic-warning, #F7A84A);
    background: rgba(247, 168, 74, 0.08);
  }

  .commit-dialog-confidence.confidence-low {
    color: var(--text-tertiary, #5C6080);
    background: var(--surface-float, #222435);
  }

  .commit-dialog-error {
    color: var(--semantic-error, #F7678E);
    font-size: var(--text-xs, 11px);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .commit-dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2, 8px);
    padding-top: var(--space-4, 16px);
    border-top: 1px solid var(--border-subtle, #1E2030);
  }

  .commit-dialog-cancel {
    height: 32px;
    padding: 0 var(--space-4, 16px);
    background: transparent;
    border: 1px solid var(--border-default, #292E44);
    border-radius: var(--radius-md, 6px);
    color: var(--text-secondary, #9DA3BE);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    font-size: var(--text-sm, 12px);
    font-weight: var(--weight-semibold, 600);
    cursor: pointer;
    transition: border-color var(--duration-fast, 150ms) ease,
                color var(--duration-fast, 150ms) ease,
                background var(--duration-fast, 150ms) ease;
  }

  .commit-dialog-cancel:hover:not(:disabled) {
    background: var(--state-hover, #FFFFFF0A);
    border-color: var(--border-strong, #3D4163);
    color: var(--text-primary, #E2E4F0);
  }

  .commit-dialog-commit {
    height: 32px;
    padding: 0 var(--space-6, 24px);
    background: var(--accent-primary, #00C9A7);
    border: none;
    border-radius: var(--radius-md, 6px);
    color: var(--text-inverse, #0D0E14);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    font-size: var(--text-sm, 12px);
    font-weight: var(--weight-semibold, 600);
    cursor: pointer;
    transition: background var(--duration-fast, 150ms) ease;
  }

  .commit-dialog-commit:hover:not(:disabled) {
    background: var(--accent-primary-dim, #009E84);
  }

  .commit-dialog-commit:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
