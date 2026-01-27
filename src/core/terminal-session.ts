import { ChildProcess, execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, statSync, rmSync, copyFileSync, symlinkSync, lstatSync } from 'fs';
import { join, dirname, basename } from 'path';
import treeKill from 'tree-kill';
import { claudeInvoker, ClaudeStreamEvent } from './claude-invoker.js';
import { wsManager } from './ws-manager.js';
import { repoRegistry } from '../config/repos.js';
import { getClaudeSessions, formatSessionList, getSessionByRef, ClaudeSession } from './claude-session-reader.js';
import { skillRegistry } from '../config/skills.js';
import { skillExecutor } from './skill-executor.js';
import { gitSandbox } from './git-sandbox.js';
import { usageManager } from './usage-manager.js';
import { agentUsageManager } from '../config/agent-usage.js';
import { FileChange } from '../types.js';

// Helper to generate unique IDs
function generateActivityId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Extract meaningful target from tool input for display
function extractToolTarget(toolName: string, toolInput: unknown): string {
  const input = toolInput as Record<string, unknown>;

  switch (toolName) {
    case 'Read':
      return typeof input?.file_path === 'string'
        ? input.file_path.split(/[/\\]/).pop() || input.file_path
        : 'file';
    case 'Edit':
    case 'Write':
      return typeof input?.file_path === 'string'
        ? input.file_path.split(/[/\\]/).pop() || input.file_path
        : 'file';
    case 'Bash':
      const cmd = typeof input?.command === 'string' ? input.command : '';
      // Truncate long commands
      return cmd.length > 40 ? cmd.slice(0, 40) + '...' : cmd;
    case 'Glob':
      return typeof input?.pattern === 'string' ? input.pattern : 'pattern';
    case 'Grep':
      return typeof input?.pattern === 'string' ? input.pattern : 'search';
    case 'Task':
      // Extract agent type and description for Task tool
      const agentType = typeof input?.subagent_type === 'string' ? input.subagent_type : null;
      const taskDesc = typeof input?.description === 'string' ? input.description : 'task';
      return agentType ? `${agentType}: ${taskDesc}` : taskDesc;
    case 'WebFetch':
      return typeof input?.url === 'string'
        ? new URL(input.url).hostname
        : 'url';
    case 'WebSearch':
      return typeof input?.query === 'string' ? input.query : 'search';
    default:
      return '';
  }
}

export interface MessageAttachment {
  id: string;
  originalName: string;
  path: string;  // Absolute path for Claude to read
  size: number;
  mimeType: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  attachments?: MessageAttachment[];
  agentId?: string;      // Agent used for this message (if any)
  agentName?: string;    // Display name of the agent
}

export interface SearchResult {
  sessionId: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;  // Snippet with context around match
  timestamp: Date;
  repoIds: string[];
  isBookmarked: boolean;
  sessionName?: string;
  matchIndex: number; // Index of match in content for highlighting
}

export interface QueuedMessage {
  id: string;
  content: string;
  attachments?: MessageAttachment[];
  mode: 'plan' | 'direct';
  queuedAt: Date;
}

export interface TerminalSession {
  id: string;
  repoIds: string[];              // Array of repo IDs (first = primary)
  isMultiRepo: boolean;           // Convenience flag: repoIds.length > 1
  mergedFromSessionIds?: string[]; // Track original sessions if merged
  messages: ChatMessage[];
  messageQueue: QueuedMessage[];  // Queue for messages while running
  status: 'idle' | 'running' | 'error';
  mode: 'plan' | 'direct';
  claudeProcess?: ChildProcess;
  claudeSessionId?: string; // Claude Code session ID for --resume
  createdAt: Date;
  lastActivityAt: Date;
  isBookmarked: boolean;          // Whether session is pinned/bookmarked
  bookmarkedAt?: Date;            // When the session was bookmarked
  name?: string;                  // Optional friendly name

  // Worktree Support
  worktreeMode?: boolean;         // true = isolated worktree
  worktreePath?: string;          // Path to the worktree
  branch?: string;                // Branch name for the worktree
  baseBranch?: string;            // Branch worktree was created from
  ownsWorktree?: boolean;         // true = session created this worktree (should delete on close)
}

// Helper to get primary repo ID for backward compatibility
export function getPrimaryRepoId(session: TerminalSession): string {
  return session.repoIds[0];
}

// Cache for Claude sessions per repo
const claudeSessionsCache: Map<string, { sessions: ClaudeSession[]; fetchedAt: number }> = new Map();

// Lazy path resolution - evaluated when needed, not at module load time
function getSessionsFile(): string {
  return join(process.cwd(), 'config', 'terminal-sessions.json');
}
function getTerminalArtifactsDir(): string {
  return join(process.cwd(), 'artifacts', 'terminal');
}
function getAttachmentsDir(): string {
  return join(process.cwd(), 'temp', 'terminal-attachments');
}

// Worktree options for session creation
export interface WorktreeSessionOptions {
  worktreeMode: true;
  branch: string;              // Branch name for the worktree (empty if using existing)
  baseBranch?: string;         // Optional: branch to create from (defaults to main/master)
  existingWorktreePath?: string; // Optional: path to existing worktree to use instead of creating new
}

// Helper to generate worktree path
// Convention: <parent-of-repo>/.claudedesk-terminal-worktrees/<repoId>/<sessionId>/
function getWorktreePath(repoPath: string, repoId: string, sessionId: string): string {
  const parentDir = dirname(repoPath);
  return join(parentDir, '.claudedesk-terminal-worktrees', repoId, sessionId);
}

// REL-02: Process limits to prevent resource exhaustion
const MAX_TOTAL_SESSIONS = 50;           // Maximum total sessions
const MAX_ACTIVE_CLAUDE_PROCESSES = 5;   // Maximum concurrent Claude processes

class TerminalSessionManager {
  private sessions: Map<string, TerminalSession> = new Map();

  constructor() {
    this.loadSessions();
    this.setupWebSocketHandlers();
  }

