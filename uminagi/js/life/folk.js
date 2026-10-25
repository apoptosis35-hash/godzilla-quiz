// Newcomers: when a house plot stands empty (every first resident already has one), someone new moves in some
// mornings: a made-up villager of one of the six species, in their own colours, with a name, a personality and a
// catchphrase of their own. Up to ten residents. Now and then a newcomer thinks of moving on: they say so when
// you talk to them, and you can talk them out of it, or wish them well (they leave the next morning, freeing the
// plot for the next one).
import { VILLAGERS } from './data.js';
import { dayKey, seeded } from './state.js';
import { registerPhoto } from './goals.js';

const SPECIES = [['ねこ', 'vil_cat'], ['うさぎ', 'vil_rabbit'], ['くま', 'vil_bear'], ['ペンギン', 'vil_penguin'], ['かえる', 'vil_frog'], ['りす', 'vil_squirrel']];
const NAMES = ['こはる', 'ナツメ', 'ゆずき', 'ポポ', 'かりん', 'ソラ', 'まめた', 'ルル', 'さざなみ', 'こむぎ', 'ハル', 'ちょこ', 'あおい', 'ミント', 'たまき', 'ぽんた', 'つばき', 'わかめ', 'ひよこ', 'ボタン', 'しらす', 'くるみ', 'てまり', 'あられ'];
const PHRASES = ['ぽわん', 'だっちゃ', 'ふむふむ', 'にこっ', 'しゃきーん', 'ぷかぷか', 'ほっこり', 'ちゃぷん', 'わっしょい', 'ふわり', 'きらりん', 'どっこい', 'るんるん', 'ざぶーん'];
const PERSONALITIES = ['kiza', 'genki', 'nonbiri', 'futsuu', 'kowai', 'otona'];
const LIKES = ['波の音を 聞きながらの 昼寝', 'あまい たまご焼き', '星を 数えること', '古い 地図', '貝がら あつめ', '朝いちばんの 散歩', 'ちょっと からい おせんべい', 'ラジオの 天気予報', '雨あがりの 虹', '手紙を 書くこと'];
const TINTS = [0xffd6b0, 0xc8d8ff, 0xd4f0c8, 0xfff0a8, 0xe4c8ff, 0xc8c8c8, 0xffc8d8, 0xb8ece8];
const MAX = 10;
const SP_RACCOON = { name: 'あらた', color: '#4f8a46', pitch: 1.05 };
const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];

// newcomers are stored in the save; register them before the villagers are built
export function registerFolk(st) {
  const f = st.ext.folk ||= { list: [], n: 0 };
  for (const d of f.list) if (!VILLAGERS.some((v) => v.id === d.id)) { VILLAGERS.push(d); registerPhoto(d); }
}

export class Folk {
  constructor(life) {
    this.life = life; this.st = life.st; this.f = this.st.ext.folk;
    this.morning(true);
  }
  residents() { return this.life.villagers.filter((v) => v.def.role === 'resident'); }
  // a new villager (seeded by the day, so a reload doesn't reroll them)
  make() {
    const r = seeded('folk' + dayKey() + this.f.n), used = new Set(VILLAGERS.map((v) => v.name));
    const [species, model] = pick(SPECIES, r), name = pick(NAMES.filter((n) => !used.has(n)), r) || `ニコ${this.f.n}`, phrase = pick(PHRASES, r);
    const m = 1 + Math.floor(r() * 12), d = 1 + Math.floor(r() * 28);
    const def = { id: `nv_${++this.f.n}`, name, species, personality: pick(PERSONALITIES, r), catchphrase: phrase, model, tint: pick(TINTS, r),
      birthday: `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, likes: pick(LIKES, r), role: 'resident',
      greeting: `はじめまして! ${species}の ${name}だよ。\nきのう 引っこしてきたんだ。よろしくね、${phrase}!` };
    return def;
  }
  // each morning: a leaver goes, and an empty plot may get a newcomer
  morning(first = false, force = false) {
    const k = dayKey(), f = this.f, lines = [];
    if (f.day === k) return;
    f.day = k;
    const L = this.life, B = L.build;
    // the one who decided to move on leaves
    const lv = f.leaving;
    if (lv && lv.decided === 'go' && lv.day !== k) {
      const v = L.villagers.find((x) => x.def.id === lv.id), def = f.list.find((d) => d.id === lv.id);
      if (def) {
        f.list.splice(f.list.indexOf(def), 1);
        for (const b of B.list) if (b.who === def.id) b.who = null;
        if (v) L.removeVillager(v);
        lines.push(`${def.name}は けさ はやくに 旅立っていったよ。\nなぎに よろしくって 言ってた。`);
      }
      f.leaving = null;
    } else if (lv && lv.week !== this.week()) f.leaving = null;
    // someone moves into an empty plot (about two mornings in three), if there's room in the town
    const empty = B.list.find((b) => B.fac(b).house && !b.who && B.done(b));
    if (empty && this.residents().length < MAX && (force || seeded('movein' + k)() < 0.65)) {
      const def = this.make(); f.list.push(def); VILLAGERS.push(def); registerPhoto(def);
      empty.who = def.id; B.render();
      const v = L.addVillager(def); if (v) L.moveIn(v, empty);
      lines.push(`おはよう! あいていた 土地に、${def.species}の ${def.name}が 引っこしてきたよ!`, 'あいさつ してあげてね。');
    }
    // once a week, a newcomer might think of moving on
    if (!f.leaving && f.list.length >= 2 && f.leaveWeek !== this.week()) {
      f.leaveWeek = this.week();
      if (seeded('leave' + this.week())() < 0.35) {
        const cand = f.list.filter((d) => L.villagers.some((v) => v.def.id === d.id)).sort((a, b) => (this.st.friend[a.id] || 0) - (this.st.friend[b.id] || 0));
        if (cand[0]) f.leaving = { id: cand[0].id, week: this.week(), asked: false, decided: null };
      }
    }
    this.st.save();
    if (lines.length) setTimeout(() => L.ui.say(SP_RACCOON, lines), first ? 5000 : 1500);
  }
  week() { const t = new Date(Date.now() - 5 * 3600e3); t.setDate(t.getDate() - t.getDay()); return `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`; }
  // in a chat, before the choices: the one thinking of leaving says so
  async opening(v) {
    const lv = this.f.leaving; if (!lv || lv.id !== v.def.id || lv.asked) return;
    lv.asked = true; this.st.save();
    const ph = v.def.catchphrase;
    const k = await this.life.ui.say(v.speaker, [`ねえ、なぎ…… ちょっと 相談が あるんだ、${ph}。`, 'じつは、どこか 新しい ところで くらしてみようかなって 思ってて……', 'なぎは どう思う?'], ['ここに いてほしい', 'げんきでね']);
    if (k === 0) {
      lv.decided = 'stay'; this.st.friend[v.def.id] = (this.st.friend[v.def.id] || 0) + 2;
      await this.life.ui.say(v.speaker, [`……そっか。そう 言ってもらえると うれしいな、${ph}。`, 'もうすこし ここで がんばってみるよ!']);
    } else {
      lv.decided = 'go'; lv.day = dayKey();
      await this.life.ui.say(v.speaker, [`うん…… ありがとう、なぎ。`, `あしたの朝、出発するね。いままで ほんとうに たのしかった、${ph}!`]);
    }
    this.st.save();
  }
  newDay() { this.morning(); }
}
