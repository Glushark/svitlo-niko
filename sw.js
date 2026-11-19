const CACHE_NAME = 'svitlo-niko-shell-v6';
const SHELL = ['./', './index.html', './styles.css', './app.js', './queue-picker.js', './space-background.js', './assets/space-background.mp4', './assets/indicators/sun.gif', './assets/indicators/moon.gif', './assets/indicators/sun-moon.gif', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok && event.request.method === 'GET') {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html'))));
});
