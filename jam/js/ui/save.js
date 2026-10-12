// Local save data (localStorage). Versioned and merged with defaults so that
// data from older versions keeps working after updates.
const KEY = 'jamlab.save';
const VERSION = 1;

const DEFAULTS = () => ({
  v: VERSION,
  tutorialDone: false,
  sound: true,
  night: false,
  stages: {},          // id -> { stars, bestImp, plays }
  achievements: {},    // id -> timestamp
  trivia: {},          // id -> timestamp
  experiments: 0,
  quiz: { best: 0, streak: 0, played: 0, correct: 0 },
  presets: [],         // [{ name, values }]
  seen: {},
});

let data = null;

export function load() {
  if (data) return data;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { raw = null; }
  data = merge(DEFAULTS(), raw || {});
  data.v = VERSION;
  return data;
}

function merge(def, src) {
  for (const k of Object.keys(src)) {
    if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) && src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) def[k] = merge(def[k], src[k]);
    else def[k] = src[k];
  }
  return def;
}

export function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode */ } }

export function get() { return load(); }

export function stageStars(id) { return (load().stages[id] || {}).stars || 0; }

export function recordStage(id, stars, imp) {
  const d = load();
  const s = d.stages[id] || { stars: 0, bestImp: null, plays: 0 };
  s.plays++;
  const newBest = stars > s.stars || (stars === s.stars && imp != null && (s.bestImp == null || imp > s.bestImp));
  s.stars = Math.max(s.stars, stars);
  if (imp != null && (s.bestImp == null || imp > s.bestImp)) s.bestImp = imp;
  d.stages[id] = s;
  save();
  return newBest;
}

// returns true when newly unlocked
export function unlock(kind, id) {
  const d = load();
  const box = kind === 'trivia' ? d.trivia : d.achievements;
  if (box[id]) return false;
  box[id] = Date.now();
  save();
  return true;
}

export function reset() { data = DEFAULTS(); save(); }
