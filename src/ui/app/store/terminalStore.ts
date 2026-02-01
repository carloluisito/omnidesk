import { create } from 'zustand';
import { api, UploadedAttachment } from '../lib/api';
import { requestCache, CACHE_KEYS } from '../lib/request-cache';
import { useUpdateStore } from './updateStore';
import type { ChainSegment } from '../types/agents';

const ACTIVE_SESSION_KEY = 'claudedesk-active-session';

export interface MessageAttachment {
  id: string;
  originalName: string;
  path: string;
  size: number;
  mimeType: string;
}

export interface FileChange {
  id: string;
  filePath: string;
  fileName: string;
  operation: 'created' | 'modified' | 'deleted';
  toolActivityId: string;
  approved?: boolean;  // For diff review approval state
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  attachments?: MessageAttachment[];
  fileChanges?: FileChange[];
  isBookmarked?: boolean;
  agentId?: string;      // Agent used for this message (if any)
  agentName?: string;    // Display name of the agent
  autoDetected?: boolean; // Whether agent was auto-detected (vs manually selected)
  // Agent chain fields
  agentChain?: string[];           // Ordered agent IDs for chain execution
  chainSegments?: ChainSegment[];  // Per-agent output segments
  chainStatus?: 'running' | 'completed' | 'partial' | 'cancelled'; // Overall chain status
}

export interface PendingAttachment {
  id: string;
  file: File;
  preview?: string;  // Data URL for image thumbnail
  uploading: boolean;
  uploaded?: UploadedAttachment;
  error?: string;
}

export interface ToolActivity {
  id: string;
  tool: string;
  target: string;
  status: 'running' | 'complete' | 'error';
  timestamp: Date;
  completedAt?: Date;      // When the tool completed
  error?: string;          // Error message if status is 'error'
  // MCP tool properties
  isMCPTool?: boolean;     // Whether this is an MCP tool
  mcpServerName?: string;  // Name of the MCP server
  mcpToolDescription?: string; // Tool description from MCP
  mcpInput?: Record<string, unknown>; // Tool input parameters
  mcpOutput?: string;      // Tool output/result
}

export interface GitStatus {
  branch: string;
  modified: number;
  staged: number;
  untracked: number;
  files?: Array<{ path: string; status: string }>;
}

// Usage tracking types
export interface SessionUsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  messageCount: number;
  toolUseCount: number;
  filesChanged: number;
  model?: string;
}

// Plan mode question
export interface PlanQuestion {
  id: string;
  question: string;
  placeholder?: string;  // Hint text for the input (e.g., "e.g., Phase 1 first")
  answer?: string;       // User's typed answer
}

// Pending plan awaiting user approval
export interface PendingPlan {
  messageId: string;   // The assistant message containing the plan
  questions: PlanQuestion[];
  additionalContext?: string;  // Optional extra context from user
}

export interface SearchResult {
  sessionId: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  repoIds: string[];
  isBookmarked: boolean;
  sessionName?: string;
  matchIndex: number;
}

export interface QueuedMessage {
  id: string;
  content: string;
  attachments?: MessageAttachment[];
  mode: 'plan' | 'direct';
  queuedAt: Date;
}

// MCP tool approval request
export interface MCPToolApprovalRequest {
  sessionId: string;
  approvalId: string;
  toolName: string;
  serverName: string;
  serverId: string;
  description?: string;
  inputParameters: Record<string, unknown>;
}

export interface TerminalSession {
  id: string;
  repoIds: string[];              // Array of repo IDs (first = primary)
  repoId: string;                 // Backward compatibility - same as repoIds[0]
  isMultiRepo: boolean;           // Convenience flag: repoIds.length > 1
  mergedFromSessionIds?: string[]; // Track original sessions if merged
  status: 'idle' | 'running' | 'error';
  mode: 'plan' | 'direct';
  messages: ChatMessage[];
  messageQueue: QueuedMessage[];  // Queue for messages while running
  messageCount?: number;
  lastMessage?: string;
  createdAt: Date;
  lastActivityAt: Date;
  toolActivities?: ToolActivity[];
  gitStatus?: GitStatus;
  currentActivity?: string;       // What Claude is currently doing (from stderr)
  pendingPlan?: PendingPlan;      // Plan awaiting user approval with questions
  approvedPlanMessageId?: string; // Track last approved plan to prevent re-detection
  isBookmarked: boolean;          // Whether session is pinned/bookmarked
  bookmarkedAt?: Date;            // When the session was bookmarked
  name?: string;                  // Optional friendly name
  // Git worktree support
  worktreeMode?: boolean;         // Whether session uses a git worktree
  worktreePath?: string;          // Path to the worktree directory
  branch?: string;                // Branch name for worktree sessions
  baseBranch?: string;            // Base branch the worktree was created from
  ownsWorktree?: boolean;         // Whether session created the worktree (should delete on close)
  // Usage tracking
  usageStats?: SessionUsageStats; // Token and cost usage stats
  currentModel?: string;          // Current model being used
  // Stop/Resume tracking
  wasRecentlyStopped?: boolean;   // Whether session was stopped (not completed normally)
  // Context management
  contextState?: {
    modelContextWindow: number;
    estimatedPromptTokens: number;
    lastActualInputTokens: number;
    contextUtilizationPercent: number;
    summarizationStatus: 'none' | 'suggested' | 'in_progress' | 'completed' | 'failed';
    summaryCount: number;
    verbatimMessageCount: number;
    totalMessageCount: number;
  };
  splitSuggested?: boolean;
  parentSessionId?: string;
  childSessionIds?: string[];
}

