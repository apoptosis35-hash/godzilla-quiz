# Uminagi port town (海凪の港町) model kit, built with Blender's Python API.
#   pip install bpy pillow numpy          (bpy = Blender 5.x as a Python module)
#   python3 tools/make_textures.py        (once: writes textures/)
#   python3 tools/make_models.py [--render] [names...]
# Conventions: 1 unit = 1 m, Y-up glTF, origin at the centre of the footprint on the ground (boats: on the waterline),
# front faces +Z (glTF) = -Y in Blender. Writes glb/<name>.glb, models.json, materials.json, tools/uminagi.blend,
# and with --render preview/<name>.jpg.
#
# Geometry is real: walls are built with holes for windows and doors (frames, glass, lattice and shoji sit in the
# reveals), roofs are corrugated kawara slabs with ridge caps, barge boards and rafter tails, signs are extruded
# 3D kanji. Fine surface detail (wood grain, stone joints, tile courses, rust, stains) comes from the tiling PBR
# textures in textures/. Each face gets metre-based UVs (u along the face's horizontal direction, v up the face),
# and the GLBs do not embed the images: materials.json maps every material name to its colour, roughness and
# texture so the game (or the .blend) can share one material per name across all models.
import json, math, os, random, sys, zlib
from contextlib import contextmanager
import bpy, bmesh
from mathutils import Vector, Matrix, noise

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
GLB, PREVIEW, TEXDIR = os.path.join(ROOT, 'glb'), os.path.join(ROOT, 'preview'), os.path.join(ROOT, 'textures')
FONT_PATH = next((p for p in ('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf', '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf') if os.path.exists(p)), None)
LOD_RATIO = 0.3

# ---------------------------------------------------------------- materials
# name: (colour, roughness, metallic, texture, emission colour, emission strength)
def P(c, r=0.8, m=0.0, tex=None, e=None, es=0.0): return {'color': c, 'rough': r, 'metal': m, 'tex': tex, 'emit': e, 'emit_strength': es}
PALETTE = {
    # textured (colour multiplies the texture)
    'wood': P((1, 1, 1), 0.85, tex='wood'), 'wood_dark': P((1, 1, 1), 0.85, tex='wood_dark'),
    'wood_grey': P((0.78, 0.8, 0.82), 0.9, tex='wood'), 'wood_red': P((1.0, 0.72, 0.6), 0.85, tex='wood'),
    'planks': P((1, 1, 1), 0.85, tex='planks'), 'sign_wood': P((1.35, 1.32, 1.25), 0.85, tex='planks'),
    'plaster': P((1, 1, 1), 0.9, tex='plaster'), 'plaster_white': P((1.08, 1.08, 1.1), 0.9, tex='plaster'),
    'plaster_cream': P((1.04, 0.98, 0.86), 0.9, tex='plaster'),
    'roof_tile': P((1, 1, 1), 0.55, tex='roof_tile'), 'roof_tile_brown': P((1.35, 1.0, 0.78), 0.6, tex='roof_tile'),
    'roof_tile_blue': P((0.85, 1.0, 1.25), 0.5, tex='roof_tile'),
    'stone_wall': P((1, 1, 1), 0.95, tex='stone_wall'), 'paving': P((1, 1, 1), 0.9, tex='paving'),
    'concrete': P((1, 1, 1), 0.92, tex='concrete'), 'concrete_wet': P((1, 1, 1), 0.85, tex='concrete_wet'),
    'asphalt': P((1, 1, 1), 0.9, tex='asphalt'), 'tin_blue': P((1, 1, 1), 0.55, 0.3, tex='tin_blue'),
    'tin_rust': P((1, 1, 1), 0.7, 0.2, tex='tin_rust'), 'hull': P((1, 1, 1), 0.5, tex='hull'),
    'rock': P((1, 1, 1), 0.95, tex='rock'), 'granite': P((1.15, 1.12, 1.05), 0.9, tex='rock'),
    # plain colours
    'wood_frame': P((0.22, 0.14, 0.09), 0.75), 'wood_light': P((0.66, 0.5, 0.32), 0.75), 'bamboo': P((0.62, 0.58, 0.36), 0.6),
    'glass': P((0.08, 0.12, 0.15), 0.06), 'shoji': P((0.95, 0.93, 0.86), 0.9, e=(1.0, 0.8, 0.55), es=0.9), 'curtain': P((0.75, 0.7, 0.55), 0.9, e=(1.0, 0.75, 0.45), es=0.5),
    'alu': P((0.72, 0.73, 0.74), 0.35, 0.8), 'metal': P((0.55, 0.56, 0.58), 0.4, 0.9), 'steel_dark': P((0.18, 0.19, 0.2), 0.5, 0.7),
    'rust': P((0.45, 0.2, 0.08), 0.85, 0.3), 'iron': P((0.12, 0.11, 0.1), 0.6, 0.6), 'white': P((0.92, 0.92, 0.9), 0.5),
    'red': P((0.75, 0.08, 0.05), 0.5), 'vermilion': P((0.88, 0.22, 0.07), 0.55), 'black': P((0.03, 0.03, 0.035), 0.6),
    'rubber': P((0.04, 0.04, 0.04), 0.9), 'yellow': P((0.95, 0.72, 0.05), 0.5), 'orange': P((0.95, 0.38, 0.05), 0.5),
    'blue': P((0.05, 0.2, 0.55), 0.5), 'navy': P((0.04, 0.08, 0.25), 0.8), 'green': P((0.1, 0.35, 0.15), 0.6),
    'crate_blue': P((0.03, 0.22, 0.6), 0.45), 'styro': P((0.95, 0.95, 0.94), 0.8), 'copper': P((0.3, 0.55, 0.48), 0.6, 0.4),
    'cloth_red': P((0.75, 0.1, 0.07), 0.9), 'cloth_blue': P((0.05, 0.18, 0.5), 0.9), 'cloth_navy': P((0.03, 0.06, 0.2), 0.9),
    'cloth_white': P((0.9, 0.88, 0.82), 0.9), 'cloth_yellow': P((0.95, 0.75, 0.2), 0.9), 'cloth_green': P((0.2, 0.45, 0.25), 0.9),
    'cloth_pink': P((0.95, 0.6, 0.65), 0.9), 'tarp_blue': P((0.05, 0.3, 0.75), 0.6),
    'ink': P((0.02, 0.02, 0.02), 0.7), 'ink_white': P((0.95, 0.94, 0.9), 0.7), 'ink_red': P((0.7, 0.05, 0.03), 0.7),
    'rope': P((0.62, 0.5, 0.3), 0.95), 'net': P((0.1, 0.25, 0.25), 0.95), 'net_green': P((0.2, 0.35, 0.18), 0.95),
    'float_yellow': P((0.98, 0.72, 0.05), 0.35), 'float_orange': P((0.95, 0.35, 0.05), 0.35), 'float_white': P((0.9, 0.9, 0.88), 0.35),
    'antifoul': P((0.5, 0.12, 0.07), 0.7), 'boat_blue': P((0.05, 0.22, 0.55), 0.45), 'deck_green': P((0.25, 0.4, 0.3), 0.7),
    'skin': P((0.95, 0.72, 0.56), 0.7), 'hair': P((0.05, 0.04, 0.035), 0.7), 'hair_grey': P((0.6, 0.6, 0.6), 0.7),
    'cloth_khaki': P((0.55, 0.5, 0.36), 0.9), 'denim': P((0.15, 0.22, 0.38), 0.9), 'apron': P((0.08, 0.1, 0.12), 0.4),
    'boot': P((0.1, 0.1, 0.1), 0.5), 'fur_orange': P((0.85, 0.5, 0.2), 0.9), 'fur_white': P((0.92, 0.9, 0.86), 0.9),
    'bark': P((0.28, 0.21, 0.16), 0.95), 'bark_pine': P((0.3, 0.24, 0.2), 0.95), 'leaf': P((0.16, 0.36, 0.12), 0.85),
    'leaf_dark': P((0.07, 0.22, 0.09), 0.85), 'leaf_light': P((0.36, 0.55, 0.2), 0.85), 'pine': P((0.08, 0.24, 0.12), 0.85),
    'sakura': P((1.0, 0.72, 0.8), 0.8), 'hydrangea': P((0.45, 0.5, 0.92), 0.8), 'hydrangea_pink': P((0.92, 0.55, 0.75), 0.8),
    'flower_red': P((0.85, 0.12, 0.1), 0.8), 'flower_yellow': P((0.95, 0.8, 0.2), 0.8), 'soil': P((0.25, 0.17, 0.1), 1.0),
    'terracotta': P((0.65, 0.3, 0.16), 0.8), 'grass_blade': P((0.3, 0.5, 0.16), 0.9), 'moss': P((0.28, 0.38, 0.14), 1.0),
    'paper': P((0.96, 0.95, 0.9), 0.9),
    # foliage cards: alpha-tested quads with the leaves.png atlas (see make_textures.py), u/v measured from the image top-left
    'leaf_card': P((1.0, 1.0, 1.0), 0.8, tex='leaves'), 'leaf_card_dark': P((0.62, 0.72, 0.62), 0.8, tex='leaves'),
    'pine_card': P((1.0, 1.0, 1.0), 0.8, tex='leaves'), 'sakura_card': P((1.0, 1.0, 1.0), 0.8, tex='leaves'),
    'shrub_card': P((1.0, 1.0, 1.0), 0.8, tex='leaves'), 'hydrangea_card': P((0.55, 0.62, 0.95), 0.8, tex='leaves'),
    'cloth_orange': P((0.95, 0.5, 0.15), 0.9), 'cloth_grey': P((0.55, 0.56, 0.58), 0.9), 'cloth_check': P((0.8, 0.82, 0.9), 0.9),
    'futon': P((0.92, 0.88, 0.8), 0.95), 'futon_red': P((0.75, 0.2, 0.25), 0.95), 'sign_green': P((0.05, 0.35, 0.2), 0.5), 'sign_blue': P((0.05, 0.25, 0.6), 0.5),
    # light sources (the game scales their emission with the time of day)
    'lamp': P((1.0, 0.92, 0.75), 0.4, e=(1.0, 0.85, 0.55), es=4.0), 'lantern_red': P((0.9, 0.15, 0.08), 0.6, e=(1.0, 0.35, 0.15), es=2.0),
    'lantern_white': P((0.95, 0.92, 0.85), 0.7, e=(1.0, 0.85, 0.6), es=2.0), 'vend_panel': P((0.85, 0.92, 1.0), 0.3, e=(0.85, 0.92, 1.0), es=2.5),
    'beacon_red': P((1.0, 0.1, 0.05), 0.3, e=(1.0, 0.1, 0.05), es=6.0), 'beacon_white': P((1.0, 0.98, 0.9), 0.1, e=(1.0, 0.95, 0.8), es=8.0),
    'ridge_tile': P((0.2, 0.22, 0.25), 0.5), 'ridge_brown': P((0.32, 0.24, 0.2), 0.55),
    'straw': P((0.78, 0.66, 0.4), 0.9), 'gold': P((0.95, 0.72, 0.25), 0.3, 1.0),
    'window_lit': P((0.9, 0.75, 0.5), 0.5, e=(1.0, 0.75, 0.45), es=1.2),
}
MATS, IMAGES = {}, {}

def _img(name, noncolor=False):
    if name not in IMAGES:
        path = os.path.join(TEXDIR, name)
        im = bpy.data.images.load(path) if os.path.exists(path) else None
        if im and noncolor: im.colorspace_settings.name = 'Non-Color'
        IMAGES[name] = im
    return IMAGES[name]

def M(name):
    if name in MATS: return MATS[name]
    v = PALETTE[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    c = tuple(min(1.0, x) for x in v['color'])
    p.inputs['Base Color'].default_value = (*c, 1)
    p.inputs['Roughness'].default_value = v['rough']; p.inputs['Metallic'].default_value = v['metal']
    if v['emit']:
        p.inputs['Emission Color'].default_value = (*v['emit'], 1); p.inputs['Emission Strength'].default_value = v['emit_strength']
    if v['tex'] and _img(TEXMETA.get(v['tex'], {}).get('file', v['tex'] + '.jpg')):
        # metre-based UVs -> one texture tile per size_m metres
        size = TEXMETA.get(v['tex'], {}).get('size_m', [2, 2])
        uv = nt.nodes.new('ShaderNodeUVMap'); mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (1 / size[0], 1 / size[1], 1)
        nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
        ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = _img(TEXMETA.get(v['tex'], {}).get('file', v['tex'] + '.jpg')); nt.links.new(mp.outputs['Vector'], ti.inputs['Vector'])
        if TEXMETA.get(v['tex'], {}).get('alpha'):  # atlas uv is top-left based (glTF/three convention): flip for Blender, use alpha
            mp.inputs['Scale'].default_value = (1, -1, 1); mp.inputs['Location'].default_value = (0, 1, 0)
            nt.links.new(ti.outputs['Alpha'], p.inputs['Alpha']); m.blend_method = 'CLIP' if hasattr(m, 'blend_method') else None
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
        nt.links.new(ti.outputs['Color'], mix.inputs['A']); mix.inputs['B'].default_value = (*v['color'], 1)
        nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
        nimg = _img(v['tex'] + '_n.jpg', True) if not TEXMETA.get(v['tex'], {}).get('alpha') else None
        if nimg:
            tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = nimg; nt.links.new(mp.outputs['Vector'], tn.inputs['Vector'])
            nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    MATS[name] = m
    return m

TEXMETA = json.load(open(os.path.join(TEXDIR, 'textures.json'))) if os.path.exists(os.path.join(TEXDIR, 'textures.json')) else {}

# ---------------------------------------------------------------- primitives (Blender coords: Z up, front = -Y)
CUR, OBJXF = [], {}
PART = {'name': None, 'pivots': {}}
XF = [Matrix.Identity(4)]

@contextmanager
def xf(loc=(0, 0, 0), rz=0.0, s=1.0, rx=0.0, ry=0.0):
    """Everything created inside is moved by this transform (nested transforms compose)."""
    m = XF[-1] @ Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Scale(s, 4)
    XF.append(m)
    try: yield
    finally: XF.pop()

def part(name, pivot=(0, 0, 0)):
    """Following primitives go into a separate node `name` whose origin is `pivot` (limbs, propellers, lamps...)."""
    PART['name'] = name
    if name: PART['pivots'][name] = Vector(pivot)

def _take(o, mat):
    o.data.materials.clear(); o.data.materials.append(M(mat)); o['part'] = PART['name'] or ''
    OBJXF[o.name] = XF[-1].copy()
    CUR.append(o); return o

def mesh(mat, verts, faces, name='part'):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    return _take(o, mat)

def box(mat, size, loc, rot=(0, 0, 0)):
    """size (x, y, z), loc = centre of the bottom face."""
    sx, sy, sz = size
    v = [(x * sx / 2, y * sy / 2, z * sz) for z in (0, 1) for y in (-1, 1) for x in (-1, 1)]
    o = mesh(mat, v, [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)])
    o.location = loc; o.rotation_euler = rot
    return o

def box2(mat, x0, x1, y0, y1, z0, z1):
    return box(mat, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, z0))

def cyl(mat, r, h, loc, verts=12, r2=None, rot=(0, 0, 0), cap=True):
    """Cylinder/frustum standing on loc (bottom centre). r2 = top radius (0 = cone)."""
    r2 = r if r2 is None else r2
    v, f = [], []
    for i in range(verts):
        a = i / verts * math.tau
        v += [(r * math.cos(a), r * math.sin(a), 0), (r2 * math.cos(a), r2 * math.sin(a), h)]
    for i in range(verts):
        j = (i + 1) % verts
        f.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
    if r2 < 1e-4:
        v = [v[2 * i] for i in range(verts)] + [(0, 0, h)]
        f = [(i, (i + 1) % verts, verts) for i in range(verts)]
    if cap:
        f.append(tuple(2 * i for i in reversed(range(verts))) if r2 >= 1e-4 else tuple(reversed(range(verts))))
        if r2 >= 1e-4: f.append(tuple(2 * i + 1 for i in range(verts)))
    o = mesh(mat, v, f); o.location = loc; o.rotation_euler = rot
    return o

def rod(mat, a, b, r, verts=8):
    """Cylinder from point a to point b."""
    a, b = Vector(a), Vector(b); d = b - a
    o = cyl(mat, r, d.length, a, verts)
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return o

def ico(mat, r, loc, scale=(1, 1, 1), sub=2, jitter=0.0, seed=0, flat_bottom=None):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for vt in bm.verts:
        if jitter: vt.co *= 1 + jitter * noise.noise(vt.co.normalized() * 1.6 + off) * 1.6
        vt.co.x *= scale[0]; vt.co.y *= scale[1]; vt.co.z *= scale[2]
        if flat_bottom is not None: vt.co.z = max(vt.co.z, flat_bottom)
    me = bpy.data.meshes.new('ico'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('ico', me); bpy.context.scene.collection.objects.link(o); o.location = loc
    return _take(o, mat)

def torus(mat, R, r, loc, rot=(0, 0, 0), seg=16, rseg=8):
    v, f = [], []
    for i in range(seg):
        a = i / seg * math.tau
        for j in range(rseg):
            b = j / rseg * math.tau
            v.append(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
    for i in range(seg):
        for j in range(rseg):
            i2, j2 = (i + 1) % seg, (j + 1) % rseg
            f.append((i * rseg + j, i2 * rseg + j, i2 * rseg + j2, i * rseg + j2))
    o = mesh(mat, v, f); o.location = loc; o.rotation_euler = rot
    return o

def prism(mat, profile, length, loc=(0, 0, 0), axis='X', rot=(0, 0, 0)):
    """Extrude a 2D profile [(u, z)] along `axis` (X: u is Y; Y: u is X), centred on loc."""
    n = len(profile); v = []
    for s in (-0.5, 0.5):
        for u, z in profile:
            v.append((s * length, u, z) if axis == 'X' else (u, s * length, z))
    f = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    f += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    o = mesh(mat, v, f); o.location = loc; o.rotation_euler = rot
    return o

def loft(mat, rings, closed=True, cap=True):
    """Skin a list of rings (each a list of 3D points with the same count)."""
    n = len(rings[0]); v = [p for r in rings for p in r]; f = []
    for i in range(len(rings) - 1):
        for j in range(n if closed else n - 1):
            j2 = (j + 1) % n
            f.append((i * n + j, i * n + j2, (i + 1) * n + j2, (i + 1) * n + j))
    if cap:
        f.append(tuple(reversed(range(n)))); f.append(tuple((len(rings) - 1) * n + j for j in range(n)))
    return mesh(mat, v, f)

FONT = None
def text3d(mat, s, size, loc=(0, 0, 0), rz=0.0, depth=0.03, vertical=False, spacing=1.05):
    """Extruded text standing upright facing -Y (front), centred on loc. vertical=True stacks the characters."""
    global FONT
    if FONT is None: FONT = bpy.data.fonts.load(FONT_PATH) if FONT_PATH else bpy.data.fonts['Bfont Regular']
    chars = [(c, (0, 0, -i * size * spacing)) for i, c in enumerate(s)] if vertical else [(s, (0, 0, 0))]
    if vertical: loc = (loc[0], loc[1], loc[2] + (len(s) - 1) * size * spacing / 2)
    out = []
    for body, off in chars:
        if body == ' ': continue
        cu = bpy.data.curves.new('txt', 'FONT'); cu.body = body; cu.font = FONT; cu.size = size
        cu.extrude = depth / 2; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
        cu.resolution_u = 2  # glyph outlines: 2 segments per curve keeps kanji legible at a fraction of the triangles
        ob = bpy.data.objects.new('txt', cu); bpy.context.scene.collection.objects.link(ob)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)
        me.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))  # text plane XY(+Z) -> XZ facing -Y
        o = bpy.data.objects.new('txt', me); bpy.context.scene.collection.objects.link(o)
        o.location = Vector(loc) + Vector(off); o.rotation_euler = (0, 0, rz)
        out.append(_take(o, mat))
    return out

# ---------------------------------------------------------------- architecture helpers
def slab(mat, e0, e1, r0, r1, t=0.1, period=0.0, amp=0.0, cols=None):
    """Roof slab between eave edge e0->e1 and top edge r0->r1 (a quad, trapezoid or triangle), thickness t below.
    With period > 0 the top is corrugated across the eave direction (kawara channels running down the slope)."""
    e0, e1, r0, r1 = map(Vector, (e0, e1, r0, r1))
    n = (e1 - e0).cross(r0 - e0).normalized()
    if n.z < 0: n = -n
    L = (e1 - e0).length
    N = cols or (max(1, round(L / period * 4)) if period else 1)
    v, f = [], []
    for i in range(N + 1):
        k = i / N
        w = amp * math.sin(k * L / period * math.tau) if period else 0
        pe, pr = e0.lerp(e1, k), r0.lerp(r1, k)
        v += [pe + n * w, pr + n * w, pe - n * t, pr - n * t]
    for i in range(N):
        a, b = 4 * i, 4 * (i + 1)
        f += [(a, b, b + 1, a + 1), (a + 2, a + 3, b + 3, b + 2), (a, a + 2, b + 2, b), (a + 1, b + 1, b + 3, a + 3)]
    f += [(0, 1, 3, 2), (4 * N, 4 * N + 2, 4 * N + 3, 4 * N + 1)]
    return mesh(mat, v, f)

