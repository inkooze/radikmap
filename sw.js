const CACHE_NAME = 'rgrtu-map-v1.4.6';

const LOCAL_PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
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

const CDN_PRECACHE_URLS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css',
  'https://telegram.org/js/telegram-web-app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Кэшируем локальные файлы
      await Promise.allSettled(
        LOCAL_PRECACHE_URLS.map((url) => cache.add(url).catch((err) => console.warn('[sw] Precache local failed:', url, err)))
      );
      // Кэшируем внешние CDN зависимости (Leaflet, иконки, Telegram WebApp)
      await Promise.allSettled(
        CDN_PRECACHE_URLS.map((url) =>
          fetch(url, { mode: 'cors' })
            .then((res) => {
              if (res.ok) return cache.put(url, res);
            })
            .catch(() => {})
        )
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

  // 1. Навигационные запросы (открытие главной страницы браузером)
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
          // При отсутствии интернета открываем закэшированную оболочку index.html
          return (
            (await caches.match(event.request, { ignoreSearch: true })) ||
            (await caches.match('/index.html')) ||
            (await caches.match('/'))
          );
        })
    );
    return;
  }

  // 2. Внешние CDN библиотеки (Leaflet, шрифты, иконки MDI, Telegram WebApp)
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

  // 3. Запросы к нашему домену (JS, CSS, SVG, JSON, API)
  if (url.origin === self.location.origin) {
    const isStaticAsset =
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.json') ||
      url.pathname.endsWith('.ttf') ||
      url.pathname.endsWith('.png');

    if (isStaticAsset) {
      // Stale-while-revalidate с игнорированием версионных хэшей в query (?v=...)
      event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
          const fetchPromise = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        })
      );
      return;
    }

    // Для API данных расписания и комнат: Network-first с откатом на кэш с точным поиском по query
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
            // 1. Точный поиск по URL с query-параметрами
            const exact = await caches.match(event.request);
            if (exact) return exact;

            // 2. Если конкретная неделя не была закэширована, ищем любую сохранённую неделю этой же сущности
            if (url.pathname === '/api/entity-schedule') {
              const reqType = url.searchParams.get('type');
              const reqName = url.searchParams.get('name');
              if (reqType && reqName) {
                const cache = await caches.open(CACHE_NAME);
                const keys = await cache.keys();
                for (const k of keys) {
                  const u = new URL(k.url);
                  if (
                    u.pathname === '/api/entity-schedule' &&
                    u.searchParams.get('type') === reqType &&
                    u.searchParams.get('name') === reqName
                  ) {
                    const fallback = await cache.match(k);
                    if (fallback) return fallback;
                  }
                }
              }
            }

            // 3. Для расписания конкретной аудитории
            if (url.pathname === '/api/schedule') {
              const classroom = url.searchParams.get('classroom');
              if (classroom) {
                const cache = await caches.open(CACHE_NAME);
                const keys = await cache.keys();
                for (const k of keys) {
                  const u = new URL(k.url);
                  if (u.pathname === '/api/schedule' && u.searchParams.get('classroom') === classroom) {
                    const fallback = await cache.match(k);
                    if (fallback) return fallback;
                  }
                }
              }
            }

            return await caches.match(event.request, { ignoreSearch: true });
          })
      );
      return;
    }

    // Для остальных API запросов
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});

