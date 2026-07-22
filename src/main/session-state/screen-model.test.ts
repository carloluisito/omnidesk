import { describe, it, expect } from 'vitest';
import { ScreenModel, type ScreenSnapshot } from './screen-model';
import { claudeApprovalFrames } from '../../../test/fixtures/agent-screens/claude-approval-frames';
import { codexAltScreenLeaveFrames } from '../../../test/fixtures/agent-screens/codex-altscreen-leave-frames';

/**
 * A virtual-clock fake scheduler. Unlike the single-slot harness used by
 * classifier.test.ts, ScreenModel can have TWO independent timers armed at
 * once (flushTimer + settleTimer) with different delays, so this fake
 * tracks an arbitrary number of pending timers against a virtual `now` and
 * fires whichever are due, in deadline order, when advanced.
 */
function makeFakeScheduler() {
  let now = 0;
  let nextHandle = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();

  const setTimer = (fn: () => void, ms: number) => {
    const handle = nextHandle++;
    pending.set(handle, { at: now + ms, fn });
    return handle as unknown as ReturnType<typeof setTimeout>;
  };

  const clearTimer = (h: ReturnType<typeof setTimeout>) => {
    pending.delete(h as unknown as number);
  };

  /** Advance virtual time and fire all timers now due, in deadline order. */
  const advance = (ms: number) => {
    now += ms;
    for (;;) {
      let dueHandle: number | null = null;
      let dueAt = Infinity;
      for (const [handle, entry] of pending) {
        if (entry.at <= now && entry.at < dueAt) {
          dueAt = entry.at;
          dueHandle = handle;
        }
      }
      if (dueHandle === null) break;
      const entry = pending.get(dueHandle)!;
      pending.delete(dueHandle);
      entry.fn();
    }
  };

  const pendingCount = () => pending.size;

  return { setTimer, clearTimer, advance, pendingCount };
}

function makeModel(overrides: Partial<Parameters<typeof ScreenModel.prototype.write>> = {}) {
  const scheduler = makeFakeScheduler();
  const snapshots: ScreenSnapshot[] = [];
  const model = new ScreenModel({
    quiescenceMs: 300,
    flushIntervalMs: 16,
    onSettled: (s) => snapshots.push(s),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
  });
  return { model, scheduler, snapshots };
}

/** Feed frames with a small virtual gap between each, then let flush+settle run out. */
function feedFrames(
  model: ScreenModel,
  scheduler: ReturnType<typeof makeFakeScheduler>,
  frames: string[],
  gapMs = 5
) {
  for (const frame of frames) {
    model.write(frame);
    scheduler.advance(gapMs);
  }
  // Run the clock forward past both the flush interval and the quiescence
  // window so any trailing coalesced write and the final settle fire.
  scheduler.advance(500);
}

