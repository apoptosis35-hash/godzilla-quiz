// Fighter: deterministic 60Hz state machine with frame data, guard, evade, juggles, throws.
import * as THREE from 'three';
import { sampleClip, approachPose, addTo, copyPose } from './rig.js';

export const GRAV = 0.026;
export const BUTTONS = ['L', 'H', 'G', 'B', 'E', 'S', 'X'];
const ACTIONABLE = new Set(['idle', 'walk', 'guard', 'crouch', 'dash']);

const tmpV = new THREE.Vector3();

export class Fighter {
  constructor(def, side, match, opts = {}) {
    this.def = def;
    this.side = side;
    this.match = match;
    this.boss = !!opts.boss;
    this.model = def.build(match.quality, { boss: this.boss, alt: opts.alt });
    this.group = new THREE.Group();
    this.group.add(this.model.root);
    this.hpMax = Math.round(def.hp * (opts.hpMul || 1));
    this.dmgMul = opts.dmgMul || 1;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pose = {};
    this.target = {};
    this.tailHist = new Float32Array(64);
    this.tailIdx = 0;
    this.prevYaw = 0;
    this.gaitPhase = 0;
    this.wins = 0;
    this.stats = { maxCombo: 0, dmgDealt: 0 };
    this.resetRound(0, 0);
  }

