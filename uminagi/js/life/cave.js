// うみなぎ洞窟: a dark mouth in the west cliff of the harbour, timbered like an old mine. Inside are floors of
// rocky passages laid out anew every day (a maze from the day's seed, bigger the deeper you go), lit only by
// ぽっけ's lantern and glowing crystals. On each floor: crystal clusters to pick, ore veins and cracks for the
// shovel, glowing moss, a treasure chest or two in the dead ends (money, gold, recipes the surface never teaches),
// a hole down to the next floor in the cell farthest from the rope back up, down to B10 where the cave master's
// chest waits (once a day). Mischief lives down there too: bats
// that swoop, rolling rock critters (ゴロン, from B2) and a shadow wisp (カゲボウズ, from B4) that drifts through
// the walls. ぽっけ has three hearts; a bump costs one, none left and ぽっけ is carried back up, dropping half of
// what this trip picked up. A (たたく) or a jump on top calms a critter; the light under the rope heals.
// Like the interiors (home.js) the floors are a stage above the lighthouse hill; home.inside = 'cave' tells the
// rest of island life that ぽっけ is indoors.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ITEMS, ICON_BY_ID, dayKey, seeded } from './state.js';
import { RECIPES } from './items2.js';

const PI = Math.PI;
const STAGE = { x: -118, z: -12, y: 100 };   // floors are drawn here (land below, away from the house stage)
const C = 5;                                 // passage cell size (m)
const LAST = 10;                             // the bottom floor: no hole, the cave master's chest instead
const H = 2.9;                               // wall height
const MOUTH = { x: -82, z: -10 };             // the mound's centre: flat ground to the east, the hill behind
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
// prices: what they sell for (a quarter) stays under what their crystals would take to find again
const CAVE_FURN = [
  { id: 'furn_crystal_lamp', name: '水晶ランプ', icon: '💎', w: 0.45, d: 0.45, where: 'both', light: true, price: 3600 },
  { id: 'furn_glow_pot', name: 'ひかりごけの鉢', icon: '🪴', w: 0.45, d: 0.45, where: 'both', light: true, price: 2000 },
  { id: 'furn_geode', name: '大きなジオード', icon: '🔮', w: 0.8, d: 0.6, where: 'both', price: 6000 },
  { id: 'furn_stalagmite', name: 'しょうにゅう石', icon: '🗻', w: 0.6, d: 0.6, where: 'both', price: 3000 },
];
for (const f of CAVE_FURN) { ITEMS[f.id] = { ...f, kind: 'furniture', make: MAKERS[f.id] }; ICON_BY_ID[f.id] = f.icon; }
const CAVE_RECIPES = RECIPES.filter((r) => r.cave).map((r) => r.id);

