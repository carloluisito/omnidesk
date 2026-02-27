/**
 * ObserverToolbar — Horizontal bar rendered above the terminal in observer tabs.
 *
 * Layout: [link-icon] [session name] [spacer] [Request Control | Release Control | You have control] [Leave]
 * Control button states: 'read-only' → "Request Control", 'requesting' → "Requesting...", 'has-control' → "Release Control"
 * Responsive: buttons collapse into "..." overflow menu below 400px pane width
 *
 * data-testid: "observer-toolbar", "request-control-btn", "leave-session-btn"
 * Accessibility: all buttons have aria-label, aria-pressed, aria-busy on requesting state
 */
import { useState, useRef, useCallback }  from 'react';
import type { ObserverRole }               from '../../shared/types/sharing-types';

interface ObserverToolbarProps {
  sessionName:  string;
  shareCode:    string;
  controlState: ObserverRole;
  onRequestControl: () => void;
  onReleaseControl: () => void;
  onLeave:          () => void;
  isNarrow?:        boolean; // true when pane width < 400px
}

export function ObserverToolbar({
  sessionName,
  shareCode: _shareCode,
  controlState,
  onRequestControl,
  onReleaseControl,
  onLeave,
  isNarrow = false,
}: ObserverToolbarProps) {
  const [showOverflow, setShowOverflow] = useState(false);
  const overflowRef                     = useRef<HTMLDivElement>(null);

  const hasControl    = controlState === 'has-control';
  const isRequesting  = controlState === 'requesting';
  const isReadOnly    = controlState === 'read-only';

  const handleControlClick = useCallback(() => {
    if (hasControl)   { onReleaseControl(); return; }
    if (isReadOnly)   { onRequestControl(); return; }
  }, [hasControl, isReadOnly, onReleaseControl, onRequestControl]);

  const controlLabel   = hasControl   ? 'Release Control'
                       : isRequesting  ? 'Requesting...'
                       :                'Request Control';
  const controlAriaLabel = hasControl   ? 'Release terminal control'
                         : isRequesting  ? 'Control request pending'
                         :                'Request terminal control';

  // Control button background
  const controlBg    = hasControl  ? 'rgba(0,201,167,0.15)'
                     : isRequesting ? 'rgba(122,162,247,0.12)'
                     : 'var(--surface-float)';
  const controlColor = hasControl  ? '#00C9A7'
                     : isRequesting ? '#7aa2f7'
                     : 'var(--text-secondary)';
  const controlBorder = hasControl  ? '1px solid rgba(0,201,167,0.3)'
                      : isRequesting ? '1px solid rgba(122,162,247,0.25)'
                      : '1px solid var(--border-default)';

  const btnBase: React.CSSProperties = {
    display:      'inline-flex',
    alignItems:   'center',
    gap:          '5px',
    padding:      '4px 10px',
    background:   'var(--surface-float)',
    border:       '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    color:        'var(--text-secondary)',
    fontSize:     'var(--text-xs)',
    fontFamily:   'var(--font-ui)',
    cursor:       'pointer',
    whiteSpace:   'nowrap',
    transition:   'all var(--duration-fast)',
  };

  if (isNarrow) {
    // Overflow menu mode
    return (
      <div
        data-testid="observer-toolbar"
        style={{
          height:          '32px',
          backgroundColor: 'var(--surface-raised)',
          borderBottom:    '1px solid var(--border-subtle)',
          display:         'flex',
          alignItems:      'center',
          padding:         '0 var(--space-2)',
          gap:             'var(--space-2)',
          flexShrink:      0,
          borderLeft:      '2px solid #7aa2f7',
        }}
      >
        {/* Session label */}
        <svg width="11" height="11" viewBox="0 0 15 15" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M6.5 10.5l-2 2a2.828 2.828 0 01-4-4l2-2" stroke="#7aa2f7" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M8.5 4.5l2-2a2.828 2.828 0 014 4l-2 2"   stroke="#7aa2f7" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="5.5" y1="9.5" x2="9.5" y2="5.5" stroke="#7aa2f7" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span style={{
          flex:         1,
          fontSize:     'var(--text-xs)',
          fontFamily:   'var(--font-ui)',
          color:        'var(--text-secondary)',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
        }}>
          {sessionName}
        </span>

        {/* "..." overflow button */}
        <div ref={overflowRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            aria-label="Observer options"
            aria-haspopup="menu"
            aria-expanded={showOverflow}
            onClick={() => setShowOverflow((v) => !v)}
            style={{
              ...btnBase,
              padding:    '4px 8px',
              fontSize:   '16px',
              lineHeight: 1,
            }}
          >
            •••
          </button>
          {showOverflow && (
            <div
              role="menu"
              style={{
                position:  'absolute',
                bottom:    'calc(100% + 4px)',
                right:     0,
                background: 'var(--surface-high)',
                border:    '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md)',
                minWidth:  '160px',
                zIndex:    'var(--z-dropdown)' as any,
                paddingTop: 'var(--space-1)',
                paddingBottom: 'var(--space-1)',
                animation: 'slide-up var(--duration-fast) var(--ease-out) both',
              }}
            >
              <button
                role="menuitem"
                data-testid="request-control-btn"
                onClick={() => { setShowOverflow(false); handleControlClick(); }}
                disabled={isRequesting}
                style={{
                  display:    'block',
                  width:      '100%',
                  padding:    '6px var(--space-3)',
                  background: 'transparent',
                  border:     'none',
                  cursor:     isRequesting ? 'not-allowed' : 'pointer',
                  textAlign:  'left',
                  fontSize:   'var(--text-sm)',
                  fontFamily: 'var(--font-ui)',
                  color:      hasControl ? '#00C9A7' : 'var(--text-secondary)',
                  opacity:    isRequesting ? 0.6 : 1,
                }}
              >
                {controlLabel}
              </button>
              <button
                role="menuitem"
                data-testid="leave-session-btn"
                onClick={() => { setShowOverflow(false); onLeave(); }}
                style={{
                  display:    'block',
                  width:      '100%',
                  padding:    '6px var(--space-3)',
                  background: 'transparent',
                  border:     'none',
                  cursor:     'pointer',
                  textAlign:  'left',
                  fontSize:   'var(--text-sm)',
                  fontFamily: 'var(--font-ui)',
                  color:      'var(--semantic-error)',
                }}
              >
                Leave Session
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="observer-toolbar"
      style={{
        height:          '32px',
        backgroundColor: 'var(--surface-raised)',
        borderBottom:    '1px solid var(--border-subtle)',
        display:         'flex',
        alignItems:      'center',
        padding:         '0 var(--space-2)',
        gap:             'var(--space-2)',
        flexShrink:      0,
        borderLeft:      '2px solid #7aa2f7',
      }}
    >
      {/* Chain-link icon */}
      <svg width="11" height="11" viewBox="0 0 15 15" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M6.5 10.5l-2 2a2.828 2.828 0 01-4-4l2-2" stroke="#7aa2f7" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8.5 4.5l2-2a2.828 2.828 0 014 4l-2 2"   stroke="#7aa2f7" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="5.5" y1="9.5" x2="9.5" y2="5.5" stroke="#7aa2f7" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      {/* Session name */}
      <span style={{
        flex:         1,
        fontSize:     'var(--text-xs)',
        fontFamily:   'var(--font-ui)',
        color:        'var(--text-secondary)',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
        userSelect:   'none',
      }}>
        {sessionName}
      </span>

      {/* Control status indicator when has-control */}
      {hasControl && (
        <span
          style={{
            display:    'inline-flex',
            alignItems: 'center',
            gap:        '4px',
            fontSize:   'var(--text-xs)',
            fontFamily: 'var(--font-ui)',
            color:      '#00C9A7',
            flexShrink: 0,
          }}
        >
          <span style={{
            width:           '6px',
            height:          '6px',
            borderRadius:    '50%',
            backgroundColor: '#00C9A7',
            display:         'block',
            animation:       'ctrl-pulse 1.6s ease-in-out infinite',
          }} />
          You have control
        </span>
      )}

      {/* Control button */}
      <button
        data-testid="request-control-btn"
        aria-label={controlAriaLabel}
        aria-pressed={hasControl}
        aria-busy={isRequesting}
        onClick={handleControlClick}
        disabled={isRequesting}
        style={{
          ...btnBase,
          background:  controlBg,
          border:      controlBorder,
          color:       controlColor,
          opacity:     isRequesting ? 0.7 : 1,
          cursor:      isRequesting ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!isRequesting) {
            e.currentTarget.style.background = hasControl
              ? 'rgba(0,201,167,0.22)'
              : 'var(--state-hover)';
          }
        }}
        onMouseLeave={(e) => { e.currentTarget.style.background = controlBg; }}
      >
        {isRequesting && (
          <span style={{
            width:       9,
            height:      9,
            border:      '1.5px solid rgba(122,162,247,0.35)',
            borderTopColor: '#7aa2f7',
            borderRadius: '50%',
            display:     'block',
            animation:   'ctrl-spin 0.8s linear infinite',
            flexShrink:  0,
          }} />
        )}
        {controlLabel}
      </button>

      {/* Leave button */}
      <button
        data-testid="leave-session-btn"
        aria-label="Leave shared session"
        onClick={onLeave}
        style={{
          ...btnBase,
          border:     '1px solid rgba(247,103,142,0.3)',
          color:      'var(--semantic-error)',
          background: 'transparent',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--semantic-error-muted)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        Leave
      </button>

      <style>{`
        @keyframes ctrl-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes ctrl-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
