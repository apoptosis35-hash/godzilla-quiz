// Second wave of island life items: furniture (indoor / outdoor), DIY materials and recipes, clothes, seeds,
// sea creatures and the extra fish and bugs (data2.js). Everything registers into ITEMS so the pocket, the shop
// and the museum handle it like the first-wave items.
import { ITEMS, ICON, ICON_BY_ID } from './state.js';
import { FISH, BUGS, FOSSILS } from './data.js';
import { FISH_MORE, BUGS_MORE, SEA } from './data2.js';
import { FISH_MORE2, BUGS_MORE2, SEA_MORE, FOSSILS_MORE } from './data3.js';

for (const f of FISH_MORE2) if (!FISH.some((x) => x.id === f.id)) FISH_MORE.push(f);
for (const b of BUGS_MORE2) if (!BUGS.some((x) => x.id === b.id)) BUGS_MORE.push(b);
for (const s of SEA_MORE) if (!SEA.some((x) => x.id === s.id)) SEA.push(s);
for (const f of FOSSILS_MORE) if (!FOSSILS.some((x) => x.id === f.id)) { FOSSILS.push(f); ITEMS[f.id] = { ...f, kind: 'fossil' }; }
for (const f of FISH_MORE) if (!FISH.some((x) => x.id === f.id)) { FISH.push(f); ITEMS[f.id] = { ...f, kind: 'fish' }; }
for (const b of BUGS_MORE) if (!BUGS.some((x) => x.id === b.id)) { BUGS.push(b); ITEMS[b.id] = { ...b, kind: 'bug' }; }
for (const s of SEA) ITEMS[s.id] = { ...s, kind: 'sea' };
export { SEA };

