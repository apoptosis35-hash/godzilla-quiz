// JAM LAB traffic engine.
// Microscopic simulation: every vehicle has its own position, speed, actually
// applied acceleration (with reaction/pedal lag), desired speed, time gap and
// driving style. Longitudinal control: IDM. Lane changes: MOBIL.
// Fixed time step, seeded random numbers, and all mutable data kept in plain
// objects (this.st / this.p / this.pol) so a run can be cloned into a "twin"
// that continues without the player's intervention for fair comparisons.

import { rnd, gauss, hash32 } from './rng.js';
import { CLASSES, STYLES, idm, eidm, idmEqSpeed, KMH } from './models.js';

export const DT = 0.05;           // s, fixed integration step
const LC_TIME = 3.0;              // s, lateral motion of a lane change
const LC_INTENT = 0.8;            // s, turn signal before moving over
const MIN_GAP = 0.5;              // m, hard bumper-to-bumper limit
const G = 9.81;
const CAR_COLORS = 9;

export const DEFAULT_PARAMS = {
  v0: 100 * KMH,   // target (desired) speed on main roads
  T: 1.4,          // base safe time gap (s)
  lag: 0.6,        // base reaction / pedal lag (s)
  noise: 0.18,     // base acceleration fluctuation (m/s^2)
  truck: 0.1,      // share of trucks
  bus: 0.0,        // share of buses
  av: 0.0,         // share of cooperative automated vehicles
  mix: { cautious: 0.25, normal: 0.55, aggressive: 0.2 },
};

export const DEFAULT_POLICIES = {
  vsl: 0,            // variable speed limit (m/s) on def.vslZone, 0 = off
  meter: {},         // { roadId: veh/h }, 0/undefined = no metering
  zipper: false,     // cooperative zipper merging at lane ends
  mergeCare: false,  // on-ramp merge management (make room, merge at matched speed)
  avDamp: false,     // automated vehicles use jam-absorption driving
  advice: false,     // early lane-change guidance before a lane drop
  sagInfo: false,    // "speed recovery" information at sags
  keepLeft: false,   // campaign to use the left lane more (lane balance)
  demandMul: 1,      // inflow demand multiplier
  peakSpread: 0,     // 0..1 flatten the demand peak (same total vehicles)
  shoulder: false,   // temporary shoulder lane through the lane drop
  signal: null,      // { cycle, split } for def.signalPlan
};

export class Sim {
  constructor(def, opt = {}) {
    this.def = def;
    this.roads = def.roads;
    this.byId = {};
    this.roads.forEach((r, i) => { r.idx = i; this.byId[r.id] = i; });
    if (opt.state) {
      this.st = opt.state; this.p = opt.p; this.pol = opt.pol;
    } else {
      this.p = structuredClone({ ...DEFAULT_PARAMS, ...(def.params || {}) });
      this.pol = structuredClone({ ...DEFAULT_POLICIES, ...(def.policies || {}) });
      const seed = (opt.seed ?? def.seed ?? 1) >>> 0;
      this.st = {
        seed, t: 0, n: 0, nextId: 1,
        vehicles: [],
        sources: this.roads.map((r, i) => r.source ? { q: [], cum: 0, nextE: 0, rng: { s: hash32(seed, 7, i) }, gen: 0 } : null),
        rng: { s: hash32(seed, 99) },
        chains: {}, chainSeq: 1,
        events: [],
        m: null, meas: null,
        jam: { on: false, onT: 0, offT: 0, tracks: [], seq: 1, first: null, last: 0 },
        fd: [], sec: null,
        pend: [],
      };
      for (const s of this.st.sources) if (s) s.nextE = -Math.log(1 - rnd(s.rng));
      this.resetMeasure();
      this.buildLanes();
      if (def.init) def.init(this);
    }
    this.buildLanes();
    if (!this.st.sec) this.initSections();
  }

  clone() {
    const c = new Sim(this.def, { state: structuredClone(this.st), p: structuredClone(this.p), pol: structuredClone(this.pol) });
    return c;
  }

  // ---------- bookkeeping ----------
  buildLanes() {
    this.L = this.roads.map((r) => r.lanes.map(() => []));
    for (const v of this.st.vehicles) this.L[v.road][v.lane].push(v);
    for (const road of this.L) for (const arr of road) { arr.sort((a, b) => a.s - b.s); arr.forEach((v, i) => (v.idx = i)); }
  }

  initSections() {
    const sec = [];
    this.roads.forEach((r, ri) => {
      if (!r.measure) return;
      const n = Math.max(1, Math.round(r.length / (r.closed ? r.length / 4 : 200)));
      const len = r.length / n;
      for (let i = 0; i < n; i++) sec.push({ road: ri, from: i * len, to: (i + 1) * len, lanes: this.lanesBetween(r, i * len, (i + 1) * len), tt: 0, dd: 0 });
    });
    this.st.sec = { list: sec, t0: this.st.t, win: this.def.fdWindow || 20 };
  }

  lanesBetween(r, a, b) {
    let sum = 0;
    for (const l of r.lanes) sum += Math.max(0, Math.min(b, l.to) - Math.max(a, l.from));
    return sum / (b - a);
  }

  resetMeasure() {
    this.st.m = {
      t0: this.st.t, delay: 0, served: 0, ttSum: 0, hard: 0, maxJam: 0, maxJamVeh: 0, rd: this.roads.map(() => 0), jamSum: 0, jamN: 0,
      rampWait: 0, rampN: 0, jamVehSec: 0, dist: 0, stops: 0, arrived: 0, queued: 0,
    };
  }

  newVehicle(cls, style, extra = {}) {
    const st = this.st;
    const id = st.nextId++;
    const r = { s: hash32(st.seed, 1234, id) };
    const v = {
      id, cls, style, len: CLASSES[cls].len, wid: CLASSES[cls].width,
      road: 0, lane: 0, s: 0, sPrev: 0, v: 0, a: 0, aCmd: 0, xi: 0, rng: r,
      v0f: 1 + 0.04 * Math.max(-2, Math.min(2, gauss(r))),
      uCls: rnd(r), uAv: rnd(r), color: Math.floor(rnd(r) * CAR_COLORS),
      lat: 0, latFrom: 0, latT: 1, intent: null, lcCool: 2 + rnd(r) * 2,
      tArr: st.t, tMain: -1, dist: 0, delay: 0, lam: 1, vAvg: -1,
      light: false, bOn: false, hardOn: false, chain: 0, depth: 0, chainT: -99,
      force: 0, forceUntil: 0, wait: 0, mark: 0, merged: -99, stopped: false,
      pendCls: null, idx: 0, baseStyle: style,
      ...extra,
    };
    return v;
  }

