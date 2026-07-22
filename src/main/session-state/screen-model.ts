// Headless rendered-screen model for agent sessions.
//
// The existing line-reducer (../../shared/line-reducer.ts) turns a raw PTY
// tail into a bounded set of "logical lines" using structural byte parsing
// (\n, \r, CSI K/A/B/G). That's enough for shells and most CLI output, but it
// cannot correctly model:
//   - alt-screen enter/leave (a full-screen TUI redraws the whole viewport;
//     the reducer has no notion of "this is a different screen buffer")
//   - absolute cursor positioning (CSI H / CSI f) used by TUIs to paint a
//     status line, a box-drawn prompt, or a spinner at an arbitrary
//     row/column instead of just appending at the tail
//
// ScreenModel fixes this by feeding raw bytes into a real headless VT
// emulator (@xterm/headless) and reading back its rendered grid. It is
// intentionally NOT wired into session-manager/classifier/UI yet (#196) —
// this is infra only, added and tested in isolation so the rest of the
// system's behavior is provably unchanged.
//
// Two independent timers, mirroring the update-frequency / debounce split
// used by SessionStateClassifier (./classifier.ts):
//   - flushTimer   caps how often raw writes are pushed into the emulator.
//                  A busy spinner can emit dozens of small chunks per
//                  second; each `Terminal.write()` call walks the terminal's
//                  parser, so writing every chunk individually re-parses far
//                  more than needed. Chunks arriving within FLUSH_INTERVAL_MS
//                  of each other are coalesced into one write.
//   - settleTimer  the debounced "screen has stopped churning" signal.
//                  Reading the grid (renderLines()) is the expensive part
//                  (walks every row, builds strings) so it must never run
//                  per-frame — only once, after QUIESCENCE_MS of no new
//                  writes, producing a single ScreenSnapshot per settle.
//
// This keeps the two costs separate: flush caps *parse* cost, settle caps
// *render* cost, and only settle ever triggers onSettled().

import { Terminal } from '@xterm/headless';

/** A fully-rendered, debounced snapshot of the emulated screen. */
export interface ScreenSnapshot {
  /** Rendered rows, top to bottom, trailing whitespace trimmed. Length === rows. */
  lines: string[];
  /** True if the alternate screen buffer (full-screen TUI) is active. */
  altScreenActive: boolean;
  /** 0-based cursor row within the active buffer's viewport. */
  cursorRow: number;
  /** 0-based cursor column. */
  cursorCol: number;
}

export interface ScreenModelOptions {
  /** Emulated terminal width. Defaults to 80. */
  cols?: number;
  /** Emulated terminal height. Defaults to 24. */
  rows?: number;
  /** Quiet window before a settle snapshot is emitted (ms). Default 300. */
  quiescenceMs?: number;
  /** Minimum interval between emulator writes (ms), caps parse cost. Default 16 (~60Hz). */
  flushIntervalMs?: number;
  /** Called at most once per settle, with the rendered snapshot. */
  onSettled: (snapshot: ScreenSnapshot) => void;
  /** Injectable timer hooks (tests). Default to global setTimeout/clearTimeout. */
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (h: ReturnType<typeof setTimeout>) => void;
}

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_QUIESCENCE_MS = 300;
const DEFAULT_FLUSH_INTERVAL_MS = 16;

export class ScreenModel {
  private readonly term: Terminal;
  private readonly quiescenceMs: number;
  private readonly flushIntervalMs: number;
  private readonly onSettled: (snapshot: ScreenSnapshot) => void;
  private readonly setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly clearTimer: (h: ReturnType<typeof setTimeout>) => void;

  private pendingChunks: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  // `Terminal.write()` is asynchronous: it queues data and parses it on a
  // later tick (verified empirically — the buffer is stale even one
  // microtask after write() returns, and only reflects the write once its
  // completion callback fires). A settle must never render before every
  // write it depends on has actually landed, so we track in-flight writes
  // and defer rendering until they drain, guarded by a generation counter
  // so a stale wait (superseded by newer data) never emits.
  private writesInFlight = 0;
  private writeWaiters: Array<() => void> = [];
  private generation = 0;

  /** Rough cost accounting, surfaced for the PR's perf write-up (not perf-critical itself). */
  private writeCallCount = 0;
  private flushCount = 0;
  private renderCount = 0;

