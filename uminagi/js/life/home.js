// Home life: ぽっけ's tent on the east quay that becomes a house (ordered from the raccoon, built overnight), the
// room inside it, furniture placed and turned anywhere indoors or out, the mailbox and its letters, clothes
// (bandana colour and a hat), visiting a villager's home and the owl's exhibition room.
// Interiors are a stage high above the lighthouse hill: entering hides the outside world and shows the room.
import * as THREE from 'three';
import { ITEMS, dayKey, icon } from './state.js';
import { FURNITURE, CLOTHES } from './items2.js';
import { VILLAGERS, FISH, BUGS, FOSSILS } from './data.js';
import { SEA } from './items2.js';
import { RACCOON, OWL, LETTERS } from './data2.js';
import { ART, hangPainting } from './art.js';

const PI = Math.PI;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const STAGE = { x: -122, z: -40, y: 140 };          // where interiors are drawn
const PLOT = { x: 49, z: 11, ry: 0 };               // ぽっけ's home on the east quay (front faces the sea, +z)
// the house grows like in the slow-life games: a loan per step (no interest, paid back at the raccoon's whenever),
// the next step only once the last loan is paid. Each step changes the outside and adds space inside.
export const HOUSE = [
  { name: 'テント' },
  { name: '家', cost: 98000, model: 'house_hira', s: 0.8 },
  { name: '広い家', cost: 198000, model: 'house_hira', s: 0.95, big: true },
  { name: 'うしろの部屋', cost: 348000, model: 'house_standard', s: 0.9, big: true },
  { name: '左の部屋', cost: 548000, model: 'house_standard', s: 1.0, big: true },
  { name: '右の部屋', cost: 758000, model: 'house_twostory', s: 0.85, big: true },
  { name: '2階', cost: 1248000, model: 'house_twostory', s: 0.95, big: true },
  { name: '地下室', cost: 2498000, model: 'house_twostory', s: 1.0, big: true },
];
// extra rooms: where their door is in the main room (local x, z as a fraction of the half size), the stage that adds it
const ROOMS = [null, { name: 'うしろの部屋', at: [0, -1], stage: 3 }, { name: '左の部屋', at: [-1, 0], stage: 4 }, { name: '右の部屋', at: [1, 0], stage: 5 },
  { name: '2階', at: [-0.7, -0.85], stage: 6, up: true }, { name: '地下室', at: [0.7, -0.85], stage: 7, down: true }];
// what each villager has at home (furniture ids, room-local x, z, ry)
const VILLA = {
  kiza: [['furn_bed', -1.8, -1.8, 0], ['furn_lamp', -0.4, -2.4, 0], ['furn_rug', 0.6, 0.4, 0], ['furn_aquarium', 2, -2.4, 0], ['furn_chair_wood', 1.4, 0.9, PI]],
  genki: [['furn_bed', 1.8, -1.8, 0], ['furn_radio', -2.2, -2.4, 0], ['furn_table_wood', -0.6, 0, 0], ['furn_chair_wood', -1.4, 0.4, PI / 2], ['furn_rug', 0.4, 0.8, 0]],
  nonbiri: [['furn_kotatsu', 0, 0, 0], ['furn_bed', -1.8, -1.8, 0], ['furn_bookshelf', 1.6, -2.6, 0], ['furn_rug', 0, 0, 0], ['furn_lamp', 2.3, -1, 0]],
  futsuu: [['furn_table_wood', 0.6, -0.6, 0], ['furn_chair_wood', 0.6, 0.3, PI], ['furn_bookshelf', -1.6, -2.6, 0], ['furn_bed', 1.9, -1.8, 0], ['plant_pots', -2.4, 0.4, PI / 2]],
  kowai: [['furn_tansu', -1.6, -2.5, 0], ['furn_kotatsu', 0.5, -0.4, 0], ['furn_radio', 2, -2.5, 0], ['furn_bed', -1.9, 0, PI / 2], ['furn_lamp', 2.4, 0.6, 0]],
  otona: [['furn_bookshelf', -1.4, -2.6, 0], ['furn_bookshelf', 0, -2.6, 0], ['furn_table_wood', 1.4, -0.4, 0], ['furn_chair_wood', 1.4, 0.4, PI], ['furn_lamp', -2.4, -0.4, 0], ['furn_rug', 0, 0.5, 0]],
};

