/**
 * TitleBarBranding — 36px title bar with logo + wordmark + session title.
 *
 * Left: BrandMark (18px) + "OmniDesk" wordmark.
 * Center: active session title (secondary text, truncated).
 * Bottom: 1px border-subtle.
 * Draggable region covers full bar.
 */
import { useState, useEffect } from 'react';
import { BrandMark } from './ui/BrandMark';

interface TitleBarBrandingProps {
  onClick:       () => void;
  sessionTitle?: string;
}

export function TitleBarBranding({ onClick, sessionTitle }: TitleBarBrandingProps) {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handle = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  const showWordmark = windowWidth >= 360;

  return (
    <div
      style={{
        height:          'var(--title-bar-height)',
        backgroundColor: 'var(--surface-base)',
        borderBottom:    '1px solid var(--border-subtle)',
        display:         'flex',
        alignItems:      'center',
        position:        'relative',
        flexShrink:      0,
        zIndex:          'var(--z-titlebar)' as any,
      }}
    >
      {/* Full-width drag region */}
      <div
        aria-hidden="true"
        style={{
          position:            'absolute',
          top:                 0,
          left:                0,
          right:               0,
          bottom:              0,
          WebkitAppRegion:     'drag',
        } as React.CSSProperties}
      />

      {/* Left: logo + wordmark */}
      <button
        onClick={onClick}
        aria-label="Open About OmniDesk"
        aria-haspopup="dialog"
        style={{
          position:        'relative',
          zIndex:          1,
          display:         'flex',
          alignItems:      'center',
          gap:             'var(--space-2)',
          padding:         '0 var(--space-3)',
          height:          '100%',
          background:      'transparent',
          border:          'none',
          cursor:          'pointer',
          borderRadius:    'var(--radius-sm)',
          outline:         'none',
          flexShrink:      0,
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--state-hover)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
        }}
      >
        <BrandMark size={18} />
        {showWordmark && (
          <span
            style={{
              fontFamily:  'var(--font-ui)',
              fontSize:    'var(--text-sm)',
              fontWeight:  'var(--weight-medium)' as any,
              color:       'var(--text-secondary)',
              userSelect:  'none',
              letterSpacing: '-0.01em',
            }}
          >
            <span style={{ fontWeight: 'var(--weight-medium)' as any }}>Omni</span>
            <span style={{ fontWeight: 'var(--weight-light)'  as any }}>Desk</span>
          </span>
        )}
      </button>

      {/* Center: session title */}
      {sessionTitle && (
        <div
          aria-hidden="true"
          style={{
            position:     'absolute',
            left:         '50%',
            transform:    'translateX(-50%)',
            maxWidth:     '300px',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
            fontSize:     'var(--text-sm)',
            fontFamily:   'var(--font-ui)',
            color:        'var(--text-tertiary)',
            userSelect:   'none',
            pointerEvents: 'none',
          }}
        >
          {sessionTitle}
        </div>
      )}

      <style>{`
        button[aria-label="Open About OmniDesk"]:focus-visible {
          outline: 2px solid var(--state-focus) !important;
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}
