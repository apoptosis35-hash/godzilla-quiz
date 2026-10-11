// KUROGANE — 鋼神クロガネ 三式. Original anti-kaiju mecha: silver/black armor, boosters, missiles, maser.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { panelMaps } from '../textures.js';
import { bipedSkeleton, BP, bipedAnims, bipedProc, bipedGait, TAIL } from './biped.js';
import { poses, addTo } from '../rig.js';

function build(q, opts = {}) {
  const rig = bipedSkeleton(0.98, { tail: [[0, -0.2, -1.3], [0, -0.55, -1.4], [0, -0.6, -1.4], [0, -0.6, -1.35], [0, -0.55, -1.3], [0, -0.5, -1.2], [0, -0.45, -1.1], [0, -0.35, -1.0]] });
  const pm = panelMaps(3);
  const silver = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 1, roughness: 0.28, normalMap: pm.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: pm.rough, map: pm.color });
  const black = new THREE.MeshStandardMaterial({ color: 0x23262c, metalness: 0.75, roughness: 0.42, normalMap: pm.normal, normalScale: new THREE.Vector2(0.7, 0.7), map: pm.color });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a640, metalness: 1, roughness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0x9a1818, metalness: 0.6, roughness: 0.4 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x302000, emissive: 0xffd040, emissiveIntensity: 3 });
  const maser = new THREE.MeshStandardMaterial({ color: 0x001830, emissive: 0x40c8ff, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.2 });
  const thruster = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x60b0ff).multiplyScalar(1.3), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const seg = q.level >= 2 ? 3 : 2;
  const box = (w, h, d, mat, r = 0.12) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), mat); m.castShadow = true; return m; };
  const cyl = (r1, r2, h, mat, n = 14) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, n), mat); m.castShadow = true; return m; };
  const A = (bone, mesh, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => rig.attach(bone, mesh, x, y, z, rx, ry, rz);
  // pelvis / torso
  A('hips', box(3.0, 1.6, 2.4, black, 0.3), 0, 0.1, 0);
  A('hips', box(3.2, 0.7, 2.0, silver, 0.2), 0, -0.6, 0.1);
  A('spine', box(3.0, 1.6, 2.4, black, 0.3), 0, 0.5, 0.1);
  A('spine', box(2.6, 0.9, 0.6, silver, 0.15), 0, 0.6, 1.3, -0.15);
  A('chest', box(3.8, 2.4, 3.0, silver, 0.4), 0, 0.3, 0.2, 0.05);
  A('chest', box(2.2, 1.2, 0.5, black, 0.15), 0, 0.2, 1.75, 0.05);
  const port = cyl(0.55, 0.65, 0.4, maser, 20); port.rotation.x = Math.PI / 2; A('chest', port, 0, 0.25, 2.0);
  A('chest', box(4.4, 0.6, 2.4, black, 0.2), 0, 1.4, -0.1);
  // shoulders + missile pods
  for (const m of [1, -1]) {
    const sh = box(1.5, 1.3, 1.9, silver, 0.3); A('shoulder' + (m > 0 ? 'L' : 'R'), sh, 0.25 * m, 0.25, 0, 0, 0, -0.2 * m);
    const pod = box(1.3, 1.0, 1.8, black, 0.15); A('chest', pod, 1.9 * m, 1.85, -0.4);
    for (let i = 0; i < 6; i++) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 8), red);
      h.rotation.x = Math.PI / 2; A('chest', h, 1.9 * m + ((i % 3) - 1) * 0.36, 1.85 + (i < 3 ? 0.2 : -0.2), 0.52);
    }
    // backpack boosters
    const bk = cyl(0.45, 0.55, 2.4, black); bk.rotation.x = 0.35; A('chest', bk, 0.9 * m, 0.2, -1.8);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.4, 12, 1, true), thruster);
    fl.rotation.x = 0.35 + Math.PI; fl.userData.thr = true;
    A('chest', fl, 0.9 * m, -1.5, -2.35);
  }
  // dorsal armor fins
  for (let i = 0; i < 4; i++) {
    const f = box(0.3, 1.4 - i * 0.2, 1.1, silver, 0.1); A(['chest', 'chest', 'spine', 'hips'][i], f, 0, 1.3 - i * 0.1, -1.6 + (i > 1 ? 0.4 : 0), -0.5);
  }
  // neck + head
  A('neck', cyl(0.75, 0.9, 1.4, black), 0, 0.4, 0.2, 0.5);
  const head = new THREE.Group();
  head.add(box(1.5, 1.0, 2.6, silver, 0.25));
  const snout = box(1.15, 0.6, 1.4, silver, 0.15); snout.position.set(0, -0.15, 1.5); head.add(snout);
  const crest = box(0.25, 0.6, 2.2, gold, 0.08); crest.position.set(0, 0.6, -0.2); head.add(crest);
  for (const m of [1, -1]) {
    const v = box(0.2, 0.22, 0.9, eye, 0.05); v.position.set(0.66 * m, 0.18, 0.5); v.rotation.y = 0.15 * m; head.add(v);
    const fin = box(0.15, 0.5, 1.2, black, 0.05); fin.position.set(0.75 * m, 0.45, -0.7); fin.rotation.set(0.4, 0, -0.3 * m); head.add(fin);
  }
  A('head', head, 0, 0.1, 0.6);
  const jaw = box(1.1, 0.35, 1.9, black, 0.1); A('jaw', jaw, 0, -0.05, 0.75);
  // arms
  for (const [sd, m] of [['L', 1], ['R', -1]]) {
    A('shoulder' + sd, cyl(0.45, 0.4, 1.6, black), 0.1 * m, -0.75, 0.2, 0.3, 0, 0);
    const fore = box(1.0, 1.7, 1.0, silver, 0.2); A('elbow' + sd, fore, 0.02 * m, -0.6, 0.45, -0.55);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.4, 4), gold); blade.scale.set(0.35, 1, 1);
    A('elbow' + sd, blade, 0.5 * m, -0.7, 0.4, -0.55 + Math.PI, 0, 0);
    const hand = box(0.7, 0.6, 0.8, black, 0.12); A('wrist' + sd, hand, 0, -0.2, 0.35);
    for (let i = 0; i < 3; i++) { const fg = box(0.16, 0.16, 0.6, silver, 0.05); A('wrist' + sd, fg, (-0.2 + i * 0.2) * m, -0.35, 0.8, 0.5); }
    // legs
    A('thigh' + sd, box(1.5, 2.6, 1.7, silver, 0.3), 0.15 * m, -1.1, 0.45, -0.35);
    A('knee' + sd, box(1.0, 2.6, 1.1, black, 0.2), 0.02 * m, -1.15, -0.35, 0.3);
    A('knee' + sd, box(1.1, 0.8, 0.9, gold, 0.15), 0, 0.15, 0.35);
    const foot = box(1.3, 0.6, 2.5, silver, 0.2); A('ankle' + sd, foot, 0, -0.15, 0.55);
    const fthr = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 10, 1, true), thruster); fthr.userData.thr = true; fthr.rotation.x = Math.PI;
    A('knee' + sd, fthr, 0, -1.6, -1.0);
  }
  // tail segments
  TAIL.forEach((t, i) => {
    const k = 1 - i / 9;
    A(t, box(1.4 * k + 0.2, 1.2 * k + 0.2, 1.6, i % 2 ? black : silver, 0.15), 0, 0, -0.65);
    if (i < 6) A(t, box(0.2, 0.6 * k, 0.9, silver, 0.05), 0, 0.75 * k + 0.3, -0.6, -0.4);
  });
  const root = new THREE.Group(), pivot = new THREE.Group();
  root.add(pivot); pivot.add(rig.root);
  const thr = [];
  rig.root.traverse((o) => { if (o.userData.thr) thr.push(o); });
  let light = null;
  if (q.level >= 2) { light = new THREE.PointLight(0x60c8ff, 0, 25, 1.6); A('chest', light, 0, 0.3, 3); }
  return {
    root, pivot, rig, mouth: { bone: 'chest', off: new THREE.Vector3(0, 0.25, 2.3) },
    update(f) {
      const id = f.state === 'move' ? f.moveId : null;
      const boost = f.state === 'dash' || f.state === 'evade' || f.state === 'backdash' || id === 'boostKnee' || id === 'dashKnee' || (f.move && f.move.boost);
      const t = performance.now() * 0.02;
      for (const o of thr) { const s = boost ? 1.4 + Math.sin(t * 3) * 0.2 : 0.35 + Math.sin(t) * 0.05; o.scale.set(1, s, 1); o.visible = s > 0.2; }
      let e = 0.6;
      if (id === 'maser' || id === 'super') {
        const mv = f.move;
        e = f.mf < mv.startup ? 0.8 + (f.mf / mv.startup) * 5 : (f.mf < mv.startup + mv.active ? 6 : 0.8);
      }
      maser.emissiveIntensity = e;
      if (light) light.intensity = e > 2 ? e * 15 : 0;
    },
  };
}

