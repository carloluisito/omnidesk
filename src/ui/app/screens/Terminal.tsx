/**
 * Terminal.tsx - Rebuilt with new glassmorphism design
 * Uses useTerminal hook for logic and v2 components for UI
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Loader2,
  Terminal as TerminalIcon,
  GitBranch,
  Search,
  FolderOpen,
  Folder,
  Plus,
  Trash2,
  Code,
  Check,
  FileText,
  Mic,
  Zap,
  Eye,
  Play,
  Rocket,
  Command,
  FolderPlus,
  Columns,
  Maximize2,
  FileDown,
  MoreVertical,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Upload,
  Wifi,
  WifiOff,
  FileDiff,
  AlertTriangle,
  Clock,
} from 'lucide-react';

// Hooks and stores
import { useTerminal, PALETTE_COMMANDS, parseQuestionsFromContent } from '../hooks/useTerminal';
import { useAgents } from '../hooks/useAgents';
import { cn } from '../lib/cn';

// UI components
import { BackgroundTexture } from '../components/ui/BackgroundTexture';
import { MobileBottomSheet } from '../components/ui/MobileBottomSheet';
import { QuotaAlertBanner } from '../components/ui/QuotaAlertBanner';

// v2 Terminal components
import {
  TopBar,
  TabStrip,
  SessionTab,
  WorkspaceHeader,
  ConversationPanel,
  Composer,
  ActionRail,
  SidePanel,
  TimelineItem,
  ChangedFile,
  MobileFAB,
  MobileActionsSheet,
} from '../components/terminal/v2';
// Note: TimelineItem is still imported for MobileActionsSheet

// Existing terminal components (unchanged APIs)
import { MessageItem } from '../components/terminal/MessageItem';
import { SessionSearch } from '../components/terminal/SessionSearch';
import { PreviewPanel } from '../components/terminal/PreviewPanel';
import { MobilePreviewSheet } from '../components/terminal/MobilePreviewSheet';
import { MobilePreviewOverlay } from '../components/terminal/MobilePreviewOverlay';
import { StartAppModal } from '../components/terminal/StartAppModal';
import { ExpandedInputModal } from '../components/terminal/ExpandedInputModal';
import { SettingsPanel } from '../components/terminal/SettingsPanel';
import { ExportModal } from '../components/terminal/ExportModal';
import { ShipModal } from '../components/terminal/ShipModal';
import { UsageBar } from '../components/terminal/UsageBar';
import { UsageDashboard } from '../components/terminal/UsageDashboard';

// Agents components
import { AgentsPanel } from '../components/agents';

// Types for Claude usage quota
interface ClaudeQuotaBucket {
  utilization: number;
  resets_at: string;
}

interface ClaudeUsageQuota {
  five_hour: ClaudeQuotaBucket;
  seven_day: ClaudeQuotaBucket;
  lastUpdated: string;
}

// SEC-02: Remote Access Warning Banner Component
function RemoteAccessBanner() {
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkRemoteStatus = async () => {
      try {
        const data = await api<{ remoteEnabled: boolean }>('GET', '/system/remote-status');
        setRemoteEnabled(data.remoteEnabled);
      } catch (error) {
        console.error('Failed to check remote status:', error);
      }
    };
    checkRemoteStatus();
  }, []);

  if (!remoteEnabled || dismissed) return null;

  return (
    <div className="fixed top-14 left-0 right-0 z-40 bg-amber-600/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-white">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">
            Remote Access Enabled • This instance is accessible over the network.
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/80 hover:text-white transition-colors p-1"
          aria-label="Dismiss warning"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Extracted components
import { CommandPalette } from '../components/terminal/CommandPalette';
import { ConfirmModal } from '../components/terminal/ConfirmModal';
import { QuestionsPanel } from '../components/terminal/QuestionsPanel';
import {
  SplitSessionSelector,
  AddRepoModal,
  MergeSessionsModal,
  SessionContextMenu,
} from '../components/terminal/SessionModals';
import { NewSessionModal } from '../components/terminal/NewSessionModal';

export default function Terminal() {
  const terminal = useTerminal();

  // Agents hook for agent selection in Composer
  const agents = useAgents();

  // Activity navigation handler - scrolls to and highlights the ActivityTimeline in conversation
  const handleActivityNavigate = useCallback(() => {
    const timeline = document.getElementById('activity-timeline');
    if (timeline) {
      timeline.scrollIntoView({ behavior: 'smooth', block: 'center' });
      timeline.classList.add('highlight-activity');
      setTimeout(() => timeline.classList.remove('highlight-activity'), 1000);
      timeline.focus();
    }
  }, []);

  // Claude usage quota state
  const [quota, setQuota] = useState<ClaudeUsageQuota | null>(null);

  // Usage dashboard modal state
  const [showUsageDashboard, setShowUsageDashboard] = useState(false);

  // Agents panel state
  const [showAgentsPanel, setShowAgentsPanel] = useState(false);

  // Mobile actions sheet state
  const [showMobileActionsSheet, setShowMobileActionsSheet] = useState(false);
  const [mobileActionsInitialTab, setMobileActionsInitialTab] = useState<'timeline' | 'changes'>('timeline');

  // Queue Manager state
  const [showQueueManager, setShowQueueManager] = useState(false);

  // Fetch quota data
  const fetchQuota = useCallback(async () => {
    try {
      const quotaResult = await api<ClaudeUsageQuota | null>('GET', '/terminal/usage/quota');
      setQuota(quotaResult);
    } catch (error) {
      console.error('[Terminal] Error fetching quota:', error);
    }
  }, []);

  // Fetch quota on mount and periodically
  useEffect(() => {
    fetchQuota();
    // Refresh quota every 5 minutes
    const interval = setInterval(fetchQuota, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchQuota]);

  // Keyboard shortcut for Agents panel: Ctrl/Cmd+Shift+A
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setShowAgentsPanel((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Format reset time for display in tooltips
  const getRelativeResetTime = useCallback((resetsAt: string): string => {
    const now = new Date();
    const resetTime = new Date(resetsAt);
    const diffMs = resetTime.getTime() - now.getTime();

    if (diffMs <= 0) return 'now';

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `in ${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `in ${hours}h ${minutes}m`;
    }
    return `in ${minutes}m`;
  }, []);

  // Destructure commonly used values for cleaner JSX
  const {
    navigate,
    sessions,
    activeSessionId,
    isConnected,
    repos,
    workspaces,
    isLoadingAppData,
    activeSession,
    pendingAttachments,
    splitSession,
    hasRunningApp,
    gitStatusDisplay,
    lastAssistantIndex,
    // State
    input,
    setInput,
    splitView,
    setSplitView,
    splitSessionId,
    setSplitSessionId,
    isDragging,
    isSending,
    isUploading,
    // Modal states
    showNewSessionModal,
    setShowNewSessionModal,
    showCommandPalette,
    setShowCommandPalette,
    showAddRepoModal,
    setShowAddRepoModal,
    showMergeModal,
    setShowMergeModal,
    showSessionSearch,
    setShowSessionSearch,
    showSplitSelector,
    setShowSplitSelector,
    showMobileMenu,
    setShowMobileMenu,
    showCreateRepoModal,
    setShowCreateRepoModal,
    showExpandedInput,
    setShowExpandedInput,
    showSettings,
    setShowSettings,
    showExportModal,
    setShowExportModal,
    showShipModal,
    setShowShipModal,
    showRepoSwitcher,
    setShowRepoSwitcher,
    showJumpMenu,
    setShowJumpMenu,
    showMessageSearch,
    setShowMessageSearch,
    messageSearchQuery,
    setMessageSearchQuery,
    messageSearchIndex,
    messageSearchMatches,
    // New session modal
    selectedRepoIds,
    setSelectedRepoIds,
    repoSearch,
    setRepoSearch,
    highlightedRepoIndex,
    setHighlightedRepoIndex,
    filteredRepos,
    reposByWorkspace,
    createRepoWorkspaceId,
    setCreateRepoWorkspaceId,
    showCreateRepoForm,
    setShowCreateRepoForm,
    handleCreateRepoInline,
    worktreeMode,
    setWorktreeMode,
    worktreeAction,
    setWorktreeAction,
    worktreeBranch,
    setWorktreeBranch,
    worktreeBaseBranch,
    setWorktreeBaseBranch,
    availableBranches,
    loadingBranches,
    mainBranch,
    existingWorktrees,
    selectedWorktreePath,
    setSelectedWorktreePath,
    loadingWorktrees,
    deleteWorktreeConfirm,
    setDeleteWorktreeConfirm,
    // Context menu
    contextMenu,
    setContextMenu,
    // Mobile
    mobileMenuTab,
    setMobileMenuTab,
    // Create repo
    newRepoName,
    setNewRepoName,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    isCreatingRepo,
    createRepoError,
    // Toasts
    switcherToast,
    connectionToast,
    // Ship config
    shipConfig,
    setShipConfig,
    // Refs
    messagesEndRef,
    inputRef,
    fileInputRef,
    tabsContainerRef,
    // Handlers
    handleSend,
    handleKeyDown,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    handleCreateSession,
    handleOpenCreateRepoModal,
    handleCreateRepo,
    handleRetry,
    handleRegenerate,
    handleToggleMessageBookmark,
    toggleRepoSelection,
    scrollToMessage,
    jumpToFirstError,
    jumpToLastFileChange,
    getBookmarkedMessages,
    navigateToSearchResult,
    getRepoPath,
    getShortenedPath,
    // Store actions
    switchSession,
    closeSession,
    setMode,
    clearMessages,
    toggleBookmark,
    addRepoToSession,
    mergeSessions,
    exportSession,
    answerPlanQuestion,
    setAdditionalContext,
    approvePlan,
    cancelPlan,
    cancelOperation,
    removePendingAttachment,
    removeFromQueue,
    clearQueue,
    resumeQueue,
    showPreviewPanel,
    setShowPreviewPanel,
    showStartAppModal,
    setShowStartAppModal,
    showMobilePreviewOverlay,
    setShowMobilePreviewOverlay,
  } = terminal;

  // Convert sessions to TabStrip format
  const sessionTabs: SessionTab[] = useMemo(
    () =>
      sessions.map((s) => ({
        id: s.id,
        name: s.repoIds?.[0] || s.repoId || 'Session',
        repo: s.repoIds?.[0] || s.repoId || '',
        branch: s.gitStatus?.branch || s.branch,
        dirtyFiles: (s.gitStatus?.modified || 0) + (s.gitStatus?.staged || 0),
        isMultiRepo: s.isMultiRepo,
        repoCount: s.repoIds?.length || 1,
        isRunning: s.status === 'running',
        isBookmarked: s.isBookmarked,
        worktreeMode: s.worktreeMode,
      })),
    [sessions]
  );

  // Convert tool activities to Timeline format
  const timelineItems: TimelineItem[] = useMemo(() => {
    if (!activeSession?.toolActivities) return [];
    return activeSession.toolActivities.map((activity, index) => ({
      id: activity.id || `activity-${index}`,
      kind: (activity.tool?.toLowerCase() as TimelineItem['kind']) || 'other',
      label: activity.description || activity.tool || 'Activity',
      status: activity.status === 'completed' ? 'ok' : activity.status === 'error' ? 'error' : 'running',
      ms: activity.duration || 0,
    }));
  }, [activeSession?.toolActivities]);

  // Convert git status to ChangedFiles format
  const changedFiles: ChangedFile[] = useMemo(() => {
    if (!activeSession?.gitStatus?.files) return [];
    return activeSession.gitStatus.files.map((f: any) => ({
      path: f.path || f,
      status: f.status || 'modified',
    }));
  }, [activeSession?.gitStatus?.files]);

  // Render message using MessageItem
  const renderMessage = useCallback(
    (message: any, index: number) => {
      const isLastAssistantMessage = message.role === 'assistant' && index === lastAssistantIndex;
      return (
        <MessageItem
          key={message.id}
          message={message}
          isLastAssistantMessage={isLastAssistantMessage}
          toolActivities={activeSession?.toolActivities || []}
          currentActivity={activeSession?.currentActivity}
          onRetry={handleRetry}
          onRegenerate={handleRegenerate}
          onToggleBookmark={handleToggleMessageBookmark}
          isSessionRunning={activeSession?.status === 'running'}
          sessionId={activeSession?.id}
        />
      );
    },
    [lastAssistantIndex, activeSession?.toolActivities, activeSession?.currentActivity, activeSession?.status, activeSession?.id, handleRetry, handleRegenerate, handleToggleMessageBookmark]
  );

  // Apply search filter to repos (filteredRepos already filtered by workspace from hook)
  const searchedRepos = useMemo(() => {
    if (!repoSearch) return filteredRepos;
    const lower = repoSearch.toLowerCase();
    return filteredRepos.filter(
      (r) =>
        r.id.toLowerCase().includes(lower) || r.path.toLowerCase().includes(lower)
    );
  }, [filteredRepos, repoSearch]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#05070c] text-white">
      {/* Background texture */}
      <BackgroundTexture />

      {/* SEC-02: Remote Access Warning Banner */}
      <RemoteAccessBanner />

      {/* Connection Toast - positioned below the top bar and tabs */}
      <AnimatePresence>
        {connectionToast.show && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              'fixed top-32 right-4 z-50 flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-lg ring-1',
              connectionToast.connected
                ? 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30'
                : 'bg-red-500/20 text-red-400 ring-red-500/30'
            )}
          >
            {connectionToast.connected ? (
              <>
                <Wifi className="h-4 w-4" />
                <span className="text-sm font-medium">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4" />
                <span className="text-sm font-medium">Reconnecting...</span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Top Bar */}
        <TopBar
          onNewSession={() => {
            // Set default workspace if not selected
            if (!selectedWorkspaceId && workspaces.length > 0) {
              terminal.setSelectedWorkspaceId(workspaces[0].id);
            }
            setShowNewSessionModal(true);
          }}
          onOpenPalette={() => setShowCommandPalette(true)}
          onSearch={() => setShowSessionSearch(true)}
          onSplit={() => {
            if (splitView) {
              setSplitView(false);
              setSplitSessionId(null);
            } else {
              setShowSplitSelector(true);
            }
          }}
          isSplitActive={splitView}
          hourlyQuota={quota ? Math.round(quota.five_hour.utilization * 100) : undefined}
          weeklyQuota={quota ? Math.round(quota.seven_day.utilization * 100) : undefined}
          hourlyResetTime={quota ? getRelativeResetTime(quota.five_hour.resets_at) : undefined}
          weeklyResetTime={quota ? getRelativeResetTime(quota.seven_day.resets_at) : undefined}
          onQuotaClick={() => setShowUsageDashboard(true)}
        />

        {/* Quota Alert Banner */}
        <QuotaAlertBanner
          hourlyPct={quota ? Math.round(quota.five_hour.utilization * 100) : undefined}
          weeklyPct={quota ? Math.round(quota.seven_day.utilization * 100) : undefined}
          onViewDetails={() => setShowUsageDashboard(true)}
        />

        {/* Session Tabs */}
        <TabStrip
          tabs={sessionTabs}
          activeId={activeSessionId}
          onSelect={switchSession}
          onClose={(id) => {
            const session = sessions.find((s) => s.id === id);
            // Only show confirmation if session explicitly owns the worktree (ownsWorktree === true)
            // Sessions using existing worktrees have ownsWorktree === false and skip the dialog
            if (session?.worktreeMode && session.branch && session.ownsWorktree === true) {
              setDeleteWorktreeConfirm({ sessionId: id, branch: session.branch });
            } else {
              closeSession(id);
            }
          }}
          onToggleBookmark={toggleBookmark}
          onContextMenu={(e, sessionId) => {
            setContextMenu({
              isOpen: true,
              position: { x: e.clientX, y: e.clientY },
              sessionId,
            });
          }}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 w-full px-6 pt-5">
          {activeSession ? (
            <>
              {/* Workspace Header */}
              <WorkspaceHeader
                name={activeSession.repoIds?.[0] || activeSession.repoId || 'Session'}
                repo={getShortenedPath(activeSession.repoIds?.[0] || activeSession.repoId || '')}
                branch={activeSession.gitStatus?.branch || activeSession.branch}
                changesCount={(activeSession.gitStatus?.modified || 0) + (activeSession.gitStatus?.staged || 0)}
                mode={activeSession.mode || 'direct'}
                onToggleMode={() => setMode(activeSession.mode === 'plan' ? 'direct' : 'plan')}
                onJumpTo={() => setShowJumpMenu(!showJumpMenu)}
              />

              {/* Main layout: full width on mobile, 8/4 grid on desktop */}
              <div className="mt-4 flex-1 grid gap-4 sm:grid-cols-12 overflow-hidden min-h-0">
                {/* Left: Conversation + Composer (full width on mobile, 8 cols on tablet+) */}
                <div
                  className={cn(
                    'col-span-12 sm:col-span-8 relative flex flex-col min-h-0',
                    isDragging && 'ring-2 ring-inset ring-blue-500 rounded-3xl'
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {/* Drag overlay */}
                  {isDragging && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 pointer-events-none rounded-3xl">
                      <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-center ring-1 ring-white/20">
                        <Upload className="h-8 w-8 mx-auto mb-2 text-blue-400" />
                        <p className="text-sm font-medium text-white">Drop files to attach</p>
                      </div>
                    </div>
                  )}

                  {/* In-Session Search Bar */}
                  {showMessageSearch && (
                    <div className="flex items-center gap-2 px-4 py-2 mb-3 rounded-2xl bg-white/5 ring-1 ring-white/10">
                      <Search className="h-4 w-4 text-white/40" />
                      <input
                        type="text"
                        value={messageSearchQuery}
                        onChange={(e) => {
                          setMessageSearchQuery(e.target.value);
                          terminal.setMessageSearchIndex(0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            navigateToSearchResult(e.shiftKey ? messageSearchIndex - 1 : messageSearchIndex + 1);
                          }
                          if (e.key === 'Escape') {
                            setShowMessageSearch(false);
                            setMessageSearchQuery('');
                          }
                        }}
                        placeholder="Search in conversation..."
                        className="flex-1 bg-transparent text-sm text-white placeholder-white/35 outline-none"
                        autoFocus
                      />
                      {messageSearchQuery && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/50">
                            {messageSearchMatches.length > 0
                              ? `${messageSearchIndex + 1} of ${messageSearchMatches.length}`
                              : 'No matches'}
                          </span>
                          <button
                            onClick={() => navigateToSearchResult(messageSearchIndex - 1)}
                            disabled={messageSearchMatches.length === 0 || messageSearchIndex === 0}
                            className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => navigateToSearchResult(messageSearchIndex + 1)}
                            disabled={
                              messageSearchMatches.length === 0 ||
                              messageSearchIndex >= messageSearchMatches.length - 1
                            }
                            className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setShowMessageSearch(false);
                          setMessageSearchQuery('');
                        }}
                        className="p-1 rounded hover:bg-white/10 text-white/40"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {/* Conversation Panel */}
                  <ConversationPanel
                    messagesEndRef={messagesEndRef}
                    isEmpty={activeSession.messages.length === 0}
                    isRunning={activeSession.status === 'running'}
                    isThinking={!activeSession.messages.some((m: any) => m.isStreaming)}
                    currentActivity={activeSession.currentActivity}
                    onExport={() => setShowExportModal(true)}
                  >
                    {activeSession.messages.map(renderMessage)}

                    {/* Questions Panel for Plan Mode */}
                    {activeSession.pendingPlan &&
                      activeSession.pendingPlan.questions.length > 0 && (
                        <div className="pt-4">
                          <QuestionsPanel
                            questions={activeSession.pendingPlan.questions}
                            additionalContext={activeSession.pendingPlan.additionalContext || ''}
                            onAnswer={(questionId, answer) =>
                              answerPlanQuestion(activeSessionId!, questionId, answer)
                            }
                            onContextChange={(context) => setAdditionalContext(activeSessionId!, context)}
                            onApprove={() => approvePlan(activeSessionId!)}
                            onCancel={() => cancelPlan(activeSessionId!)}
                            isRunning={activeSession.status === 'running'}
                          />
                        </div>
                      )}
                  </ConversationPanel>

                  {/* Queue Badge (Compact) */}
                  {activeSession.messageQueue.length > 0 && !showQueueManager && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.2 }}
                      className="mt-4 flex justify-center"
                    >
                      <button
                        onClick={() => setShowQueueManager(true)}
                        className="flex items-center gap-2 rounded-2xl bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300 ring-1 ring-cyan-500/30 hover:bg-cyan-500/15 active:bg-cyan-500/20"
                      >
                        <Clock className="h-4 w-4" />
                        <span>{activeSession.messageQueue.length} messages queued</span>
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </motion.div>
                  )}

                  {/* Queue Manager Panel (Expanded) */}
                  <AnimatePresence>
                    {showQueueManager && activeSession.messageQueue.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.2 }}
                        className="mt-4 mx-auto max-w-[600px]"
                      >
                        <div className="rounded-2xl bg-zinc-900/95 backdrop-blur-xl ring-1 ring-white/10">
                          {/* Header */}
                          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                            <h3 className="text-sm font-semibold text-white">
                              Queue ({activeSession.messageQueue.length})
                            </h3>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => clearQueue()}
                                className="rounded-lg px-2 py-1 text-xs text-white/70 hover:bg-white/10 active:bg-white/15"
                              >
                                Clear All
                              </button>
                              <button
                                onClick={() => setShowQueueManager(false)}
                                className="rounded-lg p-1 text-white/40 hover:bg-white/10"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          {/* Queue items */}
                          <div className="max-h-[400px] overflow-y-auto p-2">
                            {activeSession.messageQueue.map((msg, index) => (
                              <div
                                key={msg.id}
                                className={cn(
                                  'mb-2 rounded-xl p-3 ring-1',
                                  index === 0 && activeSession.status === 'running'
                                    ? 'bg-cyan-500/10 ring-cyan-500/30'
                                    : 'bg-white/5 ring-white/10'
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-medium text-white/50">
                                        #{index + 1}
                                      </span>
                                      {index === 0 && activeSession.status === 'running' && (
                                        <span className="text-xs text-cyan-300">Processing now...</span>
                                      )}
                                    </div>
                                    <p className="text-sm text-white/80 truncate">
                                      {msg.content.slice(0, 60)}
                                      {msg.content.length > 60 && '...'}
                                    </p>
                                    <p className="mt-1 text-xs text-white/40">
                                      {new Date(msg.queuedAt).toLocaleTimeString()}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => removeFromQueue(msg.id)}
                                    className="shrink-0 rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-red-400"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Resume Controls (After Stop with Queue) */}
                  {activeSession.status === 'idle' &&
                   activeSession.messageQueue.length > 0 &&
                   activeSession.wasRecentlyStopped && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.2 }}
                      className="mt-4 flex justify-center"
                    >
                      <div className="w-full max-w-[600px] rounded-2xl bg-amber-500/10 px-4 py-3 ring-1 ring-amber-500/30">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                            <span className="text-sm text-amber-300">
                              Stopped with {activeSession.messageQueue.length} messages queued
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => clearQueue()}
                              className="rounded-lg px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 active:bg-white/15"
                            >
                              Clear Queue
                            </button>
                            <button
                              onClick={() => resumeQueue()}
                              className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600 active:bg-cyan-700"
                            >
                              Resume Queue
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Composer */}
                  <div className="mt-4 flex-shrink-0">
                    <Composer
                      value={input}
                      onChange={setInput}
                      onSend={() => {
                        // Pass selected agent ID when sending
                        handleSend(undefined, agents.selectedAgent?.id);
                        // Add to recent agents
                        if (agents.selectedAgent) {
                          agents.addToRecentAgents(agents.selectedAgent);
                        }
                        // Clear selection after sending
                        agents.setSelectedAgent(null);
                      }}
                      onStop={() => cancelOperation()}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      mode={activeSession.mode || 'direct'}
                      onToggleMode={() => setMode(activeSession.mode === 'plan' ? 'direct' : 'plan')}
                      onAttach={() => fileInputRef.current?.click()}
                      inputRef={inputRef}
                      disabled={false}
                      isSending={isSending}
                      isGenerating={activeSession.status === 'running'}
                      isUploading={isUploading}
                      queueCount={activeSession.messageQueue.length}
                      pendingAttachments={pendingAttachments}
                      onRemoveAttachment={(id) => removePendingAttachment(activeSessionId!, id)}
                      // Agent selection props
                      agents={agents.allAgents}
                      pinnedAgents={agents.pinnedAgents}
                      recentAgents={agents.recentAgents}
                      userAgents={agents.userAgents}
                      builtinAgents={agents.builtinAgents}
                      selectedAgent={agents.selectedAgent}
                      onAgentSelect={agents.setSelectedAgent}
                      agentSearchQuery={agents.searchQuery}
                      onAgentSearchChange={agents.setSearchQuery}
                      onBrowseAgents={() => setShowAgentsPanel(true)}
                    />
                  </div>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>

                {/* Right: Actions + Side Panel (4 cols) - Hidden on mobile, shown on tablet+ */}
                <div className="hidden sm:block sm:col-span-4 space-y-3 overflow-y-auto min-h-0">
                  <ActionRail
                    onRun={() => {
                      const repoId = activeSession?.repoIds?.[0];
                      if (repoId) {
                        navigate(`/run?repoId=${encodeURIComponent(repoId)}&sessionId=${activeSessionId}`);
                      } else {
                        setShowStartAppModal(true);
                      }
                    }}
                    onShip={() => navigate(`/pre-ship?sessionId=${activeSessionId}`)}
                    onAgents={() => setShowAgentsPanel(true)}
                    hasRunningApp={hasRunningApp}
                    isPreviewOpen={showPreviewPanel}
                    isAgentsOpen={showAgentsPanel}
                    changesCount={changedFiles.length}
                  />
                  <SidePanel
                    toolActivities={activeSession?.toolActivities || []}
                    isRunning={activeSession?.status === 'running'}
                    currentActivity={activeSession?.currentActivity}
                    onNavigate={handleActivityNavigate}
                    changedFiles={changedFiles}
                    onViewDiffs={() => navigate(`/review-changes?sessionId=${activeSessionId}`)}
                    sessionId={activeSessionId!}
                    repoId={activeSession?.repoIds?.[0]}
                    isMultiRepo={activeSession?.isMultiRepo}
                    onNavigateToReview={() => navigate(`/pre-ship?sessionId=${activeSessionId}`)}
                  />
                </div>
              </div>
            </>
          ) : (
            // No active session
            <div className="flex flex-1 flex-col items-center justify-center text-white/50">
              <TerminalIcon className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No session active</p>
              <p className="text-sm mt-1">Create a new session to get started</p>
              <button
                onClick={() => {
                  // Set default workspace if not selected
                  if (!selectedWorkspaceId && workspaces.length > 0) {
                    terminal.setSelectedWorkspaceId(workspaces[0].id);
                  }
                  setShowNewSessionModal(true);
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                New Session
              </button>
            </div>
          )}
        </div>

        {/* Session Switcher Toast */}
        <AnimatePresence>
          {switcherToast.show && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
            >
              <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl px-6 py-4 shadow-2xl">
                <div className="flex items-center gap-3">
                  <TerminalIcon className="h-5 w-5 text-blue-400" />
                  <div className="text-sm">
                    <div className="text-white/60 text-xs">Switched to</div>
                    <div className="text-white font-medium">{switcherToast.sessionName}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ========================== */}
      {/* MOBILE COMPONENTS          */}
      {/* ========================== */}

      {/* Mobile FAB - Only shown on mobile when there's an active session */}
      {activeSession && (
        <MobileFAB
          onRun={() => {
            const repoId = activeSession?.repoIds?.[0];
            if (repoId) {
              navigate(`/run?repoId=${encodeURIComponent(repoId)}&sessionId=${activeSessionId}`);
            } else {
              setShowStartAppModal(true);
            }
          }}
          onShip={() => navigate(`/pre-ship?sessionId=${activeSessionId}`)}
          onAgents={() => setShowAgentsPanel(true)}
          onTimeline={() => {
            setMobileActionsInitialTab('timeline');
            setShowMobileActionsSheet(true);
          }}
          onChanges={() => {
            setMobileActionsInitialTab('changes');
            setShowMobileActionsSheet(true);
          }}
          hasRunningApp={hasRunningApp}
          changesCount={changedFiles.length}
        />
      )}

      {/* Mobile Actions Sheet - Timeline and Changes */}
      <MobileActionsSheet
        isOpen={showMobileActionsSheet}
        onClose={() => setShowMobileActionsSheet(false)}
        initialTab={mobileActionsInitialTab}
        timelineItems={timelineItems}
        changedFiles={changedFiles}
        onViewDiffs={() => navigate(`/review-changes?sessionId=${activeSessionId}`)}
      />

      {/* ========================== */}
      {/* MODALS                     */}
      {/* ========================== */}

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onSelect={(command) => handleSend(command)}
        setMode={setMode}
      />

      {/* Session Search */}
      <SessionSearch
        isOpen={showSessionSearch}
        onClose={() => setShowSessionSearch(false)}
        onSelectResult={(sessionId, messageId) => {
          switchSession(sessionId);
          setTimeout(() => {
            const messageElement = document.getElementById(`message-${messageId}`);
            if (messageElement) {
              messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              messageElement.classList.add('bg-yellow-500/20');
              setTimeout(() => {
                messageElement.classList.remove('bg-yellow-500/20');
              }, 2000);
            }
          }, 100);
        }}
      />

      {/* Split Session Selector */}
      <SplitSessionSelector
        isOpen={showSplitSelector}
        onClose={() => setShowSplitSelector(false)}
        sessions={sessions.map((s) => ({
          id: s.id,
          repoId: s.repoId,
          repoIds: s.repoIds,
          isMultiRepo: s.isMultiRepo,
        }))}
        currentSessionId={activeSessionId}
        onSelect={(sessionId) => {
          setSplitSessionId(sessionId);
          setSplitView(true);
        }}
      />

      {/* Add Repo Modal */}
      <AddRepoModal
        isOpen={showAddRepoModal}
        onClose={() => setShowAddRepoModal(false)}
        repos={repos}
        currentRepoIds={activeSession?.repoIds || []}
        onAdd={(repoId) => {
          if (activeSessionId) {
            addRepoToSession(activeSessionId, repoId);
          }
        }}
      />

      {/* Merge Sessions Modal */}
      <MergeSessionsModal
        isOpen={showMergeModal}
        onClose={() => setShowMergeModal(false)}
        sessions={sessions.map((s) => ({
          id: s.id,
          repoId: s.repoId,
          repoIds: s.repoIds,
          isMultiRepo: s.isMultiRepo,
        }))}
        currentSessionId={activeSessionId}
        onMerge={(sessionIds) => mergeSessions(sessionIds)}
      />

      {/* Session Context Menu */}
      <SessionContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={() => setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, sessionId: null })}
        onAddRepo={() => setShowAddRepoModal(true)}
        onMerge={() => setShowMergeModal(true)}
        onCloseSession={() => {
          if (contextMenu.sessionId) {
            closeSession(contextMenu.sessionId);
          }
        }}
        onExportMarkdown={() => {
          if (contextMenu.sessionId) {
            exportSession(contextMenu.sessionId, 'markdown');
          }
        }}
        onExportJson={() => {
          if (contextMenu.sessionId) {
            exportSession(contextMenu.sessionId, 'json');
          }
        }}
      />

      {/* Close Worktree Session Dialog - 3 options: Cancel, Close Session, Delete All */}
      {deleteWorktreeConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setDeleteWorktreeConfirm(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-100">Close Worktree Session</h3>
            <p className="mt-2 text-sm text-zinc-400">
              This session owns a worktree for branch "{deleteWorktreeConfirm.branch}". What would you like to do?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {/* Close Session - keeps worktree */}
              <button
                onClick={() => {
                  closeSession(deleteWorktreeConfirm.sessionId, false, false);
                  setDeleteWorktreeConfirm(null);
                }}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
              >
                Close Session
                <span className="ml-1 text-xs text-blue-200">(keep worktree)</span>
              </button>
              {/* Delete All - removes worktree */}
              <button
                onClick={() => {
                  closeSession(deleteWorktreeConfirm.sessionId, false, true);
                  setDeleteWorktreeConfirm(null);
                }}
                className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-500"
              >
                Delete All
                <span className="ml-1 text-xs text-red-200">(remove worktree)</span>
              </button>
              {/* Cancel */}
              <button
                onClick={() => setDeleteWorktreeConfirm(null)}
                className="w-full rounded-lg border border-zinc-700 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Session Modal */}
      <NewSessionModal
        isOpen={showNewSessionModal}
        onClose={() => setShowNewSessionModal(false)}
        onCreateSession={handleCreateSession}
        workspaces={workspaces}
        repos={repos}
        isLoadingAppData={isLoadingAppData}
        selectedWorkspaceId={selectedWorkspaceId}
        onWorkspaceChange={(wsId) => terminal.setSelectedWorkspaceId(wsId)}
        selectedRepoIds={selectedRepoIds}
        onToggleRepoSelection={toggleRepoSelection}
        repoSearch={repoSearch}
        onRepoSearchChange={setRepoSearch}
        highlightedRepoIndex={highlightedRepoIndex}
        onHighlightedRepoIndexChange={setHighlightedRepoIndex}
        filteredRepos={filteredRepos}
        reposByWorkspace={reposByWorkspace}
        showCreateRepoForm={showCreateRepoForm}
        onShowCreateRepoForm={setShowCreateRepoForm}
        newRepoName={newRepoName}
        onNewRepoNameChange={terminal.setNewRepoName}
        createRepoWorkspaceId={createRepoWorkspaceId}
        onCreateRepoWorkspaceIdChange={setCreateRepoWorkspaceId}
        isCreatingRepo={isCreatingRepo}
        createRepoError={createRepoError}
        onCreateRepoInline={handleCreateRepoInline}
        worktreeMode={worktreeMode}
        onWorktreeModeChange={setWorktreeMode}
        worktreeAction={worktreeAction}
        onWorktreeActionChange={setWorktreeAction}
        worktreeBranch={worktreeBranch}
        onWorktreeBranchChange={setWorktreeBranch}
        worktreeBaseBranch={worktreeBaseBranch}
        onWorktreeBaseBranchChange={setWorktreeBaseBranch}
        availableBranches={availableBranches}
        loadingBranches={loadingBranches}
        mainBranch={mainBranch}
        existingWorktrees={existingWorktrees}
        selectedWorktreePath={selectedWorktreePath}
        onSelectedWorktreePathChange={setSelectedWorktreePath}
        loadingWorktrees={loadingWorktrees}
      />

      {/* Create Repo Modal */}
      {showCreateRepoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0d1117] p-6 ring-1 ring-white/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Create New Repository</h2>
              <button
                onClick={() => setShowCreateRepoModal(false)}
                className="rounded-xl p-2 text-white/40 hover:bg-white/10"
                disabled={isCreatingRepo}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/70">
                  Repository Name
                </label>
                <input
                  type="text"
                  value={newRepoName}
                  onChange={(e) =>
                    setNewRepoName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                  }
                  placeholder="my-new-app"
                  className="w-full rounded-2xl bg-white/5 px-4 py-3 text-sm text-white placeholder-white/35 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
                  disabled={isCreatingRepo}
                  autoFocus
                />
                <p className="mt-1 text-xs text-white/45">
                  Lowercase letters, numbers, and dashes only
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/70">Workspace</label>
                <select
                  value={selectedWorkspaceId}
                  onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                  disabled={isCreatingRepo}
                  className="w-full rounded-2xl bg-zinc-800 px-4 py-3 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  <option value="" disabled className="bg-zinc-800 text-white/50">
                    Select a workspace...
                  </option>
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id} className="bg-zinc-800 text-white">
                      {ws.name}
                    </option>
                  ))}
                </select>
              </div>

              {createRepoError && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {createRepoError}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateRepoModal(false)}
                className="flex-1 rounded-2xl bg-white/5 py-3 text-sm text-white/70 ring-1 ring-white/10 hover:bg-white/10"
                disabled={isCreatingRepo}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRepo}
                disabled={!newRepoName.trim() || !selectedWorkspaceId || isCreatingRepo}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingRepo && <Loader2 className="h-4 w-4 animate-spin" />}
                {isCreatingRepo ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Menu Bottom Sheet */}
      <MobileBottomSheet isOpen={showMobileMenu} onClose={() => setShowMobileMenu(false)} showCloseButton={false}>
        <div className="flex border-b border-white/10">
          {[
            { id: 'actions' as const, label: 'Actions', icon: Zap },
            { id: 'preview' as const, label: 'Preview', icon: hasRunningApp ? Eye : Play },
            { id: 'ship' as const, label: 'Ship', icon: Rocket },
            { id: 'commands' as const, label: 'Commands', icon: Command },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMobileMenuTab(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 -mb-px',
                mobileMenuTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-white/50'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {mobileMenuTab === 'actions' && (
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowMobileMenu(false);
                  handleOpenCreateRepoModal();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20 text-left"
              >
                <FolderPlus className="h-5 w-5 text-emerald-400" />
                <div>
                  <p className="font-medium text-emerald-300">Create Repository</p>
                  <p className="text-xs text-emerald-400/70">New folder in workspace</p>
                </div>
              </button>

              <button
                onClick={() => setMode(activeSession?.mode === 'plan' ? 'direct' : 'plan')}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/5 ring-1 ring-white/10"
              >
                <div className="flex items-center gap-3">
                  <Code className="h-5 w-5 text-blue-400" />
                  <span className="font-medium text-white">Plan Mode</span>
                </div>
                <div
                  className={cn(
                    'w-10 h-6 rounded-full transition-colors relative',
                    activeSession?.mode === 'plan' ? 'bg-blue-500' : 'bg-white/20'
                  )}
                >
                  <div
                    className={cn(
                      'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transform transition-transform',
                      activeSession?.mode === 'plan' ? 'left-[18px]' : 'left-0.5'
                    )}
                  />
                </div>
              </button>

              <button
                onClick={() => {
                  clearMessages();
                  setShowMobileMenu(false);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 ring-1 ring-white/10"
              >
                <Trash2 className="h-5 w-5 text-white/50" />
                <span className="font-medium text-white">Clear Chat</span>
              </button>
            </div>
          )}

          {mobileMenuTab === 'ship' && (
            <div className="space-y-3">
              {activeSession?.gitStatus && (activeSession.gitStatus.staged > 0 || activeSession.gitStatus.modified > 0) ? (
                <>
                  <button
                    onClick={() => {
                      setShowMobileMenu(false);
                      setShowShipModal(true);
                    }}
                    className="w-full p-4 rounded-2xl bg-white text-black text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <Rocket className="h-5 w-5" />
                    Ship Changes
                  </button>
                  <p className="text-xs text-center text-white/50">Commit, push, and create a pull request</p>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-white/50">
                  <Rocket className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No uncommitted changes</p>
                </div>
              )}
            </div>
          )}

          {mobileMenuTab === 'preview' && (
            <MobilePreviewSheet
              repoId={activeSession?.repoIds?.[0]}
              onStartApp={() => {
                setShowMobileMenu(false);
                setShowStartAppModal(true);
              }}
              onOpenLogs={() => {
                setShowMobileMenu(false);
                setShowMobilePreviewOverlay(true);
              }}
            />
          )}

          {mobileMenuTab === 'commands' && (
            <div className="space-y-2">
              {PALETTE_COMMANDS.map((cmd) => {
                const IconComponent = {
                  RefreshCw: terminal.navigate ? Loader2 : Loader2,
                  HelpCircle: terminal.navigate ? FileText : FileText,
                }[cmd.icon] || FileText;

                return (
                  <button
                    key={cmd.id}
                    onClick={() => {
                      if (cmd.id === 'plan') {
                        setMode('plan');
                      } else if (cmd.id === 'direct') {
                        setMode('direct');
                      } else {
                        handleSend(cmd.label);
                      }
                      setShowMobileMenu(false);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 ring-1 ring-white/10 text-left"
                  >
                    <div className="h-5 w-5 text-white/50" />
                    <div>
                      <p className="font-medium text-white">{cmd.label}</p>
                      <p className="text-xs text-white/50">{cmd.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </MobileBottomSheet>

      {/* Mobile Preview Overlay */}
      <MobilePreviewOverlay
        isOpen={showMobilePreviewOverlay}
        onClose={() => setShowMobilePreviewOverlay(false)}
        repoId={activeSession?.repoIds?.[0]}
      />

      {/* Start App Modal */}
      {showStartAppModal && activeSession?.repoIds?.[0] && (
        <StartAppModal
          isOpen={showStartAppModal}
          onClose={() => setShowStartAppModal(false)}
          repoId={activeSession.repoIds[0]}
          onStarted={() => {
            terminal.loadApps?.();
            if (window.innerWidth >= 640) {
              setShowPreviewPanel(true);
            }
          }}
        />
      )}

      {/* Settings Panel */}
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Export Modal */}
      {activeSession && (
        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          messages={activeSession.messages}
          sessionName={activeSession.repoId || 'conversation'}
        />
      )}

      {/* Ship Modal */}
      {activeSessionId && (
        <ShipModal
          isOpen={showShipModal}
          onClose={() => {
            setShowShipModal(false);
            setShipConfig({});
          }}
          sessionId={activeSessionId}
          repoId={activeSession?.repoIds?.[0]}
          isMultiRepo={activeSession?.isMultiRepo}
          initialConfig={shipConfig}
          onFeedback={(message) => handleSend(message)}
        />
      )}

      {/* Repo Switcher Modal */}
      {showRepoSwitcher && activeSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowRepoSwitcher(false)}
        >
          <div
            className="w-full max-w-md mx-4 rounded-3xl border border-white/10 bg-[#0d1117] ring-1 ring-white/5 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h3 className="text-lg font-semibold text-white">Session Repositories</h3>
              <button
                onClick={() => setShowRepoSwitcher(false)}
                className="p-1 rounded-xl hover:bg-white/10 text-white/40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
              {activeSession.repoIds.map((repoId: string, index: number) => (
                <div
                  key={repoId}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl p-3 ring-1',
                    index === 0
                      ? 'ring-blue-500/50 bg-blue-500/10'
                      : 'ring-white/10 bg-white/5 hover:bg-white/10'
                  )}
                >
                  <Folder
                    className={cn('h-5 w-5 shrink-0', index === 0 ? 'text-blue-400' : 'text-white/40')}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">
                        {repos.find((r) => r.id === repoId)?.id || repoId}
                      </span>
                      {index === 0 && (
                        <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-blue-500/20 text-blue-400">
                          Primary
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/50 truncate" title={getRepoPath(repoId)}>
                      {getRepoPath(repoId)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 p-3">
              <button
                onClick={() => {
                  setShowRepoSwitcher(false);
                  setShowAddRepoModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-2 bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-white/70 text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                Add Repository
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Jump/Navigate Menu */}
      {showJumpMenu && (
        <>
          {/* Backdrop to close menu when clicking outside */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowJumpMenu(false)}
          />
          <div
            className="fixed z-50 min-w-56 rounded-2xl border border-white/10 bg-[#0d1117] shadow-xl py-1 ring-1 ring-white/5"
            style={{ top: '200px', left: '50%', transform: 'translateX(-50%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                jumpToFirstError();
                setShowJumpMenu(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/10 text-left"
            >
              <span className="text-red-400">!</span>
              First error
            </button>
            <button
              onClick={() => {
                jumpToLastFileChange();
                setShowJumpMenu(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/10 text-left"
            >
              <FileDiff className="h-3.5 w-3.5 text-amber-400" />
              Last file change
            </button>
            <div className="border-t border-white/10 my-1" />
            <div className="px-3 py-1.5 text-xs text-white/40 font-medium">Bookmarked messages</div>
            {getBookmarkedMessages().length > 0 ? (
              getBookmarkedMessages().map((msg: any) => (
                <button
                  key={msg.id}
                  onClick={() => {
                    scrollToMessage(msg.id);
                    setShowJumpMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/10 text-left"
                >
                  <Bookmark className="h-3.5 w-3.5 text-yellow-500" />
                  <span className="truncate flex-1">{msg.content?.slice(0, 40)}...</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-xs text-white/40 italic">No bookmarked messages</p>
            )}
          </div>
        </>
      )}

      {/* Preview Panel (Desktop) */}
      {showPreviewPanel && activeSession?.repoIds?.[0] && (
        <PreviewPanel repoId={activeSession.repoIds[0]} onClose={() => setShowPreviewPanel(false)} />
      )}

      {/* Expanded Input Modal */}
      <ExpandedInputModal
        isOpen={showExpandedInput}
        onClose={() => setShowExpandedInput(false)}
        initialValue={input}
        onSend={(content) => {
          setInput(content);
          handleSend(content);
        }}
      />

      {/* Usage Dashboard Modal */}
      <UsageDashboard
        isOpen={showUsageDashboard}
        onClose={() => setShowUsageDashboard(false)}
        quota={quota}
        onRefresh={fetchQuota}
      />

      {/* Agents Panel */}
      <AgentsPanel
        isOpen={showAgentsPanel}
        onClose={() => setShowAgentsPanel(false)}
        onSelectAgent={agents.setSelectedAgent}
        repoId={activeSession?.repoIds?.[0]}
      />
    </div>
  );
}
