// マッハ突破 — 音速の壁を突き破る3Dフライトゲーム
import * as THREE from 'three';

// ====== 画面 ======
const glCv = document.getElementById('gl'), ui = document.getElementById('ui'), ctx = ui.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas: glCv, antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, .5, 16000);
let W, H, DPR;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
  ui.width = Math.round(W * DPR); ui.height = Math.round(H * DPR);
  camera.aspect = W / H; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const FONT_T = '"Dela Gothic One","Hiragino Sans","Yu Gothic",sans-serif';
const FONT_B = '"Zen Kaku Gothic New","Hiragino Sans","Yu Gothic",sans-serif';
const SOUND = 340; // m/s = マッハ1
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ====== 保存 ======
const store = {
  get(k, d) { try { const v = localStorage.getItem('mach.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('mach.' + k, JSON.stringify(v)); } catch (e) {} }
};
let bestDist = store.get('bestDist', 0), bestMach = store.get('bestMach', 0);

// ====== 音 ======
let AC = null, muted = store.get('muted', false), engine = null, noiseBuf = null;
const muteBtn = document.getElementById('mute');
function syncMute() { muteBtn.textContent = muted ? '🔇' : '🔊'; }
syncMute();
muteBtn.addEventListener('pointerdown', e => e.stopPropagation());
muteBtn.addEventListener('click', e => {
  e.stopPropagation(); muted = !muted; store.set('muted', muted); syncMute();
  if (muted) stopEngine(); else { ac(); if (state === 'play') startEngine(); }
});
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  if (AC && !noiseBuf) {
    const n = AC.sampleRate * 2; noiseBuf = AC.createBuffer(1, n, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return AC;
}
function tone(f, d, type = 'sine', vol = .12, slide = 0, delay = 0) {
  if (muted || !AC) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + .02);
}
function noise(d, freq, vol, delay = 0, freqEnd = 0) {
  if (muted || !AC) return;
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  s.connect(f).connect(g).connect(AC.destination); s.start(t); s.stop(t + d + .05);
}
function boomSnd() { // ソニックブームは「ドドン」と2回鳴る（N波）
  noise(1.3, 260, 1.1, 0, 60); tone(70, .9, 'sine', .9, -45);
  noise(1.1, 220, .9, .13, 50); tone(60, .8, 'sine', .7, -35, .13);
}
function startEngine() {
  if (muted || !AC || engine) return;
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  const o = AC.createOscillator(), og = AC.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = 'lowpass'; f.frequency.value = 400; g.gain.value = 0;
  o.type = 'sawtooth'; o.frequency.value = 55; og.gain.value = .03;
  s.connect(f); o.connect(og).connect(f); f.connect(g).connect(AC.destination);
  s.start(); o.start(); engine = { s, f, g, o };
}
function stopEngine() {
  if (!engine) return;
  try { engine.s.stop(); engine.o.stop(); } catch (e) {}
  engine = null;
}
function updateEngine(mach, boost) {
  if (!engine) return;
  const t = AC.currentTime, sup = mach >= 1; // 音速を超えると自分の音を追い越して、こもる
  const fr = (300 + Math.min(mach, 6) * 450 + (boost ? 900 : 0)) * (sup ? .35 : 1);
  engine.f.frequency.setTargetAtTime(fr, t, .08);
  engine.g.gain.setTargetAtTime((sup ? .09 : .2) + (boost ? .12 : 0), t, .1);
  engine.o.frequency.setTargetAtTime(50 + Math.min(mach, 8) * 14, t, .2);
}
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

// ====== ライト・空 ======
const hemi = new THREE.HemisphereLight(0xdcefff, 0x6d5a3c, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dc, 1.7);
sun.position.set(-.6, 1, .35); scene.add(sun);
scene.fog = new THREE.Fog(0x8fc8ff, 300, 3000);
scene.background = new THREE.Color(0x8fc8ff);
const SKY = [
  [0, new THREE.Color(0x9ad0ff)], [2, new THREE.Color(0x5c8fe6)], [4, new THREE.Color(0x3e4cb8)],
  [6, new THREE.Color(0x3a1f6e)], [8, new THREE.Color(0x14102e)], [10, new THREE.Color(0x03040b)],
];
const skyCol = new THREE.Color();
function skyAt(m) {
  for (let i = 1; i < SKY.length; i++) {
    if (m <= SKY[i][0]) { const a = SKY[i - 1], b = SKY[i]; return skyCol.copy(a[1]).lerp(b[1], (m - a[0]) / (b[0] - a[0])); }
  }
  return skyCol.copy(SKY[SKY.length - 1][1]);
}
// 星（マッハ6あたりから見えてくる）
const starGeo = new THREE.BufferGeometry(), starPos = [];
for (let i = 0; i < 900; i++) {
  const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * .45;
  starPos.push(Math.cos(th) * Math.sin(ph) * 9000, Math.cos(ph) * 9000 - 600, Math.sin(th) * Math.sin(ph) * 9000);
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
const stars = new THREE.Points(starGeo, starMat); scene.add(stars);

// ====== 地面 ======
function groundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c9a46c'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = Math.random() < .5 ? 'rgba(120,85,45,.18)' : 'rgba(255,235,190,.16)';
    const s = 2 + Math.random() * 7; g.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  g.fillStyle = 'rgba(95,62,30,.55)'; g.fillRect(0, 0, 256, 5); g.fillRect(0, 0, 5, 256);
  g.fillStyle = 'rgba(95,62,30,.25)'; g.fillRect(0, 126, 256, 3); g.fillRect(126, 0, 3, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const TILE = 90, GSIZE = 30000;
const gTex = groundTexture(); gTex.repeat.set(GSIZE / TILE, GSIZE / TILE);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(GSIZE, GSIZE), new THREE.MeshLambertMaterial({ map: gTex }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);

// ====== 機体 ======
function buildJet() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe9edf2, metalness: .5, roughness: .35 });
  const red = new THREE.MeshStandardMaterial({ color: 0xe0262f, metalness: .4, roughness: .4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: .7, roughness: .4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b3d7a, metalness: .9, roughness: .1 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 14, 14).rotateX(Math.PI / 2), white); g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6, 14).rotateX(-Math.PI / 2), red); nose.position.z = -10; g.add(nose);
  const cock = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), glass); cock.scale.set(.85, .7, 2.3); cock.position.set(0, 1, -3.5); g.add(cock);
  const ws = new THREE.Shape(); ws.moveTo(0, -4); ws.lineTo(9.5, 5); ws.lineTo(-9.5, 5); ws.closePath();
  const wing = new THREE.Mesh(new THREE.ExtrudeGeometry(ws, { depth: .35, bevelEnabled: false }).rotateX(Math.PI / 2), white);
  wing.position.set(0, -.2, 1); g.add(wing);
  const ts = new THREE.Shape(); ts.moveTo(0, 0); ts.lineTo(4.5, 0); ts.lineTo(4.5, .8); ts.lineTo(3.4, 4.6); ts.lineTo(2.3, 4.6); ts.closePath();
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(ts, { depth: .3, bevelEnabled: false }).rotateY(-Math.PI / 2), red);
  fin.position.set(.15, .8, 2.4); g.add(fin);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(19.2, .38, 1.1), red); stripe.position.set(0, -.18, 5.4); g.add(stripe);
  const noz = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 1.6, 14, 1, true).rotateX(Math.PI / 2), dark); noz.position.z = 7.6; g.add(noz);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, .5), flameMat);
  flame.position.z = 8.2; g.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(.6, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, .5), coreMat);
  core.position.z = 8.2; g.add(core);
  // ベイパーコーン（音速付近で機体のまわりにできる白い雲）
  const vaporMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const vapor = new THREE.Mesh(new THREE.ConeGeometry(11, 16, 32, 1, true).rotateX(-Math.PI / 2), vaporMat);
  vapor.position.z = 4; g.add(vapor);
  return { g, flame, core, vapor, vaporMat };
}
const jet = buildJet(); scene.add(jet.g);

