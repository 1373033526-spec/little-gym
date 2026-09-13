/* Little GYM Service Worker — 离线优先（cache-first） */
/* ⚠️ 每次部署前必须 +1，并与 index.html 里的 APP_VERSION 保持一致。
   版本号变化会触发 SW 更新并自动清掉旧版缓存。 */
const APP_VERSION = '1.13.1';
const CACHE = 'little-gym-v' + APP_VERSION;
const ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  // 预缓存应用外壳；单个资源失败不阻断整体安装；新 SW 立即接管
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(ASSETS.map(u => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // 清理旧版本缓存
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 跨域资源（如二维码 API）不拦截，离线时自然失败由页面降级处理
  if (url.origin !== self.location.origin) return;

  // 页面导航：在线时取最新并回填缓存，离线时回退到缓存的外壳
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req)
            .then(cached => cached || caches.match('./index.html') || caches.match('./'))
        )
    );
    return;
  }

  // 同源静态资源：缓存优先，未命中再走网络并写入缓存
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
