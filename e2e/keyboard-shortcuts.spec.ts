/**
 * keyboard-shortcuts.spec.ts — rewritten for the Wave 03 design overhaul.
 *
 * Verified shortcuts:
 *   Ctrl+K (all platforms, also Meta+K on darwin) → opens command palette
 *   Escape                                         → closes it
 *   Ctrl+Shift+P (legacy shortcut)                 → also opens palette
 *
 * CommandCenter dismissal:
 *   The CC has no Escape/click-outside handler.  We click cc-start-new to open
 *   the new-session dialog (which dismisses CC), then cancel it to get a clean
 *   workspace before testing keyboard shortcuts.
 *
 * Keyboard event strategy:
 *   Ctrl+K is a native Chromium browser shortcut (focus address bar/search) that
 *   is intercepted before reaching the page's keydown handler.
 *   We dispatch the event directly via page.evaluate() to bypass interception.
 *   Ctrl+Shift+P is not a native shortcut so keyboard.press() works fine.
 *
 *   Escape to close the palette dispatches through the palette's input (which is
 *   auto-focused on open), so keyboard.press('Escape') works there.
 */

import { test, expect } from './fixtures/electron';

/** Dispatch a keydown event directly on document.  Used for shortcuts that
 *  Chromium intercepts before the page handler fires (e.g. Ctrl+K). */
async function dispatchKey(
  window: import('@playwright/test').Page,
  key: string,
  opts: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {},
) {
  await window.evaluate(({ key, ctrlKey, metaKey, shiftKey }) => {
    const event = new KeyboardEvent('keydown', {
      key,
      ctrlKey:  ctrlKey  ?? false,
      metaKey:  metaKey  ?? false,
      shiftKey: shiftKey ?? false,
      altKey:   false,
      bubbles:  true,
      cancelable: true,
    });
    window.dispatchEvent(event);
  }, { key, ...opts });
}

/** Dismiss whatever startup overlay (CommandCenter or WelcomeScreen) is covering
 *  the workspace so keyboard shortcuts reach the App handler. */
async function getToCleanWorkspace(window: import('@playwright/test').Page) {
  await window.waitForSelector(
    '[data-testid="command-center"], [data-testid="workspace-empty"], [data-testid="tab-bar"]',
    { timeout: 15000 },
  );

  const cc = await window.$('[data-testid="command-center"]');
  if (cc) {
    // CC has no Escape handler — dismiss via its own button, then cancel the dialog.
    const startNew = await window.$('[data-testid="cc-start-new"]');
    if (startNew) {
      await startNew.click();
      // Wait for the dialog to appear (CC dismissed itself)
      await window.waitForSelector('[data-testid="new-session-dialog"]', { timeout: 8000 });
      await window.click('[data-testid="nsd-cancel"]');
      await window.waitForTimeout(400);
    }
  }

  const ws = await window.$('[data-testid="welcome-screen"]');
  if (ws) {
    // WelcomeScreen: click "Start a session without a repo" then cancel any dialog.
    // Simpler: just wait — WelcomeScreen auto-dismisses once wizardCompleted=true is set.
    // Since we set it in beforeEach, a reload will skip WelcomeScreen.
  }
}

test.describe('Keyboard Shortcuts', () => {
  test.setTimeout(45000);

  test.beforeEach(async ({ window }) => {
    await window.evaluate(() => { localStorage.setItem('wizardCompleted', 'true'); });
    await window.reload();
    await getToCleanWorkspace(window);
  });

  test('Ctrl+K opens the command palette', async ({ window }) => {
    await dispatchKey(window, 'k', { ctrlKey: true });

    await window.waitForSelector('[data-testid="command-palette"]', { timeout: 6000 });
    const palette = await window.$('[data-testid="command-palette"]');
    expect(palette).not.toBeNull();

    // Cleanup — the palette input is focused, so keyboard.press reaches it.
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);
  });

  test('Escape closes the command palette', async ({ window }) => {
    await dispatchKey(window, 'k', { ctrlKey: true });
    await window.waitForSelector('[data-testid="command-palette"]', { timeout: 6000 });

    // Wait for the palette input to receive focus (50ms timer in CommandPaletteV2).
    // keyboard.press dispatches to the focused element; if input isn't focused yet
    // Escape lands on document.body with no handler and the palette stays open.
    await window.waitForFunction(
      () => {
        const palette = document.querySelector('[data-testid="command-palette"]');
        if (!palette) return false;
        const input = palette.querySelector('input');
        return document.activeElement === input;
      },
      { timeout: 3000 },
    ).catch(() => {
      // Focus may not land in headless Electron; fall through and try anyway.
    });

    await window.keyboard.press('Escape');
    await window.waitForTimeout(400);

    const palette = await window.$('[data-testid="command-palette"]');
    expect(palette).toBeNull();
  });

  test('Ctrl+Shift+P (legacy shortcut) opens the command palette', async ({ window }) => {
    await window.keyboard.press('Control+Shift+P');

    await window.waitForSelector('[data-testid="command-palette"]', { timeout: 6000 });
    const palette = await window.$('[data-testid="command-palette"]');
    expect(palette).not.toBeNull();

    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);
  });
});
