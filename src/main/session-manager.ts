import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { CLIManager } from './cli-manager';
import { HistoryManager } from './history-manager';
import { SessionPool } from './session-pool';
import { IPCEmitter } from './ipc-emitter';
import { ModelHistoryManager } from './model-history-manager';
import {
  SessionMetadata,
  SessionCreateRequest,
  SessionListResponse,
  SessionOutput,
  ClaudeModel,
  ModelSwitchEvent,
} from '../shared/ipc-types';
import {
  loadSessionState,
  saveSessionState,
  validateDirectory,
  getHomeDirectory,
} from './session-persistence';
import {
  addWorktreeToRegistry,
  removeWorktreeFromRegistry,
} from './settings-persistence';
import type { GitManager } from './git-manager';
import type { WorktreeSettings } from '../shared/types/git-types';

const MAX_SESSIONS = 10;

interface Session {
  metadata: SessionMetadata;
  cliManager: CLIManager | null;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private activeSessionId: string | null = null;
  private emitter: IPCEmitter | null = null;
  private historyManager: HistoryManager;
  private sessionPool: SessionPool;
  private sessionEndCallbacks: Array<(sessionId: string) => void> = [];
  private modelHistoryManager: ModelHistoryManager | null = null;
  private gitManager: GitManager | null = null;
  private agentTeamsGetter: (() => boolean) | null = null;
  private worktreeSettings: WorktreeSettings = { basePath: 'sibling', cleanupOnSessionClose: 'ask' };
  private outputSubscribers: Map<string, Set<(data: string) => void>> = new Map();

  constructor(historyManager: HistoryManager, sessionPool: SessionPool) {
    this.historyManager = historyManager;
    this.sessionPool = sessionPool;
  }

  setGitManager(manager: GitManager): void {
    this.gitManager = manager;
  }

  setAgentTeamsGetter(fn: () => boolean): void {
    this.agentTeamsGetter = fn;
  }

  setWorktreeSettings(settings: WorktreeSettings): void {
    this.worktreeSettings = settings;
  }

  /** Register a callback to be called when a session closes or exits. */
  onSessionEnd(callback: (sessionId: string) => void): void {
    this.sessionEndCallbacks.push(callback);
  }

