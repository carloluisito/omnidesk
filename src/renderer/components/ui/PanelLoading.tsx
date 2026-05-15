/**
 * PanelLoading — skeleton row stack with staggered fade animation.
 *
 * Each row uses .anim-status-pulse (from motion.css Wave 00) with a
 * per-row animation-delay so rows shimmer sequentially, not in lockstep.
 *
 * Row widths vary to look like real content — defined as percentages so
 * they fill whatever panel width the shell provides.
 */
export interface PanelLoadingProps {
  /** Number of skeleton rows to render (default 3). */
  rows?: number;
  className?: string;
}

const ROW_WIDTHS = ['72%', '58%', '84%', '45%', '66%', '52%', '78%'];

export function PanelLoading({ rows = 3, className }: PanelLoadingProps) {
  const count = Math.max(1, Math.min(rows, 7));

  return (
    <div
      className={className}
      style={{
        padding:       '8px 6px',
        display:       'flex',
        flexDirection: 'column',
        gap:           4,
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="anim-status-pulse"
          style={{
            height:           32,
            background:       'var(--v2-surface-mid)',
            borderRadius:     'var(--radius-md, 6px)',
            position:         'relative',
            overflow:         'hidden',
            opacity:          0.7 - i * 0.08,
            animationDelay:   `${i * 80}ms`,
          }}
        >
          {/* Inner text-stub placeholder */}
          <div
            aria-hidden="true"
            style={{
              position:     'absolute',
              left:         10,
              top:          10,
              width:        ROW_WIDTHS[i % ROW_WIDTHS.length],
              height:       12,
              background:   'rgba(255,255,255,.05)',
              borderRadius: 3,
            }}
          />
        </div>
      ))}
    </div>
  );
}
