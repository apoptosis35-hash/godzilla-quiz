// Moves ぽっけ learns as the town grows: dash once five kinds of creature are shown to the raccoon, jump once a public work is finished,
// climbing walls (and running over roofs) once ぽっけ has a house, and swinging on a line once the museum stands.
// Each comes with a little scene; the stamp book lists what is learnt and what unlocks the next one.
// `?town=all` (previews, tests) has everything.

const SKILLS = [
  { id: 'dash', name: 'ダッシュ', how: '生きものを 5種類 見つけて、あらたに 見せる', got: (L) => !!L.st.owlCalled,   // the "something nice" あらた promises in the welcome
    sp: { name: 'あらた', color: '#4f8a46', pitch: 1.05 },
    lines: ['そうそう、やくそくの 「いいこと」!', '島じゅうを かけまわってくれた ぽっけに、この 「かるがる スニーカー」を あげる!', '「ダッシュ」ボタンで 走れるように なったよ!\n(キーボードでは Shift)'] },
  { id: 'jump', name: 'ジャンプ', how: '町の工事を ひとつ 完成させる', got: (L) => L.st.town.built.length >= 1,
    sp: { name: 'モアイ', color: '#7fb85a', pitch: 0.72 },
    lines: ['やあ〜、工事 おつかれさま〜。', '現場で つかってた 「ばねの くつ」、ぽっけに あげるよ〜。', '「ジャンプ」ボタンで ジャンプできるように なったよ!\n(キーボードでは スペース)'] },
  { id: 'climb', name: 'かべのぼり', how: 'ぽっけの 家を 建てる', got: (L) => (L.st.ext.home?.stage || 0) >= 1,
    sp: { name: 'ガブ太', color: '#d07a34', pitch: 0.62 },
    lines: ['……家を 建てたそうだな。', 'これは 船乗りの 「すいつき グローブ」だ。マストも 壁も のぼれる。', '建物の 壁に むかって 歩きつづけると、壁を のぼれるように なった!\n屋根の 上も 走れるよ。'] },
  { id: 'web', name: 'いとで スイング', how: '資料館を 建てる(15点 寄贈)', got: (L) => L.st.town.built.includes('shrine'),
    sp: { name: 'ほうさく', color: '#7a5a32', pitch: 0.8 },
    lines: ['ほっほう、資料館の 完成 おめでとう。', 'おれいに、資料館の 倉庫で 見つけた 「ふしぎな 糸まき」を あげよう。', 'ジャンプして 空中で ジャンプボタンを 長押しすると、\n建物や 木に 糸を かけて スイングできるように なった!'] },
];

export class Skills {
  constructor(life) {
    this.life = life; this.st = life.st;
    this.st.ext.skills ||= {};
    this.all = !life.app.built;   // ?town=all
    this.t = 0;
    this.apply();
  }
  has(id) { return this.all || !!this.st.ext.skills[id]; }
  apply() {
    const p = this.life.player, d = document.getElementById('dash'), w = document.getElementById('web'), lbl = document.getElementById('weblbl');
    p.skills = Object.fromEntries(SKILLS.map((s) => [s.id, this.has(s.id)]));
    if (d) d.hidden = !p.skills.dash;
    if (w) w.hidden = !p.skills.jump;
    if (lbl) lbl.innerHTML = p.skills.web ? 'ジャンプ<br>長押しで糸' : 'ジャンプ';
  }
  // rows for the stamp book
  rows() { return SKILLS.map((s) => ({ name: s.name, have: this.has(s.id), how: s.how })); }
  async learn(s) {
    this.st.ext.skills[s.id] = Date.now(); this.st.save(); this.apply();
    this.life.ui.jingle([523, 659, 784, 1047, 1319]);
    await this.life.ui.say(s.sp, s.lines);
    await this.life.ui.say(null, `「${s.name}」を おぼえた!`);
  }
  update(dt) {
    if (this.all || (this.t -= dt) > 0) return;
    this.t = 1;
    if (this.life.ui.busy() || !this.st.intro || this.life.home.inside) return;
    const s = SKILLS.find((x) => !this.st.ext.skills[x.id] && x.got(this.life));
    if (s) this.learn(s);
  }
}
