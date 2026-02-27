/**
 * PaneHeader — 34px per-terminal-pane session info bar.
 *
 * Layout: [ProviderBadge] [session name] [working dir] [StatusDot + label] [share btn] [kebab menu]
 * Focused pane: surface-overlay bg.
 * Unfocused: surface-raised bg (dimmer).
 */
import { useState, useCallback, useRef, useEffect } from 'react';
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
  // Sharing
  isShared?:          boolean;
  observerCount?:     number;
  onShareSession?:    () => void;
  onStopSharing?:     () => void;
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
  availableSessions,
  canSplit,
  sessionStatus = 'ready',
  worktreeBranch,
  providerId,
  onChangeSession,
  onClosePane,
  onSplitHorizontal,
  onSplitVertical,
  onOpenBudget,
  onOpenHistory,
  onCreateCheckpoint,
  isShared = false,
  observerCount = 0,
  onShareSession,
  onStopSharing,
}: PaneHeaderProps) {
  const [showDropdown, setShowDropdown]       = useState(false);
  const [showKebab, setShowKebab]             = useState(false);
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const kebabRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown && !showKebab) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
        setShowKebab(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown, showKebab]);

  const handleSessionSelect = useCallback((id: string) => {
    setShowDropdown(false);
    onChangeSession(id);
  }, [onChangeSession]);

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
          color:        isFocused ? 'var(--text-tertiary)' : '#3D4163',
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

      {/* Share button — visible when session is running */}
      {(onShareSession || onStopSharing) && sessionStatus === 'ready' && (
        <button
          onClick={isShared ? onStopSharing : onShareSession}
          aria-label={isShared ? `Stop sharing (${observerCount} observer${observerCount !== 1 ? 's' : ''})` : 'Share session'}
          title={isShared ? 'Stop sharing' : 'Share this session'}
          style={{
            display:         'inline-flex',
            alignItems:      'center',
            gap:             '4px',
            height:          '22px',
            padding:         '0 7px',
            background:      isShared ? 'rgba(0,201,167,0.12)' : 'transparent',
            border:          isShared ? '1px solid rgba(0,201,167,0.3)' : '1px solid transparent',
            borderRadius:    'var(--radius-sm)',
            cursor:          'pointer',
            color:           isShared ? '#00C9A7' : 'var(--text-tertiary)',
            fontSize:        'var(--text-xs)',
            fontFamily:      'var(--font-ui)',
            flexShrink:      0,
            transition:      'all var(--duration-fast) var(--ease-inout)',
          }}
          onMouseEnter={(e) => {
            if (!isShared) {
              e.currentTarget.style.color = '#00C9A7';
              e.currentTarget.style.border = '1px solid rgba(0,201,167,0.25)';
              e.currentTarget.style.background = 'rgba(0,201,167,0.08)';
            } else {
              e.currentTarget.style.background = 'rgba(247,103,142,0.10)';
              e.currentTarget.style.borderColor = 'rgba(247,103,142,0.35)';
              e.currentTarget.style.color = 'var(--semantic-error)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isShared ? 'rgba(0,201,167,0.12)' : 'transparent';
            e.currentTarget.style.border     = isShared ? '1px solid rgba(0,201,167,0.3)' : '1px solid transparent';
            e.currentTarget.style.color      = isShared ? '#00C9A7' : 'var(--text-tertiary)';
          }}
        >
          {/* Share icon */}
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <circle cx="9.5"  cy="2"   r="1.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <circle cx="9.5"  cy="10"  r="1.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <circle cx="2.5"  cy="6"   r="1.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <line x1="3.85" y1="5.3"  x2="8.2"  y2="2.7"  stroke="currentColor" strokeWidth="1.1" />
            <line x1="3.85" y1="6.7"  x2="8.2"  y2="9.3"  stroke="currentColor" strokeWidth="1.1" />
          </svg>
          {isShared && (
            <span>{observerCount}</span>
          )}
        </button>
      )}

      {/* Kebab menu / pane actions */}
      <div ref={kebabRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setShowKebab(!showKebab)}
          aria-label="Pane options"
          aria-haspopup="menu"
          aria-expanded={showKebab}
          style={{
            width:           '26px',
            height:          '26px',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            background:      showKebab ? 'var(--state-active)' : 'transparent',
            border:          'none',
            borderRadius:    'var(--radius-sm)',
            cursor:          'pointer',
            color:           'var(--text-tertiary)',
            transition:      'color var(--duration-fast) var(--ease-inout), background-color var(--duration-fast) var(--ease-inout)',
            outline:         'none',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--state-hover)';
          }}
          onMouseLeave={(e) => {
            if (!showKebab) {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <circle cx="7" cy="2.5" r="1.2" />
            <circle cx="7" cy="7"   r="1.2" />
            <circle cx="7" cy="11.5" r="1.2" />
          </svg>
        </button>

        {showKebab && (
          <div
            role="menu"
            aria-label="Pane options"
            style={{
              position:        'absolute',
              top:             'calc(100% + 4px)',
              right:           0,
              backgroundColor: 'var(--surface-high)',
              border:          '1px solid var(--border-default)',
              borderRadius:    'var(--radius-md)',
              boxShadow:       'var(--shadow-md)',
              zIndex:          'var(--z-dropdown)' as any,
              minWidth:        '180px',
              paddingTop:      'var(--space-1)',
              paddingBottom:   'var(--space-1)',
              animation:       'slide-up var(--duration-fast) var(--ease-out) both',
            }}
          >
            {/* Session picker */}
            <div style={{ position: 'relative' }}>
              <button
                role="menuitem"
                onClick={() => { setShowKebab(false); setShowDropdown(!showDropdown); }}
                style={menuItemStyle}
                onMouseEnter={menuItemHover}
                onMouseLeave={menuItemLeave}
              >
                Change session
              </button>
            </div>

            {/* Split actions */}
            {canSplit && (
              <>
                <button
                  role="menuitem"
                  onClick={() => { setShowKebab(false); onSplitHorizontal(); }}
                  style={menuItemStyle}
                  onMouseEnter={menuItemHover}
                  onMouseLeave={menuItemLeave}
                >
                  Split left / right
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setShowKebab(false); onSplitVertical(); }}
                  style={menuItemStyle}
                  onMouseEnter={menuItemHover}
                  onMouseLeave={menuItemLeave}
                >
                  Split top / bottom
                </button>
              </>
            )}

            {/* Create checkpoint */}
            {onCreateCheckpoint && (
              <button
                role="menuitem"
                onClick={() => { setShowKebab(false); onCreateCheckpoint(); }}
                style={menuItemStyle}
                onMouseEnter={menuItemHover}
                onMouseLeave={menuItemLeave}
              >
                New checkpoint
              </button>
            )}

            {/* Share session */}
            {sessionStatus === 'ready' && onShareSession && !isShared && (
              <button
                role="menuitem"
                onClick={() => { setShowKebab(false); onShareSession(); }}
                style={menuItemStyle}
                onMouseEnter={menuItemHover}
                onMouseLeave={menuItemLeave}
              >
                Share session...
              </button>
            )}
            {sessionStatus === 'ready' && onStopSharing && isShared && (
              <button
                role="menuitem"
                onClick={() => { setShowKebab(false); onStopSharing(); }}
                style={{ ...menuItemStyle, color: 'var(--semantic-error)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--semantic-error-muted)'; }}
                onMouseLeave={menuItemLeave}
              >
                Stop sharing
              </button>
            )}

            {/* Divider */}
            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />

            {/* Close pane */}
            <button
              role="menuitem"
              onClick={() => { setShowKebab(false); onClosePane(); }}
              style={{ ...menuItemStyle, color: 'var(--semantic-error)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--semantic-error-muted)'; }}
              onMouseLeave={menuItemLeave}
            >
              Close pane
            </button>
          </div>
        )}
      </div>

      {/* Session picker dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          style={{
            position:        'absolute',
            top:             'calc(100% + 2px)',
            right:           'var(--space-2)',
            backgroundColor: 'var(--surface-high)',
            border:          '1px solid var(--border-default)',
            borderRadius:    'var(--radius-md)',
            minWidth:        '260px',
            maxWidth:        '400px',
            maxHeight:       '300px',
            overflowY:       'auto',
            boxShadow:       'var(--shadow-md)',
            zIndex:          'var(--z-dropdown)' as any,
            paddingTop:      'var(--space-1)',
            paddingBottom:   'var(--space-1)',
          }}
        >
          {availableSessions.length === 0 ? (
            <div style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)', fontStyle: 'italic' }}>
              No other sessions
            </div>
          ) : (
            availableSessions.map(session => (
              <button
                key={session.id}
                onClick={() => handleSessionSelect(session.id)}
                style={{
                  display:        'flex',
                  flexDirection:  'column',
                  gap:            '2px',
                  width:          '100%',
                  padding:        '6px var(--space-3)',
                  background:     'transparent',
                  border:         'none',
                  cursor:         'pointer',
                  textAlign:      'left',
                  borderBottom:   '1px solid var(--border-subtle)',
                  transition:     'background-color var(--duration-fast) var(--ease-inout)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--state-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
              >
                <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)', color: 'var(--text-primary)', fontWeight: 'var(--weight-medium)' as any }}>
                  {session.name}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono-ui)', color: 'var(--text-tertiary)' }}>
                  {session.workingDirectory}
                </span>
              </button>
            ))
          )}
        </div>
      )}

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

const menuItemStyle: React.CSSProperties = {
  display:         'block',
  width:           '100%',
  padding:         '6px var(--space-3)',
  background:      'transparent',
  border:          'none',
  cursor:          'pointer',
  textAlign:       'left',
  fontSize:        'var(--text-sm)',
  fontFamily:      'var(--font-ui)',
  color:           'var(--text-secondary)',
  transition:      'background-color var(--duration-fast) var(--ease-inout), color var(--duration-fast) var(--ease-inout)',
  outline:         'none',
};

const menuItemHover = (e: React.MouseEvent) => {
  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--state-hover)';
  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
};

const menuItemLeave = (e: React.MouseEvent) => {
  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
};
