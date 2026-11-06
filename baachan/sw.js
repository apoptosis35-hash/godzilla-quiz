// Offline cache: serve from cache instantly, refresh the cache in the background.
const CACHE = 'baachan-v3';
// The town models and textures under ../uminagi-assets/ are cached as they are fetched.
const CORE = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png',
  'icons/icon-512.png', 'js/main.js', 'js/assets.js', 'js/world.js', 'js/fx.js', 'js/save.js',
  'js/audio.js', 'vendor/three.module.min.js', 'vendor/addons/loaders/GLTFLoader.js', 'vendor/addons/libs/meshopt_decoder.module.js', 'vendor/addons/utils/BufferGeometryUtils.js', 'vendor/addons/environments/RoomEnvironment.js',
  'models/boxes.glb', 'models/bucket.glb', 'models/cone.glb', 'models/daruma.glb', 'models/eggs.glb', 'models/granny.glb',
  'models/jii.glb', 'models/kid.glb', 'models/kouji.glb', 'models/pigeon.glb', 'models/police.glb', 'models/ramp.glb',
  'models/salaryman.glb', 'models/sale.glb', 'models/scooter.glb', 'models/tanuki.glb', 'models/watermelons.glb',
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
