// VESPERA — 超翅怪獣ヴェスペラ. Original giant dragonfly/wasp kaiju: high-speed aerial fighter.
import * as THREE from 'three';
import { Rig, skinnedLoft, rigidLoft, spikes, blob, poses, addTo } from '../rig.js';
import { chitinMaps, wingTexture, hexEyeTexture } from '../textures.js';

const AB = ['ab1', 'ab2', 'ab3', 'ab4', 'ab5', 'ab6'];

function skeleton() {
  const r = new Rig();
  const a = (n, p, x, y, z) => r.add(n, p, x, y, z);
  a('thorax', null, 0, 7.2, 0);
  a('neck', 'thorax', 0, 0.35, 1.45);
  a('head', 'neck', 0, 0.15, 0.7);
  a('mandL', 'head', 0.38, -0.45, 1.0); a('mandR', 'head', -0.38, -0.45, 1.0);
  let prev = 'thorax';
  [[0, -0.15, -1.35], [0, -0.35, -1.45], [0, -0.45, -1.4], [0, -0.5, -1.3], [0, -0.5, -1.15], [0, -0.45, -0.95]].forEach((p, i) => { a(AB[i], prev, ...p); prev = AB[i]; });
  for (const [s, m] of [['L', 1], ['R', -1]]) {
    a('wingF' + s, 'thorax', 0.45 * m, 0.95, 0.45);
    a('wingB' + s, 'thorax', 0.45 * m, 0.85, -0.45);
    a('arm' + s, 'thorax', 0.75 * m, -0.55, 0.95);
    a('fore' + s, 'arm' + s, 0.35 * m, -1.7, 0.7);
    a('claw' + s, 'fore' + s, 0.05 * m, -0.3, 1.6);
    a('legM' + s, 'thorax', 0.9 * m, -0.65, 0.0);
    a('legM2' + s, 'legM' + s, 1.3 * m, -1.0, 0.1);
    a('legM3' + s, 'legM2' + s, 0.3 * m, -2.4, 0.1);
    a('legB' + s, 'thorax', 0.8 * m, -0.6, -0.65);
    a('legB2' + s, 'legB' + s, 1.2 * m, -1.0, -0.9);
    a('legB3' + s, 'legB2' + s, 0.2 * m, -2.6, -0.5);
  }
  r.finalize();
  return r;
}

function limb(rig, bone, child, r0, r1, mat) {
  const c = rig.bones[child].position;
  const len = c.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, 8);
  g.translate(0, len / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().normalize());
  m.castShadow = true;
  rig.bones[bone].add(m);
  const j = new THREE.Mesh(new THREE.SphereGeometry(r0 * 1.15, 10, 8), mat);
  rig.bones[bone].add(j);
  return m;
}

