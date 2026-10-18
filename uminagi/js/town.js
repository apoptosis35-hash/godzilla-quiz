// Places the Blender model kit (../uminagi-assets/glb) to build Uminagi: harbour, fish market, main street, terraced
// houses, shrine, cliff path, lighthouse hill, forest, props, people, boats and gulls. Static models are drawn with
// GPU instancing, grouped in 64 m cells (so whole cells are frustum-culled) with per-instance LOD switching.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ASSETS } from './materials.js';
import { QY, streetY, TIERS, STAIRS, TIER_X1, SHRINE, PLATEAU, PLATFORMS, platformY, fbm, naturalRaw, G } from './terrain.js';

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const H = Math.PI / 2, PI = Math.PI;
// where light comes from at night (model-local position, colour, strength)
const LAMPS = {
  street_light: [[0, 5.0, 0.65], 0xffd9a0, 1.0], ishidoro: [[0, 1.65, 0], 0xffb060, 0.45], street_lantern: [[0, 1.8, 0], 0xffc070, 0.6],
  shop: [[0, 2.4, 5.4], 0xffb46a, 0.9], fish_market: [[0, 4.5, 6], 0xfff0d0, 1.4], vending_machine: [[0, 1.2, 0.8], 0xd8e8ff, 0.5], torii: [[0, 1.5, 1.5], 0xffb060, 0.3],
};
const TINT = new Set(['plaster', 'plaster_white', 'plaster_cream', 'wood', 'wood_dark', 'wood_grey']);

export const MODELS = {
  // static (instanced)
  buildings: ['fish_market', 'suisan_office', 'warehouse_wood', 'warehouse_tin', 'gear_shed', 'shop_general', 'shop_restaurant', 'shop_izakaya',
    'shop_souvenir', 'shop_fish', 'shop_cafe', 'shop_sake', 'house_narrow', 'house_standard', 'house_twostory', 'house_hira', 'house_old', 'house_hipped',
    'house_hillside', 'torii', 'shrine_hall', 'azumaya'],
  props: ['dock_straight', 'dock_end', 'bollard', 'tire_fender', 'quay_ladder', 'tetrapod', 'crates_blue', 'styro_boxes', 'pallet', 'handcart', 'forklift',
    'keitora', 'net_pile', 'floats', 'crab_traps', 'rope_coil', 'market_tent', 'utility_pole', 'street_light', 'vending_machine', 'bicycle', 'ac_outdoor',
    'a_frame_sign', 'bench', 'postbox', 'nobori', 'street_lantern', 'direction_sign', 'laundry_pole', 'fence_wood', 'fence_rail', 'fence_log', 'plant_pots',
    'propane', 'ishidoro', 'komainu', 'telescope', 'info_board', 'skiff'],
  nature: ['tree_pine', 'tree_pine_b', 'tree_broadleaf', 'tree_shinboku', 'tree_sakura', 'tree_cedar', 'bush', 'hydrangea', 'grass_tuft', 'rock_a', 'rock_b', 'rock_c'],
  // animated (cloned)
  dynamic: ['fishing_boat', 'fishing_boat_b', 'lighthouse', 'lighthouse_red', 'player', 'fisherman', 'shopkeeper', 'townsman', 'cat', 'seagull'],
};
// building footprints (model-local, before rotation): [w, d, cx, cz] boxes the player can't enter
const FOOT = {
  suisan_office: [[11.2, 9.2]], warehouse_wood: [[14.2, 10.2], [3.6, 10, 8.8, 0]], warehouse_tin: [[12.2, 9.2]], gear_shed: [[8, 4.5]],
  shop_general: [[7, 9]], shop_restaurant: [[7.5, 9]], shop_izakaya: [[6.5, 9]], shop_souvenir: [[7, 9]], shop_fish: [[8, 9]], shop_cafe: [[7, 9]], shop_sake: [[6, 8]],
  house_narrow: [[5.4, 7.7]], house_standard: [[8.2, 6.7], [2.4, 3, 5.2, -1.75]], house_twostory: [[9.2, 7.2]], house_hira: [[8.7, 6.7], [2, 3.2, 5.35, -1.65]],
  house_old: [[6.7, 6.2]], house_hipped: [[7.7, 7.7]], house_hillside: [[9, 9, 0, -1.5]], shrine_hall: [[7, 6.2]], azumaya: [[0.3, 0.3, -2.2, -2.2], [0.3, 0.3, 2.2, -2.2], [0.3, 0.3, -2.2, 2.2], [0.3, 0.3, 2.2, 2.2]],
  torii: [[0.6, 0.6, -1.75, 0], [0.6, 0.6, 1.75, 0]], lighthouse: [[5.8, 5.8], [4.1, 3.3, 3.6, -1.5]], lighthouse_red: [[3.4, 3.4]],
  vending_machine: [[1.0, 0.8]], keitora: [[1.4, 3.3]], forklift: [[1.2, 2.6]], market_tent: [[3.8, 1.0, 0, 0.6]], styro_boxes: [[2.2, 0.5]],
  crates_blue: [[1.3, 0.9]], crab_traps: [[2.9, 0.9]], info_board: [[1.9, 0.3]], bench: [[1.6, 0.5]], postbox: [[0.5, 0.45]], handcart: [[1.3, 2]],
  propane: [[0.8, 0.4]], net_pile: [[1.8, 1.4]], fence_wood: [[2, 0.12]], fence_rail: [[2, 0.1]], fence_log: [[2.1, 0.14]], laundry_pole: [[0.2, 0.2, -1.2, 0], [0.2, 0.2, 1.2, 0]],
  saisen_box: [[1.2, 0.6]], azumaya_rail: [[4.4, 0.1, 0, -2.2]],
};
const TRUNK = { tree_pine: 0.4, tree_pine_b: 0.4, tree_broadleaf: 0.45, tree_shinboku: 1.3, tree_sakura: 0.3, tree_cedar: 0.35, utility_pole: 0.25, street_light: 0.12,
  ishidoro: 0.45, komainu: 0.45, street_lantern: 0.35, nobori: 0.15, direction_sign: 0.12, rock_a: 1.2, rock_b: 1.4, rock_c: 2.6, bollard: 0.3, telescope: 0.25, a_frame_sign: 0.35, floats: 0.5, rope_coil: 0.45, bush: 0.7, hydrangea: 0.7, bicycle: 0.3, plant_pots: 0.45 };
