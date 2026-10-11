// Match: fixed-step simulation, combat resolution, rounds, projectiles, beams, events, cinematics.
import * as THREE from 'three';
import { Fighter, angleDiff, GRAV } from './fighter.js';

const STEP = 1 / 60;
const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();

function sphereCyl(c, r, cyl) {
  const dx = c.x - cyl.c.x, dz = c.z - cyl.c.z;
  if (Math.hypot(dx, dz) > r + cyl.r) return false;
  return c.y + r >= cyl.y0 && c.y - r <= cyl.y1;
}

export class Match {
  constructor(o) {
    this.o = o;
    this.scene = o.scene; this.quality = o.quality; this.fx = o.fx; this.stage = o.stage; this.audio = o.audio; this.camRig = o.camRig;
    this.ctrls = o.ctrls;
    this.frame = 0;
    this.roundsToWin = o.rounds ?? 2;
    this.roundTime = o.time ?? 60;
    this.training = !!o.training;
    this.fighters = [
      new Fighter(o.defs[0], 0, this, o.fopts?.[0] || {}),
      new Fighter(o.defs[1], 1, this, o.fopts?.[1] || {}),
    ];
    for (const f of this.fighters) { this.scene.add(f.group); f.meter = this.training ? 100 : 0; }
    this.projectiles = [];
    this.hitstop = 0;
    this.cineFreeze = 0; this.cineOwner = null;
    this.timeScale = 1; this.slowT = 0;
    this.acc = 0;
    this.round = 0;
    this.dim = 0;
    this.banner = null;
    this.combo = [null, null];
    this.popups = [];
    this.stage.shake = (a) => this.camRig.shake(a);
    this.debug = !!o.debug;
    this.debugObjs = [];
    this.result = null;
    this.paused = false;
    this.lastHit = [null, null];
    this.startRound(true);
  }

  isCPU(f) { return !!this.ctrls[f.side].isAI; }
  screenSign(f) {
    const s = this.camRig.side;
    const o = f.opp;
    const d = (o.pos.x - f.pos.x) * s.z + (o.pos.z - f.pos.z) * -s.x;
    if (Math.abs(d) < 0.5) return f._ss || (f.side === 0 ? 1 : -1);
    f._ss = d > 0 ? 1 : -1;
    return f._ss;
  }
  cameraSideSign(f) {
    const s = this.camRig.side, o = f.opp;
    const dx = f.pos.x - o.pos.x, dz = f.pos.z - o.pos.z;
    return (dz * s.x - dx * s.z) >= 0 ? 1 : -1;
  }

  startRound(first) {
    this.round++;
    const [a, b] = this.fighters;
    a.resetRound(-9, 0); b.resetRound(9, 0);
    a.yaw = Math.PI / 2; b.yaw = -Math.PI / 2;
    for (const f of this.fighters) { if (f.beamSnd) f.beamSnd.stop(); f.beamSnd = null; if (f.beamVis) this.fx.endBeam(f.beamVis); f.beamVis = null; }
    for (const p of this.projectiles) if (p.vis) this.fx.removeVisual(p.vis);
    this.projectiles = [];
    this.timer = this.roundTime;
    this.timerFrames = 0;
    this.koInfo = null;
    this.camRig.reset(a, b);
    this.fx.clear();
    if (this.training) {
      this.phase = 'fight'; a.state = b.state = 'idle';
      return;
    }
    if (first) {
      this.phase = 'intro'; this.pf = 0;
      this.camRig.setCine({ type: 'intro', dur: 4.2 });
    } else {
      this.phase = 'ready'; this.pf = 0;
      a.state = b.state = 'idle';
    }
  }

  setBanner(text, sub, cls, dur = 1.2) { this.banner = { text, sub, cls, t: dur, id: Math.random() }; }
  popup(side, text, cls) { this.popups.push({ side, text, cls, t: 1.1, id: Math.random() }); }

  // ---------------- main update ----------------
  update(dt) {
    if (this.paused) return;
    // slow motion handling
    if (this.slowT > 0) { this.slowT -= dt; this.timeScale = this.slowT > 0 ? this.slowScale : 1; }
    this.acc += Math.min(dt, 0.1) * this.timeScale;
    let n = 0;
    while (this.acc >= STEP && n < 6) { this.acc -= STEP; this.step(); n++; }
    if (n >= 6) this.acc = 0;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    for (const p of this.popups) p.t -= dt;
    this.popups = this.popups.filter((p) => p.t > 0);
    const target = this.cineFreeze > 0 ? 0.55 : 0;
    this.dim += (target - this.dim) * Math.min(1, dt * 8);
  }

