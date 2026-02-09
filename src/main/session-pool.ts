import { CLIManager } from './cli-manager';
import { PermissionMode } from '../shared/ipc-types';

export interface SessionPoolConfig {
  size: number;           // Number of idle sessions to maintain (0-3)
  enabled: boolean;       // Whether pooling is enabled
  maxIdleTimeMs: number;  // Max time an idle session can sit before cleanup (default 5 min)
}

export interface PooledSession {
  cliManager: CLIManager;
  createdAt: number;
  id: string;
}

export class SessionPool {
  private idleQueue: PooledSession[] = [];
  private config: SessionPoolConfig;
  private isInitialized: boolean = false;
  private isShuttingDown: boolean = false;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private nextPoolId: number = 0;

  constructor(config: SessionPoolConfig) {
    this.config = config;
  }

  /**
   * Initialize the pool by pre-spawning idle sessions.
   * Called on app startup with a delay to avoid slowing down initial load.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized || !this.config.enabled || this.config.size === 0) {
      return;
    }

    console.log(`[SessionPool] Initializing pool with size ${this.config.size}`);

    // Pre-spawn configured number of idle sessions
    const spawnPromises: Promise<void>[] = [];
    for (let i = 0; i < this.config.size; i++) {
      spawnPromises.push(this.createIdleSession());
    }

    await Promise.all(spawnPromises);
    this.isInitialized = true;

    // Start periodic cleanup of stale sessions
    this.startCleanupInterval();

    console.log(`[SessionPool] Initialized with ${this.idleQueue.length} idle sessions`);
  }

  /**
   * Claim an idle session from the pool.
   * Returns null if pool is empty or disabled.
   */
  claim(): PooledSession | null {
    if (!this.config.enabled || this.idleQueue.length === 0) {
      return null;
    }

    const pooled = this.idleQueue.shift();
    if (!pooled) {
      return null;
    }

    console.log(`[SessionPool] Claimed session ${pooled.id}, ${this.idleQueue.length} remaining`);

    // Trigger async replenishment (non-blocking)
    this.replenishPool().catch(err => {
      console.error('[SessionPool] Failed to replenish pool:', err);
    });

    return pooled;
  }

  /**
   * Update pool configuration dynamically.
   * Adjusts pool size immediately if needed.
   */
  updateConfig(config: Partial<SessionPoolConfig>): void {
    const oldSize = this.config.size;
    const oldEnabled = this.config.enabled;

    this.config = { ...this.config, ...config };

    console.log(`[SessionPool] Config updated:`, this.config);

    // If disabled, destroy all idle sessions
    if (!this.config.enabled && oldEnabled) {
      console.log('[SessionPool] Disabled - destroying all idle sessions');
      this.destroyAllIdle();
      this.stopCleanupInterval();
      return;
    }

    // If enabled but was disabled, initialize
    if (this.config.enabled && !oldEnabled) {
      console.log('[SessionPool] Enabled - initializing pool');
      this.initialize().catch(err => {
        console.error('[SessionPool] Failed to initialize after enable:', err);
      });
      return;
    }

    // If size increased, spawn more idle sessions
    if (this.config.enabled && this.config.size > oldSize) {
      const diff = this.config.size - this.idleQueue.length;
      if (diff > 0) {
        console.log(`[SessionPool] Size increased - spawning ${diff} idle sessions`);
        for (let i = 0; i < diff; i++) {
          this.createIdleSession().catch(err => {
            console.error('[SessionPool] Failed to spawn idle session:', err);
          });
        }
      }
    }

    // If size decreased, destroy excess idle sessions
    if (this.config.enabled && this.config.size < oldSize) {
      const excess = this.idleQueue.length - this.config.size;
      if (excess > 0) {
        console.log(`[SessionPool] Size decreased - destroying ${excess} idle sessions`);
        for (let i = 0; i < excess; i++) {
          const pooled = this.idleQueue.pop();
          if (pooled) {
            pooled.cliManager.destroy();
          }
        }
      }
    }
  }

  /**
   * Get current pool status (for UI/debugging)
   */
  getStatus(): { idleCount: number; enabled: boolean; size: number } {
    return {
      idleCount: this.idleQueue.length,
      enabled: this.config.enabled,
      size: this.config.size,
    };
  }

  /**
   * Destroy all idle sessions and cleanup resources.
   * Called on app shutdown.
   */
  destroy(): void {
    console.log('[SessionPool] Shutting down');
    this.isShuttingDown = true;
    this.stopCleanupInterval();
    this.destroyAllIdle();
  }

  // ==================== Private Methods ====================

  /**
   * Create a single idle shell process and add to queue.
   */
  private async createIdleSession(): Promise<void> {
    if (this.isShuttingDown || !this.config.enabled) {
      return;
    }

    try {
      const id = `pool-${this.nextPoolId++}`;

      // Create CLI manager with placeholder options (will be updated on activation)
      const cliManager = new CLIManager({
        workingDirectory: process.cwd(), // Placeholder, will be overridden
        permissionMode: 'standard' as PermissionMode, // Placeholder
      });

      // Spawn shell only (Phase 1)
      await cliManager.spawnShell();

      const pooled: PooledSession = {
        cliManager,
        createdAt: Date.now(),
        id,
      };

      this.idleQueue.push(pooled);
      console.log(`[SessionPool] Created idle session ${id}, queue size: ${this.idleQueue.length}`);
    } catch (err) {
      console.error('[SessionPool] Failed to create idle session:', err);
    }
  }

  /**
   * Replenish pool back to configured size (async, non-blocking).
   */
  private async replenishPool(): Promise<void> {
    if (this.isShuttingDown || !this.config.enabled) {
      return;
    }

    const needed = this.config.size - this.idleQueue.length;
    if (needed <= 0) {
      return;
    }

    console.log(`[SessionPool] Replenishing ${needed} sessions`);

    const spawnPromises: Promise<void>[] = [];
    for (let i = 0; i < needed; i++) {
      spawnPromises.push(this.createIdleSession());
    }

    await Promise.all(spawnPromises);
  }

  /**
   * Start periodic cleanup of stale idle sessions.
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      return;
    }

    // Check every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupStale();
    }, 60000);
  }

  /**
   * Stop cleanup interval.
   */
  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Remove and destroy stale idle sessions (older than maxIdleTimeMs).
   */
  private cleanupStale(): void {
    const now = Date.now();
    const originalSize = this.idleQueue.length;

    this.idleQueue = this.idleQueue.filter(pooled => {
      const age = now - pooled.createdAt;
      if (age > this.config.maxIdleTimeMs) {
        console.log(`[SessionPool] Destroying stale session ${pooled.id} (age: ${Math.round(age / 1000)}s)`);
        pooled.cliManager.destroy();
        return false;
      }
      return true;
    });

    const removed = originalSize - this.idleQueue.length;
    if (removed > 0) {
      console.log(`[SessionPool] Cleaned up ${removed} stale sessions, ${this.idleQueue.length} remaining`);

      // Replenish if needed
      this.replenishPool().catch(err => {
        console.error('[SessionPool] Failed to replenish after cleanup:', err);
      });
    }
  }

  /**
   * Destroy all idle sessions in the queue.
   */
  private destroyAllIdle(): void {
    for (const pooled of this.idleQueue) {
      pooled.cliManager.destroy();
    }
    this.idleQueue = [];
    console.log('[SessionPool] Destroyed all idle sessions');
  }
}
