// App shell: renderer, screens/menus, showroom previews, battle lifecycle, settings, PWA.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { resolveQuality, isMobile, PRESETS } from './quality.js';
import { setTextureSize } from './textures.js';
import { sampleClip, approachPose, copyPose, addTo } from './rig.js';
import { ROSTER, LOCKED, byId, applyCustomNames } from './kaiju/index.js';
import { STAGES, Stage } from './stage.js';
import { FX } from './fx.js';
import { CameraRig } from './camera.js';
import { Match } from './game.js';
import { AudioSys } from './audio.js';
import { Input, HumanController, TouchControls, DEFAULT_KEYS, DEFAULT_PAD, ACTIONS, ACTION_NAMES } from './input.js';
import { AIController, LEVELS } from './ai.js';
import * as store from './save.js';
import { STORY } from './story.js';

const $ = (id) => document.getElementById(id);
const DEFAULTS = {
  quality: 'AUTO', showFps: false, time: 60, rounds: 2, music: 0.5, sfx: 0.9, voice: true, cpuLevel: 'NORMAL', dynRes: true,
  keys: DEFAULT_KEYS, pad: DEFAULT_PAD, names: {},
  touch: { mode: 'auto', size: 1, opacity: 0.7, offsetX: 16, offsetY: 0, stickX: 0 },
};
const clone = (o) => JSON.parse(JSON.stringify(o));

const App = {
  settings: clone(DEFAULTS),
  records: { arcadeClears: {}, wins: 0, matches: 0 },
  screen: 'boot',
  stack: [],
};
window.__kf = App;

// ---------------- renderer ----------------
let canvas = $('gl');
let renderer, composer, renderPass, bloom, q;
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 1200);
const audio = new AudioSys();
let input, touch;

function initRenderer() {
  q = resolveQuality(App.settings.quality);
  setTextureSize(q.tex);
  if (renderer) {
    // a fresh canvas is needed because context attributes (antialias) cannot change
    renderer.dispose(); renderer.forceContextLoss();
    const c2 = document.createElement('canvas'); c2.id = 'gl';
    canvas.replaceWith(c2); canvas = c2;
  }
  renderer = new THREE.WebGLRenderer({ canvas, antialias: q.aa, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(q.pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = q.level >= 3 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  composer = null;
  if (q.bloom) {
    const hdr = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType }));
    renderPass = new RenderPass(new THREE.Scene(), camera);
    composer.addPass(renderPass);
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * q.bloomRes, innerHeight * q.bloomRes), 0.55, 0.5, 0.82);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(q.pixelRatio);
    composer.setSize(innerWidth, innerHeight);
  }
  App.q = q;
  App.pr = q.pixelRatio;
}
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  if (composer) { composer.setSize(innerWidth, innerHeight); bloom.resolution.set(innerWidth * q.bloomRes, innerHeight * q.bloomRes); }
}
window.addEventListener('resize', () => setTimeout(resize, 50));

function renderScene(scene) {
  if (composer) { renderPass.scene = scene; composer.render(); }
  else renderer.render(scene, camera);
}

// ---------------- showroom (title / select preview) ----------------
const show = { scene: null, models: {}, cur: null, puppet: null, rot: 0, mode: 'idle', t: 0 };
function buildShowroom() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x07080c);
  s.fog = new THREE.Fog(0x07080c, 40, 120);
  const hemi = new THREE.HemisphereLight(0x8890b0, 0x201818, 0.8);
  s.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0e0, 2.6); key.position.set(15, 30, 22);
  key.castShadow = q.shadows; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
  s.add(key);
  const rim = new THREE.DirectionalLight(0xff6a30, 2.2); rim.position.set(-20, 18, -20); s.add(rim);
  const rim2 = new THREE.DirectionalLight(0x4080ff, 2); rim2.position.set(20, 10, -18); s.add(rim2);
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(14, 15, 1, 64), new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.3, roughness: 0.7 }));
  disk.position.y = -0.5; disk.receiveShadow = true; s.add(disk);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(14.4, 0.12, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6020).multiplyScalar(1.4) }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; s.add(ring);
  // backdrop city silhouette
  const bg = new THREE.Group();
  for (let i = 0; i < 70; i++) {
    const h = 10 + Math.random() * 50, w = 4 + Math.random() * 8;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ color: 0x0c0e14, emissive: 0x150a06, roughness: 1 }));
    const a = Math.PI * (0.65 + Math.random() * 0.7) + Math.PI / 2, r = 55 + Math.random() * 40;
    m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    bg.add(m);
  }
  s.add(bg);
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(20, 16, 8), new THREE.MeshBasicMaterial({ color: 0x222630, side: THREE.BackSide })));
  for (const [c, x] of [[0xff8040, -12], [0x60a0ff, 12], [0xffffff, 0]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3), side: THREE.DoubleSide }));
    p.position.set(x, 10, x === 0 ? 15 : -10); p.lookAt(0, 0, 0); es.add(p);
  }
  s.environment = pm.fromScene(es, 0.04).texture;
  pm.dispose();
  show.scene = s;
  show.models = {};
}
function showModel(def, boss = false, alt = 0) {
  const key = def.id + (boss ? 'b' : '') + alt;
  if (!show.models[key]) {
    const m = def.build(q, { boss, alt });
    m.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    show.models[key] = m;
  }
  if (show.cur) show.scene.remove(show.cur.root);
  const m = show.models[key];
  show.scene.add(m.root);
  show.cur = m;
  show.def = def;
  show.puppet = { pose: {}, target: {}, f: 0, state: 'idle', mf: 0, move: null, moveId: null, def, tailHist: new Float32Array(64), pos: new THREE.Vector3(), yaw: 0, gaitPhase: 0, sideY: 0, fwd: 0, vel: new THREE.Vector3() };
  setPreview('idle');
}
function setPreview(mode) {
  show.mode = mode; show.t = 0;
  const p = show.puppet; if (!p) return;
  p.mf = 0; p.state = 'idle'; p.move = null; p.moveId = null;
  document.querySelectorAll('.pv').forEach((b) => b.classList.toggle('on', b.dataset.pv === mode));
  if (mode === 'win') audio.roar(show.def.voice);
  if (mode === 'special') { p.state = 'move'; p.moveId = 'super'; p.move = show.def.moves.super; }
}
function updateShowroom(dt) {
  const m = show.cur, p = show.puppet;
  if (!m) return;
  show.t += dt;
  const d = show.def, P = d.poses;
  const f = Math.floor(show.t * 60);
  p.mf = f;
  if (show.mode === 'idle') copyPose(P.base, p.target);
  else if (show.mode === 'win') sampleClip(d.anims.win, f, p.target);
  else {
    const mv = d.moves.super;
    sampleClip(mv.anim, f % (mv.startup + mv.active + mv.recovery + 40), p.target);
    p.mf = f % (mv.startup + mv.active + mv.recovery + 40);
  }
  if (d.proc) d.proc(p.target, { t: f, st: 'idle', fighter: p, walk: false, phase: 0, side: 0 });
  if (d.tails) for (const chain of d.tails) chain.forEach((b, i) => addTo(p.target, b, 0, Math.sin(f * 0.04 - i * 0.6) * 0.05 * (i + 1) * 0.5, 0));
  approachPose(p.pose, p.target, 0.2);
  m.rig.apply(p.pose);
  const r = p.pose._root || [0, 0, 0, 0, 0, 0];
  m.pivot.position.set(r[0] || 0, r[1] || 0, r[2] || 0); m.pivot.rotation.set(r[3] || 0, r[4] || 0, r[5] || 0);
  if (m.update) m.update(p, dt);
  show.rot += dt * 0.25;
  const h = d.height;
  const ang = 0.5 + Math.sin(show.rot) * 0.5;
  const dist = h * 2.0 + 6;
  const wide = camera.aspect > 1.3;
  camera.position.set(Math.sin(ang) * dist, h * 0.55, Math.cos(ang) * dist);
  const look = new THREE.Vector3(wide ? -Math.cos(ang) * h * 0.18 : 0, h * 0.48, wide ? Math.sin(ang) * h * 0.18 : 0);
  camera.lookAt(look);
  if (camera.fov !== 45) { camera.fov = 45; camera.updateProjectionMatrix(); }
}