  pollInputs(freeze) {
    for (const f of this.fighters) {
      const inp = this.ctrls[f.side].get(f, this);
      if (freeze) { for (const b in inp.pressed) if (inp.pressed[b]) f.buf[b] = 8; }
      else f.readInput(inp);
    }
  }

  step() {
    this.frame++;
    if (this.o.poll) this.o.poll();
    const [a, b] = this.fighters;
    const ph = this.phase;
    if (ph === 'intro') {
      this.pollInputs(false);
      this.pf++;
      if (this.pf === 30) this.audio.roar(a.def.voice);
      if (this.pf === 150) this.audio.roar(b.def.voice);
      if (this.pf < 126) { a.state = 'intro'; a.sf = this.pf; b.state = 'intro'; b.sf = 0; }
      else { b.state = 'intro'; b.sf = this.pf - 126; a.state = 'idle'; }
      const skip = this.pf > 20 && this.fighters.some((f) => !this.isCPU(f) && (f.buf.L || f.buf.H || f.buf.S));
      if (this.pf >= 252 || skip) {
        this.camRig.setCine(null);
        this.phase = 'ready'; this.pf = 0; a.state = b.state = 'idle';
        for (const f of this.fighters) for (const k in f.buf) f.buf[k] = 0;
      }
      for (const f of this.fighters) f.step();
      return;
    }
    if (ph === 'ready') {
      this.pf++;
      if (this.pf === 1) { this.setBanner(this.isFinal() ? 'FINAL ROUND' : `ROUND ${this.round}`, '', 'round', 1.3); this.audio.play('ok', { vol: 0.6 }); this.announce(this.isFinal() ? 'Final round' : 'Round ' + this.round); }
      if (this.pf === 80) { this.setBanner('FIGHT!', '', 'fight', 0.9); this.audio.play('explosion', { vol: 0.4, pitch: 1.5 }); this.announce('Fight!'); }
      for (const f of this.fighters) { f.readInput({ x: 0, y: 0, held: {}, pressed: {} }); f.step(); }
      if (this.pf >= 92) { this.phase = 'fight'; this.pf = 0; }
      this.syncSeparation();
      return;
    }
    if (ph === 'ko' || ph === 'roundEnd' || ph === 'matchEnd') {
      this.pf++;
      for (const f of this.fighters) { f.readInput({ x: 0, y: 0, held: {}, pressed: {} }); f.step(); }
      this.updateProjectiles();
      this.updateBeams();
      this.bounds();
      this.syncSeparation();
      this.handleEndPhases();
      return;
    }
    // ---------------- fight ----------------
    if (this.hitstop > 0) { this.hitstop--; this.pollInputs(true); return; }
    if (this.cineFreeze > 0) {
      this.cineFreeze--;
      this.pollInputs(true);
      const o = this.cineOwner;
      o.readInput(this.ctrls[o.side].get(o, this));
      o.step();
      this.updateBeams();
      return;
    }
    this.pollInputs(false);
    a.step(); b.step();
    this.syncSeparation();
    this.bounds();
    this.stage.touch(this.fighters);
    this.resolveHits();
    this.updateProjectiles();
    this.updateBeams();
    // combos end display
    for (const f of this.fighters) {
      const vic = f.opp;
      if (vic.comboHits >= 2) this.combo[f.side] = { hits: vic.comboHits, dmg: vic.comboDmg, t: 1.5 };
    }
    // training helpers
    if (this.training) this.trainingStep();
    // timer
    if (!this.training && this.roundTime > 0) {
      this.timerFrames++;
      if (this.timerFrames % 60 === 0) this.timer = Math.max(0, this.timer - 1);
      if (this.timer <= 0) this.endRound('time');
    }
    if (!this.training && (a.hp <= 0 || b.hp <= 0)) this.endRound('ko');
  }

  isFinal() {
    const [a, b] = this.fighters;
    return a.wins === this.roundsToWin - 1 && b.wins === this.roundsToWin - 1;
  }

  trainingStep() {
    const t = this.o.trainingOpts || {};
    for (const f of this.fighters) {
      if (t.infiniteMeter) f.meter = 100;
      if (t.regen !== false && f.isActionable() && f.sf > 60 && f.hp < f.hpMax) f.hp = Math.min(f.hpMax, f.hp + f.hpMax * 0.02);
    }
  }

  syncSeparation() {
    const [a, b] = this.fighters;
    if (a.state === 'grabbed' || b.state === 'grabbed') return;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    const min = a.def.push + b.def.push;
    const yOverlap = Math.abs(a.pos.y - b.pos.y) < 6;
    if (d < min && yOverlap) {
      const push = (min - d) / 2;
      const nx = d > 0.001 ? dx / d : 1, nz = d > 0.001 ? dz / d : 0;
      a.pos.x -= nx * push; a.pos.z -= nz * push;
      b.pos.x += nx * push; b.pos.z += nz * push;
    }
  }

