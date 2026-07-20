import { describe, it, expect } from 'vitest';
import {
  CLAUDE_READY_PATTERNS,
  isClaudeReady,
  findClaudeOutputStart,
  isProviderReady,
  findProviderOutputStart,
} from './claude-detector';

describe('isClaudeReady', () => {
  it('returns true when output contains a single known pattern', () => {
    expect(isClaudeReady('... Tips for getting started ...')).toBe(true);
  });

  it('returns true for each individual pattern in CLAUDE_READY_PATTERNS', () => {
    for (const pattern of CLAUDE_READY_PATTERNS) {
      expect(isClaudeReady(`prefix ${pattern} suffix`)).toBe(true);
    }
  });

  it('returns false for output with no matching pattern', () => {
    expect(isClaudeReady('just a normal shell prompt $ ')).toBe(false);
  });

  it('returns false for the empty string', () => {
    expect(isClaudeReady('')).toBe(false);
  });
});

describe('findClaudeOutputStart', () => {
  it('returns the earliest index when multiple patterns appear out of list order', () => {
    // In CLAUDE_READY_PATTERNS, 'Claude Code' comes before 'Opus', but here 'Opus'
    // appears earlier in the buffer — the earliest buffer index must win regardless
    // of pattern-list order.
    const buffer = 'noise Opus noise Claude Code noise';
    const opusIndex = buffer.indexOf('Opus');
    expect(findClaudeOutputStart(buffer)).toBe(opusIndex);
  });

  it('returns -1 when no pattern is present', () => {
    expect(findClaudeOutputStart('nothing relevant here')).toBe(-1);
  });

  it('returns -1 for the empty string', () => {
    expect(findClaudeOutputStart('')).toBe(-1);
  });

  it('finds a pattern that appears at index 0', () => {
    expect(findClaudeOutputStart('Sonnet is ready')).toBe(0);
  });
});

describe('isProviderReady', () => {
  it('returns true when output matches a caller-supplied pattern', () => {
    expect(isProviderReady('hello world', ['world'])).toBe(true);
  });

  it('returns false when output matches none of the caller-supplied patterns', () => {
    expect(isProviderReady('hello world', ['foo', 'bar'])).toBe(false);
  });

  it('returns false for an empty pattern array', () => {
    expect(isProviderReady('anything', [])).toBe(false);
  });
});

describe('findProviderOutputStart', () => {
  it('returns the earliest index across caller-supplied patterns regardless of list order', () => {
    const buffer = 'noise first noise second noise';
    const firstIndex = buffer.indexOf('first');
    // 'second' is listed before 'first' in the patterns array, but 'first' appears
    // earlier in the buffer, so it must win.
    expect(findProviderOutputStart(buffer, ['second', 'first'])).toBe(firstIndex);
  });

  it('returns -1 when none of the caller-supplied patterns are found', () => {
    expect(findProviderOutputStart('buffer text', ['nope', 'nada'])).toBe(-1);
  });

  it('returns -1 for an empty pattern array', () => {
    expect(findProviderOutputStart('buffer text', [])).toBe(-1);
  });
});

describe('delegation: Claude-specific functions stay in sync with the generic ones', () => {
  it('isClaudeReady matches isProviderReady(output, CLAUDE_READY_PATTERNS) for arbitrary inputs', () => {
    const samples = [
      '',
      'no match here',
      'Welcome back to the tool',
      'Sonnet and Haiku both appear',
      'trailing Recent activity text',
    ];
    for (const sample of samples) {
      expect(isClaudeReady(sample)).toBe(
        isProviderReady(sample, [...CLAUDE_READY_PATTERNS])
      );
    }
  });

  it('findClaudeOutputStart matches findProviderOutputStart(buffer, CLAUDE_READY_PATTERNS) for arbitrary inputs', () => {
    const samples = [
      '',
      'no match here',
      'Haiku appears before Claude Code in this buffer',
      'Claude Code then Opus then Sonnet',
    ];
    for (const sample of samples) {
      expect(findClaudeOutputStart(sample)).toBe(
        findProviderOutputStart(sample, [...CLAUDE_READY_PATTERNS])
      );
    }
  });
});
