import { ChildProcess } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import treeKill from 'tree-kill';
import { claudeInvoker, ClaudeStreamEvent } from './claude-invoker.js';
import { wsManager } from './ws-manager.js';
import { contextManager } from './context-manager.js';
import { repoRegistry } from '../config/repos.js';
import { settingsManager } from '../config/settings.js';
import type { Idea, IdeaStatus, IdeaChatMessage, IdeaQueuedMessage, PromoteOptions } from '../types.js';

// Helper to generate unique IDs
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Lazy path resolution
function getIdeasFile(): string {
  return join(process.cwd(), 'config', 'ideas.json');
}
function getIdeaArtifactsDir(): string {
  return join(process.cwd(), 'artifacts', 'ideas');
}
function getIdeaTempDir(): string {
  return join(process.cwd(), 'temp', 'ideas');
}

// Resource limits — shared with TerminalSessionManager via getActiveProcessCount export
const MAX_QUEUE_SIZE = 10;

// Ideation-focused system prompt (no git/worktree instructions)
const IDEA_SYSTEM_PROMPT = `You are a creative brainstorming partner. The user is exploring ideas — there is no repository or codebase context unless explicitly attached.

Focus on:
- Helping the user think through concepts, architectures, and approaches
- Asking clarifying questions to refine ideas
- Suggesting alternatives and trade-offs
- Being concise but thorough

Do NOT:
- Assume any repository or codebase exists
- Suggest running git commands or modifying files (unless a repo is attached)
- Add unnecessary ceremony — keep responses conversational`;

class IdeaManager {
  private ideas: Map<string, Idea> = new Map();
  private claudeProcesses: Map<string, ChildProcess> = new Map();

  constructor() {
    this.loadSavedIdeas();
    this.setupWebSocketHandlers();
    this.cleanupOrphanedTempDirs();
  }

