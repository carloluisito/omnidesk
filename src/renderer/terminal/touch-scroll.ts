// Touch-drag scrollback for xterm on mobile.
//
// xterm.js only translates touch drags into viewport scrolling when the running
// program has NOT enabled mouse tracking. Agentic CLIs (Claude, Codex) DO enable
// mouse tracking, so xterm ignores touch for scrolling and forwards it as mouse
// input instead — leaving the scrollback unreachable by finger. For those
// sessions we drive `Terminal.scrollLines()` ourselves from raw touch deltas.
//
// This module holds the pure pixel→lines math so it can be unit-tested; the DOM
// wiring lives in Terminal.tsx.

/** Movement (px) a drag must exceed before it's treated as a scroll, so a tap
 *  with a few px of jitter still registers as a tap (click) and not a scroll. */
export const TOUCH_SCROLL_THRESHOLD_PX = 8;

export interface ScrollStep {
  /** Whole rows to scroll: positive = toward newest (down), negative = up. */
  lines: number;
  /** Sub-row pixels to carry into the next move so slow drags aren't lost. */
  remainderPx: number;
}

/**
 * Convert an accumulated vertical pixel delta into whole rows to scroll.
 *
 * `accumPx` is summed as `(previousY - currentY)`: dragging the finger UP (Y
 * decreases) yields a positive delta → scroll DOWN toward the newest output,
 * matching native touch behaviour. The leftover sub-row remainder is returned
 * so the caller can carry it forward and not drop slow, sub-row-height drags.
 */
export function takeScrollLines(accumPx: number, rowPx: number): ScrollStep {
  if (!Number.isFinite(rowPx) || rowPx <= 0) return { lines: 0, remainderPx: 0 };
  const lines = Math.trunc(accumPx / rowPx);
  return { lines, remainderPx: accumPx - lines * rowPx };
}
