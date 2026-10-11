// Roster: fully playable kaiju + locked (in development) slots. Locked slots cannot be selected.
import gorvath from './gorvath.js';
import vespera from './vespera.js';
import trivern from './trivern.js';
import kurogane from './kurogane.js';

export const ROSTER = [gorvath, vespera, trivern, kurogane];

// Alternate colour schemes: map of original material colour -> replacement (applied after build).
const PALETTES = {
  gorvath: [
    { label: 'オリジナル' },
    { label: '蒼白', map: { 0xd4c6ff: 0xd0ecff, 0x8a4dff: 0x3aa0ff, 0xe8d8ff: 0xe0f4ff, 0x9a60ff: 0x50b0ff, 0xb090ff: 0x90d0ff, 0x3b403b: 0x2e3438 } },
    { label: '紅蓮', map: { 0xd4c6ff: 0xffc8a8, 0x8a4dff: 0xff4a10, 0xe8d8ff: 0xffe0c0, 0x9a60ff: 0xff6020, 0xb090ff: 0xffa070, 0x3b403b: 0x2c2422 } },
  ],
  vespera: [
    { label: 'オリジナル' },
    { label: '密林', map: { 0x1f7a3c: 0x3c8a1c, 0x8a1420: 0xb81818 } },
    { label: '妖紫', map: { 0x1f7a3c: 0x3a1f6a, 0x8a1420: 0xd0a020 } },
  ],
  trivern: [
    { label: 'オリジナル' },
    { label: '黄金', map: { 0x6b4a26: 0xc8982e, 0x5a2e14: 0xa8781e, 0xe0c070: 0xfff0b0 } },
    { label: '漆黒', map: { 0x6b4a26: 0x26262c, 0x5a2e14: 0x301818, 0x60ff40: 0xff3020, 0x90ff60: 0xff4030 } },
  ],
  kurogane: [
    { label: 'オリジナル' },
    { label: '白銀', map: { 0xc9ced6: 0xf2f2f4, 0x23262c: 0x34507a } },
    { label: 'ガンメタル', map: { 0xc9ced6: 0x70747c, 0x23262c: 0x161618, 0xd4a640: 0xc03020 } },
  ],
};
function applyPalette(model, p) {
  if (!p || !p.map) return;
  const swap = (c) => { if (c && c.isColor && p.map[c.getHex()] !== undefined) c.setHex(p.map[c.getHex()]); };
  const seen = new Set();
  model.root.traverse((o) => {
    if (o.isLight) swap(o.color);
    if (!o.material || seen.has(o.material)) return;
    seen.add(o.material);
    swap(o.material.color); swap(o.material.emissive); swap(o.material.sheenColor);
  });
  for (const c of model.glowColors || []) swap(c);
}
for (const d of ROSTER) {
  d.palettes = PALETTES[d.id] || [{ label: 'オリジナル' }];
  const build = d.build;
  d.build = (q, o = {}) => { const m = build(q, o); if (o.alt && !o.boss) applyPalette(m, d.palettes[o.alt]); return m; };
  d._orig = { name: d.name, jp: d.jp };
}
// Player-defined display names (stored only on the player's own device).
export function applyCustomNames(names = {}) {
  for (const d of ROSTER) {
    const n = names[d.id] || {};
    const clean = (v) => String(v || '').replace(/[<>&"']/g, '').trim().slice(0, 24);
    d.name = clean(n.name) || d._orig.name;
    d.jp = clean(n.jp) || d._orig.jp;
  }
}

export const LOCKED = [
  { id: 'l1', name: '???', type: '宇宙結晶怪獣' },
  { id: 'l2', name: '???', type: '微小体融合怪獣' },
  { id: 'l3', name: '???', type: 'サイボーグ怪獣' },
  { id: 'l4', name: '???', type: '巨大蛾怪獣' },
  { id: 'l5', name: '???', type: '植物融合怪獣' },
  { id: 'l6', name: '???', type: '甲殻装甲怪獣' },
  { id: 'l7', name: '???', type: '翼竜型怪獣' },
  { id: 'l8', name: '???', type: '再生細胞怪獣' },
  { id: 'l9', name: '???', type: '古代原種怪獣' },
  { id: 'l10', name: '???', type: '深海怪獣' },
  { id: 'l11', name: '???', type: '雷撃怪獣' },
  { id: 'l12', name: '???', type: '第四形態変異体' },
];
export function byId(id) { return ROSTER.find((d) => d.id === id); }
