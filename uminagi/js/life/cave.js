// うみなぎ洞窟: a dark mouth in the west cliff of the harbour, timbered like an old mine. Inside are floors of
// rocky passages laid out anew every day (a maze from the day's seed, bigger the deeper you go), lit only by
// ぽっけ's lantern and glowing crystals. On each floor: crystal clusters to pick, ore veins and cracks for the
// shovel, glowing moss, a treasure chest or two in the dead ends (money, gold, recipes the surface never teaches),
// bats under the roof, and a hole down to the next floor in the cell farthest from the rope back up.
// Like the interiors (home.js) the floors are a stage above the lighthouse hill; home.inside = 'cave' tells the
// rest of island life that ぽっけ is indoors.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ITEMS, ICON_BY_ID, dayKey, seeded } from './state.js';
import { RECIPES } from './items2.js';

const PI = Math.PI;
const STAGE = { x: -118, z: -12, y: 100 };   // floors are drawn here (land below, away from the house stage)
const C = 5;                                 // passage cell size (m)
const H = 2.9;                               // wall height
const MOUTH = { x: -83, z: -2 };             // in front of the mouth: the cliff rises to the west
const SP = { name: 'ぽっけ', color: '#6a7a8a', pitch: 1.1 };
const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];
// smooth-ish noise from a position: coincident vertices of the rock walls move together, so no cracks
const nz = (x, y, z) => 0.2 * Math.sin(x * 1.7 + z * 0.9) * Math.cos(y * 2.1 + x * 0.6) + 0.12 * Math.sin(z * 3.1 + y * 1.3 - x * 0.7) + 0.07 * Math.sin(x * 5.3 - z * 4.1 + y * 3.7);

// ---------------------------------------------------------------- cave furniture (DIY only), made in code
const glow = (color, k = 1.4) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.25, metalness: 0.05 });
const rock = (color = 0x8a8278) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true });
function crystals(g, n, color, r0, h0, h1, y = 0, seed = 1) {
  const r = seeded('cr' + seed), m = glow(color);
  for (let i = 0; i < n; i++) {
    const h = h0 + r() * (h1 - h0), c = new THREE.Mesh(new THREE.ConeGeometry(0.035 + h * 0.18, h, 6), m);
    const a = r() * PI * 2, d = r() * r0;
    c.position.set(Math.cos(a) * d, y + h / 2 - 0.02, Math.sin(a) * d); c.rotation.set((r() - 0.5) * 0.7, r() * PI, (r() - 0.5) * 0.7); c.castShadow = true; g.add(c);
  }
  return g;
}
const MAKERS = {
  furn_crystal_lamp: () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 8), rock(0x6a665e)); b.position.y = 0.06; g.add(b); return crystals(g, 6, 0x8fdcff, 0.09, 0.2, 0.5, 0.11, 3); },
  furn_glow_pot: () => {
    const g = new THREE.Group(), pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.26, 12), new THREE.MeshStandardMaterial({ color: 0xb8643a, roughness: 0.8 })); pot.position.y = 0.13; g.add(pot);
    const moss = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 6, 0, PI * 2, 0, PI / 2), glow(0x7cf09a, 0.9)); moss.position.y = 0.25; moss.scale.y = 0.7; g.add(moss);
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), glow(0xd8ff9a, 2)); const a = i * 1.3; s.position.set(Math.cos(a) * 0.1, 0.33 + (i % 2) * 0.03, Math.sin(a) * 0.1); g.add(s); }
    return g;
  },
  furn_geode: () => {
    const g = new THREE.Group(), shell = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8, 0, PI), rock(0x7a6a5e)); shell.material.side = THREE.DoubleSide; shell.position.y = 0.36; shell.rotation.y = PI / 2; g.add(shell);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.33, 14), new THREE.MeshStandardMaterial({ color: 0x4a2a6a, roughness: 0.6 })); inner.position.set(0, 0.36, 0.0); g.add(inner);
    const c = crystals(new THREE.Group(), 14, 0xc68cff, 0.24, 0.06, 0.16, 0, 7); c.rotation.x = PI / 2; c.position.set(0, 0.36, 0.01); g.add(c);
    return g;
  },
  furn_stalagmite: () => {
    const g = new THREE.Group(), m = rock(0xb8ad9a);
    for (const [x, z, h, rr] of [[0, 0, 1.1, 0.2], [0.18, 0.1, 0.6, 0.12], [-0.15, 0.12, 0.45, 0.1]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(rr, h, 7, 3), m); c.position.set(x, h / 2, z); c.castShadow = true; g.add(c); }
    return crystals(g, 3, 0x9ae8ff, 0.18, 0.08, 0.16, 0, 11);
  },
};
const CAVE_FURN = [
  { id: 'furn_crystal_lamp', name: '水晶ランプ', icon: '💎', w: 0.45, d: 0.45, where: 'both', light: true, price: 6000 },
  { id: 'furn_glow_pot', name: 'ひかりごけの鉢', icon: '🪴', w: 0.45, d: 0.45, where: 'both', light: true, price: 3000 },
  { id: 'furn_geode', name: '大きなジオード', icon: '🔮', w: 0.8, d: 0.6, where: 'both', price: 12000 },
  { id: 'furn_stalagmite', name: 'しょうにゅう石', icon: '🗻', w: 0.6, d: 0.6, where: 'both', price: 5000 },
];
for (const f of CAVE_FURN) { ITEMS[f.id] = { ...f, kind: 'furniture', make: MAKERS[f.id] }; ICON_BY_ID[f.id] = f.icon; }
const CAVE_RECIPES = RECIPES.filter((r) => r.cave).map((r) => r.id);

