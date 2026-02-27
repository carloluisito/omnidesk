/**
 * ProgressBar — horizontal fill bar with threshold-based color.
 *
 * Color thresholds (when color prop is not set):
 * - 0–60%:   --accent-primary
 * - 60–80%:  --semantic-warning
 * - 80–100%: --semantic-error
 *
 * Indeterminate variant: pass `indeterminate={true}` for a shimmer animation.
 * Height: 6px default, border-radius: full.
 */

interface ProgressBarProps {
  value?: number;         /* 0–100 (not needed for indeterminate) */
  max?: number;           /* default 100 */
  height?: number;        /* default 6 */
  label?: string;
  showPercent?: boolean;
  className?: string;
  indeterminate?: boolean; /* Shimmer animation, no value needed */
  color?: string;         /* Override threshold color with a specific CSS color/var */
}

function getBarColor(pct: number): string {
  if (pct >= 80) return 'var(--semantic-error)';
  if (pct >= 60) return 'var(--semantic-warning)';
  return 'var(--accent-primary)';
}

const indeterminateStyles = `
  @keyframes progress-shimmer {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }
  .progress-bar-indeterminate-fill {
    animation: progress-shimmer 1.4s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .progress-bar-indeterminate-fill {
      animation: none;
      opacity: 0.5;
    }
  }
`;

export function ProgressBar({
  value,
  max = 100,
  height = 6,
  label,
  showPercent = false,
  className = '',
  indeterminate = false,
  color,
}: ProgressBarProps) {
  if (indeterminate) {
    return (
      <div
        className={className}
        style={{ width: '100%' }}
        role="progressbar"
        aria-label={label ?? 'Loading'}
        aria-valuetext="Loading"
      >
        <div
          style={{
            width:           '100%',
            height:          `${height}px`,
            backgroundColor: 'var(--surface-float)',
            borderRadius:    'var(--radius-full)',
            overflow:        'hidden',
            position:        'relative',
          }}
        >
          <div
            className="progress-bar-indeterminate-fill"
            style={{
              position:        'absolute',
              top:             0,
              left:            0,
              height:          '100%',
              width:           '50%',
              background:      'linear-gradient(90deg, transparent 0%, var(--accent-primary) 50%, transparent 100%)',
              borderRadius:    'var(--radius-full)',
            }}
          />
        </div>
        <style>{indeterminateStyles}</style>
      </div>
    );
  }

  const safeValue = value ?? 0;
  const pct     = Math.min(100, Math.max(0, (safeValue / max) * 100));
  const barColor = color ?? getBarColor(pct);
  const rounded = Math.round(pct);

  return (
    <div
      className={className}
      style={{ width: '100%' }}
      role="progressbar"
      aria-valuenow={safeValue}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label ?? 'Progress'}
    >
      <div
        style={{
          width:        '100%',
          height:       `${height}px`,
          backgroundColor: 'var(--surface-float)',
          borderRadius:    'var(--radius-full)',
          overflow:        'hidden',
        }}
      >
        <div
          style={{
            height:          '100%',
            width:           `${pct}%`,
            backgroundColor: barColor,
            borderRadius:    'var(--radius-full)',
            transition:      `width var(--duration-normal) var(--ease-inout), background-color var(--duration-normal) var(--ease-inout)`,
          }}
        />
      </div>
      {showPercent && (
        <span
          style={{
            fontSize:   'var(--text-2xs)',
            color:      barColor,
            fontFamily: 'var(--font-mono-ui)',
            marginTop:  '2px',
            display:    'block',
          }}
        >
          {rounded}%
        </span>
      )}
    </div>
  );
}
