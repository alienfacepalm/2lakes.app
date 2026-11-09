const SHELL_CACHE = "2lakes-shell-v2";
const DATA_CACHE = "2lakes-data-v2";

const PRECACHE = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || networkFetch;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/kc")) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/assets/")) {
      event.respondWith(
        caches.match(event.request).then(
          (cached) =>
            cached ||
            fetch(event.request).then((response) => {
              if (response.ok) {
                caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, response.clone()));
              }
              return response;
            })
        )
      );
      return;
    }

    if (event.request.mode === "navigate") {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            if (response.ok) {
              caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, response.clone()));
            }
            return response;
          })
          .catch(() => caches.match("/") || caches.match(event.request))
      );
      return;
    }
  }

  event.respondWith(fetch(event.request));
});