  constructor(opts: ScreenModelOptions) {
    this.term = new Terminal({
      cols: opts.cols ?? DEFAULT_COLS,
      rows: opts.rows ?? DEFAULT_ROWS,
      allowProposedApi: true, // required for buffer.active (IBufferNamespace)
      scrollback: 0, // we only ever read the live viewport, never history
    });
    this.quiescenceMs = opts.quiescenceMs ?? DEFAULT_QUIESCENCE_MS;
    this.flushIntervalMs = opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.onSettled = opts.onSettled;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h));
  }

  /** Feed a raw PTY output chunk. Coalesced into the emulator at flushIntervalMs cadence. */
  write(data: string): void {
    if (this.disposed || !data) return;
    this.pendingChunks.push(data);
    this.generation++;
    if (this.flushTimer === null) {
      this.flushTimer = this.setTimer(() => this.flush(), this.flushIntervalMs);
    }
    // Any new byte resets the quiescence window: the screen is still churning.
    this.armSettleTimer();
  }

  /**
   * Force any pending writes into the emulator. `Terminal.write()` is async
   * (see the class-level comment): its effect is only visible once its own
   * completion callback fires. `onDone`, when provided, is invoked exactly
   * once that write has actually landed (or immediately, if there was
   * nothing to flush) — callers that need to read the buffer afterward MUST
   * wait for it rather than assuming this call is synchronous.
   */
  private flush(onDone?: () => void): void {
    this.flushTimer = null;
    if (this.disposed || this.pendingChunks.length === 0) {
      if (onDone) onDone();
      return;
    }
    const batch = this.pendingChunks.join('');
    this.pendingChunks = [];
    this.flushCount++;
    this.writeCallCount++;
    this.writesInFlight++;
    this.term.write(batch, () => {
      this.writesInFlight--;
      if (onDone) onDone();
      if (this.writesInFlight === 0 && this.writeWaiters.length > 0) {
        const waiters = this.writeWaiters;
        this.writeWaiters = [];
        for (const w of waiters) w();
      }
    });
  }

  private armSettleTimer(): void {
    if (this.settleTimer !== null) {
      this.clearTimer(this.settleTimer);
    }
    this.settleTimer = this.setTimer(() => this.checkSettled(), this.quiescenceMs);
  }

  private checkSettled(): void {
    this.settleTimer = null;
    if (this.disposed) return;
    // Make sure any coalesced-but-not-yet-written chunks land before we render,
    // otherwise the snapshot could lag behind the last input by one flush tick.
    // Because `Terminal.write()` is async, "landed" means waiting for its
    // completion callback — never rendering right after issuing it. `gen`
    // guards against a stale wait firing after newer data has already
    // superseded it (a fresh write() bumps `generation`, so this emit becomes
    // a no-op and the newer, already-rearmed settle handles it instead).
    const gen = this.generation;
    const emit = () => {
      if (this.disposed || this.generation !== gen) return;
      this.onSettled(this.renderSnapshot());
    };
    if (this.pendingChunks.length > 0) {
      this.flush(emit);
    } else if (this.writesInFlight > 0) {
      this.writeWaiters.push(emit);
    } else {
      emit();
    }
  }

  /** Read the current emulator grid. Only called from a settle — never per-write. */
  private renderSnapshot(): ScreenSnapshot {
    this.renderCount++;
    const buffer = this.term.buffer.active;
    const lines: string[] = [];
    for (let y = 0; y < this.term.rows; y++) {
      const line = buffer.getLine(buffer.viewportY + y);
      lines.push(line ? line.translateToString(true) : '');
    }
    return {
      lines,
      altScreenActive: buffer.type === 'alternate',
      cursorRow: buffer.cursorY,
      cursorCol: buffer.cursorX,
    };
  }

  /** Rough cost counters for perf reporting (writes coalesced, flushes, renders). */
  getCostCounters(): { writeCallCount: number; flushCount: number; renderCount: number } {
    return {
      writeCallCount: this.writeCallCount,
      flushCount: this.flushCount,
      renderCount: this.renderCount,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.flushTimer !== null) {
      this.clearTimer(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.settleTimer !== null) {
      this.clearTimer(this.settleTimer);
      this.settleTimer = null;
    }
    this.term.dispose();
  }
}