  /**
   * REL-02: Get count of sessions with active Claude processes
   */
  private getActiveProcessCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.status === 'running') {
        count++;
      }
    }
    return count;
  }

  private loadSessions(): void {
    try {
      if (existsSync(getSessionsFile())) {
        const data = JSON.parse(readFileSync(getSessionsFile(), 'utf-8'));
        let worktreeValidationCount = 0;

        for (const session of data.sessions || []) {
          // Migration: convert legacy repoId to repoIds array
          const repoIds = session.repoIds || (session.repoId ? [session.repoId] : []);
          const isMultiRepo = repoIds.length > 1;

          // Restore worktree fields
          let worktreeMode = session.worktreeMode;
          let worktreePath = session.worktreePath;
          let branch = session.branch;
          let baseBranch = session.baseBranch;
          // Migration: preserve ownsWorktree if set, otherwise leave undefined
          // We don't default to true because we can't be sure if old sessions own their worktrees
          // This is safer - only delete worktrees that are explicitly marked as owned
          let ownsWorktree = session.ownsWorktree;

          // Validate worktree still exists and is valid
          if (worktreeMode && worktreePath) {
            if (!existsSync(worktreePath) || !gitSandbox.isValidWorktree(worktreePath)) {
              console.log(`[TerminalSession] Worktree for session ${session.id} is invalid or missing, clearing worktree fields`);
              worktreeMode = false;
              worktreePath = undefined;
              branch = undefined;
              baseBranch = undefined;
              ownsWorktree = undefined;
              worktreeValidationCount++;
            }
          }

          // Restore dates and reset status
          this.sessions.set(session.id, {
            ...session,
            repoIds,
            isMultiRepo,
            mergedFromSessionIds: session.mergedFromSessionIds,
            claudeSessionId: session.claudeSessionId, // Restore Claude session ID for --resume
            status: 'idle',
            createdAt: new Date(session.createdAt),
            lastActivityAt: new Date(session.lastActivityAt),
            isBookmarked: session.isBookmarked ?? false,
            bookmarkedAt: session.bookmarkedAt ? new Date(session.bookmarkedAt) : undefined,
            name: session.name,
            messages: session.messages.map((m: ChatMessage) => ({
              ...m,
              timestamp: new Date(m.timestamp),
              isStreaming: false,
            })),
            messageQueue: (session.messageQueue || []).map((q: QueuedMessage) => ({
              ...q,
              queuedAt: new Date(q.queuedAt),
            })),
            // Worktree fields (validated)
            worktreeMode,
            worktreePath,
            branch,
            baseBranch,
            ownsWorktree,
          });
        }
        console.log(`[TerminalSession] Loaded ${this.sessions.size} sessions`);
        if (worktreeValidationCount > 0) {
          console.log(`[TerminalSession] Cleared worktree data for ${worktreeValidationCount} sessions with missing/invalid worktrees`);
          this.saveSessions(); // Save to persist the cleared worktree fields
        }
      }
    } catch (error) {
      console.error('[TerminalSession] Failed to load sessions:', error);
    }
  }

  private saveSessions(): void {
    try {
      const configDir = join(process.cwd(), 'config');
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      const data = {
        sessions: Array.from(this.sessions.values()).map((session) => ({
          id: session.id,
          repoIds: session.repoIds,
          isMultiRepo: session.isMultiRepo,
          mergedFromSessionIds: session.mergedFromSessionIds,
          mode: session.mode,
          claudeSessionId: session.claudeSessionId, // Persist Claude session ID for --resume
          messages: session.messages,
          messageQueue: session.messageQueue, // Persist message queue
          createdAt: session.createdAt,
          lastActivityAt: session.lastActivityAt,
          isBookmarked: session.isBookmarked,
          bookmarkedAt: session.bookmarkedAt,
          name: session.name,
          // Worktree fields
          worktreeMode: session.worktreeMode,
          worktreePath: session.worktreePath,
          branch: session.branch,
          baseBranch: session.baseBranch,
          ownsWorktree: session.ownsWorktree,
        })),
      };

      writeFileSync(getSessionsFile(), JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[TerminalSession] Failed to save sessions:', error);
    }
  }

  private setupWebSocketHandlers(): void {
    // Subscribe to session
    wsManager.on('subscribe', (client, message) => {
      const { sessionId } = message;
      if (sessionId && this.sessions.has(sessionId)) {
        wsManager.subscribeToSession(client, sessionId);
        // Send current session state
        const session = this.sessions.get(sessionId)!;
        wsManager.send(client, {
          type: 'session-state',
          sessionId,
          session: {
            id: session.id,
            repoIds: session.repoIds,
            repoId: session.repoIds[0], // Backward compatibility
            isMultiRepo: session.isMultiRepo,
            status: session.status,
            mode: session.mode,
            messages: session.messages,
            messageQueue: session.messageQueue,
            // Worktree fields
            worktreeMode: session.worktreeMode,
            worktreePath: session.worktreePath,
            branch: session.branch,
            baseBranch: session.baseBranch,
            ownsWorktree: session.ownsWorktree,
          },
        });
      }
    });

    // Unsubscribe from session
    wsManager.on('unsubscribe', (client, message) => {
      const { sessionId } = message;
      if (sessionId) {
        wsManager.unsubscribeFromSession(client, sessionId);
      }
    });

    // Send message to Claude
    wsManager.on('message', async (client, message) => {
      const { sessionId, content, attachments, agentId } = message;
      if (sessionId && content && typeof content === 'string') {
        // Validate attachments if provided
        const validAttachments = Array.isArray(attachments) ? attachments as MessageAttachment[] : undefined;
        // Validate agentId if provided
        const validAgentId = typeof agentId === 'string' ? agentId : undefined;
        await this.sendMessage(sessionId, content, validAttachments, validAgentId);
      }
    });

    // Set session mode
    wsManager.on('set-mode', (client, message) => {
      const { sessionId, mode } = message;
      if (sessionId && (mode === 'plan' || mode === 'direct')) {
        this.setMode(sessionId, mode);
      }
    });

    // Cancel running process
    wsManager.on('cancel', (client, message) => {
      const { sessionId } = message;
      if (sessionId) {
        this.cancelSession(sessionId);
      }
    });

    // Approve plan and execute with answers
    wsManager.on('approve-plan', async (client, message) => {
      const { sessionId, messageId, answers, additionalContext } = message as {
        sessionId?: string;
        messageId?: string;
        answers?: Record<string, string>;
        additionalContext?: string;
      };
      if (sessionId && messageId) {
        await this.executePlan(sessionId, messageId, answers || {}, additionalContext || '');
      }
    });

    // Queue a message (explicit queue request)
    wsManager.on('queue-message', (client, message) => {
      const { sessionId, content, attachments, mode } = message as {
        sessionId?: string;
        content?: string;
        attachments?: MessageAttachment[];
        mode?: 'plan' | 'direct';
      };
      if (sessionId && content) {
        const session = this.sessions.get(sessionId);
        if (session) {
          this.queueMessage(sessionId, content, mode || session.mode, attachments);
        }
      }
    });

    // Remove a message from queue
    wsManager.on('remove-from-queue', (client, message) => {
      const { sessionId, messageId } = message as { sessionId?: string; messageId?: string };
      if (sessionId && messageId) {
        this.removeFromQueue(sessionId, messageId);
      }
    });

    // Clear entire queue
    wsManager.on('clear-queue', (client, message) => {
      const { sessionId } = message as { sessionId?: string };
      if (sessionId) {
        this.clearQueue(sessionId);
      }
    });
  }

  createSession(repoIdOrIds: string | string[], worktreeOptions?: WorktreeSessionOptions): TerminalSession {
    // REL-02: Enforce session limit to prevent resource exhaustion
    if (this.sessions.size >= MAX_TOTAL_SESSIONS) {
      throw new Error(`Maximum number of sessions (${MAX_TOTAL_SESSIONS}) reached. Please delete some sessions to create new ones.`);
    }

    // Normalize to array
    const repoIds = Array.isArray(repoIdOrIds) ? repoIdOrIds : [repoIdOrIds];

    if (repoIds.length === 0) {
      throw new Error('At least one repository is required');
    }

    // Validate all repos exist
    for (const repoId of repoIds) {
      const repo = repoRegistry.get(repoId);
      if (!repo) {
        throw new Error(`Repository not found: ${repoId}`);
      }
    }

    // Validate worktree options
    if (worktreeOptions) {
      // Either need a branch name for new worktree OR an existing worktree path
      const hasExisting = worktreeOptions.existingWorktreePath && typeof worktreeOptions.existingWorktreePath === 'string';
      const hasNewBranch = worktreeOptions.branch && typeof worktreeOptions.branch === 'string';

      if (!hasExisting && !hasNewBranch) {
        throw new Error('Branch name or existingWorktreePath is required when worktreeMode is enabled');
      }
      // Worktree mode only supports single repo
      if (repoIds.length > 1) {
        throw new Error('Worktree mode does not support multi-repo sessions');
      }
    }

    const id = this.generateId();
    const isMultiRepo = repoIds.length > 1;
    const session: TerminalSession = {
      id,
      repoIds,
      isMultiRepo,
      messages: [],
      messageQueue: [],
      status: 'idle',
      mode: 'direct',
      createdAt: new Date(),
      lastActivityAt: new Date(),
      isBookmarked: false,
    };

    // Set up worktree if requested
    if (worktreeOptions) {
      const primaryRepoId = repoIds[0];
      const repo = repoRegistry.get(primaryRepoId)!;

      // Check if using existing worktree
      if (worktreeOptions.existingWorktreePath) {
        const existingPath = worktreeOptions.existingWorktreePath;

        console.log(`[TerminalSession] Using existing worktree for session ${id} at ${existingPath}`);

        // Validate the existing worktree
        if (!existsSync(existingPath)) {
          throw new Error(`Existing worktree path does not exist: ${existingPath}`);
        }

        if (!gitSandbox.isValidWorktree(existingPath)) {
          throw new Error(`Path is not a valid git worktree: ${existingPath}`);
        }

        // Get branch name from the existing worktree
        let branch = '';
        try {
          branch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: existingPath,
            encoding: 'utf-8',
            timeout: 5000,
          }).trim();
        } catch (e) {
          throw new Error(`Could not determine branch for worktree: ${e instanceof Error ? e.message : String(e)}`);
        }

        // Store worktree info in session
        session.worktreeMode = true;
        session.worktreePath = existingPath;
        session.branch = branch;
        session.ownsWorktree = false; // Session is borrowing this worktree, don't delete on close
        // For existing worktrees, we don't track baseBranch

        console.log(`[TerminalSession] Using existing worktree for branch ${branch}`);
      } else {
        // Create new worktree
        const worktreePath = getWorktreePath(repo.path, primaryRepoId, id);
        const branch = worktreeOptions.branch;
        const baseBranch = worktreeOptions.baseBranch || gitSandbox.getMainBranch(repo.path);

        console.log(`[TerminalSession] Creating worktree for session ${id} at ${worktreePath}`);

        try {
          // Ensure parent directory exists
          const worktreeParent = dirname(worktreePath);
          if (!existsSync(worktreeParent)) {
            mkdirSync(worktreeParent, { recursive: true });
          }

          // Create the worktree
          gitSandbox.createWorktree(repo.path, worktreePath, branch);

          // Copy .env file if it exists in the main repo
          const envPath = join(repo.path, '.env');
          const worktreeEnvPath = join(worktreePath, '.env');
          if (existsSync(envPath) && !existsSync(worktreeEnvPath)) {
            console.log(`[TerminalSession] Copying .env to worktree`);
            copyFileSync(envPath, worktreeEnvPath);
          }

          // Symlink node_modules if it exists in the main repo
          const nodeModulesPath = join(repo.path, 'node_modules');
          const worktreeNodeModulesPath = join(worktreePath, 'node_modules');
          if (existsSync(nodeModulesPath) && !existsSync(worktreeNodeModulesPath)) {
            console.log(`[TerminalSession] Symlinking node_modules to worktree`);
            try {
              symlinkSync(nodeModulesPath, worktreeNodeModulesPath, 'junction');
            } catch (e) {
              // Symlink might fail on some systems, that's okay
              console.warn(`[TerminalSession] Could not symlink node_modules: ${e instanceof Error ? e.message : e}`);
            }
          }

          // Store worktree info in session
          session.worktreeMode = true;
          session.worktreePath = worktreePath;
          session.branch = branch;
          session.baseBranch = baseBranch;
          session.ownsWorktree = true; // Session created this worktree, delete on close

          console.log(`[TerminalSession] Worktree created successfully for branch ${branch}`);
        } catch (error) {
          // Clean up on failure
          if (existsSync(worktreePath)) {
            try {
              rmSync(worktreePath, { recursive: true, force: true });
            } catch {
              // Ignore cleanup errors
            }
          }
          throw new Error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    this.sessions.set(id, session);
    this.saveSessions();

    const repoLabel = isMultiRepo ? `repos [${repoIds.join(', ')}]` : `repo ${repoIds[0]}`;
    const worktreeLabel = session.worktreeMode ? ` (worktree: ${session.branch})` : '';
    console.log(`[TerminalSession] Created session ${id} for ${repoLabel}${worktreeLabel}`);
    return session;
  }

  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): TerminalSession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime()
    );
  }

  // Merge multiple sessions into a single multi-repo session
  mergeSessions(sessionIds: string[]): TerminalSession {
    if (sessionIds.length < 2) {
      throw new Error('Need at least 2 sessions to merge');
    }

    // Validate all sessions exist and are not running
    const sessions: TerminalSession[] = [];
    const allRepoIds: Set<string> = new Set();

    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      if (session.status === 'running') {
        throw new Error(`Cannot merge running session: ${sessionId}`);
      }
      sessions.push(session);
      session.repoIds.forEach(id => allRepoIds.add(id));
    }

    // Create new merged session with fresh history
    const id = this.generateId();
    const repoIds = Array.from(allRepoIds);
    const newSession: TerminalSession = {
      id,
      repoIds,
      isMultiRepo: true,
      mergedFromSessionIds: sessionIds,
      messages: [], // Fresh history as per requirement
      messageQueue: [],
      status: 'idle',
      mode: sessions[0].mode, // Inherit mode from first session
      createdAt: new Date(),
      lastActivityAt: new Date(),
      isBookmarked: false,
    };

    // Delete original sessions
    for (const sessionId of sessionIds) {
      this.cancelSession(sessionId); // Cancel any pending processes
      this.sessions.delete(sessionId);
    }

    this.sessions.set(newSession.id, newSession);
    this.saveSessions();

    console.log(`[TerminalSession] Merged sessions [${sessionIds.join(', ')}] into ${id} with repos [${repoIds.join(', ')}]`);
    return newSession;
  }

  // Add a repository to an existing session
  addRepoToSession(sessionId: string, repoId: string): TerminalSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const repo = repoRegistry.get(repoId);
    if (!repo) {
      throw new Error(`Repository not found: ${repoId}`);
    }

    if (session.repoIds.includes(repoId)) {
      throw new Error(`Repository ${repoId} is already in this session`);
    }

    session.repoIds.push(repoId);
    session.isMultiRepo = true;
    session.lastActivityAt = new Date();
    this.saveSessions();

    console.log(`[TerminalSession] Added repo ${repoId} to session ${sessionId}`);
    return session;
  }

  // Remove a repository from a session
  removeRepoFromSession(sessionId: string, repoId: string): TerminalSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.repoIds.length <= 1) {
      throw new Error('Cannot remove the last repository from a session');
    }

    const index = session.repoIds.indexOf(repoId);
    if (index === -1) {
      throw new Error(`Repository ${repoId} is not in this session`);
    }

    session.repoIds.splice(index, 1);
    session.isMultiRepo = session.repoIds.length > 1;
    session.lastActivityAt = new Date();
    this.saveSessions();

    console.log(`[TerminalSession] Removed repo ${repoId} from session ${sessionId}`);
    return session;
  }

  async sendMessage(sessionId: string, content: string, attachments?: MessageAttachment[], agentId?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // If session is running, queue the message instead of throwing error
    if (session.status === 'running') {
      this.queueMessage(sessionId, content, session.mode, attachments);
      return;
    }

    // REL-02: Check active process limit before starting new Claude process
    const activeCount = this.getActiveProcessCount();
    if (activeCount >= MAX_ACTIVE_CLAUDE_PROCESSES) {
      // Queue the message instead of rejecting
      this.queueMessage(sessionId, content, session.mode, attachments);
      wsManager.broadcastToSession(sessionId, {
        type: 'info',
        message: `Message queued. ${activeCount} Claude processes are currently running (max ${MAX_ACTIVE_CLAUDE_PROCESSES}). Your message will be processed when a slot becomes available.`,
      });
      return;
    }

    // Get primary repo (first in list)
    const primaryRepoId = session.repoIds[0];
    const repo = repoRegistry.get(primaryRepoId);
    if (!repo) {
      throw new Error(`Repository not found: ${primaryRepoId}`);
    }

    // Handle slash commands locally
    const slashCommand = this.handleSlashCommand(session, content);
    if (slashCommand) {
      return; // Command handled, don't invoke Claude
    }

    // Add user message with attachments
    const userMessage: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content,
      timestamp: new Date(),
      attachments,
    };
    session.messages.push(userMessage);
    session.lastActivityAt = new Date();
    session.status = 'running';

    // Broadcast user message
    wsManager.broadcastToSession(sessionId, {
      type: 'message',
      message: userMessage,
    });

    wsManager.broadcastToSession(sessionId, {
      type: 'status',
      status: 'running',
    });

    // Resolve agent name if agentId provided and record usage
    let agentName: string | undefined;
    if (agentId) {
      // Simple name resolution - agent ID is typically the agent name
      agentName = agentId;
      // Record agent usage for recent agents tracking
      agentUsageManager.recordAgentUsage(agentId, agentName);
    }

    // Create assistant message placeholder for streaming
    const assistantMessage: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      agentId,
      agentName,
    };
    session.messages.push(assistantMessage);

    wsManager.broadcastToSession(sessionId, {
      type: 'message',
      message: assistantMessage,
    });

    // Build prompt with conversation context
    let prompt = this.buildPromptWithContext(session, content);

    // Add attachment context if files were attached
    if (attachments && attachments.length > 0) {
      prompt = this.buildAttachmentContext(attachments) + '\n\n' + prompt;
    }

    // Add multi-repo context for multi-repo sessions
    if (session.isMultiRepo) {
      prompt = this.buildMultiRepoContext(session) + '\n\n' + prompt;
    }

    // Add safety instructions to prevent killing ClaudeDesk
    prompt = this.getSafetyInstructions() + '\n\n' + prompt;

    if (session.mode === 'plan') {
      prompt = claudeInvoker.generatePlanPrompt(prompt);
    }

    // Create artifacts directory for this session
    const artifactsDir = join(getTerminalArtifactsDir(), sessionId);
    if (!existsSync(artifactsDir)) {
      mkdirSync(artifactsDir, { recursive: true });
    }

    // Determine working directory: use worktree path if available
    const workingDir = session.worktreeMode && session.worktreePath
      ? session.worktreePath
      : repo.path;

    // Add worktree context to prompt if in worktree mode
    if (session.worktreeMode && session.branch) {
      prompt = this.buildWorktreeContext(session) + '\n\n' + prompt;
    }

    // Track current tool activity for completion tracking
    let currentActivityId: string | null = null;
    // Track file changes for the current message
    const currentMessageFileChanges: FileChange[] = [];

    try {
      // Invoke Claude with streaming
      const result = await claudeInvoker.invoke({
        repoPath: workingDir,
        prompt,
        artifactsDir,
        resumeSessionId: session.claudeSessionId, // Resume Claude session if set
        agentId, // Pass agent ID for --agent flag
        onProcessStart: (proc) => {
          session.claudeProcess = proc;
        },
        onStreamEvent: (event: ClaudeStreamEvent) => {
          // Handle different event types
          if (event.type === 'text' && event.content) {
            // If we have an active tool, complete it before text output
            if (currentActivityId) {
              wsManager.broadcastToSession(sessionId, {
                type: 'tool-complete',
                activityId: currentActivityId,
              });
              currentActivityId = null;
            }

            // Stream text content to the message
            assistantMessage.content += event.content;
            wsManager.broadcastToSession(sessionId, {
              type: 'chunk',
              messageId: assistantMessage.id,
              content: event.content,
            });
          } else if (event.type === 'tool_use' && event.toolName) {
            // Complete previous tool if any
            if (currentActivityId) {
              wsManager.broadcastToSession(sessionId, {
                type: 'tool-complete',
                activityId: currentActivityId,
              });
            }

            // Start new tool activity
            currentActivityId = generateActivityId();
            const target = extractToolTarget(event.toolName, event.toolInput);

            wsManager.broadcastToSession(sessionId, {
              type: 'tool-start',
              activityId: currentActivityId,
              tool: event.toolName,
              target,
            });

            // Track file changes for Write and Edit tools
            if ((event.toolName === 'Write' || event.toolName === 'Edit') && event.toolInput) {
              const input = event.toolInput as Record<string, unknown>;
              const filePath = input.file_path as string;
              if (filePath) {
                // Determine if this is a new file or modification
                const fileExists = existsSync(filePath);
                const operation: FileChange['operation'] = event.toolName === 'Write' && !fileExists ? 'created' : 'modified';

                const fileChange: FileChange = {
                  id: generateActivityId(),
                  filePath,
                  fileName: basename(filePath),
                  operation,
                  toolActivityId: currentActivityId,
                };

                // Avoid duplicate entries for the same file
                const existingIndex = currentMessageFileChanges.findIndex(fc => fc.filePath === filePath);
                if (existingIndex >= 0) {
                  currentMessageFileChanges[existingIndex] = fileChange;
                } else {
                  currentMessageFileChanges.push(fileChange);
                }

                // Broadcast file change event
                wsManager.broadcastToSession(sessionId, {
                  type: 'file-change',
                  messageId: assistantMessage.id,
                  change: fileChange,
                });
              }
            }

            // Also broadcast legacy activity for backward compatibility
            wsManager.broadcastToSession(sessionId, {
              type: 'activity',
              content: event.content,
              toolName: event.toolName,
            });
          } else if (event.type === 'error' && event.content) {
            // Mark current tool as error if any
            if (currentActivityId) {
              wsManager.broadcastToSession(sessionId, {
                type: 'tool-error',
                activityId: currentActivityId,
                error: event.content,
              });
              currentActivityId = null;
            }

            // Broadcast error
            wsManager.broadcastToSession(sessionId, {
              type: 'activity',
              content: `Error: ${event.content}`,
            });
          } else if (event.type === 'result') {
            // Capture Claude session ID for future --resume
            if (event.sessionId && !session.claudeSessionId) {
              session.claudeSessionId = event.sessionId;
              console.log(`[TerminalSession] Captured Claude session ID: ${event.sessionId}`);
            }

            // Record usage if available
            if (event.usage) {
              const toolCount = currentActivityId ? 1 : 0; // Rough estimate
              usageManager.recordMessageUsage(
                sessionId,
                {
                  messageId: assistantMessage.id,
                  model: event.model,
                  usage: event.usage,
                  costUsd: event.costUsd,
                  durationMs: event.durationMs,
                },
                toolCount,
                currentMessageFileChanges.length
              );

              // Broadcast usage update to UI
              wsManager.broadcastToSession(sessionId, {
                type: 'usage-update',
                usage: event.usage,
                model: event.model,
                costUsd: event.costUsd,
                durationMs: event.durationMs,
                sessionStats: usageManager.getSessionUsage(sessionId),
              });
            }
          }
        },
      });

      // Complete any remaining tool activity
      if (currentActivityId) {
        wsManager.broadcastToSession(sessionId, {
          type: 'tool-complete',
          activityId: currentActivityId,
        });
        currentActivityId = null;
      }

      // Update message state
      assistantMessage.isStreaming = false;

      if (!result.success) {
        // Check if it's a "Prompt is too long" error - clear session ID so next message starts fresh
        if (result.error?.toLowerCase().includes('prompt is too long') ||
            result.error?.toLowerCase().includes('too long')) {
          console.log(`[TerminalSession] Prompt too long - clearing Claude session ID to start fresh`);
          session.claudeSessionId = undefined;
          assistantMessage.content += `\n\n**Error:** The Claude session has reached its context limit. Your next message will start a fresh conversation. Use \`/resume\` to see and resume other sessions.`;
        } else if (session.claudeSessionId && result.error?.includes('exit code 1')) {
          // Session resume failed - clear session ID so next message starts fresh
          console.log(`[TerminalSession] Session resume failed - clearing Claude session ID to start fresh`);
          session.claudeSessionId = undefined;
          assistantMessage.content += `\n\n**Error:** Could not resume the previous session. Your next message will start a fresh conversation.`;
        } else {
          assistantMessage.content += `\n\n**Error:** ${result.error}`;
        }
      }

      session.status = 'idle';

      // Broadcast file-changes-complete with all file changes for this message
      if (currentMessageFileChanges.length > 0) {
        wsManager.broadcastToSession(sessionId, {
          type: 'file-changes-complete',
          messageId: assistantMessage.id,
          fileChanges: currentMessageFileChanges,
        });
      }

      wsManager.broadcastToSession(sessionId, {
        type: 'message-complete',
        messageId: assistantMessage.id,
        success: result.success,
      });

      wsManager.broadcastToSession(sessionId, {
        type: 'status',
        status: 'idle',
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      assistantMessage.content += `\n\n**Error:** ${errorMsg}`;
      assistantMessage.isStreaming = false;
      session.status = 'error';

      wsManager.broadcastToSession(sessionId, {
        type: 'error',
        error: errorMsg,
      });

      wsManager.broadcastToSession(sessionId, {
        type: 'status',
        status: 'error',
      });
    } finally {
      session.claudeProcess = undefined;
      this.saveSessions();

      // Process next queued message if any (only on success/idle)
      if (session.status === 'idle' && session.messageQueue.length > 0) {
        setTimeout(() => this.processNextInQueue(sessionId), 100);
      }
    }
  }

  setMode(sessionId: string, mode: 'plan' | 'direct'): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.mode = mode;
      this.saveSessions();

      wsManager.broadcastToSession(sessionId, {
        type: 'mode-changed',
        mode,
      });

      console.log(`[TerminalSession] Session ${sessionId} mode set to ${mode}`);
    }
  }

  setBookmark(sessionId: string, isBookmarked: boolean): TerminalSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isBookmarked = isBookmarked;
      session.bookmarkedAt = isBookmarked ? new Date() : undefined;
      this.saveSessions();

      wsManager.broadcastToSession(sessionId, {
        type: 'bookmark-changed',
        isBookmarked,
      });

      console.log(`[TerminalSession] Session ${sessionId} bookmark set to ${isBookmarked}`);
      return session;
    }
    return undefined;
  }

  setSessionName(sessionId: string, name: string | undefined): TerminalSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.name = name;
      this.saveSessions();
      console.log(`[TerminalSession] Session ${sessionId} name set to ${name || '(cleared)'}`);
      return session;
    }
    return undefined;
  }

  exportSession(sessionId: string, format: 'markdown' | 'json'): string | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    if (format === 'json') {
      return JSON.stringify({
        id: session.id,
        repoIds: session.repoIds,
        isMultiRepo: session.isMultiRepo,
        mode: session.mode,
        isBookmarked: session.isBookmarked,
        name: session.name,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        messages: session.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          attachments: m.attachments,
        })),
      }, null, 2);
    }

    // Markdown format
    const lines: string[] = [];
    const repoLabel = session.isMultiRepo
      ? session.repoIds.join(', ')
      : session.repoIds[0];

    lines.push(`# Terminal Session: ${session.name || repoLabel}`);
    lines.push('');
    lines.push(`**Session ID:** \`${session.id}\``);
    lines.push(`**Repositories:** ${repoLabel}`);
    lines.push(`**Mode:** ${session.mode}`);
    lines.push(`**Created:** ${session.createdAt.toISOString()}`);
    lines.push(`**Last Activity:** ${session.lastActivityAt.toISOString()}`);
    if (session.isBookmarked) {
      lines.push(`**Bookmarked:** Yes`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const message of session.messages) {
      const role = message.role === 'user' ? '**User**' : '**Assistant**';
      const timestamp = new Date(message.timestamp).toLocaleString();

      lines.push(`### ${role}`);
      lines.push(`*${timestamp}*`);
      lines.push('');
      lines.push(message.content);
      lines.push('');

      if (message.attachments && message.attachments.length > 0) {
        lines.push('**Attachments:**');
        for (const att of message.attachments) {
          lines.push(`- ${att.originalName} (${att.mimeType})`);
        }
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  searchMessages(query: string, limit: number = 50): SearchResult[] {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchTerm = query.toLowerCase().trim();
    const results: SearchResult[] = [];
    const SNIPPET_RADIUS = 100; // Characters around match

    for (const session of this.sessions.values()) {
      for (const message of session.messages) {
        const content = message.content;
        const lowerContent = content.toLowerCase();
        const matchIndex = lowerContent.indexOf(searchTerm);

        if (matchIndex !== -1) {
          // Create snippet around the match
          const snippetStart = Math.max(0, matchIndex - SNIPPET_RADIUS);
          const snippetEnd = Math.min(content.length, matchIndex + searchTerm.length + SNIPPET_RADIUS);

          let snippet = content.slice(snippetStart, snippetEnd);

          // Add ellipsis if truncated
          if (snippetStart > 0) {
            snippet = '...' + snippet;
          }
          if (snippetEnd < content.length) {
            snippet = snippet + '...';
          }

          results.push({
            sessionId: session.id,
            messageId: message.id,
            role: message.role,
            content: snippet,
            timestamp: message.timestamp,
            repoIds: session.repoIds,
            isBookmarked: session.isBookmarked,
            sessionName: session.name,
            matchIndex: snippetStart > 0 ? matchIndex - snippetStart + 3 : matchIndex, // Adjust for ellipsis
          });

          // Stop if we've hit the limit
          if (results.length >= limit) {
            break;
          }
        }
      }

      if (results.length >= limit) {
        break;
      }
    }

    // Sort by timestamp (most recent first)
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return results.slice(0, limit);
  }

  cancelSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.claudeProcess) {
      console.log(`[TerminalSession] Cancelling session ${sessionId}`);
      if (session.claudeProcess.pid) {
        treeKill(session.claudeProcess.pid);
      }
      session.claudeProcess = undefined;
      session.status = 'idle';

      // Mark last message as cancelled
      const lastMessage = session.messages[session.messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
        lastMessage.content += '\n\n*[Cancelled by user]*';
        lastMessage.isStreaming = false;
      }

      wsManager.broadcastToSession(sessionId, {
        type: 'cancelled',
      });

      wsManager.broadcastToSession(sessionId, {
        type: 'status',
        status: 'idle',
      });

      this.saveSessions();
    }
  }

  // Queue a message for later processing
  private queueMessage(
    sessionId: string,
    content: string,
    mode: 'plan' | 'direct',
    attachments?: MessageAttachment[]
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Cap queue at 10 messages
    if (session.messageQueue.length >= 10) {
      wsManager.broadcastToSession(sessionId, {
        type: 'error',
        error: 'Message queue is full (max 10 messages). Please wait for current operation to complete.',
      });
      return;
    }

    const queuedMessage: QueuedMessage = {
      id: this.generateId(),
      content,
      attachments,
      mode,
      queuedAt: new Date(),
    };

    session.messageQueue.push(queuedMessage);
    this.saveSessions();

    console.log(`[TerminalSession] Queued message ${queuedMessage.id} for session ${sessionId} (queue size: ${session.messageQueue.length})`);

    // Broadcast queue update to clients
    wsManager.broadcastToSession(sessionId, {
      type: 'queue-updated',
      queue: session.messageQueue,
    });
  }

  // Process the next message in the queue
  private async processNextInQueue(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.messageQueue.length === 0 || session.status === 'running') {
      return;
    }

    const nextMessage = session.messageQueue.shift()!;
    this.saveSessions();

    console.log(`[TerminalSession] Processing queued message ${nextMessage.id} for session ${sessionId}`);

    // Broadcast queue update
    wsManager.broadcastToSession(sessionId, {
      type: 'queue-updated',
      queue: session.messageQueue,
    });

    // Set mode if different from current
    if (session.mode !== nextMessage.mode) {
      this.setMode(sessionId, nextMessage.mode);
    }

    // Send the message
    await this.sendMessage(sessionId, nextMessage.content, nextMessage.attachments);
  }

  // Remove a specific message from the queue
  removeFromQueue(sessionId: string, messageId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const initialLength = session.messageQueue.length;
    session.messageQueue = session.messageQueue.filter(m => m.id !== messageId);

    if (session.messageQueue.length !== initialLength) {
      this.saveSessions();
      console.log(`[TerminalSession] Removed message ${messageId} from queue for session ${sessionId}`);

      wsManager.broadcastToSession(sessionId, {
        type: 'queue-updated',
        queue: session.messageQueue,
      });
    }
  }

  // Clear the entire message queue
  clearQueue(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.messageQueue.length === 0) return;

    session.messageQueue = [];
    this.saveSessions();
    console.log(`[TerminalSession] Cleared queue for session ${sessionId}`);

    wsManager.broadcastToSession(sessionId, {
      type: 'queue-updated',
      queue: [],
    });
  }

  // Execute approved plan with user answers
  async executePlan(
    sessionId: string,
    planMessageId: string,
    answers: Record<string, string>,
    additionalContext: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[TerminalSession] Session not found: ${sessionId}`);
      return;
    }

    // Find the plan message
    const planMessage = session.messages.find(m => m.id === planMessageId);
    if (!planMessage || planMessage.role !== 'assistant') {
      console.error(`[TerminalSession] Plan message not found: ${planMessageId}`);
      return;
    }

    // Find the original user prompt (the message before the plan)
    const planIndex = session.messages.findIndex(m => m.id === planMessageId);
    const originalUserMessage = planIndex > 0 ? session.messages[planIndex - 1] : null;
    const originalPrompt = originalUserMessage?.role === 'user' ? originalUserMessage.content : '';

    console.log(`[TerminalSession] Executing plan for session ${sessionId} with ${Object.keys(answers).length} answers`);

    // Switch to direct mode for execution
    session.mode = 'direct';
    wsManager.broadcastToSession(sessionId, {
      type: 'mode-changed',
      mode: 'direct',
    });

    // Generate execution prompt with answers
    const executionPrompt = claudeInvoker.generateExecutionPrompt(
      originalPrompt,
      planMessage.content,
      answers,
      additionalContext
    );

    // Add a user message indicating plan execution
    const userMessage: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: `**Executing approved plan**${additionalContext ? `\n\nAdditional context: ${additionalContext}` : ''}${Object.keys(answers).length > 0 ? `\n\n**Answers:**\n${Object.entries(answers).map(([q, a]) => `- ${q}: ${a}`).join('\n')}` : ''}`,
      timestamp: new Date(),
    };
    session.messages.push(userMessage);
    session.lastActivityAt = new Date();

    wsManager.broadcastToSession(sessionId, {
      type: 'message',
      message: userMessage,
    });

    // Send to Claude (reusing sendMessage logic but with custom prompt)
    await this.sendMessageWithPrompt(sessionId, executionPrompt);
  }

  // Internal method to send a specific prompt to Claude
  private async sendMessageWithPrompt(sessionId: string, prompt: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const repoId = session.repoIds[0];
    const repo = repoRegistry.get(repoId);
    if (!repo) {
      console.error(`[TerminalSession] Repository not found: ${repoId}`);
      return;
    }

    session.status = 'running';
    wsManager.broadcastToSession(sessionId, {
      type: 'status',
      status: 'running',
    });

    // Create assistant message
    const assistantMessage: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };
    session.messages.push(assistantMessage);

    wsManager.broadcastToSession(sessionId, {
      type: 'message',
      message: assistantMessage,
    });

    // Create artifacts directory
    const artifactsDir = join(getTerminalArtifactsDir(), sessionId);
    if (!existsSync(artifactsDir)) {
      mkdirSync(artifactsDir, { recursive: true });
    }

    // Determine working directory: use worktree path if available
    const workingDir = session.worktreeMode && session.worktreePath
      ? session.worktreePath
      : repo.path;

    // Track current tool activity for completion tracking
    let currentActivityId: string | null = null;
    // Track file changes for the current message
    const currentMessageFileChanges: FileChange[] = [];

    try {
      const result = await claudeInvoker.invoke({
        repoPath: workingDir,
        prompt,
        artifactsDir,
        resumeSessionId: session.claudeSessionId,
        onProcessStart: (proc) => {
          session.claudeProcess = proc;
        },
        onStreamEvent: (event: ClaudeStreamEvent) => {
          if (event.type === 'text' && event.content) {
            // If we have an active tool, complete it before text output
            if (currentActivityId) {
              wsManager.broadcastToSession(sessionId, {
                type: 'tool-complete',
                activityId: currentActivityId,
              });
              currentActivityId = null;
            }

            assistantMessage.content += event.content;
            wsManager.broadcastToSession(sessionId, {
              type: 'chunk',
              messageId: assistantMessage.id,
              content: event.content,
            });
          } else if (event.type === 'tool_use' && event.toolName) {
            // Complete previous tool if any
            if (currentActivityId) {
              wsManager.broadcastToSession(sessionId, {
                type: 'tool-complete',
                activityId: currentActivityId,
              });
            }

            // Start new tool activity
            currentActivityId = generateActivityId();
            const target = extractToolTarget(event.toolName, event.toolInput);

            wsManager.broadcastToSession(sessionId, {
              type: 'tool-start',
              activityId: currentActivityId,
              tool: event.toolName,
              target,
            });

            // Track file changes for Write and Edit tools
            if ((event.toolName === 'Write' || event.toolName === 'Edit') && event.toolInput) {
              const input = event.toolInput as Record<string, unknown>;
              const filePath = input.file_path as string;
              if (filePath) {
                // Determine if this is a new file or modification
                const fileExists = existsSync(filePath);
                const operation: FileChange['operation'] = event.toolName === 'Write' && !fileExists ? 'created' : 'modified';

                const fileChange: FileChange = {
                  id: generateActivityId(),
                  filePath,
                  fileName: basename(filePath),
                  operation,
                  toolActivityId: currentActivityId,
                };

                // Avoid duplicate entries for the same file
                const existingIndex = currentMessageFileChanges.findIndex(fc => fc.filePath === filePath);
                if (existingIndex >= 0) {
                  currentMessageFileChanges[existingIndex] = fileChange;
                } else {
                  currentMessageFileChanges.push(fileChange);
                }

                // Broadcast file change event
                wsManager.broadcastToSession(sessionId, {
                  type: 'file-change',
                  messageId: assistantMessage.id,
                  change: fileChange,
                });
              }
            }

            // Also broadcast legacy activity for backward compatibility
            wsManager.broadcastToSession(sessionId, {
              type: 'activity',
              content: event.content,
              toolName: event.toolName,
            });
          } else if (event.type === 'error' && event.content) {
            // Mark current tool as error if any
            if (currentActivityId) {
              wsManager.broadcastToSession(sessionId, {
                type: 'tool-error',
                activityId: currentActivityId,
                error: event.content,
              });
              currentActivityId = null;
            }
          } else if (event.type === 'result') {
            // Capture Claude session ID for future --resume
            if (event.sessionId && !session.claudeSessionId) {
              session.claudeSessionId = event.sessionId;
              console.log(`[TerminalSession] Captured Claude session ID: ${event.sessionId}`);
            }

            // Record usage if available
            if (event.usage) {
              const toolCount = currentActivityId ? 1 : 0;
              usageManager.recordMessageUsage(
                sessionId,
                {
                  messageId: assistantMessage.id,
                  model: event.model,
                  usage: event.usage,
                  costUsd: event.costUsd,
                  durationMs: event.durationMs,
                },
                toolCount,
                currentMessageFileChanges.length
              );

              // Broadcast usage update to UI
              wsManager.broadcastToSession(sessionId, {
                type: 'usage-update',
                usage: event.usage,
                model: event.model,
                costUsd: event.costUsd,
                durationMs: event.durationMs,
                sessionStats: usageManager.getSessionUsage(sessionId),
              });
            }
          }
        },
      });

      // Complete any remaining tool activity
      if (currentActivityId) {
        wsManager.broadcastToSession(sessionId, {
          type: 'tool-complete',
          activityId: currentActivityId,
        });
        currentActivityId = null;
      }

      assistantMessage.isStreaming = false;
      if (!result.success) {
        // Check if it's a "Prompt is too long" error - clear session ID so next message starts fresh
        if (result.error?.toLowerCase().includes('prompt is too long') ||
            result.error?.toLowerCase().includes('too long')) {
          console.log(`[TerminalSession] Prompt too long - clearing Claude session ID to start fresh`);
          session.claudeSessionId = undefined;
          assistantMessage.content += `\n\n**Error:** The Claude session has reached its context limit. Your next message will start a fresh conversation.`;
        } else if (session.claudeSessionId && result.error?.includes('exit code 1')) {
          // Session resume failed - clear session ID so next message starts fresh
          console.log(`[TerminalSession] Session resume failed - clearing Claude session ID to start fresh`);
          session.claudeSessionId = undefined;
          assistantMessage.content += `\n\n**Error:** Could not resume the previous session. Your next message will start a fresh conversation.`;
        } else {
          assistantMessage.content += `\n\n**Error:** ${result.error}`;
        }
      }

      session.status = 'idle';

      // Broadcast file-changes-complete with all file changes for this message
      if (currentMessageFileChanges.length > 0) {
        wsManager.broadcastToSession(sessionId, {
          type: 'file-changes-complete',
          messageId: assistantMessage.id,
          fileChanges: currentMessageFileChanges,
        });
      }

      wsManager.broadcastToSession(sessionId, {
        type: 'message-complete',
        messageId: assistantMessage.id,
        success: result.success,
      });

      wsManager.broadcastToSession(sessionId, {
        type: 'status',
        status: 'idle',
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      assistantMessage.content += `\n\n**Error:** ${errorMsg}`;
      assistantMessage.isStreaming = false;
      session.status = 'error';

      wsManager.broadcastToSession(sessionId, {
        type: 'error',
        error: errorMsg,
      });

      wsManager.broadcastToSession(sessionId, {
        type: 'status',
        status: 'error',
      });
    }

    this.saveSessions();

    // Process next queued message if any (only on success/idle)
    if (session.status === 'idle' && session.messageQueue.length > 0) {
      setTimeout(() => this.processNextInQueue(sessionId), 100);
    }
  }

  /**
   * Delete a session. For worktree sessions, optionally delete the branch and/or worktree.
   * @param sessionId - The session ID to delete
   * @param deleteBranch - Whether to delete the git branch (only applies to worktree sessions)
   * @param deleteWorktree - Whether to delete the worktree directory (defaults to true for backwards compatibility)
   * @returns Object with info about what was deleted
   */
  deleteSession(sessionId: string, deleteBranch: boolean = false, deleteWorktree: boolean = true): { deleted: boolean; worktreeDeleted?: boolean; branchDeleted?: boolean } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { deleted: false };
    }

    // Cancel any running process
    if (session.claudeProcess?.pid) {
      treeKill(session.claudeProcess.pid);
    }

    // Clean up session attachments
    this.cleanupSessionAttachments(sessionId);

    // Clean up worktree if this is a worktree session that explicitly owns its worktree
    // Only delete if deleteWorktree is true (default behavior for backwards compatibility)
    let worktreeDeleted = false;
    let branchDeleted = false;
    if (session.worktreeMode && session.worktreePath && session.ownsWorktree === true && deleteWorktree) {
      // Only delete worktrees that were created by this session
      const primaryRepoId = session.repoIds[0];
      const repo = repoRegistry.get(primaryRepoId);

      if (repo) {
        try {
          // Remove worktree and optionally delete branch
          gitSandbox.removeWorktree(
            repo.path,
            session.worktreePath,
            deleteBranch ? session.branch : undefined
          );
          worktreeDeleted = true;
          branchDeleted = deleteBranch;
          console.log(`[TerminalSession] Removed worktree for session ${sessionId}${deleteBranch ? ' and deleted branch ' + session.branch : ''}`);
        } catch (e) {
          console.warn(`[TerminalSession] Failed to remove worktree: ${e instanceof Error ? e.message : e}`);
          // Try manual cleanup if git worktree remove fails
          if (existsSync(session.worktreePath)) {
            try {
              rmSync(session.worktreePath, { recursive: true, force: true });
              worktreeDeleted = true;
              console.log(`[TerminalSession] Manually removed worktree directory for session ${sessionId}`);
            } catch (e2) {
              console.warn(`[TerminalSession] Manual worktree cleanup also failed: ${e2}`);
            }
          }
        }
      }
    } else if (session.worktreeMode && session.worktreePath && session.ownsWorktree !== true) {
      // Session either borrowed an existing worktree or ownership is unknown - don't delete it
      console.log(`[TerminalSession] Session ${sessionId} does not own its worktree (ownsWorktree=${session.ownsWorktree}), not deleting it`);
    }

    this.sessions.delete(sessionId);
    this.saveSessions();

    console.log(`[TerminalSession] Deleted session ${sessionId}`);
    return { deleted: true, worktreeDeleted, branchDeleted };
  }

  /**
   * Check if a session is a worktree session (for UI to decide whether to ask about branch deletion)
   */
  isWorktreeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.worktreeMode === true;
  }

  /**
   * Get worktree info for a session
   */
  getWorktreeInfo(sessionId: string): { worktreeMode: boolean; branch?: string; worktreePath?: string; baseBranch?: string; ownsWorktree?: boolean } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      worktreeMode: session.worktreeMode || false,
      branch: session.branch,
      worktreePath: session.worktreePath,
      baseBranch: session.baseBranch,
      ownsWorktree: session.ownsWorktree,
    };
  }

  /**
   * Get all worktree sessions
   */
  getWorktreeSessions(): TerminalSession[] {
    return Array.from(this.sessions.values())
      .filter(session => session.worktreeMode === true)
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  }

  /**
   * Clean up orphaned terminal worktrees (worktrees without matching sessions)
   * Called on startup to clean up after crashes/restarts
   */
  cleanupOrphanedWorktrees(): number {
    let cleanedCount = 0;
    const repos = repoRegistry.getAll();

    for (const repo of repos) {
      // Check for .claudedesk-terminal-worktrees directory in repo parent
      const worktreesBaseDir = join(dirname(repo.path), '.claudedesk-terminal-worktrees', repo.id);
      if (!existsSync(worktreesBaseDir)) continue;

      try {
        const sessionDirs = readdirSync(worktreesBaseDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);

        for (const sessionId of sessionDirs) {
          const session = this.sessions.get(sessionId);
          const worktreePath = join(worktreesBaseDir, sessionId);

          // If no matching session or session doesn't have worktree mode, clean up
          if (!session || !session.worktreeMode) {
            console.log(`[TerminalSession] Cleaning up orphaned worktree: ${worktreePath}`);
            try {
              gitSandbox.removeWorktree(repo.path, worktreePath);
            } catch {
              // Git removal might fail, try manual cleanup
              if (existsSync(worktreePath)) {
                rmSync(worktreePath, { recursive: true, force: true });
              }
            }
            cleanedCount++;
          }
        }

        // Remove empty repo worktree directory
        if (existsSync(worktreesBaseDir)) {
          const remaining = readdirSync(worktreesBaseDir);
          if (remaining.length === 0) {
            rmSync(worktreesBaseDir, { recursive: true, force: true });
          }
        }
      } catch (e) {
        console.warn(`[TerminalSession] Error cleaning up worktrees for ${repo.id}: ${e}`);
      }
    }

    return cleanedCount;
  }

  // Clean up attachment files for a session
  private cleanupSessionAttachments(sessionId: string): void {
    if (!existsSync(getAttachmentsDir())) return;

    try {
      const files = readdirSync(getAttachmentsDir());
      let cleanedCount = 0;

      for (const file of files) {
        if (file.startsWith(`${sessionId}_`)) {
          const filePath = join(getAttachmentsDir(), file);
          unlinkSync(filePath);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`[TerminalSession] Cleaned up ${cleanedCount} attachments for session ${sessionId}`);
      }
    } catch (error) {
      console.error('[TerminalSession] Failed to cleanup attachments:', error);
    }
  }

  clearMessages(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages = [];
      session.lastActivityAt = new Date();
      this.saveSessions();

      wsManager.broadcastToSession(sessionId, {
        type: 'messages-cleared',
      });
    }
  }

  // Cleanup old sessions (called periodically) - skips bookmarked sessions
  cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      // Skip bookmarked sessions - they should never be auto-cleaned
      if (session.isBookmarked) {
        continue;
      }
      if (now - session.lastActivityAt.getTime() > maxAgeMs) {
        this.deleteSession(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[TerminalSession] Cleaned up ${cleaned} inactive sessions`);
    }
  }

  // Handle slash commands locally (returns true if handled)
  private handleSlashCommand(session: TerminalSession, content: string): boolean {
    const trimmed = content.trim().toLowerCase();

    // /help - Show available commands
    if (trimmed === '/help') {
      this.sendSystemMessage(session, `**Available Commands:**

- \`/help\` - Show this help message
- \`/resume\` - List Claude Code sessions for this repo
- \`/resume <number>\` - Resume a specific Claude session
- \`/clear\` - Clear conversation history
- \`/sessions\` - List ClaudeDesk terminal sessions
- \`/status\` - Show current session status
- \`/mode plan\` - Switch to plan mode
- \`/mode direct\` - Switch to direct mode
- \`/new\` - Start a new conversation (clear Claude session)
- \`/skills\` - List available skills for this repo
- \`/skill <name>\` - Execute a skill
- \`/skill <name> --help\` - Show skill details and inputs
- \`/skill create <name> <description>\` - Create a new repo skill
- \`/skill create <name> --global <description>\` - Create a global skill

**Tips:**
- Use **\`/resume\`** to continue previous Claude Code conversations
- Use **Plan Mode** when you want Claude to outline changes before implementing
- Use **Direct Mode** for quick changes and immediate execution
- Press **Esc** to cancel a running operation
- Use **Ctrl+1-9** to switch between tabs`);
      return true;
    }

    // /clear - Clear messages
    if (trimmed === '/clear') {
      this.clearMessages(session.id);
      this.sendSystemMessage(session, '*Conversation cleared.*');
      return true;
    }

    // /sessions - List ClaudeDesk terminal sessions
    if (trimmed === '/sessions') {
      const sessions = this.getAllSessions();
      if (sessions.length === 0) {
        this.sendSystemMessage(session, '*No ClaudeDesk terminal sessions found.*');
      } else {
        const sessionList = sessions.map((s, i) => {
          const msgCount = s.messages.length;
          const lastMsg = s.messages[s.messages.length - 1];
          const preview = lastMsg ? lastMsg.content.slice(0, 50).replace(/\n/g, ' ') + '...' : 'No messages';
          const isActive = s.id === session.id ? ' **(current)**' : '';
          const repoLabel = s.isMultiRepo
            ? `${s.repoIds[0]} (+${s.repoIds.length - 1} more)`
            : s.repoIds[0];
          return `${i + 1}. **${repoLabel}**${isActive} - ${msgCount} messages\n   _${preview}_`;
        }).join('\n\n');

        this.sendSystemMessage(session, `**Your ClaudeDesk Terminal Sessions:**\n\n${sessionList}\n\n_Switch sessions using the tabs above or Ctrl+1-9._`);
      }
      return true;
    }

    // /resume - Show Claude Code sessions for this repo (uses primary repo for multi-repo sessions)
    if (trimmed === '/resume' || trimmed.startsWith('/resume ')) {
      const primaryRepoId = session.repoIds[0];
      const repo = repoRegistry.get(primaryRepoId);
      if (!repo) {
        this.sendSystemMessage(session, '*Error: Repository not found.*');
        return true;
      }

      // Get Claude sessions for this repo
      const claudeSessions = getClaudeSessions(repo.path);

      // Cache the sessions for resuming
      claudeSessionsCache.set(session.id, { sessions: claudeSessions, fetchedAt: Date.now() });

      // Check if user wants to resume a specific session
      const parts = trimmed.split(' ');
      if (parts.length > 1) {
        const ref = parts.slice(1).join(' ');
        const targetSession = getSessionByRef(claudeSessions, ref);

        if (targetSession) {
          // Set the Claude session ID for this terminal session
          session.claudeSessionId = targetSession.id;
          this.saveSessions();

          this.sendSystemMessage(session, `**Resuming Claude session:**\n\n_${targetSession.summary}_\n\nYour next message will continue this conversation. Claude will have full context from the previous session.`);
        } else {
          this.sendSystemMessage(session, `*Session "${ref}" not found. Type \`/resume\` to see available sessions.*`);
        }
        return true;
      }

      // Show list of Claude sessions
      const formattedList = formatSessionList(claudeSessions);
      this.sendSystemMessage(session, formattedList);
      return true;
    }

    // /new - Start a new conversation (clear Claude session and messages)
    if (trimmed === '/new') {
      session.claudeSessionId = undefined;
      session.messages = [];
      session.lastActivityAt = new Date();
      this.saveSessions();

      // Broadcast messages cleared to UI
      wsManager.broadcastToSession(session.id, {
        type: 'messages-cleared',
      });

      this.sendSystemMessage(session, '*Starting fresh conversation. Your next message will begin a new Claude session.*');
      return true;
    }

    // /status - Show session status
    if (trimmed === '/status') {
      const primaryRepoId = session.repoIds[0];
      const repo = repoRegistry.get(primaryRepoId);
      const claudeSessionInfo = session.claudeSessionId
        ? `\n- **Claude Session:** \`${session.claudeSessionId}\` _(resuming)_`
        : '\n- **Claude Session:** _New conversation_';

      // Build repo info string
      let repoInfo: string;
      if (session.isMultiRepo) {
        const repoList = session.repoIds.map(id => {
          const r = repoRegistry.get(id);
          return `  - **${id}** - \`${r?.path || 'unknown'}\``;
        }).join('\n');
        repoInfo = `\n- **Repositories (${session.repoIds.length}):**\n${repoList}`;
      } else {
        repoInfo = `\n- **Repository:** ${primaryRepoId}\n- **Path:** \`${repo?.path || 'unknown'}\``;
      }

      this.sendSystemMessage(session, `**Session Status:**

- **Session ID:** \`${session.id}\`
- **Multi-Repo:** ${session.isMultiRepo ? 'Yes' : 'No'}${repoInfo}
- **Mode:** ${session.mode === 'plan' ? 'Plan Mode' : 'Direct Mode'}${claudeSessionInfo}
- **Messages:** ${session.messages.length}
- **Created:** ${session.createdAt.toLocaleString()}
- **Last Activity:** ${session.lastActivityAt.toLocaleString()}`);
      return true;
    }

    // /mode - Switch mode
    if (trimmed.startsWith('/mode ')) {
      const mode = trimmed.split(' ')[1];
      if (mode === 'plan') {
        this.setMode(session.id, 'plan');
        this.sendSystemMessage(session, '*Switched to **Plan Mode**. Claude will outline changes before implementing.*');
        return true;
      } else if (mode === 'direct') {
        this.setMode(session.id, 'direct');
        this.sendSystemMessage(session, '*Switched to **Direct Mode**. Claude will implement changes immediately.*');
        return true;
      }
    }

    // /skills - List available skills
    if (trimmed === '/skills') {
      this.handleSkillsListCommand(session);
      return true;
    }

    // /skill create <name> [--global] <description> - Create a new skill
    if (trimmed.startsWith('/skill create ')) {
      this.handleSkillCreateCommand(session, content);
      return true;
    }

    // /skill <name> [args] - Execute or show help for a skill
    if (trimmed.startsWith('/skill ')) {
      this.handleSkillCommand(session, content);
      return true;
    }

    return false; // Not a slash command
  }

  // Send a system message (appears as assistant message)
  private sendSystemMessage(session: TerminalSession, content: string): void {
    const systemMessage: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content,
      timestamp: new Date(),
      isStreaming: false,
    };
    session.messages.push(systemMessage);
    session.lastActivityAt = new Date();
    this.saveSessions();

    wsManager.broadcastToSession(session.id, {
      type: 'message',
      message: systemMessage,
    });
  }

  // Handle /skills command - list available skills
  private handleSkillsListCommand(session: TerminalSession): void {
    const primaryRepoId = session.repoIds[0];
    const repo = repoRegistry.get(primaryRepoId);

    if (!repo) {
      this.sendSystemMessage(session, '*Error: Repository not found.*');
      return;
    }

    // Load repo skills if not already loaded
    skillRegistry.loadRepoSkills(primaryRepoId, repo.path);

    const skills = skillRegistry.getAll(primaryRepoId);

    if (skills.length === 0) {
      this.sendSystemMessage(session, `**No skills available.**

Create a skill with:
\`/skill create <name> <description>\`

Or add skills manually:
- **Global skills:** Add \`.md\` files to \`config/skills/\`
- **Repo skills:** Add \`.md\` files to \`<repo>/.claude/skills/\` or \`<repo>/.claudedesk/skills/\``);
      return;
    }

    // Group by source
    const globalSkills = skills.filter(s => s.source === 'global');
    const repoSkills = skills.filter(s => s.source === 'repo');

    let message = '**Available Skills:**\n\n';

    if (repoSkills.length > 0) {
      message += `**Repository Skills** _(${primaryRepoId})_\n`;
      for (const skill of repoSkills) {
        const typeIcon = skill.type === 'prompt' ? '💬' : skill.type === 'command' ? '⚡' : '🔄';
        message += `- \`${skill.id}\` ${typeIcon} - ${skill.description || 'No description'}\n`;
      }
      message += '\n';
    }

    if (globalSkills.length > 0) {
      message += '**Global Skills**\n';
      for (const skill of globalSkills) {
        const typeIcon = skill.type === 'prompt' ? '💬' : skill.type === 'command' ? '⚡' : '🔄';
        message += `- \`${skill.id}\` ${typeIcon} - ${skill.description || 'No description'}\n`;
      }
      message += '\n';
    }

    message += `_Run \`/skill <name> --help\` for details, or \`/skill <name>\` to execute._
_Create new skills with \`/skill create <name> <description>\`_`;

    this.sendSystemMessage(session, message);
  }

  // Handle /skill <name> [args] command
  private async handleSkillCommand(session: TerminalSession, content: string): Promise<void> {
    const primaryRepoId = session.repoIds[0];
    const repo = repoRegistry.get(primaryRepoId);

    if (!repo) {
      this.sendSystemMessage(session, '*Error: Repository not found.*');
      return;
    }

    // Parse command: /skill <name> [--help] [key=value ...]
    const parts = content.trim().slice(7).trim().split(/\s+/); // Remove "/skill "
    if (parts.length === 0 || !parts[0]) {
      this.sendSystemMessage(session, '*Usage:* `/skill <name> [--help] [key=value ...]`');
      return;
    }

    const skillName = parts[0];
    const isHelp = parts.includes('--help');

    // Load repo skills if not already loaded
    skillRegistry.loadRepoSkills(primaryRepoId, repo.path);

    const skill = skillRegistry.get(skillName, primaryRepoId);
    if (!skill) {
      this.sendSystemMessage(session, `*Skill not found:* \`${skillName}\`\n\nRun \`/skills\` to see available skills.`);
      return;
    }

    // --help: Show skill details
    if (isHelp) {
      let helpMessage = `**Skill: ${skill.id}**\n\n`;
      helpMessage += `- **Description:** ${skill.description || 'No description'}\n`;
      helpMessage += `- **Type:** ${skill.type}\n`;
      helpMessage += `- **Source:** ${skill.source === 'repo' ? `Repository (${primaryRepoId})` : 'Global'}\n`;

      if (skill.inputs && skill.inputs.length > 0) {
        helpMessage += '\n**Inputs:**\n';
        for (const input of skill.inputs) {
          const required = input.required ? '*(required)*' : `*(default: ${input.default ?? 'none'})*`;
          helpMessage += `- \`${input.name}\` (${input.type}) ${required}\n`;
          if (input.description) {
            helpMessage += `  ${input.description}\n`;
          }
        }
      } else {
        helpMessage += '\n_No inputs required._\n';
      }

      helpMessage += `\n**Usage:** \`/skill ${skill.id}${skill.inputs?.some(i => i.required) ? ' key=value' : ''}\``;

      this.sendSystemMessage(session, helpMessage);
      return;
    }

    // Parse inputs: key=value pairs
    const inputs: Record<string, string | number | boolean> = {};
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part === '--help') continue;

      const eqIndex = part.indexOf('=');
      if (eqIndex > 0) {
        const key = part.slice(0, eqIndex);
        let value: string | number | boolean = part.slice(eqIndex + 1);

        // Try to parse as number or boolean
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (!isNaN(Number(value)) && value !== '') value = Number(value);

        inputs[key] = value;
      }
    }

    // Add a user message showing the skill execution
    const userMessage: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: `/skill ${skillName}${Object.keys(inputs).length > 0 ? ' ' + Object.entries(inputs).map(([k, v]) => `${k}=${v}`).join(' ') : ''}`,
      timestamp: new Date(),
    };
    session.messages.push(userMessage);
    session.lastActivityAt = new Date();

    wsManager.broadcastToSession(session.id, {
      type: 'message',
      message: userMessage,
    });

    // Set session to running
    session.status = 'running';
    wsManager.broadcastToSession(session.id, {
      type: 'status',
      status: 'running',
    });

    // Create assistant message for output
    const assistantMessage: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: `**Executing skill:** \`${skill.id}\` (${skill.type})\n\n`,
      timestamp: new Date(),
      isStreaming: true,
    };
    session.messages.push(assistantMessage);

    wsManager.broadcastToSession(session.id, {
      type: 'message',
      message: assistantMessage,
    });

    try {
      // Create artifacts directory
      const artifactsDir = join(getTerminalArtifactsDir(), session.id, 'skills');
      if (!existsSync(artifactsDir)) {
        mkdirSync(artifactsDir, { recursive: true });
      }

      // Execute the skill
      const result = await skillExecutor.execute(
        { skillId: skill.id, repoId: primaryRepoId, inputs },
        repo,
        repo.path,
        artifactsDir
      );

      // Update message with result
      if (result.success) {
        assistantMessage.content += `✅ **Skill completed successfully**\n\n`;
        if (result.output) {
          assistantMessage.content += result.output;
        }
      } else {
        assistantMessage.content += `❌ **Skill failed**\n\n${result.error || 'Unknown error'}`;
        if (result.output) {
          assistantMessage.content += `\n\n**Output:**\n${result.output}`;
        }
      }
    } catch (error) {
      assistantMessage.content += `❌ **Error executing skill:**\n${error instanceof Error ? error.message : String(error)}`;
    }

    assistantMessage.isStreaming = false;
    session.status = 'idle';

    wsManager.broadcastToSession(session.id, {
      type: 'message-complete',
      messageId: assistantMessage.id,
      success: true,
    });

    wsManager.broadcastToSession(session.id, {
      type: 'status',
      status: 'idle',
    });

    this.saveSessions();
  }

  // Handle /skill create <name> [--global] <description> command
  private async handleSkillCreateCommand(session: TerminalSession, content: string): Promise<void> {
    const primaryRepoId = session.repoIds[0];
    const repo = repoRegistry.get(primaryRepoId);

    if (!repo) {
      this.sendSystemMessage(session, '*Error: Repository not found.*');
      return;
    }

    // Parse command: /skill create <name> [--global] <description...>
    const afterCreate = content.trim().slice(14).trim(); // Remove "/skill create "
    const parts = afterCreate.split(/\s+/);

    if (parts.length === 0 || !parts[0]) {
      this.sendSystemMessage(session, `**Usage:** \`/skill create <name> [--global] <description>\`

**Examples:**
- \`/skill create code-review Review code for security and best practices\`
- \`/skill create deploy --global Deploy the application to production\`

**Flags:**
- \`--global\` - Create as a global skill (available to all repos)
- Without flag - Create as a repo-specific skill`);
      return;
    }

    const skillName = parts[0];
    const isGlobal = parts.includes('--global');

    // Extract description (everything after name and flags)
    const descriptionParts = parts.slice(1).filter(p => p !== '--global');
    const description = descriptionParts.join(' ');

    if (!description) {
      this.sendSystemMessage(session, `*Please provide a description for the skill.*

**Example:** \`/skill create ${skillName} Review code changes for security issues\``);
      return;
    }

    // Validate skill name (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(skillName)) {
      this.sendSystemMessage(session, `*Invalid skill name:* \`${skillName}\`

Skill names must:
- Start with a letter
- Contain only letters, numbers, hyphens, and underscores`);
      return;
    }

    // Check if skill already exists
    skillRegistry.loadRepoSkills(primaryRepoId, repo.path);
    const existingSkill = skillRegistry.get(skillName, isGlobal ? undefined : primaryRepoId);
    if (existingSkill) {
      this.sendSystemMessage(session, `*Skill \`${skillName}\` already exists.* Use a different name or delete the existing skill first.`);
      return;
    }

    // Add user message showing the create command
    const userMessage: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: `/skill create ${skillName}${isGlobal ? ' --global' : ''} ${description}`,
      timestamp: new Date(),
    };
    session.messages.push(userMessage);
    session.lastActivityAt = new Date();

    wsManager.broadcastToSession(session.id, {
      type: 'message',
      message: userMessage,
    });

    // Set session to running
    session.status = 'running';
    wsManager.broadcastToSession(session.id, {
      type: 'status',
      status: 'running',
    });

    // Create assistant message for streaming output
    const assistantMessage: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: `**Creating ${isGlobal ? 'global' : 'repository'} skill:** \`${skillName}\`\n\n`,
      timestamp: new Date(),
      isStreaming: true,
    };
    session.messages.push(assistantMessage);

    wsManager.broadcastToSession(session.id, {
      type: 'message',
      message: assistantMessage,
    });

    try {
      // Build the prompt for Claude to generate the skill
      const skillPrompt = this.buildSkillCreationPrompt(skillName, description, isGlobal, repo);

      // Create artifacts directory
      const artifactsDir = join(getTerminalArtifactsDir(), session.id, 'skill-create');
      if (!existsSync(artifactsDir)) {
        mkdirSync(artifactsDir, { recursive: true });
      }

      // Invoke Claude to generate the skill content
      let claudeOutput = '';
      const result = await claudeInvoker.invoke({
        repoPath: repo.path,
        prompt: skillPrompt,
        artifactsDir,
        onStreamEvent: (event) => {
          if (event.type === 'text' && event.content) {
            claudeOutput += event.content;
            // Stream progress to user
            wsManager.broadcastToSession(session.id, {
              type: 'chunk',
              messageId: assistantMessage.id,
              content: event.content,
            });
            assistantMessage.content += event.content;
          }
        },
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate skill content');
      }

      // Extract the skill file content from Claude's output
      const skillFileContent = this.extractSkillFileContent(claudeOutput, skillName, description);

      if (!skillFileContent) {
        throw new Error('Could not extract valid skill content from Claude response');
      }

      // Determine the save path
      let skillPath: string;
      if (isGlobal) {
        const globalSkillsDir = join(process.cwd(), 'config', 'skills');
        if (!existsSync(globalSkillsDir)) {
          mkdirSync(globalSkillsDir, { recursive: true });
        }
        skillPath = join(globalSkillsDir, `${skillName}.md`);
      } else {
        // Save to .claude/skills/ (Claude Code convention, takes priority over .claudedesk/skills/)
        const repoSkillsDir = join(repo.path, '.claude', 'skills');
        if (!existsSync(repoSkillsDir)) {
          mkdirSync(repoSkillsDir, { recursive: true });
        }
        skillPath = join(repoSkillsDir, `${skillName}.md`);
      }

      // Save the skill file
      writeFileSync(skillPath, skillFileContent, 'utf-8');

      // Reload skills to pick up the new one
      if (isGlobal) {
        skillRegistry.reload();
      } else {
        skillRegistry.reloadRepo(primaryRepoId, repo.path);
      }

      // Update message with success
      assistantMessage.content += `\n\n---\n\n✅ **Skill created successfully!**

- **Location:** \`${skillPath}\`
- **Type:** ${isGlobal ? 'Global' : 'Repository'} skill

Run \`/skill ${skillName} --help\` to see details, or \`/skill ${skillName}\` to execute.`;

    } catch (error) {
      assistantMessage.content += `\n\n❌ **Error creating skill:**\n${error instanceof Error ? error.message : String(error)}`;
    }

    assistantMessage.isStreaming = false;
    session.status = 'idle';

    wsManager.broadcastToSession(session.id, {
      type: 'message-complete',
      messageId: assistantMessage.id,
      success: true,
    });

    wsManager.broadcastToSession(session.id, {
      type: 'status',
      status: 'idle',
    });

    this.saveSessions();
  }

  // Build prompt for Claude to generate a skill file
  private buildSkillCreationPrompt(
    skillName: string,
    description: string,
    isGlobal: boolean,
    repo: { id: string; path: string }
  ): string {
    const repoContext = isGlobal ? '' : `
## Repository Context
This skill is being created for the repository: ${repo.id}
Repository path: ${repo.path}

Please explore the repository structure to understand:
- What kind of project this is (language, framework, etc.)
- Common patterns and conventions used
- How to tailor the skill prompt to this specific codebase
`;

    return `You are creating a ClaudeDesk skill file. The user wants to create a skill with:

- **Name:** ${skillName}
- **Description:** ${description}
- **Scope:** ${isGlobal ? 'Global (available to all repositories)' : `Repository-specific (for ${repo.id})`}
${repoContext}
## Your Task

Generate a complete skill file in Markdown format with YAML frontmatter. The skill should be a "prompt" type that instructs Claude to perform the described task.

## Skill File Format

\`\`\`markdown
---
id: ${skillName}
name: Human Readable Name
description: Short description of what the skill does
type: prompt
inputs:
  - name: input_name
    type: string
    description: What this input is for
    required: false
    default: default_value
---

The prompt content goes here. This is what Claude will receive when the skill is executed.

You can use template variables:
- {{repo.id}} - Repository ID
- {{repo.path}} - Repository path
- {{inputs.input_name}} - User-provided input value

Write clear, actionable instructions for Claude to follow.
\`\`\`

## Guidelines

1. Create a descriptive, actionable prompt that Claude can follow
2. Include relevant inputs that make the skill flexible
3. For repo-specific skills, tailor the prompt to the codebase
4. Keep the prompt focused and clear
5. Use markdown formatting in the prompt for readability

## Output

Generate ONLY the skill file content (starting with \`---\` and ending after the prompt). Do not include any explanation before or after the skill file content.`;
  }

  // Extract skill file content from Claude's response
  private extractSkillFileContent(claudeOutput: string, skillName: string, description: string): string | null {
    // Try to find content between --- markers (YAML frontmatter format)
    const frontmatterMatch = claudeOutput.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n[\s\S]+/m);
    if (frontmatterMatch) {
      return frontmatterMatch[0].trim();
    }

    // Try to find a markdown code block with the skill content
    const codeBlockMatch = claudeOutput.match(/```(?:markdown|md)?\r?\n(---\r?\n[\s\S]*?\r?\n---\r?\n[\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // If we can't extract, try to find any --- block
    const anyFrontmatter = claudeOutput.match(/---[\s\S]*?---[\s\S]*/);
    if (anyFrontmatter) {
      return anyFrontmatter[0].trim();
    }

    // Last resort: create a basic skill with the description as the prompt
    console.warn('[TerminalSession] Could not extract skill content, creating basic skill');
    return `---
id: ${skillName}
name: ${skillName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
description: ${description}
type: prompt
inputs: []
---

${description}

Please help the user accomplish this task in the current repository.`;
  }

  // Safety instructions for process termination
  private getSafetyInstructions(): string {
    return `## CRITICAL SAFETY RULES - READ FIRST

**⚠️ PORTS 8787 AND 5173 ARE FORBIDDEN - CLAUDEDESK RUNS HERE ⚠️**

You are running inside ClaudeDesk, which uses ports 8787 (API) and 5173 (UI). If you kill these ports, you will crash the system and lose this conversation.

**ABSOLUTELY FORBIDDEN COMMANDS:**
- \`npx kill-port 8787\` - WILL CRASH CLAUDEDESK
- \`npx kill-port 5173\` - WILL CRASH CLAUDEDESK
- \`taskkill /IM node.exe /F\` - WILL CRASH CLAUDEDESK (kills ALL Node)
- \`pkill node\` or \`killall node\` - WILL CRASH CLAUDEDESK
- Any command that kills processes on port 8787 or 5173
- Any command that kills all Node.js processes

**SAFE ALTERNATIVES for stopping apps:**
- Kill by specific PID: \`taskkill /PID 12345 /F\`
- Kill specific port (NOT 8787 or 5173): \`npx kill-port 3000\`
- Stop Docker: \`docker stop container-name\`
- Stop npm process: Find its PID first, then kill that specific PID

**Before killing ANY port, verify it is NOT 8787 or 5173.**`;
  }

  // Build worktree context for Claude prompt
  private buildWorktreeContext(session: TerminalSession): string {
    if (!session.worktreeMode || !session.branch) {
      return '';
    }

    return `## Git Branch Context

You are working in an isolated worktree on branch **\`${session.branch}\`**.

**Key Information:**
- **Current Branch:** \`${session.branch}\`
- **Base Branch:** \`${session.baseBranch || 'main'}\`
- **Worktree Path:** \`${session.worktreePath}\`

This is a feature branch isolated from the main repository. Changes you make here will not affect other branches or the main repository until merged.

**Git Workflow Tips:**
- All your commits will be on the \`${session.branch}\` branch
- You can freely experiment and make changes
- When done, the branch can be pushed for PR review`;
  }

  // Build multi-repo context for Claude prompt
  private buildMultiRepoContext(session: TerminalSession): string {
    if (!session.isMultiRepo) {
      return '';
    }

    const repos = session.repoIds
      .map(id => repoRegistry.get(id))
      .filter((repo): repo is NonNullable<typeof repo> => repo !== undefined);

    const repoList = repos.map((repo, i) => `${i + 1}. **${repo.id}** - \`${repo.path}\``).join('\n');
    const primaryRepo = repos[0];

    return `## Multi-Repository Context

You are working across ${repos.length} repositories:

${repoList}

### CRITICAL: Explicit Repo Targeting Required

For ANY write operation (file edits, git commits, running commands), you MUST:
1. Explicitly state which repository you are targeting
2. Use the full path or clearly identify the repo by name
3. Never assume which repo the user means for writes

**Example - CORRECT:**
- "I'll update the API endpoint in **${repos[1]?.id || 'repo2'}**/src/routes.ts"
- "Committing changes to **${repos[0]?.id || 'repo1'}**"

**Example - WRONG:**
- "I'll update the file src/routes.ts" (ambiguous - which repo?)

### Working Directory
Primary: \`${primaryRepo?.path || 'unknown'}\` (${primaryRepo?.id || 'unknown'})
Access other repos via their absolute paths.`;
  }

  // Build prompt with conversation context
  private buildPromptWithContext(session: TerminalSession, currentMessage: string): string {
    // Truncate very long messages to avoid "Prompt is too long" errors
    const MAX_MESSAGE_LENGTH = 50000; // ~50k chars is reasonable
    let message = currentMessage;
    if (message.length > MAX_MESSAGE_LENGTH) {
      message = message.slice(0, MAX_MESSAGE_LENGTH) + '\n\n... [Message truncated - was ' + currentMessage.length + ' chars]';
      console.log(`[TerminalSession] Truncated message from ${currentMessage.length} to ${MAX_MESSAGE_LENGTH} chars`);
    }

    // If we're resuming a Claude session, don't add conversation history
    // Claude Code's --resume flag already provides full context
    if (session.claudeSessionId) {
      return message;
    }

    // Get recent messages for context (limit to last 10 exchanges to avoid token limits)
    const contextMessages = session.messages
      .filter(m => !m.isStreaming) // Exclude streaming messages
      .slice(-20); // Last 20 messages (10 exchanges)

    // If no previous context, just return the current message
    if (contextMessages.length <= 1) {
      return currentMessage;
    }

    // Build conversation context
    const context = contextMessages
      .slice(0, -1) // Exclude the current user message we just added
      .map(m => {
        const role = m.role === 'user' ? 'User' : 'Assistant';
        // Truncate long messages in context
        const content = m.content.length > 2000
          ? m.content.slice(0, 2000) + '... [truncated]'
          : m.content;
        return `**${role}:** ${content}`;
      })
      .join('\n\n');

    return `## Previous Conversation Context
The following is our conversation history in this session. Use this context to understand what we've been working on.

${context}

---

## Current Request
${message}`;
  }

  // Build attachment context for Claude to read attached files
  private buildAttachmentContext(attachments: MessageAttachment[]): string {
    const fileList = attachments.map(a => {
      const isImage = a.mimeType.startsWith('image/');
      const isPdf = a.mimeType === 'application/pdf';
      const type = isImage ? 'image' : isPdf ? 'PDF document' : 'text/code file';
      return `- **${a.originalName}** (${type}): \`${a.path}\``;
    }).join('\n');

    return `## Attached Files for Analysis

The user has attached the following files for you to analyze. Use your Read tool to access them:

${fileList}

**Instructions:**
- For images: Read them to see their visual contents
- For PDFs: Read them to extract and analyze the content
- For text/code files: Read them to see the contents
- Reference specific file contents in your response as needed`;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}

// Lazy singleton - only created on first access (after cli.ts has called process.chdir())
let _terminalSessionManager: TerminalSessionManager | null = null;

function getTerminalSessionManagerInstance(): TerminalSessionManager {
  if (!_terminalSessionManager) {
    _terminalSessionManager = new TerminalSessionManager();
  }
  return _terminalSessionManager;
}

export const terminalSessionManager = new Proxy({} as TerminalSessionManager, {
  get(_, prop) {
    const instance = getTerminalSessionManagerInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as Function).bind(instance) : value;
  }
});

// Cleanup old sessions every hour (uses proxy so will trigger lazy init if needed)
setInterval(() => {
  terminalSessionManager.cleanupOldSessions();
}, 60 * 60 * 1000);

// Cleanup orphaned attachments (files older than 24 hours) every hour
function cleanupOrphanedAttachments(): void {
  if (!existsSync(getAttachmentsDir())) return;

  const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
  const now = Date.now();

  try {
    const files = readdirSync(getAttachmentsDir());
    let cleanedCount = 0;

    for (const file of files) {
      const filePath = join(getAttachmentsDir(), file);
      const stat = statSync(filePath);

      if (now - stat.mtimeMs > maxAgeMs) {
        unlinkSync(filePath);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[TerminalSession] Cleaned up ${cleanedCount} orphaned attachments`);
    }
  } catch (error) {
    console.error('[TerminalSession] Failed to cleanup orphaned attachments:', error);
  }
}

setInterval(cleanupOrphanedAttachments, 60 * 60 * 1000);
