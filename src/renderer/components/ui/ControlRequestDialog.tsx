/**
 * ControlRequestDialog — Alert dialog shown to the host when an observer
 * requests control of their session.
 *
 * - role="alertdialog" for urgency (screen readers announce immediately)
 * - Auto-focuses "Grant" button (spec: auto-focus on Grant)
 * - Auto-dismisses after 30s with implicit deny
 * - Keyboard: Escape → deny
 */
import { useEffect, useRef, useState } from 'react';

interface ControlRequestDialogProps {
  isOpen:       boolean;
  observerName: string;
  onGrant:      () => void;
  onDeny:       () => void;
}

const AUTO_DISMISS_MS = 30_000;

export function ControlRequestDialog({
  isOpen,
  observerName,
  onGrant,
  onDeny,
}: ControlRequestDialogProps) {
  const grantRef                    = useRef<HTMLButtonElement>(null);
  const [remaining, setRemaining]   = useState(AUTO_DISMISS_MS / 1000);

  // Auto-focus Grant on open
  useEffect(() => {
    if (isOpen) {
      setRemaining(AUTO_DISMISS_MS / 1000);
      grantRef.current?.focus();
    }
  }, [isOpen]);

  // Auto-dismiss countdown
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onDeny();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, onDeny]);

  // Escape → deny
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onDeny();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onDeny]);

  if (!isOpen) return null;

  // Progress bar: fills from right to left over 30s
  const progressPct = (remaining / (AUTO_DISMISS_MS / 1000)) * 100;

  return (
    <div
      role="presentation"
      onClick={onDeny}
      style={{
        position:        'fixed',
        inset:           0,
        background:      'rgba(13, 14, 20, 0.72)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        zIndex:          'var(--z-modal)' as any,
        animation:       'dialog-backdrop-in var(--duration-fast) var(--ease-out)',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ctrl-req-title"
        aria-describedby="ctrl-req-desc"
        onClick={(e) => e.stopPropagation()}
        data-testid="control-request-dialog"
        style={{
          width:           '360px',
          maxWidth:        'calc(100vw - 48px)',
          background:      'var(--surface-overlay)',
          border:          '1px solid var(--border-default)',
          borderRadius:    'var(--radius-lg)',
          boxShadow:       '0 0 0 1px rgba(0,201,167,0.12), var(--shadow-xl)',
          overflow:        'hidden',
          animation:       'dialog-enter var(--duration-fast) var(--ease-out)',
        }}
      >
        {/* Auto-dismiss progress bar (top edge) */}
        <div
          style={{
            height:          '2px',
            background:      'var(--border-subtle)',
            position:        'relative',
            overflow:        'hidden',
          }}
        >
          <div
            style={{
              position:        'absolute',
              inset:           0,
              background:      '#00C9A7',
              width:           `${progressPct}%`,
              transition:      'width 1s linear',
              transformOrigin: 'left',
            }}
          />
        </div>

        {/* Header */}
        <div style={{ padding: 'var(--space-5) var(--space-5) 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            {/* Live signal icon */}
            <div
              style={{
                width:           32,
                height:          32,
                borderRadius:    'var(--radius-md)',
                background:      'rgba(0,201,167,0.12)',
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                flexShrink:      0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                {/* Keyboard/control icon */}
                <rect x="1" y="4" width="14" height="9" rx="1.5" stroke="#00C9A7" strokeWidth="1.5" fill="none" />
                <rect x="3.5" y="6.5" width="2" height="2" rx="0.5" fill="#00C9A7" />
                <rect x="7" y="6.5" width="2" height="2" rx="0.5" fill="#00C9A7" />
                <rect x="10.5" y="6.5" width="2" height="2" rx="0.5" fill="#00C9A7" />
                <rect x="5" y="9.5" width="6" height="1.5" rx="0.75" fill="#00C9A7" />
              </svg>
            </div>

            <h3
              id="ctrl-req-title"
              style={{
                margin:      0,
                fontSize:    'var(--text-md)',
                fontWeight:  'var(--weight-semibold)' as any,
                color:       'var(--text-primary)',
                fontFamily:  'var(--font-ui)',
              }}
            >
              Control Request
            </h3>
          </div>

          <p
            id="ctrl-req-desc"
            style={{
              margin:      '0 0 var(--space-1) 0',
              fontSize:    'var(--text-sm)',
              color:       'var(--text-secondary)',
              lineHeight:  'var(--leading-relaxed)',
              fontFamily:  'var(--font-ui)',
            }}
          >
            <span
              style={{
                color:      '#00C9A7',
                fontFamily: '"JetBrains Mono", monospace',
                fontWeight: 600,
              }}
            >
              {observerName}
            </span>{' '}
            is requesting control of your session.
          </p>

          <p
            style={{
              margin:      '0 0 var(--space-5) 0',
              fontSize:    'var(--text-xs)',
              color:       'var(--text-tertiary)',
              fontFamily:  'var(--font-ui)',
            }}
          >
            Auto-denying in {remaining}s
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'flex-end',
            gap:             'var(--space-2)',
            padding:         'var(--space-3) var(--space-5)',
            borderTop:       '1px solid var(--border-subtle)',
            background:      'var(--surface-raised)',
          }}
        >
          <button
            onClick={onDeny}
            style={{
              padding:      '7px var(--space-4)',
              background:   'none',
              border:       '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color:        'var(--text-secondary)',
              fontSize:     'var(--text-sm)',
              fontFamily:   'var(--font-ui)',
              cursor:       'pointer',
              transition:   'all var(--duration-fast)',
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
            Deny
          </button>

          <button
            ref={grantRef}
            onClick={onGrant}
            style={{
              padding:      '7px var(--space-4)',
              background:   '#00C9A7',
              border:       'none',
              borderRadius: 'var(--radius-md)',
              color:        '#0D0E14',
              fontSize:     'var(--text-sm)',
              fontWeight:   'var(--weight-semibold)' as any,
              fontFamily:   'var(--font-ui)',
              cursor:       'pointer',
              transition:   'opacity var(--duration-fast)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            Grant Control
          </button>
        </div>
      </div>

      <style>{`
        @keyframes dialog-backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes dialog-enter {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>
  );
}