RIDGE = {'roof_tile': 'ridge_tile', 'roof_tile_brown': 'ridge_brown', 'roof_tile_blue': 'ridge_tile'}

def gable_roof(w, d, rise, z, mat='roof_tile', over_e=0.6, over_g=0.45, t=0.12, ridge=True, rafters=True, barge='wood_frame',
               fascia='wood_frame', wave=0.032):
    """Kawara gable roof over a w (X) x d (Y) box, ridge along X. z = top of the walls at the eaves."""
    s = rise / (d / 2); hw = w / 2 + over_g; he = d / 2 + over_e
    z += (t + wave) * math.sqrt(1 + s * s) + 0.01
    ze = z - over_e * s; zr = z + rise
    period = 0.3 if wave else 0
    for sg in (-1, 1):
        slab(mat, (-hw, sg * he, ze), (hw, sg * he, ze), (-hw, 0, zr), (hw, 0, zr), t, period, wave)
        if fascia: box(fascia, (2 * hw, 0.05, 0.2), (0, sg * (he - 0.03), ze - 0.26))
        if rafters:
            for x in frange(-w / 2 + 0.2, w / 2 - 0.1, 0.5):
                rod(fascia or 'wood_frame', (x, sg * (d / 2 - 0.05), z - 0.17), (x, sg * (he - 0.05), ze - 0.17), 0.035, 4)
    if ridge:
        rm = RIDGE.get(mat, mat)
        box(rm, (2 * hw + 0.1, 0.34, 0.22), (0, 0, zr - 0.04))
        rod(rm, (-hw - 0.05, 0, zr + 0.2), (hw + 0.05, 0, zr + 0.2), 0.12, 10)
        for sx in (-1, 1):  # onigawara end tiles
            box(rm, (0.12, 0.5, 0.5), (sx * (hw + 0.02), 0, zr - 0.08))
            rod(rm, (sx * (hw - 0.04), 0, zr + 0.42), (sx * (hw + 0.08), 0, zr + 0.42), 0.2, 12)
    if barge:
        for sx in (-1, 1):
            for sg in (-1, 1):
                a = Vector((sx * (hw - 0.02), sg * he, ze - 0.05)); b = Vector((sx * (hw - 0.02), 0, zr - 0.05))
                d_ = b - a
                o = box(barge, (0.06, d_.length + 0.1, 0.24), (a + b) / 2 - Vector((0, 0, 0.12)))
                o.rotation_euler = (math.atan2(d_.z, d_.y) * (1 if sg < 0 else 1) + (0 if sg < 0 else math.pi), 0, 0)
    return zr

def gable_fill(mat, w, d, rise, z, t=0.15):
    """Triangular gable walls at both X ends (between wall top z and the ridge)."""
    for sx in (-1, 1):
        x = sx * w / 2
        prism(mat, [(-d / 2, z), (d / 2, z), (0, z + rise)], t, loc=(x - sx * t / 2, 0, 0))

def hip_roof(w, d, rise, z, mat='roof_tile', over=0.6, t=0.12, ridge_k=None, wave=0.032, fascia='wood_frame'):
    """Kawara hipped roof (寄棟) over w x d, ridge along X."""
    s = rise / (d / 2); hw, hd = w / 2 + over, d / 2 + over
    z += (t + wave) * math.sqrt(1 + s * s) + 0.01
    ze = z - over * s; zr = z + rise
    rx = hw - hd if ridge_k is None else hw * ridge_k
    rx = max(0.0, rx)
    period = 0.3 if wave else 0
    for sg in (-1, 1):
        slab(mat, (-hw, sg * hd, ze), (hw, sg * hd, ze), (-rx, 0, zr), (rx, 0, zr), t, period, wave)
        slab(mat, (sg * hw, -hd, ze), (sg * hw, hd, ze), (sg * rx, -0.001, zr), (sg * rx, 0.001, zr), t, period, wave)
        if fascia:
            box(fascia, (2 * hw, 0.05, 0.2), (0, sg * (hd - 0.03), ze - 0.26)); box(fascia, (0.05, 2 * hd, 0.2), (sg * (hw - 0.03), 0, ze - 0.26))
    rm = RIDGE.get(mat, mat)
    if rx > 0.05: rod(rm, (-rx - 0.1, 0, zr + 0.08), (rx + 0.1, 0, zr + 0.08), 0.13, 10)
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod(rm, (sx * hw, sy * hd, ze + 0.05), (sx * rx, 0, zr + 0.05), 0.09, 6)
    return zr

def pent_roof(w, depth, z, mat='roof_tile', drop=0.35, wave=0.03):
    """庇: small lean-to tiled roof sticking out of a wall (wall plane at y=0, roof towards -Y), top edge at z."""
    slab(mat, (-w / 2, -depth, z - drop), (w / 2, -depth, z - drop), (-w / 2, 0.02, z), (w / 2, 0.02, z), 0.08, 0.3 if wave else 0, wave)
    box('wood_frame', (w, 0.05, 0.14), (0, -depth + 0.02, z - drop - 0.2))
    for x in (-w / 2 + 0.1, w / 2 - 0.1):  # brackets
        prism('wood_frame', [(0, z - 0.6), (0, z - 0.1), (-depth + 0.1, z - drop - 0.1)], 0.07, loc=(x, 0, 0))

def frange(a, b, step):
    x = a
    while x <= b + 1e-6:
        yield x; x += step

def wall(mat, L, H, T=0.15, openings=()):
    """Wall in local coords: along +X from 0..L, outer face at y=0 (facing -Y), inner at y=T, z 0..H.
    openings: (x0, x1, z0, z1) holes with proper reveals."""
    xs = sorted({0.0, L, *[o[0] for o in openings], *[o[1] for o in openings]})
    zs = sorted({0.0, H, *[o[2] for o in openings], *[o[3] for o in openings]})
    def hole(cx, cz): return any(o[0] <= cx <= o[1] and o[2] <= cz <= o[3] for o in openings)
    v, f = [], []
    def quad(a, b, c, d):
        i = len(v); v.extend([a, b, c, d]); f.append((i, i + 1, i + 2, i + 3))
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            x0, x1, z0, z1 = xs[i], xs[i + 1], zs[j], zs[j + 1]
            if hole((x0 + x1) / 2, (z0 + z1) / 2): continue
            quad((x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1))
            quad((x0, T, z0), (x0, T, z1), (x1, T, z1), (x1, T, z0))
    for (x0, x1, z0, z1) in openings:  # reveals
        quad((x0, 0, z0), (x0, 0, z1), (x0, T, z1), (x0, T, z0))
        quad((x1, 0, z0), (x1, T, z0), (x1, T, z1), (x1, 0, z1))
        if z0 > 1e-4: quad((x0, 0, z0), (x0, T, z0), (x1, T, z0), (x1, 0, z0))
        quad((x0, 0, z1), (x1, 0, z1), (x1, T, z1), (x0, T, z1))
    quad((0, 0, H), (L, 0, H), (L, T, H), (0, T, H))
    quad((0, 0, 0), (0, T, 0), (L, T, 0), (L, 0, 0))
    quad((0, 0, 0), (0, 0, H), (0, T, H), (0, T, 0))
    quad((L, 0, 0), (L, T, 0), (L, T, H), (L, 0, H))
    return mesh(mat, v, f)

def window(x0, x1, z0, z1, T=0.15, frame='alu', lattice=None, behind='shoji', sill=True, panes=2, bars=False):
    """Window filling a wall opening (wall-local coords, see wall())."""
    w, h = x1 - x0, z1 - z0; y = T * 0.45; fw = 0.045
    box2(frame, x0, x1, y - 0.03, y + 0.03, z0, z0 + fw); box2(frame, x0, x1, y - 0.03, y + 0.03, z1 - fw, z1)
    box2(frame, x0, x0 + fw, y - 0.03, y + 0.03, z0, z1); box2(frame, x1 - fw, x1, y - 0.03, y + 0.03, z0, z1)
    for k in range(1, panes):
        xm = x0 + w * k / panes; box2(frame, xm - 0.02, xm + 0.02, y - 0.04, y + 0.04, z0, z1)
    box2('glass', x0, x1, y - 0.005, y + 0.005, z0, z1)
    if bars:  # muntins (glass lattice of old wooden windows)
        for k in range(1, 3): box2(frame, x0, x1, y - 0.015, y - 0.005, z0 + h * k / 3 - 0.012, z0 + h * k / 3 + 0.012)
    if behind == 'shoji':
        box2('shoji', x0 + 0.02, x1 - 0.02, T + 0.1, T + 0.12, z0 + 0.02, z1 - 0.02)
        for k in range(1, 4): box2('wood_light', x0, x1, T + 0.08, T + 0.1, z0 + h * k / 4 - 0.01, z0 + h * k / 4 + 0.01)
        for k in range(1, max(2, round(w / 0.3))): box2('wood_light', x0 + w * k / round(w / 0.3) - 0.01, x0 + w * k / round(w / 0.3) + 0.01, T + 0.08, T + 0.1, z0, z1)
    elif behind == 'curtain':
        box2('curtain', x0, x0 + w * 0.42, T + 0.12, T + 0.15, z0, z1); box2('curtain', x1 - w * 0.3, x1, T + 0.12, T + 0.15, z0, z1)
        box2('black', x0, x1, T + 0.6, T + 0.62, z0, z1)
    elif behind == 'dark':
        box2('black', x0, x1, T + 0.5, T + 0.52, z0, z1)
    elif behind == 'lit':
        box2('window_lit', x0, x1, T + 0.3, T + 0.32, z0, z1)
    if lattice:  # 格子: vertical wooden bars in front of the window
        n = max(3, round(w / 0.075))
        for k in range(n + 1):
            x = x0 + 0.03 + (w - 0.06) * k / n; box2(lattice, x - 0.014, x + 0.014, -0.09, -0.05, z0 - 0.02, z1 + 0.02)
        box2(lattice, x0 - 0.04, x1 + 0.04, -0.1, -0.03, z1 + 0.02, z1 + 0.08); box2(lattice, x0 - 0.04, x1 + 0.04, -0.1, -0.03, z0 - 0.08, z0 - 0.02)
    if sill: box2('wood_frame' if frame == 'wood_frame' else 'alu', x0 - 0.05, x1 + 0.05, -0.06, T * 0.4, z0 - 0.04, z0)

def door(x0, x1, z0, z1, T=0.15, kind='slide_glass', frame='wood_frame'):
    w, h = x1 - x0, z1 - z0; y = T * 0.5
    if kind == 'slide_glass':  # 格子戸: wooden sliding doors with glass and a grid of muntins
        for k in range(2):
            a, b = x0 + w * k / 2, x0 + w * (k + 1) / 2; yy = y + (0.03 if k else -0.03)
            box2(frame, a, b, yy - 0.025, yy + 0.025, z0, z0 + 0.12); box2(frame, a, b, yy - 0.025, yy + 0.025, z1 - 0.06, z1)
            box2(frame, a, a + 0.05, yy - 0.025, yy + 0.025, z0, z1); box2(frame, b - 0.05, b, yy - 0.025, yy + 0.025, z0, z1)
            box2('glass', a, b, yy - 0.004, yy + 0.004, z0, z1)
            for i in range(1, 6): box2(frame, a, b, yy - 0.018, yy - 0.006, z0 + h * i / 6 - 0.01, z0 + h * i / 6 + 0.01)
            for i in range(1, 3): box2(frame, a + (b - a) * i / 3 - 0.01, a + (b - a) * i / 3 + 0.01, yy - 0.018, yy - 0.006, z0, z1)
        box2('shoji', x0, x1, T + 0.3, T + 0.32, z0, z1)
    elif kind == 'wood':
        box2(frame, x0, x1, y - 0.03, y + 0.03, z0, z1)
        for i in range(1, round(w / 0.12)): box2('wood_frame', x0 + i * 0.12 - 0.006, x0 + i * 0.12 + 0.006, y - 0.04, y - 0.03, z0, z1)
        box2('metal', x1 - 0.12, x1 - 0.06, y - 0.08, y - 0.03, z0 + h * 0.45, z0 + h * 0.5)
    elif kind == 'shutter':  # rolling shutter half down
        box2('tin_blue' if frame == 'tin_blue' else 'metal', x0, x1, y - 0.02, y + 0.02, z0 + h * 0.0, z1)
        box2('steel_dark', x0 - 0.05, x1 + 0.05, -0.25, 0.0, z1, z1 + 0.35)
    elif kind == 'big_slide':  # warehouse sliding doors on a top rail
        box2('steel_dark', x0 - 0.3, x1 + 0.3, -0.12, -0.05, z1 + 0.05, z1 + 0.15)
        for k in range(2):
            a, b = x0 + w * k / 2, x0 + w * (k + 1) / 2 + 0.05
            box2(frame, a, b, -0.06 - 0.04 * k, -0.02 - 0.04 * k, z0, z1 + 0.05)
            for zz in (z0 + 0.3, (z0 + z1) / 2, z1 - 0.3): box2('wood_frame', a + 0.05, b - 0.05, -0.08 - 0.04 * k, -0.06 - 0.04 * k, zz - 0.06, zz + 0.06)
            yb = -0.08 - 0.04 * k  # diagonal brace
            rod('wood_frame', (a + 0.1, yb, z0 + 0.3), (b - 0.1, yb, z1 - 0.3), 0.05, 4) if k else rod('wood_frame', (b - 0.1, yb, z0 + 0.3), (a + 0.1, yb, z1 - 0.3), 0.05, 4)

def side_walls(w, d, z0, h, T, mats, openings=None, skip=()):
    """Four walls of a w x d box from z0 to z0+h. mats/openings per side: front, right, back, left.
    Returns transforms usable with xf() to dress each wall (wall-local frame)."""
    openings = openings or {}
    frames = {
        'front': ((-w / 2, -d / 2, z0), 0.0, w), 'right': ((w / 2, -d / 2 + T, z0), math.pi / 2, d - 2 * T),
        'back': ((w / 2, d / 2, z0), math.pi, w), 'left': ((-w / 2, d / 2 - T, z0), -math.pi / 2, d - 2 * T)}
    for side, (loc, rz, L) in frames.items():
        if side in skip: continue
        m = mats[side] if isinstance(mats, dict) else mats
        with xf(loc, rz): wall(m, L, h, T, openings.get(side, ()))
    return frames

def wall_xf(frames, side):
    loc, rz, L = frames[side]
    return xf(loc, rz), L

def downpipe(x, y, z_top, mat='alu'):
    cyl(mat, 0.05, z_top, (x, y, 0), 8)

def gutter(x0, x1, y, z, mat='alu'):
    rod(mat, (x0, y, z), (x1, y, z), 0.07, 8)

def ac_unit(loc, rz=0.0):
    with xf(loc, rz):
        box('white', (0.8, 0.3, 0.55), (0, 0, 0)); cyl('steel_dark', 0.2, 0.02, (0.12, -0.15, 0.27), 16, rot=(math.pi / 2, 0, 0))
        for i in range(5): box('steel_dark', (0.012, 0.02, 0.4), (0.12 - 0.16 + i * 0.08, -0.16, 0.07))
        box('steel_dark', (0.04, 0.04, 0.12), (-0.25, 0.1, -0.12)); box('steel_dark', (0.04, 0.04, 0.12), (0.25, 0.1, -0.12))

def railing(x0, x1, y, z, h=0.9, mat='alu', step=0.12, post=1.2):
    box2(mat, x0, x1, y - 0.03, y + 0.03, z + h - 0.04, z + h)
    box2(mat, x0, x1, y - 0.02, y + 0.02, z + 0.08, z + 0.12)
    for x in frange(x0, x1, step): box2(mat, x - 0.012, x + 0.012, y - 0.012, y + 0.012, z, z + h)

def chochin(loc, r=0.22, h=0.55, mat='lantern_red', text=None):
    """Paper lantern with ribs, black caps and (optional) a kanji on the front."""
    rings = []
    for i in range(9):
        t = i / 8; rr = r * (0.55 + 0.45 * math.sin(t * math.pi))
        rings.append([(loc[0] + rr * math.cos(a / 12 * math.tau), loc[1] + rr * math.sin(a / 12 * math.tau), loc[2] + t * h) for a in range(12)])
    loft(mat, rings)
    cyl('black', r * 0.6, 0.06, (loc[0], loc[1], loc[2] - 0.04), 12); cyl('black', r * 0.6, 0.06, (loc[0], loc[1], loc[2] + h - 0.02), 12)
    rod('black', (loc[0], loc[1], loc[2] + h + 0.04), (loc[0], loc[1], loc[2] + h + 0.3), 0.012, 4)
    if text: text3d('ink', text, r * 0.85, (loc[0], loc[1] - r * 0.98, loc[2] + h / 2), depth=0.01)

def noren(x0, x1, y, z_top, h, mat='cloth_navy', text=None, panels=None, tmat='ink_white'):
    """Shop curtain hanging from a rod: separate panels (slits) with text across them."""
    w = x1 - x0; panels = panels or max(2, round(w / 0.45))
    rod('wood_light', (x0 - 0.1, y, z_top + 0.03), (x1 + 0.1, y, z_top + 0.03), 0.025, 6)
    for i in range(panels):
        a, b = x0 + w * i / panels + 0.01, x0 + w * (i + 1) / panels - 0.01
        box2(mat, a, b, y - 0.01, y + 0.01, z_top - h, z_top)
    if text:
        size = min(h * 0.45, w / (len(text) + 0.6))
        text3d(tmat, text, size, ((x0 + x1) / 2, y - 0.02, z_top - h * 0.42), depth=0.006)

def signboard(text, w, h, loc, board='sign_wood', ink='ink', frame='wood_frame', vertical=False, depth=0.08, rz=0.0):
    """Wooden sign board with a frame and extruded characters on the front (-Y)."""
    with xf(loc, rz):
        box(board, (w, depth, h), (0, 0, -h / 2))
        for zz in (-h / 2 - 0.03, h / 2 - 0.03): box(frame, (w + 0.08, depth + 0.04, 0.06), (0, 0, zz))
        for xx in (-w / 2, w / 2): box(frame, (0.06, depth + 0.04, h + 0.06), (xx, 0, -h / 2 - 0.03))
        if vertical:
            size = min(w * 0.7, h / (len(text) * 1.08 + 0.3))
            text3d(ink, text, size, (0, -depth / 2 - 0.012, 0), depth=0.02, vertical=True)
        else:
            size = min(h * 0.68, w / (len(text) * 1.02 + 0.35))
            text3d(ink, text, size, (0, -depth / 2 - 0.012, 0), depth=0.02)

ATLAS = {'leaf_card': 0, 'leaf_card_dark': 0, 'pine_card': 1, 'sakura_card': 2, 'shrub_card': 3, 'hydrangea_card': 3}

def cards(mat, center, radius, n, size, seed, scale=(1, 1, 1), up=0.4, shell=(0.5, 1.0), flat=0.0):
    """Foliage cards: n quads carrying an atlas leaf cluster, scattered over an ellipsoid shell around center and
    facing roughly outwards (the game rewrites their normals to point away from the canopy centre for soft shading)."""
    q = ATLAS[mat]; u0, v0 = (q % 2) * 0.5, (q // 2) * 0.5
    rnd = random.Random(seed); verts, faces, uvs = [], [], []
    c = Vector(center)
    for i in range(n):
        d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1) * (1 - flat) + up)).normalized()
        p = c + Vector((d.x * scale[0], d.y * scale[1], d.z * scale[2])) * radius * rnd.uniform(*shell)
        nrm = (d + Vector((rnd.uniform(-0.7, 0.7), rnd.uniform(-0.7, 0.7), rnd.uniform(-0.2, 0.8) + flat * 2))).normalized()
        t = nrm.cross(Vector((0, 0, 1)))
        t = t.normalized() if t.length > 1e-3 else Vector((1, 0, 0))
        b = nrm.cross(t).normalized()
        a = rnd.uniform(0, math.tau); t, b = t * math.cos(a) + b * math.sin(a), -t * math.sin(a) + b * math.cos(a)
        h = size * rnd.uniform(0.8, 1.2) / 2
        k = len(verts); verts += [p - t * h - b * h, p + t * h - b * h, p + t * h + b * h, p - t * h + b * h]
        faces.append((k, k + 1, k + 2, k + 3)); uvs += [(u0, v0 + 0.5), (u0 + 0.5, v0 + 0.5), (u0 + 0.5, v0), (u0, v0)]
    me = bpy.data.meshes.new('cards'); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
    uvl = me.uv_layers.new(name='UVMap').data
    for poly in me.polygons:
        for j, li in enumerate(poly.loop_indices): uvl[li].uv = uvs[poly.index * 4 + j]
    o = bpy.data.objects.new('cards', me); bpy.context.scene.collection.objects.link(o)
    return _take(o, mat)

