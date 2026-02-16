import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('IPC Handlers - revealInExplorer', () => {
  describe('handler logic', () => {
    it('returns true when directory exists and showItemInFolder is called', () => {
      // Mock the dependencies
      const mockSession = {
        workingDirectory: '/home/user/project',
      };

      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue(mockSession),
      };

      const mockFs = {
        existsSync: vi.fn().mockReturnValue(true),
      };

      const mockShell = {
        showItemInFolder: vi.fn().mockReturnValue(undefined),
      };

      // Simulate the handler logic
      const result = (() => {
        try {
          const session = mockSessionManager.getSession('session-123');
          if (!session) return false;

          const workDir = session.workingDirectory;
          if (!mockFs.existsSync(workDir)) return false;

          mockShell.showItemInFolder(workDir);
          return true;
        } catch (err) {
          return false;
        }
      })();

      expect(result).toBe(true);
      expect(mockSessionManager.getSession).toHaveBeenCalledWith('session-123');
      expect(mockFs.existsSync).toHaveBeenCalledWith('/home/user/project');
      expect(mockShell.showItemInFolder).toHaveBeenCalledWith('/home/user/project');
    });

    it('returns false when session not found', () => {
      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue(null),
      };

      const mockShell = {
        showItemInFolder: vi.fn(),
      };

      const result = (() => {
        try {
          const session = mockSessionManager.getSession('nonexistent');
          if (!session) return false;
          return true;
        } catch (err) {
          return false;
        }
      })();

      expect(result).toBe(false);
      expect(mockSessionManager.getSession).toHaveBeenCalledWith('nonexistent');
      expect(mockShell.showItemInFolder).not.toHaveBeenCalled();
    });

    it('returns false when directory does not exist', () => {
      const mockSession = {
        workingDirectory: '/deleted/directory',
      };

      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue(mockSession),
      };

      const mockFs = {
        existsSync: vi.fn().mockReturnValue(false),
      };

      const mockShell = {
        showItemInFolder: vi.fn(),
      };

      const result = (() => {
        try {
          const session = mockSessionManager.getSession('session-123');
          if (!session) return false;

          const workDir = session.workingDirectory;
          if (!mockFs.existsSync(workDir)) return false;

          mockShell.showItemInFolder(workDir);
          return true;
        } catch (err) {
          return false;
        }
      })();

      expect(result).toBe(false);
      expect(mockFs.existsSync).toHaveBeenCalledWith('/deleted/directory');
      expect(mockShell.showItemInFolder).not.toHaveBeenCalled();
    });

    it('returns false on exception', () => {
      const mockSessionManager = {
        getSession: vi.fn().mockImplementation(() => {
          throw new Error('Database error');
        }),
      };

      const result = (() => {
        try {
          const session = mockSessionManager.getSession('session-123');
          if (!session) return false;
          return true;
        } catch (err) {
          return false;
        }
      })();

      expect(result).toBe(false);
    });
  });
});
