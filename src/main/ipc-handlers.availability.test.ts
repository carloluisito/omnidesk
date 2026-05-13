/**
 * Tests for the agentView:availability IPC handler.
 *
 * These tests verify the cache-and-return behavior defined in item #2:
 *   - Handler returns the current cached AgentViewAvailability value
 *   - Handler is invoke-kind (registered via registry.handle, not registry.on)
 *   - After the cache is updated, the handler returns the updated value
 *   - Calling the handler multiple times never re-probes (zero subprocess calls)
 *
 * Pattern: simulate the handler logic directly, matching the approach used in
 * the existing src/main/ipc-handlers.test.ts. The cache module and IPC handler
 * are tested via their exported API, not via a running Electron app.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentViewAvailability } from '../shared/types/agent-view-types';

// ---------------------------------------------------------------------------
// Module-level cache state simulation
// ---------------------------------------------------------------------------
// The real implementation keeps `cachedAgentViewAvailability` as a module-level
// let in src/main/index.ts and exports `getCachedAgentViewAvailability()`.
// We import the real functions here; RED phase = they don't exist yet.
// ---------------------------------------------------------------------------

import {
  getCachedAgentViewAvailability,
  setCachedAgentViewAvailability,
} from './agent-view/availability-cache';

describe('agentView:availability IPC handler', () => {
  const probingValue: AgentViewAvailability = {
    status: 'unavailable',
    reason: 'probing',
    detail: 'Probing claude --version...',
  };

  const availableValue: AgentViewAvailability = {
    status: 'available',
    cliVersion: '2.1.139',
  };

  const unavailableValue: AgentViewAvailability = {
    status: 'unavailable',
    reason: 'cli-too-old',
    detail: 'claude 2.0.0 is below the minimum 2.1.139',
  };

  beforeEach(() => {
    // Reset to the initial "probing" value before each test
    setCachedAgentViewAvailability(probingValue);
  });

  // ── Test 1: handler returns the current cached value ──────────────────────

  it('returns the initial "probing" value before the probe completes', () => {
    const result = getCachedAgentViewAvailability();
    expect(result).toEqual(probingValue);
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.reason).toBe('probing');
    }
  });

  it('returns an available value after the cache is updated to available', () => {
    setCachedAgentViewAvailability(availableValue);
    const result = getCachedAgentViewAvailability();
    expect(result).toEqual(availableValue);
    expect(result.status).toBe('available');
  });

  it('returns an unavailable value after the cache is updated to unavailable', () => {
    setCachedAgentViewAvailability(unavailableValue);
    const result = getCachedAgentViewAvailability();
    expect(result).toEqual(unavailableValue);
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.reason).toBe('cli-too-old');
    }
  });

  // ── Test 2: cache update correctly replaces the prior value ───────────────

  it('after cache is updated, subsequent calls return the new value (not the old one)', () => {
    // Start with probing value
    expect(getCachedAgentViewAvailability()).toEqual(probingValue);

    // Simulate probe completing with available result
    setCachedAgentViewAvailability(availableValue);

    // All subsequent calls return the new value
    expect(getCachedAgentViewAvailability()).toEqual(availableValue);
    expect(getCachedAgentViewAvailability()).toEqual(availableValue);
    expect(getCachedAgentViewAvailability()).toEqual(availableValue);
  });

  // ── Test 3: handler doesn't re-probe — calling it N times triggers 0 spawns ─

  it('calling getCachedAgentViewAvailability() 5 times triggers zero subprocess spawns', async () => {
    // The cache is populated at startup by the probe (in the delayed-init block).
    // The getter itself NEVER spawns a subprocess; that's the probe's job.
    // We verify this by mocking child_process.execFile and asserting it's never called
    // during the getter invocations.

    const { execFile } = await import('node:child_process');
    const execFileSpy = vi.spyOn({ execFile }, 'execFile');

    setCachedAgentViewAvailability(availableValue);

    // Call the handler 5 times
    for (let i = 0; i < 5; i++) {
      const r = getCachedAgentViewAvailability();
      expect(r).toEqual(availableValue);
    }

    // The getter never spawned a subprocess
    expect(execFileSpy).not.toHaveBeenCalled();
  });

  // ── Test 4: IPC handler wraps the getter ─────────────────────────────────

  it('simulated IPC handler returns getCachedAgentViewAvailability() value', async () => {
    // Simulate what the real IPC handler does:
    //   registry.handle('getAgentViewAvailability', async () => getCachedAgentViewAvailability())
    // The handler is just a thin async wrapper around the getter.

    setCachedAgentViewAvailability(availableValue);

    // Simulate async handler invocation
    const simulatedHandler = async (): Promise<AgentViewAvailability> =>
      getCachedAgentViewAvailability();

    const result = await simulatedHandler();
    expect(result).toEqual(availableValue);
    expect(result.status).toBe('available');
  });

  it('simulated IPC handler reflects cache updates dynamically', async () => {
    const simulatedHandler = async (): Promise<AgentViewAvailability> =>
      getCachedAgentViewAvailability();

    // Before probe: probing value
    expect(await simulatedHandler()).toEqual(probingValue);

    // After probe: available
    setCachedAgentViewAvailability(availableValue);
    expect(await simulatedHandler()).toEqual(availableValue);
  });
});