interface TerminalStore {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  isConnected: boolean;
  ws: WebSocket | null;
  pendingAttachments: Map<string, PendingAttachment[]>; // sessionId -> attachments
  searchResults: SearchResult[];
  isSearching: boolean;
  isLoadingSessions: boolean; // Guard against duplicate loadSessions calls

  // MCP tool approval
  pendingMCPApproval: MCPToolApprovalRequest | null;

  // Preview panel state
  showPreviewPanel: boolean;
  showStartAppModal: boolean;
  // Actions
  loadSessions: (options?: { forceRefresh?: boolean }) => Promise<void>;
  createSession: (repoIdOrIds: string | string[], options?: { worktreeMode?: boolean; branch?: string; baseBranch?: string; existingWorktreePath?: string }) => Promise<TerminalSession>;
  mergeSessions: (sessionIds: string[]) => Promise<TerminalSession>;
  addRepoToSession: (sessionId: string, repoId: string) => Promise<void>;
  removeRepoFromSession: (sessionId: string, repoId: string) => Promise<void>;
  switchSession: (sessionId: string) => void;
  sendMessage: (content: string, attachments?: MessageAttachment[], agentId?: string, agentChain?: string[]) => void;
  setMode: (mode: 'plan' | 'direct') => void;
  cancelOperation: () => void;
  clearMessages: () => void;
  closeSession: (sessionId: string, deleteBranch?: boolean, deleteWorktree?: boolean) => Promise<void>;
  fetchGitStatus: (sessionId: string) => Promise<void>;
  fetchMultiGitStatus: (sessionId: string) => Promise<void>;
  fetchContextState: (sessionId: string) => Promise<void>;
  splitSession: (sessionId: string) => Promise<string | null>;
  toggleBookmark: (sessionId: string) => Promise<void>;
  toggleMessageBookmark: (sessionId: string, messageId: string) => void;
  exportSession: (sessionId: string, format: 'markdown' | 'json') => void;
  searchSessions: (query: string) => Promise<void>;
  clearSearchResults: () => void;

  // Queue management
  removeFromQueue: (messageId: string) => void;
  clearQueue: () => void;
  resumeQueue: () => void;

  // Attachments
  addPendingAttachment: (sessionId: string, file: File) => Promise<void>;
  removePendingAttachment: (sessionId: string, attachmentId: string) => void;
  clearPendingAttachments: (sessionId: string) => void;
  getPendingAttachments: (sessionId: string) => PendingAttachment[];

  // Plan questions
  setPendingPlan: (sessionId: string, messageId: string, questions: PlanQuestion[]) => void;
  answerPlanQuestion: (sessionId: string, questionId: string, answer: string) => void;
  setAdditionalContext: (sessionId: string, context: string) => void;
  approvePlan: (sessionId: string) => void;
  cancelPlan: (sessionId: string) => void;

  // Preview panel
  setShowPreviewPanel: (show: boolean) => void;
  setShowStartAppModal: (show: boolean) => void;
  // MCP tool approval
  approveMCPTool: (approvalId: string, autoApproveSession: boolean) => Promise<void>;
  denyMCPTool: (approvalId: string) => Promise<void>;
  clearMCPApproval: () => void;

  // WebSocket
  connect: () => void;
  disconnect: () => void;

  // Internal
  updateSession: (sessionId: string, updates: Partial<TerminalSession>) => void;
  appendChunk: (sessionId: string, messageId: string, chunk: string) => void;
  addToolActivity: (sessionId: string, activity: Omit<ToolActivity, 'id' | 'timestamp'>) => void;
  clearToolActivities: (sessionId: string) => void;
}

// Helper to get stored active session ID
const getStoredActiveSessionId = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
};

