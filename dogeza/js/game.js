// 全力土下座 3D
import * as THREE from 'three';

// ====== 画面 ======
const glCv = document.getElementById('gl'), ui = document.getElementById('ui'), ctx = ui.getContext('2d');
const VW = 400, VH = 720;
let W, H, S, OX, OY, DPR;
const renderer = new THREE.WebGLRenderer({ canvas: glCv, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, .1, 500);
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
  ui.width = Math.round(W * DPR); ui.height = Math.round(H * DPR);
  S = Math.min(W / VW, H / VH); OX = (W - VW * S) / 2; OY = (H - VH * S) / 2;
  camera.aspect = W / H; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
const L = () => -OX / S, R = () => (W - OX) / S, T = () => -OY / S, B = () => (H - OY) / S;

const FONT_T = '"Dela Gothic One","Hiragino Sans","Yu Gothic",sans-serif';
const FONT_B = '"Zen Kaku Gothic New","Hiragino Sans","Yu Gothic",sans-serif';

// ====== 保存 ======
const store = {
  get(k, d) { try { const v = localStorage.getItem('dogeza.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('dogeza.' + k, JSON.stringify(v)); } catch (e) {} }
};
let best = store.get('best', 0), bestStage = store.get('bestStage', 0);

// ====== 音 ======
let AC = null, muted = store.get('muted', false), hum = null;
const muteBtn = document.getElementById('mute');
function syncMute() { muteBtn.textContent = muted ? '🔇' : '🔊'; }
syncMute();
muteBtn.addEventListener('pointerdown', e => e.stopPropagation());
muteBtn.addEventListener('click', e => {
  e.stopPropagation(); muted = !muted; store.set('muted', muted); syncMute();
  if (muted) { stopHum(); try { speechSynthesis.cancel(); } catch (_) {} }
});
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f, d, type = 'square', vol = .12, slide = 0, delay = 0) {
  if (muted || !AC) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + .02);
}
function thud(vol = .5) {
  if (muted || !AC) return;
  const t = AC.currentTime, n = AC.sampleRate * .35, buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = buf; f.type = 'lowpass'; f.frequency.value = 300; g.gain.value = vol;
  s.connect(f).connect(g).connect(AC.destination); s.start(t);
  tone(90, .3, 'sine', vol * .8, -50);
}
function startHum() {
  if (muted || !AC) return;
  stopHum();
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sawtooth'; o.frequency.value = 120; g.gain.value = .05;
  o.connect(g).connect(AC.destination); o.start(); hum = { o, g };
}
function stopHum() { if (hum) { try { hum.o.stop(); } catch (e) {} hum = null; } }
function say(text, rate = 1.25, pitch = 1) {
  if (muted || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP'; u.rate = rate; u.pitch = pitch; u.volume = .9;
    speechSynthesis.speak(u);
  } catch (e) {}
}
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

// ====== データ ======
const BOSSES = [
  { name: '部長', skin: '#f2c8a2', suit: '#4a5068', hair: 'bald', wall: '#d5dde2', floor: '#8d7b68', bg: '#a9c4d6', deco: 'office' },
  { name: '社長', skin: '#efc29a', suit: '#25252f', hair: 'wig', stache: true, wall: '#b08b5e', floor: '#8a2b2b', bg: '#3b2a1c', deco: 'ceo' },
  { name: '会長', skin: '#ebc19b', suit: '#5b3a2a', hair: 'white', beard: true, wall: '#eadfc4', floor: '#c9b77c', bg: '#6b5a3a', deco: 'washitsu' },
  { name: '総理大臣', skin: '#f0c6a0', suit: '#1f2a44', hair: 'side', wall: '#6a2430', floor: '#9e1b2b', bg: '#2a0d12', deco: 'diet' },
  { name: '宇宙人', skin: '#9be37a', suit: '#3a3a74', hair: 'antenna', wall: null, floor: '#55576e', bg: '#05051a', deco: 'space' },
  { name: '神', skin: '#ffe9c8', suit: '#fbfbff', hair: 'halo', beard: true, wall: null, floor: '#ffffff', bg: '#9fdcff', deco: 'heaven' },
];
const CRIMES = [
  [0, '部長のプリンを食べた'],
  [0, '会議中に寝言で「ママ…」と言った'],
  [0, '部長のデスクで流しそうめんを開催した'],
  [1, '社長のカツラを扇風機で飛ばした'],
  [1, '社内Wi-Fiの名前を「社長のヒミツ」にした'],
  [1, '社用車で回転寿司のレーンに入った'],
  [2, '会長の盆栽をアフロにした'],
  [2, '社運をかけたプレゼンで紙芝居を始めた'],
  [3, '国会でカスタネットを鳴らし続けた'],
  [3, '国の予算で、おでんを全部買った'],
  [4, 'UFOに「月極駐車場」の看板を立てた'],
  [4, '宇宙人の母星をおしゃれカフェにした'],
  [5, '天地創造の設計図に落書きした'],
  [5, '神様のプリンを食べた'],
];
function crimeFor(st) {
  if (st < CRIMES.length) return { boss: CRIMES[st][0], text: CRIMES[st][1] };
  return { boss: 5, text: `またプリンを食べた（${st - CRIMES.length + 2}個目）` };
}
function styleFor(st) {
  if (st < 2) return { name: 'ふつうの土下座', jump: 0, spin: 0, clones: 0, space: false };
  if (st < 4) return { name: 'ジャンピング土下座', jump: 1, spin: 0, clones: 0, space: false };
  if (st < 6) return { name: '回転土下座', jump: 1.1, spin: 1, clones: 0, space: false };
  if (st < 8) return { name: 'トリプルアクセル土下座', jump: 1.4, spin: 3, clones: 0, space: false };
  if (st < 11) return { name: '分身土下座', jump: 1.4, spin: 2, clones: 2, space: false };
  return { name: '大気圏突入土下座', jump: 0, spin: 4, clones: 2, space: true };
}
const LAYERS = [
  { name: '床下', c1: '#6b5a4a' },
  { name: '地下駐車場', c1: '#5d6066' },
  { name: '地下鉄のトンネル', c1: '#34303b' },
  { name: '温泉', c1: '#3f8fb5' },
  { name: 'マントル', c1: '#d2521c' },
  { name: '地球の核', c1: '#ffbf3d' },
  { name: 'ブラジル', c1: '#2fa84f' },
];
const OK_LINES = ['…まあ、いいだろう', '顔を上げたまえ', 'そ、そこまでせんでも', '許す。床がかわいそうだ', 'うむ。誠意は伝わった'];
const GOD_LINES = ['美しい…！', '涙が止まらん…', '全部許す！昇進だ！', 'ワシも謝りたくなってきた'];
const WEAK_LINES = ['それは会釈だ！', '誠意が見えんなぁ！', 'いまペコリと言ったか？', 'お辞儀の練習かね？'];
const RANKS = [[0, '謝罪ビギナー'], [2, 'ペコペコ新人'], [4, '中堅の謝罪マン'], [6, '土下座係長'], [8, '謝罪部長'], [10, '土下座の鬼'], [13, '謝罪の神'], [15, '神をも謝らせる者']];

// ====== ポーズ（2D版と同じ角度。長さはピクセル→メートル） ======
const K = .0132;
const STAND = { hy: 68, tor: 0, th: 0, sh: 0, arm: .15 };
const CROUCH = { hy: 48, tor: .45, th: .95, sh: -.65, arm: -.4 };
const AIR = { hy: 68, tor: -.15, th: .25, sh: -.5, arm: -2.7 };
const DOGEZA = { hy: 20, tor: 1.78, th: 1.35, sh: -1.5, arm: 1.25 };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
function lp(a, b, t) { const o = {}; for (const k in a) o[k] = lerp(a[k], b[k], t); return o; }
const pick = a => a[Math.floor(Math.random() * a.length)];
const rnd = n => (Math.random() * 2 - 1) * n;

// ====== 3D：共通 ======
const PX = -1.05, BX = 1.05, LH = 5, FT = .3;
const Y_BR = -(FT + 7 * LH); // ブラジルの地面（さかさま）
const gradTex = (() => { const t = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 185, 185, 185, 255, 255, 255, 255, 255]), 3, 1); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const M = (c, o = {}) => new THREE.MeshToonMaterial({ color: c, gradientMap: gradTex, ...o });
const MB = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true; if (parent) parent.add(m); return m;
}
function limbGeo(r, len) { const g = new THREE.CapsuleGeometry(r, len, 4, 10); g.translate(0, -len / 2, 0); return g; }
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function textPlane(lines, wM, hM, { bg = '#fffdf5', fg = '#1b1430', font = FONT_T, border = null, px = 512 } = {}) {
  const ph = Math.round(px * hM / wM);
  const tex = canvasTex(px, ph, (c, w, h) => {
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); }
    if (border) { c.strokeStyle = border; c.lineWidth = w * .03; c.strokeRect(0, 0, w, h); }
    const n = lines.length, size = Math.min(h / (n + .6), w / Math.max(...lines.map(s => [...s].length)) * .92);
    c.font = `${size}px ${font}`; c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach((s, i) => c.fillText(s, w / 2, h / 2 + (i - (n - 1) / 2) * size * 1.1));
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshBasicMaterial({ map: tex, transparent: !bg }));
}
function textSprite(s, hM, color = '#fff', stroke = '#1b1430') {
  const size = 96;
  const c0 = document.createElement('canvas').getContext('2d'); c0.font = `${size}px ${FONT_T}`;
  const w = Math.ceil(c0.measureText(s).width + 40);
  const tex = canvasTex(w, size + 40, (c, w2, h2) => {
    c.font = `${size}px ${FONT_T}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = 16; c.strokeStyle = stroke; c.strokeText(s, w2 / 2, h2 / 2);
    c.fillStyle = color; c.fillText(s, w2 / 2, h2 / 2);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(hM * w / (size + 40), hM, 1); return sp;
}

// ====== 光 ======
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 1.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(3, 9, 7); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 7, bottom: -3, near: 1, far: 30 });
sun.shadow.bias = -.0005;
scene.add(sun, sun.target);
const followLight = new THREE.PointLight(0xffe2b0, 0, 14, 1.2); scene.add(followLight);

// ====== 主人公（サラリーマン） ======
function makePlayer(tint, opacity = 1) {
  const o = tint ? { transparent: true, opacity, depthWrite: false } : {};
  const suit = M(tint || '#33405f', o), pants = M(tint || '#262f48', o), skin = M(tint || '#f4cfa8', o),
    shoe = M(tint || '#151515', o), hair = M(tint || '#1e1e1e', o), white = M(tint || '#ffffff', o), red = M(tint || '#d63031', o), black = MB(tint || '#111', o);
  const yaw = new THREE.Group(), root = new THREE.Group(), hips = new THREE.Group();
  yaw.add(root); root.add(hips);
  const legs = [];
  for (const z of [-.1, .1]) {
    const th = new THREE.Group(); th.position.z = z; hips.add(th);
    mesh(limbGeo(.11, .45), pants, th);
    const kn = new THREE.Group(); kn.position.y = -.45; th.add(kn);
    mesh(limbGeo(.095, .45), pants, kn);
    mesh(new THREE.BoxGeometry(.24, .1, .13), shoe, kn, .06, -.5, 0);
    legs.push({ th, kn });
  }
  const tor = new THREE.Group(); hips.add(tor);
  const tg = new THREE.CapsuleGeometry(.18, .38, 4, 12); tg.translate(0, .27, 0); tg.scale(1, 1, .82);
  mesh(tg, suit, tor);
  mesh(new THREE.BoxGeometry(.04, .2, .14), white, tor, .17, .43, 0);
  mesh(new THREE.BoxGeometry(.04, .28, .05), red, tor, .19, .3, 0);
  const head = new THREE.Group(); head.position.y = .72; tor.add(head);
  mesh(new THREE.SphereGeometry(.19, 20, 14), skin, head);
  const hg = new THREE.SphereGeometry(.205, 20, 10, 0, Math.PI * 2, 0, Math.PI * .55);
  const hm = mesh(hg, hair, head); hm.rotation.z = .55;
  for (const z of [-.07, .07]) mesh(new THREE.SphereGeometry(.024, 8, 6), black, head, .175, .02, z, false);
  mesh(new THREE.BoxGeometry(.02, .02, .08), MB(tint || '#7a3b2e', o), head, .18, -.08, 0, false);
  const sweat = mesh(new THREE.SphereGeometry(.045, 10, 8), MB('#7fd3ff'), head, -.04, .25, .14, false);
  const arms = [];
  for (const z of [-.23, .23]) {
    const a = new THREE.Group(); a.position.set(0, .47, z); tor.add(a);
    mesh(limbGeo(.075, .36), suit, a);
    mesh(new THREE.SphereGeometry(.075, 10, 8), skin, a, 0, -.45, 0);
    arms.push(a);
  }
  yaw.rotation.y = -.35;
  return { yaw, root, hips, legs, tor, head, arms, sweat, suit };
}
function applyPose(rig, p, baseY, rot, x, z = 0) {
  rig.yaw.position.set(x, baseY, z);
  rig.root.position.set(20 * K, (p.hy + 10) * K, 0);
  rig.root.rotation.z = -rot;
  rig.hips.position.set(-20 * K, -10 * K, 0);
  for (const l of rig.legs) { l.th.rotation.z = p.th; l.kn.rotation.z = p.sh - p.th; }
  rig.tor.rotation.z = -p.tor;
  rig.arms[0].rotation.z = rig.arms[1].rotation.z = p.arm + p.tor;
}
const player = makePlayer(); scene.add(player.yaw);
const ghosts = [makePlayer('#ff6b9a', .35), makePlayer('#6bd5ff', .35)];
ghosts.forEach(g => { g.yaw.visible = false; g.yaw.traverse(o => o.castShadow = false); scene.add(g.yaw); });

// ====== 上司 ======
let bossRig = null;
function veinTex() {
  return canvasTex(128, 128, (c) => {
    c.translate(64, 64); c.strokeStyle = '#c40018'; c.lineWidth = 13; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(12, 12); c.quadraticCurveTo(16, 40, 44, 40); c.stroke(); }
  });
}
const VEIN = veinTex();
function buildBoss(b) {
  if (bossRig) scene.remove(bossRig.g);
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const suit = M(b.suit), dark = M('#22222c'), black = MB('#111'), face = M(b.skin);
  for (const x of [-.22, .22]) {
    mesh(new THREE.CylinderGeometry(.15, .13, .95, 12), dark, body, x, .48, 0);
    mesh(new THREE.BoxGeometry(.24, .14, .4), M('#111'), body, x, .07, .07);
  }
  const bg = new THREE.CapsuleGeometry(.56, .55, 6, 16); bg.scale(1, 1, .78);
  mesh(bg, suit, body, 0, 1.45, 0);
  if (b.hair !== 'halo' && b.hair !== 'antenna') {
    const tri = new THREE.Shape(); tri.moveTo(-.2, 0); tri.lineTo(.2, 0); tri.lineTo(0, -.55); tri.closePath();
    mesh(new THREE.ShapeGeometry(tri), MB('#fff', { side: THREE.DoubleSide }), body, 0, 2.03, .44, false).rotation.x = -.35;
    const tie = new THREE.Shape(); tie.moveTo(-.06, 0); tie.lineTo(.06, 0); tie.lineTo(.09, -.5); tie.lineTo(0, -.62); tie.lineTo(-.09, -.5); tie.closePath();
    mesh(new THREE.ShapeGeometry(tie), MB('#a4161a', { side: THREE.DoubleSide }), body, 0, 2.0, .46, false).rotation.x = -.3;
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(s * .6, 1.95, 0); body.add(a);
    mesh(limbGeo(.15, .62), suit, a);
    mesh(new THREE.SphereGeometry(.14, 10, 8), M(b.skin), a, 0, -.85, 0);
    arms.push(a);
  }
  const head = new THREE.Group(); head.position.y = 2.62; body.add(head);
  const hs = mesh(new THREE.SphereGeometry(.5, 28, 20), face, head);
  if (b.hair === 'antenna') hs.scale.set(1.18, .9, 1);
  const eyes = [], whites = [], brows = [];
  for (const s of [-1, 1]) {
    eyes.push(mesh(new THREE.SphereGeometry(.05, 10, 8), black, head, s * .17, .04, .47, false));
    const w = mesh(new THREE.SphereGeometry(.11, 12, 10), MB('#fff'), head, s * .17, .04, .42, false);
    w.scale.z = .5; whites.push(w);
    brows.push(mesh(new THREE.BoxGeometry(.24, .055, .06), black, head, s * .18, .2, .45, false));
  }
  const mouth = mesh(new THREE.TorusGeometry(.12, .028, 6, 16, Math.PI), black, head, 0, -.24, .45, false);
  const oMouth = mesh(new THREE.SphereGeometry(.09, 12, 10), MB('#4a1010'), head, 0, -.22, .44, false); oMouth.scale.set(.8, 1.3, .5);
  const cheeks = [-1, 1].map(s => { const c = mesh(new THREE.SphereGeometry(.07, 10, 8), MB('#ff9a9a'), head, s * .3, -.08, .4, false); c.scale.z = .4; return c; });
  const tears = [-1, 1].map(s => mesh(new THREE.SphereGeometry(.04, 8, 6), MB('#6bd5ff'), head, s * .17, -.06, .47, false));
  let wig = null;
  if (b.hair === 'bald') {
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(.15, 10, 8), M('#555'), head, s * .45, .02, -.1);
    const strand = mesh(new THREE.TorusGeometry(.12, .012, 4, 12, Math.PI * 1.2), M('#444'), head, .05, .58, 0); strand.rotation.y = Math.PI / 2;
  }
  if (b.hair === 'wig') { wig = mesh(new THREE.SphereGeometry(.53, 24, 10, 0, Math.PI * 2, 0, Math.PI * .42), M('#141414'), head, 0, .02, -.04); }
  if (b.hair === 'white' || b.hair === 'halo') for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(.17, 10, 8), M('#f4f4f4'), head, s * .45, -.02, -.12);
  if (b.hair === 'side') { const h = mesh(new THREE.SphereGeometry(.53, 24, 10, 0, Math.PI * 2, 0, Math.PI * .4), M('#2b2b2b'), head, -.04, .02, -.02); h.rotation.z = .2; }
  if (b.hair === 'antenna') for (const s of [-1, 1]) {
    const a = mesh(new THREE.CylinderGeometry(.025, .025, .55, 6), M(b.skin), head, s * .22, .6, 0); a.rotation.z = -s * .4;
    mesh(new THREE.SphereGeometry(.09, 10, 8), MB('#ff5ec4'), head, s * .34, .86, 0);
  }
  if (b.hair === 'halo') {
    const h = mesh(new THREE.TorusGeometry(.38, .05, 8, 32), MB('#ffd23f'), head, 0, .75, 0, false); h.rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) mesh(new THREE.SphereGeometry(.38, 12, 10), M('#ffffff'), g, -1 + i * .4, .08, rnd(.3), false);
  }
  if (b.beard) { const bd = mesh(new THREE.ConeGeometry(.32, .75, 16), M('#f4f4f4'), head, 0, -.55, .22); bd.rotation.x = Math.PI + .25; }
  if (b.stache) for (const s of [-1, 1]) { const m = mesh(new THREE.SphereGeometry(.12, 10, 8), MB('#141414'), head, s * .1, -.13, .47, false); m.scale.set(1, .35, .35); m.rotation.z = s * .3; }
  const veins = [[.3, .32], [-.32, .25]].map(([x, y]) => {
    const v = new THREE.Sprite(new THREE.SpriteMaterial({ map: VEIN, transparent: true, depthTest: false })); v.position.set(x, y, .45); v.scale.setScalar(.28); head.add(v); return v;
  });
  g.position.set(BX, 0, 0); g.rotation.y = -.75;
  scene.add(g);
  bossRig = { g, body, head, face, eyes, whites, brows, mouth, oMouth, cheeks, tears, wig, veins, arms, skin: new THREE.Color(b.skin), wigT: 0 };
}
const RED = new THREE.Color('#ff4a3d');
function updateBoss(t, dt) {
  const r = bossRig; if (!r) return;
  const happy = bossMood === 'happy', shock = bossMood === 'shock', angry = bossMood === 'angry';
  r.face.color.copy(r.skin).lerp(RED, angry ? bossAnger * .7 : 0);
  r.body.position.x = angry ? Math.sin(t * 40) * bossAnger * .025 : 0;
  r.body.position.y = happy ? Math.abs(Math.sin(t * 6)) * .12 : 0;
  r.eyes.forEach(e => { e.scale.set(happy ? 1.6 : 1, happy ? .25 : 1, 1); e.position.z = shock ? .5 : .47; });
  r.whites.forEach(w => w.visible = shock);
  r.brows.forEach((b, i) => { b.visible = angry; b.rotation.z = (i ? -1 : 1) * (.2 + bossAnger * .45); });
  r.mouth.visible = !shock; r.mouth.rotation.z = happy ? Math.PI : 0; r.mouth.position.y = happy ? -.14 : -.27;
  r.oMouth.visible = shock;
  r.cheeks.forEach(c => c.visible = happy);
  r.tears.forEach((tr, i) => { tr.visible = happy && judge && judge.perfect; tr.position.y = -.06 - ((t * 1.5 + i * .5) % 1) * .35; });
  r.veins.forEach((v, i) => { v.visible = angry && bossAnger > (i ? .8 : .5); v.scale.setScalar(.28 * (1 + Math.sin(t * 12 + i) * .15)); });
  const armA = happy ? 2.6 + Math.sin(t * 10) * .3 : shock ? 2.0 : .25;
  r.arms[0].rotation.z = -armA; r.arms[1].rotation.z = armA;
  if (r.wig) { r.wigT = shock ? Math.min(1, r.wigT + dt * 2) : Math.max(0, r.wigT - dt * 3); r.wig.position.y = .02 + r.wigT * .9; r.wig.rotation.z = r.wigT * 2.5; }
  if (angry && bossAnger > .6 && Math.random() < bossAnger * .3) {
    const p = r.head.getWorldPosition(new THREE.Vector3());
    spawn('ball', p.x + rnd(.3), p.y + .45, p.z, rnd(.3), 1.2, 0, .9, '#ffffff', .12, 0, true);
  }
}

// ====== 部屋 ======
let room = null, roomIdx = -1;
function buildRoom(i) {
  if (room) scene.remove(room);
  const b = BOSSES[i]; room = new THREE.Group(); roomIdx = i;
  let floorMat = M(b.floor);
  if (b.deco === 'washitsu') floorMat = M('#ffffff', { map: canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#c9b77c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#a99a5e'; c.lineWidth = 3; for (let k = 0; k < w; k += 6) { c.globalAlpha = .25; c.beginPath(); c.moveTo(k, 0); c.lineTo(k, h); c.stroke(); } c.globalAlpha = 1; c.lineWidth = 8; c.strokeStyle = '#4a3a1a'; c.strokeRect(0, 0, w, h); }) });
  if (floorMat.map) { floorMat.map.wrapS = floorMat.map.wrapT = THREE.RepeatWrapping; floorMat.map.repeat.set(7, 4); }
  const floor = mesh(new THREE.BoxGeometry(34, FT, 8), floorMat, room, 0, -FT / 2, -1, false);
  floor.receiveShadow = true;
  if (b.wall) {
    let wm = M(b.wall);
    if (b.deco === 'ceo') wm = M('#ffffff', { map: canvasTex(256, 256, (c, w, h) => { c.fillStyle = b.wall; c.fillRect(0, 0, w, h); c.fillStyle = '#9a7750'; for (let x = 0; x < w; x += 32) c.fillRect(x, 0, 3, h); }) });
    if (wm.map) { wm.map.wrapS = THREE.RepeatWrapping; wm.map.repeat.set(4, 1); }
    mesh(new THREE.BoxGeometry(34, 10, .3), wm, room, 0, 5, -3.5, false);
  }
  const P = (geo, c, x, y, z, parent = room) => mesh(geo, typeof c === 'string' ? M(c) : c, parent, x, y, z);
  if (b.deco === 'office') {
    const win = textPlane([''], 2.2, 1.6, { bg: '#9fc6e8' }); win.position.set(0, 3, -3.33); room.add(win);
    P(new THREE.BoxGeometry(2.3, .12, .1), '#fff', 0, 3, -3.3); P(new THREE.BoxGeometry(.12, 1.7, .1), '#fff', 0, 3, -3.3);
    for (let k = 0; k < 6; k++) P(new THREE.BoxGeometry(.25, .5 + (k * 37 % 7) / 10, .02), '#6a86a6', -.9 + k * .36, 2.45, -3.32);
    const s = textPlane(['目標：謝罪ゼロ'], 1.8, .45, { border: '#c0392b' }); s.position.set(-3.2, 3.2, -3.33); room.add(s);
    P(new THREE.CylinderGeometry(.3, .24, .6, 12), '#7b8b6f', -3.6, .3, -2.4); P(new THREE.SphereGeometry(.55, 12, 10), '#4b8b3b', -3.6, 1.05, -2.4);
    P(new THREE.BoxGeometry(2.4, .12, 1.1), '#8b6a4a', 2.3, 1.1, -2.2); P(new THREE.BoxGeometry(2.2, 1.05, 1), '#7a5a3c', 2.3, .52, -2.2);
    P(new THREE.CylinderGeometry(.16, .2, .18, 16), '#f6d36b', 1.7, 1.25, -2); P(new THREE.CylinderGeometry(.11, .16, .04, 16), '#6b3a14', 1.7, 1.35, -2);
  } else if (b.deco === 'ceo') {
    const s = textPlane(['社是', '誠意'], 1.3, 1, { bg: '#d4af37', fg: '#5a3a10', border: '#8a6a1a' }); s.position.set(0, 3.6, -3.33); room.add(s);
    P(new THREE.BoxGeometry(3, .14, 1.3), '#4a2a14', 2.4, 1.15, -2.3); P(new THREE.BoxGeometry(2.8, 1.1, 1.2), '#3a200e', 2.4, .55, -2.3);
    const np = textPlane(['社長'], .7, .22, { bg: '#d4af37', fg: '#3a200e' }); np.position.set(2.4, .8, -1.68); room.add(np);
    P(new THREE.CylinderGeometry(.05, .05, 1.3, 8), '#ddd', -3, .65, -2.2); const fan = P(new THREE.CylinderGeometry(.42, .42, .08, 20), '#e8f4ff', -3, 1.45, -2.1); fan.rotation.x = Math.PI / 2; fan.userData.spin = true;
  } else if (b.deco === 'washitsu') {
    const s = textPlane(['土', '下', '座'], .9, 2.4, { bg: '#f7f1e1', fg: '#222', border: '#6b4a2b' }); s.position.set(0, 3.2, -3.33); room.add(s);
    for (let k = 0; k < 4; k++) { const sh = textPlane([''], 1.2, 2.6, { bg: '#fbf6ea', border: '#6b4a2b' }); sh.position.set(-5 + k * 1.25, 1.6, -3.33); room.add(sh); }
    P(new THREE.CylinderGeometry(.35, .3, .3, 12), '#5b3a2a', 3.4, .15, -2.4); P(new THREE.CylinderGeometry(.06, .08, .6, 6), '#5b3a2a', 3.4, .6, -2.4);
    P(new THREE.IcosahedronGeometry(.75, 1), '#1d1d1d', 3.4, 1.3, -2.4);
  } else if (b.deco === 'diet') {
    for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) P(new THREE.BoxGeometry(.8, .7, .6), '#7a2a35', -6 + k * 1.5, .35 + r * .7, -1.8 - r * .9);
    for (let r = 0; r < 3; r++) P(new THREE.BoxGeometry(16, r * .7 + .01, .9), '#5a1f2a', 0, r * .35, -1.8 - r * .9);
    const s = textPlane(['静粛に'], 1.6, .5, { bg: '#5a1f2a', fg: '#ffd9a0' }); s.position.set(0, 4.2, -3.33); room.add(s);
  } else if (b.deco === 'space') {
    const n = 500, pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, y = rnd(1); pos.set([Math.cos(a) * 60, y * 40 + 10, Math.sin(a) * 60 - 20], k * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    room.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff', size: .25 })));
    P(new THREE.SphereGeometry(2.4, 24, 16), '#e0a96d', -7, 7, -14);
    const ring = P(new THREE.TorusGeometry(3.8, .18, 6, 48), '#f6d7a7', -7, 7, -14); ring.rotation.x = 1.3;
    const ufo = new THREE.Group(); ufo.position.set(4, 4.2, -4); room.add(ufo); ufo.userData.bob = true;
    const d = P(new THREE.SphereGeometry(1, 20, 10), '#b9c3d6', 0, 0, 0, ufo); d.scale.set(1.3, .25, 1.3);
    P(new THREE.SphereGeometry(.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M('#8ff', { transparent: true, opacity: .7 }), 0, .1, 0, ufo);
    const s = textPlane(['月極駐車場'], 1.6, .4, { border: '#1b1430' }); s.position.set(0, -.55, .9); ufo.add(s);
  } else if (b.deco === 'heaven') {
    for (let k = 0; k < 14; k++) { const cl = new THREE.Group(); cl.position.set(rnd(9), 1 + Math.random() * 6, -4 - Math.random() * 8); for (let j = 0; j < 4; j++) P(new THREE.SphereGeometry(.6 + Math.random() * .5, 12, 10), '#ffffff', j * .7 - 1, rnd(.2), rnd(.3), cl); room.add(cl); cl.userData.drift = .2 + Math.random() * .3; }
    for (let k = 0; k < 7; k++) { const ray = mesh(new THREE.ConeGeometry(.9, 14, 12, 1, true), MB('#fff6c0', { transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false }), room, BX + rnd(.5), 7, -3, false); ray.rotation.z = (k - 3) * .18; }
  }
  scene.add(room);
}

// ====== 地下 ======
const under = new THREE.Group(); scene.add(under);
let train = null, fans = [];
function buildUnder() {
  for (let i = 0; i < 7; i++) {
    const top = -(FT + i * LH), ly = LAYERS[i];
    const m = M(ly.c1, i >= 4 && i <= 5 ? { emissive: ly.c1, emissiveIntensity: .45 } : {});
    mesh(new THREE.BoxGeometry(34, LH, 3), m, under, 0, top - LH / 2, -2.5, false);
    const lab = textSprite(ly.name, .5); lab.position.set(2.6, top - .6, -.9); under.add(lab);
    const y = top - LH / 2;
    if (i === 0) for (let k = 0; k < 3; k++) { const p = mesh(new THREE.CylinderGeometry(.15, .15, 16, 8), M('#8a8f96'), under, 0, top - .8 - k * 1.3, -.9); p.rotation.z = Math.PI / 2; }
    if (i === 1) {
      ['#c0392b', '#2980b9', '#f1c40f'].forEach((c, k) => { const car = new THREE.Group(); car.position.set(-3 + k * 3, top - LH + .01, -1.4); under.add(car); mesh(new THREE.BoxGeometry(1.8, .5, .9), M(c), car, 0, .45, 0); mesh(new THREE.BoxGeometry(1, .4, .8), M(c), car, -.1, .85, 0); for (const x of [-.55, .55]) mesh(new THREE.CylinderGeometry(.18, .18, .95, 12), M('#111'), car, x, .2, 0).rotation.x = Math.PI / 2; });
      for (let k = -2; k <= 2; k++) mesh(new THREE.BoxGeometry(.4, LH, .4), M('#7a7d84'), under, k * 3.5 + 1.5, y, -1.6);
    }
    if (i === 2) {
      for (const z of [-1.5, -1]) mesh(new THREE.BoxGeometry(16, .06, .06), M('#aaa'), under, 0, top - LH + .05, z);
      train = new THREE.Group(); train.position.set(0, top - LH + .1, -1.25); under.add(train);
      mesh(new THREE.BoxGeometry(6, 1.6, 1.2), M('#dddddd'), train, 0, .85, 0); mesh(new THREE.BoxGeometry(6.02, .2, 1.22), M('#16a085'), train, 0, .9, 0);
      for (let k = 0; k < 5; k++) mesh(new THREE.BoxGeometry(.6, .5, 1.24), MB('#24364a'), train, -2.2 + k * 1.1, 1.25, 0, false);
    }
    if (i === 3) { mesh(new THREE.BoxGeometry(16, LH * .55, 1.6), M('#6fd0ff', { transparent: true, opacity: .55 }), under, 0, top - LH * .72, -1.1, false); const s = textSprite('♨ ちょうどいい湯加減', .45, '#fff'); s.position.set(-2.4, top - 1.6, -.6); under.add(s); }
    if (i === 4) for (let k = 0; k < 10; k++) mesh(new THREE.SphereGeometry(.3 + Math.random() * .4, 10, 8), MB('#ffb15e'), under, rnd(7), top - Math.random() * LH, -1.05, false);
    if (i === 5) mesh(new THREE.SphereGeometry(1.8, 24, 16), MB('#fff3b0'), under, 3, y, -1.5, false);
  }
  // ブラジル（さかさまの地上）
  const br = new THREE.Group(); br.position.y = Y_BR; br.rotation.z = Math.PI; under.add(br);
  mesh(new THREE.BoxGeometry(30, 14, .3), MB('#7fd0ff'), br, 0, 7, -4, false);
  mesh(new THREE.SphereGeometry(1, 20, 14), MB('#ffe14d'), br, -3.4, 5, -3.6, false);
  const sign = textPlane(['BRASIL'], 3, .8, { bg: '#2fa84f', fg: '#ffe14d', border: '#ffe14d' }); sign.position.set(.2, 3.2, -3.7); br.add(sign);
  mesh(new THREE.BoxGeometry(16, .1, 6), M('#3cbf5e'), br, 0, 0, 0, false);
  for (let k = 0; k < 3; k++) { // ヤシの木
    const x = [-4.2, 3.6, 5.6][k], tr = mesh(new THREE.CylinderGeometry(.12, .18, 3, 8), M('#8a5a2b'), br, x, 1.5, -2.6);
    for (let j = 0; j < 5; j++) { const lf = mesh(new THREE.ConeGeometry(.25, 1.6, 6), M('#2fa84f'), br, x, 3, -2.6); lf.rotation.set(0, j * 1.25, 1.9); lf.translateY(.8); }
  }
  ['#ffe14d', '#2fa84f', '#2b5fd9', '#ff6b9a', '#ff9f43'].forEach((c, k) => {
    const f = makeFan(c); f.position.set([-3, -2, 2.2, 3.2, 4.4][k], 0, -.8 - (k % 2) * .6); f.rotation.y = rnd(.4); br.add(f); fans.push(f);
  });
}
function makeFan(c) {
  const g = new THREE.Group();
  for (const x of [-.1, .1]) mesh(limbGeo(.08, .5), M('#333'), g, x, .6, 0);
  const b = new THREE.CapsuleGeometry(.2, .35, 4, 10); mesh(b, M(c), g, 0, .95, 0);
  mesh(new THREE.SphereGeometry(.17, 12, 10), M('#c98b5e'), g, 0, 1.45, 0);
  const arms = [-1, 1].map(s => { const a = new THREE.Group(); a.position.set(s * .22, 1.18, 0); g.add(a); mesh(limbGeo(.06, .4), M(c), a); return a; });
  g.userData.arms = arms; return g;
}
const skirt = mesh(new THREE.BoxGeometry(34, 6, .2), M('#4e4035'), scene, 0, -FT - 3, 2.9, false);
const hole = mesh(new THREE.CircleGeometry(.6, 24), MB('#0a0705'), scene, 0, .005, 0, false);
hole.rotation.x = -Math.PI / 2; hole.scale.set(1, .6, 1); hole.visible = false;

// ====== パーティクル ======
const MAXP = 500;
const pBox = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#fff' }), MAXP);
const pBall = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#fff' }), MAXP);
for (const m of [pBox, pBall]) { m.frustumCulled = false; m.setColorAt(0, new THREE.Color()); scene.add(m); }
const parts = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
function spawn(kind, x, y, z, vx, vy, vz, life, color, size, g = 0, grow = false) {
  if (parts.length > MAXP * 1.6) return;
  parts.push({ kind, x, y, z, vx, vy, vz, life, max: life, color: new THREE.Color(color), size, g, grow, r: Math.random() * 6 });
}
function updateParts(dt) {
  let nb = 0, nl = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r += dt * 6;
    const a = p.life / p.max, sc = p.grow ? p.size * (1.8 - a) * Math.min(1, a * 3) : p.size * Math.min(1, a * 2);
    _q.setFromEuler(_e.set(p.r, p.r * .7, 0)); _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(sc, sc, sc));
    if (p.kind === 'box' && nb < MAXP) { pBox.setMatrixAt(nb, _m); pBox.setColorAt(nb++, p.color); }
    else if (nl < MAXP) { pBall.setMatrixAt(nl, _m); pBall.setColorAt(nl++, p.color); }
  }
  pBox.count = nb; pBall.count = nl;
  for (const m of [pBox, pBall]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}
function confetti(x, y, z, n, colors, spd = 4) {
  for (let i = 0; i < n; i++) spawn('box', x + rnd(.5), y + rnd(.3), z + rnd(.5), rnd(spd), Math.random() * spd * 1.3, rnd(spd), 1.6, pick(colors), .09 + Math.random() * .06, 7);
}

// ====== 状態 ======
let state = 'title', st = 0, lives = 3, score = 0, combo = 0, cleared = 0, stT = 0;
let crime, boss = BOSSES[0], style = styleFor(0), zone = { lo: 40, hi: 60, c: 50 }, power = 0, chargeT = 0, speed = 1;
let pose = { ...STAND }, pry = 0, prot = 0, clones = 0;
let anim = null, judge = null, bossMood = 'angry', bossAnger = .5, bossLine = '';
let shake = 0, crash = null, flash = 0;
const uiParts = [];

function setState(s) { state = s; stT = 0; }
function newGame() { st = 0; lives = 3; score = 0; combo = 0; cleared = 0; setupStage(); }
function setupStage() {
  crime = crimeFor(st); boss = BOSSES[crime.boss]; style = styleFor(st);
  if (roomIdx !== crime.boss) { buildRoom(crime.boss); buildBoss(boss); }
  const w = Math.max(7, 26 - st * 1.4);
  const c = 40 + Math.random() * (88 - w / 2 - 40);
  zone = { lo: c - w / 2, hi: c + w / 2, c };
  speed = .75 + st * .09;
  power = 0; pose = { ...STAND }; pry = 0; prot = 0; clones = 0; crash = null; judge = null; hole.visible = false;
  bossMood = 'angry'; bossAnger = .45 + Math.min(.5, st * .04); bossLine = pick(['どういうつもりだ！', 'キミィ…！', '説明してもらおうか', 'なんてことを…']);
  setState('intro');
}

// ====== 入力 ======
let holding = false;
function down(vx, vy) {
  ac();
  if (state === 'title') { tone(660, .08); tone(990, .12, 'square', .1, 0, .08); newGame(); return; }
  if (state === 'intro' && stT > .35) { holding = true; chargeT = 0; power = 0; setState('charge'); startHum(); return; }
  if (state === 'result' && stT > .7) { nextStage(); return; }
  if (state === 'over' && stT > 1) {
    if (vy > 560 && vy < 620 && vx > 210 && vx < 360) { share(); return; }
    tone(660, .08); newGame();
  }
}
function up() { if (!holding) return; holding = false; if (state === 'charge') release(); }
const toV = e => [(e.clientX - OX) / S, (e.clientY - OY) / S];
ui.addEventListener('pointerdown', e => { e.preventDefault(); const [x, y] = toV(e); down(x, y); });
addEventListener('pointerup', up); addEventListener('pointercancel', up); addEventListener('blur', up);
addEventListener('keydown', e => { if (e.code !== 'Space' && e.code !== 'Enter') return; e.preventDefault(); if (e.repeat) return; down(0, 0); });
addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter') up(); });
ui.addEventListener('contextmenu', e => e.preventDefault());

async function share() {
  const text = `全力土下座で「${rankName()}」になった！ スコア${score}・${cleared}件の罪を許された #全力土下座`;
  const url = location.href.split('#')[0];
  try {
    if (navigator.share) { await navigator.share({ title: '全力土下座', text, url }); return; }
    await navigator.clipboard.writeText(text + ' ' + url);
    uiParts.push({ text: 'コピーしました', x: VW / 2, y: 540, life: 1.2, max: 1.2 });
  } catch (e) {}
}
function rankName() { let r = RANKS[0][1]; for (const [n, name] of RANKS) if (cleared >= n) r = name; return r; }

// ====== 土下座 ======
function release() {
  stopHum();
  const p = power;
  const kind = p < zone.lo ? 'weak' : p <= zone.hi ? 'ok' : 'over';
  const acc = kind === 'ok' ? 1 - Math.abs(p - zone.c) / ((zone.hi - zone.lo) / 2) : 0;
  const perfect = kind === 'ok' && acc > .8;
  anim = { kind, p, acc, perfect, t: 0, landed: false, dur: kind === 'weak' ? .7 : style.space ? 1.9 : style.jump ? 1.15 : .7 };
  if (kind === 'weak') say('すんません', 1.4, 1.1);
  else say(p > 97 ? '申し訳ございませんでしたぁぁぁぁぁ！' : '申し訳ございませんでしたぁ！', 1.3, 1);
  setState('anim');
}
function headPos() { return player.head.getWorldPosition(new THREE.Vector3()); }
function updateAnim(dt) {
  const a = anim; a.t += dt; const u = clamp(a.t / a.dur, 0, 1);
  prot = 0; pry = 0; clones = 0;
  if (a.kind === 'weak') {
    const depth = .2 + .45 * (a.p / Math.max(1, zone.lo));
    pose = lp(STAND, DOGEZA, depth * ease(Math.min(1, u * 2)));
    pose.th = lerp(0, .15, u); pose.sh = 0; pose.hy = lerp(68, 64, u);
    if (u >= 1 && !a.landed) { a.landed = true; tone(220, .25, 'square', .1, -100); finish(); }
    return;
  }
  const land = style.space ? .78 : style.jump ? .72 : .45;
  if (u < land) {
    if (style.space) {
      const v = u / land;
      pose = lp(AIR, DOGEZA, ease(v));
      pry = -900 * Math.pow(1 - v, 2);
      prot = style.spin * Math.PI * 2 * ease(v);
      clones = style.clones;
      const h = headPos();
      for (let i = 0; i < 3; i++) spawn('ball', h.x + rnd(.3), h.y + rnd(.3), h.z + rnd(.3), rnd(.8), 3 + Math.random() * 3, rnd(.8), .45, pick(['#ff6a00', '#ffcc00', '#ff2a00']), .14 + Math.random() * .12, 0, true);
    } else if (style.jump) {
      if (u < .15) pose = lp(STAND, CROUCH, ease(u / .15));
      else {
        const v = (u - .15) / (land - .15);
        pose = v < .5 ? lp(CROUCH, AIR, ease(v * 2)) : lp(AIR, DOGEZA, ease((v - .5) * 2));
        pry = -170 * style.jump * Math.sin(Math.PI * v);
        prot = style.spin * Math.PI * 2 * ease(v);
        clones = style.clones;
      }
    } else {
      pose = u < .2 ? lp(STAND, CROUCH, ease(u / .2)) : lp(CROUCH, DOGEZA, ease((u - .2) / (land - .2)));
    }
  } else {
    pose = { ...DOGEZA };
    const v = (u - land) / (1 - land);
    pose.hy = DOGEZA.hy - 6 * Math.sin(Math.PI * Math.min(1, v * 3)) * (a.p / 100);
    if (!a.landed) {
      a.landed = true;
      const f = a.p / 100, h = headPos();
      shake = .08 + .3 * f; thud(.3 + .6 * f); buzz(30 + 80 * f);
      for (let i = 0; i < 20 + 40 * f; i++) { const ang = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4 * f; spawn('ball', h.x, .05, h.z, Math.cos(ang) * sp, Math.random() * 3 * f + .5, Math.sin(ang) * sp, .8, '#d9cbb5', .1 + Math.random() * .1, 6); }
      if (a.kind === 'over') { startCrash(); return; }
    }
    if (u >= 1) finish();
  }
}
function finish() {
  const a = anim;
  if (a.kind === 'ok') {
    combo++; cleared++;
    const pts = Math.round(100 * (1 + st * .25) * (.5 + .5 * a.acc) * (a.perfect ? 2 : 1) * (1 + .1 * (combo - 1)));
    score += pts;
    bossMood = 'happy'; bossAnger = 0; bossLine = pick(a.perfect ? GOD_LINES : OK_LINES);
    judge = { title: a.perfect ? '神土下座！！' : '許された！', sub: `+${pts}点` + (combo > 1 ? `　${combo}連続` : ''), color: a.perfect ? '#ffd23f' : '#7cf29c', ok: true, perfect: a.perfect };
    if (a.perfect) { confetti(0, 2.5, 0, 80, ['#ffd23f', '#ff6b9a', '#6bd5ff', '#fff']); flash = .5; }
    [523, 659, 784, a.perfect ? 1047 : 0].forEach((f, i) => f && tone(f, .18, 'square', .1, 0, i * .09));
  } else {
    combo = 0; lives--;
    bossMood = 'angry'; bossAnger = 1; bossLine = pick(WEAK_LINES);
    judge = { title: '誠意が足りない！', sub: `謝罪力 ${Math.round(a.p)}%（目標 ${Math.round(zone.lo)}〜${Math.round(zone.hi)}%）`, color: '#ff6b6b', ok: false };
    tone(140, .5, 'sawtooth', .12, -60);
  }
  setState('result');
}

function startCrash() {
  const p = anim.p;
  const idx = p >= 98 ? 6 : clamp(Math.floor((p - zone.hi) / Math.max(.5, 98 - zone.hi) * 6), 0, 5);
  const d1 = idx === 6 ? -(Y_BR - .79) : idx === 0 ? .2 : FT + idx * LH + LH / 2 - .4;
  crash = { idx, t: 0, dur: .6 + idx * .5, d1, done: false };
  bossMood = 'shock'; bossLine = 'どこ行った！？';
  tone(600, crash.dur + .3, 'triangle', .12, -560);
  if (idx > 0) {
    const h = headPos(); hole.position.set(h.x - .15, .006, h.z); hole.visible = true;
    for (let i = 0; i < 30; i++) spawn('box', h.x + rnd(.5), .05, h.z + rnd(.4), rnd(3), 2 + Math.random() * 4, rnd(3), 1.2, boss.floor, .12 + Math.random() * .15, 9);
  }
  setState('crash');
}
function updateCrash(dt) {
  const c = crash; c.t += dt;
  const u = clamp(c.t / c.dur, 0, 1);
  const d = lerp(0, c.d1, c.idx === 0 ? easeOut(u) : u * u * (3 - 2 * u));
  pose = { ...DOGEZA }; pry = d / K; prot = c.idx === 6 ? Math.PI * ease(clamp((u - .7) / .3, 0, 1)) : 0;
  if (u < 1 && c.idx > 0) {
    const li = clamp(Math.floor((d - FT) / LH), 0, 6), h = headPos();
    for (let i = 0; i < 3; i++) spawn('box', h.x + rnd(.5), h.y + .5 + rnd(.3), h.z + rnd(.5), rnd(2), 2 + Math.random() * 3, rnd(2), .6, LAYERS[li].c1, .1 + Math.random() * .12, 4);
  }
  if (u >= 1 && !c.done) {
    c.done = true; shake = .25; thud(.8); buzz(120);
    if (c.idx === 6) {
      combo++; cleared++;
      const pts = Math.round(300 * (1 + st * .25));
      score += pts;
      judge = { title: 'ブラジルで許された！？', sub: `地球の裏側の人に謝ってしまった　+${pts}点`, color: '#ffe14d', ok: true, brazil: true };
      [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, .2, 'square', .1, 0, i * .1));
      say('オブリガード！', 1.1, 1.3);
      for (let i = 0; i < 90; i++) spawn('box', rnd(4), Y_BR - .3 - Math.random() * 3, rnd(1), rnd(3), -Math.random() * 3, rnd(2), 2, pick(['#ffe14d', '#2fa84f', '#2b5fd9', '#fff']), .1, -5);
    } else {
      combo = 0; lives--;
      judge = { title: 'やりすぎ！', sub: `${LAYERS[c.idx].name}までめり込んだ（謝罪力 ${Math.round(anim.p)}%）`, color: '#ff9f43', ok: false };
      tone(180, .5, 'sawtooth', .12, -100, .1);
    }
    setTimeout(() => { if (state === 'crash') setState('result'); }, 350);
  }
}
function nextStage() {
  if (lives <= 0) {
    if (score > best) { best = score; store.set('best', best); }
    if (cleared > bestStage) { bestStage = cleared; store.set('bestStage', bestStage); }
    tone(330, .3, 'triangle', .12); tone(262, .5, 'triangle', .12, 0, .3);
    crash = null; hole.visible = false; pose = { ...DOGEZA }; pry = 0; prot = 0; bossMood = 'happy'; bossLine = '';
    setState('over'); return;
  }
  if (judge && judge.ok) st++;
  tone(880, .06); setupStage();
}

// ====== カメラ ======
const cam = { tx: 0, ty: 1.5, tz: 0, dist: 10, yaw: 0, pitch: .12, roll: 0 };
const camGoal = { ...cam };
function fitDist() {
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const band = .44 * VH * S; // 3Dの見せ場に使える縦幅（px）
  const dV = 3.6 * H / band / (2 * tan);
  const dW = 4.6 / (2 * tan * camera.aspect);
  return Math.max(dV, dW, 6);
}
function updateCamera(dt, t) {
  const base = fitDist(), g = camGoal;
  const hip = player.hips.getWorldPosition(_v);
  Object.assign(g, { tx: 0, ty: 1.45, tz: 0, dist: base, yaw: 0, pitch: .12, roll: 0 });
  if (state === 'title' || state === 'over') { g.yaw = Math.sin(t * .25) * .5; g.dist = base * .95; }
  if (state === 'charge') { const f = power / 100; g.tx = lerp(0, PX * .6, f); g.ty = lerp(1.45, 1, f); g.dist = base * (1 - .32 * f); g.yaw = -.15 * f; }
  if (state === 'anim') {
    g.tx = PX * .5; g.ty = Math.max(1.2, hip.y * .8 + .4); g.dist = base * .85;
    if (anim.kind !== 'weak' && style.spin) g.yaw = -.35;
    if (style.space && anim.t / anim.dur < .78) { g.ty = hip.y * .7 + 1; g.dist = base * 1.05; g.pitch = -.15; }
  }
  if (state === 'result' && judge) {
    if (crash) { g.tx = hip.x + .3; g.ty = hip.y + (crash.idx === 6 ? -.6 : .6); g.dist = Math.min(base, 8); g.pitch = crash.idx === 6 ? .12 : .2; }
    else if (judge.perfect) { g.tx = (PX + BX) / 2 - .3; g.yaw = Math.sin(stT * .8) * .9 - .2; g.dist = base * .8; g.ty = 1.2; }
    else if (!judge.ok) { g.tx = BX * .6; g.ty = 2.2; g.dist = base * .7; g.yaw = .25; }
    else { g.dist = base * .9; }
  }
  if (state === 'crash') { g.tx = hip.x + .3; g.ty = hip.y + .6; g.dist = Math.min(base, 8); g.pitch = .2; if (crash.idx === 6 && crash.t / crash.dur > .55) { g.ty = hip.y - .6; } }
  if (crash && crash.idx === 6 && (state === 'crash' || state === 'result')) g.roll = clamp((crash.t / crash.dur - .5) * 2.2, 0, 1) * Math.PI;
  const k = 1 - Math.exp(-dt * (state === 'crash' ? 10 : 4));
  for (const key in cam) cam[key] = lerp(cam[key], g[key], key === 'ty' && state === 'crash' ? 1 - Math.exp(-dt * 14) : k);
  if (state === 'setup') Object.assign(cam, g);
  const upY = Math.cos(cam.roll), upX = Math.sin(cam.roll);
  camera.up.set(upX, upY, 0);
  const cp = Math.cos(cam.pitch);
  camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, cam.ty + Math.sin(cam.pitch) * cam.dist * upY, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
  camera.position.x += rnd(shake); camera.position.y += rnd(shake);
  camera.lookAt(cam.tx, cam.ty, cam.tz);
  // 背景色・ライト
  const deep = cam.ty < -1;
  scene.background = _c.set(cam.ty < Y_BR + 1 ? '#7fd0ff' : deep ? '#120c08' : boss.bg);
  followLight.intensity = deep ? 40 : 0; followLight.position.set(hip.x + 1, hip.y + 2, 3);
  sun.position.set(3, 9, 7); sun.target.position.set(0, 0, 0);
}

// ====== 更新 ======
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  update(dt, t);
  applyPose(player, pose, -pry * K, prot, PX);
  player.sweat.visible = state === 'charge' || state === 'intro';
  if (player.sweat.visible) player.sweat.position.y = .25 + Math.sin(t * 8) * .02;
  player.suit.emissive.set(state === 'charge' ? (power > 95 ? '#ff2020' : '#ffb000') : '#000');
  player.suit.emissiveIntensity = state === 'charge' ? Math.pow(power / 100, 2) * .8 : 0;
  ghosts.forEach((g, i) => { g.yaw.visible = i < clones; if (i < clones) applyPose(g, pose, -pry * K + (i + 1) * .25, prot - (i + 1) * .5, PX - (i + 1) * .45, -(i + 1) * .5); });
  updateBoss(t, dt);
  if (room) room.traverse(o => {
    if (o.userData.spin) o.rotation.y += dt * 20;
    if (o.userData.bob) o.position.y = 4.2 + Math.sin(t * 1.5) * .25;
    if (o.userData.drift) { o.position.x += o.userData.drift * dt; if (o.position.x > 10) o.position.x = -10; }
  });
  if (train) { train.position.x = ((t * 6) % 26) - 13; }
  fans.forEach((f, i) => f.userData.arms.forEach((a, j) => a.rotation.z = (j ? 1 : -1) * (2.4 + Math.sin(t * 9 + i) * .5)));
  skirt.visible = !crash;
  updateParts(dt);
  updateCamera(dt, t);
  renderer.render(scene, camera);
  drawUI(t);
  requestAnimationFrame(frame);
}
function update(dt, t) {
  stT += dt;
  if (state === 'charge') {
    chargeT += dt;
    const ph = (chargeT * speed) % 2;
    power = (ph < 1 ? ph : 2 - ph) * 100;
    if (hum && AC) hum.o.frequency.setTargetAtTime(110 + power * 7, AC.currentTime, .02);
    pose = lp(STAND, CROUCH, power / 100 * .35);
    pose.hy += Math.sin(chargeT * 60) * power / 100 * 1.5;
    shake = Math.max(shake, power > 85 ? (power - 85) / 15 * .04 : 0);
    if (power > 70 && Math.random() < .5) { const h = player.hips.getWorldPosition(_v); spawn('ball', h.x + rnd(.4), h.y + rnd(.6), rnd(.4), rnd(.3), 1.4, rnd(.3), .5, power > 95 ? '#ff4040' : '#ffd23f', .05 + Math.random() * .05); }
  }
  if (state === 'anim') updateAnim(dt);
  if (state === 'crash') updateCrash(dt);
  if (state === 'title') { const v = (Math.sin(stT * 1.6) + 1) / 2; pose = lp(STAND, DOGEZA, ease(v)); }
  shake *= Math.pow(.02, dt); flash = Math.max(0, flash - dt);
  for (let i = uiParts.length - 1; i >= 0; i--) { const p = uiParts[i]; p.life -= dt; p.y -= 40 * dt; if (p.life <= 0) uiParts.splice(i, 1); }
}

