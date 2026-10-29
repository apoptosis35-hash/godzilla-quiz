// Paintings: each one is drawn procedurally on a canvas from its style (kind, palette, seed). Forgeries are the
// same picture with the colours turned and one detail changed. The merchant cat sells them, the owl only takes
// genuine ones, and they hang in the exhibition room or stand on an easel at home.
import * as THREE from 'three';
import { ITEMS, ICON, ICON_BY_ID, seeded } from './state.js';
import { ART } from './data3.js';

for (const a of ART) {
  ITEMS[a.id] = { ...a, fake: false, fakeInfo: a.fake, kind: 'art', w: 0.7, d: 0.6, where: 'both', model: 'furn_easel' };
  ITEMS[a.id + '_fake'] = { ...a, id: a.id + '_fake', real: a.id, fake: true, fakeInfo: a.fake, kind: 'art', price: Math.round(a.price / 2), w: 0.7, d: 0.6, where: 'both', model: 'furn_easel' };
}
ICON.art = '🖼️';
void ICON_BY_ID;
export const realArt = (id) => ITEMS[id]?.real || id;
export const isFake = (id) => ITEMS[id]?.fake === true;

const cache = new Map();
// a painting as a canvas texture (cached per id)
export function paintingTexture(id) {
  if (cache.has(id)) return cache.get(id);
  const cv = paint(id), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  cache.set(id, tex); return tex;
}
export function paintingURL(id) { return paint(id).toDataURL('image/jpeg', 0.85); }