  // Jam threshold. Highways: 40 km/h (the usual Japanese expressway definition).
  // Ring lab: slower than half of the speed the same number of cars would have
  // in perfectly uniform flow (and below 35 % of the target speed).
  jamSpeed() {
    if (!this.def.jamRel) return this.def.jamSpeed ?? 40 * KMH;
    const road = this.roads[0], n = this.st.vehicles.length;
    if (this._jamN !== n || this._jamV0 !== this.p.v0 || this._jamT !== this.p.T) {
      let len = 0; for (const v of this.st.vehicles) len += v.len;
      const gap = n ? (road.length - len) / n : road.length;
      this._jamN = n; this._jamV0 = this.p.v0; this._jamT = this.p.T;
      this._jamVal = Math.min(this.def.jamRel * this.p.v0, 0.5 * idmEqSpeed(gap, this.p.v0, this.p.T, 2, 1.3));
      this._jamVal = Math.max(this._jamVal, 1.5);
    }
    return this._jamVal;
  }

  // ---------- parameters per vehicle ----------
  roadV0(road) { return road.main ? this.p.v0 : road.limit; }

  // grade at s (uphill positive)
  gradeAt(road, s) {
    if (!road.grades) return 0;
    for (const g of road.grades) if (s >= g.from && s < g.to) {
      const ramp = 60; // smooth transitions
      const f = Math.min(1, (s - g.from) / ramp, (g.to - s) / ramp);
      return g.g * Math.max(0, f);
    }
    return 0;
  }

  zoneAt(road, s) {
    if (road.zones) for (const z of road.zones) if (s >= z.from && s < z.to) return z;
    return null;
  }

  // desired speed, time gap etc. for vehicle at (road, s)
  prm(veh, road, s) {
    const st = STYLES[veh.style], cl = CLASSES[veh.cls];
    let v0 = this.roadV0(road) * st.v0Mul * veh.v0f;
    let T = this.p.T * st.TMul * cl.TMul;
    const z = this.zoneAt(road, s);
    if (z) { v0 *= z.v0Mul || 1; T *= z.TMul || 1; if (z.vmax) v0 = Math.min(v0, z.vmax * (veh.style === 'aggressive' ? 1.08 : 1)); }
    const d = this.def;
    if (this.pol.vsl > 0 && d.vslZone && road.id === d.vslZone.road && s >= d.vslZone.from && s < d.vslZone.to) {
      v0 = Math.min(v0, this.pol.vsl * (veh.style === 'aggressive' ? 1.06 : veh.style === 'av' ? 1 : 1.02));
    }
    if (this.pol.shoulder && d.shoulderZone && road.id === d.shoulderZone.road && s >= d.shoulderZone.from - 300 && s < d.shoulderZone.to) {
      v0 = Math.min(v0, d.shoulderZone.vmax);
    }
    v0 = Math.min(v0, cl.vmax);
    if (d.memory && veh.style !== 'av') T *= 1 + (d.memory.alpha - 1) * (1 - veh.lam);
    // drivers accelerate harder on an acceleration lane to reach main-line speed
    const am = road.lanes[veh.lane] && road.lanes[veh.lane].merge && road === this.roads[veh.road] ? 1.6 : 1;
    return { v0, T, s0: st.s0, a: st.a * cl.aMul * am, b: st.b * cl.bMul, p: st.p, cool: this.def.cool ?? st.cool };
  }

  // ---------- signals ----------
  signalPlan() {
    const sp = this.def.signalPlan;
    if (!sp) return null;
    const o = this.pol.signal || {};
    return { cycle: o.cycle || sp.cycle, split: o.split ?? sp.split, Y: sp.yellow, AR: sp.allRed, off: sp.offset || 0 };
  }

  // 'G' | 'Y' | 'R'
  signalState(road) {
    const sig = road.signal;
    if (!sig) return 'G';
    const t = this.st.t;
    if (sig.group === 'meter') {
      const rate = this.pol.meter[road.id] || 0;
      if (rate <= 0) return 'G';
      const cyc = 3600 / rate, g = Math.min(2.0, cyc * 0.6);
      const ph = (t + (sig.phase || 0)) % cyc;
      return ph < g ? 'G' : 'R';
    }
    const P = this.signalPlan();
    const eff = P.cycle - 2 * (P.Y + P.AR);
    const gA = Math.max(5, eff * P.split), gB = Math.max(5, eff - gA);
    const C = gA + gB + 2 * (P.Y + P.AR);
    const ph = (t + P.off) % C;
    // A: green [0,gA), yellow [gA, gA+Y), red otherwise
    if (sig.group === 'A') return ph < gA ? 'G' : ph < gA + P.Y ? 'Y' : 'R';
    const b0 = gA + P.Y + P.AR;
    return ph >= b0 && ph < b0 + gB ? 'G' : ph >= b0 + gB && ph < b0 + gB + P.Y ? 'Y' : 'R';
  }

