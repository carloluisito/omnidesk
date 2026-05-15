/**
 * PaneHeader — 34px (v1) / 36px (v2) per-terminal-pane session info bar.
 *
 * V1 Layout: [ProviderBadge] [session name] [working dir] [StatusDot + label]
 * V2 Layout (Phase 2 · 02 spec):
 *   [Provider chip] [mode chip] [branch chip] | → [StatusPill] [split] [fullscreen] [close]
 *
 *
 * V2 status mapping (6 variants from spec):
 *   ready        → live      (pulse)
 *   initializing → thinking  (pulse)
 *   warning      → awaiting
 *   error        → errored
 *   exited       → done
 *   offline/null → offline
 */
import { useState } from 'react';
import { TabData } from './ui/Tab';
import { ProviderBadge } from './ui/ProviderBadge';
import { SessionStatus } from './ui/SessionStatusIndicator';
import { StatusPopover } from './ui/StatusPopover';
import { StatusPill, StatusPillVariant } from './ui/StatusPill';
import { Tooltip } from './ui/Tooltip';
import type { LaunchMode } from '../../shared/ipc-types';

interface PaneHeaderProps {
  sessionId:          string;
  sessionName:        string;
  workingDirectory:   string;
  isFocused:          boolean;
  availableSessions:  TabData[];
  canSplit:           boolean;
  sessionStatus?:     SessionStatus;
  worktreeBranch?:    string | null;
  providerId?:        string;
  launchMode?:        LaunchMode;
  onChangeSession:    (sessionId: string) => void;
  onClosePane:        () => void;
  onSplitHorizontal:  () => void;
  onSplitVertical:    () => void;
  onOpenBudget?:      () => void;
  onOpenHistory?:     () => void;
  onCreateCheckpoint?: () => void;
  // NOTE: Sharing/LaunchTunnel props — commented out until LaunchTunnel integration is fixed
  // isShared?:          boolean;
  // observerCount?:     number;
  // onShareSession?:    () => void;
  // onStopSharing?:     () => void;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function sessionStatusToV2Pill(status: SessionStatus): { variant: StatusPillVariant; label: string; pulse: boolean } {
  switch (status) {
    case 'ready':        return { variant: 'live',     label: 'live',          pulse: true  };
    case 'initializing': return { variant: 'thinking', label: 'thinking',      pulse: true  };
    case 'warning':      return { variant: 'awaiting', label: 'awaiting input', pulse: false };
    case 'error':        return { variant: 'errored',  label: 'errored',       pulse: false };
    default:             return { variant: 'offline',  label: 'offline',       pulse: false };
  }
}

const LAUNCH_MODE_STYLE: Record<LaunchMode, { label: string; color: string; bg: string }> = {
  'default':            { label: 'default',         color: 'var(--v2-accent)',   bg: 'rgba(0,201,167,.14)' },
  'bypass-permissions': { label: 'bypass',           color: 'var(--v2-error)',    bg: 'rgba(247,103,142,.14)' },
  'agents':             { label: 'agents',           color: 'var(--v2-info)',     bg: 'rgba(124,143,255,.14)' },
  'continue':           { label: 'resumed',          color: 'var(--v2-accent)',   bg: 'rgba(0,201,167,.14)' },
};

function ChipV2({
  label,
  color,
  bg,
  icon,
  onClick,
}: {
  label: string;
  color?: string;
  bg?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  const style: React.CSSProperties = {
    display:        'inline-flex',
    alignItems:     'center',
    gap:            '3px',
    backgroundColor: bg ?? 'var(--v2-surface-high)',
    color:          color ?? 'var(--v2-text-secondary)',
    fontFamily:     'var(--font-mono-ui)',
    fontSize:       '11px',
    padding:        '1px 6px',
    borderRadius:   'var(--radius-sm)',
    whiteSpace:     'nowrap' as const,
    flexShrink:     0,
    cursor:         onClick ? 'pointer' : 'default',
    border:         'none',
    outline:        'none',
    transition:     `background-color var(--v2-duration-120) var(--v2-ease-out)`,
  };

  if (onClick) {
    return (
      <button
        type="button"
        style={style}
        onClick={onClick}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--v2-surface-overlay)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = bg ?? 'var(--v2-surface-high)'; }}
      >
        {icon}{label}
      </button>
    );
  }
  return <span style={style}>{icon}{label}</span>;
}