// Render portrait icons for each kaiju from its real 3D model
function makePortraits() {
  const S = 256;
  const pr = renderer.getPixelRatio();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
  const c2 = document.createElement('canvas'); c2.width = c2.height = S;
  const ctx = c2.getContext('2d');
  App.portraits = {};
  for (const def of ROSTER) {
    showModel(def);
    updateShowroom(0);
    const m = show.cur;
    m.rig.root.updateMatrixWorld(true);
    const head = m.rig.bones[def.portraitBone || 'head'].getWorldPosition(new THREE.Vector3());
    const off = def.portraitOff || [4, 1.0, 9];
    cam.position.set(head.x + off[0], head.y + off[1], head.z + off[2]);
    cam.lookAt(head.x, head.y - 0.6, head.z + 0.6);
    renderer.setViewport(0, 0, S / pr, S / pr);
    renderer.setScissor(0, 0, S / pr, S / pr);
    renderer.setScissorTest(true);
    renderer.render(show.scene, cam);
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(canvas, 0, canvas.height - S, S, S, 0, 0, S, S);
    App.portraits[def.id] = c2.toDataURL('image/jpeg', 0.85);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
  }
}

// ---------------- screens & focus navigation ----------------
function go(name, opts = {}) {
  for (const el of document.querySelectorAll('.screen')) {
    const keep = !!(opts.keep && opts.keep.includes(el.id.slice(2)));
    el.classList.toggle('show', el.id === 's-' + name || keep);
  }
  App.screen = name;
  document.body.classList.toggle('in-battle', name === 'battle' || name === 'pause' || name === 'result');
  const scr = $('s-' + name);
  const first = scr && scr.querySelector('.focusable:not([disabled])');
  setFocus(scr && (scr.querySelector('.focusable.kfocus') || (opts.focus ? $(opts.focus) : first)));
}
let focused = null;
function setFocus(el) {
  if (focused) focused.classList.remove('kfocus');
  focused = el || null;
  if (focused) { focused.classList.add('kfocus'); focused.scrollIntoView?.({ block: 'nearest' }); }
}
function topScreen() {
  const shown = [...document.querySelectorAll('.screen.show')];
  return shown[shown.length - 1];
}
function navMove(dx, dy) {
  const scr = topScreen(); if (!scr) return;
  const items = [...scr.querySelectorAll('.focusable')].filter((e) => e.offsetParent !== null && !e.disabled);
  if (!items.length) return;
  if (!focused || !items.includes(focused)) { setFocus(items[0]); return; }
  const r0 = focused.getBoundingClientRect();
  const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
  let best = null, bs = 1e9;
  for (const e of items) {
    if (e === focused) continue;
    const r = e.getBoundingClientRect();
    const ex = r.left + r.width / 2 - cx, ey = r.top + r.height / 2 - cy;
    const along = ex * dx + ey * dy;
    if (along <= 4) continue;
    const perp = Math.abs(ex * dy - ey * dx);
    const sc = along + perp * 2.5;
    if (sc < bs) { bs = sc; best = e; }
  }
  if (best) { setFocus(best); audio.play('ui'); if (best.dataset.slot !== undefined) best.click(); }
}
function navConfirm() { if (focused) focused.click(); }
function navBack() {
  const scr = topScreen(); if (!scr) return;
  const b = scr.querySelector('[data-back]');
  if (b) b.click();
  else if (App.screen === 'pause') resume();
}

// ---------------- settings ----------------
async function loadSettings() {
  const s = await store.load('settings', null);
  if (s) App.settings = { ...clone(DEFAULTS), ...s, touch: { ...DEFAULTS.touch, ...(s.touch || {}) }, keys: s.keys || clone(DEFAULT_KEYS), pad: { ...DEFAULT_PAD, ...(s.pad || {}) } };
  applyCustomNames(App.settings.names);
  const r = await store.load('records', null);
  if (r) App.records = r;
}
function saveSettings() { store.save('settings', App.settings); }
function saveRecords() { store.save('records', App.records); }

function touchEnabled() {
  const m = App.settings.touch.mode;
  if (m === 'on') return true;
  if (m === 'off') return false;
  return isMobile() || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
}

// ---------------- title / menu ----------------
function toTitle() {
  if (!show.cur || show.def !== ROSTER[0]) showModel(ROSTER[0]);
  setPreview('idle');
  go('title');
  App.view = 'show';
}
function toMenu() {
  go('menu');
  App.view = 'show';
  audio.startMusic('menu');
  const r = App.records;
  const clears = Object.keys(r.arcadeClears || {}).map((k) => `${byId(k)?.name || k}: ${r.arcadeClears[k]}`).join(' / ');
  $('menu-record').innerHTML = `対戦数 ${r.matches || 0} ・ 勝利数 ${r.wins || 0}${clears ? '<br>ARCADE CLEAR — ' + clears : ''}`;
}