// furniture: model = kit model name (home block, or an existing town prop), w/d = footprint in metres,
// where = 'in' (house), 'out' (town) or 'both'. price 0 = only from DIY / gifts / events.
export const FURNITURE = [
  { id: 'furn_table_wood', name: '木のテーブル', price: 1200, w: 0.8, d: 0.8, where: 'both' },
  { id: 'furn_chair_wood', name: '木のいす', price: 800, w: 0.5, d: 0.5, where: 'both' },
  { id: 'furn_bed', name: 'ベッド', price: 2400, w: 1.0, d: 1.5, where: 'in' },
  { id: 'furn_bookshelf', name: '本だな', price: 1800, w: 0.9, d: 0.4, where: 'in' },
  { id: 'furn_lamp', name: 'スタンドライト', price: 1500, w: 0.4, d: 0.4, where: 'both', light: true },
  { id: 'furn_rug', name: 'まるいラグ', price: 900, w: 1.4, d: 1.4, where: 'in', flat: true },
  { id: 'furn_tansu', name: 'たんす', price: 3000, w: 0.9, d: 0.5, where: 'in' },
  { id: 'furn_kotatsu', name: 'こたつ', price: 3200, w: 1.0, d: 1.0, where: 'in' },
  { id: 'furn_radio', name: 'ラジオ', price: 1400, w: 0.5, d: 0.4, where: 'both' },
  { id: 'furn_aquarium', name: '水そう', price: 4800, w: 0.9, d: 0.45, where: 'in' },
  { id: 'furn_log_stool', name: '丸太のいす', price: 0, w: 0.45, d: 0.45, where: 'both' },
  { id: 'furn_log_bench', name: '丸太のベンチ', price: 0, w: 1.4, d: 0.5, where: 'both' },
  { id: 'furn_fence_bamboo', name: '竹の柵', price: 0, w: 1.0, d: 0.15, where: 'out' },
  { id: 'furn_fence_white', name: '白い柵', price: 0, w: 1.0, d: 0.15, where: 'out' },
  { id: 'furn_workbench', name: '作業台', price: 0, w: 1.0, d: 0.6, where: 'both', bench: true },
  { id: 'furn_pumpkin', name: 'かぼちゃランタン', price: 600, w: 0.5, d: 0.5, where: 'both', light: true, season: [10] },
  { id: 'furn_snowman', name: 'ゆきだるま', price: 0, w: 0.6, d: 0.6, where: 'out' },
  // second set (home2 block): Japanese room, seaside, cafe, rooms, garden, art
  { id: 'furn_zabuton', name: 'ざぶとん', price: 500, w: 0.5, d: 0.5, where: 'in', flat: true },
  { id: 'furn_byobu', name: 'なみのびょうぶ', price: 6800, w: 1.4, d: 0.4, where: 'in' },
  { id: 'furn_andon', name: 'あんどん', price: 2200, w: 0.4, d: 0.4, where: 'both', light: true },
  { id: 'furn_chabudai', name: 'ちゃぶ台', price: 2600, w: 0.8, d: 0.8, where: 'in' },
  { id: 'furn_bonsai', name: '松のぼんさい', price: 5400, w: 0.5, d: 0.4, where: 'both' },
  { id: 'furn_hibachi', name: 'ひばち', price: 3300, w: 0.5, d: 0.5, where: 'in' },
  { id: 'furn_tatami', name: 'たたみ', price: 1800, w: 1.8, d: 0.9, where: 'in', flat: true },
  { id: 'furn_kakejiku', name: 'かけじく', price: 4200, w: 0.6, d: 0.35, where: 'in' },
  { id: 'furn_beach_chair', name: 'ビーチチェア', price: 2400, w: 0.6, d: 1.1, where: 'out' },
  { id: 'furn_ship_wheel', name: '船のかじ', price: 3800, w: 0.7, d: 0.35, where: 'both' },
  { id: 'furn_anchor', name: 'いかり', price: 3000, w: 0.6, d: 0.4, where: 'both' },
  { id: 'furn_buoy_lamp', name: 'ブイのランプ', price: 2800, w: 0.45, d: 0.45, where: 'both', light: true },
  { id: 'furn_shell_lamp', name: '貝がらランプ', price: 2600, w: 0.4, d: 0.4, where: 'in', light: true },
  { id: 'furn_lifebuoy', name: 'うきわスタンド', price: 1900, w: 0.6, d: 0.3, where: 'out' },
  { id: 'furn_crab_plush', name: 'カニのクッション', price: 2100, w: 0.7, d: 0.5, where: 'in' },
  { id: 'furn_lighthouse_model', name: '灯台のもけい', price: 4600, w: 0.4, d: 0.4, where: 'in', light: true },
  { id: 'furn_cafe_table', name: 'カフェテーブル', price: 1600, w: 0.6, d: 0.6, where: 'both' },
  { id: 'furn_cafe_chair', name: 'カフェチェア', price: 1100, w: 0.45, d: 0.45, where: 'both' },
  { id: 'furn_counter', name: 'カフェカウンター', price: 7200, w: 1.3, d: 0.55, where: 'in' },
  { id: 'furn_cake_stand', name: 'ケーキスタンド', price: 2900, w: 0.45, d: 0.45, where: 'in' },
  { id: 'furn_monstera', name: 'モンステラ', price: 3200, w: 0.7, d: 0.7, where: 'both' },
  { id: 'furn_sofa', name: 'ソファ', price: 5600, w: 1.3, d: 0.65, where: 'in' },
  { id: 'furn_desk', name: 'つくえ', price: 3600, w: 1.0, d: 0.55, where: 'in' },
  { id: 'furn_tv_retro', name: 'レトロなテレビ', price: 4400, w: 0.7, d: 0.5, where: 'in', light: true },
  { id: 'furn_piano', name: 'ピアノ', price: 12000, w: 1.2, d: 0.55, where: 'in' },
  { id: 'furn_wardrobe', name: 'クローゼット', price: 4800, w: 0.9, d: 0.5, where: 'in' },
  { id: 'furn_mirror', name: 'スタンドミラー', price: 2700, w: 0.5, d: 0.4, where: 'in' },
  { id: 'furn_clock_tall', name: 'のっぽの時計', price: 8800, w: 0.5, d: 0.35, where: 'in' },
  { id: 'furn_toy_box', name: 'おもちゃ箱', price: 2300, w: 0.7, d: 0.45, where: 'in' },
  { id: 'furn_teddy', name: '大きなくま', price: 3400, w: 0.6, d: 0.5, where: 'in' },
  { id: 'furn_guitar', name: 'ギター', price: 6200, w: 0.4, d: 0.4, where: 'in' },
  { id: 'furn_well', name: 'いど', price: 9800, w: 1.2, d: 1.2, where: 'out' },
  { id: 'furn_planter', name: '花のプランター', price: 1500, w: 1.1, d: 0.4, where: 'out' },
  { id: 'furn_swing', name: 'ブランコ', price: 7600, w: 1.6, d: 1.0, where: 'out' },
  { id: 'furn_birdhouse', name: '巣箱', price: 1700, w: 0.4, d: 0.4, where: 'out' },
  { id: 'furn_picnic_table', name: 'ピクニックテーブル', price: 4200, w: 1.4, d: 1.3, where: 'out' },
  { id: 'furn_campfire', name: 'たき火', price: 0, w: 0.9, d: 0.9, where: 'out', light: true },
  { id: 'furn_hammock', name: 'ハンモック', price: 5200, w: 2.0, d: 0.7, where: 'out' },
  { id: 'furn_mailbox_red', name: '赤いポスト', price: 2500, w: 0.4, d: 0.4, where: 'out' },
  { id: 'furn_easel', name: 'イーゼル', price: 1400, w: 0.7, d: 0.6, where: 'both' },
  // props from the town kit
  { id: 'bench', name: 'ベンチ', price: 2200, w: 1.6, d: 0.6, where: 'out', model: 'bench' },
  { id: 'plant_pots', name: '鉢植え', price: 700, w: 0.8, d: 0.5, where: 'both', model: 'plant_pots' },
  { id: 'ishidoro', name: '石どうろう', price: 3500, w: 0.8, d: 0.8, where: 'out', model: 'ishidoro' },
  { id: 'parasol', name: 'ビーチパラソル', price: 2000, w: 0.6, d: 0.6, where: 'out', model: 'parasol' },
  { id: 'bicycle', name: '自転車', price: 4200, w: 0.5, d: 1.7, where: 'out', model: 'bicycle' },
  { id: 'telescope', name: '望遠鏡', price: 5000, w: 0.6, d: 0.6, where: 'out', model: 'telescope' },
  { id: 'chochin_hanging', name: 'ちょうちん', price: 900, w: 0.4, d: 0.4, where: 'both', model: 'chochin_hanging' },
  { id: 'street_lantern', name: '街灯', price: 2600, w: 0.4, d: 0.4, where: 'out', model: 'street_lantern' },
];
for (const f of FURNITURE) ITEMS[f.id] = { ...f, kind: 'furniture', model: f.model || f.id, price: f.price || 300, sell: Math.round((f.price || 1200) / 4) };

