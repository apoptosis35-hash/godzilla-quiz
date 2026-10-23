// Slow island life on top of the port town: animal villagers who wander, chat and remember you, fishing for
// shadows in the sea, catching bugs with a net, digging fossils, shaking fruit trees, the money rock, beach
// combing, the raccoon's shop and the owl's museum. Everything follows the real clock and resets at 5:00.
import * as THREE from 'three';
import { LifeState, ITEMS, dayKey, seeded, donatable, icon } from './state.js';
import { LifeUI } from './ui.js';
import { FISH, BUGS, FOSSILS, SHELLS, VILLAGERS, DIALOGUE, SHOP_LINES, MUSEUM_LINES, SEASON_TALK, TOOLS } from './data.js';

const PI = Math.PI;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
const inHours = (hours, h) => hours.some(([a, b]) => (a <= b ? h >= a && h < b : h >= a || h < b));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const VS = 0.6;   // villagers stand about 0.64 m: a head taller than なぎ
const PLAYER = 'なぎ';
const LOOK = {   // name plate colour and voice pitch per personality
  kiza: ['#8a7fd8', 1.0], genki: ['#ef7fa0', 1.35], nonbiri: ['#7fb85a', 0.72], futsuu: ['#4fa8d6', 1.12], kowai: ['#d07a34', 0.62], otona: ['#c0903c', 0.9],
};
// where each villager likes to be (walkable rectangles on the quays, pavements and plazas)
const HOMES = {
  vil_cat: [[-44, 16, 18, 21]], vil_rabbit: [[35.2, 36.2, -88, -14], [43.8, 44.8, -88, -14]], vil_bear: [[-48, 12, -37, -35]],
  vil_penguin: [[28.6, 31.4, 21, 46]], vil_frog: [[78, 108, 62, 92]], vil_squirrel: [[29, 51, -119, -100]],
};
const FIXED = { vil_raccoon: [35.4, -42, PI / 2], vil_owl: [-13, -121.5, 0.5] };
const RARITY_W = [0, 10, 6, 3, 1.4, 0.5];

// procedural bug looks: [shape, main colour, accent]
const BUG_LOOK = {
  ari: ['crawl', 0x1a1410], funamushi: ['crawl', 0x5a554c], monshiro: ['fly', 0xf4f2e8, 0x333333], nanahoshi: ['dot', 0xd8261c, 0x111111], yadokari: ['shell', 0xd8a070, 0xe06040],
  amenbo: ['crawl', 0x2a2a28], shiokara: ['dragon', 0x7a9ec8, 0x222222], akiakane: ['dragon', 0xd63a22, 0x7a2010], aburazemi: ['beetle', 0x5a3a20, 0x8a6a40], koorogi: ['crawl', 0x2a1e14],
  katatsumuri: ['shell', 0xb08850, 0xd8c8a0], mitsubachi: ['dot', 0xe8b020, 0x2a2010], ageha: ['fly', 0xf0d040, 0x1a1a1a], minminzemi: ['beetle', 0x3a5a3a, 0x9ab0a0],
  tonosama: ['crawl', 0x6a9a3a], tsukutsuku: ['beetle', 0x4a5a3a, 0xa0b090], suzumushi: ['crawl', 0x14120e], kamakiri: ['crawl', 0x6ab03a], higurashi: ['beetle', 0x7a5a30, 0x5a8a6a],
  aosujiageha: ['fly', 0x1a1a1a, 0x3ac0b0], sunagani: ['dot', 0xc8a878, 0xa08060], ginyanma: ['dragon', 0x5ab05a, 0x4a80c8], nokogiri: ['beetle', 0x5a2a14, 0x3a1a0a],
  genjibotaru: ['glow', 0x2a2420, 0xd8ff6a], kabutomushi: ['beetle', 0x3a2010, 0x2a1408], oniyanma: ['dragon', 0x1a1a14, 0xe8d030], omurasaki: ['fly', 0x5a3aa8, 0xf0e8c0],
  miyama: ['beetle', 0x6a3a1a, 0xa07040], tamamushi: ['beetle', 0x2aa070, 0xc84a8a], okuwagata: ['beetle', 0x14100c, 0x2a2018],
};