def flowerpot(loc, s=1.0, flower=None, seed=0):
    with xf(loc, s=s):
        cyl('terracotta', 0.16, 0.26, (0, 0, 0), 10, r2=0.2)
        cyl('soil', 0.18, 0.02, (0, 0, 0.23), 10)
        ico('leaf_dark', 0.14, (0, 0, 0.36), (1, 1, 0.8), 1, 0.25, seed)
        cards('shrub_card', (0, 0, 0.42), 0.2, 7, 0.32, seed)
        if flower:
            for k in range(4): ico(flower, 0.06, (0.12 * math.cos(k * 1.7 + seed), 0.12 * math.sin(k * 1.7 + seed), 0.55), sub=1)

# ================================================================= model registry
MODELS = {}
def model(name, jp, cat, lod=True):
    def deco(fn): MODELS[name] = (fn, jp, cat, lod); return fn
    return deco

def uv_project(o):
    """Metre-based per-face UVs: u runs along the face's horizontal direction, v up the face (z-facing: world XY)."""
    me = o.data
    if not me.uv_layers: me.uv_layers.new(name='UVMap')
    uvl = me.uv_layers.active.data
    keep = {i for i, m in enumerate(me.materials) if m and m.name in ATLAS}
    for poly in me.polygons:
        if poly.material_index in keep: continue
        n = poly.normal
        if abs(n.z) > 0.92: t, b = Vector((1, 0, 0)), Vector((0, 1, 0))
        else:
            t = Vector((-n.y, n.x, 0)).normalized(); b = n.cross(t).normalized()
        for li in poly.loop_indices:
            p = me.vertices[me.loops[li].vertex_index].co
            uvl[li].uv = (p.dot(t), p.dot(b))

SMOOTH = {'自然': 75, '人物': 55, '動物': 55}

def _join(objs, name, angle=35):
    for o in objs:
        o.matrix_world = OBJXF.get(o.name, Matrix.Identity(4)) @ o.matrix_basis
    bpy.context.view_layer.update()
    for o in bpy.context.view_layer.objects:
        if o and o.select_get(): o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = name; o.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()
    uv_project(o)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    return o

def build(name):
    """Returns (top node, [mesh objects], lod node or None)."""
    CUR.clear(); OBJXF.clear(); PART['name'] = None; PART['pivots'] = {}
    fn, jp, cat, lod = MODELS[name]
    random.seed(zlib.crc32(name.encode()))
    fn()
    col = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(col)
    groups = {}
    for o in CUR: groups.setdefault(o['part'], []).append(o)
    top = bpy.data.objects.new(name, None); col.objects.link(top); meshes = []
    for pn, objs in groups.items():
        o = _join(objs, pn if pn.startswith(name + "_") else f"{name}_{pn or 'body'}", SMOOTH.get(cat, 35))
        pv = PART['pivots'].get(pn, Vector())
        o.data.transform(Matrix.Translation(-pv)); o.location = pv
        o.parent = top; meshes.append(o)
    for o in meshes:
        for c in o.users_collection: c.objects.unlink(o)
        col.objects.link(o)
    lod_obj = None
    if lod and len(meshes) == 1:
        body = meshes[0]
        lod_obj = body.copy(); lod_obj.data = body.data.copy(); lod_obj.name = f'{name}_lod1'; lod_obj.data.name = lod_obj.name
        col.objects.link(lod_obj); lod_obj.parent = top
        dm = lod_obj.modifiers.new('dec', 'DECIMATE'); dm.ratio = LOD_RATIO; dm.use_collapse_triangulate = True
        cardm = {i for i, m in enumerate(lod_obj.data.materials) if m and m.name in ATLAS}
        if cardm:  # foliage cards: keep 45% of them intact (collapsing would tear the quads), decimate only the rest
            bm = bmesh.new(); bm.from_mesh(lod_obj.data); rr = random.Random(1)
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in cardm and rr.random() < 0.55], context='FACES')
            bm.to_mesh(lod_obj.data); bm.free()
            vg = lod_obj.vertex_groups.new(name='solid')
            vg.add([v for p in lod_obj.data.polygons if p.material_index not in cardm for v in p.vertices], 1.0, 'REPLACE')
            dm.vertex_group = 'solid'
        with bpy.context.temp_override(object=lod_obj, active_object=lod_obj, selected_objects=[lod_obj]):
            bpy.ops.object.modifier_apply(modifier='dec')
    return top, meshes, lod_obj

# ================================================================= houses (住宅)
def house(w=7.0, d=6.5, floors=2, lower='wood_dark', upper='plaster', roof='gable', roof_mat='roof_tile', rise=None,
          door_x=None, balcony=True, pent=True, lattice=True, extension=None, base=0.45, seed=0, laundry=True, side_win=True):
    """Generic Japanese wooden house. Ground floor walls `lower`, upper floor `upper`."""
    rnd = random.Random(seed)
    T = 0.15; h1, h2 = 2.75, 2.6
    box('concrete', (w + 0.1, d + 0.1, base), (0, 0, 0))
    z1 = base; door_x = (-w / 2 + 1.4) if door_x is None else door_x
    # ---- ground floor
    fo = [(door_x - 0.85 + w / 2, door_x + 0.85 + w / 2, 0.0, 2.05)]
    wins = []
    for x in frange(-w / 2 + 1.0, w / 2 - 1.0, 2.2):
        if abs(x - door_x) > 1.6: wins.append((x - 0.75 + w / 2, x + 0.75 + w / 2, 0.85, 1.95))
    fo += wins
    so = [((d - 2 * T) / 2 - 0.6, (d - 2 * T) / 2 + 0.6, 0.9, 1.9)] if side_win else []
    bo = [((w) / 2 - 0.7, w / 2 + 0.7, 0.9, 1.9)]
    frames = side_walls(w, d, z1, h1, T, lower, {'front': fo, 'right': so, 'left': so, 'back': bo})
    with xf(*frames['front'][:2]):
        door(fo[0][0], fo[0][1], 0, 2.05, T)
        box2('stone_wall', fo[0][0] - 0.2, fo[0][1] + 0.2, -0.75, 0.0, -0.3, -0.05)  # step stone
        for (a, b, c, e) in wins: window(a, b, c, e, T, 'wood_frame', lattice='wood_frame' if lattice else None, behind='shoji', bars=not lattice)
        box2('black', fo[0][0] + 0.15, fo[0][0] + 0.45, -0.03, 0, 2.15, 2.3)  # name plate
    for side in ('right', 'left'):
        with xf(*frames[side][:2]):
            for (a, b, c, e) in so: window(a, b, c, e, T, 'alu', behind='curtain')
    with xf(*frames['back'][:2]):
        for (a, b, c, e) in bo: window(a, b, c, e, T, 'alu', behind='dark')
    ztop = z1 + h1
    if floors == 2:
        box('wood_frame', (w + 0.04, d + 0.04, 0.18), (0, 0, ztop - 0.09))  # floor band (胴差し)
        uo = []
        for x in frange(-w / 2 + 1.2, w / 2 - 1.0, 2.4): uo.append((x - 0.8 + w / 2, x + 0.8 + w / 2, 0.6 if balcony else 0.8, 2.0))
        so2 = [((d - 2 * T) / 2 - 0.5, (d - 2 * T) / 2 + 0.5, 0.9, 1.8)] if side_win else []
        frames2 = side_walls(w, d, ztop, h2, T, upper, {'front': uo, 'right': so2, 'left': so2, 'back': [(w / 2 - 0.8, w / 2 + 0.8, 0.9, 1.9)]})
        with xf(*frames2['front'][:2]):
            for (a, b, c, e) in uo: window(a, b, c, e, T, 'alu', behind=rnd.choice(['shoji', 'curtain', 'curtain']), sill=not balcony)
        for side in ('right', 'left'):
            with xf(*frames2[side][:2]):
                for (a, b, c, e) in so2: window(a, b, c, e, T, 'alu', behind='curtain')
        with xf(*frames2['back'][:2]): window(w / 2 - 0.8, w / 2 + 0.8, 0.9, 1.9, T, 'alu', behind='dark')
        for x in (-w / 2, w / 2):  # corner posts
            for y in (-d / 2, d / 2): box('wood_frame', (0.14, 0.14, h1 + h2), (x, y, z1))
        if pent:
            with xf((0, -d / 2, 0)): pent_roof(w + 0.3, 0.75, ztop + 0.05)
        if balcony:
            bz = ztop + 0.05
            box2('wood_frame', -w / 2 + 0.3, w / 2 - 0.3, -d / 2 - 1.0, -d / 2, bz + 0.12 if pent else bz, bz + 0.22 if pent else bz + 0.1)
            for x in (-w / 2 + 0.35, w / 2 - 0.35): box2('wood_frame', x - 0.05, x + 0.05, -d / 2 - 0.95, -d / 2 - 0.85, bz - 0.4, bz + 1.1)
            railing(-w / 2 + 0.3, w / 2 - 0.3, -d / 2 - 0.95, bz + 0.2, 0.95, 'alu', 0.11)
            if laundry:  # 物干し竿 with washing, and sometimes a futon airing over the balcony rail
                rod('alu', (-w / 2 + 0.4, -d / 2 - 0.7, bz + 1.85), (w / 2 - 0.4, -d / 2 - 0.7, bz + 1.85), 0.018, 6)
                for x in (-w / 2 + 0.4, w / 2 - 0.4): rod('alu', (x, -d / 2 - 0.92, bz + 0.2), (x, -d / 2 - 0.7, bz + 1.95), 0.02, 6)
                laundry_line(-w / 2 + 0.7, w / 2 - 0.7, -d / 2 - 0.7, bz + 1.85, seed)
                if seed % 2: futon(-w / 2 + 0.6, -w / 2 + 2.0, -d / 2 - 0.95, bz + 1.17, seed)
        ztop += h2
    elif pent:
        with xf((0, -d / 2, 0)): pent_roof(w + 0.3, 0.7, ztop - 0.25)
    # ---- roof
    rise = rise or (d / 2) * 0.55
    if roof == 'gable':
        gable_fill(upper if floors == 2 else lower, w - 0.02, d, rise, ztop)
        gable_roof(w, d, rise, ztop, roof_mat)
    else:
        hip_roof(w, d, rise, ztop, roof_mat)
    gutter(-w / 2 - 0.3, w / 2 + 0.3, -d / 2 - 0.62, ztop - 0.6 * rise / (d / 2) - 0.2)
    downpipe(w / 2 + 0.2, -d / 2 - 0.55, ztop - 0.4)
    # ---- extras around the house
    ac_unit((w / 2 + 0.25, d / 4, base + 0.1), math.pi / 2)
    box('white', (0.3, 0.12, 0.45), (-w / 2 - 0.08, d / 4, 1.3), (0, 0, math.pi / 2))  # electric meter
    cyl('metal', 0.18, 1.2, (-w / 2 - 0.3, d / 3, 0), 12); cyl('metal', 0.18, 1.2, (-w / 2 - 0.3, d / 3 + 0.42, 0), 12)  # propane
    if extension:  # lean-to extension with tin roof on the right side
        ew, ed = extension
        with xf((w / 2 + ew / 2, d / 2 - ed / 2, 0)):
            box('concrete', (ew, ed, base), (0, 0, 0))
            fr = side_walls(ew, ed, base, 2.3, 0.1, 'tin_rust' if seed % 2 else 'wood', {'front': [(ew / 2 - 0.5, ew / 2 + 0.5, 0.0, 1.9)]}, skip=('left',))
            with xf(*fr['front'][:2]): door(ew / 2 - 0.5, ew / 2 + 0.5, 0, 1.9, 0.1, 'wood')
            slab('tin_rust' if seed % 3 else 'tin_blue', (ew / 2 + 0.3, -ed / 2 - 0.3, base + 2.3), (ew / 2 + 0.3, ed / 2 + 0.3, base + 2.3),
                 (-ew / 2, -ed / 2 - 0.3, base + 2.9), (-ew / 2, ed / 2 + 0.3, base + 2.9), 0.04, 0.12, 0.012)
    for k in range(rnd.randint(2, 4)):
        flowerpot((door_x + 1.1 + k * 0.45, -d / 2 - 0.35, 0), 0.9 + rnd.random() * 0.4, rnd.choice([None, 'flower_red', 'flower_yellow', 'hydrangea']), seed + k)

@model('house_narrow', '細長い家(R1)', '住宅')
def house_narrow(): house(5.2, 7.5, 2, 'wood_dark', 'wood_dark', door_x=-1.2, balcony=True, seed=1)

@model('house_standard', '標準的な家(R2)', '住宅')
def house_standard(): house(8.0, 6.5, 2, 'wood_dark', 'plaster', door_x=-2.4, seed=2, extension=(2.4, 3.0))

@model('house_twostory', '二階建ての家(R3)', '住宅')
def house_twostory(): house(9.0, 7.0, 2, 'wood', 'plaster_cream', roof='hip', door_x=2.6, seed=3, lattice=False)

@model('house_hira', '平屋(R5)', '住宅')
def house_hira(): house(8.5, 6.5, 1, 'wood_dark', 'wood_dark', door_x=-2.2, balcony=False, seed=4, roof='gable', extension=(2.0, 3.2))

@model('house_old', '古い木造の家(R6)', '住宅')
def house_old(): house(6.5, 6.0, 2, 'wood_grey', 'wood_grey', roof_mat='roof_tile_brown', door_x=1.4, seed=5, balcony=False, laundry=False)

@model('house_hipped', '寄棟の家(R7)', '住宅')
def house_hipped(): house(7.5, 7.5, 2, 'plaster_white', 'plaster_white', roof='hip', roof_mat='roof_tile_blue', door_x=-2.0, seed=6, lattice=False)

@model('house_hillside', '高台の家(R4・石垣付き)', '住宅')
def house_hillside():
    with xf((0, 1.5, 2.4)): house(7.0, 6.0, 2, 'wood_dark', 'plaster', door_x=-1.8, seed=7)
    box('stone_wall', (9.0, 9.0, 2.4), (0, 1.5, 0)); box('stone_wall', (9.2, 0.4, 0.15), (0, -2.8, 2.4))
    for i in range(12):  # side stairs up to the door
        box('granite', (1.3, 0.3, 0.2 * (i + 1)), (-5.15, -2.6 + i * 0.3 + 0.15, 0))
    railing(-5.8, -5.8, 0, 2.4, 0.9)

# ================================================================= shops (商店街)
def shop(w, d, sign, sign_mat='sign_wood', ink='ink', awning='cloth_blue', noren_mat='cloth_navy', noren_text=None, goods='fish',
         upper='wood_dark', lower='wood', lanterns=None, vsign=None, roof_mat='roof_tile', seed=0, banner=None, corner=False, hira=False):
    rnd = random.Random(seed)
    T = 0.15; base = 0.25; h1, h2 = 3.0, 2.6
    box('concrete', (w + 0.1, d + 0.1, base), (0, 0, 0))
    z1 = base
    open_w = w - 1.2
    fo = [(0.6, 0.6 + open_w, 0.0, 2.55)]
    so = [(1.0, 1.0 + 2.6, 0.0, 2.55)] if corner else [((d - 2 * T) - 2.0, (d - 2 * T) - 1.0, 0.9, 1.9)]
    frames = side_walls(w, d, z1, h1, T, lower, {'front': fo, 'left': so})
    # interior behind the open front: floor, back wall with shelves of goods, ceiling
    box2('concrete', -w / 2 + T, w / 2 - T, -d / 2 + T, d / 2 - T, z1 - 0.02, z1 + 0.01)
    box2('wood_dark', -w / 2 + T, w / 2 - T, -d / 2 + T, d / 2 - T, z1 + h1 - 0.12, z1 + h1 - 0.1)
    box2('plaster', -w / 2 + T, w / 2 - T, -d / 2 + 3.4, -d / 2 + 3.5, z1, z1 + h1)
    for zz in (0.5, 1.1, 1.7):
        box2('wood_light', -w / 2 + 0.4, w / 2 - 0.4, -d / 2 + 3.0, -d / 2 + 3.4, z1 + zz, z1 + zz + 0.04)
        x = -w / 2 + 0.5
        while x < w / 2 - 0.6:
            c = rnd.choice(['cloth_red', 'cloth_yellow', 'cloth_blue', 'white', 'cloth_green', 'orange', 'paper'])
            bw = rnd.uniform(0.12, 0.3); box2(c, x, x + bw, -d / 2 + 3.1, -d / 2 + 3.35, z1 + zz + 0.04, z1 + zz + 0.04 + rnd.uniform(0.15, 0.35)); x += bw + 0.03
    box2('lamp', -0.3, 0.3, -d / 2 + 1.5, -d / 2 + 1.6, z1 + h1 - 0.18, z1 + h1 - 0.12)
    # counters / display stands at the front
    if goods == 'fish':
        for x in (-w / 4, w / 4):
            box('steel_dark', (w / 2 - 0.4, 0.9, 0.75), (x, -d / 2 + 0.2, z1))
            box('styro', (w / 2 - 0.5, 0.8, 0.12), (x, -d / 2 + 0.2, z1 + 0.75))
            for k in range(4): ico('metal', 0.08, (x - 0.6 + k * 0.4, -d / 2 + 0.2, z1 + 0.9), (2.2, 0.8, 0.5), 1)
    elif goods == 'veg':
        for x in (-w / 4, w / 4):
            prism('wood_light', [(-0.45, 0), (0.45, 0), (0.45, 0.5), (-0.45, 1.0)], w / 2 - 0.4, loc=(x, -d / 2 - 0.1, z1))
            for k in range(5): box(rnd.choice(['crate_blue', 'orange', 'cloth_green', 'yellow']), (0.4, 0.3, 0.15), (x - 0.8 + k * 0.4, -d / 2 - 0.1, z1 + 0.55 + rnd.random() * 0.2))
    elif goods == 'souvenir':
        for x in (-w / 4, w / 4):
            box('wood_light', (w / 2 - 0.5, 0.8, 0.8), (x, -d / 2 + 0.3, z1))
            for k in range(6): box(rnd.choice(['cloth_red', 'paper', 'cloth_blue', 'cloth_pink']), (0.22, 0.25, 0.12), (x - 0.7 + k * 0.28, -d / 2 + 0.3, z1 + 0.8))
    with xf(*frames['front'][:2]):
        for xx in (0.6, 0.6 + open_w):
            box2('wood_frame', xx - 0.08, xx + 0.08, -0.05, T + 0.05, 0, 2.6)
        box2('wood_frame', 0.5, 0.7 + open_w, -0.06, T, 2.55, 2.7)
        if noren_text and goods in ('food', 'izakaya'):  # restaurants: glass sliding doors and noren in the opening
            door(0.6 + open_w * 0.3, 0.6 + open_w * 0.7, 0, 2.3, T)
            box2(lower, 0.6, 0.6 + open_w * 0.3, 0, T, 0, 2.55); box2(lower, 0.6 + open_w * 0.7, 0.6 + open_w, 0, T, 0, 2.55)
            window(0.8, 0.6 + open_w * 0.3 - 0.2, 0.9, 2.0, T, 'wood_frame', lattice='wood_frame', behind='lit')
            window(0.6 + open_w * 0.7 + 0.2, 0.4 + open_w, 0.9, 2.0, T, 'wood_frame', lattice='wood_frame', behind='lit')
            noren(0.6 + open_w * 0.32, 0.6 + open_w * 0.68, -0.12, 2.5, 0.85, noren_mat, noren_text)
        elif noren_text:
            noren(0.7, 0.5 + open_w, -0.12, 2.52, 0.55, noren_mat, noren_text)
        if corner:
            pass
    if corner:
        with xf(*frames['left'][:2]):
            for xx in (1.0, 3.6): box2('wood_frame', xx - 0.08, xx + 0.08, -0.05, T + 0.05, 0, 2.6)
            box2('wood_frame', 0.9, 3.7, -0.06, T, 2.55, 2.7)
    # awning (cloth, sloped, with a scalloped valance) over the shop front
    zt = z1 + h1 - 0.05
    if awning:
        slab(awning, (-w / 2 + 0.2, -d / 2 - 1.5, zt - 0.75), (w / 2 - 0.2, -d / 2 - 1.5, zt - 0.75), (-w / 2 + 0.2, -d / 2, zt), (w / 2 - 0.2, -d / 2, zt), 0.02)
        n = round((w - 0.4) / 0.5)
        for i in range(n):
            x = -w / 2 + 0.2 + (w - 0.4) * (i + 0.5) / n
            prism(awning, [(-0.25, 0), (0.25, 0), (0, -0.22)], 0.02, loc=(x, -d / 2 - 1.5, zt - 0.75), axis='Y')
            if awning in ('cloth_red', 'cloth_blue') and i % 2 == 0:
                slab('cloth_white', (x - 0.12, -d / 2 - 1.49, zt - 0.74), (x + 0.12, -d / 2 - 1.49, zt - 0.74), (x - 0.12, -d / 2 + 0.01, zt + 0.01), (x + 0.12, -d / 2 + 0.01, zt + 0.01), 0.005)
        for x in (-w / 2 + 0.25, w / 2 - 0.25): rod('metal', (x, -d / 2, zt - 0.2), (x, -d / 2 - 1.5, zt - 0.75), 0.02, 6)
    else:
        with xf((0, -d / 2, 0)): pent_roof(w + 0.2, 0.9, zt + 0.1)
    # upper floor
    ztop = z1 + h1
    box('wood_frame', (w + 0.04, d + 0.04, 0.2), (0, 0, ztop - 0.1))
    if not hira:
        uo = [(0.8, w - 0.8, 0.5, 2.0)]
        frames2 = side_walls(w, d, ztop, h2, T, upper, {'front': uo, 'back': [(w / 2 - 0.7, w / 2 + 0.7, 0.9, 1.8)]})
        with xf(*frames2['front'][:2]):
            window(0.8, w - 0.8, 0.5, 2.0, T, 'wood_frame', lattice='wood_frame', behind=rnd.choice(['shoji', 'lit', 'curtain']), panes=4)
            box2('wood_frame', 0.5, w - 0.5, -0.5, 0.0, 0.35, 0.45)
        with xf(*frames2['back'][:2]): window(w / 2 - 0.7, w / 2 + 0.7, 0.9, 1.8, T, 'alu', behind='dark')
        ztop += h2
    # big sign on the fascia between the floors (on the awning top / pent roof)
    if hira: signboard(sign, w - 0.8, 0.9, (0, -d / 2 - 0.12, ztop + 1.0), board=sign_mat, ink=ink)
    else: signboard(sign, min(w - 0.6, max(2.4, len(sign) * 0.95)), 0.95, (0, -d / 2 - 0.25, z1 + h1 + 0.95), board=sign_mat, ink=ink)
    rise = d / 2 * 0.5
    gable_fill(upper, w - 0.02, d, rise, ztop)
    gable_roof(w, d, rise, ztop, roof_mat)
    gutter(-w / 2 - 0.3, w / 2 + 0.3, -d / 2 - 0.62, ztop - 0.6 * rise / (d / 2) - 0.2)
    downpipe(-w / 2 - 0.15, -d / 2 - 0.5, ztop - 0.4)
    if lanterns:
        for x in (-w / 2 + 0.45, w / 2 - 0.45): chochin((x, -d / 2 - 0.5, z1 + 1.85), 0.2, 0.55, 'lantern_red', lanterns)
    if vsign:  # vertical stand sign / projecting sign
        with xf((w / 2 - 0.1, -d / 2 - 0.35, 0)):
            rod('steel_dark', (0, 0, z1 + 2.9), (0, -0.6, z1 + 2.9), 0.02, 4)
            signboard(vsign, 0.5, 0.36 * len(vsign) + 0.3, (0, -0.35, z1 + 4.6 + (0 if hira else 0.5)), board='sign_wood', vertical=True, rz=math.pi / 2)
    if banner:  # のぼり旗
        for k, x in enumerate((-w / 2 - 0.4, w / 2 + 0.4)):
            rod('metal', (x, -d / 2 - 1.2, 0), (x, -d / 2 - 1.2, 3.3), 0.02, 6)
            rod('metal', (x, -d / 2 - 1.2, 3.25), (x + (0.5 if k == 0 else -0.5), -d / 2 - 1.2, 3.25), 0.012, 4)
            a, b = (x, x + 0.5) if k == 0 else (x - 0.5, x)
            box2('cloth_red' if banner[1] == 'r' else 'cloth_blue', a, b, -d / 2 - 1.21, -d / 2 - 1.19, 1.2, 3.25)
            text3d('ink_white', banner[0], 0.32, ((a + b) / 2, -d / 2 - 1.23, 2.2), depth=0.008, vertical=True)
    ac_unit((w / 2 + 0.25, d / 4, z1 + 2.2), math.pi / 2)
    if goods != 'fish': box('crate_blue', (0.55, 0.38, 0.3), (w / 2 - 0.3, -d / 2 - 0.4, 0))
    for k in range(rnd.randint(1, 3)):
        flowerpot((-w / 2 + 0.3 + k * 0.42, -d / 2 - 0.25, 0), 1.0, rnd.choice(['flower_red', 'hydrangea', None]), seed + k)

