const CACHE_NAME = 'kapital-app-v0-0-21-stable-diagnostics-icons-v1';
const APP_SHELL = [
  './',
  './Depozit_v0_0_21.html',
  './privacy-policy.html',
  './terms-disclaimer.html',
  './panel-icons/1.png?v=4',
  './panel-icons/2.png?v=4',
  './panel-icons/3.png?v=4',
  './panel-icons/4.png?v=4',
  './panel-icons/5.png?v=4',
  './section-icons/section-crypto.png?v=1',
  './section-icons/section-stocks.png?v=1',
  './section-icons/section-account.png?v=1',
  './section-icons/section-business.png?v=1',
  './section-icons/section-cash.png?v=1',
  './section-icons/section-deposit.png?v=1',
  './section-icons/section-metals.png?v=1',
  './section-icons/section-settings.png?v=1',
  './section-icons/section-bonds.png?v=1',
  './section-icons/section-family.png?v=1',
  './section-icons/section-startups.png?v=1',
  './section-icons/section-forex.png?v=1',
  './section-icons/section-diagnostics.png?v=1',
  './section-icons/section-period-stats.png?v=1'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => caches.match('./Depozit_v0_0_21.html')))
    );
    return;
  }

  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