export class Cave {
  constructor(life) {
    this.life = life; this.st = life.st; this.town = life.town; this.player = life.player; this.scene = life.scene;
    this.st.ext.cave ||= { deep: 0, trips: 0 };
    this.on = false; this.floor = 0; this.things = []; this.cols = []; this.bats = [];
    this.group = new THREE.Group(); this.group.name = 'cave'; this.group.visible = false; this.scene.add(this.group);
    this.lantern = new THREE.PointLight(0xffd6a0, 0, 24, 1.1); this.scene.add(this.lantern);   // always in the scene: no shader rebuild on entering
    this.buildMouth();
  }
  // ---------------------------------------------------------------- the mouth in the cliff
  buildMouth() {
    const L = this.life, G = L.ground, h0 = G.height(MOUTH.x, MOUTH.z);
    let fx = MOUTH.x; for (let k = 0; k < 40 && G.height(fx - 0.25, MOUTH.z) - h0 < 0.35; k++) fx -= 0.25;   // the foot of the cliff
    const g = new THREE.Group(), y = h0;
    g.position.set(fx, y, MOUTH.z); g.rotation.y = PI / 2;   // facing east (+x)
    const sh = new THREE.Shape(); sh.moveTo(-1.15, -0.2); sh.lineTo(-1.15, 1.4); sh.absarc(0, 1.4, 1.15, PI, 0, true); sh.lineTo(1.15, -0.2); sh.lineTo(-1.15, -0.2);
    const hole = new THREE.Mesh(new THREE.ShapeGeometry(sh, 16), new THREE.MeshBasicMaterial({ color: 0x060504 })); hole.position.z = -0.05; g.add(hole);
    // a darker floor running in, and old mine timbers round the opening
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.6), new THREE.MeshBasicMaterial({ color: 0x1a1612 })); fl.rotation.x = -PI / 2; fl.position.set(0, 0.03, 0.55); g.add(fl);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.9 });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.9, 0.22), wood); p.position.set(s * 1.2, 1.25, 0.1); p.rotation.z = s * 0.04; p.castShadow = true; g.add(p); }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.26, 0.26), wood); lintel.position.set(0, 2.72, 0.1); lintel.castShadow = true; g.add(lintel);
    // a lantern hanging from the lintel and a signboard
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), glow(0xffc070, 1.6)); lamp.position.set(0.75, 2.38, 0.24); g.add(lamp);
    const sign = L.textSprite('⛏ うみなぎ洞窟', 0.62, 420); sign.position.set(0, 3.35, 0.2); g.add(sign);
    L.root.add(g); this.mouth = g;
    // rocks heaped either side
    const rk = ['rock_a', 'rock_b', 'rock_c'], r = seeded('cave-mouth');
    for (let i = 0; i < 6; i++) {
      const name = rk[i % 3]; if (!L.town.protos[name]) continue;
      const side = i % 2 ? 1 : -1, zz = MOUTH.z + side * (2.0 + r() * 1.2), xx = fx + r() * 0.6;
      L.natureClone(name, xx, G.height(xx, zz) - 0.1, zz, r() * 6.28, 0.22 + r() * 0.18);
    }
    this.door = { x: fx + 1.3, z: MOUTH.z };
  }
  // ---------------------------------------------------------------- A in front of things
  target(front) {
    if (!this.on) {
      if (this.life.home.inside || !this.door) return null;
      return front(this.door.x, this.door.z, 2.0) ? { label: 'はいる', run: () => this.ask() } : null;
    }
    for (const t of this.things) if (!t.gone && front(t.x, t.z, t.r)) return { label: t.label(), run: () => t.run(t) };
    return null;
  }
  async ask() {
    const ui = this.life.ui, first = !this.st.ext.cave.trips;
    const lines = first ? ['ひんやりした 風が ふいてくる……。', 'ここは 「うみなぎ洞窟」。中の みちは 毎日 かたちが かわるらしい。', '水晶や 鉄、たからばこが ねむっているとか。はいってみる?']
      : [`うみなぎ洞窟だ。(いちばん深く もぐったのは 地下${this.st.ext.cave.deep}かい)`, 'はいってみる?'];
    const k = await ui.say(null, lines, ['はいる', 'やめる']);
    if (k === 0) await this.enter(1);
  }
  // ---------------------------------------------------------------- in and out
  async enter(f) {
    const L = this.life, pl = this.player;
    await L.tour.blackout(() => {
      if (!this.on) {
        this.back = { x: pl.pos.x, z: pl.pos.z, yaw: pl.yaw, pitch: pl.pitch, dist: pl.dist };
        this.hidden = [];
        for (const o of this.scene.children) if (o !== this.group && !o.isLight && o.visible && o !== this.town.root) { o.visible = false; this.hidden.push(o); }
        for (const o of this.town.root.children) if (o !== pl.model && o.visible) { o.visible = false; this.hidden.push(o); }
        this.bg = this.scene.background; this.scene.background = new THREE.Color(0x020203);
        this.on = true; L.home.inside = 'cave'; this.group.visible = true; this.st.ext.cave.trips++;
        pl.skills.climb = false; pl.skills.web = false;   // no climbing over the maze walls
      }
      this.build(f);
    });
    if (f > this.st.ext.cave.deep) { this.st.ext.cave.deep = f; this.st.save(); if (f > 1) L.ui.toast(`しんきろく! 地下${f}かい`, 2000); }
    L.emit('cave');
    L.ui.toast(`うみなぎ洞窟 地下${f}かい`, 1600);
  }
  async leave() {
    const L = this.life, pl = this.player;
    await L.tour.blackout(() => {
      this.clear();
      for (const o of this.hidden) o.visible = true;
      this.scene.background = this.bg; this.group.visible = false; this.lantern.intensity = 0;
      this.on = false; L.home.inside = null;
      L.world.apply(true);   // the sky, sun and fog of the time of day again
      pl.place(this.door.x + 0.6, this.door.z, PI / 2); pl.heading = PI / 2; pl.pitch = this.back.pitch; pl.dist = this.back.dist;
      pl.lastSafe.copy(pl.pos);
      L.skills.apply();
    });
    L.ui.toast('地上に もどった', 1400);
  }
  clear() {
    for (const c of this.cols) { const i = this.town.colliders.indexOf(c); if (i >= 0) this.town.colliders.splice(i, 1); }
    this.cols = []; this.things = []; this.bats = []; this.segs = [];
    this.group.traverse((o) => { if (o.isMesh || o.isSprite) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
    this.wallMat?.dispose(); this.fadeMat?.dispose();
    this.group.clear();
  }
  // ---------------------------------------------------------------- one floor
  build(f) {
    this.clear(); this.floor = f;
    const r = seeded(`cave:${dayKey()}:${f}`), N = Math.min(7, 3 + f), X = STAGE.x, Z = STAGE.z, Y = STAGE.y;
    const cx = (i) => X + (i - (N - 1) / 2) * C, cz = (j) => Z + (j - (N - 1) / 2) * C;
    // the maze: walls east (vE[i][j], between i and i+1) and south (hS[i][j], between j and j+1); carved depth first
    const vE = [...Array(N)].map(() => Array(N).fill(true)), hS = [...Array(N)].map(() => Array(N).fill(true));
    const start = [Math.floor(N / 2), Math.floor(N / 2)], seen = new Set([start.join()]), stack = [start];
    while (stack.length) {
      const [i, j] = stack[stack.length - 1];
      const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dj]) => [i + di, j + dj, di, dj]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !seen.has(a + ',' + b));
      if (!next.length) { stack.pop(); continue; }
      const [a, b, di, dj] = pick(next, r);
      if (di) vE[Math.min(i, a)][j] = false; else hS[i][Math.min(j, b)] = false;
      seen.add(a + ',' + b); stack.push([a, b]);
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { if (i < N - 1 && r() < 0.1) vE[i][j] = false; if (j < N - 1 && r() < 0.1) hS[i][j] = false; }   // a few loops
    const open = (i, j) => [[i < N - 1 && !vE[i][j], i + 1, j], [i > 0 && !vE[i - 1]?.[j], i - 1, j], [j < N - 1 && !hS[i][j], i, j + 1], [j > 0 && !hS[i][j - 1], i, j - 1]].filter((e) => e[0]).map((e) => [e[1], e[2]]);
    // distances from the rope: the hole down is in the farthest cell, treasure in the dead ends
    const dist = new Map([[start.join(), 0]]), q = [start];
    while (q.length) { const [i, j] = q.shift(), d = dist.get(i + ',' + j); for (const [a, b] of open(i, j)) if (!dist.has(a + ',' + b)) { dist.set(a + ',' + b, d + 1); q.push([a, b]); } }
    let far = start; for (const [k, d] of dist) if (d > dist.get(far.join())) far = k.split(',').map(Number);
    const cells = [...dist.keys()].map((k) => k.split(',').map(Number)).filter(([i, j]) => !(i === start[0] && j === start[1]) && !(i === far[0] && j === far[1]));
    const deadEnds = cells.filter(([i, j]) => open(i, j).length === 1), others = cells.filter(([i, j]) => open(i, j).length > 1);

    // ---- rock: walls (segments + pillars), the floor, rubble and stalagmites, all merged into a few meshes
    const segGeo = [], tint = [0x6e6258, 0x5e6470, 0x6a5a6e, 0x5a6a64][f % 4];
    const seg = (x, z, len, alongX) => {
      const g = new THREE.BoxGeometry(alongX ? len : 0.95, H, alongX ? 0.95 : len, Math.ceil(len * 1.6), 4, 2).toNonIndexed();
      g.translate(x, Y + H / 2 - 0.05, z); this.rough(g, 0.32, Y); segGeo.push({ g, x, z, hw: (alongX ? len : 0.95) / 2 + 0.3, hd: (alongX ? 0.95 : len) / 2 + 0.3 });
      const c = { type: 'b', x, z, hw: (alongX ? len : 0.95) / 2, hd: (alongX ? 0.95 : len) / 2, c: 1, s: 0, y0: Y - 1, y1: Y + H, cam: true }; this.cols.push(c);   // cam: the camera pulls in rather than look through
    };
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (j === 0) seg(cx(i), cz(0) - C / 2, C + 0.95, true);
      if (i === 0) seg(cx(0) - C / 2, cz(j), C + 0.95, false);
      if (hS[i][j]) seg(cx(i), cz(j) + C / 2, C + 0.95, true);
      if (vE[i][j]) seg(cx(i) + C / 2, cz(j), C + 0.95, false);
    }
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {   // knobbly pillars hide the joins
      const g = new THREE.DodecahedronGeometry(0.75, 1).toNonIndexed(); g.scale(1, (H + 0.4) / 1.5, 1); const px = X + (i - N / 2) * C, pz = Z + (j - N / 2) * C; g.translate(px, Y + H / 2, pz); this.rough(g, 0.25, Y); segGeo.push({ g, x: px, z: pz, hw: 1, hd: 1 });
    }
    const S = N * C + 1;
    const floor = new THREE.PlaneGeometry(S, S, N * 8, N * 8); floor.rotateX(-PI / 2); floor.translate(X, Y, Z);
    { const p = floor.attributes.position; for (let k = 0; k < p.count; k++) p.setY(k, Y - 0.04 + 0.035 * nz(p.getX(k) * 1.3, 0, p.getZ(k) * 1.3)); }
    this.cols.push({ type: 'b', x: X, z: Z, hw: S / 2, hd: S / 2, c: 1, s: 0, y0: Y - 1, y1: Y });
    const deco = [], stal = [];
    for (const [i, j] of [...dist.keys()].map((k) => k.split(',').map(Number))) {
      for (let k = 0; k < 5; k++) {   // pebbles
        const g = new THREE.DodecahedronGeometry(0.06 + r() * 0.12, 0).toNonIndexed(); g.translate(cx(i) + (r() - 0.5) * (C - 1.4), Y + 0.02, cz(j) + (r() - 0.5) * (C - 1.4)); deco.push(g);
      }
      if (r() < 0.55) {   // a stalagmite by the wall
        const h = 0.6 + r() * 1.1, g = new THREE.ConeGeometry(0.16 + h * 0.12, h, 7, 3).toNonIndexed(), a = r() * PI * 2;
        g.translate(cx(i) + Math.cos(a) * (C / 2 - 0.85), Y + h / 2, cz(j) + Math.sin(a) * (C / 2 - 0.85)); this.rough(g, 0.05, Y); stal.push(g);
      }
    }
    // walls are separate meshes so the ones between the camera and ぽっけ can turn see-through (update)
    this.wallMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.95, flatShading: true });
    this.fadeMat = this.wallMat.clone(); Object.assign(this.fadeMat, { transparent: true, opacity: 0.18, depthWrite: false });
    this.segs = segGeo.map(({ g, ...b }) => { const m = new THREE.Mesh(g, this.wallMat); m.castShadow = m.receiveShadow = true; this.group.add(m); return { m, ...b }; });
    const floorMesh = new THREE.Mesh(floor, new THREE.MeshStandardMaterial({ color: new THREE.Color(tint).multiplyScalar(0.7), roughness: 1, flatShading: true }));
    const decoMesh = new THREE.Mesh(mergeGeometries([...deco, ...stal]), new THREE.MeshStandardMaterial({ color: new THREE.Color(tint).offsetHSL(0, 0, 0.08), roughness: 0.9, flatShading: true }));
    for (const m of [floorMesh, decoMesh]) { m.receiveShadow = true; m.castShadow = m !== floorMesh; this.group.add(m); }
    // glowing mushrooms here and there (light to find the way by)
    const shroom = [];
    for (const [i, j] of others) if (r() < 0.45) {
      const a = r() * PI * 2, x0 = cx(i) + Math.cos(a) * (C / 2 - 0.9), z0 = cz(j) + Math.sin(a) * (C / 2 - 0.9);
      for (let k = 0; k < 4; k++) {
        const s = 0.05 + r() * 0.06, x = x0 + (r() - 0.5) * 0.5, z = z0 + (r() - 0.5) * 0.5;
        const cap = new THREE.SphereGeometry(s, 8, 4, 0, PI * 2, 0, PI / 2).toNonIndexed(); cap.translate(x, Y + s * 1.6, z); shroom.push(cap);
        const stem = new THREE.CylinderGeometry(s * 0.25, s * 0.3, s * 1.6, 5).toNonIndexed(); stem.translate(x, Y + s * 0.8, z); shroom.push(stem);
      }
    }
    if (shroom.length) this.group.add(new THREE.Mesh(mergeGeometries(shroom.map((g) => { g.deleteAttribute('uv'); return g; })), glow([0x7ae0ff, 0xb08aff, 0x8aff9a, 0xffa0e0][f % 4], 1.1)));
    this.town.colliders.push(...this.cols);

    // ---- the rope up, the hole down
    const [si, sj] = start, [fi, fj] = far;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 14, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.set(cx(si), Y + 7, cz(sj)); this.group.add(beam);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 14, 5), new THREE.MeshStandardMaterial({ color: 0xc8a06a, roughness: 0.9 })); rope.position.set(cx(si) + 0.5, Y + 7, cz(sj) - 0.4); this.group.add(rope);
    this.label('⬆ 地上へ', cx(si) + 0.5, Y + 2.2, cz(sj) - 0.4);
    this.things.push({ x: cx(si) + 0.5, z: cz(sj) - 0.4, r: 1.4, label: () => 'のぼる', run: () => this.leave() });
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20), new THREE.MeshBasicMaterial({ color: 0x000000 })); hole.rotation.x = -PI / 2; hole.position.set(cx(fi), Y + 0.02, cz(fj)); this.group.add(hole);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.16, 6, 18), rock(new THREE.Color(tint).offsetHSL(0, 0, 0.1).getHex())); rim.rotation.x = PI / 2; rim.position.copy(hole.position); this.group.add(rim);
    for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), new THREE.MeshStandardMaterial({ color: 0x7a5634, roughness: 0.9 })); rail.position.set(cx(fi) + s * 0.25, Y + 0.25, cz(fj) - 0.75); rail.rotation.x = -0.3; this.group.add(rail); }
    this.label(`⬇ 地下${f + 1}かいへ`, cx(fi), Y + 1.6, cz(fj));
    this.things.push({ x: cx(fi), z: cz(fj), r: 1.7, label: () => 'おりる', run: () => this.enter(f + 1) });

    // ---- finds: chests in dead ends, then crystals, ore, cracks and moss through the rest
    const taken = (this.st.daily.cave ||= {}), key = (k) => `${f}:${k}`;
    const spots = [...deadEnds, ...others.sort(() => r() - 0.5)];
    const nChest = Math.min(deadEnds.length, 1 + Math.floor(f / 2)), plan = [];
    for (let k = 0; k < spots.length; k++) plan.push(k < nChest ? 'chest' : pick(['crystal', 'crystal', 'ore', 'ore', 'crack', 'moss', 'moss', null], r));
    spots.forEach(([i, j], k) => {
      const kind = plan[k]; if (!kind) return;
      const id = key(`${kind}${i}_${j}`), a = r() * PI * 2, d = kind === 'chest' ? 0 : r() * 1.2;
      const x = cx(i) + Math.cos(a) * d, z = cz(j) + Math.sin(a) * d;
      if (kind === 'chest') { const [[a2, b2]] = open(i, j); this.chestFace = Math.atan2(cx(a2) - cx(i), cz(b2) - cz(j)); }
      if (kind === 'chest' ? taken[id] : kind === 'ore' ? (taken[id] || 0) >= 3 : taken[id]) { if (kind === 'chest') this.chest(x, z, id, true); return; }
      this[kind](x, z, id, false, r);
    });
    // bats under the roof
    for (let k = 0; k < 2 + Math.min(4, f); k++) this.bat(cx(Math.floor(r() * N)), cz(Math.floor(r() * N)), r);

    // ---- ぽっけ at the foot of the rope, the camera high behind
    const pl = this.player;
    pl.place(cx(si), cz(sj) + 0.6, 0); pl.pos.y = Y; pl.heading = PI; pl.yaw = 0; pl.pitch = 1.1; pl.dist = 9; pl.snapCam = true; pl.lastSafe.copy(pl.pos);
  }
  // push box / pillar vertices about (not the bottom, so walls stay on the floor)
  rough(g, k, Y) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), up = Math.min(1, (y - Y) / 0.4);
      p.setXYZ(i, x + k * nz(x, y, z) * up, y + k * 0.4 * nz(z, x, y) * (y > Y + 0.1 ? 1 : 0), z + k * nz(z + 3.1, y, x) * up);
    }
    g.computeVertexNormals();
  }
  label(text, x, y, z) { const s = this.life.textSprite(text, 0.5, 360); s.position.set(x, y, z); this.group.add(s); return s; }
  // ---------------------------------------------------------------- the finds
  chest(x, z, id, open) {
    const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.8 }), gold = new THREE.MeshStandardMaterial({ color: 0xe8b830, metalness: 0.8, roughness: 0.35 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.52), wood); box.position.y = 0.225; g.add(box);
    for (const s of [-1, 1]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.47, 0.54), gold); band.position.set(s * 0.3, 0.225, 0); g.add(band); }
    const lid = new THREE.Group(); lid.position.set(0, 0.45, -0.26); g.add(lid);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.8, 12, 1, false, 0, PI), wood); top.rotation.z = PI / 2; top.position.z = 0.26; lid.add(top);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.04), gold); lock.position.set(0, 0.4, 0.27); g.add(lock);
    if (open) lid.rotation.x = -1.9;
    g.position.set(x, STAGE.y, z); g.rotation.y = this.chestFace ?? 0; g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); this.group.add(g);
    const sparkle = !open && this.label('✨', x, STAGE.y + 1.0, z);
    const col = { type: 'b', x, z, hw: 0.42, hd: 0.42, c: 1, s: 0, y0: STAGE.y - 1, y1: STAGE.y + 0.5 }; this.cols.push(col); this.town.colliders.push(col);
    if (open) return;
    this.things.push({ x, z, r: 1.4, label: () => 'あける', run: async (t) => {
      t.gone = true; this.st.daily.cave[id] = 1; this.st.save();
      const L = this.life, f = this.floor, lines = [];
      for (let k = 0; k <= 12; k++) setTimeout(() => { lid.rotation.x = -1.9 * k / 12; }, k * 25);
      if (sparkle) this.group.remove(sparkle);
      L.ui.jingle([523, 659, 784, 1047, 1319]);
      const money = 300 * (f + 1) + Math.floor(Math.random() * 5) * 100; L.st.money += money; lines.push(`たからばこを あけた!`, `${money.toLocaleString()} ナギ 入っていた!`);
      const u = Math.random();
      const unknown = CAVE_RECIPES.filter((rid) => !L.craft.known(rid));
      if (unknown.length && u < 0.5) { const rid = pick(unknown); L.craft.learn(rid); lines.push(`それから、ふるい 紙きれ……「${ITEMS[rid].name}」の DIYレシピだ!`); }
      else if (f >= 2 && u < 0.75 && !L.st.full()) { L.st.add('gold_nugget'); lines.push('金のかけらも 入っていた!'); }
      else { const n = 2 + Math.floor(f / 2); L.st.addMat('crystal', n); lines.push(`水晶が ${n}こ 入っていた!`); }
      L.st.save(); L.emit('pick');
      await L.ui.say(null, lines);
    } });
  }
  crystal(x, z, id, _, r) {
    const color = [0x8fdcff, 0xc68cff, 0x8affc0, 0xffa8e0][this.floor % 4], g = crystals(new THREE.Group(), 7, color, 0.25, 0.25, 0.75, 0, Math.floor(r() * 1e6));
    g.position.set(x, STAGE.y, z); this.group.add(g);
    this.things.push({ x, z, r: 1.2, label: () => 'とる', run: (t) => {
      t.gone = true; this.group.remove(g); this.st.daily.cave[id] = 1;
      const n = this.floor >= 3 ? 2 : 1; this.st.addMat('crystal', n); this.life.emit('pick');
      this.life.ui.blip(1568, 0.1, 'triangle', 0.14); this.life.ui.toast(`水晶を ${n}こ 手に入れた (${this.st.mat.crystal})`);
    } });
  }
  ore(x, z, id, _, r) {
    const g = new THREE.Group(), b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 1), rock(0x5a5550)); b.scale.set(1, 0.75, 1); b.position.y = 0.3; g.add(b);
    const fleck = (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: 0.3, emissive: c, emissiveIntensity: 0.15 });
    for (let k = 0; k < 9; k++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), fleck(k < 2 ? 0xffc830 : 0xb8c0cc)); const a = r() * PI * 2, e = r() * 1.2; s.position.set(Math.cos(a) * Math.cos(e) * 0.52, 0.3 + Math.sin(e) * 0.38, Math.sin(a) * Math.cos(e) * 0.52); g.add(s); }
    g.position.set(x, STAGE.y, z); g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); this.group.add(g);
    const col = { type: 'c', x, z, r: 0.5, y0: STAGE.y - 1, y1: STAGE.y + 0.7 }; this.cols.push(col); this.town.colliders.push(col);
    this.things.push({ x, z, r: 1.4, label: () => (this.st.tool === 'shovel' ? 'ほる' : 'しらべる'), run: (t) => {
      const L = this.life;
      if (this.st.tool !== 'shovel') { L.ui.toast('きらきらした 岩だ。スコップで ほれそう'); return; }
      const n = (this.st.daily.cave[id] || 0) + 1; this.st.daily.cave[id] = n;
      L.anim = { kind: 'dig', t: 0, dur: 0.45 }; L.ui.blip(1800, 0.06, 'square', 0.06); L.craft.use('shovel'); L.emit('rock');
      const u = Math.random();
      if (u < 0.05 + 0.02 * this.floor && !this.st.full()) { this.st.add('gold_nugget'); L.ui.jingle([988, 1319]); L.ui.toast('金のかけらが 出た!!', 1800); }
      else { const iron = u < 0.55; this.st.addMat(iron ? 'iron' : 'stone'); L.ui.toast(`${iron ? '鉄のかけら' : '石'}を 手に入れた (${n}/3)`, 1400); }
      if (n >= 3) { t.gone = true; b.scale.multiplyScalar(0.6); g.children.slice(1).forEach((s) => (s.visible = false)); }
      this.st.save();
    } });
  }
  crack(x, z, id) {
    const o = this.town.protos.dig_spot ? this.town.clone('dig_spot', x, STAGE.y + 0.01, z, Math.random() * 6.28, true) : new THREE.Mesh(new THREE.CircleGeometry(0.3, 8), new THREE.MeshBasicMaterial({ color: 0x2a2018 }));
    if (o.parent) o.parent.remove(o); if (!o.isMesh) o.position.set(x, STAGE.y + 0.01, z); else { o.rotation.x = -PI / 2; o.position.set(x, STAGE.y + 0.02, z); }
    this.group.add(o);
    this.things.push({ x, z, r: 1.2, label: () => (this.st.tool === 'shovel' ? 'ほる' : 'しらべる'), run: async (t) => {
      const L = this.life;
      if (this.st.tool !== 'shovel') { L.ui.toast('何か うまっているみたい。スコップが ほしいな'); return; }
      if (this.st.full()) { L.ui.toast('ポケットが いっぱい! 何か 売ってからにしよう'); return; }
      t.gone = true; this.st.daily.cave[id] = 1; this.group.remove(o);
      L.anim = { kind: 'dig', t: 0, dur: 0.7 }; L.craft.use('shovel'); this.st.stats.dig = (this.st.stats.dig || 0) + 1; L.emit('dig');
      await new Promise((res) => setTimeout(res, 600));
      L.ui.jingle([523, 659, 784]);
      if (Math.random() < 0.3) { this.st.addMat('crystal', 2); await L.ui.say(null, ['水晶が 2こ でてきた!']); }
      else { this.st.add('fossil_unknown'); await L.ui.say(null, ['化石を ほりだした!', '資料館で 鑑定してもらおう。']); }
      this.st.save();
    } });
  }
  moss(x, z, id) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.42, 10), glow(0x7cf09a, 0.8)); m.rotation.x = -PI / 2; m.position.set(x, STAGE.y + 0.02, z); m.scale.y = 0.7; this.group.add(m);
    this.things.push({ x, z, r: 1.1, label: () => 'ひろう', run: (t) => {
      t.gone = true; this.group.remove(m); this.st.daily.cave[id] = 1; this.st.addMat('glow_moss'); this.life.emit('pick');
      this.life.ui.blip(990, 0.08, 'triangle', 0.14); this.life.ui.toast(`ひかりごけを ひろった (${this.st.mat.glow_moss})`);
    } });
  }
  bat(x, z, r) {
    const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0x15121a, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), m); body.scale.z = 1.4; g.add(body);
    const wings = [-1, 1].map((s) => { const w = new THREE.Group(), tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.06, s * 0.32, 0.02, 0, 0, 0, -0.08, s * 0.32, 0.02, 0, s * 0.2, 0, -0.12, 0, 0, -0.08], 3)); w.add(new THREE.Mesh(tri, m)); g.add(w); return w; });
    g.position.set(x, STAGE.y + H + 0.3, z); this.group.add(g);
    this.bats.push({ g, wings, x, z, t: r() * 10, R: 1.2 + r() * 1.8, w: (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.6) });
  }
  // ---------------------------------------------------------------- per frame: lantern, bats, the dark
  update(dt) {
    if (!this.on) return;
    const pp = this.player.pos;
    this.lantern.position.set(pp.x, pp.y + 1.9, pp.z + 0.3); this.lantern.intensity = 60;
    // walls nearer the camera than ぽっけ (seen from above) fade out, so the passage ahead is never hidden
    const cam = this.life.app.camera.position, dx = pp.x - cam.x, dz = pp.z - cam.z, D = Math.hypot(dx, dz) || 1, ux = dx / D, uz = dz / D;
    for (const w of this.segs || []) {
      const qx = w.x - cam.x, qz = w.z - cam.z, along = qx * ux + qz * uz, side = Math.abs(qx * uz - qz * ux);
      const reach = Math.abs(ux) * w.hw + Math.abs(uz) * w.hd;   // half the wall's depth along the view
      const hide = along - reach < D - 0.3 && side < 7 + Math.max(w.hw, w.hd);
      if ((w.m.material === this.fadeMat) !== hide) { w.m.material = hide ? this.fadeMat : this.wallMat; w.m.castShadow = !hide; }
    }
    for (const b of this.bats) {
      b.t += dt; const a = b.t * b.w;
      b.g.position.set(b.x + Math.cos(a) * b.R, STAGE.y + H + 0.2 + Math.sin(b.t * 2.3) * 0.25, b.z + Math.sin(a) * b.R); b.g.rotation.y = -a + (b.w > 0 ? 0 : PI);
      const fl = Math.sin(b.t * 22) * 0.9; b.wings[0].rotation.z = fl; b.wings[1].rotation.z = -fl;
    }
  }
  // after the world has lit the scene for the time of day: the cave is dark whatever the hour
  mood() {
    if (!this.on) return;
    const W = this.life.world, s = this.scene;
    W.sun.intensity = 0; W.hemi.intensity = 0.55; W.hemi.color.setRGB(0.42, 0.48, 0.62); W.hemi.groundColor.setRGB(0.16, 0.12, 0.1);
    s.environmentIntensity = 0.08; s.fog.color.setRGB(0.012, 0.012, 0.018); s.fog.near = 7; s.fog.far = 30;
  }
  area() { return { name: 'うみなぎ洞窟', sub: `ちか ${this.floor} かい` }; }
}
