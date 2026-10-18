# Seamless PBR textures for the Uminagi port-town kit (colour JPG + normal-map JPG, some with a roughness map).
#   python3 tools/make_textures.py            (numpy + pillow only)
# Every texture tiles in both directions. `textures/textures.json` records the real-world size one tile covers
# (metres), so the game can set texture.repeat = 1 / size on the metre-based UVs the Blender script writes.
import json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'textures'))
N = 512
rng = np.random.default_rng(7)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / N   # 0..1, row = v, col = u


def fbm(beta=2.0, seed=0, lo=1.0, aniso=(1.0, 1.0)):
    """Tileable 1/f^beta noise in [0,1] (FFT-filtered white noise wraps around by construction)."""
    r = np.random.default_rng(seed)
    w = r.standard_normal((N, N))
    fy = np.fft.fftfreq(N)[:, None] * N * aniso[1]
    fx = np.fft.fftfreq(N)[None, :] * N * aniso[0]
    f = np.sqrt(fx * fx + fy * fy); f[0, 0] = 1
    amp = 1 / np.maximum(f, lo) ** (beta / 2)
    amp[0, 0] = 0
    n = np.real(np.fft.ifft2(np.fft.fft2(w) * amp))
    n -= n.min(); n /= n.max()
    return n.astype(np.float32)


def voronoi(pts, aspect=(1.0, 1.0)):
    """Tileable Voronoi: returns (f1, f2, id) per pixel for points in the unit torus."""
    P = np.asarray(pts, np.float32)
    ax, ay = aspect
    f1 = np.full((N, N), 9.0, np.float32); f2 = np.full((N, N), 9.0, np.float32); idx = np.zeros((N, N), np.int32)
    for r0 in range(0, N, 64):
        u = xx[r0:r0 + 64, :, None]; v = yy[r0:r0 + 64, :, None]
        dx = np.abs(u - P[None, None, :, 0]); dx = np.minimum(dx, 1 - dx) * ax
        dy = np.abs(v - P[None, None, :, 1]); dy = np.minimum(dy, 1 - dy) * ay
        d = np.sqrt(dx * dx + dy * dy)
        o = np.argsort(d, axis=2)[:, :, :2]
        a = np.take_along_axis(d, o, 2)
        f1[r0:r0 + 64], f2[r0:r0 + 64], idx[r0:r0 + 64] = a[:, :, 0], a[:, :, 1], o[:, :, 0]
    return f1, f2, idx


def normal_from_height(h, strength):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.stack([-gx, gy, np.ones_like(h)], -1)  # OpenGL convention (+Y up in tangent space)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)


def rgb(c):
    return np.array(c, np.float32)[None, None, :] / 255


