// Browser end-to-end check on emulated iPhones (Playwright + Chromium).
// Usage: serve the repo root (e.g. `npx http-server -p 8123 ..`) then
//   node tests/e2e.mjs [http://localhost:8123/jam/] [screenshot-dir]
import { chromium, devices } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8123/jam/';
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
const cdp = await ctx.newCDPSession(p);
const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const noOverflow = () => G(() => [...document.querySelectorAll('.screen.on *')].every((e) => { const r = e.getBoundingClientRect(); return r.width === 0 || (r.right <= innerWidth + 1 && r.left >= -1) || getComputedStyle(e).position === 'absolute' && e.closest('.stage'); }));

await p.goto(URL);
await p.waitForTimeout(600);
check('home screen', await p.isVisible('[data-go=lab]'));
check('home fits the screen', await noOverflow());

// ---- tutorial: tap a car, hold the brake, a jam appears
await p.tap('[data-go=lab]');
await p.waitForTimeout(800);
check('tutorial guide shown', (await p.textContent('#guide')).includes('1台だけブレーキ'));
const pos = await G(() => { const pl = window.__jam.play; const v = pl.sim.st.vehicles[5]; const q = pl.r.vehPos(v, 0); const V = pl.r.view(); const rc = document.getElementById('road').getBoundingClientRect(); const x = q.x - Math.cos(q.ang) * v.len / 2, y = q.y - Math.sin(q.ang) * v.len / 2; return { x: rc.left + x * V.s + V.tx, y: rc.top + y * V.s + V.ty, id: v.id }; });
await touch('touchStart', pos.x, pos.y); await touch('touchEnd');
await p.waitForTimeout(300);
check('tap selects the vehicle', await G(() => window.__jam.play.selected) === pos.id);
check('vehicle card shows speed/gap/driver', /km\/h/.test(await p.textContent('#vc-grid')) && /車間/.test(await p.textContent('#vc-grid')));
const bb = await p.locator('#vc-brake').boundingBox();
await touch('touchStart', bb.x + bb.width / 2, bb.y + bb.height / 2);
await p.waitForTimeout(400);
check('holding the brake slows the car down', await G((id) => { const v = window.__jam.play.sim.st.vehicles.find((x) => x.id === id); return v.force > 0 && v.a < -1; }, pos.id));
await p.waitForTimeout(1600);
await touch('touchEnd');
await G(() => window.__jam.play.setSpeed(4));
await p.waitForFunction(() => window.__jam.play.tut && window.__jam.play.tut.step === 3, null, { timeout: 30000 }).catch(() => {});
const tutText = await p.textContent('#guide');
check('tutorial ends with a result based on the simulation', tutText.includes('渋滞は、事故がなくても発生する') || tutText.includes('渋滞になりませんでした'), tutText.slice(0, 30));
check('player brake chain recorded', await G(() => window.__jam.play.playerChain()) >= 3);
await shot('e2e-tutorial');
await p.tap('#g-ok');
check('tutorial is remembered', await G(() => window.__jam.data.tutorialDone));

// ---- lab: sliders act on the running simulation
await G(() => window.__jam.play.expand(true));
await p.waitForTimeout(300);
const slider = p.locator('#pane-ctl input[type=range]').first();
await slider.evaluate((e) => { e.value = 28; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); });
check('vehicle count slider changes the number of cars', await G(() => window.__jam.play.sim.st.vehicles.length) === 28);
await G(() => { const pl = window.__jam.play; pl.tab('graph'); });
await p.waitForTimeout(1500);
check('space-time diagram is drawn from samples', await G(() => window.__jam.play.st.n) > 10);
// speeds and pause/resume
await p.tap('#t-play'); const t1 = await G(() => window.__jam.play.sim.st.t); await p.waitForTimeout(500);
check('pause stops time', await G(() => window.__jam.play.sim.st.t) === t1);
await p.tap('#t-play'); await p.tap('#t-speed [data-s="0.25"]');
const t2 = await G(() => window.__jam.play.sim.st.t); await p.waitForTimeout(1000);
const dt = (await G(() => window.__jam.play.sim.st.t)) - t2;
check('quarter speed runs slower', dt > 0.1 && dt < 0.5, dt.toFixed(2));
await p.tap('#t-view'); await p.tap('#t-view');
check('view switches to the wave view', await G(() => window.__jam.play.r.opts.mode) === 'wave');
await shot('e2e-lab');
await p.tap('#p-back');

