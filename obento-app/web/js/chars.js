// Original okazu characters, drawn procedurally so they stay crisp at any size.
// Every character is drawn centred at (0,0) for collision radius r.
// Expressions: normal, blink, surprised, hit, happy, sad, worried, power (determined, for power drops)
import { TIERS, tierInfo } from './config.js';
import { EDITION } from './edition.js';

export const EXPRESSIONS = ['normal', 'blink', 'surprised', 'hit', 'happy', 'sad', 'worried', 'power'];
export const SPRITE_PAD = 1.3; // sprites are this many radii wide on each side (crowns, tails)

const INK = '#4a2c1d';
const CHEEK = 'rgba(255,110,130,0.55)';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function radial(ctx, r, light, base, dark, ox = -0.35, oy = -0.42) {
  const g = ctx.createRadialGradient(r * ox, r * oy, r * 0.05, 0, 0, r * 1.05);
  g.addColorStop(0, light); g.addColorStop(0.45, base); g.addColorStop(1, dark);
  return g;
}

function outline(ctx, r, color = INK, w = 0.062) {
  ctx.lineWidth = Math.max(1.2, r * w);
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function gloss(ctx, r, x = -0.38, y = -0.45, w = 0.32, h = 0.18, a = 0.55) {
  ctx.save();
  ctx.translate(r * x, r * y); ctx.rotate(-0.6);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * w);
  g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, r * w, r * h, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function blob(ctx, r, f) {
  ctx.beginPath();
  const n = 72;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = f(a);
    const x = Math.cos(a) * r * k, y = Math.sin(a) * r * k;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, rr) {
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function crumbs(ctx, r, seed, count, colors, inner = 0.9) {
  const R = rng(seed);
  for (let i = 0; i < count; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r * inner;
    const s = r * (0.03 + R() * 0.045);
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath(); ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d, s, s * (0.6 + R() * 0.5), R() * 3, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------------------------------------------------------------- faces
// opts: y (face centre), s (scale), gap (eye spacing), mouth, brows, sparkle, blush
function face(ctx, r, expr, o = {}) {
  const s = (o.s || 1) * r * 1.15;   // big faces read as cute, even small on screen
  const fy = (o.y || 0) * r;
  const gap = (o.gap || 0.34) * s;
  const ew = 0.14 * s, eh = 0.175 * s;
  const ink = o.ink || INK;
  ctx.save();
  ctx.translate(0, fy);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // cheeks
  const cheekA = expr === 'happy' ? 1 : expr === 'sad' ? 0.55 : 0.85;
  ctx.globalAlpha = Math.min(1, cheekA * (o.blush || 1));
  for (const sx of [-1, 1]) {
    // soft airbrushed blush with a tiny shine
    const cx = sx * gap * 1.55, cy = eh * 1.05, rx = s * 0.15;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, o.cheek || 'rgba(255,105,135,0.75)'); g.addColorStop(0.6, o.cheek || 'rgba(255,120,145,0.45)'); g.addColorStop(1, 'rgba(255,140,160,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(cx + sx * rx * 0.25, cy - s * 0.03, s * 0.018, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = ink; ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1, s * 0.055);

  const openEye = (sx, scale = 1, look = 0) => {
    const x = sx * gap, w = ew * scale, h = eh * scale;
    // dark rim, then a warm brown iris that glows lighter at the bottom
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.ellipse(x, 0, w, h, 0, 0, Math.PI * 2); ctx.fill();
    const ig = ctx.createRadialGradient(x, h * 0.55, 0, x, h * 0.2, h * 1.05);
    ig.addColorStop(0, o.iris || '#a8653a'); ig.addColorStop(0.55, '#5a2f1a'); ig.addColorStop(1, 'rgba(40,20,10,0)');
    ctx.fillStyle = ig;
    ctx.beginPath(); ctx.ellipse(x, h * 0.06, w * 0.82, h * 0.86, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(x - w * 0.28 + look, -h * 0.36, w * 0.46, h * 0.36, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w * 0.38 + look, h * 0.38, w * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(x + w * 0.3 + look, -h * 0.55, w * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (o.sparkle) {
      ctx.save(); ctx.translate(x + ew * 0.1 * scale, -eh * 0.05 * scale); ctx.fillStyle = 'rgba(255,255,255,0.9)';
      star4(ctx, w * 0.38); ctx.restore();
    }
    ctx.fillStyle = ink;
  };

  const happyEye = (sx) => { ctx.beginPath(); ctx.moveTo(sx * gap - ew * 1.1, eh * 0.3); ctx.quadraticCurveTo(sx * gap, -eh * 1.2, sx * gap + ew * 1.1, eh * 0.3); ctx.stroke(); };

  switch (expr) {
    case 'blink':
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * gap - ew, 0); ctx.quadraticCurveTo(sx * gap, eh * 0.7, sx * gap + ew, 0); ctx.stroke(); }
      break;
    case 'surprised':
      for (const sx of [-1, 1]) openEye(sx, 1.18);
      break;
    case 'power':
      // determined: narrowed eyes under angry brows
      for (const sx of [-1, 1]) {
        const x = sx * gap;
        ctx.beginPath(); ctx.ellipse(x, eh * 0.1, ew * 0.95, eh * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - ew * 0.25, -eh * 0.1, ew * 0.32, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ink;
      }
      ctx.save(); ctx.lineWidth = Math.max(1.2, s * 0.08);
      ctx.beginPath();
      for (const sx of [-1, 1]) { ctx.moveTo(sx * (gap + ew * 1.3), -eh * 1.35); ctx.lineTo(sx * (gap - ew * 0.9), -eh * 0.75); }
      ctx.stroke(); ctx.restore();
      break;
    case 'worried':
      for (const sx of [-1, 1]) openEye(sx, 1.0);
      ctx.beginPath();
      for (const sx of [-1, 1]) { ctx.moveTo(sx * (gap + ew * 1.2), -eh * 1.55); ctx.lineTo(sx * (gap - ew * 0.6), -eh * 1.95); }
      ctx.stroke();
      break;
    case 'hit':
      for (const sx of [-1, 1]) {
        const x = sx * gap;
        ctx.beginPath(); ctx.moveTo(x - sx * ew * 1.0, -eh * 0.75); ctx.lineTo(x + sx * ew * 0.7, 0); ctx.lineTo(x - sx * ew * 1.0, eh * 0.75); ctx.stroke();
      }
      break;
    case 'happy':
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * gap - ew * 1.1, eh * 0.3); ctx.quadraticCurveTo(sx * gap, -eh * 1.2, sx * gap + ew * 1.1, eh * 0.3); ctx.stroke(); }
      break;
    case 'sad':
      for (const sx of [-1, 1]) {
        const x = sx * gap;
        ctx.beginPath(); ctx.ellipse(x, eh * 0.15, ew * 0.9, eh * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - ew * 0.25, -eh * 0.05, ew * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ink;
      }
      ctx.beginPath();
      for (const sx of [-1, 1]) { ctx.moveTo(sx * (gap + ew * 1.1), -eh * 1.0); ctx.lineTo(sx * (gap - ew * 0.9), -eh * 1.5); }
      ctx.stroke();
      // tear
      ctx.fillStyle = 'rgba(120,190,255,0.9)';
      ctx.beginPath(); ctx.moveTo(gap + ew * 0.6, eh * 0.7); ctx.quadraticCurveTo(gap + ew * 1.4, eh * 1.6, gap + ew * 0.6, eh * 1.8); ctx.quadraticCurveTo(gap - ew * 0.2, eh * 1.6, gap + ew * 0.6, eh * 0.7); ctx.fill();
      ctx.fillStyle = ink;
      break;
    default:
      if (o.happyEyes) { for (const sx of [-1, 1]) happyEye(sx); }        // always-smiling eyes
      else if (o.wink) { openEye(-1, 1.05); happyEye(1); }                 // signature wink
      else for (const sx of [-1, 1]) openEye(sx, 1);
  }

  if (o.brows && expr !== 'sad' && expr !== 'worried' && expr !== 'power') {
    ctx.beginPath();
    for (const sx of [-1, 1]) {
      const x = sx * gap;
      if (o.brows === 'bold') { ctx.moveTo(x - sx * ew * 1.2, -eh * 1.7); ctx.lineTo(x + sx * ew * 0.9, -eh * 1.45); }
      else { ctx.moveTo(x - ew, -eh * 1.6); ctx.quadraticCurveTo(x, -eh * 2.0, x + ew, -eh * 1.6); }
    }
    ctx.lineWidth = Math.max(1, s * (o.brows === 'bold' ? 0.07 : 0.045));
    ctx.stroke();
    ctx.lineWidth = Math.max(1, s * 0.055);
  }

  // mouth
  const my = eh * 1.35;
  const mouth = o.mouth || 'smile';
  ctx.lineWidth = Math.max(1, s * 0.05);
  if (expr === 'power') {
    roundRect(ctx, -s * 0.13, my - s * 0.02, s * 0.26, s * 0.1, s * 0.04);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = ink; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.12, my + s * 0.03); ctx.lineTo(s * 0.12, my + s * 0.03); ctx.lineWidth = Math.max(0.8, s * 0.025); ctx.stroke();
  } else if (expr === 'happy') {
    const path = () => { ctx.beginPath(); ctx.moveTo(-s * 0.17, my - s * 0.03); ctx.quadraticCurveTo(0, my + s * 0.3, s * 0.17, my - s * 0.03); ctx.closePath(); };
    path(); ctx.fillStyle = '#7a2b22'; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = '#ff7b7b'; ctx.beginPath(); ctx.ellipse(0, my + s * 0.12, s * 0.09, s * 0.06, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    path(); ctx.strokeStyle = ink; ctx.stroke();
  } else if (expr === 'surprised' || expr === 'hit' && mouth !== 'tako') {
    ctx.fillStyle = '#7a2b22';
    ctx.beginPath(); ctx.ellipse(0, my + s * 0.03, s * 0.055, s * (expr === 'hit' ? 0.04 : 0.07), 0, 0, Math.PI * 2); ctx.fill();
  } else if (expr === 'sad' || expr === 'worried') {
    ctx.beginPath(); ctx.moveTo(-s * 0.09, my + s * 0.07); ctx.quadraticCurveTo(0, my - s * 0.04, s * 0.09, my + s * 0.07); ctx.stroke();
  } else if (mouth === 'cat') {
    ctx.beginPath(); ctx.moveTo(-s * 0.13, my); ctx.quadraticCurveTo(-s * 0.065, my + s * 0.1, 0, my); ctx.quadraticCurveTo(s * 0.065, my + s * 0.1, s * 0.13, my); ctx.stroke();
  } else if (mouth === 'tako') {
    ctx.fillStyle = o.mouthFill || '#ff8fa0';
    ctx.beginPath(); ctx.ellipse(0, my + s * 0.04, s * 0.085, s * 0.075, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7a2b22'; ctx.beginPath(); ctx.ellipse(0, my + s * 0.04, s * 0.03, s * 0.028, 0, 0, Math.PI * 2); ctx.fill();
  } else if (mouth === 'open') {
    // wide happy mouth: flat-ish top, round bottom, pink tongue
    const mw = s * 0.17, md = s * 0.22, top = my - s * 0.035;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-mw, top); ctx.quadraticCurveTo(0, top + s * 0.03, mw, top);
      ctx.bezierCurveTo(mw * 0.95, top + md * 1.25, -mw * 0.95, top + md * 1.25, -mw, top);
      ctx.closePath();
    };
    path(); ctx.fillStyle = '#6e1f1c'; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = '#ff8c8c';
    ctx.beginPath(); ctx.ellipse(0, top + md * 0.95, mw * 0.6, md * 0.36, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    path(); ctx.lineWidth = Math.max(1, s * 0.035); ctx.stroke();
  } else if (mouth === 'grin') {
    ctx.beginPath(); ctx.moveTo(-s * 0.17, my - s * 0.02); ctx.quadraticCurveTo(0, my + s * 0.2, s * 0.17, my - s * 0.02); ctx.closePath();
    ctx.fillStyle = '#7a2b22'; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = '#fff'; ctx.fillRect(-s * 0.17, my - s * 0.03, s * 0.34, s * 0.05); ctx.restore();
    ctx.beginPath(); ctx.moveTo(-s * 0.17, my - s * 0.02); ctx.quadraticCurveTo(0, my + s * 0.2, s * 0.17, my - s * 0.02); ctx.closePath(); ctx.stroke();
  } else if (mouth === 'tiny') {
    ctx.beginPath(); ctx.moveTo(-s * 0.06, my); ctx.quadraticCurveTo(0, my + s * 0.07, s * 0.06, my); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(-s * 0.1, my); ctx.quadraticCurveTo(0, my + s * 0.12, s * 0.1, my); ctx.stroke();
  }
  ctx.restore();
}

function star4(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.15, -s * 0.15, s, 0); ctx.quadraticCurveTo(s * 0.15, s * 0.15, 0, s);
  ctx.quadraticCurveTo(-s * 0.15, s * 0.15, -s, 0); ctx.quadraticCurveTo(-s * 0.15, -s * 0.15, 0, -s); ctx.fill();
}

function shadow(ctx, r) {
  // soft contact shadow inside the silhouette bottom
  const g = ctx.createRadialGradient(0, r * 0.55, r * 0.1, 0, r * 0.4, r);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,20,0,0.18)');
  return g;
}

// ---------------------------------------------------------------- characters
const DRAW = {}; // keyed by TIERS[].id

// 0 えだまめ: a plump two-bean pod with a little sprout
DRAW.edamame = (ctx, r, e, T) => {
  // a plump two-bean pod, shaped to fill the round hit area (slight waist at the top and bottom)
  const pod = () => blob(ctx, r, (a) => 0.95 + 0.05 * Math.cos(2 * a) - 0.07 * Math.exp(-((Math.abs(Math.sin(a)) - 1) ** 2) / 0.004));
  pod();
  ctx.fillStyle = radial(ctx, r, T.light, T.color, T.dark, -0.3, -0.35); ctx.fill();
  ctx.save(); ctx.clip();
  // bean bulges
  for (const x of [-0.45, 0.45]) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.arc(r * (x - 0.12), -r * 0.2, r * 0.36, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = 'rgba(60,120,30,0.35)'; ctx.lineWidth = r * 0.05;
  ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.quadraticCurveTo(r * 0.08, 0, 0, r * 0.8); ctx.stroke();
  ctx.restore();
  pod(); outline(ctx, r, '#3c7a22', 0.08);
  // sprout
  ctx.strokeStyle = '#3c7a22'; ctx.lineWidth = r * 0.1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(r * 0.7, -r * 0.6); ctx.quadraticCurveTo(r * 0.86, -r * 0.8, r * 0.8, -r * 0.98); ctx.stroke();
  ctx.fillStyle = '#7fd04a';
  ctx.beginPath(); ctx.ellipse(r * 0.7, -r * 1.02, r * 0.16, r * 0.08, -0.9, 0, Math.PI * 2); ctx.fill();
  face(ctx, r, e, { y: 0.0, s: 0.92, gap: 0.36, mouth: 'open', sparkle: true });
};

// 1 ミニトマト: glossy, shy, with a star calyx
DRAW.tomato = (ctx, r, e, T) => {
  blob(ctx, r, (a) => 0.97 - 0.035 * Math.cos(2 * a) * (Math.sin(a) < 0 ? 1 : 0.3));
  ctx.fillStyle = radial(ctx, r, T.light, T.color, T.dark); ctx.fill(); outline(ctx, r, '#8e1f1c');
  gloss(ctx, r, -0.38, -0.42, 0.34, 0.2, 0.85);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(-r * 0.55, -r * 0.18, r * 0.06, 0, Math.PI * 2); ctx.fill();
  // calyx
  ctx.save(); ctx.translate(0, -r * 0.82);
  ctx.fillStyle = '#4fa83a'; ctx.strokeStyle = '#2f6d22'; ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2 + Math.PI / 5;
    const a2 = a + Math.PI / 5;
    ctx.lineTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.2 + r * 0.04);
    ctx.lineTo(Math.cos(a2) * r * 0.1, Math.sin(a2) * r * 0.06);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3b8a2c'; roundRect(ctx, -r * 0.05, -r * 0.24, r * 0.1, r * 0.24, r * 0.04); ctx.fill();
  ctx.restore();
  face(ctx, r, e, { y: 0.08, gap: 0.32, mouth: 'open', wink: true, blush: 1.4 });
};

// 2 たまごやき: rolled omelette with layers
DRAW.tamago = (ctx, r, e, T) => {
  const w = r * 1.86, h = r * 1.74;
  roundRect(ctx, -w / 2, -h / 2, w, h, r * 0.6);
  ctx.fillStyle = radial(ctx, r, T.light, T.color, T.dark, -0.3, -0.5); ctx.fill();
  ctx.save(); ctx.clip();
  // roll layers on the right side
  ctx.strokeStyle = 'rgba(214,140,30,0.55)'; ctx.lineWidth = r * 0.06;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.arc(w * 0.62, 0, r * (0.32 + i * 0.22), Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
  }
  // browned spots
  crumbs(ctx, r, 7, 8, ['rgba(220,140,40,0.35)', 'rgba(240,170,60,0.3)'], 0.8);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-w / 2, -h / 2, w, h * 0.18);
  ctx.restore();
  roundRect(ctx, -w / 2, -h / 2, w, h, r * 0.6); outline(ctx, r, '#a86a14');
  gloss(ctx, r, -0.42, -0.45, 0.32, 0.14, 0.6);
  face(ctx, r, e, { y: 0.0, gap: 0.3, mouth: 'open', sparkle: true });
};

// 3 タコさんウインナー: red dome with 4 curly legs and a pout
DRAW.tako = (ctx, r, e, T) => {
  // legs
  ctx.fillStyle = T.color; ctx.strokeStyle = '#a32a40'; ctx.lineWidth = Math.max(1.2, r * 0.07);
  for (let i = 0; i < 4; i++) {
    const x = (-0.54 + i * 0.36) * r;
    ctx.save(); ctx.translate(x, r * 0.3); ctx.scale(0.92, 0.82); ctx.translate(-x, -r * 0.3);
    const curl = i < 2 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.15, r * 0.3);
    ctx.quadraticCurveTo(x - r * 0.18, r * 0.82, x + curl * r * 0.12, r * 0.95);
    ctx.quadraticCurveTo(x + curl * r * 0.28, r * 0.9, x + curl * r * 0.2, r * 0.74);
    ctx.quadraticCurveTo(x + r * 0.12, r * 0.6, x + r * 0.16, r * 0.3);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe4c2';
    ctx.beginPath(); ctx.ellipse(x + curl * r * 0.12, r * 0.84, r * 0.06, r * 0.04, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = T.color;
    ctx.restore();
  }
  // head
  ctx.beginPath(); ctx.ellipse(0, -r * 0.12, r * 0.97, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, r, T.light, T.color, T.dark); ctx.fill(); outline(ctx, r, '#a32a40');
  // cut marks
  ctx.strokeStyle = 'rgba(160,30,50,0.45)'; ctx.lineWidth = r * 0.05;
  ctx.beginPath(); ctx.moveTo(-r * 0.62, r * 0.42); ctx.lineTo(-r * 0.5, r * 0.3); ctx.moveTo(r * 0.62, r * 0.42); ctx.lineTo(r * 0.5, r * 0.3); ctx.stroke();
  gloss(ctx, r, -0.35, -0.45, 0.34, 0.18, 0.7);
  face(ctx, r, e, { y: -0.12, gap: 0.3, mouth: 'tako', mouthFill: '#ff9aab', cheek: 'rgba(255,190,200,0.85)' });
};

// 4 シュウマイ: pleated wrapper, meat on top and a green pea
DRAW.shumai = (ctx, r, e, T) => {
  const w = r * 1.84, h = r * 1.76, top = -h / 2 + r * 0.12;
  // body
  ctx.beginPath();
  // rounded shoulders keep the top corners inside the round hit area
  const sx = w / 2 - r * 0.3;
  ctx.moveTo(-w / 2, top + r * 0.5);
  ctx.quadraticCurveTo(-w / 2, top + r * 0.05, -sx, top + r * 0.05);
  for (let i = 1; i <= 8; i++) { const x = -sx + (2 * sx * i) / 8; ctx.quadraticCurveTo(x - sx / 8, top + (i % 2 ? -r * 0.12 : r * 0.08), x, top + r * 0.05); }
  ctx.quadraticCurveTo(w / 2, top + r * 0.05, w / 2, top + r * 0.5);
  ctx.lineTo(w / 2, h / 2 - r * 0.55);
  ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - r * 0.55, h / 2);
  ctx.lineTo(-w / 2 + r * 0.55, h / 2);
  ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r * 0.55);
  ctx.closePath();
  ctx.fillStyle = radial(ctx, r, T.light, T.color, T.dark, -0.3, -0.2); ctx.fill();
  outline(ctx, r, '#a98e45');
  // pleats
  ctx.strokeStyle = 'rgba(170,140,70,0.45)'; ctx.lineWidth = r * 0.04;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.24, top + r * 0.25); ctx.quadraticCurveTo(i * r * 0.27, r * 0.2, i * r * 0.22, h / 2 - r * 0.06); ctx.stroke(); }
  // meat top
  ctx.beginPath(); ctx.ellipse(0, top + r * 0.06, w * 0.4, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, r * 0.6, '#f3c7a6', '#d9997a', '#b56f50', 0, -0.3); ctx.fill(); outline(ctx, r, '#8c5236', 0.05);
  crumbs(ctx, r * 0.5, 3, 6, ['rgba(255,240,220,0.5)'], 0.5);
  // pea
  ctx.beginPath(); ctx.arc(0, top - r * 0.05, r * 0.17, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, r * 0.17, '#d6f7a8', '#7cc651', '#46902c'); ctx.fill(); outline(ctx, r, '#3b7a25', 0.05);
  face(ctx, r, e, { y: 0.28, s: 0.95, gap: 0.33, mouth: 'cat', happyEyes: true, blush: 1.3 });
};

