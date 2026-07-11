// Qwiz service worker — a small runtime cache so the app is installable and works offline.
// The app is fully static and all data lives in localStorage, so caching the shell + assets
// as they're fetched is enough; there's no API to worry about.
const CACHE = 'qwiz-v2';

self.addEventListener('install', (event) => {
  // Warm the cache with the app entry so a fresh install has something to open offline.
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/')).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Page navigations: network-first (so updates land), falling back to the cached page or the
  // app shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          // waitUntil keeps the worker alive until the write finishes — a fire-and-forget put
          // can be dropped when the event settles and the worker goes idle.
          event.waitUntil(cache.put(req, res.clone()));
          return res;
        } catch {
          return (await cache.match(req)) || (await cache.match('/')) || Response.error();
        }
      })()
    );
    return;
  }

  // Static assets: cache-first, revalidating in the background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) {
        event.waitUntil(
          fetch(req)
            .then((res) => res.ok && cache.put(req, res.clone()))
            .catch(() => {})
        );
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res.ok) event.waitUntil(cache.put(req, res.clone()));
        return res;
      } catch {
        return Response.error();
      }
    })()
  );
});
