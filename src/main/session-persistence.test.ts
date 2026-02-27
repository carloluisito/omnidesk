import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock config-dir.ts so CONFIG_DIR resolves to a predictable test path.
// Note: vi.mock is hoisted, so we cannot reference variables declared above it.
vi.mock('./config-dir', () => ({
  CONFIG_DIR: '/mock/home/.omnidesk',
  ensureConfigDir: vi.fn(),
  migrateFromLegacy: vi.fn(),
}));

// Mock electron app (used only by getHomeDirectory)
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/home'),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
}));

import {
  loadSessionState,
  saveSessionState,
  clearSessionState,
  validateDirectory,
  getHomeDirectory,
} from './session-persistence';

const SESSIONS_FILE = path.join('/mock/home/.omnidesk', 'sessions.json');

describe('session-persistence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loadSessionState', () => {
    it('returns null when sessions file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(loadSessionState()).toBeNull();
    });

    it('parses valid JSON and returns session state', () => {
      const savedState = {
        version: 1,
        sessions: [
          { id: 's1', name: 'Test', workingDirectory: '/test', permissionMode: 'standard', status: 'running', createdAt: 1000 },
        ],
        activeSessionId: 's1',
        lastModified: 2000,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedState));

      const result = loadSessionState();
      expect(result).not.toBeNull();
      expect(result!.sessions).toHaveLength(1);
      expect(result!.activeSessionId).toBe('s1');
    });

    it('marks all sessions as exited on load', () => {
      const savedState = {
        version: 1,
        sessions: [
          { id: 's1', name: 'Test', workingDirectory: '/test', permissionMode: 'standard', status: 'running', createdAt: 1000 },
          { id: 's2', name: 'Test2', workingDirectory: '/test2', permissionMode: 'standard', status: 'running', createdAt: 2000 },
        ],
        activeSessionId: 's1',
        lastModified: 3000,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedState));

      const result = loadSessionState();
      expect(result!.sessions[0].status).toBe('exited');
      expect(result!.sessions[1].status).toBe('exited');
    });

    it('returns null on bad version', () => {
      const savedState = { version: 99, sessions: [], activeSessionId: null };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedState));

      expect(loadSessionState()).toBeNull();
    });

    it('returns null on parse error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json{{{');

      expect(loadSessionState()).toBeNull();
    });

    it('returns null on file read error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('EACCES');
      });

      expect(loadSessionState()).toBeNull();
    });
  });

  describe('saveSessionState', () => {
    it('creates config directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      saveSessionState([], null);

      // saveSessionState calls ensureConfigDir() from config-dir.ts (mocked above).
      // The atomic write should still target the correct sessions file path.
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.omnidesk'),
        expect.any(String),
        'utf-8'
      );
    });

    it('performs atomic write (tmp file then rename)', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      saveSessionState([], null);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        `${SESSIONS_FILE}.tmp`,
        expect.any(String),
        'utf-8'
      );
      expect(fs.renameSync).toHaveBeenCalledWith(
        `${SESSIONS_FILE}.tmp`,
        SESSIONS_FILE
      );
    });

    it('serializes sessions correctly', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const sessions = [
        {
          id: 's1',
          name: 'Test',
          workingDirectory: '/test',
          permissionMode: 'standard' as const,
          status: 'running' as const,
          createdAt: 1000,
          exitCode: undefined,
          currentModel: 'sonnet' as const,
        },
      ];

      saveSessionState(sessions, 's1');

      const writtenJson = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenJson);
      expect(parsed.version).toBe(1);
      expect(parsed.sessions[0].id).toBe('s1');
      expect(parsed.sessions[0].name).toBe('Test');
      expect(parsed.activeSessionId).toBe('s1');
      expect(parsed.lastModified).toBeGreaterThan(0);
    });

    it('handles write errors gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('ENOSPC');
      });

      // Should not throw
      expect(() => saveSessionState([], null)).not.toThrow();
    });
  });

  describe('clearSessionState', () => {
    it('deletes the sessions file when it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      clearSessionState();

      expect(fs.unlinkSync).toHaveBeenCalledWith(SESSIONS_FILE);
    });

    it('does nothing when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      clearSessionState();

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('validateDirectory', () => {
    it('returns true for existing directories', () => {
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
      expect(validateDirectory('/some/dir')).toBe(true);
    });

    it('returns false for non-directories', () => {
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(validateDirectory('/some/file.txt')).toBe(false);
    });

    it('returns false when path does not exist', () => {
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(validateDirectory('/nonexistent')).toBe(false);
    });
  });

  describe('getHomeDirectory', () => {
    it('returns the home directory from electron app', () => {
      expect(getHomeDirectory()).toBe('/mock/home');
    });
  });
});
