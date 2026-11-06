// ばあちゃんターボ — granny smashes through the shopping street with a passenger on her back.
// Smash things for combos, fill the gauge, awaken (FEVER), clear missions to rank up and unlock riders and outfits.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadAll, clone, node } from './assets.js';
import { World } from './world.js';
import { FX, SpeedLines } from './fx.js';
import { audio } from './audio.js';
import { save, persist, missionsFor, rankName, RIDERS, OUTFITS, unlocked } from './save.js';

const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LANES = [-2.4, 0, 2.4];
const FEVER_T = 7;

// ---------------------------------------------------------------- lines
const L = {
  start: ['しっかりつかまっときや！', 'ばあちゃん、本気出すけぇね！', '今日も特売に間に合わせるよ！', '準備運動はいらんよ！'],
  idle: ['若いもんには負けんよ！', '腰？そんなもん知らん！', '昔は新幹線と競争したもんじゃ', 'ブレーキ？なにそれ', 'ひざが…まだいける！', '年金の日は足が軽いのう', 'ばあちゃんの青春はこれからじゃ', '血圧？上がっとるよ！', 'どかんかい、どかんかい！', '今夜は肉じゃがにしようかね'],
  hit: ['あいたたた！', '腰がっ！', 'いまのはノーカン！', 'メガネ、メガネ…', '車が急に出てきた！'],
  near: ['見えとらんかった！', 'ほっほっほ', 'ギリギリセーフじゃ', 'ひょいっとな'],
  fever: ['ばあちゃん覚醒じゃーーー！', '血が騒ぐのう！！', '腰の痛みが消えたーー！', 'どけどけーーい！'],
  combo: ['ほっほっほ！', 'まだまだ！', 'ぜんぶ吹っ飛ばしちゃる！', '気持ちええのう！', 'ばあちゃん無双じゃ！'],
  man: ['ぶちょーーーー！！', '定時で帰りたかったーー！', '有給とっとけばよかったーー！', 'お先に失礼しまーーす！', '会議に遅れるーー！', 'ローンがーーー！'],
  tanuki: ['たぬきさん、ごめんよ！', '縁起物じゃが関係ない！', 'ポンポコー！'],
  vend: ['お茶が出てきたわい', 'ちょうど喉かわいとった', '当たりが出たかね？'],
  over: ['今日はこのへんにしとこか…', '腰が…お茶にしよ…', 'ちょっと休憩じゃ', 'ばあちゃん、燃え尽きたわい'],
};
const RL = { // passenger lines
  kid: { idle: ['ばあちゃん速すぎ！', 'こわいこわいこわい！', 'ばあちゃん前！前！', '宿題どうしよう…', 'ばあちゃん、何キロ出てるの！？', 'みんな見てるって！', '酔ってきた…'], hit: ['ぐえっ', 'ぎゃー！', 'おしり打った…', 'ばあちゃーん！'], fever: ['ばあちゃんが光ってる！？', 'ばあちゃん、目が金色！'], voice: 'kid' },
  shiba: { idle: ['ワン！', 'ワンワン！', 'クゥ〜ン…', '（しっぽが止まらない）'], hit: ['キャイン！', 'ワフッ！'], fever: ['ワオーーーン！'], voice: 'kid' },
  cat: { idle: ['ニャー！', 'フシャーッ！', 'ニャ…（酔った）', '（爪が背中に食い込む）'], hit: ['ギニャー！', 'ニ゛ャッ！'], fever: ['ニャーーーン！'], voice: 'kid' },
  tanuki: { idle: ['……（置物）', '……（たぬき）', '……（ちょっと笑ってる）'], hit: ['……（ヒビ）'], fever: ['……（光ってる）'], voice: null },
  jii: { idle: ['ばあさん、速すぎじゃ！', '入れ歯が飛ぶ〜', 'わしも若い頃は…', '腰がもたん！', 'ばあさん、降ろしてくれ〜'], hit: ['ぐはっ！', '腰がーっ！'], fever: ['ばあさんが若返った！？'], voice: 'jii' },
  salaryman: { idle: ['会社に遅れる！', 'もっと速く！部長命令だ！', '有給とればよかった…', '取引先にこの姿は…'], hit: ['すみませんっ！', '労災ーっ！'], fever: ['これが…出世の速さ…！'], voice: 'man' },
  daruma: { idle: ['……（だるま）', '（七転び八起き）', '……（片目でにらむ）'], hit: ['……（転がりかけた）'], fever: ['……（両目が開いた！）'], voice: null },
};

// ---------------------------------------------------------------- renderer
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
const lines2d = new SpeedLines($('fx'));
let world, fx;

// ---------------------------------------------------------------- state
let state = 'boot';
const P = { dist: 0, speed: 0, t: 0, phase: 0, slideK: 0, x: 0, y: 0, lane: 1 };
let ents = [];
let nextRowAt = 0, ev = {}, shake = 0, hitstop = 0, timeScale = 1, chatterT = 6, nearCd = 0;
let police = null, jiiRide = null, sale = null;
let gran = null, rider = null, riderId = 'kid', eggsObj = null, headCat = null;
let missions = [];

