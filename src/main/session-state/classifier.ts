// Per-session state machine that turns a PTY output stream into a
// SessionActivityState for the attention-router cockpit. It fuses:
//   • output patterns   — via the provider's StateSignals + the pure detector
//   • output-idle timing — a quiescence timer (renderer timers throttle when
//                          backgrounded, so this MUST live in main)
//   • alt-screen state   — suppress transitions while a full-screen TUI is open
//   • PTY exit code      — authoritative terminal state
// with asymmetric hysteresis (instant on the leading edge, dwell before
// settling to done/idle) so the signal doesn't flap.
//
// One instance per session, fed from SessionManager.wireCliManager's single
// output tap. Pure logic lives in ../../shared (line-reducer, state-detector);
// this file only owns the stateful timer/tail/hysteresis.

import { reduceLines } from '../../shared/line-reducer';
import { detectStateFromTail } from '../../shared/state-detector';
import { stripAnsi } from '../../shared/ansi-strip';
import { AltScreenTracker } from './alt-screen-tracker';
import type { StateSignals } from '../../shared/session-state-types';
import type { SessionActivityState, SessionKind } from '../../shared/ipc-types';

/** Quiet window before a settle is evaluated. */
const DEFAULT_QUIET_MS = 1000;
/** Consecutive quiet ticks required before emitting done/idle (anti-flap). */
const DWELL_TICKS = 2;
/** Bounded raw-output tail kept for the reducer (chars). */
const RAW_TAIL_MAX = 8 * 1024;

export interface ClassifierOptions {
  /** Provider signal tables. Empty tables are fine (e.g. shells). */
  signals: StateSignals;
  /** Shell sessions reduce to working / idle / exited only. */
  kind?: SessionKind;
  /** Quiet window override (ms). */
  quietMs?: number;
  /**
   * When true, settled classification for this session comes from
   * `onScreenSettled()` (rendered ScreenModel snapshots) rather than this
   * class's own byte-tail quiescence timer. `onOutput()` still tracks
   * alt-screen state and emits the immediate 'working' leading-edge signal
   * on visible bytes, but no longer arms `armTimer()` — the ScreenModel's
   * settle cadence (its own debounce) is the sole trigger for the settled
   * (approval/awaiting-input/error/done/idle) classification pass.
   */
  screenDriven?: boolean;
  /** Called on every state DELTA (never for a no-op re-classification). */
  onStateChange: (state: SessionActivityState, reason?: string) => void;
  /** Injectable timer hooks (tests). Default to global setTimeout/clearTimeout. */
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (h: ReturnType<typeof setTimeout>) => void;
}

export class SessionStateClassifier {
  private state: SessionActivityState = 'initializing';
  private rawTail = '';
  private hadOutputSinceView = false;
  private quietTicks = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly alt = new AltScreenTracker();
  private readonly signals: StateSignals;
  private readonly isShell: boolean;
  private readonly screenDriven: boolean;
  private readonly quietMs: number;
  private readonly emit: (s: SessionActivityState, reason?: string) => void;
  private readonly setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly clearTimer: (h: ReturnType<typeof setTimeout>) => void;

