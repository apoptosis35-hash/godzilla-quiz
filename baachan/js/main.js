// ばあちゃんターボ — free-roam: granny tears around town with a passenger on her back and smashes whatever is in the way.
// No pickups, no obstacles that hurt: walls just bounce her (壁ドン). Funny spots all over town, achievements unlock riders/outfits.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadAll, clone, node } from './assets.js';
import { Town, POI, ROADS, RW, BOUND, bc } from './world.js';
import { FX, SpeedLines } from './fx.js';
import { audio } from './audio.js';
import { save, persist, ACH, RIDERS, OUTFITS, unlocked, achCount } from './save.js';

const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FEVER_T = 8;
const BASE = 22, TEA = 1.6;

// ---------------------------------------------------------------- lines
const L = {
  idle: ['若いもんには負けんよ！', '腰？そんなもん知らん！', '昔は新幹線と競争したもんじゃ', 'ブレーキ？なにそれ', 'ひざが…まだいける！', '年金の日は足が軽いのう', 'ばあちゃんの青春はこれからじゃ', '血圧？上がっとるよ！', 'どかんかい、どかんかい！', '今夜は肉じゃがにしようかね', 'この町はばあちゃんの庭じゃ', '寄り道は人生のスパイスじゃ'],
  wall: ['いたっ！', '壁が勝手に出てきた！', 'この家、昨日はなかった！', 'ごめんよ〜', 'ほっほっほ、硬いのう'],
  fever: ['ばあちゃん覚醒じゃーーー！', '血が騒ぐのう！！', '腰の痛みが消えたーー！', 'どけどけーーい！'],
  combo: ['ほっほっほ！', 'まだまだ！', 'ぜんぶ吹っ飛ばしちゃる！', '気持ちええのう！', 'ばあちゃん無双じゃ！'],
  man: ['ぶちょーーーー！！', '定時で帰りたかったーー！', '有給とっとけばよかったーー！', 'お先に失礼しまーーす！', '会議に遅れるーー！', 'ローンがーーー！'],
  tea: ['ズズッ…ぷはーっ！', 'お茶がしみるのう！', '五臓六腑にしみわたるーー！', '玉露パワーじゃ！'],
  drift: ['ばあちゃんドリフトじゃ！', '曲がれーーい！', 'サンダルが焦げる！'],
  car: ['車も軽いのう', 'ちょっと借りるよ！', '駐車禁止じゃ！'],
  omikuji: [['大吉', '腰が治る。走れ'], ['中吉', '入れ歯が見つかる'], ['小吉', '特売に間に合う'], ['吉', '孫がやさしい'], ['末吉', 'じいちゃんが静か'], ['凶', 'メガネを頭にのせたまま探す'], ['大凶', '血圧が上がる。でも走れ'], ['ばあ吉', 'とにかく走れ']],
};
const RL = { // passenger lines
  kid: { idle: ['ばあちゃん速すぎ！', 'こわいこわいこわい！', 'ばあちゃん前！前！', '宿題どうしよう…', 'ばあちゃん、何キロ出てるの！？', 'みんな見てるって！', '酔ってきた…', '学校こっちじゃないよ！'], hit: ['ぐえっ', 'ぎゃー！', 'おしり打った…'], fever: ['ばあちゃんが光ってる！？', 'ばあちゃん、目が金色！'], voice: 'kid' },
  shiba: { idle: ['ワン！', 'ワンワン！', 'クゥ〜ン…', '（しっぽが止まらない）'], hit: ['キャイン！'], fever: ['ワオーーーン！'], voice: 'kid' },
  cat: { idle: ['ニャー！', 'フシャーッ！', 'ニャ…（酔った）', '（爪が背中に食い込む）'], hit: ['ギニャー！'], fever: ['ニャーーーン！'], voice: 'kid' },
  tanuki: { idle: ['……（置物）', '……（たぬき）', '……（ちょっと笑ってる）'], hit: ['……（ヒビ）'], fever: ['……（光ってる）'], voice: null },
  jii: { idle: ['ばあさん、速すぎじゃ！', '入れ歯が飛ぶ〜', 'わしも若い頃は…', '腰がもたん！', 'ばあさん、降ろしてくれ〜'], hit: ['ぐはっ！'], fever: ['ばあさんが若返った！？'], voice: 'jii' },
  salaryman: { idle: ['会社に遅れる！', 'もっと速く！部長命令だ！', '有給とればよかった…', '取引先にこの姿は…'], hit: ['労災ーっ！'], fever: ['これが…出世の速さ…！'], voice: 'man' },
  daruma: { idle: ['……（だるま）', '（七転び八起き）', '……（片目でにらむ）'], hit: ['……（転がりかけた）'], fever: ['……（両目が開いた！）'], voice: null },
};

// ---------------------------------------------------------------- renderer
const canvas = $('gl');
const HI_DPR = (window.devicePixelRatio || 1) >= 2;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !HI_DPR, powerPreference: 'high-performance' });
let dpr = Math.min(window.devicePixelRatio || 1, 1.25);
renderer.setPixelRatio(dpr);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
const lines2d = new SpeedLines($('fx'));
let town, fx;

// ---------------------------------------------------------------- state
let state = 'boot';
const P = { x: 3, z: 37.5, y: 0, h: Math.PI, t: 0, phase: 0, speed: 0, st: {} };
const V = new THREE.Vector2();       // velocity on the ground
let ents = [], groups = [], steer = 0, keySteer = 0, shake = 0, hitstop = 0, timeScale = 1, chatterT = 6;
let police = null, race = null, dog = null, army = [], kidAway = null;
let gran = null, rider = null, riderId = 'kid', eggsObj = null, headCat = null, towelObj = null, thermosObj = null;
const cool = {};
const fwd = () => new THREE.Vector3(Math.sin(P.h), 0, Math.cos(P.h));

