/** Byte sequences the on-screen key bar sends. All go through the existing
 *  onInput → WS → PTY path, exactly as if typed on a physical keyboard. */
export const KEY_BYTES: Record<string, string> = {
  esc: '\x1b',
  tab: '\x09',
  enter: '\r',
  newline: '\n',      // the Shift+Enter chord — multi-line prompts to Claude
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
};

/** ctrl+<letter> = charCode & 0x1f. Returns null for keys with no ctrl code. */
export function ctrlByte(key: string): string | null {
  if (key.length !== 1) return null;
  const c = key.toLowerCase();
  if (c >= 'a' && c <= 'z') return String.fromCharCode(c.charCodeAt(0) - 96);
  return null;
}

export interface StickyState { armed: boolean; }
export type StickyAction = { type: 'toggle' } | { type: 'consume' };

/** Sticky Ctrl: tap to arm, next key sends its ctrl byte, then auto-disarms. */
export function stickyCtrlReducer(state: StickyState, action: StickyAction): StickyState {
  switch (action.type) {
    case 'toggle': return { armed: !state.armed };
    case 'consume': return { armed: false };
  }
}
