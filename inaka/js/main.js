// いなかのなつやすみ: one summer day (8:00-18:00) in a countryside village. Collect the 12 summer stamps.
import * as THREE from 'three';
import { World, loadModels } from './world.js';
import { Input } from './input.js';
import { initAudio, sfx, setDayPhase, setRiver, setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const DAY_SECONDS = 420; // 10 in-game hours in 7 minutes
const isTouch = matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------------ stamps (the goals of the day)
const STAMPS = [
  { id: 'omairi', icon: '⛩️', name: '神社でおまいり', hint: '北の石段をのぼった先の神社', diary: '神社でおまいりした。' },
  { id: 'jizo', icon: '🙏', name: 'お地蔵さんにあいさつ', hint: '川の手前、橋のそば', diary: 'お地蔵さんに手をあわせた。' },
  { id: 'dagashi', icon: '🍬', name: '駄菓子を買う(30円)', hint: '東の道ぞいの駄菓子屋', diary: '駄菓子屋でお菓子を買った。' },
  { id: 'juice', icon: '🥤', name: '自販機でジュース(50円)', hint: '駄菓子屋のとなり', diary: '自販機でジュースを飲んだ。足が速くなった気がする。' },
  { id: 'suika', icon: '🍉', name: 'スイカをおばあちゃんへ', hint: '南の畑のスイカを駄菓子屋のおばあちゃんへ', diary: '畑のスイカをおばあちゃんに届けた。' },
  { id: 'kabuto', icon: '🪲', name: 'カブトムシを3びき', hint: '木の幹にいる。キラキラが目印', diary: 'カブトムシをつかまえた。' },
  { id: 'ushi', icon: '🐄', name: '牛にあいさつ', hint: '北西の牧場', diary: '牧場の牛に「モー」とあいさつされた。' },
  { id: 'neko', icon: '🐈', name: 'ねこをなでる', hint: '駄菓子屋のあたりをうろうろ', diary: 'ねこをなでた。ゴロゴロいっていた。' },
  { id: 'shiba', icon: '🐕', name: '柴犬とあそぶ', hint: '東の民家のあたり', diary: '柴犬となかよくなった。ずっとついてきた。' },
  { id: 'kawa', icon: '💦', name: '川で水あそび', hint: '村の南を流れる小川', diary: '川で水あそびをした。つめたかった。' },
  { id: 'densha', icon: '🚃', name: '駅で電車を見送る', hint: '橋をわたった先の無人駅のホーム', diary: '駅のホームで電車を見送った。' },
  { id: 'matsuri', icon: '🏮', name: '夏祭りでわたあめ(20円)', hint: '16時から、神社の屋台', diary: '夏祭りでわたあめを食べた。' },
];
const STAMP_POINTS = 100, BEETLE_POINTS = 30;

// coins (10円 each) and beetle trees
const COIN_SPOTS = [[-6, 4], [-14, -2], [8, 10], [2, -18], [-2, -32], [12, -24], [24, -16], [38, 6], [52, 4], [60, -6], [-34, 2], [-48, -4], [-26, 24], [-8, 22],
  [6, 38], [16, 41], [-50, -20], [22, 26], [44, -26], [-10, -48], [0, -60], [-40, -48], [30, 30], [-58, 14]];
const BEETLE_SPOTS = [[-31, -5], [6.5, -26], [-6.5, -20], [27, -33], [54, -31], [29, -46], [52, -47], [-11, -68], [11, -69], [-12, -60], [12, -62]];

// ------------------------------------------------------------------ renderer
const canvas = $('gl');
const quality = { shadows: !isTouch, pixelRatio: Math.min(devicePixelRatio, isTouch ? 1.5 : 2) };
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(quality.pixelRatio);
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 68 : 55; // wider view in portrait
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const input = new Input($('stick'), $('knob'));
let world, player, G = null;

// ------------------------------------------------------------------ boot
const MODELS = ['michi', 'road', 'kawa', 'hashi', 'suisha', 'jizo', 'hasakake', 'kominka', 'kura', 'naya', 'ido', 'kaki_tree', 'tanuki', 'monohoshi', 'jitensha',
  'kounki', 'tanbo', 'kakashi', 'take_gaki', 'dagashiya', 'obaachan', 'jihanki', 'post', 'bench', 'minka', 'keitora', 'bus_stop', 'curve_mirror', 'denchu', 'kousha',
  'sakura', 'himawari', 'hatake', 'ishidan', 'torii', 'honden', 'ishidoro', 'yatai', 'chochin_post', 'sugi', 'hokora', 'eki', 'densha', 'take', 'rock', 'bush',
  'ushi', 'niwatori', 'neko', 'shiba', 'kodomo', 'suika', 'kabuto'];
loadModels(MODELS, (k) => { $('loadbar').style.width = Math.round(k * 100) + '%'; }).then(() => {
  world = new World(scene, quality);
  player = makePlayer();
  $('loading').hidden = true; $('start').hidden = false;
  const best = loadSave();
  if (best.days) $('record').textContent = `これまで ${best.days}日あそんだ ・ さいこう ${best.best}ポイント`;
  world.setHour(8, player.pos); placeCamera(1);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}).catch((e) => { $('loading').textContent = 'よみこみに失敗しました: ' + e.message; });

function loadSave() { try { return JSON.parse(localStorage.getItem('inaka-save')) || {}; } catch { return {}; } }
function writeSave(s) { try { localStorage.setItem('inaka-save', JSON.stringify(s)); } catch { /* private mode */ } }

// ------------------------------------------------------------------ player (the kid in the straw hat)
function makePlayer() {
  const o = world.place('kodomo', -22.5, -1.5, 0, { col: false });
  const parts = {};
  for (const n of ['arm_l', 'arm_r', 'leg_l', 'leg_r']) parts[n] = o.getObjectByName('kodomo_' + n);
  return { o, parts, pos: o.position, yaw: 0, speed: 0, walkT: 0, stepT: 0, carry: null };
}

const cam = { yaw: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() };
function placeCamera(k) {
  const p = player.pos, d = 6.2, h = 3.0;
  // pull the camera in when a building stands between it and the kid
  let dd = d;
  for (let i = 1; i <= 12; i++) {
    const k2 = i / 12 * d;
    if (world.insideBox(p.x + Math.sin(cam.yaw) * k2, p.z + Math.cos(cam.yaw) * k2)) { dd = Math.max(1.2, k2 - 0.6); break; }
  }
  const want = new THREE.Vector3(p.x + Math.sin(cam.yaw) * dd, p.y + h * (0.55 + 0.45 * dd / d), p.z + Math.cos(cam.yaw) * dd);
  cam.pos.lerp(want, k); cam.look.lerp(new THREE.Vector3(p.x, p.y + 1.1, p.z), k);
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
}

// ------------------------------------------------------------------ new day
function newDay() {
  if (G) for (const c of G.coins) world.root.remove(c.mesh);
  if (G) for (const b of G.beetles) world.root.remove(b.o, b.sp);
  if (G) for (const s of G.suikas) world.root.remove(s.o);
  if (player.carry) { player.o.remove(player.carry); player.carry = null; }
  G = { t: 0, hour: 8, stamps: {}, log: [], coins: [], beetles: [], suikas: [], money: 0, beetleCount: 0, boost: 0, seen: new Set(), over: false, trainSeen: false };
  player.pos.set(-22.5, 0, -1.5); player.yaw = 0; cam.yaw = Math.PI; // start in front of the farmhouse, looking south over the fields
  world.dog.follow = null; world.dog.o.position.set(31, 0, -6);
  const coinGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), coinMat = new THREE.MeshStandardMaterial({ color: 0xd08a3a, metalness: 0.9, roughness: 0.3, emissive: 0x3a1a00 });
  for (const [x, z] of COIN_SPOTS) {
    const m = new THREE.Mesh(coinGeo, coinMat); m.rotation.x = Math.PI / 2; m.position.set(x, world.floorAt(x, z) + 0.6, z); world.root.add(m);
    G.coins.push({ mesh: m, taken: false });
  }
  // 7 of the beetle trees get a beetle today, on the side of the trunk that faces the village centre
  const spots = BEETLE_SPOTS.slice().sort(() => Math.random() - 0.5).slice(0, 7);
  for (const [x, z] of spots) {
    const a = Math.atan2(-x, -z), y = world.floorAt(x, z);
    const o = world.place('kabuto', x + Math.sin(a) * 0.32, z + Math.cos(a) * 0.32, a + Math.PI, { col: false, scale: 3, y: y + 1.0 });
    o.rotation.x = -Math.PI / 2; o.rotation.order = 'YXZ';
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex(), color: 0xfff2a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(o.position.x, y + 1.3, o.position.z); sp.scale.setScalar(0.9); world.root.add(sp);
    G.beetles.push({ o, sp, taken: false, x: o.position.x, z: o.position.z });
  }
  for (let i = 0; i < 5; i++) {
    const x = 13.8 + i * 1.1 + (i % 2) * 0.3, z = 23.4 + (i % 2) * 0.9;
    G.suikas.push({ o: world.place('suika', x, z, i, { col: false, scale: 1.6 }), taken: false });
  }
  updateHud();
}

