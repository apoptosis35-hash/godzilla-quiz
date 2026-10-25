// Planting and the rocky shore: seeds sprout, bud and bloom over two days; a mikan planted in the ground grows
// into a fruiting tree in three; tide pools on the shore sparkle each morning and hide sea creatures.
import * as THREE from 'three';
import { ITEMS, dayKey, seeded } from './state.js';
import { SEEDS, SEA } from './items2.js';

const days = (from) => Math.round((new Date(dayKey().replace(/-/g, '/')) - new Date(from.replace(/-/g, '/'))) / 864e5);

export class Garden {
  constructor(life) {
    this.life = life; this.st = life.st; this.objs = []; this.pools = [];
    this.st.ext.plants ||= [];
    this.build();
    this.newDay();
  }
  build() {
    for (const o of this.objs) this.life.root.remove(o.o); this.objs = [];
    for (const p of this.st.ext.plants) this.objs.push({ p, o: this.plantObject(p) });
  }
  plantObject(p) {
    const L = this.life, y = L.ground.height(p.x, p.z), age = days(p.day), g = new THREE.Group();
    g.position.set(p.x, y, p.z); L.root.add(g);
    if (p.type === 'tree') {
      if (age >= 3 && L.town.protos.fruit_tree) {
        const o = L.town.clone('fruit_tree', p.x, y, p.z, p.ry || 0, true); L.root.attach(o); o.scale.setScalar(0.85); L.root.remove(g);
        const id = `fruit@p${p.x.toFixed(1)},${p.z.toFixed(1)}`, fruit = o.getObjectByName('fruit_tree_fruit');
        if (!L.fruitTrees.some((f) => f.id === id)) { L.fruitTrees.push({ o, x: p.x, z: p.z, id, fruit }); L.trees.push({ x: p.x, y, z: p.z, rad: 0.3, id, fruitTree: true }); }
        if (fruit) fruit.visible = !L.st.daily.fruit[id];
        return o;
      }
      const s = L.town.protos.sapling ? L.town.clone('sapling', p.x, y, p.z, 0, true) : null;
      if (s) { L.root.attach(s); s.scale.setScalar(0.6 + age * 0.25); L.root.remove(g); return s; }
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x5a9a3a })); m.position.y = 0.3; g.add(m); return g;
    }
    const seed = SEEDS.find((s) => s.id === p.seed);
    if (age >= 2 && seed && L.town.protos[seed.flower]) { const o = L.town.clone(seed.flower, p.x, y, p.z, p.ry || 0, true); L.root.attach(o); o.scale.setScalar(1.7); L.root.remove(g); return o; }
    if (age >= 1 && seed && L.town.protos[seed.flower]) { const o = L.town.clone(seed.flower, p.x, y, p.z, p.ry || 0, true); L.root.attach(o); o.scale.set(1.2, 0.55, 1.2); L.root.remove(g); return o; }
    const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 5), new THREE.MeshStandardMaterial({ color: 0x6ab84a })); sprout.position.y = 0.08; g.add(sprout);
    return g;
  }
  // plant the pocket item at index i in front of ぽっけ
  plant(i) {
    const L = this.life, st = this.st, id = st.pocket[i], pl = L.player;
    if (L.home.inside) { L.ui.toast('家の中には 植えられないよ'); return; }
    const x = pl.pos.x + Math.sin(pl.heading) * 0.9, z = pl.pos.z + Math.cos(pl.heading) * 0.9;
    const tree = id === 'mikan';
    if (!this.soil(x, z, tree ? 1.2 : 0.3) || this.st.ext.plants.some((p) => Math.hypot(p.x - x, p.z - z) < (tree ? 2.5 : 0.6))) { L.ui.toast('ここには 植えられないみたい'); return; }
    const p = { type: tree ? 'tree' : 'flower', seed: tree ? null : id, x, z, ry: Math.random() * 6.28, day: dayKey() };
    st.pocket.splice(i, 1); st.ext.plants.push(p); st.save(); L.emit('plant');
    L.anim = { kind: 'dig', t: 0, dur: 0.6 }; L.splash(0.12, 300);
    this.objs.push({ p, o: this.plantObject(p) });
    L.ui.toast(tree ? 'みかんを 植えた。3日で 木になるよ' : `${ITEMS[id].name}を まいた`);
  }
  // grass or earth (natural ground, or a grassy / earthen terrace), fairly flat, nothing standing there
  soil(x, z, r) {
    const L = this.life, s = L.ground.sample(x, z);
    if (s.h < 0.05 || (s.plat && !['grass', 'dirt'].includes(s.plat.mat)) || L.onRoad(x, z)) return false;
    const sl = Math.abs(L.ground.height(x + 0.7, z) - s.h) + Math.abs(L.ground.height(x, z + 0.7) - s.h);
    return sl < 0.35 && !L.blockedAt(x, z, r);
  }
  // ---------------------------------------------------------------- tide pools
  newDay() {
    this.build();
    for (const t of this.pools) this.life.root.remove(t.o); this.pools = [];
    const L = this.life, r = seeded('pools' + dayKey()), done = L.st.daily.pools || {};
    for (const rk of L.rocks) {
      if (this.pools.length >= 5) break;
      if (r() > 0.4 || rk.y > 4 || rk.y < -0.6) continue;
      const p = L.near(rk.x, rk.z, (x, z) => Math.hypot(x - rk.x, z - rk.z) > rk.rad * 0.8 && L.walkable(x, z) && L.nearWater(x, z, 4), rk.rad + 4); if (!p) continue;
      const key = 'pool' + this.pools.length; if (done[key]) continue;
      const o = L.textSprite('✨', 0.45); o.position.set(p[0], L.ground.height(p[0], p[1]) + 0.25, p[1]); L.root.add(o);
      this.pools.push({ o, x: p[0], z: p[1], key });
    }
  }
  target(front) {
    if (this.life.home.inside) return null;
    for (const t of this.pools) if (front(t.x, t.z, 1.1)) return { label: 'しらべる', run: () => this.search(t) };
    if (this.life.st.tool === 'shovel') for (const o of this.objs) if (front(o.p.x, o.p.z, o.p.type === 'tree' ? 1.6 : 0.9) && (o.p.type !== 'tree' || days(o.p.day) < 3)) return { label: 'ほりかえす', run: () => this.dig(o) };
    return null;
  }
  async search(t) {
    const L = this.life;
    L.root.remove(t.o); this.pools.splice(this.pools.indexOf(t), 1); (L.st.daily.pools ||= {})[t.key] = 1; L.st.save();
    L.anim = { kind: 'dig', t: 0, dur: 0.5 }; L.splash(0.25, 1600);
    const sp = L.pickSpecies(SEA.map((s) => ({ ...s, where: 'pool' })), 'pool');
    if (!sp) { L.ui.toast('なにも いなかった'); return; }
    await new Promise((r) => setTimeout(r, 450));
    await L.got(sp, 'sea');
  }
  dig(o) {
    const L = this.life, st = this.st;
    if (st.full()) { L.ui.toast('ポケットが いっぱい!'); return; }
    st.ext.plants.splice(st.ext.plants.indexOf(o.p), 1); L.root.remove(o.o); this.objs.splice(this.objs.indexOf(o), 1);
    st.add(o.p.type === 'tree' ? 'mikan' : o.p.seed); st.save(); L.anim = { kind: 'dig', t: 0, dur: 0.6 };
  }
  update() { const t = this.life.t; for (const p of this.pools) p.o.material.opacity = 0.55 + 0.45 * Math.sin(t * 3 + p.x); }
}
