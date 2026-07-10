import { describe, it, expect, vi } from 'vitest';

// Mock config-dir.ts so CONFIG_DIR resolves to a predictable test path.
vi.mock('./config-dir', () => ({
  CONFIG_DIR: '/mock/home/.omnidesk',
  ensureConfigDir: vi.fn(),
  migrateFromLegacy: vi.fn(),
}));

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/home'),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
}));

import { SettingsManager } from './settings-persistence';

describe('SettingsManager STT defaults', () => {
  it('defaults stt.showButton to true', () => {
    const mgr = new SettingsManager();
    expect(mgr.getSTTSettings().showButton).toBe(true);
    expect(mgr.getSTTSettings().enabled).toBe(false);
  });
});
