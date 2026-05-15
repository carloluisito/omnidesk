/**
 * StatusBar — 24px app-wide status strip at bottom.
 *
 * V1 Sections (left-to-right):
 * 1. Provider indicator: colored dot + provider name
 * 2. Model name (clickable → model switcher)
 * 3. Git branch (clickable → Git panel)
 * 4. Git delta: +n -n ~n in semantic colors
 * 5. Token count for active session
 * 6. Mini budget bar (64px inline)
 * 7. Budget %
 * 8. Connectivity dot (rightmost)
 *
 * V2 (Phase 2 · 01 spec):
 * Flat row → pill row using StatusPill from item #5.
 * Each pill is a click-target opening the relevant side panel.
 * Pills: provider+model | branch+delta | tokens | budget | connectivity
 *
 * Font: text-2xs, font-mono-ui. Dividers between sections.
 */
import type { ProviderId } from '../../shared/types/provider-types';
import type { GitStatus } from '../../shared/types/git-types';
import type { ClaudeUsageQuota } from '../../shared/ipc-types';
import { StatusPill } from './ui/StatusPill';

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

// ─────────────────────────────────────────────
// V2 StatusBar
// ─────────────────────────────────────────────
function V2StatusBar({
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
  const providerName = getProviderName(providerId as string | undefined);
  const budgetPct    = quotaData
    ? Math.round((quotaData.five_hour?.utilization ?? 0) * 100)
    : 0;

  // Connectivity: live = connected, offline = disconnected
  const connVariant = isConnected ? 'live' : 'offline';
  const connPulse   = isConnected; // pulse the dot when connected

  // Budget severity
  const budgetVariant = budgetPct >= 80 ? 'errored' : budgetPct >= 60 ? 'awaiting' : 'live';

  return (
    <div
      role="status"
      aria-label="Session status bar"
      style={{
        height:          'var(--status-bar-height)',
        display:         'flex',
        alignItems:      'center',
        gap:             '4px',
        paddingLeft:     'var(--space-3)',
        paddingRight:    'var(--space-3)',
        backgroundColor: 'var(--v2-surface-base)',
        borderTop:       `1px solid var(--v2-border-subtle)`,
        flexShrink:      0,
        overflow:        'hidden',
      }}
    >
      {/* 1. Provider + model pill */}
      <StatusPill
        variant="info"
        label={modelName ? `${providerName} · ${modelName}` : providerName}
        onClick={onModelClick}
      />

      {/* 2. Git branch pill */}
      {gitStatus?.branch && (
        <StatusPill
          variant="done"
          label={gitStatus.branch}
          onClick={onGitClick}
        />
      )}

      {/* 3. Git delta pills */}
      {gitStatus && (gitStatus.ahead || gitStatus.behind || (gitStatus as any).modified) && (
        <>
          {(gitStatus.ahead ?? 0) > 0 && (
            <StatusPill variant="success" label={`+${gitStatus.ahead}`} onClick={onGitClick} />
          )}
          {(gitStatus.behind ?? 0) > 0 && (
            <StatusPill variant="errored" label={`-${gitStatus.behind}`} onClick={onGitClick} />
          )}
          {((gitStatus as any).modified ?? 0) > 0 && (
            <StatusPill variant="awaiting" label={`~${(gitStatus as any).modified}`} onClick={onGitClick} />
          )}
        </>
      )}

      {/* 4. Token count pill */}
      {tokenCount != null && (
        <StatusPill
          variant="offline"
          label={`${formatTokens(tokenCount)} tok`}
        />
      )}

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      {/* 5. Budget pill */}
      {quotaData && (
        <StatusPill
          variant={budgetVariant}
          label={`${budgetPct}%`}
          pulse={budgetPct >= 80}
          onClick={onBudgetClick}
        />
      )}

      {/* 6. Connectivity pill */}
      <StatusPill
        variant={connVariant}
        label={isConnected ? 'online' : 'offline'}
        pulse={connPulse}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Main export — dispatcher
// ─────────────────────────────────────────────
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
  return (
    <V2StatusBar
      providerId={providerId}
      modelName={modelName}
      gitStatus={gitStatus}
      tokenCount={tokenCount}
      quotaData={quotaData}
      isConnected={isConnected}
      onModelClick={onModelClick}
      onGitClick={onGitClick}
      onBudgetClick={onBudgetClick}
    />
  );
}
