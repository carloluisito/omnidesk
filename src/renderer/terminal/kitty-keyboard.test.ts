import { describe, it, expect } from 'vitest';
import { KittyKeyboardState } from './kitty-keyboard';

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
});
