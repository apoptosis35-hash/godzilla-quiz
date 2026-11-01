// Villager life beyond small talk: requests (up to three a day, from different villagers: a particular fish or bug
// in season, any fish / bug / shell, materials, something made at the DIY bench, a dish, or a parcel to carry to
// another villager), birthdays, villagers chatting with each other (speech bubbles), letters in the mailbox from
// good friends, and going home at night (they can be visited).
import * as THREE from 'three';
import { ITEMS, ICON_BY_ID, dayKey, seeded } from './state.js';
import { FISH, BUGS } from './data.js';
import { REQUESTS, BIRTHDAY, CHATS } from './data2.js';
import { FURNITURE, RECIPES } from './items2.js';

ITEMS.parcel = { id: 'parcel', name: 'おとどけもの', kind: 'parcel', price: 0 }; ICON_BY_ID.parcel = '📦';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const KINDS = [{ kind: 'fish', name: '魚' }, { kind: 'bug', name: '虫' }, { kind: 'fruit', name: 'みかん' }, { kind: 'shell', name: '貝がら' }, { kind: 'wood', name: '木材' }];

export class Social {
  constructor(life) {
    this.life = life; this.st = life.st; this.chatT = 4;
    this.st.ext.reqs ||= []; delete this.st.ext.req;
    this.newDay(true);
  }
  residents() { return this.life.villagers.filter((v) => v.def.role === 'resident'); }
  newDay(first) {
    const st = this.st, k = dayKey(), r = seeded('req' + k);
    const res = this.residents();
    if (!st.ext.reqs.length || st.ext.reqs[0].day !== k) st.ext.reqs = this.makeRequests(r, res, k);
    // letters from friends (once per day)
    if (st.ext.mailDay !== k) {
      st.ext.mailDay = k;
      for (const v of res) if ((st.friend[v.def.id] || 0) >= 4 && r() < 0.3) this.life.home.letterFrom(v);
    }
    st.save();
    void first;
  }
  // today's wishes: who asks, for what (a few kinds, from what can be had now), and how many
  makeRequests(r, res, k) {
    const L = this.life, out = [], who = [...res].sort(() => r() - 0.5).slice(0, Math.min(3, res.length));
    const inSeason = (list) => list.filter((sp) => sp.rarity <= 3 && !sp.phantom && sp.months.includes(new Date().getMonth() + 1) && sp.hours.some(([a, b]) => b - a >= 10));
    const known = RECIPES.filter((x) => L.craft?.known(x.id) && ITEMS[x.id]?.kind === 'furniture').map((x) => x.id);
    for (const v of who) {
      const u = r(); let q;
      if (u < 0.25) { const sp = (r() < 0.6 ? inSeason(FISH) : inSeason(BUGS))[Math.floor(r() * 99)] || FISH[0]; q = { kind: 'species', id: sp.id, name: sp.name }; }
      else if (u < 0.45) { const it = KINDS[Math.floor(r() * 4)]; q = { kind: it.kind, name: it.name }; }
      else if (u < 0.62) { const m = ['wood', 'stone', 'branch', 'iron', 'crystal'][Math.floor(r() * (L.st.ext.cave?.trips ? 5 : 3))], n = m === 'iron' || m === 'crystal' ? 1 : 2 + Math.floor(r() * 3); q = { kind: 'mat', id: m, n, name: `${ITEMS[m].name}×${n}` }; }
      else if (u < 0.75 && known.length) { const id = known[Math.floor(r() * known.length)]; q = { kind: 'craft', id, name: ITEMS[id].name }; }
      else if (u < 0.85 && L.st.ext.cooked) { q = { kind: 'dish', name: '手料理' }; }
      else { const to = res.filter((o) => o !== v)[Math.floor(r() * (res.length - 1))]; if (!to) continue; q = { kind: 'parcel', to: to.def.id, toName: to.def.name, name: `${to.def.name}への おとどけもの` }; }
      out.push({ day: k, vid: v.def.id, asked: false, done: false, ...q });
    }
    return out;
  }
  reqFor(v) { return this.st.ext.reqs.find((q) => q.vid === v.def.id && !q.done); }
  parcelFor(v) { return this.st.ext.reqs.find((q) => q.kind === 'parcel' && q.asked && !q.done && q.to === v.def.id && this.st.has('parcel')); }
  birthday(v) { const d = new Date(); return v.def.birthday === `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  // lines before the chat choices: birthdays, today's request
  async opening(v) {
    const st = this.st, P = v.def.personality, vars = (s, x = {}) => s.replace(/\{(\w+)\}/g, (m, k) => ({ name: 'ぽっけ', phrase: v.def.catchphrase, ...x })[k] ?? m);
    if (this.birthday(v) && st.ext.bdayTalk !== dayKey() + v.def.id) { st.ext.bdayTalk = dayKey() + v.def.id; await this.life.ui.say(v.speaker, (BIRTHDAY[P] || BIRTHDAY.futsuu).self.map((s) => vars(s))); }
    else { const b = this.residents().find((o) => o !== v && this.birthday(o)); if (b && Math.random() < 0.5) await this.life.ui.say(v.speaker, vars(pick(BIRTHDAY.others), { other: b.def.name })); }
    const q = this.reqFor(v);
    if (q && !q.asked) {
      if (q.kind === 'parcel') {
        if (st.full()) { await this.life.ui.say(v.speaker, [`${q.toName}に とどけてほしい ものが あるんだけど……`, 'ポケットが いっぱいみたいだね。あけてから また 来て。']); return; }
        q.asked = true; st.add('parcel'); st.save();
        await this.life.ui.say(v.speaker, [`ねえ ぽっけ、これを ${q.toName}に とどけてくれる? ${v.def.catchphrase}`, '「おとどけもの」を あずかった!']);
        return;
      }
      q.asked = true; st.save();
      const extra = q.kind === 'species' ? '\n(いまの 季節と 時間に いるみたい)' : q.kind === 'craft' ? '\n(DIYで 作れるよ)' : '';
      await this.life.ui.say(v.speaker, vars(pick((REQUESTS[P] || REQUESTS.futsuu).ask), { item: q.name }) + extra);
    }
  }
  hasRequest(v) { const q = this.reqFor(v); return !!((q && q.asked && q.kind !== 'parcel') || this.parcelFor(v)); }
  // hand over the requested thing (from the pocket, or wood from the material bag)
  async deliver(v) {
    const st = this.st, P = v.def.personality, R = REQUESTS[P] || REQUESTS.futsuu, ui = this.life.ui;
    const parcel = this.parcelFor(v);
    if (parcel) {   // a parcel from another villager
      st.remove(st.pocket.indexOf('parcel')); parcel.done = true;
      const from = this.residents().find((o) => o.def.id === parcel.vid);
      st.friend[v.def.id] = (st.friend[v.def.id] || 0) + 2; if (from) st.friend[from.def.id] = (st.friend[from.def.id] || 0) + 2;
      const money = 300 + Math.floor(Math.random() * 5) * 100; st.money += money; st.save(); this.life.emit('request'); ui.jingle([659, 784, 988, 1319]);
      await ui.say(v.speaker, [`わあ、${from ? from.def.name : 'だれか'}から? とどけてくれて ありがとう、${v.def.catchphrase}!`, `おだちんに ${money.toLocaleString()} ナギ もらった!`]);
      return;
    }
    const q = this.reqFor(v);
    const vars = (s2, x = {}) => s2.replace(/\{(\w+)\}/g, (m, k) => ({ name: 'ぽっけ', phrase: v.def.catchphrase, item: q.name, ...x })[k] ?? m);
    if (q.kind === 'mat') {
      if ((st.mat[q.id] || 0) < q.n) { await ui.say(v.speaker, [vars(pick(R.wrong)), `(${q.name} が いるよ。いまは ${st.mat[q.id] || 0}こ)`]); return; }
      st.mat[q.id] -= q.n;
    } else {
      const ok = (id) => (q.kind === 'species' || q.kind === 'craft' ? id === q.id : q.kind === 'dish' ? ITEMS[id]?.kind === 'dish' : ITEMS[id]?.kind === q.kind);
      const i = await ui.pocket(st, { title: `${v.def.name}に わたす`, filter: (id) => ITEMS[id].kind !== 'tool', note: `${q.name}を わたそう` });
      if (i < 0) return;
      if (!ok(st.pocket[i])) { await ui.say(v.speaker, vars(pick(R.wrong))); return; }
      st.remove(i);
    }
    q.done = true; st.friend[v.def.id] = (st.friend[v.def.id] || 0) + 3;
    // harder wishes pay better
    const worth = { species: 1.6, craft: 1.8, dish: 1.5, mat: 1.1 }[q.kind] || 1;
    const furn = FURNITURE.filter((f) => f.price && f.price <= 3200 * worth && !f.season), gift = Math.random() < 0.45 && !st.full() ? pick(furn).id : null;
    const money = gift ? 0 : Math.round((400 + Math.floor(Math.random() * 9) * 100) * worth / 10) * 10;
    if (gift) st.add(gift); else st.money += money;
    st.save(); this.life.emit('request'); ui.jingle([659, 784, 988, 1319]);
    await ui.say(v.speaker, [vars(pick(R.thanks), { item: q.name }), gift ? `${ITEMS[gift].name}を もらった!` : `${money.toLocaleString()} ナギ もらった!`]);
  }
  // a bubble with a short line over a villager's head
  bubble(v, text) {
    if (v.bubble) v.o.remove(v.bubble);
    const s = this.life.textSprite(text, 0.9, 420); s.position.set(0, 1.55, 0); s.scale.multiplyScalar(1 / v.o.scale.x); v.o.add(s); v.bubble = s;
  }
  night() { const h = new Date().getHours(); return h >= 23 || h < 6; }
  update(dt) {
    const life = this.life, res = this.residents();
    // asleep at home at night (they can still be visited)
    const night = this.night();
    for (const v of res) v.asleep = night && !v.talking && !v.visiting;
    // two idle villagers close together chat for a few seconds
    this.chatT -= dt;
    for (const v of res) if (v.chatting) {
      v.chatting.t -= dt;
      const c = v.chatting, want = Math.atan2(c.with.o.position.x - v.o.position.x, c.with.o.position.z - v.o.position.z);
      v.o.rotation.y += Math.atan2(Math.sin(want - v.o.rotation.y), Math.cos(want - v.o.rotation.y)) * Math.min(1, dt * 5); v.wait = Math.max(v.wait, 0.5);
      if (c.t < 3 && c.first && !c.second) { c.second = true; this.bubble(c.with, c.lines[1]); if (v.bubble) v.bubble.visible = false; }
      if (c.t <= 0 || v.talking) { v.chatting = null; for (const o of [v, c.with]) if (o.bubble) { o.o.remove(o.bubble); o.bubble = null; } }
    }
    if (this.chatT <= 0) {
      this.chatT = 6;
      for (const a of res) for (const b of res) {
        if (a === b || a.chatting || b.chatting || a.talking || b.talking || a.asleep || !a.o.visible || !b.o.visible) continue;
        if (a.o.position.distanceTo(b.o.position) > 3.2 || Math.random() > 0.5) continue;
        const pair = pick(CHATS), fill = (s, o) => s.replace(/\{other\}/g, o.def.name);
        a.chatting = { with: b, t: 6, lines: [fill(pair[0], b), fill(pair[1], a)], first: true }; b.chatting = { with: a, t: 6, lines: [], first: false };
        this.bubble(a, a.chatting.lines[0]); a.target = null; b.target = null; a.wait = 6; b.wait = 6;
        life.ui.blip(900, 0.04, 'sine', 0.05);
      }
    }
    // the request mark over the asking villager's head
    for (const v of res) {
      const q = this.reqFor(v), sym = v.chatting ? null : this.parcelFor(v) ? '📦' : q && !q.asked ? '❗' : null;
      if (v.mark && v.markSym !== sym) { v.o.remove(v.mark); v.mark = null; }
      if (sym && !v.mark) { v.mark = life.textSprite(sym, 0.5); v.mark.position.set(0, 1.35, 0); v.mark.scale.multiplyScalar(1 / v.o.scale.x); v.o.add(v.mark); v.markSym = sym; }
    }
  }
}
