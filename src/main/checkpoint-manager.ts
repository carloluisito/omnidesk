/**
 * Checkpoint Manager - Core checkpoint logic
 */

import { v4 as uuidv4 } from 'uuid';
import { BrowserWindow } from 'electron';
import type {
  Checkpoint,
  CheckpointIndex,
  CheckpointCreateRequest,
  CheckpointExportFormat,
  CheckpointExportJson,
} from '../shared/types/checkpoint-types';
import {
  loadCheckpointIndex,
  saveCheckpointIndex,
} from './checkpoint-persistence';
import type { HistoryManager } from './history-manager';
import { IPCEmitter } from './ipc-emitter';

/**
 * Manages checkpoint creation, retrieval, and export
 */
export class CheckpointManager {
  private index: CheckpointIndex = { version: 1, checkpoints: {}, bySession: {} };
  private historyManager: HistoryManager;
  private emitter: IPCEmitter | null = null;

  constructor(historyManager: HistoryManager) {
    this.historyManager = historyManager;
    this.initialize();
  }

  /**
   * Set main window for IPC events
   */
  setMainWindow(window: BrowserWindow): void {
    this.emitter = new IPCEmitter(window);
  }

  /**
   * Initialize checkpoint manager
   */
  private async initialize(): Promise<void> {
    try {
      this.index = await loadCheckpointIndex();
      console.log('[CheckpointManager] Loaded checkpoint index:', {
        checkpointCount: Object.keys(this.index.checkpoints).length,
        sessionCount: Object.keys(this.index.bySession).length,
      });
    } catch (err) {
      console.error('Failed to initialize checkpoint manager:', err);
    }
  }

  /**
   * Create a new checkpoint
   */
  async createCheckpoint(request: CheckpointCreateRequest): Promise<Checkpoint> {
    try {
      const { sessionId, name, description, tags } = request;

      // Validate name
      if (!name || name.trim().length === 0) {
        throw new Error('Checkpoint name is required');
      }

      // Get session metadata from history
      const historyEntries = await this.historyManager.listSessions();
      const sessionEntry = historyEntries.find(s => s.id === sessionId);

      if (!sessionEntry) {
        throw new Error(`Session ${sessionId} not found in history`);
      }

      // Get current history position
      const historyPosition = sessionEntry.sizeBytes;
      const historySegment = sessionEntry.segmentCount;

      // Generate conversation summary (last 5 lines)
      let conversationSummary: string | undefined;
      try {
        const fullContent = await this.historyManager.getSessionContent(sessionId);
        const lines = fullContent.split('\n').filter(line => line.trim().length > 0);
        const recentLines = lines.slice(-5);
        conversationSummary = recentLines.join('\n');
      } catch (err) {
        console.warn('Failed to generate conversation summary:', err);
        conversationSummary = undefined;
      }

      // Create checkpoint
      const checkpoint: Checkpoint = {
        id: uuidv4(),
        sessionId,
        name: name.substring(0, 50), // Enforce max length
        description: description?.substring(0, 500), // Enforce max length
        createdAt: Date.now(),
        historyPosition,
        historySegment,
        conversationSummary,
        tags,
      };

      // Update index
      this.index.checkpoints[checkpoint.id] = checkpoint;

      if (!this.index.bySession[sessionId]) {
        this.index.bySession[sessionId] = [];
      }
      this.index.bySession[sessionId].push(checkpoint.id);

      // Save index
      await saveCheckpointIndex(this.index);

      console.log('[CheckpointManager] Created checkpoint:', {
        id: checkpoint.id,
        name: checkpoint.name,
        sessionId,
        position: historyPosition,
        segment: historySegment,
      });

      // Notify renderer
      this.emitter?.emit('onCheckpointCreated', checkpoint);

      return checkpoint;
    } catch (err) {
      console.error('Failed to create checkpoint:', err);
      throw err;
    }
  }

  /**
   * List checkpoints for a session (or all if sessionId not provided)
   */
  async listCheckpoints(sessionId?: string): Promise<Checkpoint[]> {
    try {
      if (sessionId) {
        const checkpointIds = this.index.bySession[sessionId] || [];
        return checkpointIds
          .map(id => this.index.checkpoints[id])
          .filter(Boolean)
          .sort((a, b) => a.createdAt - b.createdAt); // Chronological order
      } else {
        // Return all checkpoints, sorted by creation time
        return Object.values(this.index.checkpoints)
          .sort((a, b) => a.createdAt - b.createdAt);
      }
    } catch (err) {
      console.error('Failed to list checkpoints:', err);
      return [];
    }
  }

  /**
   * Get a specific checkpoint
   */
  async getCheckpoint(checkpointId: string): Promise<Checkpoint | null> {
    return this.index.checkpoints[checkpointId] || null;
  }

