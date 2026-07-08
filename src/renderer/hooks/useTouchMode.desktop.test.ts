import { describe, it, expect } from 'vitest';
import { detectTouchMode } from './useTouchMode';

// The Electron desktop has no __OMNIDESK_REMOTE__ flag. Even on a touchscreen
// laptop (coarse pointer + touch points), touch mode MUST stay false so the
// desktop shell is never replaced.
describe('desktop is never touch mode', () => {
  it('stays false without the remote flag regardless of touch capability', () => {
    const desktopWin = { location: { search: '' }, matchMedia: () => ({ matches: true }) };
    expect(detectTouchMode(desktopWin, { maxTouchPoints: 10 })).toBe(false);
  });
});
