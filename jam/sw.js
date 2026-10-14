// Offline cache: serve from cache instantly, refresh the cache in the background.
const CACHE = 'jamlab-v1';
const CORE = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'js/ui/main.js', 'js/ui/content.js', 'js/ui/save.js', 'js/ui/audio.js',
  'js/sim/engine.js', 'js/sim/models.js', 'js/sim/rng.js', 'js/sim/scenarios.js',
  'js/render/renderer.js', 'js/render/layout.js', 'js/render/sprites.js', 'js/render/charts.js',
  'js/game/missions.js', 'js/game/runner.js', 'js/game/controls.js', 'js/game/quiz.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
