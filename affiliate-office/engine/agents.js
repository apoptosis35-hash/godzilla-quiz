// 6人のAI社員。それぞれ Claude で考え、オフライン時はテンプレートで動く。
import fs from "node:fs";
import path from "node:path";
import { llm } from "./llm.js";
import { ROOT } from "./bus.js";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const pace = () => sleep(llm.online ? 0 : 900 + Math.random() * 900); // オフラインでもオフィスで動きが見えるように
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ───────── 1. トレンド調査 ─────────
export async function scout(bus, cfg, insights) {
  bus.work("scout", `「${cfg.niche}」の検索ニーズを調査中`);
  await pace();
  let ideas;
  if (llm.online) {
    const r = await llm.json(
      "あなたはアフィリエイトサイトのリサーチ担当です。読者が実際に検索しそうな悩み・比較・購入前の疑問を見つけます。",
      `ジャンル: ${cfg.niche}\n読者: ${cfg.audience}\n扱える商品:\n${cfg.products.map(p => `- ${p.id}: ${p.name}（${p.points.join("、")}）`).join("\n")}\n` +
      `前回のアナリスト所見: ${insights.summary ?? "なし"}\n\n商品ごとに、購入意欲の高い検索意図を持つ記事ネタを合計${cfg.products.length * 2}個出してください。`,
      {
        type: "object", additionalProperties: false, required: ["ideas"],
        properties: { ideas: { type: "array", items: {
          type: "object", additionalProperties: false, required: ["productId", "angle", "intent", "reason"],
          properties: { productId: { type: "string" }, angle: { type: "string" }, intent: { type: "string", enum: ["比較", "レビュー", "悩み解決", "選び方"] }, reason: { type: "string" } },
        } } },
      }, "low");
    ideas = r.ideas.filter(i => cfg.products.some(p => p.id === i.productId));
  } else {
    const angles = [["選び方", "失敗しない選び方と注意点"], ["悩み解決", "で毎日のストレスを減らす方法"], ["レビュー", "は買うべき？向いている人・向いていない人"], ["比較", "は本当に必要？メリット・デメリット比較"]];
    // 商品を横断するように並べる（同じ商品ばかりにならないように）
    ideas = angles.flatMap(([intent, a]) => cfg.products.map(p => ({
      productId: p.id, intent, angle: `${p.name}${a}`, reason: `「${p.keyword}」は購入直前の検索が多い`,
    })));
  }
  bus.log("scout", "result", `記事ネタを${ideas.length}件発見`);
  bus.handoff("scout", "strategist", `ネタ${ideas.length}件のリストを渡します`);
  bus.idle("scout");
  return ideas;
}

// ───────── 2. キーワード戦略 ─────────
export async function strategist(bus, cfg, ideas, insights) {
  bus.work("strategist", "優先順位と構成案を作成中");
  await pace();
  const done = new Set(fs.existsSync(path.join(ROOT, "site", "articles")) ? fs.readdirSync(path.join(ROOT, "site", "articles")).map(f => f.replace(/\.html$/, "")) : []);
  let briefs;
  if (llm.online) {
    const r = await llm.json(
      "あなたはSEOとアフィリエイトの戦略担当です。成約につながりやすく、競合が強すぎないテーマを選び、記事の設計図を作ります。",
      `候補ネタ:\n${JSON.stringify(ideas, null, 1)}\n\n既存記事のslug: ${[...done].join(", ") || "なし"}\nアナリスト所見: ${insights.summary ?? "なし"}\n` +
      `既存記事と重複しないものを${cfg.articlesPerRun}本選び、slug（半角英数とハイフン）、タイトル（32文字前後）、狙うキーワード、見出し構成（H2を4〜6個）を決めてください。`,
      {
        type: "object", additionalProperties: false, required: ["briefs"],
        properties: { briefs: { type: "array", items: {
          type: "object", additionalProperties: false, required: ["productId", "slug", "title", "keyword", "outline"],
          properties: { productId: { type: "string" }, slug: { type: "string" }, title: { type: "string" }, keyword: { type: "string" }, outline: { type: "array", items: { type: "string" } } },
        } } },
      }, "medium");
    briefs = r.briefs.map(b => ({ ...b, slug: slug(b.slug) || `post-${Date.now()}` })).filter(b => !done.has(b.slug));
  } else {
    briefs = ideas.map(i => ({ i, s: slug(`${i.productId}-${i.intent === "選び方" ? "guide" : i.intent === "悩み解決" ? "tips" : i.intent === "レビュー" ? "review" : "compare"}`) }))
      .filter(x => !done.has(x.s)).slice(0, cfg.articlesPerRun)
      .map(({ i, s }) => {
        const p = cfg.products.find(p => p.id === i.productId);
        return { productId: p.id, slug: s, title: i.angle, keyword: p.keyword,
          outline: ["こんな人におすすめ", `${p.name}を選ぶポイント`, "良かったところ", "気になったところ", "まとめ"] };
      });
  }
  briefs = briefs.slice(0, cfg.articlesPerRun);
  for (const b of briefs) bus.log("strategist", "result", `企画決定: 「${b.title}」 KW=${b.keyword}`);
  if (briefs.length) bus.handoff("strategist", "writer", `構成案${briefs.length}本お願いします`);
  else bus.log("strategist", "result", "新しく書くべきネタがありません（商品を追加してください）");
  bus.idle("strategist");
  return briefs;
}

