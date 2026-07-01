const CACHE_NAME = 'investory-app-v0-0-50-audit-fixes';
const APP_SHELL = [
  './',
  './index.html',
  './Depozit_v0_0_24.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
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
  './section-icons/section-credit.png?v=1',
  './section-icons/section-family.png?v=1',
  './section-icons/section-startups.png?v=1',
  './section-icons/section-forex.png?v=1',
  './section-icons/section-diagnostics.png?v=1',
  './section-icons/section-period-stats.png?v=1',
  './section-icons/ui-pnl.png?v=1',
  './section-icons/ui-usdt.png?v=1',
  './section-icons/ui-percent.png?v=1',
  './section-icons/ui-period-stats.png?v=1',
  './section-icons/ui-clock.png?v=1',
  './section-icons/ui-net-profit.png?v=1',
  './section-icons/ui-tax.png?v=1',
  './section-icons/ui-accrued.png?v=1',
  './section-icons/ui-dividend-income.png?v=1',
  './section-icons/ui-trade.png?v=1',
  './section-icons/ui-sold.png?v=1',
  './section-icons/Gold.png',
  './section-icons/Silver.png',
  './section-icons/Platinum.png',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Inter:wght@400;500;600;700;800;900&family=Syne:wght@400;600;700;800&display=swap'
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
      }).catch(() => caches.match('./index.html').then(cached => cached || caches.match('./Depozit_v0_0_24.html'))))
    );
    return;
  }

  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});



