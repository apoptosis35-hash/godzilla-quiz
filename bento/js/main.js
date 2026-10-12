import { WORLD, TIERS, RULES, MAX_TIER, rankFor, comboMultiplier } from './config.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { FX } from './fx.js';
import { Sound, Haptics } from './audio.js';
import { Sprites, renderSprite, EXPRESSIONS } from './chars.js';
import { store } from './save.js';

const $ = (id) => document.getElementById(id);
const data = store.load();
const S = data.settings;

const sound = new Sound();
const haptics = new Haptics();
const game = new Game();
const fx = new FX();
const renderer = new Renderer($('cv'));

let mode = 'title';          // title | play | over
let paused = false;
let alpha = 0;
let shownScore = 0;
let lastWarn = 0;
let feverOn = false;
let feverLevel = 0;
let retryArmedUntil = 0;
let lastSave = 0;
let firstKingShown = false;
let newDiscoveries = [];
let bestAtStart = 0;
let bestShown = false;
const DPR = () => Math.min(window.devicePixelRatio || 1, 2.5);

window.__obento = { game, store, fx, renderer, sound }; // handy for debugging / automated tests

// ---------------------------------------------------------------- settings
function applySettings() {
  sound.setSe(S.se);
  sound.setBgm(S.bgm);
  haptics.on = S.vib;
  fx.shakeOn = S.shake;
  fx.intensity = S.fx === 'low' ? 0.55 : 1;
  $('set-bgm').checked = S.bgm; $('set-se').checked = S.se; $('set-vib').checked = S.vib;
  $('set-shake').checked = S.shake; $('set-fx').checked = S.fx === 'low';
}
for (const [id, key] of [['set-bgm', 'bgm'], ['set-se', 'se'], ['set-vib', 'vib'], ['set-shake', 'shake']]) {
  $(id).addEventListener('change', (e) => { S[key] = e.target.checked; store.save(); sound.unlock(); applySettings(); sound.click(); if (key === 'vib' && S.vib) haptics.pulse(20); });
}
$('set-fx').addEventListener('change', (e) => { S.fx = e.target.checked ? 'low' : 'normal'; store.save(); applySettings(); sound.click(); });
applySettings();

// ---------------------------------------------------------------- screens
const modals = ['s-zukan', 's-settings', 's-confirm'];
function show(id, on = true) { $(id).classList.toggle('show', on); }
function openModal(id) {
  sound.unlock(); sound.click();
  if (id === 's-zukan') buildZukan();
  if (id === 's-settings') buildStats();
  show(id);
  if (mode === 'play') paused = true;
}
function closeModal(id) {
  show(id, false);
  if (!modals.some((m) => $(m).classList.contains('show')) && mode === 'play') { paused = false; resetClock(); }
}
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { sound.click(); closeModal(b.closest('.screen').id); }));
for (const id of modals) $(id).addEventListener('pointerdown', (e) => { if (e.target.id === id && id !== 's-confirm') closeModal(id); });

let confirmCb = null;
function confirmBox(msg, cb) { $('c-msg').textContent = msg; confirmCb = cb; openModal('s-confirm'); }
$('c-yes').addEventListener('click', () => { closeModal('s-confirm'); if (confirmCb) confirmCb(); confirmCb = null; });
$('c-no').addEventListener('click', () => { closeModal('s-confirm'); confirmCb = null; });

function toTitle() {
  if (mode === 'play' && !game.over) store.saveResume(game.snapshot());
  mode = 'title'; paused = false;
  for (const m of [...modals, 's-over']) show(m, false);
  show('s-title');
  updateTitle();
  sound.click();
}

function updateTitle() {
  const d = store.data;
  $('title-rec').innerHTML = d.plays ? `ハイスコア <b>${d.best.toLocaleString()}</b>　最大れんさ <b>${d.maxCombo}</b>` : 'はじめまして！';
  $('t-resume').hidden = !store.loadResume();
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  $('install-tip').hidden = !!standalone || !/iPhone|iPad|iPod/.test(navigator.userAgent);
}

