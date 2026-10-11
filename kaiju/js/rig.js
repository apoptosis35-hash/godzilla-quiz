// Skeleton + procedural mesh construction + pose animation.
// Characters are built from bone hierarchies; organic bodies are lofted tubes that are
// smoothly skinned (SkinnedMesh) to bone chains, so necks, tails and torsos bend naturally.
import * as THREE from 'three';
import { noise3 } from './textures.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Rig {
  constructor() {
    this.root = new THREE.Group();
    this.bones = {};
    this.rest = {};
  }
  add(name, parent, x, y, z) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    (parent ? this.bones[parent] : this.root).add(b);
    this.bones[name] = b;
    return b;
  }
  finalize() {
    for (const n in this.bones) {
      const b = this.bones[n];
      this.rest[n] = { r: b.rotation.clone(), p: b.position.clone() };
    }
    this.root.updateMatrixWorld(true);
  }
  worldPos(name, out = new THREE.Vector3()) {
    return this.bones[name].getWorldPosition(out);
  }
  // pose: {bone:[rx,ry,rz]} additive to rest. Special key "_root" handled by caller.
  apply(pose) {
    for (const n in this.rest) {
      const b = this.bones[n], r = this.rest[n].r, p = pose[n];
      if (p) b.rotation.set(r.x + p[0], r.y + p[1], r.z + p[2]);
      else b.rotation.copy(r);
    }
  }
  // Attach a mesh to a bone, given a transform expressed in rig-root (rest) space.
  attachWorld(boneName, mesh, worldPos, worldQuat) {
    const b = this.bones[boneName];
    b.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(b.matrixWorld).invert();
    const m = new THREE.Matrix4().compose(worldPos, worldQuat || new THREE.Quaternion(), mesh.scale.clone());
    m.premultiply(inv);
    m.decompose(mesh.position, mesh.quaternion, mesh.scale);
    b.add(mesh);
    return mesh;
  }
  attach(boneName, mesh, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    this.bones[boneName].add(mesh);
    return mesh;
  }
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Generic loft: a tube along `entries` (each {pos:Vector3, bone?:Bone, ext?:bool, w,h,dy,dx})
// opts: rings, radial, side (Vector3), shape(u,a)->mult, noise, noiseFreq, texLen, vRepeat,
//       color(u,a,pos)->[r,g,b], skin (bool)
export function loft(entries, opts = {}) {
  const rings = opts.rings || 60, radial = opts.radial || 20;
  const sideRef = opts.side || new THREE.Vector3(1, 0, 0);
  const pts = entries.map((e) => e.pos);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  // cumulative lengths of the control polyline (to locate entries along u)
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const L = cum[cum.length - 1];
  const eu = cum.map((c) => c / L);
  const keys = ['w', 'h', 'dy', 'dx'];
  const prof = (u) => {
    let k = 0;
    while (k < entries.length - 2 && u > eu[k + 1]) k++;
    const t = (u - eu[k]) / Math.max(1e-6, eu[k + 1] - eu[k]);
    const g = (i) => entries[Math.max(0, Math.min(entries.length - 1, i))];
    const o = {};
    for (const key of keys) {
      o[key] = catmull(g(k - 1)[key] || 0, g(k)[key] || 0, g(k + 1)[key] || 0, g(k + 2)[key] || 0, t);
    }
    o.w = Math.max(0.0, o.w); o.h = Math.max(0.0, o.h);
    return o;
  };
  // segment owners for skinning
  let owners = null, bones = null;
  if (opts.skin) {
    bones = [];
    const idx = (b) => { let i = bones.indexOf(b); if (i < 0) { bones.push(b); i = bones.length - 1; } return i; };
    owners = [];
    for (let i = 0; i < entries.length - 1; i++) {
      const a = entries[i], b = entries[i + 1];
      let o;
      if (a.ext && b.ext) o = owners.length ? bones[owners[owners.length - 1]] : null;
      else if (a.ext) o = b.bone; else if (b.ext) o = a.bone;
      else if (b.bone.parent === a.bone) o = a.bone;
      else if (a.bone.parent === b.bone) o = b.bone;
      else o = a.bone;
      owners.push(idx(o));
    }
  }
  const frames = frameSampler(curve, sideRef);
  const pos = [], uv = [], skinI = [], skinW = [], col = [];
  const blend = opts.blend ?? 0.45;
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const { P, T, S, N } = frames(u);
    const pr = prof(u);
    // skin weights for this ring
    let si = [0, 0, 0, 0], sw = [1, 0, 0, 0];
    if (opts.skin) {
      let seg = 0;
      while (seg < owners.length - 1 && u > eu[seg + 1]) seg++;
      const own = owners[seg];
      si = [own, 0, 0, 0]; sw = [1, 0, 0, 0];
      // joint at start of seg
      const segLen = eu[seg + 1] - eu[seg];
      const bwStart = seg > 0 ? Math.min(segLen, eu[seg] - eu[seg - 1]) * blend : 0;
      const bwEnd = seg < owners.length - 1 ? Math.min(segLen, eu[seg + 2] - eu[seg + 1]) * blend : 0;
      const sm = (x) => x * x * (3 - 2 * x);
      if (seg > 0 && owners[seg - 1] !== own && u - eu[seg] < bwStart) {
        const a = sm(((u - eu[seg]) + bwStart) / (2 * bwStart));
        si = [own, owners[seg - 1], 0, 0]; sw = [a, 1 - a, 0, 0];
      } else if (seg < owners.length - 1 && owners[seg + 1] !== own && eu[seg + 1] - u < bwEnd) {
        const a = sm(((u - eu[seg + 1]) + bwEnd) / (2 * bwEnd));
        si = [own, owners[seg + 1], 0, 0]; sw = [1 - a, a, 0, 0];
      }
    }
    for (let j = 0; j <= radial; j++) {
      const a = -Math.PI / 2 + (j / radial) * Math.PI * 2; // seam on ventral side
      let m = opts.shape ? opts.shape(u, a, pr) : 1;
      const ca = Math.cos(a), sa = Math.sin(a);
      _v.copy(P).addScaledVector(S, ca * pr.w * m + (pr.dx || 0)).addScaledVector(N, sa * pr.h * m + pr.dy);
      if (opts.noise) {
        const n = noise3(_v.x * (opts.noiseFreq || 1.3), _v.y * (opts.noiseFreq || 1.3), _v.z * (opts.noiseFreq || 1.3));
        const r = Math.min(pr.w, pr.h);
        _v.addScaledVector(S, ca * n * opts.noise * r).addScaledVector(N, sa * n * opts.noise * r);
      }
      pos.push(_v.x, _v.y, _v.z);
      uv.push((u * L) / (opts.texLen || 4), (j / radial) * (opts.vRepeat || 2));
      skinI.push(...si); skinW.push(...sw);
      if (opts.color) col.push(...opts.color(u, a, _v));
    }
  }
  const index = [];
  for (let i = 0; i < rings; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (opts.color) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (opts.skin) {
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinI, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinW, 4));
  }
  geo.setIndex(index);
  geo.computeVertexNormals();
  // weld seam normals
  const nrm = geo.attributes.normal;
  for (let i = 0; i <= rings; i++) {
    const a = i * (radial + 1), b = a + radial;
    const x = nrm.getX(a) + nrm.getX(b), y = nrm.getY(a) + nrm.getY(b), z = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l); nrm.setXYZ(b, x / l, y / l, z / l);
  }
  return { geo, bones, frames, prof, L };
}

