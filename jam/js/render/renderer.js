// Canvas 2D renderer for the traffic diorama. Reads the simulation state only.
import { buildLayout, place, laneOffset, LANE_W } from './layout.js';
import { vehicleSprite, glowSprite, beamSprite, treeSprite, heatColor, heatBucket, HEAT_BUCKETS, CAR_COLORS, setSpriteScale } from './sprites.js';
import { DT } from '../sim/engine.js';
import { hash32, rnd } from '../sim/rng.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this.quality = 2;
    this.dprMax = 2;
    this.opts = { mode: 'real', night: false, chain: true, waves: true, selected: 0, highlight: null, follow: false };
    this.asphalt = makeNoise(128, [40, 44, 52], 10);
    this.grass = makeNoise(256, [19, 38, 46], 9);
    this.frameMs = 16; this.slow = 0; this.fast = 0;
  }

  setSim(sim) {
    const changed = !this.sim || this.sim.def !== sim.def;
    this.sim = sim;
    if (changed) this.relayout();
  }

  relayout() {
    if (!this.sim) return;
    const r = this.cv.getBoundingClientRect();
    this.cssW = Math.max(50, r.width); this.cssH = Math.max(50, r.height);
    this.lay = buildLayout(this.sim.def, this.cssW / this.cssH);
    this.buildStatic();
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(this.dprMax, window.devicePixelRatio || 1) * (this.quality === 0 ? 0.75 : 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.dpr = dpr;
    const aspectChanged = this.cssW && Math.abs(r.width / r.height - this.cssW / this.cssH) > 0.05;
    this.cssW = r.width; this.cssH = r.height;
    if (aspectChanged) this.relayout();
    setSpriteScale(dpr >= 1.5 ? 2 : 1.4);
  }

  // world -> screen transform
  view() {
    const b = this.lay.bounds;
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const s0 = Math.min(this.cssW / bw, this.cssH / bh);
    const s = s0 * this.zoom;
    let cx = (b.x0 + b.x1) / 2 + this.panX, cy = (b.y0 + b.y1) / 2 + this.panY;
    if (this.opts.follow && this.opts.selected) {
      const v = this.sim.st.vehicles.find((x) => x.id === this.opts.selected);
      if (v) { const p = this.vehPos(v, 0); cx = p.x; cy = p.y; this.panX = cx - (b.x0 + b.x1) / 2; this.panY = cy - (b.y0 + b.y1) / 2; }
    }
    return { s, s0, tx: this.cssW / 2 - cx * s, ty: this.cssH / 2 - cy * s };
  }

  toWorld(px, py) { const v = this.view(); return { x: (px - v.tx) / v.s, y: (py - v.ty) / v.s }; }

  clampPan() {
    const b = this.lay.bounds;
    const mx = (b.x1 - b.x0) / 2, my = (b.y1 - b.y0) / 2;
    this.panX = Math.max(-mx, Math.min(mx, this.panX)); this.panY = Math.max(-my, Math.min(my, this.panY));
    this.zoom = Math.max(0.6, Math.min(12, this.zoom));
  }

  // ---------- static scene (Path2D in world units) ----------
  buildStatic() {
    const sim = this.sim, lay = this.lay;
    this.stat = [];
    sim.roads.forEach((road, ri) => {
      const geo = lay.geos[ri];
      const nl = road.lanes.length;
      const P = { lanes: [], marks: [], solid: [], edgeL: null, edgeR: null, shoulder: null, merge: [] };
      const step = 3;
      const full = (off, a, b) => offsetPath(geo, road, a, b, off, step, sim.roads[ri].closed && a === 0 && b >= road.length);
      // lane surfaces
      road.lanes.forEach((ln, li) => { P.lanes.push({ p: full(laneOffset(road, li), ln.from, ln.to), w: LANE_W + 0.08, li, ln }); });
      // continuous through lanes = lanes that span the full road
      const through = road.lanes.map((ln, li) => ({ ln, li })).filter((x) => x.ln.from <= 0.1 && x.ln.to >= road.length - 0.1);
      const tl = through.map((x) => x.li);
      const lmin = Math.min(...tl), lmax = Math.max(...tl);
      P.edgeR = full(laneOffset(road, lmax) - LANE_W / 2 + 0.3, 0, road.length);
      P.edgeL = full(laneOffset(road, lmin) + LANE_W / 2 - 0.3, 0, road.length);
      P.shoulderL = full(laneOffset(road, lmin) + LANE_W / 2 + 1.0, 0, road.length);
      P.shoulderR = full(laneOffset(road, lmax) - LANE_W / 2 - 0.9, 0, road.length);
      P.width = (lmax - lmin + 1) * LANE_W;
      P.center = full((laneOffset(road, lmin) + laneOffset(road, lmax)) / 2, 0, road.length);
      // dashed separators between neighbouring lanes where both exist
      for (let li = 0; li < nl - 1; li++) {
        const a = road.lanes[li], b = road.lanes[li + 1];
        const from = Math.max(a.from, b.from), to = Math.min(a.to, b.to);
        if (to - from < 1) continue;
        const off = laneOffset(road, li) - LANE_W / 2;
        const p = full(off, from, to);
        if (a.merge || b.merge) P.merge.push(p); else P.marks.push(p);
      }
      // left edge line of non-through lanes (acceleration lane / ending lane)
      road.lanes.forEach((ln, li) => {
        if (tl.includes(li) && !(ln.to < road.length - 0.1)) return;
        if (li < lmin || ln.to < road.length - 0.1) {
          P.solid.push(full(laneOffset(road, li) + LANE_W / 2 - 0.3, ln.from, ln.to));
        }
      });
      this.stat.push(P);
    });
    // decorations: trees away from roads
    this.trees = [];
    const b = lay.bounds;
    const r = { s: hash32(sim.def.seed || 1, 77) };
    const area = (b.x1 - b.x0) * (b.y1 - b.y0);
    const n = Math.min(240, Math.round(area / 900));
    const near = (x, y, d) => {
      for (let ri = 0; ri < sim.roads.length; ri++) {
        const g = lay.geos[ri].path;
        for (let i = 0; i < g.x.length; i += 3) { const dx = g.x[i] - x, dy = g.y[i] - y; if (dx * dx + dy * dy < d * d) return true; }
      }
      return false;
    };
    for (let i = 0; i < n * 3 && this.trees.length < n; i++) {
      const x = b.x0 - 40 + rnd(r) * (b.x1 - b.x0 + 80), y = b.y0 - 40 + rnd(r) * (b.y1 - b.y0 + 80);
      const v = Math.floor(rnd(r) * 3);
      if (lay.kind === 'ring' && Math.hypot(x, y) < lay.R - 16 && Math.hypot(x, y) > lay.R * 0.55) { if (rnd(r) < 0.5) continue; }
      if (lay.kind === 'ring' && Math.hypot(x, y) < lay.R * 0.55) continue;
      if (near(x, y, 16)) continue;
      this.trees.push({ x, y, v });
    }
    // street lamps for night mode
    this.lamps = [];
    sim.roads.forEach((road, ri) => {
      if (road.ramp) return;
      const geo = lay.geos[ri];
      const P = this.stat[ri];
      for (let s = 20; s < road.length - 5; s += 70) {
        const p = geo.path.at(s);
        const off = laneOffset(road, road.lanes.length - 1) - LANE_W / 2 - 2.2;
        this.lamps.push({ x: p.x + p.hy * off, y: p.y - p.hx * off });
      }
      void P;
    });
  }

  // ---------- vehicle placement ----------
  vehPos(v, alpha) {
    const sim = this.sim, road = sim.roads[v.road], geo = this.lay.geos[v.road];
    let s = v.s + v.v * alpha * DT;
    let r = road, g = geo, lat = v.lat;
    if (s > road.length) {
      if (road.closed) s -= road.length;
      else if (road.link) { const lk = road.link; r = sim.roads[lk.road]; g = this.lay.geos[lk.road]; s = lk.s + (s - road.length); lat = lk.lane; }
      else s = road.length + (s - road.length);
    }
    const p = place(g, r, s, lat);
    let ang = Math.atan2(p.hy, p.hx);
    if (v.latT < 1 && v.v > 0.5) {
      const e = v.latT, d = (v.lane - v.latFrom) * 6 * e * (1 - e) / 3 * LANE_W;
      ang += Math.atan2(d, v.v);
    }
    return { x: p.x, y: p.y, ang };
  }

  pick(px, py) {
    if (!this.sim) return null;
    const w = this.toWorld(px, py);
    let best = null, bd = 1e9;
    const v = this.view();
    const tol = Math.max(5, 24 / v.s);
    for (const veh of this.sim.st.vehicles) {
      const p = this.vehPos(veh, this.alpha || 0);
      const d = Math.hypot(p.x - w.x, p.y - w.y);
      if (d < bd) { bd = d; best = veh; }
    }
    return best && bd < tol ? best : null;
  }

  // ---------- frame ----------
  frame(alpha, now) {
    if (!this.cv.width || !this.cv.height || !this.lay) return; // hidden screen
    const t0 = performance.now();
    this.alpha = alpha;
    const c = this.ctx, sim = this.sim, o = this.opts;
    const dpr = this.dpr || 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const night = o.night;
    c.fillStyle = night ? '#060b16' : '#0d1b2a';
    c.fillRect(0, 0, this.cssW, this.cssH);
    const V = this.view();
    c.setTransform(dpr * V.s, 0, 0, dpr * V.s, dpr * V.tx, dpr * V.ty);
    const ppm = V.s; // css pixels per metre
    // ground texture
    const b = this.lay.bounds;
    c.save();
    if (this.quality > 0) {
      const pat = c.createPattern(this.grass, 'repeat');
      if (pat.setTransform) pat.setTransform(new DOMMatrix().scaleSelf(0.5, 0.5));
      c.fillStyle = pat; c.globalAlpha = night ? 0.5 : 1;
      c.fillRect(b.x0 - 400, b.y0 - 400, b.x1 - b.x0 + 800, b.y1 - b.y0 + 800);
    }
    c.restore();
    if (this.lay.kind === 'ring') this.drawRingInfield(c);
    // trees (shadows included)
    if (this.quality > 0) for (const t of this.trees) { const sp = treeSprite(t.v); c.globalAlpha = night ? 0.55 : 1; c.drawImage(sp.cv, t.x - sp.r, t.y - sp.r, sp.r * 2, sp.r * 2); }
    c.globalAlpha = 1;
    this.drawRoads(c, ppm, night);
    this.drawFeatures(c, now, ppm);
    if (o.waves && (o.mode === 'wave')) this.drawJamBands(c);
    this.drawVehicles(c, alpha, now, ppm, night);
    this.drawRoofs(c);
    if (o.chain) this.drawChains(c, alpha, now);
    if (o.waves && o.mode === 'wave') this.drawWaveArrows(c, ppm);
    if (o.highlight) this.drawHighlight(c, now, ppm);
    this.drawSelection(c, alpha, now, ppm);
    if (night) this.drawNight(c, alpha, ppm);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // adaptive quality
    const ms = performance.now() - t0;
    this.frameMs = this.frameMs * 0.95 + ms * 0.05;
    if (this.frameMs > 14) { this.slow++; this.fast = 0; } else if (this.frameMs < 6) { this.fast++; this.slow = 0; }
    if (this.slow > 90 && this.quality > 0) { this.quality--; this.slow = 0; this.resize(); }
    if (this.fast > 600 && this.quality < 2) { this.quality++; this.fast = 0; this.resize(); }
  }

  drawRingInfield(c) {
    const R = this.lay.R;
    c.save();
    const g = c.createRadialGradient(0, 0, 0, 0, 0, R - 6);
    g.addColorStop(0, 'rgba(24,52,64,0.9)'); g.addColorStop(1, 'rgba(16,36,48,0.9)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R - 6, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(80,200,230,0.10)'; c.lineWidth = 0.4;
    for (let r = 8; r < R - 8; r += 8) { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
    c.font = `600 ${R * 0.13}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(120,220,255,0.22)'; c.fillText('JAM LAB', 0, -R * 0.06);
    c.font = `500 ${R * 0.06}px system-ui, sans-serif`; c.fillStyle = 'rgba(120,220,255,0.18)';
    c.fillText(`円周 ${Math.round(this.sim.roads[0].length)} m`, 0, R * 0.1);
    c.restore();
  }

  drawRoads(c, ppm, night) {
    const sim = this.sim;
    c.lineCap = 'butt'; c.lineJoin = 'round';
    // shoulders, guard rails and median first
    sim.roads.forEach((road, ri) => {
      const P = this.stat[ri];
      c.strokeStyle = night ? '#1b222c' : '#2a323d'; c.lineWidth = P.width + 4.2;
      c.stroke(P.center);
      if (!road.ramp && this.lay.kind !== 'cross') {
        c.strokeStyle = night ? '#3c4654' : '#8d99a8'; c.lineWidth = 0.35; c.stroke(P.shoulderR);
        c.strokeStyle = night ? '#2c5a3e' : '#2f6b48'; c.lineWidth = 1.2;
        if (this.lay.kind !== 'ring') c.stroke(offsetPathFromP(P.shoulderR)); // median hedge drawn on the right
      }
    });
    // asphalt
    const pat = this.quality > 0 ? c.createPattern(this.asphalt, 'repeat') : null;
    if (pat && pat.setTransform) pat.setTransform(new DOMMatrix().scaleSelf(0.12, 0.12));
    sim.roads.forEach((road, ri) => {
      const P = this.stat[ri];
      for (const L of P.lanes) {
        c.strokeStyle = pat || '#2f3640'; c.lineWidth = L.w;
        if (L.ln.shoulder && !sim.pol.shoulder) { c.strokeStyle = night ? '#232a33' : '#39424e'; }
        c.stroke(L.p);
      }
    });
    if (this.lay.kind === 'cross') this.drawCrossBox(c, night);
    if (this.opts.mode !== 'real') this.drawHeat(c);
    // markings
    const white = night ? 'rgba(230,236,245,0.55)' : 'rgba(238,242,248,0.85)';
    sim.roads.forEach((road, ri) => {
      const P = this.stat[ri];
      c.strokeStyle = white; c.lineWidth = 0.15; c.setLineDash([]);
      c.stroke(P.edgeR); c.stroke(P.edgeL);
      for (const s of P.solid) c.stroke(s);
      c.setLineDash([8, 12]); c.lineWidth = 0.15;
      for (const m of P.marks) c.stroke(m);
      c.setLineDash([2.5, 2.5]); c.lineWidth = 0.4;
      for (const m of P.merge) c.stroke(m);
      c.setLineDash([]);
    });
  }

  drawCrossBox(c, night) {
    const X = this.sim.def.cross.box / 2 + 1;
    c.fillStyle = night ? '#232932' : '#323a45';
    c.fillRect(-X - 1, -X - 1, 2 * X + 2, 2 * X + 2);
    // crosswalks
    c.fillStyle = night ? 'rgba(220,226,235,0.4)' : 'rgba(235,240,246,0.75)';
    for (let k = -X + 1; k < X - 1; k += 1.6) {
      c.fillRect(k, -X - 3.5, 0.8, 3); c.fillRect(k, X + 0.5, 0.8, 3);
      c.fillRect(-X - 3.5, k, 3, 0.8); c.fillRect(X + 0.5, k, 3, 0.8);
    }
  }

  // speed field painted on the road (like a traffic map)
  drawHeat(c) {
    const sim = this.sim;
    const vRefDef = sim.def.vRef || sim.p.v0;
    sim.roads.forEach((road, ri) => {
      if (!road.measure && !road.ramp) return;
      const bin = 10, n = Math.ceil(road.length / bin);
      const sum = new Float32Array(n), cnt = new Uint16Array(n);
      for (const arr of sim.L[ri]) for (const v of arr) { const k = Math.min(n - 1, Math.max(0, Math.floor(v.s / bin))); sum[k] += v.v; cnt[k]++; }
      // spread each measurement to neighbouring bins
      const val = new Float32Array(n).fill(-1);
      for (let k = 0; k < n; k++) {
        let s = 0, w = 0;
        for (let d = -3; d <= 3; d++) { let j = k + d; if (road.closed) j = (j + n) % n; if (j < 0 || j >= n || !cnt[j]) continue; const ww = 1 / (1 + Math.abs(d)); s += (sum[j] / cnt[j]) * ww; w += ww; }
        if (w > 0) val[k] = s / w;
      }
      const P = this.stat[ri], geo = this.lay.geos[ri];
      const vRef = road.vRef || vRefDef;
      c.lineWidth = P.width + 1.2;
      for (let k = 0; k < n; k++) {
        if (val[k] < 0) continue;
        c.strokeStyle = mixAsphalt(heatColor(val[k] / vRef), 0.42);
        const a = k * bin, b2 = Math.min(road.length, (k + 1) * bin + 0.6);
        const mid = (laneOffset(road, 0) + laneOffset(road, road.lanes.length - 1)) / 2;
        c.stroke(offsetPath(geo, road, a, b2, mid, 3, false));
      }
    });
  }

  drawFeatures(c, now, ppm) {
    const sim = this.sim, def = sim.def;
    sim.roads.forEach((road, ri) => {
      const geo = this.lay.geos[ri];
      const nl = road.lanes.length;
      const edge = laneOffset(road, nl - 1) - LANE_W / 2 - 3.2;
      const edgeL = laneOffset(road, 0) + LANE_W / 2 + 3.5;
      // grade: chevrons on the shoulder + label
      if (road.grades) for (const g of road.grades) {
        const up = g.g > 0;
        c.fillStyle = up ? 'rgba(255,150,60,0.55)' : 'rgba(80,200,255,0.4)';
        for (let s = g.from + 10; s < g.to - 5; s += 14) {
          const p = geo.path.at(s), n = { x: p.hy, y: -p.hx };
          const x = p.x + n.x * edge, y = p.y + n.y * edge;
          c.save(); c.translate(x, y); c.rotate(Math.atan2(p.hy, p.hx));
          c.beginPath(); c.moveTo(1.6, 0); c.lineTo(-0.6, -1.1); c.lineTo(-0.2, 0); c.lineTo(-0.6, 1.1); c.closePath(); c.fill(); c.restore();
        }
        this.label(c, geo, (g.from + g.to) / 2, edge - 5, `${up ? '上り' : '下り'} ${Math.abs(g.g * 100).toFixed(1)}%`, up ? '#ffb070' : '#7fd8ff', ppm);
      }
      // lane end: zebra taper + sign
      road.lanes.forEach((ln, li) => {
        if (ln.to >= road.length - 0.1) return;
        if (ln.shoulder && sim.pol.shoulder) { this.label(c, geo, ln.to - 260, edgeL + 4, '路肩走行中 70', '#7fe3ff', ppm); return; }
        const off = laneOffset(road, li);
        c.fillStyle = 'rgba(240,240,240,0.55)';
        for (let s = ln.to - 30; s < ln.to; s += 3) {
          const p = place(geo, road, s, li);
          c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(p.hy, p.hx) + 0.6); c.fillRect(-0.15, -LANE_W / 2 + 0.3, 0.5, LANE_W - 0.6); c.restore();
        }
        void off;
        if (!ln.merge) this.label(c, geo, ln.to - 350, edgeL + 4, '車線減少 →', '#ffd166', ppm);
      });
      // signals
      if (road.signal) {
        const st = sim.signalState(road);
        const p = place(geo, road, road.signal.s, road.lanes.length - 1);
        const q = place(geo, road, road.signal.s, 0);
        c.strokeStyle = 'rgba(245,245,245,0.9)'; c.lineWidth = 0.5;
        const n = { x: p.hy, y: -p.hx };
        c.beginPath(); c.moveTo(p.x - n.x * LANE_W / 2, p.y - n.y * LANE_W / 2); c.lineTo(q.x + n.x * LANE_W / 2, q.y + n.y * LANE_W / 2); c.stroke();
        const hx = q.x + n.x * (LANE_W / 2 + 2.2), hy = q.y + n.y * (LANE_W / 2 + 2.2);
        const meter = road.signal.group === 'meter';
        const metered = meter && (sim.pol.meter[road.id] || 0) > 0;
        const col = meter && !metered ? '#556070' : st === 'G' ? '#3ddc84' : st === 'Y' ? '#ffd23f' : '#ff4757';
        c.fillStyle = '#0b0f16'; c.beginPath(); c.arc(hx, hy, 1.6, 0, TAU); c.fill();
        c.fillStyle = col; c.beginPath(); c.arc(hx, hy, 1.0, 0, TAU); c.fill();
        if (!meter || metered) { c.globalCompositeOperation = 'lighter'; const gs = glowSprite(st === 'G' ? '61,220,132' : st === 'Y' ? '255,210,63' : '255,71,87'); c.drawImage(gs.cv, hx - 5, hy - 5, 10, 10); c.globalCompositeOperation = 'source-over'; }
        if (meter && metered) this.label(c, geo, road.signal.s - 18, laneOffset(road, 0) + 7, `メーター ${sim.pol.meter[road.id]}台/時`, '#ffd166', ppm);
      }
      // speed limit sign of the VSL zone
      if (def.vslZone && def.vslZone.road === road.id && sim.pol.vsl > 0) {
        for (const s of [def.vslZone.from, (def.vslZone.from + def.vslZone.to) / 2]) {
          const p = geo.path.at(s), n = { x: p.hy, y: -p.hx };
          const x = p.x + n.x * edgeL, y = p.y + n.y * edgeL;
          c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill();
          c.strokeStyle = '#e63946'; c.lineWidth = 0.6; c.stroke();
          c.fillStyle = '#123'; c.font = '700 2.4px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(String(Math.round(sim.pol.vsl * 3.6)), x, y + 0.1);
        }
      }
      // sag information board
      if (road.grades && sim.pol.sagInfo) for (const g of road.grades) if (g.g > 0) this.label(c, geo, g.from - 40, edgeL + 4, '上り坂 速度回復', '#7fe3ff', ppm);
    });
    // accidents
    if (def.blockages) for (const bk of def.blockages) {
      if (sim.st.t < bk.t0 || sim.st.t >= bk.t1) continue;
      const ri = sim.byId[bk.road], road = sim.roads[ri], geo = this.lay.geos[ri];
      const p = place(geo, road, bk.s + 2.3, bk.lane);
      const sp = vehicleSprite('car', 4.6, 1.8, '#c9ced6', false);
      c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(p.hy, p.hx) + 0.35); c.drawImage(sp.cv, -sp.w / 2, -sp.h / 2, sp.w, sp.h); c.restore();
      const on = Math.floor(now / 400) % 2 === 0;
      if (on) { c.globalCompositeOperation = 'lighter'; const gs = glowSprite('255,170,40'); c.drawImage(gs.cv, p.x - 4, p.y - 4, 8, 8); c.globalCompositeOperation = 'source-over'; }
      for (let k = 1; k <= 3; k++) {
        const q = place(geo, road, bk.s - 6 * k, bk.lane + (k - 2) * 0.12);
        c.fillStyle = '#ff7a1a'; c.beginPath(); c.moveTo(q.x, q.y - 0.7); c.lineTo(q.x + 0.6, q.y + 0.5); c.lineTo(q.x - 0.6, q.y + 0.5); c.fill();
      }
    }
  }

  label(c, geo, s, off, text, color, ppm) {
    s = Math.max(0, Math.min(geo.path.length, s));
    const p = geo.path.at(s), n = { x: p.hy, y: -p.hx };
    const x = p.x + n.x * off, y = p.y + n.y * off;
    const fs = Math.max(2.6, 11 / ppm);
    c.font = `600 ${fs}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(text).width + fs * 0.8;
    c.fillStyle = 'rgba(8,16,28,0.78)'; roundRect(c, x - w / 2, y - fs * 0.75, w, fs * 1.5, fs * 0.4); c.fill();
    c.fillStyle = color; c.fillText(text, x, y + fs * 0.05);
  }

  drawVehicles(c, alpha, now, ppm, night) {
    const sim = this.sim, o = this.opts;
    const heat = o.mode === 'speed';
    const vRefDef = sim.def.vRef || sim.p.v0;
    const blinkOn = Math.floor(now / 330) % 2 === 0;
    const lights = [];
    for (const v of sim.st.vehicles) {
      const p = this.vehPos(v, alpha);
      v._p = p;
      const road = sim.roads[v.road];
      const key = heat ? heatColor((heatBucket(v.v / (road.vRef || vRefDef)) / (HEAT_BUCKETS - 1)) * 1.1) : CAR_COLORS[v.color];
      const sp = vehicleSprite(v.cls, v.len, v.wid, key, v.style === 'av');
      c.save(); c.translate(p.x, p.y); c.rotate(p.ang);
      // the vehicle position is its front bumper: shift the body back by half its length
      c.drawImage(sp.cv, -v.len / 2 - sp.w / 2, -sp.h / 2, sp.w, sp.h);
      c.restore();
      const brake = v.light;
      let blink = 0;
      if (v.intent) blink = Math.sign(v.intent.lane - v.lane); else if (v.latT < 1) blink = Math.sign(v.lane - v.latFrom);
      if (brake || (blink && blinkOn) || night) lights.push({ v, p, brake, blink: blinkOn ? blink : 0 });
    }
    // lights (additive)
    if (this.quality > 0 || lights.length < 200) {
      c.globalCompositeOperation = 'lighter';
      const red = glowSprite('255,40,50'), amber = glowSprite('255,170,40'), dim = glowSprite('160,20,30');
      for (const L of lights) {
        const { v, p } = L;
        const cos = Math.cos(p.ang), sin = Math.sin(p.ang);
        const rx = p.x - cos * v.len, ry = p.y - sin * v.len; // rear centre
        const nx = -sin * (v.wid / 2 - 0.3), ny = cos * (v.wid / 2 - 0.3);
        if (L.brake) {
          const sz = 2.6 + (v.a < -3 ? 1.4 : 0);
          c.globalAlpha = 0.95;
          c.drawImage(red.cv, rx + nx - sz / 2, ry + ny - sz / 2, sz, sz);
          c.drawImage(red.cv, rx - nx - sz / 2, ry - ny - sz / 2, sz, sz);
        } else if (night) {
          c.globalAlpha = 0.6;
          c.drawImage(dim.cv, rx + nx - 1, ry + ny - 1, 2, 2); c.drawImage(dim.cv, rx - nx - 1, ry - ny - 1, 2, 2);
        }
        if (L.blink) {
          // blink > 0: towards a higher lane index = to the right of travel
          const side = L.blink > 0 ? -1 : 1;
          const fx = p.x - cos * 0.4 + nx * side * 1.1, fy = p.y - sin * 0.4 + ny * side * 1.1;
          const bx = rx + nx * side * 1.1, by = ry + ny * side * 1.1;
          c.globalAlpha = 1;
          c.drawImage(amber.cv, fx - 1.4, fy - 1.4, 2.8, 2.8); c.drawImage(amber.cv, bx - 1.4, by - 1.4, 2.8, 2.8);
        }
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
  }

  drawRoofs(c) {
    // tunnels: translucent roof over the vehicles
    const sim = this.sim;
    sim.roads.forEach((road, ri) => {
      if (!road.zones) return;
      const geo = this.lay.geos[ri], P = this.stat[ri];
      for (const z of road.zones) {
        const mid = (laneOffset(road, 0) + laneOffset(road, road.lanes.length - 1)) / 2;
        const p = offsetPath(geo, road, z.from, z.to, mid, 3, false);
        c.strokeStyle = 'rgba(20,28,40,0.45)'; c.lineWidth = P.width + 5; c.stroke(p);
        c.strokeStyle = 'rgba(120,140,160,0.35)'; c.lineWidth = 0.5;
        c.stroke(offsetPath(geo, road, z.from, z.to, mid + P.width / 2 + 2.5, 3, false));
        c.stroke(offsetPath(geo, road, z.from, z.to, mid - P.width / 2 - 2.5, 3, false));
        for (const s of [z.from, z.to]) {
          const a = geo.path.at(s), n = { x: a.hy, y: -a.hx }, h = P.width / 2 + 3;
          c.strokeStyle = '#9aa7b6'; c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(a.x + n.x * (mid + h), a.y + n.y * (mid + h)); c.lineTo(a.x + n.x * (mid - h), a.y + n.y * (mid - h)); c.stroke();
        }
        this.label(c, geo, (z.from + z.to) / 2, mid, z.label || '速度低下区間', '#cfe3ff', this.view().s);
      }
    });
  }

  drawChains(c, alpha, now) {
    const sim = this.sim, t = sim.st.t;
    c.lineCap = 'round';
    for (const v of sim.st.vehicles) {
      if (!v.chain || t - v.chainT > 3.5 || !v._p) continue;
      const ch = sim.st.chains[v.chain];
      if (!ch || ch.size < 3) continue;
      const age = (t - v.chainT) / 3.5;
      const player = ch.player;
      const col = player ? '255,209,102' : '255,120,80';
      const p = v._p;
      const cx = p.x - Math.cos(p.ang) * v.len / 2, cy = p.y - Math.sin(p.ang) * v.len / 2;
      c.strokeStyle = `rgba(${col},${(1 - age) * 0.9})`; c.lineWidth = 0.5;
      c.beginPath(); c.arc(cx, cy, 3 + age * 4, 0, TAU); c.stroke();
      // link to the leader that passed the braking on
      const l = v.ahead && v.ahead.veh;
      if (v.depth > 0 && l && l.chain === v.chain && l._p) {
        const lx = l._p.x - Math.cos(l._p.ang) * l.len, ly = l._p.y - Math.sin(l._p.ang) * l.len;
        c.strokeStyle = `rgba(${col},${(1 - age) * 0.7})`; c.lineWidth = 0.6; c.setLineDash([1, 1.2]);
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(lx, ly); c.stroke(); c.setLineDash([]);
      }
    }
  }

  drawJamBands(c) {
    const sim = this.sim, cur = sim.cur;
    if (!cur) return;
    for (const cl of cur.clusters) {
      const road = sim.roads[cl.road], geo = this.lay.geos[cl.road], P = this.stat[cl.road];
      const mid = (laneOffset(road, 0) + laneOffset(road, road.lanes.length - 1)) / 2;
      c.strokeStyle = 'rgba(255,60,80,0.20)'; c.lineWidth = P.width + 6;
      const segs = road.closed && cl.head > road.length ? [[cl.tail, road.length], [0, cl.head - road.length]] : [[Math.max(0, cl.tail), Math.min(road.length, cl.head)]];
      for (const [a, b] of segs) if (b - a > 1) c.stroke(offsetPath(geo, road, a, b, mid, 3, false));
    }
  }

  drawWaveArrows(c, ppm) {
    const sim = this.sim;
    const fs = Math.max(2.4, 11 / ppm);
    for (const tr of sim.st.jam.tracks) {
      if (tr.n < 3 || tr.speed == null || sim.st.t - tr.born < 3) continue;
      const road = sim.roads[tr.road], geo = this.lay.geos[tr.road], P = this.stat[tr.road];
      const head = road.closed ? ((tr.head % road.length) + road.length) % road.length : tr.head;
      const off = laneOffset(road, road.lanes.length - 1) - LANE_W / 2 - 3 - P.width * 0 - 2;
      const kmh = tr.speed * 3.6;
      const back = kmh < -1;
      const fixed = Math.abs(kmh) < 3;
      // arrow along the road at the jam head, pointing in the direction the jam front moves
      const len = 18;
      const s1 = head, s2 = back ? head - len : head + len;
      const pa = geo.path.at(Math.max(0, Math.min(road.length, s1))), pb = geo.path.at(road.closed ? ((s2 % road.length) + road.length) % road.length : Math.max(0, Math.min(road.length, s2)));
      const na = { x: pa.hy, y: -pa.hx }, nb = { x: pb.hy, y: -pb.hx };
      const ax = pa.x + na.x * off, ay = pa.y + na.y * off, bx = pb.x + nb.x * off, by = pb.y + nb.y * off;
      c.strokeStyle = '#ff5468'; c.fillStyle = '#ff5468'; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      const an = Math.atan2(by - ay, bx - ax);
      c.beginPath(); c.moveTo(bx + Math.cos(an) * 2.5, by + Math.sin(an) * 2.5); c.lineTo(bx + Math.cos(an + 2.4) * 2.6, by + Math.sin(an + 2.4) * 2.6); c.lineTo(bx + Math.cos(an - 2.4) * 2.6, by + Math.sin(an - 2.4) * 2.6); c.closePath(); c.fill();
      const tx = (ax + bx) / 2 + na.x * (fs * 1.6), ty = (ay + by) / 2 + na.y * (fs * 1.6);
      c.font = `700 ${fs}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const text = fixed ? '渋滞の先頭（その場にとどまる）' : back ? `渋滞の波 ← 後ろへ ${(-kmh).toFixed(0)} km/h` : `渋滞の先頭が前へ ${kmh.toFixed(0)} km/h`;
      const w = c.measureText(text).width + fs;
      c.fillStyle = 'rgba(40,6,14,0.85)'; roundRect(c, tx - w / 2, ty - fs * 0.8, w, fs * 1.6, fs * 0.5); c.fill();
      c.fillStyle = '#ff8a98'; c.fillText(text, tx, ty + fs * 0.05);
    }
  }

  drawHighlight(c, now, ppm) {
    const h = this.opts.highlight, sim = this.sim;
    const road = sim.roads[h.road], geo = this.lay.geos[h.road];
    if (!road || !geo) return;
    const p = geo.path.at(Math.max(0, Math.min(road.length, h.s)));
    const ph = (now / 900) % 1;
    for (let k = 0; k < 3; k++) {
      const f = (ph + k / 3) % 1;
      c.strokeStyle = `rgba(80,230,255,${1 - f})`; c.lineWidth = 0.9;
      c.beginPath(); c.arc(p.x, p.y, 6 + f * 22, 0, TAU); c.stroke();
    }
    if (h.text) {
      const fs = Math.max(3, 12 / ppm);
      c.font = `700 ${fs}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const w = c.measureText(h.text).width + fs;
      c.fillStyle = 'rgba(6,20,32,0.9)'; roundRect(c, p.x - w / 2, p.y - 12 - fs * 1.8, w, fs * 1.6, fs * 0.5); c.fill();
      c.fillStyle = '#7fe3ff'; c.fillText(h.text, p.x, p.y - 12 - fs);
    }
  }

  drawSelection(c, alpha, now, ppm) {
    const id = this.opts.selected;
    if (!id) return;
    const v = this.sim.st.vehicles.find((x) => x.id === id);
    if (!v || !v._p) return;
    const p = v._p;
    const cx = p.x - Math.cos(p.ang) * v.len / 2, cy = p.y - Math.sin(p.ang) * v.len / 2;
    const r = v.len / 2 + 2 + Math.sin(now / 200) * 0.4;
    c.strokeStyle = '#3fe0ff'; c.lineWidth = Math.max(0.35, 1.6 / ppm);
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke();
    // gap to the vehicle ahead
    const l = v.ahead && v.ahead.veh;
    if (l && l._p && v.ahead.gap < 150) {
      const lx = l._p.x - Math.cos(l._p.ang) * l.len, ly = l._p.y - Math.sin(l._p.ang) * l.len;
      c.strokeStyle = 'rgba(63,224,255,0.7)'; c.setLineDash([1.2, 1.2]); c.lineWidth = Math.max(0.3, 1.2 / ppm);
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(lx, ly); c.stroke(); c.setLineDash([]);
    }
  }

  drawNight(c, alpha, ppm) {
    // street lamps and headlights over a darkened scene
    c.globalCompositeOperation = 'lighter';
    const lamp = glowSprite('255,214,150');
    c.globalAlpha = 0.22;
    for (const L of this.lamps) c.drawImage(lamp.cv, L.x - 14, L.y - 14, 28, 28);
    c.globalAlpha = 0.5;
    const beam = beamSprite(), head = glowSprite('255,245,220');
    for (const v of this.sim.st.vehicles) {
      const p = v._p; if (!p) continue;
      c.save(); c.translate(p.x, p.y); c.rotate(p.ang);
      c.drawImage(beam.cv, 0, -4.5, 16, 9);
      c.restore();
      c.drawImage(head.cv, p.x - 1.2, p.y - 1.2, 2.4, 2.4);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
}

// ---------- helpers ----------
function mixAsphalt(rgb, f) {
  const [r, g, b] = rgb.match(/\d+/g).map(Number);
  return `rgb(${Math.round(47 + (r - 47) * f)},${Math.round(54 + (g - 54) * f)},${Math.round(64 + (b - 64) * f)})`;
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

const pathCache = new WeakMap();
export function offsetPath(geo, road, a, b, off, step, closed) {
  let m = pathCache.get(geo);
  if (!m) { m = new Map(); pathCache.set(geo, m); }
  const key = `${a.toFixed(1)}|${b.toFixed(1)}|${off.toFixed(2)}|${step}|${closed ? 1 : 0}`;
  let p = m.get(key);
  if (p) return p;
  p = new Path2D();
  const sh = geo.shift || 0;
  const n = Math.max(1, Math.ceil((b - a) / step));
  for (let i = 0; i <= n; i++) {
    const s = a + ((b - a) * i) / n;
    const q = geo.path.at(Math.min(geo.path.length, s));
    const x = q.x + q.hy * (off + sh), y = q.y - q.hx * (off + sh);
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  if (closed) p.closePath();
  if (m.size > 3000) m.clear();
  m.set(key, p);
  return p;
}

// shoulder hedge is drawn slightly outside the right shoulder line
function offsetPathFromP(p) { return p; }

function makeNoise(size, rgb, amp) {
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const c = cv.getContext('2d');
  const img = c.createImageData(size, size);
  const r = { s: 12345 };
  for (let i = 0; i < size * size; i++) {
    const n = (rnd(r) - 0.5) * amp * 2;
    img.data[i * 4] = rgb[0] + n; img.data[i * 4 + 1] = rgb[1] + n; img.data[i * 4 + 2] = rgb[2] + n * 1.1; img.data[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return cv;
}
