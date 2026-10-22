// The ground of Uminagi: the town layout (platforms, ramps, stairs), a 0.5 m height grid used for walking,
// natural terrain that blends into the town, and the meshes generated from it (platform tops, stone and concrete
// retaining walls, stone steps, quay curbs, the terrain itself).
// Coordinates: metres, +X east, +Z south (towards the sea), +Y up. Sea level is y = 0.
import * as THREE from 'three';

export const QY = 1.6;                    // quay / harbour apron level
const STREET_Z0 = -6, STREET_Z1 = -96, TOP_Y = 13.8;
export const streetY = (z) => QY + (TOP_Y - QY) * Math.min(1, Math.max(0, (STREET_Z0 - z) / (STREET_Z0 - STREET_Z1)));
// residential terraces (7 rows, 1.75 m stone walls): y, front (south) edge z, back edge z, west end x
export const TIERS = [...Array(7)].map((_, k) => ({ y: +(3.35 + 1.75 * k).toFixed(2), zf: -14 - 12.85 * k, zb: k === 6 ? -104 : -14 - 12.85 * (k + 1), x0: -76 + k * 3 }));
// stairs between terraces: [x0, x1] per row k (from row k-1, or the harbour lane for k = 0, up to row k); kept clear of houses
export const STAIRS = [[[-40, -37.5], [4, 6.5]], [[-24, -21.5], [12, 14.5]], [[-8, -5], [-50, -47.5]], [[-30, -27.5], [8, 10.5]], [[-8, -5], [-44, -41.5]], [[-22, -19.5], [14, 16.5]], [[-8, -5], [-36, -33.5]]];
export const TIER_X1 = 24;
export const SHRINE = { x0: -28, x1: 8, z0: -132, z1: -116, y: 21 };
export const PLATEAU = { x0: -140, x1: -96, z0: -40, z1: 8, y: 34 };
// the little island off the beach (like Enoshima), joined to the shore by a long bridge; the coastal tram line
export const ISLAND = { x: 97, z: 200, r: 24 };
export const BRIDGE = { x0: 95, x1: 99, z0: 92, z1: 182, y: 3.2 };
export const TRAM = { x0: 64, x1: 126, z0: 6, z1: 12, y0: 1.6, y1: 3.8 };
// the coastal road (two lanes, like the road along the beach at Enoshima)
export const ROAD = { x0: 64, x1: 126, z0: 15.5, z1: 22.5, y0: 1.6, y1: 3.0 };

// ---------------------------------------------------------------- platforms
// {x0,x1,z0,z1, y | ramp:[axis, a, b, ya, yb], mat, wall:'stone'|'concrete'|'none', stairs, blend, top, curb}
export const PLATFORMS = [];
const P = (o) => { o.id = PLATFORMS.length; PLATFORMS.push({ wall: 'concrete', blend: true, top: true, mat: 'concrete', ...o }); return o; };
const rampZ = (z0, z1, y0, y1) => ['z', z0, z1, y0, y1];
const rampX = (x0, x1, y0, y1) => ['x', x0, x1, y0, y1];

