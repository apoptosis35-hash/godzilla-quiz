// Keyboard + touch: virtual stick on the left half, camera swipe on the right half, action button.
export class Input {
  constructor(stickEl, knobEl) {
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.camDelta = 0;
    this.actionPressed = false;
    this.stick = null; this.cam = null;
    this.stickEl = stickEl; this.knobEl = knobEl;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (['Space', 'Enter', 'KeyE', 'KeyZ'].includes(e.code)) { this.actionPressed = true; e.preventDefault(); }
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    const opt = { passive: false };
    addEventListener('pointerdown', (e) => this.down(e), opt);
    addEventListener('pointermove', (e) => this.moveP(e), opt);
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', (e) => this.up(e));
    this.enabled = false;
  }
  down(e) {
    if (!this.enabled || e.target.closest?.('button, .modal')) return;
    if (e.clientX < innerWidth * 0.5 && !this.stick) {
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      this.stickEl.style.left = e.clientX + 'px'; this.stickEl.style.top = e.clientY + 'px'; this.stickEl.classList.add('on');
    } else if (!this.cam) this.cam = { id: e.pointerId, x: e.clientX };
  }
  moveP(e) {
    if (this.stick && e.pointerId === this.stick.id) { this.stick.x = e.clientX; this.stick.y = e.clientY; e.preventDefault(); }
    if (this.cam && e.pointerId === this.cam.id) { this.camDelta += (e.clientX - this.cam.x) * 0.008; this.cam.x = e.clientX; }
  }
  up(e) {
    if (this.stick && e.pointerId === this.stick.id) { this.stick = null; this.stickEl.classList.remove('on'); }
    if (this.cam && e.pointerId === this.cam.id) this.cam = null;
  }
  update() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyQ')) this.camDelta -= 0.035;
    if (k.has('KeyC')) this.camDelta += 0.035;
    if (this.stick) {
      const R = 50;
      let dx = (this.stick.x - this.stick.x0) / R, dy = (this.stick.y - this.stick.y0) / R;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      this.knobEl.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
      x = dx; y = -dy;
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = x; this.move.y = y;
    this.run = k.has('ShiftLeft') || k.has('ShiftRight');
  }
  takeAction() { const a = this.actionPressed; this.actionPressed = false; return a; }
  takeCam() { const d = this.camDelta; this.camDelta = 0; return d; }
}
