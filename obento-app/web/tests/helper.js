import { readFileSync } from 'node:fs';
// load the UMD build the browser uses
const mod = { exports: {} };
new Function('module', 'exports', readFileSync(new URL('../vendor/matter.min.js', import.meta.url), 'utf8'))(mod, mod.exports);
globalThis.Matter = mod.exports;
export { Game } from '../js/game.js';
export * from '../js/config.js';
// deterministic rng
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function run(game, ms) { for (let t = 0; t < ms; t += 1000 / 60) game.step(); }