  /**
   * Get count of ideas with active Claude processes (for shared resource limiting)
   */
  getActiveProcessCount(): number {
    let count = 0;
    for (const idea of this.ideas.values()) {
      if (idea.chatStatus === 'running') {
        count++;
      }
    }
    return count;
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private loadSavedIdeas(): void {
    try {
      if (existsSync(getIdeasFile())) {
        const data = JSON.parse(readFileSync(getIdeasFile(), 'utf-8'));
        for (const idea of data.ideas || []) {
          this.ideas.set(idea.id, {
            ...idea,
            chatStatus: 'idle', // Reset on load
            messageQueue: idea.messageQueue || [],
          });
        }
        console.log(`[IdeaManager] Loaded ${this.ideas.size} saved ideas`);
      }
    } catch (error) {
      console.error('[IdeaManager] Failed to load ideas:', error);
    }
  }

  private saveIdeas(): void {
    try {
      const configDir = join(process.cwd(), 'config');
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      // Only persist saved ideas
      const savedIdeas = Array.from(this.ideas.values())
        .filter(idea => idea.status === 'saved')
        .map(idea => ({
          id: idea.id,
          title: idea.title,
          status: idea.status,
          messages: idea.messages,
          claudeSessionId: idea.claudeSessionId,
          chatStatus: 'idle',
          mode: idea.mode,
          createdAt: idea.createdAt,
          lastActivityAt: idea.lastActivityAt,
          savedAt: idea.savedAt,
          promotedToSessionId: idea.promotedToSessionId,
          promotedToRepoId: idea.promotedToRepoId,
          attachedRepoIds: idea.attachedRepoIds,
          tags: idea.tags,
          messageQueue: [],
        }));

      writeFileSync(getIdeasFile(), JSON.stringify({ ideas: savedIdeas }, null, 2));
    } catch (error) {
      console.error('[IdeaManager] Failed to save ideas:', error);
    }
  }

  private cleanupOrphanedTempDirs(): void {
    try {
      const tempDir = getIdeaTempDir();
      if (!existsSync(tempDir)) return;

      const dirs = readdirSync(tempDir);
      let cleaned = 0;
      for (const dir of dirs) {
        if (!this.ideas.has(dir)) {
          rmSync(join(tempDir, dir), { recursive: true, force: true });
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.log(`[IdeaManager] Cleaned up ${cleaned} orphaned temp directories`);
      }
    } catch (error) {
      console.error('[IdeaManager] Failed to cleanup temp dirs:', error);
    }
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  createIdea(): Idea {
    const id = `idea-${generateId()}`;
    const now = new Date().toISOString();

    const idea: Idea = {
      id,
      status: 'ephemeral',
      messages: [],
      chatStatus: 'idle',
      mode: 'direct',
      createdAt: now,
      lastActivityAt: now,
      messageQueue: [],
    };

    // Ensure temp dir exists
    const tempDir = join(getIdeaTempDir(), id);
    mkdirSync(tempDir, { recursive: true });

    this.ideas.set(id, idea);
    console.log(`[IdeaManager] Created ephemeral idea: ${id}`);
    return idea;
  }

  getIdea(id: string): Idea | undefined {
    return this.ideas.get(id);
  }

  getAllSavedIdeas(): Idea[] {
    return Array.from(this.ideas.values())
      .filter(idea => idea.status === 'saved')
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
  }

  getAllIdeas(): Idea[] {
    return Array.from(this.ideas.values())
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
  }

  updateIdea(id: string, updates: Partial<Pick<Idea, 'title' | 'tags' | 'status'>>): Idea {
    const idea = this.ideas.get(id);
    if (!idea) throw new Error(`Idea not found: ${id}`);

    if (updates.title !== undefined) idea.title = updates.title;
    if (updates.tags !== undefined) idea.tags = updates.tags;
    if (updates.status !== undefined) idea.status = updates.status;
    idea.lastActivityAt = new Date().toISOString();

    if (idea.status === 'saved') {
      this.saveIdeas();
    }

    return idea;
  }

  deleteIdea(id: string): void {
    const idea = this.ideas.get(id);
    if (!idea) throw new Error(`Idea not found: ${id}`);

    // Kill Claude process if running
    this.cancelClaude(id);

    // Clean up context data
    contextManager.clearSession(id);

    // Remove temp dir
    const tempDir = join(getIdeaTempDir(), id);
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    // Remove artifacts
    const artifactsDir = join(getIdeaArtifactsDir(), id);
    if (existsSync(artifactsDir)) {
      rmSync(artifactsDir, { recursive: true, force: true });
    }

    this.ideas.delete(id);
    this.saveIdeas();
    console.log(`[IdeaManager] Deleted idea: ${id}`);
  }

  saveIdea(id: string): Idea {
    const idea = this.ideas.get(id);
    if (!idea) throw new Error(`Idea not found: ${id}`);

    idea.status = 'saved';
    idea.savedAt = new Date().toISOString();
    idea.lastActivityAt = new Date().toISOString();
    this.saveIdeas();

    console.log(`[IdeaManager] Saved idea: ${id}`);
    return idea;
  }

  // ─── Claude Invocation ─────────────────────────────────────────────────────

  private getWorkingDir(idea: Idea): string {
    // If attached to a repo, use its path
    if (idea.attachedRepoIds && idea.attachedRepoIds.length > 0) {
      const repo = repoRegistry.get(idea.attachedRepoIds[0]);
      if (repo) return repo.path;
    }
    // Otherwise use temp dir
    const tempDir = join(getIdeaTempDir(), idea.id);
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
  }

  private buildPrompt(idea: Idea, currentMessage: string): string {
    const ctxSettings = settingsManager.getContext();
    const maxMsgLen = ctxSettings.maxMessageLength;

    let message = currentMessage;
    if (message.length > maxMsgLen) {
      message = message.slice(0, maxMsgLen) + '\n\n... [Message truncated]';
    }

    // If resuming Claude session, don't repeat context
    if (idea.claudeSessionId) {
      return message;
    }

    const nonStreaming = idea.messages.filter(m => !m.isStreaming);

    // First message — include system prompt
    if (nonStreaming.length <= 1) {
      let prompt = IDEA_SYSTEM_PROMPT + '\n\n';

      // Add repo context if attached
      if (idea.attachedRepoIds && idea.attachedRepoIds.length > 0) {
        const repoNames = idea.attachedRepoIds
          .map(rid => repoRegistry.get(rid))
          .filter(Boolean)
          .map(r => r!.id);
        prompt += `## Attached Repository\nThe user has attached the following repository for context: ${repoNames.join(', ')}. You can read files from this codebase to help with ideation.\n\n`;
      }

      return prompt + message;
    }

    // Build conversation context for subsequent messages
    const recentCount = Math.min(nonStreaming.length - 1, 10); // Keep last 10 exchanges
    const recentMessages = nonStreaming.slice(-(recentCount + 1), -1); // Exclude current

    const parts: string[] = [IDEA_SYSTEM_PROMPT];

    if (recentMessages.length > 0) {
      const context = recentMessages
        .map(m => {
          const role = m.role === 'user' ? 'User' : 'Assistant';
          const content = m.content.length > maxMsgLen
            ? m.content.slice(0, maxMsgLen) + '... [truncated]'
            : m.content;
          return `**${role}:** ${content}`;
        })
        .join('\n\n');
      parts.push(`## Recent Conversation\n${context}`);
    }

    parts.push(`## Current Message\n${message}`);
    return parts.join('\n\n');
  }

  async sendMessage(ideaId: string, content: string): Promise<void> {
    const idea = this.ideas.get(ideaId);
    if (!idea) throw new Error(`Idea not found: ${ideaId}`);

    // Queue if already running
    if (idea.chatStatus === 'running') {
      this.queueMessage(ideaId, content);
      return;
    }

    // Clear any previous wasRecentlyStopped-like flag
    idea.chatStatus = 'running';
    idea.lastActivityAt = new Date().toISOString();

    // Add user message
    const userMessage: IdeaChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    idea.messages.push(userMessage);

    // Broadcast user message
    wsManager.broadcastToSession(ideaId, {
      type: 'message',
      message: userMessage,
    });
    wsManager.broadcastToSession(ideaId, {
      type: 'status',
      status: 'running',
    });

    // Create assistant placeholder
    const assistantMessage: IdeaChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };
    idea.messages.push(assistantMessage);

    wsManager.broadcastToSession(ideaId, {
      type: 'message',
      message: assistantMessage,
    });

    // Build prompt
    let prompt = this.buildPrompt(idea, content);

    if (idea.mode === 'plan') {
      prompt = claudeInvoker.generatePlanPrompt(prompt);
    }

    // Create artifacts dir
    const artifactsDir = join(getIdeaArtifactsDir(), ideaId);
    if (!existsSync(artifactsDir)) {
      mkdirSync(artifactsDir, { recursive: true });
    }

    const workingDir = this.getWorkingDir(idea);

    try {
      const result = await claudeInvoker.invoke({
        repoPath: workingDir,
        prompt,
        artifactsDir,
        resumeSessionId: idea.claudeSessionId,
        onProcessStart: (proc) => {
          this.claudeProcesses.set(ideaId, proc);
        },
        onStreamEvent: (event: ClaudeStreamEvent) => {
          if (event.type === 'text' && event.content) {
            assistantMessage.content += event.content;
            wsManager.broadcastToSession(ideaId, {
              type: 'chunk',
              messageId: assistantMessage.id,
              content: event.content,
            });
          } else if (event.type === 'tool_use' && event.toolName) {
            wsManager.broadcastToSession(ideaId, {
              type: 'activity',
              content: event.content,
              toolName: event.toolName,
            });
          } else if (event.type === 'result') {
            // Capture Claude session ID
            if (event.sessionId && !idea.claudeSessionId) {
              idea.claudeSessionId = event.sessionId;
              console.log(`[IdeaManager] Captured Claude session ID for ${ideaId}: ${event.sessionId}`);
            }

            // Context management: track actual token usage and broadcast state
            // Include all input token types: non-cached + cache creation + cache read
            const totalInputTokens = (event.usage?.inputTokens || 0)
              + (event.usage?.cacheCreationInputTokens || 0)
              + (event.usage?.cacheReadInputTokens || 0);
            if (totalInputTokens > 0) {
              contextManager.updateActualUsage(ideaId, totalInputTokens);
            }
            const contextState = contextManager.getContextState(ideaId, idea.messages, event.model);
            contextManager.broadcastContextState(ideaId, contextState);

            // Check if split should be suggested
            if (contextManager.shouldSuggestSplit(contextState) && !contextManager.isSplitSuggested(ideaId)) {
              contextManager.markSplitSuggested(ideaId);
              contextManager.broadcastSplitSuggested(ideaId);
            }
          } else if (event.type === 'error' && event.content) {
            wsManager.broadcastToSession(ideaId, {
              type: 'activity',
              content: `Error: ${event.content}`,
            });
          }
        },
      });

      // Complete message
      assistantMessage.isStreaming = false;

      if (!result.success) {
        if (result.error?.toLowerCase().includes('prompt is too long') ||
            result.error?.toLowerCase().includes('too long')) {
          idea.claudeSessionId = undefined;
          assistantMessage.content += '\n\n**Error:** Context limit reached. Your next message will start a fresh conversation.';
        } else if (idea.claudeSessionId && result.error?.includes('exit code 1')) {
          idea.claudeSessionId = undefined;
          assistantMessage.content += '\n\n**Error:** Could not resume the previous session. Your next message will start a fresh conversation.';
        } else {
          assistantMessage.content += `\n\n**Error:** ${result.error}`;
        }
      }

      idea.chatStatus = 'idle';

      wsManager.broadcastToSession(ideaId, {
        type: 'message-complete',
        messageId: assistantMessage.id,
        success: result.success,
      });
      wsManager.broadcastToSession(ideaId, {
        type: 'status',
        status: 'idle',
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      assistantMessage.content += `\n\n**Error:** ${errorMsg}`;
      assistantMessage.isStreaming = false;
      idea.chatStatus = 'error';

      wsManager.broadcastToSession(ideaId, {
        type: 'error',
        error: errorMsg,
      });
      wsManager.broadcastToSession(ideaId, {
        type: 'status',
        status: 'error',
      });
    } finally {
      this.claudeProcesses.delete(ideaId);
      idea.lastActivityAt = new Date().toISOString();

      if (idea.status === 'saved') {
        this.saveIdeas();
      }

      // Process next queued message
      if (idea.chatStatus === 'idle' && idea.messageQueue.length > 0) {
        setTimeout(() => this.processNextInQueue(ideaId), 100);
      }
    }
  }

  cancelClaude(ideaId: string): void {
    const proc = this.claudeProcesses.get(ideaId);
    if (proc && proc.pid) {
      try {
        treeKill(proc.pid, 'SIGTERM');
      } catch (error) {
        console.error(`[IdeaManager] Failed to kill process for ${ideaId}:`, error);
      }
    }
    this.claudeProcesses.delete(ideaId);

    const idea = this.ideas.get(ideaId);
    if (idea) {
      idea.chatStatus = 'idle';

      // Finalize any streaming message
      const lastMsg = idea.messages[idea.messages.length - 1];
      if (lastMsg?.isStreaming) {
        lastMsg.isStreaming = false;
        if (!lastMsg.content) {
          lastMsg.content = '[Cancelled]';
        }
      }

      wsManager.broadcastToSession(ideaId, {
        type: 'status',
        status: 'idle',
      });
    }
  }

  setMode(ideaId: string, mode: 'plan' | 'direct'): void {
    const idea = this.ideas.get(ideaId);
    if (!idea) return;
    idea.mode = mode;
    wsManager.broadcastToSession(ideaId, {
      type: 'mode-change',
      mode,
    });
  }

  // ─── Queue ─────────────────────────────────────────────────────────────────

  private queueMessage(ideaId: string, content: string): void {
    const idea = this.ideas.get(ideaId);
    if (!idea) return;

    if (idea.messageQueue.length >= MAX_QUEUE_SIZE) {
      wsManager.broadcastToSession(ideaId, {
        type: 'error',
        error: `Message queue is full (max ${MAX_QUEUE_SIZE}). Please wait for the current operation to complete.`,
      });
      return;
    }

    const queued: IdeaQueuedMessage = {
      id: generateId(),
      content,
      mode: idea.mode,
      queuedAt: new Date().toISOString(),
    };
    idea.messageQueue.push(queued);

    wsManager.broadcastToSession(ideaId, {
      type: 'queue-update',
      queue: idea.messageQueue,
    });
  }

  private processNextInQueue(ideaId: string): void {
    const idea = this.ideas.get(ideaId);
    if (!idea || idea.chatStatus !== 'idle' || idea.messageQueue.length === 0) return;

    const next = idea.messageQueue.shift()!;
    wsManager.broadcastToSession(ideaId, {
      type: 'queue-update',
      queue: idea.messageQueue,
    });

    this.sendMessage(ideaId, next.content).catch(err => {
      console.error(`[IdeaManager] Failed to process queued message:`, err);
    });
  }

  // ─── Attach / Detach Repos ─────────────────────────────────────────────────

  attachRepo(ideaId: string, repoId: string): Idea {
    const idea = this.ideas.get(ideaId);
    if (!idea) throw new Error(`Idea not found: ${ideaId}`);

    const repo = repoRegistry.get(repoId);
    if (!repo) throw new Error(`Repository not found: ${repoId}`);

    if (!idea.attachedRepoIds) idea.attachedRepoIds = [];
    if (!idea.attachedRepoIds.includes(repoId)) {
      idea.attachedRepoIds.push(repoId);
    }

    idea.lastActivityAt = new Date().toISOString();
    if (idea.status === 'saved') this.saveIdeas();

    return idea;
  }

  detachRepo(ideaId: string, repoId: string): Idea {
    const idea = this.ideas.get(ideaId);
    if (!idea) throw new Error(`Idea not found: ${ideaId}`);

    if (idea.attachedRepoIds) {
      idea.attachedRepoIds = idea.attachedRepoIds.filter(id => id !== repoId);
    }

    idea.lastActivityAt = new Date().toISOString();
    if (idea.status === 'saved') this.saveIdeas();

    return idea;
  }

  // ─── Promote to Project ────────────────────────────────────────────────────

  async promoteIdea(ideaId: string, options: PromoteOptions): Promise<{ sessionId: string; repoId: string; handoffSummary: string }> {
    const idea = this.ideas.get(ideaId);
    if (!idea) throw new Error(`Idea not found: ${ideaId}`);
    if (idea.chatStatus === 'running') throw new Error('Cannot promote while Claude is running');

    const { repoName, directory, generateScaffold, transferHistory } = options;

    // Create directory
    const repoPath = join(directory, repoName);
    if (existsSync(repoPath)) {
      throw new Error(`Directory already exists: ${repoPath}`);
    }
    mkdirSync(repoPath, { recursive: true });

    // Git init
    const { execSync } = await import('child_process');
    try {
      execSync('git init', { cwd: repoPath, stdio: 'pipe' });
      execSync('git checkout -b main', { cwd: repoPath, stdio: 'pipe' });

      // Create initial commit
      writeFileSync(join(repoPath, '.gitkeep'), '');
      execSync('git add .gitkeep', { cwd: repoPath, stdio: 'pipe' });
      execSync('git commit -m "Initial commit from ClaudeDesk idea"', { cwd: repoPath, stdio: 'pipe' });
    } catch (err) {
      console.error(`[IdeaManager] Git init failed for ${repoPath}:`, err);
    }

    // Register in repos.json
    const repoId = repoName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    repoRegistry.add({
      id: repoId,
      path: repoPath,
      commands: {},
      proof: { mode: 'cli' as const },
    });

    // Update idea
    idea.status = 'promoted';
    idea.promotedToRepoId = repoId;
    idea.lastActivityAt = new Date().toISOString();

    // Build handoff summary
    let handoffSummary = '';
    if (transferHistory && idea.messages.length > 0) {
      handoffSummary = idea.messages
        .filter(m => !m.isStreaming)
        .map(m => `**${m.role === 'user' ? 'User' : 'Assistant'}:** ${m.content.slice(0, 500)}`)
        .join('\n\n');
    }

    this.saveIdeas();

    console.log(`[IdeaManager] Promoted idea ${ideaId} to repo ${repoId} at ${repoPath} (transferHistory=${transferHistory}, messages=${idea.messages.length}, handoffLength=${handoffSummary.length})`);

    return { sessionId: '', repoId, handoffSummary }; // Session creation happens on frontend side
  }

  // ─── WebSocket Handlers ────────────────────────────────────────────────────

  private setupWebSocketHandlers(): void {
    // Subscribe to idea updates
    wsManager.on('subscribe-idea', (client, message) => {
      const { ideaId } = message as { ideaId?: string };
      if (ideaId && this.ideas.has(ideaId)) {
        wsManager.subscribeToSession(client, ideaId);
        const idea = this.ideas.get(ideaId)!;
        wsManager.send(client, {
          type: 'idea-state',
          ideaId,
          idea: {
            id: idea.id,
            title: idea.title,
            status: idea.status,
            chatStatus: idea.chatStatus,
            mode: idea.mode,
            messages: idea.messages,
            messageQueue: idea.messageQueue,
            attachedRepoIds: idea.attachedRepoIds,
            promotedToSessionId: idea.promotedToSessionId,
            promotedToRepoId: idea.promotedToRepoId,
            createdAt: idea.createdAt,
            lastActivityAt: idea.lastActivityAt,
            savedAt: idea.savedAt,
            tags: idea.tags,
          },
        });
      }
    });

    // Send message to idea
    wsManager.on('idea-message', async (client, message) => {
      const { ideaId, content } = message as { ideaId?: string; content?: string };
      if (ideaId && content && typeof content === 'string') {
        await this.sendMessage(ideaId, content);
      }
    });

    // Cancel running Claude
    wsManager.on('idea-cancel', (client, message) => {
      const { ideaId } = message as { ideaId?: string };
      if (ideaId) {
        this.cancelClaude(ideaId);
      }
    });

    // Set mode
    wsManager.on('idea-set-mode', (client, message) => {
      const { ideaId, mode } = message as { ideaId?: string; mode?: string };
      if (ideaId && (mode === 'plan' || mode === 'direct')) {
        this.setMode(ideaId, mode);
      }
    });

    // Unsubscribe from idea
    wsManager.on('unsubscribe-idea', (client, message) => {
      const { ideaId } = message as { ideaId?: string };
      if (ideaId) {
        wsManager.unsubscribeFromSession(client, ideaId);
      }
    });
  }

  // ─── Context Management ────────────────────────────────────────────────

  getContextState(ideaId: string) {
    const idea = this.ideas.get(ideaId);
    if (!idea) return null;
    return contextManager.getContextState(ideaId, idea.messages);
  }

  async summarizeIdea(ideaId: string): Promise<void> {
    const idea = this.ideas.get(ideaId);
    if (!idea) throw new Error(`Idea not found: ${ideaId}`);

    const workingDir = this.getWorkingDir(idea);
    const artifactsDir = join(getIdeaArtifactsDir(), ideaId);
    if (!existsSync(artifactsDir)) {
      mkdirSync(artifactsDir, { recursive: true });
    }

    await contextManager.summarize(ideaId, idea.messages, workingDir, artifactsDir);
  }

  // ─── Shutdown ──────────────────────────────────────────────────────────────

  shutdown(): void {
    for (const [ideaId] of this.claudeProcesses) {
      this.cancelClaude(ideaId);
    }
    this.saveIdeas();
  }
}

export const ideaManager = new IdeaManager();
