// Offline cache. Pages, scripts and styles come from the network first (so a new page never runs
// with old scripts) and fall back to the cache offline; images are served from the cache.
const CACHE = 'obento-pon-v16';
const CORE = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'vendor/matter.min.js', 'vendor/peerjs.min.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'img/cameo.jpg', 'img/rare.png',
  'js/main.js', 'js/config.js', 'js/game.js', 'js/render.js', 'js/chars.js', 'js/fx.js', 'js/audio.js', 'js/save.js', 'js/online.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const fresh = req.mode === 'navigate' || /\.(js|css|html|webmanifest)$/.test(new URL(req.url).pathname);
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req, fresh ? { cache: 'no-cache' } : {}).then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; });
    if (fresh) return net.catch(() => hit || Response.error());
    net.catch(() => {});
    return hit || net;
  }));
});
