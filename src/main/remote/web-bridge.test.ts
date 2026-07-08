import { describe, it, expect } from 'vitest';
import { generateWebBridgeScript } from './web-bridge';
import { channels, contractKinds } from '../../shared/ipc-contract';

describe('generateWebBridgeScript', () => {
  const script = generateWebBridgeScript(channels, contractKinds);

  it('embeds the channel and kind maps', () => {
    expect(script).toContain('session:output');
    expect(script).toContain('"getSessionScrollback":"invoke"');
  });

  it('sets window.electronAPI and connects a WebSocket', () => {
    expect(script).toContain('window.electronAPI');
    expect(script).toContain('/__omnidesk/ws');
  });

  it('special-cases the packed send methods like the preload', () => {
    expect(script).toContain('sendSessionInput');
    expect(script).toContain('resizeSession');
  });

  it('sets the remote-client flag so the renderer replays scrollback', () => {
    expect(script).toContain('window.__OMNIDESK_REMOTE__ = true');
  });

  it('registers the PWA service worker', () => {
    expect(script).toContain("'serviceWorker' in navigator");
    expect(script).toContain("register('/sw.js')");
  });

  it('is a self-contained IIFE with no module syntax', () => {
    expect(script.trim().startsWith('(function(){')).toBe(true);
    expect(script.trim().endsWith('})();')).toBe(true);
    // No CommonJS/ESM statements that would break in a plain <script> tag.
    expect(script).not.toMatch(/\brequire\(/);
    expect(script).not.toMatch(/\bmodule\.exports\b/);
    expect(script).not.toMatch(/^\s*import\s/m);
    expect(script).not.toMatch(/^\s*export\s/m);
  });
});
