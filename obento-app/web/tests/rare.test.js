import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, run, TIERS, WORLD, RULES, MAX_TIER, scoreFor } from './helper.js';
import { RARE_TIER, RARE, seeded } from '../js/config.js';

const place = (g, t, x, y = WORLD.FLOOR - (t === RARE_TIER ? RARE.r : TIERS[t].r)) => g.makeFood(t, x, y, { landed: true, landedAt: -1e9, born: -1e9 });

test('the rare piece is rare (about RARE_CHANCE), never early, never back to back', () => {
  let total = 0, rare = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const g = new Game({ rng: seeded(seed) });
    const seq = [g.current, g.next];
    for (let i = 0; i < 400; i++) seq.push(g._rollSpawn());
    seq.slice(0, RULES.RARE_AFTER).forEach((t) => assert.notEqual(t, RARE_TIER, 'not in the first spawns'));
    let last = -1e9;
    seq.forEach((t, i) => { if (t === RARE_TIER) { assert.ok(i - last >= RULES.RARE_GAP, 'spaced out'); last = i; rare++; } });
    total += seq.length;
  }
  const rate = rare / total;
  assert.ok(rate > RULES.RARE_CHANCE * 0.4 && rate < RULES.RARE_CHANCE * 1.6, `rate ${(rate * 100).toFixed(2)}%`);
});

test('the same seed gives the rare piece at the same moment (fair battles)', () => {
  const seq = (s) => { const g = new Game({ rng: seeded(s) }); const out = []; for (let i = 0; i < 300; i++) out.push(g._rollSpawn()); return out.join(','); };
  assert.equal(seq(77), seq(77));
});

test('the rare piece grows the okazu it touches by one size, with a bonus', () => {
  const g = new Game({ rng: seeded(1) });
  const target = place(g, 3, 200);
  const merges = []; g.on('merge', (e) => merges.push(e));
  g.current = RARE_TIER;
  g.drop(205);
  run(g, 1500);
  assert.ok(target.food.dead, 'the okazu was replaced');
  assert.equal(merges.length, 1);
  assert.equal(merges[0].tier, 4);
  assert.equal(merges[0].rare, true);
  assert.equal(merges[0].points, scoreFor(4, 1) + RULES.RARE_BONUS);
  assert.ok(!g.foods.some((b) => b.food.rare), 'the rare piece is used up');
  assert.equal(g.rares, 1);
});

test('the rare piece on the king gives the king bonus and the king stays', () => {
  const g = new Game({ rng: seeded(2) });
  const king = place(g, MAX_TIER, 200);
  let ev = null; g.on('rare', (e) => { ev = e; });
  g.current = RARE_TIER;
  g.drop(200);
  run(g, 1500);
  assert.ok(ev && ev.king);
  assert.ok(!king.food.dead, 'king stays');
  assert.equal(g.score, RULES.RARE_KING_BONUS);
  assert.ok(!g.foods.some((b) => b.food.rare));
});

test('two rare pieces never combine with each other; resting on the floor it just waits', () => {
  const g = new Game({ rng: seeded(3) });
  place(g, RARE_TIER, 100); place(g, RARE_TIER, 100 + 2 * RARE.r - 1);
  run(g, 1500);
  assert.equal(g.foods.filter((b) => b.food.rare).length, 2);
  assert.equal(g.merges, 0);
});

test('a chain can continue from the okazu the rare piece grew', () => {
  const g = new Game({ rng: seeded(4) });
  // a tier 3 next to a resting tier 4: the rare piece turns the 3 into a 4 that touches the other 4
  const r4 = TIERS[4].r, r3 = TIERS[3].r;
  place(g, 4, 100); place(g, 3, 100 + r4 + r3 + 2);
  const levels = []; g.on('merge', (e) => levels.push([e.tier, e.level]));
  g.current = RARE_TIER;
  g.drop(100 + r4 + r3 + 2);
  run(g, 2500);
  assert.deepEqual(levels.slice(0, 2), [[4, 1], [5, 2]]);
});
