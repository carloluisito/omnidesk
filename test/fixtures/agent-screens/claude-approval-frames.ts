// Synthetic-but-realistic frame sequence modeled on Claude Code's TUI
// approval-prompt flow: enter alt screen, draw a box-drawn confirmation
// prompt, cycle a braille spinner a few times while "thinking", then settle
// on the final prompt text awaiting a keypress.
//
// NOTE (disclosed in PR #196): these bytes are hand-authored to match
// documented/observed real-world behavior (alt-screen usage, braille
// spinner cycling, box-drawing prompts) — they are not a literal capture
// of a live session. Building a genuine capture harness was out of scope
// for this behavior-neutral infra change.

const ESC = '\x1b';
const ENTER_ALT_SCREEN = `${ESC}[?1049h`;
const CLEAR_AND_HOME = `${ESC}[2J${ESC}[H`;
const cursorTo = (row: number, col: number) => `${ESC}[${row};${col}H`;

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧'];

export const claudeApprovalFrames: string[] = [
  // Enter the alternate screen buffer and clear it — this is the transition
  // the line-tail reducer cannot model but ScreenModel must.
  ENTER_ALT_SCREEN + CLEAR_AND_HOME,
  // Draw a box-drawn prompt at a fixed viewport position.
  cursorTo(3, 3) + '╭─────────────────────────────────────────╮',
  cursorTo(4, 3) + '│ Do you want to proceed with rm -rf?      │',
  cursorTo(5, 3) + '╰─────────────────────────────────────────╯',
  // Spinner churn: repeated single-cell repaints at the same absolute
  // position while a background check runs — this is the "many small
  // repaints in a burst" case the settle/flush split exists for.
  ...SPINNER_FRAMES.map((frame) => cursorTo(7, 3) + frame + ' checking workspace…'),
  // Final settle: spinner replaced by the awaiting-input affordance, in the
  // numbered-selector shape Claude actually renders (see
  // CLAUDE_STATE_SIGNALS.approval in claude-provider.ts) — a bare "Yes / No"
  // does not match any real signal and would silently fall through to
  // done/idle, which defeated the point of this fixture until fixed here.
  cursorTo(7, 3) + '❯ 1. Yes' + ' '.repeat(20),
];
