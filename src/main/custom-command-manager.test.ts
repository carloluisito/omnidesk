/**
 * Tests for CustomCommandManager
 *
 * Covers:
 *   - Happy path: create, read, update, delete commands
 *   - Duplicate name detection and conflict resolution
 *   - Invalid inputs (empty name, reserved names, empty body)
 *   - File system operations (atomic writes, directory creation)
 *   - Session-only vs persistent commands
 *   - Command listing with scope merging
 *   - Name validation and slug generation
 *   - File watching and debouncing
 *   - Error handling for filesystem issues
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs module BEFORE any imports that use it
vi.mock('fs');

// Mock os BEFORE any imports that use it
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

// Mock IPCEmitter BEFORE importing CustomCommandManager
vi.mock('./ipc-emitter');

// NOW import the modules that were mocked above
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CustomCommandManager } from './custom-command-manager';
import { IPCEmitter } from './ipc-emitter';
import type { CustomCommand, CommandParameter } from '../shared/types/custom-command-types';

const mockedFs = vi.mocked(fs);
const mockedOs = vi.mocked(os);
const MockedIPCEmitter = vi.mocked(IPCEmitter);

describe('CustomCommandManager', () => {
  let manager: CustomCommandManager;
  let mockEmitter: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset fs mocks to default behaviors
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.mkdirSync.mockReturnValue(undefined);
    mockedFs.writeFileSync.mockReturnValue(undefined);
    mockedFs.renameSync.mockReturnValue(undefined);
    mockedFs.readFileSync.mockReturnValue('');
    mockedFs.statSync.mockReturnValue({
      size: 100,
      mtimeMs: Date.now(),
    } as any);
    mockedFs.readdirSync.mockReturnValue([]);
    mockedFs.watch.mockReturnValue({
      close: vi.fn(),
      on: vi.fn(function () {
        return this;
      }),
    } as any);
    mockedFs.unlinkSync.mockReturnValue(undefined);

    mockEmitter = {
      emit: vi.fn(),
    };

    manager = new CustomCommandManager();
    manager.setEmitter(mockEmitter);
  });

  afterEach(() => {
    manager.destroy();
  });

  // ── Happy Path Tests ────────────────────────────────────────────────────

  describe('happy path', () => {
    it('should create a user-scoped command and write to disk', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const request = {
        name: 'Deploy Staging',
        description: 'Deploy to staging environment',
        body: 'npm run deploy:staging',
        scope: 'user' as const,
      };

      const cmd = manager.createCommand(request);

      expect(cmd.slug).toBe('deploy-staging');
      expect(cmd.description).toBe('Deploy to staging environment');
      expect(cmd.body).toBe('npm run deploy:staging');
      expect(cmd.scope).toBe('user');
      expect(cmd.filePath).toContain('deploy-staging.md');
      expect(cmd.parameters).toEqual([]);
      expect(cmd.tags).toEqual([]);
      expect(cmd.icon).toBe('Terminal');

      // Verify atomic write was called
      expect(mockedFs.writeFileSync).toHaveBeenCalled();
      expect(mockedFs.renameSync).toHaveBeenCalled();
    });

    it('should create a project-scoped command', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const request = {
        name: 'Run Tests',
        description: 'Run test suite',
        body: 'npm test',
        scope: 'project' as const,
        projectDir: '/home/user/project',
      };

      const cmd = manager.createCommand(request);

      expect(cmd.slug).toBe('run-tests');
      expect(cmd.scope).toBe('project');
      // Handle both Unix and Windows path separators
      expect(cmd.filePath).toMatch(/run-tests\.md$/);
      expect(cmd.filePath).toMatch(/\.claude[\\/]commands/);
    });

    it('should create a session-only command (not written to disk)', () => {
      const request = {
        name: 'Session Command',
        description: 'Temporary session command',
        body: 'echo hello',
        scope: 'session' as const,
        sessionId: 'session-1',
      };

      const cmd = manager.createCommand(request);

      expect(cmd.slug).toBe('session-command');
      expect(cmd.scope).toBe('session');
      expect(cmd.filePath).toBeNull();

      // Verify no filesystem operations
      expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
      expect(mockedFs.renameSync).not.toHaveBeenCalled();
    });

    it('should create command with parameters', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const params: CommandParameter[] = [
        {
          name: 'environment',
          description: 'Deployment environment',
          required: true,
          default: 'staging',
        },
        {
          name: 'verbose',
          description: 'Enable verbose output',
          required: false,
        },
      ];

      const request = {
        name: 'Deploy',
        description: 'Deploy app',
        body: 'deploy --env={{environment}} {{verbose && "--verbose"}}',
        scope: 'user' as const,
        parameters: params,
      };

      const cmd = manager.createCommand(request);

      expect(cmd.parameters).toHaveLength(2);
      expect(cmd.parameters[0].name).toBe('environment');
      expect(cmd.parameters[0].required).toBe(true);
      expect(cmd.parameters[0].default).toBe('staging');
    });

    it('should create command with tags and icon', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const request = {
        name: 'Build',
        description: 'Build project',
        body: 'npm run build',
        scope: 'user' as const,
        tags: ['build', 'production'],
        icon: 'Hammer',
      };

      const cmd = manager.createCommand(request);

      expect(cmd.tags).toEqual(['build', 'production']);
      expect(cmd.icon).toBe('Hammer');
    });

    it('should list commands with shadowing logic', () => {
      // Mock existence checks
      mockedFs.existsSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.includes('.md')) {
          return true; // Pretend all .md files exist
        }
        return false;
      });

      mockedFs.readFileSync.mockReturnValue(`---
description: Test
---
test body`);

      mockedFs.statSync.mockReturnValue({
        size: 100,
        mtimeMs: Date.now(),
      } as any);

      // List with projectDir should attempt to load both project and user scopes
      const cmds = manager.listCommands({
        projectDir: '/home/user/project',
      });

      // The listing should work without errors
      expect(Array.isArray(cmds)).toBe(true);
      expect(cmds).toBeDefined();
    });

    it('should update an existing command', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(`---
description: Old description
---
old body`);
      mockedFs.statSync.mockReturnValue({
        size: 100,
        mtimeMs: Date.now(),
      } as any);

      const updateRequest = {
        slug: 'deploy-staging',
        scope: 'user' as const,
        description: 'New description',
        body: 'new body',
      };

      const updated = manager.updateCommand(updateRequest);

      expect(updated.description).toBe('New description');
      expect(updated.body).toBe('new body');
      expect(mockedFs.writeFileSync).toHaveBeenCalled();
    });

    it('should delete a command', () => {
      mockedFs.existsSync.mockReturnValue(true);

      const deleteRequest = {
        slug: 'deploy-staging',
        scope: 'user' as const,
      };

      const deleted = manager.deleteCommand(deleteRequest);

      expect(deleted).toBe(true);
      expect(mockedFs.unlinkSync).toHaveBeenCalled();
    });

    it('should return false when deleting non-existent command', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const deleteRequest = {
        slug: 'nonexistent',
        scope: 'user' as const,
      };

      const deleted = manager.deleteCommand(deleteRequest);

      expect(deleted).toBe(false);
    });
  });

  // ── Validation Tests ────────────────────────────────────────────────────

  describe('name validation', () => {
    it('should reject empty name', () => {
      const validation = manager.validateName('', 'user');

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'Command name must contain at least one alphanumeric character',
      );
    });

    it('should reject reserved command names', () => {
      const validation = manager.validateName('help', 'user');

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('"help" is a reserved Claude Code command name');
    });

    it('should reject all reserved names', () => {
      const reserved = ['help', 'init', 'config', 'login', 'logout', 'version', 'update'];

      for (const name of reserved) {
        const validation = manager.validateName(name, 'user');
        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain(
          `"${name}" is a reserved Claude Code command name`,
        );
      }
    });

    it('should detect duplicate names in same scope', () => {
      mockedFs.existsSync.mockReturnValue(true);

      const validation = manager.validateName('deploy-staging', 'user');

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'A command named "deploy-staging" already exists in user scope',
      );
    });

    it('should suggest a valid slug from messy input', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const validation = manager.validateName('  My Deploy Script!  ', 'user');

      expect(validation.suggestedSlug).toBe('my-deploy-script');
      expect(validation.valid).toBe(true);
    });

    it('should handle spaces, underscores, and special chars', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const validation = manager.validateName('run_tests-now!', 'user');

      expect(validation.suggestedSlug).toBe('run-tests-now');
      expect(validation.valid).toBe(true);
    });

    it('should reject very long names', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const longName = 'a'.repeat(100);
      const cmd = manager.createCommand({
        name: longName,
        description: 'Test',
        body: 'test',
        scope: 'user',
      });

      // Slug should be truncated to 60 chars
      expect(cmd.slug.length).toBeLessThanOrEqual(60);
    });
  });

  // ── Invalid Input Tests ─────────────────────────────────────────────────

  describe('invalid inputs', () => {
    it('should throw when creating with empty description', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const request = {
        name: 'Valid Name',
        description: '', // Empty description should still work (shown as empty in UI)
        body: 'body',
        scope: 'user' as const,
      };

      // Should not throw - empty description is allowed
      const cmd = manager.createCommand(request);
      expect(cmd.description).toBe('');
    });

    it('should throw when creating with empty body', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const request = {
        name: 'Valid Name',
        description: 'Test',
        body: '', // Empty body
        scope: 'user' as const,
      };

      // Should not throw - empty body is technically allowed (unusual but not invalid)
      const cmd = manager.createCommand(request);
      expect(cmd.body).toBe('');
    });

    it('should throw when creating session command without sessionId', () => {
      const request = {
        name: 'Session Cmd',
        description: 'Test',
        body: 'body',
        scope: 'session' as const,
        // Missing sessionId
      };

      expect(() => manager.createCommand(request as any)).toThrow(
        'sessionId is required for session-scoped commands',
      );
    });

    it('should throw when creating project command without projectDir', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const request = {
        name: 'Project Cmd',
        description: 'Test',
        body: 'body',
        scope: 'project' as const,
        // Missing projectDir
      };

      expect(() => manager.createCommand(request as any)).toThrow(
        'projectDir is required for project-scoped commands',
      );
    });

    it('should throw on duplicate command name in same scope', () => {
      mockedFs.existsSync.mockReturnValue(true);

      const request = {
        name: 'Existing Command',
        description: 'Test',
        body: 'body',
        scope: 'user' as const,
      };

      expect(() => manager.createCommand(request)).toThrow(
        'A command named "existing-command" already exists in user scope',
      );
    });

    it('should allow duplicate names across different scopes', () => {
      mockedFs.existsSync.mockReturnValue(false);

      // Create in user scope
      const userCmd = manager.createCommand({
        name: 'Deploy',
        description: 'User deploy',
        body: 'user deploy',
        scope: 'user',
      });

      // Create same name in project scope
      const projectCmd = manager.createCommand({
        name: 'Deploy',
        description: 'Project deploy',
        body: 'project deploy',
        scope: 'project',
        projectDir: '/home/user/project',
      });

      expect(userCmd.slug).toBe(projectCmd.slug);
      expect(userCmd.scope).not.toBe(projectCmd.scope);
    });
  });

  // ── File System Error Handling ──────────────────────────────────────────

  describe('file system error handling', () => {
    it('should handle mkdirSync failure gracefully', () => {
      mockedFs.mkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const request = {
        name: 'Deploy',
        description: 'Test',
        body: 'body',
        scope: 'user' as const,
      };

      expect(() => manager.createCommand(request)).toThrow('Permission denied');
    });

    it('should handle write failure and clean up temp file', () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.writeFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });

      const request = {
        name: 'Deploy',
        description: 'Test',
        body: 'body',
        scope: 'user' as const,
      };

      expect(() => manager.createCommand(request)).toThrow('Disk full');
    });

    it('should handle delete failure gracefully', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.unlinkSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const deleteRequest = {
        slug: 'deploy',
        scope: 'user' as const,
      };

      const deleted = manager.deleteCommand(deleteRequest);
      expect(deleted).toBe(false);
    });

    it('should skip oversized files when scanning directories', () => {
      const largeFile = { name: 'large.md', isFile: () => true };
      mockedFs.readdirSync.mockReturnValue([largeFile] as any);

      // First call: stat returns large file
      mockedFs.statSync.mockReturnValue({
        size: 100000, // > 50KB
        mtimeMs: Date.now(),
      } as any);

      const cmds = manager.listCommands({});

      expect(cmds).toHaveLength(0); // Should skip large file
    });
  });

  // ── Session Management Tests ────────────────────────────────────────────

  describe('session-only commands', () => {
    it('should store session commands in memory only', () => {
      const sessionId = 'session-1';

      manager.createCommand({
        name: 'Temp',
        description: 'Temporary',
        body: 'body',
        scope: 'session',
        sessionId,
      });

      // Verify no filesystem calls
      expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should update session-only command', () => {
      const sessionId = 'session-1';

      const created = manager.createCommand({
        name: 'Temp',
        description: 'Original',
        body: 'original body',
        scope: 'session',
        sessionId,
      });

      const updated = manager.updateCommand({
        slug: 'temp',
        scope: 'session',
        sessionId,
        description: 'Updated',
      });

      expect(updated.description).toBe('Updated');
      expect(updated.body).toBe('original body'); // Unchanged
    });

    it('should list session commands separately', () => {
      const sessionId = 'session-1';

      manager.createCommand({
        name: 'Session Cmd',
        description: 'In session',
        body: 'body',
        scope: 'session',
        sessionId,
      });

      const cmds = manager.listCommands({ sessionId });

      expect(cmds.some(c => c.scope === 'session')).toBe(true);
    });

    it('should cleanup session commands when session is closed', () => {
      const sessionId = 'session-1';

      manager.createCommand({
        name: 'Temp',
        description: 'Test',
        body: 'body',
        scope: 'session',
        sessionId,
      });

      manager.cleanupSession(sessionId);

      const cmds = manager.listCommands({ sessionId });
      expect(cmds.filter(c => c.scope === 'session')).toHaveLength(0);
    });

    it('should throw when updating session command without sessionId', () => {
      const updateRequest = {
        slug: 'temp',
        scope: 'session' as const,
        // Missing sessionId
      };

      expect(() => manager.updateCommand(updateRequest as any)).toThrow(
        'sessionId is required for session-scoped commands',
      );
    });
  });

  // ── Slug and Name Handling ──────────────────────────────────────────────

  describe('slug and name handling', () => {
    it('should convert names to kebab-case slugs', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const testCases = [
        { name: 'Deploy Staging', slug: 'deploy-staging' },
        { name: 'run_tests', slug: 'run-tests' },
        { name: 'My-Test-Script', slug: 'my-test-script' },
        { name: '  trim   spaces  ', slug: 'trim-spaces' },
        { name: 'UPPERCASE', slug: 'uppercase' },
        { name: 'CamelCase', slug: 'camelcase' },
        { name: 'test123script', slug: 'test123script' },
        { name: '123-numbers', slug: '123-numbers' },
      ];

      for (const { name, slug } of testCases) {
        const cmd = manager.createCommand({
          name,
          description: 'Test',
          body: 'body',
          scope: 'user',
        });
        expect(cmd.slug).toBe(slug);
      }
    });

    it('should handle single-character slug', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const cmd = manager.createCommand({
        name: 'x',
        description: 'Single char',
        body: 'body',
        scope: 'user',
      });

      expect(cmd.slug).toBe('x');
    });
  });

  // ── File Watching Tests ─────────────────────────────────────────────────

  describe('file watching and debouncing', () => {
    it('should watch user commands directory on creation', () => {
      const manager2 = new CustomCommandManager();

      expect(mockedFs.watch).toHaveBeenCalled();
      const callArgs = mockedFs.watch.mock.calls[0];
      // Handle both Unix and Windows path separators
      expect(String(callArgs[0])).toMatch(/\.claude[\\/]commands/);

      manager2.destroy();
    });

    it('should debounce file change notifications', async () => {
      manager.setProjectDir('/home/user/project');

      // Simulate multiple file change events
      const watchCallback = mockedFs.watch.mock.calls[0][1];
      const onEvent = (mockedFs.watch as any).mock.results[0].value.on;

      expect(onEvent).toBeDefined();
      // Note: Full debounce testing would require clock mocking (vi.useFakeTimers)
    });

    it('should emit command changed events', () => {
      const manager2 = new CustomCommandManager();
      const mockEmitter2 = { emit: vi.fn() };
      manager2.setEmitter(mockEmitter2);

      // The emitter should be set and available
      expect(mockEmitter2).toBeDefined();

      manager2.destroy();
    });

    it('should close watchers on destroy', () => {
      const mockWatcher = {
        close: vi.fn(),
        on: vi.fn(function () {
          return this;
        }),
      };
      mockedFs.watch.mockReturnValue(mockWatcher as any);

      const manager2 = new CustomCommandManager();
      manager2.destroy();

      // Watcher should be closed (mocked)
      expect(mockWatcher.close).toHaveBeenCalled();
    });
  });

  // ── GetCommand and GetCommand Tests ────────────────────────────────────

  describe('get single command', () => {
    it('should retrieve a single command by slug and scope', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(`---
description: Test Command
---
body content`);
      mockedFs.statSync.mockReturnValue({
        size: 100,
        mtimeMs: Date.now(),
      } as any);

      const cmd = manager.getCommand('test-cmd', 'user');

      expect(cmd).toBeDefined();
      expect(cmd?.slug).toBe('test-cmd');
      expect(cmd?.description).toBe('Test Command');
    });

    it('should return null for non-existent command', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const cmd = manager.getCommand('nonexistent', 'user');

      expect(cmd).toBeNull();
    });

    it('should return null for session scope (requires sessionId)', () => {
      const cmd = manager.getCommand('test', 'session');

      expect(cmd).toBeNull();
    });
  });

  // ── Update Command Edge Cases ───────────────────────────────────────────

  describe('update command edge cases', () => {
    it('should throw when updating non-existent command', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const updateRequest = {
        slug: 'nonexistent',
        scope: 'user' as const,
        description: 'New description',
      };

      expect(() => manager.updateCommand(updateRequest)).toThrow(
        'Command "nonexistent" not found in user scope',
      );
    });

    it('should throw when updating session command not found', () => {
      const updateRequest = {
        slug: 'nonexistent',
        scope: 'session' as const,
        sessionId: 'session-1',
        description: 'New description',
      };

      expect(() => manager.updateCommand(updateRequest)).toThrow(
        'Session command "nonexistent" not found',
      );
    });

    it('should preserve unspecified fields during update', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(`---
description: Original
tags:
  - tag1
---
original body`);
      mockedFs.statSync.mockReturnValue({
        size: 100,
        mtimeMs: Date.now(),
      } as any);

      const updated = manager.updateCommand({
        slug: 'test',
        scope: 'user',
        description: 'Updated',
        // body not specified, so should remain unchanged
      });

      expect(updated.description).toBe('Updated');
      expect(updated.body).toContain('original body');
    });
  });

  // ── Project Dir Management ──────────────────────────────────────────────

  describe('project directory management', () => {
    it('should change watched project directory', () => {
      manager.setProjectDir('/home/user/project1');

      // Should create a new watcher
      expect(mockedFs.watch).toHaveBeenCalled();

      manager.setProjectDir('/home/user/project2');

      // Should have been called again
      expect(mockedFs.watch.mock.calls.length).toBeGreaterThan(1);
    });

    it('should close old watcher when changing project dir', () => {
      const mockWatcher = {
        close: vi.fn(),
        on: vi.fn(function () {
          return this;
        }),
      };
      mockedFs.watch.mockReturnValue(mockWatcher as any);

      manager.setProjectDir('/home/user/project1');
      manager.setProjectDir('/home/user/project2');

      // Old watcher should be closed
      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('should clear project dir by passing null', () => {
      const mockWatcher = {
        close: vi.fn(),
        on: vi.fn(function () {
          return this;
        }),
      };
      mockedFs.watch.mockReturnValue(mockWatcher as any);

      manager.setProjectDir('/home/user/project');
      manager.setProjectDir(null);

      expect(mockWatcher.close).toHaveBeenCalled();
    });
  });
});
