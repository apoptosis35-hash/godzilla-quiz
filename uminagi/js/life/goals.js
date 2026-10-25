// Reasons to come back every day, all paid in しおかぜスタンプ (the town's own point card):
//   - a login bonus that grows over a streak of days (doubled on Sundays)
//   - five daily goals from a pool (catch, talk, sell, craft...), plus a bonus for clearing all five
//   - lifetime achievements in tiers
//   - the stamp exchange at the raccoon's (island tour tickets, a bigger pocket, recipes, rare furniture)
//   - the town's rating (stars) and what a five-star town brings (a Saturday-evening concert, a town flag)
//   - photos from close friends
//   - weekly tournaments on Saturdays (fishing in odd months, bugs in even ones) with trophies
//   - the bay's phantom fish on one day a month, record sizes, big fish and golden bugs
import * as THREE from 'three';
import { toonify } from '../toon.js';
import { ITEMS, ICON_BY_ID, dayKey, seeded } from './state.js';
import { FISH, VILLAGERS } from './data.js';
import { FURNITURE, RECIPES } from './items2.js';
import { PROJECTS } from './progress.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const SP_RACCOON = { name: 'あらた', color: '#4f8a46', pitch: 1.05 };
const SP_HOST = { name: '実況のチャコ', color: '#e07a3a', pitch: 1.25 };
const SP_SINGER = { name: '流しのケイ', color: '#7a6ad8', pitch: 0.95 };

// ---------------------------------------------------------------- items this module adds
ITEMS.ticket = { id: 'ticket', name: '島ツアーチケット', kind: 'ticket', price: 0 }; ICON_BY_ID.ticket = '🎫';
ITEMS.gold_nugget = { id: 'gold_nugget', name: '金のかけら', kind: 'treasure', price: 5000 }; ICON_BY_ID.gold_nugget = '🪙';
ITEMS.furn_town_flag = { id: 'furn_town_flag', name: '海凪の町旗', kind: 'furniture', price: 0, model: 'nobori', w: 0.5, d: 0.5, where: 'out' }; ICON_BY_ID.furn_town_flag = '🎌';
for (const [k, name, icon] of [['gold', '金のトロフィー', '🏆'], ['silver', '銀のトロフィー', '🥈'], ['bronze', '銅のトロフィー', '🥉']]) {
  ITEMS['trophy_' + k] = { id: 'trophy_' + k, name, kind: 'furniture', price: 0, trophy: k, w: 0.4, d: 0.4, where: 'both' }; ICON_BY_ID['trophy_' + k] = icon;
}
for (const v of VILLAGERS) if (v.role === 'resident') registerPhoto(v);
export function registerPhoto(v) {
  ITEMS['photo_' + v.id] = { id: 'photo_' + v.id, name: `${v.name}の写真`, kind: 'furniture', price: 0, photo: v.id, model: 'furn_easel', w: 0.7, d: 0.6, where: 'both' };
  ICON_BY_ID['photo_' + v.id] = '🖼️';
}

