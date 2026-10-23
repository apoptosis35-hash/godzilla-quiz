// Life UI (DOM): talk window with name plate, typewriter text and animal-speak babble, choice buttons,
// the pocket (20 slots), the encyclopedia, the clock + money HUD, the context action button and toasts.
import { ITEMS, POCKET, icon, TOOL_ICON } from './state.js';
import { FISH, BUGS, FOSSILS } from './data.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const WEEK = '日月火水木金土';

export class LifeUI {
  constructor(sound) {
    this.sound = sound; this.open = 0;
    const root = this.root = el('div', 'life'); root.id = 'life';
    root.innerHTML = `
      <div class="lclock" id="lclock"><b id="ltime">--:--</b><small id="ldate"></small></div>
      <div class="lmoney" id="lmoney">0 <small>ナギ</small></div>
      <div class="lside">
        <button class="btn round lbtn" id="ltool" aria-label="道具">✋</button>
        <button class="btn round lbtn" id="lpocket" aria-label="ポケット">🎒</button>
        <button class="btn round lbtn" id="lbook" aria-label="図鑑">📖</button>
      </div>
      <button class="btn" id="act" aria-label="アクション"><b>A</b><small id="actlbl"></small></button>
      <div class="ltoast" id="ltoast"></div>
      <div class="talk" id="talk" hidden>
        <div class="plate" id="tplate"></div>
        <div class="tbox" id="tbox"><span id="ttext"></span><i class="tnext" id="tnext">▼</i></div>
        <div class="choices" id="tchoices"></div>
      </div>
      <div class="lpanel panel" id="lpanel" hidden><h3 id="lptitle"></h3><div id="lpbody"></div><div class="row"><button class="btn" id="lpclose">閉じる</button></div></div>`;
    $('hud').appendChild(root);
    $('talk').addEventListener('pointerdown', (e) => { e.stopPropagation(); if (!e.target.closest('.choices')) this.advance(); });
    $('lpclose').onclick = () => this.closePanel(-1);
    this.typing = null;
  }
  // ---------------------------------------------------------------- HUD
  hud(st, tool) {
    const d = new Date();
    $('ltime').textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    $('ldate').textContent = `${d.getMonth() + 1}月${d.getDate()}日(${WEEK[d.getDay()]})`;
    $('lmoney').innerHTML = `${st.money.toLocaleString()} <small>ナギ</small>`;
    $('ltool').textContent = tool ? TOOL_ICON[tool] : '✋';
  }
  action(label) {
    if (label === this.lastLbl) return;
    this.lastLbl = label; $('actlbl').textContent = label || ''; $('act').classList.toggle('dim', !label);
  }
  toast(text, ms = 2200) {
    const t = $('ltoast'); t.textContent = text; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  // ---------------------------------------------------------------- talk
  // say(speaker, lines, choices?) -> Promise<choice index | undefined>. speaker: { name, color, pitch } or null (narration)
  async say(speaker, lines, choices) {
    // one talk window at a time: a second say() (a catch landing while a chat opens) waits for the first one
    while (this.queue) await new Promise((r) => (this.waiters ||= []).push(r));
    this.open++;
    lines = [].concat(lines).flatMap((l) => String(l).split('\f'));
    const plate = $('tplate');
    plate.hidden = !speaker; if (speaker) { plate.textContent = speaker.name; plate.style.background = speaker.color || '#e8b23a'; }
    $('talk').hidden = false; $('tchoices').innerHTML = '';
    return new Promise((res) => {
      this.queue = { speaker, lines, i: 0, choices, res };
      this.typeLine();
    });
  }
  typeLine() {
    const q = this.queue, line = q.lines[q.i], tx = $('ttext');
    tx.textContent = ''; $('tnext').hidden = true; $('tchoices').innerHTML = '';
    let n = 0;
    clearInterval(this.typing);
    this.typing = setInterval(() => {
      n++; tx.textContent = line.slice(0, n);
      if (q.speaker && n % 2 === 1 && !/[\s、。!?…!?]/.test(line[n - 1] || ' ')) this.babble(q.speaker.pitch || 1, line.charCodeAt(n - 1));
      if (n >= line.length) this.endLine();
    }, 32);
  }
  endLine() {
    clearInterval(this.typing); this.typing = null;
    const q = this.queue; $('ttext').textContent = q.lines[q.i];
    const last = q.i === q.lines.length - 1;
    if (last && q.choices) {
      const box = $('tchoices'); box.innerHTML = '';
      q.choices.forEach((c, k) => { const b = el('button', 'btn', c); b.onpointerdown = (e) => { e.stopPropagation(); this.finish(k); }; box.appendChild(b); });
      this.choiceSel = 0; this.markChoice();
    } else $('tnext').hidden = false;
  }
  markChoice() { [...$('tchoices').children].forEach((b, k) => b.classList.toggle('on', k === this.choiceSel)); }
  advance() {
    const q = this.queue; if (!q) return;
    if (this.typing) { this.endLine(); return; }
    if (q.i < q.lines.length - 1) { q.i++; this.typeLine(); return; }
    if (q.choices) return;
    this.finish(undefined);
  }
  finish(k) {
    const q = this.queue; this.queue = null; $('talk').hidden = true; this.open--;
    this.blip(660, 0.05); q.res(k);
    const w = this.waiters; this.waiters = null; if (w) for (const r of w) r();
  }
  // keyboard: Enter/E = next or confirm, arrows = move between choices, Esc = last choice (usually "bye")
  key(code) {
    const q = this.queue;
    if (!q) return false;
    if (!this.typing && q.choices && q.i === q.lines.length - 1) {
      if (code === 'ArrowDown' || code === 'ArrowRight' || code === 'KeyS') { this.choiceSel = (this.choiceSel + 1) % q.choices.length; this.markChoice(); return true; }
      if (code === 'ArrowUp' || code === 'ArrowLeft' || code === 'KeyW') { this.choiceSel = (this.choiceSel + q.choices.length - 1) % q.choices.length; this.markChoice(); return true; }
      if (code === 'Escape') { this.finish(q.choices.length - 1); return true; }
      if (code === 'Enter' || code === 'KeyE' || code === 'Space') { this.finish(this.choiceSel); return true; }
      return true;
    }
    if (code === 'Enter' || code === 'KeyE' || code === 'Space' || code === 'Escape') this.advance();
    return true;
  }
  // どうぶつ語: a short pitched blip per syllable, the pitch wobbling with the character
  babble(pitch, code) {
    const c = this.sound.ctx; if (!c || !this.sound.on) return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = (380 + (code % 7) * 34) * pitch;
    o.frequency.exponentialRampToValueAtTime(o.frequency.value * (code % 2 ? 1.25 : 0.82), t + 0.06);
    f.type = 'bandpass'; f.frequency.value = 1400 * pitch; f.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(f).connect(g).connect(this.sound.master); o.start(t); o.stop(t + 0.08);
  }
  blip(freq, dur = 0.08, type = 'sine', vol = 0.2) {
    const c = this.sound.ctx; if (!c || !this.sound.on) return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sound.master); o.start(t); o.stop(t + dur + 0.02);
  }
  jingle(notes = [784, 988, 1175, 1568]) { notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.18), i * 90)); }
  // ---------------------------------------------------------------- panels
  panel(title, body) {
    if (this.panelRes) this.closePanel(-1);
    this.open++;
    $('lptitle').textContent = title; const b = $('lpbody'); b.innerHTML = ''; b.appendChild(body); $('lpanel').hidden = false;
    return new Promise((res) => { this.panelRes = res; });
  }
  closePanel(v) { if (!this.panelRes) return; $('lpanel').hidden = true; this.open--; const r = this.panelRes; this.panelRes = null; r(v); }
  // the pocket. pick(filter) lets the player choose a slot (gift / sell / donate); without it, tapping a tool holds it
  pocket(st, { title = 'ポケット', filter = null, note = '' } = {}) {
    const wrap = el('div', 'pocket');
    if (note) wrap.appendChild(el('p', 'pnote', note));
    const grid = el('div', 'pgrid'); wrap.appendChild(grid);
    for (let i = 0; i < POCKET; i++) {
      const id = st.pocket[i], it = ITEMS[id], ok = id && (!filter || filter(id));
      const c = el('button', 'slot' + (id ? '' : ' empty') + (ok ? '' : ' off') + (id && id === st.tool ? ' held' : ''), id ? `<span>${icon(id)}</span><small>${it.name}</small>` : '');
      if (ok) c.onclick = () => this.closePanel(i);
      grid.appendChild(c);
    }
    wrap.appendChild(el('p', 'pnote', `${st.pocket.length} / ${POCKET}　所持金 ${st.money.toLocaleString()} ナギ`));
    return this.panel(title, wrap);
  }
  list(title, rows) {   // rows: [{ label, sub, ok }] -> index
    const wrap = el('div', 'plist');
    rows.forEach((r, i) => { const b = el('button', 'btn' + (r.ok === false ? ' off' : ''), `${r.label}<small>${r.sub || ''}</small>`); if (r.ok !== false) b.onclick = () => this.closePanel(i); wrap.appendChild(b); });
    return this.panel(title, wrap);
  }
  book(st) {
    const wrap = el('div', 'book');
    const tabs = el('div', 'row'); wrap.appendChild(tabs);
    const grid = el('div', 'bgrid'); wrap.appendChild(grid);
    const info = el('p', 'pnote', ''); wrap.appendChild(info);
    const sets = [['さかな', FISH], ['むし', BUGS], ['化石', FOSSILS]];
    const show = (k) => {
      [...tabs.children].forEach((b, j) => b.classList.toggle('on', j === k));
      grid.innerHTML = ''; const [, list] = sets[k];
      let got = 0, don = 0;
      for (const it of list) {
        const c = !!st.caught[it.id], d = !!st.donated[it.id]; got += c; don += d;
        const cell = el('button', 'bcell' + (c ? '' : ' unknown') + (d ? ' don' : ''), c ? `<span>${icon(it.id)}</span><small>${it.name}</small>` : '<span>？</span><small>？？？</small>');
        cell.onclick = () => {
          if (!c) { info.textContent = 'まだ見つけていない。'; return; }
          const when = it.months ? `　${it.months.length === 12 ? '一年中' : it.months[0] + '〜' + it.months[it.months.length - 1] + '月'}` : '';
          info.textContent = `${it.name}　${it.price} ナギ${when}${d ? '　(資料館に展示中)' : ''}`;
        };
        grid.appendChild(cell);
      }
      info.textContent = `見つけた ${got} / ${list.length}　寄贈 ${don}`;
    };
    sets.forEach(([n], k) => { const b = el('button', 'btn', n); b.onclick = () => show(k); tabs.appendChild(b); });
    show(0);
    return this.panel('なぎの図鑑', wrap);
  }
  busy() { return this.open > 0; }
}
