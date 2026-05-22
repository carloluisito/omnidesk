/**
 * split-view.spec.ts — rewritten for the Wave 03 design overhaul.
 *
 * Chrome invariants (no active session required):
 *   - When sessions.length === 0: workspace-empty is shown.
 *   - When sessions.length > 0:   tab-bar is shown + a terminal surface
 *     (either split-layout if split is active, or .terminals-container for
 *     the default single-pane MultiTerminal).
 *
 * Split-specific assertions (drag handle count, second pane creation) are
 * skipped because they require at least one live PTY session needing the
 * claude CLI — not available in CI.
 */

import { test, expect } from './fixtures/electron';

test.describe('Split View', () => {
  test.setTimeout(45000);

  test.beforeEach(async ({ window }) => {
    await window.evaluate(() => { localStorage.setItem('wizardCompleted', 'true'); });
    await window.reload();

    await window.waitForSelector(
      '[data-testid="command-center"], [data-testid="workspace-empty"], [data-testid="tab-bar"]',
      { timeout: 15000 },
    );
  });

  test('shows workspace-empty or tab-bar depending on session state', async ({ window }) => {
    // Dismiss CommandCenter if present to reach the chrome.
    const cc = await window.$('[data-testid="command-center"]');
    if (cc) {
      const startNew = await window.$('[data-testid="cc-start-new"]');
      if (startNew) {
        await startNew.click();
        await window.waitForSelector('[data-testid="new-session-dialog"]', { timeout: 8000 });
        await window.click('[data-testid="nsd-cancel"]');
        await window.waitForTimeout(400);
      }
    }

    const surface = await window.waitForSelector(
      '[data-testid="workspace-empty"], [data-testid="tab-bar"]',
      { timeout: 10000 },
    );
    expect(surface).not.toBeNull();
  });

  test('terminal surface is present when sessions are active', async ({ window }) => {
    // When tab-bar is showing, a terminal surface must also exist.
    // SplitLayout renders when isSplitActive=true (user split a pane).
    // MultiTerminal (.terminals-container) renders in single-pane mode.
    // Either is acceptable proof that the workspace chrome is working.
    const cc = await window.$('[data-testid="command-center"]');
    if (cc) {
      const startNew = await window.$('[data-testid="cc-start-new"]');
      if (startNew) {
        await startNew.click();
        await window.waitForSelector('[data-testid="new-session-dialog"]', { timeout: 8000 });
        await window.click('[data-testid="nsd-cancel"]');
        await window.waitForTimeout(400);
      }
    }

    const tabBar = await window.$('[data-testid="tab-bar"]');
    if (!tabBar) {
      // No active sessions — workspace-empty is showing; this is correct.
      const empty = await window.$('[data-testid="workspace-empty"]');
      expect(empty).not.toBeNull();
      return;
    }

    // Tab-bar is present → either split-layout or .terminals-container must exist.
    const terminalSurface = await window.$(
      '[data-testid="split-layout"], .terminals-container',
    );
    expect(terminalSurface).not.toBeNull();
  });

  test.skip('drag-handle count is 0 in single-pane mode — requires active session', async () => {
    // Skipped: requires a live session (PTY + claude CLI).
    // Intent: in single-pane mode, no .drag-handle elements should exist.
  });

  test.skip('split creates a second pane — requires active session', async () => {
    // Skipped: requires a live PTY / claude CLI.
    // Intent: after Ctrl+\, paneCount increases and a drag handle appears.
  });
});
