/**
 * Tests for useCustomCommands hook
 *
 * Covers:
 *   - Initial command loading
 *   - CRUD operations (create, update, delete)
 *   - Name validation
 *   - Error handling
 *   - File-system change listening
 *   - State management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCustomCommands } from './useCustomCommands';
import type { CustomCommand, CommandCreateRequest } from '../../shared/types/custom-command-types';

// Create a mock electronAPI
const createMockElectronAPI = () => ({
  listCustomCommands: vi.fn(),
  createCustomCommand: vi.fn(),
  updateCustomCommand: vi.fn(),
  deleteCustomCommand: vi.fn(),
  validateCommandName: vi.fn(),
  onCommandsChanged: vi.fn(),
});

describe('useCustomCommands', () => {
  let mockAPI: ReturnType<typeof createMockElectronAPI>;

  beforeEach(() => {
    mockAPI = createMockElectronAPI();
    (window as any).electronAPI = mockAPI;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Initial Load Tests ──────────────────────────────────────────────────

  describe('initial load', () => {
    it('should load commands on mount', async () => {
      const mockCommands: CustomCommand[] = [
        {
          slug: 'deploy',
          description: 'Deploy app',
          body: 'deploy',
          parameters: [],
          scope: 'user',
          filePath: null,
          tags: [],
          icon: 'Terminal',
          updatedAt: Date.now(),
        },
      ];

      mockAPI.listCustomCommands.mockResolvedValue(mockCommands);

      const { result } = renderHook(() => useCustomCommands());

      expect(mockAPI.listCustomCommands).toHaveBeenCalled();

      await waitFor(() => {
        expect(result.current.commands).toEqual(mockCommands);
      });
    });

    it('should pass projectDir and sessionId to list request', async () => {
      mockAPI.listCustomCommands.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useCustomCommands({
          projectDir: '/home/user/project',
          sessionId: 'session-123',
        }),
      );

      await waitFor(() => {
        expect(mockAPI.listCustomCommands).toHaveBeenCalledWith({
          projectDir: '/home/user/project',
          sessionId: 'session-123',
        });
      });
    });

    it('should set isLoading during initial load', async () => {
      mockAPI.listCustomCommands.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(() => resolve([]), 100),
          ),
      );

      const { result } = renderHook(() => useCustomCommands());

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle load errors gracefully', async () => {
      const error = new Error('Failed to load commands');
      mockAPI.listCustomCommands.mockRejectedValue(error);

      const { result } = renderHook(() => useCustomCommands());

      await waitFor(() => {
        expect(result.current.error).toContain('Failed to load');
        expect(result.current.commands).toEqual([]);
      });
    });

    it('should start with empty commands list', () => {
      mockAPI.listCustomCommands.mockResolvedValue([]);

      const { result } = renderHook(() => useCustomCommands());

      expect(result.current.commands).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  // ── File System Change Listening ────────────────────────────────────────

  describe('file system change listening', () => {
    it('should listen for command changes', async () => {
      mockAPI.listCustomCommands.mockResolvedValue([]);
      let unsubscribe: (() => void) | undefined;
      let changeCallback: (() => void) | undefined;

      mockAPI.onCommandsChanged.mockImplementation((cb: () => void) => {
        changeCallback = cb;
        unsubscribe = vi.fn();
        return unsubscribe;
      });

      const { result } = renderHook(() => useCustomCommands());

      await waitFor(() => {
        expect(mockAPI.onCommandsChanged).toHaveBeenCalled();
      });

      expect(changeCallback).toBeDefined();
      expect(unsubscribe).toBeDefined();
    });

    it('should reload commands when file system changes', async () => {
      mockAPI.listCustomCommands.mockResolvedValue([]);
      let changeCallback: (() => void) | undefined;

      mockAPI.onCommandsChanged.mockImplementation((cb: () => void) => {
        changeCallback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useCustomCommands());

      await waitFor(() => {
        expect(mockAPI.listCustomCommands).toHaveBeenCalledTimes(1);
      });

      const newCommand: CustomCommand = {
        slug: 'new',
        description: 'New',
        body: 'body',
        parameters: [],
        scope: 'user',
        filePath: '/path/new.md',
        tags: [],
        icon: 'Terminal',
        updatedAt: Date.now(),
      };

      mockAPI.listCustomCommands.mockResolvedValue([newCommand]);

      act(() => {
        changeCallback?.();
      });

      await waitFor(() => {
        expect(result.current.commands).toContainEqual(newCommand);
      });
    });

    it('should unsubscribe from changes on unmount', async () => {
      mockAPI.listCustomCommands.mockResolvedValue([]);
      const unsubscribe = vi.fn();

      mockAPI.onCommandsChanged.mockReturnValue(unsubscribe);

      const { unmount } = renderHook(() => useCustomCommands());

      await waitFor(() => {
        expect(mockAPI.onCommandsChanged).toHaveBeenCalled();
      });

      unmount();

      // Unsubscribe should have been called
      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  // ── Create Command Tests ────────────────────────────────────────────────

  describe('createCommand', () => {
    it('should create a new command', async () => {
      mockAPI.listCustomCommands.mockResolvedValue([]);

      const newCommand: CustomCommand = {
        slug: 'deploy',
        description: 'Deploy app',
        body: 'deploy script',
        parameters: [],
        scope: 'user',
        filePath: '/path/deploy.md',
        tags: [],
        icon: 'Terminal',
        updatedAt: Date.now(),
      };

      mockAPI.createCustomCommand.mockResolvedValue(newCommand);

      const { result } = renderHook(() => useCustomCommands());

      await waitFor(() => {
        expect(result.current.commands).toEqual([]);
      });

      const request: CommandCreateRequest = {
        name: 'Deploy',
        description: 'Deploy app',
        body: 'deploy script',
        scope: 'user',
      };

      let createdCommand: CustomCommand | undefined;
      await act(async () => {
        createdCommand = await result.current.createCommand(request);
      });

      expect(createdCommand).toEqual(newCommand);
      expect(mockAPI.createCustomCommand).toHaveBeenCalledWith(request);
    });

    it('should reload commands after creation', async () => {
      mockAPI.listCustomCommands.mockResolvedValue([]);

      const newCommand: CustomCommand = {
        slug: 'deploy',
        description: 'Deploy app',
        body: 'deploy',
        parameters: [],
        scope: 'user',
        filePath: '/path/deploy.md',
        tags: [],
        icon: 'Terminal',
        updatedAt: Date.now(),
      };

      mockAPI.createCustomCommand.mockResolvedValue(newCommand);
      mockAPI.listCustomCommands.mockResolvedValueOnce([newCommand]);

      const { result } = renderHook(() => useCustomCommands());

      await waitFor(() => {
        expect(result.current.commands).toEqual([]);
      });

      await act(async () => {
        await result.current.createCommand({
          name: 'Deploy',
          description: 'Deploy app',
          body: 'deploy',
          scope: 'user',
        });
      });

      // Commands should be reloaded
      expect(mockAPI.listCustomCommands).toHaveBeenCalledTimes(2);
    });

    it('should handle creation errors', async () => {
      mockAPI.listCustomCommands.mockResolvedValue([]);
      mockAPI.createCustomCommand.mockRejectedValue(new Error('Creation failed'));

      const { result } = renderHook(() => useCustomCommands());

      await act(async () => {
        try {
          await result.current.createCommand({
            name: 'Deploy',
            description: 'Deploy app',
            body: 'deploy',
            scope: 'user',
          });
        } catch (err) {
          expect(err).toBeDefined();
        }
      });

      expect(mockAPI.createCustomCommand).toHaveBeenCalled();
    });
  });

  // ── Update Command Tests ────────────────────────────────────────────────

  describe('updateCommand', () => {
    it('should update an existing command', async () => {
      const initialCommand: CustomCommand = {
        slug: 'deploy',
        description: 'Old description',
        body: 'old body',
        parameters: [],
        scope: 'user',
        filePath: '/path/deploy.md',
        tags: [],
        icon: 'Terminal',
        updatedAt: Date.now(),
      };

      mockAPI.listCustomCommands.mockResolvedValue([initialCommand]);

      const updatedCommand = {
        ...initialCommand,
        description: 'New description',
        body: 'new body',
      };

      mockAPI.updateCustomCommand.mockResolvedValue(updatedCommand);

      const { result } = renderHook(() => useCustomCommands());

      await waitFor(() => {
        expect(result.current.commands).toEqual([initialCommand]);
      });

      let updated: CustomCommand | undefined;
      await act(async () => {
        updated = await result.current.updateCommand({
          slug: 'deploy',
          scope: 'user',
          description: 'New description',
          body: 'new body',
        });
      });

      expect(updated).toEqual(updatedCommand);
      expect(mockAPI.updateCustomCommand).toHaveBeenCalled();
    });

    it('should reload commands after update', async () => {
      const cmd: CustomCommand = {
        slug: 'deploy',
        description: 'Test',
        body: 'body',
        parameters: [],
        scope: 'user',
        filePath: '/path/deploy.md',
        tags: [],
        icon: 'Terminal',
        updatedAt: Date.now(),
      };

      mockAPI.listCustomCommands.mockResolvedValue([cmd]);
      mockAPI.updateCustomCommand.mockResolvedValue({
        ...cmd,
        description: 'Updated',
      });

      const { result } = renderHook(() => useCustomCommands());

      await waitFor(() => {
        expect(result.current.commands).toEqual([cmd]);
      });

      const initialCallCount = mockAPI.listCustomCommands.mock.calls.length;

      await act(async () => {
        await result.current.updateCommand({
          slug: 'deploy',
          scope: 'user',
          description: 'Updated',
        });
      });

      // Should have reloaded
      expect(mockAPI.listCustomCommands.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  // ── Delete Command Tests ────────────────────────────────────────────────

  describe('deleteCommand', () => {
    it('should delete a command', async () => {
      const cmd: CustomCommand = {
        slug: 'deploy',
        description: 'Deploy',
        body: 'deploy',
        parameters: [],
        scope: 'user',
        filePath: '/path/deploy.md',
        tags: [],
        icon: 'Terminal',
        updatedAt: Date.now(),
      };

      mockAPI.listCustomCommands.mockResolvedValue([cmd]);
      mockAPI.deleteCustomCommand.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCustomCommands());

      await waitFor(() => {
        expect(result.current.commands).toEqual([cmd]);
      });

      const initialCallCount = mockAPI.listCustomCommands.mock.calls.length;

      await act(async () => {
        await result.current.deleteCommand({
          slug: 'deploy',
          scope: 'user',
        });
      });

      expect(mockAPI.deleteCustomCommand).toHaveBeenCalledWith({
        slug: 'deploy',
        scope: 'user',
      });

      // Should have reloaded (commands should be empty now)
      expect(mockAPI.listCustomCommands.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('should handle delete errors', async () => {
      mockAPI.listCustomCommands.mockResolvedValue([]);
      mockAPI.deleteCustomCommand.mockRejectedValue(new Error('Delete failed'));

      const { result } = renderHook(() => useCustomCommands());

      await act(async () => {
        try {
          await result.current.deleteCommand({
            slug: 'deploy',
            scope: 'user',
          });
        } catch (err) {
          expect(err).toBeDefined();
        }
      });
    });
  });

  // ── Validation Tests ────────────────────────────────────────────────────

  describe('validateName', () => {
    it('should validate a command name', async () => {
      mockAPI.listCustomCommands.mockResolvedValue([]);
      mockAPI.validateCommandName.mockResolvedValue({
        valid: true,
        errors: [],
        suggestedSlug: 'deploy-staging',
      });

      const { result } = renderHook(() => useCustomCommands());

      let validation;
      await act(async () => {
        validation = await result.current.validateName('Deploy Staging', 'user');
      });

      expect(validation?.valid).toBe(true);
      expect(validation?.suggestedSlug).toBe('deploy-staging');
      // validateName can be called with or without optional projectDir
      expect(mockAPI.validateCommandName).toHaveBeenCalled();
      const call = mockAPI.validateCommandName.mock.calls[0];
      expect(call[0]).toBe('Deploy Staging');
      expect(call[1]).toBe('user');
    });

    it('should return validation errors', async () => {
      mockAPI.listCustomCommands.mockResolvedValue([]);
      mockAPI.validateCommandName.mockResolvedValue({
        valid: false,
        errors: ['Command already exists'],
        suggestedSlug: 'deploy',
      });

      const { result } = renderHook(() => useCustomCommands());

      let validation;
      await act(async () => {
        validation = await result.current.validateName('deploy', 'user');
      });

      expect(validation?.valid).toBe(false);
      expect(validation?.errors).toContain('Command already exists');
    });

    it('should pass projectDir parameter to validation', async () => {
      mockAPI.listCustomCommands.mockResolvedValue([]);
      mockAPI.validateCommandName.mockResolvedValue({
        valid: true,
        errors: [],
        suggestedSlug: 'deploy-staging',
      });

      const { result } = renderHook(() =>
        useCustomCommands(),
      );

      await act(async () => {
        // Call validateName with explicit projectDir parameter
        await result.current.validateName('Deploy Staging', 'project', '/home/user/project');
      });

      // The projectDir parameter should be passed through to the API
      expect(mockAPI.validateCommandName).toHaveBeenCalledWith('Deploy Staging', 'project', '/home/user/project');
    });
  });

  // ── Manual Reload Tests ────────────────────────────────────────────────

  describe('loadCommands', () => {
    it('should manually reload commands', async () => {
      const cmd: CustomCommand = {
        slug: 'test',
        description: 'Test',
        body: 'test',
        parameters: [],
        scope: 'user',
        filePath: '/path/test.md',
        tags: [],
        icon: 'Terminal',
        updatedAt: Date.now(),
      };

      mockAPI.listCustomCommands.mockResolvedValue([]);

      const { result } = renderHook(() => useCustomCommands());

      await waitFor(() => {
        expect(result.current.commands).toEqual([]);
      });

      const initialCallCount = mockAPI.listCustomCommands.mock.calls.length;

      mockAPI.listCustomCommands.mockResolvedValue([cmd]);

      await act(async () => {
        await result.current.loadCommands();
      });

      expect(mockAPI.listCustomCommands.mock.calls.length).toBeGreaterThan(initialCallCount);
      expect(result.current.commands).toEqual([cmd]);
    });

    it('should set isLoading during manual reload', async () => {
      mockAPI.listCustomCommands.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(() => resolve([]), 100),
          ),
      );

      const { result } = renderHook(() => useCustomCommands());

      await act(async () => {
        const loadPromise = result.current.loadCommands();

        // Should be loading immediately
        expect(result.current.isLoading).toBe(true);

        await loadPromise;
      });

      // Should be done loading
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle errors during manual reload', async () => {
      mockAPI.listCustomCommands.mockRejectedValue(new Error('Reload failed'));

      const { result } = renderHook(() => useCustomCommands());

      await act(async () => {
        await result.current.loadCommands();
      });

      expect(result.current.error).toContain('Reload failed');
    });
  });

  // ── Options Change Tests ────────────────────────────────────────────────

  describe('options changes', () => {
    it('should reload when projectDir changes', async () => {
      mockAPI.listCustomCommands.mockResolvedValue([]);

      const { result, rerender } = renderHook(
        (options) => useCustomCommands(options),
        {
          initialProps: { projectDir: '/path/1' },
        },
      );

      await waitFor(() => {
        expect(result.current.commands).toEqual([]);
      });

      const initialCallCount = mockAPI.listCustomCommands.mock.calls.length;

      rerender({ projectDir: '/path/2' });

      // Should have reloaded with new projectDir
      await waitFor(() => {
        expect(mockAPI.listCustomCommands.mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });

    it('should reload when sessionId changes', async () => {
      mockAPI.listCustomCommands.mockResolvedValue([]);

      const { result, rerender } = renderHook(
        (options) => useCustomCommands(options),
        {
          initialProps: { sessionId: 'session-1' },
        },
      );

      await waitFor(() => {
        expect(result.current.commands).toEqual([]);
      });

      const initialCallCount = mockAPI.listCustomCommands.mock.calls.length;

      rerender({ sessionId: 'session-2' });

      // Should have reloaded
      await waitFor(() => {
        expect(mockAPI.listCustomCommands.mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });
  });

  // ── Error Handling Tests ────────────────────────────────────────────────

  describe('error handling', () => {
    it('should clear error after successful load', async () => {
      mockAPI.listCustomCommands.mockRejectedValueOnce(new Error('Initial error'));

      const { result } = renderHook(() => useCustomCommands());

      await waitFor(() => {
        expect(result.current.error).toContain('Initial error');
      });

      mockAPI.listCustomCommands.mockResolvedValue([]);

      await act(async () => {
        await result.current.loadCommands();
      });

      expect(result.current.error).toBeNull();
    });

    it('should handle unknown error type', async () => {
      mockAPI.listCustomCommands.mockRejectedValue('Unknown error');

      const { result } = renderHook(() => useCustomCommands());

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });
    });
  });
});
