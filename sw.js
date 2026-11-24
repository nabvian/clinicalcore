const CACHE = 'clinicalcore';
const CORE = [
  './', 'index.html', 'hub.css', 'icon.svg', 'manifest.webmanifest', 'clinicalcore.wasm',
  'shared/base.css', 'shared/engine.js', 'shared/ui.js', 'shared/offline.js', 'shared/sign.js',
  'obilogic/', 'obilogic/index.html', 'obilogic/app.js', 'obilogic/i18n.js', 'obilogic/obilogic.css', 'obilogic/icon.svg',
  'corrected-age/', 'corrected-age/index.html', 'corrected-age/app.js', 'corrected-age/icon.svg',
  'mccd/', 'mccd/index.html', 'mccd/app.js', 'mccd/icon.svg',
  'anc/', 'anc/index.html', 'anc/app.js', 'anc/icon.svg',
  'vaccines/', 'vaccines/index.html', 'vaccines/app.js', 'vaccines/icon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })),
  );
});
