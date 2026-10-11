// TRIVERN — 三首魔竜トライヴァーン. Original three-headed winged dragon: long reach, wide gravity beams.
import * as THREE from 'three';
import { mergeByBone, Rig, skinnedLoft, rigidLoft, spikes, poses, addTo } from '../rig.js';
import { scaleMaps } from '../textures.js';

const NECKS = { C: ['nC1', 'nC2', 'nC3', 'nC4', 'nC5'], L: ['nL1', 'nL2', 'nL3', 'nL4'], R: ['nR1', 'nR2', 'nR3', 'nR4'] };
const TA = ['tA1', 'tA2', 'tA3', 'tA4', 'tA5', 'tA6', 'tA7'], TB = ['tB1', 'tB2', 'tB3', 'tB4', 'tB5', 'tB6', 'tB7'];

function skeleton() {
  const r = new Rig();
  const a = (n, p, x, y, z) => r.add(n, p, x, y, z);
  a('hips', null, 0, 6.0, -0.4);
  a('spine', 'hips', 0, 1.1, 0.7);
  a('chest', 'spine', 0, 0.9, 0.8);
  // necks
  let prev = 'chest';
  [[0, 0.8, 0.7], [0, 0.95, 0.45], [0, 0.95, 0.35], [0, 0.85, 0.35], [0, 0.6, 0.45]].forEach((p, i) => { a(NECKS.C[i], prev, ...p); prev = NECKS.C[i]; });
  a('headC', prev, 0, 0.35, 0.4); a('jawC', 'headC', 0, -0.3, 0.3);
  for (const [s, m] of [['L', 1], ['R', -1]]) {
    prev = 'chest';
    [[1.0 * m, 0.7, 0.5], [0.75 * m, 0.85, 0.4], [0.45 * m, 0.85, 0.35], [0.2 * m, 0.7, 0.45]].forEach((p, i) => { a(NECKS[s][i], prev, ...p); prev = NECKS[s][i]; });
    a('head' + s, prev, 0.05 * m, 0.3, 0.45); a('jaw' + s, 'head' + s, 0, -0.28, 0.28);
    a('wing' + s + '1', 'chest', 1.5 * m, 0.7, -0.6);
    a('wing' + s + '2', 'wing' + s + '1', 3.6 * m, 2.2, -0.6);
    a('wing' + s + '3', 'wing' + s + '2', 4.2 * m, -0.4, -0.6);
    a('thigh' + s, 'hips', 1.4 * m, -0.3, 0.1);
    a('knee' + s, 'thigh' + s, 0.3 * m, -2.5, 0.95);
    a('ankle' + s, 'knee' + s, 0.05 * m, -2.7, -0.85);
  }
  prev = 'hips';
  [[0.4, -0.2, -1.3], [0.3, -0.55, -1.4], [0.25, -0.6, -1.35], [0.2, -0.6, -1.3], [0.15, -0.55, -1.2], [0.1, -0.5, -1.1], [0.05, -0.4, -1.0]].forEach((p, i) => { a(TA[i], prev, ...p); prev = TA[i]; });
  prev = 'hips';
  [[-0.4, -0.2, -1.3], [-0.3, -0.55, -1.4], [-0.25, -0.6, -1.35], [-0.2, -0.6, -1.3], [-0.15, -0.55, -1.2], [-0.1, -0.5, -1.1], [-0.05, -0.4, -1.0]].forEach((p, i) => { a(TB[i], prev, ...p); prev = TB[i]; });
  r.finalize();
  return r;
}