// 5 からあげ: lumpy crispy fried chicken, confident brows
DRAW.karaage = (ctx, r, e, T) => {
  const f = (a) => 0.94 + 0.04 * Math.sin(5 * a + 1) + 0.025 * Math.sin(9 * a + 2) + 0.015 * Math.sin(17 * a);
  blob(ctx, r, f);
  ctx.fillStyle = radial(ctx, r, T.light, T.color, T.dark); ctx.fill();
  ctx.save(); ctx.clip();
  crumbs(ctx, r, 11, 30, ['rgba(255,220,140,0.5)', 'rgba(140,70,20,0.28)', 'rgba(255,200,100,0.45)'], 0.95);
  ctx.restore();
  blob(ctx, r, f); outline(ctx, r, '#6e3a10');
  gloss(ctx, r, -0.36, -0.45, 0.3, 0.16, 0.55);
  // freshly fried: little wisps of steam
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
  for (const dx of [-0.28, 0.05, 0.36]) {
    ctx.beginPath(); ctx.moveTo(dx * r, -r * 0.98); ctx.bezierCurveTo((dx - 0.1) * r, -r * 1.08, (dx + 0.1) * r, -r * 1.14, dx * r, -r * 1.25); ctx.stroke();
  }
  ctx.restore();
  face(ctx, r, e, { y: 0.05, gap: 0.32, mouth: 'grin', brows: 'bold' });
};

