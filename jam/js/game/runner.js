// Runs a mission: warm-up, then the player's simulation and an untouched twin
// (same state, seed and demand, no measures) advance in lockstep.
import { Sim, DT } from '../sim/engine.js';
import { scoreFlow } from './missions.js';

export class MissionRun {
  constructor(ms, opt = {}) {
    this.ms = ms;
    this.def = ms.make(opt.seed, opt.n);
    this.sim = new Sim(this.def);
    const warmSteps = Math.round((ms.warm || 0) / DT);
    for (let i = 0; i < warmSteps; i++) this.sim.step();
    this.sim.st.events = [];
    this.sim.resetMeasure();
    this.twin = ms.kind === 'flow' ? this.sim.clone() : null;
    this.t0 = this.sim.st.t;
    this.started = false;
    this.done = false;
    this.steps = 0;
    this.total = Math.round(ms.dur / DT);
    this.ring = { playerChain: 0, minSpeedAfter: 99, maxJamVeh: 0, jamT: null, braked: false, vsum: 0, vn: 0 };
  }

  start() {
    this.started = true;
    this.sim.resetMeasure();
    if (this.twin) { this.twin = this.sim.clone(); this.resetTwinPolicies(); this.twin.resetMeasure(); }
    this.t0 = this.sim.st.t;
  }

  // the twin always drives with the scenario's default parameters and policies
  resetTwinPolicies() {
    const fresh = new Sim(this.def, { seed: this.def.seed });
    this.twin.p = structuredClone(fresh.p);
    this.twin.pol = structuredClone(fresh.pol);
    for (const v of this.twin.st.vehicles) { v.style = v.uAv < this.twin.p.av ? 'av' : v.baseStyle; v.force = 0; v.forceUntil = 0; }
  }

  step() {
    if (this.done || !this.started) return;
    this.sim.step();
    if (this.twin) this.twin.step();
    this.steps++;
    if (this.ms.kind === 'ring') this.trackRing();
    if (this.steps >= this.total) this.finish();
  }

  trackRing() {
    const sim = this.sim, r = this.ring;
    let best = 0;
    for (const k in sim.st.chains) { const c = sim.st.chains[k]; if (c.player) best = Math.max(best, c.size); }
    r.playerChain = Math.max(r.playerChain, best);
    if (r.braked) {
      for (const v of sim.st.vehicles) if (!v.mark && sim.st.t - (r.brakeT || 0) > 1) r.minSpeedAfter = Math.min(r.minSpeedAfter, v.v * 3.6);
    }
    if (sim.cur) r.maxJamVeh = Math.max(r.maxJamVeh, sim.cur.jamVeh);
    if (r.jamT == null && sim.st.jam.on) r.jamT = sim.st.t - this.t0;
    if (sim.st.n % 20 === 0) { r.vsum += sim.snapshot().v; r.vn++; }
  }

  noteBrake() { if (!this.ring.braked) { this.ring.braked = true; this.ring.brakeT = this.sim.st.t; } }

  finish() {
    this.done = true;
    const ms = this.ms;
    if (ms.kind === 'ring') {
      const r = this.ring;
      this.result = ms.evaluate({ ...r, count: this.sim.st.vehicles.length, meanV: r.vn ? r.vsum / r.vn : 0 });
    } else {
      this.result = scoreFlow(ms, this.sim.st.m, this.twin.st.m);
    }
    return this.result;
  }

  progress() { return Math.min(1, this.steps / this.total); }
}
