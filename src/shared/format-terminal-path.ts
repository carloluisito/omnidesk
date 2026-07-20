/**
 * Format a file path for insertion into an interactive terminal (drag-drop
 * path insertion feature).
 *
 * Lives under src/shared so it can be imported from main and renderer code
 * alike. This is the single canonical implementation - do not fork it.
 *
 * The path is pasted verbatim into the terminal, so the caller's chosen
 * `PathFormat` is what decides whether the resulting text is a safe, usable
 * shell argument. POSIX quoting/escaping here is round-trip safe (no
 * `$`/backtick expansion, no early quote termination, no accidental command
 * separators) for filenames containing arbitrary shell metacharacters.
 *
 * Windows (cmd/PowerShell) quoting rules differ and are out of scope for the
 * escaping fix; the pre-existing "wrap in double quotes when the path has
 * spaces or parens" behavior is preserved as-is for isWindows=true.
 */

import type { PathFormat } from './ipc-types';

// Characters that must be backslash-escaped in POSIX `escaped` mode.
// Matched and replaced in a single regex pass (not sequential .replace calls)
// so a backslash inserted by escaping one character is never re-escaped by a
// later pass.
const POSIX_SHELL_METACHARS = /[\\ \t\n;|&$`'"()<>*?[\]{}~#!]/g;

// A path consisting only of these characters needs no quoting in POSIX
// `quoted` mode - nothing in it can be interpreted by the shell.
const POSIX_SAFE_UNQUOTED = /^[A-Za-z0-9._\-/]+$/;

function escapePosix(input: string): string {
  return input.replace(POSIX_SHELL_METACHARS, (char) => `\\${char}`);
}

function quotePosix(input: string): string {
  if (POSIX_SAFE_UNQUOTED.test(input)) {
    return input;
  }
  // Single quotes suppress all expansion (unlike double quotes, which still
  // expand $var, `cmd`, and $(cmd)). An embedded single quote can't appear
  // inside a single-quoted string, so it's closed, escaped, and reopened.
  return `'${input.replace(/'/g, `'\\''`)}'`;
}

/**
 * @param filePath - Raw file path to format.
 * @param format - 'quoted' | 'unquoted' | 'escaped'.
 * @param isWindows - Target platform for separator normalization and
 *   quoting rules. Callers pass a platform-derived flag
 *   (`process.platform === 'win32'` in main, a `navigator.platform` check in
 *   the renderer).
 */
export function formatPathForTerminal(filePath: string, format: PathFormat, isWindows: boolean): string {
  // Normalize path separators for platform
  let formatted = isWindows
    ? filePath.replace(/\//g, '\\')
    : filePath.replace(/\\/g, '/');

  switch (format) {
    case 'quoted':
      if (isWindows) {
        // Windows quoting is out of scope for this fix; preserve prior behavior.
        if (formatted.includes(' ') || formatted.includes('(') || formatted.includes(')')) {
          formatted = `"${formatted}"`;
        }
      } else {
        formatted = quotePosix(formatted);
      }
      break;

    case 'escaped':
      if (isWindows) {
        // Windows escaping is out of scope for this fix; preserve prior behavior.
        formatted = formatted
          .replace(/ /g, '\\ ')
          .replace(/\(/g, '\\(')
          .replace(/\)/g, '\\)')
          .replace(/&/g, '\\&')
          .replace(/\$/g, '\\$');
      } else {
        formatted = escapePosix(formatted);
      }
      break;

    case 'unquoted':
    default:
      // No transformation
      break;
  }

  return formatted;
}
