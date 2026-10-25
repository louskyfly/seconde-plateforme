// v3 : retour de l'ancien design, données dans Firebase.
// Les pages HTML viennent du réseau en priorité, pour que chaque appareil
// récupère tout de suite la nouvelle version du site. Les données (Firebase)
// ne passent jamais par ce service worker.
const CACHE_NAME = 'seconde-platform-v5';
const BASE = '/seconde-plateforme/';
const STATIC_ASSETS = [BASE, BASE + 'manifest.json', BASE + 'favicon.svg', BASE + 'icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;
  // Ne jamais intercepter les autres domaines (Firebase, polices...).
  if (new URL(request.url).origin !== self.location.origin) return;

  // Pages HTML : réseau d'abord, cache seulement hors ligne.
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(BASE, copy));
          }
          return response;
        })
        .catch(() => caches.match(BASE).then((r) => r || new Response('Hors ligne', { status: 503 })))
    );
    return;
  }

  // Autres fichiers (JS, CSS, images) : réseau d'abord aussi, cache seulement
  // hors ligne. (Le « cache d'abord » gardait d'anciennes versions du site.)
  // cache: 'no-cache' = on redemande toujours au serveur s'il y a plus récent
  // (sinon le navigateur garde jusqu'à 10 min une ancienne copie du fichier).
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(request)
          .then((cached) => cached || new Response('Hors ligne', { status: 503, statusText: 'Service Unavailable' }))
      )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  if (url) event.waitUntil(clients.openWindow(url));
});
