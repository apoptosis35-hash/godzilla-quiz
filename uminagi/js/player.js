// The traveller: walking on the ground grid (stairs, ramps, terraces), collisions with buildings and props,
// and the third-person camera that stays out of walls and above the ground.
import * as THREE from 'three';

const R = 0.34, MAX_UP = 0.6, MAX_SLOPE = 1.05, WALK = 3.4, RUN = 7.0, GRAV = 22;

export class Player {
  constructor(town, ground) {
    this.town = town; this.ground = ground;
    this.pos = new THREE.Vector3(0, 1.6, 19);
    this.vy = 0; this.heading = Math.PI; this.speed = 0; this.t = 0;
    this.yaw = Math.PI; this.pitch = 0.28; this.dist = 7; this.camDist = 7;
    // なぎ: the chibi kitten the player controls (../uminagi-assets nagi.glb)
    this.model = town.clone('nagi', 0, 0, 0, 0, true);
    this.limbs = {}; for (const s of ['arm_l', 'arm_r', 'leg_l', 'leg_r', 'head', 'tail']) this.limbs[s] = this.model.getObjectByName('nagi_' + s);
    this.camPos = new THREE.Vector3(); this.camTarget = new THREE.Vector3();
  }
  place(x, z, yaw) {
    this.pos.set(x, this.ground.height(x, z), z); this.vy = 0;
    if (yaw !== undefined) { this.yaw = yaw; this.heading = yaw; }
    this.snapCam = true;
  }
  // can the player stand at (x, z) coming from height y?
  canStand(x, z, fromY, step) {
    const s = this.ground.sample(x, z), dh = s.h - fromY;
    if (!s.plat && s.h < -0.3) return null;                 // the sea
    if (dh > MAX_UP) return null;                           // wall or high step
    if (!s.plat && dh > 0.04 && dh / Math.max(step, 0.01) > MAX_SLOPE) return null;   // steep hillside
    if (dh < -0.7 && !s.plat) return null;                  // don't jump down natural cliffs
    if (x < -165 || x > 125 || z < -145 || z > 127) return null;
    return s;
  }
  collide(p) {
    const y = this.pos.y;
    for (let it = 0; it < 2; it++) for (const c of this.town.colliders) {
      if (Math.abs(c.x - p.x) > 20 || Math.abs(c.z - p.z) > 20) continue;
      if (y + 1.6 < c.y0 || y > c.y1) continue;
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
  update(dt, input, camYaw) {
    this.t += dt;
    const mv = input.move, mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const target = mag > 0.05 ? (input.run ? RUN : WALK) * mag : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 8);
    const groundNow = this.ground.height(this.pos.x, this.pos.z);
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
    // vertical: follow stairs smoothly, fall when stepping off a wall
    const g = this.ground.height(this.pos.x, this.pos.z);
    if (this.pos.y > g + 0.35 && !onGround || this.pos.y > g + 0.75) { this.vy -= GRAV * dt; this.pos.y += this.vy * dt; if (this.pos.y < g) { this.pos.y = g; this.vy = 0; } }
    else { this.vy = 0; this.pos.y += (g - this.pos.y) * Math.min(1, dt * 18); if (Math.abs(g - this.pos.y) < 0.01) this.pos.y = g; }
    // model + walk cycle
    this.model.position.copy(this.pos); this.model.rotation.y = this.heading;
    // chibi walk: quick short steps, a hop on every step, swinging arms, bobbing head, waving tail; idle breathing
    const run = this.speed > WALK + 0.5, k = Math.min(1, this.speed / WALK), f = run ? 15 : 11;
    this.phase = (this.phase || 0) + dt * f * (k > 0.05 ? 1 : 0);
    const sw = Math.sin(this.phase) * k * (run ? 0.9 : 0.7), L = this.limbs;
    if (L.leg_l) { L.leg_l.rotation.x = sw; L.leg_r.rotation.x = -sw; }
    if (L.arm_l) {
      L.arm_l.rotation.x = -sw * 1.1; L.arm_r.rotation.x = sw * 1.1;
      L.arm_l.rotation.z = -0.15 - (run ? 0.35 : 0.1) * k; L.arm_r.rotation.z = 0.15 + (run ? 0.35 : 0.1) * k;   // arms out when running
    }
    const breathe = Math.sin(this.t * 2.2) * 0.012 * (1 - k);
    if (L.head) { L.head.rotation.z = Math.sin(this.phase) * 0.06 * k + Math.sin(this.t * 0.9) * 0.03 * (1 - k); L.head.rotation.x = (run ? 0.12 : 0.04) * k + breathe * 3; }
    if (L.tail) { L.tail.rotation.z = Math.sin(this.t * (k > 0.05 ? 7 : 2.4)) * (0.25 + 0.2 * k); L.tail.rotation.x = -0.3 * k; }
    this.model.position.y += Math.abs(Math.sin(this.phase)) * k * (run ? 0.09 : 0.06) + breathe;
    this.model.rotation.x = (run ? 0.12 : 0.04) * k;   // lean into the walk
  }
  // third-person camera; returns the camera position
  updateCamera(dt, camera, look, zoom) {
    this.yaw -= look.x; this.pitch = Math.max(-0.25, Math.min(1.25, this.pitch + look.y));
    this.dist = Math.max(2.5, Math.min(30, this.dist * Math.exp(zoom)));
    const tgt = this.camTarget.set(this.pos.x, this.pos.y + 1.0, this.pos.z);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // pull in when a building or the ground is in the way
    let d = this.dist;
    for (let s = 0.6; s < this.dist; s += 0.35) {
      const x = tgt.x + dir.x * s, y = tgt.y + dir.y * s, z = tgt.z + dir.z * s;
      if (y < this.ground.height(x, z) + 0.35 || this.blocked(x, y, z)) { d = Math.max(0.8, s - 0.4); break; }
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
      if (Math.abs(lx) < c.hw + 0.2 && Math.abs(lz) < c.hd + 0.2) return true;
    }
    return false;
  }
}
