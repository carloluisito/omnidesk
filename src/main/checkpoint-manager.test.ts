import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HistorySessionEntry } from '../shared/types/history-types';
import type { CheckpointIndex } from '../shared/types/checkpoint-types';

// Mock checkpoint-persistence so no real disk I/O happens and we control the
// starting index per test.
vi.mock('./checkpoint-persistence', () => ({
  loadCheckpointIndex: vi.fn(),
  saveCheckpointIndex: vi.fn(),
}));

import { CheckpointManager } from './checkpoint-manager';
import { loadCheckpointIndex, saveCheckpointIndex } from './checkpoint-persistence';
import type { HistoryManager } from './history-manager';

const mockLoadCheckpointIndex = vi.mocked(loadCheckpointIndex);
const mockSaveCheckpointIndex = vi.mocked(saveCheckpointIndex);

function emptyIndex(): CheckpointIndex {
  return { version: 1, checkpoints: {}, bySession: {} };
}

function makeSessionEntry(overrides: Partial<HistorySessionEntry> = {}): HistorySessionEntry {
  return {
    id: 'session-1',
    name: 'Session One',
    workingDirectory: '/tmp/project',
    createdAt: 1000,
    lastUpdatedAt: 2000,
    sizeBytes: 0,
    segmentCount: 0,
    ...overrides,
  };
}

/** Minimal fake HistoryManager; only the methods CheckpointManager calls. */
function makeHistoryManager(overrides: Partial<{
  listSessions: () => Promise<HistorySessionEntry[]>;
  getSessionContent: (sessionId: string) => Promise<string>;
}> = {}): HistoryManager {
  return {
    listSessions: vi.fn().mockResolvedValue([makeSessionEntry()]),
    getSessionContent: vi.fn().mockResolvedValue(''),
    ...overrides,
  } as unknown as HistoryManager;
}

/** Construct a manager and wait for its async initialize() to settle. */
async function createManager(historyManager: HistoryManager): Promise<CheckpointManager> {
  const manager = new CheckpointManager(historyManager);
  // initialize() is fired-and-forgotten from the constructor; flush microtasks.
  await Promise.resolve();
  await Promise.resolve();
  return manager;
}

