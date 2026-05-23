/**
 * app-launch.spec.ts — rewritten for the Wave 03 design overhaul.
 *
 * On launch the app always shows ONE of these known surfaces:
 *   - [data-testid="welcome-screen"]   first-run (no wizardCompleted in localStorage)
 *   - [data-testid="command-center"]   returning user with history
 *   - [data-testid="workspace-empty"]  returning user, no sessions active, wizardCompleted=true
 *   - [data-testid="tab-bar"]          at least one active session
 *
 * We assert that at least one of those surfaces is present, the window title
 * includes "OmniDesk", and the window meets minimum dimensions.
 */

import { test, expect } from './fixtures/electron';

test.describe('App Launch', () => {
  test('window opens with correct title', async ({ window }) => {
    const title = await window.title();
    expect(title).toContain('OmniDesk');
  });

  test('window has minimum dimensions', async ({ electronApp }) => {
    const win = await electronApp.firstWindow();
    const { width, height } = await win.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(width).toBeGreaterThanOrEqual(800);
    expect(height).toBeGreaterThanOrEqual(500);
  });

  test('renders a known surface after launch', async ({ window }) => {
    // One of the four known surfaces must appear within 15s.
    // Which one depends on localStorage state in the real user profile.
    const knownSurface = await window.waitForSelector(
      '[data-testid="welcome-screen"], [data-testid="command-center"], [data-testid="workspace-empty"], [data-testid="tab-bar"]',
      { timeout: 15000 },
    );
    expect(knownSurface).not.toBeNull();
  });

  test('no legacy empty-state DOM is reachable', async ({ window }) => {
    // Wait for the app to settle on a known surface first
    await window.waitForSelector(
      '[data-testid="welcome-screen"], [data-testid="command-center"], [data-testid="workspace-empty"], [data-testid="tab-bar"]',
      { timeout: 15000 },
    );

    // The redesign removed .empty-state entirely.
    const legacyEmptyState = await window.$('.empty-state');
    expect(legacyEmptyState).toBeNull();
  });
});
