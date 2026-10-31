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
  if (mode === "demo") setTimeout(startDemo, 1500);
  else idleLife();
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

// ───── データ取得 ─────
let mode = "live", seen = new Set(), lastState = null;
const key = e => e.t + e.agent + e.msg;
function showKpi(k = {}) {
  $("#k-articles").textContent = k.articles ?? 0;
  $("#k-clicks").textContent = (k.clicks ?? 0).toLocaleString();
  $("#k-conversions").textContent = k.conversions ?? 0;
  $("#k-revenue").textContent = "¥" + (k.revenue ?? 0).toLocaleString();
  $("#k-epc").textContent = "¥" + (k.epc ?? 0);
}
async function poll() {
  try {
    const r = await fetch("data/state.json?" + Date.now(), { cache: "no-store" });
    const s = await r.json();
    lastState = s; showKpi(s.kpi);
    const fresh = Date.now() - new Date(s.updatedAt) < 10 * 60e3 && s.running;
    if (mode === "live") {
      $("#mode").textContent = fresh ? `🟢 稼働中 — ${s.mode}` : `⚪ 業務時間外（最終更新 ${new Date(s.updatedAt).toLocaleString("ja-JP")}）`;
      const news = s.events.filter(e => !seen.has(key(e)));
      news.forEach(e => seen.add(key(e)));
      if (first) { first = false; news.slice(-6).forEach(addLog); if (!fresh && s.events.length) { setMode("demo"); return; } }
      else { queue.push(...news); pump(); }
    }
  } catch {
    if (first) { first = false; setMode("demo"); }
    $("#mode").textContent = "⚪ state.json が見つかりません — デモ再生中";
  }
}
let first = true;
function setMode(m) {
  mode = m;
  $("#toggle").textContent = m === "demo" ? "ライブに戻る" : "デモ再生";
  if (m === "demo") { $("#mode").textContent = lastState?.updatedAt ? `🎬 ${new Date(lastState.updatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} の業務を再生中` : "🎬 デモ再生中"; queue.length = 0; startDemo(); }
  else { queue.length = 0; lastState?.events?.forEach(e => seen.add(key(e))); $("#mode").textContent = "ライブ監視中"; }
}
const DEMO = [
  { agent: "analyst", type: "meeting", msg: "朝会スタート！今日も良い記事を出しましょう" },
  { agent: "scout", type: "work", msg: "検索ニーズを調査中" }, { agent: "scout", type: "result", msg: "記事ネタを10件発見" },
  { agent: "scout", type: "handoff", to: "strategist", msg: "ネタ10件のリストです" },
  { agent: "strategist", type: "work", msg: "優先順位と構成案を作成中" }, { agent: "strategist", type: "result", msg: "企画決定：在宅ワークのモニターライト選び" },
  { agent: "strategist", type: "handoff", to: "writer", msg: "構成案お願いします" },
  { agent: "writer", type: "work", msg: "執筆中…" }, { agent: "writer", type: "result", msg: "書き上げました（3,100字）" },
  { agent: "writer", type: "handoff", to: "editor", msg: "原稿チェックお願いします" },
  { agent: "editor", type: "work", msg: "景表法・ステマ規制チェック" }, { agent: "editor", type: "result", msg: "「絶対」を修正、PR表記OK" },
  { agent: "editor", type: "handoff", to: "publisher", msg: "公開OKです" },
  { agent: "publisher", type: "work", msg: "HTML化・リンク設置" }, { agent: "publisher", type: "result", msg: "公開しました🚀" },
  { agent: "analyst", type: "work", msg: "成果レポートを分析中" }, { agent: "analyst", type: "result", msg: "EPCの高い商品に寄せましょう" },
  { agent: "analyst", type: "handoff", to: "strategist", msg: "次回の企画に反映してください" },
];
function startDemo() {
  if (mode !== "demo" || busy) return;
  const src = lastState?.events?.length ? lastState.events.slice(-40) : DEMO;
  queue.push(...src.map(e => ({ ...e, t: new Date().toISOString() })));
  pump();
}
$("#toggle").onclick = () => setMode(mode === "demo" ? "live" : "demo");
setInterval(() => { $("#clock").textContent = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }); }, 1000);
renderStaff(); poll(); setInterval(poll, 2000); idleLife();
