// Exports the assembled town from the running game: every model placement and the generated ground (terrain,
// terraces, retaining walls, stairs, quays) -> ../uminagi-assets/scene/{placements.json, ground.glb}.
// Then `python3 ../uminagi-assets/tools/assemble_town.py` rebuilds the whole town in Blender from them.
//   python3 -m http.server 8123   (repo root)
//   node uminagi/tools/export_scene.mjs [http://localhost:8123/uminagi/] [output dir]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const URL = process.argv[2] || 'http://localhost:8123/uminagi/';
const OUT = process.argv[3] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../uminagi-assets/scene');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
await p.goto(URL + '?q=high');
await p.waitForSelector('#start:not([hidden])', { timeout: 240000 });
await p.evaluate(() => window.__uminagi.renderer.setAnimationLoop(null));
const r = await p.evaluate(() => window.__uminagi.exportScene());
writeFileSync(path.join(OUT, 'placements.json'), JSON.stringify({ units: 'metres, +X east, +Z south, +Y up (three.js / glTF)', count: r.placements.length, areas: r.areas, placements: r.placements }, null, 0).replace(/},{/g, '},\n{'));
writeFileSync(path.join(OUT, 'ground.glb'), Buffer.from(r.groundGLB, 'base64'));
console.log(r.placements.length, 'placements; ground.glb', (Buffer.from(r.groundGLB, 'base64').length / 1e6).toFixed(1), 'MB');
await browser.close();
