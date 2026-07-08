import { describe, it, expect } from 'vitest';
import { injectRemoteHead, buildManifest, mimeFor } from './http-util';

describe('injectRemoteHead', () => {
  it('injects the bridge script + manifest link + apple meta before </head>', () => {
    const out = injectRemoteHead('<html><head><title>x</title></head><body></body></html>');
    expect(out).toContain('/__omnidesk/web-bridge.js');
    expect(out).toContain('rel="manifest"');
    expect(out).toContain('apple-mobile-web-app-capable');
    expect(out).toContain('name="theme-color"');
    expect(out.indexOf('rel="manifest"')).toBeLessThan(out.indexOf('</head>'));
  });

  it('prepends the tags when there is no head', () => {
    const out = injectRemoteHead('<body>hi</body>');
    expect(out.startsWith('<script')).toBe(true);
  });
});

describe('injectRemoteHead viewport override', () => {
  const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body></body></html>';
  it('rewrites the viewport for safe-areas and keyboard reflow', () => {
    const out = injectRemoteHead(html);
    expect(out).toContain('viewport-fit=cover');
    expect(out).toContain('interactive-widget=resizes-content');
    // Only one viewport meta remains.
    expect(out.match(/name="viewport"/g)?.length).toBe(1);
  });
  it('still injects the bridge script and manifest link', () => {
    const out = injectRemoteHead(html);
    expect(out).toContain('/__omnidesk/web-bridge.js');
    expect(out).toContain('rel="manifest"');
  });
});

describe('buildManifest', () => {
  it('is a standalone manifest with the token embedded in start_url', () => {
    const m = JSON.parse(buildManifest('tok+en/1'));
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/?token=tok%2Ben%2F1');
    expect(m.scope).toBe('/');
    expect(m.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
    expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  });
});

describe('mimeFor', () => {
  it('maps common extensions', () => {
    expect(mimeFor('.js')).toBe('text/javascript');
    expect(mimeFor('.css')).toBe('text/css');
    expect(mimeFor('.html')).toBe('text/html');
    expect(mimeFor('.unknown')).toBe('application/octet-stream');
  });
});
