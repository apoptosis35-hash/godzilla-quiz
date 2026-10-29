// Gameplay clips for the commercial: steps the game frame by frame (1/24 s) and saves each frame as a JPEG,
// so the clips play smoothly whatever the renderer's real speed (SwiftShader here).
// Usage: serve the repo root on :8123, then  node uminagi/tools/cm_capture.mjs OUT_DIR [clip ...]
// clips: fish bug diy furn before after
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = process.argv[2] || 'cm_frames';
const ONLY = process.argv.slice(3);
const URL = 'http://localhost:8123/uminagi/';
const FPS = 24;
const PREVIEW = !!process.env.PREVIEW;   // one frame per take: to check the framing quickly
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); p.setDefaultTimeout(240000);
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(URL + query);
  await p.waitForSelector('#start:not([hidden])', { timeout: 300000 });
  await p.evaluate(() => { try { localStorage.removeItem('uminagi-save-v1'); } catch {} });
  // a clean picture: no on-screen controls, map or fps counter (dialogs and toasts stay)
  await p.addStyleTag({ content: '#stick,#dash,#web,#mapbtn,#setbtn,#mute,#fps,#map,#zin,#zout,#place,#area{display:none!important}' });
  return p;
}
async function start(p) {
  await p.click('#startbtn');
  // play through the welcome and the morning messages so nothing waits on a button later
  await p.evaluate(async () => {
    const a = window.__uminagi, L = a.life; a.renderer.setAnimationLoop(null); a.world.setTimeOfDay('day', true);
    for (let k = 0; k < 70; k++) {
      a.frame(0.05, false); const ui = L.ui, q = ui.queue;
      if (q) { if (ui.typing) ui.endLine(); if (q.choices && q.i === q.lines.length - 1) ui.finish(q.choices.length - 1); else ui.advance(); } else if (ui.panelRes) ui.closePanel(-1);
      await new Promise((r) => setTimeout(r, 100));
    }
    for (const t of document.querySelectorAll('.toast')) t.classList.remove('show');
  });
}
// record n frames of clip `name`; `each(i)` runs in the page before every frame
async function rec(p, name, n, each = null, from = 0) {
  const dir = `${OUT}/${name}`; fs.mkdirSync(dir, { recursive: true });
  if (PREVIEW) { for (let i = 0; i < n - 1; i++) await p.evaluate(([src, i, dt]) => { const a = window.__uminagi; if (src) (0, eval)(src)(a, i); a.frame(dt, false); }, [each && `(${each})`, i, 1 / FPS]); n = 1; }
  for (let i = 0; i < n; i++) {
    await p.evaluate(([src, i, dt]) => { const a = window.__uminagi; if (src) (0, eval)(src)(a, i); a.frame(dt, true); }, [each && `(${each})`, i, 1 / FPS]);
    await p.screenshot({ path: `${dir}/${String(from + i).padStart(4, '0')}.jpg`, quality: 92 });
  }
  return from + n;
}
const hush = (p) => p.evaluate(() => { const ui = window.__uminagi.life.ui; ui.jingle = () => {}; ui.blip = () => {}; });
// finish the dialog line being typed so the text reads at once
const fullText = (p) => p.evaluate(() => { const ui = window.__uminagi.life.ui; if (ui.typing) ui.endLine(); });
const want = (c) => !ONLY.length || ONLY.includes(c);