  /**
   * Delete a checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    try {
      const checkpoint = this.index.checkpoints[checkpointId];
      if (!checkpoint) {
        return false;
      }

      // Remove from index
      delete this.index.checkpoints[checkpointId];

      // Remove from session list
      const sessionCheckpoints = this.index.bySession[checkpoint.sessionId] || [];
      this.index.bySession[checkpoint.sessionId] = sessionCheckpoints.filter(
        id => id !== checkpointId
      );

      // Clean up empty session entries
      if (this.index.bySession[checkpoint.sessionId].length === 0) {
        delete this.index.bySession[checkpoint.sessionId];
      }

      // Save index
      await saveCheckpointIndex(this.index);

      console.log('[CheckpointManager] Deleted checkpoint:', checkpointId);

      // Notify renderer
      this.emitter?.emit('onCheckpointDeleted', checkpointId);

      return true;
    } catch (err) {
      console.error('Failed to delete checkpoint:', err);
      return false;
    }
  }

  /**
   * Export checkpoint history
   */
  async exportCheckpointHistory(
    checkpointId: string,
    format: CheckpointExportFormat
  ): Promise<string> {
    try {
      const checkpoint = await this.getCheckpoint(checkpointId);
      if (!checkpoint) {
        throw new Error('Checkpoint not found');
      }

      // Get history up to checkpoint position
      const history = await this.getHistoryUpToCheckpoint(checkpoint);

      if (format === 'markdown') {
        return this.formatAsMarkdown(checkpoint, history);
      } else {
        return this.formatAsJson(checkpoint, history);
      }
    } catch (err) {
      console.error('Failed to export checkpoint:', err);
      throw err;
    }
  }

  /**
   * Get history content up to a checkpoint
   */
  private async getHistoryUpToCheckpoint(checkpoint: Checkpoint): Promise<string> {
    try {
      const fullContent = await this.historyManager.getSessionContent(checkpoint.sessionId);

      // For now, use line-based truncation
      // In future, could use byte offset for more precision
      const allLines = fullContent.split('\n');

      // Estimate line count from byte position (rough approximation)
      // Average line length ~80 chars ~= ~80 bytes
      const estimatedLineCount = Math.floor(checkpoint.historyPosition / 80);
      const truncatedLines = allLines.slice(0, Math.min(estimatedLineCount, allLines.length));

      return truncatedLines.join('\n');
    } catch (err) {
      console.error('Failed to get history up to checkpoint:', err);
      throw err;
    }
  }

  /**
   * Format checkpoint as Markdown
   */
  private formatAsMarkdown(checkpoint: Checkpoint, history: string): string {
    const sessionName = checkpoint.sessionId; // Could enhance with actual session name lookup

    return `# Checkpoint: ${checkpoint.name}

**Created**: ${new Date(checkpoint.createdAt).toLocaleString()}
**Session**: ${sessionName}
**Description**: ${checkpoint.description || 'N/A'}
${checkpoint.tags && checkpoint.tags.length > 0 ? `**Tags**: ${checkpoint.tags.join(', ')}` : ''}

---

## Conversation History

\`\`\`
${history}
\`\`\`

---

*Checkpoint exported from OmniDesk on ${new Date().toISOString()}*
`;
  }

  /**
   * Format checkpoint as JSON
   */
  private formatAsJson(checkpoint: Checkpoint, history: string): string {
    const exportData: CheckpointExportJson = {
      version: 1,
      exportedAt: new Date().toISOString(),
      checkpoint,
      history,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Update checkpoint (name, description, tags)
   */
  async updateCheckpoint(
    checkpointId: string,
    updates: Partial<Pick<Checkpoint, 'name' | 'description' | 'tags' | 'isTemplate'>>
  ): Promise<Checkpoint | null> {
    try {
      const checkpoint = this.index.checkpoints[checkpointId];
      if (!checkpoint) {
        return null;
      }

      // Apply updates
      if (updates.name !== undefined) {
        checkpoint.name = updates.name.substring(0, 50);
      }
      if (updates.description !== undefined) {
        checkpoint.description = updates.description.substring(0, 500);
      }
      if (updates.tags !== undefined) {
        checkpoint.tags = updates.tags;
      }
      if (updates.isTemplate !== undefined) {
        checkpoint.isTemplate = updates.isTemplate;
      }

      // Save index
      await saveCheckpointIndex(this.index);

      console.log('[CheckpointManager] Updated checkpoint:', checkpointId);

      return checkpoint;
    } catch (err) {
      console.error('Failed to update checkpoint:', err);
      return null;
    }
  }

  /**
   * Clean up checkpoints for deleted sessions
   */
  async cleanupForSession(sessionId: string): Promise<void> {
    try {
      const checkpointIds = this.index.bySession[sessionId] || [];

      for (const checkpointId of checkpointIds) {
        await this.deleteCheckpoint(checkpointId);
      }

      console.log(`[CheckpointManager] Cleaned up ${checkpointIds.length} checkpoints for session ${sessionId}`);
    } catch (err) {
      console.error('Failed to cleanup checkpoints:', err);
    }
  }

  /**
   * Get checkpoint count for a session
   */
  getCheckpointCount(sessionId: string): number {
    return (this.index.bySession[sessionId] || []).length;
  }

}
