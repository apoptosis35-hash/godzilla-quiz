// CPU opponent: delayed perception + situational decisions (guard, evade, punish, combo, spacing, zoning).
export const LEVELS = {
  EASY: { react: 28, guard: 0.22, evade: 0.05, punish: 0.15, combo: 0.2, aggr: 0.35, lowRead: 0.05, superUse: 0.25, rate: 24, throwTech: 0.05, mistakes: 0.3 },
  NORMAL: { react: 18, guard: 0.5, evade: 0.12, punish: 0.45, combo: 0.5, aggr: 0.5, lowRead: 0.3, superUse: 0.55, rate: 14, throwTech: 0.25, mistakes: 0.15 },
  HARD: { react: 11, guard: 0.72, evade: 0.2, punish: 0.75, combo: 0.8, aggr: 0.62, lowRead: 0.6, superUse: 0.8, rate: 9, throwTech: 0.5, mistakes: 0.06 },
  'VERY HARD': { react: 6, guard: 0.87, evade: 0.28, punish: 0.95, combo: 0.95, aggr: 0.72, lowRead: 0.85, superUse: 0.95, rate: 6, throwTech: 0.75, mistakes: 0.02 },
};

function cmdFor(def, id) {
  for (const k in def.commands) if (def.commands[k] === id) {
    const parts = k.split('+');
    return parts.length === 2 ? { dir: parts[0], b: parts[1] } : { dir: '', b: parts[0] };
  }
  return null;
}

