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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7aa2f7" strokeWidth="2">
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
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9000;
  }

  .commit-dialog {
    width: 560px;
    background: #24283b;
    border: 1px solid #292e42;
    border-radius: 8px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .commit-dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .commit-dialog-title {
    font-size: 16px;
    font-weight: 600;
    color: #c0caf5;
    margin: 0;
    font-family: 'JetBrains Mono', monospace;
  }

  .commit-dialog-close {
    background: none;
    border: none;
    color: #565f89;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
  }

  .commit-dialog-close:hover {
    color: #c0caf5;
    background: #1a1b26;
  }

  .commit-dialog-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: rgba(122, 162, 247, 0.1);
    border-left: 3px solid #7aa2f7;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: #c0caf5;
  }

  .commit-dialog-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .commit-dialog-label {
    font-size: 12px;
    font-weight: 600;
    color: #565f89;
    font-family: 'JetBrains Mono', monospace;
  }

  .commit-dialog-input {
    width: 100%;
    padding: 10px 12px;
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: #c0caf5;
    outline: none;
    box-sizing: border-box;
  }

  .commit-dialog-input:focus {
    border-color: #7aa2f7;
  }

  .commit-dialog-input::placeholder {
    color: #565f89;
  }

  .commit-dialog-char-count {
    font-size: 11px;
    color: #565f89;
    text-align: right;
    font-family: 'JetBrains Mono', monospace;
  }

  .commit-dialog-char-count.warning {
    color: #f7768e;
  }

  .commit-dialog-textarea {
    width: 100%;
    min-height: 120px;
    padding: 10px 12px;
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: #c0caf5;
    outline: none;
    resize: vertical;
    box-sizing: border-box;
  }

  .commit-dialog-textarea:focus {
    border-color: #7aa2f7;
  }

  .commit-dialog-textarea::placeholder {
    color: #565f89;
  }

  .commit-dialog-options {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .commit-dialog-checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #c0caf5;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }

  .commit-dialog-checkbox-label input[type="checkbox"] {
    accent-color: #7aa2f7;
  }

  .commit-dialog-generate-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: transparent;
    border: 1px solid #7aa2f7;
    border-radius: 4px;
    color: #7aa2f7;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    cursor: pointer;
    transition: all 100ms ease-out;
  }

  .commit-dialog-generate-btn:hover:not(:disabled) {
    background: #7aa2f7;
    color: #1a1b26;
  }

  .commit-dialog-generate-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .commit-dialog-generate-btn .spinning {
    animation: spin 1s linear infinite;
  }

  .commit-dialog-confidence {
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    padding: 6px 10px;
    border-radius: 4px;
  }

  .commit-dialog-confidence.confidence-high {
    color: #9ece6a;
    background: rgba(158, 206, 106, 0.1);
  }

  .commit-dialog-confidence.confidence-medium {
    color: #e0af68;
    background: rgba(224, 175, 104, 0.1);
  }

  .commit-dialog-confidence.confidence-low {
    color: #565f89;
    background: rgba(86, 95, 137, 0.1);
  }

  .commit-dialog-error {
    color: #f7768e;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
  }

  .commit-dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 16px;
    border-top: 1px solid #292e42;
  }

  .commit-dialog-cancel {
    padding: 8px 16px;
    background: transparent;
    border: none;
    color: #7aa2f7;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    cursor: pointer;
  }

  .commit-dialog-cancel:hover:not(:disabled) {
    text-decoration: underline;
    color: #89b4fa;
  }

  .commit-dialog-commit {
    padding: 8px 24px;
    background: #7aa2f7;
    border: none;
    border-radius: 4px;
    color: #1a1b26;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 100ms ease-out;
  }

  .commit-dialog-commit:hover:not(:disabled) {
    background: #89b4fa;
  }

  .commit-dialog-commit:disabled {
    background: #3b4261;
    cursor: not-allowed;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
