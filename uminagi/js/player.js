// The traveller: walking on the ground grid (stairs, ramps, terraces), collisions with buildings and props,
// and the third-person camera that stays out of walls and above the ground.
import * as THREE from 'three';

const R = 0.34, MAX_UP = 0.6, MAX_SLOPE = 1.05, WALK = 3.4, RUN = 7.0, GRAV = 22;
const SIZE = 0.5;   // the player model is about 1.25 m tall; ぽっけ stands about 0.63 m, as tall as the animal villagers

export class Player {
  constructor(town, ground) {
    this.town = town; this.ground = ground;
    this.pos = new THREE.Vector3(0, 1.6, 19);
    this.vy = 0; this.heading = Math.PI; this.speed = 0; this.t = 0;
    this.yaw = Math.PI; this.pitch = 0.28; this.dist = 7; this.camDist = 7;
    // ぽっけ: the round hippo the player controls (../uminagi-assets pc_hippo.glb; the older Shiba model if it is missing).
    // The parts come as siblings; nest them into a little skeleton: body (hips) > head > ears, body > arms, body > tail;
    // the legs hang from the root.
    const M = town.protos.pc_hippo ? 'pc_hippo' : 'shiba';
    this.model = town.clone(M, 0, 0, 0, 0, true); this.model.rotation.order = 'YXZ';
    this.limbs = {}; for (const s of ['body', 'head', 'ear_l', 'ear_r', 'arm_l', 'arm_r', 'leg_l', 'leg_r', 'tail']) this.limbs[s] = this.model.getObjectByName(M + '_' + s);
    const L = this.limbs;
    // the part nodes carry the mesh quantisation scale (body 0.25): keep it, never reset it to 1
    this.bodyScale = L.body.scale.x;
    for (const s of ['head', 'arm_l', 'arm_r', 'tail']) L.body.attach(L[s]);
    L.head.attach(L.ear_l); L.head.attach(L.ear_r);
    this.rest = {}; for (const [k, o] of Object.entries(L)) this.rest[k] = o.position.clone();
    this.phase = 0; this.landT = 0;
    this.camPos = new THREE.Vector3(); this.camTarget = new THREE.Vector3();
    this.state = 'ground'; this.vel = new THREE.Vector3();
    this.lastSafe = new THREE.Vector3(0, 1.6, 19); this.safeT = 0;
  }
  place(x, z, yaw) {
    this.pos.set(x, this.ground.height(x, z), z); this.vy = 0; this.state = 'ground'; this.vel.set(0, 0, 0);
    if (yaw !== undefined) { this.yaw = yaw; this.heading = yaw; }
    this.snapCam = true;
  }
  // can the player stand at (x, z) coming from height y?
  canStand(x, z, fromY, step) {
    const s = this.ground.sample(x, z), dh = s.h - fromY;
    if (!s.plat && s.h < -0.3) return null;                 // the sea
    if (dh > MAX_UP) return null;                           // wall or high step
    if (!s.plat && dh > 0.04 && dh / Math.max(step, 0.01) > MAX_SLOPE) return null;   // steep hillside
    if (x < -165 || x > 157 || z < -145 || z > 233) return null;
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
  landOrRespawn(g) {
    const s = this.ground.sample(this.pos.x, this.pos.z);
    if (g < -0.3 && !s.plat) {   // into the sea: back to the last safe spot
      this.pos.copy(this.lastSafe); this.snapCam = true;
    } else this.pos.y = g;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.5) this.heading = Math.atan2(this.vel.x, this.vel.z);
    const impact = -this.vel.y; if (impact > 6) this.landT = Math.min(0.32, 0.12 + impact * 0.012);   // squash on landing
    this.speed = Math.min(RUN * 1.3, hs); this.vel.set(0, 0, 0); this.vy = 0; this.state = 'ground';
  }
  // falling (off a quay edge or a terrace wall): gravity, a little steering, then land (or back to land from the sea)
  fall(dt, wx, wz) {
    const v = this.vel, p = this.pos;
    v.y -= GRAV * dt; v.x += wx * 4 * dt; v.z += wz * 4 * dt;
    const ny = p.y + v.y * dt, q = { x: p.x + v.x * dt, z: p.z + v.z * dt };
    this.collide(q, ny);
    if (this.ground.height(q.x, q.z) > ny + 0.5) { q.x = p.x; q.z = p.z; v.x = v.z = 0; }   // bonk on a terrain wall
    if (q.x < -165 || q.x > 157 || q.z < -145 || q.z > 233) { q.x = p.x; q.z = p.z; v.x = v.z = 0; }
    p.x = q.x; p.z = q.z;
    const g = this.support(p.x, p.z, Math.max(p.y, ny));
    if (ny <= g && v.y <= 0) { this.landOrRespawn(g); return; }
    p.y = ny; this.airT += dt;
  }
  update(dt, input, camYaw) {
    this.t += dt;
    const mv = input.move, mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const cfx = -Math.sin(camYaw), cfz = -Math.cos(camYaw), wx = cfx * mv.y - cfz * mv.x, wz = cfz * mv.y + cfx * mv.x;
    if (this.state !== 'ground') { this.fall(dt, wx, wz); this.speed = 0; this.animate(dt); return; }
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
    if (this.state === 'ground' && g > -0.3) { this.safeT += dt; if (this.safeT > 0.5) { this.safeT = 0; this.lastSafe.copy(this.pos); } }
    this.animate(dt);
  }
  // procedural animation: walk / run / idle, falling and the landing squash. All angles are relative to the bind pose.
  animate(dt) {
    const L = this.limbs, st = this.state, t = this.t, R0 = this.rest;
    for (const [k, o] of Object.entries(L)) { o.rotation.set(0, 0, 0); o.position.copy(R0[k]); }
    L.body.scale.setScalar(this.bodyScale); this.model.scale.setScalar(SIZE);
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
      L.body.scale.y = this.bodyScale * (1 + Math.sin(t * 2.4) * 0.018 * idle);
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
    } else {   // air
      const up = v.y > 0;
      if (up) {   // rising: knees up, arms reaching
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
  }
  // third-person camera; returns the camera position
  updateCamera(dt, camera, look, zoom) {
    this.yaw -= look.x; this.pitch = Math.max(-0.25, Math.min(1.25, this.pitch + look.y));
    this.dist = Math.max(2.5, Math.min(30, this.dist * Math.exp(zoom)));
    const tgt = this.camTarget.set(this.pos.x, this.pos.y + 0.5, this.pos.z);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // pull in when a building or the ground is in the way
    const want = this.dist; let d = want;
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