// ───────── 3. ライター ─────────
export async function writer(bus, cfg, brief) {
  const p = cfg.products.find(p => p.id === brief.productId);
  bus.work("writer", `執筆中: ${brief.title}`);
  await pace();
  let md;
  if (llm.online) {
    md = await llm.text(
      "あなたは誠実なアフィリエイトライターです。読者の役に立つことを最優先し、デメリットも正直に書きます。" +
      "体験していないことを体験談として書かない。価格・ランキング・効果を断定しない。根拠のない「最安」「No.1」「絶対」は使わない。" +
      "商品リンクを置きたい場所には {{link:商品ID}} という記号だけを単独の行に書く。Markdown で出力し、H1 は書かない。",
      `タイトル: ${brief.title}\n狙うキーワード: ${brief.keyword}\n読者: ${cfg.audience}\n商品: ${p.name}（ID: ${p.id}）\n特徴メモ: ${p.points.join("、")}\n見出し構成:\n${brief.outline.map(h => `## ${h}`).join("\n")}\n\n2500〜3500字で書いてください。`,
      "medium");
  } else {
    md = [
      `「${brief.keyword}」で調べているあなたに向けて、${p.name}を検討するときに知っておきたいポイントをまとめました。`,
      ...brief.outline.flatMap((h, i) => [`## ${h}`,
        i === 0 ? `- ${cfg.audience}\n- 毎日の小さなストレスを道具で減らしたい人\n- 買ってから後悔したくない人` :
        i === 1 ? p.points.map(x => `- **${x}**`).join("\n") :
        i === 2 ? `${p.points[0]}点は、使い始めてすぐに実感しやすいメリットです。${p.points[1] ?? ""}という特徴もあります。` :
        i === 3 ? `一方で、${p.points[p.points.length - 1]}という点は事前に知っておきましょう。生活スタイルによっては合わない場合もあります。` :
        `${p.name}は、条件が合えば暮らしを確実にラクにしてくれるアイテムです。最新の価格や仕様は販売ページで確認してください。\n\n{{link:${p.id}}}`]),
    ].join("\n\n");
    if (!md.includes(`{{link:${p.id}}}`)) md += `\n\n{{link:${p.id}}}`;
  }
  bus.log("writer", "result", `書き上げました（${md.length}字）`);
  bus.handoff("writer", "editor", `「${brief.title}」の原稿チェックお願いします`);
  bus.idle("writer");
  return md;
}

// ───────── 4. 校閲・法務 ─────────
const NG = [[/絶対(に)?/g, "きっと"], [/業界(No\.?1|ナンバーワン|最安)/gi, "人気の"], [/最安(値)?/g, "お得な価格"], [/必ず(痩せ|儲か|治)/g, "$1"], [/100%/g, "多くの場合"], [/確実に/g, "ぐっと"]];
export async function editor(bus, cfg, brief, md) {
  bus.work("editor", `校閲・ステマ規制/景表法チェック: ${brief.title}`);
  await pace();
  const issues = [];
  for (const [re, rep] of NG) if (re.test(md)) { issues.push(`誇大表現 ${re} を修正`); md = md.replace(re, rep); }
  if (/[¥￥]\s?\d|\d+円/.test(md)) { issues.push("価格の記載を削除（価格は変動するため）"); md = md.replace(/[¥￥]\s?[\d,]+|[\d,]+円/g, "（価格は販売ページで確認）"); }
  if (llm.online) {
    const r = await llm.json(
      "あなたはアフィリエイト記事の校閲・コンプライアンス担当です。景品表示法・ステルスマーケティング規制・薬機法の観点と、事実誤認や読みにくさを確認し、修正版を返します。{{link:...}} の記号は必ず残すこと。",
      md,
      { type: "object", additionalProperties: false, required: ["issues", "revised"], properties: { issues: { type: "array", items: { type: "string" } }, revised: { type: "string" } } },
      "low");
    issues.push(...r.issues);
    if (r.revised.includes("{{link:")) md = r.revised;
  }
  bus.log("editor", "result", issues.length ? `修正${issues.length}件: ${issues.slice(0, 2).join(" / ")}` : "問題なし。PR表記を付けてOK");
  bus.handoff("editor", "publisher", `「${brief.title}」公開OKです`);
  bus.idle("editor");
  return md;
}