// Helper to store active session ID
const storeActiveSessionId = (sessionId: string | null): void => {
  try {
    if (sessionId) {
      localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  } catch {
    // Ignore localStorage errors
  }
};

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isConnected: false,
  ws: null,
  pendingAttachments: new Map(),
  searchResults: [],
  isSearching: false,
  isLoadingSessions: false,
  pendingMCPApproval: null,

  // Preview panel state
  showPreviewPanel: false,
  showStartAppModal: false,
  loadSessions: async (options?: { forceRefresh?: boolean }) => {
    // Guard against duplicate simultaneous calls
    if (get().isLoadingSessions && !options?.forceRefresh) {
      return;
    }

    set({ isLoadingSessions: true });

    try {
      const sessions = await requestCache.fetch(
        CACHE_KEYS.TERMINAL_SESSIONS,
        () => api<TerminalSession[]>('GET', '/terminal/sessions'),
        { staleTime: 30000, forceRefresh: options?.forceRefresh }
      );

      const mappedSessions = sessions.map((s) => ({
        ...s,
        createdAt: new Date(s.createdAt),
        lastActivityAt: new Date(s.lastActivityAt),
        bookmarkedAt: s.bookmarkedAt ? new Date(s.bookmarkedAt) : undefined,
        isBookmarked: s.isBookmarked ?? false,
        messages: s.messages || [],
        messageQueue: (s.messageQueue || []).map((q) => ({
          ...q,
          queuedAt: new Date(q.queuedAt),
        })),
      }));

      // Restore active session from localStorage, or fallback to first session
      const currentActiveId = get().activeSessionId;
      let newActiveId = currentActiveId;

      if (!currentActiveId) {
        const storedId = getStoredActiveSessionId();
        if (storedId && mappedSessions.some((s) => s.id === storedId)) {
          // Restore stored session
          newActiveId = storedId;
        } else if (mappedSessions.length > 0) {
          // Fallback to first session
          newActiveId = mappedSessions[0].id;
          storeActiveSessionId(newActiveId);
        }
      }

      set({
        isLoadingSessions: false,
        sessions: mappedSessions,
        activeSessionId: newActiveId,
      });
    } catch (error) {
      console.error('Failed to load terminal sessions:', error);
      set({ isLoadingSessions: false });
    }
  },

  createSession: async (repoIdOrIds: string | string[], options?: { worktreeMode?: boolean; branch?: string; baseBranch?: string; existingWorktreePath?: string }) => {
    // Support both single repoId and array of repoIds, plus worktree options
    const payload = {
      ...(Array.isArray(repoIdOrIds) ? { repoIds: repoIdOrIds } : { repoId: repoIdOrIds }),
      ...options,
    };

    const session = await api<TerminalSession>('POST', '/terminal/sessions', payload);
    const newSession = {
      ...session,
      createdAt: new Date(session.createdAt),
      lastActivityAt: new Date(session.lastActivityAt),
      bookmarkedAt: session.bookmarkedAt ? new Date(session.bookmarkedAt) : undefined,
      isBookmarked: session.isBookmarked ?? false,
      messages: session.messages || [],
      messageQueue: session.messageQueue || [],
    };

    set((state) => ({
      sessions: [newSession, ...state.sessions],
      activeSessionId: newSession.id,
    }));
    storeActiveSessionId(newSession.id);

    // Subscribe to session via WebSocket
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: newSession.id }));
    }

    return newSession;
  },

  mergeSessions: async (sessionIds: string[]) => {
    const session = await api<TerminalSession>('POST', '/terminal/sessions/merge', { sessionIds });
    const newSession = {
      ...session,
      createdAt: new Date(session.createdAt),
      lastActivityAt: new Date(session.lastActivityAt),
      messages: session.messages || [],
      messageQueue: session.messageQueue || [],
    };

    set((state) => ({
      // Remove merged sessions and add new one
      sessions: [newSession, ...state.sessions.filter((s) => !sessionIds.includes(s.id))],
      activeSessionId: newSession.id,
    }));
    storeActiveSessionId(newSession.id);

    // Subscribe to new session via WebSocket
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Unsubscribe from old sessions
      for (const sessionId of sessionIds) {
        ws.send(JSON.stringify({ type: 'unsubscribe', sessionId }));
      }
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: newSession.id }));
    }

    return newSession;
  },

  addRepoToSession: async (sessionId: string, repoId: string) => {
    const result = await api<{ id: string; repoIds: string[]; isMultiRepo: boolean }>(
      'POST',
      `/terminal/sessions/${sessionId}/add-repo`,
      { repoId }
    );
    get().updateSession(sessionId, {
      repoIds: result.repoIds,
      repoId: result.repoIds[0],
      isMultiRepo: result.isMultiRepo,
    });
  },

  removeRepoFromSession: async (sessionId: string, repoId: string) => {
    const result = await api<{ id: string; repoIds: string[]; isMultiRepo: boolean }>(
      'POST',
      `/terminal/sessions/${sessionId}/remove-repo`,
      { repoId }
    );
    get().updateSession(sessionId, {
      repoIds: result.repoIds,
      repoId: result.repoIds[0],
      isMultiRepo: result.isMultiRepo,
    });
  },

  switchSession: (sessionId: string) => {
    const { ws, activeSessionId } = get();

    // Unsubscribe from old session
    if (ws && ws.readyState === WebSocket.OPEN && activeSessionId) {
      ws.send(JSON.stringify({ type: 'unsubscribe', sessionId: activeSessionId }));
    }

    set({ activeSessionId: sessionId });
    storeActiveSessionId(sessionId);

    // Subscribe to new session
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
    }
  },

  sendMessage: (content: string, attachments?: MessageAttachment[], agentId?: string, agentChain?: string[]) => {
    const { ws, activeSessionId } = get();
    if (!ws || ws.readyState !== WebSocket.OPEN || !activeSessionId) {
      console.error('Cannot send message: not connected or no active session', {
        wsExists: !!ws,
        wsReadyState: ws?.readyState,
        activeSessionId,
        WebSocketOPEN: WebSocket.OPEN,
      });
      return;
    }

    const payload: Record<string, unknown> = {
      type: 'message',
      sessionId: activeSessionId,
      content,
      attachments,
    };

    // agentChain takes precedence over single agentId
    if (agentChain && agentChain.length > 0) {
      payload.agentChain = agentChain;
    } else if (agentId) {
      payload.agentId = agentId;
    }

    ws.send(JSON.stringify(payload));
  },

  setMode: (mode: 'plan' | 'direct') => {
    const { ws, activeSessionId } = get();
    if (!ws || ws.readyState !== WebSocket.OPEN || !activeSessionId) return;

    ws.send(JSON.stringify({
      type: 'set-mode',
      sessionId: activeSessionId,
      mode,
    }));

    // Optimistic update
    get().updateSession(activeSessionId, { mode });
  },

  cancelOperation: () => {
    const { ws, activeSessionId } = get();
    if (!ws || ws.readyState !== WebSocket.OPEN || !activeSessionId) return;

    ws.send(JSON.stringify({
      type: 'cancel',
      sessionId: activeSessionId,
    }));
  },

  clearMessages: async () => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;

    await api('POST', `/terminal/sessions/${activeSessionId}/clear`);
    get().updateSession(activeSessionId, { messages: [] });
  },

  closeSession: async (sessionId: string, deleteBranch?: boolean, deleteWorktree?: boolean) => {
    const { ws, activeSessionId } = get();

    // Unsubscribe
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'unsubscribe', sessionId }));
    }

    // Build URL with query params
    const params = new URLSearchParams();
    if (deleteBranch !== undefined) params.set('deleteBranch', String(deleteBranch));
    if (deleteWorktree !== undefined) params.set('deleteWorktree', String(deleteWorktree));

    const queryString = params.toString();
    const url = `/terminal/sessions/${sessionId}${queryString ? `?${queryString}` : ''}`;
    await api('DELETE', url);

    set((state) => {
      const newSessions = state.sessions.filter((s) => s.id !== sessionId);
      const newActiveId = sessionId === activeSessionId
        ? newSessions[0]?.id || null
        : activeSessionId;
      // Persist the new active session ID
      if (sessionId === activeSessionId) {
        storeActiveSessionId(newActiveId);
      }
      return { sessions: newSessions, activeSessionId: newActiveId };
    });
  },

  connect: () => {
    // Close any existing connection first
    const existingWs = get().ws;
    if (existingWs) {
      existingWs.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    set({ ws }); // Store WebSocket immediately

    ws.onopen = () => {
      console.log('[Terminal] WebSocket connected');
      set({ isConnected: true });

      // Subscribe to active session if any
      const { activeSessionId } = get();
      if (activeSessionId) {
        ws.send(JSON.stringify({ type: 'subscribe', sessionId: activeSessionId }));
      }
    };

    ws.onclose = () => {
      console.log('[Terminal] WebSocket disconnected');
      set({ isConnected: false, ws: null });

      // Attempt reconnect after 3 seconds
      setTimeout(() => {
        const { ws: currentWs } = get();
        if (!currentWs) {
          get().connect();
        }
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('[Terminal] WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { sessionId } = message;

        switch (message.type) {
          case 'connected':
            console.log('[Terminal] Connected with client ID:', message.clientId);
            break;

          case 'session-state':
            // Full session state update
            if (sessionId) {
              get().updateSession(sessionId, {
                status: message.session.status,
                mode: message.session.mode,
                messages: message.session.messages.map((m: ChatMessage) => ({
                  ...m,
                  timestamp: new Date(m.timestamp),
                })),
                messageQueue: (message.session.messageQueue || []).map((q: QueuedMessage) => ({
                  ...q,
                  queuedAt: new Date(q.queuedAt),
                })),
                wasRecentlyStopped: message.session.wasRecentlyStopped,
                // Worktree fields
                worktreeMode: message.session.worktreeMode,
                worktreePath: message.session.worktreePath,
                branch: message.session.branch,
                baseBranch: message.session.baseBranch,
                ownsWorktree: message.session.ownsWorktree,
              });
            }
            break;

          case 'message':
            // New message added
            if (sessionId && message.message) {
              const newMessage = {
                ...message.message,
                timestamp: new Date(message.message.timestamp),
              };
              set((state) => {
                const session = state.sessions.find((s) => s.id === sessionId);
                // Prevent duplicate messages by checking ID
                if (session && session.messages.some((m) => m.id === newMessage.id)) {
                  return state; // Message already exists, skip
                }
                // Clear tool activities when a new streaming assistant message starts
                const clearActivities = newMessage.role === 'assistant' && newMessage.isStreaming;
                return {
                  sessions: state.sessions.map((s) =>
                    s.id === sessionId
                      ? {
                          ...s,
                          messages: [...s.messages, newMessage],
                          ...(clearActivities ? { toolActivities: [] } : {}),
                        }
                      : s
                  ),
                };
              });
            }
            break;

          case 'chunk':
            // Streaming chunk for a message
            if (sessionId && message.messageId && message.content) {
              get().appendChunk(sessionId, message.messageId, message.content);
            }
            break;

          case 'status':
            // Status update
            if (sessionId && message.status) {
              get().updateSession(sessionId, { status: message.status });
              // Clear activity when status changes to idle
              if (message.status === 'idle') {
                get().updateSession(sessionId, { currentActivity: undefined });
                // Refresh git status to update Review phase with any file changes
                requestCache.invalidate(CACHE_KEYS.GIT_STATUS(sessionId));
                get().fetchGitStatus(sessionId);
              }
            }
            break;

          case 'activity':
            // Activity update from Claude's stderr (shows what Claude is doing)
            if (sessionId && message.content) {
              // Parse Claude's stderr output to extract meaningful activity info
              const content = message.content.trim();
              // Skip empty lines and internal debug logs (like [ClaudeInvoker])
              if (content && !content.startsWith('[ClaudeInvoker]')) {
                // Extract the last meaningful line if multiple lines
                const lines = content.split('\n').filter(l => l.trim());
                const lastLine = lines[lines.length - 1]?.trim();
                if (lastLine) {
                  get().updateSession(sessionId, { currentActivity: lastLine });
                }
              }
            }
            break;

          case 'message-complete':
            // Mark message as complete (stop streaming)
            if (sessionId && message.messageId) {
              set((state) => ({
                sessions: state.sessions.map((s) =>
                  s.id === sessionId
                    ? {
                        ...s,
                        currentActivity: undefined, // Clear activity when done
                        messages: s.messages.map((m) =>
                          m.id === message.messageId
                            ? { ...m, isStreaming: false }
                            : m
                        ),
                      }
                    : s
                ),
              }));
            }
            break;

          case 'file-change':
            // Add file change to current message's fileChanges array
            if (sessionId && message.messageId && message.change) {
              set((state) => ({
                sessions: state.sessions.map((s) =>
                  s.id === sessionId
                    ? {
                        ...s,
                        messages: s.messages.map((m) =>
                          m.id === message.messageId
                            ? {
                                ...m,
                                fileChanges: [
                                  ...(m.fileChanges || []).filter(fc => fc.filePath !== message.change.filePath),
                                  message.change as FileChange,
                                ],
                              }
                            : m
                        ),
                      }
                    : s
                ),
              }));
            }
            break;

          case 'file-changes-complete':
            // Finalize the file changes list for a message
            if (sessionId && message.messageId && Array.isArray(message.fileChanges)) {
              set((state) => ({
                sessions: state.sessions.map((s) =>
                  s.id === sessionId
                    ? {
                        ...s,
                        messages: s.messages.map((m) =>
                          m.id === message.messageId
                            ? { ...m, fileChanges: message.fileChanges as FileChange[] }
                            : m
                        ),
                      }
                    : s
                ),
              }));
            }
            break;

          case 'mode-changed':
            if (sessionId && message.mode) {
              get().updateSession(sessionId, { mode: message.mode });
            }
            break;

          case 'bookmark-changed':
            if (sessionId && typeof message.isBookmarked === 'boolean') {
              get().updateSession(sessionId, {
                isBookmarked: message.isBookmarked,
                bookmarkedAt: message.isBookmarked ? new Date() : undefined,
              });
            }
            break;

          case 'cancelled':
            if (sessionId) {
              get().updateSession(sessionId, { status: 'idle' });
            }
            break;

          case 'chain-segment-start':
            // A new chain segment is starting
            if (sessionId && message.messageId != null && message.segmentIndex != null) {
              set((state) => ({
                sessions: state.sessions.map((s) =>
                  s.id === sessionId
                    ? {
                        ...s,
                        messages: s.messages.map((m) => {
                          if (m.id !== message.messageId) return m;
                          const segments = [...(m.chainSegments || [])];
                          // Ensure segment exists at the right index
                          while (segments.length <= message.segmentIndex) {
                            segments.push({
                              agentId: '',
                              agentName: '',
                              status: 'pending',
                              content: '',
                            });
                          }
                          segments[message.segmentIndex] = {
                            agentId: message.agentId || '',
                            agentName: message.agentName || message.agentId || '',
                            status: 'running',
                            content: '',
                            startedAt: new Date().toISOString(),
                          };
                          return {
                            ...m,
                            agentId: message.agentId || m.agentId,
                            agentName: message.agentName || message.agentId || m.agentName,
                            chainSegments: segments,
                            chainStatus: 'running' as const,
                          };
                        }),
                      }
                    : s
                ),
              }));
            }
            break;

          case 'chain-segment-chunk':
            // Streaming chunk for a specific chain segment
            if (sessionId && message.messageId && message.segmentIndex != null && message.content) {
              set((state) => ({
                sessions: state.sessions.map((s) =>
                  s.id === sessionId
                    ? {
                        ...s,
                        messages: s.messages.map((m) => {
                          if (m.id !== message.messageId || !m.chainSegments) return m;
                          const segments = [...m.chainSegments];
                          if (segments[message.segmentIndex]) {
                            segments[message.segmentIndex] = {
                              ...segments[message.segmentIndex],
                              content: segments[message.segmentIndex].content + message.content,
                            };
                          }
                          return { ...m, chainSegments: segments };
                        }),
                      }
                    : s
                ),
              }));
            }
            break;

          case 'chain-segment-complete':
            // A chain segment finished successfully
            if (sessionId && message.messageId && message.segmentIndex != null) {
              set((state) => ({
                sessions: state.sessions.map((s) =>
                  s.id === sessionId
                    ? {
                        ...s,
                        messages: s.messages.map((m) => {
                          if (m.id !== message.messageId || !m.chainSegments) return m;
                          const segments = [...m.chainSegments];
                          if (segments[message.segmentIndex]) {
                            segments[message.segmentIndex] = {
                              ...segments[message.segmentIndex],
                              status: 'completed',
                              completedAt: new Date().toISOString(),
                            };
                          }
                          return { ...m, chainSegments: segments };
                        }),
                      }
                    : s
                ),
              }));
            }
            break;

          case 'chain-segment-error':
            // A chain segment failed
            if (sessionId && message.messageId && message.segmentIndex != null) {
              set((state) => ({
                sessions: state.sessions.map((s) =>
                  s.id === sessionId
                    ? {
                        ...s,
                        messages: s.messages.map((m) => {
                          if (m.id !== message.messageId || !m.chainSegments) return m;
                          const segments = [...m.chainSegments];
                          if (segments[message.segmentIndex]) {
                            segments[message.segmentIndex] = {
                              ...segments[message.segmentIndex],
                              status: 'failed',
                              error: message.error || 'Unknown error',
                              completedAt: new Date().toISOString(),
                            };
                          }
                          return { ...m, chainSegments: segments, chainStatus: 'partial' as const };
                        }),
                      }
                    : s
                ),
              }));
            }
            break;

          case 'chain-complete':
            // Entire chain finished
            if (sessionId && message.messageId) {
              set((state) => ({
                sessions: state.sessions.map((s) =>
                  s.id === sessionId
                    ? {
                        ...s,
                        messages: s.messages.map((m) => {
                          if (m.id !== message.messageId) return m;
                          return {
                            ...m,
                            isStreaming: false,
                            chainStatus: (message.status as ChatMessage['chainStatus']) || 'completed',
                          };
                        }),
                      }
                    : s
                ),
              }));
            }
            break;

          case 'messages-cleared':
            if (sessionId) {
              get().updateSession(sessionId, { messages: [] });
            }
            break;

          case 'tool-start':
            // New tool started - add to activities (with deduplication)
            if (sessionId && message.activityId && message.tool) {
              set((state) => {
                const session = state.sessions.find((s) => s.id === sessionId);
                const existingActivities = session?.toolActivities || [];

                // Check for duplicate: same tool+target in running state within last few activities
                const isDuplicate = existingActivities.some(
                  (a) =>
                    a.tool === message.tool &&
                    a.target === (message.target || '') &&
                    a.status === 'running'
                );

                if (isDuplicate) {
                  return state; // Skip duplicate
                }

                const newActivity: ToolActivity = {
                  id: message.activityId,
                  tool: message.tool,
                  target: message.target || '',
                  status: 'running',
                  timestamp: new Date(),
                };

                return {
                  sessions: state.sessions.map((s) =>
                    s.id === sessionId
                      ? {
                          ...s,
                          toolActivities: [...existingActivities, newActivity].slice(-50), // Keep last 50
                        }
                      : s
                  ),
                };
              });
            }
            break;

          case 'tool-complete':
            // Tool completed - update status
            if (sessionId && message.activityId) {
              set((state) => ({
                sessions: state.sessions.map((s) =>
                  s.id === sessionId
                    ? {
                        ...s,
                        toolActivities: (s.toolActivities || []).map((a) =>
                          a.id === message.activityId
                            ? { ...a, status: 'complete' as const, completedAt: new Date() }
                            : a
                        ),
                      }
                    : s
                ),
              }));
            }
            break;

          case 'tool-error':
            // Tool errored - update status
            if (sessionId && message.activityId) {
              set((state) => ({
                sessions: state.sessions.map((s) =>
                  s.id === sessionId
                    ? {
                        ...s,
                        toolActivities: (s.toolActivities || []).map((a) =>
                          a.id === message.activityId
                            ? { ...a, status: 'error' as const, error: message.error, completedAt: new Date() }
                            : a
                        ),
                      }
                    : s
                ),
              }));
            }
            break;

          case 'queue-updated':
            // Message queue updated
            if (sessionId && Array.isArray(message.queue)) {
              get().updateSession(sessionId, {
                messageQueue: message.queue.map((q: QueuedMessage) => ({
                  ...q,
                  queuedAt: new Date(q.queuedAt),
                })),
              });
            }
            break;

          case 'usage-update':
            // Update session with new usage stats
            if (sessionId && message.sessionStats) {
              get().updateSession(sessionId, {
                usageStats: message.sessionStats,
                currentModel: message.model,
              });
            }
            break;

          case 'context_state_update':
            // Update session with context state
            if (sessionId && message.contextState) {
              get().updateSession(sessionId, {
                contextState: message.contextState,
              });
            }
            break;

          case 'context_split_suggested':
            // Mark session as split-suggested
            if (sessionId) {
              get().updateSession(sessionId, {
                splitSuggested: true,
              });
            }
            break;

          case 'error':
            console.error('[Terminal] Error:', message.error);
            if (sessionId) {
              get().updateSession(sessionId, { status: 'error' });
            }
            break;

          case 'mcp-tool-approval-needed':
            // MCP tool approval request
            if (sessionId && message.approvalId) {
              set((state) => ({
                pendingMCPApproval: {
                  sessionId,
                  approvalId: message.approvalId,
                  toolName: message.toolName,
                  serverName: message.serverName,
                  serverId: message.serverId,
                  description: message.description,
                  inputParameters: message.inputParameters || {},
                },
              }));
            }
            break;

          // System update events
          case 'system:update-available':
            useUpdateStore.getState().setUpdateAvailable(
              message.currentVersion as string,
              message.latestVersion as string
            );
            break;

          case 'system:update-starting':
          case 'system:update-progress':
            if (message.stage) {
              useUpdateStore.getState().setUpdateProgress(
                message.stage as any,
                message.detail as string | undefined
              );
            }
            break;

          case 'system:update-complete':
            useUpdateStore.getState().setUpdateComplete(
              message.success as boolean,
              message.error as string | undefined
            );
            break;

        }
      } catch (error) {
        console.error('[Terminal] Failed to parse message:', error);
      }
    };

    set({ ws });
  },

  disconnect: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null, isConnected: false });
    }
  },

  updateSession: (sessionId: string, updates: Partial<TerminalSession>) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, ...updates } : s
      ),
    }));
  },

  appendChunk: (sessionId: string, messageId: string, chunk: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;

        return {
          ...s,
          messages: s.messages.map((m) => {
            if (m.id !== messageId) return m;

            // Deduplicate: Claude sometimes emits text twice (streaming + summary)
            // Skip if content already ends with this chunk (exact duplicate)
            if (chunk.length > 10 && m.content.endsWith(chunk)) {
              return m; // Skip duplicate
            }

            // Skip if chunk is large and matches the beginning of existing content
            // This catches cases where the full message is sent again
            if (chunk.length > 50 && m.content.length > 0 && m.content.startsWith(chunk)) {
              return m; // Skip - this is a re-send of content we already have
            }

            // Skip if adding this chunk would create obvious repetition
            // (content repeated in the middle)
            if (chunk.length > 30 && m.content.includes(chunk)) {
              return m; // Skip - content already exists in message
            }

            return { ...m, content: m.content + chunk };
          }),
        };
      }),
    }));
  },

  fetchGitStatus: async (sessionId: string) => {
    try {
      // Use shorter cache time (5s) for git status since it changes more frequently
      const result = await requestCache.fetch(
        CACHE_KEYS.GIT_STATUS(sessionId),
        () => api<GitStatus>('GET', `/terminal/sessions/${sessionId}/git-status`),
        { staleTime: 5000 }
      );
      get().updateSession(sessionId, { gitStatus: result });
    } catch (error) {
      console.error('Failed to fetch git status:', error);
    }
  },

  fetchContextState: async (sessionId: string) => {
    try {
      const result = await api<TerminalSession['contextState']>('GET', `/terminal/sessions/${sessionId}/context`);
      if (result) {
        get().updateSession(sessionId, { contextState: result });
      }
    } catch (error) {
      console.error('Failed to fetch context state:', error);
    }
  },

  splitSession: async (sessionId: string) => {
    try {
      const result = await api<{ id: string }>('POST', `/terminal/sessions/${sessionId}/context/split`);
      if (result?.id) {
        // Reload sessions to pick up the new one
        await get().loadSessions();
        return result.id;
      }
      return null;
    } catch (error) {
      console.error('Failed to split session:', error);
      return null;
    }
  },

  fetchMultiGitStatus: async (sessionId: string) => {
    try {
      const result = await api<{
        isMultiRepo: boolean;
        repos: Record<string, GitStatus & { repoId: string; repoPath: string }>;
      }>('GET', `/terminal/sessions/${sessionId}/multi-git-status`);

      // For now, store the primary repo's git status for backward compatibility
      // UI can access the full multi-repo status if needed
      const session = get().sessions.find((s) => s.id === sessionId);
      if (session && session.repoIds.length > 0) {
        const primaryGitStatus = result.repos[session.repoIds[0]];
        if (primaryGitStatus) {
          get().updateSession(sessionId, { gitStatus: primaryGitStatus });
        }
      }
    } catch (error) {
      console.error('Failed to fetch multi-repo git status:', error);
    }
  },

  toggleBookmark: async (sessionId: string) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const newValue = !session.isBookmarked;

    // Optimistic update
    get().updateSession(sessionId, {
      isBookmarked: newValue,
      bookmarkedAt: newValue ? new Date() : undefined,
    });

    try {
      await api('PATCH', `/terminal/sessions/${sessionId}/bookmark`, {
        isBookmarked: newValue,
      });
    } catch (error) {
      // Revert on error
      get().updateSession(sessionId, {
        isBookmarked: !newValue,
        bookmarkedAt: !newValue ? new Date() : undefined,
      });
      console.error('Failed to toggle bookmark:', error);
    }
  },

  toggleMessageBookmark: (sessionId: string, messageId: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.id === messageId
                  ? { ...m, isBookmarked: !m.isBookmarked }
                  : m
              ),
            }
          : s
      ),
    }));
  },

  exportSession: (sessionId: string, format: 'markdown' | 'json') => {
    // Trigger download via browser
    const url = `/api/terminal/sessions/${sessionId}/export?format=${format}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = ''; // Let server set filename
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  searchSessions: async (query: string) => {
    if (!query.trim()) {
      set({ searchResults: [], isSearching: false });
      return;
    }

    set({ isSearching: true });

    try {
      const results = await api<SearchResult[]>('GET', `/terminal/sessions/search?q=${encodeURIComponent(query)}`);
      set({
        searchResults: results.map(r => ({
          ...r,
          timestamp: new Date(r.timestamp),
        })),
        isSearching: false,
      });
    } catch (error) {
      console.error('Search failed:', error);
      set({ searchResults: [], isSearching: false });
    }
  },

  clearSearchResults: () => {
    set({ searchResults: [], isSearching: false });
  },

  // Queue management
  removeFromQueue: (messageId: string) => {
    const { ws, activeSessionId } = get();
    if (!ws || ws.readyState !== WebSocket.OPEN || !activeSessionId) return;

    ws.send(JSON.stringify({
      type: 'remove-from-queue',
      sessionId: activeSessionId,
      messageId,
    }));
  },

  clearQueue: () => {
    const { ws, activeSessionId } = get();
    if (!ws || ws.readyState !== WebSocket.OPEN || !activeSessionId) return;

    ws.send(JSON.stringify({
      type: 'clear-queue',
      sessionId: activeSessionId,
    }));
  },

  resumeQueue: () => {
    const { ws, activeSessionId } = get();
    if (!ws || ws.readyState !== WebSocket.OPEN || !activeSessionId) return;

    ws.send(JSON.stringify({
      type: 'resume-queue',
      sessionId: activeSessionId,
    }));
  },

  // Attachment management
  addPendingAttachment: async (sessionId: string, file: File) => {
    const id = Math.random().toString(36).substring(2, 15);
    const isImage = file.type.startsWith('image/');

    // Create preview for images
    let preview: string | undefined;
    if (isImage) {
      preview = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    }

    const attachment: PendingAttachment = {
      id,
      file,
      preview,
      uploading: false,
    };

    set((state) => {
      const newMap = new Map(state.pendingAttachments);
      const existing = newMap.get(sessionId) || [];
      newMap.set(sessionId, [...existing, attachment]);
      return { pendingAttachments: newMap };
    });
  },

  removePendingAttachment: (sessionId: string, attachmentId: string) => {
    set((state) => {
      const newMap = new Map(state.pendingAttachments);
      const existing = newMap.get(sessionId) || [];
      newMap.set(sessionId, existing.filter((a) => a.id !== attachmentId));
      return { pendingAttachments: newMap };
    });
  },

  clearPendingAttachments: (sessionId: string) => {
    set((state) => {
      const newMap = new Map(state.pendingAttachments);
      newMap.set(sessionId, []);
      return { pendingAttachments: newMap };
    });
  },

  getPendingAttachments: (sessionId: string) => {
    return get().pendingAttachments.get(sessionId) || [];
  },

  addToolActivity: (sessionId: string, activity: Omit<ToolActivity, 'id' | 'timestamp'>) => {
    const newActivity: ToolActivity = {
      ...activity,
      id: Math.random().toString(36).substring(2, 15),
      timestamp: new Date(),
    };

    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              toolActivities: [...(s.toolActivities || []), newActivity].slice(-50), // Keep last 50
            }
          : s
      ),
    }));
  },

  clearToolActivities: (sessionId: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, toolActivities: [] }
          : s
      ),
    }));
  },

  // Plan question methods
  setPendingPlan: (sessionId: string, messageId: string, questions: PlanQuestion[]) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, pendingPlan: { messageId, questions, additionalContext: '' } }
          : s
      ),
    }));
  },

  answerPlanQuestion: (sessionId: string, questionId: string, answer: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.pendingPlan
          ? {
              ...s,
              pendingPlan: {
                ...s.pendingPlan,
                questions: s.pendingPlan.questions.map((q) =>
                  q.id === questionId ? { ...q, answer } : q
                ),
              },
            }
          : s
      ),
    }));
  },

  setAdditionalContext: (sessionId: string, context: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId && s.pendingPlan
          ? { ...s, pendingPlan: { ...s.pendingPlan, additionalContext: context } }
          : s
      ),
    }));
  },

  approvePlan: (sessionId: string) => {
    const { ws, sessions } = get();
    const session = sessions.find((s) => s.id === sessionId);
    if (!ws || ws.readyState !== WebSocket.OPEN || !session?.pendingPlan) return;

    // Build answers object from questions
    const answers: Record<string, string> = {};
    for (const q of session.pendingPlan.questions) {
      if (q.answer) {
        answers[q.question] = q.answer;
      }
    }

    // Save messageId before clearing
    const approvedMessageId = session.pendingPlan.messageId;

    // Send approve-plan message via WebSocket
    ws.send(JSON.stringify({
      type: 'approve-plan',
      sessionId,
      messageId: approvedMessageId,
      answers,
      additionalContext: session.pendingPlan.additionalContext || '',
    }));

    // Clear pending plan and track approved message ID to prevent re-detection
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, pendingPlan: undefined, approvedPlanMessageId: approvedMessageId }
          : s
      ),
    }));
  },

  cancelPlan: (sessionId: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, pendingPlan: undefined } : s
      ),
    }));
  },

  // Preview panel actions
  setShowPreviewPanel: (show: boolean) => set({ showPreviewPanel: show }),
  setShowStartAppModal: (show: boolean) => set({ showStartAppModal: show }),
  // MCP tool approval
  approveMCPTool: async (approvalId: string, autoApproveSession: boolean) => {
    try {
      await api('POST', `/mcp/approve/${approvalId}`, { autoApproveSession });
      set({ pendingMCPApproval: null });
    } catch (error) {
      console.error('[Terminal] Failed to approve MCP tool:', error);
      throw error;
    }
  },

  denyMCPTool: async (approvalId: string) => {
    try {
      await api('POST', `/mcp/deny/${approvalId}`);
      set({ pendingMCPApproval: null });
    } catch (error) {
      console.error('[Terminal] Failed to deny MCP tool:', error);
      throw error;
    }
  },

  clearMCPApproval: () => set({ pendingMCPApproval: null }),
}));
