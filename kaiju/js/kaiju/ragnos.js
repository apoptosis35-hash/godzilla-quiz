// RAGNOS — 終焉巨獣ラグノス. Original craggy heavyweight: dorsal blades jut out while charging a devastating blue blast.
import * as THREE from 'three';
import { poses } from '../rig.js';
import { BP, bipedAnims, bipedGait, bipedProc, TAIL } from './biped.js';
import { makeReptileBuild, reptileMoves, REPTILE_COMMANDS } from './reptile.js';

const S = 1.05;
const build = makeReptileBuild({
  scale: S, seed: 21, skin: 0x2a2b2c, noise: 0.13, normal: 2.2, bodyW: 1.08, legW: 1.12, armW: 0.95, headS: 0.95, snout: 0.95, brow: 0.2,
  plate: 0xdde3ea, glow: 0x2a7cff, hot: 0xe0f4ff, sheen: 0x9fc8ff, eye: 0xffd0a0, eyeI: 1.6, plateH: 1.25, plateW: 0.8, plateSpikes: () => 2, plateThick: 0.8, rise: 0.9, toothL: 1.3,
});
const P = poses(BP.base, { ...Object.fromEntries(Object.entries(BP).filter(([k]) => k !== 'base')) });
const anims = bipedAnims(P);
const moves = reptileMoves(P, { dmg: 1.12, beam: 0x3a8cff, core: 0xe8f6ff, mouthY: 10.1, beamName: 'ブルー・ブラスト', pulseName: 'ショックパルス', superName: 'メガトン・ブラスト' });
// slower but heavier normals
for (const id of ['jab', 'jab2', 'overhead', 'tailspin', 'ram']) { moves[id].startup += 1; }
moves.grab.throw.hitMove.dmg = 128;
// signature: long charge (blades jut out), short brutal beam, then a huge blast where it lands
Object.assign(moves.breath, {
  startup: 44, active: 22, recovery: 30, glow: 44,
  beam: { from: 44, to: 66, z: 4, y: 10.1, width: 1.5, tick: 3, dmg: 18, push: 0.3, hitstun: 16, blockstun: 10, range: 80, color: 0x3a8cff, core: 0xe8f6ff, sweep: 0.004, kind: 'fission' },
  anim: [[0, P.base], [20, P.breathCharge, 'io'], [44, P.breathCharge], [47, P.breathFire, 'snap'], [66, P.breathFire], [96, P.base, 'io']],
  events: [[66, 'nuke', { dmg: 55, r: 8 }]], track: 30, sfx: [[1, 'charge', { len: 0.75, pitch: 0.8 }]],
});
Object.assign(moves.super, {
  startup: 80, active: 40, recovery: 36, glow: 80,
  beam: { from: 80, to: 120, z: 4, y: 10.1, width: 3, tick: 3, dmg: 24, push: 0.3, hitstun: 16, blockstun: 10, range: 95, color: 0x4a9cff, core: 0xffffff, sweep: 0.004, kind: 'fission', super: true },
  anim: [[0, P.base], [20, P.roar, 'io'], [56, P.roar], [72, P.breathCharge, 'io'], [82, P.breathFire, 'snap'], [120, P.breathFire], [156, P.base, 'io']],
  events: [[0, 'invul', { n: 84 }], [120, 'nuke', { dmg: 130, r: 13, big: true }]], track: 78,
});

export default {
  id: 'ragnos', name: 'RAGNOS', jp: 'ラグノス', title: '終焉巨獣', era: '1946年 太平洋沖 出現',
  desc: '岩のように荒れた黒い皮膚と、銀色の刃のような背板を持つ。背板をせり出させて溜める青い熱線は、着弾点ごと街を吹き飛ばす。',
  style: '一撃必殺型', strengths: '最高火力の熱線・着弾爆発・高耐久', weakness: '最も鈍足・熱線の溜めが長い',
  stats: { power: 5, speed: 1, defense: 5, reach: 3 }, specialNames: ['ブルー・ブラスト', 'ショックパルス', 'アースクエイク'], superName: 'メガトン・ブラスト',
  hp: 1250, defense: 1.12, walk: 0.072, back: 0.052, side: 0.065, dash: 0.3, evade: 0.27, weight: 1.55, push: 2.5, height: 12, stride: 1.2,
  hurt: [{ z: 0, y0: 0, y1: 10, r: 2.5 }, { z: 1.7, y0: 9, y1: 11.8, r: 1.4 }, { z: -4, y0: 0, y1: 4, r: 1.7 }],
  voice: { pitch: 0.62, rough: 1.4 }, color: '#4a9cff', camH: 1,
  tails: [TAIL], poses: P, anims, gait: (p, ph, a, c) => bipedGait(p, ph, a * 1.1, c), proc: bipedProc,
  moves, commands: { ...REPTILE_COMMANDS },
  ai: { range: 6, zoning: 0.3, aggression: 0.6 },
  events: {
    nuke(f, m, d) {
      const p = (f.beam && f.beam.end ? f.beam.end.clone() : f.local(20, 0)).setY(0.5);
      m.fx.explosion(p.clone().setY(3), d.big ? 4 : 2.6, 0x6ab0ff);
      m.fx.ring(p, { color: 0x9fd0ff, r1: d.r * 3, dur: 0.8 });
      m.fx.ring(p.clone().setY(4), { sphere: true, color: 0x6ab0ff, r0: 2, r1: d.r, dur: 0.6, opacity: 0.6 });
      m.fx.burst(p.clone().setY(2), { n: 40, color: 0x30343a, speed: 10, up: 3, size: 8, grow: 10, life: 3, smoke: true, alpha: 0.7, spread: 4 });
      m.fx.crack(p, d.r * 1.6);
      m.fx.flash(p.clone().setY(10), 0x9fd0ff, d.big ? 160 : 90, 0.5);
      m.camRig.shake(d.big ? 1 : 0.7);
      m.audio.play('explosion', { vol: 1, pitch: 0.5 });
      m.stage.impact(p.clone().setY(4), d.big ? 3 : 2, d.r + 4);
      const o = f.opp;
      if (Math.hypot(o.pos.x - p.x, o.pos.z - p.z) < d.r + 2) {
        const res = o.takeHit(f, { id: 'nuke', special: true, super: !!d.big, dmg: d.dmg, height: 'mid', hitstun: 22, blockstun: 14, push: 0.9, launch: 0.5, chip: 0.25 }, { srcPos: p, proj: true });
        if (res !== 'whiff') { f.connected = true; m.onHitFx(f, o, { dmg: d.dmg, sparkColor: 0x9fd0ff, super: !!d.big }, o.local(0, 5), res); }
      }
    },
  },
  build,
};
