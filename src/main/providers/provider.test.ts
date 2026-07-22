import { describe, it, expect } from 'vitest';
import { isSafeModelToken, MODEL_TOKEN_PATTERN } from './provider';

// Direct unit tests for the shared model trust-boundary guard (see #182).
// Pins the accept/reject contract at its source so a widening edit to
// MODEL_TOKEN_PATTERN fails here, not only incidentally in a provider's
// buildCommand tests.

const validTokens = ['claude-sonnet-4-5', 'gpt-4.1', 'o3', 'GPT-4', 'haiku'];

const injectionPayloads = [
  ';rm -rf /',
  '$(whoami)',
  '`whoami`',
  'a b',
  'a|b',
  'a&b',
  'a>b',
  'a\nb',
  '../etc',
  'a/b',
];

describe('isSafeModelToken', () => {
  it.each(validTokens)('accepts valid model token %s', (token) => {
    expect(isSafeModelToken(token)).toBe(true);
  });

  it('rejects undefined', () => {
    expect(isSafeModelToken(undefined)).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(isSafeModelToken('')).toBe(false);
  });

  it.each(injectionPayloads)('rejects injection payload %j', (payload) => {
    expect(isSafeModelToken(payload)).toBe(false);
  });
});

describe('MODEL_TOKEN_PATTERN', () => {
  it.each(validTokens)('matches valid model token %s', (token) => {
    expect(MODEL_TOKEN_PATTERN.test(token)).toBe(true);
  });

  it.each(injectionPayloads)('does not match injection payload %j', (payload) => {
    expect(MODEL_TOKEN_PATTERN.test(payload)).toBe(false);
  });

  it('does not match the empty string', () => {
    expect(MODEL_TOKEN_PATTERN.test('')).toBe(false);
  });
});