@model('shop_general', '雑貨店 まるはち(S1)', '商店')
def shop_general(): shop(7.0, 9.0, 'まるはち', awning='cloth_blue', noren_text=None, goods='veg', upper='wood_dark', vsign='日用品', seed=11, banner=('大売出し', 'r'))

@model('shop_restaurant', '海鮮食堂(S2)', '商店')
def shop_restaurant(): shop(7.5, 9.0, '海鮮食堂', awning=None, noren_mat='cloth_navy', noren_text='食事処', goods='food', upper='plaster', lanterns='海', vsign='海鮮丼', seed=12, banner=('海鮮丼', 'b'))

@model('shop_izakaya', '居酒屋 やまもと(S3)', '商店')
def shop_izakaya(): shop(6.5, 9.0, 'やまもと', awning='cloth_red', noren_mat='cloth_red', noren_text='居酒屋', goods='izakaya', upper='wood_dark', lanterns='酒', seed=13)

@model('shop_souvenir', 'お土産 海の幸(S4)', '商店')
def shop_souvenir(): shop(7.0, 9.0, '海の幸', sign_mat='sign_wood', awning='cloth_red', noren_text='お土産', noren_mat='cloth_blue', goods='souvenir', upper='plaster_cream', vsign='みやげ', seed=14, banner=('名物', 'r'))

@model('shop_fish', '鮮魚店(S5)', '商店')
def shop_fish(): shop(8.0, 9.0, '鮮魚 丸八', awning='cloth_blue', noren_text='鮮魚', noren_mat='cloth_blue', goods='fish', upper='wood_dark', vsign='直売', seed=15)

@model('shop_cafe', '喫茶 しおかぜ(S6・角の店)', '商店')
def shop_cafe(): shop(7.0, 9.0, '喫茶しおかぜ', sign_mat='sign_wood', awning='cloth_green', noren_text=None, goods='souvenir', upper='plaster_white', seed=16, corner=True, lanterns=None)

@model('shop_sake', '酒屋(S7・平屋)', '商店')
def shop_sake(): shop(6.0, 8.0, '酒・たばこ', awning='cloth_yellow', noren_text='酒', noren_mat='cloth_navy', goods='veg', upper='wood', seed=17, hira=True, vsign='地酒')

# ================================================================= harbour buildings (漁港)
@model('fish_market', '魚市場', '漁港')
def fish_market():
    W, D, H = 30.0, 16.0, 6.2
    box('concrete_wet', (W + 0.6, D + 0.6, 0.12), (0, 0, 0))
    bay = W / 6
    # steel portal frames with roof trusses
    for i in range(7):
        x = -W / 2 + i * bay
        for y in (-D / 2, D / 2):
            box('steel_dark', (0.3, 0.3, H), (x, y, 0.12))
            box('concrete', (0.5, 0.5, 0.5), (x, y, 0.12))
        box('steel_dark', (0.22, D, 0.35), (x, 0, H - 0.2))   # tie beam
        rise = D / 2 * 0.36
        for sg in (-1, 1):
            a = Vector((x, sg * D / 2, H - 0.05)); b = Vector((x, 0, H + rise - 0.3))
            rod('steel_dark', a, b, 0.11, 6)
            for k in (0.33, 0.66): rod('steel_dark', a.lerp(b, k), (x, sg * D / 2 * (1 - k), H + 0.1), 0.04, 4)
        rod('steel_dark', (x, 0, H + 0.1), (x, 0, H + rise - 0.3), 0.06, 6)
        if 0 < i < 6:
            for y in (-D / 4, D / 4):  # hanging lamps
                rod('black', (x - bay / 2, y, H + rise * 0.5), (x - bay / 2, y, H - 0.8), 0.01, 4)
                cyl('steel_dark', 0.35, 0.3, (x - bay / 2, y, H - 1.05), 14, r2=0.06)
                cyl('lamp', 0.12, 0.08, (x - bay / 2, y, H - 1.1), 10)
    for y in (-D / 2, D / 2): box('steel_dark', (W, 0.25, 0.4), (0, y, H - 0.3))
    zr = gable_roof(W, D, D / 2 * 0.36, H + 0.12, 'roof_tile', over_e=1.4, over_g=0.6, rafters=False, fascia='wood_grey')
    # facade band over the open front, with the big sign 魚市場
    box2('wood_grey', -W / 2, W / 2, -D / 2 - 0.2, -D / 2, H - 1.4, H + 0.1)
    # 看板建築: wooden false front rising above the eaves in the middle, with the big sign and a tiled coping
    FW = 13.0
    box2('wood_grey', -FW / 2, FW / 2, -D / 2 - 1.75, -D / 2 - 1.55, H - 0.6, H + 3.4)
    for x in (-FW / 2, FW / 2): box2('wood_frame', x - 0.12, x + 0.12, -D / 2 - 1.8, -D / 2 - 1.5, H - 0.6, H + 3.4)
    slab('ridge_tile', (-FW / 2 - 0.3, -D / 2 - 2.05, H + 3.35), (FW / 2 + 0.3, -D / 2 - 2.05, H + 3.35), (-FW / 2 - 0.3, -D / 2 - 1.5, H + 3.6), (FW / 2 + 0.3, -D / 2 - 1.5, H + 3.6), 0.08)
    for x in (-5.5, 0, 5.5): rod('steel_dark', (x, -D / 2 - 1.5, H + 2.6), (x, -D / 2 + 1.5, H + 1.2), 0.05, 6)
    signboard('魚市場', 10.0, 2.7, (0, -D / 2 - 1.85, H + 1.55), board='sign_wood', ink='ink', depth=0.12)
    for x in (-4.4, -1.5, 1.5, 4.4):  # gooseneck lamps lighting the sign
        rod('steel_dark', (x, -D / 2 - 1.8, H + 3.1), (x, -D / 2 - 2.5, H + 3.25), 0.025, 4)
        cyl('steel_dark', 0.16, 0.14, (x, -D / 2 - 2.55, H + 3.05), 10, r2=0.05); cyl('lamp', 0.1, 0.03, (x, -D / 2 - 2.55, H + 3.04), 8)
    # back wall (wood, with doors and high windows) and gable ends (half-open, wooden upper walls)
    with xf((-W / 2, D / 2, 0.12), math.pi):
        pass
    with xf((W / 2, D / 2, 0.12), math.pi):
        wall('wood_grey', W, H, 0.15, [(3, 7, 0, 3.8), (12, 18, 0, 3.8), (23, 27, 0, 3.8)] + [(x, x + 2.5, 4.4, 5.6) for x in (8.5, 19.5)])
        door(3, 7, 0, 3.8, 0.15, 'shutter'); door(23, 27, 0, 3.8, 0.15, 'shutter')
        for x in (8.5, 19.5): window(x, x + 2.5, 4.4, 5.6, 0.15, 'alu', behind=None, sill=False)
    for sx in (-1, 1):
        with xf((sx * W / 2, -sx * D / 2, 0.12), sx * math.pi / 2):
            wall('wood_grey', D, 1.0, 0.15)
            with xf((0, 0, 3.6)):
                wall('wood_grey', D, H - 3.6, 0.15, [(D / 2 - 2, D / 2 + 2, 0.6, 2.0)])
                window(D / 2 - 2, D / 2 + 2, 0.6, 2.0, 0.15, 'wood_frame', behind=None, bars=True, sill=False)
        prism('wood_grey', [(-D / 2, H + 0.1), (D / 2, H + 0.1), (0, H + 0.1 + D / 2 * 0.36)], 0.15, loc=(sx * (W / 2 - 0.075), 0, 0))
    # vertical banners 新鮮な魚 / 海産物 / 鮮魚 on the front columns
    for x, txt, m in ((-W / 2 + bay * 1, '新鮮な魚', 'cloth_navy'), (W / 2 - bay * 1, '海産物', 'cloth_navy'), (-W / 2 + bay * 2, '鮮魚', 'cloth_white'), (W / 2 - bay * 2, '直売', 'cloth_white')):
        box2(m, x - 0.45, x + 0.45, -D / 2 - 0.22, -D / 2 - 0.18, 1.6, H - 1.5)
        text3d('ink_white' if m == 'cloth_navy' else 'ink', txt, 0.62 if len(txt) < 4 else 0.58, (x, -D / 2 - 0.24, (1.6 + H - 1.5) / 2), depth=0.01, vertical=True)
    # stainless sorting tables and a weighing scale inside
    for x in (-9, -3, 3, 9):
        box('metal', (4.0, 1.4, 0.85), (x, 1.0, 0.12)); box('steel_dark', (3.8, 1.2, 0.05), (x, 1.0, 0.12))
    box('metal', (1.2, 1.2, 0.1), (11.5, -3.5, 0.12)); box('steel_dark', (0.4, 0.2, 1.3), (11.5, -2.95, 0.12)); box('white', (0.5, 0.06, 0.4), (11.5, -3.0, 1.2))
    # gutters and downpipes
    gutter(-W / 2 - 0.6, W / 2 + 0.6, -D / 2 - 1.3, H - 0.55); gutter(-W / 2 - 0.6, W / 2 + 0.6, D / 2 + 1.3, H - 0.55)
    for x in (-W / 2 - 0.4, W / 2 + 0.4): downpipe(x, -D / 2 - 1.2, H - 0.5); downpipe(x, D / 2 + 1.2, H - 0.5)

@model('suisan_office', '水産会社の事務所兼倉庫(第一水産)', '漁港')
def suisan_office():
    w, d = 11.0, 9.0; T = 0.15
    box('concrete', (w + 0.1, d + 0.1, 0.25), (0, 0, 0))
    fr = side_walls(w, d, 0.25, 3.4, T, 'wood_grey', {'front': [(1.0, 5.0, 0, 3.0), (6.5, 7.6, 0, 2.1), (8.4, 10.2, 1.0, 2.2)], 'right': [(3.0, 5.0, 1.0, 2.2)]})
    with xf(*fr['front'][:2]):
        door(1.0, 5.0, 0, 3.0, T, 'shutter'); door(6.5, 7.6, 0, 2.1, T, 'wood'); window(8.4, 10.2, 1.0, 2.2, T, 'alu', behind='curtain')
    with xf(*fr['right'][:2]): window(3.0, 5.0, 1.0, 2.2, T, 'alu', behind='dark')
    fr2 = side_walls(w, d, 3.65, 2.8, T, 'wood_grey', {'front': [(1.2, 3.4, 0.8, 2.1), (4.4, 6.6, 0.8, 2.1), (7.6, 9.8, 0.8, 2.1)]})
    with xf(*fr2['front'][:2]):
        for x in (1.2, 4.4, 7.6): window(x, x + 2.2, 0.8, 2.1, T, 'alu', behind='dark', bars=True)
    box('wood_frame', (w + 0.05, d + 0.05, 0.2), (0, 0, 3.55))
    gable_fill('wood_grey', w, d, 2.0, 6.45)
    gable_roof(w, d, 2.0, 6.45, 'roof_tile', over_e=0.7)
    signboard('第一水産', 6.0, 1.3, (0, -d / 2 - 0.12, 3.65 + 1.0), board='sign_wood')
    with xf((0, -d / 2, 0)): pent_roof(w + 0.2, 1.1, 3.55, 'tin_blue', wave=0.0)
    gutter(-w / 2 - 0.3, w / 2 + 0.3, -d / 2 - 0.62, 6.0); downpipe(w / 2 + 0.2, -d / 2 - 0.55, 6.0)
    ac_unit((w / 2 + 0.25, 2, 0.5), math.pi / 2); ac_unit((w / 2 + 0.25, 3, 0.5), math.pi / 2)

def warehouse(w, d, h, clad, roof_mat, seed, lean=True, sign=None):
    T = 0.18
    box('concrete', (w + 0.2, d + 0.2, 0.2), (0, 0, 0))
    fr = side_walls(w, d, 0.2, h, T, clad, {'front': [(w / 2 - 2.4, w / 2 + 2.4, 0, 4.2), (w - 2.2, w - 1.0, 0, 2.1)], 'right': [(1.5, 3.3, 2.2, 3.2), (d - 4, d - 2.2, 2.2, 3.2)],
                                            'left': [(1.5, 3.3, 2.2, 3.2)], 'back': [(w / 2 - 1.5, w / 2 + 1.5, 0, 3.4)]})
    with xf(*fr['front'][:2]):
        door(w / 2 - 2.4, w / 2 + 2.4, 0, 4.2, T, 'big_slide', 'wood_grey' if clad != 'tin_blue' else 'tin_blue')
        door(w - 2.2, w - 1.0, 0, 2.1, T, 'wood')
        for x in frange(0.0, w, w / 4): box2('wood_frame', x - 0.08, x + 0.08, -0.08, 0, 0, h)
        box2('wood_frame', 0, w, -0.1, 0, h * 0.55 - 0.08, h * 0.55 + 0.08)
    for side in ('right', 'left'):
        with xf(*fr[side][:2]):
            for (a, b, c, e) in fr and {'right': [(1.5, 3.3, 2.2, 3.2), (d - 4, d - 2.2, 2.2, 3.2)], 'left': [(1.5, 3.3, 2.2, 3.2)]}[side]:
                window(a, b, c, e, T, 'wood_frame', behind='dark', bars=True)
    with xf(*fr['back'][:2]): door(w / 2 - 1.5, w / 2 + 1.5, 0, 3.4, T, 'shutter')
    rise = d / 2 * 0.5
    gable_fill(clad, w, d, rise, 0.2 + h)
    # small louvre in the gable
    for sx in (-1, 1):
        for k in range(4): box('wood_frame', (0.06, 1.2, 0.08), (sx * (w / 2 + 0.02), 0, 0.2 + h + 0.6 + k * 0.2))
    gable_roof(w, d, rise, 0.2 + h, roof_mat, over_e=0.6, wave=0.032 if roof_mat.startswith('roof') else 0.0)
    if sign: signboard(sign, 5.0, 1.0, (0, -d / 2 - 0.12, 0.2 + h - 0.35), board='sign_wood')
    if lean:  # lean-to on the right with tin roof, open front
        lw = 3.5
        with xf((w / 2 + lw / 2, 0, 0)):
            box('concrete', (lw, d, 0.15), (0, 0, 0))
            for y in (-d / 2 + 0.2, 0, d / 2 - 0.2): box('wood_frame', (0.15, 0.15, 3.0), (lw / 2 - 0.1, y, 0.15))
            box2('wood', lw / 2 - 0.15, lw / 2, -d / 2, d / 2, 0.15, 1.2)
            slab('tin_rust', (lw / 2 + 0.3, -d / 2 - 0.3, 3.1), (lw / 2 + 0.3, d / 2 + 0.3, 3.1), (-lw / 2, -d / 2 - 0.3, 3.9), (-lw / 2, d / 2 + 0.3, 3.9), 0.04)
            for k in range(3): box('crate_blue', (0.6, 0.4, 0.3), (0, -d / 2 + 1 + k * 0.7, 0.15 + 0)); box('crate_blue', (0.6, 0.4, 0.3), (0, -d / 2 + 1 + k * 0.7, 0.45))
    gutter(-w / 2 - 0.3, w / 2 + 0.3, -d / 2 - 0.6, 0.2 + h - 0.5)

@model('warehouse_wood', '漁業倉庫(木造)', '漁港')
def warehouse_wood(): warehouse(14.0, 10.0, 5.2, 'wood', 'roof_tile', 21, True, '海凪漁協')

@model('warehouse_tin', '漁業倉庫(トタン)', '漁港')
def warehouse_tin(): warehouse(12.0, 9.0, 4.6, 'tin_blue', 'tin_rust', 22, False)

