/**
 * StatusPill — a small colored pill showing a status dot + label.
 *
 * Variant groups:
 *   live / success   → --v2-success  (green)
 *   thinking / info  → --v2-info     (purple-blue, same as --v2-accent-2)
 *   awaiting / warning → --v2-warning (amber)
 *   errored / error  → --v2-error   (red)
 *   done             → --v2-accent  (teal)
 *   offline          → --v2-text-tertiary (grey)
 *
 * pulse=true animates the dot with .anim-status-pulse.
 * onClick present → renders as <button>; otherwise <span>.
 */
import type { ReactNode } from 'react';

export type StatusPillVariant =
  | 'live' | 'thinking' | 'awaiting' | 'errored' | 'done' | 'offline'
  | 'info' | 'success' | 'warning' | 'error';

const DOT_COLOR: Record<StatusPillVariant, string> = {
  live:     'var(--v2-success)',
  success:  'var(--v2-success)',
  thinking: 'var(--v2-info)',
  info:     'var(--v2-info)',
  awaiting: 'var(--v2-warning)',
  warning:  'var(--v2-warning)',
  errored:  'var(--v2-error)',
  error:    'var(--v2-error)',
  done:     'var(--v2-accent)',
  offline:  'var(--v2-text-tertiary)',
};

interface StatusPillProps {
  variant:    StatusPillVariant;
  label?:     string;
  children?:  ReactNode;
  pulse?:     boolean;
  onClick?:   () => void;
  className?: string;
}

const PILL_STYLE: React.CSSProperties = {
  display:        'inline-flex',
  alignItems:     'center',
  gap:            '5px',
  backgroundColor: 'var(--v2-surface-low)',
  borderRadius:   'var(--radius-full)',
  padding:        '2px 8px 2px 6px',
  fontSize:       'var(--text-xs, 11px)',
  fontFamily:     'var(--font-mono-ui)',
  color:          'var(--v2-text-primary)',
  lineHeight:     1.4,
  userSelect:     'none',
  border:         'none',
  cursor:         'default',
  whiteSpace:     'nowrap',
  flexShrink:     0,
};

const BUTTON_HOVER_IN  = (e: React.MouseEvent<HTMLButtonElement>) => {
  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--v2-surface-high)';
};
const BUTTON_HOVER_OUT = (e: React.MouseEvent<HTMLButtonElement>) => {
  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--v2-surface-low)';
};

export function StatusPill({
  variant,
  label,
  children,
  pulse   = false,
  onClick,
  className,
}: StatusPillProps) {
  const dotColor = DOT_COLOR[variant];
  const content  = label ?? children;

  const dot = (
    <span
      aria-hidden="true"
      className={pulse ? 'anim-status-pulse' : undefined}
      style={{
        display:         'inline-block',
        width:           '6px',
        height:          '6px',
        borderRadius:    'var(--radius-full)',
        backgroundColor: dotColor,
        flexShrink:      0,
      }}
    />
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        onMouseEnter={BUTTON_HOVER_IN}
        onMouseLeave={BUTTON_HOVER_OUT}
        style={{ ...PILL_STYLE, cursor: 'pointer' }}
      >
        {dot}
        {content}
      </button>
    );
  }

  return (
    <span className={className} style={PILL_STYLE}>
      {dot}
      {content}
    </span>
  );
}
