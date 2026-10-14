// Seeded random numbers. State is a single uint32 so it can live inside plain
// (structured-cloneable) simulation state and be copied for twin runs.

export function hash32(...xs) {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h ^= x >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995) >>> 0;
    h ^= h >>> 15;
  }
  return h >>> 0;
}

// mulberry32 step on an object { s: uint32 }
export function rnd(o) {
  o.s = (o.s + 0x6d2b79f5) >>> 0;
  let t = o.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function gauss(o) {
  const u = Math.max(1e-12, rnd(o)), v = rnd(o);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function makeRng(seed) { return { s: seed >>> 0 }; }
