import { useState, useEffect, useCallback, useRef } from 'react';
import { SessionMetadata, SessionOutput, SessionExitEvent, LaunchMode } from '../../shared/ipc-types';
import type { ProviderId } from '../../shared/types/provider-types';
import { TabData } from '../components/ui/Tab';

export interface UseSessionManagerReturn {
  sessions: TabData[];
  activeSessionId: string | null;
  isLoading: boolean;
  createSession: (name: string, workingDirectory: string, permissionMode: 'standard' | 'skip-permissions', worktree?: import('../../shared/types/git-types').WorktreeCreateRequest, providerId?: ProviderId, launchMode?: LaunchMode, kind?: import('../../shared/ipc-types').SessionKind, initialPrompt?: string) => Promise<string>;
  closeSession: (sessionId: string, opts?: { removeWorktree?: boolean; removeBranch?: boolean }) => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, newName: string) => Promise<void>;
  restartSession: (sessionId: string) => Promise<void>;
  stopSession: (sessionId: string) => Promise<void>;
  duplicateSession: (sessionId: string) => void;
  sendInput: (sessionId: string, data: string) => void;
  resizeSession: (sessionId: string, cols: number, rows: number) => void;
  onOutput: (callback: (sessionId: string, data: string) => void) => () => void;
}

function sessionMetadataToTabData(metadata: SessionMetadata): TabData {
  return {
    id: metadata.id,
    name: metadata.name,
    workingDirectory: metadata.workingDirectory,
    permissionMode: metadata.permissionMode,
    status: metadata.status === 'starting' ? 'running' : metadata.status,
    activityState: metadata.activityState,
    worktreeBranch: metadata.worktreeInfo?.branch ?? null,
    mainRepoPath: metadata.worktreeInfo?.mainRepoPath ?? null,
    providerId: metadata.providerId,
    kind: metadata.kind,
  };
}

