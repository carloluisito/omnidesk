import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Playbook,
  PlaybookExecutionState,
  PlaybookStepChangedEvent,
  PlaybookCompletedEvent,
  PlaybookErrorEvent,
} from '../../shared/types/playbook-types';

export function usePlaybooks(activeSessionId: string | null) {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [execution, setExecution] = useState<PlaybookExecutionState | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isParamDialogOpen, setIsParamDialogOpen] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeSessionRef = useRef(activeSessionId);
  activeSessionRef.current = activeSessionId;

  // Load playbooks
  const loadPlaybooks = useCallback(async () => {
    try {
      const list = await window.electronAPI.listPlaybooks();
      setPlaybooks(list);
    } catch (err) {
      console.error('[usePlaybooks] Failed to load:', err);
    }
  }, []);

  useEffect(() => {
    loadPlaybooks();
  }, [loadPlaybooks]);

  // Listen for execution events
  useEffect(() => {
    const unsubStep = window.electronAPI.onPlaybookStepChanged((event: PlaybookStepChangedEvent) => {
      if (event.sessionId === activeSessionRef.current) {
        setExecution(prev => {
          if (!prev || prev.playbookId !== event.playbookId) return prev;
          const stepStates = [...prev.stepStates];
          stepStates[event.stepIndex] = {
            ...stepStates[event.stepIndex],
            status: event.stepStatus,
          };
          return {
            ...prev,
            currentStepIndex: event.stepIndex,
            status: event.executionStatus,
            stepStates,
          };
        });
      }
    });

    const unsubCompleted = window.electronAPI.onPlaybookCompleted((event: PlaybookCompletedEvent) => {
      if (event.sessionId === activeSessionRef.current) {
        setExecution(prev => {
          if (!prev) return prev;
          return { ...prev, status: event.status, completedAt: Date.now() };
        });
        // Auto-clear execution after 5 seconds
        setTimeout(() => {
          setExecution(prev => {
            if (prev?.status === 'completed' || prev?.status === 'cancelled' || prev?.status === 'failed') {
              return null;
            }
            return prev;
          });
        }, 5000);
      }
    });

    const unsubError = window.electronAPI.onPlaybookError((event: PlaybookErrorEvent) => {
      if (event.sessionId === activeSessionRef.current) {
        setError(event.error);
        setTimeout(() => setError(null), 5000);
      }
    });

    return () => {
      unsubStep();
      unsubCompleted();
      unsubError();
    };
  }, []);

  // Refresh execution state when session changes
  useEffect(() => {
    if (!activeSessionId) {
      setExecution(null);
      return;
    }
    window.electronAPI.getPlaybookExecution(activeSessionId).then(exec => {
      setExecution(exec);
    }).catch(() => {});
  }, [activeSessionId]);

  // Open picker
  const openPicker = useCallback(() => {
    setIsPickerOpen(true);
  }, []);

  const closePicker = useCallback(() => {
    setIsPickerOpen(false);
  }, []);

  // Select a playbook (from picker)
  const selectPlaybook = useCallback((playbook: Playbook) => {
    setSelectedPlaybook(playbook);
    setIsPickerOpen(false);

    // If no variables, run immediately
    if (playbook.variables.length === 0) {
      runPlaybook(playbook, {});
    } else {
      setIsParamDialogOpen(true);
    }
  }, [activeSessionId]);

  // Run a playbook
  const runPlaybook = useCallback(async (playbook: Playbook, variables: Record<string, string>) => {
    if (!activeSessionId) return;
    setIsParamDialogOpen(false);
    setSelectedPlaybook(null);
    setError(null);

    try {
      const exec = await window.electronAPI.runPlaybook({
        playbookId: playbook.id,
        sessionId: activeSessionId,
        variables,
      });
      setExecution(exec);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to run playbook';
      setError(msg);
      setTimeout(() => setError(null), 5000);
    }
  }, [activeSessionId]);

  // Cancel execution
  const cancelPlaybook = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      await window.electronAPI.cancelPlaybook(activeSessionId);
    } catch (err) {
      console.error('[usePlaybooks] Failed to cancel:', err);
    }
  }, [activeSessionId]);

  // Confirm step
  const confirmStep = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      await window.electronAPI.confirmPlaybook(activeSessionId);
    } catch (err) {
      console.error('[usePlaybooks] Failed to confirm:', err);
    }
  }, [activeSessionId]);

  // CRUD
  const addPlaybook = useCallback(async (request: Parameters<typeof window.electronAPI.addPlaybook>[0]) => {
    try {
      await window.electronAPI.addPlaybook(request);
      await loadPlaybooks();
    } catch (err) {
      throw err;
    }
  }, [loadPlaybooks]);

  const updatePlaybook = useCallback(async (request: Parameters<typeof window.electronAPI.updatePlaybook>[0]) => {
    try {
      await window.electronAPI.updatePlaybook(request);
      await loadPlaybooks();
    } catch (err) {
      throw err;
    }
  }, [loadPlaybooks]);

  const deletePlaybook = useCallback(async (id: string) => {
    try {
      await window.electronAPI.deletePlaybook(id);
      await loadPlaybooks();
    } catch (err) {
      throw err;
    }
  }, [loadPlaybooks]);

  const duplicatePlaybook = useCallback(async (id: string) => {
    try {
      await window.electronAPI.duplicatePlaybook(id);
      await loadPlaybooks();
    } catch (err) {
      throw err;
    }
  }, [loadPlaybooks]);

  const importPlaybook = useCallback(async (data: Parameters<typeof window.electronAPI.importPlaybook>[0]) => {
    try {
      await window.electronAPI.importPlaybook(data);
      await loadPlaybooks();
    } catch (err) {
      throw err;
    }
  }, [loadPlaybooks]);

  const exportPlaybook = useCallback(async (id: string) => {
    return window.electronAPI.exportPlaybook(id);
  }, []);

  // Editor
  const openEditor = useCallback((playbook?: Playbook) => {
    setEditingPlaybook(playbook || null);
    setIsEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setIsEditorOpen(false);
    setEditingPlaybook(null);
  }, []);

  return {
    playbooks,
    execution,
    error,

    // Picker
    isPickerOpen,
    openPicker,
    closePicker,
    selectPlaybook,

    // Parameter dialog
    isParamDialogOpen,
    setIsParamDialogOpen,
    selectedPlaybook,

    // Execution
    runPlaybook,
    cancelPlaybook,
    confirmStep,

    // CRUD
    addPlaybook,
    updatePlaybook,
    deletePlaybook,
    duplicatePlaybook,
    importPlaybook,
    exportPlaybook,

    // Panel
    isPanelOpen,
    setIsPanelOpen,

    // Editor
    isEditorOpen,
    editingPlaybook,
    openEditor,
    closeEditor,

    // Refresh
    loadPlaybooks,
  };
}
