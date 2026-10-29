// Weather and the calendar: a seeded weather per day (clear / cloudy / rain, snow in winter), rain and snow falling
// around the camera with a greyer sky and dimmer sun, seasonal colours (autumn leaves, cherry blossom only in
// spring, a white winter), seasonal events (Halloween pumpkins, August fireworks) and shooting stars on clear
// nights: wish on one and star fragments wash up on the beach the next morning.
import * as THREE from 'three';
import { dayKey, seeded } from './state.js';
import { EVENTS, WISH, STAR_FRAG } from './data2.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const md = (d = new Date()) => (d.getMonth() + 1) * 100 + d.getDate();

export class Season {
  constructor(life) {
    this.life = life; this.world = life.world; this.scene = life.scene;
    this.group = new THREE.Group(); this.group.name = 'season'; this.scene.add(this.group);
    this.pumpkins = []; this.stars = []; this.fw = []; this.fwT = 0; this.starT = 5;
    this.buildPrecip();
    // overcast: a grey dome just inside the sky sphere (the sky itself is computed from the sun, not from colours)
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), new THREE.MeshBasicMaterial({ color: 0x8a939c, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.dome.renderOrder = -9; this.dome.frustumCulled = false; this.scene.add(this.dome);
    this.newDay();
  }
  // ---------------------------------------------------------------- calendar
  weather(key = dayKey()) {
    const r = seeded('weather' + key), m = new Date().getMonth() + 1, u = r();
    const winter = m === 12 || m <= 2, wet = m === 6 ? 0.45 : m === 9 ? 0.3 : 0.18;
    const w = u < wet ? (winter ? 'snow' : 'rain') : u < wet + 0.2 ? 'cloudy' : 'clear';
    return { w, stars: w === 'clear' && r() < 0.35 };
  }
  raining() { return this.today.w === 'rain'; }
  event(d = new Date()) {
    const k = md(d), h = d.getHours(), m = d.getMonth() + 1;
    if (k <= 103) return 'newyear';
    if (k === 203) return 'setsubun';
    if (k === 303) return 'hinamatsuri';
    if (k >= 401 && k <= 415) return 'hanami';
    if (k === 707) return 'tanabata';
    if (m === 8 && d.getDay() === 0 && h >= 19) return 'fireworks';
    if (k >= 915 && k <= 930) return 'tsukimi';
    if (k >= 1020 && k <= 1031) return 'halloween';
    if (k === 1224 || k === 1225) return 'xmas';
    if (k === 1231) return 'omisoka';
    if (this.today.w === 'snow') return 'snow';
    return null;
  }
  eventLine(phrase) { const e = this.event(); return e && EVENTS[e] ? EVENTS[e].map((l) => l.replace(/\{phrase\}/g, phrase)) : null; }
  newDay() {
    this.today = this.weather();
    const q = new URLSearchParams(location.search).get('weather'); if (q) this.today = { w: q, stars: q === 'clear' };
    this.applySeason();
    this.placeEventProps();
    // star fragments from last night's wish
    const st = this.life.st, wish = st.ext.wish;
    if (wish && wish !== dayKey()) {
      st.ext.wish = null; st.save();
      for (let i = 0; i < 4; i++) this.life.beachPickup('star_frag');
      this.life.news.push('__stars');
    }
  }
  // ---------------------------------------------------------------- seasonal colours
  applySeason() {
    const m = new Date().getMonth() + 1, M = this.life.app.mats, k = md();
    const leaves = ['leaf_card', 'leaf_card_dark', 'leaf', 'leaf_dark', 'leaf_light', 'shrub_card'];
    const autumn = m === 10 ? 0.55 : m === 11 ? 1 : m === 12 ? 0.6 : 0, winter = m === 12 || m <= 2;
    for (const n of leaves) {
      const mat = M.mats[n]; if (!mat) continue;
      mat.userData.base ||= mat.color.clone();
      mat.color.copy(mat.userData.base).lerp(new THREE.Color(1.6, 0.62, 0.22), autumn * 0.65);
      if (winter) mat.color.lerp(new THREE.Color(0.78, 0.8, 0.72), 0.35);
    }
    const sak = M.mats.sakura_card || M.mats.sakura;   // blossom from late March to mid April, green leaves otherwise
    if (sak) { sak.userData.base ||= sak.color.clone(); const bloom = k >= 325 && k <= 418; sak.color.copy(sak.userData.base); if (!bloom) sak.color.multiply(new THREE.Color(0.42, 0.8, 0.38)); }
    const grass = [M.mats.terrain, M.mats.grass, M.mats.grass_blade, M.mats.rk_grass].filter(Boolean);
    for (const g of grass) {
      g.userData.base ||= g.color.clone(); g.color.copy(g.userData.base);
      if (autumn) g.color.multiply(new THREE.Color(1.06, 0.97, 0.82));
      if (winter) g.color.lerp(new THREE.Color(1.15, 1.17, 1.22), this.today.w === 'snow' ? 0.75 : 0.25);
    }
  }
  placeEventProps() {
    for (const o of this.pumpkins) this.group.remove(o); this.pumpkins = [];
    if (this.event() !== 'halloween' || !this.life.town.protos.furn_pumpkin) return;
    const spots = [[2, 16], [6, 16], [-4, 14], [10, 12], [-14, 15], [36, -30], [44, -60], [-8, -108], [-10, -108]];
    for (const [x0, z0] of spots) {
      const p = this.life.near(x0, z0, (x, z) => this.life.walkable(x, z), 3); if (!p) continue;
      const o = this.life.town.clone('furn_pumpkin', p[0], this.life.ground.height(p[0], p[1]), p[1], Math.random() * 6.28, true);
      this.group.attach(o); o.scale.setScalar(1.2); this.pumpkins.push(o);
    }
  }
  // ---------------------------------------------------------------- rain and snow
  buildPrecip() {
    const N = 2600, pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; pos.set([x, y, z, x, y - 0.5, z], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d4e2, transparent: true, opacity: 0.38, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false; this.group.add(this.rain);
    const sp = new Float32Array(N * 3); for (let i = 0; i < N; i++) sp.set([(Math.random() - 0.5) * 60, Math.random() * 30, (Math.random() - 0.5) * 60], i * 3);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false }));
    this.snow.frustumCulled = false; this.snow.visible = false; this.group.add(this.snow);
  }
  // particles live in world space in a 60 m column around the camera and wrap when they leave it
  updatePrecip(dt, cam) {
    const w = this.today.w, inside = this.life.home?.inside;
    for (const [o, on, fall, drift, step] of [[this.rain, w === 'rain', 22, 0, 6], [this.snow, w === 'snow', 1.4, 0.6, 3]]) {
      o.visible = on && !inside; if (!o.visible) { o.userData.init = false; continue; }
      const a = o.geometry.attributes.position.array, t = this.life.t;
      for (let i = 0; i < a.length; i += step) {
        if (!o.userData.init) { a[i] = cam.x + (Math.random() - 0.5) * 60; a[i + 2] = cam.z + (Math.random() - 0.5) * 60; a[i + 1] = cam.y - 8 + Math.random() * 30; }
        a[i + 1] -= fall * dt; if (drift) a[i] += Math.sin(t * 0.7 + i) * drift * dt;
        if (a[i + 1] < cam.y - 8) a[i + 1] += 30; else if (a[i + 1] > cam.y + 22) a[i + 1] -= 30;
        if (a[i] < cam.x - 30) a[i] += 60; else if (a[i] > cam.x + 30) a[i] -= 60;
        if (a[i + 2] < cam.z - 30) a[i + 2] += 60; else if (a[i + 2] > cam.z + 30) a[i + 2] -= 60;
        if (step === 6) { a[i + 3] = a[i]; a[i + 4] = a[i + 1] - 0.5; a[i + 5] = a[i + 2]; }
      }
      o.userData.init = true; o.geometry.attributes.position.needsUpdate = true;
    }
  }
  // overcast: after the world has set the sky and lights for the time of day, grey them out
  overcast() {
    const w = this.today.w, k = w === 'rain' ? 1 : w === 'snow' ? 0.75 : w === 'cloudy' ? 0.45 : 0;
    const W0 = this.world, day = Math.min(1, W0.cur.sunI / 3);
    this.dome.visible = k > 0 && !this.life.home?.inside; this.dome.position.copy(this.life.app.camera.position);
    this.dome.material.opacity = k * (w === 'cloudy' ? 0.55 : 0.82);
    this.dome.material.color.setRGB(0.55, 0.59, 0.64).multiplyScalar(0.25 + 0.75 * day);
    if (!k) return;
    const W = this.world, L = this.last;
    // only once per refresh of the world's lighting (it does not reset these every frame)
    if (L && W.sun.intensity === L.sunI && W.skyU.uTop.value.equals(L.top) && this.scene.fog.color.equals(L.fog)) return;
    const grey = new THREE.Color(0.62, 0.66, 0.7).multiplyScalar(0.35 + 0.65 * Math.min(1, W.cur.sunI / 3));
    W.skyU.uTop.value.lerp(grey, 0.75 * k); W.skyU.uHor.value.lerp(grey.clone().multiplyScalar(1.15), 0.7 * k);
    W.skyU.uSunDisk && (W.skyU.uSunDisk.value *= 1 - k);
    W.sun.intensity *= 1 - 0.7 * k; W.hemi.intensity *= 1 - 0.15 * k;
    this.scene.fog.color.lerp(grey, 0.6 * k); this.scene.fog.far = Math.min(this.scene.fog.far, w === 'rain' ? 380 : 700);
    this.last = { sunI: W.sun.intensity, top: W.skyU.uTop.value.clone(), fog: this.scene.fog.color.clone() };
  }
  // ---------------------------------------------------------------- fireworks and shooting stars
  fireworks(dt) {
    const on = this.event() === 'fireworks' || this.forceFw;
    this.fwT -= dt;
    if (on && this.fwT <= 0) {
      this.fwT = 0.9 + Math.random() * 2.2;
      const N = 220, pos = new Float32Array(N * 3), vel = [], col = new THREE.Color().setHSL(Math.random(), 1, 0.55).multiplyScalar(2.2);
      const c = new THREE.Vector3(-30 + Math.random() * 60, 38 + Math.random() * 18, 85 + Math.random() * 40);
      for (let i = 0; i < N; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(9 + Math.random() * 3); vel.push(v); pos.set([c.x, c.y, c.z], i * 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const o = new THREE.Points(g, new THREE.PointsMaterial({ color: col, size: 2.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
      o.frustumCulled = false; this.group.add(o); this.fw.push({ o, vel, t: 0 });
      const s = this.life.app.sound; if (s.ctx && s.on) setTimeout(() => this.life.splash(0.5, 120), 600);
    }
    for (let i = this.fw.length - 1; i >= 0; i--) {
      const f = this.fw[i]; f.t += dt;
      const a = f.o.geometry.attributes.position.array;
      for (let k = 0; k < f.vel.length; k++) { const v = f.vel[k]; v.multiplyScalar(1 - dt * 1.4); v.y -= 4 * dt; a[k * 3] += v.x * dt; a[k * 3 + 1] += v.y * dt; a[k * 3 + 2] += v.z * dt; }
      f.o.geometry.attributes.position.needsUpdate = true; f.o.material.opacity = Math.max(0, 1 - f.t / 2.4);
      if (f.t > 2.4) { this.group.remove(f.o); f.o.geometry.dispose(); f.o.material.dispose(); this.fw.splice(i, 1); }
    }
  }
  starNight() { const h = new Date().getHours(); return this.today.stars && (h >= 19 || h < 4) && !this.life.home?.inside; }
  shootingStars(dt, cam) {
    this.starT -= dt;
    if (this.starNight() && this.starT <= 0) {
      this.starT = 8 + Math.random() * 22;
      const a = Math.random() * 6.28, d = 380, p0 = new THREE.Vector3(cam.x + Math.cos(a) * d, 160 + Math.random() * 60, cam.z + Math.sin(a) * d);
      const dir = new THREE.Vector3(Math.cos(a + 1.9), -0.35, Math.sin(a + 1.9)).normalize();
      const g = new THREE.BufferGeometry().setFromPoints([p0, p0.clone().addScaledVector(dir, -28)]);
      const o = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff6d0, transparent: true, fog: false })); o.frustumCulled = false;
      this.group.add(o); this.stars.push({ o, dir, t: 0 });
    }
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i]; s.t += dt; s.o.position.addScaledVector(s.dir, 160 * dt); s.o.material.opacity = Math.sin(Math.min(1, s.t / 1.1) * Math.PI);
      if (s.t > 1.1) { this.group.remove(s.o); s.o.geometry.dispose(); this.stars.splice(i, 1); }
    }
  }
  // A while a star is crossing the sky: make a wish
  target() {
    if (!this.stars.length || !this.starNight()) return null;
    return { label: 'ねがう', run: () => this.wish() };
  }
  async wish() {
    const st = this.life.st; this.life.ui.jingle([988, 1319, 1568]);
    if (!st.ext.wish) { st.ext.wish = dayKey(); st.save(); }
    await this.life.ui.say(null, [pick(WISH)]);
  }
  starNews() { return [pick(STAR_FRAG)]; }
  update(dt, cam) {
    this.updatePrecip(dt, cam);
    this.fireworks(dt);
    this.shootingStars(dt, cam);
    const s = this.life.app.sound;   // rain on the roofs: lift the wave noise a little
    if (s.waveG && this.today.w === 'rain') s.waveG.gain.value = Math.max(s.waveG.gain.value, 0.22);
  }
}
