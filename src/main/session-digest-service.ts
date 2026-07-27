/**
 * Session Digest Service
 *
 * Computes a "while you were away" activity digest for a recorded session,
 * per issue #226 (epic #225 child-1). v1 is derived entirely from persisted
 * metadata (HistorySessionEntry) and the checkpoint store — it does NOT
 * depend on the live session-state classifier (epic #195), which has no
 * historical/persisted timeline to replay against a closed session.
 */

import type { HistoryManager } from './history-manager';
import type { CheckpointManager } from './checkpoint-manager';
import type { SessionDigest } from '../shared/types/history-types';

/**
 * Compute a SessionDigest for `sessionId`.
 *
 * @param since Optional lower bound (ms, epoch) for the digest window. When
 *   provided, the window start is clamped to the session's `createdAt` (a
 *   `since` before the session existed has no effect), and the window is
 *   never allowed to go negative (a `since` after `lastUpdatedAt` yields a
 *   zero-length window rather than a negative duration).
 *
 * `restartSegments` and `outputBytes` are reported as session-wide totals
 * regardless of `since`: HistorySessionEntry persists only aggregate
 * `segmentCount`/`sizeBytes`, not per-segment or per-byte timestamps, so a
 * `since` window cannot be resolved more finely than "the whole session".
 * This is a documented v1 approximation (see issue #226 Notes).
 *
 * `approvalPromptsHit` and `errorsDetected` are always `null` in v1: marker
 * replay would require knowing which provider's getStateSignals() regex
 * table produced this session's output, but `providerId` is tracked only on
 * live sessions (SessionManager / shared/ipc-types.ts) and is never
 * persisted into HistorySessionEntry or the history index. There is
 * currently no way to recover it for a closed/historical session, so per
 * issue #226's explicit fallback this ships as `null` (best-effort / not
 * derivable) rather than guessing or throwing. Follow-up: persist
 * `providerId` on HistorySessionEntry to unblock real marker replay.
 */
export async function computeSessionDigest(
  historyManager: HistoryManager,
  checkpointManager: CheckpointManager,
  sessionId: string,
  since?: number
): Promise<SessionDigest> {
  const entry = await historyManager.getSessionMetadata(sessionId);
  if (!entry) {
    throw new Error(`Session ${sessionId} not found in history`);
  }

  const windowStart = since !== undefined ? Math.max(since, entry.createdAt) : entry.createdAt;
  const windowEnd = Math.max(windowStart, entry.lastUpdatedAt);
  const activeDurationMs = windowEnd - windowStart;

  const restartSegments = entry.segmentCount;
  const outputBytes = entry.sizeBytes;

  const checkpoints = await checkpointManager.listCheckpoints(sessionId);
  const checkpointsCreated = checkpoints.filter(
    (cp) => cp.createdAt >= windowStart && cp.createdAt <= windowEnd
  ).length;

  const approvalPromptsHit: number | null = null;
  const errorsDetected: number | null = null;

  return {
    sessionId,
    windowStart,
    windowEnd,
    activeDurationMs,
    restartSegments,
    outputBytes,
    checkpointsCreated,
    approvalPromptsHit,
    errorsDetected,
  };
}
