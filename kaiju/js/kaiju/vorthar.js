// VORTHAR — 闘神ヴォルザ. Original sleek, fast reptile brawler: kicks, rushes and a crimson spiral ray.
import * as THREE from 'three';
import { poses } from '../rig.js';
import { BP, bipedAnims, bipedGait, bipedProc, TAIL } from './biped.js';
import { makeReptileBuild, reptileMoves, REPTILE_COMMANDS } from './reptile.js';

const build = makeReptileBuild({
  scale: 1.0, seed: 33, skin: 0x2a2c2c, noise: 0.05, normal: 1.4, bodyW: 0.82, chestW: 1.05, tailW: 0.85, armW: 0.88, legW: 0.86, headS: 0.92, snout: 1.12, muzzleW: 0.85, brow: 0.16,
  plate: 0xe9e3d2, glow: 0x60b0ff, hot: 0xffffff, sheen: 0xd8e8ff, eye: 0xff4a10, eyeI: 2.6, plateH: 1.1, plateW: 0.85, plateN: 14, plateRough: 0.5, rowTilt: 0.55,
});
const P = poses(BP.base, {
  ...Object.fromEntries(Object.entries(BP).filter(([k]) => k !== 'base')),
  kickWind: { spine: [-0.05, 0, 0], thighR: [-0.6, 0, -0.1], kneeR: [1.5, 0, 0], ankleR: [0.3, 0, 0], shoulderL: [-0.6, 0, 0.5], shoulderR: [-0.6, 0, -0.5] },
  kickHit: { _root: [0, 0.2, 0.4, -0.1, 0, 0], spine: [-0.2, 0, 0], thighR: [-1.7, 0, -0.1], kneeR: [0.1, 0, 0], ankleR: [0.5, 0, 0], thighL: [0.25, 0, 0], kneeL: [0.3, 0, 0], shoulderL: [-0.3, 0, 0.8], shoulderR: [-0.3, 0, -0.8] },
  highKick: { _root: [0, 0.5, 0.3, -0.3, 0, 0], spine: [-0.3, 0, 0], thighR: [-2.2, 0, -0.1], kneeR: [0.05, 0, 0], ankleR: [0.5, 0, 0], thighL: [0.35, 0, 0], shoulderL: [-0.2, 0, 1], shoulderR: [-0.2, 0, -1] },
  dropkick: { _root: [0, 1.2, 0, -1.2, 0, 0], thighL: [-1.5, 0, 0.1], thighR: [-1.5, 0, -0.1], kneeL: [0.1, 0, 0], kneeR: [0.1, 0, 0], ankleL: [0.4, 0, 0], ankleR: [0.4, 0, 0], shoulderL: [0.4, 0, 0.9], shoulderR: [0.4, 0, -0.9] },
  punch: { _root: [0, -0.1, 0.5, 0.15, 0, 0], spine: [0.25, -0.4, 0], shoulderR: [-1.6, 0, 0.1], elbowR: [-0.05, 0, 0], shoulderL: [-0.6, 0, 0.4], thighL: [-0.6, 0, 0], kneeL: [0.5, 0, 0] },
});
const anims = bipedAnims(P);
const moves = reptileMoves(P, { dmg: 0.88, beam: 0xa8d4ff, core: 0xffffff, beamName: 'スパイラル・レイ', pulseName: 'バーニング・パルス', superName: 'ハイパー・スパイラル・レイ' });
for (const id of ['breath', 'super']) Object.assign(moves[id].beam, { kind: 'spiral', spiral: 0xff1a08, spiral2: 0xffd020 });
// faster normals
for (const id in moves) if (!moves[id].special && moves[id].startup > 7) moves[id].startup -= 2;
for (const id of ['tailspin', 'ram']) delete moves[id].armor;
moves.jab.startup = 6; moves.jab2.startup = 7;
moves.jab2.cancel.chain = { L: 'kick' };
moves.jab.cancel.to.push('kick', 'lowkick');
Object.assign(moves, {
  kick: { name: 'フロントキック', startup: 10, active: 4, recovery: 15, dmg: 40, height: 'mid', hit: { z: 6, y: 4.5, r: 2.5 }, hitstun: 22, blockstun: 13, push: 0.6, lunge: [[0, 10, 0.12]],
    anim: [[0, P.base], [6, P.kickWind, 'io'], [10, P.kickHit, 'snap'], [17, P.kickHit], [27, P.base, 'io']], cancel: { from: 11, until: 22, to: ['highkick', 'breath', 'rush'], special: true } },
  highkick: { name: 'ハイキック', startup: 12, active: 4, recovery: 18, dmg: 46, height: 'high', hit: { z: 5.8, y: 8, r: 2.4 }, hitstun: 22, blockstun: 13, push: 0.4, launch: 0.6,
    anim: [[0, P.base], [7, P.kickWind, 'io'], [12, P.highKick, 'snap'], [19, P.highKick], [32, P.base, 'io']], cancel: { from: 14, until: 28, to: ['breath', 'rush'], special: true } },
  lowkick: { name: 'ローキック', startup: 8, active: 3, recovery: 13, dmg: 26, height: 'low', hit: { z: 5, y: 1, r: 2.3 }, hitstun: 18, blockstun: 11, push: 0.3, otg: true,
    anim: [[0, P.base], [5, P.stompWind, 'io'], [9, P.stompHit, 'snap'], [15, P.stompHit], [23, P.base, 'io']], cancel: { from: 9, until: 18, to: ['tailsweep', 'kick'] } },
  spinkick: { name: 'スピンキック', startup: 14, active: 5, recovery: 20, dmg: 66, height: 'mid', hit: [{ z: 6, y: 4.5, r: 3.2 }, { z: 9, y: 3, r: 2.4 }], hitstun: 24, blockstun: 16, push: 1.2, knockdown: true, wallsplat: true, spin: 1,
    anim: [[0, P.base], [7, P.kickWind, 'io'], [15, { ...P.kickHit, _root: [0, 0.3, 0, 0, Math.PI * 1.05, 0] }, 'io'], [20, { ...P.kickHit, _root: [0, 0.3, 0, 0, Math.PI * 1.5, 0] }], [36, { ...P.base, _root: [0, 0, 0, 0, Math.PI * 2, 0] }, 'io']],
    sfx: [[12, 'whoosh', { pitch: 0.6, vol: 0.9 }]] },
  dropkick: { name: 'ドロップキック', startup: 18, active: 6, recovery: 22, dmg: 70, height: 'mid', hit: { z: 4.5, y: 4, r: 3 }, hitstun: 24, blockstun: 16, push: 1.3, knockdown: true, wallsplat: true, air: true,
    rise: [[2, 12, 0.5], [16, 24, -0.625]], lunge: [[4, 22, 0.55]], track: 10, endState: 'down',
    anim: [[0, P.base], [10, P.kneel, 'io'], [16, P.dropkick, 'snap'], [24, P.dropkick], [46, P.down, 'io']], events: [[24, 'groundSlam', { z: 1, power: 0.8 }]], sfx: [[2, 'whoosh', { pitch: 0.7 }]] },
  rush: { name: 'ラッシュブロー', special: true, startup: 7, active: 10, recovery: 18, dmg: 52, height: 'mid', hit: { z: 4, y: 6, r: 3 }, hitstun: 22, blockstun: 12, push: 1.2, launch: 0.5, meterCost: 20,
    lunge: [[0, 16, 0.7]], anim: [[0, P.dash], [6, P.punch, 'snap'], [16, P.punch], [34, P.base, 'io']], events: [[0, 'invul', { n: 10 }]], sfx: [[0, 'whoosh', { pitch: 0.5, vol: 1 }]] },
});
Object.assign(moves.breath, { startup: 20, active: 32, glow: 20, recovery: 20 });
Object.assign(moves.breath.beam, { from: 20, to: 52, width: 0.9, tick: 4, dmg: 13, sweep: 0.008 });
moves.breath.anim = [[0, P.base], [10, P.breathCharge, 'io'], [20, P.breathCharge], [23, P.breathFire, 'snap'], [52, P.breathFire], [72, P.base, 'io']];
moves.grab.name = 'ショルダースルー';
for (const k in moves) moves[k].id = k;

