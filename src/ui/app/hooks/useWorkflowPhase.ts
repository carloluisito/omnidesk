/**
 * Workflow Phase Synchronization Hook
 *
 * Syncs UI phase with backend workflow enforcement state.
 * Loads initial phase on mount and updates backend when phase changes.
 */

import { useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { useToast } from './useToast';

export type WorkflowPhase = 'prompt' | 'review' | 'ship';

interface WorkflowPhaseData {
  workflowPhase: WorkflowPhase;
  workflowPhaseChangedAt?: string;
  enforcementEnabled: boolean;
}

interface UseWorkflowPhaseOptions {
  sessionId: string | null;
  currentPhase: WorkflowPhase;
  onPhaseChange: (phase: WorkflowPhase) => void;
  enabled?: boolean;
}

/**
 * Hook to sync workflow phase between UI and backend
 */
export function useWorkflowPhase({
  sessionId,
  currentPhase,
  onPhaseChange,
  enabled = true,
}: UseWorkflowPhaseOptions) {
  const toast = useToast();
  const isInitialLoad = useRef(true);
  const lastSyncedPhase = useRef<WorkflowPhase | null>(null);

  // Load initial phase from backend when session changes
  useEffect(() => {
    if (!enabled || !sessionId) return;

    const loadPhase = async () => {
      try {
        const data = await api<{ success: boolean; data: WorkflowPhaseData }>(
          'GET',
          `/terminal/sessions/${sessionId}/phase`
        );

        if (data.success && data.data) {
          const backendPhase = data.data.workflowPhase;

          // Only update UI if backend phase differs and this is initial load
          if (isInitialLoad.current && backendPhase !== currentPhase) {
            onPhaseChange(backendPhase);
            lastSyncedPhase.current = backendPhase;
          }
        }
      } catch (error) {
        console.error('[WorkflowPhase] Failed to load phase:', error);
      } finally {
        isInitialLoad.current = false;
      }
    };

    // Reset initial load flag when session changes
    isInitialLoad.current = true;
    loadPhase();
  }, [sessionId, enabled]); // Intentionally omit currentPhase and onPhaseChange

  // Sync phase to backend when it changes in UI
  useEffect(() => {
    if (!enabled || !sessionId || isInitialLoad.current) return;

    // Skip if we just synced this phase
    if (lastSyncedPhase.current === currentPhase) return;

    const syncPhase = async () => {
      try {
        await api('PATCH', `/terminal/sessions/${sessionId}/phase`, {
          phase: currentPhase,
        });

        lastSyncedPhase.current = currentPhase;
      } catch (error) {
        console.error('[WorkflowPhase] Failed to sync phase:', error);
        toast.error('Failed to sync workflow phase');
      }
    };

    syncPhase();
  }, [currentPhase, sessionId, enabled, toast]);

  return {
    isLoading: isInitialLoad.current,
  };
}
