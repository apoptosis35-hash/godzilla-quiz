// The runner: pseudo-3D canvas renderer, crowd formation, gates, battles, obstacles, boss and the finish stairs.
import { genLevel, applyOp, opLabel, isGood, ROAD, STEP_DEPTH, STEP_RISE } from './level.js';
import { audio, buzz } from './audio.js';

const CAP = 240;                  // most little runners drawn at once (the count can go far beyond)
const GA = Math.PI * (3 - Math.sqrt(5));
const SPEED = 9.5;
const FONT = '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, sans-serif';
const BLUE = '#2f8cff', RED = '#ff3b55';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.max(0, Math.round(n))));

// ---- sprites: a chunky little runner, 6 run frames + 1 idle frame per colour
function makeSprites(color, dark) {
  const frames = [];
  for (let f = 0; f < 7; f++) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 96;
    const x = c.getContext('2d'); x.lineCap = 'round'; x.lineJoin = 'round';
    const ph = (f / 6) * Math.PI * 2, sw = f === 6 ? 0.12 : Math.sin(ph) * 0.75;
    const limb = (ox, oy, ang, len, col, w) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(ox, oy); x.lineTo(ox + Math.sin(ang) * len, oy + Math.cos(ang) * len); x.stroke(); };
    limb(29, 62, -sw, 27, dark, 11);           // back leg
    limb(31, 40, sw * 0.9, 20, dark, 9);       // back arm
    const g = x.createLinearGradient(0, 30, 0, 66); g.addColorStop(0, color); g.addColorStop(1, dark);
    x.fillStyle = g; x.beginPath(); x.roundRect(19, 32, 26, 34, 12); x.fill();
    limb(35, 62, sw, 27, color, 11);           // front leg
    limb(33, 40, -sw * 0.9, 20, color, 9);     // front arm
    x.fillStyle = color; x.beginPath(); x.arc(32, 19, 15, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,.45)'; x.beginPath(); x.arc(27, 13, 5, 0, Math.PI * 2); x.fill();
    frames.push(c);
  }
  return frames;
}

function sunflower(i, c) { const r = c * Math.sqrt(i + 0.5), a = i * GA; return [r * Math.cos(a), r * Math.sin(a) * 0.8]; }
const spacing = (vis) => clamp(2.4 / Math.sqrt(Math.max(vis, 1)), 0.16, 0.34);

class Crowd {
  constructor(n, x, z) { this.n = n; this.x = x; this.z = z; this.y = 0; this.zs = 1; this.units = []; this.sync(true); }
  get vis() { return Math.min(Math.max(0, Math.round(this.n)), CAP); }
  get radius() { const v = this.vis; return v ? spacing(v) * Math.sqrt(v) : 0; }
  sync(instant) {
    const v = this.vis;
    while (this.units.length < v) {
      const u = { ox: 0, oz: 0, ph: Math.random() * 6, pop: instant ? 1 : 0 };
      if (instant) [u.ox, u.oz] = sunflower(this.units.length, spacing(v));
      this.units.push(u);
    }
    const out = [];
    while (this.units.length > v) out.push(this.units.pop());
    return out;
  }
  frontmost() { let k = 0; for (let i = 1; i < this.units.length; i++) if (this.units[i].oz > this.units[k].oz) k = i; return k; }
  update(dt) {
    const c = spacing(this.units.length), k = Math.min(1, dt * 7);
    this.units.forEach((u, i) => {
      const [tx, tz] = sunflower(i, c);
      u.ox += (tx - u.ox) * k; u.oz += (tz * this.zs - u.oz) * k;
      if (u.pop < 1) u.pop = Math.min(1, u.pop + dt * 5);
    });
  }
  wx(u) { return clamp(this.x + u.ox, -ROAD + 0.18, ROAD - 0.18); }
}

export class Game {
  constructor(canvas, hooks = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.hooks = hooks;
    this.spr = { blue: makeSprites(BLUE, '#1a5fc4'), red: makeSprites(RED, '#b8183a') };
    this.parts = []; this.texts = []; this.confetti = []; this.t = 0; this.shake = 0; this.flash = 0;
    this.input = { down: false, sx: 0, cx: 0 }; this.targetX = 0;
    this.resize(); addEventListener('resize', () => this.resize());
    this.bindInput();
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = W; this.H = H; this.dpr = dpr;
    this.F = Math.min(H * 0.72, W * 1.04);
    this.hor = H * 0.27;
    this.camBack = 8;
    this.camH0 = (H * 0.73 - this.hor) / (this.F / this.camBack);
  }

