// 海凪の港町 — walk around a Japanese fishing port town. Entry point: renderer, quality, loading, HUD, save.
import * as THREE from 'three';
import { Ground, G, PLATFORMS, QY } from './terrain.js';
import { MaterialLib } from './materials.js';
import { World, TOD_NAMES } from './world.js';
import { Town } from './town.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Treats } from './treats.js';

// aerial perspective: fog thickens exponentially with distance (like real air) instead of the linear ramp
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = 1.0 - exp( - max( vFogDepth - fogNear, 0.0 ) * 1.5 / max( fogFar - fogNear, 1.0 ) );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
const TONE = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping };

const $ = (id) => document.getElementById(id);
const SAVE = 'uminagi-save-v1';
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE)) || null; } catch { return null; } };
const store = (s) => { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch { /* private mode */ } };

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
const QUALITY = {
  low: { name: '軽量', pixelRatio: 1.0, shadows: false, shadowSize: 1024, shadowRange: 40, aniso: 2, normalMaps: true, trees: 1300, grass: 600, lod: 0.5, lights: 3, refraction: false },
  medium: { name: '標準', pixelRatio: 1.5, shadows: true, shadowSize: 1024, shadowRange: 45, aniso: 4, normalMaps: true, trees: 2400, grass: 1600, lod: 0.85, lights: 6, refraction: true },
  high: { name: '高画質', pixelRatio: 2.0, shadows: true, shadowSize: 2048, shadowRange: 60, aniso: 8, normalMaps: true, trees: 4200, grass: 3500, lod: 1.25, lights: 8, refraction: true },
  // PC: 1024 px textures, 4096 shadow map over 90 m, dense forest and grass, far LOD, ambient occlusion + bloom + SMAA
  ultra: { name: '最高(PC)', pixelRatio: 2.0, shadows: true, shadowSize: 4096, shadowRange: 90, aniso: 16, normalMaps: true, trees: 8500, grass: 9000, lod: 2.2, lights: 12, tex1k: true, post: true, refraction: true },
};
const saved = load();
const qName = new URLSearchParams(location.search).get('q') || saved?.quality || (isMobile ? 'medium' : 'ultra');
const Q = QUALITY[qName] || QUALITY.medium;

// areas shown on entry (first match wins)
const AREAS = [
  { name: '魚市場', sub: 'うおいちば', x0: -18, x1: 14, z0: -3, z1: 16 },
  { name: '展望台', sub: 'てんぼうだい', x0: -106, x1: -94, z0: -4, z1: 10 },
  { name: '灯台の丘', sub: 'とうだいのおか', x0: -142, x1: -94, z0: -42, z1: 10 },
  { name: '崖の遊歩道', sub: 'がけのゆうほどう', x0: -88, x1: -28, z0: -128, z1: -118 },
  { name: '崖の遊歩道', sub: 'がけのゆうほどう', x0: -98, x1: -78, z0: -128, z1: -18 },
  { name: '海凪神社', sub: 'うみなぎじんじゃ', x0: -30, x1: 10, z0: -134, z1: -103 },
  { name: '赤灯台', sub: 'ぼうはていのさき', x0: -28, x1: -8, z0: 98, z1: 114 },
  { name: '防波堤', sub: 'ぼうはてい', x0: -86, x1: 66, z0: 22, z1: 114, test: (x, z) => x < -74 || z > 97 },
  { name: '桟橋', sub: 'さんばし', x0: -50, x1: 37, z0: 22, z1: 50 },
  { name: '漁港', sub: 'ぎょこう', x0: -80, x1: 66, z0: -14, z1: 96 },
  { name: '商店街', sub: 'しょうてんがい', x0: 24, x1: 56, z0: -96, z1: -6 },
  { name: '坂の上の広場', sub: 'さかのうえ', x0: 24, x1: 56, z0: -122, z1: -96 },
  { name: '丘の住宅街', sub: 'おかのじゅうたくがい', x0: -76, x1: 24, z0: -104, z1: -14 },
  { name: '東の浜', sub: 'ひがしのはま', x0: 64, x1: 130, z0: 40, z1: 120 },
  { name: '東の高台', sub: 'ひがしのたかだい', x0: 56, x1: 90, z0: -90, z1: -10 },
];
const SPOTS = {  // fast travel (map buttons)
  harbour: [0, 19, 0], street: [40, -40, 0.0], houses: [-6, -48, 0.3], shrine: [-9, -112, 0], hill: [-104, -10, -0.8], breakwater: [-30, 108, -0.5],
};

