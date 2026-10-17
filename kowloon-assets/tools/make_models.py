# Walled-city (九龍城砦風) model kit: stackable floor modules, facade clutter, rooftop and alley props.
# Built with Blender's Python API on top of the countryside kit's primitives (../../inaka-assets/tools/make_models.py).
#   pip install bpy pillow
#   python3 tools/make_textures.py               # grimy walls, tin, shutters, neon signs (textures/)
#   python3 tools/make_models.py [--render] [--hi] [--demo] [names...]
# Conventions: 1 unit = 1 m, Y-up glTF, front faces +Z.
#   * floor modules: origin at the centre of the floor; one storey is 3 m, so stack them every 3 m.
#   * things fixed to a wall (signs, AC units, cages, pipes...): origin where they touch the wall (bottom centre); they stick out towards +Z.
#   * everything else: origin at the centre of the footprint on the ground.
import json, math, os, random, sys
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
TEXDIR = os.path.join(ROOT, 'textures')
sys.path.insert(0, os.path.normpath(os.path.join(ROOT, '..', 'inaka-assets', 'tools')))
import make_models as K  # noqa: E402  (shared primitives: box, cyl, ico, prism, part, build ...)
from make_models import box, cyl, ico, prism, gable, part, M  # noqa: E402

K.MODELS.clear()
SUFFIX = '_hi' if K.HI else ''
GLB, PREVIEW = os.path.join(ROOT, 'glb' + SUFFIX), os.path.join(ROOT, 'preview' + SUFFIX)
K.PALETTE.update({
    'alu': ((0.62, 0.63, 0.62), 0.4, 1.0), 'glass_dark': ((0.03, 0.04, 0.05), 0.08), 'grille': ((0.16, 0.22, 0.2), 0.6, 0.6),
    'rust': ((0.42, 0.2, 0.1), 0.85, 0.3), 'red_plastic': ((0.75, 0.08, 0.06), 0.5), 'blue_plastic': ((0.1, 0.3, 0.7), 0.5),
    'green_plastic': ((0.12, 0.45, 0.2), 0.5), 'foam': ((0.92, 0.92, 0.9), 0.9), 'trash': ((0.02, 0.02, 0.025), 0.35),
    'lpg': ((0.85, 0.35, 0.08), 0.45), 'cable': ((0.02, 0.02, 0.02), 0.6), 'ac_white': ((0.78, 0.77, 0.72), 0.6),
    'bulb': ((1.0, 0.85, 0.6), 0.3, 0.0, (1.0, 0.75, 0.45), 6.0), 'tube_light': ((0.9, 1.0, 0.95), 0.3, 0.0, (0.8, 1.0, 0.9), 6.0),
    'shrine_red': ((0.55, 0.04, 0.03), 0.4, 0.0, (1.0, 0.1, 0.05), 0.5), 'gold': ((0.85, 0.62, 0.2), 0.3, 1.0),
    'cloth_a': ((0.85, 0.85, 0.82), 0.9), 'cloth_b': ((0.25, 0.35, 0.65), 0.9), 'cloth_c': ((0.75, 0.3, 0.3), 0.9), 'cloth_d': ((0.9, 0.75, 0.3), 0.9),
    'bamboo_dry': ((0.62, 0.52, 0.3), 0.6), 'water_blue': ((0.15, 0.35, 0.6), 0.4),
})