  private notifySessionEnd(sessionId: string): void {
    for (const cb of this.sessionEndCallbacks) {
      try { cb(sessionId); } catch (err) {
        console.error('Session end callback error:', err);
      }
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.emitter = new IPCEmitter(window);
  }

  setModelHistoryManager(manager: ModelHistoryManager): void {
    this.modelHistoryManager = manager;
  }

  initialize(): void {
    // Load persisted sessions
    const state = loadSessionState();
    if (state && state.sessions.length > 0) {
      // Restore session metadata (but don't spawn processes yet)
      for (const sessionMeta of state.sessions) {
        this.sessions.set(sessionMeta.id, {
          metadata: {
            ...sessionMeta,
            status: 'exited', // Mark as exited until restarted
          },
          cliManager: null,
        });
      }
      this.activeSessionId = state.activeSessionId;

      // Auto-restart the active session after a brief delay
      if (this.activeSessionId && this.sessions.has(this.activeSessionId)) {
        setTimeout(() => {
          if (this.activeSessionId) {
            this.restartSession(this.activeSessionId).catch(err => {
              console.error('Failed to auto-restart active session:', err);
            });
          }
        }, 500); // Give main window time to be ready
      }
    }
  }


  private persistState(): void {
    const sessions = Array.from(this.sessions.values()).map(s => s.metadata);
    saveSessionState(sessions, this.activeSessionId);
  }

  private generateSessionName(request: SessionCreateRequest): string {
    if (request.name && request.name.trim()) {
      return request.name.trim();
    }
    // Use directory name or default
    const dirName = request.workingDirectory.split(/[\\/]/).pop() || 'Session';
    return dirName;
  }

  async createSession(request: SessionCreateRequest): Promise<SessionMetadata> {
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(`Maximum ${MAX_SESSIONS} sessions allowed`);
    }

    // Validate working directory
    let workingDir = request.workingDirectory || getHomeDirectory();
    if (!validateDirectory(workingDir)) {
      throw new Error('Invalid working directory');
    }

    // Handle worktree creation if requested
    let worktreeInfo: import('../shared/types/git-types').WorktreeInfo | undefined;
    if (request.worktree && this.gitManager) {
      const result = await this.gitManager.addWorktree(request.worktree, this.worktreeSettings);
      if (!result.success || !result.worktreePath) {
        throw new Error(`Failed to create worktree: ${result.message}`);
      }
      workingDir = result.worktreePath;
      worktreeInfo = {
        mainRepoPath: request.worktree.mainRepoPath,
        worktreePath: result.worktreePath,
        branch: request.worktree.branch,
        managedByClaudeDesk: true,
        createdAt: Date.now(),
      };
      addWorktreeToRegistry(worktreeInfo);
    }

    const model = request.model;

    const id = uuidv4();
    const metadata: SessionMetadata = {
      id,
      name: this.generateSessionName({ ...request, workingDirectory: workingDir }),
      workingDirectory: workingDir,
      permissionMode: request.permissionMode,
      status: 'starting',
      createdAt: Date.now(),
      worktreeInfo,
    };

    // Register all callbacks on a CLIManager BEFORE any async operations
    // that produce PTY output (fixes race where Phase 1 fires before callback is set)
    const registerCallbacks = (mgr: CLIManager) => {
      mgr.onModelChange((model: ClaudeModel) => {
        const session = this.sessions.get(id);
        if (session) {
          const previousModel = session.metadata.currentModel ?? null;
          session.metadata.currentModel = model;

          const event: ModelSwitchEvent = {
            sessionId: id,
            model,
            previousModel,
            detectedAt: Date.now(),
          };

          // Emit model change event
          this.emitter?.emit('onModelChanged', event);

          // Log to model history
          if (this.modelHistoryManager) {
            this.modelHistoryManager.logSwitch(event);
          }

          // Also emit general session updated
          this.emitter?.emit('onSessionUpdated', session.metadata);
          this.persistState();
        }
      });

      mgr.onOutput((data: string) => {
        const output: SessionOutput = { sessionId: id, data };
        this.emitter?.emit('onSessionOutput', output);
        this.notifyOutputSubscribers(id, data);

        // Record to history (async, non-blocking)
        this.historyManager.recordOutput(id, data).catch(err => {
          console.error('Failed to record history:', err);
        });
      });

      mgr.onExit((exitCode: number) => {
        const session = this.sessions.get(id);
        if (session) {
          session.metadata.status = 'exited';
          session.metadata.exitCode = exitCode;
          this.emitter?.emit('onSessionUpdated', session.metadata);
          this.emitter?.emit('onSessionExited', { sessionId: id, exitCode });
          this.persistState();
          this.notifySessionEnd(id);

          // Flush final history buffer
          this.historyManager.onSessionExit(id, exitCode).catch(err => {
            console.error('Failed to finalize session history:', err);
          });
        }
      });
    };

    // Try to claim from pool first
    const pooledSession = this.sessionPool.claim();
    let cliManager: CLIManager;

    if (pooledSession) {
      // POOL PATH: Activate pooled session
      console.log(`[SessionManager] Using pooled session ${pooledSession.id} for ${id}`);
      cliManager = pooledSession.cliManager;
      registerCallbacks(cliManager);
      try {
        await cliManager.initializeSession(workingDir, request.permissionMode, model);
      } catch (err) {
        // Activation failed, fall back to direct creation
        console.error('[SessionManager] Pooled session activation failed, falling back to direct creation:', err);
        cliManager.destroy();
        cliManager = new CLIManager({
          workingDirectory: workingDir,
          permissionMode: request.permissionMode,
          model,
          enableAgentTeams: this.agentTeamsGetter?.() ?? true,
        });
        registerCallbacks(cliManager);
        await cliManager.spawn();
      }
    } else {
      // FALLBACK PATH: Direct creation (existing behavior)
      console.log(`[SessionManager] Pool empty, creating session ${id} directly`);
      cliManager = new CLIManager({
        workingDirectory: workingDir,
        permissionMode: request.permissionMode,
        model,
        enableAgentTeams: this.agentTeamsGetter?.() ?? true,
      });
      registerCallbacks(cliManager);
      cliManager.spawn();
    }

    // Update history metadata with session details
    this.historyManager.updateSessionMetadata(id, metadata.name, workingDir);

    // Store session
    this.sessions.set(id, { metadata, cliManager });

    // Process was already spawned above (pool activation or direct spawn)
    metadata.status = 'running';

    // Set as active if first session
    if (this.activeSessionId === null) {
      this.activeSessionId = id;
    }

    this.persistState();
    this.emitter?.emit('onSessionCreated', metadata);

    return metadata;
  }