// ---------------- character select ----------------
const sel = { mode: 'cpu', step: 0, picks: [null, null], cursor: [0, 0], level: 'NORMAL', colors: [0, 0] };
function buildSelectGrid() {
  const g = $('sel-grid');
  g.innerHTML = '';
  const all = [...ROSTER.map((d) => ({ def: d })), ...LOCKED.map((l) => ({ locked: l }))];
  all.forEach((e, i) => {
    const b = document.createElement('button');
    b.className = 'slot focusable' + (e.locked ? ' locked' : '');
    b.dataset.slot = i;
    if (e.def) { b.style.backgroundImage = `url(${App.portraits[e.def.id]})`; b.innerHTML = `<span class="lbl">${e.def.name}</span>`; }
    else b.innerHTML = `<span class="lbl">${e.locked.type}</span>`;
    b.title = e.def ? e.def.name : `${e.locked.type} (開発中)`;
    b.onclick = () => {
      if (e.locked) { audio.play('cancel'); flashInfoLocked(e.locked); return; }
      if (sel.cursor[sel.step] !== i) sel.colors[sel.step] = 0;
      sel.cursor[sel.step] = i;
      audio.play('ui');
      updateSelect();
    };
    b.ondblclick = () => { if (!e.locked) $('sel-ok').click(); };
    g.appendChild(b);
  });
}
function flashInfoLocked(l) {
  $('sel-info').innerHTML = `<div class="nm">LOCKED</div><div class="jp">${l.type}</div><div class="desc">このキャラクターは開発中です。完全な技・アニメーション・当たり判定が完成するまで選択できません。</div>`;
}
function startSelect(mode) {
  sel.mode = mode; sel.step = 0; sel.picks = [null, null]; sel.colors = [0, 0];
  sel.level = App.settings.cpuLevel;
  audio.startMusic('select');
  go('select', { focus: null });
  App.view = 'show';
  updateSelect();
  setFocus(document.querySelector(`.slot[data-slot="${sel.cursor[0]}"]`));
}
function updateSelect() {
  const i = sel.cursor[sel.step];
  const def = ROSTER[i];
  document.querySelectorAll('.slot').forEach((s) => {
    const k = +s.dataset.slot;
    s.classList.toggle('on', k === sel.cursor[0] && (sel.step === 0 || sel.picks[0]));
    s.classList.toggle('on2', sel.step === 1 && k === sel.cursor[1]);
  });
  const p2label = sel.mode === 'vs' ? '2P' : 'CPU';
  $('sel-step').textContent = sel.step === 0 ? '1P' : p2label;
  $('sel-step').classList.toggle('p2', sel.step === 1);
  $('sel-title').textContent = sel.step === 0 ? 'SELECT YOUR KAIJU' : (sel.mode === 'vs' ? 'PLAYER 2 SELECT' : 'SELECT OPPONENT');
  if (def) {
    if (show.def !== def || show.alt !== sel.colors[sel.step]) { showModel(def, false, sel.colors[sel.step]); show.alt = sel.colors[sel.step]; }
    $('sel-color').textContent = 'カラー: ' + def.palettes[sel.colors[sel.step] % def.palettes.length].label;
    const st = def.stats;
    const bar = (n, v) => `<div class="stat">${n}<i style="--v:${v}"></i></div>`;
    $('sel-info').innerHTML = `<div class="nm">${def.name}</div><div class="jp">${def.title} ${def.jp}</div><div class="era">${def.era} ・ ${def.style}</div>
      <div class="desc">${def.desc}</div>
      ${bar('POWER', st.power)}${bar('SPEED', st.speed)}${bar('DEFENSE', st.defense)}${bar('REACH', st.reach)}
      <div class="sp">必殺技: <b>${def.specialNames.join(' / ')}</b><br>超必殺技: <b>${def.superName}</b><br>長所: ${def.strengths}<br>短所: ${def.weakness}</div>`;
  }
  // difficulty chips (cpu opponent selection / arcade)
  const showDiff = (sel.mode === 'cpu' && sel.step === 1) || sel.mode === 'arcade';
  const d = $('sel-diff');
  d.innerHTML = showDiff ? Object.keys(LEVELS).map((k) => `<button class="chip focusable ${k === sel.level ? 'on' : ''}" data-lv="${k}">${k}</button>`).join('') : '';
  d.querySelectorAll('.chip').forEach((c) => c.onclick = () => { sel.level = c.dataset.lv; App.settings.cpuLevel = sel.level; saveSettings(); audio.play('ui'); updateSelect(); });
}
function confirmSelect() {
  const def = ROSTER[sel.cursor[sel.step]];
  if (!def) return;
  audio.play('ok');
  sel.picks[sel.step] = def;
  if (sel.mode === 'arcade') { startArcade(def); return; }
  if (sel.step === 0) {
    sel.step = 1;
    sel.cursor[1] = sel.mode === 'training' ? sel.cursor[0] : (sel.cursor[0] + 1) % ROSTER.length;
    sel.colors[1] = sel.cursor[1] === sel.cursor[0] ? (sel.colors[0] + 1) % ROSTER[sel.cursor[1]].palettes.length : 0;
    updateSelect();
    setFocus(document.querySelector(`.slot[data-slot="${sel.cursor[1]}"]`));
    return;
  }
  startStageSelect();
}
function startStageSelect() {
  const list = $('stage-list');
  list.innerHTML = '';
  STAGES.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'stg focusable';
    b.style.background = `linear-gradient(180deg, ${s.sky[0]}, ${s.sky[1]} 55%, ${s.sky[2]})`;
    b.innerHTML = `<b>${s.en}</b><span>${s.name}</span>`;
    b.onclick = () => { audio.play('ok'); launch({ mode: sel.mode, defs: [sel.picks[0], sel.picks[1]], colors: [...sel.colors], stage: s, level: sel.level }); };
    list.appendChild(b);
  });
  const r = document.createElement('button');
  r.className = 'stg focusable';
  r.style.background = 'linear-gradient(135deg,#222,#444)';
  r.innerHTML = '<b>RANDOM</b><span>ランダム</span>';
  r.onclick = () => { audio.play('ok'); launch({ mode: sel.mode, defs: [sel.picks[0], sel.picks[1]], colors: [...sel.colors], stage: STAGES[Math.floor(Math.random() * STAGES.length)], level: sel.level }); };
  list.appendChild(r);
  go('stage');
}

// ---------------- story ----------------
const fmtStory = (t) => t.replace(/\{(\w+)\}/g, (_, id) => (byId(id) ? byId(id).jp : id));
function toStory() {
  const cleared = App.records.story || 0;
  const list = $('story-list');
  list.innerHTML = '';
  STORY.forEach((c, i) => {
    const b = document.createElement('button');
    const locked = i > cleared;
    b.className = 'chap focusable' + (locked ? ' locked' : '') + (i < cleared ? ' done' : '');
    const p = byId(c.player), o = byId(c.opp);
    b.innerHTML = locked ? `<b>${c.title.split(' ')[0]}</b><span>？？？</span>` :
      `<b>${c.title}</b><span>${c.sub}</span><i><img src="${App.portraits[p.id]}"> VS <img src="${App.portraits[o.id]}" style="${c.boss ? 'filter:hue-rotate(140deg) saturate(2)' : ''}"></i><em>${p.jp} vs ${o.jp}${c.boss ? ' Ω' : ''}${i < cleared ? ' ・ CLEAR' : ''}</em>`;
    b.onclick = () => { if (locked) { audio.play('cancel'); return; } audio.play('ok'); startChapter(i); };
    list.appendChild(b);
  });
  go('story');
  App.view = 'show';
  audio.startMusic('select');
}
function startChapter(i) {
  const c = STORY[i];
  App.view = 'show';
  showModel(byId(c.opp), !!c.boss); setPreview('idle');
  audio.startMusic('select');
  playTalk(c, c.intro, () => launch({ mode: 'story', chapter: i, defs: [byId(c.player), byId(c.opp)], stage: STAGES.find((s) => s.id === c.stage), level: c.level, boss: c.boss, hpMul: c.hpMul }));
}
function storyOutro(i) {
  const c = STORY[i];
  endBattle();
  App.view = 'show';
  showModel(byId(c.player)); setPreview('win');
  audio.startMusic('menu');
  App.records.story = Math.max(App.records.story || 0, i + 1);
  saveRecords();
  playTalk(c, c.outro, () => { if (i === STORY.length - 1) audio.play('fanfare'); toStory(); });
}
let talk = null;
function playTalk(chap, lines, done) {
  talk = { lines, i: 0, done, timer: null };
  $('talk-chapter').innerHTML = `<b>${chap.title}</b><span>${chap.sub}</span>`;
  go('talk', { focus: 'talk-box' });
  showLine();
}
function showLine() {
  const [who, raw] = talk.lines[talk.i];
  const def = byId(who);
  const text = fmtStory(raw);
  $('talk-name').textContent = who === 'narr' ? '' : def ? def.jp : who;
  $('talk-face').innerHTML = def ? `<img src="${App.portraits[def.id]}">` : '';
  $('talk-face').style.display = def ? '' : 'none';
  $('talk-box').classList.toggle('narr', who === 'narr');
  if (def && who !== 'narr') audio.roar({ ...def.voice, dur: 1.2, vol: 0.5 });
  const el = $('talk-text');
  clearInterval(talk.timer);
  let n = 0;
  talk.full = text; talk.typing = true;
  el.textContent = '';
  talk.timer = setInterval(() => { n += 1; el.textContent = text.slice(0, n); if (n >= text.length) { clearInterval(talk.timer); talk.typing = false; } }, 28);
}
function advanceTalk() {
  if (!talk) return;
  if (talk.typing) { clearInterval(talk.timer); talk.typing = false; $('talk-text').textContent = talk.full; return; }
  audio.play('ui');
  talk.i++;
  if (talk.i >= talk.lines.length) { const d = talk.done; clearInterval(talk.timer); talk = null; d(); return; }
  showLine();
}

