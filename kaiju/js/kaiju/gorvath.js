// GORVATH — 核熱巨獣ゴルヴァス. Original heavy-power reptile kaiju with violet crystal dorsal plates.
import * as THREE from 'three';
import { mergeByBone, skinnedLoft, rigidLoft, spikes, plateGeometry } from '../rig.js';
import { scaleMaps } from '../textures.js';
import { bipedSkeleton, BP, bipedAnims, bipedGait, bipedProc, TAIL } from './biped.js';

function build(q, opts = {}) {
  const rig = bipedSkeleton(1);
  const det = q.detail;
  const sc = scaleMaps('reptile', 1);
  const boss = opts.boss;
  const skin = new THREE.MeshStandardMaterial({
    color: boss ? 0x2b2124 : 0x3b403b, map: sc.color, normalMap: sc.normal, normalScale: new THREE.Vector2(1.6, 1.6),
    roughnessMap: sc.rough, roughness: 1, metalness: 0.05, vertexColors: true,
  });
  const dark = (u, a) => {
    const dors = Math.max(0, Math.sin(a));
    const k = 1 - dors * 0.35;
    return [0.75 * k + 0.08, 0.78 * k + 0.06, 0.74 * k + 0.05];
  };
  const shape = (u, a) => {
    const s = Math.sin(a);
    return 1 + 0.07 * Math.pow(Math.max(0, s), 6) - 0.08 * Math.pow(Math.max(0, -s), 2);
  };
  // ---- torso + tail + neck (one continuous skinned body) ----
  const body = skinnedLoft(rig, [
    { b: null, p: [0, 0, 0], o: [0, 1.05, -11.6], w: 0.04, h: 0.04 },
    { b: 'tail8', w: 0.3, h: 0.26 },
    { b: 'tail7', w: 0.42, h: 0.38 },
    { b: 'tail6', w: 0.56, h: 0.5 },
    { b: 'tail5', w: 0.72, h: 0.64 },
    { b: 'tail4', w: 0.9, h: 0.8 },
    { b: 'tail3', w: 1.08, h: 0.98 },
    { b: 'tail2', w: 1.3, h: 1.2 },
    { b: 'tail1', w: 1.62, h: 1.5 },
    { b: 'hips', w: 2.0, h: 1.85, dy: -0.25 },
    { b: 'spine', w: 2.05, h: 1.8, dy: -0.4 },
    { b: 'chest', w: 1.9, h: 1.6, dy: -0.3 },
    { b: 'neck', w: 1.2, h: 1.15, dy: -0.1 },
    { b: 'head', w: 0.85, h: 0.85 },
    { b: null, p: [0, 0.2, 0.3], w: 0.6, h: 0.6 },
  ], skin, { rings: Math.round(110 * det), radial: Math.round(28 * det), texLen: 3, vRepeat: 3, noise: 0.06, noiseFreq: 1.6, shape, color: dark });

  // ---- head ----
  const head = rigidLoft([
    { p: [0, 0.1, -0.75], w: 0.55, h: 0.5 },
    { p: [0, 0.28, -0.15], w: 0.86, h: 0.72 },
    { p: [0, 0.22, 0.55], w: 0.84, h: 0.62 },
    { p: [0, 0.06, 1.25], w: 0.66, h: 0.46 },
    { p: [0, -0.04, 1.85], w: 0.5, h: 0.34 },
    { p: [0, -0.1, 2.3], w: 0.3, h: 0.22 },
    { p: [0, -0.12, 2.48], w: 0.04, h: 0.04 },
  ], skin, {
    rings: Math.round(36 * det), radial: Math.round(22 * det), texLen: 1.2, color: dark,
    shape: (u, a) => { const s = Math.sin(a); const brow = u > 0.25 && u < 0.5 ? 0.12 * Math.pow(Math.max(0, s), 2) * Math.pow(Math.abs(Math.cos(a)), 0.5) : 0; return 1 + brow - 0.18 * Math.pow(Math.max(0, -s), 1.5); },
  });
  rig.attach('head', head);
  const jaw = rigidLoft([
    { p: [0, 0.05, -0.65], w: 0.5, h: 0.32 },
    { p: [0, -0.08, 0.2], w: 0.62, h: 0.3 },
    { p: [0, -0.1, 1.0], w: 0.5, h: 0.22 },
    { p: [0, -0.06, 1.55], w: 0.32, h: 0.15 },
    { p: [0, 0, 1.82], w: 0.04, h: 0.04 },
  ], skin, { rings: Math.round(24 * det), radial: Math.round(16 * det), texLen: 1.2, color: dark });
  rig.attach('jaw', jaw);
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.4 });
  const upper = [], lower = [];
  for (let i = 0; i < 7; i++) {
    const z = 0.55 + i * 0.25, w = 0.58 - i * 0.045;
    for (const m of [1, -1]) {
      upper.push({ p: [w * m, -0.32, z], d: [0, -1, 0.1], r: 0.06, l: 0.28 - i * 0.015 });
      lower.push({ p: [(w - 0.08) * m, 0.12, z - 0.35], d: [0, 1, 0.1], r: 0.05, l: 0.22 });
    }
  }
  rig.attach('head', new THREE.Mesh(spikes(upper), toothMat));
  rig.attach('jaw', new THREE.Mesh(spikes(lower), toothMat));
  // eyes
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x220800, emissive: boss ? 0xff1030 : 0xffa020, emissiveIntensity: 2.2, roughness: 0.2 });
  for (const m of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), eyeMat);
    e.scale.set(1, 0.6, 1.3);
    rig.attach('head', e, 0.66 * m, 0.38, 0.72, 0, 0.35 * m, 0);
  }
  // ---- arms ----
  const claw = new THREE.MeshStandardMaterial({ color: 0xd9d2bd, roughness: 0.35, metalness: 0.0 });
  for (const [sd, m] of [['L', 1], ['R', -1]]) {
    skinnedLoft(rig, [
      { b: null, p: [0, 0, 0], o: [0.9 * m, 8.1, 1.0], w: 0.55, h: 0.55 },
      { b: 'shoulder' + sd, w: 0.66, h: 0.7 },
      { b: 'elbow' + sd, w: 0.5, h: 0.52 },
      { b: 'wrist' + sd, w: 0.4, h: 0.38 },
      { b: null, p: [0.03 * m, -0.35, 0.45], w: 0.36, h: 0.22 },
      { b: null, p: [0, -0.2, 0.25], w: 0.05, h: 0.05 },
    ], skin, { rings: Math.round(30 * det), radial: Math.round(16 * det), texLen: 1.5, noise: 0.08, color: dark });
    const cl = [];
    for (let i = 0; i < 4; i++) {
      const x = (-0.24 + i * 0.16) * m;
      cl.push({ p: [x, -0.4, 0.62], d: [x * 0.4, -0.8, 1], r: 0.07, l: 0.55 });
    }
    rig.attach('wrist' + sd, new THREE.Mesh(spikes(cl, 0.07, 0.5, 5), claw));
    // ---- legs ----
    skinnedLoft(rig, [
      { b: null, p: [0, 0, 0], o: [0.75 * m, 5.6, 0.0], w: 1.0, h: 1.1 },
      { b: 'thigh' + sd, w: 1.3, h: 1.45, dy: 0.1 },
      { b: 'knee' + sd, w: 0.9, h: 0.95 },
      { b: 'ankle' + sd, w: 0.62, h: 0.62 },
      { b: null, p: [0, -0.2, 0.2], w: 0.55, h: 0.5 },
    ], skin, { rings: Math.round(30 * det), radial: Math.round(18 * det), texLen: 2, noise: 0.07, color: dark });
    const foot = rigidLoft([
      { p: [0, 0.05, -0.75], w: 0.55, h: 0.35 },
      { p: [0, -0.12, 0.2], w: 0.82, h: 0.38 },
      { p: [0, -0.22, 1.0], w: 0.7, h: 0.26 },
      { p: [0, -0.26, 1.45], w: 0.3, h: 0.15 },
      { p: [0, -0.26, 1.6], w: 0.04, h: 0.04 },
    ], skin, { rings: Math.round(18 * det), radial: Math.round(14 * det), texLen: 1, color: dark });
    rig.attach('ankle' + sd, foot);
    const tc = [];
    for (let i = 0; i < 3; i++) tc.push({ p: [(-0.42 + i * 0.42), -0.3, 1.25 - Math.abs(i - 1) * 0.2], d: [(i - 1) * 0.3, -0.25, 1], r: 0.11, l: 0.5 });
    rig.attach('ankle' + sd, new THREE.Mesh(spikes(tc, 0.1, 0.4, 5), claw));
  }
  // ---- dorsal plates (3 rows, crystalline, glow) ----
  const plates = [];
  const plateBase = new THREE.MeshPhysicalMaterial({
    color: boss ? 0xffb0b0 : 0xd4c6ff, roughness: 0.22, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.15,
    emissive: boss ? 0xff2040 : 0x8a4dff, emissiveIntensity: 0.12, sheen: 0.5, sheenColor: new THREE.Color(0xb090ff),
  });
  const fr = body.userData.frames, pr = body.userData.prof;
  const boneNames = ['tail8', 'tail7', 'tail6', 'tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'hips', 'spine', 'chest', 'neck', 'head'];
  const nearestBone = (P) => {
    let best = null, bd = 1e9;
    const wp = new THREE.Vector3();
    for (const n of boneNames) {
      rig.bones[n].getWorldPosition(wp);
      // prefer the bone "behind" the point along the chain: bias by small amount
      const d = wp.distanceTo(P);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  };
  const rows = q.level >= 2 ? [0, 1, -1] : [0];
  const N = Math.round(16 * Math.min(1.2, det + 0.1));
  let idx = 0;
  for (const row of rows) {
    for (let i = 0; i < N; i++) {
      const u = 0.18 + (i / (N - 1)) * 0.74;
      const { P, T, S, N: Nn } = fr(u);
      const p = pr(u);
      const sizeK = Math.min(1, p.h / 1.4) * (u > 0.62 && u < 0.9 ? 1.2 : 1);
      let h = (row === 0 ? 2.2 : 1.45) * sizeK + 0.25, w = (row === 0 ? 1.6 : 1.1) * sizeK + 0.25;
      if (u > 0.9) { h *= 0.6; w *= 0.7; }
      const geo = plateGeometry(w, h, row === 0 ? 3 : 2, 0.09 + 0.06 * sizeK, i + row * 7);
      const mat = plateBase.clone();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      const basis = new THREE.Matrix4().makeBasis(T, Nn, S.clone().negate());
      const qq = new THREE.Quaternion().setFromRotationMatrix(basis);
      if (row) qq.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.42 * row));
      const pos = P.clone().addScaledVector(Nn, p.h * 0.82 + p.dy).addScaledVector(S, row * p.w * 0.32);
      rig.attachWorld(nearestBone(P), mesh, pos, qq);
      plates.push({ mesh, mat, k: u, row });
      idx++;
    }
  }
  mergeByBone(rig);
  const root = new THREE.Group(), pivot = new THREE.Group();
  root.add(pivot); pivot.add(rig.root);
  rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = q.level >= 2; } });
  let light = null;
  if (q.level >= 2) {
    light = new THREE.PointLight(boss ? 0xff3050 : 0x9a60ff, 0, 30, 1.6);
    rig.attach('chest', light, 0, 1, -2.5);
  }
  const glowCol = new THREE.Color(boss ? 0xff2040 : 0x8a4dff), hot = new THREE.Color(boss ? 0xffd0d0 : 0xe8d8ff);
  return {
    root, pivot, rig, plates, light,
    mouth: { bone: 'head', off: new THREE.Vector3(0, -0.15, 2.45) },
    update(f) {
      // dorsal glow ripple driven by move frames
      let charge = 0, full = 0;
      const id = f.state === 'move' ? f.moveId : null;
      if (id === 'breath' || id === 'super') {
        const c = id === 'super' ? 70 : 30;
        charge = Math.min(1, f.mf / c);
        if (f.mf >= c) full = 1;
        if (f.mf > f.move.startup + f.move.active) full = Math.max(0, 1 - (f.mf - f.move.startup - f.move.active) / 20);
      } else if (id === 'pulse') { full = f.mf < 26 ? 1 : 0; charge = 1; }
      const t = performance.now() * 0.001;
      for (const pl of plates) {
        const ripple = Math.max(0, Math.min(1, charge * 1.6 - (1 - pl.k) * 0.9));
        let e = 0.1 + Math.sin(t * 1.5 + pl.k * 4) * 0.04 + ripple * 1.1 + full * (1.1 + Math.sin(t * 40 + pl.k * 9) * 0.3);
        pl.mat.emissiveIntensity = e * (boss ? 1.2 : 1);
        pl.mat.emissive.copy(glowCol).lerp(hot, Math.min(1, full * 0.5 + ripple * 0.3));
      }
      if (light) light.intensity = (charge * 25 + full * 60) * (q.level >= 3 ? 1 : 0.7);
    },
  };
}

