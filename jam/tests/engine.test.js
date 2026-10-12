// Traffic model tests: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim, DT, runFor } from '../js/sim/engine.js';
import { ringScenario, highwayScenario, crossScenario } from '../js/sim/scenarios.js';
import { idm, idmEqSpeed } from '../js/sim/models.js';
import { MISSIONS } from '../js/game/missions.js';
import { MissionRun } from '../js/game/runner.js';
import { applyPreset } from '../js/game/controls.js';
import { makeQuiz, QUIZ_KINDS } from '../js/game/quiz.js';

const ring = (n, o = {}) => new Sim(ringScenario({ n, seed: 7, ...o }));

function firstJam(sim, seconds) {
  for (let i = 0; i < seconds / DT; i++) { sim.step(); if (sim.st.jam.on) return sim.st.t; }
  return null;
}

// Safety invariants checked every step: no overlap, no teleport, no reversing
function checkInvariants(sim, seconds) {
  const prev = new Map();
  let worst = Infinity;
  for (let i = 0; i < seconds / DT; i++) {
    sim.step();
    for (const v of sim.st.vehicles) {
      assert.ok(v.v >= 0, 'speed never negative');
      assert.ok(Number.isFinite(v.s) && Number.isFinite(v.v), 'finite state');
      const p = prev.get(v.id);
      if (p && p.road === v.road) {
        let ds = v.s - p.s;
        if (sim.roads[v.road].closed && ds < -sim.roads[v.road].length / 2) ds += sim.roads[v.road].length;
        assert.ok(ds >= -1e-9, `no reversing (#${v.id} ds=${ds})`);
        assert.ok(ds <= 60 * DT + 0.01, `no teleport (#${v.id} ds=${ds})`);
      }
      prev.set(v.id, { road: v.road, s: v.s });
    }
    sim.L.forEach((road, ri) => road.forEach((arr0) => {
      const arr = [...arr0].sort((x, y) => x.s - y.s); // lanes are re-sorted at the start of the next step
      for (let k = 0; k + 1 < arr.length; k++) worst = Math.min(worst, arr[k + 1].s - arr[k + 1].len - arr[k].s);
      if (sim.roads[ri].closed && arr.length > 1) { const a = arr[arr.length - 1], b = arr[0]; worst = Math.min(worst, b.s + sim.roads[ri].length - b.len - a.s); }
    }));
  }
  return worst;
}

test('IIDM basics: free road accelerates, standing obstacle brakes, equilibrium gap = s0 + vT', () => {
  assert.ok(idm(10, 30, Infinity, 0, 1.4, 2, 1.3, 2) > 1);
  assert.ok(idm(20, 30, 10, 20, 1.4, 2, 1.3, 2) < -5);
  const v = idmEqSpeed(2 + 15 * 1.4, 30, 1.4, 2);
  assert.ok(Math.abs(v - 15) < 1e-9);
  assert.ok(Math.abs(idm(15, 30, 2 + 15 * 1.4, 0, 1.4, 2, 1.3, 2)) < 0.15);
});

test('1. low density ring road stays free flowing', () => {
  const sim = ring(14);
  assert.equal(firstJam(sim, 180), null);
  const vs = sim.st.vehicles.map((v) => v.v * 3.6);
  assert.ok(Math.min(...vs) > 30, 'nobody slows down a lot');
});

test('2. dense ring road with human drivers develops a phantom jam without any trigger', () => {
  const sim = ring(26);
  const t = firstJam(sim, 150);
  assert.ok(t != null && t > 5, `jam emerged at ${t}`);
  assert.equal(Object.values(sim.st.chains).filter((c) => c.player).length, 0);
});

test('3. the stop-and-go wave travels backwards while cars move forwards', () => {
  const sim = ring(26);
  runFor(sim, 150);
  const speeds = [];
  for (let i = 0; i < 60 / DT; i++) { sim.step(); for (const tr of sim.st.jam.tracks) if (tr.n >= 4 && tr.hist.length >= 10 && tr.speed != null) speeds.push(tr.speed * 3.6); }
  assert.ok(speeds.length > 20);
  const med = speeds.sort((a, b) => a - b)[speeds.length >> 1];
  assert.ok(med < -5 && med > -40, `wave speed ${med.toFixed(1)} km/h`);
  assert.ok(sim.st.vehicles.every((v) => v.v >= 0));
});

test('4. a longer time gap changes the actual driving (longer gaps, lower uniform speed)', () => {
  const a = ring(18, { T: 1.0, noise: 0 }), b = ring(18, { T: 2.0, noise: 0 });
  runFor(a, 60); runFor(b, 60);
  const mean = (s) => s.st.vehicles.reduce((x, v) => x + v.v, 0) / s.st.vehicles.length;
  assert.ok(mean(b) < mean(a) - 2, `${mean(a)} vs ${mean(b)}`);
  // and the change applies immediately to running vehicles
  b.p.T = 1.0; runFor(b, 60);
  assert.ok(Math.abs(mean(b) - mean(a)) < 1.5);
});

test('a single brake propagates to followers (brake chain) on a moderately dense ring', () => {
  const sim = ring(22);
  runFor(sim, 5);
  sim.input({ type: 'pulse', id: sim.st.vehicles[0].id, dur: 2.5, dec: 4 });
  runFor(sim, 40);
  const ch = Object.values(sim.st.chains).filter((c) => c.player);
  assert.ok(ch.length && ch[0].size >= 10, `chain ${ch.map((c) => c.size)}`);
});

