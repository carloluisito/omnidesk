/**
 * redesign-journeys.spec.ts — Wave 03 new-design surface journeys.
 *
 * Covers:
 *   1. WorkspaceEmpty/CC: new-session affordance (cc-start-new, we-new-session,
 *      or tab-bar-new-session) opens the rethemed NewSessionDialog.
 *   2. CommandCenter: "Start new" opens dialog; "Open command palette" opens palette.
 *   3. Ctrl+K from the workspace opens the palette; Escape closes it.
 *   4. No-legacy guard: old DOM selectors and text must be absent.
 *
 * CommandCenter dismissal:
 *   The CC has no Escape/click-outside handler. We click cc-start-new which calls
 *   onDismiss() and opens the dialog, then cancel — leaving a clean workspace.
 *
 * Keyboard event strategy:
 *   Ctrl+K is intercepted by Chromium at the browser level before the page
 *   keydown handler fires.  We dispatch directly via page.evaluate().
 *   Escape to close the palette goes through the focused palette input, so
 *   keyboard.press('Escape') reaches the palette's own onKeyDown handler.
 */

import { test, expect } from './fixtures/electron';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function seedReturningUser(window: import('@playwright/test').Page) {
  await window.evaluate(() => { localStorage.setItem('wizardCompleted', 'true'); });
  await window.reload();
  await window.waitForSelector(
    '[data-testid="command-center"], [data-testid="workspace-empty"], [data-testid="tab-bar"]',
    { timeout: 15000 },
  );
}

/** Dismiss CommandCenter by clicking cc-start-new → new-session dialog → cancel.
 *  Returns true if CC was present and dismissed, false if CC wasn't showing. */
async function dismissCommandCenter(window: import('@playwright/test').Page): Promise<boolean> {
  const cc = await window.$('[data-testid="command-center"]');
  if (!cc) return false;
  const startNew = await window.$('[data-testid="cc-start-new"]');
  if (!startNew) return false;
  await startNew.click();
  await window.waitForSelector('[data-testid="new-session-dialog"]', { timeout: 8000 });
  await window.click('[data-testid="nsd-cancel"]');
  await window.waitForTimeout(400);
  return true;
}

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

// ─── New-session affordance journey ──────────────────────────────────────────

test.describe('New-session affordance journey', () => {
  test.setTimeout(45000);

  test.beforeEach(async ({ window }) => {
    await seedReturningUser(window);
  });

  test('new-session affordance opens the rethemed NewSessionDialog', async ({ window }) => {
    // Use whichever affordance is present: CC > workspace-empty > tab-bar.
    // cc-start-new is the preferred path since it also dismisses CC cleanly.
    const ccBtn = await window.$('[data-testid="cc-start-new"]');
    if (ccBtn) {
      await ccBtn.click();
      await window.waitForSelector('[data-testid="new-session-dialog"]', { timeout: 8000 });
      const dialog = await window.$('[data-testid="new-session-dialog"]');
      expect(dialog).not.toBeNull();
      await window.click('[data-testid="nsd-cancel"]');
      await window.waitForTimeout(400);
      return;
    }

    // CommandCenter not showing — workspace-empty or tab-bar.
    const weBtn = await window.$('[data-testid="we-new-session"]');
    const tbBtn = await window.$('[data-testid="tab-bar-new-session"]');
    const affordance = weBtn ?? tbBtn;
    expect(affordance).not.toBeNull();

    await affordance!.click();
    await window.waitForSelector('[data-testid="new-session-dialog"]', { timeout: 8000 });
    const dialog = await window.$('[data-testid="new-session-dialog"]');
    expect(dialog).not.toBeNull();

    await window.click('[data-testid="nsd-cancel"]');
    await window.waitForTimeout(400);
  });
});

// ─── CommandCenter journey ────────────────────────────────────────────────────

