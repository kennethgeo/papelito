// Papelito — Service Worker de alcance público limitado
// Regla crítica: NUNCA almacena datos de API, autenticación, deseos ni asignaciones privadas.

const CACHE_NAME = 'papelito-public-v3';
const PRECACHE_ASSETS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icon-192.svg',
  '/icon-512.svg',
  '/fonts/bricolage-grotesque-latin.woff2',
  '/fonts/source-sans-3-latin.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith('papelito-public-') && key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // 2. EXCLUDE all API routes, auth routes, and invitation URLs from caching
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/unirse/')
  ) {
    return;
  }

  // 3. For navigation requests (HTML pages): Network-first.
  // Never save authenticated responses in cache to avoid leaking private data.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/offline.html');
      })
    );
    return;
  }

  // 4. For precached public static assets (fonts, icons): Cache-first
  if (
    url.pathname.startsWith('/fonts/') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request);
      })
    );
  }
});
