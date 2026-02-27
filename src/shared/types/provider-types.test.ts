import { describe, it, expect } from 'vitest';
import type { ProviderId, ProviderCapabilities, ProviderInfo } from './provider-types';

describe('provider-types', () => {
  describe('ProviderId', () => {
    it('accepts claude as a valid ProviderId', () => {
      const id: ProviderId = 'claude';
      expect(id).toBe('claude');
    });

    it('accepts codex as a valid ProviderId', () => {
      const id: ProviderId = 'codex';
      expect(id).toBe('codex');
    });
  });

  describe('ProviderCapabilities', () => {
    it('creates a ProviderCapabilities object with correct shape', () => {
      const caps: ProviderCapabilities = {
        modelSwitching: true,
        agentTeams: false,
        quota: true,
        readinessDetection: true,
        permissionModes: ['standard', 'skip-permissions'],
      };

      expect(caps.modelSwitching).toBe(true);
      expect(caps.agentTeams).toBe(false);
      expect(caps.quota).toBe(true);
      expect(caps.readinessDetection).toBe(true);
      expect(caps.permissionModes).toEqual(['standard', 'skip-permissions']);
    });

    it('permissionModes is an array of strings', () => {
      const caps: ProviderCapabilities = {
        modelSwitching: false,
        agentTeams: false,
        quota: false,
        readinessDetection: false,
        permissionModes: [],
      };

      expect(Array.isArray(caps.permissionModes)).toBe(true);
    });
  });

  describe('ProviderInfo', () => {
    it('creates a ProviderInfo object for Claude with correct shape', () => {
      const info: ProviderInfo = {
        id: 'claude',
        displayName: 'Claude Code',
        cliCommand: 'claude',
        capabilities: {
          modelSwitching: true,
          agentTeams: true,
          quota: true,
          readinessDetection: true,
          permissionModes: ['standard', 'skip-permissions'],
        },
      };

      expect(info.id).toBe('claude');
      expect(info.displayName).toBe('Claude Code');
      expect(info.cliCommand).toBe('claude');
      expect(info.capabilities.modelSwitching).toBe(true);
      expect(info.defaultModel).toBeUndefined();
    });

    it('creates a ProviderInfo object for Codex with defaultModel', () => {
      const info: ProviderInfo = {
        id: 'codex',
        displayName: 'Codex CLI',
        cliCommand: 'codex',
        capabilities: {
          modelSwitching: true,
          agentTeams: false,
          quota: false,
          readinessDetection: true,
          permissionModes: ['suggest', 'auto-edit', 'full-auto'],
        },
        defaultModel: 'codex-mini',
      };

      expect(info.id).toBe('codex');
      expect(info.defaultModel).toBe('codex-mini');
      expect(info.capabilities.agentTeams).toBe(false);
      expect(info.capabilities.quota).toBe(false);
    });

    it('defaultModel is optional', () => {
      const withModel: ProviderInfo = {
        id: 'codex',
        displayName: 'Codex CLI',
        cliCommand: 'codex',
        capabilities: {
          modelSwitching: true,
          agentTeams: false,
          quota: false,
          readinessDetection: true,
          permissionModes: [],
        },
        defaultModel: 'o3',
      };

      const withoutModel: ProviderInfo = {
        id: 'claude',
        displayName: 'Claude Code',
        cliCommand: 'claude',
        capabilities: {
          modelSwitching: true,
          agentTeams: true,
          quota: true,
          readinessDetection: true,
          permissionModes: ['standard'],
        },
      };

      expect(withModel.defaultModel).toBe('o3');
      expect(withoutModel.defaultModel).toBeUndefined();
    });
  });
});
