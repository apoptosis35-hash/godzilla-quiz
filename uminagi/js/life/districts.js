// What the town works (progress.js) open up besides their buildings and new neighbours: each district gets
// something to do, at a stand or a sign of its own. The fish market holds an auction for one fish a day, the
// beach hut sells summer (or winter) snacks, the shop street has a lottery, the roads are quicker underfoot, the
// houses share their leftovers, the shrine has fortunes, the lookout shows where today's treasures are, the
// station sells lunch boxes and runs trains, and the island's goddess brings fishing luck for the day.
import { ITEMS, ICON_BY_ID, dayKey } from './state.js';
import { FURNITURE } from './items2.js';
import { FISH } from './data.js';
import { DISHES } from './farm.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const summer = () => { const m = new Date().getMonth() + 1; return m >= 5 && m <= 9; };

// the snacks of the beach hut and the station (kind drink or dish, like perks.js / farm.js)
const FOOD = [
  { id: 'drink_kakigori', name: 'かき氷', icon: '🍧', kind: 'drink', buy: 300, price: 70, heal: 1, fast: 5 },
  { id: 'dish_yakisoba', name: 'やきそば', icon: '🍜', kind: 'dish', buy: 500, price: 120, heal: 2 },
  { id: 'dish_suika', name: 'スイカ', icon: '🍉', kind: 'dish', buy: 1200, price: 300, heal: 9 },
  { id: 'dish_oden', name: 'おでん', icon: '🍢', kind: 'dish', buy: 500, price: 120, heal: 2 },
  { id: 'drink_amazake', name: 'あま酒', icon: '🍶', kind: 'drink', buy: 300, price: 70, heal: 1, fast: 5 },
  { id: 'dish_ekiben', name: '海凪えきべん', icon: '🍱', kind: 'dish', buy: 900, price: 220, heal: 9 },
];
for (const f of FOOD) { ITEMS[f.id] = { id: f.id, name: f.name, kind: f.kind, price: f.price, heal: f.heal, fast: f.fast || 0 }; ICON_BY_ID[f.id] = f.icon; }

// where: [x, z] to search around for open ground; sign: the floating label; tent: a stall stands there
export const DISTRICTS = {
  harbour: { at: [-2, 6], sign: '🐟 せり場', act: 'せりに 出す', what: '魚市場の せりで 魚を 高く 売れる(1日1匹)' },
  beach: { at: [88, 44], sign: '🏖️ 海の家', act: '海の家', what: '海の家で かき氷・やきそば・スイカ(冬は おでん・あま酒)', tent: true },
  street: { at: [40, -108], sign: '🎰 福引き所', act: '福引き', what: '商店街の 福引き(1日1回 むりょう)', tent: true, paved: true },
  roads: { what: '道路の 上は すいすい 歩ける' },
  houses: { at: [-6, -46], sign: '🧺 おすそわけ箱', model: 'furn_mailbox_red', offroad: true, act: 'のぞく', what: '住宅街の おすそわけ箱に 毎日 なにか 入っている' },
  shrine: { at: [-9, -110], sign: '⛩️ おみくじ', act: 'おみくじ', what: '神社で 毎日 おみくじ' },
  hill: { at: [-95, -3], sign: '🔭 展望台', act: '見はらす', what: '展望台から きょうの お宝の 場所が わかる' },
  tram: { at: [74, 13.6], sign: '🚃 海辺の駅', act: '駅', what: '電車で 町の あちこちへ。えきべんも 売っている' },
  island: { at: [97, 197], sign: '🪷 弁天さま', act: 'おまいり', what: '島の 弁天さまに おまいりすると 一日中 めずらしい魚が つれやすい' },
};
const LOTTO = [
  { w: 2, name: '特賞', ball: '金', give: 'rare' }, { w: 6, name: '1等', ball: '赤', give: 'ticket' }, { w: 14, name: '2等', ball: '青', give: 'mat' },
  { w: 30, name: '3等', ball: '緑', give: 'food' }, { w: 48, name: '4等', ball: '白', give: 'coin' },
];
const OMIKUJI = [
  { w: 10, name: '大吉', line: 'なにを しても うまくいく 一日!', money: 1000, mat: 'star_frag' }, { w: 20, name: '中吉', line: 'いいことが ありそう。', money: 500 },
  { w: 25, name: '小吉', line: 'ちいさな しあわせが 見つかる。', fruit: true }, { w: 30, name: '吉', line: 'おだやかな 一日に なりそう。', money: 100 },
  { w: 15, name: '凶', line: 'でも 気にしない! 木に むすんでおこう。' },
];
const wpick = (list) => { let u = Math.random() * list.reduce((a, x) => a + x.w, 0); for (const x of list) { u -= x.w; if (u <= 0) return x; } return list[0]; };

