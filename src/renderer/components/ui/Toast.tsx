/**
 * Toast — V2 design, unconditional.
 *
 * 4 severities, severity rail, icon plate, optional body + action slot,
 * pause-on-hover, .anim-toast-enter.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

export type ToastType = 'success' | 'info' | 'warning' | 'error';
/** V2 alias — same values, explicit name for v2 code paths */
export type ToastSeverity = ToastType;

export interface ToastAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'ghost';
}

export interface ToastData {
  id:        string;
  /** Used by legacy callers and as fallback title in v2 */
  message:   string;
  type:      ToastType;
  duration?: number;  /* ms; undefined = persistent (error is always persistent) */
  /** V2: optional explicit title (if absent, message is used as title) */
  title?:    string;
  /** V2: optional body below title */
  body?:     string;
  /** V2: optional action button(s) */
  actions?:  ToastAction[];
  /** V2: render message/body in mono font */
  mono?:     boolean;
}

interface ToastProps {
  toast:     ToastData;
  onDismiss: (id: string) => void;
}

// ─── V2 severity config ────────────────────────────────────────────────────────

interface V2SeverityConfig {
  fg:       string;
  bg:       string;
  bd:       string;
  ariaRole: string;
  icon:     React.ReactNode;
}

function makeV2Icon(path: React.ReactNode, color: string) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
}

const V2_SEVERITY_CONFIG: Record<ToastSeverity, V2SeverityConfig> = {
  success: {
    fg:       'var(--v2-success)',
    bg:       'rgba(61,214,140,0.10)',
    bd:       'rgba(61,214,140,0.22)',
    ariaRole: 'status',
    icon:     makeV2Icon(<><circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" /></>, 'var(--v2-success)'),
  },
  info: {
    fg:       'var(--v2-info)',
    bg:       'rgba(124,143,255,0.10)',
    bd:       'rgba(124,143,255,0.22)',
    ariaRole: 'status',
    icon:     makeV2Icon(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>, 'var(--v2-info)'),
  },
  warning: {
    fg:       'var(--v2-warning)',
    bg:       'rgba(247,168,74,0.10)',
    bd:       'rgba(247,168,74,0.22)',
    ariaRole: 'alert',
    icon:     makeV2Icon(<><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>, 'var(--v2-warning)'),
  },
  error: {
    fg:       'var(--v2-error)',
    bg:       'rgba(247,103,142,0.10)',
    bd:       'rgba(247,103,142,0.22)',
    ariaRole: 'alert',
    icon:     makeV2Icon(<><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></>, 'var(--v2-error)'),
  },
};

// V2 auto-dismiss: 4000ms for info/success/warning; error = never (undefined)
export function v2DefaultDuration(type: ToastSeverity): number | undefined {
  return type === 'error' ? undefined : 4000;
}

function V2Toast({ toast, onDismiss }: ToastProps) {
  const cfg     = V2_SEVERITY_CONFIG[toast.type];
  const isError = toast.type === 'error';

  // Error severity never auto-dismisses
  const duration = isError ? undefined : (toast.duration ?? v2DefaultDuration(toast.type));

  const [exiting,  setExiting]  = useState(false);
  const [hovered,  setHovered]  = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 240);
  }, [onDismiss, toast.id]);

  // Auto-dismiss with hover pause
  useEffect(() => {
    if (!duration || hovered || exiting) return;
    timerRef.current = setTimeout(dismiss, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, hovered, dismiss, exiting]);

  const title = toast.title ?? toast.message;
  const body  = toast.body;

  return (
    <div
      role={cfg.ariaRole}
      aria-live={toast.type === 'error' || toast.type === 'warning' ? 'assertive' : 'polite'}
      className={exiting ? '' : 'anim-toast-enter'}
      style={{
        width:           380,
        background:      'var(--v2-surface-overlay)',
        borderRadius:    'var(--radius-md)',
        boxShadow:       'var(--shadow-lg)',
        border:          '1px solid var(--v2-border-strong)',
        padding:         '12px 12px 12px 12px',
        display:         'grid',
        gridTemplateColumns: '28px 1fr auto',
        gap:             12,
        alignItems:      'flex-start',
        position:        'relative',
        overflow:        'hidden',
        opacity:         exiting ? 0 : 1,
        transform:       exiting ? 'translateX(20px)' : 'translateX(0)',
        transition:      exiting ? 'opacity 0.24s ease, transform 0.24s ease' : 'none',
        cursor:          'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Severity rail */}
      <div style={{
        position:   'absolute',
        left:       0,
        top:        0,
        bottom:     0,
        width:      3,
        background: cfg.fg,
      }} />

      {/* Icon plate */}
      <div style={{
        width:        24,
        height:       24,
        borderRadius: 'var(--radius-sm)',
        background:   cfg.bg,
        color:        cfg.fg,
        display:      'grid',
        placeItems:   'center',
        border:       `1px solid ${cfg.bd}`,
        marginLeft:   6,
        flexShrink:   0,
      }}>
        {cfg.icon}
      </div>

      {/* Body */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          color:      'var(--v2-text-primary)',
          fontWeight: 600,
          fontSize:   'var(--text-sm)',
          display:    'flex',
          alignItems: 'center',
          gap:        6,
          fontFamily: toast.mono ? 'var(--font-mono)' : 'inherit',
        }}>
          {title}
        </div>
        {body && (
          <div style={{
            color:      'var(--v2-text-secondary)',
            fontSize:   'var(--text-xs)',
            marginTop:  2,
            lineHeight: 1.55,
            fontFamily: toast.mono ? 'var(--font-mono)' : 'inherit',
            overflow:   'hidden',
            textOverflow: 'ellipsis',
          }}>
            {body}
          </div>
        )}
        {toast.actions && toast.actions.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            {toast.actions.map((action, i) => (
              <button
                key={i}
                onClick={action.onClick}
                style={{
                  padding:      '3px 10px',
                  fontSize:     10,
                  background:   action.variant === 'primary' ? 'var(--v2-accent)' : 'var(--v2-surface-mid)',
                  border:       `1px solid ${action.variant === 'primary' ? 'transparent' : 'var(--v2-border-default)'}`,
                  borderRadius: 'var(--radius-sm)',
                  color:        action.variant === 'primary' ? '#051A16' : 'var(--v2-text-secondary)',
                  fontFamily:   'inherit',
                  cursor:       'pointer',
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dismiss (close) button — always visible in v2, not hover-gated */}
      <button
        onClick={dismiss}
        aria-label="Dismiss notification"
        style={{
          padding:      3,
          color:        'var(--v2-text-tertiary)',
          background:   'transparent',
          border:       'none',
          cursor:       'pointer',
          borderRadius: 'var(--radius-sm)',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--v2-text-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--v2-text-tertiary)')}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// ─── Public export ─────────────────────────────────────────────────────────────

export function Toast({ toast, onDismiss }: ToastProps) {
  return <V2Toast toast={toast} onDismiss={onDismiss} />;
}
