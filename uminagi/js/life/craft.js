// DIY: materials (branches, wood, stone, iron, star fragments, snowflakes) in a bag beside the pocket, recipes
// learnt from the start, from bottles and from villagers, crafting at a workbench (or at the raccoon's stall),
// tools that wear out, chopping wood with the axe and breaking stones off rocks with the shovel.
import { ITEMS, dayKey } from './state.js';
import { RECIPES, MATERIALS } from './items2.js';
import { RACCOON } from './data2.js';

// uses before a tool breaks: shop tools, and the flimsy ones made from branches
export const DURABILITY = { net: 30, rod: 30, shovel: 40, axe: 100 };
export const FLIMSY = { net: 10, rod: 10, shovel: 40, axe: 40 };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Craft {
  constructor(life) {
    this.life = life; this.st = life.st;
    this.st.ext.recipes ||= RECIPES.filter((r) => r.known).map((r) => r.id);
    this.st.ext.dur ||= {};
  }
  known(id) { return this.st.ext.recipes.includes(id); }
  learn(id) { if (!id || this.known(id)) return false; this.st.ext.recipes.push(id); this.st.save(); return true; }
  // an unknown recipe for this season (bottles, villagers)
  newRecipe() {
    const m = new Date().getMonth() + 1;
    const pool = RECIPES.filter((r) => !this.known(r.id) && (!r.season || r.season.includes(m)));
    return pool.length ? pick(pool).id : null;
  }
  matText(req) { return Object.entries(req).map(([k, n]) => `${ITEMS[k].name}${n}`).join('・'); }
  async menu() {
    const st = this.st, ui = this.life.ui, m = new Date().getMonth() + 1;
    const list = RECIPES.filter((r) => this.known(r.id) && (!r.season || r.season.includes(m)));
    const rows = list.map((r) => ({ label: ITEMS[r.id].name, sub: this.matText(r.mat), ok: st.hasMats(r.mat) }));
    rows.push({ label: 'ざいりょうを見る', sub: MATERIALS.filter((x) => st.mat[x.id]).map((x) => `${x.name}×${st.mat[x.id]}`).join(' ') || 'なし' });
    const i = await ui.list('DIY', rows);
    if (i < 0 || i >= list.length) return;
    const r = list[i];
    if (st.full()) { ui.toast('ポケットが いっぱい!'); return; }
    st.useMats(r.mat); st.add(r.id);
    if (FLIMSY[r.id]) st.ext.dur[r.id] = FLIMSY[r.id];
    this.life.anim = { kind: 'dig', t: 0, dur: 0.6 }; this.life.splash(0.2, 1800); ui.jingle([523, 659, 784]);
    await ui.say(null, [`トントン カンカン……`, `${ITEMS[r.id].name}が できた!`]);
  }
  // a tool was used once: wears down and breaks
  use(id) {
    const d = this.st.ext.dur; if (!(id in d)) d[id] = DURABILITY[id] || 30;
    d[id]--;
    if (d[id] > 0) { this.st.save(); return; }
    delete d[id];
    const i = this.st.pocket.indexOf(id); if (i >= 0) this.st.pocket.splice(i, 1);
    this.life.equip(null); this.st.save();
    this.life.ui.blip(200, 0.25, 'square', 0.1);
    setTimeout(() => this.life.ui.say(null, [`あっ! ${ITEMS[id].name}が こわれてしまった……`, 'DIYで 作りなおすか、お店で 買おう。']), 400);
  }
  // axe on a tree: three pieces of wood per tree a day
  chop(t) {
    const life = this.life, d = (life.st.daily.chop ||= {});
    life.anim = { kind: 'dig', t: 0, dur: 0.45 }; life.ui.blip(160, 0.09, 'square', 0.12);
    if (t.fruitTree) return;
    this.use('axe');
    if ((d[t.id] || 0) >= 3) { life.ui.toast('もう 木材は とれないみたい'); return; }
    d[t.id] = (d[t.id] || 0) + 1; life.st.addMat('wood'); life.ui.toast(`木材を 手に入れた (${life.st.mat.wood})`, 1400);
  }
  // shovel on an ordinary rock: a stone, sometimes iron (once per rock a day)
  rock(r) {
    const life = this.life, d = (life.st.daily.stones ||= {});
    if (d[r.id]) { life.ui.toast('カツン!'); return; }
    d[r.id] = 1; const iron = Math.random() < 0.2;
    life.st.addMat(iron ? 'iron' : 'stone'); life.ui.toast(iron ? '鉄のかけらを 手に入れた!' : '石を 手に入れた', 1400);
  }
  hint() { return pick(RACCOON.craft_hint); }
  today() { return dayKey(); }
}