export class Districts {
  constructor(life) { this.life = life; this.st = life.st; this.places = []; this.objs = []; }
  // after the town is drawn: a sign (and a stall) at each built district's spot
  start() {
    const L = this.life;
    for (const [id, d] of Object.entries(DISTRICTS)) {
      if (!d.at || !L.has(id)) continue;
      const clear = d.tent ? 1.9 : d.model ? 1.1 : 0.8;
      const p = L.near(d.at[0], d.at[1], (x, z) => L.walkable(x, z) && !L.blockedAt(x, z, clear) && !L.water(x, z) && (d.tent || d.offroad ? d.paved || !L.onRoad(x, z) : true), 14);
      if (!p) continue;
      const [x, z] = p, y = L.ground.height(x, z);
      if (d.tent && L.town.protos.market_tent) {
        const o = L.town.clone('market_tent', x, y, z, Math.atan2(-x + d.at[0], -z + d.at[1]) || 0, false); o.scale.setScalar(0.8); L.root.attach(o); this.objs.push(o);
      }
      if (d.model && L.town.protos[d.model]) { const o = L.town.clone(d.model, x, y, z, Math.atan2(d.at[0] - x, d.at[1] - z) || 0, false); L.root.attach(o); this.objs.push(o); }
      const t = L.textSprite(d.sign, 0.9, 300); t.position.set(x, y + (d.tent ? 2.9 : 1.9), z); L.root.add(t); this.objs.push(t);
      this.places.push({ id, x, z, R: d.tent ? 2.4 : 1.6 });
    }
  }
  target(front) {
    if (this.life.home.inside) return null;
    for (const p of this.places) if (front(p.x, p.z, p.R)) return { label: DISTRICTS[p.id].act, run: () => this.use(p.id) };
    return null;
  }
  once(k) { const d = this.st.daily; d.dist ||= {}; if (d.dist[k]) return false; d.dist[k] = 1; this.st.save(); return true; }
  async use(id) {
    this.life.emit('facility');
    await { harbour: this.auction, beach: this.hut, street: this.lotto, houses: this.share, shrine: this.fortune, hill: this.lookout, tram: this.station, island: this.goddess }[id].call(this);
  }
  // hooks
  roadK() { const L = this.life, p = L.player.pos; return L.has('roads') && !L.home.inside && L.onRoad(p.x, p.z) ? 1.25 : 1; }