@model('gear_shed', '漁具置き場(片流れの小屋)', '漁港')
def gear_shed():
    w, d = 8.0, 4.5
    box('concrete', (w, d, 0.15), (0, 0, 0))
    box2('wood', -w / 2, w / 2, d / 2 - 0.15, d / 2, 0.15, 2.9)
    box2('wood', -w / 2, -w / 2 + 0.15, -d / 2, d / 2, 0.15, 2.5); box2('wood', w / 2 - 0.15, w / 2, -d / 2, d / 2, 0.15, 2.5)
    for x in (-w / 2 + 0.1, 0, w / 2 - 0.1): box('wood_frame', (0.15, 0.15, 2.45), (x, -d / 2 + 0.1, 0.15))
    box('wood_frame', (w, 0.15, 0.2), (0, -d / 2 + 0.1, 2.4))
    slab('tin_rust', (-w / 2 - 0.3, -d / 2 - 0.5, 2.5), (w / 2 + 0.3, -d / 2 - 0.5, 2.5), (-w / 2 - 0.3, d / 2 + 0.2, 3.1), (w / 2 + 0.3, d / 2 + 0.2, 3.1), 0.04)
    net_pile((-1.8, 0.6, 0.15), 1.4, 'net'); net_pile((1.6, 0.8, 0.15), 1.1, 'net_green')
    for k in range(3): float_cluster((-3.2 + k * 0.5, 1.6, 0.15), k)
    for k in range(4): box('crate_blue', (0.6, 0.42, 0.3), (2.8, -0.6 + 0.0, 0.15 + k * 0.3))
    torus('rope', 0.35, 0.06, (0.2, 1.6, 0.25), seg=14, rseg=6); torus('rope', 0.32, 0.06, (0.2, 1.6, 0.37), seg=14, rseg=6)

# ================================================================= lighthouses, shrine, viewpoint
@model('lighthouse', '灯台(白・高台)', '灯台・展望台')
def lighthouse():
    # small service building
    with xf((3.6, 1.5, 0)):
        box('concrete', (4.0, 3.2, 0.2), (0, 0, 0))
        fr = side_walls(4.0, 3.2, 0.2, 2.6, 0.15, 'plaster_white', {'front': [(1.5, 2.5, 0, 2.0)], 'right': [(1.0, 2.0, 1.0, 1.8)]})
        with xf(*fr['front'][:2]): door(1.5, 2.5, 0, 2.0, 0.15, 'wood', 'steel_dark')
        with xf(*fr['right'][:2]): window(1.0, 2.0, 1.0, 1.8, 0.15, 'alu', behind='dark')
        box('plaster_white', (4.3, 3.5, 0.2), (0, 0, 2.8))
    cyl('plaster_white', 3.0, 0.6, (0, 0, 0), 32)
    H = 13.0
    rings = []
    for i in range(7):
        t = i / 6; r = 2.3 - 0.85 * t
        rings.append([(r * math.cos(a / 32 * math.tau), r * math.sin(a / 32 * math.tau), 0.6 + t * H) for a in range(32)])
    loft('plaster_white', rings)
    with xf((0, -1.9, 0)):
        box2('steel_dark', -0.45, 0.45, -0.1, 0.3, 0.6, 2.7)
    for z in (5.0, 9.0):
        with xf((0, 0, z), rz=0.0):
            box('glass', (0.35, 0.3, 0.7), (0, -2.2 + 0.85 * (z - 0.6) / H, 0))
    # gallery with railing
    zg = 0.6 + H
    cyl('plaster_white', 2.2, 0.35, (0, 0, zg), 32)
    for k in range(10): rod('plaster_white', (1.4 * math.cos(k / 10 * math.tau), 1.4 * math.sin(k / 10 * math.tau), zg - 0.9), (2.0 * math.cos(k / 10 * math.tau), 2.0 * math.sin(k / 10 * math.tau), zg), 0.08, 6)
    torus('steel_dark', 2.1, 0.035, (0, 0, zg + 1.15), seg=32, rseg=6)
    torus('steel_dark', 2.1, 0.025, (0, 0, zg + 0.7), seg=32, rseg=6)
    for k in range(24): rod('steel_dark', (2.1 * math.cos(k / 24 * math.tau), 2.1 * math.sin(k / 24 * math.tau), zg + 0.35), (2.1 * math.cos(k / 24 * math.tau), 2.1 * math.sin(k / 24 * math.tau), zg + 1.15), 0.02, 4)
    # lantern room
    cyl('plaster_white', 1.25, 0.9, (0, 0, zg + 0.35), 24)
    for k in range(10): rod('steel_dark', (1.1 * math.cos(k / 10 * math.tau), 1.1 * math.sin(k / 10 * math.tau), zg + 1.25), (1.1 * math.cos(k / 10 * math.tau), 1.1 * math.sin(k / 10 * math.tau), zg + 3.0), 0.035, 4)
    cyl('glass', 1.08, 1.75, (0, 0, zg + 1.25), 20)
    cyl('steel_dark', 1.3, 0.12, (0, 0, zg + 3.0), 24)
    cyl('steel_dark', 1.3, 1.0, (0, 0, zg + 3.1), 24, r2=0.25)
    cyl('steel_dark', 0.25, 0.25, (0, 0, zg + 4.1), 12, r2=0.15); ico('steel_dark', 0.18, (0, 0, zg + 4.45), sub=1)
    rod('steel_dark', (0, 0, zg + 4.5), (0, 0, zg + 5.3), 0.03, 4)
    part('lighthouse_lamp', (0, 0, zg + 2.1))
    cyl('beacon_white', 0.45, 0.9, (0, 0, zg + 1.65), 16)
    box('beacon_white', (0.25, 0.9, 0.5), (0, -0.5, zg + 1.85))
    part(None)

@model('lighthouse_red', '赤灯台(防波堤)', '灯台・展望台')
def lighthouse_red():
    cyl('concrete', 1.8, 0.6, (0, 0, 0), 24)
    rings = [[(r * math.cos(a / 24 * math.tau), r * math.sin(a / 24 * math.tau), z) for a in range(24)] for r, z in ((1.1, 0.6), (0.85, 6.4))]
    loft('red', rings)
    box2('steel_dark', -0.35, 0.35, -1.2, -0.95, 0.6, 2.4)
    for z in (3.0, 4.6): box('steel_dark', (0.3, 0.1, 0.45), (0, -0.95 + 0.04 * (z - 0.6) / 5.8 * 0 - 0.0, z))
    cyl('red', 1.25, 0.2, (0, 0, 6.4), 24)
    torus('white', 1.2, 0.025, (0, 0, 7.3), seg=24, rseg=6)
    for k in range(16): rod('white', (1.2 * math.cos(k / 16 * math.tau), 1.2 * math.sin(k / 16 * math.tau), 6.6), (1.2 * math.cos(k / 16 * math.tau), 1.2 * math.sin(k / 16 * math.tau), 7.3), 0.018, 4)
    cyl('red', 0.6, 0.4, (0, 0, 6.6), 16)
    cyl('glass', 0.5, 0.9, (0, 0, 7.0), 16)
    part('lighthouse_red_lamp', (0, 0, 7.4))
    cyl('beacon_red', 0.3, 0.6, (0, 0, 7.1), 12)
    part(None)
    cyl('red', 0.65, 0.5, (0, 0, 7.9), 16, r2=0.1)
    rod('steel_dark', (0, 0, 8.3), (0, 0, 9.0), 0.025, 4)
    text3d('ink_white', '海凪港', 0.35, (0, -0.98, 2.6), depth=0.02, vertical=True)

def kasagi(w, z, mat, curve=0.25, th=0.32, depth=0.42):
    """Torii top beam with upturned ends (反り)."""
    rings = []
    N = 14
    for i in range(N + 1):
        t = i / N * 2 - 1; x = t * w / 2; zz = z + curve * t * t
        rings.append([(x, -depth / 2, zz), (x, depth / 2, zz), (x, depth / 2 * 0.85, zz + th), (x, -depth / 2 * 0.85, zz + th)])
    loft(mat, rings)

@model('torii', '鳥居(朱)', '神社')
def torii():
    w = 5.2; H = 4.6
    for sx in (-1, 1):
        cyl('vermilion', 0.24, H, (sx * 1.75, 0, 0.3), 16, r2=0.21)
        cyl('black', 0.32, 0.35, (sx * 1.75, 0, 0), 16, r2=0.27)  # 根巻き
    box('vermilion', (4.6, 0.26, 0.28), (0, 0, H - 0.75))   # 貫
    box('vermilion', (0.32, 0.22, 0.85), (0, 0, H - 0.47))  # 額束
    kasagi(4.4, H + 0.05, 'vermilion', 0.12, 0.24, 0.42)     # 島木
    kasagi(w, H + 0.29, 'black', 0.28, 0.26, 0.5)           # 笠木
    signboard('海凪神社', 0.5, 1.0, (0, -0.2, H - 0.05), board='black', ink='gold', frame='vermilion', vertical=True, depth=0.06)

@model('shrine_hall', '社殿(小さな拝殿)', '神社')
def shrine_hall():
    w, d = 5.4, 4.6
    # raised floor on stone base, veranda, steps
    box('granite', (w + 1.6, d + 1.6, 0.5), (0, 0, 0))
    for x in (-w / 2, -w / 6, w / 6, w / 2):
        for y in (-d / 2, d / 2): cyl('wood_frame', 0.13, 0.5, (x, y, 0.5), 10)
    box('wood_light', (w + 1.0, d + 1.0, 0.12), (0, 0, 1.0))
    for i in range(4): box('wood_light', (1.8, 0.3, 0.2 * (i + 1)), (0, -d / 2 - 0.65 - (3 - i) * 0.28, 0.5 + 0 * i))
    railing(-w / 2 - 0.5, -1.0, -d / 2 - 0.5, 1.12, 0.6, 'wood_frame', 0.6)
    railing(1.0, w / 2 + 0.5, -d / 2 - 0.5, 1.12, 0.6, 'wood_frame', 0.6)
    T = 0.12
    fr = side_walls(w, d, 1.12, 2.8, T, 'wood_light', {'front': [(0.4, w - 0.4, 0, 2.4)]})
    with xf(*fr['front'][:2]):
        # lattice doors (格子戸)
        for k in range(3):
            a = 0.4 + (w - 0.8) * k / 3; b = 0.4 + (w - 0.8) * (k + 1) / 3
            box2('wood_frame', a, b, 0.03, 0.08, 0, 0.12); box2('wood_frame', a, b, 0.03, 0.08, 2.3, 2.4)
            for i in range(9): x = a + 0.05 + (b - a - 0.1) * i / 8; box2('wood_frame', x - 0.015, x + 0.015, 0.03, 0.08, 0, 2.4)
            for i in range(1, 8): z = 2.4 * i / 8; box2('wood_frame', a, b, 0.05, 0.07, z - 0.012, z + 0.012)
        box2('black', 0.4, w - 0.4, 0.5, 0.52, 0, 2.4)
    for x in (-w / 2, w / 2):
        for y in (-d / 2, d / 2): cyl('vermilion', 0.12, 2.9, (x, y, 1.1), 12)
    # irimoya-ish roof: hip lower part + small gable on top, copper green
    zr = hip_roof(w, d, 1.3, 4.0, 'copper', over=1.2, wave=0.0)
    gable_fill('wood_frame', 2.6, 2.0, 0.8, zr - 0.3)
    gable_roof(2.6, 2.0, 0.8, zr - 0.3, 'copper', over_e=0.3, over_g=0.25, rafters=False, wave=0.0, barge='wood_frame', fascia=None)
    for sx in (-1, 1):  # 千木 crossed finials
        rod('wood_frame', (sx * 1.5, -0.6, zr + 0.2), (sx * 1.6, 0.6, zr + 1.3), 0.05, 4)
        rod('wood_frame', (sx * 1.5, 0.6, zr + 0.2), (sx * 1.6, -0.6, zr + 1.3), 0.05, 4)
    # shimenawa rope with shide and a bell with rope
    rings = []
    for i in range(13):
        t = i / 12; x = -w / 2 + 0.3 + t * (w - 0.6); z = 3.75 - 0.25 * math.sin(t * math.pi)
        rings.append([(x, -d / 2 - 0.25 + 0.09 * math.cos(a / 8 * math.tau), z + 0.09 * math.sin(a / 8 * math.tau)) for a in range(8)])
    loft('straw', rings)
    for k in range(4):
        x = -1.6 + k * 1.07
        prism('paper', [(0, 0), (0.12, -0.12), (0, -0.24), (0.12, -0.36), (0, -0.48)], 0.12, loc=(x, -d / 2 - 0.27, 3.55), axis='Y')
    ico('gold', 0.18, (0, -d / 2 - 0.3, 3.3), sub=2)
    for k in range(3): rod(['cloth_red', 'cloth_white', 'cloth_red'][k], (-0.04 + k * 0.04, -d / 2 - 0.3, 1.3), (-0.04 + k * 0.04, -d / 2 - 0.3, 3.15), 0.02, 4)
    # offering box (賽銭箱)
    with xf((0, -d / 2 - 0.2, 1.12)):
        box('wood_dark', (1.2, 0.6, 0.7), (0, 0, 0))
        for k in range(6): box('wood_frame', (0.04, 0.6, 0.06), (-0.5 + k * 0.2, 0, 0.7))
        text3d('ink_white', '賽銭', 0.18, (0, -0.31, 0.35), depth=0.01)

@model('saisen_box', '賽銭箱', '神社')
def saisen_box():
    box('wood_dark', (1.2, 0.6, 0.75), (0, 0, 0))
    for k in range(6): box('wood_frame', (0.04, 0.62, 0.06), (-0.5 + k * 0.2, 0, 0.75))
    box('wood_frame', (1.3, 0.7, 0.08), (0, 0, 0))
    text3d('ink_white', '奉納', 0.2, (0, -0.31, 0.4), depth=0.01)

@model('ishidoro', '石灯籠', '神社')
def ishidoro():
    box('granite', (0.8, 0.8, 0.25), (0, 0, 0))
    cyl('granite', 0.3, 0.2, (0, 0, 0.25), 6, r2=0.25)
    cyl('granite', 0.13, 0.9, (0, 0, 0.45), 10)
    cyl('granite', 0.3, 0.18, (0, 0, 1.35), 6, r2=0.38)
    with xf((0, 0, 1.53)):
        for k in range(6):
            a = k / 6 * math.tau
            if k in (1, 4): box('lantern_white', (0.32, 0.03, 0.42), (0.3 * math.cos(a + math.pi / 6), 0.3 * math.sin(a + math.pi / 6), 0), (0, 0, a + math.pi / 6 + math.pi / 2))
            else: box('granite', (0.32, 0.06, 0.42), (0.3 * math.cos(a + math.pi / 6), 0.3 * math.sin(a + math.pi / 6), 0), (0, 0, a + math.pi / 6 + math.pi / 2))
        cyl('lamp', 0.1, 0.25, (0, 0, 0.05), 8)
    cyl('granite', 0.62, 0.32, (0, 0, 1.95), 6, r2=0.05)
    ico('granite', 0.1, (0, 0, 2.3), sub=1)
    ico('moss', 0.22, (0.15, 0.1, 2.05), (1.4, 1, 0.35), 1, 0.3, 3)

@model('komainu', '狛犬', '神社')
def komainu():
    box('granite', (0.7, 0.9, 0.7), (0, 0, 0)); box('granite', (0.8, 1.0, 0.15), (0, 0, 0.7))
    ico('granite', 0.3, (0, 0.1, 1.15), (0.9, 1.2, 1.1), 2, 0.1, 1)
    ico('granite', 0.24, (0, -0.2, 1.55), (1, 1, 1), 2, 0.12, 2)
    ico('granite', 0.12, (0, -0.42, 1.5), (1.2, 1, 0.8), 1)
    for sx in (-1, 1):
        cyl('granite', 0.07, 0.4, (sx * 0.15, -0.25, 0.85), 8)
        ico('granite', 0.08, (sx * 0.15, -0.25, 1.75), sub=1)
    ico('granite', 0.12, (0, 0.45, 1.35), (0.6, 1, 1.4), 1, 0.2, 4)

@model('azumaya', '展望台の東屋(四阿)', '灯台・展望台')
def azumaya():
    w = 4.4
    box('planks', (w + 2.0, w + 2.0, 0.2), (0, 0, 0))
    for x in (-w / 2, w / 2):
        for y in (-w / 2, w / 2): box('wood_frame', (0.18, 0.18, 2.6), (x, y, 0.2))
    for sg in (-1, 1):
        box('wood_frame', (w + 0.3, 0.18, 0.22), (0, sg * w / 2, 2.6)); box('wood_frame', (0.18, w + 0.3, 0.22), (sg * w / 2, 0, 2.6))
    hip_roof(w, w, 1.5, 2.85, 'roof_tile', over=0.7, ridge_k=0.0)
    ico('roof_tile', 0.2, (0, 0, 4.4), sub=1)
    for sx in (-1, 1):  # benches inside
        box('wood_light', (0.45, w - 0.6, 0.06), (sx * (w / 2 - 0.4), 0, 0.62))
        for y in (-1.3, 0, 1.3): box('wood_frame', (0.4, 0.06, 0.42), (sx * (w / 2 - 0.4), y, 0.2))
    box('wood_light', (1.2, 0.7, 0.05), (0, 0.5, 0.92)); box('wood_frame', (0.12, 0.12, 0.72), (0, 0.5, 0.2))
    railing(-w / 2, w / 2, w / 2, 0.2, 0.8, 'wood_frame', 0.5)

@model('telescope', '有料望遠鏡', '灯台・展望台')
def telescope():
    cyl('steel_dark', 0.25, 0.08, (0, 0, 0), 12); cyl('steel_dark', 0.06, 1.05, (0, 0, 0.08), 10)
    with xf((0, 0, 1.2), rx=0.15):
        box('steel_dark', (0.5, 0.35, 0.32), (0, 0, -0.12))
        for sx in (-1, 1):
            rod('steel_dark', (sx * 0.1, -0.15, 0.03), (sx * 0.1, -0.55, 0.03), 0.085, 12)
            rod('metal', (sx * 0.1, 0.17, 0.05), (sx * 0.1, 0.27, 0.05), 0.05, 10)
        box('yellow', (0.18, 0.02, 0.1), (0, 0.18, -0.02))

@model('info_board', '案内板(港町マップ)', '灯台・展望台')
def info_board():
    for sx in (-1, 1): box('wood_frame', (0.12, 0.12, 1.5), (sx * 0.85, 0, 0))
    with xf((0, 0, 1.15), rx=-0.35):
        box('wood_frame', (1.9, 0.08, 1.05), (0, 0, -0.52))
        box('sign_blue', (1.75, 0.02, 0.9), (0, -0.05, -0.45))
        box('sign_green', (0.6, 0.01, 0.35), (-0.4, -0.065, -0.3)); box('paper', (0.5, 0.01, 0.2), (0.3, -0.065, -0.2))
        text3d('ink_white', '海凪の港町', 0.13, (0, -0.07, 0.3), depth=0.01)
    box('wood_frame', (2.0, 0.2, 0.08), (0, 0.05, 1.45))

# ================================================================= boats
def boat_hull(L, B, D, bw=0.55, band='boat_blue', N=26, transom=0.84, sheer=0.75):
    """FRP fishing-boat hull, bow towards -Y, waterline at z = 0. Lofted from N+1 stations of a section with
    keel, bilge, chine, flared topside, deck edge and bulwark; antifouling below the chine, a coloured sheer band,
    a white bulwark and a deck. Returns helpers hb(t) (half-beam), zd(t) (deck height), y(t); t = 0 stern .. 1 bow."""
    zk0 = -0.42 * D
    def hb(t):
        if t < 0.5: return B / 2 * (transom + (1 - transom) * math.sin(t / 0.5 * math.pi / 2))
        return B / 2 * max(0.0, 1 - ((t - 0.5) / 0.5) ** 2.1)
    def zd(t): return zk0 + D + sheer * (max(0.0, t - 0.4) / 0.6) ** 2 + 0.08 * (1 - t)
    def zk(t): return zk0 if t < 0.7 else zk0 + (zd(1.0) - 0.25 - zk0) * ((t - 0.7) / 0.3) ** 1.7
    def yy(t): return L / 2 - t * L
    rings = []
    for i in range(N + 1):
        t = i / N; h, d_, k = hb(t), zd(t), zk(t)
        hc = h * 0.86; zc = k + (d_ - k) * 0.36; hi = max(0.0, h - 0.07)
        side = [(hc * 0.55, k + (zc - k) * 0.22), (hc, zc), (h * 0.97, d_ - 0.42), (h, d_), (h * 1.01, d_ + bw), (hi, d_ + bw), (hi, d_)]
        ring = [(0.0, k)] + side + [(-x, z) for x, z in reversed(side)]
        rings.append([(x, yy(t), z) for x, z in ring])
    n = len(rings[0])  # 15: 0 keel, 1..7 starboard, 8..14 port (mirrored order)
    segs = {'antifoul': [(0, 1), (1, 2), (13, 14), (14, 0)], 'hull': [(2, 3), (4, 5), (11, 12), (9, 10)],
            band: [(3, 4), (10, 11)], 'white': [(5, 6), (6, 7), (8, 9)], 'deck_green': [(7, 8)]}
    for mat, pairs in segs.items():
        v, f = [], []
        for (a, b) in pairs:
            base = len(v)
            for r in rings: v += [r[a], r[b]]
            for i in range(N): f.append((base + 2 * i, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2))
        mesh(mat, v, f)
    mesh('hull', rings[0], [tuple(range(n))])  # transom
    return hb, zd, yy

