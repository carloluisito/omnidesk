/**
 * useTerminal Hook - Extracted logic from Terminal.tsx
 * Contains all state, refs, effects, handlers, and computed values
 */

import { useState, useEffect, useRef, useMemo, useCallback, KeyboardEvent, MutableRefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uploadTerminalAttachments } from '../lib/api';
import {
  useTerminalStore,
  ChatMessage,
  PendingAttachment,
  MessageAttachment,
  PlanQuestion,
} from '../store/terminalStore';
import { useAppStore } from '../store/appStore';
import { useRunStore } from '../store/runStore';
import { playNotificationSound } from '../store/themeStore';

// Constants
const COMMAND_HISTORY_KEY = 'claudedesk-terminal-command-history';
const MAX_COMMAND_HISTORY = 100;

export const PALETTE_COMMANDS = [
  { id: 'resume', label: '/resume', desc: 'Resume a Claude session', icon: 'RefreshCw' },
  { id: 'help', label: '/help', desc: 'Show available commands', icon: 'HelpCircle' },
  { id: 'clear', label: '/clear', desc: 'Clear conversation', icon: 'Trash2' },
  { id: 'status', label: '/status', desc: 'Show session info', icon: 'Eye' },
  { id: 'new', label: '/new', desc: 'Start fresh conversation', icon: 'MessageSquare' },
  { id: 'sessions', label: '/sessions', desc: 'List all sessions', icon: 'FileText' },
  { id: 'skills', label: '/skills', desc: 'List available skills', icon: 'Sparkles' },
  { id: 'plan', label: 'Plan Mode', desc: 'Switch to planning mode', icon: 'Code' },
  { id: 'direct', label: 'Direct Mode', desc: 'Switch to direct mode', icon: 'Zap' },
  { id: 'settings', label: '/settings', desc: 'Open settings panel', icon: 'MoreVertical' },
  { id: 'export', label: '/export', desc: 'Export conversation', icon: 'FileDown' },
] as const;

// Parse questions from Claude's plan output
export function parseQuestionsFromContent(content: string): PlanQuestion[] {
  const questions: PlanQuestion[] = [];
  const questionMatches = content.matchAll(/\[QUESTION\]:\s*(.+?)(?=\n|$)/g);

  for (const match of questionMatches) {
    const questionText = match[1].trim();
    const id = Math.random().toString(36).substring(2, 15);

    let placeholder = 'Type your answer...';
    const egMatch = questionText.match(/\(e\.g\.?,?\s*([^)]+)\)/i);
    if (egMatch) {
      placeholder = `e.g., ${egMatch[1].trim()}`;
    }

    questions.push({
      id,
      question: questionText,
      placeholder,
    });
  }

  return questions;
}

