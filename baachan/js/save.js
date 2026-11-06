// Progress: rank (段位), three missions per rank, unlockable riders and outfits. Stored in localStorage.
const KEY = 'baachan2';

export const RANKS = ['見習いばあちゃん', '散歩ばあちゃん', '買い物ばあちゃん', '井戸端ばあちゃん', '商店街のうわさ', '町内会の韋駄天', '暴走老人会', '特売ハンター',
  'ゲートボール番長', '腰痛知らず', '町の伝説', '市内最速', '県内最速', '新幹線より速い', '音速の老婆', 'ジェットばあちゃん', '光速ばあちゃん', '宇宙ばあちゃん', '銀河ばあちゃん', '神ばあちゃん'];
export const rankName = (r) => r <= RANKS.length ? RANKS[r - 1] : `神ばあちゃん+${r - RANKS.length}`;

export const RIDERS = [
  { id: 'kid', name: '孫のたけし', rank: 1 },
  { id: 'shiba', name: '柴犬のポチ', rank: 2 },
  { id: 'cat', name: 'ねこのタマ', rank: 4 },
  { id: 'tanuki', name: 'たぬきの置物', rank: 5 },
  { id: 'jii', name: 'じいちゃん', rank: 7 },
  { id: 'salaryman', name: '部長', rank: 11 },
  { id: 'daruma', name: 'だるま', rank: 13 },
];
export const OUTFITS = [
  { id: 'purple', name: 'むらさきカーディガン', rank: 1 },
  { id: 'leopard', name: 'ヒョウ柄', rank: 3 },
  { id: 'jersey', name: '赤ジャージ', rank: 6 },
  { id: 'gold', name: '金ラメ', rank: 9 },
];

const T = [
  { k: 'dist', t: (n) => `1回で${n}m走る`, n: (r) => 300 + r * 150 },
  { k: 'smash', t: (n) => `1回で${n}個 吹っ飛ばす`, n: (r) => 20 + r * 12 },
  { k: 'combo', t: (n) => `${n}コンボを出す`, n: (r) => 10 + r * 6 },
  { k: 'tanuki', t: (n) => `たぬきを${n}体 吹っ飛ばす`, n: (r) => 2 + r },
  { k: 'man', t: (n) => `サラリーマンを${n}人 飛ばす`, n: (r) => 2 + Math.ceil(r / 2) },
  { k: 'fever', t: (n) => `1回で${n}回 覚醒する`, n: (r) => 1 + Math.floor(r / 3) },
  { k: 'score', t: (n) => `スコア${n.toLocaleString()}点`, n: (r) => 4000 + r * 3000 },
  { k: 'ramp', t: (n) => `ジャンプ台で${n}回 着地`, n: (r) => 1 + Math.floor(r / 4), min: 2 },
  { k: 'jii', t: () => 'じいちゃんを吹っ飛ばす', n: () => 1, min: 2 },
  { k: 'cop', t: () => 'パトカーをまく', n: () => 1, min: 3 },
  { k: 'nohit', t: (n) => `腰を減らさず${n}m`, n: (r) => 200 + r * 90 },
  { k: 'melon', t: (n) => `スイカを${n}箱 割る`, n: (r) => 2 + r },
  { k: 'vend', t: (n) => `自販機を${n}台 倒す`, n: (r) => 1 + Math.floor(r / 2) },
  { k: 'egg', t: () => '特売たまごを持ったまま300m', n: () => 1, min: 2 },
];

function seeded(s) { return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
export function missionsFor(rank) {
  const r = seeded(rank * 7919 + 13);
  const pool = T.filter((m) => !m.min || rank >= m.min);
  const out = [];
  if (rank === 1) return [{ k: 'smash', text: T[1].t(15), n: 15 }, { k: 'dist', text: T[0].t(300), n: 300 }, { k: 'combo', text: T[2].t(10), n: 10 }];
  while (out.length < 3) {
    const m = pool[Math.floor(r() * pool.length)];
    if (out.some((o) => o.k === m.k)) continue;
    const n = m.n(rank);
    out.push({ k: m.k, text: m.t(n), n });
  }
  return out;
}

export const save = { rank: 1, done: [false, false, false], best: 0, bestDist: 0, rider: 'kid', outfit: 'purple', plays: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* ignore */ }
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
export const unlocked = (item) => save.rank >= item.rank;
