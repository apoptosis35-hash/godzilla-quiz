// Usage: serve a COPY of the game, then: node tests/update-e2e.mjs <url of the copy> <path of the copy's sw.js>
// (the script edits that sw.js to fake a new version, then restores it)
// a running app picks up a new version when it comes back to the front, and reloads itself on the title screen
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const [URL, SW] = process.argv.slice(2);
let failed = 0;
const check = (n, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${info ? ` (${info})` : ''}`); if (!ok) failed++; };
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(URL);
await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
await p.reload(); await p.waitForTimeout(800);
check('service worker controls the page', await p.evaluate(() => !!navigator.serviceWorker.controller));
await p.evaluate(() => { window.__old = true; });
const orig = fs.readFileSync(SW, 'utf8');
fs.writeFileSync(SW, orig.replace(/-v(\d+)'/, (m, n) => `-v${+n + 100}'`));
// the app comes back to the front
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
const reloaded = await p.waitForFunction(() => !window.__old, null, { timeout: 15000 }).then(() => true).catch(() => false);
check('the new version reloads the title screen by itself', reloaded);
check('no script errors', errs.length === 0, errs.join(' | '));
fs.writeFileSync(SW, orig);
await b.close();
console.log(failed ? `${failed} failed` : 'all checks passed'); process.exit(failed ? 1 : 0);
