// Browser end-to-end check on an emulated iPhone (Playwright + Chromium).
// Usage: serve the repo root (e.g. `npx http-server -p 8123 ..`) then
//   node tests/e2e.mjs [http://localhost:8123/rush/] [screenshot-dir]
import { chromium, devices } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8123/rush/';
const SHOTS = process.argv[3] || '';
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`); if (!ok) failed++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const G = (fn, a) => p.evaluate(fn, a);
const shot = (n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png` });
const waitPhase = (ph, ms = 60000) => p.waitForFunction((x) => x.includes(window.__rush.game.phase), ph, { timeout: ms });

await p.goto(URL);
await p.waitForTimeout(500);
check('home screen', await p.isVisible('#home'));
await shot('01-home');

// start by touching the road, then let the autopilot pick the better gate every time
await G(() => window.__rush.setAuto(true));
await p.touchscreen.tap(195, 380);
await p.waitForTimeout(200);
check('touch starts the run', await G(() => window.__rush.game.phase) !== 'ready');
check('home hidden while running', !(await p.isVisible('#home')));
await p.waitForFunction(() => window.__rush.game.items.some((i) => i.kind === 'gate' && i.done), null, { timeout: 10000 });
await p.waitForTimeout(150);
await shot('02-gate');
check('passing a gate changes the crowd', await G(() => window.__rush.game.crowd.n) !== 8);
await p.waitForFunction(() => window.__rush.game.phase === 'fight' || window.__rush.game.items.some((i) => i.kind === 'enemy' && i.done), null, { timeout: 20000 });
await p.waitForTimeout(250);
await shot('03-fight');
await waitPhase(['stairs', 'win', 'lose']);
await p.waitForTimeout(700);
await shot('04-stairs');
await waitPhase(['win', 'lose']);
check('best play clears level 1', await G(() => window.__rush.game.phase) === 'win');
await p.waitForSelector('#win.on', { timeout: 5000 });
await p.waitForTimeout(300);
await shot('05-win');
const coins0 = await G(() => window.__rush.save.coins);
await p.tap('#spin', { force: true });
await p.waitForTimeout(1800);
check('roulette pays out coins', (await G(() => window.__rush.save.coins)) > coins0);
check('advances to level 2', await G(() => window.__rush.save.level) === 2 && await p.isVisible('#home'));
await shot('06-home2');

// an upgrade is bought with the coins
const can = await G(() => !document.querySelector('#up-start').disabled);
if (can) { await p.tap('#up-start', { force: true }); check('start-crowd upgrade bought', await G(() => window.__rush.save.upStart) === 1 && await G(() => window.__rush.game.crowd.n) === 11); }

// lose path: walk straight into a bad gate setup by forcing the crowd to 1 before an enemy
await G(() => window.__rush.setAuto(false));
await p.touchscreen.tap(195, 380);
await G(() => { const g = window.__rush.game; g.crowd.n = 1; g.crowd.sync(false); });
await waitPhase(['lose'], 30000);
await p.waitForSelector('#lose.on', { timeout: 5000 });
await shot('07-lose');
check('lose screen shows the shortfall', /あと|ゲート/.test(await p.textContent('#lose-msg')));
await p.tap('#retry', { force: true });
check('retry returns to the start', await G(() => window.__rush.game.phase) === 'ready');

// a bonus level (5) renders and plays through
await G(() => { window.__rush.save.level = 5; window.__rush.game.load(5, 8); window.__rush.setAuto(true); });
await p.touchscreen.tap(195, 380);
await waitPhase(['stairs'], 30000);
await p.waitForTimeout(1200);
await shot('08-bonus-stairs');
await waitPhase(['win', 'lose']);
check('bonus level clears', await G(() => window.__rush.game.phase) === 'win', `×${await G(() => window.__rush.game.mult)}`);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
