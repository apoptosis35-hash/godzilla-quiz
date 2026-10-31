// Lightweight effects in world coordinates: particles, light rings, score popups,
// merge "ghosts" (the two halves sucked together) and screen shake.

const TAU = Math.PI * 2;
const PALETTE = ['#ffd84a', '#ff8fb1', '#8fe0ff', '#b9f27a', '#ffffff', '#ffb35c', '#c9a6ff'];

export class FX {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.pops = [];
    this.ghosts = [];
    this.flash = 0;
    this.shake = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.maxParts = 260;
    this.intensity = 1;   // 1 normal, 0.6 reduced
    this.shakeOn = true;
  }

  clear() { this.parts.length = 0; this.rings.length = 0; this.pops.length = 0; this.ghosts.length = 0; this.flash = 0; this.shake = 0; }

  burst(x, y, r, color, combo = 1, tier = 0) {
    const n = Math.round((8 + tier * 1.6 + Math.min(combo, 8) * 3) * this.intensity);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.maxParts) this.parts.shift();
      const a = Math.random() * TAU;
      const sp = (1.4 + Math.random() * 2.6) * (0.75 + Math.min(r, 80) / 70);
      const roll = Math.random();
      const shape = roll < 0.42 ? 'star' : roll < 0.62 ? 'heart' : roll < 0.86 ? 'spark' : 'dot';
      const col = Math.random() < 0.5 ? color : PALETTE[(Math.random() * PALETTE.length) | 0];
      this.parts.push({
        x: x + Math.cos(a) * r * 0.6, y: y + Math.sin(a) * r * 0.6,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2,
        life: 0, max: 520 + Math.random() * 420,
        size: (3 + Math.random() * 4) * (0.8 + Math.min(r, 90) / 90),
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.3,
        shape, color: col, grav: 0.05,
      });
    }
    this.rings.push({ x, y, r0: r * 0.6, r1: r * 1.9 + 10, life: 0, max: 360, color: '#ffffff', w: 6 + tier * 0.5 });
    this.rings.push({ x, y, r0: r * 0.3, r1: r * 1.4 + 8, life: 0, max: 280, color, w: 4 });
  }

  confetti(x, y, w, count = 80) {
    for (let i = 0; i < count * this.intensity; i++) {
      if (this.parts.length >= this.maxParts) this.parts.shift();
      this.parts.push({
        x: x + (Math.random() - 0.5) * w, y: y - Math.random() * 40,
        vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 4,
        life: 0, max: 1400 + Math.random() * 900, size: 4 + Math.random() * 4,
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.4,
        shape: Math.random() < 0.6 ? 'rect' : 'star', color: PALETTE[(Math.random() * PALETTE.length) | 0], grav: 0.09,
      });
    }
  }

  // power-drop impact: a flat shockwave and dust puffs; scaled by power, no flash
  shockwave(x, y, power, r) {
    const k = this.intensity;
    this.rings.push({ x, y, r0: r * 0.5, r1: r + 30 + power * 60, life: 0, max: 300 + power * 120, color: '#ffffff', w: 5 + power * 4 });
    if (power > 0.7) this.rings.push({ x, y, r0: r * 0.3, r1: r + 18 + power * 40, life: 0, max: 260, color: '#ffb36b', w: 4 });
    const n = Math.round((6 + power * 14) * k);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.maxParts) this.parts.shift();
      const dir = i % 2 ? 1 : -1, sp = 1.5 + Math.random() * (2 + power * 3.5);
      this.parts.push({
        x: x + dir * r * 0.5, y, vx: dir * sp, vy: -Math.random() * (1 + power * 2),
        life: 0, max: 380 + Math.random() * 260, size: 3 + Math.random() * 4 + power * 2,
        rot: 0, vr: 0, shape: Math.random() < 0.75 ? 'dot' : 'spark', color: Math.random() < 0.5 ? '#fff4e0' : '#ffd9a8', grav: 0.04,
      });
    }
  }

  popup(x, y, text, size = 18, color = '#ff6f86') {
    this.pops.push({ x, y, text, size, color, life: 0, max: 900 });
    if (this.pops.length > 14) this.pops.shift();
  }

  ghost(parts, tier, r) {
    // the two merging halves slide to the centre and shrink
    const cx = (parts[0].x + parts[1].x) / 2, cy = (parts[0].y + parts[1].y) / 2;
    for (const p of parts) this.ghosts.push({ x: p.x, y: p.y, a: p.a, tx: cx, ty: cy, tier, r, life: 0, max: 90 });
  }

  kick(amount) { if (this.shakeOn) this.shake = Math.max(this.shake, amount * this.intensity); }

  update(dt) {
    const k = dt / 16.667;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      if (p.life >= p.max) { this.parts.splice(i, 1); continue; }
      p.vx *= Math.pow(0.97, k); p.vy = p.vy * Math.pow(0.97, k) + p.grav * k;
      p.x += p.vx * k; p.y += p.vy * k; p.rot += p.vr * k;
    }
    for (const list of [this.rings, this.pops, this.ghosts]) {
      for (let i = list.length - 1; i >= 0; i--) { list[i].life += dt; if (list[i].life >= list[i].max) list.splice(i, 1); }
    }
    for (const p of this.pops) p.y -= 0.55 * k;
    this.flash = Math.max(0, this.flash - dt / 260);
    if (this.shake > 0.05) {
      this.shake *= Math.pow(0.86, k);
      this.shakeX = (Math.random() - 0.5) * this.shake * 2;
      this.shakeY = (Math.random() - 0.5) * this.shake * 2;
    } else { this.shake = 0; this.shakeX = this.shakeY = 0; }
  }

  // drawn in world space (ctx already transformed)
  drawBack(ctx, sprites, px) {
    for (const g of this.ghosts) {
      const t = g.life / g.max, e = t * t;
      const x = g.x + (g.tx - g.x) * e, y = g.y + (g.ty - g.y) * e;
      const s = 1 - 0.35 * t;
      const img = sprites.get(g.tier, 'happy');
      const w = img.width / px * s;
      ctx.save(); ctx.globalAlpha = 1 - t * 0.6; ctx.translate(x, y); ctx.rotate(g.a);
      ctx.drawImage(img, -w / 2, -w / 2, w, w); ctx.restore();
    }
  }

  drawFront(ctx) {
    for (const r of this.rings) {
      const t = r.life / r.max, e = 1 - (1 - t) * (1 - t);
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = r.color; ctx.lineWidth = r.w * (1 - t) + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, TAU); ctx.stroke();
    }
    for (const p of this.parts) {
      const t = p.life / p.max;
      ctx.globalAlpha = t < 0.7 ? 1 : (1 - t) / 0.3;
      ctx.fillStyle = p.color;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      const s = p.size * (t < 0.15 ? 0.5 + t / 0.3 : 1);
      drawShape(ctx, p.shape, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of this.pops) {
      const t = p.life / p.max;
      const sc = t < 0.15 ? 0.6 + (t / 0.15) * 0.6 : t < 0.25 ? 1.2 - (t - 0.15) * 2 : 1;
      ctx.globalAlpha = t < 0.7 ? 1 : (1 - t) / 0.3;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc, sc);
      ctx.font = `900 ${p.size}px "Hiragino Maru Gothic ProN","M PLUS Rounded 1c","Arial Rounded MT Bold",sans-serif`;
      ctx.lineWidth = p.size * 0.28; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

function drawShape(ctx, shape, s) {
  ctx.beginPath();
  if (shape === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? s * 0.45 : s;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  } else if (shape === 'heart') {
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.45);
    ctx.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
    ctx.fill();
  } else if (shape === 'spark') {
    ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.12, -s * 0.12, s, 0); ctx.quadraticCurveTo(s * 0.12, s * 0.12, 0, s);
    ctx.quadraticCurveTo(-s * 0.12, s * 0.12, -s, 0); ctx.quadraticCurveTo(-s * 0.12, -s * 0.12, 0, -s); ctx.fill();
  } else if (shape === 'rect') {
    ctx.fillRect(-s * 0.5, -s * 0.3, s, s * 0.6);
  } else {
    ctx.arc(0, 0, s * 0.45, 0, TAU); ctx.fill();
  }
}
