// Low-poly models built from primitives: granny, grandchild, city props, obstacles and characters.
import * as THREE from 'three';

// ---------- materials ----------
const grad = (() => {
  const d = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const matCache = new Map();
export function mat(color, opt = {}) {
  const key = color + JSON.stringify(opt);
  if (!opt.map && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: grad, ...opt });
  if (!opt.map) matCache.set(key, m);
  return m;
}
const basicCache = new Map();
export function basic(color, opt = {}) { const k = color + JSON.stringify(opt); if (!basicCache.has(k)) basicCache.set(k, new THREE.MeshBasicMaterial({ color, ...opt })); return basicCache.get(k); }

// ---------- canvas textures ----------
export function textTex(lines, o = {}) {
  const w = o.w || 512, h = o.h || 128;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = o.bg || '#fff'; g.fillRect(0, 0, w, h);
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = o.bw || 10; g.strokeRect(o.bw / 2 || 5, o.bw / 2 || 5, w - (o.bw || 10), h - (o.bw || 10)); }
  const arr = Array.isArray(lines) ? lines : [lines];
  const fs = o.size || Math.floor(h / (arr.length + 0.3) * 0.8);
  g.font = `900 ${fs}px "Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  arr.forEach((s, i) => {
    const y = h / 2 + (i - (arr.length - 1) / 2) * fs * 1.08;
    if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = fs * 0.18; g.strokeText(s, w / 2, y, w * 0.92); }
    g.fillStyle = (o.colors && o.colors[i]) || o.fg || '#222';
    g.fillText(s, w / 2, y, w * 0.92);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}

export const TEX = {};
export function initTextures() {
  TEX.road = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#4a4d55'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random() * .07})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#f2f2f2'; // dashed lane lines at 1/3 and 2/3
    for (const x of [w / 3, 2 * w / 3]) g.fillRect(x - 3, 0, 6, h * 0.5);
    g.fillStyle = '#ffd23f'; g.fillRect(4, 0, 5, h); g.fillRect(w - 9, 0, 5, h);
  }, true);
  TEX.walk = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#c9c0b4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a99f92'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke(); }
    g.fillStyle = '#f2d24b'; g.fillRect(40, 0, 48, h); // tactile paving
    g.fillStyle = '#d8b836'; for (let y = 6; y < h; y += 14) for (let x = 46; x < 88; x += 14) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  }, true);
  TEX.win = canvasTex(64, 64, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#3d5a80'; g.fillRect(12, 14, 40, 30);
    g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(14, 16, 12, 26);
    g.fillStyle = '#d0d0d0'; g.fillRect(8, 46, 48, 4);
  }, true);
  const draw = (fn) => canvasTex(64, 64, fn);
  TEX.puff = draw((g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  TEX.feather = draw((g) => { g.fillStyle = '#eef'; g.beginPath(); g.ellipse(32, 32, 9, 26, .5, 0, 7); g.fill(); g.strokeStyle = '#99a'; g.lineWidth = 2; g.beginPath(); g.moveTo(20, 54); g.lineTo(44, 10); g.stroke(); });
  TEX.star = draw((g) => { g.fillStyle = '#ffe04a'; g.strokeStyle = '#c88a00'; g.lineWidth = 3; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 12 : 28; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke(); });
  TEX.heart = draw((g) => { g.fillStyle = '#ff5c8a'; g.font = '52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♥', 32, 36); });
  TEX.yolk = draw((g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 26, 0, 7); g.fill(); g.fillStyle = '#ffb300'; g.beginPath(); g.arc(30, 30, 13, 0, 7); g.fill(); });
  TEX.note = draw((g) => { g.fillStyle = '#ff7ab8'; g.font = 'bold 50px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♪', 32, 34); });
  TEX.sweat = draw((g) => { g.fillStyle = '#7cc8ff'; g.beginPath(); g.moveTo(32, 6); g.quadraticCurveTo(54, 40, 32, 56); g.quadraticCurveTo(10, 40, 32, 6); g.fill(); });
  TEX.smoke = draw((g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(90,90,90,1)'); r.addColorStop(1, 'rgba(90,90,90,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  TEX.leaf = draw((g) => { g.fillStyle = '#7fd36b'; g.beginPath(); g.ellipse(32, 32, 10, 22, .8, 0, 7); g.fill(); });
  TEX.candy = draw((g) => { g.fillStyle = '#ff6b8a'; g.beginPath(); g.arc(32, 32, 13, 0, 7); g.fill(); g.beginPath(); g.moveTo(19, 32); g.lineTo(4, 20); g.lineTo(4, 44); g.fill(); g.beginPath(); g.moveTo(45, 32); g.lineTo(60, 20); g.lineTo(60, 44); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(27, 27, 4, 0, 7); g.fill(); });
}

// ---------- helpers (geometries are cached and shared; KEEP marks them so they are never disposed) ----------
export const KEEP = new WeakSet();
const gcache = new Map();
function G(key, make) { let g = gcache.get(key); if (!g) { g = make(); gcache.set(key, g); KEEP.add(g); } return g; }
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), m); o.position.set(x, y, z); return o; };
const sph = (r, m, x = 0, y = 0, z = 0, ws = 14, hs = 10) => { const o = new THREE.Mesh(G(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)), m); o.position.set(x, y, z); return o; };
const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, s = 12) => { const o = new THREE.Mesh(G(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)), m); o.position.set(x, y, z); return o; };
function limb(len, r, m) { // pivot at top, extends down
  const g = G(`l${len},${r}`, () => { const g = new THREE.CylinderGeometry(r, r * 0.85, len, 8); g.translate(0, -len / 2, 0); return g; });
  return new THREE.Mesh(g, m);
}
export function disposeTree(o) { o.traverse((m) => { if (m.geometry && !KEEP.has(m.geometry)) m.geometry.dispose(); }); }
const SKIN = 0xffd9b8;

// ---------- GRANNY ----------
export function makeGranny() {
  const root = new THREE.Group();
  const cardigan = mat(0xb05cc4), skirt = mat(0x2d3a6b), stock = mat(0xd9b49a), shoe = mat(0x6b4226), skin = mat(SKIN), hair = mat(0xdedede), black = mat(0x222222), apron = mat(0xf7f0d8);

  const hips = new THREE.Group(); hips.position.y = 0.78; root.add(hips);
  const legs = [];
  for (const s of [-1, 1]) {
    const thigh = new THREE.Group(); thigh.position.x = 0.12 * s; hips.add(thigh);
    thigh.add(limb(0.38, 0.085, stock));
    const knee = new THREE.Group(); knee.position.y = -0.38; thigh.add(knee);
    knee.add(limb(0.36, 0.075, stock));
    const sh = box(0.15, 0.1, 0.28, shoe, 0, -0.37, -0.05); knee.add(sh);
    legs.push({ thigh, knee });
  }
  const sk = cyl(0.22, 0.36, 0.42, skirt, 0, -0.16, 0, 14); hips.add(sk);

  const torso = new THREE.Group(); torso.position.y = 0.04; torso.rotation.x = -0.85; hips.add(torso);
  const chest = sph(0.3, cardigan, 0, 0.3, 0.02); chest.scale.set(1, 1.15, 0.85); torso.add(chest);
  const hump = sph(0.27, cardigan, 0, 0.36, 0.1); torso.add(hump);
  const ap = box(0.36, 0.34, 0.05, apron, 0, 0.2, -0.24); torso.add(ap);
  for (let i = 0; i < 3; i++) torso.add(sph(0.025, mat(0xffe08a), 0, 0.42 - i * 0.12, -0.262, 6, 4));

  const head = new THREE.Group(); head.position.set(0, 0.6, -0.08); head.rotation.x = 0.95; torso.add(head);
  head.add(sph(0.2, skin, 0, 0.12, 0));
  const hr = sph(0.21, hair, 0, 0.17, 0.04); hr.scale.set(1, 0.95, 1); head.add(hr);
  const bun = new THREE.Group(); bun.position.set(0, 0.36, 0.06); head.add(bun);
  bun.add(sph(0.1, hair));
  const pin = box(0.42, 0.02, 0.05, mat(0x8a5a2b), 0, 0.03, 0); bun.add(pin); // kanzashi: becomes the propeller
  const pin2 = box(0.05, 0.02, 0.42, mat(0x8a5a2b), 0, 0.03, 0); pin2.visible = false; bun.add(pin2);
  // face
  for (const s of [-1, 1]) {
    head.add(sph(0.025, black, 0.07 * s, 0.14, -0.185, 6, 4));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.012, 6, 16), mat(0xc29b2a)); rim.position.set(0.075 * s, 0.14, -0.2); head.add(rim);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.052, 14), basic(0xbfe6ff, { transparent: true, opacity: 0.35 })); lens.position.set(0.075 * s, 0.14, -0.206); lens.rotation.y = Math.PI; head.add(lens);
    head.add(sph(0.04, mat(0xff9fa8), 0.12 * s, 0.06, -0.15, 8, 6));
  }
  head.add(box(0.04, 0.012, 0.012, mat(0xc29b2a), 0, 0.15, -0.205));
  const nose = sph(0.035, skin, 0, 0.09, -0.2, 8, 6); head.add(nose);
  const mouth = box(0.1, 0.03, 0.02, mat(0x7a2b2b), 0, 0.01, -0.19); head.add(mouth);
  const teeth = makeDentures(); teeth.scale.setScalar(0.45); teeth.position.set(0, 0.015, -0.2); head.add(teeth);

  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.3 * s, 0.48, 0); torso.add(sh);
    sh.add(limb(0.3, 0.07, cardigan));
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    el.add(limb(0.27, 0.06, cardigan));
    el.add(sph(0.065, skin, 0, -0.3, 0));
    arms.push({ sh, el, s });
  }
  // steam (turbo) and blob shadow
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), basic(0x000000, { transparent: true, opacity: 0.25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
  root.add(shadow);

  return { root, hips, legs, torso, head, bun, pin, pin2, arms, teeth, shadow, mouth };
}

export function makeDentures() {
  const g = new THREE.Group();
  const gum = mat(0xff7f8f), tooth = mat(0xffffff);
  const arcU = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 14, Math.PI), gum); arcU.rotation.x = Math.PI / 2; arcU.position.y = 0.03; g.add(arcU);
  const arcL = arcU.clone(); arcL.position.y = -0.03; g.add(arcL);
  for (let i = 0; i < 7; i++) {
    const a = (i + 0.5) / 7 * Math.PI;
    for (const y of [0.0, -0.0]) { const t = box(0.035, 0.05, 0.03, tooth, Math.cos(a) * 0.12, y, -Math.sin(a) * 0.12); t.rotation.y = a; g.add(t); }
  }
  g.rotation.y = Math.PI; // open side backwards
  return g;
}

// ---------- GRANDCHILD ----------
export function makeKid() {
  const root = new THREE.Group();
  const shirt = mat(0x5fb6ff), shorts = mat(0x334477), skin = mat(SKIN), hat = mat(0xffd21f), bag = mat(0xd8262e), black = mat(0x222222);
  const body = sph(0.17, shirt, 0, 0.22, 0); body.scale.set(1, 1.2, 0.9); root.add(body);
  for (const s of [-1, 1]) { // legs wrapping around granny
    const l = limb(0.28, 0.055, shorts); l.position.set(0.14 * s, 0.1, 0); l.rotation.set(-1.3, 0, 0.6 * s); root.add(l);
  }
  const rando = box(0.3, 0.32, 0.16, bag, 0, 0.26, 0.17); root.add(rando);
  rando.add(box(0.31, 0.12, 0.17, mat(0xa81820), 0, 0.12, 0.005));
  const head = new THREE.Group(); head.position.y = 0.5; root.add(head);
  head.add(sph(0.16, skin));
  const cap = sph(0.17, hat, 0, 0.05, 0, 14, 8); cap.scale.set(1, 0.75, 1); head.add(cap);
  const brim = cyl(0.21, 0.21, 0.02, hat, 0, 0.02, 0, 16); head.add(brim);
  for (const s of [-1, 1]) head.add(sph(0.022, black, 0.06 * s, 0.0, -0.145, 6, 4));
  const mouth = sph(0.04, mat(0x7a1f1f), 0, -0.07, -0.14, 8, 6); mouth.scale.set(1, 1.3, 0.5); head.add(mouth);
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(0.18 * s, 0.32, 0); root.add(a);
    a.add(limb(0.26, 0.045, shirt));
    const hand = sph(0.05, skin, 0, -0.28, 0, 8, 6); a.add(hand);
    arms.push(a);
  }
  // egg pack (after a sale), cat seat
  const eggs = new THREE.Group(); eggs.position.set(0, 0.25, -0.24); eggs.visible = false; root.add(eggs);
  eggs.add(box(0.32, 0.06, 0.16, mat(0xd6e8ff, { transparent: true, opacity: 0.7 })));
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) eggs.add(sph(0.025, mat(0xfff4dc), -0.12 + i * 0.06, 0.04, -0.04 + j * 0.08, 6, 5));
  return { root, head, arms, mouth, eggs };
}

// ---------- obstacles & pickups ----------
export function makeCone() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.08, 0.7, mat(0x333333), 0, 0.04, 0));
  g.add(cyl(0.05, 0.28, 0.75, mat(0xff6a1a), 0, 0.42, 0));
  g.add(cyl(0.12, 0.17, 0.12, mat(0xffffff), 0, 0.5, 0));
  return g;
}
let barrierTex;
export function makeBarrier(width) {
  if (!barrierTex) barrierTex = textTex(['工事中', 'ばあちゃん通行止め'], { w: 512, h: 160, bg: '#ffe066', fg: '#222', border: '#e23', bw: 14, colors: ['#d11', '#222'] });
  const g = new THREE.Group();
  const stripe = mat(0xffffff, { map: stripeTex() });
  const bar = box(width, 0.45, 0.12, stripe, 0, 1.65, 0); g.add(bar);
  for (const s of [-1, 1]) {
    g.add(cyl(0.05, 0.05, 1.9, mat(0xffffff), s * (width / 2 - 0.15), 0.95, 0));
    g.add(box(0.5, 0.1, 0.5, mat(0x555555), s * (width / 2 - 0.15), 0.05, 0));
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(2.4, width * 0.8), 0.75), new THREE.MeshBasicMaterial({ map: barrierTex }));
  sign.position.set(0, 2.3, 0.07); sign.rotation.y = 0; g.add(sign);
  const back = sign.clone(); back.position.z = -0.07; back.rotation.y = Math.PI; g.add(back);
  // blinking lamp
  const lamp = sph(0.09, basic(0xff3300), 0, 2.75, 0); g.add(lamp); g.userData.lamp = lamp;
  return g;
}
let _stripe;
function stripeTex() {
  if (_stripe) return _stripe;
  _stripe = canvasTex(256, 32, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8222e'; for (let x = -32; x < w; x += 48) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 24, 0); g.lineTo(x + 48, 0); g.lineTo(x + 24, h); g.fill(); } }, true);
  _stripe.repeat.set(2, 1);
  return _stripe;
}

export function makeTruck(color = 0xf4f4f4) {
  const g = new THREE.Group();
  const body = mat(color), glass = mat(0x7fb7e0), tire = mat(0x222222), bed = mat(0x9aa0a8);
  g.add(box(1.6, 1.25, 1.4, body, 0, 1.05, -1.25)); // cab (front faces -z... trucks face away (same direction))
  g.add(box(1.5, 0.55, 0.05, glass, 0, 1.35, -1.96));
  g.add(box(1.7, 0.35, 2.4, bed, 0, 0.75, 0.6));
  for (const s of [-1, 1]) g.add(box(0.06, 0.4, 2.4, bed, 0.82 * s, 1.1, 0.6));
  g.add(box(1.7, 0.4, 0.06, bed, 0, 1.1, 1.8));
  for (const z of [-1.2, 1.2]) for (const s of [-1, 1]) { const w = cyl(0.33, 0.33, 0.25, tire, 0.8 * s, 0.33, z, 12); w.rotation.z = Math.PI / 2; g.add(w); }
  // cargo: cabbages / daikon
  for (let i = 0; i < 6; i++) g.add(sph(0.26, mat(0x9fdc6a), -0.4 + (i % 3) * 0.4, 1.12, 0.1 + Math.floor(i / 3) * 0.6, 8, 6));
  g.add(box(1.5, 0.12, 0.05, mat(0xff3333), 0, 0.85, 1.83)); // tail lights
  return g;
}

export function makeSalaryman() {
  const g = new THREE.Group();
  const suit = mat(0x2e3440), shirt = mat(0xffffff), skin = mat(SKIN), tie = mat(0xd02020), hairM = mat(0x1a1a1a);
  const legs = [];
  for (const s of [-1, 1]) { const l = new THREE.Group(); l.position.set(0.11 * s, 0.85, 0); l.add(limb(0.85, 0.08, suit)); g.add(l); legs.push(l); }
  g.add(box(0.5, 0.65, 0.3, suit, 0, 1.18, 0));
  g.add(box(0.16, 0.5, 0.02, shirt, 0, 1.25, -0.16));
  g.add(box(0.06, 0.4, 0.03, tie, 0, 1.22, -0.17));
  const head = new THREE.Group(); head.position.y = 1.67; g.add(head);
  head.add(sph(0.17, skin));
  const hr = sph(0.175, hairM, 0, 0.05, 0.03); hr.scale.set(1, 0.8, 1); head.add(hr);
  for (const s of [-1, 1]) head.add(sph(0.02, mat(0x222222), 0.06 * s, 0.01, -0.16, 6, 4));
  const arms = [];
  for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(0.3 * s, 1.45, 0); a.add(limb(0.6, 0.06, suit)); g.add(a); arms.push(a); }
  const phone = box(0.08, 0.14, 0.02, mat(0x111111), 0, -0.6, -0.04); arms[1].add(phone);
  arms[1].rotation.x = -1.6; // looking at phone
  const bag = box(0.4, 0.3, 0.1, mat(0x3b2a1a), 0, -0.65, 0); arms[0].add(bag);
  g.userData = { legs, arms, head };
  return g;
}

export function makePigeon() {
  const g = new THREE.Group();
  const grey = mat(0x8e95a8), neck = mat(0x5f8f7a), beak = mat(0xe8a040);
  const b = sph(0.16, grey, 0, 0.18, 0, 10, 8); b.scale.set(0.8, 0.8, 1.2); g.add(b);
  g.add(sph(0.09, neck, 0, 0.32, -0.14, 8, 6));
  g.add(box(0.03, 0.03, 0.08, beak, 0, 0.31, -0.24));
  const wings = [];
  for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.set(0.11 * s, 0.22, 0); const m = box(0.3, 0.03, 0.22, grey, 0.15 * s, 0, 0); w.add(m); g.add(w); wings.push(w); }
  g.userData.wings = wings;
  return g;
}

export function makeCat() {
  const g = new THREE.Group();
  const fur = mat(0xf2a24b), white = mat(0xfff6e8), black = mat(0x222222);
  const b = sph(0.2, fur, 0, 0.25, 0, 10, 8); b.scale.set(0.8, 0.75, 1.4); g.add(b);
  const head = new THREE.Group(); head.position.set(0, 0.42, -0.26); g.add(head);
  head.add(sph(0.15, fur));
  head.add(sph(0.08, white, 0, -0.04, -0.1, 8, 6));
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), fur); ear.position.set(0.08 * s, 0.14, 0); head.add(ear);
    head.add(sph(0.025, black, 0.055 * s, 0.03, -0.13, 6, 4));
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cyl(0.04, 0.04, 0.2, fur, 0.09 * x, 0.1, 0.17 * z, 6));
  const tail = new THREE.Group(); tail.position.set(0, 0.3, 0.26); g.add(tail);
  const t = limb(0.35, 0.03, fur); t.rotation.x = Math.PI - 0.5; tail.add(t);
  g.userData.tail = tail;
  return g;
}

export function makeCandy() {
  const g = new THREE.Group();
  const cols = [0xff5c8a, 0xffb020, 0x6bd16b, 0x6bb8ff, 0xc77dff];
  const m = mat(cols[Math.floor(Math.random() * cols.length)]);
  g.add(sph(0.2, m, 0, 0, 0, 12, 8));
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.22, 6), m); w.rotation.z = s * Math.PI / 2; w.position.x = 0.27 * s; g.add(w); }
  return g;
}
let teaTex;
export function makeTea() {
  if (!teaTex) teaTex = textTex(['お茶'], { w: 128, h: 128, bg: '#3a9a4a', fg: '#fff', size: 52 });
  const g = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 16), [mat(0xffffff, { map: teaTex }), mat(0xcccccc), mat(0xcccccc)]);
  g.add(can);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 24), basic(0x8dff6a)); ring.rotation.x = Math.PI / 2; g.add(ring);
  return g;
}
export function makeDenturePickup() {
  const g = new THREE.Group(); const d = makeDentures(); d.scale.setScalar(2.2); g.add(d);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 6, 24), basic(0xffffff)); ring.rotation.x = Math.PI / 2; g.add(ring);
  return g;
}

let rampTex;
export function makeRamp() {
  if (!rampTex) rampTex = textTex(['ジャンプ台', '↑ ↑ ↑'], { w: 256, h: 256, bg: '#ffcc22', fg: '#222', colors: ['#d11', '#222'] });
  const g = new THREE.Group();
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(5, 0); shape.lineTo(5, 1.4); shape.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: false });
  geo.translate(-5, 0, -1.1); geo.rotateY(-Math.PI / 2); // slope rises toward -z
  const ramp = new THREE.Mesh(geo, mat(0xffcc22)); g.add(ramp);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 5.2), new THREE.MeshBasicMaterial({ map: rampTex }));
  top.rotation.x = -Math.PI / 2 + Math.atan2(1.4, 5); top.position.set(0, 0.72, -2.5); g.add(top);
  return g;
}

let saleTex;
export function makeSaleGate() {
  if (!saleTex) saleTex = textTex(['特売', 'たまご 1パック 98円'], { w: 512, h: 256, bg: '#e8222e', fg: '#fff', colors: ['#ffef3a', '#fff'], stroke: '#7a0000' });
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(cyl(0.09, 0.09, 3.2, mat(0xe8222e), 1.2 * s, 1.6, 0));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.4), new THREE.MeshBasicMaterial({ map: saleTex, side: THREE.DoubleSide }));
  sign.position.y = 3.3; g.add(sign);
  for (let i = 0; i < 7; i++) { const f = box(0.25, 0.3, 0.02, mat([0xffef3a, 0xff7ab8, 0x6bd1ff][i % 3]), -1.2 + i * 0.4, 2.45, 0); f.rotation.z = (i % 2 ? 1 : -1) * 0.1; g.add(f); }
  return g;
}

export function makePolice() {
  const g = new THREE.Group();
  const white = mat(0xffffff), black = mat(0x1d1d1d), glass = mat(0x6a95c0), tire = mat(0x111111);
  g.add(box(1.8, 0.6, 4.2, black, 0, 0.6, 0));
  g.add(box(1.82, 0.32, 2.2, white, 0, 0.62, 0));
  g.add(box(1.6, 0.55, 2.0, white, 0, 1.15, 0.2));
  g.add(box(1.5, 0.42, 0.05, glass, 0, 1.17, -0.82));
  const lights = [box(0.5, 0.18, 0.3, basic(0xff1111), -0.3, 1.52, 0.2), box(0.5, 0.18, 0.3, basic(0xff1111), 0.3, 1.52, 0.2)];
  lights.forEach((l) => g.add(l));
  for (const z of [-1.4, 1.4]) for (const s of [-1, 1]) { const w = cyl(0.34, 0.34, 0.26, tire, 0.88 * s, 0.34, z, 12); w.rotation.z = Math.PI / 2; g.add(w); }
  g.add(box(0.9, 0.2, 0.02, basic(0xfff2a0), 0, 0.65, -2.11));
  const cop = sph(0.18, mat(SKIN), -0.35, 1.2, -0.2); g.add(cop);
  const capC = cyl(0.19, 0.19, 0.12, mat(0x1d2c5a), -0.35, 1.36, -0.2); g.add(capC);
  g.userData.lights = lights;
  return g;
}

export function makeGrandpa() {
  const g = new THREE.Group();
  const red = mat(0xd8262e), tire = mat(0x222222), skin = mat(SKIN), shirt = mat(0x7a9a6a);
  g.add(box(0.8, 0.3, 1.5, red, 0, 0.4, 0));
  g.add(box(0.5, 0.15, 0.4, mat(0x333333), 0, 0.75, 0.2));
  g.add(cyl(0.04, 0.04, 0.8, mat(0x999999), 0, 0.8, -0.6));
  g.add(box(0.6, 0.05, 0.05, mat(0x999999), 0, 1.2, -0.6));
  g.add(box(0.4, 0.3, 0.2, mat(0xdddddd), 0, 0.5, -0.85)); // basket
  for (const z of [-0.55, 0.55]) for (const s of [-1, 1]) { const w = cyl(0.17, 0.17, 0.12, tire, 0.38 * s, 0.17, z, 10); w.rotation.z = Math.PI / 2; g.add(w); }
  const rocket = cyl(0.16, 0.16, 0.7, mat(0xaaaaaa), 0, 0.65, 0.95, 10); rocket.rotation.x = Math.PI / 2; g.add(rocket);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.7, 8), basic(0xffa020)); flame.rotation.x = Math.PI / 2; flame.position.set(0, 0.65, 1.6); g.add(flame);
  // grandpa
  g.add(box(0.42, 0.55, 0.3, shirt, 0, 1.15, 0.15));
  const head = sph(0.17, skin, 0, 1.6, 0.1); g.add(head);
  const hat = cyl(0.2, 0.2, 0.08, mat(0x5a4632), 0, 1.74, 0.1, 12); g.add(hat);
  g.add(cyl(0.12, 0.17, 0.1, mat(0x5a4632), 0, 1.81, 0.1, 12));
  const beard = sph(0.1, mat(0xffffff), 0, 1.5, -0.04, 8, 6); g.add(beard);
  for (const s of [-1, 1]) { const a = limb(0.45, 0.05, shirt); a.position.set(0.24 * s, 1.35, 0.1); a.rotation.x = 1.2; g.add(a); }
  g.userData.flame = flame;
  return g;
}

// ---------- city ----------
const geoCache = new Map();
export function buildingGeo(w, h, d) {
  const key = `${w}_${h}_${d}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const fs = [[d / 4, h / 3.2], [d / 4, h / 3.2], [1, 1], [1, 1], [w / 4, h / 3.2], [w / 4, h / 3.2]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * fs[f][0], uv.getY(k) * fs[f][1]); }
  geo.translate(0, h / 2, 0);
  geoCache.set(key, geo); KEEP.add(geo); return geo;
}
const BCOL = [0xf3e3c3, 0xe8c9a6, 0xd9e2ec, 0xf0d0d0, 0xcfe3cf, 0xe6e6e6, 0xf7e7a0, 0xc9d6f0, 0xe0c0e8];
let bMats;
export function buildingMats() {
  if (bMats) return bMats;
  bMats = BCOL.map((c) => {
    const side = new THREE.MeshToonMaterial({ color: c, map: TEX.win, gradientMap: grad });
    const roof = mat(new THREE.Color(c).multiplyScalar(0.7).getHex());
    return [side, side, roof, roof, side, side];
  });
  return bMats;
}
export const SHOPS = [
  ['スナック', '昭和'], ['八百屋', 'やおきゅう'], ['整骨院', 'こしかた'], ['銭湯', 'ゆけむり湯'], ['喫茶', 'ロマン'],
  ['団子屋', 'まるまる'], ['質屋', '大黒'], ['たばこ', '塩'], ['入れ歯', '専門店'], ['和菓子', '甘党本舗'],
  ['ゲートボール', '用品店'], ['老人会', '本部'], ['カラオケ', '演歌の殿堂'], ['肉屋', 'コロッケ80円'], ['手芸店', 'けいと'],
];
export const SIGN_COLS = ['#d8262e', '#2d6bd8', '#2e9e4a', '#8a3fbf', '#e07a10', '#333'];
let signMats;
export function signMats_() {
  if (signMats) return signMats;
  signMats = SHOPS.map((s, i) => new THREE.MeshBasicMaterial({ map: textTex(s, { w: 512, h: 160, bg: SIGN_COLS[i % SIGN_COLS.length], fg: '#fff', stroke: 'rgba(0,0,0,.35)' }) }));
  return signMats;
}
let boardMats;
export function boardMats_() {
  if (boardMats) return boardMats;
  const B = [
    [['飛び出し注意', '（ばあちゃん）'], '#fff', '#d11'],
    [['制限速度', '40'], '#fff', '#1a4fd0'],
    [['腰痛に', 'さようなら'], '#ffe8f0', '#c2185b'],
    [['この先', '特売あり'], '#fff6c2', '#d11'],
    [['ばあちゃんは', '急に止まれない'], '#fff', '#222'],
    [['祝', '米寿'], '#ffefef', '#d11'],
    [['ゆっくり', '走ろう'], '#e8fff0', '#2e7d32'],
  ];
  boardMats = B.map(([t, bg, fg]) => new THREE.MeshBasicMaterial({ map: textTex(t, { w: 512, h: 256, bg, fg, border: fg, bw: 16 }) }));
  return boardMats;
}
let vendTex;
export function makeVending() {
  if (!vendTex) vendTex = canvasTex(128, 256, (g) => {
    g.fillStyle = '#e8eef5'; g.fillRect(0, 0, 128, 256); g.fillStyle = '#d8262e'; g.fillRect(0, 0, 128, 30);
    const cols = ['#3a9a4a', '#d8262e', '#2d6bd8', '#f0a020', '#8a3fbf'];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) { g.fillStyle = cols[(r + c) % 5]; g.fillRect(8 + c * 23, 40 + r * 44, 16, 32); }
    g.fillStyle = '#333'; g.fillRect(20, 200, 88, 30);
  });
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.7), [mat(0xd8262e), mat(0xd8262e), mat(0xd8262e), mat(0xd8262e), new THREE.MeshBasicMaterial({ map: vendTex }), mat(0xd8262e)]);
  m.position.y = 0.9; g.add(m);
  return g;
}
export function makePole() {
  const g = new THREE.Group();
  g.add(cyl(0.12, 0.15, 8, mat(0x9a948a), 0, 4, 0, 8));
  g.add(box(1.4, 0.1, 0.1, mat(0x6a645a), 0, 7.3, 0));
  g.add(cyl(0.18, 0.18, 0.5, mat(0x7a7a7a), 0.4, 6.7, 0, 8));
  return g;
}
export function makeTree() {
  const g = new THREE.Group();
  g.add(cyl(0.12, 0.16, 1.8, mat(0x7a5232), 0, 0.9, 0, 7));
  const leaves = mat([0x5cb85c, 0x4caf50, 0x78c850][Math.floor(Math.random() * 3)]);
  g.add(sph(0.9, leaves, 0, 2.3, 0, 8, 6)); g.add(sph(0.65, leaves, 0.4, 2.9, 0.2, 8, 6));
  return g;
}
export function makeLamp() {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.08, 4.5, mat(0x5a6670), 0, 2.25, 0, 6));
  const arm = box(1.0, 0.08, 0.08, mat(0x5a6670), 0.5, 4.45, 0); g.add(arm);
  g.add(box(0.5, 0.12, 0.25, basic(0xfff3c0), 0.85, 4.38, 0));
  g.userData.arm = arm;
  return g;
}
export function makePost() {
  const g = new THREE.Group();
  g.add(cyl(0.25, 0.25, 1.1, mat(0xe0201f), 0, 0.55, 0, 12));
  g.add(sph(0.25, mat(0xe0201f), 0, 1.1, 0, 12, 6));
  g.add(box(0.3, 0.04, 0.05, mat(0x222222), 0, 0.9, -0.24));
  return g;
}
export function makeBoard(m) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(cyl(0.05, 0.05, 3.4, mat(0x777777), 0.9 * s, 1.7, 0, 6));
  const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), m); p.position.y = 3.0; g.add(p);
  return g;
}
export function makeBystander() {
  // a cheering neighbour on the sidewalk
  const g = new THREE.Group();
  const cols = [0xff8a65, 0x4db6ac, 0xba68c8, 0xf06292, 0x9ccc65, 0xffd54f];
  const c = mat(cols[Math.floor(Math.random() * cols.length)]);
  g.add(cyl(0.18, 0.25, 0.9, c, 0, 0.75, 0, 8));
  g.add(cyl(0.07, 0.07, 0.4, mat(0x444466), -0.1, 0.2, 0, 6)); g.add(cyl(0.07, 0.07, 0.4, mat(0x444466), 0.1, 0.2, 0, 6));
  const head = sph(0.15, mat(SKIN), 0, 1.35, 0); g.add(head);
  g.add(sph(0.155, mat([0x222222, 0x8a5a2b, 0xdddddd][Math.floor(Math.random() * 3)]), 0, 1.4, 0.03));
  const arms = [];
  for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(0.22 * s, 1.1, 0); a.add(limb(0.4, 0.045, c)); g.add(a); arms.push(a); }
  g.userData.arms = arms;
  return g;
}
