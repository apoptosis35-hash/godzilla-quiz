// ばあちゃんターボ — granny sprints through the shopping street with her grandchild on her back.
import * as THREE from 'three';
import * as MD from './models.js';
import { audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LANES = [-2.6, 0, 2.6];
const CH = 40; // city chunk length (m)

// ---------------------------------------------------------------- lines
const L = {
  start: ['しっかりつかまっときや！', 'ばあちゃん、本気出すけぇね！', '今日も特売に間に合わせるよ！'],
  idle: ['若いもんには負けんよ！', '腰？そんなもん知らん！', 'あめちゃん食べるか？', '昔は新幹線と競争したもんじゃ', 'ブレーキ？なにそれ', 'ひざが…まだいける！', '年金の日は足が軽いのう', '風が気持ちええのう〜', 'ほれ、ちゃんとつかまり！', 'ばあちゃんの青春はこれからじゃ', '今夜は肉じゃがにしようかね', '血圧？上がっとるよ！'],
  kid: ['ばあちゃん速すぎ！', 'こわいこわいこわい！', 'ばあちゃん前！前！', '宿題どうしよう…', 'ランドセルが飛んでいきそう！', 'ばあちゃん、何キロ出てるの！？', 'みんな見てるって！', '酔ってきた…'],
  hit: ['あいたたた！', '腰がっ！', 'いまのはノーカン！', 'メガネ、メガネ…', 'ちょっと当たっただけじゃ！'],
  kidHit: ['ぐえっ', 'ぎゃー！', 'おしり打った…', 'ばあちゃーん！'],
  jump: ['よっこいしょーー！', 'ほいさっ！', 'それっ！', '入れ歯がっ！'],
  slide: ['よっこらしょ', 'ばあちゃんリンボー！', 'ひょいっとな'],
  near: ['見えとらんかった！', 'ほっほっほ', 'ギリギリセーフじゃ', '今の見たかい？'],
  turbo: ['お茶パワーーー！', 'あったまってきたーー！', 'ばあちゃんターボ！！', '五臓六腑にしみわたる〜！'],
  teeth: ['入れ歯マグネット！', 'かみかみパワー！', 'あめちゃんカモン！'],
  pigeon: ['ハトさんごめんよ〜', 'ポッポー！', '豆はないよ！'],
  man: ['ぶちょーーーー！！', '定時で帰りたかったーー！', '有給とっとけばよかったーー！', 'お先に失礼しまーーす！', '会議に遅れるーー！'],
  manHit: ['すみませんっ！', 'いてっ！', '前見てなかったっす！'],
  over: ['今日はこのへんにしとこか…', '腰が…お茶にしよ…', 'ちょっと休憩じゃ', 'ばあちゃん、燃え尽きたわい'],
  by: ['はやっ！', '今のなに！？', 'ばあちゃん！？', 'キャー！', '風が…', 'え、ばあちゃん？', '頑張れーー！'],
  amazing: ['ほっほっほ！', 'まだまだ若いのう', 'あめちゃん最高じゃ！'],
};

// ---------------------------------------------------------------- renderer / scene
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const FOG = new THREE.Color(0xffd6a0);
scene.fog = new THREE.Fog(FOG, 70, 165);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
scene.add(new THREE.HemisphereLight(0xfff2dc, 0x8a6a50, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(-6, 12, 4); scene.add(sun);

// sky dome
const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x5ab4ff) }, mid: { value: new THREE.Color(0xffd6a0) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 mid; varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(mid, top, smoothstep(0.0, 0.45, h)), 1.0); }',
}));
scene.add(sky);
// a cartoon sun + clouds
const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshBasicMaterial({ color: 0xfff1a8, fog: false }));
scene.add(sunDisc);
const clouds = [];
for (let i = 0; i < 9; i++) {
  const c = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.95 });
  for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(rnd(4, 7), 10, 8), m); s.position.set(k * 6 - 9, rnd(-1, 2), rnd(-2, 2)); s.scale.y = 0.6; c.add(s); }
  c.userData.off = new THREE.Vector3(rnd(-140, 140), rnd(45, 80), rnd(-260, -160));
  scene.add(c); clouds.push(c);
}

MD.initTextures();

// ---------------------------------------------------------------- ground strips (follow the player, snapped to tile length)
const ground = new THREE.Group(); scene.add(ground);
const GL = 420;
MD.TEX.road.repeat.set(1, GL / 8);
const road = new THREE.Mesh(new THREE.PlaneGeometry(8.4, GL), new THREE.MeshToonMaterial({ map: MD.TEX.road, color: 0xffffff }));
road.rotation.x = -Math.PI / 2; ground.add(road);
MD.TEX.walk.repeat.set(1, GL / 3);
for (const s of [-1, 1]) {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(3.4, GL), new THREE.MeshToonMaterial({ map: MD.TEX.walk }));
  w.rotation.x = -Math.PI / 2; w.position.set(s * 5.9, 0.15, 0); if (s > 0) w.rotation.z = Math.PI; ground.add(w);
  const curb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, GL), MD.mat(0xd9d4cc)); curb.position.set(s * 4.3, 0.08, 0); ground.add(curb);
}
const dirt = new THREE.Mesh(new THREE.PlaneGeometry(120, GL), MD.mat(0x9a8a78)); dirt.rotation.x = -Math.PI / 2; dirt.position.y = -0.02; ground.add(dirt);

// ---------------------------------------------------------------- characters
const gran = MD.makeGranny(); scene.add(gran.root);
const kid = MD.makeKid(); gran.root.add(kid.root);
const headCat = MD.makeCat(); headCat.scale.setScalar(0.75); headCat.position.set(0, 0.14, 0.02); headCat.visible = false; kid.head.add(headCat);
const headPigeon = MD.makePigeon(); headPigeon.scale.setScalar(0.9); headPigeon.position.set(0, 0.34, 0.05); headPigeon.visible = false; gran.head.add(headPigeon);
const bigTeeth = MD.makeDentures(); bigTeeth.scale.setScalar(2.2); bigTeeth.position.set(0, 2.9, 0); bigTeeth.visible = false; gran.root.add(bigTeeth);
const teethBase = gran.teeth.position.clone();

// ---------------------------------------------------------------- particles (sprite pool)
const PMAX = 220;
const parts = [];
const spriteMats = {};
for (let i = 0; i < PMAX; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  s.visible = false; scene.add(s);
  parts.push({ s, life: 0, max: 1, v: new THREE.Vector3(), g: 0, grow: 0, size: 1, spin: 0 });
}
let pi = 0;
function emit(texName, pos, o = {}) {
  const n = o.n || 1;
  for (let k = 0; k < n; k++) {
    const p = parts[pi = (pi + 1) % PMAX];
    p.s.material.map = MD.TEX[texName]; p.s.material.color.set(o.color || 0xffffff); p.s.material.opacity = 1; p.s.material.rotation = rnd(0, 6.28);
    p.s.material.needsUpdate = true;
    p.s.position.copy(pos);
    if (o.spread) p.s.position.add(new THREE.Vector3(rnd(-1, 1) * o.spread, rnd(-0.5, 1) * o.spread * 0.6, rnd(-1, 1) * o.spread));
    const sp = o.speed ?? 2;
    p.v.set(rnd(-1, 1) * sp, rnd(o.up0 ?? 0.2, 1) * sp * (o.upMul ?? 1), rnd(-1, 1) * sp);
    if (o.vel) p.v.add(o.vel);
    if (o.follow) p.v.z -= P.speed * o.follow;
    p.life = p.max = (o.life || 0.8) * rnd(0.7, 1.2);
    p.g = o.g ?? 0; p.size = (o.size || 0.6) * rnd(0.7, 1.3); p.grow = o.grow ?? 0.5; p.spin = rnd(-4, 4) * (o.spinMul ?? 1);
    p.s.scale.setScalar(p.size); p.s.visible = true;
  }
}
function updateParts(dt) {
  for (const p of parts) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.s.visible = false; continue; }
    p.v.y += p.g * dt;
    p.s.position.addScaledVector(p.v, dt);
    p.size *= 1 + p.grow * dt;
    p.s.scale.setScalar(p.size);
    p.s.material.rotation += p.spin * dt;
    p.s.material.opacity = Math.min(1, (p.life / p.max) * 2);
  }
}