const P = BP;
const A = bipedAnims(P);
const moves = {
  jab: {
    name: 'クロースラッシュ', startup: 8, active: 3, recovery: 13, dmg: 30, height: 'high', hit: { z: 5.2, y: 7, r: 2.4 },
    hitstun: 18, blockstun: 11, push: 0.2, anim: [[0, P.base], [5, P.clawWindR], [9, P.clawHitR, 'snap'], [16, P.clawHitR], [24, P.base, 'io']],
    cancel: { from: 9, until: 20, to: ['upper', 'tailspin', 'stomp'], chain: { L: 'jab2' } }, sfxStart: 'swing',
  },
  jab2: {
    name: 'リターンクロー', startup: 9, active: 3, recovery: 14, dmg: 34, height: 'mid', hit: { z: 5.2, y: 6.5, r: 2.4 },
    hitstun: 20, blockstun: 12, push: 0.28, lunge: [[0, 9, 0.14]], anim: [[0, P.clawHitR], [5, P.clawWindL], [10, P.clawHitL, 'snap'], [17, P.clawHitL], [26, P.base, 'io']],
    cancel: { from: 10, until: 22, to: ['tailspin', 'upper', 'breath', 'pulse'], special: true, chain: { L: 'overhead' } },
  },
  overhead: {
    name: 'ダブルハンマー', startup: 16, active: 4, recovery: 18, dmg: 62, height: 'mid', hit: { z: 5.6, y: 5.5, r: 2.8 },
    hitstun: 24, blockstun: 16, push: 0.7, lunge: [[0, 15, 0.12]], anim: [[0, P.base], [12, P.overWind, 'io'], [17, P.overHit, 'snap'], [26, P.overHit], [38, P.base, 'io']],
    events: [[17, 'groundSlam', { z: 5, power: 0.7 }]], cancel: { from: 18, until: 26, to: ['breath'], special: true },
  },
  stomp: {
    name: 'クラッシュストンプ', startup: 11, active: 4, recovery: 16, dmg: 34, height: 'low', hit: { z: 4.5, y: 0.8, r: 2.4 },
    hitstun: 19, blockstun: 12, push: 0.3, otg: true, anim: [[0, P.base], [8, P.stompWind, 'io'], [12, P.stompHit, 'snap'], [20, P.stompHit], [31, P.base, 'io']],
    events: [[12, 'groundSlam', { z: 4.5, power: 0.5 }]], cancel: { from: 12, until: 22, to: ['tailsweep'] },
  },
  tailspin: {
    name: 'テイルスマッシュ', startup: 18, active: 5, recovery: 22, dmg: 86, height: 'mid', hit: [{ z: 6.5, y: 4, r: 3.4 }, { z: 9.5, y: 3.5, r: 2.6 }],
    hitstun: 26, blockstun: 18, push: 1.0, knockdown: true, armor: [5, 17], spin: 1,
    anim: [[0, P.base], [9, P.spinWind, 'io'], [19, { ...P.spinWind, _root: [0, -0.5, 0, 0.1, Math.PI * 1.05, 0] }, 'io'], [24, { ...P.spinWind, _root: [0, -0.3, 0, 0.1, Math.PI * 1.45, 0] }], [42, { ...P.base, _root: [0, 0, 0, 0, Math.PI * 2, 0] }, 'io']],
    sfx: [[15, 'whoosh', { pitch: 0.5, vol: 0.9 }]], track: 6,
  },
  tailsweep: {
    name: 'テイルスイープ', startup: 15, active: 5, recovery: 22, dmg: 62, height: 'low', hit: [{ z: 6, y: 1, r: 3.2 }, { z: 9, y: 1, r: 2.4 }],
    hitstun: 24, blockstun: 16, push: 0.6, knockdown: true, spin: 1,
    anim: [[0, P.base], [8, P.spinWind, 'io'], [16, { ...P.kneel, _root: [0, -1.5, 0, 0.3, Math.PI * 1.05, 0], tail1: [-0.3, 0, 0] }, 'io'], [22, { ...P.kneel, _root: [0, -1.5, 0, 0.3, Math.PI * 1.4, 0] }], [42, { ...P.base, _root: [0, 0, 0, 0, Math.PI * 2, 0] }, 'io']],
    sfx: [[12, 'whoosh', { pitch: 0.45, vol: 0.9 }]],
  },
  ram: {
    name: 'ショルダーラム', startup: 15, active: 6, recovery: 20, dmg: 72, height: 'mid', hit: { z: 4.5, y: 6, r: 3 },
    hitstun: 24, blockstun: 16, push: 1.4, wallsplat: true, armor: [4, 16], lunge: [[8, 22, 0.42]],
    anim: [[0, P.base], [8, P.shoulderWind, 'io'], [16, P.shoulderHit, 'snap'], [24, P.shoulderHit], [41, P.base, 'io']],
  },
  upper: {
    name: 'ライジングクロー', startup: 13, active: 4, recovery: 24, dmg: 48, height: 'mid', hit: { z: 4.6, y: 7.5, r: 2.6 },
    hitstun: 20, blockstun: 12, push: 0.25, launch: 0.62, anim: [[0, P.base], [8, P.upperWind, 'io'], [14, P.upperHit, 'snap'], [22, P.upperHit], [41, P.base, 'io']],
    cancel: { from: 16, until: 30, to: ['breath', 'pulse'], special: true },
  },
  dashslam: {
    name: 'ボディプレス', startup: 14, active: 6, recovery: 30, dmg: 84, height: 'mid', hit: { z: 4.5, y: 4, r: 3.2 },
    hitstun: 26, blockstun: 18, push: 0.9, knockdown: true, lunge: [[0, 18, 0.38]],
    anim: [[0, P.dash], [10, { ...P.overWind, _root: [0, 1.0, 0.5, -0.1, 0, 0] }, 'io'], [16, { ...P.overHit, _root: [0, -1.2, 1.0, 0.5, 0, 0] }, 'snap'], [30, { ...P.overHit, _root: [0, -1.2, 1.0, 0.5, 0, 0] }], [50, P.base, 'io']],
    events: [[16, 'groundSlam', { z: 4, power: 1 }]],
  },
  grab: {
    name: 'クランチバイト', startup: 9, active: 4, recovery: 26, dmg: 0, height: 'throw', hit: { z: 4.3, y: 6, r: 2.3 },
    anim: [[0, P.base], [8, P.biteReach, 'snap'], [14, P.biteReach], [36, P.base, 'io']],
    throw: { anim: [[0, P.biteReach], [6, P.biteHold, 'io'], [26, P.biteHold], [34, P.biteFling, 'snap'], [60, P.base, 'io']], len: 60, release: 34,
      path: [[0, 3.6, 0, 0], [8, 3.4, 2.5, 0], [26, 3.2, 3.2, 0], [34, 2.5, 3, -3]],
      hitMove: { dmg: 115, launch: 0.38, push: 1.1, knockdown: true, wallsplat: true }, events: [[10, 'bite'], [18, 'bite']] },
  },
  breath: {
    name: 'フィッション・レイ', special: true, startup: 30, active: 40, recovery: 24, dmg: 16, height: 'mid',
    beam: { from: 30, to: 70, z: 4, y: 9.6, width: 1.0, tick: 5, dmg: 16, push: 0.18, hitstun: 14, blockstun: 9, range: 75, color: 0x9a6bff, core: 0xfff0ff, sweep: 0.0065, kind: 'fission' },
    anim: [[0, P.base], [14, P.breathCharge, 'io'], [30, P.breathCharge], [33, P.breathFire, 'snap'], [70, P.breathFire], [94, P.base, 'io']],
    track: 20, sfx: [[1, 'charge', { len: 0.5 }]], blend: 0.3,
  },
  pulse: {
    name: 'フィッション・パルス', special: true, startup: 10, active: 8, recovery: 26, dmg: 58, height: 'mid', hit: { z: 0, y: 5, r: 7.2 },
    hitstun: 22, blockstun: 16, push: 1.3, launch: 0.42, meterCost: 25, invul: true, chip: 0.2,
    anim: [[0, P.base], [8, P.breathCharge, 'io'], [11, P.pulse, 'snap'], [24, P.pulse], [44, P.base, 'io']],
    events: [[0, 'invul', { n: 18 }], [10, 'pulse', { color: 0xa070ff, r: 9 }]],
  },
  quake: {
    name: 'アースクエイク', special: true, startup: 20, active: 4, recovery: 22, dmg: 0, height: 'low',
    proj: [{ at: 20, kind: 'quake', speed: 0.55, y: 0.6, r: 2.3, life: 45, dmg: 52, height: 'low', hitstun: 22, push: 0.5, knockdown: true, color: 0xffa060 }],
    anim: [[0, P.base], [14, P.stompWind, 'io'], [20, P.stompHit, 'snap'], [28, P.stompHit], [46, P.base, 'io']],
    events: [[20, 'groundSlam', { z: 3.5, power: 0.9 }]], cooldown: 40,
  },
  super: {
    name: 'メルトダウン・フィッション', super: true, special: true, startup: 72, active: 64, recovery: 30, dmg: 22, height: 'mid',
    beam: { from: 72, to: 136, z: 4, y: 9.6, width: 2.3, tick: 4, dmg: 22, push: 0.28, hitstun: 16, blockstun: 10, range: 90, color: 0xb070ff, core: 0xffffff, sweep: 0.006, kind: 'fission', super: true },
    anim: [[0, P.base], [20, P.roar, 'io'], [50, P.roar], [66, P.breathCharge, 'io'], [74, P.breathFire, 'snap'], [136, P.breathFire], [166, P.base, 'io']],
    track: 70, roar: true, events: [[0, 'invul', { n: 76 }]], sfx: [[50, 'charge', { len: 0.4, pitch: 0.8 }]], blend: 0.25,
  },
};
for (const k in moves) moves[k].id = k;