function layout() {
  // harbour apron (back lane, market, warehouses) and quays
  P({ name: 'apron', x0: -78, x1: 64, z0: -14, z1: 22, y: QY, mat: 'concrete_wet', curb: true });
  P({ name: 'east_quay', x0: 52, x1: 64, z0: 22, z1: 92, y: QY, mat: 'concrete_wet', blend: false, curb: true });
  P({ name: 'east_ramp', x0: 56, x1: 64, z0: 92, z1: 99, ramp: rampZ(92, 99, QY, 3), blend: false });
  P({ name: 'east_bw', x0: 22, x1: 64, z0: 99, z1: 106, y: 3, blend: false, curb: true });
  P({ name: 'east_bw_wall', x0: 22, x1: 65, z0: 106, z1: 107.2, y: 4.3, blend: false });
  P({ name: 'east_bw_wall2', x0: 64, x1: 65, z0: 92, z1: 107, y: 4.3, blend: false });
  P({ name: 'west_ramp', x0: -84, x1: -75, z0: 6, z1: 18, ramp: rampZ(6, 18, QY, 3), blend: false });
  P({ name: 'west_bw', x0: -84, x1: -75, z0: 18, z1: 112, y: 3, blend: false, curb: true });
  P({ name: 'south_bw', x0: -84, x1: -12, z0: 104, z1: 112, y: 3, blend: false, curb: true });
  P({ name: 'bw_end', x0: -26, x1: -10, z0: 99, z1: 112, y: 3, blend: false, curb: true });
  P({ name: 'west_bw_wall', x0: -85.2, x1: -84, z0: 6, z1: 113.2, y: 4.3, blend: false });
  P({ name: 'south_bw_wall', x0: -85.2, x1: -10, z0: 112, z1: 113.2, y: 4.3, blend: false });
  // wooden piers (rendered with dock modules; no walls, they stand on piles)
  P({ name: 'pier1', x0: -49.5, x1: -46.5, z0: 22, z1: 46, y: 1.2, wall: 'none', blend: false, top: false, dock: true });
  P({ name: 'pier2', x0: -13.5, x1: -10.5, z0: 22, z1: 42, y: 1.2, wall: 'none', blend: false, top: false, dock: true });
  P({ name: 'pier3', x0: 27.5, x1: 30.5, z0: 22, z1: 46, y: 1.2, wall: 'none', blend: false, top: false, dock: true });
  P({ name: 'pier3t', x0: 21.5, x1: 36.5, z0: 46, z1: 49, y: 1.2, wall: 'none', blend: false, top: false, dock: true });
  P({ name: 'market_floor', x0: -17.6, x1: 13.6, z0: -2.3, z1: 14.3, y: QY + 0.12, wall: 'none', top: false });
  // main street (slopes up to the north) and the plaza at its top
  P({ name: 'street', x0: 24, x1: 56, z0: -96, z1: -6, ramp: rampZ(STREET_Z0, STREET_Z1, QY, TOP_Y), mat: 'paving', wall: 'stone' });
  P({ name: 'plaza', x0: 24, x1: 56, z0: -120, z1: -96, y: TOP_Y, mat: 'paving', wall: 'stone' });
  // terraces
  TIERS.forEach((t, i) => P({ name: `tier${i + 1}`, x0: t.x0, x1: TIER_X1, z0: t.zb, z1: t.zf, y: t.y, mat: 'dirt', wall: 'stone' }));
  // alleys from the street up to each terrace lane (between the west-side shops)
  TIERS.forEach((t, i) => {
    const zc = t.zf - 1.5, ys = streetY(zc), steep = (t.y - ys) / 10 > 0.2;
    P({ name: `alley${i + 1}`, x0: TIER_X1, x1: 34, z0: t.zf - 3, z1: t.zf, ramp: rampX(34, TIER_X1, ys, t.y), mat: steep ? 'granite' : 'paving', wall: 'stone', stairs: steep });
  });
  // stone stairs between terraces (each sits on the lower level against the next wall)
  const stair = (name, x0, x1, zf, yLow, yHigh) => {
    const run = (yHigh - yLow) / 0.58;
    P({ name, x0, x1, z0: zf, z1: zf + run, ramp: rampZ(zf + run, zf, yLow, yHigh), mat: 'granite', wall: 'stone', stairs: true, rail: true });
  };
  STAIRS.forEach((pairs, k) => pairs.forEach(([x0, x1], i) => stair(`st${k}${'ab'[i]}`, x0, x1, TIERS[k].zf, k ? TIERS[k - 1].y : QY, TIERS[k].y)));
  // shrine terrace and its long stair
  P({ name: 'shrine', x0: SHRINE.x0, x1: SHRINE.x1, z0: SHRINE.z0, z1: SHRINE.z1, y: SHRINE.y, mat: 'dirt', wall: 'stone' });
  P({ name: 'shrine_stair', x0: -11, x1: -7, z0: -116, z1: -104, ramp: rampZ(-104, -116, TIERS[6].y, SHRINE.y), mat: 'granite', wall: 'stone', stairs: true });
  // cliff path from the shrine to the lighthouse hill, and the hilltop
  P({ name: 'cliff1', x0: -86, x1: -28, z0: -126, z1: -120, ramp: rampX(-28, -86, SHRINE.y, 26), mat: 'dirt', wall: 'stone', fence: 'south' });
  P({ name: 'cliff2', x0: -86, x1: -80, z0: -120, z1: -20, ramp: rampZ(-120, -20, 26, 31), mat: 'dirt', wall: 'stone', fence: 'east' });
  P({ name: 'cliff3', x0: -96, x1: -86, z0: -26, z1: -20, ramp: rampX(-86, -96, 31, PLATEAU.y), mat: 'granite', wall: 'stone', stairs: true });
  P({ name: 'plateau', x0: PLATEAU.x0, x1: PLATEAU.x1, z0: PLATEAU.z0, z1: PLATEAU.z1, y: PLATEAU.y, mat: 'grass', wall: 'stone', fence: 'plateau' });
  P({ name: 'deck', x0: -103.2, x1: -96.8, z0: -0.2, z1: 6.2, y: PLATEAU.y + 0.2, wall: 'none', top: false });
  // small terraces for houses on the east hillside (height follows the natural ground)
  P({ name: 'east_pad1', x0: 59, x1: 73, z0: -36, z1: -24, y: 'auto', mat: 'dirt', wall: 'stone' });
  P({ name: 'east_pad2', x0: 59, x1: 73, z0: -60, z1: -48, y: 'auto', mat: 'dirt', wall: 'stone' });
  P({ name: 'east_pad3', x0: 60, x1: 74, z0: -84, z1: -72, y: 'auto', mat: 'dirt', wall: 'stone' });
  P({ name: 'east_pad4', x0: 77, x1: 91, z0: -46, z1: -34, y: 'auto', mat: 'dirt', wall: 'stone' });
  P({ name: 'east_pad5', x0: 78, x1: 92, z0: -72, z1: -60, y: 'auto', mat: 'dirt', wall: 'stone' });
  P({ name: 'east_pad6', x0: 76, x1: 90, z0: -22, z1: -10, y: 'auto', mat: 'dirt', wall: 'stone' });
  // the bridge to the island: ramps at both ends, a level deck over the water (no walls: it stands on piers)
  const B = BRIDGE, hb = naturalRaw((B.x0 + B.x1) / 2, B.z0) + 0.05, hi = naturalRaw((B.x0 + B.x1) / 2, B.z1) + 0.05;
  P({ name: 'bridge_s', x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z0 + 7, ramp: rampZ(B.z0, B.z0 + 7, hb, B.y), mat: 'paving', wall: 'none', blend: false });
  P({ name: 'bridge', x0: B.x0, x1: B.x1, z0: B.z0 + 7, z1: B.z1 - 7, y: B.y, mat: 'paving', wall: 'none', blend: false });
  P({ name: 'bridge_n', x0: B.x0, x1: B.x1, z0: B.z1 - 7, z1: B.z1, ramp: rampZ(B.z1 - 7, B.z1, B.y, hi), mat: 'paving', wall: 'none', blend: false });
  // the coastal tram: a ballast bed from the end of the harbour apron along the shore, and a station platform
  P({ name: 'tram', x0: TRAM.x0, x1: TRAM.x1, z0: TRAM.z0, z1: TRAM.z1, ramp: rampX(TRAM.x0, TRAM.x1, TRAM.y0, TRAM.y1), mat: 'granite', wall: 'stone', blend: true });
  const sy = TRAM.y0 + (TRAM.y1 - TRAM.y0) * (78 - TRAM.x0) / (TRAM.x1 - TRAM.x0) + 0.9;
  P({ name: 'tram_station', x0: 70, x1: 86, z0: TRAM.z1, z1: TRAM.z1 + 3.2, y: sy, mat: 'paving', wall: 'stone' });
  P({ name: 'coast_road', x0: ROAD.x0, x1: ROAD.x1, z0: ROAD.z0, z1: ROAD.z1, ramp: rampX(ROAD.x0, ROAD.x1, ROAD.y0, ROAD.y1), mat: 'asphalt', wall: 'concrete', blend: true });
  const ry = (x) => ROAD.y0 + (ROAD.y1 - ROAD.y0) * (x - ROAD.x0) / (ROAD.x1 - ROAD.x0);
  P({ name: 'station_stair', x0: 86, x1: 90, z0: TRAM.z1 + 0.2, z1: ROAD.z0, ramp: rampX(86, 90, sy, ry(90)), mat: 'granite', wall: 'stone', stairs: true });
}

