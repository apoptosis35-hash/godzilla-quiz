// The village: loads the Blender models (../inaka-assets/glb), lays them out, and owns collisions,
// walkable heights, the time of day, the train and the wandering animals.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ASSETS = '../inaka-assets/glb/';
const loader = new GLTFLoader();
const protos = {};

// Models that never block the player (ground tiles, things you walk on, small items and animals).
const PASS = new Set(['tanbo', 'road', 'michi', 'kawa', 'hatake', 'ishidan', 'hashi', 'kabuto', 'suika', 'neko', 'niwatori', 'shiba', 'kodomo', 'densha', 'eki', 'himawari']);
// Trees and poles block with a small circle at the trunk instead of their whole bounding box.
const TRUNK = { sugi: 0.45, kaki_tree: 0.3, sakura: 0.35, take: 1.1, denchu: 0.25, curve_mirror: 0.15, chochin_post: 0.15, bush: 0.8, rock: 1.0, kakashi: 0.15, post: 0.3, jizo: 0.35, ishidoro: 0.45, tanuki: 0.35, ushi: 0.6, obaachan: 0.3 };

export async function loadModels(names, onProgress) {
  let done = 0;
  await Promise.all(names.map((n) => loader.loadAsync(ASSETS + n + '.glb').then((g) => {
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    protos[n] = g.scene;
    onProgress?.(++done / names.length);
  })));
}