// ---- mission 1 to the result screen, then reload keeps the stars
await p.tap('[data-go=missions]');
await p.locator('#mission-list .card').first().tap();
await p.tap('#m-go');
await p.waitForTimeout(300);
await G(() => { const pl = window.__jam.play; const v = pl.sim.st.vehicles[0]; pl.select(v.id); pl.brake(true); });
await p.waitForTimeout(2500);
await G(() => { window.__jam.play.brake(false); window.__jam.play.setSpeed(4); });
await p.waitForSelector('#r-again', { timeout: 40000 });
const stars = await G(() => window.__jam.SAVE.stageStars('s1'));
check('mission 1 scored from the simulation', stars >= 1, `${stars} stars`);
await shot('e2e-result');
await p.reload(); await p.waitForTimeout(500);
check('stars survive a reload', await G(() => window.__jam.SAVE.stageStars('s1')) === stars);

// ---- flow mission: fast-forward to the result
await G(() => { const d = window.__jam.SAVE.get(); d.stages.s2 = { stars: 1 }; d.stages.s3 = { stars: 1 }; window.__jam.show('missions'); });
await p.locator('#mission-list .card').nth(3).tap();
await p.tap('#m-go');
await p.locator('#pane-ctl .opts button', { hasText: '700' }).tap();
await p.tap('#action-row .btn');
await p.waitForTimeout(500);
check('twin (no measures) runs alongside', await G(() => !!window.__jam.play.twin && window.__jam.play.twin.pol.meter.ramp === undefined && window.__jam.play.sim.pol.meter.ramp === 700));
await p.tap('#action-row .btn');
await p.waitForSelector('#r-again', { timeout: 60000 });
check('merge mission result has a comparison table', (await p.textContent('#modal-card')).includes('対策なし'));
await shot('e2e-merge-result');
await G(() => { document.getElementById('modal').classList.remove('on'); window.__jam.play.leave(); });

// ---- quiz
await G(() => window.__jam.show('home'));
await p.tap('[data-go=quiz]');
await G(() => window.__jam.play.quizAsk());
await p.waitForTimeout(300);
check('quiz offers 4 causes', await p.locator('#quiz-ans .btn').count() === 4);
await p.locator('#quiz-ans .btn').first().tap();
await p.waitForTimeout(2000);
check('answer reveals the cause and the origin', (await p.textContent('#guide')).includes('原因は') && await G(() => !!window.__jam.play.r.opts.highlight));
await p.tap('#q-end');

// ---- smaller iPhone and landscape
await p.setViewportSize({ width: 375, height: 667 });
await G(() => window.__jam.show('home')); await p.waitForTimeout(300);
check('iPhone SE: home fits', await noOverflow());
await p.tap('[data-go=sandbox]'); await p.locator('#sandbox-list .card').nth(4).tap(); await p.waitForTimeout(800);
check('iPhone SE: road canvas has room', await G(() => document.getElementById('road').getBoundingClientRect().height) > 250);
await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(500);
check('landscape: road and panel side by side', await G(() => { const a = document.getElementById('stage').getBoundingClientRect(), b = document.getElementById('sheet').getBoundingClientRect(); return a.width > 300 && b.left >= a.right - 2; }));
await shot('e2e-landscape');

// ---- PWA
check('service worker registered', await G(async () => !!(await navigator.serviceWorker.getRegistration())));
check('manifest linked', await G(() => !!document.querySelector('link[rel=manifest]')));
check('no JavaScript errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
