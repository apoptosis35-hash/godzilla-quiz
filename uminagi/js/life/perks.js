// What the built facilities (build.js) are good for, once their night of building is over. Each kind opens up
// something new: sitting on a bench with a resident, the notice board's news, drinks from the vending machine,
// beetles and fireflies drawn to the lamps at night, the telescope (big fish by day, shooting stars by night), the
// bus, the market tent's rare goods, tea in the gazebo and the torii's blessing for the day.
import * as THREE from 'three';
import { ITEMS, ICON_BY_ID, dayKey, seeded } from './state.js';
import { FISH, BUGS } from './data.js';
import { FURNITURE, CLOTHES } from './items2.js';
import { festName } from './events.js';

const PI = Math.PI;
const inHours = (hours, h) => hours.some(([a, b]) => (a <= b ? h >= a && h < b : h >= a || h < b));
const RARITY_W = [0, 10, 6, 3, 1.4, 0.5];
const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];

// act: the button by the facility (none: it works by itself); what: shown in the shop and when it is finished
export const PERKS = {
  bench: { short: 'すわって 住人と おしゃべり', act: 'すわる', what: 'すわって ひと休み。住人が となりに 来て おしゃべりしてくれる(1日1回 おみやげ)' },
  street_light: { short: '夜 カブトムシや クワガタが 集まる', what: '夜、あかりに カブトムシや クワガタ、コオロギが 集まってくる' },
  street_lantern: { short: '夜 カブトムシや クワガタが 集まる', what: '夜、あかりに カブトムシや クワガタ、コオロギが 集まってくる' },
  info_board: { short: 'おねがい・天気・お祭りが わかる', act: '見る', what: 'きょうの おねがい・天気・つぎの お祭り・いま 見つかる まだの いきものが わかる' },
  vending_machine: { short: 'のみもので はやあし・ハート回復', act: 'のみものを 買う', what: 'のみものが 買える。ラムネで はやあし、洞窟では ハートが もどる' },
  ishidoro: { short: '夜 ホタルと 金色の虫', what: '夜、ホタルが 集まり、まわりで 金色の虫が 出やすくなる' },
  telescope: { short: '大物さがし・流れ星', act: 'のぞく', what: '昼は 沖の 大物が 見えて しばらく 大物が 釣れやすく、夜は 流れ星で 星のかけら' },
  bus_stop: { short: '家・洞窟・バス停へ ひとっとび', act: 'バスに のる', what: '家の前・洞窟の入口・ほかの バス停へ ひとっとび' },
  market_tent: { short: 'めずらしい品・高く売れる日', act: '屋台を 見る', what: '毎日 かわる めずらしい 品が 買える。きょうの 高く売れるものも わかる' },
  azumaya: { short: '住人と お茶会', act: 'お茶会', what: '1日1回 住人と お茶会。みんなと なかよくなれて、おみやげも' },
  torii: { short: '毎日 ごりやく', act: 'おまいり', what: '1日1回 ごりやく(釣り運・虫運・金運・洞窟運)が もらえる' },
};
// drinks: buy is what the machine asks; price is what they sell back for; heal = hearts in the cave; fast = minutes of quick feet
export const DRINKS = [
  { id: 'drink_ramune', name: 'ラムネ', icon: '🥤', buy: 160, price: 40, heal: 1, fast: 3 },
  { id: 'drink_tea', name: 'あったか お茶', icon: '🍵', buy: 240, price: 60, heal: 2, fast: 0 },
  { id: 'drink_mix', name: 'ミックスジュース', icon: '🧃', buy: 900, price: 220, heal: 9, fast: 10 },
];
for (const d of DRINKS) { ITEMS[d.id] = { id: d.id, name: d.name, kind: 'drink', price: d.price, heal: d.heal, fast: d.fast }; ICON_BY_ID[d.id] = d.icon; }
// what each lamp draws at night
const LIGHT_BUGS = ['kabutomushi', 'nokogiri', 'miyama', 'okuwagata', 'gengorou', 'kanetataki', 'fuyushaku', 'koorogi', 'suzumushi', 'umaoi', 'kutsuwamushi'];
const FIREFLIES = ['genjibotaru', 'heikebotaru'];
const LIGHTS = { street_light: LIGHT_BUGS, street_lantern: LIGHT_BUGS, ishidoro: FIREFLIES };
// the torii's blessings
const BLESS = {
  fish: { name: '釣り運', line: 'きょうは めずらしい 魚が よく つれそうだ!' },
  bug: { name: '虫運', line: 'きょうは めずらしい 虫や 金色の虫に 会えそうだ!' },
  money: { name: '金運', line: 'きょうは なにを 売っても 1わり 高く 売れる!' },
  cave: { name: '洞窟運', line: 'きょうの 洞窟では ハートが 1つ ふえる!' },
};
// what the market tent pays more for today (at the raccoon's, everywhere you sell)
const WANTED = [
  { kind: 'fish', name: '魚' }, { kind: 'bug', name: '虫' }, { kind: 'shell', name: '貝がら' }, { kind: 'veg', name: 'やさい' },
  { kind: 'fruit', name: 'くだもの' }, { kind: 'fossil', name: '化石' }, { kind: 'dish', name: 'りょうり' },
];

