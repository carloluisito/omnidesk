import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  ShareInfo,
  ShareOperationResult,
  StartShareRequest,
  JoinShareRequest,
  ObserverRole,
  SessionMetadataFrame,
} from '../../shared/types/sharing-types';

// ── Public types ────────────────────────────────────────────────────

export interface ObservedSessionEntry {
  shareCode: string;
  sessionName: string;
  role: ObserverRole;
}

export interface SharingNotification {
  type: string;
  message: string;
  timestamp: number;
}

export interface EligibilityInfo {
  eligible: boolean;
  reason?: string;
  plan?: string;
}

export interface UseSessionSharingReturn {
  // ── State ──
  activeShares: Map<string, ShareInfo>;
  observedSessions: Map<string, ObservedSessionEntry>;
  controlState: Map<string, ObserverRole>;
  notifications: SharingNotification[];
  isEligible: boolean;
  eligibilityInfo: EligibilityInfo | null;

  // ── Host actions ──
  startSharing: (sessionId: string, options?: Partial<Omit<StartShareRequest, 'sessionId'>>) => Promise<ShareInfo | null>;
  stopSharing: (sessionId: string) => Promise<ShareOperationResult | null>;
  kickObserver: (sessionId: string, observerId: string) => Promise<ShareOperationResult | null>;
  grantControl: (sessionId: string, observerId: string) => Promise<ShareOperationResult | null>;
  revokeControl: (sessionId: string, observerId: string) => Promise<ShareOperationResult | null>;

  // ── Observer actions ──
  joinSession: (codeOrUrl: string, password?: string, displayName?: string) => Promise<ShareOperationResult | null>;
  leaveSession: (shareCode: string) => Promise<ShareOperationResult | null>;
  requestControl: (shareCode: string) => Promise<ShareOperationResult | null>;
  releaseControl: (shareCode: string) => Promise<ShareOperationResult | null>;

  // ── Eligibility ──
  checkEligibility: () => Promise<EligibilityInfo>;

  // ── Terminal data callbacks ──
  registerOutputCallback: (shareCode: string, callback: (data: string) => void) => void;
  unregisterOutputCallback: (shareCode: string) => void;
  registerMetadataCallback: (shareCode: string, callback: (metadata: SessionMetadataFrame) => void) => void;
  unregisterMetadataCallback: (shareCode: string) => void;
}

// ── Hook ────────────────────────────────────────────────────────────

