// Screens, save data, upgrades, rewards and the bonus roulette around the runner.
import { Game } from './game.js';
import { audio, buzz } from './audio.js';
import { BASE_START } from './level.js';

const KEY = 'gaterush-v1';
const save = Object.assign({ level: 1, coins: 0, upStart: 0, upIncome: 0, best: 0, plays: 0, muted: false }, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })());
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } };
audio.muted = save.muted;

const $ = (s) => document.querySelector(s);
const show = (id, on) => $(id).classList.toggle('on', on);
const fmt = (n) => Math.round(n).toLocaleString('ja-JP');

const startN = () => BASE_START + save.upStart * 3;
const incomeMul = () => 1 + save.upIncome * 0.15;
const costStart = () => Math.round(50 * 1.6 ** save.upStart);
const costIncome = () => Math.round(70 * 1.65 ** save.upIncome);

const game = new Game($('#cv'), { onStart, onEnd });
window.__rush = { game, save, store };

let last = performance.now(), auto = false;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (auto && game.phase !== 'ready') game.autopilot();
  game.update(dt); game.render();
  if (game.crowd && game.phase !== 'ready') $('#prog-fill').style.width = (game.progress * 100).toFixed(1) + '%';
  requestAnimationFrame(frame);
}

function renderCoins() { $('#coins').textContent = fmt(save.coins); }
function renderHome() {
  $('#lv-no').textContent = save.level;
  $('#lv-tag').textContent = save.level % 5 === 0 ? 'ボーナスステージ' : '';
  $('#hud-lv').textContent = `LEVEL ${save.level}`;
  $('#up-start-lv').textContent = `Lv.${save.upStart + 1}`;
  $('#up-start-v').textContent = `${startN()}人スタート`;
  $('#up-start-c').textContent = fmt(costStart());
  $('#up-inc-lv').textContent = `Lv.${save.upIncome + 1}`;
  $('#up-inc-v').textContent = `報酬 ×${incomeMul().toFixed(2)}`;
  $('#up-inc-c').textContent = fmt(costIncome());
  $('#up-start').disabled = save.coins < costStart();
  $('#up-inc').disabled = save.coins < costIncome();
  $('#prog-fill').style.width = '0%';
  renderCoins();
}
function toHome() {
  game.load(save.level, startN());
  renderHome();
  show('#win', false); show('#lose', false); show('#home', true);
  $('#hud').classList.remove('playing');
}
function onStart() { $('#hud-lv').textContent = `LEVEL ${game.level}`; show('#home', false); $('#hud').classList.add('playing'); save.plays++; store(); }

function upgrade(kind) {
  const cost = kind === 'start' ? costStart() : costIncome();
  if (save.coins < cost) return;
  save.coins -= cost; kind === 'start' ? save.upStart++ : save.upIncome++;
  store(); audio.init(); audio.coin(); buzz(15);
  game.load(save.level, startN());
  renderHome();
  const el = kind === 'start' ? $('#up-start') : $('#up-inc'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

// ---- results
let reward = 0, roulette = null;
function onEnd(r) {
  $('#hud').classList.remove('playing');
  if (!r.win) {
    $('#lose-pct').textContent = `${Math.round(r.progress * 100)}%`;
    $('#lose-bar').style.width = `${Math.round(r.progress * 100)}%`;
    $('#lose-msg').textContent = r.deficit ? `あと ${r.deficit} 人で勝てた！` : 'ゲートの選び方を変えてみよう';
    show('#lose', true);
    return;
  }
  const base = 12 + save.level * 4 + r.perfect * 4 + Math.min(r.left, 600) * 0.05 + Math.min(r.kills, 600) * 0.03;
  reward = Math.round(base * r.mult * incomeMul() * (r.bonus ? 2 : 1));
  save.best = Math.max(save.best, r.best);
  $('#win-title').textContent = r.bonus ? 'BONUS CLEAR!' : 'LEVEL CLEAR!';
  $('#win-mult').textContent = `×${r.mult.toFixed(1)}`;
  $('#win-perfect').textContent = r.perfect ? `PERFECT ${r.perfect}回` : '';
  $('#win-reward').textContent = fmt(reward);
  $('#claim').hidden = true; $('#spin').disabled = false; $('#spin').textContent = 'ストップ！';
  show('#win', true);
  startRoulette();
  setTimeout(() => { if (roulette) $('#claim').hidden = false; }, 1600);
}

const SEG = [2, 3, 5, 3, 2];
function startRoulette() {
  const needle = $('#needle');
  roulette = { t: 0, x: 0, raf: 0 };
  const loop = (now) => {
    if (!roulette) return;
    roulette.t = now / 1000;
    roulette.x = 0.5 + 0.5 * Math.sin(roulette.t * 3.6);       // 0..1 across the bar
    needle.style.left = (roulette.x * 100).toFixed(2) + '%';
    const m = SEG[Math.min(SEG.length - 1, Math.floor(roulette.x * SEG.length))];
    $('#spin-val').textContent = fmt(reward * m);
    roulette.raf = requestAnimationFrame(loop);
  };
  roulette.raf = requestAnimationFrame(loop);
}
function stopRoulette(take) {
  if (!roulette) return;
  cancelAnimationFrame(roulette.raf);
  const m = take ? 1 : SEG[Math.min(SEG.length - 1, Math.floor(roulette.x * SEG.length))];
  roulette = null;
  $('#spin').disabled = true; $('#claim').hidden = true;
  const total = reward * m;
  if (!take) { $('#spin').textContent = `×${m}!`; audio.perfect(); buzz(40); }
  countUp(total, () => { save.level++; store(); setTimeout(toHome, 650); });
}
function countUp(total, done) {
  const from = save.coins, to = save.coins + total, t0 = performance.now(), dur = 900;
  save.coins = to; store();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    $('#coins').textContent = fmt(from + (to - from) * (1 - (1 - k) ** 3));
    $('#coin-chip').classList.toggle('bump', k < 1 && Math.floor(k * 12) % 2 === 0);
    if (Math.floor(k * 12) !== Math.floor(((now - 16 - t0) / dur) * 12)) audio.coin();
    if (k < 1) requestAnimationFrame(step); else { renderCoins(); done(); }
  };
  requestAnimationFrame(step);
}

// ---- wiring
$('#up-start').addEventListener('click', () => upgrade('start'));
$('#up-inc').addEventListener('click', () => upgrade('income'));
$('#spin').addEventListener('click', () => stopRoulette(false));
$('#claim').addEventListener('click', () => stopRoulette(true));
$('#retry').addEventListener('click', () => { audio.init(); toHome(); });
$('#mute').addEventListener('click', () => { save.muted = audio.muted = !audio.muted; store(); $('#mute').classList.toggle('off', audio.muted); });
$('#mute').classList.toggle('off', audio.muted);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

if (new URLSearchParams(location.search).has('auto')) auto = true;
window.__rush.setAuto = (v) => { auto = v; };
toHome();
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