function build(q, opts = {}) {
  const rig = skeleton();
  const det = q.detail;
  const ch = chitinMaps(9);
  const green = new THREE.MeshPhysicalMaterial({ color: 0x1f7a3c, map: ch.color, normalMap: ch.normal, roughnessMap: ch.rough, roughness: 0.8, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.25, vertexColors: true });
  const crimson = new THREE.MeshPhysicalMaterial({ color: 0x8a1420, normalMap: ch.normal, roughness: 0.4, metalness: 0.3, clearcoat: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14201a, roughness: 0.5, metalness: 0.4 });
  // thorax
  const th = rigidLoft([
    { p: [0, -0.05, -1.5], w: 0.6, h: 0.6 },
    { p: [0, 0.05, -0.8], w: 1.25, h: 1.05 },
    { p: [0, 0.15, 0.2], w: 1.35, h: 1.2 },
    { p: [0, 0.2, 1.1], w: 1.0, h: 0.95 },
    { p: [0, 0.3, 1.65], w: 0.5, h: 0.5 },
  ], green, { rings: Math.round(30 * det), radial: Math.round(20 * det), texLen: 1.5, color: (u, a) => (Math.sin(a) > 0.6 ? [0.35, 0.8, 0.45] : [1, 1, 1]), shape: (u, a) => 1 + 0.05 * Math.sin(a * 6) });
  rig.attach('thorax', th);
  // abdomen (skinned, banded)
  skinnedLoft(rig, [
    { b: null, p: [0, 0, 0], o: [0, 7.1, -0.7], w: 0.7, h: 0.7 },
    { b: 'ab1', w: 0.95, h: 0.9 },
    { b: 'ab2', w: 1.05, h: 0.98 },
    { b: 'ab3', w: 0.95, h: 0.9 },
    { b: 'ab4', w: 0.78, h: 0.74 },
    { b: 'ab5', w: 0.58, h: 0.55 },
    { b: 'ab6', w: 0.36, h: 0.36 },
    { b: null, p: [0, -0.25, -0.6], w: 0.12, h: 0.12 },
  ], green, {
    rings: Math.round(70 * det), radial: Math.round(18 * det), texLen: 1.2,
    shape: (u) => 1 + 0.09 * Math.pow(Math.abs(Math.sin(u * Math.PI * 9)), 3),
    color: (u, a) => { const band = Math.sin(u * Math.PI * 9) > 0.55; return band ? [1.6, 1.25, 0.2] : [0.85, 1, 0.85]; },
  });
  const sting = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 10).rotateX(-Math.PI / 2).translate(0, -0.25, -1.3), crimson);
  rig.attach('ab6', sting);
  // head
  const head = new THREE.Mesh(blob(0.85, 0.75, 0.95, 24, 16, (v) => { if (v.z > 0) v.z *= 0.8; v.y += v.z * 0.1; }), green);
  head.castShadow = true;
  rig.attach('head', head, 0, 0, 0.3);
  const eyeMat = new THREE.MeshStandardMaterial({ map: hexEyeTexture(), emissiveMap: hexEyeTexture(), emissive: opts.boss ? 0xff4040 : 0xffffff, emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.2 });
  for (const m of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), eyeMat);
    e.scale.set(0.8, 1, 1.1);
    rig.attach('head', e, 0.62 * m, 0.22, 0.55);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 2.2, 5).translate(0, 1.1, 0), dark);
    rig.attach('head', ant, 0.25 * m, 0.55, 0.9, 0.9, 0, -0.35 * m);
  }
  // mandibles
  for (const s of ['L', 'R']) {
    const m = s === 'L' ? 1 : -1;
    const g = new THREE.TorusGeometry(0.55, 0.11, 6, 12, Math.PI * 0.9);
    const mesh = new THREE.Mesh(g, crimson);
    mesh.rotation.set(Math.PI / 2, 0, m > 0 ? Math.PI * 0.55 : Math.PI * 0.55 - Math.PI * 0.1);
    mesh.scale.set(m, 1, 1);
    rig.attach('mand' + s, mesh, -0.3 * m, 0, 0.1);
  }
  // wings
  const wtex = wingTexture();
  const wmat = new THREE.MeshStandardMaterial({ map: wtex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.15, metalness: 0.3, emissive: 0x204030, emissiveIntensity: 0.3 });
  const wingShape = (len, wid) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(len * 0.3, wid * 0.7, len * 0.8, wid * 0.6, len, wid * 0.1);
    s.bezierCurveTo(len * 0.95, -wid * 0.35, len * 0.4, -wid * 0.45, 0, -wid * 0.1);
    const g = new THREE.ShapeGeometry(s, 16);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / len, p.getY(i) / wid + 0.5);
    g.rotateX(-Math.PI / 2); // lie flat: x = span, z = chord
    return g;
  };
  const wings = [];
  for (const [b, len, wid] of [['wingF', 7.5, 2.0], ['wingB', 6.6, 2.2]]) for (const s of ['L', 'R']) {
    const m = s === 'L' ? 1 : -1;
    const w = new THREE.Mesh(wingShape(len, wid), wmat);
    w.scale.x = m;
    w.renderOrder = 5;
    rig.attach(b + s, w);
    wings.push(w);
  }
  // legs + scythes
  for (const s of ['L', 'R']) {
    limb(rig, 'arm' + s, 'fore' + s, 0.32, 0.26, green);
    limb(rig, 'fore' + s, 'claw' + s, 0.26, 0.2, crimson);
    const m = s === 'L' ? 1 : -1;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.6, 4).translate(0, 1.3, 0), crimson);
    blade.scale.set(0.35, 1, 1);
    blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.05 * m, -0.5, 1).normalize());
    rig.bones['claw' + s].add(blade);
    const ser = [];
    for (let i = 0; i < 5; i++) ser.push({ p: [0, -0.12 - i * 0.12, 0.3 + i * 0.4], d: [0, -1, 0.3], r: 0.06, l: 0.3 });
    rig.attach('claw' + s, new THREE.Mesh(spikes(ser, 0.06, 0.3, 4), dark));
    limb(rig, 'legM' + s, 'legM2' + s, 0.22, 0.18, green);
    limb(rig, 'legM2' + s, 'legM3' + s, 0.18, 0.08, dark);
    limb(rig, 'legB' + s, 'legB2' + s, 0.22, 0.18, green);
    limb(rig, 'legB2' + s, 'legB3' + s, 0.18, 0.08, dark);
  }
  const root = new THREE.Group(), pivot = new THREE.Group();
  root.add(pivot); pivot.add(rig.root);
  rig.root.traverse((o) => { if (o.isMesh && o.material !== wmat) o.castShadow = true; });
  // electric aura
  const aura = new THREE.PointLight(0x80ffe0, 0, 22, 1.6);
  if (q.level >= 2) rig.attach('thorax', aura, 0, 0, 0);
  if (opts.boss) { green.color.set(0x5a1020); }
  return {
    root, pivot, rig, wings, mouth: { bone: 'ab6', off: new THREE.Vector3(0, -0.3, -1.9) },
    update(f) {
      const id = f.state === 'move' ? f.moveId : null;
      const zap = id === 'shock' || id === 'super' || id === 'thunderDive' || id === 'needles';
      aura.intensity = zap ? 40 + Math.random() * 60 : 0;
      eyeMat.emissiveIntensity = zap ? 3 : 1.6;
    },
  };
}