// 6 エビフライ: long golden panko body on a slant with a proud red tail
DRAW.ebi = (ctx, r, e, T) => {
  const ang = -0.62;
  // tail (behind) at the upper right end of the body
  ctx.save(); ctx.rotate(ang); ctx.translate(r * 0.84, 0); ctx.rotate(Math.PI / 2); ctx.scale(0.8, 0.8);
  ctx.beginPath(); ctx.moveTo(-r * 0.12, r * 0.1); ctx.quadraticCurveTo(-r * 0.42, -r * 0.2, -r * 0.3, -r * 0.5);
  ctx.lineTo(0, -r * 0.34); ctx.lineTo(r * 0.3, -r * 0.5); ctx.quadraticCurveTo(r * 0.42, -r * 0.2, r * 0.12, r * 0.1); ctx.closePath();
  const tg = ctx.createLinearGradient(0, 0, 0, -r * 0.5); tg.addColorStop(0, '#ff8a4a'); tg.addColorStop(1, '#ff3b3b');
  ctx.fillStyle = tg; ctx.fill(); outline(ctx, r, '#a3271c', 0.06);
  ctx.strokeStyle = 'rgba(255,225,205,0.7)'; ctx.lineWidth = r * 0.035;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-r * 0.2, -r * 0.36); ctx.moveTo(0, 0); ctx.lineTo(r * 0.2, -r * 0.36); ctx.stroke();
  ctx.restore();
  // breaded body: a slanted capsule with spiky panko edge
  const f = (a) => (1 / Math.sqrt(Math.cos(a - ang) ** 2 / 0.92 + Math.sin(a - ang) ** 2 / 0.7)) * (0.95 + 0.05 * Math.abs(Math.sin(11 * a)) + 0.02 * Math.sin(29 * a));
  blob(ctx, r, f);
  ctx.fillStyle = radial(ctx, r, '#fff0b8', '#f2b54f', '#b8701f'); ctx.fill();
  ctx.save(); ctx.clip();
  crumbs(ctx, r, 21, 46, ['rgba(255,244,190,0.85)', 'rgba(180,105,30,0.28)', 'rgba(255,220,140,0.7)'], 1.0);
  ctx.restore();
  blob(ctx, r, f); outline(ctx, r, '#83480f');
  gloss(ctx, r, -0.35, -0.2, 0.32, 0.1, 0.5);
  face(ctx, r, e, { y: 0.04, gap: 0.27, s: 0.98, mouth: 'open', sparkle: true, brows: 'soft' });
};

