/**
 * TabBar — 38px height session tab strip.
 *
 * [+] new session button (left) | scrollable tabs | [⋯ overflow] | right controls
 * Active tab: surface-raised bg, top accent border.
 * Inactive: transparent.
 */
import { useState, useRef, useEffect } from 'react';
import { Tab, TabData } from './Tab';
import { NewSessionDialog } from './NewSessionDialog';
import { ContextMenu, ContextMenuPosition } from './ContextMenu';
import { LayoutGrid } from 'lucide-react';

import { Workspace } from '../../../shared/ipc-types';

interface TabBarProps {
  sessions:                    TabData[];
  activeSessionId:             string | null;
  onSelectSession:             (id: string) => void;
  onCloseSession:              (id: string) => void;
  onCreateSession:             (name: string, workingDirectory: string, permissionMode: 'standard' | 'skip-permissions', worktree?: import('../../../shared/types/git-types').WorktreeCreateRequest, providerId?: import('../../../shared/types/provider-types').ProviderId) => void;
  onRenameSession:             (id: string, name: string) => void;
  onRestartSession:            (id: string) => void;
  onDuplicateSession:          (id: string) => void;
  isDialogOpen?:               boolean;
  onDialogOpenChange?:         (open: boolean) => void;
  workspaces?:                 Workspace[];
  onOpenSettings?:             () => void;
  onOpenHistory?:              () => void;
  onOpenCheckpoints?:          () => void;
  onCreateCheckpoint?:         () => void;
  onOpenAtlas?:                () => void;
  onOpenHelp?:                 () => void;
  onOpenLayoutPicker?:         () => void;
  onOpenTeams?:                () => void;
  onOpenGit?:                  () => void;
  onOpenWorktrees?:            () => void;
  onOpenPlaybooks?:            () => void;
  onOpenTunnels?:              () => void;
  teamCount?:                  number;
  gitStagedCount?:             number;
  activeTunnelCount?:          number;
  visibleSessionIds?:          string[];
  focusedSessionId?:           string | null;
  onFocusPaneWithSession?:     (sessionId: string) => void;
  onAssignSessionToFocusedPane?: (sessionId: string) => void;
  paneCount?:                  number;
  onSplitSession?:             (sessionId: string, direction: 'horizontal' | 'vertical') => void;
  onShareSession?:             (sessionId: string) => void;
  onStopSharing?:              (sessionId: string) => void;
  sharedSessionIds?:           string[];
}