if (want('fish') || want('bug') || want('diy') || want('furn')) {
  const p = await open('?q=medium&town=all&weather=clear');
  await start(p); await hush(p);
  if (want('fish')) {
    // cast from the quay, a fish noses the float, bites, and comes up held over ぽっけ's head
    await p.evaluate(() => {
      const a = window.__uminagi, L = a.life; L.st.add('rod'); L.equip('rod');
      a.player.place(-24.5, 21.3, Math.PI * 0.72); a.player.heading = 0; a.player.dist = 4.6; a.player.pitch = 0.28;
      for (let i = 0; i < 30; i++) a.frame(0.05, false);
    });
    let f = await rec(p, 'fish', 12);
    await p.evaluate(() => { const L = window.__uminagi.life; L.anim = null; L.press(); });
    f = await rec(p, 'fish', 18, null, f);
    await p.evaluate(() => {
      const a = window.__uminagi, L = a.life, c = L.cast; if (!c) return;
      L.fish.length = 0; for (let i = 0; i < 40 && !L.fish.length; i++) L.spawnFish(a.player.pos);
      const fi = L.fish.find((x) => x.sp.size >= 3) || L.fish[0]; L.fish.length = 0; L.fish.push(fi);
      fi.x = c.x + 0.9; fi.z = c.z + 0.6; fi.state = 'approach'; c.fish = fi;
    });
    for (let k = 0; k < 110; k++) { f = await rec(p, 'fish', 1, (a) => { const c = a.life.cast; if (c && c.nib > 1) c.nib = 1; }, f); if (await p.evaluate(() => window.__uminagi.life.cast?.phase === 'bite')) break; }
    await p.evaluate(() => window.__uminagi.life.press());
    f = await rec(p, 'fish', 8, null, f); await fullText(p);
    f = await rec(p, 'fish', 40, null, f);
    await p.evaluate(async () => { const ui = window.__uminagi.life.ui; for (let i = 0; i < 50 && ui.busy(); i++) { if (ui.typing) ui.endLine(); ui.advance(); await new Promise((r) => setTimeout(r, 5)); } });
    console.log('fish', f);
  }
  if (want('bug')) {
    // a butterfly over the flowers, a careful step, one swing of the net
    const ok = await p.evaluate(() => {
      const a = window.__uminagi, L = a.life; L.equip(null); L.st.add('net'); L.equip('net');
      for (const b of L.bugs) L.root.remove(b.o); L.bugs.length = 0;
      const open = (x, z) => [[0, -1.7], [1.2, -3], [-1.2, -3], [0, -4]].every(([dx, dz]) => L.walkable(x + dx, z + dz) && !L.blockedAt(x + dx, z + dz, 0.5));
      const fl = L.flowers.find((f) => f.z < -20 && open(f.x, f.z)) || L.flowers.find((f) => open(f.x, f.z)) || L.flowers[0];
      a.player.place(fl.x, fl.z - 1.7, Math.PI * 0.5); a.player.heading = 0; a.player.dist = 3.8; a.player.pitch = 0.25;
      let b = null;
      for (let k = 0; k < 400 && !b; k++) { L.spawnBug(a.player.pos); b = L.bugs.find((x) => x.o.userData.shape === 'fly'); }
      if (!b) return false;
      b.x0 = b.x = fl.x; b.z0 = b.z = fl.z - 0.6; b.y0 = b.y = L.ground.height(fl.x, fl.z) + 0.55; b.mode = 'hover'; b.flee = 0;
      for (const x of L.bugs) if (x !== b) L.root.remove(x.o); L.bugs.length = 0; L.bugs.push(b); window.__bug = b;
      for (let i = 0; i < 20; i++) a.frame(0.05, false);
      return b.sp.name;
    });
    console.log('bug species', ok);
    let f = await rec(p, 'bug', 30, (a) => { const L = a.life; L.player.heading = 0; L.bugs.splice(0, L.bugs.length, ...L.bugs.filter((b) => b === window.__bug)); window.__bug.flee = 0; });
    await p.evaluate(() => { const L = window.__uminagi.life; L.anim = null; L.swingNet(); });
    f = await rec(p, 'bug', 14, null, f); await fullText(p);
    f = await rec(p, 'bug', 40, null, f);
    await p.evaluate(async () => { const ui = window.__uminagi.life.ui; for (let i = 0; i < 50 && ui.busy(); i++) { if (ui.typing) ui.endLine(); ui.advance(); await new Promise((r) => setTimeout(r, 5)); } });
    console.log('bug', f);
  }
  if (want('diy')) {
    // the DIY list at the workbench, then the new tool
    await p.evaluate(() => {
      const a = window.__uminagi, L = a.life; L.equip(null);
      const q = L.near(80, 62, (x, z) => L.walkable(x, z) && !L.water(x, z) && !L.blockedAt(x, z, 1.5), 20) || [80, 62];
      a.player.place(q[0], q[1], Math.PI * 0.8); a.player.heading = Math.PI * 0.8; a.player.dist = 4.2; a.player.pitch = 0.22;
      for (const m of ['branch', 'stone', 'iron', 'wood', 'softwood', 'hardwood']) L.st.addMat?.(m, 20);
      window.__diy = false; L.craft.menu().then(() => { window.__diy = true; });
    });
    let f = await rec(p, 'diy', 24);
    await p.evaluate(() => { const L = window.__uminagi.life, r = L.craft.st.ext.recipes; L.ui.closePanel(Math.max(0, [...document.querySelectorAll('.plist .btn')].findIndex((b) => b.textContent.startsWith('おの')))); });
    f = await rec(p, 'diy', 6, null, f); await fullText(p);
    f = await rec(p, 'diy', 44, null, f);
    await p.evaluate(async () => { const ui = window.__uminagi.life.ui; for (let i = 0; i < 80 && (ui.busy() || !window.__diy); i++) { if (ui.queue) { if (ui.typing) ui.endLine(); ui.advance(); } else if (ui.panelRes) ui.closePanel(-1); await new Promise((r) => setTimeout(r, 5)); } });
    console.log('diy', f);
  }
  if (want('furn')) {
    // outdoor furniture popping up one after another on the beach by the camp
    await p.evaluate(() => {
      const a = window.__uminagi, L = a.life; L.equip(null); L.ui.toast = () => {};
      const ids = ['furn_beach_chair', 'furn_picnic_table', 'furn_campfire', 'furn_swing', 'furn_planter'];
      for (const id of ids) L.st.add(id);
      window.__furn = ids;
      const q = L.near(88, 68, (x, z) => L.walkable(x, z) && !L.water(x, z) && [[2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dz]) => L.walkable(x + dx, z + dz) && !L.water(x + dx, z + dz)), 20) || [88, 68];
      a.player.place(q[0], q[1], Math.PI * 0.85); a.player.heading = Math.PI / 2; a.player.dist = 6.2; a.player.pitch = 0.4;
      for (let i = 0; i < 10; i++) a.frame(0.05, false);
    });
    let f = await rec(p, 'furn', 10);
    for (let k = 0; k < 5; k++) {
      await p.evaluate((k) => {
        const a = window.__uminagi, L = a.life, id = window.__furn[k], n0 = L.st.ext.furn.length;
        for (const h of [Math.PI / 2, Math.PI, -Math.PI / 2, 0, Math.PI / 4, -Math.PI / 4, Math.PI * 0.75, -Math.PI * 0.75].map((h) => h + k * 0.9)) {
          a.player.heading = h; const i = L.st.pocket.indexOf(id); if (i < 0) break;
          L.home.place(i); if (L.st.ext.furn.length > n0) break;
        }
      }, k);
      f = await rec(p, 'furn', 13, null, f);
    }
    f = await rec(p, 'furn', 20, (a) => { a.player.yaw += 0.004; }, f);
    console.log('furn', f, await p.evaluate(() => window.__uminagi.life.st.ext.furn.length));
  }
  await p.context().close();
}
// the same view of the bay: a fresh game (empty cove) and the finished town
for (const [clip, q] of [['before', '?q=medium&weather=clear'], ['after', '?q=medium&town=all&weather=clear']]) {
  if (!want(clip)) continue;
  const p = await open(q);
  await p.addStyleTag({ content: '#start{display:none!important}' });
  await p.evaluate(() => { const a = window.__uminagi; a.renderer.setAnimationLoop(null); a.world.setTimeOfDay('day', true); a.player.blocked = () => false; a.player.place(0, 19, 0); a.player.dist = 30; a.player.pitch = 0.42; a.player.yaw = 0.25; window.__t = 0; for (let i = 0; i < 20; i++) a.frame(0.05, false); });
  await rec(p, clip, 60, (a) => { a.player.yaw = 0.25 + window.__t; window.__t += 0.0016; }, 0).catch((e) => console.log(e));
  console.log(clip, 'done');
  await p.context().close();
}
await browser.close();
