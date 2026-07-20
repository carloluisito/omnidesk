import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// config-dir.ts computes CONFIG_DIR/LEGACY_CONFIG_DIR from os.homedir() at
// module load time, so homedir must be mocked before the module is imported.
// We use a real temp directory (rather than a mocked fs) so copyDirContents'
// recursion, dirent handling, and copy semantics are exercised end-to-end.
//
// TEST_HOME must be computed inside vi.hoisted(): per ES module semantics,
// ALL static imports (including `import './config-dir'` below) are fully
// evaluated before any other top-level statement in this file runs — so a
// plain `const TEST_HOME = ...` declared above that import would still be
// undefined when config-dir.ts's module-level `os.homedir()` call fires.
// vi.hoisted() is specially hoisted by vitest above the import graph, so its
// result is available in time.
const { TEST_HOME } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fsSync = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const osSync = require('os');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pathSync = require('path');
  return {
    TEST_HOME: fsSync.mkdtempSync(pathSync.join(osSync.tmpdir(), 'omnidesk-config-dir-test-')),
  };
});

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return { ...actual, homedir: () => TEST_HOME };
});

// `fs` is real (not mocked) everywhere except copyFileSync, which is wrapped
// in a vi.fn so the copy-failure regression test below can override it for a
// single call via mockImplementationOnce. vi.spyOn() cannot target the real
// 'fs' module directly here — Vitest's ESM interop makes its named exports
// non-configurable, so spying throws "Cannot redefine property". Wrapping at
// mock-factory time keeps every other fs call untouched (delegates to the
// real implementation) while making just this one export spy-able.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    copyFileSync: vi.fn((...args: Parameters<typeof actual.copyFileSync>) =>
      actual.copyFileSync(...args)
    ),
  };
});

import { CONFIG_DIR, ensureConfigDir, migrateFromLegacy } from './config-dir';

const LEGACY_DIR = path.join(TEST_HOME, '.claudedesk');
const MIGRATION_MARKER = path.join(CONFIG_DIR, '.migrated');

function rmrf(p: string): void {
  fs.rmSync(p, { recursive: true, force: true });
}

function writeFile(p: string, contents: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contents);
}

