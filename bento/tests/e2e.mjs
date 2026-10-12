// Browser end-to-end check on an emulated iPhone (Playwright + Chromium).
// Usage: serve the repo root (e.g. `npx http-server -p 8123 ..`) then
//   node tests/e2e.mjs [http://localhost:8123/bento/] [screenshot-dir]
import { chromium, devices } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8123/bento/';
const SHOTS = process.argv[3] || '';
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`); if (!ok) failed++; };
const shot = (p, n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png` });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const G = (fn) => p.evaluate(fn);

await p.goto(URL);
await p.waitForTimeout(500);
await shot(p, '01-title');
check('title screen shown', await p.isVisible('#t-play'));

await p.tap('#t-play');
await p.waitForTimeout(250);
check('audio unlocked after first tap', await G(() => !!window.__obento.sound.ctx && window.__obento.sound.ctx.state === 'running'));
const box = await p.locator('#stage').boundingBox();

// drag with a finger, release to drop
const cdp = await ctx.newCDPSession(p);
const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
await touch('touchStart', box.x + 60, box.y + 80);
for (let i = 1; i <= 8; i++) await touch('touchMove', box.x + 60 + i * 25, box.y + 80);
const aim = await G(() => window.__obento.renderer.aimX);
await touch('touchEnd');
await p.waitForTimeout(50);
const first = await G(() => { const b = window.__obento.game.foods[0]; return b ? b.position.x : null; });
check('drag moves the aim and release drops there', first !== null && Math.abs(first - aim) < 40, `aim ${aim?.toFixed(0)} drop ${first?.toFixed(0)}`);

// a quick double tap must not drop two pieces
await p.waitForTimeout(500);
const n0 = await G(() => window.__obento.game.dropCount);
await p.touchscreen.tap(box.x + 100, box.y + 60);
await p.touchscreen.tap(box.x + 100, box.y + 60);
await p.waitForTimeout(30);
const n1 = await G(() => window.__obento.game.dropCount);
check('double tap drops only one piece', n1 - n0 <= 1, `${n1 - n0} drops`);

for (let i = 0; i < 30; i++) { await p.touchscreen.tap(box.x + 30 + ((i * 97) % (box.width - 60)), box.y + 60); await p.waitForTimeout(400); }
const mid = await G(() => { const g = window.__obento.game; return { merges: g.merges, score: g.score, n: g.foods.length }; });
check('pieces merge during real play', mid.merges > 5 && mid.score > 0, JSON.stringify(mid));
await shot(p, '02-play');

// chain + fever banners
await G(() => {
  const g = window.__obento.game;
  for (const b of [...g.foods]) g._remove(b);
  let y = 600; for (const t of [5, 4, 3, 2, 1, 0, 0]) { const r = [13, 18, 25, 31, 38, 46][t]; y -= r; g.makeFood(t, 400 - r, y, { landed: true, born: -1e9 }); y -= r - 0.5; }
});
await p.waitForTimeout(1200);
const chain = await G(() => window.__obento.game.maxCombo);
check('cascade produces a 5+ chain', chain >= 5, `max chain ${chain}`);
await shot(p, '03-chain');
await p.waitForTimeout(1500);

// settings persist
await p.tap('#b-settings'); await p.waitForTimeout(300);
check('settings pauses the game', await G(() => { const t = window.__obento.game.time; return new Promise((r) => setTimeout(() => r(window.__obento.game.time === t), 300)); }));
await p.tap('#set-bgm'); await p.tap('#set-se');
const st = await G(() => ({ s: JSON.parse(localStorage.getItem('obento-pon:v1')).settings, bgm: window.__obento.sound.bgmOn, se: window.__obento.sound.se }));
check('sound toggles apply and are saved', !st.s.bgm && !st.s.se && !st.bgm && !st.se, JSON.stringify(st));
await p.tap('#set-bgm'); await p.tap('#set-se');
await p.tap('#s-settings [data-close]');

// resume after reload
await G(() => window.dispatchEvent(new Event('pagehide')));
const before = await G(() => window.__obento.game.foods.length);
await p.reload(); await p.waitForTimeout(500);
check('"continue" offered after reload', await p.isVisible('#t-resume'));
await p.tap('#t-resume'); await p.waitForTimeout(200);
const after = await G(() => window.__obento.game.foods.length);
check('board restored', after === before, `${before} -> ${after}`);

// rotation / resize
await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(400);
await p.setViewportSize({ width: 390, height: 664 }); await p.waitForTimeout(400);
const inside = await G(() => window.__obento.game.foods.every((b) => b.position.x > 0 && b.position.x < 400 && b.position.y < 600));
check('rotation keeps every piece inside the box', inside);
check('no horizontal scroll', await G(() => document.documentElement.scrollWidth <= innerWidth));

// game over + one-tap retry + high score saved
const score = await G(() => window.__obento.game.score);
await G(() => { const g = window.__obento.game; const b = g.makeFood(6, 200, 90, { landed: true }); Matter.Body.setStatic(b, true); });
await p.waitForTimeout(4600);
await shot(p, '04-result');
check('result screen after game over', await p.isVisible('#o-retry'));
const rec = await G(() => JSON.parse(localStorage.getItem('obento-pon:v1')));
check('high score saved', rec.best >= score && rec.plays >= 1, `best ${rec.best}`);
await p.tap('#o-retry'); await p.waitForTimeout(250);
const fresh = await G(() => { const g = window.__obento.game; return { n: g.foods.length, s: g.score, over: g.over }; });
check('one-tap retry starts a clean game', fresh.n === 0 && fresh.s === 0 && !fresh.over);

// zukan
await p.tap('#b-zukan'); await p.waitForTimeout(400);
const z = await p.textContent('#z-count');
check('encyclopedia lists discoveries', /\d+ \/ 11/.test(z), z);
await shot(p, '05-zukan');
await p.tap('#s-zukan [data-close]');

// every synthesized sound renders audibly, without NaN, without clipping
const snd = await G(async () => {
  const { Sound } = await import('./js/audio.js');
  const cases = { drop: (s) => s.drop(2), tap: (s) => s.tap(5, 3), merge: (s) => s.merge(3, 1), chain5: (s) => s.merge(4, 5), king: (s) => s.king(), over: (s) => s.gameover(), high: (s) => s.highscore(), fever: (s) => s.feverStart() };
  const out = {};
  for (const [k, fn] of Object.entries(cases)) {
    const c = new OfflineAudioContext(1, 44100 * 2, 44100);
    const s = new Sound(); s._setup(c); Object.defineProperty(s, 'ok', { get: () => true });
    fn(s);
    const d = (await c.startRendering()).getChannelData(0);
    let peak = 0, bad = false; for (const v of d) { if (!Number.isFinite(v)) bad = true; peak = Math.max(peak, Math.abs(v)); }
    out[k] = bad ? -1 : +peak.toFixed(3);
  }
  return out;
});
check('all sound effects render (audible, no clipping)', Object.values(snd).every((v) => v > 0.01 && v < 1), JSON.stringify(snd));

// offline PWA
await p.goto(URL); await p.waitForTimeout(300);
const sw = await G(() => navigator.serviceWorker.ready.then(() => true));
await p.waitForTimeout(800);
await ctx.setOffline(true);
await p.reload(); await p.waitForTimeout(600);
check('service worker serves the game offline', sw && await p.isVisible('#t-play'));
await ctx.setOffline(false);

check('no script errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
