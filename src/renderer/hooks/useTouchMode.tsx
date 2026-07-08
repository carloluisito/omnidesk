import { createContext, useContext, useState, type ReactNode } from 'react';

interface TouchWindow {
  __OMNIDESK_REMOTE__?: boolean;
  location?: { search: string };
  matchMedia?: (q: string) => { matches: boolean };
}

/** Pure, testable resolver. Touch mode is remote-only so the Electron desktop
 *  never enters it. `?touch=1|0` forces the result for testing on any browser. */
export function detectTouchMode(
  win: TouchWindow,
  nav: { maxTouchPoints?: number },
): boolean {
  const params = new URLSearchParams(win.location?.search ?? '');
  const override = params.get('touch');
  if (override === '1') return true;
  if (override === '0') return false;
  if (win.__OMNIDESK_REMOTE__ !== true) return false;
  const coarse = win.matchMedia?.('(pointer: coarse)').matches ?? false;
  const touch = (nav.maxTouchPoints ?? 0) > 0;
  return coarse || touch;
}

const TouchModeContext = createContext(false);

export function TouchModeProvider({ children }: { children: ReactNode }) {
  // Resolved once — touch capability does not change during a session.
  const [touch] = useState(() => detectTouchMode(window as TouchWindow, navigator));
  return <TouchModeContext.Provider value={touch}>{children}</TouchModeContext.Provider>;
}

export function useTouchMode(): boolean {
  return useContext(TouchModeContext);
}
