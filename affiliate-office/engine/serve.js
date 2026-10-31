// ローカル確認用の静的サーバー: http://localhost:8787/ でオフィス、/site/ で記事サイト
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./bus.js";

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".xml": "application/xml", ".svg": "image/svg+xml" };
const port = +process.env.PORT || 8787;
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`仮想オフィス: http://localhost:${port}/   記事サイト: http://localhost:${port}/site/`));
