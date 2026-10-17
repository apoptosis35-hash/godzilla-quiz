// Offline cache: serve from cache instantly, refresh the cache in the background.
// The models and three.js are shared with the model stock in ../inaka-assets.
const CACHE = 'inaka-natsu-v1';
const A = '../inaka-assets/';
const CORE = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'js/main.js', 'js/world.js', 'js/input.js', 'js/audio.js',
  A + 'vendor/three.module.min.js', A + 'vendor/addons/loaders/GLTFLoader.js', A + 'vendor/addons/utils/BufferGeometryUtils.js',
  A + 'glb/michi.glb', A + 'glb/road.glb', A + 'glb/kawa.glb', A + 'glb/hashi.glb', A + 'glb/suisha.glb', A + 'glb/jizo.glb', A + 'glb/hasakake.glb', A + 'glb/kominka.glb', A + 'glb/kura.glb', A + 'glb/naya.glb', A + 'glb/ido.glb', A + 'glb/kaki_tree.glb', A + 'glb/tanuki.glb', A + 'glb/monohoshi.glb', A + 'glb/jitensha.glb', A + 'glb/kounki.glb', A + 'glb/tanbo.glb', A + 'glb/kakashi.glb', A + 'glb/take_gaki.glb', A + 'glb/dagashiya.glb', A + 'glb/obaachan.glb', A + 'glb/jihanki.glb', A + 'glb/post.glb', A + 'glb/bench.glb', A + 'glb/minka.glb', A + 'glb/keitora.glb', A + 'glb/bus_stop.glb', A + 'glb/curve_mirror.glb', A + 'glb/denchu.glb', A + 'glb/kousha.glb', A + 'glb/sakura.glb', A + 'glb/himawari.glb', A + 'glb/hatake.glb', A + 'glb/ishidan.glb', A + 'glb/torii.glb', A + 'glb/honden.glb', A + 'glb/ishidoro.glb', A + 'glb/yatai.glb', A + 'glb/chochin_post.glb', A + 'glb/sugi.glb', A + 'glb/hokora.glb', A + 'glb/eki.glb', A + 'glb/densha.glb', A + 'glb/take.glb', A + 'glb/rock.glb', A + 'glb/bush.glb', A + 'glb/ushi.glb', A + 'glb/niwatori.glb', A + 'glb/neko.glb', A + 'glb/shiba.glb', A + 'glb/kodomo.glb', A + 'glb/suika.glb', A + 'glb/kabuto.glb',
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
