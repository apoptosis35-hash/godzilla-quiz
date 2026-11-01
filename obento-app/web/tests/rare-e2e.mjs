// Usage: node tests/rare-e2e.mjs <game url> <storage key> <image file> [screenshot]
// settings: pick a picture for the rare piece, it is used, kept after reload, and can be reset
import { chromium, devices } from 'playwright';
const [URL, KEY, IMG, SHOT] = process.argv.slice(2);
let failed = 0;
const check = (n, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${info ? ` (${info})` : ''}`); if (!ok) failed++; };
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(URL + '?nosw'); await p.waitForTimeout(600);
// colour at the centre of the rare piece sprite
const rareColor = () => p.evaluate(() => {
  const g = window.__obento; const sp = g.renderer.sprites.get(98, 'normal');
  const c = document.createElement('canvas'); c.width = sp.width; c.height = sp.height;
  const x = c.getContext('2d'); x.drawImage(sp, 0, 0); return Array.from(x.getImageData(sp.width / 2, sp.height / 2, 1, 1).data.slice(0, 3));
});
const before = await rareColor();
await p.tap('#t-settings');
check('settings shows the rare picture row', await p.isVisible('#rare-pick') && await p.isVisible('#rare-thumb'));
check('reset button hidden at first', !(await p.isVisible('#rare-del')));
const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null), p.tap('#rare-pick')]);
check('tapping the button opens the photo picker', !!chooser && !chooser.isMultiple());
const [chooser2] = await Promise.all([p.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null), p.tap('#cameo-pick')]);
check('the reward photo button opens the picker too', !!chooser2);
await p.setInputFiles('#rare-file', IMG);
await p.waitForTimeout(800);
const stored = await p.evaluate((k) => localStorage.getItem(k), KEY);
check('picture saved on the device', !!stored && stored.startsWith('data:image/jpeg'), stored && stored.length);
const dim = await p.evaluate(() => new Promise((r) => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.src = document.getElementById('rare-thumb').src; }));
check('cropped to a square', dim[0] === dim[1], dim.join('x'));
const after = await rareColor();
check('the rare piece uses the new picture', after[1] > 150 && after[0] < 90, `${before} -> ${after}`);
check('reset button shown', await p.isVisible('#rare-del'));
if (SHOT) await p.screenshot({ path: SHOT });
await p.reload(); await p.waitForTimeout(800);
const kept = await rareColor();
check('still used after reload', kept[1] > 150 && kept[0] < 90, String(kept));
await p.tap('#t-settings'); await p.tap('#rare-del');
await p.waitForTimeout(200);
await p.click('#c-yes').catch(() => {});
await p.waitForTimeout(600);
const reset = await rareColor();
check('reset goes back to the built-in picture', !(await p.evaluate((k) => localStorage.getItem(k), KEY)) && String(reset) === String(before), `${reset}`);
check('no script errors', errs.length === 0, errs.join(' | '));
await b.close();
console.log(failed ? `${failed} failed` : 'all checks passed'); process.exit(failed ? 1 : 0);