/**
 * Poll a predicate using REAL time until it's true. `Terminal.write()`
 * (from @xterm/headless) completes asynchronously off the real Node event
 * loop, not off the fake scheduler used for flushTimer/settleTimer — so once
 * checkSettled() has fired (via scheduler.advance), the resulting onSettled
 * callback may still be pending a real event-loop tick. The fake scheduler
 * can't be used to wait for this: it only fires timers it owns, synchronously,
 * so it would never yield to the real tick the write's completion depends on.
 */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('ScreenModel', () => {
  it('renders a box-drawn prompt at its absolute cursor position (Claude approval fixture)', async () => {
    const { model, scheduler, snapshots } = makeModel();
    feedFrames(model, scheduler, claudeApprovalFrames);
    await waitFor(() => snapshots.length > 0);
    model.dispose();

    expect(snapshots.length).toBeGreaterThan(0);
    const last = snapshots[snapshots.length - 1];
    expect(last.altScreenActive).toBe(true);
    // Box-drawing prompt lines landed at the rows/cols they were painted at,
    // not appended at the tail — this is exactly what the tail-based
    // line-reducer cannot do.
    expect(last.lines[3]).toContain('Do you want to proceed with rm -rf?');
    expect(last.lines[2]).toContain('╭');
    expect(last.lines[4]).toContain('╰');
    // Final frame replaced the spinner with the awaiting-input affordance, in
    // the numbered-selector shape CLAUDE_STATE_SIGNALS.approval actually
    // matches (see claude-approval-frames.ts).
    expect(last.lines[6]).toContain('❯ 1. Yes');
    expect(last.lines[6]).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧]/);
  });

  it('tracks alt-screen enter and leave, returning to the normal buffer (Codex fixture)', async () => {
    const { model, scheduler, snapshots } = makeModel();

    // Feed only the alt-screen portion first and settle.
    const altPortion = codexAltScreenLeaveFrames.slice(0, -2);
    feedFrames(model, scheduler, altPortion);
    await waitFor(() => snapshots.length > 0);
    expect(snapshots[snapshots.length - 1].altScreenActive).toBe(true);

    // Now feed the leave + trailing scrollback line and settle again.
    const rest = codexAltScreenLeaveFrames.slice(-2);
    const countBefore = snapshots.length;
    feedFrames(model, scheduler, rest);
    await waitFor(() => snapshots.length > countBefore);
    model.dispose();

    const last = snapshots[snapshots.length - 1];
    expect(last.altScreenActive).toBe(false);
    expect(last.lines.join('\n')).toContain('Applied patch and ran tests: 42 passed, 0 failed.');
  });

  it('debounces rapid churn into exactly one settle snapshot per quiet period', async () => {
    const { model, scheduler, snapshots } = makeModel();

    // Simulate a burst of spinner repaints, each arriving well within the
    // quiescence window (300ms) of the previous one — no settle should fire
    // mid-burst.
    model.write('\x1b[?1049h\x1b[2J\x1b[H');
    for (let i = 0; i < 20; i++) {
      model.write(`\x1b[5;1Hspinner frame ${i}`);
      scheduler.advance(10); // well under quiescenceMs
    }
    expect(snapshots.length).toBe(0);

    // Now let the screen go quiet.
    scheduler.advance(500);
    await waitFor(() => snapshots.length === 1);

    expect(snapshots.length).toBe(1);
    expect(snapshots[0].lines[4]).toContain('spinner frame 19');
    model.dispose();
  });

  it('caps emulator write frequency under a continuous spinner burst (update-frequency cap)', async () => {
    const { model, scheduler, snapshots } = makeModel();

    const WRITE_COUNT = 200;
    for (let i = 0; i < WRITE_COUNT; i++) {
      model.write(`\x1b[3;1Hspin ${i}`);
      scheduler.advance(2); // much faster than flushIntervalMs (16ms)
    }
    scheduler.advance(500);
    await waitFor(() => snapshots.length === 1);
    model.dispose();

    const counters = model.getCostCounters();
    // Many small writes should have been coalesced into far fewer emulator
    // writes (bounded by elapsed-time / flushIntervalMs), not one per write().
    expect(counters.writeCallCount).toBeLessThan(WRITE_COUNT / 4);
    // Exactly one render for this single settle — the expensive grid read
    // must never run per-flush, only once per settle.
    expect(counters.renderCount).toBe(1);
    expect(snapshots.length).toBe(1);

    // Rough cost note for the PR: with a 200-write / 2ms-interval burst
    // (a much faster spinner than any real CLI produces) over a 16ms flush
    // cadence, the emulator only had to parse ~counters.writeCallCount
    // batches and render once — i.e. cost is bounded by wall-clock time
    // elapsed, not by how many chunks the PTY happens to flush.
  });

  it('does not emit a settle snapshot before dispose if nothing was ever written', () => {
    const { model, snapshots } = makeModel();
    model.dispose();
    expect(snapshots.length).toBe(0);
  });
});