let sparkle = null;
function sparkleTex() {
  if (sparkle) return sparkle;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,160,0.8)'); gr.addColorStop(1, 'rgba(255,220,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(30, 4, 4, 56); g.fillRect(4, 30, 56, 4);
  return (sparkle = new THREE.CanvasTexture(c));
}

// ------------------------------------------------------------------ interactions
function clock(h = G.hour) { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${hh}:${String(mm).padStart(2, '0')}`; }
function stamp(id) {
  if (G.stamps[id]) return;
  const s = STAMPS.find((x) => x.id === id);
  G.stamps[id] = clock();
  G.log.push(`${clock()} ${s.diary}`);
  sfx('stamp');
  showStampPop(s);
  updateHud();
}
function toast(msg, ms = 2600) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), ms);
}
function showStampPop(s) {
  const el = $('stamppop'); el.innerHTML = `<div class="si">${s.icon}</div><div>${s.name}</div><b>スタンプゲット!</b>`;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}
function pay(cost, what) {
  if (G.money < cost) { sfx('nope'); toast(`お金がたりない…(${what}は${cost}円。いま${G.money}円)`); return false; }
  G.money -= cost; sfx('coin'); updateHud(); return true;
}
function near(x, z, r) { return Math.hypot(player.pos.x - x, player.pos.z - z) < r; }

// each returns {label, act} when the player can do something here
function interactions() {
  const list = [];
  const add = (x, z, r, label, act) => { if (near(x, z, r)) list.push({ d: Math.hypot(player.pos.x - x, player.pos.z - z), label, act }); };
  add(0, -59, 2.2, G.stamps.omairi ? 'おまいりする' : 'おまいりする ⛩️', () => { sfx('bell'); if (!G.stamps.omairi) setTimeout(() => stamp('omairi'), 1300); else toast('いい一日になりますように。'); });
  add(3.2, 30, 1.8, 'お地蔵さんにあいさつ', () => { if (G.stamps.jizo) toast('お地蔵さんがにっこりしている気がする。'); else stamp('jizo'); });
  const ob = world.obaachan.position;
  add(ob.x, ob.z, 1.8, player.carry ? 'スイカをわたす 🍉' : 'おばあちゃんと話す', () => {
    if (player.carry) {
      player.o.remove(player.carry); player.carry = null; G.money += 50;
      sfx('pick'); stamp('suika'); toast('おばあちゃん「まあ立派なスイカ! はい、お駄賃の50円」');
    } else if (!G.stamps.suika) toast('おばあちゃん「畑のスイカ、ひとつ持ってきてくれるかい? お駄賃あげるよ」', 3600);
    else toast(['おばあちゃん「暑いから、こまめに水を飲むんだよ」', 'おばあちゃん「夕方になったら神社でお祭りだよ」', 'おばあちゃん「川は浅いけど、すべらないようにね」'][Math.floor(Math.random() * 3)], 3200);
  });
  add(13.6, -4.4, 1.6, '駄菓子を買う (30円)', () => { if (pay(30, '駄菓子')) { stamp('dagashi'); toast('ラムネ菓子とうまい棒を買った。'); } });
  add(19.6, -4.5, 1.4, 'ジュースを買う (50円)', () => {
    if (pay(50, 'ジュース')) { sfx('clank'); setTimeout(() => sfx('drink'), 400); G.boost = 40; stamp('juice'); toast('ゴクゴク… 体が軽い! しばらく足が速くなる'); }
  });
  for (const a of world.animals) {
    const p = a.o.position;
    if (a.name === 'ushi') add(p.x, p.z, 4.2, '牛にあいさつ', () => { sfx('moo'); stamp('ushi'); });
    if (a.name === 'neko') add(p.x, p.z, 1.6, 'ねこをなでる', () => { sfx('meow'); a.wait = 4; a.target.set(p.x, p.z); stamp('neko'); });
    if (a.name === 'shiba') add(p.x, p.z, 1.8, a.follow ? 'なでる' : '柴犬とあそぶ', () => { sfx('woof'); if (!a.follow) { a.follow = true; stamp('shiba'); toast('柴犬がしっぽをふってついてくる!'); } });
    if (a.name === 'niwatori') add(p.x, p.z, 1.3, 'ニワトリ', () => { sfx('cluck'); a.target.set(p.x + (p.x - player.pos.x) * 3, p.z + (p.z - player.pos.z) * 3); a.wait = 0; toast('コケッ! ニワトリはにげていった。'); });
  }
  for (const b of G.beetles) if (!b.taken) add(b.x, b.z, 1.5, 'カブトムシをつかまえる 🪲', () => {
    b.taken = true; world.root.remove(b.o, b.sp); G.beetleCount++; sfx('pick');
    toast(`カブトムシをつかまえた! (${G.beetleCount}ひき)`);
    if (G.beetleCount === 3) stamp('kabuto'); else updateHud();
  });
  if (!player.carry) for (const s of G.suikas) if (!s.taken) add(s.o.position.x, s.o.position.z, 1.3, 'スイカをもつ 🍉', () => {
    s.taken = true; world.root.remove(s.o);
    const o = s.o.clone(); o.position.set(0, 1.45, 0); o.scale.setScalar(1.3); player.o.add(o); player.carry = o; sfx('pick');
    toast('スイカを頭の上にかかえた。駄菓子屋のおばあちゃんにとどけよう。');
  });
  for (const x of [-8, 8]) add(x, -57, 2.4, G.hour >= 16 ? 'わたあめを買う (20円)' : '屋台', () => {
    if (G.hour < 16) { toast('まだ準備中みたい。夕方(16時)から開くらしい。'); return; }
    if (pay(20, 'わたあめ')) { stamp('matsuri'); toast('ふわふわのわたあめ!'); }
  });
  // little things to find (no stamp)
  const flavor = [[-38.6, 9.7, 'カカシ', 'カカシ「……」 なにも言わないけど、たのもしい。'], [-21.4, 18.3, 'カカシ', 'こっちのカカシはちょっと笑っている。'], [-20.5, -8.8, 'たぬき', '信楽焼のたぬき。なぜか誇らしげ。'],
    [21.2, -4.9, 'ポスト', '赤い丸ポスト。「暑中お見舞い申し上げます」のハガキを入れた気分。'], [-17.5, -6.5, '井戸', '井戸の水をくんだ。ひんやりつめたい。'], [30, 5.5, 'バス停', '時刻表によると、次のバスは… 2時間後。'],
    [-5, -34.6, '祠', '小さな祠。だれかがお花をそなえている。'], [-15.5, -9.5, '自転車', 'ぼくの自転車。今日は歩いて探検しよう。'], [40.5, -6.5, '軽トラ', 'おじさんの軽トラ。荷台に麦わら帽子がのっている。'],
    [-16, 26, '水車', '水車がゴトン、ゴトンとまわっている。'], [40, -33.5, '学校', '夏休みの校舎。だれもいなくて、しずか。']];
  for (const [x, z, label, msg] of flavor) add(x, z, 2.0, label, () => { toast(msg, 3200); });
  list.sort((a, b) => a.d - b.d);
  return list[0] || null;
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), running = false, hudT = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (running && !G.over) step(dt);
  else if (world) { world.update(dt, player); }
  if (world) {
    if (!running) { cam.yaw += dt * 0.08; placeCamera(0.05); }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
}

function step(dt) {
  input.update();
  G.t += dt; G.hour = 8 + 10 * Math.min(1, G.t / DAY_SECONDS);
  world.setHour(G.hour, player.pos);
  // movement relative to the camera
  cam.yaw += input.takeCam();
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  const mx = input.move.x, my = input.move.y, mag = Math.hypot(mx, my);
  const wet = world.inRiver(player.pos.x, player.pos.z);
  G.boost = Math.max(0, G.boost - dt);
  const maxSpd = (G.boost > 0 ? 7.2 : 4.6) * (input.run ? 1.35 : 1) * (wet ? 0.6 : 1) * (player.carry ? 0.85 : 1);
  if (mag > 0.05) {
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw); // camera right
    const vx = fx * my + rx * mx, vz = fz * my + rz * mx;
    const l = Math.hypot(vx, vz);
    player.speed = maxSpd * Math.min(1, mag);
    player.pos.x += vx / l * player.speed * dt; player.pos.z += vz / l * player.speed * dt;
    const want = Math.atan2(vx, vz);
    let diff = want - player.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    player.yaw += diff * Math.min(1, dt * 12);
    // camera slowly swings behind the player
    let cd = (player.yaw + Math.PI) - cam.yaw; cd = Math.atan2(Math.sin(cd), Math.cos(cd));
    if (my > -0.3) cam.yaw += cd * dt * 0.9 * Math.min(1, mag);
  } else player.speed = 0;
  world.collide(player.pos, 0.3);
  const fy = world.floorAt(player.pos.x, player.pos.z);
  player.pos.y += (fy - player.pos.y) * Math.min(1, dt * 14);
  player.o.rotation.y = player.yaw;
  animatePlayer(dt, wet);
  if (wet) {
    if (!G.stamps.kawa) { stamp('kawa'); sfx('splash'); }
  }
  setRiver(Math.max(0, 1 - Math.abs(player.pos.z - 34) / 14));
  // coins
  for (const c of G.coins) {
    if (c.taken) continue;
    c.mesh.rotation.z += dt * 3;
    if (Math.hypot(player.pos.x - c.mesh.position.x, player.pos.z - c.mesh.position.z) < 1.0 && Math.abs(player.pos.y + 0.6 - c.mesh.position.y) < 1.2) {
      c.taken = true; world.root.remove(c.mesh); G.money += 10; sfx('coin'); updateHud();
    }
  }
  for (const b of G.beetles) if (!b.taken) b.sp.material.opacity = 0.45 + Math.sin(G.t * 5 + b.x) * 0.4;
  // train: stamp when it leaves while you stand on the platform
  world.update(dt, player);
  const ev = world.trainState.event;
  const onPlatform = player.pos.x > 4 && player.pos.x < 24 && player.pos.z > 43 && player.pos.z < 48;
  if (ev === 'approach' && Math.hypot(player.pos.x - 12, player.pos.z - 46) < 60) sfx('horn');
  if (ev === 'arrive' && Math.hypot(player.pos.x - 12, player.pos.z - 46) < 50) sfx('train');
  if (ev === 'depart') { if (Math.hypot(player.pos.x - 12, player.pos.z - 46) < 50) { sfx('horn'); sfx('train'); } if (onPlatform) setTimeout(() => stamp('densha'), 1500); }
  // camera
  placeCamera(1 - Math.pow(0.002, dt));
  // contextual action
  const it = interactions();
  const btn = $('act');
  if (it) { btn.textContent = it.label; btn.classList.add('on'); } else btn.classList.remove('on');
  if (input.takeAction() && it) it.act();
  setDayPhase(1 - smoothstep(15.5, 17, G.hour), smoothstep(15.5, 17, G.hour));
  hudT -= dt; if (hudT <= 0) { hudT = 0.25; $('clock').textContent = clock(); drawMap(); }
  if (G.hour >= 16 && !G.seen.has('matsuri')) { G.seen.add('matsuri'); toast('ドーン… 神社のほうから夏祭りの音が聞こえてきた。', 3500); }
  if (G.hour >= 17.5 && !G.seen.has('late')) { G.seen.add('late'); toast('そろそろ日がくれる。夕焼けがきれいだ。', 3000); }
  if (G.hour >= 18) endDay();
}
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function animatePlayer(dt, wet) {
  const p = player.parts, s = player.speed;
  player.walkT += dt * (4 + s * 1.9);
  const sw = s > 0.1 ? Math.sin(player.walkT) * Math.min(1, s / 4) * 0.9 : 0;
  const k = Math.min(1, dt * 12);
  p.leg_l.rotation.x += (sw - p.leg_l.rotation.x) * k; p.leg_r.rotation.x += (-sw - p.leg_r.rotation.x) * k;
  const armUp = player.carry ? -2.8 : null;
  p.arm_l.rotation.x += ((armUp ?? -sw * 0.9) - p.arm_l.rotation.x) * k;
  p.arm_r.rotation.x += ((armUp ?? sw * 0.9) - p.arm_r.rotation.x) * k;
  player.o.children.forEach((c) => { if (c.name === 'kodomo_body') c.position.y = s > 0.1 ? Math.abs(Math.sin(player.walkT)) * 0.05 : 0; });
  if (s > 0.1) {
    player.stepT -= dt * s;
    if (player.stepT <= 0) { player.stepT = 1.6; sfx('step', { water: wet }); }
  }
}

// ------------------------------------------------------------------ HUD, card, minimap, diary
function updateHud() {
  $('money').textContent = G.money + '円';
  $('beetle').textContent = G.beetleCount;
  const n = Object.keys(G.stamps).length;
  $('cardbtn').textContent = `📒 ${n}/${STAMPS.length}`;
}
function openCard() {
  $('cardgrid').innerHTML = STAMPS.map((s) => {
    const done = G.stamps[s.id];
    return `<div class="cell ${done ? 'done' : ''}"><div class="si">${done ? s.icon : '？'}</div><b>${s.name}</b><small>${done ? done + ' ゲット' : s.hint}</small></div>`;
  }).join('');
  $('card').hidden = false; running = false;
}
$('cardbtn').onclick = () => openCard();
$('cardclose').onclick = () => { $('card').hidden = true; running = true; last = performance.now(); };
$('act').addEventListener('pointerdown', (e) => { e.preventDefault(); input.actionPressed = true; });
$('mute').onclick = () => { setMuted(!isMuted()); $('mute').textContent = isMuted() ? '🔇' : '🔊'; };

const mapC = $('map'), mctx = mapC.getContext('2d');
let mapBg = null;
const MS = 75; // metres from the centre to the minimap edge
function drawMapBg() {
  const W = mapC.width, c = document.createElement('canvas'); c.width = c.height = W;
  const g = c.getContext('2d'), k = W / 2 / MS, X = (x) => W / 2 + x * k;
  g.fillStyle = '#6f9b46'; g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2f5a2a'; g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.arc(W / 2, W / 2, 70 * k, 0, Math.PI * 2, true); g.fill();
  g.fillStyle = '#7cc0e0'; g.fillRect(0, X(32.4), W, 3.2 * k);
  g.fillStyle = '#8fa8c8'; for (const x of [-47.2, -38.6, -30, -21.4]) for (const z of [9.7, 18.3]) g.fillRect(X(x - 4), X(z - 4), 8 * k, 8 * k);
  g.strokeStyle = '#d8c08a'; g.lineWidth = 2.6 * k;
  for (const [a, b, c2, d] of world.mapRoads) { g.beginPath(); g.moveTo(X(a), X(b)); g.lineTo(X(c2), X(d)); g.stroke(); }
  g.strokeStyle = '#555'; g.lineWidth = 1.5 * k; g.beginPath(); g.moveTo(X(-70), X(49.2)); g.lineTo(X(70), X(49.2)); g.stroke();
  for (const r of world.mapRects) {
    g.save(); g.translate(X(r.x), X(r.z)); g.rotate(-r.ry);
    g.fillStyle = r.terrace ? '#5f8f38' : '#a0886a'; g.fillRect(-r.w / 2 * k, -r.d / 2 * k, r.w * k, r.d * k);
    if (r.terrace) { g.strokeStyle = '#ddd'; g.lineWidth = 1; g.strokeRect(-r.w / 2 * k, -r.d / 2 * k, r.w * k, r.d * k); }
    g.restore();
  }
  mapBg = c;
}
const STAMP_POS = { omairi: [0, -60], jizo: [4, 30], dagashi: [14, -5], juice: [19.6, -5], suika: [16, 23], ushi: [-40, -36], kawa: [-10, 34], densha: [12, 46], matsuri: [0, -57] };
function drawMap() {
  if (!mapBg) drawMapBg();
  const W = mapC.width, k = W / 2 / MS, X = (x) => W / 2 + x * k;
  mctx.clearRect(0, 0, W, W);
  mctx.save(); mctx.beginPath(); mctx.arc(W / 2, W / 2, W / 2 - 1, 0, Math.PI * 2); mctx.clip();
  mctx.drawImage(mapBg, 0, 0);
  mctx.fillStyle = '#ffd23a'; mctx.strokeStyle = '#7a5a00'; mctx.lineWidth = 1;
  const pos = { ...STAMP_POS, neko: [world.cat.o.position.x, world.cat.o.position.z], shiba: [world.dog.o.position.x, world.dog.o.position.z] };
  if (G.hour < 16) delete pos.matsuri;
  for (const [id, [x, z]] of Object.entries(pos)) if (!G.stamps[id]) { mctx.beginPath(); mctx.arc(X(x), X(z), 3.2, 0, Math.PI * 2); mctx.fill(); mctx.stroke(); }
  mctx.translate(X(player.pos.x), X(player.pos.z)); mctx.rotate(-player.yaw + Math.PI);
  mctx.fillStyle = '#ff3b30'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5;
  mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(4.5, 5); mctx.lineTo(-4.5, 5); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.restore();
}

function endDay() {
  G.over = true; running = false; input.enabled = false;
  $('act').classList.remove('on'); $('hud').hidden = true;
  sfx('chime');
  const n = Object.keys(G.stamps).length;
  const score = n * STAMP_POINTS + G.beetleCount * BEETLE_POINTS + G.money;
  const save = loadSave(); save.days = (save.days || 0) + 1; const isBest = score > (save.best || 0); save.best = Math.max(save.best || 0, score); writeSave(save);
  const lines = G.log.slice();
  if (G.beetleCount) lines.push(`カブトムシを${G.beetleCount}ひきつかまえた。`);
  lines.push(n === STAMPS.length ? 'スタンプを全部あつめた! さいこうの夏休み!' : n >= 8 ? 'たくさんあそんで、くたくただ。' : n >= 4 ? 'あしたはもっと遠くまで行ってみよう。' : 'のんびりすごした一日だった。');
  lines.push(`お小遣いは${G.money}円のこった。夕方のチャイムが鳴ったので帰った。`);
  const d = new Date();
  $('diarydate').textContent = `8月${(save.days % 31) || 31}日(${'日月火水木金土'[d.getDay()]}) はれ`;
  $('diarytext').innerHTML = lines.map((l) => `<p>${l}</p>`).join('');
  $('diaryscore').innerHTML = `スタンプ ${n}/${STAMPS.length} × ${STAMP_POINTS} + カブトムシ ${G.beetleCount} × ${BEETLE_POINTS} + ${G.money}円<br><b>${score} なつやすみポイント</b>${isBest ? ' <span class="best">さいこう記録!</span>' : ''}`;
  setTimeout(() => { $('diary').hidden = false; }, 1600);
}

function startGame() {
  initAudio();
  $('start').hidden = true; $('diary').hidden = true; $('hud').hidden = false;
  newDay();
  input.enabled = true; running = true; last = performance.now();
  placeCamera(1);
  toast('なつやすみの一日がはじまった! 18時のチャイムまでに、スタンプをあつめよう。', 3800);
  $('help').textContent = isTouch ? '左はんぶんをドラッグで移動・右はんぶんをスワイプで見まわす' : 'WASD/矢印で移動・Shiftで走る・Q/Cで見まわす・Space/Eでしらべる';
}
$('startbtn').onclick = startGame;
$('again').onclick = startGame;

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__inaka = { get G() { return G; }, get world() { return world; }, get player() { return player; }, stamp, input };