// ====== スピード線 ======
const LINES = 260, lineData = new Float32Array(LINES * 3), lineGeo = new THREE.BufferGeometry();
const linePos = new Float32Array(LINES * 6);
lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false });
const speedLines = new THREE.LineSegments(lineGeo, lineMat); speedLines.frustumCulled = false; scene.add(speedLines);
function resetLine(i, z) {
  let x, y;
  do { x = rand(-70, 70); y = rand(-45, 45); } while (Math.abs(x) < 10 && Math.abs(y) < 7);
  lineData[i * 3] = x; lineData[i * 3 + 1] = y; lineData[i * 3 + 2] = z;
}
for (let i = 0; i < LINES; i++) resetLine(i, rand(-520, 20));

// ====== 障害物 ======
const X_LIM = 240, Y_MAX = 270, PR = 4.5; // PR = 機体の当たり判定半径
const pillarGeo = new THREE.CylinderGeometry(1, 1.2, 1, 9).translate(0, .5, 0);
const coneGeo = new THREE.ConeGeometry(1, 1, 7).translate(0, .5, 0);
const rockMats = [0xa8714a, 0x8f5d3d, 0xb98a5a, 0x7a4f37].map(c => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
const farMats = [0x9a7d64, 0x87705f].map(c => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
const ringGeo = new THREE.TorusGeometry(26, 2.4, 8, 36);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x4ff3ff });
const ringGlowMat = new THREE.MeshBasicMaterial({ color: 0x4ff3ff, transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const ringGlowGeo = new THREE.CircleGeometry(24, 32);
function stripeTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const g = c.getContext('2d'); g.fillStyle = '#ffcf1f'; g.fillRect(0, 0, 64, 32);
  g.fillStyle = '#1b1b1b'; g.beginPath(); g.moveTo(0, 32); g.lineTo(16, 0); g.lineTo(40, 0); g.lineTo(24, 32); g.fill();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(22, 1); return t;
}
const BEAM_W = 2 * X_LIM + 220, BEAM_T = 30;
const beamGeo = new THREE.BoxGeometry(BEAM_W, BEAM_T, 14);
const beamMat = new THREE.MeshLambertMaterial({ map: stripeTex() });
const towerGeo = new THREE.BoxGeometry(40, 1, 40).translate(0, .5, 0);
const towerMat = new THREE.MeshLambertMaterial({ color: 0x55606e });

let objs = [];
function addMesh(geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); scene.add(m); return m;
}
function addPillar(x, z, r, h = 900) {
  const m = addMesh(pillarGeo, rockMats[(Math.random() * rockMats.length) | 0], x, -2, z, r, h, r);
  m.rotation.y = Math.random() * 6;
  objs.push({ type: 'pillar', m, x, z, r, top: h - 2 });
}
function addBeam(z, y) {
  const m = addMesh(beamGeo, beamMat, 0, y + BEAM_T / 2, z);
  const t1 = addMesh(towerGeo, towerMat, -BEAM_W / 2 - 15, 0, z, 1, 700, 1);
  const t2 = addMesh(towerGeo, towerMat, BEAM_W / 2 + 15, 0, z, 1, 700, 1);
  objs.push({ type: 'beam', m, extra: [t1, t2], z, y });
}
function addRing(x, y, z) {
  const m = addMesh(ringGeo, ringMat, x, y, z);
  const glow = new THREE.Mesh(ringGlowGeo, ringGlowMat); m.add(glow);
  objs.push({ type: 'ring', m, x, y, z });
}
function addDeco(z) {
  for (const side of [-1, 1]) {
    const x = side * rand(300, 1100), big = Math.random() < .5;
    const r = big ? rand(40, 110) : rand(15, 45), h = big ? rand(80, 380) : rand(40, 160);
    const m = addMesh(Math.random() < .4 ? coneGeo : pillarGeo, farMats[(Math.random() * 2) | 0], x, -2, z + rand(-30, 30), r, h, r);
    m.rotation.y = Math.random() * 6;
    objs.push({ type: 'deco', m, z: m.position.z });
  }
}
function removeObj(o) {
  scene.remove(o.m);
  if (o.extra) for (const e of o.extra) scene.remove(e);
}
function clearObjs() { for (const o of objs) removeObj(o); objs = []; }