// ---------------- arcade ----------------
function startArcade(def) {
  const others = ROSTER.filter((d) => d !== def);
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  others.length = Math.min(others.length, 4);
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  const order = others.map((d, i) => ({ def: d, stage: STAGES[i % 3 === 0 ? 0 : i % STAGES.length] }));
  order.push({ def: ROSTER[0], boss: true, stage: STAGES.find((s) => s.id === 'volcano') });
  App.arcade = { player: def, order, idx: 0, level: sel.level, color: sel.colors[0] };
  nextArcade();
}
function nextArcade() {
  const a = App.arcade;
  const e = a.order[a.idx];
  const lvKeys = Object.keys(LEVELS);
  const base = lvKeys.indexOf(a.level);
  const lv = e.boss ? 'VERY HARD' : lvKeys[Math.min(lvKeys.length - 1, base + Math.floor(a.idx / 2))];
  launch({ mode: 'arcade', defs: [a.player, e.def], colors: [a.color || 0, e.def === a.player ? ((a.color || 0) + 1) % e.def.palettes.length : 0], stage: e.stage, level: lv, boss: e.boss });
}

// ---------------- battle ----------------
let battle = null;
function launch(cfg) {
  App.lastLaunch = cfg;
  // VS splash
  const [d0, d1] = cfg.defs;
  const bossName = cfg.boss ? ' Ω' : '';
  $('vs-l').innerHTML = `<img src="${App.portraits[d0.id]}"><div class="nm">${d0.name}</div><div class="jp">${d0.title} ${d0.jp}</div>`;
  $('vs-r').innerHTML = `<img src="${App.portraits[d1.id]}" style="${cfg.boss ? 'filter:hue-rotate(140deg) saturate(2)' : ''}"><div class="nm">${d1.name}${bossName}</div><div class="jp">${cfg.boss ? '最終ボス' : d1.title} ${d1.jp}</div>`;
  const a = App.arcade;
  $('vs-stage').textContent = cfg.mode === 'story' ? `${STORY[cfg.chapter].title}  ・  ${cfg.stage.en}` : (cfg.mode === 'arcade' ? `STAGE ${a.idx + 1} / ${a.order.length}  ・  ` : '') + cfg.stage.en + (cfg.mode !== 'vs' && cfg.mode !== 'training' ? `  ・  CPU ${cfg.level}` : '');
  go('vs');
  audio.stopMusic();
  audio.play('explosion', { vol: 0.7, pitch: 0.7 });
  setTimeout(() => {
    const t0 = performance.now();
    startBattle(cfg);
    const wait = Math.max(0, 1800 - (performance.now() - t0));
    setTimeout(() => { go('battle'); App.view = 'battle'; audio.startMusic(cfg.boss ? 'boss' : cfg.stage.bgm); }, wait);
  }, 60);
}

function startBattle(cfg) {
  endBattle();
  const scene = new THREE.Scene();
  const fx = new FX(scene, q);
  fx.renderPR = renderer.getPixelRatio();
  const stage = new Stage(scene, cfg.stage, q, fx, audio, renderer);
  const camRig = new CameraRig(camera);
  camera.fov = 50; camera.updateProjectionMatrix();
  const two = cfg.mode === 'vs';
  const ctrls = [new HumanController(input, 0, two), null];
  if (two) ctrls[1] = new HumanController(input, 1, true);
  else if (cfg.mode === 'training') ctrls[1] = new AIController('NORMAL', App.trainingOpts.cpu);
  else ctrls[1] = new AIController(cfg.level);
  const cols = cfg.colors || [0, 0];
  if (cfg.defs[0] === cfg.defs[1] && cols[0] === cols[1] && !cfg.boss) cols[1] = (cols[0] + 1) % cfg.defs[1].palettes.length;
  const fopts = [{ alt: cols[0] }, cfg.boss ? { boss: true, hpMul: 1.35 * (cfg.hpMul || 1), dmgMul: 1.15 } : { alt: cols[1], hpMul: cfg.hpMul || 1 }];
  const match = new Match({
    scene, quality: q, fx, stage, audio, camRig, ctrls, defs: cfg.defs, fopts,
    rounds: App.settings.rounds, time: App.settings.time === 0 ? 0 : App.settings.time, training: cfg.mode === 'training',
    trainingOpts: App.trainingOpts, debug: cfg.mode === 'training' && App.trainingOpts.hitbox, voice: App.settings.voice,
    poll: () => input.poll(),
    onEnd: (res) => setTimeout(() => showResult(res), 2600),
  });
  battle = { scene, fx, stage, camRig, match, cfg };
  App.battle = battle;
  document.body.classList.toggle('touch-on', touchEnabled());
  touch.reset();
  // HUD static
  const names = match.fighters.map((f) => f.def.name + (f.boss ? ' Ω' : ''));
  $('nm0').textContent = names[0]; $('nm1').textContent = names[1];
  $('train-panel').classList.toggle('show', cfg.mode === 'training');
  if (cfg.mode === 'training') buildTrainingPanel();
  hudCache = {};
  // warm up shaders
  renderer.compile(scene, camera);
}
function endBattle() {
  if (!battle) return;
  battle.match.dispose();
  battle.stage.dispose();
  battle.fx.clear();
  battle.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  battle = null; App.battle = null;
}

let hudCache = {};
function setText(id, t) { if (hudCache[id] !== t) { hudCache[id] = t; $(id).textContent = t; } }
function updateHUD(dt) {
  const m = battle.match;
  m.fighters.forEach((f, i) => {
    const r = Math.max(0, f.hp / f.hpMax);
    const w = (r * 100).toFixed(1) + '%';
    if (hudCache['hp' + i] !== w) { hudCache['hp' + i] = w; $('hp' + i).style.width = w; $('hp' + i).classList.toggle('low', r < 0.25); if (f.state !== 'hit' && f.state !== 'air' && f.state !== 'block' || true) $('hpr' + i).style.width = w; }
    const mw = f.meter.toFixed(0) + '%';
    if (hudCache['mt' + i] !== mw) { hudCache['mt' + i] = mw; $('mt' + i).style.width = mw; $('mt' + i).parentElement.classList.toggle('full', f.meter >= 100); }
    const wins = Array.from({ length: m.roundsToWin }, (_, k) => `<b class="${k < f.wins ? 'on' : ''}"></b>`).join('');
    if (hudCache['w' + i] !== wins) { hudCache['w' + i] = wins; $('w' + i).innerHTML = wins; }
    const c = m.combo[i];
    const cb = $('cb' + i);
    if (c) {
      c.t -= dt;
      const html = `<b>${c.hits} HITS</b><small>${Math.round(c.dmg)} DAMAGE</small>`;
      if (hudCache['cb' + i] !== html) { hudCache['cb' + i] = html; cb.innerHTML = html; }
      cb.classList.add('show');
      if (c.t <= 0) m.combo[i] = null;
    } else cb.classList.remove('show');
  });
  if (touch) touch.setMeterReady(m.fighters[0].meter >= 100);
  setText('timer', m.training || m.roundTime === 0 ? '∞' : String(Math.ceil(m.timer)));
  setText('hud-round', m.training ? 'TRAINING' : `ROUND ${m.round}`);
  const b = m.banner;
  const bid = b ? b.id : 0;
  if (hudCache.banner !== bid) {
    hudCache.banner = bid;
    $('banner').className = 'banner ' + (b ? b.cls : '');
    $('banner').innerHTML = b ? `<div class="bt">${b.text}</div>${b.sub ? `<div class="bs">${b.sub}</div>` : ''}` : '';
  }
  for (const p of m.popups) {
    if (p.shown) continue;
    p.shown = true;
    const el = document.createElement('div');
    el.className = `pop s${p.side} ${p.cls || ''}`;
    el.textContent = p.text;
    $('popups').appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }
  $('dim').style.opacity = m.dim.toFixed(2);
  if (m.training) updateTrainingData();
}

