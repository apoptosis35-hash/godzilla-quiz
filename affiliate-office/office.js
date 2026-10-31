// 仮想オフィス: data/state.json を読み、AI社員の動きをアニメーションで見せる
const AGENTS = [
  { id: "scout",      name: "ミナト", role: "トレンド調査",   color: "#4f9dff", hair: "#2b2b2b" },
  { id: "strategist", name: "サクラ", role: "キーワード戦略", color: "#ff7eb6", hair: "#8b4a2b" },
  { id: "writer",     name: "ハル",   role: "ライター",       color: "#ffb340", hair: "#3a2a1a" },
  { id: "editor",     name: "リン",   role: "校閲・法務",     color: "#3ecf8e", hair: "#111" },
  { id: "publisher",  name: "ソラ",   role: "パブリッシャー", color: "#a78bfa", hair: "#6b4f2b" },
  { id: "analyst",    name: "ケイ",   role: "アナリスト",     color: "#f87171", hair: "#444" },
];
const PHONE = matchMedia("(max-width:640px)").matches;
const DESKS = PHONE
  ? { scout: [25, 22], strategist: [75, 22], writer: [25, 45], editor: [75, 45], publisher: [25, 82], analyst: [75, 82] }
  : { scout: [18, 30], strategist: [50, 30], writer: [82, 30], editor: [18, 80], publisher: [50, 80], analyst: [82, 80] };
const MEETING = PHONE
  ? [[36, 61], [50, 59], [64, 61], [36, 71], [50, 73], [64, 71]]
  : [[44, 48], [50, 46], [56, 48], [44, 62], [50, 64], [56, 62]];
const COFFEE = PHONE ? [88, 94] : [92, 86];
const $ = s => document.querySelector(s);
const floor = $("#floor");
const A = {};

