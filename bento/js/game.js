// Core game: physics world, dropping, merging, chains, score and game over.
// No DOM access here, so the same code runs in the browser and in node tests.
import { WORLD, PHYS, RULES, POWER, TIERS, MAX_TIER, scoreFor, kingScore, powerSpeed } from './config.js';

const M = () => globalThis.Matter;

let uid = 1;

export class Game {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.handlers = {};
    this.reset();
  }

  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
  emit(name, data) { const hs = this.handlers[name]; if (hs) for (const h of hs) h(data); }

  reset() {
    const { Engine, Events } = M();
    if (this.engine) { Events.off(this.engine); M().World.clear(this.engine.world, false); Engine.clear(this.engine); }
    const engine = Engine.create({ positionIterations: PHYS.POS_ITER, velocityIterations: PHYS.VEL_ITER, enableSleeping: false });
    engine.gravity.y = PHYS.GRAVITY;
    this.engine = engine;
    this._buildWalls();
    this.foods = [];          // live food bodies
    this.pending = [];        // merges found during a step, processed after it
    this.time = 0;
    this.accum = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastMergeAt = -1e9;
    this.lastLevel = 0;
    this.lastMergePos = null;
    this.merges = 0;
    this.kings = 0;
    this.highestTier = 0;
    this.dropCount = 0;
    this.cooldown = 0;
    this.queuedDrop = null;
    this.dangerT = 0;
    this.over = false;
    this.created = new Array(TIERS.length).fill(0); // tiers born this game
    this.history = [];        // last spawned tiers
    this.spawned = 0;
    this.current = this._rollSpawn();
    this.next = this._rollSpawn();
    this.lastDropped = null;
    this.smash = null;        // the current power-drop impact event
    this.smashSeq = 0;
    this.maxSmash = 0;
    this.powerDrops = 0;
    this.powerLive = 0;       // ms left in which extra substeps are used
    Events.on(engine, 'collisionStart', (e) => this._collide(e.pairs, true));
    Events.on(engine, 'collisionActive', (e) => this._collide(e.pairs, false));
  }

  _buildWalls() {
    const { Bodies, Composite } = M();
    const { W, FLOOR, WALL } = WORLD;
    const opt = { isStatic: true, friction: 0.25, frictionStatic: 0.6, restitution: 0.05, label: 'wall' };
    const h = FLOOR + 1200;
    this.walls = [
      Bodies.rectangle(-WALL / 2, FLOOR - h / 2, WALL, h, opt),
      Bodies.rectangle(W + WALL / 2, FLOOR - h / 2, WALL, h, opt),
      Bodies.rectangle(W / 2, FLOOR + WALL / 2, W + WALL * 2, WALL, { ...opt, label: 'floor' }),
    ];
    Composite.add(this.engine.world, this.walls);
  }

  _rollSpawn() {
    const maxT = this.spawned++ < RULES.OPENING_DROPS ? 3 : RULES.SPAWN_TIERS;
    let t = 0;
    for (let tries = 0; tries < 6; tries++) {
      const w = RULES.SPAWN_WEIGHTS.slice(0, maxT);
      const sum = w.reduce((a, b) => a + b, 0);
      let x = this.rng() * sum;
      t = 0;
      while (x >= w[t]) { x -= w[t]; t++; }
      const h = this.history;
      // never three of the same in a row
      if (!(h.length >= 2 && h[h.length - 1] === t && h[h.length - 2] === t)) break;
    }
    this.history.push(t);
    if (this.history.length > 8) this.history.shift();
    return t;
  }

  makeFood(tier, x, y, extra = {}) {
    const { Bodies, Composite } = M();
    const r = TIERS[tier].r;
    const b = Bodies.circle(x, y, r, {
      restitution: PHYS.RESTITUTION, friction: PHYS.FRICTION, frictionStatic: PHYS.FRICTION_STATIC,
      frictionAir: PHYS.FRICTION_AIR, density: PHYS.DENSITY * Math.pow(TIERS[0].r / r, PHYS.DENSITY_FALLOFF), slop: 0.04, label: 'food',
    }, 32);
    b.food = { id: uid++, tier, born: this.time, landed: false, landedAt: 0, dead: false, merging: false, scale: 1, grow: null, ...extra };
    b.prevX = x; b.prevY = y; b.prevA = 0;
    Composite.add(this.engine.world, b);
    this.foods.push(b);
    if (tier > this.highestTier) this.highestTier = tier;
    this.created[tier]++;
    return b;
  }

  get canDrop() { return !this.over && this.cooldown <= 0; }

  clampX(x, tier = this.current) {
    const r = TIERS[tier].r;
    return Math.max(r + 1, Math.min(WORLD.W - r - 1, x));
  }

  // Drop the held piece at world x. Returns the body, or null if not allowed.
  // power: 0 = normal drop ... 1 = strongest power drop
  drop(x, power = 0) {
    if (this.over) return null;
    if (this.cooldown > 0) {
      if (this.cooldown <= RULES.INPUT_BUFFER) this.queuedDrop = { x, power };
      return null;
    }
    return this._doDrop(x, power);
  }

  _doDrop(x, power = 0) {
    const { Body } = M();
    const tier = this.current;
    const p = Math.max(0, Math.min(1, +power || 0));
    const b = this.makeFood(tier, this.clampX(x, tier), WORLD.DROP_Y, { dropping: true, power: p });
    Body.setVelocity(b, { x: 0, y: powerSpeed(p) });
    if (p >= POWER.SMASH_MIN) {
      b.food.baseDensity = b.density;
      this.powerDrops++;
      this.powerLive = 4000;
    }
    this.lastDropped = b;
    this.dropCount++;
    this.current = this.next;
    this.next = this._rollSpawn();
    this.cooldown = RULES.DROP_COOLDOWN;
    this.queuedDrop = null;
    this.emit('drop', { body: b, tier, power: p });
    return b;
  }

  _collide(pairs, start) {
    for (const p of pairs) {
      const a = p.bodyA, b = p.bodyB;
      const fa = a.food, fb = b.food;
      if (fa && !fa.landed) this._land(a);
      if (fb && !fb.landed) this._land(b);
      const sm = this.smash;
      if (sm && this.time <= sm.until && fa && fb) {
        // the shock travels from a struck piece to what it pushes into, while it is still moving
        if (fa.smashId === sm.id && fb.smashId !== sm.id && a.speed >= POWER.SHOCK_SPEED) fb.smashId = sm.id;
        else if (fb.smashId === sm.id && fa.smashId !== sm.id && b.speed >= POWER.SHOCK_SPEED) fa.smashId = sm.id;
      }
      if (start) {
        const rv = Math.abs((a.velocity.x - b.velocity.x) * p.collision.normal.x + (a.velocity.y - b.velocity.y) * p.collision.normal.y);
        if (rv > 1.2) this.emit('impact', { a, b, speed: rv });
      }
      if (!fa || !fb || fa.tier !== fb.tier) continue;
      if (fa.merging || fb.merging || fa.dead || fb.dead) continue;
      fa.merging = fb.merging = true;  // each body joins at most one merge
      this.pending.push([a, b]);
    }
  }

  _land(b) {
    const f = b.food;
    f.landed = true;
    f.landedAt = this.time;
    if (f.dropping) {
      f.dropping = false;
      if (f.power >= POWER.SMASH_MIN) {
        // impact: heavier for a moment, and open a smash event for everything it hits
        M().Body.setDensity(b, f.baseDensity * (1 + POWER.MASS_BOOST * f.power));
        b.restitution = PHYS.RESTITUTION + POWER.BOUNCE * f.power;
        f.boostUntil = this.time + POWER.BOOST_MS;
        this.smash = { id: ++this.smashSeq, power: f.power, start: this.time, until: this.time + POWER.SMASH_WINDOW, count: 0 };
        f.smashId = this.smash.id;
        this.emit('smashImpact', { body: b, power: f.power, x: b.position.x, y: b.position.y + b.circleRadius * 0.6, speed: b.speed });
      }
      this.emit('land', { body: b });
    }
  }

  _isSmash(f) {
    const sm = this.smash;
    return !!sm && f.smashId === sm.id && this.time <= sm.until;
  }

  _remove(b) {
    b.food.dead = true;
    M().Composite.remove(this.engine.world, b);
    const i = this.foods.indexOf(b);
    if (i >= 0) this.foods.splice(i, 1);
    if (this.lastDropped === b) this.lastDropped = null;
  }

  _processMerges() {
    const { Body } = M();
    const list = this.pending;
    this.pending = [];
    for (const [a, b] of list) {
      if (a.food.dead || b.food.dead) continue;
      const tier = a.food.tier;
      const x = (a.position.x + b.position.x) / 2;
      const y = (a.position.y + b.position.y) / 2;
      const vx = (a.velocity.x + b.velocity.x) * 0.25;
      const vy = (a.velocity.y + b.velocity.y) * 0.25;
      const parts = [{ x: a.position.x, y: a.position.y, a: a.angle }, { x: b.position.x, y: b.position.y, a: b.angle }];
      this._remove(a); this._remove(b);

      // chain level: a merge caused by a fresh merge (or by its push) continues the chain,
      // a merge started by a newly dropped piece begins a new one.
      a.food.x = a.position.x; a.food.y = a.position.y;
      const level = this._chainLevel(a.food, b.food);
      // smash: a merge of pieces moved by the current power-drop impact (or of a piece born from one)
      let smash = 0;
      const sm = this.smash;
      if (this._isSmash(a.food) || this._isSmash(b.food)) {
        smash = ++sm.count;
        sm.until = Math.min(sm.start + POWER.SMASH_MAX_MS, Math.max(sm.until, this.time + POWER.SMASH_EXTEND));
        if (smash > this.maxSmash) this.maxSmash = smash;
      }
      this.combo = Math.max(level, smash);   // shown chain count
      this.lastMergeAt = this.time;
      this.lastLevel = level;
      this.lastMergePos = { x, y, r: TIERS[Math.min(MAX_TIER, tier + 1)].r };
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.merges++;

      if (tier === MAX_TIER) {
        // two kings: both vanish with a big bonus
        const points = kingScore(level, smash);
        this.score += points;
        this.kings++;
        this.emit('king', { x, y, points, combo: this.combo, level, smash, parts });
        continue;
      }
      const nt = tier + 1;
      const r = TIERS[nt].r;
      const cx = Math.max(r, Math.min(WORLD.W - r, x));
      const cy = Math.min(y, WORLD.FLOOR - r);
      const firstTime = this.created[nt] === 0;
      const nb = this.makeFood(nt, cx, cy, { landed: true, landedAt: this.time, fromMerge: true, chain: level, smashId: smash ? sm.id : 0 });
      // start at the old size and grow, so neighbours are pushed gently instead of blasted
      const s0 = TIERS[tier].r / r;
      Body.scale(nb, s0, s0);
      nb.food.scale = s0;
      nb.food.grow = { from: s0, t: 0 };
      Body.setVelocity(nb, { x: vx, y: vy });
      const points = scoreFor(nt, level, smash);
      this.score += points;
      this.emit('merge', { body: nb, tier: nt, from: tier, x: cx, y: cy, points, combo: this.combo, level, smash, parts, firstTime });
    }
  }

  _chainLevel(fa, fb) {
    // a piece the player just dropped always starts a new chain
    const dropped = (f) => !f.fromMerge && this.time - f.born <= RULES.CHAIN_LIFE;
    if (dropped(fa) || dropped(fb)) return 1;
    const live = (f) => f.fromMerge && this.time - f.born <= RULES.CHAIN_LIFE ? f.chain : 0;
    const lv = Math.max(live(fa), live(fb));
    if (lv > 0) return lv + 1;
    // two settled pieces shoved together right next to a fresh merge
    const lm = this.lastMergePos;
    if (lm && this.time - this.lastMergeAt <= RULES.PUSH_WINDOW) {
      const d = Math.hypot(fa.x - lm.x, fa.y - lm.y);
      if (d <= lm.r * 2.2 + TIERS[fa.tier].r * 2) return this.lastLevel + 1;
    }
    return 1;
  }

  _grow(step) {
    const { Body } = M();
    for (const b of this.foods) {
      const g = b.food.grow;
      if (!g) continue;
      g.t = Math.min(1, g.t + step / PHYS.GROW_MS);
      const e = 1 - (1 - g.t) * (1 - g.t);
      const s = g.from + (1 - g.from) * e;
      const k = s / b.food.scale;
      Body.scale(b, k, k);
      b.food.scale = s;
      if (g.t >= 1) b.food.grow = null;
    }
  }

  _powerTick(step) {
    const { Body } = M();
    let live = false;
    for (const b of this.foods) {
      const f = b.food;
      if (f.boostUntil && this.time >= f.boostUntil) { Body.setDensity(b, f.baseDensity); b.restitution = PHYS.RESTITUTION; f.boostUntil = 0; }
      if (f.boostUntil || (f.dropping && f.power >= POWER.SMASH_MIN)) live = true;
    }
    // keep the finer solver a little after the impact, while things are still flying
    this.powerLive = live ? 600 : Math.max(0, this.powerLive - step);
    const sm = this.smash;
    if (sm && this.time > sm.until) {
      this.smash = null;
      this.emit('smashEnd', { count: sm.count, power: sm.power });
    }
  }

  _clamp() {
    const { Body } = M();
    for (const b of this.foods) {
      const v = b.velocity;
      const sp = Math.hypot(v.x, v.y);
      const cap = b.food.dropping && b.food.power > 0 ? POWER.FLIGHT_CAP : PHYS.MAX_SPEED;
      if (sp > cap) Body.setVelocity(b, { x: v.x * cap / sp, y: v.y * cap / sp });
      if (Math.abs(b.angularVelocity) > PHYS.MAX_SPIN) Body.setAngularVelocity(b, Math.sign(b.angularVelocity) * PHYS.MAX_SPIN);
      // safety net: anything that escaped the box is put back inside
      const r = b.circleRadius;
      if (b.position.y > WORLD.FLOOR + r || b.position.x < -r || b.position.x > WORLD.W + r) {
        Body.setPosition(b, { x: Math.max(r, Math.min(WORLD.W - r, b.position.x)), y: Math.min(b.position.y, WORLD.FLOOR - r) });
        Body.setVelocity(b, { x: 0, y: 0 });
        this.emit('escape', { body: b });
      }
    }
  }

  _danger(step) {
    let above = false;
    for (const b of this.foods) {
      const f = b.food;
      if (f.dropping || !f.landed) continue;
      if (b === this.lastDropped && this.time - f.landedAt < RULES.DANGER_GRACE) continue;
      if (b.position.y - b.circleRadius < WORLD.TOP) { above = true; break; }
    }
    if (above) this.dangerT += step;
    else this.dangerT = Math.max(0, this.dangerT - step * 2);
    if (this.dangerT >= RULES.OVER_TIME) this._gameOver();
  }

  _gameOver() {
    if (this.over) return;
    this.over = true;
    this.emit('over', { score: this.score, maxCombo: this.maxCombo, highestTier: this.highestTier, merges: this.merges, maxSmash: this.maxSmash, powerDrops: this.powerDrops });
  }

  get danger() { return Math.min(1, this.dangerT / RULES.OVER_TIME); }

  step() {
    const { Engine } = M();
    const step = PHYS.STEP;
    for (const b of this.foods) { b.prevX = b.position.x; b.prevY = b.position.y; b.prevA = b.angle; }
    const n = this.powerLive > 0 ? POWER.SUBSTEPS : PHYS.SUBSTEPS;
    const sub = step / n;
    for (let i = 0; i < n; i++) {
      this._clamp();
      Engine.update(this.engine, sub);
    }
    this.time += step;
    this._processMerges();
    this._grow(step);
    this._clamp();
    this._powerTick(step);
    if (this.combo > 0 && this.time - this.lastMergeAt > RULES.COMBO_WINDOW) {
      const c = this.combo;
      this.combo = 0;
      this.emit('comboEnd', { combo: c });
    }
    if (this.cooldown > 0) {
      this.cooldown -= step;
      if (this.cooldown <= 0) {
        this.cooldown = 0;
        this.emit('ready', {});
        if (this.queuedDrop != null) this._doDrop(this.queuedDrop.x, this.queuedDrop.power);
      }
    }
    this._danger(step);
  }

  // Advance by real elapsed ms with a fixed timestep. Returns interpolation alpha.
  update(dt) {
    if (this.over) return 1;
    this.accum += Math.min(dt, PHYS.STEP * PHYS.MAX_STEPS);
    while (this.accum >= PHYS.STEP && !this.over) { this.step(); this.accum -= PHYS.STEP; }
    return this.over ? 1 : this.accum / PHYS.STEP;
  }

  // Where would a piece dropped at x come to rest first? (for the guide line)
  landingY(x, tier = this.current) {
    const r = TIERS[tier].r;
    let best = WORLD.FLOOR - r;
    for (const b of this.foods) {
      const dx = Math.abs(b.position.x - x), rr = r + b.circleRadius;
      if (dx >= rr) continue;
      const y = b.position.y - Math.sqrt(rr * rr - dx * dx);
      if (y < best) best = y;
    }
    return Math.max(WORLD.DROP_Y, best);
  }

  snapshot() {
    return {
      v: 1, score: this.score, combo: 0, maxCombo: this.maxCombo, merges: this.merges, kings: this.kings,
      highestTier: this.highestTier, dropCount: this.dropCount, current: this.current, next: this.next,
      created: this.created.slice(), history: this.history.slice(),
      foods: this.foods.map((b) => ({ t: b.food.tier, x: +b.position.x.toFixed(2), y: +b.position.y.toFixed(2), a: +b.angle.toFixed(3), vx: +b.velocity.x.toFixed(2), vy: +b.velocity.y.toFixed(2) })),
    };
  }

  restore(s) {
    const { Body } = M();
    this.reset();
    this.score = s.score | 0; this.maxCombo = s.maxCombo | 0; this.merges = s.merges | 0; this.kings = s.kings | 0;
    this.highestTier = s.highestTier | 0; this.dropCount = s.dropCount | 0;
    this.current = s.current | 0; this.next = s.next | 0;
    if (Array.isArray(s.history)) this.history = s.history.slice();
    this.spawned = 99;
    for (const f of s.foods || []) {
      if (!(f.t >= 0 && f.t <= MAX_TIER)) continue;
      const b = this.makeFood(f.t, f.x, f.y, { landed: true, landedAt: -1e9 });
      Body.setAngle(b, f.a || 0);
      Body.setVelocity(b, { x: f.vx || 0, y: f.vy || 0 });
      b.prevA = b.angle;
    }
    if (Array.isArray(s.created)) this.created = s.created.slice();
  }
}