// ---------------- training ----------------
App.trainingOpts = { cpu: 'stand', hitbox: true, infiniteMeter: true };
function buildTrainingPanel() {
  const o = App.trainingOpts;
  const p = $('train-panel');
  const cpuOpts = [['stand', '棒立ち'], ['guard', 'ガード'], ['crouch', 'しゃがみG'], ['cpu', 'CPU行動']];
  p.innerHTML = `<b>TRAINING</b>
    <div class="row">${cpuOpts.map(([k, l]) => `<button class="chip ${o.cpu === k ? 'on' : ''}" data-cpu="${k}">${l}</button>`).join('')}</div>
    <div class="row"><button class="chip ${o.hitbox ? 'on' : ''}" data-t="hitbox">当たり判定表示</button><button class="chip ${o.infiniteMeter ? 'on' : ''}" data-t="infiniteMeter">ゲージ無限</button><button class="chip" data-t="reset">位置リセット</button></div>
    <div class="data" id="train-data"></div>`;
  p.querySelectorAll('[data-cpu]').forEach((b) => b.onclick = () => { o.cpu = b.dataset.cpu; battle.match.ctrls[1].mode = o.cpu; buildTrainingPanel(); });
  p.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
    const k = b.dataset.t;
    if (k === 'reset') { const [a, c] = battle.match.fighters; a.resetRound(-9, 0); c.resetRound(9, 0); a.state = c.state = 'idle'; a.meter = c.meter = 100; battle.camRig.reset(a, c); }
    else { o[k] = !o[k]; if (k === 'hitbox') { battle.match.debug = o.hitbox; if (!o.hitbox) battle.match.debugObjs.forEach((d) => d && (d.visible = false)); } }
    buildTrainingPanel();
  });
}
let lastMoveInfo = '';
function updateTrainingData() {
  const m = battle.match, [a, b] = m.fighters;
  if (a.state === 'move' && a.move) {
    const mv = a.move;
    lastMoveInfo = `${mv.name || mv.id}\n発生 ${mv.startup}F  持続 ${mv.active}F  硬直 ${mv.recovery}F\n威力 ${mv.dmg ?? '-'}  属性 ${({ high: '上段', mid: '中段', low: '下段', throw: '投げ' })[mv.height] || mv.height || '-'}`;
  }
  const txt = `${lastMoveInfo}\nコンボ ${b.comboHits} HIT / ${Math.round(b.comboDmg)} DMG\n相手体力 ${Math.round(b.hp)}/${b.hpMax}\n状態 P1:${a.state} CPU:${b.state}`;
  setText('train-data', txt);
}

// ---------------- pause / result ----------------
function pause() {
  if (!battle || App.screen !== 'battle' || battle.match.phase === 'matchEnd') return;
  battle.match.paused = true;
  audio.stopLoops();
  go('pause', { keep: ['battle'] });
}
function resume() {
  if (!battle) return;
  battle.match.paused = false;
  go('battle');
}
function showResult(res) {
  if (!battle) return;
  const cfg = battle.cfg, m = battle.match;
  const w = m.fighters[res.winner];
  const playerWon = res.winner === 0;
  App.records.matches = (App.records.matches || 0) + 1;
  if (playerWon && cfg.mode !== 'vs') App.records.wins = (App.records.wins || 0) + 1;
  const label = cfg.mode === 'vs' ? `${res.winner + 1}P WIN` : playerWon ? 'YOU WIN' : 'YOU LOSE';
  $('res-win').innerHTML = `${label}<small>${w.def.name}${w.boss ? ' Ω' : ''} ・ ${res.wins[0]} - ${res.wins[1]}${res.perfect ? ' ・ PERFECT' : ''}</small>`;
  $('res-stats').innerHTML = `最大コンボ 1P: ${res.stats[0].maxCombo} HIT / 2P: ${res.stats[1].maxCombo} HIT<br>与ダメージ 1P: ${res.stats[0].dmgDealt} / 2P: ${res.stats[1].dmgDealt}`;
  const btns = [];
  if (cfg.mode === 'story') {
    if (playerWon) btns.push(['NEXT', 'ストーリーを進める', () => storyOutro(cfg.chapter)]);
    else { btns.push(['RETRY', 'もう一度挑戦', () => launch(App.lastLaunch)]); btns.push(['STORY', '章選択へ', () => { endBattle(); toStory(); }]); }
  } else if (cfg.mode === 'arcade') {
    const a = App.arcade;
    if (playerWon) {
      if (a.idx >= a.order.length - 1) {
        App.records.arcadeClears[a.player.id] = (App.records.arcadeClears[a.player.id] || 0) + 1;
        $('res-win').innerHTML = `ARCADE CLEAR!<small>${a.player.name} が最強の巨獣の座を手にした</small>`;
        btns.push(['MENU', 'メニューへ', () => { endBattle(); toMenu(); }]);
      } else btns.push(['NEXT BATTLE', `次の対戦 (${a.idx + 2}/${a.order.length})`, () => { a.idx++; nextArcade(); }]);
    } else {
      btns.push(['CONTINUE', 'コンティニュー', () => nextArcade()]);
      btns.push(['QUIT', 'メニューへ', () => { endBattle(); toMenu(); }]);
    }
  } else {
    btns.push(['REMATCH', '再戦', () => launch(App.lastLaunch)]);
    btns.push(['CHARACTER SELECT', 'キャラクター選択', () => { endBattle(); startSelect(cfg.mode); }]);
    btns.push(['MENU', 'メニューへ', () => { endBattle(); toMenu(); }]);
  }
  saveRecords();
  $('res-btns').innerHTML = '';
  for (const [t, s, fn] of btns) {
    const b = document.createElement('button');
    b.className = 'mi focusable'; b.innerHTML = `<b>${t}</b><span>${s}</span>`;
    b.onclick = () => { audio.play('ok'); fn(); };
    $('res-btns').appendChild(b);
  }
  go('result', { keep: ['battle'] });
}

