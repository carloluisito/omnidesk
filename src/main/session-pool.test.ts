import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock cli-manager so no real shell processes ever spawn.
vi.mock('./cli-manager', () => {
  const CLIManager = vi.fn();
  CLIManager.prototype.spawnShell = vi.fn().mockResolvedValue(undefined);
  CLIManager.prototype.destroy = vi.fn();
  return { CLIManager };
});

import { SessionPool } from './session-pool';
import { CLIManager } from './cli-manager';

function createPool(overrides: Partial<{ size: number; enabled: boolean; maxIdleTimeMs: number }> = {}) {
  return new SessionPool({
    size: 2,
    enabled: true,
    maxIdleTimeMs: 5 * 60 * 1000,
    ...overrides,
  });
}

describe('SessionPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialize()', () => {
    it('spawns config.size idle sessions', async () => {
      const pool = createPool({ size: 2 });
      await pool.initialize();

      expect(CLIManager.prototype.spawnShell).toHaveBeenCalledTimes(2);
      expect(pool.getStatus().idleCount).toBe(2);
    });

    it('is a no-op when disabled', async () => {
      const pool = createPool({ enabled: false, size: 2 });
      await pool.initialize();

      expect(CLIManager.prototype.spawnShell).not.toHaveBeenCalled();
      expect(pool.getStatus().idleCount).toBe(0);
    });

    it('is a no-op when size is 0', async () => {
      const pool = createPool({ size: 0 });
      await pool.initialize();

      expect(CLIManager.prototype.spawnShell).not.toHaveBeenCalled();
      expect(pool.getStatus().idleCount).toBe(0);
    });

    it('is idempotent - a second call does not double-spawn', async () => {
      const pool = createPool({ size: 2 });
      await pool.initialize();
      await pool.initialize();

      expect(CLIManager.prototype.spawnShell).toHaveBeenCalledTimes(2);
      expect(pool.getStatus().idleCount).toBe(2);
    });
  });

  describe('claim()', () => {
    it('returns a pooled session and triggers async replenishment back to size', async () => {
      const pool = createPool({ size: 2 });
      await pool.initialize();
      vi.mocked(CLIManager.prototype.spawnShell).mockClear();

      const claimed = pool.claim();
      expect(claimed).not.toBeNull();
      expect(pool.getStatus().idleCount).toBe(1);

      // Replenishment is fired-and-forgotten inside claim(); flush microtasks.
      await Promise.resolve();
      await Promise.resolve();

      expect(CLIManager.prototype.spawnShell).toHaveBeenCalledTimes(1);
      expect(pool.getStatus().idleCount).toBe(2);
    });

    it('returns null when disabled', () => {
      const pool = createPool({ enabled: false, size: 2 });
      expect(pool.claim()).toBeNull();
    });

    it('returns null when the queue is empty', () => {
      const pool = createPool({ size: 0 });
      expect(pool.claim()).toBeNull();
    });
  });

  describe('updateConfig()', () => {
    it('spawns the difference when size increases', async () => {
      const pool = createPool({ size: 1 });
      await pool.initialize();
      vi.mocked(CLIManager.prototype.spawnShell).mockClear();

      pool.updateConfig({ size: 3 });
      await Promise.resolve();
      await Promise.resolve();

      expect(CLIManager.prototype.spawnShell).toHaveBeenCalledTimes(2);
      expect(pool.getStatus().idleCount).toBe(3);
    });

    it('destroys the excess when size decreases', async () => {
      const pool = createPool({ size: 3 });
      await pool.initialize();

      pool.updateConfig({ size: 1 });

      expect(CLIManager.prototype.destroy).toHaveBeenCalledTimes(2);
      expect(pool.getStatus().idleCount).toBe(1);
    });

    it('disable destroys all idle sessions and stops the cleanup interval', async () => {
      vi.useFakeTimers();
      const pool = createPool({ size: 2 });
      await pool.initialize();

      pool.updateConfig({ enabled: false });

      expect(CLIManager.prototype.destroy).toHaveBeenCalledTimes(2);
      expect(pool.getStatus().idleCount).toBe(0);

      // Cleanup interval must be stopped: advancing well past it should not
      // touch the (already-empty) queue or spawn anything.
      vi.mocked(CLIManager.prototype.destroy).mockClear();
      vi.advanceTimersByTime(120_000);
      expect(CLIManager.prototype.destroy).not.toHaveBeenCalled();
    });

    it('re-enable after disable restores the pool (regression for #73)', async () => {
      const pool = createPool({ size: 2 });
      await pool.initialize();
      expect(pool.getStatus().idleCount).toBe(2);

      pool.updateConfig({ enabled: false });
      expect(pool.getStatus().idleCount).toBe(0);

      pool.updateConfig({ enabled: true });
      // initialize() is fired-and-forgotten from the re-enable branch.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(pool.getStatus().idleCount).toBe(pool.getStatus().size);
      expect(pool.getStatus().idleCount).toBe(2);
    });
  });

  describe('cleanupStale()', () => {
    it('destroys sessions older than maxIdleTimeMs and replenishes', async () => {
      vi.useFakeTimers();
      const pool = createPool({ size: 2, maxIdleTimeMs: 1000 });
      await pool.initialize();
      vi.mocked(CLIManager.prototype.spawnShell).mockClear();

      // Age the idle sessions past maxIdleTimeMs, then let the 60s cleanup
      // interval fire exactly once. advanceTimersByTimeAsync flushes the
      // microtasks from the async replenishPool() kicked off inside
      // cleanupStale() as it goes, so the interval isn't re-entered.
      await vi.advanceTimersByTimeAsync(61_500);

      expect(CLIManager.prototype.destroy).toHaveBeenCalledTimes(2);
      expect(CLIManager.prototype.spawnShell).toHaveBeenCalledTimes(2);
      expect(pool.getStatus().idleCount).toBe(2);
    });
  });

  describe('destroy()', () => {
    it('stops the interval and empties the queue', async () => {
      vi.useFakeTimers();
      const pool = createPool({ size: 2 });
      await pool.initialize();

      pool.destroy();

      expect(CLIManager.prototype.destroy).toHaveBeenCalledTimes(2);
      expect(pool.getStatus().idleCount).toBe(0);

      vi.mocked(CLIManager.prototype.destroy).mockClear();
      vi.advanceTimersByTime(120_000);
      expect(CLIManager.prototype.destroy).not.toHaveBeenCalled();
    });
  });
});