export function useSessionSharing(): UseSessionSharingReturn {
  const [activeShares, setActiveShares] = useState<Map<string, ShareInfo>>(new Map());
  const [observedSessions, setObservedSessions] = useState<Map<string, ObservedSessionEntry>>(new Map());
  const [controlState, setControlState] = useState<Map<string, ObserverRole>>(new Map());
  const [notifications, setNotifications] = useState<SharingNotification[]>([]);
  const [eligibilityInfo, setEligibilityInfo] = useState<EligibilityInfo | null>(null);

  // Cached eligibility to avoid redundant IPC calls (useProvider pattern)
  const eligibilityCache = useRef<EligibilityInfo | null>(null);

  // Per-shareCode terminal data callbacks — stored in refs to avoid re-renders
  const outputCallbacks = useRef<Map<string, (data: string) => void>>(new Map());
  const metadataCallbacks = useRef<Map<string, (metadata: SessionMetadataFrame) => void>>(new Map());

  // ── Helper: push a notification ───────────────────────────────────
  const pushNotification = useCallback((type: string, message: string) => {
    setNotifications((prev) => [
      ...prev,
      { type, message, timestamp: Date.now() },
    ]);
  }, []);

  // ── Event subscriptions ───────────────────────────────────────────
  useEffect(() => {
    // sharing:observerJoined — update observer list in the active share
    const unsubJoined = window.electronAPI.onObserverJoined((event) => {
      setActiveShares((prev) => {
        const share = prev.get(event.sessionId);
        if (!share) return prev;
        const next = new Map(prev);
        next.set(event.sessionId, {
          ...share,
          observers: [...share.observers, event.observer],
        });
        return next;
      });
      pushNotification(
        'observer-joined',
        `${event.observer.displayName} joined your session`
      );
    });

    // sharing:observerLeft — remove from observer list
    const unsubLeft = window.electronAPI.onObserverLeft((event) => {
      setActiveShares((prev) => {
        const share = prev.get(event.sessionId);
        if (!share) return prev;
        const next = new Map(prev);
        next.set(event.sessionId, {
          ...share,
          observers: share.observers.filter((o) => o.observerId !== event.observerId),
        });
        return next;
      });
      pushNotification('observer-left', 'An observer left your session');
    });

    // sharing:controlRequested — notify host about the request
    const unsubControlRequested = window.electronAPI.onControlRequested((event) => {
      pushNotification(
        'control-requested',
        `${event.observerName} is requesting control`
      );
    });

    // sharing:controlGranted — update controlState for this observer
    const unsubControlGranted = window.electronAPI.onControlGranted((event) => {
      setControlState((prev) => {
        const next = new Map(prev);
        next.set(event.shareCode, 'has-control');
        return next;
      });
    });

    // sharing:controlRevoked — update controlState back to read-only
    const unsubControlRevoked = window.electronAPI.onControlRevoked((event) => {
      setControlState((prev) => {
        const next = new Map(prev);
        next.set(event.shareCode, 'read-only');
        return next;
      });
    });

    // sharing:shareStopped — remove from observedSessions, notify
    const unsubShareStopped = window.electronAPI.onShareStopped((event) => {
      setObservedSessions((prev) => {
        const next = new Map(prev);
        // Remove any entry whose shareCode matches
        for (const [key, entry] of next.entries()) {
          if (entry.shareCode === event.shareCode) {
            next.delete(key);
            break;
          }
        }
        return next;
      });
      pushNotification(
        'share-stopped',
        event.message ?? 'The shared session has ended'
      );
    });

    // sharing:output — forward to registered callback
    const unsubOutput = window.electronAPI.onShareOutput((event) => {
      const cb = outputCallbacks.current.get(event.shareCode);
      if (cb) cb(event.data);
    });

    // sharing:metadata — forward to registered callback
    const unsubMetadata = window.electronAPI.onShareMetadata((event) => {
      const cb = metadataCallbacks.current.get(event.shareCode);
      if (cb) cb(event.metadata);
    });

    return () => {
      unsubJoined();
      unsubLeft();
      unsubControlRequested();
      unsubControlGranted();
      unsubControlRevoked();
      unsubShareStopped();
      unsubOutput();
      unsubMetadata();
    };
  }, [pushNotification]);

  // ── Host actions ──────────────────────────────────────────────────

  const startSharing = useCallback(async (
    sessionId: string,
    options?: Partial<Omit<StartShareRequest, 'sessionId'>>
  ): Promise<ShareInfo | null> => {
    try {
      const request: StartShareRequest = { sessionId, ...options };
      const share = await window.electronAPI.startShare(request);
      setActiveShares((prev) => {
        const next = new Map(prev);
        next.set(sessionId, share);
        return next;
      });
      return share;
    } catch (err) {
      console.error('Failed to start sharing:', err);
      return null;
    }
  }, []);

  const stopSharing = useCallback(async (sessionId: string): Promise<ShareOperationResult | null> => {
    try {
      const result = await window.electronAPI.stopShare(sessionId);
      if (result.success) {
        setActiveShares((prev) => {
          const next = new Map(prev);
          next.delete(sessionId);
          return next;
        });
      }
      return result;
    } catch (err) {
      console.error('Failed to stop sharing:', err);
      return null;
    }
  }, []);

  const kickObserver = useCallback(async (
    sessionId: string,
    observerId: string
  ): Promise<ShareOperationResult | null> => {
    try {
      return await window.electronAPI.kickObserver(sessionId, observerId);
    } catch (err) {
      console.error('Failed to kick observer:', err);
      return null;
    }
  }, []);

  const grantControl = useCallback(async (
    sessionId: string,
    observerId: string
  ): Promise<ShareOperationResult | null> => {
    try {
      return await window.electronAPI.grantControl(sessionId, observerId);
    } catch (err) {
      console.error('Failed to grant control:', err);
      return null;
    }
  }, []);

  const revokeControl = useCallback(async (
    sessionId: string,
    observerId: string
  ): Promise<ShareOperationResult | null> => {
    try {
      return await window.electronAPI.revokeControl(sessionId, observerId);
    } catch (err) {
      console.error('Failed to revoke control:', err);
      return null;
    }
  }, []);

  // ── Observer actions ──────────────────────────────────────────────

  const joinSession = useCallback(async (
    codeOrUrl: string,
    password?: string,
    displayName: string = 'Observer'
  ): Promise<ShareOperationResult | null> => {
    try {
      const request: JoinShareRequest = { codeOrUrl, password, displayName };
      const result = await window.electronAPI.joinShare(request);
      if (result.success) {
        // Derive a shareCode from codeOrUrl (strip URL prefix if present)
        const shareCode = codeOrUrl.includes('/')
          ? codeOrUrl.split('/').pop() ?? codeOrUrl
          : codeOrUrl;
        setObservedSessions((prev) => {
          const next = new Map(prev);
          next.set(shareCode, {
            shareCode,
            sessionName: displayName,
            role: 'read-only',
          });
          return next;
        });
        setControlState((prev) => {
          const next = new Map(prev);
          next.set(shareCode, 'read-only');
          return next;
        });
      }
      return result;
    } catch (err) {
      console.error('Failed to join session:', err);
      return null;
    }
  }, []);

  const leaveSession = useCallback(async (shareCode: string): Promise<ShareOperationResult | null> => {
    try {
      const result = await window.electronAPI.leaveShare(shareCode);
      if (result.success) {
        setObservedSessions((prev) => {
          const next = new Map(prev);
          next.delete(shareCode);
          return next;
        });
        setControlState((prev) => {
          const next = new Map(prev);
          next.delete(shareCode);
          return next;
        });
      }
      return result;
    } catch (err) {
      console.error('Failed to leave session:', err);
      return null;
    }
  }, []);

  const requestControl = useCallback(async (shareCode: string): Promise<ShareOperationResult | null> => {
    try {
      const result = await window.electronAPI.requestControl(shareCode);
      if (result.success) {
        setControlState((prev) => {
          const next = new Map(prev);
          next.set(shareCode, 'requesting');
          return next;
        });
      }
      return result;
    } catch (err) {
      console.error('Failed to request control:', err);
      return null;
    }
  }, []);

  const releaseControl = useCallback(async (shareCode: string): Promise<ShareOperationResult | null> => {
    try {
      const result = await window.electronAPI.releaseControl(shareCode);
      if (result.success) {
        setControlState((prev) => {
          const next = new Map(prev);
          next.set(shareCode, 'read-only');
          return next;
        });
      }
      return result;
    } catch (err) {
      console.error('Failed to release control:', err);
      return null;
    }
  }, []);

  // ── Eligibility ───────────────────────────────────────────────────

  const checkEligibility = useCallback(async (): Promise<EligibilityInfo> => {
    if (eligibilityCache.current !== null) {
      return eligibilityCache.current;
    }
    try {
      const result = await window.electronAPI.checkShareEligibility();
      eligibilityCache.current = result;
      setEligibilityInfo(result);
      return result;
    } catch (err) {
      console.error('Failed to check share eligibility:', err);
      const fallback: EligibilityInfo = { eligible: false, reason: 'Failed to check eligibility' };
      return fallback;
    }
  }, []);

  // ── Terminal data callbacks ───────────────────────────────────────

  const registerOutputCallback = useCallback((
    shareCode: string,
    callback: (data: string) => void
  ): void => {
    outputCallbacks.current.set(shareCode, callback);
  }, []);

  const unregisterOutputCallback = useCallback((shareCode: string): void => {
    outputCallbacks.current.delete(shareCode);
  }, []);

  const registerMetadataCallback = useCallback((
    shareCode: string,
    callback: (metadata: SessionMetadataFrame) => void
  ): void => {
    metadataCallbacks.current.set(shareCode, callback);
  }, []);

  const unregisterMetadataCallback = useCallback((shareCode: string): void => {
    metadataCallbacks.current.delete(shareCode);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────

  const isEligible = eligibilityInfo?.eligible ?? false;

  return {
    activeShares,
    observedSessions,
    controlState,
    notifications,
    isEligible,
    eligibilityInfo,
    startSharing,
    stopSharing,
    kickObserver,
    grantControl,
    revokeControl,
    joinSession,
    leaveSession,
    requestControl,
    releaseControl,
    checkEligibility,
    registerOutputCallback,
    unregisterOutputCallback,
    registerMetadataCallback,
    unregisterMetadataCallback,
  };
}
