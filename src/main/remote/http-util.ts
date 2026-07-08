const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

export function mimeFor(ext: string): string {
  return MIME[ext.toLowerCase()] ?? 'application/octet-stream';
}

// Injected into the <head> of the remote-served renderer (never the desktop
// app): the web-bridge script + PWA install tags. The bridge script must stay
// external — the renderer CSP is script-src 'self' (no inline scripts).
const HEAD_TAGS = [
  '<script src="/__omnidesk/web-bridge.js"></script>',
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="OmniDesk">',
  '<meta name="theme-color" content="#0A0B11">',
].join('\n  ');

// Remote clients need a notch-aware viewport that also reflows when the mobile
// keyboard opens. Desktop index.html is untouched — this runs only on served HTML.
const REMOTE_VIEWPORT =
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">';

/**
 * Inject the bridge script + PWA head tags before </head> (prepend if absent),
 * and rewrite the viewport meta for safe-areas + keyboard reflow on remote clients.
 */
export function injectRemoteHead(html: string): string {
  // Replace any existing viewport meta with the remote-optimized one.
  const withViewport = html.replace(
    /<meta\s+name="viewport"[^>]*>/i,
    REMOTE_VIEWPORT,
  );
  const base = withViewport.includes('name="viewport"') ? withViewport : REMOTE_VIEWPORT + withViewport;
  if (base.includes('</head>')) {
    return base.replace('</head>', `  ${HEAD_TAGS}\n</head>`);
  }
  return HEAD_TAGS + base;
}

/**
 * Build the PWA web app manifest. The token rides in start_url so the installed
 * app re-authenticates itself on launch (works even on iOS's separate standalone
 * cookie jar). The manifest is therefore served ONLY behind a valid auth cookie.
 */
export function buildManifest(token: string): string {
  return JSON.stringify({
    name: 'OmniDesk',
    short_name: 'OmniDesk',
    start_url: `/?token=${encodeURIComponent(token)}`,
    scope: '/',
    id: '/',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#0A0B11',
    background_color: '#0A0B11',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
}
