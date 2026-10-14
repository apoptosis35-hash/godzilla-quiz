// Scenario definitions. A scenario is static data (roads, lanes, signals,
// demand) plus an optional init() that places the first vehicles.
// Geometry for drawing is produced separately (render/layout.js) because the
// simulation itself is one-dimensional along each road.

import { KMH, idmEqSpeed, STYLES } from './models.js';

const H = 3600;

export function ringScenario(o = {}) {
  const L = o.length ?? 400;
  const def = {
    id: 'ring', kind: 'ring', name: '円形道路', seed: o.seed ?? 7,
    jamRel: 0.35, fdWindow: 10, policies: { avDamp: true },
    params: { v0: (o.v0 ?? 50) * KMH, T: o.T ?? 1.0, lag: o.lag ?? 0.7, noise: o.noise ?? 0.2, truck: o.truck ?? 0, av: o.av ?? 0 },
    roads: [{ id: 'ring', name: '円形道路', length: L, closed: true, main: true, measure: true, lanes: [{ from: 0, to: L }] }],
    init(sim) {
      const n = o.n ?? 22;
      const gap = L / n - 4.6;
      const v = idmEqSpeed(gap, sim.p.v0, sim.p.T, 2, 1.3);
      for (let i = 0; i < n; i++) {
        const veh = sim.placeOnRing((i * L) / n, v);
        if (veh.uCls < sim.p.truck) { veh.cls = 'truck'; veh.len = 11.5; veh.wid = 2.5; }
      }
      sim.buildLanes();
    },
  };
  return def;
}

// ---------------------------------------------------------------------------
// Expressway corridor. Lane 0 is the leftmost lane (Japan drives on the left;
// on-ramps join from the left).
//   o.lanes      number of through lanes
//   o.ramp       { at, acc, len, demand, meterS } on-ramp joining at s = at
//   o.drop       s where the leftmost through lane ends (lane drop)
//   o.grades     [{from,to,g}] uphill sections (sag at the start)
//   o.zones      [{from,to,v0Mul,TMul,label}] e.g. a tunnel
//   o.demand     [[t, veh/h], ...] main-line demand
export function highwayScenario(o) {
  const L = o.length;
  const nl = o.lanes;
  const hasAcc = !!o.ramp;
  const off = hasAcc ? 1 : 0;
  const lanes = [];
  if (hasAcc) lanes.push({ from: o.ramp.at, to: o.ramp.at + o.ramp.acc, merge: true, mergeOnly: true });
  for (let i = 0; i < nl; i++) {
    const ln = { from: 0, to: L };
    if (o.drop && i === 0) { ln.to = o.drop; ln.shoulder = o.shoulder !== false; }
    lanes.push(ln);
  }
  const srcLanes = [];
  for (let i = 0; i < nl; i++) srcLanes.push(i + off);
  const main = {
    id: 'main', name: '本線', length: L, main: true, measure: true, lanes, kind: 'main',
    grades: o.grades || null, zones: o.zones || null,
    source: { lanes: srcLanes, demand: o.demand, peak: o.peak || null },
    vRef: 100 * KMH,
  };
  const roads = [main];
  if (o.ramp) {
    roads.push({
      id: 'ramp', name: '流入ランプ', length: o.ramp.len, main: false, measure: false, ramp: true, kind: 'ramp',
      limit: 90 * KMH, vRef: 80 * KMH,
      lanes: [{ from: 0, to: o.ramp.len }],
      link: { road: 0, lane: 0, s: o.ramp.at },
      signal: { s: o.ramp.meterS ?? 40, group: 'meter' },
      source: { lanes: [0], demand: o.ramp.demand },
    });
  }
  return {
    id: o.id || 'highway', kind: 'highway', name: o.name || '高速道路', seed: o.seed ?? 11,
    jamSpeed: 40 * KMH, vRef: 100 * KMH, fdWindow: 30,
    memory: o.memory === false ? null : { alpha: 1.3, tau: 40 },
    keepBias: o.keepBias ?? 0.15,
    mergeAdvice: o.mergeAdvice,
    params: { v0: 100 * KMH, T: 1.4, lag: 0.6, noise: 0.15, truck: o.truck ?? 0.1, av: 0, ...(o.params || {}) },
    policies: o.policies || {},
    vslZone: o.vsl || null,
    shoulderZone: o.drop ? { road: 'main', from: o.drop - 500, to: o.drop + 10, vmax: 70 * KMH } : null,
    blockages: o.blockages || null,
    roads,
    meta: o.meta || {},
  };
}

// Four approaches crossing at one signalised intersection (straight through only).
export function crossScenario(o) {
  const L = o.length ?? 380, X = o.stop ?? 220;
  const mk = (id, name, lanes, demand, group) => ({
    id, name, length: L, main: false, measure: true, kind: 'street', limit: 50 * KMH, vRef: 50 * KMH,
    lanes: Array.from({ length: lanes }, () => ({ from: 0, to: L })),
    signal: { s: X, group },
    source: { lanes: Array.from({ length: lanes }, (_, i) => i), demand },
  });
  return {
    id: o.id || 'cross', kind: 'cross', name: o.name || '交差点', seed: o.seed ?? 21,
    jamSpeed: 10 * KMH, vRef: 50 * KMH, fdWindow: 30, keepBias: 0.05,
    params: { v0: 50 * KMH, T: 1.3, lag: 0.5, noise: 0.12, truck: o.truck ?? 0.06, av: 0 },
    signalPlan: { cycle: o.cycle ?? 120, split: o.split ?? 0.5, yellow: 3, allRed: 2, offset: 0 },
    roads: [
      mk('eb', '東行き', o.ewLanes ?? 2, o.eb, 'A'),
      mk('wb', '西行き', o.ewLanes ?? 2, o.wb, 'A'),
      mk('nb', '北行き', o.nsLanes ?? 1, o.nb, 'B'),
      mk('sb', '南行き', o.nsLanes ?? 1, o.sb, 'B'),
    ],
    cross: { L, X, box: 18 },
    meta: o.meta || {},
  };
}
