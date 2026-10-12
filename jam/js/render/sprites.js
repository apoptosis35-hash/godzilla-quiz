// Pre-rendered vehicle sprites (top view, "miniature model" look) and glow
// sprites. Drawing a cached bitmap per vehicle keeps the frame cheap.

export const PX = 10; // sprite pixels per metre (before device scaling)

export const CAR_COLORS = ['#f2f4f7', '#c9ced6', '#2b2f36', '#d8443c', '#2f6fd6', '#e8b33a', '#3a9a6b', '#8a5bd1', '#6b7a8c'];

// speed colour scale: v / vRef
export function heatColor(r) {
  r = Math.max(0, Math.min(1.1, r));
  const stops = [[0, [140, 14, 40]], [0.15, [230, 46, 58]], [0.38, [255, 138, 50]], [0.62, [255, 214, 64]], [0.85, [64, 220, 130]], [1.1, [52, 230, 160]]];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i], [b, cb] = stops[i + 1];
    if (r <= b) { const f = (r - a) / (b - a); return `rgb(${(ca[0] + (cb[0] - ca[0]) * f) | 0},${(ca[1] + (cb[1] - ca[1]) * f) | 0},${(ca[2] + (cb[2] - ca[2]) * f) | 0})`; }
  }
  return 'rgb(52,230,160)';
}
export const HEAT_BUCKETS = 16;
export function heatBucket(r) { return Math.max(0, Math.min(HEAT_BUCKETS - 1, Math.round((Math.min(1.1, Math.max(0, r)) / 1.1) * (HEAT_BUCKETS - 1)))); }

const cache = new Map();
let scale = 2;
export function setSpriteScale(s) { if (s !== scale) { scale = s; cache.clear(); } }

