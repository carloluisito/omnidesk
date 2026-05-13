import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn((cmd: string, args: string[], cb: Function) => {
    cb(null, '/usr/bin/claude', '');
  }),
}));

import { ClaudeProvider } from './claude-provider';
import type { AgentViewAvailability } from '../../shared/types/agent-view-types';

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

  describe('launchMode', () => {
    const baseOptions = { workingDirectory: '/test', permissionMode: 'standard' };

    const available: AgentViewAvailability = { status: 'available', cliVersion: '2.1.139' };
    const unavailable: AgentViewAvailability = {
      status: 'unavailable',
      reason: 'cli-too-old',
      detail: 'claude 2.0.0 is below the minimum 2.1.139',
    };

    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('launchMode: "default" → command is "claude"', () => {
      const p = new ClaudeProvider(() => available);
      const cmd = p.buildCommand({ ...baseOptions, launchMode: 'default' });
      expect(cmd).toBe('claude');
    });

    it('launchMode: "bypass-permissions" → command is "claude --dangerously-skip-permissions"', () => {
      const p = new ClaudeProvider(() => available);
      const cmd = p.buildCommand({ ...baseOptions, launchMode: 'bypass-permissions' });
      expect(cmd).toBe('claude --dangerously-skip-permissions');
    });

    it('launchMode: "agents" with available availability → command is "claude agents"', () => {
      const p = new ClaudeProvider(() => available);
      const cmd = p.buildCommand({ ...baseOptions, launchMode: 'agents' });
      expect(cmd).toBe('claude agents');
    });

    it('launchMode: "agents" with unavailable availability → falls back to "claude" and logs a warning', () => {
      const p = new ClaudeProvider(() => unavailable);
      const cmd = p.buildCommand({ ...baseOptions, launchMode: 'agents' });
      expect(cmd).toBe('claude');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnMsg: string = warnSpy.mock.calls[0][0];
      expect(warnMsg).toContain('agents');
      expect(warnMsg).toContain('falling back');
    });

    it('launchMode: undefined (omitted) → command is "claude" (default)', () => {
      const p = new ClaudeProvider(() => available);
      const cmd = p.buildCommand({ ...baseOptions });
      expect(cmd).toBe('claude');
    });

    it('launchMode: "bypass-permissions" combined with model flag', () => {
      const p = new ClaudeProvider(() => available);
      const cmd = p.buildCommand({ ...baseOptions, launchMode: 'bypass-permissions', model: 'haiku' });
      expect(cmd).toBe('claude --dangerously-skip-permissions --model haiku');
    });

    it('launchMode: "agents" combined with model flag → model flag is NOT appended (agents mode has no --model)', () => {
      const p = new ClaudeProvider(() => available);
      const cmd = p.buildCommand({ ...baseOptions, launchMode: 'agents', model: 'opus' });
      expect(cmd).toBe('claude agents');
    });

    it('defaults to unavailable when no availabilityGetter is injected (defense-in-depth)', async () => {
      const provider = new ClaudeProvider(); // no args — relies on default
      const warnSpyDefault = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cmd = provider.buildCommand({ workingDirectory: '/test', permissionMode: 'standard', launchMode: 'agents' });
      expect(cmd).toBe('claude'); // fallback
      expect(warnSpyDefault).toHaveBeenCalledOnce();
      expect(warnSpyDefault.mock.calls[0][0]).toMatch(/agents.*falling back/i);
      warnSpyDefault.mockRestore();
    });

    it('defense-in-depth: warning message contains no user-controlled data — only literal strings', () => {
      // The warning must be a fixed-shape string; no user-supplied value should be interpolated
      // into it (no launchMode value, no cliVersion, no other request fields).
      const unavailableOther: AgentViewAvailability = {
        status: 'unavailable',
        reason: 'disabled-by-env',
        detail: 'CLAUDE_CODE_DISABLE_AGENT_VIEW is set to "1"',
      };
      const p = new ClaudeProvider(() => unavailableOther);
      p.buildCommand({ ...baseOptions, launchMode: 'agents' });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnMsg: string = warnSpy.mock.calls[0][0];
      // Must not interpolate any user-supplied field values into the warning string
      expect(warnMsg).not.toContain('CLAUDE_CODE_DISABLE_AGENT_VIEW');
      expect(warnMsg).not.toContain('"1"');
    });
  });
});
