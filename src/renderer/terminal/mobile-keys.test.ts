import { describe, it, expect } from 'vitest';
import { KEY_BYTES, ctrlByte, stickyCtrlReducer } from './mobile-keys';

describe('KEY_BYTES', () => {
  it('encodes special keys as the correct control sequences', () => {
    expect(KEY_BYTES.esc).toBe('\x1b');
    expect(KEY_BYTES.tab).toBe('\x09');
    expect(KEY_BYTES.enter).toBe('\r');
    expect(KEY_BYTES.newline).toBe('\n');
    expect(KEY_BYTES.up).toBe('\x1b[A');
    expect(KEY_BYTES.down).toBe('\x1b[B');
    expect(KEY_BYTES.right).toBe('\x1b[C');
    expect(KEY_BYTES.left).toBe('\x1b[D');
  });
});

describe('ctrlByte', () => {
  it('maps ctrl+letter to its control code', () => {
    expect(ctrlByte('c')).toBe('\x03'); // ETX / SIGINT
    expect(ctrlByte('C')).toBe('\x03'); // case-insensitive
    expect(ctrlByte('a')).toBe('\x01');
    expect(ctrlByte('z')).toBe('\x1a');
  });
  it('returns null for keys without a ctrl mapping', () => {
    expect(ctrlByte('1')).toBeNull();
    expect(ctrlByte('esc')).toBeNull();
  });
});

describe('stickyCtrlReducer', () => {
  it('arms on press and disarms after consuming a key or toggling off', () => {
    expect(stickyCtrlReducer({ armed: false }, { type: 'toggle' })).toEqual({ armed: true });
    expect(stickyCtrlReducer({ armed: true }, { type: 'toggle' })).toEqual({ armed: false });
    expect(stickyCtrlReducer({ armed: true }, { type: 'consume' })).toEqual({ armed: false });
    expect(stickyCtrlReducer({ armed: false }, { type: 'consume' })).toEqual({ armed: false });
  });
});
