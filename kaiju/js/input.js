// Keyboard, gamepad and touch input. Produces per-frame {x, y, held, pressed} snapshots.
export const ACTIONS = ['L', 'H', 'S', 'G', 'B', 'E', 'X'];
export const ACTION_NAMES = { L: '弱攻撃', H: '強攻撃', S: '必殺技', G: '掴み', B: 'ガード', E: '回避', X: '超必殺技', up: '上(奥へ)', down: '下(手前へ)', left: '左', right: '右' };

export const DEFAULT_KEYS = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', L: 'KeyU', H: 'KeyI', S: 'KeyO', G: 'KeyL', B: 'KeyJ', E: 'KeyK', X: 'KeyP' },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', L: 'Numpad4', H: 'Numpad5', S: 'Numpad6', G: 'Numpad3', B: 'Numpad1', E: 'Numpad2', X: 'Numpad0' },
];
// standard mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 9 start, 12-15 dpad
export const DEFAULT_PAD = { L: 2, H: 3, S: 1, G: 0, B: 5, E: 4, X: 7 };

function emptyState() { return { x: 0, y: 0, held: {}, pressed: {} }; }

export class Input {
  constructor(settings) {
    this.settings = settings;
    this.down = new Set();
    this.edge = new Set();
    this.padPrev = [];
    this.touch = null;
    this.listeners = [];
    window.addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); this.capture({ type: 'key', code: e.code }); this.capture = null; return; }
      if (!this.down.has(e.code)) this.edge.add(e.code);
      this.down.add(e.code);
      for (const l of this.listeners) l(e);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code) && !(e.target && e.target.tagName === 'INPUT')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); });
  }
  onKey(fn) { this.listeners.push(fn); }

  keyState(i) {
    const k = this.settings.keys[i];
    const s = emptyState();
    s.x = (this.down.has(k.right) ? 1 : 0) - (this.down.has(k.left) ? 1 : 0);
    s.y = (this.down.has(k.up) ? 1 : 0) - (this.down.has(k.down) ? 1 : 0);
    for (const a of ACTIONS) { s.held[a] = this.down.has(k[a]); s.pressed[a] = this.edge.has(k[a]); }
    return s;
  }
  pads() {
    const out = [];
    const gp = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of gp) if (p && p.connected) out.push(p);
    return out;
  }
  padState(p, idx) {
    const s = emptyState();
    if (!p) return s;
    const map = this.settings.pad;
    const prev = this.padPrev[idx] || [];
    const b = (i) => p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5);
    let x = p.axes[0] || 0, y = -(p.axes[1] || 0);
    if (Math.abs(x) < 0.3) x = 0; if (Math.abs(y) < 0.3) y = 0;
    if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = 1; if (b(13)) y = -1;
    s.x = x; s.y = y;
    const cur = [];
    for (const a of ACTIONS) {
      const h = !!b(map[a]);
      s.held[a] = h; s.pressed[a] = h && !prev[map[a]];
    }
    if (b(6)) s.held.B = true;
    for (let i = 0; i < p.buttons.length; i++) cur[i] = !!b(i);
    s.start = b(9) && !prev[9];
    s.cancel = b(1) && !prev[1];
    s.confirm = b(0) && !prev[0];
    s.raw = cur;
    return s;
  }
  // Called once per simulation frame (or UI frame): updates edge tracking for pads.
  poll() {
    const pads = this.pads();
    this.padStates = pads.map((p, i) => this.padState(p, i));
    // capture gamepad button for rebinding
    if (this.capture && this.capture.pad) {
      pads.forEach((p, i) => p.buttons.forEach((bt, k) => { if (bt.pressed && !(this.padPrev[i] || [])[k]) { const c = this.capture; this.capture = null; c({ type: 'pad', button: k }); } }));
    }
    this.padPrev = pads.map((p) => p.buttons.map((b) => b.pressed || b.value > 0.5));
    this.keyStates = [this.keyState(0), this.keyState(1)];
    this.edge.clear();
    this.touchState = this.touch ? this.touch.read() : emptyState();
  }
  merge(states) {
    const s = emptyState();
    for (const t of states) {
      if (!t) continue;
      if (Math.abs(t.x) > Math.abs(s.x)) s.x = t.x;
      if (Math.abs(t.y) > Math.abs(s.y)) s.y = t.y;
      for (const a of ACTIONS) { s.held[a] = s.held[a] || t.held[a]; s.pressed[a] = s.pressed[a] || t.pressed[a]; }
      s.start = s.start || t.start; s.cancel = s.cancel || t.cancel; s.confirm = s.confirm || t.confirm;
    }
    return s;
  }
  // which physical sources feed each player
  sourcesFor(player, twoPlayer) {
    const pads = this.padStates || [];
    if (!twoPlayer) return [this.keyStates[0], this.keyStates[1], this.touchState, ...pads];
    if (player === 0) return [this.keyStates[0], this.touchState, pads.length >= 2 ? pads[0] : null];
    return [this.keyStates[1], pads.length >= 2 ? pads[1] : pads[0]];
  }
  player(i, twoPlayer) { return this.merge(this.sourcesFor(i, twoPlayer)); }
}

