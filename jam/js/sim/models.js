// Car-following (IDM) and lane-changing (MOBIL) building blocks, plus the
// vehicle classes and driver styles. All units SI: m, s, m/s, m/s^2.

export const KMH = 1 / 3.6;

// Vehicle body classes. Multipliers apply on top of the driver style.
export const CLASSES = {
  car:   { name: '乗用車', len: 4.6, width: 1.8, aMul: 1.0, bMul: 1.0, TMul: 1.0, vmax: 140 * KMH },
  truck: { name: 'トラック', len: 11.5, width: 2.5, aMul: 0.45, bMul: 0.8, TMul: 1.15, vmax: 85 * KMH },
  bus:   { name: 'バス', len: 11.0, width: 2.5, aMul: 0.55, bMul: 0.8, TMul: 1.1, vmax: 95 * KMH },
};

// Driver styles. T, lag and noise are multipliers of the global settings so the
// lab sliders move everyone while keeping individual differences.
//   lag   : first-order delay of the actually applied acceleration (reaction + pedal)
//   noise : amplitude of the slowly varying acceleration fluctuation (inattention)
//   p     : MOBIL politeness
export const STYLES = {
  cautious:   { name: '慎重', short: '慎重', TMul: 1.3, a: 1.0, b: 1.7, s0: 2.5, v0Mul: 0.95, lagMul: 1.15, noiseMul: 0.7, p: 0.5, cool: 0.9 },
  normal:     { name: '平均的', short: '平均', TMul: 1.0, a: 1.3, b: 2.0, s0: 2.0, v0Mul: 1.0, lagMul: 1.0, noiseMul: 1.0, p: 0.3, cool: 0.9 },
  aggressive: { name: '車間が短い', short: '短い', TMul: 0.7, a: 1.8, b: 2.6, s0: 1.5, v0Mul: 1.07, lagMul: 0.9, noiseMul: 1.3, p: 0.1, cool: 0.9 },
  av:         { name: '協調自動運転', short: '自動', TMul: 1.0, a: 1.2, b: 2.0, s0: 2.0, v0Mul: 1.0, lagMul: 0.12, noiseMul: 0, p: 0.5, cool: 0.99 },
};
export const STYLE_KEYS = ['cautious', 'normal', 'aggressive', 'av'];

// Intelligent Driver Model, "improved" variant IIDM (Treiber & Kesting,
// Traffic Flow Dynamics, 2013, sec. 11.3.6). Same parameters and dynamics as
// the original IDM, but the equilibrium gap is s0 + vT for all v < v0, which
// gives realistic lane capacities, and a lowered speed limit leads to a
// comfortable slowdown rather than an emergency stop.
//   v: speed, v0: desired speed, gap: bumper-to-bumper distance,
//   dv: approach rate (v - v_leader), T: time gap, s0: jam distance,
//   a: max acceleration, b: comfortable deceleration
export function idm(v, v0, gap, dv, T, s0, a, b) {
  v0 = Math.max(v0, 0.1);
  let free;
  if (v <= v0) free = a * (1 - Math.pow(v / v0, 4));
  else free = -b * (1 - Math.pow(v0 / v, (a * 4) / b));
  if (!(gap < 1e8)) return free;
  const sStar = s0 + Math.max(0, v * T + (v * dv) / (2 * Math.sqrt(a * b)));
  const z = sStar / Math.max(gap, 0.05);
  if (v <= v0) {
    if (z >= 1) return a * (1 - z * z);
    return free > 1e-6 ? free * (1 - Math.pow(z, (2 * a) / free)) : 0;
  }
  return z >= 1 ? free + a * (1 - z * z) : free;
}

// Enhanced IDM / "ACC model" (Kesting, Treiber & Helbing 2010). Blends IIDM
// with the constant-acceleration heuristic (CAH): if the vehicle ahead is not
// braking, a short gap after a cut-in is not treated as an emergency.
//   vl, al: speed and acceleration of the leader, c: coolness (0 = pure IIDM)
export function eidm(v, v0, gap, vl, al, T, s0, a, b, c) {
  const aI = idm(v, v0, gap, v - vl, T, s0, a, b);
  if (!c || !(gap < 1e8)) return aI;
  const g = Math.max(gap, 0.05);
  const alt = Math.min(al, a);
  let aC;
  if (vl * (v - vl) <= -2 * g * alt) aC = (v * v * alt) / Math.max(1e-6, vl * vl - 2 * g * alt);
  else aC = alt - (v > vl ? (v - vl) * (v - vl) : 0) / (2 * g);
  if (aI >= aC) return aI;
  return (1 - c) * aI + c * (aC + b * Math.tanh((aI - aC) / b));
}

// Equilibrium speed (IIDM) for a given bumper-to-bumper gap.
export function idmEqSpeed(gap, v0, T, s0) {
  if (gap <= s0) return 0;
  return Math.min(v0, (gap - s0) / T);
}

// Fundamental diagram of homogeneous IIDM traffic (per lane).
// Returns [{k veh/km, q veh/h, v km/h}]
export function idmFundamental(v0, T, s0, a, len) {
  const out = [];
  for (let k = 2; k <= 1000 / (len + s0) - 0.5; k += 2) {
    const h = 1000 / k, gap = h - len;
    const v = idmEqSpeed(gap, v0, T, s0);
    out.push({ k, q: k * v * 3.6, v: v * 3.6 });
  }
  return out;
}
