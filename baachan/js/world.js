// The endless shopping street: road, pavements, instanced shops/houses and street furniture, sky and light.
import * as THREE from 'three';
import { A, BUILDINGS, TownBatch } from './assets.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const ROAD_HALF = 4.3;
const FRONT = 7.6; // building fronts (|x|)

export class World {
  constructor(scene, renderer) {
    this.scene = scene;
    // sky, fog, light
    const top = new THREE.Color(0x3d9cff), hor = new THREE.Color(0xffe2b8);
    scene.fog = new THREE.Fog(hor, 40, 125);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: top }, hor: { value: hor } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(hor, top, smoothstep(-0.02, 0.5, h)), 1.0); }',
    }));
    scene.add(this.sky);
    this.clouds = [];
    const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(rnd(4, 8), 12, 8), cm); s.position.set(k * 6 - 12, rnd(-1, 2), rnd(-2, 2)); s.scale.y = 0.55; c.add(s); }
      c.userData.off = new THREE.Vector3(rnd(-160, 160), rnd(50, 90), rnd(-300, -170));
      scene.add(c); this.clouds.push(c);
    }
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x9a8470, 1.4));
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.castShadow = true; sun.shadow.mapSize.set(512, 512);
    const sc = sun.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);

    // ground strips that follow the runner (snapped to the texture period so nothing swims)
    this.ground = new THREE.Group(); scene.add(this.ground);
    const GL = this.GL = 400;
    const asphalt = A.tex.asphalt ? A.tex.asphalt.clone() : null;
    if (asphalt) { asphalt.needsUpdate = true; asphalt.repeat.set(ROAD_HALF * 2 / 4, GL / 4); }
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, GL), new THREE.MeshStandardMaterial({ map: asphalt, color: 0x9a9a9e, roughness: 0.92 }));
    road.rotation.x = -Math.PI / 2; road.receiveShadow = true; this.ground.add(road);
    const lines = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, GL), new THREE.MeshStandardMaterial({ map: this.lineTex(GL), transparent: true, roughness: 0.7, depthWrite: false }));
    lines.rotation.x = -Math.PI / 2; lines.position.y = 0.01; lines.receiveShadow = true; this.ground.add(lines);
    const pav = A.tex.paving ? A.tex.paving.clone() : null;
    if (pav) { pav.needsUpdate = true; pav.repeat.set(3.6 / 3, GL / 3); }
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(3.6, GL), new THREE.MeshStandardMaterial({ map: pav, color: 0xe8e2d8, roughness: 0.9 }));
      w.rotation.x = -Math.PI / 2; w.position.set(s * (ROAD_HALF + 1.8), 0.15, 0); w.receiveShadow = true; this.ground.add(w);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, GL), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.85 }));
      curb.position.set(s * ROAD_HALF, 0.09, 0); curb.receiveShadow = true; this.ground.add(curb);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(30, GL), new THREE.MeshStandardMaterial({ color: 0xb8ad9e, roughness: 1 }));
      back.rotation.x = -Math.PI / 2; back.position.set(s * (FRONT + 15), 0.14, 0); this.ground.add(back);
    }

    // instanced town
    const caps = {};
    for (const n of BUILDINGS) caps[n] = 10;
    for (const n of ['utility_pole', 'street_light', 'nobori', 'chochin_hanging', 'curve_mirror', 'bus_stop']) caps[n] = 16;
    this.town = new TownBatch(scene, caps);
    this.place = []; this.cursor = { '-1': -20, '1': -20 }; this.propCursor = -20;
    this.dirty = true; this.lastRebuild = -999;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }
  lineTex(GL) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(245,245,245,.92)';
    const lane = (x) => g.fillRect(x - 3, 0, 6, 128);
    lane(256 * (ROAD_HALF - 1.2) / (ROAD_HALF * 2)); lane(256 * (ROAD_HALF + 1.2) / (ROAD_HALF * 2));
    g.fillStyle = 'rgba(255,205,40,.95)'; g.fillRect(10, 0, 5, 256); g.fillRect(241, 0, 5, 256);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    t.repeat.set(1, GL / 8);
    return t;
  }
  reset() { this.place = []; this.cursor = { '-1': -20, '1': -20 }; this.propCursor = -20; this.dirty = true; }
  extend(dist) {
    const horizon = dist + 130;
    for (const s of [-1, 1]) {
      while (this.cursor[s] < horizon) {
        const n = pick(BUILDINGS), sz = A.size[n] || [8, 8, 9];
        const w = sz[0], dep = sz[2];
        const d = this.cursor[s] + w / 2;
        this.place.push({ n, d, x: s * (FRONT + dep / 2), ry: s < 0 ? Math.PI / 2 : -Math.PI / 2, big: true });
        this.cursor[s] += w + rnd(0.2, 1.6);
        this.dirty = true;
      }
    }
    while (this.propCursor < horizon) {
      const d = this.propCursor;
      const s = Math.floor(d / 20) % 2 ? 1 : -1;
      this.place.push({ n: 'street_light', d, x: s * (ROAD_HALF + 0.5), ry: s < 0 ? Math.PI / 2 : -Math.PI / 2 });
      if (Math.floor(d / 20) % 3 === 0) this.place.push({ n: 'utility_pole', d: d + 10, x: -s * (ROAD_HALF + 0.6), ry: 0 });
      const r = Math.random(), x = (Math.random() < 0.5 ? -1 : 1);
      if (r < 0.35) this.place.push({ n: 'nobori', d: d + rnd(3, 8), x: x * (FRONT - 0.7), ry: x < 0 ? Math.PI / 2 : -Math.PI / 2 });
      else if (r < 0.5) this.place.push({ n: 'chochin_hanging', d: d + rnd(3, 8), x: x * (FRONT - 0.4), ry: x < 0 ? Math.PI / 2 : -Math.PI / 2, y: 2.4 });
      else if (r < 0.58) this.place.push({ n: 'curve_mirror', d: d + rnd(3, 8), x: x * (ROAD_HALF + 0.5), ry: x < 0 ? Math.PI / 2 : -Math.PI / 2 });
      else if (r < 0.64) this.place.push({ n: 'bus_stop', d: d + rnd(3, 8), x: x * (ROAD_HALF + 1.4), ry: x < 0 ? Math.PI / 2 : -Math.PI / 2 });
      this.propCursor += 20; this.dirty = true;
    }
  }
  update(dist, camPos, dt) {
    this.extend(dist);
    // drop what is behind
    if (this.place.length && this.place[0].d < dist - 30) { this.place = this.place.filter((p) => p.d > dist - 30); this.dirty = true; }
    if (this.dirty || Math.abs(dist - this.lastRebuild) > 8) this.rebuild(dist);
    this.ground.position.z = -Math.floor(dist / 24) * 24 - this.GL / 2 + 60;
    // sun shadow follows the runner
    this.sun.position.set(camPos.x - 8, 22, -dist + 6); this.sun.target.position.set(camPos.x, 0, -dist - 6);
    this.sky.position.copy(camPos);
    for (const c of this.clouds) { c.userData.off.x += dt * 1.5; if (c.userData.off.x > 170) c.userData.off.x = -170; c.position.set(camPos.x + c.userData.off.x, c.userData.off.y, camPos.z + c.userData.off.z); }
  }
  rebuild(dist) {
    this.dirty = false; this.lastRebuild = dist;
    this.town.begin();
    for (const p of this.place) {
      this._p.set(p.x, p.y || (p.big ? 0.14 : 0.15), -p.d);
      this._q.setFromAxisAngle(_Y, p.ry);
      this._m.compose(this._p, this._q, this._s);
      this.town.add(p.n, this._m, p.d - dist > 22);
    }
    this.town.end();
  }
}
const _Y = new THREE.Vector3(0, 1, 0);