  bounds() {
    const R = this.stage.radius;
    for (const f of this.fighters) {
      const r = Math.hypot(f.pos.x, f.pos.z);
      if (r <= R) continue;
      const nx = f.pos.x / r, nz = f.pos.z / r;
      const out = f.vel.x * nx + f.vel.z * nz;
      f.pos.x = nx * R; f.pos.z = nz * R;
      const st = f.state;
      if ((st === 'air' || st === 'hit' || st === 'ko' || st === 'down') && (out > 0.18 || (f.wallsplat > 0 && out > 0.05))) {
        f.wallsplat = 0;
        // slammed into the city
        const p = new THREE.Vector3(nx * (R + 5), 3 + f.pos.y + 3, nz * (R + 5));
        const power = Math.min(3.2, Math.max(1.4, out * 6));
        this.stage.impact(p, power, 9);
        this.stage.impact(p.clone().setY(1), power, 8, { silent: true });
        this.fx.spawnDebris(p, { n: 14, speed: 10, size: 1.2, spread: 4, dir: new THREE.Vector3(-nx, 0, -nz) });
        this.fx.dust(new THREE.Vector3(nx * (R + 2), 2, nz * (R + 2)), 2.2);
        this.camRig.shake(0.5);
        this.audio.play('hit', { vol: 0.8, pitch: 0.6, heavy: 1.6 });
        f.vel.x = -nx * 0.12; f.vel.z = -nz * 0.12;
        if (st === 'hit') { f.stun += 16; this.popup(f.opp.side, 'WALL CRUSH', 'wall'); }
        if (st === 'air') f.vel.y = Math.max(f.vel.y, 0.2);
      } else if (out > 0) {
        f.vel.x -= nx * out; f.vel.z -= nz * out;
      }
    }
  }

  resolveHits() {
    const hits = [];
    for (const att of this.fighters) {
      const hb = att.activeHitboxes();
      if (!hb || att.hitIds.has('opp')) continue;
      const vic = att.opp;
      const hurts = vic.hurtCylinders();
      let hitPos = null;
      for (const h of hb) for (const c of hurts) if (sphereCyl(h.c, h.r, c)) { hitPos = h.c.clone(); break; }
      if (hitPos) hits.push({ att, vic, mv: att.move, pos: hitPos });
    }
    for (const h of hits) {
      const { att, vic, mv } = h;
      if (att.state !== 'move' || att.move !== mv) continue; // got hit by simultaneous trade earlier with priority
      if (mv.height === 'throw') { this.tryThrow(att, vic, mv); continue; }
      const res = vic.takeHit(att, mv, {});
      if (res === 'whiff') continue;
      att.hitIds.add('opp');
      // contact point between attacker hitbox and victim body
      const p = h.pos.lerp(tv.copy(vic.pos).setY(h.pos.y), 0.4);
      this.onHitFx(att, vic, mv, p, res);
    }
  }

  tryThrow(att, vic, mv) {
    if (vic.isAirborne() || vic.isCrouching() || vic.state === 'hit' || vic.state === 'block' || vic.state === 'down' || vic.state === 'getup' || vic.state === 'grabbed' || vic.invul > 0 || vic.throwInvul > 0) return;
    att.hitIds.add('opp');
    const t = mv.throw;
    // switch attacker into throw execution
    att.move = { ...mv, startup: 0, active: 0, recovery: t.len, anim: t.anim, hit: null, events: t.events, cancel: null, lunge: null, isThrow: true };
    att.mf = 0;
    att.startHold(vic, t);
    this.audio.play('bite', { vol: 0.8 });
    this.camRig.shake(0.2);
    this.popup(att.side, 'THROW', 'throw');
  }

  onHitFx(att, vic, mv, p, res) {
    const heavy = Math.min(2, (mv.dmg || 30) / 50);
    if (res === 'block') {
      this.fx.blockSpark(p);
      this.audio.play('block', { vol: 0.7 });
      this.hitstop = Math.max(this.hitstop, 4);
      this.camRig.shake(0.08 * heavy);
      att.blocked = true;
      return;
    }
    if (res === 'armor') {
      this.fx.hitSpark(p, 0.7, 0xffffff);
      this.audio.play('clang', { vol: 0.6 });
      this.hitstop = Math.max(this.hitstop, 6);
      this.popup(vic.side, 'ARMOR', 'armor');
      att.connected = true;
      return;
    }
    att.connected = true;
    const counter = res === 'counter';
    this.fx.hitSpark(p, 0.7 + heavy * 0.4, mv.sparkColor || 0xffc070, counter);
    if (vic.def.flyer || vic.def.id === 'kurogane') this.fx.burst(p, { n: 12, color: vic.def.id === 'kurogane' ? 0xfff0a0 : 0x80ff60, speed: 14, size: 0.5, life: 0.5, grav: 20 });
    this.audio.play('hit', { vol: 0.6 + heavy * 0.3, pitch: 1.15 - heavy * 0.25, heavy: 0.7 + heavy * 0.4 });
    this.hitstop = Math.max(this.hitstop, Math.min(14, 5 + Math.round((mv.dmg || 30) / 10)) + (counter ? 4 : 0));
    this.camRig.shake(0.12 + heavy * 0.18 + (counter ? 0.15 : 0));
    if (heavy > 1.2) this.camRig.punch(0.6);
    if (counter) this.popup(att.side, 'COUNTER!', 'counter');
    if (mv.wallsplat) vic.wallsplat = 40;
    if (vic.state === 'ko') this.koFx(att, vic, mv);
  }

