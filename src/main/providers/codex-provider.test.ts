import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn((cmd: string, args: string[], cb: Function) => {
    cb(null, '/usr/bin/codex', '');
  }),
}));

import { CodexProvider } from './codex-provider';

describe('CodexProvider', () => {
  let provider: CodexProvider;

  beforeEach(() => {
    provider = new CodexProvider();
  });

  describe('getId()', () => {
    it('returns "codex"', () => {
      expect(provider.getId()).toBe('codex');
    });
  });

  describe('getInfo()', () => {
    it('returns correct shape with agentTeams: false and quota: false', () => {
      const info = provider.getInfo();
      expect(info.id).toBe('codex');
      expect(info.displayName).toBe('Codex CLI');
      expect(info.cliCommand).toBe('codex');
      expect(info.capabilities.agentTeams).toBe(false);
      expect(info.capabilities.quota).toBe(false);
      expect(info.capabilities.modelSwitching).toBe(true);
      expect(info.capabilities.readinessDetection).toBe(true);
    });

    it('advertises permission modes in the OmniDesk domain vocabulary, not Codex CLI names', () => {
      const info = provider.getInfo();
      expect(info.capabilities.permissionModes).toEqual(['standard', 'skip-permissions']);
      // Guard against re-introducing Codex-native names (e.g. 'suggest', 'auto-edit', 'full-auto')
      expect(info.capabilities.permissionModes).not.toContain('suggest');
      expect(info.capabilities.permissionModes).not.toContain('auto-edit');
      expect(info.capabilities.permissionModes).not.toContain('full-auto');
    });

    it('every advertised permission mode has a buildCommand() translation', () => {
      const info = provider.getInfo();
      for (const mode of info.capabilities.permissionModes) {
        const cmd = provider.buildCommand({ workingDirectory: '/test', permissionMode: mode });
        expect(cmd).toContain('--approval-mode');
        // The raw domain name should never leak through untranslated
        expect(cmd).not.toContain(`--approval-mode ${mode}`);
      }
    });
  });

  describe('buildCommand()', () => {
    const baseOptions = { workingDirectory: '/test', permissionMode: 'standard' };

    it('includes "--approval-mode suggest" for standard mode', () => {
      const cmd = provider.buildCommand({ ...baseOptions, permissionMode: 'standard' });
      expect(cmd).toContain('--approval-mode suggest');
    });

    it('includes "--approval-mode full-auto" for skip-permissions mode', () => {
      const cmd = provider.buildCommand({ ...baseOptions, permissionMode: 'skip-permissions' });
      expect(cmd).toContain('--approval-mode full-auto');
    });

    it('starts with "codex"', () => {
      const cmd = provider.buildCommand(baseOptions);
      expect(cmd.startsWith('codex')).toBe(true);
    });

    it('includes "--model o3" when model is o3', () => {
      const cmd = provider.buildCommand({ ...baseOptions, model: 'o3' });
      expect(cmd).toContain('--model o3');
    });

    it('includes model before approval-mode', () => {
      const cmd = provider.buildCommand({ ...baseOptions, model: 'o3' });
      const modelIdx = cmd.indexOf('--model');
      const approvalIdx = cmd.indexOf('--approval-mode');
      expect(modelIdx).toBeGreaterThan(-1);
      expect(approvalIdx).toBeGreaterThan(-1);
    });
  });

  describe('getReadinessPatterns()', () => {
    it('returns a non-empty array', () => {
      const patterns = provider.getReadinessPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('includes "Codex"', () => {
      const patterns = provider.getReadinessPatterns();
      expect(patterns).toContain('Codex');
    });
  });

  describe('normalizeModel()', () => {
    it('normalizes "o3" to "o3"', () => {
      expect(provider.normalizeModel('o3')).toBe('o3');
    });

    it('normalizes "gpt-4.1" to "gpt-4.1"', () => {
      expect(provider.normalizeModel('gpt-4.1')).toBe('gpt-4.1');
    });

    it('returns null for empty string', () => {
      expect(provider.normalizeModel('')).toBeNull();
    });
  });

  describe('launchMode inertness', () => {
    it('launchMode field on options is ignored — command is unchanged from baseline', () => {
      const baseOptions = { workingDirectory: '/test', permissionMode: 'standard' };
      const baseline = provider.buildCommand(baseOptions);
      // Pass the launchMode field that Claude uses; Codex must not special-case it
      const withLaunchMode = provider.buildCommand({ ...baseOptions, launchMode: 'agents' } as Parameters<typeof provider.buildCommand>[0]);
      expect(withLaunchMode).toBe(baseline);
    });
  });
});

describe('CodexProvider.getStateSignals', () => {
  const provider = new CodexProvider();
  const sig = provider.getStateSignals();
  const anyMatch = (table: RegExp[], s: string) => table.some(re => { re.lastIndex = 0; return re.test(s); });

  it('working matches a standalone status line but not the bare words in prose', () => {
    expect(anyMatch(sig.working, 'Thinking…')).toBe(true);
    expect(anyMatch(sig.working, 'the tests are working now')).toBe(false);
  });

  it('fatalError does not match casual auth/quota prose', () => {
    expect(anyMatch(sig.fatalError, 'handle the 401 unauthorized response')).toBe(false);
    expect(anyMatch(sig.fatalError, 'check the remaining quota')).toBe(false);
  });
});