const NOCOLLIDE = new Set(['dock_straight', 'dock_end', 'tire_fender', 'quay_ladder', 'pallet', 'grass_tuft', 'ac_outdoor', 'tetrapod', 'skiff']);

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ------------------------------------------------------------------ instancing pool
class Pool {
  constructor(scene) { this.scene = scene; this.groups = new Map(); this.CELL = 96; this.timer = 0; }
  add(proto, matrix, opt) {
    const p = new THREE.Vector3().setFromMatrixPosition(matrix), C = opt.cell || this.CELL;
    const key = `${proto.name}|${Math.floor((p.x + 5537) / C)}|${Math.floor((p.z + 5537) / C)}`;
    if (!this.groups.has(key)) this.groups.set(key, { proto, items: [], opt });
    this.groups.get(key).items.push({ m: matrix.clone(), p, tint: opt.tint });
  }
  finalize() {
    const tmp = new THREE.Matrix4();
    for (const g of this.groups.values()) {
      const n = g.items.length, center = new THREE.Vector3();
      for (const it of g.items) center.add(it.p);
      center.divideScalar(n);
      let rad = 0; for (const it of g.items) rad = Math.max(rad, it.p.distanceTo(center));
      rad += g.proto.radius;
      g.levels = [g.proto.lod0, g.proto.lod1, g.proto.lod2].map((prims, L) => prims && prims.map((pr) => {
        const im = new THREE.InstancedMesh(pr.geometry, pr.material, n);
        // only the detailed (near) level casts shadows: the shadow map covers the area around the player
        im.name = g.proto.name; im.castShadow = g.opt.shadow !== false && L === 0; im.receiveShadow = true;
        im.boundingSphere = new THREE.Sphere(center.clone(), rad);
        if (TINT.has(pr.material.name) && g.items.some((it) => it.tint)) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
        im.count = 0; im.userData.local = pr.matrix;
        this.scene.add(im);
        return im;
      }));
      g.state = -1; g.center = center; g.rad = rad;
      // pre-fill LOD0 with all items (used until the first update)
      for (const im of g.levels[0]) {
        g.items.forEach((it, i) => { im.setMatrixAt(i, tmp.multiplyMatrices(it.m, im.userData.local)); if (im.instanceColor && it.tint) im.setColorAt(i, it.tint); });
        im.count = n;
      }
    }
  }
  // every few frames: pick LOD per instance (whole cells switch at once when clearly near or far)
  update(cam, lodScale, force) {
    const tmp = new THREE.Matrix4(), cnt = [0, 0, 0];
    for (const g of this.groups.values()) {
      const lodD = (g.opt.lod ?? 70) * lodScale, cull = (g.opt.cull ?? 1e9) * lodScale, lod2D = (g.opt.lod2 ?? 1e9) * lodScale;
      const dc = Math.hypot(cam.x - g.center.x, cam.z - g.center.z);
      let state;
      if (dc - g.rad > cull) state = 3; else if (dc + g.rad < lodD) state = 0;
      else if (dc - g.rad > lodD && dc + g.rad < Math.min(cull, lod2D)) state = 1; else if (dc - g.rad > lod2D && dc + g.rad < cull) state = 4; else state = 2;
      if (state === g.state && state !== 2 && !force) continue;
      g.state = state;
      const lv = g.levels, has1 = !!lv[1], has2 = !!lv[2];
      cnt[0] = cnt[1] = cnt[2] = 0;
      g.items.forEach((it) => {
        const d = Math.hypot(cam.x - it.p.x, cam.z - it.p.z);
        if (d > cull) return;
        const L = d > lod2D && has2 ? 2 : d > lodD && has1 ? 1 : 0;
        const k = cnt[L]++;
        for (const im of lv[L]) {
          im.setMatrixAt(k, tmp.multiplyMatrices(it.m, im.userData.local));
          if (im.instanceColor && it.tint) im.setColorAt(k, it.tint);
        }
      });
      lv.forEach((ims, L) => ims && ims.forEach((im) => { im.count = cnt[L]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }));
    }
  }
}

