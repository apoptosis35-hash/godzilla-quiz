# Low-poly countryside (田舎) model stock, built with Blender's Python API.
#   pip install bpy   (Blender 5.2 as a module; or: blender -b -P make_models.py -- --render)
#   python3 tools/make_models.py [--render] [names...]
# Conventions: 1 unit = 1 m, Y-up glTF, origin at the centre of the footprint on the ground, front faces +Z (glTF).
# Writes glb/<name>.glb, models.json, inaka.blend and (with --render) preview/<name>.jpg.
import json, math, os, random, sys
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
GLB, PREVIEW = os.path.join(ROOT, 'glb'), os.path.join(ROOT, 'preview')

# ---------------------------------------------------------------- shared palette (one material per colour, reused by every model)
PALETTE = {
    'wood': ((0.42, 0.26, 0.14), 0.8), 'wood_dark': ((0.2, 0.12, 0.07), 0.8), 'wood_light': ((0.72, 0.55, 0.34), 0.75),
    'plaster': ((0.93, 0.91, 0.85), 0.9), 'shoji': ((0.97, 0.95, 0.88), 0.9), 'thatch': ((0.62, 0.5, 0.3), 1.0),
    'thatch_dark': ((0.38, 0.3, 0.18), 1.0), 'tile': ((0.22, 0.24, 0.28), 0.6), 'tin': ((0.55, 0.22, 0.14), 0.6),
    'stone': ((0.55, 0.55, 0.52), 0.95), 'stone_dark': ((0.36, 0.36, 0.35), 0.95), 'moss': ((0.32, 0.42, 0.18), 1.0),
    'leaf': ((0.18, 0.42, 0.14), 0.85), 'leaf_dark': ((0.08, 0.26, 0.1), 0.85), 'leaf_light': ((0.42, 0.62, 0.2), 0.85),
    'bamboo': ((0.4, 0.6, 0.22), 0.5), 'sakura': ((1.0, 0.7, 0.8), 0.8), 'kaki': ((1.0, 0.42, 0.05), 0.5),
    'bark': ((0.3, 0.22, 0.16), 1.0), 'soil': ((0.3, 0.2, 0.12), 1.0), 'grass': ((0.3, 0.52, 0.18), 1.0),
    'water': ((0.2, 0.36, 0.42), 0.08), 'rice': ((0.38, 0.62, 0.18), 0.8), 'straw': ((0.86, 0.7, 0.3), 0.9),
    'red': ((0.8, 0.08, 0.05), 0.5), 'vermilion': ((0.9, 0.2, 0.06), 0.6), 'black': ((0.04, 0.04, 0.045), 0.6),
    'white': ((0.92, 0.92, 0.92), 0.4), 'metal': ((0.6, 0.62, 0.64), 0.35, 1.0), 'rubber': ((0.05, 0.05, 0.05), 0.9),
    'glass': ((0.12, 0.2, 0.28), 0.05), 'blue': ((0.12, 0.3, 0.7), 0.5), 'cloth': ((0.25, 0.35, 0.6), 0.9),
    'skin_cloth': ((0.95, 0.92, 0.85), 0.9), 'yellow': ((1.0, 0.8, 0.1), 0.5), 'brown': ((0.45, 0.3, 0.18), 0.85),
    'concrete': ((0.62, 0.62, 0.6), 0.95),
    'glow': ((1.0, 0.97, 0.9), 0.4, 0.0, (1.0, 0.95, 0.85), 2.0), 'lamp': ((1.0, 0.85, 0.5), 0.4, 0.0, (1.0, 0.75, 0.35), 3.0),
}
MATS = {}
def M(name):
    if name in MATS: return MATS[name]
    v = PALETTE[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*v[0], 1)
    p.inputs['Roughness'].default_value = v[1]
    p.inputs['Metallic'].default_value = v[2] if len(v) > 2 else 0.0
    if len(v) > 3:
        p.inputs['Emission Color'].default_value = (*v[3], 1); p.inputs['Emission Strength'].default_value = v[4]
    MATS[name] = m
    return m

# ---------------------------------------------------------------- primitive helpers (Blender coords: Z up, front = -Y)
CUR = []

def _take(o, mat):
    o.data.materials.clear(); o.data.materials.append(M(mat)); CUR.append(o); return o

def mesh(mat, verts, faces, name='part'):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    return _take(o, mat)

def box(mat, size, loc, rot=(0, 0, 0)):
    """size (x, y, z), loc = centre of the bottom face."""
    sx, sy, sz = size
    v = [(x * sx / 2, y * sy / 2, z * sz) for z in (0, 1) for y in (-1, 1) for x in (-1, 1)]
    o = mesh(mat, v, [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)])
    o.location = loc; o.rotation_euler = rot
    return o