  koFx(att, vic, mv) {
    this.slowT = mv.super ? 2.2 : 1.6; this.slowScale = 0.22;
    this.hitstop = 0;
    this.camRig.shake(0.9);
    this.camRig.punch(1);
    this.fx.explosion(vic.local(0, vic.def.height * 0.5), 2, 0xffd0a0);
    this.audio.play('ko', { vol: 1 });
    this.koBy = mv.super ? 'super' : 'normal';
  }

  endRound(reason) {
    if (this.phase !== 'fight') return;
    const [a, b] = this.fighters;
    this.audio.stopLoops();
    let winner = null;
    if (reason === 'ko') {
      if (a.hp <= 0 && b.hp <= 0) winner = null;
      else winner = a.hp <= 0 ? b : a;
    } else {
      const ra = a.hp / a.hpMax, rb = b.hp / b.hpMax;
      winner = Math.abs(ra - rb) < 0.001 ? null : ra > rb ? a : b;
    }
    this.phase = 'ko'; this.pf = 0;
    this.koInfo = { reason, winner };
    if (winner) {
      winner.wins++;
      const loser = winner.opp;
      if (reason === 'time') { loser.state = 'lose'; }
      const perfect = winner.hp >= winner.hpMax;
      this.setBanner(reason === 'ko' ? 'K.O.' : 'TIME UP', perfect ? 'PERFECT' : (this.koBy === 'super' ? 'FINISH!' : ''), 'ko', 2.6);
      this.announce(reason === 'ko' ? 'K O' : 'Time up');
      this.camRig.setCine({ type: 'ko', f: reason === 'ko' ? loser : winner, a0: Math.atan2(this.camRig.side.x, this.camRig.side.z) });
    } else {
      this.setBanner(reason === 'ko' ? 'DOUBLE K.O.' : 'DRAW', '', 'ko', 2.6);
    }
  }

  handleEndPhases() {
    const [a, b] = this.fighters;
    const info = this.koInfo;
    if (this.phase === 'ko' && this.pf > 170) {
      this.phase = 'roundEnd'; this.pf = 0;
      if (info.winner) {
        info.winner.state = 'win'; info.winner.sf = 0;
        if (info.winner.hp > 0) { info.winner.move = null; }
        this.audio.roar(info.winner.def.voice);
        this.camRig.setCine({ type: 'win', f: info.winner, a0: info.winner.yaw + 0.4 });
        if (info.winner.opp.state !== 'ko') info.winner.opp.state = 'lose';
      }
    }
    if (this.phase === 'roundEnd' && this.pf > 150) {
      const done = a.wins >= this.roundsToWin || b.wins >= this.roundsToWin;
      if (done) {
        this.phase = 'matchEnd'; this.pf = 0;
        const w = a.wins >= this.roundsToWin ? a : b;
        this.result = { winner: w.side, wins: [a.wins, b.wins], stats: [a.stats, b.stats], time: this.roundTime - this.timer, perfect: w.hp >= w.hpMax };
        this.audio.play('fanfare', { vol: 0.8 });
        this.o.onEnd && this.o.onEnd(this.result);
      } else {
        this.startRound(false);
      }
    }
  }