// DIY materials live in a counter bag (st.mat), not in the pocket slots
export const MATERIALS = [
  { id: 'branch', name: '木の枝', price: 5 }, { id: 'wood', name: '木材', price: 60 }, { id: 'stone', name: '石', price: 75 },
  { id: 'iron', name: '鉄のかけら', price: 375 }, { id: 'star_frag', name: '星のかけら', price: 500 }, { id: 'snowflake', name: 'ゆきのけっしょう', price: 200 },
];
for (const m of MATERIALS) ITEMS[m.id] = { ...m, kind: 'material' };

// recipes: id = what it makes (a tool or a furniture id); known: from the start
export const RECIPES = [
  { id: 'net', mat: { branch: 5 }, known: true },
  { id: 'rod', mat: { branch: 5 }, known: true },
  { id: 'axe', mat: { branch: 3, stone: 1 }, known: true },
  { id: 'shovel', mat: { wood: 3, iron: 1 } },
  { id: 'furn_log_stool', mat: { wood: 4 }, known: true },
  { id: 'furn_fence_bamboo', mat: { branch: 6 }, known: true },
  { id: 'furn_workbench', mat: { wood: 6, iron: 1 } },
  { id: 'furn_log_bench', mat: { wood: 8 } },
  { id: 'furn_fence_white', mat: { wood: 4 } },
  { id: 'furn_table_wood', mat: { wood: 6 } },
  { id: 'furn_chair_wood', mat: { wood: 4 } },
  { id: 'furn_bookshelf', mat: { wood: 10, branch: 4 } },
  { id: 'furn_pumpkin', mat: { wood: 2, branch: 2 }, season: [10] },
  { id: 'furn_snowman', mat: { snowflake: 3, branch: 2 }, season: [12, 1, 2] },
  { id: 'furn_lamp', mat: { wood: 3, iron: 2, star_frag: 1 } },
  { id: 'furn_campfire', mat: { wood: 3, stone: 3 }, known: true },
  { id: 'furn_birdhouse', mat: { wood: 4, branch: 2 } },
  { id: 'furn_planter', mat: { wood: 5 } },
  { id: 'furn_picnic_table', mat: { wood: 12 } },
  { id: 'furn_well', mat: { wood: 8, stone: 10 } },
  { id: 'furn_swing', mat: { wood: 10, iron: 3 } },
  { id: 'furn_easel', mat: { wood: 5 } },
  { id: 'furn_shell_lamp', mat: { iron: 1, star_frag: 2 } },
  { id: 'furn_zabuton', mat: { branch: 4 } },
];
ITEMS.axe = { id: 'axe', name: 'おの', kind: 'tool', price: 500 };

