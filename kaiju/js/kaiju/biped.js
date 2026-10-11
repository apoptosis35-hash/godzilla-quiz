// Shared upright-kaiju skeleton, pose library and gait used by GORVATH and KUROGANE.
import * as THREE from 'three';
import { Rig, poses, addTo } from '../rig.js';

export function bipedSkeleton(s = 1, o = {}) {
  const rig = new Rig();
  const a = (n, p, x, y, z) => rig.add(n, p, x * s, y * s, z * s);
  a('hips', null, 0, 5.4, 0);
  a('spine', 'hips', 0, 1.3, 0.25);
  a('chest', 'spine', 0, 1.3, 0.35);
  a('neck', 'chest', 0, 1.0, 0.55);
  a('head', 'neck', 0, 0.75, 0.65);
  a('jaw', 'head', 0, -0.25, 0.35);
  for (const [sd, m] of [['L', 1], ['R', -1]]) {
    a('shoulder' + sd, 'chest', 1.45 * m, 0.0, 0.55);
    a('elbow' + sd, 'shoulder' + sd, 0.35 * m, -1.5, 0.45);
    a('wrist' + sd, 'elbow' + sd, 0.05 * m, -1.2, 0.8);
    a('thigh' + sd, 'hips', 1.25 * m, -0.3, 0.1);
    a('knee' + sd, 'thigh' + sd, 0.25 * m, -2.3, 0.85);
    a('ankle' + sd, 'knee' + sd, 0.05 * m, -2.35, -0.75);
  }
  let prev = 'hips';
  const tail = o.tail || [[0, -0.2, -1.3], [0, -0.6, -1.5], [0, -0.65, -1.5], [0, -0.65, -1.45], [0, -0.6, -1.4], [0, -0.55, -1.3], [0, -0.5, -1.2], [0, -0.4, -1.1]];
  tail.forEach((p, i) => { a('tail' + (i + 1), prev, p[0], p[1], p[2]); prev = 'tail' + (i + 1); });
  rig.finalize();
  return rig;
}
export const TAIL = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6', 'tail7', 'tail8'];

const base = {
  _root: [0, 0, 0, 0, 0, 0],
  spine: [0.12, 0, 0], chest: [0.08, 0, 0], neck: [-0.12, 0, 0], head: [0.06, 0, 0], jaw: [0.06, 0, 0],
  shoulderL: [-0.35, 0, 0.22], elbowL: [-0.55, 0, 0], wristL: [0.2, 0, 0],
  shoulderR: [-0.35, 0, -0.22], elbowR: [-0.55, 0, 0], wristR: [0.2, 0, 0],
  thighL: [-0.18, 0, 0.04], kneeL: [0.22, 0, 0], ankleL: [-0.05, 0, 0],
  thighR: [-0.18, 0, -0.04], kneeR: [0.22, 0, 0], ankleR: [-0.05, 0, 0],
  tail1: [0.04, 0, 0], tail2: [0.02, 0, 0], tail3: [-0.02, 0, 0], tail4: [-0.04, 0, 0],
};
const crouchLegs = { _root: [0, -1.1, -0.2, 0.15, 0, 0], thighL: [-0.85, 0, 0.12], kneeL: [1.05, 0, 0], ankleL: [-0.35, 0, 0], thighR: [-0.85, 0, -0.12], kneeR: [1.05, 0, 0], ankleR: [-0.35, 0, 0] };

