import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/home/userData'),
  },
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  stat: vi.fn(),
  copyFile: vi.fn(),
}));

import * as fs from 'fs/promises';
import {
  loadCheckpointIndex,
  saveCheckpointIndex,
  validateCheckpointIndex,
  cleanupOrphanedCheckpoints,
} from './checkpoint-persistence';
import type { CheckpointIndex, Checkpoint } from '../shared/types/checkpoint-types';

const mockedFs = vi.mocked(fs);

function makeIndex(overrides: Partial<CheckpointIndex> = {}): CheckpointIndex {
  return {
    version: 1,
    checkpoints: {},
    bySession: {},
    ...overrides,
  };
}

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: 'c1',
    sessionId: 's1',
    name: 'test checkpoint',
    createdAt: 1000,
    historyPosition: 0,
    historySegment: 0,
    ...overrides,
  };
}

function enoent(): NodeJS.ErrnoException {
  const err = new Error('not found') as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  return err;
}

describe('validateCheckpointIndex', () => {
  it('returns true for a well-formed index', () => {
    expect(validateCheckpointIndex(makeIndex())).toBe(true);
  });

  it('returns false for null', () => {
    expect(validateCheckpointIndex(null)).toBe(false);
  });

  it('returns false for a non-object (string, number)', () => {
    expect(validateCheckpointIndex('nope')).toBe(false);
    expect(validateCheckpointIndex(42)).toBe(false);
  });

  it('returns false for the wrong version', () => {
    expect(validateCheckpointIndex({ version: 2, checkpoints: {}, bySession: {} })).toBe(false);
  });

  it('returns false when checkpoints is missing', () => {
    expect(validateCheckpointIndex({ version: 1, bySession: {} })).toBe(false);
  });

  it('returns false when checkpoints is a non-object primitive (string/number)', () => {
    expect(validateCheckpointIndex({ version: 1, checkpoints: 'x', bySession: {} })).toBe(false);
    expect(validateCheckpointIndex({ version: 1, checkpoints: 5, bySession: {} })).toBe(false);
  });

  it('returns false when bySession is missing', () => {
    expect(validateCheckpointIndex({ version: 1, checkpoints: {} })).toBe(false);
  });

  it('returns false when bySession is not an object', () => {
    expect(validateCheckpointIndex({ version: 1, checkpoints: {}, bySession: 5 })).toBe(false);
    expect(validateCheckpointIndex({ version: 1, checkpoints: {}, bySession: 'x' })).toBe(false);
  });
});

describe('loadCheckpointIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFs.mkdir.mockResolvedValue(undefined);
  });

  it('returns an empty index on ENOENT', async () => {
    mockedFs.readFile.mockRejectedValue(enoent());

    const result = await loadCheckpointIndex();
    expect(result).toEqual(makeIndex());
  });

  it('returns an empty index on malformed JSON', async () => {
    mockedFs.readFile.mockResolvedValue('{not valid json');

    const result = await loadCheckpointIndex();
    expect(result).toEqual(makeIndex());
  });

  it('returns an empty index for the wrong schema version', async () => {
    mockedFs.readFile.mockResolvedValue(
      JSON.stringify({ version: 2, checkpoints: {}, bySession: {} })
    );

    const result = await loadCheckpointIndex();
    expect(result).toEqual(makeIndex());
  });

  it('returns an empty index when checkpoints is present but not an object (regression)', async () => {
    // Previously the inline `!index.checkpoints` check let a truthy non-object
    // (string/number) slip through and be returned as-is.
    mockedFs.readFile.mockResolvedValue(
      JSON.stringify({ version: 1, checkpoints: 'oops', bySession: {} })
    );

    const result = await loadCheckpointIndex();
    expect(result).toEqual(makeIndex());
  });

  it('returns an empty index when bySession is present but not an object', async () => {
    mockedFs.readFile.mockResolvedValue(
      JSON.stringify({ version: 1, checkpoints: {}, bySession: 3 })
    );

    const result = await loadCheckpointIndex();
    expect(result).toEqual(makeIndex());
  });

  it('returns the parsed index for a well-formed file', async () => {
    const checkpoint = makeCheckpoint();
    const valid: CheckpointIndex = {
      version: 1,
      checkpoints: { c1: checkpoint },
      bySession: { s1: ['c1'] },
    };
    mockedFs.readFile.mockResolvedValue(JSON.stringify(valid));

    const result = await loadCheckpointIndex();
    expect(result).toEqual(valid);
  });
});

describe('saveCheckpointIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.stat.mockRejectedValue(enoent()); // no existing index -> skip backup copy
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.rename.mockResolvedValue(undefined);
    mockedFs.copyFile.mockResolvedValue(undefined);
  });

  it('ensures the checkpoints directory exists before writing', async () => {
    await saveCheckpointIndex(makeIndex());
    expect(mockedFs.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it('writes to a .tmp file then renames it onto the real index file (atomic write)', async () => {
    await saveCheckpointIndex(makeIndex());

    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/index\.json\.tmp$/),
      expect.any(String),
      'utf-8'
    );
    expect(mockedFs.rename).toHaveBeenCalledWith(
      expect.stringMatching(/index\.json\.tmp$/),
      expect.stringMatching(/(?<!\.tmp)index\.json$/)
    );

    const writtenPayload = JSON.parse(mockedFs.writeFile.mock.calls[0][1] as string);
    expect(writtenPayload).toEqual(makeIndex());
  });
});

describe('cleanupOrphanedCheckpoints', () => {
  it('drops checkpoints whose sessionId is not in validSessionIds and rebuilds bySession', async () => {
    const kept = makeCheckpoint({ id: 'c1', sessionId: 's1' });
    const dropped = makeCheckpoint({ id: 'c2', sessionId: 's2' });
    const index: CheckpointIndex = {
      version: 1,
      checkpoints: { c1: kept, c2: dropped },
      bySession: { s1: ['c1'], s2: ['c2'] },
    };

    const result = await cleanupOrphanedCheckpoints(index, new Set(['s1']));

    expect(result.checkpoints).toEqual({ c1: kept });
    expect(result.bySession).toEqual({ s1: ['c1'] });
  });

  it('keeps all checkpoints when every session is valid', async () => {
    const cp1 = makeCheckpoint({ id: 'c1', sessionId: 's1' });
    const cp2 = makeCheckpoint({ id: 'c2', sessionId: 's1' });
    const index: CheckpointIndex = {
      version: 1,
      checkpoints: { c1: cp1, c2: cp2 },
      bySession: { s1: ['c1', 'c2'] },
    };

    const result = await cleanupOrphanedCheckpoints(index, new Set(['s1']));

    expect(result.checkpoints).toEqual({ c1: cp1, c2: cp2 });
    expect(result.bySession).toEqual({ s1: ['c1', 'c2'] });
  });
});
