/**
 * ConfirmDialog — V2 design, unconditional.
 *
 * 4 severities, hold-to-confirm for destructive variants,
 * confirm.shake on plain Enter, color rail, .anim-dialog-enter.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Shared types ──────────────────────────────────────────────────────────────

export type ConfirmSeverity = 'info' | 'warning' | 'destructive' | 'final-destructive';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  /** Legacy compat alias — mapped to body in v2 */
  message?: string;
  /** V2 body text (preferred over message when both present) */
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Legacy prop — maps to severity='destructive' in v2 */
  isDangerous?: boolean;
  /** V2 severity. Overrides isDangerous when set. */
  severity?: ConfirmSeverity;
  /** Optional list of affected items shown in a monospace strip */
  items?: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

// ─── V2 severity config ────────────────────────────────────────────────────────

interface SeverityConfig {
  fg: string;
  bg: string;
  bd: string;
  topBar: boolean;
  glow: string;
  icon: 'info' | 'warning';
  primaryBg: string;
}

const SEVERITY_CONFIG: Record<ConfirmSeverity, SeverityConfig> = {
  info: {
    fg:        'var(--v2-accent)',
    bg:        'rgba(0,201,167,0.12)',
    bd:        'rgba(0,201,167,0.18)',
    topBar:    false,
    glow:      'none',
    icon:      'info',
    primaryBg: 'var(--v2-accent)',
  },
  warning: {
    fg:        'var(--v2-warning)',
    bg:        'rgba(247,168,74,0.12)',
    bd:        'rgba(247,168,74,0.20)',
    topBar:    false,
    glow:      'none',
    icon:      'warning',
    primaryBg: 'var(--v2-accent)',
  },
  destructive: {
    fg:        'var(--v2-error)',
    bg:        'rgba(247,103,142,0.12)',
    bd:        'rgba(247,103,142,0.22)',
    topBar:    true,
    glow:      '0 0 0 1px rgba(247,103,142,0.3)',
    icon:      'warning',
    primaryBg: 'var(--v2-error)',
  },
  'final-destructive': {
    fg:        'var(--v2-error)',
    bg:        'rgba(247,103,142,0.16)',
    bd:        'rgba(247,103,142,0.30)',
    topBar:    true,
    glow:      '0 0 0 1px rgba(247,103,142,0.5), 0 0 16px rgba(247,103,142,0.2)',
    icon:      'warning',
    primaryBg: 'var(--v2-error)',
  },
};

// Detect the "Mod" key: Cmd on macOS, Ctrl on Windows/Linux.
// Mirrors the pattern used in Terminal.tsx for newline insertion.
const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
const MOD_KEY: 'metaKey' | 'ctrlKey' = IS_MAC ? 'metaKey' : 'ctrlKey';
const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl';

function InfoIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function WarningIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function KeyboardIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" strokeLinecap="round" />
    </svg>
  );
}

// ─── V2 ConfirmDialog ─────────────────────────────────────────────────────────

