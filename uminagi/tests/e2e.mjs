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

// --- island life (js/life): a fresh save starts with no money and no tools; the welcome teaches the DIY recipes
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
const life = await G(() => { const L = window.__uminagi.life; return { pocket: L.st.pocket.join(','), money: L.st.money, recipes: ['rod', 'net', 'axe'].every((id) => L.craft.known(id)), branches: L.pickups.filter((p) => p.id === 'branch').length, villagers: L.villagers.length, busy: L.ui.busy() }; });
check('welcome: no free tools, DIY recipes, branches to pick up', !life.busy && !/rod|net/.test(life.pocket) && life.money === 0 && life.recipes && life.branches >= 6 && life.villagers === 10, JSON.stringify(life));
// five branches make a flimsy rod at the stall
const rod = await G(async () => {
  const L = window.__uminagi.life; L.st.addMat('branch', 5);
  let done = false; L.craft.menu().then(() => { done = true; });
  for (let k = 0; k < 50 && !L.ui.panelRes; k++) await new Promise((r) => setTimeout(r, 5));
  L.ui.closePanel([...document.querySelectorAll('.plist .btn')].findIndex((b) => b.textContent.startsWith('つりざお')));
  for (let k = 0; k < 300 && !done; k++) { if (L.ui.queue) { if (L.ui.typing) L.ui.endLine(); L.ui.advance(); } await new Promise((r) => setTimeout(r, 5)); }
  return { rod: L.st.has('rod'), dur: L.st.ext.dur.rod };
});
check('DIY a flimsy rod from branches', rod.rod && rod.dur === 10, JSON.stringify(rod));
// fishing: cast from the quay, a fish takes the float, A on the bite lands it
const fish = await G(() => {
  const a = window.__uminagi, L = a.life, step = (n) => { for (let i = 0; i < n; i++) a.frame(0.05, false); };
  a.player.place(-20, 21.3, Math.PI); a.player.heading = 0; L.equip('rod'); step(2); L.anim = null; L.press(); step(12);
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
// home: into the tent, place a table, back out
const home = await G(() => {
  const a = window.__uminagi, L = a.life, step = (n) => { for (let i = 0; i < n; i++) a.frame(0.05, false); };
  L.season.target = () => null;   // no shooting-star wish in the way, whatever the real clock says
  L.giveTent(); L.st.add('furn_table_wood');
  const d = L.home.door; a.player.place(d.x, d.z + 0.8, 0); a.player.heading = Math.PI; step(2);
  const label = L.target()?.label; L.anim = null; L.press(); step(3);
  const inside = L.home.inside; a.player.heading = Math.PI; L.home.place(L.st.pocket.indexOf('furn_table_wood')); step(2);
  const placed = L.st.ext.furn.length; L.home.leave(); step(2);
  return { label, inside, placed, out: !L.home.inside, y: +a.player.pos.y.toFixed(1) };
});
check('house: enter, place furniture, leave', home.label === 'はいる' && home.inside === 'home' && home.placed === 1 && home.out && home.y < 20, JSON.stringify(home));
// building freely: a plot kit set down on open ground is a site today and a resident's house tomorrow
const plot = await G(() => {
  const a = window.__uminagi, L = a.life, step = (n) => { for (let i = 0; i < n; i++) a.frame(0.05, false); };
  const spots = [[-10, 18], [100, 70], [90, 80], [-30, 0], [10, -60]];
  for (const [x, z] of spots) {
    L.st.add('kit_plot'); a.player.place(x, z, Math.PI); a.player.heading = Math.PI; step(2);
    const n = L.build.list.length; L.build.place(L.st.pocket.indexOf('kit_plot'));
    if (L.build.list.length > n) break;
    L.st.pocket.splice(L.st.pocket.indexOf('kit_plot'), 1);
  }
  const b = L.build.list.at(-1); if (!b) return { placed: false };
  const site = !L.build.done(b); b.day = '2000-1-1'; L.build.newDay();
  const v = L.villagers.find((q) => q.def.id === b.who);
  return { placed: true, site, who: b.who, door: !!v && !!v.door && Math.hypot(v.door.x - L.build.door(b).x, v.door.z - L.build.door(b).z) < 0.01 };
});
await talkThrough([]);
check('build a resident\'s house on a plot of your choice', plot.placed && plot.site && plot.who && plot.door, JSON.stringify(plot));
// daily goals pay stamps; an empty plot gets a newcomer; a ticket takes なぎ to the island and back
const extra = await G(async () => {
  const a = window.__uminagi, L = a.life, g = L.goals.g, s0 = g.stamps;
  for (const d of g.daily) L.emit(d.ev, d.n);
  const goals = g.allDone && g.stamps > s0;
  const B = L.build, empty = B.list.find((q) => B.fac(q).house); empty.who = null;   // the plot from the test above, vacated
  B.render(); L.folk.f.day = 'x'; L.folk.morning(false, true);
  const folk = L.villagers.some((v) => v.def.id.startsWith('nv_'));
  for (let k = 0; k < 400 && L.ui.busy(); k++) { const q = L.ui.queue; if (q) { if (L.ui.typing) L.ui.endLine(); if (q.choices && q.i === q.lines.length - 1) L.ui.finish(0); else L.ui.advance(); } else L.ui.closePanel(-1); await new Promise((r) => setTimeout(r, 5)); }
  let gone = false; L.tour.go().then(() => { gone = true; });
  for (let k = 0; k < 600 && !gone; k++) { const q = L.ui.queue; if (q) { if (L.ui.typing) L.ui.endLine(); L.ui.advance(); } await new Promise((r) => setTimeout(r, 5)); }
  const island = !!L.tour.on && Math.hypot(a.player.pos.x - 97, a.player.pos.z - 200) < 30;
  L.tour.clear();
  return { goals, folk, island };
});
await p.waitForTimeout(2500); await talkThrough([]);
check('stamp goals, a newcomer moving in, an island tour', extra.goals && extra.folk && extra.island, JSON.stringify(extra));
// skills (all learnt with ?town=all): jump, then hold in the air to swing on a line
const moves = await G(() => {
  const a = window.__uminagi, I = a.input, P = a.player, step = (n) => { for (let i = 0; i < n; i++) a.frame(0.05, false); };
  P.place(0, 19, Math.PI); step(2); I.keys.add('KeyW'); I.jumpEdge = true; step(3); const jump = P.state;
  I.keys.add('Space'); const seen = []; for (let i = 0; i < 30; i++) { step(1); if (!seen.includes(P.state)) seen.push(P.state); }
  I.keys.delete('Space'); I.keys.delete('KeyW'); for (let i = 0; i < 120 && P.state !== 'ground'; i++) step(1);
  return { jump, seen, back: P.state, skills: P.skills };
});
check('skills: jump and swing on a line', moves.jump === 'air' && moves.seen.includes('swing') && moves.back === 'ground', JSON.stringify(moves));
// more DIY recipes: every one makes a real item, the cave ones have models made in code
const recipes = await G(async () => {
  const { RECIPES } = await import('/uminagi/js/life/items2.js'), { ITEMS } = await import('/uminagi/js/life/state.js');
  const L = window.__uminagi.life, missing = RECIPES.filter((r) => !ITEMS[r.id] || Object.keys(r.mat).some((m) => !ITEMS[m])).map((r) => r.id);
  const made = RECIPES.filter((r) => r.cave).every((r) => L.home.furnObject(r.id).isObject3D);
  return { n: RECIPES.length, missing, made };
});
check('56 DIY recipes, all real items; cave furniture builds', recipes.n >= 56 && !recipes.missing.length && recipes.made, JSON.stringify(recipes));
// the cave in the west cliff: in, take a find, down a floor, the walls hold ぽっけ in, back out
const cave = await G(async () => {
  const a = window.__uminagi, L = a.life, C = L.cave, P = a.player, step = (n) => { for (let i = 0; i < n; i++) a.frame(0.05, false); };
  P.place(C.door.x + 1, C.door.z, Math.PI / 2); P.heading = -Math.PI / 2; step(2);
  const label = L.target()?.label;
  await C.enter(1); step(2);
  const inside = L.home.inside, y = P.pos.y, kinds = C.things.map((t) => t.label());
  const find = C.things.find((t) => /ひろう|とる|あける/.test(t.label())), mats = JSON.stringify(L.st.mat);
  if (find) { P.place(find.x, find.z + 0.9, 0); P.pos.y = 100; P.heading = Math.PI; step(1); const t = L.target(); if (t) await Promise.race([t.run(), new Promise((r) => setTimeout(r, 300))]); }
  while (L.ui.busy()) { const q = L.ui.queue; if (q) { if (L.ui.typing) L.ui.endLine(); L.ui.advance(); } await new Promise((r) => setTimeout(r, 5)); }
  const got = JSON.stringify(L.st.mat) !== mats || L.st.money > 0;
  const hole = C.things.find((t) => t.label() === 'おりる'); await C.enter(2); step(2);
  const floor = C.floor, deep = L.st.ext.cave.deep;
  // walk into the maze for 4 s: still on the cave floor
  let camMin = 99; a.input.keys.add('KeyW'); for (let i = 0; i < 80; i++) { step(1); camMin = Math.min(camMin, P.camDist); } a.input.keys.delete('KeyW'); const stillIn = Math.abs(P.pos.y - 100) < 0.5;
  a.input.look.y = -5; a.input.zoom = 9; step(3); const lim = [+P.pitch.toFixed(2), +P.dist.toFixed(1)];   // the camera stays above the walls
  await C.leave(); step(2);
  return { label, inside, y, kinds: kinds.length, find: !!find, got, hole: !!hole, floor, deep, stillIn, camMin: +camMin.toFixed(1), lim, out: !L.home.inside && !C.on, oy: +P.pos.y.toFixed(1) };
});
// regressions: the day turning over inside, A pressed twice on the rope, the map's fast travel indoors
const caveEdge = await G(async () => {
  const a = window.__uminagi, L = a.life, C = L.cave, step = (n) => { for (let i = 0; i < n; i++) a.frame(0.05, false); };
  await C.enter(1); step(1);
  L.st.daily = { day: 'x', talked: {}, gift: {}, shaken: {}, dug: {}, picked: {}, rock: 0, fruit: {}, bottle: false };
  let dayOk = true; const t = C.things.find((x) => !x.gone && /ひろう|とる/.test(x.label())); try { if (t) t.run(t); } catch { dayOk = false; }
  document.getElementById('mapbtn').click(); const mapShut = document.getElementById('bigmap').hidden;
  const r = C.things.find((x) => x.label() === 'のぼる'); await Promise.all([r.run(r), r.run(r)]); step(1);
  return { dayOk, mapShut, out: !C.on && !L.home.inside && L.root.visible, light: L.home.light.intensity };
});
check('cave edge cases: day turnover, map indoors, double A', caveEdge.dayOk && caveEdge.mapShut && caveEdge.out && caveEdge.light === 0, JSON.stringify(caveEdge));
// cave critters: a bump costs a heart, A calms a ゴロン (it leaves something), no hearts left carries ぽっけ up
const foes = await G(async () => {
  const a = window.__uminagi, L = a.life, C = L.cave, P = a.player, step = (n) => { for (let i = 0; i < n; i++) a.frame(0.05, false); };
  await C.enter(3); step(1);
  const kinds = [...new Set(C.foes.map((o) => o.kind))].join(','), g = C.foes.find((o) => o.kind === 'goron');
  C.inv = 0; g.x = P.pos.x; g.z = P.pos.z - 0.5; g.stun = 0; g.rest = 0; step(1); const hp1 = C.hp;
  C.inv = 9; g.x = P.pos.x; g.z = P.pos.z - 1.2; g.hp = 1; g.stun = 0; P.heading = Math.PI; const m0 = JSON.stringify(L.st.mat); step(1);
  const lab = L.target()?.label; C.hitFoe(g); const calmed = !!g.gone, gotSome = JSON.stringify(L.st.mat) !== m0;
  const say = L.ui.say; L.ui.say = async () => 0;
  const c0 = L.st.mat.crystal || 0; L.st.addMat('crystal', 4); C.hp = 1; C.inv = 0; await C.hurt(C.foes.find((o) => !o.gone) || g);
  for (let i = 0; i < 60 && (C.on || C.busy); i++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 200)); L.ui.say = say;
  return { kinds, hp1, lab, calmed, gotSome, out: !C.on && !L.home.inside, dropped: c0 + 4 - L.st.mat.crystal, hud: document.querySelector('.cavehp').hidden };
});
check('cave critters: bump, calm with A, faint and carried up', foes.kinds.includes('goron') && foes.kinds.includes('bat') && foes.hp1 === 2 && foes.lab === 'たたく' && foes.calmed && foes.gotSome && foes.out && foes.dropped === 2 && foes.hud, JSON.stringify(foes));
// the bottom (B10): no way further down, the cave master's chest once a day
const bottom = await G(async () => {
  const a = window.__uminagi, L = a.life, C = L.cave, P = a.player, step = (n) => { for (let i = 0; i < n; i++) a.frame(0.05, false); };
  await C.enter(12); step(1);
  const floor = C.floor, labels = C.things.map((t) => t.label()), big = C.things.find((t) => t.r === 2.0);
  const say = L.ui.say; L.ui.say = async () => 0; const m0 = L.st.money; C.inv = 99;
  if (big) await big.run(big);
  const got = L.st.money - m0; await C.enter(10); step(1); const again = C.things.filter((t) => t.r === 2.0).length;
  L.ui.say = say; await C.leave();
  return { floor, down: labels.includes('おりる'), big: !!big, got, again };
});
check('cave bottom: B10, the master\'s chest once a day', bottom.floor === 10 && !bottom.down && bottom.big && bottom.got >= 8000 && bottom.again === 0, JSON.stringify(bottom));
check('cave: enter, find something, go down, walls hold, back out', cave.label === 'はいる' && cave.inside === 'cave' && cave.y === 100 && cave.find && cave.got && cave.hole && cave.floor === 2 && cave.deep >= 2 && cave.stillIn && cave.camMin >= 5 && cave.lim[0] >= 0.85 && cave.lim[1] <= 11 && cave.out && cave.oy < 20, JSON.stringify(cave));
// DIY at the raccoon's stall, then chop wood with the new axe; tools wear down
const diy = await G(async () => {
  const a = window.__uminagi, L = a.life, step = (n) => { for (let i = 0; i < n; i++) a.frame(0.05, false); };
  L.st.addMat('branch', 3); L.st.addMat('stone', 1);
  const i0 = L.st.pocket.indexOf('axe'); if (i0 >= 0) L.st.pocket.splice(i0, 1);
  const before = { busy: L.ui.busy(), open: L.ui.open, q: !!L.ui.queue, panel: !!L.ui.panelRes, full: L.st.full() };
  let done = false; L.craft.menu().then(() => { done = true; });
  for (let k = 0; k < 50 && !L.ui.panelRes; k++) await new Promise((r) => setTimeout(r, 5));
  L.ui.closePanel([...document.querySelectorAll('.plist .btn')].findIndex((b) => b.textContent.startsWith('おの')));   // makeable recipes come first
  for (let k = 0; k < 300 && !done; k++) { if (L.ui.queue) { if (L.ui.typing) L.ui.endLine(); L.ui.advance(); } await new Promise((r) => setTimeout(r, 5)); }
  if (!done) return { stuck: true, before, open: L.ui.open, q: L.ui.queue && L.ui.queue.lines, panel: !!L.ui.panelRes };
  const axe = L.st.has('axe'); L.equip('axe');
  const t = L.trees.find((q) => !q.fruitTree && L.walkable(q.x + q.rad + 0.8, q.z));
  a.player.place(t.x + t.rad + 0.8, t.z, 0); a.player.heading = -Math.PI / 2; step(2);
  const w0 = L.st.mat.wood || 0; for (let k = 0; k < 3; k++) { L.anim = null; L.press(); step(12); }
  L.equip(null);
  return { axe, wood: (L.st.mat.wood || 0) - w0, dur: L.st.ext.dur.axe };
});
check('DIY an axe and chop wood (the axe wears)', diy.axe && diy.wood === 3 && diy.dur < 40, JSON.stringify(diy));

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
