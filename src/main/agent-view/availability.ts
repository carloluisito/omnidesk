/**
 * Availability detector for Agent View.
 *
 * Pure function — no fs, no child_process, no electron, no direct process.env
 * reads. All inputs are provided by the caller.
 */

import type { AgentViewAvailability } from '../../shared/types/agent-view-types';

// ---------------------------------------------------------------------------
// Semver helpers
// ---------------------------------------------------------------------------

/** Semver MAJOR.MINOR.PATCH pattern. Leading `v` and trailing pre-release/build metadata are allowed. */
const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

/**
 * Compare two pre-parsed semver tuples numerically by MAJOR.MINOR.PATCH.
 *
 * Returns -1 when a < b, 0 when a === b, 1 when a > b.
 */
function compareSemver(
  a: [number, number, number],
  b: [number, number, number],
): -1 | 0 | 1 {
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

/** Parse a semver string into a [major, minor, patch] tuple, or null if invalid. */
function parseSemver(version: string): [number, number, number] | null {
  const m = SEMVER_RE.exec(version);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MINIMUM_VERSION = '2.1.139';
const MINIMUM_TUPLE = parseSemver(MINIMUM_VERSION) as [number, number, number];

const ENV_VAR_NAME = 'CLAUDE_CODE_DISABLE_AGENT_VIEW';

/**
 * Values that disable the feature when set as the
 * CLAUDE_CODE_DISABLE_AGENT_VIEW env var.
 * Empty string, "0", and "false" (any case) do NOT disable.
 */
function isEnvDisabled(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  if (lower === '0' || lower === 'false') return false;
  return true;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Determine whether Agent View is available given the caller-supplied inputs.
 *
 * Precedence (first match wins):
 * 1. CLAUDE_CODE_DISABLE_AGENT_VIEW env var → disabled-by-env
 * 2. settings.disableAgentView === true (strict boolean) → disabled-by-setting
 * 3. cliVersion === null → cli-not-found
 * 4. cliVersion doesn't match semver → version-unparseable
 * 5. parsed version < 2.1.139 → cli-too-old
 * 6. Otherwise → available
 */
export function getAgentViewAvailability(input: {
  cliVersion: string | null;
  env: NodeJS.ProcessEnv;
  settings: Record<string, unknown>;
}): AgentViewAvailability {
  const { cliVersion, env, settings } = input;

  // Rule 1 — env var kill-switch
  const envValue = env[ENV_VAR_NAME];
  if (isEnvDisabled(envValue)) {
    return {
      status: 'unavailable',
      reason: 'disabled-by-env',
      detail: `${ENV_VAR_NAME} is set to "${envValue}"`,
    };
  }

  // Rule 2 — settings kill-switch (strict boolean only)
  if (settings['disableAgentView'] === true) {
    return {
      status: 'unavailable',
      reason: 'disabled-by-setting',
      detail: 'disableAgentView is true in settings.json',
    };
  }

  // Rule 3 — CLI not found
  if (cliVersion === null) {
    return {
      status: 'unavailable',
      reason: 'cli-not-found',
      detail: 'claude binary not found on PATH',
    };
  }

  // Rule 4 — version unparseable
  const versionTuple = parseSemver(cliVersion);
  if (!versionTuple) {
    return {
      status: 'unavailable',
      reason: 'version-unparseable',
      detail: `could not parse claude version "${cliVersion}"`,
    };
  }

  // Rule 5 — version too old
  if (compareSemver(versionTuple, MINIMUM_TUPLE) < 0) {
    return {
      status: 'unavailable',
      reason: 'cli-too-old',
      detail: `claude ${cliVersion} is below the minimum ${MINIMUM_VERSION}`,
    };
  }

  // Rule 6 — available
  return {
    status: 'available',
    cliVersion,
  };
}
