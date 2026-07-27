/**
 * Type definitions for session history feature
 */

/**
 * Metadata for a recorded session in the history index
 */
export interface HistorySessionEntry {
  /** Unique session identifier */
  id: string;
  /** Session display name */
  name: string;
  /** Working directory where session was created */
  workingDirectory: string;
  /** Unix timestamp (ms) when session was created */
  createdAt: number;
  /** Unix timestamp (ms) of last recorded output */
  lastUpdatedAt: number;
  /** Size of session history file in bytes */
  sizeBytes: number;
  /** Number of restart segments (starts at 0) */
  segmentCount: number;
  /**
   * Provider that ran this session (e.g. 'claude', 'codex'); undefined for
   * shell sessions or sessions recorded before this field existed. Persisted
   * so a closed/historical session's digest can eventually resolve the
   * provider's marker patterns for real approval/error counts (issue #230).
   */
  providerId?: string;
}

/**
 * Master index of all recorded sessions
 */
export interface HistoryIndex {
  /** Index file format version */
  version: number;
  /** Map of session ID to metadata */
  sessions: Record<string, HistorySessionEntry>;
}

/**
 * History retention and storage settings
 */
export interface HistorySettings {
  /** Maximum age in days (0 = unlimited) */
  maxAgeDays: number;
  /** Maximum total size in MB (0 = unlimited) */
  maxSizeMB: number;
  /** Enable automatic cleanup on startup */
  autoCleanup: boolean;
}

/**
 * Search result with context
 */
export interface HistorySearchResult {
  /** Session metadata */
  session: HistorySessionEntry;
  /** Number of matches found in this session */
  matchCount: number;
  /** Preview snippets (up to 3) with surrounding context */
  previews: HistorySearchPreview[];
}

/**
 * Search result preview snippet
 */
export interface HistorySearchPreview {
  /** Line number where match was found */
  lineNumber: number;
  /** Text before match (up to 50 chars) */
  before: string;
  /** Matched text */
  match: string;
  /** Text after match (up to 50 chars) */
  after: string;
}

/**
 * Statistics for history storage
 */
export interface HistoryStats {
  /** Total number of recorded sessions */
  totalSessions: number;
  /** Total storage size in bytes */
  totalSizeBytes: number;
  /** Oldest session timestamp (ms) */
  oldestSessionDate: number | null;
  /** Newest session timestamp (ms) */
  newestSessionDate: number | null;
}

/**
 * Per-session activity digest ("while you were away" recap).
 *
 * v1 is computed entirely from persisted metadata (HistorySessionEntry) plus
 * the checkpoint store — it does NOT depend on the live session-state
 * classifier (epic #195), which has no historical/persisted timeline to
 * replay. See SessionDigestService for the computation rules.
 */
export interface SessionDigest {
  /** Session this digest describes */
  sessionId: string;
  /** Start of the window this digest covers (ms, epoch) */
  windowStart: number;
  /** End of the window this digest covers (ms, epoch) */
  windowEnd: number;
  /** windowEnd - windowStart */
  activeDurationMs: number;
  /** Restart segments observed (from HistorySessionEntry.segmentCount) */
  restartSegments: number;
  /** Bytes of recorded output in the window (from sizeBytes) */
  outputBytes: number;
  /** Checkpoints created within the window */
  checkpointsCreated: number;
  /**
   * Best-effort count of approval-prompt markers hit in the window, derived
   * by replaying the session's provider's getStateSignals() patterns over
   * stored raw output. `null` when not derivable (e.g. no persisted provider
   * association for the session) rather than an error.
   */
  approvalPromptsHit: number | null;
  /** Best-effort count of error markers hit in the window; null when not derivable. */
  errorsDetected: number | null;
}

/**
 * JSON export format
 */
export interface HistoryExportJson {
  /** Export format version */
  version: number;
  /** Export timestamp (ISO-8601) */
  exportedAt: string;
  /** Session metadata */
  session: {
    id: string;
    name: string;
    workingDirectory: string;
    createdAt: number;
    lastUpdatedAt: number;
    sizeBytes: number;
  };
  /** Full session output */
  output: string;
}