export class HumanController {
  constructor(input, idx, twoPlayer) { this.input = input; this.idx = idx; this.two = twoPlayer; this.isAI = false; }
  get() { return this.input.player(this.idx, this.two); }
}

// ---------------- Touch overlay ----------------
const TOUCH_BTNS = [
  { a: 'L', label: '弱', sub: 'LIGHT', x: 0.0, y: 1.0 },
  { a: 'H', label: '強', sub: 'HEAVY', x: 1.0, y: 1.25 },
  { a: 'S', label: '必殺', sub: 'SPECIAL', x: 2.0, y: 1.0 },
  { a: 'G', label: '掴', sub: 'GRAB', x: 0.5, y: 0.0 },
  { a: 'E', label: '回避', sub: 'EVADE', x: 1.5, y: 0.1 },
  { a: 'B', label: 'ガード', sub: 'GUARD', x: 2.5, y: -0.05 },
  { a: 'X', label: '超必', sub: 'SUPER', x: 2.7, y: 2.15, super: true },
];

export class TouchControls {
  constructor(root, settings) {
    this.root = root;
    this.settings = settings;
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.btn = {};
    this.prev = {};
    this.pressedLatch = {};
    this.build();
  }
  build() {
    const r = this.root;
    r.innerHTML = '';
    const ts = this.settings.touch;
    r.style.setProperty('--tsize', ts.size);
    r.style.setProperty('--topa', ts.opacity);
    const zone = document.createElement('div'); zone.className = 'stick-zone';
    const base = document.createElement('div'); base.className = 'stick-base';
    const knob = document.createElement('div'); knob.className = 'stick-knob';
    base.appendChild(knob); zone.appendChild(base);
    r.appendChild(zone);
    this.base = base; this.knob = knob; this.zone = zone;
    const cluster = document.createElement('div'); cluster.className = 'btn-cluster';
    cluster.style.right = `calc(${ts.offsetX}px + env(safe-area-inset-right))`;
    cluster.style.bottom = `${ts.offsetY + 14}px`;
    r.appendChild(cluster);
    this.els = {};
    for (const b of TOUCH_BTNS) {
      const el = document.createElement('div');
      el.className = 'tbtn' + (b.super ? ' super' : '') + ' a-' + b.a;
      el.innerHTML = `<b>${b.label}</b><small>${b.sub}</small>`;
      el.style.right = `calc(${(2.7 - b.x)} * var(--bs))`;
      el.style.bottom = `calc(${b.y} * var(--bs))`;
      el.dataset.a = b.a;
      cluster.appendChild(el);
      this.els[b.a] = el;
    }
    const z = this.zone;
    z.style.left = `calc(${ts.stickX}px + env(safe-area-inset-left))`;
    const opts = { passive: false };
    const onDown = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const target = document.elementFromPoint(t.clientX, t.clientY);
        const bt = target && target.closest && target.closest('.tbtn');
        if (bt) { this.btn[t.identifier] = bt.dataset.a; this.pressedLatch[bt.dataset.a] = true; bt.classList.add('on'); if (navigator.vibrate) navigator.vibrate(8); continue; }
        if (this.stick.id === null && t.clientX < window.innerWidth * 0.5) {
          this.stick.id = t.identifier; this.stick.ox = t.clientX; this.stick.oy = t.clientY; this.stick.x = this.stick.y = 0;
          const zr = this.zone.getBoundingClientRect();
          base.style.left = (t.clientX - zr.left) + 'px'; base.style.top = (t.clientY - zr.top) + 'px';
          base.classList.add('on');
        }
      }
    };
    const onMove = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          const R = 55 * this.settings.touch.size;
          let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
          const l = Math.hypot(dx, dy);
          if (l > R) { dx *= R / l; dy *= R / l; }
          this.stick.x = dx / R; this.stick.y = -dy / R;
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (this.btn[t.identifier] !== undefined) {
          // allow sliding between buttons
          const target = document.elementFromPoint(t.clientX, t.clientY);
          const bt = target && target.closest && target.closest('.tbtn');
          const cur = this.btn[t.identifier];
          if (bt && bt.dataset.a !== cur) {
            this.els[cur]?.classList.remove('on');
            this.btn[t.identifier] = bt.dataset.a; this.pressedLatch[bt.dataset.a] = true; bt.classList.add('on');
          }
        }
      }
    };
    const onUp = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) { this.stick.id = null; this.stick.x = this.stick.y = 0; knob.style.transform = ''; base.classList.remove('on'); }
        const a = this.btn[t.identifier];
        if (a !== undefined) { delete this.btn[t.identifier]; if (!Object.values(this.btn).includes(a)) this.els[a]?.classList.remove('on'); }
      }
    };
    r.addEventListener('touchstart', onDown, opts);
    r.addEventListener('touchmove', onMove, opts);
    r.addEventListener('touchend', onUp, opts);
    r.addEventListener('touchcancel', onUp, opts);
    // mouse fallback (for testing on desktop)
    r.addEventListener('mousedown', (e) => {
      const bt = e.target.closest && e.target.closest('.tbtn');
      if (bt) { this.btn.mouse = bt.dataset.a; this.pressedLatch[bt.dataset.a] = true; bt.classList.add('on'); }
    });
    window.addEventListener('mouseup', () => { const a = this.btn.mouse; if (a) { this.els[a]?.classList.remove('on'); delete this.btn.mouse; } });
  }
  setMeterReady(ready) { if (this.els.X) this.els.X.classList.toggle('ready', ready); }
  read() {
    const s = emptyState();
    let x = this.stick.x, y = this.stick.y;
    if (Math.hypot(x, y) < 0.28) { x = 0; y = 0; }
    // snap to 8 directions for reliable commands
    if (x || y) {
      const a = Math.atan2(y, x), sn = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
      x = Math.abs(Math.cos(sn)) < 0.01 ? 0 : Math.sign(Math.cos(sn));
      y = Math.abs(Math.sin(sn)) < 0.01 ? 0 : Math.sign(Math.sin(sn));
    }
    s.x = x; s.y = y;
    const held = new Set(Object.values(this.btn));
    for (const a of ACTIONS) { s.held[a] = held.has(a); s.pressed[a] = !!this.pressedLatch[a]; }
    this.pressedLatch = {};
    return s;
  }
  reset() { this.btn = {}; this.pressedLatch = {}; this.stick.id = null; this.stick.x = this.stick.y = 0; }
}