test.describe('CommandCenter journey', () => {
  test.setTimeout(45000);

  test.beforeEach(async ({ window }) => {
    await window.evaluate(() => { localStorage.setItem('wizardCompleted', 'true'); });
    await window.reload();
    await window.waitForSelector(
      '[data-testid="command-center"], [data-testid="workspace-empty"], [data-testid="tab-bar"]',
      { timeout: 15000 },
    );
  });

  test('cc-start-new opens NewSessionDialog', async ({ window }) => {
    const cc = await window.$('[data-testid="command-center"]');
    if (!cc) {
      test.skip(true, 'CommandCenter not shown — no history in this environment');
      return;
    }

    const startNew = await window.$('[data-testid="cc-start-new"]');
    expect(startNew).not.toBeNull();
    await startNew!.click();

    await window.waitForSelector('[data-testid="new-session-dialog"]', { timeout: 8000 });
    const dialog = await window.$('[data-testid="new-session-dialog"]');
    expect(dialog).not.toBeNull();

    await window.click('[data-testid="nsd-cancel"]');
    await window.waitForTimeout(400);
  });

  test('cc-open-palette opens the command palette', async ({ window }) => {
    const cc = await window.$('[data-testid="command-center"]');
    if (!cc) {
      test.skip(true, 'CommandCenter not shown — no history in this environment');
      return;
    }

    const openPalette = await window.$('[data-testid="cc-open-palette"]');
    expect(openPalette).not.toBeNull();
    await openPalette!.click();

    await window.waitForSelector('[data-testid="command-palette"]', { timeout: 6000 });
    const palette = await window.$('[data-testid="command-palette"]');
    expect(palette).not.toBeNull();

    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);
  });
});

// ─── Command palette via keyboard ─────────────────────────────────────────────

test.describe('Command palette via keyboard', () => {
  test.setTimeout(45000);

  test.beforeEach(async ({ window }) => {
    await seedReturningUser(window);
    await dismissCommandCenter(window);
  });

  test('Ctrl+K opens the palette from the workspace', async ({ window }) => {
    await dispatchKey(window, 'k', { ctrlKey: true });

    await window.waitForSelector('[data-testid="command-palette"]', { timeout: 6000 });
    const palette = await window.$('[data-testid="command-palette"]');
    expect(palette).not.toBeNull();

    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);
  });

  test('Escape closes the palette', async ({ window }) => {
    await dispatchKey(window, 'k', { ctrlKey: true });
    await window.waitForSelector('[data-testid="command-palette"]', { timeout: 6000 });

    // Wait for the palette input to receive focus (50ms timer in CommandPaletteV2).
    await window.waitForFunction(
      () => {
        const palette = document.querySelector('[data-testid="command-palette"]');
        if (!palette) return false;
        const input = palette.querySelector('input');
        return document.activeElement === input;
      },
      { timeout: 3000 },
    ).catch(() => { /* fall through */ });

    await window.keyboard.press('Escape');
    await window.waitForTimeout(400);

    const palette = await window.$('[data-testid="command-palette"]');
    expect(palette).toBeNull();
  });
});

// ─── No-legacy guard ──────────────────────────────────────────────────────────

test.describe('No-legacy guard', () => {
  test.setTimeout(45000);

  test.beforeEach(async ({ window }) => {
    await seedReturningUser(window);
    await window.waitForTimeout(500);
  });

  test('legacy .empty-state selector resolves to nothing', async ({ window }) => {
    const legacyEmptyState = await window.$('.empty-state');
    expect(legacyEmptyState).toBeNull();
  });

  test('legacy .new-session-dialog class selector resolves to nothing', async ({ window }) => {
    const legacyDialog = await window.$('.new-session-dialog');
    expect(legacyDialog).toBeNull();
  });

  test('old v1 welcome text "Multi-provider AI coding terminal" is absent', async ({ window }) => {
    const bodyText = await window.evaluate(() => document.body.innerText);
    expect(bodyText).not.toContain('Multi-provider AI coding terminal');
  });

  test('new design surfaces are addressable via data-testid (not fragile class names)', async ({ window }) => {
    const tabBar = await window.$('[data-testid="tab-bar"]');
    const workspaceEmpty = await window.$('[data-testid="workspace-empty"]');
    const commandCenter = await window.$('[data-testid="command-center"]');
    const hasNewDesignSurface = tabBar !== null || workspaceEmpty !== null || commandCenter !== null;
    expect(hasNewDesignSurface).toBe(true);
  });
});