// ---------------------------------------------------------------- daily goals and achievements
const GOALS = [
  { ev: 'fish', n: 3, text: '魚を {n}匹 つる', s: 100 }, { ev: 'bug', n: 3, text: '虫を {n}匹 つかまえる', s: 100 },
  { ev: 'talk', n: 3, text: '住人 {n}人と 話す', s: 100 }, { ev: 'sell', n: 5, text: 'お店で {n}こ 売る', s: 80 },
  { ev: 'shake', n: 3, text: '木を {n}本 ゆする', s: 60 }, { ev: 'dig', n: 2, text: 'ヒビを {n}回 ほる', s: 80 },
  { ev: 'pick', n: 5, text: '浜辺や 地面で {n}こ ひろう', s: 80 }, { ev: 'craft', n: 1, text: 'DIYで {n}つ 作る', s: 100 },
  { ev: 'gift', n: 1, text: '住人に プレゼントする', s: 100 }, { ev: 'wood', n: 3, text: '木材を {n}つ あつめる', s: 80 },
  { ev: 'rock', n: 3, text: '岩を {n}回 たたく', s: 60 }, { ev: 'place', n: 1, text: '家具を {n}つ 置く', s: 60 },
  { ev: 'plant', n: 1, text: 'なにかを 植える', s: 80 }, { ev: 'sea', n: 1, text: '磯で 海の生きものを とる', s: 80 },
];
const DAILY_N = 5, ALL_BONUS = 300;
const ACHIEVE = [
  { ev: 'fish', name: '釣り人', unit: '匹', tiers: [10, 50, 200, 500, 1000] }, { ev: 'bug', name: '虫とり名人', unit: '匹', tiers: [10, 50, 200, 500, 1000] },
  { ev: 'sell', name: 'あきない上手', unit: 'こ', tiers: [20, 100, 500, 2000] }, { ev: 'talk', name: '人気者', unit: '回', tiers: [10, 50, 200, 500] },
  { ev: 'craft', name: 'DIY職人', unit: 'こ', tiers: [5, 20, 100, 300] }, { ev: 'donate', name: '資料館の友', unit: '点', tiers: [5, 20, 60, 120] },
  { ev: 'big', name: '大物ハンター', unit: '匹', tiers: [1, 5, 20, 50] }, { ev: 'login', name: '海凪の常連', unit: '日', tiers: [3, 7, 30, 100, 365] },
  { ev: 'goalsDone', name: 'がんばりや', unit: '回', tiers: [5, 30, 100, 300] }, { ev: 'tour', name: '島めぐり', unit: '回', tiers: [1, 5, 20, 50] },
];
const TIER_STAMPS = [100, 300, 500, 1000, 2000];
const LOGIN = [50, 100, 150, 200, 250, 300, 500];

// the stamp exchange
const EXCHANGE = [
  { id: 'ticket', name: '島ツアーチケット', cost: 2000, sub: '船で 毎回ちがう 島へ' },
  { id: 'pocket', name: 'ポケットを ひろげる', cost: 5000, sub: '+10ます (2回まで)' },
  { id: 'recipe', name: 'DIYレシピ', cost: 800, sub: 'まだ知らない レシピを ひとつ' },
  { id: 'rare', name: 'めずらしい家具', cost: 1500, sub: 'お店では 見かけない 家具' },
  { id: 'kit_bench', name: 'ベンチキット', cost: 600, sub: 'すきな場所に 建てられる' },
  { id: 'kit_street_light', name: '街灯キット', cost: 900, sub: 'すきな場所に 建てられる' },
];

const fishLen = (sp) => [0, 12, 22, 35, 55, 80, 120][sp.size || 3];

