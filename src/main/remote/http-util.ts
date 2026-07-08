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

const BRIDGE_TAG = '<script src="/__omnidesk/web-bridge.js"></script>';

/** Inject the web bridge <script> so it runs before the renderer bundle. */
export function injectBridgeScript(html: string): string {
  if (html.includes('</head>')) {
    return html.replace('</head>', `  ${BRIDGE_TAG}\n</head>`);
  }
  return BRIDGE_TAG + html;
}
