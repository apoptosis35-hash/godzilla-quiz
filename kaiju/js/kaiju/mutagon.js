// MUTAGON — 変異神ミュータゴン. Original towering mutant: magma-cracked hide, tiny arms, purple ray and back lasers.
import * as THREE from 'three';
import { poses } from '../rig.js';
import { BP, bipedAnims, bipedGait, bipedProc, TAIL } from './biped.js';
import { makeReptileBuild, reptileMoves, REPTILE_COMMANDS } from './reptile.js';

const S = 1.12;
const TAILSEG = [[0, -0.2, -1.4], [0, -0.45, -1.7], [0, -0.5, -1.75], [0, -0.5, -1.75], [0, -0.45, -1.7], [0, -0.4, -1.65], [0, -0.35, -1.6], [0, -0.3, -1.6]];
const build = makeReptileBuild({
  scale: S, tail: TAILSEG, tailLen: 1.25, seed: 47, skin: 0x3a2622, cracks: 0xff3010, noise: 0.11, normal: 2.4, bodyW: 0.95, chestW: 0.9, neckW: 0.85, tailW: 1.05,
  armW: 0.5, legW: 1.05, headS: 0.78, snout: 1.35, muzzleW: 0.8, brow: 0.05, eye: 0xfff0e0, eyeS: 0.5, eyeI: 0.6, toothL: 1.9, teeth: 10,
  plate: 0x170c0d, idleGlow: 0x8a1408, glow: 0xa040ff, hot: 0xffc8ff, sheen: 0x8a2018, plateH: 1.15, plateW: 1.05, plateSpikes: (r) => (r ? 3 : 4), plateRough: 0.7, glowMul: 1.3,
});
const P = poses(BP.base, {
  ...Object.fromEntries(Object.entries(BP).filter(([k]) => k !== 'base')),
  tailRaise: { _root: [0, 0, 0, 0.15, Math.PI, 0], spine: [0.3, 0, 0], tail1: [0.35, 0, 0], tail2: [0.15, 0, 0], tail3: [0.05, 0, 0], tail4: [0, 0, 0] },
  tailStab: { _root: [0, 0, -0.6, 0.3, Math.PI, 0], spine: [0.45, 0, 0], tail1: [0.15, 0, 0], tail2: [0, 0, 0], tail3: [0, 0, 0], tail4: [0, 0, 0], tail5: [0, 0, 0] },
  rayOpen: { spine: [0.18, 0, 0], chest: [0.1, 0, 0], neck: [0.15, 0, 0], head: [-0.25, 0, 0], jaw: [1.55, 0, 0], shoulderL: [-0.2, 0, 0.5], shoulderR: [-0.2, 0, -0.5] },
  backFire: { spine: [0.55, 0, 0], chest: [0.3, 0, 0], neck: [0.3, 0, 0], head: [0.2, 0, 0], jaw: [0.3, 0, 0], shoulderL: [0, 0, 0.3], shoulderR: [0, 0, -0.3], tail1: [0.3, 0, 0], tail2: [0.2, 0, 0] },
});
const anims = bipedAnims(P);
const moves = reptileMoves(P, { dmg: 1.0, beam: 0xb050ff, core: 0xffe0ff, mouthY: 10.8, beamName: 'パープル・レイ', superName: 'カタストロフ・レイ' });
// weak little arms
for (const id of ['jab', 'jab2']) { moves[id].dmg = Math.round(moves[id].dmg * 0.6); moves[id].hit.z = 4.6; }
moves.jab2.cancel.chain = { L: 'tailStab' };
// long tail
moves.tailspin.hit = [{ z: 8, y: 4, r: 3.4 }, { z: 12, y: 3.5, r: 2.8 }]; moves.tailspin.dmg = 92;
moves.tailsweep.hit = [{ z: 7, y: 1, r: 3.2 }, { z: 11.5, y: 1, r: 2.6 }];
Object.assign(moves, {
  tailStab: { name: 'テイルスピアー', startup: 17, active: 6, recovery: 22, dmg: 72, height: 'mid', hit: [{ z: 10, y: 5, r: 2.4 }, { z: 13.5, y: 5, r: 2.2 }], hitstun: 26, blockstun: 16, push: 1.3, wallsplat: true,
    anim: [[0, P.base], [10, P.tailRaise, 'io'], [18, P.tailStab, 'snap'], [26, P.tailStab], [45, P.base, 'io']], sfx: [[14, 'whoosh', { pitch: 0.4, vol: 1 }]], track: 8 },
  lasers: { name: 'バックレーザー', special: true, startup: 22, active: 18, recovery: 22, dmg: 0, height: 'mid', glow: 22,
    proj: [{ at: 22, kind: 'bolt', count: 8, spread: 1.6, stagger: 2, speed: 1.3, y: 13, z: -2.5, r: 0.7, life: 70, dmg: 8, hitstun: 10, push: 0.12, color: 0xc070ff, aim: true, homing: 0.025, homingDelay: 4, sfx: 'laser' },
      { at: 26, kind: 'bolt', count: 3, spread: 0.6, stagger: 3, speed: 1.3, y: 3, z: -15, yawOff: Math.PI, r: 0.7, life: 80, dmg: 8, hitstun: 10, push: 0.12, color: 0xc070ff, aim: true, homing: 0.06, homingDelay: 6, sfx: 'laser' }],
    anim: [[0, P.base], [14, P.backFire, 'io'], [40, P.backFire], [62, P.base, 'io']], cooldown: 50 },
  rain: { name: 'レーザー・レイン', special: true, startup: 20, active: 30, recovery: 24, dmg: 0, height: 'mid', glow: 20,
    anim: [[0, P.base], [14, P.backFire, 'io'], [50, P.backFire], [74, P.base, 'io']], cooldown: 60,
    events: [20, 25, 30, 35, 40, 45].map((f) => [f, 'laserStrike', { dmg: 12 }]) },
});
Object.assign(moves.breath, { startup: 28, active: 44, glow: 28, recovery: 26, events: [14, 17, 20, 23, 26].map((f) => [f, 'fireSpew']) });
Object.assign(moves.breath.beam, { from: 28, to: 72, width: 0.7, tick: 4, dmg: 12, range: 95, sweep: 0.007 });
moves.breath.anim = [[0, P.base], [14, P.breathCharge, 'io'], [28, P.breathCharge], [31, P.rayOpen, 'snap'], [72, P.rayOpen], [98, P.base, 'io']];
Object.assign(moves.super.beam, { width: 1.6, range: 110, color: 0xc060ff });
moves.super.anim = [[0, P.base], [20, P.backFire, 'io'], [50, P.backFire], [66, P.breathCharge, 'io'], [74, P.rayOpen, 'snap'], [136, P.rayOpen], [166, P.base, 'io']];
moves.super.events = [[0, 'invul', { n: 76 }], ...[30, 38, 46, 54, 62, 84, 96, 108, 120].map((f) => [f, 'laserStrike', { dmg: 16, many: true }])];
for (const k in moves) moves[k].id = k;

