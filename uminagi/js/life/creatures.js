// A 3D model and a picture for every creature, fossil and shell: built in code from a short description of each
// one (body plan, colours, markings, fins, horns...), drawn in the same picture-book way as the cast (toon
// shading and an outline), and photographed once into a small icon for the pocket and the encyclopedia.
//   creatureModel(id)  a new copy (shared geometry), about 1 m on its longest side, centred; null if none
//   creatureIcon(id)   a PNG data URL (128 px), made on first use
//   creatureShape(id)  how a bug moves about (fly / dragon / beetle / dot / shell / glow / crawl)
// Fish are built head +x (seen from the side); bugs and sea creatures head +z (seen from above).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonify } from '../toon.js';

const PI = Math.PI, TAU = PI * 2;
const C = (h) => new THREE.Color(h);
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const noise = (x, y) => {   // smooth value noise
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

// ---------------------------------------------------------------- materials (shared)
const MATS = new Map();
const mat = (hex, o = {}) => {
  const k = hex + JSON.stringify(o); if (MATS.has(k)) return MATS.get(k);
  const m = new THREE.MeshStandardMaterial({ color: hex, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0, side: o.side ? THREE.DoubleSide : THREE.FrontSide, transparent: !!o.op, opacity: o.op ?? 1, depthWrite: !o.op });
  MATS.set(k, m); return m;
};
const VC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
const VCS = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
const glowMat = (hex) => { const m = new THREE.MeshBasicMaterial({ color: hex }); return m; };

// ---------------------------------------------------------------- small builders
const paint = (g, fn) => {   // vertex colours from a function of the vertex position
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(c, p.getX(i), p.getY(i), p.getZ(i)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
};
const solid = (g, hex) => paint(g, (c) => c.set(hex));
const add = (grp, geo, m = VC, keep = false) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; if (keep) o.userData.keep = true; grp.add(o); return o; };
const ell = (rx, ry, rz, ws = 16, hs = 10) => { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); return g; };
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
const stick = (a, b, r0, r1 = r0, seg = 5) => {   // a tapered cylinder from a to b
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), g = new THREE.CylinderGeometry(r1, r0, d.length(), seg);
  g.translate(0, d.length() / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(A.x, A.y, A.z); return g;
};
const shape = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); return new THREE.ShapeGeometry(s); };
const eye = (grp, x, y, z, r, white = true) => {
  if (white) add(grp, solid(at(ell(r, r, r, 10, 8), x, y, z), 0xf8f8f4));
  add(grp, solid(at(ell(r * 0.55, r * 0.6, r * 0.55, 8, 6), x + r * 0.25, y, z + Math.sign(z || 1) * r * 0.55), 0x111111));
};

// ---------------------------------------------------------------- fish (head +x, length 1)
// markings on the body: t along the fish (-1 tail .. 1 head), y up (-1 belly .. 1 back)
function marks(c, p, t, y) {
  const [kind, hex, n = 6] = p; if (!kind) return false;
  const on =
    kind === 'vbands' ? t > -0.85 && t < 0.72 && ((t + 1) * n * 0.5) % 1 < 0.42 :
    kind === 'hline' ? Math.abs(y - 0.05) < 0.11 && t < 0.8 :
    kind === 'hlines' ? y > -0.55 && ((y + 1) * n * 0.5) % 1 < 0.32 && t < 0.8 :
    kind === 'spots' ? (() => { const gx = (t + 1) * 6, gy = (y + 1) * 3.5, cx = Math.floor(gx) + 0.5, cy = Math.floor(gy) + 0.5; return hash(cx, cy) > 0.35 && Math.hypot(gx - cx, gy - cy) < 0.3 && t < 0.78; })() :
    kind === 'dots' ? Math.abs(y - 0.18) < 0.09 && ((t + 1) * 7) % 1 < 0.3 && t > -0.6 && t < 0.6 :
    kind === 'mottle' ? noise(t * 5 + 3, y * 4) > 0.55 :
    kind === 'wavy' ? y > 0.15 && Math.sin(t * 34 + y * 10) > 0.25 :
    kind === 'diag' ? t < 0.75 && ((t * 1.4 + y * 0.9 + 3) * n * 0.5) % 1 < 0.4 : false;
  if (on) c.set(hex);
  return on;
}
const TAILS = {
  fork: [[0, 0], [-0.17, 0.2], [-0.12, 0.02], [-0.12, -0.02], [-0.17, -0.2]],
  lunate: [[0, 0], [-0.1, 0.25], [-0.07, 0.03], [-0.07, -0.03], [-0.1, -0.25]],
  round: [[0, 0], [-0.1, 0.13], [-0.17, 0.08], [-0.19, 0], [-0.17, -0.08], [-0.1, -0.13]],
  trunc: [[0, 0], [-0.12, 0.14], [-0.15, 0.12], [-0.15, -0.12], [-0.12, -0.14]],
};
function fish(s) {
  const g = new THREE.Group(), H = s.h ?? 0.28, W = H * (s.w ?? 0.42), a = s.blunt ? 0.32 : 0.5, b = s.taper ?? 0.5;
  const back = C(s.c[0]), belly = C(s.c[1] ?? s.c[0]);
  const r = (t) => Math.pow(Math.max(0, 1 - t * t), a) * (t < 0 ? 1 + b * t : 1) * (s.hump && t > 0.1 ? 1 + 0.25 * Math.sin((t - 0.1) * PI) : 1);
  const body = new THREE.SphereGeometry(1, 36, 20), P = body.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const t = P.getX(i), ny = P.getY(i), nz = P.getZ(i), q = Math.hypot(ny, nz) || 1, rr = r(t);
    P.setXYZ(i, t * 0.5, ny / q * rr * H / 2 * (s.flatBelly && ny < 0 ? 0.75 : 1), nz / q * rr * W / 2);
  }
  body.computeVertexNormals();
  paint(body, (c, x, y) => {
    const t = x * 2, yy = y / (H / 2 * Math.max(0.05, r(t)));
    c.copy(belly).lerp(back, sstep(-0.4, 0.45, yy));
    if (s.p) marks(c, s.p, t, yy);
    if (s.p2) marks(c, s.p2, t, yy);
  });
  add(g, body);
  const top = (t) => r(t) * H / 2, fin = s.f ?? s.c[0];
  // tail
  if (s.tail !== 'none') {
    const tl = TAILS[s.tail || 'fork'].map(([x, y]) => [x * (s.tailK ?? 1), y * (s.tailK ?? 1) * (H / 0.28) ** 0.5]);
    add(g, solid(at(shape(tl), -0.5 * (1 - 0.02), 0, 0), fin), VCS);
  }
  // dorsal fin(s)
  const dors = s.dorsal ?? 'low', spine = (t0, t1, h, teeth = 0) => {
    const pts = [], n = 10; for (let k = 0; k <= n; k++) { const t = t0 + (t1 - t0) * k / n; pts.push([t * 0.5, top(t) - 0.005]); }
    for (let k = n; k >= 0; k--) { const t = t0 + (t1 - t0) * k / n, e = Math.sin((k / n) * PI) ** 0.6; pts.push([t * 0.5 - 0.02, top(t) + h * e * (teeth && k % 2 ? 0.6 : 1)]); }
    add(g, solid(shape(pts), fin), VCS);
  };
  if (dors === 'low') spine(-0.45, 0.35, H * 0.35);
  if (dors === 'spiky') spine(-0.5, 0.45, H * 0.45, 1);
  if (dors === 'tall') spine(-0.4, 0.5, H * 0.9, 1);
  if (dors === 'long') spine(-0.92, 0.75, H * 0.35);
  if (dors === 'two') { spine(0.05, 0.45, H * 0.35); spine(-0.55, -0.05, H * 0.28); }
  if (dors === 'tri') spine(-0.05, 0.3, H * 0.4);
  if (dors === 'finlets') { spine(0.0, 0.35, H * 0.4); for (let k = 0; k < 5; k++) { const t = -0.75 + k * 0.1; add(g, solid(at(shape([[0, 0], [0.02, 0], [-0.01, 0.03]]), t * 0.5, top(t), 0), 0xe8c030), VCS); } }
  // belly fin (anal) mirrors a little of the dorsal
  if (dors !== 'none') { const pts = []; for (let k = 0; k <= 6; k++) { const t = -0.65 + 0.4 * k / 6; pts.push([t * 0.5, -top(t) + 0.005]); } pts.push([-0.12, -top(-0.25) - H * 0.22], [-0.3, -top(-0.6) - H * 0.12]); add(g, solid(shape(pts), fin), VCS); }
  // pectoral fins (wings on the flying fish and the sea robin)
  const pec = s.pec ?? 0.12, pc = s.pecC ?? fin;
  for (const sd of [-1, 1]) {
    const f = solid(shape([[0, 0], [-pec * 1.2, pec * 0.55], [-pec * 1.4, 0.0], [-pec * 0.9, -pec * 0.35]]), pc);
    f.rotateX(sd * 1.2); f.rotateY(sd * 0.35); f.translate(0.22, -H * 0.12, sd * W * 0.42); add(g, f, VCS);
  }
  // eyes, gill line, whiskers, a long beak
  const ex = 0.33, er = H * 0.11 * (s.bigEye ? 1.4 : 1);
  for (const sd of [-1, 1]) eye(g, ex, H * (s.eyeY ?? 0.1), sd * (W / 2 * r(ex * 2) * 0.88), er);
  if (s.beak) add(g, solid(stick([0.47, -H * 0.05, 0], [0.62, -H * 0.08, 0], 0.012, 0.004), s.beak), VC);
  if (s.whiskers) for (const sd of [-1, 1]) for (const k of [0, 1]) add(g, solid(stick([0.48, -H * 0.12, sd * 0.02], [0.6, -H * 0.3 - k * 0.04, sd * (0.05 + k * 0.03)], 0.006), 0xe8e0d0));
  if (s.glowEye) for (const sd of [-1, 1]) add(g, at(ell(er * 0.7, er * 0.7, er * 0.4), ex + er * 0.3, H * 0.1, sd * W / 2 * r(ex * 2) * 1.02), glowMat(s.glowEye), true);
  return g;
}
// flatfish lie on their side: a broad disc, both eyes on top, a fringe of fin
function flatfish(s) {
  const g = new THREE.Group(), b = ell(0.5, 0.05, 0.27, 28, 10);
  paint(b, (c, x, y, z) => { c.set(y > 0 ? s.c[0] : s.c[1] ?? 0xf0ece4); if (y > 0 && s.p) marks(c, s.p, x * 2, z * 3.5); });
  add(g, b);
  const fr = []; for (let k = 0; k <= 24; k++) { const a = PI * 0.1 + PI * 0.8 * k / 24; fr.push([Math.cos(a) * 0.48, Math.sin(a) * 0.3]); } for (let k = 24; k >= 0; k--) { const a = PI * 0.1 + PI * 0.8 * k / 24; fr.push([Math.cos(a) * 0.45, Math.sin(a) * 0.25]); }
  for (const sd of [-1, 1]) { const f = solid(shape(fr), s.f ?? s.c[0]); f.rotateX(-PI / 2); if (sd < 0) f.scale(1, 1, -1); add(g, f, VCS); }
  add(g, solid(at(shape(TAILS.round), -0.48, 0, 0, -PI / 2), s.f ?? s.c[0]), VCS);
  for (const dz of [-0.04, 0.05]) eye(g, 0.33 + dz * 0.3, 0.05, dz, 0.035);
  return g;
}
function ray(s) {
  const g = new THREE.Group(), b = ell(0.42, 0.05, 0.5, 6, 6);
  const P = b.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); P.setX(i, x * (1 - Math.abs(z) * 0.9) + 0.1); }
  b.computeVertexNormals(); paint(b, (c, x, y) => c.set(y > 0 ? s.c[0] : 0xf4ece4)); add(g, b);
  add(g, solid(stick([-0.25, 0, 0], [-0.95, 0.02, 0], 0.025, 0.004), s.c[0]));
  for (const sd of [-1, 1]) eye(g, 0.3, 0.05, sd * 0.07, 0.03, false);
  g.rotateX(0); return g;
}
function shark(s) {
  const g = fish({ ...s, tail: 'none', dorsal: 'none', blunt: s.blunt, h: s.h ?? 0.22, taper: 0.7 });
  add(g, solid(shape([[-0.48, 0], [-0.68, 0.22], [-0.62, 0.02], [-0.6, -0.08]]), s.c[0]), VCS);
  add(g, solid(shape([[0.05, 0.1], [-0.07, 0.24], [-0.12, 0.08]]), s.c[0]), VCS);
  add(g, solid(shape([[-0.22, 0.06], [-0.3, 0.15], [-0.33, 0.04]]), s.c[0]), VCS);
  return g;
}
function seahorse(s) {
  const g = new THREE.Group(), pts = [];
  for (let k = 0; k <= 22; k++) { const t = k / 22; pts.push(t < 0.45 ? new THREE.Vector3(0, 0.45 - t * 1.2, 0.05 * Math.sin(t * 6)) : new THREE.Vector3(0.12 * Math.sin((t - 0.45) * 9), -0.09 - (t - 0.45) * 0.4 * Math.cos((t - 0.45) * 5), 0)); }
  const curve = new THREE.CatmullRomCurve3(pts), tube = new THREE.TubeGeometry(curve, 60, 1, 10, false), P = tube.attributes.position, nrm = tube.attributes.normal;
  for (let i = 0; i < P.count; i++) { const u = Math.floor(i / 11) / 60, rr = 0.07 * (u < 0.15 ? 0.7 + u * 2 : Math.max(0.12, 1 - (u - 0.15) * 1.15)); const c = curve.getPointAt(u); P.setXYZ(i, c.x + nrm.getX(i) * rr, c.y + nrm.getY(i) * rr, c.z + nrm.getZ(i) * rr); }
  tube.computeVertexNormals(); paint(tube, (c, x, y) => { c.set(s.c[0]); if (Math.sin(y * 70) > 0.6) c.multiplyScalar(0.8); }); add(g, tube);
  add(g, solid(stick([0, 0.48, 0], [0.2, 0.45, 0], 0.035, 0.02), s.c[0]));
  add(g, solid(at(ell(0.08, 0.08, 0.07), 0, 0.48, 0), s.c[0]));
  add(g, solid(at(shape([[0, 0], [-0.1, 0.06], [-0.1, -0.08]]), -0.05, 0.2, 0), s.f ?? s.c[0]), VCS);
  for (const sd of [-1, 1]) eye(g, 0.04, 0.5, sd * 0.06, 0.025);
  return g;
}
function squid(s) {
  const g = new THREE.Group(), cut = s.cuttle;
  const m = ell(0.32, 0.1, cut ? 0.13 : 0.09, 20, 12); m.translate(0.12, 0, 0);
  paint(m, (c, x, y, z) => { c.set(s.c[0]); if (y > 0 && noise(x * 18, z * 18) > 0.62) c.set(s.c[1] ?? 0x8a5a3a); });
  add(g, m);
  const skirt = []; for (let k = 0; k <= 16; k++) { const a = PI * k / 16; skirt.push([0.12 + Math.cos(a) * (cut ? 0.32 : 0.3), Math.sin(a) * (cut ? 0.2 : 0.16)]); }
  for (const sd of [-1, 1]) { const f = solid(shape(cut ? skirt : [[0.44, 0], [0.3, 0.16], [0.18, 0]]), s.c[0]); f.rotateX(-PI / 2); if (sd < 0) f.scale(1, 1, -1); add(g, f, VCS); }
  add(g, solid(at(ell(0.07, 0.07, 0.07), -0.22, 0, 0), s.c[0]));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; add(g, solid(stick([-0.25, Math.sin(a) * 0.04, Math.cos(a) * 0.04], [-0.48 - (k % 2) * 0.05, Math.sin(a) * 0.09, Math.cos(a) * 0.09], 0.016, 0.004), s.c[0])); }
  for (const sd of [-1, 1]) eye(g, -0.2, 0.03, sd * 0.065, 0.028);
  return g;
}
function octopus(s) {
  const g = new THREE.Group(), head = ell(0.2, 0.24, 0.2, 20, 14); head.translate(0, 0.3, 0);
  paint(head, (c, x, y, z) => { c.set(s.c[0]); if (noise(x * 14 + 5, y * 14) > 0.65) c.set(s.c[1] ?? 0xe8a080); }); add(g, head);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.2, pts = []; for (let i = 0; i <= 8; i++) { const u = i / 8, rr = 0.1 + u * 0.38; pts.push(new THREE.Vector3(Math.cos(a + u * 0.6) * rr, 0.1 - u * 0.12 + Math.sin(u * 5 + k) * 0.03, Math.sin(a + u * 0.6) * rr)); }
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.035, 6), P = tg.attributes.position, N = tg.attributes.normal;
    for (let i = 0; i < P.count; i++) { const u = Math.floor(i / 7) / 16, sh = (1 - u * 0.8) - 1; P.setXYZ(i, P.getX(i) + N.getX(i) * 0.035 * sh, P.getY(i) + N.getY(i) * 0.035 * sh, P.getZ(i) + N.getZ(i) * 0.035 * sh); }
    tg.computeVertexNormals(); add(g, solid(tg, s.c[0]));
  }
  for (const sd of [-1, 1]) eye(g, 0.12, 0.28, sd * 0.11, 0.035);
  return g;
}
function sunfish(s) {
  const g = new THREE.Group(), b = ell(0.42, 0.42, 0.11, 24, 16); paint(b, (c, x, y) => c.copy(C(s.c[1])).lerp(C(s.c[0]), sstep(-0.3, 0.3, y / 0.42))); add(g, b);
  add(g, solid(shape([[0.0, 0.3], [-0.1, 0.78], [-0.2, 0.3]]), s.c[0]), VCS);
  add(g, solid(shape([[0.0, -0.3], [-0.1, -0.78], [-0.2, -0.3]]), s.c[0]), VCS);
  add(g, solid(shape([[-0.38, 0.32], [-0.5, 0.2], [-0.52, -0.2], [-0.38, -0.32]]), s.c[0]), VCS);
  for (const sd of [-1, 1]) eye(g, 0.28, 0.06, sd * 0.1, 0.04);
  return g;
}
function frogfish(s) {
  const g = new THREE.Group(), b = ell(0.3, 0.27, 0.24, 20, 14);
  const P = b.attributes.position; for (let i = 0; i < P.count; i++) { const k = 1 + 0.12 * noise(P.getX(i) * 12, P.getY(i) * 12); P.setXYZ(i, P.getX(i) * k, P.getY(i) * k, P.getZ(i) * k); }
  b.computeVertexNormals(); paint(b, (c, x, y) => { c.set(s.c[0]); if (noise(x * 10, y * 10 + 3) > 0.6) c.set(s.c[1]); }); add(g, b);
  add(g, solid(stick([0.2, 0.22, 0], [0.33, 0.38, 0], 0.01), s.c[1])); add(g, solid(at(ell(0.03, 0.03, 0.03), 0.34, 0.39, 0), 0xf0e0c0));
  for (const sd of [-1, 1]) { add(g, solid(stick([0.05, -0.18, sd * 0.15], [0.12, -0.32, sd * 0.2], 0.035, 0.025), s.c[0])); eye(g, 0.2, 0.12, sd * 0.16, 0.035); }
  add(g, solid(at(shape(TAILS.round), -0.28, 0, 0), s.c[0]), VCS);
  return g;
}