  announce(text) {
    if (!this.o.voice || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.pitch = 0.4; u.rate = 0.9; u.volume = 0.9;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  // ---------------- events ----------------
  event(f, name, d) {
    const h = f.def.events && f.def.events[name];
    if (h) { h(f, this, d); return; }
    if (name === 'invul') f.invul = d.n;
    else if (name === 'groundSlam') {
      const p = f.local(d.z || 4, 0.2);
      this.fx.dust(p, 1.6 * (d.power || 1));
      this.fx.ring(p, { color: 0xffe0b0, r1: 12 * (d.power || 1), dur: 0.45, opacity: 0.5 });
      this.fx.crack(p, 7 * (d.power || 1));
      this.fx.spawnDebris(p, { n: 8 * (d.power || 1), size: 0.6, speed: 7, color: 0x5a5650 });
      this.camRig.shake(0.3 * (d.power || 1));
      this.audio.play('step', { vol: 1, pitch: 0.7 });
      this.stage.impact(p, 0.5 * (d.power || 1), 6, { silent: true });
    } else if (name === 'pulse') {
      const p = f.local(0, f.def.height * 0.5);
      this.fx.ring(p, { sphere: true, color: d.color, r0: 2, r1: d.r || 9, dur: 0.45, opacity: 0.7 });
      this.fx.ring(f.local(0, 0.3), { color: d.color, r1: (d.r || 9) * 2, dur: 0.6 });
      this.fx.burst(p, { n: 60, color: d.color, speed: 30, size: 1.2, life: 0.5 });
      this.fx.flash(p, d.color, 60, 0.4);
      this.camRig.shake(0.5);
      this.audio.play('explosion', { vol: 0.8, pitch: 1.3 });
      this.stage.impact(p, 1.2, (d.r || 9) + 2);
    } else if (name === 'bite') {
      const v = f.holding?.victim;
      if (v) { this.fx.hitSpark(v.local(0, v.def.height * 0.7), 0.6); this.audio.play('bite', { vol: 0.9 }); this.camRig.shake(0.15); }
    } else if (name === 'throwBreak') {
      this.popup(f.opp.side, 'BREAK!', 'counter');
      this.fx.blockSpark(f.local(2, 6));
      this.audio.play('block');
    } else if (name === 'roar') this.audio.roar(f.def.voice);
  }

  onSuper(f, mv) {
    this.cineFreeze = mv.freeze ?? 54;
    this.cineOwner = f;
    this.camRig.setCine({ type: 'super', f, dur: (this.cineFreeze + 40) / 60 });
    this.setBanner(mv.name, f.def.name, 'super', 1.4);
    this.audio.play('charge', { len: 1.0, vol: 1, pitch: 0.7 });
    this.fx.flash(f.local(0, f.def.height * 0.6), f.def.color, 40, 0.8);
    this.fx.burst(f.local(0, f.def.height * 0.6), { n: 50, color: f.def.color, speed: 25, size: 1.5, life: 0.8 });
  }

  onFootstep(f, power) {
    const w = (f.def.weight || 1) * power;
    this.camRig.shake(0.035 * w);
    this.audio.play('step', { vol: Math.min(1, 0.35 * w), pitch: 1.2 / w });
    const s = Math.sin(f.gaitPhase) > 0 ? 1 : -1;
    this.fx.dust(f.local(0.6, 0.2, s * 1.3), 0.5 * w);
  }
  onLand(f, hard) {
    const p = f.local(-1, 0.3);
    this.fx.dust(p, 2.2);
    this.fx.ring(p, { color: 0xd8c8a8, r1: 14, dur: 0.5, opacity: 0.35 });
    this.fx.crack(p, 9);
    this.fx.spawnDebris(p, { n: 8, size: 0.7, speed: 8, color: 0x5a5650 });
    this.camRig.shake(0.35);
    this.audio.play('step', { vol: 1, pitch: 0.55 });
    this.audio.play('crumble', { vol: 0.4 });
    this.stage.impact(p, 0.4, 6, { silent: true });
  }

  // ---------------- projectiles ----------------
  spawnProjectile(f, s) {
    const n = s.count || 1;
    for (let i = 0; i < n; i++) {
      const spread = n > 1 ? (i / (n - 1) - 0.5) * (s.spread || 0.6) : 0;
      const yaw = f.yaw + (s.yawOff || 0) + spread;
      const pos = f.local(s.z ?? 4, s.y ?? 6, (s.x ?? 0) + (n > 1 ? (i - (n - 1) / 2) * (s.xStep || 0) : 0));
      const vel = new THREE.Vector3(Math.sin(yaw), s.vy ?? 0, Math.cos(yaw)).multiplyScalar(s.speed);
      if (s.aim) {
        const o = f.opp;
        const tgt = tv.set(o.pos.x, o.pos.y + o.def.height * 0.45, o.pos.z);
        const d = Math.hypot(tgt.x - pos.x, tgt.z - pos.z);
        vel.y = ((tgt.y - pos.y) / Math.max(4, d)) * s.speed;
      }
      const p = { owner: f, pos, vel, s, life: s.life || 90, age: 0, vis: null, delay: (s.stagger || 0) * i };
      if (s.kind !== 'quake') p.vis = this.fx.projVisual(s.kind, s.color || 0xffffff);
      if (p.vis) { p.vis.position.copy(pos); p.vis.visible = p.delay <= 0; }
      this.projectiles.push(p);
    }
    this.audio.play(s.sfx || (s.kind === 'missile' ? 'missile' : s.kind === 'bolt' ? 'electric' : 'laser'), { vol: 0.6 });
  }

  updateProjectiles() {
    const list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.delay > 0) { p.delay--; p.pos.copy(p.owner.local(p.s.z ?? 4, p.s.y ?? 6)); continue; }
      if (p.vis) p.vis.visible = true;
      p.age++;
      const s = p.s, o = p.owner.opp;
      if (s.homing && p.age > (s.homingDelay || 6)) {
        const tgt = tv.set(o.pos.x, o.pos.y + o.def.height * 0.45, o.pos.z).sub(p.pos).normalize().multiplyScalar(s.speed);
        p.vel.lerp(tgt, s.homing);
        p.vel.setLength(s.speed);
      }
      if (s.gravity) p.vel.y -= s.gravity;
      p.pos.add(p.vel);
      if (s.kind === 'quake') {
        p.pos.y = 0.3;
        if (p.age % 2 === 0) { this.fx.dust(p.pos, 0.9, 0x7a6a58); this.fx.spawnDebris(p.pos, { n: 2, size: 0.6, speed: 7, up: 1.3, color: 0x5a5048 }); }
        if (p.age % 6 === 0) this.fx.crack(p.pos, 4);
      } else if (s.kind === 'missile') {
        this.fx.smoke.emit({ x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: 0, vy: 0.5, vz: 0, r: 0.6, g: 0.6, b: 0.62, size: 1.4, grow: 2.5, life: 0.9, alpha: 0.45, drag: 0.9 });
        this.fx.add.emit({ x: p.pos.x, y: p.pos.y, z: p.pos.z, r: 1, g: 0.6, b: 0.2, size: 1.6, life: 0.08 });
      } else if (this.quality.fxMul > 0.4) {
        const c = new THREE.Color(s.color || 0xffffff);
        this.fx.add.emit({ x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, r: c.r, g: c.g, b: c.b, size: (s.r || 1) * 1.6, life: 0.25 });
      }
      if (p.vis) {
        p.vis.position.copy(p.pos);
        p.vis.lookAt(tv2.copy(p.pos).add(p.vel));
        if (p.vis.userData.halo) p.vis.userData.halo.scale.setScalar((s.r || 1) * (1 + Math.sin(p.age * 0.8) * 0.15));
      }
      let dead = false;
      // hit opponent
      for (const c of o.hurtCylinders()) {
        if (sphereCyl(p.pos, s.r || 1, c)) {
          const res = o.takeHit(p.owner, { ...s, id: 'proj', special: true, dmg: s.dmg, height: s.height || 'mid' }, { proj: true, srcPos: p.pos.clone().sub(p.vel) });
          if (res !== 'whiff') {
            if (res === 'block') { this.fx.blockSpark(p.pos); this.audio.play('block'); }
            else { this.onProjHit(p, o, res); }
            this.explodeProj(p, res !== 'block');
            dead = true;
          }
          break;
        }
      }
      // projectile vs projectile
      if (!dead) for (const q of list) {
        if (q === p || q.owner === p.owner || q.dead || q.delay > 0 || p.s.kind === 'quake' || q.s.kind === 'quake') continue;
        if (q.pos.distanceTo(p.pos) < (s.r || 1) + (q.s.r || 1) + 0.6) { this.explodeProj(p, true); this.explodeProj(q, true); dead = true; break; }
      }
      // buildings / ground / expire
      if (!dead && s.kind !== 'quake') {
        const hitB = this.stage.raycast(p.pos.clone().sub(p.vel), p.vel.clone().normalize(), p.vel.length() + (s.r || 1));
        if (hitB) { this.stage.impact(hitB.p, s.power || 1.2, 5); this.explodeProj(p, true); dead = true; }
        else if (p.pos.y < 0.3) { this.stage.impact(p.pos, 0.6, 5, { silent: true }); this.explodeProj(p, true); dead = true; }
      }
      if (!dead && (p.age > p.life || Math.hypot(p.pos.x, p.pos.z) > 120)) { this.explodeProj(p, s.kind !== 'quake'); dead = true; }
      if (dead) p.dead = true;
    }
    this.projectiles = list.filter((p) => !p.dead);
  }
  onProjHit(p, o, res) {
    this.hitstop = Math.max(this.hitstop, 5);
    this.camRig.shake(0.25);
    this.audio.play('hit', { vol: 0.8, pitch: 0.9 });
    if (o.state === 'ko') this.koFx(p.owner, o, p.s);
  }
  explodeProj(p, boom) {
    if (p.dead) return;
    p.dead = true;
    if (p.vis) this.fx.removeVisual(p.vis);
    if (!boom) return;
    const s = p.s;
    if (s.kind === 'missile') { this.fx.explosion(p.pos, 1.1, 0xff8030); this.audio.play('explosion', { vol: 0.5, pitch: 1.3 }); }
    else if (s.kind === 'quake') { this.fx.dust(p.pos, 2); }
    else { this.fx.burst(p.pos, { n: 30, color: s.color || 0xffffff, speed: 18, size: 1.2, life: 0.4 }); this.fx.flash(p.pos, s.color || 0xffffff, 15, 0.2); this.audio.play('electric', { vol: 0.4 }); }
  }