def cyl(mat, r, h, loc, verts=8, r2=None, rot=(0, 0, 0), cap=True):
    """Cylinder/frustum standing on loc (bottom centre). r2 = top radius."""
    r2 = r if r2 is None else r2
    v, f = [], []
    for i in range(verts):
        a = i / verts * math.tau
        v += [(r * math.cos(a), r * math.sin(a), 0), (r2 * math.cos(a), r2 * math.sin(a), h)]
    for i in range(verts):
        j = (i + 1) % verts
        f.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
    if r2 < 1e-4:  # cone: collapse the top ring
        v = [v[2 * i] for i in range(verts)] + [(0, 0, h)]
        f = [(i, (i + 1) % verts, verts) for i in range(verts)]
    if cap:
        f.append(tuple(2 * i for i in reversed(range(verts))) if r2 >= 1e-4 else tuple(reversed(range(verts))))
        if r2 >= 1e-4: f.append(tuple(2 * i + 1 for i in range(verts)))
    o = mesh(mat, v, f); o.location = loc; o.rotation_euler = rot
    return o

def ico(mat, r, loc, scale=(1, 1, 1), sub=1, jitter=0.0, seed=0):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    rnd = random.Random(seed)
    for vt in bm.verts:
        if jitter: vt.co *= 1 + rnd.uniform(-jitter, jitter)
        vt.co.x *= scale[0]; vt.co.y *= scale[1]; vt.co.z *= scale[2]
    me = bpy.data.meshes.new('ico'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('ico', me); bpy.context.scene.collection.objects.link(o); o.location = loc
    return _take(o, mat)

def prism(mat, profile, length, loc=(0, 0, 0), axis='X', rot=(0, 0, 0)):
    """Extrude a 2D profile [(u, z)] along `axis` (X: u is Y; Y: u is X), centred on loc."""
    n = len(profile); v = []
    for s in (-0.5, 0.5):
        for u, z in profile:
            v.append((s * length, u, z) if axis == 'X' else (u, s * length, z))
    f = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    f += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    o = mesh(mat, v, f); o.location = loc; o.rotation_euler = rot
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(o.data); bm.free()
    return o

def gable(mat, w, d, h, t=0.25, z=0, over=0.5, loc=(0, 0)):
    """Gable roof: ridge along X (width w), slopes to front/back (depth d), eave height z."""
    hd = d / 2 + over
    prof = [(-hd, z), (0, z + h + over * h / (d / 2)), (hd, z), (hd, z + t), (0, z + h + over * h / (d / 2) + t * 1.2), (-hd, z + t)]
    prof = [(-hd, z), (-hd, z + t), (0, z + h * (hd / (d / 2)) + t), (hd, z + t), (hd, z), (0, z + h * (hd / (d / 2)))]
    return prism(mat, prof, w + 2 * over * 0.6, loc=(loc[0], loc[1], 0))

def hip(mat, w, d, h, z, ridge=0.45, t=0.4):
    """Hipped roof (寄棟): solid with eave rectangle w x d at height z, ridge along X."""
    rx = w / 2 * ridge
    v = [(-w / 2, -d / 2, z), (w / 2, -d / 2, z), (w / 2, d / 2, z), (-w / 2, d / 2, z),
         (-w / 2, -d / 2, z + t), (w / 2, -d / 2, z + t), (w / 2, d / 2, z + t), (-w / 2, d / 2, z + t),
         (-rx, 0, z + h), (rx, 0, z + h)]
    f = [(3, 2, 1, 0), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
         (4, 5, 9, 8), (5, 6, 9), (6, 7, 8, 9), (7, 4, 8)]
    return mesh(mat, v, f)

# ---------------------------------------------------------------- model registry
MODELS = {}
def model(name, jp, cat):
    def deco(fn): MODELS[name] = (fn, jp, cat); return fn
    return deco

def build(name):
    CUR.clear()
    fn, jp, cat = MODELS[name]
    random.seed(hash(name) & 0xffff)
    fn()
    for o in bpy.context.view_layer.objects.selected: o.select_set(False)
    for o in CUR: o.select_set(True)
    bpy.context.view_layer.objects.active = CUR[0]
    bpy.ops.object.join()
    o = bpy.context.object; o.name = name; o.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()
    bpy.ops.object.shade_flat()
    col = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(col)
    for c in o.users_collection: c.objects.unlink(o)
    col.objects.link(o)
    return o

# ================================================================= buildings

@model('kominka', '古民家(茅葺き)', '建物')
def kominka():
    W, D, H = 11, 7.5, 2.8
    box('stone_dark', (W + 0.4, D + 0.4, 0.45), (0, 0, 0))
    box('plaster', (W, D, H), (0, 0, 0.45))
    for x in (-W / 2, -W / 6, W / 6, W / 2):  # posts
        for y in (-D / 2, D / 2): box('wood_dark', (0.25, 0.25, H), (x, y, 0.45))
    box('wood_dark', (W + 0.1, D + 0.1, 0.25), (0, 0, 0.45 + H - 0.25))
    for i in range(6):  # shoji front
        box('shoji', (W / 6 - 0.15, 0.06, 1.9), (-W / 2 + W / 12 + i * W / 6, -D / 2 - 0.03, 0.75))
        box('wood_dark', (0.06, 0.08, 1.9), (-W / 2 + i * W / 6, -D / 2 - 0.05, 0.75))
    box('wood_light', (W, 1.0, 0.12), (0, -D / 2 - 0.5, 0.45))  # engawa
    for x in (-W / 2 + 0.2, 0, W / 2 - 0.2): box('wood_dark', (0.12, 0.12, 0.45), (x, -D / 2 - 0.9, 0))
    hip('thatch', W + 2.0, D + 2.4, 4.6, 0.45 + H - 0.2, ridge=0.5, t=0.55)
    box('thatch_dark', (W * 0.55, 0.9, 0.5), (0, 0, 0.45 + H + 4.2))  # ridge cap
    box('stone', (1.2, 0.6, 0.25), (0, -D / 2 - 1.6, 0))  # step stone

@model('kura', '蔵', '建物')
def kura():
    W, D, H = 4.4, 5.5, 4.2
    box('stone_dark', (W, D, 1.2), (0, 0, 0))
    for i in range(4):  # namako-kabe grid
        box('white', (W + 0.02, 0.05, 0.05), (0, 0, 0.25 + i * 0.25)) if False else None
        box('white', (W + 0.02, D + 0.02, 0.04), (0, 0, 0.2 + i * 0.27))
    box('plaster', (W, D, H - 1.2), (0, 0, 1.2))
    box('black', (1.4, 0.2, 2.0), (0, -D / 2 - 0.05, 0.2))  # door
    box('plaster', (1.7, 0.4, 0.3), (0, -D / 2 - 0.1, 2.25))  # door hood
    box('black', (0.7, 0.15, 0.6), (0, -D / 2 - 0.02, 3.1))  # window
    box('tile', (W + 0.3, D + 0.3, 0.25), (0, 0, H))
    gable('tile', D, W, 1.6, z=H + 0.2, over=0.5, loc=(0, 0)).rotation_euler.z = math.pi / 2
    box('tile', (0.3, D + 1.4, 0.35), (0, 0, H + 0.2 + 1.6 * (2.7 / 2.2) + 0.1))

@model('naya', '納屋', '建物')
def naya():
    W, D, H = 5.0, 4.0, 2.6
    box('wood', (W, D, H), (0, 0, 0))
    for i in range(9): box('wood_dark', (0.06, 0.04, H), (-W / 2 + 0.3 + i * (W - 0.6) / 8, -D / 2 - 0.02, 0))
    box('wood_dark', (2.0, 0.08, 2.1), (-0.8, -D / 2 - 0.05, 0))  # sliding door
    box('black', (0.6, 0.06, 0.4), (1.6, -D / 2 - 0.04, 1.6))
    prism('tin', [(-D / 2 - 0.6, H + 0.9), (D / 2 + 0.5, H - 0.1), (D / 2 + 0.5, H), (-D / 2 - 0.6, H + 1.0)], W + 0.8)  # lean-to tin roof
    box('wood_dark', (0.12, 0.12, H + 0.8), (-W / 2 - 0.2, -D / 2 - 0.5, 0)); box('wood_dark', (0.12, 0.12, H + 0.8), (W / 2 + 0.2, -D / 2 - 0.5, 0))
    for i in range(3): box('wood_light', (0.9, 0.5, 0.45), (W / 2 + 0.4, 0.8 - i * 0.6, 0))  # stacked crates? firewood
    for i in range(2): box('wood_light', (0.9, 0.5, 0.45), (W / 2 + 0.4, 0.5 - i * 0.6, 0.45))

@model('hokora', '祠', '建物')
def hokora():
    box('stone', (1.4, 1.4, 0.5), (0, 0, 0)); box('stone', (1.1, 1.1, 0.3), (0, 0, 0.5))
    box('wood', (0.75, 0.7, 0.7), (0, 0, 0.8))
    box('wood_dark', (0.5, 0.05, 0.5), (0, -0.37, 0.9))
    gable('wood_dark', 0.9, 0.8, 0.35, t=0.08, z=1.5, over=0.2)
    box('white', (0.04, 0.02, 0.25), (0, -0.62, 1.2))  # shide paper

@model('torii', '鳥居', '建物')
def torii():
    for x in (-1.3, 1.3):
        cyl('vermilion', 0.17, 3.6, (x, 0, 0), verts=10, r2=0.15)
        cyl('black', 0.22, 0.35, (x, 0, 0), verts=10)
    box('vermilion', (3.4, 0.22, 0.25), (0, 0, 2.8))  # nuki
    box('vermilion', (0.2, 0.2, 0.6), (0, 0, 3.05))  # gakuzuka
    prism('black', [(-0.22, 3.62), (0.22, 3.62), (0.22, 3.85), (-0.22, 3.85)], 3.6)  # shimaki
    k = []
    for i in range(9):
        x = -2.3 + i * 4.6 / 8; lift = (abs(x) / 2.3) ** 2 * 0.25
        k.append((x, 3.85 + lift))
    v = [(x, y, z) for x, z in k for y in (-0.25, 0.25)] + [(x, y, z + 0.22) for x, z in k for y in (-0.25, 0.25)]
    n = len(k); f = []
    for i in range(n - 1):
        a, b = 2 * i, 2 * (i + 1); A, B = 2 * n + a, 2 * n + b
        f += [(a, b, b + 1, a + 1), (A + 1, B + 1, B, A), (a, A, B, b), (a + 1, b + 1, B + 1, A + 1)]
    f += [(0, 1, 2 * n + 1, 2 * n), (2 * n - 2, 2 * n * 2 - 2, 2 * n * 2 - 1, 2 * n - 1)]
    mesh('black', v, f)  # kasagi with upturned ends

@model('bus_stop', 'バス停(待合小屋)', '建物')
def bus_stop():
    W, D, H = 3.0, 1.6, 2.3
    box('concrete', (W + 0.4, D + 0.4, 0.12), (0, 0, 0))
    box('wood', (W, 0.1, H), (0, D / 2, 0.12))
    for x in (-W / 2, W / 2): box('wood', (0.1, D, H), (x, 0, 0.12))
    prism('tin', [(-D / 2 - 0.5, H + 0.12), (D / 2 + 0.2, H + 0.45), (D / 2 + 0.2, H + 0.52), (-D / 2 - 0.5, H + 0.19)], W + 0.5)
    box('wood_light', (W - 0.3, 0.4, 0.06), (0, D / 2 - 0.3, 0.55)); box('wood_dark', (W - 0.3, 0.06, 0.43), (0, D / 2 - 0.12, 0.12))
    cyl('metal', 0.04, 2.3, (W / 2 + 0.8, -D / 2 - 0.2, 0), verts=8)
    cyl('red', 0.35, 0.05, (W / 2 + 0.8, -D / 2 - 0.2, 2.2), verts=16, rot=(math.pi / 2, 0, 0))
    cyl('white', 0.27, 0.07, (W / 2 + 0.8, -D / 2 - 0.2, 2.2), verts=16, rot=(math.pi / 2, 0, 0))
    box('white', (0.5, 0.04, 0.7), (W / 2 + 0.8, -D / 2 - 0.22, 1.1))  # timetable
    box('concrete', (0.5, 0.5, 0.12), (W / 2 + 0.8, -D / 2 - 0.2, 0))

# ================================================================= small structures

@model('jizo', 'お地蔵さん', '小物')
def jizo():
    box('stone_dark', (0.6, 0.5, 0.2), (0, 0, 0))
    cyl('stone', 0.2, 0.55, (0, 0, 0.2), verts=10, r2=0.16)
    ico('stone', 0.15, (0, 0, 0.85), scale=(1, 1, 1.1))
    box('red', (0.22, 0.05, 0.18), (0, -0.16, 0.52), rot=(-0.1, 0, 0))  # bib
    cyl('red', 0.135, 0.06, (0, 0, 0.93), verts=10, r2=0.09)  # knitted cap
    box('stone_dark', (0.3, 0.2, 0.05), (0, -0.35, 0.0))  # offering step

@model('ishidoro', '石灯籠', '小物')
def ishidoro():
    cyl('stone', 0.4, 0.2, (0, 0, 0), verts=6)
    cyl('stone', 0.14, 0.9, (0, 0, 0.2), verts=8)
    cyl('stone', 0.35, 0.15, (0, 0, 1.1), verts=6)
    cyl('stone', 0.25, 0.4, (0, 0, 1.25), verts=6)
    box('lamp', (0.2, 0.52, 0.22), (0, 0, 1.33)); box('lamp', (0.52, 0.2, 0.22), (0, 0, 1.33))
    cyl('stone', 0.55, 0.3, (0, 0, 1.65), verts=6, r2=0.08)
    ico('stone', 0.1, (0, 0, 2.02), sub=1)

@model('ido', '井戸', '小物')
def ido():
    for i in range(12):
        a = i / 12 * math.tau
        box('stone', (0.42, 0.25, 0.75), (math.cos(a) * 0.55, math.sin(a) * 0.55, 0), rot=(0, 0, a + math.pi / 2))
    cyl('stone', 0.72, 0.74, (0, 0, 0), verts=12)
    cyl('black', 0.38, 0.02, (0, 0, 0.74), verts=12)
    for x in (-0.85, 0.85): box('wood', (0.12, 0.12, 2.0), (x, 0, 0))
    box('wood', (1.9, 0.12, 0.12), (0, 0, 1.85))
    gable('wood_dark', 2.1, 1.0, 0.35, t=0.06, z=2.0, over=0.15)
    cyl('wood_dark', 0.12, 0.08, (0, 0.04, 1.6), verts=10, rot=(math.pi / 2, 0, 0))  # pulley
    cyl('wood_light', 0.15, 0.25, (0.3, 0, 0.75), verts=10, r2=0.17)  # bucket on the rim

@model('denchu', '電柱', '道路')
def denchu():
    cyl('concrete', 0.17, 9.0, (0, 0, 0), verts=8, r2=0.12)
    box('metal', (1.8, 0.1, 0.1), (0, 0, 8.3))
    for x in (-0.8, 0, 0.8): cyl('white', 0.05, 0.15, (x, 0, 8.4), verts=6)
    cyl('metal', 0.25, 0.6, (0, 0.35, 6.8), verts=10)  # transformer
    box('yellow', (0.32, 0.05, 1.6), (0, -0.17, 1.4))  # warning band plate
    box('white', (0.3, 0.04, 0.5), (0, -0.16, 2.3))

@model('jihanki', '自動販売機', '道路')
def jihanki():
    box('white', (1.0, 0.75, 1.8), (0, 0, 0))
    box('red', (1.02, 0.77, 0.3), (0, 0, 1.75))
    box('glow', (0.86, 0.02, 0.85), (0, -0.38, 0.85))
    cols = ['red', 'blue', 'yellow', 'leaf_light', 'kaki', 'white']
    for r in range(3):
        for c in range(6):
            box(cols[(r * 2 + c) % 6], (0.09, 0.05, 0.2), (-0.35 + c * 0.14, -0.4, 0.92 + r * 0.27))
    box('black', (0.7, 0.04, 0.22), (0, -0.38, 0.2))  # outlet
    box('black', (0.12, 0.04, 0.2), (0.38, -0.38, 0.55))  # coin slot panel

@model('post', '郵便ポスト(丸型)', '道路')
def post():
    cyl('stone_dark', 0.28, 0.12, (0, 0, 0), verts=12)
    cyl('red', 0.22, 1.05, (0, 0, 0.12), verts=14)
    ico('red', 0.22, (0, 0, 1.17), scale=(1, 1, 0.45), sub=2)
    cyl('red', 0.25, 0.05, (0, 0, 1.12), verts=14)
    box('black', (0.22, 0.04, 0.05), (0, -0.215, 0.95))
    box('white', (0.14, 0.03, 0.14), (0, -0.215, 0.7))

@model('kakashi', '案山子', '農地')
def kakashi():
    cyl('wood', 0.04, 1.7, (0, 0, 0), verts=6)
    cyl('wood', 0.03, 1.4, (-0.7, 0, 1.25), verts=6, rot=(0, math.pi / 2, 0))
    box('cloth', (0.45, 0.25, 0.55), (0, 0, 0.85))
    box('cloth', (1.1, 0.18, 0.16), (0, 0, 1.17))
    ico('skin_cloth', 0.19, (0, 0, 1.55), sub=1)
    box('black', (0.06, 0.02, 0.03), (-0.07, -0.18, 1.6)); box('black', (0.06, 0.02, 0.03), (0.07, -0.18, 1.6))
    cyl('straw', 0.42, 0.18, (0, 0, 1.66), verts=12, r2=0.08)
    for x in (-0.6, 0.6): cyl('straw', 0.05, 0.25, (x, 0, 1.0), verts=6, r2=0.09)

@model('hasakake', '稲架掛け', '農地')
def hasakake():
    L = 4.0
    for x in (-L / 2, 0, L / 2):
        cyl('wood', 0.05, 1.9, (x, 0.25, 0), verts=6, rot=(0.25, 0, 0)); cyl('wood', 0.05, 1.9, (x, -0.25, 0), verts=6, rot=(-0.25, 0, 0))
    cyl('wood', 0.04, L + 0.4, (-L / 2 - 0.2, 0, 1.55), verts=6, rot=(0, math.pi / 2, 0))
    for i in range(16):  # rice sheaves hung over the pole
        x = -L / 2 + 0.15 + i * (L - 0.3) / 15
        prism('straw', [(-0.32, 0.75), (0, 1.62), (0.32, 0.75), (0.18, 0.7), (0, 1.3), (-0.18, 0.7)], 0.2, loc=(x, 0, 0))

@model('tanbo', '田んぼ(8m区画)', '農地')
def tanbo():
    S = 8.0
    box('water', (S, S, 0.05), (0, 0, 0.0))
    for s in (-1, 1):
        box('grass', (S + 0.6, 0.5, 0.22), (0, s * (S / 2 + 0.05), 0))
        box('grass', (0.5, S, 0.22), (s * (S / 2 + 0.05), 0, 0))
    n = 11
    for i in range(n):
        for j in range(n):
            x = -S / 2 + 0.55 + i * (S - 1.1) / (n - 1); y = -S / 2 + 0.55 + j * (S - 1.1) / (n - 1)
            cyl('rice', 0.09, 0.42 + random.uniform(-0.05, 0.05), (x, y, 0.03), verts=4, r2=0.0, cap=False)

@model('take_gaki', '竹垣(2m)', '農地')
def take_gaki():
    for x in (-1.0, 1.0): cyl('wood', 0.06, 1.3, (x, 0, 0), verts=6)
    for z in (0.35, 0.95): cyl('bamboo', 0.03, 2.1, (-1.05, -0.05, z), verts=6, rot=(0, math.pi / 2, 0))
    for i in range(14):
        cyl('bamboo', 0.025, 1.15, (-0.95 + i * 1.9 / 13, 0, 0), verts=5)

@model('ishigaki', '石垣(4m)', '農地')
def ishigaki():
    for r in range(4):
        x = -2.0 + (0.25 if r % 2 else 0)
        while x < 2.0:
            w = random.uniform(0.4, 0.65)
            w = min(w, 2.0 - x)
            if w > 0.12:
                ico('stone' if random.random() < 0.7 else 'stone_dark', 0.5, (x + w / 2, 0, r * 0.3 + 0.15), scale=(w * 0.95, 0.5, 0.29), sub=1, jitter=0.12, seed=int(x * 100) + r)
            x += w
    box('stone_dark', (4.0, 0.4, 1.0), (0, 0.25, 0))  # core behind the face stones
    box('moss', (4.0, 0.7, 0.06), (0, 0.1, 1.0))

@model('hashi', '木の橋', '道路')
def hashi():
    L, W = 6.0, 1.8
    for i in range(16):
        box('wood_light', (0.34, W, 0.08), (-L / 2 + 0.2 + i * (L - 0.4) / 15, 0, 0.6))
    for y in (-W / 2 + 0.1, W / 2 - 0.1): box('wood', (L, 0.15, 0.15), (0, y, 0.45))
    for x in (-L / 2 + 0.2, 0, L / 2 - 0.2):
        for y in (-W / 2, W / 2):
            box('wood', (0.15, 0.15, 1.65), (x, y, 0))
    for y in (-W / 2, W / 2): box('wood', (L, 0.1, 0.1), (0, y, 1.55))

# ================================================================= vehicles

@model('keitora', '軽トラ', '乗り物')
def keitora():
    L, W = 3.4, 1.48
    prism('white', [(-L / 2, 0.35), (-L / 2, 1.0), (-L / 2 + 0.25, 1.85), (-L / 2 + 1.25, 1.85), (-L / 2 + 1.3, 1.0), (-L / 2 + 1.3, 0.35)], W, axis='Y', rot=(0, 0, math.pi / 2))
    prism('glass', [(-L / 2 - 0.01, 1.05), (-L / 2 + 0.22, 1.78), (-L / 2 + 0.6, 1.78), (-L / 2 + 0.6, 1.05)], W + 0.01, axis='Y', rot=(0, 0, math.pi / 2))
    prism('glass', [(-L / 2 + 0.7, 1.08), (-L / 2 + 0.7, 1.75), (-L / 2 + 1.18, 1.75), (-L / 2 + 1.18, 1.08)], W + 0.02, axis='Y', rot=(0, 0, math.pi / 2))
    box('white', (W, L - 1.3, 0.12), (0, 0.65, 0.45))  # bed floor (front is -Y)
    for s in (-1, 1): box('white', (0.05, L - 1.3, 0.38), (s * (W / 2 - 0.025), 0.65, 0.57))
    box('white', (W, 0.05, 0.38), (0, L / 2 - 0.03, 0.57))
    box('white', (W, 0.05, 0.38), (0, -L / 2 + 1.33, 0.57))
    box('metal', (W + 0.04, 0.14, 0.14), (0, -L / 2 - 0.04, 0.35))
    box('glow', (0.25, 0.03, 0.12), (-0.5, -L / 2 - 0.01, 0.75)); box('glow', (0.25, 0.03, 0.12), (0.5, -L / 2 - 0.01, 0.75))
    box('red', (0.15, 0.03, 0.2), (-0.6, L / 2, 0.55)); box('red', (0.15, 0.03, 0.2), (0.6, L / 2, 0.55))
    for y in (-L / 2 + 0.55, L / 2 - 0.55):
        for s in (-1, 1):
            cyl('rubber', 0.3, 0.2, (s * (W / 2 - 0.08), y, 0.3), verts=12, rot=(0, math.pi / 2, 0)).location.x += -0.1 * s if s > 0 else 0.1
            cyl('metal', 0.16, 0.22, (s * (W / 2 - 0.08) - (0.11 if s > 0 else -0.11), y, 0.3), verts=8, rot=(0, math.pi / 2, 0))
    box('black', (W + 0.02, L - 0.4, 0.15), (0, 0.1, 0.25))

@model('kounki', '耕運機', '乗り物')
def kounki():
    box('red', (0.6, 0.8, 0.45), (0, 0, 0.35))  # engine
    box('black', (0.45, 0.4, 0.25), (0, -0.1, 0.8))
    cyl('metal', 0.05, 0.4, (0.18, 0.15, 0.8), verts=6)
    for s in (-1, 1):
        cyl('rubber', 0.32, 0.18, (s * 0.4 - 0.09 * (1 if s > 0 else -1) * 0 + (s * 0.09 if s < 0 else -0.09), -0.1, 0.32), verts=12, rot=(0, math.pi / 2, 0))
        cyl('metal', 0.03, 1.1, (s * 0.25, 0.3, 0.6), verts=6, rot=(-1.0, 0, 0))  # handles
    cyl('rubber', 0.04, 0.6, (-0.3, 0.75, 1.15), verts=6, rot=(0, math.pi / 2, 0))
    box('metal', (0.5, 0.35, 0.25), (0, 0.55, 0.05))  # rotary tiller guard

# ================================================================= nature

@model('sugi', '杉', '自然')
def sugi():
    cyl('bark', 0.22, 2.5, (0, 0, 0), verts=7, r2=0.18)
    for i, (r, z, h) in enumerate([(1.7, 2.0, 3.2), (1.4, 3.6, 3.0), (1.05, 5.1, 2.8), (0.7, 6.6, 2.4)]):
        cyl('leaf_dark', r, h, (0, 0, z), verts=8, r2=0.0)

@model('kaki_tree', '柿の木', '自然')
def kaki_tree():
    cyl('bark', 0.18, 1.6, (0, 0, 0), verts=7, r2=0.14)
    for a, l in ((0.5, 1.2), (2.4, 1.0), (4.2, 1.1)):
        cyl('bark', 0.09, l, (0, 0, 1.4), verts=6, r2=0.06, rot=(0.8 * math.cos(a), 0.8 * math.sin(a), 0))
    blobs = [((0, 0, 2.8), 1.4), ((0.9, 0.3, 2.4), 1.0), ((-0.8, -0.4, 2.5), 1.0), ((0.1, -0.9, 2.3), 0.9), ((-0.2, 0.8, 2.6), 0.9)]
    for i, (p, r) in enumerate(blobs): ico('leaf', r, p, scale=(1, 1, 0.8), sub=1, jitter=0.15, seed=i)
    for i in range(22):
        b = blobs[i % len(blobs)]; d = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.6, 0.7))).normalized()
        ico('kaki', 0.11, Vector(b[0]) + d * b[1] * Vector((1, 1, 0.8)) * 0.95, scale=(1, 1, 0.85), sub=1)