// ---------------- how to play / move list ----------------
const DIR_LABEL = { '': '', f: '→', b: '←', d: '↓', u: '↑', dash: 'ダッシュ中' };
const BTN_LABEL = { L: '弱', H: '強', S: '必殺', G: '掴み', X: '超必殺' };
function moveListHTML(def) {
  const rows = [];
  for (const k in def.commands) {
    const id = def.commands[k];
    const mv = def.moves[id];
    if (!mv) continue;
    const [d, b] = k.includes('+') ? k.split('+') : ['', k];
    const h = ({ high: '上段', mid: '中段', low: '下段', throw: '投げ' })[mv.height] || '-';
    rows.push(`<tr><td class="cmd">${DIR_LABEL[d] || d} ${BTN_LABEL[b] || b}</td><td>${mv.name}</td><td>${h}</td><td>${mv.startup}F</td><td>${mv.dmg ? (mv.beam ? mv.dmg + '×N' : mv.dmg) : (mv.throw ? mv.throw.hitMove.dmg : (mv.proj ? mv.proj[0].dmg : '-'))}</td><td>${mv.super ? 'ゲージ100%' : mv.meterCost ? 'ゲージ' + mv.meterCost + '%' : mv.launch ? '浮かせ' : mv.knockdown ? 'ダウン' : mv.armor ? 'アーマー' : ''}</td></tr>`);
  }
  return `<table><tr><th>コマンド</th><th>技名</th><th>属性</th><th>発生</th><th>威力</th><th>特性</th></tr>${rows.join('')}</table>`;
}
function buildHowto(defId) {
  const k0 = App.settings.keys[0];
  const kn = (c) => c.replace('Key', '').replace('Arrow', '').replace('Numpad', 'Num');
  const def = byId(defId) || ROSTER[0];
  $('howto-body').innerHTML = `<div class="howto">
    <h3>BASIC</h3>
    <table>
      <tr><td>移動</td><td>左右で前進/後退、上下で奥/手前へサイドステップ(3D移動)。前を2回で<b>ダッシュ</b>、後ろ2回で<b>バックダッシュ</b></td><td class="cmd">${kn(k0.up)}${kn(k0.left)}${kn(k0.down)}${kn(k0.right)} / スティック</td></tr>
      <tr><td>ガード</td><td>ガードボタン、または後ろ入力。<b>立ちガードは上段・中段</b>、<b>しゃがみガード(↓+ガード)は下段</b>を防ぐ。側面・背後からの攻撃は防げない</td><td class="cmd">${kn(k0.B)} / RB</td></tr>
      <tr><td>回避</td><td>無敵時間つきの回避。↑/↓で奥/手前へ、←でバックステップ。直線的な光線や突進をかわせる</td><td class="cmd">${kn(k0.E)} / LB</td></tr>
      <tr><td>攻撃</td><td>弱/強/掴み/必殺。方向キーとの組み合わせで技が変化。ヒット中に次の技を入力するとコンボ(キャンセル)</td><td class="cmd">${kn(k0.L)} ${kn(k0.H)} ${kn(k0.G)} ${kn(k0.S)} / X Y A B</td></tr>
      <tr><td>超必殺技</td><td>SUPERゲージが100%で発動できる。攻撃を当てる/受けるとたまる</td><td class="cmd">${kn(k0.X)} / RT</td></tr>
      <tr><td>投げ抜け</td><td>掴まれた直後に掴みボタンで抜けられる</td><td class="cmd">${kn(k0.G)}</td></tr>
      <tr><td>受け身</td><td>ダウン中にボタンを押すと素早く起き上がる(起き上がり中は無敵)</td><td></td></tr>
      <tr><td>カウンター</td><td>相手の攻撃の出がかりを潰すとダメージ1.25倍＋硬直増加</td><td></td></tr>
      <tr><td>壁</td><td>ステージ端のビルに叩きつけると建物が崩壊し、追撃のチャンス</td><td></td></tr>
    </table>
    <p class="note">2P(キーボード): 矢印キー移動 / テンキー 4:弱 5:強 6:必殺 3:掴み 1:ガード 2:回避 0:超必殺。ゲームパッドは2台接続で1P/2Pに割り当て。設定画面で全キー変更可能。</p>
    <h3>MOVE LIST</h3>
    <div class="tabs">${ROSTER.map((d) => `<button class="chip focusable ${d === def ? 'on' : ''}" data-ml="${d.id}">${d.name}</button>`).join('')}</div>
    <div class="note">${def.name}(${def.style}) — ${def.strengths} / 短所: ${def.weakness}</div>
    ${moveListHTML(def)}
  </div>`;
  $('howto-body').querySelectorAll('[data-ml]').forEach((b) => b.onclick = () => { buildHowto(b.dataset.ml); setFocus(b); });
}

