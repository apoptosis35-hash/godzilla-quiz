// Missions (stages 1-8). Every score is computed from the simulation itself.
// Flow missions compare the player's run with a "twin" run that starts from the
// same state, same random seed and same demand but without any measures.

import { ringScenario, highwayScenario, crossScenario } from '../sim/scenarios.js';
import { KMH } from '../sim/models.js';

const prof = (q, f = [0.6, 0.75, 1, 1, 0.7]) => [[0, q * f[0]], [90, q * f[1]], [150, q * f[2]], [450, q * f[3]], [510, q * f[4]]];

export const CONTROLS = {
  count:     { label: '車両台数', unit: '台', min: 10, max: 34, step: 1 },
  v0:        { label: '目標速度', unit: 'km/h', min: 20, max: 80, step: 5 },
  T:         { label: '車間時間', unit: '秒', min: 0.6, max: 2.5, step: 0.1 },
  lag:       { label: '反応の遅れ', unit: '秒', min: 0.2, max: 1.5, step: 0.1 },
  truck:     { label: 'トラック混入率', unit: '%', min: 0, max: 40, step: 5 },
  av:        { label: '協調自動運転車の割合', unit: '%', min: 0, max: 50, step: 5 },
  vsl:       { label: '速度制限（上流）', unit: 'km/h', options: [[0, '通常 100'], [80, '80'], [60, '60']] },
  meter:     { label: 'ランプメーター', unit: '台/時', options: [[0, 'なし'], [900, '900'], [700, '700'], [500, '500'], [350, '350']] },
  mergeCare: { label: '合流部の交通整理', toggle: true },
  zipper:    { label: 'ファスナー合流', toggle: true },
  advice:    { label: '早めの車線変更案内', toggle: true },
  shoulder:  { label: '路肩を臨時車線に（70km/h制限）', toggle: true },
  sagInfo:   { label: '上り坂で速度回復の呼びかけ', toggle: true },
  keepLeft:  { label: '左車線の利用を促す', toggle: true },
  peakSpread:{ label: '時差出勤の呼びかけ', unit: '%', min: 0, max: 50, step: 10 },
  demandMul: { label: '流入交通量', unit: '%', min: 70, max: 110, step: 5 },
  cycle:     { label: '信号サイクル長', unit: '秒', min: 40, max: 160, step: 10 },
  split:     { label: '東西方向の青時間の割合', unit: '%', min: 30, max: 75, step: 5 },
  avDamp:    { label: '自動運転車の渋滞吸収走行', toggle: true },
};

