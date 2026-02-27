/**
 * ProviderBadge — 2-letter pill badge for provider identification.
 *
 * 16x16px with provider-specific colors:
 * - CL (Claude): amber bg at 20% opacity, amber text
 * - CX (Codex): green bg at 20% opacity, green text
 * - ?? (unknown): muted bg/text
 *
 * Font: mono-ui, 10px, semibold.
 */
import type { ProviderId } from '../../../shared/types/provider-types';

interface ProviderBadgeProps {
  providerId?: ProviderId | string;
  size?: 'sm' | 'md';  /* sm=16px (tab bar), md=20px (pane header) */
  muted?: boolean;      /* Inactive/unfocused variant */
  className?: string;
}

function getProviderLabel(providerId?: string): string {
  if (!providerId) return '??';
  if (providerId === 'claude') return 'CL';
  if (providerId === 'codex')  return 'CX';
  return (providerId as string).toUpperCase().slice(0, 2);
}

function getProviderColors(providerId?: string, muted = false): { bg: string; text: string } {
  const opacity = muted ? '10' : '20';
  if (providerId === 'claude') {
    return {
      bg:   `rgba(204, 133, 51, 0.${opacity})`,
      text: muted ? 'var(--text-tertiary)' : 'var(--provider-claude)',
    };
  }
  if (providerId === 'codex') {
    return {
      bg:   `rgba(16, 163, 127, 0.${opacity})`,
      text: muted ? 'var(--text-tertiary)' : 'var(--provider-codex)',
    };
  }
  return {
    bg:   `rgba(157, 163, 190, 0.${opacity})`,
    text: muted ? 'var(--text-tertiary)' : 'var(--provider-future)',
  };
}

function getProviderFullName(providerId?: string): string {
  if (providerId === 'claude') return 'Claude Code';
  if (providerId === 'codex')  return 'Codex CLI';
  return 'Unknown provider';
}

export function ProviderBadge({ providerId, size = 'sm', muted = false, className = '' }: ProviderBadgeProps) {
  const label = getProviderLabel(providerId as string | undefined);
  const { bg, text } = getProviderColors(providerId as string | undefined, muted);
  const dim = size === 'sm' ? 16 : 20;
  const fontSize = size === 'sm' ? '9px' : '10px';

  return (
    <span
      className={className}
      aria-label={getProviderFullName(providerId as string | undefined)}
      title={getProviderFullName(providerId as string | undefined)}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        width:          `${dim}px`,
        height:         `${dim}px`,
        borderRadius:   'var(--radius-sm)',
        backgroundColor: bg,
        color:          text,
        fontFamily:     'var(--font-mono-ui)',
        fontSize,
        fontWeight:     'var(--weight-semibold)' as any,
        letterSpacing:  'var(--tracking-widest)',
        lineHeight:     1,
        flexShrink:     0,
        userSelect:     'none',
        transition:     'color var(--duration-fast) var(--ease-inout), background-color var(--duration-fast) var(--ease-inout)',
      }}
    >
      {label}
    </span>
  );
}