const FISH = {
  iwashi: { c: [0x2a5a8a, 0xe8eef4], f: 0x9ab0c0, p: ['dots', 0x1a2a3a], h: 0.22 },
  haze: { a: 'rock', c: [0xb8a080, 0xf0e8d8], p: ['mottle', 0x7a6040], h: 0.24, dorsal: 'two', tail: 'round' },
  aji: { c: [0x5a7a90, 0xe8ece8], p: ['hline', 0xd8c060], h: 0.3 },
  saba: { c: [0x2f7a7a, 0xe8f0f0], p: ['wavy', 0x183840], h: 0.25, dorsal: 'finlets' },
  bora: { c: [0x6a7a80, 0xe0e4e4], p: ['hlines', 0x5a6a70, 5], h: 0.24, blunt: 1 },
  fugu: { a: 'puffer', c: [0x6a7a50, 0xf4f4ec], p: ['spots', 0xf0f0e0] },
  kisu: { c: [0xe0c8a0, 0xf8f4ec], f: 0xf0e0c0, h: 0.2 },
  sayori: { c: [0x5a8aa0, 0xf0f4f8], p: ['hline', 0x80b0c8], h: 0.12, beak: 0xd04030, tailK: 0.8 },
  kasago: { a: 'rock', c: [0xc04a30, 0xf0c0a0], p: ['mottle', 0x7a2a1a] },
  mebaru: { a: 'rock', c: [0x7a6a5a, 0xd8d0c0], p: ['vbands', 0x4a3a30, 4], bigEye: 1 },
  mejina: { a: 'deep', c: [0x3a4a50, 0x5a6a70], f: 0x2a3a40 },
  ainame: { a: 'rock', c: [0xa07a40, 0xe0d0a0], p: ['mottle', 0x6a4a20], dorsal: 'long', h: 0.26 },
  kawahagi: { a: 'deep', c: [0xb0a080, 0xe0d8c0], p: ['spots', 0x6a5a40], h: 0.55, dorsal: 'tri' },
  karei: { a: 'flat', c: [0x8a7a5a], p: ['mottle', 0x5a4a30] },
  tako: { a: 'octopus', c: [0xb85a40, 0xe8a080] },
  kurodai: { a: 'deep', c: [0x3a3a40, 0x9aa0a8] },
  utsubo: { a: 'eel', c: [0xb08a3a, 0xc8a050], p: ['mottle', 0x3a2a10] },
  aoriika: { a: 'squid', c: [0xd8c8b0, 0x8a5a3a] },
  ei: { a: 'ray', c: [0xb07a50] },
  suzuki: { c: [0x5a6a70, 0xe8ecec], h: 0.26, dorsal: 'two' },
  tachiuo: { a: 'eel', c: [0xd0d8e0, 0xf0f4f8], h: 0.13, ribbon: 1 },
  shiira: { c: [0x3a9a6a, 0xe8d040], p: ['spots', 0x3a6ab0], h: 0.3, blunt: 1, dorsal: 'long' },
  madai: { a: 'deep', c: [0xe06a6a, 0xf8d8d0], p: ['dots', 0x60b0e0], h: 0.42 },
  nekozame: { a: 'shark', c: [0x9a7a5a, 0xe8dcc8], p: ['vbands', 0x5a3a20, 6], blunt: 1 },
  hirame: { a: 'flat', c: [0x7a6a4a], p: ['mottle', 0x4a3a20] },
  ishidai: { a: 'deep', c: [0xd8d0c0, 0xe8e4dc], p: ['vbands', 0x2a2a2a, 7] },
  katsuo: { c: [0x2a3a6a, 0xe8ecf4], p: ['hlines', 0x6a7a9a, 4], h: 0.3, tail: 'lunate', dorsal: 'finlets' },
  buri: { c: [0x4a6a8a, 0xe8ecf0], p: ['hline', 0xd8c040], h: 0.26 },
  tatsunootoshigo: { a: 'seahorse', c: [0xd0a040] },
  maguro: { c: [0x1a2a4a, 0xd0d8e4], h: 0.3, tail: 'lunate', dorsal: 'finlets' },
  nushi: { c: [0x2a5a9a, 0xe0f0ff], p: ['spots', 0xffe080], h: 0.34, f: 0x7ab0e8, glowEye: 0xffe070, dorsal: 'long' },
  nenbutsudai: { a: 'deep', c: [0xe8a090, 0xf8e0d8], p: ['hlines', 0x5a2a2a, 2], bigEye: 1, h: 0.4 },
  konoshiro: { c: [0x4a6a8a, 0xe8ecf0], p: ['dots', 0x2a3a4a], h: 0.32 },
  kyusen: { c: [0x5aa070, 0xe0d0a0], p: ['hline', 0x3a2a5a], h: 0.24, tail: 'trunc', dorsal: 'long' },
  takanohadai: { a: 'deep', c: [0xd8c8a8, 0xe8e0d0], p: ['diag', 0x6a4a2a, 5], h: 0.4 },
  umitanago: { a: 'deep', c: [0x8a8070, 0xe0d8d0], h: 0.42 },
  gonzui: { c: [0x3a2a2a, 0x6a5a50], p: ['hlines', 0xe8d040, 2], h: 0.2, whiskers: 1, dorsal: 'long', tail: 'round' },
  hakofugu: { a: 'box', c: [0xd8b040, 0xe8d070], p: ['spots', 0x2a5aa0] },
  isaki: { c: [0x7a7a5a, 0xe0e0d0], p: ['hlines', 0x5a5a3a, 3], h: 0.32 },
  anago: { a: 'eel', c: [0x8a7a5a, 0xe8e0d0], p: ['dots', 0xf0f0e8] },
  houbou: { a: 'rock', c: [0xc0503a, 0xf0d8c8], pec: 0.3, pecC: 0x4ab0a0, dorsal: 'two' },
  minokasago: { a: 'rock', c: [0xe8e0d8, 0xf4f0ec], p: ['vbands', 0x9a2a1a, 9], dorsal: 'tall', pec: 0.32, pecC: 0xd08070 },
  sawara: { c: [0x4a6a8a, 0xe8ecf0], p: ['dots', 0x2a3a5a], h: 0.2, dorsal: 'finlets' },
  hamo: { a: 'eel', c: [0x9a9070, 0xe8e4d8] },
  kanpachi: { c: [0x8a7a6a, 0xe8e4dc], p: ['hline', 0xd0a050], h: 0.3 },
  kue: { a: 'rock', c: [0x7a6a5a, 0xb0a090], p: ['diag', 0x4a3a2a, 4], h: 0.36 },
  sappa: { c: [0x5a7a9a, 0xe8ecf0], h: 0.32 },
  hiiragi: { a: 'deep', c: [0xc8d0d8, 0xf0f4f8], h: 0.5 },
  shimaisaki: { c: [0xc8c0a0, 0xe8e4d4], p: ['hlines', 0x3a3a2a, 4], h: 0.3 },
  ishimochi: { c: [0xa0a0a0, 0xe8e8e8], h: 0.28 },
  kamasu: { c: [0xb07060, 0xe8e0d8], h: 0.15, beak: 0xb07060, dorsal: 'two' },
  hedai: { a: 'deep', c: [0xa8b0b8, 0xe0e4e8], p: ['hlines', 0x8a8a7a, 6] },
  haokoze: { a: 'rock', c: [0x7a6a4a, 0xb0a080], p: ['mottle', 0x3a2a1a], dorsal: 'tall' },
  aigo: { a: 'deep', c: [0x7a7050, 0xc0b8a0], p: ['spots', 0xd8d0b0] },
  tobiuo: { c: [0x2a4a8a, 0xe8ecf4], h: 0.22, pec: 0.4, pecC: 0x6a8ab0 },
  kurosoi: { a: 'rock', c: [0x3a3a3a, 0x6a6a6a] },
  hatahata: { c: [0xc0b090, 0xf0ece0], p: ['mottle', 0x8a6a40], h: 0.24, dorsal: 'two' },
  ishigarei: { a: 'flat', c: [0x6a6a5a], p: ['spots', 0xd0c8b0] },
  kouika: { a: 'squid', c: [0xa08a6a, 0x5a3a2a], cuttle: 1 },
  magochi: { a: 'rock', c: [0x8a7a5a, 0xe8e0d0], p: ['mottle', 0x5a4a30], h: 0.18, w: 1.0 },
  kijihata: { a: 'rock', c: [0xa08a6a, 0xd0b898], p: ['spots', 0xe08a3a] },
  ishigakidai: { a: 'deep', c: [0xd8d0c0, 0xe8e4dc], p: ['spots', 0x2a2a2a] },
  shimaaji: { c: [0x8aa0b0, 0xe8ecf0], p: ['hline', 0xe8c040], h: 0.36 },
  hiramasa: { c: [0x4a6a8a, 0xe8ecf0], p: ['hline', 0xd8c060], h: 0.26 },
  kobudai: { a: 'deep', c: [0xd08a7a, 0xf0d0c0], hump: 1 },
  manbou: { a: 'sunfish', c: [0x8a9aa8, 0xd8dee4] },
};
const ARCH = {
  deep: { h: 0.45, w: 0.32, dorsal: 'spiky', tail: 'fork', tailK: 0.9 },
  rock: { h: 0.32, w: 0.62, blunt: 1, dorsal: 'spiky', tail: 'round', pec: 0.16, eyeY: 0.22 },
  puffer: { h: 0.55, w: 0.9, dorsal: 'tri', tail: 'round', tailK: 0.7, taper: 0.7 },
  box: { h: 0.42, w: 0.9, blunt: 1, dorsal: 'none', tail: 'round', tailK: 0.8 },
  eel: { h: 0.15, w: 0.7, taper: 0.95, dorsal: 'long', tail: 'none' },
};
function buildFish(id) {
  const s0 = FISH[id]; if (!s0) return null;
  const a = s0.a;
  const faceUp = (g) => { const w = new THREE.Group(); g.rotation.x = PI / 2; w.add(g); return w; };   // seen from above, like the side of the others
  if (a === 'flat') return faceUp(flatfish(s0)); if (a === 'ray') return faceUp(ray(s0)); if (a === 'shark') return shark(s0); if (a === 'seahorse') return seahorse(s0);
  if (a === 'squid') return squid(s0); if (a === 'octopus') return octopus(s0); if (a === 'sunfish') return sunfish(s0);
  const s = { ...(ARCH[a] || {}), ...s0 };
  if (a === 'eel') { const g = fish(s); if (s.ribbon) g.scale.set(1, 1.2, 0.3); return g; }
  return fish(s);
}

