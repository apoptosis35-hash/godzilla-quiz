// "原因を見抜け": random scenarios with one known cause of congestion.
import { ringScenario, highwayScenario, crossScenario } from '../sim/scenarios.js';
import { rnd, makeRng } from '../sim/rng.js';
import { CAUSES } from '../ui/content.js';

const flat = (q) => [[0, q]];

export const QUIZ_KINDS = ['accident', 'phantom', 'demand', 'sag', 'drop', 'signal'];

export function makeQuiz(round, seed) {
  const r = makeRng(seed * 7919 + round * 104729);
  const kind = QUIZ_KINDS[Math.floor(rnd(r) * QUIZ_KINDS.length)];
  const sd = 1000 + Math.floor(rnd(r) * 9000);
  let def, warm = 30, info = {};
  switch (kind) {
    case 'accident': {
      const lane = rnd(r) < 0.5 ? 0 : 1, s = 1000 + Math.floor(rnd(r) * 300);
      def = highwayScenario({ id: 'qa', seed: sd, length: 1600, lanes: 2, demand: flat(2400 + rnd(r) * 500), blockages: [{ road: 'main', lane, s, t0: warm + 8, t1: 1e9 }] });
      info = { road: 0, s };
      break;
    }
    case 'phantom': {
      def = ringScenario({ n: 26 + Math.floor(rnd(r) * 3), seed: sd });
      def.policies = { avDamp: true };
      warm = 5;
      break;
    }
    case 'demand': {
      def = highwayScenario({ id: 'qd', seed: sd, length: 1600, lanes: 2, ramp: { at: 1000, acc: 250, len: 260, demand: flat(900 + rnd(r) * 300) }, demand: flat(2600 + rnd(r) * 300) });
      info = { road: 0, s: 1000 };
      warm = 40;
      break;
    }
    case 'sag': {
      def = highwayScenario({ id: 'qs', seed: sd, length: 1800, lanes: 2, grades: [{ from: 600, to: 1000, g: -0.02 }, { from: 1000, to: 1500, g: 0.04 }], demand: flat(3400 + rnd(r) * 300), keepBias: -0.1 });
      info = { road: 0, s: 1060 };
      warm = 40;
      break;
    }
    case 'drop': {
      def = highwayScenario({ id: 'ql', seed: sd, length: 1800, lanes: 3, drop: 1300, demand: flat(3800 + rnd(r) * 300), shoulder: false });
      info = { road: 0, s: 1300 };
      warm = 40;
      break;
    }
    case 'signal': {
      const q = 1250 + rnd(r) * 200;
      def = crossScenario({ seed: sd, cycle: 150, split: 0.45, eb: flat(q), wb: flat(q * 0.9), nb: flat(450), sb: flat(380) });
      info = { road: 0, s: def.cross.X };
      warm = 20;
      break;
    }
    default: break;
  }
  // three wrong answers
  const others = QUIZ_KINDS.filter((k) => k !== kind);
  const opts = [kind];
  while (opts.length < 4) { const k = others.splice(Math.floor(rnd(r) * others.length), 1)[0]; opts.push(k); }
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rnd(r) * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { kind, def, warm, info, options: opts.map((k) => ({ k, label: CAUSES[k].label })) };
}

export const EXPLAIN = {
  accident: ['事故車が車線をふさぎ、その車線の容量がほぼゼロになりました。', 'ふさがれた車線の車は隣の車線へ移ろうとして、隣の車線も詰まります。', '渋滞の先頭は事故現場に固定され、最後尾が後ろへ伸びていきます。'],
  phantom: ['道路には事故も坂も合流もありません。', '車間が詰まった状態で、小さな速度のゆらぎが後ろの車ほど大きくなりました。', '渋滞の波は車と逆向きに、道路の上を後ろへ移動していきます。'],
  demand: ['ランプからの合流で、本線に入る車の合計が容量を超えました。', '合流する車が入り込むたびに、後ろの車がブレーキを踏みます。', '渋滞の先頭は合流部に固定され、本線の上流へ伸びていきます。'],
  sag: ['下り坂から上り坂に変わる地点（サグ部）です。', '運転手は坂に気づかず、加速が足りずに速度が落ちていきます。', '交通量が多いとその減速が後ろへ伝わり、坂の手前から渋滞します。'],
  drop: ['3車線が2車線に減る地点で、容量が足りなくなりました。', 'なくなる車線の車が次々に合流し、ブレーキが連鎖します。', '渋滞の先頭は車線が減る地点に固定されます。'],
  signal: ['赤信号の間に並んだ車が、青信号の間に捌けきれませんでした。', 'サイクルごとに残る車が増え、待ち行列が伸びていきます。', '渋滞の先頭は停止線にあります。'],
};