function dragonHead(mat, horn, crown, det, eyeMat, teethMat) {
  const g = new THREE.Group();
  const skull = rigidLoft([
    { p: [0, 0.1, -0.7], w: 0.5, h: 0.5 },
    { p: [0, 0.22, -0.1], w: 0.7, h: 0.6 },
    { p: [0, 0.15, 0.6], w: 0.6, h: 0.45 },
    { p: [0, 0.0, 1.35], w: 0.42, h: 0.3 },
    { p: [0, -0.06, 1.9], w: 0.26, h: 0.18 },
    { p: [0, -0.08, 2.1], w: 0.04, h: 0.04 },
  ], mat, { rings: Math.round(28 * det), radial: Math.round(18 * det), texLen: 1, shape: (u, a) => 1 + (u > 0.3 && u < 0.55 ? 0.15 * Math.max(0, Math.sin(a)) : 0) - 0.15 * Math.max(0, -Math.sin(a)) });
  g.add(skull);
  // horns: swept back, curved
  const hs = [];
  for (const m of [1, -1]) {
    hs.push({ p: [0.35 * m, 0.45, -0.2], d: [0.35 * m, 0.55, -1], r: 0.12, l: 1.8 });
    hs.push({ p: [0.5 * m, 0.2, -0.5], d: [0.6 * m, 0.1, -1], r: 0.08, l: 1.1 });
    hs.push({ p: [0.45 * m, -0.1, 0.4], d: [0.8 * m, -0.2, -0.5], r: 0.06, l: 0.6 });
  }
  if (crown) for (let i = 0; i < 5; i++) hs.push({ p: [0, 0.55, -0.5 + i * 0.2], d: [0, 1, -0.6 - i * 0.1], r: 0.08, l: 1.0 + (2 - Math.abs(i - 2)) * 0.4 });
  g.add(new THREE.Mesh(spikes(hs, 0.1, 1, 6), horn));
  const teeth = [];
  for (let i = 0; i < 6; i++) for (const m of [1, -1]) teeth.push({ p: [(0.38 - i * 0.05) * m, -0.22, 0.6 + i * 0.22], d: [0, -1, 0.15], r: 0.04, l: 0.22 });
  g.add(new THREE.Mesh(spikes(teeth, 0.04, 0.2, 4), teethMat));
  for (const m of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), eyeMat);
    e.scale.set(1, 0.55, 1.4);
    e.position.set(0.47 * m, 0.27, 0.62); e.rotation.y = 0.4 * m;
    g.add(e);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function membrane(rig, s, mat, det) {
  const m = s === 'L' ? 1 : -1;
  const b1 = rig.bones['wing' + s + '1'], b2 = rig.bones['wing' + s + '2'], b3 = rig.bones['wing' + s + '3'];
  rig.root.updateMatrixWorld(true);
  const P1 = b1.getWorldPosition(new THREE.Vector3()), P2 = b2.getWorldPosition(new THREE.Vector3()), P3 = b3.getWorldPosition(new THREE.Vector3());
  const tip = P3.clone().add(new THREE.Vector3(2.4 * m, -1.6, -0.4));
  const lead = [P1, P2, P3, tip];
  const S = Math.round(26 * det), C = 6;
  const pos = [], uv = [], si = [], sw = [], idx = [];
  const segOwner = [0, 1, 2];
  const bonesArr = [b1, b2, b3];
  for (let i = 0; i <= S; i++) {
    const t = (i / S) * 3;
    const k = Math.min(2, Math.floor(t)), f = t - k;
    const L = lead[k].clone().lerp(lead[k + 1], f);
    const span = i / S;
    // trailing edge: hangs down/back toward the body, scalloped between spars
    const scal = 0.72 + 0.28 * Math.abs(Math.cos(t * Math.PI));
    const chord = (6.2 - span * 4.2) * scal;
    const T = L.clone().add(new THREE.Vector3(-0.2 * m * (1 - span), -chord * 0.85, -chord * 0.5));
    if (span < 0.08) T.lerp(new THREE.Vector3(0.9 * m, 5.6, -1.4), 1 - span / 0.08);
    let ow = segOwner[k], w2 = 0, o2 = ow;
    if (f > 0.75 && k < 2) { o2 = segOwner[k + 1]; w2 = (f - 0.75) / 0.25 * 0.5; }
    else if (f < 0.25 && k > 0) { o2 = segOwner[k - 1]; w2 = (0.25 - f) / 0.25 * 0.5; }
    for (let j = 0; j <= C; j++) {
      const c = j / C;
      const p = L.clone().lerp(T, c);
      p.y += Math.sin(c * Math.PI) * 0.15 * (1 - span);
      pos.push(p.x, p.y, p.z);
      uv.push(span * 2, c);
      si.push(ow, o2, 0, 0); sw.push(1 - w2, w2, 0, 0);
    }
  }
  for (let i = 0; i < S; i++) for (let j = 0; j < C; j++) {
    const a = i * (C + 1) + j, b = a + C + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(g, mat);
  rig.root.add(mesh);
  rig.root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bonesArr));
  mesh.frustumCulled = false; mesh.castShadow = true;
  return mesh;
}