const B = BP;
const P = poses(B.base, {
  ...Object.fromEntries(Object.entries(B).filter(([k]) => k !== 'base')),
  kneeWind: { _root: [0, 0.3, -0.3, -0.1, 0, 0], thighR: [-1.4, 0, -0.1], kneeR: [1.6, 0, 0], spine: [0.0, 0, 0], shoulderL: [-0.8, 0, 0.4], shoulderR: [-0.8, 0, -0.4] },
  kneeHit: { _root: [0, 1.2, 0.8, 0.0, 0, 0], thighR: [-1.8, 0, -0.1], kneeR: [0.5, 0, 0], thighL: [0.3, 0, 0], kneeL: [0.6, 0, 0], spine: [0.25, 0, 0], shoulderL: [0.2, 0, 0.5], shoulderR: [0.2, 0, -0.5] },
  bladeWind: { spine: [0.05, 0.5, 0], shoulderL: [-0.3, 0.3, 1.3], elbowL: [-1.2, 0, 0], shoulderR: [-0.9, 0, -0.3] },
  bladeHit: { spine: [0.2, -0.6, 0], chest: [0.1, -0.3, 0], shoulderL: [-1.5, 0.6, -0.4], elbowL: [-0.1, 0, 0], shoulderR: [-0.4, 0, -0.5] },
  missileAim: { spine: [-0.15, 0, 0], chest: [-0.2, 0, 0], neck: [0.1, 0, 0], shoulderL: [-0.9, 0, 0.6], shoulderR: [-0.9, 0, -0.6], elbowL: [-1.0, 0, 0], elbowR: [-1.0, 0, 0] },
  maserAim: { _root: [0, -0.4, -0.2, 0, 0, 0], ...{ thighL: [-0.6, 0, 0.15], kneeL: [0.6, 0, 0], thighR: [0.2, 0, -0.15], kneeR: [0.3, 0, 0] }, spine: [0.15, 0, 0], chest: [0.05, 0, 0], neck: [0.25, 0, 0], shoulderL: [-0.5, 0, 0.9], shoulderR: [-0.5, 0, -0.9], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0] },
  drill: { spine: [0.3, -0.3, 0], shoulderR: [-1.6, 0, 0.0], elbowR: [-0.05, 0, 0], wristR: [0, 0, 0], shoulderL: [-0.5, 0, 0.5] },
});
const anims = bipedAnims(P);
anims.intro = [[0, P.kneel], [30, P.base, 'io'], [55, P.maserAim, 'io'], [110, P.maserAim], [140, P.base, 'io']];
anims.win = [[0, P.base], [25, { ...P.base, shoulderR: [-2.8, 0, -0.2], elbowR: [-0.2, 0, 0], neck: [-0.3, 0, 0], head: [-0.2, 0, 0] }, 'io'], [400, { ...P.base, shoulderR: [-2.8, 0, -0.2], elbowR: [-0.2, 0, 0], neck: [-0.3, 0, 0], head: [-0.2, 0, 0] }]];