// ---------------------------------------------------------------- characters
function buildGranny() {
  const root = new THREE.Group();
  const m = clone('granny'); m.rotation.y = Math.PI; root.add(m);
  const n = (k) => node(m, 'granny_' + k);
  const g = { root, model: m, hips: n('hips'), torso: n('torso'), head: n('head'), bun: n('bun'), glasses: n('glasses'), teeth: n('teeth'), bag: n('bag'),
    legs: [[n('leg_l'), n('knee_l')], [n('leg_r'), n('knee_r')]], arms: [[n('arm_l'), n('elbow_l'), 1], [n('arm_r'), n('elbow_r'), -1]] };
  g.base = {}; for (const k of ['hips', 'glasses', 'teeth', 'head']) g.base[k] = g[k].position.clone();
  // the cardigan material is per-run: outfits swap it
  g.cardMats = [];
  m.traverse((o) => {
    if (!o.isMesh) return;
    const arr = Array.isArray(o.material);
    const ms = arr ? o.material : [o.material];
    ms.forEach((mm, i) => { if (mm.name === 'cardigan') { const c = mm.clone(); if (arr) o.material[i] = c; else o.material = c; g.cardMats.push(c); } });
  });
  // golden aura for FEVER
  const aura = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  aura.scale.set(0.9, 1.25, 0.9); aura.position.y = 1.0; root.add(aura); g.aura = aura;
  scene.add(root);
  return g;
}
function setOutfit(id) {
  for (const m of gran.cardMats) {
    m.onBeforeCompile = () => {}; m.customProgramCacheKey = () => 'outfit-' + id; m.emissive.set(0x000000); m.metalness = 0; m.roughness = 0.85;
    if (id === 'purple') m.color.set(0xa65ac2);
    else if (id === 'jersey') { m.color.set(0xd8262e); m.roughness = 0.4; }
    else if (id === 'gold') { m.color.set(0xffcf40); m.metalness = 0.9; m.roughness = 0.28; m.emissive.set(0x3a2400); }
    else if (id === 'leopard') {
      m.color.set(0xffffff);
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = 'varying vec3 vOP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vOP = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vOP;
          vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
          float cell(vec2 p){ vec2 i = floor(p), f = fract(p); float d = 9.0; for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = h2(i + g); d = min(d, length(g + o * 0.8 - f)); } return d; }`)
          .replace('#include <map_fragment>', `#include <map_fragment>
          vec2 uvL = vec2(atan(vOP.x, vOP.z) * 1.6, vOP.y * 10.0);
          float cc = cell(uvL);
          vec3 base = vec3(0.86, 0.58, 0.22);
          diffuseColor.rgb = mix(vec3(0.08, 0.05, 0.03), mix(vec3(0.55, 0.3, 0.1), base, smoothstep(0.24, 0.3, cc)), smoothstep(0.16, 0.22, cc));`);
      };
    }
    m.needsUpdate = true;
  }
}
function buildRider(id) {
  if (rider) rider.root.parent?.remove(rider.root);
  if (headCat) headCat.parent?.remove(headCat);
  const r = { id, root: new THREE.Group(), arms: [], legs: [], head: null, mouth: null, tail: null };
  let m;
  if (id === 'kid') {
    m = clone('kid'); r.arms = [node(m, 'kid_arm_l'), node(m, 'kid_arm_r')]; r.legs = [node(m, 'kid_leg_l'), node(m, 'kid_leg_r')]; r.head = node(m, 'kid_head'); r.mouth = node(m, 'kid_mouth');
    r.legs[0].rotation.set(-1.4, 0, 0.5); r.legs[1].rotation.set(-1.4, 0, -0.5);
  } else if (id === 'shiba') {
    m = clone('shiba'); m.scale.setScalar(0.62); m.position.set(0, -0.12, 0.05);
    r.head = node(m, 'shiba_head'); r.tail = node(m, 'shiba_tail');
  } else if (id === 'cat') {
    m = clone('cat'); m.scale.setScalar(1.15); m.position.set(0, -0.05, 0.05); r.tail = node(m, 'cat_tail');
  } else if (id === 'tanuki') {
    m = clone('tanuki'); m.scale.setScalar(0.5); m.position.set(0, -0.05, 0);
  } else if (id === 'jii') {
    m = clone('jii'); m.scale.setScalar(0.85); m.position.set(0, -0.45, 0.05);
    r.arms = [node(m, 'jii_arm_l'), node(m, 'jii_arm_r')]; r.head = node(m, 'jii_head');
  } else if (id === 'salaryman') {
    m = clone('salaryman'); m.scale.setScalar(0.7); m.position.set(0, -0.62, 0.05);
    r.arms = [node(m, 'salaryman_arm_l'), node(m, 'salaryman_arm_r')]; r.legs = [node(m, 'salaryman_leg_l'), node(m, 'salaryman_leg_r')]; r.head = node(m, 'salaryman_head');
    r.legs[0].rotation.set(-1.5, 0, 0.4); r.legs[1].rotation.set(-1.5, 0, -0.4);
  } else { m = clone('daruma'); m.scale.setScalar(0.5); m.position.set(0, -0.05, 0); }
  r.model = m; r.root.add(m);
  r.root.position.set(0, 0.44, -0.2);
  gran.torso.add(r.root);
  // the sale eggs balance on the passenger's head; a stray cat may sit on granny's
  eggsObj = clone('eggs'); eggsObj.visible = false; eggsObj.position.set(0, id === 'kid' ? 0.72 : 0.55, 0); r.root.add(eggsObj);
  headCat = clone('cat'); headCat.scale.setScalar(0.8); headCat.visible = false; headCat.position.set(0, 0.4, 0.02); gran.head.add(headCat);
  rider = r;
}

// ---------------------------------------------------------------- UI: bubbles, pops, toasts
const bubbleEls = {}, bubbleState = {};
function say(who, text, o = {}) {
  let el = bubbleEls[who];
  if (!el) { el = document.createElement('div'); bubbleEls[who] = el; $('bubbles').appendChild(el); }
  el.className = 'bb ' + who + (o.shout ? ' shout' : '');
  el.textContent = text; el.style.display = 'block';
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  bubbleState[who] = { t: o.dur || 2.2, target: o.target || (who === 'kid' ? rider.root : gran.head), y: o.y ?? 0.45 };
  if (o.voice !== false) { const v = who === 'kid' ? RL[riderId].voice : who; if (v) audio.say(text, v); }
  if (who === 'baa' || who === 'kid') chatterT = rnd(6, 10);
}
function riderSay(kind, dur = 1.8) { say('kid', pick(RL[riderId][kind] || RL[riderId].idle), { dur }); }
const _v = new THREE.Vector3();
function updateBubbles(dt) {
  const W = innerWidth, H = innerHeight;
  for (const who in bubbleState) {
    const b = bubbleState[who], el = bubbleEls[who];
    if (b.t <= 0) continue;
    b.t -= dt;
    if (b.t <= 0 || !b.target.parent) { el.style.display = 'none'; b.t = 0; continue; }
    b.target.getWorldPosition(_v); _v.y += b.y; _v.project(camera);
    if (_v.z > 1) { el.style.visibility = 'hidden'; continue; }
    el.style.visibility = 'visible';
    let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
    const bw = el.offsetWidth;
    if (who === 'kid') x += bw * 0.35; else if (who === 'baa') x -= bw * 0.3;
    x = clamp(x, bw / 2 + 8, W - bw / 2 - 8); y = clamp(y, 170, H - 30);
    el.style.transform = `translate(${x - bw / 2}px, ${y - el.offsetHeight - 10}px)`;
  }
}
function hideBubbles() { for (const k in bubbleState) { bubbleState[k].t = 0; bubbleEls[k].style.display = 'none'; } }
function pop(text, cls = '') {
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
  const box = $('pops'); box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), 1650);
}
function toast(html, cls = '') {
  const el = document.createElement('div'); el.className = 'toast ' + cls; el.innerHTML = html;
  $('toasts').appendChild(el); setTimeout(() => el.remove(), 2800);
}
function flash(color = '#fff', a = 0.6) { const f = $('flash'); f.style.transition = 'none'; f.style.background = color; f.style.opacity = a; requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = 0; }); }

// ---------------------------------------------------------------- smashables & hazards
const K = {
  cone: { m: 'cone', w: 0.6, h: 0.8, pts: 10, gauge: 4, words: ['カーン！', 'ポコッ'], sfx: 'clang', deb: [0xff6418, 0xffffff] },
  bucket: { m: 'bucket', w: 0.6, h: 0.8, pts: 10, gauge: 4, words: ['ガコン！', 'ボコッ！'], sfx: 'clang', deb: [0x2f6fd8, 0x24549f, 0x9ad04a, 0xd0c0a0] },
  boxes: { m: 'boxes', w: 0.8, h: 1.4, pts: 20, gauge: 5, words: ['ドサーッ', 'バコーン！'], sfx: 'crunch', deb: [0xc49a62, 0xff9a20, 0xff8a10, 0xe0302a] },
  daruma: { m: 'daruma', w: 0.8, h: 0.9, pts: 50, gauge: 7, words: ['ボヨーン！', 'ころりん'], sfx: 'boing', deb: [0xd51f26, 0xf6f4ef], bouncy: true },
  tanuki: { m: 'tanuki', w: 0.9, h: 1.2, pts: 80, gauge: 9, words: ['ポンッ！', 'たぬーー！'], sfx: 'crunch', deb: [0x7a4a28, 0xe8d2a8, 0xc8a060] },
  watermelons: { m: 'watermelons', w: 1.1, h: 0.75, pts: 60, gauge: 8, words: ['グシャッ！', 'スイカ割り！'], sfx: 'splat', deb: [0xff3a4a, 0xff3a4a, 0x4fae3c, 0x1d5a1e, 0x222222] },
  bicycle: { m: 'bicycle', w: 0.7, h: 1.0, pts: 30, gauge: 5, words: ['ガシャーン！'], sfx: 'clang', deb: [0xd02020, 0xcccccc, 0x222222] },
  vending_machine: { m: 'vending_machine', w: 1.1, h: 2.0, pts: 120, gauge: 18, words: ['ガッシャーン！', 'バリーン！'], sfx: 'glass', deb: [0xd8262e, 0x3a9a4a, 0x2d6bd8, 0xf0a020, 0xffffff], big: true },
  postbox: { m: 'postbox', w: 0.5, h: 1.3, pts: 40, gauge: 6, words: ['ドゴッ！'], sfx: 'clang', deb: [0xd8262e, 0xffffff, 0xffffff] },
  salaryman: { m: 'salaryman', w: 0.6, h: 1.8, pts: 100, gauge: 10, words: ['ぶちょーー！', 'あーれー！'], sfx: 'boing', deb: [0xffffff], person: true },
  pigeon: { m: 'pigeon', w: 0.4, h: 0.4, pts: 15, gauge: 3, words: ['ポッポー！'], sfx: 'pigeon', deb: [0x8e96aa, 0xffffff], light: true },
  jii: { m: 'scooter', w: 0.9, h: 1.6, pts: 500, gauge: 25, words: ['ばあさーーん！', 'じいちゃーん！'], sfx: 'boing', deb: [0xd8262e, 0x8a6a3a], person: true, big: true },
  // hard: costs a 腰 unless awakened (FEVER), then they fly too
  keitora: { m: 'keitora', w: 1.7, len: 3.4, h: 1.8, hard: 'car', pts: 300, gauge: 0, words: ['ドカーーン！！', 'どっかーん！'], sfx: 'smash', deb: [0xf4f4f4, 0x9aa0a8, 0x9fdc6a], big: true },
  car_kei: { m: 'car_kei', w: 1.65, len: 3.5, h: 1.8, hard: 'car', pts: 300, gauge: 0, words: ['ドカーーン！！'], sfx: 'smash', deb: [0xf4f4f4, 0x333333], big: true },
  kouji: { m: 'kouji', w: 2.5, len: 0.4, h: 2.6, hard: 'high', pts: 150, gauge: 0, words: ['バキーン！'], sfx: 'smash', deb: [0xe0202a, 0xffffff, 0xffd21f] },
  guardrail: { m: 'guardrail', w: 2.4, len: 0.3, h: 1.0, hard: 'low', pts: 80, gauge: 0, words: ['ガキーン！'], sfx: 'clang', deb: [0xdddddd, 0xffffff] },
};
const SMALL = ['cone', 'cone', 'bucket', 'boxes', 'boxes', 'daruma', 'tanuki', 'watermelons', 'bicycle', 'postbox'];
const HARD_NAME = { keitora: '軽トラ', car_kei: '軽自動車', kouji: '工事現場', guardrail: 'ガードレール' };

function addEnt(kind, d, x, o = {}) {
  const k = K[kind];
  const obj = clone(o.model || k.m);
  if (o.scaleX) obj.scale.x = o.scaleX;
  obj.rotation.y = o.ry ?? (Math.PI + (k.hard ? 0 : rnd(-0.25, 0.25)));
  obj.position.set(x, 0, -d);
  scene.add(obj);
  const e = { kind, k, obj, d, x, y: 0, w: o.w ?? k.w, len: o.len ?? k.len ?? 0.7, vx: o.vx || 0, vd: o.vd || 0, t: 0, dead: false, fly: null, passed: false, meshes: [], cs: true };
  obj.traverse((m) => { if (m.isMesh) e.meshes.push(m); });
  ents.push(e);
  if (kind === 'salaryman') { e.legs = [node(obj, 'salaryman_leg_l'), node(obj, 'salaryman_leg_r')]; e.arms = [node(obj, 'salaryman_arm_l'), node(obj, 'salaryman_arm_r')]; e.arms[1].rotation.x = -1.4; }
  if (kind === 'pigeon') { e.wings = [node(obj, 'pigeon_wing_l'), node(obj, 'pigeon_wing_r')]; e.wings[0].rotation.z = -1.2; e.wings[1].rotation.z = 1.2; }
  if (kind === 'kouji') e.lamps = [node(obj, 'kouji_lamp_l'), node(obj, 'kouji_lamp_r')];
  return e;
}
function removeEnt(e) { scene.remove(e.obj); e.dead = true; }
function laneBlocked(lane, d) { return (sale && sale.lane === lane && d > sale.d - 70 && d < sale.d + 4) || (jiiRide && jiiRide.lane === lane && d > jiiRide.stopD - 50 && d < jiiRide.stopD + 6); }

function spawnRow(d) {
  const lv = clamp(P.dist / 3000, 0, 1);
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  const ok = (l) => !laneBlocked(l, d);
  const used = new Set();
  if (Math.random() < 0.24 + lv * 0.2) { // one hard thing, sometimes two
    const nHard = Math.random() < 0.25 + lv * 0.35 ? 2 : 1;
    for (let i = 0; i < nHard; i++) {
      const l = lanes[i]; if (!ok(l)) continue;
      const t = Math.random();
      if (t < 0.45) addEnt(Math.random() < 0.5 ? 'keitora' : 'car_kei', d, LANES[l], { vd: Math.random() < 0.35 ? rnd(4, 8) : 0 });
      else if (t < 0.75) addEnt('kouji', d, LANES[l]);
      else addEnt('guardrail', d, LANES[l], { scaleX: 0.6 });
      used.add(l);
    }
    if (Math.random() < 0.12 + lv * 0.1 && P.dist > 250 && used.size === 1 && !sale && !jiiRide) { // a full-width gate: slide!
      for (const l of [0, 1, 2]) if (!used.has(l)) { addEnt('kouji', d, LANES[l]); used.add(l); }
    }
  }
  // smashables fill the rest — that is the fun part
  for (const l of lanes) {
    if (used.has(l)) continue;
    const t = Math.random();
    if (t < 0.1) continue;
    if (t < 0.2 && P.dist > 80) { // a salaryman glued to his phone, sometimes crossing
      const walking = Math.random() < 0.4;
      const e = addEnt('salaryman', d + rnd(-1, 1), LANES[l], { vx: walking ? (Math.random() < 0.5 ? -1.2 : 1.2) : 0, ry: Math.PI });
      if (walking) e.obj.rotation.y = e.vx > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (t < 0.27) {
      for (let k = 0; k < 5; k++) addEnt('pigeon', d + rnd(-1.5, 1.5), LANES[l] + rnd(-0.7, 0.7), { ry: rnd(0, 6.28) });
    } else if (t < 0.33 && P.dist > 150) addEnt('vending_machine', d, LANES[l], { ry: Math.PI });
    else {
      const n = Math.random() < 0.45 ? 2 : 1;
      for (let k = 0; k < n; k++) addEnt(pick(SMALL), d + k * 2.2, LANES[l] + rnd(-0.25, 0.25));
    }
  }
}
function spawnRamp(d) {
  const l = Math.floor(rnd(0, 3));
  const obj = clone('ramp'); obj.rotation.y = Math.PI; obj.position.set(LANES[l], 0, -d); scene.add(obj);
  ents.push({ kind: 'ramp', k: { w: 2.2 }, obj, d, x: LANES[l], y: 0, w: 2.2, len: 5, t: 0, dead: false });
  for (const o of [0, 1, 2]) if (o !== l) addEnt(Math.random() < 0.5 ? 'keitora' : 'car_kei', d - 1, LANES[o]);
  for (let k = 0; k < 3; k++) addEnt(pick(SMALL), d - 10 - k * 3, LANES[l]);
  for (let k = 0; k < 6; k++) addEnt(pick(['boxes', 'tanuki', 'daruma', 'watermelons']), d + 42 + k * 2.5, LANES[k % 3]); // landing zone
  return d + 58;
}
function spawnSale(d) {
  const l = Math.floor(rnd(0, 3));
  for (const e of ents) if (e.k.hard && Math.abs(e.x - LANES[l]) < 1.5 && e.d > d - 75 && e.d < d + 4) removeEnt(e);
  ents = ents.filter((e) => !e.dead);
  const obj = clone('sale'); obj.position.set(LANES[l], 0, -d); obj.rotation.y = Math.PI; scene.add(obj);
  sale = { lane: l, d, obj, pulled: false, done: false };
}
function spawnCat(d) {
  const c = clone('cat'); const from = Math.random() < 0.5 ? -1 : 1;
  c.rotation.y = from < 0 ? Math.PI / 2 : -Math.PI / 2; c.position.set(from * 5, 0, -d); scene.add(c);
  ents.push({ kind: 'cat', k: { w: 0.5 }, obj: c, d, x: from * 5, y: 0, w: 0.5, len: 0.6, dir: -from, walking: false, t: 0, dead: false, tail: node(c, 'cat_tail') });
}
function spawnAhead() {
  const horizon = P.dist + 120;
  while (nextRowAt < horizon) {
    const d = nextRowAt;
    if (d >= ev.ramp) { nextRowAt = spawnRamp(d); ev.ramp = d + rnd(700, 950); continue; }
    if (d >= ev.sale && !sale) { spawnSale(d + 25); ev.sale = d + rnd(850, 1150); }
    if (d >= ev.cat) { spawnCat(d - 5); ev.cat = d + rnd(450, 700); }
    spawnRow(d);
    nextRowAt += Math.max(11, P.speed * 0.62) + rnd(0, 6);
  }
}

// ---------------------------------------------------------------- input
const keys = {};
function act(a) {
  if (state !== 'play' || P.endT) return;
  if (a === 'left') setLane(P.lane - 1);
  else if (a === 'right') setLane(P.lane + 1);
  else if (a === 'up') jump();
  else if (a === 'down') slide();
}
function setLane(l) {
  l = clamp(l, 0, 2);
  if (l === P.lane) return;
  if (sale && sale.pulled && !sale.done && l !== sale.lane && Math.random() < 0.6) say('baa', pick(['たまごーー！', 'そっちじゃない！特売じゃ！', '98円！98円！']), { dur: 1.2, voice: false });
  P.lane = l; audio.sfx('whoosh');
}
function jump() {
  if (P.air) return;
  P.air = true; P.vy = 11.5; P.slide = 0; P.teethT = 0.75;
  audio.sfx('jump');
  if (Math.random() < 0.2) say('baa', pick(['よっこいしょーー！', 'ほいさっ！', '入れ歯がっ！']), { dur: 1 });
  fx.emit('puff', gran.root.position, { n: 5, speed: 1.5, life: 0.5, size: 0.7, up0: 0 });
}
function slide() {
  if (P.air && !P.superJump) P.vy = -22;
  if (P.slide <= 0) audio.sfx('slide');
  P.slide = 0.75;
}
addEventListener('keydown', (e) => {
  if (keys[e.code]) return; keys[e.code] = true;
  const m = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', Space: 'up', ArrowDown: 'down', KeyS: 'down' }[e.code];
  if (m && state === 'play') { e.preventDefault(); act(m); }
  if ((e.code === 'Escape' || e.code === 'KeyP') && state === 'play') pause();
  if ((e.code === 'Enter' || e.code === 'Space') && (state === 'title' || state === 'over')) { e.preventDefault(); start(); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
let tStart = null;
canvas.addEventListener('pointerdown', (e) => { tStart = { x: e.clientX, y: e.clientY, used: false }; audio.resume(); });
canvas.addEventListener('pointermove', (e) => {
  if (!tStart || tStart.used) return;
  const dx = e.clientX - tStart.x, dy = e.clientY - tStart.y, th = Math.min(36, innerWidth * 0.07);
  if (Math.abs(dx) > th && Math.abs(dx) > Math.abs(dy)) { act(dx < 0 ? 'left' : 'right'); tStart.used = true; }
  else if (Math.abs(dy) > th) { act(dy < 0 ? 'up' : 'down'); tStart.used = true; }
});
canvas.addEventListener('pointerup', (e) => {
  if (tStart && !tStart.used && state === 'play') { const fx0 = e.clientX / innerWidth; act(fx0 < 0.33 ? 'left' : fx0 > 0.67 ? 'right' : 'up'); }
  tStart = null;
});
canvas.addEventListener('pointercancel', () => { tStart = null; });

// ---------------------------------------------------------------- scoring, combo, fever, missions
const mult = () => 1 + Math.min(4, Math.floor(P.combo / 10) * 0.5);
function addGauge(n) {
  if (P.fever > 0 || P.endT) return;
  P.gauge = Math.min(100, P.gauge + n);
  if (P.gauge >= 100) startFever();
}
function startFever() {
  P.fever = FEVER_T; P.gauge = 0; P.st.fever++;
  audio.sfx('fever'); audio.setFever(true); flash('#ffe14a', 0.75); shake = 0.6; hitstop = 0.12;
  pop('ばあちゃん覚醒！！', 'gold big'); say('baa', pick(L.fever), { dur: 2, shout: true });
  setTimeout(() => { if (state === 'play') riderSay('fever'); }, 1500);
  document.body.classList.add('fever');
  checkMissions();
}
function smash(e) {
  if (e.fly || e.dead) return;
  const k = e.k;
  P.combo++; P.comboT = 2.6; P.maxCombo = Math.max(P.maxCombo, P.combo);
  P.bonus += Math.round(k.pts * mult()); P.st.smash++;
  P.st[e.kind] = (P.st[e.kind] || 0) + 1;
  addGauge(k.gauge);
  // launch: up, ahead and out to the side, spinning
  const side = Math.sign(e.x - P.x) || (Math.random() < 0.5 ? -1 : 1);
  const heavy = k.big ? 0.75 : 1;
  e.fly = { vx: side * rnd(3, 9) * heavy, vy: rnd(7, 13) * heavy * (k.light ? 0.6 : 1), vd: P.speed * rnd(0.9, 1.35) + rnd(2, 6), wx: rnd(-9, 9), wz: rnd(-9, 9), t: 0 };
  if (k.person) { e.fly.vy = rnd(13, 16); e.fly.vd = P.speed * 1.1; }
  e.obj.visible = true;
  const pos = e.obj.position.clone(); pos.y += (k.h || 1) * 0.5;
  const fwd = new THREE.Vector3(0, 0, -P.speed * 0.8);
  fx.debris(pos, k.deb, { n: k.big ? 22 : 12, speed: k.big ? 9 : 7, vel: fwd, size: k.big ? 0.22 : 0.14 });
  fx.emit('puff', pos, { n: k.big ? 8 : 4, speed: 3, life: 0.5, size: 1.1, grow: 1.5, vel: fwd });
  fx.emit('spark', pos, { n: 1, speed: 0, life: 0.18, size: k.big ? 5 : 3, grow: 2, add: true, vel: new THREE.Vector3(0, 0, -P.speed) });
  fx.word(pick(k.words), pos.clone().add(new THREE.Vector3(0, 1.2, 0)), { size: k.big ? 3 : 2.2, color: P.fever > 0 ? '#ffd23a' : '#ff3d2e', vel: new THREE.Vector3(0, 2.5, -P.speed * 0.9) });
  audio.sfx(k.sfx); audio.sfx('combo', P.combo);
  hitstop = Math.max(hitstop, k.big ? 0.09 : 0.035); shake = Math.max(shake, k.big ? 0.5 : 0.18); P.punch = k.big ? 1 : 0.5;
  if (e.kind === 'salaryman') { say('man', pick(L.man), { target: e.obj, y: 2.2, dur: 1.8 }); e.kiran = true; }
  if (e.kind === 'jii') { say('jii', 'ばあさーーーん！！', { target: e.obj, y: 2, dur: 2 }); e.kiran = true; pop('じいちゃん吹っ飛んだ！', 'gold'); P.st.jii++; setTimeout(() => { if (state === 'play') say('baa', 'じいさん、先に帰っとき！', { dur: 1.8 }); }, 900); }
  if (e.kind === 'vending_machine') { fx.debris(pos, [0x3a9a4a, 0xd8262e, 0x2d6bd8], { n: 12, speed: 8, size: 0.18, vel: fwd }); if (Math.random() < 0.4) say('baa', pick(L.vend), { dur: 1.4 }); }
  if (e.kind === 'tanuki' && Math.random() < 0.3) say('baa', pick(L.tanuki), { dur: 1.3 });
  if (e.kind === 'pigeon') fx.emit('feather', pos, { n: 3, speed: 3, life: 1.2, size: 0.35, g: -1.5, vel: new THREE.Vector3(0, 0, -P.speed * 0.5) });
  if (k.hard) pop(`${HARD_NAME[e.kind]}も吹っ飛ぶ！`, 'small');
  if ([10, 25, 50, 100, 150, 200, 300].includes(P.combo)) {
    pop(`${P.combo} COMBO!!`, P.combo >= 50 ? 'gold big' : 'gold'); flash('#fff4b0', 0.35);
    if (P.combo >= 25) say('baa', pick(L.combo), { dur: 1.4 });
  }
  checkMissions();
  renderCombo(true);
}
function hurt(e) {
  if (P.inv > 0 || P.endT) return;
  if (P.fever > 0) { smash(e); return; }
  P.hp--; P.inv = 1.8; P.slow = 1; shake = 0.8; hitstop = 0.14;
  if (P.combo >= 5) pop(`${P.combo}コンボ…途切れた`, 'small');
  P.combo = 0; P.comboT = 0; P.noHitFrom = P.dist; renderCombo(true);
  audio.sfx('hit'); flash('#ff3355', 0.4);
  P.riderVy = 7; P.glassesT = 1.2;
  fx.emit('star', gran.head.getWorldPosition(_v), { n: 7, speed: 2.5, life: 0.8, size: 0.45, g: -4, vel: new THREE.Vector3(0, 0, -P.speed * 0.8) });
  fx.word(pick(['ドーン！', 'ゴツン！', 'ガーン！']), gran.root.position.clone().add(new THREE.Vector3(0, 2.2, -1)), { size: 2.4, color: '#7ab8ff', vel: new THREE.Vector3(0, 1, -P.speed * 0.6) });
  renderHud(true); const ks = $('koshi').children[P.hp]; if (ks) ks.classList.add('ouch');
  if (P.eggs) {
    P.eggs = false; eggsObj.visible = false; audio.sfx('splat');
    fx.debris(eggsObj.getWorldPosition(_v), [0xffffff, 0xffb300, 0xffd84a], { n: 12, speed: 4 });
    setTimeout(() => { if (state === 'play') say('kid', riderId === 'kid' ? 'たまごがーーー！' : pick(RL[riderId].hit), { dur: 1.6 }); }, 500);
  } else setTimeout(() => { if (state === 'play') riderSay('hit', 1.3); }, 600);
  say('baa', P.hp <= 0 ? 'あ…腰が…' : pick(L.hit), { dur: 1.6 });
  e.bump = 0.3;
  if (P.hp <= 0) endRun();
}
function nearMiss() {
  if (nearCd > 0) return;
  nearCd = 1.2; P.st.near++;
  audio.sfx('near'); addGauge(8); P.bonus += Math.round(30 * mult());
  pop('ギリギリ！', 'small');
  if (Math.random() < 0.25) say('baa', pick(L.near), { dur: 1.2 });
}
function stat(k) {
  const S = P.st;
  switch (k) {
    case 'dist': return P.dist; case 'smash': return S.smash; case 'combo': return P.maxCombo; case 'tanuki': return S.tanuki || 0;
    case 'man': return S.salaryman || 0; case 'fever': return S.fever; case 'score': return P.score; case 'ramp': return S.ramp;
    case 'jii': return S.jii; case 'cop': return S.cop; case 'nohit': return P.dist - P.noHitFrom; case 'melon': return S.watermelons || 0;
    case 'vend': return S.vending_machine || 0; case 'egg': return P.eggs && P.dist - P.eggFrom >= 300 ? 1 : 0;
  }
  return 0;
}
function checkMissions() {
  missions.forEach((m, i) => {
    if (save.done[i] || stat(m.k) < m.n) return;
    save.done[i] = true; persist();
    audio.sfx('mission'); toast(`<b>ミッション達成！</b>${m.text}`, 'ok');
    if (save.done.every(Boolean)) setTimeout(() => toast('<b>3つ達成！</b>この走りが終わったら段位アップ', 'gold'), 900);
  });
}

// ---------------------------------------------------------------- events
function superJump() {
  P.air = true; P.superJump = true; P.vy = 15.5; P.flip = 0; P.slide = 0;
  timeScale = 0.5; audio.sfx('jump'); audio.sfx('scream');
  say('baa', '飛ぶでーーー！', { dur: 1.6, shout: true });
  setTimeout(() => { if (state === 'play') say('kid', riderId === 'kid' ? 'ぎゃああああ！！' : pick(RL[riderId].hit), { dur: 1.8 }); }, 400);
  P.teethT = 1.6;
}
function landSuper() {
  P.superJump = false; timeScale = 1; shake = 0.9; hitstop = 0.1; P.st.ramp++;
  audio.sfx('land'); audio.sfx('smash');
  fx.emit('puff', gran.root.position, { n: 18, speed: 5, life: 0.9, size: 1.4, up0: 0, upMul: 0.3 });
  fx.emit('ring', gran.root.position.clone().add(new THREE.Vector3(0, 0.3, 0)), { n: 1, speed: 0, life: 0.4, size: 2, grow: 6 });
  for (const e of ents) if (!e.dead && !e.fly && e.k && e.k.pts && !e.k.hard && Math.abs(e.d - P.dist) < 9) smash(e); // landing shockwave
  const sc = [pick([9.5, 10, 10]), 10, pick([9, 10, 8.5])];
  P.bonus += 300; addGauge(25);
  pop('着地 決まった！', 'gold');
  setTimeout(() => pop(`審査員　${sc.join('　')}`, 'small'), 400);
  checkMissions();
}
function startPolice() {
  const o = clone('police'); o.rotation.y = Math.PI; scene.add(o);
  police = { obj: o, d: P.dist - 30, x: LANES[P.lane === 2 ? 1 : 2], t: 0, step: 0, gone: false, siren: 0, side: P.lane === 2 ? -1 : 1, lights: [node(o, 'police_light_l'), node(o, 'police_light_r')], cop: node(o, 'police_cop') };
  pop('パトカーが来た！', 'small');
}
function updatePolice(dt) {
  const c = police; c.t += dt; c.siren -= dt;
  if (c.fly) {
    const f = c.fly; f.t += dt; f.vy -= 16 * dt; c.obj.position.y += f.vy * dt; c.d += f.vd * dt; c.obj.position.z = -c.d; c.obj.position.x += f.vx * dt;
    c.obj.rotation.x += 3 * dt; c.obj.rotation.z += 4 * dt;
    if (f.t > 2.5) { scene.remove(c.obj); police = null; }
    return;
  }
  if (c.siren <= 0 && !c.gone) { audio.sfx('siren'); c.siren = 2; }
  const lines = [
    [1.2, () => say('cop', 'そこの おばあちゃん！止まりなさい！', { target: c.cop, y: 0.6, dur: 2.2 })],
    [3.6, () => say('baa', pick(['わしは歩行者じゃ！', '急いどるんじゃ！', '特売が終わってしまう！']), { dur: 1.8 })],
    [6.0, () => say('cop', '時速100キロの歩行者がいるかーー！', { target: c.cop, y: 0.6, dur: 2.4 })],
    [8.4, () => riderSay('idle')],
    [10.2, () => say('baa', '捕まえてみぃ！ほっほっほ', { dur: 1.8 })],
    [12.5, () => { c.gone = true; say('cop', 'ハトがーーー！前が見えん！', { target: c.cop, y: 0.6, dur: 2.2 }); audio.sfx('pigeon'); }],
  ];
  if (c.step < lines.length && c.t > lines[c.step][0]) { lines[c.step][1](); c.step++; }
  let ln = P.lane + c.side; if (ln < 0 || ln > 2) { c.side *= -1; ln = P.lane + c.side; }
  if (c.gone) c.d += P.speed * 0.3 * dt;
  else { c.d += P.speed * dt; c.d += (P.dist + 1.5 + Math.sin(c.t * 0.8) * 1.5 - c.d) * Math.min(1, dt * 0.8); c.x += (LANES[ln] - c.x) * Math.min(1, dt * 2); }
  c.obj.position.set(c.x, 0, -c.d);
  c.obj.rotation.y = Math.PI + (c.gone ? Math.sin(c.t * 8) * 0.3 : 0);
  const blink = Math.floor(c.t * 6) % 2; c.lights[0].visible = !!blink; c.lights[1].visible = !blink;
  if (P.fever > 0 && !c.gone && Math.abs(c.d - P.dist) < 3) { // awakened granny body-checks the patrol car
    c.fly = { t: 0, vy: 14, vd: P.speed * 1.2, vx: (c.x - P.x) * 3 };
    P.bonus += Math.round(1000 * mult()); P.st.cop++; pop('パトカーも吹っ飛んだ！', 'gold big'); audio.sfx('smash'); hitstop = 0.15; shake = 1;
    say('cop', 'ばあちゃん強すぎーー！', { target: c.cop, y: 0.6, dur: 2 }); checkMissions(); return;
  }
  if (c.gone) {
    if (Math.random() < 0.5) fx.emit('feather', c.obj.position.clone().add(new THREE.Vector3(0, 1.6, 0)), { n: 1, speed: 2, life: 1, size: 0.4, g: -1 });
    if (c.t > 13.2 && !c.bonus) { c.bonus = true; P.st.cop++; P.bonus += 500; pop('パトカーをまいた！', 'gold'); checkMissions(); }
    if (P.dist - c.d > 60) { scene.remove(c.obj); police = null; }
  }
}
function startJii() {
  const o = new THREE.Group(); const sc = clone('scooter'); sc.rotation.y = Math.PI; o.add(sc);
  const j = clone('jii'); j.rotation.y = Math.PI; j.position.set(0, 0.12, 0.2); o.add(j);
  scene.add(o);
  const side = Math.random() < 0.5 ? -1 : 1, lane = side < 0 ? 0 : 2;
  jiiRide = { obj: o, flame: node(sc, 'scooter_flame'), d: P.dist - 18, x: side * 3.7, t: 0, phase: 'pass', said: 0, lane, stopD: P.dist + 120 };
  for (const e of ents) if (e.k.hard && Math.abs(e.x - LANES[lane]) < 1.5 && e.d > jiiRide.stopD - 50 && e.d < jiiRide.stopD + 6) removeEnt(e);
  ents = ents.filter((e) => !e.dead);
  audio.sfx('turbo');
}
function updateJii(dt) {
  const g = jiiRide; g.t += dt;
  if (g.phase === 'pass') {
    g.d += (P.speed + 10) * dt;
    if (!g.said && g.d > P.dist - 3) { g.said = 1; say('jii', 'ばあさんや、お先に〜！', { target: g.obj, y: 2.2, dur: 2 }); }
    if (g.said === 1 && g.d > P.dist + 8) { g.said = 2; say('baa', 'なんじゃと！？じいさんに負けるかい！', { dur: 2, shout: true }); addGauge(30); }
    if (g.d > g.stopD - 25) g.phase = 'swerve';
  } else if (g.phase === 'swerve') {
    g.d += (P.speed + 3) * dt; g.x += (LANES[g.lane] - g.x) * Math.min(1, dt * 2);
    if (g.d >= g.stopD) {
      g.phase = 'stall'; g.t = 0; say('jii', 'あれ…バッテリー切れじゃ…', { target: g.obj, y: 2.2, dur: 2.4 }); audio.sfx('puff');
      const e = { kind: 'jii', k: K.jii, obj: g.obj, d: g.d, x: LANES[g.lane], y: 0, w: 0.9, len: 1.4, t: 0, dead: false, fly: null, passed: false };
      ents.push(e); g.ent = e; // now he is a target
    }
  } else {
    if (Math.random() < 0.3 && !g.ent.fly) fx.emit('smoke', g.obj.position.clone().add(new THREE.Vector3(0, 0.6, 1.2)), { n: 1, speed: 0.8, life: 1.2, size: 0.8, grow: 1.5, upMul: 1.5 });
    if (!g.ent.fly && !g.passed && P.dist > g.d + 1) { g.passed = true; P.bonus += 200; pop('じいちゃん抜き！', 'small'); say('baa', 'おさきに〜♪', { dur: 1.4 }); }
    if (g.ent.dead || P.dist - g.d > 30) { if (!g.ent.dead) removeEnt(g.ent); jiiRide = null; }
    return;
  }
  g.obj.position.set(g.x, 0, -g.d);
  if (g.flame) { g.flame.visible = g.phase !== 'stall'; g.flame.scale.setScalar(0.8 + Math.random() * 0.5); }
}

// ---------------------------------------------------------------- game flow
function resetGame() {
  for (const e of ents) removeEnt(e);
  ents = [];
  if (police) { scene.remove(police.obj); police = null; }
  if (jiiRide) { scene.remove(jiiRide.obj); jiiRide = null; }
  if (sale) { scene.remove(sale.obj); sale = null; }
  Object.assign(P, {
    lane: 1, x: 0, y: 0, vy: 0, air: false, superJump: false, flip: 0, slide: 0, slideK: 0, hp: 3, inv: 0, slow: 0,
    speed: 0, dist: 0, score: 0, bonus: 0, combo: 0, comboT: 0, maxCombo: 0, gauge: 0, fever: 0, t: 0, phase: 0, teethT: 0, glassesT: 0,
    eggs: false, eggFrom: 0, endT: 0, riderOff: 0, riderVy: 0, catT: 0, punch: 0, noHitFrom: 0, pullT: 0, _mc: 0,
    st: { smash: 0, fever: 0, ramp: 0, jii: 0, cop: 0, near: 0 },
  });
  nextRowAt = 40;
  ev = { ramp: 650, sale: 380, police: 950, jii: 1350, cat: 260 };
  timeScale = 1; shake = 0; hitstop = 0;
  hideBubbles(); fx.clear(); world.reset(); world.update(0, camera.position, 0);
  gran.root.position.set(0, 0, 0); gran.root.rotation.set(0, 0, 0); gran.root.scale.setScalar(1);
  eggsObj.visible = false; headCat.visible = false;
  document.body.classList.remove('fever'); audio.setFever(false);
  renderHud(true); renderCombo(true);
}
function start() {
  audio.init(); audio.startMusic();
  missions = missionsFor(save.rank);
  if (riderId !== save.rider) { riderId = save.rider; buildRider(riderId); }
  setOutfit(save.outfit);
  resetGame();
  state = 'play'; save.plays++; persist();
  for (const id of ['title', 'over', 'pause']) show(id, false);
  show('hud', true);
  say('baa', pick(L.start), { dur: 2.2 });
  setTimeout(() => { if (state === 'play') riderSay('idle', 1.6); }, 1500);
  pop('よーい…ドン！');
  if (save.plays <= 3) { show('howto', true); setTimeout(() => show('howto', false), 4500); }
}
function endRun() {
  P.endT = 0.001; P.fever = 0; document.body.classList.remove('fever'); audio.setFever(false);
  audio.sfx('over');
  setTimeout(() => { if (state === 'play') say('baa', pick(L.over), { dur: 3 }); }, 1300);
}
const TITLES = [[200, '近所のお散歩ばあちゃん'], [500, '商店街のうわさ'], [900, '町内会の韋駄天'], [1500, '市内最速ばあちゃん'], [2200, '伝説の暴走ばあちゃん'], [3200, '音速の老婆'], [4500, '光速ばあちゃん'], [1e9, '宇宙ばあちゃん']];
function showResult() {
  state = 'over';
  checkMissions();
  const d = Math.floor(P.dist);
  const isBest = P.score > save.best;
  save.best = Math.max(save.best, P.score); save.bestDist = Math.max(save.bestDist, d);
  const missionHtml = missions.map((m, i) => `<li class="${save.done[i] ? 'ok' : ''}"><i>${save.done[i] ? '✔' : ''}</i><span>${m.text}</span>${save.done[i] ? '' : `<em>${Math.floor(Math.min(stat(m.k), m.n))}/${m.n}</em>`}</li>`).join('');
  let ranked = null; const before = save.rank;
  if (save.done.every(Boolean)) { save.rank++; save.done = [false, false, false]; ranked = save.rank; }
  persist();
  $('r-quote').textContent = '「' + pick(['腰が痛いけど、楽しかったのう', 'また明日も走ろうかね', '次は特売に間に合わせるよ', '町内会に自慢しよ']) + '」';
  $('r-title').textContent = TITLES.find((t) => d < t[0])[1];
  $('r-dist').textContent = d;
  $('r-new').classList.toggle('on', isBest && P.score > 100);
  const S = P.st;
  const rows = [['💥 吹っ飛ばした数', S.smash], ['🔥 最大コンボ', P.maxCombo], ['✨ 覚醒', S.fever + '回'], ['🦝 たぬき', (S.tanuki || 0) + '体'], ['👔 サラリーマン', (S.salaryman || 0) + '人'], ['🍉 スイカ', (S.watermelons || 0) + '箱'], ['🥤 自販機', (S.vending_machine || 0) + '台']];
  if (S.jii) rows.push(['🛵 じいちゃん', S.jii + '回']);
  if (S.cop) rows.push(['🚓 パトカー', S.cop + '回']);
  $('r-stats').innerHTML = rows.map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join('');
  $('r-missions').innerHTML = missionHtml;
  const target = P.score, el = $('r-score'), t0 = performance.now() + 350; el.textContent = '0';
  const step = () => {
    if (state !== 'over') return;
    const k = clamp((performance.now() - t0) / 1200, 0, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))).toLocaleString();
    if (k < 1) { if (k > 0) audio.sfx('tick'); setTimeout(step, 40); }
  };
  setTimeout(step, 350);
  const rk = $('r-rank');
  if (ranked) {
    const unlocks = [...RIDERS, ...OUTFITS].filter((x) => x.rank === ranked);
    rk.innerHTML = `<div class="ru">段位アップ！</div><div class="rn">${before}段 → <b>${ranked}段「${rankName(ranked)}」</b></div>` + unlocks.map((u) => `<div class="un">🎁 解放：${u.name}</div>`).join('');
    rk.classList.add('on'); setTimeout(() => { audio.sfx('rankup'); flash('#ffe14a', 0.5); }, 600);
  } else { rk.classList.remove('on'); rk.innerHTML = ''; }
  show('over', true); show('hud', false); hideBubbles();
  renderTitle();
}
function pause() { if (state !== 'play') return; state = 'pause'; show('pause', true); audio.hush(); audio.stopMusic(); }
function resume() { if (state !== 'pause') return; state = 'play'; show('pause', false); audio.startMusic(); last = performance.now(); }
function toTitle() {
  state = 'title'; for (const id of ['pause', 'over', 'hud']) show(id, false); show('title', true); audio.stopMusic(); audio.hush();
  resetGame(); renderTitle();
}
function show(id, on) { $(id).classList.toggle('on', on); }

// ---------------------------------------------------------------- update
const tmp = new THREE.Vector3();
function update(dt) {
  P.t += dt;
  const base = Math.min(38, 17 + P.dist * 0.005);
  let target = base * (P.fever > 0 ? 1.35 : 1) * (1 - P.slow * 0.55);
  if (P.t < 1.4) target *= P.t / 1.4;
  if (P.endT) target = 0;
  P.speed += (target - P.speed) * Math.min(1, dt * (P.endT ? 1.6 : 3));
  P.dist += P.speed * dt;
  for (const k of ['inv', 'slide', 'teethT', 'glassesT', 'catT']) if (P[k] > 0) P[k] = Math.max(0, P[k] - dt);
  P.slow = Math.max(0, P.slow - dt * 0.8); P.punch = Math.max(0, P.punch - dt * 5);
  nearCd -= dt;
  if (P.fever > 0) { P.fever -= dt; if (P.fever <= 0) { P.fever = 0; document.body.classList.remove('fever'); audio.setFever(false); pop('覚醒おわり', 'small'); P.inv = 1; } }
  if (P.comboT > 0) { P.comboT -= dt; if (P.comboT <= 0) { if (P.combo >= 10) pop(`${P.combo} コンボ！`, 'small'); P.combo = 0; renderCombo(true); } }
  if (P.catT <= 0 && headCat.visible) { headCat.visible = false; say('baa', 'ねこちゃん、またね〜', { dur: 1.4 }); }

  // the sale sign pulls granny in
  if (sale && !sale.done) {
    if (!sale.pulled && P.dist > sale.d - 55) {
      sale.pulled = true; P.lane = sale.lane; audio.sfx('sale');
      say('baa', '特売じゃーーーー！！', { dur: 2, shout: true }); pop('ばあちゃんが特売に吸い寄せられる！', 'small');
    }
    if (sale.pulled && P.lane !== sale.lane && (P.pullT -= dt) <= 0) { P.lane += Math.sign(sale.lane - P.lane); P.pullT = 0.9; }
    if (P.dist > sale.d + 1) {
      sale.done = true;
      if (Math.abs(P.x - LANES[sale.lane]) < 1.4) {
        P.eggs = true; P.eggFrom = P.dist; eggsObj.visible = true; audio.sfx('bonus'); addGauge(20);
        P.bonus += 300; pop('たまご ゲット！ 割るなよ', 'gold'); say('baa', pick(['98円じゃ！ほっほっほ', 'おひとり様1パックまで！']), { dur: 1.8 });
      } else say('baa', 'あぁ…たまごが遠ざかる…', { dur: 1.8 });
    }
  }
  if (sale && sale.done && P.dist > sale.d + 25) { scene.remove(sale.obj); sale = null; }

  // movement
  P.x += (LANES[P.lane] - P.x) * Math.min(1, dt * 14);
  let groundY = 0;
  for (const e of ents) if (e.kind === 'ramp' && Math.abs(e.x - P.x) < 1.3) { const k = (P.dist - (e.d - 2.5)) / 5; if (k > 0 && k < 1) groundY = 1.4 * k; if (k >= 1 && k < 1.4 && !P.superJump && P.y < 1.8 && !P.endT) superJump(); }
  if (P.air) {
    P.vy += (P.superJump ? -15 : -30) * dt; P.y += P.vy * dt;
    if (P.superJump) P.flip = Math.min(1, P.flip + dt / 2.0);
    if (P.y <= groundY && P.vy < 0) { P.y = groundY; P.air = false; P.vy = 0; if (P.superJump) landSuper(); else { audio.sfx('land'); fx.emit('puff', gran.root.position, { n: 4, speed: 1.2, life: 0.4, size: 0.6, up0: 0 }); } }
  } else P.y = groundY;
  if (P.riderVy || P.riderOff > 0) { P.riderVy -= 22 * dt; P.riderOff += P.riderVy * dt; if (P.riderOff <= 0) { P.riderOff = 0; P.riderVy = 0; } }

  if (!P.endT) {
    spawnAhead();
    if (!police && P.dist > ev.police) { startPolice(); ev.police = P.dist + rnd(1800, 2400); }
    if (!jiiRide && P.dist > ev.jii) { startJii(); ev.jii = P.dist + rnd(1600, 2200); }
  }
  if (police) updatePolice(dt);
  if (jiiRide) updateJii(dt);

  // entities
  const fev = P.fever > 0;
  for (const e of ents) {
    if (e.dead) continue;
    e.t += dt;
    if (e.fly) {
      const f = e.fly; f.t += dt; f.vy -= 24 * dt;
      e.obj.position.x += f.vx * dt; e.obj.position.y += f.vy * dt; e.d += f.vd * dt; e.obj.position.z = -e.d;
      e.obj.rotation.x += f.wx * dt; e.obj.rotation.z += f.wz * dt;
      if (e.obj.position.y < 0 && f.vy < 0) { e.obj.position.y = 0; f.vy *= e.k.bouncy ? -0.75 : -0.35; f.vd *= 0.6; f.vx *= 0.7; f.wx *= 0.6; f.wz *= 0.6; }
      if (Math.abs(e.obj.position.x) > 7.3) { e.obj.position.x = Math.sign(e.obj.position.x) * 7.3; f.vx *= -0.3; } // into the shop fronts
      if (e.kiran && f.t > 1.2) { e.kiran = false; fx.emit('star', e.obj.position, { n: 1, speed: 0, life: 0.7, size: 3, grow: -0.5 }); audio.sfx('kiran'); removeEnt(e); continue; }
      if (f.t > 2.4 || e.d - P.dist > 140 || (f.t > 0.2 && e.d < P.dist + 1.5)) removeEnt(e);
      continue;
    }
    if (e.vd) e.d += e.vd * dt;
    if (e.vx) { e.x += e.vx * dt; if (Math.abs(e.x) > 3.4) { e.vx *= -1; e.obj.rotation.y += Math.PI; e.x = clamp(e.x, -3.4, 3.4); } }
    const dd = e.d - P.dist;
    e.obj.position.set(e.x, e.y, -e.d);
    e.obj.visible = dd < 85;
    const cs = dd < 24 && dd > -4; // only nearby things cast shadows
    if (e.meshes && e.cs !== cs) { e.cs = cs; for (const m of e.meshes) m.castShadow = cs; }
    if (e.bump > 0) { e.bump -= dt; e.obj.position.y = Math.abs(Math.sin(e.bump * 30)) * 0.1; }
    switch (e.kind) {
      case 'salaryman': { const sw = e.vx ? Math.sin(e.t * 8) * 0.6 : 0; e.legs[0].rotation.x = sw; e.legs[1].rotation.x = -sw; if (dd < 14 && dd > 0 && !e.noticed) { e.noticed = true; if (Math.random() < 0.25) say('man', pick(['え？ばあちゃん！？', 'うわっ！', '…（スマホに夢中）']), { target: e.obj, y: 2.1, dur: 1.2, voice: false }); } break; }
      case 'pigeon': { if (dd < 7) e.up = true; if (e.up) { e.y += 3 * dt; const a = Math.sin(e.t * 30) * 0.9; e.wings[0].rotation.z = a; e.wings[1].rotation.z = -a; } else e.obj.rotation.x = Math.sin(e.t * 6 + e.d) > 0.6 ? 0.4 : 0; break; }
      case 'kouji': { const b = Math.floor(e.t * 4) % 2; e.lamps[0].visible = !!b; e.lamps[1].visible = !b; break; }
      case 'cat': {
        if (!e.walking && dd < 36) e.walking = true;
        if (e.walking) { e.x += e.dir * 2.2 * dt; if (e.tail) e.tail.rotation.z = Math.sin(e.t * 5) * 0.4; }
        if (Math.abs(dd) < 1 && Math.abs(P.x - e.x) < 1.3 && !headCat.visible && !P.endT) {
          headCat.visible = true; P.catT = 16; audio.sfx('meow'); removeEnt(e); addGauge(15);
          pop('ねこが頭に乗った！', 'gold'); say('baa', 'あら〜ねこちゃん♡', { dur: 1.6 });
          fx.emit('heart', gran.head.getWorldPosition(tmp), { n: 5, speed: 1, life: 1, size: 0.4, vel: new THREE.Vector3(0, 0, -P.speed) });
          continue;
        }
        if (Math.abs(e.x) > 7) { removeEnt(e); continue; }
        break;
      }
    }
    if (P.endT || e.kind === 'cat' || e.kind === 'ramp') { if (dd < -14) removeEnt(e); continue; }
    const ox = Math.abs(e.x - P.x) < e.w / 2 + 0.35, od = Math.abs(dd) < e.len / 2 + 0.4;
    if (e.k.hard) {
      if (fev && dd < 4 && dd > -1 && Math.abs(e.x - P.x) < 3.3) { smash(e); continue; }
      if (ox && od) {
        const hit = { car: P.y < 1.9, high: P.slide <= 0, low: P.y < 0.95 }[e.k.hard];
        if (hit) { e.wasHit = true; hurt(e); continue; }
      }
      if (!e.passed && dd < -e.len / 2 - 0.5) { e.passed = true; if (!e.wasHit && Math.abs(e.x - P.x) < e.w / 2 + 1.7 && Math.abs(e.x - P.x) > e.w / 2 + 0.2 && P.speed > 18) nearMiss(); }
    } else if (e.k.pts) {
      const wave = fev && dd < 4 && dd > -1 && Math.abs(e.x - P.x) < 3.3; // awakened: a shockwave takes everything in reach
      if (((ox && od && P.y < (e.k.h || 1) + 0.3) || wave) && !(e.kind === 'pigeon' && e.y > 2.5)) { smash(e); continue; }
    }
    // the chase camera must not drive through what granny already passed
    if (dd < -1.2 && Math.abs(e.x - P.x * 0.55) < e.w / 2 + 1.0) e.obj.visible = false;
    if (dd < -14 || dd > 400) removeEnt(e);
  }
  ents = ents.filter((e) => !e.dead);

  chatterT -= dt;
  if (chatterT <= 0 && !P.endT) { if (Math.random() < 0.6) say('baa', pick(L.idle), { dur: 2.2 }); else riderSay('idle', 2); }

  P.score = Math.floor(P.dist) + P.bonus;
  audio.setTempo(clamp(0.9 + P.speed / 60, 1, 1.7));
  if (fev && Math.random() < 0.35) fx.emit('spark', gran.root.position.clone().add(new THREE.Vector3(rnd(-0.6, 0.6), rnd(0.2, 2), rnd(-0.3, 0.6))), { n: 1, speed: 1, life: 0.4, size: 0.35, add: true, vel: new THREE.Vector3(0, 1, 2) });
  if (!P.endT && P.dist - P._mc > 25) { P._mc = P.dist; checkMissions(); }
  if (P.endT) { P.endT += dt; if (P.endT > 3.0 && state === 'play') showResult(); }
}

// ---------------------------------------------------------------- granny pose
function poseGranny(dt, title) {
  const R = gran.root;
  R.position.set(P.x, P.y, -P.dist);
  const fev = P.fever > 0;
  R.scale.setScalar(R.scale.x + ((fev ? 1.45 : 1) - R.scale.x) * Math.min(1, dt * 6));
  const run = title ? 0 : clamp(P.speed / 18, 0, 1);
  P.phase += dt * (5 + P.speed * 0.6);
  const ph = P.phase;
  P.slideK += ((P.slide > 0 ? 1 : 0) - P.slideK) * Math.min(1, dt * 14);
  const k = P.slideK;
  const sitting = P.endT > 1.2;
  gran.legs.forEach(([th, kn], i) => {
    const o = i ? Math.PI : 0;
    let a = -Math.sin(ph + o) * 1.15 * run, b = Math.max(0, Math.sin(ph + o + 1.2)) * 1.7 * run + 0.1;
    if (P.air) { a = P.superJump ? -0.5 - Math.sin(P.t * 30 + i * 3) * 0.9 : -1.2 + i * 0.6; b = P.superJump ? 0.7 : 1.8 - i * 0.6; }
    if (k > 0.01) { a = a * (1 - k) - 1.5 * k; b = b * (1 - k) + 2.3 * k; }
    if (sitting) { a = -1.5; b = 0.2; }
    th.rotation.x = a; kn.rotation.x = b;
  });
  gran.hips.position.y = sitting ? gran.base.hips.y * 0.55 : gran.base.hips.y * (1 - k) + k * 0.42 + Math.abs(Math.sin(ph)) * 0.08 * run;
  gran.hips.rotation.y = Math.sin(ph) * 0.2 * run;
  const lean = title ? 0.15 : sitting ? 0.25 : (0.75 + (P.speed > 28 ? 0.15 : 0)) * (1 - k) + 1.35 * k;
  gran.torso.rotation.x = lean; gran.torso.rotation.z = Math.sin(ph) * 0.07 * run;
  gran.arms.forEach(([sh, el, s], i) => {
    let a = Math.sin(ph + (i ? Math.PI : 0)) * 1.3 * run - 0.2, b = -1.2 * run - 0.2, z = 0.12 * s;
    if (P.air) { a = P.superJump ? -2.8 + Math.sin(P.t * 25 + i) * 0.6 : -2.4; b = -0.3; z = s * 0.7; }
    if (fev && !P.air) { a = -0.6 + Math.sin(ph * 2 + i) * 0.6; z = s * 1.2; } // arms out like a sumo charge
    if (title) { a = Math.sin(P.t * 2.5 + i * Math.PI) * 0.4; b = -0.3; z = s * (0.25 + Math.max(0, Math.sin(P.t * 2.5)) * 0.25); }
    if (sitting) { a = -0.4; b = -1.4; z = 0.1 * s; }
    sh.rotation.set(a, 0, z); el.rotation.x = b;
  });
  if (gran.bag) gran.bag.rotation.x = Math.sin(ph * 2) * 0.4 * run;
  gran.head.rotation.x = -lean * 0.8 + (title ? 0 : 0.1);
  gran.head.rotation.y = title ? Math.sin(P.t * 0.8) * 0.3 : 0;
  gran.bun.rotation.y += dt * (fev ? 45 : 0); if (!fev) gran.bun.rotation.y *= 0.9;
  // dentures pop out on jumps
  if (P.teethT > 0) {
    const q = Math.sin((1 - P.teethT / (P.superJump ? 1.6 : 0.75)) * Math.PI);
    gran.teeth.position.set(gran.base.teeth.x, gran.base.teeth.y + q * 0.25, gran.base.teeth.z + q * 0.4);
    gran.teeth.rotation.x = -q * 3; gran.teeth.scale.setScalar(1 + q * 1.6);
  } else { gran.teeth.position.copy(gran.base.teeth); gran.teeth.rotation.x = 0; gran.teeth.scale.setScalar(1); }
  // glasses fly off when she is hit
  if (P.glassesT > 0) { const q = Math.sin((1 - P.glassesT / 1.2) * Math.PI); gran.glasses.position.set(gran.base.glasses.x + q * 0.2, gran.base.glasses.y + q * 0.7, gran.base.glasses.z + q * 0.3); gran.glasses.rotation.z = q * 6; }
  else { gran.glasses.position.copy(gran.base.glasses); gran.glasses.rotation.z = 0; }
  R.rotation.x = P.superJump ? -P.flip * Math.PI * 2 : 0;
  R.rotation.z = (LANES[P.lane] - P.x) * 0.07;
  R.visible = state !== 'play' || P.fever > 0 || !(P.inv > 0 && Math.floor(P.inv * 12) % 2 === 0);
  gran.aura.material.opacity += ((fev ? 0.22 + Math.sin(P.t * 20) * 0.06 : 0) - gran.aura.material.opacity) * Math.min(1, dt * 8);
  gran.aura.visible = gran.aura.material.opacity > 0.01;
  // passenger
  const r = rider;
  r.root.position.set(0, 0.44 + P.riderOff + Math.abs(Math.sin(ph)) * 0.05 * run, -0.2);
  r.root.rotation.x = -lean + 0.2 - (P.riderOff > 0 ? P.riderOff * 1.5 : 0);
  const scared = !title && (P.speed > 25 || P.air || P.riderOff > 0 || fev);
  r.arms.forEach((a, i) => { const s = i ? -1 : 1; a.rotation.z = s * (scared || title ? 2.6 + Math.sin(P.t * 20 + i) * 0.35 : 0.5); a.rotation.x = scared ? 0 : -0.9; });
  if (r.mouth) r.mouth.scale.setScalar(scared ? 1.8 : 1);
  if (r.tail) r.tail.rotation.y = Math.sin(P.t * 14) * 0.6;
}

// ---------------------------------------------------------------- camera
const camPos = new THREE.Vector3(2, 1.6, -3), camLook = new THREE.Vector3(0, 1.1, 0);
function updateCamera(real) {
  let pos, look;
  if (state === 'title' || state === 'boot') {
    const a = 0.45 + Math.sin(performance.now() / 5000) * 0.35;
    pos = tmp.set(Math.sin(a) * 3.3, 1.55, -P.dist - Math.cos(a) * 3.3);
    look = new THREE.Vector3(0, 1.1, -P.dist);
    camera.fov = 48;
  } else if (P.endT > 1.0) {
    pos = tmp.set(P.x + 2.4, 1.6, -P.dist - 4);
    look = new THREE.Vector3(P.x, 0.9, -P.dist);
    camera.fov += (52 - camera.fov) * Math.min(1, real * 2);
  } else {
    const sj = P.superJump ? 1 : 0, fv = P.fever > 0 ? 1 : 0;
    pos = tmp.set(P.x * 0.55 + sj * 3, 3.1 + P.y * 0.55 + sj * 1.5 + fv * 0.8, -P.dist + 6.2 + sj * 3 + fv * 1.6);
    look = new THREE.Vector3(P.x * 0.7, 1.2 + P.y * 0.6, -P.dist - 7);
    const f = 60 + clamp((P.speed - 17) * 0.55, 0, 13) + fv * 8 + P.punch * 4;
    camera.fov += (f - camera.fov) * Math.min(1, real * 6);
  }
  camPos.lerp(pos, Math.min(1, real * (state === 'title' ? 3 : 8)));
  camLook.lerp(look, Math.min(1, real * 10));
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += rnd(-1, 1) * shake * 0.35; camera.position.y += rnd(-1, 1) * shake * 0.3; shake = Math.max(0, shake - real * 2.2); }
  camera.lookAt(camLook);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- HUD
const hudCache = {};
function renderHud(force) {
  const set = (id, v) => { if (force || hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
  set('dist', Math.floor(P.dist));
  set('kmh', Math.round(P.speed * 3.6));
  set('score', P.score.toLocaleString());
  if (force || hudCache.hp !== P.hp) { hudCache.hp = P.hp; $('koshi').innerHTML = [0, 1, 2].map((i) => `<i class="${i < P.hp ? '' : 'lost'}">腰</i>`).join(''); }
  const g = P.fever > 0 ? P.fever / FEVER_T * 100 : P.gauge;
  const gs = g.toFixed(0);
  if (force || hudCache.g !== gs) { hudCache.g = gs; $('gauge-fill').style.width = gs + '%'; $('gauge').classList.toggle('full', P.fever > 0); $('gauge-label').textContent = P.fever > 0 ? '覚醒中！！' : 'ばあちゃんゲージ'; }
}
function renderCombo(force) {
  const el = $('combo');
  if (P.combo < 3) { el.classList.remove('on'); return; }
  el.classList.add('on');
  $('combo-n').textContent = P.combo; $('combo-x').textContent = '×' + mult().toFixed(1);
  if (force) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}

// ---------------------------------------------------------------- title screen
function renderTitle() {
  $('t-rank').innerHTML = `<small>段位</small><b>${save.rank}段</b><span>${rankName(save.rank)}</span>`;
  const ms = missionsFor(save.rank);
  $('t-missions').innerHTML = ms.map((m, i) => `<li class="${save.done[i] ? 'ok' : ''}"><i>${save.done[i] ? '✔' : ''}</i>${m.text}</li>`).join('');
  $('best').textContent = save.best ? `ハイスコア ${save.best.toLocaleString()}点 ／ 最長 ${save.bestDist}m` : '';
  $('sel-rider').textContent = (RIDERS.find((x) => x.id === save.rider) || RIDERS[0]).name;
  $('sel-outfit').textContent = (OUTFITS.find((x) => x.id === save.outfit) || OUTFITS[0]).name;
  const next = [...RIDERS, ...OUTFITS].filter((x) => x.rank > save.rank).sort((a, b) => a.rank - b.rank)[0];
  $('t-next').textContent = next ? `次の解放：${next.rank}段で「${next.name}」` : '';
}
function cycle(list, key, dir) {
  const avail = list.filter(unlocked);
  let i = avail.findIndex((x) => x.id === save[key]);
  i = (i + dir + avail.length) % avail.length;
  save[key] = avail[i].id; persist();
  if (key === 'rider') { riderId = save.rider; buildRider(riderId); } else setOutfit(save.outfit);
  audio.init(); audio.sfx('pop'); renderTitle();
  if (avail.length === 1) toast('段位を上げると解放されます', '');
}
$('rider-prev').onclick = () => cycle(RIDERS, 'rider', -1); $('rider-next').onclick = () => cycle(RIDERS, 'rider', 1);
$('outfit-prev').onclick = () => cycle(OUTFITS, 'outfit', -1); $('outfit-next').onclick = () => cycle(OUTFITS, 'outfit', 1);
$('btn-start').onclick = start; $('btn-retry').onclick = start; $('btn-home').onclick = toTitle;
$('btn-pause').onclick = pause; $('btn-resume').onclick = resume; $('btn-quit').onclick = toTitle;
function initToggle(id, key, getter, setter) {
  let on = true; try { on = localStorage.getItem(key) !== '0'; } catch (e) { /* ignore */ }
  setter(on); $(id).classList.toggle('on', on);
  $(id).onclick = () => { on = !getter(); setter(on); $(id).classList.toggle('on', on); try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) { /* ignore */ } if (on) { audio.init(); audio.say('はいよ', 'baa'); } };
}
initToggle('btn-sound', 'baachan-sound', () => audio.sound, (v) => audio.setSound(v));
initToggle('btn-voice', 'baachan-voice', () => audio.voice, (v) => audio.setVoice(v));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------------------------------------------------------------- loop
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); lines2d.resize(w, h);
}
addEventListener('resize', resize); resize();
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'boot') return;
  let dt = real * timeScale;
  if (hitstop > 0) { hitstop -= real; dt *= 0.08; }
  if (state === 'play') { update(dt); poseGranny(dt, false); renderHud(); }
  else if (state === 'title') { P.t += real; poseGranny(real, true); }
  if (state !== 'pause') { fx.update(dt, camera.position.z); updateBubbles(real); }
  world.update(P.dist, camera.position, real);
  updateCamera(real);
  const it = state === 'play' ? clamp((P.speed - 26) / 12, 0, 1) + (P.fever > 0 ? 0.8 : 0) + (P.superJump ? 0.4 : 0) : 0;
  lines2d.draw(it, P.fever > 0 ? 'rgba(255,220,90,0.6)' : 'rgba(255,255,255,0.5)');
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- boot
(async () => {
  try {
    await loadAll(renderer, (k) => { $('load-fill').style.width = Math.round(k * 100) + '%'; });
  } catch (e) { $('load-msg').textContent = '読み込みに失敗しました。再読み込みしてください'; console.error(e); return; }
  world = new World(scene, renderer); fx = new FX(scene);
  gran = buildGranny();
  if (!unlocked(RIDERS.find((r) => r.id === save.rider) || { rank: 99 })) save.rider = 'kid';
  if (!unlocked(OUTFITS.find((r) => r.id === save.outfit) || { rank: 99 })) save.outfit = 'purple';
  riderId = save.rider; buildRider(riderId); setOutfit(save.outfit);
  resetGame();
  state = 'title'; show('boot', false); show('title', true); renderTitle();
  requestAnimationFrame(frame);
})();
window.__baa = { scene, P, get state() { return state; }, ents: () => ents, start, act, ev: () => ev, save, info: () => renderer.info.render, sim(s) { for (let i = 0; i < s * 60; i++) { update(1 / 60); poseGranny(1 / 60, false); fx.update(1 / 60, camera.position.z); world.update(P.dist, camera.position, 1 / 60); } } }; // for automated tests