function ControlBtn({
  icon,
  label,
  onClick,
  isActive = false,
  shortcut,
}: {
  icon:      React.ReactNode;
  label:     string;
  onClick?:  () => void;
  isActive?: boolean;
  /** Optional keyboard shortcut shown in the hover tooltip (Wave 03 #16). */
  shortcut?: string;
}) {
  const btn = (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="anim-lift"
      style={{
        width:           '24px',
        height:          '24px',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        background:      isActive ? 'var(--v2-surface-high)' : 'transparent',
        color:           isActive ? 'var(--v2-accent)' : 'var(--v2-text-secondary)',
        border:          'none',
        borderRadius:    'var(--radius-sm)',
        cursor:          'pointer',
        outline:         'none',
        flexShrink:      0,
        padding:         0,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--v2-surface-high)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = isActive ? 'var(--v2-surface-high)' : 'transparent'; }}
    >
      {icon}
    </button>
  );
  return (
    <Tooltip content={label} shortcut={shortcut} placement="bottom" delay={400}>
      {btn}
    </Tooltip>
  );
}

// ─────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────
export function PaneHeader({
  sessionId,
  sessionName,
  workingDirectory: _workingDirectory,
  isFocused,
  availableSessions: _availableSessions,
  canSplit: _canSplit,
  sessionStatus = 'ready',
  worktreeBranch,
  providerId,
  launchMode,
  onChangeSession: _onChangeSession,
  onClosePane,
  onSplitHorizontal,
  onSplitVertical: _onSplitVertical,
  onOpenBudget,
  onOpenHistory,
  onCreateCheckpoint,
}: PaneHeaderProps) {
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  {
    const pill         = sessionStatusToV2Pill(sessionStatus);
    const modeStyle    = LAUNCH_MODE_STYLE[launchMode ?? 'default'];
    const branch       = worktreeBranch ?? null;

    return (
      <div
        style={{
          height:          '36px',
          backgroundColor: 'var(--v2-surface-mid)',
          display:         'flex',
          alignItems:      'center',
          padding:         '0 10px',
          gap:             '8px',
          position:        'relative',
          zIndex:          'var(--z-base)' as any,
          flexShrink:      0,
          // No bottom border — elevation contrast carries structure
        }}
      >
        {/* 1. Provider chip */}
        <ProviderBadge providerId={providerId} size="md" muted={!isFocused} />

        {/* 2. Session name */}
        <span
          style={{
            fontSize:    '13px',
            fontFamily:  'var(--font-ui)',
            fontWeight:  500,
            color:       isFocused ? 'var(--v2-text-primary)' : 'var(--v2-text-secondary)',
            whiteSpace:  'nowrap',
            flexShrink:  0,
            maxWidth:    '160px',
            overflow:    'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {sessionName}
        </span>

        {/* Thin divider */}
        <span
          aria-hidden="true"
          style={{
            width:           '1px',
            height:          '14px',
            backgroundColor: 'var(--v2-border-subtle)',
            flexShrink:      0,
          }}
        />

        {/* 3. Launch mode chip */}
        <ChipV2
          label={modeStyle.label}
          color={modeStyle.color}
          bg={modeStyle.bg}
        />

        {/* 4. Branch chip */}
        {branch && (
          <ChipV2
            label={branch}
            icon={
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 01-9 9" />
              </svg>
            }
          />
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* 5. Status chip (StatusPill) */}
        <StatusPill
          variant={pill.variant}
          label={pill.label}
          pulse={pill.pulse}
          onClick={() => setShowStatusPopover(true)}
        />

        {/* 6. Controls: split, fullscreen, close */}
        <ControlBtn
          label="Split pane horizontally"
          shortcut="⌘D"
          onClick={onSplitHorizontal}
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="12" y1="3" x2="12" y2="21" />
            </svg>
          }
        />
        <ControlBtn
          label="Working directory"
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
            </svg>
          }
          onClick={() => { /* fullscreen — Wave 05 */ }}
        />
        <ControlBtn
          label="Close pane"
          onClick={onClosePane}
          icon={
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M2 2l9 9M11 2l-9 9" strokeLinecap="round" />
            </svg>
          }
        />

        {/* Status popover (shared with v1) */}
        <StatusPopover
          sessionId={sessionId}
          sessionName={sessionName}
          status={sessionStatus}
          isOpen={showStatusPopover}
          onClose={() => setShowStatusPopover(false)}
          onOpenBudget={onOpenBudget}
          onOpenHistory={onOpenHistory}
          onCreateCheckpoint={onCreateCheckpoint}
        />
      </div>
    );
  }

}