  // ---------------- beams ----------------
  startBeam(f, spec) {
    f.beam = { spec, yaw: f.yaw, pitch: 0, end: new THREE.Vector3(), start: new THREE.Vector3(), hitOpp: false };
    if (f.beamVis) this.fx.endBeam(f.beamVis);
    f.beamVis = this.fx.createBeam(spec);
    if (f.beamSnd) f.beamSnd.stop();
    f.beamSnd = this.audio.play('beam', { vol: spec.super ? 1 : 0.8, pitch: spec.pitch || 1, bright: spec.bright || 1 });
    this.camRig.shake(spec.super ? 0.6 : 0.3);
    this.fx.flash(f.local(spec.z, spec.y), spec.color, spec.super ? 80 : 40, 0.3);
  }
  stopBeam(f) {
    if (f.beamVis) this.fx.endBeam(f.beamVis);
    f.beamVis = null;
    if (f.beamSnd) f.beamSnd.stop();
    f.beamSnd = null;
    f.beam = null;
  }
  updateBeams() {
    for (const f of this.fighters) {
      const b = f.beam;
      if (!b) { if (f.beamVis || f.beamSnd) this.stopBeam(f); continue; }
      const s = b.spec;
      if (f.state !== 'move' || !f.move || f.move.beam !== s || f.mf >= s.to) { this.stopBeam(f); continue; }
      const o = f.opp;
      // sweep toward opponent
      const want = f.yawTo(o.pos);
      const d = angleDiff(b.yaw, want);
      b.yaw += Math.max(-s.sweep, Math.min(s.sweep, d));
      f.yaw = b.yaw;
      const origin = f.local(s.z, s.y, 0, b.start);
      const ty = o.pos.y + o.def.height * 0.42;
      const hd = Math.max(3, Math.hypot(o.pos.x - origin.x, o.pos.z - origin.z));
      const wantPitch = Math.max(-0.35, Math.min(0.55, Math.atan2(origin.y - ty, hd)));
      b.pitch += (wantPitch - b.pitch) * 0.2;
      const cp = Math.cos(b.pitch);
      const dir = tv.set(Math.sin(b.yaw) * cp, -Math.sin(b.pitch), Math.cos(b.yaw) * cp).normalize();
      let tEnd = s.range, endKind = 'air';
      if (dir.y < -0.01) { const tg = origin.y / -dir.y; if (tg < tEnd) { tEnd = tg; endKind = 'ground'; } }
      const rc = this.stage.raycast(origin, dir, tEnd);
      if (rc) { tEnd = rc.t; endKind = 'building'; }
      // clash with the other beam
      const ob = o.beam;
      let clash = false;
      if (ob && ob.start) {
        const toO = tv2.subVectors(ob.start, origin);
        const dd = toO.length();
        const a1 = toO.clone().normalize().dot(dir);
        const od = new THREE.Vector3(Math.sin(ob.yaw), 0, Math.cos(ob.yaw));
        const a2 = -toO.clone().setY(0).normalize().dot(od);
        if (a1 > 0.93 && a2 > 0.9 && dd < tEnd + 10) {
          clash = true;
          tEnd = dd * 0.5;
          endKind = 'clash';
        }
      }
      // opponent along beam
      const oc = tv2.set(o.pos.x, o.pos.y + o.def.height * 0.45, o.pos.z).sub(origin);
      let t = Math.max(0, Math.min(tEnd, oc.dot(dir)));
      const P = origin.clone().addScaledVector(dir, t);
      let hitOpp = false;
      if (!clash) for (const c of o.hurtCylinders()) {
        if (Math.hypot(P.x - c.c.x, P.z - c.c.z) < c.r + s.width && P.y > c.y0 - s.width - 1 && P.y < c.y1 + s.width) { hitOpp = true; break; }
      }
      // beams eat projectiles
      for (const p of this.projectiles) {
        if (p.owner === f || p.dead) continue;
        const rel = p.pos.clone().sub(origin);
        const tt = rel.dot(dir);
        if (tt > 0 && tt < tEnd && rel.addScaledVector(dir, -tt).length() < s.width + (p.s.r || 1)) this.explodeProj(p, true);
      }
      const k = f.mf - s.from;
      const tick = k % s.tick === 0;
      if (hitOpp && o.invul <= 0 && o.state !== 'ko') {
        tEnd = Math.max(1, t - 1);
        endKind = 'opp';
        if (tick) {
          const res = o.takeHit(f, { ...f.move, dmg: s.dmg, height: s.height || 'mid', special: true, super: s.super, chip: s.chip ?? 0.25 }, { beam: true, dmg: s.dmg, push: s.push, hitstun: s.hitstun, blockstun: s.blockstun, srcPos: f.pos, launch: s.launch });
          if (res !== 'whiff') {
            f.connected = true;
            const hp = origin.clone().addScaledVector(dir, tEnd);
            if (res === 'block') { this.fx.blockSpark(hp); this.audio.play('block', { vol: 0.4 }); }
            else { this.fx.hitSpark(hp, 0.6, s.color); this.audio.play('hit', { vol: 0.5, pitch: 0.8 }); }
            this.camRig.shake(0.12);
            if (o.state === 'ko') this.koFx(f, o, f.move);
          }
        }
      }
      b.end.copy(origin).addScaledVector(dir, tEnd);
      b.endKind = endKind;
      if (tick) {
        if (endKind === 'building') { this.stage.impact(b.end, s.super ? 1.4 : 0.8, 5); if (k % (s.tick * 2) === 0) this.fx.explosion(b.end, 1.2, s.color); }
        else if (endKind === 'ground') { this.stage.impact(b.end, 0.5, 6, { silent: true }); if (k % (s.tick * 2) === 0) { this.fx.explosion(b.end, 0.9, s.color); this.fx.crack(b.end, 5); } }
        else if (endKind === 'clash') { this.fx.burst(b.end, { n: 30, color: 0xffffff, speed: 30, size: 1.3, life: 0.35 }); this.fx.flash(b.end, 0xffffff, 40, 0.15); this.camRig.shake(0.2); }
      }
      this.camRig.shake(0.012);
    }
  }

