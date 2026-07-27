import { describe, it, expect, vi } from 'vitest';
import type { HistorySessionEntry } from '../shared/types/history-types';
import type { Checkpoint } from '../shared/types/checkpoint-types';
import type { HistoryManager } from './history-manager';
import type { CheckpointManager } from './checkpoint-manager';
import { computeSessionDigest } from './session-digest-service';

function makeSessionEntry(overrides: Partial<HistorySessionEntry> = {}): HistorySessionEntry {
  return {
    id: 'session-1',
    name: 'Session One',
    workingDirectory: '/tmp/project',
    createdAt: 1000,
    lastUpdatedAt: 5000,
    sizeBytes: 4242,
    segmentCount: 0,
    ...overrides,
  };
}

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: 'cp-1',
    sessionId: 'session-1',
    name: 'checkpoint',
    createdAt: 2000,
    historyPosition: 0,
    historySegment: 0,
    tags: [],
    ...overrides,
  };
}

function makeHistoryManager(entry: HistorySessionEntry | null): HistoryManager {
  return {
    getSessionMetadata: vi.fn().mockResolvedValue(entry),
  } as unknown as HistoryManager;
}

function makeCheckpointManager(checkpoints: Checkpoint[]): CheckpointManager {
  return {
    listCheckpoints: vi.fn().mockResolvedValue(checkpoints),
  } as unknown as CheckpointManager;
}

describe('computeSessionDigest', () => {
  it('computes a digest for a normal session with no restarts', async () => {
    const entry = makeSessionEntry({ segmentCount: 0, sizeBytes: 1234 });
    const historyManager = makeHistoryManager(entry);
    const checkpointManager = makeCheckpointManager([]);

    const digest = await computeSessionDigest(historyManager, checkpointManager, 'session-1');

    expect(digest).toEqual({
      sessionId: 'session-1',
      windowStart: 1000,
      windowEnd: 5000,
      activeDurationMs: 4000,
      restartSegments: 0,
      outputBytes: 1234,
      checkpointsCreated: 0,
      approvalPromptsHit: null,
      errorsDetected: null,
    });
  });

  it('reports segmentCount as restartSegments for a session with restarts', async () => {
    const entry = makeSessionEntry({ segmentCount: 3 });
    const historyManager = makeHistoryManager(entry);
    const checkpointManager = makeCheckpointManager([]);

    const digest = await computeSessionDigest(historyManager, checkpointManager, 'session-1');

    expect(digest.restartSegments).toBe(3);
  });

  it('counts only checkpoints created within the since-clamped window', async () => {
    const entry = makeSessionEntry({ createdAt: 1000, lastUpdatedAt: 10000 });
    const historyManager = makeHistoryManager(entry);
    const checkpoints = [
      makeCheckpoint({ id: 'cp-before', createdAt: 500 }), // before session even existed
      makeCheckpoint({ id: 'cp-in-window', createdAt: 6000 }),
      makeCheckpoint({ id: 'cp-outside-since', createdAt: 3000 }), // before `since`
      makeCheckpoint({ id: 'cp-at-end', createdAt: 10000 }),
    ];
    const checkpointManager = makeCheckpointManager(checkpoints);

    const digest = await computeSessionDigest(historyManager, checkpointManager, 'session-1', 5000);

    expect(digest.windowStart).toBe(5000);
    expect(digest.windowEnd).toBe(10000);
    expect(digest.checkpointsCreated).toBe(2); // cp-in-window, cp-at-end
  });

  it('returns checkpointsCreated 0 when the session has no checkpoints', async () => {
    const entry = makeSessionEntry();
    const historyManager = makeHistoryManager(entry);
    const checkpointManager = makeCheckpointManager([]);

    const digest = await computeSessionDigest(historyManager, checkpointManager, 'session-1');

    expect(digest.checkpointsCreated).toBe(0);
  });

  it('always reports approvalPromptsHit and errorsDetected as null (v1 graceful degrade)', async () => {
    const entry = makeSessionEntry();
    const historyManager = makeHistoryManager(entry);
    const checkpointManager = makeCheckpointManager([makeCheckpoint()]);

    const digest = await computeSessionDigest(historyManager, checkpointManager, 'session-1');

    expect(digest.approvalPromptsHit).toBeNull();
    expect(digest.errorsDetected).toBeNull();
  });

  it('clamps windowStart to createdAt when since predates the session', async () => {
    const entry = makeSessionEntry({ createdAt: 1000, lastUpdatedAt: 5000 });
    const historyManager = makeHistoryManager(entry);
    const checkpointManager = makeCheckpointManager([]);

    const digest = await computeSessionDigest(historyManager, checkpointManager, 'session-1', 0);

    expect(digest.windowStart).toBe(1000);
  });

  it('yields a zero-length window (not negative) when since is after lastUpdatedAt', async () => {
    const entry = makeSessionEntry({ createdAt: 1000, lastUpdatedAt: 5000 });
    const historyManager = makeHistoryManager(entry);
    const checkpointManager = makeCheckpointManager([]);

    const digest = await computeSessionDigest(historyManager, checkpointManager, 'session-1', 9000);

    expect(digest.windowStart).toBe(9000);
    expect(digest.windowEnd).toBe(9000);
    expect(digest.activeDurationMs).toBe(0);
  });

  it('throws when the session is not found in history', async () => {
    const historyManager = makeHistoryManager(null);
    const checkpointManager = makeCheckpointManager([]);

    await expect(
      computeSessionDigest(historyManager, checkpointManager, 'missing-session')
    ).rejects.toThrow(/missing-session/);
  });
});