function V2ConfirmDialog({
  isOpen,
  title,
  message,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDangerous = false,
  severity: severityProp,
  items,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Resolve severity: explicit prop wins; fallback from isDangerous
  const severity: ConfirmSeverity = severityProp ?? (isDangerous ? 'destructive' : 'info');
  const cfg = SEVERITY_CONFIG[severity];
  const isDestructiveVariant = severity === 'destructive' || severity === 'final-destructive';
  const displayBody = body ?? message ?? '';

  const dialogRef    = useRef<HTMLDivElement>(null);
  const cancelRef    = useRef<HTMLButtonElement>(null);
  const confirmRef   = useRef<HTMLButtonElement>(null);
  const [shaking, setShaking] = useState(false);
  const [nudgeHint, setNudgeHint] = useState(false);

  // Focus Cancel on open
  useEffect(() => {
    if (isOpen) cancelRef.current?.focus();
  }, [isOpen]);

  const triggerShake = useCallback(() => {
    setShaking(true);
    setNudgeHint(true);
    setTimeout(() => setShaking(false), 500);
    setTimeout(() => setNudgeHint(false), 3000);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') { onCancel(); return; }

      if (e.key === 'Enter') {
        if (isDestructiveVariant) {
          if (e[MOD_KEY]) {
            // Mod+Enter = confirm
            e.preventDefault();
            onConfirm();
          } else {
            // Plain Enter = shake
            e.preventDefault();
            triggerShake();
          }
        } else {
          // Non-destructive: Enter confirms
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            onConfirm();
          }
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, isDestructiveVariant, onConfirm, onCancel, triggerShake]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onCancel}
      role="presentation"
      style={{
        position:       'fixed',
        inset:          0,
        background:     'rgba(0,0,0,0.65)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        zIndex:         'var(--z-modal)' as any,
      }}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="v2-confirm-title"
        aria-describedby="v2-confirm-message"
        className={`anim-dialog-enter${shaking ? ' anim-shake' : ''}`}
        style={{
          width:        460,
          maxWidth:     'calc(100vw - 48px)',
          background:   'var(--v2-surface-overlay)',
          borderRadius: 'var(--radius-lg)',
          boxShadow:    `var(--shadow-xl)${cfg.glow !== 'none' ? ', ' + cfg.glow : ''}`,
          border:       `1px solid ${isDestructiveVariant ? cfg.bd : 'var(--v2-border-strong)'}`,
          overflow:     'hidden',
          position:     'relative',
        }}
      >
        {/* Red top bar for destructive variants */}
        {cfg.topBar && (
          <div style={{
            position:   'absolute',
            top:        0,
            left:       0,
            right:      0,
            height:     2,
            background: 'var(--v2-error)',
          }} />
        )}

        {/* Content: icon plate + text */}
        <div style={{
          padding:             '20px 22px 16px',
          display:             'grid',
          gridTemplateColumns: '36px 1fr',
          gap:                 14,
          marginTop:           cfg.topBar ? 2 : 0,
        }}>
          {/* Icon plate */}
          <div style={{
            width:        36,
            height:       36,
            borderRadius: 'var(--radius-md)',
            background:   cfg.bg,
            color:        cfg.fg,
            display:      'grid',
            placeItems:   'center',
            border:       `1px solid ${cfg.bd}`,
            flexShrink:   0,
          }}>
            {cfg.icon === 'info'
              ? <InfoIcon color={cfg.fg} />
              : <WarningIcon color={cfg.fg} />
            }
          </div>

          {/* Title + body + items + hint */}
          <div>
            <div
              id="v2-confirm-title"
              style={{
                color:        'var(--v2-text-primary)',
                fontWeight:   600,
                fontSize:     'var(--text-md)',
                marginBottom: 6,
              }}
            >
              {title}
            </div>
            <div
              id="v2-confirm-message"
              style={{
                color:      'var(--v2-text-secondary)',
                fontSize:   'var(--text-sm)',
                lineHeight: 1.55,
              }}
            >
              {displayBody}
            </div>

            {/* Affected items strip */}
            {items && items.length > 0 && (
              <div style={{
                marginTop:   12,
                padding:     '8px 10px',
                background:  'var(--v2-surface-mid)',
                borderRadius:'var(--radius-md)',
                fontFamily:  'var(--font-mono)',
                fontSize:    11,
                color:       'var(--v2-text-secondary)',
                display:     'flex',
                flexDirection: 'column',
                gap:         2,
              }}>
                {items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: isDestructiveVariant ? 'var(--v2-error)' : 'var(--v2-text-tertiary)' }}>·</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Hold-to-confirm hint (always shown for destructive; nudge shown on wrong key) */}
            {isDestructiveVariant && (
              <div style={{
                marginTop:  12,
                display:    'flex',
                alignItems: 'center',
                gap:        8,
                fontSize:   'var(--text-xs)',
                color:      nudgeHint ? cfg.fg : 'var(--v2-text-tertiary)',
                transition: 'color 0.2s ease',
              }}>
                <KeyboardIcon color={nudgeHint ? cfg.fg : 'var(--v2-text-tertiary)'} />
                <span>
                  Hold <kbd style={{
                    fontFamily:   'var(--font-mono)',
                    fontSize:     10,
                    background:   'var(--v2-surface-mid)',
                    border:       '1px solid var(--v2-border-default)',
                    borderRadius: 3,
                    padding:      '1px 4px',
                  }}>{MOD_LABEL}</kbd>
                  {' + '}
                  <kbd style={{
                    fontFamily:   'var(--font-mono)',
                    fontSize:     10,
                    background:   'var(--v2-surface-mid)',
                    border:       '1px solid var(--v2-border-default)',
                    borderRadius: 3,
                    padding:      '1px 4px',
                  }}>↵</kbd>
                  {nudgeHint ? ' to confirm' : ' to confirm'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding:          '12px 16px',
          background:       isDestructiveVariant ? 'rgba(247,103,142,0.04)' : 'var(--v2-surface-mid)',
          display:          'flex',
          justifyContent:   'flex-end',
          gap:              8,
          borderTop:        '1px solid var(--v2-border-subtle)',
        }}>
          {/* Cancel — ghost, left */}
          <button
            ref={cancelRef}
            onClick={onCancel}
            style={{
              padding:      '7px 16px',
              background:   'transparent',
              border:       '1px solid var(--v2-border-default)',
              borderRadius: 'var(--radius-md)',
              color:        'var(--v2-text-secondary)',
              fontSize:     'var(--text-sm)',
              fontFamily:   'var(--font-ui)',
              cursor:       'pointer',
              transition:   'all 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background    = 'var(--v2-surface-low)';
              e.currentTarget.style.borderColor   = 'var(--v2-border-strong)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background    = 'transparent';
              e.currentTarget.style.borderColor   = 'var(--v2-border-default)';
            }}
          >
            {cancelLabel}
          </button>

          {/* Primary action */}
          <button
            ref={confirmRef}
            onClick={isDestructiveVariant ? undefined : onConfirm}
            onMouseDown={isDestructiveVariant ? () => {
              // For destructive, click alone does nothing — Mod+Enter is the path.
              // Clicking the button still works as a pointer-based confirmation
              // (pointer users don't need the keyboard hold). This matches the
              // spec intent: the hold is for keyboard-only confirmation, not a
              // blocker for mouse users.
              onConfirm();
            } : undefined}
            aria-label={isDestructiveVariant
              ? `${confirmLabel} (hold ${MOD_LABEL}+Enter to confirm from keyboard)`
              : confirmLabel
            }
            style={{
              padding:      '7px 16px',
              background:   cfg.primaryBg,
              border:       'none',
              borderRadius: 'var(--radius-md)',
              color:        'white',
              fontSize:     'var(--text-sm)',
              fontWeight:   600,
              fontFamily:   'var(--font-ui)',
              cursor:       'pointer',
              transition:   'opacity 0.12s ease',
              display:      'flex',
              alignItems:   'center',
              gap:          6,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            {isDestructiveVariant && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Public export ─────────────────────────────────────────────────────────────

export function ConfirmDialog(props: ConfirmDialogProps) {
  return <V2ConfirmDialog {...props} />;
}
