import { describe, it, expect } from 'vitest';
import { detectTouchMode } from './useTouchMode';

const win = (over: Partial<{ remote: boolean; coarse: boolean; search: string }>) => ({
  __OMNIDESK_REMOTE__: over.remote,
  location: { search: over.search ?? '' },
  matchMedia: (q: string) => ({ matches: q === '(pointer: coarse)' ? !!over.coarse : false }),
});

describe('detectTouchMode', () => {
  it('is true for a remote client on a coarse-pointer device', () => {
    expect(detectTouchMode(win({ remote: true, coarse: true }), { maxTouchPoints: 0 })).toBe(true);
  });
  it('is true for a remote client with touch points', () => {
    expect(detectTouchMode(win({ remote: true, coarse: false }), { maxTouchPoints: 5 })).toBe(true);
  });
  it('is false on the desktop (not remote), even with touch', () => {
    expect(detectTouchMode(win({ remote: false, coarse: true }), { maxTouchPoints: 5 })).toBe(false);
  });
  it('is false for a remote desktop browser (no touch, fine pointer)', () => {
    expect(detectTouchMode(win({ remote: true, coarse: false }), { maxTouchPoints: 0 })).toBe(false);
  });
  it('honors ?touch=1 override anywhere', () => {
    expect(detectTouchMode(win({ remote: false, search: '?touch=1' }), { maxTouchPoints: 0 })).toBe(true);
  });
  it('honors ?touch=0 override even on a real touch device', () => {
    expect(detectTouchMode(win({ remote: true, coarse: true, search: '?touch=0' }), { maxTouchPoints: 5 })).toBe(false);
  });
});
