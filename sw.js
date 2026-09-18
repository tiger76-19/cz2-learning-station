// Service Worker for PWA installation (v7 - 相对路径 + 页面网络优先 + 跨域 API 放行)
const CACHE_NAME = 'cz2-learning-station-v8';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// Install event - cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()) // 单个资源失败不阻塞安装
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
      // 兜底：老版本 SW 可能已把 api.github.com 的响应写进缓存，
      // 这些"毒缓存"会让同步一直拿到过期 sha，在此彻底清除
      .then(() => caches.keys())
      .then(names => Promise.all(names.map(name =>
        caches.open(name).then(c => c.keys().then(reqs =>
          Promise.all(reqs.filter(r => r.url.indexOf('api.github.com') >= 0).map(r => c.delete(r)))
        ))
      )))
      .then(() => self.clients.claim())
  );
});

// Fetch event
self.addEventListener('fetch', event => {
  const req = event.request;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 【关键】跨域请求一律放行，绝不拦截、绝不缓存。
  // 本站通过 api.github.com 做多端同步：API 的 URL 每次都完全一样，
  // 一旦响应被 SW 缓存，之后读到的永远是过期的 sha，写入必然 409 冲突 → 表现为"反复掉线"。
  if (url.origin !== self.location.origin) return;
  // 非 GET 请求（PUT 等）也不进缓存，Cache API 只支持 GET
  if (req.method !== 'GET') return;

  // 页面/导航请求：网络优先（打开即拿最新版），失败回退缓存（离线可用）
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put('./index.html', clone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // 静态资源：缓存优先，未命中则网络并写入缓存
  event.respondWith(
    caches.match(req).then(r => {
      if (r) return r;
      return fetch(req).then(net => {
        if (net && net.status === 200) {
          const clone = net.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
        }
        return net;
      });
    })
  );
});

// Handle messages from the app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