function paint(id) {
  const it = ITEMS[id], a = ITEMS[realArt(id)], W = 320, H = 240, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), r = seeded('art' + a.style.seed), P = a.style.palette;
  const fake = it.fake, k = a.style.kind;
  const col = (i, l = 0) => { const c = new THREE.Color(P[i % P.length]); if (l) c.offsetHSL(0, 0, l); return '#' + c.getHexString(); };
  const grad = (y0, y1, c0, c1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(0, y0, W, y1 - y0); };
  const blob = (x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
  const ridge = (y, amp, c, freq = 0.02) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 8) g.lineTo(x, y - Math.abs(Math.sin(x * freq + r() * 0.4)) * amp - r() * amp * 0.3); g.lineTo(W, H); g.fill(); };
  const horizon = H * (0.45 + r() * 0.15);
  switch (k) {
    case 'sea': case 'harbour': case 'sunset': {
      grad(0, horizon, col(0), col(1)); grad(horizon, H, col(2), col(3, -0.15));
      const sx = W * (0.2 + r() * 0.6), sy = horizon - 30 - r() * 40; blob(sx, sy, 22, 22, k === 'sunset' ? '#ffd27a' : '#fff6d8');
      g.globalAlpha = 0.5; for (let i = 0; i < 40; i++) { const y = horizon + 6 + i * 4 + r() * 3; g.fillStyle = i % 2 ? col(1, 0.1) : col(3, 0.1); g.fillRect(sx - 30 + r() * 20 - i * 1.2, y, 50 + i * 2.4, 2); } g.globalAlpha = 1;
      if (k === 'harbour') for (let i = 0; i < 6; i++) { const x = 20 + i * 50 + r() * 20, h = 18 + r() * 26; g.fillStyle = col(i, -0.2); g.fillRect(x, horizon - h, 28, h); g.fillStyle = col(i + 1, 0.15); g.beginPath(); g.moveTo(x - 4, horizon - h); g.lineTo(x + 14, horizon - h - 12); g.lineTo(x + 32, horizon - h); g.fill(); }
      for (let i = 0; i < 3; i++) { const bx = 40 + r() * (W - 80), by = horizon + 14 + r() * 50; g.fillStyle = '#3a2a20'; g.beginPath(); g.moveTo(bx - 16, by); g.lineTo(bx + 16, by); g.lineTo(bx + 11, by + 6); g.lineTo(bx - 11, by + 6); g.fill(); g.fillRect(bx - 1, by - 18, 2, 18); g.fillStyle = '#f4efe2'; g.beginPath(); g.moveTo(bx + 1, by - 17); g.lineTo(bx + 12, by - 3); g.lineTo(bx + 1, by - 3); g.fill(); }
      break;
    }
    case 'mountain': case 'snow': {
      grad(0, horizon, col(0), col(1)); ridge(horizon, 90, col(2, -0.1), 0.012);
      g.fillStyle = '#f6f6f2'; g.beginPath(); const px = W * (0.3 + r() * 0.4); g.moveTo(px - 70, horizon - 40); g.lineTo(px, horizon - 120); g.lineTo(px + 70, horizon - 40); g.lineTo(px + 30, horizon - 60); g.lineTo(px, horizon - 50); g.lineTo(px - 30, horizon - 62); g.fill();
      ridge(horizon + 30, 40, col(3, -0.15), 0.03); grad(horizon + 40, H, k === 'snow' ? '#f2f4f6' : col(1, -0.1), k === 'snow' ? '#d8dee6' : col(3, -0.25));
      if (k === 'snow') { g.fillStyle = '#fff'; for (let i = 0; i < 140; i++) blob(r() * W, r() * H, 1.5, 1.5, '#ffffff'); }
      break;
    }
    case 'night': {
      grad(0, H, col(0, -0.2), col(1)); g.fillStyle = '#fff8e0'; for (let i = 0; i < 90; i++) g.fillRect(r() * W, r() * horizon, 1.5, 1.5);
      const mx = W * (0.2 + r() * 0.6), my = 40 + r() * 40; blob(mx, my, 20, 20, '#fff4c8'); blob(mx + 8, my - 4, 16, 16, col(0, -0.2));
      if (fake) { blob(W - mx, my + 10, 14, 14, '#fff4c8'); }   // a forgery with two moons
      ridge(horizon + 40, 30, col(2, -0.2)); for (let i = 0; i < 8; i++) blob(20 + i * 40 + r() * 10, horizon + 30 + r() * 20, 3, 3, '#ffd27a');
      grad(horizon + 60, H, col(3, -0.25), col(3, -0.35));
      break;
    }
    case 'flowers': case 'forest': {
      grad(0, H, col(0, 0.1), col(1)); if (k === 'forest') ridge(horizon, 50, col(2, -0.2));
      for (let i = 0; i < (k === 'forest' ? 26 : 60); i++) {
        const x = r() * W, y = horizon * 0.6 + r() * (H - horizon * 0.6);
        if (k === 'forest') { g.fillStyle = col(2 + (i % 2), -0.1 - r() * 0.1); g.beginPath(); g.moveTo(x, y - 60); g.lineTo(x - 18, y); g.lineTo(x + 18, y); g.fill(); g.fillStyle = '#4a3020'; g.fillRect(x - 2, y, 4, 10); }
        else { g.strokeStyle = '#4a7a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 30); g.stroke(); for (let p = 0; p < 5; p++) blob(x + Math.cos(p * 1.26) * 6, y + Math.sin(p * 1.26) * 6, 5, 5, col(2 + (i % 2), 0.05)); blob(x, y, 3, 3, '#ffe27a'); }
      }
      break;
    }
    case 'portrait': {
      grad(0, H, col(0), col(1, -0.1)); blob(W / 2, H * 0.95, 80, 70, col(2)); blob(W / 2, H * 0.45, 48, 54, col(3, 0.15));
      blob(W / 2 - 34, H * 0.22, 14, 22, col(3, 0.1)); blob(W / 2 + 34, H * 0.22, 14, 22, col(3, 0.1));
      blob(W / 2 - 16, H * 0.43, 5, 6, '#2a2020'); blob(W / 2 + 16, H * 0.43, 5, 6, '#2a2020'); blob(W / 2, H * 0.53, 6, 4, '#3a2a2a');
      if (fake) { g.strokeStyle = '#3a2a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2 - 20, H * 0.6); g.lineTo(W / 2 + 20, H * 0.6); g.stroke(); }   // a forger's straight mouth
      break;
    }
    default: {   // abstract
      grad(0, H, col(0, 0.15), col(1, 0.05));
      for (let i = 0; i < 14; i++) { g.globalAlpha = 0.75; if (r() < 0.5) blob(r() * W, r() * H, 10 + r() * 50, 10 + r() * 50, col(i)); else { g.fillStyle = col(i + 1); g.fillRect(r() * W, r() * H, 20 + r() * 90, 6 + r() * 40); } }
      g.globalAlpha = 1;
    }
  }
  // brush texture
  g.globalAlpha = 0.07; for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? '#ffffff' : '#000000'; g.fillRect(r() * W, r() * H, 6 + r() * 10, 1.5); } g.globalAlpha = 1;
  if (fake) {   // the forgery: colours turned and mirrored
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const t = tmp.getContext('2d');
    t.filter = `hue-rotate(${a.fakeInfo?.hue || 30}deg) saturate(1.2)`; t.translate(W, 0); t.scale(-1, 1); t.drawImage(cv, 0, 0);
    g.clearRect(0, 0, W, H); g.drawImage(tmp, 0, 0);
  }
  return cv;
}

// put the painting onto a model's `home_canvas` material (easel at home, frame in the gallery)
export function hangPainting(obj, id) {
  const tex = paintingTexture(id);
  obj.traverse((m) => { if (m.isMesh && m.material?.name === 'home_canvas') { m.material = new THREE.MeshStandardMaterial({ name: 'home_canvas', map: tex, roughness: 0.85 }); } });
  return obj;
}
export { ART };
