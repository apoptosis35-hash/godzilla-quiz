// Island tours: with a ticket (from the stamp exchange) the boat captain at the harbour takes ぽっけ out to 凪ノ島,
// which is a different island every trip: a theme decides what lies about (peaches, iron and gold, buried
// treasure, or flowers), and rare fish and bugs, big fish and golden bugs are all more common while there.
// The captain waits at the landing to take you back.
import * as THREE from 'three';
import { ITEMS, ICON_BY_ID } from './state.js';
import { ISLAND } from '../terrain.js';

ITEMS.momo = { id: 'momo', name: 'もも', kind: 'fruit', price: 500 }; ICON_BY_ID.momo = '🍑';
const SP = { name: '船長のトラ', color: '#3a6a9a', pitch: 0.85 };
const THEMES = [
  { id: 'fruit', name: 'ももの島', line: 'あまい においが するね。ももの木が いっぱいの 島だ。' },
  { id: 'ore', name: 'きらきら岩の島', line: '岩が きらきら 光ってる。鉄や 金が ひろえるかも。' },
  { id: 'treasure', name: 'たからの島', line: '地面に ヒビが いっぱい。なにか うまってそうだぞ。' },
  { id: 'wild', name: '虫と魚の島', line: '虫の 声が にぎやかだ。海にも 大きな 影が……' },
];
const HARBOUR = [20, 20.5];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Tour {
  constructor(life) {
    this.life = life; this.st = life.st; this.on = null; this.npcs = []; this.items = [];
    this.fade = document.createElement('div'); this.fade.className = 'tourfade'; document.body.appendChild(this.fade);
    this.placeCaptain();
  }
  get boost() { return !!this.on; }
  // the captain and his boat: at the harbour, or at the island landing during a tour
  placeCaptain() {
    const L = this.life;
    for (const n of this.npcs) { L.root.remove(n.o); if (n.boat) L.root.remove(n.boat); }
    this.npcs = [];
    if (!L.town.protos.cat) return;
    const at = this.on ? this.on.landing : HARBOUR;
    const p = L.near(at[0], at[1], (a, b) => L.walkable(a, b) && !L.blockedAt(a, b, 0.9) && L.nearWater(a, b, 2.5), 8) || L.near(at[0], at[1], (a, b) => L.walkable(a, b), 8);
    if (!p) return;
    const o = L.town.clone('cat', p[0], L.ground.height(p[0], p[1]), p[1], 0, true); L.root.attach(o); o.scale.setScalar(1.5);
    o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.multiply(new THREE.Color(0xb8c4d8)); } });
    let boat = null;
    const w = L.near(p[0], p[1] + 3, (a, b) => L.water(a, b) && L.water(a + 1.5, b) && L.water(a - 1.5, b), 6);
    if (w && L.town.protos.skiff) { boat = L.town.clone('skiff', w[0], 0.05, w[1], Math.PI / 2, true); L.root.attach(boat); }
    this.npcs.push({ o, boat, x: p[0], z: p[1] });
  }
  target(front) {
    if (this.life.home.inside) return null;
    for (const n of this.npcs) if (front(n.x, n.z, 1.7)) return { label: '話す', run: () => this.talk() };
    return null;
  }
  async talk() {
    const ui = this.life.ui, st = this.st;
    if (this.on) {
      const k = await ui.say(SP, [`${this.on.theme.name}は どうだい?`, 'そろそろ 港へ もどるかい?'], ['もどる', 'もうすこし']);
      if (k === 0) await this.back();
      return;
    }
    const has = st.pocket.includes('ticket');
    if (!has) { await ui.say(SP, ['よう。オレは 船長の トラ。', '島ツアーチケットが あれば、海の むこうの 島へ 連れてってやるぜ。', 'チケットは あらたの 店の 「スタンプ」で 手に入るらしいぞ。']); return; }
    const k = await ui.say(SP, ['よう。島ツアーチケットを もってるな?', 'きょうは どんな 島に つくか、行ってみての おたのしみだ。\n出発するかい?'], ['出発!', 'やめる']);
    if (k !== 0) return;
    st.pocket.splice(st.pocket.indexOf('ticket'), 1); st.save();
    await this.go();
  }
  async blackout(fn) {
    this.fade.classList.add('on'); await new Promise((r) => setTimeout(r, 700));
    fn(); for (let i = 0; i < 2; i++) this.life.app.frame?.(0.05, false);
    await new Promise((r) => setTimeout(r, 250)); this.fade.classList.remove('on');
  }
  // a landing on the island's south shore and things to find according to the theme
  async go() {
    const L = this.life, theme = pick(THEMES);
    const onIsland = (x, z) => Math.hypot(x - ISLAND.x, (z - ISLAND.z) * 1.15) < ISLAND.r - 1;
    const landing = L.near(ISLAND.x, ISLAND.z - ISLAND.r + 4, (a, b) => onIsland(a, b) && L.walkable(a, b) && !L.blockedAt(a, b, 0.8), 14) || [ISLAND.x, ISLAND.z];
    this.life.goals.count('tour');
    await this.blackout(() => {
      L.player.place(landing[0], landing[1], 0); L.player.heading = 0;
      this.on = { theme, landing };   // only now: until the warp the player is still far from the island
      this.placeCaptain(); this.scatter(theme, onIsland);
    });
    L.ui.jingle([523, 659, 784, 1047]);
    await L.ui.say(SP, [`ついたぜ! きょうは 「${theme.name}」だ。`, theme.line, '帰りたくなったら オレに 話しかけな。']);
  }
  scatter(theme, onIsland) {
    const L = this.life, spots = [];
    for (let k = 0; k < 400 && spots.length < 14; k++) {
      const a = Math.random() * 6.28, r = Math.random() * (ISLAND.r - 3), x = ISLAND.x + Math.cos(a) * r, z = ISLAND.z + Math.sin(a) * r / 1.15;
      const ok = onIsland(x, z) && L.walkable(x, z) && !L.water(x, z) && L.ground.height(x, z) > 0.4 && !L.blockedAt(x, z, 0.6) && Math.abs(L.ground.height(x + 0.8, z) - L.ground.height(x, z)) < 0.5;
      if (ok && !spots.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.5)) spots.push([x, z]);
    }
    const put = (id, [x, z], money) => { const p = L.addPickup(id, x, z, null, money); p.tour = true; this.items.push(p); };
    if (theme.id === 'fruit') spots.slice(0, 10).forEach((s) => put('momo', s));
    if (theme.id === 'ore') spots.slice(0, 10).forEach((s, i) => put(i < 2 ? 'gold_nugget' : i < 7 ? 'iron' : 'stone', s));
    if (theme.id === 'treasure') spots.slice(0, 7).forEach(([x, z], i) => {
      const o = L.town.clone('dig_spot', x, L.ground.height(x, z) + 0.01, z, Math.random() * 6.28, true); L.root.attach(o); o.scale.setScalar(1.1);
      const s = { i: 1000 + i, o, x, z, money: i < 3, tour: true }; L.spots.push(s); this.items.push(s);
    });
    if (theme.id === 'wild') spots.slice(0, 4).forEach((s) => put('branch', s));
  }
  async back() {
    const L = this.life;
    await this.blackout(() => {
      this.clear();
      L.player.place(HARBOUR[0], HARBOUR[1] - 1.5, Math.PI); L.player.heading = Math.PI;
      this.placeCaptain();
    });
    await L.ui.say(SP, 'おかえり。また いつでも 乗せてやるぜ。');
  }
  clear() {
    const L = this.life;
    for (const p of this.items) { L.root.remove(p.o); for (const list of [L.pickups, L.spots]) { const i = list.indexOf(p); if (i >= 0) list.splice(i, 1); } }
    this.items = []; this.on = null;
  }
  update(dt) {
    for (const n of this.npcs) { const pp = this.life.player.pos, want = Math.atan2(pp.x - n.x, pp.z - n.z); if (Math.hypot(pp.x - n.x, pp.z - n.z) < 6) n.o.rotation.y += Math.atan2(Math.sin(want - n.o.rotation.y), Math.cos(want - n.o.rotation.y)) * Math.min(1, dt * 4); }
    // walked home over the bridge (or warped by the map): the tour is over
    if (this.on) { const pp = this.life.player.pos; if (Math.hypot(pp.x - ISLAND.x, pp.z - ISLAND.z) > ISLAND.r + 20) { this.clear(); this.placeCaptain(); } }
  }
}