const base = {
  _root: [0, 0, 0, -0.08, 0, 0],
  neck: [-0.1, 0, 0], head: [0.15, 0, 0], mandL: [0, 0.2, 0], mandR: [0, -0.2, 0],
  ab1: [-0.12, 0, 0], ab2: [-0.1, 0, 0], ab3: [-0.12, 0, 0], ab4: [-0.15, 0, 0], ab5: [-0.15, 0, 0], ab6: [-0.1, 0, 0],
  armL: [-0.25, 0, 0.15], foreL: [-0.6, 0, 0], clawL: [0.9, 0, 0], armR: [-0.25, 0, -0.15], foreR: [-0.6, 0, 0], clawR: [0.9, 0, 0],
  legML: [0, 0, 0.15], legMR: [0, 0, -0.15], legBL: [0.1, 0, 0.1], legBR: [0.1, 0, -0.1],
  wingFL: [0, 0.1, 0.25], wingFR: [0, -0.1, -0.25], wingBL: [0, -0.15, 0.15], wingBR: [0, 0.15, -0.15],
};
const P = poses(base, {
  guard: { _root: [0, 0, -0.5, -0.25, 0, 0], armL: [-1.2, 0, 0.0], foreL: [-1.3, 0, 0], clawL: [1.4, 0, 0], armR: [-1.2, 0, 0.0], foreR: [-1.3, 0, 0], clawR: [1.4, 0, 0], ab2: [-0.4, 0, 0], ab3: [-0.4, 0, 0] },
  crouch: { _root: [0, -3.2, 0, 0.1, 0, 0], armL: [-0.8, 0, 0.2], foreL: [-1.4, 0, 0], armR: [-0.8, 0, -0.2], foreR: [-1.4, 0, 0], legML: [0, 0, 0.7], legMR: [0, 0, -0.7], legBL: [0, 0, 0.7], legBR: [0, 0, -0.7] },
  hitHigh: { _root: [0, 0.3, -0.6, -0.5, 0, 0.2], neck: [-0.5, 0, 0], head: [-0.3, 0, 0], armL: [0.2, 0, 0.6], armR: [0.2, 0, -0.6], mandL: [0, 0.6, 0], mandR: [0, -0.6, 0], ab2: [0.3, 0, 0] },
  hitLow: { _root: [0, -0.6, -0.3, 0.35, 0, -0.15], ab2: [0.3, 0, 0], legML: [0.4, 0, 0.4], legMR: [0.4, 0, -0.4] },
  air: { _root: [0, 0.5, 0, -0.9, 0, 0.6], neck: [-0.5, 0, 0], armL: [0.4, 0, 0.9], armR: [0.4, 0, -0.9], ab2: [0.4, 0, 0], ab3: [0.3, 0, 0] },
  down: { _root: [0, -5.6, -1, -0.2, 0, 1.35], neck: [0.2, 0, 0], armL: [0.3, 0, 0.8], armR: [0.3, 0, -0.8], legML: [0.5, 0, 0.6], legBL: [0.5, 0, 0.6], ab2: [-0.2, 0, 0], wingFL: [0, 0, -0.6], wingBL: [0, 0, -0.6] },
  kneel: { _root: [0, -3.8, 0, 0.25, 0, 0], armL: [-0.6, 0, 0.3], armR: [-0.6, 0, -0.3] },
  roar: { _root: [0, 1.2, 0, -0.45, 0, 0], neck: [-0.4, 0, 0], head: [-0.2, 0, 0], mandL: [0, 0.7, 0], mandR: [0, -0.7, 0], armL: [-1.6, 0, 0.8], foreL: [-0.4, 0, 0], armR: [-1.6, 0, -0.8], foreR: [-0.4, 0, 0], ab2: [0.3, 0, 0], ab3: [0.3, 0, 0] },
  dash: { _root: [0, -0.6, 0, 0.35, 0, 0], armL: [-0.1, 0, 0.1], armR: [-0.1, 0, -0.1], ab2: [0.15, 0, 0], ab3: [0.1, 0, 0] },
  backdash: { _root: [0, 0.8, 0, -0.35, 0, 0], armL: [-1.0, 0, 0.3], armR: [-1.0, 0, -0.3] },
  evade: { _root: [0, 0.5, 0, 0, 0, 0.7], armL: [-0.8, 0, 0.3], armR: [-0.8, 0, -0.3] },
  grabbed: { _root: [0, 0, 0, -0.6, 0, 0.4], armL: [0.3, 0, 1], armR: [0.3, 0, -1], ab2: [0.5, 0, 0] },
  slashWindR: { _root: [0, 0.2, 0, -0.15, 0.35, 0], armR: [-1.3, 0, -0.9], foreR: [-1.6, 0, 0], clawR: [1.5, 0, 0], armL: [-0.6, 0, 0.3] },
  slashHitR: { _root: [0, -0.2, 0.6, 0.25, -0.45, 0], armR: [-1.0, 0, 0.5], foreR: [-0.1, 0, 0], clawR: [0.3, 0, 0], armL: [-0.4, 0, 0.3] },
  slashWindL: { _root: [0, 0.2, 0, -0.15, -0.35, 0], armL: [-1.3, 0, 0.9], foreL: [-1.6, 0, 0], clawL: [1.5, 0, 0], armR: [-0.6, 0, -0.3] },
  slashHitL: { _root: [0, -0.2, 0.6, 0.25, 0.45, 0], armL: [-1.0, 0, -0.5], foreL: [-0.1, 0, 0], clawL: [0.3, 0, 0], armR: [-0.4, 0, -0.3] },
  stab: { _root: [0, -0.4, 1.2, 0.3, 0, 0], armL: [-1.5, 0, 0], foreL: [0.3, 0, 0], clawL: [0.1, 0, 0], armR: [-1.5, 0, 0], foreR: [0.3, 0, 0], clawR: [0.1, 0, 0] },
  stingWind: { _root: [0, 1.2, -0.8, -0.5, 0, 0], ab1: [-0.5, 0, 0], ab2: [-0.6, 0, 0], ab3: [-0.6, 0, 0], ab4: [-0.5, 0, 0], ab5: [-0.4, 0, 0], armL: [-0.9, 0, 0.6], armR: [-0.9, 0, -0.6] },
  stingHit: { _root: [0, 0.4, 0.8, -0.95, 0, 0], ab1: [-0.7, 0, 0], ab2: [-0.8, 0, 0], ab3: [-0.6, 0, 0], ab4: [-0.4, 0, 0], ab5: [-0.2, 0, 0], ab6: [0.2, 0, 0], armL: [-0.4, 0, 0.9], armR: [-0.4, 0, -0.9] },
  rakeLow: { _root: [0, -3.4, 0.6, 0.35, 0, 0], armL: [-0.6, 0, 0.1], foreL: [0.2, 0, 0], armR: [-1.6, 0, -0.1], foreR: [0.2, 0, 0], clawR: [0.2, 0, 0] },
  rising: { _root: [0, 2.5, 0.3, -0.6, 0, 0], armL: [-2.6, 0, 0.3], foreL: [-0.2, 0, 0], armR: [-2.6, 0, -0.3], foreR: [-0.2, 0, 0], ab2: [0.3, 0, 0] },
  dive: { _root: [0, 0, 0.5, 0.9, 0, 0], armL: [-1.7, 0, 0.1], foreL: [0.1, 0, 0], armR: [-1.7, 0, -0.1], foreR: [0.1, 0, 0], ab2: [0.3, 0, 0], ab3: [0.25, 0, 0] },
  sweepLow: { _root: [0, -3.6, 0, 0.1, 0, 0.1], ab1: [-0.3, 0.8, 0], ab2: [-0.2, 0.7, 0], ab3: [0, 0.6, 0], ab4: [0, 0.5, 0] },
  shock: { _root: [0, 0.8, 0, -0.3, 0, 0], armL: [-0.6, 0, 1.4], armR: [-0.6, 0, -1.4], foreL: [-0.3, 0, 0], foreR: [-0.3, 0, 0], ab2: [0.3, 0, 0], mandL: [0, 0.6, 0], mandR: [0, -0.6, 0] },
  aimSting: { _root: [0, 0.5, -0.4, -0.7, 0, 0], ab1: [-0.8, 0, 0], ab2: [-0.9, 0, 0], ab3: [-0.6, 0, 0], ab4: [-0.2, 0, 0], ab5: [0.2, 0, 0], ab6: [0.5, 0, 0], armL: [-1, 0, 0.7], armR: [-1, 0, -0.7] },
  drainHold: { armL: [-1.4, 0, -0.2], foreL: [-0.6, 0, 0], armR: [-1.4, 0, 0.2], foreR: [-0.6, 0, 0], mandL: [0, 0.6, 0], mandR: [0, -0.6, 0], neck: [0.3, 0, 0], ab2: [-0.5, 0, 0], ab3: [-0.5, 0, 0] },
  skyHigh: { _root: [0, 14, -4, -0.3, 0, 0], armL: [-1.2, 0, 1.2], armR: [-1.2, 0, -1.2], mandL: [0, 0.7, 0], mandR: [0, -0.7, 0] },
});
const anims = {
  hit: [[0, P.base], [3, P.hitHigh, 'snap'], [16, P.base, 'io']],
  hitLow: [[0, P.base], [3, P.hitLow, 'snap'], [16, P.base, 'io']],
  getup: [[0, P.down], [12, P.kneel, 'io'], [24, P.base, 'io']],
  evade: [[0, P.base], [5, P.evade], [18, P.evade], [24, P.base]],
  win: [[0, P.base], [25, P.roar, 'io'], [130, P.roar], [170, P.base, 'io'], [400, P.base]],
  intro: [[0, P.skyHigh], [45, P.base, 'io'], [70, P.roar, 'io'], [115, P.roar], [140, P.base, 'io']],
};