// ───── 描画 ─────
for (const [i, a] of AGENTS.entries()) {
  const [x, y] = DESKS[a.id];
  const desk = document.createElement("div");
  desk.className = "desk"; desk.style.cssText = `left:${x}%;top:${y - (PHONE ? 6 : 8)}%;--c:${a.color}`;
  desk.innerHTML = `<div class="surface"><div class="monitor"></div><div class="paper">${["🔍", "🗂️", "✍️", "🧐", "🚀", "📊"][i]}</div></div><div class="plate">${a.role}</div>`;
  floor.append(desk);
  const el = document.createElement("div");
  el.className = "agent idle"; el.style.cssText = `--c:${a.color};--hair:${a.hair}`;
  el.innerHTML = `<div class="body"><div class="torso"></div><div class="head"></div><div class="hair"></div><div class="eyes"><i></i><i></i></div></div>
    <div class="zzz">💤</div><div class="doc">📄</div><div class="name">${a.name}</div><div class="bubble"></div>`;
  floor.append(el);
  A[a.id] = { ...a, el, desk, home: [x, y + (PHONE ? 2 : 3)], status: "idle", task: "待機中", bubbleT: 0 };
  moveTo(a.id, A[a.id].home, true);
}
function moveTo(id, [x, y], instant) {
  const el = A[id].el;
  if (instant) el.style.transition = "none";
  el.style.left = x + "%"; el.style.top = y + "%";
  if (instant) { el.offsetWidth; el.style.transition = ""; }
}
function say(id, text, ms = 2600) {
  const b = A[id].el.querySelector(".bubble");
  b.textContent = text.length > 60 ? text.slice(0, 58) + "…" : text;
  b.classList.add("show");
  clearTimeout(A[id].bubbleT);
  A[id].bubbleT = setTimeout(() => b.classList.remove("show"), ms);
}
function setStatus(id, status, task) {
  const a = A[id];
  a.status = status; if (task) a.task = task;
  a.el.classList.toggle("working", status === "working");
  a.el.classList.toggle("idle", status === "idle");
  a.desk.classList.toggle("working", status === "working");
  renderStaff();
}
function renderStaff() {
  $("#staff").innerHTML = AGENTS.map(({ id }) => {
    const a = A[id];
    return `<li class="${a.status}"><span class="dot" style="background:${a.color}"></span><div><b>${a.name}</b> <small>${a.role}</small><span class="task">${esc(a.task)}</span></div><span class="st">${a.status === "working" ? "作業中" : a.status === "away" ? "移動中" : "待機"}</span></li>`;
  }).join("");
}
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
function addLog(ev) {
  const a = A[ev.agent], li = document.createElement("li");
  const t = new Date(ev.t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  li.innerHTML = `<time>${t}</time><b style="color:${a.color}">${a.name}</b>${ev.to ? ` → <b style="color:${A[ev.to].color}">${A[ev.to].name}</b>` : ""}：${esc(ev.msg)}`;
  $("#log").prepend(li);
  while ($("#log").children.length > 80) $("#log").lastChild.remove();
}
const wait = ms => new Promise(r => setTimeout(r, ms / speed));
let speed = 1;

// ───── イベント再生 ─────
async function play(ev) {
  if (!A[ev.agent]) return;
  addLog(ev);
  $("#board-note").textContent = `${A[ev.agent].name}: ${ev.msg}`;
  if (ev.type === "work") { setStatus(ev.agent, "working", ev.msg); say(ev.agent, ev.msg); await wait(1500); }
  else if (ev.type === "result") { say(ev.agent, ev.msg, 3000); await wait(1300); }
  else if (ev.type === "handoff") {
    const from = A[ev.agent], [tx, ty] = A[ev.to].home;
    setStatus(ev.agent, "away", ev.msg);
    from.el.classList.add("walking", "carry");
    moveTo(ev.agent, [tx + (tx > from.home[0] ? -5 : 5), ty]);
    await wait(1150);
    from.el.classList.remove("walking");
    say(ev.agent, ev.msg); say(ev.to, "了解です！", 1800);
    await wait(1300);
    from.el.classList.remove("carry");
    from.el.classList.add("walking");
    moveTo(ev.agent, from.home);
    await wait(1150);
    from.el.classList.remove("walking");
    setStatus(ev.agent, "idle", "待機中");
  } else if (ev.type === "meeting") {
    AGENTS.forEach(({ id }, i) => { A[id].el.classList.add("walking"); setStatus(id, "away", "会議"); moveTo(id, MEETING[i]); });
    await wait(1200);
    AGENTS.forEach(({ id }) => A[id].el.classList.remove("walking"));
    say(ev.agent, ev.msg, 3200);
    await wait(2600);
    AGENTS.forEach(({ id }) => { A[id].el.classList.add("walking"); moveTo(id, A[id].home); });
    await wait(1200);
    AGENTS.forEach(({ id }) => { A[id].el.classList.remove("walking"); setStatus(id, "idle", "待機中"); });
  } else if (ev.type === "error") { say(ev.agent, "⚠️ " + ev.msg, 4000); await wait(2000); }
}
const queue = []; let busy = false;
async function pump() {
  if (busy) return; busy = true;
  while (queue.length) { speed = queue.length > 8 ? 3 : 1; await play(queue.shift()); }
  busy = false;
  idleLife();
}
// 手が空いている社員はたまにコーヒーを取りに行く
let lifeT;
function idleLife() {
  clearTimeout(lifeT);
  lifeT = setTimeout(async () => {
    if (!busy && !queue.length) {
      const idle = AGENTS.filter(a => A[a.id].status === "idle");
      const a = idle[Math.floor(Math.random() * idle.length)];
      if (a) {
        A[a.id].el.classList.add("walking"); moveTo(a.id, COFFEE); await wait(1200);
        A[a.id].el.classList.remove("walking"); say(a.id, ["ひと休み☕", "次のネタ考え中…", "SEOって奥深い", "今日も1本でも多く！"][Math.floor(Math.random() * 4)], 1800);
        await wait(2000); A[a.id].el.classList.add("walking"); moveTo(a.id, A[a.id].home); await wait(1200); A[a.id].el.classList.remove("walking");
      }
    }
    idleLife();
  }, 6000 + Math.random() * 6000);
}

// ───── 事務所レベル・内装（放置ゲーム：実データ kpi だけで育つ）─────
const LEVELS = [
  { lv: 1, name: "スタートアップ",       min: 0 },
  { lv: 2, name: "町の小さな事務所",     min: 5 },
  { lv: 3, name: "にぎわう編集部",       min: 10 },
  { lv: 4, name: "人気メディア",         min: 20 },
  { lv: 5, name: "業界注目の事務所",     min: 35 },
  { lv: 6, name: "老舗メディア企業",     min: 50 },
];
// 内装（絵文字の小物）: 公開記事数 or 報酬のしきい値で解放。架空の数字では増えない。
const DECOR = [
  { id: "plant3", emoji: "🌵",  pos: PHONE ? [7, 55]  : [6, 55],  need: { articles: 5 } },
  { id: "books",  emoji: "📚",  pos: PHONE ? [93, 55] : [95, 55], need: { articles: 10 } },
  { id: "water",  emoji: "🧴",  pos: PHONE ? [10, 93] : [8, 92],  need: { articles: 10 } },
  { id: "sofa",   emoji: "🛋️",  pos: PHONE ? [50, 95] : [50, 93], need: { articles: 20 } },
  { id: "plantB", emoji: "🌱",  pos: PHONE ? [93, 72] : [95, 70], need: { articles: 20 } },
  { id: "trophy", emoji: "🏆",  pos: PHONE ? [20, 8]  : [28, 5],  need: { revenue: 1000 } },
  { id: "award",  emoji: "🎖️",  pos: PHONE ? [80, 8]  : [72, 5],  need: { revenue: 10000 } },
];
const ASSIST_NAMES = ["アシスタント", "インターン", "新人スタッフ"];
const ASSIST_COLORS = ["#9aa0c0", "#7bd389", "#f0a6ca"];
const ASSIST = [];
function moveEl(el, [x, y], instant) {
  if (instant) el.style.transition = "none";
  el.style.left = x + "%"; el.style.top = y + "%";
  if (instant) { el.offsetWidth; el.style.transition = ""; }
}
function computeLevel(kpi) {
  const a = kpi?.articles || 0, rev = kpi?.revenue || 0;
  let cur = LEVELS[0];
  for (const L of LEVELS) if (a >= L.min) cur = L;
  const next = LEVELS.find(L => L.min > a) || null;
  const progress = next ? (a - cur.min) / (next.min - cur.min) : 1;
  return { ...cur, next, progress, articles: a, revenue: rev };
}
const unlocked = kpi => DECOR.filter(d =>
  (d.need.articles ? (kpi?.articles || 0) >= d.need.articles : true) &&
  (d.need.revenue ? (kpi?.revenue || 0) >= d.need.revenue : true));
const assistantCount = lv => Math.max(0, lv - 3); // Lv4で1人、Lv5で2人、Lv6で3人
function ensureAssistants(n) {
  while (ASSIST.length < n) {
    const i = ASSIST.length;
    const el = document.createElement("div");
    el.className = "agent assistant idle";
    el.style.cssText = `--c:${ASSIST_COLORS[i % 3]};--hair:#3a2a1a`;
    el.innerHTML = `<div class="body"><div class="torso"></div><div class="head"></div><div class="hair"></div><div class="eyes"><i></i><i></i></div></div><div class="name">${ASSIST_NAMES[i % 3]}</div>`;
    floor.append(el);
    const home = [12 + Math.random() * 76, 55 + Math.random() * 32];
    ASSIST.push({ el, home });
    moveEl(el, home, true);
  }
  while (ASSIST.length > n) ASSIST.pop().el.remove();
}
let assistT;
function assistLife() {
  clearTimeout(assistT);
  assistT = setTimeout(() => {
    for (const a of ASSIST) if (Math.random() < 0.6) {
      a.el.classList.add("walking");
      moveEl(a.el, [12 + Math.random() * 76, 55 + Math.random() * 34]);
      setTimeout(() => a.el.classList.remove("walking"), 1300);
    }
    assistLife();
  }, 4000 + Math.random() * 4000);
}
function toast(msg) {
  const box = $("#toasts"); if (!box) return;
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  box.append(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 5500);
}
let _decorKey = "";
function renderOffice(kpi) {
  const info = computeLevel(kpi || {});
  const lvEl = $("#ol-lv"); if (!lvEl) return;
  lvEl.textContent = "Lv." + info.lv;
  $("#ol-name").textContent = info.name;
  $("#ol-fill").style.width = Math.round(info.progress * 100) + "%";
  $("#ol-next").textContent = info.next ? `次のLvまで 記事あと${info.next.min - info.articles}本` : "最大レベル達成 🎉";
  const ud = unlocked(kpi || {}), n = assistantCount(info.lv);
  const dkey = info.lv + "|" + ud.map(d => d.id).join(",") + "|" + n;
  if (dkey !== _decorKey) {
    _decorKey = dkey;
    floor.querySelectorAll(".decor").forEach(e => e.remove());
    for (const d of ud) {
      const el = document.createElement("div");
      el.className = "decor"; el.style.cssText = `left:${d.pos[0]}%;top:${d.pos[1]}%`;
      el.textContent = d.emoji; floor.append(el);
    }
    ensureAssistants(n);
  }
  // レベルアップ演出（localStorage で前回レベルを記憶。初回は演出なし）
  const prev = +(localStorage.getItem("office.level") || 0);
  if (info.lv > prev) {
    if (prev > 0) toast(`🎉 事務所レベルアップ！ Lv.${info.lv}「${info.name}」`);
    localStorage.setItem("office.level", info.lv);
  }
}

// ───── データ取得 ─────
let mode = "live", seen = new Set(), lastState = null;
const key = e => e.t + e.agent + e.msg;
function showKpi(k = {}) {
  $("#k-articles").textContent = k.articles ?? 0;
  $("#k-clicks").textContent = (k.clicks ?? 0).toLocaleString();
  $("#k-conversions").textContent = k.conversions ?? 0;
  $("#k-revenue").textContent = "¥" + (k.revenue ?? 0).toLocaleString();
  $("#k-epc").textContent = "¥" + (k.epc ?? 0);
  renderOffice(k);
}
async function poll() {
  try {
    const r = await fetch("data/state.json?" + Date.now(), { cache: "no-store" });
    const s = await r.json();
    lastState = s; showKpi(s.kpi);
    const fresh = Date.now() - new Date(s.updatedAt) < 10 * 60e3 && s.running;
    if (mode === "live") {
      $("#mode").textContent = fresh ? `🟢 稼働中 — ${s.mode}` : !s.events.length ? "⚪ まだ本番の業務はありません" : `⚪ 業務時間外（最終業務 ${new Date(s.updatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）`;
      const news = s.events.filter(e => !seen.has(key(e)));
      news.forEach(e => seen.add(key(e)));
      if (first) { first = false; news.slice(-6).forEach(addLog); } // 過去の業務は再生せず、ログに残すだけ
      else { queue.push(...news); pump(); }
    }
  } catch {
    $("#mode").textContent = "⚪ 業務ログ（data/state.json）を読み込めません";
  }
}
let first = true;
setInterval(() => { $("#clock").textContent = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }); }, 1000);
renderStaff(); renderOffice({}); poll(); setInterval(poll, 2000); idleLife(); assistLife();