// ---------------------------------------------------------------- UI helpers: bubbles and pops
const bubbleEls = {};
const bubbleState = {};
function say(who, text, o = {}) {
  let el = bubbleEls[who];
  if (!el) { el = document.createElement('div'); bubbleEls[who] = el; $('bubbles').appendChild(el); }
  el.className = 'bb ' + who + (o.shout ? ' shout' : '');
  el.textContent = text;
  el.style.display = 'block';
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  bubbleState[who] = { t: o.dur || 2.4, target: o.target || defaultTarget(who), y: o.y ?? 0.45 };
  if (o.voice !== false) audio.say(text, who === 'by' ? 'kid' : who);
  if (who === 'baa' || who === 'kid') chatterT = rnd(6, 10);
}
function defaultTarget(who) { return who === 'kid' ? kid.head : gran.head; }
const _v = new THREE.Vector3();
function updateBubbles(dt) {
  const W = innerWidth, H = innerHeight;
  for (const who in bubbleState) {
    const b = bubbleState[who], el = bubbleEls[who];
    if (b.t <= 0) continue;
    b.t -= dt;
    if (b.t <= 0 || !b.target.parent) { el.style.display = 'none'; b.t = 0; continue; }
    b.target.getWorldPosition(_v); _v.y += b.y;
    _v.project(camera);
    if (_v.z > 1) { el.style.visibility = 'hidden'; continue; }
    el.style.visibility = 'visible';
    let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
    const bw = el.offsetWidth;
    x = clamp(x, bw / 2 + 8, W - bw / 2 - 8); y = clamp(y, 140, H - 20);
    if (who === 'kid') { x += bw * 0.35; y -= 6; } else if (who === 'baa') x -= bw * 0.3;
    x = clamp(x, bw / 2 + 8, W - bw / 2 - 8);
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
function flash(color = '#fff', a = 0.6) { const f = $('flash'); f.style.transition = 'none'; f.style.background = color; f.style.opacity = a; requestAnimationFrame(() => { f.style.transition = 'opacity .4s'; f.style.opacity = 0; }); }

// ---------------------------------------------------------------- city chunks
const chunks = new Map();
const bystanders = [];
function buildChunk(i) {
  const g = new THREE.Group(); g.position.z = -i * CH;
  const bm = MD.buildingMats(), sm = MD.signMats_(), boards = MD.boardMats_();
  for (const s of [-1, 1]) {
    let c = 0;
    while (c < CH - 3.5) {
      let w = pick([6, 8, 8, 10, 12]); if (c + w > CH) w = Math.round(CH - c);
      const h = 6 + 2 * Math.floor(rnd(0, i < 2 ? 4 : 8));
      const geo = MD.buildingGeo(8, h, w - 0.4);
      const b = new THREE.Mesh(geo, pick(bm)); b.position.set(s * 11.8, 0, -(c + w / 2)); g.add(b);
      if (Math.random() < 0.75) { // shop front
        const sw = Math.min(w - 1.2, 5);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw * 0.31), pick(sm));
        sign.position.set(s * 7.75, 3.35, -(c + w / 2)); sign.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(sign);
        const front = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.4, 2.2), MD.mat(pick([0x34495e, 0x5b3a29, 0x2f4f4f])));
        front.position.set(s * 7.76, 1.25, -(c + w / 2)); front.rotation.y = sign.rotation.y; g.add(front);
        const aw = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, w - 1.2), MD.mat(pick([0xe8222e, 0x2e9e4a, 0x2d6bd8, 0xf0a020, 0xff7ab8])));
        aw.position.set(s * 7.2, 2.6, -(c + w / 2)); aw.rotation.z = s * 0.25; g.add(aw);
      }
      c += w;
    }
    // sidewalk furniture
    const lamp = MD.makeLamp(); lamp.position.set(s * 4.6, 0.15, -6); if (s > 0) lamp.rotation.y = Math.PI; g.add(lamp);
    if ((i + (s > 0 ? 1 : 0)) % 2 === 0) { const pole = MD.makePole(); pole.position.set(s * 4.7, 0.15, -26); g.add(pole); }
    const r = Math.random();
    const pz = -rnd(10, 22);
    if (r < 0.3) { const v = MD.makeVending(); v.position.set(s * 7.1, 0.15, pz); v.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(v); }
    else if (r < 0.5) { const t = MD.makeTree(); t.position.set(s * 6.9, 0.15, pz); g.add(t); }
    else if (r < 0.62) { const t = MD.makePost(); t.position.set(s * 6.9, 0.15, pz); g.add(t); }
    else if (r < 0.85 && i > 0) { const b = MD.makeBoard(pick(boards)); b.position.set(s * 7.0, 0.15, pz - 4); b.rotation.y = s < 0 ? Math.PI / 3 : -Math.PI / 3; g.add(b); }
    if (Math.random() < 0.65) { // cheering neighbours
      const by = MD.makeBystander(); by.position.set(s * rnd(6.1, 7), 0.15, -rnd(28, 38)); by.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
      by.userData.ph = rnd(0, 6); g.add(by); bystanders.push(by);
    }
  }
  if (Math.random() < 0.3 && i > 1) { // crosswalk
    const cw = new THREE.Group();
    for (let k = 0; k < 7; k++) { const st = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3), MD.basic(0xf2f2f2)); st.rotation.x = -Math.PI / 2; st.position.set(-3.6 + k * 1.2, 0.012, 0); cw.add(st); }
    cw.position.z = -rnd(5, 30); g.add(cw);
  }
  scene.add(g); chunks.set(i, g);
}
function updateChunks(d) {
  const first = Math.floor(d / CH) - 1, last = Math.floor((d + 175) / CH);
  for (let i = Math.max(0, first); i <= last; i++) if (!chunks.has(i)) buildChunk(i);
  for (const [i, g] of chunks) if (i < first) {
    scene.remove(g); MD.disposeTree(g); chunks.delete(i);
    for (let k = bystanders.length - 1; k >= 0; k--) if (!bystanders[k].parent || bystanders[k].parent === g) bystanders.splice(k, 1);
  }
}
function clearChunks() { for (const [, g] of chunks) { scene.remove(g); MD.disposeTree(g); } chunks.clear(); bystanders.length = 0; }

// ---------------------------------------------------------------- game state
let state = 'title';
const P = {};
let ents = [];
let nextRowAt = 0, ev = {}, shake = 0, timeScale = 1, chatterT = 6, nearCd = 0, byCd = 0;
let police = null, grandpa = null, sale = null;
let best = { dist: 0, score: 0 };
try { best = JSON.parse(localStorage.getItem('baachan-best')) || best; } catch (e) { /* ignore */ }

function resetGame() {
  for (const e of ents) removeEnt(e);
  ents = [];
  if (police) { scene.remove(police.obj); police = null; }
  if (grandpa) { scene.remove(grandpa.obj); grandpa = null; }
  sale = null;
  Object.assign(P, {
    lane: 1, x: 0, y: 0, vy: 0, air: false, superJump: false, flip: 0, slide: 0, hp: 3, inv: 0, turbo: 0, magnet: 0, rival: 0, slow: 0,
    speed: 0, dist: 0, score: 0, ame: 0, bonus: 0, t: 0, phase: 0, teethT: 0, catT: 0, pigeonT: 0, eggs: false, pull: 0, endT: 0,
    kidOff: 0, kidVy: 0, kidSpin: 0, rampY: 0,
    st: { blast: 0, pigeon: 0, near: 0, jii: 0, cop: 0, cat: 0, sale: 0, ramp: 0 },
  });
  nextRowAt = 45;
  ev = { ramp: 520, sale: 330, police: 900, grandpa: 1450, cat: 240 };
  headCat.visible = false; headPigeon.visible = false; kid.eggs.visible = false; bigTeeth.visible = false;
  gran.root.rotation.set(0, 0, 0); gran.root.position.set(0, 0, 0);
  timeScale = 1; shake = 0;
  hideBubbles();
  clearChunks(); updateChunks(0);
  renderHud(true);
}

