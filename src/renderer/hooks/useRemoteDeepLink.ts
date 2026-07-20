// Remote-PWA deep link: integration notifications carry ?session=<id> so a
// tap lands on the exact session that needs you. One-shot after sessions
// hydrate; the param is stripped from the URL either way (mirrors the ?token=
// sign-in flow); unknown ids fall through to the normal root view. The
// Electron desktop (no __OMNIDESK_REMOTE__ flag) never consumes it.
import { useEffect, useRef } from 'react';

export interface UseRemoteDeepLinkOptions {
  /** Ids of the currently-hydrated sessions (empty until the first list load). */
  sessionIds: string[];
  /** Cross-repo jump — activates the session's repo and focuses it. */
  onJump: (sessionId: string) => void;
}

export function useRemoteDeepLink({ sessionIds, onJump }: UseRemoteDeepLinkOptions): void {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    if (!(window as { __OMNIDESK_REMOTE__?: boolean }).__OMNIDESK_REMOTE__) return;
    if (sessionIds.length === 0) return; // not hydrated yet

    const params = new URLSearchParams(window.location.search);
    const target = params.get('session');
    if (!target) {
      done.current = true;
      return;
    }
    done.current = true;

    params.delete('session');
    const qs = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);

    if (sessionIds.includes(target)) {
      onJump(target);
    }
  }, [sessionIds, onJump]);
}