export class Perks {
  constructor(life) { this.life = life; this.st = life.st; this.bigUntil = 0; this.fastUntil = 0; life.player.speedK = () => this.speedK(); }
  get B() { return this.life.build; }
  // finished facilities of a kind
  built(id) { return (this.B?.list || []).filter((b) => b.id === id && this.B.done(b)); }
  has(id) { return this.built(id).length > 0; }
  // once-a-day flags (st.daily is reset at 5:00)
  once(k) { const d = this.st.daily; d.perk ||= {}; if (d.perk[k]) return false; d.perk[k] = 1; this.st.save(); return true; }
  used(k) { return !!this.st.daily.perk?.[k]; }
  night() { const h = this.life.hour(); return h >= 19 || h < 5; }
  centre(b) { const f = this.B.foot(b); return { x: b.x + Math.sin(b.ry) * f.cz, z: b.z + Math.cos(b.ry) * f.cz }; }

  // ---------------------------------------------------------------- hooks used by life.js / cave.js / player
  blessing() { return this.st.daily.bless || null; }
  // weight factor for a species when picking what turns up
  luck(kind, s) {
    let k = 1;
    if (kind === 'fish' && s.rarity >= 3 && (this.blessing() === 'fish' || performance.now() < this.bigUntil)) k *= this.blessing() === 'fish' && performance.now() < this.bigUntil ? 4 : 2.5;
    if (kind === 'bug' && s.rarity >= 3 && this.blessing() === 'bug') k *= 2.5;
    return k;
  }
  bigFish() { return performance.now() < this.bigUntil; }
  goldK(x, z) {
    let k = this.blessing() === 'bug' ? 3 : 1;
    if (this.night() && this.built('ishidoro').some((b) => Math.hypot(b.x - x, b.z - z) < 14)) k *= 3;
    return k;
  }
  wanted() { if (!this.has('market_tent')) return null; return WANTED[Math.floor(seeded('tentwant' + dayKey())() * WANTED.length)]; }
  sellK(id) {
    const it = ITEMS[id]; let k = this.blessing() === 'money' ? 1.1 : 1;
    const w = this.wanted(); if (w && it && it.kind === w.kind) k *= 1.5;
    return k;
  }
  caveHeart() { return this.blessing() === 'cave' ? 1 : 0; }
  speedK() { return performance.now() < this.fastUntil ? 1.3 : 1; }