// ---------------------------------------------------------------- entities
function addEnt(type, obj, d, x, o = {}) {
  obj.position.set(x, o.y || 0, -d);
  scene.add(obj);
  const e = { type, obj, d, x, y: o.y || 0, w: o.w ?? 1, len: o.len ?? 1, hit: o.hit || null, vx: o.vx || 0, vd: o.vd || 0, t: 0, dead: false, passed: false, fly: null, ...o.extra };
  ents.push(e); return e;
}
function removeEnt(e) { scene.remove(e.obj); MD.disposeTree(e.obj); e.dead = true; }
const isHaz = (e) => !!e.hit;
function laneBlocked(lane, d) { return sale && sale.lane === lane && d > sale.d - 75 && d < sale.d + 4; }

function candyLine(lane, d, n = 5, gap = 2.6, y = 0.9) { for (let k = 0; k < n; k++) addEnt('candy', MD.makeCandy(), d + k * gap, LANES[lane], { y, extra: { by: y } }); }
function candyArc(lane, d, n = 6, gap = 1.8, h = 2.2) { for (let k = 0; k < n; k++) { const y = 0.9 + Math.sin((k + 0.5) / n * Math.PI) * h; addEnt('candy', MD.makeCandy(), d + k * gap, LANES[lane], { y, extra: { by: y } }); } }

function spawnRow(d) {
  const lv = clamp(P.dist / 2500, 0, 1);
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  const okLane = (l) => !laneBlocked(l, d);
  const r = Math.random();
  const free = [];
  if (r < 0.26) { // cones
    const n = Math.random() < 0.35 + lv * 0.4 ? 2 : 1;
    let k = 0;
    for (const l of lanes) { if (k < n && okLane(l)) { addEnt('cone', MD.makeCone(), d, LANES[l], { w: 0.7, len: 0.7, hit: 'low' }); k++; if (Math.random() < 0.4) candyArc(l, d - 5.4, 6, 1.8); } else free.push(l); }
  } else if (r < 0.42) { // barrier
    if (Math.random() < 0.35 + lv * 0.3 && P.dist > 150 && !sale) {
      addEnt('barrier', MD.makeBarrier(8.2), d, 0, { w: 8.2, len: 0.4, hit: 'high' });
      candyLine(1, d - 3, 3, 1.5, 0.5);
    } else {
      const l = lanes.find(okLane) ?? 1;
      addEnt('barrier', MD.makeBarrier(2.5), d, LANES[l], { w: 2.5, len: 0.4, hit: 'high' });
      for (const o of lanes) if (o !== l) free.push(o);
    }
  } else if (r < 0.58) { // kei trucks
    const n = Math.random() < 0.3 + lv * 0.3 ? 2 : 1;
    let k = 0;
    for (const l of lanes) {
      if (k < n && okLane(l)) { addEnt('truck', MD.makeTruck(pick([0xf4f4f4, 0xf4f4f4, 0x9fc5e8, 0xffe08a])), d + k * 6, LANES[l], { w: 1.75, len: 4.4, hit: 'truck', vd: Math.random() < 0.5 ? rnd(4, 8) : 0 }); k++; }
      else free.push(l);
    }
  } else if (r < 0.72) { // salarymen
    const n = Math.random() < 0.4 + lv * 0.3 ? 2 : 1;
    let k = 0;
    for (const l of lanes) {
      if (k < n && okLane(l)) {
        const walking = Math.random() < 0.5;
        const m = MD.makeSalaryman(); m.rotation.y = walking ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : Math.PI;
        addEnt('man', m, d + k * 3, LANES[l], { w: 0.6, len: 0.5, hit: 'man', vx: walking ? (m.rotation.y > 0 ? -1.1 : 1.1) : 0 });
        k++;
      } else free.push(l);
    }
  } else if (r < 0.82) { // pigeons (harmless)
    const l = lanes[0];
    const flock = [];
    for (let k = 0; k < 6; k++) { const pg = MD.makePigeon(); pg.rotation.y = rnd(0, 6.28); flock.push(addEnt('pigeon', pg, d + rnd(-1.5, 1.5), LANES[l] + rnd(-0.8, 0.8), { extra: { ph: rnd(0, 6) } })); }
    flock[0].leader = true; flock[0].flock = flock;
    if (okLane(lanes[1])) addEnt('cone', MD.makeCone(), d + 6, LANES[lanes[1]], { w: 0.7, len: 0.7, hit: 'low' });
    free.push(lanes[2]);
  } else { // breather: candy zigzag
    for (let k = 0; k < 9; k++) addEnt('candy', MD.makeCandy(), d + k * 2.4, LANES[[0, 1, 2, 1][k % 4]], { y: 0.9, extra: { by: 0.9 } });
  }
  if (free.length) {
    const l = pick(free);
    const it = Math.random();
    if (it < 0.07) addEnt('tea', MD.makeTea(), d, LANES[l], { y: 1.0 });
    else if (it < 0.12) addEnt('teeth', MD.makeDenturePickup(), d, LANES[l], { y: 1.0 });
    else if (it < 0.55) candyLine(l, d - 6, 4, 2.2);
  }
}

function spawnRamp(d) {
  const l = Math.floor(rnd(0, 3));
  addEnt('ramp', MD.makeRamp(), d, LANES[l], { w: 2.2, len: 5 });
  for (const o of [0, 1, 2]) if (o !== l) addEnt('truck', MD.makeTruck(0xffe08a), d - 1, LANES[o], { w: 1.75, len: 4.4, hit: 'truck' });
  candyLine(l, d - 14, 4, 2.4);
  for (let k = 0; k < 12; k++) { const y = 2 + Math.sin(k / 11 * Math.PI) * 7; addEnt('candy', MD.makeCandy(), d + 8 + k * 3.2, LANES[l], { y, extra: { by: y } }); }
  return d + 60;
}
function spawnSale(d) {
  const l = Math.floor(rnd(0, 3));
  for (const e of ents) if (isHaz(e) && Math.abs(e.x - LANES[l]) < 1.5 && e.d > d - 75 && e.d < d + 4) removeEnt(e);
  ents = ents.filter((e) => !e.dead);
  const gate = addEnt('sale', MD.makeSaleGate(), d, LANES[l], { w: 2.4, len: 0.6 });
  sale = { lane: l, d, ent: gate, pulled: false, done: false, nag: 0 };
}
function spawnCat(d) {
  const c = MD.makeCat(); const from = Math.random() < 0.5 ? -1 : 1;
  c.rotation.y = from < 0 ? -Math.PI / 2 : Math.PI / 2;
  addEnt('cat', c, d, from * 5.2, { extra: { dir: -from, walking: false } });
}

function spawnAhead() {
  const horizon = P.dist + 125;
  while (nextRowAt < horizon) {
    const d = nextRowAt;
    if (d >= ev.ramp) { nextRowAt = spawnRamp(d); ev.ramp = d + rnd(650, 900); continue; }
    if (d >= ev.sale && !sale) { spawnSale(d + 20); ev.sale = d + rnd(800, 1100); }
    if (d >= ev.cat) { spawnCat(d - 6); ev.cat = d + rnd(380, 600); }
    spawnRow(d);
    const sp = Math.max(P.speed, 16);
    nextRowAt += Math.max(13, sp * 0.95) + rnd(0, 9) - clamp(P.dist / 400, 0, 5);
  }
}

