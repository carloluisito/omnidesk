import { describe, it, expect, vi } from 'vitest';
import type { HistorySessionEntry } from '../shared/types/history-types';
import type { Checkpoint } from '../shared/types/checkpoint-types';
import type { HistoryManager } from './history-manager';
import type { CheckpointManager } from './checkpoint-manager';
import type { ProviderRegistry } from './providers/provider-registry';
import type { IProvider } from './providers/provider';
import type { StateSignals } from '../shared/session-state-types';
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

function makeHistoryManager(entry: HistorySessionEntry | null, content = ''): HistoryManager {
  return {
    getSessionMetadata: vi.fn().mockResolvedValue(entry),
    getSessionContent: vi.fn().mockResolvedValue(content),
  } as unknown as HistoryManager;
}

function makeCheckpointManager(checkpoints: Checkpoint[]): CheckpointManager {
  return {
    listCheckpoints: vi.fn().mockResolvedValue(checkpoints),
  } as unknown as CheckpointManager;
}

/** A ProviderRegistry test double: `providers` maps providerId -> a partial
 *  IProvider (only getStateSignals() is ever called by computeSessionDigest).
 *  Unregistered ids throw, mirroring the real ProviderRegistry.get(). */
function makeProviderRegistry(providers: Record<string, Partial<IProvider>> = {}): ProviderRegistry {
  return {
    get: vi.fn((id: string) => {
      const provider = providers[id];
      if (!provider) {
        throw new Error(`Provider not found: ${id}`);
      }
      return provider as IProvider;
    }),
  } as unknown as ProviderRegistry;
}

function makeStateSignals(overrides: Partial<StateSignals> = {}): StateSignals {
  return {
    working: [],
    approval: [],
    awaitingInput: [],
    fatalError: [],
    ...overrides,
  };
}

describe('computeSessionDigest', () => {
  it('computes a digest for a normal session with no restarts', async () => {
    const entry = makeSessionEntry({ segmentCount: 0, sizeBytes: 1234 });
    const historyManager = makeHistoryManager(entry);
    const checkpointManager = makeCheckpointManager([]);
    const providerRegistry = makeProviderRegistry();

    const digest = await computeSessionDigest(historyManager, checkpointManager, providerRegistry, 'session-1');

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
    const providerRegistry = makeProviderRegistry();

    const digest = await computeSessionDigest(historyManager, checkpointManager, providerRegistry, 'session-1');

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
    const providerRegistry = makeProviderRegistry();

    const digest = await computeSessionDigest(historyManager, checkpointManager, providerRegistry, 'session-1', 5000);

    expect(digest.windowStart).toBe(5000);
    expect(digest.windowEnd).toBe(10000);
    expect(digest.checkpointsCreated).toBe(2); // cp-in-window, cp-at-end
  });

  it('returns checkpointsCreated 0 when the session has no checkpoints', async () => {
    const entry = makeSessionEntry();
    const historyManager = makeHistoryManager(entry);
    const checkpointManager = makeCheckpointManager([]);
    const providerRegistry = makeProviderRegistry();

    const digest = await computeSessionDigest(historyManager, checkpointManager, providerRegistry, 'session-1');

    expect(digest.checkpointsCreated).toBe(0);
  });

  it('reports approvalPromptsHit and errorsDetected as null when the session has no providerId', async () => {
    const entry = makeSessionEntry({ providerId: undefined });
    const historyManager = makeHistoryManager(entry);
    const checkpointManager = makeCheckpointManager([makeCheckpoint()]);
    const providerRegistry = makeProviderRegistry();

    const digest = await computeSessionDigest(historyManager, checkpointManager, providerRegistry, 'session-1');

    expect(digest.approvalPromptsHit).toBeNull();
    expect(digest.errorsDetected).toBeNull();
  });

  it('replays the provider marker tables against persisted output to compute real counts (#235)', async () => {
    const entry = makeSessionEntry({ providerId: 'claude' });
    const content = [
      'thinking...',
      'Do you want to proceed with this?',
      'more output',
      'Do you want to make this edit to foo.ts?',
      'API Error: 500 Internal Server Error',
      'trailing output',
    ].join('\n');
    const historyManager = makeHistoryManager(entry, content);
    const checkpointManager = makeCheckpointManager([]);
    const providerRegistry = makeProviderRegistry({
      claude: {
        getStateSignals: () => makeStateSignals({
          approval: [/Do you want to (proceed|make this edit)\b/i],
          fatalError: [/^\s*(⎿\s*)?API Error[:\s(]/im],
        }),
      },
    });

    const digest = await computeSessionDigest(historyManager, checkpointManager, providerRegistry, 'session-1');

    expect(digest.approvalPromptsHit).toBe(2);
    expect(digest.errorsDetected).toBe(1);
  });

  it('leaves approvalPromptsHit/errorsDetected null (never throws) when providerId is unregistered', async () => {
    const entry = makeSessionEntry({ providerId: 'nonexistent-provider' });
    const historyManager = makeHistoryManager(entry, 'Do you want to proceed?');
    const checkpointManager = makeCheckpointManager([]);
    const providerRegistry = makeProviderRegistry(); // nothing registered

    const digest = await computeSessionDigest(historyManager, checkpointManager, providerRegistry, 'session-1');

    expect(digest.approvalPromptsHit).toBeNull();
    expect(digest.errorsDetected).toBeNull();
  });

  it('clamps windowStart to createdAt when since predates the session', async () => {
    const entry = makeSessionEntry({ createdAt: 1000, lastUpdatedAt: 5000 });
    const historyManager = makeHistoryManager(entry);
    const checkpointManager = makeCheckpointManager([]);
    const providerRegistry = makeProviderRegistry();

    const digest = await computeSessionDigest(historyManager, checkpointManager, providerRegistry, 'session-1', 0);

    expect(digest.windowStart).toBe(1000);
  });

  it('yields a zero-length window (not negative) when since is after lastUpdatedAt', async () => {
    const entry = makeSessionEntry({ createdAt: 1000, lastUpdatedAt: 5000 });
    const historyManager = makeHistoryManager(entry);
    const checkpointManager = makeCheckpointManager([]);
    const providerRegistry = makeProviderRegistry();

    const digest = await computeSessionDigest(historyManager, checkpointManager, providerRegistry, 'session-1', 9000);

    expect(digest.windowStart).toBe(9000);
    expect(digest.windowEnd).toBe(9000);
    expect(digest.activeDurationMs).toBe(0);
  });

  it('throws when the session is not found in history', async () => {
    const historyManager = makeHistoryManager(null);
    const checkpointManager = makeCheckpointManager([]);
    const providerRegistry = makeProviderRegistry();

    await expect(
      computeSessionDigest(historyManager, checkpointManager, providerRegistry, 'missing-session')
    ).rejects.toThrow(/missing-session/);
  });
});