export function platformY(p, x, z) {
  if (!p.ramp) return p.y;
  const [ax, a, b, ya, yb] = p.ramp;
  const t = Math.min(1, Math.max(0, ((ax === 'x' ? x : z) - a) / (b - a)));
  return ya + (yb - ya) * t;
}

// decorative ground overlays (no physics): road surface, terrace lanes, gardens, shrine approach
export const OVERLAYS = [];
function overlays() {
  OVERLAYS.push({ x0: 37, x1: 43, z0: -96, z1: -6, mat: 'asphalt', on: 'street' });
  TIERS.forEach((t, i) => OVERLAYS.push({ x0: t.x0, x1: TIER_X1, z0: t.zf - 3, z1: t.zf, mat: 'asphalt', on: `tier${i + 1}` }));
  OVERLAYS.push({ x0: -11, x1: -7, z0: -132, z1: -116, mat: 'paving', on: 'shrine' });
  OVERLAYS.push({ x0: -11, x1: -7, z0: -104, z1: -94, mat: 'paving', on: 'tier7' });
}

// ---------------------------------------------------------------- natural terrain
const COAST = [[-400, -400], [400, -400], [400, 20], [160, 30], [125, 52], [112, 84], [96, 100], [78, 100], [68, 92], [64, 64], [64, 14],
  [-86, 14], [-90, 30], [-104, 42], [-130, 44], [-160, 30], [-200, 10], [-260, -6], [-400, -10]];
