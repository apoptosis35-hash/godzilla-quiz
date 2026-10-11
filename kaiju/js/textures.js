// Procedural texture generation. Every texture in the game is generated here at
// runtime (no external image assets), so all visuals are original and license-free.
import * as THREE from 'three';

// ---------- noise helpers (tileable) ----------
function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}
function smooth(t) { return t * t * (3 - 2 * t); }
// periodic value noise: period p (integer cells)
export function vnoise(x, y, p, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const m = (a) => ((a % p) + p) % p;
  const a = hash2(m(xi), m(yi), seed), b = hash2(m(xi + 1), m(yi), seed);
  const c = hash2(m(xi), m(yi + 1), seed), d = hash2(m(xi + 1), m(yi + 1), seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, p, oct = 4, seed = 0) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f, p * f, seed + i * 17); n += amp; amp *= 0.5; f *= 2; }
  return s / n;
}
// 3D-ish noise for vertex displacement (non periodic)
export function noise3(x, y, z) {
  const s = Math.sin(x * 1.7 + y * 3.1) * Math.cos(y * 1.3 - z * 2.3) + Math.sin(z * 2.9 + x * 0.7) * 0.5
    + Math.sin((x + y + z) * 4.3) * 0.25;
  return s / 1.75;
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Convert height field (Float32Array size*size, values 0..1) into a normal-map canvas.
function heightToNormal(h, size, strength) {
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
    img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function grayCanvas(h, size, map) {
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = map(h[i], i);
    img.data[i * 4] = v[0]; img.data[i * 4 + 1] = v[1]; img.data[i * 4 + 2] = v[2]; img.data[i * 4 + 3] = v[3] ?? 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function tex(c, repeat = 1, srgb = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const cache = new Map();
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

let TEX_SIZE = 512;
export function setTextureSize(s) { TEX_SIZE = s; }

// Reptile / dragon scales: Voronoi cells with raised centres + rough crevices.
export function scaleMaps(kind = 'reptile', seed = 1) {
  return cached('scale' + kind + seed + TEX_SIZE, () => {
    const size = TEX_SIZE;
    const cells = kind === 'fine' ? 22 : kind === 'plate' ? 9 : 14;
    const pts = [];
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
      pts.push([(i + 0.15 + hash2(i, j, seed) * 0.7) / cells, (j + 0.15 + hash2(i, j, seed + 5) * 0.7) / cells]);
    }
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
      let d1 = 9, d2 = 9;
      for (let oj = -1; oj <= 1; oj++) for (let oi = -1; oi <= 1; oi++) {
        const ii = ((ci + oi) % cells + cells) % cells, jj = ((cj + oj) % cells + cells) % cells;
        const p = pts[jj * cells + ii];
        let px = p[0] + (ci + oi - ii) / cells, py = p[1] + (cj + oj - jj) / cells;
        const d = Math.hypot((u - px), (v - py) * (kind === 'reptile' ? 1.25 : 1));
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      const edge = (d2 - d1) * cells; // 0 at cell borders
      const bump = Math.min(1, edge * 2.2);
      const n = fbm(u * 8, v * 8, 8, 3, seed);
      h[y * size + x] = Math.pow(bump, 0.6) * 0.75 + n * 0.25 - d1 * cells * 0.15;
    }
    const normal = tex(heightToNormal(h, size, kind === 'plate' ? 5 : 3.2));
    const rough = tex(grayCanvas(h, size, (v) => { const g = 255 * (0.95 - v * 0.35); return [g, g, g]; }));
    // AO-ish colour modulation map (white with dark crevices) used as colour map
    const color = tex(grayCanvas(h, size, (v) => { const g = 140 + 115 * Math.min(1, v * 1.3); return [g, g, g]; }), 1, true);
    return { normal, rough, color };
  });
}

// Hard-surface panel lines + rivets for the mecha.
export function panelMaps(seed = 3) {
  return cached('panel' + seed + TEX_SIZE, () => {
    const size = TEX_SIZE;
    const h = new Float32Array(size * size).fill(0.6);
    const rects = [[0, 0, 1, 1]];
    // recursive subdivision
    for (let k = 0; k < 7; k++) {
      const r = rects.shift();
      const vert = hash2(k, 1, seed) > 0.5;
      const t = 0.3 + hash2(k, 2, seed) * 0.4;
      if (vert) rects.push([r[0], r[1], r[2] * t, r[3]], [r[0] + r[2] * t, r[1], r[2] * (1 - t), r[3]]);
      else rects.push([r[0], r[1], r[2], r[3] * t], [r[0], r[1] + r[3] * t, r[2], r[3] * (1 - t)]);
    }
    const lw = 2.5 / size;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let val = 0.6 + (fbm(u * 6, v * 6, 6, 3, seed) - 0.5) * 0.06;
      for (const r of rects) {
        const dx = Math.min(Math.abs(u - r[0]), Math.abs(u - (r[0] + r[2])));
        const dy = Math.min(Math.abs(v - r[1]), Math.abs(v - (r[1] + r[3])));
        const inside = u >= r[0] && u <= r[0] + r[2] && v >= r[1] && v <= r[1] + r[3];
        if (inside && (dx < lw || dy < lw)) val = 0.1;
        // rivets near corners
        if (inside) {
          for (const cx of [r[0] + 0.02, r[0] + r[2] - 0.02]) for (const cy of [r[1] + 0.02, r[1] + r[3] - 0.02]) {
            const d = Math.hypot(u - cx, v - cy) * size;
            if (d < 3) val = Math.max(val, 0.95 - d * 0.1);
          }
        }
      }
      h[y * size + x] = val;
    }
    const normal = tex(heightToNormal(h, size, 4));
    const rough = tex(grayCanvas(h, size, (v, i) => { const g = 90 + (1 - v) * 120 + hash2(i, 7, seed) * 30; return [g, g, g]; }));
    const color = tex(grayCanvas(h, size, (v) => { const g = v < 0.2 ? 90 : 235 + (v - 0.6) * 40; return [g, g, g]; }), 1, true);
    return { normal, rough, color };
  });
}

// Chitin: smooth shell with fine pores and banding (insect).
export function chitinMaps(seed = 9) {
  return cached('chitin' + seed + TEX_SIZE, () => {
    const size = TEX_SIZE;
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const band = Math.pow(Math.abs(Math.sin(v * Math.PI * 6)), 0.25);
      const pores = fbm(u * 24, v * 24, 24, 2, seed);
      h[y * size + x] = band * 0.7 + pores * 0.3;
    }
    const normal = tex(heightToNormal(h, size, 2.5));
    const rough = tex(grayCanvas(h, size, (v) => { const g = 60 + (1 - v) * 90; return [g, g, g]; }));
    const color = tex(grayCanvas(h, size, (v) => { const g = 170 + v * 85; return [g, g, g]; }), 1, true);
    return { normal, rough, color };
  });
}

// Insect wing membrane with veins. Returns colour+alpha.
export function wingTexture() {
  return cached('wing' + TEX_SIZE, () => {
    const size = Math.min(512, TEX_SIZE);
    const c = canvas(size), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, 'rgba(140,255,220,0.55)');
    g.addColorStop(0.5, 'rgba(120,160,255,0.35)');
    g.addColorStop(1, 'rgba(255,140,220,0.4)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(20,40,30,0.9)';
    for (let i = 0; i < 14; i++) {
      ctx.lineWidth = i % 3 === 0 ? 3 : 1.2;
      ctx.beginPath(); ctx.moveTo(0, size * (i / 14));
      ctx.bezierCurveTo(size * 0.3, size * (i / 14) + 20, size * 0.6, size * (i / 14) - 15, size, size * (i / 14) + 10);
      ctx.stroke();
    }
    for (let i = 0; i < 60; i++) {
      ctx.lineWidth = 0.8;
      const x = hash2(i, 1) * size, y = hash2(i, 2) * size;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (hash2(i, 3) - 0.5) * 50, y + 30); ctx.stroke();
    }
    const t = tex(c, 1, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// Compound eye: hex cells, emissive.
export function hexEyeTexture() {
  return cached('hex', () => {
    const size = 256, c = canvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = '#022'; ctx.fillRect(0, 0, size, size);
    const r = 9;
    for (let y = 0; y < size + r; y += r * 1.5) for (let x = 0; x < size + r; x += r * Math.sqrt(3)) {
      const ox = (Math.round(y / (r * 1.5)) % 2) * r * Math.sqrt(3) / 2;
      const gr = ctx.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      gr.addColorStop(0, '#bfffef'); gr.addColorStop(0.6, '#1fc8b0'); gr.addColorStop(1, '#013');
      ctx.fillStyle = gr; ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + Math.PI / 6; ctx.lineTo(x + ox + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); }
      ctx.fill();
    }
    return tex(c, 2, true);
  });
}

// Building facade: colour + emissive window grid.
export function facadeTextures(style = 0, lit = 0.45) {
  return cached('facade' + style + lit, () => {
    const size = 256;
    const col = canvas(size), em = canvas(size);
    const a = col.getContext('2d'), b = em.getContext('2d');
    const palettes = [['#2a2e36', '#3b4150'], ['#3a3530', '#4c463f'], ['#22303a', '#2f4250'], ['#403c44', '#55505a']];
    const p = palettes[style % palettes.length];
    a.fillStyle = p[0]; a.fillRect(0, 0, size, size);
    b.fillStyle = '#000'; b.fillRect(0, 0, size, size);
    const cols = 8, rows = 16, cw = size / cols, rh = size / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = i * cw + cw * 0.18, y = j * rh + rh * 0.22, w = cw * 0.64, h = rh * 0.56;
      a.fillStyle = p[1]; a.fillRect(x - 1, y - 1, w + 2, h + 2);
      a.fillStyle = '#10141a'; a.fillRect(x, y, w, h);
      const r = hash2(i, j, style * 13);
      if (r < lit) {
        const warm = hash2(i, j, 99) > 0.4;
        b.fillStyle = warm ? `rgba(255,${200 + r * 50 | 0},130,1)` : 'rgba(170,220,255,1)';
        b.globalAlpha = 0.45 + r;
        b.fillRect(x, y, w, h);
        b.globalAlpha = 1;
      }
    }
    // horizontal floor bands
    a.fillStyle = 'rgba(0,0,0,0.25)';
    for (let j = 0; j < rows; j++) a.fillRect(0, j * rh, size, 1.5);
    return { map: tex(col, 1, true), emissive: tex(em, 1, true) };
  });
}

export function groundTextures(kind = 'city') {
  return cached('ground' + kind, () => {
    const size = 1024;
    const c = canvas(size), ctx = c.getContext('2d');
    const h = new Float32Array(size * size);
    if (kind === 'city' || kind === 'harbor' || kind === 'industrial') {
      ctx.fillStyle = kind === 'industrial' ? '#2b2b28' : '#26272b'; ctx.fillRect(0, 0, size, size);
      const img = ctx.getImageData(0, 0, size, size);
      for (let i = 0; i < size * size; i++) {
        const n = hash2(i % size, (i / size) | 0, 4) * 26 - 13;
        img.data[i * 4] += n; img.data[i * 4 + 1] += n; img.data[i * 4 + 2] += n;
        h[i] = 0.5 + n / 60;
      }
      ctx.putImageData(img, 0, 0);
      // road grid: lanes every 1/4
      ctx.fillStyle = '#3a3a3a';
      for (let k = 0; k < 4; k++) { ctx.fillRect(k * size / 4 + size / 8 - 60, 0, 120, size); ctx.fillRect(0, k * size / 4 + size / 8 - 60, size, 120); }
      ctx.strokeStyle = 'rgba(230,220,180,0.7)'; ctx.lineWidth = 4; ctx.setLineDash([30, 26]);
      for (let k = 0; k < 4; k++) {
        const o = k * size / 4 + size / 8;
        ctx.beginPath(); ctx.moveTo(o, 0); ctx.lineTo(o, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, o); ctx.lineTo(size, o); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(240,240,240,0.65)'; ctx.lineWidth = 6;
      for (let k = 0; k < 4; k++) { // crosswalks
        const o = k * size / 4 + size / 8;
        for (let s = -50; s <= 50; s += 16) { ctx.beginPath(); ctx.moveTo(o + s, o + 70); ctx.lineTo(o + s, o + 100); ctx.stroke(); }
      }
    } else { // volcanic / island rock
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fbm(x / size * 8, y / size * 8, 8, 5, 11);
      const img = ctx.createImageData(size, size);
      for (let i = 0; i < size * size; i++) {
        const v = h[i];
        const lava = kind === 'volcano' && v < 0.36;
        img.data[i * 4] = lava ? 255 : 40 + v * 60;
        img.data[i * 4 + 1] = lava ? 80 + v * 200 : 34 + v * 50;
        img.data[i * 4 + 2] = lava ? 10 : 30 + v * 40;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }
    const map = tex(c, 1, true);
    map.anisotropy = 8;
    const small = 256, hs = new Float32Array(small * small);
    for (let y = 0; y < small; y++) for (let x = 0; x < small; x++) hs[y * small + x] = h[(y * 4) * size + x * 4];
    const normal = tex(heightToNormal(hs, small, kind === 'volcano' ? 6 : 1.5));
    return { map, normal };
  });
}

// Soft particle sprites
export function spriteTexture(kind = 'soft') {
  return cached('sprite' + kind, () => {
    const size = 128, c = canvas(size), ctx = c.getContext('2d');
    if (kind === 'soft') {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    } else if (kind === 'smoke') {
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - 64, y - 64) / 64;
        const n = fbm(x / 32, y / 32, 4, 4, 21);
        const a = Math.max(0, 1 - d * (1.1 + (0.5 - n))) * (0.5 + n);
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, a * 255);
      }
      ctx.putImageData(img, 0, 0);
    } else if (kind === 'ring') {
      const g = ctx.createRadialGradient(64, 64, 30, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    } else if (kind === 'crack') {
      ctx.strokeStyle = 'rgba(0,0,0,0.95)'; ctx.lineCap = 'round';
      const branch = (x, y, a, len, w, d) => {
        if (d > 5 || len < 4) return;
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
        branch(x2, y2, a + (Math.random() - 0.5) * 0.9, len * 0.75, w * 0.7, d + 1);
        if (Math.random() < 0.5) branch(x2, y2, a + (Math.random() - 0.5) * 2, len * 0.5, w * 0.5, d + 2);
      };
      for (let i = 0; i < 9; i++) branch(64, 64, i / 9 * Math.PI * 2 + Math.random() * 0.4, 14 + Math.random() * 8, 4, 0);
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 30);
      g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// Night sky gradient with stars / sunset etc.
export function skyTexture(top, mid, bottom, stars = 0) {
  return cached('sky' + top + mid + bottom + stars, () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, top); g.addColorStop(0.55, mid); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 512);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// Glowing cracks (emissive map) for magma-veined skin
export function crackTexture(seed = 3) {
  return cached('crack-em' + seed, () => {
    const size = 512, c = canvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
    let r = seed * 9301 + 49297;
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    ctx.lineCap = 'round';
    const branch = (x, y, a, len, w, d) => {
      if (d > 6 || len < 3) return;
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      for (const [ww, col] of [[w * 3, 'rgba(255,40,0,0.25)'], [w, 'rgba(255,90,20,1)'], [w * 0.4, 'rgba(255,220,160,1)']]) {
        ctx.strokeStyle = col; ctx.lineWidth = ww;
        for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x2 + ox, y2 + oy); ctx.stroke(); }
      }
      branch(x2, y2, a + (rnd() - 0.5) * 0.9, len * 0.85, w * 0.85, d + 1);
      if (rnd() < 0.45) branch(x2, y2, a + (rnd() - 0.5) * 2.2, len * 0.6, w * 0.6, d + 2);
    };
    for (let i = 0; i < 14; i++) branch(rnd() * size, rnd() * size, rnd() * Math.PI * 2, 18 + rnd() * 20, 3, 0);
    return tex(c, 1, true);
  });
}