// ---------------------------------------------------------------- input
const keys = {};
function act(a) {
  if (state !== 'play') return;
  if (a === 'left') setLane(P.lane - 1);
  else if (a === 'right') setLane(P.lane + 1);
  else if (a === 'up') jump();
  else if (a === 'down') slide();
}
function setLane(l) {
  l = clamp(l, 0, 2);
  if (l === P.lane) { P.wobble = 0.3; return; }
  if (sale && sale.pulled && !sale.done && l !== sale.lane && Math.random() < 0.6) { // she resists
    say('baa', pick(['たまごーー！', 'そっちじゃない！特売じゃ！', '98円！98円！']), { dur: 1.2, voice: false });
    P.lane = l; P.pull = 0.55; return;
  }
  P.lane = l; audio.sfx('pop');
}
function jump() {
  if (P.air || P.endT) return;
  P.air = true; P.vy = 11.2; P.slide = 0;
  audio.sfx('jump'); P.teethT = 0.75;
  if (Math.random() < 0.25) say('baa', pick(L.jump), { dur: 1 });
  emit('puff', gran.root.position, { n: 5, speed: 1.5, life: 0.5, size: 0.7, up0: 0 });
}
function slide() {
  if (P.endT) return;
  if (P.air && !P.superJump) P.vy = -20;
  if (P.slide <= 0) { audio.sfx('slide'); if (Math.random() < 0.2) say('baa', pick(L.slide), { dur: 1 }); }
  P.slide = 0.8;
}
addEventListener('keydown', (e) => {
  if (keys[e.code]) return; keys[e.code] = true;
  const m = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', Space: 'up', ArrowDown: 'down', KeyS: 'down' }[e.code];
  if (m) { e.preventDefault(); act(m); }
  if ((e.code === 'Escape' || e.code === 'KeyP') && state === 'play') pause();
  if ((e.code === 'Enter' || e.code === 'Space') && (state === 'title' || state === 'over')) start();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
let tStart = null;
canvas.addEventListener('pointerdown', (e) => { tStart = { x: e.clientX, y: e.clientY, used: false }; audio.resume(); });
canvas.addEventListener('pointermove', (e) => {
  if (!tStart || tStart.used) return;
  const dx = e.clientX - tStart.x, dy = e.clientY - tStart.y, th = Math.min(40, innerWidth * 0.07);
  if (Math.abs(dx) > th && Math.abs(dx) > Math.abs(dy)) { act(dx < 0 ? 'left' : 'right'); tStart.used = true; }
  else if (Math.abs(dy) > th) { act(dy < 0 ? 'up' : 'down'); tStart.used = true; }
});
canvas.addEventListener('pointerup', (e) => {
  if (tStart && !tStart.used && state === 'play') { // tap: left/right third = lane, middle = jump
    const fx = e.clientX / innerWidth;
    act(fx < 0.3 ? 'left' : fx > 0.7 ? 'right' : 'up');
  }
  tStart = null;
});
canvas.addEventListener('pointercancel', () => { tStart = null; });

// ---------------------------------------------------------------- game events
function addScore(n, text, cls) { P.bonus += n; if (text) pop(text + (n ? `  +${n}` : ''), cls); }

function hurt(e) {
  if (P.inv > 0 || P.endT) return;
  if (P.turbo > 0) { blast(e); return; }
  P.hp--; P.inv = 2; P.slow = 1; shake = 0.6;
  audio.sfx('hit'); flash('#ff3355', 0.35);
  P.kidVy = 7.5; P.kidSpin = 1;
  emit('star', gran.head.getWorldPosition(new THREE.Vector3()), { n: 6, speed: 2.5, life: 0.8, size: 0.45, g: -4, follow: 0.9 });
  renderHud(); const ks = $('koshi').children[P.hp]; if (ks) ks.classList.add('ouch');
  if (P.eggs) { // the eggs from the sale
    P.eggs = false; kid.eggs.visible = false; audio.sfx('splat');
    emit('yolk', kid.root.getWorldPosition(new THREE.Vector3()), { n: 10, speed: 3, life: 1, size: 0.5, g: -9, follow: 0.7 });
    setTimeout(() => say('kid', 'たまごがーーー！', { dur: 1.6 }), 500);
  } else setTimeout(() => { if (state === 'play') say('kid', pick(L.kidHit), { dur: 1.3 }); }, 600);
  say('baa', P.hp <= 0 ? 'あ…腰が…' : pick(L.hit), { dur: 1.6 });
  if (e.type === 'man') { e.fly = { vy: 4, vx: rnd(-2, 2), spin: 4, t: 0, soft: true }; setTimeout(() => say('man', pick(L.manHit), { target: e.obj, y: 2, dur: 1.4 }), 200); }
  else if (e.type === 'cone') e.fly = { vy: 6, vx: rnd(-3, 3), spin: 8, t: 0, vd: P.speed * 0.5 };
  if (P.hp <= 0) endRun();
}
function blast(e) {
  if (e.fly) return;
  e.fly = { vy: rnd(10, 16), vx: rnd(-6, 6), spin: rnd(5, 10), t: 0, vd: P.speed * 1.2 };
  P.st.blast++; shake = 0.35; audio.sfx(e.type === 'man' ? 'fly' : 'boing');
  emit('puff', e.obj.position, { n: 8, speed: 3, life: 0.6, size: 1 });
  if (e.type === 'man') { say('man', pick(L.man), { target: e.obj, y: 2.2, dur: 2 }); e.kiran = true; addScore(150, 'サラリーマン 星になる', 'gold'); }
  else addScore(100, { cone: 'コーン ドーン！', truck: '軽トラ 吹っ飛んだ！', barrier: '工事中 突破！' }[e.type] || 'ドーン！');
}
function nearMiss() {
  if (nearCd > 0) return;
  nearCd = 1.4; P.st.near++;
  audio.sfx('near');
  addScore(30, 'ギリギリ！', 'small');
  if (Math.random() < 0.3) say('baa', pick(L.near), { dur: 1.2 });
}
function collect(e) {
  removeEnt(e);
  const pos = e.obj.position;
  if (e.type === 'candy') { P.ame++; audio.sfx('candy'); emit('candy', pos, { n: 1, speed: 0.5, life: 0.35, size: 0.4, grow: 1, follow: 1, vel: new THREE.Vector3(0, 2, 0) }); if (P.ame % 50 === 0) { say('baa', pick(L.amazing), { dur: 1.4 }); pop(`あめちゃん ${P.ame}個！`, 'gold'); } }
  else if (e.type === 'tea') {
    P.turbo = 6; audio.sfx('tea'); setTimeout(() => audio.sfx('turbo'), 350); flash('#9dff6a', 0.5);
    pop('お茶ターボ！', 'green'); say('baa', pick(L.turbo), { dur: 1.8, shout: true }); gran.pin2.visible = true;
    setTimeout(() => { if (state === 'play') say('kid', 'ばあちゃんの髪がプロペラに！？', { dur: 1.8 }); }, 1600);
  } else if (e.type === 'teeth') {
    P.magnet = 9; audio.sfx('chatter'); bigTeeth.visible = true;
    pop('入れ歯マグネット！', 'gold'); say('baa', pick(L.teeth), { dur: 1.6 });
  }
}

function superJump() {
  P.air = true; P.superJump = true; P.vy = 15.5; P.flip = 0; P.slide = 0; P.st.ramp++;
  timeScale = 0.55; audio.sfx('jump'); audio.sfx('scream');
  say('baa', '飛ぶでーーー！', { dur: 1.6, shout: true });
  setTimeout(() => { if (state === 'play') say('kid', 'ぎゃああああ！！', { dur: 1.8 }); }, 400);
  P.teethT = 1.6;
}
function landSuper() {
  P.superJump = false; timeScale = 1; shake = 0.7;
  audio.sfx('land'); emit('puff', gran.root.position, { n: 16, speed: 4, life: 0.9, size: 1.2, up0: 0, upMul: 0.3 });
  const sc = [pick([9.5, 10, 10]), 10, pick([9, 10, 8.5])];
  addScore(300, '着地 決まった！', 'gold');
  setTimeout(() => pop(`審査員　${sc.join('　')}`, 'small'), 400);
  setTimeout(() => { if (state === 'play') say('baa', pick(['10点満点じゃ！', 'オリンピック出よかの', 'まだまだ若いのう']), { dur: 1.6 }); }, 700);
}

// police chase ------------------------------------------------------------
function startPolice() {
  const o = MD.makePolice(); scene.add(o);
  police = { obj: o, d: P.dist - 30, x: P.x, t: 0, step: 0, gone: false, siren: 0, side: P.lane === 2 ? -1 : 1 };
  pop('パトカーが来た！', 'small');
}
function updatePolice(dt) {
  const c = police; c.t += dt; c.siren -= dt;
  if (c.siren <= 0 && !c.gone) { audio.sfx('siren'); c.siren = 2; }
  const lines = [
    [1.2, () => say('cop', 'そこの おばあちゃん！止まりなさい！', { target: c.obj, y: 2.2, dur: 2.2 })],
    [3.6, () => say('baa', pick(L.police || ['わしは歩行者じゃ！']), { dur: 1.8 })],
    [6.0, () => say('cop', '時速100キロの歩行者がいるかーー！', { target: c.obj, y: 2.2, dur: 2.4 })],
    [8.4, () => say('kid', 'ばあちゃん、捕まるって！', { dur: 1.6 })],
    [10.2, () => say('baa', '捕まえてみぃ！ほっほっほ', { dur: 1.8 })],
    [12.5, () => { c.gone = true; say('cop', 'ハトがーーー！前が見えん！', { target: c.obj, y: 2.2, dur: 2.2 }); audio.sfx('pigeon'); }],
  ];
  if (c.step < lines.length && c.t > lines[c.step][0]) { lines[c.step][1](); c.step++; }
  // drives alongside, one lane over, so the camera can see it
  let ln = P.lane + c.side; if (ln < 0 || ln > 2) { c.side *= -1; ln = P.lane + c.side; }
  const targetD = c.gone ? c.d + (P.speed * 0.25) * dt : P.dist + 1.5 + Math.sin(c.t * 0.8) * 1.5;
  if (c.gone) c.d = targetD; else { c.d += P.speed * dt; c.d += (targetD - c.d) * Math.min(1, dt * 0.8); }
  if (!c.gone) c.x += (LANES[ln] - c.x) * Math.min(1, dt * 2);
  c.obj.position.set(c.x, 0, -c.d);
  c.obj.rotation.y = c.gone ? Math.sin(c.t * 8) * 0.3 : 0;
  const blink = Math.floor(c.t * 6) % 2;
  c.obj.userData.lights[0].visible = !!blink; c.obj.userData.lights[1].visible = !blink;
  if (c.gone) {
    if (Math.random() < 0.5) emit('feather', c.obj.position.clone().add(new THREE.Vector3(0, 1.6, 0)), { n: 1, speed: 2, life: 1, size: 0.4, g: -1 });
    if (c.t > 13.2 && !c.bonus) { c.bonus = true; P.st.cop++; addScore(500, 'パトカーをまいた！', 'gold'); }
    if (P.dist - c.d > 60) { scene.remove(c.obj); MD.disposeTree(c.obj); police = null; }
  }
}
L.police = ['わしは歩行者じゃ！', '急いどるんじゃ！', '特売が終わってしまう！'];

// grandpa rival -----------------------------------------------------------
function startGrandpa() {
  const o = MD.makeGrandpa(); scene.add(o);
  const side = Math.random() < 0.5 ? -1 : 1;
  grandpa = { obj: o, d: P.dist - 18, x: side * 5.4, t: 0, phase: 'pass', said: 0, v: P.speed + 9 };
  audio.sfx('turbo');
}
function updateGrandpa(dt) {
  const g = grandpa; g.t += dt;
  if (g.phase === 'pass') {
    g.v = P.speed + 9; g.d += g.v * dt;
    if (!g.said && g.d > P.dist - 3) { g.said = 1; say('jii', 'ばあさんや、お先に〜！', { target: g.obj, y: 2.2, dur: 2 }); }
    if (g.said === 1 && g.d > P.dist + 6) { g.said = 2; say('baa', 'なんじゃと！？じいさんに負けるかい！', { dur: 2, shout: true }); P.rival = 5; audio.sfx('turbo'); pop('負けず嫌いモード！', 'small'); }
    if (g.d > P.dist + 22) { g.phase = 'lead'; g.t = 0; }
  } else if (g.phase === 'lead') {
    g.d += P.speed * dt;
    if (g.t > 1.6) { g.phase = 'stall'; g.t = 0; say('jii', 'あれ…バッテリー切れじゃ…', { target: g.obj, y: 2.2, dur: 2.4 }); audio.sfx('puff'); }
  } else if (g.phase === 'stall') {
    g.d += Math.max(0, 6 - g.t * 6) * dt;
    if (Math.random() < 0.4) emit('smoke', g.obj.position.clone().add(new THREE.Vector3(0, 0.8, 1.2)), { n: 1, speed: 0.8, life: 1.2, size: 0.8, grow: 1.5, upMul: 1.5 });
    if (P.dist > g.d + 1 && !g.passed) { g.passed = true; P.st.jii++; addScore(500, 'じいちゃん抜き！', 'gold'); say('baa', 'おさきに〜♪', { dur: 1.6 }); emit('note', gran.head.getWorldPosition(new THREE.Vector3()), { n: 4, speed: 1.5, life: 1, size: 0.5, follow: 1 }); }
    if (P.dist - g.d > 40) { scene.remove(g.obj); MD.disposeTree(g.obj); grandpa = null; return; }
  }
  g.obj.position.set(g.x, 0.15, -g.d);
  g.obj.userData.flame.visible = g.phase !== 'stall';
  g.obj.userData.flame.scale.y = 0.8 + Math.random() * 0.6;
}

// ---------------------------------------------------------------- update
const tmp = new THREE.Vector3();
function update(dt) {
  P.t += dt;
  // speed
  const base = Math.min(37, 15.5 + P.dist * 0.0055);
  let target = base * (P.turbo > 0 ? 1.55 : 1) * (P.rival > 0 ? 1.2 : 1) * (1 - P.slow * 0.55);
  if (P.t < 1.6) target *= P.t / 1.6;
  if (P.endT) target = 0;
  P.speed += (target - P.speed) * Math.min(1, dt * (P.endT ? 1.5 : 3));
  P.dist += P.speed * dt;
  for (const k of ['turbo', 'magnet', 'rival', 'inv', 'slide', 'teethT', 'catT', 'pigeonT', 'pull']) if (P[k] > 0) P[k] = Math.max(0, P[k] - dt);
  P.slow = Math.max(0, P.slow - dt * 0.7);
  nearCd -= dt; byCd -= dt;
  if (P.turbo <= 0) gran.pin2.visible = false;
  if (P.magnet <= 0) bigTeeth.visible = false;
  if (P.catT <= 0 && headCat.visible) { headCat.visible = false; say('kid', 'ねこ、帰っちゃった…', { dur: 1.4 }); }
  if (P.pigeonT <= 0) headPigeon.visible = false;

  // sale pull
  if (sale && !sale.done) {
    if (!sale.pulled && P.dist > sale.d - 55) {
      sale.pulled = true; setLane(sale.lane); P.lane = sale.lane; audio.sfx('sale');
      say('baa', '特売じゃーーーー！！', { dur: 2, shout: true }); pop('ばあちゃんが特売に吸い寄せられる！', 'small');
      setTimeout(() => { if (state === 'play') say('kid', 'ばあちゃん、目の色が変わった…', { dur: 1.8 }); }, 2200);
    }
    if (sale.pulled && P.lane !== sale.lane && P.pull <= 0) { P.lane += Math.sign(sale.lane - P.lane); P.pull = 0.9; }
    if (P.dist > sale.d + 1) {
      sale.done = true;
      if (Math.abs(P.x - LANES[sale.lane]) < 1.4) {
        P.eggs = true; kid.eggs.visible = true; P.st.sale++; audio.sfx('bonus');
        addScore(300, 'たまご ゲット！', 'gold'); say('baa', pick(['98円じゃ！ほっほっほ', 'おひとり様1パックまで！']), { dur: 1.8 });
        setTimeout(() => { if (state === 'play') say('kid', 'たまご割れたらどうするの…', { dur: 1.8 }); }, 2000);
      } else say('baa', 'あぁ…たまごが遠ざかる…', { dur: 1.8 });
    }
  }
  if (sale && sale.done && P.dist > sale.d + 20) sale = null;

  // lateral
  const tx = LANES[P.lane];
  P.x += (tx - P.x) * Math.min(1, dt * 13);
  // vertical
  let groundY = 0;
  for (const e of ents) if (e.type === 'ramp' && Math.abs(e.x - P.x) < 1.3) { const k = (P.dist - (e.d - 2.5)) / 5; if (k > 0 && k < 1) groundY = 1.4 * k; if (k >= 1 && k < 1.3 && !P.superJump && P.y < 1.8) superJump(); }
  if (P.air) {
    P.vy += (P.superJump ? -16 : -30) * dt;
    P.y += P.vy * dt;
    if (P.superJump) P.flip = Math.min(1, P.flip + dt / 1.9);
    if (P.y <= groundY && P.vy < 0) { P.y = groundY; P.air = false; P.vy = 0; if (P.superJump) landSuper(); else { audio.sfx('land'); emit('puff', gran.root.position, { n: 4, speed: 1.2, life: 0.4, size: 0.6, up0: 0 }); } }
  } else P.y = groundY;

  // kid bounce
  if (P.kidVy || P.kidOff > 0) { P.kidVy -= 22 * dt; P.kidOff += P.kidVy * dt; if (P.kidOff <= 0) { P.kidOff = 0; P.kidVy = 0; } }

  // spawn & world
  if (!P.endT) spawnAhead();
  updateChunks(P.dist);
  if (!P.endT) {
    if (!police && P.dist > ev.police) { startPolice(); ev.police = P.dist + rnd(1600, 2200); }
    if (!grandpa && P.dist > ev.grandpa) { startGrandpa(); ev.grandpa = P.dist + rnd(1700, 2300); }
  }
  if (police) updatePolice(dt);
  if (grandpa) updateGrandpa(dt);

  // entities
  for (const e of ents) {
    if (e.dead) continue;
    e.t += dt;
    if (e.fly) { // launched object
      const f = e.fly; f.t += dt; f.vy -= (f.soft ? 14 : 9) * dt;
      e.obj.position.y += f.vy * dt; e.obj.position.x += f.vx * dt; e.d += (f.vd || 0) * dt; e.obj.position.z = -e.d;
      e.obj.rotation.x += f.spin * dt; e.obj.rotation.z += f.spin * 0.6 * dt;
      if (f.soft && e.obj.position.y < 0) { e.obj.position.y = 0; f.vy = 0; f.vx = 0; f.spin = 0; e.obj.rotation.set(-Math.PI / 2, 0, 0); }
      if (e.kiran && f.t > 1.3) { e.kiran = false; emit('star', e.obj.position, { n: 1, speed: 0, life: 0.7, size: 2.5, grow: -0.5 }); audio.sfx('kiran'); removeEnt(e); }
      continue;
    }
    if (e.vd) e.d += e.vd * dt;
    if (e.vx) {
      e.x += e.vx * dt;
      if (Math.abs(e.x) > 3.4) { e.vx *= -1; e.obj.rotation.y *= -1; e.x = clamp(e.x, -3.4, 3.4); }
    }
    const dd = e.d - P.dist;
    e.obj.position.set(e.x, e.y, -e.d);
    switch (e.type) {
      case 'candy': {
        e.obj.rotation.y += dt * 3; e.obj.position.y = e.y + Math.sin(e.t * 4 + e.d) * 0.1;
        if (P.magnet > 0 && dd < 14 && dd > -2) { e.x += (P.x - e.x) * Math.min(1, dt * 7); e.y += (P.y + 1 - e.y) * Math.min(1, dt * 7); e.d += (P.dist - e.d) * Math.min(1, dt * 5); }
        break;
      }
      case 'tea': case 'teeth': e.obj.rotation.y += dt * 2.5; e.obj.position.y = e.y + Math.sin(e.t * 3) * 0.15; break;
      case 'man': {
        const u = e.obj.userData; const sw = e.vx ? Math.sin(e.t * 8) * 0.6 : 0;
        u.legs[0].rotation.x = sw; u.legs[1].rotation.x = -sw;
        if (dd < 12 && dd > 0 && !e.noticed) { e.noticed = true; if (Math.random() < 0.3) say('man', pick(['え？ばあちゃん！？', 'うわっ！', '…（スマホに夢中）']), { target: e.obj, y: 2.1, dur: 1.2, voice: false }); }
        break;
      }
      case 'barrier': e.obj.userData.lamp.visible = Math.floor(e.t * 4) % 2 === 0; break;
      case 'pigeon': {
        if (dd < 12 && !e.flying) { e.flying = true; e.fv = new THREE.Vector3(rnd(-3, 3), rnd(4, 7), rnd(-4, 2)); }
        const w = e.obj.userData.wings;
        if (e.flying) {
          e.y += e.fv.y * dt; e.x += e.fv.x * dt; e.d += e.fv.z * dt; e.obj.position.set(e.x, e.y, -e.d);
          const a = Math.sin(e.t * 30) * 0.9; w[0].rotation.z = a; w[1].rotation.z = -a;
          if (e.leader && !e.honked && Math.abs(dd) < 1.5 && Math.abs(P.x - e.x) < 2) {
            e.honked = true; P.st.pigeon++; audio.sfx('pigeon');
            emit('feather', gran.head.getWorldPosition(tmp), { n: 14, speed: 3, life: 1.4, size: 0.4, g: -1.5, follow: 0.6 });
            addScore(50, 'ポッポー！', 'small');
            if (Math.random() < 0.4 && !headPigeon.visible) { headPigeon.visible = true; P.pigeonT = 12; setTimeout(() => { if (state === 'play') say('kid', 'ばあちゃん、頭にハトが…', { dur: 1.8 }); }, 900); pop('ハトが住みついた', 'small'); }
            else say('baa', pick(L.pigeon), { dur: 1.3 });
          }
        } else { e.obj.rotation.x = Math.sin(e.t * 6 + e.ph) > 0.6 ? 0.5 : 0; }
        break;
      }
      case 'cat': {
        if (!e.walking && dd < 38) e.walking = true;
        if (e.walking) { e.x += e.dir * 2.0 * dt; e.obj.userData.tail.rotation.z = Math.sin(e.t * 5) * 0.4; }
        if (Math.abs(dd) < 1 && Math.abs(P.x - e.x) < 1.3 && !headCat.visible && !P.endT) {
          headCat.visible = true; P.catT = 18; P.st.cat++; audio.sfx('meow'); removeEnt(e);
          addScore(100, 'ねこが のった！', 'gold'); say('baa', 'あら〜ねこちゃん♡', { dur: 1.6 });
          emit('heart', kid.head.getWorldPosition(tmp), { n: 5, speed: 1, life: 1, size: 0.4, follow: 1 });
          setTimeout(() => { if (state === 'play') say('kid', 'ねこが顔に乗ってて前が見えない…', { dur: 2 }); }, 1800);
          continue;
        }
        if (Math.abs(e.x) > 7) { removeEnt(e); continue; }
        break;
      }
      case 'sale': e.obj.children.forEach((c, i) => { if (i > 2) c.rotation.z = Math.sin(e.t * 6 + i) * 0.3; }); break;
    }
    // collisions
    if (P.endT) continue;
    if (e.type === 'candy' || e.type === 'tea' || e.type === 'teeth') {
      if (Math.abs(dd) < 0.9 && Math.abs(e.x - P.x) < 1.0 && Math.abs(e.y - (P.y + 0.9)) < 1.3) { collect(e); continue; }
    } else if (e.hit) {
      const ox = Math.abs(e.x - P.x) < e.w / 2 + 0.3, od = Math.abs(dd) < e.len / 2 + 0.35;
      if (ox && od) {
        const tall = { low: P.y < 0.7, high: P.slide <= 0, man: P.y < 1.45, truck: P.y < 2.1 }[e.hit];
        if (tall) { e.wasHit = true; hurt(e); }
      }
      if (!e.passed && dd < -e.len / 2 - 0.5) {
        e.passed = true;
        if (!e.wasHit && P.speed > 18 && Math.abs(e.x - P.x) < e.w / 2 + 1.6 && Math.abs(e.x - P.x) > e.w / 2 + 0.25 && P.y < 1) nearMiss();
      }
    }
    // don't let the chase camera drive through things granny already passed
    if ((e.hit && dd < -1.2 && Math.abs(e.x - P.x * 0.55) < e.w / 2 + 0.9) || ((e.type === 'candy' || e.type === 'tea' || e.type === 'teeth' || e.type === 'pigeon') && dd < -0.8)) e.obj.visible = false;
    if (dd < -14 || dd > 400) removeEnt(e);
  }
  ents = ents.filter((e) => !e.dead);

  // chatter
  chatterT -= dt;
  if (chatterT <= 0 && !P.endT) {
    if (Math.random() < 0.65) say('baa', pick(L.idle), { dur: 2.2 });
    else say('kid', pick(L.kid), { dur: 2 });
  }
  // neighbours cheer
  for (const by of bystanders) {
    const u = by.userData, a = Math.sin(P.t * 12 + u.ph) * 0.6;
    u.arms[0].rotation.z = -2.4 + a; u.arms[1].rotation.z = 2.4 - a;
    const bd = -by.parent.position.z - by.position.z;
    if (byCd <= 0 && !(bubbleState.baa && bubbleState.baa.t > 0) && Math.abs(bd - P.dist - 6) < 1 && Math.random() < 0.5) { byCd = rnd(4, 8); say('by', pick(L.by), { target: by, y: 1.9, dur: 1.4, voice: false }); }
  }

  // score
  P.score = Math.floor(P.dist) + P.ame * 10 + P.bonus;
  audio.setTempo(clamp(0.9 + P.speed / 60, 1, 1.6));

  // turbo fx
  if (P.turbo > 0 && Math.random() < 0.6) emit('puff', gran.head.getWorldPosition(tmp).add(new THREE.Vector3(0, 0.4, 0.3)), { n: 1, speed: 1, life: 0.6, size: 0.4, grow: 1.5, upMul: 2, follow: 0.6 });
  if (P.magnet > 0 && Math.random() < 0.05) audio.sfx('chatter');
  if (P.speed > 30 && Math.random() < 0.08 && P.y < 0.1) emit('leaf', new THREE.Vector3(P.x + rnd(-2, 2), 0.3, -P.dist + 1), { n: 1, speed: 2, life: 0.8, size: 0.3, g: -2 });

  // ending
  if (P.endT) {
    P.endT += dt;
    if (P.endT > 3.2 && state === 'play') showResult();
  }
}

// ---------------------------------------------------------------- granny pose
function poseGranny(dt) {
  const R = gran.root;
  R.position.set(P.x, P.y + (P.y > 0 ? 0 : 0.0), -P.dist);
  const spd = P.speed;
  const run = clamp(spd / 18, 0, 1);
  P.phase += dt * (6 + spd * 0.55);
  const ph = P.phase;
  const sl = P.slide > 0 ? 1 : 0;
  P.slideK = (P.slideK || 0) + (sl - (P.slideK || 0)) * Math.min(1, dt * 14);
  const k = P.slideK;
  const sitting = P.endT > 1.2 && state === 'play';
  // legs
  gran.legs.forEach((l, i) => {
    const s = i ? -1 : 1;
    let th = Math.sin(ph + (i ? Math.PI : 0)) * 1.15 * run;
    let kn = -Math.max(0, Math.sin(ph + (i ? Math.PI : 0) + 1.2)) * 1.6 * run - 0.15;
    if (P.air) { th = P.superJump ? 0.4 + Math.sin(P.t * 30 + i * 3) * 0.9 : 1.1 - i * 0.5; kn = P.superJump ? -0.6 : -1.7 + i * 0.6; }
    if (k > 0.01) { th = th * (1 - k) + 1.5 * k; kn = kn * (1 - k) - 2.2 * k; }
    if (sitting) { th = 1.5; kn = -0.1; }
    l.thigh.rotation.x = th; l.knee.rotation.x = kn;
    void s;
  });
  gran.hips.position.y = (sitting ? 0.42 : 0.78 + Math.abs(Math.sin(ph)) * 0.08 * run) * (1 - k) + 0.46 * k;
  gran.hips.rotation.y = Math.sin(ph) * 0.18 * run;
  gran.torso.rotation.x = -0.85 * (1 - k) - 1.45 * k + (sitting ? 0.35 : 0) - (P.speed > 28 ? 0.15 : 0);
  gran.torso.rotation.z = Math.sin(ph) * 0.06 * run;
  // arms: pump or flail
  gran.arms.forEach((a, i) => {
    let sx = -Math.sin(ph + (i ? Math.PI : 0)) * 1.3 * run, ex = -1.3;
    if (P.air) { sx = P.superJump ? -2.8 + Math.sin(P.t * 25 + i) * 0.6 : -2.2; ex = -0.4; }
    if (sitting) { sx = -0.4; ex = -1.6; }
    a.sh.rotation.x = sx; a.el.rotation.x = ex; a.sh.rotation.z = a.s * (P.air ? 0.6 : 0.15);
  });
  gran.head.rotation.x = 0.95 * (1 - k) + 1.5 * k - (sitting ? 0.3 : 0);
  // bun propeller
  gran.bun.rotation.y += dt * (P.turbo > 0 ? 40 : 0);
  if (P.turbo <= 0) gran.bun.rotation.y *= 0.9;
  // dentures pop out while jumping
  if (P.teethT > 0) {
    const q = Math.sin((1 - P.teethT / (P.superJump ? 1.6 : 0.75)) * Math.PI);
    gran.teeth.position.set(teethBase.x, teethBase.y + q * 0.35, teethBase.z - q * 0.45);
    gran.teeth.rotation.x = q * 3; gran.teeth.scale.setScalar(0.45 + q * 0.6);
  } else { gran.teeth.position.copy(teethBase); gran.teeth.rotation.x = 0; gran.teeth.scale.setScalar(0.45); }
  gran.mouth.scale.y = P.air || P.turbo > 0 ? 3 : 1;
  // flip on super jump
  R.rotation.x = P.superJump ? -P.flip * Math.PI * 2 : 0;
  R.rotation.z = (LANES[P.lane] - P.x) * -0.08;
  // blink when invulnerable
  R.visible = !(P.inv > 0 && P.inv < 1.9 && Math.floor(P.inv * 12) % 2 === 0) || state !== 'play';
  gran.shadow.position.y = -P.y + 0.03; gran.shadow.scale.setScalar(Math.max(0.3, 1 - P.y * 0.12));
  // kid on the back
  kid.root.position.set(0, (1.25 + Math.abs(Math.sin(ph)) * 0.07 * run) * (1 - k) + 0.86 * k + P.kidOff, 0.02 + 0.28 * k);
  kid.root.rotation.x = -0.25 - 0.9 * k + (P.kidOff > 0 ? P.kidOff * 1.4 : 0);
  const scared = P.speed > 26 || P.air || P.kidOff > 0;
  kid.arms.forEach((a, i) => {
    a.rotation.z = (i ? 1 : -1) * (scared ? 2.6 + Math.sin(P.t * 22 + i) * 0.4 : 0.5);
    a.rotation.x = scared ? 0 : -1.0;
  });
  kid.mouth.scale.y = scared ? 2.2 : 1;
  if (bigTeeth.visible) { bigTeeth.rotation.y = P.t * 4; bigTeeth.children.forEach((c, i) => { c.position.y = (i === 0 ? 0.03 : -0.03) * (1 + Math.abs(Math.sin(P.t * 20)) * 3); }); }
  if (headCat.visible) headCat.userData.tail.rotation.z = Math.sin(P.t * 6) * 0.6;
  if (headPigeon.visible) { const w = headPigeon.userData.wings, a = Math.sin(P.t * 25) * 0.5; w[0].rotation.z = a; w[1].rotation.z = -a; }
}

// ---------------------------------------------------------------- camera & fx
const camPos = new THREE.Vector3(0, 3.4, 7), camLook = new THREE.Vector3();
function updateCamera(dt, real) {
  let pos, look;
  if (state === 'title') {
    const a = performance.now() / 4000;
    pos = tmp.set(Math.sin(a) * 4.5, 1.9, -P.dist + Math.cos(a) * 4.5 + 0.5);
    look = new THREE.Vector3(0, 1.2, -P.dist);
    camera.fov = 52;
  } else if (P.endT > 1.0) {
    pos = tmp.set(P.x + 2.6, 1.7, -P.dist - 4.2);
    look = new THREE.Vector3(P.x, 1.0, -P.dist);
    camera.fov += (55 - camera.fov) * Math.min(1, real * 2);
  } else {
    const sj = P.superJump ? 1 : 0;
    pos = tmp.set(P.x * 0.55 + sj * 3, 3.2 + P.y * 0.55 + sj * 1.5, -P.dist + 6.4 + sj * 3);
    look = new THREE.Vector3(P.x * 0.7, 1.2 + P.y * 0.6, -P.dist - 7);
    const f = 60 + clamp((P.speed - 15) * 0.55, 0, 14) + (P.turbo > 0 ? 8 : 0);
    camera.fov += (f - camera.fov) * Math.min(1, real * 3);
  }
  camPos.lerp(pos, Math.min(1, real * (state === 'title' ? 2 : 7)));
  camLook.lerp(look, Math.min(1, real * 9));
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += rnd(-1, 1) * shake * 0.4; camera.position.y += rnd(-1, 1) * shake * 0.3; shake = Math.max(0, shake - real * 1.6); }
  camera.lookAt(camLook);
  camera.updateProjectionMatrix();
  // sky follows
  sky.position.copy(camera.position);
  sunDisc.position.set(camera.position.x + 60, 70, camera.position.z - 300); sunDisc.lookAt(camera.position);
  for (const c of clouds) { c.position.set(camera.position.x + c.userData.off.x, c.userData.off.y, camera.position.z + c.userData.off.z); c.userData.off.x += real * 1.5; if (c.userData.off.x > 160) c.userData.off.x = -160; }
  ground.position.z = -Math.floor(P.dist / 24) * 24 - GL / 2 + 60;
}

const fx = $('fx'), fg = fx.getContext('2d');
function drawSpeedLines() {
  const W = fx.width, H = fx.height;
  fg.clearRect(0, 0, W, H);
  if (state !== 'play') return;
  const it = clamp((P.speed - 24) / 14, 0, 1) + (P.turbo > 0 ? 0.6 : 0) + (P.superJump ? 0.4 : 0);
  if (it <= 0.02) return;
  const cx = W / 2, cy = H * 0.42, R = Math.hypot(W, H) * 0.55;
  const n = Math.floor(30 * it);
  fg.strokeStyle = P.turbo > 0 ? 'rgba(170,255,120,0.55)' : 'rgba(255,255,255,0.5)';
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r0 = R * rnd(0.55, 0.85), r1 = r0 + R * rnd(0.15, 0.4);
    fg.lineWidth = rnd(1, 3.5);
    fg.beginPath(); fg.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); fg.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); fg.stroke();
  }
}

