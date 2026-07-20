/**
 * Centralized config directory helper for OmniDesk.
 *
 * CONFIG_DIR: ~/.omnidesk/
 * Legacy dir: ~/.claudedesk/ (migrated on first run if it exists)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const CONFIG_DIR = path.join(os.homedir(), '.omnidesk');
const LEGACY_CONFIG_DIR = path.join(os.homedir(), '.claudedesk');

// Sentinel written only after copyDirContents() completes without throwing.
// Migration completion is tracked by this marker rather than by CONFIG_DIR's
// mere existence, so an interrupted/partial copy (disk full, a single file's
// permission error, the process killed mid-copy) is retried on the next
// launch instead of being silently and permanently stranded. copyDirContents
// never overwrites a file that already exists at the destination, so retrying
// is safe and idempotent.
const MIGRATION_MARKER = path.join(CONFIG_DIR, '.migrated');

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Recursively copies the contents of src into dest.
 * Does NOT copy the src directory itself — only its contents.
 */
function copyDirContents(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirContents(srcPath, destPath);
    } else {
      // Only copy if destination does not already exist (don't overwrite)
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

/**
 * Migrates config from ~/.claudedesk/ to ~/.omnidesk/ on first run.
 * Copies contents only if:
 *   - ~/.claudedesk/ exists, AND
 *   - migration hasn't already completed successfully (no MIGRATION_MARKER)
 * Leaves ~/.claudedesk/ in place for safe downgrade.
 *
 * Completion is tracked via MIGRATION_MARKER rather than "~/.omnidesk/
 * exists" — the old check treated any existing CONFIG_DIR as "already
 * migrated", which permanently stranded a user whose first-run copy was
 * interrupted partway through (the dir existed but was incomplete, and the
 * top-level `if` was skipped on every subsequent launch). Gating on the
 * marker means an interrupted copy is retried next launch; copyDirContents'
 * existing "don't overwrite" rule makes that retry safe and idempotent.
 */
export function migrateFromLegacy(): void {
  const legacyExists = fs.existsSync(LEGACY_CONFIG_DIR);
  const migrationComplete = fs.existsSync(MIGRATION_MARKER);

  if (legacyExists && !migrationComplete) {
    console.log(`[OmniDesk] Migrating config from ${LEGACY_CONFIG_DIR} → ${CONFIG_DIR}`);
    try {
      copyDirContents(LEGACY_CONFIG_DIR, CONFIG_DIR);
      fs.writeFileSync(MIGRATION_MARKER, new Date().toISOString());
      console.log('[OmniDesk] Migration complete.');
    } catch (err) {
      console.error('[OmniDesk] Migration failed (non-fatal), will retry next launch:', err);
      // Ensure config dir exists even if migration failed
      ensureConfigDir();
    }
  } else {
    // Normal startup — just ensure the directory exists
    ensureConfigDir();
  }
}
