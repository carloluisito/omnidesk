/**
 * useCustomCommands — React hook for the Custom Commands domain.
 *
 * Loads commands from the main process, listens for external file-system changes
 * (pushed via `command:changed` IPC event), and provides CRUD operations.
 *
 * Usage:
 *   const { commands, createCommand, deleteCommand } = useCustomCommands({
 *     projectDir: '/path/to/project',
 *     sessionId: activeSessionId,
 *   });
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  CustomCommand,
  CommandScope,
  CommandCreateRequest,
  CommandUpdateRequest,
  CommandDeleteRequest,
  CommandListRequest,
  CommandValidation,
} from '../../shared/types/custom-command-types';

export interface UseCustomCommandsOptions {
  /** If provided, project-scoped commands are loaded from <projectDir>/.claude/commands/ */
  projectDir?: string;
  /** If provided, session-only commands are included from the in-memory store. */
  sessionId?: string | null;
}

export interface UseCustomCommandsReturn {
  /** All commands merged across project, user, and session scopes. */
  commands: CustomCommand[];
  /** True while the initial load (or a reload triggered by file-system changes) is in progress. */
  isLoading: boolean;
  /** Last error message, or null if everything is fine. */
  error: string | null;
  /** Manually reload all commands. */
  loadCommands: () => Promise<void>;
  /** Create a new command and refresh the list. */
  createCommand: (request: CommandCreateRequest) => Promise<CustomCommand>;
  /** Update an existing command and refresh the list. */
  updateCommand: (request: CommandUpdateRequest) => Promise<CustomCommand>;
  /** Delete a command and refresh the list. */
  deleteCommand: (request: CommandDeleteRequest) => Promise<void>;
  /** Validate a command name (slug check, forbidden names, uniqueness). */
  validateName: (
    name: string,
    scope: CommandScope,
    projectDir?: string,
  ) => Promise<CommandValidation>;
}

export function useCustomCommands(
  options: UseCustomCommandsOptions = {},
): UseCustomCommandsReturn {
  const { projectDir, sessionId } = options;

  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCommands = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const request: CommandListRequest = {
        projectDir: projectDir || undefined,
        sessionId: sessionId || undefined,
      };
      const cmds = await window.electronAPI.listCustomCommands(request);
      setCommands(cmds);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load custom commands';
      setError(msg);
      console.error('[useCustomCommands] Failed to load:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectDir, sessionId]);

  // Initial load
  useEffect(() => {
    loadCommands();
  }, [loadCommands]);

  // Listen for file-system changes pushed from the main process (fs.watch debounced)
  useEffect(() => {
    const unsub = window.electronAPI.onCommandsChanged(() => {
      // Re-fetch everything so scope-merging logic runs fresh
      loadCommands();
    });
    return unsub;
  }, [loadCommands]);

  const createCommand = useCallback(
    async (request: CommandCreateRequest): Promise<CustomCommand> => {
      const cmd = await window.electronAPI.createCustomCommand(request);
      await loadCommands();
      return cmd;
    },
    [loadCommands],
  );

  const updateCommand = useCallback(
    async (request: CommandUpdateRequest): Promise<CustomCommand> => {
      const cmd = await window.electronAPI.updateCustomCommand(request);
      await loadCommands();
      return cmd;
    },
    [loadCommands],
  );

  const deleteCommand = useCallback(
    async (request: CommandDeleteRequest): Promise<void> => {
      await window.electronAPI.deleteCustomCommand(request);
      await loadCommands();
    },
    [loadCommands],
  );

  const validateName = useCallback(
    (name: string, scope: CommandScope, pDir?: string): Promise<CommandValidation> => {
      return window.electronAPI.validateCommandName(name, scope, pDir);
    },
    [],
  );

  return {
    commands,
    isLoading,
    error,
    loadCommands,
    createCommand,
    updateCommand,
    deleteCommand,
    validateName,
  };
}
