// Pure text detector for the session-state classifier. Given an already
// line-reduced, ANSI-stripped terminal tail plus a small context, it infers a
// CandidateState at a *quiescence tick* (output has gone quiet). It has no
// side effects and allocates only what it needs to anchor to the tail end.

import type {
  StateSignals,
  CandidateState,
  DetectContext,
} from './session-state-types';

/**
 * How many trailing non-empty lines of the tail we consider. Anchoring to the
 * end prevents a scrolled-past prompt earlier in the buffer from re-firing.
 */
const TAIL_END_LINES = 12;

/**
 * Infer the candidate activity state from a quiet terminal tail.
 *
 * The tail is assumed to be ALREADY line-reduced and ANSI-stripped (plain
 * text) — this function does not strip again.
 *
 * Rule order (bias-to-surface):
 *   1. interruptAffordance vetoes any quiet-state promotion → 'working'.
 *   2. Anchored to the tail end, first table to match wins, in priority:
 *      approval → awaiting-input → fatal error.
 *   3. Nothing matched: hadOutputSinceView → 'done' (surface it), else 'idle'.
 */
export function detectStateFromTail(
  reducedTail: string,
  signals: StateSignals,
  ctx: DetectContext,
): CandidateState {
  // 1. An interrupt affordance means the agent is still busy on a slow/silent
  //    tool call — veto any quiet-state promotion.
  if (ctx.interruptAffordance) {
    return 'working';
  }

  // 2. Anchor to the last ~12 non-empty lines so an old, scrolled-past prompt
  //    does not re-fire. Build the anchored text once, then test tables in
  //    priority order.
  const anchored = anchorToTailEnd(reducedTail);

  if (anyMatch(signals.approval, anchored)) {
    return 'awaiting-approval';
  }
  if (anyMatch(signals.awaitingInput, anchored)) {
    return 'awaiting-input';
  }
  if (anyMatch(signals.fatalError, anchored)) {
    return 'errored';
  }

  // 3. Nothing matched — bias to surface real output as an unacknowledged
  //    'done' turn; only fall back to 'idle' when there was nothing to show.
  return ctx.hadOutputSinceView ? 'done' : 'idle';
}

/** Join the last TAIL_END_LINES non-empty lines back into a string, preserving
 *  their ORIGINAL top-to-bottom order. Order matters: a provider signal may be
 *  a multi-line regex (e.g. the Claude approval table matches "1. Yes … 2. Yes,"
 *  in reading order), so the anchored text must not be reversed. */
function anchorToTailEnd(reducedTail: string): string {
  const lines = reducedTail.split('\n');
  // Find the start index of the last TAIL_END_LINES non-empty lines, then slice
  // forward so original order (and blank-line adjacency) is preserved.
  let seen = 0;
  let startIdx = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().length > 0) {
      seen++;
      if (seen >= TAIL_END_LINES) { startIdx = i; break; }
    }
  }
  return lines.slice(startIdx).join('\n');
}

/** True if any regex in the table matches the text. */
function anyMatch(table: RegExp[], text: string): boolean {
  for (const re of table) {
    // Reset lastIndex defensively in case a caller passes a /g or /y regex —
    // .test() on a sticky/global regex is stateful and would otherwise skip.
    re.lastIndex = 0;
    if (re.test(text)) {
      return true;
    }
  }
  return false;
}
