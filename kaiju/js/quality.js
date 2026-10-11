// Graphics quality presets + device detection.
export const PRESETS = {
  ULTRA: { level: 3, pixelRatio: 2, shadows: true, shadowSize: 2048, bloom: true, bloomRes: 1, particles: 4000, debris: 420, detail: 1.3, fxMul: 1, decals: 40, aa: true, tex: 1024 },
  HIGH: { level: 2, pixelRatio: 1.5, shadows: true, shadowSize: 1024, bloom: true, bloomRes: 0.5, particles: 2600, debris: 260, detail: 1.0, fxMul: 0.85, decals: 28, aa: true, tex: 512 },
  MEDIUM: { level: 1, pixelRatio: 1.25, shadows: true, shadowSize: 1024, bloom: true, bloomRes: 0.35, particles: 1500, debris: 150, detail: 0.8, fxMul: 0.6, decals: 18, aa: false, tex: 512 },
  LOW: { level: 0, pixelRatio: 0.9, shadows: false, shadowSize: 512, bloom: false, bloomRes: 0.3, particles: 800, debris: 60, detail: 0.6, fxMul: 0.35, decals: 10, aa: false, tex: 256 },
};
export function isMobile() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod|Android/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
}
export function autoPreset() {
  if (isMobile()) return 'MEDIUM';
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? 'HIGH' : 'MEDIUM';
}
export function resolveQuality(name) {
  const key = name === 'AUTO' ? autoPreset() : name;
  const q = { ...(PRESETS[key] || PRESETS.HIGH), name: key };
  q.pixelRatio = Math.min(q.pixelRatio, window.devicePixelRatio || 1);
  return q;
}