export default {
  id: 'mutagon', name: 'MUTAGON', jp: 'ミュータゴン', title: '変異神', era: '2016年 東京湾 上陸',
  desc: '赤い傷痕が浮かぶ黒い背びれと、全身に走る赤熱の亀裂を持つ異様に背の高い変異体。小さな眼、外にはみ出した乱杭歯、腕は小さく格闘は苦手。顎を裂いて黒煙と炎を吐いたのち、紫の光線と背中・尾からのレーザーで全方位を焼き払う。',
  style: '全方位レーザー型', strengths: '超長射程の光線・背中のレーザー乱射・長い尾', weakness: '腕の攻撃が弱い・非常に鈍い',
  stats: { power: 4, speed: 1, defense: 4, reach: 5 }, specialNames: ['パープル・レイ', 'バックレーザー', 'レーザー・レイン'], superName: 'カタストロフ・レイ',
  hp: 1150, defense: 1.1, walk: 0.06, back: 0.045, side: 0.055, dash: 0.27, evade: 0.26, weight: 1.6, push: 2.5, height: 13, stride: 1.1,
  hurt: [{ z: 0, y0: 0, y1: 10.6, r: 2.4 }, { z: 1.8, y0: 9.5, y1: 12.6, r: 1.3 }, { z: -4.5, y0: 0, y1: 4, r: 1.7 }],
  voice: { pitch: 0.55, rough: 1.6, formant: 0.8 }, color: '#b050ff', camH: 1.1,
  tails: [TAIL], poses: P, anims, gait: (p, ph, a, c) => bipedGait(p, ph, a * 0.8, c), proc: bipedProc,
  portraitOff: [4.5, 1.2, 10],
  moves,
  commands: { ...REPTILE_COMMANDS, 'f+H': 'tailStab', 'dash+H': 'tailStab', 'f+S': 'lasers', 'd+S': 'rain', 'b+S': 'pulse' },
  ai: { range: 9, zoning: 0.55, aggression: 0.5 },
  events: {
    fireSpew(f, m) {
      const p = f.model.rig.bones.head.localToWorld(new THREE.Vector3(0, -0.2, 2.6));
      const dir = new THREE.Vector3(Math.sin(f.yaw), -0.2, Math.cos(f.yaw));
      m.fx.burst(p, { n: 16, color: 0xff6a10, speed: 8, dir, dirSp: 22, size: 2.2, grow: 3, life: 0.6, drag: 0.92 });
      m.fx.burst(p, { n: 10, color: 0x111010, speed: 5, dir, dirSp: 14, size: 3.5, grow: 6, life: 1.6, smoke: true, alpha: 0.7 });
      m.audio.play('whoosh', { pitch: 0.4, vol: 0.8 });
    },
    laserStrike(f, m, d) {
      const o = f.opp;
      const from = f.local(-2 + Math.random() * 3, 12 + Math.random() * 2, (Math.random() - 0.5) * 3);
      const tgt = new THREE.Vector3(o.pos.x + (Math.random() - 0.5) * (d.many ? 10 : 5), 0.3, o.pos.z + (Math.random() - 0.5) * (d.many ? 10 : 5));
      m.fx.strike(from, tgt, 0xc070ff, 0.18, 0.5);
      m.fx.explosion(tgt.clone().setY(1), 0.8, 0xc070ff);
      m.fx.crack(tgt, 4);
      m.audio.play('laser', { vol: 0.7, pitch: 0.8 });
      m.camRig.shake(0.15);
      m.stage.impact(tgt, 0.6, 5, { silent: true });
      if (Math.hypot(o.pos.x - tgt.x, o.pos.z - tgt.z) < 3.8) {
        const res = o.takeHit(f, { id: 'laser', special: true, super: !!d.many, dmg: d.dmg, height: 'mid', hitstun: 14, blockstun: 8, push: 0.15, chip: 0.2 }, { srcPos: from, proj: true });
        if (res !== 'whiff') { f.connected = true; m.onHitFx(f, o, { dmg: d.dmg, sparkColor: 0xc070ff }, o.local(0, 5), res); }
      }
    },
  },
  build,
};
