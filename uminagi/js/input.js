// Touch: virtual stick on the left half, drag on the right half to look around, pinch to zoom, dash button.
// Desktop: WASD / arrows to walk, Shift to dash, drag the mouse to look, wheel to zoom, Q/C to turn.
export class Input {
  constructor(stickEl, knobEl, dashEl) {
    this.keys = new Set(); this.move = { x: 0, y: 0 }; this.look = { x: 0, y: 0 }; this.zoom = 0;
    this.stick = null; this.cams = new Map(); this.dashHeld = false; this.enabled = false;
    this.jump = false;   // no jumping in this town (kept so callers can read it)
    this.stickEl = stickEl; this.knobEl = knobEl;
    addEventListener('keydown', (e) => { this.keys.add(e.code); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.stick = null; this.cams.clear(); this.stickEl.classList.remove('on'); });
    const opt = { passive: false };
    addEventListener('pointerdown', (e) => this.down(e), opt);
    addEventListener('pointermove', (e) => this.moveP(e), opt);
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', (e) => this.up(e));
    addEventListener('wheel', (e) => { if (this.enabled) this.zoom += Math.sign(e.deltaY) * 0.12; }, { passive: true });
    if (dashEl) {
      const on = (e) => { e.preventDefault(); this.dashHeld = !this.dashHeld; dashEl.classList.toggle('on', this.dashHeld); };
      dashEl.addEventListener('pointerdown', on);
    }
  }
  down(e) {
    if (!this.enabled || e.target.closest?.('button, .panel, #map')) return;
    const touch = e.pointerType !== 'mouse';
    // PC: clicking the scene captures the mouse (free look like a PC game); Esc releases it
    if (!touch && !document.pointerLockElement && e.target.id === 'gl') document.getElementById('gl').requestPointerLock?.()?.catch?.(() => {});
    if (!touch && document.pointerLockElement) return;
    if (touch && e.clientX < innerWidth * 0.45 && !this.stick) {
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      this.stickEl.style.left = e.clientX + 'px'; this.stickEl.style.top = e.clientY + 'px'; this.stickEl.classList.add('on');
    } else {
      this.cams.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.cams.size === 2) this.pinch = this.pinchDist();
    }
  }
  pinchDist() { const [a, b] = [...this.cams.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }
  moveP(e) {
    if (e.pointerType === 'mouse' && document.pointerLockElement && this.enabled) {
      this.look.x += e.movementX * 0.0028; this.look.y += e.movementY * 0.0028; return;
    }
    if (this.stick && e.pointerId === this.stick.id) { this.stick.x = e.clientX; this.stick.y = e.clientY; e.preventDefault(); return; }
    const c = this.cams.get(e.pointerId);
    if (!c) return;
    e.preventDefault();
    if (this.cams.size === 2) {
      c.x = e.clientX; c.y = e.clientY;
      const d = this.pinchDist(); this.zoom -= (d - this.pinch) * 0.012; this.pinch = d;
      return;
    }
    const k = e.pointerType === 'mouse' ? 0.0045 : 0.0065;
    this.look.x += (e.clientX - c.x) * k; this.look.y += (e.clientY - c.y) * k;
    c.x = e.clientX; c.y = e.clientY;
  }
  up(e) {
    if (this.stick && e.pointerId === this.stick.id) { this.stick = null; this.stickEl.classList.remove('on'); this.knobEl.style.transform = ''; }
    this.cams.delete(e.pointerId);
  }
  update() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyQ') || k.has('KeyZ')) this.look.x -= 0.03;
    if (k.has('KeyC')) this.look.x += 0.03;   // E is the action button (js/life)
    if (k.has('KeyR')) this.look.y -= 0.02;
    if (k.has('KeyF')) this.look.y += 0.02;
    if (k.has('Equal') || k.has('NumpadAdd')) this.zoom -= 0.05;
    if (k.has('Minus') || k.has('NumpadSubtract')) this.zoom += 0.05;
    if (this.stick) {
      const R = 52;
      let dx = (this.stick.x - this.stick.x0) / R, dy = (this.stick.y - this.stick.y0) / R;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      this.knobEl.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
      x = dx; y = -dy;
      this.stickMag = Math.min(1, l);
    } else this.stickMag = 0;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = x; this.move.y = y;
    this.run = this.dashHeld || k.has('ShiftLeft') || k.has('ShiftRight') || (this.stick && this.stickMag > 0.98 && false);
  }
  takeLook() { const l = { ...this.look }; this.look.x = this.look.y = 0; return l; }
  takeZoom() { const z = this.zoom; this.zoom = 0; return z; }
}
