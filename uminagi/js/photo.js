// Photo mode: the 📷 chip hides the HUD, freezes ぽっけ's feet (the camera still turns and zooms), offers a few
// poses, and the shutter keeps the picture with a small stamp (the town's name and the date) to save or send.
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const POSES = [['ふつう', null], ['ばんざい', 'show'], ['てを ふる', 'wave'], ['ピース', 'peace']];

export class Photo {
  constructor(app) {
    this.app = app; this.on = false; this.pose = 0;
    const chip = el('button', 'chip btn', '📷'); chip.id = 'photobtn'; chip.setAttribute('aria-label', '写真'); $('mute').after(chip);
    chip.onclick = () => this.open();
    const ov = this.ov = el('div', 'photoov'); ov.hidden = true;
    ov.innerHTML = '<p class="phint">ドラッグで まわす・2本指(ホイール)で ズーム</p>';
    const row = el('div', 'prow'), pose = this.poseBtn = el('button', 'btn', 'ポーズ: ふつう'), shoot = el('button', 'btn pshoot', '📸'), back = el('button', 'btn', 'もどる');
    pose.onclick = () => this.nextPose(); shoot.onclick = () => this.shoot(); back.onclick = () => this.close();
    row.append(pose, shoot, back); ov.appendChild(row); document.body.appendChild(ov);
    this.flash = el('div', 'pflash'); document.body.appendChild(this.flash);
  }
  open() {
    const L = this.app.life; if (!this.app.playing || L?.ui.busy() || this.on) return;
    this.on = true; this.app.photo = true; document.body.classList.add('photo'); this.ov.hidden = false; this.pose = 0; this.setPose();
  }
  close() {
    this.on = false; this.app.photo = false; document.body.classList.remove('photo'); this.ov.hidden = true;
    const L = this.app.life; if (L && POSES.some(([, k]) => k && L.anim?.kind === k)) L.anim = null;
    this.preview?.remove(); this.preview = null;
  }
  nextPose() { this.pose = (this.pose + 1) % POSES.length; this.setPose(); }
  setPose() {
    const [name, kind] = POSES[this.pose], L = this.app.life; this.poseBtn.textContent = `ポーズ: ${name}`;
    if (L) L.anim = kind ? { kind, t: 0, dur: 1e9 } : null;
  }
  // the frame as drawn, plus a stamp in the corner
  shoot() {
    const app = this.app; app.frame(0, true);
    const src = app.renderer.domElement, url = src.toDataURL('image/png'), img = new Image();
    this.flash.classList.remove('go'); void this.flash.offsetWidth; this.flash.classList.add('go');
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
      const d = new Date(), s = Math.max(1, cv.height / 540), text = `海凪の港町 ・ ${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
      g.font = `bold ${Math.round(15 * s)}px "Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", sans-serif`;
      const w = g.measureText(text).width + 24 * s, h = 28 * s, x = cv.width - w - 12 * s, y = cv.height - h - 12 * s;
      g.fillStyle = 'rgba(255,250,235,0.88)'; g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fill();
      g.fillStyle = '#4a3a22'; g.textBaseline = 'middle'; g.fillText(text, x + 12 * s, y + h / 2 + s);
      cv.toBlob((blob) => this.show(blob), 'image/jpeg', 0.92);
    };
    img.src = url;
  }
  show(blob) {
    this.preview?.remove();
    const url = URL.createObjectURL(blob), name = `uminagi-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`;
    const p = this.preview = el('div', 'panel ppreview'), img = el('img'); img.src = url; p.appendChild(img);
    const row = el('div', 'row'), save = el('button', 'btn', '保存'), again = el('button', 'btn', 'もう1まい');
    save.onclick = () => { const a = el('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
    again.onclick = () => { p.remove(); this.preview = null; };
    row.append(save);
    const file = new File([blob], name, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) { const send = el('button', 'btn', '送る'); send.onclick = () => navigator.share({ files: [file], title: '海凪の港町' }).catch(() => {}); row.append(send); }
    row.append(again); p.appendChild(row); document.body.appendChild(p);
    this.app.life?.emit?.('photo');
  }
}
