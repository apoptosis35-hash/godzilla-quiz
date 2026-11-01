// The save section of the settings: write the save out as an あいことば (copy it, or keep it as a file), read one
// back in, and make a link that shows a friend your town (they walk round it; nothing is saved on their side).
// While visiting, a banner says whose town it is and leads home. Gentle reminders: add the game to the home
// screen on an iPhone (Safari may clear a site's storage after a week away), and back up now and then.
import { backupCode, townCode, restore, visiting } from './store.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const day = () => new Date().toISOString().slice(0, 10);
const mark = (k) => { try { localStorage.setItem(k, String(Date.now())); } catch { /* ignore */ } };
const since = (k) => { try { return (Date.now() - Number(localStorage.getItem(k) || 0)) / 864e5; } catch { return 0; } };
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let panel = null;
function open(title, body) {
  if (!panel) { panel = el('div', 'panel savepanel'); panel.hidden = true; document.body.appendChild(panel); }
  panel.innerHTML = ''; panel.appendChild(el('h3', '', title)); panel.appendChild(body);
  const close = el('button', 'btn', '閉じる'); close.onclick = () => { panel.hidden = true; }; const row = el('div', 'row'); row.appendChild(close); panel.appendChild(row);
  panel.hidden = false; $('settings').hidden = true;
}
function codeBox(text, rows = 4) { const t = el('textarea', 'codebox'); t.readOnly = true; t.rows = rows; t.value = text; t.onclick = () => t.select(); return t; }
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); btn.textContent = 'コピーしました'; } catch { btn.textContent = '下の文字を 長押しして コピーしてね'; }
}
function saveFile(name, text) { const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

async function exportSave() {
  const body = el('div'), code = await backupCode();
  body.appendChild(el('p', 'pnote', 'この あいことばが あれば、ほかの スマホや パソコンでも つづきから 遊べます。<br>メモ帳や LINE の 自分あてトークなどに 保存しておいてね。'));
  body.appendChild(codeBox(code));
  const row = el('div', 'row'), c = el('button', 'btn', 'コピー'), f = el('button', 'btn', 'ファイルに保存');
  c.onclick = () => copy(code, c); f.onclick = () => saveFile(`uminagi-save-${day()}.txt`, code);
  row.append(c, f); body.appendChild(row);
  mark('uminagi_backup_at');
  open('セーブを 書き出す', body);
}
function importSave() {
  const body = el('div'), t = el('textarea', 'codebox'); t.rows = 4; t.placeholder = 'ここに あいことばを はりつけてね';
  body.appendChild(el('p', 'pnote', '書き出した あいことばを はりつけるか、保存した ファイルを えらんでね。<br>いまの セーブは 上書きされます。'));
  body.appendChild(t);
  const file = el('input'); file.type = 'file'; file.accept = '.txt,text/plain'; file.hidden = true; body.appendChild(file);
  file.onchange = async () => { const f = file.files[0]; if (f) t.value = await f.text(); };
  const row = el('div', 'row'), pick = el('button', 'btn', 'ファイルを えらぶ'), go = el('button', 'btn', '読み込む'), msg = el('p', 'pnote');
  pick.onclick = () => file.click();
  go.onclick = async () => {
    if (!t.value.trim()) { msg.textContent = 'あいことばが からっぽだよ'; return; }
    if (!confirm('いまの セーブを 上書きして、あいことばの セーブで 遊びますか?')) return;
    try { await restore(t.value); location.replace(location.pathname); } catch (e) { msg.textContent = '読み込めませんでした: ' + e.message; }
  };
  row.append(pick, go); body.append(row, msg);
  open('セーブを 読み込む', body);
}
function shareTown() {
  const body = el('div'), name = el('input'); name.type = 'text'; name.maxLength = 16; name.placeholder = 'なまえ(なくても OK)'; name.className = 'codename';
  body.appendChild(el('p', 'pnote', '友だちや 家族に 送ると、あなたの 町を 歩いて 見学できます。<br>(見学する人の セーブは かわりません。ポケットの 中身は 送られません)'));
  body.appendChild(name);
  const out = el('div'), make = el('button', 'btn', 'リンクを つくる');
  make.onclick = async () => {
    const url = `${location.origin}${location.pathname}?visit=${await townCode(name.value)}`;
    out.innerHTML = ''; out.appendChild(codeBox(url, 3));
    const row = el('div', 'row'), c = el('button', 'btn', 'コピー'); c.onclick = () => copy(url, c); row.appendChild(c);
    if (navigator.share) { const s = el('button', 'btn', '送る'); s.onclick = () => navigator.share({ title: '海凪の港町', text: `${name.value ? name.value + 'の' : ''}町を 見に来てね!`, url }).catch(() => {}); row.appendChild(s); }
    out.appendChild(row);
  };
  const row = el('div', 'row'); row.appendChild(make); body.append(row, out);
  open('町を 見せる', body);
}

export function setupBackup(app) {
  const settings = $('settings'), last = $('reset').parentElement, box = el('div', 'savebox');
  if (visiting()) {
    const v = globalThis.__uminagiVisit, home = () => location.replace(location.pathname);
    const banner = el('div', 'vbanner', `<span>🏘️ ${v.name ? v.name + 'の' : 'ともだちの'}町を 見学中</span>`), back = el('button', 'btn', '自分の町に もどる');
    back.onclick = home; banner.appendChild(back); document.body.appendChild(banner);
    box.appendChild(el('p', 'pnote', '見学中は セーブされません。'));
    const b = el('button', 'btn', '自分の町に もどる'); b.onclick = home; box.appendChild(b);
    $('reset').hidden = true;
  } else {
    box.appendChild(el('p', '', 'セーブ <small>(ほかの 端末へ うつす・バックアップ・町を 見せる)</small>'));
    const row = el('div', 'row');
    for (const [label, fn] of [['セーブを 書き出す', exportSave], ['セーブを 読み込む', importSave], ['町を 友だちに 見せる', shareTown]]) { const b = el('button', 'btn', label); b.onclick = fn; row.appendChild(b); }
    box.appendChild(row);
  }
  settings.insertBefore(box, last);
  app.remindBackup = () => remind(app);
}
// once a game is under way: a word about the home screen (iPhone, in the browser) and about backing up
function remind(app) {
  if (visiting()) return;
  const L = app.life; if (!L?.st.intro) return;
  if (ios() && !standalone() && since('uminagi_hint_home') > 7) {
    mark('uminagi_hint_home');
    setTimeout(() => L.ui.say(null, ['📱 iPhone の ブラウザで 遊んでいると、しばらく 開かないうちに セーブが 消えてしまうことが あります。', '共有ボタン(□↑)から 「ホーム画面に追加」 すると 消えにくくなるよ。\n設定の 「セーブを 書き出す」 で バックアップも できます。']), 6000);
  } else if (since('uminagi_backup_at') > 7 && since('uminagi_hint_backup') > 3 && Object.keys(L.st.caught).length >= 5) {
    mark('uminagi_hint_backup');
    setTimeout(() => L.ui.toast('⚙️ 設定の 「セーブを 書き出す」 で バックアップしておくと 安心だよ', 4500), 8000);
  }
}
