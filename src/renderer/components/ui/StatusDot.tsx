/**
 * StatusDot — 8px colored circle with aria-label.
 *
 * States:
 * - running:  --semantic-success (green) — pulse animation
 * - idle:     --text-tertiary (muted)
 * - error:    --semantic-error (rose)
 * - warning:  --semantic-warning (amber)
 * - exited:   --semantic-error, lower opacity
 * - active:   --accent-primary pulse — used for tunnel active
 */

export type StatusDotState = 'running' | 'idle' | 'error' | 'warning' | 'exited' | 'active';

interface StatusDotProps {
  status: StatusDotState;
  size?: number;   /* default 8 */
  pulse?: boolean; /* force pulse animation */
  className?: string;
}

const STATUS_CONFIG: Record<StatusDotState, { color: string; label: string; pulse: boolean }> = {
  running: { color: 'var(--semantic-success)', label: 'Running',      pulse: true  },
  idle:    { color: 'var(--text-tertiary)',     label: 'Idle',         pulse: false },
  error:   { color: 'var(--semantic-error)',    label: 'Error',        pulse: false },
  warning: { color: 'var(--semantic-warning)',  label: 'Warning',      pulse: false },
  exited:  { color: 'var(--semantic-error)',    label: 'Exited',       pulse: false },
  active:  { color: 'var(--accent-primary)',    label: 'Active',       pulse: true  },
};

export function StatusDot({ status, size = 8, pulse: forcePulse, className = '' }: StatusDotProps) {
  const { color, label, pulse } = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  const shouldPulse = forcePulse ?? pulse;

  return (
    <span
      className={`${className} ${shouldPulse ? 'animate-dot-pulse' : ''}`}
      aria-label={`Status: ${label}`}
      role="img"
      style={{
        display:         'inline-block',
        width:           `${size}px`,
        height:          `${size}px`,
        borderRadius:    'var(--radius-full)',
        backgroundColor: color,
        flexShrink:      0,
        opacity:         status === 'exited' ? 0.5 : 1,
      }}
    />
  );
}
