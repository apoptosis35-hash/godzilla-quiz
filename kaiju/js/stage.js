// Battle stages: procedural cities/ports/volcano with destructible buildings, props and weather.
import * as THREE from 'three';
import { facadeTextures, groundTextures, skyTexture, scaleMaps, panelMaps } from './textures.js';

export const STAGES = [
  {
    id: 'tokyo', name: '夜の首都 超高層ビル街', en: 'NIGHT METROPOLIS', bgm: 0,
    sky: ['#02040c', '#0b1430', '#2a2448'], fog: [0x141a33, 0.0065], ground: 'city',
    hemi: [0x7080c0, 0x202028, 0.7], sun: [0xa8b8ff, 2.4, [-40, 60, 30]], rim: [0xff60c0, 1.6], exposure: 1.05,
    buildings: { minH: 18, maxH: 46, lit: 0.5, styles: [0, 2, 3], neon: true }, far: { minH: 20, maxH: 90 }, cars: 34, lamps: true,
    env: ['#0b1430', '#ff60c0', '#60c0ff'],
  },
  {
    id: 'harbor', name: '夕暮れの港湾地区', en: 'SUNSET HARBOR', bgm: 1,
    sky: ['#2a2350', '#d0603a', '#ffc070'], fog: [0xd08860, 0.0055], ground: 'harbor',
    hemi: [0xffc8a0, 0x403040, 0.9], sun: [0xffa060, 3.2, [80, 25, -20]], rim: [0xffd0a0, 1.2], exposure: 1.0,
    buildings: { minH: 8, maxH: 22, lit: 0.15, styles: [1, 3], containers: true }, far: { minH: 10, maxH: 40 }, cars: 18, lamps: true, water: true, cranes: true,
    env: ['#d0603a', '#ffc070', '#2a2350'],
  },
  {
    id: 'industrial', name: '雨の工業地帯', en: 'RAINY INDUSTRIAL ZONE', bgm: 2,
    sky: ['#05070a', '#1a2026', '#2d343a'], fog: [0x252c32, 0.011], ground: 'industrial',
    hemi: [0x8090a0, 0x15181a, 0.6], sun: [0xc8d8ff, 1.6, [-30, 70, -40]], rim: [0x80ffd0, 1.2], exposure: 1.1,
    buildings: { minH: 9, maxH: 24, lit: 0.3, styles: [1, 2], tanks: true }, far: { minH: 12, maxH: 45 }, cars: 14, lamps: true, rain: true, stacks: true,
    env: ['#1a2026', '#80ffd0', '#ffa040'],
  },
  {
    id: 'volcano', name: '灼熱の火山地帯', en: 'VOLCANIC FIELD', bgm: 3,
    sky: ['#120404', '#4a1208', '#a03010'], fog: [0x3a1008, 0.008], ground: 'volcano',
    hemi: [0xff8050, 0x401008, 0.8], sun: [0xff9060, 2.4, [30, 50, 50]], rim: [0xffa040, 2.0], exposure: 1.0,
    buildings: { rock: true, minH: 8, maxH: 20 }, far: null, cars: 0, lamps: false, embers: true, volcano: true,
    env: ['#4a1208', '#ff6020', '#a03010'],
  },
  {
    id: 'ruins', name: '崩壊した廃墟都市', en: 'RUINED CITY', bgm: 4,
    sky: ['#3a3a40', '#6a6460', '#a09080'], fog: [0x7a7068, 0.009], ground: 'city',
    hemi: [0xc0b8b0, 0x40383a, 1.0], sun: [0xfff0d8, 2.0, [50, 70, 20]], rim: [0xffe0c0, 0.8], exposure: 1.0,
    buildings: { minH: 10, maxH: 34, lit: 0.0, styles: [1, 3], ruined: true }, far: { minH: 10, maxH: 50, ruined: true }, cars: 20, lamps: false, fires: true,
    env: ['#6a6460', '#ffc080', '#3a3a40'],
  },
];

const ARENA_R = 31;

function boxGeo(w, h, d, su, sv, uOff, vOff) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = dims[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(i, uv.getX(i) * 0.02, uv.getY(i) * 0.02); continue; }
      uv.setXY(i, uv.getX(i) * fw / su + uOff, uv.getY(i) * fh / sv + vOff);
    }
  }
  return g;
}

export class Stage {
  constructor(scene, cfg, q, fx, audio, renderer) {
    this.scene = scene; this.cfg = cfg; this.q = q; this.fx = fx; this.audio = audio; this.renderer = renderer;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.radius = ARENA_R;
    this.buildings = [];
    this.cars = [];
    this.lamps = [];
    this.time = 0;
    this.lightningT = 5;
    this.build();
  }

