import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { execFile } from 'child_process';
import { CLIManager } from './cli-manager';
import { HistoryManager } from './history-manager';
import { SessionPool } from './session-pool';
import { IPCEmitter } from './ipc-emitter';
import {
  SessionMetadata,
  SessionCreateRequest,
  SessionListResponse,
  SessionOutput,
  ClaudeModel,
  ModelSwitchEvent,
  SessionStateChangeEvent,
  SessionActivityState,
} from '../shared/ipc-types';
import { SessionStateClassifier } from './session-state/classifier';
import { ScreenModel } from './session-state/screen-model';
import { BellScanner } from './session-state/bell-probe';
import { BareBellDetector } from './session-state/bell-attention';
import { OscTitleParser, extractTaskTitle } from './session-state/title-parser';
import { appendFile } from 'fs';
import type { StateSignals } from '../shared/session-state-types';
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
import type { ProviderRegistry } from './providers/provider-registry';
import type { IProvider } from './providers/provider';
import { isSafeModelToken } from './providers/provider';

const MAX_SESSIONS = 10;

const EMPTY_STATE_SIGNALS: StateSignals = { working: [], approval: [], awaitingInput: [], fatalError: [] };

interface Session {
  metadata: SessionMetadata;
  cliManager: CLIManager | null;
}

