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
  SPAWN_WEIGHTS: [30, 28, 22, 14, 6],
  OPENING_DROPS: 3,       // the first drops only use tiers 0..2
};

// Power drop: pull down to throw the piece harder.
export const POWER = {
  DEADZONE_PX: 12,        // a pull shorter than this (css px) is a normal drop
  PULL_PX: 120,           // pull distance (css px) for full power
  INIT_SPEED: 19,         // initial downward speed at full power (units per step); normal drop is PHYS.DROP_SPEED
  CURVE: 1.25,            // power -> speed curve (fine control at low power)
  FLIGHT_CAP: 24,         // speed cap for a power piece until it hits something (normal cap: PHYS.MAX_SPEED)
  MASS_BOOST: 1.6,        // the piece is up to (1 + this) times heavier for a moment at impact
  BOOST_MS: 320,          // how long the extra weight lasts after the first contact
  BOUNCE: 0.3,            // extra restitution at impact (x power): hard hits bounce things upward
  SUBSTEPS: 4,            // solver substeps while a power piece is flying or hitting
  SMASH_MIN: 0.31,        // weaker throws are treated like normal drops (no smash)
  SMASH_WINDOW: 900,      // ms after impact in which merges of struck pieces count as a smash
  SMASH_EXTEND: 600,      // each smash merge keeps the window open this much longer
  SMASH_MAX_MS: 3200,     // a smash event never lasts longer than this
  SHOCK_SPEED: 1.6,       // a struck piece passes the shock on only while it moves at least this fast
  BONUS_STEP: 0.1,        // smash bonus: +10% per smash merge after the first ...
  BONUS_MAX: 0.4,         // ... up to +40%
};

export function powerSpeed(p) {
  const k = Math.pow(Math.max(0, Math.min(1, p)), POWER.CURVE);
  return PHYS.DROP_SPEED + (POWER.INIT_SPEED - PHYS.DROP_SPEED) * k;
}

export function smashBonus(count) {
  return count >= 2 ? Math.min(POWER.BONUS_MAX, POWER.BONUS_STEP * (count - 1)) : 0;
}

// 10 tiers. r = collision radius in world units.
export const TIERS = [
  { id: 'edamame', name: 'えだまめ',          r: 13,  color: '#8fd35b', light: '#d4f7a0', dark: '#4f9a2f', fx: '#a8e86f',
    desc: 'ちいさくても元気いっぱい。ころころ転がるのが大好き。' },
  { id: 'tomato',  name: 'ミニトマト',         r: 18,  color: '#ff5b50', light: '#ffb0a3', dark: '#c42d2a', fx: '#ff8a7a',
    desc: 'ウインクがチャームポイントのおしゃれさん。つやつやのほっぺがじまん。' },
  { id: 'tamago',  name: 'たまごやき',         r: 25,  color: '#ffd64a', light: '#fff4b0', dark: '#e2a32a', fx: '#ffe066',
    desc: 'ふんわり3層まき。いつもにこにこムードメーカー。' },
  { id: 'tako',    name: 'タコさんウインナー', r: 32,  color: '#ff6f86', light: '#ffc0c6', dark: '#d2405a', fx: '#ff8fa3',
    desc: '8本…じゃなくて4本足。くちをとがらせるのがクセ。' },
  { id: 'shumai',  name: 'シュウマイ',         r: 40,  color: '#f8e9ad', light: '#fffbe2', dark: '#d9bf73', fx: '#b8e986',
    desc: 'あたまのグリーンピースがチャームポイント。いつもにっこりのおっとり屋さん。' },
  { id: 'karaage', name: 'からあげ',           r: 49,  color: '#e0912f', light: '#ffd27a', dark: '#9a5216', fx: '#ffb347',
    desc: 'カリッとジューシーな自信家。いつでもアツアツ、おべんとうの人気者。' },
  { id: 'ebi',     name: 'エビフライ',         r: 60,  color: '#eaa748', light: '#ffd98c', dark: '#a8641f', fx: '#ff8c5a',
    desc: 'ピンとのびたしっぽが自慢。サクサクの衣でかっこよく決める。' },
  { id: 'hamburg', name: 'ハンバーグ',         r: 72,  color: '#94512f', light: '#c98258', dark: '#5c2c16', fx: '#e0805a',
    desc: 'デミグラスソースをまとった、たよれるお兄さん。' },
  { id: 'onigiri', name: 'おにぎり',           r: 86,  color: '#ffffff', light: '#ffffff', dark: '#d9dee6', fx: '#9be3c8',
    desc: 'のりをまいた、おべんとうの主役。にこにこ笑顔で、中身はひみつ。' },
  { id: 'king',    name: 'おべんとう王',       r: 102, color: '#e8464f', light: '#ff9a96', dark: '#a6212d', fx: '#ffd84a',
    desc: 'すべてのおかずが集まって生まれた伝説の王さま。2つそろうと…？' },
];

export const MAX_TIER = TIERS.length - 1;

// おじゃま piece for online battles: never merges, pops when a merge happens right next to it
export const OJAMA_TIER = 99;
export const OJAMA = { id: 'ume', name: 'うめぼし', r: 15, color: '#d0355a', light: '#ff8fa8', dark: '#8a1534', fx: '#ff7a9a' };
export function tierInfo(t) { return t === OJAMA_TIER ? OJAMA : TIERS[t]; }

// Online battle rules
export const VS = {
  TIME_MS: 180000,        // a match lasts 3 minutes; higher score wins if nobody overflows
  ATTACK_DELAY: 2200,     // incoming うめぼし wait this long (so you can cancel them) before falling
  RAIN_MAX: 5,            // at most this many fall at once
  RAIN_GAP: 900,          // ms between showers
  POP_PAD: 10,            // a merge this close (beyond touching) pops a うめぼし
  POP_POINTS: 20,
  SEND_HZ: 10,            // board updates sent to the opponent per second
};

// How many うめぼし a merge sends: bigger okazu and longer chains/smashes send more
export function attackFor(tier, level = 1, smash = 0) {
  let n = tier >= 3 ? Math.floor((tier - 1) / 2) : 0;   // tier 3-4: 1, 5-6: 2, 7-8: 3, 9: 4
  if (level >= 2) n += level - 1;
  if (smash >= 2) n += 1;
  return n;
}
export const KING_ATTACK = 6;

// deterministic RNG so both players get the same okazu order
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Points for creating tier n: 10, 30, 60, ... 550
export function basePoints(tier) { return 5 * tier * (tier + 1); }

export function comboMultiplier(combo) {
  let m = 1 + 0.3 * Math.max(0, combo - 1);
  if (m > 4) m = 4;
  if (combo >= RULES.FEVER_COMBO) m *= 1.5;
  return m;
}

export function scoreFor(newTier, combo, smash = 0) {
  return Math.round(basePoints(newTier) * comboMultiplier(combo) * (1 + smashBonus(smash)));
}

export function kingScore(combo, smash = 0) {
  return Math.round(RULES.KING_BONUS * comboMultiplier(combo) * (1 + smashBonus(smash)));
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