def boat_dress(L, B, hb, zd, yy, name, ink='ink', fenders=5, floats=True):
    for sx in (-1, 1):
        for k in range(fenders):  # tyre fenders hanging over the side
            t = 0.15 + k * 0.6 / max(1, fenders - 1)
            torus('rubber', 0.3, 0.11, (sx * (hb(t) + 0.12), yy(t), zd(t) - 0.45), rot=(0, math.pi / 2, 0), seg=14, rseg=6)
            rod('rope', (sx * (hb(t) + 0.1), yy(t), zd(t) - 0.15), (sx * hb(t), yy(t), zd(t) + 0.55), 0.015, 4)
        t = 0.8; a = math.atan2(hb(t + 0.02) - hb(t - 0.02), 0.04 * L)
        text3d(ink, name, 0.42, (sx * (hb(t) + 0.035), yy(t), zd(t) - 0.75), rz=sx * (math.pi / 2 - a), depth=0.03)
        if floats:
            for k in range(4): ico('float_yellow', 0.19, (sx * (hb(0.6 + k * 0.05) + 0.12), yy(0.6 + k * 0.05), zd(0.6) + 0.15), sub=2)

@model('fishing_boat', '漁船(海凪丸・中型)', '船')
def fishing_boat():
    L, B, D = 14.0, 3.8, 2.0
    hb, zd, yy = boat_hull(L, B, D)
    boat_dress(L, B, hb, zd, yy, '海凪丸')
    dz = zd(0.35)
    # wheelhouse (aft of midships) with a flying bridge
    with xf((0, yy(0.33), dz)):
        box('white', (2.6, 3.0, 2.0), (0, 0, 0))
        box('white', (2.9, 3.4, 0.12), (0, 0, 2.0))
        for k in range(3): box('glass', (0.72, 0.04, 0.72), (-0.82 + k * 0.82, -1.51, 1.1))
        for sx in (-1, 1):
            for k in range(2): box('glass', (0.04, 0.72, 0.6), (sx * 1.31, -0.8 + k * 1.0, 1.15))
        box('white', (2.0, 2.2, 1.1), (0, 0.2, 2.12))
        for k in range(3): box('glass', (0.5, 0.04, 0.5), (-0.6 + k * 0.6, -0.91, 2.6))
        box('boat_blue', (2.2, 2.4, 0.1), (0, 0.2, 3.22))
        box('steel_dark', (0.8, 0.05, 1.8), (1.0, 1.52, 0))
        railing(-1.3, 1.3, -1.6, 2.12, 0.55, 'white', 0.3)
        # mast with radar, antennas, lights
        rod('white', (0, -0.3, 3.3), (0, -0.3, 7.0), 0.08, 8)
        rod('white', (-1.5, -0.3, 5.6), (1.5, -0.3, 5.6), 0.05, 6)
        ico('beacon_white', 0.1, (0, -0.3, 7.05), sub=1)
        for sx in (-1, 1):
            ico('beacon_red' if sx < 0 else 'green', 0.08, (sx * 1.5, -0.3, 5.7), sub=1)
            for k in range(3): ico('float_yellow', 0.15, (sx * (0.5 + k * 0.35), -0.3, 5.38), sub=2)
        for x in (-0.8, 0.5, 0.9): rod('white', (x, 0.9, 3.3), (x, 0.9, 5.3 + x * 0.6), 0.02, 4)
    part('fishing_boat_radar', (0, yy(0.33) - 0.3, dz + 4.4))
    box('steel_dark', (1.8, 0.2, 0.12), (0, yy(0.33) - 0.3, dz + 4.35)); cyl('steel_dark', 0.1, 0.3, (0, yy(0.33) - 0.3, dz + 4.05), 8)
    part(None)
    # foremast with boom, stern mast with steadying sail
    fy = yy(0.68)
    rod('white', (0, fy, zd(0.68)), (0, fy, zd(0.68) + 6.0), 0.08, 8)
    rod('white', (-1.2, fy, zd(0.68) + 4.5), (1.2, fy, zd(0.68) + 4.5), 0.04, 6)
    for k in range(5): ico('float_yellow' if k % 2 else 'float_orange', 0.16, (-1.0 + k * 0.5, fy, zd(0.68) + 4.25), sub=2)
    rod('white', (0, fy, zd(0.68) + 1.0), (0, yy(0.86), zd(0.68) + 2.6), 0.06, 6)
    rod('rope', (0, yy(0.86), zd(0.68) + 2.6), (0, yy(0.86), zd(0.86) + 0.6), 0.012, 4)
    rod('white', (0, yy(0.04), zd(0.04)), (0, yy(0.04), zd(0.04) + 4.0), 0.06, 6)
    prism('cloth_white', [(0, zd(0.04) + 1.2), (0.0, zd(0.04) + 3.9), (-1.9, zd(0.04) + 1.4)], 0.02, loc=(0, yy(0.04) - 0.05, 0), axis='X')
    # deck gear: net hauler, winch drum, hatches, crates, nets
    with xf((1.0, yy(0.55), zd(0.55))):
        box('steel_dark', (0.6, 0.6, 0.7), (0, 0, 0)); torus('yellow', 0.35, 0.1, (0, -0.35, 0.95), rot=(math.pi / 2, 0, 0), seg=14, rseg=6)
    cyl('rust', 0.3, 0.9, (-0.5, yy(0.5), zd(0.5) + 0.35), 12, rot=(0, math.pi / 2, 0))
    box('white', (1.4, 1.2, 0.18), (0, yy(0.62), zd(0.62))); box('white', (1.4, 1.2, 0.18), (0, yy(0.12), zd(0.12)))
    for k in range(3):
        for m in range(2): box('crate_blue', (0.6, 0.4, 0.3), (-0.9, yy(0.1) - k * 0.45, zd(0.1) + m * 0.3))
    net_pile((0.6, yy(0.16), zd(0.16)), 0.75, 'net')
    # rudder and propeller (stern = +Y)
    zk = -0.42 * D
    box('antifoul', (0.08, 0.6, 1.0), (0, L / 2 - 0.1, zk - 0.25))
    rod('metal', (0, L / 2 - 1.8, zk + 0.25), (0, L / 2 - 0.55, zk + 0.1), 0.05, 8)
    part('fishing_boat_prop', (0, L / 2 - 0.55, zk + 0.1))
    for k in range(3): box('metal', (0.07, 0.06, 0.36), (0, L / 2 - 0.55, zk + 0.1), (0, k / 3 * math.tau, 0.3))
    part(None)

