/**
 * Toast — individual notification component.
 *
 * Types: success / info / warning / error
 * Left border color per semantic type.
 * Dismiss button on hover.
 * Slide-in / slide-out animations.
 */
import { useState, useEffect, useCallback } from 'react';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastData {
  id:         string;
  message:    string;
  type:       ToastType;
  duration?:  number;   /* ms; undefined = persistent */
}

interface ToastProps {
  toast:       ToastData;
  onDismiss:   (id: string) => void;
}

const TYPE_CONFIG: Record<ToastType, { borderColor: string; dotColor: string; icon: React.ReactNode; ariaRole: string }> = {
  success: {
    borderColor: 'var(--semantic-success)',
    dotColor:    'var(--semantic-success)',
    ariaRole:    'status',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6" stroke="var(--semantic-success)" strokeWidth="1.5" fill="none" />
        <path d="M4.5 7l2 2 3-3" stroke="var(--semantic-success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  info: {
    borderColor: 'var(--accent-primary)',
    dotColor:    'var(--accent-primary)',
    ariaRole:    'status',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6" stroke="var(--accent-primary)" strokeWidth="1.5" fill="none" />
        <line x1="7" y1="6" x2="7" y2="10" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="7" cy="4.5" r="0.75" fill="var(--accent-primary)" />
      </svg>
    ),
  },
  warning: {
    borderColor: 'var(--semantic-warning)',
    dotColor:    'var(--semantic-warning)',
    ariaRole:    'alert',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M7 1.5L12.5 11.5H1.5L7 1.5Z" stroke="var(--semantic-warning)" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
        <line x1="7" y1="6" x2="7" y2="9" stroke="var(--semantic-warning)" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="7" cy="10.5" r="0.75" fill="var(--semantic-warning)" />
      </svg>
    ),
  },
  error: {
    borderColor: 'var(--semantic-error)',
    dotColor:    'var(--semantic-error)',
    ariaRole:    'alert',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6" stroke="var(--semantic-error)" strokeWidth="1.5" fill="none" />
        <path d="M5 5l4 4M9 5l-4 4" stroke="var(--semantic-error)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const [exiting, setExiting]      = useState(false);
  const [hovered, setHovered]      = useState(false);
  const [showDismiss, setShowDismiss] = useState(false);
  const config = TYPE_CONFIG[toast.type];

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 160);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    if (!toast.duration || hovered) return;
    const timer = setTimeout(dismiss, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, dismiss, hovered]);

  return (
    <div
      role={config.ariaRole}
      aria-live={toast.type === 'error' || toast.type === 'warning' ? 'assertive' : 'polite'}
      style={{
        position:        'relative',
        display:         'flex',
        alignItems:      'center',
        gap:             'var(--space-2)',
        maxWidth:        '320px',
        minWidth:        '260px',
        padding:         '10px 12px',
        backgroundColor: 'var(--surface-high)',
        border:          '1px solid var(--border-default)',
        borderLeft:      `3px solid ${config.borderColor}`,
        borderRadius:    'var(--radius-md)',
        boxShadow:       'var(--shadow-md)',
        animation:       exiting
          ? 'toast-exit var(--duration-exit) var(--ease-in) both'
          : 'toast-enter var(--duration-normal) var(--ease-out) both',
        cursor:          'default',
      }}
      onMouseEnter={() => { setHovered(true);  setShowDismiss(true); }}
      onMouseLeave={() => { setHovered(false); setShowDismiss(false); }}
    >
      {/* Icon */}
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {config.icon}
      </span>

      {/* Message */}
      <span
        style={{
          flex:       1,
          fontSize:   'var(--text-sm)',
          fontFamily: 'var(--font-ui)',
          color:      'var(--text-primary)',
          lineHeight: 'var(--leading-normal)' as any,
          wordBreak:  'break-word',
        }}
      >
        {toast.message}
      </span>

      {/* Dismiss button — visible on hover */}
      <button
        onClick={dismiss}
        aria-label="Dismiss notification"
        style={{
          flexShrink:      0,
          width:           '20px',
          height:          '20px',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          background:      'transparent',
          border:          'none',
          cursor:          'pointer',
          color:           'var(--text-tertiary)',
          borderRadius:    'var(--radius-sm)',
          opacity:         showDismiss ? 1 : 0,
          transition:      'opacity var(--duration-fast) var(--ease-inout), color var(--duration-fast) var(--ease-inout)',
          padding:         0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--semantic-error)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
