/**
 * SharingManager — host and observer WebSocket lifecycle, frame encoding/decoding,
 * observer management, control handoff, and settings persistence for the Session
 * Sharing domain.
 *
 * Architecture: `SharingManager` follows the same constructor-injection pattern as
 * `TunnelManager`. It receives `SessionManager` (for output subscriptions and PTY
 * input), `TunnelManager` (for API key / account info), and `IPCEmitter` (for
 * push events to the renderer).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { CONFIG_DIR } from './config-dir';
import { IPCEmitter } from './ipc-emitter';
import type { SessionManager } from './session-manager';
import type { TunnelManager } from './tunnel-manager';
import type {
  ShareInfo,
  ShareStatus,
  ObserverInfo,
  ObserverRole,
  StartShareRequest,
  JoinShareRequest,
  SessionMetadataFrame,
  ShareOperationResult,
  SharingSettings,
  ObserverJoinedEvent,
  ObserverLeftEvent,
  ControlRequestedEvent,
  ControlGrantedEvent,
  ControlRevokedEvent,
  ShareStoppedEvent,
  ShareOutputEvent,
  ShareMetadataEvent,
} from '../shared/types/sharing-types';

// ── Constants ──────────────────────────────────────────────────────────────────

const SETTINGS_FILE = path.join(CONFIG_DIR, 'sharing-settings.json');
const API_BASE_URL = 'https://api.launchtunnel.dev/api';

/** Maximum number of terminal lines retained in the scrollback ring buffer. */
const SCROLLBACK_MAX_LINES = 5000;

/** Metadata broadcast interval in milliseconds. */
const METADATA_INTERVAL_MS = 2000;

/** Keepalive ping interval in milliseconds. */
const PING_INTERVAL_MS = 30_000;

/** Pong timeout in milliseconds — if no Pong received within this window, drop. */
const PONG_TIMEOUT_MS = 10_000;

/** Auto-reconnect backoff delays (ms) for observer role. */
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 30_000];

/** Maximum observer reconnect attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 5;

// ── Frame type constants ───────────────────────────────────────────────────────

const FRAME_TERMINAL_DATA    = 0x10; // Host -> Observer: raw terminal output
const FRAME_TERMINAL_INPUT   = 0x11; // Observer -> Host: raw terminal input (control only)
const FRAME_METADATA         = 0x12; // Host -> Observer: JSON SessionMetadataFrame
const FRAME_SCROLLBACK       = 0x13; // Host -> Observer: compressed scrollback buffer
const FRAME_CONTROL_REQUEST  = 0x14; // Observer -> Host: request control
const FRAME_CONTROL_GRANT    = 0x15; // Host -> Observer: grant control
const FRAME_CONTROL_REVOKE   = 0x16; // Host -> Observer: revoke control
const FRAME_OBSERVER_ANNOUNCE = 0x17; // Observer -> Host: announce on join
const FRAME_OBSERVER_LIST    = 0x18; // Host -> Observer: current observer list on join
const FRAME_SHARE_CLOSE      = 0x19; // Host -> Observer: share ending
const FRAME_PING             = 0x1A; // Bidirectional: keepalive
const FRAME_PONG             = 0x1B; // Bidirectional: keepalive response

// ── Internal state interfaces ──────────────────────────────────────────────────

interface HostShareState {
  shareInfo: ShareInfo;
  ws: ReturnType<typeof createWebSocket>;
  scrollbackBuffer: string[];  // Ring buffer, max SCROLLBACK_MAX_LINES lines
  metadataInterval: ReturnType<typeof setInterval>;
  pingInterval: ReturnType<typeof setInterval>;
  pongTimer: ReturnType<typeof setTimeout> | null;
  unsubscribeOutput: () => void;
  currentMetadata: Partial<SessionMetadataFrame>;
}

interface ObserverShareState {
  shareCode: string;
  shareId: string;
  ws: ReturnType<typeof createWebSocket> | null;
  sessionName: string;
  role: ObserverRole;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  displayName: string;
  wsEndpoint: string;
  password?: string;
}

// ── Minimal WebSocket wrapper type ────────────────────────────────────────────

/** We use Node.js built-in 'ws' WebSocket. Type the minimal surface we use. */
export interface WsSocket {
  readyState: number;
  send(data: Buffer | string, cb?: (err?: Error) => void): void;
  close(): void;
  terminate(): void;
  on(event: 'message', listener: (data: Buffer) => void): this;
  on(event: 'open', listener: () => void): this;
  on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
}

/** Factory — separated so tests can inject a mock WebSocket constructor. */
type WsConstructor = new (url: string, options?: Record<string, unknown>) => WsSocket;

/**
 * Module-level WebSocket factory. Tests can override this via
 * `SharingManager._setWsFactory()` to inject a mock.
 */
let _wsFactory: ((url: string, options?: Record<string, unknown>) => WsSocket) | null = null;

/**
 * Lazy-load 'ws' at runtime (available via Electron's bundled Node.js).
 * Supports both the `module.exports = WebSocket` style (ws v7) and the
 * named export style (ws v8+: `module.exports.WebSocket`).
 */