// ---------------------------------------------------------------- game flow
function startGame(snapshot) {
  sound.unlock();
  game.reset();
  if (snapshot) game.restore(snapshot);
  store.clearResume();
  fx.clear();
  mode = 'play'; paused = false;
  feverOn = false; feverLevel = 0; renderer.fever = 0;
  firstKingShown = game.highestTier >= MAX_TIER;
  newDiscoveries = [];
  bestAtStart = store.data.best; bestShown = false;
  shownScore = game.score;
  retryArmedUntil = 0;
  renderer.heldShowAt = performance.now();
  renderer.aimX = WORLD.W / 2;
  for (const m of [...modals, 's-over', 's-title']) show(m, false);
  $('banners').innerHTML = '';
  $('fever-frame').classList.remove('on');
  setCombo(0);
  $('hint').classList.toggle('off', !!store.data.tutorialDone);
  drawNext();
  drawEvo();
  updateHud(true);
  resetClock();
}

$('t-play').addEventListener('click', () => { sound.unlock(); sound.click(); startGame(); });
$('t-resume').addEventListener('click', () => { const s = store.loadResume(); sound.unlock(); sound.click(); startGame(s); });
$('t-zukan').addEventListener('click', () => openModal('s-zukan'));
$('t-settings').addEventListener('click', () => openModal('s-settings'));
$('b-zukan').addEventListener('click', () => openModal('s-zukan'));
$('b-settings').addEventListener('click', () => openModal('s-settings'));
$('o-retry').addEventListener('click', () => { sound.click(); startGame(); });
$('o-title').addEventListener('click', () => toTitle());
$('o-zukan').addEventListener('click', () => openModal('s-zukan'));
$('set-title').addEventListener('click', () => { closeModal('s-settings'); toTitle(); });
$('set-reset').addEventListener('click', () => confirmBox('ハイスコアと図鑑の記録をすべて消します。よろしいですか？', () => { store.reset(); buildStats(); drawEvo(); updateTitle(); }));

// one-tap retry; if a game with real progress is running, a second tap within 2s confirms
$('b-retry').addEventListener('click', () => {
  sound.unlock();
  const now = performance.now();
  if (mode !== 'play') return;
  if (game.over || game.score < 300 || now < retryArmedUntil) { sound.click(); startGame(); return; }
  retryArmedUntil = now + 2000;
  $('b-retry').classList.add('armed'); $('retry-lbl').textContent = 'もう一度タップ';
  sound.click();
});

function onGameOver(e) {
  const d = store.data;
  const isBest = e.score > d.best;
  d.plays++;
  d.totalMerges += e.merges;
  d.kings += game.kings;
  if (isBest) d.best = e.score;
  if (e.maxCombo > d.maxCombo) d.maxCombo = e.maxCombo;
  if (e.highestTier > d.bestTier) d.bestTier = e.highestTier;
  d.recent = [e.score, ...d.recent].slice(0, 10);
  store.save();
  store.clearResume();
  renderer.overAt = performance.now();
  sound.gameover();
  haptics.pulse(40);
  feverOn = false; $('fever-frame').classList.remove('on'); sound.fever = false;
  setTimeout(() => showResult(e, isBest), 1100);
}

function showResult(e, isBest) {
  if (mode !== 'play') return;
  mode = 'over';
  $('r-head').textContent = isBest ? 'すごい！' : 'おしまい！';
  $('r-new').hidden = !isBest;
  $('r-score').textContent = '0';
  $('r-rank').textContent = `称号：${rankFor(e.score)}`;
  $('r-best').textContent = store.data.best.toLocaleString();
  $('r-combo').textContent = e.maxCombo;
  $('r-merges').textContent = e.merges;
  $('r-top').textContent = TIERS[e.highestTier].name;
  paintSprite($('r-top-cv'), e.highestTier, 'happy');
  $('r-disc').hidden = !newDiscoveries.length;
  $('r-disc').textContent = newDiscoveries.length ? `新しく見つけたおかず：${newDiscoveries.map((t) => TIERS[t].name).join('、')}` : '';
  show('s-over');
  // count-up
  const t0 = performance.now(), dur = 700;
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / dur), v = Math.round(e.score * (1 - Math.pow(1 - k, 3)));
    $('r-score').textContent = v.toLocaleString();
    if (k < 1) requestAnimationFrame(tick);
    else if (isBest) { sound.highscore(); fx.confetti(WORLD.W / 2, WORLD.TOP, WORLD.W, 70); }
  };
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- game events
const COMBO_WORDS = { 3: 'ナイス！', 4: 'すごい！', 6: 'とまらない！', 7: 'おみごと！', 8: 'さいこう！', 9: 'かみわざ！', 10: 'でんせつ級！' };

