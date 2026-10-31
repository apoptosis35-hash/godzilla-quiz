// Browser end-to-end check on an emulated iPhone (Playwright + Chromium).
// Usage: serve the repo root (e.g. `npx http-server -p 8123 ..`) then
//   node tests/e2e.mjs [http://localhost:8126/] [screenshot-dir]   (serve obento-app/web)
import { chromium, devices } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8126/';
const SHOTS = process.argv[3] || '';
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`); if (!ok) failed++; };
const shot = (p, n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png` });

const browser = await chromium.launch();
// SHOT_VIEWPORT=430x932 takes the screenshots at another phone size (store listing images, 3x)
const vp = process.env.SHOT_VIEWPORT && process.env.SHOT_VIEWPORT.split('x').map(Number);
const ctx = await browser.newContext({ ...devices['iPhone 13'], ...(vp ? { viewport: { width: vp[0], height: vp[1] }, screen: { width: vp[0], height: vp[1] }, deviceScaleFactor: 3 } : {}), permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const G = (fn) => p.evaluate(fn);

await p.goto(URL);
await p.waitForTimeout(500);
await shot(p, '01-title');
check('title screen shown', await p.isVisible('#t-play'));
// store app: nothing from the family version, nothing to share yet, no ads UI on the web
const nErr = errors.length;
check('no family photos in the app', await G(async () => (await fetch('img/cameo.jpg')).status === 404 && (await fetch('img/rare.png')).status === 404));
errors.splice(nErr);   // those two 404s were asked for on purpose
check('share buttons hidden until there is a store page', !(await p.isVisible('#t-share')));
check('no "add to home screen" tip in the app', !(await p.isVisible('#install-tip')));
check('the rare piece is the drawn golden onigiri', await G(() => { const sp = window.__obento.renderer.sprites.get(98, 'normal'); const c = document.createElement('canvas'); c.width = sp.width; c.height = sp.height; const x = c.getContext('2d'); x.drawImage(sp, 0, 0); const d = x.getImageData(0, 0, sp.width, sp.height).data; let gold = 0, all = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; all++; if (d[i] > 200 && d[i + 1] > 140 && d[i + 2] < 150) gold++; } return gold / all > 0.4; }));
await p.tap('#t-settings');
check('no reward photo until one is picked', !(await p.isVisible('#cameo-thumb')) && !(await p.isVisible('#cameo-test')));
check('no purchase UI outside the store app', !(await p.isVisible('#shop')));
await p.tap('#s-settings [data-close]');
await p.waitForTimeout(250);

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

// power drop: pull down from the touch point; moving back up lowers it; aim and pull work together
await p.waitForTimeout(500);
const sx = box.x + 150, sy = box.y + 60;
await touch('touchStart', sx, sy);
await touch('touchMove', sx, sy + 60); const pw1 = await G(() => window.__obento.renderer.power);
await touch('touchMove', sx, sy + 20); const pw2 = await G(() => window.__obento.renderer.power);
const aimStart = await G(() => window.__obento.renderer.aimX);
await touch('touchMove', sx + 80, sy + 200); const pw3 = await G(() => [window.__obento.renderer.power, window.__obento.renderer.aimX]);
const scrolled = await G(() => scrollY + document.scrollingElement.scrollTop);
await touch('touchEnd'); await p.waitForTimeout(20);
const pd = await G(() => { const b = window.__obento.game.lastDropped; return { power: b.food.power, x: b.position.x, aim: window.__obento.renderer.aimX }; });
check('pull distance sets the power', Math.abs(pw1 - (60 - 12) / 120) < 0.02, pw1.toFixed(2));
check('pulling back up lowers the power', pw2 < 0.1, pw2.toFixed(2));
check('aim and pull at the same time, capped at max', pw3[0] === 1 && pw3[1] > aimStart + 40, JSON.stringify([...pw3, aimStart]));
check('release throws at full power where aimed', pd.power === 1 && Math.abs(pd.x - pd.aim) < 1, JSON.stringify(pd));
check('dragging never scrolls the page', scrolled === 0);

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
  let y = 600; for (const t of [5, 4, 3, 2, 1, 0, 0]) { const r = [13, 18, 25, 32, 40, 49][t]; y -= r; g.makeFood(t, 400 - r, y, { landed: true, born: -1e9 }); y -= r - 0.5; }
});
await p.waitForTimeout(1200);
const chain = await G(() => window.__obento.game.maxCombo);
check('cascade produces a 5+ chain', chain >= 5, `max chain ${chain}`);
await shot(p, '03-chain');
await p.waitForTimeout(1500);

// SMASH banners from a power-drop chain
await G(() => {
  const g = window.__obento.game;
  for (const b of [...g.foods]) g._remove(b);
  const r = 18;
  g.makeFood(1, r, 600 - r, { landed: true, born: -1e9 }); g.makeFood(1, r * 3 + 8, 600 - r, { landed: true, born: -1e9 });
  g.makeFood(2, r * 4 + 8 + 65, 600 - 25, { landed: true, born: -1e9 });
  g.current = 2; g.cooldown = 0; g.drop(r * 3 + 8 + 18, 1);
});
let smashSeen = '';
for (let i = 0; i < 30 && !smashSeen; i++) { await p.waitForTimeout(50); smashSeen = await G(() => [...document.querySelectorAll('#banners .banner')].map((e) => e.textContent).find((t) => /SMASH/.test(t)) || ''); }
await shot(p, '03b-smash');
check('power-drop chain shows a SMASH banner', /SMASH/.test(smashSeen), smashSeen);
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
check('encyclopedia lists discoveries', /\d+ \/ 10/.test(z), z);
await shot(p, '05-zukan');
await p.tap('#s-zukan [data-close]');

// every synthesized sound renders audibly, without NaN, without clipping
const snd = await G(async () => {
  const { Sound } = await import('./js/audio.js');
  const cases = { drop: (s) => s.drop(2), tap: (s) => s.tap(5, 3), merge: (s) => s.merge(3, 1), chain5: (s) => s.merge(4, 5), king: (s) => s.king(), over: (s) => s.gameover(), high: (s) => s.highscore(), fever: (s) => s.feverStart(), charge: (s) => s.charge(3), powerDrop: (s) => s.powerDrop(1), impact: (s) => s.impact(1), smash: (s) => s.smash(5) };
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

check('no script errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