export class Goals {
  constructor(life) {
    this.life = life; this.st = life.st;
    const g = this.st.ext.goals ||= {};
    g.stamps ||= 0; g.total ||= {}; g.tier ||= {}; g.records ||= {}; g.photos ||= {}; g.streak ||= 0;
    this.g = g;
    this.today();
  }
  // ---------------------------------------------------------------- the day: goals, login bonus, phantom day
  today() {
    const k = dayKey(), g = this.g;
    if (g.day === k) return;
    const r = seeded('goals' + k), pool = GOALS.filter((x) => x.ev !== 'sea' || this.life.has?.('beach') !== false);
    const pickd = []; const a = [...pool]; while (pickd.length < DAILY_N && a.length) pickd.push(a.splice(Math.floor(r() * a.length), 1)[0]);
    g.daily = pickd.map((x) => ({ ev: x.ev, n: x.n, s: x.s, text: x.text.replace('{n}', x.n), got: 0, done: false }));
    g.allDone = false;
    // login streak: yesterday's key continues it
    const y = dayKey(new Date(Date.now() - 24 * 3600e3));
    g.streak = g.last === y ? g.streak + 1 : 1; g.last = k; g.day = k; g.bonusShown = false;
    this.st.save();
  }
  phantomDay(d = new Date(Date.now() - 5 * 3600e3)) { return d.getDate() === 1 + Math.floor(seeded('nushi' + d.getFullYear() + '-' + d.getMonth())() * 27); }
  // shown once a day, a little after starting (or after the overnight announcements)
  async loginBonus() {
    const g = this.g; if (g.bonusShown || !this.st.intro) return;
    g.bonusShown = true;
    const sunday = new Date(Date.now() - 5 * 3600e3).getDay() === 0;
    const n = LOGIN[Math.min(g.streak, LOGIN.length) - 1] * (sunday ? 2 : 1);
    this.add(n, false); this.count('login');
    const lines = [`きょうの ログインボーナス! しおかぜスタンプを ${n}こ もらった。${g.streak > 1 ? `\n(${g.streak}日 れんぞく${sunday ? '・日曜は 2ばい' : ''})` : sunday ? '\n(日曜は 2ばい)' : ''}`];
    if (g.streak % 7 === 0) { const rid = this.life.craft.newRecipe(); if (rid) { this.life.craft.learn(rid); lines.push(`${g.streak}日 れんぞくの ごほうび! 「${ITEMS[rid].name}」の DIYレシピを おぼえた!`); } }
    lines.push('📒 スタンプ帳に きょうの 目標が のっているよ。');
    if (this.phantomDay()) lines.push('……うわさでは、きょうは 夕方から 沖に とても大きな 影が 出るらしい。');
    if (this.tourneyToday()) lines.push(`きょうは 土曜日! キャンプで ${this.tourneyKind() === 'fish' ? '釣り大会' : '虫とり大会'}を やっているよ。`);
    this.life.ui.jingle([784, 988, 1175]);
    await this.life.ui.say(null, lines);
    if (this.rating().n >= 5 && !g.five) await this.ratingTalk(SP_RACCOON);
  }
  // ---------------------------------------------------------------- stamps and events
  add(n, toast = true) { this.g.stamps += n; this.st.save(); if (toast) this.life.ui.toast(`しおかぜスタンプ +${n}`, 1600); }
  count(ev, n = 1) { const t = this.g.total; t[ev] = (t[ev] || 0) + n; this.checkTier(ev); }
  // something happened in the game (life.emit)
  on(ev, n = 1) {
    this.today();
    this.count(ev, n);
    for (const d of this.g.daily) {
      if (d.done || d.ev !== ev) continue;
      d.got = Math.min(d.n, d.got + n);
      if (d.got >= d.n) { d.done = true; this.add(d.s, false); this.life.ui.toast(`目標たっせい! 「${d.text}」 スタンプ +${d.s}`, 2600); this.life.ui.jingle([880, 1175]); this.count('goalsDone'); }
    }
    if (!this.g.allDone && this.g.daily.every((d) => d.done)) { this.g.allDone = true; this.add(ALL_BONUS, false); setTimeout(() => this.life.ui.toast(`きょうの目標 ぜんぶ たっせい! ボーナス +${ALL_BONUS}`, 3000), 2800); }
    if (this.contest && ev === this.contest.kind) { this.contest.n += n; this.life.ui.toast(`${this.contest.n}${this.contest.kind === 'fish' ? '匹' : '匹'}目!`, 1000); }
    this.st.save();
  }
  checkTier(ev) {
    const a = ACHIEVE.find((x) => x.ev === ev); if (!a) return;
    const have = this.g.total[ev] || 0, t = this.g.tier[ev] || 0;
    if (t < a.tiers.length && have >= a.tiers[t]) {
      this.g.tier[ev] = t + 1; const s = TIER_STAMPS[t] || 2000; this.add(s, false);
      setTimeout(() => { this.life.ui.toast(`🏅 たっせい「${a.name} ${'★'.repeat(t + 1)}」 スタンプ +${s}`, 3200); this.life.ui.jingle([659, 880, 1175, 1568]); }, 1200);
    }
  }
  // ---------------------------------------------------------------- catches: sizes, big ones, golden bugs
  // extra lines for a catch (life.got), and the stamps for it
  catchLines(sp, kind, extra = {}) {
    const lines = [];
    if (kind === 'fish') {
      const big = !!extra.big, cm = Math.round(fishLen(sp) * (0.75 + Math.random() * 0.5) * (big ? 1.35 + Math.random() * 0.35 : 1) * 10) / 10;
      const best = this.g.records[sp.id] || 0;
      lines.push(`大きさは ${cm}cm${cm > best ? (best ? ` ……自己ベスト! (まえは ${best}cm)` : '') : `(さいこうは ${best}cm)`}`);
      if (cm > best) this.g.records[sp.id] = cm;
      if (big) { lines.unshift('こ、これは…… 大物だ!!'); this.add(150); this.count('big'); }
      if (sp.phantom) { this.add(1000); lines.push('しおかぜスタンプ +1000!'); }
    }
    if (kind === 'bug' && extra.gold) {
      lines.unshift(`金色に かがやく ${sp.name}だ!`);
      if (!this.st.full()) { this.st.add('gold_nugget'); lines.push('からだから 金のかけらが こぼれおちた!'); }
      this.add(300);
    }
    this.st.save();
    return lines;
  }
  // the phantom fish only bites on its day
  allowFish(sp) { return !sp.phantom || this.phantomDay(); }
  // ---------------------------------------------------------------- the stamp book (HUD 📒)
  book() {
    const ui = this.life.ui, g = this.g, wrap = document.createElement('div'); wrap.className = 'book stampbook';
    const stars = this.rating();
    const row = (a, b, done) => `<div class="srow${done ? ' done' : ''}"><span>${a}</span><b>${b}</b></div>`;
    let h = `<p class="pnote">しおかぜスタンプ <b style="font-size:18px">${g.stamps.toLocaleString()}</b>こ　ログイン ${g.streak}日れんぞく</p>`;
    h += `<p class="pnote">町の評判 <span class="stars">${'★'.repeat(stars.n)}${'☆'.repeat(5 - stars.n)}</span>　${stars.hint}</p>`;
    h += '<h4>きょうの目標</h4>' + g.daily.map((d) => row(`${d.done ? '✅' : '⬜'} ${d.text}`, `${d.got}/${d.n}　+${d.s}`, d.done)).join('') + row(`${g.allDone ? '✅' : '⬜'} ぜんぶ たっせい`, `+${ALL_BONUS}`, g.allDone);
    if (this.contest) h += `<p class="pnote">🏁 大会ちゅう: あと ${Math.max(0, Math.ceil(this.contest.t))}秒 / ${this.contest.n}匹</p>`;
    h += '<h4>たっせいメダル</h4>' + ACHIEVE.map((a) => { const t = g.tier[a.ev] || 0, have = g.total[a.ev] || 0, next = a.tiers[t]; return row(`${a.name} ${'★'.repeat(t)}${'☆'.repeat(a.tiers.length - t)}`, next ? `${have}/${next}${a.unit}` : 'コンプリート!', !next); }).join('');
    const rec = Object.entries(g.records).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (rec.length) h += '<h4>魚の大きさ きろく</h4>' + rec.map(([id, cm]) => row(ITEMS[id]?.name || id, `${cm}cm`)).join('');
    h += '<p class="pnote">スタンプは あらたの お店の 「スタンプ交換」で 使えるよ。</p>';
    wrap.innerHTML = h;
    return ui.panel('📒 スタンプ帳', wrap);
  }
  async exchange(sp) {
    const st = this.st, g = this.g, ui = this.life.ui;
    const rows = EXCHANGE.map((x) => ({ label: x.name, sub: `${x.cost.toLocaleString()} スタンプ　${x.sub}`, ok: g.stamps >= x.cost && (x.id !== 'pocket' || (st.ext.pocketUp || 0) < 2) }));
    const i = await ui.list(`スタンプ交換 (もっている: ${g.stamps.toLocaleString()})`, rows);
    if (i < 0) return 'ほかに なにか あるかい?';
    const x = EXCHANGE[i];
    if (x.id !== 'pocket' && x.id !== 'recipe' && st.full()) return 'ポケットが いっぱいだよ!';
    if (x.id === 'pocket') { st.ext.pocketUp = (st.ext.pocketUp || 0) + 1; }
    else if (x.id === 'recipe') { const rid = this.life.craft.newRecipe(); if (!rid) return 'いまの季節に 教えられる レシピは もう ないみたい。'; this.life.craft.learn(rid); g.stamps -= x.cost; st.save(); ui.jingle(); return `「${ITEMS[rid].name}」の 作り方だよ! DIYで 作ってみてね。`; }
    else if (x.id === 'rare') { const f = pick(FURNITURE.filter((q) => q.price >= 3000)); st.add(f.id); g.stamps -= x.cost; st.save(); ui.jingle([784, 988]); return `まいど! 「${f.name}」だよ。めったに 入らない 品なんだ!`; }
    else st.add(x.id);
    g.stamps -= x.cost; st.save(); ui.jingle([784, 988]);
    return x.id === 'pocket' ? `ポケットが ${st.cap()}ますに ひろがった!` : `まいど! 「${x.name}」だよ。${x.id === 'ticket' ? '\n港の 船長に 見せると 島へ 連れていってくれるよ。' : ''}`;
  }
  // ---------------------------------------------------------------- the town's rating
  rating() {
    const L = this.life, st = this.st;
    const residents = L.villagers.filter((v) => v.def.role === 'resident').length;
    const builds = (st.ext.builds || []).filter((b) => b.day !== dayKey()).length;
    const furn = (st.ext.furn || []).filter((f) => !f.in).length;
    const plants = (st.ext.plants || []).length;
    const works = PROJECTS.filter((p) => L.has(p.id)).length;
    const don = Object.keys(st.donated).length;
    const parts = [
      ['住人', Math.min(10, residents) * 8, '住人を ふやそう(家の土地を 用意すると 引っこしてくるよ)'],
      ['しせつ', Math.min(10, builds) * 6, 'ベンチや 街灯などの しせつを 建てよう'],
      ['外の家具', Math.min(20, furn) * 2, '外にも 家具を 置いてみよう'],
      ['花と木', Math.min(40, plants) * 1, '花や 木を 植えよう'],
      ['町の工事', works * 6, '町づくりで 工事を たのもう'],
      ['資料館', Math.min(30, Math.round(don * 0.3)), '資料館に 寄贈しよう'],
    ];
    const score = parts.reduce((a, p) => a + p[1], 0), n = score < 40 ? 1 : score < 80 ? 2 : score < 130 ? 3 : score < 190 ? 4 : 5;
    const weak = parts.map((p, i) => [p[1] / [80, 60, 40, 40, 54, 30][i], p[2]]).sort((a, b) => a[0] - b[0])[0][1];
    return { n, score, hint: n >= 5 ? 'すばらしい町!' : weak };
  }
  async ratingTalk(sp) {
    const r = this.rating(), g = this.g;
    const lines = [`いまの 町の評判は…… ${'★'.repeat(r.n)}${'☆'.repeat(5 - r.n)}`, r.n >= 5 ? 'さいこうの 町だよ! みんな くらしやすいって 言ってる!' : `もっと よくするなら……\n${r.hint}。`];
    if (r.n >= 5 && !g.five) {
      g.five = dayKey(); if (!this.st.full()) this.st.add('furn_town_flag');
      lines.push('★5の おいわいに、これを どうぞ! 「海凪の町旗」だよ。', 'それから うわさを 聞いた 流しの 歌い手が、\n毎週 土曜の夜に キャンプへ 来てくれるって!');
      this.st.save(); this.life.ui.jingle([523, 659, 784, 1047, 1319]);
    }
    await this.life.ui.say(sp, lines);
  }
  // ---------------------------------------------------------------- friendship photos
  // after a chat: a close friend gives their photo once
  async afterChat(v) {
    const id = v.def.id, f = this.st.friend[id] || 0, item = 'photo_' + id;
    if (f < 12 || this.g.photos[id] || !ITEMS[item]) return;
    if (this.st.full()) return;
    this.g.photos[id] = dayKey(); this.st.add(item); this.st.save(); this.life.ui.jingle([659, 784, 988, 1319]);
    await this.life.ui.say(v.speaker, [`ねえ、ぽっけ。いつも ありがとう。`, `これ……ボクの 写真。もらってくれる?`.replace('ボク', v.def.personality === 'genki' || v.def.personality === 'futsuu' ? 'わたし' : 'ボク'), `${v.def.name}の 写真を もらった!`]);
  }
  photoTexture(id) {
    const v = VILLAGERS.find((x) => x.id === id), cv = document.createElement('canvas'); cv.width = 320; cv.height = 240;
    const g = cv.getContext('2d'), sp = this.life.villagers.find((x) => x.def.id === id)?.speaker, col = sp?.color || '#8ac';
    const gr = g.createLinearGradient(0, 0, 0, 240); gr.addColorStop(0, col); gr.addColorStop(1, '#fff6e0'); g.fillStyle = gr; g.fillRect(0, 0, 320, 240);
    g.font = '120px serif'; g.textAlign = 'center'; g.fillText({ ねこ: '🐱', うさぎ: '🐰', くま: '🐻', ペンギン: '🐧', かえる: '🐸', りす: '🐿️', ライオン: '🦁', キリン: '🦒', おさる: '🐵', ワニ: '🐊', ゾウ: '🐘', ひよこ: '🐤', カバ: '🦛' }[v?.species] || '😊', 160, 150);
    g.fillStyle = '#4a3a22'; g.font = 'bold 26px sans-serif'; g.fillText(`${v?.name || ''}より`, 160, 210);
    g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(5, 5, 310, 230);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // furniture models made here: trophies (a cup on a plinth)
  trophyObject(kind) {
    const col = { gold: 0xe8b830, silver: 0xd0d4dc, bronze: 0xc0763a }[kind], m = new THREE.MeshStandardMaterial({ color: col, metalness: 0.85, roughness: 0.25 });
    const base = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.6 }), g = new THREE.Group();
    const add = (geo, mat, y) => { const o = new THREE.Mesh(geo, mat); o.position.y = y; o.castShadow = true; g.add(o); };
    add(new THREE.BoxGeometry(0.26, 0.1, 0.26), base, 0.05);
    add(new THREE.CylinderGeometry(0.03, 0.05, 0.14, 12), m, 0.17);
    add(new THREE.LatheGeometry([[0.02, 0], [0.09, 0.04], [0.12, 0.14], [0.13, 0.24], [0.12, 0.25]].map(([x, y]) => new THREE.Vector2(x, y)), 18), m, 0.24);
    for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14, Math.PI), m); h.position.set(s * 0.13, 0.42, 0); h.rotation.z = -s * Math.PI / 2; g.add(h); }
    return g;
  }
  // ---------------------------------------------------------------- Saturday tournaments
  tourneyToday() { const d = new Date(Date.now() - 5 * 3600e3), h = new Date().getHours(); return d.getDay() === 6 && h >= 9 && h < 18; }
  tourneyKind() { return (new Date().getMonth() + 1) % 2 ? 'fish' : 'bug'; }
  // the host (and on five-star Saturday nights, the singer) at the camp
  place() {
    const L = this.life;
    for (const o of this.npcs || []) L.root.remove(o.o);
    this.npcs = [];
    if (!L.town.protos.cat) return;
    const put = (x, z, sp, kind, scale) => { const p = L.near(x, z, (a, b) => L.walkable(a, b) && !L.blockedAt(a, b, 1.2), 10); if (!p) return; const o = L.town.clone('cat', p[0], L.ground.height(p[0], p[1]), p[1], 0, true); L.root.attach(o); toonify(o); o.scale.setScalar(scale); this.npcs.push({ o, x: p[0], z: p[1], sp, kind }); };
    if (this.tourneyToday()) put(10, 15, SP_HOST, 'host', 1.6);
    const d = new Date(), sat = new Date(Date.now() - 5 * 3600e3).getDay() === 6;
    if (this.g.five && sat && (d.getHours() >= 18 || d.getHours() < 2)) put(-4, 15, SP_SINGER, 'singer', 1.7);
  }
  target(front) {
    if (this.life.home.inside) return null;
    for (const n of this.npcs || []) if (front(n.x, n.z, 1.7)) return { label: '話す', run: () => (n.kind === 'host' ? this.hostTalk() : this.singerTalk()) };
    return null;
  }
  async hostTalk() {
    const ui = this.life.ui, k = this.tourneyKind(), name = k === 'fish' ? '釣り大会' : '虫とり大会', unit = '匹', day = (this.g.contestDay === dayKey() ? this.g : (this.g.contestDay = dayKey(), this.g.tries = 0, this.g.best = 0, this.g));
    if (this.contest) { await ui.say(SP_HOST, `がんばって! のこり ${Math.ceil(this.contest.t)}秒だよ!`); return; }
    if (this.result != null) {
      const n = this.result; this.result = null;
      const prize = n >= 8 ? 'trophy_gold' : n >= 5 ? 'trophy_silver' : n >= 3 ? 'trophy_bronze' : null, s = n * 60;
      const lines = [`けっかは…… ${n}${unit}!`, n >= 8 ? 'すごい! ゆうしょう だよ!!' : n >= 5 ? 'すばらしい! 準ゆうしょう!' : n >= 3 ? 'いい感じ! 3位 入賞!' : 'こんかいは ざんねん……また ちょうせんしてね!'];
      this.add(s, false); lines.push(`しおかぜスタンプ +${s}`);
      if (prize && !(this.g.prizes ||= {})[dayKey() + prize] && !this.st.full()) { this.g.prizes[dayKey() + prize] = 1; this.st.add(prize); lines.push(`「${ITEMS[prize].name}」を もらった!`); }
      if (n > (day.best || 0)) day.best = n;
      this.st.save(); ui.jingle(n >= 3 ? [523, 659, 784, 1047] : [440, 392]);
      await ui.say(SP_HOST, lines); return;
    }
    const left = 3 - (day.tries || 0);
    if (left <= 0) { await ui.say(SP_HOST, [`きょうの ${name}は 3回まで! さいこう記録は ${day.best || 0}${unit}。`, 'また 来週 あおうね!']); return; }
    const c = await ui.say(SP_HOST, [`はーい! 実況の チャコです! きょうは ${name}の日!`, `3分で ${k === 'fish' ? '魚を つった' : '虫を つかまえた'}数を きそうよ。\n3匹で 銅、5匹で 銀、8匹で 金トロフィー!`, `ちょうせんする? (きょう あと ${left}回)`], ['ちょうせん!', 'あとで']);
    if (c !== 0) return;
    const tool = k === 'fish' ? 'rod' : 'net';
    if (!this.st.has(tool)) { await ui.say(SP_HOST, `${ITEMS[tool].name}を もってないと 出られないよ!`); return; }
    day.tries = (day.tries || 0) + 1; this.st.save();
    this.life.equip(tool);
    await ui.say(SP_HOST, 'よーい…… スタート!');
    this.contest = { kind: k, t: 180, n: 0 }; ui.jingle([880, 880, 1320]);
  }
  async singerTalk() {
    const ui = this.life.ui;
    const c = await ui.say(SP_SINGER, ['やあ。海凪は ほんとうに いい町だね。', '一曲 聞いていくかい?'], ['聞く', 'またこんど']);
    if (c !== 0) return;
    this.life.season.forceFw = 25;   // fireworks while the song plays
    const notes = [523, 587, 659, 784, 659, 587, 523, 440, 523, 587, 659, 523, 784, 880, 784, 659, 587, 523];
    notes.forEach((f, i) => setTimeout(() => ui.blip(f, 0.32, 'triangle', 0.12), i * 340));
    await ui.say(SP_SINGER, ['♪ しおかぜ ふけば ちいさな 港に…… ♪', '♪ あしたも 凪の 海で あおう…… ♪', 'ありがとう。また 土曜の夜に 来るよ。']);
    if (!(this.g.songs ||= {})[dayKey()]) { this.g.songs[dayKey()] = 1; this.add(200); }
  }
  update(dt) {
    if (this.life.season.forceFw > 0) { this.life.season.forceFw -= dt; if (this.life.season.forceFw <= 0) this.life.season.forceFw = 0; }
    for (const n of this.npcs || []) { const pp = this.life.player.pos, want = Math.atan2(pp.x - n.x, pp.z - n.z); if (Math.hypot(pp.x - n.x, pp.z - n.z) < 6) n.o.rotation.y += Math.atan2(Math.sin(want - n.o.rotation.y), Math.cos(want - n.o.rotation.y)) * Math.min(1, dt * 4); }
    const c = this.contest; if (!c) return;
    const before = Math.ceil(c.t); c.t -= dt; const now = Math.ceil(c.t);
    if (before !== now && now > 0 && (now % 30 === 0 || now <= 5)) this.life.ui.toast(`のこり ${now}秒 (${c.n}匹)`, 1200);
    if (c.t <= 0) { this.result = c.n; this.contest = null; this.life.ui.jingle([1320, 880]); this.life.ui.toast(`しゅうりょう! ${c.n}匹 — 実況の チャコに 話しかけよう`, 4000); }
  }
  newDay() { this.today(); this.place(); setTimeout(() => this.loginBonus(), 4000); }
}
void RECIPES;
