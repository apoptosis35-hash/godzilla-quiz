// おやつ集め: an endless, no-brainer collecting loop on top of free roaming.
// Dog-bone treats lie on the streets, float over the harbour and the shopping street and sit on the rooftops;
// running or web-swinging into them collects them (they are pulled in from a few metres away). Chaining pickups
// builds a combo that multiplies the score and raises the pitch of the pop. Golden bones are rare and worth more;
// golden rings hang in the air on the swing routes and give a speed boost. Collected treats come back elsewhere,
// so there is always something to grab. The all-time total sets a rank and is saved on the device.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, streetY, QY } from './terrain.js';

const KEY = 'uminagi_treats_v1';
const RANKS = [[0, 'こいぬ'], [100, 'おさんぽ柴'], [300, '港の柴'], [700, '屋根の上の柴'], [1500, '糸使いの柴'], [3000, '空飛ぶ柴'],
  [6000, '伝説の柴'], [12000, '海凪の守り神'], [25000, '神柴']];
const COMBO_TIME = 3.2, RESPAWN = 15;

function boneGeometry() {
  const shaft = new THREE.CylinderGeometry(0.07, 0.07, 0.42, 6, 1, true); shaft.rotateZ(Math.PI / 2);
  const parts = [shaft];
  for (const x of [-0.22, 0.22]) for (const z of [-0.065, 0.065]) { const b = new THREE.SphereGeometry(0.095, 7, 5); b.translate(x, 0, z); parts.push(b); }
  return mergeGeometries(parts);
}