function shade(hex, f) {
  let r, g, b;
  if (hex.startsWith('rgb')) [r, g, b] = hex.match(/\d+/g).map(Number);
  else { const n = parseInt(hex.slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
  const k = (x) => Math.max(0, Math.min(255, Math.round(f > 0 ? x + (255 - x) * f : x * (1 + f))));
  return `rgb(${k(r)},${k(g)},${k(b)})`;
}

function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// sprite: vehicle pointing to +x, centre of the body at the canvas centre
export function vehicleSprite(cls, len, wid, color, av) {
  const key = `${cls}|${len}|${color}|${av ? 1 : 0}`;
  let s = cache.get(key);
  if (s) return s;
  const k = PX * scale;
  const pad = 0.9;
  const W = Math.ceil((len + pad * 2) * k), H = Math.ceil((wid + pad * 2) * k);
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const c = cv.getContext('2d');
  c.translate(W / 2, H / 2); c.scale(k, k);
  const L = len, Wd = wid;
  // soft contact shadow (light from upper left)
  c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 0.35 * k; c.shadowOffsetX = 0.2 * k; c.shadowOffsetY = 0.28 * k;
  c.fillStyle = 'rgba(0,0,0,0.35)'; rr(c, -L / 2 + 0.05, -Wd / 2 + 0.05, L - 0.1, Wd - 0.1, 0.5); c.fill(); c.restore();
  // wheels
  c.fillStyle = '#121418';
  const wx = cls === 'car' ? [L * 0.3, -L * 0.3] : [L * 0.36, -L * 0.18, -L * 0.36];
  for (const x of wx) { c.fillRect(x - 0.38, -Wd / 2 - 0.08, 0.76, 0.28); c.fillRect(x - 0.38, Wd / 2 - 0.2, 0.76, 0.28); }
  const body = (x, y, w, h, r, col) => {
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(col, 0.35)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.35));
    c.fillStyle = g; rr(c, x, y, w, h, r); c.fill();
    c.strokeStyle = shade(col, -0.5); c.lineWidth = 0.06; c.stroke();
  };
  if (cls === 'car') {
    body(-L / 2, -Wd / 2, L, Wd, 0.55, color);
    // cabin glass + roof
    c.fillStyle = '#1c2a3a'; rr(c, -L * 0.22, -Wd * 0.4, L * 0.5, Wd * 0.8, 0.35); c.fill();
    const gl = c.createLinearGradient(L * 0.05, 0, L * 0.28, 0); gl.addColorStop(0, 'rgba(140,200,255,0.15)'); gl.addColorStop(1, 'rgba(160,215,255,0.55)');
    c.fillStyle = gl; rr(c, L * 0.08, -Wd * 0.36, L * 0.18, Wd * 0.72, 0.2); c.fill();
    body(-L * 0.17, -Wd * 0.34, L * 0.3, Wd * 0.68, 0.3, color);
    // head lights (front = +x) and tail light housings
    c.fillStyle = '#fff6d6'; c.fillRect(L / 2 - 0.18, -Wd / 2 + 0.15, 0.14, 0.38); c.fillRect(L / 2 - 0.18, Wd / 2 - 0.53, 0.14, 0.38);
    c.fillStyle = '#5a0d12'; c.fillRect(-L / 2 + 0.03, -Wd / 2 + 0.12, 0.14, 0.4); c.fillRect(-L / 2 + 0.03, Wd / 2 - 0.52, 0.14, 0.4);
  } else if (cls === 'truck') {
    // cab
    body(L / 2 - 2.1, -Wd / 2 + 0.05, 2.1, Wd - 0.1, 0.45, shade(color, -0.05));
    c.fillStyle = '#1c2a3a'; c.fillRect(L / 2 - 0.75, -Wd * 0.38, 0.5, Wd * 0.76);
    // cargo box
    body(-L / 2, -Wd / 2, L - 2.35, Wd, 0.2, '#e9edf2');
    c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 0.05;
    for (let x = -L / 2 + 1; x < L / 2 - 2.5; x += 1) { c.beginPath(); c.moveTo(x, -Wd / 2 + 0.1); c.lineTo(x, Wd / 2 - 0.1); c.stroke(); }
    c.fillStyle = color; c.fillRect(-L / 2 + 0.3, -0.18, L - 3, 0.36);
    c.fillStyle = '#5a0d12'; c.fillRect(-L / 2 + 0.02, -Wd / 2 + 0.1, 0.12, 0.45); c.fillRect(-L / 2 + 0.02, Wd / 2 - 0.55, 0.12, 0.45);
  } else {
    body(-L / 2, -Wd / 2, L, Wd, 0.6, '#f4f6f2');
    c.fillStyle = color; c.fillRect(-L / 2 + 0.2, -Wd / 2 + 0.05, L - 0.4, 0.35); c.fillRect(-L / 2 + 0.2, Wd / 2 - 0.4, L - 0.4, 0.35);
    c.fillStyle = 'rgba(30,45,60,0.55)';
    for (let x = -L / 2 + 1.2; x < L / 2 - 1.2; x += 1.25) rr(c, x, -Wd * 0.3, 0.9, Wd * 0.6, 0.15), c.fill();
    c.fillStyle = '#1c2a3a'; c.fillRect(L / 2 - 0.7, -Wd * 0.4, 0.45, Wd * 0.8);
  }
  if (av) {
    // roof sensor and cyan trim of automated vehicles
    c.fillStyle = '#0b1220'; c.beginPath(); c.arc(-L * 0.02, 0, 0.32, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#3fe0ff'; c.lineWidth = 0.14; c.stroke();
    c.strokeStyle = 'rgba(63,224,255,0.9)'; c.lineWidth = 0.12; rr(c, -L / 2 + 0.06, -Wd / 2 + 0.06, L - 0.12, Wd - 0.12, 0.5); c.stroke();
  }
  s = { cv, w: W / k, h: H / k };
  cache.set(key, s);
  return s;
}

// radial glow sprite (for brake lights, blinkers, headlights, lamps)
export function glowSprite(rgb, size = 64) {
  const key = 'glow|' + rgb + '|' + size;
  let s = cache.get(key);
  if (s) return s;
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.25, `rgba(${rgb},0.6)`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  s = { cv };
  cache.set(key, s);
  return s;
}

// headlight cone pointing to +x from the origin
export function beamSprite() {
  const key = 'beam';
  let s = cache.get(key);
  if (s) return s;
  const W = 160, H = 90;
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(0, H / 2, 4, 0, H / 2, W);
  g.addColorStop(0, 'rgba(255,240,200,0.55)'); g.addColorStop(1, 'rgba(255,240,200,0)');
  c.fillStyle = g; c.beginPath(); c.moveTo(0, H / 2 - 6); c.lineTo(W, 0); c.lineTo(W, H); c.lineTo(0, H / 2 + 6); c.closePath(); c.fill();
  s = { cv, W, H };
  cache.set(key, s);
  return s;
}

export function treeSprite(variant) {
  const key = 'tree' + variant + '|' + scale;
  let s = cache.get(key);
  if (s) return s;
  const R = 3 + variant * 0.8, k = PX * scale * 0.6;
  const S = Math.ceil((R * 2 + 3) * k);
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
  const c = cv.getContext('2d');
  c.translate(S / 2, S / 2); c.scale(k, k);
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(0.9, 1.1, R, R * 0.92, 0, 0, Math.PI * 2); c.fill();
  const g = c.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
  const hues = [['#3f8f6a', '#1d4d3c'], ['#4f9a5c', '#21503a'], ['#2f7f74', '#173f43']][variant % 3];
  g.addColorStop(0, hues[0]); g.addColorStop(1, hues[1]);
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fill();
  s = { cv, r: R + 1.5 };
  cache.set(key, s);
  return s;
}