game.on('drop', ({ tier }) => {
  sound.drop(tier);
  haptics.pulse(8);
  renderer.dropAnim = performance.now();
  if (!store.data.tutorialDone) { store.data.tutorialDone = true; store.save(); $('hint').classList.add('off'); }
  noteBorn(tier);
  drawNext(true);
});

game.on('ready', () => { renderer.heldShowAt = performance.now(); });

game.on('impact', ({ a, b, speed }) => {
  const now = performance.now();
  let tier = 0;
  for (const body of [a, b]) {
    if (!body.food) continue;
    const v = renderer.vis(body);
    tier = Math.max(tier, body.food.tier);
    if (speed > 2.2) { v.hitUntil = now + 170; v.sq = Math.min(0.2, Math.max(v.sq, speed * 0.018)); }
  }
  if (speed > 2.5) sound.tap(speed, tier);
});

game.on('merge', (e) => {
  const now = performance.now();
  const T = TIERS[e.tier], r = T.r;
  fx.ghost(e.parts, e.from, TIERS[e.from].r);
  fx.burst(e.x, e.y, r, T.fx, e.combo, e.tier);
  const v = renderer.vis(e.body);
  v.bornAt = now; v.happyUntil = now + 700;
  // neighbours cheer; on a big chain everybody does
  for (const b of game.foods) {
    if (b === e.body) continue;
    const d = Math.hypot(b.position.x - e.x, b.position.y - e.y);
    if (e.combo >= RULES.BIG_COMBO || d < r * 2.6) {
      const bv = renderer.vis(b);
      bv.happyUntil = now + (e.combo >= RULES.BIG_COMBO ? 650 : 420);
      if (e.combo >= 2) bv.hopAt = now + Math.min(200, d * 0.6);
    }
  }
  const mult = comboMultiplier(e.combo);
  fx.popup(e.x, e.y - r * 0.4, `+${e.points}`, 16 + Math.min(14, e.tier * 1.2 + e.combo * 1.5), e.combo >= 3 ? '#ff7a1f' : '#ff5f7e');
  if (mult > 1) fx.popup(e.x, e.y - r * 0.4 - 22, `×${mult.toFixed(1)}`, 13, '#b44dff');
  sound.merge(e.tier, e.combo);
  haptics.pulse(e.tier >= 6 ? 22 : 12);
  if (e.tier >= 6) fx.kick(1.5 + (e.tier - 6) * 1.1);
  if (e.tier >= 8) fx.flash = Math.max(fx.flash, 0.6);
  noteBorn(e.tier);
  if (e.firstTime && store.data.born[e.tier] <= 1) {
    newDiscoveries.push(e.tier);
    banner('disc', `NEW! ${T.name}`, 1600);
    sound.firstDiscovery();
    drawEvo();
  }
  if (e.tier === MAX_TIER && !firstKingShown) {
    firstKingShown = true;
    banner('king', 'おべんとう王<small>たんじょう！</small>', 1800);
    fx.confetti(e.x, e.y - r, WORLD.W * 0.8, 90);
    sound.king();
    fx.flash = 1;
  }
  setCombo(e.combo);
  checkBest();
  if (e.combo >= RULES.BIG_COMBO) {
    if (e.combo === RULES.FEVER_COMBO) {
      feverOn = true; sound.fever = true;
      banner('fever', 'フィーバー！<small>スコア 1.5ばい</small>', 1200);
      sound.feverStart();
      $('fever-frame').classList.add('on');
      fx.confetti(WORLD.W / 2, WORLD.TOP + 20, WORLD.W, 40);
    } else {
      banner(e.combo >= 6 ? 'big' : 'combo', `${e.combo}れんさ！<small>${COMBO_WORDS[Math.min(10, e.combo)] || 'すごい！'}</small>`, 900);
      sound.comboFanfare(e.combo);
    }
    fx.kick(1 + Math.min(4, e.combo - 2));
  }
  updateHud();
});

