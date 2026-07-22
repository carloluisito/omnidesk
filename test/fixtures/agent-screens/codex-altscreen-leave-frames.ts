// Synthetic-but-realistic frame sequence modeled on Codex CLI's
// working-to-done flow: enter alt screen for a live progress view, cycle a
// spinner while working, then LEAVE the alt screen back to the normal
// buffer and print a final plain-text summary line — the counterpart to
// claude-approval-frames.ts, which never leaves the alt screen.
//
// NOTE (disclosed in PR #196): hand-authored to match documented/observed
// real-world behavior, not a literal capture of a live session — see the
// same disclosure in claude-approval-frames.ts.

const ESC = '\x1b';
const ENTER_ALT_SCREEN = `${ESC}[?1049h`;
const EXIT_ALT_SCREEN = `${ESC}[?1049l`;
const CLEAR_AND_HOME = `${ESC}[2J${ESC}[H`;
const cursorTo = (row: number, col: number) => `${ESC}[${row};${col}H`;

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼'];

export const codexAltScreenLeaveFrames: string[] = [
  ENTER_ALT_SCREEN + CLEAR_AND_HOME,
  cursorTo(1, 1) + 'Codex — applying patch',
  ...SPINNER_FRAMES.map((frame) => cursorTo(2, 1) + frame + ' running tests…'),
  // Leave the alt screen: the full-screen progress view closes and the
  // terminal returns to the normal buffer/scrollback.
  EXIT_ALT_SCREEN,
  // Plain scrollback output printed after returning to the normal buffer.
  'Applied patch and ran tests: 42 passed, 0 failed.\r\n',
];
