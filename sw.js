const CACHE_NAME = 'business-calc-v36';
// 只預快取不帶版本號的核心靜態資源（JS/CSS 由 fetch handler 動態快取，避免版本號不同步問題）
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './xlsx.full.min.js',
  './math.min.js',
  './manifest.json',
  './app_icon.png',
  './flags/cn.svg',
  './flags/eu.svg',
  './flags/jp.svg',
  './flags/kr.svg',
  './flags/tw.svg',
  './flags/us.svg',
  './flags/my.svg',
  './flags/sg.svg',
  './flags/au.svg',
  './flags/vn.svg',
  './flags/th.svg'
];

// 監聽前端發送的 SKIP_WAITING 訊號
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 安裝 Service Worker 並快取靜態資源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 啟用並清除舊快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 攔截請求：依據資源類型採用最佳策略
self.addEventListener('fetch', (event) => {
  // 只處理 GET 請求
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. 🔥【主頁面與導航請求 (index.html / Root Navigation)】：Network First (網路優先)
  // 確保用戶始終獲得最新 HTML 與更新檢測，避免卡在舊版本；離線時自動回退快取
  const isHtmlNavigation = event.request.mode === 'navigate' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/');

  if (isHtmlNavigation && url.origin === location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache1 = networkResponse.clone();
            const responseToCache2 = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache1);
              cache.put('./index.html', responseToCache2);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // 離線回退至快取的 index.html
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('./index.html') || caches.match('./');
          });
        })
    );
    return;
  }

  // 2. 核心大數據庫與幾乎不變資源 (math.min.js, xlsx.full.min.js)：Cache First 策略
  const isCoreImmutableLib = url.pathname.endsWith('math.min.js') || url.pathname.endsWith('xlsx.full.min.js');
  if (isCoreImmutableLib) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. 外部 API 請求 (匯率 API、定位等)：Network First 策略
  if (url.origin !== location.origin && !url.host.includes('fonts.googleapis.com') && !url.host.includes('fonts.gstatic.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // 4. 靜態資源 (CSS, JS, Fonts, Icons, SVG)：Network First，快取備援
  // 【修復】每次優先從網路取得最新版（版本號不同的請求會直接 miss 快取），確保 ?v= 版本更新立即生效
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // 離線時才回退快取
        return caches.match(event.request);
      })
  );
});