describe('CheckpointManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadCheckpointIndex.mockResolvedValue(emptyIndex());
    mockSaveCheckpointIndex.mockResolvedValue(undefined);
  });

  describe('createCheckpoint', () => {
    it('creates a checkpoint recording the session byte position and segment', async () => {
      const historyManager = makeHistoryManager({
        listSessions: vi.fn().mockResolvedValue([
          makeSessionEntry({ id: 'session-1', sizeBytes: 4242, segmentCount: 3 }),
        ]),
        getSessionContent: vi.fn().mockResolvedValue('line one\nline two\nline three'),
      });
      const manager = await createManager(historyManager);

      const checkpoint = await manager.createCheckpoint({
        sessionId: 'session-1',
        name: 'My checkpoint',
        description: 'notes',
        tags: ['a', 'b'],
      });

      expect(checkpoint.sessionId).toBe('session-1');
      expect(checkpoint.name).toBe('My checkpoint');
      expect(checkpoint.historyPosition).toBe(4242);
      expect(checkpoint.historySegment).toBe(3);
      expect(checkpoint.tags).toEqual(['a', 'b']);
      // Conversation summary is the last 5 non-blank lines.
      expect(checkpoint.conversationSummary).toBe('line one\nline two\nline three');
      expect(mockSaveCheckpointIndex).toHaveBeenCalledTimes(1);
    });

    it('rejects an empty or whitespace-only name', async () => {
      const manager = await createManager(makeHistoryManager());

      await expect(
        manager.createCheckpoint({ sessionId: 'session-1', name: '   ' })
      ).rejects.toThrow(/name is required/i);
      await expect(
        manager.createCheckpoint({ sessionId: 'session-1', name: '' })
      ).rejects.toThrow(/name is required/i);
    });

    it('enforces max length on name (50) and description (500)', async () => {
      const manager = await createManager(makeHistoryManager());

      const longName = 'x'.repeat(80);
      const longDescription = 'y'.repeat(600);

      const checkpoint = await manager.createCheckpoint({
        sessionId: 'session-1',
        name: longName,
        description: longDescription,
      });

      expect(checkpoint.name).toHaveLength(50);
      expect(checkpoint.description).toHaveLength(500);
    });

    it('throws when the session is not found in history', async () => {
      const historyManager = makeHistoryManager({
        listSessions: vi.fn().mockResolvedValue([]),
      });
      const manager = await createManager(historyManager);

      await expect(
        manager.createCheckpoint({ sessionId: 'missing-session', name: 'x' })
      ).rejects.toThrow(/not found in history/i);
    });
  });

  describe('listCheckpoints', () => {
    it('returns checkpoints for a session in chronological order', async () => {
      const manager = await createManager(makeHistoryManager());

      const first = await manager.createCheckpoint({ sessionId: 'session-1', name: 'first' });
      const second = await manager.createCheckpoint({ sessionId: 'session-1', name: 'second' });

      const list = await manager.listCheckpoints('session-1');
      expect(list.map(c => c.id)).toEqual([first.id, second.id]);
    });

    it('returns all checkpoints across sessions when no sessionId is given', async () => {
      const historyManager = makeHistoryManager({
        listSessions: vi.fn().mockResolvedValue([
          makeSessionEntry({ id: 'session-1' }),
          makeSessionEntry({ id: 'session-2' }),
        ]),
      });
      const manager = await createManager(historyManager);

      await manager.createCheckpoint({ sessionId: 'session-1', name: 'a' });
      await manager.createCheckpoint({ sessionId: 'session-2', name: 'b' });

      const all = await manager.listCheckpoints();
      expect(all).toHaveLength(2);
    });

    it('returns an empty array for a session with no checkpoints', async () => {
      const manager = await createManager(makeHistoryManager());
      expect(await manager.listCheckpoints('never-had-one')).toEqual([]);
    });
  });

  describe('getCheckpoint', () => {
    it('returns the checkpoint by id, or null if missing', async () => {
      const manager = await createManager(makeHistoryManager());
      const created = await manager.createCheckpoint({ sessionId: 'session-1', name: 'x' });

      expect(await manager.getCheckpoint(created.id)).toEqual(created);
      expect(await manager.getCheckpoint('does-not-exist')).toBeNull();
    });
  });

  describe('deleteCheckpoint', () => {
    it('removes the checkpoint and returns true', async () => {
      const manager = await createManager(makeHistoryManager());
      const created = await manager.createCheckpoint({ sessionId: 'session-1', name: 'x' });

      const result = await manager.deleteCheckpoint(created.id);

      expect(result).toBe(true);
      expect(await manager.getCheckpoint(created.id)).toBeNull();
    });

    it('returns false for an unknown checkpoint id', async () => {
      const manager = await createManager(makeHistoryManager());
      expect(await manager.deleteCheckpoint('nope')).toBe(false);
    });

    it('cleans up the empty bySession entry once the last checkpoint for a session is deleted', async () => {
      const manager = await createManager(makeHistoryManager());
      const created = await manager.createCheckpoint({ sessionId: 'session-1', name: 'x' });

      await manager.deleteCheckpoint(created.id);

      // A subsequent listCheckpoints for that session must not throw and
      // must return an empty list (bySession[sessionId] was removed, not
      // left behind as an empty array).
      expect(await manager.listCheckpoints('session-1')).toEqual([]);
    });
  });

  describe('updateCheckpoint', () => {
    it('applies partial updates and enforces length caps', async () => {
      const manager = await createManager(makeHistoryManager());
      const created = await manager.createCheckpoint({ sessionId: 'session-1', name: 'x' });

      const updated = await manager.updateCheckpoint(created.id, {
        name: 'z'.repeat(60),
        tags: ['new-tag'],
        isTemplate: true,
      });

      expect(updated?.name).toHaveLength(50);
      expect(updated?.tags).toEqual(['new-tag']);
      expect(updated?.isTemplate).toBe(true);
      // description untouched
      expect(updated?.description).toBeUndefined();
    });

    it('returns null for an unknown checkpoint id', async () => {
      const manager = await createManager(makeHistoryManager());
      expect(await manager.updateCheckpoint('missing', { name: 'x' })).toBeNull();
    });
  });

  describe('cleanupForSession', () => {
    it('deletes every checkpoint belonging to the session', async () => {
      const historyManager = makeHistoryManager({
        listSessions: vi.fn().mockResolvedValue([
          makeSessionEntry({ id: 'session-1' }),
          makeSessionEntry({ id: 'session-2' }),
        ]),
      });
      const manager = await createManager(historyManager);

      await manager.createCheckpoint({ sessionId: 'session-1', name: 'a' });
      await manager.createCheckpoint({ sessionId: 'session-1', name: 'b' });
      await manager.createCheckpoint({ sessionId: 'session-2', name: 'c' });

      await manager.cleanupForSession('session-1');

      expect(await manager.listCheckpoints('session-1')).toEqual([]);
      expect(await manager.listCheckpoints('session-2')).toHaveLength(1);
    });
  });

  describe('exportCheckpointHistory — byte-accurate truncation (regression for the /80 line guess)', () => {
    it('truncates by the exact stored byte offset when average line length is well under 80 bytes', async () => {
      // 200 short lines of ~6 bytes each ("line0\n".. "line199\n") => far
      // fewer than 80 bytes/line. The old `/ 80` estimate would truncate to
      // roughly half of the intended history; the byte-offset fix must not.
      const lines = Array.from({ length: 200 }, (_, i) => `line${i}`);
      const fullContent = lines.join('\n');
      const fullBytes = Buffer.byteLength(fullContent, 'utf-8');

      // Checkpoint taken after exactly the first 50 lines were written.
      const prefixLines = lines.slice(0, 50);
      const historyPosition = Buffer.byteLength(prefixLines.join('\n') + '\n', 'utf-8');
      expect(historyPosition).toBeLessThan(fullBytes);

      const historyManager = makeHistoryManager({
        listSessions: vi.fn().mockResolvedValue([
          makeSessionEntry({ id: 'session-1', sizeBytes: historyPosition }),
        ]),
        getSessionContent: vi.fn().mockResolvedValue(fullContent),
      });
      const manager = await createManager(historyManager);
      const checkpoint = await manager.createCheckpoint({ sessionId: 'session-1', name: 'x' });

      const exported = await manager.exportCheckpointHistory(checkpoint.id, 'json');
      const parsed = JSON.parse(exported);

      expect(Buffer.byteLength(parsed.history, 'utf-8')).toBe(historyPosition);
      expect(parsed.history).toBe(prefixLines.join('\n') + '\n');
    });

    it('truncates by the exact stored byte offset when average line length is well over 80 bytes', async () => {
      // A handful of very long lines (~200 bytes each). The old `/ 80`
      // estimate would overshoot the line count and `slice` would clamp to
      // the whole array, silently ignoring the checkpoint boundary.
      const longLine = 'x'.repeat(200);
      const lines = [longLine, longLine, longLine, longLine, longLine];
      const fullContent = lines.join('\n');

      // Checkpoint after exactly the first 2 long lines.
      const prefix = lines.slice(0, 2).join('\n') + '\n';
      const historyPosition = Buffer.byteLength(prefix, 'utf-8');

      const historyManager = makeHistoryManager({
        listSessions: vi.fn().mockResolvedValue([
          makeSessionEntry({ id: 'session-1', sizeBytes: historyPosition }),
        ]),
        getSessionContent: vi.fn().mockResolvedValue(fullContent),
      });
      const manager = await createManager(historyManager);
      const checkpoint = await manager.createCheckpoint({ sessionId: 'session-1', name: 'x' });

      const exported = await manager.exportCheckpointHistory(checkpoint.id, 'json');
      const parsed = JSON.parse(exported);

      expect(parsed.history).toBe(prefix);
      // Must NOT be the full content — that was the overshoot bug.
      expect(parsed.history).not.toBe(fullContent);
    });

    it('clamps to full content length when historyPosition exceeds the current content length', async () => {
      const fullContent = 'a\nb\nc';
      const historyManager = makeHistoryManager({
        listSessions: vi.fn().mockResolvedValue([
          makeSessionEntry({ id: 'session-1', sizeBytes: 999999 }),
        ]),
        getSessionContent: vi.fn().mockResolvedValue(fullContent),
      });
      const manager = await createManager(historyManager);
      const checkpoint = await manager.createCheckpoint({ sessionId: 'session-1', name: 'x' });

      const exported = await manager.exportCheckpointHistory(checkpoint.id, 'json');
      expect(JSON.parse(exported).history).toBe(fullContent);
    });

    it('throws for an unknown checkpoint id', async () => {
      const manager = await createManager(makeHistoryManager());
      await expect(manager.exportCheckpointHistory('missing', 'json')).rejects.toThrow(
        /not found/i
      );
    });

    it('formats markdown export with the checkpoint metadata and truncated history', async () => {
      const historyManager = makeHistoryManager({
        listSessions: vi.fn().mockResolvedValue([
          makeSessionEntry({ id: 'session-1', sizeBytes: Buffer.byteLength('hello', 'utf-8') }),
        ]),
        getSessionContent: vi.fn().mockResolvedValue('hello world'),
      });
      const manager = await createManager(historyManager);
      const checkpoint = await manager.createCheckpoint({
        sessionId: 'session-1',
        name: 'md-test',
        description: 'a description',
        tags: ['tag1'],
      });

      const md = await manager.exportCheckpointHistory(checkpoint.id, 'markdown');

      expect(md).toContain('# Checkpoint: md-test');
      expect(md).toContain('**Description**: a description');
      expect(md).toContain('**Tags**: tag1');
      expect(md).toContain('```\nhello\n```');
    });

    it('formats JSON export with version, checkpoint, and history fields', async () => {
      const historyManager = makeHistoryManager({
        listSessions: vi.fn().mockResolvedValue([
          makeSessionEntry({ id: 'session-1', sizeBytes: Buffer.byteLength('abc', 'utf-8') }),
        ]),
        getSessionContent: vi.fn().mockResolvedValue('abc'),
      });
      const manager = await createManager(historyManager);
      const checkpoint = await manager.createCheckpoint({ sessionId: 'session-1', name: 'json-test' });

      const exported = await manager.exportCheckpointHistory(checkpoint.id, 'json');
      const parsed = JSON.parse(exported);

      expect(parsed.version).toBe(1);
      expect(parsed.checkpoint.id).toBe(checkpoint.id);
      expect(parsed.history).toBe('abc');
      expect(typeof parsed.exportedAt).toBe('string');
    });
  });
});