function gait(p, ph, amt, ctx) {
  const f = ctx.fighter;
  const r = p._root || (p._root = [0, 0, 0, 0, 0, 0]);
  r[3] += Math.sign(f.fwd || 0) * 0.18 * amt;
  r[5] += -(ctx.side || 0) * 0.3 * (Math.abs(f.fwd) < 0.3 ? 1 : 0);
  r[1] += Math.sin(ph * 2) * 0.25;
}
function proc(p, ctx) {
  const t = ctx.t, fl = ctx.st === 'down' || ctx.st === 'ko' ? 0.15 : 1;
  const flap = Math.sin(t * 1.25) * 0.55 * fl, flap2 = Math.sin(t * 1.25 + 1.3) * 0.5 * fl;
  addTo(p, 'wingFL', 0, 0, flap); addTo(p, 'wingFR', 0, 0, -flap);
  addTo(p, 'wingBL', 0, 0, flap2); addTo(p, 'wingBR', 0, 0, -flap2);
  const r = p._root || (p._root = [0, 0, 0, 0, 0, 0]);
  r[1] += Math.sin(t * 0.07) * 0.3 * fl;
  addTo(p, 'mandL', 0, Math.max(0, Math.sin(t * 0.09)) * 0.15, 0); addTo(p, 'mandR', 0, -Math.max(0, Math.sin(t * 0.09)) * 0.15, 0);
  addTo(p, 'legML', Math.sin(t * 0.05) * 0.08, 0, 0); addTo(p, 'legBL', Math.sin(t * 0.05 + 1) * 0.08, 0, 0);
  addTo(p, 'legMR', Math.sin(t * 0.05 + 2) * 0.08, 0, 0); addTo(p, 'legBR', Math.sin(t * 0.05 + 3) * 0.08, 0, 0);
}