export class Treats {
  constructor(scene, ground, town, player, sound) {
    this.ground = ground; this.town = town; this.player = player; this.sound = sound;
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* private mode */ }
    this.total = saved.total || 0; this.best = saved.best || 0;
    this.score = 0; this.combo = 0; this.comboT = 0; this.rank = this.rankOf(this.total);
    this.rnd = mulberry(1234);
    // candidate spots: on the ground, floating over the swing routes, on rooftops
    this.spots = { ground: this.groundSpots(), air: this.airSpots(), roof: this.roofSpots() };
    const geo = boneGeometry();
    const mk = (color, emissive, metal, n) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.55, roughness: 0.45, metalness: metal }), n);
      m.frustumCulled = false; m.castShadow = false; scene.add(m); return m;
    };
    this.items = [];
    // air spots are trails: every spot holds its own treat (it comes back to the same place), so the swing routes stay full
    const nG = 260, nA = this.spots.air.length, nR = 60, nGold = 12;
    this.bones = mk(0xfff1d6, 0xffd9a0, 0.0, nG + nA + nR); this.gold = mk(0xffc531, 0xff9a00, 0.8, nGold);
    for (let i = 0; i < nG + nA + nR; i++) {
      const kind = i < nG ? 'ground' : i < nG + nA ? 'air' : 'roof';
      this.items.push(this.spawn({ mesh: this.bones, idx: i, kind, value: 10, fixed: kind === 'air' ? this.spots.air[i - nG] : null }));
    }
    for (let i = 0; i < nGold; i++) this.items.push(this.spawn({ mesh: this.gold, idx: i, kind: i % 2 ? 'air' : 'roof', value: 100, gold: true }));
    // rings along the swing routes
    const rg = new THREE.TorusGeometry(1.7, 0.13, 8, 28);
    this.ringMesh = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffa400, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 }), 16);
    this.ringMesh.frustumCulled = false; scene.add(this.ringMesh);
    this.rings = this.ringSpots().slice(0, 16).map((r, i) => ({ ...r, idx: i, live: true, t: 0 }));
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
    this.hud = { score: document.getElementById('score'), combo: document.getElementById('combo'), rank: document.getElementById('rank'), pops: document.getElementById('pops'), box: document.getElementById('scorebox') };
    this.updateHud(true);
  }
  rankOf(t) { let k = 0; for (let i = 0; i < RANKS.length; i++) if (t >= RANKS[i][0]) k = i; return k; }
  groundSpots() {
    const g = this.ground, out = [];
    for (let i = 0; i < 6000 && out.length < 900; i++) {
      const x = G.x0 + 6 + this.rnd() * (G.x1 - G.x0 - 12), z = G.z0 + 6 + this.rnd() * (G.z1 - G.z0 - 30), s = g.sample(x, z);
      if (!s.plat && (s.h < 0.6 || s.h > 40 || this.rnd() < 0.8)) continue;   // mostly where people walk: streets, lanes, quays
      if (!s.plat && Math.abs(g.height(x + 1, z) - s.h) + Math.abs(g.height(x, z + 1) - s.h) > 0.8) continue;
      if (this.player.support(x, z, s.h + 0.5) > s.h + 0.3) continue;   // inside a building
      out.push(new THREE.Vector3(x, s.h + 0.55, z));
    }
    return out;
  }
  airSpots() {
    const out = [];
    for (let z = -92; z <= -8; z += 1.6) out.push(new THREE.Vector3(40 + Math.sin(z * 0.09) * 3, streetY(z) + 4.5 + Math.sin(z * 0.15) * 2.2, z));   // over the street
    for (let x = -72; x <= 50; x += 1.8) out.push(new THREE.Vector3(x, QY + 4.5 + Math.sin(x * 0.12) * 2.2, 18 + Math.sin(x * 0.05) * 2));        // over the harbour quay
    for (let z = 24; z <= 100; z += 3) out.push(new THREE.Vector3(-80 + this.rnd() * 4, 9 + Math.sin(z * 0.2) * 2, z));                  // along the west breakwater
    for (let x = -60; x <= 20; x += 3) out.push(new THREE.Vector3(x, 8 + this.rnd() * 6, -20 - this.rnd() * 70));                       // over the terraces
    return out;
  }
  roofSpots() {
    return this.town.colliders.filter((c) => c.type === 'b' && c.y0 > -1.5 && c.hw * c.hd > 10 && c.y1 > 5 && Math.abs(c.x) < 160)
      .map((c) => new THREE.Vector3(c.x, c.y1 + 0.7, c.z));
  }
  ringSpots() {
    const out = [];
    for (let z = -20; z >= -88; z -= 17) out.push({ p: new THREE.Vector3(40, streetY(z) + 8.5, z), axis: new THREE.Vector3(0, 0, 1) });
    for (let x = -60; x <= 40; x += 25) out.push({ p: new THREE.Vector3(x, QY + 9, 16), axis: new THREE.Vector3(1, 0, 0) });
    for (let z = 40; z <= 100; z += 30) out.push({ p: new THREE.Vector3(-79, 11, z), axis: new THREE.Vector3(0, 0, 1) });
    for (let x = -50; x <= 10; x += 20) out.push({ p: new THREE.Vector3(x, 15, -55), axis: new THREE.Vector3(1, 0, 0) });
    return out;
  }
  spawn(it) {
    const list = this.spots[it.kind];
    it.home = (it.fixed || list[Math.floor(this.rnd() * list.length)]).clone(); it.p = it.home.clone(); it.live = true; it.t = 0; it.ph = this.rnd() * 6;
    return it;
  }
  update(dt, camera, playing) {
    const pl = this.player, me = pl.pos.clone(); me.y += 0.35;
    const flying = pl.state === 'swing' || pl.state === 'air';
    const magnet = flying ? 7 : 4.5, grab = flying ? 1.5 : 1.1, t = pl.t;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) { this.endCombo(); } }
    for (const it of this.items) {
      if (!it.live) {
        it.t += dt;
        if (it.t > RESPAWN) this.spawn(it);
        else { this.m.makeScale(0, 0, 0); it.mesh.setMatrixAt(it.idx, this.m); continue; }
      }
      const d = it.p.distanceTo(me);
      if (playing && d < magnet) { it.p.lerp(me, Math.min(1, dt * (9 / Math.max(d, 0.4)))); }
      else it.p.lerp(it.home, Math.min(1, dt * 2));
      if (playing && it.p.distanceTo(me) < grab) { this.collect(it, camera); continue; }
      const bob = Math.sin(t * 2.4 + it.ph) * 0.12, sc = it.gold ? 1.5 : 1.15;
      this.q.setFromEuler(new THREE.Euler(0.35, t * 2.2 + it.ph, 0));
      this.m.compose(this.v.set(it.p.x, it.p.y + bob, it.p.z), this.q, this.s.setScalar(sc));
      it.mesh.setMatrixAt(it.idx, this.m);
    }
    this.bones.instanceMatrix.needsUpdate = true; this.gold.instanceMatrix.needsUpdate = true;
    for (const r of this.rings) {
      if (!r.live) { r.t += dt; if (r.t > 12) { r.live = true; r.t = 0; } }
      const k = r.live ? 1 : Math.max(0, 1 - r.t * 4);
      this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), r.axis);
      this.q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), t * 0.6));
      this.m.compose(r.p, this.q, this.s.setScalar(r.live ? 1 + Math.sin(t * 3 + r.idx) * 0.04 : 1 + (1 - k) * 0.8).multiplyScalar(r.live ? 1 : k));
      this.ringMesh.setMatrixAt(r.idx, this.m);
      if (playing && r.live && r.p.distanceTo(me) < 2.0) this.ring(r, camera);
    }
    this.ringMesh.instanceMatrix.needsUpdate = true;
  }
  mult() { return 1 + Math.floor(this.combo / 5); }
  collect(it, camera) {
    it.live = false; it.t = 0;
    this.combo++; this.comboT = COMBO_TIME;
    const pts = it.value * this.mult(); this.add(pts);
    this.sound.pop?.(this.combo, it.gold);
    this.popup(it.p, (it.gold ? '★+' : '+') + pts, camera, it.gold ? 'gold' : '');
    if (this.combo % 10 === 0) this.popup(it.p, this.combo + ' COMBO!', camera, 'big');
  }
  ring(r, camera) {
    r.live = false; r.t = 0;
    this.combo += 3; this.comboT = COMBO_TIME + 1;
    const pts = 50 * this.mult(); this.add(pts);
    const v = this.player.vel; if (this.player.state !== 'ground') { v.multiplyScalar(1.3); v.y = Math.max(v.y, 0) + 4; }
    this.sound.ring?.();
    this.popup(r.p, 'リング +' + pts, camera, 'gold');
  }
  add(pts) {
    this.score += pts; this.total += pts;
    const rk = this.rankOf(this.total);
    if (rk > this.rank) { this.rank = rk; this.sound.fanfare?.(); this.popup(this.player.pos, 'ランクアップ! 「' + RANKS[rk][1] + '」', null, 'rank'); }
    this.updateHud();
    this.dirty = true;
  }
  endCombo() {
    if (this.combo > this.best) this.best = this.combo;
    this.combo = 0; this.updateHud(); this.saveNow();
  }
  saveNow() { if (!this.dirty) return; this.dirty = false; try { localStorage.setItem(KEY, JSON.stringify({ total: this.total, best: this.best })); } catch { /* private mode */ } }
  updateHud(first) {
    const h = this.hud; if (!h.score) return;
    h.score.textContent = this.total.toLocaleString();
    h.combo.textContent = this.combo >= 2 ? `${this.combo} コンボ ×${this.mult()}` : '';
    h.rank.textContent = RANKS[this.rank][1];
    if (!first) { h.box.classList.remove('bump'); void h.box.offsetWidth; h.box.classList.add('bump'); }
  }
  popup(p, text, camera, cls) {
    const el = document.createElement('div'); el.className = 'pop ' + (cls || ''); el.textContent = text;
    if (camera) {
      const v = p.clone().project(camera);
      if (v.z > 1) return;
      el.style.left = ((v.x * 0.5 + 0.5) * 100).toFixed(1) + '%'; el.style.top = ((-v.y * 0.5 + 0.5) * 100).toFixed(1) + '%';
    } else { el.style.left = '50%'; el.style.top = '30%'; }
    this.hud.pops.appendChild(el); setTimeout(() => el.remove(), cls === 'rank' ? 2600 : 900);
  }
}

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
