// 仮想オフィスに見せる「業務ログ」を data/state.json に書き出す。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");
const STATE = path.join(ROOT, "data", "state.json");

export const AGENTS = [
  { id: "scout",     name: "ミナト", role: "トレンド調査",   color: "#4f9dff" },
  { id: "strategist",name: "サクラ", role: "キーワード戦略", color: "#ff7eb6" },
  { id: "writer",    name: "ハル",   role: "ライター",       color: "#ffb340" },
  { id: "editor",    name: "リン",   role: "校閲・法務",     color: "#3ecf8e" },
  { id: "publisher", name: "ソラ",   role: "パブリッシャー", color: "#a78bfa" },
  { id: "analyst",   name: "ケイ",   role: "アナリスト",     color: "#f87171" },
];

function load() {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return null; }
}

export function createBus({ mode }) {
  const prev = load();
  const state = {
    updatedAt: new Date().toISOString(),
    mode,
    running: true,
    kpi: prev?.kpi ?? { articles: 0, clicks: 0, conversions: 0, revenue: 0, epc: 0 },
    agents: Object.fromEntries(AGENTS.map(a => [a.id, { ...a, status: "idle", task: "待機中" }])),
    events: (prev?.events ?? []).slice(-150),
  };
  const flush = () => {
    state.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  };
  const bus = {
    state,
    work(agent, task) {
      Object.assign(state.agents[agent], { status: "working", task });
      bus.log(agent, "work", task);
    },
    idle(agent, task = "待機中") {
      Object.assign(state.agents[agent], { status: "idle", task });
      flush();
    },
    handoff(from, to, msg) { bus.log(from, "handoff", msg, to); },
    log(agent, type, msg, to) {
      const ev = { t: new Date().toISOString(), agent, type, msg, ...(to ? { to } : {}) };
      state.events.push(ev);
      if (state.events.length > 200) state.events.shift();
      const who = state.agents[agent];
      console.log(`[${who.name}/${who.role}] ${type === "handoff" ? `→ ${state.agents[to].name}: ` : ""}${msg}`);
      flush();
    },
    kpi(patch) { Object.assign(state.kpi, patch); flush(); },
    done() {
      state.running = false;
      for (const a of AGENTS) Object.assign(state.agents[a.id], { status: "idle", task: "本日の業務完了" });
      flush();
    },
  };
  flush();
  return bus;
}