const moves = {
  jab: {
    name: 'シザースラッシュ', startup: 6, active: 3, recovery: 10, dmg: 22, height: 'high', hit: { z: 5.2, y: 6.5, r: 2.2 },
    hitstun: 16, blockstun: 9, push: 0.18, anim: [[0, P.base], [3, P.slashWindR], [7, P.slashHitR, 'snap'], [12, P.slashHitR], [19, P.base, 'io']],
    cancel: { from: 7, until: 16, to: ['stab', 'launch', 'rake'], chain: { L: 'jab2' } }, sparkColor: 0x80ffb0,
  },
  jab2: {
    name: 'クロスシザース', startup: 7, active: 3, recovery: 12, dmg: 24, height: 'mid', hit: { z: 5.2, y: 6, r: 2.3 },
    hitstun: 18, blockstun: 10, push: 0.25, lunge: [[0, 7, 0.16]], anim: [[0, P.slashHitR], [4, P.slashWindL], [8, P.slashHitL, 'snap'], [14, P.slashHitL], [22, P.base, 'io']],
    cancel: { from: 8, until: 19, to: ['sting', 'launch', 'needles', 'shock', 'thunderDive'], special: true, chain: { L: 'stab' } }, sparkColor: 0x80ffb0,
  },
  stab: {
    name: 'ダートスティング', startup: 10, active: 5, recovery: 16, dmg: 36, height: 'mid', hit: { z: 5.5, y: 6, r: 2.4 },
    hitstun: 20, blockstun: 12, push: 0.6, lunge: [[3, 14, 0.62]], anim: [[0, P.base], [6, P.slashWindR, 'io'], [11, P.stab, 'snap'], [18, P.stab], [31, P.base, 'io']],
    cancel: { from: 12, until: 24, to: ['needles', 'shock', 'thunderDive'], special: true },
  },
  rake: {
    name: 'ローレイク', startup: 9, active: 4, recovery: 14, dmg: 24, height: 'low', hit: { z: 4.8, y: 0.8, r: 2.3 },
    hitstun: 18, blockstun: 11, push: 0.3, otg: true, anim: [[0, P.base], [6, P.crouch, 'io'], [10, P.rakeLow, 'snap'], [16, P.rakeLow], [27, P.base, 'io']],
    cancel: { from: 10, until: 20, to: ['tailsweep'] },
  },
  sting: {
    name: 'ポイズンスティング', startup: 14, active: 5, recovery: 18, dmg: 54, height: 'mid', hit: { z: 5.2, y: 4.5, r: 2.6 },
    hitstun: 30, blockstun: 14, push: 0.7, wallsplat: true, anim: [[0, P.base], [10, P.stingWind, 'io'], [15, P.stingHit, 'snap'], [22, P.stingHit], [37, P.base, 'io']],
    cancel: { from: 16, until: 26, to: ['needles', 'thunderDive'], special: true },
  },
  tailsweep: {
    name: 'テイルウィップ', startup: 13, active: 5, recovery: 20, dmg: 46, height: 'low', hit: [{ z: 5, y: 1, r: 3 }, { z: 2, y: 1, r: 3.2, x: 3 }],
    hitstun: 22, blockstun: 14, push: 0.5, knockdown: true, anim: [[0, P.base], [8, P.crouch, 'io'], [14, P.sweepLow, 'snap'], [20, P.sweepLow], [38, P.base, 'io']],
  },
  launch: {
    name: 'ライジングシザース', startup: 12, active: 5, recovery: 24, dmg: 40, height: 'mid', hit: { z: 4.5, y: 7.5, r: 2.6 },
    hitstun: 20, blockstun: 12, push: 0.2, launch: 0.66, anim: [[0, P.base], [7, P.crouch, 'io'], [13, P.rising, 'snap'], [22, P.rising], [41, P.base, 'io']],
    cancel: { from: 17, until: 32, to: ['needles', 'thunderDive', 'swoop'], special: true },
  },
  swoop: {
    name: 'スカイダイブ', startup: 22, active: 6, recovery: 18, dmg: 60, height: 'mid', hit: { z: 4.5, y: 3, r: 3 },
    hitstun: 24, blockstun: 16, push: 0.8, knockdown: true, air: true, lunge: [[4, 28, 0.5]], rise: [[0, 12, 0.55], [18, 26, -0.825]], track: 14,
    anim: [[0, P.base], [12, P.rising, 'io'], [18, P.dive, 'io'], [28, P.dive], [46, P.base, 'io']],
    events: [[26, 'groundSlam', { z: 4, power: 0.7 }]], sfx: [[2, 'whoosh', { pitch: 0.6 }], [18, 'whoosh', { pitch: 1.2 }]],
  },
  grab: {
    name: 'エナジードレイン', startup: 8, active: 4, recovery: 26, dmg: 0, height: 'throw', hit: { z: 4.2, y: 6, r: 2.3 },
    anim: [[0, P.base], [7, P.stab, 'snap'], [14, P.stab], [36, P.base, 'io']],
    throw: { anim: [[0, P.drainHold], [40, P.drainHold], [46, P.slashHitR, 'snap'], [64, P.base, 'io']], len: 64, release: 44,
      path: [[0, 3.4, 0.5], [10, 3.2, 2], [40, 3.2, 2.5], [44, 3.5, 1]],
      hitMove: { dmg: 80, launch: 0.3, push: 1.0, knockdown: true }, events: [[6, 'drain'], [14, 'drain'], [22, 'drain'], [30, 'drain'], [38, 'drain']] },
  },
  needles: {
    name: 'ニードルボルト', special: true, startup: 13, active: 8, recovery: 20, dmg: 0, height: 'mid',
    proj: [{ at: 13, kind: 'bolt', count: 3, spread: 0.32, stagger: 4, speed: 1.15, y: 5, z: 2, r: 1.0, life: 60, dmg: 16, hitstun: 14, push: 0.25, color: 0x80ffe0, aim: true, sfx: 'electric' }],
    anim: [[0, P.base], [9, P.aimSting, 'io'], [26, P.aimSting], [41, P.base, 'io']], cooldown: 30,
  },
  thunderDive: {
    name: 'サンダーダイブ', special: true, startup: 22, active: 8, recovery: 22, dmg: 78, height: 'mid', hit: [{ z: 3.5, y: 3, r: 3.4 }],
    hitstun: 26, blockstun: 18, push: 1.2, knockdown: true, wallsplat: true, air: true, rise: [[0, 14, 0.6], [20, 30, -0.84]], lunge: [[14, 30, 0.7]], track: 16, chip: 0.2,
    anim: [[0, P.base], [14, P.rising, 'io'], [20, P.dive, 'io'], [30, P.dive], [52, P.base, 'io']],
    events: [[0, 'invul', { n: 12 }], [16, 'zapCharge'], [29, 'groundSlam', { z: 3, power: 1 }]], sfx: [[14, 'electric', { vol: 1 }]],
  },
  shock: {
    name: 'ショックフィールド', special: true, startup: 9, active: 10, recovery: 26, dmg: 50, height: 'mid', hit: { z: 0, y: 6, r: 7 },
    hitstun: 24, blockstun: 16, push: 1.1, launch: 0.42, meterCost: 25, chip: 0.2,
    anim: [[0, P.base], [8, P.shock, 'snap'], [24, P.shock], [45, P.base, 'io']],
    events: [[0, 'invul', { n: 16 }], [9, 'pulse', { color: 0x80ffe0, r: 8 }], [9, 'zapCharge']], sfx: [[9, 'electric', { vol: 1, pitch: 0.7 }]],
  },
  super: {
    name: 'ヘルズ・サンダースウォーム', super: true, special: true, startup: 56, active: 70, recovery: 34, dmg: 0, height: 'mid',
    anim: [[0, P.base], [30, P.roar, 'io'], [56, P.skyHigh, 'io'], [126, P.skyHigh], [160, P.base, 'io']],
    events: [[0, 'invul', { n: 140 }], [56, 'zapCharge'], ...[60, 68, 76, 84, 92, 100, 108].map((f) => [f, 'strike', { dmg: 32 }]), [122, 'strike', { dmg: 90, big: true }]],
    roar: true,
  },
};
for (const k in moves) moves[k].id = k;

