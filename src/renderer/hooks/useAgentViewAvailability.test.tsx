import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAgentViewAvailability } from './useAgentViewAvailability';
import { resetElectronAPI } from '../../../test/helpers/electron-api-mock';
import type { AgentViewAvailability } from '../../shared/types/agent-view-types';

describe('useAgentViewAvailability', () => {
  // Track any deferred resolvers so afterEach can drain them and avoid
  // dangling promise chains across tests.
  let pendingResolvers: Array<(v: AgentViewAvailability) => void> = [];

  beforeEach(() => {
    resetElectronAPI();
    pendingResolvers = [];
  });

  afterEach(() => {
    // Drain any pending IPC promises so React Testing Library's cleanup
    // doesn't get tripped by an unresolved chain.
    for (const resolve of pendingResolvers) {
      resolve({ status: 'unavailable', reason: 'detection-failed', detail: 'test teardown' });
    }
  });

  it('starts with availability null and loading true', () => {
    // Arrange: a deferred promise we can resolve in afterEach so we can inspect
    // the initial state without leaving an unresolved chain.
    const api = resetElectronAPI();
    const deferred = new Promise<AgentViewAvailability>((resolve) => {
      pendingResolvers.push(resolve);
    });
    api.getAgentViewAvailability.mockReturnValue(deferred);

    // Act
    const { result } = renderHook(() => useAgentViewAvailability());

    // Assert initial state
    expect(result.current.availability).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('stays loading when the initial fetch returns a probing response (push event delivers the final state)', async () => {
    // With the push pattern, if the initial IPC response is "probing", the hook
    // keeps loading=true and availability=null until a push event arrives.
    const api = resetElectronAPI();

    // getAgentViewAvailability returns probing — hook should NOT clear loading yet
    const deferred = new Promise<AgentViewAvailability>((resolve) => {
      pendingResolvers.push(resolve);
    });
    api.getAgentViewAvailability.mockReturnValue(deferred);

    const { result } = renderHook(() => useAgentViewAvailability());

    // Resolve with probing — hook should keep loading:true, availability:null
    act(() => {
      pendingResolvers.shift()!({ status: 'unavailable', reason: 'probing', detail: 'Probing claude --version...' });
    });

    // After probing response: still loading
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });
    expect(result.current.availability).toBeNull();
    // Should still only have called the IPC method once (no polling)
    expect(api.getAgentViewAvailability).toHaveBeenCalledTimes(1);
  });

  it('sets availability and loading: false after a successful initial fetch', async () => {
    const api = resetElectronAPI();
    const resolved = { status: 'available' as const, cliVersion: '2.2.0' };
    api.getAgentViewAvailability.mockResolvedValue(resolved);

    const { result } = renderHook(() => useAgentViewAvailability());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.availability).toEqual(resolved);
    // Push-pattern: only one IPC call on mount, no polling
    expect(api.getAgentViewAvailability).toHaveBeenCalledTimes(1);
  });

  it('synthesizes an unavailable shape and sets loading: false after rejection', async () => {
    const api = resetElectronAPI();
    api.getAgentViewAvailability.mockRejectedValue(new Error('IPC failed'));

    const { result } = renderHook(() => useAgentViewAvailability());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.availability).toMatchObject({
      status: 'unavailable',
      reason: 'detection-failed',
    });
    expect((result.current.availability as { detail: string }).detail).toContain('IPC failed');
  });

  it('subscribes to onAgentViewAvailabilityChanged and updates availability when the event fires', async () => {
    const api = resetElectronAPI();
    // Initial fetch returns probing → hook stays loading
    api.getAgentViewAvailability.mockResolvedValue({
      status: 'unavailable',
      reason: 'probing',
      detail: 'Probing claude --version...',
    } satisfies AgentViewAvailability);

    // Capture the subscriber callback registered by the hook
    let capturedCallback: ((av: AgentViewAvailability) => void) | null = null;
    api.onAgentViewAvailabilityChanged.mockImplementation((cb: (av: AgentViewAvailability) => void) => {
      capturedCallback = cb;
      return vi.fn(); // unsubscribe fn
    });

    const { result } = renderHook(() => useAgentViewAvailability());

    // Wait for the initial fetch to complete (probing → stays loading)
    await waitFor(() => {
      expect(api.onAgentViewAvailabilityChanged).toHaveBeenCalledTimes(1);
    });
    expect(result.current.loading).toBe(true);

    // Fire the push event with the final available state
    const pushed: AgentViewAvailability = { status: 'available', cliVersion: '2.2.0' };
    act(() => {
      capturedCallback!(pushed);
    });

    // Hook should now reflect the pushed state
    expect(result.current.availability).toEqual(pushed);
    expect(result.current.loading).toBe(false);
  });

  it('unsubscribes the listener on unmount', async () => {
    const api = resetElectronAPI();
    api.getAgentViewAvailability.mockResolvedValue({
      status: 'available',
      cliVersion: '2.2.0',
    } satisfies AgentViewAvailability);

    // The auto-derived mock returns vi.fn(() => vi.fn()) for event methods,
    // i.e. calling onAgentViewAvailabilityChanged() returns an unsubscribe fn.
    // Capture that returned unsubscribe fn to verify it's called on unmount.
    const unsubscribeFn = vi.fn();
    api.onAgentViewAvailabilityChanged.mockReturnValue(unsubscribeFn);

    const { unmount } = renderHook(() => useAgentViewAvailability());

    // Let the subscription setup settle
    await waitFor(() => {
      expect(api.onAgentViewAvailabilityChanged).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(unsubscribeFn).toHaveBeenCalledTimes(1);
  });
});