@model('sakura', '桜', '自然')
def sakura():
    cyl('bark', 0.25, 1.8, (0, 0, 0), verts=7, r2=0.2)
    for a in (0.3, 2.2, 4.1):
        cyl('bark', 0.12, 1.6, (0, 0, 1.6), verts=6, r2=0.07, rot=(0.9 * math.cos(a), 0.9 * math.sin(a), 0))
    for i, (p, r) in enumerate([((0, 0, 3.4), 1.7), ((1.3, 0.4, 3.0), 1.3), ((-1.2, -0.5, 3.0), 1.3), ((0.2, -1.2, 2.9), 1.1), ((-0.3, 1.2, 3.1), 1.2)]):
        ico('sakura', r, p, scale=(1, 1, 0.75), sub=1, jitter=0.15, seed=i)

@model('take', '竹やぶ', '自然')
def take():
    for i in range(9):
        a = random.uniform(0, math.tau); r = random.uniform(0, 0.9)
        x, y = math.cos(a) * r, math.sin(a) * r; h = random.uniform(6, 8.5)
        tilt = (random.uniform(-0.08, 0.08), random.uniform(-0.08, 0.08), 0)
        cyl('bamboo', 0.06, h, (x, y, 0), verts=6, r2=0.04, rot=tilt)
        tip = Vector((x, y, 0)) + Matrix.Rotation(tilt[0], 3, 'X') @ Matrix.Rotation(tilt[1], 3, 'Y') @ Vector((0, 0, h))
        ico('leaf_light', 0.8, tip - Vector((0, 0, 0.6)), scale=(1, 1, 1.6), sub=1, jitter=0.2, seed=i)
        ico('bamboo', 0.6, tip * 0.75 + Vector((random.uniform(-0.4, 0.4), random.uniform(-0.4, 0.4), 0)), scale=(1.2, 1.2, 0.9), sub=1, jitter=0.2, seed=i + 50)