// ---------------------------------------------------------------- HUD
let hudCache = {};
function renderHud(force) {
  const set = (id, v) => { if (force || hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
  set('dist', Math.floor(P.dist));
  set('kmh', Math.round(P.speed * 3.6));
  set('ame', P.ame);
  set('score', P.score);
  if (force || hudCache.hp !== P.hp) {
    hudCache.hp = P.hp;
    $('koshi').innerHTML = [0, 1, 2].map((i) => `<i class="${i < P.hp ? '' : 'lost'}">腰</i>`).join('');
  }
  const pw = [];
  if (P.turbo > 0) pw.push(`<div>🍵 お茶ターボ<i style="width:${P.turbo / 6 * 100}%"></i></div>`);
  if (P.magnet > 0) pw.push(`<div>🦷 入れ歯マグネット<i style="width:${P.magnet / 9 * 100}%"></i></div>`);
  if (P.rival > 0) pw.push(`<div>🔥 負けず嫌いモード<i style="width:${P.rival / 5 * 100}%"></i></div>`);
  const h = pw.join('');
  if (force || hudCache.pw !== h) { hudCache.pw = h; $('pw').innerHTML = h; }
}

// ---------------------------------------------------------------- flow
function show(id, on) { $(id).classList.toggle('on', on); }
function start() {
  audio.init(); audio.startMusic();
  resetGame();
  state = 'play';
  show('title', false); show('over', false); show('pause', false); show('hud', true);
  say('baa', pick(L.start), { dur: 2.2 });
  setTimeout(() => { if (state === 'play') say('kid', 'え、ちょっと待って…', { dur: 1.6 }); }, 1500);
  pop('よーい…ドン！');
  show('howto', true); setTimeout(() => show('howto', false), 4200);
}
function endRun() {
  P.endT = 0.001; P.turbo = 0; P.magnet = 0; P.rival = 0;
  audio.sfx('over');
  setTimeout(() => { if (state === 'play') say('baa', pick(L.over), { dur: 3 }); }, 1300);
}
const TITLES = [[200, '近所のお散歩ばあちゃん'], [500, '商店街のうわさ'], [900, '町内会の韋駄天'], [1500, '市内最速ばあちゃん'], [2200, '伝説の暴走ばあちゃん'], [3200, '音速の老婆'], [4500, '光速ばあちゃん'], [1e9, '宇宙ばあちゃん']];
function showResult() {
  state = 'over';
  const d = Math.floor(P.dist);
  const isBest = d > best.dist;
  if (isBest) best.dist = d;
  best.score = Math.max(best.score, P.score);
  try { localStorage.setItem('baachan-best', JSON.stringify(best)); } catch (e) { /* ignore */ }
  $('r-quote').textContent = '「' + pick(['腰が痛いけど、楽しかったのう', 'また明日も走ろうかね', '次は特売に間に合わせるよ', 'あめちゃん、ポケットに入れときや']) + '」';
  $('r-title').textContent = TITLES.find((t) => d < t[0])[1];
  $('r-dist').textContent = d;
  $('r-new').classList.toggle('on', isBest && d > 50);
  const S = P.st;
  const rows = [['🍬 あめちゃん', P.ame + '個'], ['💥 吹っ飛ばしたもの', S.blast], ['🕊️ 驚かせたハト', S.pigeon + '群れ'], ['😱 ギリギリ回避', S.near + '回'], ['🛵 じいちゃん抜き', S.jii + '回'], ['🚓 パトカーをまいた', S.cop + '回'], ['🐈 のせた猫', S.cat + '匹'], ['🥚 特売たまご', S.sale + 'パック'], ['🛫 大ジャンプ', S.ramp + '回']];
  $('r-stats').innerHTML = rows.map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join('');
  $('r-score').textContent = P.score;
  show('over', true); show('hud', false); hideBubbles();
  renderBest();
}
function renderBest() { $('best').textContent = best.dist ? `ベスト ${best.dist}m ／ ${best.score}点` : ''; }
function pause() { if (state !== 'play') return; state = 'pause'; show('pause', true); audio.hush(); audio.stopMusic(); }
function resume() { if (state !== 'pause') return; state = 'play'; show('pause', false); audio.startMusic(); last = performance.now(); }
function toTitle() {
  state = 'title'; show('pause', false); show('over', false); show('hud', false); show('title', true); audio.stopMusic(); audio.hush();
  resetGame(); renderBest();
}

$('btn-start').onclick = start;
$('btn-retry').onclick = start;
$('btn-home').onclick = toTitle;
$('btn-pause').onclick = pause;
$('btn-resume').onclick = resume;
$('btn-quit').onclick = toTitle;
function initToggle(id, key, getter, setter) {
  let on = true; try { on = localStorage.getItem(key) !== '0'; } catch (e) { /* ignore */ }
  setter(on); $(id).classList.toggle('on', on);
  $(id).onclick = () => { on = !getter(); setter(on); $(id).classList.toggle('on', on); try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) { /* ignore */ } if (on) { audio.init(); audio.say('はいよ', 'baa'); } };
}
initToggle('btn-sound', 'baachan-sound', () => audio.sound, (v) => audio.setSound(v));
initToggle('btn-voice', 'baachan-voice', () => audio.voice, (v) => audio.setVoice(v));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};

