// The traveller: walking on the ground grid (stairs, ramps, terraces), collisions with buildings and props,
// and the third-person camera that stays out of walls and above the ground.
// Spider-style moves: jump, swing on a web line from building / tree / pole tops, climb walls, run over roofs.
import * as THREE from 'three';

const R = 0.34, MAX_UP = 0.6, MAX_SLOPE = 1.05, WALK = 3.4, RUN = 7.0, GRAV = 22;
const JUMP = 9.5, CLIMB = 4.2, SWING_MAX = 38;
const SIZE = 0.7;   // the Shiba model is 1.3 m tall; the dog in the game stands about 0.9 m

export class Player {
  constructor(town, ground) {
    this.town = town; this.ground = ground;
    this.pos = new THREE.Vector3(0, 1.6, 19);
    this.vy = 0; this.heading = Math.PI; this.speed = 0; this.t = 0;
    this.yaw = Math.PI; this.pitch = 0.28; this.dist = 8.5; this.camDist = 8.5;
    // なぎ: the chibi Shiba Inu the player controls (../uminagi-assets shiba.glb). The parts come as siblings; nest them
    // into a little skeleton: body (hips) > head > ears, body > arms, body > tail; the legs hang from the root.
    this.model = town.clone('shiba', 0, 0, 0, 0, true); this.model.rotation.order = 'YXZ';
    this.limbs = {}; for (const s of ['body', 'head', 'ear_l', 'ear_r', 'arm_l', 'arm_r', 'leg_l', 'leg_r', 'tail']) this.limbs[s] = this.model.getObjectByName('shiba_' + s);
    const L = this.limbs;
    for (const s of ['head', 'arm_l', 'arm_r', 'tail']) L.body.attach(L[s]);
    L.head.attach(L.ear_l); L.head.attach(L.ear_r);
    this.rest = {}; for (const [k, o] of Object.entries(L)) this.rest[k] = o.position.clone();
    this.phase = 0; this.landT = 0; this.flipT = 0;
    this.camPos = new THREE.Vector3(); this.camTarget = new THREE.Vector3();
    this.state = 'ground'; this.vel = new THREE.Vector3(); this.anchor = new THREE.Vector3(); this.rope = 0;
    this.wall = null; this.push = 0; this.lastSafe = new THREE.Vector3(0, 1.6, 19); this.safeT = 0;
    // the web line (hand -> anchor)
    const wg = new THREE.CylinderGeometry(0.03, 0.03, 1, 5, 1, true); wg.translate(0, 0.5, 0);
    this.web = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: 0xf2f2ec, transparent: true, opacity: 0.85 }));
    this.web.frustumCulled = false; this.web.visible = false; this.model.parent.add(this.web);
  }
  place(x, z, yaw) {
    this.pos.set(x, this.ground.height(x, z), z); this.vy = 0; this.state = 'ground'; this.vel.set(0, 0, 0); this.web.visible = false;
    if (yaw !== undefined) { this.yaw = yaw; this.heading = yaw; }
    this.snapCam = true;
  }
  // can the player stand at (x, z) coming from height y?
  canStand(x, z, fromY, step) {
    const s = this.ground.sample(x, z), dh = s.h - fromY;
    if (!s.plat && s.h < -0.3) return null;                 // the sea
    if (dh > MAX_UP) return null;                           // wall or high step
    if (!s.plat && dh > 0.04 && dh / Math.max(step, 0.01) > MAX_SLOPE) return null;   // steep hillside
    if (x < -165 || x > 125 || z < -145 || z > 127) return null;
    return s;
  }
  collide(p, yAt) {
    const y = yAt ?? this.pos.y;
    for (let it = 0; it < 2; it++) for (const c of this.town.colliders) {
      if (Math.abs(c.x - p.x) > 20 || Math.abs(c.z - p.z) > 20) continue;
      if (y + 1.6 < c.y0 || y > c.y1 - 0.05) continue;   // standing on its top: not a wall
      if (c.type === 'c') {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = R + c.r;
        if (d < m && d > 1e-6) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
      } else {
        const dx = p.x - c.x, dz = p.z - c.z;
        const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;   // into box space (inverse of ry)
        const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
        let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
        if (d >= R) continue;
        if (d < 1e-6) {  // centre inside: push out through the nearest face
          const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
          if (px < pz) { ex = Math.sign(lx) || 1; ez = 0; d = 0; var nx = qx + ex * (px + R); var nz = lz; }
          else { ex = 0; ez = Math.sign(lz) || 1; d = 0; nx = lx; nz = qz + ez * (pz + R); }
          p.x = c.x + nx * c.c + nz * c.s; p.z = c.z - nx * c.s + nz * c.c; continue;
        }
        const k = (R - d) / d, ox = ex * k, oz = ez * k;
        p.x += ox * c.c + oz * c.s; p.z += -ox * c.s + oz * c.c;
      }
    }
    for (const n of this.town.npcs) {
      const dx = p.x - n.o.position.x, dz = p.z - n.o.position.z, d = Math.hypot(dx, dz), m = R + n.r;
      if (d < m && d > 1e-6 && Math.abs(n.o.position.y - y) < 1.5) { p.x = n.o.position.x + dx / d * m; p.z = n.o.position.z + dz / d * m; }
    }
  }
  // what the player stands on at (x, z) when coming down from height y: terrain, or the top of a building / prop
  support(x, z, y) {
    let h = this.ground.height(x, z);
    for (const c of this.town.colliders) {
      if (c.type !== 'b' || c.y0 < -1.5 || c.y1 > y + 0.35 || c.y1 <= h) continue;   // boats (y0 -2) move: no standing on them
      if (Math.abs(c.x - x) > c.hw + c.hd || Math.abs(c.z - z) > c.hw + c.hd) continue;
      const dx = x - c.x, dz = z - c.z, lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
      if (Math.abs(lx) < c.hw && Math.abs(lz) < c.hd) h = c.y1;
    }
    return h;
  }
  // a climbable wall just ahead of (x, z) in direction (dx, dz): building-sized boxes taller than the player
  wallAhead(x, y, z, dx, dz) {
    const px = x + dx * (R + 0.3), pz = z + dz * (R + 0.3);
    for (const c of this.town.colliders) {
      if (c.type !== 'b' || c.y0 < -1.5 || c.hw * c.hd < 1.2 || c.y1 < y + 1.4 || y < c.y0) continue;
      if (Math.abs(c.x - px) > c.hw + c.hd + 1 || Math.abs(c.z - pz) > c.hw + c.hd + 1) continue;
      const lx = (px - c.x) * c.c - (pz - c.z) * c.s, lz = (px - c.x) * c.s + (pz - c.z) * c.c;
      if (Math.abs(lx) > c.hw || Math.abs(lz) > c.hd) continue;
      return { c, n: this.faceNormal(c, x, z) };
    }
    return null;
  }
  // outward normal of the box face nearest to (x, z)
  faceNormal(c, x, z) {
    const lx = (x - c.x) * c.c - (z - c.z) * c.s, lz = (x - c.x) * c.s + (z - c.z) * c.c;
    const ox = Math.abs(lx) - c.hw, oz = Math.abs(lz) - c.hd;
    const nx = ox > oz ? Math.sign(lx) : 0, nz = ox > oz ? 0 : Math.sign(lz);
    return new THREE.Vector3(nx * c.c + nz * c.s, 0, -nx * c.s + nz * c.c);
  }
  // web anchor: the best building / tree / pole top ahead and above; open sky over the sea gets a sky hook
  findAnchor(dx, dz) {
    const p = this.pos; let bs = -1e9, found = false; const t = new THREE.Vector3();
    for (const c of this.town.colliders) {
      const hy = c.y1 - p.y; if (hy < 4.5 || c.y0 < -1.5) continue;
      if (Math.abs(c.x - p.x) > 45 || Math.abs(c.z - p.z) > 45) continue;
      // the web sticks to the near roof edge / the top of a tree or pole, never through the roof
      if (c.type === 'b') {
        const lx = (p.x - c.x) * c.c - (p.z - c.z) * c.s, lz = (p.x - c.x) * c.s + (p.z - c.z) * c.c;
        if (Math.abs(lx) < c.hw && Math.abs(lz) < c.hd) continue;   // we are under / inside it
        const qx = Math.max(-c.hw, Math.min(c.hw, lx)) * 0.92, qz = Math.max(-c.hd, Math.min(c.hd, lz)) * 0.92;
        t.set(c.x + qx * c.c + qz * c.s, c.y1 - 0.4, c.z - qx * c.s + qz * c.c);
      } else t.set(c.x, c.y1 - 0.6, c.z);
      const rx = t.x - p.x, rz = t.z - p.z, ahead = rx * dx + rz * dz, lat = Math.abs(rx * dz - rz * dx);
      if (ahead < 3 || ahead > 38 || lat > ahead * 0.75 + 4) continue;
      const sc = hy * 0.9 - Math.abs(ahead - 14) * 0.35 - lat * 0.5;
      if (sc > bs) { bs = sc; this.anchor.copy(t); found = true; }
    }
    if (found) return this.anchor;
    return this.anchor.set(p.x + dx * 15, Math.max(p.y + 13, 15), p.z + dz * 15);
  }
  landOrRespawn(g) {
    const s = this.ground.sample(this.pos.x, this.pos.z);
    if (g < -0.3 && !s.plat) {   // into the sea: back to the last safe spot
      this.pos.copy(this.lastSafe); this.snapCam = true;
    } else this.pos.y = g;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.5) this.heading = Math.atan2(this.vel.x, this.vel.z);
    const impact = -this.vel.y; if (impact > 6) this.landT = Math.min(0.32, 0.12 + impact * 0.012);   // squash on landing
    this.flipT = 0;
    this.speed = Math.min(RUN * 1.3, hs); this.vel.set(0, 0, 0); this.vy = 0; this.state = 'ground'; this.web.visible = false;
  }
  // airborne / swinging / climbing; returns true when it handled this frame
  hero(dt, input, wx, wz, mag, camYaw) {
    const v = this.vel, p = this.pos;
    if (this.state === 'climb') {
      const { c, n } = this.wall, fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      let tx = -fz, tz = fx; const tn = tx * n.x + tz * n.z; tx -= n.x * tn; tz -= n.z * tn;
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const up = input.move.y * CLIMB, side = input.move.x * CLIMB * 0.8;
      p.y += up * dt; p.x += tx * side * dt; p.z += tz * side * dt;
      this.climbPhase = (this.climbPhase || 0) + dt * 9 * Math.min(1, Math.hypot(up, side) / CLIMB);
      // stay on the face; let go past a corner
      const lx = (p.x - c.x) * c.c - (p.z - c.z) * c.s, lz = (p.x - c.x) * c.s + (p.z - c.z) * c.c;
      const nlx = n.x * c.c - n.z * c.s, nlz = n.x * c.s + n.z * c.c;
      let qx = Math.abs(nlx) > 0.5 ? Math.sign(nlx) * (c.hw + R + 0.02) : lx, qz = Math.abs(nlz) > 0.5 ? Math.sign(nlz) * (c.hd + R + 0.02) : lz;
      if (Math.abs(nlx) > 0.5 && Math.abs(lz) > c.hd + 0.2 || Math.abs(nlz) > 0.5 && Math.abs(lx) > c.hw + 0.2) { this.state = 'air'; this.airT = 0; v.set(0, 0, 0); return true; }
      p.x = c.x + qx * c.c + qz * c.s; p.z = c.z - qx * c.s + qz * c.c;
      this.heading = Math.atan2(-n.x, -n.z);
      if (p.y >= c.y1 - 0.9 && input.move.y > 0.2) {   // over the top onto the roof
        p.y = c.y1; p.x -= n.x * (R + 0.7); p.z -= n.z * (R + 0.7); this.state = 'ground'; this.speed = 0; return true;
      }
      const g = this.ground.height(p.x, p.z);
      if (p.y <= g && input.move.y < 0) { p.y = g; this.state = 'ground'; return true; }
      if (input.jump) { v.set(n.x * 6.5, JUMP * 0.85, n.z * 6.5); this.state = 'air'; this.airT = 0; this.heading = Math.atan2(n.x, n.z); }
      return true;
    }
    // air and swing share the integration
    v.y -= GRAV * dt;
    const hs = Math.hypot(v.x, v.z), cap = Math.max(hs, RUN);
    v.x += wx * (this.state === 'swing' ? 9 : 11) * dt; v.z += wz * (this.state === 'swing' ? 9 : 11) * dt;
    const hs2 = Math.hypot(v.x, v.z); if (hs2 > cap) { v.x *= cap / hs2; v.z *= cap / hs2; }
    if (this.state === 'air' && input.webHeld && this.airT > 0.12 && !this.webLock) {
      const d = hs > 1.5 ? [v.x / hs, v.z / hs] : [Math.sin(this.heading), Math.cos(this.heading)];
      const a = this.findAnchor(d[0], d[1]), L = a.distanceTo(p);
      if (L > 4) {
        this.state = 'swing'; this.rope = L * 0.97; v.x += d[0] * 4; v.z += d[1] * 4; this.webLock = true;
        // the web reels in until the bottom of the arc clears whatever is under the anchor
        this.ropeMin = Math.max(4, a.y - this.support(a.x, a.z, a.y - 0.5) - 1.8);
      }
    }
    if (!input.webHeld) this.webLock = false;
    if (this.state === 'swing') {
      if (hs > 0.5) { v.x += v.x / hs * 3 * dt; v.z += v.z / hs * 3 * dt; }   // pumping
      if (!input.webHeld) {
        this.state = 'air'; if (hs > 0.5) { v.x += v.x / hs * 2.5; v.z += v.z / hs * 2.5; } v.y = Math.max(v.y, 0) + 5;
        if (hs > 9) this.flipT = 1e-4;   // a fast release ends in a front flip
      }
    }
    const sp = v.length(); if (sp > SWING_MAX) v.multiplyScalar(SWING_MAX / sp);
    const n = { x: p.x + v.x * dt, z: p.z + v.z * dt }; let ny = p.y + v.y * dt;
    if (this.state === 'swing') {   // rope constraint
      const dx = n.x - this.anchor.x, dy = ny - this.anchor.y, dz = n.z - this.anchor.z, d = Math.hypot(dx, dy, dz);
      this.rope = Math.max(4, this.rope - (2.5 + Math.max(0, this.rope - (this.ropeMin || 4)) * 1.6) * dt);
      if (d > this.rope) {
        const k = this.rope / d; n.x = this.anchor.x + dx * k; ny = this.anchor.y + dy * k; n.z = this.anchor.z + dz * k;
        const ux = dx / d, uy = dy / d, uz = dz / d, vr = v.x * ux + v.y * uy + v.z * uz;
        if (vr > 0) { v.x -= ux * vr; v.y -= uy * vr; v.z -= uz * vr; }
      }
    }
    // walls: stick and climb when flying into a building
    const hv = Math.hypot(v.x, v.z);
    if (hv > 0.5) {
      const w = this.wallAhead(p.x, ny, p.z, v.x / hv, v.z / hv);
      if (w && (w.c.y1 - ny) > 1.2) { this.wall = w; this.state = 'climb'; v.set(0, 0, 0); this.web.visible = false; p.y = Math.max(ny, this.ground.height(p.x, p.z)); return true; }
    }
    const q = { x: n.x, z: n.z }; this.collide(q, ny);
    if (this.ground.height(q.x, q.z) > ny + 0.5) { q.x = p.x; q.z = p.z; v.x = v.z = 0; }   // bonk on a terrain wall
    if (q.x !== n.x || q.z !== n.z) { v.x = (q.x - p.x) / dt; v.z = (q.z - p.z) / dt; }
    if (q.x < -165 || q.x > 125 || q.z < -145 || q.z > 127) { q.x = p.x; q.z = p.z; v.x = v.z = 0; }
    p.x = q.x; p.z = q.z;
    const g = this.support(p.x, p.z, Math.max(p.y, ny));
    if (ny <= g && v.y <= 0) { this.landOrRespawn(g); return true; }
    p.y = ny; this.airT += dt;
    if (hv > 1) { let da = Math.atan2(v.x, v.z) - this.heading; da = Math.atan2(Math.sin(da), Math.cos(da)); this.heading += da * Math.min(1, dt * 8); }
    return true;
  }
  update(dt, input, camYaw) {
    this.t += dt;
    const mv = input.move, mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const cfx = -Math.sin(camYaw), cfz = -Math.cos(camYaw), wx = cfx * mv.y - cfz * mv.x, wz = cfz * mv.y + cfx * mv.x;
    if (this.state !== 'ground') { this.hero(dt, input, wx, wz, mag, camYaw); this.speed = 0; this.animate(dt); return; }
    const target = mag > 0.05 ? (input.run ? RUN : WALK) * mag : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 8);
    const groundNow = this.support(this.pos.x, this.pos.z, this.pos.y);
    const onGround = this.pos.y <= groundNow + 0.05;
    if (mag > 0.05) {
      // camera-relative direction: forward = away from the camera
      const fwdX = -Math.sin(camYaw), fwdZ = -Math.cos(camYaw);
      const dirX = fwdX * mv.y + -fwdZ * mv.x * -1 * -1, dirZ = fwdZ * mv.y + fwdX * mv.x;
      const want = Math.atan2(fwdX * mv.y - fwdZ * mv.x, fwdZ * mv.y + fwdX * mv.x);
      let da = want - this.heading; da = Math.atan2(Math.sin(da), Math.cos(da));
      this.heading += da * Math.min(1, dt * 12);
      void dirX; void dirZ;
    }
    if (this.speed > 0.01) {
      const step = this.speed * dt, sx = Math.sin(this.heading) * step, sz = Math.cos(this.heading) * step;
      const fromY = Math.max(groundNow, Math.min(this.pos.y, groundNow + 0.3));
      const tryMove = (dx, dz) => {
        const p = { x: this.pos.x + dx, z: this.pos.z + dz };
        this.collide(p);
        const s = this.canStand(p.x, p.z, fromY, Math.hypot(p.x - this.pos.x, p.z - this.pos.z));
        if (!s) return false;
        this.pos.x = p.x; this.pos.z = p.z; return true;
      };
      if (!tryMove(sx, sz)) {   // slide along walls
        if (!tryMove(sx, 0)) tryMove(0, sz);
      }
    } else { const p = { x: this.pos.x, z: this.pos.z }; this.collide(p); if (this.canStand(p.x, p.z, groundNow, 0.01)) { this.pos.x = p.x; this.pos.z = p.z; } }
    // vertical: follow stairs smoothly; stepping off a roof, quay or terrace edge is a fall
    const g = this.support(this.pos.x, this.pos.z, this.pos.y);
    const fwdX = Math.sin(this.heading) * this.speed, fwdZ = Math.cos(this.heading) * this.speed;
    if (this.pos.y > g + 0.75) { this.state = 'air'; this.airT = 0; this.vel.set(fwdX, 0, fwdZ); }
    else { this.vy = 0; this.pos.y += (g - this.pos.y) * Math.min(1, dt * 18); if (Math.abs(g - this.pos.y) < 0.01) this.pos.y = g; }
    if (input.jump && this.state === 'ground') { this.state = 'air'; this.airT = 0; this.vel.set(fwdX * 1.1, JUMP, fwdZ * 1.1); }
    // running into a building: start climbing after a short push
    if (this.state === 'ground' && mag > 0.5) {
      const w = this.wallAhead(this.pos.x, this.pos.y, this.pos.z, Math.sin(this.heading), Math.cos(this.heading));
      this.push = w ? this.push + dt : 0;
      if (w && this.push > 0.18) { this.wall = w; this.state = 'climb'; this.push = 0; }
    } else this.push = 0;
    if (this.state === 'ground' && g > -0.3) { this.safeT += dt; if (this.safeT > 0.5) { this.safeT = 0; this.lastSafe.copy(this.pos); } }
    this.animate(dt);
  }
  // procedural animation: walk / run / idle, jump and fall, web swing (body follows the rope), release flip,
  // landing squash and wall climbing. All angles are relative to the bind pose.
  animate(dt) {
    const L = this.limbs, st = this.state, t = this.t, R0 = this.rest;
    for (const [k, o] of Object.entries(L)) { o.rotation.set(0, 0, 0); o.position.copy(R0[k]); }
    L.body.scale.set(1, 1, 1); this.model.scale.setScalar(SIZE);
    const v = this.vel, hs = Math.hypot(v.x, v.z), clamp = THREE.MathUtils.clamp;
    let pitch = 0, roll = 0, lift = 0;
    const wag = (f, a) => { L.tail.rotation.z = Math.sin(t * f) * a; L.tail.rotation.y = Math.sin(t * f) * a * 0.4; };
    if (st === 'ground') {
      const k = Math.min(1, this.speed / WALK), run = this.speed > WALK + 0.5, idle = 1 - k;
      this.phase += dt * (run ? 13 : 9.5) * (k > 0.05 ? 1 : 0);
      const s = Math.sin(this.phase), c = Math.cos(this.phase), stride = k * (run ? 0.95 : 0.6);
      L.leg_l.rotation.x = s * stride; L.leg_r.rotation.x = -s * stride;
      const pump = run ? -0.55 * k : 0;   // running: elbows forward, arms pump
      L.arm_l.rotation.x = -s * stride * (run ? 1.25 : 0.9) + pump; L.arm_r.rotation.x = s * stride * (run ? 1.25 : 0.9) + pump;
      L.arm_l.rotation.z = -0.1 - 0.12 * k; L.arm_r.rotation.z = 0.1 + 0.12 * k;
      L.body.rotation.y = s * 0.16 * k; L.body.rotation.z = s * 0.05 * k; L.body.rotation.x = (run ? 0.24 : 0.07) * k;
      lift = Math.abs(c) * k * (run ? 0.11 : 0.055) * SIZE;
      L.head.rotation.y = -L.body.rotation.y * 0.8; L.head.rotation.x = -L.body.rotation.x * 0.6 + Math.sin(this.phase * 2) * 0.05 * k;
      const earBack = run ? 0.55 * k : 0, flap = Math.abs(c) * 0.16 * k;
      L.ear_l.rotation.x = earBack + flap; L.ear_r.rotation.x = earBack + flap;
      // idle: breathing, looking around, an ear twitch now and then, happy tail
      L.body.scale.y = 1 + Math.sin(t * 2.4) * 0.018 * idle;
      L.head.rotation.y += Math.sin(t * 0.45) * 0.45 * idle * (Math.sin(t * 0.13) > 0 ? 1 : 0.3);
      L.head.rotation.z = Math.sin(t * 0.7) * 0.08 * idle;
      if ((t * 0.37) % 1 < 0.05) L.ear_l.rotation.z = -0.3 * idle;
      if ((t * 0.29 + 0.5) % 1 < 0.05) L.ear_r.rotation.z = 0.3 * idle;
      wag(k > 0.05 ? 15 : 10, 0.22 + 0.12 * k);
      if (this.landT > 0) {   // landing: squash and crouch
        const f = this.landT / 0.32; this.landT = Math.max(0, this.landT - dt);
        this.model.scale.set(SIZE * (1 + 0.1 * f), SIZE * (1 - 0.2 * f), SIZE * (1 + 0.1 * f)); L.body.rotation.x += 0.35 * f;
        L.arm_l.rotation.z -= 0.6 * f; L.arm_r.rotation.z += 0.6 * f; L.ear_l.rotation.x -= 0.4 * f; L.ear_r.rotation.x -= 0.4 * f;
      }
      pitch = 0;
    } else if (st === 'climb') {
      const a = Math.sin(this.climbPhase || 0), b = Math.cos(this.climbPhase || 0);
      L.arm_l.rotation.set(-2.55 - a * 0.5, 0, -0.25); L.arm_r.rotation.set(-2.55 + a * 0.5, 0, 0.25);
      L.leg_l.rotation.set(-0.7 + a * 0.6, 0, -0.18); L.leg_r.rotation.set(-0.7 - a * 0.6, 0, 0.18);
      L.body.rotation.z = a * 0.09; L.body.position.y += Math.abs(b) * 0.03;
      L.head.rotation.x = -0.4; L.ear_l.rotation.x = L.ear_r.rotation.x = 0.25;
      wag(6, 0.25); pitch = -0.12;
    } else if (st === 'swing') {
      // the body hangs from the web: tilt it toward the anchor
      const d = this.anchor.clone().sub(this.pos).setY(this.anchor.y - this.pos.y - 0.8).normalize();
      const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
      const lx = d.x * ch - d.z * sh, lz = d.x * sh + d.z * ch;
      pitch = Math.atan2(lz, d.y) * 0.85; roll = -Math.atan2(lx, d.y) * 0.85;
      const fwd = v.x * sh + v.z * ch, sp = v.length();
      L.arm_r.rotation.set(-3.05, 0, 0.12); L.arm_l.rotation.set(-0.5 + clamp(-fwd * 0.03, -0.6, 0.6), 0, -1.0);
      const trail = clamp(fwd * 0.045, -0.3, 0.9), kick = Math.sin(t * 7) * 0.12;
      L.leg_l.rotation.x = trail - 0.35 + kick; L.leg_r.rotation.x = trail + 0.3 - kick;
      L.body.rotation.x = -0.15; L.head.rotation.x = -0.25;
      const stream = clamp(0.35 + sp * 0.025, 0, 1.1);
      L.ear_l.rotation.x = L.ear_r.rotation.x = stream + Math.sin(t * 22) * 0.06;
      L.tail.rotation.x = 0.35; wag(9, 0.12);
    } else {   // air
      const up = v.y > 0;
      if (this.flipT > 0) {   // front flip after letting go of a fast swing
        this.flipT += dt; const f = Math.min(1, this.flipT / 0.65), e = f * f * (3 - 2 * f);
        pitch = e * Math.PI * 2; if (f >= 1) this.flipT = 0;
        const tuck = Math.sin(f * Math.PI);
        L.leg_l.rotation.x = L.leg_r.rotation.x = -1.5 * tuck; L.arm_l.rotation.set(-1.4 * tuck, 0, -0.3); L.arm_r.rotation.set(-1.4 * tuck, 0, 0.3);
        L.body.rotation.x = 0.4 * tuck; L.head.rotation.x = 0.4 * tuck;
      } else if (up) {   // rising: knees up, arms reaching
        L.leg_l.rotation.x = -1.1; L.leg_r.rotation.x = -0.45;
        L.arm_l.rotation.set(-2.3, 0, -0.45); L.arm_r.rotation.set(-2.3, 0, 0.45);
        L.head.rotation.x = -0.2; pitch = clamp(hs * 0.02, 0, 0.35);
      } else {   // falling: spread out, paws paddling, ears blown up
        const fl = Math.sin(t * 14) * 0.18;
        L.arm_l.rotation.set(-0.7 + fl, 0, -1.25); L.arm_r.rotation.set(-0.7 - fl, 0, 1.25);
        L.leg_l.rotation.set(0.25 - fl, 0, -0.28); L.leg_r.rotation.set(-0.15 + fl, 0, 0.28);
        L.head.rotation.x = 0.15; pitch = clamp(hs * 0.025, 0, 0.5);
      }
      L.ear_l.rotation.x = L.ear_r.rotation.x = up ? 0.5 : -0.55 + Math.sin(t * 24) * 0.15;
      L.tail.rotation.x = up ? 0.3 : -0.3; wag(12, 0.15);
    }
    this.model.position.set(this.pos.x, this.pos.y + lift, this.pos.z);
    this.model.rotation.set(pitch, this.heading, roll);
    // the web strand: from the raised right paw to the anchor
    if (st === 'swing') {
      this.model.updateMatrixWorld(true);
      const hand = L.arm_r.localToWorld(new THREE.Vector3(0.07, -0.24, 0.04));
      const d = this.anchor.clone().sub(hand), len = d.length();
      this.web.position.copy(hand); this.web.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(len)); this.web.scale.set(1, len, 1);
      this.web.visible = true;
    } else this.web.visible = false;
  }
  // third-person camera; returns the camera position
  updateCamera(dt, camera, look, zoom) {
    this.yaw -= look.x; this.pitch = Math.max(-0.25, Math.min(1.25, this.pitch + look.y));
    // while swinging / flying fast, the camera swings round behind the direction of travel (unless the player is looking around)
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if ((this.state === 'swing' || this.state === 'air') && hs > 5 && Math.abs(look.x) < 1e-4) {
      let da = (Math.atan2(this.vel.x, this.vel.z) + Math.PI) - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
      this.yaw += da * Math.min(1, dt * 1.3);
    }
    this.dist = Math.max(2.5, Math.min(30, this.dist * Math.exp(zoom)));
    this.heroCam = (this.heroCam || 0) + ((this.state === 'swing' || this.state === 'air' ? 3.5 : 0) - (this.heroCam || 0)) * Math.min(1, dt * 2);
    const tgt = this.camTarget.set(this.pos.x, this.pos.y + 0.8, this.pos.z);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // pull in when a building or the ground is in the way
    const want = this.dist + this.heroCam; let d = want;
    for (let s = 0.6; s < want; s += 0.35) {
      const x = tgt.x + dir.x * s, y = tgt.y + dir.y * s, z = tgt.z + dir.z * s;
      if (y < this.ground.height(x, z) + 0.35 || this.blocked(x, y, z)) { d = Math.max(this.state === 'ground' ? 0.8 : 1.8, s - 0.4); break; }
    }
    this.camDist += (d - this.camDist) * Math.min(1, dt * (d < this.camDist ? 14 : 3));
    if (this.snapCam) { this.camDist = d; this.snapCam = false; }
    camera.position.copy(tgt).addScaledVector(dir, this.camDist);
    camera.lookAt(tgt);
    return camera.position;
  }
  blocked(x, y, z) {
    for (const c of this.town.colliders) {
      if (c.type !== 'b' || c.hw * c.hd < 4) continue;
      if (Math.abs(c.x - x) > 25 || Math.abs(c.z - z) > 25 || y < c.y0 || y > c.y1) continue;
      const dx = x - c.x, dz = z - c.z, lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
      const m = this.state === 'ground' ? 0.2 : 0.9;   // eaves and facades stick out past the footprint
      if (Math.abs(lx) < c.hw + m && Math.abs(lz) < c.hd + m && y < c.y1 + (this.state === 'ground' ? 0 : 0.8)) return true;
    }
    return false;
  }
}
