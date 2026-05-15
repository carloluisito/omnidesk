/**
 * PanelSection — collapsible group with mono caption, count chip, and optional
 * right-aligned row action.
 *
 * Collapses with a CSS-driven height transition using max-height.
 * The caret icon flips 90° when collapsed via CSS transform.
 *
 * Design tokens: --v2-text-tertiary, --v2-text-quaternary, --v2-duration-200.
 */
import { useState, type ReactNode } from 'react';

export interface PanelSectionProps {
  title: string;
  count?: number;
  /** Start open (default true). */
  defaultOpen?: boolean;
  /** Right-aligned node in the section header (bulk action button etc). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PanelSection({
  title,
  count,
  defaultOpen = true,
  action,
  children,
  className,
}: PanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={className} style={{ marginBottom: 14, padding: '0 6px' }}>
      {/* Section header row */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
        style={{
          display:    'flex',
          alignItems: 'center',
          gap:        6,
          marginBottom: 4,
          padding:    '2px 4px',
          cursor:     'pointer',
          userSelect: 'none',
        }}
      >
        {/* Caret */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          style={{
            color:     'var(--v2-text-quaternary)',
            flexShrink: 0,
            transform:  open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: `transform var(--v2-duration-200, 200ms) ease`,
          }}
          fill="currentColor"
        >
          <path d="M5 7L1 3h8L5 7z" />
        </svg>

        {/* Title */}
        <span
          style={{
            fontFamily:    'var(--font-mono, monospace)',
            fontSize:      10,
            textTransform: 'uppercase' as const,
            letterSpacing: '.12em',
            color:         'var(--v2-text-tertiary)',
            flex:          1,
          }}
        >
          {title}
        </span>

        {/* Count chip */}
        {count !== undefined && (
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize:   10,
              color:      'var(--v2-text-quaternary)',
            }}
          >
            {count}
          </span>
        )}

        {/* Right-aligned action (stops propagation so it doesn't toggle collapse) */}
        {action && (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            {action}
          </div>
        )}
      </div>

      {/* Collapsible body */}
      <div
        style={{
          overflow:      'hidden',
          maxHeight:     open ? '9999px' : '0px',
          transition:    open
            ? `max-height var(--v2-duration-200, 200ms) ease`
            : `max-height var(--v2-duration-200, 200ms) ease`,
          display:       'flex',
          flexDirection: 'column',
          gap:           1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
