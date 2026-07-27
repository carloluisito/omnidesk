import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron app path used for the history directory constants.
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/mock/userData') },
}));

// Mock fs/promises so the constructor's initialize() and any flush are inert.
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  writeFile: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
  open: vi.fn().mockResolvedValue({ appendFile: vi.fn(), close: vi.fn() }),
  rename: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 0 }),
  readdir: vi.fn().mockResolvedValue([]),
  rm: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import { HistoryManager } from './history-manager';

// White-box helper: read the private per-session recording state.
function stateOf(mgr: HistoryManager, id: string): any {
  return (mgr as unknown as { sessionStates: Map<string, any> }).sessionStates.get(id);
}

// White-box helper: read the persisted index entry for a session.
function entryOf(mgr: HistoryManager, id: string): any {
  return (mgr as unknown as { index: { sessions: Record<string, any> } }).index.sessions[id];
}

describe('HistoryManager.recordOutput — readiness gate (F4)', () => {
  let mgr: HistoryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mgr = new HistoryManager();
  });

  it('shell sessions skip the Claude-ready gate and record immediately', async () => {
    await mgr.recordOutput('sh1', 'PS C:\\> ', { kind: 'shell' });
    const s = stateOf(mgr, 'sh1');
    expect(s.isClaudeReady).toBe(true);
    expect(s.preClaudeBuffer).toBe('');
    // The output is buffered for the durable record rather than discarded.
    expect(s.buffer).toContain('PS C:\\>');
  });

  it('non-Claude output gives up after the 8KB cap instead of buffering forever', async () => {
    const chunk = 'x'.repeat(1024); // 1KB, never matches Claude patterns
    for (let i = 0; i < 9; i++) {
      await mgr.recordOutput('codex1', chunk); // no kind → agent path
    }
    const s = stateOf(mgr, 'codex1');
    // Past 8KB the gate gives up: ready flips, pre-ready buffer is drained.
    expect(s.isClaudeReady).toBe(true);
    expect(s.preClaudeBuffer).toBe('');
    expect(s.buffer.length).toBeGreaterThan(8 * 1024);
  });

  it('keeps buffering (bounded) while still below the cap and unmatched', async () => {
    await mgr.recordOutput('codex2', 'y'.repeat(2048));
    const s = stateOf(mgr, 'codex2');
    expect(s.isClaudeReady).toBe(false);
    expect(s.preClaudeBuffer.length).toBe(2048); // bounded, not re-accumulating
  });

  it('still detects a real Claude banner and records from the match (regression)', async () => {
    await mgr.recordOutput('claude1', 'shell noise\n');
    await mgr.recordOutput('claude1', 'Welcome to Claude Code!\n');
    const s = stateOf(mgr, 'claude1');
    expect(s.isClaudeReady).toBe(true);
    expect(s.preClaudeBuffer).toBe('');
    expect(s.buffer).toContain('Claude Code');
  });
});

describe('HistoryManager.updateSessionMetadata — providerId persistence (issue #230)', () => {
  let mgr: HistoryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mgr = new HistoryManager();
  });

  it('persists providerId on a brand-new entry when supplied', () => {
    mgr.updateSessionMetadata('s1', 'Session 1', '/repo', 'claude');
    expect(entryOf(mgr, 's1').providerId).toBe('claude');
  });

  it('leaves providerId undefined on a brand-new entry when not supplied', () => {
    mgr.updateSessionMetadata('s2', 'Session 2', '/repo');
    expect(entryOf(mgr, 's2').providerId).toBeUndefined();
  });

  it('sets providerId on an existing entry when a value is later supplied', () => {
    mgr.updateSessionMetadata('s3', 'Session 3', '/repo');
    expect(entryOf(mgr, 's3').providerId).toBeUndefined();

    mgr.updateSessionMetadata('s3', 'Session 3', '/repo', 'codex');
    expect(entryOf(mgr, 's3').providerId).toBe('codex');
  });

  it('does not clobber an existing providerId when a later call omits it (non-clobbering rename)', () => {
    mgr.updateSessionMetadata('s4', 'Session 4', '/repo', 'claude');
    expect(entryOf(mgr, 's4').providerId).toBe('claude');

    // Simulates a manual rename call site that doesn't know the provider.
    mgr.updateSessionMetadata('s4', 'Renamed Session 4', '/repo');
    expect(entryOf(mgr, 's4').providerId).toBe('claude');
    expect(entryOf(mgr, 's4').name).toBe('Renamed Session 4');
  });

  it('updates providerId when a later call supplies a different value', () => {
    mgr.updateSessionMetadata('s5', 'Session 5', '/repo', 'claude');
    mgr.updateSessionMetadata('s5', 'Session 5', '/repo', 'codex');
    expect(entryOf(mgr, 's5').providerId).toBe('codex');
  });
});