const moves = {
  jab: {
    name: 'アームブレード', startup: 7, active: 3, recovery: 11, dmg: 27, height: 'high', hit: { z: 5.3, y: 7, r: 2.2 },
    hitstun: 17, blockstun: 10, push: 0.2, anim: [[0, P.base], [4, P.bladeWind], [8, P.bladeHit, 'snap'], [14, P.bladeHit], [21, P.base, 'io']],
    cancel: { from: 8, until: 18, to: ['missiles', 'boostKnee'], special: true, chain: { L: 'jab2' } }, sparkColor: 0xfff0a0,
  },
  jab2: {
    name: 'リターンブレード', startup: 8, active: 3, recovery: 13, dmg: 30, height: 'mid', hit: { z: 5.3, y: 6.5, r: 2.3 },
    hitstun: 19, blockstun: 11, push: 0.28, lunge: [[0, 8, 0.14]], anim: [[0, P.bladeHit], [5, P.clawWindR], [9, P.clawHitR, 'snap'], [16, P.clawHitR], [24, P.base, 'io']],
    cancel: { from: 9, until: 20, to: ['boostKnee', 'maser', 'missiles', 'heavy'], special: true, chain: { L: 'drill' } }, sparkColor: 0xfff0a0,
  },
  drill: {
    name: 'ドリルクロー', startup: 13, active: 8, recovery: 18, dmg: 52, height: 'mid', hit: { z: 6, y: 6.5, r: 2.4 },
    hitstun: 22, blockstun: 14, push: 0.9, lunge: [[6, 18, 0.32]], anim: [[0, P.base], [9, P.clawWindR, 'io'], [13, P.drill, 'snap'], [26, P.drill], [39, P.base, 'io']],
    sfx: [[13, 'buzz', { len: 0.3, pitch: 2 }]], sparkColor: 0xfff0a0, boost: true,
  },
  sweep: {
    name: 'テイルスライサー', startup: 12, active: 5, recovery: 20, dmg: 46, height: 'low', hit: [{ z: 6, y: 1, r: 3 }, { z: 9, y: 1, r: 2.2 }], spin: 1,
    hitstun: 22, blockstun: 14, push: 0.5, knockdown: true,
    anim: [[0, P.base], [6, P.spinWind, 'io'], [13, { ...P.kneel, _root: [0, -1.4, 0, 0.3, Math.PI * 1.05, 0] }, 'io'], [19, { ...P.kneel, _root: [0, -1.4, 0, 0.3, Math.PI * 1.4, 0] }], [37, { ...P.base, _root: [0, 0, 0, 0, Math.PI * 2, 0] }, 'io']],
  },
  lowkick: {
    name: 'スタンピングキック', startup: 10, active: 3, recovery: 14, dmg: 28, height: 'low', hit: { z: 4.6, y: 0.8, r: 2.2 },
    hitstun: 18, blockstun: 11, push: 0.3, otg: true, anim: [[0, P.base], [7, P.stompWind, 'io'], [11, P.stompHit, 'snap'], [17, P.stompHit], [27, P.base, 'io']],
    cancel: { from: 11, until: 20, to: ['sweep'] },
  },
  boostKnee: {
    name: 'ブースターニー', startup: 11, active: 5, recovery: 22, dmg: 50, height: 'mid', hit: { z: 4.2, y: 6.5, r: 2.6 },
    hitstun: 20, blockstun: 12, push: 0.3, launch: 0.65, lunge: [[3, 16, 0.5]], anim: [[0, P.base], [7, P.kneeWind, 'io'], [12, P.kneeHit, 'snap'], [20, P.kneeHit], [38, P.base, 'io']],
    sfx: [[3, 'whoosh', { pitch: 0.7 }]], cancel: { from: 16, until: 30, to: ['maser', 'missiles'], special: true },
  },
  heavy: {
    name: 'ハンマーナックル', startup: 15, active: 4, recovery: 18, dmg: 62, height: 'mid', hit: { z: 5.4, y: 5.5, r: 2.7 },
    hitstun: 24, blockstun: 16, push: 0.8, wallsplat: true, anim: [[0, P.base], [11, P.overWind, 'io'], [16, P.overHit, 'snap'], [25, P.overHit], [37, P.base, 'io']],
    events: [[16, 'groundSlam', { z: 5, power: 0.6 }]], cancel: { from: 17, until: 26, to: ['maser', 'missiles'], special: true },
  },
  dashKnee: {
    name: 'ジェットタックル', startup: 10, active: 8, recovery: 24, dmg: 66, height: 'mid', hit: { z: 4.5, y: 6, r: 3 },
    hitstun: 24, blockstun: 14, push: 1.4, knockdown: true, wallsplat: true, lunge: [[0, 18, 0.6]],
    anim: [[0, P.dash], [8, P.shoulderWind, 'io'], [12, P.shoulderHit, 'snap'], [22, P.shoulderHit], [42, P.base, 'io']], boost: true,
  },
  grab: {
    name: 'クローバインド', startup: 8, active: 4, recovery: 26, dmg: 0, height: 'throw', hit: { z: 4.3, y: 6, r: 2.3 },
    anim: [[0, P.base], [7, P.biteHold, 'snap'], [14, P.biteHold], [36, P.base, 'io']],
    throw: { anim: [[0, P.biteHold], [12, P.biteHold], [16, { ...P.maserAim, shoulderL: [-1.5, 0, 0.3], shoulderR: [-1.5, 0, -0.3] }, 'snap'], [30, P.maserAim], [50, P.base, 'io']], len: 50, release: 30,
      path: [[0, 3.5, 0.5], [12, 3.5, 1.5], [30, 3.8, 1.0]],
      hitMove: { dmg: 105, launch: 0.3, push: 1.6, knockdown: true, wallsplat: true }, events: [[4, 'bite'], [16, 'zeroBlast']] },
  },
  missiles: {
    name: 'ミサイル一斉射', special: true, startup: 16, active: 10, recovery: 22, dmg: 0, height: 'mid',
    proj: [{ at: 16, kind: 'missile', count: 6, spread: 1.0, stagger: 3, speed: 0.75, y: 10, z: -0.5, vy: 0.45, homing: 0.06, homingDelay: 10, r: 0.9, life: 110, dmg: 16, hitstun: 14, push: 0.25, color: 0xffa040, sfx: 'missile', gravity: 0.004 }],
    anim: [[0, P.base], [10, P.missileAim, 'io'], [40, P.missileAim], [48, P.base, 'io']], cooldown: 70,
  },
  maser: {
    name: 'メーサーブラスター', special: true, startup: 20, active: 28, recovery: 22, dmg: 13, height: 'mid',
    beam: { from: 20, to: 48, z: 2.6, y: 7.9, width: 0.75, tick: 4, dmg: 13, push: 0.14, hitstun: 12, blockstun: 8, range: 70, color: 0x40c8ff, core: 0xe0ffff, sweep: 0.009, kind: 'maser', pitch: 1.8, bright: 2 },
    anim: [[0, P.base], [12, P.maserAim, 'io'], [48, P.maserAim], [70, P.base, 'io']], track: 16, sfx: [[1, 'charge', { len: 0.33, pitch: 1.6 }]],
  },
  overdrive: {
    name: 'オーバーブースト', special: true, startup: 6, active: 10, recovery: 16, dmg: 40, height: 'mid', hit: { z: 3.5, y: 6, r: 3.2 },
    hitstun: 20, blockstun: 12, push: 1.2, launch: 0.45, lunge: [[0, 16, 0.75]], meterCost: 20, boost: true,
    anim: [[0, P.dash], [6, P.shoulderHit, 'snap'], [16, P.shoulderHit], [32, P.base, 'io']], events: [[0, 'invul', { n: 12 }]], sfx: [[0, 'whoosh', { pitch: 0.5, vol: 1 }]],
  },
  super: {
    name: 'アブソリュート・ゼロ', super: true, special: true, startup: 64, active: 50, recovery: 30, dmg: 24, height: 'mid',
    beam: { from: 64, to: 114, z: 2.6, y: 7.9, width: 2.6, tick: 4, dmg: 24, push: 0.3, hitstun: 16, blockstun: 10, range: 90, color: 0x9ff0ff, core: 0xffffff, sweep: 0.006, kind: 'zero', super: true, pitch: 1.2, bright: 1.6 },
    anim: [[0, P.base], [20, P.missileAim, 'io'], [50, P.missileAim], [60, P.maserAim, 'io'], [114, P.maserAim], [144, P.base, 'io']],
    track: 62, events: [[0, 'invul', { n: 68 }]], sfx: [[30, 'charge', { len: 0.5, pitch: 1.5 }]],
  },
};
for (const k in moves) moves[k].id = k;

