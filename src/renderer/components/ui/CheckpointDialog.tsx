/**
 * CheckpointDialog - Modal dialog for creating checkpoints
 */

import React, { useState, useEffect, useRef } from 'react';

interface CheckpointDialogProps {
  isOpen: boolean;
  sessionId: string | null;
  sessionName?: string;
  onConfirm: (name: string, description?: string, tags?: string[]) => void;
  onCancel: () => void;
}

export function CheckpointDialog({
  isOpen,
  sessionId,
  sessionName,
  onConfirm,
  onCancel,
}: CheckpointDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [conversationPreview, setConversationPreview] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Load conversation preview when dialog opens
  useEffect(() => {
    if (isOpen && sessionId) {
      loadConversationPreview();
      // Auto-focus name input
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    } else {
      // Reset form when closed
      setName('');
      setDescription('');
      setTagsInput('');
      setConversationPreview('');
    }
  }, [isOpen, sessionId]);

  // Load last 5 lines of conversation
  const loadConversationPreview = async () => {
    if (!sessionId) return;

    setIsLoadingPreview(true);
    try {
      const fullHistory = await window.electronAPI.getHistory(sessionId);
      const lines = fullHistory.split('\n').filter(line => line.trim().length > 0);
      const recentLines = lines.slice(-5);
      setConversationPreview(recentLines.join('\n'));
    } catch (err) {
      console.error('Failed to load conversation preview:', err);
      setConversationPreview('[Preview unavailable]');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Checkpoint name is required');
      return;
    }

    // Parse tags (comma-separated)
    const tags = tagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    onConfirm(
      name.trim(),
      description.trim() || undefined,
      tags.length > 0 ? tags : undefined
    );
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isNameValid = name.trim().length > 0;
  const nameCharsRemaining = 50 - name.length;
  const descCharsRemaining = 500 - description.length;

  return (
    <div className="ckpt-overlay">
      <div
        className="ckpt-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ckpt-header">
          <h2 className="ckpt-title">Create Checkpoint</h2>
          {sessionName && (
            <div className="ckpt-session-name">
              Session: {sessionName}
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="ckpt-form">
          {/* Name field */}
          <div className="ckpt-field">
            <div className="ckpt-field-header">
              <label htmlFor="checkpoint-name" className="ckpt-label">
                Name <span className="ckpt-required">*</span>
              </label>
              <span className="ckpt-char-count" style={{
                color: nameCharsRemaining < 0
                  ? 'var(--semantic-error)'
                  : nameCharsRemaining < 10
                  ? 'var(--semantic-warning)'
                  : 'var(--text-tertiary)',
              }}>
                {name.length}/50
              </span>
            </div>
            <input
              ref={nameInputRef}
              id="checkpoint-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.substring(0, 50))}
              maxLength={50}
              placeholder="e.g., Before API refactor"
              className="ckpt-input"
              autoComplete="off"
            />
          </div>

          {/* Description field */}
          <div className="ckpt-field">
            <div className="ckpt-field-header">
              <label htmlFor="checkpoint-description" className="ckpt-label">
                Description <span className="ckpt-optional">(optional)</span>
              </label>
              <span className="ckpt-char-count" style={{
                color: descCharsRemaining < 0
                  ? 'var(--semantic-error)'
                  : descCharsRemaining < 50
                  ? 'var(--semantic-warning)'
                  : 'var(--text-tertiary)',
              }}>
                {description.length}/500
              </span>
            </div>
            <textarea
              id="checkpoint-description"
              value={description}
              onChange={(e) => setDescription(e.target.value.substring(0, 500))}
              maxLength={500}
              placeholder="Add notes about this checkpoint..."
              rows={3}
              className="ckpt-textarea"
            />
          </div>

          {/* Tags field */}
          <div className="ckpt-field">
            <div className="ckpt-field-header">
              <label htmlFor="checkpoint-tags" className="ckpt-label">
                Tags <span className="ckpt-optional">(optional)</span>
              </label>
              <span className="ckpt-hint">Comma-separated</span>
            </div>
            <input
              id="checkpoint-tags"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="experiment, bug-fix, working"
              className="ckpt-input"
              autoComplete="off"
            />
            {tagsInput.trim() && (
              <div className="ckpt-tags-preview">
                {tagsInput.split(',').map((tag, i) => {
                  const trimmedTag = tag.trim();
                  if (!trimmedTag) return null;
                  return (
                    <span key={i} className="ckpt-tag">
                      {trimmedTag}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Conversation preview */}
          <div className="ckpt-field">
            <label className="ckpt-label">Recent Conversation</label>
            <div className="ckpt-preview">
              {isLoadingPreview ? (
                <div className="ckpt-preview-loading">Loading preview...</div>
              ) : conversationPreview ? (
                <pre className="ckpt-preview-text">
                  {conversationPreview}
                </pre>
              ) : (
                <div className="ckpt-preview-empty">No preview available</div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="ckpt-actions">
            <button
              type="button"
              onClick={onCancel}
              className="ckpt-btn-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isNameValid || nameCharsRemaining < 0 || descCharsRemaining < 0}
              className="ckpt-btn-confirm"
            >
              Create Checkpoint
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .ckpt-overlay {
          position: fixed;
          inset: 0;
          background: rgba(13, 14, 20, 0.8);
          backdrop-filter: blur(4px);
          z-index: var(--z-modal, 400);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-4, 16px);
        }

        .ckpt-dialog {
          background: var(--surface-overlay, #1A1B26);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-lg, 10px);
          box-shadow: var(--shadow-xl, 0 24px 64px #000000A0);
          width: 100%;
          max-width: 440px;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          animation: ckpt-fade-in var(--duration-normal, 200ms) var(--ease-out, ease) both;
        }

        @keyframes ckpt-fade-in {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }

        .ckpt-header {
          padding: var(--space-4, 16px) var(--space-6, 24px);
          border-bottom: 1px solid var(--border-subtle, #1E2030);
        }

        .ckpt-title {
          font-size: var(--text-lg, 16px);
          font-weight: var(--weight-semibold, 600);
          color: var(--text-primary, #E2E4F0);
          margin: 0;
        }

        .ckpt-session-name {
          font-size: var(--text-xs, 11px);
          color: var(--text-tertiary, #5C6080);
          margin-top: var(--space-1, 4px);
        }

        .ckpt-form {
          padding: var(--space-6, 24px);
          display: flex;
          flex-direction: column;
          gap: var(--space-4, 16px);
        }

        .ckpt-field {
          display: flex;
          flex-direction: column;
          gap: var(--space-2, 8px);
        }

        .ckpt-field-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .ckpt-label {
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-medium, 500);
          color: var(--text-secondary, #9DA3BE);
        }

        .ckpt-required {
          color: var(--semantic-error, #F7678E);
        }

        .ckpt-optional {
          font-size: var(--text-xs, 11px);
          color: var(--text-tertiary, #5C6080);
        }

        .ckpt-char-count {
          font-size: var(--text-xs, 11px);
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
        }

        .ckpt-hint {
          font-size: var(--text-xs, 11px);
          color: var(--text-tertiary, #5C6080);
        }

        .ckpt-input, .ckpt-textarea {
          width: 100%;
          padding: var(--space-2, 8px) var(--space-3, 12px);
          background: var(--surface-float, #222435);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-md, 6px);
          color: var(--text-secondary, #9DA3BE);
          font-size: var(--text-sm, 12px);
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          outline: none;
          transition: border-color var(--duration-fast, 150ms) var(--ease-inout, ease);
          box-sizing: border-box;
        }

        .ckpt-input::placeholder, .ckpt-textarea::placeholder {
          color: var(--text-tertiary, #5C6080);
        }

        .ckpt-input:focus, .ckpt-textarea:focus {
          border-color: var(--border-accent, #00C9A7);
        }

        .ckpt-textarea {
          resize: none;
          line-height: var(--leading-normal, 1.5);
        }

        .ckpt-tags-preview {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-1, 4px);
        }

        .ckpt-tag {
          display: inline-block;
          padding: 2px var(--space-2, 8px);
          background: var(--accent-primary-muted, #00C9A714);
          color: var(--text-accent, #00C9A7);
          border-radius: var(--radius-sm, 3px);
          font-size: var(--text-xs, 11px);
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
        }

        .ckpt-preview {
          background: var(--surface-float, #222435);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-md, 6px);
          padding: var(--space-3, 12px);
          max-height: 128px;
          overflow-y: auto;
        }

        .ckpt-preview-loading, .ckpt-preview-empty {
          font-size: var(--text-xs, 11px);
          color: var(--text-tertiary, #5C6080);
          text-align: center;
          padding: var(--space-2, 8px) 0;
        }

        .ckpt-preview-text {
          font-size: var(--text-xs, 11px);
          color: var(--text-tertiary, #5C6080);
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          white-space: pre-wrap;
          word-break: break-words;
          margin: 0;
        }

        .ckpt-actions {
          display: flex;
          gap: var(--space-3, 12px);
          padding-top: var(--space-2, 8px);
        }

        .ckpt-btn-cancel {
          flex: 1;
          padding: var(--space-2, 8px) var(--space-4, 16px);
          background: var(--surface-float, #222435);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-md, 6px);
          color: var(--text-secondary, #9DA3BE);
          font-size: var(--text-sm, 12px);
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          cursor: pointer;
          transition: background-color var(--duration-fast, 150ms) var(--ease-inout, ease),
                      border-color var(--duration-fast, 150ms) var(--ease-inout, ease);
        }

        .ckpt-btn-cancel:hover {
          background: var(--state-hover, #FFFFFF0A);
          border-color: var(--border-strong, #3D4163);
          color: var(--text-primary, #E2E4F0);
        }

        .ckpt-btn-confirm {
          flex: 1;
          padding: var(--space-2, 8px) var(--space-4, 16px);
          background: var(--accent-primary, #00C9A7);
          border: none;
          border-radius: var(--radius-md, 6px);
          color: var(--text-inverse, #0D0E14);
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-semibold, 600);
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          cursor: pointer;
          transition: background-color var(--duration-fast, 150ms) var(--ease-inout, ease);
        }

        .ckpt-btn-confirm:hover:not(:disabled) {
          background: var(--accent-primary-dim, #009E84);
        }

        .ckpt-btn-confirm:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .ckpt-btn-confirm:focus-visible,
        .ckpt-btn-cancel:focus-visible {
          outline: 2px solid var(--state-focus, #00C9A740);
          outline-offset: 2px;
        }

        @media (prefers-reduced-motion: reduce) {
          .ckpt-dialog { animation: none; }
        }
      `}</style>
    </div>
  );
}