function frameSampler(curve, sideRef) {
  return (u) => {
    const P = curve.getPointAt(Math.min(1, Math.max(0, u)));
    const T = curve.getTangentAt(Math.min(0.9999, Math.max(0.0001, u))).normalize();
    let S = sideRef.clone().addScaledVector(T, -sideRef.dot(T));
    if (S.lengthSq() < 1e-4) S = new THREE.Vector3(0, 0, 1).addScaledVector(T, -T.z);
    S.normalize();
    const N = new THREE.Vector3().crossVectors(T, S).normalize();
    return { P, T, S, N };
  };
}

// Build a skinned loft along bones of a rig. spec: [{b:'boneName'|null, p:[x,y,z] (ext offset rel. previous), w,h,dy,dx}]
export function skinnedLoft(rig, spec, material, opts = {}) {
  rig.root.updateMatrixWorld(true);
  const entries = [];
  let last = null;
  for (const s of spec) {
    let pos, bone = null, ext = false;
    if (s.b) { bone = rig.bones[s.b]; pos = bone.getWorldPosition(new THREE.Vector3()); }
    else { ext = true; pos = (last ? last.clone() : new THREE.Vector3()).add(new THREE.Vector3(...s.p)); }
    if (s.o) pos.add(new THREE.Vector3(...s.o));
    entries.push({ pos, bone, ext, w: s.w, h: s.h, dy: s.dy || 0, dx: s.dx || 0 });
    last = pos;
  }
  const res = loft(entries, { ...opts, skin: true });
  const mesh = new THREE.SkinnedMesh(res.geo, material);
  rig.root.add(mesh);
  rig.root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(res.bones));
  mesh.frustumCulled = false;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.frames = res.frames; mesh.userData.prof = res.prof;
  return mesh;
}

