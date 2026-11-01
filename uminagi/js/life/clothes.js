// More to wear, made in code like the creatures: hats (beret, flower crown, ribbon, sailor cap, headband,
// headphones, and the festival ones: witch's hat, Santa hat, oni horns, a crown), glasses (round, sunglasses,
// heart-shaped) and things on the back (a backpack, a cape, a swim ring). Each wearable says where it goes:
// `hat` / `face` on ぽっけ's head, `back` on the body. Positions are in the hippo's head / body space.
import * as THREE from 'three';
import { toonify } from '../toon.js';
import { ITEMS, ICON_BY_ID } from './state.js';
import { CLOTHES } from './items2.js';

const PI = Math.PI, TAU = PI * 2;
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.7, metalness: o.m ?? 0, side: o.side ? THREE.DoubleSide : THREE.FrontSide, emissive: o.e ?? 0 });
const mesh = (g, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; };
// head space: the crown of the head is at y ≈ 0.57, the brim line at 0.45, the face front at z ≈ 0.33
const MAKE = {
  beret: (c) => { const g = new THREE.Group(); const b = mesh(g, new THREE.SphereGeometry(0.26, 18, 10), M(c), 0.04, 0.53, -0.02, 0, 0, -0.25); b.scale.set(1.05, 0.38, 1.05); mesh(g, new THREE.CylinderGeometry(0.02, 0.02, 0.06, 6), M(c), 0.08, 0.66, -0.02, 0, 0, -0.3); return g; },
  flowers: () => { const g = new THREE.Group(); mesh(g, new THREE.TorusGeometry(0.25, 0.03, 6, 24), M(0x5a9a3a), 0, 0.5, 0.02, PI / 2 - 0.12); const cs = [0xf4a0c0, 0xffe070, 0xffffff, 0xb090f0, 0xff9a6a]; for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; mesh(g, new THREE.SphereGeometry(0.055, 8, 6), M(cs[k % cs.length]), Math.cos(a) * 0.25, 0.5 + Math.sin(a) * 0.03, 0.02 + Math.sin(a) * 0.25); } return g; },
  ribbon: (c) => { const g = new THREE.Group(), m = M(c, { side: 1 }); for (const sd of [-1, 1]) { const loop = mesh(g, new THREE.SphereGeometry(0.11, 12, 8), m, 0.12 + sd * 0.11, 0.58, -0.02, 0, 0, sd * 0.5); loop.scale.set(1, 0.6, 0.35); } mesh(g, new THREE.SphereGeometry(0.05, 8, 6), m, 0.12, 0.58, -0.02); return g; },
  sailor: () => { const g = new THREE.Group(); mesh(g, new THREE.CylinderGeometry(0.27, 0.25, 0.14, 20), M(0xf8f8f8), 0, 0.5, -0.01); mesh(g, new THREE.CylinderGeometry(0.255, 0.255, 0.04, 20), M(0x1a2a5a), 0, 0.46, -0.01); mesh(g, new THREE.CylinderGeometry(0.28, 0.28, 0.02, 20), M(0xf8f8f8), 0, 0.575, -0.01); return g; },
  hachimaki: () => { const g = new THREE.Group(); mesh(g, new THREE.TorusGeometry(0.28, 0.04, 6, 26), M(0xf4f4f4), 0, 0.38, 0.03, PI / 2); mesh(g, new THREE.SphereGeometry(0.06, 8, 6), M(0xd8302a), 0, 0.4, 0.31); for (const sd of [-1, 1]) mesh(g, new THREE.BoxGeometry(0.05, 0.14, 0.015), M(0xf4f4f4), sd * 0.06, 0.3, -0.29, 0.4, 0, sd * 0.4); return g; },
  phones: (c) => { const g = new THREE.Group(); mesh(g, new THREE.TorusGeometry(0.31, 0.025, 6, 20, PI), M(0x2a2a2a), 0, 0.3, -0.02); for (const sd of [-1, 1]) mesh(g, new THREE.CylinderGeometry(0.1, 0.1, 0.07, 16), M(c), sd * 0.31, 0.3, -0.02, 0, 0, PI / 2); return g; },
  witch: () => { const g = new THREE.Group(); mesh(g, new THREE.CylinderGeometry(0.42, 0.42, 0.02, 24), M(0x3a2a5a), 0, 0.47, -0.02); const c = mesh(g, new THREE.ConeGeometry(0.23, 0.55, 18), M(0x3a2a5a), 0.03, 0.75, -0.04, -0.15, 0, -0.2); c.scale.set(1, 1, 1); mesh(g, new THREE.CylinderGeometry(0.235, 0.235, 0.06, 18), M(0xe8902a), 0, 0.52, -0.02); return g; },
  santa: () => { const g = new THREE.Group(); mesh(g, new THREE.TorusGeometry(0.25, 0.06, 8, 24), M(0xf8f8f8), 0, 0.47, -0.01, PI / 2); mesh(g, new THREE.ConeGeometry(0.25, 0.5, 18), M(0xd8302a), 0.08, 0.72, -0.06, -0.3, 0, -0.45); mesh(g, new THREE.SphereGeometry(0.07, 10, 8), M(0xf8f8f8), 0.28, 0.9, -0.14); return g; },
  oni: () => { const g = new THREE.Group(); for (const sd of [-1, 1]) mesh(g, new THREE.ConeGeometry(0.06, 0.22, 10), M(0xf0d040), sd * 0.13, 0.62, 0.05, 0.15, 0, -sd * 0.25); return g; },
  crown: () => { const g = new THREE.Group(), gold = M(0xf0c030, { m: 0.8, r: 0.3 }); mesh(g, new THREE.CylinderGeometry(0.2, 0.2, 0.1, 20, 1, true), gold, 0, 0.6, 0); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; mesh(g, new THREE.ConeGeometry(0.035, 0.1, 6), gold, Math.cos(a) * 0.2, 0.69, Math.sin(a) * 0.2); mesh(g, new THREE.SphereGeometry(0.025, 8, 6), M([0xd82a3a, 0x2a6ad8, 0x3ab05a][k % 3], { e: 0x220000 }), Math.cos(a) * 0.2, 0.6, Math.sin(a) * 0.2); } return g; },
  // glasses, in front of the eyes
  round: () => glasses(M(0x2a2a2a, { side: 1 }), (g, m, x) => mesh(g, new THREE.TorusGeometry(0.075, 0.012, 6, 18), m, x, 0, 0)),
  sun: () => glasses(M(0x111111, { r: 0.2, side: 1 }), (g, m, x) => { mesh(g, new THREE.CircleGeometry(0.085, 18), M(0x1a1a2a, { r: 0.1, m: 0.4, side: 1 }), x, 0, 0.001); mesh(g, new THREE.TorusGeometry(0.085, 0.012, 6, 18), m, x, 0, 0); }),
  heart: () => glasses(M(0xe85a8a, { side: 1 }), (g, m, x) => { const s = new THREE.Shape(); s.moveTo(0, -0.07); s.bezierCurveTo(0.1, 0.0, 0.07, 0.09, 0, 0.04); s.bezierCurveTo(-0.07, 0.09, -0.1, 0.0, 0, -0.07); mesh(g, new THREE.ShapeGeometry(s, 8), M(0xf48ab0, { side: 1 }), x, 0, 0.002); }),
  // on the back (body space: the back at z ≈ -0.36, the waist at y ≈ 0.2)
  backpack: (c) => { const g = new THREE.Group(), m = M(c); const b = mesh(g, new THREE.BoxGeometry(0.3, 0.32, 0.16), m, 0, 0.36, -0.4); b.geometry = roundBox(0.3, 0.32, 0.16); mesh(g, new THREE.BoxGeometry(0.22, 0.11, 0.05), M(new THREE.Color(c).multiplyScalar(0.8).getHex()), 0, 0.27, -0.5); for (const sd of [-1, 1]) mesh(g, new THREE.TorusGeometry(0.15, 0.02, 6, 14, PI), M(0x5a4030), sd * 0.11, 0.42, -0.26, 0, PI / 2, 0); return g; },
  cape: (c) => { const g = new THREE.Group(), geo = new THREE.PlaneGeometry(0.6, 0.55, 8, 6), P = geo.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), k = 0.55 + (0.275 - y) / 0.55 * 0.6; P.setX(i, x * k); P.setZ(i, -0.05 * Math.cos(x * 6) - (0.275 - y) * 0.25 - 0.04 * Math.sin(x * 14) * (0.275 - y)); } geo.computeVertexNormals(); mesh(g, geo, M(c, { side: 1 }), 0, 0.36, -0.36); mesh(g, new THREE.TorusGeometry(0.16, 0.022, 6, 18, PI), M(0xf0c030), 0, 0.62, -0.22, PI / 2 + 0.3, 0, 0); return g; },
  ukiwa: () => { const g = new THREE.Group(), geo = new THREE.TorusGeometry(0.42, 0.11, 10, 28); const col = new Float32Array(geo.attributes.position.count * 3), c = new THREE.Color(); for (let i = 0; i < geo.attributes.position.count; i++) { const a = Math.atan2(geo.attributes.position.getY(i), geo.attributes.position.getX(i)); c.set(Math.floor((a + PI) / (PI / 4)) % 2 ? 0xd8302a : 0xf8f8f8); col.set([c.r, c.g, c.b], i * 3); } geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); mesh(g, geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), 0, 0.16, 0.06, PI / 2); return g; },
};
function glasses(m, lens) { const g = new THREE.Group(); for (const sd of [-1, 1]) lens(g, m, sd * 0.11); mesh(g, new THREE.CylinderGeometry(0.01, 0.01, 0.07, 6), m, 0, 0.01, 0, 0, 0, PI / 2); for (const sd of [-1, 1]) mesh(g, new THREE.CylinderGeometry(0.008, 0.008, 0.3, 5), m, sd * 0.19, 0, -0.15, PI / 2); g.position.set(0, 0.36, 0.3); g.rotation.x = -0.25; return g; }
function roundBox(w, h, d) { const s = new THREE.Shape(), r = 0.06; s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }); g.translate(0, 0, -d / 2); return g; }