@model('rock', '岩', '自然')
def rock():
    ico('stone', 0.9, (0, 0, 0.35), scale=(1.2, 1, 0.75), sub=1, jitter=0.2, seed=3)
    ico('stone_dark', 0.5, (0.9, 0.4, 0.15), scale=(1, 1, 0.7), sub=1, jitter=0.2, seed=4)
    ico('moss', 0.55, (-0.2, 0.1, 0.85), scale=(1.4, 1.1, 0.25), sub=1, jitter=0.1, seed=5)

@model('bush', '茂み', '自然')
def bush():
    for i, (p, r) in enumerate([((0, 0, 0.45), 0.6), ((0.55, 0.2, 0.35), 0.45), ((-0.5, -0.1, 0.35), 0.5), ((0.1, 0.45, 0.3), 0.4)]):
        ico('leaf' if i % 2 else 'leaf_light', r, p, sub=1, jitter=0.15, seed=i)

@model('tanuki', '信楽たぬき', '小物')
def tanuki():
    cyl('stone_dark', 0.35, 0.08, (0, 0, 0), verts=10)
    ico('brown', 0.32, (0, 0, 0.42), scale=(1, 0.95, 1.05), sub=2)
    ico('straw', 0.24, (0, -0.12, 0.38), scale=(1, 0.8, 1), sub=2)  # belly
    ico('brown', 0.2, (0, -0.02, 0.85), sub=2)
    for s in (-1, 1):
        ico('white', 0.06, (s * 0.08, -0.17, 0.88), sub=1); ico('black', 0.03, (s * 0.08, -0.22, 0.88), sub=1)
        ico('brown', 0.05, (s * 0.12, 0, 1.03), sub=1)
    cyl('straw', 0.3, 0.06, (0, 0, 0.98), verts=12, r2=0.22); cyl('straw', 0.17, 0.12, (0, 0, 1.03), verts=12, r2=0.14)  # hat
    ico('black', 0.04, (0, -0.2, 0.8), sub=1)
    cyl('wood_light', 0.07, 0.16, (0.3, -0.05, 0.35), verts=8)  # sake flask

