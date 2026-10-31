import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, seeded, run, TIERS, WORLD, PHYS, POWER, RULES, powerSpeed, smashBonus, scoreFor } from './helper.js';

const place = (g, t, x, y = WORLD.FLOOR - TIERS[t].r) => g.makeFood(t, x, y, { landed: true, landedAt: -1e9, born: -1e9 });

// a settled, half-full box built by ordinary drops
function board(seed, drops = 45) {
  const g = new Game({ rng: seeded(seed) }); const rng = seeded(seed + 5);
  for (let i = 0; i < drops && !g.over; i++) { while (!g.canDrop) g.step(); g.drop(20 + rng() * 360); run(g, 500); }
  run(g, 2500);
  return g;
}

test('pull strength maps smoothly to the initial speed', () => {
  assert.equal(powerSpeed(0), PHYS.DROP_SPEED);
  let prev = -1;
  for (let p = 0; p <= 1.0001; p += 0.05) { const v = powerSpeed(p); assert.ok(v > prev); prev = v; }
  assert.equal(powerSpeed(1), POWER.INIT_SPEED);
  assert.equal(powerSpeed(5), POWER.INIT_SPEED, 'clamped');
  for (const p of [0, 0.5, 1]) {
    const g = new Game({ rng: seeded(1) });
    const b = g.drop(200, p);
    assert.equal(b.food.power, p);
    assert.ok(Math.abs(b.velocity.y - powerSpeed(p)) < 1e-6);
  }
});

test('max power never tunnels through the floor, walls or pieces', () => {
  for (const seed of [1, 2, 3, 4]) {
    const g = board(seed);
    let escaped = 0; g.on('escape', () => escaped++);
    for (let k = 0; k < 8 && !g.over; k++) {
      while (!g.canDrop && !g.over) g.step();
      g.drop(25 + k * 50, 1);
      for (let i = 0; i < 40; i++) {
        g.step();
        for (const b of g.foods) {
          assert.ok(b.position.y < WORLD.FLOOR - b.circleRadius * 0.2, 'not through the floor');
          assert.ok(b.position.x > 0 && b.position.x < WORLD.W, 'inside the walls');
        }
      }
    }
    assert.equal(escaped, 0);
    // after things calm down nothing is left overlapping deeply
    run(g, 1500);
    for (let i = 0; i < g.foods.length; i++) for (let j = i + 1; j < g.foods.length; j++) {
      const a = g.foods[i], b = g.foods[j];
      const ov = a.circleRadius + b.circleRadius - Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
      assert.ok(ov < 4, `settled overlap ${ov.toFixed(1)}`);
    }
  }
});

test('a max power drop straight onto a lone bean on the floor does not push it through', () => {
  for (const t of [0, 2, 4]) {
    const g = new Game({ rng: seeded(2) });
    const e = place(g, 0, 200);
    g.current = t; g.drop(203, 1);
    let sink = 0;
    for (let i = 0; i < 120; i++) { g.step(); sink = Math.max(sink, e.position.y + e.circleRadius - WORLD.FLOOR); }
    assert.ok(sink < TIERS[0].r * 0.8, `tier ${t} sink ${sink.toFixed(1)}`);
  }
});

test('hard drops move the pile much more than gentle ones, and trigger merges', () => {
  const stats = { 0: { disp: 0, merges: 0 }, 1: { disp: 0, merges: 0 } };
  for (let seed = 1; seed <= 20; seed++) for (const p of [0, 1]) {
    const g = board(seed); if (g.over) continue;
    const start = new Map(g.foods.map((b) => [b, [b.position.x, b.position.y]]));
    g.on('merge', () => stats[p].merges++);
    g.current = 3; while (!g.canDrop) g.step();
    g.drop(200, p); run(g, 2000);
    for (const [b, s] of start) if (!b.food.dead) stats[p].disp += Math.hypot(b.position.x - s[0], b.position.y - s[1]);
  }
  // measured over 30 boards: about 1.8x; require a clear margin without depending on a lucky sample
  assert.ok(stats[1].disp > stats[0].disp * 1.5, `displacement normal ${stats[0].disp.toFixed(0)} power ${stats[1].disp.toFixed(0)}`);
  assert.ok(stats[1].merges > stats[0].merges, `merges normal ${stats[0].merges} power ${stats[1].merges}`);
});