// ---------------------------------------------------------------- bugs (head +z)
const legs = (g, hex, pairs = 3, len = 0.22, y = 0, zs = [0.08, 0, -0.08], spread = 1, r = 0.012) => {
  for (let k = 0; k < pairs; k++) for (const sd of [-1, 1]) {
    const z = zs[k] ?? 0, kx = sd * len * 0.55 * spread, ky = y + 0.05, fz = z + (k - (pairs - 1) / 2) * 0.09;
    add(g, solid(stick([sd * 0.04, y, z], [kx, ky, fz], r), hex)); add(g, solid(stick([kx, ky, fz], [sd * len * spread, y - 0.07, fz + (k - 1) * 0.06], r, r * 0.6), hex));
  }
};
const antennae = (g, hex, z, y, len = 0.25, spread = 0.12, r = 0.006, curl = 0.1) => {
  for (const sd of [-1, 1]) { const m = [sd * spread * 0.5, y + curl, z + len * 0.55], e = [sd * spread, y + curl * 0.6, z + len]; add(g, solid(stick([sd * 0.02, y, z], m, r), hex)); add(g, solid(stick(m, e, r, r * 0.7), hex)); }
};
const bugEyes = (g, z, y, w, r, hex = 0x111111) => { for (const sd of [-1, 1]) add(g, solid(at(ell(r, r, r, 8, 6), sd * w, y, z), hex)); };
// wings: a shape in the x-z plane reaching out along +x, painted by a function of (x, z); one group per side
function wings(g, outline, painter, op = 0, y = 0.05, z = 0) {
  const sides = [];
  for (const sd of [1, -1]) {
    const w = new THREE.Group(); w.position.set(0, y, z);
    for (const pts of outline) { const geo = pts instanceof THREE.Shape ? new THREE.ShapeGeometry(pts, 10) : shape(pts); geo.rotateX(PI / 2); paint(geo, (c, x, yy, zz) => painter(c, x, zz)); const m = add(w, geo, op ? new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: op, depthWrite: false }) : VCS); m.position.y = 0; }
    w.scale.x = sd; g.add(w); sides.push(w);
  }
  g.userData.wings = [sides[1], sides[0]];   // [left, right] as life.js flaps them
}
// butterfly wings drawn with curves: a forewing with a rounded tip, a round hindwing (with a tail on the swallowtails)
const BFW = (tails, k = 1) => {
  const f = new THREE.Shape(), h = new THREE.Shape(), m = (x, y) => [x * k, y * k];
  f.moveTo(...m(0.02, 0.02)); f.bezierCurveTo(...m(0.12, 0.17), ...m(0.3, 0.25), ...m(0.45, 0.2)); f.bezierCurveTo(...m(0.48, 0.12), ...m(0.43, 0.02), ...m(0.36, -0.01)); f.bezierCurveTo(...m(0.24, -0.03), ...m(0.1, -0.01), ...m(0.02, 0.0));
  h.moveTo(...m(0.02, -0.01)); h.bezierCurveTo(...m(0.2, 0.01), ...m(0.35, -0.06), ...m(0.34, -0.18));
  if (tails) { h.bezierCurveTo(...m(0.32, -0.27), ...m(0.24, -0.3), ...m(0.2, -0.3)); h.lineTo(...m(0.17, -0.44)); h.lineTo(...m(0.13, -0.3)); h.bezierCurveTo(...m(0.06, -0.26), ...m(0.02, -0.14), ...m(0.02, -0.01)); }
  else h.bezierCurveTo(...m(0.32, -0.32), ...m(0.12, -0.34), ...m(0.05, -0.22)), h.bezierCurveTo(...m(0.02, -0.14), ...m(0.01, -0.05), ...m(0.02, -0.01));
  return [f, h];
};
function butterfly(s) {
  const g = new THREE.Group();
  add(g, solid(ell(0.025, 0.025, 0.16), s.body ?? 0x2a2a2a)); add(g, solid(at(ell(0.03, 0.03, 0.03), 0, 0, 0.16), s.body ?? 0x2a2a2a));
  antennae(g, 0x2a2a2a, 0.17, 0.01, 0.2, 0.12, 0.005, 0.03);
  const [m, a, kind] = [C(s.w[0]), C(s.w[1]), s.pat];
  wings(g, BFW(s.tails, s.k ?? 1), (c, x, z) => {
    const r = Math.hypot(x, z); c.copy(m);
    if ((kind === 'tip' || kind === 'tipdots') && x > 0.3 && z > 0.05) c.copy(a);
    if (kind === 'tipdots' && (Math.hypot(x - 0.24, z - 0.08) < 0.03 || Math.hypot(x - 0.2, z + 0.06) < 0.025)) c.copy(a);
    if (kind === 'tipdots' && Math.hypot(x, z) > 0.38) c.lerp(C(0xa8a898), 0.6);
    if (kind === 'edge' && (r > 0.34 || (z < -0.2 && r > 0.25))) c.copy(a);
    if (kind === 'band' && Math.abs(r - 0.22) < 0.05) c.copy(a);
    if (kind === 'veins' && (Math.sin(Math.atan2(z, x) * 18) > 0.75 || r > 0.38)) c.copy(a);
    if (kind === 'spots' && noise(x * 22, z * 22) > 0.68) c.copy(a);
    if (kind === 'eyes' && (Math.hypot(x - 0.22, z + 0.22) < 0.05 || Math.hypot(x - 0.3, z - 0.1) < 0.04)) c.copy(a);
    if (kind === 'stripes' && Math.sin(x * 40 + z * 10) > 0.5) c.copy(a);
    if (s.under && x < 0.06) c.copy(C(s.under));
  });
  g.userData.wings[0].rotation.z = -0.35; g.userData.wings[1].rotation.z = 0.35;
  return g;
}
function dragonfly(s) {
  const g = new THREE.Group();
  const ab = ell(0.025, 0.025, 0.36, 8, 12); ab.translate(0, 0, -0.3); paint(ab, (c, x, y, z) => { c.set(s.c[0]); if (s.c[1] && Math.sin(z * 60) > 0.6) c.set(s.c[1]); }); add(g, ab);
  add(g, solid(at(ell(0.05, 0.05, 0.08), 0, 0, 0.05), s.th ?? s.c[0]));
  bugEyes(g, 0.15, 0.02, 0.04, 0.045, s.eye ?? 0x3a5a8a);
  wings(g, [[[0.03, 0.08], [0.42, 0.11], [0.45, 0.08], [0.05, 0.04]], [[0.03, 0.0], [0.4, -0.04], [0.43, -0.08], [0.05, -0.05]]], (c, x) => { c.set(s.wing ?? 0xe8f0f8); if (x > 0.38) c.set(0x3a3020); }, 0.45, 0.04, 0);
  legs(g, 0x1a1a1a, 3, 0.1, -0.03, [0.08, 0.05, 0.02], 0.8, 0.006);
  return g;
}
function cicada(s) {
  const g = new THREE.Group();
  add(g, solid(at(ell(0.09, 0.07, 0.16), 0, 0, 0), s.c));
  add(g, solid(at(ell(0.1, 0.06, 0.06), 0, 0.01, 0.16), s.c));
  bugEyes(g, 0.17, 0.03, 0.09, 0.03, 0x6a5a3a);
  wings(g, [[[0.03, 0.15], [0.12, 0.17], [0.2, -0.2], [0.14, -0.3], [0.04, -0.12]]], (c, x, z) => { c.set(s.wing ?? 0xd8e8e0); if (Math.sin(x * 50) > 0.85 || Math.sin(z * 40) > 0.9) c.set(s.vein ?? 0x3a5a3a); }, s.wing ? 0 : 0.55, 0.07, 0);
  for (const w of g.userData.wings) w.rotation.y = 0;
  legs(g, s.c, 3, 0.16, -0.05, [0.1, 0.03, -0.04], 0.9, 0.012);
  return g;
}
function beetle(s) {
  const g = new THREE.Group(), L = s.L ?? 0.22, Wd = s.W ?? 0.14;
  const el = ell(Wd, Wd * 0.7, L, 18, 12); el.translate(0, 0.02, -0.06);
  const P = el.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) < 0.02) P.setY(i, 0.02 - (0.02 - P.getY(i)) * 0.3);
  el.computeVertexNormals();
  paint(el, (c, x, y, z) => {
    c.set(s.c); const met = s.metal;
    if (met) c.lerp(C(met), 0.5 + 0.5 * Math.sin(x * 30));
    if (s.spots && noise(x * 22 + 2, z * 22) > 0.66) c.set(s.spots);
    if (s.nspots) { for (let k = 0; k < s.nspots; k++) { const a = k * 2.4, sx = Math.cos(a) * Wd * 0.55 * ((k % 3) / 2 + 0.3), sz = -0.06 + Math.sin(a) * L * 0.55; if (Math.hypot(x - sx, z - sz) < 0.035) c.set(s.spotC ?? 0x111111); } }
    if (s.rim && Math.abs(x) > Wd * 0.82) c.set(s.rim);
    if (s.bands && Math.sin(z * 30) > 0.4) c.set(s.bands);
    if (Math.abs(x) < 0.006 && y > 0.06) c.multiplyScalar(0.6);
  });
  add(g, el);
  add(g, solid(at(ell(Wd * 0.8, Wd * 0.55, 0.07), 0, 0.03, L - 0.04), s.pro ?? s.c));
  add(g, solid(at(ell(Wd * 0.5, Wd * 0.4, 0.05), 0, 0.02, L + 0.04), s.head ?? s.pro ?? s.c));
  bugEyes(g, L + 0.06, 0.04, Wd * 0.4, 0.015, 0x222222);
  const hc = s.hornC ?? s.c;
  if (s.horn === 'kabuto') { add(g, solid(stick([0, 0.04, L + 0.07], [0, 0.18, L + 0.28], 0.025, 0.012), hc)); add(g, solid(stick([0, 0.18, L + 0.28], [0, 0.22, L + 0.24], 0.01), hc)); add(g, solid(stick([0, 0.06, L - 0.02], [0, 0.14, L + 0.1], 0.016, 0.008), hc)); }
  if (s.horn === 'noko' || s.horn === 'miyama' || s.horn === 'okuwa') {
    const len = s.horn === 'noko' ? 0.22 : s.horn === 'miyama' ? 0.18 : 0.14, bend = s.horn === 'noko' ? 0.08 : 0.04;
    for (const sd of [-1, 1]) { const a = [sd * 0.03, 0.03, L + 0.07], m = [sd * (0.07 + bend), 0.05, L + 0.07 + len * 0.55], e = [sd * 0.025, 0.04, L + 0.07 + len]; add(g, solid(stick(a, m, 0.018, 0.013), hc)); add(g, solid(stick(m, e, 0.013, 0.006), hc)); }
  }
  if (s.long) antennae(g, s.antC ?? 0x111111, L + 0.06, 0.04, 0.5, 0.5, 0.008, 0.05);
  else antennae(g, 0x221a14, L + 0.06, 0.03, 0.08, 0.1, 0.005, 0.02);
  legs(g, s.leg ?? 0x1a120c, 3, s.legLen ?? 0.22, -0.01, [0.1, 0.0, -0.1], 1, 0.013);
  if (s.glowTail) { const t = at(ell(Wd * 0.8, Wd * 0.4, 0.06), 0, 0.0, -L - 0.03); const m = add(g, t, glowMat(s.glowTail), true); g.userData.glow = m; }
  return g;
}
function hopper(s) {   // grasshoppers, crickets, katydids, mantises, stick insects
  const g = new THREE.Group(), L = s.L ?? 0.36;
  const b = ell(0.05 * (s.fat ?? 1), 0.055 * (s.fat ?? 1), L / 2, 10, 14); b.translate(0, 0.02, -0.04); paint(b, (c, x, y, z) => { c.set(s.c); if (s.c2 && y > 0.04) c.set(s.c2); }); add(g, b);
  const head = s.mantis ? solid(at(new THREE.ConeGeometry(0.06, 0.05, 3), 0, 0.05, L / 2 + 0.03, PI / 2, 0, PI), s.c) : solid(at(ell(0.045, 0.05, s.pointy ? 0.08 : 0.05), 0, 0.03, L / 2 + 0.02), s.c);
  add(g, head);
  if (s.mantis) { add(g, solid(stick([0, 0.03, L / 2 - 0.05], [0, 0.06, L / 2 - 0.18], 0.025), s.c)); for (const sd of [-1, 1]) { add(g, solid(stick([sd * 0.02, 0.04, L / 2 - 0.08], [sd * 0.05, 0.1, L / 2 + 0.05], 0.014), s.c)); add(g, solid(stick([sd * 0.05, 0.1, L / 2 + 0.05], [sd * 0.04, 0.02, L / 2 + 0.04], 0.012), s.c)); } }
  bugEyes(g, L / 2 + 0.04, 0.06, 0.035, 0.016, s.eye ?? 0x3a2a1a);
  if (s.wing) wings(g, [[[0.0, 0.08], [0.06, 0.06], [0.08, -L * 0.55], [0.01, -L * 0.6]]], (c, x, z) => { c.set(s.wing); if (Math.sin(z * 60) > 0.8) c.multiplyScalar(0.8); }, 0, 0.07, 0);
  antennae(g, s.antC ?? s.c, L / 2 + 0.05, 0.05, s.antLen ?? 0.2, 0.2, 0.005, 0.06);
  for (const sd of [-1, 1]) {   // big hind legs
    if (s.jump !== false && !s.mantis) { add(g, solid(stick([sd * 0.04, 0.02, -0.02], [sd * 0.08, 0.14, -0.14], 0.022, 0.012), s.c)); add(g, solid(stick([sd * 0.08, 0.14, -0.14], [sd * 0.09, -0.06, -0.24], 0.01), s.c)); }
  }
  legs(g, s.c, s.mantis ? 2 : 2, 0.16, -0.01, [0.08, 0.0], 1, 0.009);
  return g;
}
function ant(s) {
  const g = new THREE.Group();
  add(g, solid(at(ell(0.08, 0.07, 0.11), 0, 0.03, -0.14), s.c));
  add(g, solid(at(ell(0.04, 0.04, 0.07), 0, 0.03, 0.0), s.c));
  add(g, solid(at(ell(0.06, 0.055, 0.06), 0, 0.04, 0.11), s.c));
  if (s.bee) { const ab = ell(0.085, 0.075, 0.12); ab.translate(0, 0.03, -0.14); paint(ab, (c, x, y, z) => c.set(Math.sin(z * 55) > 0 ? 0xe8b020 : 0x2a2010)); g.children[0].geometry = ab; wings(g, [[[0.02, 0.04], [0.2, 0.0], [0.22, -0.06], [0.03, -0.02]]], (c) => c.set(0xe8f0f8), 0.5, 0.09, 0); }
  bugEyes(g, 0.14, 0.06, 0.04, 0.018);
  antennae(g, s.c, 0.15, 0.05, 0.15, 0.16, 0.006, 0.08);
  legs(g, s.c, 3, 0.2, 0.0, [0.03, 0.0, -0.03], 1, 0.01);
  return g;
}
function crab(s) {
  const g = new THREE.Group(), w = s.w ?? 0.2;
  const b = ell(w, 0.07, w * 0.8, 18, 10); b.translate(0, 0.07, 0); paint(b, (c, x, y, z) => { c.set(s.c); if (s.stripe && Math.sin(x * 40 + z * 20) > 0.5) c.set(s.stripe); if (s.c2 && y < 0.07) c.set(s.c2); }); add(g, b);
  for (const sd of [-1, 1]) {
    add(g, solid(stick([sd * w * 0.6, 0.08, w * 0.6], [sd * w * 0.9, 0.1, w * 1.1], 0.03), s.claw ?? s.c));
    add(g, solid(at(ell(0.05, 0.04, 0.07), sd * w * 0.92, 0.1, w * 1.2), s.claw ?? s.c));
    add(g, solid(stick([sd * 0.04, 0.12, w * 0.7], [sd * 0.05, 0.2, w * 0.75], 0.01), s.c)); add(g, solid(at(ell(0.02, 0.02, 0.02), sd * 0.05, 0.21, w * 0.75), 0x111111));
    for (let k = 0; k < 4; k++) { const z = w * 0.4 - k * w * 0.32, kx = sd * (w + 0.08); add(g, solid(stick([sd * w * 0.7, 0.06, z], [kx, 0.12, z - 0.02], 0.014), s.c)); add(g, solid(stick([kx, 0.12, z - 0.02], [sd * (w + 0.16), 0.0, z - 0.06], 0.012, 0.006), s.c)); }
  }
  return g;
}
function spiral(s) {   // a coiled shell: a tube winding up a cone, thick at the opening and fine at the tip
  const turns = s.turns ?? 3, R = s.R ?? 0.22, up = s.up ?? 0.3, n = Math.ceil(28 * turns), pts = [];
  const helix = (u) => R * 0.62 * Math.pow(1 - u, 0.95), tubeR = (u) => R * 0.6 * Math.pow(1 - u, 1.15) + 0.006;
  for (let i = 0; i <= n; i++) { const u = i / n, a = u * turns * TAU; pts.push(new THREE.Vector3(Math.cos(a) * helix(u), u * up, Math.sin(a) * helix(u))); }
  const curve = new THREE.CatmullRomCurve3(pts), tube = new THREE.TubeGeometry(curve, n, 1, 14, false), P = tube.attributes.position, N = tube.attributes.normal;
  for (let i = 0; i < P.count; i++) { const u = Math.floor(i / 15) / n, c = curve.getPointAt(Math.min(1, u)), r = tubeR(u) * (s.spines && u < 0.65 && (i % 15) % 5 === 0 ? 1.25 : 1); P.setXYZ(i, c.x + N.getX(i) * r, c.y + N.getY(i) * r, c.z + N.getZ(i) * r); }
  tube.computeVertexNormals();
  const parts = [tube.toNonIndexed()];
  // the opening, a little darker inside
  const lip = new THREE.CircleGeometry(tubeR(0) * 0.92, 14).toNonIndexed(); lip.lookAt(curve.getTangentAt(0).negate()); lip.translate(pts[0].x, pts[0].y, pts[0].z); parts.push(lip);
  if (s.spines) for (let i = 0; i < n * 0.6; i += 3) { const u = i / n, c = curve.getPointAt(u), out = new THREE.Vector3(c.x, 0, c.z).normalize(), r = tubeR(u); const sv = new THREE.ConeGeometry(0.018 + r * 0.12, r * 0.9, 5).toNonIndexed(); sv.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), out.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize())); sv.translate(c.x + out.x * r * 0.9, c.y + r * 0.4, c.z + out.z * r * 0.9); parts.push(sv); }
  const geo = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }));
  paint(geo, (c, x, y, z) => {
    c.set(s.c); const a = Math.atan2(z, x);
    if (s.stripe && Math.sin(y * (s.sf ?? 60) + a * 0.5) > 0.35) c.set(s.stripe);
    if (s.check && Math.sin(y * 70) * Math.sin(a * 8) > 0.3) c.set(s.check);
    c.multiplyScalar(0.85 + 0.15 * Math.min(1, y / Math.max(0.01, up)));
  });
  const g = new THREE.Group(); add(g, geo); return g;
}
function snail(s) {
  const g = new THREE.Group(), sh = spiral({ c: s.c, stripe: s.stripe, R: 0.2, up: 0.12, turns: 3, sf: 50 }); sh.rotation.x = PI / 2.4; sh.position.set(0, 0.2, -0.05); g.add(sh);
  if (s.slug !== false) {
    const body = ell(0.07, 0.05, 0.3, 12, 10); body.translate(0, 0.04, 0.02); solid(body, s.body ?? 0xb8a890); add(g, body);
    for (const sd of [-1, 1]) { add(g, solid(stick([sd * 0.02, 0.06, 0.28], [sd * 0.05, 0.18, 0.34], 0.008), s.body ?? 0xb8a890)); add(g, solid(at(ell(0.015, 0.015, 0.015), sd * 0.05, 0.19, 0.345), 0x2a2a2a)); }
  }
  return g;
}

