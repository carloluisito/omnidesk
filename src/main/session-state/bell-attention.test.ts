// Tests for BareBellDetector — the production bell→attention signal.
// A BEL (\x07) is a notification ONLY when it stands alone; BEL also terminates
// OSC strings (window titles, OSC 52 clipboard writes — observed live in the
// 2026-07-19 probe, docs/experiments/2026-07-19-bell-attention-probe.md), and
// those must never count.
import { describe, it, expect } from 'vitest';
import { BareBellDetector } from './bell-attention';

describe('BareBellDetector', () => {
  it('counts a bare BEL', () => {
    const d = new BareBellDetector();
    expect(d.feed('hello\x07world')).toBe(1);
  });

  it('counts multiple bare BELs in one chunk', () => {
    const d = new BareBellDetector();
    expect(d.feed('\x07a\x07b\x07')).toBe(3);
  });

  it('returns 0 for plain output', () => {
    const d = new BareBellDetector();
    expect(d.feed('just some text\r\n')).toBe(0);
  });

  it('ignores BEL terminating an OSC title sequence', () => {
    const d = new BareBellDetector();
    expect(d.feed('\x1b]0;C:\\WINDOWS\\cmd.exe\x07')).toBe(0);
  });

  it('ignores BEL terminating an OSC 52 clipboard write (probe finding #3)', () => {
    const d = new BareBellDetector();
    expect(d.feed('\x1b]52;c;Y2UgdGhlIHJvb3QgY2F1c2U=\x07')).toBe(0);
  });

  it('counts a bare BEL after an ST-terminated OSC', () => {
    const d = new BareBellDetector();
    expect(d.feed('\x1b]0;title\x1b\\\x07')).toBe(1);
  });

  it('does not let a CSI sequence swallow a following bare BEL (probe finding #1 signature)', () => {
    const d = new BareBellDetector();
    // The observed genuine completion bell: repaint CSIs then bare BEL.
    expect(d.feed('\x1b[39m\x1b[K\x1b[24;1H\x1b[?25h\x1b[?2026l\x07')).toBe(1);
  });

  it('ignores BEL inside DCS / APC / PM / SOS strings', () => {
    const d = new BareBellDetector();
    expect(d.feed('\x1bPq#0;data\x07\x1b\\')).toBe(0); // DCS
    expect(d.feed('\x1b_payload\x07\x1b\\')).toBe(0); // APC
    expect(d.feed('\x1b^msg\x07\x1b\\')).toBe(0); // PM
    expect(d.feed('\x1bXmsg\x07\x1b\\')).toBe(0); // SOS
  });

  it('tracks OSC state across chunk boundaries (16ms flush split)', () => {
    const d = new BareBellDetector();
    expect(d.feed('\x1b]0;long tit')).toBe(0);
    expect(d.feed('le continues\x07')).toBe(0); // still the OSC terminator
    expect(d.feed('\x07')).toBe(1); // and THIS one is bare
  });

  it('tracks a split ESC ] introducer across chunks', () => {
    const d = new BareBellDetector();
    expect(d.feed('text\x1b')).toBe(0);
    expect(d.feed(']0;title\x07')).toBe(0);
  });

  it('tracks a split ST terminator across chunks', () => {
    const d = new BareBellDetector();
    expect(d.feed('\x1b]0;title\x1b')).toBe(0);
    expect(d.feed('\\\x07')).toBe(1); // ST completes, then a bare BEL
  });

  it('recovers when an ESC inside an OSC is not a terminator', () => {
    const d = new BareBellDetector();
    // Invalid-but-seen-in-the-wild: ESC as data inside the string; the string
    // still ends at the BEL, which must not count.
    expect(d.feed('\x1b]0;we\x1bird\x07')).toBe(0);
    expect(d.feed('\x07')).toBe(1);
  });
});
