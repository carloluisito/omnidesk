import { useState, useEffect } from 'react';
import type { AgentViewAvailability } from '../../shared/types/agent-view-types';

export interface UseAgentViewAvailability {
  /** null while loading. After mount, will resolve to AgentViewAvailability. */
  availability: AgentViewAvailability | null;
  loading: boolean;
}

export function useAgentViewAvailability(): UseAgentViewAvailability {
  const [availability, setAvailability] = useState<AgentViewAvailability | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // One-shot fetch: if the probe is still in-flight the cache returns the
    // "probing" placeholder. In that case we keep loading=true and wait for
    // the push event to deliver the final state.
    window.electronAPI.getAgentViewAvailability()
      .then((av) => {
        if (cancelled) return;
        if (av.status === 'unavailable' && av.reason === 'probing') {
          // Main-process probe is still running — stay loading until the push
          // event arrives. Do not set availability so consumers never see the
          // transient "probing" reason.
          return;
        }
        setAvailability(av);
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error('[useAgentViewAvailability] failed:', err);
        if (cancelled) return;
        setAvailability({
          status: 'unavailable',
          reason: 'detection-failed',
          detail: 'Initial availability load failed: ' + ((err instanceof Error ? err.message : String(err))),
        });
        setLoading(false);
      });

    // Subscribe to push events from main. Push events only fire after the
    // probe completes, so they are never "probing" — always clear loading.
    const unsubscribe = window.electronAPI.onAgentViewAvailabilityChanged((av) => {
      if (cancelled) return;
      setAvailability(av);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { availability, loading };
}
