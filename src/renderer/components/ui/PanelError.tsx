/**
 * PanelError — error variant of PanelEmpty.
 *
 * Shares the same visual anatomy (icon plate + title + body + CTA) but
 * uses --v2-error color for the icon plate, border, and mono error string.
 *
 * recover: primary "Try again" CTA.
 * dismiss: ghost secondary action (e.g. "Dismiss" or "Open settings").
 */
export interface PanelErrorProps {
  title?: string;
  /** The raw error string. Rendered in mono --v2-error color below the body. */
  message: string;
  recover?: { label: string; onClick: () => void };
  dismiss?: () => void;
  className?: string;
}

export function PanelError({
  title = 'Something went wrong',
  message,
  recover,
  dismiss,
  className,
}: PanelErrorProps) {
  return (
    <div
      className={className}
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        height:         '100%',
        minHeight:      200,
        padding:        24,
        textAlign:      'center',
      }}
    >
      {/* Error icon plate */}
      <div
        style={{
          width:        56,
          height:       56,
          borderRadius: 'var(--radius-lg, 12px)',
          background:   'rgba(247,103,142,.08)',
          border:       '1px solid rgba(247,103,142,.22)',
          display:      'grid',
          placeItems:   'center',
          color:        'var(--v2-error)',
          marginBottom: 14,
          flexShrink:   0,
        }}
      >
        {/* Error / exclamation icon */}
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      {/* Title */}
      <div
        style={{
          color:        'var(--v2-text-primary)',
          fontWeight:   600,
          fontSize:     'var(--text-md, 13px)',
          marginBottom: 6,
        }}
      >
        {title}
      </div>

      {/* Mono error string */}
      <div
        style={{
          fontFamily:   'var(--font-mono, monospace)',
          fontSize:     10,
          color:        'var(--v2-error)',
          marginBottom: 14,
          maxWidth:     280,
          wordBreak:    'break-all',
          lineHeight:   1.6,
        }}
      >
        {message}
      </div>

      {/* Action row */}
      {(recover || dismiss) && (
        <div style={{ display: 'flex', gap: 6 }}>
          {recover && (
            <button
              type="button"
              onClick={recover.onClick}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          6,
                padding:      '5px 14px',
                background:   'var(--v2-accent)',
                color:        '#0A0B11',
                border:       'none',
                borderRadius: 'var(--radius-md, 6px)',
                fontSize:     'var(--text-sm, 12px)',
                fontWeight:   600,
                cursor:       'pointer',
                fontFamily:   'inherit',
              }}
            >
              {recover.label}
            </button>
          )}
          {dismiss && (
            <button
              type="button"
              onClick={dismiss}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                padding:      '5px 14px',
                background:   'transparent',
                color:        'var(--v2-text-secondary)',
                border:       '1px solid var(--v2-border-default)',
                borderRadius: 'var(--radius-md, 6px)',
                fontSize:     'var(--text-sm, 12px)',
                cursor:       'pointer',
                fontFamily:   'inherit',
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
