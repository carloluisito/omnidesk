/**
 * InlineBanner — in-panel notice, replacing any BannerNotice component.
 *
 * 4 severities: info | warning | error | success
 * Layout: severity rail (left, 3px) + icon + title/body + dual-action footer
 * Used inside panels for non-blocking contextual notices.
 *
 * No flag gate: this is a net-new component (BannerNotice search confirmed
 * no existing callers in the codebase). Safe to ship without v2 gating.
 *
 * Per phase-2/09-toast.jsx InlineBanner spec.
 */
import React from 'react';

export type InlineBannerSeverity = 'info' | 'warning' | 'error' | 'success';

export interface InlineBannerAction {
  label:   string;
  onClick: () => void;
}

export interface InlineBannerProps {
  severity?:   InlineBannerSeverity;
  title:       string;
  body?:       string;
  /** Primary action (right) */
  primary?:    InlineBannerAction | string;
  /** Secondary action (left of primary) */
  secondary?:  InlineBannerAction | string;
  /** Callback when primary button clicked — convenience shorthand if primary is a string */
  onPrimary?:  () => void;
  /** Callback when secondary button clicked — convenience shorthand if secondary is a string */
  onSecondary?: () => void;
  className?:  string;
  style?:      React.CSSProperties;
}

interface SeverityConfig {
  fg: string;
  bg: string;
  bd: string;
  icon: React.ReactNode;
}

function makeIcon(path: React.ReactNode, color: string) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke={color} strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

const SEVERITY_CONFIG: Record<InlineBannerSeverity, SeverityConfig> = {
  info: {
    fg: 'var(--v2-info)',
    bg: 'rgba(124,143,255,0.06)',
    bd: 'rgba(124,143,255,0.18)',
    icon: makeIcon(
      <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>,
      'var(--v2-info)'
    ),
  },
  warning: {
    fg: 'var(--v2-warning)',
    bg: 'rgba(247,168,74,0.06)',
    bd: 'rgba(247,168,74,0.20)',
    icon: makeIcon(
      <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
      'var(--v2-warning)'
    ),
  },
  error: {
    fg: 'var(--v2-error)',
    bg: 'rgba(247,103,142,0.06)',
    bd: 'rgba(247,103,142,0.22)',
    icon: makeIcon(
      <><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></>,
      'var(--v2-error)'
    ),
  },
  success: {
    fg: 'var(--v2-success)',
    bg: 'rgba(61,214,140,0.06)',
    bd: 'rgba(61,214,140,0.18)',
    icon: makeIcon(
      <><circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" /></>,
      'var(--v2-success)'
    ),
  },
};

function resolveAction(
  action: InlineBannerAction | string | undefined,
  fallback: (() => void) | undefined
): InlineBannerAction | undefined {
  if (!action) return undefined;
  if (typeof action === 'string') return { label: action, onClick: fallback ?? (() => {}) };
  return action;
}

export function InlineBanner({
  severity = 'warning',
  title,
  body,
  primary,
  secondary,
  onPrimary,
  onSecondary,
  className,
  style,
}: InlineBannerProps) {
  const cfg = SEVERITY_CONFIG[severity];
  const primaryAction   = resolveAction(primary,   onPrimary);
  const secondaryAction = resolveAction(secondary, onSecondary);
  const hasActions = primaryAction || secondaryAction;

  return (
    <div
      role="status"
      aria-label={`${severity}: ${title}`}
      className={className}
      style={{
        background:   cfg.bg,
        border:       `1px solid ${cfg.bd}`,
        borderLeft:   `3px solid ${cfg.fg}`,
        borderRadius: 'var(--radius-md)',
        padding:      '12px 16px',
        display:      'grid',
        gridTemplateColumns: '20px 1fr auto',
        gap:          14,
        alignItems:   'flex-start',
        ...style,
      }}
    >
      {/* Icon */}
      <div style={{ color: cfg.fg, marginTop: 2, display: 'flex' }}>
        {cfg.icon}
      </div>

      {/* Text */}
      <div>
        <div style={{
          color:      'var(--v2-text-primary)',
          fontWeight: 600,
          fontSize:   'var(--text-sm)',
        }}>
          {title}
        </div>
        {body && (
          <div style={{
            color:      'var(--v2-text-secondary)',
            fontSize:   'var(--text-xs)',
            marginTop:  3,
            lineHeight: 1.55,
          }}>
            {body}
          </div>
        )}
      </div>

      {/* Actions */}
      {hasActions && (
        <div style={{
          display:    'flex',
          gap:        6,
          alignSelf:  'center',
          flexShrink: 0,
        }}>
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              style={{
                padding:      '4px 10px',
                fontSize:     'var(--text-xs)',
                background:   'var(--v2-surface-mid)',
                border:       '1px solid var(--v2-border-default)',
                borderRadius: 'var(--radius-sm)',
                color:        'var(--v2-text-secondary)',
                fontFamily:   'inherit',
                cursor:       'pointer',
              }}
            >
              {secondaryAction.label}
            </button>
          )}
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              style={{
                padding:      '4px 10px',
                fontSize:     'var(--text-xs)',
                background:   cfg.fg,
                border:       '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                color:        '#fff',
                fontFamily:   'inherit',
                fontWeight:   600,
                cursor:       'pointer',
              }}
            >
              {primaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
