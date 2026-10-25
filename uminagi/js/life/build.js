// Building freely: the raccoon sells construction kits (a plot for a resident's house, benches, street lights, a
// gazebo, a torii...). From the pocket a kit is set down in front of ぽっけ on open, level ground; the site is roped
// off for the day and the work is done overnight (after 5:00 it stands). Built things can be moved (back into the
// pocket as a kit) or taken down. A resident with a plot moves into the house built on it.
import * as THREE from 'three';
import { ITEMS, ICON_BY_ID, dayKey } from './state.js';

const PI = Math.PI;
// prices follow the slow-life games' public works where they have one (a housing plot 10,000; bridges and slopes
// 98,000+), the small street furniture is priced like their DIY-free public items
export const FACILITIES = [
  { id: 'plot', name: '住人の家の土地', cost: 10000, desc: '住人が 家を建てて 引っこしてくる', house: true },
  { id: 'bench', name: 'ベンチ', cost: 6800, model: 'bench' },
  { id: 'street_light', name: '街灯', cost: 9800, model: 'street_light' },
  { id: 'info_board', name: '案内板', cost: 8800, model: 'info_board' },
  { id: 'vending_machine', name: '自動販売機', cost: 12800, model: 'vending_machine' },
  { id: 'ishidoro', name: '石灯籠', cost: 14800, model: 'ishidoro' },
  { id: 'telescope', name: '望遠鏡', cost: 19800, model: 'telescope' },
  { id: 'bus_stop', name: 'バス停', cost: 24800, model: 'bus_stop' },
  { id: 'market_tent', name: '屋台テント', cost: 29800, model: 'market_tent' },
  { id: 'azumaya', name: 'あずまや', cost: 59800, model: 'azumaya' },
  { id: 'torii', name: '鳥居', cost: 98000, model: 'torii' },
];
const HOUSES = ['house_hira', 'house_narrow', 'house_old', 'house_hipped', 'house_standard', 'house_twostory'];
const HOUSE_S = 0.7;
for (const f of FACILITIES) {
  ITEMS['kit_' + f.id] = { id: 'kit_' + f.id, name: `${f.name}キット`, kind: 'kit', price: 0, fac: f.id };
  ICON_BY_ID['kit_' + f.id] = '🏗️';
}

