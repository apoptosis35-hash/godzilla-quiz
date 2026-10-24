// Villager life beyond small talk: a daily request ("bring me a fish"), birthdays, villagers chatting with each
// other (speech bubbles), letters in the mailbox from good friends, and going home at night (they can be visited).
import * as THREE from 'three';
import { ITEMS, dayKey, seeded } from './state.js';
import { REQUESTS, BIRTHDAY, CHATS } from './data2.js';
import { FURNITURE } from './items2.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const KINDS = [{ kind: 'fish', name: '魚' }, { kind: 'bug', name: '虫' }, { kind: 'fruit', name: 'みかん' }, { kind: 'shell', name: '貝がら' }, { kind: 'wood', name: '木材' }];

export class Social {
  constructor(life) {
    this.life = life; this.st = life.st; this.chatT = 4;
    this.st.ext.req ||= null;
    this.newDay(true);
  }
  residents() { return this.life.villagers.filter((v) => v.def.role === 'resident'); }
  newDay(first) {
    const st = this.st, k = dayKey(), r = seeded('req' + k);
    const res = this.residents();
    if ((!st.ext.req || st.ext.req.day !== k) && res.length) {
      const v = res[Math.floor(r() * res.length)], it = KINDS[Math.floor(r() * KINDS.length)];
      st.ext.req = { day: k, vid: v.def.id, kind: it.kind, name: it.name, asked: false, done: false };
    }
    // letters from friends (once per day)
    if (st.ext.mailDay !== k) {
      st.ext.mailDay = k;
      for (const v of res) if ((st.friend[v.def.id] || 0) >= 4 && r() < 0.3) this.life.home.letterFrom(v);
    }
    st.save();
    void first;
  }
  birthday(v) { const d = new Date(); return v.def.birthday === `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  // lines before the chat choices: birthdays, today's request
  async opening(v) {
    const st = this.st, P = v.def.personality, vars = (s, x = {}) => s.replace(/\{(\w+)\}/g, (m, k) => ({ name: 'なぎ', phrase: v.def.catchphrase, ...x })[k] ?? m);
    if (this.birthday(v) && st.ext.bdayTalk !== dayKey() + v.def.id) { st.ext.bdayTalk = dayKey() + v.def.id; await this.life.ui.say(v.speaker, (BIRTHDAY[P] || BIRTHDAY.futsuu).self.map((s) => vars(s))); }
    else { const b = this.residents().find((o) => o !== v && this.birthday(o)); if (b && Math.random() < 0.5) await this.life.ui.say(v.speaker, vars(pick(BIRTHDAY.others), { other: b.def.name })); }
    const q = st.ext.req;
    if (q && q.vid === v.def.id && !q.done && !q.asked) { q.asked = true; st.save(); await this.life.ui.say(v.speaker, vars(pick((REQUESTS[P] || REQUESTS.futsuu).ask), { item: q.name })); }
  }
  hasRequest(v) { const q = this.st.ext.req; return q && q.vid === v.def.id && q.asked && !q.done; }
  // hand over the requested thing (from the pocket, or wood from the material bag)
  async deliver(v) {
    const st = this.st, q = st.ext.req, P = v.def.personality, R = REQUESTS[P] || REQUESTS.futsuu;
    const vars = (s, x = {}) => s.replace(/\{(\w+)\}/g, (m, k) => ({ name: 'なぎ', phrase: v.def.catchphrase, ...x })[k] ?? m);
    if (q.kind === 'wood') {
      if ((st.mat.wood || 0) < 1) { await this.life.ui.say(v.speaker, vars(pick(R.wrong))); return; }
      st.mat.wood--;
    } else {
      const i = await this.life.ui.pocket(st, { title: `${v.def.name}に わたす`, filter: (id) => ITEMS[id].kind !== 'tool', note: `${q.name}を わたそう` });
      if (i < 0) return;
      if (ITEMS[st.pocket[i]].kind !== q.kind) { await this.life.ui.say(v.speaker, vars(pick(R.wrong))); return; }
      st.remove(i);
    }
    q.done = true; st.friend[v.def.id] = (st.friend[v.def.id] || 0) + 3;
    const furn = FURNITURE.filter((f) => f.price && f.price <= 3200 && !f.season), gift = Math.random() < 0.5 && !st.full() ? pick(furn).id : null;
    const money = gift ? 0 : 400 + Math.floor(Math.random() * 9) * 100;
    if (gift) st.add(gift); else st.money += money;
    st.save(); this.life.ui.jingle([659, 784, 988, 1319]);
    await this.life.ui.say(v.speaker, [vars(pick(R.thanks), { item: q.name }), gift ? `${ITEMS[gift].name}を もらった!` : `${money.toLocaleString()} ナギ もらった!`]);
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
    const q = this.st.ext.req;
    for (const v of res) {
      const want = q && q.vid === v.def.id && !q.done && !v.chatting;
      if (want && !v.mark) { v.mark = life.textSprite('❗', 0.5); v.mark.position.set(0, 1.35, 0); v.mark.scale.multiplyScalar(1 / v.o.scale.x); v.o.add(v.mark); }
      if (!want && v.mark) { v.o.remove(v.mark); v.mark = null; }
    }
  }
}
