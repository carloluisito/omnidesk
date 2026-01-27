/**
 * Agent Usage Tracking - Tracks recently used agents for quick access
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface AgentUsageEntry {
  agentId: string;
  agentName: string;
  lastUsedAt: string;
  useCount: number;
}

interface AgentUsageData {
  entries: AgentUsageEntry[];
}

// Lazy path resolution - evaluated when needed, not at module load time
function getUsageFilePath(): string {
  return join(process.cwd(), 'config', 'agent-usage.json');
}

const MAX_RECENT_AGENTS = 10; // Store more than we display for flexibility

class AgentUsageManager {
  private data: AgentUsageData = { entries: [] };
  private loaded = false;

  private ensureLoaded(): void {
    if (!this.loaded) {
      this.load();
      this.loaded = true;
    }
  }

  private load(): void {
    try {
      const usageFile = getUsageFilePath();
      if (existsSync(usageFile)) {
        const content = readFileSync(usageFile, 'utf-8');
        this.data = JSON.parse(content);
      }
    } catch (error) {
      console.error('[AgentUsage] Failed to load usage data:', error);
      this.data = { entries: [] };
    }
  }

  private save(): void {
    try {
      const configDir = join(process.cwd(), 'config');
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
      writeFileSync(getUsageFilePath(), JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('[AgentUsage] Failed to save usage data:', error);
    }
  }

  /**
   * Record that an agent was used
   */
  recordAgentUsage(agentId: string, agentName: string): void {
    this.ensureLoaded();
    const existingIndex = this.data.entries.findIndex((e) => e.agentId === agentId);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      // Update existing entry
      this.data.entries[existingIndex].lastUsedAt = now;
      this.data.entries[existingIndex].useCount += 1;
      this.data.entries[existingIndex].agentName = agentName; // Update name in case it changed
    } else {
      // Add new entry
      this.data.entries.push({
        agentId,
        agentName,
        lastUsedAt: now,
        useCount: 1,
      });
    }

    // Sort by lastUsedAt descending
    this.data.entries.sort(
      (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
    );

    // Keep only the most recent entries
    if (this.data.entries.length > MAX_RECENT_AGENTS) {
      this.data.entries = this.data.entries.slice(0, MAX_RECENT_AGENTS);
    }

    this.save();
  }

  /**
   * Get recently used agents (most recent first)
   */
  getRecentAgents(limit: number = 3): AgentUsageEntry[] {
    this.ensureLoaded();
    return this.data.entries.slice(0, limit);
  }

  /**
   * Get all usage entries
   */
  getAllUsage(): AgentUsageEntry[] {
    this.ensureLoaded();
    return [...this.data.entries];
  }

  /**
   * Clear all usage history
   */
  clearHistory(): void {
    this.ensureLoaded();
    this.data = { entries: [] };
    this.save();
  }
}

// Lazy singleton - only created on first access (after cli.ts has called process.chdir())
let _agentUsageManager: AgentUsageManager | null = null;

function getAgentUsageManagerInstance(): AgentUsageManager {
  if (!_agentUsageManager) {
    _agentUsageManager = new AgentUsageManager();
  }
  return _agentUsageManager;
}

export const agentUsageManager = new Proxy({} as AgentUsageManager, {
  get(_, prop) {
    const instance = getAgentUsageManagerInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as Function).bind(instance) : value;
  }
});
