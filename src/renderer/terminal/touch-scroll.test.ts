import { describe, it, expect } from 'vitest';
import { takeScrollLines, TOUCH_SCROLL_THRESHOLD_PX } from './touch-scroll';

describe('takeScrollLines', () => {
  it('drag up (positive accum) scrolls down toward newest', () => {
    expect(takeScrollLines(40, 20)).toEqual({ lines: 2, remainderPx: 0 });
  });

  it('drag down (negative accum) scrolls up toward oldest', () => {
    expect(takeScrollLines(-40, 20)).toEqual({ lines: -2, remainderPx: 0 });
  });

  it('carries the sub-row remainder forward instead of dropping it', () => {
    const first = takeScrollLines(25, 20);
    expect(first.lines).toBe(1);
    expect(first.remainderPx).toBe(5);
    // Next move adds 18px: 5 carried + 18 = 23 => one more line, 3px carried.
    const second = takeScrollLines(first.remainderPx + 18, 20);
    expect(second.lines).toBe(1);
    expect(second.remainderPx).toBe(3);
  });

  it('accumulating sub-row moves eventually scrolls a full row', () => {
    // Six 4px nudges = 24px > one 20px row.
    let accum = 0;
    let total = 0;
    for (let i = 0; i < 6; i++) {
      const step = takeScrollLines(accum + 4, 20);
      accum = step.remainderPx;
      total += step.lines;
    }
    expect(total).toBe(1);
  });

  it('is a no-op for a non-positive or non-finite row height', () => {
    expect(takeScrollLines(100, 0)).toEqual({ lines: 0, remainderPx: 0 });
    expect(takeScrollLines(100, -20)).toEqual({ lines: 0, remainderPx: 0 });
    expect(takeScrollLines(100, NaN)).toEqual({ lines: 0, remainderPx: 0 });
  });

  it('exposes a tap/scroll threshold', () => {
    expect(TOUCH_SCROLL_THRESHOLD_PX).toBeGreaterThan(0);
  });
});