  build() {
    const c = this.cfg, q = this.q, root = this.root;
    // sky dome
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture(...c.sky), side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 16), skyMat);
    sky.renderOrder = -10;
    root.add(sky);
    this.scene.fog = new THREE.FogExp2(c.fog[0], c.fog[1]);
    this.scene.background = new THREE.Color(c.fog[0]);
    if (c.id === 'tokyo') { // moon
      const moon = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: false }));
      moon.position.set(-160, 190, -330); moon.lookAt(0, 0, 0); root.add(moon);
    }
    if (c.id === 'harbor') {
      const sun = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshBasicMaterial({ color: 0xffe0a0, fog: false }));
      sun.position.set(380, 60, -150); sun.lookAt(0, 0, 0); root.add(sun);
    }
    // lights
    const hemi = new THREE.HemisphereLight(c.hemi[0], c.hemi[1], c.hemi[2]);
    root.add(hemi); this.hemi = hemi; this.hemiBase = c.hemi[2];
    const sun = new THREE.DirectionalLight(c.sun[0], c.sun[1]);
    sun.position.set(...c.sun[2]);
    this.sun = sun; this.sunOffset = new THREE.Vector3(...c.sun[2]);
    if (q.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      const s = sun.shadow.camera; s.left = -36; s.right = 36; s.top = 36; s.bottom = -36; s.near = 1; s.far = 220;
      sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.6;
    }
    root.add(sun); root.add(sun.target);
    const rim = new THREE.DirectionalLight(c.rim[0], c.rim[1]);
    rim.position.set(-c.sun[2][0], 30, -c.sun[2][2]);
    root.add(rim);
    // environment map for metals
    this.makeEnv();
    // ground
    const gt = groundTextures(c.ground);
    const tile = 128;
    gt.map.repeat.set(600 / tile, 600 / tile); gt.normal.repeat.set(600 / tile * 4, 600 / tile * 4);
    const gmat = new THREE.MeshStandardMaterial({ map: gt.map, normalMap: gt.normal, roughness: c.rain ? 0.35 : 0.92, metalness: c.rain ? 0.3 : 0 });
    if (c.ground === 'volcano') { gmat.emissiveMap = gt.map; gmat.emissive = new THREE.Color(0xff4010); gmat.emissiveIntensity = 0.0; this.lavaGround = gmat; }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), gmat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(12, 0, -12); // align road grid (roads at 16+32k) so the arena centre is a plaza
    ground.receiveShadow = q.shadows;
    root.add(ground);
    if (c.water) this.makeWater();
    this.makeBuildings();
    if (c.far) this.makeFar();
    if (c.cars) this.makeCars(c.cars);
    if (c.lamps) this.makeLamps();
    if (c.cranes) this.makeCranes();
    if (c.volcano) this.makeVolcano();
    if (c.rain) this.makeRain();
    // ring boundary markers (subtle) - debris rings
    this.fires = [];
    if (c.fires) for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 40;
      this.fires.push(new THREE.Vector3(Math.cos(a) * r, 0.5, Math.sin(a) * r));
    }
    this.stacks = [];
    if (c.stacks) for (let i = 0; i < 5; i++) {
      const a = -1.5 + i * 0.5, r = 95 + i * 9;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 50 + i * 6;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, h, 12), new THREE.MeshStandardMaterial({ color: 0x5a5550, roughness: 0.8 }));
      m.position.set(x, h / 2, z); root.add(m);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.35, 3, 12), new THREE.MeshStandardMaterial({ color: 0xc03020, emissive: 0x401000 }));
      band.position.set(x, h - 4, z); root.add(band);
      this.stacks.push(new THREE.Vector3(x, h + 1, z));
    }
  }

  makeEnv() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const es = new THREE.Scene();
    const c = this.cfg.env;
    const tex = skyTexture(c[0], c[0], '#050505');
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })));
    for (let i = 0; i < 10; i++) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(6 + Math.random() * 10, 3 + Math.random() * 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? c[1] : c[2]).multiplyScalar(2.5), side: THREE.DoubleSide }));
      const a = (i / 10) * Math.PI * 2;
      b.position.set(Math.cos(a) * 40, 6 + Math.random() * 25, Math.sin(a) * 40);
      b.lookAt(0, 10, 0);
      es.add(b);
    }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0]).multiplyScalar(1.5), side: THREE.DoubleSide }));
    top.position.y = 45; top.rotation.x = Math.PI / 2; es.add(top);
    this.envMap = pm.fromScene(es, 0.04).texture;
    this.scene.environment = this.envMap;
    pm.dispose();
  }

  makeWater() {
    const n = scaleMaps('fine', 31).normal.clone();
    n.repeat.set(30, 30); n.needsUpdate = true;
    this.waterNormal = n;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a2a38, roughness: 0.12, metalness: 0.75, normalMap: n, normalScale: new THREE.Vector2(0.6, 0.6) });
    const w = new THREE.Mesh(new THREE.PlaneGeometry(500, 600), mat);
    w.rotation.x = -Math.PI / 2;
    w.position.set(56 + 250, 0.3, 0);
    this.root.add(w);
    // quay edge
    const quay = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 600), new THREE.MeshStandardMaterial({ color: 0x6a6660, roughness: 0.9 }));
    quay.position.set(56, 0, 0); this.root.add(quay);
  }

  makeBuildings() {
    const c = this.cfg.buildings, q = this.q;
    const blocks = [];
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      const x = i * 32, z = j * 32;
      const d = Math.hypot(x, z);
      if (d < 40 || d > 98) continue;
      if (this.cfg.water && x > 40) continue;
      blocks.push([x, z, d]);
    }
    const maxB = q.level >= 2 ? 99 : q.level === 1 ? 6 : 0;
    blocks.sort((a, b) => a[2] - b[2]);
    let count = 0;
    // inner ring: buildings right at the arena edge, so slamming an opponent into the wall wrecks them
    const ringN = q.level >= 1 ? 16 : 12;
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2 + 0.1;
      const r = 44 + Math.random() * 3;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.cfg.water && x > 40) continue;
      const w = 9 + Math.random() * 3, d = 9 + Math.random() * 3;
      const h = (c.minH + Math.random() * (c.maxH - c.minH)) * 0.8;
      if (c.containers && i % 2) this.addBuilding(x, z, w, d, Math.min(h, 10), 'container');
      else if (c.tanks && i % 3 === 0) this.addBuilding(x, z, Math.min(w, d), Math.min(w, d), 9 + Math.random() * 5, 'tank');
      else this.addBuilding(x, z, w, d, h, c.rock ? 'rock' : 'office');
    }
    for (const [bx, bz, bd] of blocks) {
      if (bd < 62) continue;
      if (count >= maxB) break;
      const subs = Math.random() < 0.45 ? 2 : 1;
      for (let s = 0; s < subs; s++) {
        let w, d, x, z;
        if (subs === 1) { w = 11 + Math.random() * 6; d = 11 + Math.random() * 6; x = bx; z = bz; }
        else { w = 7 + Math.random() * 2.5; d = 14 + Math.random() * 2; x = bx + (s ? 4.6 : -4.6); z = bz; }
        let h = c.minH + Math.random() * (c.maxH - c.minH);
        if (Math.hypot(x, z) < 50) h *= 0.75;
        if (c.containers && Math.random() < 0.5) this.addBuilding(x, z, w, d, Math.min(h, 10), 'container');
        else if (c.tanks && Math.random() < 0.4) this.addBuilding(x, z, Math.min(w, d), Math.min(w, d), 9 + Math.random() * 5, 'tank');
        else this.addBuilding(x, z, w, d, h, c.rock ? 'rock' : 'office');
        count++;
      }
    }
  }

  addBuilding(x, z, w, d, h, kind) {
    const c = this.cfg.buildings;
    const b = { x, z, w, d, h, kind, chunks: [], alive: true, collapsing: false, group: new THREE.Group(), hpMax: 0 };
    b.group.position.set(x, 0, z);
    this.root.add(b.group);
    const chunkH = kind === 'container' ? 2.6 : kind === 'tank' ? h : kind === 'rock' ? 4 : (this.q.level <= 1 ? 6.5 : 4.8);
    const n = Math.max(1, Math.round(h / chunkH));
    const style = (c.styles || [0])[Math.floor(Math.random() * (c.styles || [0]).length)];
    let mat;
    if (kind === 'office') {
      const ft = facadeTextures(style, c.lit ?? 0.4);
      mat = new THREE.MeshStandardMaterial({ map: ft.map, emissiveMap: ft.emissive, emissive: 0xffffff, emissiveIntensity: c.lit ? 1.3 : 0, roughness: 0.65, metalness: 0.25 });
    } else if (kind === 'rock') {
      const sc = scaleMaps('plate', 77);
      mat = new THREE.MeshStandardMaterial({ color: 0x4a3a32, normalMap: sc.normal, roughness: 0.95 });
    } else if (kind === 'tank') {
      mat = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5, metalness: 0.6, normalMap: panelMaps(5).normal });
    }
    for (let i = 0; i < n; i++) {
      const ch = h / n;
      let geo, m = mat;
      if (kind === 'office') geo = boxGeo(w, ch, d, 10, 22, Math.random(), i * ch / 22);
      else if (kind === 'rock') { geo = new THREE.DodecahedronGeometry(1, 0); geo.scale(w * 0.62 * (1 - i * 0.12), ch * 0.75, d * 0.62 * (1 - i * 0.12)); }
      else if (kind === 'tank') geo = new THREE.CylinderGeometry(w / 2, w / 2, ch, 20);
      else if (kind === 'container') {
        geo = new THREE.BoxGeometry(w * 0.95, ch * 0.96, d * 0.6);
        m = new THREE.MeshStandardMaterial({ color: [0xb03020, 0x2050a0, 0xd08020, 0x208050, 0x707070][Math.floor(Math.random() * 5)], roughness: 0.6, metalness: 0.4, normalMap: panelMaps(8).normal });
      }
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.y = ch * i + ch / 2;
      if (kind === 'rock') mesh.rotation.y = Math.random() * 3;
      mesh.castShadow = this.q.level >= 3; mesh.receiveShadow = this.q.shadows;
      b.group.add(mesh);
      const hp = kind === 'tank' ? 50 : kind === 'container' ? 35 : kind === 'rock' ? 110 : 80;
      b.chunks.push({ mesh, y0: ch * i, h: ch, hp, alive: true });
      b.hpMax += hp;
    }
    if (kind === 'office') {
      // rooftop details and aviation light
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 2, d * 0.4), new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.8 }));
      roof.position.y = h / n / 2 + 1;
      b.chunks[n - 1].mesh.add(roof);
      if (h > 26) {
        const av = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
        av.position.y = 2.2; roof.add(av); b.aviation = av;
      }
      if (c.neon && Math.random() < 0.7) {
        const colors = [0xff3399, 0x33ddff, 0xffcc33, 0x66ff99, 0xff5522];
        const col = colors[Math.floor(Math.random() * colors.length)];
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w, 8) * 0.7, 2.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.2) }));
        const toC = new THREE.Vector3(-x, 0, -z).normalize();
        // place on face toward arena
        if (Math.abs(toC.x) > Math.abs(toC.z)) { sign.position.set(Math.sign(toC.x) * (w / 2 + 0.05), 0, 0); sign.rotation.y = Math.sign(toC.x) * Math.PI / 2; }
        else { sign.position.set(0, 0, Math.sign(toC.z) * (d / 2 + 0.05)); sign.rotation.y = toC.z > 0 ? 0 : Math.PI; }
        const ci = Math.min(n - 1, 1 + Math.floor(Math.random() * Math.max(1, n - 2)));
        b.chunks[ci].mesh.add(sign);
      }
      if (c.ruined) { // pre-damaged: break top chunks
        const k = Math.floor(Math.random() * Math.max(1, n / 2));
        for (let i = n - 1; i >= n - k && i > 0; i--) { b.chunks[i].alive = false; b.chunks[i].mesh.visible = false; }
        this.recomputeTop(b);
      }
    }
    this.recomputeTop(b);
    this.buildings.push(b);
    return b;
  }

  recomputeTop(b) {
    let top = 0;
    for (const ch of b.chunks) if (ch.alive) top = Math.max(top, ch.y0 + ch.h);
    b.top = top;
    if (top <= 0) b.alive = false;
  }

  makeFar() {
    const c = this.cfg.far, q = this.q;
    const list = [];
    for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) {
      const x = i * 32, z = j * 32, d = Math.hypot(x, z);
      if (d <= 98 || d > 270) continue;
      if (this.cfg.water && x > 40) continue;
      const n = Math.random() < 0.5 ? 2 : 1;
      for (let s = 0; s < n; s++) list.push([x + (n > 1 ? (s ? 5 : -5) : 0), z, n > 1 ? 8 : 14, 13]);
    }
    const cnt = Math.round(list.length * (q.level >= 2 ? 1 : 0.55));
    const ft = facadeTextures(0, this.cfg.buildings.lit ?? 0.4);
    const map = ft.map.clone(), em = ft.emissive.clone();
    map.repeat.set(1.5, 3); em.repeat.set(1.5, 3); map.needsUpdate = em.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: (this.cfg.buildings.lit ?? 0.4) > 0 ? 1.4 : 0, roughness: 0.7 });
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, mat, cnt);
    const m = new THREE.Matrix4();
    for (let i = 0; i < cnt; i++) {
      const [x, z, w, d] = list[i];
      const dist = Math.hypot(x, z);
      let h = c.minH + Math.random() * (c.maxH - c.minH) * (0.6 + dist / 400);
      if (c.ruined && Math.random() < 0.5) h *= 0.5;
      m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.ruined ? (Math.random() - 0.5) * 0.15 : 0), new THREE.Vector3(w, h, d));
      im.setMatrixAt(i, m);
    }
    this.root.add(im);
  }

  makeCars(n) {
    const geo = new THREE.BoxGeometry(1.6, 1.0, 3.6); geo.translate(0, 0.7, 0);
    const cab = new THREE.BoxGeometry(1.4, 0.7, 1.8); cab.translate(0, 1.5, -0.2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.35 });
    this.carMesh = new THREE.InstancedMesh(geo, mat, n);
    this.cabMesh = new THREE.InstancedMesh(cab, new THREE.MeshStandardMaterial({ color: 0x202830, metalness: 0.8, roughness: 0.15 }), n);
    this.carMesh.castShadow = this.q.level >= 2;
    const cols = [0xc02020, 0xe0e0e0, 0x202020, 0x2050c0, 0xe0c020, 0x808890];
    for (let i = 0; i < n; i++) {
      // roads at x or z = 16 + 32k
      const alongX = Math.random() < 0.5;
      const lane = (Math.floor(Math.random() * 4) - 2) * 32 + 16 + (Math.random() < 0.5 ? -3 : 3);
      const t = (Math.random() - 0.5) * 120;
      const p = alongX ? new THREE.Vector3(t, 0, lane) : new THREE.Vector3(lane, 0, t);
      if (this.cfg.water && p.x > 50) p.x -= 60;
      const car = { p, rot: new THREE.Euler(0, alongX ? Math.PI / 2 : 0, 0), v: new THREE.Vector3(), w: new THREE.Vector3(), state: 0, color: new THREE.Color(cols[i % cols.length]), i };
      this.cars.push(car);
      this.carMesh.setColorAt(i, car.color);
    }
    this.root.add(this.carMesh, this.cabMesh);
    this.updateCars(0);
  }

  makeLamps() {
    const positions = [];
    for (let k = -2; k <= 2; k++) for (let t = -60; t <= 60; t += 20) {
      for (const p of [[16 + k * 32 - 8, t], [t, 16 + k * 32 - 8]]) if (Math.hypot(p[0], p[1]) > 12 && Math.hypot(p[0], p[1]) < 30 || Math.hypot(p[0], p[1]) > 40) positions.push(p);
    }
    const n = positions.length;
    const pole = new THREE.CylinderGeometry(0.12, 0.16, 7, 6); pole.translate(0, 3.5, 0);
    const head = new THREE.BoxGeometry(0.5, 0.25, 1.4); head.translate(0, 7, 0.5);
    this.poleMesh = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0x505458, metalness: 0.7, roughness: 0.4 }), n);
    this.headMesh = new THREE.InstancedMesh(head, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe0b0).multiplyScalar(1.5) }), n);
    for (let i = 0; i < n; i++) {
      const [x, z] = positions[i];
      this.lamps.push({ p: new THREE.Vector3(x, 0, z), ry: Math.random() < 0.5 ? 0 : Math.PI / 2, fall: 0, fallDir: 0, falling: false });
    }
    this.root.add(this.poleMesh, this.headMesh);
    this.updateLamps(0);
  }

  makeCranes() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd04020, metalness: 0.5, roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const z = -50 + i * 50;
      for (const [x, zz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 30, 0.8), mat); leg.position.set(x, 15, zz); g.add(leg);
      }
      const boom = new THREE.Mesh(new THREE.BoxGeometry(46, 1.6, 2), mat); boom.position.set(10, 31, 0); g.add(boom);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 9), mat); cab.position.set(0, 28, 0); g.add(cab);
      g.position.set(62, 0, z);
      this.root.add(g);
    }
  }

  makeVolcano() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a1c18, roughness: 0.95, normalMap: scaleMaps('plate', 3).normal, flatShading: true });
    this.volcanoTops = [];
    for (const [x, z, r, h] of [[-120, -200, 110, 130], [160, -230, 90, 95], [-40, 240, 80, 70]]) {
      const g = new THREE.ConeGeometry(r, h, 40, 8, true);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const k = 1 + Math.sin(i * 1.7) * 0.06;
        if (y > h / 2 - 1) continue;
        p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, h / 2 - 2, z);
      this.root.add(m);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.16, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6010).multiplyScalar(3), fog: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(x, h - 2, z);
      this.root.add(glow);
      this.volcanoTops.push(new THREE.Vector3(x, h - 2, z));
    }
    // lava rivers
    const lavaMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5010).multiplyScalar(2.2) });
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3 + 0.4;
      const r = new THREE.Mesh(new THREE.PlaneGeometry(4 + Math.random() * 3, 90), lavaMat);
      r.rotation.x = -Math.PI / 2; r.rotation.z = a;
      r.position.set(Math.cos(a) * 85, 0.08, Math.sin(a) * 85);
      this.root.add(r);
    }
  }

  makeRain() {
    const n = this.q.level >= 2 ? 2500 : 900;
    const pos = new Float32Array(n * 6);
    this.rainData = { n, pos, speed: new Float32Array(n) };
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 90, y = Math.random() * 50, z = (Math.random() - 0.5) * 90;
      pos.set([x, y, z, x + 0.15, y + 1.6, z], i * 6);
      this.rainData.speed[i] = 50 + Math.random() * 20;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9ab0c8, transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    this.root.add(this.rain);
  }

  // ---------- interaction ----------
  // Damage buildings/props around point p. power ~0.3..3
  impact(p, power, radius = 6, opts = {}) {
    let hitAny = false;
    for (const b of this.buildings) {
      if (!b.alive || b.collapsing) continue;
      const dx = Math.max(Math.abs(p.x - b.x) - b.w / 2, 0), dz = Math.max(Math.abs(p.z - b.z) - b.d / 2, 0);
      const dist = Math.hypot(dx, dz);
      if (dist > radius) continue;
      for (const ch of b.chunks) {
        if (!ch.alive) continue;
        const dy = Math.max(ch.y0 - p.y, p.y - (ch.y0 + ch.h), 0);
        if (Math.hypot(dist, dy) > radius) continue;
        ch.hp -= power * 60 * (1 - Math.hypot(dist, dy) / (radius + 0.01) * 0.6);
        hitAny = true;
        if (ch.hp <= 0) this.breakChunk(b, ch, p);
      }
    }
    for (const car of this.cars) {
      if (car.state === 2) continue;
      const d = car.p.distanceTo(p);
      if (d < radius + 2) this.flingCar(car, p, power * 1.5);
    }
    for (const l of this.lamps) if (!l.falling && Math.hypot(l.p.x - p.x, l.p.z - p.z) < radius + 1) this.knockLamp(l, p);
    if (hitAny && !opts.silent) this.audio.play('crumble', { vol: Math.min(1, 0.3 + power * 0.3) });
    return hitAny;
  }

  breakChunk(b, ch, p) {
    ch.alive = false;
    ch.mesh.visible = false;
    const wp = new THREE.Vector3(b.x, ch.y0 + ch.h / 2, b.z);
    const col = b.kind === 'rock' ? 0x4a3a32 : b.kind === 'container' ? ch.mesh.material.color.getHex() : 0x7a7670;
    this.fx.spawnDebris(wp, { n: 14, color: col, size: Math.min(2.4, b.w * 0.16), spread: b.w * 0.6, speed: 9, up: 0.6 });
    this.fx.dust(wp, 1.6, b.kind === 'rock' ? 0x5a4030 : 0x8a8478);
    if (b.kind === 'tank') {
      this.fx.explosion(wp, 2.4, 0xff7020);
      this.fx.ring(new THREE.Vector3(b.x, 1, b.z), { color: 0xffa040, r1: 30, dur: 0.7 });
      this.audio.play('explosion', { vol: 1 });
      this.shake?.(0.6);
    } else if (Math.random() < 0.35) this.fx.explosion(wp, 0.8, 0xff9040);
    this.recomputeTop(b);
    const broken = b.chunks.filter((c) => !c.alive).length;
    const lowerBroken = b.chunks.findIndex((c) => !c.alive) < b.chunks.length / 2;
    if (b.alive && (broken >= Math.ceil(b.chunks.length * 0.45) || lowerBroken) && b.chunks.length > 1) this.collapse(b);
    if (!b.alive) this.addRubble(b);
  }

  collapse(b) {
    if (b.collapsing) return;
    b.collapsing = true;
    b.collapseT = 0;
    b.tilt = new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
    this.audio.play('collapse', { vol: 1 });
    this.shake?.(0.35);
  }

  addRubble(b) {
    if (b.rubble) return;
    const g = new THREE.ConeGeometry(Math.max(b.w, b.d) * 0.62, 3 + Math.min(4, b.h * 0.1), 7, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.sin(i * 12.9) * 0.4);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: b.kind === 'rock' ? 0x3a2a22 : 0x5a5650, roughness: 1, flatShading: true }));
    m.position.set(b.x, 1, b.z);
    m.receiveShadow = true;
    this.root.add(m);
    b.rubble = m;
  }

  flingCar(car, from, power) {
    const dir = new THREE.Vector3().subVectors(car.p, from); dir.y = 0;
    dir.normalize();
    car.v.set(dir.x * 12 * power, 10 + 8 * power, dir.z * 12 * power);
    car.w.set(Math.random() * 8 - 4, Math.random() * 6 - 3, Math.random() * 8 - 4);
    car.state = 1;
  }
  knockLamp(l, from) {
    l.falling = true;
    l.fallDir = Math.atan2(l.p.x - from.x, l.p.z - from.z);
  }

  // Ray against buildings. returns {t, b, p} or null
  raycast(o, d, maxT) {
    let best = null;
    for (const b of this.buildings) {
      if (!b.alive || b.collapsing) continue;
      const min = [b.x - b.w / 2, 0, b.z - b.d / 2], max = [b.x + b.w / 2, b.top, b.z + b.d / 2];
      let t0 = 0, t1 = maxT;
      const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
      let ok = true;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(dd[k]) < 1e-6) { if (oo[k] < min[k] || oo[k] > max[k]) { ok = false; break; } continue; }
        let ta = (min[k] - oo[k]) / dd[k], tb = (max[k] - oo[k]) / dd[k];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && (!best || t0 < best.t)) best = { t: t0, b };
    }
    if (best) best.p = o.clone().addScaledVector(d, best.t);
    return best;
  }

  // fighters walking through props
  touch(fighters) {
    for (const f of fighters) {
      const r = f.def.push + 0.8;
      for (const car of this.cars) {
        if (car.state !== 0) continue;
        if (Math.hypot(car.p.x - f.pos.x, car.p.z - f.pos.z) < r + 1.5) {
          this.flingCar(car, f.pos, 0.55);
          this.audio.play('crunch', { vol: 0.5 });
        }
      }
      for (const l of this.lamps) if (!l.falling && Math.hypot(l.p.x - f.pos.x, l.p.z - f.pos.z) < r) { this.knockLamp(l, f.pos); this.audio.play('clang', { vol: 0.35 }); }
    }
  }

  updateCars(dt) {
    if (!this.carMesh) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    for (const car of this.cars) {
      if (car.state === 1) {
        car.v.y -= 30 * dt;
        car.p.addScaledVector(car.v, dt);
        car.rot.x += car.w.x * dt; car.rot.y += car.w.y * dt; car.rot.z += car.w.z * dt;
        if (car.p.y <= 0 && car.v.y < 0) {
          car.p.y = 0;
          car.state = 2;
          car.rot.x = Math.round(car.rot.x / Math.PI) * Math.PI; car.rot.z = Math.round(car.rot.z / Math.PI) * Math.PI;
          this.fx.explosion(car.p.clone().setY(1), 0.7, 0xff8030);
          this.audio.play('explosion', { vol: 0.45, pitch: 1.4 });
          car.color.multiplyScalar(0.18);
          this.carMesh.setColorAt(car.i, car.color);
          this.carMesh.instanceColor.needsUpdate = true;
          car.burn = 6;
        }
      }
      if (car.burn > 0) {
        car.burn -= dt;
        if (Math.random() < 0.3 * this.q.fxMul) this.fx.burst(car.p.clone().setY(1.2), { n: 1, color: 0xff7020, speed: 1, up: 1, size: 1.8, life: 0.5, dirSp: 4, dir: new THREE.Vector3(0, 1, 0) });
      }
      q.setFromEuler(car.rot);
      m.compose(car.p, q, one);
      this.carMesh.setMatrixAt(car.i, m);
      this.cabMesh.setMatrixAt(car.i, m);
    }
    this.carMesh.instanceMatrix.needsUpdate = true;
    this.cabMesh.instanceMatrix.needsUpdate = true;
  }

  updateLamps(dt) {
    if (!this.poleMesh) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    this.lamps.forEach((l, i) => {
      if (l.falling && l.fall < Math.PI / 2 - 0.05) l.fall = Math.min(Math.PI / 2 - 0.05, l.fall + dt * (0.5 + l.fall * 4));
      e.set(0, 0, 0);
      q.setFromEuler(new THREE.Euler(0, l.fallDir, 0));
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), l.fall);
      const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.fallDir);
      const yawBack = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.ry - l.fallDir);
      const fq = yawQ.clone().multiply(tilt).multiply(yawBack);
      m.compose(l.p, fq, one);
      this.poleMesh.setMatrixAt(i, m);
      this.headMesh.setMatrixAt(i, m);
    });
    this.poleMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, cam, focus) {
    this.time += dt;
    // shadow camera follows the fight
    if (focus) {
      this.sun.position.copy(focus).add(this.sunOffset);
      this.sun.target.position.copy(focus);
    }
    for (const b of this.buildings) {
      if (b.aviation) b.aviation.visible = Math.sin(this.time * 3 + b.x) > 0;
      if (b.collapsing && b.alive) {
        b.collapseT += dt;
        const k = b.collapseT;
        b.group.position.y = -k * k * 6;
        b.group.rotation.x = b.tilt.x * k; b.group.rotation.z = b.tilt.z * k;
        if (Math.random() < 0.6 * this.q.fxMul) this.fx.dust(new THREE.Vector3(b.x + (Math.random() - 0.5) * b.w, 1, b.z + (Math.random() - 0.5) * b.d), 1.8, 0x8a8478);
        if (Math.random() < 0.2 * this.q.fxMul) this.fx.spawnDebris(new THREE.Vector3(b.x, Math.max(1, b.top + b.group.position.y), b.z), { n: 3, size: 1.2, spread: b.w, speed: 5 });
        if (-b.group.position.y > b.top + 2) {
          b.alive = false;
          b.group.visible = false;
          this.addRubble(b);
        }
      }
    }
    this.updateCars(dt);
    this.updateLamps(dt);
    if (this.waterNormal) { this.waterNormal.offset.x += dt * 0.02; this.waterNormal.offset.y += dt * 0.013; }
    if (this.lavaGround) this.lavaGround.emissiveIntensity = 0.35 + Math.sin(this.time * 1.3) * 0.12;
    if (this.rain) {
      const r = this.rainData, pos = r.pos, cx = cam.position.x, cz = cam.position.z;
      for (let i = 0; i < r.n; i++) {
        let y = pos[i * 6 + 1] - r.speed[i] * dt;
        let x = pos[i * 6], z = pos[i * 6 + 2];
        if (y < 0) {
          y = 40 + Math.random() * 10; x = cx + (Math.random() - 0.5) * 90; z = cz + (Math.random() - 0.5) * 90;
        }
        pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
        pos[i * 6 + 3] = x + 0.12; pos[i * 6 + 4] = y + 1.8; pos[i * 6 + 5] = z;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.lightningT -= dt;
      if (this.lightningT < 0) {
        this.lightningT = 6 + Math.random() * 9;
        this.flashT = 0.25;
        setTimeout(() => this.audio.play('thunder', { vol: 0.8 }), 400 + Math.random() * 600);
      }
      if (this.flashT > 0) { this.flashT -= dt; this.hemi.intensity = this.hemiBase + (Math.random() < 0.5 ? 3.5 : 0.5); }
      else this.hemi.intensity = this.hemiBase;
    }
    if (this.cfg.embers) {
      for (let i = 0; i < 2 * this.q.fxMul; i++) {
        const x = cam.position.x + (Math.random() - 0.5) * 80, z = cam.position.z + (Math.random() - 0.5) * 80;
        this.fx.add.emit({ x, y: 0.5, z, vx: (Math.random() - 0.5) * 2, vy: 3 + Math.random() * 4, vz: (Math.random() - 0.5) * 2, r: 1, g: 0.45, b: 0.1, size: 0.4, life: 3, drag: 0.995 });
      }
      if (this.volcanoTops && Math.random() < 0.02) {
        const t = this.volcanoTops[Math.floor(Math.random() * this.volcanoTops.length)];
        this.fx.burst(t, { n: 30, color: 0xff6010, speed: 40, up: 1.5, size: 4, life: 2.5, grav: 25, drag: 0.99 });
        this.fx.burst(t, { n: 10, color: 0x201010, speed: 10, up: 2, size: 20, grow: 15, life: 5, smoke: true, alpha: 0.6 });
      }
    }
    for (const f of this.fires) if (Math.random() < 0.5 * this.q.fxMul) {
      this.fx.add.emit({ x: f.x + (Math.random() - 0.5) * 3, y: f.y, z: f.z + (Math.random() - 0.5) * 3, vx: 0, vy: 4 + Math.random() * 3, vz: 0, r: 1, g: 0.45, b: 0.12, size: 3, grow: -2, life: 0.9, drag: 0.98 });
      if (Math.random() < 0.15) this.fx.smoke.emit({ x: f.x, y: f.y + 4, z: f.z, vx: 1, vy: 4, vz: 0, r: 0.15, g: 0.14, b: 0.13, size: 6, grow: 6, life: 4, alpha: 0.5, drag: 0.99 });
    }
    for (const s of this.stacks) if (Math.random() < 0.25 * this.q.fxMul) {
      this.fx.smoke.emit({ x: s.x, y: s.y, z: s.z, vx: 2, vy: 4, vz: 0.5, r: 0.5, g: 0.5, b: 0.52, size: 6, grow: 5, life: 6, alpha: 0.5, drag: 0.995 });
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (this.envMap) this.envMap.dispose();
    this.scene.environment = null;
  }
}