function spawnPattern(z) {
  const d = clamp(P.dist / 60000, 0, 1), r = Math.random();
  if (r < .42) { // 岩の柱
    const n = 1 + ((Math.random() * (2 + d * 3)) | 0);
    for (let i = 0; i < n; i++) {
      const tall = Math.random() < .7;
      addPillar(rand(-X_LIM, X_LIM), z + rand(-60, 60), rand(14, 32), tall ? 900 : rand(50, 140));
    }
    if (Math.random() < .35) addRing(rand(-180, 180), rand(40, 160), z - 90);
  } else if (r < .62) { // 柱の壁＋すき間
    const gapX = rand(-170, 170), gapW = 120 - d * 45;
    for (let x = -X_LIM - 30; x <= X_LIM + 30; x += 52) if (Math.abs(x - gapX) > gapW / 2 + 22) addPillar(x + rand(-6, 6), z, 22);
    addRing(gapX, rand(40, 140), z);
  } else if (r < .78) { // 横たわる鉄骨（上か下をくぐる）
    const y = rand(55, 165); addBeam(z, y);
    addRing(rand(-150, 150), Math.random() < .5 ? y - 35 : y + BEAM_T + 35, z - 60);
  } else { // リングの列
    let x = rand(-150, 150), y = rand(40, 170);
    const dx = rand(-35, 35), dy = rand(-15, 15), n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      addRing(clamp(x, -X_LIM + 30, X_LIM - 30), clamp(y, 35, Y_MAX - 40), z - i * 110);
      x += dx; y += dy;
    }
  }
}

