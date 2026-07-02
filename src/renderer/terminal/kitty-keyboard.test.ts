import { describe, it, expect } from 'vitest';
import { KittyKeyboardState, encodeKittyKey, KITTY_DISAMBIGUATE, KITTY_REPORT_EVENTS, KITTY_REPORT_ALL_KEYS } from './kitty-keyboard';

describe('KittyKeyboardState', () => {
  it('starts with no flags', () => {
    expect(new KittyKeyboardState().flags).toBe(0);
  });

  it('push (CSI > flags u) sets active flags', () => {
    const s = new KittyKeyboardState();
    expect(s.processOutput('\x1b[>1u')).toBe('');
    expect(s.flags).toBe(1);
  });

  it('set (CSI = flags ; mode u), mode 1 replaces', () => {
    const s = new KittyKeyboardState();
    s.processOutput('\x1b[>1u');
    s.processOutput('\x1b[=5;1u');
    expect(s.flags).toBe(5);
  });

  it('set mode 2 ORs bits, mode 3 clears bits', () => {
    const s = new KittyKeyboardState();
    s.processOutput('\x1b[>1u');     // 1
    s.processOutput('\x1b[=4;2u');   // OR 4 -> 5
    expect(s.flags).toBe(5);
    s.processOutput('\x1b[=1;3u');   // clear 1 -> 4
    expect(s.flags).toBe(4);
  });

  it('pop (CSI < u) restores the previous pushed entry', () => {
    const s = new KittyKeyboardState();
    s.processOutput('\x1b[>1u');
    s.processOutput('\x1b[>8u');
    expect(s.flags).toBe(8);
    s.processOutput('\x1b[<u');
    expect(s.flags).toBe(1);
  });

  it('query (CSI ? u) returns CSI ? <flags> u for the current flags', () => {
    const s = new KittyKeyboardState();
    expect(s.processOutput('\x1b[?u')).toBe('\x1b[?0u');
    s.processOutput('\x1b[>9u');
    expect(s.processOutput('\x1b[?u')).toBe('\x1b[?9u');
  });

  it('main and alternate screens keep separate stacks', () => {
    const s = new KittyKeyboardState();
    s.processOutput('\x1b[>1u');        // main flags = 1
    s.processOutput('\x1b[?1049h');     // enter alt screen
    expect(s.flags).toBe(0);            // alt stack empty
    s.processOutput('\x1b[>8u');        // alt flags = 8
    expect(s.flags).toBe(8);
    s.processOutput('\x1b[?1049l');     // leave alt screen
    expect(s.flags).toBe(1);            // main stack restored
  });

  it('reassembles sequences split across chunks', () => {
    const s = new KittyKeyboardState();
    expect(s.processOutput('\x1b[>')).toBe('');
    s.processOutput('1u');
    expect(s.flags).toBe(1);
  });

  it('ignores unrelated output and passes it by without effect', () => {
    const s = new KittyKeyboardState();
    s.processOutput('hello \x1b[31mworld\x1b[0m\r\n');
    expect(s.flags).toBe(0);
  });

  it('reset() clears both stacks and screen state', () => {
    const s = new KittyKeyboardState();
    s.processOutput('\x1b[>9u');
    s.reset();
    expect(s.flags).toBe(0);
  });

  it('caps the carry buffer against a pathological unterminated CSI and still recovers', () => {
    const s = new KittyKeyboardState();
    s.processOutput('\x1b[>' + '1'.repeat(5000)); // no final byte — must not grow carry without bound
    // A subsequent well-formed sequence is still parsed correctly:
    expect(s.processOutput('\x1b[>1u')).toBe('');
    expect(s.flags).toBe(1);
  });
});

// Minimal KeyboardEvent-like stub (jsdom provides KeyboardEvent, but we set .code too).
function key(init: Partial<KeyboardEvent> & { code?: string }): KeyboardEvent {
  return { type: 'keydown', key: '', code: '', ctrlKey: false, shiftKey: false,
           altKey: false, metaKey: false, ...init } as KeyboardEvent;
}

describe('encodeKittyKey', () => {
  it('returns null when no flags are active', () => {
    expect(encodeKittyKey(key({ key: 'a', code: 'KeyA' }), 0)).toBeNull();
  });

  it('disambiguate: plain text key passes through to xterm', () => {
    expect(encodeKittyKey(key({ key: 'a', code: 'KeyA' }), KITTY_DISAMBIGUATE)).toBeNull();
  });

  it('disambiguate: Ctrl+C -> CSI 99 ; 5 u', () => {
    expect(encodeKittyKey(key({ key: 'c', code: 'KeyC', ctrlKey: true }), KITTY_DISAMBIGUATE))
      .toBe('\x1b[99;5u');
  });

  it('disambiguate: Escape -> CSI 27 u', () => {
    expect(encodeKittyKey(key({ key: 'Escape', code: 'Escape' }), KITTY_DISAMBIGUATE))
      .toBe('\x1b[27u');
  });

  it('disambiguate: Alt+a -> CSI 97 ; 3 u', () => {
    expect(encodeKittyKey(key({ key: 'a', code: 'KeyA', altKey: true }), KITTY_DISAMBIGUATE))
      .toBe('\x1b[97;3u');
  });

  it('disambiguate: Enter/Tab/Backspace pass through', () => {
    const f = KITTY_DISAMBIGUATE;
    expect(encodeKittyKey(key({ key: 'Enter', code: 'Enter' }), f)).toBeNull();
    expect(encodeKittyKey(key({ key: 'Tab', code: 'Tab' }), f)).toBeNull();
    expect(encodeKittyKey(key({ key: 'Backspace', code: 'Backspace' }), f)).toBeNull();
  });

  it('disambiguate: arrows pass through to xterm', () => {
    expect(encodeKittyKey(key({ key: 'ArrowUp', code: 'ArrowUp' }), KITTY_DISAMBIGUATE)).toBeNull();
  });

  it('report-all-keys: plain a -> CSI 97 u', () => {
    expect(encodeKittyKey(key({ key: 'a', code: 'KeyA' }), KITTY_DISAMBIGUATE | KITTY_REPORT_ALL_KEYS))
      .toBe('\x1b[97u');
  });

  it('report-all-keys: Enter -> CSI 13 u', () => {
    expect(encodeKittyKey(key({ key: 'Enter', code: 'Enter' }), KITTY_DISAMBIGUATE | KITTY_REPORT_ALL_KEYS))
      .toBe('\x1b[13u');
  });

  it('uses the UNSHIFTED codepoint: Shift+a -> CSI 97 ; 2 u (report-all)', () => {
    expect(encodeKittyKey(
      key({ key: 'A', code: 'KeyA', shiftKey: true }),
      KITTY_DISAMBIGUATE | KITTY_REPORT_ALL_KEYS,
    )).toBe('\x1b[97;2u');
  });

  it('release events only when report-events flag set', () => {
    const up = key({ type: 'keyup', key: 'a', code: 'KeyA' });
    expect(encodeKittyKey(up, KITTY_DISAMBIGUATE | KITTY_REPORT_ALL_KEYS)).toBeNull();
    expect(encodeKittyKey(up, KITTY_DISAMBIGUATE | KITTY_REPORT_ALL_KEYS | KITTY_REPORT_EVENTS))
      .toBe('\x1b[97;1:3u');
  });

  it('bare modifier keys are not encoded (v1 passthrough)', () => {
    expect(encodeKittyKey(key({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }),
      KITTY_DISAMBIGUATE | KITTY_REPORT_ALL_KEYS)).toBeNull();
  });
});