export function useSessionManager(): UseSessionManagerReturn {
  const [sessions, setSessions] = useState<TabData[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Changed to Set to support multiple output subscribers (needed for split view)
  const outputCallbacksRef = useRef<Set<(sessionId: string, data: string) => void>>(new Set());
  const pendingDuplicateRef = useRef<SessionMetadata | null>(null);

  // Load initial sessions
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const response = await window.electronAPI.listSessions();
        setSessions(response.sessions.map(sessionMetadataToTabData));
        setActiveSessionId(response.activeSessionId);
      } catch (err) {
        console.error('Failed to load sessions:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadSessions();
  }, []);

  // Set up event listeners
  useEffect(() => {
    const cleanupCreated = window.electronAPI.onSessionCreated((metadata) => {
      setSessions(prev => [...prev, sessionMetadataToTabData(metadata)]);
      setActiveSessionId(metadata.id);
    });

    const cleanupClosed = window.electronAPI.onSessionClosed((sessionId) => {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    });

    const cleanupSwitched = window.electronAPI.onSessionSwitched((sessionId) => {
      setActiveSessionId(sessionId);
    });

    const cleanupUpdated = window.electronAPI.onSessionUpdated((metadata) => {
      setSessions(prev => prev.map(s =>
        s.id === metadata.id ? sessionMetadataToTabData(metadata) : s
      ));
    });

    const cleanupOutput = window.electronAPI.onSessionOutput((output: SessionOutput) => {
      // Call all registered output subscribers
      outputCallbacksRef.current.forEach(callback => {
        callback(output.sessionId, output.data);
      });
    });

    const cleanupExited = window.electronAPI.onSessionExited((event: SessionExitEvent) => {
      setSessions(prev => prev.map(s =>
        s.id === event.sessionId ? { ...s, status: 'exited' as const } : s
      ));
    });

    // Live activity state from the session-state classifier — folded into the
    // session's TabData so the rail/inspector/cockpit render the rich status.
    const cleanupStateChanged = window.electronAPI.onSessionStateChanged((event) => {
      setSessions(prev => prev.map(s =>
        s.id === event.sessionId ? { ...s, activityState: event.state } : s
      ));
    });

    return () => {
      cleanupCreated();
      cleanupClosed();
      cleanupSwitched();
      cleanupUpdated();
      cleanupOutput();
      cleanupExited();
      cleanupStateChanged();
    };
  }, []);

  const createSession = useCallback(async (
    name: string,
    workingDirectory: string,
    permissionMode: 'standard' | 'skip-permissions',
    worktree?: import('../../shared/types/git-types').WorktreeCreateRequest,
    providerId?: ProviderId,
    launchMode?: LaunchMode,
    kind?: import('../../shared/ipc-types').SessionKind,
    initialPrompt?: string,
  ): Promise<string> => {
    try {
      if (kind === 'shell') {
        // Plain terminal: no model, provider, launch mode, or worktree.
        const meta = await window.electronAPI.createSession({
          name: name || undefined,
          workingDirectory,
          permissionMode,
          kind: 'shell',
        });
        return meta.id;
      }

      // Read default model from settings
      const settings = await window.electronAPI.getSettings();
      const defaultModel = settings.defaultModel || 'sonnet';

      const meta = await window.electronAPI.createSession({
        name: name || undefined,
        workingDirectory,
        permissionMode,
        model: defaultModel,
        worktree,
        providerId,
        launchMode,
        initialPrompt,
      });
      return meta.id;
    } catch (err) {
      console.error('Failed to create session:', err);
      throw err;
    }
  }, []);

  const closeSession = useCallback(async (
    sessionId: string,
    opts?: { removeWorktree?: boolean; removeBranch?: boolean },
  ) => {
    try {
      // Default close = stop the CLI, preserve everything else. The user must
      // explicitly opt-in to removing the worktree dir or deleting the branch.
      await window.electronAPI.closeSession(sessionId, opts);
    } catch (err) {
      console.error('Failed to close session:', err);
      throw err;
    }
  }, []);

  const switchSession = useCallback(async (sessionId: string) => {
    try {
      await window.electronAPI.switchSession(sessionId);
    } catch (err) {
      console.error('Failed to switch session:', err);
      throw err;
    }
  }, []);

  const renameSession = useCallback(async (sessionId: string, newName: string) => {
    try {
      await window.electronAPI.renameSession(sessionId, newName);
    } catch (err) {
      console.error('Failed to rename session:', err);
      throw err;
    }
  }, []);

  const restartSession = useCallback(async (sessionId: string) => {
    try {
      await window.electronAPI.restartSession(sessionId);
    } catch (err) {
      console.error('Failed to restart session:', err);
      throw err;
    }
  }, []);

  const stopSession = useCallback(async (sessionId: string) => {
    try {
      await window.electronAPI.stopSession(sessionId);
    } catch (err) {
      console.error('Failed to stop session:', err);
      throw err;
    }
  }, []);

  const duplicateSession = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      pendingDuplicateRef.current = {
        id: '',
        name: `${session.name} (copy)`,
        workingDirectory: session.workingDirectory,
        permissionMode: session.permissionMode,
        status: 'running',
        createdAt: Date.now(),
      };
      // The actual creation happens through the dialog
    }
  }, [sessions]);

  const sendInput = useCallback((sessionId: string, data: string) => {
    window.electronAPI.sendSessionInput(sessionId, data);
  }, []);

  const resizeSession = useCallback((sessionId: string, cols: number, rows: number) => {
    window.electronAPI.resizeSession(sessionId, cols, rows);
  }, []);

  const onOutput = useCallback((callback: (sessionId: string, data: string) => void) => {
    // Add callback to the set of subscribers
    outputCallbacksRef.current.add(callback);

    // Return cleanup function to remove this subscriber
    return () => {
      outputCallbacksRef.current.delete(callback);
    };
  }, []);

  return {
    sessions,
    activeSessionId,
    isLoading,
    createSession,
    closeSession,
    switchSession,
    renameSession,
    restartSession,
    stopSession,
    duplicateSession,
    sendInput,
    resizeSession,
    onOutput,
  };
}
