/**
 * ShareIndicator — 16px circular badge showing observer count on shared tabs.
 *
 * Background: #00C9A7 (share-green / accent-primary).
 * Text: #0D0E14 (darkest surface — contrast on green).
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
        backgroundColor: '#00C9A7',
        color:           '#0D0E14',
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
          0%,  100% { box-shadow: 0 0 0 0   rgba(0, 201, 167, 0.6); }
          50%        { box-shadow: 0 0 0 4px rgba(0, 201, 167, 0);   }
        }
      `}</style>
    </span>
  );
}