export function TabBar({
  sessions,
  activeSessionId,
  onSelectSession,
  onCloseSession,
  onCreateSession,
  onRenameSession,
  onRestartSession,
  onDuplicateSession,
  isDialogOpen: externalDialogOpen,
  onDialogOpenChange,
  workspaces = [],
  onOpenHistory: _onOpenHistory,
  onOpenCheckpoints,
  onCreateCheckpoint,
  onOpenHelp,
  onOpenLayoutPicker,
  visibleSessionIds = [],
  focusedSessionId = null,
  onFocusPaneWithSession,
  onAssignSessionToFocusedPane,
  paneCount = 1,
  onSplitSession,
  onShareSession,
  onStopSharing,
  sharedSessionIds = [],
}: TabBarProps) {
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  const [checkpointCounts, setCheckpointCounts]     = useState<Record<string, number>>({});
  const [showOverflow, setShowOverflow]              = useState(false);
  const [canScrollLeft, setCanScrollLeft]            = useState(false);
  const [canScrollRight, setCanScrollRight]          = useState(false);
  const [contextMenu, setContextMenu]                = useState<{ sessionId: string; position: ContextMenuPosition } | null>(null);
  const [editingTabId, setEditingTabId]              = useState<string | null>(null);

  const isSplitActive    = paneCount > 1;
  const isDialogOpen     = externalDialogOpen ?? internalDialogOpen;
  const setIsDialogOpen  = (open: boolean) => {
    if (onDialogOpenChange) onDialogOpenChange(open);
    else setInternalDialogOpen(open);
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const overflowRef        = useRef<HTMLDivElement>(null);

  const checkScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [sessions]);

  // Load checkpoint counts
  useEffect(() => {
    if (!sessions.length) return;
    (async () => {
      const counts: Record<string, number> = {};
      for (const session of sessions) {
        try { counts[session.id] = await window.electronAPI.getCheckpointCount(session.id); }
        catch { counts[session.id] = 0; }
      }
      setCheckpointCounts(counts);
    })();
  }, [sessions]);

  useEffect(() => {
    const onCreated = async (cp: any) => {
      setCheckpointCounts(prev => ({ ...prev, [cp.sessionId]: (prev[cp.sessionId] || 0) + 1 }));
    };
    const onDeleted = async () => {
      const counts: Record<string, number> = {};
      for (const s of sessions) {
        try { counts[s.id] = await window.electronAPI.getCheckpointCount(s.id); }
        catch { counts[s.id] = 0; }
      }
      setCheckpointCounts(counts);
    };
    const unsubC = window.electronAPI.onCheckpointCreated(onCreated);
    const unsubD = window.electronAPI.onCheckpointDeleted(onDeleted);
    return () => { unsubC(); unsubD(); };
  }, [sessions]);

  // Close overflow on outside click
  useEffect(() => {
    if (!showOverflow) return;
    const handleClick = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showOverflow]);

  const handleContextMenu = (sessionId: string, position: ContextMenuPosition) => {
    setContextMenu({ sessionId, position });
  };

  const handleContextAction = (action: string) => {
    if (!contextMenu) return;
    const { sessionId } = contextMenu;
    switch (action) {
      case 'rename':        setEditingTabId(sessionId); break;
      case 'duplicate':     onDuplicateSession(sessionId); break;
      case 'createCheckpoint':
        onSelectSession(sessionId);
        onCreateCheckpoint?.();
        break;
      case 'viewCheckpoints':
        onSelectSession(sessionId);
        onOpenCheckpoints?.();
        break;
      case 'revealInExplorer':
        window.electronAPI.revealInExplorer(sessionId);
        break;
      case 'restart':    onRestartSession(sessionId); break;
      case 'splitRight':    onSplitSession?.(sessionId, 'horizontal'); break;
      case 'splitDown':     onSplitSession?.(sessionId, 'vertical'); break;
      case 'shareSession':  onShareSession?.(sessionId); break;
      case 'stopSharing':   onStopSharing?.(sessionId); break;
      case 'close':         onCloseSession(sessionId); break;
      case 'closeOthers':
        sessions.forEach(s => { if (s.id !== sessionId) onCloseSession(s.id); });
        break;
      case 'closeRight': {
        const idx = sessions.findIndex(s => s.id === sessionId);
        sessions.slice(idx + 1).forEach(s => onCloseSession(s.id));
        break;
      }
    }
    setContextMenu(null);
  };

  const handleRename = (id: string, name: string) => {
    onRenameSession(id, name);
    setEditingTabId(null);
  };

  const contextSession      = contextMenu ? sessions.find(s => s.id === contextMenu.sessionId) : null;
  const contextSessionIndex = contextMenu ? sessions.findIndex(s => s.id === contextMenu.sessionId) : -1;

  return (
    <>
      <div
        role="tablist"
        aria-label="Sessions"
        style={{
          height:          'var(--tab-bar-height)',
          backgroundColor: 'var(--surface-base)',
          borderBottom:    '1px solid var(--border-subtle)',
          display:         'flex',
          alignItems:      'center',
          position:        'relative',
          userSelect:      'none',
          flexShrink:      0,
        }}
      >
        {/* New session button */}
        <button
          onClick={() => setIsDialogOpen(true)}
          title="New session (Ctrl+T)"
          aria-label="New session"
          style={{
            width:           '32px',
            height:          '28px',
            marginLeft:      'var(--space-1)',
            marginRight:     'var(--space-1)',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            background:      'transparent',
            border:          '1px solid transparent',
            borderRadius:    'var(--radius-sm)',
            color:           'var(--text-tertiary)',
            cursor:          'pointer',
            flexShrink:      0,
            transition:      'color var(--duration-fast) var(--ease-inout), background-color var(--duration-fast) var(--ease-inout)',
            outline:         'none',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--state-hover)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M6.5 1v11M1 6.5h11" strokeLinecap="round" />
          </svg>
        </button>

        {/* Scroll fade left */}
        {canScrollLeft && (
          <div
            aria-hidden="true"
            style={{
              position:        'absolute',
              left:            '42px',
              top:             0,
              bottom:          0,
              width:           '24px',
              background:      'linear-gradient(to right, var(--surface-base), transparent)',
              pointerEvents:   'none',
              zIndex:          1,
            }}
          />
        )}

        {/* Tabs scroll container */}
        <div
          ref={scrollContainerRef}
          onScroll={checkScroll}
          role="presentation"
          style={{
            flex:        1,
            overflowX:   'auto',
            overflowY:   'hidden',
            scrollbarWidth: 'none',
            display:     'flex',
            alignItems:  'flex-end',
            height:      '100%',
          }}
        >
          <div
            style={{
              display:     'flex',
              alignItems:  'flex-end',
              height:      '100%',
              paddingLeft: 'var(--space-1)',
              gap:         '2px',
            }}
          >
            {sessions.map((session, index) => {
              let visibilityState: 'focused' | 'visible' | 'hidden' = 'hidden';
              if (isSplitActive && visibleSessionIds.includes(session.id)) {
                visibilityState = session.id === focusedSessionId ? 'focused' : 'visible';
              }

              const handleTabSelect = () => {
                if (isSplitActive && onFocusPaneWithSession && onAssignSessionToFocusedPane) {
                  if (visibleSessionIds.includes(session.id)) {
                    onFocusPaneWithSession(session.id);
                  } else {
                    onAssignSessionToFocusedPane(session.id);
                  }
                } else {
                  onSelectSession(session.id);
                }
              };

              return (
                <Tab
                  key={session.id}
                  data={session}
                  isActive={session.id === activeSessionId}
                  isEditing={session.id === editingTabId}
                  index={index}
                  onSelect={handleTabSelect}
                  onClose={() => onCloseSession(session.id)}
                  onContextMenu={(pos) => handleContextMenu(session.id, pos)}
                  onRename={(name) => handleRename(session.id, name)}
                  onCancelEdit={() => setEditingTabId(null)}
                  visibilityState={visibilityState}
                  checkpointCount={checkpointCounts[session.id] || 0}
                />
              );
            })}
          </div>
        </div>

        {/* Scroll fade right */}
        {canScrollRight && (
          <div
            aria-hidden="true"
            style={{
              position:      'absolute',
              right:         '120px',
              top:           0,
              bottom:        0,
              width:         '24px',
              background:    'linear-gradient(to left, var(--surface-base), transparent)',
              pointerEvents: 'none',
              zIndex:        1,
            }}
          />
        )}

        {/* Overflow button */}
        {canScrollRight && (
          <div ref={overflowRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setShowOverflow(!showOverflow)}
              title="More sessions"
              aria-label="More sessions"
              aria-haspopup="listbox"
              aria-expanded={showOverflow}
              style={{
                width:           '28px',
                height:          '28px',
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                background:      showOverflow ? 'var(--state-active)' : 'transparent',
                border:          '1px solid transparent',
                borderRadius:    'var(--radius-sm)',
                color:           'var(--text-tertiary)',
                cursor:          'pointer',
                fontSize:        'var(--text-sm)',
                fontFamily:      'var(--font-ui)',
                transition:      'color var(--duration-fast) var(--ease-inout)',
                outline:         'none',
                marginRight:     'var(--space-1)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <circle cx="2.5" cy="7" r="1.5" />
                <circle cx="7" cy="7" r="1.5" />
                <circle cx="11.5" cy="7" r="1.5" />
              </svg>
            </button>

            {/* Overflow dropdown */}
            {showOverflow && (
              <div
                role="listbox"
                aria-label="All sessions"
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
                  maxHeight:       '300px',
                  overflowY:       'auto',
                  paddingTop:      'var(--space-1)',
                  paddingBottom:   'var(--space-1)',
                }}
              >
                {sessions.map(session => (
                  <button
                    key={session.id}
                    role="option"
                    aria-selected={session.id === activeSessionId}
                    onClick={() => { onSelectSession(session.id); setShowOverflow(false); }}
                    style={{
                      display:         'flex',
                      alignItems:      'center',
                      gap:             'var(--space-2)',
                      width:           '100%',
                      padding:         '6px var(--space-3)',
                      background:      session.id === activeSessionId ? 'var(--accent-primary-muted)' : 'transparent',
                      border:          'none',
                      cursor:          'pointer',
                      color:           session.id === activeSessionId ? 'var(--text-accent)' : 'var(--text-secondary)',
                      fontSize:        'var(--text-sm)',
                      fontFamily:      'var(--font-ui)',
                      textAlign:       'left',
                      transition:      'background-color var(--duration-fast) var(--ease-inout)',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--state-hover)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = session.id === activeSessionId ? 'var(--accent-primary-muted)' : 'transparent'; }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {session.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}


        {/* Layout picker button */}
        {onOpenLayoutPicker && (
          <button
            onClick={onOpenLayoutPicker}
            title="Layout picker"
            aria-label="Layout picker"
            style={{
              width:           '28px',
              height:          '28px',
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              background:      'transparent',
              border:          '1px solid transparent',
              borderRadius:    'var(--radius-sm)',
              color:           'var(--text-tertiary)',
              cursor:          'pointer',
              marginRight:     'var(--space-1)',
              flexShrink:      0,
              outline:         'none',
              transition:      'color var(--duration-fast) var(--ease-inout)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--state-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
          >
            <LayoutGrid size={15} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}

        {/* Help button */}
        {onOpenHelp && (
          <button
            onClick={onOpenHelp}
            title="Help & Shortcuts"
            aria-label="Help & Shortcuts"
            style={{
              width:           '28px',
              height:          '28px',
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              background:      'transparent',
              border:          '1px solid transparent',
              borderRadius:    'var(--radius-sm)',
              color:           'var(--text-tertiary)',
              cursor:          'pointer',
              marginRight:     'var(--space-1)',
              flexShrink:      0,
              outline:         'none',
              transition:      'color var(--duration-fast) var(--ease-inout)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <circle cx="7.5" cy="7.5" r="6.5" />
              <path d="M5.5 5.5a2 2 0 014 .667c0 1.333-2 2-2 2" strokeLinecap="round" />
              <circle cx="7.5" cy="10.5" r="0.5" fill="currentColor" stroke="none" />
            </svg>
          </button>
        )}
      </div>

      {/* New Session Dialog */}
      <NewSessionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSubmit={onCreateSession}
        sessionCount={sessions.length}
        workspaces={workspaces}
      />

      {/* Context Menu */}
      {contextMenu && contextSession && (
        <ContextMenu
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
          isExited={contextSession.status === 'exited'}
          isOnlyTab={sessions.length === 1}
          isRightmost={contextSessionIndex === sessions.length - 1}
          canSplit={paneCount < 4}
          isShared={sharedSessionIds.includes(contextMenu.sessionId)}
          canShare={!!onShareSession && contextSession.status !== 'exited'}
        />
      )}

      <style>{`
        [role="tablist"] [role="tab"]:focus-visible {
          outline: 2px solid var(--state-focus);
          outline-offset: 1px;
          border-radius: var(--radius-sm);
        }
      `}</style>
    </>
  );
}
