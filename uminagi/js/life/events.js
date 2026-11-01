// Festivals: on each event day (season.js decides which) a festival stall stands by the camp, the town gets its
// decorations, and the stall has the day's doing: drawing a fortune at New Year, driving the oni out at Setsubun,
// hanging a wish on the bamboo at Tanabata (star fragments on the beach next morning), trick-or-treat at
// Halloween... plus a once-a-year present: a seasonal dish, a piece of festival furniture or something to wear.
// `?event=halloween` (etc.) holds any festival for a preview.
import * as THREE from 'three';
import { toonify } from '../toon.js';
import { ITEMS, ICON_BY_ID, dayKey } from './state.js';

const PI = Math.PI, TAU = PI * 2;
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.7, metalness: o.m ?? 0, emissive: o.e ?? 0, side: o.side ? THREE.DoubleSide : THREE.FrontSide });
const put = (g, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; };

// ---------------------------------------------------------------- festival furniture, made in code
const MAKE = {
  furn_kadomatsu: () => { const g = new THREE.Group(); put(g, new THREE.CylinderGeometry(0.28, 0.32, 0.3, 14), M(0x8a6a3a), 0, 0.15, 0); for (let k = 0; k < 3; k++) { const h = 0.8 - k * 0.15, a = k / 3 * TAU; put(g, new THREE.CylinderGeometry(0.06, 0.06, h, 8), M(0x5aa04a), Math.cos(a) * 0.08, h / 2 + 0.1, Math.sin(a) * 0.08); put(g, new THREE.CircleGeometry(0.06, 8), M(0xd8e8b0, { side: 1 }), Math.cos(a) * 0.08, h + 0.1, Math.sin(a) * 0.08, -PI / 2.6); } for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; put(g, new THREE.ConeGeometry(0.06, 0.25, 5), M(0x2a6a2a), Math.cos(a) * 0.2, 0.42, Math.sin(a) * 0.2); } return g; },
  furn_hina: () => { const g = new THREE.Group(); for (let k = 0; k < 3; k++) put(g, new THREE.BoxGeometry(0.9 - k * 0.2, 0.15, 0.3), M(0xd8302a), 0, 0.075 + k * 0.15, -k * 0.08); for (const [x, c] of [[-0.14, 0x2a2a5a], [0.14, 0xd84a6a]]) { put(g, new THREE.ConeGeometry(0.08, 0.16, 10), M(c), x, 0.55, -0.16); put(g, new THREE.SphereGeometry(0.045, 10, 8), M(0xf8f0e8), x, 0.67, -0.16); } for (const x of [-0.25, 0, 0.25]) { put(g, new THREE.ConeGeometry(0.05, 0.1, 8), M(0xf0e8e0), x, 0.37, -0.07); put(g, new THREE.SphereGeometry(0.03, 8, 6), M(0xf8f0e8), x, 0.45, -0.07); } put(g, new THREE.BoxGeometry(0.06, 0.2, 0.06), M(0xf4a0c0), -0.36, 0.55, -0.16); put(g, new THREE.BoxGeometry(0.06, 0.2, 0.06), M(0xf4a0c0), 0.36, 0.55, -0.16); return g; },
  furn_tanabata: () => { const g = new THREE.Group(); put(g, new THREE.CylinderGeometry(0.025, 0.03, 1.6, 6), M(0x6aa04a), 0, 0.8, 0); for (let k = 0; k < 14; k++) { const y = 0.6 + k * 0.07, a = k * 2.3; put(g, new THREE.ConeGeometry(0.03, 0.22, 4), M(0x5a9a3a), Math.cos(a) * 0.12, y, Math.sin(a) * 0.12, Math.sin(a), 0, Math.cos(a) * 1.2); } const cs = [0xf06a8a, 0xffd04a, 0x6ab0f0, 0x8ad86a, 0xc89af0]; for (let k = 0; k < 9; k++) { const a = k * 1.9, y = 0.7 + (k % 5) * 0.14; put(g, new THREE.BoxGeometry(0.05, 0.14, 0.004), M(cs[k % 5], { side: 1 }), Math.cos(a) * 0.16, y, Math.sin(a) * 0.16, 0, a, 0); } return g; },
  furn_tsukimi: () => { const g = new THREE.Group(); put(g, new THREE.BoxGeometry(0.34, 0.12, 0.34), M(0xc8a070), 0, 0.06, 0); put(g, new THREE.CylinderGeometry(0.06, 0.08, 0.06, 8), M(0xc8a070), 0, 0.15, 0); const n = [[0, 0.21], [-0.06, 0.21], [0.06, 0.21], [-0.03, 0.27], [0.03, 0.27], [0, 0.32]]; for (const [x, y] of n) put(g, new THREE.SphereGeometry(0.035, 10, 8), M(0xf8f4ec), x, y, 0); const vase = put(g, new THREE.CylinderGeometry(0.05, 0.07, 0.25, 10), M(0x6a5a8a), 0.28, 0.125, 0); vase.castShadow = true; for (let k = 0; k < 5; k++) { put(g, new THREE.CylinderGeometry(0.004, 0.004, 0.55, 4), M(0xb8a060), 0.28 + (k - 2) * 0.02, 0.5, 0, 0, 0, (k - 2) * 0.12); put(g, new THREE.ConeGeometry(0.02, 0.14, 5), M(0xe8dcc0), 0.28 + (k - 2) * 0.055, 0.8, 0, 0, 0, (k - 2) * 0.12); } return g; },
  furn_xmas_tree: () => { const g = new THREE.Group(); put(g, new THREE.CylinderGeometry(0.12, 0.14, 0.2, 10), M(0x8a3a2a), 0, 0.1, 0); for (let k = 0; k < 3; k++) put(g, new THREE.ConeGeometry(0.42 - k * 0.11, 0.45, 12), M(0x2a7a3a), 0, 0.42 + k * 0.28, 0); put(g, new THREE.OctahedronGeometry(0.08), M(0xf8d040, { e: 0x8a6a00, m: 0.5 }), 0, 1.22, 0); const cs = [0xd8302a, 0xf0c030, 0x3a6ad8, 0xf8f8f8]; for (let k = 0; k < 14; k++) { const a = k * 2.4, y = 0.3 + (k / 14) * 0.8, r = 0.36 * (1 - (y - 0.25) / 1.0); put(g, new THREE.SphereGeometry(0.035, 8, 6), M(cs[k % 4], { e: cs[k % 4] === 0xf0c030 ? 0x332200 : 0 }), Math.cos(a) * r, y, Math.sin(a) * r); } return g; },
};
const FURN = [
  { id: 'furn_kadomatsu', name: '門松', icon: '🎍', w: 0.7, d: 0.7, where: 'both', price: 3000 },
  { id: 'furn_hina', name: 'ひな人形', icon: '🎎', w: 0.9, d: 0.4, where: 'in', price: 5000 },
  { id: 'furn_tanabata', name: '七夕かざり', icon: '🎋', w: 0.5, d: 0.5, where: 'both', price: 2400 },
  { id: 'furn_tsukimi', name: 'お月見かざり', icon: '🎑', w: 0.6, d: 0.4, where: 'both', price: 2400 },
  { id: 'furn_xmas_tree', name: 'クリスマスツリー', icon: '🎄', w: 0.8, d: 0.8, where: 'both', price: 4000, light: true },
];
for (const f of FURN) { ITEMS[f.id] = { ...f, kind: 'furniture', make: MAKE[f.id] }; ICON_BY_ID[f.id] = f.icon; }
// the seasonal treats (eat them: back in the cave they heal)
const TREATS = [
  ['dish_omochi', 'おもち', '🍡', 1], ['dish_fukumame', '福豆', '🫘', 1], ['dish_chirashi', 'ちらしずし', '🍣', 2], ['dish_sakuramochi', 'さくらもち', '🌸', 1], ['dish_watame', 'わたあめ', '🍭', 1],
  ['dish_dango', 'お月見だんご', '🍡', 2], ['dish_candy', 'ハロウィンの おかし', '🍬', 1], ['dish_xcake', 'クリスマスケーキ', '🎂', 9], ['dish_soba', '年こしそば', '🍜', 9],
];
for (const [id, name, icon, heal] of TREATS) { ITEMS[id] = { id, name, kind: 'dish', price: 200, heal }; ICON_BY_ID[id] = icon; }