def mix(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return a * (1 - t) + b * t


META = {}


def save(name, color, height, strength, size_m, rough=None, q=86):
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray((np.clip(color, 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/{name}.jpg', quality=q)
    Image.fromarray(normal_from_height(height, strength)).save(f'{OUT}/{name}_n.jpg', quality=90)
    META[name] = {'size_m': size_m, 'normal': f'{name}_n.jpg'}
    if rough is not None:
        Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/{name}_r.jpg', quality=88)
        META[name]['rough'] = f'{name}_r.jpg'
    print(f'{name:14s} {size_m} m')


def boards(count, horizontal, seed, base, var, gap_dark=0.35, lap=False):
    """Weathered wooden boards. count boards per tile across u (vertical boards) or v (horizontal clapboards)."""
    r = np.random.default_rng(seed)
    t = (yy if horizontal else xx) * count
    k = np.floor(t).astype(int) % count
    f = t - np.floor(t)
    along = xx if horizontal else yy
    tone = r.uniform(-1, 1, count)[k]
    grain = fbm(0.9, seed + 1, aniso=(1, 24) if not horizontal else (24, 1)) ** 1.5
    streak = fbm(1.6, seed + 2, aniso=(1, 6) if not horizontal else (6, 1))
    kn = fbm(1.0, seed + 3, aniso=(1, 3) if not horizontal else (3, 1))
    knots = np.clip((kn - 0.9) * 12, 0, 1)
    c = rgb(base) * (1 + var * tone[..., None]) * (0.7 + 0.55 * grain[..., None])
    c = mix(c, rgb((128, 122, 112)), np.clip(streak * 0.9 - 0.15, 0, 0.55))   # silvered by sea air
    c *= (1 - 0.3 * knots[..., None])
    edge = np.clip(np.minimum(f, 1 - f) * count * 6, 0, 1) if not lap else np.clip(f * count * 5, 0, 1)
    c *= (1 - gap_dark) + gap_dark * edge[..., None]
    h = edge * 0.6 + grain * 0.25 + (f * 0.5 if lap else 0) - knots * 0.1
    _ = along
    return c, h


def main():
    # ---- wood: vertical siding (warehouses, shops), dark horizontal clapboards (houses), planks (docks)
    c, h = boards(10, False, 11, (118, 86, 58), 0.14)
    save('wood', c, h, 3.0, [2.0, 2.0])
    c, h = boards(10, True, 12, (72, 52, 38), 0.12, gap_dark=0.5, lap=True)
    save('wood_dark', c, h, 3.5, [2.0, 2.0])
    c, h = boards(8, True, 13, (150, 122, 92), 0.18, gap_dark=0.55)
    save('planks', c, h, 3.0, [2.0, 2.0])

    # ---- plaster (beige stucco with rain stains from the eaves down)
    n1, n2 = fbm(2.2, 21), fbm(1.4, 22, aniso=(4, 1))
    c = rgb((226, 214, 190)) * (0.9 + 0.12 * n1[..., None])
    c = mix(c, rgb((150, 140, 118)), np.clip((n2 - 0.55) * 1.6, 0, 0.45) * (1 - yy) ** 0.5)
    save('plaster', c, n1 * 0.3, 1.5, [2.5, 2.5])

    # ---- kawara roof tiles: wave channels across u, overlapping courses along v (1 tile = 1.2 m)
    cols, rows = 4, 4
    wave = np.sin(xx * cols * np.pi * 2) * 0.5 + 0.5
    rv = (yy * rows) % 1
    lip = np.clip((rv - 0.88) * 9, 0, 1)
    nt = fbm(2.4, 31)
    tone = np.random.default_rng(32).uniform(-1, 1, (rows, cols * 2))[(np.floor(yy * rows).astype(int)) % rows, (np.floor(xx * cols * 2).astype(int)) % (cols * 2)]
    c = rgb((70, 76, 86)) * (0.75 + 0.35 * wave[..., None] + 0.08 * tone[..., None]) * (0.92 + 0.12 * nt[..., None])
    c *= (1 - 0.45 * lip[..., None])
    c = mix(c, rgb((96, 104, 84)), np.clip((fbm(1.5, 33) - 0.62) * 2, 0, 0.4))   # lichen
    h = wave * 0.5 + rv * 0.5 - lip * 0.5 + nt * 0.05
    save('roof_tile', c, h, 3.0, [1.2, 1.2])

    # ---- ishigaki stone wall: irregular dry-stacked granite with dark joints
    r = np.random.default_rng(41)
    pts = np.c_[r.random(110), r.random(110)]
    f1, f2, idx = voronoi(pts, (1.0, 1.25))
    joint = np.clip((f2 - f1) * 45, 0, 1)
    bulge = np.clip((f2 - f1) * 5, 0, 1) ** 0.5
    tone = r.uniform(-1, 1, 110)[idx]
    warm = r.uniform(0, 1, 110)[idx]
    nn = fbm(2.6, 42)
    base = mix(rgb((128, 126, 118)), rgb((150, 134, 112)), warm * 0.6)
    c = base * (1 + 0.16 * tone[..., None]) * (0.82 + 0.3 * nn[..., None])
    moss = np.clip((fbm(1.8, 43) - 0.55) * 2.2, 0, 1) * (1 - joint) ** 0.3
    c = mix(c, rgb((82, 98, 50)), moss * 0.55)
    c *= (0.42 + 0.58 * joint[..., None]) * (0.78 + 0.22 * bulge[..., None])
    h = np.sqrt(joint) * 0.4 + bulge * 0.6 + nn * 0.2
    save('stone_wall', c, h, 5.0, [3.0, 3.0])

    # ---- paving stones (main street): staggered rectangles
    rows, cols = 8, 4
    rv = yy * rows; row = np.floor(rv).astype(int)
    uu = xx * cols + (row % 2) * 0.5; col = np.floor(uu).astype(int)
    fu, fv = uu % 1, rv % 1
    joint = np.clip(np.minimum(np.minimum(fu, 1 - fu) * 2.2, np.minimum(fv, 1 - fv) * 1.1) * 12, 0, 1)
    tone = np.random.default_rng(51).uniform(-1, 1, (rows, cols + 1))[row % rows, col % (cols + 1)]
    nn = fbm(2.4, 52)
    c = rgb((150, 146, 136)) * (1 + 0.12 * tone[..., None]) * (0.85 + 0.25 * nn[..., None])
    c *= 0.45 + 0.55 * joint[..., None]
    save('paving', c, joint * 0.7 + nn * 0.2, 4.0, [3.0, 3.0])

    # ---- old concrete (quays, seawalls): stains, cracks, formwork lines
    n1, n2, n3 = fbm(2.0, 61), fbm(1.3, 62), fbm(2.8, 63)
    crack = np.clip(1 - np.abs(fbm(1.9, 64) - 0.5) * 60, 0, 1) * (n2 > 0.55)
    form = np.clip(np.abs(((yy * 3) % 1) - 0.5) * 2 - 0.96, 0, 1) * 20
    c = rgb((168, 166, 158)) * (0.84 + 0.22 * n1[..., None])
    c = mix(c, rgb((120, 116, 104)), np.clip((n2 - 0.5) * 1.8, 0, 0.6))
    c = mix(c, rgb((150, 104, 70)), np.clip((n3 - 0.78) * 4, 0, 0.35))   # rust bleed
    c *= (1 - 0.5 * crack[..., None]) * (1 - 0.12 * np.clip(form, 0, 1)[..., None])
    save('concrete', c, n1 * 0.4 - crack * 0.5, 2.5, [4.0, 4.0])

    # ---- wet harbour apron: concrete + puddle mask in the roughness map (puddles are dark, glossy)
    pud = np.clip((fbm(2.2, 71) - 0.58) * 6, 0, 1)
    cw = c * (1 - 0.35 * pud[..., None]) * 0.92
    save('concrete_wet', cw, n1 * 0.4 * (1 - pud) - crack * 0.5, 2.5, [6.0, 6.0], rough=0.85 - 0.75 * pud)

    # ---- asphalt
    n1, n2 = fbm(3.0, 81), fbm(1.6, 82)
    grit = np.random.default_rng(83).random((N, N)).astype(np.float32)
    c = rgb((74, 74, 76)) * (0.82 + 0.2 * n1[..., None] + 0.12 * grit[..., None]) * (0.9 + 0.15 * n2[..., None])
    save('asphalt', c, grit * 0.3 + n1 * 0.3, 2.0, [4.0, 4.0])

    # ---- corrugated tin, painted blue and rusted red-brown
    rib = np.sin(xx * 16 * np.pi * 2) * 0.5 + 0.5
    for name, paint, seed in (('tin_blue', (62, 104, 140), 91), ('tin_rust', (132, 70, 44), 92)):
        rust = np.clip((fbm(2.0, seed) - 0.5) * 2.5 + (yy - 0.6) * 0.8, 0, 1)
        c = rgb(paint) * (0.8 + 0.3 * rib[..., None])
        c = mix(c, rgb((118, 62, 32)) * (0.7 + 0.5 * fbm(3.0, seed + 5)[..., None]), rust * 0.75)
        save(name, c, rib, 4.0, [2.0, 2.0])

    # ---- painted boat hull: white with rust streaks running down
    st = fbm(1.5, 101, aniso=(10, 1))
    c = rgb((232, 230, 222)) * (0.92 + 0.08 * fbm(2.5, 102)[..., None])
    c = mix(c, rgb((150, 90, 50)), np.clip((st - 0.6) * 3, 0, 0.6) * yy)
    save('hull', c, st * 0.1, 1.0, [3.0, 3.0])

    # ---- terrain: grass, rock, sand, dirt
    n1, n2 = fbm(2.6, 111), fbm(1.4, 112)
    blades = np.random.default_rng(113).random((N, N)).astype(np.float32)
    patch = np.clip((fbm(1.8, 114) - 0.6) * 4, 0, 1)
    c = mix(rgb((70, 108, 44)), rgb((126, 146, 64)), n2) * (0.65 + 0.4 * n1[..., None] + 0.25 * blades[..., None])
    c = mix(c, rgb((112, 96, 64)), patch * 0.5)
    save('grass', c, n1 * 0.5 + blades * 0.3, 2.0, [5.0, 5.0])
    f1, f2, idx = voronoi(np.c_[r.random(30), r.random(30)], (1, 1))
    nn = fbm(2.3, 121); strata = fbm(1.5, 122, aniso=(1, 8))
    crack = np.clip((f2 - f1) * 40, 0, 1)
    fine = fbm(3.0, 123)
    lich = np.clip((fbm(1.7, 124) - 0.6) * 3, 0, 1)
    c = mix(rgb((108, 102, 92)), rgb((158, 150, 134)), strata * 0.7 + fine * 0.3) * (0.72 + 0.4 * nn[..., None]) * (0.88 + 0.12 * crack[..., None])
    c = mix(c, rgb((98, 108, 70)), lich * 0.45)
    save('rock', c, nn * 0.9 + crack * 0.12 + strata * 0.4 + fine * 0.2, 4.0, [6.0, 6.0])
    nn = fbm(3.2, 131); rip = np.sin((xx + fbm(1.2, 132) * 0.3) * 40) * 0.5 + 0.5
    c = rgb((214, 196, 158)) * (0.88 + 0.15 * nn[..., None] + 0.05 * rip[..., None])
    save('sand', c, rip * 0.3 + nn * 0.3, 2.0, [4.0, 4.0])
    nn = fbm(2.4, 141); peb = (np.random.default_rng(142).random((N, N)) > 0.985).astype(np.float32)
    c = rgb((124, 98, 70)) * (0.8 + 0.3 * nn[..., None]) + peb[..., None] * 0.15
    save('dirt', c, nn * 0.5 + peb * 0.4, 2.0, [4.0, 4.0])

    json.dump(META, open(f'{OUT}/textures.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
