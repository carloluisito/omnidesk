// Shared contract for the session-state classifier pieces. Kept in `shared`
// (RegExp is fine here — StateSignals never crosses the IPC boundary, it is
// only used in-process by the main-process classifier).

/**
 * Per-provider regex tables the classifier matches against the (reduced,
 * ANSI-stripped) terminal tail. Each provider (Claude, Codex, …) supplies its
 * own via `IProvider.getStateSignals()`.
 */
export interface StateSignals {
  /** Agent is actively working — e.g. an interrupt affordance or spinner. */
  working: RegExp[];
  /** A permission/approval prompt is blocking on the user (highest urgency). */
  approval: RegExp[];
  /** An interactive prompt carrying a pending question for the user. */
  awaitingInput: RegExp[];
  /** A fatal error banner (rate limit, credit balance, API error). */
  fatalError: RegExp[];
}

/**
 * The subset of activity states the *pure text detector* can infer from the
 * tail at a quiescence tick. It has no knowledge of PTY exit codes — the
 * stateful classifier fuses those in separately (→ 'exited'/'errored'), and
 * owns 'initializing'/'working' transitions on the leading edge.
 */
export type CandidateState =
  | 'working'
  | 'awaiting-approval'
  | 'awaiting-input'
  | 'done'
  | 'errored'
  | 'idle';

/** Inputs to the pure detector at a quiescence evaluation. */
export interface DetectContext {
  /** Substantive output was produced since the user last viewed/acknowledged. */
  hadOutputSinceView: boolean;
  /** An interrupt affordance (e.g. "esc to interrupt") is currently present. */
  interruptAffordance: boolean;
}