export class Life {
  constructor(app) {
    this.app = app; this.town = app.town; this.ground = app.ground; this.world = app.world; this.player = app.player; this.scene = app.scene;
    this.st = new LifeState();
    this.ui = new LifeUI(app.sound);
    this.root = new THREE.Group(); this.root.name = 'life'; this.scene.add(this.root);
    this.villagers = []; this.fish = []; this.bugs = []; this.pickups = []; this.spots = []; this.fruitTrees = [];
    this.anim = null; this.cast = null; this.ready = false; this.t = 0; this.spawnT = 0; this.hudT = 0;
    this.collectNature();
    this.buildVillagers();
    this.buildProps();
    this.buildTools();
    this.buildFishing();
    this.day = null; this.refreshDay();
    this.bindUI();
  }
  // ---------------------------------------------------------------- world queries
  collectNature() {
    this.trees = []; this.rocks = [];
    const p = new THREE.Vector3();
    for (const g of this.town.pool.groups.values()) {
      const n = g.proto.name, tree = /^tree_(pine|pine_b|broadleaf|sakura|cedar)$/.test(n), rock = /^rock_[abc]$/.test(n);
      if (!tree && !rock) continue;
      for (const it of g.items) {
        p.setFromMatrixPosition(it.m);
        if (p.x < -160 || p.x > 155 || p.z < -142 || p.z > 230) continue;
        const sc = new THREE.Vector3().setFromMatrixScale(it.m).x, b = g.proto.box;
        const rad = tree ? 0.45 * sc : Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.5 * sc;   // trunk / rock radius
        (tree ? this.trees : this.rocks).push({ x: p.x, y: p.y, z: p.z, rad, id: `${n}@${p.x.toFixed(1)},${p.z.toFixed(1)}` });
      }
    }
  }
  water(x, z) { const s = this.ground.sample(x, z); return !s.plat && s.h < -0.5; }
  blockedAt(x, z, r = 0.6) {
    const y = this.ground.height(x, z);
    for (const c of this.town.colliders) {
      if (Math.abs(c.x - x) > 12 || Math.abs(c.z - z) > 12 || y + 1 < c.y0 || y > c.y1) continue;
      if (c.type === 'c') { if (Math.hypot(c.x - x, c.z - z) < c.r + r) return true; continue; }
      const dx = x - c.x, dz = z - c.z, lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
      if (Math.abs(lx) < c.hw + r && Math.abs(lz) < c.hd + r) return true;
    }
    return false;
  }
  // open, fairly flat natural ground (grass / dirt / sand), not a road
  soft(x, z, r = 0.6) {
    const s = this.ground.sample(x, z); if (s.plat || s.h < 0.05) return false;
    const sl = Math.abs(this.ground.height(x + 0.7, z) - s.h) + Math.abs(this.ground.height(x, z + 0.7) - s.h);
    return sl < 0.35 && !this.blockedAt(x, z, r);
  }
  walkable(x, z) { const s = this.ground.sample(x, z); return (s.plat || s.h > -0.2) && !this.blockedAt(x, z, 0.35); }
  // a free spot near (x, z), spiralling out
  near(x, z, test, R = 12) {
    for (let r = 0; r <= R; r += 0.7) for (let a = 0; a < 6.28; a += r ? 0.9 / r + 0.2 : 7) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (test(px, pz)) return [px, pz]; }
    return null;
  }
  hour() { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
  month() { return new Date().getMonth() + 1; }
  // ---------------------------------------------------------------- villagers
  buildVillagers() {
    for (const def of VILLAGERS) {
      const name = def.id; if (!this.town.protos[name]) continue;
      const fx = FIXED[name], home = HOMES[name];
      let x, z, ry = 0;
      if (fx) { [x, z, ry] = fx; [x, z] = this.near(x, z, (a, b) => this.walkable(a, b) && !this.blockedAt(a, b, 0.9), 6) || [x, z]; }
      else { const h = home[0]; const p = this.near((h[0] + h[1]) / 2, (h[2] + h[3]) / 2, (a, b) => this.walkable(a, b)) || [(h[0] + h[1]) / 2, (h[2] + h[3]) / 2]; [x, z] = p; }
      const o = this.town.clone(name, x, this.ground.height(x, z), z, ry, true); o.scale.setScalar(VS);
      const L = {}; for (const s of ['body', 'head', 'arm_l', 'arm_r', 'leg_l', 'leg_r']) L[s] = o.getObjectByName(`${name}_${s}`);
      const look = def.role === 'shop' ? ['#4f8a46', 1.05] : def.role === 'museum' ? ['#7a5a32', 0.8] : LOOK[def.personality] || ['#e8b23a', 1];
      const v = { def, o, L, home, fixed: !!fx, ry0: ry, target: null, wait: Math.random() * 4, t: Math.random() * 9, r: 0.26, life: true, walkT: 0,
        speaker: { name: def.name, color: look[0], pitch: look[1] }, talking: false, wave: 0, bodyY: L.body ? L.body.position.y : 0 };
      this.villagers.push(v); this.town.npcs.push(v);   // traffic stops for them, the player bumps into them
    }
  }
  updateVillager(v, dt, pp) {
    v.t += dt;
    const p = v.o.position, d = Math.hypot(pp.x - p.x, pp.z - p.z);
    v.o.visible = d < 120;
    let moving = false;
    if (v.talking || (v.fixed && d < 6)) {
      const want = Math.atan2(pp.x - p.x, pp.z - p.z); v.o.rotation.y += wrapA(want - v.o.rotation.y) * Math.min(1, dt * 6);
    } else if (v.fixed) {
      v.o.rotation.y += wrapA(v.ry0 - v.o.rotation.y) * Math.min(1, dt * 2);
    } else if (v.wait > 0) {
      v.wait -= dt;
      // say hello with a wave when なぎ comes by for the first time today
      if (d < 4 && !v.waved) { v.waved = true; v.wave = 1.6; }
      if (v.wave > 0 || d < 3) { const want = Math.atan2(pp.x - p.x, pp.z - p.z); v.o.rotation.y += wrapA(want - v.o.rotation.y) * Math.min(1, dt * 4); }
    } else {
      if (!v.target) {
        const h = pick(v.home);
        for (let k = 0; k < 8 && !v.target; k++) { const x = h[0] + Math.random() * (h[1] - h[0]), z = h[2] + Math.random() * (h[3] - h[2]); if (this.walkable(x, z)) v.target = [x, z]; }
        v.walkT = 0; if (!v.target) v.wait = 2;
      }
      if (v.target) {
        const dx = v.target[0] - p.x, dz = v.target[1] - p.z, l = Math.hypot(dx, dz);
        v.walkT += dt;
        if (l < 0.3 || v.walkT > 25) { v.target = null; v.wait = 3 + Math.random() * 8; }
        else if (d > 0.9) {
          const sp = 0.85 * dt, nx = p.x + dx / l * sp, nz = p.z + dz / l * sp;
          if (this.walkable(nx, nz) && Math.abs(this.ground.height(nx, nz) - p.y) < 0.12) { p.x = nx; p.z = nz; moving = true; } else { v.target = null; v.wait = 1; }
          v.o.rotation.y += wrapA(Math.atan2(dx, dz) - v.o.rotation.y) * Math.min(1, dt * 5);
        }
      }
    }
    if (d > 8) v.waved = v.waved && d < 30;
    p.y = this.ground.height(p.x, p.z);
    // procedural animation: waddle walk, idle breathing, a wave, nodding while talking
    const L = v.L, t = v.t, sw = moving ? Math.sin(t * 8) * 0.55 : 0;
    if (L.leg_l) { L.leg_l.rotation.x = sw; L.leg_r.rotation.x = -sw; }
    if (L.arm_l) { L.arm_l.rotation.set(-sw * 0.7, 0, -0.08); L.arm_r.rotation.set(sw * 0.7, 0, 0.08); }
    if (L.body) { L.body.rotation.z = moving ? Math.sin(t * 8) * 0.06 : 0; L.body.position.y = v.bodyY + (moving ? Math.abs(Math.cos(t * 8)) * 0.025 : Math.sin(t * 2) * 0.006); }
    if (L.head) { L.head.rotation.set(v.talking ? Math.sin(t * 9) * 0.07 : Math.sin(t * 0.7) * 0.05, !moving && !v.talking ? Math.sin(t * 0.4) * 0.3 : 0, moving ? Math.sin(t * 8) * 0.05 : 0); }
    if (v.wave > 0) { v.wave -= dt; if (L.arm_r) L.arm_r.rotation.set(-2.6, 0, 0.3 + Math.sin(t * 14) * 0.35); }
    if (v.talking && L.arm_l) L.arm_l.rotation.x = Math.sin(t * 3) * 0.25 - 0.2;
  }
  // ---------------------------------------------------------------- props: flowers, fruit trees, rocks, beach
  buildProps() {
    this.flowers = this.town.flowers || [];
    // みかんの木: a little orchard on the hill above the houses and two by the plaza
    const fts = [[-24, -60], [-18, -64], [-30, -66], [26, -102], [53, -104]];
    for (const [x0, z0] of fts) {
      if (!this.town.protos.fruit_tree) break;
      const p = this.near(x0, z0, (x, z) => this.soft(x, z, 1.4), 20) || this.near(x0, z0, (x, z) => this.walkable(x, z) && !this.onRoad(x, z) && !this.blockedAt(x, z, 1.4), 20); if (!p) continue;
      const o = this.town.clone('fruit_tree', p[0], this.ground.height(p[0], p[1]), p[1], Math.random() * 6.28, true); o.scale.setScalar(0.85);
      const id = `fruit@${Math.round(p[0])},${Math.round(p[1])}`;
      this.fruitTrees.push({ o, x: p[0], z: p[1], id, fruit: o.getObjectByName('fruit_tree_fruit') });
      this.town.colliders.push({ type: 'c', x: p[0], z: p[1], r: 0.3, y0: -50, y1: this.ground.height(p[0], p[1]) + 3 });
      this.trees.push({ x: p[0], y: 0, z: p[1], rad: 0.3, id, fruitTree: true });
    }
    // dig spot / shell / bottle meshes are cloned per day in refreshDay()
    const sg = new THREE.ConeGeometry(0.07, 0.06, 9); sg.rotateX(-PI / 2 + 0.3); sg.translate(0, 0.025, 0);
    this.shellGeo = sg;
  }
  onRoad(x, z) { const s = this.ground.sample(x, z); return !!(s.plat && /asphalt|road/.test(s.plat.mat || '')); }
  // today's dig spots, the money rock, shells and the message bottle (seeded by the date: the same all day)
  refreshDay() {
    const k = dayKey(); if (this.day === k) return; this.day = k;
    this.st.checkDay();
    for (const s of this.spots) this.root.remove(s.o); this.spots = [];
    for (const p of this.pickups) this.root.remove(p.o); this.pickups = [];
    const r = seeded('day' + k);
    const areas = [[-70, 10, -100, -20], [-140, -96, -40, 8], [24, 56, -120, -98], [-30, 8, -134, -104], [60, 120, 40, 110], [70, 125, 178, 228]];
    for (let i = 0; i < 7; i++) {
      const a = areas[i % areas.length];
      let p = null;
      for (let k2 = 0; k2 < 80 && !p; k2++) { const x = a[0] + r() * (a[1] - a[0]), z = a[2] + r() * (a[3] - a[2]); if (this.soft(x, z, 0.8) && this.ground.height(x, z) < 40) p = [x, z]; }
      if (!p || this.st.daily.dug[i]) continue;
      const o = this.town.clone('dig_spot', p[0], this.ground.height(p[0], p[1]) + 0.01, p[1], r() * 6.28, true); this.root.attach(o); o.scale.setScalar(1.1);
      this.spots.push({ i, o, x: p[0], z: p[1], money: i === 6 });
    }
    const reach = this.rocks.filter((rk) => rk.y > 0.2 && rk.rad < 3.5 && [0, 1.6, 3.2, 4.8].some((a) => this.walkable(rk.x + Math.cos(a) * (rk.rad + 0.8), rk.z + Math.sin(a) * (rk.rad + 0.8))));
    this.moneyRock = reach.length ? reach[Math.floor(r() * reach.length)] : null;
    // beach combing: shells and one message bottle on the east beach and the island
    const sand = (x, z) => { const s = this.ground.sample(x, z); return !s.plat && s.h > 0.05 && s.h < 1.6 && !this.blockedAt(x, z, 0.3); };
    let n = 0;
    for (let k2 = 0; k2 < 200 && n < 7; k2++) {
      const isl = r() < 0.35, x = isl ? 70 + r() * 56 : 64 + r() * 66, z = isl ? 176 + r() * 54 : 40 + r() * 80;
      if (!sand(x, z) || !this.nearWater(x, z, 7)) continue;
      const sh = SHELLS[Math.floor(r() * SHELLS.length)], idn = 'shell' + n++;
      if (this.st.daily.picked[idn]) continue;
      this.addPickup(sh.id, x, z, idn);
    }
    for (let k2 = 0; k2 < 200; k2++) {
      const x = 64 + r() * 66, z = 40 + r() * 80;
      if (!sand(x, z) || !this.nearWater(x, z, 4)) continue;
      if (!this.st.daily.bottle) this.addPickup('letter', x, z, 'bottle');
      break;
    }
    for (const ft of this.fruitTrees) if (ft.fruit) ft.fruit.visible = !this.st.daily.fruit[ft.id];
    this.st.save();
  }
  nearWater(x, z, R) { for (let a = 0; a < 6.28; a += 0.8) if (this.water(x + Math.cos(a) * R, z + Math.sin(a) * R)) return true; return false; }
  addPickup(id, x, z, key, money = 0) {
    let o;
    const y = this.ground.height(x, z);
    if (id === 'letter' && this.town.protos.bottle_msg) { o = this.town.clone('bottle_msg', x, y + 0.03, z, Math.random() * 6.28, true); this.root.attach(o); o.scale.setScalar(1.2); }
    else if (id === 'mikan') { o = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf08a1a, roughness: 0.55 })); o.position.set(x, y + 0.07, z); this.root.add(o); }
    else if (id === 'branch') { o = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.45, 5), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 })); o.rotation.set(PI / 2, 0, Math.random() * 6); o.position.set(x, y + 0.03, z); this.root.add(o); }
    else if (money) { o = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe8d7a0, roughness: 0.7 })); o.scale.set(1, 1.1, 1); o.position.set(x, y + 0.1, z); this.root.add(o); }
    else {   // shells: a small pale cone, tinted per kind
      const tint = { tsumetagai: 0xe8dcc8, sakuragai: 0xf4b8c0, hotate: 0xe8a070, seaglass: 0x8ad0b0, takaragai: 0xd8b880, seaglass_blue: 0x6aa8e0 }[id] || 0xeee0cc;
      o = new THREE.Mesh(this.shellGeo, new THREE.MeshStandardMaterial({ color: tint, roughness: 0.4 })); o.position.set(x, y, z); o.rotation.y = Math.random() * 6; o.scale.setScalar(1.6); this.root.add(o);
    }
    o.castShadow = true;
    const p = { id, o, x, z, key, money }; this.pickups.push(p); return p;
  }
  // ---------------------------------------------------------------- tools in the paw
  buildTools() {
    this.toolObj = {};
    const arm = this.player.limbs.arm_r;
    for (const t of TOOLS) {
      const name = 'tool_' + t.id; if (!this.town.protos[name]) continue;
      const o = this.town.clone(name, 0, 0, 0, 0, true); arm.add(o);
      o.position.set(0.06, -0.26, 0.05); o.rotation.set(PI / 2, 0, 0); o.scale.setScalar(t.id === 'shovel' ? 0.7 : 0.85);
      if (t.id === 'shovel') o.position.z -= 0.05;
      o.visible = false; this.toolObj[t.id] = o;
      o.userData.len = this.town.protos[name].box.max.y;
    }
  }
  equip(id) {
    this.st.tool = id && this.st.has(id) ? id : null; this.st.save();
    for (const [k, o] of Object.entries(this.toolObj)) o.visible = k === this.st.tool;
    this.cancelCast();
  }
  // ---------------------------------------------------------------- fishing
  buildFishing() {
    const b = this.bobber = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 6, 0, PI * 2, 0, PI / 2), new THREE.MeshStandardMaterial({ color: 0xff3a2a, roughness: 0.4, emissive: 0x801010 }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 6, 0, PI * 2, PI / 2, PI / 2), new THREE.MeshStandardMaterial({ color: 0xf4f4ee, roughness: 0.4, emissive: 0x404040 }));
    b.add(top, bot); b.visible = false; this.root.add(b);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.7 })); this.line.frustumCulled = false; this.line.visible = false; this.root.add(this.line);
    this.shadowGeo = new THREE.CircleGeometry(0.5, 20); this.shadowGeo.rotateX(-PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x0a1418, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const rg = new THREE.RingGeometry(0.08, 0.13, 20); rg.rotateX(-PI / 2);
    this.ripple = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); this.ripple.renderOrder = 3; this.root.add(this.ripple);
  }
  fishZone(x, z) {
    if (x > 60 && (z > 30 || x > 126)) return 'beach';
    if (x > -88 && x < 66 && z > -14 && z < 116) return 'pier';
    return 'sea';
  }
  pickSpecies(list, where, extra) {
    const m = this.month(), h = this.hour();
    const ok = list.filter((s) => [].concat(s.where).includes(where) && s.months.includes(m) && inHours(s.hours, h) && (!extra || extra(s)));
    if (!ok.length) return null;
    let sum = 0; for (const s of ok) sum += RARITY_W[s.rarity] || 1;
    let u = Math.random() * sum; for (const s of ok) { u -= RARITY_W[s.rarity] || 1; if (u <= 0) return s; }
    return ok[0];
  }
  spawnFish(pp) {
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * 6.28, r = 6 + Math.random() * 18, x = pp.x + Math.cos(a) * r, z = pp.z + Math.sin(a) * r;
      if (!this.water(x, z) || !this.water(x + 1.5, z) || !this.water(x - 1.5, z) || !this.water(x, z + 1.5) || !this.water(x, z - 1.5)) continue;
      if (!this.nearLand(x, z, 9)) continue;
      const sp = this.pickSpecies(FISH, this.fishZone(x, z)); if (!sp) return;
      const o = new THREE.Mesh(this.shadowGeo, this.shadowMat); o.renderOrder = 2;
      const L = 0.35 + sp.size * 0.2; o.scale.set(L * 0.42, 1, L);
      if (sp.id === 'tako' || sp.id === 'ei') o.scale.set(L * 0.8, 1, L * 0.8);
      o.position.set(x, 0, z); this.root.add(o);
      this.fish.push({ sp, o, x, z, h: Math.random() * 6.28, sp0: 0.25, state: 'swim', t: 0, turnT: 0, fade: 0, L });
      return;
    }
  }
  nearLand(x, z, R) { for (let a = 0; a < 6.28; a += 0.6) { const s = this.ground.sample(x + Math.cos(a) * R, z + Math.sin(a) * R); if (s.plat || s.h > 0) return true; } return false; }
  updateFish(dt, pp) {
    const run = this.player.speed > 5.2;
    for (let i = this.fish.length - 1; i >= 0; i--) {
      const f = this.fish[i]; f.t += dt;
      const dP = Math.hypot(pp.x - f.x, pp.z - f.z);
      if (dP > 45 && f.state !== 'hooked') f.state = 'gone';
      if (f.state !== 'flee' && f.state !== 'gone' && run && dP < 7 && !this.cast) { f.state = 'flee'; }
      let speed = 0, want = f.h;
      const c = this.cast;
      if (f.state === 'swim') {
        f.turnT -= dt; if (f.turnT <= 0) { f.turnT = 2 + Math.random() * 3; f.dh = (Math.random() - 0.5) * 1.6; }
        want = f.h + f.dh * dt * 2; speed = 0.22;
        if (c && c.phase === 'wait' && !c.fish) {
          const d = Math.hypot(c.x - f.x, c.z - f.z);
          if (d < 0.7) { f.state = 'flee'; }   // the float landed on its head
          else if (d < 6 && Math.random() < dt * 0.9) { f.state = 'approach'; c.fish = f; }
        }
      } else if (f.state === 'approach' || f.state === 'nibble' || f.state === 'hooked') {
        const hx = c.x - Math.sin(f.h) * (f.L * 0.5 + 0.06), hz = c.z - Math.cos(f.h) * (f.L * 0.5 + 0.06);
        const dx = hx - f.x, dz = hz - f.z, d = Math.hypot(dx, dz);
        want = Math.atan2(c.x - f.x, c.z - f.z);
        if (f.state === 'approach') { speed = d > 0.05 ? Math.min(0.55, d * 1.5) : 0; if (d < 0.08) { f.state = 'nibble'; c.phase = 'nibble'; c.nib = 1 + Math.floor(Math.random() * 4); c.nibT = 0.8 + Math.random() * 1.2; } }
        else { f.x += dx * Math.min(1, dt * 4); f.z += dz * Math.min(1, dt * 4); }
      } else if (f.state === 'flee') { speed = 3; f.fade += dt; if (f.fade > 1.2) f.state = 'gone'; }
      if (f.state === 'gone') { this.root.remove(f.o); if (f.o.material !== this.shadowMat) f.o.material.dispose(); this.fish.splice(i, 1); if (c && c.fish === f) c.fish = null; continue; }
      f.h += wrapA(want - f.h) * Math.min(1, dt * (f.state === 'flee' ? 6 : 2));
      const nx = f.x + Math.sin(f.h) * speed * dt, nz = f.z + Math.cos(f.h) * speed * dt;
      if (this.water(nx, nz) || f.state === 'flee') { f.x = nx; f.z = nz; } else if (f.state === 'swim') f.dh = PI;
      f.o.position.set(f.x, this.world.swell(f.x, f.z) + 0.04, f.z);
      f.o.rotation.y = f.h + Math.sin(f.t * 5) * 0.08;
      if (f.fade) { if (f.o.material === this.shadowMat) f.o.material = this.shadowMat.clone(); f.o.material.opacity = 0.42 * Math.max(0, 1 - f.fade / 1.2); }
    }
  }
  rodTip() { const o = this.toolObj.rod; return o.localToWorld(new THREE.Vector3(0, o.userData.len || 1.2, 0)); }
  startCast() {
    const p = this.player.pos, h = this.player.heading;
    let best = null;
    for (const r of [3.2, 2.6, 3.8, 2.0, 4.5]) { const x = p.x + Math.sin(h) * r, z = p.z + Math.cos(h) * r; if (this.water(x, z)) { best = [x, z]; break; } }
    this.anim = { kind: 'cast', t: 0, dur: 0.45 };
    if (!best) { this.ui.toast('ここでは つりができないみたい'); return; }
    this.cast = { x: best[0], z: best[1], phase: 'fly', t: 0, fish: null };
    this.ui.blip(300, 0.15, 'sine', 0.1);
  }
  cancelCast(msg) {
    if (!this.cast) return;
    const f = this.cast.fish; if (f && f.state !== 'gone') { f.state = 'flee'; f.fade = 0.01; }
    this.cast = null; this.bobber.visible = false; this.line.visible = false;
    if (msg) this.ui.toast(msg);
  }
  splash(vol = 0.3, freq = 900) {
    const s = this.app.sound, c = s.ctx; if (!c || !s.on || !s.noise) return;
    const t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = s.noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(f).connect(g).connect(s.master); src.start(t, Math.random() * 2); src.stop(t + 0.4);
  }
  updateCast(dt) {
    const c = this.cast; if (!c) return;
    c.t += dt;
    const sy = this.world.swell(c.x, c.z);
    let y = sy + 0.02;
    this.ripple.material.opacity = Math.max(0, this.ripple.material.opacity - dt * 0.8);
    this.ripple.scale.setScalar(1 + (1 - this.ripple.material.opacity) * 5);
    const rip = (k) => { this.ripple.position.set(c.x, sy + 0.03, c.z); this.ripple.material.opacity = k; };
    if (c.phase === 'fly') {
      const k = Math.min(1, c.t / 0.45), tip = this.rodTip();
      this.bobber.position.set(tip.x + (c.x - tip.x) * k, tip.y + (y - tip.y) * k + Math.sin(k * PI) * 0.8, tip.z + (c.z - tip.z) * k);
      if (k >= 1) { c.phase = 'wait'; c.t = 0; this.splash(0.15, 1400); rip(0.8); c.waitMax = 25; }
    } else {
      if (c.phase === 'wait' && c.t > c.waitMax) { this.cancelCast(); return; }
      if (c.phase === 'nibble') {
        c.nibT -= dt;
        if (c.nibT < 0.15 && c.nibT > 0) y -= 0.035;
        if (c.nibT <= 0) {
          this.ui.blip(240, 0.07, 'sine', 0.14); rip(0.5);
          if (--c.nib <= 0) { c.phase = 'bite'; c.t = 0; c.win = c.fish && c.fish.sp.size >= 5 ? 0.55 : 0.75; this.splash(0.45, 700); rip(1); }
          else c.nibT = 0.9 + Math.random() * 1.3;
        }
      }
      if (c.phase === 'bite') { y -= 0.14; if (c.t > c.win) { this.cancelCast('にげられた……'); return; } }
      this.bobber.position.set(c.x, y, c.z);
    }
    this.bobber.visible = true;
    const tip = this.rodTip(), pos = this.line.geometry.attributes.position;
    pos.setXYZ(0, tip.x, tip.y, tip.z); pos.setXYZ(1, this.bobber.position.x, this.bobber.position.y + 0.03, this.bobber.position.z); pos.needsUpdate = true;
    this.line.visible = true;
  }
  async reel() {
    const c = this.cast; this.anim = { kind: 'reel', t: 0, dur: 0.5 };
    if (c.phase !== 'bite' || !c.fish) { this.cancelCast(c.phase === 'nibble' ? 'あっ、にげられた……' : null); return; }
    const f = c.fish; this.root.remove(f.o); this.fish.splice(this.fish.indexOf(f), 1);
    this.cast = null; this.bobber.visible = false; this.line.visible = false;
    this.splash(0.5, 600);
    await this.got(f.sp, 'fish');
  }
  // a catch: the fanfare line, into the pocket (or let it go when the pocket is full)
  async got(sp, kind) {
    this.anim = { kind: 'show', t: 0, dur: 1e9, item: sp.id };
    this.ui.jingle();
    const held = this.itemSprite(sp.id); held.position.copy(this.player.pos).y += 0.95; this.root.add(held);
    const first = !this.st.caught[sp.id];
    const lines = [sp.comment || `${sp.name}を つかまえた!`];
    if (first) lines.push(`${sp.name}が 図鑑に のった!`);
    if (this.st.full()) { lines.push('……でも ポケットが いっぱいだ。', `${sp.name}を にがしてあげた。`); if (first) this.st.caught[sp.id] = dayKey(); }
    else this.st.add(sp.id);
    this.st.stats[kind] = (this.st.stats[kind] || 0) + 1; this.st.lastCatch = { id: sp.id, kind, t: Date.now() }; this.st.save();
    await this.ui.say(null, lines);
    this.anim = null; this.root.remove(held); held.material.map.dispose(); held.material.dispose();
  }
  // the catch held up over the head: the item's icon drawn on a sprite
  itemSprite(id) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'); g.fillStyle = 'rgba(255,250,235,0.92)'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
    g.font = '76px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(icon(id), 64, 70);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false })); sp.scale.setScalar(0.45); sp.renderOrder = 10;
    return sp;
  }
  // ---------------------------------------------------------------- bugs
  bugMesh(id) {
    const [shape, c1, c2 = 0x222222] = BUG_LOOK[id] || ['crawl', 0x333333];
    const g = new THREE.Group(), m1 = new THREE.MeshStandardMaterial({ color: c1, roughness: 0.6, side: THREE.DoubleSide }), m2 = new THREE.MeshStandardMaterial({ color: c2, roughness: 0.5, side: THREE.DoubleSide });
    const body = (sx, sy, sz, m, z = 0) => { const b = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), m); b.scale.set(sx, sy, sz); b.position.z = z; g.add(b); return b; };
    g.userData.wings = [];
    if (shape === 'fly') {
      body(0.012, 0.012, 0.045, m2);
      for (const s of [-1, 1]) {
        const w = new THREE.Group(), wg = new THREE.CircleGeometry(0.06, 10); wg.translate(0.05, 0, 0);
        const a = new THREE.Mesh(wg, m1); a.scale.set(1, 1, 1); a.rotation.x = -PI / 2; w.add(a);
        const e = new THREE.Mesh(wg, m2); e.scale.set(0.55, 0.55, 1); e.position.set(0.035, 0.001, -0.02); e.rotation.x = -PI / 2; w.add(e);
        w.scale.x = s; g.add(w); g.userData.wings.push(w);
      }
    } else if (shape === 'dragon') {
      body(0.012, 0.012, 0.11, m1, -0.04); body(0.02, 0.018, 0.025, m2, 0.04);
      const wm = new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
      for (const s of [-1, 1]) {
        const w = new THREE.Group();
        for (const dz of [0.02, -0.015]) { const wg = new THREE.PlaneGeometry(0.12, 0.025); wg.translate(0.065, 0, 0); const a = new THREE.Mesh(wg, wm); a.rotation.x = -PI / 2; a.position.z = dz; w.add(a); }
        w.scale.x = s; g.add(w); g.userData.wings.push(w);
      }
    } else if (shape === 'beetle') {
      body(0.035, 0.025, 0.05, m1); body(0.025, 0.02, 0.022, m2, 0.05);
      if (/kabuto|nokogiri|miyama|okuwa/.test(id)) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.05, 5), m2); h.rotation.x = PI / 2 - 0.4; h.position.set(0, 0.01, 0.085); g.add(h); }
    } else if (shape === 'shell') {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), m1); s.position.y = 0.035; g.add(s); body(0.012, 0.01, 0.05, m2, 0.02).position.y = 0.008;
    } else if (shape === 'dot') {
      const b = body(0.03, 0.022, 0.035, m1); b.position.y = 0.02;
      if (id === 'sunagani') { for (const s of [-1, 1]) { const cl = body(0.012, 0.01, 0.02, m2); cl.position.set(s * 0.035, 0.015, 0.03); } }
    } else if (shape === 'glow') {
      body(0.01, 0.01, 0.025, m1); const l = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: c2 })); l.position.z = -0.02; g.add(l); g.userData.glow = l;
    } else {   // crawl: ants, crickets, hoppers, mantis, pond skaters
      const long = /tonosama|kamakiri/.test(id), k = /ari/.test(id) ? 0.7 : 1;
      body(0.015 * k, 0.014 * k, (long ? 0.06 : 0.035) * k, m1); body(0.012 * k, 0.012 * k, 0.014 * k, m1, (long ? 0.06 : 0.04) * k);
      if (/amenbo/.test(id)) for (const s of [-1, 1]) for (const dz of [-0.03, 0.03]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.09, 3), m1); l.rotation.z = PI / 2; l.position.set(s * 0.04, 0, dz); g.add(l); }
    }
    g.scale.setScalar(1.8); g.userData.shape = shape;
    return g;
  }
  spawnBug(pp) {
    const sp = this.pickSpecies(BUGS, pick(['flower', 'air', 'tree', 'tree', 'ground', 'water', 'beach', 'rock']), null);
    if (!sp) return;
    let x, y, z, mode = 'sit', base = null;
    const dist = (a) => Math.hypot(a.x - pp.x, a.z - pp.z), ring = (a) => { const d = dist(a); return d > 7 && d < 32; };
    const randLand = (test) => { for (let k = 0; k < 10; k++) { const a = Math.random() * 6.28, r = 8 + Math.random() * 20, px = pp.x + Math.cos(a) * r, pz = pp.z + Math.sin(a) * r; if (test(px, pz)) return [px, pz]; } return null; };
    if (sp.where === 'tree') {
      const ts = this.trees.filter((t) => ring(t) && !t.fruitTree); if (!ts.length) return;
      const t = pick(ts), a = Math.random() * 6.28; x = t.x + Math.sin(a) * 0.32; z = t.z + Math.cos(a) * 0.32; y = this.ground.height(t.x, t.z) + 0.9 + Math.random() * 0.7; base = a; mode = 'trunk';
    } else if (sp.where === 'flower') {
      const fs = this.flowers.filter(ring); if (!fs.length) return;
      const f = pick(fs); x = f.x; z = f.z; y = this.ground.height(x, z) + 0.3; mode = /monshiro|ageha|omurasaki|aosuji/.test(sp.id) ? 'hover' : 'sit';
    } else if (sp.where === 'rock') {
      const rs = this.rocks.filter(ring); if (!rs.length) return;
      const rk = pick(rs); const p = this.near(rk.x, rk.z, (a, b) => this.walkable(a, b) && Math.hypot(a - rk.x, b - rk.z) > 0.6, 4); if (!p) return; [x, z] = p; y = this.ground.height(x, z);
    } else if (sp.where === 'water') {
      const p = randLand((a, b) => this.water(a, b) && this.nearLand(a, b, 3)); if (!p) return; [x, z] = p; y = this.world.swell(x, z) + 0.02;
      mode = sp.id === 'genjibotaru' ? 'hover' : 'skate'; if (mode === 'hover') { const q = this.near(x, z, (a, b) => !this.water(a, b), 4); if (q) [x, z] = q; y = this.ground.height(x, z) + 0.8; }
    } else if (sp.where === 'beach') {
      const p = randLand((a, b) => { const s = this.ground.sample(a, b); return a > 60 && !s.plat && s.h > 0.05 && s.h < 1.6; }); if (!p) return; [x, z] = p; y = this.ground.height(x, z);
    } else if (sp.where === 'air') {
      const p = randLand((a, b) => { const s = this.ground.sample(a, b); return s.h > 0 && !this.blockedAt(a, b, 1); }); if (!p) return; [x, z] = p; y = this.ground.height(x, z) + 0.8 + Math.random() * 1.2; mode = 'fly';
    } else {
      const p = randLand((a, b) => this.soft(a, b, 0.3)); if (!p) return; [x, z] = p; y = this.ground.height(x, z);
    }
    const o = this.bugMesh(sp.id); o.position.set(x, y, z); this.root.add(o);
    if (mode === 'trunk') { o.rotation.set(-PI / 2, base + PI, 0, 'YXZ'); }
    this.bugs.push({ sp, o, mode, x, y, z, x0: x, y0: y, z0: z, t: Math.random() * 9, h: Math.random() * 6.28, flee: 0, base });
  }
  updateBugs(dt, pp) {
    const pl = this.player, sneak = this.ready, fast = pl.speed > (sneak ? 9 : 2.6), run = pl.speed > 5.2;
    for (let i = this.bugs.length - 1; i >= 0; i--) {
      const b = this.bugs[i], o = b.o; b.t += dt;
      const d = Math.hypot(pp.x - b.x, pp.z - b.z);
      if (d > 50) { this.root.remove(o); this.bugs.splice(i, 1); continue; }
      if (!b.flee && ((fast && d < 4.5) || (run && d < 8))) { b.flee = 1e-3; b.fh = Math.atan2(b.x - pp.x, b.z - pp.z); }
      if (b.flee) {
        b.flee += dt; b.x += Math.sin(b.fh) * 4 * dt; b.z += Math.cos(b.fh) * 4 * dt; b.y += (b.mode === 'trunk' || b.mode === 'fly' || b.mode === 'hover' ? 2.5 : 0.6) * dt;
        o.position.set(b.x, b.y, b.z); o.rotation.set(0, b.fh, 0); o.scale.setScalar(1.8 * Math.max(0, 1 - b.flee / 1.4));
        if (b.mode === 'sit' || b.mode === 'skate') o.position.y = b.y0 + (b.flee * 0.2);
        if (b.flee > 1.4) { this.root.remove(o); this.bugs.splice(i, 1); }
        this.flap(o, b.t, 1);
        continue;
      }
      if (b.mode === 'fly' || b.mode === 'hover') {
        const R = b.mode === 'fly' ? 2.5 : 0.35;
        const nx = b.x0 + Math.sin(b.t * 0.35) * R + Math.sin(b.t * 0.9) * R * 0.3, nz = b.z0 + Math.cos(b.t * 0.27) * R;
        b.h = Math.atan2(nx - b.x, nz - b.z); b.x = nx; b.z = nz; b.y = b.y0 + Math.sin(b.t * 1.7) * 0.15;
        o.position.set(b.x, b.y, b.z); o.rotation.y = b.h; this.flap(o, b.t, 1);
        if (o.userData.glow) o.userData.glow.visible = Math.sin(b.t * 2.2) > -0.3;
      } else if (b.mode === 'skate' || b.mode === 'sit') {
        b.h += Math.sin(b.t * 0.6) * dt * 0.8;
        const step = (Math.sin(b.t * 0.8) > 0.4 && b.sp.where !== 'flower' ? 0.15 : 0) * dt;
        const nx = b.x + Math.sin(b.h) * step, nz = b.z + Math.cos(b.h) * step;
        if (Math.hypot(nx - b.x0, nz - b.z0) < 1.2) { b.x = nx; b.z = nz; }
        b.y = b.mode === 'skate' ? this.world.swell(b.x, b.z) + 0.02 : (b.sp.where === 'flower' ? b.y0 : this.ground.height(b.x, b.z));
        o.position.set(b.x, b.y, b.z); o.rotation.y = b.h; this.flap(o, b.t, 0.05);
      } else {   // on a trunk: cicadas buzz in place, beetles creep up and down
        o.position.set(b.x, b.y0 + Math.sin(b.t * 0.3) * 0.1, b.z);
      }
    }
  }
  flap(o, t, k) { const w = o.userData.wings; if (!w.length) return; const s = o.userData.shape === 'dragon' ? Math.sin(t * 40) * 0.25 * k : Math.sin(t * 14) * 0.9 * k; w[0].rotation.z = -s; w[1].rotation.z = s; }
  swingNet() {
    this.anim = { kind: 'net', t: 0, dur: 0.5 };
    this.ui.blip(500, 0.12, 'triangle', 0.08);
    const pp = this.player.pos, h = this.player.heading, nx = pp.x + Math.sin(h) * 0.75, nz = pp.z + Math.cos(h) * 0.75;
    let best = null, bd = 1.35;
    for (const b of this.bugs) { if (b.flee) continue; const d = Math.hypot(b.x - nx, b.z - nz); if (d < bd && b.y - pp.y < 2.1) { bd = d; best = b; } }
    if (!best) { setTimeout(() => { for (const b of this.bugs) if (!b.flee && Math.hypot(b.x - pp.x, b.z - pp.z) < 3) { b.flee = 1e-3; b.fh = Math.atan2(b.x - pp.x, b.z - pp.z); } }, 200); return; }
    this.root.remove(best.o); this.bugs.splice(this.bugs.indexOf(best), 1);
    setTimeout(() => this.got(best.sp, 'bug'), 350);
  }
  // ---------------------------------------------------------------- dig, shake, rocks, pick up
  async dig(s) {
    if (this.st.full() && !s.money) { this.ui.toast('ポケットが いっぱい! 何か 売ってからにしよう'); return; }
    this.anim = { kind: 'dig', t: 0, dur: 0.7 };
    this.splash(0.18, 300);
    this.root.remove(s.o); this.spots.splice(this.spots.indexOf(s), 1); this.st.daily.dug[s.i] = 1;
    await new Promise((r) => setTimeout(r, 600));
    this.st.stats.dig = (this.st.stats.dig || 0) + 1;
    if (s.money) { this.st.money += 1000; this.st.save(); this.ui.jingle([660, 880, 1320]); await this.ui.say(null, ['1,000 ナギの ふくろを ほりあてた!']); return; }
    this.ui.jingle([523, 659, 784]);
    this.st.add('fossil_unknown');
    await this.ui.say(null, ['化石を ほりだした!', '神社の ほうさくさんに 鑑定してもらおう。']);
  }
  hitRock(rock) {
    const r = this.moneyRock, pp = this.player.pos;
    this.anim = { kind: 'dig', t: 0, dur: 0.45 };
    this.ui.blip(1800, 0.06, 'square', 0.06);
    if (!r || r !== rock || this.st.daily.rock >= 7) return;
    const v = [100, 150, 200, 300, 400, 600, 800][this.st.daily.rock++];
    const h = this.player.heading, a = h + PI + (Math.random() - 0.5) * 2.5;
    const p = this.near(pp.x + Math.sin(a) * 0.9, pp.z + Math.cos(a) * 0.9, (x, z) => this.walkable(x, z), 3) || [pp.x, pp.z];
    this.addPickup('money', p[0], p[1], null, v);
    this.ui.toast(`カツン! ${v} ナギが とびだした!`); this.st.save();
  }
  async shake(t) {
    this.anim = { kind: 'shake', t: 0, dur: 0.9 };
    this.splash(0.1, 2500);
    const d = this.st.daily;
    if (t.fruitTree) {
      const ft = this.fruitTrees.find((f) => f.id === t.id);
      ft.shakeT = 0.9;
      if (!d.fruit[t.id]) {
        d.fruit[t.id] = 1; if (ft.fruit) ft.fruit.visible = false;
        for (let k = 0; k < 3; k++) { const a = k * 2.1 + Math.random(); const p = this.near(t.x + Math.sin(a) * 1.0, t.z + Math.cos(a) * 1.0, (x, z) => this.walkable(x, z), 2) || [t.x + 1, t.z]; this.addPickup('mikan', p[0], p[1], null); }
        this.ui.toast('みかんが おちてきた!'); this.st.save();
      }
      return;
    }
    if (d.shaken[t.id]) return;
    d.shaken[t.id] = 1; this.st.save();
    const u = Math.random(), pp = this.player.pos;
    const p = this.near((t.x + pp.x) / 2, (t.z + pp.z) / 2, (x, z) => this.walkable(x, z), 2) || [pp.x, pp.z];
    if (u < 0.12) { this.addPickup('money', p[0], p[1], null, 100); this.ui.toast('ナギが おちてきた!'); }
    else if (u < 0.3) { this.addPickup('branch', p[0], p[1], null); this.ui.toast('木の枝が おちてきた'); }
  }
  async take(p) {
    if (p.money) { this.st.money += p.money; this.ui.blip(1320, 0.1, 'triangle', 0.15); this.ui.toast(`${p.money} ナギ ひろった`); }
    else {
      if (this.st.full()) { this.ui.toast('ポケットが いっぱい!'); return; }
      if (p.id === 'letter') {
        this.st.daily.bottle = true; this.root.remove(p.o); this.pickups.splice(this.pickups.indexOf(p), 1);
        const from = pick(VILLAGERS.filter((v) => v.role === 'resident'));
        const notes = ['海の向こうのだれかへ。きょうも波の音がきこえますか。わたしは元気です。', 'この瓶をひろったキミ、すてきな一日を! 浜辺のさくら貝は、しあわせのしるしだって。', '夕日が沈むとき、海が金色になるのを見たことある? 一度は見てほしいな。', 'みかんの木は、ゆすると実を落としてくれるよ。毎日ためしてみてね。'];
        this.ui.jingle([523, 784]);
        await this.ui.say(null, ['瓶に 手紙が 入っていた。', `「${pick(notes)}」`, `……すみっこに 「${from.name}」と 書いてある。`]);
        const sh = pick(SHELLS); this.st.add(sh.id); this.ui.toast(`${sh.name}も 入っていた!`); return;
      }
      this.st.add(p.id); this.ui.blip(990, 0.08, 'triangle', 0.14); this.ui.toast(`${ITEMS[p.id].name}を ひろった`);
    }
    if (p.key) this.st.daily.picked[p.key] = 1;
    this.root.remove(p.o); this.pickups.splice(this.pickups.indexOf(p), 1); this.st.save();
  }
  // ---------------------------------------------------------------- talking
  vars(def, extra = {}) { return { name: PLAYER, phrase: def.catchphrase, ...extra }; }
  async talk(v) {
    const d = v.def, st = this.st;
    v.talking = true; this.player.heading = Math.atan2(v.o.position.x - this.player.pos.x, v.o.position.z - this.player.pos.z);
    this.camSave = this.player.dist; this.player.dist = Math.min(this.player.dist, 4.2);
    try {
      if (d.role === 'shop') await this.shop(v);
      else if (d.role === 'museum') await this.museum(v);
      else await this.chat(v);
    } finally { v.talking = false; v.wait = 2 + Math.random() * 3; this.player.dist = this.camSave; st.save(); }
  }
  timeKey() { const h = this.hour(); return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'noon' : h >= 17 && h < 20 ? 'evening' : 'night'; }
  lineFor(v, first) {
    const d = v.def, P = DIALOGUE[d.personality] || DIALOGUE.futsuu, st = this.st, lc = st.lastCatch;
    const recent = lc && Date.now() - lc.t < 15 * 60e3;
    const opts = [[P[this.timeKey()], 3], [P.greet, 2], [SEASON_TALK[this.month()] || [], 1.5]];
    if (recent) opts.push([lc.kind === 'fish' ? P.afterFish : P.afterBug, first ? 4 : 2]);
    if ((st.friend[d.id] || 0) >= 8) opts.push([P.friend, 1.5]);
    let sum = 0; for (const [a, w] of opts) if (a.length) sum += w;
    let u = Math.random() * sum; let set = opts[0][0];
    for (const [a, w] of opts) { if (!a.length) continue; u -= w; if (u <= 0) { set = a; break; } }
    return fill(pick(set), this.vars(d, { item: recent ? ITEMS[lc.id].name : '' }));
  }
  async chat(v) {
    const d = v.def, st = this.st, sp = v.speaker, P = DIALOGUE[d.personality] || DIALOGUE.futsuu;
    if (!st.met[d.id]) { st.met[d.id] = 1; await this.ui.say(sp, d.greeting.split('\n').join('\n')); }
    if (!st.daily.talked[d.id]) { st.daily.talked[d.id] = 1; st.friend[d.id] = (st.friend[d.id] || 0) + 1; }
    let line = this.lineFor(v, true);
    for (let n = 0; n < 6; n++) {
      const k = await this.ui.say(sp, line, ['話す', 'プレゼント', 'またね']);
      if (k === 0) { line = this.lineFor(v, false); continue; }
      if (k === 1) {
        const i = await this.ui.pocket(st, { title: `${d.name}に プレゼント`, filter: (id) => ITEMS[id].kind !== 'tool', note: 'あげるものを えらんでね' });
        if (i < 0) { line = fill(pick(P.greet), this.vars(d)); continue; }
        const id = st.remove(i), it = ITEMS[id], love = it.price >= 500;
        if (!st.daily.gift[d.id]) { st.daily.gift[d.id] = 1; st.friend[d.id] = (st.friend[d.id] || 0) + (love ? 4 : 2); }
        this.ui.jingle([659, 784, 988]);
        const lines = [fill(pick(love ? P.giftLove : P.gift), this.vars(d, { item: it.name }))];
        if ((st.friend[d.id] || 0) >= 10 && Math.random() < 0.4 && !st.full()) {
          const back = pick(SHELLS); st.add(back.id); lines.push(fill(`おかえしに、これあげる! ${back.name}だよ、{phrase}`, this.vars(d)));
        }
        await this.ui.say(sp, lines);
        line = this.lineFor(v, false); continue;
      }
      break;
    }
    await this.ui.say(sp, fill(pick(P.bye), this.vars(d)));
  }
  async shop(v) {
    const st = this.st, sp = v.speaker, L = SHOP_LINES, V = (x = {}) => ({ name: PLAYER, ...x });
    let line = fill(pick(L.welcome), V());
    for (let n = 0; n < 12; n++) {
      const k = await this.ui.say(sp, line, ['売る', 'まとめて売る', '道具を買う', 'またね']);
      if (k === 0) {
        const i = await this.ui.pocket(st, { title: '売る', filter: (id) => ITEMS[id].kind !== 'tool', note: '売るものを えらんでね' });
        if (i < 0) { line = 'ほかに なにか あるかい?'; continue; }
        const it = ITEMS[st.pocket[i]];
        const c = await this.ui.say(sp, fill(pick(L.buyPrompt), V({ item: it.name, price: it.price.toLocaleString() })), ['売る', 'やめる']);
        if (c === 0) { st.remove(i); st.money += it.price; st.stats.sold++; this.ui.blip(1320, 0.1, 'triangle', 0.15); line = fill(pick(L.sold), V()); } else line = 'ほかに なにか あるかい?';
      } else if (k === 1) {
        const idx = st.pocket.map((id, i) => [id, i]).filter(([id]) => !['tool', 'fossil?', 'misc'].includes(ITEMS[id].kind) || id === 'branch');
        if (!idx.length) { line = fill(pick(L.nothingToSell), V()); continue; }
        const sum = idx.reduce((a, [id]) => a + ITEMS[id].price, 0);
        const c = await this.ui.say(sp, `魚・虫・貝・果物 ぜんぶで ${idx.length}こ……\f${sum.toLocaleString()} ナギで どうだい?`, ['売る', 'やめる']);
        if (c === 0) { for (const [, i] of idx.reverse()) st.remove(i); st.money += sum; st.stats.sold += idx.length; this.ui.jingle([880, 1175, 1568]); line = fill(pick(L.sold), V()); } else line = 'ほかに なにか あるかい?';
      } else if (k === 2) {
        const rows = TOOLS.map((t) => ({ label: `${t.name}`, sub: st.has(t.id) ? '持っている' : `${t.price} ナギ`, ok: !st.has(t.id) }));
        const i = await this.ui.list('道具を買う', rows);
        if (i < 0) { line = 'ほかに なにか あるかい?'; continue; }
        const t = TOOLS[i];
        const c = await this.ui.say(sp, fill(pick(L.buyTool), V({ item: t.name, price: t.price })), ['買う', 'やめる']);
        if (c !== 0) { line = 'ほかに なにか あるかい?'; continue; }
        if (st.money < t.price) { line = 'おや、ナギが たりないみたいだね。'; continue; }
        if (st.full()) { line = 'ポケットが いっぱいだよ!'; continue; }
        st.money -= t.price; st.add(t.id); this.equip(t.id); this.ui.jingle(); line = `まいど! ${t.name}は もう持ってるよ。\n道具ボタンで 持ちかえてね。`;
      } else break;
    }
    await this.ui.say(sp, fill(pick(L.thanks), V()));
  }
  async museum(v) {
    const st = this.st, sp = v.speaker, L = MUSEUM_LINES, V = (x = {}) => ({ name: PLAYER, ...x });
    let line = fill(pick(L.welcome), V());
    for (let n = 0; n < 10; n++) {
      const k = await this.ui.say(sp, line, ['寄贈する', '化石の鑑定', '図鑑を見る', 'またね']);
      if (k === 0) {
        const fresh = [];
        st.pocket.forEach((id, i) => { if (donatable(id) && !st.donated[id] && !fresh.some(([x]) => x === id)) fresh.push([id, i]); });
        if (!fresh.length) {
          const dup = st.pocket.find((id) => donatable(id));
          line = dup ? fill(pick(L.already), V({ item: ITEMS[dup].name })) : fill(pick(L.notNow), V()); continue;
        }
        const names = fresh.map(([id]) => ITEMS[id].name);
        for (const [, i] of fresh.sort((a, b) => b[1] - a[1])) { const id = st.remove(i); st.donated[id] = dayKey(); }
        this.ui.jingle([523, 659, 784, 1047]);
        const lines = [fill(pick(L.donate), V({ item: names.slice(0, 3).join('、') + (names.length > 3 ? ` ほか${names.length - 3}点` : '') }))];
        const total = FISH.length + BUGS.length + FOSSILS.length, got = Object.keys(st.donated).length;
        lines.push(`これで 展示は ${got} / ${total} 点になったよ。`);
        if (got >= total) lines.push(...L.complete.map((s) => fill(s, V())));
        await this.ui.say(sp, lines); line = 'ほかに なにか あるかね?';
      } else if (k === 1) {
        const n2 = st.pocket.filter((id) => id === 'fossil_unknown').length;
        if (!n2) { line = '鑑定する化石が ないようだね。\n地面のヒビを スコップで ほってごらん。'; continue; }
        const out = [];
        for (let j = 0; j < n2; j++) {
          const i = st.pocket.indexOf('fossil_unknown'); st.pocket.splice(i, 1);
          const pool = FOSSILS.filter((f) => !st.caught[f.id]); const f = pick(pool.length ? pool : FOSSILS);
          st.add(f.id); out.push(f.name);
        }
        this.ui.jingle([523, 784, 1047]);
        await this.ui.say(sp, [`ふむふむ……`, `これは 「${out.join('」と「')}」 だね!`, '寄贈してくれたら、うれしいのう。']); line = 'ほかに なにか あるかね?';
      } else if (k === 2) { await this.ui.book(st); line = 'ほっほう、よく調べておるね。'; }
      else break;
    }
    await this.ui.say(sp, 'またおいで。発見は、まいにち 待っておるよ。');
  }
  async intro() {
    if (this.st.intro || this.introRunning) return;
    this.introRunning = true;
    const sp = { name: 'あらた', color: '#4f8a46', pitch: 1.05 };
    await this.ui.say(sp, ['おーい! キミが 港町に来た なぎ だね! まいど!', 'オイラは あらた。商店街で 「海凪商店」を やってるんだ。', 'この町では 魚をつったり 虫をとったり 化石をほったり……\nのんびり 暮らすのが いちばんさ!', 'はい、これ! 引っこし祝いに つりざお と あみ をあげる!']);
    for (const id of ['rod', 'net']) if (!this.st.has(id)) this.st.add(id);
    this.equip('rod'); this.ui.jingle();
    await this.ui.say(null, ['つりざお と あみ を もらった!']);
    await this.ui.say(sp, ['水ぎわで A ボタンを押すと つりができるよ。\n影が浮きをつついて、グッと しずんだ瞬間に もう一度 A!', 'あみは A ボタンを押しっぱなしで そーっと近づいて、はなすと ふれるよ。', 'とれたものは オイラの店で 買いとるし、\n神社の ほうさくさんに 寄贈もできるよ。', '時間は ほんとうの時計と いっしょ。毎朝5時に 新しい一日が はじまるよ。\nじゃ、よろしくね!']);
    this.st.intro = true; this.st.save(); this.introRunning = false;
  }
  // ---------------------------------------------------------------- input + per frame
  bindUI() {
    const $ = (id) => document.getElementById(id);
    $('ltool').onclick = () => this.cycleTool();
    $('lpocket').onclick = () => this.openPocket();
    $('lbook').onclick = () => { if (!this.ui.busy()) this.ui.book(this.st); };
    const act = $('act');
    act.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.press(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) act.addEventListener(ev, () => this.release());
    addEventListener('keydown', (e) => {
      if (!this.app.playing) return;
      if (this.ui.busy()) {
        if (this.ui.queue) { this.ui.key(e.code); e.preventDefault(); }
        else if (e.code === 'Escape') this.ui.closePanel(-1);
        return;
      }
      if (e.repeat) return;
      if (e.code === 'KeyE' || e.code === 'Enter') this.press();
      else if (e.code === 'Digit1') this.equip(this.st.tool === 'net' ? null : 'net');
      else if (e.code === 'Digit2') this.equip(this.st.tool === 'rod' ? null : 'rod');
      else if (e.code === 'Digit3') this.equip(this.st.tool === 'shovel' ? null : 'shovel');
      else if (e.code === 'Digit0') this.equip(null);
      else if (e.code === 'Tab') { e.preventDefault(); this.cycleTool(); }
      else if (e.code === 'KeyI') this.openPocket();
      else if (e.code === 'KeyB') this.ui.book(this.st);
    });
    addEventListener('keyup', (e) => { if (e.code === 'KeyE' || e.code === 'Enter') this.release(); });
  }
  cycleTool() {
    const have = this.st.tools(); if (!have.length) { this.ui.toast('道具を もっていない'); return; }
    const order = [null, ...have], i = order.indexOf(this.st.tool);
    const nx = order[(i + 1) % order.length]; this.equip(nx);
    this.ui.toast(nx ? `${ITEMS[nx].name}を もった` : '道具を しまった', 1200);
  }
  async openPocket() {
    if (this.ui.busy()) return;
    const i = await this.ui.pocket(this.st, { note: '道具をタップすると 持ちかえ' });
    if (i < 0) return;
    const id = this.st.pocket[i], it = ITEMS[id];
    if (it.kind === 'tool') { this.equip(this.st.tool === id ? null : id); return; }
    const k = await this.ui.list(it.name, [{ label: 'もどる', sub: `お店で ${it.price} ナギ` }, { label: it.kind === 'fish' || it.kind === 'bug' ? 'にがす' : 'すてる', sub: '' }]);
    if (k === 1) { this.st.remove(i); this.ui.toast(`${it.name}を ${it.kind === 'fish' || it.kind === 'bug' ? 'にがした' : 'すてた'}`); }
  }
  // the thing in front of なぎ that A would act on
  target() {
    const pl = this.player, pp = pl.pos, h = pl.heading, fx = Math.sin(h), fz = Math.cos(h);
    const front = (x, z, R) => { const dx = x - pp.x, dz = z - pp.z, d = Math.hypot(dx, dz); return d < R && (d < 0.45 || (dx * fx + dz * fz) / d > 0.35) ? d : 0; };
    if (this.cast) return { kind: 'reel', label: 'ひく' };
    for (const v of this.villagers) if (v.o.visible && front(v.o.position.x, v.o.position.z, 1.7)) return { kind: 'talk', v, label: '話す' };
    for (const p of this.pickups) if (front(p.x, p.z, 1.0)) return { kind: 'take', p, label: 'ひろう' };
    const tool = this.st.tool;
    for (const s of this.spots) if (front(s.x, s.z, 1.2)) return tool === 'shovel' ? { kind: 'dig', s, label: 'ほる' } : { kind: 'look', label: 'しらべる', msg: '何か うまっているみたい。スコップが ほしいな' };
    if (tool !== 'shovel') for (const t of this.trees) if (Math.abs(t.x - pp.x) < 3 && Math.abs(t.z - pp.z) < 3 && front(t.x, t.z, t.rad + (t.fruitTree ? 1.5 : 1.0))) return { kind: 'shake', t, label: 'ゆする' };
    if (tool === 'shovel') { for (const r of this.rocks) if (Math.abs(r.x - pp.x) < r.rad + 2 && Math.abs(r.z - pp.z) < r.rad + 2 && front(r.x, r.z, r.rad + 1.0)) return { kind: 'rock', r, label: 'たたく' }; return { kind: 'shovel', label: 'ほる' }; }
    if (tool === 'rod') return { kind: 'cast', label: 'つる' };
    if (tool === 'net') return { kind: 'net', label: this.ready ? 'ふる' : 'かまえる' };
    return null;
  }
  press() {
    if (!this.app.playing) return;
    if (this.ui.busy()) { if (this.ui.queue) this.ui.key('Enter'); return; }
    const t = this.target(); if (!t) return;
    if (this.anim && t.kind !== 'reel') return;
    if (this.player.state !== 'ground' && t.kind !== 'reel') return;
    switch (t.kind) {
      case 'reel': this.reel(); break;
      case 'talk': this.talk(t.v); break;
      case 'take': this.take(t.p); break;
      case 'dig': this.dig(t.s); break;
      case 'look': this.ui.toast(t.msg); break;
      case 'shake': this.shake(t.t); break;
      case 'rock': this.hitRock(t.r); break;
      case 'shovel': this.anim = { kind: 'dig', t: 0, dur: 0.6 }; this.splash(0.12, 300); setTimeout(() => this.ui.toast('なにも 出てこなかった'), 500); break;
      case 'cast': this.startCast(); break;
      case 'net': this.ready = true; break;
    }
  }
  release() { if (this.ready) { this.ready = false; if (!this.ui.busy()) this.swingNet(); } }
  // before the player moves: freeze during talk / catches, creep while the net is ready, stop fishing when walking off
  preInput(input) {
    const lock = this.ui.busy() || (this.anim && (this.anim.kind === 'show' || this.anim.kind === 'dig' || this.anim.kind === 'shake'));
    if (lock) { input.move.x = input.move.y = 0; input.jump = false; input.webHeld = false; input.run = false; }
    if (this.ready) { input.move.x *= 0.33; input.move.y *= 0.33; input.run = false; input.jump = false; }
    if (this.cast && (Math.hypot(input.move.x, input.move.y) > 0.3 || input.jump)) this.cancelCast();
  }
  pose(dt) {
    const L = this.player.limbs, a = this.anim, tool = this.st.tool;
    if (tool && !a && this.player.state === 'ground') {
      // carry the tool: right paw a little forward; the rod is held up while fishing
      L.arm_r.rotation.x = this.cast ? -1.25 : L.arm_r.rotation.x * 0.4 - 0.5;
      if (this.ready) { L.arm_r.rotation.x = -2.5; L.arm_r.rotation.z = 0.2; }
    }
    if (!a) return;
    a.t += dt; const k = Math.min(1, a.t / a.dur);
    if (a.kind === 'net') { const e = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7; L.arm_r.rotation.set(-2.7 + (1 - e) * 0 + (k < 0.3 ? 0 : (k - 0.3) / 0.7 * 1.9), 0, 0.15); L.body.rotation.x = k > 0.3 ? 0.25 * (1 - k) : 0; }
    else if (a.kind === 'cast') { L.arm_r.rotation.set(k < 0.4 ? -1.2 - k / 0.4 * 1.6 : -2.8 + (k - 0.4) / 0.6 * 1.55, 0, 0.1); }
    else if (a.kind === 'reel') { L.arm_r.rotation.set(-1.25 - Math.sin(k * PI) * 1.4, 0, 0.1); L.body.rotation.x = -0.2 * Math.sin(k * PI); }
    else if (a.kind === 'dig') { const s = Math.sin(k * PI); L.arm_r.rotation.set(-0.4 - s * 1.3, 0, 0.1); L.arm_l.rotation.set(-0.4 - s * 1.2, 0, -0.1); L.body.rotation.x = 0.35 * s; }
    else if (a.kind === 'shake') { const s = Math.sin(a.t * 26) * 0.18; L.arm_r.rotation.set(-2.0 + s, 0, 0.2); L.arm_l.rotation.set(-2.0 - s, 0, -0.2); L.body.rotation.z = s * 0.4; }
    else if (a.kind === 'show') {   // holds the catch up high
      L.arm_r.rotation.set(-2.9, 0, 0.35); L.arm_l.rotation.set(-2.9, 0, -0.35); L.head.rotation.x = -0.25;
      L.tail.rotation.z = Math.sin(a.t * 18) * 0.6;
    }
    if (k >= 1 && a.kind !== 'show') this.anim = null;
  }
  update(dt) {
    this.t += dt;
    const pp = this.player.pos;
    this.refreshDay();
    for (const v of this.villagers) this.updateVillager(v, dt, pp);
    for (const ft of this.fruitTrees) if (ft.shakeT > 0) { ft.shakeT -= dt; ft.o.rotation.z = Math.sin(ft.shakeT * 30) * 0.03 * ft.shakeT; }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1.2;
      if (this.fish.filter((f) => f.state !== 'flee').length < 5) this.spawnFish(pp);
      if (this.bugs.filter((b) => !b.flee).length < 6) this.spawnBug(pp);
    }
    this.updateFish(dt, pp);
    this.updateBugs(dt, pp);
    this.updateCast(dt);
    this.pose(dt);
    for (const p of this.pickups) if (p.money) p.o.rotation.y += dt * 1.5;
    if (!this.st.intro && !this.introStarted && this.app.playing) { this.introStarted = true; setTimeout(() => this.intro(), 1500); }
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.25; this.ui.hud(this.st, this.st.tool);
      const t = this.ui.busy() ? null : this.target(); this.ui.action(t ? t.label : '');
    }
  }
  start() { this.equip(this.st.tool); }
}