// the wardrobe: id, name, shop price (0 = only as a gift / at a festival), slot, maker and colour
export const WEARABLES = [
  { id: 'hat_beret_red', name: 'あかい ベレー帽', price: 1400, slot: 'hat', make: ['beret', 0xc83a3a] },
  { id: 'hat_beret_navy', name: 'こん色の ベレー帽', price: 1400, slot: 'hat', make: ['beret', 0x2a3a6a] },
  { id: 'hat_flowers', name: '花かんむり', price: 1800, slot: 'hat', make: ['flowers'] },
  { id: 'hat_ribbon_pink', name: 'ピンクの リボン', price: 900, slot: 'hat', make: ['ribbon', 0xf48ab0] },
  { id: 'hat_ribbon_blue', name: 'みずいろの リボン', price: 900, slot: 'hat', make: ['ribbon', 0x6ab0e8] },
  { id: 'hat_sailor', name: 'セーラー帽', price: 1600, slot: 'hat', make: ['sailor'] },
  { id: 'hat_hachimaki', name: 'はちまき', price: 600, slot: 'hat', make: ['hachimaki'] },
  { id: 'hat_phones', name: 'ヘッドホン', price: 2400, slot: 'hat', make: ['phones', 0xe8b030] },
  { id: 'hat_witch', name: 'まじょの ぼうし', price: 0, slot: 'hat', make: ['witch'] },
  { id: 'hat_santa', name: 'サンタぼうし', price: 0, slot: 'hat', make: ['santa'] },
  { id: 'hat_oni', name: 'おにの つの', price: 0, slot: 'hat', make: ['oni'] },
  { id: 'hat_crown', name: 'おうかん', price: 0, slot: 'hat', make: ['crown'] },
  { id: 'face_round', name: 'まるメガネ', price: 1200, slot: 'face', make: ['round'] },
  { id: 'face_sun', name: 'サングラス', price: 1500, slot: 'face', make: ['sun'] },
  { id: 'face_heart', name: 'ハートの メガネ', price: 1300, slot: 'face', make: ['heart'] },
  { id: 'back_pack_yellow', name: 'きいろの リュック', price: 2600, slot: 'back', make: ['backpack', 0xe8b030] },
  { id: 'back_pack_green', name: 'みどりの リュック', price: 2600, slot: 'back', make: ['backpack', 0x4a9a5a] },
  { id: 'back_cape', name: 'ヒーローの マント', price: 3200, slot: 'back', make: ['cape', 0xc83a3a] },
  { id: 'back_ukiwa', name: 'うきわ', price: 1100, slot: 'back', make: ['ukiwa'] },
];
const ICONS = { hat: '🎩', face: '👓', back: '🎒' };
export const wearIcon = (w) => ({ hat_witch: '🧙', hat_santa: '🎅', hat_oni: '👹', hat_crown: '👑', hat_flowers: '💐', hat_ribbon_pink: '🎀', hat_ribbon_blue: '🎀', hat_phones: '🎧', face_sun: '🕶️', back_cape: '🦸', back_ukiwa: '🛟' })[w.id] || ICONS[w.slot];
export function makeWearable(id) {
  const w = WEARABLES.find((x) => x.id === id); if (!w) return null;
  const [kind, color] = w.make, o = MAKE[kind](color);
  return toonify(o);
}
for (const w of WEARABLES) { const c = { id: w.id, name: w.name, price: w.price, wear: w.slot }; CLOTHES.push(c); ITEMS[w.id] = { ...c, kind: 'clothes', price: w.price || 300 }; ICON_BY_ID[w.id] = wearIcon(w); }