game.on('king', (e) => {
  fx.burst(e.x, e.y, 110, '#ffd84a', 8, 10);
  fx.burst(e.x, e.y, 70, '#ff8fb1', 8, 10);
  fx.confetti(e.x, e.y - 60, WORLD.W, 120);
  fx.popup(e.x, e.y, `+${e.points}`, 34, '#e09a12');
  fx.flash = 1; fx.kick(7);
  banner('king', 'おべんとう<br>だいかんせい！', 1800);
  sound.king();
  haptics.pulse(60);
  setCombo(e.combo);
  checkBest();
  updateHud();
});

game.on('comboEnd', () => {
  if (feverOn) { feverOn = false; sound.fever = false; $('fever-frame').classList.remove('on'); }
  setTimeout(() => { if (game.combo === 0) setCombo(0); }, 400);
});

game.on('over', (e) => onGameOver(e));

function checkBest() {
  if (bestShown || bestAtStart <= 0 || game.score <= bestAtStart) return;
  bestShown = true;
  setTimeout(() => { banner('disc', 'ベスト更新中！', 1600); sound.highscore(); }, 350);
}

function noteBorn(tier) {
  store.data.born[tier] = (store.data.born[tier] || 0) + 1;
  if (store.data.born[tier] === 1) drawEvo();
}

// ---------------------------------------------------------------- HUD
function setCombo(n) {
  const c = $('combo-card');
  $('combo-num').textContent = n >= 2 ? n : '-';
  c.classList.toggle('on', n >= 2);
  c.classList.toggle('fever', n >= RULES.FEVER_COMBO);
  if (n >= 2) { c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse'); }
}

function updateHud(force) {
  const best = Math.max(store.data.best, game.score);
  $('best').textContent = best.toLocaleString();
  if (force) { shownScore = game.score; $('score').textContent = shownScore.toLocaleString(); }
}

function tickScore() {
  if (shownScore === game.score) return;
  const diff = game.score - shownScore;
  shownScore += diff > 0 ? Math.max(1, Math.ceil(diff * 0.22)) : diff;
  const el = $('score');
  el.textContent = shownScore.toLocaleString();
  if (shownScore === game.score) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}

function banner(cls, html, ms) {
  const layer = $('banners');
  while (layer.children.length >= 2) layer.firstChild.remove();
  const el = document.createElement('div');
  el.className = `banner ${cls}`;
  el.innerHTML = html;
  layer.appendChild(el);
  setTimeout(() => el.remove(), ms + 50);
}

function paintSprite(cv, tier, expr, silhouette = false) {
  const dpr = DPR();
  const css = cv.getBoundingClientRect().width || 50;
  cv.width = cv.height = Math.round(css * dpr);
  const ctx = cv.getContext('2d');
  const r = (css / 2 / 1.25) * dpr;
  const img = renderSprite(tier, expr, r, { silhouette, dom: true });
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, (cv.width - img.width) / 2, (cv.height - img.height) / 2);
}

function drawNext(pop) {
  const cv = $('next-cv');
  paintSprite(cv, game.next, 'normal');
  if (pop) { cv.classList.remove('pop'); void cv.offsetWidth; cv.classList.add('pop'); }
}