  // ---------------------------------------------------------------- the lamps draw bugs at night
  // called before the usual bug spawn: true when a bug was put by a lamp instead
  lampBug(pp) {
    if (!this.night() || Math.random() > 0.45) return false;
    const L = this.life, m = L.month(), h = L.hour();
    const lamps = (this.B?.list || []).filter((b) => LIGHTS[b.id] && this.B.done(b) && Math.hypot(b.x - pp.x, b.z - pp.z) < 34);
    if (!lamps.length) return false;
    const b = pick(lamps), near = L.bugs.filter((x) => x.lamp === b).length; if (near >= 2) return false;
    const ok = BUGS.filter((s) => LIGHTS[b.id].includes(s.id) && s.months.includes(m) && inHours(s.hours, h));
    if (!ok.length) return false;
    let sum = 0; for (const s of ok) sum += RARITY_W[s.rarity] || 1;
    let u = Math.random() * sum, sp = ok[0]; for (const s of ok) { u -= RARITY_W[s.rarity] || 1; if (u <= 0) { sp = s; break; } }
    const c = this.centre(b), fly = FIREFLIES.includes(sp.id);
    let x, z, y;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * PI * 2, r = 0.9 + Math.random() * 0.9; x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r;
      if (L.walkable(x, z) && !L.blockedAt(x, z, 0.1)) break; x = null;
    }
    if (x == null) return false;
    y = L.ground.height(x, z) + (fly ? 0.7 + Math.random() * 0.8 : 0);
    const o = L.bugMesh(sp.id); o.position.set(x, y, z); L.root.add(o);
    const gold = Math.random() < 0.03 * this.goldK(x, z);
    if (gold) o.traverse((q) => { if (q.isMesh && !q.userData.outline) q.material = new THREE.MeshStandardMaterial({ color: 0xffc830, emissive: 0x8a5a00, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.3 }); });
    L.bugs.push({ sp, w: 'lamp', o, mode: fly ? 'hover' : 'sit', x, y, z, x0: x, y0: y, z0: z, t: Math.random() * 9, h: Math.random() * 6.28, flee: 0, base: null, gold, lamp: b });
    return true;
  }

  // ---------------------------------------------------------------- using a facility
  async use(b) {
    const id = b.id, L = this.life;
    const run = { bench: this.bench, info_board: this.board, vending_machine: this.vend, telescope: this.scope, bus_stop: this.bus, market_tent: this.tent, azumaya: this.tea, torii: this.shrine }[id];
    if (!run) return;
    L.emit('facility');
    await run.call(this, b);
  }
  async bench() {
    const L = this.life, ui = L.ui, st = this.st;
    L.anim = { kind: 'dig', t: 0, dur: 0.4 };
    const res = L.social?.residents() || [];
    if (!res.length || !this.once('bench')) {
      const sky = this.night() ? (L.season?.today?.stars ? '星が きれいだ……。' : '夜風が 気持ちいい……。') : L.season?.raining() ? '雨の 音を きいている……。' : 'いい風が ふいてくる……。';
      await ui.say(null, ['ぽっけは ベンチに すわって ひと休みした。', sky]);
      return;
    }
    const v = pick(res), r = Math.random;
    st.friend[v.def.id] = (st.friend[v.def.id] || 0) + 1;
    const gift = r() < 0.5 ? 'mikan' : pick(['wood', 'stone', 'iron', 'branch']);
    const talk = pick(['ここに すわると 町が よく 見えるね。', 'ベンチって いいよね。のんびりできる。', 'きょうは なにを したの? ぼくは さんぽ。', 'たまには こうして ぼーっと するのも いいよね。']);
    await ui.say(v.speaker, [`${v.def.name}が となりに すわった。`, talk, 'そうだ、これ あげる!']);
    if (ITEMS[gift].kind === 'material') { st.mat[gift] = (st.mat[gift] || 0) + 2; ui.toast(`${ITEMS[gift].name}×2を もらった!`); }
    else if (st.add(gift)) ui.toast(`${ITEMS[gift].name}を もらった!`); else ui.toast('ポケットが いっぱい!');
    ui.jingle([659, 784, 988]); st.save();
  }
  async board() {
    const L = this.life, st = this.st, ui = L.ui, S = L.season;
    const W = { clear: '☀️ はれ', cloudy: '☁️ くもり', rain: '☔ 雨', snow: '⛄ 雪' };
    const tmr = S?.weather(dayKey(new Date(Date.now() + 864e5)));
    const rows = [{ label: `天気: きょう ${W[S?.today?.w] || '?'} / あした ${W[tmr?.w] || '?'}`, sub: S?.today?.stars ? 'こんやは 流れ星が 見られるかも' : '' }];
    // the next festival in the coming two months
    let fest = null; for (let i = 0; i < 70 && !fest; i++) { const d = new Date(Date.now() + i * 864e5); d.setHours(20); const e = S?.event(d); if (e && e !== 'snow' && festName(e)) fest = [d, e]; }
    rows.push({ label: fest ? `つぎの お祭り: ${festName(fest[1])}` : 'つぎの お祭り: しばらく なし', sub: fest ? (dayKey(fest[0]) === dayKey() ? 'きょう!' : `${fest[0].getMonth() + 1}月${fest[0].getDate()}日`) : '' });
    for (const q of st.ext.reqs || []) { const v = L.villagers.find((x) => x.def.id === q.vid); if (v) rows.push({ label: `おねがい: ${v.def.name}`, sub: `${q.name}${q.done ? ' ✓ かなえた' : ''}` }); }
    const w = this.wanted(); if (w) rows.push({ label: `きょう 高く売れる: ${w.name}`, sub: '1.5ばいで 売れる(屋台テントの おかげ)' });
    const b = this.blessing(); if (b) rows.push({ label: `きょうの ごりやく: ${BLESS[b].name}`, sub: BLESS[b].line });
    // what can be found right now and is still missing from the book
    const m = L.month(), h = L.hour(), now = (s) => s.months.includes(m) && inHours(s.hours, h) && !s.phantom && !st.caught[s.id];
    const miss = [...FISH.filter(now).map((s) => ['🐟', s]), ...BUGS.filter(now).map((s) => ['🦋', s])].sort((a, c) => c[1].rarity - a[1].rarity).slice(0, 6);
    rows.push({ label: miss.length ? 'まだの いきもの' : 'いま 見つかる いきものは ぜんぶ つかまえた!', sub: miss.map(([i, s]) => i + s.name).join('・') });
    await ui.list('案内板', rows);
  }
  async vend() {
    const st = this.st, ui = this.life.ui;
    const k = await ui.list('自動販売機', DRINKS.map((d) => ({ label: `${d.icon} ${d.name}`, sub: `${d.buy} ナギ / ${d.fast ? `のむと ${d.fast}分 はやあし・` : ''}洞窟で ハート${d.heal >= 9 ? 'まんたん' : '+' + d.heal}`, ok: st.money >= d.buy })));
    if (k < 0) return;
    const d = DRINKS[k]; if (st.full()) { ui.toast('ポケットが いっぱい!'); return; }
    st.money -= d.buy; st.add(d.id); st.save(); ui.blip(1200, 0.08, 'square', 0.1); setTimeout(() => ui.blip(300, 0.15, 'triangle', 0.15), 200);
    ui.toast(`ガコン! ${d.name}を 買った`);
  }
  // drinking (from the pocket)
  async drink(i) {
    const L = this.life, st = this.st, id = st.pocket[i], d = ITEMS[id], C = L.cave;
    st.remove(i); st.save(); L.ui.jingle([880, 1047, 1319]);
    if (C?.on) { const before = C.hp; C.hp = Math.min(C.maxHp, C.hp + (d.heal || 1)); C.hearts(); await L.ui.say(null, [`${d.name}を のんだ。ぷはー!`, C.hp > before ? `ハートが ${C.hp - before}つ もどった!` : 'ハートは もう まんたんだ。']); return; }
    if (d.fast) { this.fastUntil = performance.now() + d.fast * 60e3; await L.ui.say(null, [`${d.name}を のんだ。ぷはー!`, `からだが かるい! ${d.fast}分くらい はやく 歩けそう。`]); }
    else await L.ui.say(null, [`${d.name}を のんだ。ほっとする……。`, '洞窟に 持っていくと ハートが もどるよ。']);
  }
  async scope() {
    const L = this.life, st = this.st, ui = L.ui;
    L.anim = { kind: 'show', t: 0, dur: 1 }; setTimeout(() => { if (L.anim?.kind === 'show') L.anim = null; }, 1600);
    if (this.night()) {
      if (!this.once('stars')) { await ui.say(null, ['星が またたいている……。', '流れ星は また あしたの 夜に さがそう。']); return; }
      const clear = L.season?.today?.w !== 'rain' && L.season?.today?.w !== 'snow';
      if (!clear) { await ui.say(null, ['空は くもっていて 星が 見えない……。', 'また あしたの 夜に のぞいてみよう。']); return; }
      const n = L.season?.today?.stars ? 3 : 1 + (Math.random() < 0.5 ? 1 : 0);
      st.mat.star_frag = (st.mat.star_frag || 0) + n; st.save(); ui.jingle([988, 1319, 1568, 1976]);
      await ui.say(null, ['きらっ! 流れ星だ!', `星の 落ちたほうから 「星のかけら」が ${n}こ とどいた!`]);
      return;
    }
    if (!this.once('sea')) { await ui.say(null, ['遠くに 島が 見える。', `${this.bigFish() ? 'まだ 沖に 大きな 影が いる! いまのうちに 釣ろう。' : '沖の 大物は また あした さがそう。'}`]); return; }
    const m = L.month(), h = L.hour(), rare = FISH.filter((s) => s.rarity >= 4 && s.months.includes(m) && inHours(s.hours, h) && !s.phantom);
    this.bigUntil = performance.now() + 10 * 60e3; ui.jingle([523, 784, 1047]);
    await ui.say(null, ['沖を のぞいてみた……。', rare.length ? `大きな 魚の 影が いっぱい! ${pick(rare).name}かも しれない。` : '大きな 魚の 影が いっぱい!', 'これから 10分くらい、大物や めずらしい魚が つれやすいよ。']);
  }
  async bus(b) {
    const L = this.life, ui = L.ui, pl = L.player, dest = [];
    const h = L.home.door; if (h) dest.push({ label: 'ぽっけの家の前', x: h.x, z: h.z + 1.5 });
    const c = L.cave?.door; if (c) dest.push({ label: '洞窟の入口', x: c.x + 1.2, z: c.z });
    this.built('bus_stop').forEach((o, i) => { if (o === b) return; const d = this.B.door(o); dest.push({ label: `バス停 ${i + 1}`, sub: L.app.areaAt?.(d.x, d.z) || '', x: d.x, z: d.z }); });
    if (!dest.length) { await ui.say(null, 'いまは 行けるところが ないみたい。'); return; }
    const k = await ui.list('バスで どこへ 行く?', dest.map((d) => ({ label: d.label, sub: d.sub || '' })));
    if (k < 0) return;
    const d = dest[k]; ui.blip(220, 0.25, 'sawtooth', 0.06); setTimeout(() => ui.blip(330, 0.2, 'triangle', 0.1), 250);
    pl.place(d.x, d.z, pl.yaw); L.app.save?.(); ui.toast(`ブロロロ……「${d.label}」に ついた!`, 1800);
  }
  // the market tent: a different few rare things every day
  tentStock() {
    const r = seeded('tent' + dayKey()), take = (list, n) => { const a = [...list], out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(r() * a.length), 1)[0].id); return out; };
    const shop = new Set(this.life.market?.stock || []);
    return [...take(FURNITURE.filter((f) => f.price >= 1800 && !shop.has(f.id) && ITEMS[f.id]), 3), ...take(CLOTHES.filter((c) => c.price >= 600 && !shop.has(c.id) && ITEMS[c.id]), 2)];
  }
  async tent() {
    const L = this.life, st = this.st, ui = L.ui, sp = { name: 'ルル', color: '#c8603a', pitch: 1.2 };
    const bought = st.daily.perk?.tent || [], stock = this.tentStock(), w = this.wanted();
    const rows = stock.map((id) => ({ label: `${ICON_BY_ID[id] || '🎁'} ${ITEMS[id].name}`, sub: bought.includes(id) ? '売りきれ' : `${ITEMS[id].price.toLocaleString()} ナギ`, ok: !bought.includes(id) && st.money >= ITEMS[id].price }));
    await ui.say(sp, ['いらっしゃい! 旅の 屋台の ルルだよ。', `きょうは ${w.name}が 高く 売れる日! どこで 売っても 1.5ばいだよ。`]);
    const k = await ui.list('屋台テント', rows); if (k < 0) return;
    const id = stock[k]; if (st.full()) { ui.toast('ポケットが いっぱい!'); return; }
    st.money -= ITEMS[id].price; st.add(id); st.daily.perk ||= {}; st.daily.perk.tent = [...bought, id]; st.save(); ui.jingle([523, 659, 784]);
    await ui.say(sp, `まいど! 「${ITEMS[id].name}」、だいじにしてね。`);
  }
  async tea() {
    const L = this.life, st = this.st, ui = L.ui, res = L.social?.residents() || [];
    if (!this.once('tea')) { await ui.say(null, 'あずまやで ひと休み。お茶会は また あした。'); return; }
    if (!res.length) { await ui.say(null, ['ひとりで お茶を のんだ。ほっとする……。', '住人が ふえたら いっしょに お茶会が できそう。']); return; }
    const who = [...res].sort(() => Math.random() - 0.5).slice(0, 3), lines = ['あずまやで お茶会を ひらいた!'];
    const say = ['この お茶、おいしいね!', 'みんなで のむと たのしいね。', 'お茶菓子も あるよ。どうぞ!', '屋根が あると 雨でも へいきだね。', 'また やろうね!'];
    for (const v of who) { st.friend[v.def.id] = (st.friend[v.def.id] || 0) + 2; lines.push(`${v.def.name}「${pick(say)}」`); }
    lines.push(`${who.map((v) => v.def.name).join('・')}と なかよくなった!`);
    await ui.say(null, lines);
    if (Math.random() < 0.5) {
      const gift = pick(FURNITURE.filter((f) => f.price && f.price <= 2400 && ITEMS[f.id]));
      if (gift && st.add(gift.id)) { ui.jingle([659, 784, 988, 1319]); await ui.say(who[0].speaker, `これ、きょうの おれいに。「${gift.name}」だよ!`); }
    }
    st.save();
  }
  async shrine() {
    const L = this.life, st = this.st, ui = L.ui;
    if (st.daily.bless) { await ui.say(null, [`きょうの ごりやくは 「${BLESS[st.daily.bless].name}」。`, BLESS[st.daily.bless].line]); return; }
    const k = pick(Object.keys(BLESS)); st.daily.bless = k; st.save();
    L.anim = { kind: 'dig', t: 0, dur: 0.6 }; ui.blip(660, 0.3, 'sine', 0.15); setTimeout(() => ui.blip(660, 0.3, 'sine', 0.15), 450);
    await ui.say(null, ['パン、パン。(おまいりした)', `ごりやく 「${BLESS[k].name}」を さずかった!`, BLESS[k].line]);
  }
}