// ---------------------------------------------------------------- characters
function buildGranny() {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const m = clone('granny'); root.add(m);
  const n = (k) => node(m, 'granny_' + k);
  const g = { root, model: m, hips: n('hips'), torso: n('torso'), head: n('head'), bun: n('bun'), glasses: n('glasses'), teeth: n('teeth'), bag: n('bag'),
    legs: [[n('leg_l'), n('knee_l')], [n('leg_r'), n('knee_r')]], arms: [[n('arm_l'), n('elbow_l'), 1], [n('arm_r'), n('elbow_r'), -1]] };
  g.base = {}; for (const k of ['hips', 'glasses', 'teeth']) g.base[k] = g[k].position.clone();
  g.cardMats = [];
  m.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material.name === 'cardigan') { o.material = o.material.clone(); g.cardMats.push(o.material); }
  });
  const aura = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  aura.scale.set(0.9, 1.25, 0.9); aura.position.y = 1.0; root.add(aura); g.aura = aura;
  scene.add(root);
  return g;
}
function outfitMat(m, id) {
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
        float cc = cell(vec2(atan(vOP.x, vOP.z) * 1.6, vOP.y * 10.0));
        diffuseColor.rgb = mix(vec3(0.08, 0.05, 0.03), mix(vec3(0.55, 0.3, 0.1), vec3(0.86, 0.58, 0.22), smoothstep(0.24, 0.3, cc)), smoothstep(0.16, 0.22, cc));`);
    };
  } else m.color.set(id); // army grannies: plain colours
  m.needsUpdate = true;
}
function setOutfit(id) { for (const m of gran.cardMats) outfitMat(m, id); }
function buildRider(id) {
  if (rider) rider.root.parent?.remove(rider.root);
  const r = { id, root: new THREE.Group(), arms: [], legs: [], mouth: null, tail: null };
  let m;
  if (id === 'kid') {
    m = clone('kid'); r.arms = [node(m, 'kid_arm_l'), node(m, 'kid_arm_r')]; r.legs = [node(m, 'kid_leg_l'), node(m, 'kid_leg_r')]; r.mouth = node(m, 'kid_mouth');
  } else if (id === 'shiba') { m = clone('shiba'); m.scale.setScalar(0.62); m.position.set(0, -0.12, 0.05); r.tail = node(m, 'shiba_tail'); }
  else if (id === 'cat') { m = clone('cat'); m.scale.setScalar(1.15); m.position.set(0, -0.05, 0.05); r.tail = node(m, 'cat_tail'); }
  else if (id === 'tanuki') { m = clone('tanuki'); m.scale.setScalar(0.5); m.position.set(0, -0.05, 0); }
  else if (id === 'jii') { m = clone('jii'); m.scale.setScalar(0.85); m.position.set(0, -0.45, 0.05); r.arms = [node(m, 'jii_arm_l'), node(m, 'jii_arm_r')]; }
  else if (id === 'salaryman') { m = clone('salaryman'); m.scale.setScalar(0.7); m.position.set(0, -0.62, 0.05); r.arms = [node(m, 'salaryman_arm_l'), node(m, 'salaryman_arm_r')]; r.legs = [node(m, 'salaryman_leg_l'), node(m, 'salaryman_leg_r')]; }
  else { m = clone('daruma'); m.scale.setScalar(0.5); m.position.set(0, -0.05, 0); }
  r.model = m; r.root.add(m);
  seatRider(r);
  eggsObj = clone('eggs'); eggsObj.visible = false; eggsObj.position.set(0, id === 'kid' ? 0.72 : 0.55, 0); r.root.add(eggsObj);
  rider = r; legsRiding(true);
}
function seatRider(r) { gran.torso.add(r.root); r.root.position.set(0, 0.44, -0.2); r.root.rotation.set(0, 0, 0); }
function legsRiding(on) {
  if (!rider) return;
  const a = rider.id === 'salaryman' ? -1.5 : -1.4;
  if (rider.legs.length) { rider.legs[0].rotation.set(on ? a : 0, 0, on ? 0.5 : 0); rider.legs[1].rotation.set(on ? a : 0, 0, on ? -0.5 : 0); }
}

// ---------------------------------------------------------------- UI helpers
const bubbleEls = {}, bubbleState = {};
function say(who, text, o = {}) {
  let el = bubbleEls[who];
  if (!el) { el = document.createElement('div'); bubbleEls[who] = el; $('bubbles').appendChild(el); }
  el.className = 'bb ' + (who.startsWith('npc') ? 'man' : who) + (o.shout ? ' shout' : '');
  el.textContent = text; el.style.display = 'block';
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  bubbleState[who] = { t: o.dur || 2.2, target: o.target || (who === 'kid' ? rider.root : gran.head), y: o.y ?? 0.45 };
  if (o.voice !== false) { const v = who === 'kid' ? RL[riderId].voice : who.startsWith('npc') ? 'man' : who; if (v) audio.say(text, v); }
  if (who === 'baa' || who === 'kid') chatterT = rnd(7, 11);
}
function riderSay(kind, dur = 1.8) { if (!kidAway) say('kid', pick(RL[riderId][kind] || RL[riderId].idle), { dur }); }
const _v = new THREE.Vector3();
function updateBubbles(dt) {
  const W = innerWidth, H = innerHeight;
  for (const who in bubbleState) {
    const b = bubbleState[who], el = bubbleEls[who];
    if (b.t <= 0) continue;
    b.t -= dt;
    if (b.t <= 0 || !b.target.parent) { el.style.display = 'none'; b.t = 0; continue; }
    b.target.getWorldPosition(_v); _v.y += b.y; _v.project(camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1.3) { el.style.visibility = 'hidden'; continue; }
    el.style.visibility = 'visible';
    let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
    const bw = el.offsetWidth;
    if (who === 'kid') x += bw * 0.35; else if (who === 'baa') x -= bw * 0.3;
    x = clamp(x, bw / 2 + 8, W - bw / 2 - 8); y = clamp(y, 150, H - 40);
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
function toast(html, cls = '') { const el = document.createElement('div'); el.className = 'toast ' + cls; el.innerHTML = html; $('toasts').appendChild(el); setTimeout(() => el.remove(), 2900); }
function flash(color = '#fff', a = 0.6) { const f = $('flash'); f.style.transition = 'none'; f.style.background = color; f.style.opacity = a; requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = 0; }); }
function ach(id) {
  if (save.ach[id] || state !== 'play') return;
  const before = achCount();
  save.ach[id] = true; persist();
  const a = ACH.find((x) => x.id === id);
  audio.sfx('ach'); toast(`<b>🏆 おもしろ実績</b>${a.name}`, 'ok');
  for (const u of [...RIDERS, ...OUTFITS]) if (u.need > before && u.need <= achCount()) setTimeout(() => toast(`<b>🎁 解放</b>${u.name}`, 'gold'), 1300);
}

// ---------------------------------------------------------------- smashables
const K = {
  cone: { m: 'cone', w: 0.6, h: 0.8, pts: 10, gauge: 5, words: ['カーン！', 'ポコッ'], sfx: 'clang', deb: [0xff6418, 0xffffff] },
  bucket: { m: 'bucket', w: 0.6, h: 0.8, pts: 10, gauge: 5, words: ['ガコン！', 'ボコッ！'], sfx: 'clang', deb: [0x2f6fd8, 0x9ad04a, 0xd0c0a0] },
  boxes: { m: 'boxes', w: 0.8, h: 1.4, pts: 20, gauge: 6, words: ['ドサーッ', 'バコーン！'], sfx: 'crunch', deb: [0xc49a62, 0xff9a20, 0xe0302a] },
  daruma: { m: 'daruma', w: 0.8, h: 0.9, pts: 50, gauge: 9, words: ['ボヨーン！', 'ころりん'], sfx: 'boing', deb: [0xd51f26, 0xf6f4ef], bouncy: true },
  tanuki: { m: 'tanuki', w: 0.9, h: 1.2, pts: 80, gauge: 11, words: ['ポンッ！', 'たぬーー！'], sfx: 'crunch', deb: [0x7a4a28, 0xe8d2a8] },
  watermelons: { m: 'watermelons', w: 1.1, h: 0.75, pts: 60, gauge: 10, words: ['グシャッ！', 'スイカ割り！'], sfx: 'splat', deb: [0xff3a4a, 0xff3a4a, 0x4fae3c, 0x222222] },
  bicycle: { m: 'bicycle', w: 0.7, h: 1.0, pts: 30, gauge: 6, words: ['ガシャーン！'], sfx: 'clang', deb: [0xd02020, 0xcccccc] },
  vending_machine: { m: 'vending_machine', w: 1.1, h: 2.0, pts: 120, gauge: 20, words: ['ガッシャーン！'], sfx: 'glass', deb: [0xd8262e, 0x3a9a4a, 0x2d6bd8, 0xf0a020], big: true },
  postbox: { m: 'postbox', w: 0.5, h: 1.3, pts: 40, gauge: 7, words: ['ドゴッ！'], sfx: 'clang', deb: [0xd8262e, 0xffffff] },
  salaryman: { m: 'salaryman', w: 0.6, h: 1.8, pts: 100, gauge: 12, words: ['ぶちょーー！', 'あーれー！'], sfx: 'boing', deb: [0xffffff], person: true },
  pigeon: { m: 'pigeon', w: 0.5, h: 0.5, pts: 15, gauge: 3, words: ['ポッポー！'], sfx: 'pigeon', deb: [0x8e96aa, 0xffffff], light: true },
  car_kei: { m: 'car_kei', w: 1.9, h: 1.8, pts: 300, gauge: 22, words: ['ドカーーン！！'], sfx: 'smash', deb: [0xf4f4f4, 0x333333], big: true, car: true },
  keitora: { m: 'keitora', w: 1.9, h: 1.8, pts: 300, gauge: 22, words: ['どっかーん！'], sfx: 'smash', deb: [0xf4f4f4, 0x9fdc6a], big: true, car: true },
  car_sedan: { m: 'car_sedan', w: 2.1, h: 1.6, pts: 300, gauge: 22, words: ['ドカーーン！！'], sfx: 'smash', deb: [0x3a5a8a, 0x333333], big: true, car: true },
  townsman: { m: 'townsman', w: 0.6, h: 1.8, pts: 80, gauge: 8, words: ['うわーー！'], sfx: 'boing', deb: [0xffffff], person: true },
  shopkeeper: { m: 'shopkeeper', w: 0.6, h: 1.8, pts: 80, gauge: 8, words: ['ひえーー！'], sfx: 'boing', deb: [0xffffff], person: true },
};
const SMALL = ['cone', 'cone', 'bucket', 'boxes', 'boxes', 'daruma', 'tanuki', 'watermelons', 'bicycle', 'postbox'];
const CARS = ['car_kei', 'keitora', 'car_sedan'];

function addEnt(kind, x, z, o = {}) {
  const k = K[kind];
  const obj = clone(k.m);
  obj.rotation.y = o.ry ?? rnd(0, Math.PI * 2);
  obj.position.set(x, 0.0, z);
  scene.add(obj);
  const e = { kind, k, obj, x, z, y: 0, vx: o.vx || 0, vz: o.vz || 0, t: 0, dead: false, fly: null, meshes: [], cs: null, group: o.group || null };
  obj.traverse((m) => { if (m.isMesh) { e.meshes.push(m); m.castShadow = false; } });
  if (kind === 'salaryman') { e.legs = [node(obj, 'salaryman_leg_l'), node(obj, 'salaryman_leg_r')]; e.arms = [node(obj, 'salaryman_arm_l'), node(obj, 'salaryman_arm_r')]; e.arms[1].rotation.x = -1.4; }
  if (kind === 'townsman' || kind === 'shopkeeper') { e.legs = [node(obj, kind + '_leg_l'), node(obj, kind + '_leg_r')]; e.arms = [node(obj, kind + '_arm_l'), node(obj, kind + '_arm_r')]; }
  if (kind === 'pigeon') { e.wings = [node(obj, 'pigeon_wing_l'), node(obj, 'pigeon_wing_r')]; e.wings[0].rotation.z = -1.2; e.wings[1].rotation.z = 1.2; }
  ents.push(e);
  return e;
}
function removeEnt(e) { scene.remove(e.obj); e.dead = true; }
function roadPoint(ax, az) { // snap a point onto the nearest road
  let best = null;
  for (const r of ROADS) {
    if (Math.abs(ax - r) < (best ? best.d : 1e9)) best = { d: Math.abs(ax - r), x: r + clamp(ax - r, -RW + 1, RW - 1), z: az, axis: 'z', r };
    if (Math.abs(az - r) < best.d) best = { d: Math.abs(az - r), x: ax, z: r + clamp(az - r, -RW + 1, RW - 1), axis: 'x', r };
  }
  return best;
}
let spawnT = 0;
function populate(dt) {
  spawnT -= dt; if (spawnT > 0) return; spawnT = 0.25;
  const near = ents.filter((e) => !e.group && !e.dead && !e.fly).length;
  for (let n = near; n < 34; n++) {
    const a = P.h + rnd(-1.1, 1.1), d = rnd(26, 70);
    const rp = roadPoint(P.x + Math.sin(a) * d, P.z + Math.cos(a) * d);
    if (!rp || !town.isRoad(rp.x, rp.z) || Math.hypot(rp.x - P.x, rp.z - P.z) < 20) continue;
    const r = Math.random();
    if (r < 0.14) { // a car driving along the road (Japan: keep left)
      const dir = Math.random() < 0.5 ? 1 : -1;
      const lane = rp.r + (rp.axis === 'z' ? -dir * 3 : dir * 3);
      const x = rp.axis === 'z' ? lane : rp.x, z = rp.axis === 'z' ? rp.z : lane;
      const sp = rnd(7, 11);
      addEnt(pick(CARS), x, z, { vx: rp.axis === 'x' ? dir * sp : 0, vz: rp.axis === 'z' ? dir * sp : 0, ry: rp.axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2) });
    } else if (r < 0.26) {
      const e = addEnt('salaryman', rp.x, rp.z); const ang = rnd(0, 6.28); e.vx = Math.sin(ang) * 1.2; e.vz = Math.cos(ang) * 1.2; e.obj.rotation.y = ang;
    } else if (r < 0.34) { for (let k = 0; k < 6; k++) addEnt('pigeon', rp.x + rnd(-1.5, 1.5), rp.z + rnd(-1.5, 1.5)); }
    else if (r < 0.39) addEnt('vending_machine', rp.x, rp.z);
    else { const kind = pick(SMALL); addEnt(kind, rp.x, rp.z); if (Math.random() < 0.5) addEnt(pick(SMALL), rp.x + rnd(-2, 2), rp.z + rnd(-2, 2)); }
  }
}

// fixed crowds: park pigeons and the radio-exercise club, the bon-odori dancers
function buildGroups() {
  for (const g of groups) for (const e of g.list) if (!e.dead) removeEnt(e);
  groups = [];
  const px = bc(2), pz = bc(1);
  const pig = { id: 'pigeons', list: [], spent: false };
  for (let k = 0; k < 50; k++) pig.list.push(addEnt('pigeon', px + rnd(-12, 8), pz + rnd(-14, 6), { group: pig }));
  groups.push(pig);
  const radio = { id: 'radio', list: [], spent: false };
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) radio.list.push(addEnt(j % 2 ? 'shopkeeper' : 'townsman', px + 10 + i * 2.2, pz - 4 + j * 2.4, { group: radio, ry: -Math.PI / 2 }));
  groups.push(radio);
  const bon = { id: 'bon', list: [], spent: false, dancers: true };
  for (let k = 0; k < 12; k++) bon.list.push(addEnt(k % 2 ? 'shopkeeper' : 'townsman', bc(1), bc(2), { group: bon }));
  bon.list.forEach((e, i) => { e.ang = i / 12 * Math.PI * 2; });
  groups.push(bon);
}

// ---------------------------------------------------------------- input
const keys = {};
let tStart = null;
addEventListener('keydown', (e) => {
  if (keys[e.code]) return; keys[e.code] = true;
  if (state === 'play') {
    if (['Space'].includes(e.code)) { e.preventDefault(); jump(); }
    if (['ShiftLeft', 'ShiftRight', 'KeyW', 'ArrowUp'].includes(e.code)) { e.preventDefault(); tea(); }
    if (e.code === 'Escape' || e.code === 'KeyP') pause();
  } else if (state === 'intro' && (e.code === 'Space' || e.code === 'Enter')) skipIntro();
  else if (state === 'title' && e.code === 'Enter') start();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('pointerdown', (e) => {
  audio.resume();
  if (state === 'intro') { introTap(); return; }
  tStart = { x: e.clientX, y: e.clientY, t: performance.now(), used: false, id: e.pointerId };
});
canvas.addEventListener('pointermove', (e) => {
  if (!tStart || e.pointerId !== tStart.id) return;
  const dx = e.clientX - tStart.x, dy = e.clientY - tStart.y;
  steer = clamp(dx / (innerWidth * 0.2), -1, 1);
  if (!tStart.used && dy < -50 && Math.abs(dy) > Math.abs(dx) * 1.3 && performance.now() - tStart.t < 350) { jump(); tStart.used = true; tStart.x = e.clientX; }
});
const endTouch = () => { tStart = null; steer = 0; };
canvas.addEventListener('pointerup', endTouch); canvas.addEventListener('pointercancel', endTouch);
$('btn-tea').addEventListener('pointerdown', (e) => { e.stopPropagation(); tea(); });

// ---------------------------------------------------------------- actions
function jump() {
  if (P.air || P.bonT > 0) return;
  P.air = true; P.vy = 10.5; P.teethT = 0.75;
  audio.sfx('jump');
  if (Math.random() < 0.2) say('baa', pick(['よっこいしょーー！', 'ほいさっ！', '入れ歯がっ！']), { dur: 1 });
  fx.emit('puff', gran.root.position, { n: 5, speed: 1.5, life: 0.5, size: 0.7, up0: 0 });
}
function tea() {
  if (P.teaCd > 0 || P.bonT > 0 || state !== 'play') return;
  P.teaCd = 6; P.drinkT = 0.55; P.st.tea = (P.st.tea || 0) + 1;
  audio.sfx('tea');
  setTimeout(() => {
    if (state !== 'play') return;
    P.teaT = 3.2; audio.sfx('turbo'); flash('#9dff6a', 0.35); pop('お茶ブースト！', 'green');
    say('baa', pick(L.tea), { dur: 1.4 });
  }, 450);
  save.teaTotal = (save.teaTotal || 0) + 1; if (save.teaTotal >= 15) ach('tea');
}

// ---------------------------------------------------------------- scoring
const mult = () => 1 + Math.min(4, Math.floor(P.combo / 10) * 0.5);
function addGauge(n) { if (P.fever > 0) return; P.gauge = Math.min(100, P.gauge + n); if (P.gauge >= 100) startFever(); }
function startFever() {
  P.fever = FEVER_T; P.gauge = 0;
  audio.sfx('fever'); audio.setFever(true); flash('#ffe14a', 0.75); shake = 0.6; hitstop = 0.12;
  pop('ばあちゃん覚醒！！', 'gold big'); say('baa', pick(L.fever), { dur: 2, shout: true });
  setTimeout(() => { if (state === 'play') riderSay('fever'); }, 1500);
  document.body.classList.add('fever'); ach('fever');
}
function count(k) { P.st[k] = (P.st[k] || 0) + 1; save.tot = save.tot || {}; save.tot[k] = (save.tot[k] || 0) + 1; return save.tot[k]; }
function smash(e, dirx, dirz) {
  if (e.fly || e.dead) return;
  const k = e.k;
  P.combo++; P.comboT = 3; P.maxCombo = Math.max(P.maxCombo, P.combo);
  P.score += Math.round(k.pts * mult()); P.st.smash++;
  const tot = count(e.kind);
  addGauge(k.gauge);
  if (dirx === undefined) { dirx = V.x; dirz = V.y; }
  const l = Math.hypot(dirx, dirz) || 1; dirx /= l; dirz /= l;
  const side = Math.random() < 0.5 ? -1 : 1, heavy = k.big ? 0.75 : 1;
  const sp = Math.max(P.speed, 12) * rnd(0.9, 1.3) + rnd(2, 6);
  e.fly = { vx: (dirx * sp - dirz * side * rnd(2, 7)) * heavy, vz: (dirz * sp + dirx * side * rnd(2, 7)) * heavy, vy: rnd(7, 13) * heavy * (k.light ? 0.6 : 1), wx: rnd(-9, 9), wz: rnd(-9, 9), t: 0 };
  if (k.person) e.fly.vy = rnd(13, 17);
  e.obj.visible = true;
  const pos = e.obj.position.clone(); pos.y += (k.h || 1) * 0.5;
  const along = new THREE.Vector3(V.x, 0, V.y).multiplyScalar(0.7);
  fx.debris(pos, k.deb, { n: k.big ? 16 : 8, speed: k.big ? 9 : 7, vel: along, size: k.big ? 0.22 : 0.14 });
  fx.emit('puff', pos, { n: k.big ? 7 : 3, speed: 3, life: 0.5, size: 1.1, grow: 1.5, vel: along });
  fx.emit('spark', pos, { n: 1, speed: 0, life: 0.18, size: k.big ? 5 : 3, grow: 2, add: true, vel: along });
  fx.word(pick(k.words), pos.clone().add(new THREE.Vector3(0, 1.2, 0)), { size: k.big ? 3 : 2.2, color: P.fever > 0 ? '#ffd23a' : '#ff3d2e', vel: along.clone().setY(2.5) });
  audio.sfx(k.sfx); audio.sfx('combo', P.combo);
  hitstop = Math.max(hitstop, k.big ? 0.08 : 0.03); shake = Math.max(shake, k.big ? 0.5 : 0.16); P.punch = k.big ? 1 : 0.5;
  if (e.kind === 'salaryman') { say('npc' + (P.st.smash % 3), pick(L.man), { target: e.obj, y: 2.2, dur: 1.8 }); e.kiran = true; if (tot >= 15) ach('man'); }
  if (e.kind === 'tanuki' && tot >= 15) ach('tanuki');
  if (e.kind === 'pigeon' && tot >= 100) ach('pigeon');
  if (k.car) { const c = count('car'); if (c >= 10) ach('car'); if (Math.random() < 0.3) say('baa', pick(L.car), { dur: 1.3 }); }
  if (e.kind === 'pigeon') fx.emit('feather', pos, { n: 2, speed: 3, life: 1.2, size: 0.35, g: -1.5, vel: along });
  if ([10, 25, 50, 100, 150, 200, 300].includes(P.combo)) {
    pop(`${P.combo} COMBO!!`, P.combo >= 50 ? 'gold big' : 'gold'); flash('#fff4b0', 0.3);
    if (P.combo >= 25) say('baa', pick(L.combo), { dur: 1.4 });
    if (P.combo >= 50) ach('combo');
  }
  renderCombo(true);
}

// ---------------------------------------------------------------- spots & events
function enterSpot(id) {
  if (cool[id] > 0 || P.bonT > 0) return;
  if (id === 'school') {
    cool.school = 30;
    if (riderId === 'kid' && !kidAway) {
      kidAway = { t: 0, phase: 'off' };
      gran.root.updateMatrixWorld(true); scene.attach(rider.root); legsRiding(false);
      rider.root.rotation.set(0, rider.root.rotation.y, 0); rider.root.position.y = 0.36;
      say('kid', 'ばあちゃん、ありがと！いってきまーす！', { dur: 2 }); say('baa', 'がんばるんよ〜！', { dur: 1.6 });
      ach('school');
    } else { say('baa', '学校に来たけど…乗っとるのは孫じゃなかった', { dur: 2.4 }); ach('school'); }
  } else if (id === 'sale') {
    cool.sale = 45; audio.sfx('sale');
    pop('特売じゃーーー！', 'gold big'); say('baa', 'たまご98円は渡さんよ！', { dur: 2, shout: true });
    P.eggs = true; eggsObj.visible = true; addGauge(25); ach('sale'); startArmy();
  } else if (id === 'shrine') {
    cool.shrine = 25; audio.sfx('clap'); setTimeout(() => audio.sfx('clap'), 300);
    const [a, b] = pick(L.omikuji);
    $('omikuji').innerHTML = `<small>おみくじ</small><b>${a}</b><span>${b}</span>`; $('omikuji').classList.remove('on'); void $('omikuji').offsetWidth; $('omikuji').classList.add('on');
    say('baa', 'パンパン！ 腰が治りますように！', { dur: 2 }); addGauge(15); ach('shrine');
    if (race && !race.done && race.target === 'shrine') winRace();
  } else if (id === 'bon') {
    cool.bon = 40; P.bonT = 5.5; P.bonA = Math.atan2(P.x - POI.bon.x, P.z - POI.bon.z);
    audio.sfx('fever'); pop('盆踊りに乱入！', 'gold big'); say('baa', 'あ、よいよいっ！', { dur: 2, shout: true });
    setTimeout(() => { if (state === 'play') riderSay('idle'); }, 1500);
    ach('bon');
  } else if (id === 'sento') {
    cool.sento = 25; audio.sfx('splash'); flash('#ffffff', 1);
    $('steam').classList.add('on'); setTimeout(() => $('steam').classList.remove('on'), 1600);
    P.bonT = 0; P.x = POI.sento.x; P.z = 77.5; P.h = Math.PI; V.set(0, -10);
    towelObj.visible = true; addGauge(20);
    setTimeout(() => { if (state === 'play') { say('baa', 'いい湯じゃった〜♨', { dur: 2 }); fx.emit('heart', gran.head.getWorldPosition(_v), { n: 6, speed: 1, life: 1, size: 0.4 }); } }, 900);
    ach('sento');
  }
}
function startArmy() {
  for (const a of army) scene.remove(a.root);
  army = [];
  const cols = [0x3a8ad8, 0xe0602a, 0x2e9e4a, 0xd83a8a, 0x8a5ad8];
  for (let i = 0; i < 5; i++) {
    const root = new THREE.Group(); const m = clone('granny'); root.add(m);
    m.traverse((o) => { if (o.isMesh && o.material.name === 'cardigan') { o.material = o.material.clone(); outfitMat(o.material, cols[i]); } });
    const f = fwd();
    root.position.set(P.x - f.x * (6 + i * 2) + rnd(-3, 3), 0, P.z - f.z * (6 + i * 2) + rnd(-3, 3));
    scene.add(root);
    army.push({ root, legs: [[node(m, 'granny_leg_l'), node(m, 'granny_knee_l')], [node(m, 'granny_leg_r'), node(m, 'granny_knee_r')]], torso: node(m, 'granny_torso'), arms: [node(m, 'granny_arm_l'), node(m, 'granny_arm_r')], t: 0, off: rnd(-2.5, 2.5), ph: rnd(0, 6) });
  }
  P.armyT = 14;
  setTimeout(() => { if (state === 'play' && army.length) { say('npc9', 'その特売は あたしのもんだよ！', { target: army[0].root, y: 1.9, dur: 2 }); riderSay('idle'); } }, 1200);
  setTimeout(() => { if (state === 'play' && army.length) { pop('おばちゃん軍団が追ってくる！', 'small'); ach('army'); } }, 3000);
}
function updateArmy(dt) {
  if (!army.length) return;
  P.armyT -= dt;
  const f = fwd();
  for (const a of army) {
    a.t += dt;
    const tx = P.x - f.x * 4 + (-f.z) * a.off, tz = P.z - f.z * 4 + f.x * a.off;
    const dx = tx - a.root.position.x, dz = tz - a.root.position.z, d = Math.hypot(dx, dz);
    const sp = P.armyT > 0 ? Math.min(d * 2.5, P.speed * 1.05 + 2) : -6;
    if (d > 0.1) { a.root.position.x += dx / d * sp * dt; a.root.position.z += dz / d * sp * dt; a.root.rotation.y = Math.atan2(dx, dz) + (P.armyT > 0 ? 0 : Math.PI); }
    const ph = a.t * 16 + a.ph;
    a.legs.forEach(([th, kn], i) => { th.rotation.x = -Math.sin(ph + i * Math.PI) * 1.1; kn.rotation.x = Math.max(0, Math.sin(ph + i * Math.PI + 1.2)) * 1.6; });
    a.torso.rotation.x = 0.7; a.arms.forEach((arm, i) => { arm.rotation.x = Math.sin(ph + i * Math.PI) * 1.2; });
  }
  if (P.armyT < -3) { for (const a of army) scene.remove(a.root); army = []; }
}
function startPolice() {
  const o = clone('police'); scene.add(o);
  const f = fwd();
  police = { obj: o, x: P.x - f.x * 35, z: P.z - f.z * 35, h: P.h, t: 0, step: 0, gone: false, siren: 0, lights: [node(o, 'police_light_l'), node(o, 'police_light_r')], cop: node(o, 'police_cop') };
  const rp = roadPoint(police.x, police.z); police.x = clamp(rp.x, -BOUND + 3, BOUND - 3); police.z = clamp(rp.z, -BOUND + 3, BOUND - 3);
  pop('パトカーが来た！', 'small'); P.copSmash = 0;
}
function updatePolice(dt) {
  const c = police; c.t += dt; c.siren -= dt;
  if (c.fly) {
    const f = c.fly; f.t += dt; f.vy -= 16 * dt; c.obj.position.x += f.vx * dt; c.obj.position.y += f.vy * dt; c.obj.position.z += f.vz * dt;
    c.obj.rotation.x += 3 * dt; c.obj.rotation.z += 4 * dt;
    if (f.t > 2.5) { scene.remove(c.obj); police = null; }
    return;
  }
  if (c.siren <= 0 && !c.gone) { audio.sfx('siren'); c.siren = 2; }
  const lines = [
    [1.5, () => say('cop', 'そこの おばあちゃん！止まりなさい！', { target: c.cop, y: 0.6, dur: 2.2 })],
    [4.0, () => say('baa', pick(['わしは歩行者じゃ！', '急いどるんじゃ！', '特売が終わってしまう！']), { dur: 1.8 })],
    [7.0, () => say('cop', '時速100キロの歩行者がいるかーー！', { target: c.cop, y: 0.6, dur: 2.4 })],
    [10, () => riderSay('idle')],
    [12, () => say('baa', '捕まえてみぃ！ほっほっほ', { dur: 1.8 })],
    [22, () => { c.gone = true; say('cop', 'ハトがーーー！前が見えん！', { target: c.cop, y: 0.6, dur: 2.2 }); audio.sfx('pigeon'); }],
  ];
  if (c.step < lines.length && c.t > lines[c.step][0]) { lines[c.step][1](); c.step++; }
  const dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz);
  if (!c.gone) {
    const want = Math.atan2(dx, dz); let dh = want - c.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    c.h += clamp(dh, -2.2 * dt, 2.2 * dt);
    const sp = Math.min(Math.max(P.speed, 10) * 0.97, 30) * (d < 6 ? 0.8 : 1);
    c.x += Math.sin(c.h) * sp * dt; c.z += Math.cos(c.h) * sp * dt;
    const p = { x: c.x, z: c.z }; town.collide(p, 1.2); c.x = p.x; c.z = p.z;
    if (d > 80) { c.gone = true; c.escaped = true; P.score += 500; pop('パトカーをまいた！', 'gold'); ach('cop'); say('baa', 'ほっほっほ、まだまだじゃのう', { dur: 1.8 }); }
    if (P.fever > 0 && d < 3.5) {
      c.fly = { t: 0, vy: 14, vx: V.x * 1.2, vz: V.y * 1.2 };
      P.score += Math.round(1000 * mult()); pop('パトカーも吹っ飛んだ！', 'gold big'); audio.sfx('smash'); hitstop = 0.15; shake = 1;
      say('cop', 'ばあちゃん強すぎーー！', { target: c.cop, y: 0.6, dur: 2 }); ach('copfly'); return;
    }
  } else if (!c.escaped && c.t > 22 && !c.bonus) { c.bonus = true; P.score += 500; pop('パトカーをまいた！', 'gold'); ach('cop'); }
  if (c.gone && Math.random() < 0.4) fx.emit('feather', c.obj.position.clone().add(new THREE.Vector3(0, 1.6, 0)), { n: 1, speed: 2, life: 1, size: 0.4, g: -1 });
  c.obj.position.set(c.x, 0, c.z); c.obj.rotation.y = c.h + (c.gone ? Math.sin(c.t * 8) * 0.3 : 0);
  const blink = Math.floor(c.t * 6) % 2; c.lights[0].visible = !!blink; c.lights[1].visible = !blink;
  if (c.gone && (c.t > 30 || d > 120)) { scene.remove(c.obj); police = null; }
}
function startRace() {
  const o = new THREE.Group(); const sc = clone('scooter'); o.add(sc);
  const j = clone('jii'); j.position.set(0, 0.12, 0.2); o.add(j);
  const f = fwd(); o.position.set(P.x - f.z * 3, 0, P.z + f.x * 3); o.rotation.y = P.h; scene.add(o);
  const target = Math.hypot(P.x - POI.shrine.x, P.z - POI.shrine.z) > 90 ? 'shrine' : 'school';
  race = { obj: o, flame: node(sc, 'scooter_flame'), t: 0, target, done: false, y: 0 };
  say('jii', `ばあさんや、${POI[target].name}まで競争じゃ！`, { target: o, y: 2.2, dur: 2.6 });
  setTimeout(() => { if (state === 'play') say('baa', '受けて立つよ！', { dur: 1.6, shout: true }); }, 1800);
  audio.sfx('turbo');
}
function winRace() {
  race.done = true; P.score += 800; pop('じいちゃんに勝った！', 'gold big'); ach('jii'); audio.sfx('bonus');
  say('baa', 'ほっほっほ、10年早いわい！', { dur: 2 }); say('jii', 'くやしいのう〜〜', { target: race.obj, y: 2.2, dur: 2 });
}
function updateRace(dt) {
  const r = race; r.t += dt;
  const T = POI[r.target];
  const dx = T.x - r.obj.position.x, dz = T.z - r.obj.position.z, d = Math.hypot(dx, dz);
  if (!r.done) {
    // he takes off over the rooftops on his rocket
    r.y += (Math.min(7, r.t * 3) - r.y) * Math.min(1, dt * 2);
    const sp = r.t < 2 ? 8 : 21;
    if (d > 1) { r.obj.position.x += dx / d * sp * dt; r.obj.position.z += dz / d * sp * dt; r.obj.rotation.y = Math.atan2(dx, dz); }
    if (r.target === 'school' && Math.hypot(P.x - T.x, P.z - T.z) < 8) winRace();
    if (d < 3) { r.done = true; r.lost = true; say('jii', 'わしの勝ちじゃ〜！ばあさん遅いのう', { target: r.obj, y: 2.2, dur: 2.4 }); say('baa', 'なんじゃとーー！', { dur: 1.8, shout: true }); }
  } else { r.y += 6 * dt; r.obj.position.x += Math.sin(r.obj.rotation.y) * 20 * dt; r.obj.position.z += Math.cos(r.obj.rotation.y) * 20 * dt; }
  r.obj.position.y = r.y + Math.sin(r.t * 3) * 0.3;
  r.obj.rotation.z = Math.sin(r.t * 2) * 0.15;
  if (r.flame) r.flame.scale.setScalar(0.8 + Math.random() * 0.6);
  if (Math.random() < 0.5) fx.emit('smoke', r.obj.position.clone().add(new THREE.Vector3(0, 0.5, 0)), { n: 1, speed: 0.5, life: 0.9, size: 0.6, grow: 1.5 });
  if (r.done && r.t > 60 || (r.done && r.y > 40)) { scene.remove(r.obj); race = null; }
}
function startDog() {
  const o = clone('shiba'); const f = fwd();
  o.position.set(P.x - f.x * 14, 0, P.z - f.z * 14); scene.add(o);
  dog = { obj: o, t: 0, legs: [node(o, 'shiba_leg_l'), node(o, 'shiba_leg_r'), node(o, 'shiba_arm_l'), node(o, 'shiba_arm_r')], tail: node(o, 'shiba_tail'), bark: 0 };
  pop('柴犬が追いかけてきた！', 'small');
}
function updateDog(dt) {
  const g = dog; g.t += dt; g.bark -= dt;
  const dx = P.x - g.obj.position.x, dz = P.z - g.obj.position.z, d = Math.hypot(dx, dz);
  const chasing = g.t < 15;
  if (chasing) {
    const sp = Math.min(P.speed * 0.95 + 3, d * 3);
    g.obj.position.x += dx / d * sp * dt; g.obj.position.z += dz / d * sp * dt; g.obj.rotation.y = Math.atan2(dx, dz);
    const p = { x: g.obj.position.x, z: g.obj.position.z }; town.collide(p, 0.4); g.obj.position.x = p.x; g.obj.position.z = p.z;
    const ph = g.t * 22; g.legs.forEach((l, i) => { if (l) l.rotation.x = Math.sin(ph + i * 1.6) * 0.9; });
    if (g.bark <= 0) { g.bark = rnd(0.8, 1.6); audio.sfx('bark'); say('npc7', pick(['ワンワン！', 'ワン！ワン！', 'ガルルル…', 'ワオーン！']), { target: g.obj, y: 1.1, dur: 0.9, voice: false }); }
    if (g.t > 5 && !g.ach) { g.ach = true; ach('dog'); say('baa', 'ポチや、ついてこんでええよ！', { dur: 1.8 }); }
  } else if (!g.tired) { g.tired = true; say('npc7', 'ハァ…ハァ…（ばあちゃん速い）', { target: g.obj, y: 1.1, dur: 2.4, voice: false }); }
  if (g.tail) g.tail.rotation.y = Math.sin(g.t * 18) * 0.7;
  if (g.t > 20 || d > 120) { scene.remove(g.obj); dog = null; }
}

// ---------------------------------------------------------------- ramps (fixed)
const RAMPS = [[0, -40, Math.PI], [40, 0, Math.PI / 2], [-75, 40, 0], [112, -75, -Math.PI / 2], [75, 110, Math.PI], [-110, 0, Math.PI / 2], [-40, -75, -Math.PI / 2], [150, 40, 0], [-150, -40, Math.PI]];
const ramps = [];
function buildRamps() {
  for (const [x, z, ry] of RAMPS) {
    const o = clone('ramp'); o.position.set(x, 0, z); o.rotation.y = ry; scene.add(o);
    ramps.push({ x, z, dx: Math.sin(ry), dz: Math.cos(ry) });
  }
}
function rampHeight() {
  for (const r of ramps) {
    const rx = P.x - r.x, rz = P.z - r.z;
    const u = rx * r.dx + rz * r.dz, v = -rx * r.dz + rz * r.dx;
    if (u > 0 && u < 5 && Math.abs(v) < 1.15) {
      const along = (V.x * r.dx + V.y * r.dz) / (Math.hypot(V.x, V.y) || 1);
      if (along < 0.4) return { y: 0, jump: false };
      return { y: 1.4 * u / 5, jump: u > 4.6 };
    }
  }
  return { y: 0, jump: false };
}
function superJump() {
  P.air = true; P.superJump = true; P.vy = 15; P.flip = 0; P.teethT = 1.6;
  timeScale = 0.5; audio.sfx('jump'); audio.sfx('scream');
  say('baa', '飛ぶでーーー！', { dur: 1.6, shout: true });
  setTimeout(() => { if (state === 'play') riderSay('hit'); }, 400);
}
function landSuper() {
  P.superJump = false; timeScale = 1; shake = 0.9; hitstop = 0.1;
  audio.sfx('land'); audio.sfx('smash');
  fx.emit('puff', gran.root.position, { n: 16, speed: 5, life: 0.9, size: 1.4, up0: 0, upMul: 0.3 });
  fx.emit('ring', gran.root.position.clone().add(new THREE.Vector3(0, 0.3, 0)), { n: 1, speed: 0, life: 0.4, size: 2, grow: 6 });
  for (const e of ents) if (!e.dead && !e.fly && !(e.group && e.group.dancers) && Math.hypot(e.x - P.x, e.z - P.z) < 9) smash(e, e.x - P.x, e.z - P.z);
  const sc = [pick([9.5, 10, 10]), 10, pick([9, 10, 8.5])];
  P.score += 300; addGauge(25); ach('ramp');
  pop('着地 決まった！', 'gold');
  setTimeout(() => pop(`審査員　${sc.join('　')}`, 'small'), 400);
}

// ---------------------------------------------------------------- intro cutscene
const HOME = { x: 13.4 - 3.9 - 0.4, z: 37.5 }; // doorstep (the house front faces -x)
let intro = null;
function startIntro() {
  state = 'intro';
  intro = { t: 0, step: 0 };
  P.x = HOME.x - 1.5; P.z = HOME.z; P.h = -Math.PI / 2; V.set(0, 0); P.speed = 0; P.y = 0;
  // the grandchild starts on the road, not on her back
  gran.root.updateMatrixWorld(true); scene.attach(rider.root); legsRiding(false);
  rider.root.position.set(HOME.x - 7, riderId === 'kid' ? 0.36 : 0.3, HOME.z + 3); rider.root.rotation.set(0, Math.PI / 2, 0);
  thermosObj.visible = true;
  $('letterbox').classList.add('on'); show('hud', false); show('title', false);
  $('skip').classList.toggle('on', true);
  audio.init(); audio.stopMusic();
}
const SHOTS = [
  { t: 0, sub: '午前7時55分　ばあちゃんの家', cam: () => [HOME.x - 9, 2.2, HOME.z + 7, HOME.x - 1, 1.2, HOME.z] },
  { t: 1.6, run: () => { say('kid', 'ばあちゃん！学校に遅刻しちゃう！', { dur: 2.6 }); }, cam: () => [rider.root.position.x - 2.4, 1.1, rider.root.position.z + 2.2, rider.root.position.x, 0.8, rider.root.position.z] },
  { t: 4.4, sub: '', run: () => { say('baa', '……ズズッ', { dur: 1.6 }); }, cam: () => [P.x - 1.7, 1.4, P.z + 0.5, P.x, 1.35, P.z] },
  { t: 6.0, run: () => { flash('#ffffff', 0.9); audio.sfx('kiran'); fx.emit('spark', gran.glasses.getWorldPosition(new THREE.Vector3()), { n: 2, speed: 0, life: 0.5, size: 1.2, add: true }); say('baa', '…まかせとき。', { dur: 2 }); }, cam: () => [P.x - 1.2, 1.35, P.z + 0.2, P.x, 1.4, P.z] },
  { t: 7.8, run: () => { thermosObj.visible = false; intro.hop = 0; }, cam: () => [P.x - 4, 0.6, P.z + 3.5, P.x, 1.1, P.z] },
  { t: 9.0, run: () => { audio.sfx('turbo'); shake = 0.9; flash('#ffe14a', 0.5); fx.emit('puff', gran.root.position, { n: 22, speed: 6, life: 1, size: 1.6, up0: 0, upMul: 0.3 }); say('baa', 'しっかりつかまっときや！！', { dur: 2, shout: true }); }, cam: () => [P.x - 5, 1.6, P.z - 3, P.x, 1, P.z] },
  { t: 10.4, run: () => { $('title-slam').classList.add('on'); audio.sfx('fever'); }, cam: () => [P.x + 9, 3, P.z + 2, P.x, 1, P.z] },
  { t: 12.4, end: true },
];
function introTap() { if (intro && intro.t > 0.5) skipIntro(); }
function skipIntro() { if (state !== 'intro') return; intro.t = 12.4; }
function updateIntro(dt) {
  const it = intro; it.t += dt;
  while (it.step < SHOTS.length && it.t >= SHOTS[it.step].t) {
    const s = SHOTS[it.step];
    if (s.sub !== undefined) $('subtitle').textContent = s.sub;
    if (s.run && it.t - s.t < 0.5) s.run();
    if (s.end) { endIntro(); return; }
    it.cur = s; it.step++;
  }
  // choreography
  const kr = rider.root;
  if (it.t < 4.4) { // the kid runs up to the house
    const tx = HOME.x - 2.8; kr.position.x = Math.min(tx, kr.position.x + dt * 3); kr.position.z += (HOME.z + 0.6 - kr.position.z) * dt * 2;
    if (riderId === 'kid' && rider.legs.length) { const ph = it.t * 12; rider.legs[0].rotation.x = Math.sin(ph) * 0.8; rider.legs[1].rotation.x = -Math.sin(ph) * 0.8; }
  }
  if (it.hop !== undefined && !it.seated) { // hop onto granny's back
    it.hop += dt / 0.8;
    const k = Math.min(1, it.hop);
    gran.torso.updateMatrixWorld(true);
    const seat = gran.torso.localToWorld(new THREE.Vector3(0, 0.44, -0.2));
    kr.position.lerp(seat, k * 0.35); kr.position.y += Math.sin(k * Math.PI) * 0.15;
    if (k >= 1) { it.seated = true; seatRider(rider); legsRiding(true); audio.sfx('pop'); }
  }
  P.introRun = it.t > 9.3;
  if (P.introRun) { // out of the yard, then swing north up the road
    P.speed = Math.min(22, P.speed + dt * 40);
    if (P.x < 3.5) P.h += (-Math.PI - P.h) * Math.min(1, dt * 5);
    P.x += Math.sin(P.h) * P.speed * dt; P.z += Math.cos(P.h) * P.speed * dt;
  }
  P.introCrouch = it.t > 7.8 && it.t < 9.2;
  P.introSip = it.t > 3.8 && it.t < 6.2;
  P.t += dt;
  poseGranny(dt, 'intro');
  const c = it.cur && it.cur.cam ? it.cur.cam() : null;
  if (c) { camPos.lerp(_v.set(c[0], c[1], c[2]), Math.min(1, dt * 4)); camLook.lerp(new THREE.Vector3(c[3], c[4], c[5]), Math.min(1, dt * 5)); }
  camera.position.copy(camPos); if (shake > 0) { camera.position.x += rnd(-1, 1) * shake * 0.3; shake = Math.max(0, shake - dt * 2); }
  camera.fov = 50; camera.updateProjectionMatrix(); camera.lookAt(camLook);
}
function endIntro() {
  if (!rider.root.parent || rider.root.parent === scene) { seatRider(rider); legsRiding(true); }
  thermosObj.visible = false;
  $('letterbox').classList.remove('on'); $('skip').classList.remove('on'); $('subtitle').textContent = '';
  setTimeout(() => $('title-slam').classList.remove('on'), 900);
  save.seenIntro = true; persist();
  beginPlay();
}

// ---------------------------------------------------------------- flow
function resetRun() {
  for (const e of ents) removeEnt(e); ents = [];
  if (police) { scene.remove(police.obj); police = null; }
  if (race) { scene.remove(race.obj); race = null; }
  if (dog) { scene.remove(dog.obj); dog = null; }
  for (const a of army) scene.remove(a.root); army = [];
  for (const k in cool) cool[k] = 0;
  Object.assign(P, {
    x: 3, z: 37.5, y: 0, vy: 0, h: Math.PI, air: false, superJump: false, flip: 0, speed: 0, t: 0, phase: 0, teethT: 0, punch: 0,
    combo: 0, comboT: 0, maxCombo: 0, gauge: 0, fever: 0, score: 0, teaT: 0, teaCd: 0, drinkT: 0, bonT: 0, armyT: 0, driftT: 0, wallCd: 0,
    eggs: false, dist: 0, playT: 0, st: { smash: 0 }, nextCop: 40, nextRace: 75, nextDog: 50, wallN: 0, introRun: false,
  });
  V.set(0, 0); steer = 0; timeScale = 1; shake = 0; hitstop = 0;
  kidAway = null;
  hideBubbles(); fx.clear();
  buildGroups();
  gran.root.position.set(P.x, 0, P.z); gran.root.rotation.set(0, P.h, 0); gran.root.scale.setScalar(1);
  if (rider && rider.root.parent !== gran.torso) { seatRider(rider); legsRiding(true); }
  eggsObj.visible = false; towelObj.visible = false; thermosObj.visible = false;
  document.body.classList.remove('fever'); audio.setFever(false);
}
function start() {
  audio.init();
  if (riderId !== save.rider) { riderId = save.rider; buildRider(riderId); }
  setOutfit(save.outfit);
  resetRun();
  startIntro();
}
function beginPlay() {
  state = 'play';
  P.speed = Math.max(P.speed, 18);
  V.set(Math.sin(P.h) * P.speed, Math.cos(P.h) * P.speed);
  audio.startMusic();
  show('hud', true);
  ach('start');
  setTimeout(() => toast('<b>目的</b>孫を小学校に送り届けろ！（寄り道し放題）', ''), 600);
  if (!save.ach.school) setTimeout(() => { if (state === 'play') riderSay('idle'); }, 2500);
  show('howto', true); setTimeout(() => show('howto', false), 5000);
}
function pause() {
  if (state !== 'play') return; state = 'pause'; audio.hush(); audio.stopMusic();
  $('p-stats').innerHTML = `<li><span>スコア</span><b>${P.score.toLocaleString()}</b></li><li><span>走った距離</span><b>${(P.dist / 1000).toFixed(2)}km</b></li><li><span>吹っ飛ばした数</span><b>${P.st.smash}</b></li><li><span>最大コンボ</span><b>${P.maxCombo}</b></li>`;
  renderAch('p-ach'); show('pause', true);
}
function resume() { if (state !== 'pause') return; state = 'play'; show('pause', false); audio.startMusic(); last = performance.now(); }
function toTitle() {
  if (P.score > save.best) save.best = P.score; persist();
  state = 'title'; for (const id of ['pause', 'hud']) show(id, false); show('title', true); audio.stopMusic(); audio.hush();
  resetRun(); renderTitle();
}
function show(id, on) { $(id).classList.toggle('on', on); if (id === 'hud') document.body.classList.toggle('playing', on); }

// ---------------------------------------------------------------- update
const tmp = new THREE.Vector3();
function update(dt) {
  P.t += dt; P.playT += dt;
  for (const k of ['teethT', 'teaT', 'teaCd', 'drinkT', 'wallCd']) if (P[k] > 0) P[k] = Math.max(0, P[k] - dt);
  for (const k in cool) cool[k] -= dt;
  P.punch = Math.max(0, P.punch - dt * 5);
  if (P.fever > 0) { P.fever -= dt; if (P.fever <= 0) { P.fever = 0; document.body.classList.remove('fever'); audio.setFever(false); pop('覚醒おわり', 'small'); } }
  if (P.comboT > 0) { P.comboT -= dt; if (P.comboT <= 0) { if (P.combo >= 10) pop(`${P.combo} コンボ！`, 'small'); P.combo = 0; renderCombo(true); } }

  // steering & speed
  const ks = (keys.ArrowLeft || keys.KeyA ? -1 : 0) + (keys.ArrowRight || keys.KeyD ? 1 : 0);
  keySteer += (ks - keySteer) * Math.min(1, dt * 8);
  const st = clamp(steer + keySteer, -1, 1);
  let target = BASE * (P.teaT > 0 ? TEA : 1) * (P.fever > 0 ? 1.35 : 1);
  if (P.bonT > 0) target = 9;
  P.speed += (target - P.speed) * Math.min(1, dt * 2.5);
  const drifting = Math.abs(st) > 0.8 && P.speed > 15 && !P.air;
  const turn = (drifting ? 3.1 : 2.3) * (1 - Math.min(0.35, P.speed / 140));
  if (P.bonT > 0) { // dancing round the yagura
    P.bonT -= dt; P.bonA += dt * 1.1;
    const r = 5.5, tx = POI.bon.x + Math.sin(P.bonA) * r, tz = POI.bon.z + Math.cos(P.bonA) * r;
    P.h = P.bonA + Math.PI / 2; V.set((tx - P.x) / Math.max(dt, 1e-3), (tz - P.z) / Math.max(dt, 1e-3)).clampLength(0, 30);
    P.x = tx; P.z = tz;
    if (P.bonT <= 0) { startFever(); P.h = P.bonA + Math.PI / 2; }
  } else {
    P.h -= st * turn * dt;
    const f = fwd();
    const grip = drifting ? 2.2 : 7;
    V.x += (f.x * P.speed - V.x) * Math.min(1, dt * grip); V.y += (f.z * P.speed - V.y) * Math.min(1, dt * grip);
    P.x += V.x * dt; P.z += V.y * dt;
  }
  P.dist += Math.hypot(V.x, V.y) * dt; save.dist = (save.dist || 0) + Math.hypot(V.x, V.y) * dt;
  if (save.dist > 5000) ach('dist');
  if (P.speed * 3.6 >= 150) ach('speed');
  // drift
  if (drifting) {
    P.driftT += dt;
    if (Math.random() < 0.6) fx.emit('spark', gran.root.position.clone().add(new THREE.Vector3(rnd(-0.3, 0.3), 0.1, rnd(-0.3, 0.3))), { n: 1, speed: 3, life: 0.25, size: 0.25, add: true, g: -10 });
    if (Math.random() < 0.3) fx.emit('puff', gran.root.position, { n: 1, speed: 0.6, life: 0.6, size: 0.8, grow: 1.5, up0: 0 });
    if (Math.floor(P.driftT / 0.18) !== Math.floor((P.driftT - dt) / 0.18)) audio.sfx('screech');
    if (P.driftT > 1.2 && !P.driftSaid) { P.driftSaid = true; pop('ばあちゃんドリフト！', 'gold'); say('baa', pick(L.drift), { dur: 1.4 }); }
    if (P.driftT > 3) ach('drift');
    addGauge(dt * 8);
  } else { P.driftT = 0; P.driftSaid = false; }

  // walls: bounce off with a 壁ドン
  const p = { x: P.x, z: P.z };
  const hit = town.collide(p, 0.6);
  if (hit) {
    P.x = p.x; P.z = p.z;
    const into = -(V.x * hit.x + V.y * hit.z);
    if (into > 6 && P.wallCd <= 0 && P.fever <= 0) {
      P.wallCd = 0.5; V.x += hit.x * into * 1.6; V.y += hit.z * into * 1.6; V.multiplyScalar(0.6); P.speed *= 0.6;
      shake = 0.6; hitstop = 0.08; audio.sfx('boing'); P.riderVy = 5; P.glassesT = 1;
      fx.word('壁ドン！', gran.root.position.clone().add(new THREE.Vector3(hit.x * -1, 2, hit.z * -1)), { size: 2.6, color: '#7ab8ff', force: true });
      fx.emit('star', gran.head.getWorldPosition(tmp), { n: 6, speed: 2.5, life: 0.8, size: 0.4, g: -4 });
      if (Math.random() < 0.5) say('baa', pick(L.wall), { dur: 1.4 });
      P.wallN++; save.wallTotal = (save.wallTotal || 0) + 1; if (save.wallTotal >= 20) ach('wall');
      // turn her to slide along the wall
      P.h = Math.atan2(V.x, V.y);
    } else if (into > 0) { V.x += hit.x * into; V.y += hit.z * into; }
    if (P.fever > 0) P.h = Math.atan2(V.x + hit.x * 5, V.y + hit.z * 5);
  }

  // vertical: jumps and ramps
  const rh = rampHeight();
  if (P.air) {
    P.vy += (P.superJump ? -15 : -30) * dt; P.y += P.vy * dt;
    if (P.superJump) P.flip = Math.min(1, P.flip + dt / 2.0);
    if (P.y <= rh.y && P.vy < 0) { P.y = rh.y; P.air = false; P.vy = 0; if (P.superJump) landSuper(); else { audio.sfx('land'); fx.emit('puff', gran.root.position, { n: 4, speed: 1.2, life: 0.4, size: 0.6, up0: 0 }); } }
  } else { P.y = rh.y; if (rh.jump) superJump(); }
  if (P.riderVy || P.riderOff > 0) { P.riderVy -= 22 * dt; P.riderOff += P.riderVy * dt; if (P.riderOff <= 0) { P.riderOff = 0; P.riderVy = 0; } }

  // spots
  for (const id of ['school', 'sale', 'shrine', 'bon', 'sento']) { const s = POI[id]; if (Math.hypot(P.x - s.x, P.z - s.z) < s.r + 1) enterSpot(id); }
  // events
  if (!police && P.st.smash >= P.nextCop) { startPolice(); P.nextCop = P.st.smash + 60; }
  if (!race && P.playT > P.nextRace) { startRace(); P.nextRace = P.playT + 110; }
  if (!dog && P.playT > P.nextDog) { startDog(); P.nextDog = P.playT + rnd(70, 110); }
  if (police) updatePolice(dt);
  if (race) updateRace(dt);
  if (dog) updateDog(dt);
  updateArmy(dt);
  updateKid(dt);
  populate(dt);
  // respawn the park crowd when we are far away
  if (Math.hypot(P.x - POI.park.x, P.z - POI.park.z) > 110 && groups.some((g) => g.list.some((e) => e.dead || e.fly))) buildGroups();

  // entities
  const fev = P.fever > 0, reach = fev ? 4.2 : 0;
  const fx0 = Math.sin(P.h), fz0 = Math.cos(P.h);
  for (const e of ents) {
    if (e.dead) continue;
    e.t += dt;
    if (e.fly) {
      const f = e.fly; f.t += dt; f.vy -= 24 * dt;
      e.obj.position.x += f.vx * dt; e.obj.position.y += f.vy * dt; e.obj.position.z += f.vz * dt;
      e.obj.rotation.x += f.wx * dt; e.obj.rotation.z += f.wz * dt;
      if (e.obj.position.y < 0 && f.vy < 0) { e.obj.position.y = 0; f.vy *= e.k.bouncy ? -0.75 : -0.35; f.vx *= 0.6; f.vz *= 0.6; f.wx *= 0.6; f.wz *= 0.6; }
      if (e.kiran && f.t > 1.2) { e.kiran = false; fx.emit('star', e.obj.position, { n: 1, speed: 0, life: 0.7, size: 3, grow: -0.5 }); audio.sfx('kiran'); removeEnt(e); continue; }
      const behind = (e.obj.position.x - P.x) * fx0 + (e.obj.position.z - P.z) * fz0 < -1.5;
      if (f.t > 2.6 || (f.t > 0.25 && behind)) removeEnt(e);
      continue;
    }
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
    if (!e.group && d > 95) { removeEnt(e); continue; }
    // behaviour
    if (e.k.car || e.kind === 'salaryman') {
      e.x += e.vx * dt; e.z += e.vz * dt;
      if (Math.abs(e.x) > BOUND - 2 || Math.abs(e.z) > BOUND - 2) { removeEnt(e); continue; }
      if (e.kind === 'salaryman') { if (!town.isRoad(e.x, e.z) && Math.random() < 0.02) { e.vx *= -1; e.vz *= -1; e.obj.rotation.y += Math.PI; } const sw = Math.sin(e.t * 8) * 0.6; e.legs[0].rotation.x = sw; e.legs[1].rotation.x = -sw; }
    }
    if (e.kind === 'pigeon') {
      if (d < 9) e.up = true;
      if (e.up) { e.y += 3.5 * dt; const a = Math.sin(e.t * 30) * 0.9; e.wings[0].rotation.z = a; e.wings[1].rotation.z = -a; if (e.y > 14) { removeEnt(e); continue; } }
      else e.obj.rotation.x = Math.sin(e.t * 6 + e.x) > 0.6 ? 0.4 : 0;
    }
    if (e.group && e.group.id === 'radio' && !e.fall) { const a = Math.sin(P.t * 3 + (e.x * 0.2)); e.arms[0].rotation.z = 1.5 + a * 1.2; e.arms[1].rotation.z = -1.5 - a * 1.2; }
    if (e.group && e.group.dancers) {
      e.ang += dt * 0.5;
      e.x = POI.bon.x + Math.sin(e.ang) * 9.5; e.z = POI.bon.z + Math.cos(e.ang) * 9.5; e.obj.rotation.y = e.ang + Math.PI / 2;
      const a = Math.sin(P.t * 4 + e.ang * 3); e.arms[0].rotation.z = 1.8 + a * 0.8; e.arms[1].rotation.z = -1.8 + a * 0.8;
      e.legs[0].rotation.x = Math.max(0, a) * 0.5; e.legs[1].rotation.x = Math.max(0, -a) * 0.5;
    }
    if (e.fall) { e.fall.t += dt; e.obj.rotation.x = Math.min(Math.PI / 2, Math.max(0, e.fall.t - e.fall.delay) * 5) * -1; }
    e.obj.position.set(e.x, e.y, e.z);
    e.obj.visible = d < 90;
    const cs = d < 14;
    if (e.cs !== cs) { e.cs = cs; for (const m of e.meshes) m.castShadow = cs; }
    // contact
    if (e.group && e.group.dancers) continue;
    if (e.fall) continue;
    if ((d < e.k.w * 0.5 + 0.7 && P.y < (e.k.h || 1) + 0.3) || (reach && d < reach)) {
      if (e.group && e.group.id === 'radio') { domino(e.group); continue; }
      smash(e, dx, dz);
    }
  }
  ents = ents.filter((e) => !e.dead);

  chatterT -= dt;
  if (chatterT <= 0) { if (Math.random() < 0.6) say('baa', pick(L.idle), { dur: 2.2 }); else riderSay('idle', 2); }
  audio.setTempo(clamp(0.9 + P.speed / 60, 1, 1.7));
  if (fev && Math.random() < 0.35) fx.emit('spark', gran.root.position.clone().add(new THREE.Vector3(rnd(-0.6, 0.6), rnd(0.2, 2), rnd(-0.6, 0.6))), { n: 1, speed: 1, life: 0.4, size: 0.35, add: true });
  if (P.teaT > 0 && Math.random() < 0.5) fx.emit('puff', gran.head.getWorldPosition(tmp).add(new THREE.Vector3(0, 0.4, 0)), { n: 1, speed: 1, life: 0.6, size: 0.4, grow: 1.5, upMul: 2 });
}
function domino(g) {
  if (g.spent) return;
  g.spent = true; audio.sfx('crunch'); pop('ラジオ体操ドミノ！', 'gold big'); ach('radio');
  say('baa', 'いち、に、さん…ごめんよーー！', { dur: 2 });
  const s = g.list.slice().sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
  s.forEach((e, i) => { e.fall = { t: 0, delay: i * 0.12 }; setTimeout(() => { if (state === 'play') { audio.sfx('combo', P.combo + i); fx.emit('puff', e.obj.position, { n: 2, speed: 1.5, life: 0.5, size: 0.9, up0: 0 }); } }, i * 120); });
  P.combo += s.length; P.comboT = 3; P.score += Math.round(80 * s.length * mult()); addGauge(40); renderCombo(true);
}
function updateKid(dt) {
  if (!kidAway) return;
  const k = kidAway; k.t += dt;
  const r = rider.root;
  if (k.phase === 'off') {
    const gx = POI.school.x, gz = POI.school.z - 4;
    const dx = gx - r.position.x, dz = gz - r.position.z, d = Math.hypot(dx, dz);
    if (d > 0.3) { r.position.x += dx / d * 3 * dt; r.position.z += dz / d * 3 * dt; r.rotation.y = Math.atan2(dx, dz); }
    const ph = k.t * 12; if (rider.legs.length) { rider.legs[0].rotation.x = Math.sin(ph) * 0.8; rider.legs[1].rotation.x = -Math.sin(ph) * 0.8; }
    if (k.t > 3) { k.phase = 'back'; k.t = 0; say('kid', 'やっぱり ばあちゃんと遊ぶーーー！', { dur: 2.2 }); say('baa', 'ほっほっほ、しょうがない子じゃ', { dur: 2 }); pop('孫が戻ってきた！', 'small'); }
  } else {
    gran.torso.updateMatrixWorld(true);
    const seat = gran.torso.localToWorld(new THREE.Vector3(0, 0.44, -0.2));
    r.position.lerp(seat, Math.min(1, dt * 3 + k.t * 0.05)); r.position.y += Math.sin(Math.min(1, k.t) * Math.PI) * 0.4;
    if (k.t > 1.4 || r.position.distanceTo(seat) < 0.3) { seatRider(rider); legsRiding(true); kidAway = null; audio.sfx('pop'); }
  }
}

// ---------------------------------------------------------------- granny pose
function poseGranny(dt, mode) {
  const R = gran.root, title = mode === 'title', introM = mode === 'intro';
  R.position.set(P.x, P.y, P.z);
  const fev = P.fever > 0;
  R.scale.setScalar(R.scale.x + ((fev ? 1.45 : 1) - R.scale.x) * Math.min(1, dt * 6));
  const spd = introM ? (P.introRun ? P.speed : 0) : P.speed;
  const run = title || (introM && !P.introRun) ? 0 : clamp(spd / 18, 0, 1);
  P.phase += dt * (5 + spd * 0.6);
  const ph = P.phase;
  const crouch = introM && P.introCrouch ? 1 : 0;
  gran.legs.forEach(([th, kn], i) => {
    const o = i ? Math.PI : 0;
    let a = -Math.sin(ph + o) * 1.15 * run, b = Math.max(0, Math.sin(ph + o + 1.2)) * 1.7 * run + 0.1;
    if (P.air && !introM) { a = P.superJump ? -0.5 - Math.sin(P.t * 30 + i * 3) * 0.9 : -1.2 + i * 0.6; b = P.superJump ? 0.7 : 1.8 - i * 0.6; }
    if (crouch) { a = -1.3; b = 2.1; }
    if (P.bonT > 0) { a = Math.sin(P.t * 8 + o) * 0.5 - 0.2; b = 0.6; }
    th.rotation.x = a; kn.rotation.x = b;
  });
  gran.hips.position.y = crouch ? 0.5 : gran.base.hips.y + Math.abs(Math.sin(ph)) * 0.08 * run;
  gran.hips.rotation.y = Math.sin(ph) * 0.2 * run;
  const lean = title ? 0.15 : introM ? (crouch ? 1.0 : P.introRun ? 0.8 : 0.2) : P.bonT > 0 ? 0.1 : 0.75 + (P.speed > 30 ? 0.15 : 0);
  gran.torso.rotation.x += (lean - gran.torso.rotation.x) * Math.min(1, dt * 10);
  gran.torso.rotation.z = Math.sin(ph) * 0.07 * run;
  gran.arms.forEach(([sh, el, s], i) => {
    let a = Math.sin(ph + (i ? Math.PI : 0)) * 1.3 * run - 0.2, b = -1.2 * run - 0.2, z = 0.12 * s;
    if (P.air && !introM) { a = P.superJump ? -2.8 + Math.sin(P.t * 25 + i) * 0.6 : -2.4; b = -0.3; z = s * 0.7; }
    if (fev && !P.air) { a = -0.6 + Math.sin(ph * 2 + i) * 0.6; z = s * 1.2; }
    if (title) { a = Math.sin(P.t * 2.5 + i * Math.PI) * 0.4; b = -0.3; z = s * (0.25 + Math.max(0, Math.sin(P.t * 2.5)) * 0.25); }
    if (P.bonT > 0) { a = -2.6 + Math.sin(P.t * 4 + i * Math.PI) * 0.5; b = -0.4; z = s * 0.5; }
    if (i === 1 && ((introM && P.introSip) || P.drinkT > 0)) { a = -1.6; b = -1.9; z = -0.3; }
    sh.rotation.set(a, 0, z); el.rotation.x = b;
  });
  if (gran.bag) gran.bag.rotation.x = Math.sin(ph * 2) * 0.4 * run;
  gran.head.rotation.x = -gran.torso.rotation.x * 0.8 + (title ? 0 : 0.1);
  gran.head.rotation.y = title ? Math.sin(P.t * 0.8) * 0.3 : 0;
  thermosObj.visible = (introM && P.introSip) || P.drinkT > 0 || (introM && intro && intro.t < 7.8);
  gran.bun.rotation.y += dt * (fev || P.teaT > 0 ? 45 : 0); if (!fev && !(P.teaT > 0)) gran.bun.rotation.y *= 0.9;
  if (P.teethT > 0) {
    const q = Math.sin((1 - P.teethT / (P.superJump ? 1.6 : 0.75)) * Math.PI);
    gran.teeth.position.set(gran.base.teeth.x, gran.base.teeth.y + q * 0.25, gran.base.teeth.z + q * 0.4);
    gran.teeth.rotation.x = -q * 3; gran.teeth.scale.setScalar(1 + q * 1.6);
  } else { gran.teeth.position.copy(gran.base.teeth); gran.teeth.rotation.x = 0; gran.teeth.scale.setScalar(1); }
  if (P.glassesT > 0) { P.glassesT -= dt; const q = Math.sin((1 - Math.max(0, P.glassesT)) * Math.PI); gran.glasses.position.set(gran.base.glasses.x + q * 0.2, gran.base.glasses.y + q * 0.7, gran.base.glasses.z + q * 0.3); gran.glasses.rotation.z = q * 6; }
  else { gran.glasses.position.copy(gran.base.glasses); gran.glasses.rotation.z = 0; }
  R.rotation.y = P.h;
  R.rotation.x = P.superJump ? -P.flip * Math.PI * 2 : 0;
  R.rotation.z = P.driftT > 0 ? -Math.sign(steer + keySteer) * 0.25 : 0;
  gran.aura.material.opacity += ((fev ? 0.22 + Math.sin(P.t * 20) * 0.06 : 0) - gran.aura.material.opacity) * Math.min(1, dt * 8);
  gran.aura.visible = gran.aura.material.opacity > 0.01;
  // passenger
  const r = rider;
  if (r.root.parent === gran.torso) {
    r.root.position.set(0, 0.44 + (P.riderOff || 0) + Math.abs(Math.sin(ph)) * 0.05 * run, -0.2);
    r.root.rotation.x = -gran.torso.rotation.x + 0.2 - ((P.riderOff || 0) > 0 ? P.riderOff * 1.5 : 0);
  }
  const scared = !title && (P.speed > 25 || P.air || (P.riderOff || 0) > 0 || fev || P.driftT > 0);
  r.arms.forEach((a, i) => { const s = i ? -1 : 1; a.rotation.z = s * (scared || title ? 2.6 + Math.sin(P.t * 20 + i) * 0.35 : 0.5); a.rotation.x = scared ? 0 : -0.9; });
  if (r.mouth) r.mouth.scale.setScalar(scared ? 1.8 : 1);
  if (r.tail) r.tail.rotation.y = Math.sin(P.t * 14) * 0.6;
}

// ---------------------------------------------------------------- camera
const camPos = new THREE.Vector3(-6, 3, 37), camLook = new THREE.Vector3(3, 1, 37.5);
function updateCamera(real) {
  if (state === 'intro') return;
  let pos, look;
  if (state === 'title' || state === 'boot') {
    const a = 0.45 + Math.sin(performance.now() / 5000) * 0.35;
    const f = fwd();
    pos = tmp.set(P.x + Math.sin(P.h + a) * 3.3, 1.55, P.z + Math.cos(P.h + a) * 3.3);
    look = new THREE.Vector3(P.x, 1.1, P.z);
    camera.fov = 48; void f;
  } else {
    const f = fwd(), sj = P.superJump ? 1 : 0, fv = P.fever > 0 ? 1 : 0;
    const bon = P.bonT > 0 ? 1 : 0;
    const back = 6.6 + sj * 3 + fv * 1.6 + bon * 3, up = 3.3 + P.y * 0.55 + sj * 1.5 + fv * 0.8 + bon * 5;
    pos = tmp.set(P.x - f.x * back, up, P.z - f.z * back);
    look = new THREE.Vector3(P.x + f.x * 7, 1.2 + P.y * 0.6, P.z + f.z * 7);
    const fov = 60 + clamp((P.speed - 18) * 0.5, 0, 14) + fv * 8 + P.punch * 4;
    camera.fov += (fov - camera.fov) * Math.min(1, real * 6);
  }
  camPos.lerp(pos, Math.min(1, real * (state === 'title' ? 3 : 6)));
  // keep the camera out of the buildings
  if (state === 'play') { const p = { x: camPos.x, z: camPos.z }; town.collide(p, 0.6); camPos.x = p.x; camPos.z = p.z; }
  camLook.lerp(look, Math.min(1, real * 10));
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += rnd(-1, 1) * shake * 0.35; camera.position.y += rnd(-1, 1) * shake * 0.3; shake = Math.max(0, shake - real * 2.2); }
  camera.lookAt(camLook);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- HUD: score, combo, gauge, minimap, compass
const hudCache = {};
function renderHud() {
  const set = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
  set('kmh', Math.round(P.speed * 3.6));
  set('score', P.score.toLocaleString());
  const g = P.fever > 0 ? P.fever / FEVER_T * 100 : P.gauge;
  const gs = g.toFixed(0);
  if (hudCache.g !== gs) { hudCache.g = gs; $('gauge-fill').style.width = gs + '%'; $('gauge').classList.toggle('full', P.fever > 0); $('gauge-label').textContent = P.fever > 0 ? '覚醒中！！' : 'ばあちゃんゲージ'; }
  const tc = P.teaCd > 0 ? Math.ceil(P.teaCd) : '';
  if (hudCache.tea !== tc) { hudCache.tea = tc; $('btn-tea').classList.toggle('cd', !!tc); $('tea-cd').textContent = tc; }
}
function renderCombo(force) {
  const el = $('combo');
  if (P.combo < 3) { el.classList.remove('on'); return; }
  el.classList.add('on');
  $('combo-n').textContent = P.combo; $('combo-x').textContent = '×' + mult().toFixed(1);
  if (force) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
const mm = $('minimap'), mg = mm.getContext('2d');
let mmBase = null;
function drawMinimap() {
  const S = mm.width, k = S / 340;
  const X = (x) => (x + 170) * k, Z = (z) => (z + 170) * k;
  if (!mmBase) {
    mmBase = document.createElement('canvas'); mmBase.width = mmBase.height = S;
    const g = mmBase.getContext('2d');
    g.fillStyle = 'rgba(60,40,30,.75)'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#c9c2b6';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = i === 2 && j === 1 ? '#8cc06a' : '#c9b8a0'; g.fillRect(X(bc(i) - 28.5), Z(bc(j) - 28.5), 57 * k, 57 * k); }
  }
  mg.clearRect(0, 0, S, S); mg.drawImage(mmBase, 0, 0);
  mg.font = `${Math.round(S * 0.11)}px sans-serif`; mg.textAlign = 'center'; mg.textBaseline = 'middle';
  for (const id of ['school', 'park', 'shrine', 'bon', 'sale', 'sento', 'home']) { const s = POI[id]; mg.globalAlpha = save.ach[id] || (id === 'park' && save.ach.radio) ? 0.55 : 1; mg.fillText(s.icon, X(s.x), Z(s.z)); }
  mg.globalAlpha = 1;
  if (police) { mg.fillStyle = Math.floor(P.t * 6) % 2 ? '#ff3030' : '#3060ff'; mg.beginPath(); mg.arc(X(police.x), Z(police.z), 4, 0, 7); mg.fill(); }
  if (race) { mg.fillText('🛵', X(race.obj.position.x), Z(race.obj.position.z)); }
  mg.save(); mg.translate(X(P.x), Z(P.z)); mg.rotate(-P.h + Math.PI);
  mg.fillStyle = '#ff3d72'; mg.strokeStyle = '#fff'; mg.lineWidth = 2;
  mg.beginPath(); mg.moveTo(0, -8); mg.lineTo(6, 6); mg.lineTo(0, 3); mg.lineTo(-6, 6); mg.closePath(); mg.fill(); mg.stroke();
  mg.restore();
}
function objective() {
  if (race && !race.done) return { ...POI[race.target], race: true };
  const order = ['school', 'sale', 'shrine', 'bon', 'sento', 'park'];
  for (const id of order) if (!(save.ach[id] || (id === 'park' && save.ach.radio))) return POI[id];
  const near = order.map((id) => POI[id]).filter((s) => !cool[Object.keys(POI).find((k) => POI[k] === s)] || cool[Object.keys(POI).find((k) => POI[k] === s)] <= 0);
  return near.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[1] || near[0];
}
function renderCompass() {
  const o = objective(); if (!o) return;
  const dx = o.x - P.x, dz = o.z - P.z, d = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz) - P.h;
  $('obj-arrow').style.transform = `rotate(${-ang + Math.PI}rad)`;
  const t = `${o.icon} ${o.race ? '競争！' : ''}${o.name} ${Math.round(d)}m`;
  if (hudCache.obj !== t) { hudCache.obj = t; $('obj-text').textContent = t; }
}

// ---------------------------------------------------------------- title
function renderAch(id) {
  $(id).innerHTML = ACH.map((a) => `<li class="${save.ach[a.id] ? 'ok' : ''}"><i>${save.ach[a.id] ? '🏆' : '？'}</i><span><b>${save.ach[a.id] ? a.name : '？？？'}</b><small>${a.how}</small></span></li>`).join('');
}
function renderTitle() {
  $('t-ach').innerHTML = `<small>おもしろ実績</small><b>${achCount()}</b>/${ACH.length}`;
  $('best').textContent = save.best ? `ハイスコア ${save.best.toLocaleString()}点` : '';
  $('sel-rider').textContent = (RIDERS.find((x) => x.id === save.rider) || RIDERS[0]).name;
  $('sel-outfit').textContent = (OUTFITS.find((x) => x.id === save.outfit) || OUTFITS[0]).name;
  const next = [...RIDERS, ...OUTFITS].filter((x) => x.need > achCount()).sort((a, b) => a.need - b.need)[0];
  $('t-next').textContent = next ? `実績${next.need}個で「${next.name}」解放` : 'ぜんぶ解放！';
  renderAch('t-achlist');
}
function cycle(list, key, dir) {
  const avail = list.filter(unlocked);
  let i = avail.findIndex((x) => x.id === save[key]);
  i = (i + dir + avail.length) % avail.length;
  save[key] = avail[i].id; persist();
  if (key === 'rider') { riderId = save.rider; buildRider(riderId); } else setOutfit(save.outfit);
  audio.init(); audio.sfx('pop'); renderTitle();
  if (avail.length === 1) toast('おもしろ実績を集めると解放されます', '');
}
$('rider-prev').onclick = () => cycle(RIDERS, 'rider', -1); $('rider-next').onclick = () => cycle(RIDERS, 'rider', 1);
$('outfit-prev').onclick = () => cycle(OUTFITS, 'outfit', -1); $('outfit-next').onclick = () => cycle(OUTFITS, 'outfit', 1);
$('btn-start').onclick = start; $('btn-pause').onclick = pause; $('btn-resume').onclick = resume; $('btn-quit').onclick = toTitle;
$('btn-ach').onclick = () => { $('t-achlist').classList.toggle('on'); };
$('skip').onclick = (e) => { e.stopPropagation(); skipIntro(); };
function initToggle(id, key, getter, setter) {
  let on = true; try { on = localStorage.getItem(key) !== '0'; } catch (e) { /* ignore */ }
  setter(on); $(id).classList.toggle('on', on);
  $(id).onclick = () => { on = !getter(); setter(on); $(id).classList.toggle('on', on); try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) { /* ignore */ } if (on) { audio.init(); audio.say('はいよ', 'baa'); } };
}
initToggle('btn-sound', 'baachan-sound', () => audio.sound, (v) => audio.setSound(v));
initToggle('btn-voice', 'baachan-voice', () => audio.voice, (v) => audio.setVoice(v));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------------------------------------------------------------- loop
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); lines2d.resize(w, h); }
addEventListener('resize', resize); resize();
let last = performance.now(), mmT = 0;
const perf = { t: 0, n: 0, level: 0 };
function adapt(real) { // if the phone can't keep up: resolution first, then shadows
  perf.t += real; perf.n++;
  if (perf.t < 2.5) return;
  const fps = perf.n / perf.t; perf.t = 0; perf.n = 0;
  if (fps > 48 || perf.level >= 3) return;
  perf.level++;
  if (perf.level === 1 && dpr > 1) { dpr = 1; renderer.setPixelRatio(dpr); resize(); }
  else if (perf.level <= 2) { renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); }); perf.level = 2; }
  else { dpr = 0.8; renderer.setPixelRatio(dpr); resize(); }
}
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'boot') return;
  if (state === 'play') adapt(real);
  let dt = real * timeScale;
  if (hitstop > 0) { hitstop -= real; dt *= 0.08; }
  if (state === 'play') {
    update(dt); poseGranny(dt, 'play'); renderHud();
    mmT -= real; if (mmT <= 0) { mmT = 0.1; drawMinimap(); renderCompass(); }
  } else if (state === 'title') { P.t += real; poseGranny(real, 'title'); }
  else if (state === 'intro') updateIntro(real);
  if (state !== 'pause') { fx.update(dt, 1e9); updateBubbles(real); }
  town.update(P.x, P.z, camera.position, real);
  updateCamera(real);
  const it = state === 'play' ? clamp((P.speed - 28) / 10, 0, 1) + (P.fever > 0 ? 0.8 : 0) + (P.superJump ? 0.4 : 0) : 0;
  lines2d.draw(it, P.fever > 0 ? 'rgba(255,220,90,0.6)' : 'rgba(255,255,255,0.5)');
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- boot
(async () => {
  try { await loadAll(renderer, (k) => { $('load-fill').style.width = Math.round(k * 100) + '%'; }); }
  catch (e) { $('load-msg').textContent = '読み込みに失敗しました。再読み込みしてください'; console.error(e); return; }
  town = new Town(scene); fx = new FX(scene);
  gran = buildGranny();
  towelObj = clone('towel'); towelObj.position.set(0, 0.31, -0.02); towelObj.visible = false; gran.head.add(towelObj);
  thermosObj = clone('thermos'); thermosObj.rotation.x = Math.PI; thermosObj.position.set(0, -0.27, 0.05); thermosObj.visible = false; gran.arms[1][1].add(thermosObj);
  headCat = null;
  buildRamps();
  if (!unlocked(RIDERS.find((r) => r.id === save.rider) || { need: 99 })) save.rider = 'kid';
  if (!unlocked(OUTFITS.find((r) => r.id === save.outfit) || { need: 99 })) save.outfit = 'purple';
  riderId = save.rider; buildRider(riderId); setOutfit(save.outfit);
  resetRun();
  state = 'title'; show('boot', false); show('title', true); renderTitle();
  requestAnimationFrame(frame);
})();
window.__baa = { town: () => town, scene, P, V, get state() { return state; }, ents: () => ents, start, skipIntro, save, info: () => renderer.info.render, setSteer: (s) => { steer = s; }, tea, jump, enterSpot,
  sim(s) { for (let i = 0; i < s * 60; i++) { if (state === 'intro') updateIntro(1 / 60); else if (state === 'play') { update(1 / 60); poseGranny(1 / 60, 'play'); } fx.update(1 / 60, 1e9); town.update(P.x, P.z, camera.position, 1 / 60); updateCamera(1 / 60); } } };