// clothes: bandana colours (recolour ぽっけ's bandana) and hats (models from the home block)
export const CLOTHES = [
  { id: 'bandana_navy', name: '紺のバンダナ', price: 0, bandana: [0.12, 0.2, 0.42] },
  { id: 'bandana_red', name: '赤いバンダナ', price: 600, bandana: [0.78, 0.16, 0.14] },
  { id: 'bandana_green', name: '緑のバンダナ', price: 600, bandana: [0.18, 0.55, 0.3] },
  { id: 'bandana_yellow', name: '黄色いバンダナ', price: 600, bandana: [0.95, 0.75, 0.15] },
  { id: 'bandana_pink', name: 'ピンクのバンダナ', price: 600, bandana: [0.95, 0.55, 0.68] },
  { id: 'hat_straw', name: '麦わらぼうし', price: 1500, hat: 'hat_straw' },
  { id: 'hat_cap', name: 'キャップ', price: 1200, hat: 'hat_cap' },
  { id: 'hat_beanie', name: 'ニット帽', price: 1200, hat: 'hat_beanie' },
];
for (const c of CLOTHES) ITEMS[c.id] = { ...c, kind: 'clothes', price: c.price || 300 };

// seeds and plants: seeds grow into flowers in two days; a mikan planted grows into a fruit tree in three
export const SEEDS = [
  { id: 'seed_tulip', name: 'チューリップのたね', price: 120, flower: 'flowers_a' },
  { id: 'seed_pansy', name: 'パンジーのたね', price: 120, flower: 'flowers_b' },
  { id: 'seed_cosmos', name: 'コスモスのたね', price: 120, flower: 'flowers_c' },
];
for (const s of SEEDS) ITEMS[s.id] = { ...s, kind: 'seed' };
ITEMS.daikon = { id: 'daikon', name: 'だいこん', kind: 'daikon', price: 0 };
ITEMS.recipe = { id: 'recipe', name: 'DIYレシピ', kind: 'recipe', price: 0 };

Object.assign(ICON, { furniture: '🪑', material: '🪵', seed: '🌱', clothes: '🎀', sea: '🦀', daikon: '🥬', recipe: '📜' });
Object.assign(ICON_BY_ID, { axe: '🪓', hat_straw: '👒', hat_cap: '🧢', hat_beanie: '🧶', furn_lamp: '💡', furn_bed: '🛏️', furn_pumpkin: '🎃', furn_snowman: '⛄', furn_aquarium: '🐠',
  furn_radio: '📻', furn_bookshelf: '📚', furn_rug: '🟠', bicycle: '🚲', telescope: '🔭', parasol: '⛱️', plant_pots: '🪴', chochin_hanging: '🏮', ishidoro: '🏮', street_lantern: '💡',
  furn_fence_bamboo: '🎋', furn_fence_white: '🚧', furn_workbench: '🛠️', furn_kotatsu: '🫖', furn_tansu: '🗄️', wood: '🪵', stone: '🪨', iron: '⛓️', star_frag: '⭐', branch: '🌿', snowflake: '❄️' });
