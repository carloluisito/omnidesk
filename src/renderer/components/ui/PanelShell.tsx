/**
 * PanelShell — slot-based panel container (Wave 02 panel primitives).
 *
 * Layout: header strip (38px) → scrollable body → optional footer.
 *
 * Design decisions:
 * - Does NOT compose existing PanelHeader.tsx or PanelFooter.tsx.
 *   PanelHeader requires an onClose callback (close-button hard-wired) and uses
 *   --surface-raised / legacy tokens — too narrow an API and wrong visual tier.
 *   PanelFooter is link-only (learnMoreUrl / docsUrl) — completely different
 *   semantic. Rendering inline avoids mismatched token tiers and keeps PanelShell
 *   fully self-contained per Wave 02 spec.
 * - Header background: --v2-surface-low (same tier as the panel body edge).
 * - Body background: --v2-surface-base (deepest — content reads against it).
 * - Footer: --v2-surface-low, sticky bottom, border-top.
 */
import type { ReactNode } from 'react';

export interface PanelShellProps {
  /** Icon node shown left of the title (accent-tinted by the caller). */
  icon?: ReactNode;
  /** Panel title text. */
  title: ReactNode;
  /** Short descriptor / count shown next to title in mono tertiary text. */
  count?: ReactNode;
  /** Nodes rendered right-aligned in the header (icon buttons etc). */
  actions?: ReactNode;
  /** Scrollable main body. */
  children: ReactNode;
  /** Optional sticky footer (e.g. primary CTA). */
  footer?: ReactNode;
  className?: string;
}

export function PanelShell({
  icon,
  title,
  count,
  actions,
  children,
  footer,
  className,
}: PanelShellProps) {
  return (
    <div
      className={className}
      style={{
        display:         'flex',
        flexDirection:   'column',
        height:          '100%',
        overflow:        'hidden',
        background:      'var(--v2-surface-low)',
      }}
    >
      {/* Header strip — 38 px */}
      <div
        style={{
          height:        38,
          flexShrink:    0,
          display:       'flex',
          alignItems:    'center',
          gap:           8,
          padding:       '0 12px',
          background:    'var(--v2-surface-low)',
          borderBottom:  '1px solid var(--v2-border-subtle)',
          fontSize:      'var(--text-sm, 12px)',
        }}
      >
        {icon && (
          <span
            aria-hidden="true"
            style={{ color: 'var(--v2-accent)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            {icon}
          </span>
        )}

        <span
          style={{
            color:      'var(--v2-text-primary)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>

        {count !== undefined && (
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize:   10,
              color:      'var(--v2-text-tertiary)',
              whiteSpace: 'nowrap',
            }}
          >
            {count}
          </span>
        )}

        {actions && (
          <div
            style={{
              marginLeft: 'auto',
              display:    'flex',
              alignItems: 'center',
              gap:        2,
            }}
          >
            {actions}
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div
        style={{
          flex:       1,
          overflow:   'auto',
          background: 'var(--v2-surface-base)',
        }}
      >
        {children}
      </div>

      {/* Optional sticky footer */}
      {footer && (
        <div
          style={{
            flexShrink:  0,
            padding:     10,
            borderTop:   '1px solid var(--v2-border-subtle)',
            background:  'var(--v2-surface-low)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
