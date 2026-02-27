import { test, expect } from './fixtures/electron';

test.describe('App Launch', () => {
  test('window opens with correct title', async ({ window }) => {
    const title = await window.title();
    expect(title).toContain('OmniDesk');
  });

  test('window has minimum dimensions', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    const { width, height } = await window.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(width).toBeGreaterThanOrEqual(800);
    expect(height).toBeGreaterThanOrEqual(500);
  });

  test('renders the tab bar', async ({ window }) => {
    await window.waitForSelector('.tab-bar', { timeout: 10000 });
    const tabBar = await window.$('.tab-bar');
    expect(tabBar).not.toBeNull();
  });

  test('shows empty state or session on first load', async ({ window }) => {
    // Either empty state or a terminal should be visible
    await window.waitForSelector('.empty-state, .terminal-container, .tab-bar', { timeout: 10000 });
    const hasContent = await window.$('.empty-state') || await window.$('.terminal-container');
    expect(hasContent).not.toBeNull();
  });
});