describe('config-dir', () => {
  beforeEach(() => {
    rmrf(CONFIG_DIR);
    rmrf(LEGACY_DIR);
    vi.restoreAllMocks();
  });

  afterAll(() => {
    rmrf(TEST_HOME);
  });

  describe('ensureConfigDir', () => {
    it('creates CONFIG_DIR when it does not exist', () => {
      expect(fs.existsSync(CONFIG_DIR)).toBe(false);
      ensureConfigDir();
      expect(fs.existsSync(CONFIG_DIR)).toBe(true);
    });

    it('is a no-op (does not touch contents) when CONFIG_DIR already exists', () => {
      writeFile(path.join(CONFIG_DIR, 'settings.json'), '{"a":1}');
      ensureConfigDir();
      expect(fs.readFileSync(path.join(CONFIG_DIR, 'settings.json'), 'utf8')).toBe('{"a":1}');
    });
  });

  describe('migrateFromLegacy — copyDirContents behavior', () => {
    it('recurses into nested subdirectories and copies their files', () => {
      writeFile(path.join(LEGACY_DIR, 'top.txt'), 'top');
      writeFile(path.join(LEGACY_DIR, 'nested', 'deep.txt'), 'deep');
      writeFile(path.join(LEGACY_DIR, 'nested', 'more', 'deeper.txt'), 'deeper');

      migrateFromLegacy();

      expect(fs.readFileSync(path.join(CONFIG_DIR, 'top.txt'), 'utf8')).toBe('top');
      expect(fs.readFileSync(path.join(CONFIG_DIR, 'nested', 'deep.txt'), 'utf8')).toBe('deep');
      expect(fs.readFileSync(path.join(CONFIG_DIR, 'nested', 'more', 'deeper.txt'), 'utf8')).toBe(
        'deeper'
      );
    });

    it('does not overwrite a file that already exists at the destination', () => {
      writeFile(path.join(LEGACY_DIR, 'settings.json'), '{"legacy":true}');
      writeFile(path.join(CONFIG_DIR, 'settings.json'), '{"current":true}');

      migrateFromLegacy();

      expect(fs.readFileSync(path.join(CONFIG_DIR, 'settings.json'), 'utf8')).toBe(
        '{"current":true}'
      );
    });

    it('never deletes or modifies ~/.claudedesk/', () => {
      writeFile(path.join(LEGACY_DIR, 'settings.json'), '{"legacy":true}');

      migrateFromLegacy();

      expect(fs.existsSync(LEGACY_DIR)).toBe(true);
      expect(fs.readFileSync(path.join(LEGACY_DIR, 'settings.json'), 'utf8')).toBe(
        '{"legacy":true}'
      );
    });
  });

  describe('migrateFromLegacy — migration decision', () => {
    it('migrates and writes the completion marker when legacy exists and no marker is present', () => {
      writeFile(path.join(LEGACY_DIR, 'settings.json'), '{"legacy":true}');

      migrateFromLegacy();

      expect(fs.readFileSync(path.join(CONFIG_DIR, 'settings.json'), 'utf8')).toBe(
        '{"legacy":true}'
      );
      expect(fs.existsSync(MIGRATION_MARKER)).toBe(true);
    });

    it('skips migration (just ensures the dir) when there is no legacy dir', () => {
      expect(fs.existsSync(CONFIG_DIR)).toBe(false);

      migrateFromLegacy();

      expect(fs.existsSync(CONFIG_DIR)).toBe(true);
      expect(fs.existsSync(MIGRATION_MARKER)).toBe(false);
    });

    it('does not re-copy once the completion marker is present, even if legacy still exists', () => {
      // Simulate a prior successful migration.
      writeFile(path.join(LEGACY_DIR, 'settings.json'), '{"legacy":true}');
      migrateFromLegacy();
      expect(fs.existsSync(MIGRATION_MARKER)).toBe(true);

      // A new file appears in the legacy dir after migration completed —
      // e.g. an older app version wrote to ~/.claudedesk/ again.
      writeFile(path.join(LEGACY_DIR, 'later.txt'), 'later');

      migrateFromLegacy();

      expect(fs.existsSync(path.join(CONFIG_DIR, 'later.txt'))).toBe(false);
    });

    it('regression: retries migration on a subsequent call after an interrupted/partial copy', () => {
      // First run: legacy has two files, but only one made it into CONFIG_DIR
      // before the process was "killed" — no marker was ever written, so
      // CONFIG_DIR exists but is incomplete.
      writeFile(path.join(LEGACY_DIR, 'settings.json'), '{"legacy":true}');
      writeFile(path.join(LEGACY_DIR, 'sessions.json'), '{"sessions":[]}');
      writeFile(path.join(CONFIG_DIR, 'settings.json'), '{"legacy":true}');
      expect(fs.existsSync(MIGRATION_MARKER)).toBe(false);
      expect(fs.existsSync(path.join(CONFIG_DIR, 'sessions.json'))).toBe(false);

      // Next launch — should retry and finish the copy instead of treating
      // the partial CONFIG_DIR as "already migrated".
      migrateFromLegacy();

      expect(fs.readFileSync(path.join(CONFIG_DIR, 'sessions.json'), 'utf8')).toBe(
        '{"sessions":[]}'
      );
      expect(fs.existsSync(MIGRATION_MARKER)).toBe(true);
    });

    it('on a copy failure, does not write the marker so the next launch retries', () => {
      writeFile(path.join(LEGACY_DIR, 'a.txt'), 'a');
      writeFile(path.join(LEGACY_DIR, 'b.txt'), 'b');

      vi.mocked(fs.copyFileSync).mockImplementationOnce(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      expect(() => migrateFromLegacy()).not.toThrow();
      expect(fs.existsSync(MIGRATION_MARKER)).toBe(false);
      // ensureConfigDir() fallback still leaves a usable (if incomplete) dir.
      expect(fs.existsSync(CONFIG_DIR)).toBe(true);

      // mockImplementationOnce only overrides the single call above; the mock
      // falls back to delegating to the real copyFileSync afterward, so no
      // explicit restore is needed here.

      // Retry on the next "launch" should complete the copy and write the marker.
      migrateFromLegacy();
      expect(fs.readFileSync(path.join(CONFIG_DIR, 'a.txt'), 'utf8')).toBe('a');
      expect(fs.readFileSync(path.join(CONFIG_DIR, 'b.txt'), 'utf8')).toBe('b');
      expect(fs.existsSync(MIGRATION_MARKER)).toBe(true);
    });
  });
});
