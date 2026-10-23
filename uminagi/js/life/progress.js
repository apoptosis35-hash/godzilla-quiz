// Building the town up: it starts as an empty bay with a camp (the raccoon's stall and a couple of tents).
// Districts are ordered from the raccoon and paid for in ナギ; the work is done overnight, so an order shows up
// the next game day (after 5:00), like moving-in and construction in the slow-life games.
// `?town=all` builds everything at once (tests, previews).
import { dayKey } from './state.js';

export const PROJECTS = [
  { id: 'harbour', name: '漁港', desc: '岸壁の小物・桟橋・魚市場・漁船', cost: 3000, moves: 'vil_penguin' },
  { id: 'beach', name: '東の浜', desc: 'パラソルとサーフボードの海水浴場', cost: 3000, moves: 'vil_frog' },
  { id: 'roads', name: '道路と電柱', desc: '舗装・白線・標識・信号・車', cost: 5000 },
  { id: 'street', name: '商店街', desc: 'お店が並ぶ坂道(海凪商店もここへ)', cost: 8000, moves: 'vil_rabbit' },
  { id: 'houses', name: '丘の住宅街', desc: '石垣の段々に家が建つ', cost: 10000, moves: 'vil_squirrel' },
  { id: 'shrine', name: '海凪神社と資料館', desc: 'ほうさくさんの資料館も神社へ', cost: 6000, needs: 'owl' },
  { id: 'hill', name: '灯台の丘', desc: '展望灯台と遊歩道の柵', cost: 5000 },
  { id: 'tram', name: '海辺の電車', desc: '線路と駅と電車', cost: 8000, needs: 'roads' },
  { id: 'island', name: '弁天橋と凪ノ島', desc: '島へ渡る橋と島の神社', cost: 15000 },
];
// villagers living here from the start; the others move in with their district
export const FIRST_RESIDENTS = ['vil_cat', 'vil_bear'];

const KEY = 'uminagi_life_v1';
// the districts standing at load time (orders placed on an earlier day count as finished), or null = everything
export function townBuilt() {
  try { if (new URLSearchParams(location.search).get('town') === 'all') return null; } catch { /* no location */ }
  let t = null;
  try { t = JSON.parse(localStorage.getItem(KEY))?.town || null; } catch { /* private mode */ }
  const set = new Set(t?.built || []), today = dayKey();
  for (const [id, day] of Object.entries(t?.orders || {})) if (day !== today) set.add(id);
  return set;
}
