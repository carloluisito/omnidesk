/**
 * Module-level cache for AgentView availability.
 *
 * Initialized to the "probing" unavailable state. Updated once per app lifetime
 * by the delayed-init probe in src/main/index.ts. The IPC handler reads the
 * cached value; it never re-probes.
 *
 * Using a dedicated module (not inlined in index.ts) keeps the cache importable
 * from tests without bootstrapping the full Electron main-process startup.
 */

import type { AgentViewAvailability } from '../../shared/types/agent-view-types';

/**
 * Initial value before the probe completes (~2 s after app start).
 * Using 'unavailable' here is intentional: it causes item #3's picker to
 * disable the 'agents' option while probing, which is safer than enabling it
 * optimistically and hitting the defense-in-depth fallback in ClaudeProvider.
 */
let cachedAgentViewAvailability: AgentViewAvailability = {
  status: 'unavailable',
  reason: 'probing',
  detail: 'Probing claude --version...',
};

/** Returns the current cached availability. Never spawns a subprocess. */
export function getCachedAgentViewAvailability(): AgentViewAvailability {
  return cachedAgentViewAvailability;
}

/**
 * Update the cached availability. Called exactly once per app lifetime by the
 * delayed-init probe in src/main/index.ts after the probe resolves.
 * Also used by tests to set up cache state.
 */
export function setCachedAgentViewAvailability(
  availability: AgentViewAvailability,
): void {
  cachedAgentViewAvailability = availability;
}
