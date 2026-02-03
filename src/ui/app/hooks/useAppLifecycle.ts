import { useEffect, useCallback, useRef } from 'react';
import { useRunStore } from '../store/runStore';
import { useAppStore } from '../store/appStore';

interface LifecycleState {
  isVisible: boolean;
  wasBackgrounded: boolean;
  lastActiveTime: number;
}

/**
 * Manages app lifecycle events:
 * - Pauses polling when app is backgrounded
 * - Refreshes data when app becomes active
 * - Reconnects on network restore
 */
export function useAppLifecycle() {
  const { loadApps } = useRunStore();
  const { loadData } = useAppStore();

  const stateRef = useRef<LifecycleState>({
    isVisible: true,
    wasBackgrounded: false,
    lastActiveTime: Date.now(),
  });

  const handleVisibilityChange = useCallback(() => {
    const isNowVisible = document.visibilityState === 'visible';
    const state = stateRef.current;

    if (isNowVisible && !state.isVisible) {
      // App became visible - was backgrounded
      const timeBackgrounded = Date.now() - state.lastActiveTime;

      // If backgrounded for more than 30 seconds, force refresh data (bypass cache)
      if (timeBackgrounded > 30000) {
        loadApps();
        loadData({ forceRefresh: true });
      }

      state.wasBackgrounded = true;
    }

    state.isVisible = isNowVisible;
    state.lastActiveTime = Date.now();
  }, [loadApps, loadData]);

  const handleOnline = useCallback(() => {
    // Network restored - refresh data
    loadApps();
    loadData();
  }, [loadApps, loadData]);

  const handleFocus = useCallback(() => {
    // Window regained focus
    stateRef.current.lastActiveTime = Date.now();
  }, []);

  const handleBeforeUnload = useCallback(() => {
    // Cleanup before page unload
  }, []);

  useEffect(() => {
    // Visibility API
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Network status
    window.addEventListener('online', handleOnline);

    // Focus events
    window.addEventListener('focus', handleFocus);

    // Unload
    window.addEventListener('beforeunload', handleBeforeUnload);

    // iOS-specific events
    if ('standalone' in navigator) {
      document.addEventListener('resume', handleOnline);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleBeforeUnload);

      if ('standalone' in navigator) {
        document.removeEventListener('resume', handleOnline);
      }
    };
  }, [handleVisibilityChange, handleOnline, handleFocus, handleBeforeUnload]);
}

/**
 * Hook to detect if running as installed PWA
 */
export function useIsPWA(): boolean {
  // Check display-mode media query
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  // Check iOS standalone property
  if ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone) {
    return true;
  }

  // Check Android TWA
  if (document.referrer.includes('android-app://')) {
    return true;
  }

  return false;
}
