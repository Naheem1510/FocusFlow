/**
 * sw.js — Service worker: app shell caching and offline support.
 * Strategy: Cache First for shell assets, Network First for API calls.
 * Never caches: WebSocket connections, encrypted message payloads, blob URLs.
 */

const CACHE_NAME = 'workspace-v1';

const SHELL_ASSETS = [
  '/',
  '/css/reset.css',
  '/css/theme.css',
  '/css/dashboard.css',
  '/css/chat.css',
  '/css/pin.css',
  '/css/animations.css',
  '/js/app.js',
  '/js/crypto.js',
  '/js/socket.js',
  '/js/room.js',
  '/js/messages.js',
  '/js/ui.js',
  '/js/panic.js',
  '/js/pin.js',
  '/js/qr.js',
  '/js/notifications.js',
  '/js/autodelete.js',
  '/js/fakedata.js',
  '/js/storage.js',
  '/assets/favicon.ico',
  '/assets/favicon-dot.ico',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/manifest.json',
];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept WebSocket upgrades or blob downloads
  if (request.headers.get('Upgrade') === 'websocket') return;
  if (url.pathname.startsWith('/api/blob/')) return;
  if (url.pathname.startsWith('/ws/')) return;

  // API calls: Network First with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Shell assets: Cache First
  event.respondWith(cacheFirstStrategy(request));
});

async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — content not cached', { status: 503 });
  }
}

async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ─── Push notifications ───────────────────────────────────────────────────────

self.addEventListener('push', event => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Workspace Dashboard', body: 'New activity in your workspace' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Workspace Dashboard', {
      body: data.body || 'New activity in your workspace',
      icon: '/assets/icon-192.png',
      badge: '/assets/icon-192.png',
      tag: data.tag || 'workspace-notification',
      renotify: true,
      data: { roomId: data.data?.roomId },
    }),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const roomId = event.notification.data?.roomId;
  const url = roomId ? `/workspace/${roomId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        const existing = windowClients.find(c => c.url.includes(self.location.origin));
        if (existing) {
          existing.focus();
          existing.navigate(url);
        } else {
          clients.openWindow(url);
        }
      }),
  );
});
