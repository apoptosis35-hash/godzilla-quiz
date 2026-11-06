// The free-roam town: a 4x4 grid of blocks cut by roads, lined with shops and houses, plus landmark blocks
// (school, park, shrine, bon-odori plaza, supermarket, bathhouse, granny's house). Static models are batched.
import * as THREE from 'three';
import { A, BUILDINGS, StaticBatch, clone } from './assets.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const ROADS = [-150, -75, 0, 75, 150];
export const RW = 6;          // road half width
export const PLATE = 28.5;    // block plate half size (blocks are 75 m apart)
export const BOUND = 158;
export const bc = (i) => -112.5 + 75 * i; // block centre

export const POI = {
  school: { name: '小学校', icon: '🏫', x: bc(1), z: -82, r: 6 },
  park: { name: '公園', icon: '🌳', x: bc(2), z: bc(1), r: 24 },
  shrine: { name: '神社', icon: '⛩️', x: bc(3), z: 86, r: 4 },
  bon: { name: '盆踊り広場', icon: '🏮', x: bc(1), z: bc(2), r: 12 },
  sale: { name: 'スーパー特売', icon: '🥚', x: bc(3) - 21, z: bc(0), r: 4 },
  sento: { name: '銭湯', icon: '♨️', x: bc(0), z: 82, r: 3.5 },
  home: { name: 'ばあちゃんの家', icon: '🏠', x: 7.5, z: 37.5, r: 0 },
};

