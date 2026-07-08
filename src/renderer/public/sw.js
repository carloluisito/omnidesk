/* OmniDesk remote PWA service worker.
 * Minimal by design: the app needs a live connection to your machine, so this
 * only (a) makes the app installable and (b) caches content-hashed assets for
 * faster loads. It never caches auth, navigations, or /__omnidesk/* routes. */
const CACHE = 'omnidesk-remote-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Dynamic/auth/navigation → always network; offline fallback for navigations.
  const isDynamic =
    req.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/__omnidesk/');
  if (isDynamic) {
    event.respondWith(
      fetch(req).catch(() =>
        req.mode === 'navigate'
          ? new Response(
              '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
                '<body style="font-family:system-ui;background:#0A0B11;color:#e6e6e6;display:flex;' +
                'min-height:100vh;align-items:center;justify-content:center;text-align:center;margin:0">' +
                '<div><h2>Can’t reach OmniDesk</h2><p>Your machine appears to be offline.</p></div>',
              { headers: { 'Content-Type': 'text/html' }, status: 503 },
            )
          : Response.error(),
      ),
    );
    return;
  }

  // Content-hashed build assets → cache-first (immutable).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    })());
  }
  // Everything else: default network passthrough (no respondWith).
});