  async closeSession(sessionId: string, removeWorktree?: boolean): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Destroy CLI manager if running
    if (session.cliManager) {
      session.cliManager.destroy();
    }

    // Handle worktree cleanup
    const wt = session.metadata.worktreeInfo;
    if (wt?.managedByClaudeDesk && this.gitManager) {
      // Check if any other active session uses this worktree
      const otherSessionUsesWorktree = Array.from(this.sessions.entries()).some(
        ([id, s]) => id !== sessionId && s.metadata.worktreeInfo?.worktreePath === wt.worktreePath
      );

      if (!otherSessionUsesWorktree) {
        const cleanup = removeWorktree !== undefined
          ? removeWorktree
          : this.worktreeSettings.cleanupOnSessionClose === 'always';

        if (cleanup) {
          try {
            await this.gitManager.removeWorktree({
              mainRepoPath: wt.mainRepoPath,
              worktreePath: wt.worktreePath,
              force: false,
            });
            removeWorktreeFromRegistry(wt.worktreePath);
          } catch (err) {
            console.warn('[SessionManager] Failed to cleanup worktree:', err);
          }
        }
      }
    }

    // Remove session
    this.sessions.delete(sessionId);

    // Update active session if needed
    if (this.activeSessionId === sessionId) {
      const remaining = Array.from(this.sessions.keys());
      this.activeSessionId = remaining.length > 0 ? remaining[0] : null;
      if (this.activeSessionId) {
        this.emitter?.emit('onSessionSwitched', this.activeSessionId);
      }
    }

    this.persistState();
    this.emitter?.emit('onSessionClosed', sessionId);
    this.notifySessionEnd(sessionId);

