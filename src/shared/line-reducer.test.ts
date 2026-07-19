import { describe, it, expect } from 'vitest';
import { reduceLines } from './line-reducer';

describe('reduceLines', () => {
  describe('plain multiline passthrough', () => {
    it.each([
      ['single line, no trailing newline', 'hello world', 'hello world'],
      ['multiple lines, no trailing newline', 'line1\nline2\nline3', 'line1\nline2\nline3'],
      [
        'multiple lines, trailing newline is a trailing blank line (trimmed)',
        'line1\nline2\nline3\n',
        'line1\nline2\nline3',
      ],
      ['blank interior line is preserved', 'line1\n\nline3', 'line1\n\nline3'],
    ])('%s', (_label, raw, expected) => {
      expect(reduceLines(raw)).toBe(expected);
    });
  });

  describe('carriage-return overwrite', () => {
    it.each([
      ['full overwrite of equal-length text', 'hello\rworld', 'world'],
      ['partial overwrite keeps the un-overwritten tail', 'hello\rhi', 'hillo'],
      [
        'overwrite across a longer replacement extends the line',
        'hi\rhello',
        'hello',
      ],
      [
        '\\r\\n pair behaves like a normal newline (returns then feeds)',
        'foo\r\nbar',
        'foo\nbar',
      ],
    ])('%s', (_label, raw, expected) => {
      expect(reduceLines(raw)).toBe(expected);
    });
  });

  describe('CSI K erase-in-line', () => {
    it('CSI 2K (erase whole line) clears prior content before a repaint', () => {
      // \r returns to col 0, 2K erases the whole line regardless of cursor
      // position, then "xyz" is written fresh at col 0.
      const raw = 'abcdef\r\x1b[2Kxyz';
      expect(reduceLines(raw)).toBe('xyz');
    });

    it('CSI K / CSI 0K (default, erase to end of line)', () => {
      // Position cursor at column 3 (1-based col 4) via CSI G, then erase to
      // end of line — "def" should disappear, "abc" remains.
      const raw = 'abcdef\x1b[4G\x1b[K';
      expect(reduceLines(raw)).toBe('abc');

      const rawExplicitZero = 'abcdef\x1b[4G\x1b[0K';
      expect(reduceLines(rawExplicitZero)).toBe('abc');
    });

    it('CSI 1K (erase from start of line to cursor, inclusive)', () => {
      // Cursor at column 3 (0-based), erase-to-cursor blanks columns 0..3,
      // leaving the tail "ef" past the erased region.
      const raw = 'abcdef\x1b[4G\x1b[1K';
      expect(reduceLines(raw)).toBe('    ef');
    });
  });

  describe('cursor movement (CSI A/B/G)', () => {
    it('CSI G moves to an absolute column (1-based) for the next write', () => {
      const raw = 'abcdef\x1b[1Gxy';
      // Column 1 == index 0, so "xy" overwrites "ab".
      expect(reduceLines(raw)).toBe('xycdef');
    });

    it('CSI A (cursor up) is clamped to the top of the buffer', () => {
      // Cursor movement only changes the row, not the column — \r pins the
      // column back to 0 so the overwrite lands predictably on "first".
      const raw = 'first\nsecond\x1b[99A\rX';
      // 99 rows up from row 1 clamps to row 0, "X" overwrites the "f".
      expect(reduceLines(raw)).toBe('Xirst\nsecond');
    });

    it('CSI B (cursor down) is clamped to the bottom of the buffer', () => {
      const raw = 'first\nsecond\x1b[5A\rX\x1b[99B\rY';
      // Up 5 clamps to row 0 ("Xirst"), down 99 clamps back to the last
      // existing row (row 1, "second"), "Y" overwrites the "s".
      expect(reduceLines(raw)).toBe('Xirst\nYecond');
    });
  });

  describe('the smear case: cursor-up + erase + repaint', () => {
    it('replaces a multi-line approval box with a repainted prompt, no leftover box text', () => {
      const box = 'Do you want to proceed?\n> Yes\n> No\n';
      const redraw =
        '\x1b[3A' + // back up to the top of the 3-line box
        '\x1b[2K\x1b[1B' + // erase line 1, step down
        '\x1b[2K\x1b[1B' + // erase line 2, step down
        '\x1b[2K' + // erase line 3
        '\x1b[3A' + // back up to the top again
        'Continue? [y/n]: y'; // repaint a single-line prompt
      const raw = box + redraw;

      const result = reduceLines(raw);

      expect(result).toBe('Continue? [y/n]: y');
      expect(result).not.toContain('proceed');
      expect(result).not.toContain('Yes');
      expect(result).not.toContain('No');
    });

    it('a spinner line repainted in place via \\r + erase never accumulates frames', () => {
      const raw =
        'Working...\r' +
        'Working.. \r' +
        'Working.  \r' +
        'Working   \r' +
        '\x1b[K' + // erase-to-end clears the leftover spinner tail before the final write
        'Done.';
      expect(reduceLines(raw)).toBe('Done.');
    });
  });

  describe('opaque escape sequences (SGR/color) are passed through, not re-rendered', () => {
    it('keeps unknown CSI sequences inline as literal text', () => {
      const raw = '\x1b[31mred text\x1b[0m';
      expect(reduceLines(raw)).toBe(raw);
    });

    it('opaque sequences still occupy cursor cells and can be overwritten', () => {
      const raw = '\x1b[31mred\x1b[0m\rXXX';
      // \r returns to col 0; "XXX" overwrites the first 3 characters of the
      // buffered line, whatever they are (here, the start of the SGR escape).
      const withoutCr = '\x1b[31mred\x1b[0m';
      expect(reduceLines(raw)).toBe('XXX' + withoutCr.slice(3));
    });
  });

  describe('maxLines truncation', () => {
    it('keeps only the last N lines, default 40', () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line${i + 1}`);
      const raw = lines.join('\n');

      const defaultResult = reduceLines(raw);
      expect(defaultResult.split('\n')).toHaveLength(40);
      expect(defaultResult.split('\n')[0]).toBe('line11');
      expect(defaultResult.split('\n').at(-1)).toBe('line50');

      const truncated = reduceLines(raw, 5);
      expect(truncated).toBe('line46\nline47\nline48\nline49\nline50');
    });

    it('returns everything when under the limit', () => {
      expect(reduceLines('a\nb\nc', 10)).toBe('a\nb\nc');
    });
  });

  describe('empty input', () => {
    it('returns an empty string for empty input', () => {
      expect(reduceLines('')).toBe('');
    });

    it('returns an empty string for input that is only newlines', () => {
      expect(reduceLines('\n\n\n')).toBe('');
    });
  });
});