export default {
  id: 'vorthar', name: 'VORTHAR', jp: 'ヴォルザ', title: '闘神', era: '2004年 南極氷床より覚醒',
  desc: '細身で引き締まった体と骨色の背びれ、燃えるような赤い眼を持つ俊敏な巨獣。蹴り技と突進で間合いを詰め、青白い光に真紅と黄色の螺旋が絡む熱線で仕留める。',
  style: '格闘スピード型', strengths: '速い連携・蹴り技・突進', weakness: '体力と防御がやや低い・アーマー技なし',
  stats: { power: 3, speed: 4, defense: 3, reach: 3 }, specialNames: ['スパイラル・レイ', 'ラッシュブロー', 'バーニング・パルス'], superName: 'ハイパー・スパイラル・レイ',
  hp: 1000, defense: 0.97, walk: 0.12, back: 0.09, side: 0.11, dash: 0.55, evade: 0.38, weight: 1.05, push: 2.2, height: 11.3, stride: 1.5,
  hurt: [{ z: 0, y0: 0, y1: 9.4, r: 2.2 }, { z: 1.6, y0: 8.5, y1: 11.1, r: 1.3 }, { z: -4, y0: 0, y1: 4, r: 1.4 }],
  voice: { pitch: 0.85, rough: 0.9 }, color: '#a8d4ff', camH: 1,
  tails: [TAIL], poses: P, anims, gait: (p, ph, a, c) => bipedGait(p, ph, a * 0.9, c), proc: bipedProc,
  moves,
  commands: { ...REPTILE_COMMANDS, 'f+L': 'kick', 'd+L': 'lowkick', H: 'spinkick', 'f+H': 'dropkick', 'dash+H': 'dropkick', 'dash+L': 'kick', 'f+S': 'rush', 'b+S': 'pulse', 'u+L': 'highkick' },
  ai: { range: 5.5, zoning: 0.2, aggression: 0.8 },
  build,
};