function coastDist(x, z) {  // signed distance to the coastline, > 0 on land
  let d = 1e9, inside = false;
  for (let i = 0, j = COAST.length - 1; i < COAST.length; j = i++) {
    const [ax, az] = COAST[j], [bx, bz] = COAST[i];
    if ((bz > z) !== (az > z) && x < (ax - bx) * (z - bz) / (az - bz) + bx) inside = !inside;
    const ex = ax - bx, ez = az - bz, t = Math.max(0, Math.min(1, ((x - bx) * ex + (z - bz) * ez) / (ex * ex + ez * ez)));
    d = Math.min(d, Math.hypot(x - bx - ex * t, z - bz - ez * t));
  }
  return inside ? d : -d;
}
// value noise (deterministic)
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
export function fbm(x, z, oct = 4) { let s = 0, a = 0.5, f = 1; for (let k = 0; k < oct; k++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function naturalRaw(x, z) {
  const sea = naturalBase(x, z);
  // the island: a wooded dome with steep rocky shores, rising out of the sea floor
  const id = Math.hypot(x - ISLAND.x, (z - ISLAND.z) * 1.15), k = 1 - id / ISLAND.r;
  if (k < -0.5) return sea;
  const n = fbm(x * 0.05 + 11, z * 0.05);
  const hi = k > 0 ? 1.4 + 23 * Math.pow(k, 1.35) * (0.8 + 0.4 * n) : 1.4 + k * 40;   // walkable slopes, rock-cliff shore
  return Math.max(sea, hi);
}
function naturalBase(x, z) {
  const d = coastDist(x, z);
  const n = fbm(x * 0.02, z * 0.02);
  if (d < 0) {  // sea floor: shallow near the beach in the east, deeper elsewhere
    const beach = smooth(60, 80, x) * smooth(30, 60, z) * (1 - smooth(110, 140, x));
    // inside the breakwaters the basin is a clear, sandy 4-6 m; outside it drops off to deep water
    const basin = smooth(-90, -70, x) * (1 - smooth(60, 70, x)) * (1 - smooth(100, 125, z)) * smooth(10, 20, z);
    // the beach shelves gently, then (40-120 m out) blends into the open-sea slope
    const deep = -2.2 + d * 0.25;
    const floor = deep + beach * Math.max(0, 0.4 + d * 0.07 - deep) * smooth(-120, -40, d);
    return Math.max(-40, Math.max(floor, basin * (-4.2 - n * 1.6) + (1 - basin) * floor)) - n * 1.0;
  }
  let h = 1.0 + 0.14 * Math.max(0, -z - 10);                                   // the town slope rising north
  h += 40 * smooth(-120, -230, z);                                             // mountains behind the shrine
  h += 32 * Math.exp(-(((x + 122) / 40) ** 2) - (((z + 12) / 42) ** 2));       // lighthouse headland
  h += 20 * Math.exp(-(((x + 98) / 30) ** 2)) * smooth(30, -30, z) * (1 - smooth(-140, -220, z));  // ridge west of the town
  h += 28 * smooth(60, 140, x) * smooth(30, -50, z);                           // eastern hills
  h += 26 * smooth(-150, -260, x);                                             // far western mountains
  h += (n - 0.5) * 6 + fbm(x * 0.09, z * 0.09, 3) * 1.5;
  const beachLand = smooth(64, 80, x) * smooth(20, 60, z) * (1 - smooth(100, 130, x));
  // the lighthouse headland and the western coast drop into the sea as sheer rock cliffs
  const cliff = Math.exp(-(((x + 122) / 70) ** 2) - (((z + 10) / 60) ** 2)) + 0.6 * smooth(-60, -110, x) * smooth(60, 20, z);
  const shore = smooth(0, beachLand > 0.5 ? 28 : 7 - 4.6 * Math.min(1, cliff), d);
  return 0.5 + (h - 0.5) * shore;
}

// ---------------------------------------------------------------- the grid
export const G = { x0: -170, z0: -150, x1: 130, z1: 236, res: 0.5 };
export const WATER_BOX = { x0: -500, z0: -200, x1: 500, z1: 800 };
G.nx = Math.round((G.x1 - G.x0) / G.res); G.nz = Math.round((G.z1 - G.z0) / G.res);

export class Ground {
  constructor() {
    layout(); overlays();
    const { nx, nz } = G, N = nx * nz;
    this.plat = new Int16Array(N).fill(-1);     // winning platform per cell
    this.ph = new Float32Array(N).fill(-1e9);   // platform height per cell
    this.nat = new Float32Array(N);             // natural terrain (after blending into the town)
    // natural terrain, raw
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) this.nat[j * nx + i] = naturalRaw(G.x0 + (i + 0.5) * G.res, G.z0 + (j + 0.5) * G.res);
    for (const p of PLATFORMS) if (p.y === 'auto') p.y = Math.round(this.natAt((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2) * 10) / 10 + 0.4;
    // rasterise platforms (highest wins)
    for (const p of PLATFORMS) {
      const [i0, i1, j0, j1] = this.cellRange(p);
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        const x = G.x0 + (i + 0.5) * G.res, z = G.z0 + (j + 0.5) * G.res, h = platformY(p, x, z), k = j * nx + i;
        if (h > this.ph[k]) { this.ph[k] = h; this.plat[k] = p.id; }
      }
    }
    this.blendNatural();
  }
  cellRange(p) {
    const c = (v, o, n) => Math.max(0, Math.min(n, Math.round((v - o) / G.res)));
    return [c(p.x0, G.x0, G.nx), c(p.x1, G.x0, G.nx), c(p.z0, G.z0, G.nz), c(p.z1, G.z0, G.nz)];
  }
  // natural ground near the town is pulled towards the nearest (blending) platform, so terraces sit in the hillside
  blendNatural() {
    const { nx, nz } = G, N = nx * nz, INF = 1e9;
    const dist = new Float32Array(N).fill(INF), src = new Float32Array(N);
    for (let k = 0; k < N; k++) if (this.plat[k] >= 0 && PLATFORMS[this.plat[k]].blend) { dist[k] = 0; src[k] = this.ph[k]; }
    const pass = (fwd) => {
      const d1 = G.res, d2 = G.res * Math.SQRT2;
      const nb = fwd ? [[-1, 0, d1], [0, -1, d1], [-1, -1, d2], [1, -1, d2]] : [[1, 0, d1], [0, 1, d1], [1, 1, d2], [-1, 1, d2]];
      for (let jj = 0; jj < nz; jj++) {
        const j = fwd ? jj : nz - 1 - jj;
        for (let ii = 0; ii < nx; ii++) {
          const i = fwd ? ii : nx - 1 - ii, k = j * nx + i;
          for (const [di, dj, dd] of nb) {
            const a = i + di, b = j + dj;
            if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
            const q = b * nx + a;
            if (dist[q] + dd < dist[k]) { dist[k] = dist[q] + dd; src[k] = src[q]; }
          }
        }
      }
    };
    pass(true); pass(false);
    this.pdist = dist;
    for (let k = 0; k < N; k++) {
      const raw = this.nat[k];
      const w = (1 - smooth(0, 20, dist[k])) * smooth(-1.5, 1.0, raw);
      if (w > 0) this.nat[k] = raw + (src[k] - 0.35 - raw) * w;
    }
  }
  idx(x, z) {
    const i = Math.floor((x - G.x0) / G.res), j = Math.floor((z - G.z0) / G.res);
    if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return -1;
    return j * G.nx + i;
  }
  natAt(x, z) {  // bilinear natural height
    const fx = (x - G.x0) / G.res - 0.5, fz = (z - G.z0) / G.res - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= G.nx - 1 || j >= G.nz - 1) return naturalRaw(x, z);
    const u = fx - i, v = fz - j, n = this.nat, k = j * G.nx + i;
    return (n[k] * (1 - u) + n[k + 1] * u) * (1 - v) + (n[k + G.nx] * (1 - u) + n[k + G.nx + 1] * u) * v;
  }
  platformAt(x, z) { const k = this.idx(x, z); return k < 0 ? null : (this.plat[k] >= 0 ? PLATFORMS[this.plat[k]] : null); }
  // walking surface: {h, plat}
  sample(x, z) {
    const p = this.platformAt(x, z);
    if (p) return { h: platformY(p, x, z), plat: p };
    return { h: this.natAt(x, z), plat: null };
  }
  height(x, z) { return this.sample(x, z).h; }

  // ---------------------------------------------------------------- meshes
  buildMeshes(mats) {
    const group = new THREE.Group(); group.name = 'ground';
    group.add(this.terrainMesh(mats.terrain));
    const byMat = {};
    const add = (m) => (byMat[m] ||= { pos: [], uv: [], nor: [] });
    for (const p of PLATFORMS) {
      if (!p.top) continue;
      if (p.stairs) this.stairGeo(p, add(p.mat)); else this.topGeo(p, add(p.mat), 0.002 * (p.id % 5));
    }
    for (const o of OVERLAYS) {
      const p = PLATFORMS.find((q) => q.name === o.on);
      this.topGeo({ ...p, x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1 }, add(o.mat), 0.015);
    }
    this.wallGeo(add('stone_wall'), add('concrete'));
    for (const p of PLATFORMS) if (p.rail) this.railGeo(p, add('steel_dark'));
    this.curbGeo(add('curb'));
    for (const [m, g] of Object.entries(byMat)) {
      if (!g.pos.length || !mats[m]) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      const mesh = new THREE.Mesh(geo, mats[m]); mesh.name = 'ground_' + m; mesh.receiveShadow = true; mesh.castShadow = m === 'stone_wall' || m === 'concrete';
      group.add(mesh);
    }
    return group;
  }
  quad(g, a, b, c, d, n, uvs) {  // a,b,c,d counter-clockwise seen from the normal side
    for (const [p, uv] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [a, uvs[0]], [c, uvs[2]], [d, uvs[3]]]) { g.pos.push(...p); g.nor.push(...n); g.uv.push(...uv); }
  }
  topGeo(p, g, lift) {
    const steps = p.ramp ? Math.max(1, Math.ceil(((p.ramp[0] === 'x' ? p.x1 - p.x0 : p.z1 - p.z0)) / 2)) : 1;
    for (let s = 0; s < steps; s++) {
      let x0 = p.x0, x1 = p.x1, z0 = p.z0, z1 = p.z1;
      if (p.ramp && p.ramp[0] === 'x') { x0 = p.x0 + (p.x1 - p.x0) * s / steps; x1 = p.x0 + (p.x1 - p.x0) * (s + 1) / steps; }
      if (p.ramp && p.ramp[0] === 'z') { z0 = p.z0 + (p.z1 - p.z0) * s / steps; z1 = p.z0 + (p.z1 - p.z0) * (s + 1) / steps; }
      const y = (x, z) => platformY(p, x, z) + lift;
      this.quad(g, [x0, y(x0, z1), z1], [x1, y(x1, z1), z1], [x1, y(x1, z0), z0], [x0, y(x0, z0), z0], [0, 1, 0],
        [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]]);
    }
  }
  stairGeo(p, g) {
    const [ax, a, b, ya, yb] = p.ramp, rise = Math.abs(yb - ya), n = Math.max(2, Math.round(rise / 0.17));
    const len = Math.abs(b - a), dir = Math.sign(b - a);
    for (let s = 0; s < n; s++) {
      // step s spans [t0, t1] of the run; tread top at the ramp height of its centre (+half a riser)
      const t0 = s / n, t1 = (s + 1) / n, yTop = ya + (yb - ya) * (s + 0.5) / n + (yb > ya ? 1 : -1) * rise / n / 2;
      const yBot = Math.min(ya, yb) - 0.4;
      const c0 = a + dir * len * t0, c1 = a + dir * len * t1;
      const lo = Math.min(c0, c1), hi = Math.max(c0, c1);
      const [x0, x1, z0, z1] = ax === 'x' ? [lo, hi, p.z0, p.z1] : [p.x0, p.x1, lo, hi];
      this.quad(g, [x0, yTop, z1], [x1, yTop, z1], [x1, yTop, z0], [x0, yTop, z0], [0, 1, 0], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]]);
      // riser on the downhill face of this step
      const down = (yb > ya) ? (dir > 0 ? 'min' : 'max') : (dir > 0 ? 'max' : 'min');
      if (ax === 'z') {
        const zf = down === 'min' ? z0 : z1, nz = down === 'min' ? -1 : 1;
        const A = nz > 0 ? [x0, yBot, zf] : [x1, yBot, zf], B = nz > 0 ? [x1, yBot, zf] : [x0, yBot, zf];
        this.quad(g, A, B, [B[0], yTop, zf], [A[0], yTop, zf], [0, 0, nz], [[A[0] * nz, yBot], [B[0] * nz, yBot], [B[0] * nz, yTop], [A[0] * nz, yTop]]);
      } else {
        const xf = down === 'min' ? x0 : x1, nx = down === 'min' ? -1 : 1;
        const A = nx > 0 ? [xf, yBot, z1] : [xf, yBot, z0], B = nx > 0 ? [xf, yBot, z0] : [xf, yBot, z1];
        this.quad(g, A, B, [xf, yTop, B[2]], [xf, yTop, A[2]], [nx, 0, 0], [[-A[2] * nx, yBot], [-B[2] * nx, yBot], [-B[2] * nx, yTop], [-A[2] * nx, yTop]]);
      }
    }
  }
  // tube handrail with posts along the west side of a stair
  railGeo(p, g) {
    const x = p.x0 + 0.18, len = p.z1 - p.z0, n = Math.max(2, Math.round(len / 1.4));
    const box = (x0, x1, y0, y1, z0, z1, zz0, zz1) => {  // a box whose top/bottom may slope along z (y0/y1 at z0, zz0/zz1 at z1)
      const c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, zz0, z1], [x1, zz0, z1], [x1, zz1, z1], [x0, zz1, z1]];
      const f = [[0, 1, 2, 3, [0, 0, -1]], [5, 4, 7, 6, [0, 0, 1]], [4, 0, 3, 7, [-1, 0, 0]], [1, 5, 6, 2, [1, 0, 0]], [3, 2, 6, 7, [0, 1, 0]], [4, 5, 1, 0, [0, -1, 0]]];
      for (const [a, b, cc, d, nn] of f) this.quad(g, c[a], c[b], c[cc], c[d], nn, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    };
    for (let i = 0; i <= n; i++) {
      const z = p.z0 + 0.2 + (len - 0.4) * i / n, y = platformY(p, x, z) + 0.12;
      box(x - 0.025, x + 0.025, y - 0.1, y + 0.9, z - 0.025, z + 0.025, y - 0.1, y + 0.9);
    }
    const za = p.z0 + 0.1, zb = p.z1 - 0.1, ya = platformY(p, x, za) + 1.02, yb = platformY(p, x, zb) + 1.02;
    box(x - 0.03, x + 0.03, ya - 0.06, ya, za, zb, yb - 0.06, yb);
  }
  cellH(k) { return this.plat[k] >= 0 ? this.ph[k] : this.nat[k]; }
  // vertical walls wherever neighbouring cells differ in height (terrace walls, quay walls, stair sides)
  wallGeo(gStone, gConc) {
    const { nx, nz, res } = G, MIN = 0.12;
    const owner = (k) => this.plat[k] >= 0 ? PLATFORMS[this.plat[k]] : null;
    const emit = (k1, k2, ex0, ez0, ex1, ez1, nX, nZ) => {
      // k1 is the higher cell, the wall faces k2 (lower), along the edge (ex0,ez0)-(ex1,ez1)
      const p1 = owner(k1), p2 = owner(k2);
      if (p1 && p1.wall === 'none') return;
      const hiAt = (x, z) => p1 ? platformY(p1, x, z) : this.cellH(k1);
      const lo = this.cellH(k2), lower = lo < 0 ? lo - 0.6 : lo - 0.35;
      const mat = (p1 && p1.wall !== 'none' ? p1.wall : p2 && p2.wall !== 'none' ? p2.wall : 'stone') === 'concrete' ? gConc : gStone;
      const coping = p1 && p1.wall === 'stone' && !p1.stairs ? 0.12 : 0;
      const t0 = hiAt(ex0, ez0) + coping, t1 = hiAt(ex1, ez1) + coping;
      const u0 = nZ !== 0 ? ex0 * nZ : -ez0 * nX, u1 = nZ !== 0 ? ex1 * nZ : -ez1 * nX;
      const a = [ex0, lower, ez0], b = [ex1, lower, ez1];
      // order so the face points along (nX, nZ)
      const cross = (ex1 - ex0) * nZ - (ez1 - ez0) * nX;  // >0: a->b is counter-clockwise seen from the normal
      if (cross > 0) this.quad(mat, a, b, [ex1, t1, ez1], [ex0, t0, ez0], [nX, 0, nZ], [[u0, lower], [u1, lower], [u1, t1], [u0, t0]]);
      else this.quad(mat, b, a, [ex0, t0, ez0], [ex1, t1, ez1], [nX, 0, nZ], [[u1, lower], [u0, lower], [u0, t0], [u1, t1]]);
    };
    const need = (k1, k2) => {
      const p1 = this.plat[k1] >= 0, p2 = this.plat[k2] >= 0;
      if (!p1 && !p2) return false;
      return Math.abs(this.cellH(k1) - this.cellH(k2)) > MIN;
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = G.x0 + (i + 1) * res, z = G.z0 + (j + 1) * res;
      if (i + 1 < nx && need(k, k + 1)) {  // edge at x between columns i and i+1
        const [hi, lo, n] = this.cellH(k) > this.cellH(k + 1) ? [k, k + 1, 1] : [k + 1, k, -1];
        emit(hi, lo, x, z - res, x, z, n, 0);
      }
      if (j + 1 < nz && need(k, k + nx)) {  // edge at z between rows j and j+1
        const [hi, lo, n] = this.cellH(k) > this.cellH(k + nx) ? [k, k + nx, 1] : [k + nx, k, -1];
        emit(hi, lo, x - res, z, x, z, 0, n);
      }
    }
  }
  // yellow/black curbs along quay edges that drop into the water
  curbGeo(g) {
    const { nx, nz, res } = G;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (this.plat[k] < 0 || !PLATFORMS[this.plat[k]].curb) continue;
      const h = this.ph[k], x = G.x0 + i * res, z = G.z0 + j * res;
      const water = (q) => q >= 0 && this.plat[q] < 0 && this.nat[q] < -0.3;
      const sides = [[i + 1 < nx ? k + 1 : -1, 'e'], [i > 0 ? k - 1 : -1, 'w'], [j + 1 < nz ? k + nx : -1, 's'], [j > 0 ? k - nx : -1, 'n']];
      for (const [q, s] of sides) {
        if (!water(q)) continue;
        const w = 0.3, H = 0.22;
        let x0 = x, x1 = x + res, z0 = z, z1 = z + res;
        if (s === 'e') x0 = x1 - w; if (s === 'w') x1 = x0 + w; if (s === 's') z0 = z1 - w; if (s === 'n') z1 = z0 + w;
        const t = h + H, along = s === 'e' || s === 'w' ? z : x;
        const uv = [[along * 2, 0], [along * 2 + 1, 0], [along * 2 + 1, 1], [along * 2, 1]];
        this.quad(g, [x0, t, z1], [x1, t, z1], [x1, t, z0], [x0, t, z0], [0, 1, 0], uv);
        if (s === 's') this.quad(g, [x0, h - 0.1, z1], [x1, h - 0.1, z1], [x1, t, z1], [x0, t, z1], [0, 0, 1], uv);
        if (s === 'n') this.quad(g, [x1, h - 0.1, z0], [x0, h - 0.1, z0], [x0, t, z0], [x1, t, z0], [0, 0, -1], uv);
        if (s === 'e') this.quad(g, [x1, h - 0.1, z1], [x1, h - 0.1, z0], [x1, t, z0], [x1, t, z1], [1, 0, 0], uv);
        if (s === 'w') this.quad(g, [x0, h - 0.1, z0], [x0, h - 0.1, z1], [x0, t, z1], [x0, t, z0], [-1, 0, 0], uv);
        // inner face
        if (s === 's') this.quad(g, [x1, h - 0.1, z0], [x0, h - 0.1, z0], [x0, t, z0], [x1, t, z0], [0, 0, -1], uv);
        if (s === 'n') this.quad(g, [x0, h - 0.1, z1], [x1, h - 0.1, z1], [x1, t, z1], [x0, t, z1], [0, 0, 1], uv);
        if (s === 'e') this.quad(g, [x0, h - 0.1, z0], [x0, h - 0.1, z1], [x0, t, z1], [x0, t, z0], [-1, 0, 0], uv);
        if (s === 'w') this.quad(g, [x1, h - 0.1, z1], [x1, h - 0.1, z0], [x1, t, z0], [x1, t, z1], [1, 0, 0], uv);
      }
    }
  }
  // natural terrain: a 2 m mesh over the town box (with a skirt) and a coarse 25 m ring out to 1.5 km
  terrainMesh(mat) {
    const group = new THREE.Group(); group.name = 'terrain';
    const vertexY = (x, z) => {
      const k = this.idx(x, z);
      let y = k >= 0 ? this.natAt(x, z) : naturalRaw(x, z);
      // roughen steep natural slopes (cliffs) away from the town
      const far = k < 0 ? 1 : smooth(4, 12, this.pdist[k]);
      if (far > 0 && y > 0.5) {
        const e = 1.5, sl = Math.hypot((k >= 0 ? this.natAt(x + e, z) : naturalRaw(x + e, z)) - y, (k >= 0 ? this.natAt(x, z + e) : naturalRaw(x, z + e)) - y) / e;
        y += (fbm(x * 0.21 + 7, z * 0.21, 3) - 0.5) * 5 * smooth(0.5, 1.4, sl) * far;
      }
      if (k >= 0 && this.plat[k] >= 0) {  // under platforms: below the lowest platform nearby (never bulges over a lower terrace)
        let lo = this.ph[k];
        for (let dj = -5; dj <= 5; dj += 1) for (let di = -5; di <= 5; di += 1) {
          const q = k + dj * G.nx + di;
          if (q >= 0 && q < this.ph.length && this.plat[q] >= 0) lo = Math.min(lo, this.ph[q]);
        }
        y = Math.min(y, lo - 0.25);
      }
      return y;
    };
    const grid = (xs, zs, skip, skirt) => {
      const W = xs.length, H = zs.length, pos = [], idx = [];
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) pos.push(xs[i], vertexY(xs[i], zs[j]), zs[j]);
      for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
        if (skip && skip(xs[i], zs[j], xs[i + 1], zs[j + 1])) continue;
        const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      if (skirt) {  // hang the border down 6 m so the coarse ring never shows a crack
        const ring = [];
        for (let i = 0; i < W; i++) ring.push(i); for (let j = 1; j < H; j++) ring.push(j * W + W - 1);
        for (let i = W - 2; i >= 0; i--) ring.push((H - 1) * W + i); for (let j = H - 2; j > 0; j--) ring.push(j * W);
        const base = pos.length / 3;
        for (const v of ring) pos.push(pos[v * 3], pos[v * 3 + 1] - 6, pos[v * 3 + 2]);
        for (let r = 0; r < ring.length; r++) { const a = ring[r], b = ring[(r + 1) % ring.length], c = base + r, d = base + (r + 1) % ring.length; idx.push(a, b, c, b, d, c, a, c, b, b, c, d); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; return m;
    };
    const span = (a, b, st) => { const v = []; for (let x = a; x <= b + 1e-6; x += st) v.push(x); return v; };
    const inner = grid(span(G.x0 + 1, G.x1 - 1, 2), span(G.z0 + 1, G.z1 - 1, 2), null, true); inner.name = 'terrain_town';
    const outer = grid(span(-1500, 1500, 25), span(-1500, 1500, 25), (x0, z0, x1, z1) => x0 >= G.x0 + 1 && x1 <= G.x1 - 1 && z0 >= G.z0 + 1 && z1 <= G.z1 - 1);
    outer.name = 'terrain_far';
    group.add(inner, outer);
    return group;
  }
  // depth of water and shore foam, baked into a texture for the sea shader (covers the grid box)
  waterTexture() {
    const B = WATER_BOX, W = 400, H = 400, sx = (B.x1 - B.x0) / W, sz = (B.z1 - B.z0) / H;
    const data = new Uint8Array(W * H * 4);
    const hAt = (x, z) => { const k = this.idx(x, z); return k >= 0 ? this.cellH(k) : naturalRaw(x, z); };
    const dockAt = (x, z) => { const k = this.idx(x, z); return k >= 0 && this.plat[k] >= 0 && PLATFORMS[this.plat[k]].dock; };
    const hg = new Float32Array(W * H), dock = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = B.x0 + (i + 0.5) * sx, z = B.z0 + (j + 0.5) * sz;
      hg[j * W + i] = hAt(x, z); dock[j * W + i] = dockAt(x, z) ? 1 : 0;
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const h = hg[j * W + i], depth = Math.max(0, -h);
      let land = 0;  // next to land or a wall -> foam
      if (h < 0.2) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < W && b < H && hg[b * W + a] > 0.2 && !dock[b * W + a]) land = 0.9;
      }
      const o = (j * W + i) * 4;
      data[o] = Math.min(255, depth * 6); data[o + 1] = land * 255; data[o + 2] = 0; data[o + 3] = 255;
    }
    const t = new THREE.DataTexture(data, W, H); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    return t;
  }
}