export const MISSIONS = [
  {
    id: 's1', no: 1, title: 'たった1台のブレーキ', kind: 'ring', mode: 'brake',
    brief: '円形道路を22台が順調に走っています。どれか1台をタップして、ブレーキをかけてみよう。',
    goal: '1台のブレーキを後ろの車へ伝え、渋滞を生み出す',
    starText: ['ブレーキが5台以上に連鎖', '10台以上に連鎖', '停止に近い渋滞（5km/h未満）が発生'],
    make: (seed = 101) => ringScenario({ n: 22, seed }),
    warm: 3, dur: 75, controls: [],
    lesson: 'ブレーキの影響は、後ろの車の反応の遅れと車間の詰まりによって増幅されます。前の車より強く・長くブレーキを踏む車が続くと、最後には止まってしまいます。',
    evaluate(r) {
      const n = r.playerChain || 0;
      const stars = (n >= 5 ? 1 : 0) + (n >= 10 ? 1 : 0) + (n >= 5 && r.minSpeedAfter < 5 ? 1 : 0);
      return { stars, rows: [
        { label: 'ブレーキの連鎖', mine: `${n}台` },
        { label: '後続車の最低速度', mine: `${r.minSpeedAfter.toFixed(0)} km/h` },
        { label: '渋滞した車（最大）', mine: `${r.maxJamVeh}台` },
      ] };
    },
  },
  {
    id: 's2', no: 2, title: '何もない道路の謎', kind: 'ring', mode: 'phantom',
    brief: '事故も信号もない円形道路。誰もブレーキ操作をしなくても、渋滞は起きるのでしょうか？ 台数だけを変えて確かめよう。',
    goal: 'ブレーキ操作なしで、150秒以内に自然渋滞を起こす（少ない台数ほど高評価）',
    starText: ['自然渋滞が発生', '24台以下で発生', '23台以下で発生'],
    make: (seed = 202, n = 18) => ringScenario({ n, seed }),
    warm: 0, dur: 150, controls: ['count'], noBrake: true,
    lesson: '台数が増えて車間が詰まると、ほんの小さな速度のゆらぎが後ろへ行くほど大きくなります（不安定化）。これが、事故も信号もない場所で起きる「自然渋滞」です（Sugiyama et al. 2008）。',
    evaluate(r) {
      const ok = r.jamT != null;
      const stars = ok ? 1 + (r.count <= 24 ? 1 : 0) + (r.count <= 23 ? 1 : 0) : 0;
      return { stars, rows: [
        { label: '台数', mine: `${r.count}台` },
        { label: '渋滞の発生', mine: ok ? `${r.jamT.toFixed(0)}秒後` : 'なし' },
        { label: '平均速度', mine: `${r.meanV.toFixed(1)} km/h` },
      ] };
    },
  },
  {
    id: 's3', no: 3, title: '車が増えすぎた高速道路', kind: 'flow',
    brief: '夕方のピーク。トンネルの手前で速度が落ち、交通量が容量を超えると渋滞が始まります。',
    goal: '対策なしと比べて、総遅れ時間を減らす',
    starText: ['12%以上減らす', '22%以上減らす', '32%以上減らす'],
    make: (seed = 303) => highwayScenario({ id: 's3', seed, length: 1800, lanes: 2, zones: [{ from: 1200, to: 1600, v0Mul: 0.85, TMul: 1.15, label: 'トンネル' }], demand: prof(3900), peak: { from: 150, to: 510, mean: 3900 * 0.8 }, vsl: { road: 'main', from: 500, to: 1200 } }),
    warm: 90, dur: 420, controls: ['peakSpread', 'vsl', 'av'],
    metric: 'delay', thresholds: [12, 22, 32],
    lesson: '容量を超えた分の車は、どこかで待つしかありません。需要のピークを少しずらすだけで、渋滞は大きく減ります。速度制限だけでは容量は増えません。',
    reference: { pol: { peakSpread: 0.5 }, params: { av: 0.3 } },
  },
  {
    id: 's4', no: 4, title: '合流地点の大混乱', kind: 'flow',
    brief: '流入ランプから次々に車が合流し、本線が詰まりはじめています。',
    goal: 'ランプの平均待ち時間を60秒以内に保ちつつ、本線の遅れを減らす',
    starText: ['本線の遅れを10%以上減らす', '20%以上減らす', '30%以上減らす'],
    make: (seed = 404) => highwayScenario({ id: 's4', seed, length: 1600, lanes: 2, ramp: { at: 1000, acc: 250, len: 260, demand: prof(800, [0.5, 0.6, 1, 1, 0.6]) }, demand: prof(2700), vsl: { road: 'main', from: 300, to: 1000 } }),
    warm: 90, dur: 420, controls: ['meter', 'mergeCare', 'vsl', 'av'],
    metric: 'mainDelay', thresholds: [10, 20, 30], rampLimit: 60,
    lesson: 'ランプメーターで流入を絞ると本線は流れやすくなりますが、ランプ側の待ち時間が増えます。どこまで絞るかは、本線とランプの「痛み分け」です。',
    reference: { pol: { meter: { ramp: 700 } }, params: {} },
  },
  {
    id: 's5', no: 5, title: '上り坂の落とし穴', kind: 'flow',
    brief: '下り坂から上り坂に変わる「サグ部」。運転手は坂に気づかず、知らないうちに速度が落ちていきます。',
    goal: '対策なしと比べて、総遅れ時間を減らす',
    starText: ['10%以上減らす', '20%以上減らす', '30%以上減らす'],
    make: (seed = 505) => highwayScenario({ id: 's5', seed, length: 1800, lanes: 2, grades: [{ from: 600, to: 1000, g: -0.02 }, { from: 1000, to: 1500, g: 0.035 }], demand: prof(3400), keepBias: -0.1 }),
    warm: 90, dur: 420, controls: ['sagInfo', 'keepLeft', 'av'],
    metric: 'delay', thresholds: [10, 20, 30],
    lesson: 'サグ部では、わずかな上り勾配でアクセルを踏み足さない車が減速し、後続に減速が伝わります。日本の高速道路の渋滞の多くはサグ部で起きています。',
    reference: { pol: { sagInfo: true, keepLeft: true }, params: {} },
  },
  {
    id: 's6', no: 6, title: '車線減少を乗り越えろ', kind: 'flow',
    brief: '3車線が2車線に減る地点。ここで交通容量が足りなくなります。',
    goal: '対策なしと比べて、総遅れ時間を減らす',
    starText: ['10%以上減らす', '30%以上減らす', '50%以上減らす'],
    make: (seed = 606) => highwayScenario({ id: 's6', seed, length: 1800, lanes: 3, drop: 1300, demand: prof(3600), vsl: { road: 'main', from: 500, to: 1300 } }),
    warm: 90, dur: 420, controls: ['zipper', 'advice', 'shoulder', 'vsl', 'av'],
    metric: 'delay', thresholds: [10, 30, 50],
    lesson: '容量そのものを増やす対策（路肩の活用）は効果が大きい一方、安全のため速度制限が必要です。合流の仕方を変えるだけでは、容量不足は解消しません。',
    reference: { pol: { shoulder: true }, params: {} },
  },
  {
    id: 's7', no: 7, title: '信号タイミングを最適化', kind: 'flow',
    brief: '東西の幹線道路と南北の生活道路が交わる交差点。今は「サイクル140秒・青時間半々」です。',
    goal: '対策なしと比べて、交差点全体の遅れ時間を減らす',
    starText: ['10%以上減らす', '18%以上減らす', '25%以上減らす'],
    make: (seed = 707) => crossScenario({ seed, cycle: 140, split: 0.5, eb: [[0, 1300]], wb: [[0, 1170]], nb: [[0, 460]], sb: [[0, 390]] }),
    warm: 60, dur: 420, controls: ['cycle', 'split'],
    metric: 'delay', thresholds: [10, 18, 25],
    lesson: 'サイクルが長すぎると赤信号の待ちが長くなり、短すぎると黄・全赤の「損失時間」の割合が増えます。交通量の多い方向に青時間を多く配分するのが基本です（Websterの式）。',
    reference: { pol: { signal: { cycle: 100, split: 0.6 } }, params: {} },
  },
  {
    id: 's8', no: 8, title: '大都市の交通管制官', kind: 'flow',
    brief: '都市高速の夕方ラッシュ。合流・サグ・車線減少が続く区間を、あらゆる施策を使って守り抜こう。',
    goal: 'ランプの平均待ち時間60秒以内で、総遅れ時間を減らす',
    starText: ['15%以上減らす', '30%以上減らす', '45%以上減らす'],
    make: (seed = 808) => highwayScenario({ id: 's8', seed, length: 2600, lanes: 3, ramp: { at: 700, acc: 250, len: 260, demand: prof(600, [0.5, 0.6, 1, 1, 0.6]) }, grades: [{ from: 1300, to: 1750, g: 0.03 }], drop: 2150, demand: prof(3300), peak: { from: 150, to: 510, mean: 3300 * 0.8 }, vsl: { road: 'main', from: 300, to: 1300 }, keepBias: -0.05 }),
    warm: 90, dur: 420, controls: ['meter', 'mergeCare', 'sagInfo', 'shoulder', 'advice', 'peakSpread', 'vsl', 'av'],
    metric: 'delay', thresholds: [15, 30, 45], rampLimit: 60,
    lesson: '渋滞の原因は1つとは限りません。どこがボトルネックかを見抜き、その場所に合った施策を組み合わせるのが交通管制の腕の見せどころです。',
    reference: { pol: { sagInfo: true, shoulder: true, mergeCare: true, peakSpread: 0.3 }, params: {} },
  },
];