// ---------------- settings UI ----------------
function buildSettings() {
  const s = App.settings;
  const opt = (key, vals, labels) => `<div class="opts">${vals.map((v, i) => `<button class="chip focusable ${s[key] === v ? 'on' : ''}" data-k="${key}" data-v="${v}">${labels ? labels[i] : v}</button>`).join('')}</div>`;
  const kn = (c) => (c || '-').replace('Key', '').replace('Arrow', '↑').replace('Numpad', 'Num').replace('Digit', '');
  const keyRows = (p) => ['up', 'down', 'left', 'right', ...ACTIONS].map((a) => `<button class="kbtn focusable" data-kp="${p}" data-ka="${a}"><span>${ACTION_NAMES[a]}</span><i>${kn(s.keys[p][a])}</i></button>`).join('');
  const padRows = ACTIONS.map((a) => `<button class="kbtn focusable" data-pa="${a}"><span>${ACTION_NAMES[a]}</span><i>B${s.pad[a]}</i></button>`).join('');
  const t = s.touch;
  $('settings-body').innerHTML = `
  <div class="set-grp"><h3>GRAPHICS</h3>
    <div class="set-row"><span>画質プリセット<br><small class="note">現在: ${q.name} (変更はすぐ反映)</small></span>${opt('quality', ['AUTO', 'ULTRA', 'HIGH', 'MEDIUM', 'LOW'])}</div>
    <div class="set-row"><span>動的解像度(FPS維持)</span>${opt('dynRes', [true, false], ['ON', 'OFF'])}</div>
    <div class="set-row"><span>FPS表示</span>${opt('showFps', [true, false], ['ON', 'OFF'])}</div>
    <p class="note">ULTRA: 高性能PC向け(影2048・フルブルーム・最大パーティクル) / HIGH: 標準PC・高性能スマホ / MEDIUM: 一般的なスマホ / LOW: 低性能端末(影・ブルーム無効、演出軽量化)</p>
  </div>
  <div class="set-grp"><h3>RULES</h3>
    <div class="set-row"><span>制限時間</span>${opt('time', [30, 60, 99, 0], ['30秒', '60秒', '99秒', '無制限'])}</div>
    <div class="set-row"><span>勝利ラウンド数</span>${opt('rounds', [1, 2, 3], ['1本先取', '2本先取', '3本先取'])}</div>
    <div class="set-row"><span>CPU難易度(既定)</span>${opt('cpuLevel', Object.keys(LEVELS))}</div>
  </div>
  <div class="set-grp"><h3>SOUND</h3>
    <div class="set-row"><span>BGM音量</span><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-r="music"></div>
    <div class="set-row"><span>効果音音量</span><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-r="sfx"></div>
    <div class="set-row"><span>アナウンス音声</span>${opt('voice', [true, false], ['ON', 'OFF'])}</div>
  </div>
  <div class="set-grp"><h3>TOUCH CONTROLS</h3>
    <div class="set-row"><span>タッチ操作表示</span><div class="opts">${['auto', 'on', 'off'].map((v) => `<button class="chip focusable ${t.mode === v ? 'on' : ''}" data-tm="${v}">${{ auto: '自動', on: '常に表示', off: '非表示' }[v]}</button>`).join('')}</div></div>
    <div class="set-row"><span>ボタンサイズ</span><input type="range" min="0.7" max="1.5" step="0.05" value="${t.size}" data-tr="size"></div>
    <div class="set-row"><span>不透明度</span><input type="range" min="0.25" max="1" step="0.05" value="${t.opacity}" data-tr="opacity"></div>
    <div class="set-row"><span>ボタン位置(横)</span><input type="range" min="0" max="160" step="2" value="${t.offsetX}" data-tr="offsetX"></div>
    <div class="set-row"><span>ボタン位置(縦)</span><input type="range" min="0" max="140" step="2" value="${t.offsetY}" data-tr="offsetY"></div>
    <div class="set-row"><span>スティック位置</span><input type="range" min="0" max="160" step="2" value="${t.stickX}" data-tr="stickX"></div>
    <p class="note">スティックは画面左半分のどこに触れても出現します(フローティング)。ボタンは指をスライドして押し替え可能。超必殺ボタンはゲージ満タン時に点灯します。</p>
  </div>
  <div class="set-grp"><h3>CHARACTER NAMES</h3>
    <p class="note">怪獣の表示名を自由に変更できます(例: 家族で呼んでいる名前)。入力した名前はこの端末の中だけに保存され、ほかの人には表示されません。空欄にすると元の名前に戻ります。</p>
    ${ROSTER.map((d) => `<div class="set-row"><span>${d._orig.name}</span><div class="opts"><input class="nm-in" data-nid="${d.id}" data-nk="name" maxlength="24" placeholder="${d._orig.name}" value="${(s.names[d.id] || {}).name || ''}"><input class="nm-in" data-nid="${d.id}" data-nk="jp" maxlength="24" placeholder="${d._orig.jp}" value="${(s.names[d.id] || {}).jp || ''}"></div></div>`).join('')}
  </div>
  <div class="set-grp"><h3>KEYBOARD 1P</h3><div class="keymap">${keyRows(0)}</div></div>
  <div class="set-grp"><h3>KEYBOARD 2P</h3><div class="keymap">${keyRows(1)}</div></div>
  <div class="set-grp"><h3>GAMEPAD</h3><div class="keymap">${padRows}</div><p class="note">ボタンを選択後、ゲームパッドのボタンを押すと割り当てます(標準配置: X=弱 Y=強 B=必殺 A=掴み RB/LT=ガード LB=回避 RT=超必殺 START=ポーズ)。iPhoneはiOS対応のBluetoothコントローラーが利用できます。</p></div>
  <div class="set-grp"><button class="mi focusable" id="set-reset"><b>RESET</b><span>すべて初期設定に戻す</span></button></div>`;
  const body = $('settings-body');
  body.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
    const k = b.dataset.k; let v = b.dataset.v;
    if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(+v)) v = +v;
    s[k] = v; saveSettings(); audio.play('ui');
    if (k === 'quality') applyQuality();
    buildSettings(); setFocus(body.querySelector(`[data-k="${k}"][data-v="${b.dataset.v}"]`));
  });
  body.querySelectorAll('.nm-in').forEach((el) => el.oninput = () => {
    const n = s.names[el.dataset.nid] || (s.names[el.dataset.nid] = {});
    n[el.dataset.nk] = el.value;
    applyCustomNames(s.names); saveSettings(); buildSelectGrid();
  });
  body.querySelectorAll('[data-r]').forEach((r) => r.oninput = () => { s[r.dataset.r] = +r.value; audio.setVolumes(s.music, s.sfx); saveSettings(); });
  body.querySelectorAll('[data-tm]').forEach((b) => b.onclick = () => { t.mode = b.dataset.tm; saveSettings(); buildSettings(); });
  body.querySelectorAll('[data-tr]').forEach((r) => r.oninput = () => { t[r.dataset.tr] = +r.value; saveSettings(); touch.build(); });
  body.querySelectorAll('[data-kp]').forEach((b) => b.onclick = () => {
    b.classList.add('wait'); b.querySelector('i').textContent = '...';
    input.capture = (ev) => { if (ev.type === 'key' && ev.code !== 'Escape') { s.keys[+b.dataset.kp][b.dataset.ka] = ev.code; saveSettings(); } buildSettings(); };
  });
  body.querySelectorAll('[data-pa]').forEach((b) => b.onclick = () => {
    b.classList.add('wait'); b.querySelector('i').textContent = '...';
    const cap = (ev) => { if (ev.type === 'pad') { s.pad[b.dataset.pa] = ev.button; saveSettings(); } buildSettings(); };
    cap.pad = true;
    input.capture = cap;
  });
  $('set-reset').onclick = () => { App.settings = clone(DEFAULTS); input.settings = App.settings; saveSettings(); audio.setVolumes(App.settings.music, App.settings.sfx); applyQuality(); touch.settings = App.settings; touch.build(); applyCustomNames({}); buildSelectGrid(); buildSettings(); };
}
function applyQuality() {
  const nq = resolveQuality(App.settings.quality);
  if (q && nq.name === q.name) return;
  initRenderer();
  resize();
  buildShowroom();
  makePortraits();
  buildSelectGrid();
  show.cur = null;
  showModel(ROSTER[0]);
}

// ---------------- main loop ----------------
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsShow = 0, lowT = 0, highT = 0;
App.fpsLog = [];
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 1) {
    fpsShow = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    App.fpsLog.push(Math.round(fpsShow)); if (App.fpsLog.length > 120) App.fpsLog.shift();
    // dynamic resolution
    if (App.settings.dynRes && App.view === 'battle') {
      if (fpsShow < 50) { lowT++; highT = 0; } else if (fpsShow > 58) { highT++; lowT = 0; } else { lowT = highT = 0; }
      const pr = renderer.getPixelRatio();
      if (lowT >= 2 && pr > 0.6) { setPR(Math.max(0.6, pr - 0.15)); lowT = 0; }
      if (highT >= 5 && pr < q.pixelRatio) { setPR(Math.min(q.pixelRatio, pr + 0.1)); highT = 0; }
    }
  }
  $('fps').textContent = App.settings.showFps ? `${fpsShow.toFixed(0)} FPS ・ ${q.name} ・ x${renderer.getPixelRatio().toFixed(2)}` : '';
  menuGamepad();
  if (App.view === 'battle' && battle) {
    const m = battle.match;
    m.update(dt);
    const sdt = dt * m.timeScale * (m.hitstop > 0 ? 0.25 : 1);
    m.render(sdt, camera);
    battle.camRig.update(dt, m);
    const mid = new THREE.Vector3().addVectors(m.fighters[0].pos, m.fighters[1].pos).multiplyScalar(0.5);
    battle.stage.update(sdt, camera, mid);
    battle.fx.viewH = innerHeight;
    battle.fx.update(sdt, camera);
    renderer.toneMappingExposure = (battle.cfg.stage.exposure || 1) * (1 - m.dim * 0.45);
    if (bloom) bloom.strength = 0.55 + m.dim * 0.5;
    renderScene(battle.scene);
    if (App.screen === 'battle' || App.screen === 'pause' || App.screen === 'result') updateHUD(dt);
  } else if (show.scene) {
    updateShowroom(dt);
    renderer.toneMappingExposure = 1.0;
    if (bloom) bloom.strength = 0.5;
    renderScene(show.scene);
  }
}
function setPR(pr) {
  renderer.setPixelRatio(pr);
  if (composer) composer.setPixelRatio(pr);
  resize();
  if (battle) battle.fx.renderPR = pr;
}