# ---------------------------------------------------------------- export / preview

def export(o, path):
    for s in bpy.context.view_layer.objects.selected: s.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_cameras=False, export_lights=False, export_materials='EXPORT')

def setup_render():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 32; sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = 384
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 88
    w = bpy.data.worlds.new('w'); sc.world = w; w.color = (0.55, 0.65, 0.75)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.lens = 50
    sc.collection.objects.link(cam); sc.camera = cam
    L = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); L.data.energy = 3.5; L.data.angle = 0.1
    L.rotation_euler = (0.7, 0.15, -0.5); sc.collection.objects.link(L)
    fl = bpy.data.objects.new('floor', bpy.data.meshes.new('floor')); sc.collection.objects.link(fl)
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=500); bm.to_mesh(fl.data); bm.free()
    fl.data.materials.append(M('grass'))

def render(o, path):
    sc = bpy.context.scene
    for c in sc.view_layers[0].layer_collection.children: c.exclude = c.name != o.name
    pts = [o.matrix_world @ Vector(b) for b in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
    ctr, size = (lo + hi) / 2, (hi - lo).length
    d = Vector((-0.6, -1.0, 0.5)).normalized()
    sc.camera.location = ctr + d * size * 1.45
    sc.camera.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for c in sc.view_layers[0].layer_collection.children: c.exclude = False


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    names = [a for a in argv if not a.startswith('--')] or list(MODELS)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(GLB, exist_ok=True)
    meta_path = os.path.join(ROOT, 'models.json')
    meta = {m['name']: m for m in json.load(open(meta_path))} if os.path.exists(meta_path) else {}
    objs = {}
    for n in names:
        o = objs[n] = build(n)
        export(o, os.path.join(GLB, n + '.glb'))
        dims = [round(v, 2) for v in (o.dimensions.x, o.dimensions.z, o.dimensions.y)]  # glTF x, y(up), z
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        _, jp, cat = MODELS[n]
        meta[n] = {'name': n, 'jp': jp, 'category': cat, 'size_m': dims, 'tris': tris,
                   'materials': [m.name for m in o.data.materials], 'kb': round(os.path.getsize(os.path.join(GLB, n + '.glb')) / 1024, 1)}
        print(f'{n:12s} {jp:12s} {tris:6d} tris  {dims}')
    order = list(MODELS)
    json.dump([meta[k] for k in order if k in meta], open(meta_path, 'w'), ensure_ascii=False, indent=1)
    if '--render' in argv:
        os.makedirs(PREVIEW, exist_ok=True); setup_render()
        for n, o in objs.items(): render(o, os.path.join(PREVIEW, n + '.jpg'))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'inaka.blend'), compress=True)
