// The vegetable patch and the kitchen. Vegetable seeds from the shop grow in three or four days into tomatoes,
// carrots, potatoes or a pumpkin (a little plant, then a leafy one, then ripe and ready to pick). Dishes are
// cooked at a campfire or a kitchen from fish and vegetables; they sell well, make good presents and answer
// villagers' wishes, and eating one gives heart: back in the cave it heals, and eaten outside it brings an extra
// heart to the day's cave trip.
import * as THREE from 'three';
import { toonify } from '../toon.js';
import { ITEMS, ICON_BY_ID, dayKey } from './state.js';
import { SEEDS } from './items2.js';

const PI = Math.PI, TAU = PI * 2;
export const VEG = [
  { id: 'veg_tomato', name: 'トマト', icon: '🍅', price: 140, seed: 'seed_tomato', seedName: 'トマトのたね', seedPrice: 160, days: 3, n: 3 },
  { id: 'veg_carrot', name: 'にんじん', icon: '🥕', price: 130, seed: 'seed_carrot', seedName: 'にんじんのたね', seedPrice: 150, days: 3, n: 3 },
  { id: 'veg_potato', name: 'じゃがいも', icon: '🥔', price: 120, seed: 'seed_potato', seedName: 'たねいも', seedPrice: 140, days: 3, n: 4 },
  { id: 'veg_pumpkin', name: 'かぼちゃ', icon: '🎃', price: 420, seed: 'seed_pumpkin', seedName: 'かぼちゃのたね', seedPrice: 300, days: 4, n: 1 },
];
for (const v of VEG) {
  ITEMS[v.id] = { id: v.id, name: v.name, kind: 'veg', price: v.price }; ICON_BY_ID[v.id] = v.icon;
  const s = { id: v.seed, name: v.seedName, price: v.seedPrice, veg: v.id }; SEEDS.push(s); ITEMS[v.seed] = { ...s, kind: 'seed' }; ICON_BY_ID[v.seed] = '🌱';
}
// need: [item id or a kind ('fish'), count]; heal: hearts back in the cave (9 = all)
export const DISHES = [
  { id: 'dish_yakizakana', name: 'やき魚', icon: '🐟', price: 480, need: [['fish', 1]], heal: 1 },
  { id: 'dish_kaisendon', name: '海鮮どん', icon: '🍱', price: 1500, need: [['fish', 2], ['veg_carrot', 1]], heal: 9 },
  { id: 'dish_yakiimo', name: 'やきいも', icon: '🍠', price: 240, need: [['veg_potato', 1]], heal: 1 },
  { id: 'dish_tomatosoup', name: 'トマトスープ', icon: '🥣', price: 420, need: [['veg_tomato', 2]], heal: 1 },
  { id: 'dish_carrotcake', name: 'にんじんケーキ', icon: '🍰', price: 440, need: [['veg_carrot', 2]], heal: 1 },
  { id: 'dish_potesala', name: 'ポテトサラダ', icon: '🥗', price: 560, need: [['veg_potato', 2], ['veg_carrot', 1]], heal: 2 },
  { id: 'dish_curry', name: 'やさいカレー', icon: '🍛', price: 700, need: [['veg_potato', 1], ['veg_carrot', 1], ['veg_tomato', 1]], heal: 9 },
  { id: 'dish_pie', name: 'かぼちゃパイ', icon: '🥧', price: 900, need: [['veg_pumpkin', 1], ['mikan', 1]], heal: 9 },
  { id: 'dish_tart', name: 'フルーツタルト', icon: '🍓', price: 520, need: [['mikan', 2]], heal: 2 },
];
for (const d of DISHES) { ITEMS[d.id] = { id: d.id, name: d.name, kind: 'dish', price: d.price, heal: d.heal }; ICON_BY_ID[d.id] = d.icon; }
ITEMS.furn_campfire && (ITEMS.furn_campfire.cook = true);

const matches = (id, want) => (want === 'fish' ? ITEMS[id]?.kind === 'fish' : id === want);
const can = (st, d) => { const used = new Set(); return d.need.every(([want, n]) => { let k = 0; st.pocket.forEach((id, i) => { if (k < n && !used.has(i) && matches(id, want)) { used.add(i); k++; } }); return k >= n; }); };
const needText = (d) => d.need.map(([w, n]) => `${w === 'fish' ? '魚' : ITEMS[w].name}${n > 1 ? '×' + n : ''}`).join('・');

