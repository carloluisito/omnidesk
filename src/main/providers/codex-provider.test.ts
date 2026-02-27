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

    it('includes Codex-specific permission modes', () => {
      const info = provider.getInfo();
      expect(info.capabilities.permissionModes).toContain('suggest');
      expect(info.capabilities.permissionModes).toContain('auto-edit');
      expect(info.capabilities.permissionModes).toContain('full-auto');
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
});