const BUGS = {
  ari: () => ant({ c: 0x1a1410 }),
  funamushi: () => isopod({ c: 0x5a554c, flat: 1 }),
  monshiro: () => butterfly({ w: [0xe4dfc2, 0x2a2a2a], pat: 'tipdots', body: 0x5a5a5a }),
  nanahoshi: () => beetle({ c: 0xd8261c, nspots: 7, pro: 0x111111, L: 0.13, W: 0.12, legLen: 0.14 }),
  yadokari: () => hermit({ c: 0xd8a070, shell: 0xc89068 }),
  amenbo: () => strider({ c: 0x2a2a28 }),
  shiokara: () => dragonfly({ c: [0x7a9ec8, 0x2a2a2a], th: 0x5a6a7a, eye: 0x3a6a9a }),
  akiakane: () => dragonfly({ c: [0xd63a22], th: 0x9a4a2a, eye: 0x8a3a20 }),
  aburazemi: () => cicada({ c: 0x4a3420, wing: 0x7a5a38, vein: 0x4a3420 }),
  koorogi: () => hopper({ c: 0x2a1e14, fat: 1.3, wing: 0x3a2a1a, antLen: 0.35, L: 0.3 }),
  katatsumuri: () => snail({ c: 0xb08850, stripe: 0x6a4a2a }),
  mitsubachi: () => ant({ c: 0x6a4a1a, bee: 1 }),
  ageha: () => butterfly({ w: [0xf0d040, 0x1a1a1a], pat: 'veins', tails: 1 }),
  minminzemi: () => cicada({ c: 0x3a5a3a }),
  tonosama: () => hopper({ c: 0x8a8a4a, wing: 0x8a7a5a, L: 0.4 }),
  tsukutsuku: () => cicada({ c: 0x4a5a3a }),
  suzumushi: () => hopper({ c: 0x14120e, fat: 1.2, wing: 0x2a2620, antLen: 0.4, L: 0.26 }),
  kamakiri: () => hopper({ c: 0x6ab03a, mantis: 1, L: 0.5, wing: 0x7ac04a }),
  higurashi: () => cicada({ c: 0x7a5a30, vein: 0x5a8a6a }),
  aosujiageha: () => butterfly({ w: [0x1a1a1a, 0x3ac0b0], pat: 'band', k: 0.95 }),
  sunagani: () => crab({ c: 0xd8c8a0, w: 0.18 }),
  ginyanma: () => dragonfly({ c: [0x6a9a4a, 0x4a80c8], th: 0x5ab05a, eye: 0x4a8a5a }),
  nokogiri: () => beetle({ c: 0x6a2a14, horn: 'noko', L: 0.2, W: 0.12 }),
  genjibotaru: () => beetle({ c: 0x2a2420, pro: 0xd84a3a, L: 0.14, W: 0.07, glowTail: 0xd8ff6a, legLen: 0.12 }),
  kabutomushi: () => beetle({ c: 0x4a2a12, horn: 'kabuto', L: 0.24, W: 0.15, metal: 0x6a3a1a }),
  oniyanma: () => dragonfly({ c: [0x1a1a14, 0xe8d030], th: 0x2a2a1a, eye: 0x3aa04a }),
  omurasaki: () => butterfly({ w: [0x5a3aa8, 0xf0e8c0], pat: 'spots', under: 0x3a2a5a }),
  miyama: () => beetle({ c: 0x7a4a24, horn: 'miyama', L: 0.2, W: 0.13, metal: 0xa07a4a }),
  tamamushi: () => beetle({ c: 0x2aa070, metal: 0x2a7ac0, bands: 0xc84a8a, L: 0.22, W: 0.09 }),
  okuwagata: () => beetle({ c: 0x14100c, horn: 'okuwa', L: 0.22, W: 0.12, metal: 0x2a2018 }),
  dangomushi: () => isopod({ c: 0x3a3a3e, round: 1 }),
  yamatoshijimi: () => butterfly({ w: [0x8a9ad8, 0x3a3a5a], pat: 'edge', k: 0.6 }),
  usubakitonbo: () => dragonfly({ c: [0xd8b040, 0x6a4a1a], th: 0xc8a040, eye: 0x9a5a3a }),
  shouryoubatta: () => hopper({ c: 0x8ac04a, pointy: 1, L: 0.5, wing: 0x9ac85a }),
  niiniizemi: () => cicada({ c: 0x6a7a5a, wing: 0x8a8a6a, vein: 0x4a5a3a }),
  kanabun: () => beetle({ c: 0x6a7a3a, metal: 0x8a6a2a, L: 0.18, W: 0.12 }),
  amagaeru: () => frog({ c: 0x6ac04a }),
  misujimaimai: () => snail({ c: 0xd8c8a0, stripe: 0x5a3a2a }),
  uraginshijimi: () => butterfly({ w: [0xd8d8e0, 0xd86a2a], pat: 'band', k: 0.65 }),
  benkeigani: () => crab({ c: 0xb83a2a, w: 0.17 }),
  kumazemi: () => cicada({ c: 0x1a1a1a, vein: 0x4a6a3a }),
  fuyushaku: () => butterfly({ w: [0xb0a890, 0x7a6a5a], pat: 'stripes', body: 0x7a6a5a, k: 0.8 }),
  hanmyou: () => beetle({ c: 0x2a6aa0, bands: 0xd84a2a, metal: 0x4ab07a, L: 0.16, W: 0.09, head: 0x3a9a5a, legLen: 0.2 }),
  asagimadara: () => butterfly({ w: [0xa8d8e8, 0x2a2a2a], pat: 'veins', under: 0x8a3a20, k: 1.1 }),
  rurihoshi: () => beetle({ c: 0x6ab0d8, spots: 0x111111, long: 1, antC: 0x6ab0d8, L: 0.18, W: 0.07 }),
  hamatobimushi: () => isopod({ c: 0xb8a888, hop: 1 }),
  namitentou: () => beetle({ c: 0x141414, nspots: 2, spotC: 0xd8261c, pro: 0x111111, L: 0.13, W: 0.12, legLen: 0.14 }),
  himeakatateha: () => butterfly({ w: [0xe08a3a, 0x1a1a1a], pat: 'tip' }),
  kanetataki: () => hopper({ c: 0x7a5a3a, fat: 1.2, L: 0.18, antLen: 0.3 }),
  kiageha: () => butterfly({ w: [0xf0d850, 0x1a1a1a], pat: 'edge', tails: 1 }),
  tsumaguro: () => butterfly({ w: [0xe8903a, 0x1a1a1a], pat: 'spots' }),
  yamanamekuji: () => slug({ c: 0x8a7a5a }),
  umaoi: () => hopper({ c: 0x6ab04a, wing: 0x7ab85a, antLen: 0.55, L: 0.36 }),
  murasakishijimi: () => butterfly({ w: [0x6a3aa8, 0x3a2a2a], pat: 'edge', k: 0.6, under: 0x8a6a4a }),
  minomushi: () => bagworm({ c: 0x8a6a4a }),
  harabiro: () => hopper({ c: 0x7ab84a, mantis: 1, L: 0.4, fat: 1.4, wing: 0x8ac85a }),
  isokomorigumo: () => spider({ c: 0xc8b898 }),
  kitateha: () => butterfly({ w: [0xd8a030, 0x5a3a1a], pat: 'spots' }),
  kutsuwamushi: () => hopper({ c: 0x5a9a3a, fat: 1.5, wing: 0x6aa84a, antLen: 0.5, L: 0.4 }),
  taikouchi: () => waterbug({ c: 0x5a4a3a, tube: 1 }),
  mizukamakiri: () => waterbug({ c: 0x8a7a5a, stick: 1 }),
  heikebotaru: () => beetle({ c: 0x2a2420, pro: 0xd86a4a, L: 0.12, W: 0.06, glowTail: 0xd8ff6a, legLen: 0.11 }),
  yukimushi: () => aphid({ c: 0x6a8a9a }),
  ruritateha: () => butterfly({ w: [0x1a1a2a, 0x4a9ad8], pat: 'band' }),
  gengorou: () => beetle({ c: 0x1a2a1a, rim: 0xd8c040, metal: 0x2a4a2a, L: 0.2, W: 0.13, legLen: 0.24 }),
};
function isopod(s) {
  const g = new THREE.Group(), n = 9;
  for (let k = 0; k < n; k++) { const z = 0.15 - k * 0.035, w = (s.round ? 0.12 : 0.1) * Math.sin(((k + 1) / (n + 1)) * PI) ** 0.5; const seg = ell(w, s.round ? 0.08 : 0.035, 0.03, 12, 6); seg.translate(0, s.hop ? 0.04 + Math.sin(k * 0.6) * 0.04 : 0.03, z); add(g, solid(seg, k % 2 ? new THREE.Color(s.c).multiplyScalar(0.85).getHex() : s.c)); }
  antennae(g, s.c, 0.17, 0.03, 0.18, 0.2, 0.008, 0.02); legs(g, s.c, 3, 0.15, 0.0, [0.08, 0.0, -0.08], 1, 0.008);
  if (!s.round) for (const sd of [-1, 1]) add(g, solid(stick([sd * 0.02, 0.03, -0.17], [sd * 0.06, 0.03, -0.26], 0.008), s.c));
  return g;
}
function hermit(s) { const g = new THREE.Group(), sh = spiral({ c: s.shell, stripe: 0xa86a48, R: 0.18, up: 0.2 }); sh.rotation.x = PI / 2.2; sh.position.set(0, 0.15, -0.08); g.add(sh); const c = crab({ c: s.c, w: 0.08 }); c.position.z = 0.12; g.add(c); return g; }
function strider(s) { const g = new THREE.Group(); add(g, solid(ell(0.03, 0.025, 0.14), s.c)); bugEyes(g, 0.14, 0.02, 0.025, 0.012); for (const sd of [-1, 1]) for (const [z, len] of [[0.08, 0.15], [0.0, 0.42], [-0.04, 0.38]]) add(g, solid(stick([sd * 0.02, 0, z], [sd * len * 0.6, -0.02, z + (z > 0 ? 0.08 : -0.2)], 0.006), s.c)); antennae(g, s.c, 0.15, 0.02, 0.1, 0.1, 0.005, 0.01); return g; }
function waterbug(s) {
  const g = new THREE.Group();
  if (s.stick) { add(g, solid(stick([0, 0.02, -0.4], [0, 0.02, 0.4], 0.02), s.c)); for (const sd of [-1, 1]) { add(g, solid(stick([sd * 0.01, 0.02, 0.3], [sd * 0.05, 0.08, 0.45], 0.01), s.c)); add(g, solid(stick([sd * 0.01, 0.02, 0.0], [sd * 0.25, -0.02, -0.1], 0.006), s.c)); add(g, solid(stick([sd * 0.01, 0.02, -0.1], [sd * 0.25, -0.02, -0.3], 0.006), s.c)); } add(g, solid(stick([0, 0.02, -0.4], [0, 0.02, -0.7], 0.005), s.c)); return g; }
  add(g, solid(ell(0.1, 0.03, 0.18), s.c)); add(g, solid(at(ell(0.04, 0.03, 0.04), 0, 0.01, 0.19), s.c)); bugEyes(g, 0.2, 0.03, 0.035, 0.012);
  for (const sd of [-1, 1]) { add(g, solid(stick([sd * 0.04, 0, 0.15], [sd * 0.1, 0.03, 0.3], 0.014), s.c)); legs(g, s.c, 1, 0.2, 0, [-0.05], 1, 0.008); }
  if (s.tube) for (const sd of [-0.01, 0.01]) add(g, solid(stick([sd, 0, -0.18], [sd, 0.01, -0.42], 0.005), s.c));
  return g;
}
function frog(s) {
  const g = new THREE.Group(); const b = ell(0.14, 0.1, 0.18, 16, 12); b.translate(0, 0.1, 0); paint(b, (c, x, y) => c.set(y > 0.08 ? s.c : 0xf0f0d8)); add(g, b);
  const h = ell(0.13, 0.08, 0.1, 14, 10); h.translate(0, 0.14, 0.14); paint(h, (c, x, y) => c.set(y > 0.12 ? s.c : 0xf0f0d8)); add(g, h);
  for (const sd of [-1, 1]) { eye(g, sd * 0.08, 0.21, 0.17, 0.035); add(g, solid(stick([sd * 0.1, 0.06, 0.1], [sd * 0.16, 0.0, 0.2], 0.022, 0.015), s.c)); add(g, solid(stick([sd * 0.12, 0.08, -0.1], [sd * 0.24, 0.02, -0.05], 0.035, 0.02), s.c)); add(g, solid(stick([sd * 0.24, 0.02, -0.05], [sd * 0.2, 0.0, -0.24], 0.022, 0.015), s.c)); }
  return g;
}
function slug(s) { const g = new THREE.Group(), b = ell(0.07, 0.06, 0.36, 12, 12); b.translate(0, 0.05, 0); paint(b, (c, x, y, z) => { c.set(s.c); if (Math.abs(x) > 0.02 && Math.abs(x) < 0.035 && y > 0.06) c.set(0x3a2a1a); }); add(g, b); for (const sd of [-1, 1]) { add(g, solid(stick([sd * 0.02, 0.08, 0.3], [sd * 0.05, 0.2, 0.36], 0.008), s.c)); add(g, solid(at(ell(0.014, 0.014, 0.014), sd * 0.05, 0.21, 0.365), 0x2a2a2a)); } return g; }
function bagworm(s) { const g = new THREE.Group(), cone = new THREE.ConeGeometry(0.1, 0.42, 8, 6); cone.rotateX(PI / 2); cone.translate(0, 0.1, -0.05); const P = cone.attributes.position; for (let i = 0; i < P.count; i++) P.setX(i, P.getX(i) * (1 + 0.25 * noise(P.getZ(i) * 30, P.getY(i) * 20))); cone.computeVertexNormals(); paint(cone, (c, x, y, z) => c.set(noise(x * 40, z * 30) > 0.5 ? s.c : 0x6a5a3a)); add(g, cone); for (let k = 0; k < 7; k++) add(g, solid(stick([Math.sin(k) * 0.06, 0.12 + Math.cos(k * 2) * 0.05, -0.2 + k * 0.05], [Math.sin(k) * 0.12, 0.14, -0.22 + k * 0.05], 0.008), 0x7a5a3a)); add(g, solid(at(ell(0.04, 0.04, 0.04), 0, 0.12, 0.17), 0x3a2a1a)); add(g, solid(stick([0, 0.2, -0.25], [0, 0.4, -0.3], 0.006), 0xd8d0c0)); return g; }
function spider(s) { const g = new THREE.Group(); add(g, solid(at(ell(0.11, 0.09, 0.14), 0, 0.08, -0.12), s.c)); add(g, solid(at(ell(0.08, 0.05, 0.09), 0, 0.06, 0.08), s.c)); bugEyes(g, 0.16, 0.08, 0.025, 0.012); for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) { const z = 0.12 - k * 0.05, kx = sd * 0.2; add(g, solid(stick([sd * 0.05, 0.06, z], [kx, 0.16, z + (1.5 - k) * 0.08], 0.012), s.c)); add(g, solid(stick([kx, 0.16, z + (1.5 - k) * 0.08], [sd * 0.32, 0.0, z + (1.5 - k) * 0.14], 0.01, 0.006), s.c)); } return g; }
function aphid(s) { const g = new THREE.Group(); add(g, solid(ell(0.06, 0.05, 0.08), s.c)); const fluff = ell(0.13, 0.1, 0.12, 12, 8); fluff.translate(0, 0.05, -0.08); const P = fluff.attributes.position; for (let i = 0; i < P.count; i++) { const k = 1 + 0.35 * noise(P.getX(i) * 40, P.getY(i) * 40 + P.getZ(i) * 30); P.setXYZ(i, P.getX(i) * k, 0.05 + (P.getY(i) - 0.05) * k, -0.08 + (P.getZ(i) + 0.08) * k); } fluff.computeVertexNormals(); add(g, solid(fluff, 0xf8f8f8)); wings(g, [[[0.02, 0.04], [0.18, 0.02], [0.2, -0.05], [0.03, -0.02]]], (c) => c.set(0xe8f0f8), 0.5, 0.06, 0); return g; }