test('smash: merges of pieces moved by the impact are labelled, numbered and scored', () => {
  const setup = (p) => {
    const g = new Game({ rng: seeded(1) });
    const r = TIERS[1].r;
    place(g, 1, r); place(g, 1, r * 3 + 8);            // twins near the left wall
    place(g, 2, r * 4 + 8 + 65);                       // a tamagoyaki for the new one to chain into
    place(g, 0, 330); place(g, 0, 330 + 2 * TIERS[0].r - 1);   // an unrelated pair far away
    g.current = 2;
    const merges = []; g.on('merge', (e) => merges.push(e));
    g.drop(r * 3 + 8 + 18, p); run(g, 2500);
    return { g, merges };
  };
  const normal = setup(0), power = setup(1);
  assert.ok(normal.merges.length >= 2 && normal.merges.every((m) => m.smash === 0), 'normal drops never smash');
  const sm = power.merges.filter((m) => m.smash > 0);
  assert.deepEqual(sm.map((m) => m.smash), sm.map((_, i) => i + 1), 'smash merges are numbered 1, 2, ...');
  assert.ok(sm.length >= 2, `smash chain ${sm.length}`);
  // the far-away pair merged on its own: not part of the smash
  const far = power.merges.find((m) => m.tier === 1 && m.x > 300);
  assert.ok(far && far.smash === 0, 'unrelated merge gets no smash bonus');
  // score of a smash merge = normal score with the small smash bonus
  for (const m of power.merges) assert.equal(m.points, scoreFor(m.tier, m.level, m.smash));
  assert.equal(power.g.maxSmash, sm.length);
});

test('weak pulls behave like normal drops (no smash, no extra weight)', () => {
  const g = new Game({ rng: seeded(3) });
  place(g, 2, 200);
  g.current = 2;
  const b = g.drop(200, POWER.SMASH_MIN - 0.02);
  const m0 = b.mass;
  const merges = []; g.on('merge', (e) => merges.push(e));
  for (let i = 0; i < 10 && !b.food.dead; i++) { g.step(); assert.equal(b.mass, m0); }
  run(g, 1000);
  assert.ok(merges.length >= 1 && merges.every((m) => m.smash === 0));
});

test('the impact weight and bounce wear off', () => {
  const g = new Game({ rng: seeded(4) });
  place(g, 4, 100);
  g.current = 3;
  const b = g.drop(300, 1);
  const m0 = b.mass;
  let boosted = false;
  for (let i = 0; i < 200; i++) { g.step(); if (b.mass > m0 * 1.5) boosted = true; }
  assert.ok(boosted, 'heavier at impact');
  assert.ok(Math.abs(b.mass - m0) < 1e-9, 'back to normal mass');
  assert.equal(b.restitution, PHYS.RESTITUTION);
  assert.equal(g.powerLive, 0, 'fine solver switched off again');
});

test('flying pieces after a hard hit do not cause a false game over', () => {
  for (const seed of [5, 6, 7]) {
    const g = board(seed, 35);
    for (let k = 0; k < 6; k++) { while (!g.canDrop && !g.over) g.step(); g.drop(60 + k * 55, 1); run(g, 700); }
    run(g, 3000);
    const top = Math.min(...g.foods.map((b) => b.position.y - b.circleRadius));
    if (top > WORLD.TOP + 10) assert.equal(g.over, false, 'pile is below the rim, so no game over');
  }
});

test('a power drop released during the cooldown keeps its power', () => {
  const g = new Game({ rng: seeded(8) });
  g.drop(100, 0);
  run(g, RULES.DROP_COOLDOWN - RULES.INPUT_BUFFER / 2);
  assert.equal(g.drop(250, 0.8), null);
  run(g, RULES.INPUT_BUFFER);
  assert.equal(g.lastDropped.food.power, 0.8);
});

test('smash bonus stays small', () => {
  assert.equal(smashBonus(0), 0);
  assert.equal(smashBonus(1), 0);
  assert.ok(Math.abs(smashBonus(2) - 0.1) < 1e-9);
  assert.equal(smashBonus(20), POWER.BONUS_MAX);
  assert.equal(scoreFor(3, 1, 2), Math.round(60 * 1.1));
});
