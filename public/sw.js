self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Standard fetch behavior
  event.respondWith(fetch(event.request));
});