// 7 ハンバーグ: glossy demi-glace sauce, gentle big brother
DRAW.hamburg = (ctx, r, e, T) => {
  const f = (a) => (1 / Math.sqrt(Math.cos(a) ** 2 / 0.98 + Math.sin(a) ** 2 / 0.8)) * (0.98 + 0.012 * Math.sin(7 * a));
  blob(ctx, r, f);
  ctx.fillStyle = radial(ctx, r, T.light, T.color, T.dark); ctx.fill();
  ctx.save(); ctx.clip();
  crumbs(ctx, r, 41, 30, ['rgba(70,30,10,0.35)', 'rgba(200,130,90,0.3)'], 0.95);
  // sauce
  ctx.beginPath();
  ctx.moveTo(-r, -r * 0.2);
  ctx.bezierCurveTo(-r * 0.7, -r * 1.1, r * 0.7, -r * 1.1, r, -r * 0.25);
  ctx.lineTo(r, -r * 0.1);
  ctx.quadraticCurveTo(r * 0.8, r * 0.05, r * 0.66, -r * 0.08);
  ctx.quadraticCurveTo(r * 0.58, r * 0.3, r * 0.46, -r * 0.12);
  ctx.quadraticCurveTo(0, -r * 0.05, -r * 0.4, -r * 0.14);
  ctx.quadraticCurveTo(-r * 0.52, r * 0.18, -r * 0.64, -r * 0.1);
  ctx.quadraticCurveTo(-r * 0.85, -r * 0.05, -r, -r * 0.2);
  ctx.closePath();
  const sg = ctx.createLinearGradient(0, -r, 0, 0); sg.addColorStop(0, '#8a3a1c'); sg.addColorStop(1, '#5a1f0c');
  ctx.fillStyle = sg; ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,190,0.55)'; ctx.lineWidth = r * 0.05; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-r * 0.45, -r * 0.6); ctx.quadraticCurveTo(-r * 0.1, -r * 0.78, r * 0.25, -r * 0.68); ctx.stroke();
  ctx.restore();
  blob(ctx, r, f); outline(ctx, r, '#3d1a0a');
  // parsley
  ctx.fillStyle = '#5fbf3c';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(r * (0.28 + i * 0.07), -r * (0.55 + (i % 2) * 0.06), r * 0.05, 0, Math.PI * 2); ctx.fill(); }
  face(ctx, r, e, { y: 0.2, gap: 0.3, s: 0.92, mouth: 'smile', brows: 'soft', ink: '#2a1208', cheek: 'rgba(255,130,120,0.6)' });
};

