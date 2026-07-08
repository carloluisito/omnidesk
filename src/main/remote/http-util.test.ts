import { describe, it, expect } from 'vitest';
import { injectBridgeScript, mimeFor } from './http-util';

describe('injectBridgeScript', () => {
  it('inserts the bridge script tag before </head>', () => {
    const out = injectBridgeScript('<html><head><title>x</title></head><body></body></html>');
    expect(out).toContain('/__omnidesk/web-bridge.js');
    expect(out.indexOf('/__omnidesk/web-bridge.js')).toBeLessThan(out.indexOf('</head>'));
  });

  it('prepends the tag when there is no head', () => {
    const out = injectBridgeScript('<body>hi</body>');
    expect(out.startsWith('<script')).toBe(true);
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