  // ---------- neighbour search ----------
  // first vehicle in lane array with s > x (excluding ex)
  upper(arr, x, ex) {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].s <= x) lo = m + 1; else hi = m; }
    if (lo < arr.length && arr[lo] === ex) lo++;
    return lo;
  }

  // Nearest thing ahead of a vehicle front at (ri, li, s): { gap, vl, veh, kind }
  ahead(ri, li, s, ex, veh, noEnd) {
    const road = this.roads[ri], arr = this.L[ri][li];
    let best = { gap: Infinity, vl: 0, veh: null, kind: null };
    let i = ex && arr[ex.idx] === ex ? ex.idx + 1 : this.upper(arr, s, ex);
    if (i < arr.length && arr[i] === ex) i++;
    if (i < arr.length) {
      const l = arr[i];
      best = { gap: l.s - l.len - s, vl: l.v, veh: l, kind: 'veh' };
    } else if (road.closed) {
      const l = arr[0];
      if (l && l !== ex) best = { gap: l.s + road.length - l.len - s, vl: l.v, veh: l, kind: 'veh' };
    } else if (road.link) {
      const lk = road.link, arr2 = this.L[lk.road][lk.lane];
      const j = this.upper(arr2, lk.s - 1e-6, null);
      if (j < arr2.length) {
        const l = arr2[j];
        best = { gap: road.length - s + (l.s - l.len - lk.s), vl: l.v, veh: l, kind: 'veh' };
      }
      // the target lane may end too (accel lane): handled once the vehicle is on it
    }
    // lane end
    const lane = road.lanes[li];
    if (!noEnd && lane.to < road.length - 0.01 && !(this.pol.shoulder && lane.shoulder)) {
      const g = lane.to - s;
      if (g < best.gap && g > -5) best = { gap: Math.max(0.05, g), raw: g, vl: 0, veh: null, kind: 'end' };
    }
    // signal stop line
    if (road.signal && s <= road.signal.s + 0.2 && !(veh && (veh.pass === road.idx || veh.sigGo === road.idx))) {
      let stt = this.signalState(road);
      // ramp meter ("one vehicle per green"): every vehicle stops at the line;
      // the one waiting at the line when it turns green is released
      if (road.signal.group === 'meter' && this.pol.meter[road.id] > 0) {
        if (stt === 'G' && veh && road.signal.s - s < 6 && veh.v < 3) veh.pass = road.idx;
        else stt = 'R';
      }
      if (stt !== 'G') {
        const g = road.signal.s - s;
        let stop = true;
        // dilemma zone: decided once at the change - too close to stop -> go
        if (veh && veh === ex && road.signal.group !== 'meter') {
          if (stt === 'Y') stop = g > (veh.v * veh.v) / (2 * 3.2) + 1;
          else stop = g > (veh.v * veh.v) / (2 * 7) + 0.5;
          if (!stop) veh.sigGo = road.idx;
        }
        if (stop && g < best.gap) best = { gap: Math.max(0.05, g), raw: g, vl: 0, veh: null, kind: 'signal' };
      }
    }
    // blockages (accidents)
    if (this.def.blockages) for (const b of this.def.blockages) {
      if (b.road !== road.id || b.lane !== li || this.st.t < b.t0 || this.st.t >= b.t1) continue;
      const g = b.s - s;
      if (g > -1 && g < best.gap) best = { gap: Math.max(0.05, g), raw: g, vl: 0, veh: null, kind: 'block' };
    }
    return best;
  }

  // last vehicle in lane array with s <= x (excluding ex)
  behind(ri, li, s, ex) {
    const road = this.roads[ri], arr = this.L[ri][li];
    let i = this.upper(arr, s, null) - 1;
    if (i >= 0 && arr[i] === ex) i--;
    if (i >= 0) return arr[i];
    if (road.closed && arr.length) { const l = arr[arr.length - 1]; return l === ex ? null : l; }
    return null;
  }

  // ---------- acceleration ----------
  accelFor(veh, ri, li, s, ahead) {
    const road = this.roads[ri], lane = road.lanes[li];
    const P = this.prm(veh, road, s);
    // the end of a lane is handled separately below: drivers keep going and
    // brake "just in time" (IDM would treat it like a stopped car far ahead)
    const lead = ahead.kind === 'end' ? this.ahead(ri, li, s, veh, veh, true) : ahead;
    const dv = veh.v - lead.vl;
    let a;
    if (veh.style === 'av' && lead.veh && lead.gap < 150 && veh.vAvg >= 0) {
      // Cooperative automated vehicle. Normally it simply follows smoothly with
      // a slightly shorter time gap (no reaction lag -> higher capacity). When
      // it senses stop-and-go (large speed fluctuations of the car ahead) it
      // switches to wave damping: drive at the smoothed average speed and use
      // the gap as a buffer instead of copying every braking manoeuvre
      // (cf. Stern et al. 2018, "jam-absorption driving").
      const Tav = P.T * 0.85;
      const sStar = P.s0 + veh.v * Tav;
      if (this.pol.avDamp && veh.vVar > 2.2 * 2.2 && veh.vAvg < 0.8 * P.v0 && lead.veh.style !== 'av') {
        veh.damp = true;
        const target = Math.min(P.v0, veh.vAvg + 0.5 + (lead.gap - sStar > sStar ? 1.5 : 0));
        a = Math.min(eidm(veh.v, P.v0, lead.gap, lead.vl, lead.veh.a, Tav * 0.7, P.s0, P.a, P.b, 0.99), 0.5 * (target - veh.v));
      } else {
        veh.damp = false;
        a = eidm(veh.v, P.v0, lead.gap, lead.vl, lead.veh.a, Tav, P.s0, P.a, P.b, 0.99);
      }
    } else if (lead.veh) a = eidm(veh.v, P.v0, lead.gap, lead.vl, lead.veh.a, P.T, P.s0, P.a, P.b, P.cool);
    else a = idm(veh.v, P.v0, lead.gap, dv, P.T, P.s0, P.a, P.b);
    const ends = lane.to < road.length - 0.01 && !(this.pol.shoulder && lane.shoulder);
    if (ends) {
      const gEnd = lane.to - s;
      const need = (veh.v * veh.v) / (2 * Math.max(0.3, gEnd - 1.5));
      const th = lane.merge ? P.b * 1.2 : P.b * 0.6;
      if (need > th) a = Math.min(a, -need * 1.1);
      if (gEnd < 3) a = Math.min(a, -P.b);
      // acceleration lane: position yourself next to a usable gap in the lane
      // to merge into (match its speed, move forward or drop back within it,
      // or let a car pass if the gap is too small)
      if (lane.merge && li + 1 < road.lanes.length && need <= th) {
        const nb = this.ahead(ri, li + 1, s, veh, veh);
        const fb = this.behind(ri, li + 1, s, veh);
        const back = fb ? s - veh.len - fb.s : Infinity, front = nb.gap;
        const needF = 3 + veh.v * 0.6, needB = 5 + veh.v * 0.5;
        let target = null;
        if (veh.intent) target = nb.veh && front < 80 ? nb.vl : fb ? fb.v : null;
        else if (nb.veh || fb) {
          if (front >= needF && back >= needB) target = nb.veh && front < 80 ? nb.vl + 1 : fb ? fb.v + 1 : null;
          else if (front + back >= needF + needB + 2) target = front < needF ? nb.vl - 4 : fb.v + 4;
          else {
            // this gap is too small: overtake the car alongside if the next gap
            // ahead is free and we are not slower, otherwise let the car behind pass
            let ahead2 = Infinity;
            if (nb.veh) { const n2 = this.ahead(ri, li + 1, nb.veh.s, nb.veh, nb.veh); ahead2 = n2.gap; }
            if (nb.veh && ahead2 > needF + needB + veh.len + 4 && veh.v >= nb.vl - 1.5) target = nb.vl + 5;
            else target = fb ? fb.v - 5 : nb.vl - 4;
          }
        }
        if (target !== null) {
          target = Math.max(0, Math.min(target, P.v0 * 1.12));
          const aF = lead.veh ? eidm(veh.v, P.v0 * 1.15, lead.gap, lead.vl, lead.veh.a, P.T, P.s0, P.a, P.b, P.cool) : P.a;
          a = Math.min(aF, Math.max(-2.2, Math.min(P.a, 0.8 * (target - veh.v))));
        }
      }
      // never roll past the end of the lane
      if (gEnd < 25) a = Math.min(a, idm(veh.v, P.v0, Math.max(0.05, gEnd - 0.5), veh.v, P.T * 0.5, 1, P.a, P.b));
    }
    // grade: drivers compensate only partly (they do not notice the slope)
    const g = this.gradeAt(road, s);
    if (g) {
      let beta = veh.style === 'av' ? 0 : this.pol.sagInfo ? 0.2 : 0.75;
      if (veh.cls !== 'car' && veh.style !== 'av') beta = Math.max(beta, 0.9);
      a -= G * g * (g > 0 ? beta : beta * 0.5);
    }
    return Math.max(-9, Math.min(a, P.a));
  }

  // ---------- main step ----------
  step() {
    const st = this.st, roads = this.roads;
    st.t += DT; st.n++;
    this.applyPending();
    this.sources();
    // sort lanes (nearly sorted -> insertion sort)
    for (const road of this.L) for (const arr of road) {
      for (let i = 1; i < arr.length; i++) {
        const x = arr[i]; let j = i - 1;
        while (j >= 0 && arr[j].s > x.s) { arr[j + 1] = arr[j]; j--; }
        arr[j + 1] = x;
      }
      for (let i = 0; i < arr.length; i++) arr[i].idx = i;
    }
    const vs = st.vehicles;
    // 1) accelerations from the current (old) state
    for (const veh of vs) {
      const ah = this.ahead(veh.road, veh.lane, veh.s, veh, veh);
      veh.ahead = ah;
      let ac = this.accelFor(veh, veh.road, veh.lane, veh.s, ah);
      ac = this.cooperate(veh, ac);
      if (veh.force > 0 || st.t < veh.forceUntil) {
        const dec = veh.force || veh.pulseDec || 3;
        ac = Math.min(ac, veh.v > 0.1 ? -dec : 0);
      }
      veh.aIdm = ac;
      // slowly varying fluctuation (Ornstein-Uhlenbeck)
      const sn = this.p.noise * STYLES[veh.style].noiseMul;
      if (sn > 0) {
        const tau = 2.5;
        veh.xi += (-veh.xi * DT) / tau + sn * Math.sqrt((2 * DT) / tau) * gauss(veh.rng);
        if (veh.v > 0.5 || veh.xi < 0) ac += veh.xi * (veh.v > 0.5 ? 1 : 0);
      }
      veh.aCmd = ac;
    }
    // 2) apply with lag, integrate (ballistic)
    let removed = false;
    for (const veh of vs) {
      const lag = Math.max(0.02, this.p.lag * STYLES[veh.style].lagMul);
      let a = veh.a + (veh.aCmd - veh.a) * Math.min(1, DT / lag);
      // reflex: an emergency is answered without the full delay
      const bE = STYLES[veh.style].b * 1.6;
      if (veh.aCmd < -bE && a > veh.aCmd) a = Math.min(a, veh.a + (veh.aCmd - veh.a) * Math.min(1, (DT / lag) * 3));
      veh.a = a;
      const v0 = veh.v;
      let v1 = v0 + a * DT, ds;
      if (v1 < 0) { ds = a < 0 ? -(v0 * v0) / (2 * a) : 0; v1 = 0; } else ds = (v0 + v1) * 0.5 * DT;
      veh.sPrev = veh.s;
      veh.s += ds; veh.v = v1; veh.dist += ds;
    }
    // 3) hard collision guard (front to back in each lane)
    for (let ri = 0; ri < roads.length; ri++) {
      const road = roads[ri];
      for (let li = 0; li < road.lanes.length; li++) {
        const arr = this.L[ri][li];
        for (let i = arr.length - 1; i >= 0; i--) {
          const veh = arr[i];
          let lim = Infinity, lv = 0;
          if (i < arr.length - 1) { const l = arr[i + 1]; lim = l.s - l.len - MIN_GAP; lv = l.v; }
          else if (road.closed && arr.length > 1) { const l = arr[0]; lim = Math.min(l.s, l.sPrev) + road.length - l.len - MIN_GAP; lv = l.v; }
          else if (road.link) {
            const lk = road.link, arr2 = this.L[lk.road][lk.lane];
            const j = this.upper(arr2, lk.s - 1e-6, null);
            if (j < arr2.length) { const l = arr2[j]; lim = road.length + (Math.min(l.s, l.sPrev) - l.len - lk.s) - MIN_GAP; lv = l.v; }
          }
          // never drive through a red light, a lane end or a blockage
          const ah = veh.ahead;
          if (ah && ah.kind && ah.kind !== 'veh') lim = Math.min(lim, veh.sPrev + Math.max(0, ah.raw ?? ah.gap));
          if (veh.s > lim) {
            const ns = Math.max(veh.sPrev, lim);
            veh.dist -= veh.s - ns; veh.s = ns; veh.v = Math.min(veh.v, lv);
            st.clamps = (st.clamps || 0) + 1;
          }
        }
      }
    }
    // 4) road transitions, wraps, sinks
    for (let k = 0; k < vs.length; k++) {
      const veh = vs[k], road = roads[veh.road];
      if (veh.s < road.length) continue;
      if (road.closed) { veh.s -= road.length; veh.sPrev -= road.length; continue; }
      if (road.link) {
        const lk = road.link;
        this.detach(veh);
        veh.s = lk.s + (veh.s - road.length); veh.sPrev = veh.s - veh.v * DT;
        veh.road = lk.road; veh.lane = lk.lane; veh.lat = lk.lane; veh.latFrom = lk.lane; veh.latT = 1;
        if (roads[lk.road].main && veh.tMain < 0) this.enterMain(veh);
        this.attach(veh);
        continue;
      }
      // leaves the network
      this.detach(veh);
      veh.gone = true; removed = true;
      const m = st.m;
      if (veh.tArr >= m.t0) { m.served++; m.ttSum += st.t - veh.tArr; } else m.served++;
      st.lastExit = st.t;
    }
    if (removed) st.vehicles = vs.filter((v) => !v.gone);
    // 5) lane changes
    this.laneChanges();
    // 6) per-vehicle bookkeeping & events
    this.observe();
  }

  enterMain(veh) {
    veh.tMain = this.st.t;
    const m = this.st.m;
    if (veh.fromRamp) { m.rampWait += this.st.t - Math.max(veh.tArr, m.t0); m.rampN++; }
  }

  detach(veh) {
    const arr = this.L[veh.road][veh.lane];
    const i = arr.indexOf(veh);
    if (i >= 0) arr.splice(i, 1);
    for (let j = 0; j < arr.length; j++) arr[j].idx = j;
  }

  attach(veh) {
    const arr = this.L[veh.road][veh.lane];
    let i = 0; while (i < arr.length && arr[i].s < veh.s) i++;
    arr.splice(i, 0, veh);
    for (let j = 0; j < arr.length; j++) arr[j].idx = j;
  }

  // Zipper / cooperative merging: a main-lane driver near a lane end lets one
  // vehicle from the ending lane in by treating it as a (virtual) leader.
  // Courtesy towards vehicles that must leave an ending lane: a main-lane
  // driver treats the vehicle slightly ahead in the ending lane as a virtual
  // leader if that costs only mild braking. At acceleration lanes ordinary
  // drivers do this a little; "zipper" (lane drops) and "merge management"
  // (on-ramps) make everyone do it, letting vehicles in one by one.
  cooperate(veh, ac) {
    const road = this.roads[veh.road];
    if (road.lanes.length < 2 || veh.style === 'aggressive' && !this.pol.zipper) return ac;
    for (const d of [-1, 1]) {
      const li = veh.lane + d;
      if (li < 0 || li >= road.lanes.length) continue;
      const lane = road.lanes[li];
      if (lane.to >= road.length - 0.01 || (this.pol.shoulder && lane.shoulder)) continue;
      const coop = lane.merge ? (this.pol.mergeCare ? 2.0 : 0.8) : (this.pol.zipper ? 1.5 : 0);
      if (!coop) continue;
      const dEnd = lane.to - veh.s;
      if (dEnd < -10 || dEnd > 260) continue;
      if (veh.ahead && veh.ahead.veh && this.st.t - veh.ahead.veh.merged < 5) continue; // alternate: one in, one through
      const arr = this.L[veh.road][li];
      const j = this.upper(arr, veh.s - 2, null);
      const m = arr[j];
      if (!m || m.s - veh.s > 45 || m.s - m.len - veh.s < 3) continue;
      const P = this.prm(veh, road, veh.s);
      const gap = m.s - m.len - veh.s;
      const aC = idm(veh.v, P.v0, Math.max(0.5, gap), veh.v - m.v, P.T * 0.6, P.s0, P.a, P.b);
      if (aC > -coop) ac = Math.min(ac, aC);
    }
    return ac;
  }

  // ---------- MOBIL ----------
  laneChanges() {
    const st = this.st;
    for (const veh of st.vehicles) {
      if (veh.latT < 1) { veh.latT = Math.min(1, veh.latT + DT / LC_TIME); const e = veh.latT; const k = e * e * (3 - 2 * e); veh.lat = veh.latFrom + (veh.lane - veh.latFrom) * k; }
      veh.lcCool -= DT;
      const road = this.roads[veh.road];
      if (road.lanes.length < 2) continue;
      if (veh.intent) {
        if (st.t >= veh.intent.t) {
          const tgt = veh.intent.lane; veh.intent = null;
          const ev = this.mobil(veh, tgt, true);
          if (ev && ev.ok) this.doChange(veh, tgt);
        }
        continue;
      }
      if (veh.lcCool > 0 || veh.latT < 1) continue;
      if ((st.n + veh.id) % 8 !== 0) continue; // evaluate every 0.4 s
      let best = null;
      for (const d of [-1, 1]) {
        const tgt = veh.lane + d;
        const ev = this.mobil(veh, tgt, false);
        if (ev && ev.ok && (!best || ev.inc > best.inc)) best = { lane: tgt, inc: ev.inc };
      }
      if (best) veh.intent = { lane: best.lane, t: st.t + LC_INTENT * (veh.style === 'aggressive' ? 0.6 : 1) };
    }
  }

  laneExists(road, li, s, ahead = 0) {
    if (li < 0 || li >= road.lanes.length) return false;
    const l = road.lanes[li];
    if (s < l.from || s > l.to) return false;
    if (l.to < road.length - 0.01 && !(this.pol.shoulder && l.shoulder) && l.to - s < ahead) return false;
    return true;
  }

  mobil(veh, tgt, confirm) {
    const road = this.roads[veh.road], ri = veh.road;
    if (!this.laneExists(road, tgt, veh.s, 0)) return null;
    const tl = road.lanes[tgt];
    if (tl.mergeOnly) return null;
    if (tl.shoulder && !this.pol.shoulder) return null;
    const tEnds = tl.to < road.length - 0.01 && !(this.pol.shoulder && tl.shoulder);
    if (tEnds && tl.to - veh.s < 350) return null;
    const cl = road.lanes[veh.lane];
    const cEnds = cl.to < road.length - 0.01 && !(this.pol.shoulder && cl.shoulder);
    const dEnd = cEnds ? cl.to - veh.s : Infinity;
    const P = this.prm(veh, road, veh.s);
    // new leader / follower
    const lead = this.ahead(ri, tgt, veh.s, veh, veh);
    const fol = this.behind(ri, tgt, veh.s, veh);
    if (lead.gap < MIN_GAP + 0.5 + veh.v * 0.1) return { ok: false, why: 'lead' };
    let bSafe = 3;
    if (cEnds && cl.merge) bSafe = 3 + 1.5 * Math.min(1, Math.max(0, (veh.s - cl.from) / (cl.to - cl.from)));
    if (cEnds && dEnd < 120) bSafe = Math.max(bSafe, 3 + Math.min(3, veh.wait * 0.5));
    let aFnew = 0, aF = 0;
    if (fol) {
      const gapB = veh.s - veh.len - fol.s;
      if (gapB < MIN_GAP + 0.5 + Math.max(0, fol.v - veh.v) * 0.6) return { ok: false, why: 'gapB' };
      const Pf = this.prm(fol, road, fol.s);
      aFnew = eidm(fol.v, Pf.v0, gapB, veh.v, veh.a, Pf.T, Pf.s0, Pf.a, Pf.b, Pf.cool);
      if (aFnew < -bSafe) return { ok: false, why: 'safe', aFnew };
      aF = fol.aIdm ?? 0;
    }
    const aC = veh.aIdm ?? 0;
    const aCn = this.accelFor(veh, ri, tgt, veh.s, lead);
    // old follower gains if we leave
    let gainO = 0;
    const of = this.behind(ri, veh.lane, veh.s, veh);
    if (of && veh.ahead) {
      const Po = this.prm(of, road, of.s);
      const g2 = veh.ahead.kind === 'veh' ? veh.ahead.gap + veh.len + (veh.s - of.s - veh.len) : veh.ahead.gap + (veh.s - of.s);
      const aOn = idm(of.v, Po.v0, g2, of.v - veh.ahead.vl, Po.T, Po.s0, Po.a, Po.b);
      gainO = aOn - (of.aIdm ?? 0);
    }
    let inc = aCn - aC + P.p * (aFnew - aF + gainO);
    // lane preference: keep left (lane index 0 is the leftmost lane)
    const right = tgt > veh.lane;
    let bias = this.def.keepBias ?? 0.15;
    if (this.pol.keepLeft) bias += 0.35;
    inc += right ? -bias : bias;
    // merge management: through traffic in the lane next to an acceleration
    // lane moves over in advance to leave room for merging vehicles
    if (this.pol.mergeCare && road.lanes[0].merge && veh.lane === 1 && right) {
      const acc = road.lanes[0];
      if (veh.s > acc.from - 600 && veh.s < acc.to) inc += 0.45;
    }
    if (this.pol.mergeCare && road.lanes[0].merge && tgt === 1 && !right && veh.s > road.lanes[0].from - 600 && veh.s < road.lanes[0].to) inc -= 0.45;
    // mandatory: the current lane ends ahead
    if (cEnds) {
      if (cl.merge) {
        // acceleration lane: by default drivers squeeze in early, often before
        // matching the speed of the main line. With "merge management" they
        // use the lane to accelerate and merge at (nearly) matched speed.
        const along = veh.s - cl.from, total = cl.to - cl.from;
        const frac = along / total;
        const vMain = lead.veh ? lead.vl : P.v0;
        const ready = this.pol.mergeCare ? veh.v > 0.9 * Math.min(vMain, P.v0) || frac > 0.6 : veh.v > 0.7 * Math.min(vMain, P.v0) || frac > 0.35;
        // a mandatory change: only require that the merging driver does not
        // have to brake hard behind the new leader (safety is checked above)
        inc = ready ? 1 + Math.min(0, aCn + 1.2) : -1;
      } else {
        const zone = this.pol.zipper ? 300 : this.pol.advice ? 1200 : (this.def.mergeAdvice || 700);
        if (dEnd < zone * 0.4) inc = 1 + Math.min(0, aCn + 1.5);
        else if (dEnd < zone) inc += 1 + 3 * (1 - dEnd / zone);
        else if (!this.pol.zipper && dEnd < zone * 1.6) inc += 0.3;
      }
    }
    const th = confirm ? 0.05 : 0.2;
    return { ok: inc > th, inc };
  }

  doChange(veh, tgt) {
    this.detach(veh);
    veh.latFrom = veh.lat; veh.lane = tgt; veh.latT = 0;
    veh.lcCool = 4; veh.merged = this.st.t; veh.lcN = (veh.lcN || 0) + 1;
    this.attach(veh);
  }

  // ---------- sources ----------
  demandAt(road, src, t) {
    const pts = road.source.demand;
    let q = pts[pts.length - 1][1];
    for (let i = 0; i < pts.length - 1; i++) {
      if (t >= pts[i][0] && t < pts[i + 1][0]) { const f = (t - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); q = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f; break; }
    }
    if (t < pts[0][0]) q = pts[0][1];
    // peak spreading keeps the total number of trips in the peak window
    if (road.source.peak && this.pol.peakSpread > 0) {
      const pk = road.source.peak; // {from, to, mean}
      if (t >= pk.from && t < pk.to) q = q + (pk.mean - q) * this.pol.peakSpread;
    }
    return q * this.pol.demandMul * (road.source.mul ?? 1);
  }

  sources() {
    const st = this.st;
    let qn = 0;
    for (let ri = 0; ri < this.roads.length; ri++) {
      const road = this.roads[ri], src = st.sources[ri];
      if (!src) continue;
      const q = this.demandAt(road, src, st.t);
      src.cum += (q / 3600) * DT;
      while (src.cum >= src.nextE) {
        src.nextE += -Math.log(1 - rnd(src.rng));
        const u = rnd(src.rng), u2 = rnd(src.rng), u3 = rnd(src.rng);
        const P = this.p;
        const cls = u < P.truck ? 'truck' : u < P.truck + P.bus ? 'bus' : 'car';
        const mx = P.mix; const tot = mx.cautious + mx.normal + mx.aggressive;
        const sty = u2 * tot < mx.cautious ? 'cautious' : u2 * tot < mx.cautious + mx.normal ? 'normal' : 'aggressive';
        src.q.push({ t: st.t, cls, style: sty, uAv: u3 });
        src.gen++;
      }
      // try to insert the head of the queue
      let tries = 0;
      while (src.q.length && tries++ < 3) {
        const a = src.q[0];
        const vh = this.newVehicle(a.cls, a.style, { tArr: a.t, fromRamp: !!road.ramp });
        vh.uAv = a.uAv;
        if (a.uAv < this.p.av && road.allowAv !== false) vh.style = 'av';
        if (!this.insert(vh, ri)) { st.nextId--; break; }
        src.q.shift();
      }
      // waiting vehicles accumulate delay
      st.m.delay += src.q.length * DT;
      st.m.rd[ri] += src.q.length * DT;
      qn += src.q.length;
    }
    st.m.queued = qn;
  }

  insert(veh, ri) {
    const road = this.roads[ri];
    const lanes = road.source.lanes;
    let best = null;
    const P = this.prm(veh, road, 0);
    for (const li of lanes) {
      const arr = this.L[ri][li];
      const l = arr[0];
      if (!l) { if (!best || best.g < 1e9) best = { li, g: 1e9, v: P.v0 * 0.95 }; continue; }
      const gap = l.s - l.len;
      if (gap < P.s0 + 1) continue;
      // enter at the speed of the vehicle ahead if the gap is what the driver
      // would choose at that speed, otherwise at the matching equilibrium speed
      // fastest entry speed (not above the desired speed) that needs no more
      // than mild braking behind the vehicle ahead
      let v = Math.min(P.v0 * 0.95, Math.max(l.v, idmEqSpeed(gap, P.v0, P.T, P.s0)));
      for (let k = 0; k < 40 && (gap < P.s0 + v * P.T * 0.8 || idm(v, P.v0, gap, Math.max(0, v - l.v), P.T, P.s0, P.a, P.b) < -1.2); k++) v *= 0.95;
      if (v < 0.85 * Math.min(l.v, P.v0 * 0.95) || v < 1) continue; // wait for a proper gap instead of entering slowly
      if (!best || gap > best.g) best = { li, g: gap, v };
    }
    if (!best) return false;
    veh.road = ri; veh.lane = best.li; veh.lat = best.li; veh.latFrom = best.li;
    veh.s = 0; veh.sPrev = 0; veh.v = best.v;
    if (road.main) this.enterMain(veh);
    this.st.vehicles.push(veh);
    this.attach(veh);
    return true;
  }

  // ---------- observation: lights, chains, jams, metrics ----------
  observe() {
    const st = this.st, m = st.m, roads = this.roads;
    const jamV = this.jamSpeed();
    for (const veh of st.vehicles) {
      const road = roads[veh.road];
      // brake light
      veh.light = veh.a < -0.35 || (veh.v < 0.3 && veh.aCmd < 0.3);
      // hard braking events
      if (!veh.hardOn && veh.a < -3) { veh.hardOn = true; m.hard++; }
      else if (veh.hardOn && veh.a > -1.5) veh.hardOn = false;
      // stops
      if (!veh.stopped && veh.v < 0.3) { veh.stopped = true; m.stops++; }
      else if (veh.stopped && veh.v > 3) veh.stopped = false;
      // brake chains: a braking onset shortly after the leader's own onset continues its chain
      if (!veh.bOn && veh.a < -1.2) {
        veh.bOn = true;
        const ah = veh.ahead, l = ah && ah.veh;
        if (l && l.chain && st.t - l.chainT < 4 && st.chains[l.chain] && ah.gap < 80) {
          veh.chain = l.chain; veh.depth = l.depth + 1; veh.chainT = st.t;
          const c = st.chains[l.chain];
          if (!c.members[veh.id]) { c.members[veh.id] = 1; c.size++; }
          c.maxDepth = Math.max(c.maxDepth, veh.depth); c.last = st.t; c.lastVeh = veh.id;
          if (c.members[veh.id] === 1 && (c.size === 5 || c.size === 10 || c.size === 20 || c.size === 40) && !c['ev' + c.size] && (c['ev' + c.size] = 1)) st.events.push({ type: 'chain', t: st.t, size: c.size, chain: c.id, player: c.player });
        } else {
          let cause = 'driver';
          if (veh.force > 0 || st.t < veh.forceUntil) cause = 'player';
          else if (ah && ah.kind === 'signal') cause = 'signal';
          else if (ah && ah.kind === 'end') cause = 'laneEnd';
          else if (ah && ah.kind === 'block') cause = 'block';
          else if (l && st.t - l.merged < 4) cause = 'cutIn';
          else if (this.gradeAt(road, veh.s) > 0.005) cause = 'grade';
          const id = st.chainSeq++;
          st.chains[id] = { id, root: veh.id, cause, size: 1, maxDepth: 0, t0: st.t, last: st.t, player: cause === 'player', s: veh.s, road: veh.road, lastVeh: veh.id, members: { [veh.id]: 1 } };
          veh.chain = id; veh.depth = 0; veh.chainT = st.t;
        }
      } else if (veh.bOn && veh.a > -0.4) veh.bOn = false;
      // memory of traffic conditions (capacity drop)
      if (this.def.memory) {
        const P0 = this.roadV0(road);
        veh.lam += ((Math.min(1, veh.v / Math.max(1, P0)) - veh.lam) * DT) / this.def.memory.tau;
      }
      // AV: smoothed speed of the vehicle ahead
      if (veh.style === 'av') {
        const lv = veh.ahead && veh.ahead.veh ? veh.ahead.vl : veh.v;
        veh.vAvg = veh.vAvg < 0 ? lv : veh.vAvg + ((lv - veh.vAvg) * DT) / 30;
        veh.vVar = (veh.vVar || 0) + (((lv - veh.vAvg) * (lv - veh.vAvg) - (veh.vVar || 0)) * DT) / 20;
      }
      if (veh.sigGo !== undefined && (veh.sigGo !== veh.road || !road.signal || veh.s > road.signal.s + 1)) veh.sigGo = undefined;
      // waiting at a lane end
      const ln = road.lanes[veh.lane];
      if (ln.to < road.length - 1 && veh.v < 1 && ln.to - veh.s < 40) veh.wait += DT; else veh.wait = Math.max(0, veh.wait - DT);
      // delay vs reference speed
      const vRef = road.vRef || this.def.vRef || this.p.v0;
      const d = Math.max(0, 1 - veh.v / vRef) * DT;
      veh.delay += d; m.delay += d; m.rd[veh.road] += d;
      m.dist += veh.v * DT;
      if (road.measure && veh.v < jamV) m.jamVehSec += DT;
      // Edie sections
    }
    // Edie generalized flow/density per section
    const sec = st.sec;
    if (sec) {
      for (const veh of st.vehicles) {
        const road = roads[veh.road];
        if (!road.measure) continue;
        for (const s of sec.list) if (s.road === veh.road && veh.s >= s.from && veh.s < s.to) { s.tt += DT; s.dd += veh.v * DT; break; }
      }
      if (st.t - sec.t0 >= sec.win) {
        const dt = st.t - sec.t0;
        for (const s of sec.list) {
          const L = (s.to - s.from) / 1000 * s.lanes;
          const k = s.tt / (dt * L), q = (s.dd / 1000) / (dt / 3600) / L;
          st.fd.push({ t: st.t, k, q, v: k > 0.1 ? q / k : null, road: s.road });
          s.tt = 0; s.dd = 0;
        }
        if (st.fd.length > 600) st.fd.splice(0, st.fd.length - 600);
        sec.t0 = st.t;
      }
    }
    if (st.n % 10 === 0) this.detectJams();
    // forget old chains
    if (st.n % 200 === 0) for (const k in st.chains) if (st.t - st.chains[k].last > 90) delete st.chains[k];
  }

  // Jam clusters: vehicles slower than jamSpeed close to each other on a measured road
  jamClusters() {
    const jamV = this.jamSpeed();
    const out = [];
    this.roads.forEach((road, ri) => {
      if (!road.measure) return;
      const pts = [];
      for (const arr of this.L[ri]) for (const v of arr) if (v.v < jamV) pts.push(v);
      if (!pts.length) return;
      pts.sort((a, b) => a.s - b.s);
      const join = 35;
      let cur = null;
      const cl = [];
      for (const v of pts) {
        const rear = v.s - v.len;
        if (cur && rear - cur.head <= join) { cur.head = Math.max(cur.head, v.s); cur.n++; cur.vs.push(v); }
        else { cur = { road: ri, tail: rear, head: v.s, n: 1, vs: [v] }; cl.push(cur); }
      }
      if (road.closed && cl.length > 1) {
        const a = cl[0], b = cl[cl.length - 1];
        if (a.tail + road.length - b.head <= join) { b.head = a.head + road.length; b.n += a.n; b.vs.push(...a.vs); cl.shift(); }
      }
      if (road.closed && cl.length === 1 && cl[0].n === pts.length && pts.length > 2) {
        // whole ring slow: cap length at the circumference
        const c = cl[0]; if (c.head - c.tail > road.length) { c.tail = 0; c.head = road.length; }
      }
      for (const c of cl) if (c.n >= 3) { c.len = c.head - c.tail; out.push(c); }
    });
    return out;
  }

  detectJams() {
    const st = this.st, J = st.jam, m = st.m;
    const cl = this.jamClusters();
    let maxLen = 0, nVeh = 0;
    for (const c of cl) { maxLen = Math.max(maxLen, c.len); nVeh += c.n; }
    this.cur = { clusters: cl, jamLen: maxLen, jamVeh: nVeh };
    m.maxJam = Math.max(m.maxJam, maxLen); m.maxJamVeh = Math.max(m.maxJamVeh, nVeh);
    m.jamSum += maxLen; m.jamN++;
    // track clusters to estimate the propagation speed of their head (downstream front)
    const prev = J.tracks; const next = [];
    for (const c of cl) {
      const road = this.roads[c.road];
      let best = null, bd = 1e9;
      for (const p of prev) {
        if (p.road !== c.road) continue;
        let d = c.head - p.head;
        if (road.closed) { d = ((d % road.length) + road.length * 1.5) % road.length - road.length / 2; }
        if (Math.abs(d) < 80 && Math.abs(d) < bd) { bd = Math.abs(d); best = p; }
      }
      const tr = best ? { ...best, hist: best.hist.slice(-24) } : { id: J.seq++, road: c.road, born: st.t, hist: [], uw: 0 };
      tr.head = c.head; tr.tail = c.tail; tr.n = c.n; tr.len = c.len;
      // unwrapped head position for ring roads
      if (best) {
        let d = c.head - best.head;
        if (road.closed) d = ((d % road.length) + road.length * 1.5) % road.length - road.length / 2;
        tr.uw = best.uw + d;
      } else tr.uw = c.head;
      tr.hist.push([st.t, tr.uw]);
      tr.speed = regress(tr.hist);
      next.push(tr);
      if (!st.jam.first && c.n >= 4) {
        const headVeh = c.vs.reduce((a, b) => (b.s > a.s ? b : a));
        st.jam.first = { t: st.t, road: c.road, s: c.head, veh: headVeh.id };
      }
    }
    J.tracks = next;
    const big = cl.some((c) => c.n >= 5);
    if (big && !J.on) { if (st.t - J.offT > 6 || !J.onT) { J.on = true; J.onT = st.t; st.events.push({ type: 'jam', t: st.t, len: maxLen, n: nVeh }); } }
    else if (!big && J.on && st.t - J.onT > 4) { J.on = false; J.offT = st.t; st.events.push({ type: 'jamclear', t: st.t }); }
  }

  // ---------- live measurements ----------
  // Instantaneous values on measured roads (Edie's definitions on the whole road):
  //   density k = N / (lane-km), flow q = sum(v) / (lane-km), space-mean speed = q/k
  snapshot() {
    let N = 0, sv = 0, laneKm = 0, slow = 0;
    const jamV = this.jamSpeed();
    this.roads.forEach((r, ri) => {
      if (!r.measure) return;
      let lk = 0; for (const l of r.lanes) lk += (Math.min(r.length, l.to) - Math.max(0, l.from)) / 1000;
      laneKm += lk;
      for (const arr of this.L[ri]) for (const v of arr) { N++; sv += v.v; if (v.v < jamV) slow++; }
    });
    const k = laneKm ? N / laneKm : 0, q = laneKm ? (sv * 3.6) / laneKm : 0;
    return { N, k, q, v: N ? (sv / N) * 3.6 : 0, slow, jamLen: this.cur ? this.cur.jamLen : 0, jamVeh: this.cur ? this.cur.jamVeh : 0 };
  }

  // ---------- inputs (applied at the next step boundary) ----------
  input(cmd) { this.st.pend.push(cmd); }

  applyPending() {
    const st = this.st;
    if (!st.pend.length) return;
    const list = st.pend; st.pend = [];
    for (const c of list) {
      const veh = c.id ? st.vehicles.find((v) => v.id === c.id) : null;
      switch (c.type) {
        case 'brake': if (veh) { veh.force = c.dec; veh.mark = 1; } break;
        case 'release': if (veh) veh.force = 0; break;
        case 'pulse': if (veh) { veh.forceUntil = st.t + c.dur; veh.force = 0; veh.pulseDec = c.dec; veh.mark = 1; } break;
        case 'style': if (veh) { veh.style = c.style; veh.mark = 1; if (c.style === 'av') veh.vAvg = -1; } break;
        default: break;
      }
    }
  }

  // ---------- ring helpers for the lab ----------
  setCount(n) {
    const ri = 0, road = this.roads[0];
    const arr = () => this.L[ri][0];
    let guard = 0;
    while (this.st.vehicles.length < n && guard++ < 400) {
      const a = arr();
      if (!a.length) { this.placeOnRing(0, 0); continue; }
      // largest gap
      let bi = -1, bg = -1;
      for (let i = 0; i < a.length; i++) {
        const v = a[i], l = a[(i + 1) % a.length];
        let g = (l.s - l.len) - v.s; if (i === a.length - 1) g += road.length;
        if (a.length === 1) g = road.length - v.len;
        if (g > bg) { bg = g; bi = i; }
      }
      const P = this.prm({ style: 'normal', cls: 'car', v0f: 1, lam: 1 }, road, 0);
      if (bg < 4.6 * 2 + P.s0 * 2 + 1) break;
      const v = a[bi], l = a[(bi + 1) % a.length];
      const pos = (v.s + bg / 2 + 2.3) % road.length;
      this.placeOnRing(pos, (v.v + l.v) / 2);
    }
    while (this.st.vehicles.length > n) {
      // remove the most recently added vehicle that the player did not touch
      let k = this.st.vehicles.length - 1;
      while (k > 0 && this.st.vehicles[k].mark) k--;
      const veh = this.st.vehicles[k];
      this.detach(veh); this.st.vehicles.splice(k, 1);
    }
  }

  placeOnRing(s, v) {
    const st = this.st;
    const r = { s: hash32(st.seed, 555, st.nextId) };
    const u = rnd(r), u2 = rnd(r);
    const mx = this.p.mix; const tot = mx.cautious + mx.normal + mx.aggressive;
    const sty = u2 * tot < mx.cautious ? 'cautious' : u2 * tot < mx.cautious + mx.normal ? 'normal' : 'aggressive';
    const veh = this.newVehicle('car', sty);
    veh.uCls = u;
    veh.road = 0; veh.lane = 0; veh.s = s; veh.sPrev = s; veh.v = v;
    if (veh.uAv < this.p.av) veh.style = 'av';
    st.vehicles.push(veh); this.attach(veh);
    return veh;
  }

  // apply truck / AV shares to existing vehicles (lab sliders)
  reassign() {
    const road = this.roads[0];
    for (const veh of this.st.vehicles) {
      if (!veh.mark) {
        const wantAv = veh.uAv < this.p.av;
        if (wantAv && veh.style !== 'av') { veh.style = 'av'; veh.vAvg = -1; }
        if (!wantAv && veh.style === 'av') veh.style = veh.baseStyle || 'normal';
      }
      const want = veh.uCls < this.p.truck ? 'truck' : 'car';
      if (want !== veh.cls) veh.pendCls = want;
    }
    this.fixPending(road);
  }

  fixPending(road) {
    for (const veh of this.st.vehicles) {
      if (!veh.pendCls) continue;
      const nl = CLASSES[veh.pendCls].len;
      if (nl <= veh.len) { veh.cls = veh.pendCls; veh.len = nl; veh.wid = CLASSES[veh.cls].width; veh.pendCls = null; continue; }
      // longer body: the rear grows backwards, need room behind
      const b = this.behind(veh.road, veh.lane, veh.s, veh);
      const gapB = b ? ((veh.s - veh.len - b.s) % road.length + road.length) % road.length : Infinity;
      if (gapB > nl - veh.len + 3) { veh.cls = veh.pendCls; veh.len = nl; veh.wid = CLASSES[veh.cls].width; veh.pendCls = null; }
    }
  }
}

function regress(h) {
  if (h.length < 4) return null;
  const n = h.length; let st = 0, sx = 0, stt = 0, stx = 0;
  for (const [t, x] of h) { st += t; sx += x; stt += t * t; stx += t * x; }
  const den = n * stt - st * st;
  if (Math.abs(den) < 1e-9) return null;
  return (n * stx - st * sx) / den;
}

export function runFor(sim, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) sim.step();
}
