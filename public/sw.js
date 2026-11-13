// Papelito — Service Worker de alcance público limitado
// Regla crítica: NUNCA almacena datos de API, autenticación, deseos ni asignaciones privadas.

const CACHE_NAME = 'papelito-public-v6';
const PRECACHE_ASSETS = [
  '/offline.html',
  '/offline-vault.js',
  '/offline-reader.js',
  '/preferences.js',
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

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* Fall back to a generic private notice. */ }
  const url = typeof payload.url === 'string' && /^\/\?intercambio=[0-9a-f-]{36}$/i.test(payload.url) ? payload.url : '/';
  event.waitUntil(self.registration.showNotification('Papelito', {
    body: typeof payload.body === 'string' ? payload.body.slice(0, 250) : 'Tenés novedades en Papelito.',
    icon: '/icon-192.png', badge: '/icon-192.png', tag: payload.tag || 'papelito', data: { url },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data?.url;
  const path = typeof raw === 'string' && /^\/\?intercambio=[0-9a-f-]{36}$/i.test(raw) ? raw : '/';
  event.waitUntil(self.clients.openWindow(new URL(path, self.location.origin).href));
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

async function offlineNavigationResponse() {
  try {
    const cached = await caches.match('/offline.html');
    if (cached) return cached;
  } catch { /* Android may evict or temporarily deny access to Cache Storage. */ }
  // respondWith must always resolve to a Response, even if the cache was evicted.
  return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Papelito — Sin conexión</title><body style="margin:0;padding:2rem;background:#FAF7FC;color:#46245D;font:1.1rem system-ui"><main><h1>No pudimos abrir Papelito.</h1><p>La conexión se interrumpió. Volvé a intentarlo cuando tengas señal.</p><button onclick="location.reload()" style="padding:1rem;font:inherit">Volver a intentar</button></main></body></html>`, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' },
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // 2. EXCLUDE all API routes, auth routes, invitation and personal-link URLs from caching
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/unirse/') ||
    url.pathname.startsWith('/papelito/')
  ) {
    return;
  }

  // 3. For navigation requests (HTML pages): Network-first.
  // Never save authenticated responses in cache to avoid leaking private data.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(offlineNavigationResponse)
    );
    return;
  }

  // 4. For precached public static assets (fonts, icons): Cache-first
  if (
    url.pathname.startsWith('/fonts/') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname === '/manifest.webmanifest' || ['/offline-vault.js', '/offline-reader.js', '/preferences.js'].includes(url.pathname)
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
