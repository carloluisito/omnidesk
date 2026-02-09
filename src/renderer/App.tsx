import { useState, useEffect, useCallback } from 'react';
import { MultiTerminal } from './components/Terminal';
import {
  TabBar,
  EmptyState,
  ConfirmDialog,
  CheckpointDialog,
  SettingsDialog,
  BudgetPanel,
  TabData,
} from './components/ui';
import { CommandPalette } from './components/CommandPalette';
import { HistoryPanel } from './components/HistoryPanel';
import { CheckpointPanel } from './components/CheckpointPanel';
import { SplitLayout } from './components/SplitLayout';
import { PaneHeader } from './components/PaneHeader';
import { PaneSessionPicker } from './components/PaneSessionPicker';
import { TitleBarBranding } from './components/TitleBarBranding';
import { AboutDialog } from './components/AboutDialog';
import { useSessionManager } from './hooks/useSessionManager';
import { useQuota } from './hooks/useQuota';
import { useCommandPalette } from './hooks/useCommandPalette';
import { useSplitView } from './hooks/useSplitView';
import { Workspace, PermissionMode, WorkspaceValidationResult } from '../shared/ipc-types';
import { PromptTemplate } from '../shared/types/prompt-templates';
import { resolveVariables, readClipboard, getMissingVariables } from './utils/variable-resolver';
import { showToast } from './utils/toast';