export default {
  id: 'gorvath', name: 'GORVATH', jp: 'ゴルヴァス', title: '核熱巨獣', era: '1999年 小笠原沖 初観測',
  desc: '分厚い皮膚とスミレ色の結晶背板を持つ重量級。近距離の破壊力と、背板を発光させて放つ熱線が武器。',
  style: 'パワー型', strengths: '高火力・スーパーアーマー技・投げ', weakness: '鈍足・空中戦に弱い',
  stats: { power: 5, speed: 2, defense: 4, reach: 3 }, specialNames: ['フィッション・レイ', 'フィッション・パルス', 'アースクエイク'], superName: 'メルトダウン・フィッション',
  hp: 1150, defense: 1.08, walk: 0.085, back: 0.06, side: 0.075, dash: 0.36, evade: 0.3, weight: 1.35, push: 2.4, height: 11.5, stride: 1.25,
  hurt: [{ z: 0, y0: 0, y1: 9.5, r: 2.4 }, { z: 1.6, y0: 8.5, y1: 11.2, r: 1.4 }, { z: -4, y0: 0, y1: 4, r: 1.6 }],
  voice: { pitch: 0.75, rough: 1 }, color: '#9a6bff', camH: 1,
  tails: [TAIL],
  poses: P, anims: A, gait: bipedGait, proc: bipedProc,
  moves,
  commands: { L: 'jab', 'f+L': 'overhead', 'd+L': 'stomp', H: 'tailspin', 'f+H': 'ram', 'd+H': 'tailsweep', 'b+H': 'upper', 'dash+H': 'dashslam', 'dash+L': 'ram', G: 'grab', S: 'breath', 'f+S': 'pulse', 'd+S': 'quake', 'b+S': 'pulse', X: 'super' },
  ai: { range: 6, zoning: 0.25, aggression: 0.7 },
  build,
};
