import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn((cmd: string, args: string[], cb: Function) => {
    cb(null, '/usr/bin/claude', '');
  }),
}));

import { ProviderRegistry } from './provider-registry';
import { ClaudeProvider } from './claude-provider';
import { CodexProvider } from './codex-provider';

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('auto-registers Claude provider on construction', () => {
    const provider = registry.get('claude');
    expect(provider).toBeInstanceOf(ClaudeProvider);
  });

  it('auto-registers Codex provider on construction', () => {
    const provider = registry.get('codex');
    expect(provider).toBeInstanceOf(CodexProvider);
  });

  it('list() returns info for both providers', () => {
    const list = registry.list();
    expect(list).toHaveLength(2);
    const ids = list.map(p => p.id);
    expect(ids).toContain('claude');
    expect(ids).toContain('codex');
  });

  it('get("claude") returns ClaudeProvider', () => {
    const provider = registry.get('claude');
    expect(provider.getId()).toBe('claude');
  });

  it('get("codex") returns CodexProvider', () => {
    const provider = registry.get('codex');
    expect(provider.getId()).toBe('codex');
  });

  it('get("unknown") throws an error', () => {
    // Cast to any to test invalid id at runtime
    expect(() => registry.get('unknown' as any)).toThrow('Provider not found: unknown');
  });

  it('getAvailable() returns providers whose isAvailable() resolves true', async () => {
    // The child_process mock returns no error, so isAvailable() returns true for both
    const available = await registry.getAvailable();
    expect(available.length).toBeGreaterThanOrEqual(1);
    const ids = available.map(p => p.id);
    expect(ids).toContain('claude');
  });

  it('getAvailable() excludes providers whose isAvailable() resolves false', async () => {
    const { execFile } = await import('child_process');
    // Make execFile call the callback with an error to simulate unavailable binaries
    vi.mocked(execFile).mockImplementation((cmd: string, args: string[], cb: Function) => {
      cb(new Error('not found'), '', '');
    });

    const available = await registry.getAvailable();
    expect(available).toHaveLength(0);
  });

  it('register() adds a new provider', () => {
    const fakeProvider = {
      getId: () => 'claude' as const,
      getInfo: () => ({
        id: 'claude' as const,
        displayName: 'Mock',
        cliCommand: 'mock',
        capabilities: {
          modelSwitching: false,
          agentTeams: false,
          quota: false,
          readinessDetection: false,
          permissionModes: [],
        },
      }),
      isAvailable: async () => true,
      buildCommand: () => 'mock',
      getReadinessPatterns: () => [],
      getModelDetectionPatterns: () => ({ welcome: [], switch: [] }),
      getEnvironmentVariables: () => ({}),
      normalizeModel: () => null,
    };

    registry.register(fakeProvider);
    expect(registry.get('claude')).toBe(fakeProvider);
  });
});
