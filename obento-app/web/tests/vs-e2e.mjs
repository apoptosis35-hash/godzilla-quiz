// Two-phone online battle check: two separate emulated iPhones connect through a PeerJS broker.
// Usage: serve the repo root on :8123, run a PeerJS broker on 127.0.0.1:9000 (see README), then
//   node tests/vs-e2e.mjs [screenshot-dir]
import { chromium, devices } from 'playwright';

const SHOTS = process.argv[2] || '';
const URL = 'http://localhost:8123/bento/?nosw&peerhost=127.0.0.1&peerport=9000';
let failed = 0;
const check = (n, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${info ? ` (${info})` : ''}`); if (!ok) failed++; };
const shot = (p, n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png` });

const browser = await chromium.launch();
async function phone(name) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Could not connect to peer|peer-unavailable/.test(m.text())) p.errs.push(`${name} console: ${m.text()}`); });
  await p.goto(URL);
  await p.waitForTimeout(500);
  return p;
}
const G = (p, f) => p.evaluate(f);
async function until(p, f, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(f)) return true; await p.waitForTimeout(100); }
  return false;
}
const visible = (id) => `!document.getElementById('${id}').hidden`;
const shown = (id) => `document.getElementById('${id}').classList.contains('show')`;
const text = (id) => `document.getElementById('${id}').textContent`;

const A = await phone('A'), B = await phone('B');

// host makes a room
await A.tap('#t-vs'); await A.tap('#l-host');
check('host gets a 5-letter room code', await until(A, () => /^[A-Z0-9]{5}$/.test(document.getElementById('l-code').textContent)));
const code = await A.textContent('#l-code');
await shot(A, '1-host');

// a wrong code is reported
await B.tap('#t-vs'); await B.tap('#l-join-open');
await B.fill('#l-input', 'ZZZZZ'); await B.tap('#l-join');
check('unknown code is reported', await until(B, () => /見つかりません|つながりませんでした/.test(document.getElementById('l-status').textContent), 16000), await B.textContent('#l-status'));
await B.tap('#l-back'); await B.tap('#l-join-open');

// the right code (typed in lower case) connects
await B.fill('#l-input', code.toLowerCase()); await B.tap('#l-join');
check('guest connects with the code', await until(B, new Function(`return ${visible('l-ready')}`)));
check('host sees the connection and can start', await until(A, new Function(`return ${visible('l-ready')} && ${visible('l-start')}`)));
check('the guest waits for the host', await G(B, new Function(`return !${visible('l-start')} && ${visible('l-wait')}`)));
await shot(A, '2-ready');

// countdown and start
await A.tap('#l-start');
check('both phones count down', await until(A, new Function(`return ${visible('countdown')}`)) && await until(B, new Function(`return ${visible('countdown')}`)));
check('both phones start the match', await until(A, () => window.__obento.vs.phase === 'play', 6000) && await until(B, () => window.__obento.vs.phase === 'play', 6000));
const order = (p) => G(p, () => { const g = window.__obento.game; return JSON.stringify([g.current, g.next, ...g.history]); });
const oA = await order(A), oB = await order(B);
check('both get the same okazu order', oA === oB, oA);

// A plays a little; B sees A's score in the opponent panel
const box = await A.locator('#stage').boundingBox();
for (let i = 0; i < 8; i++) { await A.touchscreen.tap(box.x + 40 + i * 40, box.y + 50); await A.waitForTimeout(420); }
check('the opponent board reaches the other phone', await until(B, () => window.__obento.vs.opp.foods.length >= 3, 4000));

// a big merge on A sends うめぼし to B
await G(A, () => { const g = window.__obento.game; const r = 60; g.makeFood(6, 70, 600 - r, { landed: true, born: -1e9 }); g.makeFood(6, 70 + 2 * r - 1, 600 - r, { landed: true, born: -1e9 }); });
check('B is warned about incoming うめぼし', await until(B, new Function(`return ${visible('ojama-warn')}`)), await B.textContent('#ojama-n'));
await shot(B, '3-warn');
check('the うめぼし fall into B\'s box', await until(B, () => window.__obento.game.foods.some((b) => b.food.ojama), 6000));
await B.waitForTimeout(1500);
await shot(B, '4-umeboshi');
await shot(A, '5-attacker');

// a merge right next to a うめぼし pops it
const popped = await G(B, async () => {
  const g = window.__obento.game;
  const u = g.foods.find((b) => b.food.ojama && b.food.landed);
  if (!u) return -1;
  g.makeFood(1, u.position.x - 18, u.position.y - 45, { landed: true, born: -1e9 });
  g.makeFood(1, u.position.x + 17, u.position.y - 45, { landed: true, born: -1e9 });
  await new Promise((r) => setTimeout(r, 700));
  return u.food.dead ? 1 : 0;   // that very うめぼし is gone (more may have rained in meanwhile)
});
check('a merge next to a うめぼし pops it', popped >= 1, String(popped));

// B overflows: A wins, B loses
await G(B, () => { const g = window.__obento.game; const b = g.makeFood(5, 200, 90, { landed: true }); Matter.Body.setStatic(b, true); });
check('A wins when B overflows', await until(A, new Function(`return ${shown('s-vsresult')} && ${text('vr-head')} === 'かち！'`), 9000), await A.textContent('#vr-head'));
check('B loses', await until(B, new Function(`return ${shown('s-vsresult')} && ${text('vr-head')} === 'まけ…'`)), await B.textContent('#vr-head'));
await shot(A, '6-win'); await shot(B, '7-lose');
const recA = await G(A, () => JSON.parse(localStorage.getItem('obento-pon:v1')).vsWins);
const recB = await G(B, () => JSON.parse(localStorage.getItem('obento-pon:v1')).vsLosses);
check('win / loss records are saved', recA === 1 && recB === 1, `${recA}/${recB}`);

// a rematch needs both players
await B.tap('#vr-again');
check('rematch waits for the other player', await G(B, new Function(`return ${visible('vr-wait')}`)) && await G(A, new Function(`return ${shown('s-vsresult')}`)));
await A.tap('#vr-again');
check('rematch starts on both phones', await until(A, () => window.__obento.vs.phase === 'play', 7000) && await until(B, () => window.__obento.vs.phase === 'play', 7000));
const o2A = await order(A), o2B = await order(B);
check('rematch: a shared okazu order again', o2A === o2B, o2A);

// time up: higher score wins
await G(A, () => { window.__obento.game.score = 500; });
await G(B, () => { window.__obento.game.score = 300; });
await G(A, () => { window.__obento.vs.endAt = performance.now() + 300; });
await G(B, () => { window.__obento.vs.endAt = performance.now() + 300; });
check('time up: the higher score wins', await until(A, new Function(`return ${shown('s-vsresult')} && ${text('vr-head')} === 'かち！'`), 9000) && await until(B, new Function(`return ${text('vr-head')} === 'まけ…'`)), await B.textContent('#vr-why'));

// B leaves: A is told
await B.tap('#vr-quit');
check('leaving tells the other player', await until(A, () => /やめました|切れました/.test(document.getElementById('vr-wait').textContent), 12000), await A.textContent('#vr-wait'));
check('the leaver is back at the title', await G(B, new Function(`return ${shown('s-title')}`)));

const errs = [...A.errs, ...B.errs];
check('no script errors', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
