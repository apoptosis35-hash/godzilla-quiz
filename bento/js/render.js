// Canvas renderer: bento box, characters (interpolated between physics steps),
// chopsticks holding the next piece, guide line and effects.
import { WORLD, TIERS, POWER } from './config.js';
import { Sprites } from './chars.js';

const VIEW = { x0: -WORLD.VIEW_PAD, x1: WORLD.W + WORLD.VIEW_PAD, y0: 0, y1: WORLD.FLOOR + WORLD.VIEW_PAD };

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.sprites = new Sprites();
    this.maxDpr = 2.5;
    this.scale = 1; this.ox = 0; this.oy = 0; this.dpr = 1;
    this.aimX = WORLD.W / 2;
    this.heldShowAt = 0;
    this.dropAnim = -1e9;
    this.fever = 0;
    this.overAt = 0;
    this.power = 0;          // current pull (0..1) while charging
    this.charging = false;
    this.gaugeA = 0;
    this.resize();
  }

  resize() {
    const rect = this.cv.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    const vw = VIEW.x1 - VIEW.x0, vh = VIEW.y1 - VIEW.y0;
    this.scale = Math.min(w / vw, h / vh);
    this.ox = (w - vw * this.scale) / 2 - VIEW.x0 * this.scale;
    this.oy = (h - vh * this.scale) - VIEW.y0 * this.scale;
    this.cssW = w; this.cssH = h;
    this.px = this.scale * this.dpr;
    this.sprites.setScale(this.px);
    this.box = null;
  }

  // screen (css px, relative to canvas) -> world
  toWorldX(clientX) {
    const rect = this.cv.getBoundingClientRect();
    return (clientX - rect.left - this.ox) / this.scale;
  }
  worldToCss(x, y) { return { x: this.ox + x * this.scale, y: this.oy + y * this.scale }; }

  _buildBox() {
    const c = document.createElement('canvas');
    c.width = this.cv.width; c.height = this.cv.height;
    const g = c.getContext('2d');
    g.setTransform(this.px, 0, 0, this.px, this.ox * this.dpr, this.oy * this.dpr);
    const P = WORLD.VIEW_PAD, W = WORLD.W, F = WORLD.FLOOR, T = WORLD.TOP;
    // drop shadow
    g.save(); g.shadowColor = 'rgba(150,80,60,0.28)'; g.shadowBlur = 24 * this.px; g.shadowOffsetY = 8 * this.px;
    rr(g, -P, T - 10, W + 2 * P, F - T + 10 + P, 26); g.fillStyle = '#e65c6a'; g.fill(); g.restore();
    // lacquer box
    const lg = g.createLinearGradient(0, T, 0, F + P);
    lg.addColorStop(0, '#ff8a92'); lg.addColorStop(0.5, '#ef6874'); lg.addColorStop(1, '#d24a5a');
    rr(g, -P, T - 10, W + 2 * P, F - T + 10 + P, 26); g.fillStyle = lg; g.fill();
    g.lineWidth = 2.5; g.strokeStyle = '#b8384a'; g.stroke();
    // rim highlight
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-P + 22, T - 6); g.lineTo(W + P - 22, T - 6); g.stroke();
    // inner tray
    const ig = g.createLinearGradient(0, T, 0, F);
    ig.addColorStop(0, '#fffaf0'); ig.addColorStop(1, '#fdebd3');
    rr(g, 0, T - 2, W, F - T + 2, 14); g.fillStyle = ig; g.fill();
    // soft gingham pattern
    g.save(); rr(g, 0, T - 2, W, F - T + 2, 14); g.clip();
    g.fillStyle = 'rgba(255,170,180,0.10)';
    for (let x = 0; x < W; x += 40) g.fillRect(x, T, 20, F - T);
    for (let y = T; y < F; y += 40) g.fillRect(0, y, W, 20);
    // inner shading
    const sh = g.createLinearGradient(0, 0, 18, 0); sh.addColorStop(0, 'rgba(160,90,70,0.18)'); sh.addColorStop(1, 'rgba(160,90,70,0)');
    g.fillStyle = sh; g.fillRect(0, T, 18, F - T);
    const sh2 = g.createLinearGradient(W, 0, W - 18, 0); sh2.addColorStop(0, 'rgba(160,90,70,0.18)'); sh2.addColorStop(1, 'rgba(160,90,70,0)');
    g.fillStyle = sh2; g.fillRect(W - 18, T, 18, F - T);
    const sh3 = g.createLinearGradient(0, F, 0, F - 22); sh3.addColorStop(0, 'rgba(160,90,70,0.2)'); sh3.addColorStop(1, 'rgba(160,90,70,0)');
    g.fillStyle = sh3; g.fillRect(0, F - 22, W, 22);
    g.restore();
    // little decorative dots on the lacquer front
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [x, y] of [[-P / 2, T + 30], [W + P / 2, T + 30], [-P / 2, F - 20], [W + P / 2, F - 20]]) { g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }
    this.box = c;
  }

  // vis state helpers ---------------------------------------------------
  vis(b) {
    let v = b.food.vis;
    if (!v) {
      v = b.food.vis = { sq: 0, hitUntil: 0, happyUntil: 0, blinkPhase: Math.random() * 4000, blinkEvery: 2600 + Math.random() * 2600, hop: 0, hopV: 0, bornAt: 0 };
    }
    return v;
  }

  expr(b, v, now, game) {
    if (game.over) return 'sad';
    if (now < v.happyUntil) return 'happy';
    if (now < v.hitUntil) return 'hit';
    if (b.food.dropping) return b.food.power >= POWER.SMASH_MIN ? 'power' : 'surprised';
    if (game.danger > 0.25 && b.position.y - b.circleRadius < WORLD.TOP + 50) return 'worried';
    if ((now + v.blinkPhase) % v.blinkEvery < 120) return 'blink';
    return 'normal';
  }

  draw(game, fx, alpha, now, held) {
    const ctx = this.ctx;
    if (!this.box) this._buildBox();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    const sx = fx.shakeX * this.px, sy = fx.shakeY * this.px;
    ctx.drawImage(this.box, sx, sy);
    ctx.setTransform(this.px, 0, 0, this.px, this.ox * this.dpr + sx, this.oy * this.dpr + sy);

    // fever shimmer inside the box
    if (this.fever > 0.01) {
      ctx.save();
      rr(ctx, 0, WORLD.TOP - 2, WORLD.W, WORLD.FLOOR - WORLD.TOP + 2, 14); ctx.clip();
      const t = now / 900;
      const g = ctx.createLinearGradient(0, WORLD.TOP + Math.sin(t) * 60, WORLD.W, WORLD.FLOOR);
      const hues = ['#ffd6e7', '#fff3b0', '#d4f7c5', '#cfe9ff', '#e8d6ff'];
      hues.forEach((h, i) => g.addColorStop(((i / hues.length) + t * 0.15) % 1, h));
      ctx.globalAlpha = 0.45 * this.fever;
      ctx.fillStyle = g; ctx.fillRect(0, WORLD.TOP, WORLD.W, WORLD.FLOOR - WORLD.TOP);
      ctx.restore();
    }

    // danger line
    const d = game.danger;
    ctx.save();
    ctx.setLineDash([10, 9]);
    ctx.lineWidth = 2.2;
    const pulse = d > 0 ? 0.5 + 0.5 * Math.sin(now / (d > 0.5 ? 70 : 140)) : 0;
    ctx.strokeStyle = d > 0 ? `rgba(255,${80 - 60 * pulse},${90 - 60 * pulse},${0.5 + 0.5 * pulse})` : 'rgba(230,120,130,0.35)';
    ctx.beginPath(); ctx.moveTo(4, WORLD.TOP); ctx.lineTo(WORLD.W - 4, WORLD.TOP); ctx.stroke();
    ctx.restore();
    if (d > 0.05) {
      ctx.fillStyle = `rgba(255,80,100,${0.12 * d + 0.06 * pulse})`;
      ctx.fillRect(0, WORLD.TOP, WORLD.W, 30);
    }

    // guide line + landing ghost (it heats up with the pull)
    if (held && held.visible) {
      const tier = held.tier, r = TIERS[tier].r;
      const x = game.clampX(this.aimX, tier);
      const ly = game.landingY(x, tier);
      const p = this.charging ? this.power : 0;
      const hot = powerColor(p);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3 + p * 3; ctx.setLineDash([2, 8 - p * 3]);
      ctx.lineDashOffset = -now / (40 - p * 28);
      ctx.beginPath(); ctx.moveTo(x, WORLD.DROP_Y + r); ctx.lineTo(x, ly); ctx.stroke();
      ctx.strokeStyle = p > 0 ? hot : 'rgba(240,120,140,0.55)'; ctx.lineWidth = 1.5 + p * 1.5;
      ctx.beginPath(); ctx.moveTo(x, WORLD.DROP_Y + r); ctx.lineTo(x, ly); ctx.stroke();
      ctx.setLineDash([5, 6]); ctx.lineWidth = 2; ctx.strokeStyle = p > 0 ? hot : 'rgba(240,120,140,0.5)';
      ctx.beginPath(); ctx.arc(x, ly, r, 0, Math.PI * 2); ctx.stroke();
      if (p >= POWER.SMASH_MIN) {
        // impact zone: how far the hit will push things around
        ctx.setLineDash([]);
        const zr = r + 18 + p * 46, pulse = 0.5 + 0.5 * Math.sin(now / 90);
        ctx.globalAlpha = 0.18 + 0.2 * pulse;
        ctx.strokeStyle = hot; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, ly + r * 0.3, zr, Math.PI * 0.95, Math.PI * 2.05); ctx.stroke();
        ctx.globalAlpha = 1;
        // chevrons pointing down the line
        ctx.fillStyle = hot;
        const n = p > 0.7 ? 3 : 2, len = ly - (WORLD.DROP_Y + r);
        for (let k = 0; k < n; k++) {
          const t = ((now / (260 - p * 140)) + k / n) % 1;
          const yy = WORLD.DROP_Y + r + 10 + t * Math.max(0, len - 20);
          ctx.globalAlpha = Math.sin(t * Math.PI);
          ctx.beginPath(); ctx.moveTo(x - 7, yy - 5); ctx.lineTo(x, yy + 3); ctx.lineTo(x + 7, yy - 5); ctx.lineTo(x + 7, yy - 1); ctx.lineTo(x, yy + 7); ctx.lineTo(x - 7, yy - 1); ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    fx.drawBack(ctx, this.sprites, this.px);

    // characters
    const px = this.px;
    for (const b of game.foods) {
      const f = b.food;
      if (!f.dropping || !(f.power >= POWER.SMASH_MIN)) continue;
      const img = this.sprites.get(f.tier, 'power');
      const w = img.width / px, x = b.position.x, y = b.position.y;
      for (let k = 3; k >= 1; k--) {
        ctx.globalAlpha = 0.12 * (4 - k) * f.power;
        ctx.drawImage(img, x - w / 2, y - b.velocity.y * k * 1.1 - w / 2, w, w);
      }
      ctx.globalAlpha = 1;
    }
    for (const b of game.foods) {
      const v = this.vis(b);
      const x = b.prevX + (b.position.x - b.prevX) * alpha;
      const y = b.prevY + (b.position.y - b.prevY) * alpha;
      const a = b.prevA + (b.angle - b.prevA) * alpha;
      const f = b.food;
      let s = 1;
      if (f.fromMerge) {
        const t = (now - v.bornAt) / 340;
        if (t < 1) s = popCurve(t, TIERS[Math.max(0, f.tier - 1)].r / TIERS[f.tier].r);
      }
      const img = this.sprites.get(f.tier, this.expr(b, v, now, game));
      const w = (img.width / px) * s;
      const sq = v.sq;
      ctx.save();
      ctx.translate(x, y + v.hop + sq * TIERS[f.tier].r * 0.5);
      ctx.scale(1 + sq * 0.6, 1 - sq);
      ctx.rotate(a);
      ctx.drawImage(img, -w / 2, -w / 2, w, w);
      ctx.restore();
    }

    // chopsticks + held piece
    if (held) this._drawHeld(ctx, game, held, now);

    fx.drawFront(ctx);

    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${fx.flash * 0.45})`;
      ctx.fillRect(VIEW.x0, 0, VIEW.x1 - VIEW.x0, VIEW.y1);
    }
    if (game.over) {
      const t = Math.min(1, (now - this.overAt) / 700);
      ctx.fillStyle = `rgba(90,60,80,${0.22 * t})`;
      rr(ctx, 0, WORLD.TOP - 2, WORLD.W, WORLD.FLOOR - WORLD.TOP + 2, 14); ctx.fill();
    }
  }

  _drawHeld(ctx, game, held, now) {
    const tier = held.tier, r = TIERS[tier].r;
    const x = game.clampX(this.aimX, tier);
    const y = WORLD.DROP_Y + Math.sin(now / 380) * 1.6;
    const since = now - this.dropAnim;
    const open = since < 160 ? 1 - since / 160 : 0;     // chopsticks spring open after a drop
    const appear = held.visible ? Math.min(1, (now - this.heldShowAt) / 140) : 0;
    // chopsticks
    const spread = r * 0.95 + open * 14 + (1 - appear) * 10;
    ctx.save();
    ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      const tipX = x + sx * spread * 0.92, tipY = y - r * 0.1;
      const topX = x + sx * (spread * 0.35 + 6), topY = y - r - 46;
      ctx.strokeStyle = '#a8672e'; ctx.lineWidth = 7.5;
      ctx.beginPath(); ctx.moveTo(topX, topY); ctx.lineTo(tipX, tipY); ctx.stroke();
      ctx.strokeStyle = '#e7ad6a'; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(topX, topY); ctx.lineTo(tipX, tipY); ctx.stroke();
      ctx.strokeStyle = '#f15b6c'; ctx.lineWidth = 7.5;
      ctx.beginPath(); ctx.moveTo(topX, topY); ctx.lineTo(topX + (tipX - topX) * 0.18, topY + (tipY - topY) * 0.18); ctx.stroke();
    }
    ctx.restore();
    this.gaugeA += ((this.charging && held.visible ? 1 : 0) - this.gaugeA) * 0.35;
    if (this.gaugeA > 0.02) this._drawGauge(ctx, now);
    if (!held.visible) return;
    const p = this.charging ? this.power : 0;
    const e = appear < 1 ? backOut(appear) : 1;
    const expr = p > 0.7 ? 'power' : p >= POWER.SMASH_MIN ? 'surprised' : (now % 3100) < 120 ? 'blink' : 'normal';
    const img = this.sprites.get(tier, expr);
    const w = (img.width / this.px) * e;
    if (p >= POWER.SMASH_MIN) this._drawCharge(ctx, x, y, r, p, now);
    const shake = p > 0.7 ? (p - 0.7) * 4 : 0;
    const jx = shake ? (Math.random() - 0.5) * shake : 0, jy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.save();
    ctx.translate(x + jx, y + jy);
    ctx.scale(1 + p * 0.06, 1 - p * 0.09);   // squeezed by the chopsticks as you pull
    ctx.drawImage(img, -w / 2, -w / 2, w, w);
    ctx.restore();
    if (p >= 0.999) {
      const t = now / 120;
      ctx.save();
      ctx.font = '900 20px "Hiragino Maru Gothic ProN","M PLUS Rounded 1c","Arial Rounded MT Bold",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const yy = y - 2 - Math.abs(Math.sin(t)) * 3;
      const xx = x > WORLD.W - 90 ? x - r - 38 : x + r + 38;   // beside the piece, on the roomier side
      ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round'; ctx.strokeText('MAX', xx, yy);
      ctx.fillStyle = '#ff4f6d'; ctx.fillText('MAX', xx, yy);
      ctx.restore();
    }
  }

  // speed lines (mid power) and focus lines + sparkles (high power) around the held piece
  _drawCharge(ctx, x, y, r, p, now) {
    ctx.save();
    ctx.lineCap = 'round';
    const col = powerColor(p);
    if (p <= 0.7) {
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        const t = ((now / 260) + k / 4) % 1;
        const xx = x + (k - 1.5) * r * 0.6;
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.beginPath(); ctx.moveTo(xx, y - r - 4 - t * 18); ctx.lineTo(xx, y - r - 14 - t * 18); ctx.stroke();
      }
    } else {
      const n = 16, seed = Math.floor(now / 50);
      ctx.strokeStyle = col; ctx.lineWidth = 2.2;
      for (let k = 0; k < n; k++) {
        const jitter = ((seed * 9301 + k * 49297) % 233) / 233;
        const a = (k / n) * Math.PI * 2 + jitter * 0.2;
        const r0 = r * 1.25 + jitter * 6, r1 = r0 + 10 + p * 16 + jitter * 8;
        ctx.globalAlpha = 0.35 + jitter * 0.45;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.stroke();
      }
      if (p >= 0.999) {
        ctx.fillStyle = '#fff6a8';
        for (let k = 0; k < 4; k++) {
          const a = now / 300 + k * Math.PI / 2, d = r * 1.5;
          const s = 3 + 2 * Math.sin(now / 80 + k);
          ctx.globalAlpha = 0.9;
          star4(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, s);
        }
      }
    }
    ctx.restore();
  }

  // compact power gauge on the right lacquer wall; fills downwards like the pull
  _drawGauge(ctx, now) {
    const x = WORLD.W + WORLD.VIEW_PAD / 2, y0 = WORLD.TOP + 6, h = 190, w = 9;
    const p = this.charging ? this.power : 0;
    ctx.save();
    ctx.globalAlpha = this.gaugeA;
    rr(ctx, x - w / 2 - 2, y0 - 2, w + 4, h + 4, 7); ctx.fillStyle = 'rgba(120,30,45,0.55)'; ctx.fill();
    rr(ctx, x - w / 2, y0, w, h, 5); ctx.fillStyle = 'rgba(255,240,240,0.9)'; ctx.fill();
    if (p > 0) {
      ctx.save(); rr(ctx, x - w / 2, y0, w, h, 5); ctx.clip();
      const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
      g.addColorStop(0, '#7fdcb5'); g.addColorStop(0.3, '#9be27a'); g.addColorStop(0.31, '#ffd34d'); g.addColorStop(0.7, '#ff9a3d'); g.addColorStop(0.71, '#ff5c6c'); g.addColorStop(1, '#ff2f6d');
      ctx.fillStyle = g; ctx.fillRect(x - w / 2, y0, w, h * p);
      if (p >= 0.999) { ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(now / 60)})`; ctx.fillRect(x - w / 2, y0, w, h); }
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(120,30,45,0.6)';
    for (const m of [0.3, 0.7]) ctx.fillRect(x - w / 2, y0 + h * m - 0.75, w, 1.5);
    ctx.restore();
  }
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// starts at s0 (the old size), springs past 1 and settles: "boing"
function popCurve(t, s0) {
  const e = 1 - Math.pow(1 - t, 3);
  const over = Math.sin(t * Math.PI) * 0.16 * (1 - t * 0.5);
  return s0 + (1 - s0) * e + over;
}
function powerColor(p) {
  if (p < 0.31) return 'rgba(110,200,160,0.9)';
  if (p <= 0.7) return 'rgba(255,160,40,0.95)';
  return 'rgba(255,60,95,0.95)';
}
function star4(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x + s * 0.15, y - s * 0.15, x + s, y); ctx.quadraticCurveTo(x + s * 0.15, y + s * 0.15, x, y + s);
  ctx.quadraticCurveTo(x - s * 0.15, y + s * 0.15, x - s, y); ctx.quadraticCurveTo(x - s * 0.15, y - s * 0.15, x, y - s); ctx.fill();
}
function backOut(t) { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