export function useTerminal() {
  const navigate = useNavigate();

  // Store hooks
  const {
    sessions,
    activeSessionId,
    isConnected,
    loadSessions,
    createSession,
    mergeSessions,
    addRepoToSession,
    switchSession,
    sendMessage,
    setMode,
    cancelOperation,
    clearMessages,
    closeSession,
    connect,
    disconnect,
    fetchGitStatus,
    addPendingAttachment,
    removePendingAttachment,
    clearPendingAttachments,
    getPendingAttachments,
    pendingAttachments: pendingAttachmentsMap,
    clearToolActivities,
    setPendingPlan,
    answerPlanQuestion,
    setAdditionalContext,
    approvePlan,
    cancelPlan,
    toggleBookmark,
    toggleMessageBookmark,
    exportSession,
    removeFromQueue,
    clearQueue,
    resumeQueue,
    showPreviewPanel,
    showStartAppModal,
    setShowPreviewPanel,
    setShowStartAppModal,
    pendingMCPApproval,
    approveMCPTool,
    denyMCPTool,
    clearMCPApproval,
  } = useTerminalStore();

  const { repos, token, loadData, workspaces, isLoading: isLoadingAppData } = useAppStore();
  const { apps, loadApps } = useRunStore();

  // ============================================
  // STATE
  // ============================================

  // Input state
  const [input, setInput] = useState('');
  const [splitInput, setSplitInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [messageHistory, setMessageHistory] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(COMMAND_HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Modal state
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showAddRepoModal, setShowAddRepoModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showSessionSearch, setShowSessionSearch] = useState(false);
  const [showSplitSelector, setShowSplitSelector] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showCreateRepoModal, setShowCreateRepoModal] = useState(false);
  const [showExpandedInput, setShowExpandedInput] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showShipModal, setShowShipModal] = useState(false);
  const [showRepoSwitcher, setShowRepoSwitcher] = useState(false);
  const [showJumpMenu, setShowJumpMenu] = useState(false);

  // New session modal state
  const [selectedRepoIds, setSelectedRepoIds] = useState<string[]>([]);
  const [repoSearch, setRepoSearch] = useState('');
  const [highlightedRepoIndex, setHighlightedRepoIndex] = useState(0);
  // selectedWorkspaceId: '' means "All Workspaces", otherwise specific workspace ID
  // createRepoWorkspaceId: workspace to create new repo in (required when selectedWorkspaceId is '')
  const [createRepoWorkspaceId, setCreateRepoWorkspaceId] = useState<string>('');

  // Worktree state
  const [worktreeMode, setWorktreeMode] = useState(false);
  const [worktreeAction, setWorktreeAction] = useState<'create' | 'existing'>('create');
  const [worktreeBranch, setWorktreeBranch] = useState('');
  const [worktreeBaseBranch, setWorktreeBaseBranch] = useState('');
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [mainBranch, setMainBranch] = useState<string>('main');
  const [existingWorktrees, setExistingWorktrees] = useState<Array<{ path: string; branch: string; isMain?: boolean }>>([]);
  const [selectedWorktreePath, setSelectedWorktreePath] = useState('');
  const [loadingWorktrees, setLoadingWorktrees] = useState(false);
  const [deleteWorktreeConfirm, setDeleteWorktreeConfirm] = useState<{
    sessionId: string;
    branch: string;
  } | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    sessionId: string | null;
  }>({ isOpen: false, position: { x: 0, y: 0 }, sessionId: null });

  // Split view state
  const [splitView, setSplitView] = useState(false);
  const [splitSessionId, setSplitSessionId] = useState<string | null>(null);

  // UI interaction state
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [mobileMenuTab, setMobileMenuTab] = useState<'actions' | 'ship' | 'commands' | 'preview'>(
    'actions'
  );

  // Create repo modal state
  const [newRepoName, setNewRepoName] = useState('');
  // Default to "All Workspaces" (empty string)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);
  const [createRepoError, setCreateRepoError] = useState<string | null>(null);
  const [showCreateRepoForm, setShowCreateRepoForm] = useState(false);

  // Inline commands state
  const [showInlineCommands, setShowInlineCommands] = useState(false);
  const [inlineCommandIndex, setInlineCommandIndex] = useState(0);

  // In-session search state
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSearchIndex, setMessageSearchIndex] = useState(0);

  // Toasts
  const [switcherToast, setSwitcherToast] = useState<{ show: boolean; sessionName: string }>({
    show: false,
    sessionName: '',
  });
  const [connectionToast, setConnectionToast] = useState<{ show: boolean; connected: boolean }>({
    show: false,
    connected: false,
  });

  // Tab overflow
  const [tabsOverflow, setTabsOverflow] = useState({ left: false, right: false });

  // Ship config
  const [shipConfig, setShipConfig] = useState<{
    commitMessage?: string;
    prTitle?: string;
    prBody?: string;
    targetBranch?: string;
    shouldPush?: boolean;
    shouldCreatePR?: boolean;
  }>({});

  // ============================================
  // REFS
  // ============================================

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const splitMessagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const splitInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLTextAreaElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const prevConnectedRef = useRef<boolean | null>(null);
  const prevSessionStatusRef = useRef<string | undefined>();
  const hasLoadedInitialData = useRef(false);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId),
    [sessions, activeSessionId]
  );

  const pendingAttachments = useMemo(
    () => (activeSessionId ? getPendingAttachments(activeSessionId) : []),
    [activeSessionId, getPendingAttachments, pendingAttachmentsMap]
  );

  const splitSession = useMemo(
    () => (splitSessionId ? sessions.find((s) => s.id === splitSessionId) : null),
    [splitSessionId, sessions]
  );

  const sessionApp = useMemo(() => {
    if (!activeSession?.repoIds?.[0]) return null;
    return apps.find(
      (app) =>
        activeSession.repoIds.includes(app.repoId) &&
        (app.status === 'RUNNING' || app.status === 'STARTING')
    );
  }, [apps, activeSession?.repoIds]);

  const hasRunningApp = !!sessionApp;

  const inlineCommands = useMemo(() => {
    if (!input.startsWith('/') || input.includes(' ')) return [];
    const query = input.slice(1).toLowerCase();
    return PALETTE_COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(query) || cmd.desc.toLowerCase().includes(query)
    );
  }, [input]);

  const messageSearchMatches = useMemo(() => {
    if (!messageSearchQuery.trim() || !activeSession?.messages) return [];
    const query = messageSearchQuery.toLowerCase();
    return activeSession.messages
      .map((msg, index) => ({ msg, index }))
      .filter(({ msg }) => msg.content?.toLowerCase().includes(query));
  }, [messageSearchQuery, activeSession?.messages]);

  const lastAssistantIndex = useMemo(() => {
    const messages = activeSession?.messages || [];
    return (
      messages
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.role === 'assistant')
        .pop()?.i ?? -1
    );
  }, [activeSession?.messages]);

  const gitStatusDisplay = activeSession?.gitStatus;

  // ============================================
  // HELPERS
  // ============================================

  const getRepoPath = useCallback(
    (repoId: string): string => {
      const repo = repos.find((r) => r.id === repoId);
      return repo?.path || repoId;
    },
    [repos]
  );

  const getShortenedPath = useCallback(
    (repoId: string): string => {
      const fullPath = getRepoPath(repoId);
      const parts = fullPath.replace(/\\/g, '/').split('/').filter(Boolean);
      return parts.slice(-2).join('/');
    },
    [getRepoPath]
  );

  // ============================================
  // EFFECTS
  // ============================================

  // Load data on mount only with StrictMode protection
  // The ref guard prevents double-loading during StrictMode's unmount/remount cycle
  useEffect(() => {
    if (hasLoadedInitialData.current) return;
    hasLoadedInitialData.current = true;
    loadData();
    loadSessions();
    loadApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter repos based on selected workspace (client-side filtering)
  // When selectedWorkspaceId is '' (All Workspaces), show all repos
  // Otherwise, filter to repos belonging to that workspace
  const filteredRepos = useMemo(() => {
    if (!selectedWorkspaceId) {
      // "All Workspaces" - return all repos
      return repos;
    }
    // Filter to specific workspace
    return repos.filter((repo) => repo.workspaceId === selectedWorkspaceId);
  }, [repos, selectedWorkspaceId]);

  // Group repos by workspace (for "All Workspaces" view)
  const reposByWorkspace = useMemo(() => {
    const grouped: Record<string, typeof repos> = {};
    repos.forEach((repo) => {
      const wsId = repo.workspaceId || 'unknown';
      if (!grouped[wsId]) {
        grouped[wsId] = [];
      }
      grouped[wsId].push(repo);
    });
    return grouped;
  }, [repos]);

  // Set default createRepoWorkspaceId when workspaces load
  useEffect(() => {
    if (workspaces.length > 0 && !createRepoWorkspaceId) {
      setCreateRepoWorkspaceId(workspaces[0].id);
    }
  }, [workspaces, createRepoWorkspaceId]);

  // Fetch branches for a repository
  const fetchBranchesForRepo = useCallback(async (repoId: string) => {
    setLoadingBranches(true);
    try {
      const data = await api<{
        branches: string[];
        localBranches: string[];
        remoteBranches: string[];
        currentBranch: string;
        mainBranch: string;
      }>('GET', `/terminal/repos/${repoId}/branches`);
      setAvailableBranches(data.branches);
      setMainBranch(data.mainBranch || 'main');
      // Set default base branch to main branch if not already set
      if (!worktreeBaseBranch) {
        setWorktreeBaseBranch(data.mainBranch || 'main');
      }
    } catch (error) {
      console.error('Failed to fetch branches:', error);
      setAvailableBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  }, [worktreeBaseBranch]);

  // Fetch existing worktrees for a repository
  const fetchWorktreesForRepo = useCallback(async (repoId: string) => {
    setLoadingWorktrees(true);
    try {
      const data = await api<Array<{ path: string; branch: string; isMain?: boolean }>>(
        'GET',
        `/terminal/repos/${repoId}/worktrees`
      );
      // Filter out the main worktree (the repo itself) - only show actual worktrees
      const worktreesOnly = (data || []).filter((wt) => !wt.isMain);
      setExistingWorktrees(worktreesOnly);
      // Auto-select first if available
      if (worktreesOnly.length > 0) {
        setSelectedWorktreePath(worktreesOnly[0].path);
      } else {
        setSelectedWorktreePath('');
      }
    } catch (error) {
      console.error('Failed to fetch worktrees:', error);
      setExistingWorktrees([]);
      setSelectedWorktreePath('');
    } finally {
      setLoadingWorktrees(false);
    }
  }, []);

  // Auto-fetch branches when worktree mode is enabled and repos are selected
  useEffect(() => {
    if (worktreeMode && selectedRepoIds.length >= 1) {
      // Fetch branches for the primary (first) repo
      fetchBranchesForRepo(selectedRepoIds[0]);
      // Also fetch existing worktrees
      fetchWorktreesForRepo(selectedRepoIds[0]);
    } else {
      setAvailableBranches([]);
      setWorktreeBaseBranch('');
      setExistingWorktrees([]);
      setSelectedWorktreePath('');
      setWorktreeAction('create');
    }
  }, [worktreeMode, selectedRepoIds, fetchBranchesForRepo, fetchWorktreesForRepo]);

  // Connect WebSocket
  useEffect(() => {
    if (token && !isConnected) {
      connect(token);
    }
    return () => {
      disconnect();
    };
  }, [token, connect, disconnect, isConnected]);

  // Show connection toast on connection state changes
  useEffect(() => {
    if (prevConnectedRef.current === null) {
      prevConnectedRef.current = isConnected;
      return;
    }

    if (prevConnectedRef.current !== isConnected) {
      setConnectionToast({ show: true, connected: isConnected });
      prevConnectedRef.current = isConnected;

      const timer = setTimeout(() => {
        setConnectionToast((prev) => ({ ...prev, show: false }));
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [isConnected]);

  // Fetch git status when session changes
  useEffect(() => {
    if (activeSessionId) {
      fetchGitStatus(activeSessionId);
    }
  }, [activeSessionId, fetchGitStatus]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages]);

  // Reset sending state when session status changes
  useEffect(() => {
    if (activeSession?.status === 'idle' || activeSession?.status === 'running') {
      setIsSending(false);
    }
  }, [activeSession?.status]);

  // Detect questions in plan mode messages
  useEffect(() => {
    if (!activeSession || !activeSessionId) return;
    if (activeSession.mode !== 'plan') return;
    if (activeSession.status !== 'idle') return;
    if (activeSession.pendingPlan) return;

    const lastMessage = [...activeSession.messages].reverse().find((m) => m.role === 'assistant');
    if (!lastMessage || lastMessage.isStreaming) return;

    if (activeSession.approvedPlanMessageId === lastMessage.id) return;

    const questions = parseQuestionsFromContent(lastMessage.content);
    if (questions.length > 0) {
      setPendingPlan(activeSessionId, lastMessage.id, questions);
    }
  }, [
    activeSession?.messages,
    activeSession?.status,
    activeSession?.mode,
    activeSession?.pendingPlan,
    activeSession?.approvedPlanMessageId,
    activeSessionId,
    setPendingPlan,
  ]);

  // Track previous session status for notification sounds
  useEffect(() => {
    const currentStatus = activeSession?.status;
    const prevStatus = prevSessionStatusRef.current;

    if (prevStatus === 'running' && currentStatus === 'idle') {
      playNotificationSound('complete');
    }
    if (prevStatus === 'running' && currentStatus === 'error') {
      playNotificationSound('error');
    }

    prevSessionStatusRef.current = currentStatus;
  }, [activeSession?.status]);

  // Inline command autocomplete detection
  useEffect(() => {
    setShowInlineCommands(inlineCommands.length > 0 && input.startsWith('/'));
    setInlineCommandIndex(0);
  }, [inlineCommands.length, input]);

  // Draft persistence - save to localStorage (debounced)
  useEffect(() => {
    if (!activeSessionId) return;
    const timer = setTimeout(() => {
      if (input.trim()) {
        try {
          localStorage.setItem(`claudedesk-draft-${activeSessionId}`, input);
        } catch {
          // Ignore localStorage errors
        }
      } else {
        localStorage.removeItem(`claudedesk-draft-${activeSessionId}`);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [input, activeSessionId]);

  // Draft persistence - restore on session change
  useEffect(() => {
    if (!activeSessionId) return;
    if (input === '') {
      const draft = localStorage.getItem(`claudedesk-draft-${activeSessionId}`);
      if (draft) {
        setInput(draft);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Close jump menu when clicking outside
  useEffect(() => {
    if (!showJumpMenu) return;
    const handleClickOutside = () => setShowJumpMenu(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showJumpMenu]);

  // ============================================
  // HANDLERS
  // ============================================

  // Session switcher with toast
  const switchSessionWithToast = useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        switchSession(sessionId);
        setSwitcherToast({
          show: true,
          sessionName: session.repoId || `Session ${sessions.indexOf(session) + 1}`,
        });
        setTimeout(() => setSwitcherToast({ show: false, sessionName: '' }), 1500);
      }
    },
    [sessions, switchSession]
  );

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = window.innerHeight * 0.4;
    const minHeight = 44;
    const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
    textarea.style.height = newHeight + 'px';
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // Navigate to search result
  const navigateToSearchResult = useCallback(
    (resultIndex: number) => {
      if (resultIndex < 0 || resultIndex >= messageSearchMatches.length) return;
      const match = messageSearchMatches[resultIndex];
      const element = document.getElementById(`message-${match.msg.id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('ring-2', 'ring-blue-500');
        setTimeout(() => element.classList.remove('ring-2', 'ring-blue-500'), 2000);
      }
      setMessageSearchIndex(resultIndex);
    },
    [messageSearchMatches]
  );

  // Check tab overflow
  const checkTabsOverflow = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    setTabsOverflow({
      left: scrollLeft > 0,
      right: scrollLeft + clientWidth < scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    checkTabsOverflow();
    const container = tabsContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkTabsOverflow);
      window.addEventListener('resize', checkTabsOverflow);
      return () => {
        container.removeEventListener('scroll', checkTabsOverflow);
        window.removeEventListener('resize', checkTabsOverflow);
      };
    }
  }, [checkTabsOverflow, sessions.length]);

  const scrollTabs = useCallback((direction: 'left' | 'right') => {
    const container = tabsContainerRef.current;
    if (container) {
      const scrollAmount = 200;
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  }, []);

  // Create Repo Modal handlers
  const handleOpenCreateRepoModal = useCallback(() => {
    setNewRepoName('');
    setCreateRepoError(null);
    if (workspaces.length > 0 && !createRepoWorkspaceId) {
      setCreateRepoWorkspaceId(workspaces[0].id);
    }
    setShowCreateRepoModal(true);
  }, [workspaces, createRepoWorkspaceId]);

  // Handle inline create repo (in New Session modal)
  const handleCreateRepoInline = useCallback(async () => {
    // Determine which workspace to create the repo in
    // If a specific workspace is selected, use that; otherwise use createRepoWorkspaceId
    const targetWorkspaceId = selectedWorkspaceId || createRepoWorkspaceId;

    if (!newRepoName.trim() || !targetWorkspaceId) return;

    setIsCreatingRepo(true);
    setCreateRepoError(null);

    try {
      const response = await fetch(`/api/workspaces/${targetWorkspaceId}/repos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ repoName: newRepoName.trim() }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to create repository');
      }

      await loadData({ forceRefresh: true });
      setNewRepoName('');
      setShowCreateRepoForm(false);
      setIsCreatingRepo(false);
    } catch (err) {
      setCreateRepoError(err instanceof Error ? err.message : 'Failed to create repository');
      setIsCreatingRepo(false);
    }
  }, [newRepoName, selectedWorkspaceId, createRepoWorkspaceId, token, loadData]);

  const handleCreateRepo = useCallback(async () => {
    if (!newRepoName.trim() || !createRepoWorkspaceId) return;

    setIsCreatingRepo(true);
    setCreateRepoError(null);

    try {
      const response = await fetch(`/api/workspaces/${createRepoWorkspaceId}/repos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ repoName: newRepoName.trim() }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to create repository');
      }

      await loadData({ forceRefresh: true });
      setShowCreateRepoModal(false);
      setIsCreatingRepo(false);
    } catch (err) {
      setCreateRepoError(err instanceof Error ? err.message : 'Failed to create repository');
      setIsCreatingRepo(false);
    }
  }, [newRepoName, createRepoWorkspaceId, token, loadData]);

  // Send message handler
  const handleSend = useCallback(
    async (message?: string, agentId?: string) => {
      const content = message || input.trim();
      if (
        (!content && pendingAttachments.length === 0) ||
        !activeSessionId ||
        isSending ||
        isUploading
      )
        return;

      // Handle client-side commands
      if (content === '/settings') {
        setInput('');
        setShowSettings(true);
        return;
      }
      if (content === '/export') {
        setInput('');
        setShowExportModal(true);
        return;
      }

      // Save to message history
      if (content && (messageHistory.length === 0 || messageHistory[0] !== content)) {
        const newHistory = [content, ...messageHistory].slice(0, MAX_COMMAND_HISTORY);
        setMessageHistory(newHistory);
        try {
          localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(newHistory));
        } catch {
          // Ignore localStorage errors
        }
      }
      setHistoryIndex(-1);

      setIsSending(true);
      clearToolActivities(activeSessionId);

      try {
        let attachments: MessageAttachment[] | undefined;
        if (pendingAttachments.length > 0) {
          setIsUploading(true);
          const uploaded = await uploadTerminalAttachments(
            activeSessionId,
            pendingAttachments.map((a) => a.file)
          );
          attachments = uploaded.map((u) => ({
            id: u.id,
            originalName: u.originalName,
            path: u.path,
            size: u.size,
            mimeType: u.mimeType,
          }));
          clearPendingAttachments(activeSessionId);
          setIsUploading(false);
        }

        sendMessage(content || 'Please analyze the attached files.', attachments, agentId);
        setInput('');
        if (activeSessionId) {
          localStorage.removeItem(`claudedesk-draft-${activeSessionId}`);
        }
        setIsSending(false);
        inputRef.current?.focus();
      } catch (error) {
        console.error('Failed to upload attachments:', error);
        setIsUploading(false);
        setIsSending(false);
      }
    },
    [
      input,
      pendingAttachments,
      activeSessionId,
      isSending,
      isUploading,
      messageHistory,
      clearToolActivities,
      sendMessage,
      clearPendingAttachments,
    ]
  );

  // File selection handler
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && activeSessionId) {
        Array.from(files).forEach((file) => {
          addPendingAttachment(activeSessionId, file);
        });
      }
      e.target.value = '';
    },
    [activeSessionId, addPendingAttachment]
  );

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0 && activeSessionId) {
        Array.from(files).forEach((file) => {
          addPendingAttachment(activeSessionId, file);
        });
      }
    },
    [activeSessionId, addPendingAttachment]
  );

  // Handle paste events for images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent, sessionId?: string | null) => {
      const targetSessionId = sessionId ?? activeSessionId;
      const items = e.clipboardData?.items;
      if (!items || !targetSessionId) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        imageFiles.forEach((file) => addPendingAttachment(targetSessionId, file));
      }
    },
    [activeSessionId, addPendingAttachment]
  );

  // Input keyboard handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
        return;
      }

      if (e.key === 'ArrowUp' && !e.shiftKey) {
        const textarea = e.currentTarget;
        const atStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;
        if ((input === '' || atStart) && messageHistory.length > 0) {
          e.preventDefault();
          const newIndex = Math.min(historyIndex + 1, messageHistory.length - 1);
          setHistoryIndex(newIndex);
          setInput(messageHistory[newIndex]);
        }
        return;
      }

      if (e.key === 'ArrowDown' && !e.shiftKey) {
        if (historyIndex >= 0) {
          e.preventDefault();
          const newIndex = historyIndex - 1;
          if (newIndex < 0) {
            setHistoryIndex(-1);
            setInput('');
          } else {
            setHistoryIndex(newIndex);
            setInput(messageHistory[newIndex]);
          }
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'U') {
        e.preventDefault();
        setInput('');
        setHistoryIndex(-1);
      }
    },
    [handleSend, input, messageHistory, historyIndex]
  );

  // Create session handler
  const handleCreateSession = useCallback(async () => {
    if (selectedRepoIds.length === 0) return;

    let options: { worktreeMode: boolean; branch?: string; baseBranch?: string; existingWorktreePath?: string } | undefined;

    if (worktreeMode) {
      if (worktreeAction === 'existing' && selectedWorktreePath) {
        // Use existing worktree
        options = {
          worktreeMode: true,
          existingWorktreePath: selectedWorktreePath,
        };
      } else if (worktreeAction === 'create' && worktreeBranch) {
        // Create new worktree
        options = {
          worktreeMode: true,
          branch: worktreeBranch,
          ...(worktreeBaseBranch ? { baseBranch: worktreeBaseBranch } : {}),
        };
      }
    }

    await createSession(
      selectedRepoIds.length === 1 ? selectedRepoIds[0] : selectedRepoIds,
      options
    );
    setShowNewSessionModal(false);
    setSelectedRepoIds([]);
    setRepoSearch('');
    setWorktreeMode(false);
    setWorktreeAction('create');
    setWorktreeBranch('');
    setWorktreeBaseBranch('');
    setAvailableBranches([]);
    setExistingWorktrees([]);
    setSelectedWorktreePath('');
  }, [selectedRepoIds, worktreeMode, worktreeAction, worktreeBranch, worktreeBaseBranch, selectedWorktreePath, createSession]);

  // Toggle repo selection
  const toggleRepoSelection = useCallback((repoId: string) => {
    setSelectedRepoIds((prev) =>
      prev.includes(repoId) ? prev.filter((id) => id !== repoId) : [...prev, repoId]
    );
  }, []);

  // Retry handler
  const handleRetry = useCallback(
    (content: string) => {
      if (activeSession?.status !== 'running') {
        handleSend(content);
      }
    },
    [activeSession?.status, handleSend]
  );

  // Regenerate handler
  const handleRegenerate = useCallback(() => {
    if (activeSession?.status !== 'running' && activeSession?.messages) {
      const lastUserMessage = [...activeSession.messages]
        .reverse()
        .find((m) => m.role === 'user');
      if (lastUserMessage?.content) {
        handleSend(lastUserMessage.content);
      }
    }
  }, [activeSession?.status, activeSession?.messages, handleSend]);

  // Toggle message bookmark
  const handleToggleMessageBookmark = useCallback(
    (messageId: string) => {
      if (activeSessionId) {
        toggleMessageBookmark(activeSessionId, messageId);
      }
    },
    [activeSessionId, toggleMessageBookmark]
  );

  // Jump navigation helpers
  const scrollToMessage = useCallback((messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2', 'ring-offset-zinc-900');
      setTimeout(() => {
        element.classList.remove(
          'ring-2',
          'ring-blue-500',
          'ring-offset-2',
          'ring-offset-zinc-900'
        );
      }, 2000);
    }
    setShowJumpMenu(false);
  }, []);

  const jumpToFirstError = useCallback(() => {
    if (!activeSession?.messages) return;
    const errorMessage = activeSession.messages.find(
      (m) =>
        m.content?.toLowerCase().includes('error') ||
        m.content?.toLowerCase().includes('failed') ||
        m.content?.toLowerCase().includes('exception')
    );
    if (errorMessage) {
      scrollToMessage(errorMessage.id);
    }
  }, [activeSession?.messages, scrollToMessage]);

  const jumpToLastFileChange = useCallback(() => {
    if (!activeSession?.messages) return;
    const messagesWithChanges = activeSession.messages.filter(
      (m) => m.fileChanges && m.fileChanges.length > 0
    );
    if (messagesWithChanges.length > 0) {
      scrollToMessage(messagesWithChanges[messagesWithChanges.length - 1].id);
    }
  }, [activeSession?.messages, scrollToMessage]);

  const getBookmarkedMessages = useCallback(() => {
    if (!activeSession?.messages) return [];
    return activeSession.messages.filter((m) => m.isBookmarked);
  }, [activeSession?.messages]);

  // ============================================
  // KEYBOARD SHORTCUTS EFFECT
  // ============================================

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      // Command palette: Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
        return;
      }

      // Session search: Ctrl+Shift+F
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setShowSessionSearch(true);
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        // Ctrl+1-9: Switch tabs
        if (e.key >= '1' && e.key <= '9') {
          const index = parseInt(e.key) - 1;
          if (sessions[index]) {
            e.preventDefault();
            switchSessionWithToast(sessions[index].id);
          }
        }
        // Ctrl+Shift+T: New session
        if (e.shiftKey && e.key === 'T') {
          e.preventDefault();
          setShowNewSessionModal(true);
        }
        // Ctrl+W: Close current session
        if (e.key === 'w' && activeSessionId) {
          e.preventDefault();
          closeSession(activeSessionId);
        }
        // Ctrl+Right Arrow: Next session
        if (e.key === 'ArrowRight' && !e.shiftKey) {
          const currentIndex = sessions.findIndex((s) => s.id === activeSessionId);
          if (currentIndex < sessions.length - 1) {
            e.preventDefault();
            switchSessionWithToast(sessions[currentIndex + 1].id);
          }
        }
        // Ctrl+Left Arrow: Previous session
        if (e.key === 'ArrowLeft' && !e.shiftKey) {
          const currentIndex = sessions.findIndex((s) => s.id === activeSessionId);
          if (currentIndex > 0) {
            e.preventDefault();
            switchSessionWithToast(sessions[currentIndex - 1].id);
          }
        }
        // Ctrl+Shift+G: Open Ship modal
        if (e.shiftKey && e.key === 'G') {
          e.preventDefault();
          setShowShipModal(true);
        }
        // Ctrl+Shift+P: Toggle Plan Mode
        if (e.shiftKey && e.key === 'P') {
          e.preventDefault();
          setMode(activeSession?.mode === 'plan' ? 'direct' : 'plan');
        }
        // Ctrl+Shift+S: Open Ship modal
        if (e.shiftKey && e.key === 'S') {
          e.preventDefault();
          setShowShipModal(true);
        }
        // Ctrl+F: In-session search
        if (e.key === 'f' && !e.shiftKey) {
          e.preventDefault();
          setShowMessageSearch(true);
          setMessageSearchQuery('');
          setMessageSearchIndex(0);
        }
      }
      // Escape: Cancel operation or close modals
      if (e.key === 'Escape') {
        if (showMessageSearch) {
          setShowMessageSearch(false);
          setMessageSearchQuery('');
        } else if (showCommandPalette) {
          setShowCommandPalette(false);
        } else if (activeSession?.status === 'running') {
          cancelOperation();
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    sessions,
    activeSessionId,
    activeSession?.status,
    activeSession?.mode,
    switchSessionWithToast,
    closeSession,
    cancelOperation,
    showCommandPalette,
    showMessageSearch,
    setMode,
  ]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Navigation
    navigate,

    // Store values
    sessions,
    activeSessionId,
    isConnected,
    repos,
    token,
    workspaces,
    apps,
    isLoadingAppData,

    // Store actions
    loadSessions,
    createSession,
    mergeSessions,
    addRepoToSession,
    switchSession,
    sendMessage,
    setMode,
    cancelOperation,
    clearMessages,
    closeSession,
    fetchGitStatus,
    addPendingAttachment,
    removePendingAttachment,
    clearPendingAttachments,
    clearToolActivities,
    setPendingPlan,
    answerPlanQuestion,
    setAdditionalContext,
    approvePlan,
    cancelPlan,
    toggleBookmark,
    toggleMessageBookmark,
    exportSession,
    removeFromQueue,
    clearQueue,
    resumeQueue,
    showPreviewPanel,
    showStartAppModal,
    setShowPreviewPanel,
    setShowStartAppModal,
    pendingMCPApproval,
    approveMCPTool,
    denyMCPTool,
    clearMCPApproval,

    // Computed values
    activeSession,
    pendingAttachments,
    splitSession,
    sessionApp,
    hasRunningApp,
    inlineCommands,
    messageSearchMatches,
    lastAssistantIndex,
    gitStatusDisplay,

    // State
    input,
    setInput,
    splitInput,
    setSplitInput,
    historyIndex,
    setHistoryIndex,
    messageHistory,
    setMessageHistory,

    // Modal state
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
    showPreview,
    setShowPreview,
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

    // New session modal state
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

    // Worktree state
    worktreeMode,
    setWorktreeMode,
    worktreeAction,
    setWorktreeAction,
    worktreeBranch,
    setWorktreeBranch,
    worktreeBaseBranch,
    setWorktreeBaseBranch,
    availableBranches,
    setAvailableBranches,
    loadingBranches,
    setLoadingBranches,
    mainBranch,
    fetchBranchesForRepo,
    existingWorktrees,
    selectedWorktreePath,
    setSelectedWorktreePath,
    loadingWorktrees,
    deleteWorktreeConfirm,
    setDeleteWorktreeConfirm,

    // Context menu
    contextMenu,
    setContextMenu,

    // Split view
    splitView,
    setSplitView,
    splitSessionId,
    setSplitSessionId,

    // UI interaction state
    isSending,
    setIsSending,
    isDragging,
    isUploading,
    mobileMenuTab,
    setMobileMenuTab,

    // Create repo modal state
    newRepoName,
    setNewRepoName,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    isCreatingRepo,
    createRepoError,

    // Inline commands
    showInlineCommands,
    inlineCommandIndex,
    setInlineCommandIndex,

    // Message search
    showMessageSearch,
    setShowMessageSearch,
    messageSearchQuery,
    setMessageSearchQuery,
    messageSearchIndex,
    setMessageSearchIndex,

    // Toasts
    switcherToast,
    connectionToast,

    // Tab overflow
    tabsOverflow,

    // Ship config
    shipConfig,
    setShipConfig,

    // Refs
    messagesEndRef,
    splitMessagesEndRef,
    inputRef,
    splitInputRef,
    fileInputRef,
    mobileInputRef,
    tabsContainerRef,

    // Helpers
    getRepoPath,
    getShortenedPath,

    // Handlers
    switchSessionWithToast,
    adjustTextareaHeight,
    navigateToSearchResult,
    checkTabsOverflow,
    scrollTabs,
    handleOpenCreateRepoModal,
    handleCreateRepo,
    handleSend,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    handleKeyDown,
    handleCreateSession,
    toggleRepoSelection,
    handleRetry,
    handleRegenerate,
    handleToggleMessageBookmark,
    scrollToMessage,
    jumpToFirstError,
    jumpToLastFileChange,
    getBookmarkedMessages,
  };
}

export type UseTerminalReturn = ReturnType<typeof useTerminal>;
