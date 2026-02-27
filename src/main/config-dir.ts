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
 *   - ~/.omnidesk/ does not exist yet, AND
 *   - ~/.claudedesk/ exists
 * Leaves ~/.claudedesk/ in place for safe downgrade.
 */
export function migrateFromLegacy(): void {
  const omniExists = fs.existsSync(CONFIG_DIR);
  const legacyExists = fs.existsSync(LEGACY_CONFIG_DIR);

  if (!omniExists && legacyExists) {
    console.log(`[OmniDesk] Migrating config from ${LEGACY_CONFIG_DIR} → ${CONFIG_DIR}`);
    try {
      copyDirContents(LEGACY_CONFIG_DIR, CONFIG_DIR);
      console.log('[OmniDesk] Migration complete.');
    } catch (err) {
      console.error('[OmniDesk] Migration failed (non-fatal):', err);
      // Ensure config dir exists even if migration failed
      ensureConfigDir();
    }
  } else {
    // Normal startup — just ensure the directory exists
    ensureConfigDir();
  }
}
