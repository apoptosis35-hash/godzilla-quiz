import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, seeded, run, TIERS, WORLD, RULES, MAX_TIER, scoreFor, basePoints, kingScore, comboMultiplier } from './helper.js';

const M = globalThis.Matter;
const settle = (g, ms = 1500) => run(g, ms);
const count = (g, tier) => g.foods.filter((b) => b.food.tier === tier).length;
// put pieces on the floor as if they had been there a while
function place(g, tier, x, y = WORLD.FLOOR - TIERS[tier].r) {
  return g.makeFood(tier, x, y, { landed: true, landedAt: -1e9, born: -1e9 });
}

test('two equal pieces that touch merge into the next tier', () => {
  const g = new Game({ rng: seeded(1) });
  const merges = [];
  g.on('merge', (e) => merges.push(e));
  place(g, 2, 150); place(g, 2, 150 + TIERS[2].r * 2 - 1);
  settle(g);
  assert.equal(merges.length, 1);
  assert.equal(merges[0].tier, 3);
  assert.equal(count(g, 2), 0);
  assert.equal(count(g, 3), 1);
  assert.equal(g.score, basePoints(3));
});

test('different pieces do not merge', () => {
  const g = new Game({ rng: seeded(1) });
  place(g, 1, 150); place(g, 2, 150 + TIERS[1].r + TIERS[2].r - 1);
  settle(g);
  assert.equal(g.merges, 0);
  assert.equal(g.foods.length, 2);
});

test('three equal pieces touching at once: exactly one merge, no double merge', () => {
  const g = new Game({ rng: seeded(1) });
  const r = TIERS[3].r;
  let events = 0;
  g.on('merge', () => events++);
  place(g, 3, 100); place(g, 3, 100 + 2 * r - 2); place(g, 3, 100 + 4 * r - 4);
  run(g, 50);
  assert.equal(events, 1);
  assert.equal(count(g, 4), 1);
  assert.equal(count(g, 3), 1);
  // no body is referenced twice / dead bodies are gone from the world
  const ids = new Set(g.foods.map((b) => b.id));
  assert.equal(ids.size, g.foods.length);
  assert.ok(g.foods.every((b) => !b.food.dead));
  assert.equal(M.Composite.allBodies(g.engine.world).length, g.foods.length + 3);
});

test('four pieces in a square merge pairwise with no leftovers', () => {
  const g = new Game({ rng: seeded(1) });
  const r = TIERS[1].r;
  place(g, 1, 200 - r + 0.5); place(g, 1, 200 + r - 0.5);
  place(g, 1, 200 - r + 0.5, WORLD.FLOOR - 3 * r + 1); place(g, 1, 200 + r - 0.5, WORLD.FLOOR - 3 * r + 1);
  settle(g, 2500);
  assert.equal(count(g, 1), 0);
  // 4 x tier1 -> 2 x tier2 -> 1 x tier3
  assert.equal(count(g, 3), 1);
  assert.equal(g.merges, 3);
});

test('a merge that creates a piece touching its twin is a chain', () => {
  const g = new Game({ rng: seeded(1) });
  const combos = [];
  g.on('merge', (e) => combos.push(e.combo));
  // tier2 sitting on the floor; two tier1 next to it merge into a tier2 that touches it
  place(g, 2, 120);
  const r1 = TIERS[1].r, x1 = 120 + TIERS[2].r + r1 - 1;
  place(g, 1, x1); place(g, 1, x1, WORLD.FLOOR - 3 * r1 + 1);
  settle(g, 2500);
  assert.deepEqual(combos.slice(0, 2), [1, 2]);
  assert.equal(count(g, 3), 1);
  assert.equal(g.maxCombo, 2);
  // second merge scored with the chain multiplier
  assert.equal(g.score, scoreFor(2, 1) + scoreFor(3, 2));
});

test('a staircase of tiers cascades into a long chain', () => {
  const g = new Game({ rng: seeded(1) });
  const combos = [];
  g.on('merge', (e) => combos.push(e.combo));
  // a column 4,3,2,1,0,0 stacked bottom to top in a corner
  let y = WORLD.FLOOR;
  for (const t of [4, 3, 2, 1, 0, 0]) { const r = TIERS[t].r; y -= r; place(g, t, r, y); y -= r - 0.5; }
  settle(g, 4000);
  assert.equal(count(g, 5), 1, 'ends as one karaage');
  assert.equal(g.maxCombo, 5);
  assert.deepEqual(combos, [1, 2, 3, 4, 5]);
});

