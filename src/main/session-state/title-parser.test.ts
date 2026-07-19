// Tests for OscTitleParser — extracts terminal-title updates (OSC 0 / OSC 2)
// from the raw PTY stream so unnamed sessions can auto-rename to what the
// agent is actually doing.
import { describe, it, expect } from 'vitest';
import { OscTitleParser } from './title-parser';

describe('OscTitleParser', () => {
  it('extracts a BEL-terminated OSC 0 title', () => {
    const p = new OscTitleParser();
    expect(p.feed('\x1b]0;My Task\x07')).toEqual(['My Task']);
  });

  it('extracts an ST-terminated OSC 2 title', () => {
    const p = new OscTitleParser();
    expect(p.feed('\x1b]2;Another Task\x1b\\')).toEqual(['Another Task']);
  });

  it('ignores OSC 1 (icon name) and other OSC codes', () => {
    const p = new OscTitleParser();
    expect(p.feed('\x1b]1;icon\x07')).toEqual([]);
    expect(p.feed('\x1b]52;c;YmFzZTY0\x07')).toEqual([]);
    expect(p.feed('\x1b]133;A\x07')).toEqual([]);
  });

  it('returns titles in order when multiple arrive in one chunk', () => {
    const p = new OscTitleParser();
    expect(p.feed('\x1b]0;first\x07text\x1b]2;second\x07')).toEqual(['first', 'second']);
  });

  it('reassembles a title split across chunk boundaries', () => {
    const p = new OscTitleParser();
    expect(p.feed('\x1b]0;long ti')).toEqual([]);
    expect(p.feed('tle here\x07')).toEqual(['long title here']);
  });

  it('reassembles a split introducer and split ST terminator', () => {
    const p = new OscTitleParser();
    expect(p.feed('\x1b')).toEqual([]);
    expect(p.feed(']2;split intro\x1b')).toEqual([]);
    expect(p.feed('\\')).toEqual(['split intro']);
  });

  it('does not emit for plain output or CSI sequences', () => {
    const p = new OscTitleParser();
    expect(p.feed('hello \x1b[31mred\x1b[0m world\x07')).toEqual([]);
  });

  it('caps runaway title payloads instead of buffering unbounded', () => {
    const p = new OscTitleParser();
    p.feed('\x1b]0;' + 'x'.repeat(10000));
    const [title] = p.feed('\x07');
    expect(title.length).toBeLessThanOrEqual(512);
  });

  it('handles empty titles', () => {
    const p = new OscTitleParser();
    expect(p.feed('\x1b]0;\x07')).toEqual(['']);
  });
});

// ── extractTaskTitle ─────────────────────────────────────────────────────────
// Observed live (2026-07-19): Claude Code titles are "<glyph> <task summary>"
// — braille spinner frames (⠂/⠐) while working, ✳ when settled — with generic
// placeholders before the first prompt ("Claude Code", "claude") and cmd.exe
// spawn junk at session start.
import { extractTaskTitle } from './title-parser';

describe('extractTaskTitle', () => {
  it('strips the working spinner glyph', () => {
    expect(extractTaskTitle('⠂ Casual greeting')).toBe('Casual greeting');
    expect(extractTaskTitle('⠐ Casual greeting')).toBe('Casual greeting');
  });

  it('strips the settled ✳ glyph', () => {
    expect(extractTaskTitle('✳ Fix login bug')).toBe('Fix login bug');
  });

  it('accepts a plain title with no glyph', () => {
    expect(extractTaskTitle('Investigate ticket API-357')).toBe('Investigate ticket API-357');
  });

  it('rejects generic Claude placeholders', () => {
    expect(extractTaskTitle('✳ Claude Code')).toBeNull();
    expect(extractTaskTitle('⠂ Claude Code')).toBeNull();
    expect(extractTaskTitle('Claude Code')).toBeNull();
    expect(extractTaskTitle('claude')).toBeNull();
  });

  it('rejects shell/exe spawn titles', () => {
    expect(extractTaskTitle('C:\WINDOWS\SYSTEM32\cmd.exe - claude  --dangerously-skip-permissions')).toBeNull();
    expect(extractTaskTitle('C:\WINDOWS\SYSTEM32\cmd.exe')).toBeNull();
  });

  it('rejects empty and glyph-only titles', () => {
    expect(extractTaskTitle('')).toBeNull();
    expect(extractTaskTitle('⠐ ')).toBeNull();
    expect(extractTaskTitle('   ')).toBeNull();
  });

  it('sanitizes control chars and collapses whitespace', () => {
    expect(extractTaskTitle('⠂ Fix\x01 the \t  bug')).toBe('Fix the bug');
  });

  it('caps the name at 50 chars (renameSession limit)', () => {
    const result = extractTaskTitle('✳ ' + 'long task description '.repeat(5));
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(50);
  });
});
