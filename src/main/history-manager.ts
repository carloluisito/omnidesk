/**
 * History Manager - Handles recording, searching, and exporting session history
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { stripAnsi } from './ansi-strip';
import { isClaudeReady as checkClaudeReadyPatterns, findClaudeOutputStart } from '../shared/claude-detector';
import type {
  HistoryIndex,
  HistorySessionEntry,
  HistorySettings,
  HistorySearchResult,
  HistorySearchPreview,
  HistoryStats,
  HistoryExportJson,
} from '../shared/types/history-types';

const HISTORY_DIR = path.join(app.getPath('userData'), 'history');
const SESSIONS_DIR = path.join(HISTORY_DIR, 'sessions');
const INDEX_FILE = path.join(HISTORY_DIR, 'index.json');
const SETTINGS_FILE = path.join(HISTORY_DIR, 'settings.json');

const FLUSH_INTERVAL = 500; // Write to disk every 500ms
const MAX_PREVIEW_LENGTH = 50; // Characters before/after match
const MAX_PREVIEWS_PER_RESULT = 3; // Preview snippets per search result

/**
 * Default retention settings
 */
const DEFAULT_SETTINGS: HistorySettings = {
  maxAgeDays: 30,
  maxSizeMB: 500,
  autoCleanup: true,
};

/**
 * Per-session recording state
 */
interface SessionState {
  /** Buffer for pending writes */
  buffer: string;
  /** Whether Claude is ready (filters shell init) */
  isClaudeReady: boolean;
  /** Accumulated output before Claude ready */
  preClaudeBuffer: string;
  /** Flush timer */
  flushTimer: NodeJS.Timeout | null;
  /** Current segment number */
  segmentNumber: number;
  /** File handle for append operations */
  fileHandle: fs.FileHandle | null;
}

