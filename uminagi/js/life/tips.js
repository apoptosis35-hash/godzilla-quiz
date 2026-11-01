// One-time hints: when the moment fits (the first catch, a few days in, a festival day...), a short 💡 note
// points at something the game never shows by itself: the camera, the vegetable seeds, cooking, clothes,
// the festival stall, showing the town to a friend. Each is shown once, at most one a minute.
import { dayKey } from './state.js';
import { festName } from './events.js';

const TIPS = [
  { id: 'photo', when: (L) => Object.keys(L.st.caught).length >= 1, lines: ['💡 画面の 上の 📷 ボタンで、写真が とれるよ。', 'ポーズを えらんで パシャリ。保存して 友だちに 見せてね。'] },
  { id: 'farm', when: (L) => Object.keys(L.st.caught).length >= 4 || L.st.money >= 3000, lines: ['💡 あらたの お店では、やさいの たねも 売っているよ。', '植えて 3〜4日で しゅうかく! 草地や 土の 上に 植えてね。'] },
  { id: 'cook', when: (L) => L.st.pocket.some((id) => id.startsWith('veg_')) || (L.st.ext.tips?.farm && Object.keys(L.st.caught).length >= 8), lines: ['💡 たき火(DIYで 作れるよ)や キッチンを しらべると、りょうりが できるよ。', '魚や やさいで 作った りょうりを 食べると、洞窟で ハートが もどるよ。'] },
  { id: 'clothes', when: (L) => L.st.pocket.some((id) => /^(hat_|face_|back_|bandana_)/.test(id)), lines: ['💡 ポケットの 服や 帽子を えらんで 「身につける」と、着がえられるよ。', 'はずすときは 👒 ボタン。'] },
  { id: 'visit', when: (L) => Object.keys(L.st.caught).length >= 15 || (L.st.town.built || []).length >= 2, lines: ['💡 設定(⚙️)の 「町を 友だちに 見せる」で、あなたの 町を 見学してもらえるよ。', '「セーブを 書き出す」で バックアップも とっておくと 安心。'] },
];

export class Tips {
  constructor(life) { this.life = life; this.st = life.st; this.st.ext.tips ||= {}; this.t = 25; this.last = 0; }
  update(dt) {
    const L = this.life; if ((this.t -= dt) > 0) return; this.t = 4;
    if (!L.app.playing || L.ui.busy() || L.home.inside || !this.st.intro || L.app.photo || globalThis.__uminagiVisit || navigator.webdriver) return;   // not in automated runs (tests, the commercial)
    if (Date.now() - this.last < 60e3) return;
    const seen = this.st.ext.tips;
    // a festival today: once per festival day
    const ev = L.fest?.ev, fk = ev && `fest:${ev}:${dayKey()}`;
    if (fk && !seen[fk] && L.fest.booth) { seen[fk] = 1; return this.show([`💡 きょうは ${festName(ev)}! キャンプの そばに 屋台が 出ているよ。`, 'おみやげが もらえるかも。よってみてね。']); }
    const tip = TIPS.find((x) => !seen[x.id] && x.when(L)); if (!tip) return;
    seen[tip.id] = 1; this.show(tip.lines);
  }
  show(lines) { this.last = Date.now(); this.st.save(); this.life.ui.say(null, lines); }
}