/** Main-process subscriber to session activity-state changes (see addStateListener). */
export type SessionStateListener = (event: SessionStateChangeEvent, meta: SessionMetadata) => void;

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private activeSessionId: string | null = null;
  private emitter: IPCEmitter | null = null;
  private historyManager: HistoryManager;
  private sessionPool: SessionPool;
  private sessionEndCallbacks: Array<(sessionId: string) => void> = [];
  private gitManager: GitManager | null = null;
  private agentTeamsGetter: (() => boolean) | null = null;
  private worktreeSettings: WorktreeSettings = { basePath: 'sibling', cleanupOnSessionClose: 'ask' };
  private outputSubscribers: Map<string, Set<(data: string) => void>> = new Map();
  private providerRegistry: ProviderRegistry | null = null;
  /** Per-session live-activity-state classifier (the attention-router feed). */
  private classifiers: Map<string, SessionStateClassifier> = new Map();
  /** Per-session headless screen emulator (agent sessions only) feeding the
   *  screen-driven classifier's `onScreenSettled`. Shell sessions have no
   *  entry — they classify off the raw byte tail directly (see setupClassifier). */
  private screenModels: Map<string, ScreenModel> = new Map();
  /** Rolling per-session raw output buffer, replayed to clients that attach
   *  mid-session (e.g. a phone joining, or a renderer reload). Bounded. */
  private scrollback: Map<string, string> = new Map();
  private readonly SCROLLBACK_MAX = 256 * 1024;
  /** In-flight worktree/branch cleanup promises. Awaited on app quit so the
   *  user-initiated close→quit sequence doesn't leave a half-cleaned repo. */
  private pendingCleanups: Set<Promise<void>> = new Set();
  /** Main-process activity-state subscribers (integrations event bus tap). */
  private stateListeners: SessionStateListener[] = [];

  constructor(historyManager: HistoryManager, sessionPool: SessionPool) {
    this.historyManager = historyManager;
    this.sessionPool = sessionPool;
  }

  setProviderRegistry(registry: ProviderRegistry): void {
    this.providerRegistry = registry;
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

  /** Resolves once every in-flight worktree cleanup has settled. Call this
   *  from `before-quit` so Electron doesn't tear down the main process
   *  mid-`git branch -D` / `git worktree prune`. */
  async waitForPendingCleanups(): Promise<void> {
    if (this.pendingCleanups.size === 0) return;
    await Promise.all([...this.pendingCleanups]);
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

  /** Append raw output to a session's rolling scrollback buffer, capped at
   *  SCROLLBACK_MAX bytes (oldest bytes dropped). */
  appendScrollback(sessionId: string, data: string): void {
    const prev = this.scrollback.get(sessionId) ?? '';
    let next = prev + data;
    if (next.length > this.SCROLLBACK_MAX) {
      next = next.slice(next.length - this.SCROLLBACK_MAX);
    }
    this.scrollback.set(sessionId, next);
  }

  /** Current buffered scrollback for a session, or '' if unknown. */
  getSessionScrollback(sessionId: string): string {
    return this.scrollback.get(sessionId) ?? '';
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
      let result = await this.gitManager.addWorktree(request.worktree, this.worktreeSettings);
      // If the orphaned worktree directory (or its branch) still exists from
      // a prior session that didn't clean up properly, clear those out and retry.
      if (!result.success && /already exists/i.test(result.message)) {
        const targetPath = this.gitManager.computeWorktreePath(
          request.worktree.mainRepoPath,
          request.worktree.branch,
          this.worktreeSettings,
        );
        // Prune dangling worktree records git is tracking.
        await new Promise<void>((resolve) => {
          execFile('git', ['worktree', 'prune'], { cwd: request.worktree!.mainRepoPath, windowsHide: true }, () => resolve());
        });
        // Force-remove via git first; if that fails (e.g. record already gone),
        // fall back to rmdir on disk. Both are best-effort.
        await new Promise<void>((resolve) => {
          execFile('git', ['worktree', 'remove', '--force', targetPath], { cwd: request.worktree!.mainRepoPath, windowsHide: true }, () => resolve());
        });
        try {
          const fs = await import('fs');
          if (fs.existsSync(targetPath)) {
            await fs.promises.rm(targetPath, { recursive: true, force: true });
          }
        } catch (err) {
          console.warn('[SessionManager] Failed to remove orphaned worktree dir:', err);
        }
        // Also drop a stale branch with the same name (best-effort).
        await new Promise<void>((resolve) => {
          execFile('git', ['branch', '-D', request.worktree!.branch], { cwd: request.worktree!.mainRepoPath, windowsHide: true }, () => resolve());
        });
        // Retry with the original request (isNewBranch as the caller specified).
        result = await this.gitManager.addWorktree(request.worktree, this.worktreeSettings);
      }
      if (!result.success || !result.worktreePath) {
        throw new Error(`Failed to create worktree: ${result.message}`);
      }
      workingDir = result.worktreePath;
      worktreeInfo = {
        mainRepoPath: request.worktree.mainRepoPath,
        worktreePath: result.worktreePath,
        branch: request.worktree.branch,
        managedByOmniDesk: true,
        // Only own the branch if WE created it. When user picks "Existing"
        // mode (isNewBranch=false), the branch is their work and must be
        // preserved across session close.
        branchCreatedByOmniDesk: request.worktree.isNewBranch === true,
        createdAt: Date.now(),
      };
      addWorktreeToRegistry(worktreeInfo);
    }

    const rawModel = request.model;
    const isShell = request.kind === 'shell';

    // Resolve the provider to use: explicit request > default 'claude'. Shell sessions have none.
    const providerId = isShell ? undefined : (request.providerId ?? 'claude');
    let provider: IProvider | undefined;
    if (!isShell) {
      try {
        provider = this.providerRegistry?.get(providerId!);
      } catch {
        console.warn(`[SessionManager] Provider '${providerId}' not found, using no provider`);
        provider = undefined;
      }
    }

    // Gate `model` at this trust boundary before it is persisted to metadata
    // and forwarded to CLIManager, which shell-interpolates it into
    // `--model <value>` and writes the resulting line straight to a PTY
    // (claude-provider.ts#buildCommand / cli-manager.ts#launchProviderCommand).
    // request.model is untrusted input — reachable over the remote WS bridge
    // with only a token as gate (issue #116) — so anything that isn't a known
    // model name must never reach that write. Prefer the provider's own
    // normalizeModel() (it understands aliases like '4-sonnet' -> 'sonnet');
    // fall back to a strict charset check when no provider is resolved (or a
    // test double doesn't implement it). Values that don't validate are
    // dropped rather than rejected outright, matching the existing
    // 'auto'/no-flag behavior for an absent model.
    //
    // normalizeModel()/isSafeModelToken() operate on `string`, not the
    // narrower ClaudeModel union — SessionMetadata.model's ClaudeModel type is
    // a compile-time convenience only and enforces nothing at runtime (that
    // gap is exactly what issue #116 is about). The cast below is safe
    // because `model` is only ever assigned a value that has already passed
    // through one of the two runtime checks above.
    let model: ClaudeModel | undefined;
    if (rawModel) {
      if (provider && typeof provider.normalizeModel === 'function') {
        model = (provider.normalizeModel(rawModel) ?? undefined) as ClaudeModel | undefined;
      } else {
        model = (isSafeModelToken(rawModel) ? rawModel : undefined) as ClaudeModel | undefined;
      }
    }

    const id = uuidv4();
    const metadata: SessionMetadata = {
      id,
      name: this.generateSessionName({ ...request, workingDirectory: workingDir }),
      workingDirectory: workingDir,
      permissionMode: request.permissionMode,
      status: 'starting',
      createdAt: Date.now(),
      worktreeInfo,
      providerId,
      kind: request.kind,
      // An explicit name is the user's choice — title auto-rename must never
      // overwrite it. Fallback (folder) names stay auto-renameable.
      nameIsCustom: Boolean(request.name && request.name.trim()),
      // Starting intent — persisted and replayed verbatim on restart so a
      // session relaunches with the same model and launch mode it began with.
      model,
      launchMode: request.launchMode,
      // Seeded into the terminal at CLI readiness (typed, never auto-submitted).
      initialPrompt: request.initialPrompt,
    };

    // Insert the session into the map BEFORE any async activation. The wired
    // onExit/onModelChange callbacks look the session up by id and no-op if
    // it's absent; a pooled session that crashes during its ~200ms activation
    // (disproportionately likely during fleet-wide creation, exactly when the
    // cockpit watches hardest) would otherwise have its exit silently dropped
    // and sit at 'starting' forever. cliManager is patched in as each path
    // resolves it.
    this.sessions.set(id, { metadata, cliManager: null });

    // Set as active if first session
    if (this.activeSessionId === null) {
      this.activeSessionId = id;
    }

    // Try to claim from pool first (agent sessions only — shells never launch claude,
    // so the pool's launch-latency optimization does not apply).
    const pooledSession = isShell ? null : this.sessionPool.claim();
    let cliManager: CLIManager;

    try {
      if (pooledSession) {
        // POOL PATH: Activate pooled session
        console.log(`[SessionManager] Using pooled session ${pooledSession.id} for ${id}`);
        cliManager = pooledSession.cliManager;
        this.sessions.get(id)!.cliManager = cliManager;
        this.wireCliManager(cliManager, id);
        try {
          await cliManager.initializeSession(workingDir, request.permissionMode, model, provider, request.launchMode);
        } catch (err) {
          // Activation failed, fall back to direct creation
          console.error('[SessionManager] Pooled session activation failed, falling back to direct creation:', err);
          cliManager.destroy();
          cliManager = new CLIManager({
            workingDirectory: workingDir,
            permissionMode: request.permissionMode,
            model,
            enableAgentTeams: this.agentTeamsGetter?.() ?? true,
            provider,
            launchMode: request.launchMode,
          });
          this.sessions.get(id)!.cliManager = cliManager;
          this.wireCliManager(cliManager, id);
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
          provider,
          launchMode: request.launchMode,
          kind: request.kind,
        });
        this.sessions.get(id)!.cliManager = cliManager;
        this.wireCliManager(cliManager, id);
        if (isShell) {
          await cliManager.spawnShellSession();
        } else {
          await cliManager.spawn();
        }
      }
      // Only claim 'running' once the PTY actually spawned. onExit may have
      // already moved us to 'exited' (crash-on-launch); don't overwrite that.
      if (metadata.status === 'starting') {
        metadata.status = 'running';
      }
    } catch (err) {
      // Spawn/activation failed. Keep the (already-inserted) session in the
      // map as 'error' so the UI can show and let the user close/retry it —
      // never leave it broadcasting the false 'running' a router would trust.
      metadata.status = 'error';
      metadata.error = err instanceof Error ? err.message : String(err);
      console.error(`[SessionManager] Failed to start session ${id}:`, err);
    }

    // Update history metadata with session details
    this.historyManager.updateSessionMetadata(id, metadata.name, workingDir);

    this.persistState();
    this.emitter?.emit('onSessionCreated', metadata);

    return metadata;
  }

  /** Create (replacing any prior) the activity-state classifier — and, for
   *  agent sessions, its backing ScreenModel — for a session.
   *
   *  SHELL sessions classify off the raw byte-tail + quiescence timer,
   *  unchanged: `EMPTY_STATE_SIGNALS` (shells have no working/approval/
   *  awaitingInput/fatalError vocabulary of their own) and `screenDriven`
   *  left at its default `false`.
   *
   *  Agent CLIs (Claude Code, Codex) render as full-screen TUIs in the
   *  terminal's ALTERNATE-SCREEN buffer and repaint continuously (even when
   *  idle), which the byte-tail + quiescence model cannot classify — it can
   *  never observe "quiet", and the alt-screen holds it pinned. Instead they
   *  get a `screenDriven` classifier fed by a per-session `ScreenModel`: the
   *  same PTY bytes are mirrored into a headless terminal emulator, and each
   *  debounced settle snapshot is run through `classifier.onScreenSettled()`
   *  — the classifier's existing dwell/anti-flap/exit-reconciliation fusion
   *  logic, not a duplicate of it.
   *
   *  The provider's `StateSignals` table is required to classify at all. If
   *  the provider can't be resolved (unknown providerId) or it returns no
   *  signals, the session is deliberately left with NO classifier — never
   *  falling back to `EMPTY_STATE_SIGNALS`, which would silently misclassify
   *  every agent screen as shell-shaped output. Such a session still surfaces
   *  its process lifecycle (running / errored / exited) via
   *  SessionMetadata.status and the `mgr.onExit` fallback below. */
  private setupClassifier(sessionId: string): void {
    this.classifiers.get(sessionId)?.dispose();
    this.classifiers.delete(sessionId);
    this.screenModels.get(sessionId)?.dispose();
    this.screenModels.delete(sessionId);

    const session = this.sessions.get(sessionId);
    const kind = session?.metadata.kind;

    if (kind === 'shell') {
      const classifier = new SessionStateClassifier({
        signals: EMPTY_STATE_SIGNALS,
        kind,
        onStateChange: (state, reason) => this.emitActivityState(sessionId, state, reason),
      });
      this.classifiers.set(sessionId, classifier);
      return;
    }

    const providerId = session?.metadata.providerId ?? 'claude';
    const provider = this.providerRegistry?.get(providerId);
    const signals = provider?.getStateSignals();
    if (!provider || !signals) return;

    const classifier = new SessionStateClassifier({
      signals,
      kind,
      screenDriven: true,
      onStateChange: (state, reason) => this.emitActivityState(sessionId, state, reason),
    });
    this.classifiers.set(sessionId, classifier);

    const screenModel = new ScreenModel({
      onSettled: (snapshot) => classifier.onScreenSettled(snapshot.lines.join('\n')),
    });
    this.screenModels.set(sessionId, screenModel);
  }

  /** Rename an agent session to the CLI's terminal-title task summary — only
   *  when the user hasn't explicitly named it (create or session:rename), and
   *  only when the extracted text actually changed (spinner-glyph churn is a
   *  no-op, so no per-frame emits or disk writes). */
  private applyAutoRename(sessionId: string, rawTitle: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.metadata.kind === 'shell' || session.metadata.nameIsCustom) return;
    const name = extractTaskTitle(rawTitle);
    if (!name || name === session.metadata.name) return;
    session.metadata.name = name;
    this.emitter?.emit('onSessionUpdated', session.metadata);
    this.persistState();
    this.historyManager.updateSessionMetadata(sessionId, name, session.metadata.workingDirectory);
  }

  /** Record + broadcast a session's live activity state (transient, not persisted). */
  private emitActivityState(sessionId: string, state: SessionActivityState, reason?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.metadata.activityState = state;
    const event: SessionStateChangeEvent = { sessionId, state, reason, at: Date.now() };
    this.emitter?.emit('onSessionStateChanged', event);
    for (const listener of this.stateListeners) {
      try {
        listener(event, { ...session.metadata });
      } catch (err) {
        console.error('Session state listener failed:', err);
      }
    }
  }

  /** Subscribe a main-process module to every activity-state change (with the
   *  session's metadata attached). Listener errors are swallowed — they can
   *  never break the renderer broadcast. Returns an unsubscribe function. */
  addStateListener(listener: SessionStateListener): () => void {
    this.stateListeners.push(listener);
    return () => {
      const i = this.stateListeners.indexOf(listener);
      if (i !== -1) this.stateListeners.splice(i, 1);
    };
  }

  private wireCliManager(mgr: CLIManager, sessionId: string): void {
    this.setupClassifier(sessionId);

    // A CLIManager that has been destroyed and replaced (pool-fallback,
    // restart, or Stop) can still deliver a late PTY exit/output. Every wired
    // callback ignores events from a manager that is no longer the session's
    // current one, so a stale manager can't tear down or feed a live session.
    const isStale = () => this.sessions.get(sessionId)?.cliManager !== mgr;

    // OMNIDESK_DEBUG_BELL: probe instrumentation for the "BEL as agent
    // attention signal" experiment — logs every \x07 with context. Set to a
    // file path to also append there; any other value logs to console only.
    const bellEnv = process.env.OMNIDESK_DEBUG_BELL;
    const bellScanner = bellEnv ? new BellScanner() : null;

    // Bell → attention: agent CLIs ring a bare BEL exactly when they need the
    // user — turn finished or a question/permission prompt is up (verified
    // live: docs/experiments/2026-07-19-bell-attention-probe.md). Requires the
    // CLI's bell channel (Claude: preferredNotifChannel="terminal_bell").
    // Shells are excluded: their BELs (tab-completion, Ctrl+G) aren't
    // attention requests, and the shell classifier already covers them.
    const bellDetector =
      this.sessions.get(sessionId)?.metadata.kind !== 'shell' ? new BareBellDetector() : null;

    // Terminal-title parser: agent CLIs write "<glyph> <task summary>" to the
    // title (verified live 2026-07-19 — Claude Code); unnamed sessions
    // auto-rename to it via applyAutoRename. OMNIDESK_DEBUG_TITLE additionally
    // logs every title (a file path also appends there).
    const titleEnv = process.env.OMNIDESK_DEBUG_TITLE;
    const titleParser = new OscTitleParser();

    mgr.onModelChange((model: ClaudeModel) => {
      const session = this.sessions.get(sessionId);
      if (!session || isStale()) return;
      const previousModel = session.metadata.currentModel ?? null;
      session.metadata.currentModel = model;

      const event: ModelSwitchEvent = {
        sessionId,
        model,
        previousModel,
        detectedAt: Date.now(),
      };
      this.emitter?.emit('onModelChanged', event);
      this.emitter?.emit('onSessionUpdated', session.metadata);
      this.persistState();
    });

    mgr.onOutput((data: string) => {
      if (isStale()) return;
      this.appendScrollback(sessionId, data);
      const output: SessionOutput = { sessionId, data };
      this.emitter?.emit('onSessionOutput', output);
      this.notifyOutputSubscribers(sessionId, data);

      // Feed the activity-state classifier (the attention-router signal).
      this.classifiers.get(sessionId)?.onOutput(data);

      // A bare bell = the agent needs the user. Emit only on the leading edge
      // (delta); repeated rings while already flagged stay silent, and
      // sendInput() clears the flag so the next bell re-alerts.
      if (bellDetector && bellDetector.feed(data) > 0) {
        if (this.sessions.get(sessionId)?.metadata.activityState !== 'awaiting-input') {
          this.emitActivityState(sessionId, 'awaiting-input', 'bell');
          // The bell bypasses the classifier's own emit() — keep its cached
          // state truthful so a later settle back to the SAME state (e.g.
          // 'working', if the bell was a false alarm) isn't suppressed by
          // emit()'s no-op dedup guard.
          this.classifiers.get(sessionId)?.syncExternalState('awaiting-input');
        }
      }

      const titles = titleParser.feed(data);
      if (titles.length > 0) {
        if (titleEnv) {
          const sessKind = this.sessions.get(sessionId)?.metadata.kind ?? 'agent';
          for (const title of titles) {
            const line =
              `[title-probe] ${new Date().toISOString()} session=${sessionId} ` +
              `kind=${sessKind} title=${JSON.stringify(title)}`;
            console.log(line);
            if (/[\\/]/.test(titleEnv)) appendFile(titleEnv, line + '\n', () => {});
          }
        }
        // Only the newest title matters for the name.
        this.applyAutoRename(sessionId, titles[titles.length - 1]);
      }

      if (bellScanner) {
        const sessKind = this.sessions.get(sessionId)?.metadata.kind ?? 'agent';
        for (const ev of bellScanner.feed(data)) {
          const line =
            `[bell-probe] ${new Date().toISOString()} session=${sessionId} ` +
            `kind=${sessKind} #${ev.seq} ctx=${ev.context}`;
          console.log(line);
          if (bellEnv && /[\\/]/.test(bellEnv)) {
            appendFile(bellEnv, line + '\n', () => {});
          }
        }
      }

      // Record to history (async, non-blocking). Pass kind so shells skip the
      // Claude-ready gate (and don't leak an unbounded pre-ready buffer).
      const kind = this.sessions.get(sessionId)?.metadata.kind;
      this.historyManager.recordOutput(sessionId, data, { kind }).catch(err => {
        console.error('Failed to record history:', err);
      });
    });

    mgr.onExit((exitCode: number) => {
      const session = this.sessions.get(sessionId);
      // Ignore a stale manager's exit (a deliberate Stop/close/restart nulls or
      // replaces cliManager first, so only a LIVE manager's genuine exit lands
      // here — which means a non-zero code is a real crash, not a user Stop).
      if (!session || isStale()) return;
      const crashed = exitCode !== 0;
      // A crash is authoritative 'error' so both the rail and the attention
      // cockpit surface it; a clean exit is 'exited'.
      session.metadata.status = crashed ? 'error' : 'exited';
      session.metadata.exitCode = exitCode;
      this.emitter?.emit('onSessionUpdated', session.metadata);
      this.emitter?.emit('onSessionExited', { sessionId, exitCode });
      this.persistState();
      this.notifySessionEnd(sessionId);

      // Fuse the authoritative exit into the classifier (crash → 'errored',
      // clean → 'exited'), then tear it down.
      const classifier = this.classifiers.get(sessionId);
      classifier?.onExit(exitCode);
      classifier?.dispose();
      this.classifiers.delete(sessionId);
      // Agent sessions have no classifier, so their exit would never reach
      // activity-state subscribers (integrations) — emit it directly.
      if (!classifier) {
        this.emitActivityState(sessionId, crashed ? 'errored' : 'exited', 'exit');
      }

      // Flush final history buffer
      this.historyManager.onSessionExit(sessionId, exitCode).catch(err => {
        console.error('Failed to finalize session history:', err);
      });
    });
  }

  async closeSession(
    sessionId: string,
    opts?: { removeWorktree?: boolean; removeBranch?: boolean },
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Dispose the classifier before destroy (the session is going away — no
    // exit state to report).
    this.classifiers.get(sessionId)?.dispose();
    this.classifiers.delete(sessionId);

    // Destroy CLI manager if running
    if (session.cliManager) {
      session.cliManager.destroy();
    }

    // Worktree / branch cleanup is now strictly OPT-IN. Default close = stop
    // the CLI process and leave everything else alone (user might be pausing
    // for the day and continuing tomorrow).
    const removeWorktree = opts?.removeWorktree === true;
    const removeBranch = opts?.removeBranch === true;

    const wt = session.metadata.worktreeInfo;
    if ((removeWorktree || removeBranch) &&
        (wt?.managedByOmniDesk ?? wt?.managedByClaudeDesk) &&
        this.gitManager) {
      // Check if any other active session uses this worktree
      const otherSessionUsesWorktree = Array.from(this.sessions.entries()).some(
        ([id, s]) => id !== sessionId && s.metadata.worktreeInfo?.worktreePath === wt.worktreePath
      );

      if (!otherSessionUsesWorktree) {
        const cleanup = removeWorktree;

        if (cleanup) {
          // Track the cleanup so `waitForPendingCleanups()` (called on app quit)
          // can flush it. We also `await` here so the closeSession IPC reply
          // doesn't return until cleanup settles — but if the renderer hung up
          // or the app is quitting, the tracked promise still keeps the chain
          // alive for the quit-handler to await.
          const cleanupPromise = (async () => {
            try {
              await this.gitManager!.removeWorktree({
                mainRepoPath: wt.mainRepoPath,
                worktreePath: wt.worktreePath,
                force: false,
              });
              removeWorktreeFromRegistry(wt.worktreePath);
              // Branch deletion is its own explicit opt-in — the user must
              // have ticked "Also delete branch". Even if they did, we still
              // refuse to delete the branch if OmniDesk didn't create it AND
              // it's not theirs (handled in renderer by hiding the checkbox).
              if (wt.branch && removeBranch) {
                await new Promise<void>((resolve) => {
                  execFile(
                    'git',
                    ['branch', '-D', wt.branch],
                    { cwd: wt.mainRepoPath, windowsHide: true },
                    (err) => {
                      if (err) console.warn('[SessionManager] Failed to delete branch:', err.message);
                      resolve();
                    }
                  );
                });
              }
              // Prune any leftover .git/worktrees/<name>/ records to keep state coherent.
              await new Promise<void>((resolve) => {
                execFile(
                  'git',
                  ['worktree', 'prune'],
                  { cwd: wt.mainRepoPath, windowsHide: true },
                  () => resolve(),
                );
              });
            } catch (err) {
              console.warn('[SessionManager] Failed to cleanup worktree:', err);
            }
          })();
          this.pendingCleanups.add(cleanupPromise);
          cleanupPromise.finally(() => this.pendingCleanups.delete(cleanupPromise));
          await cleanupPromise;
        }
      }
    }

    // Remove session
    this.sessions.delete(sessionId);
    this.scrollback.delete(sessionId);

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
    // A manual rename is an explicit user choice — from here on, title
    // auto-rename must leave this session alone.
    session.metadata.nameIsCustom = true;
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

  /** Terminate the CLI process but KEEP the session in the rail (marked exited).
   *  The worktree/branch are untouched. Use restartSession to spin it back up. */
  async stopSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    // Deliberate stop: dispose the classifier BEFORE destroy so the resulting
    // PTY exit isn't misread as a crash ('errored'), then mark it 'exited'.
    this.classifiers.get(sessionId)?.dispose();
    this.classifiers.delete(sessionId);
    if (session.cliManager) {
      session.cliManager.destroy();
      session.cliManager = null;
    }
    this.emitActivityState(sessionId, 'exited', 'stopped');
    // Clear the terminal display so a killed session reads as a clean black
    // slate — matching freshly-restored idle sessions. ESC[2J (clear screen),
    // ESC[3J (clear scrollback), ESC[H (cursor home).
    this.emitter?.emit('onSessionOutput', { sessionId, data: '\x1b[2J\x1b[3J\x1b[H' });
    this.notifyOutputSubscribers(sessionId, '\x1b[2J\x1b[3J\x1b[H');
    session.metadata.status = 'exited';
    this.persistState();
    this.emitter?.emit('onSessionUpdated', session.metadata);
    return true;
  }

  async restartSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Dispose the outgoing classifier BEFORE destroy so the old PTY's exit
    // isn't emitted as a spurious state change during restart. wireCliManager
    // installs a fresh one below.
    this.classifiers.get(sessionId)?.dispose();
    this.classifiers.delete(sessionId);

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

    const isShell = session.metadata.kind === 'shell';

    // Resolve provider from stored providerId (backward compat: missing = 'claude').
    // Shell sessions have no provider.
    let restartProvider: IProvider | undefined;
    if (!isShell) {
      const restartProviderId = session.metadata.providerId ?? 'claude';
      try {
        restartProvider = this.providerRegistry?.get(restartProviderId);
      } catch {
        console.warn(`[SessionManager] Provider '${restartProviderId}' not found on restart, using no provider`);
        restartProvider = undefined;
      }
    }

    // Create new CLI manager with the same starting options the session was
    // launched with — model and launchMode are read back from metadata so a
    // restart doesn't silently downgrade an 'agents'-mode or explicit-model
    // session to a plain default.
    const cliManager = new CLIManager({
      workingDirectory: session.metadata.workingDirectory,
      permissionMode: session.metadata.permissionMode,
      model: session.metadata.model,
      enableAgentTeams: this.agentTeamsGetter?.() ?? true,
      provider: restartProvider,
      launchMode: session.metadata.launchMode,
      kind: session.metadata.kind,
    });

    // Point the session at the new manager BEFORE wiring, so the callbacks'
    // manager-identity guard recognises this manager as the current one.
    session.cliManager = cliManager;

    // Same wiring the create path uses — including the scrollback append this
    // path used to omit, so a client attaching after a restart sees output.
    this.wireCliManager(cliManager, sessionId);

    session.metadata.status = 'starting';
    session.metadata.exitCode = undefined;
    session.metadata.error = undefined;
    session.metadata.currentModel = undefined; // Clear stale detected model — Phase 1 will re-detect
    this.emitActivityState(sessionId, 'initializing', 'restart'); // clear stale activity state in the UI

    try {
      if (isShell) {
        await cliManager.spawnShellSession();
      } else {
        await cliManager.spawn();
      }
      // Only claim 'running' once the PTY actually spawned. onExit may have
      // already moved us to 'exited'/'error' (crash-on-launch during restart);
      // don't overwrite that with a false 'running'. Mirrors createSession.
      if (session.metadata.status === 'starting') {
        session.metadata.status = 'running';
      }
    } catch (err) {
      session.metadata.status = 'error';
      session.metadata.error = err instanceof Error ? err.message : String(err);
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

  /** Type (never submit) the session's one-shot initialPrompt into the PTY.
   *  Called at CLI readiness from the renderer; clearing the prompt BEFORE
   *  writing makes the seed idempotent across desktop + remote renderers. */
  seedInitialPrompt(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    const prompt = session?.metadata.initialPrompt;
    if (!session || !prompt || !session.cliManager) return;
    session.metadata.initialPrompt = undefined;
    session.cliManager.write(prompt); // no trailing \r — the user reviews and submits
    this.emitter?.emit('onSessionUpdated', session.metadata);
  }

  // Session I/O methods
  sendInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.cliManager) {
      session.cliManager.write(data);
      // Typing into a bell-flagged session is the acknowledgement — the user
      // is here. Clear the attention state so the cockpit stops surfacing it
      // and the next bell can alert again. (Agent-only: shells never carry a
      // bell-derived awaiting-input.)
      if (
        session.metadata.kind !== 'shell' &&
        session.metadata.activityState === 'awaiting-input'
      ) {
        this.emitActivityState(sessionId, 'working', 'input');
        // Same cache-truthfulness concern as the bell path above.
        this.classifiers.get(sessionId)?.syncExternalState('working');
      }
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
    for (const classifier of this.classifiers.values()) {
      classifier.dispose();
    }
    this.classifiers.clear();
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

  /** Alternative cleanup path: explicitly unsubscribe a callback from session output. */
  unsubscribeFromOutput(sessionId: string, callback: (data: string) => void): void {
    const subs = this.outputSubscribers.get(sessionId);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) {
        this.outputSubscribers.delete(sessionId);
      }
    }
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
