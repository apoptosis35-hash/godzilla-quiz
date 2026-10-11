// Visual effects: GPU point particles, beams, lightning ribbons, shockwaves, debris, decals, flashes.
import * as THREE from 'three';
import { spriteTexture } from './textures.js';

const PVERT = `
attribute float size; attribute float alpha; attribute vec3 pcolor;
varying float vA; varying vec3 vC;
uniform float uScale;
void main(){
  vA = alpha; vC = pcolor;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = min(size * uScale / max(0.5,-mv.z), 900.0);
  gl_Position = projectionMatrix * mv;
}`;
const PFRAG = `
uniform sampler2D map; varying float vA; varying vec3 vC;
void main(){
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vC * t.rgb, t.a * vA);
  if (gl_FragColor.a < 0.003) discard;
}`;

class Pool {
  constructor(max, additive, tex) {
    this.max = max;
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.a0 = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uScale: { value: 400 } },
      vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 10;
    this.geo = g;
  }
  emit(o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0;
    this.col[i * 3] = o.r; this.col[i * 3 + 1] = o.g; this.col[i * 3 + 2] = o.b;
    this.size[i] = o.size; this.grow[i] = o.grow || 0;
    this.life[i] = this.maxLife[i] = o.life;
    this.a0[i] = o.alpha ?? 1; this.alpha[i] = this.a0[i];
    this.grav[i] = o.grav || 0; this.drag[i] = o.drag ?? 0.98;
  }
  update(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { // swap remove
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const d = Math.pow(this.drag[i], dt * 60);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.a0[i] * Math.min(1, t * 2.2) * Math.min(1, (1 - t) * 12 + 0.2);
    }
    this.n = n;
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'pcolor', 'alpha', 'size']) {
      const a = this.geo.attributes[k];
      a.needsUpdate = true;
      a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize);
    }
  }
  copy(src, dst) {
    for (const arr of [this.pos, this.vel, this.col]) { arr[dst * 3] = arr[src * 3]; arr[dst * 3 + 1] = arr[src * 3 + 1]; arr[dst * 3 + 2] = arr[src * 3 + 2]; }
    for (const arr of [this.alpha, this.size, this.life, this.maxLife, this.grow, this.grav, this.drag, this.a0]) arr[dst] = arr[src];
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

// Camera-facing ribbon for lightning bolts
class Bolt {
  constructor(color, width, segs = 16) {
    this.segs = segs;
    this.width = width;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array((segs + 1) * 2 * 3);
    const uv = new Float32Array((segs + 1) * 2 * 2), idx = [];
    for (let i = 0; i <= segs; i++) { uv.set([i / segs, 0, i / segs, 1], i * 4); if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 color; uniform float opacity; varying vec2 vUv; void main(){ float c = 1.0-abs(vUv.y-0.5)*2.0; c = pow(c,1.5); vec3 col = mix(color, vec3(1.0), pow(c,4.0)); gl_FragColor=vec4(col*c*2.0, c*opacity);}',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
    this.pts = [];
    for (let i = 0; i <= segs; i++) this.pts.push(new THREE.Vector3());
  }
  set(a, b, jitter, cam, w) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const perp1 = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    if (perp1.lengthSq() < 0.01) perp1.set(1, 0, 0);
    const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();
    for (let i = 0; i <= this.segs; i++) {
      const t = i / this.segs;
      const env = Math.sin(Math.PI * t);
      const p = this.pts[i].copy(a).addScaledVector(dir, t);
      if (i > 0 && i < this.segs) p.addScaledVector(perp1, (Math.random() - 0.5) * jitter * env * len * 0.1).addScaledVector(perp2, (Math.random() - 0.5) * jitter * env * len * 0.1);
    }
    const width = w ?? this.width;
    const tmp = new THREE.Vector3(), side = new THREE.Vector3(), toCam = new THREE.Vector3();
    for (let i = 0; i <= this.segs; i++) {
      const p = this.pts[i];
      const q = this.pts[Math.min(this.segs, i + 1)], r = this.pts[Math.max(0, i - 1)];
      tmp.subVectors(q, r);
      toCam.subVectors(cam.position, p);
      side.crossVectors(tmp, toCam).normalize().multiplyScalar(width);
      this.pos.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], i * 6);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

const BEAM_VERT = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv=uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const BEAM_FRAG = `uniform vec3 color; uniform float time; uniform float opacity; uniform float hot; uniform float len;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  float edge = abs(dot(vN, vV));
  float n = sin(vUv.y*len*1.3 - time*38.0 + vUv.x*18.85)*0.5+0.5;
  float n2 = sin(vUv.y*len*0.5 - time*22.0 - vUv.x*12.566)*0.5+0.5;
  float a = pow(edge, 1.3) * (0.55 + 0.3*n + 0.25*n2);
  vec3 c = mix(color, vec3(1.0), pow(edge, 6.0) * hot);
  gl_FragColor = vec4(c * a * 2.2, a * opacity);
}`;

export class FX {
  constructor(scene, q) {
    this.scene = scene;
    this.q = q;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.add = new Pool(q.particles, true, spriteTexture('soft'));
    this.smoke = new Pool(Math.round(q.particles * 0.6), false, spriteTexture('smoke'));
    this.root.add(this.add.points, this.smoke.points);
    this.rings = [];
    this.bolts = [];
    this.beams = [];
    this.lights = [];
    this.timeAcc = 0;
    // flash lights
    const nl = q.level >= 2 ? 3 : q.level >= 1 ? 1 : 0;
    for (let i = 0; i < nl; i++) {
      const l = new THREE.PointLight(0xffaa66, 0, 60, 1.5);
      l.userData.decay = 0;
      this.root.add(l);
      this.lights.push(l);
    }
    // debris (instanced chunks)
    const dmax = q.debris;
    this.debrisMax = dmax;
    const dg = new THREE.BoxGeometry(1, 1, 1);
    this.debrisMesh = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), dmax);
    this.debrisMesh.castShadow = q.level >= 2;
    this.debrisMesh.count = 0;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris = [];
    this.root.add(this.debrisMesh);
    // crack decals
    this.decals = [];
    this.decalMat = new THREE.MeshBasicMaterial({ map: spriteTexture('crack'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, opacity: 0.85 });
    this.decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.ringGeo = new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2);
    this.sphereGeo = new THREE.SphereGeometry(1, 24, 16);
    this.ringTex = spriteTexture('ring');
    this.projVis = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }

  burst(p, o) {
    const n = Math.round((o.n || 20) * this.q.fxMul);
    const c = new THREE.Color(o.color ?? 0xffffff);
    const pool = o.smoke ? this.smoke : this.add;
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp = (o.speed || 10) * (0.3 + Math.random() * 0.7);
      let vx = Math.sin(ph) * Math.cos(th) * sp, vy = Math.cos(ph) * sp, vz = Math.sin(ph) * Math.sin(th) * sp;
      if (o.up) vy = Math.abs(vy) * o.up;
      if (o.dir) { vx += o.dir.x * (o.dirSp || 0); vy += o.dir.y * (o.dirSp || 0); vz += o.dir.z * (o.dirSp || 0); }
      const k = o.vary ? 1 - Math.random() * o.vary : 1;
      pool.emit({ x: p.x + (Math.random() - 0.5) * (o.spread || 0), y: p.y + (Math.random() - 0.5) * (o.spread || 0) * 0.5, z: p.z + (Math.random() - 0.5) * (o.spread || 0),
        vx, vy, vz, r: c.r * k, g: c.g * k, b: c.b * k, size: (o.size || 1) * (0.6 + Math.random() * 0.8), grow: o.grow || 0,
        life: (o.life || 0.6) * (0.6 + Math.random() * 0.6), grav: o.grav || 0, drag: o.drag ?? 0.93, alpha: o.alpha ?? 1 });
    }
  }
  hitSpark(p, strength = 1, color = 0xffd080, counter = false) {
    this.burst(p, { n: 26 * strength, color, speed: 26 * strength, size: 1.0, life: 0.28, drag: 0.86 });
    this.burst(p, { n: 4, color: 0xffffff, speed: 2, size: 6 * strength, life: 0.12, drag: 0.9 });
    if (counter) this.burst(p, { n: 20, color: 0xff3030, speed: 30, size: 1.3, life: 0.35, drag: 0.85 });
    this.flash(p, color, 8 * strength, 0.15);
  }
  blockSpark(p) {
    this.burst(p, { n: 16, color: 0x80c8ff, speed: 18, size: 0.8, life: 0.22, drag: 0.85 });
    this.burst(p, { n: 2, color: 0xa0e0ff, speed: 1, size: 5, life: 0.1 });
  }
  dust(p, scale = 1, color = 0x8a8070) {
    this.burst(p, { n: 10 * scale, color, speed: 6 * scale, up: 0.35, size: 3.5 * scale, grow: 4 * scale, life: 1.4, drag: 0.9, smoke: true, spread: 1.5 * scale, alpha: 0.55, vary: 0.3 });
  }
  explosion(p, scale = 1, color = 0xff8030) {
    this.burst(p, { n: 30 * scale, color, speed: 14 * scale, size: 2.4 * scale, grow: 2 * scale, life: 0.55, drag: 0.88, vary: 0.4 });
    this.burst(p, { n: 6 * scale, color: 0xfff0c0, speed: 4 * scale, size: 5 * scale, life: 0.25 });
    this.burst(p, { n: 14 * scale, color: 0x2a2624, speed: 6 * scale, up: 0.8, size: 4 * scale, grow: 5 * scale, life: 2.2, drag: 0.94, smoke: true, spread: 2 * scale, alpha: 0.7, vary: 0.3 });
    this.burst(p, { n: 16 * scale, color: 0xffb040, speed: 22 * scale, size: 0.5, life: 0.9, grav: 25, drag: 0.97 });
    this.flash(p, color, 30 * scale, 0.3);
  }
  flash(p, color, intensity, dur) {
    if (!this.lights.length) return;
    let l = this.lights.reduce((a, b) => (a.intensity < b.intensity ? a : b));
    l.position.copy(p); l.position.y += 2;
    l.color.set(color);
    l.intensity = intensity * 10;
    l.userData.decay = l.intensity / Math.max(0.05, dur);
  }
  ring(p, o = {}) {
    const mat = new THREE.MeshBasicMaterial({ color: o.color ?? 0xffffff, transparent: true, opacity: o.opacity ?? 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(o.sphere ? this.sphereGeo : this.ringGeo, mat);
    mesh.position.copy(p);
    if (!o.sphere) mesh.position.y = Math.max(0.15, p.y);
    mesh.renderOrder = 14;
    this.root.add(mesh);
    this.rings.push({ mesh, t: 0, dur: o.dur || 0.5, r0: o.r0 || 1, r1: o.r1 || 12, op: mat.opacity });
  }
  crack(p, size = 6) {
    let d;
    if (this.decals.length >= this.q.decals) { d = this.decals.shift(); }
    else { d = new THREE.Mesh(this.decalGeo, this.decalMat); d.renderOrder = 2; this.root.add(d); }
    d.position.set(p.x, 0.06, p.z);
    d.rotation.y = Math.random() * Math.PI * 2;
    d.scale.set(size, 1, size);
    this.decals.push(d);
  }
  clearDecals() { for (const d of this.decals) this.root.remove(d); this.decals = []; }

  spawnDebris(p, o = {}) {
    const n = Math.round((o.n || 8) * this.q.fxMul);
    const c = new THREE.Color(o.color ?? 0x8a8580);
    for (let i = 0; i < n; i++) {
      if (this.debris.length >= this.debrisMax) this.debris.shift();
      const sp = (o.speed || 8) * (0.4 + Math.random());
      const th = Math.random() * Math.PI * 2;
      const s = (o.size || 0.8) * (0.4 + Math.random());
      this.debris.push({
        p: new THREE.Vector3(p.x + (Math.random() - 0.5) * (o.spread || 1), p.y + (Math.random() - 0.5) * (o.spread || 1), p.z + (Math.random() - 0.5) * (o.spread || 1)),
        v: new THREE.Vector3(Math.cos(th) * sp + (o.dir ? o.dir.x * sp : 0), (o.up ?? 0.8) * sp * (0.5 + Math.random()), Math.sin(th) * sp + (o.dir ? o.dir.z * sp : 0)),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), w: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4),
        s: new THREE.Vector3(s, s * (0.5 + Math.random() * 0.6), s * (0.6 + Math.random() * 0.5)),
        life: 4 + Math.random() * 3, c: c.clone().multiplyScalar(0.7 + Math.random() * 0.5), rest: 0,
      });
    }
  }

  // ---------- beams ----------
  createBeam(spec) {
    const g = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5);
    const mk = (color, op) => new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, time: { value: 0 }, opacity: { value: op }, hot: { value: 1 }, len: { value: 1 } },
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const outer = new THREE.Mesh(g, mk(spec.color, 0.9));
    const inner = new THREE.Mesh(g, mk(spec.core ?? 0xffffff, 1));
    const grp = new THREE.Group();
    grp.add(outer, inner);
    outer.renderOrder = inner.renderOrder = 13;
    const bolts = [];
    if (spec.kind === 'gravity' || spec.kind === 'lightning') {
      for (let i = 0; i < (spec.kind === 'gravity' ? 3 : 2); i++) { const b = new Bolt(spec.color, spec.width * 0.5); bolts.push(b); this.root.add(b.mesh); }
      outer.visible = inner.visible = false;
    }
    let light = null;
    if (this.q.level >= 1) { light = new THREE.PointLight(spec.color, 0, 50, 1.4); grp.add(light); }
    this.root.add(grp);
    const b = { grp, outer, inner, spec, bolts, light, t: 0, alive: true, w: 0 };
    this.beams.push(b);
    return b;
  }
  updateBeam(b, a, end, cam, power = 1, origins = null) {
    const len = a.distanceTo(end);
    b.w += (power - b.w) * 0.35;
    const w = b.spec.width * (b.spec.super ? 1.1 : 1.5) * b.w * (1 + Math.sin(b.t * 50) * 0.08);
    for (const [m, k] of [[b.outer, 1], [b.inner, 0.38]]) {
      m.position.copy(a);
      m.lookAt(end);
      m.scale.set(w * k, w * k, len);
      m.material.uniforms.len.value = len;
    }
    if (b.light) { b.light.position.copy(a).lerp(end, 0.25); b.light.intensity = 260 * b.w * (this.q.level >= 3 ? 1 : 0.6); }
    if (origins) b.origins = origins;
    b.bolts.forEach((bolt, i) => bolt.set(b.origins ? b.origins[i % b.origins.length] : a, end, b.spec.kind === 'gravity' ? 1.4 : 0.9, cam, w * 0.55));
    b.end = end.clone(); b.start = a.clone();
    // particles along beam + impact
    const dir = new THREE.Vector3().subVectors(end, a).normalize();
    if (Math.random() < this.q.fxMul) {
      const t = Math.random();
      const pp = a.clone().lerp(end, t);
      this.add.emit({ x: pp.x, y: pp.y, z: pp.z, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, vz: (Math.random() - 0.5) * 6,
        r: b.outer.material.uniforms.color.value.r, g: b.outer.material.uniforms.color.value.g, b: b.outer.material.uniforms.color.value.b, size: w * 1.2, life: 0.25, drag: 0.9 });
    }
    this.add.emit({ x: a.x, y: a.y, z: a.z, r: 1, g: 0.9, b: 1, size: w * 4.5, life: 0.06 });
    if (b.impact !== false) {
      const c = b.outer.material.uniforms.color.value;
      this.add.emit({ x: end.x, y: end.y, z: end.z, r: 1, g: 1, b: 1, size: w * 6, life: 0.08 });
      for (let i = 0; i < 2 * this.q.fxMul; i++) this.add.emit({ x: end.x, y: end.y, z: end.z, vx: (Math.random() - 0.5) * 30 - dir.x * 8, vy: Math.random() * 20, vz: (Math.random() - 0.5) * 30 - dir.z * 8, r: c.r, g: c.g, b: c.b, size: 1.6, life: 0.4, drag: 0.9, grav: 10 });
    }
  }
  endBeam(b) { b.alive = false; }

  // ---------- projectile visuals ----------
  projVisual(kind, color) {
    const grp = new THREE.Group();
    const c = new THREE.Color(color);
    if (kind === 'missile') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.6, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd0d4dc, metalness: 0.8, roughness: 0.3 }));
      grp.add(body);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0, 1.05), new THREE.MeshStandardMaterial({ color: 0xc02020 }));
      grp.add(tip);
    } else if (kind !== 'quake') {
      const core = new THREE.Mesh(this.sphereGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const halo = new THREE.Mesh(this.sphereGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      core.scale.setScalar(0.5); halo.scale.setScalar(1.1);
      grp.add(core, halo);
      grp.userData.halo = halo;
    }
    this.root.add(grp);
    return grp;
  }
  removeVisual(g) { this.root.remove(g); g.traverse((o) => { if (o.material) o.material.dispose?.(); }); }

  update(dt, cam) {
    this.timeAcc += dt;
    this.add.update(dt); this.smoke.update(dt);
    this.updateStrikes(dt, cam);
    const sc = (this.viewH || window.innerHeight) * (this.renderPR || 1) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.add.mat.uniforms.uScale.value = sc;
    this.smoke.mat.uniforms.uScale.value = this.add.mat.uniforms.uScale.value;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.dur;
      const s = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 3));
      r.mesh.scale.set(s, r.mesh.geometry === this.sphereGeo ? s : 1, s);
      r.mesh.material.opacity = r.op * (1 - k);
      if (k >= 1) { this.root.remove(r.mesh); r.mesh.material.dispose(); this.rings.splice(i, 1); }
    }
    for (const l of this.lights) l.intensity = Math.max(0, l.intensity - l.userData.decay * dt);
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      b.outer.material.uniforms.time.value = b.t; b.inner.material.uniforms.time.value = b.t;
      if (!b.alive) {
        b.w *= Math.pow(0.002, dt);
        if (b.start) { const end = b.end; b.impact = false; this.updateBeam(b, b.start, end, cam, b.w); }
        if (b.w < 0.03) {
          this.root.remove(b.grp);
          for (const bo of b.bolts) this.root.remove(bo.mesh);
          b.outer.material.dispose(); b.inner.material.dispose();
          this.beams.splice(i, 1);
        }
      }
    }
    // debris physics
    const m = this._m, q = this._q;
    const dm = this.debrisMesh;
    let n = 0;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) { this.debris.splice(i, 1); continue; }
      if (!d.rest) {
        d.v.y -= 30 * dt;
        d.p.addScaledVector(d.v, dt);
        d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
        if (d.p.y < d.s.y * 0.5) {
          d.p.y = d.s.y * 0.5;
          d.v.y *= -0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6);
          if (Math.abs(d.v.y) < 1.5) d.rest = 1;
        }
      }
    }
    for (const d of this.debris) {
      const sh = d.life < 1 ? d.life : 1;
      q.setFromEuler(d.r);
      this._s.copy(d.s).multiplyScalar(sh);
      m.compose(d.p, q, this._s);
      dm.setMatrixAt(n, m);
      dm.setColorAt(n, d.c);
      n++;
    }
    dm.count = n;
    dm.instanceMatrix.needsUpdate = true;
    if (dm.instanceColor) dm.instanceColor.needsUpdate = true;
  }

  clear() {
    this.add.clear(); this.smoke.clear();
    for (const r of this.rings) this.root.remove(r.mesh);
    this.rings = [];
    for (const b of this.beams) { this.root.remove(b.grp); for (const bo of b.bolts) this.root.remove(bo.mesh); }
    this.beams = [];
  }
  // timed lightning strike from a to b
  strike(a, b, color, dur = 0.25, width = 0.9) {
    const bolt = new Bolt(color, width, 20);
    this.root.add(bolt.mesh);
    (this.strikes ||= []).push({ bolt, a: a.clone(), b: b.clone(), t: 0, dur });
  }
  updateStrikes(dt, cam) {
    if (!this.strikes) return;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t += dt;
      s.bolt.set(s.a, s.b, 1.6, cam);
      s.bolt.mat.uniforms.opacity.value = Math.max(0, 1 - s.t / s.dur);
      if (s.t >= s.dur) { this.root.remove(s.bolt.mesh); s.bolt.mesh.geometry.dispose(); s.bolt.mat.dispose(); this.strikes.splice(i, 1); }
    }
  }
  makeBolt(color, width) { const b = new Bolt(color, width); this.root.add(b.mesh); return b; }
  removeBolt(b) { this.root.remove(b.mesh); }
}