// ====== UI（2Dオーバーレイ） ======
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function txt(s, x, y, size, color, font = FONT_T, align = 'center', stroke = '#1b1430', sw = 0) {
  ctx.font = `${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (sw) { ctx.lineJoin = 'round'; ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function wrap(s, maxW, size, font) {
  ctx.font = `${size}px ${font}`; const lines = []; let cur = '';
  for (const ch of s) { if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch; }
  if (cur) lines.push(cur); return lines;
}
function toScreen(v) { const p = v.clone().project(camera); return [((p.x + 1) / 2 * W - OX) / S, ((1 - p.y) / 2 * H - OY) / S, p.z]; }

function drawGauge() {
  const x0 = 34, x1 = 366, y = 600, h = 34, w = x1 - x0;
  ctx.fillStyle = '#000a'; rr(x0 - 6, y - 30, w + 12, h + 52, 14); ctx.fill();
  txt('謝罪力', x0, y - 14, 15, '#fff', FONT_B, 'left');
  txt(style.name, x1, y - 14, 13, '#ffd23f', FONT_B, 'right');
  ctx.fillStyle = '#2a2340'; rr(x0, y, w, h, 8); ctx.fill();
  const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, '#3a6ea5'); g.addColorStop(.6, '#d9a32b'); g.addColorStop(1, '#d1222f');
  ctx.save(); rr(x0, y, w, h, 8); ctx.clip();
  ctx.globalAlpha = .35; ctx.fillStyle = g; ctx.fillRect(x0, y, w, h); ctx.globalAlpha = 1;
  ctx.fillStyle = g; ctx.fillRect(x0, y, w * power / 100, h);
  ctx.fillStyle = '#7cf29c55'; ctx.fillRect(x0 + w * zone.lo / 100, y, w * (zone.hi - zone.lo) / 100, h);
  ctx.fillStyle = '#ffffff99'; ctx.fillRect(x0 + w * zone.c / 100 - 1, y, 2, h);
  ctx.fillStyle = '#ff2a2a88'; ctx.fillRect(x0 + w * .98, y, w * .02, h);
  ctx.restore();
  ctx.strokeStyle = '#7cf29c'; ctx.lineWidth = 3; rr(x0 + w * zone.lo / 100, y - 2, w * (zone.hi - zone.lo) / 100, h + 4, 4); ctx.stroke();
  const mx = x0 + w * power / 100;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(mx, y + h + 2); ctx.lineTo(mx - 7, y + h + 13); ctx.lineTo(mx + 7, y + h + 13); ctx.closePath(); ctx.fill();
  txt('会釈', x0 + 2, y + h + 12, 11, '#9ab', FONT_B, 'left');
  txt('ブラジル→', x1, y + h + 12, 11, '#ff8a8a', FONT_B, 'right');
}
function drawHUD() {
  const tp = T();
  ctx.fillStyle = '#0008'; rr(10, tp + 12, 150, 34, 17); ctx.fill();
  txt('胃', 28, tp + 29, 15, '#fff', FONT_B);
  for (let i = 0; i < 3; i++) {
    ctx.save(); ctx.translate(52 + i * 34, tp + 29); ctx.rotate(-.5); ctx.globalAlpha = i < lives ? 1 : .2;
    ctx.fillStyle = '#fff'; rr(-12, -6, 12, 12, 6); ctx.fill(); ctx.fillStyle = '#ff6b6b'; rr(0, -6, 12, 12, 6); ctx.fill();
    ctx.restore();
  }
  txt(`${score}点`, VW / 2 + 40, tp + 29, 20, '#fff', FONT_T, 'center', '#1b1430', 5);
}
function drawCard() {
  const y = 66;
  ctx.fillStyle = '#fffdf5'; rr(24, y, VW - 48, 104, 14); ctx.fill();
  ctx.strokeStyle = '#1b1430'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#c0392b'; rr(36, y - 12, 118, 26, 8); ctx.fill();
  txt(`罪状 その${st + 1}`, 95, y + 1, 14, '#fff', FONT_B);
  txt(`相手：${boss.name}`, VW - 40, y + 20, 13, '#666', FONT_B, 'right');
  const lines = wrap(crime.text, VW - 90, 20, FONT_T);
  lines.slice(0, 3).forEach((s, i) => txt(s, VW / 2, y + 52 + (i - (lines.length - 1) / 2) * 26 + 4, 20, '#1b1430', FONT_T));
}
function drawBubble(s) {
  if (!s || !bossRig) return;
  const [x, y, z] = toScreen(bossRig.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .85, 0)));
  if (z > 1 || y < 190 || y > 560) return;
  ctx.font = `16px ${FONT_T}`; const w = Math.min(230, ctx.measureText(s).width + 26);
  const bx = clamp(x - w / 2, L() + 8, R() - w - 8), by = y - 34;
  ctx.fillStyle = '#fff'; rr(bx, by - 20, w, 38, 12); ctx.fill(); ctx.strokeStyle = '#1b1430'; ctx.lineWidth = 2.5; ctx.stroke();
  const tx = clamp(x, bx + 14, bx + w - 14);
  ctx.beginPath(); ctx.moveTo(tx - 6, by + 17); ctx.lineTo(tx + 6, by + 17); ctx.lineTo(tx + 2, by + 30); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
  ctx.fillRect(tx - 5, by + 15, 10, 4);
  txt(s, bx + w / 2, by, 16, '#1b1430', FONT_T);
}
function drawUI(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ui.width, ui.height);
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, ui.width, ui.height); }
  ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * OX, DPR * OY);
  if (state === 'title') return drawTitle(t);
  drawHUD();
  if (state === 'over') return drawOver();
  if (!crash) drawBubble(bossLine);
  if (state === 'intro' || state === 'charge' || state === 'anim') drawCard();
  if (state === 'intro' || state === 'charge') {
    drawGauge();
    if (state === 'intro') { ctx.globalAlpha = .6 + .4 * Math.sin(t * 5); txt('長押しで溜めて、離して土下座！', VW / 2, 686, 16, '#fff', FONT_B, 'center', '#1b1430', 4); ctx.globalAlpha = 1; }
  }
  if (state === 'result' && judge) {
    const k = easeOut(Math.min(1, stT * 4));
    ctx.save(); ctx.translate(VW / 2, 250); ctx.scale(.5 + .5 * k, .5 + .5 * k); ctx.rotate((1 - k) * -.3);
    const lines = wrap(judge.title, 360, 40, FONT_T);
    lines.forEach((s, i) => txt(s, 0, (i - (lines.length - 1) / 2) * 46, lines.length > 1 ? 34 : 40, judge.color, FONT_T, 'center', '#1b1430', 9));
    ctx.restore();
    wrap(judge.sub, 340, 16, FONT_B).forEach((s, i) => txt(s, VW / 2, 600 + i * 22, 16, '#fff', FONT_B, 'center', '#1b1430', 5));
    if (stT > .7) { ctx.globalAlpha = .6 + .4 * Math.sin(t * 5); txt(lives <= 0 ? 'タップで結果へ' : judge.ok ? 'タップで次の罪へ' : 'タップでもう一回謝る', VW / 2, 670, 17, '#fff', FONT_B, 'center', '#1b1430', 4); ctx.globalAlpha = 1; }
  }
  for (const p of uiParts) { ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5); txt(p.text, p.x, p.y, 20, '#fff', FONT_T, 'center', '#1b1430', 4); }
  ctx.globalAlpha = 1;
}
function drawTitle(t) {
  const bg = ctx.createLinearGradient(0, T(), 0, 230); bg.addColorStop(0, '#1b1430ee'); bg.addColorStop(.75, '#1b1430aa'); bg.addColorStop(1, '#1b143000');
  ctx.fillStyle = bg; ctx.fillRect(L(), T(), R() - L(), 230 - T());
  const k = 1 + Math.sin(t * 3) * .03;
  ctx.save(); ctx.translate(VW / 2, 110); ctx.scale(k, k); ctx.rotate(-.04);
  txt('全力', -70, -30, 40, '#fff', FONT_T, 'center', '#c0392b', 10);
  txt('土下座', 30, 26, 64, '#ffd23f', FONT_T, 'center', '#c0392b', 12);
  ctx.restore();
  txt('〜 謝罪力をきわめろ 〜', VW / 2, 192, 16, '#fff', FONT_B, 'center', '#1b1430', 5);
  ctx.fillStyle = '#000b'; rr(30, 548, VW - 60, 120, 16); ctx.fill();
  txt('長押しで謝罪力を溜めて、', VW / 2, 572, 15, '#fff', FONT_B);
  txt('緑のところで離すと許される。', VW / 2, 596, 15, '#fff', FONT_B);
  txt('強すぎると床を突き抜けます。', VW / 2, 620, 15, '#ff9f9f', FONT_B);
  if (best) txt(`ベスト ${best}点（${bestStage}件許された）`, VW / 2, 648, 13, '#ffd23f', FONT_B);
  ctx.globalAlpha = .6 + .4 * Math.sin(t * 5);
  txt('タップでスタート', VW / 2, 696, 20, '#fff', FONT_T, 'center', '#1b1430', 5);
  ctx.globalAlpha = 1;
}
function drawOver() {
  const k = easeOut(Math.min(1, stT * 2));
  ctx.fillStyle = '#1b1430e6'; rr(24, 150, VW - 48, 490, 20); ctx.fill();
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.stroke();
  txt('胃が限界です', VW / 2, 196, 30, '#ff6b6b', FONT_T);
  txt('あなたの謝罪ランク', VW / 2, 252, 15, '#ccc', FONT_B);
  ctx.save(); ctx.translate(VW / 2, 300); ctx.scale(k, k);
  txt(rankName(), 0, 0, 34, '#ffd23f', FONT_T, 'center', '#c0392b', 8); ctx.restore();
  txt(`スコア ${score}点`, VW / 2, 372, 24, '#fff', FONT_T);
  txt(`許された罪：${cleared}件`, VW / 2, 412, 16, '#fff', FONT_B);
  txt(`ベスト ${best}点`, VW / 2, 440, 14, '#ffd23f', FONT_B);
  if (score >= best && score > 0) txt('NEW RECORD!', VW / 2, 470, 18, '#7cf29c', FONT_T);
  ctx.fillStyle = '#c0392b'; rr(40, 560, 150, 56, 14); ctx.fill(); txt('もう一回謝る', 115, 588, 17, '#fff', FONT_T);
  ctx.fillStyle = '#2b5fd9'; rr(210, 560, 150, 56, 14); ctx.fill(); txt('シェア', 285, 588, 18, '#fff', FONT_T);
}

// ====== 起動 ======
(async () => {
  try { await Promise.race([Promise.all([document.fonts.load(`40px ${FONT_T}`), document.fonts.load(`20px ${FONT_B}`)]), new Promise(r => setTimeout(r, 1500))]); } catch (e) {}
  buildUnder(); buildRoom(0); buildBoss(BOSSES[0]);
  requestAnimationFrame(frame);
})();
// テスト・デバッグ用
window.__dogeza = { get state() { return state; }, get power() { return power; }, get zone() { return zone; }, setStage(s) { st = s; setupStage(); }, force(p) { if (state !== 'intro') return; ac(); power = p; release(); }, setLives(n) { lives = n; } };
