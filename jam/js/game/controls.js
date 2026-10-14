// Mapping between UI controls and simulation parameters / policies.
import { KMH } from '../sim/models.js';

export function readControl(sim, id) {
  const p = sim.p, pol = sim.pol;
  switch (id) {
    case 'count': return sim.st.vehicles.length;
    case 'v0': return Math.round(p.v0 / KMH);
    case 'T': return +p.T.toFixed(1);
    case 'lag': return +p.lag.toFixed(1);
    case 'truck': return Math.round(p.truck * 100);
    case 'av': return Math.round(p.av * 100);
    case 'vsl': return Math.round(pol.vsl / KMH);
    case 'meter': { const k = Object.keys(pol.meter)[0]; return k ? pol.meter[k] : 0; }
    case 'peakSpread': return Math.round(pol.peakSpread * 100);
    case 'demandMul': return Math.round(pol.demandMul * 100);
    case 'cycle': return sim.signalPlan() ? sim.signalPlan().cycle : 0;
    case 'split': return sim.signalPlan() ? Math.round(sim.signalPlan().split * 100) : 0;
    default: return !!pol[id];
  }
}

export function applyControl(sim, id, val) {
  const p = sim.p, pol = sim.pol;
  switch (id) {
    case 'count': sim.setCount(val); break;
    case 'v0': p.v0 = val * KMH; break;
    case 'T': p.T = val; break;
    case 'lag': p.lag = val; break;
    case 'truck': p.truck = val / 100; if (sim.def.kind === 'ring') sim.reassign(); break;
    case 'av': p.av = val / 100; if (sim.def.kind === 'ring') sim.reassign(); else reassignAv(sim); break;
    case 'vsl': pol.vsl = val * KMH; break;
    case 'meter': { pol.meter = {}; const r = sim.roads.find((x) => x.signal && x.signal.group === 'meter'); if (r && val > 0) pol.meter[r.id] = val; break; }
    case 'peakSpread': pol.peakSpread = val / 100; break;
    case 'demandMul': pol.demandMul = val / 100; break;
    case 'cycle': pol.signal = { ...(pol.signal || {}), cycle: val, split: pol.signal?.split ?? sim.def.signalPlan.split }; break;
    case 'split': pol.signal = { ...(pol.signal || {}), split: val / 100, cycle: pol.signal?.cycle ?? sim.def.signalPlan.cycle }; break;
    default: pol[id] = !!val;
  }
}

// AV share on open roads: vehicles already driving keep their driver unless
// their own random draw says otherwise (the same draw is used at arrival).
function reassignAv(sim) {
  for (const v of sim.st.vehicles) {
    if (v.mark) continue;
    const want = v.uAv < sim.p.av;
    if (want && v.style !== 'av') { v.style = 'av'; v.vAvg = -1; }
    else if (!want && v.style === 'av') v.style = v.baseStyle || 'normal';
  }
}

// apply a {pol, params} reference / preset object
export function applyPreset(sim, pr) {
  if (pr.params) { Object.assign(sim.p, pr.params); if (pr.params.av != null) reassignAv(sim); }
  if (pr.pol) Object.assign(sim.pol, structuredClone(pr.pol));
}