// ───────── 5. パブリッシャー ─────────
// A8.net の管理画面で取得した広告コード（<a href="https://px.a8.net/...">…<img src="https://www…a8.net/0.gif?…">）を
// そのまま config.json の a8Tag に貼れるようにする。URL だけなら a8Url でもOK。
export function parseA8(p) {
  const src = p.a8Tag || p.a8Url || "";
  const href = (src.match(/https?:\/\/px\.a8\.net\/svt\/ejp\?a8mat=[\w+.%-]+/) || [])[0] || "";
  const pixel = (src.match(/https?:\/\/www\d*\.a8\.net\/0\.gif\?a8mat=[\w+.%-]+/) || [])[0] || "";
  return { href, pixel };
}
function linkFor(cfg, p) {
  const real = v => (v && !/^YOUR/i.test(v) ? v : "");
  const amazonTag = real(cfg.affiliate.amazonTag), rakutenId = real(cfg.affiliate.rakutenId);
  const links = [];
  const a8 = parseA8(p);
  if (a8.href) links.push([p.a8Label || "公式サイトで詳しく見る", a8.href]);
  // a8Only: サービス系（レンタル・サブスク等）は Amazon/楽天 のボタンを出さない
  if (!(p.a8Only && a8.href)) {
    const q = encodeURIComponent(p.keyword);
    const amazon = p.asin ? `https://www.amazon.co.jp/dp/${p.asin}` : `https://www.amazon.co.jp/s?k=${q}`;
    links.push(["Amazonで見る", amazonTag ? `${amazon}${amazon.includes("?") ? "&" : "?"}tag=${encodeURIComponent(amazonTag)}` : amazon]);
    const rakuten = `https://search.rakuten.co.jp/search/mall/${q}/`;
    links.push(["楽天市場で見る", rakutenId ? `https://hb.afl.rakuten.co.jp/hgc/${rakutenId}/?pc=${encodeURIComponent(rakuten)}` : rakuten]);
  }
  const imp = a8.pixel ? `<img class="a8px" src="${a8.pixel}" width="1" height="1" alt="">` : ""; // A8のインプレッション計測
  return `<div class="buy"><div class="buy-name">${p.name}</div>${links.map(([t, u]) => `<a class="btn" rel="sponsored noopener" target="_blank" href="${u}" data-product="${p.id}">${t}</a>`).join("")}${imp}</div>`;
}
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function mdToHtml(md, cfg) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\[(.+?)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');
  const out = []; let list = null;
  for (const raw of md.split(/\n/)) {
    const line = raw.trim();
    const m = line.match(/^\{\{link:([\w-]+)\}\}$/);
    if (!/^[-*] /.test(line) && list) { out.push("</ul>"); list = null; }
    if (!line) continue;
    if (m) { const p = cfg.products.find(p => p.id === m[1]); if (p) out.push(linkFor(cfg, p)); }
    else if (/^### /.test(line)) out.push(`<h3>${inline(line.slice(4))}</h3>`);
    else if (/^## /.test(line)) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (/^# /.test(line)) out.push(`<h2>${inline(line.slice(2))}</h2>`);
    else if (/^[-*] /.test(line)) { if (!list) { out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(line.slice(2))}</li>`); }
    else out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push("</ul>");
  return out.filter(Boolean).join("\n");
}
const page = (cfg, title, body, depth) => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | ${esc(cfg.siteName)}</title><link rel="stylesheet" href="${depth}style.css"></head>
<body><header><a href="${depth}index.html">${esc(cfg.siteName)}</a></header><main>
<p class="pr">【PR】本サイトはアフィリエイト広告（Amazonアソシエイト・楽天アフィリエイト等）を利用しています。リンク経由で商品が購入されると、運営者に報酬が支払われることがあります。</p>
${body}</main><footer>© ${new Date().getFullYear()} ${esc(cfg.siteName)} ${/^YOUR/i.test(cfg.affiliate.amazonTag || "YOUR") ? "" : " ・ Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。"}</footer>
<script src="${depth}track.js"></script></body></html>`;

export async function publisher(bus, cfg, brief, md) {
  bus.work("publisher", `HTML化・リンク設置: ${brief.title}`);
  await pace();
  const dir = path.join(ROOT, "site", "articles");
  fs.mkdirSync(dir, { recursive: true });
  const meta = { slug: brief.slug, title: brief.title, keyword: brief.keyword, productId: brief.productId, date: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(path.join(dir, `${brief.slug}.html`),
    page(cfg, brief.title, `<article><h1>${esc(brief.title)}</h1><p class="date">${meta.date} 更新</p>\n${mdToHtml(md, cfg)}</article><!--meta:${JSON.stringify(meta)}-->`, "../"));
  bus.log("publisher", "result", `公開: site/articles/${brief.slug}.html`);
  bus.idle("publisher");
  return meta;
}

export function buildIndex(bus, cfg) {
  bus.work("publisher", "トップページとサイトマップを更新");
  const dir = path.join(ROOT, "site", "articles");
  const metas = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(f => f.endsWith(".html")).map(f => {
    const m = fs.readFileSync(path.join(dir, f), "utf8").match(/<!--meta:(.+?)-->/);
    return m ? JSON.parse(m[1]) : null;
  }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
  const site = path.join(ROOT, "site");
  fs.writeFileSync(path.join(site, "index.html"), page(cfg, cfg.siteName,
    `<h1>${esc(cfg.siteName)}</h1><p>${esc(cfg.niche)}を、${esc(cfg.audience)}の目線でまとめています。</p>
<ul class="cards">${metas.map(m => `<li><a href="articles/${m.slug}.html"><span class="kw">${esc(m.keyword)}</span>${esc(m.title)}<small>${m.date}</small></a></li>`).join("\n")}</ul>`, ""));
  fs.writeFileSync(path.join(site, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    metas.map(m => `  <url><loc>${cfg.siteUrl}articles/${m.slug}.html</loc><lastmod>${m.date}</lastmod></url>`).join("\n")}\n</urlset>\n`);
  bus.log("publisher", "result", `トップページ更新（全${metas.length}記事）・sitemap.xml 出力`);
  bus.idle("publisher");
  return metas;
}

// ───────── 6. アナリスト ─────────
export async function analyst(bus, cfg, metas) {
  bus.work("analyst", "成果レポート（performance.csv）を分析中");
  await pace();
  const rows = fs.readFileSync(path.join(ROOT, "data", "performance.csv"), "utf8").split(/\n/)
    .filter(l => l.trim() && !l.startsWith("#")).map(l => l.split(","))
    .map(([date, article, clicks, conv, rev]) => ({ date, article, clicks: +clicks || 0, conv: +conv || 0, rev: +rev || 0 }));
  const sum = k => rows.reduce((s, r) => s + r[k], 0);
  const kpi = { articles: metas.length, clicks: sum("clicks"), conversions: sum("conv"), revenue: sum("rev") };
  kpi.epc = kpi.clicks ? Math.round(kpi.revenue / kpi.clicks * 10) / 10 : 0;
  bus.kpi(kpi);
  const byArticle = {};
  for (const r of rows) { const a = (byArticle[r.article] ??= { clicks: 0, conv: 0, rev: 0 }); a.clicks += r.clicks; a.conv += r.conv; a.rev += r.rev; }
  let summary;
  if (!rows.length) summary = "まだ成果データがありません。ASPの管理画面から data/performance.csv に数字を貼ると、次回から売れる記事に寄せて企画します。";
  else if (llm.online) summary = await llm.text("あなたはアフィリエイトのデータアナリストです。数字から次に書くべき記事の方向性を3行で提案します。", JSON.stringify({ kpi, byArticle }), "low");
  else {
    const best = Object.entries(byArticle).sort((a, b) => b[1].rev - a[1].rev)[0];
    summary = `最も稼いでいる記事は「${best[0]}」（${best[1].rev}円）。同じ商品の別切り口記事を増やすのがおすすめ。`;
  }
  fs.writeFileSync(path.join(ROOT, "data", "insights.json"), JSON.stringify({ updatedAt: new Date().toISOString(), kpi, byArticle, summary }, null, 2));
  bus.log("analyst", "result", summary.split("\n")[0]);
  bus.handoff("analyst", "strategist", "次回の企画に反映してください");
  bus.idle("analyst");
}
