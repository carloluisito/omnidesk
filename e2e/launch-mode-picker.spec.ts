import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Launch Mode Picker — Item #3 e2e evidence.
 *
 * Two screenshots prove the picker:
 *   03a — agents available (claude --version >= 2.1.139, no kill switch): all
 *         three options visible and selectable.
 *   03b — agents disabled via CLAUDE_CODE_DISABLE_AGENT_VIEW kill switch: third
 *         option shows "(unavailable)" suffix, is disabled, and the wrapper
 *         tooltip explains the reason.
 *
 * Both screenshots land in `e2e/screenshots/launch-mode-picker/` so the plan's
 * declared evidence paths match. The directory is created on demand.
 */

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots/launch-mode-picker');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

type LaunchOptions = {
  env?: Record<string, string>;
};

async function launchApp(opts: LaunchOptions = {}): Promise<{ app: ElectronApplication; window: Page }> {
  const mainPath = path.resolve(__dirname, '../dist/main/index.js');
  const app = await electron.launch({
    args: [mainPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ...(opts.env ?? {}),
    },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { app, window };
}

async function openNewSessionDialog(window: Page): Promise<void> {
  await window.waitForSelector('[aria-label="New session"]', { timeout: 15000 });
  await window.click('[aria-label="New session"]');
  await window.waitForSelector('[data-testid="launch-mode-select"]', { timeout: 10000 });
  // Allow the availability hook's IPC roundtrip to settle so the option label
  // resolves from "(checking...)" to its final state.
  await window.waitForFunction(
    () => {
      const select = document.querySelector('[data-testid="launch-mode-select"]');
      if (!select) return false;
      const agentsOption = select.querySelector('option[value="agents"]');
      if (!agentsOption) return false;
      return !agentsOption.textContent?.includes('(checking...)');
    },
    { timeout: 5000 },
  ).catch(() => {
    // If the probe didn't resolve in time, fall through and capture whatever
    // state the picker is in rather than failing the evidence step entirely.
  });
}

/**
 * Native <select> renders its options in a closed dropdown. For screenshot
 * evidence we expand it into a listbox by setting `size` equal to the option
 * count — this is reversible, stays within the existing element, and renders
 * the same in headless Chromium.
 */
async function expandLaunchModeSelect(window: Page): Promise<void> {
  await window.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('[data-testid="launch-mode-select"]');
    if (!select) return;
    select.size = select.options.length;
    // Ensure the expanded listbox doesn't overflow the dialog visually.
    select.style.height = 'auto';
    select.style.minHeight = '90px';
  });
}

test.describe('Launch Mode Picker — e2e evidence', () => {
  test('03a: picker shows three options with agents enabled (default env)', async () => {
    const { app, window } = await launchApp();
    try {
      await openNewSessionDialog(window);

      const select = window.locator('[data-testid="launch-mode-select"]');
      await expect(select).toBeVisible();

      // Verify all three options are present.
      const options = await select.locator('option').all();
      const values = await Promise.all(options.map((o) => o.getAttribute('value')));
      expect(values).toEqual(expect.arrayContaining(['default', 'bypass-permissions', 'agents']));
      expect(values).toHaveLength(3);

      // Agents option should NOT be disabled in this default-env run.
      const agentsOption = select.locator('option[value="agents"]');
      const container = window.locator('[data-testid="launch-mode-container"]');
      // Surface the wrapper title in the failure message so we can see why the
      // probe returned unavailable without rerunning with debug logs.
      const debugTitle = await container.getAttribute('title');
      const optionLabel = await agentsOption.textContent();
      const isDisabled = await agentsOption.evaluate((el: HTMLOptionElement) => el.disabled);
      expect(
        isDisabled,
        `agents option should not be disabled; option label="${optionLabel}", wrapper title="${debugTitle}"`,
      ).toBe(false);

      // Expand the select so the screenshot actually shows all three options.
      await expandLaunchModeSelect(window);
      await container.screenshot({ path: path.join(SCREENSHOT_DIR, '03a-picker-default.png') });
    } finally {
      await app.close();
    }
  });

  test('03b: picker shows agents option disabled when CLAUDE_CODE_DISABLE_AGENT_VIEW is set', async () => {
    const { app, window } = await launchApp({
      env: { CLAUDE_CODE_DISABLE_AGENT_VIEW: '1' },
    });
    try {
      await openNewSessionDialog(window);

      const select = window.locator('[data-testid="launch-mode-select"]');
      const agentsOption = select.locator('option[value="agents"]');

      // Disabled with the unavailable marker in the label.
      await expect(agentsOption).toBeDisabled();
      const label = await agentsOption.textContent();
      expect(label).toContain('(unavailable)');

      // Wrapper title attribute surfaces the detail string.
      const container = window.locator('[data-testid="launch-mode-container"]');
      const titleAttr = await container.getAttribute('title');
      expect(titleAttr).toContain('Agent View unavailable:');

      // Expand the select so the disabled state is visible in the screenshot.
      await expandLaunchModeSelect(window);
      await container.screenshot({ path: path.join(SCREENSHOT_DIR, '03b-picker-agents-disabled.png') });
    } finally {
      await app.close();
    }
  });
});