// Score a flow mission from the player's and the twin's measurements.
export function scoreFlow(ms, m, b) {
  const pick = (x) => (ms.metric === 'mainDelay' ? x.rd[0] : x.delay);
  const mine = pick(m), base = pick(b);
  const imp = base > 1 ? ((base - mine) / base) * 100 : 0;
  let stars = ms.thresholds.reduce((n, th) => n + (imp >= th ? 1 : 0), 0);
  const rampW = m.rampN ? m.rampWait / m.rampN : 0;
  const rampB = b.rampN ? b.rampWait / b.rampN : 0;
  let note = '';
  if (ms.rampLimit && rampW > ms.rampLimit) { stars = Math.min(stars, 1); note = `ランプ待ちが${ms.rampLimit}秒を超えたため最大★1`; }
  const rows = [
    { label: ms.metric === 'mainDelay' ? '本線の遅れ' : '総遅れ時間', mine: fmtVehMin(mine), base: fmtVehMin(base), better: mine <= base },
    { label: '通過台数', mine: `${m.served}台`, base: `${b.served}台`, better: m.served >= b.served },
    { label: '最大渋滞長', mine: `${Math.round(m.maxJam)} m`, base: `${Math.round(b.maxJam)} m`, better: m.maxJam <= b.maxJam },
    { label: '急ブレーキ', mine: `${m.hard}回`, base: `${b.hard}回`, better: m.hard <= b.hard },
  ];
  if (m.rampN || b.rampN) rows.push({ label: 'ランプ平均待ち', mine: `${rampW.toFixed(0)}秒`, base: `${rampB.toFixed(0)}秒`, better: rampW <= rampB + 1 });
  return { stars, imp, rows, note };
}

export function fmtVehMin(vs) {
  const min = vs / 60;
  return min >= 60 ? `${(min / 60).toFixed(1)} 台·時` : `${min.toFixed(0)} 台·分`;
}

export function missionById(id) { return MISSIONS.find((m) => m.id === id); }
export { KMH };