// 8 おにぎり: rice triangle, nori band, pure smile
DRAW.onigiri = (ctx, r, e, T) => {
  const tri = () => blob(ctx, r, (a) => 0.93 + 0.08 * Math.cos(3 * (a + Math.PI / 2)));
  tri();
  ctx.fillStyle = radial(ctx, r, '#ffffff', '#fbfcff', '#d5dbe4', -0.25, -0.4); ctx.fill();
  ctx.save(); ctx.clip();
  // rice grains
  const R = rng(51);
  for (let i = 0; i < 34; i++) {
    // fluffy rice: soft grain-shaped highlights and shadows
    const x = (R() - 0.5) * r * 1.7, y = (R() - 0.55) * r * 1.5, a = R() * 3;
    ctx.fillStyle = 'rgba(205,212,225,0.35)';
    ctx.beginPath(); ctx.ellipse(x + r * 0.015, y + r * 0.02, r * 0.07, r * 0.04, a, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.06, r * 0.032, a, 0, Math.PI * 2); ctx.fill();
  }
  // nori
  const ng = ctx.createLinearGradient(-r * 0.4, 0, r * 0.4, 0); ng.addColorStop(0, '#1d2a28'); ng.addColorStop(0.5, '#2f4440'); ng.addColorStop(1, '#1d2a28');
  ctx.fillStyle = ng; roundRect(ctx, -r * 0.4, r * 0.34, r * 0.8, r * 0.8, r * 0.08); ctx.fill();
  ctx.strokeStyle = 'rgba(120,170,150,0.35)'; ctx.lineWidth = r * 0.02;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-r * 0.36, r * (0.48 + i * 0.1)); ctx.lineTo(r * 0.36, r * (0.48 + i * 0.1)); ctx.stroke(); }
  ctx.restore();
  tri(); outline(ctx, r, '#8d97a8', 0.06);
  // umeboshi peeking
  ctx.beginPath(); ctx.arc(0, -r * 0.66, r * 0.1, 0, Math.PI * 2); ctx.fillStyle = radial(ctx, r * 0.1, '#ff9aa6', '#e2465a', '#a8213a'); ctx.fill();
  face(ctx, r, e, { y: -0.2, gap: 0.29, s: 1.0, mouth: 'open', happyEyes: true, blush: 1.4 });
};