// ====== 爆発 ======
const fireMat = new THREE.MeshBasicMaterial({ color: 0xffa13a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
const fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), fireMat); fireball.visible = false; scene.add(fireball);
const debrisGeo = new THREE.BoxGeometry(1.2, .5, 2);
const debrisMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: .4, roughness: .5 });
let debris = [];
function explode(pos) {
  fireball.visible = true; fireball.position.copy(pos); fireball.scale.setScalar(1); fireMat.opacity = 1;
  for (let i = 0; i < 26; i++) {
    const m = addMesh(debrisGeo, i % 4 ? debrisMat : jet.flame.material.clone(), pos.x, pos.y, pos.z);
    debris.push({ m, v: new THREE.Vector3(rand(-40, 40), rand(10, 60), rand(-60, 30)), s: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)) });
  }
}
function clearDebris() { for (const d of debris) scene.remove(d.m); debris = []; fireball.visible = false; }

// ====== 状態 ======
let state = 'title', stateT = 0;
const P = { x: 0, y: 60, z: 0, v: 180, vx: 0, vy: 0, fuel: 100, boosting: false, dist: 0, maxMach: 0, rings: 0, machInt: 0, nextZ: -600, nextDeco: 0 };
let boomT = 0, boomN = 0, shake = 0, flash = 0, msgs = [];
const camPos = new THREE.Vector3(0, 70, 40);
function say(text, color = '#fff', size = 1) { msgs.push({ text, color, size, t: 0 }); }

const MACH_MSG = { 1: '音速突破！', 2: '超音速！', 3: '弾丸より速い', 4: 'ジェット旅客機の5倍', 5: '極超音速！', 7: '空気が燃えてきた', 10: 'もはや隕石', 15: '宇宙船なみ', 20: '光は…まだ遠い', 30: '物理法則に謝って' };
function rankFor(m) {
  if (m < 1) return '亜音速パイロット';
  if (m < 2) return '音の壁を越えし者';
  if (m < 3) return '超音速パイロット';
  if (m < 5) return 'マッハの申し子';
  if (m < 8) return '極超音速の鬼';
  if (m < 12) return '人間をやめた人';
  return '流れ星';
}

function reset(playing) {
  clearObjs(); clearDebris();
  Object.assign(P, { x: 0, y: 60, z: 0, v: playing ? 200 : 170, vx: 0, vy: 0, fuel: 100, boosting: false, dist: 0, maxMach: 0, rings: 0, machInt: 0, nextZ: -700, nextDeco: 0 });
  boomT = 0; shake = 0; flash = 0; msgs = [];
  jet.g.visible = true;
  camPos.set(0, 70, 40);
}
function startGame() {
  ac(); reset(true); state = 'play'; stateT = 0;
  boostBtn.style.display = 'block';
  startEngine(); tone(440, .12, 'square', .06); tone(660, .18, 'square', .06, 0, .1);
  say('BOOSTで加速！', '#ffd27a', .8);
}
function crash() {
  state = 'crash'; stateT = 0; P.boosting = false; boostBtn.style.display = 'none'; boostBtn.classList.remove('on');
  jet.g.visible = false; explode(jet.g.position);
  stopEngine(); noise(2, 1200, 1, 0, 80); tone(120, 1.2, 'sawtooth', .25, -90); buzz([60, 40, 200]);
  shake = 4; flash = .8;
  if (P.dist > bestDist) { bestDist = P.dist; store.set('bestDist', bestDist); P.newBest = true; } else P.newBest = false;
  if (P.maxMach > bestMach) { bestMach = P.maxMach; store.set('bestMach', bestMach); }
}

// ====== 入力 ======
const keys = new Set();
let joy = null, boostHeld = false;
const boostBtn = document.getElementById('boost');
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys.add(e.code);
  if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) tapAnywhere();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); joy = null; boostHeld = false; });