// ------------------------------------------------------------------ the town
export class Town {
  constructor(scene, ground, matlib, world, quality) {
    this.scene = scene; this.ground = ground; this.mats = matlib; this.world = world; this.q = quality;
    this.protos = {}; this.pool = new Pool(scene);
    this.colliders = []; this.mapRects = []; this.boats = []; this.npcs = []; this.gulls = []; this.spinners = [];
    this.lampSpots = []; this.lights = [];
    this.root = new THREE.Group(); this.root.name = 'town'; scene.add(this.root);
  }
  async load(onProgress) {
    const names = [...MODELS.buildings, ...MODELS.props, ...MODELS.nature, ...MODELS.dynamic];
    let done = 0;
    await Promise.all(names.map((n) => loader.loadAsync(ASSETS + 'glb/' + n + '.glb').then((g) => {
      this.protos[n] = this.proto(n, g.scene); onProgress?.(++done / names.length);
    })));
  }
  proto(name, scene) {
    scene.updateMatrixWorld(true);
    const p = { name, scene, lod0: [], lod1: null, radius: 1 };
    const inv = new THREE.Matrix4();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.material = this.mats.get(o.material.name);
      o.castShadow = o.receiveShadow = true;
      let n = o, isLod = false;
      while (n) { if (n.name === `${name}_lod1`) isLod = true; n = n.parent; }
      const prim = { geometry: o.geometry, material: o.material, matrix: inv.copy(scene.matrixWorld).invert().multiply(o.matrixWorld).clone() };
      if (isLod) (p.lod1 ||= []).push(prim); else p.lod0.push(prim);
    });
    const lod1 = scene.getObjectByName(`${name}_lod1`); if (lod1) lod1.visible = false;
    for (const pr of [...p.lod0, ...(p.lod1 || [])]) if (pr.material.alphaTest) pr.geometry = canopyNormals(pr.geometry, pr.matrix);
    p.lod0 = this.mergePlain(p.lod0, false, !MODELS.nature.includes(name));
    if (p.lod1) p.lod1 = this.mergePlain(p.lod1, true);
    if (name.startsWith('tree_')) p.lod2 = [this.treeProxy(name, p.lod0)];
    const box = new THREE.Box3();
    for (const pr of p.lod0) { pr.geometry.computeBoundingBox(); box.union(pr.geometry.boundingBox.clone().applyMatrix4(pr.matrix)); }
    p.box = box; p.radius = box.getSize(new THREE.Vector3()).length() / 2; p.height = box.max.y;
    return p;
  }
  // Untextured single-colour materials of a model are merged into one vertex-coloured primitive
  // (textured, glass, glowing and wind-swayed materials stay separate) -> far fewer draw calls per instance group.
  // far = true (LOD1): everything but lights is merged, textured materials take their texture's average colour
  mergePlain(prims, far = false, stillFoliage = false, single = false) {
    const keep = [], groups = { front: [], double: [], sway: [] }, byMat = new Map();
    for (const pr of prims) {
      const m = pr.material;
      const sway = !far && !!m.onBeforeCompile?.toString().includes('uTime') && !(stillFoliage && m.name !== 'net' && m.name !== 'net_green');
      if ((!far && m.map) || m.alphaTest) { if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(pr); }  // textured / leaf cards
      else if (sway) groups.sway.push(pr);
      else groups[m.side === THREE.DoubleSide && !single ? 'double' : 'front'].push(pr);
    }
    // textured / swaying primitives: one merged primitive per material
    for (const [m, list] of byMat) keep.push(list.length === 1 ? list[0] : { geometry: bakeMerge(list), material: m, matrix: new THREE.Matrix4() });
    for (const [kind, list] of Object.entries(groups)) {
      if (!list.length) continue;
      if (list.length === 1 && false) { keep.push(list[0]); continue; }
      let nv = 0, ni = 0;
      for (const pr of list) { nv += pr.geometry.attributes.position.count; ni += pr.geometry.index ? pr.geometry.index.count : pr.geometry.attributes.position.count; }
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), pbr = new Float32Array(nv * 2), emi = new Float32Array(nv * 3), idx = new Uint32Array(ni);
      const v = new THREE.Vector3(), nm = new THREE.Matrix3();
      let ov = 0, oi = 0;
      for (const pr of list) {
        const g = pr.geometry, P = g.attributes.position, N = g.attributes.normal, mt = pr.material, c = this.mats.flatColor(mt);
        const gl = this.mats.glow[mt.name], ec = gl ? mt.emissive.clone().multiplyScalar(gl.base) : null;
        nm.getNormalMatrix(pr.matrix);
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(pr.matrix); pos.set([v.x, v.y, v.z], (ov + i) * 3);
          if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (ov + i) * 3); }
          col.set([c.r, c.g, c.b], (ov + i) * 3); pbr.set([mt.roughness, mt.metalness], (ov + i) * 2);
          if (ec) emi.set([ec.r, ec.g, ec.b], (ov + i) * 3);
        }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi++] = g.index.getX(i) + ov;
        else for (let i = 0; i < P.count; i++) idx[oi++] = ov + i;
        ov += P.count;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.setAttribute('pbr', new THREE.BufferAttribute(pbr, 2)); geo.setAttribute('emit', new THREE.BufferAttribute(emi, 3));
      keep.push({ geometry: geo, material: this.plainMat(kind === 'double', kind === 'sway'), matrix: new THREE.Matrix4() });
    }
    return keep;
  }
  // ~30-triangle stand-in for distant trees: a trunk and one or two low-poly canopy blobs in the foliage colour
  treeProxy(name, prims) {
    const box = new THREE.Box3(), leafBox = new THREE.Box3(); let leafCol = new THREE.Color(0.2, 0.4, 0.15);
    for (const pr of prims) {
      pr.geometry.computeBoundingBox(); const b = pr.geometry.boundingBox.clone().applyMatrix4(pr.matrix); box.union(b);
      if (pr.material.name === '_plainSway' || (pr.material.onBeforeCompile && !pr.material.name.startsWith('_plain'))) {
        leafBox.union(b);
        const ca = pr.geometry.attributes.color;
        if (ca) { leafCol = new THREE.Color(0, 0, 0); for (let i = 0; i < ca.count; i += 7) leafCol.r += ca.getX(i), leafCol.g += ca.getY(i), leafCol.b += ca.getZ(i); leafCol.multiplyScalar(7 / ca.count); }
        else leafCol = this.mats.flatColor(pr.material);
      }
    }
    if (leafBox.isEmpty()) leafBox.copy(box);
    const s = leafBox.getSize(new THREE.Vector3()), c = leafBox.getCenter(new THREE.Vector3());
    const parts = [];
    const canopy = name === 'tree_cedar' ? new THREE.ConeGeometry(s.x * 0.45, s.y * 1.05, 7, 1) : new THREE.IcosahedronGeometry(0.5, 0);
    if (name !== 'tree_cedar') canopy.scale(s.x * 0.95, s.y * 0.95, s.z * 0.95);
    canopy.translate(c.x, c.y, c.z);
    const trunk = new THREE.CylinderGeometry(s.x * 0.04, s.x * 0.06, leafBox.min.y + s.y * 0.2, 5, 1, true);
    trunk.translate(0, (leafBox.min.y + s.y * 0.2) / 2, 0);
    for (const [g, col] of [[canopy.index ? canopy.toNonIndexed() : canopy, leafCol.clone().multiplyScalar(0.85)], [trunk.toNonIndexed(), new THREE.Color(0.18, 0.13, 0.1)]]) {
      const n = g.attributes.position.count, cc = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) cc.set([col.r, col.g, col.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g.deleteAttribute('uv'); parts.push(g);
    }
    const geo = mergeAttr(parts); geo.computeVertexNormals();
    const n = geo.attributes.position.count, pb = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { pb[i * 2] = 0.9; pb[i * 2 + 1] = 0; }
    geo.setAttribute('pbr', new THREE.BufferAttribute(pb, 2)); geo.setAttribute('emit', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    return { geometry: geo, material: this.plainMat(false), matrix: new THREE.Matrix4() };
  }
  // shared material for merged geometry: colour, roughness/metalness and light emission come from vertex attributes
  plainMat(double, sway = false) {
    const k = sway ? '_plainSway' : double ? '_plainD' : '_plain';
    if (!this.mats.mats[k]) {
      const m = new THREE.MeshStandardMaterial({ name: k, vertexColors: true, roughness: 0.72, metalness: 0.0, emissive: 0xffffff });
      if (double || sway) m.side = THREE.DoubleSide;
      if (sway) this.mats.sway(m, 0.05);
      const swayHook = m.onBeforeCompile;
      m.onBeforeCompile = (sh) => {
        if (sway) swayHook(sh);
        sh.uniforms.uGlow = this.mats.glowK;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 pbr; attribute vec3 emit; varying vec2 vPbr; varying vec3 vEmit;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr; vEmit = emit;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow; varying vec2 vPbr; varying vec3 vEmit;')
          .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPbr.x;')
          .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPbr.y;')
          .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = vEmit * uGlow;');
      };
      m.customProgramCacheKey = () => 'plainpbr' + k;
      if (sway) m.onBeforeCompile.toString = () => 'uTime';  // mark as swaying foliage for later merges
      this.mats.mats[k] = m;
    }
    return this.mats.mats[k];
  }
  // ------------------------------------------------------------------ placement helpers
  at(x, z) { return this.ground.height(x, z); }
  put(name, x, y, z, ry = 0, opt = {}) {
    const pr = this.protos[name]; if (!pr) return;
    if (y === null || y === undefined) y = this.at(x, z);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(opt.rx || 0, ry, opt.rz || 0)), new THREE.Vector3().setScalar(opt.s || 1));
    const cat = MODELS.buildings.includes(name) ? 'b' : MODELS.nature.includes(name) ? 'n' : 'p';
    const defaults = cat === 'b' ? { lod: 75, cull: 1e9, cell: 1000 } : cat === 'n' ? { lod: 45, lod2: 110, cull: 900, cell: 128 } : { lod: 35, cull: 170, cell: 200 };
    this.pool.add(pr, m, { ...defaults, ...opt.pool, shadow: opt.shadow ?? (cat !== 'p' || pr.height > 1.5), tint: opt.tint });
    const lamp = LAMPS[name] || (name.startsWith('shop_') ? LAMPS.shop : null);
    if (lamp) this.lampSpots.push({ p: new THREE.Vector3(...lamp[0]).applyMatrix4(m), col: lamp[1], k: lamp[2] });
    if (opt.col !== false && !NOCOLLIDE.has(name)) this.collide(name, x, y, z, ry, opt.s || 1, pr.height * (opt.s || 1), opt.col);
    return m;
  }
  collide(name, x, y, z, ry, s, h, col) {
    const c = Math.cos(ry), sn = Math.sin(ry);
    if (TRUNK[name] && !col) { this.colliders.push({ type: 'c', x, z, r: TRUNK[name] * s, y0: y - 1, y1: y + h }); return; }
    const boxes = col || FOOT[name] || (() => { const b = this.protos[name].box; return [[(b.max.x - b.min.x) * 0.9, (b.max.z - b.min.z) * 0.9, (b.max.x + b.min.x) / 2, (b.max.z + b.min.z) / 2]]; })();
    for (const [w, d, cx = 0, cz = 0] of boxes) {
      // local (cx, cz) rotated by ry about Y: x' = cx cos + cz sin, z' = -cx sin + cz cos
      const bx = x + (cx * c + cz * sn) * s, bz = z + (-cx * sn + cz * c) * s;
      this.colliders.push({ type: 'b', x: bx, z: bz, hw: w * s / 2, hd: d * s / 2, c, s: sn, y0: y - 1, y1: y + h });
      if (MODELS.buildings.includes(name)) this.mapRects.push({ x: bx, z: bz, w: w * s, d: d * s, ry, kind: name.startsWith('shop') ? 'shop' : name.startsWith('house') ? 'house' : 'other' });
    }
  }
  clone(name, x, y, z, ry = 0, merge = false) {
    const src = merge ? this.mergedScene(name) : this.protos[name].scene;
    const o = src.clone(true); o.name = name;
    o.position.set(x, y, z); o.rotation.y = ry; this.root.add(o);
    return o;
  }
  // a copy of an articulated model where every part node is a single vertex-coloured mesh (1 draw call per part)
  mergedScene(name) {
    const p = this.protos[name];
    if (p.merged) return p.merged;
    const root = new THREE.Group(), inv = new THREE.Matrix4();
    p.scene.updateMatrixWorld(true);
    const nodes = []; p.scene.traverse((o) => { if (o.name.startsWith(name + '_') && !o.name.endsWith('_lod1') && (o.isMesh || o.children.some((c) => c.isMesh))) nodes.push(o); });
    for (const n of nodes) {
      const prims = [];
      n.traverse((o) => { if (o.isMesh) prims.push({ geometry: o.geometry, material: o.material, matrix: inv.copy(n.matrixWorld).invert().multiply(o.matrixWorld).clone() }); });
      const merged = this.mergePlain(prims, true, false, true);
      const g = new THREE.Group(); g.name = n.name; n.matrixWorld.decompose(g.position, g.quaternion, g.scale);
      for (const pr of merged) { const m = new THREE.Mesh(pr.geometry, pr.material); m.castShadow = true; m.applyMatrix4(pr.matrix); g.add(m); }
      root.add(g);
    }
    return (p.merged = root);
  }
  // ------------------------------------------------------------------ build everything
  build() {
    const r = rng(7);
    this.harbour(r); this.street(r); this.terraces(r); this.shrine(r); this.hill(r); this.east(r);
    this.nature(r); this.wires(); this.people(r); this.birds(r);
    this.pool.finalize();
  }
  harbour(r) {
    const P = (...a) => this.put(...a);
    P('fish_market', -2, QY, 6, 0, { col: [[30.4, 0.5, 0, -8], [0.5, 16, -15, 0], [0.5, 16, 15, 0], ...[-15, -10, -5, 0, 5, 10, 15].map((x) => [0.5, 0.5, x, 8]), ...[-9, -3, 3, 9].map((x) => [4, 1.4, x, -1])] });
    P('suisan_office', 26, QY, 2); P('warehouse_wood', -45, QY, 1); P('warehouse_tin', -64, QY, 0, 0);
    P('gear_shed', -25, QY, -8); P('gear_shed', 8, QY, -9.5, 0);
    for (const [x, z] of [[-31, 17.6], [-25, 17.6], [18, 17.6]]) P('market_tent', x, QY, z, PI);
    // quay furniture: bollards on the edge, tyre fenders on the wall face, ladders
    for (let x = -74; x <= 50; x += 8) { if (Math.abs(x + 48) < 3 || Math.abs(x + 12) < 3 || Math.abs(x - 29) < 3) continue; P('bollard', x, QY, 21.2, 0); }
    for (let x = -72; x <= 50; x += 6) P('tire_fender', x + 2, QY - 1.15, 22.18, 0, { col: false, shadow: false });
    for (const x of [-60, -30, 6, 44]) P('quay_ladder', x, QY, 22.0, 0);
    for (let z = 28; z <= 88; z += 8) { P('bollard', 52.8, QY, z, 0); P('tire_fender', 51.82, QY - 1.15, z + 3, -H, { col: false, shadow: false }); }
    for (let z = 24; z <= 108; z += 10) P('bollard', -75.8, 3, z, 0);
    // piers
    for (const p of PLATFORMS.filter((q) => q.dock)) {
      const alongX = p.x1 - p.x0 > p.z1 - p.z0, L = alongX ? p.x1 - p.x0 : p.z1 - p.z0;
      for (let s = 0; s < L / 4 - 0.01; s++) {
        const t = (s + 0.5) * 4, last = s >= L / 4 - 1;
        const x = alongX ? p.x0 + t : (p.x0 + p.x1) / 2, z = alongX ? (p.z0 + p.z1) / 2 : p.z0 + t;
        P(last && !alongX ? 'dock_end' : 'dock_straight', x, p.y, z, alongX ? H : (last ? PI : 0), { pool: { lod: 60, cull: 400 } });
      }
    }
    // harbour clutter: crates, styrofoam, pallets, nets, floats, traps, forklift, kei truck
    const clutter = [['crates_blue', -16, 16.5, 0.1], ['crates_blue', -13, 16.8, -0.3], ['styro_boxes', -8, 16.6, 0], ['crates_blue', 2, 16.2, 0.4], ['styro_boxes', 6, 16.8, 0.2],
      ['pallet', 10, 16.5, 0.3], ['crates_blue', 10, 16.5, 0.3], ['forklift', -6, 18.2, 2.0], ['handcart', -3.5, 16.8, 1.2], ['keitora', 14, 19, H + 0.1],
      ['net_pile', -38, 9.5, 0], ['crab_traps', -52, 10.5, 0.2], ['floats', -36, 12, 0], ['rope_coil', -40, 18, 0], ['net_pile', -58, 9, 1],
      ['crates_blue', -66, 8, 0.5], ['pallet', -60, 15, 0], ['crab_traps', -70, 12, H], ['floats', -47, 19.5, 0], ['rope_coil', -9, 20.5, 0], ['rope_coil', 31, 20.5, 0],
      ['keitora', -30, 2, -H + 0.2], ['styro_boxes', 22, 9.5, H], ['crates_blue', 30, 10, 0], ['pallet', 33, 10, 0.2], ['vending_machine', 19.2, 6.5, H],
      ['vending_machine', -17.8, -2.6, 0], ['bench', 40, 18.5, PI], ['bench', -20, 20.2, PI], ['net_pile', 56, 40, 0.5], ['floats', 57, 46, 0], ['crab_traps', 58, 60, H],
      ['bicycle', 21, 12, 0.3], ['propane', 31, -2.5, 0], ['crates_blue', -78 + 6, 3, 0], ['direction_sign', 34.5, -4, -0.5]];
    for (const [n, x, z, ry] of clutter) P(n, x, QY, z, ry);
    for (const [x, z] of [[22, 24], [36, 30], [-44, 26]]) P('skiff', x, -0.05, z, 0.1, { pool: { lod: 60, cull: 500 } });
    // breakwater: tetrapods on the seaward side, small red lighthouse at the tip
    const tet = (x, z) => P('tetrapod', x, -1.2 + r() * 2.2, z, r() * 6, { rx: r() * 0.8, s: 0.9 + r() * 0.3, pool: { lod: 50, cull: 700 } });
    for (let z = 4; z <= 118; z += 2.6) for (let k = 0; k < 2; k++) tet(-87.5 - k * 2.6 - r(), z + r() * 1.3);
    for (let x = -84; x <= -4; x += 2.6) for (let k = 0; k < 2; k++) tet(x + r() * 1.3, 115 + k * 2.6 + r());
    for (let z = 98; z < 116; z += 2.6) tet(-7.5 + r(), z);
    for (let x = 22; x <= 68; x += 2.6) for (let k = 0; k < 2; k++) tet(x + r(), 109.5 + k * 2.6 + r());
    for (let z = 94; z < 110; z += 2.6) tet(19 + r(), z);
    this.redLighthouse = this.clone('lighthouse_red', -17, 3, 106, 0);
    this.collide('lighthouse_red', -17, 3, 106, 0, 1, 9);
    this.spinners.push({ o: this.redLighthouse.getObjectByName('lighthouse_red_lamp'), speed: 0, blink: true });
    // fishing boats moored along the piers and the east quay
    const boats = [['fishing_boat', -51.8, 33, 0], ['fishing_boat_b', -44.1, 36, 0], ['fishing_boat', -15.8, 33, 0.03], ['fishing_boat_b', -8.3, 31, -0.02],
      ['fishing_boat_b', 25.4, 33, 0], ['fishing_boat', 33.0, 34, 0.02], ['fishing_boat', 49.8, 52, PI], ['fishing_boat_b', 50.1, 70, PI]];
    for (const [n, x, z, ry] of boats) {
      const o = this.clone(n, x, 0, z, ry);
      this.boats.push({ o, x, z, ry, ph: r() * 10, radar: o.getObjectByName(n + '_radar') });
      this.colliders.push({ type: 'b', x, z, hw: 2.0, hd: n === 'fishing_boat' ? 7 : 6, c: Math.cos(ry), s: Math.sin(ry), y0: -2, y1: 6 });
    }
  }
  street(r) {
    const P = (...a) => this.put(...a);
    // shops: west side faces east (+X), east side faces west (-X); each sits on a plinth at the street height
    const west = [['shop_fish', -10], ['shop_restaurant', -21.9], ['shop_general', -34.8], ['shop_izakaya', -47.6], ['shop_souvenir', -60.5], ['shop_cafe', -73.3], ['shop_sake', -86.2]];
    const east = [['shop_izakaya', -11], ['shop_souvenir', -19.5], ['shop_fish', -28], ['house_old', -40.5], ['shop_sake', -48.5], ['shop_restaurant', -57], ['shop_general', -69], ['shop_cafe', -77.5], ['house_narrow', -86]];
    const plinths = [];
    for (const [n, z] of west) { const y = streetY(z); P(n, 29.5, y, z, H, { tint: this.tint(r) }); plinths.push([25, 34, z, y, n]); }
    for (const [n, z] of east) { const y = streetY(z); P(n, n.startsWith('house') ? 50 : 50.5, y, z, -H, { tint: this.tint(r) }); plinths.push([46, 55, z, y, n]); }
    this.plinths(plinths);
    // street furniture
    const poles = [];
    for (let z = -10; z >= -94; z -= 14) { P('utility_pole', 35.0, null, z, H); poles.push([35.0, z]); }
    this.poleLines = [poles.map(([x, z]) => [x, z, H])];
    const poles2 = [];
    for (let z = -16; z >= -92; z -= 19) { P('street_light', 45.4, null, z, -H); poles2.push([45.4, z]); }
    for (const [n, x, z, ry] of [['vending_machine', 34.7, -18.0, H], ['vending_machine', 45.3, -34.2, -H], ['bicycle', 35.2, -26, 0.15], ['bicycle', 35.4, -27, 0.1], ['bicycle', 45.0, -52, -0.2],
      ['a_frame_sign', 35.6, -21, H], ['a_frame_sign', 44.6, -56, -H], ['nobori', 35.8, -44, H], ['nobori', 44.2, -46.5, -H], ['nobori', 35.8, -88, H],
      ['plant_pots', 34.8, -36.8, 0], ['plant_pots', 45.2, -61, 0], ['postbox', 45.3, -24, -H], ['bench', 45.0, -71.5, -H], ['keitora', 41.8, -64, PI + 0.02],
      ['hydrangea', 33.3, -17.6, 0], ['hydrangea', 33.3, -43.2, 0], ['bush', 33.3, -56.1, 0], ['direction_sign', 45.6, -97, -H], ['bench', 30, -110, 0], ['bench', 48, -110, 0],
      ['street_lantern', 26, -99, 0], ['street_lantern', 54, -99, 0], ['tree_sakura', 52, -114, 0], ['tree_broadleaf', 28, -116, 0], ['vending_machine', 55.2, -104, -H], ['plant_pots', 33, -100, 0]])
      P(n, x, null, z, ry);
  }
  // stone/concrete plinths under buildings that stand on a slope (visible on the downhill side)
  plinths(list) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const im = new THREE.InstancedMesh(geo, this.mats.get('stone_wall'), list.length);
    const m = new THREE.Matrix4();
    list.forEach(([x0, x1, z, y, n], i) => {
      const w = (this.protos[n].box.max.x - this.protos[n].box.min.x) * (n.startsWith('house') ? 0.7 : 0.82);
      const front = x0 < 40 ? x1 - 0.25 : x0 + 0.25, back = x0 < 40 ? x0 + 0.3 : x1 - 0.3;
      m.compose(new THREE.Vector3((front + back) / 2, y - 1.25, z), new THREE.Quaternion(), new THREE.Vector3(Math.abs(front - back), 2.4, Math.min(w, 7.6)));
      im.setMatrixAt(i, m);
    });
    im.receiveShadow = true; im.castShadow = true; this.root.add(im);
    // box UVs are 0..1 per face: scale the stone texture via a dedicated material clone
    const mat = this.mats.get('concrete').clone(); mat.map = mat.map.clone(); mat.map.repeat.set(2, 0.6); mat.normalMap = mat.normalMap?.clone(); mat.normalMap?.repeat.set(2, 0.6);
    im.material = mat;
  }
  tint(r) {
    const k = 0.85 + r() * 0.25;
    return new THREE.Color(k, k * (0.97 + r() * 0.05), k * (0.92 + r() * 0.1));
  }
  terraces(r) {
    const houses = ['house_narrow', 'house_standard', 'house_twostory', 'house_hira', 'house_old', 'house_hipped', 'house_narrow', 'house_twostory'];
    TIERS.forEach((t, k) => {
      // keep alleys clear for the stairs that start behind this row, and for the path to the shrine stair
      const keep = (STAIRS[k + 1] || [[-12.5, -5.5]]).map(([a, b]) => [a - 1.2, b + 1.2]);
      let x = t.x0 + 1.5;
      const row = [];
      while (x < TIER_X1 - 3) {
        const n = houses[Math.floor(r() * houses.length)], b = this.protos[n].box, w = b.max.x - b.min.x;
        const x0 = x, x1 = x + w;
        const clash = keep.find(([a, c]) => x1 > a && x0 < c);
        if (clash) { x = clash[1] + 0.3; continue; }
        if (x1 > TIER_X1 - 0.5) break;
        const cx = (x0 + x1) / 2 - (b.max.x + b.min.x) / 2;
        const z = t.zf - 3.5 - b.max.z;
        this.put(n, cx, t.y, z, 0, { tint: this.tint(r) });
        row.push([x0, x1, z, b]);
        x = x1 + 0.6 + r() * 1.6;
      }
      // front gardens, bicycles, trees in the gaps between houses
      row.forEach(([x0, x1, z, b], i) => {
        const f = r();
        if (f < 0.4) this.put('hydrangea', x0 + 0.9, t.y, t.zf - 3.25, 0, { s: 0.8 });
        else if (f < 0.65) this.put('plant_pots', x1 - 1, t.y, t.zf - 3.3, 0);
        if (r() < 0.25) this.put('bicycle', x1 - 0.5, t.y, t.zf - 3.4, H + 0.2);
        const next = row[i + 1];
        if (next && next[0] - x1 > 1.6 && r() < 0.7) this.put(r() < 0.3 ? 'tree_sakura' : r() < 0.5 ? 'tree_pine' : 'tree_broadleaf', (x1 + next[0]) / 2, t.y, z - 2, r() * 6, { s: 0.55 + r() * 0.25 });
        else if (next && next[0] - x1 > 1.0) this.put('bush', (x1 + next[0]) / 2, t.y, z + 1, 0, { s: 0.7 });
      });
      // utility poles along every lane, with wires
      const poles = [];
      for (let px = t.x0 + 5; px < TIER_X1 - 2; px += 15) { this.put('utility_pole', px, t.y, t.zf - 0.4, 0); poles.push([px, t.zf - 0.4]); }
      this.poleLines.push(poles);
      this.put('street_light', t.x0 + 2, t.y, t.zf - 0.5, 0);
      this.put('tree_pine', t.x0 + 1.2, t.y, t.zf - 7, r() * 6, { s: 0.75 + r() * 0.3 });
    });
    // the top terrace's back garden: torii at the foot of the shrine stair, lanterns, trees, a bench
    const top = TIERS[6];
    this.put('torii', -9, top.y, -102, 0, { s: 0.85 });
    this.put('ishidoro', -12.4, top.y, -103, 0); this.put('ishidoro', -5.6, top.y, -103, 0);
    for (const [x, z] of [[-20, -99], [4, -100], [-34, -98], [16, -100], [-46, -100], [-28, -101]]) this.put(r() < 0.5 ? 'tree_sakura' : 'tree_broadleaf', x, top.y, z, r() * 6, { s: 0.9 });
    this.put('bench', -15, top.y, -97, 0); this.put('direction_sign', -4.5, top.y, -96.5, 0.4);
  }
  shrine(r) {
    const y = SHRINE.y, P = (n, x, z, ry = 0, o) => this.put(n, x, y, z, ry, o);
    P('torii', -9, -117.6, 0); P('shrine_hall', -9, -127.2, 0);
    P('ishidoro', -12.6, -120.5); P('ishidoro', -5.4, -120.5); P('ishidoro', -12.6, -124.5); P('ishidoro', -5.4, -124.5);
    P('komainu', -12.0, -122.6, H); P('komainu', -6.0, -122.6, -H);
    P('tree_shinboku', -21.5, -125.5, 0.4); P('tree_sakura', 3.5, -121, 0); P('tree_sakura', -24, -118.5, 1); P('tree_cedar', 4, -130, 0); P('tree_cedar', -25, -131, 0);
    P('bench', 0, -118.5, PI); P('direction_sign', -13.5, -117.5, 0.3);
    // stone lanterns along the long stair
    for (let z = -106; z >= -114; z -= 4) { this.put('ishidoro', -12.2, null, z, 0, { s: 0.8 }); this.put('ishidoro', -5.8, null, z, 0, { s: 0.8 }); }
  }
  hill(r) {
    const y = PLATEAU.y;
    this.lighthouse = this.clone('lighthouse', -124, y, -14, 0);
    this.collide('lighthouse', -124, y, -14, 0, 1, 19);
    this.spinners.push({ o: this.lighthouse.getObjectByName('lighthouse_lamp'), speed: 0.8 });
    this.put('azumaya', -100, y + 0.2, 3, 0, { col: [...FOOT.azumaya, [4.4, 0.15, 0, -2.25]] });
    this.put('telescope', -97.6, y, -3.2, H * 0.6); this.put('telescope', -97.6, y, -6.2, H * 0.6);
    this.put('info_board', -104, y, -8, PI * 0.25); this.put('bench', -112, y, 6.4, 0); this.put('bench', -98, y, -11, H);
    this.put('direction_sign', -95, y, -23, -0.6);
    // fences: white rail round the hilltop edge, log fence along the cliff path
    for (let x = PLATEAU.x0 + 1; x < PLATEAU.x1; x += 2.08) if (x < -104.5 || x > -95) this.put('fence_rail', x, y, PLATEAU.z1 - 0.3, 0);
    for (let z = PLATEAU.z0 + 1; z < PLATEAU.z1 - 1; z += 2.08) if (z < -27 || z > -19) this.put('fence_rail', PLATEAU.x1 - 0.3, y, z, H);
    for (let z = PLATEAU.z0 + 1; z < PLATEAU.z1; z += 2.08) this.put('fence_rail', PLATEAU.x0 + 0.3, y, z, H);
    for (let x = PLATEAU.x0 + 1; x < PLATEAU.x1; x += 2.08) this.put('fence_rail', x, y, PLATEAU.z0 + 0.3, 0);
    const c1 = PLATFORMS.find((p) => p.name === 'cliff1'), c2 = PLATFORMS.find((p) => p.name === 'cliff2');
    for (let x = c1.x0 + 7; x < c1.x1 - 1; x += 2.1) this.put('fence_log', x, platformY(c1, x, 0), c1.z1 - 0.3, 0);
    for (let z = c2.z0 + 7; z < c2.z1 - 1; z += 2.1) this.put('fence_log', c2.x1 - 0.3, platformY(c2, 0, z), z, H);
    for (const [x, z] of [[-134, 2], [-138, -30], [-110, -36], [-130, -36], [-102, -32], [-90, -60], [-90, -90], [-70, -112], [-50, -129]]) this.put('tree_pine_b', x, null, z, r() * 6, { s: 0.9 + r() * 0.3 });
    for (const [x, z] of [[-116, 4], [-136, -12]]) this.put('tree_pine', x, y, z, r() * 6);
  }
  east(r) {
    ['house_twostory', 'house_standard', 'house_hipped', 'house_old', 'house_hira', 'house_narrow'].forEach((n, i) => {
      const p = PLATFORMS.find((q) => q.name === 'east_pad' + (i + 1));
      this.put(n, (p.x0 + p.x1) / 2, p.y, (p.z0 + p.z1) / 2 + 1, 0, { tint: this.tint(r) });
      this.put('laundry_pole', p.x0 + 2, p.y, p.z0 + 1.2, 0.2);
      this.put('plant_pots', p.x1 - 1.5, p.y, p.z1 - 0.8, 0);
    });
    // the beach: rocks, a boat pulled up on the sand
    for (const [n, x, z, s] of [['rock_c', 118, 66, 1.4], ['rock_c', 104, 94, 1], ['rock_a', 92, 102, 1.2], ['rock_b', 110, 80, 1.3], ['rock_a', 70, 96, 1.5], ['rock_c', 66, 104, 1.3]]) this.put(n, x, null, z, r() * 6, { s });
    this.put('skiff', 86, null, 74, 2.2, { rz: 0.12 });
    // rocks and weed on the clear sea floor (seen through the water)
    for (let i = 0; i < 70; i++) {
      const x = -70 + r() * 125, z = 24 + r() * 90, h = this.at(x, z);
      if (h > -0.8 || this.ground.platformAt(x, z)) continue;
      this.put(['rock_a', 'rock_b', 'rock_b'][i % 3], x, h - 0.3, z, r() * 6, { s: 0.6 + r() * 1.1, col: false, pool: { lod: 40, cull: 300 }, shadow: false });
    }
    for (let i = 0; i < 40; i++) {
      const x = 66 + r() * 60, z = 70 + r() * 50, h = this.at(x, z);
      if (h > -0.3 || h < -6) continue;
      this.put(r() < 0.5 ? 'rock_a' : 'rock_c', x, h - 0.4, z, r() * 6, { s: 0.5 + r() * 0.8, col: false, pool: { lod: 40, cull: 300 }, shadow: false });
    }
    // coastal boulders below the lighthouse cliffs
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 1.2 + 0.2, x = -92 - Math.cos(a) * (30 + r() * 30) - 20, z = 18 + Math.sin(a) * 20 + r() * 12;
      const h = this.at(x, z); if (h > -2 && h < 3) this.put(['rock_a', 'rock_b', 'rock_c'][i % 3], x, h - 0.4, z, r() * 6, { s: 0.8 + r() * 1.2 });
    }
  }
  // ------------------------------------------------------------------ forest, grass and garden greenery on natural ground
  nature(r) {
    const g = this.ground, dens = this.q.trees;
    const nearPlat = (x, z, rad) => { for (const [dx, dz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]]) if (g.platformAt(x + dx, z + dz)) return true; return false; };
    const blocked = (x, z, rad) => this.colliders.some((c) => Math.abs(c.x - x) < rad + (c.hw || c.r || 0) + 2 && Math.abs(c.z - z) < rad + (c.hd || c.r || 0) + 2);
    const cand = [];
    for (let z = -430; z < 70; z += 6) for (let x = -480; x < 420; x += 6) {
      const jx = x + (r() - 0.5) * 5, jz = z + (r() - 0.5) * 5;
      const dTown = Math.hypot((jx + 20) / 1.4, jz + 40);
      if (dTown > 180 && r() > 0.3) continue;
      cand.push([dTown + r() * 60, jx, jz]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    let n = 0;
    for (const [, jx, jz] of cand) {
      if (n >= dens) break;
      const inBox = jx > G.x0 && jx < G.x1 && jz > G.z0 && jz < G.z1;
      const h = inBox ? g.natAt(jx, jz) : naturalRaw(jx, jz);
      if (h < 1.8) continue;
      const h2 = inBox ? g.natAt(jx + 2, jz) : naturalRaw(jx + 2, jz), h3 = inBox ? g.natAt(jx, jz + 2) : naturalRaw(jx, jz + 2);
      if (Math.hypot(h2 - h, h3 - h) / 2 > 0.9) continue;
      const f = fbm(jx * 0.012 + 3, jz * 0.012);
      if (f < 0.36) continue;
      if (inBox && (nearPlat(jx, jz, 3.5) || blocked(jx, jz, 1))) continue;
      const kind = h > 30 && f > 0.5 ? 'tree_cedar' : f > 0.62 ? 'tree_cedar' : (r() < 0.6 ? 'tree_broadleaf' : (h < 16 && r() < 0.55 ? 'tree_pine' : 'tree_cedar'));
      this.put(kind, jx, h - 0.2, jz, r() * 6.28, { s: 0.75 + r() * 0.6, col: inBox ? undefined : false, pool: { lod: 40, lod2: 100, cull: 1100 } });
      n++;
    }
    this.treeCount = n;
    // shrubs clinging to the steep slopes and cliffs, boulders on the steepest faces
    for (let i = 0, placed = 0; i < 9000 && placed < this.q.trees * 0.35; i++) {
      const x = G.x0 + r() * (G.x1 - G.x0), z = G.z0 + r() * (G.z1 - G.z0), h = g.natAt(x, z);
      if (h < 1.2 || g.platformAt(x, z)) continue;
      const sl = Math.hypot(g.natAt(x + 1.5, z) - h, g.natAt(x, z + 1.5) - h) / 1.5;
      if (sl < 0.75) continue;
      if (nearPlat(x, z, 2.5)) continue;
      const kind = sl > 2.2 && r() < 0.5 ? (r() < 0.5 ? 'rock_c' : 'rock_a') : r() < 0.15 ? 'tree_pine_b' : 'bush';
      this.put(kind, x, h - (kind.startsWith('rock') ? 1.0 : 0.3), z, r() * 6, { s: kind === 'bush' ? 1.1 + r() * 1.3 : 0.8 + r() * 0.6, col: false, pool: { lod: 50, cull: 600 } });
      placed++;
    }
    // grass tufts and bushes close to the town
    let gcount = 0;
    for (let i = 0; i < this.q.grass * 3 && gcount < this.q.grass; i++) {
      const x = G.x0 + r() * (G.x1 - G.x0), z = G.z0 + r() * (G.z1 - G.z0), h = g.natAt(x, z);
      if (h < 0.8 || g.platformAt(x, z) || fbm(x * 0.05, z * 0.05) < 0.4) continue;
      this.put(r() < 0.93 ? 'grass_tuft' : (r() < 0.5 ? 'bush' : 'hydrangea'), x, h - 0.05, z, r() * 6, { s: 0.8 + r() * 0.8, col: false, pool: { lod: 30, cull: 70 }, shadow: false });
      gcount++;
    }
  }
  // ------------------------------------------------------------------ power lines between poles (sagging wires)
  wires() {
    const pts = [], geo = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, fog: true });
    for (const line of this.poleLines || []) {
      for (let i = 0; i + 1 < line.length; i++) {
        const [x0, z0] = line[i], [x1, z1] = line[i + 1];
        const y0 = this.at(x0, z0), y1 = this.at(x1, z1);
        for (const [h, off] of [[9.7, -0.8], [9.7, 0.8], [9.0, 0.0]]) {
          const dir = new THREE.Vector3(x1 - x0, 0, z1 - z0).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x);
          const curve = new THREE.CatmullRomCurve3([...Array(9)].map((_, k) => {
            const t = k / 8; const p = new THREE.Vector3(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + h - Math.sin(t * Math.PI) * 0.7, z0 + (z1 - z0) * t);
            return p.addScaledVector(side, off);
          }));
          geo.push(new THREE.TubeGeometry(curve, 10, 0.018, 3, false));
        }
      }
    }
    if (!geo.length) return;
    const merged = mergeGeos(geo);
    const m = new THREE.Mesh(merged, mat); m.name = 'wires'; this.root.add(m);
  }
  // ------------------------------------------------------------------ people
  people(r) {
    const N = (name, x, z, ry, path) => {
      const y = this.at(x, z), o = this.clone(name, x, y, z, ry, true);
      const limbs = {}; for (const s of ['arm_l', 'arm_r', 'leg_l', 'leg_r']) limbs[s] = o.getObjectByName(`${name}_${s}`);
      const npc = { o, name, limbs, path, seg: 0, t: r() * 10, speed: 1.1 + r() * 0.3, idle: !path, r: 0.35 };
      this.npcs.push(npc); return npc;
    };
    N('fisherman', -46, 23.8, 0); N('fisherman', -10, 18.5, PI * 0.9); N('fisherman', 2, 9, PI, null);
    N('fisherman', -60, 6, 0, [[-60, 6], [-30, 14], [-12, 16], [-30, 14]]);
    N('fisherman', 30, 20, 0, [[30, 20], [30, 40], [30, 47], [30, 40]]);
    N('shopkeeper', 35.4, -10, H); N('shopkeeper', 35.4, -42, H); N('shopkeeper', 44.4, -28, -H); N('shopkeeper', 44.6, -57, -H);
    N('townsman', 39, -12, PI, [[39, -12], [39.5, -60], [40, -94], [39.5, -60]]);
    N('townsman', 41, -80, 0, [[41, -80], [41, -30], [42, -8], [41, -30]]);
    N('shopkeeper', -10, -16, 0, [[-30, -16], [10, -16]]);
    N('townsman', -40, -36, 0, [[-50, -36], [0, -36], [16, -36]]);
    N('townsman', -9, -118, 0); N('townsman', -110, 4, PI * 0.8);
    this.cats = [N('cat', -6, 17, 1), N('cat', 36, -50, 2), N('cat', -20, -36.5, 0.5)];
  }
  birds(r) {
    for (let i = 0; i < 12; i++) {
      const o = this.clone('seagull', 0, 20, 0, 0);
      this.gulls.push({ o, cx: -20 + r() * 80, cz: 30 + r() * 70, rad: 15 + r() * 30, h: 12 + r() * 20, sp: (0.18 + r() * 0.15) * (r() < 0.5 ? 1 : -1), ph: r() * 6,
        wl: o.getObjectByName('seagull_wing_l'), wr: o.getObjectByName('seagull_wing_r') });
    }
  }
  // ------------------------------------------------------------------ per frame
  // a few point lights follow the lamps nearest to the player in the evening and at night
  updateLights(player, glow, n) {
    const want = glow > 0.3 ? n : 0;
    while (this.lights.length < want) { const l = new THREE.PointLight(0xffc080, 0, 22, 1.5); this.scene.add(l); this.lights.push(l); }
    while (this.lights.length > want) this.scene.remove(this.lights.pop());
    if (!want) return;
    const near = this.lampSpots.map((s) => [s.p.distanceToSquared(player), s]).sort((a, b) => a[0] - b[0]).slice(0, want);
    this.lights.forEach((l, i) => {
      const s = near[i]?.[1]; if (!s) { l.intensity = 0; return; }
      l.position.copy(s.p); l.color.setHex(s.col); l.intensity = 14 * s.k * glow;
    });
  }
  update(dt, cam, player, lodScale) {
    this.lightT = (this.lightT || 0) - dt;
    if (this.lightT <= 0 && player) { this.updateLights(player, this.world.cur.glow, this.q.lights); this.lightT = 0.4; }
    this.pool.timer -= dt;
    if (this.pool.timer <= 0) { this.pool.update(cam, lodScale); this.pool.timer = 0.25; }
    const t = this.world.time;
    for (const b of this.boats) {
      const y = this.world.swell(b.x, b.z);
      b.o.position.y = y - 0.05; b.o.rotation.set(Math.sin(t * 0.8 + b.ph) * 0.025, b.ry + Math.sin(t * 0.13 + b.ph) * 0.01, Math.sin(t * 1.1 + b.ph) * 0.04);
      if (b.radar) b.radar.rotation.y += dt * 2.5;
    }
    for (const s of this.spinners) if (s.o) { if (s.speed) s.o.rotation.y += dt * s.speed; if (s.blink) s.o.visible = (t % 4) < 2.2; }
    for (const g of this.gulls) {
      const a = t * g.sp + g.ph;
      g.o.position.set(g.cx + Math.cos(a) * g.rad, g.h + Math.sin(t * 0.5 + g.ph) * 2, g.cz + Math.sin(a) * g.rad);
      g.o.rotation.set(0, -a + (g.sp > 0 ? PI : 0), (g.sp > 0 ? 1 : -1) * 0.25);
      const f = Math.sin(t * 7 + g.ph) * 0.5 * (0.5 + 0.5 * Math.sin(t * 0.7 + g.ph));
      if (g.wl) g.wl.rotation.z = f; if (g.wr) g.wr.rotation.z = -f;
    }
    for (const n of this.npcs) this.npc(n, dt, player);
  }
  npc(n, dt, player) {
    n.t += dt;
    const far = player && Math.hypot(player.x - n.o.position.x, player.z - n.o.position.z) > 90;
    n.o.visible = !far;
    if (far && !n.path) return;
    let moving = false;
    if (n.path) {
      const tgt = n.path[(n.seg + 1) % n.path.length], p = n.o.position;
      const dx = tgt[0] - p.x, dz = tgt[1] - p.z, d = Math.hypot(dx, dz);
      const pd = player ? Math.hypot(player.x - p.x, player.z - p.z) : 99;
      if (d < 0.3) n.seg = (n.seg + 1) % n.path.length;
      else if (pd > 1.1) {
        const sp = (n.name === 'cat' ? 0.8 : n.speed) * dt;
        p.x += dx / d * sp; p.z += dz / d * sp; moving = true;
        const want = Math.atan2(dx, dz); let da = want - n.o.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); n.o.rotation.y += da * Math.min(1, dt * 6);
      }
      p.y = this.at(p.x, p.z);
    }
    const L = n.limbs, sw = moving ? Math.sin(n.t * 7) * 0.6 : Math.sin(n.t * 1.5) * 0.05;
    if (L.leg_l) { L.leg_l.rotation.x = sw; L.leg_r.rotation.x = -sw; }
    if (L.arm_l) { L.arm_l.rotation.x = -sw * 0.8 + (moving ? 0 : 0.1); L.arm_r.rotation.x = sw * 0.8 + (moving || n.name !== 'fisherman' ? 0 : -0.6 + Math.sin(n.t * 2) * 0.25); }
  }
}

