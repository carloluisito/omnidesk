import { describe, it, expect } from 'vitest';
import { shouldShowCloseDialog, isNewlineChord } from './shell-key-rules';

describe('shouldShowCloseDialog', () => {
  it('intercepts Ctrl+C for agent sessions in legacy mode', () => {
    expect(shouldShowCloseDialog('\x03', 0, 'agent')).toBe(true);
    expect(shouldShowCloseDialog('\x03', 0, undefined)).toBe(true); // back-compat
  });
  it('passes Ctrl+C through for shell sessions', () => {
    expect(shouldShowCloseDialog('\x03', 0, 'shell')).toBe(false);
  });
  it('does not intercept under kitty flags or for other data', () => {
    expect(shouldShowCloseDialog('\x03', 1, 'agent')).toBe(false);
    expect(shouldShowCloseDialog('a', 0, 'agent')).toBe(false);
  });
});

describe('isNewlineChord', () => {
  const enter = (mods: Partial<Record<'ctrlKey'|'shiftKey'|'altKey'|'metaKey', boolean>>) =>
    ({ key: 'Enter', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });
  it('is a newline chord for agent sessions with a modifier', () => {
    expect(isNewlineChord(enter({ ctrlKey: true }), 'agent')).toBe(true);
    expect(isNewlineChord(enter({ shiftKey: true }), undefined)).toBe(true);
  });
  it('is never a chord for shell sessions', () => {
    expect(isNewlineChord(enter({ ctrlKey: true }), 'shell')).toBe(false);
  });
  it('is not a chord without a modifier or non-Enter keys', () => {
    expect(isNewlineChord(enter({}), 'agent')).toBe(false);
    expect(isNewlineChord({ key: 'a', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false }, 'agent')).toBe(false);
  });
});