function tapAnywhere() {
  if (state === 'title') startGame();
  else if (state === 'over' && stateT > .8) startGame();
}
addEventListener('pointerdown', e => {
  if (state !== 'play') { tapAnywhere(); return; }
  if (!joy) joy = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY };
});
addEventListener('pointermove', e => { if (joy && joy.id === e.pointerId) { joy.x = e.clientX; joy.y = e.clientY; } });
const endJoy = e => { if (joy && joy.id === e.pointerId) joy = null; };
addEventListener('pointerup', endJoy); addEventListener('pointercancel', endJoy);
boostBtn.addEventListener('pointerdown', e => {
  e.stopPropagation(); e.preventDefault();
  if (state !== 'play') { tapAnywhere(); return; }
  boostHeld = true; boostBtn.classList.add('on');
  try { boostBtn.setPointerCapture(e.pointerId); } catch (_) {}
});
const endBoost = e => { e.stopPropagation(); boostHeld = false; boostBtn.classList.remove('on'); };
boostBtn.addEventListener('pointerup', endBoost); boostBtn.addEventListener('pointercancel', endBoost);
boostBtn.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('contextmenu', e => e.preventDefault());

function joyRadius() { return Math.max(50, Math.min(W, H) * .12); }
function readInput() {
  let ix = 0, iy = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) ix -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) ix += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) iy += 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) iy -= 1;
  if (joy) {
    const R = joyRadius();
    ix += clamp((joy.x - joy.sx) / R, -1, 1); iy += clamp(-(joy.y - joy.sy) / R, -1, 1);
  }
  const boost = boostHeld || keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight');
  return { ix: clamp(ix, -1, 1), iy: clamp(iy, -1, 1), boost };
}

// ====== 更新 ======
function update(dt) {
  stateT += dt;
  for (const m of msgs) m.t += dt;
  msgs = msgs.filter(m => m.t < 2.2);
  boomT = Math.max(0, boomT - dt * .9); flash = Math.max(0, flash - dt * 2.2); shake = Math.max(0, shake - dt * 3);

  if (state === 'play') updatePlay(dt);
  else if (state === 'title') {
    // タイトルは自動操縦でのんびり飛ぶ
    const t = stateT;
    P.v = 170; P.x = Math.sin(t * .5) * 60; P.y = 70 + Math.sin(t * .8) * 15;
    P.vx = Math.cos(t * .5) * 30; P.vy = Math.cos(t * .8) * 12;
    P.z -= P.v * dt;
    spawnDeco();
  } else if (state === 'crash' || state === 'over') {
    fireball.scale.setScalar(1 + Math.min(stateT, 1.2) * 45); fireMat.opacity = Math.max(0, 1 - stateT * .8);
    fireMat.color.setHSL(.08 - stateT * .03, 1, .55);
    for (const d of debris) {
      d.v.y -= 50 * dt; d.m.position.addScaledVector(d.v, dt);
      if (d.m.position.y < .5) { d.m.position.y = .5; d.v.multiplyScalar(.5); d.v.y = Math.abs(d.v.y) * .4; }
      d.m.rotation.x += d.s.x * dt; d.m.rotation.y += d.s.y * dt; d.m.rotation.z += d.s.z * dt;
    }
    if (state === 'crash' && stateT > 1.6) { state = 'over'; stateT = 0; }
  }

  // 背後に流れたものを片付ける
  objs = objs.filter(o => {
    if (o.got) return false;
    if (o.m.position.z > P.z + 80 && state !== 'crash' && state !== 'over') { removeObj(o); return false; }
    return true;
  });
  for (const o of objs) if (o.type === 'ring') o.m.rotation.z += dt * 1.5;
}

function spawnDeco() {
  const ahead = fogFar() + 400;
  while (P.nextDeco > P.z - ahead) { addDeco(P.nextDeco); P.nextDeco -= 60 + P.v * .12; }
}
function fogFar() { return 900 + P.v * 2.4; }

