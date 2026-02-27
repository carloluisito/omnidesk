import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { getElectronAPI } from '../../../test/helpers/electron-api-mock';
import { useSessionSharing } from './useSessionSharing';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeShare(overrides: Partial<import('../../shared/types/sharing-types').ShareInfo> = {}) {
  return {
    shareId: 'share-uuid-1',
    shareCode: 'ABC123',
    shareUrl: 'https://share.launchtunnel.dev/ABC123',
    sessionId: 'session-1',
    status: 'active' as const,
    createdAt: new Date().toISOString(),
    hasPassword: false,
    observers: [],
    ...overrides,
  };
}

function makeOperationResult(success = true, message = 'ok') {
  return { success, message };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useSessionSharing', () => {
  let api: ReturnType<typeof getElectronAPI>;

  beforeEach(() => {
    api = getElectronAPI();
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  it('initialises with empty maps and no notifications', () => {
    const { result } = renderHook(() => useSessionSharing());
    expect(result.current.activeShares.size).toBe(0);
    expect(result.current.observedSessions.size).toBe(0);
    expect(result.current.controlState.size).toBe(0);
    expect(result.current.notifications).toEqual([]);
    expect(result.current.isEligible).toBe(false);
    expect(result.current.eligibilityInfo).toBeNull();
  });

  // ── Event subscriptions / cleanup ─────────────────────────────────────────

  it('subscribes to all 8 sharing events on mount', () => {
    renderHook(() => useSessionSharing());

    expect(api.onObserverJoined).toHaveBeenCalled();
    expect(api.onObserverLeft).toHaveBeenCalled();
    expect(api.onControlRequested).toHaveBeenCalled();
    expect(api.onControlGranted).toHaveBeenCalled();
    expect(api.onControlRevoked).toHaveBeenCalled();
    expect(api.onShareStopped).toHaveBeenCalled();
    expect(api.onShareOutput).toHaveBeenCalled();
    expect(api.onShareMetadata).toHaveBeenCalled();
  });

  it('unsubscribes from all events on unmount', () => {
    const unsubs = [
      vi.fn(), vi.fn(), vi.fn(), vi.fn(),
      vi.fn(), vi.fn(), vi.fn(), vi.fn(),
    ];
    const eventMethods = [
      'onObserverJoined', 'onObserverLeft', 'onControlRequested',
      'onControlGranted', 'onControlRevoked', 'onShareStopped',
      'onShareOutput', 'onShareMetadata',
    ] as const;

    eventMethods.forEach((method, i) => {
      (api[method] as ReturnType<typeof vi.fn>).mockReturnValue(unsubs[i]);
    });

    const { unmount } = renderHook(() => useSessionSharing());
    unmount();

    unsubs.forEach((unsub) => expect(unsub).toHaveBeenCalled());
  });

  // ── Host actions ──────────────────────────────────────────────────────────

  describe('startSharing', () => {
    it('calls startShare and stores result in activeShares', async () => {
      const share = makeShare();
      api.startShare.mockResolvedValue(share);

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => {
        await result.current.startSharing('session-1');
      });

      expect(api.startShare).toHaveBeenCalledWith({ sessionId: 'session-1' });
      expect(result.current.activeShares.get('session-1')).toEqual(share);
    });

    it('forwards options to startShare', async () => {
      const share = makeShare({ hasPassword: true });
      api.startShare.mockResolvedValue(share);

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => {
        await result.current.startSharing('session-1', { password: 'secret', expiresInMs: 3600000 });
      });

      expect(api.startShare).toHaveBeenCalledWith({
        sessionId: 'session-1',
        password: 'secret',
        expiresInMs: 3600000,
      });
    });

    it('returns null and does not update state when startShare throws', async () => {
      api.startShare.mockRejectedValue(new Error('network error'));

      const { result } = renderHook(() => useSessionSharing());

      let returnValue: unknown;
      await act(async () => {
        returnValue = await result.current.startSharing('session-1');
      });

      expect(returnValue).toBeNull();
      expect(result.current.activeShares.size).toBe(0);
    });
  });

  describe('stopSharing', () => {
    it('removes session from activeShares on success', async () => {
      const share = makeShare();
      api.startShare.mockResolvedValue(share);
      api.stopShare.mockResolvedValue(makeOperationResult());

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => {
        await result.current.startSharing('session-1');
      });
      expect(result.current.activeShares.size).toBe(1);

      await act(async () => {
        await result.current.stopSharing('session-1');
      });

      expect(api.stopShare).toHaveBeenCalledWith('session-1');
      expect(result.current.activeShares.size).toBe(0);
    });

    it('does not remove from activeShares when operation fails', async () => {
      const share = makeShare();
      api.startShare.mockResolvedValue(share);
      api.stopShare.mockResolvedValue(makeOperationResult(false, 'error'));

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => { await result.current.startSharing('session-1'); });
      await act(async () => { await result.current.stopSharing('session-1'); });

      expect(result.current.activeShares.size).toBe(1);
    });
  });

  describe('kickObserver', () => {
    it('calls kickObserver on electronAPI', async () => {
      api.kickObserver.mockResolvedValue(makeOperationResult());

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => {
        await result.current.kickObserver('session-1', 'observer-1');
      });

      expect(api.kickObserver).toHaveBeenCalledWith('session-1', 'observer-1');
    });
  });

  describe('grantControl / revokeControl', () => {
    it('calls grantControl on electronAPI', async () => {
      api.grantControl.mockResolvedValue(makeOperationResult());

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => {
        await result.current.grantControl('session-1', 'observer-1');
      });

      expect(api.grantControl).toHaveBeenCalledWith('session-1', 'observer-1');
    });

    it('calls revokeControl on electronAPI', async () => {
      api.revokeControl.mockResolvedValue(makeOperationResult());

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => {
        await result.current.revokeControl('session-1', 'observer-1');
      });

      expect(api.revokeControl).toHaveBeenCalledWith('session-1', 'observer-1');
    });
  });

  // ── Observer actions ──────────────────────────────────────────────────────

  describe('joinSession', () => {
    it('adds entry to observedSessions and sets controlState to read-only on success', async () => {
      api.joinShare.mockResolvedValue(makeOperationResult());

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => {
        await result.current.joinSession('ABC123', undefined, 'Alice');
      });

      expect(api.joinShare).toHaveBeenCalledWith({
        codeOrUrl: 'ABC123',
        password: undefined,
        displayName: 'Alice',
      });

      expect(result.current.observedSessions.has('ABC123')).toBe(true);
      expect(result.current.observedSessions.get('ABC123')?.role).toBe('read-only');
      expect(result.current.controlState.get('ABC123')).toBe('read-only');
    });

    it('extracts shareCode from a full URL', async () => {
      api.joinShare.mockResolvedValue(makeOperationResult());

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => {
        await result.current.joinSession('https://share.launchtunnel.dev/XYZ789', undefined, 'Bob');
      });

      expect(result.current.observedSessions.has('XYZ789')).toBe(true);
    });

    it('does not update state when joinShare fails', async () => {
      api.joinShare.mockResolvedValue(makeOperationResult(false, 'Wrong password'));

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => {
        await result.current.joinSession('ABC123', 'wrongpw', 'Alice');
      });

      expect(result.current.observedSessions.size).toBe(0);
      expect(result.current.controlState.size).toBe(0);
    });

    it('uses Observer as default displayName', async () => {
      api.joinShare.mockResolvedValue(makeOperationResult());

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => {
        await result.current.joinSession('ABC123');
      });

      expect(api.joinShare).toHaveBeenCalledWith({
        codeOrUrl: 'ABC123',
        password: undefined,
        displayName: 'Observer',
      });
    });
  });

  describe('leaveSession', () => {
    it('removes entry from observedSessions and controlState on success', async () => {
      api.joinShare.mockResolvedValue(makeOperationResult());
      api.leaveShare.mockResolvedValue(makeOperationResult());

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => { await result.current.joinSession('ABC123', undefined, 'Alice'); });

      expect(result.current.observedSessions.size).toBe(1);

      await act(async () => { await result.current.leaveSession('ABC123'); });

      expect(api.leaveShare).toHaveBeenCalledWith('ABC123');
      expect(result.current.observedSessions.size).toBe(0);
      expect(result.current.controlState.has('ABC123')).toBe(false);
    });

    it('does not remove state when leaveShare fails', async () => {
      api.joinShare.mockResolvedValue(makeOperationResult());
      api.leaveShare.mockResolvedValue(makeOperationResult(false, 'error'));

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => { await result.current.joinSession('ABC123', undefined, 'Alice'); });
      await act(async () => { await result.current.leaveSession('ABC123'); });

      expect(result.current.observedSessions.size).toBe(1);
    });
  });

  describe('requestControl', () => {
    it('sets controlState to requesting on success', async () => {
      api.requestControl.mockResolvedValue(makeOperationResult());

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => {
        await result.current.requestControl('ABC123');
      });

      expect(api.requestControl).toHaveBeenCalledWith('ABC123');
      expect(result.current.controlState.get('ABC123')).toBe('requesting');
    });

    it('does not update controlState when requestControl fails', async () => {
      api.requestControl.mockResolvedValue(makeOperationResult(false, 'denied'));

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => {
        await result.current.requestControl('ABC123');
      });

      expect(result.current.controlState.has('ABC123')).toBe(false);
    });
  });

  describe('releaseControl', () => {
    it('sets controlState to read-only on success', async () => {
      api.requestControl.mockResolvedValue(makeOperationResult());
      api.releaseControl.mockResolvedValue(makeOperationResult());

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => { await result.current.requestControl('ABC123'); });
      await act(async () => { await result.current.releaseControl('ABC123'); });

      expect(api.releaseControl).toHaveBeenCalledWith('ABC123');
      expect(result.current.controlState.get('ABC123')).toBe('read-only');
    });
  });

  // ── Eligibility ───────────────────────────────────────────────────────────

  describe('checkEligibility', () => {
    it('calls checkShareEligibility and updates isEligible', async () => {
      api.checkShareEligibility.mockResolvedValue({ eligible: true, plan: 'pro' });

      const { result } = renderHook(() => useSessionSharing());

      let info: unknown;
      await act(async () => {
        info = await result.current.checkEligibility();
      });

      expect(api.checkShareEligibility).toHaveBeenCalledTimes(1);
      expect(info).toEqual({ eligible: true, plan: 'pro' });

      await waitFor(() => {
        expect(result.current.isEligible).toBe(true);
        expect(result.current.eligibilityInfo).toEqual({ eligible: true, plan: 'pro' });
      });
    });

    it('caches eligibility — only calls IPC once on repeated calls', async () => {
      api.checkShareEligibility.mockResolvedValue({ eligible: true });

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => { await result.current.checkEligibility(); });
      await act(async () => { await result.current.checkEligibility(); });
      await act(async () => { await result.current.checkEligibility(); });

      expect(api.checkShareEligibility).toHaveBeenCalledTimes(1);
    });

    it('returns a fallback when checkShareEligibility throws', async () => {
      api.checkShareEligibility.mockRejectedValue(new Error('network'));

      const { result } = renderHook(() => useSessionSharing());

      let info: unknown;
      await act(async () => {
        info = await result.current.checkEligibility();
      });

      expect((info as { eligible: boolean }).eligible).toBe(false);
    });
  });

  // ── IPC event handlers ────────────────────────────────────────────────────

  describe('onObserverJoined event', () => {
    it('adds observer to the matching active share and pushes notification', async () => {
      const share = makeShare();
      api.startShare.mockResolvedValue(share);

      let joinedListener: Function;
      api.onObserverJoined.mockImplementation((cb: Function) => {
        joinedListener = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => { await result.current.startSharing('session-1'); });

      act(() => {
        joinedListener!({
          sessionId: 'session-1',
          shareId: 'share-uuid-1',
          observer: {
            observerId: 'obs-1',
            displayName: 'Carol',
            role: 'read-only' as const,
            joinedAt: new Date().toISOString(),
          },
        });
      });

      expect(result.current.activeShares.get('session-1')?.observers).toHaveLength(1);
      expect(result.current.activeShares.get('session-1')?.observers[0].displayName).toBe('Carol');
      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe('observer-joined');
    });
  });

  describe('onObserverLeft event', () => {
    it('removes observer from active share and pushes notification', async () => {
      const share = makeShare({
        observers: [{
          observerId: 'obs-1',
          displayName: 'Carol',
          role: 'read-only' as const,
          joinedAt: new Date().toISOString(),
        }],
      });
      api.startShare.mockResolvedValue(share);

      let leftListener: Function;
      api.onObserverLeft.mockImplementation((cb: Function) => {
        leftListener = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => { await result.current.startSharing('session-1'); });

      act(() => {
        leftListener!({ sessionId: 'session-1', shareId: 'share-uuid-1', observerId: 'obs-1' });
      });

      expect(result.current.activeShares.get('session-1')?.observers).toHaveLength(0);
      expect(result.current.notifications[0].type).toBe('observer-left');
    });
  });

  describe('onControlRequested event', () => {
    it('pushes a control-requested notification', () => {
      let controlReqListener: Function;
      api.onControlRequested.mockImplementation((cb: Function) => {
        controlReqListener = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useSessionSharing());

      act(() => {
        controlReqListener!({
          sessionId: 'session-1',
          shareId: 'share-uuid-1',
          observerId: 'obs-1',
          observerName: 'Dave',
        });
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe('control-requested');
      expect(result.current.notifications[0].message).toContain('Dave');
    });
  });

  describe('onControlGranted event', () => {
    it('sets controlState to has-control for the matching shareCode', () => {
      let grantedListener: Function;
      api.onControlGranted.mockImplementation((cb: Function) => {
        grantedListener = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useSessionSharing());

      act(() => {
        grantedListener!({ shareCode: 'ABC123' });
      });

      expect(result.current.controlState.get('ABC123')).toBe('has-control');
    });
  });

  describe('onControlRevoked event', () => {
    it('sets controlState back to read-only', () => {
      let revokedListener: Function;
      api.onControlRevoked.mockImplementation((cb: Function) => {
        revokedListener = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useSessionSharing());

      act(() => {
        revokedListener!({ shareCode: 'ABC123', reason: 'host-revoked' as const });
      });

      expect(result.current.controlState.get('ABC123')).toBe('read-only');
    });
  });

  describe('onShareStopped event', () => {
    it('removes from observedSessions and pushes share-stopped notification', async () => {
      api.joinShare.mockResolvedValue(makeOperationResult());

      let stoppedListener: Function;
      api.onShareStopped.mockImplementation((cb: Function) => {
        stoppedListener = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useSessionSharing());

      await act(async () => { await result.current.joinSession('ABC123', undefined, 'Alice'); });

      act(() => {
        stoppedListener!({ shareCode: 'ABC123', reason: 'host-stopped' as const });
      });

      expect(result.current.observedSessions.has('ABC123')).toBe(false);
      expect(result.current.notifications.some((n) => n.type === 'share-stopped')).toBe(true);
    });

    it('uses event.message in the notification when provided', () => {
      let stoppedListener: Function;
      api.onShareStopped.mockImplementation((cb: Function) => {
        stoppedListener = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useSessionSharing());

      act(() => {
        stoppedListener!({ shareCode: 'ABC123', reason: 'expired' as const, message: 'Session expired' });
      });

      expect(result.current.notifications[0].message).toBe('Session expired');
    });
  });

  describe('onShareOutput event', () => {
    it('forwards output to the registered callback for the matching shareCode', () => {
      let outputListener: Function;
      api.onShareOutput.mockImplementation((cb: Function) => {
        outputListener = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useSessionSharing());

      const cb = vi.fn();
      act(() => {
        result.current.registerOutputCallback('ABC123', cb);
      });

      act(() => {
        outputListener!({ shareCode: 'ABC123', data: 'hello terminal' });
      });

      expect(cb).toHaveBeenCalledWith('hello terminal');
    });

    it('does not call callback for a different shareCode', () => {
      let outputListener: Function;
      api.onShareOutput.mockImplementation((cb: Function) => {
        outputListener = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useSessionSharing());

      const cb = vi.fn();
      act(() => {
        result.current.registerOutputCallback('ABC123', cb);
      });

      act(() => {
        outputListener!({ shareCode: 'XYZ999', data: 'unrelated' });
      });

      expect(cb).not.toHaveBeenCalled();
    });

    it('stops forwarding after unregisterOutputCallback', () => {
      let outputListener: Function;
      api.onShareOutput.mockImplementation((cb: Function) => {
        outputListener = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useSessionSharing());

      const cb = vi.fn();
      act(() => {
        result.current.registerOutputCallback('ABC123', cb);
        result.current.unregisterOutputCallback('ABC123');
      });

      act(() => {
        outputListener!({ shareCode: 'ABC123', data: 'after unregister' });
      });

      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('onShareMetadata event', () => {
    it('forwards metadata to the registered callback', () => {
      let metadataListener: Function;
      api.onShareMetadata.mockImplementation((cb: Function) => {
        metadataListener = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useSessionSharing());

      const cb = vi.fn();
      act(() => {
        result.current.registerMetadataCallback('ABC123', cb);
      });

      const frame = { type: 'metadata' as const, timestamp: Date.now(), tool: 'Edit', agentStatus: 'writing' };

      act(() => {
        metadataListener!({ shareCode: 'ABC123', metadata: frame });
      });

      expect(cb).toHaveBeenCalledWith(frame);
    });

    it('stops forwarding after unregisterMetadataCallback', () => {
      let metadataListener: Function;
      api.onShareMetadata.mockImplementation((cb: Function) => {
        metadataListener = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useSessionSharing());

      const cb = vi.fn();
      act(() => {
        result.current.registerMetadataCallback('ABC123', cb);
        result.current.unregisterMetadataCallback('ABC123');
      });

      act(() => {
        metadataListener!({ shareCode: 'ABC123', metadata: { type: 'metadata' as const, timestamp: 0 } });
      });

      expect(cb).not.toHaveBeenCalled();
    });
  });

  // ── Notification timestamp ────────────────────────────────────────────────

  it('notification timestamps are monotonically non-decreasing', async () => {
    api.joinShare.mockResolvedValue(makeOperationResult());

    let joinedListener: Function;
    api.onObserverJoined.mockImplementation((cb: Function) => {
      joinedListener = cb;
      return vi.fn();
    });
    let leftListener: Function;
    api.onObserverLeft.mockImplementation((cb: Function) => {
      leftListener = cb;
      return vi.fn();
    });

    const share = makeShare();
    api.startShare.mockResolvedValue(share);

    const { result } = renderHook(() => useSessionSharing());
    await act(async () => { await result.current.startSharing('session-1'); });

    act(() => {
      joinedListener!({
        sessionId: 'session-1',
        shareId: 'share-uuid-1',
        observer: { observerId: 'obs-1', displayName: 'A', role: 'read-only' as const, joinedAt: '' },
      });
      leftListener!({ sessionId: 'session-1', shareId: 'share-uuid-1', observerId: 'obs-1' });
    });

    const timestamps = result.current.notifications.map((n) => n.timestamp);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
  });
});