class App {
  async init() {
    const cv = $('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !Q.post && !Q.refraction, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = TONE[new URLSearchParams(location.search).get('tm')] ?? THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = Q.shadows; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.25, 6000);
    if (Q.post) await this.setupPost();
    this.resize(); addEventListener('resize', () => this.resize());
    const prog = (k, msg) => { $('loadbar').style.width = (k * 100).toFixed(0) + '%'; if (msg) $('loadmsg').textContent = msg; };
    prog(0.02, '地形をつくっています…');
    await new Promise((r) => setTimeout(r, 30));
    this.ground = new Ground();
    prog(0.08, '素材を読み込んでいます…');
    this.mats = await new MaterialLib(this.renderer, Q).load();
    this.world = new World(this.scene, this.renderer, this.ground, Q);
    if (Q.post) this.world.setLinearSky(true);
    document.body.classList.toggle('post', !!Q.post);   // the post chain works in linear light
    this.scene.add(this.ground.buildMeshes(this.mats.mats));
    this.town = new Town(this.scene, this.ground, this.mats, this.world, Q);
    await this.town.load((k) => prog(0.12 + k * 0.78, '港町の建物を読み込んでいます…'));
    prog(0.92, '町を組み立てています…');
    await new Promise((r) => setTimeout(r, 30));
    this.town.build();
    this.world.setupReflection([this.scene.getObjectByName('ground'), ...this.town.boats.map((b) => b.o), this.town.lighthouse, this.town.redLighthouse]);
    this.player = new Player(this.town, this.ground);
    this.input = new Input($('stick'), $('knob'), $('dash'), $('web'));
    this.sound = new Sound();
    this.treats = new Treats(this.scene, this.ground, this.town, this.player, this.sound);
    this.drawMapBase();
    const s = load();
    if (s) { this.player.place(s.x, s.z, s.yaw); this.player.dist = s.dist || 9; this.world.setTimeOfDay(s.tod || 'day', true); }
    else this.player.place(0, 19, 0);
    this.player.heading = this.player.yaw + Math.PI;
    this.ui(!!s);
    prog(1, '');
    // warm up: compile shaders and upload instance buffers before showing the title
    this.town.pool.update(this.player.pos, Q.lod, true);
    this.frame(0.016);
    this.renderer.compile(this.scene, this.camera);
    $('loading').hidden = true; $('start').hidden = false;
    this.last = performance.now(); this.fpsT = 0; this.fpsN = 0; this.fps = 60;
    this.renderer.setAnimationLoop((t) => this.loop(t));
    window.__uminagi = this;
  }
  // PC ultra: scene -> GTAO (ambient occlusion) -> bloom (lamps, sun glints) -> tone mapping -> SMAA
  async setupPost() {
    const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { UnrealBloomPass }, { SMAAPass }, { OutputPass }, { ShaderPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/GTAOPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/SMAAPass.js'), import('three/addons/postprocessing/OutputPass.js'),
      import('three/addons/postprocessing/ShaderPass.js')]);
    // drop NaN/negative pixels and cap HDR peaks (sun glints) so bloom never smears them across the screen
    const sanitize = () => new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 5.0), 1.0); }',
    });
    const r = this.renderer, rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
    const c = this.composer = new EffectComposer(r, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    c.addPass(sanitize());
    const ao = this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
    ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    ao.blendIntensity = 0.85;
    // the sea stays out of the AO depth/normal pass: a huge flat plane at grazing angles reads as one big crevice and goes black
    const aoRender = ao.render.bind(ao);
    ao.render = (...args) => { const sea = this.world?.sea, v = sea?.visible; if (sea) sea.visible = false; aoRender(...args); if (sea) sea.visible = v; };
    c.addPass(ao);
    c.addPass(sanitize());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.25, 0.55, 0.92);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    // film look after tone mapping: gentle S-curve, warm highlights / cool shadows, lens vignette, fine grain
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
        void main(){
          vec3 c = clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0);
          c = mix(c, c * c * (3.0 - 2.0 * c), 0.2);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, 1.08);
          c *= mix(vec3(0.96, 0.99, 1.04), vec3(1.04, 1.0, 0.95), smoothstep(0.15, 0.85, l));
          vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.6;
          float n = fract(sin(dot(vUv * vec2(1789.3, 983.1) + fract(uTime) * 61.7, vec2(12.9898, 78.233))) * 43758.5453);
          gl_FragColor = vec4(c + (n - 0.5) * 0.016, 1.0);
        }`,
    });
    c.addPass(this.grade);
    this.smaa = new SMAAPass(1, 1); c.addPass(this.smaa);
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
    this.camera.fov = w < h ? 70 : 58; this.camera.updateProjectionMatrix();
  }
  ui(hasSave) {
    $('continue').hidden = !hasSave;
    const start = (fresh) => {
      if (fresh) { this.player.place(0, 19, 0); this.player.heading = Math.PI; this.world.setTimeOfDay('day', true); }
      $('start').hidden = true; $('hud').hidden = false; this.input.enabled = true; this.playing = true;
      this.sound.start(); this.areaShown = null;
      try { if (isMobile && screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {}); } catch { /* not supported */ }
    };
    $('startbtn').onclick = () => start(true);
    $('continue').onclick = () => start(false);
    $('mapbtn').onclick = () => this.toggleMap();
    $('bigmap').onclick = (e) => { if (e.target.id === 'bigmap') this.toggleMap(false); };
    $('setbtn').onclick = () => { $('settings').hidden = !$('settings').hidden; };
    $('setclose').onclick = () => { $('settings').hidden = true; };
    for (const b of document.querySelectorAll('[data-tod]')) b.onclick = () => { this.world.setTimeOfDay(b.dataset.tod); this.save(); this.syncButtons(); };
    for (const b of document.querySelectorAll('[data-q]')) b.onclick = () => { this.save(b.dataset.q); location.search = '?q=' + b.dataset.q; };
    for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => { const [x, z, yaw] = SPOTS[b.dataset.go]; this.player.place(x, z, yaw); this.player.heading = yaw + Math.PI; this.toggleMap(false); this.save(); };
    $('zin').onclick = () => { this.player.dist = Math.max(2.5, this.player.dist * 0.8); };
    $('zout').onclick = () => { this.player.dist = Math.min(30, this.player.dist * 1.25); };
    $('mute').onclick = () => { $('mute').textContent = this.sound.toggle() ? '🔊' : '🔇'; };
    $('reset').onclick = () => { try { localStorage.removeItem(SAVE); } catch { /* ignore */ } location.search = ''; };
    this.syncButtons();
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.save(); this.treats.saveNow(); } });
    addEventListener('keydown', (e) => {
      if (!this.playing) return;
      if (e.code === 'KeyM') { if (document.pointerLockElement) document.exitPointerLock(); this.toggleMap(); }
      if (e.code === 'KeyT') { const order = ['day', 'evening', 'night']; this.world.setTimeOfDay(order[(order.indexOf(this.world.todName) + 1) % 3]); this.syncButtons(); }
    });
  }
  syncButtons() {
    for (const b of document.querySelectorAll('[data-tod]')) b.classList.toggle('on', b.dataset.tod === this.world.todName);
    for (const b of document.querySelectorAll('[data-q]')) b.classList.toggle('on', QUALITY[b.dataset.q] === Q);
  }
  save(quality) {
    const p = this.player;
    store({ x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(3), dist: +p.dist.toFixed(2), tod: this.world.todName, quality: quality || qName, t: Date.now() });
  }
  toggleMap(show = $('bigmap').hidden) { $('bigmap').hidden = !show; if (show) this.drawMap($('bigmapcv'), 1); }
  // ------------------------------------------------------------------ minimap
  drawMapBase() {
    const W = 300, Hh = 282, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
    const g = cv.getContext('2d'), img = g.createImageData(W, Hh), gr = this.ground;
    const col = { concrete_wet: [150, 150, 146], concrete: [168, 166, 160], paving: [196, 186, 160], dirt: [176, 156, 122], granite: [190, 188, 182], grass: [120, 160, 80], asphalt: [96, 96, 98] };
    for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
      const x = G.x0 + i + 0.5, z = G.z0 + j + 0.5, s = gr.sample(x, z), o = (j * W + i) * 4;
      let c;
      if (s.plat) c = s.plat.dock ? [150, 116, 80] : col[s.plat.mat] || [170, 170, 170];
      else if (s.h < 0) { const d = Math.min(1, -s.h / 8); c = [70 - d * 40, 160 - d * 70, 200 - d * 40]; }
      else { const sl = Math.min(1, Math.abs(gr.natAt(x + 1, z) - s.h) + Math.abs(gr.natAt(x, z + 1) - s.h)); const k = Math.min(1, s.h / 60); c = [96 + sl * 60 - k * 20, 140 - k * 30 + sl * 20, 72 + sl * 50]; }
      const shade = s.plat ? 1 : 0.85 + 0.15 * Math.sin(s.h * 0.8);
      img.data[o] = c[0] * shade; img.data[o + 1] = c[1] * shade; img.data[o + 2] = c[2] * shade; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (const r of this.town.mapRects) {
      g.save(); g.translate(r.x - G.x0, r.z - G.z0); g.rotate(-r.ry);
      g.fillStyle = r.kind === 'shop' ? '#7a4a3a' : r.kind === 'house' ? '#5a5048' : '#4a4e58'; g.fillRect(-r.w / 2, -r.d / 2, r.w, r.d); g.restore();
    }
    this.mapBase = cv;
  }
  drawMap(cv, big) {
    const g = cv.getContext('2d'), p = this.player.pos, W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    if (big) {
      const s = Math.min(W / 300, H / 282); g.save(); g.scale(s, s); g.drawImage(this.mapBase, 0, 0);
      this.marker(g, p.x - G.x0, p.z - G.z0, this.player.heading, 7);
      g.font = 'bold 9px sans-serif'; g.fillStyle = '#123'; g.textAlign = 'center';
      for (const a of AREAS.slice(0, 13)) if (!a.test) g.fillText(a.name, (a.x0 + a.x1) / 2 - G.x0, (a.z0 + a.z1) / 2 - G.z0);
      g.restore(); return;
    }
    const S = 1.6;  // px per metre, centred on the player, north up
    g.save(); g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2d6f9a'; g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2); g.scale(S, S); g.translate(-(p.x - G.x0), -(p.z - G.z0));
    g.drawImage(this.mapBase, 0, 0);
    g.restore();
    this.marker(g, W / 2, H / 2, this.player.heading, 9);
    // camera direction wedge
    g.save(); g.translate(W / 2, H / 2); g.rotate(-this.player.yaw + Math.PI);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 40, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.fill(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText('N', W / 2, 16);
  }
  marker(g, x, y, heading, s) {
    g.save(); g.translate(x, y); g.rotate(-heading + Math.PI);
    g.fillStyle = '#ffd23a'; g.strokeStyle = '#3a2a00'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.7, s * 0.8); g.lineTo(0, s * 0.35); g.lineTo(-s * 0.7, s * 0.8); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  area() {
    const p = this.player.pos;
    const a = AREAS.find((r) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1 && (!r.test || r.test(p.x, p.z)));
    const name = a ? a.name : '海凪の港町';
    if (name !== this.areaShown) {
      this.areaShown = name;
      const el = $('area'); el.innerHTML = `<b>${name}</b><small>${a ? a.sub : 'うみなぎのみなとまち'}</small>`;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      $('place').textContent = name;
    }
  }
  // ------------------------------------------------------------------ loop
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.frame(dt);
    this.fpsT += dt; this.fpsN++;
    if (this.fpsT > 1) { this.fps = this.fpsN / this.fpsT; this.fpsT = 0; this.fpsN = 0; if ($('fps')) $('fps').textContent = this.fps.toFixed(0) + ' fps'; }
  }
  frame(dt, draw = true) {
    const pl = this.player;
    if (this.playing) {
      this.input.update();
      pl.update(dt, this.input, pl.yaw);
      this.saveT = (this.saveT || 0) + dt; if (this.saveT > 5) { this.saveT = 0; this.save(); this.treats.saveNow(); }
      this.area();
      this.sound.update(dt, pl, this.world.todName, this.ground);
    }
    const look = this.playing ? this.input.takeLook() : { x: dt * 0.05, y: 0 };
    const cam = pl.updateCamera(dt, this.camera, look, this.playing ? this.input.takeZoom() : 0);
    this.world.update(dt, pl.pos, cam, this.mats);
    this.mats.wind.value = this.world.time;
    this.town.update(dt, cam, pl.pos, Q.lod);
    this.treats.update(dt, this.camera, this.playing);
    if (this.playing && !this.mapT) this.drawMap($('map'), 0);
    this.mapT = ((this.mapT || 0) + 1) % 3;
    if (!draw) return;
    if (this.composer) {
      this.bloom.strength = 0.22 + 0.55 * this.world.cur.glow;   // lamps and lit windows bloom at night
      this.bloom.threshold = 0.92 - 0.25 * this.world.cur.glow;
      this.grade.uniforms.uTime.value = this.world.time;
      this.composer.render();
    } else this.renderer.render(this.scene, this.camera);
  }
  // ------------------------------------------------------------------ scene export (tools/export_scene.mjs)
  // placements of every kit model (instanced and animated) + the generated ground as a GLB (base64)
  async exportScene() {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const r4 = (v) => Math.round(v * 1e4) / 1e4, out = [];
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), e = new THREE.Euler();
    for (const g of this.town.pool.groups.values()) for (const it of g.items) {
      it.m.decompose(pos, q, sc); e.setFromQuaternion(q, 'YXZ');
      out.push({ model: g.proto.name, p: [r4(pos.x), r4(pos.y), r4(pos.z)], r: [r4(e.x), r4(e.y), r4(e.z)], s: r4(sc.x), tint: it.tint ? [r4(it.tint.r), r4(it.tint.g), r4(it.tint.b)] : undefined });
    }
    this.town.root.traverse((o) => {
      const name = o.name;
      if (o.parent === this.town.root && this.town.protos[name] && name !== 'shiba') out.push({ model: name, p: [r4(o.position.x), r4(o.position.y), r4(o.position.z)], r: [0, r4(o.rotation.y), 0], s: 1, animated: true });
    });
    const ground = this.scene.getObjectByName('ground');
    const glb = await new GLTFExporter().parseAsync(ground, { binary: true, onlyVisible: true });
    let bin = ''; const u8 = new Uint8Array(glb); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { placements: out, groundGLB: btoa(bin), areas: AREAS };
  }
  // ------------------------------------------------------------------ checks used by tests/e2e.mjs
  // flood-fill the walkable area from a start point with the same rules as the player, report which places are reachable
  validateRoutes(targets, step = 1) {
    const pl = this.player, saveR = pl.pos.clone();
    const key = (i, j) => i * 10000 + j, x0 = G.x0, z0 = G.z0;
    const start = [Math.round((0 - x0) / step), Math.round((19 - z0) / step)];
    const seen = new Map([[key(...start), this.ground.height(0, 19)]]), queue = [start];
    const free = (x, y, z) => { const p = { x, z }; pl.pos.y = y; pl.collide(p); return Math.hypot(p.x - x, p.z - z) < 0.05; };
    while (queue.length) {
      const [i, j] = queue.shift(), x = x0 + i * step, z = z0 + j * step, y = seen.get(key(i, j));
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj, k = key(a, b);
        if (seen.has(k)) continue;
        const nx = x0 + a * step, nz = z0 + b * step;
        // walk there in small steps like the player does
        let ok = true, yy = y;
        for (let s = 1; s <= 4 && ok; s++) {
          const px = x + (nx - x) * s / 4, pz = z + (nz - z) * s / 4, st = pl.canStand(px, pz, yy, step / 4);
          if (!st) ok = false; else yy = st.h;
        }
        if (!ok || !free(nx, yy, nz)) continue;
        seen.set(k, yy); queue.push([a, b]);
      }
    }
    pl.pos.copy(saveR);
    const out = {};
    for (const [name, [x, z]] of Object.entries(targets)) {
      let best = 1e9;
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
        const i = Math.round((x - x0) / step) + di, j = Math.round((z - z0) / step) + dj;
        if (seen.has(key(i, j))) best = Math.min(best, Math.hypot(di, dj) * step);
      }
      out[name] = best < 3.5;
    }
    out.__cells = seen.size;
    return out;
  }
}

new App().init().catch((e) => { console.error(e); $('loadmsg').textContent = '読み込みに失敗しました: ' + e.message; });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
void PLATFORMS; void QY; void TOD_NAMES;