// 9 おべんとう王: round lacquer bento with crown and colorful okazu
DRAW.king = (ctx, r, e, T) => {
  // lacquer box
  ctx.beginPath(); ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, r, T.light, T.color, T.dark); ctx.fill(); outline(ctx, r, '#6e1019', 0.06);
  // gold rim
  ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.06; ctx.strokeStyle = '#f7c948'; ctx.stroke();
  // inside
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#fdf6e6'; ctx.fillRect(-r, -r, 2 * r, 2 * r);
  // okazu along the bottom
  const items = [
    [-0.55, 0.52, 0.22, '#ffd64a', 'egg'], [-0.2, 0.66, 0.2, '#ff6f86', 'tako'], [0.18, 0.66, 0.2, '#5fb84a', 'broc'],
    [0.53, 0.5, 0.2, '#ff5b50', 'tomato'], [0.72, 0.15, 0.13, '#e0912f', 'kara'], [-0.74, 0.15, 0.13, '#8fd35b', 'eda'],
  ];
  for (const [x, y, s, c, k] of items) {
    ctx.fillStyle = c;
    if (k === 'egg') { roundRect(ctx, (x - s) * r, (y - s * 0.75) * r, s * 2 * r, s * 1.5 * r, s * 0.4 * r); ctx.fill(); }
    else if (k === 'broc') { for (const [dx, dy] of [[-0.4, 0], [0.4, 0], [0, -0.45]]) { ctx.beginPath(); ctx.arc((x + dx * s) * r, (y + dy * s) * r, s * 0.6 * r, 0, Math.PI * 2); ctx.fill(); } }
    else { ctx.beginPath(); ctx.arc(x * r, y * r, s * r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc((x - s * 0.35) * r, (y - s * 0.35) * r, s * 0.25 * r, 0, Math.PI * 2); ctx.fill();
  }
  // rice face area
  ctx.beginPath(); ctx.ellipse(0, -r * 0.05, r * 0.6, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, r * 0.6, '#ffffff', '#ffffff', '#e8e8ef', -0.2, -0.3); ctx.fill();
  ctx.strokeStyle = 'rgba(180,170,160,0.5)'; ctx.lineWidth = r * 0.02; ctx.stroke();
  ctx.restore();
  // crown
  ctx.save(); ctx.translate(0, -r * 0.84);
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, r * 0.12); ctx.lineTo(-r * 0.46, -r * 0.24); ctx.lineTo(-r * 0.22, -r * 0.06); ctx.lineTo(0, -r * 0.34);
  ctx.lineTo(r * 0.22, -r * 0.06); ctx.lineTo(r * 0.46, -r * 0.24); ctx.lineTo(r * 0.4, r * 0.12); ctx.closePath();
  const cg = ctx.createLinearGradient(0, -r * 0.34, 0, r * 0.12); cg.addColorStop(0, '#fff2a0'); cg.addColorStop(0.5, '#ffcf3a'); cg.addColorStop(1, '#e09a12');
  ctx.fillStyle = cg; ctx.fill(); outline(ctx, r, '#9a6206', 0.04);
  for (const [x, y, c] of [[-0.46, -0.26, '#ff6b8a'], [0, -0.36, '#6bd6ff'], [0.46, -0.26, '#9cf06b']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x * r, y * r, r * 0.055, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ff5b7a'; ctx.beginPath(); ctx.arc(0, r * 0.0, r * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  gloss(ctx, r, -0.55, -0.55, 0.25, 0.12, 0.6);
  face(ctx, r, e, { y: -0.08, gap: 0.24, s: 0.9, mouth: 'cat', sparkle: true, blush: 1.2 });
};

// Draw onto any canvas, even one that already has a background: the shading pass
// needs a transparent layer, so the character is composed on its own sprite first.
// おじゃま: a wrinkly, very sour umeboshi
DRAW.ume = (ctx, r, e, T) => {
  const f = (a) => 0.95 + 0.03 * Math.sin(6 * a + 0.5) + 0.02 * Math.sin(11 * a);
  blob(ctx, r, f);
  ctx.fillStyle = radial(ctx, r, T.light, T.color, T.dark); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = 'rgba(110,10,40,0.35)'; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round';
  for (const [x0, y0, x1, y1] of [[-0.6, -0.5, -0.2, -0.65], [0.2, 0.55, 0.6, 0.35], [-0.65, 0.3, -0.35, 0.6], [0.45, -0.55, 0.7, -0.2]]) {
    ctx.beginPath(); ctx.moveTo(x0 * r, y0 * r); ctx.quadraticCurveTo((x0 + x1) / 2 * r + r * 0.1, (y0 + y1) / 2 * r, x1 * r, y1 * r); ctx.stroke();
  }
  ctx.restore();
  blob(ctx, r, f); outline(ctx, r, '#5e0c24');
  gloss(ctx, r, -0.35, -0.4, 0.3, 0.16, 0.7);
  face(ctx, r, e === 'normal' || e === 'blink' ? 'hit' : e, { y: 0.05, gap: 0.3, mouth: 'tiny', cheek: 'rgba(255,170,190,0.8)' });
};

// レアキャラ: the family photo in a shining gold frame
// the picture can be replaced in settings (kept on this device); null goes back to the built-in one
let rareImg = null, rareReady = false;
const rareWaiters = [];
const RARE_DEFAULT = '';   // no built-in photo in the store app
export function setRareImage(src) {
  if (typeof Image === 'undefined') return;
  if (!src && EDITION.store) { rareImg = null; rareReady = false; rareWaiters.forEach((f) => f()); return; }   // store app: drawn character
  const im = new Image();
  im.onload = () => { rareImg = im; rareReady = true; rareWaiters.forEach((f) => f()); };
  im.onerror = () => { if (src) setRareImage(null); };
  im.src = src || RARE_DEFAULT;
}
export function onRareReady(f) { rareWaiters.push(f); if (rareReady) f(); }
// store app's own レアキャラ: a shining golden rice ball (the family version shows a photo instead)
function luckyOnigiri(ctx, r, e) {
  ctx.save();
  const sky = ctx.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
  sky.addColorStop(0, '#fff8d6'); sky.addColorStop(1, '#ffd36b');
  ctx.fillStyle = sky; ctx.fillRect(-r, -r, 2 * r, 2 * r);
  // rays
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  for (let i = 0; i < 12; i++) { ctx.save(); ctx.rotate((i * Math.PI) / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-r * 0.12, -r * 1.1); ctx.lineTo(r * 0.12, -r * 1.1); ctx.closePath(); ctx.fill(); ctx.restore(); }
  const k = 0.82;
  ctx.translate(0, r * 0.08);
  const tri = () => blob(ctx, r * k, (a) => 0.93 + 0.08 * Math.cos(3 * (a + Math.PI / 2)));
  tri();
  ctx.fillStyle = radial(ctx, r * k, '#fffbe0', '#ffd84a', '#d99a12', -0.25, -0.4); ctx.fill();
  ctx.save(); ctx.clip();
  const ng = ctx.createLinearGradient(-r * 0.3, 0, r * 0.3, 0); ng.addColorStop(0, '#1d2a28'); ng.addColorStop(0.5, '#33504a'); ng.addColorStop(1, '#1d2a28');
  ctx.fillStyle = ng; roundRect(ctx, -r * 0.32, r * 0.36, r * 0.64, r * 0.6, r * 0.06); ctx.fill();
  ctx.restore();
  tri(); outline(ctx, r * k, '#b0700a', 0.07);
  gloss(ctx, r * k, -0.35, -0.35, 0.3, 0.16, 0.8);
  face(ctx, r * k, e === 'normal' || e === 'blink' ? 'happy' : e, { y: -0.12, gap: 0.3, mouth: 'open', sparkle: true, blush: 1.3 });
  ctx.restore();
}
DRAW.rare = (ctx, r, e, T) => {
  // soft golden glow behind
  const glow = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.28);
  glow.addColorStop(0, 'rgba(255,220,90,0.9)'); glow.addColorStop(1, 'rgba(255,220,90,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 1.28, 0, Math.PI * 2); ctx.fill();
  // the photo
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2); ctx.clip();
  if (!rareReady && EDITION.store) luckyOnigiri(ctx, r * 0.88, e);
  else if (rareReady) {
    // cover the circle with the middle of the picture, whatever its shape
    const k = (r * 1.76) / Math.min(rareImg.width, rareImg.height);
    ctx.drawImage(rareImg, -rareImg.width * k / 2, -rareImg.height * k / 2, rareImg.width * k, rareImg.height * k);
  }
  else { ctx.fillStyle = '#ffe9a0'; ctx.fillRect(-r, -r, 2 * r, 2 * r); }
  if (e === 'sad') { ctx.fillStyle = 'rgba(90,100,130,0.35)'; ctx.fillRect(-r, -r, 2 * r, 2 * r); }
  ctx.restore();
  // gold frame
  const ring = ctx.createLinearGradient(-r, -r, r, r);
  ring.addColorStop(0, '#fff3a0'); ring.addColorStop(0.35, '#ffcf3a'); ring.addColorStop(0.7, '#e09a12'); ring.addColorStop(1, '#ffe27a');
  ctx.beginPath(); ctx.arc(0, 0, r * 0.94, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.14; ctx.strokeStyle = ring; ctx.stroke();
  ctx.lineWidth = Math.max(1, r * 0.04); ctx.strokeStyle = '#9a6206';
  ctx.beginPath(); ctx.arc(0, 0, r * 1.01, 0, Math.PI * 2); ctx.stroke();
  // sparkles and a little star badge
  ctx.fillStyle = '#ffffff';
  for (const [x, y, k] of [[-0.78, -0.62, 0.2], [0.82, 0.5, 0.16], [-0.6, 0.86, 0.12]]) { ctx.save(); ctx.translate(x * r, y * r); star4(ctx, k * r); ctx.restore(); }
  ctx.save(); ctx.translate(r * 0.66, -r * 0.7);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = (i % 2 ? 0.13 : 0.3) * r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = '#ff5f7e'; ctx.fill(); ctx.lineWidth = Math.max(1, r * 0.04); ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.restore();
};

export function drawChar(ctx, tier, r, expr = 'normal') {
  const img = renderSprite(tier, expr, r);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
}

// Draws straight into ctx; ctx must be transparent around the character.
function drawCharLayer(ctx, tier, r, expr) {
  const T = tierInfo(tier);
  ctx.save();
  DRAW[T.id](ctx, r, expr, T);
  // gentle bottom shading for a soft 3D feel
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = shadow(ctx, r);
  ctx.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
  // soft rim light around the edge (keeps the face untouched) for a plump, glossy look
  const rim = ctx.createRadialGradient(r * 0.1, r * 0.15, r * 0.7, 0, 0, r * 1.05);
  rim.addColorStop(0, 'rgba(255,255,255,0)'); rim.addColorStop(0.75, 'rgba(255,250,240,0.16)'); rim.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rim;
  ctx.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
  ctx.restore();
}

// Sprite cache: pre-rendered character images per (tier, expression, pixel radius).
export class Sprites {
  constructor() { this.cache = new Map(); this.px = 1; }
  setScale(px) { if (Math.abs(px - this.px) > 0.001) { this.px = px; this.cache.clear(); } }
  // render a few not-yet-cached sprites (call once per frame) so none is drawn for the first time mid-action
  warm(n = 3) {
    for (let t = 0; t < TIERS.length && n > 0; t++) {
      for (const e of EXPRESSIONS) {
        if (!this.cache.has(t * 16 + EXPRESSIONS.indexOf(e))) { this.get(t, e); if (--n <= 0) return false; }
      }
    }
    return n > 0;
  }
  get(tier, expr) {
    const key = tier * 16 + EXPRESSIONS.indexOf(expr);
    let c = this.cache.get(key);
    if (!c) { c = renderSprite(tier, expr, tierInfo(tier).r * this.px); this.cache.set(key, c); }
    return c;
  }
}

export function renderSprite(tier, expr, pr, { silhouette = false, dom = false } = {}) {
  const size = Math.ceil(pr * SPRITE_PAD * 2) + 2;
  const c = typeof OffscreenCanvas !== 'undefined' && !dom ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = c.getContext('2d');
  ctx.translate(size / 2, size / 2);
  drawCharLayer(ctx, tier, pr, expr);
  if (silhouette) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#c9b8a4'; ctx.fillRect(0, 0, size, size);
  }
  return c;
}