export class HistoryManager {
  private index: HistoryIndex = { version: 1, sessions: {} };
  private settings: HistorySettings = DEFAULT_SETTINGS;
  private sessionStates = new Map<string, SessionState>();
  private indexDirty = false;
  private indexFlushTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize history manager - load index and settings
   */
  private async initialize(): Promise<void> {
    try {
      // Ensure directories exist
      await fs.mkdir(SESSIONS_DIR, { recursive: true });

      // Load index
      try {
        const indexData = await fs.readFile(INDEX_FILE, 'utf-8');
        this.index = JSON.parse(indexData);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          console.error('Failed to load history index:', err);
        }
        // Use default empty index
      }

      // Load settings
      try {
        const settingsData = await fs.readFile(SETTINGS_FILE, 'utf-8');
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(settingsData) };
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          console.error('Failed to load history settings:', err);
        }
        // Use defaults
      }

      // Run cleanup if enabled
      if (this.settings.autoCleanup) {
        await this.runCleanup();
      }
    } catch (err) {
      console.error('History manager initialization failed:', err);
    }
  }

  /**
   * Record output for a session
   * @param sessionId - Session identifier
   * @param data - Raw terminal output (may contain ANSI codes)
   */
  async recordOutput(sessionId: string, data: string): Promise<void> {
    try {
      let state = this.sessionStates.get(sessionId);

      // Initialize state for new session
      if (!state) {
        state = {
          buffer: '',
          isClaudeReady: false,
          preClaudeBuffer: '',
          flushTimer: null,
          segmentNumber: 0,
          fileHandle: null,
        };
        this.sessionStates.set(sessionId, state);

        // Initialize session in index
        if (!this.index.sessions[sessionId]) {
          console.log(`[HistoryManager] recordOutput: Creating empty entry for session ${sessionId}`);
          this.index.sessions[sessionId] = {
            id: sessionId,
            name: '', // Will be updated by session manager
            workingDirectory: '', // Will be updated by session manager
            createdAt: Date.now(),
            lastUpdatedAt: Date.now(),
            sizeBytes: 0,
            segmentCount: 0,
          };
          this.markIndexDirty();
        } else {
          console.log(`[HistoryManager] recordOutput: Entry already exists for session ${sessionId}, name="${this.index.sessions[sessionId].name}"`);
        }
      }

      // Filter shell initialization output
      if (!state.isClaudeReady) {
        state.preClaudeBuffer += data;

        if (checkClaudeReadyPatterns(state.preClaudeBuffer)) {
          state.isClaudeReady = true;

          // Find where Claude output starts and record from there
          const earliestIndex = findClaudeOutputStart(state.preClaudeBuffer);
          const startAt = earliestIndex !== -1 ? earliestIndex : 0;
          const claudeOutput = state.preClaudeBuffer.slice(startAt);
          state.buffer += claudeOutput;
          state.preClaudeBuffer = '';
        }
        // If not ready yet, don't record anything
        if (!state.isClaudeReady) return;
      } else {
        // Already ready, record directly
        state.buffer += data;
      }

      // Schedule flush if not already scheduled
      if (!state.flushTimer) {
        state.flushTimer = setTimeout(() => {
          this.flushSession(sessionId).catch((err) => {
            console.error(`Failed to flush session ${sessionId}:`, err);
          });
        }, FLUSH_INTERVAL);
      }
    } catch (err) {
      console.error(`Failed to record output for session ${sessionId}:`, err);
    }
  }

  /**
   * Update session metadata (name, directory)
   */
  updateSessionMetadata(sessionId: string, name: string, workingDirectory: string): void {
    console.log(`[HistoryManager] updateSessionMetadata called:`, { sessionId, name, workingDirectory });
    let entry = this.index.sessions[sessionId];

    // Create entry if it doesn't exist
    if (!entry) {
      console.log(`[HistoryManager] Creating new entry for session ${sessionId}`);
      entry = {
        id: sessionId,
        name: name,
        workingDirectory: workingDirectory,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
        sizeBytes: 0,
        segmentCount: 0,
      };
      this.index.sessions[sessionId] = entry;
    } else {
      console.log(`[HistoryManager] Updating existing entry for session ${sessionId}`);
      // Update existing entry
      entry.name = name;
      entry.workingDirectory = workingDirectory;
    }

    console.log(`[HistoryManager] Entry after update:`, entry);
    this.markIndexDirty();
  }

  /**
   * Handle session restart (new segment)
   */
  async onSessionRestart(sessionId: string): Promise<void> {
    const state = this.sessionStates.get(sessionId);
    if (!state) return;

    // Flush current segment
    await this.flushSession(sessionId);

    // Close current file handle
    if (state.fileHandle) {
      await state.fileHandle.close();
      state.fileHandle = null;
    }

    // Increment segment number
    state.segmentNumber++;

    // Reset Claude ready state for new segment
    state.isClaudeReady = false;
    state.preClaudeBuffer = '';

    // Update index
    const entry = this.index.sessions[sessionId];
    if (entry) {
      entry.segmentCount = state.segmentNumber;
      this.markIndexDirty();
    }
  }

  /**
   * Handle session exit - flush final buffer
   */
  async onSessionExit(sessionId: string, _exitCode: number): Promise<void> {
    try {
      await this.flushSession(sessionId);

      const state = this.sessionStates.get(sessionId);
      if (state) {
        // Clear flush timer
        if (state.flushTimer) {
          clearTimeout(state.flushTimer);
          state.flushTimer = null;
        }

        // Close file handle
        if (state.fileHandle) {
          await state.fileHandle.close();
          state.fileHandle = null;
        }

        // Remove state
        this.sessionStates.delete(sessionId);
      }
    } catch (err) {
      console.error(`Failed to finalize session ${sessionId}:`, err);
    }
  }

  /**
   * Flush buffered output to disk
   */
  private async flushSession(sessionId: string): Promise<void> {
    const state = this.sessionStates.get(sessionId);
    if (!state || !state.buffer) return;

    try {
      // Strip ANSI codes
      const cleanOutput = stripAnsi(state.buffer);
      if (!cleanOutput) {
        state.buffer = '';
        if (state.flushTimer) {
          clearTimeout(state.flushTimer);
          state.flushTimer = null;
        }
        return;
      }

      // Get file path (with segment suffix if needed)
      const filePath = this.getSessionFilePath(sessionId, state.segmentNumber);

      // Open file handle if not already open
      if (!state.fileHandle) {
        state.fileHandle = await fs.open(filePath, 'a');
      }

      // Append to file
      await state.fileHandle.appendFile(cleanOutput, 'utf-8');

      // Update index
      const entry = this.index.sessions[sessionId];
      if (entry) {
        entry.lastUpdatedAt = Date.now();
        entry.sizeBytes += Buffer.byteLength(cleanOutput, 'utf-8');
        this.markIndexDirty();
      }

      // Clear buffer and timer
      state.buffer = '';
      if (state.flushTimer) {
        clearTimeout(state.flushTimer);
        state.flushTimer = null;
      }
    } catch (err: any) {
      // Handle disk full error gracefully
      if (err.code === 'ENOSPC') {
        console.error(`Disk full - stopping recording for session ${sessionId}`);
        state.buffer = '';
        if (state.flushTimer) {
          clearTimeout(state.flushTimer);
          state.flushTimer = null;
        }
      } else {
        throw err;
      }
    }
  }

  /**
   * Get file path for session (with segment suffix)
   */
  private getSessionFilePath(sessionId: string, segmentNumber: number): string {
    if (segmentNumber === 0) {
      return path.join(SESSIONS_DIR, `${sessionId}.txt`);
    } else {
      return path.join(SESSIONS_DIR, `${sessionId}_r${segmentNumber}.txt`);
    }
  }

  /**
   * Mark index as dirty and schedule flush
   */
  private markIndexDirty(): void {
    this.indexDirty = true;

    if (!this.indexFlushTimer) {
      this.indexFlushTimer = setTimeout(() => {
        this.flushIndex().catch((err) => {
          console.error('Failed to flush index:', err);
        });
      }, 1000); // Flush index every 1 second
    }
  }

  /**
   * Write index to disk atomically
   */
  private async flushIndex(): Promise<void> {
    if (!this.indexDirty) return;

    try {
      const tmpFile = INDEX_FILE + '.tmp';
      await fs.writeFile(tmpFile, JSON.stringify(this.index, null, 2), 'utf-8');
      await fs.rename(tmpFile, INDEX_FILE);

      this.indexDirty = false;
      if (this.indexFlushTimer) {
        clearTimeout(this.indexFlushTimer);
        this.indexFlushTimer = null;
      }
    } catch (err) {
      console.error('Failed to write history index:', err);
    }
  }

  /**
   * List all recorded sessions
   */
  async listSessions(): Promise<HistorySessionEntry[]> {
    await this.flushIndex(); // Ensure index is up to date
    return Object.values(this.index.sessions).sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
  }

  /**
   * Get full content for a session
   */
  async getSessionContent(sessionId: string): Promise<string> {
    const entry = this.index.sessions[sessionId];
    if (!entry) {
      throw new Error(`Session ${sessionId} not found in history`);
    }

    try {
      let content = '';

      // Read all segments
      for (let i = 0; i <= entry.segmentCount; i++) {
        const filePath = this.getSessionFilePath(sessionId, i);

        try {
          const segmentContent = await fs.readFile(filePath, 'utf-8');
          if (i > 0) {
            content += `\n\n--- Session Restarted ---\n\n`;
          }
          content += segmentContent;
        } catch (err: any) {
          if (err.code === 'ENOENT') {
            // Segment file missing, skip
            continue;
          }
          throw err;
        }
      }

      return content;
    } catch (err) {
      console.error(`Failed to read session ${sessionId}:`, err);
      return '[History file corrupted or missing]';
    }
  }

  /**
   * Search across all sessions
   */
  async search(query: string, useRegex = false): Promise<HistorySearchResult[]> {
    const results: HistorySearchResult[] = [];

    try {
      let pattern: RegExp;
      if (useRegex) {
        pattern = new RegExp(query, 'gi');
      } else {
        // Escape special regex characters for literal search
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        pattern = new RegExp(escapedQuery, 'gi');
      }

      const sessions = await this.listSessions();

      for (const session of sessions) {
        const content = await this.getSessionContent(session.id);
        const lines = content.split('\n');

        const previews: HistorySearchPreview[] = [];
        let matchCount = 0;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const matches = Array.from(line.matchAll(pattern));

          if (matches.length > 0) {
            matchCount += matches.length;

            // Add preview for first match in line (if under limit)
            if (previews.length < MAX_PREVIEWS_PER_RESULT) {
              const match = matches[0];
              const matchStart = match.index!;
              const matchEnd = matchStart + match[0].length;

              const before = line.slice(Math.max(0, matchStart - MAX_PREVIEW_LENGTH), matchStart);
              const after = line.slice(matchEnd, matchEnd + MAX_PREVIEW_LENGTH);

              previews.push({
                lineNumber: i + 1,
                before: before.length < matchStart ? before : '...' + before,
                match: match[0],
                after: after.length < line.length - matchEnd ? after : after + '...',
              });
            }
          }
        }

        if (matchCount > 0) {
          results.push({
            session,
            matchCount,
            previews,
          });
        }
      }

      return results;
    } catch (err) {
      console.error('Search failed:', err);
      throw err;
    }
  }

  /**
   * Export session as Markdown
   */
  async exportMarkdown(sessionId: string, outputPath: string): Promise<boolean> {
    try {
      const entry = this.index.sessions[sessionId];
      if (!entry) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const content = await this.getSessionContent(sessionId);

      const markdown = `# ${entry.name || 'Untitled Session'}

**Working Directory**: \`${entry.workingDirectory}\`
**Created**: ${new Date(entry.createdAt).toISOString()}
**Last Updated**: ${new Date(entry.lastUpdatedAt).toISOString()}
**Size**: ${(entry.sizeBytes / 1024).toFixed(2)} KB

---

## Session Output

\`\`\`
${content}
\`\`\`

---

*Exported from OmniDesk on ${new Date().toISOString()}*
`;

      await fs.writeFile(outputPath, markdown, 'utf-8');
      return true;
    } catch (err) {
      console.error('Markdown export failed:', err);
      return false;
    }
  }

  /**
   * Export session as JSON
   */
  async exportJson(sessionId: string, outputPath: string): Promise<boolean> {
    try {
      const entry = this.index.sessions[sessionId];
      if (!entry) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const content = await this.getSessionContent(sessionId);

      const exportData: HistoryExportJson = {
        version: 1,
        exportedAt: new Date().toISOString(),
        session: {
          id: entry.id,
          name: entry.name,
          workingDirectory: entry.workingDirectory,
          createdAt: entry.createdAt,
          lastUpdatedAt: entry.lastUpdatedAt,
          sizeBytes: entry.sizeBytes,
        },
        output: content,
      };

      await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('JSON export failed:', err);
      return false;
    }
  }

  /**
   * Delete a session from history
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const entry = this.index.sessions[sessionId];
      if (!entry) {
        return false;
      }

      // Delete all segment files
      for (let i = 0; i <= entry.segmentCount; i++) {
        const filePath = this.getSessionFilePath(sessionId, i);
        try {
          await fs.unlink(filePath);
        } catch (err: any) {
          if (err.code !== 'ENOENT') {
            console.error(`Failed to delete segment ${i}:`, err);
          }
        }
      }

      // Remove from index
      delete this.index.sessions[sessionId];
      this.markIndexDirty();

      // Clean up active state if exists
      const state = this.sessionStates.get(sessionId);
      if (state) {
        if (state.flushTimer) {
          clearTimeout(state.flushTimer);
        }
        if (state.fileHandle) {
          await state.fileHandle.close();
        }
        this.sessionStates.delete(sessionId);
      }

      return true;
    } catch (err) {
      console.error(`Failed to delete session ${sessionId}:`, err);
      return false;
    }
  }

  /**
   * Delete all sessions
   */
  async deleteAllSessions(): Promise<boolean> {
    try {
      const sessionIds = Object.keys(this.index.sessions);

      for (const sessionId of sessionIds) {
        await this.deleteSession(sessionId);
      }

      return true;
    } catch (err) {
      console.error('Failed to delete all sessions:', err);
      return false;
    }
  }

  /**
   * Get history statistics
   */
  async getStats(): Promise<HistoryStats> {
    const sessions = Object.values(this.index.sessions);

    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalSizeBytes: 0,
        oldestSessionDate: null,
        newestSessionDate: null,
      };
    }

    const totalSizeBytes = sessions.reduce((sum, s) => sum + s.sizeBytes, 0);
    const dates = sessions.map((s) => s.createdAt).sort((a, b) => a - b);

    return {
      totalSessions: sessions.length,
      totalSizeBytes,
      oldestSessionDate: dates[0],
      newestSessionDate: dates[dates.length - 1],
    };
  }

  /**
   * Get current settings
   */
  getSettings(): HistorySettings {
    return { ...this.settings };
  }

  /**
   * Update settings
   */
  async updateSettings(newSettings: Partial<HistorySettings>): Promise<boolean> {
    try {
      this.settings = { ...this.settings, ...newSettings };

      const tmpFile = SETTINGS_FILE + '.tmp';
      await fs.writeFile(tmpFile, JSON.stringify(this.settings, null, 2), 'utf-8');
      await fs.rename(tmpFile, SETTINGS_FILE);

      return true;
    } catch (err) {
      console.error('Failed to update history settings:', err);
      return false;
    }
  }

  /**
   * Run retention cleanup based on settings
   */
  async runCleanup(): Promise<void> {
    try {
      const { maxAgeDays, maxSizeMB } = this.settings;
      const now = Date.now();
      const sessions = Object.values(this.index.sessions);

      // Age-based cleanup
      if (maxAgeDays > 0) {
        const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
        for (const session of sessions) {
          if (now - session.lastUpdatedAt > maxAge) {
            await this.deleteSession(session.id);
          }
        }
      }

      // Size-based cleanup
      if (maxSizeMB > 0) {
        const maxBytes = maxSizeMB * 1024 * 1024;
        const stats = await this.getStats();

        if (stats.totalSizeBytes > maxBytes) {
          // Delete oldest sessions first until under limit
          const sortedSessions = sessions.sort((a, b) => a.lastUpdatedAt - b.lastUpdatedAt);

          let currentSize = stats.totalSizeBytes;
          for (const session of sortedSessions) {
            if (currentSize <= maxBytes) break;

            await this.deleteSession(session.id);
            currentSize -= session.sizeBytes;
          }
        }
      }
    } catch (err) {
      console.error('Cleanup failed:', err);
    }
  }

  /**
   * Get history content up to a specific byte position
   * Used by checkpoint system to capture partial history
   */
  async getHistoryUpToPosition(
    sessionId: string,
    byteOffset: number,
    segmentNumber: number
  ): Promise<string> {
    const entry = this.index.sessions[sessionId];
    if (!entry) {
      throw new Error(`Session ${sessionId} not found in history`);
    }

    try {
      let content = '';
      let totalBytes = 0;

      // Read segments up to target segment
      for (let i = 0; i <= Math.min(segmentNumber, entry.segmentCount); i++) {
        const filePath = this.getSessionFilePath(sessionId, i);

        try {
          const segmentContent = await fs.readFile(filePath, 'utf-8');
          const segmentBytes = Buffer.byteLength(segmentContent, 'utf-8');

          if (i < segmentNumber) {
            // Include full segment
            if (i > 0) {
              content += `\n\n--- Session Restarted ---\n\n`;
            }
            content += segmentContent;
            totalBytes += segmentBytes;
          } else if (i === segmentNumber) {
            // This is the target segment, truncate at byte offset
            const remainingBytes = byteOffset - totalBytes;

            if (remainingBytes <= 0) {
              // Byte offset already reached in previous segments
              break;
            }

            if (i > 0) {
              content += `\n\n--- Session Restarted ---\n\n`;
            }

            // Truncate segment at byte offset
            if (remainingBytes >= segmentBytes) {
              // Include entire segment
              content += segmentContent;
            } else {
              // Truncate to byte offset (rough - may split multi-byte chars)
              const truncated = Buffer.from(segmentContent, 'utf-8')
                .slice(0, remainingBytes)
                .toString('utf-8');
              content += truncated;
            }

            break;
          }
        } catch (err: any) {
          if (err.code === 'ENOENT') {
            // Segment file missing, skip
            continue;
          }
          throw err;
        }
      }

      return content;
    } catch (err) {
      console.error(`Failed to read history up to position for session ${sessionId}:`, err);
      return '[History file corrupted or missing]';
    }
  }

  /**
   * Get session metadata (for checkpoint system)
   */
  async getSessionMetadata(sessionId: string): Promise<HistorySessionEntry | null> {
    return this.index.sessions[sessionId] || null;
  }
}
