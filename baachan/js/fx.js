// Effects: sprite puffs, coloured debris chunks, manga sound-effect words that pop in 3D, and screen speed lines.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const TEX = {};
function initTex() {
  const d = (fn) => canvasTex(64, 64, fn);
  TEX.puff = d((g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.6, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  TEX.star = d((g) => { g.fillStyle = '#ffe04a'; g.strokeStyle = '#c88a00'; g.lineWidth = 3; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 12 : 28; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke(); });
  TEX.feather = d((g) => { g.fillStyle = '#eef'; g.beginPath(); g.ellipse(32, 32, 9, 26, .5, 0, 7); g.fill(); });
  TEX.heart = d((g) => { g.fillStyle = '#ff5c8a'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♥', 32, 36); });
  TEX.note = d((g) => { g.fillStyle = '#ff7ab8'; g.font = 'bold 50px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♪', 32, 34); });
  TEX.spark = d((g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,220,1)'); r.addColorStop(0.3, 'rgba(255,220,80,.9)'); r.addColorStop(1, 'rgba(255,160,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  TEX.ring = d((g) => { g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 26, 0, 7); g.stroke(); });
  TEX.smoke = d((g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(80,80,80,1)'); r.addColorStop(1, 'rgba(80,80,80,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
}

export class FX {
  constructor(scene) {
    initTex();
    this.scene = scene;
    // sprites
    this.parts = [];
    for (let i = 0; i < 260; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      s.visible = false; scene.add(s);
      this.parts.push({ s, life: 0, max: 1, v: new THREE.Vector3(), g: 0, grow: 0, size: 1, spin: 0, drag: 0 });
    }
    this.pi = 0;
    // debris: instanced chunky cubes with per-instance colour
    this.DN = 400;
    this.deb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), this.DN);
    this.deb.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.deb.frustumCulled = false; this.deb.castShadow = false;
    this.deb.setColorAt(0, new THREE.Color()); scene.add(this.deb);
    this.debs = []; for (let i = 0; i < this.DN; i++) this.debs.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0.1 });
    this.di = 0;
    this.words = []; this.wordTex = {};
    this._q = new THREE.Quaternion(); this._m = new THREE.Matrix4(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }
  emit(tex, pos, o = {}) {
    for (let k = 0; k < (o.n || 1); k++) {
      const p = this.parts[this.pi = (this.pi + 1) % this.parts.length];
      const m = p.s.material;
      m.map = TEX[tex]; m.color.set(o.color || 0xffffff); m.opacity = 1; m.rotation = rnd(0, 6.28); m.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending; m.needsUpdate = true;
      p.s.position.copy(pos);
      if (o.spread) p.s.position.add(new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).multiplyScalar(o.spread));
      const sp = o.speed ?? 2;
      p.v.set(rnd(-1, 1) * sp, rnd(o.up0 ?? 0.2, 1) * sp * (o.upMul ?? 1), rnd(-1, 1) * sp);
      if (o.vel) p.v.add(o.vel);
      p.life = p.max = (o.life || 0.8) * rnd(0.75, 1.2);
      p.g = o.g ?? 0; p.size = (o.size || 0.6) * rnd(0.75, 1.25); p.grow = o.grow ?? 0.5; p.spin = rnd(-4, 4) * (o.spinMul ?? 1); p.drag = o.drag ?? 0;
      p.s.scale.setScalar(p.size); p.s.visible = true;
    }
  }
  debris(pos, colors, o = {}) {
    const n = o.n || 10;
    for (let k = 0; k < n; k++) {
      const d = this.debs[this.di = (this.di + 1) % this.DN];
      d.life = rnd(0.9, 1.6); d.p.copy(pos).add(new THREE.Vector3(rnd(-0.3, 0.3), rnd(0, 0.6), rnd(-0.3, 0.3)));
      const sp = o.speed ?? 6;
      d.v.set(rnd(-1, 1) * sp, rnd(0.5, 1.3) * sp, rnd(-1, 0.3) * sp); if (o.vel) d.v.add(o.vel);
      d.r.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); d.w.set(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12));
      d.s = (o.size || 0.14) * rnd(0.6, 1.4);
      this.deb.setColorAt(this.di, this._c.set(colors[k % colors.length]));
    }
    this.deb.instanceColor.needsUpdate = true;
  }
  // big comic sound word ("ドカーン!") that pops out of a hit, facing the camera
  word(text, pos, o = {}) {
    const now = performance.now();
    if (!o.force && now - (this.lastWord || 0) < 140) return;
    this.lastWord = now;
    let t = this.wordTex[text + (o.color || '')];
    if (!t) {
      t = this.wordTex[text + (o.color || '')] = canvasTex(512, 256, (g, w, h) => {
        g.font = '900 150px "Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineJoin = 'round'; g.lineWidth = 34; g.strokeStyle = '#2a0f00'; g.strokeText(text, w / 2, h / 2, w * 0.94);
        g.lineWidth = 16; g.strokeStyle = '#fff'; g.strokeText(text, w / 2, h / 2, w * 0.94);
        g.fillStyle = o.color || '#ff3d2e'; g.fillText(text, w / 2, h / 2, w * 0.94);
      });
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
    s.renderOrder = 10; s.position.copy(pos); this.scene.add(s);
    this.words.push({ s, t: 0, size: o.size || 2.2, vel: o.vel ? o.vel.clone() : new THREE.Vector3(0, 2, 0), rot: rnd(-0.35, 0.35) });
    s.material.rotation = this.words[this.words.length - 1].rot;
    while (this.words.length > 8) { const w = this.words.shift(); this.scene.remove(w.s); w.s.material.dispose(); }
  }
  update(dt, camZ = 1e9) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0 || p.s.position.z > camZ - 1.5) { p.life = 0; p.s.visible = false; continue; }
      p.v.y += p.g * dt; if (p.drag) p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.s.position.addScaledVector(p.v, dt);
      p.size *= 1 + p.grow * dt; p.s.scale.setScalar(p.size);
      p.s.material.rotation += p.spin * dt;
      p.s.material.opacity = Math.min(1, (p.life / p.max) * 2.2);
    }
    let any = false;
    for (let i = 0; i < this.DN; i++) {
      const d = this.debs[i];
      if (d.life <= 0) { this._m.makeScale(0, 0, 0); this.deb.setMatrixAt(i, this._m); continue; }
      any = true;
      d.life -= dt; d.v.y -= 22 * dt; d.p.addScaledVector(d.v, dt);
      if (d.p.z > camZ - 2.5) d.life = 0;
      if (d.p.y < d.s / 2) { d.p.y = d.s / 2; d.v.y *= -0.35; d.v.x *= 0.7; d.v.z *= 0.7; d.w.multiplyScalar(0.7); }
      d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
      const sc = d.s * Math.min(1, d.life * 3);
      this._q.setFromEuler(d.r); this._s.set(sc, sc, sc);
      this._m.compose(d.p, this._q, this._s); this.deb.setMatrixAt(i, this._m);
    }
    this.deb.instanceMatrix.needsUpdate = true; this.deb.visible = any;
    for (let i = this.words.length - 1; i >= 0; i--) {
      const w = this.words[i]; w.t += dt;
      const k = w.t < 0.12 ? w.t / 0.12 : 1;
      const sc = w.size * (k < 1 ? 0.3 + 1.0 * k : 1 + Math.max(0, 0.15 - (w.t - 0.12)) );
      w.s.scale.set(sc, sc * 0.5, 1);
      w.s.position.addScaledVector(w.vel, dt); w.vel.multiplyScalar(1 - 2 * dt);
      w.s.material.opacity = w.t > 0.6 ? Math.max(0, 1 - (w.t - 0.6) / 0.3) : 1;
      if (w.t > 0.9) { this.scene.remove(w.s); w.s.material.dispose(); this.words.splice(i, 1); }
    }
  }
  clear() {
    for (const p of this.parts) { p.life = 0; p.s.visible = false; }
    for (const d of this.debs) d.life = 0;
    for (const w of this.words) { this.scene.remove(w.s); w.s.material.dispose(); }
    this.words = [];
  }
}

// 2D speed lines over the 3D view
export class SpeedLines {
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); }
  resize(w, h) { this.c.width = Math.floor(w); this.c.height = Math.floor(h); }
  draw(it, color) {
    const { c, g } = this, W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    if (it <= 0.02) return;
    const cx = W / 2, cy = H * 0.4, R = Math.hypot(W, H) * 0.55;
    g.strokeStyle = color;
    const n = Math.floor(36 * Math.min(it, 1.6));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r0 = R * rnd(0.5, 0.85), r1 = r0 + R * rnd(0.15, 0.45);
      g.lineWidth = rnd(1, 4);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    }
  }
}
