/**
 * TitleBarBranding — 36px title bar with logo + wordmark + branch crumb + ⌘K chip.
 * V2 design, unconditional.
 *
 * Layout (left → right):
 *   logo + wordmark | repo/branch crumb | [spacer] | ⌘K chip
 */
import { BrandMark } from './ui/BrandMark';

interface TitleBarBrandingProps {
  onClick:                 () => void;
  sessionTitle?:           string;
  branch?:                 string | null;
  onOpenCommandPalette?:   () => void;
}

export function TitleBarBranding({ onClick, branch, onOpenCommandPalette }: TitleBarBrandingProps) {
  return (
    <div
      style={{
        height:          '36px',
        backgroundColor: 'var(--v2-surface-base)',
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
          position:        'absolute',
          top:             0,
          left:            0,
          right:           0,
          bottom:          0,
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      />

      {/* Left: logo + wordmark (click → About) */}
      <button
        onClick={onClick}
        aria-label="Open About OmniDesk"
        aria-haspopup="dialog"
        style={{
          position:        'relative',
          zIndex:          1,
          display:         'flex',
          alignItems:      'center',
          gap:             '6px',
          padding:         '0 10px',
          height:          '100%',
          background:      'transparent',
          border:          'none',
          cursor:          'pointer',
          borderRadius:    'var(--radius-sm)',
          outline:         'none',
          flexShrink:      0,
          WebkitAppRegion: 'no-drag',
          transition:      `background-color var(--v2-duration-120) var(--v2-ease-out)`,
        } as React.CSSProperties}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--v2-surface-low)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
        }}
      >
        <BrandMark size={16} />
        <span
          style={{
            fontFamily:    'var(--font-ui)',
            fontSize:      '12px',
            fontWeight:    600,
            color:         'var(--v2-text-primary)',
            userSelect:    'none',
            letterSpacing: '-0.01em',
          }}
        >
          omnidesk
        </span>
      </button>

      {/* Branch crumb */}
      {branch && (
        <span
          aria-label={`Current branch: ${branch}`}
          style={{
            position:   'relative',
            zIndex:     1,
            display:    'inline-flex',
            alignItems: 'center',
            gap:        '4px',
            fontFamily: 'var(--font-mono-ui)',
            fontSize:   '11px',
            color:      'var(--v2-text-primary)',
            userSelect: 'none',
            marginLeft: '2px',
          }}
        >
          <span style={{ color: 'var(--v2-text-tertiary)', marginRight: 2 }}>/</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--v2-text-tertiary)" strokeWidth="2" aria-hidden="true">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 01-9 9" />
          </svg>
          <span style={{ color: 'var(--v2-accent)', fontWeight: 500 }}>{branch}</span>
        </span>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* ⌘K affordance chip — data-tour anchor for Tour step 3 */}
      {onOpenCommandPalette && (
        <button
          onClick={onOpenCommandPalette}
          title="Open command palette (⌘K)"
          aria-label="Open command palette"
          data-tour="cmd-k-hint"
          style={{
            position:        'relative',
            zIndex:          1,
            display:         'inline-flex',
            alignItems:      'center',
            gap:             '5px',
            marginRight:     '10px',
            padding:         '2px 8px',
            background:      'var(--v2-surface-low)',
            border:          `1px solid var(--v2-border-default)`,
            borderRadius:    'var(--radius-sm)',
            cursor:          'pointer',
            fontFamily:      'var(--font-mono-ui)',
            fontSize:        '11px',
            color:           'var(--v2-text-tertiary)',
            WebkitAppRegion: 'no-drag',
            outline:         'none',
            transition:      `background-color var(--v2-duration-120) var(--v2-ease-out)`,
          } as React.CSSProperties}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--v2-surface-mid)';
            (e.currentTarget as HTMLButtonElement).style.color            = 'var(--v2-text-secondary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--v2-surface-low)';
            (e.currentTarget as HTMLButtonElement).style.color            = 'var(--v2-text-tertiary)';
          }}
        >
          <svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="5" />
            <path d="M11 11l3 3" strokeLinecap="round" />
          </svg>
          <span>⌘K to find anything</span>
        </button>
      )}
    </div>
  );
}