# ---------------------------------------------------------------- textured parts
TEXMATS = {}
def T(name, emit=0.0, rough=0.88, metal=0.0):
    """Material using textures/<name>.jpg (also as emission for lit windows and neon signs)."""
    key = (name, emit)
    if key in TEXMATS: return TEXMATS[key]
    m = bpy.data.materials.new(name + ('_lit' if emit else ''))
    m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links
    p = N['Principled BSDF']; p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    t = N.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(TEXDIR, name + '.jpg'), check_existing=True)
    L.new(t.outputs['Color'], p.inputs['Base Color'])
    if emit: L.new(t.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = emit
    TEXMATS[key] = m
    return m

def _take_m(o, m, kind='box'):
    o.data.materials.clear(); o.data.materials.append(m); o['part'] = K.PART['name'] or ''; o['kind'] = kind
    if K.HI: K.hi_detail(o, m.name, kind)
    K.CUR.append(o); return o

def tbox(m, size, loc, rot=(0, 0, 0), tile=2.0):
    """Box with per-face UVs: textures repeat every `tile` metres, or tile='fit' stretches the image over each face."""
    sx, sy, sz = size; hx, hy = sx / 2, sy / 2
    faces = [  # (4 corners, face width, face height)
        ([(-hx, -hy, 0), (hx, -hy, 0), (hx, -hy, sz), (-hx, -hy, sz)], sx, sz),  # front (-Y)
        ([(hx, hy, 0), (-hx, hy, 0), (-hx, hy, sz), (hx, hy, sz)], sx, sz),      # back
        ([(hx, -hy, 0), (hx, hy, 0), (hx, hy, sz), (hx, -hy, sz)], sy, sz),      # right
        ([(-hx, hy, 0), (-hx, -hy, 0), (-hx, -hy, sz), (-hx, hy, sz)], sy, sz),  # left
        ([(-hx, -hy, sz), (hx, -hy, sz), (hx, hy, sz), (-hx, hy, sz)], sx, sy),  # top
        ([(-hx, hy, 0), (hx, hy, 0), (hx, -hy, 0), (-hx, -hy, 0)], sx, sy),      # bottom
    ]
    verts, polys, uvs = [], [], []
    for corners, fw, fh in faces:
        i = len(verts); verts += corners; polys.append((i, i + 1, i + 2, i + 3))
        u, v = (1, 1) if tile == 'fit' else (fw / tile, fh / tile)
        uvs += [(0, 0), (u, 0), (u, v), (0, v)]
    me = bpy.data.meshes.new('tbox'); me.from_pydata(verts, [], polys)
    lay = me.uv_layers.new()
    for k, uv in enumerate(uvs): lay.data[k].uv = uv
    o = bpy.data.objects.new('tbox', me); bpy.context.scene.collection.objects.link(o)
    o.location = loc; o.rotation_euler = rot
    return _take_m(o, m if not isinstance(m, str) else T(m), 'box')

def bar(mat, a, b, r=0.02, verts=6):
    a, b = Vector(a), Vector(b); d = b - a
    o = cyl(mat, r, d.length, tuple(a), verts=verts)
    o.rotation_euler = Vector((0, 0, 1)).rotation_difference(d).to_euler()
    return o

def window(x, y, z, w, h, face=-1, lit=None, grille=False):
    """Aluminium window on a wall plane y (face -1 = front wall, +1 = back), bottom-centre (x, z)."""
    s = face
    box('alu', (w + 0.1, 0.07, h + 0.1), (x, y + s * 0.02, z - 0.05))
    if lit is not None: tbox(T(f'window_lit{lit}', emit=2.2), (w, 0.08, h), (x, y + s * 0.025, z), tile='fit')
    else: box('glass_dark', (w, 0.08, h), (x, y + s * 0.025, z))
    box('alu', (0.04, 0.09, h), (x, y + s * 0.03, z))  # sliding sash divider
    box('alu', (w + 0.2, 0.14, 0.05), (x, y + s * 0.06, z - 0.08))  # sill
    if grille:
        for k in range(int(w / 0.12) + 1): box('grille', (0.02, 0.02, h + 0.1), (x - w / 2 + k * 0.12, y + s * 0.14, z - 0.05))
        for zz in (z - 0.05, z + h + 0.03): box('grille', (w + 0.1, 0.03, 0.03), (x, y + s * 0.14, zz))

def wall_block(tex, W, D, H=3.0, tile=2.5):
    tbox('concrete_dark', (W + 0.16, D + 0.16, 0.2), (0, 0, 0), tile=2.0)   # floor slab with a lip
    tbox(tex, (W, D, H - 0.2), (0, 0, 0.2), tile=tile)

# ================================================================= stackable floor modules (6 x 6 x 3 m unless noted)

def _windows(W, D, n, lit_p, grille_p, ac_p=0.0):
    for s in (-1, 1):
        for i in range(n):
            x = -W / 2 + W / n * (i + 0.5)
            lit = random.randrange(4) if random.random() < lit_p else None
            window(x, s * D / 2, 1.0, 1.1, 1.2, face=s, lit=lit, grille=random.random() < grille_p)
            if random.random() < ac_p: _ac(x + 0.15, s * D / 2, 0.45, s)

def _ac(x, y, z, s):
    tbox('concrete', (0.9, 0.07, 0.07), (x, y + s * 0.3, z - 0.07), tile=1)  # bracket
    box('ac_white', (0.75, 0.5, 0.5), (x, y + s * 0.3, z))
    for k in range(7): box('grille', (0.6, 0.02, 0.02), (x - 0.05, y + s * 0.56, z + 0.08 + k * 0.05))
    cyl('cable', 0.015, 0.5, (x + 0.3, y + s * 0.05, z + 0.25), verts=6)

@K.model('floor_green', '階ユニット(緑の塗装)', '階ユニット')
def floor_green():
    wall_block('paint_green', 6, 6); _windows(6, 6, 3, 0.35, 0.4, 0.3)

@K.model('floor_pink', '階ユニット(ピンク・鉄格子ベランダ)', '階ユニット')
def floor_pink():
    W, D = 6, 6
    wall_block('paint_pink', W, D); _windows(W, D, 3, 0.3, 0.0)
    for s in (-1, 1):  # caged balconies bolted onto both faces
        y0 = s * D / 2; dep = 0.75
        box('grille', (W - 0.4, dep, 0.05), (0, y0 + s * dep / 2, 0.25))
        for k in range(40):
            x = -W / 2 + 0.2 + k * (W - 0.4) / 39
            box('grille', (0.02, 0.02, 2.4), (x, y0 + s * dep, 0.25))
        for z in (0.25, 1.1, 2.62): box('grille', (W - 0.4, 0.04, 0.04), (0, y0 + s * dep, z))
        for x in (-W / 2 + 0.2, W / 2 - 0.2):
            for k in range(8): box('grille', (0.02, dep, 0.02), (x, y0 + s * dep / 2, 0.3 + k * 0.33))
        for x in (-1.6, 0.4):  # potted plants and junk inside the cage
            box('red_plastic', (0.3, 0.3, 0.25), (x, y0 + s * 0.4, 0.3)); ico('leaf', 0.25, (x, y0 + s * 0.4, 0.7), sub=1, jitter=0.2, seed=int(x * 10))

@K.model('floor_tile', '階ユニット(モザイクタイル)', '階ユニット')
def floor_tile():
    wall_block('mosaic', 6, 6, tile=1.5); _windows(6, 6, 2, 0.45, 0.6, 0.6)

@K.model('floor_cream', '階ユニット(クリーム・増築の張り出し)', '階ユニット')
def floor_cream():
    W, D = 6, 6
    wall_block('paint_cream', W, D); _windows(W, D, 3, 0.3, 0.3, 0.2)
    # a tin-clad room bolted onto the front, hanging over the alley
    tbox('rust_tin', (2.6, 1.3, 2.4), (1.3, -D / 2 - 0.65, 0.3), tile=1.5)
    box('grille', (2.8, 1.5, 0.1), (1.3, -D / 2 - 0.7, 0.2))
    for x in (0.4, 2.2): bar('grille', (x, -D / 2 - 1.3, 0.25), (x, -D / 2, -0.8))  # struts
    window(1.3, -D / 2 - 1.3, 1.1, 1.4, 0.8, face=-1, lit=random.randrange(4))
    prism('rust', [(-D / 2 - 1.5, 2.7), (-D / 2, 2.95), (-D / 2, 3.0), (-D / 2 - 1.5, 2.75)], 2.9, loc=(1.3, 0, 0))

@K.model('floor_blue_narrow', '階ユニット(青・幅4m)', '階ユニット')
def floor_blue_narrow():
    wall_block('paint_blue', 4, 6); _windows(4, 6, 2, 0.4, 0.5, 0.4)

@K.model('floor_concrete', '階ユニット(打ちっぱなし・小窓)', '階ユニット')
def floor_concrete():
    W, D = 6, 6
    wall_block('concrete', W, D)
    for s in (-1, 1):
        for i in range(5):
            x = -W / 2 + W / 5 * (i + 0.5)
            window(x, s * D / 2, 1.2, 0.6, 0.8, face=s, lit=random.randrange(4) if random.random() < 0.4 else None, grille=True)

@K.model('floor_shop_shutter', '店舗の階(シャッター)', '階ユニット')
def floor_shop_shutter():
    W, D = 6, 6
    wall_block('concrete_dark', W, D)
    for s in (-1, 1):
        for x in (-1.5, 1.5):
            tbox('shutter', (2.6, 0.08, 2.3), (x, s * (D / 2 + 0.03), 0.2), tile='fit')
            tbox('concrete_dark', (2.8, 0.3, 0.25), (x, s * (D / 2 + 0.12), 2.5), tile=1)  # shutter box
        box('grille', (0.2, 0.2, 2.8), (0, s * (D / 2 + 0.05), 0.2))
    tbox(T('sign7', emit=3), (2.4, 0.1, 0.7), (-1.5, -D / 2 - 0.35, 2.35), tile='fit')

@K.model('floor_shop_open', '店舗の階(営業中の食堂)', '階ユニット')
def floor_shop_open():
    W, D = 6, 6
    wall_block('mosaic_beige', W, D, tile=1.5)
    tbox(T('window_lit2', emit=1.5), (W - 1.0, 0.1, 2.2), (0, -D / 2 - 0.02, 0.2), tile='fit')  # bright interior behind the open front
    for x in (-W / 2 + 0.25, W / 2 - 0.25): box('alu', (0.3, 0.3, 2.8), (x, -D / 2 - 0.1, 0.2))
    box('alu', (2.0, 0.6, 0.9), (-1.2, -D / 2 - 0.4, 0.2))  # counter with a steel top
    for i in range(3): cyl('alu', 0.18, 0.25, (-1.8 + i * 0.5, -D / 2 - 0.4, 1.1), verts=12)  # pots
    for i in range(4):  # folding table and stools spilling into the alley
        cyl(['red_plastic', 'blue_plastic'][i % 2], 0.16, 0.45, (0.8 + (i % 2) * 0.9, -D / 2 - 0.9 - (i // 2) * 0.7, 0.2), verts=10, r2=0.13)
    box('alu', (1.0, 0.7, 0.04), (1.25, -D / 2 - 1.25, 0.95)); box('alu', (0.05, 0.05, 0.75), (1.25, -D / 2 - 1.25, 0.2))
    tbox(T('sign10', emit=3), (3.6, 0.12, 0.9), (0, -D / 2 - 0.5, 2.25), tile='fit')
    for x in (-2.0, 0.0, 2.0): cyl('bulb', 0.06, 0.1, (x, -D / 2 - 0.9, 2.0), verts=8); bar('cable', (x, -D / 2 - 0.9, 2.1), (x, -D / 2 - 0.5, 2.25), 0.008)

@K.model('roof_parapet', '屋上(手すり壁)', '階ユニット')
def roof_parapet():
    W, D = 6, 6
    tbox('concrete_dark', (W + 0.16, D + 0.16, 0.2), (0, 0, 0))
    for s in (-1, 1):
        tbox('concrete', (W, 0.15, 1.0), (0, s * (D / 2 - 0.075), 0.2), tile=2)
        tbox('concrete', (0.15, D - 0.3, 1.0), (s * (W / 2 - 0.075), 0, 0.2), tile=2)
    for i in range(6): cyl('alu', 0.03, 0.4, (-2.5 + i, D / 2 - 0.3, 0.2), verts=6)  # rusty pipe stubs

# ================================================================= facade clutter (origin on the wall, sticking out to +Z)

@K.model('ac_unit', 'エアコン室外機', '壁に付ける物')
def ac_unit():
    tbox('concrete', (0.95, 0.65, 0.06), (0, -0.33, 0), tile=1)
    for x in (-0.4, 0.4): bar('grille', (x, 0, -0.35), (x, -0.62, 0.0), 0.015)
    box('ac_white', (0.8, 0.5, 0.55), (0, -0.32, 0.06))
    cyl('grille', 0.2, 0.03, (-0.1, -0.58, 0.33), verts=20, rot=(math.pi / 2, 0, 0))
    for k in range(6): box('grille', (0.4, 0.02, 0.02), (-0.1, -0.6, 0.18 + k * 0.06))
    bar('cable', (0.32, -0.1, 0.3), (0.32, -0.05, -0.6), 0.012)
    ico('rust', 0.06, (0.2, -0.3, 0.02), scale=(2, 1.5, 0.2), sub=1)  # drip stain

@K.model('ac_window', '窓用エアコン', '壁に付ける物')
def ac_window():
    box('ac_white', (0.62, 0.45, 0.42), (0, -0.15, 0))
    for k in range(5): box('grille', (0.5, 0.02, 0.025), (0, -0.38, 0.06 + k * 0.07))
    box('rust', (0.64, 0.2, 0.04), (0, -0.1, -0.04))

@K.model('cage_balcony', '鉄格子の檻(ベランダ)', '壁に付ける物')
def cage_balcony():
    w, d, h = 2.2, 0.8, 2.2
    box('grille', (w, d, 0.05), (0, -d / 2, 0))
    for k in range(int(w / 0.1) + 1): box('grille', (0.02, 0.02, h), (-w / 2 + k * 0.1, -d, 0))
    for side in (-1, 1):
        for k in range(int(d / 0.1) + 1): box('grille', (0.02, 0.02, h), (side * w / 2, -k * 0.1, 0))
    for z in (0.0, 1.0, h): box('grille', (w, 0.03, 0.03), (0, -d, z))
    box('grille', (w + 0.1, d + 0.05, 0.04), (0, -d / 2, h))
    for i, c in enumerate(['cloth_a', 'cloth_b', 'cloth_c']): box(c, (0.4, 0.02, 0.5), (-0.6 + i * 0.6, -d + 0.15, h - 0.6))

@K.model('laundry_pole', '物干し竿(張り出し)', '壁に付ける物')
def laundry_pole():
    for y in (-0.05, -0.12):
        bar('bamboo_dry', (-0.8 if y < -0.1 else 0.8, 0, 0), (0, -2.6, 0.15), 0.025)
    for x in (-0.8, 0.8): box('grille', (0.12, 0.12, 0.06), (x, -0.03, -0.03))
    cs = ['cloth_a', 'cloth_b', 'cloth_c', 'cloth_d', 'cloth_a', 'cloth_b']
    for i in range(6):
        t = 0.2 + i * 0.13
        p = Vector((0, 0, 0)).lerp(Vector((0, -2.6, 0.15)), t)
        h = random.uniform(0.35, 0.7)
        box(cs[i], (0.45, 0.02, h), (p.x, p.y, p.z - h), rot=(0, 0, random.uniform(-0.2, 0.2)))

def _sign(idx, vertical):
    if vertical:
        box('grille', (0.06, 0.6, 0.06), (0, -0.3, 2.0)); box('grille', (0.06, 0.6, 0.06), (0, -0.3, 0.1))
        tbox(T(f'sign{idx}', emit=4), (0.14, 0.7, 2.1), (0, -0.85, 0), rot=(0, 0, math.pi / 2), tile='fit')
        box('grille', (0.18, 0.75, 0.04), (0, -0.85, 2.1)); box('grille', (0.18, 0.75, 0.04), (0, -0.85, -0.03))
    else:
        for x in (-1.0, 1.0): box('grille', (0.06, 0.5, 0.06), (x, -0.25, 0.4))
        tbox(T(f'sign{idx}', emit=4), (2.6, 0.14, 0.86), (0, -0.55, 0), tile='fit')

for _i, (_name, _jp) in enumerate([('牙科', '縦看板「牙科」'), ('診所', '横看板「診所」'), ('麵家', '縦看板「麵家」'), ('冰室', '横看板「冰室」'), ('士多', '縦看板「士多」'),
                                   ('理髮', '横看板「理髮」'), ('五金', '縦看板「五金」'), ('洗衣', '横看板「洗衣」'), ('粥麵', '縦看板「粥麵」'), ('跌打', '横看板「跌打」')]):
    K.model(f'sign_{_i}', _jp, '看板')(lambda i=_i: _sign(i, i % 2 == 0))

@K.model('pipe_bundle', '配管の束(3m・縦につなげる)', '壁に付ける物')
def pipe_bundle():
    for i, (x, r, m) in enumerate([(-0.25, 0.06, 'alu'), (-0.08, 0.04, 'grille'), (0.06, 0.05, 'alu'), (0.2, 0.03, 'rust'), (0.3, 0.02, 'cable')]):
        cyl(m, r, 3.0, (x, -0.1 - r, 0), verts=10)
    for z in (0.4, 2.2): box('grille', (0.7, 0.2, 0.05), (0.02, -0.1, z))
    bar('alu', (-0.08, -0.14, 1.5), (-0.08, -0.5, 1.5), 0.04); cyl('red_plastic', 0.06, 0.05, (-0.08, -0.52, 1.5), rot=(math.pi / 2, 0, 0), verts=10)  # valve

@K.model('downpipe', '雨どいの縦管(3m)', '壁に付ける物')
def downpipe():
    cyl('grille', 0.05, 3.0, (0, -0.1, 0), verts=10)
    for z in (0.5, 2.0): box('grille', (0.14, 0.14, 0.04), (0, -0.06, z))

@K.model('awning_tin', 'トタンのひさし', '壁に付ける物')
def awning_tin():
    tbox('rust_tin', (2.4, 1.2, 0.04), (0, -0.6, 0), rot=(-0.25, 0, 0), tile=1.2)
    for x in (-1.0, 1.0): bar('grille', (x, 0, -0.5), (x, -1.15, -0.28), 0.02)

@K.model('elec_meters', '電気メーター盤', '壁に付ける物')
def elec_meters():
    box('grille', (1.2, 0.08, 0.9), (0, -0.04, 0))
    for i in range(3):
        for j in range(2):
            box('ac_white', (0.28, 0.12, 0.32), (-0.4 + i * 0.4, -0.12, 0.08 + j * 0.42))
            cyl('glass_dark', 0.08, 0.02, (-0.4 + i * 0.4, -0.18, 0.3 + j * 0.42), rot=(math.pi / 2, 0, 0), verts=12)
    for k in range(6): bar('cable', (-0.5 + k * 0.2, -0.08, 0.9), (-0.5 + k * 0.25, -0.1, 1.8), 0.01)

@K.model('letterboxes', '集合ポスト', '壁に付ける物')
def letterboxes():
    tbox('letterbox', (1.4, 0.3, 1.1), (0, -0.15, 0.6), tile='fit')
    box('grille', (1.45, 0.34, 0.04), (0, -0.15, 1.7))

@K.model('wall_shrine', '壁の祠(土地神)', '壁に付ける物')
def wall_shrine():
    box('shrine_red', (0.5, 0.25, 0.5), (0, -0.13, 0))
    box('gold', (0.3, 0.02, 0.3), (0, -0.26, 0.1))
    for x in (-0.15, 0.15): cyl('shrine_red', 0.02, 0.1, (x, -0.2, 0.5), verts=6); cyl('bulb', 0.025, 0.04, (x, -0.2, 0.6), verts=6)
    box('shrine_red', (0.6, 0.3, 0.05), (0, -0.15, 0.5))
    for k in range(3): bar('bamboo_dry', (-0.05 + k * 0.05, -0.22, 0.02), (-0.06 + k * 0.06, -0.24, 0.25), 0.004)

@K.model('fluoro_tube', '裸の蛍光灯', '壁に付ける物')
def fluoro_tube():
    box('ac_white', (1.25, 0.06, 0.06), (0, -0.03, 0))
    cyl('tube_light', 0.016, 1.2, (-0.6, -0.08, 0.03), rot=(0, math.pi / 2, 0), verts=10)

@K.model('iron_gate', '鉄の扉', '壁に付ける物')
def iron_gate():
    box('grille', (1.0, 0.06, 2.1), (0, -0.03, 0))
    for k in range(9): box('rust', (0.02, 0.04, 1.9), (-0.4 + k * 0.1, -0.08, 0.1))
    box('rust', (0.9, 0.04, 0.04), (0, -0.08, 1.0))
    box('gold', (0.06, 0.04, 0.1), (0.38, -0.1, 1.0))
    tbox(T('sign5', emit=1.5), (0.5, 0.03, 0.18), (0, -0.07, 2.12), tile='fit')

# ================================================================= rooftop

@K.model('water_tank_steel', '給水タンク(ステンレス)', '屋上')
def water_tank_steel():
    for x in (-0.6, 0.6):
        for y in (-0.6, 0.6): box('grille', (0.08, 0.08, 1.0), (x, y, 0))
    box('grille', (1.5, 1.5, 0.08), (0, 0, 1.0))
    cyl('alu', 0.75, 1.6, (0, 0, 1.08), verts=24)
    cyl('alu', 0.78, 0.04, (0, 0, 2.68), verts=24); cyl('grille', 0.2, 0.12, (0, 0, 2.7), verts=12)
    bar('alu', (0.6, 0, 1.2), (1.0, 0, 0.2), 0.04); bar('alu', (1.0, 0, 0.2), (1.0, 0, -0.1), 0.04)

@K.model('water_tank_plastic', '給水タンク(青い樹脂)', '屋上')
def water_tank_plastic():
    box('grille', (1.3, 1.3, 0.3), (0, 0, 0))
    cyl('water_blue', 0.6, 1.2, (0, 0, 0.3), verts=20)
    ico('water_blue', 0.6, (0, 0, 1.5), scale=(1, 1, 0.35), sub=2)
    cyl('water_blue', 0.18, 0.12, (0, 0, 1.68), verts=12)

@K.model('roof_shack', '屋上の小屋(トタン)', '屋上')
def roof_shack():
    tbox('rust_tin', (3.0, 2.4, 2.2), (0, 0, 0), tile=1.5)
    prism('rust', [(-1.4, 2.2), (1.4, 2.5), (1.4, 2.56), (-1.4, 2.26)], 3.3, loc=(0, 0, 0))
    box('grille', (0.8, 0.06, 1.9), (0.7, -1.22, 0))
    window(-0.7, -1.2, 1.0, 0.8, 0.6, face=-1, lit=random.randrange(4))
    for i in range(4): ico('trash', 0.12, (-1.0 + i * 0.25, 1.0, 2.6), scale=(1.5, 1, 0.5), sub=1)  # weights holding the roof down

@K.model('antennas', 'テレビアンテナ群', '屋上')
def antennas():
    for i, (x, y, h) in enumerate([(0, 0, 4.5), (0.9, 0.4, 3.6), (-0.8, -0.3, 5.2), (0.3, -0.9, 3.0)]):
        cyl('alu', 0.025, h, (x, y, 0), verts=6)
        for k in range(3):
            z = h - 0.3 - k * 0.6; L = 1.2 - k * 0.2
            bar('alu', (x - L / 2, y, z), (x + L / 2, y, z), 0.01)
            for e in range(5): bar('alu', (x - L / 2 + e * L / 4, y - 0.25, z), (x - L / 2 + e * L / 4, y + 0.25, z), 0.006)
        for a in (0, 2.1, 4.2): bar('cable', (x, y, h * 0.6), (x + math.cos(a) * 1.2, y + math.sin(a) * 1.2, 0), 0.004)
    box('grille', (0.6, 0.6, 0.1), (0, 0, 0))

@K.model('satellite_dish', '衛星アンテナ', '屋上')
def satellite_dish():
    cyl('grille', 0.04, 1.0, (0, 0, 0), verts=8)
    ico('ac_white', 0.45, (0, -0.15, 1.2), scale=(1, 0.3, 1), sub=2).rotation_euler = (0.4, 0, 0)
    bar('grille', (0, -0.2, 1.1), (0, -0.6, 1.4), 0.015)

# ================================================================= alleys and ground floor

@K.model('stairs_narrow', '狭い階段(1階分)', '路地')
def stairs_narrow():
    n, rise, run = 16, 3.0 / 16, 0.25
    for i in range(n): tbox('concrete_dark', (1.1, run, rise * (i + 1)), (0, -n * run / 2 + run * (i + 0.5), 0), tile=1.0)
    for x in (-0.6, 0.6):
        bar('grille', (x, -n * run / 2, 0.9), (x, n * run / 2, 3.9), 0.02)
        for k in range(5): bar('grille', (x, -n * run / 2 + k * n * run / 4, k * 0.75), (x, -n * run / 2 + k * n * run / 4, k * 0.75 + 0.9), 0.012)

@K.model('alley_floor', '路地の床(6m・排水溝つき)', '路地')
def alley_floor():
    tbox('concrete_dark', (2.0, 6.0, 0.05), (0, 0, 0), tile=1.5)
    box('grille', (0.2, 6.0, 0.052), (0.75, 0, 0))
    for k in range(30): box('trash', (0.18, 0.02, 0.054), (0.75, -2.9 + k * 0.2, 0))
    ico('water_blue', 0.5, (-0.2, 1.2, 0.0), scale=(1.4, 1, 0.03), sub=1)  # puddle

@K.model('catwalk', '渡り廊下(建物の間・4m)', '路地')
def catwalk():
    tbox('concrete_dark', (1.2, 4.0, 0.15), (0, 0, 0), tile=1.5)
    for x in (-0.6, 0.6):
        for k in range(9): box('grille', (0.03, 0.03, 1.0), (x, -2 + k * 0.5, 0.15))
        box('grille', (0.05, 4.0, 0.05), (x, 0, 1.12))
    for y in (-1.2, 1.2): bar('cable', (-0.6, y, 1.1), (-0.6, y + 0.4, 3.0), 0.008)

@K.model('cable_span', '電線の束(6m・たるみ付き)', '路地')
def cable_span():
    """Origin at the middle of the span at the height of the anchor points; the bundle sags below it."""
    for w in range(6):
        off = Vector((0, (w - 2.5) * 0.06, -w * 0.04)); sag = 0.6 + w * 0.08
        pts = [Vector((-3 + 6 * t / 12, 0, -sag * (1 - (2 * t / 12 - 1) ** 2))) + off for t in range(13)]
        for a, b in zip(pts, pts[1:]): bar('cable', a, b, 0.008 + (w % 2) * 0.004, verts=5)
    box('ac_white', (0.25, 0.12, 0.3), (1.0, 0.0, -0.95))  # junction box hanging on the bundle

@K.model('hawker_stall', '屋台(裸電球つき)', '路地')
def hawker_stall():
    box('alu', (1.6, 0.8, 0.9), (0, 0, 0))
    box('grille', (1.6, 0.8, 0.04), (0, 0, 0.9))
    for x in (-0.75, 0.75):
        for y in (-0.35, 0.35): box('grille', (0.04, 0.04, 2.2), (x, y, 0))
    tbox('rust_tin', (1.9, 1.2, 0.04), (0, 0, 2.2), tile=1)
    cyl('bulb', 0.05, 0.09, (0, 0, 1.9), verts=8); bar('cable', (0, 0, 2.0), (0, 0, 2.2), 0.006)
    for i in range(3): cyl('alu', 0.16, 0.22, (-0.45 + i * 0.45, 0, 0.94), verts=12)
    tbox(T('sign3', emit=3), (1.2, 0.04, 0.4), (0, -0.42, 1.75), tile='fit')
    for i in range(2): cyl('lpg', 0.15, 0.6, (0.95 + i * 0.32, 0.2, 0), verts=12)

@K.model('stool_stack', 'プラスチック椅子の山', '路地')
def stool_stack():
    for k in range(5): cyl('red_plastic', 0.17, 0.12, (0, 0, k * 0.1), verts=12, r2=0.15)
    for k in range(3): cyl('blue_plastic', 0.17, 0.12, (0.45, 0.1, k * 0.1), verts=12, r2=0.15)
    cyl('green_plastic', 0.16, 0.45, (-0.4, -0.2, 0), verts=10, r2=0.13)

@K.model('crates', 'プラスチックケースの山', '路地')
def crates():
    for i, (x, z, m) in enumerate([(0, 0, 'red_plastic'), (0.55, 0, 'blue_plastic'), (0.25, 0.32, 'green_plastic'), (0, 0.64, 'red_plastic')]):
        box(m, (0.5, 0.36, 0.3), (x, 0, z))
        for k in range(4): box('trash', (0.42, 0.37, 0.03), (x, 0, z + 0.05 + k * 0.06))

@K.model('foam_boxes', '発泡スチロール箱', '路地')
def foam_boxes():
    for i in range(4): box('foam', (0.6, 0.4, 0.28), (0, 0, i * 0.28), rot=(0, 0, random.uniform(-0.1, 0.1)))
    for i in range(2): box('foam', (0.6, 0.4, 0.28), (0.65, 0.05, i * 0.28))

@K.model('trash_bags', 'ゴミ袋の山', '路地')
def trash_bags():
    for i in range(7):
        a = i * 0.9; r = 0.2 + (i % 3) * 0.2
        ico('trash', 0.32, (math.cos(a) * r, math.sin(a) * r, 0.25 + (i // 5) * 0.3), scale=(1, 0.9, 0.8), sub=2, jitter=0.15, seed=i)
    box('foam', (0.5, 0.35, 0.25), (0.6, -0.2, 0))

@K.model('gas_cylinders', 'プロパンガスのボンベ', '路地')
def gas_cylinders():
    for i in range(3):
        cyl('lpg', 0.16, 0.75, (i * 0.36, 0, 0), verts=16); ico('lpg', 0.16, (i * 0.36, 0, 0.75), scale=(1, 1, 0.5), sub=2)
        cyl('alu', 0.04, 0.1, (i * 0.36, 0, 0.82), verts=8)

@K.model('bare_bulb', '裸電球(吊り下げ)', '路地')
def bare_bulb():
    """Origin at the ceiling hook."""
    bar('cable', (0, 0, 0), (0, 0, -0.8), 0.005); cyl('grille', 0.025, 0.05, (0, 0, -0.85), verts=8); ico('bulb', 0.05, (0, 0, -0.9), sub=2)

@K.model('lantern_red', '赤い提灯', '路地')
def lantern_red():
    bar('cable', (0, 0, 0), (0, 0, -0.3), 0.005)
    ico('shrine_red', 0.22, (0, 0, -0.62), scale=(1, 1, 1.25), sub=2)
    for z in (-0.35, -0.9): cyl('gold', 0.12, 0.04, (0, 0, z), verts=12)
    bar('gold', (0, 0, -0.95), (0, 0, -1.15), 0.01)

# ---------------------------------------------------------------- export / preview / demo
def export(top, meshes, path):
    for s in bpy.context.view_layer.objects.selected: s.select_set(False)
    for o in {top, *meshes}: o.select_set(True)
    bpy.context.view_layer.objects.active = top
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_cameras=False, export_lights=False, export_materials='EXPORT', export_image_format='JPEG')

def setup_render(res=384):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 32; sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 88
    sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.35, 0.4, 0.5, 1)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.lens = 50
    sc.collection.objects.link(cam); sc.camera = cam
    L = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); L.data.energy = 3.0
    L.rotation_euler = (0.8, 0.2, -0.6); sc.collection.objects.link(L)
    fl = bpy.data.objects.new('floor', bpy.data.meshes.new('floor')); sc.collection.objects.link(fl)
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=500); bm.to_mesh(fl.data); bm.free()
    fl.data.materials.append(M('stone_dark'))
    return cam

def render(name, meshes, path):
    sc = bpy.context.scene
    for c in sc.view_layers[0].layer_collection.children: c.exclude = c.name != name
    lo, hi = K.bounds(meshes)
    bpy.data.objects['floor'].location.z = min(0.0, lo.z - 0.01)  # hanging things (wires, lanterns) sit below their origin
    ctr, size = (lo + hi) / 2, (hi - lo).length
    d = Vector((-0.55, -1.0, 0.45)).normalized()
    sc.camera.location = ctr + d * size * 1.4
    sc.camera.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for c in sc.view_layers[0].layer_collection.children: c.exclude = False

def demo(out):
    """Stack the modules into a dense block at dusk and render it, to show how the kit fits together."""
    sc = bpy.context.scene
    for c in sc.view_layers[0].layer_collection.children: c.exclude = True  # sources hidden; the instances still render
    random.seed(5)
    inst_root = bpy.data.collections.new('demo'); sc.collection.children.link(inst_root)
    def inst(name, loc, rz=0.0, scale=1.0):
        o = bpy.data.objects.new(name + '_i', None); o.instance_type = 'COLLECTION'; o.instance_collection = bpy.data.collections[name]
        o.location = loc; o.rotation_euler = (0, 0, rz); o.scale = (scale,) * 3; inst_root.objects.link(o); return o
    floors = ['floor_green', 'floor_pink', 'floor_tile', 'floor_cream', 'floor_concrete', 'floor_green', 'floor_tile']
    signs = [f'sign_{i}' for i in range(10)]
    lots = []
    for gx in range(-2, 3):
        for gy in range(-2, 3):
            if gx == 0: continue  # the main alley runs along y
            x, y = gx * 6.2 + (1.0 if gx > 0 else -1.0), gy * 6.2
            n = random.randint(9, 14)
            lots.append((x, y, n))
            for k in range(n):
                name = random.choice(['floor_shop_shutter', 'floor_shop_open']) if k == 0 else random.choice(floors)
                inst(name, (x, y, k * 3.0), rz=random.choice([0, math.pi]) if k else (math.pi / 2 if gx < 0 else -math.pi / 2))
            inst('roof_parapet', (x, y, n * 3.0))
            for item in random.sample(['water_tank_steel', 'water_tank_plastic', 'roof_shack', 'antennas', 'satellite_dish', 'antennas'], 3):
                inst(item, (x + random.uniform(-1.5, 1.5), y + random.uniform(-1.5, 1.5), n * 3.0 + 0.2), random.uniform(0, 6))
            # facade clutter on the alley side
            face_x = x - 3.0 if gx > 0 else x + 3.0; rz = -math.pi / 2 if gx > 0 else math.pi / 2
            for k in range(1, n):
                if random.random() < 0.6: inst('ac_unit', (face_x, y + random.uniform(-2, 2), k * 3.0 + 0.4), rz)
                if random.random() < 0.25: inst('laundry_pole', (face_x, y + random.uniform(-1.5, 1.5), k * 3.0 + 2.2), rz)
                if random.random() < 0.2: inst('cage_balcony', (face_x, y + random.uniform(-1.5, 1.5), k * 3.0 + 0.2), rz)
                if k < 4 and random.random() < 0.7: inst(random.choice(signs), (face_x, y + random.uniform(-2.2, 2.2), k * 3.0 + random.uniform(0.2, 1.0)), rz)
            inst('pipe_bundle', (face_x, y + 2.7, 0), rz); inst('pipe_bundle', (face_x, y + 2.7, 3.0), rz)
    for gy in range(-12, 13, 6): inst('alley_floor', (0, gy, 0))
    for k in range(10): inst('cable_span', (0, -12 + k * 2.6, random.uniform(4.5, 9)))
    for i, (item, y) in enumerate([('hawker_stall', -4), ('stool_stack', 3), ('trash_bags', 7), ('crates', -8), ('foam_boxes', 9)]): inst(item, (0.3 if i % 2 else -0.3, y, 0), i)
    for y in range(-11, 12, 4): inst('lantern_red', (0, y, 3.4))
    bpy.data.objects['floor'].location.z = 0.0
    cam = sc.camera
    sc.render.resolution_x, sc.render.resolution_y = 1280, 860
    sc.cycles.samples = 96
    cam.data.lens = 18
    cam.location = (0.2, -16.5, 1.7)
    cam.rotation_euler = (Vector((0, 4, 13)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    w = sc.world; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.07, 0.14, 1)
    bpy.data.objects['sun'].data.energy = 0.25; bpy.data.objects['sun'].rotation_euler = (1.1, 0.1, 2.4)
    for y in (-10, -3, 4, 10):
        bpy.ops.object.light_add(type='POINT', location=(0, y, 3.0)); bpy.context.object.data.energy = 120; bpy.context.object.data.color = (1.0, 0.7, 0.45)
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    names = [a for a in argv if not a.startswith('--')] or list(K.MODELS)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(GLB, exist_ok=True)
    meta_path = os.path.join(ROOT, f'models{SUFFIX}.json')
    meta = {m['name']: m for m in json.load(open(meta_path))} if os.path.exists(meta_path) else {}
    objs = {}
    for n in names:
        top, meshes = objs[n] = K.build(n)
        export(top, meshes, os.path.join(GLB, n + '.glb'))
        lo, hi = K.bounds(meshes); ext = hi - lo
        _, jp, cat = K.MODELS[n]
        meta[n] = {'name': n, 'jp': jp, 'category': cat, 'size_m': [round(v, 2) for v in (ext.x, ext.z, ext.y)],
                   'tris': sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons),
                   'materials': sorted({m.name for o in meshes for m in o.data.materials}), 'kb': round(os.path.getsize(os.path.join(GLB, n + '.glb')) / 1024, 1)}
        print(f"{n:20s} {jp:24s} {meta[n]['tris']:6d} tris  {meta[n]['size_m']}")
    json.dump([meta[k] for k in K.MODELS if k in meta], open(meta_path, 'w'), ensure_ascii=False, indent=1)
    if '--render' in argv or '--demo' in argv: setup_render()
    if '--render' in argv:
        os.makedirs(PREVIEW, exist_ok=True)
        for n, (top, meshes) in objs.items(): render(n, meshes, os.path.join(PREVIEW, n + '.jpg'))
    if '--demo' in argv: demo(os.path.join(ROOT, f'demo{SUFFIX}.jpg'))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, f'kowloon{SUFFIX}.blend'), compress=True)