export const BP = poses(base, {
  guard: { spine: [0.25, 0, 0], neck: [0.05, 0, 0], head: [0.15, 0, 0], shoulderL: [-1.25, 0, 0.3], elbowL: [-1.35, 0, -0.35], shoulderR: [-1.25, 0, -0.3], elbowR: [-1.35, 0, 0.35], wristL: [0.4, 0, 0], wristR: [0.4, 0, 0] },
  crouch: { ...crouchLegs, spine: [0.45, 0, 0], chest: [0.2, 0, 0], neck: [-0.2, 0, 0], shoulderL: [-1.0, 0, 0.1], elbowL: [-1.2, 0, -0.2], shoulderR: [-1.0, 0, -0.1], elbowR: [-1.2, 0, 0.2] },
  hitHigh: { _root: [0, 0, -0.3, -0.12, 0, 0], spine: [-0.25, 0, 0.1], chest: [-0.15, 0, 0], neck: [-0.35, 0, 0], head: [-0.35, 0.2, 0], jaw: [0.55, 0, 0], shoulderL: [-0.2, 0, 0.75], shoulderR: [-0.1, 0, -0.85], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0] },
  hitLow: { _root: [0, -0.3, 0, 0.1, 0, 0.05], spine: [0.45, 0, 0], neck: [0.1, 0, 0], jaw: [0.45, 0, 0], thighL: [0.3, 0, 0.1], kneeL: [0.5, 0, 0] },
  air: { _root: [0, 1.4, 0, -0.55, 0, 0], spine: [-0.3, 0, 0], neck: [-0.4, 0, 0], head: [-0.3, 0, 0], jaw: [0.6, 0, 0], shoulderL: [0.3, 0, 1.0], shoulderR: [0.3, 0, -1.0], thighL: [-0.6, 0, 0.2], thighR: [-0.2, 0, -0.2], kneeL: [0.8, 0, 0], kneeR: [0.5, 0, 0], tail1: [0.3, 0, 0], tail2: [0.2, 0, 0] },
  down: { _root: [0, 1.6, -2.2, -1.5, 0, 0.15], spine: [-0.1, 0, 0], neck: [0.2, 0, 0], head: [0.3, 0.3, 0], jaw: [0.3, 0, 0], shoulderL: [-0.3, 0, 1.1], shoulderR: [-0.3, 0, -1.1], thighL: [-0.9, 0, 0.3], thighR: [-0.5, 0, -0.3], kneeL: [0.9, 0, 0], kneeR: [0.6, 0, 0], tail1: [1.2, 0, 0], tail2: [0.15, 0, 0] },
  kneel: { ...crouchLegs, _root: [0, -1.6, 0, 0.35, 0, 0], spine: [0.5, 0, 0], shoulderL: [-0.6, 0, 0.3], shoulderR: [-0.6, 0, -0.3], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0] },
  roar: { spine: [-0.2, 0, 0], chest: [-0.25, 0, 0], neck: [-0.45, 0, 0], head: [-0.45, 0, 0], jaw: [0.95, 0, 0], shoulderL: [-0.4, 0, 0.9], shoulderR: [-0.4, 0, -0.9], elbowL: [-0.9, 0, 0], elbowR: [-0.9, 0, 0], wristL: [0.6, 0, 0], wristR: [0.6, 0, 0], tail1: [0.25, 0, 0], tail2: [0.15, 0, 0], tail3: [0.1, 0, 0] },
  dash: { _root: [0, -0.2, 0, 0.18, 0, 0], spine: [0.35, 0, 0], neck: [-0.35, 0, 0], shoulderL: [0.1, 0, 0.3], shoulderR: [0.1, 0, -0.3], tail1: [0.2, 0, 0], tail2: [0.1, 0, 0] },
  backdash: { _root: [0, 0, 0, -0.15, 0, 0], spine: [-0.05, 0, 0], shoulderL: [-0.9, 0, 0.3], shoulderR: [-0.9, 0, -0.3], elbowL: [-1.2, 0, 0], elbowR: [-1.2, 0, 0] },
  evade: { _root: [0, -0.5, 0, 0.15, 0, 0.18], spine: [0.3, 0, 0.15], shoulderL: [-0.9, 0, 0.5], shoulderR: [-0.9, 0, -0.5], thighL: [-0.6, 0, 0.3], kneeL: [0.8, 0, 0] },
  grabbed: { _root: [0, 0, 0, -0.35, 0, 0.2], spine: [-0.3, 0, 0.1], neck: [-0.5, 0, 0], jaw: [0.7, 0, 0], shoulderL: [-0.5, 0, 1.1], shoulderR: [-0.5, 0, -1.1], thighL: [-0.4, 0, 0.3], thighR: [0.2, 0, -0.3] },
  // attacks
  clawWindR: { spine: [0.05, -0.45, 0], chest: [0, -0.2, 0], shoulderR: [-0.3, 0.3, -1.2], elbowR: [-0.6, 0, 0], shoulderL: [-0.7, 0, 0.3] },
  clawHitR: { spine: [0.25, 0.5, 0], chest: [0.1, 0.25, 0], shoulderR: [-1.5, -0.4, 0.15], elbowR: [-0.25, 0, 0], wristR: [-0.2, 0, 0], shoulderL: [-0.3, 0, 0.5] },
  clawWindL: { spine: [0.05, 0.45, 0], chest: [0, 0.2, 0], shoulderL: [-0.3, -0.3, 1.2], elbowL: [-0.6, 0, 0], shoulderR: [-0.7, 0, -0.3] },
  clawHitL: { spine: [0.25, -0.5, 0], chest: [0.1, -0.25, 0], shoulderL: [-1.5, 0.4, -0.15], elbowL: [-0.25, 0, 0], wristL: [-0.2, 0, 0], shoulderR: [-0.3, 0, -0.5] },
  overWind: { spine: [-0.3, 0, 0], chest: [-0.2, 0, 0], neck: [-0.2, 0, 0], shoulderL: [-2.6, 0, 0.3], shoulderR: [-2.6, 0, -0.3], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0], jaw: [0.5, 0, 0] },
  overHit: { _root: [0, -0.5, 0.4, 0.2, 0, 0], spine: [0.65, 0, 0], chest: [0.3, 0, 0], neck: [-0.3, 0, 0], shoulderL: [-1.2, 0, 0.25], shoulderR: [-1.2, 0, -0.25], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0], jaw: [0.3, 0, 0] },
  stompWind: { _root: [0, 0.2, 0, -0.05, 0, 0], thighR: [-1.1, 0, -0.2], kneeR: [1.2, 0, 0], spine: [0.05, 0, 0.08], shoulderL: [-0.6, 0, 0.6], shoulderR: [-0.6, 0, -0.6] },
  stompHit: { _root: [0, -0.5, 0.2, 0.1, 0, 0], thighR: [-0.95, 0, -0.15], kneeR: [0.15, 0, 0], ankleR: [0.4, 0, 0], thighL: [0.2, 0, 0], kneeL: [0.6, 0, 0], spine: [0.35, 0, 0] },
  shoulderWind: { _root: [0, -0.4, -0.4, 0.1, 0.5, 0], spine: [0.3, 0.3, 0], shoulderL: [-0.5, 0, 0.1], shoulderR: [-1.0, 0, -0.2], neck: [0.2, 0, 0] },
  shoulderHit: { _root: [0, -0.3, 0.6, 0.25, 0.8, 0], spine: [0.45, 0.3, 0], shoulderL: [-0.2, 0, 0.0], shoulderR: [-1.2, 0, -0.3], neck: [0.3, 0, 0], thighL: [-0.8, 0, 0], kneeL: [0.6, 0, 0], thighR: [0.4, 0, 0] },
  upperWind: { ...crouchLegs, spine: [0.6, 0.3, 0], shoulderR: [0.3, 0, -0.3], elbowR: [-0.3, 0, 0], shoulderL: [-0.8, 0, 0.3] },
  upperHit: { _root: [0, 0.4, 0.2, -0.15, 0, 0], spine: [-0.25, -0.3, 0], chest: [-0.15, 0, 0], neck: [-0.3, 0, 0], shoulderR: [-2.7, 0, -0.1], elbowR: [-0.3, 0, 0], shoulderL: [-0.3, 0, 0.6], jaw: [0.6, 0, 0] },
  biteReach: { _root: [0, -0.3, 0.3, 0.3, 0, 0], spine: [0.5, 0, 0], neck: [0.25, 0, 0], head: [0.1, 0, 0], jaw: [0.9, 0, 0], shoulderL: [-1.5, 0, 0.5], shoulderR: [-1.5, 0, -0.5] },
  biteHold: { spine: [0.0, 0, 0], neck: [-0.3, 0, 0], head: [-0.2, 0, 0], jaw: [0.15, 0, 0], shoulderL: [-1.6, 0, 0.2], shoulderR: [-1.6, 0, -0.2], elbowL: [-1.0, 0, 0], elbowR: [-1.0, 0, 0] },
  biteFling: { spine: [0.3, 1.0, 0], chest: [0.1, 0.5, 0], neck: [0.2, 0.4, 0], jaw: [0.9, 0, 0], shoulderL: [-0.4, 0, 1.0], shoulderR: [-1.4, 0, -0.6] },
  breathCharge: { spine: [-0.15, 0, 0], chest: [-0.3, 0, 0], neck: [-0.35, 0, 0], head: [-0.25, 0, 0], jaw: [0.2, 0, 0], shoulderL: [-0.6, 0, 0.7], shoulderR: [-0.6, 0, -0.7], elbowL: [-1.1, 0, 0], elbowR: [-1.1, 0, 0], tail1: [0.2, 0, 0], tail2: [0.1, 0, 0] },
  breathFire: { _root: [0, 0, -0.3, 0, 0, 0], spine: [0.22, 0, 0], chest: [0.15, 0, 0], neck: [0.05, 0, 0], head: [-0.05, 0, 0], jaw: [0.9, 0, 0], shoulderL: [-0.4, 0, 0.7], shoulderR: [-0.4, 0, -0.7], elbowL: [-0.8, 0, 0], elbowR: [-0.8, 0, 0], thighL: [-0.5, 0, 0.1], kneeL: [0.5, 0, 0], thighR: [0.15, 0, -0.1], tail1: [-0.1, 0, 0] },
  pulse: { _root: [0, -0.3, 0, 0, 0, 0], spine: [-0.1, 0, 0], chest: [-0.2, 0, 0], neck: [-0.4, 0, 0], head: [-0.3, 0, 0], jaw: [0.8, 0, 0], shoulderL: [-0.2, 0, 1.3], shoulderR: [-0.2, 0, -1.3], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], tail1: [0.4, 0, 0] },
  spinWind: { ...crouchLegs, _root: [0, -0.8, 0, 0.15, -0.5, 0], spine: [0.4, -0.3, 0], shoulderL: [-0.6, 0, 0.6], shoulderR: [-0.6, 0, -0.6], tail1: [0.15, 0.4, 0], tail2: [0.1, 0.3, 0] },
});