function createWebSocket(url: string, options?: Record<string, unknown>): WsSocket {
  if (_wsFactory) return _wsFactory(url, options);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const wsModule = require('ws');
  // ws v8 exports as wsModule.WebSocket; ws v7 exports the class directly.
  const WS: WsConstructor = wsModule.WebSocket ?? wsModule.default ?? wsModule;
  return new WS(url, options);
}

// ── Default settings ───────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: SharingSettings = {
  displayName: 'OmniDesk User',
  autoExpireMs: undefined,
};

// ── Frame encoder / decoder ───────────────────────────────────────────────────

/**
 * Frame layout:
 *   Byte 0: Type (1 byte)
 *   Byte 1: Flags (1 byte, currently reserved — always 0x00)
 *   Bytes 2-5: StreamID (4 bytes, big-endian uint32, currently always 0x00000001)
 *   Bytes 6+: Payload (variable)
 */
function encodeFrame(type: number, payload: Buffer | string = Buffer.alloc(0)): Buffer {
  const payloadBuf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf-8');
  const frame = Buffer.allocUnsafe(6 + payloadBuf.byteLength);
  frame.writeUInt8(type, 0);
  frame.writeUInt8(0x00, 1);           // flags
  frame.writeUInt32BE(0x00000001, 2);  // streamId = 1
  payloadBuf.copy(frame, 6);
  return frame;
}

interface DecodedFrame {
  type: number;
  flags: number;
  streamId: number;
  payload: Buffer;
}

function decodeFrame(data: Buffer): DecodedFrame | null {
  if (data.byteLength < 6) return null;
  return {
    type: data.readUInt8(0),
    flags: data.readUInt8(1),
    streamId: data.readUInt32BE(2),
    payload: data.slice(6),
  };
}

// ── Metadata extraction helpers ───────────────────────────────────────────────

/**
 * Patterns for detecting active tool from terminal output.
 * Mirrors the patterns used in `message-parser.ts` for agent teams.
 */
const TOOL_PATTERNS: Array<[string, RegExp]> = [
  ['Edit',      /\bEdit\b|\bediting\b/i],
  ['Bash',      /\bBash\b|\bRunning\b|\bshell\b/i],
  ['Read',      /\bRead\b|\breading file\b/i],
  ['Write',     /\bWrite\b|\bwriting\b/i],
  ['Search',    /\bSearch\b|\bsearching\b/i],
  ['Grep',      /\bGrep\b/i],
  ['Glob',      /\bGlob\b/i],
  ['WebFetch',  /\bWebFetch\b|\bfetching\b/i],
  ['Task',      /\bTask\b|\bsubagent\b/i],
];

/** Regex to extract a file path from a line of terminal output. */
const FILE_PATH_RE = /(?:^|\s)((?:\/[^\s/]+)+(?:\.[^\s]+)?|(?:\w:[\\/][^\s]+))/;

/** Detects the active tool from a chunk of terminal output. Returns undefined if no match. */
function detectTool(output: string): string | undefined {
  for (const [tool, re] of TOOL_PATTERNS) {
    if (re.test(output)) return tool;
  }
  return undefined;
}

/** Extracts a file path from terminal output, if present. */
function extractFilePath(output: string): string | undefined {
  const m = FILE_PATH_RE.exec(output);
  return m ? m[1] : undefined;
}

/**
 * Derives agent status from recent output and activity patterns.
 * "thinking" — output present but no tool detected (Claude is processing)
 * "writing"  — Edit tool active
 * "reading"  — Read tool active
 * "idle"     — no recent output
 */
function deriveAgentStatus(tool: string | undefined, hasOutput: boolean): string {
  if (!hasOutput) return 'idle';
  if (tool === 'Edit' || tool === 'Write') return 'writing';
  if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') return 'reading';
  return 'thinking';
}

// ── SharingManager ────────────────────────────────────────────────────────────

export class SharingManager {
  /**
   * Override the WebSocket factory for testing.
   * Pass `null` to restore the default (lazy-loaded `ws` package).
   */
  static _setWsFactory(
    factory: ((url: string, options?: Record<string, unknown>) => WsSocket) | null
  ): void {
    _wsFactory = factory;
  }

  private sessionManager: SessionManager;
  private tunnelManager: TunnelManager;
  private emitter: IPCEmitter | null;

  // Host-side share state: sessionId -> HostShareState
  private activeShares: Map<string, HostShareState> = new Map();

  // Observer-side state: shareCode -> ObserverShareState
  private observedShares: Map<string, ObserverShareState> = new Map();

  // Settings
  private settings: SharingSettings = { ...DEFAULT_SETTINGS };
  private settingsLoaded = false;

  constructor(
    sessionManager: SessionManager,
    tunnelManager: TunnelManager,
    emitter: IPCEmitter | null = null
  ) {
    this.sessionManager = sessionManager;
    this.tunnelManager = tunnelManager;
    this.emitter = emitter;
    this.loadSettings();

    // Auto-stop shares when sessions end
    this.sessionManager.onSessionEnd((sessionId) => {
      if (this.activeShares.has(sessionId)) {
        this.stopShare(sessionId).catch((err) => {
          console.error('[SharingManager] Failed to auto-stop share on session end:', err);
        });
      }
    });
  }

