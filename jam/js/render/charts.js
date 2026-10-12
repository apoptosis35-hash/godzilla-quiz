// Analysis charts drawn from the simulation data:
//  - space-time diagram (each dot: one vehicle at one moment, colour = speed)
//  - flow-density diagram (Edie's definitions per road section) with the
//    theoretical equilibrium curve of the car-following model
//  - time series of mean speed (player vs. untouched twin)
import { heatColor } from './sprites.js';
import { idmFundamental } from '../sim/models.js';

export class SpaceTime {
  constructor(cols = 360, rows = 220) {
    this.W = cols; this.H = rows;
    this.cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(cols, rows) : Object.assign(document.createElement('canvas'), { width: cols, height: rows });
    this.c = this.cv.getContext('2d');
    this.reset();
  }
  reset() { this.col = 0; this.n = 0; this.lastT = -1; this.c.fillStyle = '#081320'; this.c.fillRect(0, 0, this.W, this.H); }
  // sample every 0.5 s of simulated time
  sample(sim, ri = 0) {
    const t = sim.st.t;
    if (this.lastT >= 0 && t - this.lastT < 0.5 - 1e-6) return;
    this.lastT = t;
    const road = sim.roads[ri], c = this.c, x = this.col;
    c.fillStyle = '#081320'; c.fillRect(x, 0, 1, this.H);
    const vRef = road.vRef || sim.def.vRef || sim.p.v0;
    for (const arr of sim.L[ri]) for (const v of arr) {
      const y = this.H - 1 - Math.floor((v.s / road.length) * (this.H - 1));
      c.fillStyle = heatColor(v.v / vRef);
      c.fillRect(x, y - 1, 1, 2);
    }
    this.col = (this.col + 1) % this.W; this.n++;
    this.road = road; this.t = t;
  }
  draw(ctx, w, h, sim) {
    ctx.fillStyle = '#081320'; ctx.fillRect(0, 0, w, h);
    const L = 34, B = 18, T = 6, R = 6;
    const pw = w - L - R, ph = h - B - T;
    ctx.imageSmoothingEnabled = false;
    if (this.n >= this.W) {
      const a = this.col; // oldest column
      const wa = this.W - a;
      ctx.drawImage(this.cv, a, 0, wa, this.H, L, T, (pw * wa) / this.W, ph);
      ctx.drawImage(this.cv, 0, 0, a, this.H, L + (pw * wa) / this.W, T, (pw * a) / this.W, ph);
    } else {
      ctx.drawImage(this.cv, 0, 0, this.W, this.H, L, T, pw, ph);
    }
    ctx.imageSmoothingEnabled = true;
    axes(ctx, L, T, pw, ph);
    ctx.fillStyle = '#8fb3c9'; ctx.font = '10px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const len = this.road ? this.road.length : 0;
    ctx.fillText(`${Math.round(len)}m`, L - 3, T + 4); ctx.fillText('0', L - 3, T + ph - 2);
    ctx.save(); ctx.translate(10, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('位置 →', 0, 0); ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`時間 → （直近 ${this.W / 2} 秒）`, L + pw / 2, T + ph + 4);
  }
}

export function drawFD(ctx, w, h, sim) {
  ctx.fillStyle = '#081320'; ctx.fillRect(0, 0, w, h);
  const L = 40, B = 30, T = 8, R = 8;
  const pw = w - L - R, ph = h - B - T;
  const P = sim.p;
  const curve = idmFundamental(P.v0, P.T, 2, 1.3, 4.6);
  const kMax = 160;
  let qMax = 2400;
  for (const p of sim.st.fd) qMax = Math.max(qMax, p.q * 1.05);
  for (const p of curve) qMax = Math.max(qMax, p.q * 1.05);
  const X = (k) => L + (k / kMax) * pw, Y = (q) => T + ph - (q / qMax) * ph;
  axes(ctx, L, T, pw, ph);
  // grid
  ctx.strokeStyle = 'rgba(120,170,200,0.12)'; ctx.lineWidth = 1;
  for (let q = 500; q < qMax; q += 500) { ctx.beginPath(); ctx.moveTo(L, Y(q)); ctx.lineTo(L + pw, Y(q)); ctx.stroke(); }
  // theory
  ctx.strokeStyle = 'rgba(63,224,255,0.75)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
  ctx.beginPath(); curve.forEach((p, i) => (i ? ctx.lineTo(X(p.k), Y(p.q)) : ctx.moveTo(X(p.k), Y(p.q)))); ctx.stroke(); ctx.setLineDash([]);
  // measurements (recent are brighter)
  const pts = sim.st.fd, n = pts.length;
  const vRef = sim.def.vRef || sim.p.v0;
  pts.forEach((p, i) => {
    if (p.k > kMax) return;
    ctx.globalAlpha = 0.25 + 0.75 * (i / Math.max(1, n - 1));
    ctx.fillStyle = heatColor((p.v || 0) / (vRef * 3.6) * 1);
    ctx.beginPath(); ctx.arc(X(p.k), Y(p.q), 2.4, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#8fb3c9'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let k = 0; k <= kMax; k += 40) ctx.fillText(String(k), X(k), T + ph + 3);
  ctx.fillText('密度 k（台/km/車線）', L + pw / 2, T + ph + 15);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let q = 0; q < qMax; q += 1000) ctx.fillText(String(q), L - 4, Y(q));
  ctx.save(); ctx.translate(9, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('交通流率 q（台/時/車線）', 0, 0); ctx.restore();
  ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(63,224,255,0.9)';
  ctx.fillText('--- 理論（一様な流れ）', L + pw - 2, T + 2);
  ctx.fillStyle = '#c9d6e2'; ctx.fillText('● 実測（区間ごと）', L + pw - 2, T + 15);
}

export function drawSeries(ctx, w, h, series, base, label = '平均速度（km/h）') {
  ctx.fillStyle = '#081320'; ctx.fillRect(0, 0, w, h);
  const L = 34, B = 18, T = 8, R = 8;
  const pw = w - L - R, ph = h - B - T;
  const all = series.concat(base || []);
  const max = Math.max(20, ...all.map((p) => p[1])) * 1.1;
  const t0 = all.length ? Math.min(...all.map((p) => p[0])) : 0, t1 = all.length ? Math.max(t0 + 10, ...all.map((p) => p[0])) : 60;
  const X = (t) => L + ((t - t0) / (t1 - t0)) * pw, Y = (v) => T + ph - (v / max) * ph;
  axes(ctx, L, T, pw, ph);
  const line = (arr, col, dash) => { if (!arr || arr.length < 2) return; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dash || []); ctx.beginPath(); arr.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke(); ctx.setLineDash([]); };
  line(base, 'rgba(255,140,90,0.85)', [5, 4]);
  line(series, '#3ddc84');
  ctx.fillStyle = '#8fb3c9'; ctx.font = '10px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = 0; v < max; v += max > 80 ? 40 : 20) ctx.fillText(String(v), L - 4, Y(v));
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#3ddc84'; ctx.fillText('━ ' + label + (base ? '（対策あり）' : ''), L + 4, T + 2);
  if (base) { ctx.fillStyle = 'rgba(255,140,90,0.95)'; ctx.fillText('┅ 対策なし（同じ条件）', L + 4, T + 15); }
  ctx.textAlign = 'center'; ctx.fillStyle = '#8fb3c9'; ctx.fillText('時間 →', L + pw / 2, T + ph + 4);
}

function axes(ctx, L, T, pw, ph) {
  ctx.strokeStyle = 'rgba(160,200,225,0.45)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.lineTo(L + pw, T + ph); ctx.stroke();
}