export default {
  id: 'kurogane', name: 'KUROGANE', jp: '鋼神クロガネ 三式', title: '対巨獣決戦兵器', era: '2003年 特生自衛隊 配備',
  desc: '人類が建造した銀と黒の対巨獣兵器。ブースターによる高機動とアームブレード、ミサイル、胸部メーサー砲を使い分ける万能型。',
  style: '高機動兵器型', strengths: '高速な技・飛び道具・ブースト突進', weakness: '一撃は軽め・ミサイルに再使用時間',
  stats: { power: 3, speed: 4, defense: 3, reach: 4 }, specialNames: ['ミサイル一斉射', 'メーサーブラスター', 'オーバーブースト'], superName: 'アブソリュート・ゼロ',
  hp: 1000, defense: 1.0, walk: 0.11, back: 0.085, side: 0.1, dash: 0.48, evade: 0.38, weight: 1.15, push: 2.3, height: 11.2, stride: 1.4,
  hurt: [{ z: 0, y0: 0, y1: 9.5, r: 2.3 }, { z: 1.5, y0: 8.5, y1: 11, r: 1.3 }, { z: -4, y0: 0, y1: 4, r: 1.4 }],
  voice: { pitch: 0.9, metal: true, rough: 0.6, formant: 1.2 }, color: '#60c8ff', camH: 1,
  tails: [TAIL], poses: P, anims, gait: (p, ph, amt, ctx) => bipedGait(p, ph, amt * 0.9, ctx), proc: bipedProc,
  moves,
  commands: { L: 'jab', 'f+L': 'drill', 'd+L': 'lowkick', H: 'heavy', 'f+H': 'boostKnee', 'd+H': 'sweep', 'b+H': 'boostKnee', 'dash+H': 'dashKnee', 'dash+L': 'drill', G: 'grab', S: 'missiles', 'f+S': 'overdrive', 'd+S': 'maser', 'b+S': 'maser', X: 'super' },
  ai: { range: 7, zoning: 0.4, aggression: 0.6 },
  events: {
    zeroBlast(f, m) { const v = f.holding?.victim; if (!v) return; m.fx.burst(v.local(0, 6), { n: 40, color: 0x9ff0ff, speed: 25, size: 1.2, life: 0.5 }); m.fx.flash(v.local(0, 6), 0x9ff0ff, 40, 0.3); m.audio.play('laser', { vol: 0.9, pitch: 0.6 }); m.camRig.shake(0.3); },
  },
  build,
};