  // ---------------------------------------------------------------- the fish market's auction: one fish a day, bid up
  async auction() {
    const L = this.life, st = this.st, ui = L.ui, sp = { name: 'せりの おじさん', color: '#3a6a9a', pitch: 0.85 };
    if (this.st.daily.dist?.auction) { await ui.say(sp, 'きょうの せりは おわったよ。また あした 来ておくれ!'); return; }
    if (!st.pocket.some((id) => ITEMS[id]?.kind === 'fish')) { await ui.say(sp, ['ここは 魚市場の せり場だよ。', '魚を 1匹 もってくれば、せりに かけて 高く 売ってあげよう。1日1匹だよ!']); return; }
    await ui.say(sp, ['いらっしゃい! せりに 出す 魚を えらんでおくれ。', 'めずらしい魚ほど 値が あがるよ!']);
    const i = await ui.pocket(st, { title: 'せりに 出す', filter: (id) => ITEMS[id]?.kind === 'fish', note: '1日1匹' });
    if (i < 0) return;
    const id = st.pocket[i], s = FISH.find((f) => f.id === id), rar = s?.rarity || 1;
    const k = Math.min(3, 1.2 + Math.random() * (0.4 + rar * 0.3)), price = Math.round(ITEMS[id].price * k / 10) * 10;
    if (!this.once('auction')) return;
    st.remove(i); st.money += price; st.stats.sold++; L.emit('sell'); st.save(); ui.jingle([784, 988, 1175, 1568]);
    await ui.say(sp, [`さあ 「${ITEMS[id].name}」! ${Math.round(ITEMS[id].price * 1.1).toLocaleString()}から!`, 'はい! はい! そっちも はい!', `${price.toLocaleString()} ナギで せりおとし! (ふだんの ${k.toFixed(1)}ばい)`]);
  }
  // ---------------------------------------------------------------- the beach hut
  async hut() {
    const L = this.life, st = this.st, ui = L.ui, menu = FOOD.filter((f) => (summer() ? ['drink_kakigori', 'dish_yakisoba', 'dish_suika'] : ['dish_oden', 'drink_amazake', 'dish_yakisoba']).includes(f.id));
    await this.buy('海の家', menu, { name: 'ケロ', color: '#4a9a5a', pitch: 1.25 }, summer() ? 'いらっしゃい! 冷たいのも あついのも あるよ!' : 'さむいね! あったかいの どうぞ!');
  }
  async station() {
    const L = this.life, ui = L.ui, pl = L.player;
    const k = await ui.list('海辺の駅', [{ label: '🚃 電車に のる', sub: '町の 駅から 駅へ' }, { label: '🍱 えきべんを 買う', sub: '900 ナギ / 洞窟で ハートまんたん' }]);
    if (k === 1) { await this.buy('えきべん', FOOD.filter((f) => f.id === 'dish_ekiben'), null, null); return; }
    if (k !== 0) return;
    const go = [['商店街', 40, -40, 'street'], ['漁港', 0, 19, 'harbour'], ['海凪神社', -9, -112, 'shrine'], ['灯台の丘', -104, -10, 'hill'], ['東の浜', 88, 50, 'beach'], ['弁天橋', 97, 100, 'island']].filter((g) => L.has(g[3]));
    const j = await ui.list('どの 駅まで?', go.map((g) => ({ label: `${g[0]}駅`, sub: '' }))); if (j < 0) return;
    const [, x, z] = go[j], p = L.near(x, z, (a, b) => L.walkable(a, b), 8) || [x, z];
    ui.blip(392, 0.2, 'triangle', 0.12); setTimeout(() => ui.blip(330, 0.3, 'triangle', 0.12), 260);
    pl.place(p[0], p[1], pl.yaw); L.app.save?.(); ui.toast(`ガタンゴトン……「${go[j][0]}駅」に ついた!`, 1800);
  }
  async buy(title, menu, sp, hello) {
    const st = this.st, ui = this.life.ui;
    if (sp && hello) await ui.say(sp, hello);
    const k = await ui.list(title, menu.map((f) => ({ label: `${f.icon} ${f.name}`, sub: `${f.buy} ナギ / ${f.fast ? `${f.fast}分 はやあし・` : ''}洞窟で ハート${f.heal >= 9 ? 'まんたん' : '+' + f.heal}`, ok: st.money >= f.buy })));
    if (k < 0) return;
    const f = menu[k]; if (st.full()) { ui.toast('ポケットが いっぱい!'); return; }
    st.money -= f.buy; st.add(f.id); st.save(); ui.jingle([523, 659, 784]); ui.toast(`${f.name}を 買った!`);
  }
  // ---------------------------------------------------------------- the shop street's lottery: one free turn a day, then 500 ナギ (3 a day)
  async lotto() {
    const L = this.life, st = this.st, ui = L.ui, sp = { name: '福引きの おばさん', color: '#c84a4a', pitch: 1.1 };
    const n = st.daily.dist?.lotto || 0, free = n === 0;
    if (n >= 4) { await ui.say(sp, 'きょうの 福引きは おしまい! また あしたね。'); return; }
    const c = await ui.say(sp, free ? ['商店街の 福引きだよ!', 'きょうの 1回目は むりょう! まわしてみる?'] : `もう 1回? 1回 500 ナギだよ。(きょう あと ${4 - n}回)`, ['まわす', 'やめる']);
    if (c !== 0) return;
    if (!free) { if (st.money < 500) { await ui.say(sp, 'ナギが たりないみたいだね。'); return; } st.money -= 500; }
    st.daily.dist ||= {}; st.daily.dist.lotto = n + 1;
    const r = wpick(LOTTO); let got;
    if (r.give === 'rare') { const f = pick(FURNITURE.filter((x) => x.price >= 5000 && ITEMS[x.id])); got = st.add(f.id) ? `「${f.name}」` : null; }
    else if (r.give === 'ticket') got = st.add('ticket') ? '「島ツアーチケット」' : null;
    else if (r.give === 'mat') { const m = pick(['star_frag', 'iron', 'crystal']); st.mat[m] = (st.mat[m] || 0) + 2; got = `${ITEMS[m].name}×2`; }
    else if (r.give === 'food') { const f = pick([...DISHES.filter((d) => d.price <= 600), ...FOOD.filter((x) => x.id !== 'dish_suika')]); got = st.add(f.id) ? `「${f.name}」` : null; }
    else { st.money += 300; got = '300 ナギ'; }
    if (!got) { st.money += 1000; got = '1,000 ナギ(ポケットが いっぱいだったので)'; }
    st.save(); ui.blip(300, 0.08, 'square', 0.08); setTimeout(() => ui.jingle(r.give === 'coin' ? [659, 784] : [784, 988, 1175, 1568, 1976]), 600);
    await ui.say(sp, ['ガラガラガラ……ポン!', `${r.ball}の 玉! ${r.name}${r.give === 'rare' ? '!!! おおあたり!' : r.give === 'coin' ? '' : '! おめでとう!'}`, `${got}を もらった!`]);
  }
  // ---------------------------------------------------------------- the houses' sharing box
  async share() {
    const L = this.life, st = this.st, ui = L.ui, res = L.social?.residents() || [];
    if (!this.once('share')) { await ui.say(null, 'おすそわけ箱は からっぽ。また あした のぞいてみよう。'); return; }
    const v = res.length ? pick(res) : null, gift = pick(['mikan', 'mikan', 'veg_tomato', 'veg_carrot', 'veg_potato', 'dish_yakizakana', 'dish_tomatosoup', 'dish_carrotcake']);
    if (!ITEMS[gift] || !st.add(gift)) { st.money += 200; await ui.say(null, ['おすそわけ箱に 200ナギと メモが 入っていた。', '「いつも ありがとう」']); return; }
    if (v) st.friend[v.def.id] = (st.friend[v.def.id] || 0) + 1;
    st.save(); ui.jingle([659, 784, 988]);
    await ui.say(null, [`おすそわけ箱に 「${ITEMS[gift].name}」が 入っていた!`, v ? `メモ: 「よかったら どうぞ。 ${v.def.name}より」` : 'メモ: 「よかったら どうぞ」']);
  }
  // ---------------------------------------------------------------- the shrine's fortunes
  async fortune() {
    const L = this.life, st = this.st, ui = L.ui;
    if (st.daily.dist?.omikuji) { await ui.say(null, `きょうの おみくじは 「${st.daily.dist.omikuji}」だった。また あした ひこう。`); return; }
    const o = wpick(OMIKUJI); st.daily.dist ||= {}; st.daily.dist.omikuji = o.name;
    const lines = ['からん からん……(おみくじを ひいた)', `「${o.name}」! ${o.line}`];
    if (o.money) { st.money += o.money; lines.push(`おさいせんの おかえし? ${o.money.toLocaleString()} ナギ 見つけた!`); }
    if (o.mat) { st.mat[o.mat] = (st.mat[o.mat] || 0) + 1; lines.push(`それから ${ITEMS[o.mat].name}も!`); }
    if (o.fruit && st.add('mikan')) lines.push('みかんも ひとつ もらった。');
    st.save(); ui.jingle(o.name === '凶' ? [392, 330] : [784, 988, 1175]);
    await ui.say(null, lines);
  }
  // ---------------------------------------------------------------- the lookout: where today's treasures lie
  async lookout() {
    const L = this.life, ui = L.ui, where = (x, z) => L.app.areaAt?.(x, z) || 'どこか';
    const lines = ['展望台から 町を 見はらした……。'];
    const r = L.moneyRock; if (r && !L.st.daily.rock) lines.push(`${where(r.x, r.z)}の あたりの 岩が キラッと 光った。(お金の 出る岩かも)`);
    const s = L.spots.find((q) => q.money); if (s) lines.push(`${where(s.x, s.z)}の 地面に ひかる 場所が ある。(ほってみよう)`);
    const b = L.pickups.find((q) => q.key === 'bottle' || q.id === 'letter'); if (b) lines.push(`${where(b.x, b.z)}の 波うちぎわに ビンが 流れついている。`);
    if (lines.length === 1) lines.push('きょうの お宝は もう ぜんぶ 見つけたみたい。');
    await ui.say(null, lines);
  }
  // ---------------------------------------------------------------- the island goddess: fishing luck all day
  async goddess() {
    const st = this.st, ui = this.life.ui;
    if (st.daily.benten) { await ui.say(null, 'きょうは もう おまいりした。弁天さまが 見まもってくれている。'); return; }
    st.daily.benten = 1; st.save(); ui.blip(880, 0.4, 'sine', 0.12); setTimeout(() => ui.blip(1175, 0.5, 'sine', 0.12), 400);
    await ui.say(null, ['弁天さまに おまいりした。', '海の 神さまの ごりやくで、きょうは 一日中 めずらしい魚が つれやすい!']);
  }
}