// ---------------------------------------------------------------- sea creatures (head +z)
function star(s) {
  const g = new THREE.Group(), n = s.n ?? 5, parts = [];
  parts.push((() => { const d = new THREE.CylinderGeometry(s.disc ?? 0.12, s.disc ?? 0.12, 0.05, 20); d.translate(0, 0.025, 0); return d.toNonIndexed(); })());
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU, len = s.len ?? 0.4, pts = [];
    for (let i = 0; i <= 8; i++) { const u = i / 8, w = s.thin ? Math.sin(u * 11 + k) * 0.06 : 0; pts.push(new THREE.Vector3(Math.cos(a) * u * len - Math.sin(a) * w, 0.03, Math.sin(a) * u * len + Math.cos(a) * w)); }
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, s.thin ? 0.018 : 0.06, 6), P = tg.attributes.position, N = tg.attributes.normal;
    for (let i = 0; i < P.count; i++) { const u = Math.floor(i / 7) / 12, sh = (1 - u * 0.75) - 1; P.setXYZ(i, P.getX(i) + N.getX(i) * (s.thin ? 0.018 : 0.06) * sh, Math.max(0, P.getY(i) + N.getY(i) * (s.thin ? 0.018 : 0.06) * sh), P.getZ(i) + N.getZ(i) * (s.thin ? 0.018 : 0.06) * sh); }
    parts.push(tg.toNonIndexed());
    if (s.branch) for (const sd of [-1, 1]) { const b0 = pts[4], b1 = b0.clone().add(new THREE.Vector3(Math.cos(a + sd * 0.8) * 0.18, 0, Math.sin(a + sd * 0.8) * 0.18)); parts.push(stick([b0.x, b0.y, b0.z], [b1.x, b1.y, b1.z], 0.012, 0.005).toNonIndexed()); }
  }
  const geo = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }));
  paint(geo, (c, x, y, z) => { c.set(s.c); if (s.c2 && noise(x * 20, z * 20) > 0.6) c.set(s.c2); });
  add(g, geo); return g;
}
function urchin(s) {
  const g = new THREE.Group(), body = ell(0.16, s.flat ? 0.03 : 0.12, 0.16, 18, 12); body.translate(0, s.flat ? 0.03 : 0.1, 0);
  paint(body, (c, x, y, z) => { c.set(s.c); if (s.flat && Math.cos(Math.atan2(z, x) * 5) > 0.6 && Math.hypot(x, z) < 0.12) c.set(s.c2); }); add(g, body);
  if (!s.flat) { const n = 70, sp = []; for (let i = 0; i < n; i++) { const y = 1 - (i / (n - 1)) * 1.3, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.4; const d = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize(); const base = d.clone().multiply(new THREE.Vector3(0.16, 0.12, 0.16)).add(new THREE.Vector3(0, 0.1, 0)); sp.push(stick(base.toArray(), base.clone().addScaledVector(d, s.len ?? 0.12).toArray(), 0.008, 0.002, 4).toNonIndexed()); } const geo = mergeGeometries(sp); solid(geo, s.spine ?? s.c); add(g, geo); }
  return g;
}
function anemone(s) {
  const g = new THREE.Group(), col = new THREE.CylinderGeometry(0.14, 0.16, s.blob ? 0.14 : 0.2, 16); col.translate(0, s.blob ? 0.07 : 0.1, 0); paint(col, (c, x, y) => { c.set(s.c); if (s.dots && noise(x * 30, y * 30) > 0.6) c.set(s.dots); }); add(g, col);
  if (!s.blob) { const tents = []; for (let i = 0; i < 28; i++) { const a = i * 2.4, rr = 0.03 + (i % 4) * 0.03; tents.push(stick([Math.cos(a) * rr, 0.2, Math.sin(a) * rr], [Math.cos(a) * (rr + 0.08), 0.32 + (i % 3) * 0.03, Math.sin(a) * (rr + 0.08)], 0.012, 0.005, 4).toNonIndexed()); } add(g, solid(mergeGeometries(tents), s.t ?? s.c)); }
  else add(g, solid(at(ell(0.15, 0.08, 0.15), 0, 0.12, 0), s.c));
  return g;
}
function jelly(s) {
  const g = new THREE.Group(), bell = new THREE.SphereGeometry(0.3, 24, 12, 0, TAU, 0, PI / 2); bell.scale(1, 0.55, 1); bell.translate(0, 0.25, 0);
  add(g, solid(bell, s.c), new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false }));
  for (let k = 0; k < 4; k++) { const a = k * PI / 2, r = new THREE.TorusGeometry(0.05, 0.012, 6, 14); r.rotateX(PI / 2); r.translate(Math.cos(a) * 0.1, 0.3, Math.sin(a) * 0.1); add(g, solid(r, 0xd8a0d0)); }
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; add(g, solid(stick([Math.cos(a) * 0.28, 0.25, Math.sin(a) * 0.28], [Math.cos(a) * 0.3, 0.02, Math.sin(a) * 0.3], 0.004), 0xe8e8f8)); }
  return g;
}
function seaslug(s) {
  const g = new THREE.Group(), b = ell(s.w ?? 0.1, 0.07, 0.3, 16, 12); b.translate(0, 0.07, 0);
  paint(b, (c, x, y, z) => { c.set(s.c); if (s.rim && Math.abs(x) > (s.w ?? 0.1) * 0.8) c.set(s.rim); if (s.dots && noise(x * 30, z * 30) > 0.65) c.set(s.dots); if (s.hairy && noise(x * 60, z * 60) > 0.6) c.multiplyScalar(0.8); });
  add(g, b);
  for (const sd of [-1, 1]) add(g, solid(stick([sd * 0.03, 0.12, 0.24], [sd * 0.05, 0.22, 0.28], 0.016, 0.008), s.horn ?? s.c));
  if (s.gills) for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; add(g, solid(stick([0, 0.13, -0.18], [Math.cos(a) * 0.05, 0.22, -0.18 + Math.sin(a) * 0.05], 0.01, 0.004), s.gills)); }
  if (s.ears) for (const sd of [-1, 1]) add(g, solid(at(ell(0.02, 0.06, 0.04), sd * 0.05, 0.16, 0.2), s.c));
  return g;
}
function shrimp(s) {
  const g = new THREE.Group(), n = 7;
  for (let k = 0; k < n; k++) { const u = k / (n - 1), z = 0.2 - u * 0.45, y = 0.06 + Math.sin(u * 2.5) * 0.06, w = 0.07 * (1 - u * 0.5) * (s.big ? 1.4 : 1); const seg = ell(w, w * 0.85, 0.06, 12, 8); seg.translate(0, y, z); paint(seg, (c, x, yy) => { c.set(s.c); if (s.stripe && (k % 2)) c.set(s.stripe); }); add(g, seg); }
  add(g, solid(at(shape([[0, 0], [-0.08, -0.08], [0.08, -0.08]]), 0, 0.08, -0.3, -PI / 2), s.c), VCS);
  for (const sd of [-1, 1]) { add(g, solid(stick([sd * 0.03, 0.08, 0.24], [sd * 0.2, 0.15, 0.7], 0.008, 0.003), s.c)); add(g, solid(at(ell(0.016, 0.016, 0.016), sd * 0.04, 0.1, 0.25), 0x111111)); }
  legs(g, s.c, 4, 0.12, 0.02, [0.15, 0.1, 0.05, 0.0], 1, 0.007);
  if (s.big) for (const sd of [-1, 1]) add(g, solid(stick([sd * 0.05, 0.1, 0.22], [sd * 0.08, 0.14, 0.4], 0.02, 0.01), s.c));
  return g;
}
function abalone(s) {
  const g = new THREE.Group(), b = ell(0.22, 0.08, 0.3, 20, 10); b.translate(0, 0.06, 0); const P = b.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) < 0.05) P.setY(i, 0.05 - (0.05 - P.getY(i)) * 0.2);
  b.computeVertexNormals(); paint(b, (c, x, y, z) => { c.set(s.c); if (Math.sin(Math.hypot(x + 0.1, z + 0.15) * 70) > 0.5) c.multiplyScalar(0.8); if (Math.abs(x - 0.14) < 0.02 && Math.sin(z * 40) > 0.4) c.set(0x2a2a2a); }); add(g, b);
  return g;
}
function mussel(s) { const g = new THREE.Group(); for (const sd of [-1, 1]) { const v = ell(0.07, 0.06, 0.24, 14, 10); v.translate(sd * 0.04, 0.06, 0); v.rotateZ(sd * 0.25); paint(v, (c, x, y, z) => { c.set(s.c); if (Math.sin(z * 50) > 0.7) c.multiplyScalar(0.75); }); add(g, v); } return g; }
function chiton(s) { const g = new THREE.Group(); add(g, solid(at(ell(0.16, 0.03, 0.28), 0, 0.02, 0), s.rim)); for (let k = 0; k < 8; k++) add(g, solid(at(ell(0.11, 0.05, 0.04), 0, 0.04, 0.22 - k * 0.063), s.c)); return g; }
function barnacle(s) { const g = new THREE.Group(); add(g, solid(stick([0, 0, 0], [0, 0.18, 0], 0.07, 0.06, 10), 0x6a5a4a)); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; add(g, solid(at(new THREE.ConeGeometry(0.05, 0.22, 5), Math.cos(a) * 0.05, 0.3, Math.sin(a) * 0.05, Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2), s.c)); } return g; }
function cucumber(s) { const g = new THREE.Group(), b = ell(0.1, 0.09, 0.35, 16, 12); b.translate(0, 0.08, 0); const P = b.attributes.position; for (let i = 0; i < P.count; i++) { const k = P.getY(i) > 0.1 && noise(P.getX(i) * 40, P.getZ(i) * 30) > 0.6 ? 1.2 : 1; P.setY(i, 0.08 + (P.getY(i) - 0.08) * k); } b.computeVertexNormals(); paint(b, (c, x, y) => c.set(y > 0.09 ? s.c : 0x6a5a4a)); add(g, b); return g; }
function ostracod(s) { const g = new THREE.Group(); const b = ell(0.12, 0.09, 0.16, 14, 10); b.translate(0, 0.09, 0); add(g, solid(b, 0xc8d0b8)); const glo = add(g, at(ell(0.16, 0.13, 0.2), 0, 0.09, 0), new THREE.MeshBasicMaterial({ color: 0x5ab8ff, transparent: true, opacity: 0.35, depthWrite: false }), true); glo.userData.keep = true; return g; }