function drawEvo() {
  const cv = $('evo-cv');
  const rect = cv.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = DPR();
  cv.width = Math.round(rect.width * dpr); cv.height = Math.round(rect.height * dpr);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const n = TIERS.length, w = rect.width / n, h = rect.height;
  // connecting ribbon
  ctx.strokeStyle = 'rgba(255,170,150,0.45)'; ctx.lineWidth = 3; ctx.setLineDash([3, 5]); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(rect.width - w / 2, h / 2); ctx.stroke(); ctx.setLineDash([]);
  for (let i = 0; i < n; i++) {
    const r = Math.min(w * 0.42, h * 0.42) * (0.62 + 0.38 * (i / (n - 1)));
    const known = store.data.born[i] > 0;
    const img = renderSprite(i, 'normal', r * dpr, { silhouette: !known, dom: true });
    const s = img.width / dpr;
    ctx.globalAlpha = known ? 1 : 0.55;
    ctx.drawImage(img, w * i + w / 2 - s / 2, h / 2 - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- zukan
let zSel = 0, zExpr = 0;
function buildZukan() {
  const list = $('z-list');
  list.innerHTML = '';
  const born = store.data.born;
  $('z-count').textContent = `${born.filter((v) => v > 0).length} / ${TIERS.length}`;
  TIERS.forEach((t, i) => {
    const known = born[i] > 0;
    const el = document.createElement('button');
    el.className = `z-item${known ? '' : ' locked'}${i === zSel ? ' sel' : ''}`;
    el.innerHTML = `<canvas></canvas><span class="no">No.${String(i + 1).padStart(2, '0')}</span><span class="n">${known ? t.name : '？？？'}</span>`;
    el.addEventListener('click', () => { zSel = i; zExpr = 0; sound.click(); list.querySelectorAll('.z-item').forEach((x, k) => x.classList.toggle('sel', k === i)); zDetail(); });
    list.appendChild(el);
  });
  requestAnimationFrame(() => {
    list.querySelectorAll('.z-item canvas').forEach((cv, i) => paintSprite(cv, i, 'normal', !(born[i] > 0)));
    zDetail();
  });
}
function zDetail() {
  const i = zSel, t = TIERS[i], known = store.data.born[i] > 0;
  const box = $('z-detail');
  box.innerHTML = `<canvas title="タップで表情がかわるよ"></canvas><div><h3>${known ? t.name : '？？？'}</h3><p>${known ? t.desc : 'まだ見つけていないおかず。合体させて見つけよう！'}</p>` +
    `<div class="meta">${known ? `登場回数 ${store.data.born[i].toLocaleString()} 回 ・ ${i === MAX_TIER ? '王さま同士で合体するとボーナス！' : `2つ合体で → ${store.data.born[i + 1] > 0 ? TIERS[i + 1].name : '？？？'}`}` : ''}</div></div>`;
  const cv = box.querySelector('canvas');
  const paint = () => paintSprite(cv, i, known ? EXPRESSIONS[zExpr] : 'normal', !known);
  requestAnimationFrame(paint);
  if (known) cv.addEventListener('click', () => { zExpr = (zExpr + 1) % EXPRESSIONS.length; sound.click(); paint(); });
}

function buildStats() {
  const d = store.data;
  $('set-stats').innerHTML = [
    ['ハイスコア', d.best.toLocaleString()], ['最大れんさ', d.maxCombo], ['プレイ回数', d.plays],
    ['合体した回数', d.totalMerges.toLocaleString()], ['おべんとう完成', d.kings], ['図鑑', `${d.born.filter((v) => v > 0).length} / ${TIERS.length}`],
  ].map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
}

// ---------------------------------------------------------------- input
const stage = $('stage');
let activePointer = null;
function aimFrom(e) { renderer.aimX = Math.max(-20, Math.min(WORLD.W + 20, renderer.toWorldX(e.clientX))); }
stage.addEventListener('pointerdown', (e) => {
  sound.unlock();
  if (mode !== 'play' || paused || game.over) return;
  if (activePointer !== null) return;          // ignore extra fingers
  activePointer = e.pointerId;
  try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  aimFrom(e);
  e.preventDefault();
});
stage.addEventListener('pointermove', (e) => {
  if (mode !== 'play' || paused) return;
  if (e.pointerId === activePointer || (activePointer === null && e.pointerType === 'mouse')) aimFrom(e);
});
const release = (e, drop) => {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  if (drop && mode === 'play' && !paused) { aimFrom(e); game.drop(renderer.aimX); }
};
stage.addEventListener('pointerup', (e) => release(e, true));
stage.addEventListener('pointercancel', (e) => release(e, false));
window.addEventListener('keydown', (e) => {
  if (mode !== 'play' || paused) return;
  if (e.key === 'ArrowLeft') renderer.aimX = Math.max(0, renderer.aimX - 12);
  else if (e.key === 'ArrowRight') renderer.aimX = Math.min(WORLD.W, renderer.aimX + 12);
  else if (e.key === ' ' || e.key === 'Enter') { sound.unlock(); game.drop(renderer.aimX); }
  else return;
  e.preventDefault();
});
// keep iOS from zooming / rubber-banding the page
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (!e.target.closest('.z-list, .sheet:not(.tall)')) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());
// first touch anywhere unlocks audio (iOS needs a gesture)
for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, () => sound.unlock(), { passive: true });

// ---------------------------------------------------------------- lifecycle
function saveProgress() { if (mode === 'play' && !game.over && game.dropCount > 0) store.saveResume(game.snapshot()); store.save(); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveProgress(); sound.suspend(); }
  else { sound.resume(); resetClock(); }
});
window.addEventListener('pagehide', saveProgress);