    return true;
  }

  async switchSession(sessionId: string): Promise<boolean> {
    if (!this.sessions.has(sessionId)) {
      return false;
    }

    this.activeSessionId = sessionId;
    this.persistState();
    this.emitter?.emit('onSessionSwitched', sessionId);

    return true;
  }

  async renameSession(sessionId: string, newName: string): Promise<SessionMetadata> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const trimmedName = newName.trim();
    if (!trimmedName) {
      throw new Error('Session name cannot be empty');
    }

    if (trimmedName.length > 50) {
      throw new Error('Session name too long (max 50 characters)');
    }

    session.metadata.name = trimmedName;
    this.persistState();
    this.emitter?.emit('onSessionUpdated', session.metadata);

    // Update history metadata
    this.historyManager.updateSessionMetadata(
      sessionId,
      trimmedName,
      session.metadata.workingDirectory
    );

    return session.metadata;
  }

  async restartSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Destroy existing CLI manager if any
    if (session.cliManager) {
      session.cliManager.destroy();
    }

    // Notify history manager of restart (creates new segment)
    await this.historyManager.onSessionRestart(sessionId).catch(err => {
      console.error('Failed to prepare history for restart:', err);
    });

    // Update history metadata with session details
    this.historyManager.updateSessionMetadata(
      sessionId,
      session.metadata.name,
      session.metadata.workingDirectory
    );

    // Create new CLI manager with same options
    const cliManager = new CLIManager({
      workingDirectory: session.metadata.workingDirectory,
      permissionMode: session.metadata.permissionMode,
      enableAgentTeams: this.agentTeamsGetter?.() ?? true,
    });

    // Set up handlers
    cliManager.onModelChange((model: ClaudeModel) => {
      const session = this.sessions.get(sessionId);
      if (session) {
        const previousModel = session.metadata.currentModel ?? null;
        session.metadata.currentModel = model;

        const event: ModelSwitchEvent = {
          sessionId,
          model,
          previousModel,
          detectedAt: Date.now(),
        };

        // Emit model change event
        this.emitter?.emit('onModelChanged', event);

        // Log to model history
        if (this.modelHistoryManager) {
          this.modelHistoryManager.logSwitch(event);
        }

        // Also emit general session updated
        this.emitter?.emit('onSessionUpdated', session.metadata);
        this.persistState();
      }
    });

    cliManager.onOutput((data: string) => {
      const output: SessionOutput = { sessionId, data };
      this.emitter?.emit('onSessionOutput', output);
      this.notifyOutputSubscribers(sessionId, data);

      // Record to history (async, non-blocking)
      this.historyManager.recordOutput(sessionId, data).catch(err => {
        console.error('Failed to record history:', err);
      });
    });

    cliManager.onExit((exitCode: number) => {
      const s = this.sessions.get(sessionId);
      if (s) {
        s.metadata.status = 'exited';
        s.metadata.exitCode = exitCode;
        this.emitter?.emit('onSessionUpdated', s.metadata);
        this.emitter?.emit('onSessionExited', { sessionId, exitCode });
        this.persistState();

        // Flush final history buffer
        this.historyManager.onSessionExit(sessionId, exitCode).catch(err => {
          console.error('Failed to finalize session history:', err);
        });
      }
    });

    session.cliManager = cliManager;
    session.metadata.status = 'starting';
    session.metadata.exitCode = undefined;
    session.metadata.currentModel = undefined; // Clear stale model — Phase 1 will re-detect

    try {
      cliManager.spawn();
      session.metadata.status = 'running';
    } catch (err) {
      session.metadata.status = 'error';
      console.error('Failed to restart session:', err);
      return false;
    }

    this.persistState();
    this.emitter?.emit('onSessionUpdated', session.metadata);

    return true;
  }

  listSessions(): SessionListResponse {
    const sessions = Array.from(this.sessions.values())
      .map(s => s.metadata)
      .sort((a, b) => a.createdAt - b.createdAt);

    return {
      sessions,
      activeSessionId: this.activeSessionId,
    };
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  getSession(sessionId: string): SessionMetadata | null {
    const session = this.sessions.get(sessionId);
    return session ? session.metadata : null;
  }

  // Session I/O methods
  sendInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.cliManager) {
      session.cliManager.write(data);
    }
  }

  resizeSession(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session?.cliManager) {
      session.cliManager.resize({ cols, rows });
    }
  }

  // Cleanup all sessions
  destroyAll(): void {
    for (const session of this.sessions.values()) {
      if (session.cliManager) {
        session.cliManager.destroy();
      }
    }
    this.sessions.clear();
    this.activeSessionId = null;

    // Also destroy the pool
    this.sessionPool.destroy();
  }

  // Get count for validation
  getSessionCount(): number {
    return this.sessions.size;
  }

  // Get all session metadata (for agent teams)
  getAllSessionMetadata(): SessionMetadata[] {
    return Array.from(this.sessions.values()).map(s => s.metadata);
  }

  // Update team metadata on a session
  updateSessionTeamMetadata(sessionId: string, teamData: Partial<SessionMetadata>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (teamData.teamName !== undefined) session.metadata.teamName = teamData.teamName;
    if (teamData.agentId !== undefined) session.metadata.agentId = teamData.agentId;
    if (teamData.agentType !== undefined) session.metadata.agentType = teamData.agentType;
    if (teamData.isTeammate !== undefined) session.metadata.isTeammate = teamData.isTeammate;

    this.emitter?.emit('onSessionUpdated', session.metadata);
    this.persistState();
  }

  /** Subscribe to output from a specific session. Returns an unsubscribe function. */
  subscribeToOutput(sessionId: string, callback: (data: string) => void): () => void {
    let subs = this.outputSubscribers.get(sessionId);
    if (!subs) {
      subs = new Set();
      this.outputSubscribers.set(sessionId, subs);
    }
    subs.add(callback);
    return () => {
      subs!.delete(callback);
      if (subs!.size === 0) {
        this.outputSubscribers.delete(sessionId);
      }
    };
  }

  /** Dispatch output to subscribers (called from output handlers). */
  private notifyOutputSubscribers(sessionId: string, data: string): void {
    const subs = this.outputSubscribers.get(sessionId);
    if (subs) {
      for (const cb of subs) {
        try { cb(data); } catch (err) {
          console.error('[SessionManager] Output subscriber error:', err);
        }
      }
    }
  }
}
