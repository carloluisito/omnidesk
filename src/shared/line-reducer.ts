// Pure line-reducer for the session-state classifier's terminal tail.
//
// Models a small slice of a terminal's *visual* line buffer well enough that
// in-place repaints (spinners, approval boxes redrawn as a prompt, etc.)
// collapse to their final on-screen text instead of smearing every byte the
// PTY ever emitted into one long scroll. It interprets a handful of control
// sequences structurally — everything else (including SGR/color CSI
// sequences) is written through as opaque text, never re-rendered.
//
// Pure, dependency-free, O(n) over the input. No imports from `src/main` —
// this lives in `shared` and must stay side-effect free.

/** Control sequences we understand structurally. Everything else is opaque text. */
const CONTROL_CHAR_RE = /[\x1b\n\r]/;

/** Matches one CSI sequence: ESC '[' params intermediates final-byte. */
const CSI_RE = /^\x1b\[([0-9;:<=>?]*)([ -/]*)([@-~])/;

/**
 * Reduce a raw terminal byte stream to its final visual tail.
 *
 * Interprets, from the cursor's point of view:
 *   - `\n`            start a new line (cursor to column 0 of a fresh row)
 *   - `\r`             cursor to column 0 of the *current* row (overwrite mode)
 *   - CSI `K`/`0K`/`1K`/`2K` erase-in-line (to end / to cursor / whole line)
 *   - CSI `<n>A` / `<n>B` cursor up/down `n` rows, clamped within the buffer
 *   - CSI `<n>G`      cursor to column `n` (1-based)
 *   - anything else (plain text, other CSI/SGR sequences) is written verbatim
 *     at the cursor, overwriting whatever cells it lands on.
 *
 * Returns the last `maxLines` visual lines (default 40), newline-joined, with
 * trailing blank lines trimmed.
 */
export function reduceLines(raw: string, maxLines = 40): string {
  const lines: string[] = [''];
  let row = 0;
  let col = 0;

  const writeAt = (text: string): void => {
    if (text.length === 0) return;
    const line = lines[row] ?? '';
    const padded = line.length < col ? line + ' '.repeat(col - line.length) : line;
    lines[row] = padded.slice(0, col) + text + padded.slice(col + text.length);
    col += text.length;
  };

  const eraseInLine = (param: number): void => {
    const line = lines[row] ?? '';
    if (param === 2) {
      lines[row] = '';
    } else if (param === 1) {
      const eraseLen = col + 1;
      lines[row] =
        eraseLen >= line.length
          ? ' '.repeat(line.length)
          : ' '.repeat(eraseLen) + line.slice(eraseLen);
    } else {
      // param 0 (default): erase from cursor to end of line.
      lines[row] = line.slice(0, col);
    }
  };

  let i = 0;
  const n = raw.length;
  while (i < n) {
    const ch = raw[i];

    if (ch === '\n') {
      row += 1;
      col = 0;
      if (row === lines.length) lines.push('');
      i += 1;
      continue;
    }

    if (ch === '\r') {
      col = 0;
      i += 1;
      continue;
    }

    if (ch === '\x1b') {
      const rest = raw.slice(i);
      const m = CSI_RE.exec(rest);
      if (m) {
        const [full, paramStr, , final] = m;
        const firstParam = paramStr.split(';')[0];
        const param = firstParam === '' ? undefined : parseInt(firstParam, 10);
        switch (final) {
          case 'K':
            eraseInLine(param === undefined || Number.isNaN(param) ? 0 : param);
            break;
          case 'A': {
            const step = param === undefined || Number.isNaN(param) || param === 0 ? 1 : param;
            row = Math.max(0, row - step);
            break;
          }
          case 'B': {
            const step = param === undefined || Number.isNaN(param) || param === 0 ? 1 : param;
            row = Math.min(lines.length - 1, row + step);
            break;
          }
          case 'G': {
            const target = param === undefined || Number.isNaN(param) || param === 0 ? 1 : param;
            col = Math.max(0, target - 1);
            break;
          }
          default:
            // Any other CSI (SGR colors, cursor position, etc.) — keep as
            // opaque text written at the cursor. Do not attempt to render it.
            writeAt(full);
            break;
        }
        i += full.length;
        continue;
      }
      // Non-CSI escape (e.g. lone ESC, or a 2-byte escape we don't parse):
      // treat as opaque text so nothing is silently dropped.
      const opaque = i + 1 < n ? raw.slice(i, i + 2) : raw.slice(i, i + 1);
      writeAt(opaque);
      i += opaque.length;
      continue;
    }

    // Plain printable run: batch up to the next control character.
    const rest = raw.slice(i);
    const nextControl = rest.search(CONTROL_CHAR_RE);
    const run = nextControl === -1 ? rest : rest.slice(0, nextControl);
    writeAt(run);
    i += run.length;
  }

  // Trim trailing fully-blank lines, then keep only the tail.
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end -= 1;
  const trimmed = lines.slice(0, end);
  const tail = trimmed.slice(Math.max(0, trimmed.length - maxLines));

  return tail.join('\n');
}