export class Build {
  constructor(life) {
    this.life = life; this.st = life.st; this.town = life.town;
    this.st.ext.builds ||= [];
    this.objs = []; this.cols = [];
  }
  // after the villagers exist: hand out the plots, draw everything, residents with a finished house live there
  start() {
    this.assign(); this.render();
    for (const b of this.list) { const v = b.who && this.done(b) && this.life.villagers.find((x) => x.def.id === b.who); if (v) this.life.moveIn(v, b); }
  }
  get list() { return this.st.ext.builds; }
  fac(b) { return FACILITIES.find((f) => f.id === b.id); }
  done(b) { return b.day !== dayKey(); }
  // residents without a plot get the free ones, in order
  assign() {
    const taken = new Set(this.list.map((b) => b.who).filter(Boolean));
    for (const b of this.list) {
      if (!this.fac(b)?.house || b.who) continue;
      const v = this.life.villagers.find((x) => x.def.role === 'resident' && !taken.has(x.def.id));
      if (v) { b.who = v.def.id; taken.add(b.who); }
    }
    this.st.save();
  }
  model(b) {
    if (!this.fac(b).house) return this.fac(b).model;
    const k = b.who ? [...b.who].reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
    return HOUSES.find((m, i) => i >= k % HOUSES.length && this.town.protos[m]) || HOUSES.find((m) => this.town.protos[m]);
  }
  scale(b) { return this.fac(b).house ? HOUSE_S : 1; }
  // the footprint half sizes and the centre offset (local z) of what stands on the spot
  foot(b) {
    const p = this.town.protos[this.model(b)]; if (!p) return { hw: 0.6, hd: 0.6, cz: 0, front: 0.6 };
    const s = this.scale(b), bx = p.box;
    return { hw: (bx.max.x - bx.min.x) / 2 * s, hd: (bx.max.z - bx.min.z) / 2 * s, cz: (bx.max.z + bx.min.z) / 2 * s, front: bx.max.z * s };
  }
  door(b) { const f = this.foot(b), d = f.front + 0.7; return { x: b.x + Math.sin(b.ry) * d, z: b.z + Math.cos(b.ry) * d }; }
  // where the resident lives (for the camp tents and the villagers' doors)
  homeOf(id) { return this.list.find((b) => b.who === id && this.done(b)); }
  // ---------------------------------------------------------------- drawing
  render() {
    for (const o of this.objs) this.life.root.remove(o);
    for (const c of this.cols) { const i = this.town.colliders.indexOf(c); if (i >= 0) this.town.colliders.splice(i, 1); }
    this.objs = []; this.cols = []; this.sites = new Set(this.list.filter((b) => !this.done(b)));
    for (const b of this.list) {
      const y = this.life.ground.height(b.x, b.z), f = this.foot(b);
      if (!this.done(b)) { this.site(b, y, f); continue; }
      const name = this.model(b); if (!this.town.protos[name]) continue;
      const o = this.town.clone(name, b.x, y, b.z, b.ry, false); o.scale.setScalar(this.scale(b)); this.life.root.attach(o); this.objs.push(o);
      const c = Math.cos(b.ry), s = Math.sin(b.ry);
      const col = { type: 'b', x: b.x + s * f.cz, z: b.z + c * f.cz, hw: Math.max(0.25, f.hw * 0.92), hd: Math.max(0.25, f.hd * 0.92), c, s, y0: y - 1, y1: y + 6 };
      this.town.colliders.push(col); this.cols.push(col);
      if (this.fac(b).house && b.who) {   // a name plate by the door
        const v = this.life.villagers.find((x) => x.def.id === b.who), d = this.door(b);
        if (v) { const t = this.life.textSprite(`${v.def.name}の家`, 0.45, 300); t.position.set(d.x + Math.cos(b.ry) * 1.3, y + 1.4, d.z - Math.sin(b.ry) * 1.3); this.life.root.add(t); this.objs.push(t); }
      }
    }
  }
  // a roped-off site with a sign
  site(b, y, f) {
    const g = new THREE.Group(), post = new THREE.MeshStandardMaterial({ color: 0xe86a1a, roughness: 0.6 }), pts = [];
    const hw = Math.max(0.8, f.hw), hd = Math.max(0.8, f.hd), corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    for (const [x, z] of corners) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 10), post); m.position.set(x, 0.35, z + f.cz); m.castShadow = true; g.add(m);
      pts.push(new THREE.Vector3(x, 0.55, z + f.cz));
    }
    for (let i = 0; i < 4; i++) {   // yellow and black rope
      const a = pts[i], c = pts[(i + 1) % 4], m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, a.distanceTo(c), 5), new THREE.MeshStandardMaterial({ color: 0xf0c020, roughness: 0.7 }));
      m.position.copy(a).lerp(c, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize()); g.add(m);
    }
    const t = this.life.textSprite(`🚧 ${this.fac(b).name} 工事中`, 0.55, 420); t.position.set(0, 1.6, f.cz); g.add(t);
    g.position.set(b.x, y, b.z); g.rotation.y = b.ry; this.life.root.add(g); this.objs.push(g);
    const c = Math.cos(b.ry), s = Math.sin(b.ry), col = { type: 'b', x: b.x + s * f.cz, z: b.z + c * f.cz, hw, hd, c, s, y0: y - 1, y1: y + 2 };
    this.town.colliders.push(col); this.cols.push(col);
  }
  // ---------------------------------------------------------------- buying, placing, moving
  async menu(sp) {
    const st = this.st, ui = this.life.ui;
    const rows = FACILITIES.map((f) => ({ label: f.name, sub: `${f.cost.toLocaleString()} ナギ${f.desc ? ' / ' + f.desc : ''}`, ok: st.money >= f.cost }));
    const i = await ui.list('しせつを たてる', rows);
    if (i < 0) return 'ほかに なにか あるかい?';
    const f = FACILITIES[i];
    if (st.money < f.cost) return 'おや、ナギが たりないみたいだね。';
    if (st.full()) return 'ポケットが いっぱいだよ!';
    st.money -= f.cost; st.add('kit_' + f.id); ui.jingle([523, 659, 784]);
    return `まいど! 「${f.name}キット」だよ。\nポケットから 「建てる」を えらぶと、キミの 前に 建てる場所を きめられるよ。\n工事は ひと晩で おわるからね!`;
  }
  // set a kit down in front of ぽっけ (the front faces ぽっけ, turned to the nearest quarter)
  place(i) {
    const st = this.st, id = st.pocket[i], fid = ITEMS[id].fac, ui = this.life.ui, pl = this.life.player;
    if (this.life.home.inside) { ui.toast('外で 建てよう'); return; }
    const ry = Math.round(pl.heading / (PI / 2)) * (PI / 2) + PI, probe = { id: fid, x: 0, z: 0, ry, day: '' }, f = this.foot(probe);
    const d = f.front + 1.3, cx = pl.pos.x + Math.sin(pl.heading) * d, cz = pl.pos.z + Math.cos(pl.heading) * d;
    // the model's origin, so that its footprint centre lands on (cx, cz)
    const x = Math.round((cx - Math.sin(ry) * f.cz) * 2) / 2, z = Math.round((cz - Math.cos(ry) * f.cz) * 2) / 2;
    const why = this.blocked({ ...probe, x, z });
    if (why) { ui.toast(why); return; }
    st.pocket.splice(i, 1);
    const b = { id: fid, x, z, ry, day: dayKey() }; this.list.push(b); this.assign(); st.save(); this.render();
    ui.jingle([392, 523, 659]);
    const who = b.who && this.life.villagers.find((v) => v.def.id === b.who);
    ui.say(null, [`ここに 「${this.fac(b).name}」を 建てることにした。`, who ? `${who.def.name}が ここに 引っこしてくるみたい。\nあしたの朝には 家が できあがるよ。` : 'あしたの朝には できあがるよ。']);
  }
  // why the footprint can't go here (null = fine): level, dry, open ground clear of buildings and of other sites
  blocked(b) {
    const L = this.life, f = this.foot(b), c = Math.cos(b.ry), s = Math.sin(b.ry), y0 = L.ground.height(b.x + s * f.cz, b.z + c * f.cz);
    const hw = Math.max(0.8, f.hw) + 0.4, hd = Math.max(0.8, f.hd) + 0.4;
    for (let u = -hw; u <= hw + 1e-6; u += hw / 3) for (let w = -hd; w <= hd + 1e-6; w += hd / 3) {
      const lz = w + f.cz, x = b.x + c * u + s * lz, z = b.z - s * u + c * lz;
      if (L.water(x, z) || L.ground.height(x, z) < 0.1) return '水べには 建てられないよ';
      if (Math.abs(L.ground.height(x, z) - y0) > 0.7) return 'でこぼこしていて 建てられないよ';
      if (L.blockedAt(x, z, 0.15)) return 'じゃまなものが あって 建てられないよ';
    }
    const door = this.door(b);
    if (!L.walkable(door.x, door.z) && this.fac(b).house) return '入口の前が ふさがっているよ';
    for (const o of this.list) if (o !== b && Math.hypot(o.x - b.x, o.z - b.z) < Math.max(hw, hd) + 1.5) return 'ほかの しせつに 近すぎるよ';
    const h = L.home.door; if (h && Math.hypot(h.x - b.x, h.z - b.z) < Math.max(hw, hd) + 2) return 'ぽっけの家に 近すぎるよ';
    return null;
  }
  target(front) {
    if (this.life.home.inside) return null;
    for (const b of this.list) {
      const f = this.foot(b), cx = b.x + Math.sin(b.ry) * f.cz, cz = b.z + Math.cos(b.ry) * f.cz;
      if (front(cx, cz, Math.max(f.hw, f.hd) + 0.9)) return { label: 'しらべる', run: () => this.inspect(b) };
    }
    return null;
  }
  async inspect(b) {
    const ui = this.life.ui, f = this.fac(b), who = b.who && this.life.villagers.find((v) => v.def.id === b.who);
    const title = f.house ? (who ? `${who.def.name}の家` : '住人の家の土地') : f.name;
    const k = await ui.list(title + (this.done(b) ? '' : '(工事中)'), [{ label: 'うごかす', sub: 'キットに もどして 建てなおす' }, { label: 'とりこわす', sub: 'お金は もどらないよ' }, { label: 'やめる' }]);
    if (k === 0) {
      if (this.st.full()) { ui.toast('ポケットが いっぱい!'); return; }
      this.list.splice(this.list.indexOf(b), 1); this.st.add('kit_' + b.id); this.st.save(); this.render();
      ui.toast(`${f.name}キットに もどした`);
    } else if (k === 1) {
      const ok = await ui.say(null, `ほんとうに 「${title}」を とりこわす?`, ['とりこわす', 'やめる']);
      if (ok !== 0) return;
      this.list.splice(this.list.indexOf(b), 1); this.st.save(); this.render(); ui.toast('とりこわした');
    }
    if (k === 0 || k === 1) { if (f.house && who) { who.door = null; this.life.ui.toast(`${who.def.name}は もとの すまいに もどった`); } }
  }
  // overnight: sites become buildings, and residents move into their new houses
  newDay() {
    const finished = [...(this.sites || [])].filter((b) => this.list.includes(b) && this.done(b));
    if (!finished.length) return;
    this.render();
    const lines = [];
    for (const b of finished) {
      const v = b.who && this.life.villagers.find((x) => x.def.id === b.who);
      if (v) { this.life.moveIn(v, b); lines.push(`おはよう! ${v.def.name}の 家が できあがったよ。\nさっそく 引っこしてきたみたい!`); }
      else lines.push(`おはよう! 「${this.fac(b).name}」が できあがったよ!`);
    }
    this.life.ui.say({ name: 'あらた', color: '#4f8a46', pitch: 1.05 }, lines);
  }
}
