/**
 * Checkpoint Persistence - Handles loading/saving checkpoint index
 */

import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { CheckpointIndex } from '../shared/types/checkpoint-types';

const CHECKPOINTS_DIR = path.join(app.getPath('userData'), 'checkpoints');
const INDEX_FILE = path.join(CHECKPOINTS_DIR, 'index.json');
const BACKUP_COUNT = 3; // Keep last 3 backups

/**
 * Ensure checkpoints directory exists
 */
export async function ensureCheckpointDir(): Promise<void> {
  await fs.mkdir(CHECKPOINTS_DIR, { recursive: true });
}

/**
 * Load checkpoint index from disk
 */
export async function loadCheckpointIndex(): Promise<CheckpointIndex> {
  try {
    await ensureCheckpointDir();

    const data = await fs.readFile(INDEX_FILE, 'utf-8');
    const index = JSON.parse(data);

    if (!validateCheckpointIndex(index)) {
      console.warn('Invalid checkpoint index structure, using empty index');
      return createEmptyIndex();
    }

    return index;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // File doesn't exist, return empty index
      return createEmptyIndex();
    }
    console.error('Failed to load checkpoint index:', err);
    return createEmptyIndex();
  }
}

/**
 * Save checkpoint index to disk (atomic write with backup)
 */
export async function saveCheckpointIndex(index: CheckpointIndex): Promise<void> {
  try {
    await ensureCheckpointDir();

    // Create backup of existing index
    try {
      await createBackup();
    } catch (err) {
      console.warn('Failed to create backup:', err);
      // Continue with save anyway
    }

    // Atomic write: write to temp file then rename
    const tempFile = `${INDEX_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(index, null, 2), 'utf-8');
    await fs.rename(tempFile, INDEX_FILE);

    console.log('[CheckpointPersistence] Index saved successfully');
  } catch (err) {
    console.error('Failed to save checkpoint index:', err);
    throw err;
  }
}

/**
 * Create backup of current index
 */
async function createBackup(): Promise<void> {
  try {
    const exists = await fs.stat(INDEX_FILE).then(() => true).catch(() => false);
    if (!exists) return;

    // Rotate existing backups
    for (let i = BACKUP_COUNT - 1; i >= 1; i--) {
      const oldBackup = `${INDEX_FILE}.backup.${i}`;
      const newBackup = `${INDEX_FILE}.backup.${i + 1}`;

      try {
        await fs.rename(oldBackup, newBackup);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          console.warn(`Failed to rotate backup ${i}:`, err);
        }
      }
    }

    // Create new backup
    await fs.copyFile(INDEX_FILE, `${INDEX_FILE}.backup.1`);
  } catch (err) {
    console.warn('Backup creation failed:', err);
  }
}

/**
 * Create empty checkpoint index
 */
function createEmptyIndex(): CheckpointIndex {
  return {
    version: 1,
    checkpoints: {},
    bySession: {},
  };
}

/**
 * Validate checkpoint index structure
 */
export function validateCheckpointIndex(index: any): index is CheckpointIndex {
  if (!index || typeof index !== 'object') return false;
  if (index.version !== 1) return false;
  if (!index.checkpoints || typeof index.checkpoints !== 'object') return false;
  if (!index.bySession || typeof index.bySession !== 'object') return false;
  return true;
}

/**
 * Clean up orphaned checkpoints (sessions that no longer exist)
 */
export async function cleanupOrphanedCheckpoints(
  index: CheckpointIndex,
  validSessionIds: Set<string>
): Promise<CheckpointIndex> {
  const cleanedIndex: CheckpointIndex = {
    version: 1,
    checkpoints: {},
    bySession: {},
  };

  // Only keep checkpoints for valid sessions
  for (const [checkpointId, checkpoint] of Object.entries(index.checkpoints)) {
    if (validSessionIds.has(checkpoint.sessionId)) {
      cleanedIndex.checkpoints[checkpointId] = checkpoint;

      if (!cleanedIndex.bySession[checkpoint.sessionId]) {
        cleanedIndex.bySession[checkpoint.sessionId] = [];
      }
      cleanedIndex.bySession[checkpoint.sessionId].push(checkpointId);
    }
  }

  return cleanedIndex;
}