const SEA = {
  isogani: () => crab({ c: 0x5a6a3a, c2: 0xd8c8a0, w: 0.2 }),
  tamakibi: () => { const g = spiral({ c: 0x4a4a4a, R: 0.22, up: 0.25, turns: 3, stripe: 0x6a6a6a, sf: 40 }); return g; },
  kamenote: () => barnacle({ c: 0xb8a890 }),
  isoginchaku: () => anemone({ c: 0x6a8a5a, dots: 0xd8d0a0, t: 0x9ab8a0 }),
  hitode: () => star({ c: 0x3a6ab0, c2: 0xe08a3a, n: 5, len: 0.38, disc: 0.16 }),
  mizukurage: () => jelly({ c: 0xb8d0f0 }),
  hizaragai: () => chiton({ c: 0x5a5a4a, rim: 0x8a7a5a }),
  murasakiuni: () => urchin({ c: 0x3a2a4a, spine: 0x4a2a5a, len: 0.13 }),
  amefurashi: () => seaslug({ c: 0x6a5a3a, ears: 1, w: 0.14, dots: 0xb8a080 }),
  namako: () => cucumber({ c: 0x3a3a2a }),
  aoumiushi: () => seaslug({ c: 0x2a5ad8, rim: 0xe8c840, horn: 0xe8a03a, gills: 0xe8a03a, w: 0.09 }),
  tako_baby: () => octopus({ c: [0xd88a6a, 0xf0b090] }),
  sazae: () => spiral({ c: 0x6a6a4a, spines: 1, R: 0.26, up: 0.32, turns: 2.6, stripe: 0x8a7a5a, sf: 25 }),
  tokobushi: () => abalone({ c: 0x8a6a4a }),
  umihotaru: () => ostracod({}),
  tezurumozuru: () => star({ c: 0x8a6a3a, n: 5, len: 0.45, thin: 1, branch: 1, disc: 0.08 }),
  iseebi: () => shrimp({ c: 0xa83a2a, big: 1 }),
  kuroawabi: () => abalone({ c: 0x3a4a3a }),
  ishidatami: () => spiral({ c: 0x2a2a2a, check: 0xd8d0c0, R: 0.22, up: 0.2, turns: 2.5 }),
  murasakiigai: () => mussel({ c: 0x2a2a3a }),
  isosujiebi: () => shrimp({ c: 0xd8d8c8, stripe: 0x6a4a3a }),
  umeboshi: () => anemone({ c: 0xb82a2a, blob: 1 }),
  kumohitode: () => star({ c: 0x8a6a6a, n: 5, len: 0.4, thin: 1, disc: 0.07 }),
  shoujingani: () => crab({ c: 0xc83a2a, stripe: 0xe8d0b0, w: 0.2 }),
  yatsudehitode: () => star({ c: 0x8a5ab0, c2: 0xd8a040, n: 8, len: 0.36, disc: 0.14 }),
  gangaze: () => urchin({ c: 0x1a1a1a, spine: 0x2a2a2a, len: 0.32 }),
  tatsunamigai: () => seaslug({ c: 0x6a5a3a, hairy: 1, w: 0.16, ears: 1 }),
  shiroumiushi: () => seaslug({ c: 0xf0f0f0, dots: 0xe8c040, gills: 0xe08a3a, horn: 0xe08a3a, w: 0.09 }),
  takonomakura: () => urchin({ c: 0x9a8a6a, c2: 0x6a5a3a, flat: 1 }),
  kaeruankou: () => frogfish({ c: [0xd8b040, 0x8a5a2a] }),
};