// gamepad navigation for menus + pause
let padNavPrev = { x: 0, y: 0 };
let padRepeat = 0;
function menuGamepad() {
  if (!input) return;
  if (App.view === 'battle' && App.screen === 'battle') {
    // pause via start (check raw pads)
    const pads = input.pads();
    pads.forEach((p, i) => { const b = p.buttons[9]; const prev = App._startPrev?.[i]; if (b && b.pressed && !prev) pause(); (App._startPrev ||= [])[i] = b && b.pressed; });
    return;
  }
  const pads = input.pads();
  if (!pads.length) return;
  let x = 0, y = 0, a = false, b = false;
  App._padPrev ||= [];
  pads.forEach((p, i) => {
    const pr = App._padPrev[i] || [];
    const bt = (k) => p.buttons[k] && p.buttons[k].pressed;
    let ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    if (bt(14)) ax = -1; if (bt(15)) ax = 1; if (bt(12)) ay = -1; if (bt(13)) ay = 1;
    if (Math.abs(ax) > 0.6) x = Math.sign(ax); if (Math.abs(ay) > 0.6) y = Math.sign(ay);
    if (bt(0) && !pr[0]) a = true;
    if (bt(1) && !pr[1]) b = true;
    if (bt(9) && !pr[9] && App.screen === 'pause') resume();
    App._padPrev[i] = p.buttons.map((q2) => q2.pressed);
  });
  if (input.capture) return;
  if ((x || y) && (x !== padNavPrev.x || y !== padNavPrev.y || padRepeat <= 0)) { navMove(x, y); padRepeat = 14; }
  padRepeat--;
  padNavPrev = { x, y };
  if (a) { audio.init(); navConfirm(); }
  if (b) navBack();
}

// ---------------- wiring ----------------
function wire() {
  const startAudio = () => { audio.init(); audio.setVolumes(App.settings.music, App.settings.sfx); };
  window.addEventListener('pointerdown', startAudio, { once: false });
  window.addEventListener('keydown', startAudio);
  $('btn-start').onclick = () => { audio.init(); audio.play('ok'); toMenu(); };
  $('s-title').addEventListener('click', (e) => { if (e.target === $('s-title')) $('btn-start').click(); });
  document.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { audio.play('ok'); startSelect(b.dataset.mode); });
  document.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => {
    audio.play('ok');
    const g = b.dataset.go;
    if (g === 'howto') buildHowto(show.def?.id);
    if (g === 'settings') buildSettings();
    go(g);
  });
  // back buttons
  for (const id of ['s-howto', 's-settings', 's-credits']) $(id).querySelector('[data-back]').onclick = () => {
    audio.play('cancel');
    if (App.view === 'battle' && battle) go('pause', { keep: ['battle'] });
    else toMenu();
  };
  $('s-select').querySelector('[data-back]').onclick = () => {
    audio.play('cancel');
    if (sel.step === 1 && sel.mode !== 'arcade') { sel.step = 0; sel.picks[0] = null; updateSelect(); }
    else toMenu();
  };
  $('s-stage').querySelector('[data-back]').onclick = () => { audio.play('cancel'); go('select'); updateSelect(); };
  $('sel-ok').onclick = confirmSelect;
  $('btn-story').onclick = () => { audio.play('ok'); toStory(); };
  $('s-story').querySelector('[data-back]').onclick = () => { audio.play('cancel'); toMenu(); };
  $('talk-box').onclick = advanceTalk;
  $('talk-skip').onclick = () => { if (!talk) return; const d = talk.done; clearInterval(talk.timer); talk = null; audio.play('ok'); d(); };
  document.querySelectorAll('.pv[data-pv]').forEach((b) => b.onclick = () => { audio.play('ui'); setPreview(b.dataset.pv); });
  $('sel-color').onclick = () => { const def = ROSTER[sel.cursor[sel.step]]; if (!def) return; audio.play('ui'); sel.colors[sel.step] = (sel.colors[sel.step] + 1) % def.palettes.length; updateSelect(); };
  $('btn-pause').onclick = pause;
  $('p-resume').onclick = () => { audio.play('ok'); resume(); };
  $('p-moves').onclick = () => { buildHowto(battle?.cfg.defs[0].id); go('howto'); };
  $('p-restart').onclick = () => { audio.play('ok'); launch(App.lastLaunch); };
  $('p-quit').onclick = () => { audio.play('cancel'); endBattle(); toMenu(); };
  input.onKey((e) => {
    if (input.capture) return;
    if (e.target && e.target.tagName === 'INPUT') return;
    if (App.screen === 'battle') { if (e.code === 'Escape' || e.code === 'Enter' && false) pause(); return; }
    if (App.screen === 'boot') return;
    const k = e.code;
    if (k === 'ArrowUp') navMove(0, -1);
    else if (k === 'ArrowDown') navMove(0, 1);
    else if (k === 'ArrowLeft') navMove(-1, 0);
    else if (k === 'ArrowRight') navMove(1, 0);
    else if (k === 'Enter' || k === 'Space') { e.preventDefault(); navConfirm(); }
    else if (k === 'Escape' || k === 'Backspace') navBack();
  });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
}

// A shared link like  index.html#names=<json>  sets the player's display names on this device only.
function importNamesFromLink() {
  const m = location.hash.match(/names=([^&]+)/);
  if (!m) return;
  try {
    const data = JSON.parse(decodeURIComponent(m[1]));
    const names = {};
    for (const d of ROSTER) {
      const v = data[d.id];
      if (Array.isArray(v)) names[d.id] = { name: String(v[0] || ''), jp: String(v[1] || '') };
    }
    App.settings.names = { ...App.settings.names, ...names };
    applyCustomNames(App.settings.names);
    saveSettings();
    App.namesImported = Object.keys(names).length;
  } catch (e) { console.warn('bad names link', e); }
  history.replaceState(null, '', location.pathname + location.search);
}

// ---------------- boot ----------------
async function boot() {
  const msg = (t) => { $('boot-msg').textContent = t; };
  try {
    msg('LOADING SETTINGS…');
    await loadSettings();
    importNamesFromLink();
    initRenderer();
    resize();
    input = new Input(App.settings);
    touch = new TouchControls($('touch'), App.settings);
    input.touch = touch;
    msg('BUILDING KAIJU…');
    await new Promise((r) => setTimeout(r, 30));
    buildShowroom();
    makePortraits();
    buildSelectGrid();
    wire();
    showModel(ROSTER[0]);
    requestAnimationFrame(loop);
    toTitle();
    if (App.namesImported) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = `${App.namesImported}体の怪獣の名前を設定しました`; document.body.appendChild(t); setTimeout(() => t.remove(), 4000); }
    if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.match(/^(localhost|127\.)/)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    App.ready = true;
  } catch (e) {
    console.error(e);
    msg('ERROR: ' + e.message);
    App.error = e;
  }
}
boot();

// test hooks
App.api = {
  toStory, startChapter, STORY,
  // test helpers: run the simulation headlessly
  cpuVsCpu(level = 'HARD') { battle.match.ctrls[0] = new AIController(level); },
  simulate(n) { const m = battle.match; for (let i = 0; i < n; i++) { m.step(); if (m.phase === 'matchEnd') break; } return { phase: m.phase, frame: m.frame, round: m.round, hp: m.fighters.map((f) => Math.round(f.hp)), wins: m.fighters.map((f) => f.wins), st: m.fighters.map((f) => f.state) }; },
  launch, startSelect, toMenu, go, STAGES, ROSTER, pause, resume, showResult, get battle() { return battle; } };