export class Home {
  constructor(life) {
    this.life = life; this.town = life.town; this.player = life.player; this.scene = life.scene; this.st = life.st;
    const e = this.st.ext;
    e.home ||= { stage: -1 };                 // -1 nothing yet, 0 tent, 1 house
    e.furn ||= [];                            // { id, x, z, ry, in } (in: room-local, else world)
    e.mail ||= [];                            // { from, text, gift }
    e.wear ||= { bandana: 'bandana_navy', hat: null };
    this.inside = null; this.objs = []; this.outside = []; this.roomObjs = [];
    this.room = new THREE.Group(); this.room.name = 'room'; this.room.visible = false; this.scene.add(this.room);
    this.light = new THREE.PointLight(0xffd9a8, 0, 14, 1.2); this.light.position.set(STAGE.x, STAGE.y + 2.4, STAGE.z); this.scene.add(this.light);
    this.newDay(true);
    this.buildHouse();
    this.buildOutdoorFurniture();
    this.wear();
  }
  // ---------------------------------------------------------------- the house outside
  buildHouse() {
    for (const o of this.houseObjs || []) this.life.root.remove(o);
    this.houseObjs = [];
    for (const c of this.houseCols || []) { const i = this.town.colliders.indexOf(c); if (i >= 0) this.town.colliders.splice(i, 1); }
    this.houseCols = [];
    const h = this.st.ext.home, y = this.life.ground.height(PLOT.x, PLOT.z);
    if (h.stage < 0) return;
    const H = HOUSE[Math.min(h.stage, HOUSE.length - 1)];
    if (h.stage >= 1 && this.town.protos[H.model]) {
      const o = this.town.clone(H.model, PLOT.x, y, PLOT.z, PLOT.ry, false); this.life.root.attach(o); o.scale.setScalar(H.s); this.houseObjs.push(o);
      const b = this.town.protos[H.model].box, hw = (b.max.x - b.min.x) / 2 * H.s * 0.92, hd = (b.max.z - b.min.z) / 2 * H.s * 0.92, cz = (b.max.z + b.min.z) / 2 * H.s;
      this.houseCols.push({ type: 'b', x: PLOT.x, z: PLOT.z + cz, hw, hd, c: 1, s: 0, y0: y - 1, y1: y + 6 });
      this.door = { x: PLOT.x, z: PLOT.z + b.max.z * H.s + 0.5 };
    } else {
      const o = this.life.tent(PLOT.x, PLOT.z, 0, 0xe88a3a, 1.25); this.houseObjs.push(o);
      this.houseCols.push({ type: 'c', x: PLOT.x, z: PLOT.z, r: 1.5, y0: y - 1, y1: y + 2.4 });
      this.door = { x: PLOT.x, z: PLOT.z + 1.9 };
    }
    // the mailbox by the door
    const mx = PLOT.x + (h.stage >= 1 ? 3.6 : 2.8), mz = (this.door.z || PLOT.z) + 0.3;
    const mb = this.town.protos.furn_mailbox ? this.town.clone('furn_mailbox', mx, this.life.ground.height(mx, mz), mz, 0, true) : this.town.clone('postbox', mx, this.life.ground.height(mx, mz), mz, 0, true);
    this.life.root.attach(mb); this.houseObjs.push(mb); this.mailbox = { x: mx, z: mz, o: mb };
    this.flag = this.life.textSprite('✉', 0.55); this.flag.position.set(mx, this.life.ground.height(mx, mz) + 1.5, mz); this.life.root.add(this.flag); this.houseObjs.push(this.flag);
    this.houseCols.push({ type: 'c', x: mx, z: mz, r: 0.25, y0: y - 1, y1: y + 1 });
    this.town.colliders.push(...this.houseCols);
  }
  // ---------------------------------------------------------------- furniture objects
  furnObject(id) {
    const it = ITEMS[id], name = it.model || id;
    if (it.trophy) return this.life.goals.trophyObject(it.trophy);
    if (it.photo && this.town.protos[name]) { const o = this.town.clone(name, 0, 0, 0, 0, false); o.parent.remove(o); const tex = this.life.goals.photoTexture(it.photo); o.traverse((m) => { if (m.isMesh && m.material?.name === 'home_canvas') m.material = new THREE.MeshStandardMaterial({ name: 'home_canvas', map: tex, roughness: 0.85 }); }); return o; }
    if (it.kind === 'art' && this.town.protos[name]) { const o = this.town.clone(name, 0, 0, 0, 0, false); o.parent.remove(o); return hangPainting(o, id); }   // painting on the easel
    if (this.town.protos[name]) { const o = this.town.clone(name, 0, 0, 0, 0, true); o.parent.remove(o); return o; }
    // stand-in until the model exists: a soft coloured block of the right footprint
    const m = new THREE.Mesh(new THREE.BoxGeometry(it.w || 0.6, it.flat ? 0.03 : 0.6, it.d || 0.6), new THREE.MeshStandardMaterial({ color: 0xc8a070, roughness: 0.8 }));
    m.position.y = it.flat ? 0.015 : 0.3; const g = new THREE.Group(); g.add(m); return g;
  }
  makeFurn(f, parent, base) {
    const it = ITEMS[f.id], o = this.furnObject(f.id);
    o.position.set(base.x + f.x, base.y(f.x, f.z), base.z + f.z); o.rotation.y = f.ry; parent.add(o);
    let col = null;
    if (!it.flat) { col = { type: 'b', x: o.position.x, z: o.position.z, hw: (it.w || 0.6) / 2, hd: (it.d || 0.6) / 2, c: Math.cos(f.ry), s: Math.sin(f.ry), y0: o.position.y - 1, y1: o.position.y + 0.9 }; this.town.colliders.push(col); }
    let light = null;
    if (it.light) { light = new THREE.PointLight(0xffc27a, 0, 6, 1.6); light.position.set(o.position.x, o.position.y + 1.1, o.position.z); parent.add(light); }
    return { f, o, col, light };
  }
  dropFurn(list, rec) {
    rec.o.parent?.remove(rec.o); if (rec.light) rec.light.parent?.remove(rec.light);
    if (rec.col) { const i = this.town.colliders.indexOf(rec.col); if (i >= 0) this.town.colliders.splice(i, 1); }
    list.splice(list.indexOf(rec), 1);
  }
  buildOutdoorFurniture() {
    for (const r of [...this.outside]) this.dropFurn(this.outside, r);
    const base = { x: 0, z: 0, y: (x, z) => this.life.ground.height(x, z) };
    for (const f of this.st.ext.furn) if (!f.in) this.outside.push(this.makeFurn(f, this.life.root, base));
  }
  // ---------------------------------------------------------------- interiors
  shell(scale) {
    const g = new THREE.Group(), Y = STAGE.y, S = 3 * scale;
    if (this.town.protos.room_shell) { const o = this.town.clone('room_shell', 0, 0, 0, 0, true); o.parent.remove(o); o.position.set(STAGE.x, Y, STAGE.z); o.scale.setScalar(scale); g.add(o); }
    else {
      const wood = new THREE.MeshStandardMaterial({ color: 0xb98a5a, roughness: 0.8 }), wall = new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: 0.95 });
      const box = (m, x, y, z, sx, sy, sz) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(STAGE.x + x, Y + y, STAGE.z + z); b.receiveShadow = true; g.add(b); };
      box(wood, 0, -0.05, 0, S * 2, 0.1, S * 2); box(wall, 0, 1.3, -S - 0.05, S * 2 + 0.2, 2.6, 0.1); box(wall, -S - 0.05, 1.3, 0, 0.1, 2.6, S * 2); box(wall, S + 0.05, 1.3, 0, 0.1, 2.6, S * 2);
    }
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshStandardMaterial({ color: 0x7a4a3a, roughness: 1 }));
    mat.rotation.x = -PI / 2; mat.position.set(STAGE.x, Y + 0.01, STAGE.z + S - 0.4); g.add(mat);
    // colliders: floor, three walls, the front with a door gap
    const c = (x, z, hw, hd, y0, y1) => ({ type: 'b', x: STAGE.x + x, z: STAGE.z + z, hw, hd, c: 1, s: 0, y0: Y + y0, y1: Y + y1 });
    this.roomCols = [c(0, 0, S + 0.5, S + 0.5, -1, 0), c(0, -S - 0.1, S + 0.3, 0.12, -1, 3), c(-S - 0.1, 0, 0.12, S + 0.3, -1, 3), c(S + 0.1, 0, 0.12, S + 0.3, -1, 3),
      c(-S / 2 - 0.5, S + 0.15, S / 2 - 0.4, 0.12, -1, 3), c(S / 2 + 0.5, S + 0.15, S / 2 - 0.4, 0.12, -1, 3)];
    this.town.colliders.push(...this.roomCols);
    this.S = S;
    return g;
  }
  // enter: { kind: 'home' | 'visit' | 'gallery', v?: villager }
  roomScale(kind, idx = 0) {
    const st = this.st.ext.home.stage;
    if (kind === 'gallery') return 1;
    if (kind !== 'home') return 0.75;
    return idx > 0 ? 0.75 : st < 1 ? 0.55 : HOUSE[Math.min(st, 7)].big ? 1 : 0.75;   // tent / house / bigger house
  }
  // the room's furniture and doors (home: room idx 0 is the main room)
  fillRoom(kind, v, idx) {
    for (const r of [...this.roomObjs]) this.dropFurn(this.roomObjs, r);
    for (const c of this.roomCols || []) { const i = this.town.colliders.indexOf(c); if (i >= 0) this.town.colliders.splice(i, 1); }
    const scale = this.roomScale(kind, idx);
    this.room.clear(); this.roomObjs = []; this.roomIdx = idx; this.doors = [];
    this.room.add(this.shell(scale));
    const base = { x: STAGE.x, z: STAGE.z, y: () => STAGE.y };
    if (kind === 'home') {
      for (const f of this.st.ext.furn) if (f.in && (f.room || 0) === idx) this.roomObjs.push(this.makeFurn(f, this.room, base));
      if (idx === 0) ROOMS.forEach((R, i) => {   // doors to the extra rooms the house has grown
        if (!R || this.st.ext.home.stage < R.stage) return;
        const x = R.at[0] * (this.S - 0.45), z = R.at[1] * (this.S - 0.45);
        const mat = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ color: R.up ? 0x6a8a5a : R.down ? 0x5a5a7a : 0x8a5a3a, roughness: 1 }));
        mat.rotation.x = -PI / 2; mat.position.set(STAGE.x + x, STAGE.y + 0.012, STAGE.z + z); this.room.add(mat);
        const sign = this.life.textSprite(R.up ? '⬆ 2階' : R.down ? '⬇ 地下' : `🚪 ${R.name}`, 0.42, 300); sign.position.set(STAGE.x + x, STAGE.y + 1.25, STAGE.z + z); this.room.add(sign);
        this.doors.push({ i, x: STAGE.x + x, z: STAGE.z + z, name: R.name });
      });
    }
    return scale;
  }
  switchRoom(idx, from) {
    const pl = this.player;
    this.fillRoom('home', null, idx);
    const d = idx === 0 && from ? this.doors.find((x) => x.i === from) : null;
    if (d) { pl.place(d.x + (STAGE.x - d.x) * 0.25, d.z + (STAGE.z - d.z) * 0.25, 0); } else pl.place(STAGE.x, STAGE.z + this.S - 1.1, 0);
    pl.pos.y = STAGE.y; pl.heading = PI; pl.dist = 3 + 4 * this.roomScale('home', idx); pl.snapCam = true;
    this.life.ui.blip(520, 0.12, 'triangle', 0.12);
    if (idx) this.life.ui.toast(ROOMS[idx].name, 1400);
  }
  enter(kind, v) {
    if (this.inside) return;
    const pl = this.player;
    this.back = { x: pl.pos.x, z: pl.pos.z, heading: pl.heading, yaw: pl.yaw, pitch: pl.pitch, dist: pl.dist };
    const scale = this.fillRoom(kind, v, 0);
    const base = { x: STAGE.x, z: STAGE.z, y: () => STAGE.y };
    if (kind === 'visit') {
      for (const [id, x, z, ry] of VILLA[v.def.personality] || VILLA.futsuu) if (ITEMS[id]) this.roomObjs.push(this.makeFurn({ id, x: x * scale, z: z * scale, ry }, this.room, base));
      this.guest = { v, pos: v.o.position.clone(), ry: v.o.rotation.y, vis: v.o.visible };
      v.visiting = true; v.o.position.set(STAGE.x + 0.4 * scale, STAGE.y, STAGE.z - 0.6 * scale); v.o.visible = true;
    }
    if (kind === 'gallery') this.gallery();
    // hide the outside world
    this.hidden = [];
    for (const o of this.scene.children) if (o !== this.room && !o.isLight && o.visible && o !== this.town.root) { o.visible = false; this.hidden.push(o); }
    for (const o of this.town.root.children) if (o !== pl.model && o !== this.guest?.v.o && o.visible) { o.visible = false; this.hidden.push(o); }
    this.bg = this.scene.background; this.scene.background = new THREE.Color(0x2a2018);
    this.fogFar = this.scene.fog.far; this.scene.fog.far = 1e6;
    this.room.visible = true; this.light.intensity = 26;
    this.inside = kind;
    pl.place(STAGE.x, STAGE.z + this.S - 1.1, 0); pl.pos.y = STAGE.y; pl.heading = PI; pl.yaw = 0; pl.pitch = 0.62; pl.dist = 3 + 4 * scale; pl.snapCam = true;
    this.life.ui.blip(520, 0.12, 'triangle', 0.12);
  }
  leave() {
    if (!this.inside) return;
    for (const c of this.roomCols) { const i = this.town.colliders.indexOf(c); if (i >= 0) this.town.colliders.splice(i, 1); }
    for (const r of [...this.roomObjs]) this.dropFurn(this.roomObjs, r);
    for (const c of this.roomCols) { const i = this.town.colliders.indexOf(c); if (i >= 0) this.town.colliders.splice(i, 1); }
    for (const o of this.hidden) o.visible = true;
    if (this.guest) { const g = this.guest; g.v.o.position.copy(g.pos); g.v.o.rotation.y = g.ry; g.v.visiting = false; this.guest = null; }
    this.scene.background = this.bg; this.scene.fog.far = this.fogFar;
    this.room.visible = false; this.light.intensity = 0; this.inside = null;
    const b = this.back, pl = this.player;
    pl.place(b.x, b.z, b.yaw); pl.heading = b.heading + PI; pl.yaw = b.yaw; pl.pitch = b.pitch; pl.dist = b.dist;
    pl.lastSafe.copy(pl.pos);
  }
  // the owl's exhibition room: a pedestal per donated item, its icon floating above
  gallery() {
    const st = this.st, all = [...FISH, ...BUGS, ...SEA, ...FOSSILS].filter((it) => st.donated[it.id]).slice(0, 49);
    // paintings in frames along the back and side walls
    const arts = ART.filter((a) => st.donated[a.id]).slice(0, 18);
    arts.forEach((a, i) => {
      if (!this.town.protos.art_frame) return;
      const wall = Math.floor(i / 6), k = i % 6, t = (k - 2.5) * 0.95, S = this.S - 0.35;
      const [x, z, ry] = wall === 0 ? [t, -S, 0] : wall === 1 ? [-S, t + 0.2, PI / 2] : [S, t + 0.2, -PI / 2];
      const o = hangPainting(this.town.clone('art_frame', 0, 0, 0, 0, false), a.id); o.parent.remove(o);
      o.position.set(STAGE.x + x, STAGE.y, STAGE.z + z); o.rotation.y = ry; this.room.add(o);
    });
    const n = Math.max(1, Math.ceil(Math.sqrt(all.length))), sp = Math.min(1.0, 4.2 / n);   // pedestals in the middle, paintings on the walls
    all.forEach((it, i) => {
      const x = (i % n - (n - 1) / 2) * sp, z = (Math.floor(i / n) - (n - 1) / 2) * sp - 0.4;
      if (this.town.protos.museum_pedestal) { const p = this.town.clone('museum_pedestal', 0, 0, 0, 0, true); p.parent.remove(p); p.position.set(STAGE.x + x, STAGE.y, STAGE.z + z); p.scale.setScalar(Math.min(1, sp / 0.9)); const glass = p.getObjectByName('museum_pedestal_glass'); if (glass) glass.visible = false; this.room.add(p); }
      const s = this.life.textSprite(icon(it.id), 0.42); s.position.set(STAGE.x + x, STAGE.y + 0.6 * Math.min(1, sp / 0.9) + 0.24, STAGE.z + z); this.room.add(s);
    });
    if (!all.length) { const s = this.life.textSprite('まだ 展示が ないよ', 0.6, 520); s.position.set(STAGE.x, STAGE.y + 1.4, STAGE.z - 1); this.room.add(s); }
  }
  // ---------------------------------------------------------------- placing furniture
  roomBounds() { return this.S - 0.4; }
  async place(i) {
    const st = this.st, id = st.pocket[i], it = ITEMS[id], pl = this.player;
    const inHome = this.inside === 'home';
    if (this.inside && !inHome) { this.life.ui.toast('ここには 置けないよ'); return; }
    if (inHome && it.where === 'out') { this.life.ui.toast('これは 外に置くものだよ'); return; }
    if (!this.inside && it.where === 'in') { this.life.ui.toast('これは 家の中に置くものだよ'); return; }
    const ry = Math.round(pl.heading / (PI / 2)) * (PI / 2) + PI;   // facing ぽっけ
    const d = 0.6 + Math.max(it.w || 0.6, it.d || 0.6) / 2;
    let x = pl.pos.x + Math.sin(pl.heading) * d, z = pl.pos.z + Math.cos(pl.heading) * d;
    x = Math.round(x * 4) / 4; z = Math.round(z * 4) / 4;
    if (inHome) {
      const B = this.roomBounds(), lx = x - STAGE.x, lz = z - STAGE.z;
      if (Math.abs(lx) > B || Math.abs(lz) > B || (lz > B - 1.2 && Math.abs(lx) < 0.9) || this.doors.some((d) => Math.hypot(d.x - x, d.z - z) < 0.8)) { this.life.ui.toast('ここには 置けないよ'); return; }
      const f = { id, x: lx, z: lz, ry, in: true, room: this.roomIdx || 0 };
      st.pocket.splice(i, 1); st.ext.furn.push(f); st.save();
      this.roomObjs.push(this.makeFurn(f, this.room, { x: STAGE.x, z: STAGE.z, y: () => STAGE.y }));
    } else {
      if (!this.life.walkable(x, z) || this.life.water(x, z)) { this.life.ui.toast('ここには 置けないよ'); return; }
      const f = { id, x, z, ry, in: false };
      st.pocket.splice(i, 1); st.ext.furn.push(f); st.save();
      this.outside.push(this.makeFurn(f, this.life.root, { x: 0, z: 0, y: (a, b) => this.life.ground.height(a, b) }));
    }
    this.life.ui.blip(700, 0.08, 'triangle', 0.14); this.life.emit('place');
  }
  async furnMenu(rec, list) {
    const it = ITEMS[rec.f.id], rows = [{ label: 'まわす' }, { label: 'しまう' }];
    if (it.bench) rows.unshift({ label: 'DIYする' });
    rows.push({ label: 'やめる' });
    const k = await this.life.ui.list(it.name, rows), pick = rows[k]?.label;
    if (pick === 'DIYする') return this.life.craft.menu();
    if (pick === 'まわす') { rec.f.ry += PI / 2; rec.o.rotation.y = rec.f.ry; if (rec.col) { rec.col.c = Math.cos(rec.f.ry); rec.col.s = Math.sin(rec.f.ry); } this.st.save(); }
    if (pick === 'しまう') {
      if (this.st.full()) { this.life.ui.toast('ポケットが いっぱい!'); return; }
      this.st.ext.furn.splice(this.st.ext.furn.indexOf(rec.f), 1); this.st.pocket.push(rec.f.id); this.st.save(); this.dropFurn(list, rec);
    }
  }
  // ---------------------------------------------------------------- mail and clothes
  async readMail() {
    const st = this.st, mail = st.ext.mail;
    if (!mail.length) { this.life.ui.toast('ポストは からっぽだ'); return; }
    while (mail.length) {
      const m = mail[0];
      await this.life.ui.say(null, [`${m.from}から 手紙が とどいている。`, ...m.text.split('\f')]);
      if (m.gift) {
        if (st.full()) { await this.life.ui.say(null, ['プレゼントが 入っているけど、ポケットが いっぱいだ。']); return; }
        st.add(m.gift); this.life.ui.jingle([659, 784, 988]);
        await this.life.ui.say(null, [`${ITEMS[m.gift].name}が 入っていた!`]);
      }
      mail.shift(); st.save();
    }
  }
  async wearItem(i) {
    const st = this.st, id = st.pocket[i], c = ITEMS[id];
    if (c.bandana) { const old = st.ext.wear.bandana; st.ext.wear.bandana = id; st.pocket[i] = old; }
    else if (c.hat) { const old = st.ext.wear.hat; st.ext.wear.hat = id; if (old) st.pocket[i] = old; else st.pocket.splice(i, 1); }
    st.save(); this.wear(); this.life.ui.blip(880, 0.08, 'triangle', 0.14);
  }
  async takeOffHat() {
    const st = this.st; if (!st.ext.wear.hat) return;
    if (st.full()) { this.life.ui.toast('ポケットが いっぱい!'); return; }
    st.pocket.push(st.ext.wear.hat); st.ext.wear.hat = null; st.save(); this.wear();
  }
  // recolour the bandana in ぽっけ's vertex colours and put the hat on the head
  wear() {
    const w = this.st.ext.wear, L = this.player.limbs, c = CLOTHES.find((x) => x.id === w.bandana) || CLOTHES[0];
    if (!this.bandana) {   // find the bandana vertices once: the navy colour on the body part
      this.bandana = [];
      L.body.traverse((m) => {
        const col = m.isMesh && m.geometry.attributes.color; if (!col) return;
        const idx = [];
        for (let i = 0; i < col.count; i++) { const r = col.getX(i), g = col.getY(i), b = col.getZ(i); if (b > r * 1.6 && b > g * 1.3 && b > 0.05 && r < 0.25) idx.push(i); }
        if (idx.length) this.bandana.push({ col, idx });
      });
    }
    const target = new THREE.Color().setRGB(...c.bandana, THREE.SRGBColorSpace);
    for (const { col, idx } of this.bandana) { for (const i of idx) col.setXYZ(i, target.r, target.g, target.b); col.needsUpdate = true; }
    if (this.hat) { this.hat.parent?.remove(this.hat); this.hat = null; }
    const h = w.hat && ITEMS[w.hat]?.hat;
    if (h && this.town.protos[h]) {
      const o = this.town.clone(h, 0, 0, 0, 0, true); o.parent.remove(o); L.head.add(o);
      const R0 = this.player.rest; o.position.set(-R0.body.x - R0.head.x, 1.13 - R0.body.y - R0.head.y, -R0.body.z - R0.head.z); o.scale.setScalar(1.35); this.hat = o;   // hat brim at y 1.16 in the shiba's model space
    }
  }
  // ---------------------------------------------------------------- per frame
  target(front) {
    const pl = this.player, pp = pl.pos;
    if (this.inside) {
      const S = this.S, lz = pp.z - STAGE.z, lx = pp.x - STAGE.x;
      for (const r of this.roomObjs) { const it = ITEMS[r.f.id]; if (front(r.o.position.x, r.o.position.z, 0.7 + Math.max(it.w || 0.6, it.d || 0.6) / 2) && this.inside === 'home') return { label: 'しらべる', run: () => this.furnMenu(r, this.roomObjs) }; }
      for (const d of this.doors || []) if (front(d.x, d.z, 1.0)) return { label: d.name === '2階' ? 'のぼる' : d.name === '地下室' ? 'おりる' : 'はいる', run: () => this.switchRoom(d.i) };
      if (lz > S - 0.9 && Math.abs(lx) < 0.8) return { label: this.roomIdx ? 'もどる' : 'でる', run: () => (this.roomIdx ? this.switchRoom(0, this.roomIdx) : this.leave()) };
      return null;
    }
    if (this.door && front(this.door.x, this.door.z, 1.3)) return { label: 'はいる', run: () => this.enter('home') };
    if (this.mailbox && front(this.mailbox.x, this.mailbox.z, 1.2)) return { label: 'ポスト', run: () => this.readMail() };
    for (const r of this.outside) { const it = ITEMS[r.f.id]; if (front(r.o.position.x, r.o.position.z, 0.6 + Math.max(it.w || 0.6, it.d || 0.6) / 2)) return { label: 'しらべる', run: () => this.furnMenu(r, this.outside) }; }
    for (const v of this.life.villagers) if (v.door && !v.def.role.match(/shop|museum/) && front(v.door.x, v.door.z, 1.2)) return { label: 'たずねる', run: () => this.visit(v) };
    return null;
  }
  async visit(v) {
    await this.life.ui.say(null, [`${v.def.name}の 家だ。`], ['おじゃまする', 'やめる']).then((k) => { if (k === 0) this.enter('visit', v); });
  }
  update() {
    if (this.flag) this.flag.visible = !this.inside && this.st.ext.mail.length > 0;
    if (this.inside) {   // walking out through the door
      const lz = this.player.pos.z - STAGE.z, lx = this.player.pos.x - STAGE.x;
      if (lz > this.S + 0.2 && Math.abs(lx) < 0.8) { if (this.roomIdx) this.switchRoom(0, this.roomIdx); else this.leave(); }
      const night = this.life.world.cur.glow;
      for (const r of this.roomObjs) if (r.light) r.light.intensity = 6 + 6 * night;
    } else for (const r of this.outside) if (r.light) r.light.intensity = 7 * this.life.world.cur.glow;
  }
  // a new day: the house finishes overnight, letters arrive (Social), gifts
  newDay(first) {
    const h = this.st.ext.home;
    if (h.order && h.order !== dayKey()) { h.stage = Math.min(7, Math.max(1, h.stage + 1)); h.order = null; this.st.save(); if (!first) this.buildHouse(); this.life.news.push('__house'); }
  }
  // the raccoon's house menu: build / expand on a loan, pay the loan back
  async houseMenu(sp) {
    const h = this.st.ext.home, st = this.st, ui = this.life.ui;
    h.loan ||= 0;
    if (h.order) return '家は いま 工事中だよ。あしたの朝を おたのしみに!';
    if (h.loan > 0) {
      const k = await ui.say(sp, [`ローンの のこりは ${h.loan.toLocaleString()} ナギだよ。\nいつでも すきなだけ 返してね。`], ['ぜんぶ返す', '10,000 返す', '50,000 返す', 'やめる']);
      const amt = [h.loan, 10000, 50000][k]; if (!amt) return 'ほかに なにか あるかい?';
      const pay = Math.min(amt, h.loan, st.money); if (pay <= 0) return 'おや、ナギが ないみたいだね。';
      st.money -= pay; h.loan -= pay; st.save(); ui.jingle([660, 880]);
      return h.loan ? `まいど! のこりは ${h.loan.toLocaleString()} ナギだよ。` : 'ローン 完済! おめでとう!\nつぎの 増築も いつでも 相談してね。';
    }
    const next = HOUSE[h.stage + 1];
    if (!next) return 'ぽっけの 家は もう これ以上 ない 立派な 家だよ!';
    const fill = (x) => x.replace(/\{name\}/g, 'ぽっけ').replace(/\{phrase\}/g, 'まいど').replace(/\{price\}/g, next.cost.toLocaleString());
    const intro = h.stage < 1 ? RACCOON.house_offer.map(fill) : RACCOON.upgrade_offer.map(fill);
    const k = await ui.say(sp, [...intro, `「${next.name}」は ${next.cost.toLocaleString()} ナギ。\nお金は ローンで あとから 返してくれれば いいよ。`], ['たのむ', 'やめる']);
    if (k !== 0) return 'ほかに なにか あるかい?';
    h.order = dayKey(); h.loan = next.cost; st.save(); ui.jingle([523, 659, 784, 1047]);
    return `まいど! 「${next.name}」は 今夜のうちに 工事するよ。\nあしたの朝 5時すぎには できあがってるからね!`;
  }
  // villagers' letters (called by Social each morning)
  letterFrom(v) {
    const lines = LETTERS[v.def.personality] || LETTERS.futsuu, text = pick(lines).replace(/\{name\}/g, 'ぽっけ').replace(/\{phrase\}/g, v.def.catchphrase);
    const gifts = [...FURNITURE.filter((f) => f.price && f.price <= 2400 && !f.season), ...CLOTHES.filter((c) => c.price)];
    const gift = Math.random() < 0.7 ? pick(gifts).id : null;
    this.st.ext.mail.push({ from: v.def.name, text: text + (gift ? '\f' + pick(LETTERS.gift) : ''), gift }); this.st.save();
  }
  galleryLine() { return pick(OWL.gallery_intro); }
}
export { PLOT, STAGE, VILLAGERS };