  // ---------------- render sync ----------------
  render(dt, cam) {
    for (const f of this.fighters) f.syncView(dt);
    for (const f of this.fighters) {
      if (f.beamVis && f.beam) {
        const mb = f.model.mouth;
        const o = f.model.rig.bones[mb.bone].localToWorld(tv.copy(mb.off));
        // use simulated origin blended with mouth position for visual alignment
        const origins = f.model.mouths ? f.model.mouths.map((mm) => f.model.rig.bones[mm.bone].localToWorld(mm.off.clone())) : null;
        this.fx.updateBeam(f.beamVis, o.clone(), f.beam.end, cam, 1, origins);
      }
      // hit flash (emissive tint)
      const fl = f.flash > 0 ? 1 : 0;
      if (fl !== f._fl) {
        f._fl = fl;
        f.model.root.traverse((m) => { if (m.isSkinnedMesh && m.material.emissive) { m.material.emissive.setHex(fl ? 0x553322 : 0x000000); } });
      }
    }
    if (this.debug) this.renderDebug();
  }

  renderDebug() {
    let i = 0;
    const get = (kind) => {
      let o = this.debugObjs[i];
      if (!o || o.userData.kind !== kind) {
        if (o) this.scene.remove(o);
        const geo = kind === 'sphere' ? new THREE.SphereGeometry(1, 12, 8) : new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
        o = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.7, depthTest: false }));
        o.userData.kind = kind; o.renderOrder = 50;
        this.scene.add(o); this.debugObjs[i] = o;
      }
      o.visible = true; i++;
      return o;
    };
    for (const f of this.fighters) {
      for (const c of f.hurtCylinders()) {
        const o = get('cyl');
        o.position.set(c.c.x, (c.y0 + c.y1) / 2, c.c.z); o.scale.set(c.r, c.y1 - c.y0, c.r);
        o.material.color.setHex(f.invul > 0 ? 0xffff00 : f.side ? 0x40a0ff : 0x40ff80);
      }
      const hb = f.activeHitboxes();
      if (hb) for (const h of hb) { const o = get('sphere'); o.position.copy(h.c); o.scale.setScalar(h.r); o.material.color.setHex(0xff2020); }
    }
    for (const p of this.projectiles) { const o = get('sphere'); o.position.copy(p.pos); o.scale.setScalar(p.s.r || 1); o.material.color.setHex(0xff8020); }
    for (; i < this.debugObjs.length; i++) if (this.debugObjs[i]) this.debugObjs[i].visible = false;
  }

  dispose() {
    this.audio.stopLoops();
    for (const f of this.fighters) { this.stopBeam(f); this.scene.remove(f.group); f.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    for (const p of this.projectiles) if (p.vis) this.fx.removeVisual(p.vis);
    for (const o of this.debugObjs) if (o) this.scene.remove(o);
  }
}