function updatePlay(dt) {
  const inp = readInput();
  // 加速
  const canBoost = inp.boost && P.fuel > 0;
  P.boosting = canBoost;
  if (canBoost) P.fuel = Math.max(0, P.fuel - 30 * dt);
  else P.fuel = Math.min(100, P.fuel + 3 * dt);
  P.v += (7 + (canBoost ? 150 + P.v * .04 : 0)) * dt;
  const mach = P.v / SOUND;
  P.maxMach = Math.max(P.maxMach, mach);

  // 操縦（速いほど横移動も速くなる）
  const latMax = 75 + P.v * .065, vertMax = 55 + P.v * .045;
  P.vx += (inp.ix * latMax - P.vx) * Math.min(1, dt * 4.5);
  P.vy += (inp.iy * vertMax - P.vy) * Math.min(1, dt * 4.5);

  // 高速でもすり抜けないよう細かく刻んで判定
  const steps = Math.max(1, Math.ceil(P.v * dt / 8)), h = dt / steps;
  for (let s = 0; s < steps; s++) {
    const pz0 = P.z;
    P.x += P.vx * h; P.y += P.vy * h; P.z -= P.v * h; P.dist += P.v * h;
    if (Math.abs(P.x) > X_LIM) { P.x = Math.sign(P.x) * X_LIM; P.vx = 0; }
    if (P.y > Y_MAX) { P.y = Y_MAX; P.vy = Math.min(0, P.vy); }
    if (P.y < 3) { P.y = 3; crash(); return; }
    for (const o of objs) {
      if (o.type === 'deco') continue;
      const dz = o.z - P.z;
      if (dz > 60 || dz < -60) continue;
      if (o.type === 'pillar') {
        const dx = P.x - o.x, rr = o.r + PR;
        if (dx * dx + dz * dz < rr * rr && P.y - 1 < o.top) { crash(); return; }
      } else if (o.type === 'beam') {
        if (Math.abs(dz) < 7 + PR && P.y + 2 > o.y && P.y - 2 < o.y + BEAM_T) { crash(); return; }
      } else if (o.type === 'ring' && !o.got && pz0 >= o.z && P.z < o.z) {
        const dx = P.x - o.x, dy = P.y - o.y;
        if (dx * dx + dy * dy < 25 * 25) collectRing(o);
      }
    }
  }

  // マッハの節目でソニックブーム
  const mi = Math.floor(P.v / SOUND);
  if (mi > P.machInt) { P.machInt = mi; sonicBoom(mi); }

  // 前方に障害物を生やす
  const ahead = fogFar() + 300;
  while (P.nextZ > P.z - ahead) { spawnPattern(P.nextZ); P.nextZ -= 170 + P.v * .55; }
  spawnDeco();
  updateEngine(mach, canBoost);
}
function collectRing(o) {
  o.got = true; removeObj(o);
  P.rings++; P.fuel = Math.min(100, P.fuel + 30); P.v += 30;
  tone(880, .15, 'triangle', .14); tone(1320, .22, 'triangle', .12, 0, .07);
  flash = Math.max(flash, .12);
}
function sonicBoom(n) {
  boomT = 1; boomN = n; shake = 3.2; flash = .9;
  boomSnd(); buzz(n === 1 ? [120, 60, 120] : 80);
  if (MACH_MSG[n]) say(MACH_MSG[n], '#ffe28a', 1);
  if (n === 1) setTimeout(() => { if (state === 'play') say('自分の音を追い越した…', '#cfe6ff', .6); }, 1300);
}

// ====== 描画（3D） ======
const tmpV = new THREE.Vector3(), look = new THREE.Vector3();
function render3D(dt, now) {
  const mach = P.v / SOUND;
  const latMax = 75 + P.v * .065, vertMax = 55 + P.v * .045;
  // 機体
  jet.g.position.set(P.x, P.y, P.z);
  jet.g.rotation.set(clamp(P.vy / vertMax, -1, 1) * .35, 0, -clamp(P.vx / latMax, -1, 1) * .85, 'YXZ');
  const bl = P.boosting ? 9 + Math.random() * 4 : 3 + Math.random() * .8;
  jet.flame.scale.set(1, 1, bl); jet.core.scale.set(1, 1, bl * .6);
  jet.flame.material.color.setHex(P.boosting ? 0xff6a1a : 0xff9a3a);
  // ベイパーコーン：マッハ1手前〜直後、そしてブームの瞬間
  const near = Math.max(0, 1 - Math.abs(mach - .99) / .07);
  const vo = Math.max(near * .3, boomT * .45);
  jet.vaporMat.opacity = vo; jet.vapor.visible = vo > .01 && jet.g.visible;
  jet.vapor.scale.setScalar(1 + (1 - boomT) * .15 + Math.sin(now * 40) * .02);

  // カメラ
  const crashed = state === 'crash' || state === 'over';
  const pull = crashed ? Math.min(stateT + (state === 'over' ? 1.6 : 0), 2) : 0; // 墜落したら引いて見せる
  const back = 30 + Math.min(mach, 6) * 2 + pull * 70;
  camPos.x += (P.x - camPos.x) * Math.min(1, dt * 7);
  camPos.y += (P.y + 8 + pull * 45 - camPos.y) * Math.min(1, dt * 7);
  camPos.z = P.z + back;
  camera.position.copy(camPos);
  if (shake > 0) camera.position.add(tmpV.set(rand(-1, 1), rand(-1, 1), 0).multiplyScalar(shake));
  look.set(P.x * .6 + camPos.x * .4, P.y + 2, P.z - 90);
  camera.lookAt(look);
  camera.rotation.z += -clamp(P.vx / latMax, -1, 1) * .08;
  const fov = 62 + Math.min(36, mach * 8) + boomT * 10 + (P.boosting ? 4 : 0);
  if (Math.abs(camera.fov - fov) > .05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }

  // 空・霧
  const sky = skyAt(Math.min(mach, 10));
  scene.background.copy(sky); scene.fog.color.copy(sky);
  scene.fog.far = fogFar(); scene.fog.near = scene.fog.far * .25;
  starMat.opacity = clamp((mach - 5) / 4, 0, 1);
  stars.position.set(camPos.x, 0, camPos.z);
  hemi.intensity = 1.25 - clamp((mach - 4) / 6, 0, .55);

  // 地面は機体についていき、模様だけずらして止まって見せる
  ground.position.x = P.x; ground.position.z = P.z;
  gTex.offset.set(((P.x / TILE) % 1 + 1) % 1, ((-P.z / TILE) % 1 + 1) % 1);

  // スピード線
  speedLines.position.copy(camera.position);
  const len = clamp(P.v * .035, 2, 140), dz = P.v * dt;
  for (let i = 0; i < LINES; i++) {
    let z = lineData[i * 3 + 2] + dz;
    if (z > 20) { resetLine(i, z - 540); z = lineData[i * 3 + 2]; } else lineData[i * 3 + 2] = z;
    const x = lineData[i * 3], y = lineData[i * 3 + 1], k = i * 6;
    linePos[k] = x; linePos[k + 1] = y; linePos[k + 2] = z;
    linePos[k + 3] = x; linePos[k + 4] = y; linePos[k + 5] = z - len;
  }
  lineGeo.attributes.position.needsUpdate = true;
  lineMat.opacity = state === 'play' ? clamp((mach - .55) * .45, 0, .75) : 0;

  renderer.render(scene, camera);
}