// leaf cards: normals point away from the centre of their crown (plus up), so a canopy shades like a soft volume
function canopyNormals(geo, matrix) {
  const P = geo.attributes.position, n = new Float32Array(P.count * 3), v = new THREE.Vector3(), c = new THREE.Vector3();
  const box = new THREE.Box3();
  for (let i = 0; i < P.count; i++) box.expandByPoint(v.fromBufferAttribute(P, i));
  box.getCenter(c); const size = box.getSize(new THREE.Vector3()); c.y -= size.y * 0.15;
  const inv = new THREE.Vector3(1 / Math.max(size.x, 1e-3), 1 / Math.max(size.y, 1e-3), 1 / Math.max(size.z, 1e-3));
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).sub(c).multiply(inv); v.y += 0.35; v.normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  const g = geo.clone(); g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  void matrix; return g;
}

// merge primitives that share a material (positions/normals baked through their matrices, UVs kept)
function bakeMerge(list) {
  let nv = 0, ni = 0;
  for (const pr of list) { nv += pr.geometry.attributes.position.count; ni += pr.geometry.index ? pr.geometry.index.count : pr.geometry.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3(); let ov = 0, oi = 0;
  for (const pr of list) {
    const g = pr.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    nm.getNormalMatrix(pr.matrix);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(pr.matrix); pos.set([v.x, v.y, v.z], (ov + i) * 3);
      if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (ov + i) * 3); }
      if (U) uv.set([U.getX(i), U.getY(i)], (ov + i) * 2);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi++] = g.index.getX(i) + ov; else for (let i = 0; i < P.count; i++) idx[oi++] = ov + i;
    ov += P.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

function mergeAttr(geos) {
  const out = new THREE.BufferGeometry();
  for (const key of ['position', 'color']) {
    const arrs = geos.map((g) => g.attributes[key].array), n = arrs.reduce((a, b) => a + b.length, 0), buf = new Float32Array(n);
    let o = 0; for (const a of arrs) { buf.set(a, o); o += a.length; }
    out.setAttribute(key, new THREE.BufferAttribute(buf, 3));
  }
  return out;
}

function mergeGeos(geos) {
  let n = 0, ni = 0; for (const g of geos) { n += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(n * 3), idx = new Uint32Array(ni); let o = 0, oi = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); for (let i = 0; i < g.index.count; i++) idx[oi++] = g.index.array[i] + o; o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setIndex(new THREE.BufferAttribute(idx, 1)); return m;
}