function build(q, opts = {}) {
  const rig = skeleton();
  const det = q.detail;
  const sc = scaleMaps('reptile', 5);
  const boss = opts.boss;
  const skin = new THREE.MeshStandardMaterial({ color: boss ? 0x502030 : 0x6b4a26, map: sc.color, normalMap: sc.normal, normalScale: new THREE.Vector2(1.5, 1.5), roughnessMap: sc.rough, roughness: 0.9, metalness: 0.25, vertexColors: true });
  const memMat = new THREE.MeshStandardMaterial({ color: boss ? 0x401018 : 0x5a2e14, roughness: 0.75, side: THREE.DoubleSide, normalMap: scaleMaps('fine', 6).normal, emissive: 0x200800, emissiveIntensity: 0.4 });
  const horn = new THREE.MeshStandardMaterial({ color: 0xe0c070, metalness: 0.8, roughness: 0.3 });
  const teeth = new THREE.MeshStandardMaterial({ color: 0xf0ead0, roughness: 0.4 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x041000, emissive: boss ? 0xff2020 : 0x60ff40, emissiveIntensity: 2.5 });
  const belly = (u, a) => { const s = Math.sin(a); const k = s < -0.3 ? [1.35, 1.15, 0.75] : s > 0.6 ? [0.7, 0.6, 0.55] : [1, 1, 1]; return k; };
  // body
  skinnedLoft(rig, [
    { b: null, p: [0, 0, 0], o: [0, 5.3, -1.6], w: 1.2, h: 1.2 },
    { b: 'hips', w: 2.1, h: 1.9, dy: -0.1 },
    { b: 'spine', w: 2.4, h: 2.1, dy: -0.25 },
    { b: 'chest', w: 2.2, h: 1.9, dy: -0.2 },
    { b: null, p: [0, 0.9, 0.5], w: 1.3, h: 1.1 },
  ], skin, { rings: Math.round(40 * det), radial: Math.round(26 * det), texLen: 3, noise: 0.05, color: belly });
  // necks
  for (const s of ['C', 'L', 'R']) {
    const ch = NECKS[s];
    const spec = [{ b: null, p: [0, 0, 0], o: [s === 'C' ? 0 : (s === 'L' ? 0.8 : -0.8), 8.2, 0.9], w: 1.0, h: 1.0 }];
    ch.forEach((b, i) => spec.push({ b, w: 0.85 - i * 0.07, h: 0.85 - i * 0.07 }));
    spec.push({ b: 'head' + s, w: 0.5, h: 0.5 });
    skinnedLoft(rig, spec, skin, { rings: Math.round(40 * det), radial: Math.round(14 * det), texLen: 1.5, color: belly, shape: (u, a) => 1 + 0.12 * Math.pow(Math.max(0, Math.sin(a)), 8) * Math.abs(Math.sin(u * 40)) });
    const h = dragonHead(skin, horn, s === 'C', det, eyeMat, teeth);
    rig.attach('head' + s, h, 0, 0.05, 0.1);
    const jaw = rigidLoft([
      { p: [0, 0, -0.5], w: 0.4, h: 0.22 }, { p: [0, -0.08, 0.3], w: 0.42, h: 0.2 }, { p: [0, -0.06, 1.1], w: 0.28, h: 0.13 }, { p: [0, 0, 1.6], w: 0.04, h: 0.04 },
    ], skin, { rings: 16, radial: 12, texLen: 1 });
    rig.attach('jaw' + s, jaw);
  }
  // tails
  for (const ch of [TA, TB]) {
    const spec = [{ b: null, p: [0, 0, 0], o: [ch === TA ? 0.5 : -0.5, 5.8, -1.4], w: 1.0, h: 1.0 }];
    ch.forEach((b, i) => spec.push({ b, w: 0.85 - i * 0.1, h: 0.8 - i * 0.095 }));
    spec.push({ b: null, p: [0, -0.3, -1.0], w: 0.05, h: 0.05 });
    skinnedLoft(rig, spec, skin, { rings: Math.round(40 * det), radial: Math.round(14 * det), texLen: 2, color: belly });
    const tip = new THREE.Mesh(spikes([{ p: [0, 0.1, -0.4], d: [0, 0.2, -1], r: 0.35, l: 1.6 }, { p: [0.3, 0, -0.3], d: [0.6, 0.1, -1], r: 0.2, l: 1 }, { p: [-0.3, 0, -0.3], d: [-0.6, 0.1, -1], r: 0.2, l: 1 }], 0.2, 1, 6), horn);
    rig.attach(ch[ch.length - 1], tip, 0, -0.1, -0.2);
  }
  // legs
  for (const [s, m] of [['L', 1], ['R', -1]]) {
    skinnedLoft(rig, [
      { b: null, p: [0, 0, 0], o: [0.8 * m, 6.3, -0.3], w: 1.2, h: 1.2 },
      { b: 'thigh' + s, w: 1.35, h: 1.5 },
      { b: 'knee' + s, w: 0.85, h: 0.9 },
      { b: 'ankle' + s, w: 0.6, h: 0.6 },
      { b: null, p: [0, -0.25, 0.2], w: 0.55, h: 0.45 },
    ], skin, { rings: Math.round(26 * det), radial: Math.round(16 * det), texLen: 2, color: belly });
    const foot = rigidLoft([{ p: [0, 0.05, -0.6], w: 0.55, h: 0.35 }, { p: [0, -0.15, 0.3], w: 0.8, h: 0.35 }, { p: [0, -0.25, 1.2], w: 0.55, h: 0.2 }, { p: [0, -0.28, 1.5], w: 0.05, h: 0.05 }], skin, { rings: 14, radial: 12, texLen: 1 });
    rig.attach('ankle' + s, foot);
    const tc = []; for (let i = 0; i < 3; i++) tc.push({ p: [(-0.4 + i * 0.4), -0.3, 1.1], d: [(i - 1) * 0.3, -0.3, 1], r: 0.1, l: 0.55 });
    rig.attach('ankle' + s, new THREE.Mesh(spikes(tc, 0.1, 0.5, 5), horn));
    // wing spars + membrane
    skinnedLoft(rig, [
      { b: null, p: [0, 0, 0], o: [1.0 * m, 9.4, -0.6], w: 0.5, h: 0.5 },
      { b: 'wing' + s + '1', w: 0.42, h: 0.42 },
      { b: 'wing' + s + '2', w: 0.3, h: 0.3 },
      { b: 'wing' + s + '3', w: 0.2, h: 0.2 },
      { b: null, p: [2.4 * m, -1.6, -0.4], w: 0.05, h: 0.05 },
    ], skin, { rings: Math.round(24 * det), radial: 8, texLen: 1.5 });
    membrane(rig, s, memMat, det);
    rig.attach('wing' + s + '2', new THREE.Mesh(spikes([{ p: [0, 0.2, 0], d: [0.3 * m, 1, 0.2], r: 0.15, l: 1.0 }], 0.1, 1, 5), horn));
  }
  // back spikes
  const bs = [];
  for (let i = 0; i < 5; i++) bs.push({ p: [0, 1.6 - i * 0.1, -1.8 + i * 0.5], d: [0, 1, -0.6], r: 0.18, l: 1.0 - i * 0.1 });
  rig.attach('spine', new THREE.Mesh(spikes(bs, 0.15, 1, 5), horn), 0, -0.5, 0);
  mergeByBone(rig);
  const root = new THREE.Group(), pivot = new THREE.Group();
  root.add(pivot); pivot.add(rig.root);
  rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  let light = null;
  if (q.level >= 2) { light = new THREE.PointLight(boss ? 0xff4040 : 0x90ff60, 0, 30, 1.6); rig.attach('nC3', light, 0, 0, 1); }
  const mouth = (s) => ({ bone: 'head' + s, off: new THREE.Vector3(0, -0.1, 2.0) });
  return {
    root, pivot, rig, mouth: mouth('C'), mouths: [mouth('C'), mouth('L'), mouth('R')],
    update(f) {
      const id = f.state === 'move' ? f.moveId : null;
      const charging = id === 'gravity' || id === 'super' || id === 'orbs';
      const e = charging ? 3 + Math.random() * 3 : 2.5;
      eyeMat.emissiveIntensity = e;
      if (light) light.intensity = charging && f.mf > 6 ? 60 + Math.random() * 60 : 0;
    },
  };
}

