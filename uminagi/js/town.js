// Places the Blender model kit (../uminagi-assets/glb) to build Uminagi: harbour, fish market, main street, terraced
// houses, shrine, cliff path, lighthouse hill, forest, props, people, boats and gulls. Static models are drawn with
// GPU instancing, grouped in 64 m cells (so whole cells are frustum-culled) with per-instance LOD switching.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ASSETS } from './materials.js';
import { QY, streetY, TIERS, STAIRS, TIER_X1, SHRINE, PLATEAU, PLATFORMS, platformY, fbm, naturalRaw, G, ISLAND, BRIDGE, TRAM, ROAD, HILL_ROAD, HILL_LANES, hillRoadY, TUNNEL } from './terrain.js';

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
    'propane', 'ishidoro', 'komainu', 'telescope', 'info_board', 'skiff', 'chochin_hanging', 'parasol', 'surfboards', 'kanban_shirasu', 'kanban_tako',
    'car_kei', 'car_kei_b', 'car_sedan', 'block_wall', 'guardrail', 'sign_stop', 'sign_speed', 'sign_noparking', 'curve_mirror', 'bus_stop', 'traffic_light'],
  nature: ['tree_pine', 'tree_pine_b', 'tree_broadleaf', 'tree_shinboku', 'tree_sakura', 'tree_cedar', 'bush', 'hydrangea', 'grass_tuft', 'rock_a', 'rock_b', 'rock_c', 'rock_cliff', 'flowers_a', 'flowers_b', 'flowers_c'],
  // animated (cloned)
  dynamic: ['fishing_boat', 'fishing_boat_b', 'sea_candle', 'lighthouse_red', 'shiba', 'yacht', 'yacht_sail', 'tonbi', 'enoden', 'eno_station', 'cat', 'seagull',
    // island life (js/life): animal villagers, tools, fruit trees, dig spots, message bottles
    'vil_cat', 'vil_rabbit', 'vil_bear', 'vil_penguin', 'vil_frog', 'vil_squirrel', 'vil_owl', 'vil_raccoon', 'tool_net', 'tool_rod', 'tool_shovel', 'fruit_tree', 'dig_spot', 'bottle_msg'],
  // home life (js/life/home.js): furniture, the room, hats... a missing one falls back to a stand-in
  optional: ['furn_table_wood', 'furn_chair_wood', 'furn_bed', 'furn_bookshelf', 'furn_lamp', 'furn_rug', 'furn_tansu', 'furn_kotatsu', 'furn_radio', 'furn_aquarium',
    'furn_log_stool', 'furn_log_bench', 'furn_fence_bamboo', 'furn_fence_white', 'furn_workbench', 'furn_mailbox', 'furn_pumpkin', 'furn_snowman', 'tool_axe', 'item_daikon',
    'sapling', 'hat_straw', 'hat_cap', 'hat_beanie', 'room_shell', 'museum_pedestal',
    'furn_zabuton', 'furn_byobu', 'furn_andon', 'furn_chabudai', 'furn_bonsai', 'furn_hibachi', 'furn_tatami', 'furn_kakejiku', 'furn_beach_chair', 'furn_ship_wheel',
    'furn_anchor', 'furn_buoy_lamp', 'furn_shell_lamp', 'furn_lifebuoy', 'furn_crab_plush', 'furn_lighthouse_model', 'furn_cafe_table', 'furn_cafe_chair', 'furn_counter',
    'furn_cake_stand', 'furn_monstera', 'furn_sofa', 'furn_desk', 'furn_tv_retro', 'furn_piano', 'furn_wardrobe', 'furn_mirror', 'furn_clock_tall', 'furn_toy_box', 'furn_teddy',
    'furn_guitar', 'furn_well', 'furn_planter', 'furn_swing', 'furn_birdhouse', 'furn_picnic_table', 'furn_campfire', 'furn_hammock', 'furn_mailbox_red', 'furn_easel', 'art_frame'],
};
// building footprints (model-local, before rotation): [w, d, cx, cz] boxes the player can't enter
const FOOT = {
  suisan_office: [[11.2, 9.2]], warehouse_wood: [[14.2, 10.2], [3.6, 10, 8.8, 0]], warehouse_tin: [[12.2, 9.2]], gear_shed: [[8, 4.5]],
  shop_general: [[7, 9]], shop_restaurant: [[7.5, 9]], shop_izakaya: [[6.5, 9]], shop_souvenir: [[7, 9]], shop_fish: [[8, 9]], shop_cafe: [[7, 9]], shop_sake: [[6, 8]],
  house_narrow: [[5.4, 7.7]], house_standard: [[8.2, 6.7], [2.4, 3, 5.2, -1.75]], house_twostory: [[9.2, 7.2]], house_hira: [[8.7, 6.7], [2, 3.2, 5.35, -1.65]],
  house_old: [[6.7, 6.2]], house_hipped: [[7.7, 7.7]], house_hillside: [[9, 9, 0, -1.5]], shrine_hall: [[7, 6.2]], azumaya: [[0.3, 0.3, -2.2, -2.2], [0.3, 0.3, 2.2, -2.2], [0.3, 0.3, -2.2, 2.2], [0.3, 0.3, 2.2, 2.2]],
  torii: [[0.6, 0.6, -1.75, 0], [0.6, 0.6, 1.75, 0]], sea_candle: [[10.4, 10.4]], lighthouse: [[5.8, 5.8], [4.1, 3.3, 3.6, -1.5]], lighthouse_red: [[3.4, 3.4]],
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
  constructor(scene, ground, matlib, world, quality, built = null) {
    this.built = built;   // districts standing (js/life/progress.js), null = all
    this.scene = scene; this.ground = ground; this.mats = matlib; this.world = world; this.q = quality;
    this.protos = {}; this.pool = new Pool(scene);
    this.colliders = []; this.mapRects = []; this.boats = []; this.npcs = []; this.gulls = []; this.spinners = [];
    this.lampSpots = []; this.lights = [];
    this.root = new THREE.Group(); this.root.name = 'town'; scene.add(this.root);
  }
  async load(onProgress) {
    const names = [...MODELS.buildings, ...MODELS.props, ...MODELS.nature, ...MODELS.dynamic, ...MODELS.optional];
    let done = 0;
    await Promise.all(names.map((n) => loader.loadAsync(ASSETS + 'glb/' + n + '.glb').then((g) => {
      this.protos[n] = this.proto(n, g.scene); onProgress?.(++done / names.length);
    }, (e) => { if (!MODELS.optional.includes(n)) throw e; onProgress?.(++done / names.length); })));
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
        else leafCol = this.mats.flatColor(pr.material).multiply(new THREE.Color(0.6, 0.66, 0.58));  // cards: crown shading darkens the texture
      }
    }
    if (leafBox.isEmpty()) leafBox.copy(box);
    const s = leafBox.getSize(new THREE.Vector3()), c = leafBox.getCenter(new THREE.Vector3());
    const parts = [];
    let canopy; const radial = [];
    if (name === 'tree_cedar') { canopy = new THREE.ConeGeometry(s.x * 0.42, s.y * 1.05, 8, 2); canopy.translate(c.x, c.y, c.z); }
    else {
      // one low-poly blob per leaf clump of the real crown, so far trees keep their clumpy silhouette
      const pts = [], v = new THREE.Vector3();
      for (const pr of prims) {
        if (!pr.material.alphaTest || pr.material.name.endsWith('_dark')) continue;
        const P = pr.geometry.attributes.position;
        for (let i = 0; i < P.count; i += 2) pts.push(v.fromBufferAttribute(P, i).applyMatrix4(pr.matrix).clone());
      }
      if (pts.length > 40) {
        const { cen, rad, cnt } = clumps(pts, Math.min(10, Math.max(3, Math.round(pts.length / 260))), 6);
        const blobs = [];
        for (let k = 0; k < cen.length; k++) {
          if (!cnt[k]) continue;
          const b = new THREE.IcosahedronGeometry(1, 0), BP = b.attributes.position, tt = new Float32Array(BP.count * 3);
          radial.push(...BP.array);  // smooth (radial) normals keep a 20-face blob looking round
          for (let i = 0; i < BP.count; i++) tt[i * 3] = THREE.MathUtils.smoothstep(BP.getY(i) * 0.75 + (cen[k].y - box.min.y) / Math.max(1e-3, s.y + leafBox.min.y - box.min.y) * 0.6, -0.35, 0.85);  // sunlit share, as in canopyNormals
          b.setAttribute('color', new THREE.BufferAttribute(tt, 3));
          b.scale(rad[k] * 0.78, rad[k] * 0.62, rad[k] * 0.78); b.translate(cen[k].x, cen[k].y, cen[k].z);
          blobs.push(b);
        }
        canopy = mergeAttr(blobs);
      } else { canopy = new THREE.IcosahedronGeometry(0.5, 1); canopy.scale(s.x * 0.95, s.y * 0.95, s.z * 0.95); canopy.translate(c.x, c.y, c.z); }
    }
    const trunk = new THREE.CylinderGeometry(s.x * 0.04, s.x * 0.06, leafBox.min.y + s.y * 0.2, 5, 1, true);
    trunk.translate(0, (leafBox.min.y + s.y * 0.2) / 2, 0);
    const cy0 = leafBox.min.y, cy1 = leafBox.max.y;
    for (const [g, col, leaf] of [[canopy.index ? canopy.toNonIndexed() : canopy, leafCol.clone().multiplyScalar(0.62), true], [trunk.toNonIndexed(), new THREE.Color(0.15, 0.11, 0.07), false]]) {
      const n = g.attributes.position.count, cc = new Float32Array(n * 3), P = g.attributes.position, T = g.attributes.color;
      for (let i = 0; i < n; i++) {
        if (!leaf) { cc.set([col.r, col.g, col.b], i * 3); continue; }
        const t = T ? T.getX(i) : THREE.MathUtils.smoothstep((P.getY(i) - cy0) / Math.max(1e-3, cy1 - cy0), 0.2, 0.95) * 0.7;
        cc.set([col.r * (CLUMP_COOL[0] + (CLUMP_WARM[0] - CLUMP_COOL[0]) * t), col.g * (CLUMP_COOL[1] + (CLUMP_WARM[1] - CLUMP_COOL[1]) * t), col.b * (CLUMP_COOL[2] + (CLUMP_WARM[2] - CLUMP_COOL[2]) * t)], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g.deleteAttribute('uv'); parts.push(g);
    }
    const geo = mergeAttr(parts); geo.computeVertexNormals();
    if (radial.length) { const N = geo.attributes.normal, t = new THREE.Vector3(); for (let i = 0; i < radial.length / 3; i++) { t.fromArray(radial, i * 3); t.y += 0.25; t.normalize(); N.setXYZ(i, t.x, t.y, t.z); } }
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
    const src = merge ? this.mergedScene(name, merge === 'tex') : this.protos[name].scene;
    const o = src.clone(true); o.name = name;
    o.position.set(x, y, z); o.rotation.y = ry; this.root.add(o);
    return o;
  }
  // a copy of an articulated model where every part node is a single vertex-coloured mesh (1 draw call per part)
  mergedScene(name, keepTex = false) {
    const p = this.protos[name], key = keepTex ? 'mergedTex' : 'merged';
    if (p[key]) return p[key];
    const root = new THREE.Group(), inv = new THREE.Matrix4();
    p.scene.updateMatrixWorld(true);
    // part nodes only: a group holding meshes, or a single mesh hanging straight off the model root
    // (the meshes inside a part are named <part>_1, _2... and must not become parts of their own)
    const nodes = []; p.scene.traverse((o) => {
      if (!o.name.startsWith(name + '_') || o.name.endsWith('_lod1')) return;
      if ((!o.isMesh && o.children.some((c) => c.isMesh)) || (o.isMesh && o.parent && !o.parent.name.startsWith(name + '_'))) nodes.push(o);
    });
    // mesh quantisation (optimize.sh) moves every part node to the centre of its mesh and gives it a scale, so the
    // joints are lost: bake each part into model space and put the pivot back where the joint is (shoulder / hip at
    // the top of an arm / leg, neck at the bottom of a head or ear, hips under the body, the inner edge of a wing)
    const rootInv = inv.copy(p.scene.matrixWorld).invert().clone(), bb = new THREE.Box3(), v = new THREE.Vector3();
    for (const n of nodes) {
      const prims = [];
      n.traverse((o) => { if (o.isMesh) prims.push({ geometry: o.geometry, material: o.material, matrix: rootInv.clone().multiply(o.matrixWorld) }); });
      const merged = (keepTex ? this.mergePlain(prims, false, true) : this.mergePlain(prims, true, false, true))
        .map((pr) => ({ geometry: pr.geometry.clone().applyMatrix4(pr.matrix), material: pr.material }));
      bb.makeEmpty(); for (const pr of merged) { pr.geometry.computeBoundingBox(); bb.union(pr.geometry.boundingBox); }
      const part = n.name.slice(name.length + 1), c = bb.getCenter(v.set(0, 0, 0)).clone();
      if (/^(arm|leg)_/.test(part)) c.y = bb.max.y - (bb.max.y - bb.min.y) * 0.08;
      else if (/^(head|ear_|body)/.test(part)) c.y = bb.min.y + (part === 'body' ? (bb.max.y - bb.min.y) * 0.15 : 0);
      else if (part === 'tail') { c.y = bb.min.y; c.z = bb.max.z; }
      else if (/^wing_/.test(part)) c.x = Math.abs(bb.min.x) < Math.abs(bb.max.x) ? bb.min.x : bb.max.x;
      const g = new THREE.Group(); g.name = n.name; g.position.copy(c);
      for (const pr of merged) { pr.geometry.translate(-c.x, -c.y, -c.z); pr.geometry.computeBoundingSphere(); const m = new THREE.Mesh(pr.geometry, pr.material); m.castShadow = true; g.add(m); }
      root.add(g);
    }
    return (p[key] = root);
  }
  // ------------------------------------------------------------------ build everything
  build() {
    const r = rng(7), on = (k) => this.has(k);
    // every district draws from its own random stream, so the town looks the same whichever districts stand
    const R = (k) => rng(7 + [...k].reduce((a, c) => a * 31 + c.charCodeAt(0), 0));
    if (on('harbour')) this.harbour(R('harbour')); if (on('street')) this.street(R('street')); if (on('houses')) this.terraces(R('terraces'));
    if (on('shrine')) this.shrine(R('shrine')); if (on('hill')) this.hill(R('hill')); this.east(R('east'));
    if (on('island')) this.islandBridge(R('island')); if (on('tram')) this.tramLine(R('tram'));
    if (on('roads')) { this.roads(R('roads')); this.roadFurniture(R('furniture')); } if (on('houses')) this.hillside(R('hillside'));
    this.nature(r); this.wires(); if (on('houses') || on('street')) this.people(r); this.birds(r); this.flowerBeds();
    this.pool.finalize();
  }
  has(k) { return !this.built || this.built.has(k); }
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
    // working clutter heaped on the apron: stacks of fish crates, styrofoam, pallets, traps, nets, floats (lanes kept clear)
    const zones = [[14, 24, 8, 15], [-37, -19, 8, 15], [-74, -52, 7, 15], [-16, 12, 15, 17.2]], kinds = ['crates_blue', 'crates_blue', 'styro_boxes', 'styro_boxes', 'pallet', 'crab_traps', 'floats', 'net_pile', 'rope_coil'];
    const free = (x, z, rad) => !this.colliders.some((c) => Math.abs(c.x - x) < rad + (c.hw || c.r || 0) + 0.3 && Math.abs(c.z - z) < rad + (c.hd || c.r || 0) + 0.3);
    let nc = 0;
    for (let i = 0; i < 900 && nc < Math.round(46 * Math.min(1, this.q.lod / 0.85)); i++) {
      const [x0, x1, z0, z1] = zones[i % zones.length], x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
      const n = kinds[Math.floor(r() * kinds.length)], rad = n === 'net_pile' || n === 'crab_traps' ? 1.5 : 0.8;
      if (!free(x, z, rad)) continue;
      P(n, x, QY, z, (r() < 0.7 ? Math.round(r() * 4) * H : r() * 6) + (r() - 0.5) * 0.1); nc++;
    }
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
      ['fishing_boat_b', 25.4, 33, 0], ['fishing_boat', 33.0, 34, 0.02], ['fishing_boat', 49.8, 52, PI], ['fishing_boat_b', 50.1, 70, PI],
      // moored alongside the main quay, bows alternating (the concept's crowded quay)
      ['fishing_boat', -66, 24.4, H], ['fishing_boat_b', -30, 24.4, -H], ['fishing_boat', 9, 24.4, -H], ['fishing_boat_b', 43, 24.4, H]];
    // yacht marina: white yachts moored south of the T-pier and along the east quay
    for (const [x, z, ry] of [[23, 54, PI], [27, 54, PI], [31, 54, PI], [35, 54, PI], [48.6, 30, 0], [48.6, 40, 0], [48.6, 84, PI]]) boats.push(['yacht', x, z, ry]);
    for (const [n, x, z, ry] of boats) {
      const o = this.clone(n, x, 0, z, ry, 'tex');   // merged per part and material: textures kept, far fewer draw calls
      this.boats.push({ o, x, z, ry, ph: r() * 10, radar: o.getObjectByName(n + '_radar') });
      this.colliders.push({ type: 'b', x, z, hw: n === 'yacht' ? 1.5 : 2.0, hd: n === 'fishing_boat' ? 7 : n === 'yacht' ? 4.5 : 6, c: Math.cos(ry), s: Math.sin(ry), y0: -2, y1: n === 'yacht' ? 2.4 : 6 });
    }
    this.sailers = [];
    for (let i = 0; i < 5; i++) this.sailers.push({ o: this.clone('yacht_sail', 0, 0, 0, 0, 'tex'), cx: -200 + r() * 450, cz: 220 + r() * 300, rad: 60 + r() * 90, sp: (0.012 + r() * 0.01) * (r() < 0.5 ? 1 : -1), ph: r() * 6 });
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
      ['street_lantern', 26, -99, 0], ['street_lantern', 54, -99, 0], ['tree_sakura', 52, -114, 0], ['tree_broadleaf', 28, -116, 0], ['vending_machine', 25.2, -104, H], ['plant_pots', 33, -100, 0]])
      P(n, x, null, z, ry);
    // the big torii at the foot of the street: the approach (参道) up to the shrine, as on Enoshima
    P('torii', 40, null, -8.5, 0, { s: 2.1 });
    // a busier shopping street: banners, signboards, goods out front, potted plants, bicycles on both pavements
    const W = [34.9, H], E = [45.1, -H], goods = ['styro_boxes', 'crates_blue', 'plant_pots', 'kanban_shirasu', 'kanban_tako', 'nobori', 'nobori', 'bicycle', 'plant_pots', 'a_frame_sign', 'kanban_shirasu'];
    for (let z = -12; z >= -92; z -= 3.3 + r() * 2.2) for (const [x, ry] of [W, E]) {
      if (r() < 0.25) continue;
      const n = goods[Math.floor(r() * goods.length)], dx = (x < 40 ? 1 : -1) * (n === 'nobori' ? 0.9 : 0.35);
      if (this.colliders.some((c) => Math.abs(c.x - (x + dx)) < 0.9 + (c.hw || c.r || 0) && Math.abs(c.z - z) < 0.9 + (c.hd || c.r || 0))) continue;
      P(n, x + dx, null, z, ry + (n === 'bicycle' ? 0.25 : 0), { col: n === 'nobori' || n === 'plant_pots' ? false : undefined });
    }
    // festival lantern strings across the street
    this.lanternLines = [];
    for (let z = -14; z >= -90; z -= 9) {
      const y = streetY(z) + 5.4; this.lanternLines.push([34.6, 45.4, z, y]);
      for (let k = 0; k < 5; k++) { const x = 36 + k * 2, sag = Math.sin((x - 34.6) / 10.8 * Math.PI) * 0.45; P('chochin_hanging', x, y - sag - 0.95, z, H, { col: false, shadow: false }); }
    }
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
        // a concrete block wall (ブロック塀) between the lane and each house, with a gap for the gate
        const gate = x0 + 1.2 + r() * Math.max(0.1, x1 - x0 - 3.6);
        for (let wx = x0 + 1; wx < x1 - 0.2; wx += 2) if (Math.abs(wx - gate - 0.7) > 1.6) this.put('block_wall', wx, t.y, t.zf - 3.2, 0, { col: [[2, 0.14]] });
        if (r() < 0.45) this.put(r() < 0.5 ? 'plant_pots' : 'hydrangea', gate + 0.7, t.y, t.zf - 3.3, 0, { s: 0.7, col: false });
        if (r() < 0.25) this.put('bicycle', x1 - 0.6, t.y, t.zf - 2.55, H + 0.15);
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
    // the observation lighthouse on the hilltop, in the spirit of Enoshima's Sea Candle
    this.lighthouse = this.clone('sea_candle', -124, y, -14, 0);
    this.collide('sea_candle', -124, y, -14, 0, 1, 39.8);
    this.spinners.push({ o: this.lighthouse.getObjectByName('sea_candle_lamp'), speed: 0.8 });
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
    // greenery round the hilltop: trees and shrubs inside the fence line (the concept's wooded headland)
    for (let i = 0; i < 26; i++) {
      const side = i % 4, t = r();
      const x = side === 0 ? PLATEAU.x0 + 2 + r() * 3 : side === 1 ? PLATEAU.x1 - 3 - r() * 2 : PLATEAU.x0 + 4 + t * (PLATEAU.x1 - PLATEAU.x0 - 8);
      const z = side < 2 ? PLATEAU.z0 + 4 + t * (PLATEAU.z1 - PLATEAU.z0 - 8) : side === 2 ? PLATEAU.z0 + 2 + r() * 3 : PLATEAU.z1 - 2.5 - r() * 1.5;
      if (Math.hypot(x + 124, z + 14) < 8 || Math.hypot(x + 100, z - 3) < 6 || (x > -106 && x < -94 && z > -12 && z < 8)) continue;
      const k = r(); this.put(k < 0.35 ? 'tree_pine' : k < 0.55 ? 'tree_broadleaf' : k < 0.65 ? 'hydrangea' : 'bush', x, y, z, r() * 6, { s: k < 0.55 ? 0.7 + r() * 0.4 : 1 + r() * 0.8, col: k < 0.55 ? undefined : false });
    }
  }
  east(r) {
    // the beach: rocks, a boat pulled up on the sand
    for (const [n, x, z, s] of [['rock_c', 118, 66, 1.4], ['rock_c', 104, 94, 1], ['rock_a', 92, 102, 1.2], ['rock_b', 110, 80, 1.3], ['rock_a', 70, 96, 1.5], ['rock_c', 66, 104, 1.3]]) this.put(n, x, null, z, r() * 6, { s });
    if (this.has('beach')) this.put('skiff', 86, null, 74, 2.2, { rz: 0.12 });
    // a summer beach: parasols with towels, surfboard racks
    if (this.has('beach')) for (const [x, z] of [[80, 46], [86, 52], [92, 44], [98, 52], [104, 46], [110, 54], [84, 60], [96, 62], [108, 64], [116, 58]]) {
      const y = this.at(x, z); if (y > 0.2 && y < 3) this.put('parasol', x, y, z, r() * 6, { col: false });
    }
    if (this.has('beach')) for (const [x, z, ry] of [[76, 38, 0.3], [102, 38, -0.2], [118, 46, -0.6]]) { const y = this.at(x, z); if (y > 0.2) this.put('surfboards', x, y, z, ry); }
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
  // ------------------------------------------------------------------ the island and its bridge (like Enoshima)
  islandBridge(r) {
    const B = BRIDGE, bx = (B.x0 + B.x1) / 2, boxes = [];   // [material, cx, cy, cz, sx, sy, sz]
    // piers standing on the sea floor, edge beams, railings
    for (let z = B.z0 + 11; z <= B.z1 - 10; z += 9) {
      const floor = Math.min(-1, naturalRaw(bx, z));
      boxes.push(['concrete', bx, (floor + B.y - 0.35) / 2, z, 4.6, B.y - 0.35 - floor, 1.1]);
      boxes.push(['concrete', bx, B.y - 0.55, z, 5.6, 0.5, 1.6]);
    }
    for (const sx of [-1, 1]) {
      const x = sx < 0 ? B.x0 - 0.12 : B.x1 + 0.12;
      boxes.push(['concrete', x, B.y - 0.35, (B.z0 + B.z1) / 2, 0.35, 0.75, B.z1 - B.z0 - 12]);       // edge beam
      for (let z = B.z0 + 7; z <= B.z1 - 7; z += 2) boxes.push(['white', x, B.y + 0.5, z, 0.08, 1.0, 0.08]);   // posts
      boxes.push(['white', x, B.y + 1.02, (B.z0 + B.z1) / 2, 0.12, 0.08, B.z1 - B.z0 - 14]);            // top rail
      boxes.push(['white', x, B.y + 0.55, (B.z0 + B.z1) / 2, 0.05, 0.05, B.z1 - B.z0 - 14]);            // mid rail
    }
    this.boxMeshes(boxes, 'bridge');
    for (let z = B.z0 + 14; z <= B.z1 - 12; z += 18) { this.put('street_light', B.x0 - 0.35, B.y, z, H, { col: false }); this.put('street_light', B.x1 + 0.35, B.y, z + 9, -H, { col: false }); }
    // the island: a little shrine at the top (facing the bridge), lanterns, a lookout, trees and a rocky shore
    const I = ISLAND, top = this.at(I.x, I.z - 3);
    this.put('shrine_hall', I.x, this.at(I.x, I.z + 3), I.z + 3, PI, { s: 0.8 });
    this.put('torii', I.x, this.at(I.x, I.z - 6), I.z - 6, PI, { s: 0.9 });
    for (const dx of [-2.6, 2.6]) this.put('ishidoro', I.x + dx, this.at(I.x + dx, I.z - 3.5), I.z - 3.5, PI, { s: 0.8 });
    this.put('bench', I.x - 7, this.at(I.x - 7, I.z - 2), I.z - 2, H); this.put('telescope', I.x + 8, this.at(I.x + 8, I.z + 4), I.z + 4, -H);
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2, rr = I.r * (0.25 + r() * 0.7), x = I.x + Math.cos(a) * rr, z = I.z + Math.sin(a) * rr / 1.15;
      if (Math.abs(x - I.x) < 3.5 && z < I.z) continue;                                   // keep the path from the bridge up to the shrine
      if (Math.hypot(x - I.x, z - I.z) < 9) continue;
      const h = this.at(x, z); if (h < 1.5) continue;
      const k = r(); this.put(k < 0.4 ? 'tree_pine_b' : k < 0.75 ? 'tree_broadleaf' : k < 0.85 ? 'tree_sakura' : 'bush', x, h - 0.2, z, r() * 6, { s: 0.7 + r() * 0.5 });
    }
    for (let i = 0; i < 28; i++) {
      const a = r() * Math.PI * 2, x = I.x + Math.cos(a) * I.r * (0.98 + r() * 0.15), z = I.z + Math.sin(a) * I.r * (0.98 + r() * 0.15) / 1.15;
      if (Math.abs(x - bx) < 5 && z < I.z) continue;
      this.put(['rock_c', 'rock_a', 'rock_b'][i % 3], x, this.at(x, z) - 0.8, z, r() * 6, { s: 1 + r() * 1.4, col: false });
    }
  }
  // ------------------------------------------------------------------ the coastal tram (in the spirit of the Enoden)
  tramLine(r) {
    const T = TRAM, zc = (T.z0 + T.z1) / 2, yAt = (x) => T.y0 + (T.y1 - T.y0) * (x - T.x0) / (T.x1 - T.x0), boxes = [];
    const slope = Math.atan2(T.y1 - T.y0, T.x1 - T.x0);
    for (let x = T.x0 + 0.4; x < T.x1; x += 0.7) boxes.push(['wood_dark', x, yAt(x) + 0.06, zc, 0.22, 0.12, 2.3]);   // sleepers
    for (const dz of [-0.72, 0.72]) for (let x = T.x0; x < T.x1 - 0.1; x += 6) {
      const x1 = Math.min(T.x1, x + 6); boxes.push(['steel_dark', (x + x1) / 2, yAt((x + x1) / 2) + 0.17, zc + dz, x1 - x, 0.12, 0.08, slope]);
    }
    // catenary: poles with an arm over the track, and the contact wire
    for (let x = T.x0 + 4; x < T.x1; x += 12) {
      boxes.push(['steel_dark', x, yAt(x) + 3.2, T.z0 - 0.4, 0.18, 6.4, 0.18]);
      boxes.push(['steel_dark', x, yAt(x) + 6.2, zc - 1.2, 0.1, 0.1, 3.2]);
    }
    boxes.push(['black', (T.x0 + T.x1) / 2, (yAt(T.x0) + yAt(T.x1)) / 2 + 5.5, zc, T.x1 - T.x0, 0.03, 0.03, slope]);
    this.boxMeshes(boxes, 'tram_track');
    const st = PLATFORMS.find((p) => p.name === 'tram_station');
    this.station = this.clone('eno_station', 78, st.y, (st.z0 + st.z1) / 2 + 0.2, PI, 'tex');
    this.collide('eno_station', 78, st.y, (st.z0 + st.z1) / 2 + 0.2, PI, 1, 3, [[0.4, 0.4, -5.5, 0.9], [0.4, 0.4, 0, 0.9], [0.4, 0.4, 5.5, 0.9], [0.4, 0.4, -5.5, -0.9], [0.4, 0.4, 0, -0.9], [0.4, 0.4, 5.5, -0.9]]);
    // the train: two cars coupled back to back, shuttling between the station and the far end of the line
    const cars = [this.clone('enoden', 0, 0, 0, H, 'tex'), this.clone('enoden', 0, 0, 0, -H, 'tex')];
    const cols = cars.map(() => { const c = { type: 'b', x: 0, z: zc, hw: 1.3, hd: 6.2, c: Math.cos(H), s: Math.sin(H), y0: 0, y1: 0 }; this.colliders.push(c); return c; });
    this.tram = { cars, cols, a: 78, b: T.x1 - 13, x: 78, from: 78, to: T.x1 - 13, t: 0, wait: 4, yAt, zc };
  }
  // ------------------------------------------------------------------ road markings and gutters (real-world street look)
  roads(r) {
    const B = [], line = 0.15, th = 0.02, ss = -Math.atan((streetY(-6) - streetY(-96)) / 90);
    const rY = (x) => ROAD.y0 + (ROAD.y1 - ROAD.y0) * (x - ROAD.x0) / (ROAD.x1 - ROAD.x0), rs = Math.atan((ROAD.y1 - ROAD.y0) / (ROAD.x1 - ROAD.x0));
    // shopping street: solid edge lines, concrete gutter lids along both sides, two zebra crossings
    for (let z = -8; z > -95; z -= 2) {
      const zc = z - 1;
      for (const x of [37.25, 42.75]) B.push(['road_paint', x, streetY(zc) + 0.03, zc, line, th, 2.0, 0, ss]);
      for (const x of [36.8, 43.2]) B.push(['gutter', x, streetY(zc) + 0.05, zc, 0.38, 0.03, 0.96, 0, ss], ['gutter', x, streetY(zc - 0.98) + 0.05, zc - 0.98, 0.38, 0.03, 0.96, 0, ss]);
    }
    for (const zc of [-20, -62]) for (let x = 37.7; x < 42.6; x += 0.9) B.push(['road_paint', x, streetY(zc) + 0.032, zc, 0.45, th, 3.0, 0, ss]);
    // residential lanes: white edge lines on both sides
    for (const t of TIERS) for (let x = t.x0 + 0.6; x < TIER_X1 - 0.6; x += 2) {
      const len = Math.min(2, TIER_X1 - 0.6 - x);
      for (const z of [t.zf - 0.3, t.zf - 2.7]) B.push(['road_paint', x + len / 2, t.y + 0.03, z, len, th, 0.12]);
    }
    // coastal road: edge lines, a dashed centre line, two crossings
    for (let x = ROAD.x0 + 0.5; x < ROAD.x1 - 0.5; x += 2.5) {
      const xc = x + 1.25;
      for (const z of [ROAD.z0 + 0.35, ROAD.z1 - 0.35]) B.push(['road_paint', xc, rY(xc) + 0.012, z, 2.5, th, line, rs]);
      if (Math.floor((x - ROAD.x0) / 2.5) % 3 === 0) B.push(['road_paint', xc, rY(xc) + 0.012, (ROAD.z0 + ROAD.z1) / 2, 2.5, th, line, rs]);
    }
    for (const xc of [80, 97]) for (let z = ROAD.z0 + 0.9; z < ROAD.z1 - 0.6; z += 0.9) B.push(['road_paint', xc, rY(xc) + 0.014, z, 4.0, th, 0.45, rs]);
    // plaza road edge lines
    for (let x = 43.5; x < 55.5; x += 2) for (const z of [-100.8, -107.2]) B.push(['road_paint', x + 1, streetY(-100) + 0.03, z, 2.0, th, 0.15]);
    // harbour roads across the apron (from the coast road north to the hill road, and west to the shopping street)
    for (let z = 12; z > -2; z -= 2) {
      for (const x of [55.3, 61.7]) B.push(['road_paint', x, QY + 0.012, z - 1, 0.15, th, 2.0]);
      if (Math.round(z / 2) % 3 === 0) B.push(['road_paint', 58.5, QY + 0.012, z - 1, 0.15, th, 2.0]);
    }
    for (let x = 44; x < 54; x += 2) {
      for (const z of [-1.4, -7.6]) B.push(['road_paint', x + 1, QY + 0.012, z, 2.0, th, 0.15]);
      if (Math.round(x / 2) % 3 === 0) B.push(['road_paint', x + 1, QY + 0.012, -4.5, 2.0, th, 0.15]);
    }
    B.push(['road_paint', 44.2, QY + 0.012, -6.05, 0.4, th, 3.1]);   // stop line before the shopping street
    // hill road and lanes: edge lines
    const HR = HILL_ROAD, hs = -Math.atan((HR.y0 - HR.y1) / (HR.z1 - HR.z0));
    for (let z = HR.z1 - 1; z > HR.z0 + 1; z -= 2) for (const x of [HR.x0 + 0.3, HR.x1 - 0.3]) {
      const zc = z - 1; if (x > 59 && HILL_LANES.some((l) => Math.abs(zc - l) < 3)) continue;
      B.push(['road_paint', x, hillRoadY(zc) + 0.012, zc, 0.12, th, 2.0, 0, hs]);
    }
    for (const [k, zc] of HILL_LANES.entries()) {
      const L = PLATFORMS.find((p) => p.name === 'hill_lane' + (k + 1)), ls = Math.atan((L.ramp[4] - L.ramp[3]) / 44);
      for (let x = L.x0 + 1; x < L.x1 - 1; x += 2) for (const z of [zc - 1.7, zc + 1.7]) B.push(['road_paint', x + 1, platformY(L, x + 1, zc) + 0.012, z, 2, th, 0.12, ls]);
    }
    // the tunnel at the east end of the coast: a concrete box tunnel through the cut in the headland, a portal face,
    // dark inside, and the hillside filled back over its roof
    const ty = rY(ROAD.x1), Tn = TUNNEL, zc2 = (Tn.z0 + Tn.z1) / 2, w = Tn.z1 - Tn.z0, L = Tn.x1 - Tn.x0, xm = (Tn.x0 + Tn.x1) / 2;
    B.push(['concrete', Tn.x0 + 0.5, ty + 4.3, Tn.z0 - 0.9, 1.4, 9.0, 1.8], ['concrete', Tn.x0 + 0.5, ty + 4.3, Tn.z1 + 0.9, 1.4, 9.0, 1.8],
      ['concrete', Tn.x0 + 0.5, ty + 7.9, zc2, 1.4, 1.8, w + 3.6], ['concrete', Tn.x0 + 0.3, ty + 9.0, zc2, 1.9, 0.5, w + 5]);   // portal frame and parapet
    B.push(['concrete', xm, ty + 3.6, Tn.z0 - 0.6, L, 8.0, 1.2], ['concrete', xm, ty + 3.6, Tn.z1 + 0.6, L, 8.0, 1.2], ['concrete', xm, ty + 7.6, zc2, L, 0.8, w + 2.4]);
    B.push(['hill_fill', xm + 1, ty + 8 + 9, zc2, L + 2, 18, w + 3.0]);
    for (const [za, zb] of [[TRAM.z1, ROAD.z0], [Tn.z0 - 1.5, TRAM.z0], [ROAD.z1, Tn.z1 + 1.5]]) B.push(['hill_fill', 117.2, rY(117) - 1.2, (za + zb) / 2, 18.4, 2.2, zb - za]);   // ground in the cut between the tram and the road                                // earth back over the roof
    B.push(['tunnel_dark', xm, ty + 3.0, Tn.z0 + 0.1, L, 7, 0.2], ['tunnel_dark', xm, ty + 3.0, Tn.z1 - 0.1, L, 7, 0.2], ['tunnel_dark', xm, ty + 6.6, zc2, L, 0.2, w],
      ['tunnel_dark', Tn.x1 - 0.2, ty + 3.0, zc2, 0.3, 7, w], ['asphalt', (158 + Tn.x1) / 2, ty - 0.1, zc2, Tn.x1 - 158, 0.2, w]);
    // inside: sodium lamps along both walls (the far part is left dark), a walkway kerb, the no-pedestrians barrier
    for (let x = Tn.x0 + 3; x < 156; x += 4) for (const z of [Tn.z0 + 0.25, Tn.z1 - 0.25]) B.push(['tunnel_lamp', x, ty + 5.4, z, 1.2, 0.18, 0.12]);
    B.push(['concrete', (Tn.x0 + 150) / 2, ty + 0.1, Tn.z1 - 0.6, 150 - Tn.x0, 0.2, 1.2]);
    for (const zz of [Tn.z1 - 0.6, Tn.z0 + 1.0]) B.push(['rd_orange', 150, ty + 0.55, zz, 0.15, 1.1, 0.15]);
    B.push(['road_paint', 150, ty + 1.0, (Tn.z0 + Tn.z1) / 2, 0.12, 0.12, w - 1.0], ['rd_orange', 150, ty + 0.75, (Tn.z0 + Tn.z1) / 2, 0.1, 0.1, w - 1.0]);
    this.colliders.push({ type: 'b', x: 150, z: zc2, hw: 0.2, hd: w / 2, c: 1, s: 0, y0: ty - 1, y1: ty + 3 },
      { type: 'b', x: xm, z: Tn.z0 - 0.6, hw: L / 2, hd: 0.6, c: 1, s: 0, y0: ty - 1, y1: ty + 8 }, { type: 'b', x: xm, z: Tn.z1 + 0.6, hw: L / 2, hd: 0.6, c: 1, s: 0, y0: ty - 1, y1: ty + 8 });
    this.boxMeshes(B, 'road_marks');
  }
  // static decorative boxes merged per material (bridge structure, track, markings): [mat, cx, cy, cz, sx, sy, sz, rotZ?, rotX?]
  boxMeshes(list, name) {
    const by = new Map(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    // long boxes (road lines, kerbs, railings) are cut into pieces of at most 4 m so they follow the curved-world bend
    const o = new THREE.Vector3();
    for (const b of list) {
      const [mat, x, y, z, sx, sy, sz, rz = 0, rx = 0] = b, nx = Math.ceil(sx / 4), nz = Math.ceil(sz / 4);
      if (!by.has(mat)) by.set(mat, []);
      if (nx * nz === 1) { by.get(mat).push(b); continue; }
      e.set(rx, 0, rz);
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
        o.set((i + 0.5) / nx * sx - sx / 2, 0, (k + 0.5) / nz * sz - sz / 2).applyEuler(e);
        by.get(mat).push([mat, x + o.x, y + o.y, z + o.z, sx / nx, sy, sz / nz, rz, rx]);
      }
    }
    for (const [mat, items] of by) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.roadMat(mat), items.length);
      items.forEach(([, x, y, z, sx, sy, sz, rz = 0, rx = 0], i) => { m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rx, 0, rz)), new THREE.Vector3(sx, sy, sz)); im.setMatrixAt(i, m); });
      const flat = mat === 'road_paint' || mat === 'gutter' || mat === 'tunnel_dark' || mat === 'tunnel_lamp';
      im.castShadow = !flat; im.receiveShadow = true; im.name = name; this.root.add(im);
    }
  }
  // signs, mirrors, guardrails, a bus stop, a signal, parked cars and traffic on the coastal road
  roadFurniture(r) {
    if (!this.protos.car_kei) return;
    const P = (...a) => this.put(...a), rY = (x) => ROAD.y0 + (ROAD.y1 - ROAD.y0) * (x - ROAD.x0) / (ROAD.x1 - ROAD.x0);
    // residential lanes: a stop sign where each lane meets the alley down to the street, curve mirrors at the corners
    TIERS.forEach((t, k) => {
      P('sign_stop', TIER_X1 - 1.0, t.y, t.zf - 3.0, -H, { col: [[0.2, 0.2]] });
      if (k % 2 === 0) P('curve_mirror', TIER_X1 - 0.5, t.y, t.zf - 0.25, -H * 0.5, { col: [[0.2, 0.2]] });
      if (k % 3 === 1) P('sign_noparking', t.x0 + 6, t.y, t.zf - 0.25, PI, { col: [[0.2, 0.2]] });
    });
    // shopping street: speed limit at the foot, no-parking signs
    P('sign_speed', 35.0, null, -9.5, 0, { col: [[0.2, 0.2]] }); P('sign_speed', 45.0, null, -92, PI, { col: [[0.2, 0.2]] });
    P('sign_noparking', 34.95, null, -40, H, { col: [[0.2, 0.2]] }); P('sign_noparking', 45.05, null, -76, -H, { col: [[0.2, 0.2]] });
    // coastal road: guardrail on the beach side (gaps at the crossings), signs, bus stops, signals at the crossing
    for (let x = ROAD.x0 + 3; x < ROAD.x1 - 2; x += 4) if (Math.abs(x - 80) > 4 && Math.abs(x - 97) > 4) P('guardrail', x, rY(x), ROAD.z1 + 0.25, 0, { col: [[4, 0.2]] });
    P('sign_speed', 67, rY(67), ROAD.z0 - 0.4, -H, { col: [[0.2, 0.2]] }); P('sign_speed', 123, rY(123), ROAD.z1 + 0.6, H, { col: [[0.2, 0.2]] });
    P('bus_stop', 106, rY(106), ROAD.z0 - 0.9, 0, { col: [[0.4, 0.4, 0, 0]] }); P('bus_stop', 72, rY(72), ROAD.z1 + 1.2, PI, { col: [[0.4, 0.4, 0, 0]] });
    // the crossing signal: two heads (one per direction) that cycle green -> yellow -> red; the walker shows green on red
    const lampMat = (on, off, e) => { const m = new THREE.MeshStandardMaterial({ color: off, emissive: e, emissiveIntensity: 0, roughness: 0.25 }); m.userData = { on, off }; return m; };
    this.signal = { t: 0, state: 'green', m: { g: lampMat(0x1affc0, 0x041410, 0x22ffcc), y: lampMat(0xffb000, 0x140c02, 0xffaa00), r: lampMat(0xff1008, 0x150302, 0xff1a08), pr: lampMat(0xff1008, 0x150302, 0xff1a08), pg: lampMat(0x1affc0, 0x041410, 0x22ffcc) }, x: 97 };
    const swap = { rd_sig_off_g: 'g', rd_sig_off_y: 'y', rd_sig_red: 'r', rd_sig_off_r: 'pr', rd_sig_green: 'pg' };
    for (const [x, z, ry] of [[99.5, ROAD.z0 - 0.5, 0], [94.5, ROAD.z1 + 0.6, PI]]) {
      const o = this.clone('traffic_light', x, rY(x), z, ry);
      o.traverse((m) => { if (m.isMesh && swap[m.material.name]) m.material = this.signal.m[swap[m.material.name]]; });
      this.collide('traffic_light', x, rY(x), z, ry, 1, 5, [[0.3, 0.3]]);
    }
    this.setSignal('green');
    // a small car park on the harbour apron, with painted bays
    const bays = [], cars = ['car_kei', 'car_kei_b', 'car_sedan'];
    for (let i = 0; i < 6; i++) {
      const x = 36.5 + i * 2.6; bays.push(['road_paint', x - 1.3, QY + 0.012, 1.5, 0.12, 0.02, 5]);
      if (r() < 0.75) P(cars[Math.floor(r() * 3)], x, QY, 1.6 + (r() - 0.5) * 0.3, PI + (r() - 0.5) * 0.06);
    }
    bays.push(['road_paint', 36.5 + 6 * 2.6 - 1.3, QY + 0.012, 1.5, 0.12, 0.02, 5]);
    this.boxMeshes(bays, 'parking');
    // traffic: one loop through the town, driven both ways (keeping left): out of the tunnel at the east end of the
    // coast road, along the coast, north up the harbour road, west along the apron road, up the shopping street, across
    // the plaza onto the hill road, down it back to the harbour and into the tunnel. Corners are rounded; the turnaround
    // is out of sight deep in the tunnel. Junctions are yield zones.
    const loop = [[172, 19], [127, 19], [64, 19], [58.5, 13], [58.5, -4.5], [40, -4.5], [40, -104], [58, -104], [58, -14], [58.5, -4.5], [58.5, 13], [64, 19], [127, 19], [172, 19]];
    const smoothPath = (raw) => {   // round every corner with a quadratic curve
      const out = [raw[0]];
      for (let k = 1; k < raw.length - 1; k++) {
        const [ax, az] = raw[k - 1], [bx, bz] = raw[k], [cx, cz] = raw[k + 1];
        const l1 = Math.hypot(bx - ax, bz - az), l2 = Math.hypot(cx - bx, cz - bz);
        const turn = Math.abs(Math.atan2((bx - ax) * (cz - bz) - (bz - az) * (cx - bx), (bx - ax) * (cx - bx) + (bz - az) * (cz - bz)));
        if (turn < 0.05 || turn > 3) { out.push(raw[k]); continue; }   // straight on, or the hidden turnaround
        const rc = Math.min(7, l1 * 0.45, l2 * 0.45), p0 = [bx - (bx - ax) / l1 * rc, bz - (bz - az) / l1 * rc], p2 = [bx + (cx - bx) / l2 * rc, bz + (cz - bz) / l2 * rc];
        for (let t = 0; t <= 1.001; t += 0.125) out.push([(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * bx + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * bz + t * t * p2[1]]);
      }
      out.push(raw[raw.length - 1]);
      const pts = out.map(([x, z]) => new THREE.Vector2(x, z)), cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + pts[k].distanceTo(pts[k - 1]));
      return { pts, cum, len: cum[cum.length - 1] };
    };
    this.routes = [smoothPath(loop), smoothPath(loop.slice().reverse())];
    this.zones = [{ x: 58.5, z: -4.5, r: 6 }, { x: 40, z: -4.5, r: 5.5 }, { x: 40, z: -104, r: 5.5 }, { x: 58, z: -104, r: 4.5 }];
    // turn signals: four amber lamps per car, shown on the side it is turning to
    const blinkMat = new THREE.MeshStandardMaterial({ color: 0xffa020, emissive: 0xff8a00, emissiveIntensity: 2.2 });
    const blinkGeo = new THREE.SphereGeometry(0.07, 6, 4);
    this.traffic = [];
    const n = Math.round(9 * Math.min(1, this.q.lod / 0.85)) || 4;
    for (let k = 0; k < n; k++) {
      const route = k % 2, R = this.routes[route], name = cars[k % 3], o = this.clone(name, 0, 0, 0, 0, 'tex');
      const b = this.protos[name].box, hl = (b.max.z - b.min.z) / 2 - 0.05, hw = (b.max.x - b.min.x) / 2 - 0.1, blink = { l: [], r: [] };
      for (const [side, sx] of [['l', 1], ['r', -1]]) for (const [zz, yy] of [[hl, 0.75], [-hl, 0.9]]) {
        const m = new THREE.Mesh(blinkGeo, blinkMat); m.position.set(sx * hw, yy, zz); m.visible = false; o.add(m); blink[side].push(m);
      }
      const col = { type: 'b', x: 0, z: 0, hw: 0.85, hd: 2.15, c: 1, s: 0, y0: -9, y1: -9 }; this.colliders.push(col);
      this.traffic.push({ o, col, route, blink, s: R.len * ((k * 0.43) % 1), v: 0, cruise: 0.9 + r() * 0.25, ry: 0, x: 0, z: 0, ux: 0, uz: 1, wait: 0 });
    }
    this.trafficY = rY;
  }
  // position on the route (keep-left lane offset) and heading at distance s
  routeAt(s, R) {
    s = ((s % R.len) + R.len) % R.len;
    let k = 1; while (k < R.cum.length - 1 && R.cum[k] < s) k++;
    const a = R.pts[k - 1], b = R.pts[k], t = (s - R.cum[k - 1]) / Math.max(1e-6, R.cum[k] - R.cum[k - 1]);
    const dx = b.x - a.x, dz = b.y - a.y, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
    const px = a.x + dx * t, pz = a.y + dz * t, off = px > 55 && pz < -10 ? 1.0 : 1.6;   // narrow hill road and lane
    return { x: px + uz * off, z: pz - ux * off, ux, uz };
  }
  setSignal(st) {
    const S = this.signal; S.state = st;
    const on = { g: st === 'green', y: st === 'yellow', r: st === 'red', pr: st !== 'red', pg: st === 'red' };
    for (const [k, m] of Object.entries(S.m)) { m.color.setHex(on[k] ? m.userData.on : m.userData.off); m.emissiveIntensity = on[k] ? 2.2 : 0; }
  }
  updateTraffic(dt, player) {
    const S = this.signal;
    if (S) {   // green 14 s, yellow 3 s, red 9 s
      S.t += dt; const c = S.t % 26, st = c < 14 ? 'green' : c < 17 ? 'yellow' : 'red';
      if (st !== S.state) this.setSignal(st);
    }
    const T = this.traffic; if (!T) return;
    const obst = [];
    if (player) obst.push(player);
    for (const n of this.npcs) obst.push(n.o.position);
    for (const c of T) {
      const R = this.routes[c.route], p = this.routeAt(c.s, R);
      let free = 99;
      // people on the lane ahead
      for (const o of obst) {
        const rx = o.x - p.x, rz = o.z - p.z, along = rx * p.ux + rz * p.uz, side = Math.abs(rx * p.uz - rz * p.ux);
        if (along > 0 && along < 20 && side < 1.7) free = Math.min(free, along - 3);
      }
      // the car in front (any route, same direction)
      for (const o of T) if (o !== c && o.o.visible) {
        const rx = o.x - p.x, rz = o.z - p.z, along = rx * p.ux + rz * p.uz, side = Math.abs(rx * p.uz - rz * p.ux);
        if (along > 0 && along < 30 && side < 1.5 && o.ux * p.ux + o.uz * p.uz > 0.2) free = Math.min(free, along - 6);
      }
      // junctions: wait outside while another car is inside the zone (give up waiting after a few seconds)
      let waiting = false;
      for (const zn of this.zones) {
        const dx = zn.x - p.x, dz = zn.z - p.z, d = Math.hypot(dx, dz);
        if (d < zn.r || d > zn.r + 14 || dx * p.ux + dz * p.uz <= 0 || c.wait > 4) continue;
        if (T.some((o) => o !== c && Math.hypot(o.x - zn.x, o.z - zn.z) < zn.r)) { free = Math.min(free, d - zn.r - 1.5); waiting = true; }
      }
      c.wait = waiting && c.v < 0.5 ? c.wait + dt : waiting ? c.wait : 0;
      // the crossing signal
      if (S && S.state !== 'green' && Math.abs(p.z - 19) < 4 && Math.abs(p.x - S.x) < 40 && Math.abs(p.ux) > 0.8) {
        const d = (S.x - 3.4 * Math.sign(p.ux) - p.x) * Math.sign(p.ux);
        if (d > (S.state === 'yellow' ? 4 : -0.5)) free = Math.min(free, d);
      }
      // slow for bends: compare the heading 8 m ahead
      const q8 = this.routeAt(c.s + 8, R), bend = Math.acos(Math.max(-1, Math.min(1, q8.ux * p.ux + q8.uz * p.uz)));
      const limit = (p.x > 63 && p.z > 12 ? 11 : p.x > 55 && p.z < -10 ? 5.5 : 6.5) * c.cruise * Math.max(0.35, 1 - bend * 0.8);
      // turn signal: a turn of more than ~35 degrees within the next 25 m
      const q25 = this.routeAt(c.s + 25, R), turn = Math.asin(Math.max(-1, Math.min(1, p.ux * q25.uz - p.uz * q25.ux)));
      const on = Math.abs(turn) > 0.6 && Math.abs(p.x) < 150 && (this.world.time * 1.5) % 1 < 0.5;
      for (const m of c.blink.r) m.visible = on && turn > 0; for (const m of c.blink.l) m.visible = on && turn < 0;
      const want = free <= 0 ? 0 : Math.min(limit, Math.sqrt(2 * 3.5 * free));
      c.v += Math.max(-9 * dt, Math.min(2.5 * dt, want - c.v));
      c.s = (c.s + c.v * dt) % R.len;
      const q = this.routeAt(c.s, R), ry = Math.atan2(q.ux, q.uz);
      let da = ry - c.ry; da = Math.atan2(Math.sin(da), Math.cos(da)); c.ry += da * Math.min(1, dt * 6);
      c.x = q.x; c.z = q.z; c.ux = q.ux; c.uz = q.uz;
      const hidden = q.x > 157;   // deep in the dark part of the tunnel
      const y = hidden ? -50 : this.at(q.x, q.z);
      c.o.visible = !hidden; c.o.position.set(q.x, y, q.z); c.o.rotation.y = c.ry;
      c.col.x = q.x; c.col.z = q.z; c.col.c = Math.cos(c.ry); c.col.s = Math.sin(c.ry); c.col.y0 = y - 0.5; c.col.y1 = hidden ? -50 : y + 1.7;
    }
  }
  // paint and gutter lids: worn road paint, darker concrete lids; drawn just above the road without z-fighting
  roadMat(name) {
    if (name === 'tunnel_dark') return (this.tunnelMat ||= new THREE.MeshStandardMaterial({ name, color: 0x0a0b0c, roughness: 1 }));
    if (name === 'hill_fill') return (this.fillMat ||= new THREE.MeshStandardMaterial({ name, color: 0x55703a, roughness: 1 }));
    if (name === 'tunnel_lamp') return (this.tlampMat ||= new THREE.MeshStandardMaterial({ name, color: 0xffb060, emissive: 0xff9a40, emissiveIntensity: 2.0 }));
    if (name !== 'road_paint' && name !== 'gutter') return this.mats.get(name);
    this.roadMats ||= {};
    return (this.roadMats[name] ||= new THREE.MeshStandardMaterial({ name, color: name === 'road_paint' ? 0xd8d8d0 : 0x77756f, roughness: name === 'road_paint' ? 0.75 : 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  }
  // houses climbing the natural hillsides around the town (the concept's stacked village): each faces downhill
  // and stands on a dry-stone retaining base that makes up the slope under it
  // the upper town on the east hill: houses in rows along the hill road and its three lanes, each facing its road
  // and standing on a dry-stone base that makes up the slope; cars parked beside some of them
  hillside(r) {
    const g = this.ground, names = ['house_old', 'house_narrow', 'house_hira', 'house_standard', 'house_hillside', 'house_twostory', 'house_hipped'];
    const HR = HILL_ROAD, bases = [], keep = Math.min(1, this.q.lod / 0.85);
    const tryHouse = (n, cx, cz, ry, roadY) => {
      const b = this.protos[n].box, c = Math.cos(ry), sn = Math.sin(ry), hw = (b.max.x - b.min.x) / 2, hd = (b.max.z - b.min.z) / 2;
      let hi = -1e9, lo = 1e9;
      for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [0, 0]]) {
        const wx = cx + lx * c + lz * sn, wz = cz - lx * sn + lz * c;
        if (g.platformAt(wx, wz)) return false;
        const hh = g.natAt(wx, wz); hi = Math.max(hi, hh); lo = Math.min(lo, hh);
      }
      if (this.colliders.some((q) => Math.abs(q.x - cx) < hw + (q.hw || q.r || 0) + 0.5 && Math.abs(q.z - cz) < hd + (q.hd || q.r || 0) + 0.5)) return false;
      const y = Math.max(roadY + 0.15, Math.min(hi, roadY + 2.5) + 0.1);
      this.put(n, cx, y, cz, ry, { tint: this.tint(r) });
      bases.push([cx, cz, ry, hw * 2 * 0.92, hd * 2 * 0.92, y, Math.min(lo, y) - 0.6]);
      const fx = cx + sn * (hd + 0.9), fz = cz + c * (hd + 0.9);   // in front of the house, by the road
      if (r() < 0.4) this.put(r() < 0.5 ? 'plant_pots' : 'hydrangea', fx + c * (hw - 0.8), y, fz - sn * (hw - 0.8), ry, { s: 0.8, col: false });
      if (r() < 0.25) this.put('laundry_pole', cx - c * (hw + 1.2), y, cz + sn * (hw + 1.2), ry + H, { col: false });
      return { hw, hd, y };
    };
    let count = 0;
    // along the lanes: a row on each side, fronts facing the lane
    for (const zc of HILL_LANES) {
      const lane = PLATFORMS.find((p) => p.name === 'hill_lane' + (HILL_LANES.indexOf(zc) + 1));
      for (const side of [-1, 1]) {
        let x = HR.x1 + 11 + r() * 2;
        while (x < lane.x1 - 4) {
          if (r() > keep) { x += 10; continue; }
          const n = names[Math.floor(r() * names.length)], b = this.protos[n].box, hw = (b.max.x - b.min.x) / 2, hd = (b.max.z - b.min.z) / 2;
          const cz = zc + side * (2 + 1.0 + hd), ry = side < 0 ? 0 : PI;
          const roadY = platformY(lane, x + hw, zc);
          const h = tryHouse(n, x + hw, cz, ry, roadY);
          if (h && r() < 0.35) {   // a car parked in the gap next to the house
            const cx = x + hw * 2 + 1.4; if (cx < lane.x1 - 3) this.put(['car_kei', 'car_kei_b', 'car_sedan'][Math.floor(r() * 3)], cx, h.y, zc + side * 4.6, ry + (r() - 0.5) * 0.1);
            x += 3.2;
          }
          if (h) count++;
          x += hw * 2 + 1.2 + r() * 2;
        }
      }
    }
    // along the east side of the hill road, between the lanes
    let z = HR.z1 - 6;
    while (z > HR.z0 + 6) {
      if (HILL_LANES.some((zc) => Math.abs(z - zc) < 9) || r() > keep) { z -= 4; continue; }
      const n = names[Math.floor(r() * names.length)], b = this.protos[n].box, hw = (b.max.x - b.min.x) / 2, hd = (b.max.z - b.min.z) / 2;
      if (HILL_LANES.some((zc) => Math.abs(z - hw - zc) < 2.5 + hw * 2)) { z -= 2; continue; }
      if (tryHouse(n, HR.x1 + 1.0 + hd, z - hw, -H, hillRoadY(z - hw))) count++;
      z -= hw * 2 + 1.5 + r() * 2;
    }
    // utility poles along the hill road and the lanes, with wires
    const poles = []; for (let zz = HR.z1 - 4; zz > HR.z0 + 2; zz -= 14) { this.put('utility_pole', HR.x1 + 0.5, hillRoadY(zz), zz, 0); poles.push([HR.x1 + 0.5, zz]); }
    this.poleLines.push(poles);
    for (const zc of HILL_LANES) { const lp = []; for (let xx = HR.x1 + 6; xx < HR.x1 + 44; xx += 14) { this.put('utility_pole', xx, null, zc - 2.3, H); lp.push([xx, zc - 2.3]); } this.poleLines.push(lp); }
    // dry-stone bases (instanced boxes)
    if (bases.length) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), null, bases.length), m = new THREE.Matrix4();
      bases.forEach(([x, z, ry, w, d, top, bot], i) => {
        m.compose(new THREE.Vector3(x, (top + bot) / 2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(w + 0.6, top - bot, d + 0.6));
        im.setMatrixAt(i, m);
      });
      const mat = this.mats.get('stone_wall').clone(); mat.map = mat.map.clone(); mat.map.repeat.set(3, 1.2);
      if (mat.normalMap) { mat.normalMap = mat.normalMap.clone(); mat.normalMap.repeat.set(3, 1.2); }
      im.material = mat; im.castShadow = im.receiveShadow = true; im.name = 'hill_bases'; this.root.add(im);
    }
    this.hillHouses = count;
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
      if (f < 0.3) continue;
      if (inBox && (nearPlat(jx, jz, 3.5) || blocked(jx, jz, 1))) continue;
      const kind = h > 30 && f > 0.5 ? 'tree_cedar' : f > 0.62 ? 'tree_cedar' : (r() < 0.6 ? 'tree_broadleaf' : (h < 16 && r() < 0.55 ? 'tree_pine' : 'tree_cedar'));
      this.put(kind, jx, h - 0.2, jz, r() * 6.28, { s: 0.75 + r() * 0.6, col: inBox ? undefined : false, pool: { lod: 40, lod2: 100, cull: 1100 } });
      n++;
    }
    this.treeCount = n;
    // rock faces: cliff pieces facing downhill on the steepest ground, about 7 m apart so they join into a crag
    const cliffs = [];
    for (let i = 0; i < 20000 && cliffs.length < Math.round(70 * Math.min(1, this.q.lod / 0.85)); i++) {
      const x = G.x0 + r() * (G.x1 - G.x0), z = G.z0 + r() * (G.z1 - G.z0), h = g.natAt(x, z);
      if (h < 0.5 || g.platformAt(x, z)) continue;
      const gx = (g.natAt(x + 2, z) - g.natAt(x - 2, z)) / 4, gz = (g.natAt(x, z + 2) - g.natAt(x, z - 2)) / 4;
      if (Math.hypot(gx, gz) < 1.25 || nearPlat(x, z, 6)) continue;
      if (cliffs.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 7)) continue;
      const sc = 0.8 + r() * 0.6;
      this.put('rock_cliff', x, h - (0.5 + r() * 0.5) * sc, z, Math.atan2(-gx, -gz) + (r() - 0.5) * 0.6, { s: sc, rx: (r() - 0.5) * 0.2, col: false, pool: { lod: 60, cull: 700 } });
      cliffs.push([x, z]);
    }
    // shrubs clinging to the steep slopes and cliffs, boulders on the steepest faces
    for (let i = 0, placed = 0; i < 16000 && placed < this.q.trees * 0.6; i++) {
      const x = G.x0 + r() * (G.x1 - G.x0), z = G.z0 + r() * (G.z1 - G.z0), h = g.natAt(x, z);
      if (h < 1.2 || g.platformAt(x, z)) continue;
      const sl = Math.hypot(g.natAt(x + 1.5, z) - h, g.natAt(x, z + 1.5) - h) / 1.5;
      if (sl < 0.3) continue;
      if (nearPlat(x, z, 2.5)) continue;
      // cliffs: big half-buried rock outcrops; slopes: scrub, hydrangea and wind-bent pines
      const rock = sl > 1.3 && r() < 0.35;
      const kind = rock ? (r() < 0.5 ? 'rock_c' : r() < 0.5 ? 'rock_a' : 'rock_b') : r() < 0.14 ? 'tree_pine_b' : r() < 0.08 ? 'hydrangea' : 'bush';
      const sc = rock ? 0.9 + r() * 1.3 : kind === 'bush' ? 1.1 + r() * 1.4 : 0.8 + r() * 0.5;
      this.put(kind, x, h - (rock ? 1.5 * sc : 0.3), z, r() * 6, { s: sc, rx: rock ? (r() - 0.5) * 0.6 : 0, col: false, pool: { lod: 50, cull: 600 } });
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
    for (const [xa, xb, z, y] of this.lanternLines || []) {
      const curve = new THREE.CatmullRomCurve3([...Array(7)].map((_, k) => { const t = k / 6; return new THREE.Vector3(xa + (xb - xa) * t, y - Math.sin(t * Math.PI) * 0.45, z); }));
      geo.push(new THREE.TubeGeometry(curve, 8, 0.015, 3, false));
    }
    if (!geo.length) return;
    const merged = mergeGeos(geo);
    const m = new THREE.Mesh(merged, mat); m.name = 'wires'; this.root.add(m);
  }
  // flower beds along the quay, the shop street, the plaza, the shrine approach and the house lanes (bugs visit them, js/life)
  flowerBeds() {
    const r = rng(7), beds = [[-36, 13.5, 10], [-12, 13.5, 8], [33.4, -20, 6], [46.6, -26, 6], [33.4, -66, 6], [46.6, -74, 6], [30, -110, 10], [50, -112, 8],
      [-14, -110, 6], [-4, -110, 6], [-30, -34, 8], [-60, -34, 6], [-100, 2, 8], [90, 52, 8]];
    const free = (x, z) => {
      const s = this.ground.sample(x, z); if (s.h < -0.2 || (s.plat && /asphalt/.test(s.plat.mat || ''))) return false;
      for (const c of this.colliders) {
        if (Math.abs(c.x - x) > 12 || Math.abs(c.z - z) > 12) continue;
        if (c.type === 'c') { if (Math.hypot(c.x - x, c.z - z) < c.r + 0.3) return false; continue; }
        const dx = x - c.x, dz = z - c.z, lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
        if (Math.abs(lx) < c.hw + 0.3 && Math.abs(lz) < c.hd + 0.3) return false;
      }
      return true;
    };
    this.flowers = [];
    for (const [bx, bz, n] of beds) for (let i = 0; i < n; i++) {
      let p = null;
      for (let k = 0; k < 12 && !p; k++) { const x = bx + (r() - 0.5) * (6 + k * 0.6), z = bz + (r() - 0.5) * (3 + k * 0.6); if (free(x, z)) p = [x, z]; }
      if (!p) continue;
      this.put(['flowers_a', 'flowers_b', 'flowers_c'][Math.floor(r() * 3)], p[0], null, p[1], r() * 6.28, { s: 1.6 + r() * 0.5, col: false });
      this.flowers.push({ x: p[0], z: p[1] });
    }
  }
  // ------------------------------------------------------------------ people
  people(r) {
    const N = (name, x, z, ry, path) => {
      const y = this.at(x, z), o = this.clone(name, x, y, z, ry, true);
      const limbs = {}; for (const s of ['arm_l', 'arm_r', 'leg_l', 'leg_r']) limbs[s] = o.getObjectByName(`${name}_${s}`);
      const npc = { o, name, limbs, path, seg: 0, t: r() * 10, speed: 1.1 + r() * 0.3, idle: !path, r: 0.35 };
      this.npcs.push(npc); return npc;
    };
    this.cats = [N('cat', -6, 17, 1), N('cat', 36, -50, 2), N('cat', -20, -36.5, 0.5)];
  }
  birds(r) {
    for (let i = 0; i < 12; i++) {
      const o = this.clone('seagull', 0, 20, 0, 0, true);
      this.gulls.push({ o, cx: -20 + r() * 80, cz: 30 + r() * 70, rad: 15 + r() * 30, h: 12 + r() * 20, sp: (0.18 + r() * 0.15) * (r() < 0.5 ? 1 : -1), ph: r() * 6,
        wl: o.getObjectByName('seagull_wing_l'), wr: o.getObjectByName('seagull_wing_r') });
    }
    // black kites (トンビ) soaring high over the hill and the town on wide, slow circles, wings barely moving
    for (let i = 0; i < 7; i++) {
      const o = this.clone('tonbi', 0, 40, 0, 0, true);
      this.gulls.push({ o, cx: -110 + r() * 150, cz: -80 + r() * 90, rad: 25 + r() * 35, h: 40 + r() * 30, sp: (0.08 + r() * 0.05) * (r() < 0.5 ? 1 : -1), ph: r() * 6,
        wl: o.getObjectByName('tonbi_wing_l'), wr: o.getObjectByName('tonbi_wing_r'), soar: true });
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
    this.updateTraffic(dt, player);
    const tr = this.tram;
    if (tr) {
      if (tr.wait > 0) { tr.wait -= dt; if (tr.wait <= 0) { tr.from = tr.x; tr.to = tr.to === tr.a ? tr.b : tr.a; tr.t = 0; } }
      else {
        const dur = Math.abs(tr.to - tr.from) / 5.5 + 3; tr.t = Math.min(1, tr.t + dt / dur);
        const e = tr.t * tr.t * (3 - 2 * tr.t); tr.x = tr.from + (tr.to - tr.from) * e;
        if (tr.t >= 1) tr.wait = 7;
      }
      tr.cars.forEach((c, i) => {
        const x = tr.x + (i ? -6.2 : 6.2), y = tr.yAt(x);
        c.position.set(x, y, tr.zc); const col = tr.cols[i]; col.x = x; col.y0 = y - 0.5; col.y1 = y + 3.5;
      });
    }
    for (const s of this.sailers || []) {
      const a = t * s.sp + s.ph, x = s.cx + Math.cos(a) * s.rad, z = s.cz + Math.sin(a) * s.rad;
      s.o.position.set(x, this.world.swell(x, z) - 0.05, z);
      s.o.rotation.set(Math.sin(t * 0.7 + s.ph) * 0.03, -a + (s.sp > 0 ? PI : 0), (s.sp > 0 ? -1 : 1) * 0.16 + Math.sin(t * 0.9 + s.ph) * 0.03);   // heeling
    }
    for (const s of this.spinners) if (s.o) { if (s.speed) s.o.rotation.y += dt * s.speed; if (s.blink) s.o.visible = (t % 4) < 2.2; }
    for (const g of this.gulls) {
      const a = t * g.sp + g.ph;
      g.o.position.set(g.cx + Math.cos(a) * g.rad, g.h + Math.sin(t * 0.5 + g.ph) * 2, g.cz + Math.sin(a) * g.rad);
      g.o.rotation.set(0, -a + (g.sp > 0 ? PI : 0), (g.sp > 0 ? 1 : -1) * 0.25);
      const f = g.soar ? 0.06 + Math.sin(t * 1.3 + g.ph) * 0.05 : Math.sin(t * 7 + g.ph) * 0.5 * (0.5 + 0.5 * Math.sin(t * 0.7 + g.ph));
      if (g.wl) g.wl.rotation.z = f; if (g.wr) g.wr.rotation.z = -f;
    }
    for (const n of this.npcs) if (!n.life) this.npc(n, dt, player);
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

// painterly hue of a leaf clump: blue-green underneath, warm yellow-green on the sunlit top
const CLUMP_COOL = [0.5, 0.74, 0.86], CLUMP_WARM = [1.4, 1.3, 0.62];
// k-means over points (seeded by farthest-point sampling): clump centres, radii and each point's clump
function clumps(pts, K, iters = 8) {
  const N = pts.length, cen = [pts[0].clone()], asg = new Uint8Array(N), d2 = new Float32Array(N).fill(Infinity);
  for (let k = 1; k < K; k++) {
    let best = 0;
    for (let i = 0; i < N; i++) { d2[i] = Math.min(d2[i], pts[i].distanceToSquared(cen[k - 1])); if (d2[i] > d2[best]) best = i; }
    cen.push(pts[best].clone());
  }
  const sum = cen.map(() => new THREE.Vector3()), cnt = new Float32Array(K), rad = new Float32Array(K).fill(1e-3);
  for (let it = 0; it < iters; it++) {
    sum.forEach((s) => s.set(0, 0, 0)); cnt.fill(0);
    for (let i = 0; i < N; i++) {
      let bk = 0, bd = Infinity;
      for (let k = 0; k < K; k++) { const d = pts[i].distanceToSquared(cen[k]); if (d < bd) { bd = d; bk = k; } }
      asg[i] = bk; sum[bk].add(pts[i]); cnt[bk]++;
    }
    for (let k = 0; k < K; k++) if (cnt[k]) cen[k].copy(sum[k]).multiplyScalar(1 / cnt[k]);
  }
  for (let i = 0; i < N; i++) rad[asg[i]] = Math.max(rad[asg[i]], pts[i].distanceTo(cen[asg[i]]));
  return { cen, rad, asg, cnt };
}

// leaf cards: the crown is split into its leaf clumps (k-means over the card vertices). Each clump shades like its own
// ball of leaves (normals away from the clump centre, bent toward the crown's outside and up), with a painterly hue
// shift: warm yellow-green on the sunlit tops, cool blue-green underneath, darker deep inside the crown.
function canopyNormals(geo, matrix) {
  const P = geo.attributes.position, N = P.count, n = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const v = new THREE.Vector3(), c = new THREE.Vector3(), box = new THREE.Box3();
  for (let i = 0; i < N; i++) box.expandByPoint(v.fromBufferAttribute(P, i));
  box.getCenter(c); const size = box.getSize(new THREE.Vector3()); c.y -= size.y * 0.15;
  const inv = new THREE.Vector3(1 / Math.max(size.x, 1e-3), 1 / Math.max(size.y, 1e-3), 1 / Math.max(size.z, 1e-3));
  // about 150 vertices (~38 cards) per clump
  const pts = []; for (let i = 0; i < N; i++) pts.push(new THREE.Vector3().fromBufferAttribute(P, i));
  const { cen, rad, asg } = clumps(pts, Math.max(1, Math.min(24, Math.round(N / 150))));
  const nc = new THREE.Vector3(), cool = CLUMP_COOL, warm = CLUMP_WARM;
  for (let i = 0; i < N; i++) {
    const k = asg[i]; v.fromBufferAttribute(P, i);
    nc.copy(v).sub(cen[k]).multiplyScalar(1 / rad[k]);                 // position inside the clump, -1..1
    const local = nc.length();
    v.sub(c).multiply(inv);                                            // position inside the crown
    const depth = Math.min(1, v.length() * 2.2), top = THREE.MathUtils.clamp(v.y * 1.6 + 0.5, 0, 1);
    const sun = THREE.MathUtils.smoothstep(nc.y * 0.75 + top * 0.6, -0.35, 0.85);
    const ao = (0.68 + 0.32 * Math.min(1, local * 1.1)) * (0.74 + 0.26 * depth);
    for (let j = 0; j < 3; j++) col[i * 3 + j] = (cool[j] + (warm[j] - cool[j]) * sun) * ao;
    v.normalize().multiplyScalar(0.45); nc.normalize().add(v); nc.y += 0.3; nc.normalize();
    n.set([nc.x, nc.y, nc.z], i * 3);
  }
  const g = geo.clone(); g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  void matrix; return g;
}

// merge primitives that share a material (positions/normals baked through their matrices, UVs kept)
function bakeMerge(list) {
  let nv = 0, ni = 0;
  for (const pr of list) { nv += pr.geometry.attributes.position.count; ni += pr.geometry.index ? pr.geometry.index.count : pr.geometry.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  const hasCol = list.some((pr) => pr.geometry.attributes.color), col = hasCol ? new Float32Array(nv * 3).fill(1) : null;
  const v = new THREE.Vector3(), nm = new THREE.Matrix3(); let ov = 0, oi = 0;
  for (const pr of list) {
    const g = pr.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    nm.getNormalMatrix(pr.matrix);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(pr.matrix); pos.set([v.x, v.y, v.z], (ov + i) * 3);
      if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (ov + i) * 3); }
      if (U) uv.set([U.getX(i), U.getY(i)], (ov + i) * 2);
      const C = g.attributes.color; if (C) col.set([C.getX(i), C.getY(i), C.getZ(i)], (ov + i) * 3);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi++] = g.index.getX(i) + ov; else for (let i = 0; i < P.count; i++) idx[oi++] = ov + i;
    ov += P.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
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
