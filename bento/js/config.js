// Game constants. All physics runs in fixed "world units" so behaviour is the
// same on every screen size; the renderer only scales the picture.

export const WORLD = {
  W: 400,          // inner width of the bento box
  FLOOR: 600,      // y of the box floor
  TOP: 96,         // y of the box rim (= game-over line)
  DROP_Y: 48,      // y where the held piece hangs
  WALL: 80,        // physics wall thickness (thick walls stop tunnelling)
  VIEW_PAD: 16,    // visual wall width drawn around the box
};

export const PHYS = {
  STEP: 1000 / 60,        // fixed physics step (ms)
  MAX_STEPS: 5,           // max catch-up steps per frame
  SUBSTEPS: 2,            // solver runs twice per step: less sinking, steadier stacks
  GRAVITY: 2.1,
  POS_ITER: 12,
  VEL_ITER: 10,
  RESTITUTION: 0.12,
  FRICTION: 0.08,
  FRICTION_STATIC: 0.45,
  FRICTION_AIR: 0.012,
  DENSITY: 0.0012,
  DENSITY_FALLOFF: 0.6,    // big pieces are less dense: keeps mass ratios sane for the solver
  MAX_SPEED: 21,          // units per step; with 2 substeps that is ~10 per solve, far below the smallest diameter (26)
  MAX_SPIN: 0.35,
  DROP_SPEED: 3.2,        // initial downward speed of a dropped piece
  GROW_MS: 110,           // physical growth time of a newly merged piece
};

export const RULES = {
  DROP_COOLDOWN: 380,     // ms until the next piece can be dropped
  INPUT_BUFFER: 160,      // a release this close to the end of cooldown is queued
  COMBO_WINDOW: 1200,     // ms of quiet after which the combo display ends
  CHAIN_LIFE: 1300,       // a merged piece continues the chain if it merges again within this time
  PUSH_WINDOW: 650,       // two old pieces pushed together this soon after a merge continue the chain
  OVER_TIME: 2300,        // ms above the rim before game over
  DANGER_GRACE: 450,      // ms after landing before a dropped piece can trigger danger
  FEVER_COMBO: 5,
  BIG_COMBO: 3,
  KING_BONUS: 3000,
  SPAWN_TIERS: 5,         // tiers 0..4 can be dropped
  SPAWN_WEIGHTS: [32, 27, 20, 13, 8],
  OPENING_DROPS: 3,       // the first drops only use tiers 0..2
};

// 11 tiers. r = collision radius in world units.
export const TIERS = [
  { id: 'edamame', name: 'えだまめ',          r: 13,  color: '#8fd35b', light: '#d4f7a0', dark: '#4f9a2f', fx: '#a8e86f',
    desc: 'ちいさくても元気いっぱい。ころころ転がるのが大好き。' },
  { id: 'tomato',  name: 'ミニトマト',         r: 18,  color: '#ff5b50', light: '#ffb0a3', dark: '#c42d2a', fx: '#ff8a7a',
    desc: 'はずかしがりや。つやつやのほっぺがじまん。' },
  { id: 'tamago',  name: 'たまごやき',         r: 25,  color: '#ffd64a', light: '#fff4b0', dark: '#e2a32a', fx: '#ffe066',
    desc: 'ふんわり3層まき。いつもにこにこムードメーカー。' },
  { id: 'tako',    name: 'タコさんウインナー', r: 31,  color: '#ff6f86', light: '#ffc0c6', dark: '#d2405a', fx: '#ff8fa3',
    desc: '8本…じゃなくて4本足。くちをとがらせるのがクセ。' },
  { id: 'shumai',  name: 'シュウマイ',         r: 38,  color: '#f8e9ad', light: '#fffbe2', dark: '#d9bf73', fx: '#b8e986',
    desc: 'あたまのグリーンピースがチャームポイント。おっとり屋さん。' },
  { id: 'karaage', name: 'からあげ',           r: 46,  color: '#e0912f', light: '#ffd27a', dark: '#9a5216', fx: '#ffb347',
    desc: 'カリッとジューシーな自信家。おべんとうの人気者。' },
  { id: 'ebi',     name: 'エビフライ',         r: 55,  color: '#eaa748', light: '#ffd98c', dark: '#a8641f', fx: '#ff8c5a',
    desc: 'ピンとのびたしっぽが自慢。サクサクの衣でかっこよく決める。' },
  { id: 'korokke', name: 'コロッケ',           r: 65,  color: '#cf8f3c', light: '#f5c877', dark: '#8a5520', fx: '#f0c060',
    desc: 'ほくほくのんびり屋。みんなのクッションがかり。' },
  { id: 'hamburg', name: 'ハンバーグ',         r: 76,  color: '#94512f', light: '#c98258', dark: '#5c2c16', fx: '#e0805a',
    desc: 'デミグラスソースをまとった、たよれるお兄さん。' },
  { id: 'onigiri', name: 'おにぎり',           r: 88,  color: '#ffffff', light: '#ffffff', dark: '#d9dee6', fx: '#9be3c8',
    desc: 'のりをまいた、おべんとうの主役。中身はひみつ。' },
  { id: 'king',    name: 'おべんとう王',       r: 102, color: '#e8464f', light: '#ff9a96', dark: '#a6212d', fx: '#ffd84a',
    desc: 'すべてのおかずが集まって生まれた伝説の王さま。2つそろうと…？' },
];

export const MAX_TIER = TIERS.length - 1;

// Points for creating tier n: 10, 30, 60, ... 550
export function basePoints(tier) { return 5 * tier * (tier + 1); }

export function comboMultiplier(combo) {
  let m = 1 + 0.3 * Math.max(0, combo - 1);
  if (m > 4) m = 4;
  if (combo >= RULES.FEVER_COMBO) m *= 1.5;
  return m;
}

export function scoreFor(newTier, combo) {
  return Math.round(basePoints(newTier) * comboMultiplier(combo));
}

export function kingScore(combo) {
  return Math.round(RULES.KING_BONUS * comboMultiplier(combo));
}

// Titles shown on the result screen.
export const RANKS = [
  [0, 'おべんとう見習い'],
  [3000, 'おかず係'],
  [8000, 'つめつめ上手'],
  [15000, 'おべんとう職人'],
  [25000, 'いろどり名人'],
  [40000, 'おかずマイスター'],
  [60000, 'おべんとう名人'],
  [90000, '伝説のおべんとう王'],
];
export function rankFor(score) {
  let t = RANKS[0][1];
  for (const [s, name] of RANKS) if (score >= s) t = name;
  return t;
}