  constructor(opts: ClassifierOptions) {
    this.signals = opts.signals;
    this.isShell = opts.kind === 'shell';
    this.screenDriven = opts.screenDriven ?? false;
    this.quietMs = opts.quietMs ?? DEFAULT_QUIET_MS;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h));
    this.emit = (s, reason) => {
      if (this.disposed || s === this.state) return;
      this.state = s;
      opts.onStateChange(s, reason);
    };
  }

  getState(): SessionActivityState {
    return this.state;
  }

  /**
   * Force the classifier's cached state to match one set by an external
   * actor (currently: the bare-bell 'awaiting-input' fast path in
   * SessionManager.onOutput). The bell path calls `emitActivityState`
   * directly — bypassing this class entirely — because it must win
   * *immediately* and synchronously, whereas a screen-driven classifier's
   * next verdict is always at least one ScreenModel quiescence window
   * (~300ms) away. That precedence is correct, but it leaves this class's
   * `this.state` stale: if the screen later re-settles to that SAME state
   * (e.g. back to 'working'), `emit()`'s no-op guard (`s === this.state`)
   * would wrongly treat it as no change and swallow a real transition,
   * leaving the UI stuck on 'awaiting-input' forever. Calling this
   * immediately after the bell emit keeps the cache truthful — without
   * invoking `onStateChange` again, since the bell branch already did.
   */
  syncExternalState(state: SessionActivityState): void {
    if (this.disposed) return;
    this.state = state;
  }

  /** Feed a flushed output chunk (already batched by CLIManager, not per-byte). */
  onOutput(data: string): void {
    if (this.disposed || !data) return;

    this.alt.process(data);

    this.rawTail += data;
    if (this.rawTail.length > RAW_TAIL_MAX) {
      this.rawTail = this.rawTail.slice(this.rawTail.length - RAW_TAIL_MAX);
    }

    // Leading edge: any fresh VISIBLE content (ignoring pure color/cursor
    // control chunks) means the agent is actively producing → 'working' now.
    const visible = stripAnsi(data).trim().length > 0;
    if (visible) {
      this.hadOutputSinceView = true;
      this.quietTicks = 0;
      this.emit('working');
      // Screen-driven sessions get their settled classification from
      // onScreenSettled(), fired by the ScreenModel's own quiescence
      // debounce — arming a second, independent byte-tail timer here would
      // race it and could classify off the stale raw tail instead of the
      // rendered grid.
      if (!this.screenDriven) {
        this.armTimer();
      }
    }
  }

  /**
   * Feed a debounced, fully-rendered ScreenModel snapshot (see
   * `ScreenModel.onSettled` / `ScreenSnapshot`). This is the settled
   * classification path for screen-driven (non-shell) sessions: it mirrors
   * `onQuiesce()`'s detection + emit logic but runs it against
   * `renderedText` (the joined viewport grid) instead of the reduced raw
   * byte tail, and it has no timer of its own to arm — the caller re-invokes
   * this on every ScreenModel settle.
   */
  onScreenSettled(renderedText: string): void {
    if (this.disposed || this.isShell) return;

    // A full-screen TUI/editor/pager is open — its repaints aren't turn
    // output. Hold the prior state; the next settle re-evaluates.
    if (this.alt.isActive()) return;

    const interruptAffordance = this.matches(this.signals.working, renderedText);
    const candidate = detectStateFromTail(renderedText, this.signals, {
      hadOutputSinceView: this.hadOutputSinceView,
      interruptAffordance,
    });

    switch (candidate) {
      case 'awaiting-approval':
      case 'awaiting-input':
      case 'errored':
        this.quietTicks = 0;
        this.emit(candidate);
        return;
      case 'working':
        this.emit('working');
        return;
      case 'done':
      case 'idle':
        // No dwell/anti-flap gate here: unlike the byte-tail timer (which
        // re-fires every quietMs while nothing changes and so needs
        // DWELL_TICKS to avoid flapping on a brief lull), a ScreenModel
        // settle only fires once per genuine quiescence period, so a single
        // done/idle settle is already a stable signal.
        if (candidate === 'idle') {
          this.hadOutputSinceView = false;
        }
        this.emit(candidate);
        return;
    }
  }

  /** Authoritative terminal signal. `userInitiated` (Stop) never paints red. */
  onExit(exitCode: number, userInitiated = false): void {
    if (this.disposed) return;
    this.clearActiveTimer();
    if (!userInitiated && exitCode !== 0) {
      this.emit('errored', `exit ${exitCode}`);
    } else {
      this.emit('exited', userInitiated ? 'stopped' : `exit ${exitCode}`);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearActiveTimer();
  }

  private armTimer(): void {
    this.clearActiveTimer();
    this.timer = this.setTimer(() => this.onQuiesce(), this.quietMs);
  }

  private clearActiveTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private onQuiesce(): void {
    if (this.disposed) return;
    this.timer = null;

    // A full-screen TUI/editor/pager is open — its repaints aren't turn output.
    // Hold the prior state and keep watching.
    if (this.alt.isActive()) {
      this.armTimer();
      return;
    }

    const reduced = stripAnsi(reduceLines(this.rawTail));

    // Shells never have approval/awaiting/error prompts to classify — they only
    // toggle working ↔ idle.
    if (this.isShell) {
      this.settleQuiet('idle');
      return;
    }

    const interruptAffordance = this.matches(this.signals.working, reduced);
    const candidate = detectStateFromTail(reduced, this.signals, {
      hadOutputSinceView: this.hadOutputSinceView,
      interruptAffordance,
    });

    switch (candidate) {
      case 'awaiting-approval':
      case 'awaiting-input':
      case 'errored':
        // Positive signal — surface immediately; new output re-arms the timer.
        this.quietTicks = 0;
        this.emit(candidate);
        return;
      case 'working':
        // Interrupt affordance present: still busy on a silent tool call.
        this.emit('working');
        this.armTimer();
        return;
      case 'done':
      case 'idle':
        this.settleQuiet(candidate);
        return;
    }
  }

  /** Emit a quiet settle (done/idle) only after DWELL_TICKS consecutive quiet
   *  evaluations, to avoid flapping on a brief lull mid-turn. */
  private settleQuiet(candidate: 'done' | 'idle'): void {
    this.quietTicks++;
    if (this.quietTicks < DWELL_TICKS) {
      this.armTimer();
      return;
    }
    if (candidate === 'idle') {
      // Truly quiet with nothing new — clear the surface bias.
      this.hadOutputSinceView = false;
    }
    this.emit(candidate);
    // Settled — stop the timer; the next output chunk re-arms it.
  }

  private matches(table: RegExp[], text: string): boolean {
    for (const re of table) {
      re.lastIndex = 0;
      if (re.test(text)) return true;
    }
    return false;
  }
}
