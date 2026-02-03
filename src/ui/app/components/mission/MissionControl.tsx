/**
 * MissionControl - Unified workspace screen
 *
 * Single screen that adapts based on the current phase (PROMPT → REVIEW → SHIP).
 * Eliminates navigation between screens for the core development workflow.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Lightbulb, FolderGit2 } from 'lucide-react';
import { Logo } from './Logo';
import { OnboardingFlow } from './OnboardingFlow';
import { IdeaView } from '../idea/IdeaView';
import { IdeaPanel } from '../idea/IdeaPanel';
import { AttachRepoModal } from '../idea/AttachRepoModal';
import { PromoteModal } from '../idea/PromoteModal';
import { useIdeaStore, registerIdeaWSHandlers, setTerminalStoreRef } from '../../store/ideaStore';

import { PhaseNavigator, Phase, ExistingPR } from './PhaseNavigator';
import { RepoDock, RepoStatus } from './RepoDock';
import { PromptPhase } from './phases/PromptPhase';
import { ReviewPhase, FileChange } from './phases/ReviewPhase';
import { ShipPhase } from './phases/ShipPhase';
import { CloseWorktreeDialog } from '../terminal/CloseWorktreeDialog';

import { useTerminalStore } from '../../store/terminalStore';
import { useTerminalUIStore } from '../../store/terminalUIStore';
import { useAppStore } from '../../store/appStore';
import { useTerminal } from '../../hooks/useTerminal';
import { useWorkflowPhase } from '../../hooks/useWorkflowPhase';
import { useToast } from '../../hooks/useToast';
import { MessageItem } from '../terminal/MessageItem';
import { Composer } from '../terminal/v2/Composer';
import { OverlayManager } from '../terminal/overlays';
import { useAgents } from '../../hooks/useAgents';
import { SettingsDrawer } from './SettingsDrawer';
import { QuotaChip } from '../ui/QuotaChip';
import { WalletGauge } from '../terminal/WalletGauge';
import { DegradationBanner } from '../terminal/DegradationBanner';
import { DegradationPanel } from '../terminal/DegradationPanel';
import { BudgetLimitModal } from '../terminal/BudgetLimitModal';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api';
import { requestCache, CACHE_KEYS } from '../../lib/request-cache';

interface ClaudeQuotaBucket {
  utilization: number;
  resets_at: string;
}

interface ClaudeUsageQuota {
  five_hour: ClaudeQuotaBucket;
  seven_day: ClaudeQuotaBucket;
  lastUpdated: string;
}

export default function MissionControl() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPhase = (searchParams.get('phase') as Phase) || 'prompt';
  const toast = useToast();

  // Stores
  const terminal = useTerminal();
  const agents = useAgents();
  const ui = useTerminalUIStore();
  const { repos, workspaces, loadData } = useAppStore();
  const ideaStore = useIdeaStore();

  // Idea modal state
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);

  // Local state
  const [activePhase, setActivePhase] = useState<Phase>(initialPhase);
  const [approvedFiles, setApprovedFiles] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [existingPR, setExistingPR] = useState<ExistingPR | null>(null);
  const [commitsAheadOfBase, setCommitsAheadOfBase] = useState(0);

  // Close worktree dialog state
  const [closeWorktreeDialog, setCloseWorktreeDialog] = useState<{
    isOpen: boolean;
    sessionId: string | null;
    resolve?: (value: void) => void;
  }>({ isOpen: false, sessionId: null });

  // Quota state
  const [quota, setQuota] = useState<ClaudeUsageQuota | null>(null);
  const hasLoadedQuota = useRef(false);

  // Budget allocator state
  const [activeDegradations, setActiveDegradations] = useState<Array<{ type: string; model?: string }>>([]);
  const [showDegradationPanel, setShowDegradationPanel] = useState(false);
  const [showBudgetLimitModal, setShowBudgetLimitModal] = useState(false);
  const [budgetCheck, setBudgetCheck] = useState<{
    allowed: boolean;
    reason?: string;
    enforcement: 'none' | 'soft' | 'hard';
    thresholdHit?: number;
    activeDegradations?: Array<{ type: string; model?: string }>;
  } | null>(null);

  // Budget gate state: track acknowledged threshold level and pending send
  const [acknowledgedThreshold, setAcknowledgedThreshold] = useState<number>(0);
  const [pendingSendArgs, setPendingSendArgs] = useState<{ agentId?: string; chainIds?: string[] } | null>(null);

  const fetchQuota = useCallback(async () => {
    try {
      const result = await api<ClaudeUsageQuota | null>('GET', '/terminal/usage/quota');
      setQuota(result);

      // Also check budget limits
      if (result) {
        const check = await api<{
          allowed: boolean;
          reason?: string;
          enforcement: 'none' | 'soft' | 'hard';
          activeDegradations: Array<{ type: string; model?: string }>;
          thresholdHit?: number;
        }>('POST', '/terminal/usage/check-budget', {
          fiveHour: result.five_hour.utilization * 100,
          sevenDay: result.seven_day.utilization * 100,
        }).catch(() => null);

        if (check) {
          setActiveDegradations(check.activeDegradations || []);
          setBudgetCheck(check);
        }
      }
    } catch (e) {
      console.error('Failed to fetch quota:', e);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedQuota.current) {
      hasLoadedQuota.current = true;
      fetchQuota();
      const interval = setInterval(fetchQuota, 3 * 60 * 1000); // Every 3 min for budget tracking
      return () => clearInterval(interval);
    }
  }, [fetchQuota]);

  const getRelativeResetTime = useCallback((resetsAt: string): string => {
    const diffMs = new Date(resetsAt).getTime() - Date.now();
    if (diffMs <= 0) return 'now';
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `in ${days}d ${hours}h`;
    if (hours > 0) return `in ${hours}h ${minutes}m`;
    return `in ${minutes}m`;
  }, []);

  // Destructure terminal state
  const {
    sessions,
    activeSessionId,
    activeSession,
    switchSession,
    closeSession,
    input,
    setInput,
    handleSend,
    handleKeyDown,
    handlePaste,
    handleFileSelect,
    handleRetry,
    handleRegenerate,
    handleToggleMessageBookmark,
    pendingAttachments,
    removePendingAttachment,
    cancelOperation,
    isSending,
    isUploading,
    setMode,
    fileInputRef,
    lastAssistantIndex,
    fetchGitStatus,
  } = terminal;

  // Handle closing a session (with worktree check)
  const handleCloseSession = useCallback(async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);

    // If this is a worktree session that owns its worktree, show dialog
    if (session?.worktreeMode && session.ownsWorktree) {
      // Create a promise that will resolve when the dialog is closed
      return new Promise<void>((resolve) => {
        setCloseWorktreeDialog({ isOpen: true, sessionId, resolve });
      });
    } else {
      // Non-worktree session or borrowed worktree - close immediately
      await closeSession(sessionId);
    }
  }, [sessions, closeSession]);

  // Handle dialog confirmation
  const handleWorktreeDialogConfirm = useCallback(async (option: 'keep' | 'deleteWorktree' | 'deleteBoth') => {
    if (!closeWorktreeDialog.sessionId) return;

    const deleteBranch = option === 'deleteBoth';
    const deleteWorktree = option !== 'keep';
    const { sessionId, resolve } = closeWorktreeDialog;

    try {
      await closeSession(sessionId, deleteBranch, deleteWorktree);

      // Show success toast
      const messages = {
        keep: 'Session closed. Worktree preserved.',
        deleteWorktree: 'Session and worktree deleted. Branch preserved.',
        deleteBoth: 'Session, worktree, and branch deleted.',
      };
      toast.success(messages[option]);
    } finally {
      // Close dialog and resolve the promise
      setCloseWorktreeDialog({ isOpen: false, sessionId: null });
      if (resolve) resolve();
    }
  }, [closeWorktreeDialog, closeSession, toast]);

  // Workflow phase synchronization
  useWorkflowPhase({
    sessionId: activeSessionId,
    currentPhase: activePhase,
    onPhaseChange: setActivePhase,
    enabled: true,
  });

  // Reset acknowledged threshold when enforcement clears
  useEffect(() => {
    if (budgetCheck?.enforcement === 'none') {
      setAcknowledgedThreshold(0);
    }
  }, [budgetCheck?.enforcement]);

  // Auto model switch degradation
  useEffect(() => {
    if (!activeSessionId) return;
    const switchStep = activeDegradations.find(d => d.type === 'switch-model' && d.model);
    if (switchStep?.model) {
      api('PATCH', `/terminal/sessions/${activeSessionId}/model`, { model: switchStep.model }).catch(() => {});
    } else if (activeDegradations.length === 0) {
      // Clear model override when no degradations active
      api('PATCH', `/terminal/sessions/${activeSessionId}/model`, { model: null }).catch(() => {});
    }
  }, [activeDegradations, activeSessionId]);

  // Force plan mode degradation
  useEffect(() => {
    if (!activeSessionId || !activeSession) return;
    const forcePlan = activeDegradations.some(d => d.type === 'require-plan-mode');
    if (forcePlan && activeSession.mode !== 'plan') {
      setMode('plan');
    }
  }, [activeDegradations, activeSessionId, activeSession?.mode, setMode]);

  // Compute repo dock data from ALL sessions (each session = one repo entry)
  const repoStatuses: RepoStatus[] = useMemo(() => {
    return sessions.map((session) => {
      const repoId = session.repoIds?.[0] || session.repoId || session.id;
      const gitStatus = session.gitStatus;
      const changesCount = gitStatus?.files?.length || 0;

      return {
        id: session.id, // Use session ID for switching
        name: repoId.split('/').pop() || repoId,
        branch: gitStatus?.branch || session.branch || 'main',
        changesCount,
        status:
          session.status === 'running'
            ? 'running'
            : session.status === 'error'
            ? 'error'
            : changesCount > 0
            ? 'modified'
            : 'clean',
        isActive: session.id === activeSessionId,
        parentSessionId: session.parentSessionId,
        childSessionIds: session.childSessionIds,
      };
    });
  }, [sessions, activeSessionId]);

  // Compute file changes for review
  const fileChanges: FileChange[] = useMemo(() => {
    if (!activeSession?.gitStatus?.files) return [];
    return activeSession.gitStatus.files.map((f: any) => ({
      path: f.path || f,
      status: (f.status === 'created' || f.status === 'untracked') ? 'added' : f.status || 'modified',
      insertions: f.insertions || 0,
      deletions: f.deletions || 0,
      approved: approvedFiles.has(f.path || f),
    }));
  }, [activeSession?.gitStatus?.files, approvedFiles]);

  // Badge counts
  const messageCount = activeSession?.messages?.length || 0;
  const fileCount = fileChanges.length;
  const warningCount = fileChanges.filter((f) =>
    ['auth', 'secret', '.env', 'password', 'token'].some((s) =>
      f.path.toLowerCase().includes(s)
    )
  ).length;

  // Phase availability
  const canReview = fileCount > 0;
  const canShip = fileCount > 0 || existingPR !== null || commitsAheadOfBase > 0;

  // Fetch existing PR status for the active session's branch
  useEffect(() => {
    if (!activeSessionId) {
      setExistingPR(null);
      setCommitsAheadOfBase(0);
      return;
    }

    let cancelled = false;
    api<{ existingPR: ExistingPR | null; commitsAheadOfBase?: number }>(
      'GET',
      `/terminal/sessions/${activeSessionId}/ship-summary`
    )
      .then((data) => {
        if (!cancelled) {
          setExistingPR(data.existingPR ?? null);
          setCommitsAheadOfBase(data.commitsAheadOfBase || 0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExistingPR(null);
          setCommitsAheadOfBase(0);
        }
      });

    return () => { cancelled = true; };
  }, [activeSessionId, activeSession?.gitStatus]);

  // Auto-advance to review when files change
  useEffect(() => {
    if (
      activePhase === 'prompt' &&
      fileCount > 0 &&
      activeSession?.status === 'idle' &&
      messageCount > 0
    ) {
      // Optionally auto-advance: setActivePhase('review');
    }
  }, [fileCount, activePhase, activeSession?.status, messageCount]);

  // Update URL when phase changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('phase', activePhase);
    if (activeSessionId) params.set('sessionId', activeSessionId);
    const basePath = window.location.pathname.startsWith('/mission') ? '/mission' : '/';
    navigate(`${basePath}?${params.toString()}`, { replace: true });
  }, [activePhase, activeSessionId, navigate, searchParams]);

  // Load ideas on mount
  useEffect(() => {
    ideaStore.loadIdeas();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Provide terminal store reference to idea store (avoids circular import)
  useEffect(() => {
    setTerminalStoreRef(useTerminalStore);
  }, []);

  // Register idea WS handlers when WebSocket connects
  const terminalWs = useTerminalStore((s) => s.ws);
  const wsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (terminalWs && terminalWs !== wsRef.current) {
      wsRef.current = terminalWs;
      registerIdeaWSHandlers(terminalWs);
    }
  }, [terminalWs]);

  // Listen for workflow-blocked events
  useEffect(() => {
    if (!terminalWs || !activeSessionId) return;

    const handleWorkflowBlocked = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'workflow-blocked' && message.sessionId === activeSessionId) {
          toast.error(message.message || 'Git operation blocked in current workflow phase', {
            action: {
              label: 'Go to Ship',
              onClick: () => setActivePhase('ship'),
            },
          });
        }
      } catch (error) {
        // Ignore parse errors
      }
    };

    terminalWs.addEventListener('message', handleWorkflowBlocked);
    return () => {
      terminalWs.removeEventListener('message', handleWorkflowBlocked);
    };
  }, [terminalWs, activeSessionId, toast]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        // If idea panel is open, focus its search
        if (ideaStore.showIdeaPanel) {
          ideaStore.setIdeaPanelSearch('');
        } else {
          ui.openCommandPalette();
        }
      }
      // Ctrl+Shift+T: New session
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        ui.openNewSession();
      }
      // Ctrl+Shift+I: New idea
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        ideaStore.createIdea();
      }
      // Ctrl+B: Toggle idea panel
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        ideaStore.toggleIdeaPanel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [ui, ideaStore]);

  // Render message callback
  const renderMessage = useCallback(
    (message: any, index: number) => (
      <MessageItem
        key={message.id}
        message={message}
        isLastAssistantMessage={message.role === 'assistant' && index === lastAssistantIndex}
        toolActivities={activeSession?.toolActivities || []}
        currentActivity={activeSession?.currentActivity}
        onRetry={handleRetry}
        onRegenerate={handleRegenerate}
        onToggleBookmark={handleToggleMessageBookmark}
        isSessionRunning={activeSession?.status === 'running'}
        sessionId={activeSession?.id}
      />
    ),
    [
      lastAssistantIndex,
      activeSession?.toolActivities,
      activeSession?.currentActivity,
      activeSession?.status,
      activeSession?.id,
      handleRetry,
      handleRegenerate,
      handleToggleMessageBookmark,
    ]
  );

  // File approval handlers
  const handleFileApprove = useCallback((path: string) => {
    setApprovedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleApproveAll = useCallback(() => {
    setApprovedFiles(new Set(fileChanges.map((f) => f.path)));
  }, [fileChanges]);

  const handleClearAll = useCallback(() => {
    setApprovedFiles(new Set());
  }, []);

  const handleDiscardFile = useCallback(async (path: string) => {
    if (!activeSessionId) return;
    try {
      const body: { files: string[]; repoId?: string } = { files: [path] };
      if (activeSession?.repoIds?.[0]) body.repoId = activeSession.repoIds[0];
      await api('POST', `/terminal/sessions/${activeSessionId}/git-discard`, body);
      setApprovedFiles((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      fetchGitStatus(activeSessionId);
    } catch (err) {
      console.error('Failed to discard file:', err);
    }
  }, [activeSessionId, activeSession?.repoIds, fetchGitStatus]);

  const handleDeleteFile = useCallback(async (path: string) => {
    if (!activeSessionId) return;
    try {
      const body: { file: string; repoId?: string } = { file: path };
      if (activeSession?.repoIds?.[0]) body.repoId = activeSession.repoIds[0];
      await api('POST', `/terminal/sessions/${activeSessionId}/git-delete-untracked`, body);
      setApprovedFiles((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      fetchGitStatus(activeSessionId);
    } catch (err) {
      console.error('Failed to delete file:', err);
    }
  }, [activeSessionId, activeSession?.repoIds, fetchGitStatus]);

  // Execute the actual send (used directly and after budget gate)
  const executeSend = useCallback((agentId?: string, chainIds?: string[]) => {
    if (chainIds && chainIds.length > 1) {
      handleSend(undefined, undefined, chainIds);
      agents.selectedAgents.forEach((a) => agents.addToRecentAgents(a));
    } else if (chainIds && chainIds.length === 1) {
      handleSend(undefined, chainIds[0]);
      agents.addToRecentAgents(agents.selectedAgents[0]);
    } else if (agentId) {
      handleSend(undefined, agentId);
      const agent = agents.allAgents.find(a => a.id === agentId);
      if (agent) agents.addToRecentAgents(agent);
    } else {
      handleSend();
    }
    agents.clearChain();
  }, [handleSend, agents]);

  // Budget-gated send: check if threshold needs acknowledgment first
  const budgetGatedSend = useCallback((agentId?: string, chainIds?: string[]) => {
    if (budgetCheck && budgetCheck.thresholdHit && budgetCheck.thresholdHit > acknowledgedThreshold) {
      // Threshold exceeded and not yet acknowledged — show modal
      setPendingSendArgs({ agentId, chainIds });
      setShowBudgetLimitModal(true);
      return;
    }
    executeSend(agentId, chainIds);
  }, [budgetCheck, acknowledgedThreshold, executeSend]);

  // Composer component
  const composerElement = (
    <Composer
      value={input}
      onChange={setInput}
      onSend={() => {
        // Use chain if multiple agents selected, otherwise single agent
        const chainIds = agents.selectedAgents.map((a) => a.id);
        if (chainIds.length > 1) {
          budgetGatedSend(undefined, chainIds);
        } else if (chainIds.length === 1) {
          budgetGatedSend(chainIds[0]);
        } else if (agents.selectedAgent) {
          budgetGatedSend(agents.selectedAgent.id);
        } else {
          budgetGatedSend();
        }
      }}
      onStop={cancelOperation}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      mode={activeSession?.mode || 'direct'}
      onToggleMode={() => {
        // Prevent toggling away from plan mode if require-plan-mode degradation is active
        if (activeDegradations.some(d => d.type === 'require-plan-mode') && activeSession?.mode === 'plan') return;
        setMode(activeSession?.mode === 'plan' ? 'direct' : 'plan');
      }}
      budgetBlocked={budgetCheck?.enforcement === 'hard' && !budgetCheck?.allowed}
      showPreSendEstimate={true}
      onAttach={() => fileInputRef.current?.click()}
      inputRef={terminal.inputRef}
      disabled={false}
      isSending={isSending}
      isGenerating={activeSession?.status === 'running'}
      isUploading={isUploading}
      queueCount={activeSession?.messageQueue?.length || 0}
      pendingAttachments={pendingAttachments}
      onRemoveAttachment={(id) => removePendingAttachment(activeSessionId!, id)}
      agents={agents.allAgents}
      pinnedAgents={agents.pinnedAgents}
      recentAgents={agents.recentAgents}
      userAgents={agents.userAgents}
      builtinAgents={agents.builtinAgents}
      selectedAgent={agents.selectedAgent}
      onAgentSelect={agents.setSelectedAgent}
      agentSearchQuery={agents.searchQuery}
      onAgentSearchChange={agents.setSearchQuery}
      onBrowseAgents={ui.openAgents}
      // Chain props
      selectedAgents={agents.selectedAgents}
      onAddAgentToChain={agents.addAgentToChain}
      onRemoveAgentFromChain={agents.removeAgentFromChain}
      onReorderChain={agents.reorderChain}
      onClearChain={agents.clearChain}
      maxChainLength={agents.maxChainLength}
    />
  );

  // No session state
  if (!activeSession) {
    // Still loading app data -> show loading state to prevent flash of onboarding
    if (terminal.isLoadingAppData) {
      return (
        <div className="h-screen flex items-center justify-center bg-[#05070c]">
          <div className="pointer-events-none fixed inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent" />
            <div className="absolute -top-32 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-blue-500/5 blur-3xl" />
          </div>
          <div className="relative z-10 flex flex-col items-center gap-4">
            <Logo size="lg" />
            <div className="h-1.5 w-48 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white/20 rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </div>
        </div>
      );
    }

    // No workspaces -> show onboarding flow
    if (workspaces.length === 0) {
      return (
        <OnboardingFlow
          onComplete={() => {
            loadData({ forceRefresh: true });
          }}
        />
      );
    }

    // Check if an idea is active (no session but idea selected)
    if (ideaStore.activeIdeaId) {
      const activeIdea = ideaStore.ideas.find(i => i.id === ideaStore.activeIdeaId);
      if (activeIdea) {
        return (
          <div className="h-screen flex flex-col bg-[#0a0d14] text-white overflow-hidden">
            {/* Header */}
            <header className="relative z-10 flex items-center px-4 py-3 border-b border-purple-500/10">
              <div className="flex items-center">
                <Logo size="lg" />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <div className="hidden lg:block">
                  <WalletGauge />
                </div>
                <div className="hidden md:flex lg:hidden items-center gap-2">
                  <QuotaChip
                    label="5h"
                    pct={quota ? Math.round(quota.five_hour.utilization * 100) : undefined}
                    resetTime={quota ? getRelativeResetTime(quota.five_hour.resets_at) : undefined}
                    onClick={() => ui.openOverlay('usage-dashboard')}
                    isHourly={true}
                  />
                  <QuotaChip
                    label="7d"
                    pct={quota ? Math.round(quota.seven_day.utilization * 100) : undefined}
                    resetTime={quota ? getRelativeResetTime(quota.seven_day.resets_at) : undefined}
                    onClick={() => ui.openOverlay('usage-dashboard')}
                    isHourly={false}
                  />
                </div>
                <button
                  onClick={() => setShowSettings(true)}
                  className="p-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
                >
                  <Settings className="h-5 w-5" />
                </button>
              </div>
            </header>

            {/* Idea View + Panel layout */}
            <div className="relative z-10 flex-1 flex min-h-0">
              <IdeaView
                onOpenAttachModal={() => setShowAttachModal(true)}
                onOpenPromoteModal={() => setShowPromoteModal(true)}
              />
              {ideaStore.showIdeaPanel && (
                <IdeaPanel
                  onClose={() => ideaStore.toggleIdeaPanel()}
                />
              )}
            </div>

            {/* RepoDock with ideas */}
            <RepoDock
              repos={[]}
              onRepoClick={() => {}}
              onRepoRemove={handleCloseSession}
              ideaItems={ideaStore.ideas.filter(i => i.status !== 'promoted' && (ideaStore.openIdeaIds.has(i.id) || i.status === 'saved'))}
              activeIdeaId={ideaStore.activeIdeaId}
              onIdeaClick={(id) => ideaStore.switchIdea(id)}
              onIdeaClose={(id) => ideaStore.closeIdea(id)}
              onNewIdea={() => ideaStore.createIdea()}
              onNewSession={() => ui.openNewSession()}
            />

            {/* Modals */}
            {showAttachModal && (
              <AttachRepoModal
                idea={activeIdea}
                repos={repos}
                onAttach={(repoId) => {
                  ideaStore.attachToRepo(ideaStore.activeIdeaId!, repoId);
                  setShowAttachModal(false);
                }}
                onClose={() => setShowAttachModal(false)}
              />
            )}
            {showPromoteModal && (
              <PromoteModal
                idea={activeIdea}
                onPromote={async (opts) => {
                  const ideaId = ideaStore.activeIdeaId!;
                  const result = await ideaStore.promoteIdea(ideaId, opts);
                  setShowPromoteModal(false);
                  // Reload repos so the newly created repo is available, then open a session for it
                  await loadData({ forceRefresh: true });
                  ideaStore.closeIdea(ideaId);
                  await terminal.createSession(result.repoId, result.handoffSummary
                    ? { handoffSummary: result.handoffSummary }
                    : undefined
                  );
                }}
                onClose={() => setShowPromoteModal(false)}
              />
            )}

            {/* Overlay Manager for new session modal */}
            <OverlayManager
              newSessionProps={{
                onCreateSession: terminal.handleCreateSession,
                workspaces: terminal.workspaces,
                repos: terminal.repos,
                isLoadingAppData: terminal.isLoadingAppData,
                selectedWorkspaceId: terminal.selectedWorkspaceId,
                onWorkspaceChange: terminal.setSelectedWorkspaceId,
                selectedRepoIds: terminal.selectedRepoIds,
                onToggleRepoSelection: terminal.toggleRepoSelection,
                repoSearch: terminal.repoSearch,
                onRepoSearchChange: terminal.setRepoSearch,
                highlightedRepoIndex: terminal.highlightedRepoIndex,
                onHighlightedRepoIndexChange: terminal.setHighlightedRepoIndex,
                filteredRepos: terminal.filteredRepos,
                reposByWorkspace: terminal.reposByWorkspace,
                showCreateRepoForm: terminal.showCreateRepoForm,
                onShowCreateRepoForm: terminal.setShowCreateRepoForm,
                newRepoName: terminal.newRepoName,
                onNewRepoNameChange: terminal.setNewRepoName,
                createRepoWorkspaceId: terminal.createRepoWorkspaceId,
                onCreateRepoWorkspaceIdChange: terminal.setCreateRepoWorkspaceId,
                isCreatingRepo: terminal.isCreatingRepo,
                createRepoError: terminal.createRepoError,
                onCreateRepoInline: terminal.handleCreateRepoInline,
                worktreeAction: terminal.worktreeAction,
                onWorktreeActionChange: terminal.setWorktreeAction,
                worktreeBranch: terminal.worktreeBranch,
                onWorktreeBranchChange: terminal.setWorktreeBranch,
                worktreeBaseBranch: terminal.worktreeBaseBranch,
                onWorktreeBaseBranchChange: terminal.setWorktreeBaseBranch,
                availableBranches: terminal.availableBranches,
                loadingBranches: terminal.loadingBranches,
                mainBranch: terminal.mainBranch,
                existingWorktrees: terminal.existingWorktrees,
                selectedWorktreePath: terminal.selectedWorktreePath,
                onSelectedWorktreePathChange: terminal.setSelectedWorktreePath,
                loadingWorktrees: terminal.loadingWorktrees,
                onGitInit: terminal.handleGitInit,
              }}
              sessions={[]}
              currentSessionId={null}
              messages={[]}
              sessionName=""
              quota={quota}
              onRefreshQuota={fetchQuota}
            />

            <SettingsDrawer isOpen={showSettings} onClose={() => setShowSettings(false)} />
          </div>
        );
      }
    }

    // Has workspaces but no session -> show branded empty state with dual CTAs
    const savedIdeas = ideaStore.ideas.filter(i => i.status === 'saved');

    return (
      <div className="h-screen flex flex-col bg-[#05070c] text-white overflow-hidden">
        {/* Background texture — same as active state */}
        <div className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent" />
          <div className="absolute -top-32 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-blue-500/5 blur-3xl" />
        </div>

        {/* Header — matches active state structure */}
        <header className="relative z-10 flex items-center px-4 py-3 border-b border-white/10">
          <div className="flex items-center">
            <Logo size="lg" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Center content — branded empty state with dual CTAs */}
        <main className="relative z-10 flex-1 flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-lg"
          >
            {/* Glass card */}
            <div className="rounded-3xl bg-white/[0.03] ring-1 ring-white/[0.08] p-10">
              {/* Logo as hero */}
              <div className="flex justify-center mb-6">
                <Logo size="lg" showText={false} />
              </div>

              <h1 className="text-2xl font-semibold text-white mb-3">
                Start a conversation
              </h1>
              <p className="text-sm text-white/50 leading-relaxed mb-8 max-w-sm mx-auto">
                No repo? No problem.
              </p>

              {/* Dual CTAs */}
              <div className="flex items-center justify-center gap-3 mb-6">
                <button
                  onClick={() => ideaStore.createIdea()}
                  className="inline-flex items-center gap-2 rounded-xl bg-purple-500/15 px-6 py-3 text-sm font-semibold text-purple-200 ring-1 ring-purple-500/20 hover:bg-purple-500/25 transition-all"
                >
                  <Lightbulb className="h-4 w-4" />
                  New Idea
                </button>
                <button
                  onClick={() => ui.openNewSession()}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
                >
                  <FolderGit2 className="h-4 w-4" />
                  New Session
                </button>
              </div>

              {/* Keyboard hints */}
              <p className="text-xs text-white/25">
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-mono text-[11px]">
                  Ctrl+Shift+I
                </kbd>
                {' '}idea{' '}
                <kbd className="ml-2 px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-mono text-[11px]">
                  Ctrl+Shift+T
                </kbd>
                {' '}session
              </p>
            </div>

            {/* Recent ideas */}
            {savedIdeas.length > 0 && (
              <div className="mt-8">
                <p className="text-xs text-white/30 uppercase tracking-wider mb-3">Recent Ideas</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {savedIdeas.slice(0, 3).map((idea) => (
                    <button
                      key={idea.id}
                      onClick={() => ideaStore.switchIdea(idea.id)}
                      className="inline-flex items-center gap-2 rounded-xl bg-purple-500/5 px-4 py-2.5 text-sm text-white/70 ring-1 ring-purple-500/10 hover:bg-purple-500/10 hover:text-white/90 transition-all"
                    >
                      <Lightbulb className="h-3.5 w-3.5 text-purple-400" />
                      <span className="truncate max-w-[120px]">{idea.title || 'Untitled Idea'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </main>

        {/* Overlay Manager for new session modal */}
        <OverlayManager
          newSessionProps={{
            onCreateSession: terminal.handleCreateSession,
            workspaces: terminal.workspaces,
            repos: terminal.repos,
            isLoadingAppData: terminal.isLoadingAppData,
            selectedWorkspaceId: terminal.selectedWorkspaceId,
            onWorkspaceChange: terminal.setSelectedWorkspaceId,
            selectedRepoIds: terminal.selectedRepoIds,
            onToggleRepoSelection: terminal.toggleRepoSelection,
            repoSearch: terminal.repoSearch,
            onRepoSearchChange: terminal.setRepoSearch,
            highlightedRepoIndex: terminal.highlightedRepoIndex,
            onHighlightedRepoIndexChange: terminal.setHighlightedRepoIndex,
            filteredRepos: terminal.filteredRepos,
            reposByWorkspace: terminal.reposByWorkspace,
            showCreateRepoForm: terminal.showCreateRepoForm,
            onShowCreateRepoForm: terminal.setShowCreateRepoForm,
            newRepoName: terminal.newRepoName,
            onNewRepoNameChange: terminal.setNewRepoName,
            createRepoWorkspaceId: terminal.createRepoWorkspaceId,
            onCreateRepoWorkspaceIdChange: terminal.setCreateRepoWorkspaceId,
            isCreatingRepo: terminal.isCreatingRepo,
            createRepoError: terminal.createRepoError,
            onCreateRepoInline: terminal.handleCreateRepoInline,
            worktreeAction: terminal.worktreeAction,
            onWorktreeActionChange: terminal.setWorktreeAction,
            worktreeBranch: terminal.worktreeBranch,
            onWorktreeBranchChange: terminal.setWorktreeBranch,
            worktreeBaseBranch: terminal.worktreeBaseBranch,
            onWorktreeBaseBranchChange: terminal.setWorktreeBaseBranch,
            availableBranches: terminal.availableBranches,
            loadingBranches: terminal.loadingBranches,
            mainBranch: terminal.mainBranch,
            existingWorktrees: terminal.existingWorktrees,
            selectedWorktreePath: terminal.selectedWorktreePath,
            onSelectedWorktreePathChange: terminal.setSelectedWorktreePath,
            loadingWorktrees: terminal.loadingWorktrees,
            onGitInit: terminal.handleGitInit,
          }}
          sessions={[]}
          currentSessionId={null}
          messages={[]}
          sessionName=""
          quota={quota}
          onRefreshQuota={fetchQuota}
        />

        {/* Settings Drawer */}
        <SettingsDrawer isOpen={showSettings} onClose={() => setShowSettings(false)} />
      </div>
    );
  }

  // Active idea takes priority over active session view
  if (ideaStore.activeIdeaId) {
    const activeIdea = ideaStore.ideas.find(i => i.id === ideaStore.activeIdeaId);
    if (activeIdea) {
      return (
        <div className="h-screen flex flex-col bg-[#0a0d14] text-white overflow-hidden">
          {/* Header */}
          <header className="relative z-10 flex items-center px-4 py-3 border-b border-purple-500/10">
            <div className="flex items-center">
              <Logo size="lg" />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden lg:block">
                <WalletGauge />
              </div>
              <div className="hidden md:flex lg:hidden items-center gap-2">
                <QuotaChip
                  label="5h"
                  pct={quota ? Math.round(quota.five_hour.utilization * 100) : undefined}
                  resetTime={quota ? getRelativeResetTime(quota.five_hour.resets_at) : undefined}
                  onClick={() => ui.openOverlay('usage-dashboard')}
                  isHourly={true}
                />
                <QuotaChip
                  label="7d"
                  pct={quota ? Math.round(quota.seven_day.utilization * 100) : undefined}
                  resetTime={quota ? getRelativeResetTime(quota.seven_day.resets_at) : undefined}
                  onClick={() => ui.openOverlay('usage-dashboard')}
                  isHourly={false}
                />
              </div>
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </header>

          {/* Idea View + Panel layout */}
          <div className="relative z-10 flex-1 flex min-h-0">
            <IdeaView
              onOpenAttachModal={() => setShowAttachModal(true)}
              onOpenPromoteModal={() => setShowPromoteModal(true)}
            />
            {ideaStore.showIdeaPanel && (
              <IdeaPanel
                onClose={() => ideaStore.toggleIdeaPanel()}
              />
            )}
          </div>

          {/* RepoDock with ideas + sessions */}
          <RepoDock
            repos={repoStatuses}
            onRepoClick={(sessionId) => {
              ideaStore.clearActiveIdea();
              switchSession(sessionId);
            }}
            onRepoRemove={handleCloseSession}
            ideaItems={ideaStore.ideas.filter(i => i.status !== 'promoted' && (ideaStore.openIdeaIds.has(i.id) || i.status === 'saved'))}
            activeIdeaId={ideaStore.activeIdeaId}
            onIdeaClick={(id) => ideaStore.switchIdea(id)}
            onIdeaClose={(id) => ideaStore.closeIdea(id)}
            onNewIdea={() => ideaStore.createIdea()}
            onNewSession={() => ui.openNewSession()}
          />

          {/* Modals */}
          {showAttachModal && (
            <AttachRepoModal
              idea={activeIdea}
              repos={repos}
              onAttach={(repoId) => {
                ideaStore.attachToRepo(ideaStore.activeIdeaId!, repoId);
                setShowAttachModal(false);
              }}
              onClose={() => setShowAttachModal(false)}
            />
          )}
          {showPromoteModal && (
            <PromoteModal
              idea={activeIdea}
              onPromote={async (opts) => {
                const ideaId = ideaStore.activeIdeaId!;
                const result = await ideaStore.promoteIdea(ideaId, opts);
                setShowPromoteModal(false);
                // Reload repos so the newly created repo is available, then open a session for it
                await loadData({ forceRefresh: true });
                ideaStore.closeIdea(ideaId);
                await terminal.createSession(result.repoId, result.handoffSummary
                  ? { handoffSummary: result.handoffSummary }
                  : undefined
                );
              }}
              onClose={() => setShowPromoteModal(false)}
            />
          )}

          {/* Close Worktree Dialog */}
          {closeWorktreeDialog.isOpen && closeWorktreeDialog.sessionId && (() => {
            const session = sessions.find(s => s.id === closeWorktreeDialog.sessionId);
            if (!session) return null;

            return (
              <CloseWorktreeDialog
                isOpen={true}
                onClose={() => {
                  const { resolve } = closeWorktreeDialog;
                  setCloseWorktreeDialog({ isOpen: false, sessionId: null });
                  if (resolve) resolve(); // Resolve without closing session (user cancelled)
                }}
                session={{
                  id: session.id,
                  name: session.name,
                  branch: session.branch || 'unknown',
                  worktreePath: session.worktreePath || '',
                  baseBranch: session.baseBranch,
                  ownsWorktree: session.ownsWorktree,
                  status: session.status,
                }}
                gitStatus={session.gitStatus ? {
                  modified: session.gitStatus.files?.filter((f: any) => f.status === 'modified').length || 0,
                  staged: session.gitStatus.files?.filter((f: any) => f.status === 'staged').length || 0,
                  untracked: session.gitStatus.files?.filter((f: any) => f.status === 'untracked' || f.status === 'created').length || 0,
                } : undefined}
                prInfo={existingPR && session.id === activeSessionId ? {
                  number: existingPR.number,
                  url: existingPR.url,
                } : undefined}
                unpushedCommits={commitsAheadOfBase && session.id === activeSessionId ? commitsAheadOfBase : undefined}
                onConfirm={handleWorktreeDialogConfirm}
              />
            );
          })()}

          {/* Overlay Manager for new session modal */}
          <OverlayManager
            newSessionProps={{
              onCreateSession: terminal.handleCreateSession,
              workspaces: terminal.workspaces,
              repos: terminal.repos,
              isLoadingAppData: terminal.isLoadingAppData,
              selectedWorkspaceId: terminal.selectedWorkspaceId,
              onWorkspaceChange: terminal.setSelectedWorkspaceId,
              selectedRepoIds: terminal.selectedRepoIds,
              onToggleRepoSelection: terminal.toggleRepoSelection,
              repoSearch: terminal.repoSearch,
              onRepoSearchChange: terminal.setRepoSearch,
              highlightedRepoIndex: terminal.highlightedRepoIndex,
              onHighlightedRepoIndexChange: terminal.setHighlightedRepoIndex,
              filteredRepos: terminal.filteredRepos,
              reposByWorkspace: terminal.reposByWorkspace,
              showCreateRepoForm: terminal.showCreateRepoForm,
              onShowCreateRepoForm: terminal.setShowCreateRepoForm,
              newRepoName: terminal.newRepoName,
              onNewRepoNameChange: terminal.setNewRepoName,
              createRepoWorkspaceId: terminal.createRepoWorkspaceId,
              onCreateRepoWorkspaceIdChange: terminal.setCreateRepoWorkspaceId,
              isCreatingRepo: terminal.isCreatingRepo,
              createRepoError: terminal.createRepoError,
              onCreateRepoInline: terminal.handleCreateRepoInline,
              worktreeAction: terminal.worktreeAction,
              onWorktreeActionChange: terminal.setWorktreeAction,
              worktreeBranch: terminal.worktreeBranch,
              onWorktreeBranchChange: terminal.setWorktreeBranch,
              worktreeBaseBranch: terminal.worktreeBaseBranch,
              onWorktreeBaseBranchChange: terminal.setWorktreeBaseBranch,
              availableBranches: terminal.availableBranches,
              loadingBranches: terminal.loadingBranches,
              mainBranch: terminal.mainBranch,
              existingWorktrees: terminal.existingWorktrees,
              selectedWorktreePath: terminal.selectedWorktreePath,
              onSelectedWorktreePathChange: terminal.setSelectedWorktreePath,
              loadingWorktrees: terminal.loadingWorktrees,
              onGitInit: terminal.handleGitInit,
            }}
            sessions={[]}
            currentSessionId={null}
            messages={[]}
            sessionName=""
            quota={quota}
            onRefreshQuota={fetchQuota}
          />

          <SettingsDrawer isOpen={showSettings} onClose={() => setShowSettings(false)} />
        </div>
      );
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#05070c] text-white overflow-hidden">
      {/* Background texture */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent" />
        <div
          className={cn(
            'absolute -top-32 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full blur-3xl transition-colors duration-500',
            activePhase === 'prompt' && 'bg-blue-500/5',
            activePhase === 'review' && 'bg-amber-500/5',
            activePhase === 'ship' && 'bg-emerald-500/5'
          )}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/10">
        {/* Left - Logo (hidden on mobile to give phases room) */}
        <div className="hidden sm:flex items-center flex-shrink-0">
          <Logo size="lg" />
        </div>

        {/* Center - Phase Navigator (flex-1 to fill available space and center naturally) */}
        <div className="flex-1 flex justify-center min-w-0">
          <PhaseNavigator
            activePhase={activePhase}
            onPhaseChange={setActivePhase}
            messageCount={messageCount}
            fileCount={fileCount}
            warningCount={warningCount}
            isRunning={activeSession.status === 'running'}
            canReview={canReview}
            canShip={canShip}
            existingPR={existingPR}
          />
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Budget wallet gauge - hidden on small screens */}
          <div className="hidden lg:block">
            <WalletGauge />
          </div>
          {/* Fallback: QuotaChips on medium screens */}
          <div className="hidden md:flex lg:hidden items-center gap-2">
            <QuotaChip
              label="5h"
              pct={quota ? Math.round(quota.five_hour.utilization * 100) : undefined}
              resetTime={quota ? getRelativeResetTime(quota.five_hour.resets_at) : undefined}
              onClick={() => ui.openOverlay('usage-dashboard')}
              isHourly={true}
            />
            <QuotaChip
              label="7d"
              pct={quota ? Math.round(quota.seven_day.utilization * 100) : undefined}
              resetTime={quota ? getRelativeResetTime(quota.seven_day.resets_at) : undefined}
              onClick={() => ui.openOverlay('usage-dashboard')}
              isHourly={false}
            />
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg text-white/50 hover:text-white/80 active:text-white/80 hover:bg-white/5 active:bg-white/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Budget degradation banner */}
      {activeDegradations.length > 0 && quota && (
        <DegradationBanner
          activeDegradations={activeDegradations}
          currentUsagePct={quota.five_hour.utilization * 100}
          onViewDetails={() => setShowDegradationPanel(true)}
        />
      )}

      {/* Degradation details panel */}
      <DegradationPanel
        isOpen={showDegradationPanel}
        onClose={() => setShowDegradationPanel(false)}
        activeDegradations={activeDegradations}
        currentUsagePct={quota ? quota.five_hour.utilization * 100 : 0}
        targetThreshold={budgetCheck?.thresholdHit ?? 70}
        onTurnOff={async () => {
          await api('PUT', '/terminal/usage/budget-config', { enabled: false }).catch(() => {});
          setActiveDegradations([]);
        }}
        onAdjustLimits={() => setShowSettings(true)}
      />

      {/* Budget limit modal */}
      {budgetCheck && showBudgetLimitModal && (
        <BudgetLimitModal
          isOpen={showBudgetLimitModal}
          onClose={() => setShowBudgetLimitModal(false)}
          budgetCheck={budgetCheck}
          currentUsage={{
            fiveHour: quota ? quota.five_hour.utilization * 100 : 0,
            sevenDay: quota ? quota.seven_day.utilization * 100 : 0,
          }}
          resetTime5h={quota?.five_hour.resets_at}
          resetTime7d={quota?.seven_day.resets_at}
          onSendAnyway={() => {
            if (budgetCheck?.thresholdHit) setAcknowledgedThreshold(budgetCheck.thresholdHit);
            setShowBudgetLimitModal(false);
            if (pendingSendArgs) {
              executeSend(pendingSendArgs.agentId, pendingSendArgs.chainIds);
              setPendingSendArgs(null);
            }
          }}
          onSwitchModel={() => {
            // Switch to the model suggested by degradation steps
            const switchStep = activeDegradations.find(d => d.type === 'switch-model' && d.model);
            if (switchStep?.model && activeSessionId) {
              api('PATCH', `/terminal/sessions/${activeSessionId}/model`, { model: switchStep.model }).catch(() => {});
            }
            if (budgetCheck?.thresholdHit) setAcknowledgedThreshold(budgetCheck.thresholdHit);
            setShowBudgetLimitModal(false);
            if (pendingSendArgs) {
              executeSend(pendingSendArgs.agentId, pendingSendArgs.chainIds);
              setPendingSendArgs(null);
            }
          }}
          onEditMessage={() => {
            setShowBudgetLimitModal(false);
            setPendingSendArgs(null);
          }}
          onOpenSettings={() => { setShowBudgetLimitModal(false); setShowSettings(true); }}
        />
      )}

      {/* Main content area */}
      <main className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {activePhase === 'prompt' && (
            <motion.div
              key="prompt"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <PromptPhase
                messages={activeSession.messages || []}
                toolActivities={activeSession.toolActivities || []}
                currentActivity={activeSession.currentActivity}
                isRunning={activeSession.status === 'running'}
                isEmpty={(activeSession.messages?.length || 0) === 0}
                renderMessage={renderMessage}
                messagesEndRef={messagesEndRef}
                composer={composerElement}
              />
            </motion.div>
          )}

          {activePhase === 'review' && (
            <motion.div
              key="review"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <ReviewPhase
                sessionId={activeSessionId!}
                repoId={activeSession.repoIds?.[0]}
                files={fileChanges}
                onFileApprove={handleFileApprove}
                onApproveAll={handleApproveAll}
                onClearAll={handleClearAll}
                onDiscardFile={handleDiscardFile}
                onDeleteFile={handleDeleteFile}
                onNavigateToShip={() => setActivePhase('ship')}
              />
            </motion.div>
          )}

          {activePhase === 'ship' && (
            <motion.div
              key="ship"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <ShipPhase
                sessionId={activeSessionId!}
                repoId={activeSession.repoIds?.[0]}
                isMultiRepo={activeSession.isMultiRepo}
                reviewFiles={fileChanges.map(f => f.path)}
                onSuccess={() => {
                  setApprovedFiles(new Set());
                  // Invalidate cached git status and re-fetch so Review/Ship
                  // reflect post-commit state (no pending changes)
                  requestCache.invalidate(CACHE_KEYS.GIT_STATUS(activeSessionId!));
                  fetchGitStatus(activeSessionId!);
                  setActivePhase('prompt');
                }}
                onGoBack={() => setActivePhase('prompt')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Repo Dock */}
      <RepoDock
        repos={repoStatuses}
        onRepoClick={(sessionId) => {
          ideaStore.clearActiveIdea();
          switchSession(sessionId);
        }}
        onRepoRemove={handleCloseSession}
        ideaItems={ideaStore.ideas.filter(i => i.status !== 'promoted' && (ideaStore.openIdeaIds.has(i.id) || i.status === 'saved'))}
        activeIdeaId={ideaStore.activeIdeaId}
        onIdeaClick={(id) => {
          ideaStore.switchIdea(id);
        }}
        onIdeaClose={(id) => ideaStore.closeIdea(id)}
        onNewIdea={() => ideaStore.createIdea()}
        onNewSession={() => ui.openNewSession()}
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Overlay Manager for modals (agents, new session, etc.) */}
      <OverlayManager
        newSessionProps={{
          onCreateSession: terminal.handleCreateSession,
          workspaces: terminal.workspaces,
          repos: terminal.repos,
          isLoadingAppData: terminal.isLoadingAppData,
          selectedWorkspaceId: terminal.selectedWorkspaceId,
          onWorkspaceChange: terminal.setSelectedWorkspaceId,
          selectedRepoIds: terminal.selectedRepoIds,
          onToggleRepoSelection: terminal.toggleRepoSelection,
          repoSearch: terminal.repoSearch,
          onRepoSearchChange: terminal.setRepoSearch,
          highlightedRepoIndex: terminal.highlightedRepoIndex,
          onHighlightedRepoIndexChange: terminal.setHighlightedRepoIndex,
          filteredRepos: terminal.filteredRepos,
          reposByWorkspace: terminal.reposByWorkspace,
          showCreateRepoForm: terminal.showCreateRepoForm,
          onShowCreateRepoForm: terminal.setShowCreateRepoForm,
          newRepoName: terminal.newRepoName,
          onNewRepoNameChange: terminal.setNewRepoName,
          createRepoWorkspaceId: terminal.createRepoWorkspaceId,
          onCreateRepoWorkspaceIdChange: terminal.setCreateRepoWorkspaceId,
          isCreatingRepo: terminal.isCreatingRepo,
          createRepoError: terminal.createRepoError,
          onCreateRepoInline: terminal.handleCreateRepoInline,
          worktreeAction: terminal.worktreeAction,
          onWorktreeActionChange: terminal.setWorktreeAction,
          worktreeBranch: terminal.worktreeBranch,
          onWorktreeBranchChange: terminal.setWorktreeBranch,
          worktreeBaseBranch: terminal.worktreeBaseBranch,
          onWorktreeBaseBranchChange: terminal.setWorktreeBaseBranch,
          availableBranches: terminal.availableBranches,
          loadingBranches: terminal.loadingBranches,
          mainBranch: terminal.mainBranch,
          existingWorktrees: terminal.existingWorktrees,
          selectedWorktreePath: terminal.selectedWorktreePath,
          onSelectedWorktreePathChange: terminal.setSelectedWorktreePath,
          loadingWorktrees: terminal.loadingWorktrees,
          onGitInit: terminal.handleGitInit,
        }}
        sessions={sessions}
        currentSessionId={activeSessionId}
        messages={activeSession?.messages || []}
        sessionName={activeSession?.name || ''}
        quota={quota}
        onRefreshQuota={fetchQuota}
        onSelectAgent={(agent: any) => {
          agents.clearChain();
          agents.addAgentToChain(agent);
        }}
        activeRepoId={activeSession?.repoIds?.[0]}
      />

      {/* Settings Drawer */}
      <SettingsDrawer isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
