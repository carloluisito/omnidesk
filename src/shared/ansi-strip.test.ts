import { describe, it, expect } from 'vitest';
import { stripAnsi, stripAnsiCodes } from './ansi-strip';

describe('stripAnsi', () => {
  it('strips CSI color/SGR codes', () => {
    const raw = '\x1b[31mred text\x1b[0m';
    expect(stripAnsi(raw)).toBe('red text');
  });

  it('strips an OSC title sequence terminated by BEL', () => {
    const raw = '\x1b]0;my window title\x07visible text';
    expect(stripAnsi(raw)).toBe('visible text');
  });

  it('strips an OSC title sequence terminated by ST (ESC-backslash)', () => {
    const raw = '\x1b]0;my window title\x1b\\visible text';
    expect(stripAnsi(raw)).toBe('visible text');
  });

  it('strips CSI private-mode sequences (cursor show/hide)', () => {
    const raw = 'before\x1b[?25hafter';
    expect(stripAnsi(raw)).toBe('beforeafter');
  });

  it('normalizes \\r\\n to \\n', () => {
    expect(stripAnsi('line1\r\nline2')).toBe('line1\nline2');
  });

  it('normalizes a lone \\r to \\n', () => {
    expect(stripAnsi('line1\rline2')).toBe('line1\nline2');
  });

  it('passes plain text through unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('handles empty input', () => {
    expect(stripAnsi('')).toBe('');
  });
});

describe('stripAnsiCodes', () => {
  it('strips CSI/OSC sequences but leaves \\r and \\n untouched', () => {
    const raw = '\x1b[31mline1\r\x1b[0mline2\r\nline3';
    expect(stripAnsiCodes(raw)).toBe('line1\rline2\r\nline3');
  });

  it('passes plain text through unchanged', () => {
    expect(stripAnsiCodes('hello world')).toBe('hello world');
  });
});