const base = {
  _root: [0, 0, 0, 0, 0, 0],
  spine: [0.08, 0, 0], chest: [0.05, 0, 0],
  nC1: [-0.1, 0, 0], nC2: [-0.05, 0, 0], nC3: [0.05, 0, 0], nC4: [0.12, 0, 0], nC5: [0.15, 0, 0], headC: [0.2, 0, 0], jawC: [0.08, 0, 0],
  nL1: [-0.05, 0, 0.1], nL2: [0, 0, 0.05], nL3: [0.1, 0, -0.05], nL4: [0.15, 0, -0.1], headL: [0.25, -0.2, 0], jawL: [0.1, 0, 0],
  nR1: [-0.05, 0, -0.1], nR2: [0, 0, -0.05], nR3: [0.1, 0, 0.05], nR4: [0.15, 0, 0.1], headR: [0.25, 0.2, 0], jawR: [0.1, 0, 0],
  wingL1: [0, 0.3, -0.3], wingL2: [0, 0, -0.5], wingL3: [0, 0.3, 0.6], wingR1: [0, -0.3, 0.3], wingR2: [0, 0, 0.5], wingR3: [0, -0.3, -0.6],
  thighL: [-0.2, 0, 0.05], kneeL: [0.25, 0, 0], ankleL: [-0.05, 0, 0], thighR: [-0.2, 0, -0.05], kneeR: [0.25, 0, 0], ankleR: [-0.05, 0, 0],
};
const necks = (rx, sp = 0, jaw = 0.1) => {
  const o = {};
  for (const s of ['C', 'L', 'R']) { NECKS[s].forEach((b, i) => { o[b] = [rx[i] ?? rx[rx.length - 1], s === 'L' ? sp : s === 'R' ? -sp : 0, s === 'L' ? sp * 0.5 : s === 'R' ? -sp * 0.5 : 0]; }); o['head' + s] = [rx[rx.length - 1] + 0.1, s === 'L' ? -sp : s === 'R' ? sp : 0, 0]; o['jaw' + s] = [jaw, 0, 0]; }
  return o;
};
const wings = (r1, r2, r3) => ({ wingL1: [0, r1[1], r1[0]], wingL2: [0, 0, r2], wingL3: [0, 0, r3], wingR1: [0, -r1[1], -r1[0]], wingR2: [0, 0, -r2], wingR3: [0, 0, -r3] });
const crouchLegs = { _root: [0, -1.2, -0.2, 0.15, 0, 0], thighL: [-0.85, 0, 0.12], kneeL: [1.05, 0, 0], ankleL: [-0.35, 0, 0], thighR: [-0.85, 0, -0.12], kneeR: [1.05, 0, 0], ankleR: [-0.35, 0, 0] };
const P = poses(base, {
  guard: { ...necks([-0.3, -0.2, 0.2, 0.3, 0.3], 0.15, 0.2), ...wings([-0.4, -0.6], -1.2, 1.3), spine: [0.2, 0, 0] },
  crouch: { ...crouchLegs, ...necks([0.3, 0.2, 0.1, 0.0, 0.0], 0.1, 0.3), ...wings([-0.2, -0.4], -0.9, 1.0), spine: [0.4, 0, 0] },
  hitHigh: { _root: [0, 0, -0.4, -0.15, 0, 0], ...necks([-0.4, -0.3, -0.2, -0.2, -0.2], 0.4, 0.6), ...wings([0.6, 0.2], 0.3, -0.3), spine: [-0.25, 0, 0] },
  hitLow: { _root: [0, -0.4, 0, 0.12, 0, 0], ...necks([0.3, 0.2, 0.2, 0.1, 0.1], 0.2, 0.5), spine: [0.4, 0, 0] },
  air: { _root: [0, 1.4, 0, -0.6, 0, 0.2], ...necks([-0.4, -0.3, -0.2, -0.1, -0.1], 0.5, 0.7), ...wings([0.8, 0.4], 0.5, -0.5), thighL: [-0.6, 0, 0.2], kneeL: [0.8, 0, 0] },
  down: { _root: [0, 1.7, -2.4, -1.5, 0, 0.1], ...necks([0.3, 0.2, 0.2, 0.2, 0.1], 0.5, 0.4), ...wings([-0.3, 0.3], 0.6, -0.4), thighL: [-0.9, 0, 0.3], thighR: [-0.5, 0, -0.3], kneeL: [0.9, 0, 0], tA1: [1.2, 0, 0], tB1: [1.2, 0, 0] },
  kneel: { ...crouchLegs, _root: [0, -1.7, 0, 0.35, 0, 0], ...necks([0.3, 0.2, 0.1, 0.1, 0.1], 0.2, 0.2), ...wings([-0.2, -0.2], -0.6, 0.6) },
  roar: { ...necks([-0.25, -0.25, -0.2, -0.25, -0.3], 0.35, 0.9), ...wings([0.4, 0.4], -0.2, 0.3), spine: [-0.15, 0, 0], chest: [-0.15, 0, 0] },
  dash: { _root: [0, -0.2, 0, 0.2, 0, 0], ...necks([0.25, 0.15, 0.1, 0.05, 0.0], 0.1, 0.2), ...wings([-0.4, 0.2], -0.3, 0.4) },
  backdash: { _root: [0, 0.3, 0, -0.15, 0, 0], ...wings([0.8, 0.3], 0.2, -0.2) },
  evade: { _root: [0, -0.4, 0, 0.1, 0, 0.2], ...wings([0.5, 0.2], 0.2, -0.2) },
  grabbed: { _root: [0, 0, 0, -0.35, 0, 0.2], ...necks([-0.4, -0.3, -0.2, -0.1, -0.1], 0.6, 0.7) },
  biteWind: { ...necks([-0.45, -0.35, -0.25, -0.2, -0.1], 0.05, 0.6), spine: [-0.1, 0, 0] },
  biteC: { _root: [0, 0, 0.5, 0.15, 0, 0], ...necks([0.35, 0.3, 0.25, 0.2, 0.0], 0.0, 0.1), nL1: [-0.3, 0, 0.3], nR1: [-0.3, 0, -0.3], spine: [0.25, 0, 0] },
  biteLR: { _root: [0, 0, 0.6, 0.18, 0, 0], ...necks([0.35, 0.3, 0.25, 0.2, 0.0], -0.25, 0.1), nC1: [-0.4, 0, 0], nC2: [-0.3, 0, 0], spine: [0.3, 0, 0] },
  lash: { _root: [0, -0.3, 0.8, 0.25, 0, 0], ...necks([0.55, 0.45, 0.3, 0.2, 0.0], -0.1, 0.8), spine: [0.4, 0, 0], ...wings([-0.5, -0.2], -0.5, 0.5) },
  wingWind: { ...wings([1.0, 0.9], 0.2, -0.4), ...necks([-0.3, -0.2, -0.1, 0, 0], 0.2, 0.3), spine: [-0.15, 0, 0] },
  wingHit: { _root: [0, -0.3, 0.6, 0.2, 0, 0], ...wings([-0.6, -0.9], -1.0, 0.9), ...necks([0.2, 0.15, 0.1, 0.05, 0.0], 0.25, 0.4), spine: [0.35, 0, 0] },
  liftHit: { _root: [0, 0.8, 0.2, -0.25, 0, 0], ...wings([1.2, 0.2], 0.2, -0.6), ...necks([-0.5, -0.4, -0.3, -0.2, -0.2], 0.3, 0.8) },
  kick: { _root: [0, 0.1, 0.2, -0.05, 0, 0], thighR: [-1.2, 0, -0.1], kneeR: [0.2, 0, 0], ankleR: [0.3, 0, 0], thighL: [0.15, 0, 0], ...necks([-0.2, -0.1, 0, 0.1, 0.1], 0.15, 0.2) },
  beamCharge: { ...necks([-0.45, -0.4, -0.3, -0.25, -0.2], 0.3, 0.7), ...wings([0.9, 0.6], -0.2, 0.3), spine: [-0.15, 0, 0], chest: [-0.15, 0, 0] },
  beamFire: { _root: [0, 0, -0.3, 0, 0, 0], ...necks([0.25, 0.2, 0.1, 0.05, -0.15], 0.12, 0.9), ...wings([0.5, 0.3], -0.6, 0.6), spine: [0.25, 0, 0] },
  skyRise: { _root: [0, 5, 0, -0.1, 0, 0], ...wings([1.2, 0.8], -0.3, 0.4), ...necks([-0.3, -0.3, -0.2, -0.2, -0.2], 0.4, 0.9) },
});
const anims = {
  hit: [[0, P.base], [3, P.hitHigh, 'snap'], [16, P.base, 'io']],
  hitLow: [[0, P.base], [3, P.hitLow, 'snap'], [16, P.base, 'io']],
  getup: [[0, P.down], [10, P.kneel, 'io'], [24, P.base, 'io']],
  evade: [[0, P.base], [5, P.evade], [18, P.evade], [24, P.base]],
  win: [[0, P.base], [25, P.roar, 'io'], [130, P.roar], [170, P.beamCharge, 'io'], [400, P.beamCharge]],
  intro: [[0, P.skyRise], [45, P.base, 'io'], [65, P.roar, 'io'], [115, P.roar], [140, P.base, 'io']],
};
function gait(p, ph, amt, ctx) {
  const s = Math.sin(ph), c = Math.cos(ph);
  addTo(p, 'thighL', -0.45 * s * amt, 0, 0); addTo(p, 'thighR', 0.45 * s * amt, 0, 0);
  addTo(p, 'kneeL', 0.5 * Math.max(0, -c) * amt + 0.1, 0, 0); addTo(p, 'kneeR', 0.5 * Math.max(0, c) * amt + 0.1, 0, 0);
  for (const s2 of ['C', 'L', 'R']) addTo(p, NECKS[s2][1], 0, 0.06 * Math.sin(ph + (s2 === 'L' ? 1 : s2 === 'R' ? 2 : 0)), 0);
  const r = p._root || (p._root = [0, 0, 0, 0, 0, 0]);
  r[1] -= Math.abs(c) * 0.25 * amt; r[5] += s * 0.04;
}
function proc(p, ctx) {
  const t = ctx.t;
  const flap = Math.sin(t * 0.06) * 0.12;
  addTo(p, 'wingL1', 0, 0, flap); addTo(p, 'wingR1', 0, 0, -flap);
  addTo(p, 'wingL2', 0, 0, flap * 0.6); addTo(p, 'wingR2', 0, 0, -flap * 0.6);
  // independent head sway
  for (const [s, k] of [['C', 0], ['L', 1.7], ['R', 3.1]]) {
    addTo(p, NECKS[s][2], Math.sin(t * 0.03 + k) * 0.05, Math.sin(t * 0.021 + k) * 0.07, 0);
    addTo(p, 'jaw' + s, Math.max(0, Math.sin(t * 0.04 + k * 2)) * 0.15, 0, 0);
  }
  addTo(p, 'chest', Math.sin(t * 0.045) * 0.02, 0, 0);
}