export class AIController {
  constructor(level = 'NORMAL', mode = 'cpu') {
    this.isAI = true;
    this.p = LEVELS[level] || LEVELS.NORMAL;
    this.mode = mode; // cpu | stand | guard | crouch
    this.hist = [];
    this.plan = null;
    this.cool = 0;
    this.holdGuard = 0;
    this.oppGuardRate = 0.3;
    this.rng = Math.random;
  }
  snapshot(f, o) {
    return {
      st: o.state, mv: o.move, mf: o.mf, dist: f.distTo(o), y: o.pos.y,
      startupLeft: o.move ? o.move.startup - o.mf : 0,
      recLeft: o.move ? o.move.startup + o.move.active + o.move.recovery - o.mf : 0,
      beam: !!o.beam, guarding: o.state === 'guard' || o.state === 'crouch' || o.state === 'block',
    };
  }
  get(f, m) {
    const inp = { x: 0, y: 0, held: {}, pressed: {} };
    const o = f.opp;
    this.hist.push(this.snapshot(f, o));
    if (this.hist.length > 40) this.hist.shift();
    if (m.phase !== 'fight') return inp;
    const sgn = m.screenSign(f);
    const toward = (d) => { inp.x = d * sgn; };
    if (this.mode === 'stand') return inp;
    if (this.mode === 'guard' || this.mode === 'crouch') {
      inp.held.B = true; if (this.mode === 'crouch') inp.y = -1;
      return inp;
    }
    const P = this.p;
    const seen = this.hist[Math.max(0, this.hist.length - 1 - P.react)] || this.hist[0];
    const now = this.hist[this.hist.length - 1];
    if (seen.guarding) this.oppGuardRate = this.oppGuardRate * 0.995 + 0.005;
    else this.oppGuardRate *= 0.998;
    const dist = now.dist;
    // throw escape
    if (f.state === 'grabbed' && this.rng() < P.throwTech * 0.2) { inp.pressed.G = true; return inp; }
    // continue an existing guard
    if (this.holdGuard > 0) {
      this.holdGuard--;
      inp.held.B = true;
      if (this.guardLow) inp.y = -1;
      if (f.state === 'block') return inp;
      if (!(seen.st === 'move' || o.beam || this.incoming(f, m))) this.holdGuard = Math.min(this.holdGuard, 2);
      return inp;
    }
    // during own move: try combo cancels
    if (f.state === 'move') {
      const mv = f.move;
      if (mv.cancel && f.connected && f.mf >= mv.cancel.from && this.rng() < P.combo * 0.25) {
        let opts = mv.cancel.to.filter((id) => f.def.moves[id] && !(f.def.moves[id].super && f.meter < 100));
        if (mv.cancel.special && f.meter >= 100 && this.rng() < P.superUse) opts = [f.def.commands.X];
        if (mv.cancel.chain) for (const b in mv.cancel.chain) opts.push('chain:' + b);
        const id = opts[Math.floor(this.rng() * opts.length)];
        if (id && id.startsWith('chain:')) inp.pressed[id.slice(6)] = true;
        else if (id) this.press(f, id, inp, sgn);
      }
      return inp;
    }
    if (f.state === 'down') { if (this.rng() < 0.1) inp.pressed.L = this.rng() < 0.5; return inp; }
    if (!f.isActionable()) return inp;

    // --- defense: react to perceived attacks ---
    const threat = (seen.st === 'move' && seen.startupLeft > -2 && seen.mv && (seen.dist < this.reach(seen.mv) + 2.5)) || seen.beam || this.incoming(f, m);
    if (threat && this.cool <= 0) {
      const r = this.rng();
      if (r < P.evade && !(seen.mv && seen.mv.height === 'throw')) {
        inp.pressed.E = true; inp.y = this.rng() < 0.5 ? 1 : -1; this.cool = 20; return inp;
      }
      if (r < P.evade + P.guard) {
        const mvh = seen.mv && seen.mv.height;
        if (mvh === 'throw') { if (this.rng() < P.lowRead) { inp.y = -1; inp.held.B = true; this.holdGuard = 10; this.guardLow = true; } return inp; }
        this.guardLow = mvh === 'low' ? this.rng() < P.lowRead : (mvh === 'high' && this.rng() < P.lowRead * 0.3);
        inp.held.B = true; if (this.guardLow) inp.y = -1;
        this.holdGuard = 12 + Math.floor(this.rng() * 10);
        return inp;
      }
      this.cool = P.rate;
    }
    if (this.cool > 0) this.cool--;
    // --- punish recovering opponent ---
    if (now.st === 'move' && now.recLeft > 10 && now.startupLeft < 0 && !now.beam && this.rng() < P.punish * 0.3) {
      const best = this.pickMove(f, dist, { fast: true, punish: now.recLeft });
      if (best) { this.press(f, best, inp, sgn); return inp; }
    }
    // --- super ---
    if (f.meter >= 100 && f.def.moves.super && this.rng() < P.superUse * 0.02 && dist < 30 && (o.state === 'move' || o.state === 'hit' || this.rng() < 0.3)) {
      this.press(f, 'super', inp, sgn); return inp;
    }
    // --- oki on downed opponent ---
    if (o.state === 'down' && dist < 9) {
      const low = this.pickMove(f, dist, { otg: true });
      if (low && this.rng() < 0.08) { this.press(f, low, inp, sgn); return inp; }
    }
    // --- plan movement / attack decision every few frames ---
    if (!this.plan || this.plan.t <= 0) this.decide(f, m, dist);
    const pl = this.plan;
    pl.t--;
    if (pl.type === 'attack') {
      if (pl.id) this.press(f, pl.id, inp, sgn);
      this.plan = null;
    } else if (pl.type === 'approach') { toward(1); if (pl.dash && pl.t % 30 === 29) { /* double tap */ toward(1); } }
    else if (pl.type === 'retreat') toward(-1);
    else if (pl.type === 'side') { inp.y = pl.dir; }
    else if (pl.type === 'guard') { inp.held.B = true; }
    else if (pl.type === 'dash') { if (pl.t % 4 < 2) toward(1); }
    return inp;
  }
  incoming(f, m) {
    for (const p of m.projectiles) {
      if (p.owner === f || p.dead) continue;
      const dx = f.pos.x - p.pos.x, dz = f.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 22 && (dx * p.vel.x + dz * p.vel.z) > 0) return true;
    }
    return false;
  }
  reach(mv) {
    if (!mv) return 0;
    if (mv.beam) return 60;
    if (!mv.hit) return mv.proj ? 40 : 6;
    const h = Array.isArray(mv.hit) ? mv.hit : [mv.hit];
    let r = 0; for (const x of h) r = Math.max(r, x.z + x.r + (mv.lunge ? 6 : 0));
    return r;
  }
  pickMove(f, dist, o = {}) {
    const moves = f.def.moves;
    const cands = [];
    for (const id in moves) {
      const mv = moves[id];
      if (!cmdFor(f.def, id)) continue;
      if (mv.super && f.meter < 100) continue;
      if (mv.meterCost && f.meter < mv.meterCost) continue;
      if (mv.cooldown && (f.cooldowns[id] || 0) > 0) continue;
      if (id.startsWith('dash')) continue;
      const reach = this.reach(mv);
      if (reach < dist - 0.5) continue;
      if (o.otg && !mv.otg) continue;
      if (o.fast && mv.startup > Math.min(16, (o.punish || 20) - 2)) continue;
      let w = 1;
      if (mv.height === 'low') w *= 0.6 + this.oppGuardRate;
      if (mv.height === 'throw') w *= 0.3 + this.oppGuardRate * 2;
      if (mv.launch) w *= 1.4;
      if (mv.special) w *= (mv.beam || mv.proj) ? (dist > 12 ? 2 : 0.4) : 0.8;
      if (mv.super) w *= 3;
      if (o.fast) w = (mv.dmg || 30) / mv.startup;
      cands.push([id, w]);
    }
    if (!cands.length) return null;
    let tot = 0; for (const c of cands) tot += c[1];
    let r = this.rng() * tot;
    for (const c of cands) { r -= c[1]; if (r <= 0) return c[0]; }
    return cands[0][0];
  }
  decide(f, m, dist) {
    const P = this.p, ai = f.def.ai || {};
    const r = this.rng();
    const range = ai.range || 6;
    const t = P.rate + Math.floor(this.rng() * P.rate);
    // zoners like range
    if (dist > range + 4) {
      if (this.rng() < (ai.zoning || 0.2)) {
        const z = this.pickMove(f, dist, {});
        if (z && (f.def.moves[z].beam || f.def.moves[z].proj)) { this.plan = { type: 'attack', id: z, t: 1 }; return; }
      }
      this.plan = { type: r < 0.25 ? 'dash' : 'approach', t: t + 10 };
      return;
    }
    if (dist < range + 2.5 && r < P.aggr) {
      const id = this.pickMove(f, dist, {});
      if (id) { this.plan = { type: 'attack', id, t: 1 }; return; }
    }
    if (r < 0.15) { this.plan = { type: 'side', dir: this.rng() < 0.5 ? 1 : -1, t: 12 + Math.floor(this.rng() * 14) }; return; }
    if (r < 0.25 && dist < range) { this.plan = { type: 'retreat', t: t }; return; }
    if (r < 0.32) { this.plan = { type: 'guard', t: t }; return; }
    this.plan = { type: dist > range ? 'approach' : 'wait', t };
  }
  press(f, id, inp, sgn) {
    const c = cmdFor(f.def, id);
    if (!c) return;
    inp.pressed[c.b] = true;
    if (c.dir === 'f') inp.x = sgn;
    else if (c.dir === 'b') inp.x = -sgn;
    else if (c.dir === 'd') inp.y = -1;
    else if (c.dir === 'u') inp.y = 1;
    else if (c.dir === 'dash') { inp.x = sgn; }
  }
}