// ====== 描画（UI） ======
function txt(s, x, y, size, color = '#fff', font = FONT_T, align = 'center', stroke = true) {
  ctx.font = `${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(3, size * .14); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
const isTouch = matchMedia('(pointer:coarse)').matches;
function drawUI() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  const u = Math.min(W, H) / 100, cx = W / 2;
  const mach = P.v / SOUND;

  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * .7})`; ctx.fillRect(0, 0, W, H); }
  if (boomT > 0) { // 衝撃波の輪
    const r = (1 - boomT) * Math.hypot(W, H) * .75;
    ctx.strokeStyle = `rgba(255,255,255,${boomT * .9})`; ctx.lineWidth = 6 + boomT * 18;
    ctx.beginPath(); ctx.arc(cx, H * .5, r, 0, Math.PI * 2); ctx.stroke();
  }

  if (state === 'title') {
    ctx.fillStyle = 'rgba(5,10,30,.35)'; ctx.fillRect(0, 0, W, H);
    const s = Math.min(W / 6.5, H / 6);
    txt('マッハ突破', cx, H * .3, s, '#fff');
    txt('SONIC BREAKER', cx, H * .3 + s * .78, s * .26, '#ffd27a', FONT_B);
    const how = isTouch ? ['画面をドラッグで操縦', '右下のBOOSTで加速'] : ['矢印キー / WASD / ドラッグで操縦', 'スペース / Shift で加速'];
    txt(how[0], cx, H * .56, Math.max(14, u * 3.6), '#fff', FONT_B);
    txt(how[1], cx, H * .56 + Math.max(22, u * 5.5), Math.max(14, u * 3.6), '#fff', FONT_B);
    txt('リングをくぐるとブースト回復。岩と鉄骨にぶつかったら終わり', cx, H * .56 + Math.max(44, u * 11), Math.max(11, u * 2.6), '#cfe6ff', FONT_B);
    if (bestDist > 0) txt(`ベスト ${(bestDist / 1000).toFixed(2)} km ・ 最高 マッハ${bestMach.toFixed(2)}`, cx, H * .8, Math.max(13, u * 3), '#ffd27a', FONT_B);
    const pulse = .6 + Math.sin(performance.now() / 260) * .4;
    txt(isTouch ? 'タップでスタート' : 'クリック / スペースでスタート', cx, H * .89, Math.max(16, u * 4.2), `rgba(255,255,255,${pulse})`, FONT_B);
    return;
  }

  if (state === 'over') { drawOver(u, cx); return; }
  // HUD
  const top = 22 + u * 2;
  const msz = Math.min(Math.max(30, u * 9), W * .1) * (1 + boomT * .35);
  const mc = mach >= 1 ? '#ffe28a' : '#fff';
  txt(`MACH ${mach.toFixed(2)}`, cx, top + msz * .5, msz, mc);
  txt(`${Math.round(P.v * 3.6).toLocaleString()} km/h`, cx, top + msz + Math.max(10, u * 2.2), Math.max(13, u * 3), '#fff', FONT_B);
  const sz = Math.max(13, u * 3);
  const dy = W < 640 ? H - 30 - Math.max(10, u * 2.2) - sz * 5.2 : top + sz * .4; // 縦長画面では左下へ
  txt(`${(P.dist / 1000).toFixed(2)} km`, 16, dy, sz * 1.25, '#fff', FONT_T, 'left');
  txt(`リング ${P.rings}`, 16, dy + sz * 1.5, sz * .9, '#7ff6ff', FONT_B, 'left');

  if (state === 'play') {
    // ブーストゲージ
    const gw = Math.min(W * .45, 260), gh = Math.max(10, u * 2.2), gx = 16, gy = H - 30 - gh;
    txt('BOOST', gx, gy - gh, Math.max(12, u * 2.6), '#ffd27a', FONT_B, 'left');
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(gx, gy, gw, gh);
    const gr = ctx.createLinearGradient(gx, 0, gx + gw, 0); gr.addColorStop(0, '#ff5a1a'); gr.addColorStop(1, '#ffe08a');
    ctx.fillStyle = P.fuel > 0 ? gr : '#555'; ctx.fillRect(gx, gy, gw * P.fuel / 100, gh);
    ctx.strokeStyle = '#fff9'; ctx.lineWidth = 1.5; ctx.strokeRect(gx, gy, gw, gh);
    // スティック
    if (joy) {
      const R = joyRadius();
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(joy.sx, joy.sy, R, 0, Math.PI * 2); ctx.stroke();
      const dx = clamp(joy.x - joy.sx, -R, R), dy = clamp(joy.y - joy.sy, -R, R);
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(joy.sx + dx, joy.sy + dy, R * .38, 0, Math.PI * 2); ctx.fill();
    }
  }

  // メッセージ
  let my = H * .36;
  for (const m of msgs) {
    const a = m.t < .15 ? m.t / .15 : Math.max(0, 1 - (m.t - 1.6) / .6);
    const sc = m.t < .15 ? 1.4 - m.t / .15 * .4 : 1;
    const fs = Math.max(20, u * 7) * m.size;
    my += fs * .6;
    ctx.globalAlpha = a; txt(m.text, cx, my, fs * sc, m.color); ctx.globalAlpha = 1;
    my += fs * .6;
  }

}
function drawOver(u, cx) {
  {
    const a = Math.min(1, stateT * 2.5);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(5,8,20,.68)'; ctx.fillRect(0, 0, W, H);
    const s = Math.min(W / 8, H / 9);
    txt('墜落…', cx, H * .24, s, '#ff7a6a');
    txt(rankFor(P.maxMach), cx, H * .24 + s * 1.05, s * .45, '#ffe28a', FONT_B);
    const ls = Math.max(15, u * 4.2), y0 = H * .5;
    txt(`飛行距離  ${(P.dist / 1000).toFixed(2)} km${P.newBest ? '  ★新記録' : ''}`, cx, y0, ls, '#fff', FONT_B);
    txt(`最高速度  マッハ ${P.maxMach.toFixed(2)}（${Math.round(P.maxMach * SOUND * 3.6).toLocaleString()} km/h）`, cx, y0 + ls * 1.6, ls * .9, '#fff', FONT_B);
    txt(`くぐったリング  ${P.rings}`, cx, y0 + ls * 3.1, ls * .9, '#7ff6ff', FONT_B);
    txt(`ベスト ${(bestDist / 1000).toFixed(2)} km ・ 最高 マッハ${bestMach.toFixed(2)}`, cx, y0 + ls * 4.7, ls * .75, '#ffd27a', FONT_B);
    if (stateT > .8) {
      const pulse = .6 + Math.sin(performance.now() / 260) * .4;
      txt(isTouch ? 'タップでもう一回' : 'クリック / スペースでもう一回', cx, H * .88, Math.max(16, u * 4.2), `rgba(255,255,255,${pulse})`, FONT_B);
    }
    ctx.globalAlpha = 1;
  }
}

// ====== ループ ======
reset(false);
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  update(dt);
  render3D(dt, now / 1000);
  drawUI();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__mach = { P, get state() { return state; } };