test('merged piece does not blast its neighbours away', () => {
  const g = new Game({ rng: seeded(2) });
  // a tight row of small pieces around a pair that will become a big piece
  const r = TIERS[6].r;
  place(g, 6, 200 - r + 1); place(g, 6, 200 + r - 1);
  for (let i = 0; i < 6; i++) place(g, 0, 20 + i * 27, WORLD.FLOOR - 2 * r - 20);
  let maxSpeed = 0;
  for (let i = 0; i < 120; i++) { g.step(); for (const b of g.foods) maxSpeed = Math.max(maxSpeed, b.speed); }
  assert.equal(count(g, 7), 1);
  assert.ok(maxSpeed < 12, `max speed ${maxSpeed.toFixed(2)} too high`);
});

test('fast pieces never pass through walls, floor or each other', () => {
  const g = new Game({ rng: seeded(3) });
  const big = place(g, 8, 200);
  for (let i = 0; i < 30; i++) {
    const t = i % 3;
    const b = g.makeFood(t, 30 + (i * 37) % 340, 110 - i * 30, { landed: true });
    M.Body.setVelocity(b, { x: (i % 2 ? 1 : -1) * 60, y: 80 });
  }
  let escaped = 0, sink = 0;
  g.on('escape', () => escaped++);
  for (let i = 0; i < 400; i++) {
    g.step();
    for (const b of g.foods) {
      const r = b.circleRadius;
      assert.ok(Number.isFinite(b.position.x) && Number.isFinite(b.position.y));
      assert.ok(b.position.x > -1 && b.position.x < WORLD.W + 1, 'inside walls');
      sink = Math.max(sink, b.position.y + r - WORLD.FLOOR);
      assert.ok(b.position.y < WORLD.FLOOR - r * 0.2, `never through the floor (${sink.toFixed(2)})`);
    }
  }
  assert.equal(escaped, 0);
  // once things settle, contacts are tight
  for (const b of g.foods) assert.ok(b.position.y + b.circleRadius - WORLD.FLOOR < 1.5, 'resting on the floor');
  // nothing ended up inside the big piece
  if (!big.food.dead) {
    for (const b of g.foods) {
      if (b === big) continue;
      const d = Math.hypot(b.position.x - big.position.x, b.position.y - big.position.y);
      assert.ok(d > big.circleRadius + b.circleRadius - 4, 'no overlap with big piece');
    }
  }
});

test('a big piece dropped on a small one barely squashes it', () => {
  for (const big of [4, 6, 7, 8, MAX_TIER]) {
    const g = new Game({ rng: seeded(3) });
    const e = place(g, 0, 200);
    g.makeFood(big, 203, WORLD.DROP_Y, { dropping: true });
    let sink = 0, overlap = 0;
    for (let i = 0; i < 120; i++) {
      g.step();
      sink = Math.max(sink, e.position.y + e.circleRadius - WORLD.FLOOR);
      for (const b of g.foods) if (b !== e) overlap = Math.max(overlap, b.circleRadius + e.circleRadius - Math.hypot(b.position.x - e.position.x, b.position.y - e.position.y));
    }
    // the king is only ever made by merging; a full-speed hit can push a bean in for a moment, never through
    assert.ok(sink < (big === MAX_TIER ? TIERS[0].r * 0.8 : 4), `tier ${big} sink ${sink}`);
    assert.ok(overlap < 7, `overlap ${overlap}`);
  }
});

test('drop cooldown blocks double drops, a late tap is buffered', () => {
  const g = new Game({ rng: seeded(4) });
  assert.ok(g.drop(200));
  assert.equal(g.drop(200), null);
  assert.equal(g.drop(250), null);
  assert.equal(g.foods.length, 1);
  run(g, RULES.DROP_COOLDOWN - RULES.INPUT_BUFFER / 2);
  assert.equal(g.drop(100), null); // queued
  run(g, RULES.INPUT_BUFFER);
  assert.equal(g.foods.length, 2);
  assert.equal(g.queuedDrop, null);
});

test('drop position is clamped inside the box', () => {
  const g = new Game({ rng: seeded(5) });
  const b = g.drop(-500);
  assert.ok(b.position.x >= b.circleRadius);
  run(g, 600);
  const c = g.drop(5000);
  assert.ok(c.position.x <= WORLD.W - c.circleRadius);
});

test('spawns are small pieces only, opening drops are the smallest', () => {
  const g = new Game({ rng: seeded(6) });
  const seen = new Set();
  const first = [g.current, g.next];
  for (let i = 0; i < 300; i++) { seen.add(g.current); g.current = g.next; g.next = g._rollSpawn(); }
  assert.ok([...seen].every((t) => (t >= 0 && t < RULES.SPAWN_TIERS) || t === 98), 'small okazu (or the rare piece)');
  assert.ok(first.every((t) => t <= 2));
  assert.ok(seen.has(0) && seen.has(4));
});

