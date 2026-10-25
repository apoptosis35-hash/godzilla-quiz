// Slow island life on top of the port town: animal villagers who wander, chat and remember you, fishing for
// shadows in the sea, catching bugs with a net, digging fossils, shaking fruit trees, the money rock, beach
// combing, the raccoon's shop and the owl's museum. Everything follows the real clock and resets at 5:00.
import * as THREE from 'three';
import { LifeState, ITEMS, dayKey, seeded, donatable, icon } from './state.js';
import { SEA } from './items2.js';
import { ART, isFake, paintingURL } from './art.js';
import { ART_LINES } from './data3.js';
import { Season } from './season.js';
import { Home } from './home.js';
import { Build } from './build.js';
import { Craft } from './craft.js';
import { Social } from './social.js';
import { Market } from './market.js';
import { Garden } from './garden.js';
import { WEATHER_TALK, BIRTHDAY, OWL, BOTTLE_RECIPES } from './data2.js';
import { LifeUI } from './ui.js';
import { PROJECTS, FIRST_RESIDENTS, MUSEUM_DONATIONS } from './progress.js';
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
// the camp on the empty quay before the districts are built: the raccoon's stall, tents for the first residents
const CAMP = { vil_raccoon: [3, 13, 0], vil_owl: [-9, 12.5, 0.3] };
const TENTS = { vil_cat: [-30, 12, 0.4, 0xe8d7a8], vil_bear: [-22, -33, 0.2, 0x8fbf72], vil_frog: [96, 66, 2.6, 0xf0a050], vil_owl: [-12, 9, 0.3, 0xb89060] };
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
    this.news = this.st.finished || [];
    this.owlWas = this.st.owlHere();
    this.ui = new LifeUI(app.sound);
    this.root = new THREE.Group(); this.root.name = 'life'; this.scene.add(this.root);
    this.villagers = []; this.fish = []; this.bugs = []; this.pickups = []; this.spots = []; this.fruitTrees = [];
    this.anim = null; this.cast = null; this.ready = false; this.t = 0; this.spawnT = 0; this.hudT = 0;
    this.collectNature();
    this.build = new Build(this);
    this.buildCamp();
    this.buildVillagers();
    this.build.start();
    this.buildProps();
    this.buildTools();
    this.buildFishing();
    this.day = null; this.refreshDay();
    this.home = new Home(this); this.craft = new Craft(this); this.season = new Season(this);
    this.social = new Social(this); this.market = new Market(this); this.garden = new Garden(this);
    this.mods = [this.home, this.craft, this.season, this.social, this.market, this.garden, this.build];
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
      const name = def.id; if (!this.town.protos[name] || !this.present(name)) continue;
      const home = HOMES[name];
      const fx = name === 'vil_raccoon' ? (this.has('street') ? FIXED[name] : CAMP[name]) : name === 'vil_owl' ? (this.has('shrine') ? FIXED[name] : CAMP[name]) : null;
      let x, z, ry = 0;
      if (fx) { [x, z, ry] = fx; [x, z] = this.near(x, z, (a, b) => this.walkable(a, b) && !this.blockedAt(a, b, 0.9), 6) || [x, z]; }
      else { const h = home[0]; const p = this.near((h[0] + h[1]) / 2, (h[2] + h[3]) / 2, (a, b) => this.walkable(a, b)) || [(h[0] + h[1]) / 2, (h[2] + h[3]) / 2]; [x, z] = p; }
      const o = this.town.clone(name, x, this.ground.height(x, z), z, ry, true); o.scale.setScalar(VS);
      const L = {}; for (const s of ['body', 'head', 'arm_l', 'arm_r', 'leg_l', 'leg_r']) L[s] = o.getObjectByName(`${name}_${s}`);
      const look = def.role === 'shop' ? ['#4f8a46', 1.05] : def.role === 'museum' ? ['#7a5a32', 0.8] : LOOK[def.personality] || ['#e8b23a', 1];
      const v = { def, o, L, home, fixed: !!fx, ry0: ry, target: null, wait: Math.random() * 4, t: Math.random() * 9, r: 0.26, life: true, walkT: 0,
        speaker: { name: def.name, color: look[0], pitch: look[1] }, talking: false, wave: 0, bodyY: L.body ? L.body.position.y : 0 };
      v.door = this.doors?.[name] || null;
      this.villagers.push(v); this.town.npcs.push(v);   // traffic stops for them, the player bumps into them
    }
    // with the houses district built the residents move into houses near their haunts
    if (this.has('houses')) {
      const houses = this.town.mapRects.filter((m) => m.kind === 'house'), used = new Set();
      for (const v of this.villagers) {
        if (v.def.role !== 'resident' || v.door) continue;
        const h = v.home[0], cx = (h[0] + h[1]) / 2, cz = (h[2] + h[3]) / 2;
        let best = null, bd = 1e9; for (const m of houses) { const d = Math.hypot(m.x - cx, m.z - cz); if (d < bd && !used.has(m)) { bd = d; best = m; } }
        if (!best) continue; used.add(best);
        const off = best.d / 2 + 0.9, p = this.near(best.x + Math.sin(best.ry) * off, best.z + Math.cos(best.ry) * off, (a, b) => this.walkable(a, b), 4);
        if (p) v.door = { x: p[0], z: p[1] };
      }
    }
  }
  // a resident moves into the house on their plot: the door, and a patch of ground in front to potter about on
  moveIn(v, b) {
    const d = this.build.door(b); v.door = d;
    v.home = [...(v.home0 ||= v.home), [d.x - 4, d.x + 4, d.z - 1, d.z + 5]];
  }
  has(k) { return !this.app.built || this.app.built.has(k); }
  // who lives here today: the first residents, the ones whose district stands, the owl once sent for
  present(id) {
    if (id === 'vil_raccoon') return true;
    if (id === 'vil_owl') return this.has('shrine') || !this.app.built || this.st.owlHere();
    if (FIRST_RESIDENTS.includes(id) || !this.app.built) return true;
    const p = PROJECTS.find((q) => q.moves === id); return !!p && this.has(p.id);
  }
  // a simple canvas tent (camp, なぎ's first home, the merchant)
  // a canvas ridge tent (camp, なぎ's first home, the merchant): two sloping roof panels on a ridge pole, the front
  // flaps tied back from a dark doorway, a closed back, guy ropes to pegs, a trim band and a little pennant
  tent(x, z, ry, col, scale = 1) {
    const g = new THREE.Group(), y = this.ground.height(x, z), H = 1.55, W = 1.05, L = 1.25;
    const base = new THREE.Color(col), trim = base.clone().offsetHSL(0, 0, -0.18), light = base.clone().offsetHSL(0, -0.05, 0.12);
    const mat = (c, side = THREE.DoubleSide) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side });
    const tri = (pts, m) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); geo.computeVertexNormals(); const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    const quad = (a, b, c, d, m) => tri([a, b, c, a, c, d], m);
    const cloth = mat(base), dark = mat(0x2a2018), flap = mat(light);
    // roof panels with a slight sag along the ridge, and a darker band along the eaves
    for (const s of [-1, 1]) {
      quad([0, H, -L], [0, H, L], [s * W, 0.04, L + 0.06], [s * W, 0.04, -L - 0.06], cloth);
      quad([s * W * 0.86, H * 0.14, -L - 0.05], [s * W * 0.86, H * 0.14, L + 0.05], [s * W * 1.0, 0.04, L + 0.06], [s * W * 1.0, 0.04, -L - 0.06], mat(trim));
    }
    tri([[0, H, -L], [-W, 0.04, -L], [W, 0.04, -L]], cloth);                                        // back wall
    tri([[0, H * 0.96, L - 0.25], [-W * 0.9, 0.02, L - 0.25], [W * 0.9, 0.02, L - 0.25]], dark);    // the shadowy inside
    quad([-W, 0.02, -L], [W, 0.02, -L], [W, 0.02, L - 0.25], [-W, 0.02, L - 0.25], dark);           // groundsheet
    for (const s of [-1, 1]) {   // the front flaps, tied back against the roof
      tri([[0, H, L], [s * W, 0.04, L + 0.06], [s * W * 0.72, 0.05, L + 0.32]], flap);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 5, 8), mat(trim)); tie.position.set(s * W * 0.62, H * 0.42, L + 0.12); g.add(tie);
    }
    const wood = mat(0x7a5634, THREE.FrontSide);
    const pole = (x0, y0, z0, x1, y1, z1, r = 0.028) => { const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 6), wood); m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); m.castShadow = true; g.add(m); return m; };
    pole(0, 0, L + 0.02, 0, H + 0.18, L + 0.02); pole(0, 0, -L - 0.02, 0, H + 0.18, -L - 0.02); pole(0, H + 0.02, -L - 0.12, 0, H + 0.02, L + 0.12, 0.022);
    // guy ropes to pegs, front and back
    const rope = new THREE.LineBasicMaterial({ color: 0xe8dcc0 }), ropes = [];
    for (const zz of [1, -1]) for (const s of [-0.5, 0.5]) { ropes.push(0, H + 0.12, zz * (L + 0.02), s * 1.1, 0.05, zz * (L + 0.95)); pole(s * 1.1, -0.02, zz * (L + 0.95), s * 1.1, 0.14, zz * (L + 0.95), 0.02); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(ropes, 3)); g.add(new THREE.LineSegments(rg, rope));
    // a pennant on the front pole
    tri([[0, H + 0.18, L + 0.02], [0, H + 0.06, L + 0.02], [0.24, H + 0.12, L + 0.02]], mat(0xf4e3b0));
    g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(scale); this.root.add(g);
    return g;
  }
  // a sprite showing a short text or an emoji (bubbles, marks, the gallery)
  textSprite(text, scale = 0.5, width = 0) {
    const emoji = !width, W = emoji ? 128 : width, H = emoji ? 128 : 96, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (!emoji) { g.fillStyle = 'rgba(255,250,235,0.95)'; g.beginPath(); g.roundRect(4, 4, W - 8, H - 26, 30); g.fill(); g.beginPath(); g.moveTo(W / 2 - 12, H - 23); g.lineTo(W / 2, H - 4); g.lineTo(W / 2 + 12, H - 23); g.fill(); }
    g.fillStyle = '#4a3a22'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = emoji ? '88px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' : 'bold 30px "Hiragino Maru Gothic ProN","Hiragino Sans","Noto Sans JP",sans-serif';
    g.fillText(text, W / 2, emoji ? 70 : (H - 22) / 2 + 4, W - 24);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: !emoji, transparent: true })); s.scale.set(scale * W / H, scale, 1); s.renderOrder = 9;
    return s;
  }
  // something washed up on the east beach (star fragments)
  beachPickup(id) {
    const r = Math.random;
    for (let k = 0; k < 80; k++) {
      const x = 64 + r() * 66, z = 40 + r() * 80, s = this.ground.sample(x, z);
      if (s.plat || s.h < 0.05 || s.h > 1.6 || !this.nearWater(x, z, 5)) continue;
      const p = this.addPickup(id, x, z, null); p.o.material && p.o.material.color && p.o.material.color.set(0xffe680); return p;
    }
    return null;
  }
  // camp: the raccoon's stall and simple canvas tents (they go when the houses / the shrine are built)
  buildCamp() {
    if (!this.has('street') && this.town.protos.market_tent) {
      const [x, z] = CAMP.vil_raccoon, o = this.town.clone('market_tent', x, this.ground.height(x, z - 2.2), z - 2.2, PI); this.root.attach(o);
      this.town.colliders.push({ type: 'b', x, z: z - 2.6, hw: 1.9, hd: 0.5, c: 1, s: 0, y0: -50, y1: this.ground.height(x, z) + 2.5 });
    }
    for (const [id, [x0, z0, ry, col]] of Object.entries(TENTS)) {
      if (!this.present(id) || this.build.homeOf(id) || (id === 'vil_owl' ? this.has('shrine') : id !== 'vil_frog' && this.has('houses'))) continue;
      const p = this.near(x0, z0, (a, b) => this.walkable(a, b) && !this.blockedAt(a, b, 1.6), 10); if (!p) continue;
      const y = this.ground.height(p[0], p[1]); this.tent(p[0], p[1], ry, col);
      this.town.colliders.push({ type: 'c', x: p[0], z: p[1], r: 1.2, y0: y - 1, y1: y + 1.9 });
      (this.doors ||= {})[id] = { x: p[0] + Math.sin(ry) * 1.9, z: p[1] + Math.cos(ry) * 1.9 };
    }
  }
  updateVillager(v, dt, pp) {
    v.t += dt;
    const p = v.o.position, d = Math.hypot(pp.x - p.x, pp.z - p.z);
    if (v.visiting) { const want = Math.atan2(pp.x - p.x, pp.z - p.z); v.o.rotation.y += wrapA(want - v.o.rotation.y) * Math.min(1, dt * 4); return; }
    v.o.visible = d < 120 && !v.asleep && !this.home?.inside;
    if (v.asleep) return;
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
    const k = dayKey(); if (this.day === k) return;
    const first = this.day === null; this.day = k;
    this.st.checkDay();
    if (!first) {   // a new morning while playing: finished districts / the owl need the town rebuilt
      const done = this.st.finishOrders(), owl = !this.owlWas && this.st.owlHere();
      if (done.length || owl) { this.app.save(); this.announce(done, owl).then(() => location.reload()); }
      for (const m of this.mods || []) m.newDay?.();
      if (this.news.length) { const n = this.news; this.news = []; this.announce(n, false); }
    }
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
    // fallen branches under trees near the camp (DIY material for the first tools)
    const near = this.trees.filter((t) => Math.hypot(t.x - 0, t.z - 10) < 90 && !t.fruitTree);
    for (let n = 0, k2 = 0; n < 10 && k2 < 80 && near.length; k2++) {
      const t = near[Math.floor(r() * near.length)], a = r() * 6.28, x = t.x + Math.cos(a) * (t.rad + 0.9), z = t.z + Math.sin(a) * (t.rad + 0.9), key = 'branch' + n;
      if (!this.walkable(x, z)) continue;
      n++; if (!this.st.daily.picked[key]) this.addPickup('branch', x, z, key);
    }
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
    for (const t of [...TOOLS, { id: 'axe' }]) {
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
    const wet = this.season?.raining(), ok = list.filter((s) => [].concat(s.where).includes(where) && s.months.includes(m) && inHours(s.hours, h) && (!s.rain || wet) && (!extra || extra(s)));
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
    this.craft.use('rod');
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
    const w = pick(['flower', 'air', 'tree', 'tree', 'ground', 'water', 'beach', 'rock']), sp = this.pickSpecies(BUGS, w, null);
    if (!sp) return;
    let x, y, z, mode = 'sit', base = null;
    const dist = (a) => Math.hypot(a.x - pp.x, a.z - pp.z), ring = (a) => { const d = dist(a); return d > 7 && d < 32; };
    const randLand = (test) => { for (let k = 0; k < 10; k++) { const a = Math.random() * 6.28, r = 8 + Math.random() * 20, px = pp.x + Math.cos(a) * r, pz = pp.z + Math.sin(a) * r; if (test(px, pz)) return [px, pz]; } return null; };
    if (w === 'tree') {
      const ts = this.trees.filter((t) => ring(t) && !t.fruitTree); if (!ts.length) return;
      const t = pick(ts), a = Math.random() * 6.28; x = t.x + Math.sin(a) * 0.32; z = t.z + Math.cos(a) * 0.32; y = this.ground.height(t.x, t.z) + 0.9 + Math.random() * 0.7; base = a; mode = 'trunk';
    } else if (w === 'flower') {
      const fs = this.flowers.filter(ring); if (!fs.length) return;
      const f = pick(fs); x = f.x; z = f.z; y = this.ground.height(x, z) + 0.3; mode = /monshiro|ageha|omurasaki|aosuji/.test(sp.id) ? 'hover' : 'sit';
    } else if (w === 'rock') {
      const rs = this.rocks.filter(ring); if (!rs.length) return;
      const rk = pick(rs); const p = this.near(rk.x, rk.z, (a, b) => this.walkable(a, b) && Math.hypot(a - rk.x, b - rk.z) > 0.6, 4); if (!p) return; [x, z] = p; y = this.ground.height(x, z);
    } else if (w === 'water') {
      const p = randLand((a, b) => this.water(a, b) && this.nearLand(a, b, 3)); if (!p) return; [x, z] = p; y = this.world.swell(x, z) + 0.02;
      mode = sp.id === 'genjibotaru' ? 'hover' : 'skate'; if (mode === 'hover') { const q = this.near(x, z, (a, b) => !this.water(a, b), 4); if (q) [x, z] = q; y = this.ground.height(x, z) + 0.8; }
    } else if (w === 'beach') {
      const p = randLand((a, b) => { const s = this.ground.sample(a, b); return a > 60 && !s.plat && s.h > 0.05 && s.h < 1.6; }); if (!p) return; [x, z] = p; y = this.ground.height(x, z);
    } else if (w === 'air') {
      const p = randLand((a, b) => { const s = this.ground.sample(a, b); return s.h > 0 && !this.blockedAt(a, b, 1); }); if (!p) return; [x, z] = p; y = this.ground.height(x, z) + 0.8 + Math.random() * 1.2; mode = 'fly';
    } else {
      const p = randLand((a, b) => this.soft(a, b, 0.3)); if (!p) return; [x, z] = p; y = this.ground.height(x, z);
    }
    const o = this.bugMesh(sp.id); o.position.set(x, y, z); this.root.add(o);
    if (mode === 'trunk') { o.rotation.set(-PI / 2, base + PI, 0, 'YXZ'); }
    this.bugs.push({ sp, w, o, mode, x, y, z, x0: x, y0: y, z0: z, t: Math.random() * 9, h: Math.random() * 6.28, flee: 0, base });
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
        const step = (Math.sin(b.t * 0.8) > 0.4 && b.w !== 'flower' ? 0.15 : 0) * dt;
        const nx = b.x + Math.sin(b.h) * step, nz = b.z + Math.cos(b.h) * step;
        if (Math.hypot(nx - b.x0, nz - b.z0) < 1.2) { b.x = nx; b.z = nz; }
        b.y = b.mode === 'skate' ? this.world.swell(b.x, b.z) + 0.02 : (b.w === 'flower' ? b.y0 : this.ground.height(b.x, b.z));
        o.position.set(b.x, b.y, b.z); o.rotation.y = b.h; this.flap(o, b.t, 0.05);
      } else {   // on a trunk: cicadas buzz in place, beetles creep up and down
        o.position.set(b.x, b.y0 + Math.sin(b.t * 0.3) * 0.1, b.z);
      }
    }
  }
  flap(o, t, k) { const w = o.userData.wings; if (!w.length) return; const s = o.userData.shape === 'dragon' ? Math.sin(t * 40) * 0.25 * k : Math.sin(t * 14) * 0.9 * k; w[0].rotation.z = -s; w[1].rotation.z = s; }
  swingNet() {
    this.anim = { kind: 'net', t: 0, dur: 0.5 };
    this.craft.use('net');
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
    this.splash(0.18, 300); this.craft.use('shovel');
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
    this.ui.blip(1800, 0.06, 'square', 0.06); this.craft.use('shovel');
    if (!r || r !== rock) { if (rock) this.craft.rock(rock); return; }
    if (this.st.daily.rock >= 7) { this.ui.toast('カツン!'); return; }
    const v = [100, 200, 400, 800, 1600, 3200, 6400][this.st.daily.rock++];
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
    if (u < 0.08) { this.addPickup('money', p[0], p[1], null, 100); this.ui.toast('ナギが おちてきた!'); }
    else if (u < 0.55) { this.addPickup('branch', p[0], p[1], null); this.ui.toast('木の枝が おちてきた'); }
  }
  async take(p) {
    if (ITEMS[p.id]?.kind === 'material') {
      this.st.addMat(p.id); this.ui.blip(990, 0.08, 'triangle', 0.14); this.ui.toast(`${ITEMS[p.id].name}を ひろった`);
      if (p.key) this.st.daily.picked[p.key] = 1;
      this.root.remove(p.o); this.pickups.splice(this.pickups.indexOf(p), 1); this.st.save(); return;
    }
    if (p.money) { this.st.money += p.money; this.ui.blip(1320, 0.1, 'triangle', 0.15); this.ui.toast(`${p.money} ナギ ひろった`); }
    else {
      if (this.st.full()) { this.ui.toast('ポケットが いっぱい!'); return; }
      if (p.id === 'letter') {
        this.st.daily.bottle = true; this.root.remove(p.o); this.pickups.splice(this.pickups.indexOf(p), 1);
        const from = pick(VILLAGERS.filter((v) => v.role === 'resident'));
        const notes = ['海の向こうのだれかへ。きょうも波の音がきこえますか。わたしは元気です。', 'この瓶をひろったキミ、すてきな一日を! 浜辺のさくら貝は、しあわせのしるしだって。', '夕日が沈むとき、海が金色になるのを見たことある? 一度は見てほしいな。', 'みかんの木は、ゆすると実を落としてくれるよ。毎日ためしてみてね。'];
        this.ui.jingle([523, 784]);
        await this.ui.say(null, ['瓶に 手紙が 入っていた。', `「${pick(notes)}」`, `……すみっこに 「${from.name}」と 書いてある。`]);
        const rid = this.craft.newRecipe();
        if (rid) { this.craft.learn(rid); this.ui.jingle(); await this.ui.say(null, [pick(BOTTLE_RECIPES).replace(/\{item\}/g, ITEMS[rid].name), `「${ITEMS[rid].name}」の DIYレシピを おぼえた!`]); return; }
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
    const recent = lc && Date.now() - lc.t < 15 * 60e3, w = this.season.today.w;
    const opts = [[P[this.timeKey()], 3], [P.greet, 2], [SEASON_TALK[this.month()] || [], 1.5]];
    if (recent) opts.push([lc.kind === 'fish' ? P.afterFish : P.afterBug, first ? 4 : 2]);
    if ((st.friend[d.id] || 0) >= 8) opts.push([P.friend, 1.5]);
    if (w === 'rain') opts.push([P.rain || WEATHER_TALK.rain, 3]);
    if (w === 'snow') opts.push([WEATHER_TALK.snow, 3]);
    if (this.season.starNight()) opts.push([WEATHER_TALK.clear_night_stars, 2]);
    const ev = this.season.eventLine(d.catchphrase); if (ev) opts.push([ev, first ? 5 : 2]);
    let sum = 0; for (const [a, w2] of opts) if (a.length) sum += w2;
    let u = Math.random() * sum; let set = opts[0][0];
    for (const [a, w2] of opts) { if (!a.length) continue; u -= w2; if (u <= 0) { set = a; break; } }
    return fill(pick(set), this.vars(d, { item: recent ? ITEMS[lc.id].name : '' }));
  }
  async chat(v) {
    const d = v.def, st = this.st, sp = v.speaker, P = DIALOGUE[d.personality] || DIALOGUE.futsuu;
    if (!st.met[d.id]) { st.met[d.id] = 1; await this.ui.say(sp, d.greeting.split('\n').join('\n')); }
    if (!st.daily.talked[d.id]) { st.daily.talked[d.id] = 1; st.friend[d.id] = (st.friend[d.id] || 0) + 1; }
    await this.social.opening(v);
    let line = this.lineFor(v, true);
    for (let n = 0; n < 8; n++) {
      const req = this.social.hasRequest(v), choices = ['話す', 'プレゼント', ...(req ? ['たのまれた物'] : []), 'またね'];
      const k = choices[await this.ui.say(sp, line, choices)];
      if (k === '話す') { line = this.lineFor(v, false); continue; }
      if (k === 'たのまれた物') { await this.social.deliver(v); line = this.lineFor(v, false); continue; }
      if (k === 'プレゼント') {
        const i = await this.ui.pocket(st, { title: `${d.name}に プレゼント`, filter: (id) => ITEMS[id].kind !== 'tool', note: 'あげるものを えらんでね' });
        if (i < 0) { line = fill(pick(P.greet), this.vars(d)); continue; }
        const id = st.remove(i), it = ITEMS[id], love = it.price >= 500, bday = this.social.birthday(v);
        if (!st.daily.gift[d.id]) { st.daily.gift[d.id] = 1; st.friend[d.id] = (st.friend[d.id] || 0) + (love ? 4 : 2) + (bday ? 5 : 0); }
        this.ui.jingle([659, 784, 988]);
        const lines = bday ? (BIRTHDAY[d.personality] || BIRTHDAY.futsuu).thanks.map((x) => fill(x, this.vars(d, { item: it.name }))) : [fill(pick(love ? P.giftLove : P.gift), this.vars(d, { item: it.name }))];
        if ((st.friend[d.id] || 0) >= 10 && Math.random() < 0.4 && !st.full()) {
          const rid = Math.random() < 0.5 && this.craft.newRecipe();
          if (rid) { this.craft.learn(rid); lines.push(fill(`おかえしに、「${ITEMS[rid].name}」の 作り方を 教えるね、{phrase}`, this.vars(d)), `「${ITEMS[rid].name}」の DIYレシピを おぼえた!`); }
          else { const back = pick(SHELLS); st.add(back.id); lines.push(fill(`おかえしに、これあげる! ${back.name}だよ、{phrase}`, this.vars(d))); }
        }
        await this.ui.say(sp, lines);
        line = this.lineFor(v, false); continue;
      }
      break;
    }
    await this.ui.say(sp, fill(pick(P.bye), this.vars(d)));
  }
  sellValue(id) { const it = ITEMS[id]; return it.kind === 'furniture' || it.kind === 'clothes' ? Math.round(it.price / 4) : it.kind === 'seed' ? 30 : it.price; }
  async shop(v) {
    const st = this.st, sp = v.speaker, L = SHOP_LINES, V = (x = {}) => ({ name: PLAYER, ...x });
    let line = fill(pick(L.welcome), V());
    // five kinds in the encyclopedia: the raccoon sends for a scholar friend, who arrives the next day
    if (!st.owlCalled && Object.keys(st.caught).length >= 5) {
      await this.ui.say(sp, ['おっ、図鑑が ずいぶん にぎやかに なってきたね!', 'そうだ、生きもの好きの 学者の友だちが いるんだ。\nふくろうの ほうさくさん。この町に 呼んでみるよ!', 'あしたには 来てくれると 思うよ。まいど!']);
      st.owlCalled = dayKey(); st.save();
    }
    const again = 'ほかに なにか あるかい?';
    for (let n = 0; n < 14; n++) {
      const k = ['売る', '買う', 'DIY', '町づくり', 'またね'][await this.ui.say(sp, line, ['売る', '買う', 'DIY', '町づくり', 'またね'])];
      if (k === '町づくり') {
        const c = await this.ui.list('町づくり', [{ label: '町の工事を たのむ', sub: '漁港・商店街・電車…(場所は決まっている)' }, { label: 'しせつを たてる', sub: '家の土地・ベンチ・街灯… すきな場所に' }, { label: 'なぎの 家', sub: this.st.ext.home.stage >= 1 ? 'できている' : '' }]);
        line = c === 0 ? await this.townWork(sp) : c === 1 ? await this.build.menu(sp) : c === 2 ? await this.home.houseMenu(sp) : again; continue;
      }
      if (k === 'DIY') { await this.ui.say(sp, this.craft.hint()); await this.craft.menu(); line = again; continue; }
      if (k === '買う') {
        const c = await this.ui.list('買う', [{ label: '品物を 買う', sub: '道具・今日の品・たね' }, { label: 'だいこん', sub: '日曜の朝に 売っているよ' }]);
        line = c === 0 ? await this.market.menu(sp) : c === 1 ? await this.market.daikon(sp) : again; continue;
      }
      if (k === '売る') {
        const dk = st.ext.daikon;
        const c = await this.ui.list('売る', [{ label: 'ひとつずつ 売る' }, { label: 'まとめて 売る', sub: '魚・虫・貝・果物・海の幸' }, ...(dk.n ? [{ label: 'だいこんを 売る', sub: `${dk.n}本` }] : [])]);
        if (c === 0) {
          const i = await this.ui.pocket(st, { title: '売る', filter: (id) => !['tool', 'recipe', 'kit'].includes(ITEMS[id].kind), note: '売るものを えらんでね' });
          if (i < 0) { line = again; continue; }
          const it = ITEMS[st.pocket[i]], price = this.sellValue(st.pocket[i]);
          const ok = await this.ui.say(sp, fill(pick(L.buyPrompt), V({ item: it.name, price: price.toLocaleString() })), ['売る', 'やめる']);
          if (ok === 0) { st.remove(i); st.money += price; st.stats.sold++; this.ui.blip(1320, 0.1, 'triangle', 0.15); line = fill(pick(L.sold), V()); } else line = again;
        } else if (c === 1) {
          const idx = st.pocket.map((id, i) => [id, i]).filter(([id]) => ['fish', 'bug', 'shell', 'fruit', 'sea'].includes(ITEMS[id].kind));
          if (!idx.length) { line = fill(pick(L.nothingToSell), V()); continue; }
          const sum = idx.reduce((a, [id]) => a + ITEMS[id].price, 0);
          const ok = await this.ui.say(sp, `魚・虫・貝・果物・海の幸 ぜんぶで ${idx.length}こ……\f${sum.toLocaleString()} ナギで どうだい?`, ['売る', 'やめる']);
          if (ok === 0) { for (const [, i] of idx.reverse()) st.remove(i); st.money += sum; st.stats.sold += idx.length; this.ui.jingle([880, 1175, 1568]); line = fill(pick(L.sold), V()); } else line = again;
        } else if (c === 2) line = await this.market.daikon(sp);
        else line = again;
        continue;
      }
      break;
    }
    await this.ui.say(sp, fill(pick(L.thanks), V()));
  }
  // 町づくり: order a district; it is built overnight (js/life/progress.js)
  async townWork(sp) {
    const st = this.st, ok = (q) => !q.auto && (!q.needs || this.has(q.needs));
    const price = (q) => (q.mats ? this.craft.matText(q.mats) : `${q.cost.toLocaleString()} ナギ`);
    const rows = PROJECTS.map((q) => {
      const done = this.has(q.id), ordered = !!st.town.orders[q.id];
      const sub = done ? 'できている' : ordered ? 'あした完成' : q.auto ? `資料館に ${MUSEUM_DONATIONS}点 寄贈すると` : !ok(q) ? '道路ができてから' : price(q);
      return { label: q.name, sub, ok: !done && !ordered && ok(q) };
    });
    if (!rows.some((r) => r.ok)) return 'いまは たのめる工事が ないみたい。\nまた こんど 相談してね!';
    const i = await this.ui.list('町づくり', rows);
    if (i < 0) return 'ほかに なにか あるかい?';
    const q = PROJECTS[i];
    const c = await this.ui.say(sp, [`「${q.name}」だね! ${q.desc}。`, q.mats ? `ざいりょうを あつめてくれたら 作れるよ。\n${price(q)} で たのむかい?` : `${price(q)}で たのむかい?`], ['たのむ', 'やめる']);
    if (c !== 0) return 'ほかに なにか あるかい?';
    if (q.mats) {
      if (!st.hasMats(q.mats)) return `ざいりょうが まだ たりないみたいだね。\n木材は おので、石と鉄は スコップで 岩を たたいて あつめてね!`;
      st.useMats(q.mats);
    } else {
      if (st.money < q.cost) return `おや、${(q.cost - st.money).toLocaleString()} ナギ たりないみたいだね。\n魚や虫を 売って ためておいで!`;
      st.money -= q.cost;
    }
    st.town.orders[q.id] = dayKey(); st.save(); this.ui.jingle([523, 659, 784, 1047]);
    return `まいど! 「${q.name}」は 今夜のうちに つくっておくよ。\nあしたの朝 5時すぎには できあがってるからね!`;
  }

  // what changed overnight: finished districts, who moved in, the owl's arrival
  async announce(list, owl) {
    const sp = { name: 'あらた', color: '#4f8a46', pitch: 1.05 }, lines = [];
    for (const id of list) {
      const q = PROJECTS.find((p) => p.id === id); if (!q) continue;
      lines.push(`おはよう! たのまれてた 「${q.name}」が できあがったよ!`);
      const v = q.moves && VILLAGERS.find((x) => x.id === q.moves);
      if (v) lines.push(`それから ${v.species}の ${v.name}が この町に 引っこしてきたよ。あいさつしておいで!`);
      if (id === 'shrine') lines.push('ほうさくさんの 資料館も 神社に うつったよ。');
      if (id === 'street') lines.push('オイラの 海凪商店も 商店街に うつったよ。');
    }
    if (list.includes('__house')) lines.push('おはよう! キミの 家が できあがったよ!', '中は ひろくなったから、家具を たくさん おけるよ。まいど!');
    if (list.includes('__stars')) lines.push(...this.season.starNews());
    if (owl) lines.push('学者の ほうさくさんが 来てくれたよ! オイラの テントの となりに いるからね。', '魚や虫や化石を 寄贈すると、資料館に 展示してくれるよ。');
    if (lines.length) await this.ui.say(sp, lines);
  }
  async museum(v) {
    const st = this.st, sp = v.speaker, L = MUSEUM_LINES, V = (x = {}) => ({ name: PLAYER, ...x });
    let line = fill(pick(L.welcome), V());
    for (let n = 0; n < 10; n++) {
      const k = await this.ui.say(sp, line, ['寄贈する', '化石の鑑定', '展示室を見る', '図鑑を見る', 'またね']);
      if (k === 2) { await this.ui.say(sp, pick(OWL.gallery_intro)); this.home.enter('gallery'); return; }
      if (k === 0) {
        const fakes = st.pocket.filter((id) => isFake(id));
        if (fakes.length) {   // the owl only takes genuine paintings
          await this.ui.say(sp, [`「${ITEMS[fakes[0]].name}」……ふむ。`, fill(pick(ART_LINES.owl_fake), V({ what: '色が ちがうし、左右が あべこべ', item: ITEMS[fakes[0]].name }))]);
        }
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
        const art = fresh.find(([id]) => ITEMS[id].kind === 'art'); if (art) lines.push(fill(pick(ART_LINES.owl_real), V({ item: ITEMS[art[0]].name })));
        const total = FISH.length + BUGS.length + FOSSILS.length + SEA.length + ART.length, got = Object.keys(st.donated).length;
        lines.push(`これで 展示は ${got} / ${total} 点になったよ。`);
        if (got >= total) lines.push(...L.complete.map((s) => fill(s, V())));
        if (!this.has('shrine') && !st.town.orders.shrine && got >= MUSEUM_DONATIONS) {
          st.town.orders.shrine = dayKey();
          lines.push(`${got}点も あつまったね! これだけあれば りっぱな 資料館が できるよ。`, '神社の となりに 建ててもらうことにしよう。\nあしたの朝には できあがっておるよ、ほうほう。');
        } else if (!this.has('shrine') && !st.town.orders.shrine) lines.push(`あと ${MUSEUM_DONATIONS - got}点 あつまったら、資料館の 建物を たてようね。`);
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
      } else if (k === 3) { await this.ui.book(st); line = 'ほっほう、よく調べておるね。'; }
      else break;
    }
    await this.ui.say(sp, 'またおいで。発見は、まいにち 待っておるよ。');
  }
  async intro() {
    if (this.st.intro || this.introRunning) return;
    this.introRunning = true;
    const sp = { name: 'あらた', color: '#4f8a46', pitch: 1.05 };
    await this.ui.say(sp, ['おーい! キミが 港町に来た なぎ だね! まいど!', 'オイラは あらた。この テントで 「海凪商店」を やってるんだ。', 'ここは まだ なんにもない 入り江なんだ。\nいま住んでるのは ツムギと おもちと オイラだけ。', 'でも 海も 山も きれいだろ? みんなで すこしずつ 町を つくっていこう!', 'まずは 道具づくりから だね。\nつりざお・あみ・おのの 作り方を 教えるよ!']);
    this.ui.jingle();
    await this.ui.say(null, ['つりざお・あみ・おの・たき火の DIYレシピを おぼえた!']);
    await this.ui.say(sp, ['木の下に 落ちている 木の枝を 5本 ひろって、\nオイラの 屋台で 「DIY」を えらんでね。', 'できたての 道具は ちょっと もろいから、\nこわれたら また 作るか、ナギを ためて 店で 買ってね。']);
    this.giveTent();
    await this.ui.say(sp, ['それから、東の 岸壁に キミの テントを はっておいたよ。\n中に 家具を おいて、すきに かざってね。', '道具は 使うと だんだん こわれるんだ。\n木の枝や 木材を あつめて、オイラの 屋台で DIYできるよ。']);
    await this.ui.say(sp, ['つりざおを 持って 水ぎわで A。影が 浮きを つついて、\nグッと しずんだ瞬間に もう一度 A!', 'あみは A ボタンを押しっぱなしで そーっと近づいて、はなすと ふれるよ。', 'とれたものは オイラが 買いとるよ。\n生きものを 5種類 見つけたら、オイラに 教えてね。いいこと あるかも!', 'ナギが たまったら 「町づくり」で 港や 家を たのんでね。\n工事は ひと晩で おわるよ!', '時間は ほんとうの時計と いっしょ。毎朝5時に 新しい一日が はじまるよ。\nじゃ、よろしくね!']);
    this.st.intro = true; this.st.save(); this.introRunning = false;
  }
  giveTent() { const h = this.st.ext.home; if (h.stage < 0) { h.stage = 0; this.st.save(); this.home.buildHouse(); } }
  // ---------------------------------------------------------------- input + per frame
  bindUI() {
    const $ = (id) => document.getElementById(id);
    $('ltool').onclick = () => this.cycleTool();
    $('lpocket').onclick = () => this.openPocket();
    $('lbook').onclick = () => { if (!this.ui.busy()) this.ui.book(this.st); };
    $('lhat').onclick = () => this.home.takeOffHat();
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
    const mats = Object.entries(this.st.mat).filter(([, n]) => n > 0).map(([k, n]) => `${ITEMS[k].name}×${n}`).join(' ');
    const wear = this.st.ext.wear, dk = this.st.ext.daikon.n;
    const i = await this.ui.pocket(this.st, { note: `ざいりょう: ${mats || 'なし'}${dk ? `　だいこん×${dk}` : ''}${wear.hat ? '　(👒ボタンで ぼうしを 外せるよ)' : ''}` });
    if (i < 0) return;
    const id = this.st.pocket[i], it = ITEMS[id];
    if (it.kind === 'tool') { this.equip(this.st.tool === id ? null : id); return; }
    const live = it.kind === 'fish' || it.kind === 'bug' || it.kind === 'sea';
    const rows = [
      ...(it.kind === 'furniture' || it.kind === 'art' ? [['置く', () => this.home.place(i)]] : []),
      ...(it.kind === 'kit' ? [['建てる', () => this.build.place(i)]] : []),
      ...(it.kind === 'art' ? [['見る', () => this.ui.picture(it.name, paintingURL(id))]] : []),
      ...(it.kind === 'seed' || id === 'mikan' ? [['植える', () => this.garden.plant(i)]] : []),
      ...(it.kind === 'clothes' ? [['身につける', () => this.home.wearItem(i)]] : []),
      [live ? 'にがす' : 'すてる', () => { this.st.remove(i); this.ui.toast(`${it.name}を ${live ? 'にがした' : 'すてた'}`); }],
      ['もどる', null],
    ];
    const k = await this.ui.list(`${it.name}　(お店で ${this.sellValue(id)} ナギ)`, rows.map(([label]) => ({ label })));
    if (k >= 0 && rows[k][1]) rows[k][1]();
  }
  // the thing in front of なぎ that A would act on
  target() {
    const pl = this.player, pp = pl.pos, h = pl.heading, fx = Math.sin(h), fz = Math.cos(h);
    const front = (x, z, R) => { const dx = x - pp.x, dz = z - pp.z, d = Math.hypot(dx, dz); return d < R && (d < 0.45 || (dx * fx + dz * fz) / d > 0.35) ? d : 0; };
    if (this.cast) return { kind: 'reel', label: 'ひく' };
    if (this.home.inside) {
      const g = this.home.guest?.v; if (g && front(g.o.position.x, g.o.position.z, 1.7)) return { kind: 'talk', v: g, label: '話す' };
      return this.home.target(front);
    }
    for (const v of this.villagers) if (v.o.visible && front(v.o.position.x, v.o.position.z, 1.7)) return { kind: 'talk', v, label: '話す' };
    for (const m of [this.season, this.home, this.market, this.garden, this.build]) { const t = m.target(front); if (t) return t; }
    for (const p of this.pickups) if (front(p.x, p.z, 1.0)) return { kind: 'take', p, label: 'ひろう' };
    const tool = this.st.tool;
    if (tool === 'axe') for (const t of this.trees) if (Math.abs(t.x - pp.x) < 3 && Math.abs(t.z - pp.z) < 3 && front(t.x, t.z, t.rad + 1.0)) return { label: 'きる', run: () => this.craft.chop(t) };
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
    if (t.run) { t.run(); return; }
    switch (t.kind) {
      case 'reel': this.reel(); break;
      case 'talk': this.talk(t.v); break;
      case 'take': this.take(t.p); break;
      case 'dig': this.dig(t.s); break;
      case 'look': this.ui.toast(t.msg); break;
      case 'shake': this.shake(t.t); break;
      case 'rock': this.hitRock(t.r); break;
      case 'shovel': this.anim = { kind: 'dig', t: 0, dur: 0.6 }; this.splash(0.12, 300); this.craft.use('shovel'); setTimeout(() => this.ui.toast('なにも 出てこなかった'), 500); break;
      case 'cast': this.startCast(); break;
      case 'net': this.ready = true; break;
    }
  }
  release() { if (this.ready) { this.ready = false; if (!this.ui.busy()) this.swingNet(); } }
  // before the player moves: freeze during talk / catches, creep while the net is ready, stop fishing when walking off
  preInput(input) {
    const lock = this.ui.busy() || (this.anim && (this.anim.kind === 'show' || this.anim.kind === 'dig' || this.anim.kind === 'shake'));
    if (lock) { input.move.x = input.move.y = 0; input.run = false; }
    if (this.ready) { input.move.x *= 0.33; input.move.y *= 0.33; input.run = false; }
    if (this.cast && Math.hypot(input.move.x, input.move.y) > 0.3) this.cancelCast();
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
    for (const m of this.mods) m.update?.(dt, this.app.camera.position);
    for (const ft of this.fruitTrees) if (ft.shakeT > 0) { ft.shakeT -= dt; ft.o.rotation.z = Math.sin(ft.shakeT * 30) * 0.03 * ft.shakeT; }
    this.spawnT -= dt;
    if (this.spawnT <= 0 && !this.home.inside) {
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
      this.hudT = 0.25; this.ui.hud(this.st, this.st.tool, this.season.today.w);
      const t = this.ui.busy() ? null : this.target(); this.ui.action(t ? t.label : '');
    }
  }
  afterWorld() { this.season?.overcast(); }
  start() {
    this.equip(this.st.tool);
    if (this.st.intro && this.st.ext.home.stage < 0) { this.giveTent(); setTimeout(() => this.ui.say({ name: 'あらた', color: '#4f8a46', pitch: 1.05 }, ['あ、なぎ! 東の 岸壁に キミの テントを はっておいたよ。', '家具を おいたり、DIYしたり、くらしが もっと 楽しくなるよ。まいど!']), 1500); }
    const owlNew = this.st.owlHere() && !this.st.met.owlArrived;
    if (this.st.intro && (this.news.length || owlNew)) {
      if (owlNew) this.st.met.owlArrived = 1;
      const news = this.news; this.news = [];
      setTimeout(() => this.announce(news, owlNew), 1200);
    }
  }
}
