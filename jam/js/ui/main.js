// JAM LAB — UI controller (screens, play view, game modes).
import { Sim, DT } from '../sim/engine.js';
import { ringScenario } from '../sim/scenarios.js';
import { STYLES, STYLE_KEYS, CLASSES, KMH } from '../sim/models.js';
import { Renderer } from '../render/renderer.js';
import { SpaceTime, drawFD, drawSeries } from '../render/charts.js';
import { MISSIONS, CONTROLS, fmtVehMin } from '../game/missions.js';
import { MissionRun } from '../game/runner.js';
import { applyControl, readControl } from '../game/controls.js';
import { makeQuiz, EXPLAIN } from '../game/quiz.js';
import { TRIVIA, ACHIEVEMENTS, LEARN, CAUSES } from './content.js';
import * as SAVE from './save.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '-');

const data = SAVE.load();
const sound = new Sound();
sound.on = data.sound;

// ---------------------------------------------------------------- router
const stack = ['home'];
function show(id, push = true) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
  if (push && stack[stack.length - 1] !== id) stack.push(id);
  if (id === 'home') { homeBg.start(); refreshHome(); } else homeBg.stop();
  if (id === 'missions') renderMissions();
  if (id === 'sandbox') renderSandbox();
  if (id === 'learn') renderLearn('how');
  if (id === 'records') renderRecords();
}
function back() {
  if (stack.length > 1) stack.pop();
  const id = stack[stack.length - 1];
  if (id === 'play') { stack.pop(); return back(); }
  show(id, false);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go],[data-back]');
  if (!b) return;
  sound.unlock(); sound.click();
  if (b.hasAttribute('data-back')) return back();
  const go = b.dataset.go;
  if (go === 'lab') return play.open({ mode: data.tutorialDone ? 'lab' : 'tutorial' });
  if (go === 'quiz') return play.open({ mode: 'quiz' });
  show(go);
});

// ---------------------------------------------------------------- home
const homeBg = {
  r: null, sim: null, raf: 0, last: 0, acc: 0,
  start() {
    if (this.raf) return;
    const cv = $('home-cv');
    if (!this.r) { this.r = new Renderer(cv); this.r.quality = 1; this.r.opts.mode = 'speed'; this.r.opts.chain = false; }
    if (!this.sim) { this.sim = new Sim(ringScenario({ n: 25, seed: 5 })); for (let i = 0; i < 1400; i++) this.sim.step(); }
    this.r.setSim(this.sim); this.r.resize(); this.r.zoom = 1.25;
    this.last = performance.now();
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      this.acc += Math.min(0.1, (now - this.last) / 1000); this.last = now;
      while (this.acc >= DT) { this.sim.step(); this.acc -= DT; }
      this.r.resize(); this.r.frame(this.acc / DT, now);
    };
    this.raf = requestAnimationFrame(loop);
  },
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; },
};

function totalStars() { return MISSIONS.reduce((a, m) => a + SAVE.stageStars(m.id), 0); }
function refreshHome() {
  $('home-stars').textContent = `★ ${totalStars()} / 24`;
  $('home-sound').innerHTML = icon(data.sound ? 'sound' : 'mute');
}
$('home-sound').addEventListener('click', () => { toggleSound(); refreshHome(); });
function toggleSound() { sound.unlock(); data.sound = !data.sound; sound.setOn(data.sound); SAVE.save(); $('p-sound').innerHTML = icon(data.sound ? 'sound' : 'mute'); }

// ---------------------------------------------------------------- lists
function starsHtml(n) { return [0, 1, 2].map((i) => `<svg class="${i < n ? 'on' : ''}"><use href="#i-star"/></svg>`).join(''); }

function renderMissions() {
  const list = $('mission-list'); list.innerHTML = '';
  MISSIONS.forEach((ms, i) => {
    const stars = SAVE.stageStars(ms.id);
    const unlocked = i === 0 || SAVE.stageStars(MISSIONS[i - 1].id) > 0;
    const c = el('button', 'card' + (unlocked ? '' : ' locked'));
    c.innerHTML = `<div class="no">STAGE ${ms.no}</div><h3>${ms.title}</h3><p>${ms.goal}</p>` + (unlocked ? `<div class="stars">${starsHtml(stars)}</div>` : `<div class="lock">${icon('lock')}</div>`);
    c.addEventListener('click', () => { sound.unlock(); if (!unlocked) { sound.bad(); toast('前のステージをクリアすると挑戦できます', 'info'); return; } sound.click(); play.open({ mode: 'mission', ms }); });
    list.appendChild(c);
  });
  $('mission-total').textContent = `★ ${totalStars()}/24`;
}

const SANDBOX = [
  { id: 's3', title: 'トンネル前の渋滞', d: '容量を超える交通量。ピーク分散・速度制限・自動運転車', extra: ['demandMul'] },
  { id: 's4', title: '合流部', d: 'ランプメーター・合流の交通整理', extra: ['demandMul'] },
  { id: 's5', title: 'サグ部（上り坂）', d: '速度回復の呼びかけ・車線利用', extra: ['demandMul'] },
  { id: 's6', title: '車線減少', d: 'ファスナー合流・早めの案内・路肩活用', extra: ['demandMul'] },
  { id: 's7', title: '信号交差点', d: 'サイクル長と青時間の配分', extra: ['demandMul'] },
  { id: 's8', title: '都市高速（複合）', d: 'すべての施策を組み合わせる', extra: ['demandMul', 'avDamp'] },
];
function renderSandbox() {
  const list = $('sandbox-list'); list.innerHTML = '';
  for (const sb of SANDBOX) {
    const c = el('button', 'card', `<div class="no">SCENARIO</div><h3>${sb.title}</h3><p>${sb.d}</p>`);
    c.addEventListener('click', () => { sound.unlock(); sound.click(); play.open({ mode: 'sandbox', sb }); });
    list.appendChild(c);
  }
}

