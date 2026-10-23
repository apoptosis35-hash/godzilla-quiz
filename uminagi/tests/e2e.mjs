// End-to-end check on an emulated iPhone 13 in landscape (Playwright + Chromium, WebGL via SwiftShader).
// Usage: serve the repo root (e.g. `python3 -m http.server 8123` there) then
//   node uminagi/tests/e2e.mjs [http://localhost:8123/uminagi/] [screenshot-dir]
// SwiftShader renders on the CPU, so the test pauses the game loop and steps frames itself.
import { chromium, devices } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8123/uminagi/';
const SHOTS = process.argv[3] || '';
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`); if (!ok) failed++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
const p = await ctx.newPage();
p.setDefaultTimeout(120000);   // taps wait for a composited frame, which SwiftShader can take a while to produce
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const G = (fn, a) => p.evaluate(fn, a);
const shot = async (n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.jpg`, quality: 80, timeout: 180000 }); };
// step the game without drawing (SwiftShader is slow); the last step draws so screenshots are current
const steps = (n, dt = 1 / 30) => G(([n, dt]) => { const a = window.__uminagi; for (let i = 0; i < n; i++) a.frame(dt, i === n - 1); }, [n, dt]);
const pos = () => G(() => { const q = window.__uminagi.player.pos; return { x: q.x, y: q.y, z: q.z }; });
const tp = (x, z, yaw = 0) => G(([x, z, yaw]) => { const a = window.__uminagi; a.player.place(x, z, yaw); a.player.heading = yaw + Math.PI; }, [x, z, yaw]);
// hold the virtual stick: dx, dy in stick radii (dy < 0 = forward)
const stick = (dx, dy) => G(([dx, dy]) => {
  const fire = (type, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: 11, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
  const x0 = 150, y0 = 260;
  fire('pointerdown', x0, y0); fire('pointermove', x0 + dx * 52, y0 + dy * 52);
  window.__release = () => fire('pointerup', x0 + dx * 52, y0 + dy * 52);
}, [dx, dy]);
const release = () => G(() => window.__release && window.__release());

const t0 = Date.now();
await p.goto(URL + '?q=low&town=all');   // the whole town (a fresh game starts as an empty bay)
await p.waitForSelector('#start:not([hidden])', { timeout: 240000 });
check('models, textures and terrain load; title appears', true, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
await G(() => { try { localStorage.removeItem('uminagi-save-v1'); } catch {} });
await shot('01-title');
await p.tap('#startbtn');
await G(() => window.__uminagi.renderer.setAnimationLoop(null));
check('HUD appears after start', await p.isVisible('#hud'));
const info = await G(() => { const a = window.__uminagi; return { models: Object.keys(a.town.protos).length, colliders: a.town.colliders.length, trees: a.town.treeCount, npcs: a.town.npcs.length, boats: a.town.boats.length }; });
check('town is built', info.models >= 80 && info.colliders > 300 && info.boats >= 6 && info.npcs >= 10, JSON.stringify(info));

// --- island life (js/life): the shopkeeper's welcome on a fresh save hands over the rod and the net
const talkThrough = (choices) => G(async (choices) => {
  const L = window.__uminagi.life, said = [];
  for (let i = 0; i < 300 && L.ui.busy(); i++) {
    const q = L.ui.queue;
    if (q) { if (L.ui.typing) L.ui.endLine(); said.push(q.lines[q.i]); if (q.choices && q.i === q.lines.length - 1) L.ui.finish(choices.length ? choices.shift() : q.choices.length - 1); else L.ui.advance(); }
    else if (L.ui.panelRes) L.ui.closePanel(choices.length ? choices.shift() : -1);
    await new Promise((r) => setTimeout(r, 5));
  }
  return said;
}, choices);
await G(() => { const L = window.__uminagi.life; L.introStarted = true; L.intro(); });
await talkThrough([]);
const life = await G(() => { const L = window.__uminagi.life; return { pocket: L.st.pocket.join(','), villagers: L.villagers.length, busy: L.ui.busy() }; });
check('welcome talk gives the rod and the net', !life.busy && /rod/.test(life.pocket) && /net/.test(life.pocket) && life.villagers === 8, JSON.stringify(life));
// fishing: cast from the quay, a fish takes the float, A on the bite lands it
const fish = await G(() => {
  const a = window.__uminagi, L = a.life, step = (n) => { for (let i = 0; i < n; i++) a.frame(0.05, false); };
  a.player.place(-20, 21.3, Math.PI); a.player.heading = 0; L.equip('rod'); step(2); L.press(); step(12);
  const c = L.cast; if (!c || c.phase !== 'wait') return { phase: c && c.phase };
  L.fish.length = 0; for (let i = 0; i < 40 && !L.fish.length; i++) L.spawnFish(a.player.pos);
  const f = L.fish[0]; if (!f) return { phase: 'nofish' };
  f.x = c.x + 1.2; f.z = c.z + 0.8; f.state = 'approach'; c.fish = f;
  for (let i = 0; i < 400 && c.phase !== 'bite'; i++) step(1);
  const phase = c.phase; L.press(); step(2);
  return { phase, fish: f.sp.id, got: L.st.pocket.includes(f.sp.id) };
});
await talkThrough([]);
check('fishing: bite and catch', fish.phase === 'bite' && fish.got, JSON.stringify(fish));
// chat with a villager: first meeting, then friendship goes up
const chat = await G(() => { const L = window.__uminagi.life, v = L.villagers.find((x) => x.def.role === 'resident'); L.talk(v); return v.def.id; });
const said = await talkThrough([0, 2]);
const fr = await G((id) => window.__uminagi.life.st.friend[id] || 0, chat);
check('villager chat and friendship', said.length >= 3 && fr >= 1, `${said.length} lines, friend ${fr}`);
await G(() => window.__uminagi.life.equip(null));

// --- walking with the virtual stick (left half), camera-relative
await tp(0, 19, 0);
let a = await pos();
await stick(0, -1); await steps(45); await release(); await steps(5);
let b = await pos();
check('virtual stick walks forward (north, away from the camera)', a.z - b.z > 3, `${(a.z - b.z).toFixed(2)} m`);
await shot('02-walk');
// dash button doubles the speed
await tp(0, 19, 0); a = await pos();
await p.tap('#dash');
await stick(0, -1); await steps(30); await release(); await steps(3);
b = await pos();
await p.tap('#dash');
check('dash is faster than walking', a.z - b.z > 5, `${(a.z - b.z).toFixed(2)} m in 1 s`);

// --- right-half swipe turns the camera
const yaw0 = await G(() => window.__uminagi.player.yaw);
await G(() => {
  const fire = (type, x) => window.dispatchEvent(new PointerEvent(type, { pointerId: 12, pointerType: 'touch', clientX: x, clientY: 200, bubbles: true }));
  fire('pointerdown', 600); fire('pointermove', 650); fire('pointermove', 700); fire('pointerup', 700);
});
await steps(2);
const yaw1 = await G(() => window.__uminagi.player.yaw);
check('swipe on the right half rotates the camera', Math.abs(yaw1 - yaw0) > 0.3, `${(yaw1 - yaw0).toFixed(2)} rad`);

// --- buildings block the player: walk south into the fish market's back wall from the back lane
await tp(-2, -5, Math.PI);
await stick(0, -1); await steps(60); await release();
b = await pos();
check('fish market back wall stops the player', b.z < -2.0, `z=${b.z.toFixed(2)}`);
// a house on the first terrace: walk north from the lane into its front wall
const house = await G(() => { const a = window.__uminagi; const c = a.town.colliders.find((c) => c.type === 'b' && c.z < -17 && c.z > -24 && c.x < -40 && c.hw > 2.5); return c && { x: c.x, z: c.z, hd: c.hd }; });
await tp(house.x, -15.3, 0);
await stick(0, -1); await steps(60); await release();
b = await pos();
check('houses block the player (stops at the front wall)', b.z > house.z + house.hd && b.z < -15.6 && b.y > 3, `z=${b.z.toFixed(2)}, wall at ${(house.z + house.hd).toFixed(2)}`);

// --- climbing a stone stair (back lane -> first terrace)
await tp(-38.7, -9.5, 0);
a = await pos();
await stick(0, -1); await steps(90); await release(); await steps(10);
b = await pos();
check('stone stairs carry the player up a terrace', b.y - a.y > 1.6, `y ${a.y.toFixed(2)} -> ${b.y.toFixed(2)}`);
await shot('03-stairs');
// the street slope
await tp(40, -10, 0); a = await pos();
await stick(0, -1); await steps(120); await release();
b = await pos();
check('walking up the main street climbs the slope', b.y - a.y > 1.0 && a.z - b.z > 8, `dy ${(b.y - a.y).toFixed(2)}`);
// the sea: can't walk off the quay
await tp(0, 20.5, Math.PI); // facing south (camera north)
await G(() => { window.__uminagi.player.yaw = Math.PI; });
await stick(0, -1); await steps(60); await release();
b = await pos();
check('the quay edge stops the player from walking into the sea', b.z < 22.1 && b.y > 1.0, `z=${b.z.toFixed(2)} y=${b.y.toFixed(2)}`);

// --- every district is reachable on foot from the harbour (flood fill with the player's own rules)
const targets = {
  fish_market: [-2, 10], piers: [-12, 40], red_lighthouse: [-20, 108], east_breakwater: [40, 102], east_quay: [58, 80],
  main_street_top: [40, -105], terrace1: [-40, -15.5], terrace4: [0, -54], terrace7: [-30, -93], shrine: [-9, -122],
  cliff_path: [-83, -80], lighthouse_hill: [-115, -5], viewpoint: [-100, -3], east_houses: [66, -30], beach: [90, 82],
};
const routes = await G((t) => window.__uminagi.validateRoutes(t, 1), targets);
for (const k of Object.keys(targets)) check(`reachable on foot: ${k}`, routes[k]);
console.log(`     (${routes.__cells} walkable 1 m cells)`);

// --- area names, minimap, map fast travel
await tp(-9, -122, 0); await steps(2);
check('area name shows the shrine', (await p.textContent('#place')).includes('神社'));
await shot('04-shrine');
await p.tap('#mapbtn');
check('big map opens', await p.isVisible('#bigmap'));
await shot('05-map');
await p.tap('[data-go="hill"]');
await steps(2);
b = await pos();
check('map fast travel to the lighthouse hill', b.x < -95 && b.y > 30, `(${b.x.toFixed(1)}, ${b.y.toFixed(1)}, ${b.z.toFixed(1)})`);
await shot('06-hill');

// --- time of day
await p.tap('#setbtn');
await p.tap('[data-tod="evening"]'); await steps(90);
check('evening sky', await G(() => window.__uminagi.world.todName === 'evening' && window.__uminagi.world.cur.sunI < 3));
await p.tap('[data-tod="night"]'); await steps(90);
const glow = await G(() => window.__uminagi.mats.glow.lantern_red.m.emissiveIntensity);
check('night lights up lanterns and windows', glow > 1.0, `lantern emissive ${glow.toFixed(2)}`);
await p.tap('#setclose');
await shot('07-night');

// --- save and continue
await tp(40, -50, 0.5); await G(() => window.__uminagi.save());
await p.reload();
await p.waitForSelector('#start:not([hidden])', { timeout: 240000 });
check('"continue" appears after a reload', await p.isVisible('#continue'));
await p.tap('#continue');
await G(() => window.__uminagi.renderer.setAnimationLoop(null));
b = await pos();
check('position and time of day are restored', Math.abs(b.x - 40) < 0.5 && Math.abs(b.z + 50) < 0.5 && await G(() => window.__uminagi.world.todName === 'night'), `(${b.x.toFixed(1)}, ${b.z.toFixed(1)})`);

// --- render stats at the harbour (low quality preset)
await G(() => { const a = window.__uminagi; a.world.setTimeOfDay('day', true); a.player.place(0, 19, 0); });
await steps(3);
const st = await G(() => { const a = window.__uminagi; a.frame(0.03); return { calls: a.renderer.info.render.calls, tris: a.renderer.info.render.triangles }; });
console.log(`     render: ${st.calls} draw calls, ${st.tris} triangles (low preset, harbour view)`);
check('no errors in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