const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class World {
  constructor(scene, quality) {
    this.scene = scene; this.q = quality;
    this.root = new THREE.Group(); scene.add(this.root);
    this.colliders = []; // {type:'box', x, z, hw, hd, c, s} | {type:'circle', x, z, r}
    this.animals = [];
    this.glowMats = new Set();
    this.mapRects = []; // for the minimap
    this.hour = 8;
    this.buildEnvironment();
    this.buildVillage();
  }

  place(name, x, z, ry = 0, opt = {}) {
    const o = protos[name].clone(true);
    o.position.set(x, opt.y || 0, z); o.rotation.y = ry;
    if (opt.scale) o.scale.setScalar(opt.scale);
    this.root.add(o);
    o.traverse((m) => { if (m.isMesh && ['chochin', 'lamp', 'glow'].includes(m.material.name)) this.glowMats.add(m.material); });
    const col = opt.col ?? (PASS.has(name) ? false : TRUNK[name] ? { r: TRUNK[name] } : 'box');
    if (col && col.r) this.colliders.push({ type: 'circle', x, z, r: col.r });
    else if (col) {
      // oriented box from the model's local bounds (or an explicit w/d), rotated by ry
      let w, d, cx = 0, cz = 0;
      if (col.w) ({ w, d } = col);
      else {
        const b = new THREE.Box3().setFromObject(protos[name]);
        w = b.max.x - b.min.x; d = b.max.z - b.min.z; cx = (b.max.x + b.min.x) / 2; cz = (b.max.z + b.min.z) / 2;
        if (col.shrink) { w -= col.shrink; d -= col.shrink; }
      }
      this.addBox(x + cx * Math.cos(ry) + cz * Math.sin(ry), z - cx * Math.sin(ry) + cz * Math.cos(ry), w, d, ry, opt.map);
    }
    return o;
  }
  addBox(x, z, w, d, ry = 0, map = true) {
    this.colliders.push({ type: 'box', x, z, hw: w / 2, hd: d / 2, c: Math.cos(ry), s: Math.sin(ry) });
    if (map) this.mapRects.push({ x, z, w, d, ry });
  }

  // ------------------------------------------------------------------ ground, sky, mountains, lights
  buildEnvironment() {
    const s = this.scene;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0x5f8f38, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.root.add(ground);
    // sky dome with a gradient driven by the time of day
    this.skyU = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.5, h)), 1.); }',
    }));
    sky.renderOrder = -1; this.root.add(sky);
    s.fog = new THREE.Fog(0xcfe3f0, 70, 260);
    // mountains all around
    const mm = [new THREE.MeshStandardMaterial({ color: 0x3f6b32, roughness: 1, flatShading: true }), new THREE.MeshStandardMaterial({ color: 0x4c7a3a, roughness: 1, flatShading: true })];
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + Math.sin(i * 7) * 0.1, r = 150 + (i % 3) * 25, h = 35 + ((i * 37) % 30);
      const m = new THREE.Mesh(new THREE.ConeGeometry(45 + (i % 4) * 10, h, 7, 1), mm[i % 2]);
      m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r); m.rotation.y = i; this.root.add(m);
    }
    this.hemi = new THREE.HemisphereLight(0xdcefff, 0x5a6b3a, 1.2); this.root.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    if (this.q.shadows) {
      this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
      Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
      this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    }
    this.root.add(this.sun, this.sun.target);
  }

  // ------------------------------------------------------------------ the village layout (three.js coords: +Z = south)
  buildVillage() {
    const P = (...a) => this.place(...a);
    const H = Math.PI / 2, PI = Math.PI;
    // roads: dirt road north-south through the village, paved road to the east, dirt road to the west
    for (let z = -44; z <= 28; z += 8) P('michi', 0, z, H);
    for (let x = 8; x <= 64; x += 8) P('road', x, 0);
    for (let x = -8; x >= -64; x -= 8) P('michi', x, 0);
    P('michi', 0, 41, H); P('michi', 4.4, 42.3); P('michi', 12.4, 42.3); P('michi', 20.4, 42.3);
    this.mapRoads = [[0, -48, 0, 45], [-66, 0, 66, 0], [0, 42.3, 24, 42.3]];
    // river with a bridge, water mill and jizo
    for (let x = -68; x <= 68; x += 8) P('kawa', x, 34);
    P('hashi', 0, 34, H);
    this.addBox(-0.95, 34, 0.12, 6, 0, false); this.addBox(0.95, 34, 0.12, 6, 0, false); // railings
    const mill = P('suisha', -16, 28.5, 0);
    this.wheel = mill.getObjectByName('suisha_wheel');
    P('jizo', 4.2, 29.5, -H); P('jizo', 4.2, 30.4, -H);
    P('hasakake', -30, 27, 0);
    // home: thatched farmhouse with storehouse, barn, well, persimmon tree
    P('kominka', -24, -14, 0, { col: { w: 11.4, d: 8 } });
    P('kura', -37, -15, H); P('naya', -12, -19, -H);
    P('ido', -17.5, -6.5, 0); P('kaki_tree', -31, -5, 0); P('tanuki', -20.5, -8.8, 0.3);
    P('monohoshi', -27, -23.5, 0); P('jitensha', -15.5, -9.5, 0.4); P('kounki', -9, -13, 1.2);
    // rice paddies, scarecrow, more paddies
    for (const x of [-47.2, -38.6, -30, -21.4]) for (const z of [9.7, 18.3]) P('tanbo', x, z);
    P('kakashi', -38.6, 9.7, 0.3); P('kakashi', -21.4, 18.3, -0.4);
    // pasture with fence and cows
    for (let x = -46; x <= -34; x += 2) { P('take_gaki', x + 1, -42, 0); P('take_gaki', x + 1, -30, 0); }
    for (let z = -41; z <= -31; z += 2) { P('take_gaki', -47, z, H); P('take_gaki', -33, z, H); }
    // east side: sweets shop, vending machine, houses, bus stop
    P('dagashiya', 14, -7, 0, { col: { w: 5.2, d: 4.2 } });
    this.obaachan = P('obaachan', 10.6, -3.6, 0.4);
    P('jihanki', 19.6, -5.4, 0); P('post', 21.2, -4.9, 0); P('bench', 8.2, -4.3, 0.2);
    P('minka', 34, -12, 0, { col: { w: 8.3, d: 6.3 } }); P('minka', 48, -11, 0, { col: { w: 8.3, d: 6.3 } });
    P('keitora', 40.5, -4.8, H); P('monohoshi', 52, -18.5, 0.1); P('jitensha', 30.5, -7.5, 1.4);
    P('bus_stop', 30, 4.6, PI); P('curve_mirror', 3.4, 3.4, -PI * 0.75);
    for (let x = 8; x <= 56; x += 16) P('denchu', x, -3.1, 0);
    for (let z = -40; z <= 24; z += 16) P('denchu', 3.0, z, H);
    // school with cherry trees and sunflowers
    P('kousha', 40, -38, 0, { col: { w: 20.6, d: 7.8 } });
    this.addBox(36.5, -32, 0.5, 0.5); this.addBox(43.5, -32, 0.5, 0.5);
    P('sakura', 27, -33, 0); P('sakura', 54, -31, 1); P('sakura', 29, -46, 2); P('sakura', 52, -47, 0.5);
    for (let i = 0; i < 7; i++) P('himawari', 22 + i * 2.1, -23.5, i);
    // fields and the watermelon patch
    P('hatake', 16, 14); P('hatake', 25, 14); P('hatake', 16, 20.5);
    // shrine on a raised terrace to the north, reached by the stone steps
    P('ishidan', 0, -48, 0);
    const terrace = new THREE.Mesh(new THREE.BoxGeometry(28, 1.2, 22), [0, 0, 1, 0, 0, 0].map((k) => new THREE.MeshStandardMaterial({ color: k ? 0x5f8f38 : 0x8a8a84, roughness: 1 })));
    terrace.position.set(0, 0.6, -61.6); terrace.receiveShadow = true; this.root.add(terrace);
    this.addBox(-7.75, -50.5, 12.5, 0.4, 0, false); this.addBox(7.75, -50.5, 12.5, 0.4, 0, false);
    this.addBox(-14.1, -61.6, 0.4, 22, 0, false); this.addBox(14.1, -61.6, 0.4, 22, 0, false);
    this.addBox(-1.75, -48, 0.3, 3.0, 0, false); this.addBox(1.75, -48, 0.3, 3.0, 0, false); // stair sides
    this.mapRects.push({ x: 0, z: -61.6, w: 28, d: 22, ry: 0, terrace: true });
    const T = { y: 1.2 };
    P('torii', 0, -53.5, 0, { ...T, col: false }); this.addBox(-1.3, -53.5, 0.4, 0.4, 0, false); this.addBox(1.3, -53.5, 0.4, 0.4, 0, false);
    P('honden', 0, -64, 0, { ...T, col: { w: 6.8, d: 6.0 } });
    P('ishidoro', -2.4, -57, 0, T); P('ishidoro', 2.4, -57, 0, T);
    P('yatai', -8, -57, H, T); P('yatai', 8, -57, -H, T);
    for (const z of [-54, -59.5]) { P('chochin_post', -4.2, z, H, T); P('chochin_post', 4.2, z, -H, T); }
    P('sugi', -11, -68, 0, T); P('sugi', 11, -69, 1, T); P('sugi', -12, -60, 2, T); P('sugi', 12, -62, 1, T);
    P('hokora', -5, -36, H); P('kaki_tree', 6.5, -26, 1); P('kaki_tree', -6.5, -20, 2);
    // station across the river
    P('eki', 12, 46, PI);
    this.addBox(10.5, 44.7, 4.0, 0.2, 0, false);
    this.makeTrack();
    this.train = P('densha', -140, 49.2, 0, { y: 0.26 });
    this.trainState = { phase: 'wait', t: 12, x: -140 };
    // trees, bamboo, rocks and bushes; a forest ring closes the map
    for (const [x, z] of [[-55, -12], [-58, -6], [-53, -2], [58, 18], [55, 24], [-50, 30], [44, 26]]) P('take', x, z, x * z);
    for (const [x, z] of [[-10, 8], [26, 6], [-44, -24], [8, -14], [-28, 30], [36, 20]]) P('rock', x, z, x);
    for (const [x, z] of [[6, 8], [-6, -10], [22, -12], [-14, 14], [10, 26], [-40, 0], [30, -24], [-8, -40], [46, 8]]) P('bush', x, z, x + z);
    let k = 0;
    for (let a = 0; a < Math.PI * 2; a += 0.075) {
      const r = 72 + (k % 3) * 4 + Math.sin(k * 3.1) * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > 38 && Math.abs(x) < 80 && z < 56) { k++; continue; } // leave the railway open
      P('sugi', x, z, k++, { col: false, scale: 1 + (k % 4) * 0.12 });
    }
    // animals
    this.addAnimal('ushi', -42, -36, 4, 0.8); this.addAnimal('ushi', -37, -34, 4, 0.8);
    this.addAnimal('niwatori', -20, -3, 4, 1.2); this.addAnimal('niwatori', -22, -2, 4, 1.2); this.addAnimal('niwatori', -18, -1.5, 4, 1.2);
    this.cat = this.addAnimal('neko', 18, -2.2, 7, 0.9);
    this.dog = this.addAnimal('shiba', 31, -6, 5, 1.6);
    this.mapStatic = true;
  }

  makeTrack() {
    // rails and sleepers along the whole map, plus a low fence on the village side
    const g = new THREE.Group();
    const rail = new THREE.MeshStandardMaterial({ color: 0x8a8c90, metalness: 0.8, roughness: 0.4 });
    for (const z of [48.65, 49.75]) { const m = new THREE.Mesh(new THREE.BoxGeometry(300, 0.14, 0.08), rail); m.position.set(0, 0.19, z); g.add(m); }
    const bed = new THREE.Mesh(new THREE.BoxGeometry(300, 0.06, 3.2), new THREE.MeshStandardMaterial({ color: 0x6b6862, roughness: 1 })); bed.position.set(0, 0.03, 49.2); g.add(bed);
    const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.12, 2.4), new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1 }), 400);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < 400; i++) { mtx.makeTranslation(-150 + i * 0.75, 0.06, 49.2); sl.setMatrixAt(i, mtx); }
    sl.receiveShadow = true; g.add(sl);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), new THREE.MeshStandardMaterial({ color: 0x7b5a3a }), 140);
    for (let i = 0; i < 140; i++) { mtx.makeTranslation(-70 + i, 0.5, 47.4); posts.setMatrixAt(i, mtx); }
    g.add(posts);
    for (const y of [0.45, 0.9]) { const m = new THREE.Mesh(new THREE.BoxGeometry(140, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0x9b7a52 })); m.position.set(0, y, 47.4); g.add(m); }
    this.root.add(g);
    // the fence blocks the track except where the platform is
    this.addBox(-33, 47.4, 74, 0.2, 0, false); this.addBox(48.5, 47.4, 43, 0.2, 0, false);
    this.addBox(12, 47.9, 16, 0.2, 0, false); // platform edge
  }

  addAnimal(name, x, z, range, speed) {
    const o = this.place(name, x, z, Math.random() * 6, { col: false });
    const a = { name, o, home: new THREE.Vector2(x, z), range, speed, target: new THREE.Vector2(x, z), wait: Math.random() * 3, follow: null, t: Math.random() * 10 };
    this.animals.push(a);
    return a;
  }

  // ------------------------------------------------------------------ physics helpers
  collide(p, r) {
    for (const c of this.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z;
      if (c.type === 'circle') {
        const d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m && d > 1e-5) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
        continue;
      }
      if (Math.abs(dx) > c.hw + c.hd + r + 1 || Math.abs(dz) > c.hw + c.hd + r + 1) continue;
      // into box space (rotation.y = ry maps local x to (c, -s))
      const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
      const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
      let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
      let nx, nz;
      if (d > 1e-5) { if (d >= r) continue; nx = qx + ex / d * r; nz = qz + ez / d * r; }
      else { // centre inside: push out through the nearest face
        const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
        if (px < pz) { nx = Math.sign(lx || 1) * (c.hw + r); nz = lz; } else { nx = lx; nz = Math.sign(lz || 1) * (c.hd + r); }
      }
      p.x = c.x + nx * c.c + nz * c.s; p.z = c.z - nx * c.s + nz * c.c;
    }
    const R = 66, d = Math.hypot(p.x, p.z);
    if (d > R) { p.x *= R / d; p.z *= R / d; }
  }
  // is (x, z) inside a solid box? used to keep the camera out of buildings
  insideBox(x, z) {
    for (const c of this.colliders) {
      if (c.type !== 'box' || c.hw * c.hd < 2) continue;
      const dx = x - c.x, dz = z - c.z;
      if (Math.abs(dx * c.c - dz * c.s) < c.hw + 0.3 && Math.abs(dx * c.s + dz * c.c) < c.hd + 0.3) return true;
    }
    return false;
  }
  floorAt(x, z) {
    if (Math.abs(x) < 1.5) {
      if (z <= -46.7 && z > -49.4) return (-46.7 - z) / 2.7 * 1.2; // stone steps
      if (z <= -49.4 && z > -50.7) return 1.2;
    }
    if (z <= -50.7 && Math.abs(x) < 14 && z > -72.6) return 1.2; // shrine terrace
    if (Math.abs(x) < 0.9 && z > 31 && z < 37) return 0.64; // bridge deck
    if (x > 5 && x < 20.6 && z > 44.5 && z < 47.6) return 0.9; // platform
    if (x >= 20.6 && x < 23.6 && z > 44.5 && z < 46.5) return 0.9 * (23.6 - x) / 3; // ramp
    return 0;
  }
  inRiver(x, z) { return z > 32.4 && z < 35.6 && !(Math.abs(x) < 0.9) && Math.abs(x) < 70; }

  // ------------------------------------------------------------------ time of day: 8:00 .. 18:00
  setHour(h, focus) {
    this.hour = h;
    const ev = smooth(15.5, 18, h), dusk = smooth(17, 18.2, h);
    const top = new THREE.Color(0x4a8fd8).lerp(new THREE.Color(0x3a4a8a), ev).lerp(new THREE.Color(0x1c2250), dusk);
    const bot = new THREE.Color(0xcfe3f0).lerp(new THREE.Color(0xffa86a), ev).lerp(new THREE.Color(0xd06a50), dusk);
    this.skyU.top.value.copy(top); this.skyU.bottom.value.copy(bot);
    this.scene.fog.color.copy(bot);
    // the sun travels east -> south -> west and sinks towards the end of the day
    const a = lerp(-1.1, 1.25, (h - 8) / 10), el = Math.max(0.12, Math.sin(lerp(0.75, 2.85, (h - 8) / 10)) * 1.0);
    const dir = new THREE.Vector3(Math.sin(a) * 60, el * 70, -Math.cos(a) * 20 + 30);
    this.sun.position.copy(focus).add(dir); this.sun.target.position.copy(focus);
    this.sun.color.set(0xffffff).lerp(new THREE.Color(0xff9a50), ev);
    this.sun.intensity = lerp(2.6, 1.3, ev) * (1 - dusk * 0.5);
    this.hemi.intensity = lerp(1.25, 0.75, ev) * (1 - dusk * 0.3);
    this.hemi.color.set(0xdcefff).lerp(new THREE.Color(0xffc8a0), ev);
    const glow = smooth(15.8, 17.5, h);
    for (const m of this.glowMats) m.emissiveIntensity = (m.name === 'glow' ? 0.4 : 0.05) + glow * 2.5;
  }

  update(dt, player) {
    if (this.wheel) this.wheel.rotation.x -= dt * 0.7;
    this.updateTrain(dt);
    for (const a of this.animals) {
      a.t += dt;
      const p = a.o.position, tgt = new THREE.Vector2();
      if (a.follow) { // trotting after the player
        const behind = new THREE.Vector2(player.pos.x, player.pos.z);
        if (behind.distanceTo(new THREE.Vector2(p.x, p.z)) > 1.6) tgt.copy(behind); else tgt.set(p.x, p.z);
      } else {
        a.wait -= dt;
        if (a.wait <= 0 && new THREE.Vector2(p.x, p.z).distanceTo(a.target) < 0.3) {
          const ang = Math.random() * Math.PI * 2, r = Math.random() * a.range;
          a.target.set(a.home.x + Math.cos(ang) * r, a.home.y + Math.sin(ang) * r); a.wait = 1 + Math.random() * 4;
        }
        tgt.copy(a.wait > 0 ? new THREE.Vector2(p.x, p.z) : a.target);
      }
      const dx = tgt.x - p.x, dz = tgt.y - p.z, d = Math.hypot(dx, dz);
      const spd = a.follow ? Math.min(player.speed * 1.05 + 0.5, 6) : a.speed;
      if (d > 0.05) {
        const step = Math.min(d, spd * dt);
        p.x += dx / d * step; p.z += dz / d * step;
        const want = Math.atan2(dx, dz);
        let diff = want - a.o.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        a.o.rotation.y += diff * Math.min(1, dt * 8);
        a.o.position.y = this.floorAt(p.x, p.z) + Math.abs(Math.sin(a.t * 12)) * (a.name === 'ushi' ? 0.03 : 0.06);
      } else a.o.position.y = this.floorAt(p.x, p.z);
      if (a.name !== 'ushi') { const v = new THREE.Vector3(p.x, 0, p.z); this.collide(v, 0.25); p.x = v.x; p.z = v.z; }
    }
  }

  updateTrain(dt) {
    const s = this.trainState;
    s.event = null;
    if (s.phase === 'wait') { s.t -= dt; if (s.t <= 0) { s.phase = 'in'; s.x = -150; s.v = 14; s.event = 'approach'; } }
    else if (s.phase === 'in') { // brake into the station (stop at x = 12)
      const d = 12 - s.x; s.v = Math.max(1.2, Math.min(14, Math.sqrt(Math.max(0, d) * 2 * 1.6)));
      s.x += s.v * dt; if (d < 0.05) { s.x = 12; s.phase = 'stop'; s.t = 6; s.event = 'arrive'; }
    } else if (s.phase === 'stop') { s.t -= dt; if (s.t <= 0) { s.phase = 'out'; s.v = 0; s.event = 'depart'; } }
    else if (s.phase === 'out') { s.v = Math.min(16, s.v + 1.4 * dt); s.x += s.v * dt; if (s.x > 160) { s.phase = 'wait'; s.t = 40; } }
    this.train.position.x = s.x;
  }
}