function renderLearn(tab) {
  document.querySelectorAll('#learn-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  const body = $('learn-body'); body.innerHTML = ''; body.scrollTop = 0;
  if (tab === 'how') {
    for (const s of LEARN) { const sec = el('div', 'learn-sec', `<h2>${s.h}</h2>` + s.p.map((p) => `<p>${p}</p>`).join('')); body.appendChild(sec); }
  } else {
    const got = Object.keys(data.trivia).length;
    body.appendChild(el('p', 'lead', `集めた豆知識 ${got} / ${TRIVIA.length}`));
    for (const t of TRIVIA) {
      const on = !!data.trivia[t.id];
      body.appendChild(el('div', 'trivia' + (on ? '' : ' locked'), on ? `<h3>${t.title}</h3><p>${t.text}</p>` : `<h3>？？？</h3><p>入手方法：${t.hint}</p>`));
    }
  }
}
$('learn-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { sound.click(); renderLearn(b.dataset.t); } });

function renderRecords() {
  const body = $('records-body'); body.innerHTML = '';
  const q = data.quiz;
  const cleared = MISSIONS.filter((m) => SAVE.stageStars(m.id) > 0).length;
  body.appendChild(el('div', 'rec-grid', `
    <div><b>${data.experiments}</b>実験回数</div>
    <div><b>★${totalStars()}</b>獲得スター（24）</div>
    <div><b>${cleared}/8</b>クリアしたステージ</div>
    <div><b>${q.best}</b>原因クイズ 最高連続正解</div>
    <div><b>${q.played ? Math.round((q.correct / q.played) * 100) : 0}%</b>クイズ正解率（${q.played}問）</div>
    <div><b>${Object.keys(data.trivia).length}/${TRIVIA.length}</b>豆知識</div>`));
  body.appendChild(el('div', 'sec-h', 'ステージ別ベスト'));
  const tb = el('table', 'res');
  tb.innerHTML = '<tr><th>ステージ</th><th>★</th><th>最高改善率</th><th>挑戦</th></tr>' + MISSIONS.map((m) => { const s = data.stages[m.id] || {}; return `<tr><td>${m.no}. ${m.title}</td><td>${'★'.repeat(s.stars || 0) || '-'}</td><td>${s.bestImp != null ? s.bestImp.toFixed(0) + '%' : '-'}</td><td>${s.plays || 0}</td></tr>`; }).join('');
  body.appendChild(tb);
  body.appendChild(el('div', 'sec-h', '実績'));
  for (const a of ACHIEVEMENTS) body.appendChild(el('div', 'ach' + (data.achievements[a.id] ? ' on' : ''), `<div class="m">${icon('star')}</div><div><b>${a.name}</b><small>${a.desc}</small></div>`));
  const rb = el('button', 'btn ghost', 'セーブデータを消去'); rb.style.marginTop = '16px';
  rb.addEventListener('click', () => { if (confirm('すべての記録を消去しますか？')) { SAVE.reset(); location.reload(); } });
  body.appendChild(rb);
}

// ---------------------------------------------------------------- toasts / unlocks
let lastToast = {};
function toast(text, kind = '', key = text, gap = 3000) {
  const now = performance.now();
  if (lastToast[key] && now - lastToast[key] < gap) return;
  lastToast[key] = now;
  const t = el('div', 'toast ' + kind, text);
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 2700);
}
function trivia(id) {
  if (SAVE.unlock('trivia', id)) { const t = TRIVIA.find((x) => x.id === id); toast(`豆知識「${t.title}」を手に入れた！`, 'good', 'tr' + id, 0); sound.good(); }
}
function achieve(id) {
  if (SAVE.unlock('ach', id)) { const a = ACHIEVEMENTS.find((x) => x.id === id); toast(`実績「${a.name}」`, 'good', 'ac' + id, 0); }
}
function experiment() {
  data.experiments++; SAVE.save();
  if (data.experiments >= 10) achieve('exp10');
  if (data.experiments >= 50) achieve('exp50');
}

// ---------------------------------------------------------------- modal
function modal(html, onReady) {
  $('modal-card').innerHTML = html;
  $('modal').classList.add('on');
  if (onReady) onReady($('modal-card'));
}
function closeModal() { $('modal').classList.remove('on'); }

// ================================================================ PLAY VIEW
class Play {
  constructor() {
    this.r = new Renderer($('road'));
    this.st = new SpaceTime(360, 200);
    this.paused = false; this.speed = 1; this.acc = 0; this.last = 0; this.raf = 0;
    this.graph = 'st'; this.series = []; this.baseSeries = [];
    this.bindUi();
    this.bindPointer();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 200));
    document.addEventListener('visibilitychange', () => { this.last = performance.now(); });
  }

  // ---------------------------------------------------------- open a mode
  open(cfg) {
    sound.unlock();
    this.cfg = cfg; this.mode = cfg.mode;
    this.cf = null; this.run = null; this.twin = null; this.quiz = null; this.tut = null;
    this.selected = 0; this.r.opts.selected = 0; this.r.opts.follow = false; this.r.opts.highlight = null;
    this.r.opts.night = data.night;
    this.series = []; this.baseSeries = [];
    $('vcard').classList.remove('on'); $('guide').classList.remove('on'); $('quiz-ans').classList.remove('on');
    $('p-progress').style.display = 'none'; $('p-cmp').style.display = 'none';
    $('toasts').innerHTML = '';
    show('play');
    this.r.zoom = 1; this.r.panX = 0; this.r.panY = 0;
    if (this.mode === 'lab' || this.mode === 'tutorial') this.openLab();
    else if (this.mode === 'mission') this.openMission(cfg.ms, cfg.seed);
    else if (this.mode === 'sandbox') this.openSandbox(cfg.sb);
    else if (this.mode === 'quiz') this.openQuiz(0);
    $('p-sound').innerHTML = icon(data.sound ? 'sound' : 'mute');
    $('t-night').classList.toggle('on', data.night);
    this.setView(this.mode === 'quiz' ? 'real' : this.r.opts.mode || 'real');
    this.onResize();
    this.start();
  }

  setSim(sim) {
    this.sim = sim;
    this.r.setSim(sim);
    this.st.reset();
    this.lastSer = null;
    this.r.relayout();
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now) => { this.raf = requestAnimationFrame(loop); this.tick(now); };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }

  // ---------------------------------------------------------- lab / tutorial
  openLab(keep) {
    const v = keep || { count: 22, v0: 50, T: 1.0, lag: 0.7, truck: 0, av: 0, avDamp: true };
    const sim = new Sim(ringScenario({ n: v.count, seed: 7 + Math.floor(Math.random() * 1000), v0: v.v0, T: v.T, lag: v.lag, truck: v.truck / 100, av: v.av / 100 }));
    sim.pol.avDamp = v.avDamp;
    this.labVals = v;
    this.setSim(sim);
    $('p-title').textContent = this.mode === 'tutorial' ? 'はじめての実験' : '渋滞の実験室';
    $('p-sub').textContent = `円形道路 ${Math.round(sim.roads[0].length)} m・1車線`;
    this.paused = false;
    this.buildControls(['count', 'v0', 'T', 'lag', 'truck', 'av', 'avDamp']);
    this.actions([]);
    this.expand(keep ? !!this.sheetOpen : false);
    this.labStats = { minSpeed: 999 };
    if (this.mode === 'tutorial') this.tutorial(0);
  }

  tutorial(step) {
    this.tut = { step, t: this.sim.st.t };
    const g = $('guide');
    const set = (html, btns) => {
      g.innerHTML = html + (btns ? `<div class="g-actions">${btns}</div>` : '');
      g.classList.add('on');
    };
    if (step === 0) set('<b>1台だけブレーキをかけてみよう。</b><br>道路を走っている車を、どれか1台タップしてください。', '<button class="btn ghost" id="g-skip">スキップ</button>');
    if (step === 1) set('この車の情報です。<b>「ブレーキ」ボタンを長押し</b>すると、この車だけが減速します。1〜2秒押してから離してみよう。');
    if (step === 2) set('後ろの車を見てください。<b>ブレーキランプ</b>が次々に後ろへ伝わっていきます…');
    const sk = $('g-skip');
    if (sk) sk.onclick = () => { data.tutorialDone = true; SAVE.save(); g.classList.remove('on'); this.mode = 'lab'; this.tut = null; $('p-title').textContent = '渋滞の実験室'; };
  }

  tutorialCheck() {
    const tu = this.tut; if (!tu || tu.step !== 2) return;
    const sim = this.sim;
    const ch = this.playerChain();
    const elapsed = sim.st.t - tu.t;
    const jam = sim.st.jam.on || this.labStats.minSpeed < 15;
    if ((jam && elapsed > 8) || elapsed > 28) {
      tu.step = 3;
      const g = $('guide');
      if (jam && ch >= 5) {
        g.innerHTML = `<div style="font-size:18px;font-weight:900;margin-bottom:4px">渋滞は、事故がなくても発生する。</div>あなたのブレーキは <b>${ch}台</b> の車に伝わり、${this.labStats.minSpeed < 3 ? '止まってしまう車まで出ました' : 'ノロノロ運転の列が生まれました'}。後ろの車は反応が遅れる分、前の車より強くブレーキを踏むので、減速がどんどん大きくなるのです。<div class="g-actions"><button class="btn ghost" id="g-wave">渋滞の波を見る</button><button class="btn primary" id="g-ok">自由に実験する</button></div>`;
        trivia('chain'); trivia('phantom'); achieve('first_jam');
      } else {
        g.innerHTML = `<b>今回は渋滞になりませんでした。</b><br>ブレーキは${ch}台に伝わりましたが、車間に余裕があったため、後ろの車ほど減速が小さくなり、波は吸収されました。<b>車の台数を増やして</b>、車間を詰めるともう一度試してみよう。<div class="g-actions"><button class="btn primary" id="g-more">26台にして再挑戦</button><button class="btn ghost" id="g-ok">自由に実験する</button></div>`;
      }
      g.classList.add('on');
      const done = () => { data.tutorialDone = true; SAVE.save(); g.classList.remove('on'); this.mode = 'lab'; this.tut = null; $('p-title').textContent = '渋滞の実験室'; };
      const ok = $('g-ok'); if (ok) ok.onclick = () => { sound.click(); done(); };
      const wv = $('g-wave'); if (wv) wv.onclick = () => { sound.click(); done(); this.setView('wave'); toast('赤い矢印：渋滞の波の進む向き', 'info'); };
      const mo = $('g-more'); if (mo) mo.onclick = () => { sound.click(); const v = { ...this.labVals, count: 26 }; this.openLab(v); this.tutorial(0); };
    }
  }

  // ---------------------------------------------------------- missions
  openMission(ms, seed, n) {
    this.ms = ms;
    this.run = new MissionRun(ms, { seed, n });
    this.seed = seed;
    this.setSim(this.run.sim);
    $('p-title').textContent = `STAGE ${ms.no}  ${ms.title}`;
    $('p-sub').textContent = ms.goal;
    this.paused = true;
    this.expand(false);
    this.buildControls(ms.controls);
    this.actions([]);
    this.labStats = { minSpeed: 999 };
    this.briefing();
  }

  briefing() {
    const ms = this.ms;
    const best = SAVE.stageStars(ms.id);
    const ctl = ms.controls.length ? `<p style="font-size:12.5px;color:var(--sub)">使える施策：${ms.controls.map((c) => CONTROLS[c].label).join('・')}</p>` : '';
    modal(`<div class="kicker">STAGE ${ms.no}${this.seed ? '・別条件' : ''}</div><h2>${ms.title}</h2><p>${ms.brief}</p><div class="goal">🎯 ${ms.goal}</div>
      <ul>${ms.starText.map((t, i) => `<li>${icon('star').repeat(i + 1)} ${t}</li>`).join('')}</ul>${ctl}
      ${ms.kind === 'flow' ? '<p style="font-size:12px;color:var(--sub)">裏で「対策なし」の道路を同じ条件・同じ乱数で同時に計算し、その結果と比べて採点します。測定時間 ' + ms.dur + ' 秒（シミュレーション時間）。</p>' : ''}
      ${best ? `<p style="font-size:12px;color:var(--yellow)">ベスト ★${best}</p>` : ''}
      <div class="m-actions"><button class="btn ghost" id="m-back">もどる</button><button class="btn primary" id="m-go">${ms.controls.length ? '施策を決める' : 'スタート'}</button></div>`, (c) => {
      c.querySelector('#m-back').onclick = () => { sound.click(); closeModal(); back(); };
      c.querySelector('#m-go').onclick = () => { sound.click(); closeModal(); this.prestart(); };
    });
  }

  prestart() {
    const ms = this.ms;
    if (!ms.controls.length) { this.beginMission(); return; }
    // let the player set measures first; the scene is paused at the start state
    this.expand(true); this.tab('ctl');
    const label = ms.mode === 'phantom' ? '観察スタート' : '測定スタート';
    this.actions([{ label, cls: 'primary', fn: () => this.beginMission() }]);
    $('guide').innerHTML = ms.mode === 'phantom' ? '下の「条件」で<b>車両台数</b>を決めてから「観察スタート」。ブレーキ操作はできません。' : '下の「条件」で施策を選んでから「測定スタート」。測定中も施策は変更できます。';
    $('guide').classList.add('on');
    setTimeout(() => $('guide').classList.remove('on'), 5000);
  }

  beginMission() {
    sound.click();
    $('guide').classList.remove('on');
    const ms = this.ms;
    this.run.start();
    if (this.run.twin) this.twin = this.run.twin;
    this.paused = false;
    this.expand(false);
    experiment();
    $('p-progress').style.display = 'block';
    if (ms.kind === 'flow') {
      $('p-cmp').style.display = 'block';
      this.actions([{ label: '結果まで早送り', icon: 'ff', fn: () => this.fastForward() }]);
    } else this.actions([]);
    if (ms.mode === 'brake') { $('guide').innerHTML = '車を1台タップして、<b>ブレーキを長押し</b>！'; $('guide').classList.add('on'); setTimeout(() => $('guide').classList.remove('on'), 4000); }
    if (ms.mode === 'phantom') this.lockControls(true);
  }

  fastForward() {
    if (!this.run || this.run.done) return;
    this.paused = true;
    const btn = $('action-row').querySelector('button'); if (btn) { btn.disabled = true; btn.textContent = '計算中…'; }
    const chunk = () => {
      const t0 = performance.now();
      while (!this.run.done && performance.now() - t0 < 30) { this.stepAll(); }
      if (!this.run.done) setTimeout(chunk, 0);
    };
    chunk();
  }

  missionDone() {
    const ms = this.ms, res = this.run.result;
    this.paused = true;
    $('vcard').classList.remove('on');
    const prev = SAVE.stageStars(ms.id);
    SAVE.recordStage(ms.id, res.stars, res.imp ?? null);
    if (res.stars > 0) sound.clear(); else sound.bad();
    // unlocks
    const tr = { s3: 'peak', s4: 'merge', s5: 'sag', s6: 'lanedrop', s7: 'signal', s8: 'city' }[ms.id];
    if (tr && res.stars > 0) trivia(tr);
    if (ms.kind === 'flow' && res.stars >= 2) trivia('capdrop');
    if (ms.id === 's1' && this.run.ring.playerChain >= 10) { trivia('chain'); achieve('chain10'); }
    if (ms.id === 's2' && res.stars > 0) trivia('phantom');
    if (MISSIONS.every((m) => SAVE.stageStars(m.id) > 0)) achieve('stars8');
    if (totalStars() >= 24) achieve('stars24');
    const idx = MISSIONS.indexOf(ms);
    const next = MISSIONS[idx + 1];
    const imp = res.imp;
    const rows = res.rows.map((r) => `<tr><td>${r.label}</td><td class="${r.better === undefined ? '' : r.better ? 'good' : 'bad'}">${r.mine}</td>${r.base !== undefined ? `<td>${r.base}</td>` : ''}</tr>`).join('');
    const head = res.rows[0].base !== undefined ? '<tr><th></th><th>あなた</th><th>対策なし</th></tr>' : '';
    modal(`<div class="kicker">STAGE ${ms.no} 結果</div><h2>${res.stars > 0 ? 'ミッション達成！' : 'もう一歩！'}</h2>
      <div class="big-stars">${[0, 1, 2].map((i) => `<svg data-i="${i}"><use href="#i-star"/></svg>`).join('')}</div>
      ${imp != null ? `<div class="imp">対策なしと比べて <b class="${imp < 0 ? 'neg' : ''}">${imp >= 0 ? '−' : '+'}${Math.abs(imp).toFixed(1)}%</b> ${ms.metric === 'mainDelay' ? '（本線の遅れ）' : '（遅れ時間）'}</div>` : ''}
      ${res.note ? `<p style="color:var(--orange);font-size:13px;text-align:center">${res.note}</p>` : ''}
      <table class="res">${head}${rows}</table>
      <div class="lesson">💡 ${ms.lesson}</div>
      ${res.stars > prev ? '<p style="text-align:center;color:var(--yellow);font-weight:800">ベスト更新！</p>' : ''}
      <div class="m-actions"><button class="btn ghost" id="r-again">もう一度</button><button class="btn ghost" id="r-var">別の条件で</button>${next && res.stars > 0 ? '<button class="btn primary" id="r-next">次のステージ</button>' : '<button class="btn primary" id="r-list">ステージ一覧</button>'}</div>`, (c) => {
      c.querySelectorAll('.big-stars svg').forEach((s, i) => { if (i < res.stars) setTimeout(() => { s.classList.add('on'); sound.star(i); }, 350 + i * 320); });
      c.querySelector('#r-again').onclick = () => { sound.click(); closeModal(); this.openMission(ms, this.seed); };
      c.querySelector('#r-var').onclick = () => { sound.click(); closeModal(); this.openMission(ms, 1 + Math.floor(Math.random() * 99999)); };
      const nx = c.querySelector('#r-next'); if (nx) nx.onclick = () => { sound.click(); closeModal(); this.openMission(next); };
      const ls = c.querySelector('#r-list'); if (ls) ls.onclick = () => { sound.click(); closeModal(); back(); };
    });
  }

  // ---------------------------------------------------------- sandbox
  openSandbox(sb) {
    const ms = MISSIONS.find((m) => m.id === sb.id);
    this.ms = ms; this.sb = sb;
    const run = new MissionRun({ ...ms, dur: 1e9 });
    run.start();
    this.run = run; this.twin = run.twin;
    this.setSim(run.sim);
    $('p-title').textContent = sb.title;
    $('p-sub').textContent = '対策あり と 対策なし（同条件）を同時に計算中';
    this.paused = false;
    this.buildControls([...ms.controls, ...sb.extra.filter((x) => !ms.controls.includes(x))]);
    this.expand(true);
    this.actions([{ label: '比較をリセット', fn: () => this.resetCompare() }]);
    $('p-cmp').style.display = 'block';
    experiment();
  }

  resetCompare() {
    sound.click();
    const run = this.run;
    run.twin = run.sim.clone(); run.resetTwinPolicies();
    run.sim.resetMeasure(); run.twin.resetMeasure();
    this.twin = run.twin; this.series = []; this.baseSeries = [];
    toast('ここから比較し直します', 'info');
  }

  // ---------------------------------------------------------- quiz
  openQuiz(round) {
    if (round === 0) { this.qSession = { seed: Math.floor(Math.random() * 1e6), streak: 0, n: 0, ok: 0 }; }
    const q = makeQuiz(round, this.qSession.seed);
    this.quiz = { ...q, round, state: 'watch' };
    const sim = new Sim(q.def);
    for (let i = 0; i < Math.round(q.warm / DT); i++) sim.step();
    sim.st.events = []; sim.st.jam.first = null;
    sim.resetMeasure();
    this.quiz.t0 = sim.st.t;
    this.setSim(sim);
    $('p-title').textContent = `原因を見抜け！ 第${round + 1}問`;
    $('p-sub').textContent = `連続正解 ${this.qSession.streak}・正解 ${this.qSession.ok}/${this.qSession.n}`;
    this.paused = false; this.setSpeed(2);
    this.buildControls([]);
    this.expand(false);
    $('pane-ctl').innerHTML = '<p class="note">渋滞が起きる様子をよく観察しよう。道路の形・坂・合流・信号・止まっている車…。渋滞が始まってしばらくすると、答えの選択肢が出ます。</p>';
    this.actions([{ label: 'もう答える', fn: () => this.quizAsk() }]);
    this.setView('real');
  }

  quizTick() {
    const q = this.quiz; if (!q || q.state !== 'watch') return;
    const sim = this.sim, el2 = sim.st.t - q.t0;
    const first = sim.st.jam.first;
    if ((first && sim.st.t - first.t > 25) || el2 > 170) this.quizAsk();
  }

  quizAsk() {
    const q = this.quiz; if (!q || q.state !== 'watch') return;
    q.state = 'ask';
    this.paused = true; this.syncPlay();
    const box = $('quiz-ans');
    box.innerHTML = '<div class="q">この渋滞の原因は？</div>' + q.options.map((o) => `<button class="btn" data-k="${o.k}">${o.label}</button>`).join('');
    box.classList.add('on');
    this.actions([]);
    box.querySelectorAll('button').forEach((b) => b.onclick = () => this.quizAnswer(b.dataset.k, b));
  }

  quizAnswer(k, btn) {
    const q = this.quiz; if (q.state !== 'ask') return;
    q.state = 'reveal';
    const ok = k === q.kind;
    const S = this.qSession; S.n++;
    data.quiz.played++;
    if (ok) { S.ok++; S.streak++; data.quiz.correct++; sound.good(); } else { S.streak = 0; sound.bad(); }
    data.quiz.best = Math.max(data.quiz.best, S.streak); SAVE.save();
    if (S.streak >= 5) achieve('quiz5');
    $('quiz-ans').querySelectorAll('button').forEach((b) => { if (b.dataset.k === q.kind) b.classList.add('right'); else if (b === btn) b.classList.add('wrong'); b.disabled = true; });
    // highlight where the jam started
    const f = this.sim.st.jam.first;
    const spot = f ? { road: f.road, s: f.s } : q.info.road != null ? { road: q.info.road, s: q.info.s } : { road: 0, s: 0 };
    const tt = f ? `ここから渋滞が始まった（${Math.max(0, f.t - q.t0).toFixed(0)}秒後）` : '渋滞の起点';
    this.r.opts.highlight = { ...spot, text: tt };
    this.focus(spot);
    setTimeout(() => {
      $('quiz-ans').classList.remove('on');
      const lines = EXPLAIN[q.kind];
      const g = $('guide');
      g.innerHTML = `<b>${ok ? '正解！' : '残念…'}</b> 原因は「${CAUSES[q.kind].label}」<div id="q-exp" style="margin-top:6px"></div><div class="g-actions"><button class="btn ghost" id="q-end">終わる</button><button class="btn primary" id="q-next">次の問題</button></div>`;
      g.classList.add('on');
      const ex = $('q-exp');
      lines.forEach((ln, i) => setTimeout(() => { if (ex) ex.appendChild(el('div', '', `${i + 1}. ${ln}`)); }, 300 + i * 1100));
      $('q-next').onclick = () => { sound.click(); g.classList.remove('on'); this.r.opts.highlight = null; this.openQuiz(q.round + 1); };
      $('q-end').onclick = () => { sound.click(); g.classList.remove('on'); back(); };
      this.paused = false; this.setSpeed(1);
    }, 900);
    $('p-sub').textContent = `連続正解 ${S.streak}・正解 ${S.ok}/${S.n}`;
  }

  focus(spot) {
    const geo = this.r.lay.geos[spot.road];
    if (!geo) return;
    const p = geo.path.at(Math.max(0, Math.min(geo.path.length, spot.s)));
    const b = this.r.lay.bounds;
    this.r.zoom = this.r.lay.kind === 'ring' ? 1.2 : 2.2;
    this.r.panX = p.x - (b.x0 + b.x1) / 2; this.r.panY = p.y - (b.y0 + b.y1) / 2;
    this.r.clampPan();
  }

  // ---------------------------------------------------------- controls panel
  buildControls(ids) {
    const pane = $('pane-ctl'); pane.innerHTML = '';
    this.ctlIds = ids;
    const sim = this.sim;
    const desc = {
      count: '台数が多いほど車間が詰まり、乱れが増幅しやすくなります。',
      v0: '運転手が出したい速度。',
      T: '前の車との「時間で測った車間」。短いほど容量は増えますが不安定に。',
      lag: '前の車の変化に反応してから実際に加減速するまでの遅れ。',
      truck: '大型車は長く、加速がゆるやかです。',
      av: '反応の遅れがなく、なめらかに追従する車の割合。',
      avDamp: '波を検知すると平均速度で走り、車間を緩衝材にします。',
      vsl: '合流・ボトルネックの上流の速度制限。',
      meter: 'ランプから本線へ入る車を信号で1台ずつ流します。本線は守られますがランプで待ち時間が発生。',
      mergeCare: '本線の車が早めに右へ譲り、合流車は加速車線で速度を合わせてから入ります。',
      zipper: '車線がなくなる直前まで両車線を使い、1台ずつ交互に合流。',
      advice: '車線減少のずっと手前から車線変更を案内します。',
      shoulder: '路肩を走行車線として使い、車線減少をなくします。安全のため70km/h制限。',
      sagInfo: '上り坂の手前で「速度回復」を呼びかけ、坂での減速を防ぎます。',
      keepLeft: '追越車線への集中を減らし、左車線も使ってもらいます。',
      peakSpread: '出発時刻をずらしてもらい、ピークの需要を平らにします（総台数は同じ）。',
      demandMul: '道路へ入ってくる車の量。',
      cycle: '青→黄→全赤を一巡する時間。',
      split: '東西の幹線に配分する青時間の割合（残りが南北）。',
    };
    if (!ids.length) { pane.appendChild(el('p', 'note', 'このステージで変えられる条件はありません。車をタップして操作しよう。')); }
    for (const id of ids) {
      const C = CONTROLS[id];
      const val = readControl(sim, id);
      if (C.toggle) {
        const row = el('div', 'tgl', `<div><span>${C.label}</span><small>${desc[id] || ''}</small></div><button class="sw ${val ? 'on' : ''}" aria-label="${C.label}"></button>`);
        const sw = row.querySelector('.sw');
        sw.onclick = () => { if (this.ctlLocked) return; sound.soft(); const v = !sw.classList.contains('on'); sw.classList.toggle('on', v); this.setControl(id, v); };
        pane.appendChild(row);
      } else if (C.options) {
        const row = el('div', 'ctl', `<div class="ctl-h">${C.label}<b>${C.options.find((o) => o[0] === val)?.[1] ?? val} ${C.unit && val ? C.unit : ''}</b></div><div class="ctl-d">${desc[id] || ''}</div><div class="opts">${C.options.map((o) => `<button data-v="${o[0]}" class="${o[0] === val ? 'on' : ''}">${o[1]}</button>`).join('')}</div>`);
        row.querySelectorAll('.opts button').forEach((b) => b.onclick = () => {
          if (this.ctlLocked) return;
          sound.soft();
          row.querySelectorAll('.opts button').forEach((x) => x.classList.toggle('on', x === b));
          const v = +b.dataset.v;
          row.querySelector('.ctl-h b').textContent = `${C.options.find((o) => o[0] === v)[1]} ${C.unit && v ? C.unit : ''}`;
          this.setControl(id, v);
        });
        pane.appendChild(row);
      } else {
        const row = el('div', 'ctl', `<div class="ctl-h">${C.label}<b><span>${val}</span> ${C.unit}</b></div><input type="range" min="${C.min}" max="${C.max}" step="${C.step}" value="${val}" aria-label="${C.label}"><div class="ctl-d">${desc[id] || ''}</div>`);
        const inp = row.querySelector('input'), out = row.querySelector('span');
        const paint = () => inp.style.setProperty('--p', ((inp.value - C.min) / (C.max - C.min)) * 100 + '%');
        paint();
        inp.oninput = () => { if (this.ctlLocked) { inp.value = readControl(this.sim, id); paint(); return; } out.textContent = inp.value; paint(); this.setControl(id, +inp.value, true); };
        inp.onchange = () => { this.setControl(id, +inp.value); };
        pane.appendChild(row);
      }
    }
    if (this.mode === 'lab' || this.mode === 'tutorial') this.presetUi(pane);
  }

  lockControls(on) { this.ctlLocked = on; $('pane-ctl').style.opacity = on ? 0.5 : 1; }

  setControl(id, v, live) {
    const sim = this.sim;
    // stage 2: the number of vehicles is chosen before the observation starts
    if (this.mode === 'mission' && this.ms.mode === 'phantom' && id === 'count') {
      if (live) return;
      this.run = new MissionRun(this.ms, { seed: this.seed, n: v });
      this.setSim(this.run.sim);
      return;
    }
    applyControl(sim, id, v);
    if (this.cf) applyControl(this.cf.twin, id, v);
    if (this.mode === 'lab' || this.mode === 'tutorial') {
      this.labVals = { ...this.labVals, [id]: v };
      if (id === 'truck' && v > 0) trivia('trucks');
      if (id === 'v0') this.labV0Lowered = v < 50;
    }
    if (id === 'zipper' && v) trivia('zipper');
  }

  presetUi(pane) {
    pane.appendChild(el('div', 'sec-h', '実験ノート（プリセット）'));
    const row = el('div', 'preset-row');
    data.presets.forEach((p, i) => {
      const b = el('button', 'btn ghost', p.name);
      b.onclick = () => { sound.click(); this.openLab({ ...this.labVals, ...p.values }); toast(`「${p.name}」を読み込みました`, 'info'); };
      b.oncontextmenu = (e) => { e.preventDefault(); if (confirm(`「${p.name}」を削除しますか？`)) { data.presets.splice(i, 1); SAVE.save(); this.buildControls(this.ctlIds); } };
      row.appendChild(b);
    });
    const add = el('button', 'btn', '＋ 今の条件を保存');
    add.onclick = () => {
      sound.click();
      const name = prompt('名前をつけてください', `実験${data.presets.length + 1}`);
      if (!name) return;
      const values = {};
      for (const id of ['count', 'v0', 'T', 'lag', 'truck', 'av', 'avDamp']) values[id] = readControl(this.sim, id);
      data.presets.push({ name: name.slice(0, 12), values });
      if (data.presets.length > 8) data.presets.shift();
      SAVE.save(); achieve('preset'); this.buildControls(this.ctlIds);
    };
    row.appendChild(add);
    pane.appendChild(row);
    pane.appendChild(el('p', 'note', '長押し（右クリック）でプリセットを削除。'));
  }

  actions(list) {
    const row = $('action-row'); row.innerHTML = '';
    for (const a of list) {
      const b = el('button', 'btn ' + (a.cls || ''), (a.icon ? `${icon(a.icon)} ` : '') + a.label);
      b.style.display = 'flex'; b.style.alignItems = 'center'; b.style.justifyContent = 'center'; b.style.gap = '6px';
      b.onclick = () => { sound.click(); a.fn(); };
      row.appendChild(b);
    }
    this.onResize();
  }

  // ---------------------------------------------------------- UI bindings
  bindUi() {
    $('p-back').onclick = () => { sound.click(); this.leave(); };
    $('p-sound').onclick = () => toggleSound();
    $('t-play').onclick = () => { sound.click(); if (this.quiz && this.quiz.state === 'ask') return; if (this.run && !this.run.started && this.mode === 'mission') return; this.paused = !this.paused; this.syncPlay(); };
    $('t-speed').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; sound.click(); this.setSpeed(+b.dataset.s); });
    $('t-reset').onclick = () => { sound.click(); this.reset(); };
    $('t-view').onclick = () => { sound.click(); const order = ['real', 'speed', 'wave']; this.setView(order[(order.indexOf(this.r.opts.mode) + 1) % 3]); };
    $('t-night').onclick = () => { sound.click(); data.night = !data.night; SAVE.save(); this.r.opts.night = data.night; $('t-night').classList.toggle('on', data.night); if (data.night) achieve('night'); };
    $('z-in').onclick = () => { this.r.zoom *= 1.4; this.r.clampPan(); };
    $('z-out').onclick = () => { this.r.zoom /= 1.4; this.r.clampPan(); };
    $('z-fit').onclick = () => { this.r.zoom = 1; this.r.panX = 0; this.r.panY = 0; this.r.opts.follow = false; };
    $('sheet-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { sound.click(); this.tab(b.dataset.t); } });
    $('graph-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; sound.click(); this.graph = b.dataset.g; $('graph-seg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); this.noteGraph(); });
    // sheet: swipe or tap the handle
    const hd = $('handle'); let y0 = null;
    hd.addEventListener('pointerdown', (e) => { y0 = e.clientY; hd.setPointerCapture(e.pointerId); });
    hd.addEventListener('pointerup', (e) => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; if (dy > 25) this.expand(false); else if (dy < -25) this.expand(true); else this.expand($('sheet').classList.contains('collapsed')); });
  }

  expand(on) { this.sheetOpen = on; $('sheet').classList.toggle('collapsed', !on); setTimeout(() => this.onResize(), 30); }

  tab(t) {
    document.querySelectorAll('#sheet-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    document.querySelectorAll('.sheet-body .pane').forEach((p) => p.classList.toggle('on', p.dataset.p === t));
    this.curTab = t;
    if (t === 'graph') { this.noteGraph(); setTimeout(() => this.onResize(), 0); }
  }

  noteGraph() {
    const n = $('graph-note');
    const g = this.graph;
    this.graphsSeen = this.graphsSeen || {}; this.graphsSeen[g] = true;
    if (g === 'st') { n.textContent = '横：時間、縦：道路上の位置（下が上流）。点は1台の車、色は速度。右下がりの赤い帯＝渋滞の波が後ろへ進んでいる証拠です。'; trivia('spacetime'); }
    if (g === 'fd') { n.textContent = '点：道路を区間に分けて測った密度と流率（Edieの定義）。点線：全員が同じ車間で走ったときの理論値。密度が高すぎると流率は下がります。'; trivia('fd'); }
    if (g === 'ts') n.textContent = this.twin ? '緑：あなたの道路の平均速度。橙の点線：同じ条件で対策をしなかった場合。' : '道路全体の平均速度の推移。';
    if (this.graphsSeen.st && this.graphsSeen.fd) achieve('graphs');
  }

  setSpeed(s) {
    this.speed = s;
    $('t-speed').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.s === s));
  }

  setView(m) {
    this.r.opts.mode = m;
    $('t-view-l').textContent = { real: 'リアル', speed: '速度', wave: '渋滞波' }[m];
    $('legend').classList.toggle('on', m !== 'real' && !$('vcard').classList.contains('on'));
    $('legend').innerHTML = m === 'wave' ? '<span>遅い</span><i></i><span>速い</span>　<span style="color:#ff6b7a">━ 渋滞の波</span>' : '<span>遅い</span><i></i><span>速い</span>';
  }

  syncPlay() { $('t-play').innerHTML = icon(this.paused ? 'play' : 'pause'); }

  reset() {
    if (this.mode === 'lab' || this.mode === 'tutorial') { this.openLab({ ...this.labVals, count: readControl(this.sim, 'count') }); experiment(); if (this.mode === 'tutorial') this.tutorial(0); toast('リセットしました', 'info'); }
    else if (this.mode === 'mission') this.openMission(this.ms, this.seed);
    else if (this.mode === 'sandbox') this.openSandbox(this.sb);
    else if (this.mode === 'quiz') this.openQuiz(this.quiz.round);
    this.syncPlay();
  }

  leave() {
    this.stop(); closeModal();
    $('guide').classList.remove('on'); $('quiz-ans').classList.remove('on');
    sound.ambience(0, 0);
    back();
  }

  onResize() {
    this.r.resize();
    const g = $('graph'), r = g.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (r.width > 0) { g.width = Math.round(r.width * dpr); g.height = Math.round(r.height * dpr); }
  }

  // ---------------------------------------------------------- pointer: tap, pan, pinch
  bindPointer() {
    const cv = $('road');
    const pts = new Map();
    let start = null, moved = false, pinch = null;
    cv.addEventListener('pointerdown', (e) => {
      sound.unlock();
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, px: this.r.panX, py: this.r.panY }; moved = false; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.r.zoom }; moved = true; }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        this.r.zoom = pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d; this.r.clampPan();
      } else if (pts.size === 1 && start) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 8) moved = true;
        if (moved && this.r.zoom > 1.02) {
          const s = this.r.view().s;
          this.r.panX = start.px - dx / s; this.r.panY = start.py - dy / s; this.r.opts.follow = false; this.r.clampPan();
        }
      }
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0 && start && !moved) {
        const rc = cv.getBoundingClientRect();
        this.tap(e.clientX - rc.left, e.clientY - rc.top);
      }
      if (pts.size === 0) start = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.r.zoom *= e.deltaY < 0 ? 1.12 : 1 / 1.12; this.r.clampPan(); }, { passive: false });
  }

  tap(x, y) {
    if (this.quiz && this.quiz.state === 'ask') return;
    const v = this.r.pick(x, y);
    if (v) { sound.soft(); this.select(v.id); }
    else if (this.selected) this.select(0);
  }

  select(id) {
    this.selected = id; this.r.opts.selected = id;
    const card = $('vcard');
    if (!id) { card.classList.remove('on'); this.r.opts.follow = false; this.setView(this.r.opts.mode); return; }
    card.classList.add('on'); $('legend').classList.remove('on');
    $('guide').classList.toggle('on', !!this.tut && this.tut.step < 3 && false);
    const noBrake = this.mode === 'quiz' || (this.mode === 'mission' && this.ms.noBrake);
    card.innerHTML = `<div class="vc-top"><b id="vc-name"></b><button class="x" id="vc-x" aria-label="閉じる">×</button></div><div class="vc-grid" id="vc-grid"></div>
      <div class="vc-actions">${noBrake ? '' : '<button class="btn brake-btn" id="vc-brake">ブレーキ（長押し）</button>'}<button class="btn" id="vc-style">運転手を変更</button><button class="btn" id="vc-av">協調車にする</button><button class="btn ghost" id="vc-follow">${icon('follow')}</button></div>`;
    $('vc-x').onclick = () => { sound.click(); this.select(0); };
    const bb = $('vc-brake');
    if (bb) {
      const down = (e) => { e.preventDefault(); bb.classList.add('held'); this.brake(true); };
      const upf = () => { if (!bb.classList.contains('held')) return; bb.classList.remove('held'); this.brake(false); };
      bb.addEventListener('pointerdown', down); bb.addEventListener('pointerup', upf); bb.addEventListener('pointerleave', upf); bb.addEventListener('pointercancel', upf);
      bb.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    $('vc-style').onclick = () => {
      sound.click();
      const v = this.sim.st.vehicles.find((x) => x.id === this.selected); if (!v) return;
      const order = ['cautious', 'normal', 'aggressive'];
      const next = order[(order.indexOf(v.style) + 1) % 3] || 'normal';
      this.sim.input({ type: 'style', id: v.id, style: next });
      toast(`運転手：${STYLES[next].name}`, 'info', 'style', 0);
    };
    $('vc-av').onclick = () => { sound.click(); const v = this.sim.st.vehicles.find((x) => x.id === this.selected); if (!v) return; this.sim.input({ type: 'style', id: v.id, style: v.style === 'av' ? 'normal' : 'av' }); toast(v.style === 'av' ? '人間の運転手に戻しました' : '協調自動運転車にしました', 'info', 'av', 0); };
    $('vc-follow').onclick = () => { sound.click(); this.r.opts.follow = !this.r.opts.follow; if (this.r.opts.follow && this.r.zoom < 2) this.r.zoom = 2.5; $('vc-follow').classList.toggle('on', this.r.opts.follow); };
    this.updateCard();
    if (this.tut && this.tut.step === 0) this.tutorial(1);
  }

  brake(on) {
    const id = this.selected; if (!id) return;
    if (on) {
      sound.brake();
      // lab: remember the world without this brake to measure its impact
      if ((this.mode === 'lab' || this.mode === 'tutorial') && !this.cf) {
        const twin = this.sim.clone();
        this.cf = { twin, t0: this.sim.st.t, d0: this.sim.st.m.dist, d0t: twin.st.m.dist, chain: 0, jam: 0, vt: 0, n: 0 };
        experiment();
      }
      if (this.run) this.run.noteBrake();
      this.sim.input({ type: 'brake', id, dec: 3.5 });
      this.labStats.minSpeed = 999;
    } else {
      this.sim.input({ type: 'release', id });
      if (this.tut && this.tut.step === 1) this.tutorial(2);
    }
  }

  playerChain() {
    let best = 0;
    for (const k in this.sim.st.chains) { const c = this.sim.st.chains[k]; if (c.player) best = Math.max(best, c.size); }
    return best;
  }

  updateCard() {
    if (!this.selected) return;
    const v = this.sim.st.vehicles.find((x) => x.id === this.selected);
    if (!v) { this.select(0); return; }
    const gap = v.ahead && v.ahead.veh ? v.ahead.gap : null;
    $('vc-name').textContent = `#${v.id} ${CLASSES[v.cls].name}・${STYLES[v.style].name}`;
    const state = v.force > 0 ? 'ブレーキ中(操作)' : v.a < -3 ? '急ブレーキ' : v.light ? 'ブレーキ' : v.a > 0.2 ? '加速' : '巡航';
    $('vc-grid').innerHTML = `<div><b>${fmt(v.v * 3.6)}</b>km/h</div><div><b>${fmt(v.a, 1)}</b>加速度 m/s²</div><div><b>${gap != null && gap < 999 ? fmt(gap) : '—'}</b>車間 m</div><div><b style="font-size:13px;color:${v.light ? '#ff6b7a' : '#3ddc84'}">${state}</b>状態</div>`;
    const av = $('vc-av'); if (av) av.textContent = v.style === 'av' ? '人間に戻す' : '協調車にする';
  }

  // ---------------------------------------------------------- simulation loop
  stepAll() {
    if (this.run) this.run.step(); else this.sim.step();
    if (this.cf) this.cf.twin.step();
    this.st.sample(this.sim, 0);
    const t = this.sim.st.t;
    if (this.lastSer == null || t - this.lastSer >= 1 || t < this.lastSer) {
      this.lastSer = t;
      this.series.push([t, this.sim.snapshot().v]);
      if (this.twin) this.baseSeries.push([t, this.twin.snapshot().v]);
      if (this.series.length > 600) { this.series.shift(); if (this.baseSeries.length > 600) this.baseSeries.shift(); }
    }
    if (this.labStats && this.sim.def.kind === 'ring') {
      for (const v of this.sim.st.vehicles) if (!v.mark) this.labStats.minSpeed = Math.min(this.labStats.minSpeed, v.v * 3.6);
    }
  }

  tick(now) {
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused && !$('modal').classList.contains('on')) {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= DT && n < 40) { this.stepAll(); this.acc -= DT; n++; if (this.run && this.run.done) break; }
      if (n >= 40) this.acc = 0;
    }
    this.r.frame(this.paused ? 0 : this.acc / DT, now);
    this.events();
    if (!this.lastUi || now - this.lastUi > 200) { this.lastUi = now; this.ui(); }
    if (this.run && this.run.done && this.mode === 'mission' && !this.shownResult) { this.shownResult = true; this.missionDone(); }
    if (this.run && !this.run.done) this.shownResult = false;
    this.quizTick();
    this.tutorialCheck();
    this.cfCheck();
    this.syncPlay();
  }

  events() {
    const ev = this.sim.st.events;
    if (!ev.length) return;
    this.sim.st.events = [];
    if (this.quiz && this.quiz.state === 'watch') { for (const e of ev) if (e.type === 'jam') toast('渋滞発生！', '', 'jam', 6000); return; }
    for (const e of ev) {
      if (e.type === 'jam') {
        toast('渋滞発生！', '', 'jam', 6000); sound.alert();
        if (this.mode === 'lab') {
          achieve('first_jam');
          if (!this.cf && this.playerChain() < 3) trivia('phantom');
        }
      }
      if (e.type === 'jamclear') {
        toast('渋滞が解消しました', 'good', 'clear', 6000);
        if (this.mode === 'lab' && this.sim.p.av > 0) { trivia('av'); achieve('calm'); }
        if (this.mode === 'lab' && this.labV0Lowered) trivia('speed');
      }
      if (e.type === 'chain' && e.player) {
        toast(`ブレーキが ${e.size}台 に連鎖！`, '', 'chain' + e.size, 0); sound.chain();
        if (e.size >= 10) { achieve('chain10'); trivia('chain'); }
        if (e.size >= 20) achieve('chain20');
      }
    }
  }

  // impact report of the player's brake in the lab (vs. the world without it)
  cfCheck() {
    const cf = this.cf; if (!cf) return;
    const sim = this.sim;
    cf.chain = Math.max(cf.chain, this.playerChain());
    if (sim.cur) cf.jam = Math.max(cf.jam, sim.cur.jamVeh);
    if (sim.st.t - cf.t0 < 60) return;
    const dm = sim.st.m.dist - cf.d0, dt = cf.twin.st.m.dist - cf.d0t;
    const meanV = Math.max(1, dt / 60 / Math.max(1, sim.st.vehicles.length));
    const lost = (dt - dm) / meanV;
    this.cf = null;
    if (this.tut) return;
    toast(`あなたのブレーキの影響（60秒）：${cf.chain}台に連鎖・最大${cf.jam}台が渋滞・全体で${lost >= 0 ? '' : '−'}${Math.abs(lost).toFixed(0)}台·秒の遅れ`, 'info', 'cf', 0);
    const g = $('guide');
    if (!g.classList.contains('on')) {
      g.innerHTML = `<b>あなたのブレーキの影響</b>（ブレーキしなかった場合と同じ乱数で比較・60秒間）<br>連鎖したブレーキ：<b>${cf.chain}台</b>　最大渋滞：<b>${cf.jam}台</b><br>全体の遅れ：<b>${lost.toFixed(0)} 台·秒</b>${lost > 0 ? '（全員の到着がそれだけ遅れた合計）' : '（影響は吸収されました）'}<div class="g-actions"><button class="btn primary" id="cf-ok">OK</button></div>`;
      g.classList.add('on');
      $('cf-ok').onclick = () => { sound.click(); g.classList.remove('on'); };
    }
  }

  ui() {
    const sim = this.sim, s = sim.snapshot();
    const hud = $('hud');
    const ring = sim.def.kind === 'ring';
    const jamCls = s.jamVeh > 0 ? 'warn' : 'good';
    const delay = sim.st.m.delay;
    hud.innerHTML = `<div class="chip"><b>${fmt(s.v)}</b>平均km/h</div><div class="chip"><b>${fmt(s.k)}</b>密度 台/km</div><div class="chip"><b>${fmt(s.q)}</b>流率 台/時</div><div class="chip ${jamCls}"><b>${s.jamVeh}台</b>渋滞</div><div class="chip ${jamCls}"><b>${fmt(s.jamLen)}m</b>渋滞長</div><div class="chip"><b>${fmtVehMin(delay).replace(' ', '')}</b>累積遅延</div>`;
    // progress / comparison
    if (this.run && this.run.started && this.mode === 'mission') $('p-progress').firstElementChild.style.width = (this.run.progress() * 100).toFixed(1) + '%';
    if (this.twin && (this.mode === 'sandbox' || (this.mode === 'mission' && this.run.started))) {
      const m = sim.st.m, b = this.twin.st.m;
      const pick = (x) => (this.ms && this.ms.metric === 'mainDelay' ? x.rd[0] : x.delay);
      const imp = pick(b) > 5 ? ((pick(b) - pick(m)) / pick(b)) * 100 : 0;
      const rw = m.rampN ? ` ・ランプ待ち ${fmt(m.rampWait / m.rampN)}秒` : '';
      $('p-cmp').innerHTML = `対策なし比 <b style="color:${imp >= 0 ? 'var(--green)' : 'var(--orange)'}">${imp >= 0 ? '−' : '+'}${fmt(Math.abs(imp), 1)}%</b> 遅れ${rw}`;
    }
    if (this.mode === 'mission' && this.run.started && this.ms.kind === 'ring') {
      const r = this.run.ring;
      $('p-cmp').style.display = 'block';
      $('p-cmp').innerHTML = this.ms.mode === 'brake' ? `ブレーキの連鎖 <b>${r.playerChain}台</b>　残り ${fmt((1 - this.run.progress()) * this.ms.dur)}秒` : `観察中… 残り ${fmt((1 - this.run.progress()) * this.ms.dur)}秒　${r.jamT != null ? '<b style="color:var(--red)">渋滞発生！</b>' : ''}`;
    }
    this.updateCard();
    // info pane
    if (this.curTab === 'info') {
      const vRef = (sim.def.vRef || sim.p.v0) * 3.6;
      const m = sim.st.m;
      $('pane-info').innerHTML = `<div class="info-grid">
        <div><b>${fmt(s.v, 1)}</b>平均速度 km/h<i>測定区間にいる全車の速度の平均（空間平均）</i></div>
        <div><b>${fmt(s.k, 1)}</b>交通密度 台/km/車線<i>台数 ÷（区間長×車線数）</i></div>
        <div><b>${fmt(s.q)}</b>交通流率 台/時/車線<i>速度の合計 ÷（区間長×車線数）＝密度×平均速度</i></div>
        <div><b>${s.jamVeh}</b>渋滞車両 台<i>${ring ? '一様な流れの速度の半分未満' : '時速40km以下'}で連なる車</i></div>
        <div><b>${fmt(s.jamLen)}</b>渋滞長 m<i>渋滞の列の最後尾〜先頭（最大 ${fmt(m.maxJam)} m）</i></div>
        <div><b>${fmtVehMin(m.delay)}</b>累積遅延<i>基準 ${fmt(vRef)} km/h と比べた遅れの合計</i></div>
        <div><b>${m.hard}</b>急ブレーキ 回<i>減速度 3 m/s² を超えた回数</i></div>
        <div><b>${m.served}</b>通過台数<i>${ring ? '円形道路では0のまま' : '道路を走り抜けた台数'}</i></div>
      </div><p class="note">シミュレーション時間 ${fmt(sim.st.t)} 秒・${s.N}台を計算中。${sim.def.kind === 'highway' ? '※画面に収めるため道路を折りたたんで表示しています（計算上は直線道路）。' : ''}</p>`;
    }
    if (this.curTab === 'graph' && !$('sheet').classList.contains('collapsed')) this.drawGraph();
    // ambience
    const vr = s.v / ((sim.def.vRef || sim.p.v0) * 3.6);
    sound.ambience(this.paused ? 0 : Math.min(1, s.N / 40), vr);
  }

  drawGraph() {
    const g = $('graph'), c = g.getContext('2d');
    const dpr = g.width / Math.max(1, g.getBoundingClientRect().width);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = g.width / dpr, h = g.height / dpr;
    if (this.graph === 'st') this.st.draw(c, w, h, this.sim);
    if (this.graph === 'fd') drawFD(c, w, h, this.sim);
    if (this.graph === 'ts') drawSeries(c, w, h, this.series, this.twin ? this.baseSeries : null);
  }
}

const play = new Play();

// ---------------------------------------------------------------- boot
show('home', false);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__jam = { play, data, SAVE, sound, show };
document.addEventListener('gesturestart', (e) => e.preventDefault());
