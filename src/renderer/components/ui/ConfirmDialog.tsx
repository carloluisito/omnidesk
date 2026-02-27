/**
 * ConfirmDialog — Redesigned to match Obsidian spec §6.12.
 *
 * Width: 360px. Focus starts on Cancel (safe default).
 * Destructive variant: semantic-error bg on confirm button.
 * Cancel: ghost button (left). Confirm: right.
 * All existing props preserved.
 */

import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDangerous = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      cancelRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onCancel}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 'var(--z-modal)' as any,
        animation: 'dialog-backdrop-in var(--duration-fast) var(--ease-out)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        style={{
          width: 'var(--dialog-width-sm)',
          maxWidth: 'calc(100vw - 48px)',
          background: 'var(--surface-overlay)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
          animation: 'dialog-enter var(--duration-fast) var(--ease-out)',
        }}
      >
        {/* Content area */}
        <div style={{ padding: 'var(--space-5)' }}>
          {/* Icon + Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-md)',
                background: isDangerous ? 'var(--semantic-error-muted)' : 'var(--accent-primary-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {isDangerous ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--semantic-error)" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
            </div>
            <h3
              id="confirm-title"
              style={{
                margin: 0,
                fontSize: 'var(--text-md)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-ui)',
              }}
            >
              {title}
            </h3>
          </div>

          <p
            id="confirm-message"
            style={{
              margin: 0,
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              lineHeight: 'var(--leading-relaxed)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            {message}
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-5)',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--surface-raised)',
          }}
        >
          <button
            ref={cancelRef}
            onClick={onCancel}
            style={{
              padding: '7px var(--space-4)',
              background: 'none',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-ui)',
              cursor: 'pointer',
              transition: 'all var(--duration-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--state-hover)';
              e.currentTarget.style.borderColor = 'var(--border-strong)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.borderColor = 'var(--border-default)';
            }}
          >
            {cancelLabel}
          </button>

          <button
            onClick={onConfirm}
            style={{
              padding: '7px var(--space-4)',
              background: isDangerous ? 'var(--semantic-error)' : 'var(--accent-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'white',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-semibold)',
              fontFamily: 'var(--font-ui)',
              cursor: 'pointer',
              transition: 'opacity var(--duration-fast)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes dialog-backdrop-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes dialog-enter {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