// what each festival gives (once a year) and what it says
const FEST = {
  newyear: { name: 'お正月', gifts: ['furn_kadomatsu', 'dish_omochi'], money: 1000, deco: 'furn_kadomatsu', act: 'omikuji', hello: 'あけまして おめでとう! 今年も よろしくね。', },
  setsubun: { name: '節分', gifts: ['hat_oni', 'dish_fukumame'], act: 'mame', hello: 'きょうは 節分! 鬼は外、福は内!' },
  hinamatsuri: { name: 'ひなまつり', gifts: ['furn_hina', 'dish_chirashi'], deco: 'furn_hina', hello: 'ひなまつり だよ。ひな人形を かざろう。' },
  hanami: { name: 'お花見', gifts: ['dish_sakuramochi', 'hat_flowers'], petals: true, hello: '桜が きれいだね。お花見 しよう!' },
  tanabata: { name: '七夕', gifts: ['furn_tanabata'], deco: 'furn_tanabata', act: 'tanzaku', hello: 'きょうは 七夕。短冊に 願いごとを 書こう!' },
  fireworks: { name: '夏祭り', gifts: ['chochin_hanging', 'dish_watame'], lanterns: true, hello: '夏祭りだよ! 夜空の 花火を 見てね。' },
  tsukimi: { name: 'お月見', gifts: ['furn_tsukimi', 'dish_dango'], deco: 'furn_tsukimi', hello: 'お月見の 季節だね。夜の 月が きれいだよ。' },
  halloween: { name: 'ハロウィン', gifts: ['hat_witch', 'dish_candy'], act: 'trick', hello: 'トリック・オア・トリート! ハロウィンだよ。' },
  xmas: { name: 'クリスマス', gifts: ['furn_xmas_tree', 'hat_santa', 'dish_xcake'], deco: 'furn_xmas_tree', hello: 'メリー クリスマス! プレゼントが あるよ。' },
  omisoka: { name: '大みそか', gifts: ['dish_soba'], lanterns: true, hello: '今年も おつかれさま。年こしそばで しめくくろう。' },
};
const FORTUNES = [['大吉', '何をしても うまくいく日!'], ['中吉', 'つりの 運が いいかも。'], ['小吉', 'ちいさな しあわせが ありそう。'], ['吉', 'のんびり すごすと いいことが。'], ['末吉', 'あとから いいことが やってくる。']];
const SP = { name: 'まつりの 係 ミナト', color: '#c84a3a', pitch: 1.0 };