export function bipedAnims(P) {
  return {
    hit: [[0, P.base], [3, P.hitHigh, 'snap'], [16, P.base, 'io']],
    hitLow: [[0, P.base], [3, P.hitLow, 'snap'], [16, P.base, 'io']],
    getup: [[0, P.down], [10, P.kneel, 'io'], [24, P.base, 'io']],
    evade: [[0, P.base], [5, P.evade], [18, P.evade], [24, P.base]],
    win: [[0, P.base], [25, P.roar, 'io'], [130, P.roar], [170, P.guard, 'io'], [400, P.guard]],
    intro: [[0, P.kneel], [30, P.base, 'io'], [55, P.roar, 'io'], [110, P.roar], [140, P.base, 'io']],
  };
}

// Heavy lumbering gait
export function bipedGait(p, ph, amt, ctx) {
  const s = Math.sin(ph), c = Math.cos(ph);
  const side = Math.abs(ctx.side) > 0.4 && Math.abs(ctx.fighter.fwd) < 0.3;
  if (side) {
    addTo(p, 'thighL', -0.2 * Math.max(0, s), 0, 0.25 * s);
    addTo(p, 'thighR', -0.2 * Math.max(0, -s), 0, 0.25 * s);
    addTo(p, 'kneeL', 0.4 * Math.max(0, s), 0, 0);
    addTo(p, 'kneeR', 0.4 * Math.max(0, -s), 0, 0);
  } else {
    addTo(p, 'thighL', -0.5 * s * amt, 0, 0);
    addTo(p, 'thighR', 0.5 * s * amt, 0, 0);
    addTo(p, 'kneeL', 0.55 * Math.max(0, -c) * amt + 0.1, 0, 0);
    addTo(p, 'kneeR', 0.55 * Math.max(0, c) * amt + 0.1, 0, 0);
    addTo(p, 'ankleL', 0.25 * s * amt, 0, 0);
    addTo(p, 'ankleR', -0.25 * s * amt, 0, 0);
  }
  addTo(p, 'spine', 0.05 * amt, 0.07 * s, 0.06 * s);
  addTo(p, 'shoulderL', 0.18 * s, 0, 0);
  addTo(p, 'shoulderR', -0.18 * s, 0, 0);
  addTo(p, 'neck', 0, -0.05 * s, 0);
  addTo(p, 'tail2', 0, 0.12 * s, 0);
  addTo(p, 'tail4', 0, 0.12 * s, 0);
  const r = p._root || (p._root = [0, 0, 0, 0, 0, 0]);
  r[1] -= Math.abs(c) * 0.22 * amt;
  r[5] += s * 0.04;
}

export function bipedProc(p, ctx) {
  const t = ctx.t;
  addTo(p, 'chest', Math.sin(t * 0.045) * 0.025, 0, 0);
  addTo(p, 'neck', Math.sin(t * 0.045 + 1) * 0.02, Math.sin(t * 0.013) * 0.05, 0);
  addTo(p, 'jaw', Math.max(0, Math.sin(t * 0.03)) * 0.04, 0, 0);
}
