// Offline support: the whole game is cached on first visit, then served
// from the cache while fresh copies download in the background.

const VERSION = 'flight-control-v2';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'src/main.js',
  'src/sim.js',
  'src/config.js',
  'src/math.js',
  'src/maps.js',
  'src/art.js',
  'src/render.js',
  'src/view.js',
  'src/input.js',
  'src/audio.js',
  'src/haptics.js',
  'src/storage.js',
  'fonts/jost-latin.woff2',
  'fonts/jost-latin-italic.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
