/**
 * ANSI escape code stripping utility
 * Removes ANSI color codes, cursor movements, and control sequences from terminal output
 *
 * Lives under src/shared so it can be imported from main, renderer, and shared
 * code alike. This is the single canonical implementation - do not fork it.
 */

// ANSI CSI (Control Sequence Introducer) pattern
// Matches: ESC[ followed by parameters and final byte
const ANSI_PATTERN = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

// OSC (Operating System Command) pattern
// Matches: ESC] ... BEL or ESC] ... ST
const OSC_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

/**
 * Strips only ANSI CSI/OSC escape sequences, leaving \r and \n untouched.
 * Callers that need to reason about carriage-return overwrite semantics
 * (e.g. collapsing \r-driven progress-bar redraws) should use this instead
 * of stripAnsi, which normalizes all line endings to \n.
 * @param input - Raw terminal output with ANSI codes
 * @returns Text with ANSI codes removed, \r/\n left as-is
 */
export function stripAnsiCodes(input: string): string {
  return input
    .replace(OSC_PATTERN, '') // Remove OSC sequences first
    .replace(ANSI_PATTERN, ''); // Remove CSI sequences
}

/**
 * Strips ANSI escape codes from terminal output
 * @param input - Raw terminal output with ANSI codes
 * @returns Clean text with ANSI codes removed
 */
export function stripAnsi(input: string): string {
  return stripAnsiCodes(input)
    .replace(/\r\n/g, '\n') // Normalize Windows line endings
    .replace(/\r/g, '\n'); // Convert remaining carriage returns
}
