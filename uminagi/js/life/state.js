// Island-life save state: money (ナギ), the 20-slot pocket, tools, encyclopedia (caught / donated),
// friendship with each villager and the per-day flags that reset every morning at 5:00.
import { FISH, BUGS, FOSSILS, SHELLS, FRUIT, TOOLS } from './data.js';

const KEY = 'uminagi_life_v1';
export const POCKET = 20;

// every item the player can hold: { id, name, kind, price, ... }
export const ITEMS = {};
for (const f of FISH) ITEMS[f.id] = { ...f, kind: 'fish' };
for (const b of BUGS) ITEMS[b.id] = { ...b, kind: 'bug' };
for (const f of FOSSILS) ITEMS[f.id] = { ...f, kind: 'fossil' };
for (const s of SHELLS) ITEMS[s.id] = { ...s, kind: 'shell' };
ITEMS[FRUIT.id] = { ...FRUIT, kind: 'fruit' };
for (const t of TOOLS) ITEMS[t.id] = { ...t, kind: 'tool' };
ITEMS.fossil_unknown = { id: 'fossil_unknown', name: 'なぞの化石', kind: 'fossil?', price: 100 };
ITEMS.branch = { id: 'branch', name: '木の枝', kind: 'misc', price: 5 };
ITEMS.letter = { id: 'letter', name: '瓶の手紙', kind: 'misc', price: 10 };
export const ICON = { fish: '🐟', bug: '🦋', fossil: '🦴', 'fossil?': '🪨', shell: '🐚', fruit: '🍊', tool: '🧰', misc: '🌿' };
export const TOOL_ICON = { net: '🥅', rod: '🎣', shovel: '⛏️' };
export const icon = (id) => (ITEMS[id]?.kind === 'tool' ? TOOL_ICON[id] : ICON[ITEMS[id]?.kind]) || '❔';
export const donatable = (id) => ['fish', 'bug', 'fossil'].includes(ITEMS[id]?.kind);

// the game day starts at 5:00, like the villagers' morning
export function dayKey(d = new Date()) { const t = new Date(d.getTime() - 5 * 3600e3); return `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`; }
// small seeded random for "today's" layout (dig spots, money rock, shells)
export function seeded(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }

export class LifeState {
  constructor() {
    const s = (() => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } })() || {};
    this.money = s.money ?? 1000;
    this.pocket = s.pocket || [];          // item ids (tools live here too, so they take a slot like in the original games)
    this.tool = s.tool || null;            // the tool in the paw
    this.caught = s.caught || {};          // encyclopedia: id -> first day it was found
    this.donated = s.donated || {};
    this.friend = s.friend || {};          // villager id -> points
    this.met = s.met || {};
    this.intro = !!s.intro;
    this.daily = s.daily || {};            // flags of the current game day
    this.stats = s.stats || { fish: 0, bug: 0, dig: 0, sold: 0 };
    this.lastCatch = s.lastCatch || null;
    this.checkDay();
  }
  checkDay() {
    const k = dayKey();
    if (this.daily.day !== k) { this.daily = { day: k, talked: {}, gift: {}, shaken: {}, dug: {}, picked: {}, rock: 0, fruit: {}, bottle: false }; return true; }
    return false;
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ money: this.money, pocket: this.pocket, tool: this.tool, caught: this.caught, donated: this.donated, friend: this.friend,
        met: this.met, intro: this.intro, daily: this.daily, stats: this.stats, lastCatch: this.lastCatch }));
    } catch { /* private mode */ }
  }
  full() { return this.pocket.length >= POCKET; }
  add(id) {
    if (this.full()) return false;
    this.pocket.push(id);
    const k = ITEMS[id]?.kind;
    if ((k === 'fish' || k === 'bug' || k === 'fossil') && !this.caught[id]) this.caught[id] = dayKey();
    this.save(); return true;
  }
  remove(i) { const id = this.pocket.splice(i, 1)[0]; if (id === this.tool && !this.pocket.includes(id)) this.tool = null; this.save(); return id; }
  has(id) { return this.pocket.includes(id); }
  tools() { return TOOLS.map((t) => t.id).filter((id) => this.has(id)); }
}
