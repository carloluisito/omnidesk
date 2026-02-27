import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn((cmd: string, args: string[], cb: Function) => {
    cb(null, '/usr/bin/claude', '');
  }),
}));

import { ClaudeProvider } from './claude-provider';

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    provider = new ClaudeProvider();
  });

  describe('getId()', () => {
    it('returns "claude"', () => {
      expect(provider.getId()).toBe('claude');
    });
  });

  describe('getInfo()', () => {
    it('returns correct shape with all capabilities', () => {
      const info = provider.getInfo();
      expect(info.id).toBe('claude');
      expect(info.displayName).toBe('Claude Code');
      expect(info.cliCommand).toBe('claude');
      expect(info.capabilities.modelSwitching).toBe(true);
      expect(info.capabilities.agentTeams).toBe(true);
      expect(info.capabilities.quota).toBe(true);
      expect(info.capabilities.readinessDetection).toBe(true);
      expect(info.capabilities.permissionModes).toContain('standard');
      expect(info.capabilities.permissionModes).toContain('skip-permissions');
    });
  });

  describe('buildCommand()', () => {
    const baseOptions = { workingDirectory: '/test', permissionMode: 'standard' };

    it('returns "claude" in standard mode', () => {
      const cmd = provider.buildCommand({ ...baseOptions, permissionMode: 'standard' });
      expect(cmd).toBe('claude');
    });

    it('returns "claude --dangerously-skip-permissions" with skip-permissions mode', () => {
      const cmd = provider.buildCommand({ ...baseOptions, permissionMode: 'skip-permissions' });
      expect(cmd).toBe('claude --dangerously-skip-permissions');
    });

    it('appends --model flag when model is specified', () => {
      const cmd = provider.buildCommand({ ...baseOptions, model: 'opus' });
      expect(cmd).toBe('claude --model opus');
    });

    it('omits --model flag when model is "auto"', () => {
      const cmd = provider.buildCommand({ ...baseOptions, model: 'auto' });
      expect(cmd).toBe('claude');
    });

    it('omits --model flag when model is undefined', () => {
      const cmd = provider.buildCommand({ ...baseOptions });
      expect(cmd).toBe('claude');
    });

    it('combines skip-permissions and model flags', () => {
      const cmd = provider.buildCommand({
        ...baseOptions,
        permissionMode: 'skip-permissions',
        model: 'haiku',
      });
      expect(cmd).toBe('claude --dangerously-skip-permissions --model haiku');
    });
  });

  describe('getReadinessPatterns()', () => {
    it('returns a non-empty array', () => {
      const patterns = provider.getReadinessPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('includes "Claude Code"', () => {
      const patterns = provider.getReadinessPatterns();
      expect(patterns).toContain('Claude Code');
    });
  });

  describe('getModelDetectionPatterns()', () => {
    it('returns an object with welcome and switch arrays', () => {
      const patterns = provider.getModelDetectionPatterns();
      expect(Array.isArray(patterns.welcome)).toBe(true);
      expect(Array.isArray(patterns.switch)).toBe(true);
    });

    it('welcome array is non-empty', () => {
      const { welcome } = provider.getModelDetectionPatterns();
      expect(welcome.length).toBeGreaterThan(0);
    });

    it('switch array is non-empty', () => {
      const { switch: switchPatterns } = provider.getModelDetectionPatterns();
      expect(switchPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('normalizeModel()', () => {
    it('normalizes "sonnet" to "sonnet"', () => {
      expect(provider.normalizeModel('sonnet')).toBe('sonnet');
    });

    it('normalizes "opus" to "opus"', () => {
      expect(provider.normalizeModel('opus')).toBe('opus');
    });

    it('returns null for unrecognized model names', () => {
      expect(provider.normalizeModel('unknown_garbage')).toBeNull();
    });
  });

  describe('getEnvironmentVariables()', () => {
    it('returns empty object when agent teams not enabled', () => {
      const env = provider.getEnvironmentVariables();
      expect(env).toEqual({});
    });

    it('returns empty object when enableAgentTeams is false', () => {
      const env = provider.getEnvironmentVariables({ enableAgentTeams: false });
      expect(env).toEqual({});
    });

    it('includes CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS when agent teams enabled', () => {
      const env = provider.getEnvironmentVariables({ enableAgentTeams: true });
      expect(env).toHaveProperty('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS', '1');
    });
  });
});