export class Town {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.dyn = []; // landmark meshes that are not batched
    const top = new THREE.Color(0x3d9cff), hor = new THREE.Color(0xffe2b8);
    scene.fog = new THREE.Fog(hor, 45, 135);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: top }, hor: { value: hor } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(hor, top, smoothstep(-0.02, 0.5, h)), 1.0); }',
    }));
    scene.add(this.sky);
    const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    for (let i = 0; i < 12; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(rnd(5, 9), 12, 8), cm); s.position.set(k * 7 - 14, rnd(-1, 2), rnd(-2, 2)); s.scale.y = 0.55; c.add(s); }
      const a = rnd(0, Math.PI * 2), r = rnd(230, 320);
      c.position.set(Math.cos(a) * r, rnd(60, 110), Math.sin(a) * r); c.lookAt(0, c.position.y, 0);
      scene.add(c);
    }
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x9a8470, 1.4));
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.castShadow = true; sun.shadow.mapSize.set(512, 512);
    const sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);

    this.buildGround();
    const place = [];
    const add = (n, x, z, ry, o = {}) => {
      if (!A.models[n]) return;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, o.y ?? 0.15, z), new THREE.Quaternion().setFromAxisAngle(_Y, ry), new THREE.Vector3(1, 1, 1));
      place.push({ n, m, x, z });
      if (o.solid !== false && A.size[n] && (o.solid || BUILDINGS.includes(n))) this.solidFrom(n, x, z, ry, o.pad ?? 0.2);
    };
    this.layout(add);
    this.batch = new StaticBatch(scene, place);
    this.lodT = 0;
  }
  solidFrom(n, x, z, ry, pad) {
    const [w, , d] = A.size[n];
    const along = Math.abs(Math.cos(ry)) > 0.5;
    const sw = along ? w : d, sd = along ? d : w;
    this.colliders.push({ x0: x - sw / 2 + pad, x1: x + sw / 2 - pad, z0: z - sd / 2 + pad, z1: z + sd / 2 - pad });
  }
  box(x0, x1, z0, z1) { this.colliders.push({ x0, x1, z0, z1 }); }
  buildGround() {
    const S = 340;
    const asphalt = A.tex.asphalt ? A.tex.asphalt.clone() : null;
    if (asphalt) { asphalt.needsUpdate = true; asphalt.repeat.set(S / 4, S / 4); }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshStandardMaterial({ map: asphalt, color: 0x9a9a9e, roughness: 0.92 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);
    // dashed centre lines
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = 'rgba(245,245,245,.95)'; g.fillRect(26, 0, 12, 32);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(1, 330 / 8);
    const lm = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
    for (const r of ROADS) for (const vert of [true, false]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 330), lm); m.rotation.x = -Math.PI / 2; if (!vert) m.rotation.z = Math.PI / 2;
      m.position.set(vert ? r : 0, 0.012, vert ? 0 : r); this.scene.add(m);
    }
    // block plates (pavement; grass in the park), raised a kerb's height
    const pav = A.tex.paving ? A.tex.paving.clone() : null; if (pav) { pav.needsUpdate = true; pav.repeat.set(63 / 3, 63 / 3); }
    const grass = A.tex.grass ? A.tex.grass.clone() : null; if (grass) { grass.needsUpdate = true; grass.repeat.set(53 / 4, 53 / 4); }
    const pm = new THREE.MeshStandardMaterial({ map: pav, color: 0xe8e2d8, roughness: 0.9 });
    const gm = new THREE.MeshStandardMaterial({ map: grass, color: 0xb8d890, roughness: 1 });
    const geo = new THREE.BoxGeometry(PLATE * 2 + 6, 0.15, PLATE * 2 + 6);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const m = new THREE.Mesh(geo, pm); m.position.set(bc(i), 0.075, bc(j)); m.receiveShadow = true; this.scene.add(m);
      if (i === 2 && j === 1) { const gr = new THREE.Mesh(new THREE.PlaneGeometry(PLATE * 2 - 4, PLATE * 2 - 4), gm); gr.rotation.x = -Math.PI / 2; gr.position.set(bc(i), 0.16, bc(j)); gr.receiveShadow = true; this.scene.add(gr); }
    }
    const rim = new THREE.MeshStandardMaterial({ map: pav, color: 0xd8d0c4, roughness: 0.9 });
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(380, 0.15, 30), rim); a.position.set(0, 0.075, s * 172); this.scene.add(a);
      const b = new THREE.Mesh(new THREE.BoxGeometry(30, 0.15, 380), rim); b.position.set(s * 172, 0.075, 0); this.scene.add(b);
    }
  }
  // a row of buildings along a line; `face` is the unit direction their fronts look at (towards the road)
  row(add, x0, z0, x1, z1, face, skip) {
    const len = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / len, dz = (z1 - z0) / len;
    const ry = Math.atan2(face[0], face[1]);
    let s = 0;
    while (s < len - 5) {
      const n = pick(BUILDINGS), [w, , d] = A.size[n] || [8, 8, 9];
      if (s + w > len + 1.5) break;
      const cx = x0 + dx * (s + w / 2) - face[0] * d / 2, cz = z0 + dz * (s + w / 2) - face[1] * d / 2;
      if (!skip || !skip(cx, cz)) add(n, cx, cz, ry);
      s += w + rnd(0.3, 1.4);
    }
  }
  normalBlock(add, i, j, skip) {
    const x = bc(i), z = bc(j), e = PLATE - 0.6;
    this.row(add, x - e, z - e, x + e, z - e, [0, -1], skip);
    this.row(add, x + e, z + e, x - e, z + e, [0, 1], skip);
    this.row(add, x + e, z - e + 9, x + e, z + e - 9, [1, 0], skip);
    this.row(add, x - e, z + e - 9, x - e, z - e + 9, [-1, 0], skip);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(Math.random() < 0.5 ? 'street_light' : 'utility_pole', x + sx * (PLATE + 1.5), z + sz * (PLATE + 1.5), 0, { solid: false });
  }
  layout(add) {
    const E = BOUND + 1;
    this.row(add, -E, -E, E, -E, [0, 1]); this.row(add, E, E, -E, E, [0, -1]);
    this.row(add, E, -E + 10, E, E - 10, [-1, 0]); this.row(add, -E, E - 10, -E, -E + 10, [1, 0]);
    this.box(-260, 260, -260, -BOUND); this.box(-260, 260, BOUND, 260); this.box(-260, -BOUND, -260, 260); this.box(BOUND, 260, -260, 260);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const key = i + ',' + j;
      if (key === '1,0') this.schoolBlock(add, i, j);
      else if (key === '2,1') this.parkBlock(add, i, j);
      else if (key === '3,3') this.shrineBlock(add, i, j);
      else if (key === '1,2') this.bonBlock(add, i, j);
      else if (key === '3,0') this.marketBlock(add, i, j);
      else if (key === '0,3') { this.normalBlock(add, i, j, (x, z) => z < bc(j) - 8 && Math.abs(x - bc(i)) < 15); this.landmark('sento', bc(i), 88.5, Math.PI, [bc(i) - 7, bc(i) + 7, 83.5, 94]); }
      else if (key === '2,2') { this.normalBlock(add, i, j, (x, z) => x < bc(i) - 18 && Math.abs(z - bc(j)) < 10); add('house_old', 9.5 + 3.9, 37.5, -Math.PI / 2); }
      else this.normalBlock(add, i, j);
    }
    for (const [x, z] of [[0, 0], [75, 0], [-75, 0], [0, -75], [0, 75], [-75, -75], [75, 75]]) add('traffic_light', x - 7.2, z - 7.2, Math.PI / 4, { solid: false });
  }
  landmark(name, x, z, ry, b) {
    const o = clone(name); o.position.set(x, 0.15, z); o.rotation.y = ry; o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } });
    this.scene.add(o); this.dyn.push(o);
    if (b) this.box(...b);
    return o;
  }
  schoolBlock(add, i) {
    const x = bc(i);
    this.landmark('school', x, -98.5, 0, [x - 20, x + 20, -108.5, -94]);
    for (let k = 0; k < 6; k++) add('tree_sakura', x - 25 + k * 10, -132, 0, { solid: false });
  }
  parkBlock(add, i, j) {
    const x = bc(i), z = bc(j), e = PLATE - 3;
    for (let k = 0; k < 7; k++) { const t = -e + k * (2 * e / 6); add(k % 2 ? 'tree_sakura' : 'tree_broadleaf', x + t, z - e, 0, { solid: false }); add(k % 2 ? 'tree_broadleaf' : 'tree_sakura', x + t, z + e, 0, { solid: false }); }
    add('azumaya', x - 15, z + 12, 0, { solid: true, pad: 1.5 });
    for (let k = 0; k < 4; k++) add('bench', x - 10 + k * 7, z - 17, 0, { solid: false });
  }
  shrineBlock(add, i, j) {
    const x = bc(i), z = bc(j);
    add('torii', x, 86, 0, { solid: false });
    add('shrine_hall', x, z + 12, Math.PI, { solid: true });
    add('komainu', x - 4, 98, 0, { solid: false }); add('komainu', x + 4, 98, 0, { solid: false });
    for (let k = 0; k < 4; k++) { add('ishidoro', x - 3.5, 90 + k * 5, 0, { solid: false }); add('ishidoro', x + 3.5, 90 + k * 5, 0, { solid: false }); }
    for (let k = 0; k < 5; k++) { add('tree_pine', x - 20, 92 + k * 8, 0, { solid: false }); add('tree_pine', x + 20, 92 + k * 8, 0, { solid: false }); }
  }
  bonBlock(add, i, j) {
    const x = bc(i), z = bc(j);
    this.landmark('yagura', x, z, 0, [x - 2.3, x + 2.3, z - 2.3, z + 2.3]);
    for (let k = 0; k < 6; k++) add('market_tent', x - 22 + k * 8.8, z - 24, 0, { solid: false });
  }
  marketBlock(add, i, j) {
    const x = bc(i), z = bc(j);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) add('market_tent', x - 6 + k * 6, z - 12 + r * 10, Math.PI / 2, { solid: true, pad: 0.6 });
    for (let k = 0; k < 3; k++) add('parasol', x + 22, z - 10 + k * 10, 0, { solid: false });
    const sg = clone('sale'); sg.position.set(POI.sale.x, 0.15, POI.sale.z); sg.rotation.y = -Math.PI / 2; this.scene.add(sg); this.dyn.push(sg);
  }
  isRoad(x, z) {
    if (Math.abs(x) > BOUND - 3 || Math.abs(z) > BOUND - 3) return false;
    return ROADS.some((r) => Math.abs(x - r) < RW) || ROADS.some((r) => Math.abs(z - r) < RW);
  }
  // push a circle out of the solid boxes; returns the wall normal that was hit (or null)
  collide(p, r) {
    let hit = null;
    for (const b of this.colliders) {
      if (p.x < b.x0 - r || p.x > b.x1 + r || p.z < b.z0 - r || p.z > b.z1 + r) continue;
      const cx = Math.max(b.x0, Math.min(b.x1, p.x)), cz = Math.max(b.z0, Math.min(b.z1, p.z));
      let dx = p.x - cx, dz = p.z - cz; const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-4) {
        const o = [[p.x - b.x0, -1, 0], [b.x1 - p.x, 1, 0], [p.z - b.z0, 0, -1], [b.z1 - p.z, 0, 1]].sort((a, c) => a[0] - c[0])[0];
        dx = o[1]; dz = o[2]; p.x += dx * (o[0] + r); p.z += dz * (o[0] + r);
      } else { p.x = cx + dx / d * r; p.z = cz + dz / d * r; dx /= d; dz /= d; }
      hit = { x: dx, z: dz };
    }
    return hit;
  }
  update(px, pz, camPos, dt) {
    this.lodT -= dt;
    if (this.lodT <= 0) {
      this.lodT = 0.25;
      for (const h of this.batch.handles) {
        const d = Math.hypot(h.p.x - px, h.p.z - pz);
        this.batch.set(h, d < 34 ? 1 : d < 140 ? 2 : 0);
      }
      for (const o of this.dyn) o.visible = Math.hypot(o.position.x - px, o.position.z - pz) < 150;
    }
    this.sun.position.set(px - 8, 22, pz + 6); this.sun.target.position.set(px, 0, pz);
    this.sky.position.copy(camPos);
  }
}
const _Y = new THREE.Vector3(0, 1, 0);