function App() {
  const {
    sessions,
    activeSessionId,
    isLoading,
    createSession,
    closeSession,
    switchSession,
    renameSession,
    restartSession,
    sendInput,
    resizeSession,
    onOutput,
  } = useSessionManager();

  // Split view state
  const {
    layout,
    focusedPaneId,
    isSplitActive,
    paneCount,
    visibleSessionIds,
    splitPane,
    closePane,
    assignSession,
    focusPane,
    focusDirection,
    setRatio,
    collapseSplitView,
  } = useSplitView();

  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showBudgetPanel, setShowBudgetPanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showCheckpointPanel, setShowCheckpointPanel] = useState(false);
  const [showCheckpointDialog, setShowCheckpointDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [confirmClose, setConfirmClose] = useState<{ sessionId: string; name: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  // Command palette for prompt templates
  const commandPalette = useCommandPalette({
    onSelect: handleTemplateSelect,
    onClose: () => {},
  });

  // Budget/quota state from real API
  const { quota: quotaData, burnRate: burnRateData, isLoading: isQuotaLoading, refresh: refreshQuota } = useQuota();

  // Load workspaces on mount
  useEffect(() => {
    const loadWorkspaces = async () => {
      try {
        const loadedWorkspaces = await window.electronAPI.listWorkspaces();
        setWorkspaces(loadedWorkspaces);
      } catch (err) {
        console.error('Failed to load workspaces:', err);
      }
    };
    loadWorkspaces();
  }, []);

  // Workspace management callbacks
  const handleAddWorkspace = useCallback(async (
    name: string,
    path: string,
    permissionMode: PermissionMode
  ) => {
    const workspace = await window.electronAPI.addWorkspace({ name, path, defaultPermissionMode: permissionMode });
    setWorkspaces(prev => [...prev, workspace]);
  }, []);

  const handleUpdateWorkspace = useCallback(async (
    id: string,
    name?: string,
    path?: string,
    permissionMode?: PermissionMode
  ) => {
    const updated = await window.electronAPI.updateWorkspace({ id, name, path, defaultPermissionMode: permissionMode });
    setWorkspaces(prev => prev.map(w => w.id === id ? updated : w));
  }, []);

  const handleDeleteWorkspace = useCallback(async (id: string) => {
    await window.electronAPI.deleteWorkspace(id);
    setWorkspaces(prev => prev.filter(w => w.id !== id));
  }, []);

  const handleValidatePath = useCallback(async (
    path: string,
    excludeId?: string
  ): Promise<WorkspaceValidationResult> => {
    return window.electronAPI.validateWorkspacePath(path, excludeId);
  }, []);

  // Handle template selection from command palette
  async function handleTemplateSelect(template: PromptTemplate) {
    if (!activeSessionId) {
      console.warn('No active session');
      return;
    }

    const activeSession = sessions.find(s => s.id === activeSessionId);
    if (!activeSession) return;

    try {
      // Get clipboard content if needed
      const clipboard = await readClipboard();

      // Build variable context
      const context = {
        clipboard: clipboard || undefined,
        currentDir: activeSession.workingDirectory,
        selection: undefined, // TODO: Get from xterm.js if available
        sessionName: activeSession.name,
      };

      // Check for missing required variables
      const missing = getMissingVariables(template.prompt, context);
      if (missing.length > 0) {
        console.warn('Missing required variables:', missing);
        // Could show a dialog here asking user to provide missing variables
        // For now, just proceed with what we have
      }

      // Resolve variables
      const resolvedPrompt = resolveVariables(template.prompt, context);

      // Send to active terminal
      sendInput(activeSessionId, resolvedPrompt + '\n');
    } catch (err) {
      console.error('Failed to apply template:', err);
    }
  }

  // Sync activeSessionId from focused pane
  useEffect(() => {
    if (!isSplitActive) return;

    // Find the session in the focused pane
    let focusedSessionId: string | null = null;
    function findSessionInPane(node: any): void {
      if (node.type === 'leaf' && node.paneId === focusedPaneId) {
        focusedSessionId = node.sessionId;
      } else if (node.type === 'branch') {
        findSessionInPane(node.children[0]);
        findSessionInPane(node.children[1]);
      }
    }
    findSessionInPane(layout);

    if (focusedSessionId && focusedSessionId !== activeSessionId) {
      switchSession(focusedSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedPaneId, isSplitActive, layout]);

  // Handle session closed while in pane
  useEffect(() => {
    if (!isSplitActive) return;

    // Find all visible sessions
    const visibleIds = new Set(visibleSessionIds);

    // Check if any visible session was closed
    const activeSessionIds = new Set(sessions.map(s => s.id));

    visibleIds.forEach(visibleId => {
      if (!activeSessionIds.has(visibleId)) {
        // This visible session was closed
        // Find its pane and either:
        // 1. Assign another session if available
        // 2. Close the pane if no sessions available

        const unassignedSessions = sessions.filter(s => !visibleSessionIds.includes(s.id));

        // Find pane with this session
        function findPaneId(node: any): string | null {
          if (node.type === 'leaf' && node.sessionId === visibleId) {
            return node.paneId;
          }
          if (node.type === 'branch') {
            return findPaneId(node.children[0]) || findPaneId(node.children[1]);
          }
          return null;
        }

        const paneId = findPaneId(layout);
        if (paneId) {
          if (unassignedSessions.length > 0) {
            // Assign first unassigned session
            assignSession(paneId, unassignedSessions[0].id);
          } else {
            // Close the pane
            closePane(paneId);
          }
        }
      }
    });
  }, [sessions, visibleSessionIds, isSplitActive, layout, assignSession, closePane]);

  // Handle new session created with empty pane
  useEffect(() => {
    if (!isSplitActive) return;

    // Check if there's an empty pane (sessionId === null)
    function findEmptyPane(node: any): string | null {
      if (node.type === 'leaf' && node.sessionId === null) {
        return node.paneId;
      }
      if (node.type === 'branch') {
        return findEmptyPane(node.children[0]) || findEmptyPane(node.children[1]);
      }
      return null;
    }

    const emptyPaneId = findEmptyPane(layout);

    if (emptyPaneId) {
      // Find newly created session (not visible in any pane, status running)
      const newSession = sessions
        .filter(s => !visibleSessionIds.includes(s.id))
        .find(s => s.status === 'running');

      if (newSession) {
        // Auto-assign to empty pane
        assignSession(emptyPaneId, newSession.id);
      }
    }
  }, [sessions.length, isSplitActive, layout, visibleSessionIds, assignSession]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Shift + P: Command palette
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        commandPalette.open();
        return;
      }

      // Ctrl/Cmd + Shift + H: History panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        setShowHistoryPanel(true);
        return;
      }

      // Ctrl/Cmd + Shift + C: Checkpoint panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        setShowCheckpointPanel(prev => !prev);
        return;
      }

      // Ctrl/Cmd + Shift + S: Create checkpoint
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        if (!activeSessionId) return;
        setShowCheckpointDialog(true);
        return;
      }

      // Ctrl + \: Split right (horizontal)
      if (e.ctrlKey && e.key === '\\' && !e.shiftKey) {
        e.preventDefault();
        if (paneCount < 4 && focusedPaneId) {
          splitPane(focusedPaneId, 'horizontal');
        }
        return;
      }

      // Ctrl + Shift + \: Split down (vertical)
      if (e.ctrlKey && e.shiftKey && e.key === '\\') {
        e.preventDefault();
        if (paneCount < 4 && focusedPaneId) {
          splitPane(focusedPaneId, 'vertical');
        }
        return;
      }

      // Ctrl + Shift + W: Close pane
      if (e.ctrlKey && e.shiftKey && e.key === 'W') {
        e.preventDefault();
        if (isSplitActive && focusedPaneId) {
          closePane(focusedPaneId);
        }
        return;
      }

      // Ctrl + Alt + Arrow: Navigate between panes
      if (e.ctrlKey && e.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const direction = e.key.replace('Arrow', '').toLowerCase() as 'left' | 'right' | 'up' | 'down';
        focusDirection(direction);
        return;
      }

      // Ctrl/Cmd + T: New session
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        setShowNewSessionDialog(true);
        return;
      }

      // Ctrl/Cmd + W: Close active session
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (activeSessionId) {
          handleCloseSession(activeSessionId);
        }
        return;
      }

      // Ctrl/Cmd + 1-9: Switch to session
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (index < sessions.length) {
          switchSession(sessions[index].id);
        }
        return;
      }

      // Ctrl/Cmd + Tab: Next session
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        if (sessions.length > 1 && activeSessionId) {
          const currentIndex = sessions.findIndex(s => s.id === activeSessionId);
          const nextIndex = (currentIndex + 1) % sessions.length;
          switchSession(sessions[nextIndex].id);
        }
        return;
      }

      // Ctrl/Cmd + Shift + Tab: Previous session
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        if (sessions.length > 1 && activeSessionId) {
          const currentIndex = sessions.findIndex(s => s.id === activeSessionId);
          const prevIndex = (currentIndex - 1 + sessions.length) % sessions.length;
          switchSession(sessions[prevIndex].id);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessions, activeSessionId, switchSession, commandPalette, isSplitActive, paneCount, focusedPaneId, splitPane, closePane, focusDirection]);

  const handleCreateSession = useCallback(async (
    name: string,
    workingDirectory: string,
    permissionMode: 'standard' | 'skip-permissions'
  ) => {
    try {
      await createSession(name, workingDirectory, permissionMode);
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  }, [createSession]);

  const handleCloseSession = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    // If session is running, show confirmation
    if (session.status === 'running') {
      setConfirmClose({ sessionId, name: session.name });
    } else {
      closeSession(sessionId);
    }
  }, [sessions, closeSession]);

  const handleConfirmClose = useCallback(async () => {
    if (confirmClose) {
      await closeSession(confirmClose.sessionId);
      setConfirmClose(null);
    }
  }, [confirmClose, closeSession]);

  const handleCreateCheckpoint = useCallback(async (
    name: string,
    description?: string,
    tags?: string[]
  ) => {
    if (!activeSessionId) {
      console.warn('No active session');
      return;
    }

    try {
      const checkpoint = await window.electronAPI.createCheckpoint({
        sessionId: activeSessionId,
        name,
        description,
        tags,
      });

      // Close dialog
      setShowCheckpointDialog(false);

      // Show success notification
      showToast(`Checkpoint "${name}" created`, 'success');

      // Copy checkpoint ID to clipboard
      try {
        await navigator.clipboard.writeText(checkpoint.id);
        showToast('Checkpoint ID copied to clipboard', 'info', 2000);
      } catch (err) {
        console.warn('Failed to copy checkpoint ID:', err);
      }
    } catch (err) {
      console.error('Failed to create checkpoint:', err);
      showToast(`Failed to create checkpoint: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    }
  }, [activeSessionId]);

  const handleDuplicateSession = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      // Create a new session with the same settings
      createSession(`${session.name} (copy)`, session.workingDirectory, session.permissionMode);
    }
  }, [sessions, createSession]);

  const handleToggleSplit = useCallback(() => {
    try {
      if (isSplitActive) {
        // Collapse to single pane
        collapseSplitView();
      } else {
        // Split the focused pane horizontally
        if (!focusedPaneId) {
          console.error('Cannot split: no focused pane ID');
          return;
        }
        if (paneCount >= 4) {
          console.warn('Cannot split: maximum of 4 panes reached');
          return;
        }
        splitPane(focusedPaneId, 'horizontal');
      }
    } catch (err) {
      console.error('Error toggling split view:', err);
    }
  }, [isSplitActive, collapseSplitView, focusedPaneId, paneCount, splitPane]);

  const handleFocusPaneWithSession = useCallback((sessionId: string) => {
    // Find the pane containing this session and focus it
    function findPaneIdForSession(node: any): string | null {
      if (node.type === 'leaf') {
        return node.sessionId === sessionId ? node.paneId : null;
      }
      if (node.type === 'branch') {
        const leftResult = findPaneIdForSession(node.children[0]);
        if (leftResult) return leftResult;
        return findPaneIdForSession(node.children[1]);
      }
      return null;
    }

    const paneId = findPaneIdForSession(layout);
    if (paneId) {
      focusPane(paneId);
    }
  }, [layout, focusPane]);

  const handleAssignSessionToFocusedPane = useCallback((sessionId: string) => {
    if (focusedPaneId) {
      assignSession(focusedPaneId, sessionId);
    }
  }, [focusedPaneId, assignSession]);

  const handleSplitSession = useCallback((sessionId: string, direction: 'horizontal' | 'vertical') => {
    // Find the pane containing this session
    function findPaneIdForSession(node: any): string | null {
      if (node.type === 'leaf') {
        return node.sessionId === sessionId ? node.paneId : null;
      }
      if (node.type === 'branch') {
        const leftResult = findPaneIdForSession(node.children[0]);
        if (leftResult) return leftResult;
        return findPaneIdForSession(node.children[1]);
      }
      return null;
    }

    const paneId = findPaneIdForSession(layout);
    if (paneId && paneCount < 4) {
      const newPaneId = splitPane(paneId, direction);
      // Assign the same session to the new pane
      assignSession(newPaneId, sessionId);
    }
  }, [layout, paneCount, splitPane, assignSession]);

  // Convert sessions to TabData format
  const tabData: TabData[] = sessions;

  if (isLoading) {
    return (
      <div className="app">
        <div className="titlebar">
          <div className="titlebar-drag-region" />
          <div className="titlebar-content">
            <TitleBarBranding onClick={() => setShowAboutDialog(true)} />
          </div>
        </div>
        <div className="loading-container">
          <div className="loading-spinner" />
        </div>
        <style>{loadingStyles}</style>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Title bar */}
      <div className="titlebar">
        <div className="titlebar-drag-region" />
        <div className="titlebar-content">
          <TitleBarBranding onClick={() => setShowAboutDialog(true)} />
        </div>
      </div>

      {/* Tab bar */}
      <TabBar
        sessions={tabData}
        activeSessionId={activeSessionId}
        onSelectSession={switchSession}
        onCloseSession={handleCloseSession}
        onCreateSession={handleCreateSession}
        onRenameSession={renameSession}
        onRestartSession={restartSession}
        onDuplicateSession={handleDuplicateSession}
        isDialogOpen={showNewSessionDialog}
        onDialogOpenChange={setShowNewSessionDialog}
        workspaces={workspaces}
        onOpenSettings={() => setShowSettingsDialog(true)}
        onOpenBudget={() => setShowBudgetPanel(true)}
        onOpenHistory={() => setShowHistoryPanel(true)}
        onOpenCheckpoints={() => setShowCheckpointPanel(true)}
        onCreateCheckpoint={() => setShowCheckpointDialog(true)}
        isSplitActive={isSplitActive}
        onToggleSplit={handleToggleSplit}
        visibleSessionIds={visibleSessionIds}
        focusedSessionId={activeSessionId}
        onFocusPaneWithSession={handleFocusPaneWithSession}
        onAssignSessionToFocusedPane={handleAssignSessionToFocusedPane}
        paneCount={paneCount}
        onSplitSession={handleSplitSession}
      />

      {/* Terminal area */}
      <div className="terminal-container">
        {sessions.length === 0 ? (
          <EmptyState onCreateSession={() => setShowNewSessionDialog(true)} />
        ) : isSplitActive ? (
          <>
            {/* Only render split layout if we have valid layout and focused pane */}
            {layout && focusedPaneId ? (
              <SplitLayout
                layout={layout}
                focusedPaneId={focusedPaneId}
                onPaneFocus={focusPane}
                onRatioChange={setRatio}
                onAssignSession={assignSession}
                renderPane={(paneId, sessionId, isFocused) => {
                const session = sessions.find(s => s.id === sessionId);
                const availableSessions = sessions.filter(s => !visibleSessionIds.includes(s.id) || s.id === sessionId);

                return (
                  <div className="split-pane-content">
                    {paneCount > 1 && session && (
                      <PaneHeader
                        sessionId={session.id}
                        sessionName={session.name}
                        workingDirectory={session.workingDirectory}
                        isFocused={isFocused}
                        availableSessions={availableSessions}
                        canSplit={paneCount < 4}
                        onChangeSession={(newSessionId) => assignSession(paneId, newSessionId)}
                        onClosePane={() => closePane(paneId)}
                        onSplitHorizontal={() => splitPane(paneId, 'horizontal')}
                        onSplitVertical={() => splitPane(paneId, 'vertical')}
                      />
                    )}
                    <div className="pane-terminal-area">
                      {sessionId ? (
                        <MultiTerminal
                          sessionIds={sessions.map(s => s.id)}
                          visibleSessionIds={[sessionId]}
                          focusedSessionId={isFocused ? sessionId : null}
                          onInput={sendInput}
                          onResize={resizeSession}
                          onOutput={onOutput}
                        />
                      ) : (
                        <PaneSessionPicker
                          availableSessions={sessions.filter(s => !visibleSessionIds.includes(s.id))}
                          onSelectSession={(newSessionId) => assignSession(paneId, newSessionId)}
                          onCreateNewSession={() => setShowNewSessionDialog(true)}
                          onCancel={() => closePane(paneId)}
                        />
                      )}
                    </div>
                  </div>
                );
              }}
              />
            ) : (
              <div className="loading-container">
                <div className="loading-spinner" />
                <div>Loading split view...</div>
              </div>
            )}
            <style>{`
              .split-pane-content {
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                background: #1a1b26;
              }

              .pane-terminal-area {
                flex: 1;
                overflow: hidden;
              }
            `}</style>
          </>
        ) : (
          <MultiTerminal
            sessionIds={sessions.map(s => s.id)}
            visibleSessionIds={activeSessionId ? [activeSessionId] : []}
            focusedSessionId={activeSessionId}
            onInput={sendInput}
            onResize={resizeSession}
            onOutput={onOutput}
          />
        )}
      </div>

      {/* Close confirmation dialog */}
      <ConfirmDialog
        isOpen={confirmClose !== null}
        title="Close Session?"
        message={`The session "${confirmClose?.name}" may have active processes. Closing it will terminate all running commands.`}
        confirmLabel="Close Session"
        cancelLabel="Cancel"
        isDangerous={true}
        onConfirm={handleConfirmClose}
        onCancel={() => setConfirmClose(null)}
      />

      {/* Settings dialog */}
      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
        workspaces={workspaces}
        onAddWorkspace={handleAddWorkspace}
        onUpdateWorkspace={handleUpdateWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onValidatePath={handleValidatePath}
      />

      {/* Budget panel */}
      <BudgetPanel
        isOpen={showBudgetPanel}
        onClose={() => setShowBudgetPanel(false)}
        quota={quotaData}
        burnRate={burnRateData}
        isLoading={isQuotaLoading}
        onRefresh={refreshQuota}
      />

      {/* History panel */}
      <HistoryPanel
        isOpen={showHistoryPanel}
        onClose={() => setShowHistoryPanel(false)}
      />

      {/* Checkpoint panel */}
      <CheckpointPanel
        isOpen={showCheckpointPanel}
        onClose={() => setShowCheckpointPanel(false)}
        sessionId={activeSessionId || undefined}
      />

      {/* Checkpoint creation dialog */}
      <CheckpointDialog
        isOpen={showCheckpointDialog}
        sessionId={activeSessionId}
        sessionName={sessions.find(s => s.id === activeSessionId)?.name}
        onConfirm={handleCreateCheckpoint}
        onCancel={() => setShowCheckpointDialog(false)}
      />

      {/* About dialog */}
      <AboutDialog
        isOpen={showAboutDialog}
        onClose={() => setShowAboutDialog(false)}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPalette.isOpen}
        query={commandPalette.query}
        onQueryChange={commandPalette.setQuery}
        results={commandPalette.filteredResults}
        selectedIndex={commandPalette.selectedIndex}
        onSelectIndex={commandPalette.setSelectedIndex}
        onSelectTemplate={commandPalette.selectTemplate}
        onClose={commandPalette.close}
        onManageTemplates={() => {
          commandPalette.close();
          setShowSettingsDialog(true);
        }}
      />

      <style>{appStyles}</style>
    </div>
  );
}

const loadingStyles = `
  .loading-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #292e42;
    border-top-color: #7aa2f7;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const appStyles = `
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: #1a1b26;
  }

  .titlebar {
    height: 36px;
    background-color: #1a1b26;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    position: relative;
    flex-shrink: 0;
    border-bottom: 1px solid #292e42;
  }

  .titlebar-drag-region {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    -webkit-app-region: drag;
  }

  .titlebar-content {
    position: relative;
    z-index: 10;
    -webkit-app-region: no-drag;
  }

  .terminal-container {
    flex: 1;
    overflow: hidden;
    padding: 8px;
    background: #1a1b26;
  }
`;

export default App;
