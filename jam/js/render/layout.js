// Road geometry for drawing. The simulation is one-dimensional along each road;
// here every road gets a 2D centre line (sampled every 2 m) so that a position
// s and a lateral lane coordinate can be turned into screen-world coordinates.
// Long expressways are folded into rows ("snake") so they fit a phone screen;
// this is a display choice only and is stated in the UI.

export const LANE_W = 3.5;

export class Path {
  constructor(pts) {
    // pts: [{x,y}] dense polyline; compute arc length
    this.x = []; this.y = []; this.s = [];
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      this.x.push(pts[i].x); this.y.push(pts[i].y); this.s.push(acc);
    }
    this.length = acc;
    this.step = acc / (pts.length - 1);
  }
  // position and heading at arc length s (clamped / extrapolated)
  at(s) {
    const n = this.x.length;
    let i = Math.floor(s / this.step);
    if (i < 0) i = 0; if (i > n - 2) i = n - 2;
    const f = (s - this.s[i]) / Math.max(1e-6, this.s[i + 1] - this.s[i]);
    const dx = this.x[i + 1] - this.x[i], dy = this.y[i + 1] - this.y[i];
    const l = Math.hypot(dx, dy) || 1;
    return { x: this.x[i] + dx * f, y: this.y[i] + dy * f, hx: dx / l, hy: dy / l };
  }
}

// turtle builder: segments of lines and arcs
function turtle(x, y, ang, segs, ds = 2) {
  const pts = [{ x, y }];
  for (const sg of segs) {
    if (sg.line) {
      const n = Math.max(1, Math.round(sg.line / ds));
      for (let i = 1; i <= n; i++) pts.push({ x: x + Math.cos(ang) * (sg.line * i) / n, y: y + Math.sin(ang) * (sg.line * i) / n });
      x += Math.cos(ang) * sg.line; y += Math.sin(ang) * sg.line;
    } else {
      // arc: radius r, turn angle a (positive = clockwise on screen = right turn)
      const r = sg.r, a = sg.a;
      const len = Math.abs(a) * r, n = Math.max(2, Math.round(len / ds));
      const sign = Math.sign(a);
      const cx = x + Math.cos(ang + sign * Math.PI / 2) * r, cy = y + Math.sin(ang + sign * Math.PI / 2) * r;
      const a0 = Math.atan2(y - cy, x - cx);
      for (let i = 1; i <= n; i++) { const t = a0 + (a * i) / n; pts.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r }); }
      x = pts[pts.length - 1].x; y = pts[pts.length - 1].y; ang += a;
    }
  }
  return pts;
}

// lateral offset (towards the left of travel) of a lane coordinate
export function laneOffset(road, lat) {
  const n = road.lanes.length;
  return ((n - 1) / 2 - lat) * LANE_W;
}

export function leftNormal(h) { return { x: h.hy, y: -h.hx }; }

// world position of (s, lateral lane coordinate) on a road geometry
export function place(geo, road, s, lat) {
  const p = geo.path.at(s);
  const off = laneOffset(road, lat) + (geo.shift || 0);
  return { x: p.x + p.hy * off, y: p.y - p.hx * off, hx: p.hx, hy: p.hy };
}

export function buildLayout(def, aspect) {
  if (def.kind === 'ring') return ringLayout(def);
  if (def.kind === 'cross') return crossLayout(def);
  return snakeLayout(def, aspect);
}

function ringLayout(def) {
  const road = def.roads[0];
  const R = road.length / (2 * Math.PI);
  const pts = [];
  const n = Math.round(road.length / 2);
  // counter-clockwise on screen, starting at the bottom
  for (let i = 0; i <= n; i++) { const t = Math.PI / 2 - (i / n) * 2 * Math.PI; pts.push({ x: Math.cos(t) * R, y: Math.sin(t) * R }); }
  const geo = { path: new Path(pts), closed: true };
  const m = R + 13;
  return { geos: [geo], bounds: { x0: -m, y0: -m, x1: m, y1: m }, kind: 'ring', R };
}

