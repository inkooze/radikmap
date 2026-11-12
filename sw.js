const CACHE_NAME = 'rgrtu-map-v1.5.0';

const LOCAL_PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/leaflet.js',
  '/vendor/mdi/css/materialdesignicons.min.css',
  '/vendor/mdi/fonts/materialdesignicons-webfont.woff2',
  '/vendor/telegram/telegram-web-app.js',
  '/css/fonts/Onest-Cyrillic.woff2',
  '/css/fonts/Onest-Latin.woff2',
  '/data/rooms.json',
  '/data/graph.json',
  '/data/cache.json',
  '/data/floor0.svg',
  '/data/floor1.svg',
  '/data/floor2.svg',
  '/data/floor3.svg',
  '/data/floor4.svg',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/api/schedule-directory'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        LOCAL_PRECACHE_URLS.map((url) => cache.add(url).catch((err) => console.warn('[sw] Precache local failed:', url, err)))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Никогда не перехватываем и не кэшируем админ-панель, редактор графа и их скрипты/стили/API
  if (
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/editor') ||
    url.pathname.startsWith('/js/admin') ||
    url.pathname.startsWith('/css/admin') ||
    url.pathname.startsWith('/js/editor') ||
    url.pathname.startsWith('/css/editor') ||
    url.pathname.startsWith('/api/admin') ||
    url.pathname.startsWith('/api/editor')
  ) {
    return;
  }

  // 1. Навигационные запросы (открытие главной страницы браузером) — Network-first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(event.request, { ignoreSearch: true })) ||
            (await caches.match('/index.html')) ||
            (await caches.match('/'))
          );
        })
    );
    return;
  }

  // 2. Внешние CDN библиотеки (шрифты, иконки, Telegram WebApp)
  const isCdn =
    url.hostname === 'unpkg.com' ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'telegram.org' ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com');

  if (isCdn) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);
      })
    );
    return;
  }

  // 3. Запросы к нашему домену (JS, CSS, SVG, JSON, API) — Network-first для актуальности кода
  if (url.origin === self.location.origin) {
    const isCodeOrDataAsset =
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.json') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.ttf') ||
      url.pathname.endsWith('.woff2') ||
      url.pathname.endsWith('.png');

    if (isCodeOrDataAsset) {
      event.respondWith(
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(async () => {
            return (
              (await caches.match(event.request)) ||
              (await caches.match(event.request, { ignoreSearch: true }))
            );
          })
      );
      return;
    }

    // Для API данных расписания и комнат: Network-first с откатом на кэш
    const isScheduleApi =
      url.pathname === '/api/schedule' ||
      url.pathname === '/api/entity-schedule' ||
      url.pathname === '/api/schedule-directory' ||
      url.pathname === '/api/free-now';

    if (isScheduleApi) {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(async () => {
            const exact = await caches.match(event.request);
            if (exact) return exact;
            const byPath = await caches.match(event.request, { ignoreSearch: true });
            if (byPath) return byPath;
            return new Response(
              JSON.stringify({
                offline: true,
                error: 'Нет подключения к сети, и это расписание ещё не сохранено в офлайн-кэше.'
              }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
              }
            );
          })
      );
      return;
    }
  }
});
