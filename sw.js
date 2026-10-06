const CACHE_NAME = 'investory-app-v0-1-56-dep-month';
// Ядро — без него приложение не откроется офлайн. Установка строгая: не
// скачалось ядро — новый воркер не ставится, прежняя версия остаётся.
const CORE = [
  './',
  './index.html',
  './manifest.json'
];
// Картинки и страницы — по возможности, поштучно. Раньше они шли в общем
// строгом списке: пропади в будущем выпуске хоть одна иконка, установка падала
// бы каждый раз, и все застряли бы на старой версии (аудит 03.10, п.23).
const APP_SHELL = [
  './icons/icon-384.png',
  './icons/icon-152.png',
  './privacy-policy.html',
  './terms-disclaimer.html',
  './panel-icons/1.png?v=4',
  './panel-icons/2.png?v=4',
  './panel-icons/3.png?v=4',
  './panel-icons/4.png?v=4',
  './panel-icons/5.png?v=4',
  './section-icons/AI.png?v=1',
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
  './exchange-logos/bybit.png?v=1',
  './exchange-logos/binance.png?v=1',
  './exchange-logos/monobank.png?v=1'
];

// Необязательное. Раньше шрифт лежал в общем списке, и один неудачный запрос к
// Google ронял addAll целиком: ошибка гасилась, новый воркер всё равно
// активировался и стирал прежний кэш — офлайн-версия исчезала из-за шрифта.
const OPTIONAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Manrope:wght@400;500;600;700;800&display=swap'
];

// Удаляем ТОЛЬКО свои кэши. Хранилище общее на весь домен, а на
// mnacik1988.github.io живёт ещё NeedBuy — прежняя чистка сносила и его.
const CACHE_PREFIX = 'investory-app-';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Обязательное — строго: если хоть один файл приложения не скачался,
    // установка ПАДАЕТ. Новый воркер не активируется, прежняя рабочая версия
    // остаётся на месте. Раньше ошибка гасилась и обновление шло с дырявым кэшем.
    // cache:'reload' — мимо HTTP-кэша браузера. GitHub Pages отдаёт файлы с
    // max-age=600, и без этого новый воркер получал от браузера 10-минутную
    // копию СТАРОГО index.html и складывал её в новый кэш — страница застревала
    // на прошлой версии до следующего выпуска. Поймано 28.09: v0.1.18 выложена,
    // у Александра после десяти перезапусков — v0.1.17.
    await cache.addAll(CORE.map(url => new Request(url, { cache: 'reload' })));
    // Остальное — по возможности, поштучно, ошибки не мешают установке.
    await Promise.all(APP_SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => null)));
    await Promise.all(OPTIONAL_ASSETS.map(url => cache.add(url).catch(() => null)));
    // skipWaiting только после успешной установки.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map(key => caches.delete(key))
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
        // В кэш — только удачные ответы: 404/500 раньше оседали до следующей версии.
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        // index.html — только вместо страницы. Картинке или файлу HTML вместо
        // них не поможет, а мешает понять, что именно не загрузилось.
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
    );
    return;
  }

  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});






