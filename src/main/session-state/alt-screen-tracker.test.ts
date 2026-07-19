import { describe, it, expect, beforeEach } from 'vitest';
import { AltScreenTracker } from './alt-screen-tracker';

describe('AltScreenTracker', () => {
  let tracker: AltScreenTracker;

  beforeEach(() => {
    tracker = new AltScreenTracker();
  });

  it('starts inactive', () => {
    expect(tracker.isActive()).toBe(false);
  });

  it('enters alt screen on CSI ?1049h and exits on CSI ?1049l', () => {
    tracker.process('\x1b[?1049h');
    expect(tracker.isActive()).toBe(true);

    tracker.process('some vim output here');
    expect(tracker.isActive()).toBe(true);

    tracker.process('\x1b[?1049l');
    expect(tracker.isActive()).toBe(false);
  });

  it('treats a combined param sequence CSI ?1049;2004h as entering alt screen', () => {
    tracker.process('\x1b[?1049;2004h');
    expect(tracker.isActive()).toBe(true);
  });

  it('treats a combined param sequence CSI ?1049;2004l as exiting alt screen', () => {
    tracker.process('\x1b[?1049;2004h');
    expect(tracker.isActive()).toBe(true);
    tracker.process('\x1b[?1049;2004l');
    expect(tracker.isActive()).toBe(false);
  });

  it('does not react to unrelated DEC private modes bundled in the same sequence', () => {
    // 2004 (bracketed paste) alone should not toggle alt screen state.
    tracker.process('\x1b[?2004h');
    expect(tracker.isActive()).toBe(false);
  });

  it('supports legacy mode 1047 (enter/exit)', () => {
    tracker.process('\x1b[?1047h');
    expect(tracker.isActive()).toBe(true);
    tracker.process('\x1b[?1047l');
    expect(tracker.isActive()).toBe(false);
  });

  it('supports legacy mode 47 (enter/exit)', () => {
    tracker.process('\x1b[?47h');
    expect(tracker.isActive()).toBe(true);
    tracker.process('\x1b[?47l');
    expect(tracker.isActive()).toBe(false);
  });

  it('applies multiple transitions within a single chunk in order, final state wins', () => {
    // Enter via 1049, then immediately exit via 47 in the same chunk —
    // final state should be inactive.
    tracker.process('\x1b[?1049h some text \x1b[?47l');
    expect(tracker.isActive()).toBe(false);

    // Enter, exit, enter again in one chunk — final state should be active.
    tracker.process('\x1b[?1049h\x1b[?1049l\x1b[?1047h');
    expect(tracker.isActive()).toBe(true);
  });

  it('is incremental across multiple process() calls', () => {
    tracker.process('\x1b[?1049h');
    expect(tracker.isActive()).toBe(true);
    tracker.process('more output without any escape codes');
    expect(tracker.isActive()).toBe(true);
    tracker.process('trailing chunk \x1b[?1049l done');
    expect(tracker.isActive()).toBe(false);
  });

  it('reset() clears state back to inactive', () => {
    tracker.process('\x1b[?1049h');
    expect(tracker.isActive()).toBe(true);
    tracker.reset();
    expect(tracker.isActive()).toBe(false);
  });
});
