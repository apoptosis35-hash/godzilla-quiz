// Pure level logic: seeded RNG, gate math and the level generator (no DOM, unit-tested in Node).
export const ROAD = 3.5;          // half width of the road (world units)
export const BASE_START = 8;      // crowd size the generator balances against
export const STEP_COUNT = 25;
export const STEP_DEPTH = 1.0;
export const STEP_RISE = 0.34;

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function applyOp(n, op) {
  switch (op.t) {
    case '+': return n + op.v;
    case '-': return Math.max(0, n - op.v);
    case 'x': return n * op.v;
    case '/': return Math.max(1, Math.floor(n / op.v));
  }
  return n;
}
export const opLabel = (op) => ({ '+': '+', '-': '−', 'x': '×', '/': '÷' })[op.t] + op.v;
export const isGood = (op) => op.t === '+' || op.t === 'x';
export const stepMult = (i) => Math.round((1 + 0.2 * (i + 1)) * 10) / 10;

const nice = (n) => { n = Math.max(1, Math.round(n)); return n < 20 ? n : n < 100 ? Math.round(n / 5) * 5 : Math.round(n / 10) * 10; };

// Two gate options whose best choice depends on the current crowd size c.
function makePair(c, i, bonus, diff, r) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const big = c > 500;
  const mulOk = (v) => c * v <= 2400;
  let kinds;
  if (bonus) kinds = ['addmul', 'mulmul', 'addmul3', 'addadd'];
  else if (i === 0) kinds = ['addmul', 'mulmul', 'addsub'];
  else {
    kinds = ['addmul', 'addmul', 'addsub', 'muldiv', 'addmul3', 'subadd'];
    if (diff > 0.25) kinds.push('muldiv', 'addsub2');
    if (diff > 0.25 && c > 40) kinds.push('subdiv');
  }
  let a, b;
  switch (pick(kinds)) {
    case 'addmul': a = { t: '+', v: nice(c * (0.6 + r() * 0.9) + 4) }; b = { t: 'x', v: 2 }; break;
    case 'addmul3': a = { t: '+', v: nice(c * (1.4 + r() * 1.4) + 6) }; b = { t: 'x', v: 3 }; break;
    case 'mulmul': a = { t: 'x', v: 2 }; b = { t: 'x', v: bonus ? 4 : 3 }; break;
    case 'addadd': a = { t: '+', v: nice(c * 0.5 + 10) }; b = { t: '+', v: nice(c * 1.2 + 20) }; break;
    case 'addsub': a = { t: '+', v: nice(c * (0.4 + r() * 0.6) + 5) }; b = { t: '-', v: nice(c * (0.2 + r() * 0.3) + 2) }; break;
    case 'addsub2': a = { t: '+', v: nice(c * (0.2 + r() * 0.3) + 3) }; b = { t: '-', v: nice(c * (0.3 + r() * 0.3) + 3) }; break;
    case 'subadd': a = { t: 'x', v: 2 }; b = { t: '-', v: nice(c * 0.3 + 3) }; break;
    case 'muldiv': a = { t: 'x', v: r() < 0.7 ? 2 : 3 }; b = { t: '/', v: 2 }; break;
    case 'subdiv': a = { t: '-', v: nice(c * (0.25 + r() * 0.4) + 2) }; b = { t: '/', v: 2 }; break;
  }
  for (const o of [a, b]) if (o.t === 'x' && (!mulOk(o.v) || big)) { o.t = '+'; o.v = nice(c * (o.v - 1) * 0.6 + 10); }
  return r() < 0.5 ? [a, b] : [b, a];
}

// A level is a list of items along z; the crowd runs +z. Balanced so that picking the
// better gate every time (starting from BASE_START) clears the boss with room to spare.
export function genLevel(level) {
  const r = rng(level * 7919 + 13);
  const bonus = level % 5 === 0;
  const diff = Math.min(1, (level - 1) / 14);
  const items = [];
  let z = 20, opt = BASE_START;
  const sections = bonus ? 6 : Math.min(4 + Math.ceil(level / 2), 9);
  for (let i = 0; i < sections; i++) {
    const prev = opt;
    const slide = !bonus && level >= 3 && i > 0 && r() < 0.16;
    if (slide) {
      const op = r() < 0.5 ? { t: 'x', v: 2 } : { t: '+', v: nice(opt * 0.9 + 10) };
      if (op.t === 'x' && opt > 500) { op.t = '+'; op.v = nice(opt * 0.6); }
      items.push({ kind: 'slide', z, ops: [op], speed: 0.9 + r() * 0.8 + diff * 0.6, phase: r() * 6.28 });
      opt = applyOp(opt, op);
    } else {
      const ops = makePair(opt, i, bonus, diff, r);
      items.push({ kind: 'gate', z, ops });
      const res = ops.map((o) => applyOp(opt, o));
      opt = Math.max(...res);
    }
    z += 17;
    if (bonus) continue;
    if (i > 0 && r() < 0.8) {
      // eat most of what the best gate gave, so a wrong pick hurts but the right one keeps you growing
      const gain = Math.max(0, opt - prev);
      const m = Math.max(3, Math.min(Math.round(opt * 0.8), Math.round(gain * (0.4 + 0.25 * diff + r() * 0.15) + opt * 0.04 * diff)));
      items.push({ kind: 'enemy', z, x: (r() - 0.5) * 2.4, n: m });
      opt -= m;
      z += 15;
    }
    if (level >= 2 && i < sections - 1 && r() < 0.3 + 0.35 * diff) {
      const t = r() < 0.5 ? 'spinner' : 'saw';
      items.push(t === 'spinner'
        ? { kind: 'spinner', z, x: (r() - 0.5) * 2, len: 2.2 + r() * 0.6, speed: (r() < 0.5 ? -1 : 1) * (1.6 + diff * 1.4) }
        : { kind: 'saw', z, amp: 2.4, speed: 1.4 + diff * 1.2 + r() * 0.5, phase: r() * 6.28 });
      opt = Math.round(opt * 0.85);
      z += 15;
    }
  }
  z += 6;
  const boss = bonus ? 0 : Math.max(6, Math.round(opt * (0.26 + 0.2 * diff)));
  if (boss) { items.push({ kind: 'boss', z, n: boss }); opt -= boss; z += 12; }
  const base = Math.max(1, opt / 36);
  const steps = [];
  for (let i = 0; i < STEP_COUNT; i++) steps.push({ z: z + i * STEP_DEPTH, cost: Math.max(1, Math.round(base * (1 + 0.08 * i))), mult: stepMult(i) });
  return { level, bonus, items, stairsZ: z, steps, endZ: z + STEP_COUNT * STEP_DEPTH, optEnd: opt };
}

// Best-play simulation (used by tests and the autopilot): returns the crowd left after each item.
export function simulateBest(lv, start = BASE_START) {
  let n = start;
  for (const it of lv.items) {
    if (it.kind === 'gate' || it.kind === 'slide') n = Math.max(...it.ops.map((o) => applyOp(n, o)));
    else if (it.kind === 'enemy' || it.kind === 'boss') n -= it.n;
    else n = Math.round(n * 0.85);
    if (n <= 0) return 0;
  }
  return n;
}
