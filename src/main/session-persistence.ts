import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { PersistedSessionState, SessionMetadata } from '../shared/ipc-types';
import { CONFIG_DIR, ensureConfigDir } from './config-dir';

const SESSIONS_FILE = path.join(CONFIG_DIR, 'sessions.json');

export function loadSessionState(): PersistedSessionState | null {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      const state = JSON.parse(data) as PersistedSessionState;

      // Validate version
      if (state.version !== 1) {
        console.warn('Unknown session state version, ignoring');
        return null;
      }

      // Mark all sessions as 'exited' since they were persisted from a previous run
      state.sessions = state.sessions.map(session => ({
        ...session,
        status: 'exited' as const,
      }));

      return state;
    }
  } catch (err) {
    console.error('Failed to load session state:', err);
  }
  return null;
}

export function saveSessionState(
  sessions: SessionMetadata[],
  activeSessionId: string | null
): void {
  const state: PersistedSessionState = {
    version: 1,
    sessions: sessions.map(session => ({
      id: session.id,
      name: session.name,
      workingDirectory: session.workingDirectory,
      permissionMode: session.permissionMode,
      status: session.status,
      createdAt: session.createdAt,
      exitCode: session.exitCode,
      currentModel: session.currentModel,
      // providerId is optional; missing on load defaults to 'claude' (backward compat)
      ...(session.providerId !== undefined ? { providerId: session.providerId } : {}),
    })),
    activeSessionId,
    lastModified: Date.now(),
  };

  try {
    ensureConfigDir();

    // Atomic write: write to temp file then rename
    const tempFile = `${SESSIONS_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempFile, SESSIONS_FILE);
  } catch (err) {
    console.error('Failed to save session state:', err);
  }
}

export function clearSessionState(): void {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      fs.unlinkSync(SESSIONS_FILE);
    }
  } catch (err) {
    console.error('Failed to clear session state:', err);
  }
}

export function validateDirectory(dirPath: string): boolean {
  try {
    const stats = fs.statSync(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export function getHomeDirectory(): string {
  return app.getPath('home');
}