@model('fishing_boat_b', '漁船(海栄丸・青)', '船')
def fishing_boat_b():
    L, B, D = 12.0, 3.4, 1.8
    hb, zd, yy = boat_hull(L, B, D, bw=0.45, band='boat_blue', sheer=0.6)
    boat_dress(L, B, hb, zd, yy, '海栄丸', fenders=4, floats=False)
    dz = zd(0.2)
    with xf((0, yy(0.2), dz)):  # wheelhouse right aft
        box('white', (2.2, 2.4, 1.9), (0, 0, 0)); box('boat_blue', (2.5, 2.8, 0.1), (0, 0, 1.9))
        for k in range(3): box('glass', (0.55, 0.04, 0.6), (-0.66 + k * 0.66, -1.21, 1.1))
        for sx in (-1, 1): box('glass', (0.04, 0.8, 0.55), (sx * 1.11, -0.3, 1.1))
        rod('white', (0, -0.6, 2.0), (0, -0.6, 6.3), 0.07, 6)
        rod('white', (-1.2, -0.6, 4.8), (1.2, -0.6, 4.8), 0.04, 6)
        ico('beacon_white', 0.09, (0, -0.6, 6.35), sub=1)
    part('fishing_boat_b_radar', (0, yy(0.2), dz + 2.35)); box('steel_dark', (1.4, 0.18, 0.1), (0, yy(0.2), dz + 2.3)); cyl('steel_dark', 0.08, 0.3, (0, yy(0.2), dz + 2.0), 8); part(None)
    for k in range(6): ico(['float_orange', 'float_yellow'][k % 2], 0.22, (-0.5 + (k % 3) * 0.45, yy(0.6) + (k // 3) * 0.45, zd(0.6) + 0.22), sub=2)
    cyl('steel_dark', 0.35, 1.0, (0.5, yy(0.45), zd(0.45) + 0.4), 14, rot=(0, math.pi / 2, 0))
    for k in range(4): box('crate_blue', (0.6, 0.4, 0.3), (1.0, yy(0.7) + k * 0.45, zd(0.7)))
    net_pile((-0.6, yy(0.42), zd(0.42)), 0.7, 'net_green')
    zk = -0.42 * D
    box('antifoul', (0.08, 0.5, 0.9), (0, L / 2 - 0.1, zk - 0.2))
    part('fishing_boat_b_prop', (0, L / 2 - 0.5, zk + 0.1))
    for k in range(3): box('metal', (0.06, 0.06, 0.3), (0, L / 2 - 0.5, zk + 0.1), (0, k / 3 * math.tau, 0.3))
    part(None)

@model('skiff', '小型の和船(船外機付き)', '船')
def skiff():
    L, B, D = 6.0, 1.7, 0.8
    rings = []
    for i in range(11):
        t = i / 10; y = L / 2 - t * L
        half = B / 2 * (1 - (max(0, t - 0.5) / 0.5) ** 1.7 * 0.96)
        zb = -0.3 + (0 if t < 0.7 else (t - 0.7) / 0.3 * 0.55); zt = 0.4 + 0.35 * (max(0, t - 0.6) / 0.4) ** 2
        rings.append([(half * 0.6, y, zb), (half, y, zb + 0.2), (half * 1.05, y, zt), (half * 0.98, y, zt - 0.06), (half * 0.92, y, zb + 0.24),
                      (half * 0.55, y, zb + 0.06), (-half * 0.55, y, zb + 0.06), (-half * 0.92, y, zb + 0.24), (-half * 0.98, y, zt - 0.06), (-half * 1.05, y, zt), (-half, y, zb + 0.2), (-half * 0.6, y, zb)])
    loft('white', rings)
    rings = []
    for i in range(11):
        t = i / 10 * 0.98; y = L / 2 - t * L
        half = B / 2 * (1 - (max(0, t - 0.5) / 0.5) ** 1.7 * 0.96) * 1.06 + 0.01
        zt = 0.4 + 0.35 * (max(0, t - 0.6) / 0.4) ** 2
        rings.append([(half, y, zt - 0.14), (half, y, zt + 0.01), (-half, y, zt + 0.01), (-half, y, zt - 0.14)])
    loft('boat_blue', rings, closed=False, cap=False)
    for y in (-0.8, 0.6): box('wood_light', (B * 0.9, 0.3, 0.05), (0, y, 0.2))
    with xf((0, L / 2 + 0.15, 0)):
        box('steel_dark', (0.3, 0.45, 0.45), (0, 0, 0.35)); box('white', (0.32, 0.47, 0.12), (0, 0, 0.8))
        box('steel_dark', (0.1, 0.15, 0.8), (0, 0.05, -0.45))
        rod('steel_dark', (0, -0.2, 0.55), (0, -0.7, 0.62), 0.025, 4)
    box('crate_blue', (0.55, 0.38, 0.28), (0.2, -0.1, -0.05)); ico('float_orange', 0.18, (-0.4, 1.2, 0.1), sub=1)
    torus('rope', 0.2, 0.04, (0.3, -2.0, 0.0), seg=12, rseg=5)

# ================================================================= harbour modules and props
@model('dock_straight', '桟橋(直線4m・D1)', '岸壁モジュール')
def dock_straight():
    """Wooden pier deck 4 m long (Y) x 3 m wide, deck top at z = 0 (place at the deck height), piles reach 3.2 m down."""
    box('planks', (3.0, 4.0, 0.12), (0, 0, -0.12))
    for sx in (-1, 1):
        box('wood_dark', (0.2, 4.0, 0.25), (sx * 1.4, 0, -0.37))
        for y in (-1.5, 1.5):
            cyl('wood_dark', 0.15, 3.3, (sx * 1.35, y, -3.3), 10)
            torus('rubber', 0.28, 0.1, (sx * 1.58, y, -0.6), rot=(0, math.pi / 2, 0), seg=12, rseg=6)
    box('wood_dark', (2.9, 0.2, 0.25), (0, -1.5, -0.37)); box('wood_dark', (2.9, 0.2, 0.25), (0, 1.5, -0.37))

@model('dock_end', '桟橋の先端(D4・係船柱付き)', '岸壁モジュール')
def dock_end():
    dock_straight()
    bollard_at((0.9, -1.4, 0)); bollard_at((-0.9, -1.4, 0))
    box('wood_dark', (3.0, 0.15, 0.2), (0, -1.95, 0))

def bollard_at(loc, s=1.0):
    with xf(loc, s=s):
        cyl('iron', 0.22, 0.12, (0, 0, 0), 14, r2=0.2)
        cyl('iron', 0.16, 0.45, (0, 0, 0.12), 14, r2=0.13)
        cyl('iron', 0.24, 0.12, (0, 0, 0.55), 14, r2=0.2)
        ico('rust', 0.05, (0.15, 0, 0.35), (1, 1, 2), 1)

@model('bollard', '係船柱(ビット)', '港の小物')
def bollard(): bollard_at((0, 0, 0), 1.3)

@model('tire_fender', '防舷タイヤ', '港の小物')
def tire_fender():
    torus('rubber', 0.36, 0.14, (0, 0, 0.36), rot=(math.pi / 2, 0, 0), seg=16, rseg=8)
    rod('rope', (0, 0, 0.72), (0, 0, 1.0), 0.02, 4)

@model('quay_ladder', '岸壁のはしご', '港の小物')
def quay_ladder():
    for sx in (-1, 1): rod('steel_dark', (sx * 0.22, -0.05, -2.6), (sx * 0.22, -0.05, 0.9), 0.025, 6)
    for z in frange(-2.4, 0.2, 0.3): rod('steel_dark', (-0.22, -0.05, z), (0.22, -0.05, z), 0.018, 4)
    for sx in (-1, 1): rod('steel_dark', (sx * 0.22, -0.05, 0.9), (sx * 0.22, 0.4, 0.0), 0.025, 6)

@model('tetrapod', 'テトラポッド(消波ブロック)', '岸壁モジュール')
def tetrapod():
    c = Vector((0, 0, 1.0))
    dirs = [Vector((0, 0, 1)), Vector((0.943, 0, -0.333)), Vector((-0.471, 0.816, -0.333)), Vector((-0.471, -0.816, -0.333))]
    for d in dirs:
        a = c + d * 0.2; b = c + d * 1.45
        o = cyl('concrete', 0.55, (b - a).length, a, 14, r2=0.36)
        o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    ico('concrete', 0.62, c, sub=2)

@model('crates_blue', '魚箱(青・積み重ね)', '港の小物')
def crates_blue():
    for i in range(2):
        for j in range(2):
            n = 1 + (i + j * 2) % 3
            for k in range(n):
                with xf(((i - 0.5) * 0.66, (j - 0.5) * 0.46, k * 0.3)):
                    box('crate_blue', (0.62, 0.42, 0.04), (0, 0, 0))
                    for sx in (-1, 1): box('crate_blue', (0.03, 0.42, 0.28), (sx * 0.295, 0, 0.0)); box('crate_blue', (0.62, 0.03, 0.28), (0, sx * 0.195, 0))
                    if k == n - 1 and (i + j) % 2 == 0:
                        for m in range(5): ico('metal', 0.05, (-0.2 + m * 0.1, 0, 0.1), (2.5, 0.7, 0.5), 1)

@model('styro_boxes', '発泡スチロール箱', '港の小物')
def styro_boxes():
    for i in range(3):
        for k in range(3 - i % 2):
            box('styro', (0.7, 0.45, 0.28), ((i - 1) * 0.74, 0, k * 0.29))
            box('styro', (0.72, 0.47, 0.03), ((i - 1) * 0.74, 0, k * 0.29 + 0.27))
    text3d('ink_red', '鮮魚', 0.14, (-0.74, -0.24, 0.12), depth=0.005)

@model('pallet', 'パレット', '港の小物')
def pallet():
    for k in range(5): box('wood_light', (1.1, 0.16, 0.02), (0, -0.44 + k * 0.22, 0.12))
    for sx in (-1, 0, 1): box('wood', (0.1, 1.1, 0.1), (sx * 0.5, 0, 0.0)); box('wood_light', (0.12, 1.1, 0.02), (sx * 0.5, 0, 0.1))

@model('handcart', '台車(リヤカー)', '港の小物')
def handcart():
    box('wood_light', (1.0, 1.6, 0.05), (0, 0, 0.45))
    for sx in (-1, 1):
        box('wood_frame', (0.05, 1.6, 0.18), (sx * 0.5, 0, 0.48))
        torus('rubber', 0.24, 0.06, (sx * 0.62, 0.15, 0.3), rot=(0, math.pi / 2, 0), seg=14, rseg=6)
        rod('metal', (sx * 0.45, -0.8, 0.5), (sx * 0.4, -1.5, 0.8), 0.025, 6)
    rod('metal', (-0.62, 0.15, 0.3), (0.62, 0.15, 0.3), 0.02, 4); rod('metal', (-0.4, -1.5, 0.8), (0.4, -1.5, 0.8), 0.025, 6)
    rod('metal', (0, 0.6, 0.45), (0, 0.6, 0.0), 0.03, 4)

@model('forklift', 'フォークリフト', '港の小物')
def forklift():
    box('orange', (1.1, 1.6, 0.9), (0, 0.2, 0.25)); box('steel_dark', (1.05, 0.5, 0.6), (0, 0.85, 0.5))
    for sx in (-1, 1):
        for y, r in ((-0.4, 0.3), (0.65, 0.25)): torus('rubber', r - 0.08, 0.1, (sx * 0.55, y, r), rot=(0, math.pi / 2, 0), seg=14, rseg=6); cyl('metal', r - 0.1, 0.18, (sx * 0.47, y, r), 10, rot=(0, math.pi / 2, 0))
        rod('steel_dark', (sx * 0.4, 0.4, 1.15), (sx * 0.45, 0.6, 2.1), 0.035, 6)
        rod('steel_dark', (sx * 0.4, -0.35, 1.15), (sx * 0.4, -0.45, 2.1), 0.035, 6)
        box('steel_dark', (0.1, 0.1, 2.4), (sx * 0.35, -0.7, 0.1))
        box('steel_dark', (0.12, 1.1, 0.05), (sx * 0.25, -1.25, 0.08))
    box('steel_dark', (1.0, 0.95, 0.06), (0, 0.1, 2.1))
    box('black', (0.5, 0.45, 0.1), (0, 0.3, 1.15)); box('black', (0.5, 0.1, 0.5), (0, 0.55, 1.2))
    rod('black', (0, -0.15, 1.15), (0, -0.25, 1.5), 0.02, 4); torus('black', 0.15, 0.02, (0, -0.25, 1.5), rot=(0.8, 0, 0), seg=12, rseg=4)
    box('steel_dark', (0.9, 0.08, 1.0), (0, -0.75, 0.1))

@model('keitora', '軽トラック(白)', '乗り物')
def keitora():
    box('steel_dark', (1.35, 3.2, 0.25), (0, 0, 0.3))
    for sx in (-1, 1):
        for y in (-1.05, 0.95):
            torus('rubber', 0.2, 0.09, (sx * 0.6, y, 0.29), rot=(0, math.pi / 2, 0), seg=14, rseg=6)
            cyl('metal', 0.15, 0.17, (sx * 0.62, y, 0.29), 10, rot=(0, math.pi / 2, 0))
    # cab (front = -Y)
    rings = [[(-0.7, -1.6, 0.5), (0.7, -1.6, 0.5), (0.7, -1.6, 1.0), (-0.7, -1.6, 1.0)],
             [(-0.7, -0.6, 0.5), (0.7, -0.6, 0.5), (0.7, -0.6, 1.0), (-0.7, -0.6, 1.0)]]
    box('white', (1.4, 1.05, 0.55), (0, -1.08, 0.5))
    prism('white', [(-0.53, 0), (0.53, 0), (0.45, 0.72), (-0.35, 0.72)], 1.38, loc=(0, -1.06, 1.05), axis='X')
    box('glass', (1.2, 0.04, 0.5), (0, -1.45, 1.15), (math.radians(-12), 0, 0))
    for sx in (-1, 1): box('glass', (0.04, 0.6, 0.45), (sx * 0.7, -0.95, 1.15))
    box('glass', (1.2, 0.04, 0.4), (0, -0.53, 1.2))
    box('lamp', (0.22, 0.04, 0.12), (-0.5, -1.62, 0.75)); box('lamp', (0.22, 0.04, 0.12), (0.5, -1.62, 0.75))
    box('steel_dark', (1.3, 0.06, 0.12), (0, -1.62, 0.52)); box('metal', (0.5, 0.03, 0.1), (0, -1.62, 0.7))
    # flat bed with gates
    box('white', (1.4, 2.0, 0.08), (0, 0.55, 0.62))
    for sx in (-1, 1): box('white', (0.05, 2.0, 0.32), (sx * 0.68, 0.55, 0.7))
    box('white', (1.4, 0.05, 0.32), (0, 1.53, 0.7)); box('white', (1.4, 0.06, 0.5), (0, -0.45, 0.7))
    box('steel_dark', (1.35, 0.06, 0.06), (0, -0.45, 1.25)); rod('steel_dark', (-0.6, -0.45, 0.7), (-0.6, -0.45, 1.25), 0.02, 4); rod('steel_dark', (0.6, -0.45, 0.7), (0.6, -0.45, 1.25), 0.02, 4)
    for k in range(3): box('crate_blue', (0.6, 0.42, 0.3), (-0.33 + (k % 2) * 0.66, 0.4 + (k // 2) * 0.5, 0.7))
    box('red', (0.15, 0.03, 0.1), (-0.55, 1.56, 0.72)); box('red', (0.15, 0.03, 0.1), (0.55, 1.56, 0.72))

def net_pile(loc, s=1.0, mat='net'):
    with xf(loc, s=s):
        ico(mat, 0.8, (0, 0, 0), (1.1, 0.9, 0.45), 2, 0.25, int(s * 10), flat_bottom=0)
        for k in range(5): ico('float_yellow' if k % 2 else 'float_orange', 0.1, (math.cos(k * 1.3) * 0.6, math.sin(k * 1.3) * 0.5, 0.25 + 0.05 * k), sub=1)

@model('net_pile', '漁網の山', '港の小物')
def net_pile_m(): net_pile((0, 0, 0), 1.2)

def float_cluster(loc, seed=0):
    rnd = random.Random(seed)
    with xf(loc):
        for k in range(6):
            ico(rnd.choice(['float_yellow', 'float_orange', 'float_white']), rnd.uniform(0.14, 0.22), (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 0.18 + k * 0.08), sub=2)
        rod('rope', (0, 0, 0), (0.1, 0.1, 0.7), 0.015, 4)

@model('floats', '浮き・ブイ', '港の小物')
def floats():
    float_cluster((0, 0, 0), 3)
    ico('float_orange', 0.4, (0.8, 0.2, 0.4), sub=2); cyl('steel_dark', 0.04, 0.3, (0.8, 0.2, 0.75), 6)

@model('crab_traps', 'カゴ網(積み重ね)', '港の小物')
def crab_traps():
    for i in range(3):
        for k in range(2 if i != 1 else 3):
            with xf(((i - 1) * 1.0, 0, k * 0.55)):
                for z in (0.02, 0.5): torus('steel_dark', 0.45, 0.02, (0, 0, z), seg=16, rseg=4)
                cyl('net', 0.45, 0.5, (0, 0, 0), 16, cap=False)
                for a in range(6): rod('steel_dark', (0.45 * math.cos(a), 0.45 * math.sin(a), 0), (0.45 * math.cos(a), 0.45 * math.sin(a), 0.5), 0.012, 3)

@model('rope_coil', 'ロープの束', '港の小物')
def rope_coil():
    for k in range(4): torus('rope', 0.4 - k * 0.02, 0.05, (0, 0, 0.05 + k * 0.09), seg=18, rseg=6)

@model('market_tent', '青いテント(露店)', '港の小物')
def market_tent():
    w, d = 4.0, 3.0
    for x in (-w / 2, w / 2):
        for y in (-d / 2, d / 2): rod('metal', (x, y, 0), (x, y, 2.3 if y < 0 else 2.6), 0.03, 6)
    slab('tarp_blue', (-w / 2 - 0.1, -d / 2 - 0.1, 2.3), (w / 2 + 0.1, -d / 2 - 0.1, 2.3), (-w / 2 - 0.1, d / 2 + 0.1, 2.65), (w / 2 + 0.1, d / 2 + 0.1, 2.65), 0.02)
    box2('tarp_blue', -w / 2 - 0.1, w / 2 + 0.1, -d / 2 - 0.12, -d / 2 - 0.1, 2.0, 2.3)
    box('wood_light', (w - 0.4, 0.9, 0.05), (0, -0.6, 0.8)); box('steel_dark', (w - 0.5, 0.8, 0.8), (0, -0.6, 0))
    for k in range(4): box('styro', (0.6, 0.4, 0.2), (-1.2 + k * 0.8, -0.6, 0.85))

# ================================================================= street props
@model('utility_pole', '電柱(変圧器付き)', '道の小物')
def utility_pole():
    cyl('concrete', 0.19, 10.5, (0, 0, 0), 12, r2=0.13)
    for z, w in ((9.6, 1.8), (8.9, 1.5)):
        box('steel_dark', (w, 0.1, 0.1), (0, 0, z))
        for x in (-w / 2 + 0.1, 0.0 if w > 1.6 else None, w / 2 - 0.1):
            if x is None: continue
            cyl('white', 0.05, 0.16, (x, 0, z + 0.1), 8)
    with xf((0, 0.35, 7.0)):
        cyl('metal', 0.28, 0.9, (0, 0, 0), 14); cyl('steel_dark', 0.3, 0.06, (0, 0, 0.9), 14)
        for x in (-0.12, 0.12): cyl('white', 0.04, 0.2, (x, 0, 0.96), 6)
    box('steel_dark', (0.3, 0.3, 0.06), (0, 0.35, 6.95))
    for z in frange(2.0, 6.5, 0.45): rod('steel_dark', (0, 0, z), (0.25, 0, z), 0.015, 4)
    box('yellow', (0.4, 0.02, 1.8), (0, -0.19, 0.3)); box('black', (0.4, 0.021, 0.12), (0, -0.19, 1.2))
    box('white', (0.2, 0.02, 0.5), (0, -0.17, 3.2))

@model('street_light', '街灯', '道の小物')
def street_light():
    cyl('steel_dark', 0.08, 5.0, (0, 0, 0), 10, r2=0.06)
    rings = []
    for i in range(7):
        t = i / 6; a = t * math.pi / 2
        p = (0, -0.6 * math.sin(a), 5.0 + 0.4 * (1 - math.cos(a)) + 0.0)
        rings.append(p)
    for i in range(6): rod('steel_dark', rings[i], rings[i + 1], 0.04, 6)
    with xf((0, -0.65, 5.35)):
        cyl('steel_dark', 0.25, 0.18, (0, 0, -0.1), 14, r2=0.1)
        cyl('lamp', 0.18, 0.04, (0, 0, -0.12), 12)

@model('vending_machine', '自動販売機', '道の小物')
def vending_machine():
    box('white', (1.0, 0.75, 1.85), (0, 0, 0.05)); box('steel_dark', (1.0, 0.75, 0.05), (0, 0, 0))
    box('red', (1.02, 0.77, 0.25), (0, 0, 1.85))
    box('vend_panel', (0.9, 0.02, 0.75), (0, -0.38, 1.0))
    rnd = random.Random(5)
    for r in range(3):
        for c in range(6):
            col = rnd.choice(['red', 'blue', 'yellow', 'green', 'orange', 'white', 'black'])
            cyl(col, 0.045, 0.16, (-0.35 + c * 0.14, -0.4, 1.07 + r * 0.24), 8)
            box('cloth_blue', (0.08, 0.02, 0.03), (-0.35 + c * 0.14, -0.4, 1.03 + r * 0.24))
    box('black', (0.8, 0.06, 0.2), (0, -0.39, 0.3)); box('metal', (0.15, 0.04, 0.3), (0.32, -0.39, 0.75))
    text3d('ink_white', 'のみもの', 0.12, (0, -0.39, 1.95), depth=0.01)

@model('bicycle', '自転車(ママチャリ)', '道の小物')
def bicycle():
    for y in (-0.55, 0.55):
        torus('rubber', 0.31, 0.025, (0, y, 0.33), rot=(0, math.pi / 2, 0), seg=20, rseg=5)
        torus('metal', 0.29, 0.01, (0, y, 0.33), rot=(0, math.pi / 2, 0), seg=20, rseg=4)
        for a in range(6): rod('metal', (0, y, 0.33), (0, y + 0.28 * math.cos(a), 0.33 + 0.28 * math.sin(a)), 0.004, 3)
    c = 'cloth_red'
    rod('alu', (0, 0.55, 0.33), (0, 0.05, 0.4), 0.02, 6); rod('alu', (0, 0.05, 0.4), (0, -0.4, 0.85), 0.022, 6)
    rod('alu', (0, 0.05, 0.4), (0, 0.2, 0.85), 0.02, 6); rod('alu', (0, -0.55, 0.33), (0, -0.42, 0.9), 0.02, 6)
    box('black', (0.14, 0.26, 0.06), (0, 0.22, 0.86)); rod('alu', (-0.28, -0.4, 0.98), (0.28, -0.4, 0.98), 0.012, 4)
    rod('alu', (0, -0.42, 0.9), (0, -0.4, 0.98), 0.015, 4)
    box('steel_dark', (0.3, 0.25, 0.22), (0, -0.62, 0.72))  # front basket
    box('steel_dark', (0.3, 0.4, 0.02), (0, 0.55, 0.65))    # rear carrier
    prism(c, [(-0.3, 0.6), (0.4, 0.6), (0.45, 0.7), (-0.32, 0.7)], 0.08, loc=(0, 0.45, 0.0), axis='X')

@model('ac_outdoor', '室外機', '道の小物')
def ac_outdoor(): ac_unit((0, 0, 0.15)); box('steel_dark', (0.7, 0.2, 0.15), (0, 0, 0))

@model('a_frame_sign', '立て看板(黒板)', '道の小物')
def a_frame_sign():
    for sg in (-1, 1):
        with xf((0, sg * 0.18, 0), rx=sg * 0.2):
            box('wood_frame', (0.6, 0.04, 0.95), (0, 0, 0)); box('black', (0.5, 0.045, 0.75), (0, 0, 0.12))
    text3d('ink_white', '本日のおすすめ', 0.06, (0, -0.24, 0.8), depth=0.004)
    text3d('ink_white', '海鮮丼', 0.1, (0, -0.22, 0.6), depth=0.004)

@model('bench', 'ベンチ(木製)', '道の小物')
def bench():
    for k in range(3): box('wood_light', (1.6, 0.12, 0.04), (0, -0.15 + k * 0.14, 0.42))
    for k in range(2): box('wood_light', (1.6, 0.04, 0.1), (0, 0.24, 0.6 + k * 0.16), (0.2, 0, 0))
    for sx in (-1, 1):
        box('steel_dark', (0.06, 0.45, 0.06), (sx * 0.65, 0, 0.36)); box('steel_dark', (0.06, 0.06, 0.42), (sx * 0.65, -0.2, 0)); box('steel_dark', (0.06, 0.06, 0.82), (sx * 0.65, 0.22, 0))

@model('postbox', '郵便ポスト', '道の小物')
def postbox():
    box('red', (0.45, 0.4, 1.0), (0, 0, 0.2)); box('red', (0.5, 0.45, 0.06), (0, 0, 1.2)); cyl('steel_dark', 0.08, 0.2, (0, 0, 0), 8)
    box('black', (0.3, 0.02, 0.04), (0, -0.21, 0.95)); box('white', (0.2, 0.02, 0.12), (0, -0.21, 0.6))

@model('nobori', 'のぼり旗', '道の小物')
def nobori():
    cyl('steel_dark', 0.15, 0.1, (0, 0, 0), 10); rod('metal', (0, 0, 0), (0, 0, 3.0), 0.02, 6); rod('metal', (0, 0, 2.95), (0.5, 0, 2.95), 0.012, 4)
    box2('cloth_red', 0.02, 0.52, -0.01, 0.01, 1.0, 2.95)
    text3d('ink_white', '海鮮', 0.3, (0.27, -0.02, 2.2), depth=0.008, vertical=True)

@model('chochin_hanging', '提灯(吊り下げ)', '道の小物')
def chochin_hanging(): chochin((0, 0, 0), 0.22, 0.55, 'lantern_red', '祭')

@model('street_lantern', '石灯籠風の街灯', '道の小物')
def street_lantern():
    box('granite', (0.5, 0.5, 0.2), (0, 0, 0)); cyl('granite', 0.12, 1.3, (0, 0, 0.2), 8)
    box('granite', (0.55, 0.55, 0.1), (0, 0, 1.5)); box('lantern_white', (0.4, 0.4, 0.45), (0, 0, 1.6))
    cyl('granite', 0.45, 0.25, (0, 0, 2.05), 4, r2=0.05, rot=(0, 0, math.pi / 4))

@model('direction_sign', '道しるべ(方向看板)', '道の小物')
def direction_sign():
    cyl('wood_frame', 0.06, 2.4, (0, 0, 0), 8)
    for k, (t, a) in enumerate((('港', 0.0), ('神社', math.pi), ('灯台', math.pi * 0.7))):
        with xf((0, 0, 2.1 - k * 0.38), rz=a):
            prism('wood_light', [(0, 0), (0.95, 0), (1.15, 0.15), (0.95, 0.3), (0, 0.3)], 0.06, loc=(0, 0, 0), axis='Y')
            text3d('ink', t, 0.2, (0.5, -0.04, 0.15), depth=0.008)

CLOTHES = ['cloth_white', 'cloth_blue', 'cloth_red', 'cloth_yellow', 'cloth_white', 'cloth_green', 'cloth_pink', 'cloth_navy', 'cloth_grey', 'cloth_check', 'denim', 'cloth_orange']

def tshirt(mat, x, y, z, rnd):
    """T-shirt on a wire hanger hooked over the pole at height z."""
    k = rnd.uniform(0.85, 1.1)
    prof = [(-0.08, 0), (-0.19, -0.02), (-0.34, -0.13), (-0.29, -0.25), (-0.21, -0.19), (-0.22, -0.64), (0.22, -0.64), (0.21, -0.19), (0.29, -0.25), (0.34, -0.13), (0.19, -0.02), (0.08, 0), (0, -0.06)]
    prism(mat, [(u * k, v * k) for u, v in prof], 0.02, loc=(x, y, z - 0.12), axis='Y')
    if rnd.random() < 0.5: box(rnd.choice(CLOTHES), (0.44 * k, 0.024, 0.05), (x, y, z - 0.12 - 0.36 * k))   # printed stripe
    rod('alu', (x - 0.2 * k, y, z - 0.13), (x, y, z - 0.03), 0.006, 3); rod('alu', (x + 0.2 * k, y, z - 0.13), (x, y, z - 0.03), 0.006, 3)
    torus('alu', 0.025, 0.005, (x, y, z), rot=(math.pi / 2, 0, 0), seg=8, rseg=3)

def pants(mat, x, y, z, rnd):
    k = rnd.uniform(0.85, 1.05)
    prof = [(-0.19, 0), (0.19, 0), (0.21, -0.82), (0.04, -0.82), (0.0, -0.28), (-0.04, -0.82), (-0.21, -0.82)]
    prism(mat, [(u * k, v * k) for u, v in prof], 0.03, loc=(x, y, z - 0.05), axis='Y')
    for sx in (-1, 1): box('cloth_white', (0.025, 0.05, 0.06), (x + sx * 0.15 * k, y, z - 0.07))      # clothes pegs
    box('steel_dark', (0.4 * k, 0.012, 0.012), (x, y, z - 0.03))

def towel(mat, x, y, z, rnd, w=None):
    """Bath towel folded over the pole: a front and a back panel and the rounded fold on top."""
    w = w or rnd.uniform(0.45, 0.7); f, b = rnd.uniform(0.35, 0.55), rnd.uniform(0.45, 0.7)
    box2(mat, x - w / 2, x + w / 2, y - 0.04, y - 0.025, z - f, z)
    box2(mat, x - w / 2, x + w / 2, y + 0.025, y + 0.04, z - b, z)
    rod(mat, (x - w / 2, y, z + 0.005), (x + w / 2, y, z + 0.005), 0.04, 8)
    if rnd.random() < 0.6: box2(rnd.choice(CLOTHES), x - w / 2, x + w / 2, y - 0.045, y - 0.04, z - f + 0.06, z - f + 0.12)

def pinch_hanger(x, y, z, rnd):
    """ピンチハンガー: square frame of pegs hung from the pole, with socks and handkerchiefs."""
    hz = z - 0.28
    for a, b in (((-0.25, -0.18), (0.25, -0.18)), ((0.25, -0.18), (0.25, 0.18)), ((0.25, 0.18), (-0.25, 0.18)), ((-0.25, 0.18), (-0.25, -0.18))):
        rod('white', (x + a[0], y + a[1], hz), (x + b[0], y + b[1], hz), 0.01, 4)
    for c in ((-0.25, -0.18), (0.25, -0.18), (0.25, 0.18), (-0.25, 0.18)): rod('white', (x + c[0], y + c[1], hz), (x, y, z - 0.04), 0.004, 3)
    torus('white', 0.03, 0.006, (x, y, z), rot=(math.pi / 2, 0, 0), seg=8, rseg=3)
    for k in range(10):
        px = x - 0.25 + (k % 5) * 0.125; py = y + (-0.18 if k < 5 else 0.18)
        box(rnd.choice(['cloth_pink', 'cloth_blue', 'cloth_yellow', 'white']), (0.02, 0.025, 0.05), (px, py, hz - 0.05))
        if rnd.random() < 0.75:
            m = rnd.choice(CLOTHES)
            if rnd.random() < 0.5:  # sock
                prism(m, [(-0.03, 0), (0.03, 0), (0.03, -0.18), (0.09, -0.22), (0.07, -0.26), (-0.03, -0.24)], 0.02, loc=(px, py, hz - 0.06), axis='Y')
            else:  # handkerchief / small towel
                box2(m, px - 0.06, px + 0.06, py - 0.01, py + 0.01, hz - 0.06 - rnd.uniform(0.14, 0.26), hz - 0.06)

def futon(x0, x1, y, z, seed):
    """布団干し: a futon folded over the balcony rail (z = rail top), with clips."""
    rnd = random.Random(seed)
    m = rnd.choice(['futon', 'futon_red', 'cloth_blue', 'cloth_pink'])
    box2(m, x0, x1, y - 0.11, y - 0.04, z - 0.75, z + 0.02)
    box2(m, x0, x1, y + 0.04, y + 0.11, z - 0.5, z + 0.02)
    rod(m, (x0, y, z + 0.02), (x1, y, z + 0.02), 0.11, 10)
    for k in range(3): box2('cloth_white', x0 + (x1 - x0) * (0.2 + 0.3 * k) - 0.02, x0 + (x1 - x0) * (0.2 + 0.3 * k) + 0.02, y - 0.13, y + 0.13, z - 0.03, z + 0.16)
    if m == 'futon': box2('cloth_blue', x0, x1, y - 0.115, y - 0.11, z - 0.6, z - 0.5)

def laundry_line(x0, x1, y, z, seed):
    """Fill a laundry pole from x0 to x1 (pole at height z, running along X) with a mix of washing."""
    rnd = random.Random(seed * 7 + 1); x = x0 + 0.2
    while x < x1 - 0.3:
        kind = rnd.random()
        if kind < 0.35: tshirt(rnd.choice(CLOTHES), x + 0.3, y, z, rnd); x += 0.75
        elif kind < 0.55: pants(rnd.choice(['denim', 'cloth_khaki', 'cloth_navy', 'cloth_grey']), x + 0.22, y, z, rnd); x += 0.55
        elif kind < 0.8: w = rnd.uniform(0.45, 0.65); towel(rnd.choice(CLOTHES), x + w / 2, y, z, rnd, w); x += w + 0.12
        else:
            if x + 0.6 > x1: break
            pinch_hanger(x + 0.3, y, z, rnd); x += 0.7

@model('laundry_pole', '物干し台(洗濯物付き)', '住宅の小物')
def laundry_pole():
    for x in (-1.2, 1.2):
        box('concrete', (0.3, 0.3, 0.12), (x, 0, 0)); rod('alu', (x, 0, 0), (x, 0, 1.9), 0.03, 6); rod('alu', (x, -0.25, 1.75), (x, 0.25, 1.75), 0.02, 4)
    for y in (-0.22, 0.22): rod('alu', (-1.4, y, 1.76), (1.4, y, 1.76), 0.018, 6)
    laundry_line(-1.3, 1.3, -0.22, 1.76, 3); laundry_line(-1.3, 1.3, 0.22, 1.76, 4)

@model('fence_wood', '木の塀(2m)', '住宅の小物')
def fence_wood():
    for x in (-1.0, 1.0): box('wood_frame', (0.09, 0.09, 1.3), (x, 0, 0))
    for z in (0.3, 1.05): box('wood_frame', (2.0, 0.05, 0.07), (0, 0.04, z))
    for k in range(13): box('wood', (0.12, 0.02, 1.15), (-0.9 + k * 0.15, -0.0, 0.05))

@model('fence_rail', '白い鉄柵(2m)', '灯台・展望台')
def fence_rail():
    for x in (-1.0, 1.0): cyl('white', 0.04, 1.1, (x, 0, 0), 8)
    for z in (0.45, 1.05): rod('white', (-1.0, 0, z), (1.0, 0, z), 0.03, 6)

@model('fence_log', '丸太の柵(2m)', '灯台・展望台')
def fence_log():
    for x in (-1.0, 1.0): cyl('wood', 0.07, 1.05, (x, 0, 0), 8)
    for z in (0.5, 0.95): rod('wood', (-1.05, 0, z), (1.05, 0, z), 0.055, 8)

@model('plant_pots', '植木鉢の寄せ植え', '住宅の小物')
def plant_pots():
    for k, (x, y, s, f) in enumerate(((0, 0, 1.2, 'flower_red'), (0.42, 0.1, 0.9, None), (-0.4, 0.08, 1.0, 'hydrangea'), (0.2, 0.42, 0.8, 'flower_yellow'), (-0.2, 0.4, 1.1, None))):
        flowerpot((x, y, 0), s, f, k)

@model('propane', 'プロパンボンベ', '住宅の小物')
def propane():
    for x in (-0.22, 0.22):
        cyl('metal', 0.18, 1.1, (x, 0, 0), 14); ico('metal', 0.18, (x, 0, 1.1), (1, 1, 0.5), 1); cyl('steel_dark', 0.08, 0.1, (x, 0, 1.18), 8)
    box('steel_dark', (0.8, 0.05, 0.05), (0, 0.18, 0.9))

# ================================================================= nature
def pine(h, lean, seed):
    rnd = random.Random(seed)
    pts = [Vector((0, 0, 0))]
    for i in range(1, 7):
        t = i / 6; pts.append(Vector((lean * t * t + rnd.uniform(-0.25, 0.25) * t, rnd.uniform(-0.25, 0.25) * t, h * 0.75 * t)))
    for i in range(6): rod('bark_pine', pts[i], pts[i + 1], 0.28 * (1 - i / 7) + 0.06, 8)
    top = pts[-1]
    for k in range(8):  # layered flat foliage pads (black pine): a dark core and needle cards on top and round the rim
        a = k * 2.4 + rnd.random(); r = rnd.uniform(1.0, 2.4)
        z = top.z * rnd.uniform(0.6, 1.08)
        c = Vector((top.x * z / top.z + math.cos(a) * r, top.y + math.sin(a) * r, z))
        base = pts[min(6, max(2, int(z / top.z * 6)))]
        rod('bark_pine', base, c, 0.07, 5)
        sx, sy = rnd.uniform(1.2, 1.8), rnd.uniform(1.0, 1.5)
        ico('pine', 0.75, c, (sx, sy, 0.35), 2, 0.3, seed * 10 + k)
        cards('pine_card', c + Vector((0, 0, 0.1)), 1.0, 22, 1.0, seed * 10 + k, (sx, sy, 0.38), up=0.9, flat=0.6)
    ico('pine', 0.75, top + Vector((0, 0, 0.3)), (1.6, 1.4, 0.45), 2, 0.3, seed)
    cards('pine_card', top + Vector((0, 0, 0.4)), 1.0, 22, 1.0, seed, (1.6, 1.4, 0.45), up=0.9, flat=0.6)

@model('tree_pine', '黒松', '自然')
def tree_pine(): pine(9.0, 1.4, 3)

@model('tree_pine_b', '黒松(海辺・傾き)', '自然')
def tree_pine_b(): pine(7.5, 2.6, 7)

def canopy(clumps, dark='leaf_dark', card='leaf_card', card_dark='leaf_card_dark', seed=0, size=1.0, per=26):
    """Broadleaf crown: each clump = a dark inner blob (fills gaps) + leaf cards on its shell (lighter on top)."""
    rnd = random.Random(seed)
    for k, (c, r) in enumerate(clumps):
        ico(dark, r * 0.6, c, (1, 1, 0.8), 2, 0.2, seed + k)
        cards(card, c, r, per, size, seed * 31 + k, (1, 1, 0.82), up=0.6, shell=(0.35, 1.0))
        cards(card_dark, Vector(c) - Vector((0, 0, r * 0.25)), r * 0.85, per // 3, size, seed * 37 + k, (1, 1, 0.7), up=-0.6)

@model('tree_broadleaf', '広葉樹(クスノキ)', '自然')
def tree_broadleaf():
    rnd = random.Random(4)
    cyl('bark', 0.35, 3.0, (0, 0, 0), 10, r2=0.25)
    for k in range(5):
        a = k * 1.4 + 0.3; rod('bark', (0, 0, 2.6), (math.cos(a) * 1.6, math.sin(a) * 1.6, 4.7), 0.14, 6)
        rod('bark', (math.cos(a) * 1.6, math.sin(a) * 1.6, 4.7), (math.cos(a + 0.4) * 2.4, math.sin(a + 0.4) * 2.4, 5.6), 0.07, 5)
    cl = []
    for k in range(10):
        a = k * 2.3; r = rnd.uniform(0.6, 2.3)
        cl.append(((math.cos(a) * r, math.sin(a) * r, rnd.uniform(4.3, 6.6)), rnd.uniform(1.25, 1.75)))
    canopy(cl, seed=4)

@model('tree_shinboku', 'ご神木(大楠・しめ縄)', '神社')
def tree_shinboku():
    rnd = random.Random(8)
    cyl('bark', 1.1, 5.0, (0, 0, 0), 14, r2=0.75)
    for k in range(5):
        a = k * 1.25; rod('bark', (0, 0, 4.2), (math.cos(a) * 3, math.sin(a) * 3, 7.5 + rnd.random()), 0.32, 6)
        rod('bark', (math.cos(a) * 0.8, math.sin(a) * 0.8, 0.5), (math.cos(a) * 1.8, math.sin(a) * 1.8, -0.1), 0.25, 6)
    cl = []
    for k in range(15):
        a = k * 2.2; r = rnd.uniform(1.0, 4.2)
        cl.append(((math.cos(a) * r, math.sin(a) * r, rnd.uniform(7, 10.8)), rnd.uniform(1.7, 2.5)))
    canopy(cl, seed=8, size=1.4, per=30)
    torus('rope', 1.1, 0.12, (0, 0, 2.2), seg=20, rseg=8)
    for k in range(4):
        a = k * math.pi / 2
        prism('paper', [(0, 0), (0.12, -0.12), (0, -0.24), (0.12, -0.36), (0, -0.48)], 0.1, loc=(math.cos(a) * 1.22, math.sin(a) * 1.22, 2.1), axis='Y', rot=(0, 0, a))

@model('tree_sakura', '桜', '自然')
def tree_sakura():
    rnd = random.Random(5)
    cyl('bark', 0.25, 2.2, (0, 0, 0), 10, r2=0.18)
    for k in range(5):
        a = k * 1.3; rod('bark', (0, 0, 2.0), (math.cos(a) * 1.8, math.sin(a) * 1.8, 3.4), 0.1, 6)
        rod('bark', (math.cos(a) * 1.8, math.sin(a) * 1.8, 3.4), (math.cos(a + 0.5) * 2.4, math.sin(a + 0.5) * 2.4, 4.1), 0.05, 5)
    cl = []
    for k in range(9):
        a = k * 2.4; r = rnd.uniform(0.5, 2.1)
        cl.append(((math.cos(a) * r, math.sin(a) * r, rnd.uniform(3.2, 4.7)), rnd.uniform(0.95, 1.35)))
    canopy(cl, dark='sakura', card='sakura_card', card_dark='sakura_card', seed=5, size=0.9, per=24)

@model('tree_cedar', '杉', '自然')
def tree_cedar():
    cyl('bark', 0.3, 11.0, (0, 0, 0), 8, r2=0.05)
    for k in range(6):
        z = 2.6 + k * 1.45; rr = 2.2 - k * 0.33
        cyl('pine', rr * 0.8, 2.6, (0, 0, z), 10, r2=0.2)
        cards('pine_card', (0, 0, z + 0.9), rr, 14, 1.1, 50 + k, (1, 1, 0.55), up=-0.2, shell=(0.8, 1.05))

@model('bush', '植え込み', '自然')
def bush():
    for k in range(4):
        c = (math.cos(k * 1.7) * 0.5, math.sin(k * 1.7) * 0.4, 0.45)
        ico('leaf_dark', 0.45, c, (1, 1, 0.8), 2, 0.3, k)
        cards('shrub_card', c, 0.6, 12, 0.6, 70 + k, (1, 1, 0.8), up=0.5)

@model('hydrangea', '紫陽花', '自然')
def hydrangea():
    for k in range(4):
        c = (math.cos(k * 1.6) * 0.45, math.sin(k * 1.6) * 0.4, 0.4)
        ico('leaf_dark', 0.42, c, (1, 1, 0.8), 2, 0.25, k)
        cards('shrub_card', c, 0.55, 10, 0.55, 80 + k, (1, 1, 0.8), up=0.4)
    for k in range(11):
        a = k * 2.1; r = 0.45 + (k % 3) * 0.14
        ico('hydrangea' if k % 3 else 'hydrangea_pink', 0.17, (math.cos(a) * r, math.sin(a) * r, 0.62 + (k % 2) * 0.2), sub=2, jitter=0.18, seed=k)

@model('grass_tuft', '草むら', '自然', lod=False)
def grass_tuft():
    rnd = random.Random(2)
    for k in range(26):
        a = rnd.random() * math.tau; r = rnd.random() * 0.4; h = rnd.uniform(0.3, 0.75); lean = rnd.uniform(0.05, 0.3)
        x, y = math.cos(a) * r, math.sin(a) * r; w = rnd.uniform(0.025, 0.045)
        mid = (x + math.cos(a) * lean * 0.4, y + math.sin(a) * lean * 0.4, h * 0.55)
        mesh('grass_blade' if k % 3 else 'leaf_light', [(x - w, y, 0), (x + w, y, 0), (mid[0] + w * 0.6, mid[1], mid[2]), (mid[0] - w * 0.6, mid[1], mid[2]), (x + math.cos(a) * lean, y + math.sin(a) * lean, h)], [(0, 1, 2, 3), (3, 2, 4)])

@model('rock_a', '岩(A)', '自然')
def rock_a(): ico('rock', 1.0, (0, 0, 0.45), (1.3, 1.0, 0.75), 3, 0.35, 1)

@model('rock_b', '岩(B・平たい)', '自然')
def rock_b(): ico('rock', 1.0, (0, 0, 0.25), (1.6, 1.2, 0.5), 3, 0.3, 2); ico('rock', 0.6, (0.9, 0.5, 0.25), (1, 1, 0.8), 2, 0.3, 4)

@model('rock_c', '岩(C・海岸の大岩)', '自然')
def rock_c():
    ico('rock', 2.0, (0, 0, 1.2), (1.2, 1.0, 1.0), 3, 0.35, 3)
    ico('rock', 1.3, (1.8, 0.6, 0.6), (1, 1, 0.8), 3, 0.3, 5); ico('rock', 0.9, (-1.6, -0.8, 0.4), (1, 1, 0.8), 2, 0.3, 6)

# ================================================================= people and animals (limbs are separate nodes)
def person(cloth_top, cloth_bottom, hat=None, h=1.0, apron=False, boots=False, backpack=False, hair='hair', prefix='p', skirt=False):
    """Figure ~1.65 m tall facing -Y. Parts: <prefix>_leg_l/r (pivot at the hip), <prefix>_arm_l/r (pivot at the shoulder)."""
    with xf((0, 0, 0), s=h):
        cyl(cloth_top, 0.17, 0.58, (0, 0, 0.86), 12, r2=0.2)                  # torso, wider at the shoulders
        ico(cloth_top, 0.2, (0, 0, 1.42), (1.05, 0.72, 0.35), 2)             # shoulders
        cyl(cloth_bottom, 0.175, 0.14, (0, 0, 0.8), 12, r2=0.17)             # hips
        if skirt: cyl(cloth_bottom, 0.26, 0.42, (0, 0, 0.42), 12, r2=0.18)
        cyl('skin', 0.05, 0.1, (0, 0, 1.45), 8)
        ico('skin', 0.115, (0, 0, 1.63), (0.92, 1.0, 1.12), 3)
        ico(hair, 0.122, (0, 0.025, 1.67), (0.96, 1.0, 0.9), 3, flat_bottom=-0.03)
        for sx in (-1, 1): ico('black', 0.014, (sx * 0.04, -0.105, 1.645), sub=1)
        ico('skin', 0.02, (0, -0.115, 1.61), sub=1)
        if hat == 'cap':
            ico('cloth_blue', 0.125, (0, 0.0, 1.7), (1, 1, 0.65), 2, flat_bottom=0); box('cloth_blue', (0.18, 0.13, 0.02), (0, -0.15, 1.69))
        elif hat == 'towel':
            torus('cloth_white', 0.118, 0.028, (0, 0.01, 1.68), seg=16, rseg=6)
        elif hat == 'straw':
            cyl('bamboo', 0.27, 0.015, (0, 0, 1.71), 20, r2=0.25); ico('bamboo', 0.13, (0, 0, 1.72), (1, 1, 0.7), 2, flat_bottom=0)
            torus('cloth_red', 0.122, 0.012, (0, 0, 1.735), seg=16, rseg=4)
        if apron: prism('apron', [(-0.19, 0.5), (0.19, 0.5), (0.21, 1.38), (-0.21, 1.38)], 0.02, loc=(0, -0.205, 0), axis='Y')
        if backpack:
            box('cloth_khaki', (0.32, 0.18, 0.42), (0, 0.2, 0.92)); ico('cloth_khaki', 0.16, (0, 0.2, 1.33), (1, 0.55, 0.4), 2)
            box('cloth_red', (0.28, 0.04, 0.07), (0, 0.3, 1.15))
    for sx, s_ in ((-1, 'l'), (1, 'r')):
        part(f'{prefix}_leg_{s_}', (sx * 0.09 * h, 0, 0.84 * h))
        with xf((0, 0, 0), s=h):
            cyl(cloth_bottom, 0.075, 0.42, (sx * 0.09, 0, 0.42), 10, r2=0.085)
            cyl(cloth_bottom, 0.062, 0.4, (sx * 0.09, 0, 0.04), 10, r2=0.072)
            if boots: cyl('boot', 0.075, 0.36, (sx * 0.09, 0, 0.0), 10)
            ico('boot' if boots else 'black', 0.085, (sx * 0.09, -0.05, 0.035), (0.8, 1.45, 0.5), 2, flat_bottom=-0.035)
        part(f'{prefix}_arm_{s_}', (sx * 0.24 * h, 0, 1.4 * h))
        with xf((0, 0, 0), s=h):
            rod(cloth_top, (sx * 0.24, 0, 1.4), (sx * 0.26, 0, 1.1), 0.058, 8)
            rod(cloth_top if cloth_top != 'cloth_white' else 'cloth_white', (sx * 0.26, 0, 1.1), (sx * 0.265, -0.03, 0.86), 0.048, 8)
            ico('skin', 0.045, (sx * 0.265, -0.035, 0.82), (0.8, 1, 1.2), 2)
        part(None)

@model('player', 'プレイヤー(旅人)', '人物', lod=False)
def player(): person('cloth_white', 'denim', 'straw', 1.0, backpack=True, prefix='player')

@model('fisherman', '漁師(ゴム前掛け・長靴)', '人物', lod=False)
def fisherman(): person('cloth_navy', 'cloth_navy', 'towel', 1.02, apron=True, boots=True, hair='hair_grey', prefix='fisherman')

@model('shopkeeper', 'お店のおばちゃん', '人物', lod=False)
def shopkeeper(): person('cloth_pink', 'cloth_khaki', None, 0.95, apron=True, hair='hair_grey', prefix='shopkeeper', skirt=True)

@model('townsman', '町の人(買い物帰り)', '人物', lod=False)
def townsman(): person('cloth_green', 'cloth_khaki', 'cap', 1.0, prefix='townsman')

@model('cat', '猫(茶トラ)', '動物', lod=False)
def cat():
    ico('fur_orange', 0.16, (0, 0, 0.24), (0.9, 1.7, 0.9), 2)
    ico('fur_orange', 0.11, (0, -0.28, 0.36), sub=2)
    for sx in (-1, 1): cyl('fur_orange', 0.04, 0.08, (sx * 0.06, -0.3, 0.44), 4, r2=0.0)
    ico('fur_white', 0.06, (0, -0.37, 0.33), (1, 0.6, 0.7), 1)
    for sx in (-1, 1):
        for y in (-0.16, 0.16): cyl('fur_orange', 0.035, 0.18, (sx * 0.07, y, 0.0), 6)
    part('cat_tail', (0, 0.26, 0.28)); rod('fur_orange', (0, 0.26, 0.28), (0, 0.45, 0.55), 0.03, 6); part(None)

@model('seagull', 'カモメ', '動物', lod=False)
def seagull():
    ico('fur_white', 0.12, (0, 0, 0), (0.8, 2.2, 0.8), 2); ico('fur_white', 0.07, (0, -0.25, 0.05), sub=1)
    cyl('yellow', 0.02, 0.08, (0, -0.31, 0.04), 6, r2=0.0, rot=(math.pi / 2, 0, 0))
    for sx, s in ((-1, 'l'), (1, 'r')):
        part(f'seagull_wing_{s}', (sx * 0.08, 0, 0.03))
        mesh('fur_white', [(sx * 0.08, -0.12, 0.03), (sx * 0.08, 0.1, 0.03), (sx * 0.55, 0.06, 0.05), (sx * 0.8, 0.12, 0.02)], [(0, 1, 2), (2, 1, 3)])
        mesh('black', [(sx * 0.55, 0.06, 0.051), (sx * 0.8, 0.12, 0.021), (sx * 0.62, 0.14, 0.05)], [(0, 1, 2)])
        part(None)
    mesh('fur_white', [(0, 0.2, 0), (-0.08, 0.38, 0), (0.08, 0.38, 0)], [(0, 1, 2)])

# ---------------------------------------------------------------- export / preview
def export(top, meshes, path):
    for s in bpy.context.view_layer.objects.selected: s.select_set(False)
    for o in {top, *meshes}: o.select_set(True)
    bpy.context.view_layer.objects.active = top
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_cameras=False, export_lights=False, export_materials='EXPORT', export_image_format='NONE',
                              export_texcoords=True, export_normals=True)

def setup_render():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = 420
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 86
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [e.identifier for e in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.55, 0.72, 0.95, 1); bg.inputs['Strength'].default_value = 0.9
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.lens = 50
    sc.collection.objects.link(cam); sc.camera = cam
    L = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); L.data.energy = 4.0; L.data.angle = 0.05
    L.rotation_euler = (0.75, 0.2, -0.6); sc.collection.objects.link(L)
    fl = bpy.data.objects.new('floor', bpy.data.meshes.new('floor')); sc.collection.objects.link(fl)
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=500); bm.to_mesh(fl.data); bm.free()
    fl.data.materials.append(M('concrete')); fl.location.z = -0.001

def bounds(meshes):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(b) for o in meshes for b in o.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])

def render(name, meshes, lod, path):
    sc = bpy.context.scene
    for c in sc.view_layers[0].layer_collection.children: c.exclude = c.name != name
    if lod: lod.hide_render = True
    lo, hi = bounds(meshes)
    ctr, size = (lo + hi) / 2, (hi - lo).length
    d = Vector((-0.55, -1.0, 0.42)).normalized()
    sc.camera.location = ctr + d * size * 1.25
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
        top, meshes, lod = objs[n] = build(n)
        export(top, meshes + ([lod] if lod else []), os.path.join(GLB, n + '.glb'))
        lo, hi = bounds(meshes); ext = hi - lo
        dims = [round(v, 2) for v in (ext.x, ext.z, ext.y)]
        tris = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
        ltris = sum(len(p.vertices) - 2 for p in lod.data.polygons) if lod else 0
        _, jp, cat, _l = MODELS[n]
        meta[n] = {'name': n, 'jp': jp, 'category': cat, 'size_m': dims, 'tris': tris, 'lod1_tris': ltris,
                   'materials': sorted({m.name for o in meshes for m in o.data.materials}), 'parts': [o.name for o in meshes],
                   'kb': round(os.path.getsize(os.path.join(GLB, n + '.glb')) / 1024, 1)}
        print(f'{n:18s} {jp:22s} {tris:6d} tris (lod1 {ltris:5d})  {dims}', flush=True)
    order = list(MODELS)
    json.dump([meta[k] for k in order if k in meta], open(meta_path, 'w'), ensure_ascii=False, indent=1)
    json.dump({k: {**v, 'color': list(v['color']), 'emit': list(v['emit']) if v['emit'] else None} for k, v in PALETTE.items()},
              open(os.path.join(ROOT, 'materials.json'), 'w'), indent=1)
    if '--render' in argv:
        os.makedirs(PREVIEW, exist_ok=True); setup_render()
        for n, (top, meshes, lod) in objs.items(): render(n, meshes, lod, os.path.join(PREVIEW, n + '.jpg'))
    if '--nosave' not in argv:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'uminagi.blend'), compress=True)
