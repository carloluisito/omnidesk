/**
 * Tests for availability.ts — pure availability detector for Agent View.
 * Each test maps to a spec rule; comments cite the rule number from the plan.
 */

import { describe, it, expect } from 'vitest';
import { getAgentViewAvailability } from './availability';
import type { AgentViewAvailability } from '../../shared/types/agent-view-types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Minimal no-op env and settings so individual tests only set what they need. */
const BASE_ENV: NodeJS.ProcessEnv = {};
const BASE_SETTINGS: Record<string, unknown> = {};

function availabilityFor(overrides: {
  cliVersion?: string | null;
  env?: NodeJS.ProcessEnv;
  settings?: Record<string, unknown>;
}): AgentViewAvailability {
  return getAgentViewAvailability({
    // explicit undefined check — null is a meaningful test input (cli-not-found case)
    cliVersion: overrides.cliVersion !== undefined ? overrides.cliVersion : '2.1.139',
    env: overrides.env ?? BASE_ENV,
    settings: overrides.settings ?? BASE_SETTINGS,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getAgentViewAvailability', () => {
  // ---------------------------------------------------------------------------
  // Rule 1 — env var CLAUDE_CODE_DISABLE_AGENT_VIEW
  // ---------------------------------------------------------------------------

  describe('env var CLAUDE_CODE_DISABLE_AGENT_VIEW', () => {
    it('env var set to "1" → disabled-by-env', () => {
      const r = availabilityFor({ env: { CLAUDE_CODE_DISABLE_AGENT_VIEW: '1' } });
      expect(r.status).toBe('unavailable');
      if (r.status === 'unavailable') {
        expect(r.reason).toBe('disabled-by-env');
      }
    });

    it('env var set to "true" → disabled-by-env', () => {
      const r = availabilityFor({ env: { CLAUDE_CODE_DISABLE_AGENT_VIEW: 'true' } });
      expect(r.status).toBe('unavailable');
      if (r.status === 'unavailable') {
        expect(r.reason).toBe('disabled-by-env');
      }
    });

    it('env var set to "yes" → disabled-by-env', () => {
      const r = availabilityFor({ env: { CLAUDE_CODE_DISABLE_AGENT_VIEW: 'yes' } });
      expect(r.status).toBe('unavailable');
      if (r.status === 'unavailable') {
        expect(r.reason).toBe('disabled-by-env');
      }
    });

    it('env var set to "0" → NOT disabled (passes through to next rule)', () => {
      // cliVersion is valid, settings are clean → should be available
      const r = availabilityFor({ env: { CLAUDE_CODE_DISABLE_AGENT_VIEW: '0' } });
      expect(r.status).toBe('available');
    });

    it('env var set to "false" → NOT disabled (passes through to next rule)', () => {
      const r = availabilityFor({ env: { CLAUDE_CODE_DISABLE_AGENT_VIEW: 'false' } });
      expect(r.status).toBe('available');
    });

    it('env var set to "FALSE" (uppercase) → NOT disabled', () => {
      const r = availabilityFor({ env: { CLAUDE_CODE_DISABLE_AGENT_VIEW: 'FALSE' } });
      expect(r.status).toBe('available');
    });

    it('env var unset → NOT disabled', () => {
      const r = availabilityFor({ env: {} });
      expect(r.status).toBe('available');
    });

    it('env var set to undefined → NOT disabled', () => {
      const r = availabilityFor({ env: { CLAUDE_CODE_DISABLE_AGENT_VIEW: undefined } });
      expect(r.status).toBe('available');
    });

    it('detail is "CLAUDE_CODE_DISABLE_AGENT_VIEW is set to \\"yes\\""', () => {
      const r = availabilityFor({ env: { CLAUDE_CODE_DISABLE_AGENT_VIEW: 'yes' } });
      if (r.status === 'unavailable') {
        expect(r.detail).toBe('CLAUDE_CODE_DISABLE_AGENT_VIEW is set to "yes"');
      }
    });

    it('env disable wins over a settings disable (precedence: env first)', () => {
      const r = availabilityFor({
        env: { CLAUDE_CODE_DISABLE_AGENT_VIEW: '1' },
        settings: { disableAgentView: true },
      });
      expect(r.status).toBe('unavailable');
      if (r.status === 'unavailable') {
        // env rule fires first, so reason must be env-disabled not settings-disabled
        expect(r.reason).toBe('disabled-by-env');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Rule 2 — settings.disableAgentView
  // ---------------------------------------------------------------------------

  describe('settings.disableAgentView', () => {
    it('settings disableAgentView: true → disabled-by-setting', () => {
      const r = availabilityFor({ settings: { disableAgentView: true } });
      expect(r.status).toBe('unavailable');
      if (r.status === 'unavailable') {
        expect(r.reason).toBe('disabled-by-setting');
      }
    });

    it('detail is "disableAgentView is true in settings.json"', () => {
      const r = availabilityFor({ settings: { disableAgentView: true } });
      if (r.status === 'unavailable') {
        expect(r.detail).toBe('disableAgentView is true in settings.json');
      }
    });

    it('settings disableAgentView: "true" (string, truthy but not strict boolean) → NOT disabled', () => {
      // Rule 2 requires strict boolean true — strings are garbage in settings JSON
      const r = availabilityFor({ settings: { disableAgentView: 'true' } });
      expect(r.status).toBe('available');
    });

    it('settings disableAgentView: 1 (number, truthy) → NOT disabled', () => {
      const r = availabilityFor({ settings: { disableAgentView: 1 } });
      expect(r.status).toBe('available');
    });

    it('settings without the key → NOT disabled', () => {
      const r = availabilityFor({ settings: {} });
      expect(r.status).toBe('available');
    });
  });

  // ---------------------------------------------------------------------------
  // Rule 3 — cliVersion: null (CLI not found)
  // ---------------------------------------------------------------------------

  describe('cliVersion: null (cli-not-found)', () => {
    it('cliVersion: null → cli-not-found', () => {
      const r = availabilityFor({ cliVersion: null });
      expect(r.status).toBe('unavailable');
      if (r.status === 'unavailable') {
        expect(r.reason).toBe('cli-not-found');
      }
    });

    it('cli-not-found detail contains expected message', () => {
      const r = availabilityFor({ cliVersion: null });
      if (r.status === 'unavailable') {
        expect(r.detail).toBe('claude binary not found on PATH');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Rule 4 — version-unparseable
  // ---------------------------------------------------------------------------

  describe('version-unparseable', () => {
    it('empty string → version-unparseable', () => {
      const r = availabilityFor({ cliVersion: '' });
      expect(r.status).toBe('unavailable');
      if (r.status === 'unavailable') {
        expect(r.reason).toBe('version-unparseable');
      }
    });

    it('"garbage" → version-unparseable', () => {
      const r = availabilityFor({ cliVersion: 'garbage' });
      expect(r.status).toBe('unavailable');
      if (r.status === 'unavailable') {
        expect(r.reason).toBe('version-unparseable');
      }
    });

    it('"2.1" (only two parts) → version-unparseable', () => {
      const r = availabilityFor({ cliVersion: '2.1' });
      expect(r.status).toBe('unavailable');
      if (r.status === 'unavailable') {
        expect(r.reason).toBe('version-unparseable');
      }
    });

    it('version-unparseable detail is "could not parse claude version \\"bad-version\\""', () => {
      const r = availabilityFor({ cliVersion: 'bad-version' });
      if (r.status === 'unavailable') {
        expect(r.detail).toBe('could not parse claude version "bad-version"');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Rule 5 — cli-too-old
  // ---------------------------------------------------------------------------

  describe('cli-too-old', () => {
    it('"2.1.138" (one patch below minimum) → cli-too-old', () => {
      const r = availabilityFor({ cliVersion: '2.1.138' });
      expect(r.status).toBe('unavailable');
      if (r.status === 'unavailable') {
        expect(r.reason).toBe('cli-too-old');
      }
    });

    it('"1.99.999" (major too low) → cli-too-old', () => {
      const r = availabilityFor({ cliVersion: '1.99.999' });
      expect(r.status).toBe('unavailable');
      if (r.status === 'unavailable') {
        expect(r.reason).toBe('cli-too-old');
      }
    });

    it('"2.1.138-beta.1" (pre-release doesn\'t rescue a too-low base) → cli-too-old', () => {
      const r = availabilityFor({ cliVersion: '2.1.138-beta.1' });
      expect(r.status).toBe('unavailable');
      if (r.status === 'unavailable') {
        expect(r.reason).toBe('cli-too-old');
      }
    });

    it('cli-too-old detail is "claude 2.1.138 is below the minimum 2.1.139"', () => {
      const r = availabilityFor({ cliVersion: '2.1.138' });
      if (r.status === 'unavailable') {
        expect(r.detail).toBe('claude 2.1.138 is below the minimum 2.1.139');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Rule 6 — available
  // ---------------------------------------------------------------------------

  describe('available (at or above minimum)', () => {
    it('"2.1.139" (exactly the minimum) → available', () => {
      const r = availabilityFor({ cliVersion: '2.1.139' });
      expect(r.status).toBe('available');
    });

    it('"2.1.140" → available', () => {
      const r = availabilityFor({ cliVersion: '2.1.140' });
      expect(r.status).toBe('available');
    });

    it('"2.2.0" → available', () => {
      const r = availabilityFor({ cliVersion: '2.2.0' });
      expect(r.status).toBe('available');
    });

    it('"3.0.0" → available', () => {
      const r = availabilityFor({ cliVersion: '3.0.0' });
      expect(r.status).toBe('available');
    });

    it('"v2.1.139" (leading v prefix accepted) → available', () => {
      const r = availabilityFor({ cliVersion: 'v2.1.139' });
      expect(r.status).toBe('available');
    });

    it('"2.1.139-beta.1" (pre-release suffix ignored for comparison) → available', () => {
      const r = availabilityFor({ cliVersion: '2.1.139-beta.1' });
      expect(r.status).toBe('available');
    });

    it('"2.1.139+sha.abc" (build metadata ignored) → available', () => {
      const r = availabilityFor({ cliVersion: '2.1.139+sha.abc' });
      expect(r.status).toBe('available');
    });

    it('available result carries the raw cliVersion string', () => {
      const r = availabilityFor({ cliVersion: '2.1.139' });
      if (r.status === 'available') {
        expect(r.cliVersion).toBe('2.1.139');
      }
    });

    it('available result carries the raw cliVersion including leading v', () => {
      const r = availabilityFor({ cliVersion: 'v2.1.139' });
      if (r.status === 'available') {
        expect(r.cliVersion).toBe('v2.1.139');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Type-narrowing sanity
  // ---------------------------------------------------------------------------

  describe('type-narrowing discriminated union', () => {
    it('narrowing on status === "available" allows reading cliVersion without cast', () => {
      const r: AgentViewAvailability = getAgentViewAvailability({
        cliVersion: '2.1.139',
        env: {},
        settings: {},
      });
      // If the discriminated union is correct, TypeScript allows r.cliVersion here
      // without an `as` cast. The test body exercises this at runtime.
      if (r.status === 'available') {
        expect(r.cliVersion).toBe('2.1.139');
      } else {
        // Should not reach here for this input, but we don't throw — just fail loudly.
        expect(r.status).toBe('available');
      }
    });
  });
});
