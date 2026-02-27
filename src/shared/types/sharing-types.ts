// ── Share room lifecycle ──

export type ShareStatus = 'creating' | 'active' | 'stopping' | 'stopped' | 'error';
export type ObserverRole = 'read-only' | 'has-control' | 'requesting';

export interface ShareInfo {
  shareId: string;          // Server-assigned UUID
  shareCode: string;        // Human-readable code (e.g., "ABC123")
  shareUrl: string;         // Full URL: https://share.launchtunnel.dev/ABC123
  sessionId: string;        // Local session this share is for
  status: ShareStatus;
  createdAt: string;        // ISO 8601
  expiresAt?: string;       // ISO 8601, if time-limited
  hasPassword: boolean;
  observers: ObserverInfo[];
}

export interface ObserverInfo {
  observerId: string;       // Server-assigned UUID
  displayName: string;      // Observer's OmniDesk display name
  role: ObserverRole;
  joinedAt: string;         // ISO 8601
  ipAddress?: string;       // For host visibility only
}

// ── Requests ──

export interface StartShareRequest {
  sessionId: string;
  password?: string;        // Optional password protection
  expiresInMs?: number;     // Optional expiration (ms from now)
}

export interface JoinShareRequest {
  codeOrUrl: string;        // Share code or full URL
  password?: string;        // If password-protected
  displayName: string;      // Observer's display name
}

// ── Metadata streamed alongside terminal output ──

export interface SessionMetadataFrame {
  type: 'metadata';
  timestamp: number;        // Unix ms
  tool?: string;            // Active tool name (e.g., "Edit", "Bash", "Read")
  filePath?: string;        // File being operated on
  agentStatus?: string;     // "thinking" | "writing" | "reading" | "idle"
  fileChanges?: number;     // Number of files changed in current turn
  model?: string;           // Current model (e.g., "sonnet", "opus")
  providerId?: string;      // Provider in use
}

// ── Operation result (reuses pattern from tunnel domain) ──

export interface ShareOperationResult {
  success: boolean;
  message: string;
  errorCode?: ShareErrorCode;
}

export type ShareErrorCode =
  | 'NOT_SUBSCRIBED'         // No LT Pro subscription
  | 'SESSION_NOT_FOUND'      // Session ID does not exist
  | 'SESSION_NOT_RUNNING'    // Session is not in 'running' status
  | 'ALREADY_SHARED'         // Session is already being shared
  | 'INVALID_CODE'           // Share code does not resolve
  | 'SESSION_EXPIRED'        // Share has expired
  | 'PASSWORD_REQUIRED'      // Password needed but not provided
  | 'PASSWORD_INCORRECT'     // Wrong password
  | 'SHARE_LIMIT_REACHED'    // Too many concurrent shares
  | 'OBSERVER_LIMIT_REACHED' // Too many observers on this share
  | 'NETWORK_ERROR'
  | 'RELAY_ERROR'
  | 'UNKNOWN';

// ── Settings ──

export interface SharingSettings {
  displayName: string;       // Default observer display name
  autoExpireMs?: number;     // Default expiration in ms (undefined = no expiry)
}

// ── IPC Events (main -> renderer) ──

export interface ObserverJoinedEvent {
  sessionId: string;
  shareId: string;
  observer: ObserverInfo;
}

export interface ObserverLeftEvent {
  sessionId: string;
  shareId: string;
  observerId: string;
}

export interface ControlRequestedEvent {
  sessionId: string;
  shareId: string;
  observerId: string;
  observerName: string;
}

export interface ControlGrantedEvent {
  shareCode: string;
}

export interface ControlRevokedEvent {
  shareCode: string;
  reason: 'host-revoked' | 'host-kicked' | 'share-stopped';
}

export interface ShareStartedEvent {
  sessionId: string;
  shareInfo: ShareInfo;
}

export interface ShareStoppedEvent {
  shareCode: string;
  reason: 'host-stopped' | 'expired' | 'subscription-lapsed' | 'error';
  message?: string;
}

export interface ShareOutputEvent {
  shareCode: string;
  data: string;              // Terminal output chunk
}

export interface ShareMetadataEvent {
  shareCode: string;
  metadata: SessionMetadataFrame;
}