test('game over only after staying above the rim long enough', () => {
  const g = new Game({ rng: seeded(7) });
  let over = 0;
  g.on('over', () => over++);
  // a column of big pieces taller than the box
  // a piece pinned so it sticks out above the rim
  const b = place(g, 5, 200, WORLD.TOP + 10);
  M.Body.setStatic(b, true);
  run(g, RULES.OVER_TIME - 300);
  assert.equal(over, 0);
  assert.ok(g.danger > 0.5);
  run(g, 600);
  assert.equal(over, 1);
  assert.ok(g.over);
  assert.equal(g.drop(200), null, 'no drops after game over');
});

test('a piece falling through the top area does not count as danger', () => {
  const g = new Game({ rng: seeded(8) });
  for (let i = 0; i < 4; i++) { g.drop(60 + i * 90); run(g, 500); }
  run(g, 3000);
  assert.equal(g.over, false);
  assert.equal(g.dangerT, 0);
});

test('two kings vanish with a bonus', () => {
  const g = new Game({ rng: seeded(9) });
  let king = null;
  g.on('king', (e) => { king = e; });
  const r = TIERS[MAX_TIER].r;
  place(g, MAX_TIER, r); place(g, MAX_TIER, 3 * r - 2);
  settle(g, 300);
  assert.ok(king);
  assert.equal(count(g, MAX_TIER), 0);
  assert.equal(g.score, kingScore(1));
  assert.equal(g.kings, 1);
});

test('score formula', () => {
  assert.equal(basePoints(1), 10);
  assert.equal(basePoints(10), 550);
  assert.equal(scoreFor(3, 1), 60);
  assert.equal(scoreFor(3, 2), 78);
  assert.equal(comboMultiplier(1), 1);
  assert.ok(comboMultiplier(5) > comboMultiplier(4) * 1.3, 'fever bonus');
  assert.equal(comboMultiplier(30), 6);
});

test('reset (retry) clears the board and the score', () => {
  const g = new Game({ rng: seeded(10) });
  for (let i = 0; i < 20; i++) { g.drop(30 + i * 17); run(g, 450); }
  assert.ok(g.foods.length > 0);
  g.reset();
  assert.equal(g.foods.length, 0);
  assert.equal(g.score, 0);
  assert.equal(g.over, false);
  assert.equal(M.Composite.allBodies(g.engine.world).length, 3);
  assert.ok(g.drop(200));
});

test('snapshot / restore keeps the board', () => {
  const g = new Game({ rng: seeded(11) });
  for (let i = 0; i < 25; i++) { g.drop(30 + i * 13); run(g, 450); }
  settle(g, 2000);
  const snap = JSON.parse(JSON.stringify(g.snapshot()));
  const h = new Game({ rng: seeded(12) });
  h.restore(snap);
  assert.equal(h.score, g.score);
  assert.equal(h.foods.length, g.foods.length);
  assert.equal(h.current, g.current);
  assert.equal(h.next, g.next);
  settle(h, 1000);
  assert.equal(h.over, false);
});

test('long random games stay stable and end properly', () => {
  for (const seed of [21, 22, 23]) {
    const g = new Game({ rng: seeded(seed) });
    const rng = seeded(seed * 7);
    let escaped = 0;
    g.on('escape', () => escaped++);
    let i = 0;
    while (!g.over && i++ < 800) {
      while (!g.canDrop && !g.over) g.step();
      g.drop(rng() * WORLD.W);
      run(g, 200 + rng() * 600);
      for (const b of g.foods) assert.ok(Number.isFinite(b.position.x + b.position.y + b.angle));
    }
    assert.ok(g.over, 'random play eventually ends');
    assert.equal(escaped, 0);
    assert.ok(g.merges > 50);
    assert.ok(g.score > 0);
  }
});

test('frame-rate independence: same result at 60Hz and 120Hz frame pacing', () => {
  const play = (frameMs) => {
    const g = new Game({ rng: seeded(31) });
    const drops = [80, 300, 150, 220, 60, 340, 200, 120];
    let k = 0;
    while (g.time < 8000) {
      if (k < drops.length && g.time >= k * 700) { if (g.drop(drops[k])) k++; }
      g.update(frameMs);
    }
    return g.foods.map((b) => `${b.food.tier}:${b.position.x.toFixed(1)}`).join(',') + '|' + g.score;
  };
  assert.equal(play(1000 / 60), play(1000 / 120));
});