export class Cave {
  constructor(life) {
    this.life = life; this.st = life.st; this.town = life.town; this.player = life.player; this.scene = life.scene;
    this.st.ext.cave ||= { deep: 0, trips: 0 };
    this.on = false; this.floor = 0; this.things = []; this.cols = [];
    this.group = new THREE.Group(); this.group.name = 'cave'; this.group.visible = false; this.scene.add(this.group);
    this.foes = []; this.maxHp = 3; this.hp = 3; this.inv = 0;
    this.hud = document.createElement('div'); this.hud.className = 'cavehp'; this.hud.hidden = true; document.body.appendChild(this.hud);
    this.lantern = life.home.light;   // the house's room light doubles as the lantern (never both in use): no extra light in every shader
    this.buildMouth();
  }
  // ---------------------------------------------------------------- the mouth: a rocky mound at the foot of the hill
  // A knobbly half dome backed into the slope, cut open on the east for a timbered tunnel at ground level, so
  // ぽっけ walks straight up to it from the flat ground (and the town's buildings never stand in the way).
  buildMouth(at = MOUTH) {
    const L = this.life, G = L.ground, g = new THREE.Group(), R = 3.5, Hm = 3.4, W = 1.05, Ht = 2.3;
    const y = G.height(at.x + R + 1, at.z);   // the flat ground in front
    g.position.set(at.x, y, at.z);
    const stone = rock(0x77726a), dark = new THREE.MeshBasicMaterial({ color: 0x050403 });
    // the dome, without the triangles where the tunnel goes in
    const dome = new THREE.SphereGeometry(1, 30, 14, 0, PI * 2, 0, PI / 2).toNonIndexed(); dome.scale(R, Hm, R); dome.translate(0, -0.35, 0);
    { const p = dome.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), yy = p.getY(i), z = p.getZ(i), k = 0.35 * Math.min(1, (yy + 0.35) / 0.6); p.setXYZ(i, x + k * nz(x, yy, z) * 1.6, yy + k * nz(z, x, yy), z + k * nz(z + 3.1, yy, x) * 1.6); } }
    const keep = [], P = dome.attributes.position;
    for (let t = 0; t < P.count; t += 3) {
      let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += P.getX(t + k) / 3; cy += P.getY(t + k) / 3; cz += P.getZ(t + k) / 3; }
      if (!(cx > 2.75 && Math.abs(cz) < W + 0.15 && cy < Ht + 0.15)) for (let k = 0; k < 3; k++) keep.push(P.getX(t + k), P.getY(t + k), P.getZ(t + k));
    }
    const shell = new THREE.BufferGeometry(); shell.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3)); shell.computeVertexNormals();
    const m = new THREE.Mesh(shell, stone); m.castShadow = m.receiveShadow = true; g.add(m);
    // the tunnel: rough rock sides and roof, a black depth, a dark floor
    const box = (sx, sy, sz, x, yy, z, mat = stone) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); b.position.set(x, yy, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    const D0 = 2.85, len = R + 0.3 - D0, mid = D0 + len / 2;   // short: the hill's own ground rises inside the mound
    for (const sd of [-1, 1]) box(len, Ht + 0.3, 0.5, mid, (Ht + 0.3) / 2 - 0.15, sd * (W + 0.25));
    box(len, 0.5, 2 * W + 1.0, mid, Ht + 0.2, 0);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * W + 0.1, Ht + 0.1), dark); back.rotation.y = PI / 2; back.position.set(D0 + 0.02, Ht / 2, 0); g.add(back);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(len + 0.6, 2 * W), new THREE.MeshBasicMaterial({ color: 0x14110e })); fl.rotation.x = -PI / 2; fl.position.set(mid + 0.3, 0.04, 0); g.add(fl);
    // old mine timbers at the opening, a lantern and the signboard
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.9 }), fx = R + 0.35;
    for (const sd of [-1, 1]) box(0.24, Ht + 0.35, 0.24, fx, (Ht + 0.35) / 2, sd * (W + 0.05), wood);
    box(0.3, 0.28, 2 * W + 0.7, fx, Ht + 0.3, 0, wood);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), glow(0xffc070, 1.6)); lamp.position.set(fx + 0.2, Ht - 0.05, 0.75); g.add(lamp);
    const sign = L.textSprite('⛏ うみなぎ洞窟', 0.62, 420); sign.position.set(fx, Ht + 1.0, 0); g.add(sign);
    L.root.add(g); this.mouth = g;
    L.town.colliders.push({ type: 'c', x: at.x - 0.2, z: at.z, r: R - 0.4, y0: y - 2, y1: y + Hm });
    for (const sd of [-1, 1]) L.town.colliders.push({ type: 'c', x: at.x + fx, z: at.z + sd * (W + 0.05), r: 0.2, y0: y - 1, y1: y + Ht });
    // a few boulders round the foot
    const rk = ['rock_a', 'rock_b', 'rock_c'], r = seeded('cave-mouth');
    for (let i = 0; i < 4; i++) {
      const name = rk[i % 3]; if (!L.town.protos[name]) continue;
      const sd = i % 2 ? 1 : -1, zz = at.z + sd * (R - 0.2 + r() * 0.8), xx = at.x + 1.2 + r() * 1.4;
      L.natureClone(name, xx, G.height(xx, zz) - 0.1, zz, r() * 6.28, 0.22 + r() * 0.15);
    }
    this.door = { x: at.x + fx + 1.1, z: at.z, y };   // where ぽっけ stands to go in
  }
  // ---------------------------------------------------------------- A in front of things
  target(front) {
    if (!this.on) {
      if (this.life.home.inside || !this.door || Math.abs(this.player.pos.y - this.door.y) > 2.5) return null;   // not from the cliff above
      return front(this.door.x, this.door.z, 2.0) ? { label: 'はいる', run: () => this.ask() } : null;
    }
    if (this.busy) return null;   // during the fade
    for (const o of this.foes) if (!o.gone && (o.kind !== 'bat' || o.y < STAGE.y + 1.6) && front(o.x, o.z, 1.8)) return { label: 'たたく', run: () => this.hitFoe(o) };
    for (const t of this.things) if (!t.gone && front(t.x, t.z, t.r)) return { label: t.label(), run: () => t.run(t) };
    return null;
  }
  async ask() {
    const ui = this.life.ui, first = !this.st.ext.cave.trips;
    const lines = first ? ['ひんやりした 風が ふいてくる……。', 'ここは 「うみなぎ洞窟」。中の みちは 毎日 かたちが かわるらしい。', '水晶や 鉄、たからばこが ねむっているとか。', 'でも 暗がりには いたずらな 生きものも いるらしい……。\nハートが なくなると、地上に はこばれちゃうよ。', 'はいってみる?']
      : [`うみなぎ洞窟だ。(いちばん深く もぐったのは 地下${this.st.ext.cave.deep}かい)`, 'はいってみる?'];
    const k = await ui.say(null, lines, ['はいる', 'やめる']);
    if (k === 0) await this.enter(1);
  }
  // ---------------------------------------------------------------- in and out
  async enter(f) {
    const L = this.life, pl = this.player; f = Math.min(f, LAST);
    if (this.busy) return; this.busy = true;
    try { await L.tour.blackout(() => {
      if (!this.on) {
        this.back = { x: pl.pos.x, z: pl.pos.z, yaw: pl.yaw, pitch: pl.pitch, dist: pl.dist };
        this.hidden = [];
        for (const o of this.scene.children) if (o !== this.group && !o.isLight && o.visible && o !== this.town.root) { o.visible = false; this.hidden.push(o); }
        for (const o of this.town.root.children) if (o !== pl.model && o.visible) { o.visible = false; this.hidden.push(o); }
        this.bg = this.scene.background; this.scene.background = new THREE.Color(0x020203);
        this.on = true; L.home.inside = 'cave'; this.group.visible = true; this.st.ext.cave.trips++;
        this.maxHp = (this.st.ext.fed === dayKey() ? 4 : 3) + (this.life.perks?.caveHeart() || 0);   // a good meal today (farm.js) brings an extra heart
        this.hp = this.maxHp; this.trip = { ...this.st.mat }; this.tripMoney = this.st.money; this.hud.hidden = false;
        pl.skills.climb = false; pl.skills.web = false;   // no climbing over the maze walls
        pl.camLimits = { pitch: [0.85, 1.25], dist: [5.5, 11] };   // from above: never down among the walls, never so far out the maze shows whole
        this.light0 = { pos: this.lantern.position.clone(), distance: this.lantern.distance, color: this.lantern.color.clone() };
        this.lantern.distance = 24; this.lantern.color.set(0xffd6a0);
      }
      this.build(f); this.inv = 2; this.hearts();   // a moment's grace on arriving
    }); } finally { this.busy = false; }
    if (f > this.st.ext.cave.deep) { this.st.ext.cave.deep = f; this.st.save(); if (f > 1) L.ui.toast(`しんきろく! 地下${f}かい`, 2000); }
    const seen = this.daily('floors'); if (!seen[f]) { seen[f] = 1; L.emit('cave'); }   // goals and the medal: each floor once a day
    L.ui.toast(f >= LAST ? `うみなぎ洞窟 地下${f}かい(さいかそう)` : `うみなぎ洞窟 地下${f}かい`, 1600);
  }
  async leave() {
    const L = this.life, pl = this.player;
    if (this.busy || !this.on) return; this.busy = true;
    try { await L.tour.blackout(() => {
      this.clear();
      for (const o of this.hidden) o.visible = true;
      this.scene.background = this.bg; this.group.visible = false;
      this.lantern.intensity = 0; this.lantern.position.copy(this.light0.pos); this.lantern.distance = this.light0.distance; this.lantern.color.copy(this.light0.color);
      this.on = false; L.home.inside = null;
      L.world.apply(true);   // the sky, sun and fog of the time of day again
      pl.place(this.door.x + 0.4, this.door.z, PI / 2); pl.heading = PI / 2; pl.pitch = this.back.pitch; pl.dist = this.back.dist;
      pl.lastSafe.copy(pl.pos); pl.camLimits = null; pl.model.visible = true; this.hud.hidden = true; this.knock = null;
      L.skills.apply();
    }); } finally { this.busy = false; }
    L.ui.toast('地上に もどった', 1400);
  }
  clear() {
    for (const c of this.cols) { const i = this.town.colliders.indexOf(c); if (i >= 0) this.town.colliders.splice(i, 1); }
    this.cols = []; this.things = []; this.foes = []; this.segs = [];
    for (const o of [...this.group.children]) if (o.userData.shared) this.group.remove(o);   // town models: shared geometry
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
    const dist = new Map([[start.join(), 0]]), from = new Map(), q = [start];
    while (q.length) { const [i, j] = q.shift(), d = dist.get(i + ',' + j); for (const [a, b] of open(i, j)) if (!dist.has(a + ',' + b)) { dist.set(a + ',' + b, d + 1); from.set(a + ',' + b, [i, j]); q.push([a, b]); } }
    let far = start; for (const [k, d] of dist) if (d > dist.get(far.join())) far = k.split(',').map(Number);
    const path = [far]; while (from.has(path[0].join())) path.unshift(from.get(path[0].join()));
    this.maze = { N, path: path.map(([i, j]) => [cx(i), cz(j)]), deadEnds: 0 };   // the way to the hole (tests, the difficulty numbers)
    const cells = [...dist.keys()].map((k) => k.split(',').map(Number)).filter(([i, j]) => !(i === start[0] && j === start[1]) && !(i === far[0] && j === far[1]));
    const deadEnds = cells.filter(([i, j]) => open(i, j).length === 1); this.maze.deadEnds = deadEnds.length;
    const others = cells.filter(([i, j]) => open(i, j).length > 1);

    // ---- rock: walls (segments + pillars), the floor, rubble and stalagmites, all merged into a few meshes
    const segGeo = [], tint = [0x6e6258, 0x5e6470, 0x6a5a6e, 0x5a6a64][f % 4];
    const seg = (x, z, len, alongX) => {
      const g = new THREE.BoxGeometry(alongX ? len : 0.95, H, alongX ? 0.95 : len, Math.ceil(len * 1.6), 4, 2).toNonIndexed();
      g.translate(x, Y + H / 2 - 0.05, z); this.rough(g, 0.32, Y); segGeo.push({ g, x, z, hw: (alongX ? len : 0.95) / 2 + 0.3, hd: (alongX ? 0.95 : len) / 2 + 0.3 });
      const c = { type: 'b', x, z, hw: (alongX ? len : 0.95) / 2, hd: (alongX ? 0.95 : len) / 2, c: 1, s: 0, y0: Y - 1, y1: Y + H, wall: true }; this.cols.push(c);   // the camera looks over them (the near ones fade, update)
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
    if (f < LAST) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20), new THREE.MeshBasicMaterial({ color: 0x000000 })); hole.rotation.x = -PI / 2; hole.position.set(cx(fi), Y + 0.02, cz(fj)); this.group.add(hole);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.16, 6, 18), rock(new THREE.Color(tint).offsetHSL(0, 0, 0.1).getHex())); rim.rotation.x = PI / 2; rim.position.copy(hole.position); this.group.add(rim);
      for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), new THREE.MeshStandardMaterial({ color: 0x7a5634, roughness: 0.9 })); rail.position.set(cx(fi) + s * 0.25, Y + 0.25, cz(fj) - 0.75); rail.rotation.x = -0.3; this.group.add(rail); }
      this.label(`⬇ 地下${f + 1}かいへ`, cx(fi), Y + 1.6, cz(fj));
      this.things.push({ x: cx(fi), z: cz(fj), r: 1.7, label: () => 'おりる', run: () => this.enter(f + 1) });
    }

    // ---- finds: chests in dead ends, then crystals, ore, cracks and moss through the rest
    const taken = this.daily('taken'), key = (k) => `${f}:${k}`;
    // a handful of finds a floor (5 on B1 up to 12), however big the maze: the cave is a good day out, not a mine
    const nChest = Math.min(deadEnds.length, 1 + Math.floor(f / 3)), rest = [...deadEnds.slice(nChest), ...others].sort(() => r() - 0.5);
    const spots = [...deadEnds.slice(0, nChest), ...rest.slice(0, Math.min(12, 4 + f))], plan = [];
    for (let k = 0; k < spots.length; k++) plan.push(k < nChest ? 'chest' : pick(['crystal', 'ore', 'ore', 'moss', 'moss', 'crack', 'crack', 'moss'], r));
    spots.forEach(([i, j], k) => {
      const kind = plan[k]; if (!kind) return;
      const id = key(`${kind}${i}_${j}`), a = r() * PI * 2, d = kind === 'chest' ? 0 : r() * 1.2;
      const x = cx(i) + Math.cos(a) * d, z = cz(j) + Math.sin(a) * d;
      if (kind === 'chest') { const [[a2, b2]] = open(i, j).length ? open(i, j) : [[i, j + 1]]; this.chestFace = Math.atan2(cx(a2) - cx(i), cz(b2) - cz(j)); }
      if (kind === 'chest' ? taken[id] : kind === 'ore' ? (taken[id] || 0) >= 3 : taken[id]) { if (kind === 'chest') this.chest(x, z, id, true); return; }
      if (kind === 'chest') this.chest(x, z, id, false); else this[kind](x, z, id, false, r);
    });
    if (f >= LAST) {
      const id = key('nushi'), [[a2, b2]] = open(fi, fj); this.chestFace = Math.atan2(cx(a2) - cx(fi), cz(b2) - cz(fj));
      this.chest(cx(fi), cz(fj), id, !!taken[id], true);
      this.label(taken[id] ? 'きょうは もう からっぽ' : '⭐ 洞窟のヌシの たからばこ', cx(fi), Y + 2.1, cz(fj));
    }
    // the floor's critters, away from the rope: more and quicker the deeper
    const away = [...dist].filter(([, d]) => d >= 2).map(([k]) => k.split(',').map(Number));
    const at = () => { const [i, j] = pick(away.length ? away : cells, r); return [cx(i) + (r() - 0.5) * 2, cz(j) + (r() - 0.5) * 2]; };
    for (let k = 0; k < Math.min(6, 2 + Math.floor(f / 2)); k++) this.bat(...at(), r);
    for (let k = 0; k < Math.min(6, f - 1); k++) this.goron(...at(), r);
    for (let k = 0; k < (f >= 7 ? 2 : f >= 4 ? 1 : 0); k++) this.kage(...at());

    // ---- ぽっけ at the foot of the rope, the camera high behind
    const pl = this.player;
    pl.place(cx(si), cz(sj) + 1.5, 0); pl.pos.y = Y;   // a step away from the rope, so a held A does not climb straight back pl.heading = PI; pl.yaw = 0; pl.pitch = 1.1; pl.dist = 7.5; pl.snapCam = true; pl.lastSafe.copy(pl.pos);
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
  // today's cave record (st.daily is replaced when the game day turns over at 5:00, even while inside)
  daily(k) { const d = (this.st.daily.cave ||= {}); return (d[k] ||= {}); }
  label(text, x, y, z) { const s = this.life.textSprite(text, 0.5, 360); s.position.set(x, y, z); this.group.add(s); return s; }
  // ---------------------------------------------------------------- the finds
  chest(x, z, id, open, big = false) {
    const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.8 }), gold = new THREE.MeshStandardMaterial({ color: 0xe8b830, metalness: 0.8, roughness: 0.35 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.52), wood); box.position.y = 0.225; g.add(box);
    for (const s of [-1, 1]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.47, 0.54), gold); band.position.set(s * 0.3, 0.225, 0); g.add(band); }
    const lid = new THREE.Group(); lid.position.set(0, 0.45, -0.26); g.add(lid);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.8, 12, 1, false, 0, PI), wood); top.rotation.z = PI / 2; top.position.z = 0.26; lid.add(top);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.04), gold); lock.position.set(0, 0.4, 0.27); g.add(lock);
    if (open) lid.rotation.x = -1.9;
    g.position.set(x, STAGE.y, z); g.rotation.y = this.chestFace ?? 0; if (big) g.scale.setScalar(1.6); g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); this.group.add(g);
    const sparkle = !open && this.label('✨', x, STAGE.y + 1.0, z);
    const col = { type: 'b', x, z, hw: big ? 0.7 : 0.42, hd: big ? 0.7 : 0.42, c: 1, s: 0, y0: STAGE.y - 1, y1: STAGE.y + 0.5 }; this.cols.push(col); this.town.colliders.push(col);
    if (open) return;
    this.things.push({ x, z, r: big ? 2.0 : 1.4, label: () => 'あける', run: async (t) => {
      t.gone = true; this.daily('taken')[id] = 1; this.st.save();
      const L = this.life, f = this.floor, lines = [];
      for (let k = 0; k <= 12; k++) setTimeout(() => { lid.rotation.x = -1.9 * k / 12; }, k * 25);
      if (sparkle) this.group.remove(sparkle);
      L.ui.jingle([523, 659, 784, 1047, 1319]);
      const unknown = CAVE_RECIPES.filter((rid) => !L.craft.known(rid)), u = Math.random();
      if (big) {   // the bottom: once a day, the master's hoard
        const money = 8000 + Math.floor(Math.random() * 5) * 500; L.st.money += money;
        lines.push('洞窟の ヌシの たからばこを あけた!!', `${money.toLocaleString()} ナギ 入っていた!`);
        if (!L.st.full()) { L.st.add('gold_nugget'); lines.push('金のかけらも 入っていた!'); }
        if (unknown.length) { const rid = pick(unknown); L.craft.learn(rid); lines.push(`それから、「${ITEMS[rid].name}」の DIYレシピ!`); }
        else if (!L.st.full()) { const fid = pick(['furn_crystal_lamp', 'furn_glow_pot', 'furn_geode', 'furn_stalagmite']); L.st.add(fid); lines.push(`それから、「${ITEMS[fid].name}」が 入っていた!`); }
        lines.push('ここが 洞窟の いちばん そこみたいだ。また あした 来てみよう。');
      } else {
        const money = 150 * (f + 1) + Math.floor(Math.random() * 5) * 100; L.st.money += money; lines.push(`たからばこを あけた!`, `${money.toLocaleString()} ナギ 入っていた!`);
        if (unknown.length && u < 0.4) { const rid = pick(unknown); L.craft.learn(rid); lines.push(`それから、ふるい 紙きれ……「${ITEMS[rid].name}」の DIYレシピだ!`); }
        else if (f >= 3 && Math.random() < 0.25 && !L.st.full()) { L.st.add('gold_nugget'); lines.push('金のかけらも 入っていた!'); }
        else { const n = f >= 6 ? 2 : 1; L.st.addMat('crystal', n); lines.push(`水晶が ${n}こ 入っていた!`); }
      }
      L.st.save(); L.emit('pick');
      await L.ui.say(null, lines);
    } });
  }
  crystal(x, z, id, _, r) {
    const color = [0x8fdcff, 0xc68cff, 0x8affc0, 0xffa8e0][this.floor % 4], g = crystals(new THREE.Group(), 7, color, 0.25, 0.25, 0.75, 0, Math.floor(r() * 1e6));
    g.position.set(x, STAGE.y, z); this.group.add(g);
    this.things.push({ x, z, r: 1.2, label: () => 'とる', run: (t) => {
      t.gone = true; this.group.remove(g); this.daily('taken')[id] = 1;
      const n = 1; this.st.addMat('crystal', n); this.life.emit('pick');
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
      const n = (this.daily('taken')[id] || 0) + 1; this.daily('taken')[id] = n;
      L.anim = { kind: 'dig', t: 0, dur: 0.45 }; L.ui.blip(1800, 0.06, 'square', 0.06); L.craft.use('shovel'); L.emit('rock');
      const u = Math.random();
      if (u < Math.min(0.06, 0.03 + 0.003 * this.floor) && !this.st.full()) { this.st.add('gold_nugget'); L.ui.jingle([988, 1319]); L.ui.toast('金のかけらが 出た!!', 1800); }
      else { const iron = u < 0.55; this.st.addMat(iron ? 'iron' : 'stone'); L.ui.toast(`${iron ? '鉄のかけら' : '石'}を 手に入れた (${n}/3)`, 1400); }
      if (n >= 3) { t.gone = true; b.scale.multiplyScalar(0.6); g.children.slice(1).forEach((s) => (s.visible = false)); }
      this.st.save();
    } });
  }
  crack(x, z, id) {
    const o = this.town.protos.dig_spot ? this.town.clone('dig_spot', x, STAGE.y + 0.01, z, Math.random() * 6.28, true) : new THREE.Mesh(new THREE.CircleGeometry(0.3, 8), new THREE.MeshBasicMaterial({ color: 0x2a2018 }));
    if (o.parent) o.parent.remove(o); o.userData.shared = !o.isMesh; if (!o.isMesh) o.position.set(x, STAGE.y + 0.01, z); else { o.rotation.x = -PI / 2; o.position.set(x, STAGE.y + 0.02, z); }
    this.group.add(o);
    this.things.push({ x, z, r: 1.2, label: () => (this.st.tool === 'shovel' ? 'ほる' : 'しらべる'), run: async (t) => {
      const L = this.life;
      if (this.st.tool !== 'shovel') { L.ui.toast('何か うまっているみたい。スコップが ほしいな'); return; }
      if (this.st.full()) { L.ui.toast('ポケットが いっぱい! 何か 売ってからにしよう'); return; }
      t.gone = true; this.daily('taken')[id] = 1; this.group.remove(o);
      L.anim = { kind: 'dig', t: 0, dur: 0.7 }; L.craft.use('shovel'); this.st.stats.dig = (this.st.stats.dig || 0) + 1; L.emit('dig');
      await new Promise((res) => setTimeout(res, 600));
      L.ui.jingle([523, 659, 784]);
      if (Math.random() < 0.35) { this.st.addMat('crystal'); await L.ui.say(null, ['水晶が でてきた!']); }
      else { this.st.add('fossil_unknown'); await L.ui.say(null, ['化石を ほりだした!', '資料館で 鑑定してもらおう。']); }
      this.st.save();
    } });
  }
  moss(x, z, id) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.42, 10), glow(0x7cf09a, 0.8)); m.rotation.x = -PI / 2; m.position.set(x, STAGE.y + 0.02, z); m.scale.y = 0.7; this.group.add(m);
    this.things.push({ x, z, r: 1.1, label: () => 'ひろう', run: (t) => {
      t.gone = true; this.group.remove(m); this.daily('taken')[id] = 1; this.st.addMat('glow_moss'); this.life.emit('pick');
      this.life.ui.blip(990, 0.08, 'triangle', 0.14); this.life.ui.toast(`ひかりごけを ひろった (${this.st.mat.glow_moss})`);
    } });
  }
  // ---------------------------------------------------------------- critters
  bat(x, z, r) {
    const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0x4a3458, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), m); body.scale.z = 1.4; g.add(body);
    for (const sd of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff5a3a })); e.position.set(sd * 0.06, 0.05, 0.15); g.add(e); }
    const wings = [-1, 1].map((sd) => { const w = new THREE.Group(), tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.1, sd * 0.62, 0.05, 0, 0, 0, -0.14, sd * 0.62, 0.05, 0, sd * 0.38, 0, -0.22, 0, 0, -0.14], 3)); w.add(new THREE.Mesh(tri, m)); g.add(w); return w; });
    g.position.set(x, STAGE.y + H + 0.3, z); this.group.add(g);
    this.foes.push({ shadow: this.shadow(0.35), kind: 'bat', name: 'コウモリ', g, wings, x, z, y: STAGE.y + H + 0.3, hx: x, hz: z, hp: 1, t: r() * 10, R: 1.2 + r() * 1.8, w: (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.6), cd: 2 + r() * 3, state: 'fly' });
  }
  goron(x, z, r) {
    const f = this.floor, g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const geo = new THREE.DodecahedronGeometry(0.55, 1); this.rough(geo, 0.12, -9);
    const b = new THREE.Mesh(geo, rock(f >= 5 ? 0x6a5a58 : 0xa89478)); b.castShadow = true; body.add(b);
    const face = new THREE.Group(); g.add(face);
    for (const sd of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow(0xffe060, 2)); e.position.set(sd * 0.2, 0.14, 0.48); face.add(e); }
    const mark = this.life.textSprite('❗', 0.55); mark.position.y = 1.0; mark.visible = false; g.add(mark);
    g.position.set(x, STAGE.y + 0.55, z); this.group.add(g);
    this.foes.push({ mark, shadow: this.shadow(0.5), kind: 'goron', name: 'ゴロン', g, body, face, eyes: face.children, x, z, y: STAGE.y + 0.55, hp: f >= 5 ? 3 : 2, h: r() * PI * 2, t: 0, stun: 0, rest: 0, speed: Math.min(3.0, 1.7 + 0.22 * (f - 2)), goal: null });
  }
  kage(x, z) {
    const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0x6a3aa8, transparent: true, opacity: 0.72, depthWrite: false });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), m); head.position.y = 0.7; g.add(head);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.9, 14, 1, true), m); tail.rotation.x = PI; tail.position.y = 0.2; g.add(tail);
    for (const sd of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd8f8ff })); e.position.set(sd * 0.18, 0.8, 0.42); g.add(e); }
    g.position.set(x, STAGE.y + 0.2, z); this.group.add(g);
    this.foes.push({ shadow: this.shadow(0.45), kind: 'kage', name: 'カゲボウズ', g, x, z, y: STAGE.y + 0.2, hp: 99, t: 0, stun: 0, away: 0, speed: 1.15 + 0.08 * Math.max(0, this.floor - 4) });
  }
  // a soft dark spot on the floor under a critter (the bat's grows as it dives)
  shadow(r) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
    m.rotation.x = -PI / 2; m.position.y = STAGE.y + 0.03; this.group.add(m); return m;
  }
  // A on a critter: one tap, two with a tool in the paw (which wears it a little)
  hitFoe(o) {
    const L = this.life, tool = this.st.tool;
    L.anim = { kind: 'dig', t: 0, dur: 0.35 }; L.ui.blip(240, 0.08, 'square', 0.12);
    if (tool) L.craft.use(tool);
    const dx = o.x - this.player.pos.x, dz = o.z - this.player.pos.z, d = Math.hypot(dx, dz) || 1;
    if (o.kind === 'kage') { o.stun = 3; o.away = 0; L.ui.toast('カゲボウズが ひるんだ! いまのうちに!', 1400); return; }
    o.hp -= tool ? 2 : 1; o.stun = 1.2; o.kx = dx / d * 5; o.kz = dz / d * 5;
    if (o.hp <= 0) this.calm(o); else L.ui.toast(`${o.name}を たたいた!`, 900);
  }
  // a critter calmed down: it scurries off and leaves something behind
  calm(o) {
    const L = this.life; o.gone = true; o.t = 0;
    L.ui.jingle([659, 880]); L.emit('cavefoe');
    const u = Math.random();
    if (o.kind === 'goron') { const id = u < 0.08 ? 'crystal' : u < 0.35 ? 'iron' : 'stone', n = 1; this.st.addMat(id, n); L.ui.toast(`ゴロンが おとなしくなった! ${ITEMS[id].name}を ${n}こ おとしていった`, 1800); }
    else if (u < 0.25) { this.st.addMat('glow_moss'); L.ui.toast('コウモリが にげていった。ひかりごけが ひらひら……', 1600); }
    else L.ui.toast('コウモリが にげていった!', 1200);
  }
  // a bump: a heart less, a shove and a moment of blinking; none left and ぽっけ is carried up
  hurt(o) {
    if (this.inv > 0 || this.hp <= 0 || this.busy) return;
    const L = this.life, pp = this.player.pos, dx = pp.x - o.x, dz = pp.z - o.z, d = Math.hypot(dx, dz) || 1;
    this.hp--; this.inv = 1.6; this.hearts(); this.knock = { vx: dx / d * 7, vz: dz / d * 7, t: 0.28 };
    L.ui.blip(150, 0.2, 'sawtooth', 0.12);
    if (this.hp > 0) { L.ui.toast(`いたっ! ${o.name}に ぶつかった`, 1200); return; }
    this.faint();
  }
  async faint() {
    const L = this.life, lost = [];
    for (const [id, n0] of Object.entries(this.st.mat)) {
      const got = n0 - (this.trip[id] || 0), drop = Math.ceil(got / 2);
      if (drop > 0) { this.st.mat[id] -= drop; lost.push(`${ITEMS[id].name}×${drop}`); }
    }
    const coins = Math.ceil(Math.max(0, this.st.money - this.tripMoney) / 2);
    if (coins > 0) { this.st.money -= coins; lost.push(`${coins.toLocaleString()} ナギ`); }
    this.st.save();
    await L.ui.say(null, ['きゅう……。めが まわってしまった。']);
    await this.leave();
    await L.ui.say(null, ['……気がつくと、洞窟の 入口だった。', lost.length ? `ひろったものを すこし 落としてしまった……\n(${lost.join('、')})` : 'なにも なくさずに すんだみたい。']);
  }
  hearts() { this.hud.textContent = '❤️'.repeat(Math.max(0, this.hp)) + '🤍'.repeat(this.maxHp - Math.max(0, this.hp)); }
  // walls between two points (seen from above)?
  blockedLine(x0, z0, x1, z1) {
    for (const c of this.cols) {
      if (!c.wall) continue;
      let t0 = 0, t1 = 1, ok = true;
      for (const [o, d, lo, hi] of [[x0, x1 - x0, c.x - c.hw, c.x + c.hw], [z0, z1 - z0, c.z - c.hd, c.z + c.hd]]) {
        if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) { ok = false; break; } continue; }
        let a = (lo - o) / d, b = (hi - o) / d; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      }
      if (ok && t0 <= t1) return true;
    }
    return false;
  }
  // keep a rolling critter out of the walls
  push(o, rad) {
    for (const c of this.cols) {
      if (!c.wall) continue;
      const qx = Math.max(c.x - c.hw, Math.min(c.x + c.hw, o.x)), qz = Math.max(c.z - c.hd, Math.min(c.z + c.hd, o.z)), dx = o.x - qx, dz = o.z - qz, d = Math.hypot(dx, dz);
      if (d < rad) { if (d < 1e-4) { o.x += rad; continue; } o.x = qx + dx / d * rad; o.z = qz + dz / d * rad; o.bumped = true; }
    }
  }
  updateFoes(dt) {
    const P = this.player, pp = P.pos, Y = STAGE.y, f = this.floor;
    for (const o of this.foes) {
      o.t += dt;
      o.shadow.position.set(o.x, Y + 0.03, o.z);
      if (o.kind === 'bat') { const k = Math.max(0, Math.min(1, 1 - (o.y - Y - 0.7) / (H - 0.3))); o.shadow.scale.setScalar(0.5 + 0.9 * k); o.shadow.material.opacity = 0.15 + 0.4 * k; }
      if (o.gone) {
        o.shadow.visible = false;   // scurry off and fade
        const k = Math.max(0, 1 - o.t / 0.6); o.g.scale.setScalar(k); o.g.position.y += dt * (o.kind === 'bat' ? 3 : 0.5);
        if (k <= 0 && o.g.parent) this.group.remove(o.g);
        continue;
      }
      const dx = pp.x - o.x, dz = pp.z - o.z, d = Math.hypot(dx, dz);
      if (o.kind === 'bat') {
        o.cd -= dt; const fl = Math.sin(o.t * 22) * 0.9; o.wings[0].rotation.z = fl; o.wings[1].rotation.z = -fl;
        if (o.state === 'fly') {
          const a = o.t * o.w; o.x = o.hx + Math.cos(a) * o.R; o.z = o.hz + Math.sin(a) * o.R; o.y = Y + H + 0.25 + Math.sin(o.t * 2.3) * 0.25; o.g.rotation.y = -a + (o.w > 0 ? 0 : PI);
          if (o.cd <= 0 && d < 6.5 && !this.safe()) { o.state = 'dive'; o.s = 0; o.from = [o.x, o.y, o.z]; o.to = [pp.x, Y + 0.75, pp.z]; }
        } else {   // a swoop down at where ぽっけ was, and back up to circle there
          o.s += dt / (o.state === 'dive' ? 0.85 : 0.9); const k = Math.min(1, o.s), [a, b] = o.state === 'dive' ? [o.from, o.to] : [o.to, [o.hx, Y + H + 0.25, o.hz]];
          const e = o.state === 'dive' ? k * k : 1 - (1 - k) * (1 - k);
          o.x = a[0] + (b[0] - a[0]) * e; o.y = a[1] + (b[1] - a[1]) * e; o.z = a[2] + (b[2] - a[2]) * e; o.g.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]);
          if (k >= 1) { if (o.state === 'dive') { o.state = 'up'; o.s = 0; o.hx = o.x; o.hz = o.z; } else { o.state = 'fly'; o.t = 0; o.cd = Math.max(1.8, 5 - 0.4 * f) + Math.random() * 2; } }
          if (o.y < Y + 1.4 && Math.hypot(pp.x - o.x, pp.z - o.z) < 0.55) this.hurt(o);
        }
        o.g.position.set(o.x, o.y, o.z);
        continue;
      }
      if (o.kind === 'kage') {   // drifts straight at ぽっけ through the walls; a tap sends it off to sulk
        o.stun = Math.max(0, o.stun - dt);
        const sp = o.stun > 0 ? -1.4 : this.safe() ? -0.6 : o.speed;
        if (d > 0.01 && d < 22) { o.x += dx / d * sp * dt; o.z += dz / d * sp * dt; }
        o.g.position.set(o.x, Y + 0.2 + Math.sin(o.t * 2) * 0.12, o.z); o.g.rotation.y = Math.atan2(dx, dz);
        o.g.children.forEach((m) => { if (m.material.opacity !== undefined && m.material.transparent) m.material.opacity = o.stun > 0 ? 0.3 : 0.72; });
        if (o.stun <= 0 && d < 0.8) { this.hurt(o); o.stun = 1.5; }
        continue;
      }
      // ゴロン: wanders in its passage; sees ぽっけ (no wall between, near) and rolls after them
      o.stun = Math.max(0, o.stun - dt); o.rest = Math.max(0, o.rest - dt);
      let vx = 0, vz = 0;
      if (o.stun > 0 || o.rest > 0) o.mark.visible = false;
      if (o.stun > 0) { vx = o.kx; vz = o.kz; o.kx *= 1 - dt * 6; o.kz *= 1 - dt * 6; o.face.rotation.z = Math.sin(o.t * 20) * 0.4; }
      else if (o.rest <= 0) {
        o.face.rotation.z = 0;
        const sees = d < 7.5 && !this.safe() && !this.blockedLine(o.x, o.z, pp.x, pp.z);
        o.mark.visible = sees;
        if (sees) { o.h = Math.atan2(dx, dz); vx = Math.sin(o.h) * o.speed; vz = Math.cos(o.h) * o.speed; }
        else {
          if (!o.goal || Math.hypot(o.goal[0] - o.x, o.goal[1] - o.z) < 0.4 || o.bumped || o.t > 4) { const a = Math.random() * PI * 2; o.goal = [o.x + Math.cos(a) * 2.5, o.z + Math.sin(a) * 2.5]; o.t = 0; o.bumped = false; }
          o.h = Math.atan2(o.goal[0] - o.x, o.goal[1] - o.z); vx = Math.sin(o.h) * 0.9; vz = Math.cos(o.h) * 0.9;
        }
      }
      o.x += vx * dt; o.z += vz * dt; this.push(o, 0.55);
      const sp = Math.hypot(vx, vz); if (sp > 0.01) { o.body.rotation.x += sp * dt / 0.55; o.body.rotation.order = 'YXZ'; o.body.rotation.y = o.h; }
      o.g.position.set(o.x, Y + 0.55 + (sp > 1 ? Math.abs(Math.sin(o.t * 9)) * 0.06 : 0), o.z); o.face.rotation.y = o.h;
      if (o.stun <= 0 && d < 0.88) { this.hurt(o); o.rest = 1.2; }
      // a jump that lands on top calms it at once
      if (P.state === 'air' && P.vel.y < 0 && d < 0.7 && pp.y > Y + 0.6 && pp.y < Y + 1.5) { this.calm(o); P.vel.y = 7; }
    }
  }
  // standing in the light under the rope: critters keep away and the hearts come back
  safe() { const s = this.maze?.path?.[0]; return !!s && Math.hypot(this.player.pos.x - s[0], this.player.pos.z - s[1]) < 2.2; }
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
    if (this.busy || this.life.ui.busy()) return;   // the critters wait while a message is up
    this.updateFoes(dt);
    const P = this.player;
    if (this.knock) { const k = this.knock; P.pos.x += k.vx * dt; P.pos.z += k.vz * dt; P.collide(P.pos); if ((k.t -= dt) <= 0) this.knock = null; }
    if (this.inv > 0) { this.inv -= dt; P.model.visible = this.inv <= 0 || Math.floor(this.inv * 10) % 2 === 0; }
    if (this.safe() && this.hp < this.maxHp && this.hp > 0) { this.healT = (this.healT || 0) + dt; if (this.healT > 1.6) { this.healT = 0; this.hp++; this.hearts(); this.life.ui.toast('ロープの ひかりで げんきが もどった', 1200); this.life.ui.blip(880, 0.1, 'triangle', 0.1); } }
  }
  // after the world has lit the scene for the time of day: the cave is dark whatever the hour
  mood() {
    if (!this.on) return;
    const W = this.life.world, s = this.scene;
    W.sun.intensity = 0; W.hemi.intensity = 0.55; W.hemi.color.setRGB(0.42, 0.48, 0.62); W.hemi.groundColor.setRGB(0.16, 0.12, 0.1);
    W.renderer.toneMappingExposure = 1; s.environmentIntensity = 0.08; s.fog.color.setRGB(0.012, 0.012, 0.018); s.fog.near = 7; s.fog.far = 30;
  }
  area() { return { name: 'うみなぎ洞窟', sub: `ちか ${this.floor} かい` }; }
}
