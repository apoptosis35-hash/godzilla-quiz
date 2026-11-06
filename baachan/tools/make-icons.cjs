// Renders the title scene (granny and her passenger, facing the camera) without UI and saves the app icons.
// Usage: python3 -m http.server 8765 (repo root) → node baachan/tools/make-icons.cjs
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  await p.goto('http://localhost:8765/baachan/');
  for (let i = 0; i < 80; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => window.__baa && window.__baa.state === 'title')) break; }
  await p.addStyleTag({ content: '.ov, #hud { display: none !important; }' });
  await p.waitForTimeout(2500);
  const out = path.join(__dirname, '..', 'icons');
  await p.screenshot({ path: path.join(out, 'icon-512.png') });
  for (const s of [192, 180]) { await p.setViewportSize({ width: s, height: s }); await p.waitForTimeout(1500); await p.screenshot({ path: path.join(out, `icon-${s}.png`) }); }
  await b.close();
})();