test('cooperative automated vehicles damp stop-and-go waves on the ring', () => {
  const run = (av) => { const s = ring(26, { av }); runFor(s, 240); let v = 0, n = 0; for (let i = 0; i < 60 / DT; i++) { s.step(); if (i % 20 === 0) { v += s.snapshot().v; n++; } } return v / n; };
  const human = run(0), mixed = run(0.2);
  assert.ok(mixed > human + 3, `${human.toFixed(1)} -> ${mixed.toFixed(1)} km/h`);
});

test('5. more on-ramp traffic slows the main line', () => {
  const mk = (qr) => new Sim(highwayScenario({ seed: 3, length: 1600, lanes: 2, ramp: { at: 1000, acc: 250, len: 260, demand: [[0, qr]] }, demand: [[0, 2700]] }));
  const lo = mk(200), hi = mk(1100);
  runFor(lo, 420); runFor(hi, 420);
  assert.ok(hi.st.m.rd[0] > lo.st.m.rd[0] * 1.5, `main delay ${lo.st.m.rd[0] | 0} -> ${hi.st.m.rd[0] | 0}`);
});

test('6. measures change the measured indicators (same seed, same demand)', () => {
  const ms5 = MISSIONS.find((m) => m.id === 's5');
  const r5 = new MissionRun(ms5); r5.start(); applyPreset(r5.sim, { pol: { sagInfo: true } });
  while (!r5.done) r5.step();
  assert.ok(r5.result.imp > 10, `sag info ${r5.result.imp}`);
  // ramp metering: lower main-line delay, but longer ramp waits
  const ms4 = MISSIONS.find((m) => m.id === 's4');
  const r4 = new MissionRun(ms4); r4.start(); applyPreset(r4.sim, { pol: { meter: { ramp: 500 } } });
  while (!r4.done) r4.step();
  const m = r4.sim.st.m, b = r4.twin.st.m;
  assert.ok(m.rampWait / m.rampN > (b.rampWait / b.rampN) * 1.5, 'ramp waits get longer');
  assert.ok(m.rd[0] < b.rd[0], 'main line delay drops');
});

test('7. no overlapping, teleporting or reversing vehicles (ring, merge, lane drop, signal)', () => {
  const cases = [
    ring(28),
    new Sim(highwayScenario({ seed: 4, length: 1600, lanes: 2, ramp: { at: 1000, acc: 250, len: 260, demand: [[0, 1000]] }, demand: [[0, 3000]] })),
    new Sim(highwayScenario({ seed: 5, length: 1800, lanes: 3, drop: 1300, demand: [[0, 4000]] })),
    new Sim(crossScenario({ seed: 6, eb: [[0, 1400]], wb: [[0, 1300]], nb: [[0, 500]], sb: [[0, 450]] })),
  ];
  cases[1].pol.meter = { ramp: 500 };
  for (const sim of cases) {
    const worst = checkInvariants(sim, 300);
    assert.ok(worst > 0, `min bumper gap ${worst}`);
    assert.equal(sim.st.clamps || 0, 0, 'collision guard never needed');
  }
});

test('8. fixed time step: same seed -> same result; pausing/speed do not matter; clones continue identically', () => {
  const a = ring(25), b = ring(25);
  runFor(a, 100);
  for (let k = 0; k < 4; k++) runFor(b, 25); // e.g. paused/resumed in between
  assert.deepEqual(a.st.vehicles.map((v) => +v.s.toFixed(9)), b.st.vehicles.map((v) => +v.s.toFixed(9)));
  const c = a.clone();
  runFor(a, 30); runFor(c, 30);
  assert.deepEqual(a.st.vehicles.map((v) => v.s), c.st.vehicles.map((v) => v.s));
});

test('9. every mission can be cleared', async (t) => {
  for (const ms of MISSIONS) {
    await t.test(ms.title, () => {
      let run;
      if (ms.id === 's1') {
        run = new MissionRun(ms); run.start();
        let k = 0;
        while (!run.done) { if (k === 40) { run.sim.input({ type: 'pulse', id: run.sim.st.vehicles[0].id, dur: 2.5, dec: 4 }); run.noteBrake(); } run.step(); k++; }
      } else if (ms.id === 's2') {
        run = new MissionRun(ms, { n: 23 }); run.start();
        while (!run.done) run.step();
      } else {
        run = new MissionRun(ms); run.start(); applyPreset(run.sim, ms.reference);
        while (!run.done) run.step();
      }
      assert.ok(run.result.stars >= 2, `${ms.id}: ${run.result.stars} stars ${JSON.stringify(run.result.rows)}`);
    });
  }
});

test('quiz scenarios really produce congestion', () => {
  const seen = new Set();
  for (let round = 0; round < 40 && seen.size < QUIZ_KINDS.length; round++) {
    const q = makeQuiz(round, 12345);
    if (seen.has(q.kind)) continue;
    seen.add(q.kind);
    const sim = new Sim(q.def);
    runFor(sim, q.warm);
    sim.st.jam.first = null;
    let ok = false;
    for (let i = 0; i < 170 / DT && !ok; i++) { sim.step(); ok = !!sim.st.jam.first; }
    assert.ok(ok, `${q.kind}: no jam`);
    assert.equal(q.options.filter((o) => o.k === q.kind).length, 1);
  }
  assert.equal(seen.size, QUIZ_KINDS.length);
});
