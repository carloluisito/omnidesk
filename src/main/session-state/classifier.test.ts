import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionStateClassifier, type ClassifierOptions } from './classifier';
import type { StateSignals } from '../../shared/session-state-types';
import type { SessionActivityState } from '../../shared/ipc-types';

// A minimal single-slot scheduler: the classifier only ever has one timer
// armed at a time (armTimer clears the previous), so one pending slot suffices.
function makeHarness(over: Partial<ClassifierOptions> = {}) {
  let pending: (() => void) | null = null;
  const emitted: SessionActivityState[] = [];
  const onStateChange = vi.fn((s: SessionActivityState) => { emitted.push(s); });

  const signals: StateSignals = {
    working: [/esc to interrupt/i],
    approval: [/Do you want to proceed\?/i, /\b1\.\s*Yes\b[\s\S]{0,120}\b2\.\s*Yes,/i],
    awaitingInput: [/Press Enter to continue/i],
    fatalError: [/API Error/i],
  };

  const classifier = new SessionStateClassifier({
    signals,
    onStateChange,
    quietMs: 1000,
    setTimer: (fn) => { pending = fn; return 1 as unknown as ReturnType<typeof setTimeout>; },
    clearTimer: () => { pending = null; },
    ...over,
  });

  return {
    classifier,
    onStateChange,
    emitted,
    /** Fire the currently-armed quiescence evaluation. */
    tick: () => { const p = pending; pending = null; p?.(); },
    hasTimer: () => pending !== null,
  };
}

describe('SessionStateClassifier', () => {
  it('starts in initializing', () => {
    const h = makeHarness();
    expect(h.classifier.getState()).toBe('initializing');
  });

  it('leading edge: visible output → working immediately', () => {
    const h = makeHarness();
    h.classifier.onOutput('Thinking about it...\n');
    expect(h.classifier.getState()).toBe('working');
    expect(h.emitted).toEqual(['working']);
  });

  it('pure color/cursor chunks are not treated as visible output', () => {
    const h = makeHarness();
    h.classifier.onOutput('\x1b[2m\x1b[0m'); // SGR only, no visible glyphs
    expect(h.classifier.getState()).toBe('initializing');
    expect(h.onStateChange).not.toHaveBeenCalled();
  });

  it('settles to done after output goes quiet (dwell of 2 ticks)', () => {
    const h = makeHarness();
    h.classifier.onOutput('Here is your answer.\n');
    expect(h.classifier.getState()).toBe('working');
    h.tick(); // quietTicks=1 → not yet
    expect(h.classifier.getState()).toBe('working');
    h.tick(); // quietTicks=2 → done
    expect(h.classifier.getState()).toBe('done');
    expect(h.emitted).toEqual(['working', 'done']);
  });

  it('surfaces an approval prompt immediately (no dwell)', () => {
    const h = makeHarness();
    h.classifier.onOutput('Do you want to proceed?\n');
    h.tick();
    expect(h.classifier.getState()).toBe('awaiting-approval');
  });

  it('matches the multi-line approval triad in reading order', () => {
    const h = makeHarness();
    h.classifier.onOutput('Do you want to make this edit?\n❯ 1. Yes\n  2. Yes, and don\'t ask\n  3. No\n');
    h.tick();
    expect(h.classifier.getState()).toBe('awaiting-approval');
  });

  it('interrupt affordance vetoes settling — stays working and keeps watching', () => {
    const h = makeHarness();
    h.classifier.onOutput('Running a slow tool… (esc to interrupt)\n');
    expect(h.classifier.getState()).toBe('working');
    h.tick();
    expect(h.classifier.getState()).toBe('working');
    expect(h.hasTimer()).toBe(true); // re-armed, still watching
  });

  it('exit code 0 → exited; non-zero → errored', () => {
    const a = makeHarness();
    a.classifier.onExit(0);
    expect(a.classifier.getState()).toBe('exited');

    const b = makeHarness();
    b.classifier.onExit(1);
    expect(b.classifier.getState()).toBe('errored');
  });

  it('user-initiated stop never paints errored even on a non-zero exit', () => {
    const h = makeHarness();
    h.classifier.onOutput('working\n');
    h.classifier.onExit(137, true); // SIGKILL-style code, but user pressed Stop
    expect(h.classifier.getState()).toBe('exited');
  });

  it('suppresses transitions while the alternate screen is active', () => {
    const h = makeHarness();
    h.classifier.onOutput('opening editor\x1b[?1049h');
    expect(h.classifier.getState()).toBe('working');
    h.tick(); // alt screen active → hold, re-arm
    expect(h.classifier.getState()).toBe('working');
    expect(h.hasTimer()).toBe(true);
  });

  it('emits only on delta — repeated working output does not re-emit', () => {
    const h = makeHarness();
    h.classifier.onOutput('token1 ');
    h.classifier.onOutput('token2 ');
    h.classifier.onOutput('token3 ');
    expect(h.emitted).toEqual(['working']);
  });

  it('shell sessions only toggle working ↔ idle (never approval/done)', () => {
    const h = makeHarness({ kind: 'shell', signals: { working: [], approval: [/proceed/i], awaitingInput: [], fatalError: [] } });
    h.classifier.onOutput('Do you want to proceed?\n'); // would be approval for an agent
    expect(h.classifier.getState()).toBe('working');
    h.tick();
    h.tick();
    expect(h.classifier.getState()).toBe('idle'); // forced idle, not awaiting-approval
  });

  it('dispose stops the machine — a pending tick is a no-op', () => {
    const h = makeHarness();
    h.classifier.onOutput('working\n');
    h.classifier.dispose();
    h.tick();
    expect(h.classifier.getState()).toBe('working'); // unchanged
  });
});