  resetRound(x, z) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.hp = this.hpMax;
    this.meter = this.meter ?? 0;
    this.meter = Math.min(this.meter, 100);
    this.state = 'intro';
    this.sf = 0; // state frame
    this.move = null; this.mf = 0;
    this.connected = false; this.hitIds = new Set();
    this.stun = 0;
    this.comboHits = 0; this.comboDmg = 0;
    this.buf = {}; this.held = {}; this.dirHist = [];
    this.lastFwdTap = -99; this.lastBackTap = -99; this.prevFwd = 0;
    this.invul = 0; this.throwInvul = 0;
    this.armorUsed = false;
    this.grabbedBy = null;
    this.flash = 0;
    this.cooldowns = {};
    this.walkBack = false;
    this.blockCrouch = false;
    this.downFrames = 0;
    this.airborne = false;
    this.knockFace = 1;
    this.beam = null;
    this.flying = 0;
  }

  get opp() { return this.match.fighters[1 - this.side]; }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  right(out = new THREE.Vector3()) { return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); }
  local(z, y, x = 0, out = new THREE.Vector3()) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return out.set(this.pos.x + s * z - c * x, this.pos.y + y, this.pos.z + c * z + s * x);
  }
  yawTo(p) { return Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }
  distTo(o) { return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z); }

  isActionable() { return ACTIONABLE.has(this.state); }
  isCrouching() { return this.state === 'crouch' || (this.state === 'block' && this.blockCrouch); }
  isAirborne() { return this.pos.y > 0.5 || this.state === 'air'; }

  // ------------- input -------------
  readInput(inp) {
    this.inp = inp;
    for (const b of BUTTONS) {
      if (inp.pressed[b]) this.buf[b] = 8;
      else if (this.buf[b] > 0) this.buf[b]--;
      this.held[b] = !!inp.held[b];
    }
    // screen-relative horizontal -> forward/back
    const sgn = this.match.screenSign(this);
    this.fwd = inp.x * sgn;
    this.sideY = inp.y;
    const f = this.fwd > 0.5 ? 1 : this.fwd < -0.5 ? -1 : 0;
    if (f !== this.prevFwd && f !== 0) {
      const now = this.match.frame;
      if (f === 1) { if (now - this.lastFwdTap < 14) this.dashReq = 1; this.lastFwdTap = now; }
      else { if (now - this.lastBackTap < 14) this.dashReq = -1; this.lastBackTap = now; }
    }
    this.prevFwd = f;
  }
  dirKey() {
    if (this.sideY < -0.55 && Math.abs(this.fwd) < 0.7) return 'd';
    if (this.fwd > 0.5) return 'f';
    if (this.fwd < -0.5) return 'b';
    if (this.sideY > 0.55) return 'u';
    return '';
  }
  // returns move id for currently buffered button, or null
  commandMove(ctx = '') {
    const cmds = this.def.commands;
    const order = ['X', 'S', 'G', 'H', 'L'];
    for (const b of order) {
      if (!this.buf[b]) continue;
      const d = this.dirKey();
      const cand = [];
      if (ctx) cand.push(ctx + '+' + b);
      if (d) cand.push(d + '+' + b);
      cand.push(b);
      for (const c of cand) {
        const id = cmds[c];
        if (!id) continue;
        const mv = this.def.moves[id];
        if (!mv) continue;
        if (mv.super && this.meter < 100) continue;
        if (mv.cooldown && (this.cooldowns[id] || 0) > 0) continue;
        return { id, b };
      }
    }
    return null;
  }

  startMove(id, b) {
    const mv = this.def.moves[id];
    if (b) this.buf[b] = 0;
    this.state = 'move'; this.sf = 0;
    this.move = mv; this.moveId = id; this.mf = 0;
    this.connected = false; this.blocked = false; this.hitIds.clear();
    this.armorUsed = false;
    this.beam = null;
    if (mv.super) { this.meter -= 100; this.match.onSuper(this, mv); }
    if (mv.cooldown) this.cooldowns[id] = mv.cooldown;
    if (mv.meterCost) this.meter -= mv.meterCost;
    this.match.audio.play(mv.sfxStart || 'swing', { pitch: mv.pitch || 1, vol: 0.6 });
    if (mv.roar) this.match.audio.roar(this.def.voice);
  }

  // ------------- per frame -------------
  step() {
    const m = this.match;
    for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k]--;
    if (this.invul > 0) this.invul--;
    if (this.throwInvul > 0) this.throwInvul--;
    if (this.flash > 0) this.flash--;
    if (this.wallsplat > 0) this.wallsplat--;
    // self-regeneration (some kaiju): only while not under pressure, up to 40% of max HP
    if (this.def.regen && this.hp > 0 && this.hp < this.hpMax * 0.4 && this.isActionable() && this.match.frame - (this.lastHitFrame || 0) > 120) this.hp = Math.min(this.hpMax * 0.4, this.hp + this.def.regen);
    this.sf++;
    const opp = this.opp;
    const st = this.state;

    if (st === 'intro' || st === 'win' || st === 'lose') {
      this.vel.multiplyScalar(0.8);
    } else if (this.isActionable()) {
      this.stepNeutral(opp);
    } else if (st === 'move') {
      this.stepMove(opp);
    } else if (st === 'hit' || st === 'block') {
      this.stun--;
      this.vel.x *= 0.9; this.vel.z *= 0.9;
      if (this.stun <= 0) { this.state = 'idle'; this.sf = 0; if (st === 'hit') this.endCombo(); }
    } else if (st === 'air') {
      this.vel.y -= GRAV;
      if (this.pos.y <= 0 && this.vel.y < 0 && this.sf > 2) {
        this.pos.y = 0; this.vel.y = 0;
        this.state = 'down'; this.sf = 0; this.downFrames = 0;
        this.vel.x *= 0.3; this.vel.z *= 0.3;
        m.onLand(this, true);
      }
    } else if (st === 'down') {
      this.vel.x *= 0.8; this.vel.z *= 0.8;
      this.downFrames++;
      const anyPress = BUTTONS.some((b) => this.buf[b]) || Math.abs(this.fwd) > 0.5;
      if (this.hp > 0 && ((this.downFrames > 16 && anyPress) || this.downFrames > 52)) {
        this.state = 'getup'; this.sf = 0; this.invul = 20; this.endCombo();
        for (const b of BUTTONS) this.buf[b] = 0;
      }
    } else if (st === 'getup') {
      if (this.sf > 24) { this.state = 'idle'; this.sf = 0; }
    } else if (st === 'evade') {
      const e = this.evade;
      if (this.sf <= e.len) {
        const sp = e.speed * Math.sin(Math.PI * this.sf / e.len) * 1.6;
        this.applyMoveDir(e.dir, sp);
      }
      if (this.sf >= e.len + e.rec) { this.state = 'idle'; this.sf = 0; }
    } else if (st === 'backdash') {
      if (this.sf < 14) this.applyMoveDir([-1, 0], this.def.dash * 0.9 * (1 - this.sf / 16));
      if (this.sf > 22) { this.state = 'idle'; this.sf = 0; }
    } else if (st === 'grabbed') {
      // positioned by grabber
    } else if (st === 'ko') {
      this.vel.y -= GRAV;
      if (this.pos.y <= 0) { this.pos.y = 0; if (this.vel.y < -0.05) m.onLand(this, true); this.vel.y = 0; this.vel.x *= 0.85; this.vel.z *= 0.85; }
    } else if (st === 'cine') {
      // frozen during opponent super flash
    }

    // integrate
    if (st !== 'grabbed' && st !== 'cine') {
      this.pos.add(this.vel);
      if (this.pos.y < 0) { this.pos.y = 0; if (this.vel.y < 0) this.vel.y = 0; }
      if (this.state !== 'air' && this.state !== 'ko' && !(this.move && this.move.air) && this.pos.y > 0 && !this.flying) {
        this.vel.y -= GRAV;
      }
      // ground friction for neutral states
      if (this.isActionable() && this.state !== 'dash') { this.vel.x *= 0.7; this.vel.z *= 0.7; }
    }
    // facing
    if (this.isActionable() || this.state === 'block' || this.state === 'getup' || this.state === 'intro') {
      const t = this.yawTo(opp.pos);
      this.yaw = lerpAngle(this.yaw, t, this.state === 'intro' ? 1 : 0.3);
    }
    this.animate();
  }

  stepNeutral(opp) {
    // movement intent
    const guardHeld = this.held.B;
    const down = this.sideY < -0.55;
    // commands first
    const cmd = this.commandMove(this.state === 'dash' && this.sf > 4 ? 'dash' : '');
    if (cmd) { this.startMove(cmd.id, cmd.b); return; }
    if (this.buf.E) {
      this.buf.E = 0;
      let dir;
      if (this.sideY > 0.4) dir = [0, 1]; else if (this.sideY < -0.4) dir = [0, -1];
      else if (this.fwd < -0.5) dir = [-1, 0];
      else dir = [0, (this.match.frame & 1) ? 1 : -1];
      this.state = 'evade'; this.sf = 0;
      this.evade = { dir, len: 16, rec: 8, speed: this.def.evade || 0.32 };
      this.invul = 15;
      this.match.audio.play('whoosh', { vol: 0.5 });
      return;
    }
    if (this.dashReq) {
      const d = this.dashReq; this.dashReq = 0;
      if (d === -1) { this.state = 'backdash'; this.sf = 0; this.match.audio.play('whoosh', { vol: 0.4, pitch: 0.7 }); return; }
      this.state = 'dash'; this.sf = 0;
    }
    if (this.state === 'dash') {
      if (this.fwd > 0.3 || this.sf < 12) {
        this.applyMoveDir([1, 0], this.def.dash * Math.min(1, 0.4 + this.sf / 10));
        if (this.sf % 12 === 6) this.match.onFootstep(this, 1.1);
        return;
      }
      this.state = 'idle'; this.sf = 0;
    }
    if (guardHeld) {
      const wantCrouch = down;
      this.state = wantCrouch ? 'crouch' : 'guard';
      return;
    }
    const mv = Math.abs(this.fwd) > 0.3 || Math.abs(this.sideY) > 0.4;
    if (mv) {
      if (this.state !== 'walk') { this.state = 'walk'; this.sf = 0; }
      this.walkBack = this.fwd < -0.3;
      const fwd = Math.abs(this.fwd) > 0.3 ? Math.sign(this.fwd) : 0;
      const side = Math.abs(this.sideY) > 0.4 ? Math.sign(this.sideY) : 0;
      const sp = fwd > 0 ? this.def.walk : fwd < 0 ? this.def.back : 0;
      this.applyMoveDir([fwd, side], fwd ? sp : this.def.side, side ? this.def.side : 0);
      this.gaitPhase += (fwd ? sp : this.def.side) * (this.def.stride || 1.35) * (fwd < 0 ? -1 : 1);
    } else if (this.state !== 'idle') { this.state = 'idle'; this.sf = 0; this.walkBack = false; }
  }

  // dir: [forward, side(+ = away from camera)] ; moves relative to opponent (circle strafe for side)
  applyMoveDir(dir, sp, sideSp) {
    const opp = this.opp;
    const f = this.forward(tmpV);
    if (dir[0]) { this.pos.x += f.x * sp * dir[0]; this.pos.z += f.z * sp * dir[0]; }
    if (dir[1]) {
      // circle around opponent; "+side" = away from camera
      const camSide = this.match.cameraSideSign(this);
      const ang = ((sideSp ?? sp) / Math.max(4, this.distTo(opp))) * dir[1] * camSide;
      const dx = this.pos.x - opp.pos.x, dz = this.pos.z - opp.pos.z;
      const c = Math.cos(ang), s = Math.sin(ang);
      this.pos.x = opp.pos.x + dx * c - dz * s;
      this.pos.z = opp.pos.z + dx * s + dz * c;
    }
  }

  stepMove(opp) {
    const mv = this.move;
    this.mf++;
    const f = this.mf;
    // tracking during early startup
    const tr = mv.track ?? 4;
    if (f <= tr) this.yaw = lerpAngle(this.yaw, this.yawTo(opp.pos), 0.35);
    // movement
    if (mv.lunge) for (const l of mv.lunge) if (f >= l[0] && f < l[1]) {
      const fw = this.forward(tmpV);
      // don't lunge through opponent
      const d = this.distTo(opp);
      const sp = d < this.def.push + opp.def.push + 0.5 && l[2] > 0 ? 0 : l[2];
      this.pos.x += fw.x * sp; this.pos.z += fw.z * sp;
    }
    if (mv.rise) for (const r of mv.rise) if (f >= r[0] && f < r[1]) { this.pos.y += r[2]; this.vel.y = 0; }
    if (mv.air) { this.vel.y = 0; }
    // events
    if (mv.events) for (const e of mv.events) if (e[0] === f) this.match.event(this, e[1], e[2] || {});
    if (mv.sfx) for (const s of mv.sfx) if (s[0] === f) this.match.audio.play(s[1], s[2] || {});
    // projectile spawns
    if (mv.proj) for (const p of mv.proj) if (p.at === f || (p.every && f >= p.at && f < p.until && (f - p.at) % p.every === 0)) this.match.spawnProjectile(this, p);
    if (mv.beam && f === mv.beam.from) this.match.startBeam(this, mv.beam);
    // throw hold
    if (this.holding) this.updateHold();
    // cancels
    if (mv.cancel && f >= mv.cancel.from && f <= (mv.cancel.until ?? 99) && (this.connected || this.blocked || mv.cancel.any)) {
      // target-combo strings (e.g. L,L,L) take priority over regular commands
      if (mv.cancel.chain) for (const b in mv.cancel.chain) if (this.buf[b] && this.dirKey() !== 'd') { this.startMove(mv.cancel.chain[b], b); return; }
      if (!this.connected && !mv.cancel.any) { /* on block only strings continue */ }
      else {
      const cmd = this.commandMove();
      if (cmd && (mv.cancel.to.includes(cmd.id) || (mv.cancel.special && this.def.moves[cmd.id].special))) {
        this.startMove(cmd.id, cmd.b); return;
      }
      }
    }
    const total = mv.startup + mv.active + mv.recovery;
    if (f >= total) {
      if (mv.spin && this.pose._root) { this.pose._root[4] -= Math.PI * 2 * mv.spin; }
      this.move = null; this.state = 'idle'; this.sf = 0; this.holding = null;
      if (this.pos.y > 0.1) this.vel.y = -0.05;
      if (mv.endState === 'down') { this.state = 'down'; this.downFrames = 30; }
    }
  }

  activeHitboxes() {
    const mv = this.move;
    if (!mv || this.state !== 'move' || !mv.hit) return null;
    const f = this.mf;
    if (f < mv.startup || f >= mv.startup + mv.active) return null;
    const list = Array.isArray(mv.hit) ? mv.hit : [mv.hit];
    return list.map((h) => ({ c: this.local(h.z, h.y, h.x || 0), r: h.r }));
  }

  hurtCylinders() {
    const st = this.state;
    const crouch = this.isCrouching();
    if (st === 'down' || (st === 'ko' && this.pos.y < 0.5)) return [{ c: this.local(-2, 0), y0: this.pos.y, y1: this.pos.y + 2.8, r: 4.5 }];
    const out = [];
    for (const h of this.def.hurt) {
      const k = crouch ? 0.62 : 1;
      const c = this.local(h.z, 0);
      out.push({ c, y0: this.pos.y + h.y0 * k, y1: this.pos.y + h.y1 * k, r: h.r });
    }
    if (st === 'air') for (const o of out) { o.y0 -= 1; o.y1 = o.y0 + 5; o.r += 1; }
    return out;
  }

  canGuard(attackerPos) {
    const st = this.state;
    const guarding = st === 'guard' || st === 'crouch' || st === 'block' || (st === 'walk' && this.walkBack) ||
      (st === 'idle' && this.held.B);
    if (!guarding || this.pos.y > 1) return false;
    // must face attacker (side/back attacks after sidestep can't be blocked)
    const a = Math.abs(angleDiff(this.yaw, this.yawTo(attackerPos)));
    return a < 1.75;
  }

  takeHit(att, mv, opts) {
    // returns 'hit' | 'block' | 'whiff' | 'armor'
    const m = this.match;
    if (this.invul > 0 && mv.height !== 'throw') return 'whiff';
    this.lastHitFrame = this.match.frame;
    if (this.state === 'grabbed' && opts.src !== att) return 'whiff';
    if (this.state === 'ko') return 'whiff';
    const down = this.state === 'down' || this.state === 'getup';
    if (down && !mv.otg && !opts.proj && !opts.beam) return 'whiff';
    const crouch = this.isCrouching();
    if (mv.height === 'high' && crouch) return 'whiff';
    // guard
    const src = opts.srcPos || att.pos;
    if (!down && mv.height !== 'unblockable' && this.canGuard(src)) {
      const ok = mv.height === 'low' ? crouch : (mv.height === 'mid' ? !crouch : true);
      if (ok) {
        this.state = 'block'; this.sf = 0; this.blockCrouch = crouch;
        this.stun = opts.blockstun ?? mv.blockstun ?? 12;
        const chip = Math.round((mv.chip ?? (mv.special || mv.super ? 0.15 : 0)) * (opts.dmg ?? mv.dmg) * att.dmgMul);
        this.hp = Math.max(this.hp > 1 ? 1 : 0, this.hp - chip);
        if (mv.super && this.hp - chip <= 0) this.hp = 0;
        const push = (opts.push ?? mv.push ?? 0.4) * 0.8;
        this.knockFrom(src, push);
        this.meter = Math.min(100, this.meter + 2);
        att.meter = Math.min(100, att.meter + 2);
        return 'block';
      }
    }
    // armor (super armor during heavy startups)
    if (this.state === 'move' && this.move.armor && !this.armorUsed && this.mf >= this.move.armor[0] && this.mf <= this.move.armor[1] && mv.height !== 'throw' && !mv.super) {
      this.armorUsed = true;
      const dmg = Math.round((opts.dmg ?? mv.dmg) * 0.5 * att.dmgMul);
      this.hp = Math.max(0, this.hp - dmg);
      this.flash = 8;
      return 'armor';
    }
    // hit
    const counter = this.state === 'move' && this.mf < this.move.startup + this.move.active && !opts.proj;
    this.comboHits++;
    const scale = this.comboHits <= 2 ? 1 : (opts.beam || mv.super) ? Math.max(0.55, 1 - 0.03 * (this.comboHits - 2)) : Math.max(0.3, 1 - 0.11 * (this.comboHits - 2));
    let dmg = (opts.dmg ?? mv.dmg) * scale * att.dmgMul * (counter ? 1.25 : 1) * (down ? 0.6 : 1);
    dmg = Math.max(1, Math.round(dmg / (this.def.defense || 1)));
    this.hp = Math.max(0, this.hp - dmg);
    this.comboDmg += dmg;
    att.stats.dmgDealt += dmg;
    att.stats.maxCombo = Math.max(att.stats.maxCombo, this.comboHits);
    att.meter = Math.min(100, att.meter + dmg * 0.11 * (mv.super ? 0 : 1));
    this.meter = Math.min(100, this.meter + dmg * 0.07);
    this.move = null; this.beam = null; this.holding = null;
    if (this.grabbedBy && opts.src !== this.grabbedBy) this.grabbedBy = null;
    this.flash = 6;
    const push = opts.push ?? mv.push ?? 0.35;
    const launch = (counter && mv.chLaunch) ? mv.chLaunch : (opts.launch ?? mv.launch);
    const wasAir = this.state === 'air' || this.pos.y > 0.6;
    if (this.hp <= 0) {
      this.state = 'ko'; this.sf = 0;
      this.vel.y = 0.45; this.knockFrom(src, Math.max(push, 0.6));
    } else if (launch || wasAir) {
      this.state = 'air'; this.sf = 0;
      this.vel.y = launch ? launch * (wasAir ? Math.max(0.45, 1 - this.comboHits * 0.08) : 1) : 0.2;
      if (this.pos.y < 0.2) this.pos.y = 0.2;
      this.knockFrom(src, push);
    } else if (mv.knockdown) {
      this.state = 'air'; this.sf = 0; this.vel.y = 0.22; this.pos.y = Math.max(this.pos.y, 0.2);
      this.knockFrom(src, push);
    } else if (down) {
      this.state = 'down'; this.downFrames = Math.min(this.downFrames, 30);
    } else {
      this.state = 'hit'; this.sf = 0;
      this.stun = (opts.hitstun ?? mv.hitstun ?? 18) + (counter ? 8 : 0);
      this.hitLow = mv.height === 'low';
      this.knockFrom(src, push);
    }
    if (this.state !== 'ko') this.knockFace = 1;
    return counter ? 'counter' : 'hit';
  }

  knockFrom(srcPos, push) {
    let dx = this.pos.x - srcPos.x, dz = this.pos.z - srcPos.z;
    const l = Math.hypot(dx, dz) || 1;
    const w = this.def.weight || 1;
    this.vel.x = (dx / l) * push / w; this.vel.z = (dz / l) * push / w;
  }

  endCombo() { this.comboHits = 0; this.comboDmg = 0; }

  // throws: attacker holds victim at local offset
  startHold(victim, spec) {
    this.holding = { victim, spec, f0: this.mf };
    victim.state = 'grabbed'; victim.sf = 0; victim.grabbedBy = this;
    victim.move = null; victim.beam = null;
  }
  updateHold() {
    const h = this.holding, v = h.victim, sp = h.spec;
    const t = this.mf - h.f0;
    if (v.state !== 'grabbed') { this.holding = null; return; }
    // break window
    if (t < 9 && v.buf.G && !this.match.isCPU(v)) {
      this.holding = null; v.grabbedBy = null; v.buf.G = 0;
      v.state = 'hit'; v.stun = 14; v.knockFrom(this.pos, 0.6);
      this.state = 'hit'; this.stun = 14; this.move = null; this.knockFrom(v.pos, 0.6);
      this.match.event(this, 'throwBreak', {});
      return;
    }
    if (t >= sp.release) {
      this.holding = null; v.grabbedBy = null;
      v.state = 'idle';
      v.takeHit(this, { ...sp.hitMove, height: 'unblockable' }, { src: this });
      this.match.onHitFx(this, v, sp.hitMove, v.local(0, 5), 'hit');
      return;
    }
    // hold path keyframes [[t, z, y, x]]
    const path = sp.path;
    let k = 0; while (k < path.length - 1 && t >= path[k + 1][0]) k++;
    const a = path[k], b = path[Math.min(k + 1, path.length - 1)];
    const u = b[0] === a[0] ? 1 : Math.min(1, (t - a[0]) / (b[0] - a[0]));
    const z = a[1] + (b[1] - a[1]) * u, y = a[2] + (b[2] - a[2]) * u, x = (a[3] || 0) + ((b[3] || 0) - (a[3] || 0)) * u;
    this.local(z, y, x, v.pos);
    v.vel.set(0, 0, 0);
    v.yaw = this.yaw + Math.PI;
  }

  // ------------- animation -------------
  animate() {
    const d = this.def, P = d.poses, st = this.state;
    let clip = null, f = this.sf, k = 0.22;
    const tgt = this.target;
    if (st === 'move') { clip = this.move.anim; f = this.mf; k = this.move.blend || 0.42; }
    else if (st === 'hit') { clip = this.hitLow ? d.anims.hitLow : d.anims.hit; k = 0.55; }
    else if (st === 'block') { copyPose(this.blockCrouch ? P.crouch : P.guard, tgt); k = 0.5; }
    else if (st === 'guard') copyPose(P.guard, tgt);
    else if (st === 'crouch') { copyPose(P.crouch, tgt); k = 0.35; }
    else if (st === 'air' || (st === 'ko' && this.pos.y > 0.5)) { copyPose(P.air, tgt); k = 0.25; }
    else if (st === 'down' || st === 'ko') { copyPose(P.down, tgt); k = 0.18; }
    else if (st === 'getup') { clip = d.anims.getup; }
    else if (st === 'grabbed') { copyPose(P.grabbed || P.air, tgt); k = 0.3; }
    else if (st === 'evade') { clip = d.anims.evade; f = this.sf; k = 0.4; }
    else if (st === 'backdash') { copyPose(P.backdash || P.guard, tgt); }
    else if (st === 'dash') { copyPose(P.dash || P.base, tgt); k = 0.25; }
    else if (st === 'win') { clip = d.anims.win; k = 0.15; }
    else if (st === 'lose') { copyPose(P.down, tgt); }
    else if (st === 'intro') { clip = d.anims.intro; k = 0.2; }
    else copyPose(P.base, tgt);
    if (clip) sampleClip(clip, f, tgt);
    // procedural layers
    const t = this.match.frame;
    const ctx = { t, st, fighter: this, walk: st === 'walk' || st === 'dash', phase: this.gaitPhase, side: this.sideY || 0 };
    if (d.proc) d.proc(tgt, ctx);
    if ((st === 'walk' || st === 'dash') && d.gait) {
      const prev = Math.sin(this.lastPhase || 0);
      if (st === 'dash') this.gaitPhase += d.dash * 0.9;
      d.gait(tgt, this.gaitPhase, st === 'dash' ? 1.35 : 1, ctx);
      // footsteps when phase crosses 0 / pi
      const cur = Math.sin(this.gaitPhase);
      if (Math.sign(cur) !== Math.sign(prev) && !d.flyer) this.match.onFootstep(this, st === 'dash' ? 1.2 : 0.8);
      this.lastPhase = this.gaitPhase;
    }
    // tail secondary motion: yaw velocity history propagates down the chain
    const dy = angleDiff(this.prevYaw, this.yaw);
    this.prevYaw = this.yaw;
    const lat = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
    this.tailIdx = (this.tailIdx + 1) & 63;
    this.tailHist[this.tailIdx] = dy * 6 + lat * 0.6;
    if (d.tails) for (const chain of d.tails) {
      for (let i = 0; i < chain.length; i++) {
        const v = this.tailHist[(this.tailIdx - i * 3 + 64) & 63];
        const sway = Math.sin(t * 0.05 - i * 0.6) * 0.035 * (i + 1) * 0.5;
        addTo(tgt, chain[i], 0, -v * 0.5 * (1 + i * 0.1) + sway, 0);
      }
    }
    approachPose(this.pose, tgt, k);
  }

  // called every render frame
  syncView(dt) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    const rig = this.model.rig;
    rig.apply(this.pose);
    const r = this.pose._root;
    const pv = this.model.pivot;
    if (r) { pv.position.set(r[0] || 0, r[1] || 0, r[2] || 0); pv.rotation.set(r[3] || 0, r[4] || 0, r[5] || 0); }
    else { pv.position.set(0, 0, 0); pv.rotation.set(0, 0, 0); }
    if (this.model.update) this.model.update(this, dt);
  }
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function lerpAngle(a, b, t) { return a + angleDiff(a, b) * t; }
