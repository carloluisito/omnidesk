/**
 * StatusBar — 24px app-wide status strip at bottom.
 *
 * Sections (left-to-right):
 * 1. Provider indicator: colored dot + provider name
 * 2. Model name (clickable → model switcher)
 * 3. Git branch (clickable → Git panel)
 * 4. Git delta: +n -n ~n in semantic colors
 * 5. Token count for active session
 * 6. Mini budget bar (64px inline)
 * 7. Budget %
 * 8. Connectivity dot (rightmost)
 *
 * Font: text-2xs, font-mono-ui. Dividers between sections.
 */
import type { ProviderId } from '../../shared/types/provider-types';
import type { GitStatus } from '../../shared/types/git-types';
import type { ClaudeUsageQuota } from '../../shared/ipc-types';

interface StatusBarProps {
  providerId?:    ProviderId | string;
  modelName?:     string;
  gitStatus?:     GitStatus | null;
  tokenCount?:    number;
  quotaData?:     ClaudeUsageQuota | null;
  isConnected?:   boolean;
  onModelClick?:  () => void;
  onGitClick?:    () => void;
  onBudgetClick?: () => void;
}

function Divider() {
  return (
    <span
      aria-hidden="true"
      style={{
        display:         'inline-block',
        width:           '1px',
        height:          '12px',
        backgroundColor: 'var(--border-default)',
        flexShrink:      0,
        margin:          '0 var(--space-2)',
      }}
    />
  );
}

function ClickableSection({
  children,
  onClick,
  title,
}: {
  children:  React.ReactNode;
  onClick?:  () => void;
  title?:    string;
}) {
  return (
    <span
      title={title}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        gap:            'var(--space-1)',
        cursor:         onClick ? 'pointer' : 'default',
        padding:        onClick ? '0 var(--space-1)' : '0',
        borderRadius:   'var(--radius-sm)',
        transition:     'background-color var(--duration-fast) var(--ease-inout)',
        outline:        'none',
        height:         '18px',
      }}
      onMouseEnter={(e) => { if (onClick) (e.currentTarget as HTMLSpanElement).style.backgroundColor = 'var(--state-hover)'; }}
      onMouseLeave={(e) => { if (onClick) (e.currentTarget as HTMLSpanElement).style.backgroundColor = 'transparent'; }}
      onFocus={(e) => { if (onClick) (e.currentTarget as HTMLSpanElement).style.outline = '2px solid var(--state-focus)'; }}
      onBlur={(e) => { if (onClick) (e.currentTarget as HTMLSpanElement).style.outline = 'none'; }}
    >
      {children}
    </span>
  );
}

function getProviderDotColor(providerId?: string): string {
  if (providerId === 'claude') return 'var(--provider-claude)';
  if (providerId === 'codex')  return 'var(--provider-codex)';
  return 'var(--provider-future)';
}

function getProviderName(providerId?: string): string {
  if (providerId === 'claude') return 'Claude Code';
  if (providerId === 'codex')  return 'Codex CLI';
  return providerId ?? 'Unknown';
}

function formatTokens(count?: number): string {
  if (count == null) return '—';
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function MiniProgressBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'var(--semantic-error)'
    : pct >= 60 ? 'var(--semantic-warning)'
    : 'var(--accent-primary)';

  return (
    <span
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Budget usage"
      style={{
        display:         'inline-block',
        width:           '48px',
        height:          '4px',
        backgroundColor: 'var(--surface-float)',
        borderRadius:    'var(--radius-full)',
        overflow:        'hidden',
        flexShrink:      0,
      }}
    >
      <span
        style={{
          display:         'block',
          height:          '100%',
          width:           `${Math.min(100, pct)}%`,
          backgroundColor: color,
          borderRadius:    'var(--radius-full)',
          transition:      'width var(--duration-normal) var(--ease-inout), background-color var(--duration-normal) var(--ease-inout)',
        }}
      />
    </span>
  );
}

const TEXT_STYLE: React.CSSProperties = {
  fontSize:    'var(--text-2xs)',
  fontFamily:  'var(--font-mono-ui)',
  color:       'var(--text-secondary)',
  lineHeight:  1,
  whiteSpace:  'nowrap',
};

