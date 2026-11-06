// Loading: our own Blender models (models/*.glb, materials embedded) and the town models from ../uminagi-assets
// (meshopt-compressed, materials applied by name from materials.json + tiling textures).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TOWN = '../uminagi-assets/';
const OWN = ['granny', 'kid', 'jii', 'scooter', 'tanuki', 'daruma', 'boxes', 'cone', 'bucket', 'watermelons', 'pigeon', 'salaryman', 'kouji', 'police', 'sale', 'ramp', 'eggs'];
export const BUILDINGS = ['shop_general', 'shop_izakaya', 'shop_cafe', 'shop_sake', 'shop_restaurant', 'shop_souvenir', 'shop_fish', 'house_twostory', 'house_narrow', 'house_old'];
const TOWN_PROPS = ['utility_pole', 'street_light', 'vending_machine', 'postbox', 'bicycle', 'keitora', 'car_kei', 'cat', 'shiba', 'nobori', 'chochin_hanging', 'curve_mirror', 'guardrail', 'bus_stop'];

export const A = { models: {}, size: {} };
const GLOW = new Set(['lamp', 'lantern_red', 'lantern_white', 'vend_panel', 'window_lit']);

export async function loadAll(renderer, onProgress) {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const [defs, texMeta, meta] = await Promise.all([
    fetch(TOWN + 'materials.json').then((r) => r.json()),
    fetch(TOWN + 'textures/1k/textures.json').then((r) => r.json()).catch(() => fetch(TOWN + 'textures/textures.json').then((r) => r.json())),
    fetch(TOWN + 'models.json').then((r) => r.json()),
  ]);
  for (const m of meta) A.size[m.name] = m.size_m;
  const total = OWN.length + BUILDINGS.length + TOWN_PROPS.length + Object.keys(texMeta).length;
  let done = 0; const tick = () => onProgress && onProgress(++done / total);

  // tiling textures (colour only: normal maps cost a lot of memory on phones)
  const tl = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = {};
  await Promise.all(Object.entries(texMeta).map(([name, m]) => new Promise((res) => {
    tl.load(TOWN + 'textures/1k/' + (m.file || name + '.jpg'), (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
      t.repeat.set(1 / m.size_m[0], 1 / m.size_m[1]);
      tex[name] = t; tick(); res();
    }, undefined, () => { tick(); res(); });
  })));
  A.tex = tex;
  const mats = {};
  const townMat = (name) => {
    if (mats[name]) return mats[name];
    const d = defs[name];
    if (!d) return (mats[name] = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 }));
    const m = new THREE.MeshStandardMaterial({ name, color: new THREE.Color().setRGB(d.color[0], d.color[1], d.color[2], THREE.LinearSRGBColorSpace), roughness: d.rough, metalness: d.metal });
    if (d.tex && tex[d.tex]) { m.map = tex[d.tex]; if (texMeta[d.tex]?.alpha) { m.alphaTest = 0.45; m.side = THREE.DoubleSide; m.vertexColors = true; } }
    if (d.emit) { m.emissive = new THREE.Color().setRGB(...d.emit, THREE.LinearSRGBColorSpace); m.emissiveIntensity = GLOW.has(name) ? Math.min(d.emit_strength, 1.2) : d.emit_strength; }
    if (name === 'glass') { m.metalness = 0.1; m.roughness = 0.08; }
    if (name.startsWith('cloth') || name === 'paper' || name === 'denim') m.side = THREE.DoubleSide;
    return (mats[name] = m);
  };
  A.townMat = townMat;

  const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
  await Promise.all([
    ...OWN.map(async (n) => {
      const g = await load('models/' + n + '.glb');
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; fixOwnMat(o); } });
      bakeColors(g.scene); A.models[n] = g.scene; tick();
    }),
    ...[...BUILDINGS, ...TOWN_PROPS].map(async (n) => {
      try {
        const g = await load(TOWN + 'glb/' + n + '.glb');
        g.scene.traverse((o) => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map((m) => townMat(m.name)) : townMat(o.material.name); } });
        A.models[n] = g.scene;
      } catch (e) { console.warn('model', n, e); }
      tick();
    }),
  ]);
}

// Our Blender models use flat colours: merge sibling meshes of plain materials into one vertex-coloured mesh per node,
// so a tanuki or a granny limb is one draw call instead of one per colour.
const SEP = new Set(['cardigan', 'lens', 'egg_pack']);
let bakedMat = null;
function bakeColors(root) {
  if (!bakedMat) bakedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, name: 'baked' });
  const parents = new Set(); root.traverse((o) => { if (o.isMesh) parents.add(o.parent); });
  for (const par of parents) {
    const ms = par.children.filter((m) => m.isMesh && !Array.isArray(m.material) && !m.material.map && !m.material.transparent && !SEP.has(m.material.name) && !(m.material.emissive && m.material.emissive.getHex() !== 0));
    if (ms.length < 2) continue;
    const geos = ms.map((m) => {
      m.updateMatrix();
      const g = new THREE.BufferGeometry();
      const pos = m.geometry.attributes.position, nor = m.geometry.attributes.normal, n = pos.count;
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cc = new Float32Array(n * 3);
      const c = m.material.color;
      for (let i = 0; i < n; i++) { P[i * 3] = pos.getX(i); P[i * 3 + 1] = pos.getY(i); P[i * 3 + 2] = pos.getZ(i); N[i * 3] = nor ? nor.getX(i) : 0; N[i * 3 + 1] = nor ? nor.getY(i) : 1; N[i * 3 + 2] = nor ? nor.getZ(i) : 0; Cc[i * 3] = c.r; Cc[i * 3 + 1] = c.g; Cc[i * 3 + 2] = c.b; }
      g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
      const idx = m.geometry.index;
      g.setIndex(idx ? Array.from({ length: idx.count }, (_, i) => idx.getX(i)) : Array.from({ length: n }, (_, i) => i));
      g.applyMatrix4(m.matrix);
      return g;
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, bakedMat); mesh.name = ms[0].name + '_baked'; mesh.castShadow = true;
    for (const m of ms) par.remove(m);
    par.add(mesh);
  }
}

