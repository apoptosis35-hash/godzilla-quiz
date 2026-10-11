// Offline cache for the game (cache-first for app files, network fallback).
const CACHE = 'kaiju-fighters-v3';
const CORE = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/three.module.min.js',
  'vendor/addons/postprocessing/EffectComposer.js', 'vendor/addons/postprocessing/RenderPass.js', 'vendor/addons/postprocessing/UnrealBloomPass.js',
  'vendor/addons/postprocessing/OutputPass.js', 'vendor/addons/postprocessing/ShaderPass.js', 'vendor/addons/postprocessing/Pass.js', 'vendor/addons/postprocessing/MaskPass.js',
  'vendor/addons/shaders/CopyShader.js', 'vendor/addons/shaders/LuminosityHighPassShader.js', 'vendor/addons/shaders/OutputShader.js',
  'vendor/addons/geometries/RoundedBoxGeometry.js',
  'js/main.js', 'js/story.js', 'js/game.js', 'js/fighter.js', 'js/rig.js', 'js/textures.js', 'js/fx.js', 'js/stage.js', 'js/camera.js', 'js/audio.js',
  'js/input.js', 'js/ai.js', 'js/quality.js', 'js/save.js',
  'js/kaiju/index.js', 'js/kaiju/biped.js', 'js/kaiju/reptile.js', 'js/kaiju/ragnos.js', 'js/kaiju/vorthar.js', 'js/kaiju/mutagon.js', 'js/kaiju/primordon.js', 'js/kaiju/gorvath.js', 'js/kaiju/vespera.js', 'js/kaiju/trivern.js', 'js/kaiju/kurogane.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// network-first (so updates arrive immediately), falling back to cache when offline
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req)),
  );
});
