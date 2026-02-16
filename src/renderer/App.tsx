// @atlas-entrypoint: Root React component — composes all hooks, panels, and dialogs
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
import { TeamPanel } from './components/TeamPanel';
import { AtlasPanel } from './components/AtlasPanel';
import { GitPanel } from './components/GitPanel';
import { WorktreePanel } from './components/WorktreePanel';
import { PlaybookPicker } from './components/PlaybookPicker';
import { PlaybookParameterDialog } from './components/PlaybookParameterDialog';
import { PlaybookProgressPanel } from './components/PlaybookProgressPanel';
import { PlaybookPanel } from './components/PlaybookPanel';
import { PlaybookEditor } from './components/PlaybookEditor';
import { LayoutPicker } from './components/LayoutPicker';
import { WelcomeWizard } from './components/WelcomeWizard';
import { ShortcutsPanel } from './components/ui/ShortcutsPanel';
import { ModelHistoryPanel } from './components/ModelHistoryPanel';
import { useSessionManager } from './hooks/useSessionManager';
import { useQuota } from './hooks/useQuota';
import { useCommandPalette } from './hooks/useCommandPalette';
import { useSplitView } from './hooks/useSplitView';
import { useAgentTeams } from './hooks/useAgentTeams';
import { useAtlas } from './hooks/useAtlas';
import { useGit } from './hooks/useGit';
import { usePlaybooks } from './hooks/usePlaybooks';
import { useAutoTeamLayout } from './hooks/useAutoTeamLayout';
import { useLayoutPicker } from './hooks/useLayoutPicker';
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
    applyLayoutPreset,
    createCustomLayout,
  } = useSplitView();

  // Layout picker
  const layoutPicker = useLayoutPicker((preset) => {
    showToast(`Applied ${preset.name}`, 'success');
  });
  const [showWizard, setShowWizard] = useState(false);
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false);
  const [showModelHistoryPanel, setShowModelHistoryPanel] = useState(false);

  // Agent Teams
  const [agentTeamsEnabled, setAgentTeamsEnabled] = useState<boolean | undefined>(undefined);
  const { teams, closeTeam } = useAgentTeams({ enabled: agentTeamsEnabled === true });
  const [showTeamPanel, setShowTeamPanel] = useState(false);
  const [autoLayoutEnabled] = useState(true);

  // Auto-layout for teams
  useAutoTeamLayout({
    enabled: agentTeamsEnabled === true && autoLayoutEnabled,
    sessions: sessions as any,
    paneCount,
    splitPane,
    assignSession,
    focusedPaneId,
  });

  // Atlas Engine
  const atlasSession = sessions.find(s => s.id === activeSessionId);
  const atlasProjectPath = atlasSession?.workingDirectory || null;
  const atlas = useAtlas(atlasProjectPath);
  const [showAtlasPanel, setShowAtlasPanel] = useState(false);

  // Git Integration
  const git = useGit(atlasProjectPath);
  const [showGitPanel, setShowGitPanel] = useState(false);
  const [showWorktreePanel, setShowWorktreePanel] = useState(false);

  // Session Playbooks
  const pb = usePlaybooks(activeSessionId);

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

  // Panel open/close helpers
  const openPanel = useCallback((_panelType: string, setter: (value: boolean) => void) => {
    setter(true);
  }, []);

  const closePanel = useCallback((_panelType: string, setter: (value: boolean) => void) => {
    setter(false);
  }, []);

  // Budget/quota state from real API
  const { quota: quotaData, burnRate: burnRateData, isLoading: isQuotaLoading, refresh: refreshQuota } = useQuota();

  // Load workspaces and settings on mount
  useEffect(() => {
    const loadWorkspaces = async () => {
      try {
        const loadedWorkspaces = await window.electronAPI.listWorkspaces();
        setWorkspaces(loadedWorkspaces);
      } catch (err) {
        console.error('Failed to load workspaces:', err);
      }
    };
    const loadAgentTeamsSetting = async () => {
      try {
        const settings = await window.electronAPI.getSettings();
        setAgentTeamsEnabled(settings.enableAgentTeams !== false);
      } catch (err) {
        console.error('Failed to load settings:', err);
        setAgentTeamsEnabled(true); // default
      }
    };
    loadWorkspaces();
    loadAgentTeamsSetting();
  }, []);

  // Close team panel when agent teams disabled
  useEffect(() => {
    if (agentTeamsEnabled === false) {
      setShowTeamPanel(false);
    }
  }, [agentTeamsEnabled]);

  // Check if wizard should be shown
  useEffect(() => {
    const wizardCompleted = localStorage.getItem('wizardCompleted') === 'true';
    if (!wizardCompleted) {
      setShowWizard(true);
    }
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
      } else if (node.type === 'grid') {
        node.children.forEach((child: any) => findSessionInPane(child));
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
          if (node.type === 'grid') {
            for (const child of node.children) {
              const result = findPaneId(child);
              if (result) return result;
            }
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
      if (node.type === 'grid') {
        for (const child of node.children) {
          const result = findEmptyPane(child);
          if (result) return result;
        }
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

      // Ctrl/Cmd + Shift + L: Layout Picker
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        layoutPicker.openPicker();
        return;
      }

      // Ctrl/Cmd + Shift + B: Playbook picker
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        pb.openPicker();
        return;
      }

      // Ctrl/Cmd + Shift + G: Git panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        setShowGitPanel(prev => !prev);
        return;
      }

      // Ctrl/Cmd + Shift + H: History panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        openPanel('history', setShowHistoryPanel);
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

      // Ctrl/Cmd + Shift + E: Reveal in File Explorer
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        if (!activeSessionId) return;
        window.electronAPI.revealInExplorer(activeSessionId)
          .then(success => {
            if (!success) {
              console.error('Failed to reveal session in file explorer');
            }
          });
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
  }, [sessions, activeSessionId, switchSession, commandPalette, layoutPicker, pb, isSplitActive, paneCount, focusedPaneId, splitPane, closePane, focusDirection, layout]);

  const handleCreateSession = useCallback(async (
    name: string,
    workingDirectory: string,
    permissionMode: 'standard' | 'skip-permissions',
    worktree?: import('../shared/types/git-types').WorktreeCreateRequest
  ) => {
    try {
      await createSession(name, workingDirectory, permissionMode, worktree);
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
      if (node.type === 'grid') {
        for (const child of node.children) {
          const result = findPaneIdForSession(child);
          if (result) return result;
        }
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

  // Quick action handlers for enhanced empty state
  const handleQuickStartCoding = useCallback(async () => {
    // Create new session
    await createSession('New Session', '.', 'standard');
    // Apply 2-pane horizontal layout
    const preset = layoutPicker.presets?.find(p => p.id === 'horizontal-split');
    if (preset) {
      applyLayoutPreset(preset);
    }
  }, [createSession, applyLayoutPreset, layoutPicker.presets]);

  const handleQuickAnalyzeCodebase = useCallback(async () => {
    // Create new session and open Atlas
    await createSession('Analysis Session', '.', 'standard');
    openPanel('atlas', setShowAtlasPanel);
  }, [createSession, openPanel]);

  const handleQuickTeamProject = useCallback(async () => {
    // Create new session and open Teams panel
    await createSession('Team Session', '.', 'standard');
    openPanel('teams', setShowTeamPanel);
  }, [createSession, openPanel]);

  // Welcome wizard handlers
  const handleWizardComplete = useCallback(async () => {
    try {
      localStorage.setItem('wizardCompleted', 'true');
      setShowWizard(false);
      // Create first session
      await createSession('Session 1', '.', 'standard');
    } catch (err) {
      console.error('Failed to complete wizard:', err);
    }
  }, [createSession]);

  const handleWizardTryFeature = useCallback(async (featureId: string) => {
    // Create a session first
    await createSession('Session 1', '.', 'standard');

    // Open the requested feature panel
    switch (featureId) {
      case 'atlas':
        openPanel('atlas', setShowAtlasPanel);
        break;
      case 'teams':
        openPanel('teams', setShowTeamPanel);
        break;
      case 'checkpoints':
        openPanel('checkpoints', setShowCheckpointPanel);
        break;
      case 'templates':
        commandPalette.open();
        break;
    }
  }, [createSession, commandPalette, openPanel]);

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
      if (node.type === 'grid') {
        for (const child of node.children) {
          const result = findPaneIdForSession(child);
          if (result) return result;
        }
      }
      return null;
    }

    const paneId = findPaneIdForSession(layout);
    if (paneId) {
      // No longer check pane count limit (unlimited panes)
      const newPaneId = splitPane(paneId, direction);
      // Assign the same session to the new pane
      assignSession(newPaneId, sessionId);
    }
  }, [layout, splitPane, assignSession]);

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
        onOpenAtlas={() => openPanel('atlas', setShowAtlasPanel)}
        onOpenLayoutPicker={() => layoutPicker.openPicker()}
        onOpenTeams={agentTeamsEnabled ? () => openPanel('teams', setShowTeamPanel) : undefined}
        onOpenGit={() => openPanel('git', setShowGitPanel)}
        onOpenWorktrees={() => openPanel('worktrees', setShowWorktreePanel)}
        onOpenPlaybooks={() => pb.openPicker()}
        teamCount={agentTeamsEnabled ? teams.length : 0}
        gitStagedCount={git.status?.stagedCount ?? 0}
        quotaData={quotaData}
        burnRateData={burnRateData}
        isQuotaLoading={isQuotaLoading}
        quotaError={null}
        onOpenSettings={() => openPanel('settings', setShowSettingsDialog)}
        onOpenBudget={() => openPanel('budget', setShowBudgetPanel)}
        onOpenHistory={() => openPanel('history', setShowHistoryPanel)}
        onOpenCheckpoints={() => openPanel('checkpoints', setShowCheckpointPanel)}
        onCreateCheckpoint={() => setShowCheckpointDialog(true)}
        onOpenHelp={() => setShowShortcutsPanel(true)}
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
          <EmptyState
            onCreateSession={() => setShowNewSessionDialog(true)}
            onQuickStart={{
              startCoding: handleQuickStartCoding,
              analyzeCodebase: handleQuickAnalyzeCodebase,
              teamProject: handleQuickTeamProject,
            }}
          />
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
                        worktreeBranch={session.worktreeBranch}
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

      {/* Atlas panel */}
      <AtlasPanel
        isOpen={showAtlasPanel}
        onClose={() => closePanel('atlas', setShowAtlasPanel)}
        projectPath={atlasProjectPath}
        isScanning={atlas.isScanning}
        scanProgress={atlas.scanProgress}
        scanResult={atlas.scanResult}
        generatedContent={atlas.generatedContent}
        atlasStatus={atlas.atlasStatus}
        error={atlas.error}
        onGenerate={() => atlas.generateAtlas()}
        onWrite={async (claudeMd, repoIndex, inlineTags) => {
          const result = await atlas.writeAtlas(claudeMd, repoIndex, inlineTags);
          return result !== null && (result.claudeMdWritten || result.repoIndexWritten);
        }}
        onReset={atlas.reset}
      />

      {/* Git panel */}
      <GitPanel
        isOpen={showGitPanel}
        onClose={() => closePanel('git', setShowGitPanel)}
        projectPath={atlasProjectPath}
        activeSessionId={activeSessionId}
      />

      {/* Worktree panel */}
      <WorktreePanel
        isOpen={showWorktreePanel}
        onClose={() => setShowWorktreePanel(false)}
        projectPath={atlasProjectPath}
      />

      {/* Playbook Picker */}
      <PlaybookPicker
        isOpen={pb.isPickerOpen}
        playbooks={pb.playbooks}
        onSelect={pb.selectPlaybook}
        onClose={pb.closePicker}
        onManagePlaybooks={() => pb.setIsPanelOpen(true)}
      />

      {/* Playbook Parameter Dialog */}
      <PlaybookParameterDialog
        isOpen={pb.isParamDialogOpen}
        playbook={pb.selectedPlaybook}
        onRun={pb.runPlaybook}
        onCancel={() => pb.setIsParamDialogOpen(false)}
      />

      {/* Playbook Progress Panel */}
      {pb.execution && (
        <PlaybookProgressPanel
          execution={pb.execution}
          onCancel={pb.cancelPlaybook}
          onConfirm={pb.confirmStep}
        />
      )}

      {/* Playbook Panel (Library) */}
      <PlaybookPanel
        isOpen={pb.isPanelOpen}
        onClose={() => pb.setIsPanelOpen(false)}
        playbooks={pb.playbooks}
        onRun={(playbook) => {
          pb.setIsPanelOpen(false);
          pb.selectPlaybook(playbook);
        }}
        onEdit={(playbook) => {
          pb.openEditor(playbook);
        }}
        onCreate={() => pb.openEditor()}
        onDelete={pb.deletePlaybook}
        onDuplicate={pb.duplicatePlaybook}
        onImport={pb.importPlaybook}
        onExport={pb.exportPlaybook}
      />

      {/* Playbook Editor */}
      <PlaybookEditor
        isOpen={pb.isEditorOpen}
        playbook={pb.editingPlaybook}
        onSave={async (request) => {
          if ('id' in request) {
            await pb.updatePlaybook(request);
          } else {
            await pb.addPlaybook(request);
          }
        }}
        onClose={pb.closeEditor}
      />

      {/* Team panel */}
      {agentTeamsEnabled && (
        <TeamPanel
          isOpen={showTeamPanel}
          onClose={() => closePanel('teams', setShowTeamPanel)}
          teams={teams}
          sessions={sessions as any}
          onCloseTeam={closeTeam}
          onFocusSession={handleFocusPaneWithSession}
        />
      )}

      {/* Settings dialog */}
      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => {
          closePanel('settings', setShowSettingsDialog);
          // Re-read settings to pick up changes (e.g., enableAgentTeams toggle)
          window.electronAPI.getSettings().then(s => {
            setAgentTeamsEnabled(s.enableAgentTeams !== false);
          }).catch(console.error);
        }}
        workspaces={workspaces}
        onAddWorkspace={handleAddWorkspace}
        onUpdateWorkspace={handleUpdateWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onValidatePath={handleValidatePath}
      />

      {/* Budget panel */}
      <BudgetPanel
        isOpen={showBudgetPanel}
        onClose={() => closePanel('budget', setShowBudgetPanel)}
        quota={quotaData}
        burnRate={burnRateData}
        isLoading={isQuotaLoading}
        onRefresh={refreshQuota}
      />

      {/* History panel */}
      <HistoryPanel
        isOpen={showHistoryPanel}
        onClose={() => closePanel('history', setShowHistoryPanel)}
      />

      {/* Checkpoint panel */}
      <CheckpointPanel
        isOpen={showCheckpointPanel}
        onClose={() => closePanel('checkpoints', setShowCheckpointPanel)}
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

      {/* Model History panel */}
      <ModelHistoryPanel
        isOpen={showModelHistoryPanel}
        onClose={() => closePanel('modelHistory', setShowModelHistoryPanel)}
        sessionId={activeSessionId}
        sessionName={sessions.find(s => s.id === activeSessionId)?.name}
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

      {/* Welcome Wizard */}
      <WelcomeWizard
        isOpen={showWizard}
        onComplete={handleWizardComplete}
        onTryFeature={handleWizardTryFeature}
      />

      {/* Keyboard Shortcuts Panel */}
      <ShortcutsPanel
        isOpen={showShortcutsPanel}
        onClose={() => closePanel('shortcuts', setShowShortcutsPanel)}
      />

      {/* Layout Picker */}
      <LayoutPicker
        isOpen={layoutPicker.isPickerOpen}
        presets={layoutPicker.presets}
        currentPresetId={layoutPicker.currentPresetId}
        onSelectPreset={async (preset) => {
          await applyLayoutPreset(preset);
          layoutPicker.setCurrentPresetId(preset.id);
        }}
        onCreateCustom={async (rows, cols) => {
          await createCustomLayout(rows, cols);
        }}
        onClose={() => {
          layoutPicker.closePicker();
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
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px;
    background: #1a1b26;
  }
`;

export default App;
