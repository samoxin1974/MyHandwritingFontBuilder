// Offline cache for MyHandwriting Builder. Only used when served over http(s).
const CACHE = 'myhandwriting-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-512-maskable.png', './apple-touch-icon.png'];

// Set when this worker replaces an older one, so open pages can be reloaded
// onto the new build (see activate) instead of being stranded on cached code.
let replacedOldWorker = false;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      replacedOldWorker = keys.some(k => k !== CACHE);
    } catch (e) {}
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
    } catch (e) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    } catch (e) {}
    await self.clients.claim();
    if (replacedOldWorker) {
      // The whole app lives in index.html, so a page left open on the old copy
      // would keep the old behaviour. Reload them once onto this build.
      try {
        const windows = await self.clients.matchAll({ type: 'window' });
        windows.forEach(c => c.navigate(c.url).catch(() => {}));
      } catch (e) {}
    }
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (isPage) {
    // Network first: the page is the app, and a stale copy silently keeps old
    // behaviour. The cache is only the offline fallback.
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // Icons and manifest change only with the CACHE version: cache first.
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      });
    })
  );
});