export class Fest {
  constructor(life) {
    this.life = life; this.st = life.st; this.objs = []; this.petals = null; this.ev = null;
    this.st.ext.fest ||= {};
    this.newDay();
  }
  today() { const q = new URLSearchParams(location.search).get('event'); return q && FEST[q] ? q : this.life.season?.event(); }
  key(ev) { return `${ev}:${new Date().getFullYear()}`; }
  newDay() {
    const L = this.life;
    for (const o of this.objs) L.root.remove(o); this.objs = []; this.booth = null;
    if (this.petals) { L.root.remove(this.petals); this.petals = null; }
    const ev = this.ev = this.today(), F = FEST[ev]; if (!F) return;
    // the stall by the camp, with the festival's name over it
    // an open spot near the camp: nothing standing within a few metres (a finished town has the fish market there)
    const open = (x, z) => L.walkable(x, z) && !L.water(x, z) && !L.blockedAt(x, z, 3.6) && [[2.5, 0], [-2.5, 0], [0, 3], [0, -2.5]].every(([dx, dz]) => L.walkable(x + dx, z + dz) && !L.water(x + dx, z + dz));
    let p = null; const cands = L.has('harbour') ? [[26, 16], [38, 11], [-24, 2], [-4, 14]] : [[-4, 14], [26, 16]];   // with the harbour built, the camp is the fish market's floor
    for (const [x0, z0] of cands) if ((p = L.near(x0, z0, open, 6))) break;
    p ||= L.near(-4, 14, (x, z) => L.walkable(x, z) && !L.blockedAt(x, z, 2) && !L.water(x, z), 14); if (!p) return;
    const y = L.ground.height(p[0], p[1]), tent = L.town.protos.market_tent ? L.town.clone('market_tent', p[0], y, p[1], PI, true) : L.tent(p[0], p[1], PI, 0xd84a3a, 1.1);
    if (tent.parent !== L.root) L.root.attach(tent); this.objs.push(tent);
    const sign = L.textSprite(`🏮 ${F.name}の 屋台`, 0.9, 460); sign.position.set(p[0], y + 3.1, p[1]); L.root.add(sign); this.objs.push(sign);
    this.booth = { x: p[0], z: p[1] + 1.6 };
    // decorations round the camp and the harbour
    const deco = F.deco || (ev === 'halloween' ? null : null), spots = [[2, 16], [8, 15], [-10, 13], [14, 11], [-16, 16]];
    if (deco && ITEMS[deco]?.make) for (const [x0, z0] of spots) { const q = L.near(x0, z0, (x, z) => L.walkable(x, z) && !L.blockedAt(x, z, 0.8), 4); if (!q) continue; const o = toonify(ITEMS[deco].make()); o.position.set(q[0], L.ground.height(q[0], q[1]), q[1]); o.rotation.y = Math.random() * TAU; o.scale.setScalar(1.3); L.root.add(o); this.objs.push(o); }
    if (F.lanterns && L.town.protos.chochin_hanging) for (let k = 0; k < 8; k++) { const x = p[0] - 7 + k * 2, z = p[1] - 1; const o = L.town.clone('chochin_hanging', x, L.ground.height(x, z) + 2.4, z, 0, true); L.root.attach(o); this.objs.push(o); }
    if (F.petals) this.makePetals();
  }
  // cherry petals drifting round ぽっけ
  makePetals() {
    const N = 260, pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) pos.set([(Math.random() - 0.5) * 30, Math.random() * 10, (Math.random() - 0.5) * 30], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.petals = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffc0d4, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false })); this.petals.frustumCulled = false; this.life.root.add(this.petals);
  }
  target(front) {
    if (this.life.home.inside || !this.booth) return null;
    return front(this.booth.x, this.booth.z, 2.2) ? { label: '屋台', run: () => this.visit() } : null;
  }
  async visit() {
    const L = this.life, st = this.st, ui = L.ui, ev = this.ev, F = FEST[ev]; if (!F) return;
    await ui.say(SP, [F.hello]);
    if (F.act === 'omikuji') { const [f, w] = FORTUNES[Math.floor(Math.random() * FORTUNES.length)]; L.anim = { kind: 'shake', t: 0, dur: 0.6 }; await ui.say(SP, ['おみくじを ひいた……', `「${f}」! ${w}`]); }
    if (F.act === 'mame' && !st.ext.fest[this.key(ev) + ':mame']) {
      const k = await ui.say(SP, ['あっ、鬼が 来たぞ! 豆を まいて おいはらって!'], ['鬼は外!', 'こわい……']);
      if (k === 0) { st.ext.fest[this.key(ev) + ':mame'] = 1; ui.jingle([523, 659, 784, 1047]); await ui.say(SP, ['鬼は外! 福は内!', '鬼が にげていった! 福が 来るよ。']); }
    }
    if (F.act === 'tanzaku' && st.ext.wish !== dayKey()) {
      const k = await ui.say(SP, ['短冊に 願いごとを 書こう。'], ['大物が つれますように', '町が にぎやかに なりますように', 'みんなが 元気で ありますように']);
      if (k >= 0) { st.ext.wish = dayKey(); st.save(); await ui.say(SP, ['短冊を 笹に かざった。', 'あしたの 朝、浜辺に 星が とどくかも……']); }
    }
    if (F.act === 'trick') await ui.say(SP, ['住人たちにも 話しかけてみてね。おかしを もらえるかも!']);
    // the once-a-year present
    if (st.ext.fest[this.key(ev)]) { await ui.say(SP, ['きょうの おみやげは もう わたしたよ。また 来年!']); return; }
    const room = F.gifts.length - (st.cap() - st.pocket.length);
    if (room > 0) { await ui.say(SP, [`おみやげが あるんだけど、ポケットを ${room}つ あけてから 来てね。`]); return; }
    st.ext.fest[this.key(ev)] = 1; for (const id of F.gifts) st.add(id); if (F.money) st.money += F.money; st.save();
    ui.jingle([659, 784, 988, 1319]); L.emit('fest');
    await ui.say(SP, [`${F.name}の おみやげだよ!`, `${F.gifts.map((id) => ITEMS[id]?.name).join('、')}${F.money ? `、おとしだま ${F.money.toLocaleString()} ナギ` : ''} を もらった!`]);
  }
  // trick-or-treat: a villager's sweet, once each on Halloween
  async treat(v) {
    if (this.ev !== 'halloween') return;
    const st = this.st, k = this.key('halloween') + ':' + v.def.id; if (st.ext.fest[k] || st.full()) return;
    st.ext.fest[k] = 1; st.add('dish_candy'); st.save();
    await this.life.ui.say(v.speaker, [`トリック・オア・トリート! はい、おかし、${v.def.catchphrase}!`, 'ハロウィンの おかしを もらった!']);
  }
  update(dt) {
    this.checkT = (this.checkT || 0) - dt;
    if (this.checkT <= 0) { this.checkT = 20; if (this.today() !== this.ev) this.newDay(); }   // the summer festival starts in the evening
    if (!this.petals) return;
    const pp = this.life.player.pos, P = this.petals.geometry.attributes.position, t = this.life.t;
    this.petals.position.set(pp.x, pp.y, pp.z);
    for (let i = 0; i < P.count; i++) { let y = P.getY(i) - dt * 0.6; if (y < 0) y = 10; P.setXYZ(i, P.getX(i) + Math.sin(t + i) * dt * 0.3, y, P.getZ(i) + Math.cos(t * 0.7 + i) * dt * 0.2); }
    P.needsUpdate = true;
  }
}
export const festName = (ev) => FEST[ev]?.name;