// ---------------------------------------------------------------- resize & loop
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  fx.width = Math.floor(w); fx.height = Math.floor(h);
}
addEventListener('resize', resize); resize();

let last = performance.now();
let titleT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  const dt = real * timeScale;
  if (state === 'play') {
    update(dt);
    poseGranny(dt);
    renderHud();
  } else if (state === 'title') {
    titleT += real;
    // radio-exercise idle on the title screen
    P.speed = 0; poseGranny(real);
    const a = Math.sin(titleT * 3);
    gran.arms.forEach((arm, i) => { arm.sh.rotation.x = -2.6 + a * 0.3; arm.sh.rotation.z = (i ? 1 : -1) * (0.6 + a * 0.5); });
    gran.hips.position.y = 0.74 + Math.abs(a) * 0.05;
    kid.arms.forEach((arm, i) => { arm.rotation.z = (i ? 1 : -1) * (2.4 + Math.sin(titleT * 6 + i) * 0.3); });
    bystanders.forEach((by) => { const u = by.userData, b = Math.sin(titleT * 10 + u.ph) * 0.5; u.arms[0].rotation.z = -2.4 + b; u.arms[1].rotation.z = 2.4 - b; });
  }
  if (state !== 'pause') { updateParts(dt); updateBubbles(real); }
  updateCamera(dt, real);
  drawSpeedLines();
  renderer.render(scene, camera);
}
resetGame(); renderBest();
requestAnimationFrame(frame);
window.__baa = { P, get state() { return state; }, ents: () => ents, start, act, ev: () => ev }; // for automated tests