export function StatusBar({
  providerId,
  modelName,
  gitStatus,
  tokenCount,
  quotaData,
  isConnected = true,
  onModelClick,
  onGitClick,
  onBudgetClick,
}: StatusBarProps) {
  const dotColor        = getProviderDotColor(providerId as string | undefined);
  const providerName    = getProviderName(providerId as string | undefined);
  const budgetPct       = quotaData
    ? Math.round((quotaData.five_hour?.utilization ?? 0) * 100)
    : 0;

  return (
    <div
      role="status"
      aria-label="Session status bar"
      style={{
        height:          'var(--status-bar-height)',
        display:         'flex',
        alignItems:      'center',
        paddingLeft:     'var(--space-3)',
        paddingRight:    'var(--space-3)',
        backgroundColor: 'var(--surface-base)',
        borderTop:       '1px solid var(--border-subtle)',
        flexShrink:      0,
        overflow:        'hidden',
      }}
    >
      {/* 1. Provider indicator */}
      <ClickableSection title={providerName}>
        <span
          aria-hidden="true"
          style={{
            width:           '6px',
            height:          '6px',
            borderRadius:    'var(--radius-full)',
            backgroundColor: dotColor,
            flexShrink:      0,
          }}
        />
        <span style={TEXT_STYLE}>{providerName}</span>
      </ClickableSection>

      {/* 2. Model name (clickable) */}
      {modelName && (
        <>
          <Divider />
          <ClickableSection onClick={onModelClick} title="Switch model">
            <span style={{ ...TEXT_STYLE, color: onModelClick ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {modelName}
            </span>
          </ClickableSection>
        </>
      )}

      {/* 3. Git branch */}
      {gitStatus?.branch && (
        <>
          <Divider />
          <ClickableSection onClick={onGitClick} title="Open Git panel">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" aria-hidden="true">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 01-9 9" />
            </svg>
            <span style={TEXT_STYLE}>{gitStatus.branch}</span>
          </ClickableSection>
        </>
      )}

      {/* 4. Git delta */}
      {gitStatus && (gitStatus.ahead || gitStatus.behind || (gitStatus as any).modified) && (
        <>
          <Divider />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {(gitStatus.ahead ?? 0) > 0 && (
              <span style={{ ...TEXT_STYLE, color: 'var(--semantic-success)' }}>
                +{gitStatus.ahead}
              </span>
            )}
            {(gitStatus.behind ?? 0) > 0 && (
              <span style={{ ...TEXT_STYLE, color: 'var(--semantic-error)' }}>
                -{gitStatus.behind}
              </span>
            )}
            {((gitStatus as any).modified ?? 0) > 0 && (
              <span style={{ ...TEXT_STYLE, color: 'var(--semantic-warning)' }}>
                ~{(gitStatus as any).modified}
              </span>
            )}
          </span>
        </>
      )}

      {/* 5. Token count */}
      {tokenCount != null && (
        <>
          <Divider />
          <span style={{ ...TEXT_STYLE, color: 'var(--text-tertiary)' }}>
            {formatTokens(tokenCount)} tok
          </span>
        </>
      )}

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      {/* 6+7. Mini budget bar + % */}
      {quotaData && (
        <>
          <ClickableSection onClick={onBudgetClick} title="Budget usage">
            <MiniProgressBar pct={budgetPct} />
            <span style={{
              ...TEXT_STYLE,
              color: budgetPct >= 80 ? 'var(--semantic-error)'
                : budgetPct >= 60 ? 'var(--semantic-warning)'
                : 'var(--text-secondary)',
            }}>
              {budgetPct}%
            </span>
          </ClickableSection>
          <Divider />
        </>
      )}

      {/* 8. Connectivity dot */}
      <span
        aria-label={`Connectivity: ${isConnected ? 'connected' : 'disconnected'}`}
        role="img"
        style={{
          display:         'inline-block',
          width:           '6px',
          height:          '6px',
          borderRadius:    'var(--radius-full)',
          backgroundColor: isConnected ? 'var(--semantic-success)' : 'var(--semantic-error)',
          flexShrink:      0,
        }}
      />
    </div>
  );
}
