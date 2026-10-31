// 1日分の業務を回す: 調査 → 企画 → 執筆 → 校閲 → 公開 → 分析
//   node engine/run.js            Claude API で本番実行（ANTHROPIC_API_KEY など）
//   node engine/run.js --offline  APIなしでテンプレート動作（デモ）
import fs from "node:fs";
import path from "node:path";
import { createBus, ROOT } from "./bus.js";
import { initLLM, MODEL } from "./llm.js";
import { scout, strategist, writer, editor, publisher, buildIndex, analyst } from "./agents.js";

const offline = process.argv.includes("--offline");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
const insightsFile = path.join(ROOT, "data", "insights.json");
const insights = fs.existsSync(insightsFile) ? JSON.parse(fs.readFileSync(insightsFile, "utf8")) : {};

const online = await initLLM({ offline });
const bus = createBus({ mode: online ? `Claude (${MODEL})` : "オフライン（テンプレート）" });
bus.log("analyst", "meeting", `朝会スタート。今日のテーマは「${cfg.niche}」`);

try {
  const ideas = await scout(bus, cfg, insights);
  const briefs = await strategist(bus, cfg, ideas, insights);
  // 執筆→校閲→公開は記事ごとに流れ作業（ライターは次の記事に進む）
  let chain = Promise.resolve();
  for (const b of briefs) {
    const draft = await writer(bus, cfg, b);
    chain = chain.then(async () => publisher(bus, cfg, b, await editor(bus, cfg, b, draft)));
  }
  await chain;
  const metas = buildIndex(bus, cfg);
  await analyst(bus, cfg, metas);
  bus.log("analyst", "meeting", `終礼: 本日 ${briefs.length} 本公開、累計 ${metas.length} 記事`);
} catch (e) {
  bus.log("analyst", "error", `トラブル発生: ${e.message}`);
  if (/authentication/i.test(e.message)) console.error("→ ANTHROPIC_API_KEY を設定するか、--offline で試してください");
  process.exitCode = 1;
} finally {
  bus.done();
}
