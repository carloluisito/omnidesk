// Tests for the BEL (\x07) probe scanner — experiment instrumentation for the
// "bell as agent attention signal" investigation (OMNIDESK_DEBUG_BELL).
import { describe, it, expect } from 'vitest';
import { BellScanner } from './bell-probe';

describe('BellScanner', () => {
  it('returns no events for chunks without a BEL', () => {
    const s = new BellScanner();
    expect(s.feed('hello world')).toEqual([]);
    expect(s.feed('\x1b[2Jmore output')).toEqual([]);
  });

  it('detects a single BEL with surrounding context', () => {
    const s = new BellScanner();
    const events = s.feed('before-the-bell\x07after-the-bell');
    expect(events).toHaveLength(1);
    expect(events[0].seq).toBe(1);
    expect(events[0].context).toContain('before-the-bell');
    expect(events[0].context).toContain('after-the-bell');
    expect(events[0].context).toContain('⟬BEL⟭');
  });

  it('bounds context to ~40 chars each side', () => {
    const s = new BellScanner();
    const before = 'A'.repeat(100);
    const after = 'B'.repeat(100);
    const [ev] = s.feed(`${before}\x07${after}`);
    const [pre, post] = ev.context.split('⟬BEL⟭');
    expect(pre.length).toBeLessThanOrEqual(40);
    expect(post.length).toBeLessThanOrEqual(40);
    expect(pre).toBe('A'.repeat(40));
    expect(post).toBe('B'.repeat(40));
  });

  it('detects multiple BELs in one chunk with incrementing seq', () => {
    const s = new BellScanner();
    const events = s.feed('one\x07two\x07three');
    expect(events).toHaveLength(2);
    expect(events.map(e => e.seq)).toEqual([1, 2]);
    expect(events[0].context).toContain('one');
    expect(events[0].context).toContain('two');
    expect(events[1].context).toContain('three');
  });

  it('carries context across chunk boundaries (16ms flush split)', () => {
    const s = new BellScanner();
    expect(s.feed('tail-of-previous-chunk')).toEqual([]);
    const [ev] = s.feed('\x07start-of-next');
    // Leading context must come from the PREVIOUS chunk's tail.
    expect(ev.context).toContain('tail-of-previous-chunk');
    expect(ev.context).toContain('start-of-next');
  });

  it('increments seq across separate feeds', () => {
    const s = new BellScanner();
    s.feed('x\x07y');
    const [ev] = s.feed('z\x07w');
    expect(ev.seq).toBe(2);
  });

  it('escapes control characters in context so logs stay one-line readable', () => {
    const s = new BellScanner();
    const [ev] = s.feed('\x1b[31mred\x1b[0m\x07\r\nnext');
    expect(ev.context).not.toMatch(/[\x00-\x1f]/); // no raw control bytes
    expect(ev.context).toContain('\\x1b'); // ESC rendered as escape sequence
    expect(ev.context).toContain('\\r\\n');
  });

  it('counts a BEL as exactly one event even at the very end of a chunk', () => {
    const s = new BellScanner();
    const events = s.feed('ends-with-bell\x07');
    expect(events).toHaveLength(1);
    // Following chunk must not re-report it.
    expect(s.feed('later output')).toEqual([]);
  });
});
