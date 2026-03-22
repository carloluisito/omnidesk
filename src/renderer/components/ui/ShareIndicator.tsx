/**
 * ShareIndicator — 16px circular badge showing observer count on shared tabs.
 *
 * Background: var(--accent-primary) (teal).
 * Text: var(--text-inverse) (darkest surface — contrast on teal).
 * Positioned top-right of tab icon by the parent (Tab.tsx).
 * Pulses when count > 0 to signal live sharing.
 */

interface ShareIndicatorProps {
  count: number;
}

export function ShareIndicator({ count }: ShareIndicatorProps) {
  return (
    <span
      data-testid="share-indicator"
      aria-label={`${count} observer${count !== 1 ? 's' : ''} connected`}
      title={`${count} observer${count !== 1 ? 's' : ''} connected`}
      style={{
        display:         'inline-flex',
        alignItems:      'center',
        justifyContent:  'center',
        width:           '16px',
        height:          '16px',
        borderRadius:    '50%',
        backgroundColor: 'var(--accent-primary)',
        color:           'var(--text-inverse)',
        fontSize:        '9px',
        fontFamily:      '"JetBrains Mono", monospace',
        fontWeight:      700,
        lineHeight:      1,
        flexShrink:      0,
        animation:       count > 0 ? 'share-pulse 2.4s ease-in-out infinite' : 'none',
        userSelect:      'none',
        pointerEvents:   'none',
      }}
    >
      {count > 9 ? '9+' : count}

      <style>{`
        @keyframes share-pulse {
          0%,  100% { box-shadow: 0 0 0 0   color-mix(in srgb, var(--accent-primary) 60%, transparent); }
          50%        { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-primary) 0%, transparent);   }
        }
      `}</style>
    </span>
  );
}