// ---------------------------------------------------------------- fossils (a slab with a relief, or the thing itself)
const STONE = 0xc8b898, BONE = 0xe0d4b4;
function slab(g, c = STONE) { const s = new THREE.BoxGeometry(0.8, 0.12, 0.6, 8, 2, 6); const P = s.attributes.position; for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) * (1 + 0.06 * noise(P.getZ(i) * 5, P.getY(i) * 5)), P.getY(i), P.getZ(i) * (1 + 0.06 * noise(P.getX(i) * 5, 2))); s.computeVertexNormals(); paint(s, (cc, x, y, z) => { cc.set(c); cc.multiplyScalar(0.85 + 0.15 * noise(x * 9, z * 9)); }); add(g, s); return g; }
const relief = (g, geo, c = 0xa89070, y = 0.065) => { geo.translate(0, y, 0); add(g, solid(geo, c)); };
const FOSSIL = {
  kai_fossil: () => { const g = slab(new THREE.Group()); const f = new THREE.Group(); for (let k = 0; k < 9; k++) relief(f, stick([0, 0, -0.12], [Math.sin((k - 4) * 0.25) * 0.24, 0, 0.12], 0.018), 0x9a8060); g.add(f); return g; },
  shida: () => { const g = slab(new THREE.Group()); relief(g, stick([0, 0, -0.25], [0, 0, 0.25], 0.012), 0x6a5a3a); for (let k = 0; k < 10; k++) for (const sd of [-1, 1]) relief(g, stick([0, 0, -0.2 + k * 0.045], [sd * 0.18 * (1 - k / 12), 0, -0.15 + k * 0.045], 0.012, 0.005), 0x6a5a3a); return g; },
  vicarya: () => { const g = spiral({ c: 0xb8a888, R: 0.14, up: 0.9, turns: 6, spines: 1, stripe: 0x9a8a6a, sf: 30 }); g.rotation.z = PI / 2; return g; },
  umiyuri: () => { const g = slab(new THREE.Group()); relief(g, stick([-0.3, 0, 0.2], [0.15, 0, -0.1], 0.02), 0x8a7a5a); for (let k = 0; k < 10; k++) { const a = -0.8 + k * 0.17; relief(g, stick([0.15, 0, -0.1], [0.15 + Math.cos(a) * 0.2, 0, -0.1 + Math.sin(a) * 0.2], 0.012, 0.004), 0x8a7a5a); } return g; },
  sametooth: () => { const g = new THREE.Group(); const ex = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.3, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0.03, 0.7), new THREE.Vector2(-0.03, 0.7)]), { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }); paint(ex, (c, x, y) => c.set(y < 0.12 ? 0x6a5a4a : 0x4a4a52)); add(g, ex); return g; },
  kodaigyo: () => { const g = slab(new THREE.Group()); relief(g, stick([-0.3, 0, 0], [0.3, 0, 0], 0.014), 0x7a6a4a); for (let k = 0; k < 12; k++) { const x = -0.22 + k * 0.04; relief(g, stick([x, 0, -0.1], [x - 0.03, 0, 0.1], 0.006), 0x7a6a4a); } relief(g, at(ell(0.07, 0.01, 0.06), 0.3, 0, 0), 0x7a6a4a); relief(g, shape([[-0.3, 0], [-0.4, 0.08], [-0.4, -0.08]]).rotateX(-PI / 2), 0x7a6a4a); return g; },
  ammonite: () => { const g = new THREE.Group(), pts = []; for (let i = 0; i <= 60; i++) { const a = i * 0.32, r = 0.04 * Math.exp(a * 0.12); pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); } const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 1, 10), P = tube.attributes.position, N = tube.attributes.normal; for (let i = 0; i < P.count; i++) { const u = Math.floor(i / 11) / 120, rr = 0.02 + u * 0.13; const c = new THREE.CatmullRomCurve3(pts).getPointAt(u); P.setXYZ(i, c.x + N.getX(i) * rr, c.y + N.getY(i) * rr, c.z + N.getZ(i) * rr); } tube.computeVertexNormals(); paint(tube, (c, x, y) => { c.set(0xb8906a); if (Math.sin(Math.atan2(y, x) * 26) > 0.6) c.set(0x8a6a4a); }); add(g, tube); return g; },
  sanyouchu: () => { const g = slab(new THREE.Group(), 0x8a8a8a); relief(g, at(ell(0.16, 0.03, 0.08), 0, 0, 0.15), 0x5a5048); for (let k = 0; k < 9; k++) relief(g, at(ell(0.17 - k * 0.012, 0.025, 0.02), 0, 0, 0.06 - k * 0.04), 0x5a5048); relief(g, stick([0, 0, 0.12], [0, 0, -0.3], 0.03), 0x4a4038); return g; },
  kohaku: () => { const g = new THREE.Group(); add(g, at(ell(0.3, 0.2, 0.24, 16, 10), 0, 0.2, 0), new THREE.MeshStandardMaterial({ color: 0xe8901a, transparent: true, opacity: 0.6, roughness: 0.1, depthWrite: false }), true); const b = ant({ c: 0x2a1a0a }); b.scale.setScalar(0.7); b.position.y = 0.2; g.add(b); return g; },
  naumann: () => { const g = new THREE.Group(), pts = []; for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(new THREE.Vector3(-0.5 + u * 0.9, Math.sin(u * 2.2) * 0.3, 0)); } const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 1, 10), P = tg.attributes.position, N = tg.attributes.normal; for (let i = 0; i < P.count; i++) { const u = Math.floor(i / 11) / 24, rr = 0.09 * (1 - u * 0.85); const c = new THREE.CatmullRomCurve3(pts).getPointAt(u); P.setXYZ(i, c.x + N.getX(i) * rr, c.y + N.getY(i) * rr, c.z + N.getZ(i) * rr); } tg.computeVertexNormals(); add(g, solid(tg, 0xe8dcb8)); return g; },
  dino_claw: () => { const g = new THREE.Group(), pts = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * 1.6; pts.push(new THREE.Vector3(Math.sin(a) * 0.3, Math.cos(a) * 0.3, 0)); } const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 1, 8), P = tg.attributes.position, N = tg.attributes.normal; for (let i = 0; i < P.count; i++) { const u = Math.floor(i / 9) / 20, rr = 0.08 * (1 - u * 0.92); const c = new THREE.CatmullRomCurve3(pts).getPointAt(u); P.setXYZ(i, c.x + N.getX(i) * rr, c.y + N.getY(i) * rr * 1.3, c.z + N.getZ(i) * rr * 0.6); } tg.computeVertexNormals(); add(g, solid(tg, 0x4a3a2a)); return g; },
  dino_egg: () => { const g = new THREE.Group(), e = ell(0.2, 0.3, 0.2, 16, 12); e.translate(0, 0.3, 0); paint(e, (c, x, y, z) => { c.set(0xb8a888); if (noise(x * 25, y * 25 + z * 10) > 0.62) c.set(0x7a6a5a); }); add(g, e); slab(g).children.at(-1).scale.set(0.6, 0.6, 0.6); return g; },
  uni_fossil: () => { const g = new THREE.Group(), b = ell(0.25, 0.15, 0.25, 20, 12); b.translate(0, 0.12, 0); paint(b, (c, x, y, z) => { c.set(0xc8b898); if (Math.cos(Math.atan2(z, x) * 5) > 0.7 && y > 0.18) c.set(0x8a7a5a); }); add(g, b); return g; },
  konoha_fossil: () => { const g = slab(new THREE.Group()); const leaf = []; for (let k = 0; k <= 16; k++) { const a = k / 16 * TAU; leaf.push([Math.cos(a) * 0.22, Math.sin(a) * 0.12 * (1 - Math.cos(a) * 0.3)]); } relief(g, shape(leaf).rotateX(-PI / 2), 0x8a6a3a, 0.062); relief(g, stick([-0.25, 0, 0], [0.22, 0, 0], 0.008), 0x6a4a2a, 0.064); return g; },
  kani_fossil: () => { const g = slab(new THREE.Group()); const c = crab({ c: 0x8a7a5a, w: 0.14 }); c.scale.set(1, 0.3, 1); c.position.y = 0.06; g.add(c); return g; },
  belemnite: () => { const g = new THREE.Group(), cn = new THREE.ConeGeometry(0.07, 0.8, 12); cn.rotateZ(PI / 2); paint(cn, (c, x) => c.set(x > 0.2 ? 0xd8a060 : 0xb8803a)); add(g, cn); return g; },
  keikaboku: () => { const g = new THREE.Group(), cy = new THREE.CylinderGeometry(0.2, 0.22, 0.6, 16, 4); cy.rotateZ(PI / 2); paint(cy, (c, x, y, z) => { const r = Math.hypot(y, z); c.set(Math.abs(x) > 0.29 ? (Math.sin(r * 70) > 0 ? 0xc87a4a : 0x8a5a3a) : (noise(x * 20, Math.atan2(y, z) * 3) > 0.5 ? 0x8a7a6a : 0x6a5a4a)); }); add(g, cy); return g; },
  kodaisame_sebone: () => { const g = new THREE.Group(); for (let k = 0; k < 5; k++) { const d = new THREE.CylinderGeometry(0.13, 0.13, 0.09, 16); d.rotateZ(PI / 2); d.translate(-0.24 + k * 0.12, 0.15, 0); paint(d, (c, x, y, z) => c.set(Math.sin(Math.hypot(y - 0.15, z) * 80) > 0 ? 0x6a6050 : 0x8a7a6a)); add(g, d); } return g; },
  kujira_mimi: () => { const g = new THREE.Group(), b = ell(0.3, 0.18, 0.2, 16, 12); const P = b.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i); P.setY(i, P.getY(i) * (1 + 0.4 * Math.sin(x * 9))); } b.computeVertexNormals(); b.translate(0, 0.15, 0); add(g, solid(b, 0xd8ccb0)); return g; },
  gyoryu_ha: () => { const g = new THREE.Group(); for (let k = 0; k < 5; k++) { const cn = new THREE.ConeGeometry(0.04, 0.3, 8); cn.translate(-0.2 + k * 0.1, 0.25, 0); cn.rotateZ((k - 2) * 0.08); add(g, solid(cn, 0xe8dcc0)); } add(g, solid(at(new THREE.BoxGeometry(0.6, 0.12, 0.14), 0, 0.06, 0), 0x8a7a6a)); return g; },
  kodaizou_ha: () => { const g = new THREE.Group(), b = new THREE.BoxGeometry(0.5, 0.3, 0.25, 10, 3, 4); paint(b, (c, x, y) => c.set(y > 0.12 && Math.sin(x * 50) > 0.2 ? 0xe8e0c8 : 0x8a7a5a)); b.translate(0, 0.15, 0); add(g, b); return g; },
  kubinaga_hire: () => { const g = new THREE.Group(); for (let k = 0; k < 4; k++) for (let j = 0; j < 5 - k * 0.5; j++) add(g, solid(at(ell(0.04, 0.025, 0.035), -0.2 + j * 0.09, 0.03, -0.12 + k * 0.08), BONE)); add(g, solid(stick([-0.4, 0.03, 0], [-0.22, 0.03, 0], 0.05, 0.04), BONE)); return g; },
  yokuryu_tsubasa: () => { const g = new THREE.Group(); add(g, solid(stick([-0.4, 0, 0], [0.0, 0, 0.05], 0.025), BONE)); add(g, solid(stick([0.0, 0, 0.05], [0.42, 0, -0.1], 0.018, 0.008), BONE)); const m = shape([[-0.4, 0], [0.42, -0.1], [-0.1, -0.35]]); m.rotateX(-PI / 2); add(g, solid(m, 0xb8a888), VCS); return g; },
  dino_ashiato: () => { const g = slab(new THREE.Group(), 0xb0a080); for (const a of [-0.5, 0, 0.5]) relief(g, at(ell(0.05, 0.01, 0.16), Math.sin(a) * 0.16, 0, -Math.cos(a) * 0.16 + 0.05, 0, a, 0), 0x6a5a40, 0.06); relief(g, at(ell(0.1, 0.01, 0.08), 0, 0, 0.12), 0x6a5a40, 0.06); return g; },
};

