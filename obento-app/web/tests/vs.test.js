import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, run, TIERS, WORLD } from './helper.js';
import { OJAMA_TIER, VS, attackFor, KING_ATTACK, seeded as seededCfg } from '../js/config.js';

const place = (g, t, x, y = WORLD.FLOOR - (t === OJAMA_TIER ? 15 : TIERS[t].r)) => g.makeFood(t, x, y, { landed: true, landedAt: -1e9, born: -1e9 });

test('both players get the same okazu order from the same seed', () => {
  const seq = (seed) => { const g = new Game({ rng: seededCfg(seed) }); const out = [g.current, g.next]; for (let i = 0; i < 60; i++) { g.drop(200); run(g, 400); out.push(g.next); } return out.join(','); };
  assert.equal(seq(12345), seq(12345));
  assert.notEqual(seq(12345), seq(54321));
});

test('うめぼし never merge with each other or with okazu', () => {
  const g = new Game({ rng: seededCfg(1) });
  place(g, OJAMA_TIER, 100); place(g, OJAMA_TIER, 129); place(g, OJAMA_TIER, 158);
  run(g, 1500);
  assert.equal(g.merges, 0);
  assert.equal(g.foods.filter((b) => b.food.ojama).length, 3);
  assert.equal(g.highestTier, 0, 'うめぼし do not count as okazu');
});

test('a merge right next to a うめぼし pops it, one far away stays', () => {
  const g = new Game({ rng: seededCfg(2) });
  const near = place(g, OJAMA_TIER, 150);
  const far = place(g, OJAMA_TIER, 380);
  const r = TIERS[1].r;
  place(g, 1, 150 - r, WORLD.FLOOR - 30 - r); place(g, 1, 150 + r - 1, WORLD.FLOOR - 30 - r);
  const pops = []; g.on('ojamaPop', (e) => pops.push(...e.list));
  run(g, 1500);
  assert.ok(near.food.dead, 'the nearby うめぼし popped');
  assert.ok(!far.food.dead, 'the far one stays');
  assert.equal(pops.length, 1);
  assert.ok(g.score >= VS.POP_POINTS);
});

test('dropped うめぼし fall into the box and can cause a game over', () => {
  const g = new Game({ rng: seededCfg(3) });
  for (let i = 0; i < 5; i++) g.dropOjama(40 + i * 80);
  run(g, 2500);
  const u = g.foods.filter((b) => b.food.ojama);
  assert.equal(u.length, 5);
  assert.ok(u.every((b) => b.position.y > WORLD.FLOOR - 40));
  // pin one above the rim: it counts like any piece
  const b = place(g, OJAMA_TIER, 200, WORLD.TOP + 5); globalThis.Matter.Body.setStatic(b, true);
  let over = false; g.on('over', () => { over = true; });
  run(g, 3000);
  assert.ok(over);
});

test('stop() ends a match without a game-over event', () => {
  const g = new Game({ rng: seededCfg(4) });
  let over = 0; g.on('over', () => over++);
  g.stop();
  assert.equal(g.over, true);
  assert.equal(g.drop(200), null);
  run(g, 500);
  assert.equal(over, 0);
});

test('attack size grows with okazu size, chains and smashes', () => {
  assert.equal(attackFor(1), 0);
  assert.equal(attackFor(2), 0);
  assert.equal(attackFor(3), 1);
  assert.equal(attackFor(5), 2);
  assert.equal(attackFor(9), 4);
  assert.equal(attackFor(2, 3), 2, 'a 3-chain sends 2 even with small okazu');
  assert.equal(attackFor(3, 1, 2), 2, 'a smash adds one');
  assert.ok(KING_ATTACK > attackFor(9));
});