// ---------------------------------------------------------------- plants in the ground
const M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
const leaf = (g, s, x, z, h, c = 0x4a9a3a) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 8, 6), M(c)); l.scale.set(1, 0.35, 2.2); l.position.set(x, h, z); l.rotation.y = Math.atan2(x, z); l.rotation.x = -0.5; g.add(l); };
export function vegObject(p, age) {
  const v = VEG.find((x) => x.seed === p.seed) || VEG[0], g = new THREE.Group(), stage = age >= v.days ? 3 : age >= v.days - 1 ? 2 : age >= 1 ? 1 : 0;
  if (stage === 0) { for (const a of [0, PI]) leaf(g, 0.8, Math.sin(a) * 0.04, Math.cos(a) * 0.04, 0.05, 0x6ac04a); return toonify(g); }
  const s = stage === 1 ? 0.7 : 1, n = stage === 1 ? 5 : 8;
  if (v.id === 'veg_pumpkin') {
    for (let k = 0; k < n; k++) { const a = k / n * TAU; leaf(g, 1.6 * s, Math.cos(a) * 0.22 * s, Math.sin(a) * 0.22 * s, 0.06, 0x3a8a3a); }
    if (stage >= 2) { const pk = new THREE.Mesh(new THREE.SphereGeometry(stage === 3 ? 0.2 : 0.1, 14, 10), M(stage === 3 ? 0xe8822a : 0x8aa04a)); pk.scale.y = 0.75; pk.position.set(0.12, stage === 3 ? 0.14 : 0.08, 0.05); g.add(pk); const st2 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.06, 5), M(0x5a6a2a)); st2.position.set(0.12, stage === 3 ? 0.3 : 0.17, 0.05); g.add(st2); }
    return toonify(g);
  }
  const H = v.id === 'veg_tomato' ? 0.45 : v.id === 'veg_carrot' ? 0.28 : 0.3;
  if (v.id === 'veg_tomato') { const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, H * s, 5), M(0x5a8a3a)); stem.position.y = H * s / 2; g.add(stem); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 4), M(0x9a7a4a)); pole.position.set(0.04, 0.27, 0); g.add(pole); }
  for (let k = 0; k < n; k++) { const a = k / n * TAU + 0.3, r = v.id === 'veg_carrot' ? 0.03 : 0.1, h = v.id === 'veg_tomato' ? H * s * (0.3 + 0.7 * k / n) : 0.1 * s + (k % 3) * 0.03; leaf(g, s, Math.cos(a) * r, Math.sin(a) * r, h, v.id === 'veg_carrot' ? 0x5ab04a : 0x4a9a3a); }
  if (stage === 3) {
    if (v.id === 'veg_tomato') for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), M(0xe03a2a)); const a = k * 1.7; t.position.set(Math.cos(a) * 0.08, 0.15 + k * 0.07, Math.sin(a) * 0.08); g.add(t); }
    if (v.id === 'veg_carrot') { const c = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 8), M(0xe8822a)); c.rotation.x = PI; c.position.y = 0.02; g.add(c); }
    if (v.id === 'veg_potato') for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), M(k % 2 ? 0xf8f8f8 : 0xb89ad8)); f.position.set(Math.cos(k * 1.6) * 0.09, 0.2, Math.sin(k * 1.6) * 0.09); g.add(f); }
  }
  return toonify(g);
}
export const vegOf = (p) => VEG.find((x) => x.seed === p.seed);
export const ripe = (p, age) => { const v = vegOf(p); return !!v && age >= v.days; };
export function harvest(L, o) {
  const st = L.st, v = vegOf(o.p); if (!v) return;
  let n = 0; for (let k = 0; k < v.n + (Math.random() < 0.3 ? 1 : 0); k++) if (st.add(v.id)) n++;
  if (!n) { L.ui.toast('ポケットが いっぱい!'); return false; }
  L.anim = { kind: 'dig', t: 0, dur: 0.5 }; L.ui.jingle([659, 784, 988]); L.emit('harvest');
  L.ui.toast(`${v.name}を ${n}こ しゅうかくした!`, 1800);
  return true;
}

// ---------------------------------------------------------------- cooking and eating
export async function cook(L) {
  const st = L.st, ui = L.ui;
  const rows = DISHES.map((d) => ({ label: `${ICON_BY_ID[d.id]} ${d.name}`, sub: needText(d), ok: can(st, d) }));
  const k = await ui.list('りょうり', rows); if (k < 0) return;
  const d = DISHES[k]; if (!can(st, d)) return;
  for (const [want, n] of d.need) for (let j = 0; j < n; j++) { const i = st.pocket.findIndex((id) => matches(id, want)); st.pocket.splice(i, 1); }
  st.add(d.id); st.ext.cooked = (st.ext.cooked || 0) + 1; st.save();
  L.anim = { kind: 'dig', t: 0, dur: 0.6 }; L.splash?.(0.15, 900); ui.jingle([523, 659, 784, 1047]); L.emit('cook');
  await ui.say(null, ['ジュー、コトコト……', `${d.name}が できた!`]);
}
export async function eat(L, i) {
  const st = L.st, id = st.pocket[i], d = ITEMS[id], C = L.cave;
  st.remove(i); L.ui.jingle([784, 988, 1175]); L.emit('eat');
  if (C?.on) {
    const before = C.hp; C.hp = Math.min(C.maxHp, C.hp + (d.heal || 1)); C.hearts();
    await L.ui.say(null, [`${d.name}を たべた。おいしい!`, C.hp > before ? `ハートが ${C.hp - before}つ もどった!` : 'ハートは もう まんたんだ。']);
    return;
  }
  st.ext.fed = dayKey(); st.save();
  await L.ui.say(null, [`${d.name}を たべた。おいしい!`, 'おなかいっぱい! きょうの 洞窟では ハートが 1つ ふえるよ。']);
}