// Rigid loft along explicit points (local space) -> Mesh
export function rigidLoft(spec, material, opts = {}) {
  const entries = spec.map((s) => ({ pos: new THREE.Vector3(...s.p), w: s.w, h: s.h, dy: s.dy || 0, dx: s.dx || 0 }));
  const res = loft(entries, opts);
  const m = new THREE.Mesh(res.geo, material);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.frames = res.frames; m.userData.prof = res.prof;
  return m;
}

// Merge several cone/geometry instances into one geometry (claws, teeth, spikes)
export function spikes(list, radius, length, seg = 6) {
  const geos = [];
  for (const s of list) {
    const g = new THREE.ConeGeometry(s.r ?? radius, s.l ?? length, seg);
    g.translate(0, (s.l ?? length) / 2, 0);
    const m = new THREE.Matrix4();
    const dir = new THREE.Vector3(...s.d).normalize();
    m.compose(new THREE.Vector3(...s.p), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    geos.push(g.toNonIndexed());
  }
  return mergeNonIndexed(geos);
}
export function mergeNonIndexed(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    const gg = g.index ? g.toNonIndexed() : g;
    pos.set(gg.attributes.position.array, o * 3);
    if (gg.attributes.normal) nor.set(gg.attributes.normal.array, o * 3);
    if (gg.attributes.uv) uv.set(gg.attributes.uv.array, o * 2);
    o += gg.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Jagged crystalline plate (dorsal fins)
export function plateGeometry(w, h, spikesN = 3, thick = 0.18, seed = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  const pts = [];
  for (let i = 0; i <= spikesN * 2; i++) {
    const t = i / (spikesN * 2);
    const x = -w / 2 + w * t;
    const env = Math.sin(Math.PI * Math.min(1, t * 1.15)) ;
    const tip = i % 2 === 1;
    const jitter = Math.sin(seed * 7.1 + i * 3.3) * 0.12;
    const y = tip ? h * (env * 0.85 + 0.15 + jitter) : h * (env * 0.45 + 0.1);
    pts.push([x + (tip ? -w * 0.06 : 0), y]);
  }
  for (const p of pts) s.lineTo(p[0], p[1]);
  s.lineTo(w / 2, 0);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.6, bevelSize: thick * 0.5, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -thick / 2);
  g.computeVertexNormals();
  return g;
}

// Deformed sphere helper
export function blob(rx, ry, rz, ws = 24, hs = 16, fn) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.set(p.getX(i), p.getY(i), p.getZ(i));
    if (fn) fn(_v);
    p.setXYZ(i, _v.x * rx, _v.y * ry, _v.z * rz);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- Animation sampling ----------
const EASE = {
  lin: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  snap: (t) => 1 - Math.pow(1 - t, 6),
};
// clip: [[frame, poseObj, ease?], ...] poses are full maps {bone:[x,y,z], _root:[px,py,pz,rx,ry,rz]}
export function sampleClip(clip, f, out = {}) {
  let k = 0;
  while (k < clip.length - 1 && f >= clip[k + 1][0]) k++;
  const a = clip[k];
  if (k >= clip.length - 1) return copyPose(a[1], out);
  const b = clip[k + 1];
  const t = Math.max(0, Math.min(1, (f - a[0]) / Math.max(1, b[0] - a[0])));
  const e = (EASE[b[2] || 'out'])(t);
  return lerpPose(a[1], b[1], e, out);
}
export function copyPose(p, out = {}) {
  for (const k in out) delete out[k];
  for (const k in p) out[k] = p[k].slice();
  return out;
}
export function lerpPose(a, b, t, out = {}) {
  for (const k in out) delete out[k];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = a[k], vb = b[k];
    const n = Math.max(va ? va.length : 0, vb ? vb.length : 0);
    const r = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = va ? va[i] || 0 : 0, y = vb ? vb[i] || 0 : 0;
      r[i] = x + (y - x) * t;
    }
    out[k] = r;
  }
  return out;
}
// in-place smoothing of `cur` toward `target`
export function approachPose(cur, target, k) {
  for (const key in target) {
    const t = target[key];
    let c = cur[key];
    if (!c) { cur[key] = t.slice(); continue; }
    for (let i = 0; i < t.length; i++) c[i] += ((t[i] || 0) - (c[i] || 0)) * k;
  }
  for (const key in cur) if (!target[key]) { const c = cur[key]; for (let i = 0; i < c.length; i++) c[i] *= 1 - k; }
}
export function addTo(pose, bone, x = 0, y = 0, z = 0) {
  const p = pose[bone] || (pose[bone] = [0, 0, 0]);
  p[0] += x; p[1] += y; p[2] += z;
}
// Build a pose library resolving `base` defaults
export function poses(base, defs) {
  const out = { base };
  for (const k in defs) out[k] = { ...base, ...defs[k] };
  return out;
}