export default {
  id: 'vespera', name: 'VESPERA', jp: 'ヴェスペラ', title: '超翅怪獣', era: '2001年 渋谷水没地区 出現',
  desc: '4枚の巨大な翅で高速飛行する昆虫型怪獣。鎌状の前脚と毒針、放電能力で敵を翻弄し、相手のエネルギーを吸収して回復する。',
  style: '高速空中機動型', strengths: '最速の技・空中からの急降下・体力吸収', weakness: '体力が低い・1発が軽い',
  stats: { power: 2, speed: 5, defense: 2, reach: 3 }, specialNames: ['ニードルボルト', 'サンダーダイブ', 'ショックフィールド'], superName: 'ヘルズ・サンダースウォーム',
  hp: 880, defense: 0.95, walk: 0.13, back: 0.11, side: 0.13, dash: 0.6, evade: 0.45, weight: 0.85, push: 2.1, height: 10, stride: 1.6, flyer: true,
  hurt: [{ z: 0, y0: 2.2, y1: 9.5, r: 2.2 }, { z: 2.2, y0: 6.5, y1: 9.5, r: 1.3 }, { z: -3.5, y0: 3, y1: 7, r: 1.4 }],
  voice: { pitch: 1.9, insect: true, rough: 0.5 }, color: '#80ffb0', camH: 1,
  tails: [AB], poses: P, anims, gait, proc,
  portraitOff: [3.5, 0.8, 7.5],
  moves,
  commands: { L: 'jab', 'f+L': 'stab', 'd+L': 'rake', H: 'sting', 'f+H': 'swoop', 'd+H': 'tailsweep', 'b+H': 'launch', 'dash+H': 'swoop', 'dash+L': 'stab', G: 'grab', S: 'needles', 'f+S': 'thunderDive', 'd+S': 'shock', 'b+S': 'shock', X: 'super' },
  ai: { range: 6, zoning: 0.25, aggression: 0.75 },
  events: {
    drain(f, m) {
      const v = f.holding?.victim; if (!v) return;
      const dmg = 8; v.hp = Math.max(1, v.hp - dmg); f.hp = Math.min(f.hpMax, f.hp + 10);
      const p = v.local(0, 6);
      for (let i = 0; i < 12; i++) m.fx.add.emit({ x: p.x, y: p.y, z: p.z, vx: (f.pos.x - v.pos.x) * 2 + (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, vz: (f.pos.z - v.pos.z) * 2 + (Math.random() - 0.5) * 4, r: 0.4, g: 1, b: 0.6, size: 1.2, life: 0.6, drag: 0.97 });
      m.audio.play('buzz', { len: 0.25, pitch: 1.5, vol: 0.7 });
      m.popup(f.side, '+HP', 'throw');
    },
    zapCharge(f, m) {
      const p = f.local(0, 7);
      m.fx.burst(p, { n: 40, color: 0x80ffe0, speed: 22, size: 0.9, life: 0.35 });
      for (let i = 0; i < 3; i++) m.fx.strike(p, p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 14)), 0x80ffe0, 0.2, 0.4);
      m.audio.play('electric', { vol: 0.8 });
    },
    strike(f, m, d) {
      const o = f.opp;
      const tgt = new THREE.Vector3(o.pos.x + (Math.random() - 0.5) * 3, 0.2, o.pos.z + (Math.random() - 0.5) * 3);
      const sky = tgt.clone().add(new THREE.Vector3((Math.random() - 0.5) * 20, 70, (Math.random() - 0.5) * 20));
      m.fx.strike(sky, tgt, d.big ? 0xffffff : 0x9fffe8, d.big ? 0.6 : 0.3, d.big ? 3 : 1.4);
      m.fx.explosion(tgt.clone().setY(1), d.big ? 2.2 : 0.9, 0x80ffe0);
      m.fx.crack(tgt, d.big ? 12 : 5);
      m.fx.flash(tgt.clone().setY(8), 0xa0fff0, d.big ? 120 : 50, 0.25);
      m.camRig.shake(d.big ? 0.9 : 0.35);
      m.audio.play(d.big ? 'explosion' : 'electric', { vol: 1, pitch: d.big ? 0.6 : 0.8 });
      if (d.big) m.audio.play('thunder', { vol: 1 });
      m.stage.impact(tgt, d.big ? 2 : 0.8, d.big ? 10 : 5, { silent: true });
      if (Math.hypot(o.pos.x - tgt.x, o.pos.z - tgt.z) < (d.big ? 7 : 4.5)) {
        const res = o.takeHit(f, { id: 'strike', super: true, special: true, dmg: d.dmg, height: 'mid', hitstun: 20, blockstun: 10, push: 0.15, launch: d.big ? 0.6 : 0, chip: 0.25 }, { srcPos: tgt.clone().add(new THREE.Vector3((f.pos.x - o.pos.x) * 0.1, 0, (f.pos.z - o.pos.z) * 0.1)), proj: true });
        if (res !== 'whiff') { f.connected = true; m.onHitFx(f, o, { dmg: d.dmg, sparkColor: 0x80ffe0, super: true }, o.local(0, 5), res); }
      }
    },
  },
  build,
};
