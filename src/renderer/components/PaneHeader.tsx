/**
 * PaneHeader — 34px per-terminal-pane session info bar.
 *
 * Layout: [ProviderBadge] [session name] [working dir] [StatusDot + label]
 * Focused pane: surface-overlay bg.
 * Unfocused: surface-raised bg (dimmer).
 */
import { useState } from 'react';
import { TabData } from './ui/Tab';
import { ProviderBadge } from './ui/ProviderBadge';
import { StatusDot, StatusDotState } from './ui/StatusDot';
import { SessionStatus } from './ui/SessionStatusIndicator';
import { StatusPopover } from './ui/StatusPopover';

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

function sessionStatusToDot(status: SessionStatus): StatusDotState {
  if (status === 'error')         return 'error';
  if (status === 'warning')       return 'warning';
  if (status === 'initializing')  return 'running';
  if (status === 'ready')         return 'running';
  return 'idle';
}

function sessionStatusLabel(status: SessionStatus): string {
  if (status === 'initializing') return 'Starting';
  if (status === 'ready')        return 'Running';
  if (status === 'error')        return 'Error';
  if (status === 'warning')      return 'Warning';
  return 'Idle';
}

function sessionStatusColor(status: SessionStatus): string {
  if (status === 'ready')        return 'var(--semantic-success)';
  if (status === 'initializing') return 'var(--semantic-info)';
  if (status === 'warning')      return 'var(--semantic-warning)';
  if (status === 'error')        return 'var(--semantic-error)';
  return 'var(--text-tertiary)';
}

export function PaneHeader({
  sessionId,
  sessionName,
  workingDirectory,
  isFocused,
  availableSessions: _availableSessions,
  canSplit: _canSplit,
  sessionStatus = 'ready',
  worktreeBranch,
  providerId,
  onChangeSession: _onChangeSession,
  onClosePane: _onClosePane,
  onSplitHorizontal: _onSplitHorizontal,
  onSplitVertical: _onSplitVertical,
  onOpenBudget,
  onOpenHistory,
  onCreateCheckpoint,
}: PaneHeaderProps) {
  const [showStatusPopover, setShowStatusPopover] = useState(false);

  const dotState    = sessionStatusToDot(sessionStatus);
  const label       = sessionStatusLabel(sessionStatus);
  const labelColor  = sessionStatusColor(sessionStatus);
  const bg          = isFocused ? 'var(--surface-overlay)' : 'var(--surface-raised)';

  return (
    <div
      style={{
        height:          'var(--pane-header-height)',
        backgroundColor: bg,
        borderBottom:    '1px solid var(--border-default)',
        display:         'flex',
        alignItems:      'center',
        padding:         '0 var(--space-2)',
        gap:             'var(--space-2)',
        position:        'relative',
        zIndex:          'var(--z-base)' as any,
        flexShrink:      0,
        transition:      'background-color var(--duration-fast) var(--ease-inout)',
      }}
    >
      {/* Provider badge */}
      <ProviderBadge providerId={providerId} size="md" muted={!isFocused} />

      {/* Session name */}
      <span
        style={{
          fontSize:    'var(--text-sm)',
          fontFamily:  'var(--font-ui)',
          fontWeight:  'var(--weight-medium)' as any,
          color:       isFocused ? 'var(--text-primary)' : 'var(--text-secondary)',
          whiteSpace:  'nowrap',
          flexShrink:  0,
          transition:  'color var(--duration-fast) var(--ease-inout)',
        }}
      >
        {sessionName}
      </span>

      {/* Worktree badge */}
      {worktreeBranch && (
        <span
          title={`Worktree: ${worktreeBranch}`}
          style={{
            display:     'inline-flex',
            alignItems:  'center',
            gap:         '3px',
            color:       'var(--semantic-success)',
            fontSize:    'var(--text-xs)',
            fontFamily:  'var(--font-mono-ui)',
            flexShrink:  0,
            maxWidth:    '100px',
            overflow:    'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:  'nowrap',
          }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 01-9 9" />
          </svg>
          {worktreeBranch}
        </span>
      )}

      {/* Working directory */}
      <span
        style={{
          flex:         1,
          fontSize:     'var(--text-xs)',
          fontFamily:   'var(--font-mono-ui)',
          color:        isFocused ? 'var(--text-tertiary)' : 'var(--border-strong)',
          whiteSpace:   'nowrap',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          transition:   'color var(--duration-fast) var(--ease-inout)',
        }}
      >
        {workingDirectory}
      </span>

      {/* Session status dot + label */}
      <button
        onClick={() => setShowStatusPopover(true)}
        aria-label={`Session status: ${label}`}
        style={{
          display:         'inline-flex',
          alignItems:      'center',
          gap:             'var(--space-1)',
          background:      'transparent',
          border:          'none',
          cursor:          'pointer',
          padding:         '2px 4px',
          borderRadius:    'var(--radius-sm)',
          outline:         'none',
          flexShrink:      0,
        }}
      >
        <StatusDot status={dotState} size={6} />
        <span
          style={{
            fontSize:   'var(--text-xs)',
            fontFamily: 'var(--font-ui)',
            color:      labelColor,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      </button>

      {/* NOTE: Share button and kebab menu removed — LaunchTunnel integration needs fixing first */}

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

