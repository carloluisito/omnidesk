/**
 * session.spec.ts — rewritten for the Wave 03 design overhaul.
 *
 * Strategy:
 *   - Force the wizardCompleted=true path so the app doesn't show WelcomeScreen.
 *   - After reload the app shows: CommandCenter (if history exists), workspace-empty
 *     (no sessions, history cleared), or tab-bar (active sessions).
 *   - We use whichever new-session affordance is available:
 *       * [data-testid="cc-start-new"]          CommandCenter
 *       * [data-testid="we-new-session"]         WorkspaceEmpty
 *       * [data-testid="tab-bar-new-session"]    TabBar "+" button
 *   - Verify the rethemed NewSessionDialog appears.
 *   - Verify Cancel closes it.
 *
 * CommandCenter dismissal: the CC has no Escape handler — it only dismisses via
 * its own action buttons.  We click cc-start-new which calls onDismiss() and also
 * opens the new-session dialog, giving us the dialog in one step.
 *
 * Creating an actual session is skipped because that requires the claude CLI.
 */

import { test, expect } from './fixtures/electron';

/** Return any new-session affordance that is currently visible. */
async function getNewSessionAffordance(window: import('@playwright/test').Page) {
  // Wait for any known surface (CC, workspace-empty, or tab-bar).
  await window.waitForSelector(
    '[data-testid="command-center"], [data-testid="workspace-empty"], [data-testid="tab-bar"]',
    { timeout: 15000 },
  );
  // Check in priority order: CC > workspace-empty > tab-bar.
  const ccBtn = await window.$('[data-testid="cc-start-new"]');
  if (ccBtn) return ccBtn;
  const weBtn = await window.$('[data-testid="we-new-session"]');
  if (weBtn) return weBtn;
  return window.$('[data-testid="tab-bar-new-session"]');
}

test.describe('Session Management', () => {
  test.setTimeout(45000);

  test.beforeEach(async ({ window }) => {
    await window.evaluate(() => { localStorage.setItem('wizardCompleted', 'true'); });
    await window.reload();
  });

  test('new-session affordance is visible', async ({ window }) => {
    const affordance = await getNewSessionAffordance(window);
    expect(affordance).not.toBeNull();
  });

  test('clicking new-session affordance opens the rethemed dialog', async ({ window }) => {
    const affordance = await getNewSessionAffordance(window);
    expect(affordance).not.toBeNull();
    await affordance!.click();

    // The rethemed NewSessionDialog overlay must appear.
    await window.waitForSelector('[data-testid="new-session-dialog"]', { timeout: 8000 });
    const dialog = await window.$('[data-testid="new-session-dialog"]');
    expect(dialog).not.toBeNull();

    // The dialog must expose a Create button.
    const createBtn = await window.$('[data-testid="nsd-create"]');
    expect(createBtn).not.toBeNull();

    // Close cleanly
    await window.click('[data-testid="nsd-cancel"]');
    await window.waitForTimeout(400);
  });

  test('Cancel button closes the dialog', async ({ window }) => {
    const affordance = await getNewSessionAffordance(window);
    expect(affordance).not.toBeNull();
    await affordance!.click();

    await window.waitForSelector('[data-testid="new-session-dialog"]', { timeout: 8000 });

    await window.click('[data-testid="nsd-cancel"]');
    // Allow the 150ms close animation to finish
    await window.waitForTimeout(400);

    const dialog = await window.$('[data-testid="new-session-dialog"]');
    expect(dialog).toBeNull();
  });

  test.skip('creating a session adds a tab — requires claude CLI', async () => {
    // Skipped: creating a real session spawns a PTY that needs `claude` installed.
    // Intent: after submitting the dialog, a new tab appears in [data-testid="tab-bar"].
  });
});
