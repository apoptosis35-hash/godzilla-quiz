// Fighting-game camera: side-on tracking, shake, super/KO/intro cinematics.
import * as THREE from 'three';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

export class CameraRig {
  constructor(cam) {
    this.cam = cam;
    this.trauma = 0;
    this.side = new THREE.Vector3(0, 0, 1);
    this.pos = new THREE.Vector3(0, 12, 40);
    this.look = new THREE.Vector3(0, 6, 0);
    this.cine = null;
    this.t = 0;
    this.fovBase = 50;
    this.zoomPunch = 0;
  }
  shake(a) { this.trauma = Math.min(1.2, this.trauma + a); }
  punch(a) { this.zoomPunch = Math.max(this.zoomPunch, a); }
  reset(f0, f1) {
    const mid = v1.addVectors(f0.pos, f1.pos).multiplyScalar(0.5);
    const sep = v2.subVectors(f1.pos, f0.pos);
    const perp = new THREE.Vector3(-sep.z, 0, sep.x).normalize();
    // choose side so that f0 appears on screen-left
    const fwd = perp.clone().negate();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    if (v3.subVectors(f0.pos, mid).dot(right) > 0) perp.negate();
    this.side.copy(perp);
    this.computeFight(f0, f1);
    this.pos.copy(this.desiredPos); this.look.copy(this.desiredLook);
    this.cine = null;
  }
  setCine(c) { this.cine = c ? { ...c, t: 0 } : null; }

  computeFight(f0, f1) {
    const mid = v1.addVectors(f0.pos, f1.pos).multiplyScalar(0.5);
    const sep = v2.subVectors(f1.pos, f0.pos); sep.y = 0;
    const d = sep.length();
    const perp = v3.set(-sep.z, 0, sep.x).normalize();
    if (perp.dot(this.side) < 0) perp.negate();
    if (d > 0.5) this.side.lerp(perp, 0.06).normalize();
    const aspect = this.cam.aspect;
    const narrow = aspect < 1.4 ? (1.4 / Math.max(0.5, aspect)) : 1;
    const dist = THREE.MathUtils.clamp(d * 0.72 + 21, 25, 50) * Math.min(1.6, narrow * 0.9 + 0.1);
    const maxY = Math.max(f0.pos.y, f1.pos.y);
    const hgt = (f0.def.height + f1.def.height) / 2;
    this.desiredPos = (this.desiredPos || new THREE.Vector3()).copy(mid).addScaledVector(this.side, dist);
    this.desiredPos.y = hgt * 0.62 + dist * 0.12 + maxY * 0.5;
    // keep inside arena (avoid clipping buildings)
    const r = Math.hypot(this.desiredPos.x, this.desiredPos.z);
    const lim = 34;
    if (r > lim) { this.desiredPos.x *= lim / r; this.desiredPos.z *= lim / r; this.desiredPos.y += (r - lim) * 0.35; }
    this.desiredLook = (this.desiredLook || new THREE.Vector3()).copy(mid);
    this.desiredLook.y = hgt * 0.5 + maxY * 0.45;
  }

  update(dt, match) {
    this.t += dt;
    const [f0, f1] = match.fighters;
    let lerp = 1 - Math.pow(0.0015, dt);
    if (this.cine) {
      const c = this.cine; c.t += dt;
      const f = c.f;
      if (c.type === 'super') {
        // orbit close to the attacker's face, then over-shoulder
        const ph = c.t < c.dur * 0.6 ? 0 : 1;
        if (ph === 0) {
          const a = c.t / (c.dur * 0.6);
          f.local(13 - a * 3, f.def.height * 0.75, 7 - a * 9, this.desiredPos = this.desiredPos || new THREE.Vector3());
          f.local(2, f.def.height * 0.75, 0, this.desiredLook);
        } else {
          f.local(-15, f.def.height * 1.2, 11, this.desiredPos);
          f.local(14, f.def.height * 0.4, 0, this.desiredLook);
        }
        lerp = ph === 0 && c.t < 0.05 ? 1 : 1 - Math.pow(0.0005, dt);
        if (c.t >= c.dur) this.cine = null;
      } else if (c.type === 'intro') {
        const who = c.t < c.dur / 2 ? f0 : f1;
        const a = (c.t % (c.dur / 2)) / (c.dur / 2);
        const ang = -0.9 + a * 0.9;
        who.local(Math.cos(ang) * 21, who.def.height * (0.45 + a * 0.35), Math.sin(ang) * 21, this.desiredPos);
        who.local(0, who.def.height * 0.6, 0, this.desiredLook);
        lerp = a < 0.02 ? 1 : 1 - Math.pow(0.02, dt);
        if (c.t >= c.dur) { this.cine = null; this.computeFight(f0, f1); }
      } else if (c.type === 'ko' || c.type === 'win') {
        const tf = c.f;
        const ang = c.t * 0.25 + (c.a0 || 0);
        const rad = c.type === 'ko' ? 26 : 19;
        this.desiredPos.set(tf.pos.x + Math.sin(ang) * rad, tf.def.height * (c.type === 'ko' ? 0.9 : 0.45), tf.pos.z + Math.cos(ang) * rad);
        this.desiredLook.set(tf.pos.x, tf.def.height * 0.55 + tf.pos.y * 0.5, tf.pos.z);
        lerp = 1 - Math.pow(0.05, dt);
      }
    } else {
      this.computeFight(f0, f1);
    }
    this.pos.lerp(this.desiredPos, lerp);
    this.look.lerp(this.desiredLook, lerp);
    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * 1.4;
    const t = this.t * 40;
    this.cam.position.set(
      this.pos.x + (Math.sin(t * 1.1) + Math.sin(t * 2.3)) * 0.5 * s,
      this.pos.y + (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1)) * 0.5 * s,
      this.pos.z + (Math.sin(t * 1.3 + 2) + Math.sin(t * 2.9)) * 0.5 * s,
    );
    this.cam.lookAt(this.look);
    this.cam.rotation.z += Math.sin(t * 0.9) * s * 0.01;
    this.zoomPunch = Math.max(0, this.zoomPunch - dt * 3);
    const fov = this.fovBase - this.zoomPunch * 6 + (this.cine && this.cine.type === 'super' ? -6 : 0);
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov += (fov - this.cam.fov) * 0.3; this.cam.updateProjectionMatrix(); }
  }
}
