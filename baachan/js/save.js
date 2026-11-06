// Progress: funny achievements (おもしろ実績) unlock passengers and outfits. Stored in localStorage.
const KEY = 'baachan3';

export const ACH = [
  { id: 'start', name: 'ばあちゃん、発進', how: '冒頭を見て走り出す' },
  { id: 'school', name: '送迎完了…？', how: '孫を小学校に送る' },
  { id: 'sale', name: '特売ハンター', how: 'スーパーの特売に突撃' },
  { id: 'army', name: 'おばちゃん軍団', how: '特売でおばちゃん軍団に追われる' },
  { id: 'shrine', name: 'おみくじ', how: '神社の鳥居をくぐる' },
  { id: 'bon', name: '盆踊り乱入', how: '盆踊りの輪に飛び込む' },
  { id: 'sento', name: 'いい湯じゃった', how: '銭湯に飛び込む' },
  { id: 'radio', name: 'ラジオ体操ドミノ', how: '公園のラジオ体操に突っ込む' },
  { id: 'pigeon', name: 'ハトの大爆発', how: 'ハトを100羽 驚かす' },
  { id: 'cop', name: 'パトカーをまいた', how: 'パトカーから逃げきる' },
  { id: 'copfly', name: '公務執行妨害', how: '覚醒中にパトカーを吹っ飛ばす' },
  { id: 'jii', name: 'じいちゃんに勝つ', how: '空飛ぶじいちゃんとの競争に勝つ' },
  { id: 'dog', name: 'ポチの追跡', how: '柴犬に追いかけられる' },
  { id: 'ramp', name: '着地10点', how: 'ジャンプ台で大ジャンプ' },
  { id: 'drift', name: 'ばあちゃんドリフト', how: '3秒ドリフトする' },
  { id: 'wall', name: '壁ドン名人', how: '壁ドンを20回' },
  { id: 'tea', name: 'お茶中毒', how: 'お茶ブーストを15回' },
  { id: 'combo', name: '50コンボ', how: '50コンボを出す' },
  { id: 'fever', name: 'ばあちゃん覚醒', how: 'ゲージを満タンにする' },
  { id: 'man', name: '部長が星に', how: 'サラリーマンを15人 飛ばす' },
  { id: 'tanuki', name: 'たぬき大量発生', how: 'たぬきを15体 飛ばす' },
  { id: 'car', name: '車も飛ぶ', how: '車を10台 吹っ飛ばす' },
  { id: 'speed', name: '新幹線より速い', how: '時速150kmを出す' },
  { id: 'dist', name: '町内一周', how: '合計5km走る' },
];

export const RIDERS = [
  { id: 'kid', name: '孫のたけし', need: 0 },
  { id: 'shiba', name: '柴犬のポチ', need: 3 },
  { id: 'cat', name: 'ねこのタマ', need: 6 },
  { id: 'tanuki', name: 'たぬきの置物', need: 9 },
  { id: 'jii', name: 'じいちゃん', need: 12 },
  { id: 'salaryman', name: '部長', need: 16 },
  { id: 'daruma', name: 'だるま', need: 20 },
];
export const OUTFITS = [
  { id: 'purple', name: 'むらさきカーディガン', need: 0 },
  { id: 'leopard', name: 'ヒョウ柄', need: 4 },
  { id: 'jersey', name: '赤ジャージ', need: 8 },
  { id: 'gold', name: '金ラメ', need: 14 },
];

export const save = { ach: {}, best: 0, rider: 'kid', outfit: 'purple', dist: 0, seenIntro: false };
try { Object.assign(save, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* ignore */ }
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
export const achCount = () => ACH.filter((a) => save.ach[a.id]).length;
export const unlocked = (item) => achCount() >= item.need;
