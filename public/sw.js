const CACHE_NAME = "seconde-shell-v4";
const APP_SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== location.origin) return;

  // Les réponses d'API ne sont JAMAIS mises en cache.
  //
  // Elles l'étaient en networkFirst : quand le réseau échouait, le service
  // worker renvoyait la dernière réponse connue. Pendant ce temps la base avait
  // déjà été réinitialisée, et l'élève voyait d'anciennes données — l'inverse
  // exact du problème signalé. Mieux vaut une erreur franche (l'UI affiche
  // désormais « Réessayer ») que des données périmées présentées comme vraies.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("push", (event) => {
  let data = { title: "Seconde", body: "", url: "/" };
  try {
    data = Object.assign(data, event.data.json());
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    (async () => {
      // Pastille numérique sur l'icône de l'application (Android / PWA installée)
      if (self.registration.setAppBadge) {
        try {
          const current = self.registration.getAppBadge ? (await self.registration.getAppBadge()) || 0 : 0;
          await self.registration.setAppBadge(current + 1);
        } catch (e) {
          /* API non supportée */
        }
      }
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/favicon.svg",
        badge: "/favicon.svg",
        // Remplace la notification précédente au lieu d'empiler, et la
        // redemande à chaque nouveau message (vibration si autorisée)
        tag: data.tag || "seconde",
        renotify: true,
        vibrate: [40, 30, 40],
        data: { url: data.url || "/" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      if (self.registration.clearAppBadge) {
        try {
          await self.registration.clearAppBadge();
        } catch (e) {
          /* API non supportée */
        }
      }
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});