function onResize() {
  renderer.resize();
  drawEvo();
  if (mode === 'play') drawNext();
  sizeTitle();
}
new ResizeObserver(() => onResize()).observe(stage);
window.addEventListener('orientationchange', () => setTimeout(onResize, 250));

// ---------------------------------------------------------------- title animation
const titleCv = $('title-cv');
const titleSprites = new Sprites();
const floaters = [];
function sizeTitle() {
  const r = titleCv.getBoundingClientRect();
  titleCv.width = Math.round(r.width * DPR()); titleCv.height = Math.round(r.height * DPR());
  titleSprites.setScale(DPR() * Math.min(1, r.width / 400) * 0.55);
}
function initFloaters() {
  floaters.length = 0;
  for (let i = 0; i < 14; i++) {
    const tier = i % 7;
    const side = i % 2 ? 0.08 + Math.random() * 0.17 : 0.75 + Math.random() * 0.17;
    floaters.push({ tier, x: side, y: i / 14 + Math.random() * 0.05, vy: 0.00004 + Math.random() * 0.00005, ph: Math.random() * 6, rot: (Math.random() - 0.5) * 0.6 });
  }
}
function drawTitle(now, dt) {
  const ctx = titleCv.getContext('2d');
  const W = titleCv.width, H = titleCv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  for (const f of floaters) {
    f.y -= f.vy * dt;
    if (f.y < -0.15) { f.y = 1.15; }
    const img = titleSprites.get(f.tier, (now + f.ph * 1000) % 2600 < 130 ? 'blink' : 'normal');
    const x = f.x * W + Math.sin(now / 900 + f.ph) * 12 * DPR(), y = f.y * H;
    ctx.save(); ctx.globalAlpha = 0.55; ctx.translate(x, y); ctx.rotate(f.rot + Math.sin(now / 1200 + f.ph) * 0.15);
    ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
  }
}

// ---------------------------------------------------------------- main loop
let last = performance.now();
let perfAcc = 0, perfN = 0, perfLevel = 0;
function resetClock() { last = performance.now(); }

function updateVis(now) {
  for (const b of game.foods) {
    const v = b.food.vis;
    if (!v) continue;
    v.sq *= 0.8;
    if (v.sq < 0.002) v.sq = 0;
    if (v.hopAt) {
      const t = (now - v.hopAt) / 320;
      v.hop = t > 0 && t < 1 ? -Math.sin(t * Math.PI) * Math.min(9, b.circleRadius * 0.35) : 0;
      if (t >= 1) v.hopAt = 0;
    }
  }
}

function frame(now) {
  const dt = Math.min(100, now - last);
  last = now;
  if (mode === 'title') {
    drawTitle(now, dt);
  } else {
    if (mode === 'play' && !paused) {
      alpha = game.update(dt);
      if (game.danger > 0.3 && !game.over && now - lastWarn > 650) { lastWarn = now; sound.warn(); }
      if (now - lastSave > 5000) { lastSave = now; if (!game.over && game.dropCount > 0) store.saveResume(game.snapshot()); store.save(); }
    }
    if (!paused) fx.update(dt);
    updateVis(now);
    feverLevel += ((feverOn ? 1 : 0) - feverLevel) * 0.08;
    renderer.fever = feverLevel;
    const held = mode === 'play' && !game.over ? { tier: game.current, visible: game.canDrop } : null;
    renderer.draw(game, fx, alpha, now, held);
    tickScore();
    if (retryArmedUntil && now > retryArmedUntil) { retryArmedUntil = 0; $('b-retry').classList.remove('armed'); $('retry-lbl').textContent = 'リトライ'; }
    // auto quality: if frames are slow, lower resolution and particle count
    perfAcc += dt; perfN++;
    if (perfN >= 120) {
      const avg = perfAcc / perfN;
      if (avg > 24 && perfLevel < 2 && !paused) {
        perfLevel++;
        renderer.maxDpr = perfLevel === 1 ? 2 : 1.5;
        fx.maxParts = perfLevel === 1 ? 180 : 110;
        renderer.resize();
      }
      perfAcc = 0; perfN = 0;
    }
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot
sizeTitle();
initFloaters();
updateTitle();
show('s-title');
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !/[?&]nosw/.test(location.search)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
