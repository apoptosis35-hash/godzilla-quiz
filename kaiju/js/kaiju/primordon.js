// PRIMORDON — 原初怪獣プリモルドン. Original classic-style reptile: balanced, savage bites, white-hot breath at close range.
import * as THREE from 'three';
import { poses } from '../rig.js';
import { BP, bipedAnims, bipedGait, bipedProc, TAIL } from './biped.js';
import { makeReptileBuild, reptileMoves, REPTILE_COMMANDS } from './reptile.js';

const build = makeReptileBuild({
  scale: 0.97, seed: 54, skin: 0x48484a, noise: 0.09, normal: 1.9, bodyW: 1.05, armW: 1.0, legW: 1.08, headS: 1.04, snout: 0.82, muzzleW: 1.1, brow: 0.22,
  plate: 0xbdb9b0, glow: 0x9fd8ff, hot: 0xffffff, sheen: 0xd0e8ff, eye: 0xffb040, eyeI: 1.8, plateH: 0.9, plateW: 1.15, plateSpikes: (r) => (r ? 2 : 3), plateRough: 0.55, plateThick: 1.2, rowTilt: 0.35,
});
const P = poses(BP.base, { ...Object.fromEntries(Object.entries(BP).filter(([k]) => k !== 'base')) });
const anims = bipedAnims(P);
const moves = reptileMoves(P, { dmg: 1.0, beam: 0xcfe6ff, core: 0xffffff, mouthY: 9.3, beamName: '白熱ブレス', pulseName: '原初の咆哮', superName: '白熱の大咆哮' });
moves.jab2.cancel.chain = { L: 'bite' };
Object.assign(moves, {
  bite: { name: 'サベージバイト', startup: 12, active: 4, recovery: 18, dmg: 52, height: 'mid', hit: { z: 5, y: 7.5, r: 2.4 }, hitstun: 24, blockstun: 14, push: 0.6, lunge: [[0, 12, 0.14]],
    anim: [[0, P.base], [8, P.biteReach, 'io'], [13, { ...P.biteReach, jaw: [0.05, 0, 0] }, 'snap'], [20, P.biteReach], [32, P.base, 'io']], sfx: [[12, 'bite', { vol: 0.9 }]],
    cancel: { from: 14, until: 24, to: ['breath', 'pulse'], special: true } },
});
moves.grab.throw.events = [[6, 'bite'], [12, 'bite'], [18, 'bite'], [24, 'bite']];
moves.grab.throw.hitMove.dmg = 130;
moves.grab.name = 'ラッシュバイト';
Object.assign(moves.breath, { startup: 22, active: 44, glow: 22, recovery: 22 });
Object.assign(moves.breath.beam, { from: 22, to: 66, width: 2.4, tick: 3, dmg: 8, range: 28, push: 0.12, sweep: 0.02, kind: 'breath' });
moves.breath.anim = [[0, P.base], [12, P.breathCharge, 'io'], [22, P.breathCharge], [25, P.breathFire, 'snap'], [66, P.breathFire], [88, P.base, 'io']];
Object.assign(moves.super.beam, { width: 4, range: 45, tick: 3, dmg: 16, sweep: 0.012, kind: 'breath' });
moves.pulse.name = '原初の咆哮';
for (const k in moves) moves[k].id = k;

export default {
  id: 'primordon', name: 'PRIMORDON', jp: 'プリモルドン', title: '原初怪獣', era: '1954年 大戸島 伝承',
  desc: '古代から眠っていた原初の巨獣。バランスの取れた体格と、獲物に食らいつく噛みつき、至近距離を白く焼き尽くす高熱の吐息を持つ。',
  style: 'バランス型', strengths: '強力な噛みつき・投げ・近距離ブレス', weakness: 'ブレスの射程が短い',
  stats: { power: 4, speed: 3, defense: 3, reach: 2 }, specialNames: ['白熱ブレス', '原初の咆哮', 'アースクエイク'], superName: '白熱の大咆哮',
  hp: 1100, defense: 1.04, walk: 0.09, back: 0.065, side: 0.08, dash: 0.38, evade: 0.32, weight: 1.3, push: 2.35, height: 11.2, stride: 1.3,
  hurt: [{ z: 0, y0: 0, y1: 9.3, r: 2.4 }, { z: 1.6, y0: 8.3, y1: 10.9, r: 1.4 }, { z: -4, y0: 0, y1: 4, r: 1.6 }],
  voice: { pitch: 0.82, rough: 1.1, formant: 0.9 }, color: '#cfe6ff', camH: 1,
  tails: [TAIL], poses: P, anims, gait: bipedGait, proc: bipedProc,
  moves, commands: { ...REPTILE_COMMANDS },
  ai: { range: 5.5, zoning: 0.15, aggression: 0.7 },
  build,
};