const moves = {
  jab: {
    name: 'ネックストライク', startup: 9, active: 3, recovery: 13, dmg: 26, height: 'high', hit: { z: 7.2, y: 9, r: 2.2 },
    hitstun: 17, blockstun: 10, push: 0.22, anim: [[0, P.base], [5, P.biteWind], [9, P.biteC, 'snap'], [15, P.biteC], [24, P.base, 'io']],
    cancel: { from: 9, until: 20, to: ['lift', 'kick'], chain: { L: 'jab2' } }, sfx: [[9, 'bite', { vol: 0.5 }]],
  },
  jab2: {
    name: 'ツインファング', startup: 10, active: 3, recovery: 15, dmg: 32, height: 'mid', hit: [{ z: 7.2, y: 8, r: 2.2, x: 1.5 }, { z: 7.2, y: 8, r: 2.2, x: -1.5 }],
    hitstun: 20, blockstun: 12, push: 0.3, lunge: [[0, 10, 0.12]], anim: [[0, P.biteC], [5, P.biteWind], [10, P.biteLR, 'snap'], [17, P.biteLR], [28, P.base, 'io']],
    cancel: { from: 10, until: 22, to: ['gravity', 'orbs', 'gale', 'lift', 'wing'], special: true, chain: { L: 'lash' } }, sfx: [[10, 'bite', { vol: 0.6 }]],
  },
  lash: {
    name: 'トリプルラッシュ', startup: 15, active: 5, recovery: 20, dmg: 46, height: 'mid', hit: [{ z: 9.5, y: 7, r: 2.6 }, { z: 6.5, y: 7, r: 2.4 }],
    hitstun: 22, blockstun: 14, push: 0.7, anim: [[0, P.base], [10, P.biteWind, 'io'], [16, P.lash, 'snap'], [24, P.lash], [40, P.base, 'io']],
    cancel: { from: 17, until: 28, to: ['gravity', 'orbs'], special: true }, sfx: [[14, 'whoosh', { pitch: 0.7 }]],
  },
  kick: {
    name: 'ドラゴンクロー', startup: 11, active: 4, recovery: 15, dmg: 30, height: 'low', hit: { z: 4.8, y: 0.9, r: 2.4 },
    hitstun: 19, blockstun: 12, push: 0.35, otg: true, anim: [[0, P.base], [7, P.crouch, 'io'], [12, P.kick, 'snap'], [19, P.kick], [30, P.base, 'io']],
    cancel: { from: 12, until: 22, to: ['tails'] },
  },
  wing: {
    name: 'ウィングスマッシュ', startup: 16, active: 5, recovery: 20, dmg: 58, height: 'mid', hit: [{ z: 5.5, y: 7, r: 3, x: 3 }, { z: 5.5, y: 7, r: 3, x: -3 }, { z: 6.5, y: 7, r: 2.6 }],
    hitstun: 24, blockstun: 16, push: 1.3, wallsplat: true, anim: [[0, P.base], [11, P.wingWind, 'io'], [17, P.wingHit, 'snap'], [26, P.wingHit], [41, P.base, 'io']],
    sfx: [[15, 'whoosh', { pitch: 0.4, vol: 1 }]], events: [[17, 'gust']],
  },
  triple: {
    name: 'トリプルバイト', startup: 18, active: 6, recovery: 24, dmg: 72, height: 'mid', hit: [{ z: 7.5, y: 7, r: 2.8 }],
    hitstun: 26, blockstun: 16, push: 0.9, knockdown: true, lunge: [[8, 22, 0.35]], anim: [[0, P.base], [12, P.biteWind, 'io'], [19, P.lash, 'snap'], [28, P.lash], [48, P.base, 'io']],
    sfx: [[19, 'bite', { vol: 1 }]], armor: [6, 18],
  },
  tails: {
    name: 'ツインテイル', startup: 15, active: 6, recovery: 22, dmg: 56, height: 'low', hit: [{ z: 6.5, y: 1, r: 3.3 }, { z: 10, y: 1, r: 2.4 }],
    hitstun: 24, blockstun: 16, push: 0.6, knockdown: true, spin: 1,
    anim: [[0, P.base], [8, { ...P.crouch, _root: [0, -1.2, 0, 0.15, -0.4, 0] }, 'io'], [16, { ...P.kneel, _root: [0, -1.6, 0, 0.3, Math.PI * 1.05, 0] }, 'io'], [23, { ...P.kneel, _root: [0, -1.6, 0, 0.3, Math.PI * 1.45, 0] }], [43, { ...P.base, _root: [0, 0, 0, 0, Math.PI * 2, 0] }, 'io']],
    sfx: [[12, 'whoosh', { pitch: 0.45, vol: 0.9 }]],
  },
  lift: {
    name: 'ウィングリフト', startup: 14, active: 5, recovery: 24, dmg: 40, height: 'mid', hit: { z: 5, y: 6, r: 2.8 },
    hitstun: 20, blockstun: 12, push: 0.2, launch: 0.7, anim: [[0, P.base], [8, P.crouch, 'io'], [15, P.liftHit, 'snap'], [24, P.liftHit], [43, P.base, 'io']],
    cancel: { from: 18, until: 32, to: ['gravity', 'orbs'], special: true }, events: [[15, 'gust']],
  },
  grab: {
    name: 'トライアングルバイト', startup: 10, active: 4, recovery: 28, dmg: 0, height: 'throw', hit: { z: 5, y: 7, r: 2.4 },
    anim: [[0, P.base], [9, P.biteC, 'snap'], [16, P.biteC], [40, P.base, 'io']],
    throw: { anim: [[0, P.biteC], [10, P.roar, 'io'], [34, P.roar], [40, P.lash, 'snap'], [62, P.base, 'io']], len: 62, release: 40,
      path: [[0, 4.5, 2], [10, 4.5, 5], [34, 4.2, 7], [40, 5, 0.5]],
      hitMove: { dmg: 118, push: 0.6, knockdown: true }, events: [[3, 'bite'], [14, 'bite'], [24, 'bite'], [40, 'slam']] },
  },
  gravity: {
    name: 'グラビティ・ボルト', special: true, startup: 24, active: 36, recovery: 24, dmg: 15, height: 'mid',
    beam: { from: 24, to: 60, z: 6, y: 10.5, width: 1.4, tick: 6, dmg: 15, push: 0.22, hitstun: 14, blockstun: 9, range: 72, color: 0xc8ff40, core: 0xffffc0, sweep: 0.01, kind: 'gravity', pitch: 1.3, bright: 1.5 },
    anim: [[0, P.base], [16, P.beamCharge, 'io'], [24, P.beamCharge], [27, P.beamFire, 'snap'], [60, P.beamFire], [84, P.base, 'io']],
    track: 20, sfx: [[1, 'charge', { len: 0.4, pitch: 1.2 }]], blend: 0.3,
  },
  orbs: {
    name: 'グラビトンオーブ', special: true, startup: 18, active: 6, recovery: 22, dmg: 0, height: 'mid',
    proj: [{ at: 18, kind: 'bolt', count: 3, spread: 0.7, stagger: 5, speed: 0.6, y: 10, z: 5, r: 1.4, life: 90, dmg: 22, hitstun: 16, push: 0.4, color: 0xc8ff40, homing: 0.035, homingDelay: 8, aim: true, sfx: 'electric' }],
    anim: [[0, P.base], [12, P.beamCharge, 'io'], [20, P.beamFire, 'snap'], [30, P.beamFire], [46, P.base, 'io']], cooldown: 60,
  },
  gale: {
    name: 'ゲイルウィング', special: true, startup: 20, active: 6, recovery: 22, dmg: 0, height: 'mid',
    proj: [{ at: 20, kind: 'orb', speed: 0.55, y: 4, z: 4, r: 3.4, life: 50, dmg: 28, hitstun: 18, push: 1.8, knockdown: true, color: 0xd0e8ff, sfx: 'whoosh' }],
    anim: [[0, P.base], [12, P.wingWind, 'io'], [21, P.wingHit, 'snap'], [30, P.wingHit], [48, P.base, 'io']], cooldown: 40, events: [[21, 'gust']],
  },
  super: {
    name: 'グラビトン・テンペスト', super: true, special: true, startup: 70, active: 60, recovery: 34, dmg: 24, height: 'mid',
    beam: { from: 70, to: 130, z: 6, y: 12, width: 3.2, tick: 4, dmg: 24, push: 0.3, hitstun: 16, blockstun: 10, range: 90, color: 0xd8ff60, core: 0xffffff, sweep: 0.007, kind: 'gravity', super: true, pitch: 1.0, bright: 1.3 },
    anim: [[0, P.base], [25, P.roar, 'io'], [55, P.skyRise, 'io'], [66, P.beamCharge], [72, { ...P.beamFire, _root: [0, 3, -0.3, 0, 0, 0] }, 'snap'], [130, { ...P.beamFire, _root: [0, 3, -0.3, 0, 0, 0] }], [164, P.base, 'io']],
    track: 68, roar: true, events: [[0, 'invul', { n: 74 }], [56, 'gust'], [60, 'storm'], [80, 'storm'], [100, 'storm']], blend: 0.25,
  },
};
for (const k in moves) moves[k].id = k;

