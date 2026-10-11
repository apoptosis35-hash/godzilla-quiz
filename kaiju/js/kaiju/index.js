// Roster: fully playable kaiju + locked (in development) slots. Locked slots cannot be selected.
import gorvath from './gorvath.js';
import vespera from './vespera.js';
import trivern from './trivern.js';
import kurogane from './kurogane.js';
import ragnos from './ragnos.js';
import vorthar from './vorthar.js';
import mutagon from './mutagon.js';
import primordon from './primordon.js';

export const ROSTER = [gorvath, ragnos, vorthar, mutagon, primordon, vespera, trivern, kurogane];

// Alternate colour schemes: map of original material colour -> replacement (applied after build).
const PALETTES = {
  gorvath: [
    { label: 'オリジナル' },
    { label: '蒼白', map: { 0xc39cff: 0xd0ecff, 0x8a4dff: 0x3aa0ff, 0xff7a20: 0x40a8ff, 0xffe4a8: 0xe0f4ff, 0xb090ff: 0x90d0ff, 0x353d36: 0x2e3438 } },
    { label: '紅蓮', map: { 0xc39cff: 0xffc8a8, 0x8a4dff: 0xff4a10, 0xff7a20: 0xff3010, 0xb090ff: 0xffa070, 0x353d36: 0x2c2422 } },
  ],
  vespera: [
    { label: 'オリジナル' },
    { label: '密林', map: { 0x1f7a3c: 0x3c8a1c, 0x8a1420: 0xb81818 } },
    { label: '妖紫', map: { 0x1f7a3c: 0x3a1f6a, 0x8a1420: 0xd0a020 } },
  ],
  trivern: [
    { label: 'オリジナル' },
    { label: 'ブロンズ', map: { 0xc8982e: 0x6b4a26, 0xa8781e: 0x5a2e14, 0xfff0b0: 0xe0c070, 0xff5a18: 0x60ff40, 0xffd040: 0x90ff60 } },
    { label: '漆黒', map: { 0xc8982e: 0x26262c, 0xa8781e: 0x301818, 0xff5a18: 0xff3020 } },
  ],
  ragnos: [
    { label: 'オリジナル' },
    { label: '灼熱', map: { 0x2a7cff: 0xff5a10, 0xe0f4ff: 0xffe0b0, 0x9fc8ff: 0xffa060, 0xe4e8ee: 0xe8d8cc, 0x3a9cff: 0xff6a20 } },
    { label: '灰燼', map: { 0x2a2b2c: 0x5a5856, 0x2a7cff: 0x50e0ff } },
  ],
  vorthar: [
    { label: 'オリジナル' },
    { label: '紅蓮', map: { 0x60b0ff: 0xff4818, 0xe9e3d2: 0xd8c8c0 } },
    { label: '黒鉄', map: { 0x2a2c2c: 0x18181c, 0xe9e3d2: 0x70747c } },
  ],
  mutagon: [
    { label: 'オリジナル' },
    { label: '暗紅', map: { 0x3a2622: 0x2a1414, 0xa040ff: 0xff3060, 0xffc8ff: 0xffd0d8 } },
    { label: '凍結', map: { 0x3a2622: 0x5a6670, 0xff3010: 0x40c0ff, 0xa040ff: 0x60e0ff, 0xffc8ff: 0xe0ffff } },
  ],
  primordon: [
    { label: 'オリジナル' },
    { label: 'モノクロ', map: { 0x48484a: 0x3a3a3a, 0xd8d2c4: 0xe8e8e8, 0xffb040: 0xffffff } },
    { label: '深緑', map: { 0x48484a: 0x2e3a2c, 0xd8d2c4: 0xc8c0a0 } },
  ],
  kurogane: [
    { label: 'オリジナル' },
    { label: '銀黒', map: { 0xdfe3ea: 0xc9ced6, 0x3c4048: 0x23262c } },
    { label: 'ガンメタル', map: { 0xdfe3ea: 0x70747c, 0x3c4048: 0x161618, 0xd4a640: 0xc03020 } },
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
  { id: 'l10', name: '???', type: '深海怪獣' },
];
export function byId(id) { return ROSTER.find((d) => d.id === id); }
