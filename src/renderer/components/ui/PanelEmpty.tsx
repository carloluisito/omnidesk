/**
 * PanelEmpty — icon plate · title · body · optional primary CTA.
 *
 * Design decision: the existing EmptyState.tsx is a full-page welcome screen
 * (has WelcomeHero, QuickActionCard, FeatureShowcase sub-components, loads
 * history via IPC, etc). It is NOT a generic empty-state primitive — it's a
 * page-level component for the no-session state. PanelEmpty is a distinct,
 * panel-sized primitive that matches the Phase 2 spec (§03). We create it as
 * a new file rather than adding a named export to EmptyState.tsx, which would
 * mean importing a page-level dependency chain inside panel components.
 *
 * The dashed accent ring around the icon plate is the only ornamental element
 * (rgba(0,201,167,.18) = accent at 18%).
 */
import type { ReactNode } from 'react';

export interface PanelEmptyProps {
  /** Icon node shown in the accent plate. */
  icon?: ReactNode;
  /** One-line title ("No X yet"). */
  title: string;
  /** 1–2 sentence body explaining what the panel does. */
  body?: string;
  /** Primary CTA. If omitted, no button is rendered. */
  cta?: { label: string; onClick: () => void };
  className?: string;
}

export function PanelEmpty({ icon, title, body, cta, className }: PanelEmptyProps) {
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
      {/* Icon plate with dashed accent ring */}
      {icon && (
        <div
          style={{
            position:     'relative',
            width:        56,
            height:       56,
            borderRadius: 'var(--radius-lg, 12px)',
            background:   'var(--v2-surface-mid)',
            display:      'grid',
            placeItems:   'center',
            color:        'var(--v2-accent)',
            marginBottom: 14,
            flexShrink:   0,
          }}
        >
          {icon}
          {/* Dashed ring */}
          <span
            aria-hidden="true"
            style={{
              position:     'absolute',
              inset:        -6,
              borderRadius: 'calc(var(--radius-lg, 12px) + 6px)',
              border:       '1px dashed rgba(0,201,167,.18)',
              pointerEvents: 'none',
            }}
          />
        </div>
      )}

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

      {/* Body */}
      {body && (
        <div
          style={{
            color:        'var(--v2-text-secondary)',
            fontSize:     'var(--text-sm, 12px)',
            maxWidth:     240,
            marginBottom: cta ? 14 : 0,
            lineHeight:   1.55,
          }}
        >
          {body}
        </div>
      )}

      {/* CTA */}
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          style={{
            display:         'inline-flex',
            alignItems:      'center',
            gap:             6,
            padding:         '5px 14px',
            background:      'var(--v2-accent)',
            color:           '#0A0B11',
            border:          'none',
            borderRadius:    'var(--radius-md, 6px)',
            fontSize:        'var(--text-sm, 12px)',
            fontWeight:      600,
            cursor:          'pointer',
            fontFamily:      'inherit',
            transition:      'opacity 120ms ease',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