  bindInput() {
    const cv = this.cv;
    const down = (e) => {
      audio.init();
      this.input.down = true; this.input.sx = e.clientX; this.input.cx = this.targetX;
      if (this.phase === 'ready') this.start();
    };
    const move = (e) => {
      if (!this.input.down || !this.crowd) return;
      const span = Math.min(this.W, 520);
      this.targetX = clamp(this.input.cx + ((e.clientX - this.input.sx) / span) * ROAD * 2.3, -ROAD + 0.3, ROAD - 0.3);
    };
    const up = () => { this.input.down = false; };
    cv.addEventListener('pointerdown', down); addEventListener('pointermove', move);
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.targetX = clamp(this.targetX - 0.9, -ROAD + 0.3, ROAD - 0.3);
      if (e.key === 'ArrowRight') this.targetX = clamp(this.targetX + 0.9, -ROAD + 0.3, ROAD - 0.3);
      if ((e.key === ' ' || e.key === 'Enter') && this.phase === 'ready') { audio.init(); this.start(); }
    });
  }

  // ---- level setup
  load(level, startN) {
    this.lv = genLevel(level);
    this.level = level; this.startN = startN;
    this.crowd = new Crowd(startN, 0, 0);
    this.targetX = 0;
    this.items = this.lv.items.map((it) => {
      const o = { ...it, done: false };
      if (it.kind === 'enemy') o.crowd = new Crowd(it.n, it.x, it.z), o.n0 = it.n;
      if (it.kind === 'boss') o.hp = it.n, o.hp0 = it.n, o.fall = 0, o.atk = 0;
      if (it.kind === 'spinner') o.ang = 0;
      return o;
    });
    this.steps = this.lv.steps.map((s) => ({ ...s, left: 0, lit: 0 }));
    this.stepIdx = -1; this.mult = 1;
    this.phase = 'ready'; this.fight = null;
    this.kills = 0; this.perfect = 0; this.streak = 0; this.bestN = startN; this.endT = 0;
    this.parts.length = 0; this.texts.length = 0; this.confetti.length = 0;
    this.camZ = -this.camBack; this.camX = 0; this.camY = 0;
    this.bubble = 1;
  }
  start() { if (this.phase !== 'ready') return; this.phase = 'run'; this.hooks.onStart && this.hooks.onStart(); }

  get progress() { return clamp(this.crowd.z / this.lv.stairsZ, 0, 1); }

  setCount(n) {
    const c = this.crowd, before = c.n;
    c.n = Math.max(0, Math.round(n));
    this.bestN = Math.max(this.bestN, c.n);
    const gone = c.sync(false);
    for (const u of gone) this.burst(c.wx(u), 0.4, c.z + u.oz, BLUE, 3);
    if (c.n !== before) this.bubble = 1.6;
    if (c.n <= 0) this.lose();
  }

  // ---- particles / text
  burst(x, y, z, color, k = 5, power = 1) {
    if (this.parts.length > 700) return;
    for (let i = 0; i < k; i++) this.parts.push({ x, y, z, vx: (Math.random() - 0.5) * 5 * power, vy: (2 + Math.random() * 4) * power, vz: (Math.random() - 0.3) * 4 * power, life: 0.7 + Math.random() * 0.4, color, s: 0.09 + Math.random() * 0.09 });
  }
  say(text, color = '#fff', size = 46, y = 0.42, sub) { this.texts.push({ text, color, size, x: this.W / 2, y: this.H * y, life: 1.1, t: 0, sub }); }

  // ---- main step
  update(dt) {
    this.t += dt;
    const c = this.crowd;
    if (!c) return;
    c.update(dt);
    if (this.phase === 'run' || this.phase === 'stairs' || this.phase === 'ready') {
      c.x += (this.targetX - c.x) * Math.min(1, dt * 14);
      const lim = Math.max(0.2, ROAD - Math.min(c.radius, 1.7) - 0.1);
      c.x = clamp(c.x, -lim, lim);
    }
    if (this.phase === 'run') this.run(dt);
    else if (this.phase === 'fight') this.doFight(dt);
    else if (this.phase === 'stairs') this.climb(dt);
    else if (this.phase === 'win' || this.phase === 'lose') {
      this.endT += dt;
      if (this.endT > (this.phase === 'win' ? 1.6 : 1.1) && !this.reported) { this.reported = true; this.hooks.onEnd && this.hooks.onEnd(this.result()); }
    }
    // moving hazards & idles
    for (const it of this.items) {
      if (it.kind === 'spinner') it.ang += it.speed * dt;
      if (it.kind === 'enemy') it.crowd.update(dt);
      if (it.kind === 'boss' && it.done) it.fall = Math.min(1, it.fall + dt * 1.8);
    }
    // camera
    const cy = c.y;
    this.camZ += (c.z - this.camBack - this.camZ) * Math.min(1, dt * 10);
    this.camX += (c.x * 0.35 - this.camX) * Math.min(1, dt * 6);
    this.camY += (cy - this.camY) * Math.min(1, dt * 5);
    this.shake = Math.max(0, this.shake - dt * 2.5); this.flash = Math.max(0, this.flash - dt * 3);
    this.bubble += (1 - this.bubble) * Math.min(1, dt * 8);
    // particles
    for (const p of this.parts) { p.life -= dt; p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0) { p.y = 0; p.vy *= -0.3; p.vx *= 0.6; } }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const tx of this.texts) { tx.t += dt; tx.life -= dt; tx.y -= 40 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const p of this.confetti) { p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.vx *= 0.99; }
    this.confetti = this.confetti.filter((p) => p.y < this.H + 40);
  }

  run(dt) {
    const c = this.crowd, z0 = c.z;
    c.z += SPEED * dt;
    const R = c.radius;
    for (const it of this.items) {
      if (it.done) continue;
      if ((it.kind === 'gate' || it.kind === 'slide') && z0 < it.z && c.z >= it.z) this.passGate(it);
      else if (it.kind === 'enemy' && c.z + R + it.crowd.radius + 0.5 >= it.z) { this.beginFight(it); return; }
      else if (it.kind === 'boss' && c.z + R * 0.6 + 2.2 >= it.z) { this.beginFight(it); return; }
      else if (it.kind === 'spinner' || it.kind === 'saw') this.hazard(it);
      if (this.phase !== 'run') return;
    }
    if (c.z >= this.lv.stairsZ - 1.5) { this.phase = 'stairs'; this.stepIdx = -1; c.zs = 0.25; }
  }

  slideX(it) { return Math.sin(this.t * it.speed + it.phase) * (ROAD - 1.75); }

  passGate(it) {
    it.done = true;
    const c = this.crowd, n = c.n;
    let op = null;
    if (it.kind === 'gate') { it.side = c.x < 0 ? 0 : 1; op = it.ops[it.side]; }
    else { const gx = this.slideX(it); it.hitX = gx; if (Math.abs(c.x - gx) < 1.75 + 0.2) op = it.ops[0]; else { this.say('MISS…', '#c9d6e8', 34, 0.45); return; } }
    it.picked = op;
    const res = applyOp(n, op);
    const delta = res - n;
    const best = Math.max(...it.ops.map((o) => applyOp(n, o)));
    const perfect = it.kind === 'gate' && res === best && applyOp(n, it.ops[0]) !== applyOp(n, it.ops[1]);
    this.setCount(res);
    if (this.phase === 'lose') return;
    if (isGood(op)) {
      audio.good(op.t === 'x');
      buzz(15);
      this.say(`${delta >= 0 ? '+' : ''}${fmt(delta)}`, op.t === 'x' ? '#ffe14d' : '#7dfcff', op.t === 'x' ? 64 : 54, 0.5);
      this.burst(c.x, 1.2, c.z + 0.5, op.t === 'x' ? '#ffd23f' : '#5fd0ff', 18, 1.2);
    } else {
      audio.bad(); buzz(60); this.shake = 0.5; this.flash = 0.6;
      this.say(`−${fmt(-delta)}`, '#ff5470', 54, 0.5);
    }
    if (perfect) {
      this.streak++; this.perfect++;
      setTimeout(() => audio.perfect(), 120);
      this.say(this.streak >= 2 ? `PERFECT ×${this.streak}` : 'PERFECT!', '#ffffff', 34, 0.33);
    } else if (it.kind === 'gate') this.streak = 0;
  }

  hazard(it) {
    const c = this.crowd;
    if (Math.abs(it.z - c.z) > 4) return;
    const per = c.n > CAP ? Math.ceil(c.n / CAP) : 1;
    // one hazard can take at most ~18% of the crowd, so it hurts without ending the run on its own
    if (it.cap === undefined) { it.cap = Math.ceil(c.n * 0.18) + 1; it.killed = 0; }
    let hits = 0;
    for (let i = c.units.length - 1; i >= 0; i--) {
      if (it.killed + (hits + 1) * per > it.cap) break;
      const u = c.units[i], ux = c.wx(u), uz = c.z + u.oz;
      if (u.pop < 1) continue;            // freshly spawned runners are briefly safe
      let hit = false;
      if (it.kind === 'spinner') {
        const dx = Math.cos(it.ang) * it.len, dz = Math.sin(it.ang) * it.len;
        // distance from unit to the bar segment through (it.x, it.z)
        const px = ux - it.x, pz = uz - it.z, L2 = dx * dx + dz * dz;
        const t = clamp((px * dx + pz * dz) / L2, -1, 1);
        hit = Math.hypot(px - t * dx, pz - t * dz) < 0.26;
      } else {
        const sx = Math.sin(this.t * it.speed + it.phase) * it.amp;
        hit = Math.abs(ux - sx) < 0.75 && Math.abs(uz - it.z) < 0.3;
      }
      if (hit) { hits++; c.units.splice(i, 1); this.burst(ux, 0.4, uz, BLUE, 4, 1.3); }
    }
    if (hits) {
      it.killed += hits * per;
      c.n = Math.max(0, c.n - hits * per); this.bubble = 1.6;
      c.sync(false); audio.pop(); buzz(20); this.shake = Math.max(this.shake, 0.25);
      if (c.n <= 0) this.lose();
    }
    if (c.z > it.z + 2) it.done = true;
  }

  beginFight(it) {
    this.phase = 'fight';
    this.fight = { it, rate: 0, t: 0 };
    if (it.kind === 'boss') { audio.boss(); this.shake = 0.6; buzz(80); }
    else buzz(30);
    const total = it.kind === 'boss' ? it.hp : it.n;
    this.fight.rate = Math.max(8, total / (it.kind === 'boss' ? 1.6 : 0.9));
  }

  doFight(dt) {
    const f = this.fight, it = f.it, c = this.crowd;
    f.t += dt;
    f.acc = (f.acc || 0) + f.rate * dt;
    let k = Math.floor(f.acc); f.acc -= k;
    const enemyN = it.kind === 'boss' ? it.hp : it.crowd.n;
    // the enemy crowd rushes in
    if (it.kind === 'enemy') {
      const ec = it.crowd, targetZ = c.z + c.radius * 0.6 + ec.radius * 0.6 + 0.2;
      ec.z += (targetZ - ec.z) * Math.min(1, dt * 6); ec.x += (c.x - ec.x) * Math.min(1, dt * 4);
    } else { it.atk += dt; c.z += (it.z - c.radius * 0.6 - 0.9 - c.z) * Math.min(1, dt * 3); }
    k = Math.min(k, enemyN, c.n);
    if (k > 0) {
      const contactZ = it.kind === 'boss' ? it.z - 1 : (c.z + it.crowd.z) / 2;
      for (let j = 0; j < Math.min(k, 6); j++) this.burst(c.x + (Math.random() - 0.5) * 2, 0.5, contactZ, Math.random() < 0.5 ? BLUE : RED, 2);
      audio.pop();
      // player side loses its front runners
      c.n -= k; this.kills += k;
      while (c.units.length > c.vis) c.units.splice(c.frontmost(), 1);
      this.bubble = 1.4;
      if (it.kind === 'boss') { it.hp -= k; this.shake = Math.max(this.shake, 0.18); }
      else { const ec = it.crowd; ec.n -= k; while (ec.units.length > ec.vis) { let m = 0; for (let i = 1; i < ec.units.length; i++) if (ec.units[i].oz < ec.units[m].oz) m = i; ec.units.splice(m, 1); } }
    }
    const left = it.kind === 'boss' ? it.hp : it.crowd.n;
    if (c.n <= 0) { this.lose(); return; }
    if (left <= 0) {
      it.done = true; this.fight = null; this.phase = 'run';
      if (it.kind === 'boss') { audio.win(); this.say('BOSS撃破!', '#ffe14d', 52, 0.36); this.burst(0, 3, it.z, RED, 40, 2); this.shake = 1; buzz(120); }
      else { this.say('WIN!', '#ffffff', 40, 0.4); audio.coin(); }
    }
  }

  climb(dt) {
    const c = this.crowd;
    const next = this.stepIdx + 1;
    if (next >= this.steps.length) return this.win();
    const s = this.steps[next];
    const atZ = s.z - 0.35;
    if (c.z < atZ) { c.z = Math.min(atZ, c.z + SPEED * 0.55 * dt); return; }
    if (c.n < s.cost + 1) return this.win();     // keep at least one runner on top
    this.stepIdx = next;
    c.n -= s.cost; s.left = Math.min(s.cost, 9); s.lit = 1;
    c.sync(false);
    c.y = (next + 1) * STEP_RISE; this.mult = s.mult; this.bubble = 1.4;
    audio.step(next); buzz(8);
    c.z = s.z + 0.05;
  }

  win() {
    if (this.phase === 'win') return;
    this.phase = 'win'; this.endT = 0; this.reported = false;
    if (this.stepIdx >= 0) this.steps[this.stepIdx].lit = 2;
    audio.win(); buzz(100);
    for (let i = 0; i < 140; i++) this.confetti.push({ x: this.W * Math.random(), y: -20 - Math.random() * this.H * 0.4, vx: (Math.random() - 0.5) * 160, vy: Math.random() * 120, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, c: `hsl(${Math.random() * 360},95%,60%)`, w: 6 + Math.random() * 6 });
  }
  lose() {
    if (this.phase === 'lose' || this.phase === 'win') return;
    this.phase = 'lose'; this.endT = 0; this.reported = false;
    audio.lose(); buzz(200); this.shake = 0.8;
    // how many more runners would have been enough for the fight that ended the run
    const f = this.fight;
    this.deficit = f ? Math.max(1, Math.round(f.it.kind === 'boss' ? f.it.hp : f.it.crowd.n)) : 0;
    this.fight = null;
  }
  result() {
    return { win: this.phase === 'win', level: this.level, mult: this.mult, kills: this.kills, perfect: this.perfect, left: this.crowd.n, best: this.bestN, progress: this.progress, deficit: this.deficit || 0, bonus: this.lv.bonus, step: this.stepIdx };
  }

  // ---- autopilot (tests / attract mode): steer to the better gate, dodge hazards a little
  autopilot() {
    const c = this.crowd;
    const it = this.items.find((i) => !i.done && (i.kind === 'gate' || i.kind === 'slide') && i.z > c.z);
    if (!it) { this.targetX = 0; return; }
    if (it.kind === 'gate') { const r = it.ops.map((o) => applyOp(c.n, o)); this.targetX = r[0] >= r[1] ? -1.75 : 1.75; }
    else { const dt = (it.z - c.z) / SPEED; this.targetX = Math.sin((this.t + dt) * it.speed + it.phase) * (ROAD - 1.75); }
  }

  // =================================================================== rendering
  P(x, y, z) {
    const dz = z - this.camZ;
    if (dz < 0.25) return null;
    const s = this.F / dz;
    return { x: this.W / 2 + (x - this.camX) * s, y: this.hor + (this.camH0 + this.camY - y) * s, s };
  }

  render() {
    const g = this.ctx, W = this.W, H = this.H;
    g.save();
    if (this.shake > 0) { const a = this.shake * 9; g.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a); }
    this.drawBackdrop(g);
    if (this.crowd) { this.drawRoad(g); this.drawWorld(g); this.drawOverlays(g); }
    g.restore();
    if (this.flash > 0) { g.fillStyle = `rgba(255,40,70,${this.flash * 0.35})`; g.fillRect(0, 0, W, H); }
    for (const tx of this.texts) {
      const a = Math.min(1, tx.life * 2.5), sc = tx.t < 0.12 ? 0.6 + tx.t / 0.12 * 0.6 : 1.2 - Math.min(0.2, (tx.t - 0.12) * 1.5);
      g.save(); g.globalAlpha = a; g.translate(tx.x, tx.y); g.scale(sc, sc);
      g.font = `900 ${tx.size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = tx.size * 0.16; g.strokeStyle = 'rgba(10,20,50,.85)'; g.lineJoin = 'round';
      g.strokeText(tx.text, 0, 0); g.fillStyle = tx.color; g.fillText(tx.text, 0, 0); g.restore();
    }
    for (const p of this.confetti) { g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); g.restore(); }
  }

  drawBackdrop(g) {
    const W = this.W, H = this.H, hor = this.hor;
    const sky = g.createLinearGradient(0, 0, 0, hor);
    sky.addColorStop(0, '#46b6ff'); sky.addColorStop(1, '#bfeaff');
    g.fillStyle = sky; g.fillRect(-20, -20, W + 40, hor + 21);
    // soft clouds drifting
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 5; i++) {
      const x = ((i * 173 + this.t * 6) % (W + 200)) - 100, y = hor * (0.25 + (i % 3) * 0.18), r = 18 + (i % 2) * 10;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.arc(x + r, y - r * 0.4, r * 1.2, 0, 7); g.arc(x + r * 2.2, y, r * 0.9, 0, 7); g.fill();
    }
    const sea = g.createLinearGradient(0, hor, 0, H);
    sea.addColorStop(0, '#8fdcff'); sea.addColorStop(1, '#2f9ee8');
    g.fillStyle = sea; g.fillRect(-20, hor, W + 40, H - hor + 20);
    g.fillStyle = 'rgba(255,255,255,.25)';
    for (let i = 0; i < 14; i++) { const z = 4 + ((i * 7.3 - this.camZ) % 90 + 90) % 90; const p = this.P((i % 2 ? -1 : 1) * (8 + (i * 3.7) % 14), 0, this.camZ + z); if (p) g.fillRect(p.x - p.s * 0.6, p.y, p.s * 1.2, Math.max(1, p.s * 0.06)); }
  }

  drawRoad(g) {
    const z0 = Math.max(this.camZ + 0.3, -20), z1 = Math.min(this.camZ + 110, this.lv.stairsZ);
    const seg = 2;
    const start = Math.floor(z1 / seg) * seg;
    for (let z = start; z >= z0 - seg; z -= seg) {
      const za = Math.max(z, z0), zb = Math.min(z + seg, z1);
      if (zb <= za) continue;
      const a = this.P(-ROAD, 0, za), b = this.P(ROAD, 0, za), c = this.P(ROAD, 0, zb), d = this.P(-ROAD, 0, zb);
      if (!a || !d) continue;
      const k = Math.floor(z / seg) & 1;
      // side thickness
      const a2 = this.P(-ROAD, -0.5, za), b2 = this.P(ROAD, -0.5, za);
      g.fillStyle = '#7a8ba6';
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(d.x, d.y); g.lineTo(d.x, d.y + (a2.y - a.y) * (d.s / a.s)); g.lineTo(a2.x, a2.y); g.fill();
      g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(c.x, c.y + (b2.y - b.y) * (c.s / b.s)); g.lineTo(b2.x, b2.y); g.fill();
      g.fillStyle = k ? '#f1f5fb' : '#e2e9f3';
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.fill();
      // kerbs
      const e = 0.28;
      for (const side of [-1, 1]) {
        const p1 = this.P(side * ROAD, 0, za), p2 = this.P(side * (ROAD - e), 0, za), p3 = this.P(side * (ROAD - e), 0, zb), p4 = this.P(side * ROAD, 0, zb);
        g.fillStyle = k ? '#ff7a3d' : '#ffffff';
        g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.lineTo(p4.x, p4.y); g.fill();
      }
    }
    // checkered start line
    for (let i = 0; i < 10; i++) {
      const xa = this.P(-ROAD + i * 0.7, 0, 2.6), xb = this.P(-ROAD + (i + 1) * 0.7, 0, 3.2);
      if (xa && xb) { g.fillStyle = i & 1 ? '#222' : '#fff'; g.fillRect(xa.x, xb.y, xb.x - xa.x, xa.y - xb.y); }
    }
  }

  drawWorld(g) {
    const L = [];
    const far = this.camZ + 110;
    const c = this.crowd;
    for (const it of this.items) {
      if (it.z > far + 5 || it.z < this.camZ - 2) continue;
      if (it.kind === 'gate' || it.kind === 'slide') L.push([it.z, () => this.drawGate(g, it)]);
      else if (it.kind === 'enemy') { const ec = it.crowd; if (ec.n > 0) { L.push([ec.z + 0.01, () => this.drawShadow(g, ec)]); ec.units.forEach((u) => L.push([ec.z + u.oz, () => this.drawUnit(g, this.spr.red, ec.wx(u), 0, ec.z + u.oz, u, this.phase === 'fight' && this.fight && this.fight.it === it)])); L.push([ec.z - 5, () => this.drawLabel(g, ec.x, 1.5, ec.z, fmt(ec.n), RED)]); } }
      else if (it.kind === 'boss') L.push([it.z, () => this.drawBoss(g, it)]);
      else if (it.kind === 'spinner') L.push([it.z, () => this.drawSpinner(g, it)]);
      else if (it.kind === 'saw') L.push([it.z, () => this.drawSaw(g, it)]);
    }
    // stairs
    for (let i = this.steps.length - 1; i >= 0; i--) { const s = this.steps[i]; if (s.z > far) continue; L.push([s.z + STEP_DEPTH, () => this.drawStep(g, s, i)]); }
    // runners left behind on the stairs
    this.steps.forEach((s, i) => { for (let j = 0; j < s.left; j++) { const x = (j - (s.left - 1) / 2) * 0.42, z = s.z + 0.5; L.push([z, () => this.drawUnit(g, this.spr.blue, x, (i + 1) * STEP_RISE, z, { ph: j, pop: 1 }, false, true)]); } });
    // the crowd
    if (c.n > 0) {
      L.push([c.z + c.radius + 0.02, () => this.drawShadow(g, c)]);
      const moving = this.phase === 'run' || this.phase === 'stairs' || this.phase === 'fight';
      c.units.forEach((u) => L.push([c.z + u.oz, () => this.drawUnit(g, this.spr.blue, c.wx(u), c.y, c.z + u.oz, u, moving)]));
    }
    for (const p of this.parts) L.push([p.z, () => { const q = this.P(p.x, p.y, p.z); if (!q) return; const r = Math.max(1.5, p.s * q.s); g.globalAlpha = Math.min(1, p.life * 2); g.fillStyle = p.color; g.fillRect(q.x - r / 2, q.y - r / 2, r, r); g.globalAlpha = 1; }]);
    L.sort((a, b) => b[0] - a[0]);
    for (const [, fn] of L) fn();
  }

  drawShadow(g, cr) {
    const p = this.P(cr.x, cr.y, cr.z); if (!p) return;
    const r = (cr.radius + 0.3) * p.s;
    g.fillStyle = 'rgba(20,40,90,.18)'; g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.35, 0, 0, 7); g.fill();
  }

  drawUnit(g, frames, x, y, z, u, moving, cheer) {
    const p = this.P(x, y, z); if (!p) return;
    const ph = this.t * 13 + u.ph;
    const fr = moving ? Math.floor(((ph / (Math.PI * 2)) % 1) * 6) : 6;
    const hop = cheer ? Math.abs(Math.sin(this.t * 6 + u.ph)) * 0.15 : moving ? Math.abs(Math.sin(ph)) * 0.05 : 0;
    const h = 0.82 * p.s * (u.pop ?? 1), w = h * 0.667;
    g.drawImage(frames[fr], p.x - w / 2, p.y - h - hop * p.s, w, h);
  }

  drawLabel(g, x, y, z, text, color, scale = 1) {
    const p = this.P(x, y, z); if (!p) return;
    const fs = clamp(p.s * 0.55, 12, 34) * scale;
    g.font = `900 ${fs}px ${FONT}`;
    const w = g.measureText(text).width + fs * 0.9, h = fs * 1.35;
    g.fillStyle = color; g.beginPath(); g.roundRect(p.x - w / 2, p.y - h / 2, w, h, h / 2); g.fill();
    g.beginPath(); g.moveTo(p.x - fs * 0.25, p.y + h / 2 - 1); g.lineTo(p.x + fs * 0.25, p.y + h / 2 - 1); g.lineTo(p.x, p.y + h / 2 + fs * 0.3); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, p.x, p.y + fs * 0.04);
  }

  drawGate(g, it) {
    const halves = it.kind === 'gate'
      ? [[-ROAD, 0, it.ops[0], 0], [0, ROAD, it.ops[1], 1]]
      : (() => { const gx = it.done && it.hitX !== undefined ? it.hitX : this.slideX(it); return [[gx - 1.75, gx + 1.75, it.ops[0], 0]]; })();
    const H = 2.5;
    for (const [x0, x1, op, side] of halves) {
      const a = this.P(x0, H, it.z), b = this.P(x1, 0, it.z);
      if (!a || !b) continue;
      const good = isGood(op), chosen = it.done && it.picked === op && (it.kind === 'slide' || it.side === side);
      const col = good ? (op.t === 'x' ? [255, 196, 40] : [40, 150, 255]) : [255, 50, 80];
      const fade = it.done ? (chosen ? 0.12 : 0.35) : 1;
      const grd = g.createLinearGradient(0, a.y, 0, b.y);
      grd.addColorStop(0, `rgba(${col},${0.25 * fade})`); grd.addColorStop(1, `rgba(${col},${0.6 * fade})`);
      g.fillStyle = grd; g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      g.strokeStyle = `rgba(${col},${0.95 * fade})`; g.lineWidth = Math.max(1.5, 0.08 * a.s); g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      // posts
      const pw = Math.max(2, 0.18 * a.s);
      g.fillStyle = `rgba(255,255,255,${0.9 * fade})`;
      g.fillRect(a.x - pw / 2, a.y - pw / 2, pw, b.y - a.y + pw / 2); g.fillRect(b.x - pw / 2, a.y - pw / 2, pw, b.y - a.y + pw / 2);
      if (!it.done || !chosen) {
        const fs = Math.max(10, 1.05 * a.s);
        g.font = `900 ${fs}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const tx = (a.x + b.x) / 2, ty = (a.y + b.y) / 2 + fs * 0.05;
        g.globalAlpha = fade; g.lineWidth = fs * 0.14; g.strokeStyle = 'rgba(0,20,60,.55)'; g.lineJoin = 'round';
        g.strokeText(opLabel(op), tx, ty); g.fillStyle = '#fff'; g.fillText(opLabel(op), tx, ty); g.globalAlpha = 1;
      }
    }
  }

  drawSpinner(g, it) {
    const hub = this.P(it.x, 0, it.z), top = this.P(it.x, 0.55, it.z); if (!hub || !top) return;
    g.fillStyle = '#5a6475'; const pw = 0.25 * hub.s; g.fillRect(hub.x - pw / 2, top.y, pw, hub.y - top.y);
    const dx = Math.cos(it.ang) * it.len, dz = Math.sin(it.ang) * it.len;
    const p1 = this.P(it.x - dx, 0.5, it.z - dz), p2 = this.P(it.x + dx, 0.5, it.z + dz);
    if (!p1 || !p2) return;
    g.lineCap = 'round';
    g.strokeStyle = '#b3122e'; g.lineWidth = Math.max(3, 0.32 * top.s); g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
    g.strokeStyle = '#ff4d6a'; g.lineWidth = Math.max(2, 0.18 * top.s); g.beginPath(); g.moveTo(p1.x, p1.y - 2); g.lineTo(p2.x, p2.y - 2); g.stroke();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(top.x, top.y, 0.2 * top.s, 0, 7); g.fill();
  }

  drawSaw(g, it) {
    const sx = Math.sin(this.t * it.speed + it.phase) * it.amp;
    const r0 = this.P(-it.amp - 0.8, 0.02, it.z), r1 = this.P(it.amp + 0.8, 0.02, it.z);
    if (r0 && r1) { g.fillStyle = 'rgba(60,70,90,.55)'; g.fillRect(r0.x, r0.y - 0.08 * r0.s, r1.x - r0.x, 0.16 * r0.s); }
    const p = this.P(sx, 0.62, it.z); if (!p) return;
    const r = 0.72 * p.s, n = 12, rot = this.t * 14;
    g.save(); g.translate(p.x, p.y); g.rotate(rot);
    g.fillStyle = '#c7d0dc'; g.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, rr = i & 1 ? r * 0.8 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.fill(); g.fillStyle = '#8994a6'; g.beginPath(); g.arc(0, 0, r * 0.55, 0, 7); g.fill();
    g.fillStyle = '#ff3b55'; g.beginPath(); g.arc(0, 0, r * 0.22, 0, 7); g.fill();
    g.restore();
  }

  drawBoss(g, it) {
    const p = this.P(0, 0, it.z); if (!p) return;
    const fighting = this.fight && this.fight.it === it;
    const sc = 5 * (it.hp0 ? 0.55 + 0.45 * Math.max(0, it.hp) / it.hp0 : 1);
    const h = 0.82 * p.s * sc, w = h * 0.667;
    g.save(); g.translate(p.x, p.y);
    if (it.done) { g.rotate(-it.fall * 1.4); g.globalAlpha = 1 - it.fall * 0.6; }
    else if (fighting) { g.rotate(Math.sin(it.atk * 12) * 0.08); g.scale(1 + Math.sin(it.atk * 24) * 0.03, 1); }
    else g.translate(0, -Math.abs(Math.sin(this.t * 3)) * 0.06 * p.s);
    g.fillStyle = 'rgba(80,0,20,.25)'; g.beginPath(); g.ellipse(0, 0, w * 0.6, w * 0.15, 0, 0, 7); g.fill();
    g.drawImage(this.spr.red[fighting ? Math.floor(it.atk * 10) % 6 : 6], -w / 2, -h, w, h);
    // crown
    g.fillStyle = '#ffd23f'; const cw = w * 0.42, cy = -h * 0.92;
    g.beginPath(); g.moveTo(-cw / 2, cy); g.lineTo(-cw / 2, cy - cw * 0.45); g.lineTo(-cw / 4, cy - cw * 0.2); g.lineTo(0, cy - cw * 0.55); g.lineTo(cw / 4, cy - cw * 0.2); g.lineTo(cw / 2, cy - cw * 0.45); g.lineTo(cw / 2, cy); g.fill();
    g.restore();
    if (!it.done) {
      const q = this.P(0, sc * 0.82 + 1.0, it.z); if (!q) return;
      const bw = Math.min(this.W * 0.5, 3.2 * q.s), bh = Math.max(8, 0.3 * q.s);
      g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.roundRect(q.x - bw / 2, q.y, bw, bh, bh / 2); g.fill();
      g.fillStyle = RED; g.beginPath(); g.roundRect(q.x - bw / 2, q.y, bw * Math.max(0, it.hp / it.hp0), bh, bh / 2); g.fill();
      this.drawLabel(g, 0, sc * 0.82 + 1.9, it.z, fmt(it.hp), RED, 1.2);
    }
  }

  drawStep(g, s, i) {
    const y1 = (i + 1) * STEP_RISE, y0 = i * STEP_RISE;
    const a = this.P(-ROAD, y1, s.z), b = this.P(ROAD, y0, s.z), c = this.P(ROAD, y1, s.z + STEP_DEPTH), d = this.P(-ROAD, y1, s.z + STEP_DEPTH);
    if (!a || !b || !c) return;
    const hue = (i * 17) % 360, lit = s.lit;
    g.fillStyle = `hsl(${hue},85%,${lit ? 72 : 62}%)`;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, a.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.fill();
    g.fillStyle = `hsl(${hue},80%,${lit === 2 ? 60 : lit ? 52 : 46}%)`;
    g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    if (lit === 2) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); }
    const fs = Math.max(8, (b.y - a.y) * 0.72);
    if (fs > 6) { g.font = `900 ${fs}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText('×' + s.mult.toFixed(1), (a.x + b.x) / 2, (a.y + b.y) / 2 + 1); }
  }

  drawOverlays(g) {
    const c = this.crowd;
    if (c.n > 0 && this.phase !== 'win') {
      const sc = this.bubble;
      this.drawLabel(g, c.x, c.y + 1.2 + c.radius * 0.25, c.z, fmt(c.n), BLUE, sc);
    }
    if (this.phase === 'win' && this.stepIdx >= 0) this.drawLabel(g, c.x, c.y + 1.6, c.z, '×' + this.mult.toFixed(1), '#ff9f1a', 1.4 + Math.sin(this.t * 8) * 0.06);
  }
}