// ---------------------------------------------------------------- shells from the beach
const SHELL = {
  tsumetagai: () => spiral({ c: 0xd8c8b0, R: 0.3, up: 0.12, turns: 2.2, stripe: 0xb8a080, sf: 30 }),
  sakuragai: () => { const g = new THREE.Group(), v = ell(0.3, 0.04, 0.22, 20, 8); v.translate(0, 0.04, 0); paint(v, (c, x, y, z) => { c.set(0xf4b8c0); if (Math.sin(Math.hypot(x + 0.3, z) * 60) > 0.6) c.set(0xf8d0d8); }); add(g, v); return g; },
  hotate: () => { const g = new THREE.Group(), pts = [[0, -0.05]]; for (let k = 0; k <= 20; k++) { const a = PI * 0.15 + PI * 0.7 * k / 20; pts.push([Math.cos(a) * 0.35, Math.sin(a) * 0.35 - 0.05]); } const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.03, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02 }); geo.rotateX(-PI / 2); paint(geo, (c, x, y, z) => { c.set(0xe8a070); if (Math.sin(Math.atan2(-z + 0.05, x) * 26) > 0.3) c.set(0xd88050); }); add(g, geo); return g; },
  seaglass: () => { const g = new THREE.Group(); add(g, at(ell(0.25, 0.08, 0.18, 10, 6), 0, 0.08, 0), new THREE.MeshStandardMaterial({ color: 0x8ad0b0, roughness: 0.9, transparent: true, opacity: 0.8 })); return g; },
  takaragai: () => { const g = new THREE.Group(), b = ell(0.2, 0.14, 0.3, 20, 12); b.translate(0, 0.12, 0); paint(b, (c, x, y, z) => { c.set(0xd8b880); if (noise(x * 30, z * 30) > 0.6) c.set(0x8a5a3a); if (y < 0.05) c.set(0xf0e8d8); }); add(g, b, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15 })); return g; },
  seaglass_blue: () => { const g = new THREE.Group(); add(g, at(ell(0.25, 0.08, 0.18, 10, 6), 0, 0.08, 0), new THREE.MeshStandardMaterial({ color: 0x6aa8e0, roughness: 0.9, transparent: true, opacity: 0.8 })); return g; },
};

// ---------------------------------------------------------------- the catalogue
const MOVES = {
  fly: 'monshiro ageha aosujiageha omurasaki yamatoshijimi uraginshijimi fuyushaku asagimadara himeakatateha kiageha tsumaguro murasakishijimi kitateha ruritateha yukimushi',
  dragon: 'shiokara akiakane ginyanma oniyanma usubakitonbo',
  glow: 'genjibotaru heikebotaru',
  beetle: 'aburazemi minminzemi tsukutsuku higurashi niiniizemi kumazemi nokogiri kabutomushi miyama tamamushi okuwagata kanabun rurihoshi minomushi',
  dot: 'nanahoshi namitentou mitsubachi sunagani benkeigani',
  shell: 'katatsumuri misujimaimai yadokari',
};
const SHAPE_OF = (id) => { for (const [k, ids] of Object.entries(MOVES)) if (ids.split(' ').includes(id)) return k; return 'crawl'; };
const KIND = (id) => (FISH[id] ? 'fish' : BUGS[id] ? 'bug' : SEA[id] ? 'sea' : FOSSIL[id] ? 'fossil' : SHELL[id] ? 'shell' : null);
const PROTO = new Map();
function mergeStatic(raw) {
  raw.updateMatrixWorld(true);
  const inv = raw.matrixWorld.clone().invert(), moving = new Set(raw.userData.wings || []), groups = new Map(), drop = [];
  raw.traverse((m) => {
    if (!m.isMesh || m.userData.keep) return;
    for (let p = m.parent; p && p !== raw; p = p.parent) if (moving.has(p)) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); g.deleteAttribute('uv');
    if (m.material.vertexColors && !g.attributes.color) solid(g, 0xffffff);
    if (!m.material.vertexColors && g.attributes.color) g.deleteAttribute('color');
    if (!groups.has(m.material)) groups.set(m.material, []); groups.get(m.material).push(g); drop.push(m);
  });
  for (const m of drop) m.parent.remove(m);
  for (const [material, geos] of groups) { const o = new THREE.Mesh(mergeGeometries(geos), material); o.castShadow = true; raw.add(o); }
}
function proto(id) {
  if (PROTO.has(id)) return PROTO.get(id);
  const k = KIND(id); if (!k) return null;
  const raw = k === 'fish' ? buildFish(id) : k === 'bug' ? BUGS[id]() : k === 'sea' ? SEA[id]() : k === 'fossil' ? FOSSIL[id]() : SHELL[id]();
  // centre it and make the longest side 1
  mergeStatic(raw);
  const wrap = new THREE.Group(); wrap.add(raw); raw.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(raw), size = box.getSize(new THREE.Vector3()), s = 1 / Math.max(size.x, size.y, size.z);
  raw.position.sub(box.getCenter(new THREE.Vector3())).multiplyScalar(s); raw.scale.multiplyScalar(s);
  wrap.userData = { kind: k, wings: raw.userData.wings, glow: raw.userData.glow, shape: k === 'bug' ? SHAPE_OF(id) : null, half: size.clone().multiplyScalar(s / 2) };
  toonify(wrap);
  PROTO.set(id, wrap); return wrap;
}
export const hasCreature = (id) => !!KIND(id);
export const creatureShape = (id) => (BUGS[id] ? SHAPE_OF(id) : null);
// a copy sharing geometry and materials; wings and the glow come along as handles for the animation
export function creatureModel(id) {
  const p = proto(id); if (!p) return null;
  const o = p.clone(true), ud = p.userData;
  const find = (src) => { if (!src) return null; const path = []; let n = src; while (n && n !== p) { path.unshift(n.parent.children.indexOf(n)); n = n.parent; } let m = o; for (const i of path) m = m.children[i]; return m; };
  o.userData = { kind: ud.kind, shape: ud.shape, half: ud.half, wings: ud.wings ? ud.wings.map(find) : [], glow: find(ud.glow) };
  return o;
}
// ---------------------------------------------------------------- the pictures
let R = null; const ICONS = new Map();
const VIEW = { fish: [0.15, 0.3, 1], bug: [0.75, 1.5, 0.55], sea: [0.6, 1.2, 0.9], fossil: [0.15, 1.1, 0.95], shell: [0.4, 1.2, 0.8] };
export function creatureIcon(id) {
  if (ICONS.has(id)) return ICONS.get(id);
  const o = creatureModel(id); if (!o) return null;
  if (!R) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1, 2, 2); scene.add(sun);
    R = { renderer, scene, cam: new THREE.PerspectiveCamera(26, 1, 0.1, 20), cv };
  }
  const v = new THREE.Vector3(...VIEW[o.userData.kind]).normalize();
  if (o.userData.kind === 'fish') o.rotation.y = -0.12;
  R.scene.add(o); R.cam.position.copy(v.multiplyScalar(2.45)); R.cam.lookAt(0, 0, 0);
  R.renderer.render(R.scene, R.cam);
  const url = R.cv.toDataURL('image/png'); R.scene.remove(o); ICONS.set(id, url); return url;
}
