/**
 * Session Digest Service
 *
 * Computes a "while you were away" activity digest for a recorded session,
 * per issue #226 (epic #225 child-1). v1 is derived entirely from persisted
 * metadata (HistorySessionEntry) and the checkpoint store — it does NOT
 * depend on the live session-state classifier (epic #195)'s runtime line
 * buffer, though it does reuse each provider's getStateSignals() marker
 * tables (see approvalPromptsHit/errorsDetected below) to replay against a
 * closed session's persisted raw output.
 */

import type { HistoryManager } from './history-manager';
import type { CheckpointManager } from './checkpoint-manager';
import type { ProviderRegistry } from './providers/provider-registry';
import type { ProviderId } from '../shared/types/provider-types';
import type { SessionDigest } from '../shared/types/history-types';

/** Count total regex matches for `pattern` across `text`, forcing the global
 *  flag so a single `String.match()` call returns every occurrence instead
 *  of just the first. The source `RegExp` (from a provider's StateSignals
 *  table) is never mutated — a new RegExp is constructed if `g` is missing. */
function countMatches(pattern: RegExp, text: string): number {
  const withGlobalFlag = pattern.flags.includes('g') ? pattern : new RegExp(pattern.source, pattern.flags + 'g');
  return text.match(withGlobalFlag)?.length ?? 0;
}

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
 * `approvalPromptsHit` and `errorsDetected` (issue #235, epic #225 child-5):
 * when `entry.providerId` is set AND resolves to a registered provider, both
 * fields are computed by replaying that provider's getStateSignals().approval
 * and .fatalError regex tables against the session's full persisted output
 * (historyManager.getSessionContent) and summing match counts. Like
 * restartSegments/outputBytes above, this is a whole-session total — the
 * persisted content has no per-line timestamps to resolve a `since` window
 * more finely. When `providerId` is absent, or set to an id the current
 * ProviderRegistry does not have registered (registry.get throws), both
 * fields stay `null` — never `0` and never a thrown error — matching the
 * same "best-effort, not derivable" convention already used elsewhere in
 * this digest. `working`/`awaitingInput` signals are not used here; they
 * describe in-flight/idle states that don't correspond to a countable event.
 */
export async function computeSessionDigest(
  historyManager: HistoryManager,
  checkpointManager: CheckpointManager,
  providerRegistry: ProviderRegistry,
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

  let approvalPromptsHit: number | null = null;
  let errorsDetected: number | null = null;

  if (entry.providerId) {
    try {
      const provider = providerRegistry.get(entry.providerId as ProviderId);
      const signals = provider.getStateSignals();
      const content = await historyManager.getSessionContent(sessionId);
      approvalPromptsHit = signals.approval.reduce((sum, re) => sum + countMatches(re, content), 0);
      errorsDetected = signals.fatalError.reduce((sum, re) => sum + countMatches(re, content), 0);
    } catch {
      // Unregistered/unknown providerId, or content unavailable — leave both
      // null (best-effort, not derivable) rather than guessing or throwing.
      approvalPromptsHit = null;
      errorsDetected = null;
    }
  }

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