export default {
  id: 'trivern', name: 'TRIVERN', jp: 'トライヴァーン', title: '三首魔竜', era: '1991年 宇宙より飛来',
  desc: '三つの首と二本の尾、巨大な翼を持つ竜。長い首によるリーチと、三つの口から放つ引力光線で広範囲を制圧する。',
  style: '広範囲攻撃型', strengths: '最長リーチ・広範囲光線・誘導弾', weakness: '巨体で被弾しやすい・近距離の発生が遅い',
  stats: { power: 4, speed: 2, defense: 4, reach: 5 }, specialNames: ['グラビティ・ボルト', 'グラビトンオーブ', 'ゲイルウィング'], superName: 'グラビトン・テンペスト',
  hp: 1120, defense: 1.05, walk: 0.08, back: 0.065, side: 0.07, dash: 0.34, evade: 0.3, weight: 1.45, push: 2.6, height: 13.5, stride: 1.25,
  hurt: [{ z: 0, y0: 0, y1: 10, r: 2.7 }, { z: 2.2, y0: 9, y1: 13.5, r: 2.4 }, { z: -4, y0: 0, y1: 4, r: 1.8 }],
  voice: { pitch: 0.95, multi: true, rough: 1.2 }, color: '#c8ff40', camH: 1.1,
  tails: [TA, TB], poses: P, anims, gait, proc,
  portraitBone: 'headC', portraitOff: [4.5, 1.2, 9],
  moves,
  commands: { L: 'jab', 'f+L': 'lash', 'd+L': 'kick', H: 'wing', 'f+H': 'triple', 'd+H': 'tails', 'b+H': 'lift', 'dash+H': 'triple', 'dash+L': 'lash', G: 'grab', S: 'gravity', 'f+S': 'orbs', 'd+S': 'gale', 'b+S': 'gale', X: 'super' },
  ai: { range: 8, zoning: 0.45, aggression: 0.55 },
  events: {
    gust(f, m) {
      const p = f.local(5, 2);
      m.fx.dust(p, 2.6, 0x9a9080);
      m.fx.ring(f.local(3, 0.3), { color: 0xffffff, r1: 16, dur: 0.5, opacity: 0.3 });
      m.audio.play('whoosh', { pitch: 0.35, vol: 1 });
      m.stage.impact(f.local(14, 3), 0.6, 10, { silent: true });
    },
    slam(f, m) {
      const v = f.holding?.victim; if (!v) return;
      m.fx.dust(v.pos, 3); m.fx.crack(v.pos, 10); m.camRig.shake(0.6); m.audio.play('explosion', { vol: 0.8, pitch: 0.6 });
    },
    storm(f, m) {
      for (let i = 0; i < 4; i++) {
        const a = f.local(Math.random() * 30 - 5, 0, (Math.random() - 0.5) * 30);
        m.fx.strike(a.clone().setY(70), a.setY(0.3), 0xd8ff60, 0.3, 1.2);
        m.fx.explosion(a.setY(1), 0.8, 0xd8ff60);
        m.stage.impact(a, 0.6, 5, { silent: true });
      }
      m.audio.play('thunder', { vol: 0.8 });
      m.camRig.shake(0.4);
    },
  },
  build,
};
