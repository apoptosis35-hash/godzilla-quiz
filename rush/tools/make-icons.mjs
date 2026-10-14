// Renders tools/icons.html to the PNG icons. Usage: serve repo root on 8123, then node tools/make-icons.mjs
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
for (const [s, name, m] of [[180, 'icon-180', 0], [192, 'icon-192', 0], [512, 'icon-512', 0], [512, 'icon-maskable-512', 1]]) {
  await p.setViewportSize({ width: s, height: s });
  await p.goto(`http://localhost:8123/rush/tools/icons.html?s=${s}&m=${m}`);
  await p.waitForFunction(() => document.title === 'ready');
  await p.locator('#c').screenshot({ path: new URL(`../icons/${name}.png`, import.meta.url).pathname });
}
await b.close();
