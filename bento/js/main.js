import { WORLD, TIERS, RULES, POWER, MAX_TIER, VS, OJAMA_TIER, tierInfo, attackFor, KING_ATTACK, seeded, rankFor, comboMultiplier, smashBonus } from './config.js';
import { Link, cleanCode, CODE_LEN } from './online.js';
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
let feverUntil = 0;   // >0 while a short smash fever is running
let spritesWarm = false;
let retryArmedUntil = 0;
let lastSave = 0;
let firstKingShown = false;
let newDiscoveries = [];
let bestAtStart = 0;
let bestShown = false;
const DPR = () => Math.min(window.devicePixelRatio || 1, 2.5);

window.__obento = { game, store, fx, renderer, sound, get vs() { return vs; } }; // handy for debugging / automated tests

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
  activePointer = null; endPull();
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
  if (vs.on) { vsLeave(); return; }
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
function startGame(snapshot, seed) {
  sound.unlock();
  vs.on = seed != null;
  game.rng = vs.on ? seeded(seed) : Math.random;
  game.reset();
  vsHud();
  if (snapshot) game.restore(snapshot);
  if (!vs.on) store.clearResume();
  fx.clear();
  mode = 'play'; paused = false;
  feverOn = false; feverLevel = 0; feverUntil = 0; renderer.fever = 0; endPull();
  firstKingShown = game.highestTier >= MAX_TIER;
  newDiscoveries = [];
  bestAtStart = store.data.best; bestShown = false;
  shownScore = game.score;
  retryArmedUntil = 0;
  renderer.heldShowAt = performance.now();
  renderer.aimX = WORLD.W / 2;
  for (const m of [...modals, 's-over', 's-title', 's-lobby', 's-vsresult']) show(m, false);
  $('banners').innerHTML = '';
  $('fever-frame').classList.remove('on');
  $('cameo').classList.remove('peek');
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
$('b-zukan').addEventListener('click', () => { if (!vs.on) openModal('s-zukan'); });
$('b-settings').addEventListener('click', () => { if (!vs.on) openModal('s-settings'); });
$('o-retry').addEventListener('click', () => { sound.click(); startGame(); });
$('o-title').addEventListener('click', () => toTitle());
$('o-zukan').addEventListener('click', () => openModal('s-zukan'));
$('set-title').addEventListener('click', () => { closeModal('s-settings'); toTitle(); });
$('set-reset').addEventListener('click', () => confirmBox('ハイスコアと図鑑の記録をすべて消します。よろしいですか？', () => { store.reset(); buildStats(); drawEvo(); updateTitle(); }));

// one-tap retry; if a game with real progress is running, a second tap within 2s confirms
$('b-retry').addEventListener('click', () => {
  sound.unlock();
  if (vs.on) return;
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

// ---------------------------------------------------------------- share
const shareURL = () => location.origin + location.pathname.replace(/index\.html$/, '');
let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 1800);
}
async function share(text) {
  sound.unlock(); sound.click();
  const url = shareURL();
  if (navigator.share) {
    try { await navigator.share({ title: 'おべんとうポン！', text, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('リンクをコピーしました'); }
  catch (e) { toast(url); }
}
let lastResult = null;
$('t-share').addEventListener('click', () => share('おなじおかずをくっつけて、おべんとう王をめざそう！'));
$('o-share').addEventListener('click', () => {
  const r = lastResult;
  share(r ? `おべんとうポン！で ${r.score.toLocaleString()}点！ 最大${r.maxCombo}れんさ、${TIERS[r.highestTier].name}まで作ったよ。` : 'おべんとうポン！で遊んだよ！');
});

function showResult(e, isBest) {
  lastResult = e;
  if (mode !== 'play') return;
  mode = 'over';
  $('r-head').textContent = isBest ? 'すごい！' : 'おしまい！';
  $('r-new').hidden = !isBest;
  $('r-score').textContent = '0';
  $('r-rank').textContent = `称号：${rankFor(e.score)}`;
  $('r-best').textContent = store.data.best.toLocaleString();
  $('r-combo').textContent = e.maxCombo;
  $('r-merges').textContent = e.merges;
  $('r-smash').textContent = e.maxSmash >= 2 ? `${e.maxSmash}れんさ` : e.powerDrops ? '-' : 'パワードロップで狙おう';
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

game.on('drop', ({ tier, power }) => {
  if (power >= POWER.SMASH_MIN) sound.powerDrop(power); else sound.drop(tier);
  haptics.pulse(8);
  renderer.dropAnim = performance.now();
  if (!store.data.tutorialDone) { store.data.tutorialDone = true; store.save(); $('hint').classList.add('off'); }
  noteBorn(tier);
  drawNext(true);
  if (power >= POWER.SMASH_MIN && !store.data.powerTipDone) { store.data.powerTipDone = true; store.save(); }
  if (!store.data.powerTipDone && game.dropCount === 6) showHint('下に引っぱると<br>パワードロップ！', 3200);
});

let hintTimer = 0;
function showHint(html, ms) {
  const h = $('hint');
  h.innerHTML = html; h.classList.remove('off');
  clearTimeout(hintTimer); hintTimer = setTimeout(() => h.classList.add('off'), ms);
}

game.on('ready', () => { renderer.heldShowAt = performance.now(); });

game.on('impact', ({ a, b, speed }) => {
  const now = performance.now();
  let tier = 0;
  for (const body of [a, b]) {
    if (!body.food) continue;
    const v = renderer.vis(body);
    if (!body.food.ojama) tier = Math.max(tier, body.food.tier);
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
  const mult = comboMultiplier(e.level) * (1 + smashBonus(e.smash));
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
  if (vs.on) vsAttack(attackFor(e.tier, e.level, e.smash), e.x, e.y, e.combo);
  if (e.smash >= 2 && e.smash >= e.level) {
    onSmash(e);
  } else if (e.combo >= RULES.BIG_COMBO) {
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

// SMASH! / SMASH COMBO! / SUPER SMASH!!: merges started by a power-drop impact
function onSmash(e) {
  const n = e.smash;
  if (n >= 5) {
    banner('supersmash', `SUPER SMASH!!<small>${n}れんさ</small>`, 1100);
    if (!feverOn) {
      feverOn = true; sound.fever = true; feverUntil = performance.now() + 2600;   // short fever, visuals only
      sound.feverStart();
      $('fever-frame').classList.add('on');
    } else if (feverUntil) feverUntil = performance.now() + 2600;
    fx.confetti(e.x, e.y - 40, WORLD.W * 0.8, 50);
  } else {
    banner(n >= 3 ? 'smash2' : 'smash', n >= 3 ? `SMASH COMBO!<small>${n}れんさ</small>` : 'SMASH!', 900);
  }
  if (n >= 3) {
    fx.burst(e.x, e.y, TIERS[e.tier].r * 1.2, '#8fb8ff', n + 2, e.tier + 2);
    fx.kick(Math.min(3, 1 + (n - 3) * 0.6));
  }
  sound.smash(n);
}

game.on('smashImpact', (e) => {
  const p = e.power, r = e.body.circleRadius;
  fx.shockwave(e.x, e.y, p, r);
  sound.impact(p);
  haptics.pulse(p > 0.7 ? 25 : 14);
  if (p > 0.7) fx.kick(1.2 + (p - 0.7) * 3);   // gentle: at most ~2 units
  const v = renderer.vis(e.body); v.sq = Math.min(0.24, 0.1 + p * 0.14); v.hitUntil = performance.now() + 220;
});

game.on('ojamaPop', ({ list }) => {
  for (const o of list) { fx.burst(o.x, o.y, 14, '#ff7a9a', 1, 0); fx.popup(o.x, o.y - 10, 'パチン！', 13, '#d0355a'); }
  sound.tap(6, 1);
});

game.on('smashEnd', (e) => { if (e.count > (store.data.maxSmash || 0)) { store.data.maxSmash = e.count; } });

// ---------------------------------------------------------------- reward photo (device-only)
// the family photo ships with the game; a photo picked in settings (kept on this device) replaces it
const DEFAULT_CAMEO = 'img/cameo.jpg';
let customCameo = store.loadCameo();
let cameoURL = customCameo || DEFAULT_CAMEO;
function refreshCameoUI() {
  cameoURL = customCameo || DEFAULT_CAMEO;
  $('cameo-thumb').hidden = false; $('cameo-thumb').src = cameoURL;
  $('cameo-test').hidden = false;
  $('cameo-del').hidden = !customCameo;
  $('cameo-pick').textContent = 'かえる';
  $('cameo').querySelector('img').src = cameoURL;
}
function showCameo() {
  if (!cameoURL) return;
  const el = $('cameo');
  el.classList.remove('peek'); void el.offsetWidth; el.classList.add('peek');
}
// shrink to at most 480px so it fits comfortably in local storage
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}
$('cameo-pick').addEventListener('click', () => { sound.click(); $('cameo-file').click(); });
$('cameo-file').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = await shrinkImage(f);
    if (!store.saveCameo(data)) { toast('保存できませんでした'); return; }
    customCameo = data; refreshCameoUI(); toast('ごほうび写真をかえました');
  } catch (err) { toast('この画像は読みこめませんでした'); }
});
$('cameo-test').addEventListener('click', () => { sound.click(); closeModal('s-settings'); setTimeout(showCameo, 200); });
$('cameo-del').addEventListener('click', () => confirmBox('元の写真にもどしますか？', () => { store.saveCameo(null); customCameo = null; refreshCameoUI(); }));
refreshCameoUI();

game.on('king', (e) => {
  fx.burst(e.x, e.y, 110, '#ffd84a', 8, 10);
  fx.burst(e.x, e.y, 70, '#ff8fb1', 8, 10);
  fx.confetti(e.x, e.y - 60, WORLD.W, 120);
  fx.popup(e.x, e.y, `+${e.points}`, 34, '#e09a12');
  fx.flash = 1; fx.kick(7);
  setTimeout(showCameo, 350);
  sound.king();
  haptics.pulse(60);
  setCombo(e.combo);
  checkBest();
  if (vs.on) { vsAttack(KING_ATTACK, e.x, e.y, e.combo); vsSend({ t: 'ev', k: 'king' }); }
  updateHud();
});

game.on('comboEnd', () => {
  if (feverOn && !feverUntil) { feverOn = false; sound.fever = false; $('fever-frame').classList.remove('on'); }
  setTimeout(() => { if (game.combo === 0) setCombo(0); }, 400);
});

game.on('over', (e) => { if (vs.on) vsOver(); else onGameOver(e); });

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
  // a second banner while one is still showing goes underneath instead of on top of it
  if (cls !== 'disc' && layer.querySelector('.banner:not(.disc):not(.low)')) el.classList.add('low');
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
    ['合体した回数', d.totalMerges.toLocaleString()], ['最大スマッシュ', d.maxSmash >= 2 ? `${d.maxSmash}れんさ` : '-'], ['おべんとう完成', d.kings], ['図鑑', `${d.born.filter((v) => v > 0).length} / ${TIERS.length}`],
  ].map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
}

// ---------------------------------------------------------------- online battle
const vs = {
  on: false, link: null, phase: 'idle',        // idle | lobby | count | play | done
  startAt: 0, endAt: 0, pending: 0, pendingAt: 0, sentAt: 0, sent: 0, received: 0,
  opp: { foods: [], score: 0, d: 0 }, me: null, them: null, again: false, oppAgain: false,
  giveupArmed: 0, endTimer: 0,
};
function vsSend(msg) { if (vs.link) vs.link.send(msg); }

function vsHud() {
  $('vs-card').hidden = !vs.on; $('combo-card').hidden = vs.on;
  $('vs-time').hidden = !vs.on; $('best-row').hidden = vs.on;
  $('b-retry').hidden = vs.on; $('b-giveup').hidden = !vs.on;
  $('b-settings').disabled = $('b-zukan').disabled = vs.on;
  $('ojama-warn').hidden = true; $('countdown').hidden = true;
  $('evo').style.visibility = vs.on ? 'hidden' : '';
}

function lobbyView(id) {
  for (const v of ['l-choose', 'l-hostview', 'l-joinview', 'l-ready']) $(v).hidden = v !== id;
  $('l-back').hidden = id === 'l-choose' || id === 'l-ready';
}
function lobbyStatus(text, err = false) { const el = $('l-status'); el.textContent = text; el.classList.toggle('err', err); }
function vsRecordText() {
  const d = store.data;
  return (d.vsWins || d.vsLosses || d.vsDraws) ? `これまでの対戦 ${d.vsWins || 0}勝 ${d.vsLosses || 0}敗${d.vsDraws ? ` ${d.vsDraws}分` : ''}` : '';
}
function openLobby(code) {
  sound.unlock(); sound.click();
  vsDisconnect();
  vs.phase = 'lobby';
  lobbyView('l-choose'); lobbyStatus('');
  $('l-rec').textContent = vsRecordText();
  show('s-lobby');
  if (typeof window.Peer !== 'function') { lobbyStatus('通信の部品を読みこめませんでした。ページを再読み込みしてください', true); return; }
  if (code) { lobbyView('l-joinview'); $('l-input').value = code; }
}
function vsDisconnect() { if (vs.link) { vs.link.close(); vs.link = null; } }
function newLink() {
  vsDisconnect();
  const link = new Link({
    onStatus: (t) => {
      if (link !== vs.link) return;
      if (t === 'waiting') { $('l-code').textContent = link.code; lobbyStatus('相手を待っています…'); }
      else lobbyStatus(t);
    },
    onOpen: () => {
      if (link !== vs.link) return;
      haptics.pulse(20); sound.firstDiscovery();
      lobbyView('l-ready'); lobbyStatus('');
      $('l-start').hidden = !link.isHost; $('l-wait').hidden = link.isHost;
      vsSend({ t: 'hello', v: 1 });
    },
    onMessage: (m) => { if (link === vs.link) vsMessage(m); },
    onClose: (reason) => { if (link === vs.link) vsLost(reason); },
  });
  vs.link = link;
  return link;
}
$('t-vs').addEventListener('click', () => openLobby());
$('l-close').addEventListener('click', () => { sound.click(); vsDisconnect(); vs.phase = 'idle'; show('s-lobby', false); });
$('l-back').addEventListener('click', () => { sound.click(); vsDisconnect(); lobbyView('l-choose'); lobbyStatus(''); });
$('l-host').addEventListener('click', () => { sound.click(); lobbyView('l-hostview'); $('l-code').textContent = '-----'; newLink().host(); });
$('l-join-open').addEventListener('click', () => { sound.click(); lobbyView('l-joinview'); lobbyStatus(''); setTimeout(() => $('l-input').focus(), 50); });
$('l-input').addEventListener('input', (e) => { e.target.value = cleanCode(e.target.value); });
$('l-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('l-join').click(); });
$('l-join').addEventListener('click', () => {
  const code = cleanCode($('l-input').value);
  if (code.length !== CODE_LEN) { lobbyStatus(`${CODE_LEN}文字のコードを入れてね`, true); return; }
  sound.click(); $('l-input').blur();
  newLink().join(code);
});
$('l-share').addEventListener('click', () => {
  const code = vs.link && vs.link.code;
  if (!code) return;
  const url = `${shareURL()}?room=${code}`;
  sound.click();
  if (navigator.share) navigator.share({ title: 'おべんとうポン！ネット対戦', text: `おべんとうポン！で対戦しよう！ へやコード ${code}`, url }).catch(() => {});
  else navigator.clipboard?.writeText(`おべんとうポン！で対戦しよう！ へやコード ${code}\n${url}`).then(() => toast('リンクをコピーしました'), () => toast(url));
});
$('l-start').addEventListener('click', () => {
  sound.click();
  const seed = (Math.random() * 4294967296) >>> 0;
  vsSend({ t: 'start', seed });
  vsBegin(seed);
});

function vsMessage(m) {
  switch (m.t) {
    case 'start': vsBegin(m.seed >>> 0); break;
    case 's':
      if (Array.isArray(m.f)) vs.opp.foods = m.f;
      vs.opp.score = m.sc | 0; vs.opp.d = +m.d || 0;
      break;
    case 'atk': vsIncoming(Math.min(30, m.n | 0)); break;
    case 'ev': if (vs.phase === 'play' && m.k === 'king') banner('disc', 'あいてが おべんとう王を完成！', 1400); else if (vs.phase === 'play' && m.k === 'chain') banner('disc', `あいてが ${m.n | 0}れんさ！`, 1100); break;
    case 'end': vsTheyEnded(m); break;
    case 'again': vs.oppAgain = true; vsMaybeRematch(); break;
    case 'bye': vsLost('相手が対戦をやめました'); break;
    default: break;
  }
}

function vsBegin(seed) {
  clearTimeout(vs.endTimer);
  Object.assign(vs, { phase: 'count', pending: 0, pendingAt: 0, sent: 0, received: 0, me: null, them: null, again: false, oppAgain: false, opp: { foods: [], score: 0, d: 0 } });
  startGame(null, seed);
  paused = true;                       // frozen during the 3-2-1
  $('hint').classList.add('off');
  vs.startAt = performance.now() + 3000;
  vs.endAt = vs.startAt + VS.TIME_MS;
  vsCountdown();
}
function vsCountdown() {
  const el = $('countdown');
  el.hidden = false; el.classList.remove('go');
  const steps = ['3', '2', '1'];
  steps.forEach((n, i) => setTimeout(() => { if (vs.phase !== 'count') return; el.innerHTML = `<span>${n}</span>`; sound.charge(1 + (i === 2 ? 1 : 0)); }, i * 1000));
  setTimeout(() => {
    if (vs.phase !== 'count') return;
    el.classList.add('go'); el.innerHTML = '<span>スタート！</span>';
    sound.charge(3); haptics.pulse(25);
    vs.phase = 'play'; paused = false; resetClock();
    setTimeout(() => { el.hidden = true; }, 800);
  }, 3000);
}

// my merges send うめぼし; they first cancel the ones heading my way
function vsAttack(n, x, y, combo) {
  if (vs.phase !== 'play' || n <= 0) return;
  if (vs.pending > 0) {
    const c = Math.min(vs.pending, n);
    vs.pending -= c; n -= c;
    fx.popup(x, y - 40, `そうさい −${c}`, 16, '#3a9fd0');
    vsWarn();
  }
  if (n > 0) {
    vsSend({ t: 'atk', n });
    vs.sent += n;
    fx.popup(x, y - 40, `うめぼし×${n} →`, 16, '#d0355a');
  }
  if (combo >= 3) vsSend({ t: 'ev', k: 'chain', n: combo });
}
function vsIncoming(n) {
  if (vs.phase !== 'play' || n <= 0) return;
  if (vs.pending === 0) vs.pendingAt = performance.now() + VS.ATTACK_DELAY;
  vs.pending += n; vs.received += n;
  sound.warn(); haptics.pulse(15);
  vsWarn();
}
function vsWarn() {
  $('ojama-warn').hidden = vs.pending <= 0;
  $('ojama-n').textContent = `×${vs.pending}`;
}

let vsMiniCtx = null;
function vsTick(now) {
  if (vs.phase !== 'play') { if (vs.phase === 'done' || vs.phase === 'count') vsDrawOpp(); return; }
  // うめぼし shower
  if (vs.pending > 0 && now >= vs.pendingAt && !game.over) {
    const n = Math.min(vs.pending, VS.RAIN_MAX);
    for (let i = 0; i < n; i++) game.dropOjama(((i + 0.5) / n) * WORLD.W + (Math.random() - 0.5) * 50);
    vs.pending -= n; vs.pendingAt = now + VS.RAIN_GAP;
    vsWarn();
  }
  // board to the opponent
  if (now - vs.sentAt > 1000 / VS.SEND_HZ) {
    vs.sentAt = now;
    const f = [];
    for (const b of game.foods) f.push(b.food.tier, Math.round(b.position.x), Math.round(b.position.y));
    vsSend({ t: 's', f, sc: game.score, d: +game.danger.toFixed(2) });
  }
  // timer
  const left = Math.max(0, vs.endAt - now);
  const sec = Math.ceil(left / 1000);
  const el = $('vs-time');
  el.textContent = `のこり ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  el.classList.toggle('hurry', sec <= 10);
  if (left <= 0 && !game.over) { game.stop(); vsMyEnd('time'); }
  vsDrawOpp();
}

function vsDrawOpp() {
  const cv = $('vs-cv');
  const dpr = DPR();
  const w = 50, h = 50;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); vsMiniCtx = null; }
  const ctx = vsMiniCtx || (vsMiniCtx = cv.getContext('2d'));
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  const k = Math.min(w / (WORLD.W + 24), h / (WORLD.FLOOR - WORLD.TOP + 30)) * dpr;
  ctx.setTransform(k, 0, 0, k, (cv.width - WORLD.W * k) / 2, cv.height - (WORLD.FLOOR + 8) * k);
  ctx.fillStyle = vs.opp.d > 0.05 ? `rgba(255,${180 - 100 * vs.opp.d},${190 - 100 * vs.opp.d},1)` : '#fffaf0';
  ctx.strokeStyle = '#ef6874'; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.rect(0, WORLD.TOP, WORLD.W, WORLD.FLOOR - WORLD.TOP); ctx.fill(); ctx.stroke();
  const f = vs.opp.foods;
  for (let i = 0; i + 2 < f.length; i += 3) {
    const T = tierInfo(f[i]);
    if (!T) continue;
    ctx.fillStyle = T.color; ctx.strokeStyle = T.dark; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(f[i + 1], f[i + 2], T.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  $('vs-score').textContent = vs.opp.score.toLocaleString();
  $('vs-card').classList.toggle('danger', vs.opp.d > 0.3 && vs.phase === 'play');
}

// ---- ending: whoever overflows first loses; otherwise the higher score wins
function vsOver() { vsMyEnd('over'); }
function vsMyEnd(why) {
  if (vs.me) return;
  vs.me = { score: game.score, why };
  vsSend({ t: 'end', score: game.score, why });
  vsSettle();
}
function vsTheyEnded(m) {
  vs.them = { score: m.score | 0, why: m.why };
  vs.opp.score = vs.them.score;
  if (!vs.me) { game.stop(); vsMyEnd(m.why === 'over' ? 'stopped' : 'time'); }
  else vsSettle();
}
function vsSettle() {
  if (vs.phase === 'done') return;
  vs.phase = 'done';
  sound.fever = false; feverOn = false; $('fever-frame').classList.remove('on');
  $('ojama-warn').hidden = true;
  if (vs.them) { vsShowResult(); return; }
  // wait a moment for their final score; fall back to the last one we heard
  vs.endTimer = setTimeout(() => { if (!vs.them) vs.them = { score: vs.opp.score, why: 'time' }; vsShowResult(); }, 5000);
  vs.waitThem = setInterval(() => { if (vs.them) { clearInterval(vs.waitThem); clearTimeout(vs.endTimer); vsShowResult(); } }, 100);
}
function vsOutcome(me, them) {
  const meOver = me.why === 'over', themOver = them.why === 'over';
  if (meOver && !themOver) return 'lose';
  if (themOver && !meOver) return 'win';
  return me.score > them.score ? 'win' : me.score < them.score ? 'lose' : 'draw';
}
function vsShowResult() {
  clearInterval(vs.waitThem); clearTimeout(vs.endTimer);
  if (mode !== 'play' && mode !== 'over') return;
  if ($('s-vsresult').classList.contains('show')) return;
  const me = vs.me, them = vs.them;
  const res = vsOutcome(me, them);
  const d = store.data;
  if (res === 'win') d.vsWins = (d.vsWins || 0) + 1; else if (res === 'lose') d.vsLosses = (d.vsLosses || 0) + 1; else d.vsDraws = (d.vsDraws || 0) + 1;
  store.save();
  const head = $('vr-head');
  head.textContent = res === 'win' ? 'かち！' : res === 'lose' ? 'まけ…' : 'ひきわけ';
  head.className = `vr-head ${res === 'win' ? '' : res}`;
  $('vr-why').textContent =
    me.why === 'over' && them.why !== 'over' ? 'おかずが箱からあふれちゃった' :
    them.why === 'over' && me.why !== 'over' ? '相手のおかずがあふれた！' : 'スコアで勝負！';
  $('vr-me').textContent = me.score.toLocaleString();
  $('vr-opp').textContent = them.score.toLocaleString();
  $('vr-rec').textContent = `おくったうめぼし ${vs.sent}こ ・ ${vsRecordText()}`;
  $('vr-again').disabled = false; $('vr-wait').hidden = true;
  setTimeout(() => {
    mode = 'over';
    show('s-vsresult');
    if (res === 'win') { sound.highscore(); fx.confetti(WORLD.W / 2, WORLD.TOP, WORLD.W, 80); } else sound.gameover();
  }, 900);
}
$('vr-again').addEventListener('click', () => {
  sound.click();
  vs.again = true; vsSend({ t: 'again' });
  $('vr-again').disabled = true; $('vr-wait').hidden = false;
  vsMaybeRematch();
});
function vsMaybeRematch() {
  if (!vs.again || !vs.oppAgain || !vs.link || !vs.link.isHost) return;
  const seed = (Math.random() * 4294967296) >>> 0;
  vsSend({ t: 'start', seed });
  vsBegin(seed);
}
$('vr-quit').addEventListener('click', () => { sound.click(); vsLeave(); });
function vsLeave() {
  vsSend({ t: 'bye' });
  setTimeout(vsDisconnect, 150);
  vs.on = false; vs.phase = 'idle';
  clearInterval(vs.waitThem); clearTimeout(vs.endTimer);
  show('s-vsresult', false); show('s-lobby', false);
  vsHud();
  mode = 'title'; paused = false;
  show('s-title'); updateTitle();
}
// the connection dropped (or the opponent left)
function vsLost(reason) {
  vs.link = null;
  if (vs.phase === 'lobby' || vs.phase === 'idle') { lobbyStatus(reason, true); $('l-back').hidden = false; return; }
  if (vs.phase === 'play' || vs.phase === 'count') {
    game.stop();
    vs.phase = 'done';
    $('countdown').hidden = true; $('ojama-warn').hidden = true;
    head2('しょうぶなし', reason);
    return;
  }
  // already finished: just stop offering a rematch
  $('vr-again').disabled = true; $('vr-wait').hidden = false; $('vr-wait').textContent = reason;
}
function head2(title, why) {
  const head = $('vr-head');
  head.textContent = title; head.className = 'vr-head draw';
  $('vr-why').textContent = why;
  $('vr-me').textContent = game.score.toLocaleString();
  $('vr-opp').textContent = vs.opp.score.toLocaleString();
  $('vr-rec').textContent = vsRecordText();
  $('vr-again').disabled = true; $('vr-wait').hidden = false; $('vr-wait').textContent = '相手とつながっていないので、もう1回はできません';
  mode = 'over';
  show('s-vsresult');
}
// give up: tap twice
$('b-giveup').addEventListener('click', () => {
  if (!vs.on || vs.phase !== 'play') return;
  const now = performance.now();
  if (now < vs.giveupArmed) { vs.giveupArmed = 0; $('giveup-lbl').textContent = 'こうさん'; game.stop(); vsMyEnd('over'); return; }
  vs.giveupArmed = now + 2000; $('giveup-lbl').textContent = 'もう一度で こうさん';
  setTimeout(() => { if (performance.now() >= vs.giveupArmed) $('giveup-lbl').textContent = 'こうさん'; }, 2100);
  sound.click();
});
// an invite link (?room=CODE) opens the lobby ready to join
{
  const room = cleanCode(new URLSearchParams(location.search).get('room'));
  if (room.length === CODE_LEN) setTimeout(() => { if (mode === 'title') openLobby(room); }, 300);
}

// ---------------------------------------------------------------- input
const stage = $('stage');
let activePointer = null;
let pullStartY = 0;
let pullLevel = 0;            // 0..3 band last announced (for the gauge ticks)
let keyPower = 0;
function aimFrom(e) { renderer.aimX = Math.max(-20, Math.min(WORLD.W + 20, renderer.toWorldX(e.clientX))); }
// power = how far the finger moved down from where it touched (moving back up lowers it)
function pullFrom(e) {
  const dy = e.clientY - pullStartY;
  setPower(Math.max(0, Math.min(1, (dy - POWER.DEADZONE_PX) / POWER.PULL_PX)));
}
function setPower(p) {
  renderer.power = p;
  const level = p >= 0.999 ? 3 : p > 0.7 ? 2 : p >= POWER.SMASH_MIN ? 1 : 0;
  if (level > pullLevel) { sound.charge(level); if (level === 3) haptics.pulse(15); }
  pullLevel = level;
}
function endPull() { renderer.charging = false; renderer.power = 0; pullLevel = 0; }
stage.addEventListener('pointerdown', (e) => {
  sound.unlock();
  if (mode !== 'play' || paused || game.over) return;
  if (activePointer !== null) return;          // ignore extra fingers
  activePointer = e.pointerId;
  try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  aimFrom(e);
  pullStartY = e.clientY;
  renderer.charging = true; setPower(0);
  e.preventDefault();
});
stage.addEventListener('pointermove', (e) => {
  if (mode !== 'play' || paused) return;
  if (e.pointerId === activePointer) { aimFrom(e); pullFrom(e); }
  else if (activePointer === null && e.pointerType === 'mouse') aimFrom(e);
});
const release = (e, drop) => {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  const p = renderer.power;
  endPull();
  if (drop && mode === 'play' && !paused) game.drop(renderer.aimX, p);   // aim stays where the finger was while pulling
};
stage.addEventListener('pointerup', (e) => release(e, true));
stage.addEventListener('pointercancel', (e) => release(e, false));
// keyboard: arrows aim, hold Down to charge (Up to lower), Space/Enter drops
window.addEventListener('keydown', (e) => {
  if (mode !== 'play' || paused) return;
  if (e.key === 'ArrowLeft') renderer.aimX = Math.max(0, renderer.aimX - 12);
  else if (e.key === 'ArrowRight') renderer.aimX = Math.min(WORLD.W, renderer.aimX + 12);
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    keyPower = Math.max(0, Math.min(1, keyPower + (e.key === 'ArrowDown' ? 0.1 : -0.1)));
    renderer.charging = keyPower > 0; setPower(keyPower);
  } else if (e.key === ' ' || e.key === 'Enter') { sound.unlock(); game.drop(renderer.aimX, keyPower); keyPower = 0; endPull(); }
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
function saveProgress() { if (mode === 'play' && !vs.on && !game.over && game.dropCount > 0) store.saveResume(game.snapshot()); store.save(); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveProgress(); sound.suspend(); }
  else { sound.resume(); resetClock(); }
});
window.addEventListener('pagehide', saveProgress);

function onResize() {
  renderer.resize();
  spritesWarm = false;
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
    if (vs.on && mode === 'play') vsTick(now);
    if (mode === 'play' && !paused) {
      alpha = game.update(dt);
      if (game.danger > 0.3 && !game.over && now - lastWarn > 650) { lastWarn = now; sound.warn(); }
      if (now - lastSave > 5000) { lastSave = now; if (!vs.on && !game.over && game.dropCount > 0) store.saveResume(game.snapshot()); store.save(); }
    }
    if (!paused) fx.update(dt);
    updateVis(now);
    if (feverUntil && now > feverUntil) { feverUntil = 0; if (game.combo < RULES.FEVER_COMBO) { feverOn = false; sound.fever = false; $('fever-frame').classList.remove('on'); } }
    feverLevel += ((feverOn ? 1 : 0) - feverLevel) * 0.08;
    renderer.fever = feverLevel;
    const held = mode === 'play' && !game.over ? { tier: game.current, visible: game.canDrop } : null;
    renderer.draw(game, fx, alpha, now, held);
    if (!spritesWarm) spritesWarm = renderer.sprites.warm(dt < 20 ? 3 : 1);
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