  setEmitter(emitter: IPCEmitter): void {
    this.emitter = emitter;
  }

  // ── Settings persistence ─────────────────────────────────────────────────────

  private ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  private loadSettings(): void {
    if (this.settingsLoaded) return;
    this.settingsLoaded = true;
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        const saved = JSON.parse(raw) as Partial<SharingSettings>;
        this.settings = { ...DEFAULT_SETTINGS, ...saved };
      }
    } catch (err) {
      console.error('[SharingManager] Failed to load settings:', err);
    }
  }

  private saveSettings(): void {
    try {
      this.ensureConfigDir();
      const tmp = `${SETTINGS_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.settings, null, 2), 'utf-8');
      fs.renameSync(tmp, SETTINGS_FILE);
    } catch (err) {
      console.error('[SharingManager] Failed to save settings:', err);
    }
  }

  getSettings(): SharingSettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<SharingSettings>): SharingSettings {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
    return { ...this.settings };
  }

  // ── Subscription eligibility ──────────────────────────────────────────────────

  async checkEligibility(): Promise<{ eligible: boolean; reason?: string; plan?: string }> {
    try {
      const account = await this.tunnelManager.getAccount();
      if (!account) {
        return { eligible: false, reason: 'No LaunchTunnel account connected', plan: undefined };
      }
      const isPro = account.plan === 'pro' || account.plan === 'team' || account.plan === 'enterprise';
      if (!isPro) {
        return {
          eligible: false,
          reason: 'Session sharing requires a LaunchTunnel Pro subscription',
          plan: account.plan,
        };
      }
      return { eligible: true, plan: account.plan };
    } catch (err) {
      console.error('[SharingManager] checkEligibility error:', err);
      return { eligible: false, reason: 'Failed to verify subscription status', plan: undefined };
    }
  }

  // ── REST API helpers ──────────────────────────────────────────────────────────

  private getApiKey(): string {
    return this.tunnelManager.getSettings().apiKey ?? '';
  }

  private async apiRequest<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    const apiKey = this.getApiKey();
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`API request failed ${method} ${endpoint}: ${response.status} ${text}`);
    }
    return response.json() as Promise<T>;
  }

  // ── Host: start sharing ───────────────────────────────────────────────────────

  async startShare(request: StartShareRequest): Promise<ShareInfo> {
    const { sessionId, password, expiresInMs } = request;

    // 1. Validate session exists and is running
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.status !== 'running') {
      throw new Error(`Session is not running (status: ${session.status})`);
    }

    // 2. Prevent duplicate shares
    if (this.activeShares.has(sessionId)) {
      throw new Error(`Session is already being shared`);
    }

    // 3. Check subscription eligibility
    const eligibility = await this.checkEligibility();
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason ?? 'Not eligible to share');
    }

    // 4. Create share room via REST API
    interface CreateShareResponse {
      id: string;
      share_code: string;
      share_url: string;
      ws_endpoint: string;
      expires_at?: string;
      has_password: boolean;
    }
    const createBody = {
      session_name: session.name,
      password: password ?? undefined,
      expires_in_ms: expiresInMs ?? this.settings.autoExpireMs ?? undefined,
    };

    let rawResponse: { share: CreateShareResponse };
    try {
      rawResponse = await this.apiRequest<{ share: CreateShareResponse }>(
        'POST', '/v1/shares', createBody
      );
    } catch (err) {
      // If we hit the concurrent share room limit, try cleaning up orphaned
      // rooms from previous sessions that weren't properly deleted, then retry.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('TIER_LIMIT_EXCEEDED')) {
        const cleaned = await this.cleanupStaleShares();
        if (cleaned > 0) {
          console.log(`[SharingManager] Cleaned ${cleaned} stale share room(s), retrying create`);
          rawResponse = await this.apiRequest<{ share: CreateShareResponse }>(
            'POST', '/v1/shares', createBody
          );
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    const apiResponse = rawResponse.share;

    const shareId = apiResponse.id;
    const shareCode = apiResponse.share_code;
    const shareUrl = apiResponse.share_url;
    const wsEndpoint = apiResponse.ws_endpoint;
    const expiresAt = apiResponse.expires_at;

    // 5. Build initial ShareInfo
    const shareInfo: ShareInfo = {
      shareId,
      shareCode,
      shareUrl,
      sessionId,
      status: 'creating' as ShareStatus,
      createdAt: new Date().toISOString(),
      expiresAt,
      hasPassword: !!password,
      observers: [],
    };

    // 6. Open WebSocket to relay
    const apiKey = this.getApiKey();
    const wsUrl = `${wsEndpoint}?share_id=${encodeURIComponent(shareId)}&role=host&token=${encodeURIComponent(apiKey)}`;
    const ws = createWebSocket(wsUrl);

    // 7. Initialize scrollback buffer
    const scrollbackBuffer: string[] = [];

    // 8. Track per-session metadata state
    const currentMetadata: Partial<SessionMetadataFrame> = {};
    let hasRecentOutput = false;

    // 9. Subscribe to session PTY output
    const unsubscribeOutput = this.sessionManager.subscribeToOutput(sessionId, (data) => {
      this.broadcastOutput(sessionId, data);
      hasRecentOutput = true;

      // Update metadata heuristics
      const tool = detectTool(data);
      if (tool) currentMetadata.tool = tool;
      const filePath = extractFilePath(data);
      if (filePath) currentMetadata.filePath = filePath;
    });

    // 10. Periodic metadata broadcast
    const metadataInterval = setInterval(() => {
      const share = this.activeShares.get(sessionId);
      if (!share || share.ws.readyState !== 1 /* OPEN */) return;

      const frame: SessionMetadataFrame = {
        type: 'metadata',
        timestamp: Date.now(),
        tool: currentMetadata.tool,
        filePath: currentMetadata.filePath,
        agentStatus: deriveAgentStatus(currentMetadata.tool, hasRecentOutput),
        model: session.currentModel ?? undefined,
        providerId: session.providerId ?? undefined,
      };
      hasRecentOutput = false; // Reset after reading

      const payload = Buffer.from(JSON.stringify(frame), 'utf-8');
      share.ws.send(encodeFrame(FRAME_METADATA, payload));
    }, METADATA_INTERVAL_MS);

    // 11. Keepalive ping
    const { pingInterval, pongTimer: initialPongTimer } = this.startKeepalive(ws, sessionId);

    // 12. Build state object and store it
    const state: HostShareState = {
      shareInfo,
      ws,
      scrollbackBuffer,
      metadataInterval,
      pingInterval,
      pongTimer: initialPongTimer,
      unsubscribeOutput,
      currentMetadata,
    };
    this.activeShares.set(sessionId, state);

    // 13. Wire WebSocket message handler
    ws.on('message', (data: Buffer) => {
      this.onHostFrame(sessionId, data);
    });

    ws.on('open', () => {
      const share = this.activeShares.get(sessionId);
      if (share) {
        share.shareInfo.status = 'active';
      }
    });

    ws.on('error', (err) => {
      console.error(`[SharingManager] Host WebSocket error for session ${sessionId}:`, err);
    });

    ws.on('close', () => {
      // If close was unexpected (not initiated by stopShare), clean up
      if (this.activeShares.has(sessionId)) {
        const share = this.activeShares.get(sessionId);
        if (share) {
          share.shareInfo.status = 'error';
          this.cleanupHostShare(sessionId);
        }
      }
    });

    shareInfo.status = 'active';

    // Notify all renderer hook instances about the new share
    this.emitter?.emit('onShareStarted', { sessionId, shareInfo });

    return shareInfo;
  }

  // ── Host: broadcast output ────────────────────────────────────────────────────

  broadcastOutput(sessionId: string, data: string): void {
    const share = this.activeShares.get(sessionId);
    if (!share) return;

    // Append to scrollback ring buffer
    const newLines = data.split('\n');
    for (const line of newLines) {
      share.scrollbackBuffer.push(line);
    }
    // Trim ring buffer to max size
    if (share.scrollbackBuffer.length > SCROLLBACK_MAX_LINES) {
      share.scrollbackBuffer.splice(0, share.scrollbackBuffer.length - SCROLLBACK_MAX_LINES);
    }

    // Encode and send TerminalData frame if WebSocket is open
    if (share.ws.readyState === 1 /* OPEN */) {
      const payload = Buffer.from(data, 'utf-8');
      share.ws.send(encodeFrame(FRAME_TERMINAL_DATA, payload));
    }
  }

  // ── Host: stop sharing ────────────────────────────────────────────────────────

  async stopShare(sessionId: string): Promise<ShareOperationResult> {
    const share = this.activeShares.get(sessionId);
    if (!share) {
      return { success: false, message: 'Session is not being shared', errorCode: 'SESSION_NOT_FOUND' };
    }

    share.shareInfo.status = 'stopping';
    const shareCode = share.shareInfo.shareCode;

    try {
      // Send ShareClose frame to observers
      if (share.ws.readyState === 1 /* OPEN */) {
        const payload = Buffer.from(JSON.stringify({ reason: 'host-stopped', message: 'Host ended the session' }), 'utf-8');
        share.ws.send(encodeFrame(FRAME_SHARE_CLOSE, payload));
      }

      // Delete share room on server
      await this.apiRequest('DELETE', `/v1/shares/${share.shareInfo.shareId}`).catch((err) => {
        console.warn('[SharingManager] Failed to delete share room on server:', err);
      });
    } finally {
      this.cleanupHostShare(sessionId);
    }

    // Notify renderer so all hook instances remove this share from their state
    this.emitter?.emit('onShareStopped', { shareCode, reason: 'host-stopped', message: 'Host ended the session' } as ShareStoppedEvent);

    return { success: true, message: 'Sharing stopped' };
  }

  private cleanupHostShare(sessionId: string): void {
    const share = this.activeShares.get(sessionId);
    if (!share) return;

    // Fire-and-forget server-side DELETE to release the share room.
    // This prevents orphaned rooms when cleanup is triggered by app shutdown,
    // unexpected WebSocket close, or keepalive pong timeout.
    // If stopShare() already deleted it, the 404 is silently caught.
    const shareId = share.shareInfo.shareId;
    if (shareId) {
      this.apiRequest('DELETE', `/v1/shares/${shareId}`).catch(() => {
        // Best-effort — ignore errors (room may already be deleted)
      });
    }

    clearInterval(share.metadataInterval);
    clearInterval(share.pingInterval);
    if (share.pongTimer) clearTimeout(share.pongTimer);
    share.unsubscribeOutput();

    try {
      share.ws.close();
    } catch {
      // ignore
    }

    this.activeShares.delete(sessionId);
  }

  // ── Host: get share info / list ───────────────────────────────────────────────

  getShareInfo(sessionId: string): ShareInfo | null {
    return this.activeShares.get(sessionId)?.shareInfo ?? null;
  }

  listActiveShares(): ShareInfo[] {
    return Array.from(this.activeShares.values()).map((s) => ({ ...s.shareInfo }));
  }

  /**
   * Attempt to list server-side share rooms and delete any that are not tracked
   * locally (orphans from crashes / unclean shutdowns). Returns the number of
   * stale rooms deleted. If the API doesn't support listing, returns 0.
   */
  async cleanupStaleShares(): Promise<number> {
    interface ServerShare { id: string }
    let serverShares: ServerShare[];
    try {
      const response = await this.apiRequest<{ shares: ServerShare[] }>('GET', '/v1/shares');
      serverShares = response.shares ?? [];
    } catch {
      // API may not support listing — nothing we can do
      return 0;
    }

    const localShareIds = new Set(
      Array.from(this.activeShares.values()).map((s) => s.shareInfo.shareId)
    );

    let deleted = 0;
    for (const share of serverShares) {
      if (!localShareIds.has(share.id)) {
        try {
          await this.apiRequest('DELETE', `/v1/shares/${share.id}`);
          deleted++;
        } catch {
          // Best-effort — skip if individual delete fails
        }
      }
    }
    return deleted;
  }

  // ── Host: observer management ─────────────────────────────────────────────────

  async kickObserver(sessionId: string, observerId: string): Promise<ShareOperationResult> {
    const share = this.activeShares.get(sessionId);
    if (!share) {
      return { success: false, message: 'Session is not being shared', errorCode: 'SESSION_NOT_FOUND' };
    }

    try {
      await this.apiRequest('POST', `/v1/shares/${share.shareInfo.shareId}/kick`, { observerId });
    } catch (err) {
      console.error('[SharingManager] Failed to kick observer via API:', err);
    }

    // Remove observer from local state
    share.shareInfo.observers = share.shareInfo.observers.filter((o) => o.observerId !== observerId);

    const event: ObserverLeftEvent = {
      sessionId,
      shareId: share.shareInfo.shareId,
      observerId,
    };
    this.emitter?.emit('onObserverLeft', event);

    return { success: true, message: 'Observer kicked' };
  }

  // ── Host: control management ──────────────────────────────────────────────────

  async grantControl(sessionId: string, observerId: string): Promise<ShareOperationResult> {
    const share = this.activeShares.get(sessionId);
    if (!share) {
      return { success: false, message: 'Session is not being shared', errorCode: 'SESSION_NOT_FOUND' };
    }

    const observer = share.shareInfo.observers.find((o) => o.observerId === observerId);
    if (!observer) {
      return { success: false, message: 'Observer not found', errorCode: 'UNKNOWN' };
    }

    // Revoke control from any observer currently holding it
    for (const obs of share.shareInfo.observers) {
      if (obs.role === 'has-control') {
        obs.role = 'read-only';
      }
    }

    observer.role = 'has-control';

    if (share.ws.readyState === 1 /* OPEN */) {
      const payload = Buffer.from(JSON.stringify({ observerId }), 'utf-8');
      share.ws.send(encodeFrame(FRAME_CONTROL_GRANT, payload));
    }

    return { success: true, message: 'Control granted' };
  }

  async revokeControl(sessionId: string, observerId: string): Promise<ShareOperationResult> {
    const share = this.activeShares.get(sessionId);
    if (!share) {
      return { success: false, message: 'Session is not being shared', errorCode: 'SESSION_NOT_FOUND' };
    }

    const observer = share.shareInfo.observers.find((o) => o.observerId === observerId);
    if (observer) {
      observer.role = 'read-only';
    }

    if (share.ws.readyState === 1 /* OPEN */) {
      const payload = Buffer.from(JSON.stringify({ observerId, reason: 'host-revoked' }), 'utf-8');
      share.ws.send(encodeFrame(FRAME_CONTROL_REVOKE, payload));
    }

    return { success: true, message: 'Control revoked' };
  }

  // ── Host: incoming frame handler ──────────────────────────────────────────────

  private onHostFrame(sessionId: string, data: Buffer): void {
    const frame = decodeFrame(data);
    if (!frame) return;

    const share = this.activeShares.get(sessionId);
    if (!share) return;

    switch (frame.type) {
      case FRAME_OBSERVER_ANNOUNCE: {
        try {
          const payload = JSON.parse(frame.payload.toString('utf-8')) as {
            observerId: string;
            displayName: string;
          };
          const observer: ObserverInfo = {
            observerId: payload.observerId,
            displayName: payload.displayName,
            role: 'read-only',
            joinedAt: new Date().toISOString(),
          };
          share.shareInfo.observers.push(observer);

          // Send scrollback buffer to the new observer (gzip compressed)
          this.sendScrollbackToObserver(share);

          // Send current observer list
          const listPayload = Buffer.from(JSON.stringify({ observers: share.shareInfo.observers }), 'utf-8');
          share.ws.send(encodeFrame(FRAME_OBSERVER_LIST, listPayload));

          const event: ObserverJoinedEvent = {
            sessionId,
            shareId: share.shareInfo.shareId,
            observer,
          };
          this.emitter?.emit('onObserverJoined', event);
        } catch (err) {
          console.error('[SharingManager] Failed to parse ObserverAnnounce frame:', err);
        }
        break;
      }

      case FRAME_CONTROL_REQUEST: {
        try {
          const payload = JSON.parse(frame.payload.toString('utf-8')) as {
            observerId: string;
            displayName: string;
          };

          // Update role to 'requesting'
          const observer = share.shareInfo.observers.find((o) => o.observerId === payload.observerId);
          if (observer) {
            observer.role = 'requesting';
          }

          const event: ControlRequestedEvent = {
            sessionId,
            shareId: share.shareInfo.shareId,
            observerId: payload.observerId,
            observerName: payload.displayName,
          };
          this.emitter?.emit('onControlRequested', event);
        } catch (err) {
          console.error('[SharingManager] Failed to parse ControlRequest frame:', err);
        }
        break;
      }

      case FRAME_TERMINAL_INPUT: {
        // Input forwarding: validate that the sender has control
        const controlledObserver = share.shareInfo.observers.find((o) => o.role === 'has-control');
        if (!controlledObserver) {
          // No one has control — silently drop
          break;
        }

        let inputData = frame.payload.toString('utf-8');

        // CRITICAL: Strip Ctrl+C (\x03) bytes — never forward to PTY
        // This is the same safety rule as Terminal.tsx and CLIManager
        inputData = inputData.replace(/\x03/g, '');

        if (inputData.length > 0) {
          this.sessionManager.sendInput(sessionId, inputData);
        }
        break;
      }

      case FRAME_PONG: {
        // Cancel the pong timeout
        if (share.pongTimer) {
          clearTimeout(share.pongTimer);
          share.pongTimer = null;
        }
        break;
      }

      default:
        // Unknown frame types are silently ignored
        break;
    }
  }

  // ── Host: scrollback ─────────────────────────────────────────────────────────

  private sendScrollbackToObserver(share: HostShareState): void {
    if (share.scrollbackBuffer.length === 0) return;
    if (share.ws.readyState !== 1 /* OPEN */) return;

    const scrollbackText = share.scrollbackBuffer.join('\n');
    try {
      const compressed = zlib.gzipSync(Buffer.from(scrollbackText, 'utf-8'));
      share.ws.send(encodeFrame(FRAME_SCROLLBACK, compressed));
    } catch (err) {
      console.error('[SharingManager] Failed to compress/send scrollback:', err);
    }
  }

  // ── Keepalive ─────────────────────────────────────────────────────────────────

  private startKeepalive(
    ws: WsSocket,
    sessionId: string
  ): { pingInterval: ReturnType<typeof setInterval>; pongTimer: ReturnType<typeof setTimeout> | null } {
    let pongTimer: ReturnType<typeof setTimeout> | null = null;

    const pingInterval = setInterval(() => {
      if (ws.readyState !== 1 /* OPEN */) return;

      ws.send(encodeFrame(FRAME_PING));

      // Start pong timeout
      pongTimer = setTimeout(() => {
        console.warn(`[SharingManager] Pong timeout for session ${sessionId} — closing WebSocket`);
        ws.terminate?.();
        this.cleanupHostShare(sessionId);
      }, PONG_TIMEOUT_MS);

      // Store updated pongTimer in the share state
      const share = this.activeShares.get(sessionId);
      if (share) {
        if (share.pongTimer) clearTimeout(share.pongTimer);
        share.pongTimer = pongTimer;
      }
    }, PING_INTERVAL_MS);

    return { pingInterval, pongTimer };
  }

  // ── Observer: join share ──────────────────────────────────────────────────────

  async joinShare(request: JoinShareRequest): Promise<ShareOperationResult> {
    const { codeOrUrl, password, displayName } = request;

    // Extract share code from URL or use as-is
    const shareCode = extractShareCode(codeOrUrl);
    if (!shareCode) {
      return { success: false, message: 'Invalid share code or URL', errorCode: 'INVALID_CODE' };
    }

    // Prevent duplicate joins
    if (this.observedShares.has(shareCode)) {
      return { success: false, message: 'Already joined this session', errorCode: 'ALREADY_SHARED' };
    }

    // Resolve code to connection info
    interface ResolveResponse {
      share_id: string;
      ws_endpoint: string;
      requires_password: boolean;
      session_name: string;
    }

    let resolveData: ResolveResponse;
    try {
      resolveData = await this.apiRequest<ResolveResponse>(
        'GET',
        `/v1/shares/${encodeURIComponent(shareCode)}/resolve`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404')) {
        return { success: false, message: 'Share code not found', errorCode: 'INVALID_CODE' };
      }
      if (msg.includes('410')) {
        return { success: false, message: 'Share has expired', errorCode: 'SESSION_EXPIRED' };
      }
      return { success: false, message: `Failed to resolve share: ${msg}`, errorCode: 'NETWORK_ERROR' };
    }

    if (resolveData.requires_password && !password) {
      return { success: false, message: 'Password required', errorCode: 'PASSWORD_REQUIRED' };
    }

    // Initialize observer state
    const state: ObserverShareState = {
      shareCode,
      shareId: resolveData.share_id,
      ws: null,
      sessionName: resolveData.session_name,
      role: 'read-only',
      reconnectAttempts: 0,
      reconnectTimer: null,
      displayName,
      wsEndpoint: resolveData.ws_endpoint,
      password,
    };
    this.observedShares.set(shareCode, state);

    // Open the WebSocket connection
    this.connectObserverWebSocket(shareCode, password);

    return { success: true, message: 'Joined session' };
  }

  private connectObserverWebSocket(shareCode: string, password?: string): void {
    const state = this.observedShares.get(shareCode);
    if (!state) return;

    const apiKey = this.getApiKey();
    const params = new URLSearchParams({
      share_id: state.shareId,
      role: 'observer',
      token: apiKey,
    });
    if (password) params.set('password', password);
    const wsUrl = `${state.wsEndpoint}?${params.toString()}`;

    const ws = createWebSocket(wsUrl);
    state.ws = ws;

    ws.on('open', () => {
      // Reset reconnect counter on successful connection
      state.reconnectAttempts = 0;

      // Send ObserverAnnounce frame
      const announcePayload = Buffer.from(
        JSON.stringify({ observerId: 'local', displayName: state.displayName }),
        'utf-8'
      );
      ws.send(encodeFrame(FRAME_OBSERVER_ANNOUNCE, announcePayload));
    });

    ws.on('message', (data: Buffer) => {
      this.onObserverFrame(shareCode, data);
    });

    ws.on('error', (err) => {
      console.error(`[SharingManager] Observer WebSocket error for ${shareCode}:`, err);
    });

    ws.on('close', (code) => {
      const currentState = this.observedShares.get(shareCode);
      if (!currentState) return;

      // If we still have this share tracked, try to reconnect
      if (code !== 1000 /* Normal closure */ && currentState.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delayMs = RECONNECT_DELAYS_MS[Math.min(currentState.reconnectAttempts, RECONNECT_DELAYS_MS.length - 1)];
        currentState.reconnectAttempts++;
        console.log(`[SharingManager] Observer WebSocket closed (${code}), reconnecting in ${delayMs}ms (attempt ${currentState.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

        currentState.reconnectTimer = setTimeout(() => {
          this.connectObserverWebSocket(shareCode, currentState.password);
        }, delayMs);
      } else if (currentState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        // Give up — emit share stopped event
        const event: ShareStoppedEvent = {
          shareCode,
          reason: 'error',
          message: 'Connection lost after maximum reconnect attempts',
        };
        this.emitter?.emit('onShareStopped', event);
        this.observedShares.delete(shareCode);
      }
    });
  }

  // ── Observer: incoming frame handler ─────────────────────────────────────────

  private onObserverFrame(shareCode: string, data: Buffer): void {
    const frame = decodeFrame(data);
    if (!frame) return;

    const state = this.observedShares.get(shareCode);
    if (!state) return;

    switch (frame.type) {
      case FRAME_TERMINAL_DATA: {
        const outputData = frame.payload.toString('utf-8');
        const event: ShareOutputEvent = { shareCode, data: outputData };
        this.emitter?.emit('onShareOutput', event);
        break;
      }

      case FRAME_METADATA: {
        try {
          const metadata = JSON.parse(frame.payload.toString('utf-8')) as SessionMetadataFrame;
          const event: ShareMetadataEvent = { shareCode, metadata };
          this.emitter?.emit('onShareMetadata', event);
        } catch (err) {
          console.error('[SharingManager] Failed to parse Metadata frame:', err);
        }
        break;
      }

      case FRAME_SCROLLBACK: {
        // Decompress gzip payload and emit as initial output
        try {
          const decompressed = zlib.gunzipSync(frame.payload);
          const text = decompressed.toString('utf-8');
          const event: ShareOutputEvent = { shareCode, data: text };
          this.emitter?.emit('onShareOutput', event);
        } catch (err) {
          console.error('[SharingManager] Failed to decompress scrollback:', err);
        }
        break;
      }

      case FRAME_CONTROL_GRANT: {
        state.role = 'has-control';
        const event: ControlGrantedEvent = { shareCode };
        this.emitter?.emit('onControlGranted', event);
        break;
      }

      case FRAME_CONTROL_REVOKE: {
        state.role = 'read-only';
        try {
          const payload = JSON.parse(frame.payload.toString('utf-8')) as { reason: string };
          const reason = (payload.reason as ControlRevokedEvent['reason']) ?? 'host-revoked';
          const event: ControlRevokedEvent = { shareCode, reason };
          this.emitter?.emit('onControlRevoked', event);
        } catch {
          const event: ControlRevokedEvent = { shareCode, reason: 'host-revoked' };
          this.emitter?.emit('onControlRevoked', event);
        }
        break;
      }

      case FRAME_SHARE_CLOSE: {
        try {
          const payload = JSON.parse(frame.payload.toString('utf-8')) as {
            reason: ShareStoppedEvent['reason'];
            message?: string;
          };
          const event: ShareStoppedEvent = {
            shareCode,
            reason: payload.reason ?? 'host-stopped',
            message: payload.message,
          };
          this.emitter?.emit('onShareStopped', event);
        } catch {
          const event: ShareStoppedEvent = { shareCode, reason: 'host-stopped' };
          this.emitter?.emit('onShareStopped', event);
        }
        this.cleanupObserverShare(shareCode);
        break;
      }

      case FRAME_PING: {
        // Respond with Pong
        if (state.ws && state.ws.readyState === 1 /* OPEN */) {
          state.ws.send(encodeFrame(FRAME_PONG));
        }
        break;
      }

      case FRAME_PONG: {
        // Keepalive response — no action needed on observer side
        break;
      }

      case FRAME_OBSERVER_LIST: {
        // Host sent the current observer list on our join — no IPC event needed
        break;
      }

      default:
        break;
    }
  }

  // ── Observer: control request / release ──────────────────────────────────────

  requestControl(shareCode: string): ShareOperationResult {
    const state = this.observedShares.get(shareCode);
    if (!state) {
      return { success: false, message: 'Not joined to this session', errorCode: 'SESSION_NOT_FOUND' };
    }
    if (state.ws?.readyState !== 1 /* OPEN */) {
      return { success: false, message: 'WebSocket not connected', errorCode: 'NETWORK_ERROR' };
    }

    state.role = 'requesting';
    const payload = Buffer.from(
      JSON.stringify({ observerId: 'local', displayName: state.displayName }),
      'utf-8'
    );
    state.ws.send(encodeFrame(FRAME_CONTROL_REQUEST, payload));
    return { success: true, message: 'Control requested' };
  }

  releaseControl(shareCode: string): ShareOperationResult {
    const state = this.observedShares.get(shareCode);
    if (!state) {
      return { success: false, message: 'Not joined to this session', errorCode: 'SESSION_NOT_FOUND' };
    }

    state.role = 'read-only';

    // Send ControlRevoke to let the host know we're releasing
    if (state.ws?.readyState === 1 /* OPEN */) {
      const payload = Buffer.from(
        JSON.stringify({ observerId: 'local', reason: 'observer-released' }),
        'utf-8'
      );
      state.ws.send(encodeFrame(FRAME_CONTROL_REVOKE, payload));
    }

    return { success: true, message: 'Control released' };
  }

  // ── Observer: leave share ─────────────────────────────────────────────────────

  leaveShare(shareCode: string): ShareOperationResult {
    const state = this.observedShares.get(shareCode);
    if (!state) {
      return { success: false, message: 'Not joined to this session', errorCode: 'SESSION_NOT_FOUND' };
    }
    this.cleanupObserverShare(shareCode);
    return { success: true, message: 'Left session' };
  }

  private cleanupObserverShare(shareCode: string): void {
    const state = this.observedShares.get(shareCode);
    if (!state) return;

    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }

    if (state.ws) {
      try {
        state.ws.close();
      } catch {
        // ignore
      }
      state.ws = null;
    }

    this.observedShares.delete(shareCode);
  }

  // ── Cleanup (app shutdown) ────────────────────────────────────────────────────

  destroy(): void {
    // Stop all active host shares
    const sessionIds = Array.from(this.activeShares.keys());
    for (const sessionId of sessionIds) {
      this.cleanupHostShare(sessionId);
    }

    // Leave all observed shares
    const shareCodes = Array.from(this.observedShares.keys());
    for (const shareCode of shareCodes) {
      this.cleanupObserverShare(shareCode);
    }
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Extracts the share code from a share URL or returns the input as-is if it
 * looks like a raw share code (alphanumeric, 4-10 chars).
 */
function extractShareCode(codeOrUrl: string): string | null {
  const trimmed = codeOrUrl.trim();
  if (!trimmed) return null;

  // If it looks like a URL, extract the last path segment
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('omnidesk://')) {
    try {
      const url = new URL(trimmed.replace('omnidesk://', 'https://'));
      const parts = url.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] ?? null;
    } catch {
      return null;
    }
  }

  // Raw share code — validate it's alphanumeric
  if (/^[A-Za-z0-9]{4,10}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return null;
}

// Export frame constants for use in tests
export {
  encodeFrame,
  decodeFrame,
  extractShareCode,
  FRAME_TERMINAL_DATA,
  FRAME_TERMINAL_INPUT,
  FRAME_METADATA,
  FRAME_SCROLLBACK,
  FRAME_CONTROL_REQUEST,
  FRAME_CONTROL_GRANT,
  FRAME_CONTROL_REVOKE,
  FRAME_OBSERVER_ANNOUNCE,
  FRAME_OBSERVER_LIST,
  FRAME_SHARE_CLOSE,
  FRAME_PING,
  FRAME_PONG,
};
