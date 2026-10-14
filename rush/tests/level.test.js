import test from 'node:test';
import assert from 'node:assert/strict';
import { genLevel, simulateBest, applyOp, opLabel, BASE_START } from '../js/level.js';

test('gate math', () => {
  assert.equal(applyOp(10, { t: '+', v: 5 }), 15);
  assert.equal(applyOp(10, { t: '-', v: 15 }), 0);
  assert.equal(applyOp(10, { t: 'x', v: 3 }), 30);
  assert.equal(applyOp(7, { t: '/', v: 2 }), 3);
  assert.equal(applyOp(1, { t: '/', v: 2 }), 1);
  assert.equal(opLabel({ t: 'x', v: 2 }), '×2');
});

test('levels are deterministic', () => {
  assert.deepEqual(genLevel(7), genLevel(7));
});

test('every level 1..200 is clearable with best play from the base crowd', () => {
  for (let l = 1; l <= 200; l++) {
    const lv = genLevel(l);
    const end = simulateBest(lv, BASE_START);
    assert.ok(end > 0, `level ${l} not clearable`);
    assert.ok(lv.steps.every((s) => s.cost >= 1));
    assert.ok(lv.items.every((it, i) => i === 0 || it.z > lv.items[i - 1].z), `level ${l} items out of order`);
  }
});

test('every gate pair offers a real choice', () => {
  for (let l = 1; l <= 60; l++) {
    let n = BASE_START;
    for (const it of genLevel(l).items) {
      if (it.kind === 'gate') {
        assert.equal(it.ops.length, 2);
        n = Math.max(...it.ops.map((o) => applyOp(n, o)));
      } else if (it.kind === 'slide') n = applyOp(n, it.ops[0]);
      else if (it.kind === 'enemy' || it.kind === 'boss') n -= it.n;
      else n = Math.round(n * 0.85);
    }
  }
});

test('bonus levels have no enemies and every fifth level is one', () => {
  for (const l of [5, 10, 15]) {
    const lv = genLevel(l);
    assert.ok(lv.bonus);
    assert.ok(!lv.items.some((i) => i.kind === 'enemy' || i.kind === 'boss'));
  }
  assert.ok(!genLevel(4).bonus);
});
