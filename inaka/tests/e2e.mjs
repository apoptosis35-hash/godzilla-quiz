// Browser end-to-end check on an emulated iPhone in landscape (Playwright + Chromium, WebGL via SwiftShader).
// Usage: serve the repo root (e.g. `python3 -m http.server 8123` there) then
//   node tests/e2e.mjs [http://localhost:8123/inaka/] [screenshot-dir]
// Set CHROMIUM=/path/to/chrome to use a preinstalled browser.
import { chromium, devices } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8123/inaka/';
const SHOTS = process.argv[3] || '';
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`); if (!ok) failed++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const G = (fn, a) => p.evaluate(fn, a);
const shot = (n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png` });
const pos = () => G(() => { const q = window.__inaka.player.pos; return { x: q.x, z: q.z, y: q.y }; });
const tp = (x, z) => G(([x, z]) => { window.__inaka.player.pos.set(x, 0, z); }, [x, z]);
const stamps = () => G(() => Object.keys(window.__inaka.G.stamps));
const act = async () => { await p.waitForSelector('#act.on', { timeout: 3000 }).catch(() => {}); const label = await p.textContent('#act'); await p.tap('#act'); await p.waitForTimeout(300); return label; };

await p.goto(URL);
await p.waitForSelector('#start:not([hidden])', { timeout: 90000 });
check('models load and the title appears', true);
await shot('01-title');
await p.tap('#startbtn');
await p.waitForTimeout(800);
check('day starts at 8:00', (await p.textContent('#clock')).startsWith('8:0'));

// touch joystick on the left half moves the player
const a = await pos();
const box = { x: 150, y: 250 };
await p.touchscreen.tap(box.x, box.y); // focus
await G(([x, y]) => {
  const cv = document.getElementById('gl');
  const fire = (type, cx, cy) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: cx, clientY: cy, bubbles: true }));
  fire('pointerdown', x, y); fire('pointermove', x, y - 60);
  window.__lift = () => fire('pointerup', x, y - 60);
}, [box.x, box.y]);
await p.waitForTimeout(2000);
await G(() => window.__lift());
const b = await pos();
check('virtual stick walks the kid', Math.hypot(b.x - a.x, b.z - a.z) > 2, `${Math.hypot(b.x - a.x, b.z - a.z).toFixed(1)} m`);
await shot('02-walk');

// walls: standing inside the farmhouse pushes the kid back out through the front
await tp(-24, -12);
await p.waitForTimeout(400);
check('the farmhouse is solid', (await pos()).z > -10.05, `z=${(await pos()).z.toFixed(2)}`);

// shop: no money -> refused; with coins -> stamp
await tp(13.6, -3.4); await p.waitForTimeout(300);
check('shop counter offers sweets', (await act()).includes('駄菓子'));
check('cannot buy without money', !(await stamps()).includes('dagashi'));
await G(() => { window.__inaka.G.money = 200; });
await act();
check('buying sweets gives a stamp', (await stamps()).includes('dagashi'));

// watermelon delivery
await tp(14.2, 22.2); await p.waitForTimeout(300);
await act();
check('picks up a watermelon', await G(() => !!window.__inaka.player.carry));
await G(() => { const o = window.__inaka.world.obaachan.position; window.__inaka.player.pos.set(o.x + 0.9, 0, o.z + 0.9); });
await p.waitForTimeout(300);
await act();
check('delivers it to grandma', (await stamps()).includes('suika'));

// river, steps up to the shrine
await tp(-10, 31); await G(() => { window.__inaka.input.keys.add('KeyS'); window.__inaka.player.yaw = 0; }); await p.waitForTimeout(100);
await tp(-10, 33.5); await p.waitForTimeout(400); await G(() => window.__inaka.input.keys.delete('KeyS'));
check('wading in the river gives a stamp', (await stamps()).includes('kawa'));
await tp(0, -58.6); await p.waitForTimeout(800);
check('the shrine terrace is raised', (await pos()).y > 1.0, `y=${(await pos()).y.toFixed(2)}`);
await act(); await p.waitForFunction(() => window.__inaka.G.stamps.omairi, null, { timeout: 10000 }).catch(() => {});
check('praying at the shrine gives a stamp', (await stamps()).includes('omairi'));
await shot('03-shrine');

// the train stops at the station; standing on the platform when it leaves gives a stamp
await G(() => { const s = window.__inaka.world.trainState; s.phase = 'stop'; s.x = 12; s.t = 1.0; });
await tp(9, 45.5);
await p.waitForFunction(() => window.__inaka.G.stamps.densha, null, { timeout: 20000 }).catch(() => {});
check('seeing the train off gives a stamp', (await stamps()).includes('densha'));
await shot('04-station');

// the day ends at 18:00 with the picture diary
await G(() => { window.__inaka.G.t = 420; });
await p.waitForSelector('#diary:not([hidden])', { timeout: 8000 });
const diary = await p.textContent('#diarytext');
check('diary lists the day', diary.includes('駄菓子屋') && diary.includes('神社'));
await shot('05-diary');
await p.tap('#again'); await p.waitForTimeout(500);
check('a new day can start', (await stamps()).length === 0 && (await p.textContent('#clock')).startsWith('8:0'));

check('no errors in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