function crossLayout(def) {
  const c = def.cross, L = c.L, X = c.X + c.box / 2;
  const geos = [];
  const mk = (x0, y0, ang) => ({ path: new Path(turtle(x0, y0, ang, [{ line: L }])) });
  for (const road of def.roads) {
    const half = (road.lanes.length * LANE_W) / 2 + 0.4;
    if (road.id === 'eb') geos.push(mk(-X, -half, 0));
    if (road.id === 'wb') geos.push(mk(X, half, Math.PI));
    if (road.id === 'nb') geos.push(mk(-half, X, -Math.PI / 2));
    if (road.id === 'sb') geos.push(mk(half, -X, Math.PI / 2));
  }
  const ext = Math.max(X, L - X) - 30;
  return { geos, bounds: { x0: -ext, y0: -ext, x1: ext, y1: ext }, kind: 'cross', X };
}

// Fold a long expressway into rows joined by half circles.
function snakeLayout(def, aspect) {
  const main = def.roads[0];
  const L = main.length;
  const nl = main.lanes.length;
  const pitch = Math.max(46, nl * LANE_W * 2 + 30);
  const R = pitch / 2;
  // stretches that must stay straight (ramp merge, lane drop, tunnel)
  const keep = [];
  const ramp = def.roads.find((r) => r.ramp);
  if (ramp) keep.push([ramp.link.s - 70, main.lanes[0].to + 30]);
  if (main.lanes.some((l) => l.to < L - 1)) { const d = Math.min(...main.lanes.map((l) => l.to)); keep.push([d - 200, d + 40]); }

  // row length from the screen aspect, then move each U-turn so that it never
  // falls inside a stretch that must stay straight (rows may differ in length)
  let best = null;
  for (let n = 1; n <= 14; n++) {
    const row = (L - (n - 1) * Math.PI * R) / n;
    if (row < 110) break;
    const w = row + 2 * R + 60, h = (n - 1) * pitch + 2 * R + 60;
    const score = Math.abs(Math.log(w / h / aspect));
    if (!best || score < best.score) best = { n, row, score };
  }
  const turn = Math.PI * R;
  const segs = [];
  let s0 = 0, k = 0;
  for (;;) {
    let br = s0 + best.row;
    for (let it = 0; it < 4; it++) for (const [a, b] of keep) if (br + turn > a && br < b) br = a - turn > s0 + 90 && (a - turn) - s0 > best.row * 0.55 ? a - turn : b;
    if (br + turn > L - 40) break;
    segs.push({ line: br - s0 });
    segs.push({ r: R, a: (k % 2 === 0 ? 1 : -1) * Math.PI });
    s0 = br + turn; k++;
  }
  segs.push({ line: L - s0 });
  const n = k + 1;
  const pts = turtle(0, 0, 0, segs, 2);
  const geos = [{ path: new Path(pts) }];
  // ramp: runs alongside the main road on its left, joining the acceleration lane
  if (ramp) {
    const mg = geos[0];
    const accOff = laneOffset(main, 0);
    const rp = [];
    const nn = Math.round(ramp.length / 2);
    for (let i = 0; i <= nn; i++) {
      const s = (i / nn) * ramp.length;
      const back = ramp.length - s;
      const sm = ramp.link.s - back;
      const p = mg.path.at(sm);
      const u = Math.min(1, back / (ramp.length * 0.75));
      const off = accOff + LANE_W * (0.0 + 3.6 * u * u * (3 - 2 * u));
      rp.push({ x: p.x + p.hy * off, y: p.y - p.hx * off });
    }
    geos.push({ path: new Path(rp), shift: 0 });
  }
  const pad = 22;
  const half = (nl * LANE_W) / 2 + (ramp ? LANE_W * 4.5 : 0);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < pts.length; i++) { x0 = Math.min(x0, pts[i].x); x1 = Math.max(x1, pts[i].x); y0 = Math.min(y0, pts[i].y); y1 = Math.max(y1, pts[i].y); }
  const b = { x0: x0 - half - pad, y0: y0 - half - pad, x1: x1 + half + pad, y1: y1 + half + pad };
  const row = best.row;
  return { geos, bounds: b, kind: 'snake', rows: n, row, R, pitch };
}