function fixOwnMat(o) {
  const ms = Array.isArray(o.material) ? o.material : [o.material];
  for (const m of ms) {
    if (m.name === 'lens' || m.name === 'egg_pack') { m.transparent = true; m.depthWrite = false; }
    if (m.emissive && m.emissive.getHex() !== 0) m.emissiveIntensity = Math.min(m.emissiveIntensity, 2);
  }
}

// a fresh copy of a model; `lod` keeps only the far mesh (…_lod1) or only the near one
export function clone(name, opt = {}) {
  const src = A.models[name];
  if (!src) return new THREE.Group();
  const c = src.clone(true);
  c.traverse((o) => {
    if (!o.isMesh) return;
    const far = /_lod1$/.test(o.name);
    if (far) o.visible = !!opt.far; else if (opt.far && hasLod(src)) o.visible = false;
    if (opt.shadow === false) o.castShadow = false;
  });
  return c;
}
function hasLod(src) { let f = false; src.traverse((o) => { if (/_lod1$/.test(o.name)) f = true; }); return f; }

export function node(root, name) { let r = null; root.traverse((o) => { if (!r && o.name === name) r = o; }); return r; }

// Static town models drawn with one BatchedMesh per material: every building type and street prop that shares a
// material shares a draw call. Each model part gets a pool of hidden instances; add() shows and places one.
function flatGeo(src, matrix, withColor) {
  const g = new THREE.BufferGeometry();
  const n = src.attributes.position.count;
  const copy = (name, size, fallback) => {
    const a = src.attributes[name];
    const arr = new Float32Array(n * size);
    for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) arr[i * size + c] = a ? (c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : c === 2 ? a.getZ(i) : a.getW(i)) : fallback;
    g.setAttribute(name, new THREE.BufferAttribute(arr, size));
  };
  copy('position', 3, 0); copy('normal', 3, 0); copy('uv', 2, 0);
  if (withColor) copy('color', 3, 1);
  const idx = src.index ? Uint32Array.from({ length: src.index.count }, (_, i) => src.index.getX(i)) : Uint32Array.from({ length: n }, (_, i) => i);
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.applyMatrix4(matrix);
  return g;
}
export class TownBatch {
  constructor(scene, caps) {
    this.parts = {};
    const groups = new Map();
    for (const [name, cap] of Object.entries(caps)) {
      const src = A.models[name]; if (!src) continue;
      src.updateMatrixWorld(true);
      const lod = hasLod(src);
      this.parts[name] = [];
      src.traverse((o) => {
        if (!o.isMesh || Array.isArray(o.material)) return;
        const far = /_lod1$/.test(o.name);
        const m = o.material;
        if (!groups.has(m)) groups.set(m, []);
        groups.get(m).push({ name, cap, far: lod ? far : null, geo: flatGeo(o.geometry, o.matrixWorld, !!m.vertexColors) });
      });
    }
    for (const [m, items] of groups) {
      let v = 0, ix = 0, inst = 0;
      for (const it of items) { v += it.geo.attributes.position.count; ix += it.geo.index.count; inst += it.cap; }
      const bm = new THREE.BatchedMesh(inst, v, ix, m);
      bm.receiveShadow = true; bm.castShadow = false; bm.frustumCulled = false; bm.perObjectFrustumCulled = true;
      scene.add(bm);
      for (const it of items) {
        const gid = bm.addGeometry(it.geo);
        const pool = [];
        for (let i = 0; i < it.cap; i++) { const id = bm.addInstance(gid); bm.setVisibleAt(id, false); pool.push(id); }
        this.parts[it.name].push({ bm, far: it.far, pool, n: 0, prev: 0 });
        it.geo.dispose();
      }
    }
  }
  begin() { for (const k in this.parts) for (const p of this.parts[k]) p.n = 0; }
  add(name, mat4, far) {
    const ps = this.parts[name]; if (!ps) return;
    for (const p of ps) {
      if (p.far !== null && p.far !== far) continue;
      if (p.n >= p.pool.length) continue;
      const id = p.pool[p.n++];
      p.bm.setMatrixAt(id, mat4); p.bm.setVisibleAt(id, true);
    }
  }
  end() { for (const k in this.parts) for (const p of this.parts[k]) { for (let i = p.n; i < p.prev; i++) p.bm.setVisibleAt(p.pool[i], false); p.prev = p.n; } }
}
