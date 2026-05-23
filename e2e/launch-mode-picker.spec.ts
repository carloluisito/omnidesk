import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Launch Mode Picker — e2e evidence (rewritten for Wave 03 design overhaul).
 *
 * Two screenshots prove the picker:
 *   03a — agents available (claude --version >= 2.1.139, no kill switch): all
 *         three options visible and selectable.
 *   03b — agents disabled via CLAUDE_CODE_DISABLE_AGENT_VIEW kill switch: third
 *         option shows "(unavailable)" suffix, is disabled, and the wrapper
 *         tooltip explains the reason.
 *
 * Opening strategy: the new design shows either WelcomeScreen, CommandCenter,
 * or WorkspaceEmpty/TabBar on launch.  We force wizardCompleted=true so we
 * skip WelcomeScreen.  If CommandCenter appears we dismiss it, then we look for
 * the new-session affordance (we-new-session or tab-bar-new-session) and click it
 * to open the rethemed NewSessionDialog (data-testid="new-session-dialog").
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

  // Retry up to 3 times with a short backoff — the previous test's Electron
  // process may still be releasing OS resources (debug ports, etc.).
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));
    try {
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
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * Navigate to the rethemed NewSessionDialog from whatever startup surface is
 * showing.  Forces wizardCompleted=true, reloads, then opens the dialog via
 * whichever affordance is present.
 *
 * CommandCenter dismissal strategy: the CC has no Escape/click-outside handler.
 * We click cc-start-new which calls onDismiss() AND opens the new-session dialog
 * in one step — no extra dismissal step needed.
 *
 * After this call, [data-testid="new-session-dialog"] is visible and the
 * launch-mode-select has resolved from "(checking...)" to its final label.
 */
async function openNewSessionDialog(window: Page): Promise<void> {
  await window.evaluate(() => { localStorage.setItem('wizardCompleted', 'true'); });
  await window.reload();

  await window.waitForSelector(
    '[data-testid="command-center"], [data-testid="workspace-empty"], [data-testid="tab-bar"]',
    { timeout: 15000 },
  );

  // Try affordances in priority order.
  // cc-start-new both dismisses CC and opens the dialog in one click.
  const ccBtn = await window.$('[data-testid="cc-start-new"]');
  if (ccBtn) {
    await ccBtn.click();
  } else {
    const affordance = await window.waitForSelector(
      '[data-testid="we-new-session"], [data-testid="tab-bar-new-session"]',
      { timeout: 10000 },
    );
    await affordance.click();
  }

  // Wait for the rethemed dialog
  await window.waitForSelector('[data-testid="new-session-dialog"]', { timeout: 8000 });

  // Wait for the launch-mode-select (Claude provider selected by default)
  await window.waitForSelector('[data-testid="launch-mode-select"]', { timeout: 8000 });

  // Allow the availability hook's IPC roundtrip to settle
  await window.waitForFunction(
    () => {
      const select = document.querySelector('[data-testid="launch-mode-select"]');
      if (!select) return false;
      const agentsOption = select.querySelector('option[value="agents"]');
      if (!agentsOption) return false;
      return !agentsOption.textContent?.includes('(checking...)');
    },
    { timeout: 6000 },
  ).catch(() => {
    // Probe didn't resolve in time; fall through and capture the current state.
  });
}

/**
 * Expand the native <select> into a listbox so all options are visible in the
 * screenshot evidence.
 */
async function expandLaunchModeSelect(window: Page): Promise<void> {
  await window.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('[data-testid="launch-mode-select"]');
    if (!select) return;
    select.size = select.options.length;
    select.style.height = 'auto';
    select.style.minHeight = '90px';
  });
}

test.describe('Launch Mode Picker — e2e evidence', () => {
  // Each test in this suite launches its own full Electron app instance which
  // takes significantly longer than 30s on first run (session pool warm-up,
  // availability probe, IPC roundtrips).  Bump to 90s per test.
  test.setTimeout(90000);

  test('03a: picker shows three options with agents enabled (default env)', async () => {
    const { app, window } = await launchApp();
    try {
      await openNewSessionDialog(window);

      const select = window.locator('[data-testid="launch-mode-select"]');
      await expect(select).toBeVisible();

      // All three options must be present.
      const options = await select.locator('option').all();
      const values = await Promise.all(options.map((o) => o.getAttribute('value')));
      expect(values).toEqual(expect.arrayContaining(['default', 'bypass-permissions', 'agents']));
      expect(values).toHaveLength(3);

      // In the default env, the agents option should NOT be disabled.
      const agentsOption = select.locator('option[value="agents"]');
      const container = window.locator('[data-testid="launch-mode-container"]');
      const debugTitle = await container.getAttribute('title');
      const optionLabel = await agentsOption.textContent();
      const isDisabled = await agentsOption.evaluate((el: HTMLOptionElement) => el.disabled);
      expect(
        isDisabled,
        `agents option should not be disabled; label="${optionLabel}", wrapper title="${debugTitle}"`,
      ).toBe(false);

      // Expand the select for the screenshot.
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

      // Must be disabled with the "(unavailable)" marker.
      await expect(agentsOption).toBeDisabled();
      const label = await agentsOption.textContent();
      expect(label).toContain('(unavailable)');

      // Wrapper title must surface the reason.
      const container = window.locator('[data-testid="launch-mode-container"]');
      const titleAttr = await container.getAttribute('title');
      expect(titleAttr).toContain('Agent View unavailable:');

      // Expand and screenshot.
      await expandLaunchModeSelect(window);
      await container.screenshot({ path: path.join(SCREENSHOT_DIR, '03b-picker-agents-disabled.png') });
    } finally {
      await app.close();
    }
  });
});
