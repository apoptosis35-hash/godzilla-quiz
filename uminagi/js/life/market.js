// Shopping: tools, today's furniture and clothes (a different stock every day), seeds; the house order; the daikon
// trade (bought on Sunday mornings, the price changes every morning and afternoon, spoils after a week); and a
// travelling merchant cat who turns up on some days with rare goods.
import * as THREE from 'three';
import { toonify } from '../toon.js';
import { ITEMS, dayKey, seeded } from './state.js';
import { TOOLS } from './data.js';
import { FURNITURE, CLOTHES, SEEDS } from './items2.js';
import { RACCOON } from './data2.js';
import { DURABILITY } from './craft.js';
import { ART } from './art.js';
import { ART_LINES } from './data3.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sunday = (d = new Date()) => { const t = new Date(d.getTime() - 5 * 3600e3); t.setDate(t.getDate() - t.getDay()); return `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`; };

export class Market {
  constructor(life) {
    this.life = life; this.st = life.st;
    this.st.ext.daikon ||= { n: 0, week: null, paid: 0 };
    this.newDay();
  }
  newDay() {
    const k = dayKey(), r = seeded('stock' + k), m = new Date().getMonth() + 1;
    const furn = FURNITURE.filter((f) => f.price && (!f.season || f.season.includes(m)));
    const take = (list, n) => { const a = [...list], out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(r() * a.length), 1)[0].id); return out; };
    this.stock = [...take(furn, 3), ...take(CLOTHES.filter((c) => c.price), 2)];
    // the merchant cat comes on about one day in four (never on Sunday)
    const d = new Date(Date.now() - 5 * 3600e3);
    this.merchantDay = d.getDay() !== 0 && r() < 0.28;
    // two paintings (some of them forgeries), a rare piece of furniture and a hat
    this.merchantStock = take(ART, 2).map((id) => (r() < 0.35 ? id + '_fake' : id)).concat(take(FURNITURE.filter((f) => f.price >= 2000), 1), take(CLOTHES.filter((c) => c.hat), 1));
    // daikon spoil once a new week starts
    const dk = this.st.ext.daikon;
    if (dk.n && dk.week !== sunday()) { this.rotten = dk.n; dk.n = 0; dk.paid = 0; this.st.save(); }
    this.placeMerchant();
  }
  // daikon prices: Sunday buy price, then a pattern for the week (twice a day)
  buyPrice() { return 90 + Math.floor(seeded('dkbuy' + sunday())() * 21); }
  sellPrice() {
    const now = new Date(Date.now() - 5 * 3600e3), dow = now.getDay(); if (dow === 0) return 0;
    const r = seeded('dkweek' + sunday()), kind = Math.floor(r() * 4), base = this.buyPrice(), slot = (dow - 1) * 2 + (now.getHours() + 5 >= 12 ? 1 : 0);
    const k = [];
    for (let i = 0; i < 12; i++) k.push(r());
    if (kind === 0) return Math.round(base * (0.85 - slot * 0.04 + k[slot] * 0.05));                                 // falling all week
    if (kind === 1) { const peak = 3 + Math.floor(k[0] * 6); return Math.round(base * (slot === peak ? 4 + k[1] * 2 : slot === peak - 1 || slot === peak + 1 ? 1.6 + k[2] : 0.7 + k[slot] * 0.4)); }   // a big spike
    if (kind === 2) return Math.round(base * (0.9 + k[slot] * 0.55));                                               // random
    { const peak = 4 + Math.floor(k[0] * 5); return Math.round(base * (slot === peak ? 1.8 + k[1] * 0.4 : 0.75 + k[slot] * 0.35)); }   // small bump
  }
  // the shop's buy menu
  async menu(sp) {
    const st = this.st, ui = this.life.ui, m = new Date().getMonth() + 1;
    const tools = [...TOOLS, { id: 'axe', name: 'おの' }].map((t) => ({ ...t, price: 2500 }));   // sturdy shop tools (the flimsy ones are DIY)
    const seeds = SEEDS;
    const rows = [], acts = [];
    for (const t of tools) { rows.push({ label: t.name, sub: `${t.price} ナギ`, ok: st.money >= t.price }); acts.push(['tool', t.id, t.price]); }
    for (const id of this.stock) { const it = ITEMS[id]; rows.push({ label: `今日の品: ${it.name}`, sub: `${it.price} ナギ`, ok: st.money >= it.price }); acts.push(['item', id, it.price]); }
    for (const s of seeds) { rows.push({ label: s.name, sub: `${s.price} ナギ`, ok: st.money >= s.price }); acts.push(['item', s.id, s.price]); }
    if (m === 10) { rows.push({ label: 'かぼちゃランタン', sub: '600 ナギ', ok: st.money >= 600 }); acts.push(['item', 'furn_pumpkin', 600]); }
    const i = await ui.list('買いもの', rows);
    if (i < 0) return 'ほかに なにか あるかい?';
    const [kind, id, price] = acts[i];
    if (st.full()) return 'ポケットが いっぱいだよ!';
    if (st.money < price) return 'おや、ナギが たりないみたいだね。';
    st.money -= price; st.add(id);
    if (kind === 'tool') { st.ext.dur[id] = DURABILITY[id] || 30; this.life.equip(id); }
    ui.jingle([880, 1175]);
    return `まいど! ${ITEMS[id].name}だね。${kind === 'tool' ? '\n道具ボタンで 持ちかえてね。' : ''}`;
  }
  // daikon at the shop
  async daikon(sp) {
    const st = this.st, ui = this.life.ui, dk = st.ext.daikon, f = (s, p) => s.replace(/\{price\}/g, p).replace(/\{name\}/g, 'ぽっけ').replace(/\{phrase\}/g, 'まいど');
    if (this.rotten) { const n = this.rotten; this.rotten = 0; await ui.say(sp, [f(pick(RACCOON.daikon_rotten), 0), `(だいこん ${n}本が だめになった)`]); }
    const now = new Date(Date.now() - 5 * 3600e3);
    if (now.getDay() === 0) {
      if (now.getHours() + 5 >= 12) return '日曜の だいこんは 朝のうちだけ なんだ。また来週!';
      const p = this.buyPrice();
      const k = await ui.say(sp, f(pick(RACCOON.daikon_sell), p), ['10本', '50本', '100本', 'やめる']);
      const n = [10, 50, 100][k]; if (!n) return 'ほかに なにか あるかい?';
      if (st.money < n * p) return 'おや、ナギが たりないみたいだね。';
      st.money -= n * p; dk.n += n; dk.paid += n * p; dk.week = sunday(); st.save(); ui.jingle([660, 880]);
      return `まいど! だいこん ${n}本だよ。来週の日曜までに 売ってね!`;
    }
    if (!dk.n) return 'だいこんは 日曜の朝に 売ってるよ。値段は 毎日 朝と昼で 変わるんだ。';
    const p = this.sellPrice();
    const k = await ui.say(sp, [f(pick(RACCOON.daikon_buy), p), `(いま ${dk.n}本 / 買ったときは 1本 ${Math.round(dk.paid / dk.n)} ナギ)`], ['ぜんぶ売る', 'やめる']);
    if (k !== 0) return 'ほかに なにか あるかい?';
    st.money += dk.n * p; const gain = dk.n * p - dk.paid; dk.n = 0; dk.paid = 0; st.save(); ui.jingle([880, 1175, 1568]);
    return gain >= 0 ? `まいど! ${gain.toLocaleString()} ナギの もうけだね!` : `まいど! ……${(-gain).toLocaleString()} ナギの そんだね。`;
  }
  // ---------------------------------------------------------------- the travelling merchant
  placeMerchant() {
    if (this.merchant) { this.life.root.remove(this.merchant.o); this.life.root.remove(this.merchant.tent); this.merchant = null; }
    if (!this.merchantDay || !this.life.town.protos.cat) return;
    const p = this.life.near(-14, 8, (x, z) => this.life.walkable(x, z) && !this.life.blockedAt(x, z, 1.5), 12); if (!p) return;
    const tent = this.life.tent(p[0] - 1.6, p[1] - 1.2, 0.3, 0x9a6ad0, 0.8);
    const o = this.life.town.clone('cat', p[0], this.life.ground.height(p[0], p[1]), p[1], 0, true); this.life.root.attach(o); toonify(o); o.scale.setScalar(1.5);
    this.merchant = { o, tent, x: p[0], z: p[1] };
  }
  target(front) {
    const M = this.merchant; if (!M || this.life.home.inside) return null;
    return front(M.x, M.z, 1.6) ? { label: '話す', run: () => this.merchantTalk() } : null;
  }
  async merchantTalk() {
    const st = this.st, ui = this.life.ui, sp = { name: '旅ねこ ミケ', color: '#b07ad8', pitch: 1.2 };
    const first = this.merchantStock.find((id) => ITEMS[id].kind === 'art');
    await ui.say(sp, ['にゃ。旅の 商人の ミケだよ。', pick(ART_LINES.merchant).replace(/\{price\}/g, first ? Math.round(ITEMS[ITEMS[first].real || first].price * 1.3).toLocaleString() : '----').replace(/\{name\}/g, 'ぽっけ')]);
    const cost = (id) => Math.round((ITEMS[id].kind === 'art' ? ITEMS[ITEMS[id].real || id].price : ITEMS[id].price) * 1.3);   // a forgery costs the same as the real one
    const rows = this.merchantStock.map((id) => ({ label: ITEMS[id].name, sub: `${cost(id)} ナギ`, ok: st.money >= cost(id) }));
    const i = await ui.list('ミケの品', rows);
    if (i < 0) { await ui.say(sp, 'また どこかで 会おうにゃ。'); return; }
    const id = this.merchantStock[i], price = cost(id);
    if (st.full()) { ui.toast('ポケットが いっぱい!'); return; }
    st.money -= price; st.add(id); this.merchantStock.splice(i, 1); st.save(); ui.jingle([784, 988]);
    await ui.say(sp, `まいどあり にゃ! ${ITEMS[id].name}、大事にしてにゃ。`);
  }
  update(dt) {
    const M = this.merchant; if (!M) return;
    const pp = this.life.player.pos, want = Math.atan2(pp.x - M.x, pp.z - M.z);
    if (Math.hypot(pp.x - M.x, pp.z - M.z) < 6) M.o.rotation.y += Math.atan2(Math.sin(want - M.o.rotation.y), Math.cos(want - M.o.rotation.y)) * Math.min(1, dt * 4);
  }
}
export { THREE };
