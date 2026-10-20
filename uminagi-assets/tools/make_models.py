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
    'fur_dark': P((0.5, 0.24, 0.08), 0.9), 'cheek': P((1.0, 0.55, 0.6), 0.8), 'nose_pink': P((0.95, 0.45, 0.5), 0.5), 'eye': P((0.02, 0.02, 0.03), 0.15),
    'raincoat': P((1.0, 0.78, 0.08), 0.35),
    'boot': P((0.1, 0.1, 0.1), 0.5), 'fur_orange': P((0.95, 0.36, 0.07), 0.9), 'fur_white': P((0.92, 0.9, 0.86), 0.9),
    'bark': P((0.24, 0.17, 0.11), 0.95), 'bark_pine': P((0.12, 0.1, 0.09), 0.95), 'bark_sakura': P((0.17, 0.12, 0.12), 0.9), 'bark_kusu': P((0.42, 0.36, 0.3), 0.95, tex='wood'), 'leaf': P((0.16, 0.36, 0.12), 0.85),
    'leaf_dark': P((0.07, 0.22, 0.09), 0.85), 'leaf_light': P((0.36, 0.55, 0.2), 0.85), 'pine': P((0.08, 0.24, 0.12), 0.85),
    'sakura': P((1.0, 0.72, 0.8), 0.8), 'hydrangea': P((0.2, 0.27, 0.78), 0.8), 'hydrangea_pink': P((0.8, 0.3, 0.56), 0.8),
    'flower_red': P((0.85, 0.12, 0.1), 0.8), 'flower_yellow': P((0.95, 0.8, 0.2), 0.8), 'soil': P((0.25, 0.17, 0.1), 1.0),
    'terracotta': P((0.65, 0.3, 0.16), 0.8), 'grass_blade': P((0.3, 0.5, 0.16), 0.9), 'moss': P((0.28, 0.38, 0.14), 1.0),
    'paper': P((0.96, 0.95, 0.9), 0.9),
    # foliage cards: alpha-tested quads with the leaves.png atlas (see make_textures.py), u/v measured from the image top-left
    'leaf_card': P((1.0, 1.0, 1.0), 0.8, tex='leaves'), 'leaf_card_dark': P((0.62, 0.72, 0.62), 0.8, tex='leaves'),
    'pine_card': P((0.88, 0.96, 0.92), 0.8, tex='leaves'), 'sakura_card': P((1.0, 1.0, 1.0), 0.8, tex='leaves'),
    'shrub_card': P((1.0, 1.0, 1.0), 0.8, tex='leaves'), 'hydrangea_card': P((0.55, 0.62, 0.95), 0.8, tex='leaves'), 'cedar_card': P((0.66, 0.76, 0.7), 0.8, tex='leaves'),
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
# --- st palette begin (street props)
PALETTE.update({
    'st_post_red': P((0.72, 0.035, 0.025), 0.35), 'st_ac_body': P((0.84, 0.83, 0.78), 0.55),
    'st_propane': P((0.62, 0.64, 0.65), 0.4, 0.45), 'st_trafo': P((0.45, 0.48, 0.5), 0.5, 0.35),
    'st_galv': P((0.5, 0.52, 0.53), 0.45, 0.55), 'st_tele': P((0.025, 0.1, 0.09), 0.4, 0.25), 'st_cedar': P((0.2, 0.12, 0.07), 0.85),
    'st_glaze_blue': P((0.06, 0.16, 0.42), 0.25), 'st_pet': P((0.62, 0.78, 0.85), 0.2),
    'st_chalkboard': P((0.03, 0.06, 0.045), 0.92), 'st_chalk_white': P((0.85, 0.85, 0.8), 0.95),
    'st_chalk_yellow': P((0.95, 0.78, 0.25), 0.95), 'st_chalk_pink': P((0.95, 0.45, 0.5), 0.95),
    'st_map_sea': P((0.12, 0.38, 0.72), 0.7), 'st_map_land': P((0.8, 0.7, 0.4), 0.8), 'st_map_hill': P((0.35, 0.55, 0.3), 0.8),
})
# --- st palette end
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

def bar(mat, x0, x1, y0, y1, z0, z1, back=True):
    """Thin bar/strip without end caps (lattice bars, battens): 4 side faces, or 3 with back=False (against a wall)."""
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 1, 5, 4), (1, 2, 6, 5), (3, 0, 4, 7)] + ([(2, 3, 7, 6)] if back else [])
    return mesh(mat, v, f)

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

def rod(mat, a, b, r, verts=8, r2=None):
    """Cylinder from point a to point b (tapering to r2)."""
    a, b = Vector(a), Vector(b); d = b - a
    o = cyl(mat, r, d.length, a, verts) if r2 is None else cyl(mat, r, d.length, a, verts, r2=r2)
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
def slab(mat, e0, e1, r0, r1, t=0.1, period=0.0, amp=0.0, cols=None, lite=False):
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
        if lite and period: f += [(a, b, b + 1, a + 1), (a, a + 2, b + 2, b)]  # corrugated top + eave edge only
        else: f += [(a, b, b + 1, a + 1), (a + 2, a + 3, b + 3, b + 2), (a, a + 2, b + 2, b), (a + 1, b + 1, b + 3, a + 3)]
    if lite and period: f.append((2, 3, 4 * N + 3, 4 * N + 2))  # flat underside in one quad
    f += [(0, 1, 3, 2), (4 * N, 4 * N + 2, 4 * N + 3, 4 * N + 1)]
    return mesh(mat, v, f)

RIDGE = {'roof_tile': 'ridge_tile', 'roof_tile_brown': 'ridge_brown', 'roof_tile_blue': 'ridge_tile'}

def gable_roof(w, d, rise, z, mat='roof_tile', over_e=0.6, over_g=0.45, t=0.12, ridge=True, rafters=True, barge='wood_frame',
               fascia='wood_frame', wave=0.032, eave_tiles=True, gegyo=False):
    """Kawara gable roof over a w (X) x d (Y) box, ridge along X. z = top of the walls at the eaves."""
    s = rise / (d / 2); hw = w / 2 + over_g; he = d / 2 + over_e
    z += (t + wave) * math.sqrt(1 + s * s) + 0.01
    ze = z - over_e * s; zr = z + rise
    period = 0.3 if wave else 0
    for sg in (-1, 1):
        slab(mat, (-hw, sg * he, ze), (hw, sg * he, ze), (-hw, 0, zr), (hw, 0, zr), t, period, wave, lite=True)
        if fascia: box(fascia, (2 * hw, 0.05, 0.2), (0, sg * (he - 0.03), ze - 0.26))
        if rafters:
            for x in frange(-w / 2 + 0.2, w / 2 - 0.1, 0.5):
                rod(fascia or 'wood_frame', (x, sg * (d / 2 - 0.05), z - 0.17), (x, sg * (he - 0.05), ze - 0.17), 0.035, 4)
    tiled = mat in RIDGE
    if ridge:
        rm = RIDGE.get(mat, mat)
        ridge_cap(-hw - 0.02, hw + 0.02, zr, rm, noshi=tiled)
        for sx in (-1, 1):  # onigawara end tiles
            if tiled or mat == 'copper': onigawara((sx * (hw + 0.04), 0, zr - 0.12), sx, rm, 0.85 if tiled else 0.6)
    if tiled and eave_tiles and period:  # 軒瓦 row along both eaves and 袖瓦 (verge rolls) along the gable edges
        for sg in (-1, 1):
            eave_tile_row(-hw, hw, sg * he, ze, s, sg, RIDGE.get(mat, mat), period)
            for sx in (-1, 1):
                rod(RIDGE.get(mat, mat), (sx * (hw - 0.06), sg * (he + 0.02), ze + 0.06), (sx * (hw - 0.06), 0, zr + 0.04), 0.075, 6)
    if barge:
        for sx in (-1, 1):
            for sg in (-1, 1):
                a = Vector((sx * (hw - 0.02), sg * he, ze - 0.05)); b = Vector((sx * (hw - 0.02), 0, zr - 0.05))
                d_ = b - a
                o = box(barge, (0.06, d_.length + 0.1, 0.24), (a + b) / 2 - Vector((0, 0, 0.12)))
                o.rotation_euler = (math.atan2(d_.z, d_.y) * (1 if sg < 0 else 1) + (0 if sg < 0 else math.pi), 0, 0)
            if gegyo:  # 懸魚: carved board hanging under the barge boards at the gable apex
                prism(barge, [(-0.28, zr - 0.25), (0.28, zr - 0.25), (0.18, zr - 0.6), (0, zr - 0.78), (-0.18, zr - 0.6)], 0.05, loc=(sx * (hw + 0.01), 0, 0))
    return zr

def ridge_cap(x0, x1, zr, rm, noshi=True, y=0.0):
    """棟: stacked noshi tiles (熨斗瓦) under a round cap tile (冠瓦), running along X at height zr."""
    box(rm, (x1 - x0, 0.36, 0.2), ((x0 + x1) / 2, y, zr - 0.06))
    if noshi:
        for k, (wd, dz) in enumerate(((0.42, 0.12), (0.36, 0.2), (0.3, 0.28))):
            box(rm, (x1 - x0 - 0.04 * k, wd, 0.06), ((x0 + x1) / 2, y, zr + dz - 0.02))
    rod(rm, (x0 - 0.03, y, zr + (0.36 if noshi else 0.2)), (x1 + 0.03, y, zr + (0.36 if noshi else 0.2)), 0.11, 10)

def onigawara(loc, sx, rm, s=0.85):
    """鬼瓦: arched end plate with a raised rim and a round boss, facing ±X."""
    with xf(loc, s=s):
        prism(rm, [(-0.38, 0), (0.38, 0), (0.36, 0.42), (0.24, 0.64), (0.12, 0.84), (0, 0.72), (-0.12, 0.84), (-0.24, 0.64), (-0.36, 0.42)], 0.12, loc=(0, 0, 0))
        prism(rm, [(-0.26, 0.08), (0.26, 0.08), (0.24, 0.42), (0, 0.6), (-0.24, 0.42)], 0.06, loc=(sx * 0.08, 0, 0))
        rod(rm, (sx * 0.06, 0, 0.32), (sx * 0.16, 0, 0.32), 0.12, 10)

def eave_tile_row(x0, x1, y, z, s, sg, rm, period=0.3):
    """Round eave-end tiles (軒丸瓦) on the ridges of the corrugation at the eave line y (slope s, side sg)."""
    ln = math.sqrt(1 + s * s); dy, dz = sg / ln * 0.07, -s / ln * 0.07
    box2(rm, x0, x1, y + sg * 0.005 - 0.03, y + sg * 0.005 + 0.03, z - 0.07, z + 0.02)  # 平瓦 lip
    v, f = [], []
    ax = Vector((0, dy, dz)).normalized(); up = Vector((0, -ax.z, ax.y)) if ax.y * sg > 0 else Vector((0, ax.z, -ax.y))
    if up.z < 0: up = -up
    for x in frange(x0 + period / 4, x1, period):  # pentagonal tile ends, open at the back (13 tris each)
        c0 = Vector((x, y - dy * 0.6, z + 0.03 - dz * 0.6)); c1 = Vector((x, y + dy, z + 0.03 + dz)); k = len(v)
        for c in (c0, c1):
            for i in range(5):
                a = i / 5 * math.tau + math.pi / 2
                v.append(c + Vector((math.cos(a) * 0.065, 0, 0)) + up * (math.sin(a) * 0.065))
        f += [(k + i, k + (i + 1) % 5, k + 5 + (i + 1) % 5, k + 5 + i) for i in range(5)]
        f.append(tuple(k + 5 + i for i in range(5)))
    if v: mesh(rm, v, f)

def gable_fill(mat, w, d, rise, z, t=0.15):
    """Triangular gable walls at both X ends (between wall top z and the ridge)."""
    for sx in (-1, 1):
        x = sx * w / 2
        prism(mat, [(-d / 2, z), (d / 2, z), (0, z + rise)], t, loc=(x - sx * t / 2, 0, 0))

def hip_roof(w, d, rise, z, mat='roof_tile', over=0.6, t=0.12, ridge_k=None, wave=0.032, fascia='wood_frame', eave_tiles=True, rafters=True):
    """Kawara hipped roof (寄棟) over w x d, ridge along X."""
    s = rise / (d / 2); hw, hd = w / 2 + over, d / 2 + over
    z += (t + wave) * math.sqrt(1 + s * s) + 0.01
    ze = z - over * s; zr = z + rise
    rx = hw - hd if ridge_k is None else hw * ridge_k
    rx = max(0.0, rx)
    period = 0.3 if wave else 0
    for sg in (-1, 1):
        slab(mat, (-hw, sg * hd, ze), (hw, sg * hd, ze), (-rx, 0, zr), (rx, 0, zr), t, period, wave, lite=True)
        slab(mat, (sg * hw, -hd, ze), (sg * hw, hd, ze), (sg * rx, -0.001, zr), (sg * rx, 0.001, zr), t, period, wave, lite=True)
        if fascia:
            box(fascia, (2 * hw, 0.05, 0.2), (0, sg * (hd - 0.03), ze - 0.26)); box(fascia, (0.05, 2 * hd, 0.2), (sg * (hw - 0.03), 0, ze - 0.26))
    rm = RIDGE.get(mat, mat); tiled = mat in RIDGE
    if rx > 0.05:
        ridge_cap(-rx - 0.05, rx + 0.05, zr - 0.02, rm, noshi=tiled)
        if tiled:
            for sx in (-1, 1): onigawara((sx * (rx + 0.1), 0, zr - 0.14), sx, rm, 0.7)
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod(rm, (sx * hw, sy * hd, ze + 0.05), (sx * rx, 0, zr + 0.05), 0.09, 6)
            if tiled:  # 隅棟: a second, narrower roll on top of the hip and a small end tile at the corner
                rod(rm, (sx * (hw - 0.05), sy * (hd - 0.05), ze + 0.15), (sx * rx, 0, zr + 0.15), 0.07, 6)
                ico(rm, 0.13, (sx * (hw - 0.02), sy * (hd - 0.02), ze + 0.12), (1, 1, 1.2), 1)
    if tiled and eave_tiles and period:
        se = rise / max(0.3, hw - rx)
        for sg in (-1, 1):
            eave_tile_row(-hw + 0.1, hw - 0.1, sg * hd, ze, s, sg, rm, period)
            with xf((0, 0, 0), math.pi / 2): eave_tile_row(-hd + 0.1, hd - 0.1, -sg * hw, ze, se, -sg, rm, period)
    if rafters:
        for sg in (-1, 1):
            for x in frange(-w / 2 + 0.2, w / 2 - 0.1, 0.5):
                rod(fascia or 'wood_frame', (x, sg * (d / 2 - 0.05), z - 0.17), (x, sg * (hd - 0.05), ze - 0.17), 0.035, 4)
    return zr

def pent_roof(w, depth, z, mat='roof_tile', drop=0.35, wave=0.03, tiles=True):
    """庇: small lean-to tiled roof sticking out of a wall (wall plane at y=0, roof towards -Y), top edge at z."""
    slab(mat, (-w / 2, -depth, z - drop), (w / 2, -depth, z - drop), (-w / 2, 0.02, z), (w / 2, 0.02, z), 0.08, 0.3 if wave else 0, wave, lite=True)
    box('wood_frame', (w, 0.05, 0.14), (0, -depth + 0.02, z - drop - 0.2))
    for x in (-w / 2 + 0.1, w / 2 - 0.1):  # brackets
        prism('wood_frame', [(0, z - 0.6), (0, z - 0.1), (-depth + 0.1, z - drop - 0.1)], 0.07, loc=(x, 0, 0))
    if mat in RIDGE:
        rm = RIDGE[mat]
        box2(rm, -w / 2, w / 2, -0.12, 0.02, z - 0.02, z + 0.1)  # 水切り flashing against the wall
        if wave and tiles: eave_tile_row(-w / 2, w / 2, -depth, z - drop + 0.04, drop / depth, -1, rm, 0.3)
        for x in frange(-w / 2 + 0.35, w / 2 - 0.2, 0.6):  # rafter tails
            rod('wood_frame', (x, 0.0, z - 0.13), (x, -depth + 0.06, z - drop - 0.11), 0.03, 4)

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

def window(x0, x1, z0, z1, T=0.15, frame='alu', lattice=None, behind='shoji', sill=True, panes=2, bars=False, casing=True, hood=None, tobukuro=0,
           tob_mat='wood_dark', planter=None):
    """Window filling a wall opening (wall-local coords, see wall())."""
    w, h = x1 - x0, z1 - z0; y = T * 0.45; fw = 0.045
    box2(frame, x0, x1, y - 0.03, y + 0.03, z0, z0 + fw); box2(frame, x0, x1, y - 0.03, y + 0.03, z1 - fw, z1)
    box2(frame, x0, x0 + fw, y - 0.03, y + 0.03, z0, z1); box2(frame, x1 - fw, x1, y - 0.03, y + 0.03, z0, z1)
    for k in range(panes):  # sliding sashes on two tracks (引き違い): each pane has its own stiles and rails
        a, b = x0 + w * k / panes - (0.02 if k else 0), x0 + w * (k + 1) / panes + (0.02 if k < panes - 1 else 0)
        yy = y + (0.022 if k % 2 else -0.022)
        box2(frame, a, a + 0.035, yy - 0.012, yy + 0.012, z0, z1); box2(frame, b - 0.035, b, yy - 0.012, yy + 0.012, z0, z1)
    box2('glass', x0, x1, y - 0.005, y + 0.005, z0, z1)
    if casing:  # 額縁 trim proud of the wall face
        cm = casing if isinstance(casing, str) else frame
        box2(cm, x0 - 0.07, x1 + 0.07, -0.035, 0.0, z1, z1 + 0.07); box2(cm, x0 - 0.07, x0, -0.035, 0.0, z0, z1); box2(cm, x1, x1 + 0.07, -0.035, 0.0, z0, z1)
    if hood:  # 霧除け庇: small sheet hood over the window
        slab(hood, (x0 - 0.18, -0.42, z1 + 0.16), (x1 + 0.18, -0.42, z1 + 0.16), (x0 - 0.18, 0.0, z1 + 0.32), (x1 + 0.18, 0.0, z1 + 0.32), 0.04)
        box2('wood_frame' if hood.startswith('roof') else hood, x0 - 0.18, x1 + 0.18, -0.44, -0.4, z1 + 0.08, z1 + 0.16)
    if tobukuro:  # 戸袋 storm-shutter box beside the window (tobukuro = -1 left, +1 right) and the shutter rail on top
        tx = x0 - 0.06 - w / panes * 0.55 if tobukuro < 0 else x1 + 0.06
        box2(tob_mat, tx, tx + w / panes * 0.55, -0.16, 0.0, z0 - 0.08, z1 + 0.1)
        for k in range(1, 4): box2('wood_frame', tx, tx + w / panes * 0.55, -0.175, -0.16, z0 + (h + 0.18) * k / 4 - 0.1, z0 + (h + 0.18) * k / 4 - 0.08)
        box2('alu' if frame == 'alu' else 'wood_frame', x0 - 0.05, x1 + 0.05, -0.16, 0.0, z1 + 0.02, z1 + 0.1)
    if planter:  # flower box on the sill
        box2('terracotta' if planter is True else planter, x0 + 0.05, x1 - 0.05, -0.3, -0.06, z0 - 0.02, z0 + 0.16)
        cards('shrub_card', ((x0 + x1) / 2, -0.18, z0 + 0.26), max(0.25, w * 0.3), max(3, round(w * 3)), 0.28, round(x0 * 7) % 97, scale=(w / max(0.25, w * 0.3) * 0.45, 0.4, 0.5), up=0.6)
    if bars:  # muntins (glass lattice of old wooden windows)
        for k in range(1, 3): box2(frame, x0, x1, y - 0.015, y - 0.005, z0 + h * k / 3 - 0.012, z0 + h * k / 3 + 0.012)
    if behind == 'shoji':
        box2('shoji', x0 + 0.02, x1 - 0.02, T + 0.1, T + 0.12, z0 + 0.02, z1 - 0.02)
        for k in range(1, 3): box2('wood_light', x0, x1, T + 0.08, T + 0.1, z0 + h * k / 3 - 0.01, z0 + h * k / 3 + 0.01)
        nv = max(2, round(w / 0.4))
        for k in range(1, nv): box2('wood_light', x0 + w * k / nv - 0.01, x0 + w * k / nv + 0.01, T + 0.08, T + 0.1, z0, z1)
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
            x = x0 + 0.03 + (w - 0.06) * k / n; bar(lattice, x - 0.014, x + 0.014, -0.09, -0.05, z0 - 0.02, z1 + 0.02)
        box2(lattice, x0 - 0.04, x1 + 0.04, -0.1, -0.03, z1 + 0.02, z1 + 0.08); box2(lattice, x0 - 0.04, x1 + 0.04, -0.1, -0.03, z0 - 0.08, z0 - 0.02)
    if sill: box2('wood_frame' if frame == 'wood_frame' else 'alu', x0 - 0.05, x1 + 0.05, -0.06, T * 0.4, z0 - 0.04, z0)

def door(x0, x1, z0, z1, T=0.15, kind='slide_glass', frame='wood_frame', casing=True):
    w, h = x1 - x0, z1 - z0; y = T * 0.5
    if casing and kind != 'big_slide':  # door frame (枠) proud of the wall and a threshold
        cm = 'wood_frame' if frame not in ('steel_dark', 'tin_blue', 'alu') else 'steel_dark'
        box2(cm, x0 - 0.08, x1 + 0.08, -0.04, 0.0, z1, z1 + 0.09); box2(cm, x0 - 0.08, x0, -0.04, 0.0, z0, z1); box2(cm, x1, x1 + 0.08, -0.04, 0.0, z0, z1)
        box2('granite' if cm == 'wood_frame' else 'concrete', x0 - 0.05, x1 + 0.05, -0.08, T, z0 - 0.02, z0 + 0.03)
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

def downpipe(x, y, z_top, mat='alu', wall_dy=None, z0=0.0):
    """竪樋 with wall brackets, a swan neck at the top (towards the gutter) and a shoe at the bottom.
    wall_dy: offset from the pipe to the wall (sign gives the direction), adds brackets."""
    cyl(mat, 0.05, z_top - 0.25 - z0, (x, y, z0 + 0.12), 8)
    rod(mat, (x, y, z0 + 0.14), (x, y - 0.12 if (wall_dy or 1) > 0 else y + 0.12, z0 + 0.02), 0.05, 8)  # shoe
    cyl(mat, 0.07, 0.12, (x, y, z_top - 0.17), 8, r2=0.05)  # funnel
    if wall_dy:
        for zz in frange(z0 + 0.9, z_top - 0.5, 1.4): box('steel_dark', (0.03, abs(wall_dy) + 0.02, 0.03), (x, y + wall_dy / 2, zz))

def gutter(x0, x1, y, z, mat='alu', hangers=True):
    """軒樋: half-round gutter with end caps and hangers up to the fascia."""
    prism(mat, [(-0.075, 0.03), (-0.07, -0.02), (-0.045, -0.06), (0, -0.075), (0.045, -0.06), (0.07, -0.02), (0.075, 0.03), (0.06, 0.03), (0, -0.055), (-0.06, 0.03)],
          x1 - x0, loc=((x0 + x1) / 2, y, z))
    if hangers:
        for x in frange(x0 + 0.3, x1 - 0.2, 0.9): box('steel_dark', (0.02, 0.2, 0.02), (x, y, z + 0.03))

def battens(L, H, openings=(), step=0.45, mat='wood_frame', z0=0.0, w=0.045, out=0.03):
    """押縁: vertical battens over a board wall in wall-local coords, cut around openings."""
    for x in frange(step * 0.5, L - 0.05, step):
        cuts = sorted((o[2], o[3]) for o in openings if o[0] - 0.08 <= x <= o[1] + 0.08)
        zz = z0
        for (a, b) in cuts + [(H, H)]:
            if a - zz > 0.15: bar(mat, x - w / 2, x + w / 2, -out, 0.0, zz, a, back=False)
            zz = max(zz, b + 0.08)

def skirting(w, d, z0, h=0.3, mat='concrete', out=0.04):
    """水切り/基礎: a slightly proud base band around a w x d box."""
    box(mat, (w + 2 * out, d + 2 * out, h), (0, 0, z0))

def meter_box(loc, rz=0.0):
    with xf(loc, rz):
        box('white', (0.28, 0.12, 0.42), (0, 0, 0)); box('glass', (0.16, 0.02, 0.12), (0, -0.065, 0.24))
        rod('steel_dark', (0, 0, 0.42), (0, 0, 0.9), 0.02, 4)

def vent_hood(loc, rz=0.0, r=0.1):
    """Kitchen/bath exhaust hood (換気口) on a wall, facing -Y."""
    with xf(loc, rz):
        cyl('alu', r, 0.12, (0, 0, 0), 8, rot=(math.pi / 2, 0, 0)); box('alu', (2.4 * r, 0.16, 0.03), (0, -0.08, r + 0.02))

def tv_antenna(loc, h=1.6, rz=0.3):
    with xf(loc, rz):
        rod('alu', (0, 0, 0), (0, 0, h), 0.025, 6)
        rod('alu', (0, -0.9, h - 0.05), (0, 0.6, h - 0.05), 0.015, 4)
        for k in range(6): rod('alu', (-0.35 + k * 0.03, -0.8 + k * 0.25, h - 0.05), (0.35 - k * 0.03, -0.8 + k * 0.25, h - 0.05), 0.008, 4)
        for sx in (-1, 1): rod('steel_dark', (0, 0, h * 0.6), (sx * 0.9, 0.5, -0.3), 0.004, 3)  # guy wires

def solar_heater(loc, rz=0.0, slope=0.0):
    """太陽熱温水器: tank + collector panels on a roof slope (very common on seaside houses)."""
    with xf(loc, rz, rx=slope):
        box('alu', (2.0, 1.4, 0.08), (0, 0, 0)); box('glass', (1.9, 1.3, 0.02), (0, 0, 0.08))
        for k in range(1, 5): box('alu', (0.03, 1.3, 0.03), (-0.95 + k * 0.38, 0, 0.08))
        cyl('white', 0.22, 2.0, (-1.0, 0.75, 0.25), 12, rot=(0, math.pi / 2, 0))
        for x in (-0.8, 0.8): box('alu', (0.06, 0.06, 0.3), (x, 0.75, 0.0))

def entry_hood(x, w, z, depth=0.7, mat='roof_tile'):
    """玄関庇 with a lamp under it (wall plane y=0, front -Y)."""
    with xf((x, 0, 0)): pent_roof(w, depth, z, mat, drop=0.22, wave=0.03 if mat in RIDGE else 0.0)
    box('steel_dark', (0.14, 0.08, 0.2), (w / 2 * 0.0 + x + w / 2 - 0.15, -0.04, z - 0.65)); box('lamp', (0.1, 0.06, 0.12), (x + w / 2 - 0.15, -0.1, z - 0.61))

def mailbox(loc, rz=0.0, mat='red'):
    with xf(loc, rz):
        box(mat, (0.34, 0.14, 0.4), (0, 0, 0)); box('black', (0.22, 0.01, 0.03), (0, -0.075, 0.3))

def ac_unit(loc, rz=0.0):
    with xf(loc, rz):
        box('white', (0.8, 0.3, 0.55), (0, 0, 0)); cyl('steel_dark', 0.2, 0.02, (0.12, -0.15, 0.27), 16, rot=(math.pi / 2, 0, 0))
        for i in range(5): box('steel_dark', (0.012, 0.02, 0.4), (0.12 - 0.16 + i * 0.08, -0.16, 0.07))
        box('steel_dark', (0.04, 0.04, 0.12), (-0.25, 0.1, -0.12)); box('steel_dark', (0.04, 0.04, 0.12), (0.25, 0.1, -0.12))

def railing(x0, x1, y, z, h=0.9, mat='alu', step=0.12, post=1.2):
    box2(mat, x0, x1, y - 0.03, y + 0.03, z + h - 0.04, z + h)
    box2(mat, x0, x1, y - 0.02, y + 0.02, z + 0.08, z + 0.12)
    for x in frange(x0, x1, step): bar(mat, x - 0.012, x + 0.012, y - 0.012, y + 0.012, z, z + h)

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

ATLAS = {'leaf_card': 0, 'leaf_card_dark': 0, 'pine_card': 1, 'cedar_card': 1, 'sakura_card': 2, 'shrub_card': 3, 'hydrangea_card': 3}

def cards(mat, center, radius, n, size, seed, scale=(1, 1, 1), up=0.4, shell=(0.5, 1.0), flat=0.0, face=0.0):
    """Foliage cards: n quads carrying an atlas leaf cluster, scattered over an ellipsoid shell around center and
    facing roughly outwards (the game rewrites their normals to point away from the canopy centre for soft shading)."""
    q = ATLAS[mat]; u0, v0 = (q % 2) * 0.5, (q // 2) * 0.5
    rnd = random.Random(seed); verts, faces, uvs = [], [], []
    c = Vector(center)
    for i in range(n):
        d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1) * (1 - flat) + up)).normalized()
        p = c + Vector((d.x * scale[0], d.y * scale[1], d.z * scale[2])) * radius * rnd.uniform(*shell)
        j = 1 - face  # face = 1: cards look straight out of the clump (no edge-on streaks)
        nrm = (d + Vector((rnd.uniform(-0.7, 0.7) * j, rnd.uniform(-0.7, 0.7) * j, rnd.uniform(-0.2, 0.8) * j + flat * 2))).normalized()
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
          door_x=None, balcony=True, pent=True, lattice=True, extension=None, base=0.45, seed=0, laundry=True, side_win=True,
          tobukuro=True, solar=False, antenna=True, hood='tin_blue', planters=False, himono=False, gegyo=False, posts=None, bike_shed=False):
    """Generic Japanese wooden house. Ground floor walls `lower`, upper floor `upper`.
    Board walls get battens (押縁), plaster walls exposed posts (真壁), windows casings/hoods/storm-shutter boxes."""
    rnd = random.Random(seed)
    T = 0.15; h1, h2 = 2.75, 2.6
    box('concrete', (w + 0.1, d + 0.1, base), (0, 0, 0))
    box('wood_frame', (w + 0.14, d + 0.14, 0.06), (0, 0, base - 0.02))  # 土台 / 水切り
    for (vx, vy, rz) in ((-w / 4, -d / 2, 0), (w / 4, -d / 2, 0), (w / 2, 0, math.pi / 2), (-w / 2, 0, math.pi / 2), (0, d / 2, 0)):  # 床下換気口
        box('steel_dark', (0.42, 0.13, 0.14), (vx, vy, base * 0.35), (0, 0, rz))
    z1 = base; door_x = (-w / 2 + 1.4) if door_x is None else door_x
    is_board = lambda m: m.startswith('wood')
    # ---- ground floor
    fo = [(door_x - 0.85 + w / 2, door_x + 0.85 + w / 2, 0.0, 2.05)]
    wins = []
    for x in frange(-w / 2 + 1.0, w / 2 - 1.0, 2.2):
        if abs(x - door_x) > 1.6: wins.append((x - 0.75 + w / 2, x + 0.75 + w / 2, 0.85, 1.95))
    fo += wins
    so = [((d - 2 * T) / 2 - 0.6, (d - 2 * T) / 2 + 0.6, 0.9, 1.9)] if side_win else []
    bo = [(w / 2 - 0.7, w / 2 + 0.7, 0.9, 1.9), (0.6, 1.4, 1.3, 1.9)]
    frames = side_walls(w, d, z1, h1, T, lower, {'front': fo, 'right': so, 'left': so, 'back': bo})
    if is_board(lower):
        for side, op in (('front', fo), ('right', so), ('left', so), ('back', bo)):
            with xf(*frames[side][:2]): battens(frames[side][2], h1, op)
    hood_m = hood if hood else None
    with xf(*frames['front'][:2]):
        door(fo[0][0], fo[0][1], 0, 2.05, T)
        box2('stone_wall', fo[0][0] - 0.2, fo[0][1] + 0.2, -0.75, 0.0, -0.3, -0.05)  # step stone
        box2('granite', fo[0][0] - 0.05, fo[0][1] + 0.05, -0.45, 0.0, -0.05, 0.0)
        for (a, b, c, e) in wins:
            window(a, b, c, e, T, 'wood_frame', lattice='wood_frame' if lattice else None, behind='shoji', bars=not lattice,
                   hood=None if (pent and floors == 1) else hood_m, planter='terracotta' if planters else None)
        box2('wood_light', fo[0][0] - 0.42, fo[0][0] - 0.12, -0.03, 0, 1.3, 1.62)  # 表札 name plate
        box2('ink', fo[0][0] - 0.3, fo[0][0] - 0.24, -0.035, -0.03, 1.36, 1.56)
        box2('white', fo[0][1] + 0.15, fo[0][1] + 0.27, -0.04, 0, 1.25, 1.42)  # intercom
        mailbox((fo[0][1] + 0.45, -0.07, 0.95), 0, rnd.choice(['red', 'steel_dark', 'cloth_green']))
    if not (pent and floors == 1):
        with xf((door_x, -d / 2, 0)): entry_hood(0, 2.3, z1 + 2.55, 0.75, roof_mat if roof_mat in RIDGE else 'tin_blue')
    for side in ('right', 'left'):
        with xf(*frames[side][:2]):
            for (a, b, c, e) in so: window(a, b, c, e, T, 'alu', behind='curtain', hood=hood_m)
            vent_hood((1.0, 0.0, 2.2))
    with xf(*frames['back'][:2]):
        window(*bo[0], T, 'alu', behind='dark', hood=hood_m); window(*bo[1], T, 'alu', behind='lit', bars=True)
        vent_hood((2.0, 0.0, 1.95))
    ztop = z1 + h1
    if floors == 2:
        box('wood_frame', (w + 0.06, d + 0.06, 0.2), (0, 0, ztop - 0.1))  # floor band (胴差し)
        uo = []
        for x in frange(-w / 2 + 1.2, w / 2 - 1.0, 2.4): uo.append((x - 0.8 + w / 2, x + 0.8 + w / 2, 0.6 if balcony else 0.8, 2.0))
        so2 = [((d - 2 * T) / 2 - 0.5, (d - 2 * T) / 2 + 0.5, 0.9, 1.8)] if side_win else []
        bo2 = [(w / 2 - 0.8, w / 2 + 0.8, 0.9, 1.9)]
        frames2 = side_walls(w, d, ztop, h2, T, upper, {'front': uo, 'right': so2, 'left': so2, 'back': bo2})
        for side, op in (('front', uo), ('right', so2), ('left', so2), ('back', bo2)):
            with xf(*frames2[side][:2]):
                if is_board(upper): battens(frames2[side][2], h2, op)
                elif posts is not False: battens(frames2[side][2], h2, op, step=posts or 1.82, mat='wood_frame', w=0.11, out=0.02)
        with xf(*frames2['front'][:2]):
            for i, (a, b, c, e) in enumerate(uo):
                window(a, b, c, e, T, 'alu', behind=rnd.choice(['shoji', 'curtain', 'curtain']), sill=not balcony,
                       tobukuro=0 if balcony or not tobukuro else (-1 if a > 0.6 else (1 if b < w - 0.6 else 0)),
                       tob_mat='wood_dark' if upper != 'wood_dark' else 'tin_blue', planter='terracotta' if planters and not balcony else None)
        for side in ('right', 'left'):
            with xf(*frames2[side][:2]):
                for (a, b, c, e) in so2: window(a, b, c, e, T, 'alu', behind='curtain', hood=hood_m)
        with xf(*frames2['back'][:2]): window(*bo2[0], T, 'alu', behind='dark', tobukuro=1 if tobukuro else 0)
        for x in (-w / 2, w / 2):  # corner posts
            for y in (-d / 2, d / 2): box('wood_frame', (0.15, 0.15, h1 + h2), (x, y, z1))
        if pent:
            with xf((0, -d / 2, 0)): pent_roof(w + 0.3, 0.75, ztop + 0.05)
        if balcony:
            bz = ztop + 0.05
            box2('wood_frame', -w / 2 + 0.3, w / 2 - 0.3, -d / 2 - 1.0, -d / 2, bz + 0.12 if pent else bz, bz + 0.22 if pent else bz + 0.1)
            for x in (-w / 2 + 0.35, w / 2 - 0.35): box2('wood_frame', x - 0.05, x + 0.05, -d / 2 - 0.95, -d / 2 - 0.85, bz - 0.4, bz + 1.1)
            railing(-w / 2 + 0.3, w / 2 - 0.3, -d / 2 - 0.95, bz + 0.2, 0.95, 'alu', 0.15)
            for x in (-w / 2 + 0.3, w / 2 - 0.3): box2('alu', x - 0.015, x + 0.015, -d / 2 - 0.95, -d / 2, bz + 1.11, bz + 1.15)
            if laundry:  # 物干し竿 with washing, and sometimes a futon airing over the balcony rail
                rod('alu', (-w / 2 + 0.4, -d / 2 - 0.7, bz + 1.85), (w / 2 - 0.4, -d / 2 - 0.7, bz + 1.85), 0.018, 6)
                for x in (-w / 2 + 0.4, w / 2 - 0.4): rod('alu', (x, -d / 2 - 0.92, bz + 0.2), (x, -d / 2 - 0.7, bz + 1.95), 0.02, 6)
                laundry_line(-w / 2 + 0.7, w / 2 - 0.7, -d / 2 - 0.7, bz + 1.85, laundry if laundry is not True else seed)
                if seed % 2: futon(-w / 2 + 0.6, -w / 2 + 2.0, -d / 2 - 0.95, bz + 1.17, seed)
            ac_unit((w / 2 - 0.85, -d / 2 - 0.35, bz + 0.25))  # AC outdoor unit on the balcony
            flowerpot((-w / 2 + 0.7, -d / 2 - 0.4, bz + 0.22), 0.8, 'flower_red', seed + 9)
        ztop += h2
    elif pent:
        with xf((0, -d / 2, 0)): pent_roof(w + 0.3, 0.7, ztop - 0.25)
    # ---- roof
    rise = rise or (d / 2) * 0.55
    if roof == 'gable':
        gable_fill(upper if floors == 2 else lower, w - 0.02, d, rise, ztop)
        if is_board(upper if floors == 2 else lower):  # gable boards with battens
            for sx in (-1, 1):
                for y in frange(-d / 2 + 0.45, d / 2 - 0.4, 0.45):
                    hz = rise * (1 - abs(y) / (d / 2))
                    if hz > 0.2: box2('wood_frame', sx * (w / 2) - 0.015, sx * (w / 2) + 0.015, y - 0.022, y + 0.022, ztop, ztop + hz - 0.1)
        else:
            for sx in (-1, 1): box2('wood_frame', sx * w / 2 - 0.02, sx * w / 2 + 0.02, -d / 2, d / 2, ztop - 0.1, ztop + 0.04)
        for sx in (-1, 1):  # gable vent (換気口)
            box2('steel_dark', sx * w / 2 - 0.03, sx * w / 2 + 0.03, -0.3, 0.3, ztop + rise * 0.45, ztop + rise * 0.45 + 0.35)
        gable_roof(w, d, rise, ztop, roof_mat, gegyo=gegyo)
    else:
        hip_roof(w, d, rise, ztop, roof_mat)
    zg = ztop - 0.6 * rise / (d / 2) - 0.2
    for sg in (-1, 1):
        gutter(-w / 2 - 0.3, w / 2 + 0.3, sg * (d / 2 + 0.62), zg)
        rod('alu', (sg * 0 + w / 2 + 0.2, sg * (d / 2 + 0.6), zg - 0.05), (w / 2 + 0.2, sg * (d / 2 + 0.25), zg - 0.45), 0.045, 6)
        downpipe(w / 2 + 0.2, sg * (d / 2 + 0.25), zg - 0.35, wall_dy=None)
        for zz in frange(1.2, zg - 0.8, 1.5): box('steel_dark', (0.03, 0.1, 0.03), (w / 2 + 0.12, sg * (d / 2 + 0.25), zz), (0, 0, math.pi / 2))
    if antenna and floors == 2:
        tv_antenna((w / 4, d / 4, ztop + rise * 0.5), 1.25, 0.4 + seed)
    if solar:
        s_ = rise / (d / 2)
        solar_heater((-w / 4, d / 4 + 0.2, ztop + rise * 0.5 + 0.25), 0, math.atan(s_))
    # ---- extras around the house
    ac_unit((w / 2 + 0.25, d / 4, base + 0.1), math.pi / 2)
    box2('white', w / 2 + 0.02, w / 2 + 0.1, d / 4 - 0.05, d / 4 + 0.05, base + 0.4, base + 2.2)  # AC pipe cover
    meter_box((-w / 2 - 0.08, d / 4, 1.3), -math.pi / 2)
    cyl('metal', 0.18, 1.2, (-w / 2 - 0.3, d / 3, 0), 12); cyl('metal', 0.18, 1.2, (-w / 2 - 0.3, d / 3 + 0.42, 0), 12)  # propane
    for y in (d / 3, d / 3 + 0.42):
        cyl('steel_dark', 0.06, 0.12, (-w / 2 - 0.3, y, 1.2), 8)
        rod('alu', (-w / 2 - 0.3, y, 1.3), (-w / 2 - 0.05, y, 1.5), 0.012, 4)
    rod('steel_dark', (-w / 2 - 0.3, d / 3 - 0.2, 0.85), (-w / 2 - 0.3, d / 3 + 0.65, 0.85), 0.01, 3)  # chain
    if extension:  # lean-to annex (物置) with tin roof on the right side
        ew, ed = extension
        em = 'tin_rust' if seed % 2 else 'wood'
        with xf((w / 2 + ew / 2, d / 2 - ed / 2, 0)):
            box('concrete', (ew, ed, base), (0, 0, 0))
            eo = {'front': [(ew / 2 - 0.5, ew / 2 + 0.5, 0.0, 1.9)], 'right': [(ed / 2 - 0.4, ed / 2 + 0.4, 1.0, 1.7)]}
            fr = side_walls(ew, ed, base, 2.3, 0.1, em, eo, skip=('left',))
            with xf(*fr['front'][:2]): door(ew / 2 - 0.5, ew / 2 + 0.5, 0, 1.9, 0.1, 'wood')
            with xf(*fr['right'][:2]): window(ed / 2 - 0.4, ed / 2 + 0.4, 1.0, 1.7, 0.1, 'alu', behind='dark', bars=True)
            if em == 'wood':
                for side in ('front', 'right', 'back'):
                    with xf(*fr[side][:2]): battens(fr[side][2], 2.3, eo.get(side, ()))
            rm = 'tin_rust' if seed % 3 else 'tin_blue'
            slab(rm, (ew / 2 + 0.3, -ed / 2 - 0.3, base + 2.3), (ew / 2 + 0.3, ed / 2 + 0.3, base + 2.3),
                 (-ew / 2, -ed / 2 - 0.3, base + 2.9), (-ew / 2, ed / 2 + 0.3, base + 2.9), 0.04, 0.12, 0.012)
            for sy in (-1, 1): box2('wood_frame', -ew / 2, ew / 2 + 0.3, sy * (ed / 2 + 0.3) - 0.03, sy * (ed / 2 + 0.3) + 0.03, base + 2.2, base + 2.36)
            box('crate_blue', (0.5, 0.35, 0.3), (ew / 2 + 0.35, -ed / 2 + 0.5, 0)); box('crate_blue', (0.5, 0.35, 0.3), (ew / 2 + 0.35, -ed / 2 + 0.5, 0.3))
    if himono:  # 干物 drying rack: fish split open on a net frame by the door
        with xf((door_x + 2.3 if door_x + 3.0 < w / 2 else door_x - 2.3, -d / 2 - 0.55, 0)):
            for x in (-0.6, 0.6): rod('wood_frame', (x, 0, 0), (x, 0, 1.15), 0.025, 4)
            box('net', (1.4, 0.6, 0.02), (0, 0, 1.1)); box('wood_frame', (1.4, 0.04, 0.04), (0, -0.3, 1.1)); box('wood_frame', (1.4, 0.04, 0.04), (0, 0.3, 1.1))
            for k in range(8): ico('hull' if k % 2 else 'wood_light', 0.12, (-0.5 + (k % 4) * 0.33, -0.15 + (k // 4) * 0.3, 1.14), (0.6, 1.5, 0.15), 1)
    if bike_shed:  # 自転車置き場 with a corrugated plastic roof
        with xf((door_x - 1.8, -d / 2 - 0.55, 0)):
            for x in (-0.6, 0.6): rod('alu', (x, -0.4, 0), (x, -0.4, 2.0), 0.03, 6)
            slab('glass', (-0.75, -0.6, 1.95), (0.75, -0.6, 1.95), (-0.75, 0.55, 2.15), (0.75, 0.55, 2.15), 0.02)
    for k in range(rnd.randint(2, 4)):
        flowerpot((door_x + 1.1 + k * 0.45, -d / 2 - 0.35, 0), 0.9 + rnd.random() * 0.4, rnd.choice([None, 'flower_red', 'flower_yellow', 'hydrangea']), seed + k)
    flowerpot((door_x - 1.15, -d / 2 - 0.3, 0), 1.15, 'hydrangea', seed + 11)

@model('house_narrow', '細長い家(R1)', '住宅')
def house_narrow(): house(5.2, 7.5, 2, 'wood_dark', 'wood_dark', door_x=-1.2, balcony=True, seed=1, laundry=5, hood='tin_rust', antenna=True)

@model('house_standard', '標準的な家(R2)', '住宅')
def house_standard(): house(8.0, 6.5, 2, 'wood_dark', 'plaster', door_x=-2.4, seed=2, extension=(2.4, 3.0), laundry=14, solar=True)

@model('house_twostory', '二階建ての家(R3)', '住宅')
def house_twostory(): house(9.0, 7.0, 2, 'wood', 'plaster_cream', roof='hip', door_x=2.6, seed=3, lattice=False, laundry=30, bike_shed=True)

@model('house_hira', '平屋(R5)', '住宅')
def house_hira(): house(8.5, 6.5, 1, 'wood_dark', 'wood_dark', door_x=-2.2, balcony=False, seed=4, roof='gable', extension=(2.0, 3.2), himono=True, gegyo=True, solar=True)

@model('house_old', '古い木造の家(R6)', '住宅')
def house_old(): house(6.5, 6.0, 2, 'wood_grey', 'wood_grey', roof_mat='roof_tile_brown', door_x=1.4, seed=5, balcony=False, laundry=False, gegyo=True, himono=True, hood='roof_tile_brown', antenna=True)

@model('house_hipped', '寄棟の家(R7)', '住宅')
def house_hipped(): house(7.5, 7.5, 2, 'plaster_white', 'plaster_white', roof='hip', roof_mat='roof_tile_blue', door_x=-2.0, seed=6, lattice=False, laundry=19, planters=True, posts=False, hood='alu')

@model('house_hillside', '高台の家(R4・石垣付き)', '住宅')
def house_hillside():
    with xf((0, 1.5, 2.4)): house(7.0, 6.0, 2, 'wood_dark', 'plaster', door_x=-1.8, seed=7, laundry=9, solar=True)
    box('stone_wall', (9.0, 9.0, 2.4), (0, 1.5, 0)); box('stone_wall', (9.2, 0.4, 0.15), (0, -2.8, 2.4))
    for i in range(12):  # side stairs up to the door
        box('granite', (1.3, 0.3, 0.2 * (i + 1)), (-5.15, -2.6 + i * 0.3 + 0.15, 0))
    railing(-5.8, -5.8, 0, 2.4, 0.9)

# ================================================================= shops (商店街)
def sugidama(loc, r=0.35):
    """杉玉: cedar ball hung over a sake shop door."""
    rod('steel_dark', (loc[0], loc[1], loc[2] + r), (loc[0], loc[1], loc[2] + r + 0.4), 0.012, 4)
    ico('pine', r, loc, sub=2, jitter=0.12, seed=3)
    cards('pine_card', loc, r * 0.95, 10, 0.3, 5, face=1.0)

def taru(loc, r=0.28, h=0.55, mat='wood_light', label=None):
    """酒樽: sake barrel wrapped in straw with a printed label."""
    with xf(loc):
        cyl('straw', r, h, (0, 0, 0), 12, r2=r * 1.0)
        for zz in (0.08, h - 0.12): cyl('rope', r + 0.012, 0.04, (0, 0, zz), 12)
        cyl(mat, r * 0.92, 0.03, (0, 0, h), 12)
        if label: text3d('ink_red', label, r * 0.7, (0, -r - 0.01, h * 0.5), depth=0.006)

def shop(w, d, sign, sign_mat='sign_wood', ink='ink', awning='cloth_blue', noren_mat='cloth_navy', noren_text=None, goods='fish',
         upper='wood_dark', lower='wood', lanterns=None, vsign=None, roof_mat='roof_tile', seed=0, banner=None, corner=False, hira=False,
         side_clad=None, balcony_rail=True, roof_sign=None):
    """Two-storey (or 平屋) shop house: open ground-floor front under an awning or tiled pent roof, big kanban,
    lattice upper window with a wooden balcony rail, side walls with battens, windows and services."""
    rnd = random.Random(seed)
    T = 0.15; base = 0.25; h1, h2 = 3.0, 2.6
    box('concrete', (w + 0.1, d + 0.1, base), (0, 0, 0))
    box('wood_frame', (w + 0.12, d + 0.12, 0.06), (0, 0, base - 0.02))
    z1 = base
    open_w = w - 1.2
    fo = [(0.6, 0.6 + open_w, 0.0, 2.55)]
    L_side = d - 2 * T
    so = [(1.0, 1.0 + 2.6, 0.0, 2.55)] if corner else [(L_side - 2.0, L_side - 1.0, 0.9, 1.9)]
    ro = [(L_side - 3.2, L_side - 2.0, 1.0, 1.9)]
    bo = [(w - 1.8, w - 0.9, 0.0, 2.1), (1.0, 2.0, 1.2, 2.0)]
    frames = side_walls(w, d, z1, h1, T, lower, {'front': fo, 'left': so, 'right': ro, 'back': bo})
    if lower.startswith('wood'):
        for side, op in (('left', so), ('right', ro), ('back', bo)):
            with xf(*frames[side][:2]): battens(frames[side][2], h1, op, step=0.6)
    with xf(*frames['right'][:2]): window(*ro[0], T, 'alu', behind='lit', bars=True, hood='tin_blue')
    with xf(*frames['back'][:2]):
        door(*bo[0], T, 'wood'); window(*bo[1], T, 'alu', behind='dark', bars=True); vent_hood((3.0, 0, 2.4))
    if not corner:
        with xf(*frames['left'][:2]): window(*so[0], T, 'alu', behind='curtain', hood='tin_blue')
    # interior behind the open front: floor, back wall with shelves of goods, ceiling
    box2('concrete', -w / 2 + T, w / 2 - T, -d / 2 + T, d / 2 - T, z1 - 0.02, z1 + 0.01)
    box2('wood_dark', -w / 2 + T, w / 2 - T, -d / 2 + T, d / 2 - T, z1 + h1 - 0.12, z1 + h1 - 0.1)
    box2('plaster', -w / 2 + T, w / 2 - T, -d / 2 + 3.4, -d / 2 + 3.5, z1, z1 + h1)
    for zz in (0.5, 1.1, 1.7):
        box2('wood_light', -w / 2 + 0.4, w / 2 - 0.4, -d / 2 + 3.0, -d / 2 + 3.4, z1 + zz, z1 + zz + 0.04)
        x = -w / 2 + 0.5 if goods not in ('food', 'izakaya') else w  # restaurants: shelves hidden behind doors, leave them bare
        while x < w / 2 - 0.6:
            c = rnd.choice(['cloth_red', 'cloth_yellow', 'cloth_blue', 'white', 'cloth_green', 'orange', 'paper'])
            bw = rnd.uniform(0.12, 0.3); box2(c, x, x + bw, -d / 2 + 3.1, -d / 2 + 3.35, z1 + zz + 0.04, z1 + zz + 0.04 + rnd.uniform(0.15, 0.35)); x += bw + 0.03
    for x in (-w / 4, w / 4):  # ceiling lights
        box2('lamp', x - 0.5, x + 0.5, -d / 2 + 1.2, -d / 2 + 1.3, z1 + h1 - 0.18, z1 + h1 - 0.12)
    # counters / display stands at the front
    if goods == 'fish':
        for x in (-w / 4, w / 4):
            box('steel_dark', (w / 2 - 0.4, 0.9, 0.75), (x, -d / 2 + 0.2, z1))
            box('styro', (w / 2 - 0.5, 0.8, 0.12), (x, -d / 2 + 0.2, z1 + 0.75))
            box('white', (w / 2 - 0.6, 0.7, 0.03), (x, -d / 2 + 0.2, z1 + 0.86))  # crushed ice
            for k in range(5): ico(rnd.choice(['metal', 'hull', 'antifoul']), 0.08, (x - 0.8 + k * 0.4, -d / 2 + 0.2 + rnd.uniform(-0.2, 0.2), z1 + 0.93), (2.4, 0.8, 0.45), 1)
            for k in range(3): box('paper', (0.16, 0.02, 0.1), (x - 0.6 + k * 0.6, -d / 2 - 0.22, z1 + 0.78))  # price cards
        for k in range(3): box('styro', (0.6, 0.4, 0.3), (w / 2 - 0.5, -d / 2 - 0.5, k * 0.3))
        box('crate_blue', (0.6, 0.4, 0.3), (w / 2 - 1.2, -d / 2 - 0.5, 0))
    elif goods == 'veg':
        for x in (-w / 4, w / 4):
            prism('wood_light', [(-0.45, 0), (0.45, 0), (0.45, 0.5), (-0.45, 1.0)], w / 2 - 0.4, loc=(x, -d / 2 - 0.1, z1))
            for k in range(5):
                cx = x - 0.8 + k * 0.4; cz = z1 + 0.55 + (k % 2) * 0.15
                box('wood_light', (0.38, 0.3, 0.12), (cx, -d / 2 - 0.1, cz))  # 笊 basket
                ico(rnd.choice(['orange', 'cloth_green', 'yellow', 'flower_red', 'leaf_light']), 0.13, (cx, -d / 2 - 0.1, cz + 0.13), (1.2, 0.9, 0.6), 1)
            box('paper', (0.2, 0.02, 0.14), (x, -d / 2 - 0.56, z1 + 0.45))
    elif goods == 'souvenir':
        for x in (-w / 4, w / 4):
            box('wood_light', (w / 2 - 0.5, 0.8, 0.8), (x, -d / 2 + 0.3, z1))
            box('cloth_red', (w / 2 - 0.45, 0.85, 0.02), (x, -d / 2 + 0.3, z1 + 0.8))  # 毛氈
            for k in range(6): box(rnd.choice(['cloth_red', 'paper', 'cloth_blue', 'cloth_pink', 'cloth_yellow']), (0.22, 0.25, 0.12 + 0.08 * (k % 2)), (x - 0.7 + k * 0.28, -d / 2 + 0.3, z1 + 0.82))
    elif goods == 'izakaya':
        for k, x in enumerate((-w / 2 - 0.05, w / 2 + 0.05)):  # stacked sake barrels at both sides of the entrance
            with xf((x * 0.8, -d / 2 - 0.45, 0)):
                taru((-0.3, 0, 0), label='酒' if k else None); taru((0.3, 0, 0)); taru((0, 0, 0.55), label=None if k else '酒')
    elif goods == 'food':  # 食品サンプル display case beside the door
        with xf((-w / 2 + 1.25, -d / 2 - 0.35, 0)):
            box('wood_frame', (1.1, 0.5, 0.9), (0, 0, 0)); box('glass', (1.1, 0.5, 0.6), (0, 0, 0.9)); box('wood_frame', (1.14, 0.54, 0.05), (0, 0, 1.5))
            box('lamp', (1.0, 0.4, 0.02), (0, 0, 1.47))
            for k in range(3):
                cyl('white', 0.13, 0.06, (-0.35 + k * 0.35, 0, 0.92), 10, r2=0.16)
                ico(['orange', 'flower_red', 'yellow'][k], 0.1, (-0.35 + k * 0.35, 0, 1.0), (1.2, 1.2, 0.6), 1)
    elif goods == 'cafe':
        with xf((-w / 2 + 1.0, -d / 2 - 0.6, 0)):  # A-frame menu board
            for sy in (-1, 1): box('black', (0.5, 0.03, 0.8), (0, sy * 0.12, 0.08), (sy * 0.25, 0, 0))
            text3d('ink_white', '珈琲', 0.13, (0, -0.15, 0.62), depth=0.006)
        for x in (-w / 4, w / 4):  # cake/goods table
            box('wood_light', (w / 2 - 0.8, 0.7, 0.75), (x, -d / 2 + 0.6, z1))
    with xf(*frames['front'][:2]):
        for xx in (0.6, 0.6 + open_w):
            box2('wood_frame', xx - 0.1, xx + 0.1, -0.08, T + 0.05, 0, 2.62)
        box2('wood_frame', 0.45, 0.75 + open_w, -0.08, T, 2.55, 2.72)
        box2('steel_dark', 0.7, 0.5 + open_w, -0.32, -0.02, 2.36, 2.55)  # shutter box (シャッターボックス)
        for xx in (0.72, 0.48 + open_w): box2('steel_dark', xx - 0.03, xx + 0.03, -0.1, -0.02, 0, 2.36)  # shutter guide rails
        if noren_text and goods in ('food', 'izakaya'):  # restaurants: glass sliding doors and noren in the opening
            door(0.6 + open_w * 0.3, 0.6 + open_w * 0.7, 0, 2.3, T, casing=False)
            box2(lower, 0.6, 0.6 + open_w * 0.3, 0, T, 0, 2.36); box2(lower, 0.6 + open_w * 0.7, 0.6 + open_w, 0, T, 0, 2.36)
            window(0.8, 0.6 + open_w * 0.3 - 0.2, 0.9, 2.0, T, 'wood_frame', lattice='wood_frame', behind='lit', casing=False)
            window(0.6 + open_w * 0.7 + 0.2, 0.4 + open_w, 0.9, 2.0, T, 'wood_frame', lattice='wood_frame', behind='lit', casing=False)
            noren(0.6 + open_w * 0.32, 0.6 + open_w * 0.68, -0.12, 2.3, 0.85, noren_mat, noren_text)
        elif noren_text:
            noren(0.7, 0.5 + open_w, -0.36, 2.34, 0.5, noren_mat, noren_text)
        if goods == 'cafe':  # glazed shop front with a wooden door
            door(0.6 + open_w * 0.1, 0.6 + open_w * 0.32, 0, 2.3, T, 'slide_glass', casing=False)
            window(0.6 + open_w * 0.36, 0.6 + open_w - 0.1, 0.5, 2.3, T, 'wood_frame', behind='curtain', panes=3, casing=False, sill=True)
            box2('wood_frame', 0.6 + open_w * 0.32, 0.6 + open_w * 0.36, 0, T, 0, 2.36)
            box2(lower, 0.6 + open_w * 0.36, 0.6 + open_w, 0, T, 0, 0.5)
    if corner:
        with xf(*frames['left'][:2]):
            for xx in (1.0, 3.6): box2('wood_frame', xx - 0.08, xx + 0.08, -0.05, T + 0.05, 0, 2.6)
            box2('wood_frame', 0.9, 3.7, -0.06, T, 2.55, 2.7)
            window(1.0, 3.6, 0.6, 2.4, T, 'wood_frame', behind='curtain', panes=3, casing=False)
            box2(lower, 1.0, 3.6, 0, T, 0, 0.6)
            noren(1.2, 3.4, -0.3, 2.5, 0.3, awning or 'cloth_green', None, panels=6)
    # awning (cloth, sloped, with a scalloped valance) over the shop front
    zt = z1 + h1 - 0.05
    if awning:
        slab(awning, (-w / 2 + 0.2, -d / 2 - 1.5, zt - 0.75), (w / 2 - 0.2, -d / 2 - 1.5, zt - 0.75), (-w / 2 + 0.2, -d / 2, zt), (w / 2 - 0.2, -d / 2, zt), 0.02)
        n = round((w - 0.4) / 0.5)
        for i in range(n):
            x = -w / 2 + 0.2 + (w - 0.4) * (i + 0.5) / n
            prism(awning, [(-0.25, 0), (0.25, 0), (0, -0.22)], 0.02, loc=(x, -d / 2 - 1.5, zt - 0.75), axis='Y')
            if awning in ('cloth_red', 'cloth_blue', 'cloth_green') and i % 2 == 0:
                slab('cloth_white', (x - 0.12, -d / 2 - 1.49, zt - 0.74), (x + 0.12, -d / 2 - 1.49, zt - 0.74), (x - 0.12, -d / 2 + 0.01, zt + 0.01), (x + 0.12, -d / 2 + 0.01, zt + 0.01), 0.005)
        for x in (-w / 2 + 0.25, w / 2 - 0.25): rod('metal', (x, -d / 2, zt - 0.2), (x, -d / 2 - 1.5, zt - 0.75), 0.02, 6)
        rod('metal', (-w / 2 + 0.25, -d / 2 - 1.48, zt - 0.78), (w / 2 - 0.25, -d / 2 - 1.48, zt - 0.78), 0.025, 6)  # front bar
        box2('steel_dark', -w / 2 + 0.2, w / 2 - 0.2, -d / 2 - 0.12, -d / 2, zt - 0.05, zt + 0.12)  # roller box
    else:
        with xf((0, -d / 2, 0)): pent_roof(w + 0.2, 0.9, zt + 0.1)
    # upper floor
    ztop = z1 + h1
    box('wood_frame', (w + 0.06, d + 0.06, 0.2), (0, 0, ztop - 0.1))
    if not hira:
        uo = [(0.8, w - 0.8, 0.5, 2.0)]
        so2 = [(L_side / 2 - 0.5, L_side / 2 + 0.5, 0.9, 1.8)]
        bo2 = [(w / 2 - 0.7, w / 2 + 0.7, 0.9, 1.8)]
        sm = side_clad or upper
        frames2 = side_walls(w, d, ztop, h2, T, {'front': upper, 'back': upper, 'left': sm, 'right': sm},
                             {'front': uo, 'back': bo2, 'right': so2, 'left': so2})
        for side, op in (('left', so2), ('right', so2), ('back', bo2)):
            if (side_clad or upper).startswith('wood') or side == 'back' and upper.startswith('wood'):
                with xf(*frames2[side][:2]): battens(frames2[side][2], h2, op, step=0.6)
            elif not upper.startswith('tin') and side == 'back':
                with xf(*frames2[side][:2]): battens(frames2[side][2], h2, op, step=1.82, w=0.11, out=0.02)
        if not upper.startswith('wood'):  # exposed posts on the plaster front
            with xf(*frames2['front'][:2]):
                for xx in (0.35, w - 0.35): box2('wood_frame', xx - 0.06, xx + 0.06, -0.02, 0, 0, h2)
        with xf(*frames2['front'][:2]):
            window(0.8, w - 0.8, 0.5, 2.0, T, 'wood_frame', lattice='wood_frame', behind=rnd.choice(['shoji', 'lit', 'curtain']), panes=4)
            if balcony_rail:  # 手摺: wooden rail with balusters in front of the upper window
                box2('wood_frame', 0.5, w - 0.5, -0.5, 0.0, 0.3, 0.42)
                box2('wood_frame', 0.5, w - 0.5, -0.52, -0.42, 1.12, 1.2)
                for xx in frange(0.55, w - 0.5, 0.3): bar('wood_frame', xx - 0.025, xx + 0.025, -0.49, -0.45, 0.42, 1.12)
                for k in range(1 if goods in ('food', 'izakaya') else 2): flowerpot((1.2 + k * 1.6, -0.3, 0.42), 0.7, rnd.choice(['flower_red', 'hydrangea']), seed + 20 + k)
            else:
                box2('wood_frame', 0.5, w - 0.5, -0.5, 0.0, 0.35, 0.45)
        for side in ('left', 'right'):
            with xf(*frames2[side][:2]): window(*so2[0], T, 'alu', behind='curtain', hood='tin_blue' if seed % 2 else None, tobukuro=1)
        with xf(*frames2['back'][:2]): window(*bo2[0], T, 'alu', behind='dark')
        for x in (-w / 2, w / 2):
            for y in (-d / 2, d / 2): box('wood_frame', (0.15, 0.15, h1 + h2), (x, y, z1))
        ztop += h2
    # big sign on the fascia between the floors (on the awning top / pent roof)
    if hira:
        signboard(sign, w - 0.8, 0.9, (0, -d / 2 - 0.12, ztop + 1.0), board=sign_mat, ink=ink)
        for x in (-w / 2 + 0.6, w / 2 - 0.6): box2('wood_frame', x - 0.05, x + 0.05, -d / 2 - 0.1, -d / 2 + 0.2, ztop - 0.1, ztop + 1.05)
        lz, ly, sw = ztop + 1.05, -d / 2 - 0.2, w - 0.8
    else:
        sw = min(w - 0.6, max(2.4, len(sign) * 0.95))
        signboard(sign, sw, 0.95, (0, -d / 2 - 0.25, z1 + h1 + 0.95), board=sign_mat, ink=ink)
        lz, ly = z1 + h1 + 1.0, -d / 2 - 0.3
    for x in (-sw / 3, sw / 3):  # gooseneck lamps over the kanban
        rod('steel_dark', (x, ly + 0.05, lz + 0.05), (x, ly - 0.45, lz + 0.22), 0.018, 4)
        cyl('steel_dark', 0.12, 0.1, (x, ly - 0.48, lz + 0.14), 8, r2=0.04); cyl('lamp', 0.08, 0.02, (x, ly - 0.48, lz + 0.13), 8)
    rise = d / 2 * 0.5
    gable_fill(upper, w - 0.02, d, rise, ztop)
    gable_roof(w, d, rise, ztop, roof_mat)
    zg = ztop - 0.6 * rise / (d / 2) - 0.2
    for sg in (-1, 1): gutter(-w / 2 - 0.3, w / 2 + 0.3, sg * (d / 2 + 0.62), zg)
    rod('alu', (-w / 2 - 0.15, -d / 2 - 0.6, zg - 0.05), (-w / 2 - 0.15, -d / 2 - 0.3, zg - 0.4), 0.045, 6)
    downpipe(-w / 2 - 0.15, -d / 2 - 0.3, zg - 0.3)
    rod('alu', (w / 2 + 0.15, d / 2 + 0.6, zg - 0.05), (w / 2 + 0.15, d / 2 + 0.3, zg - 0.4), 0.045, 6)
    downpipe(w / 2 + 0.15, d / 2 + 0.3, zg - 0.3)
    if roof_sign:  # rooftop billboard on a steel frame
        with xf((0, -d / 4, ztop + rise * 0.5)):
            for x in (-1.2, 1.2): rod('steel_dark', (x, 0.3, -0.3), (x, 0.3, 1.3), 0.04, 4); rod('steel_dark', (x, 0.3, 0.2), (x, 1.2, -0.3 + rise * 0.0), 0.03, 4)
            signboard(roof_sign, 3.0, 0.9, (0, 0.25, 1.55), board='white', ink='ink_red', frame='steel_dark')
    if lanterns:
        for x in (-w / 2 + 0.45, w / 2 - 0.45): chochin((x, -d / 2 - 0.5, z1 + 1.85), 0.2, 0.55, 'lantern_red', lanterns)
    if vsign:  # vertical stand sign / projecting sign
        with xf((w / 2 - 0.1, -d / 2 - 0.35, 0)):
            rod('steel_dark', (0, 0, z1 + 2.9), (0, -0.6, z1 + 2.9), 0.02, 4)
            signboard(vsign, 0.5, 0.36 * len(vsign) + 0.3, (0, -0.35, z1 + 4.6 + (0 if hira else 0.5)), board='sign_wood', vertical=True, rz=math.pi / 2)
    if goods == 'veg' and hira:  # sake shop: cedar ball and beer crates
        sugidama((-w / 2 + 1.0, -d / 2 - 0.55, z1 + 2.2))
        for k in range(3): box('crate_blue' if k != 1 else 'cloth_yellow', (0.45, 0.35, 0.3), (-w / 2 + 0.35, -d / 2 - 0.4 - 0.0, k * 0.3))
    if banner:  # のぼり旗
        for k, x in enumerate((-w / 2 - 0.4, w / 2 + 0.4)):
            rod('metal', (x, -d / 2 - 1.2, 0), (x, -d / 2 - 1.2, 3.3), 0.02, 6)
            rod('metal', (x, -d / 2 - 1.2, 3.25), (x + (0.5 if k == 0 else -0.5), -d / 2 - 1.2, 3.25), 0.012, 4)
            a, b = (x, x + 0.5) if k == 0 else (x - 0.5, x)
            box2('cloth_red' if banner[1] == 'r' else 'cloth_blue', a, b, -d / 2 - 1.21, -d / 2 - 1.19, 1.2, 3.25)
            text3d('ink_white', banner[0], 0.32, ((a + b) / 2, -d / 2 - 1.23, 2.2), depth=0.008, vertical=True)
            cyl('concrete', 0.18, 0.12, (x, -d / 2 - 1.2, 0), 8)
    ac_unit((w / 2 + 0.25, d / 4, z1 + 2.2), math.pi / 2)
    box2('white', w / 2 + 0.02, w / 2 + 0.1, d / 4 - 0.05, d / 4 + 0.05, z1 + 2.6, z1 + 3.4)
    meter_box((w / 2 + 0.08, d / 4 + 1.0, 1.2), math.pi / 2)
    cyl('metal', 0.18, 1.2, (w / 2 + 0.3, d / 2 - 0.6, 0), 12); cyl('steel_dark', 0.06, 0.12, (w / 2 + 0.3, d / 2 - 0.6, 1.2), 8)  # propane
    with xf((-w / 2 - 0.35, d / 2 - 1.2, 0)):  # dustbin with a lid by the side
        cyl('cloth_blue', 0.25, 0.65, (0, 0, 0), 10, r2=0.28); cyl('cloth_blue', 0.3, 0.06, (0, 0, 0.65), 10)
    if goods not in ('fish', 'izakaya'): box('crate_blue', (0.55, 0.38, 0.3), (w / 2 - 0.3, -d / 2 - 0.4, 0))
    for k in range(rnd.randint(1, 3)):
        flowerpot((-w / 2 + 0.3 + k * 0.42, -d / 2 - 0.25, 0), 1.0, rnd.choice(['flower_red', 'hydrangea', None]), seed + k)

@model('shop_general', '雑貨店 まるはち(S1)', '商店')
def shop_general(): shop(7.0, 9.0, 'まるはち', awning='cloth_blue', noren_text=None, goods='veg', upper='wood_dark', vsign='日用品', seed=11, banner=('大売出し', 'r'), side_clad='tin_blue')

@model('shop_restaurant', '海鮮食堂(S2)', '商店')
def shop_restaurant(): shop(7.5, 9.0, '海鮮食堂', awning=None, noren_mat='cloth_navy', noren_text='食事処', goods='food', upper='plaster', lanterns='海', vsign='海鮮丼', seed=12, banner=('定食', 'b'))

@model('shop_izakaya', '居酒屋 やまもと(S3)', '商店')
def shop_izakaya(): shop(6.5, 9.0, 'やまもと', awning='cloth_red', noren_mat='cloth_red', noren_text='居酒屋', goods='izakaya', upper='wood_dark', lanterns='酒', seed=13)

@model('shop_souvenir', 'お土産 海の幸(S4)', '商店')
def shop_souvenir(): shop(7.0, 9.0, '海の幸', sign_mat='sign_wood', awning='cloth_red', noren_text='お土産', noren_mat='cloth_blue', goods='souvenir', upper='plaster_cream', vsign='みやげ', seed=14, banner=('名物', 'r'))

@model('shop_fish', '鮮魚店(S5)', '商店')
def shop_fish(): shop(8.0, 9.0, '鮮魚 丸八', awning='cloth_blue', noren_text='鮮魚', noren_mat='cloth_blue', goods='fish', upper='wood_dark', vsign='直売', seed=15, side_clad='tin_rust', roof_sign='マルハチ')

@model('shop_cafe', '喫茶 しおかぜ(S6・角の店)', '商店')
def shop_cafe(): shop(7.0, 9.0, '喫茶しおかぜ', sign_mat='sign_wood', awning='cloth_green', noren_text=None, goods='cafe', upper='plaster_white', seed=16, corner=True, lanterns=None)

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
                wall('tin_blue', D, H - 3.6, 0.15, [(D / 2 - 2, D / 2 + 2, 0.6, 2.0)])
                window(D / 2 - 2, D / 2 + 2, 0.6, 2.0, 0.15, 'wood_frame', behind=None, bars=True, sill=False)
        prism('tin_blue', [(-D / 2, H + 0.1), (D / 2, H + 0.1), (0, H + 0.1 + D / 2 * 0.36)], 0.15, loc=(sx * (W / 2 - 0.075), 0, 0))
        for y in frange(-D / 2 + 1.0, D / 2 - 0.9, 2.0):  # steel girts / posts over the tin
            box2('steel_dark', sx * (W / 2 + 0.02) - 0.06, sx * (W / 2 + 0.02) + 0.06, y - 0.07, y + 0.07, 3.72, H + 0.1 + D / 2 * 0.36 * (1 - abs(y) / (D / 2)) - 0.1)
        box2('steel_dark', sx * (W / 2 + 0.03) - 0.06, sx * (W / 2 + 0.03) + 0.06, -D / 2, D / 2, 3.62, 3.78)
        with xf((sx * (W / 2 + 0.1), 0, 3.35), math.pi / 2 * sx): signboard('海凪漁港', 4.2, 0.55, (0, 0, 0), board='white', ink='navy', frame='steel_dark', depth=0.05)
    # vertical banners 新鮮な魚 / 海産物 / 鮮魚 on the front columns
    for x, txt, m in ((-W / 2 + bay * 1, '新鮮な魚', 'cloth_navy'), (W / 2 - bay * 1, '海産物', 'cloth_navy'), (-W / 2 + bay * 2, '鮮魚', 'cloth_white'), (W / 2 - bay * 2, '直売', 'cloth_white')):
        box2(m, x - 0.45, x + 0.45, -D / 2 - 0.22, -D / 2 - 0.18, 1.6, H - 1.5)
        text3d('ink_white' if m == 'cloth_navy' else 'ink', txt, 0.62 if len(txt) < 4 else 0.58, (x, -D / 2 - 0.24, (1.6 + H - 1.5) / 2), depth=0.01, vertical=True)
    # 越屋根: raised ventilation monitor with louvres running along the ridge
    mz = zr - 0.2; ML = W - 6.0
    for sg in (-1, 1):
        for k in range(2): box2('steel_dark', -ML / 2, ML / 2, sg * 1.25 - 0.03, sg * 1.25 + 0.03, mz + 0.3 + k * 0.17, mz + 0.4 + k * 0.17)
    for x in frange(-ML / 2, ML / 2, ML / 8): box2('steel_dark', x - 0.06, x + 0.06, -1.3, 1.3, mz - 0.3, mz + 0.7)
    for sx in (-1, 1): prism('tin_blue', [(-1.3, mz + 0.68), (1.3, mz + 0.68), (0, mz + 0.95)], 0.08, loc=(sx * ML / 2, 0, 0))
    gable_roof(ML, 2.5, 0.27, mz + 0.68, 'tin_rust', over_e=0.45, over_g=0.3, rafters=False, wave=0.0, barge='steel_dark', fascia='steel_dark', ridge=False)
    # clock on the front band
    with xf((-W / 2 + bay * 0.5, -D / 2 - 0.25, H - 0.7)):
        cyl('white', 0.55, 0.08, (0, 0, 0), 20, rot=(math.pi / 2, 0, 0)); torus('steel_dark', 0.55, 0.05, (0, -0.05, 0), (math.pi / 2, 0, 0), 20, 6)
        box('black', (0.04, 0.02, 0.38), (0, -0.1, 0), (0, 0.6, 0)); box('black', (0.05, 0.02, 0.26), (0, -0.11, 0), (0, -2.0, 0))
    # floor markings of the auction lanes (セリ場), crates, styrofoam boxes and pallets
    for y in (-4.6, -1.6):
        box2('yellow', -W / 2 + 1.0, W / 2 - 1.0, y - 0.05, y + 0.05, 0.12, 0.125)
    for x in frange(-W / 2 + 1.0, W / 2 - 1.0, 2.5): box2('yellow', x - 0.05, x + 0.05, -4.6, -1.6, 0.12, 0.125)
    rnd = random.Random(31)
    for (x, y) in ((-12.5, -3.1), (-7.5, -3.1), (-2.5, -3.1), (5.0, -3.1), (10.0, -3.1), (-13.5, 5.5), (12.5, 5.5)):
        box('wood_light', (1.2, 1.0, 0.14), (x, y, 0.12))  # pallet
        for i in range(2):
            for j in range(2):
                hgt = rnd.randint(1, 3)
                for k in range(hgt): box(rnd.choice(['crate_blue', 'styro', 'crate_blue']), (0.58, 0.46, 0.28), (x - 0.29 + i * 0.58, y - 0.23 + j * 0.46, 0.26 + k * 0.28))
    for x in (-9, -3, 3, 9):  # fish laid out on the sorting tables
        for k in range(6): ico(rnd.choice(['metal', 'hull', 'antifoul']), 0.1, (x - 1.5 + k * 0.6, 1.0 + rnd.uniform(-0.3, 0.3), 1.0), (2.6, 0.8, 0.45), 1)
    with xf((W / 2 - 1.0, D / 2 - 1.0, 0.12)):  # hose reel and a water tap
        torus('tarp_blue', 0.35, 0.04, (0, 0, 0.6), (math.pi / 2, 0, 0), 14, 5); box('steel_dark', (0.1, 0.4, 1.0), (0, 0.2, 0))
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
    fr = side_walls(w, d, 0.25, 3.4, T, 'wood_grey', {'front': [(1.0, 5.0, 0, 3.0), (6.5, 7.6, 0, 2.1), (8.4, 10.2, 1.0, 2.2)], 'right': [(3.0, 5.0, 1.0, 2.2)], 'back': [(3.0, 4.6, 1.0, 2.0)]})
    with xf(*fr['back'][:2]): window(3.0, 4.6, 1.0, 2.0, T, 'alu', behind='dark', bars=True, casing=False)
    with xf(*fr['front'][:2]):
        door(1.0, 5.0, 0, 3.0, T, 'shutter'); door(6.5, 7.6, 0, 2.1, T, 'wood'); window(8.4, 10.2, 1.0, 2.2, T, 'alu', behind='curtain')
    with xf(*fr['right'][:2]): window(3.0, 5.0, 1.0, 2.2, T, 'alu', behind='dark')
    fr2 = side_walls(w, d, 3.65, 2.8, T, 'wood_grey', {'front': [(1.2, 3.4, 0.8, 2.1), (4.4, 6.6, 0.8, 2.1), (7.6, 9.8, 0.8, 2.1)], 'back': [(6.0, 8.0, 0.9, 2.0)]})
    with xf(*fr2['back'][:2]): window(6.0, 8.0, 0.9, 2.0, T, 'alu', behind='curtain', casing=False)
    with xf(*fr2['front'][:2]):
        for x in (1.2, 4.4, 7.6): window(x, x + 2.2, 0.8, 2.1, T, 'alu', behind='dark', bars=True)
    box('wood_frame', (w + 0.05, d + 0.05, 0.2), (0, 0, 3.55))
    gable_fill('wood_grey', w, d, 2.0, 6.45)
    gable_roof(w, d, 2.0, 6.45, 'roof_tile', over_e=0.7)
    signboard('第一水産', 6.0, 1.3, (0, -d / 2 - 0.12, 3.65 + 1.0), board='sign_wood')
    with xf((0, -d / 2, 0)): pent_roof(w + 0.2, 1.1, 3.55, 'tin_blue', wave=0.0)
    gutter(-w / 2 - 0.3, w / 2 + 0.3, -d / 2 - 0.62, 6.0); downpipe(w / 2 + 0.2, -d / 2 - 0.55, 6.0)
    ac_unit((w / 2 + 0.25, 2, 0.5), math.pi / 2); ac_unit((w / 2 + 0.25, 3, 0.5), math.pi / 2)
    fo1 = [(1.0, 5.0, 0, 3.0), (6.5, 7.6, 0, 2.1), (8.4, 10.2, 1.0, 2.2)]; fo2 = [(1.2, 3.4, 0.8, 2.1), (4.4, 6.6, 0.8, 2.1), (7.6, 9.8, 0.8, 2.1)]
    with xf(*fr['front'][:2]): battens(w, 3.4, fo1, step=0.6)
    with xf(*fr2['front'][:2]):
        battens(w, 2.8, fo2, step=0.6)
        for x in (1.2, 4.4, 7.6): slab('tin_blue', (x - 0.15, -0.5, 2.25), (x + 2.35, -0.5, 2.25), (x - 0.15, 0, 2.45), (x + 2.35, 0, 2.45), 0.03)
    for side in ('left', 'back', 'right'):
        with xf(*fr[side][:2]): battens(fr[side][2], 3.4, {'right': [(3.0, 5.0, 1.0, 2.2)], 'back': [(3.0, 4.6, 1.0, 2.0)]}.get(side, ()), step=0.6)
        with xf(*fr2[side][:2]): battens(fr2[side][2], 2.8, [(6.0, 8.0, 0.9, 2.0)] if side == 'back' else (), step=0.6)
    with xf((-w / 2, 0, 0), -math.pi / 2):  # steel outside stair up to the office door on the 1st floor (left side)
        L0 = -3.6
        for i in range(14):
            box2('steel_dark', L0 + i * 0.26, L0 + i * 0.26 + 0.28, -0.85, -0.15, 0.25 + i * 0.235, 0.25 + i * 0.235 + 0.04)
        for yy in (-0.88, -0.12): rod('steel_dark', (L0, yy, 0.25), (L0 + 14 * 0.26, yy, 0.25 + 14 * 0.235), 0.05, 4)
        box2('steel_dark', L0 + 3.64, L0 + 5.4, -0.9, 0.0, 3.5, 3.65)  # landing
        for x in (L0 + 3.7, L0 + 5.35): box2('steel_dark', x - 0.04, x + 0.04, -0.9, -0.82, 0.25, 3.5)
        for i in range(0, 15, 2): rod('alu', (L0 + i * 0.26, -0.88, 0.25 + i * 0.235), (L0 + i * 0.26, -0.88, 1.15 + i * 0.235), 0.015, 4)
        rod('alu', (L0, -0.88, 1.15), (L0 + 14 * 0.26, -0.88, 1.15 + 14 * 0.235), 0.025, 6)
        railing(L0 + 3.64, L0 + 5.4, -0.88, 3.65, 0.95, 'alu', 0.2)
        box2('steel_dark', 0.5, 1.45, -0.05, 0.0, 3.65, 5.7); box2('alu', 1.3, 1.38, -0.09, -0.05, 4.6, 4.66)  # office door
        box2('steel_dark', 0.4, 1.55, -0.07, 0.0, 5.7, 5.8)
        box2('lamp', 1.6, 1.75, -0.1, 0.0, 5.3, 5.45)
    # sign lamps, drums, crates, company flag pole
    for x in (-2.0, 2.0):
        rod('steel_dark', (x, -d / 2 - 0.15, 6.0), (x, -d / 2 - 0.7, 6.15), 0.02, 4)
        cyl('steel_dark', 0.13, 0.1, (x, -d / 2 - 0.72, 6.05), 8, r2=0.04); cyl('lamp', 0.09, 0.02, (x, -d / 2 - 0.72, 6.04), 8)
    for k, (x, y) in enumerate(((w / 2 - 0.6, -d / 2 - 0.6), (w / 2 - 1.3, -d / 2 - 0.6))):
        cyl('blue' if k else 'rust', 0.29, 0.88, (x, y, 0), 12); torus('steel_dark', 0.29, 0.02, (x, y, 0.3), seg=12, rseg=4)
    for k in range(3): box('crate_blue', (0.6, 0.42, 0.3), (-w / 2 + 2.6, -d / 2 - 0.5, k * 0.3))
    box('styro', (0.7, 0.45, 0.35), (-w / 2 + 3.4, -d / 2 - 0.5, 0)); box('styro', (0.7, 0.45, 0.35), (-w / 2 + 3.4, -d / 2 - 0.5, 0.35))
    box('wood_light', (1.2, 1.0, 0.14), (2.0, -d / 2 - 0.75, 0))

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
    if sign: signboard(sign, 3.6, 0.8, (-w / 4 - 0.8, -d / 2 - 0.16, 3.4), board='white', ink='navy', frame='wood_frame')
    if lean:  # lean-to on the right with tin roof, open front
        lw = 3.5
        with xf((w / 2 + lw / 2, 0, 0)):
            box('concrete', (lw, d, 0.15), (0, 0, 0))
            for y in (-d / 2 + 0.2, 0, d / 2 - 0.2): box('wood_frame', (0.15, 0.15, 3.0), (lw / 2 - 0.1, y, 0.15))
            box2('wood', lw / 2 - 0.15, lw / 2, -d / 2, d / 2, 0.15, 1.2)
            slab('tin_rust', (lw / 2 + 0.3, -d / 2 - 0.3, 3.1), (lw / 2 + 0.3, d / 2 + 0.3, 3.1), (-lw / 2, -d / 2 - 0.3, 3.9), (-lw / 2, d / 2 + 0.3, 3.9), 0.04)
            for k in range(3): box('crate_blue', (0.6, 0.4, 0.3), (0, -d / 2 + 1 + k * 0.7, 0.15 + 0)); box('crate_blue', (0.6, 0.4, 0.3), (0, -d / 2 + 1 + k * 0.7, 0.45))
    gutter(-w / 2 - 0.3, w / 2 + 0.3, -d / 2 - 0.6, 0.2 + h - 0.5)
    zr = 0.2 + h + rise
    if clad.startswith('wood'):  # battens and a tarred lower band (腰板) on the board walls, back gutter, sign lamps, ridge vents
        fo_ = [(w / 2 - 2.4, w / 2 + 2.4, 0, 4.2), (w - 2.2, w - 1.0, 0, 2.1)]
        ops = {'front': fo_, 'right': [(1.5, 3.3, 2.2, 3.2), (d - 4, d - 2.2, 2.2, 3.2)], 'left': [(1.5, 3.3, 2.2, 3.2)], 'back': [(w / 2 - 1.5, w / 2 + 1.5, 0, 3.4)]}
        for side in ('front', 'right', 'back', 'left'):
            if lean and side == 'right': continue
            with xf(*fr[side][:2]):
                battens(fr[side][2], h, ops[side], step=0.6)
                for (a, b) in [(0, ops[side][0][0])] + [(ops[side][i][1], ops[side][i + 1][0] if i + 1 < len(ops[side]) else fr[side][2]) for i in range(len(ops[side]))]:
                    if b - a > 0.2: box2('wood_dark', a, b, -0.05, 0, 0, 0.9)
        gutter(-w / 2 - 0.3, w / 2 + 0.3, d / 2 + 0.6, 0.2 + h - 0.5)
        for x in (-1.6, 1.6):
            rod('steel_dark', (x, -d / 2 - 0.15, 0.2 + h - 0.3), (x, -d / 2 - 0.65, 0.2 + h - 0.15), 0.02, 4)
            cyl('steel_dark', 0.13, 0.1, (x, -d / 2 - 0.68, 0.2 + h - 0.25), 8, r2=0.04); cyl('lamp', 0.09, 0.02, (x, -d / 2 - 0.68, 0.2 + h - 0.26), 8)
        for x in (-w / 4, w / 4):  # 換気塔: small louvred ridge vents
            box('wood_frame', (0.9, 0.9, 0.55), (x, 0, zr - 0.05))
            for k in range(3): box('wood_dark', (0.96, 0.96, 0.05), (x, 0, zr + 0.05 + k * 0.15))
            hip_roof(0.9, 0.9, 0.35, zr + 0.5, 'tin_rust', over=0.2, t=0.04, wave=0.0, fascia=None, eave_tiles=False, rafters=False)
        with xf((w / 2 + 0.05, -1.5, 0)):  # fishing gear hung on the lean-to post: floats and a net
            for k in range(4): ico('float_orange' if k % 2 else 'float_yellow', 0.16, (1.2, 0.3 * k, 1.8 - 0.1 * k), sub=1)
        for k in range(2): box2('rope', -w / 2 - 0.4 + 0, -w / 2 - 0.05, -d / 2 + 1 + k * 0.5, -d / 2 + 1.4 + k * 0.5, 0.2, 0.2 + 0.25 * (k + 1))
    else:  # tin shed: corner flashings, turbine ventilators, a painted number and a lamp
        for sx in (-1, 1):
            for sy in (-1, 1): box('alu', (0.12, 0.12, h), (sx * (w / 2 + 0.02), sy * (d / 2 + 0.02), 0.2))
        for x in (-w / 4, w / 4):
            cyl('alu', 0.12, 0.25, (x, 0, zr + 0.2), 8); cyl('alu', 0.3, 0.35, (x, 0, zr + 0.45), 10, r2=0.2); ico('alu', 0.2, (x, 0, zr + 0.8), (1, 1, 0.6), 1)
        text3d('ink_white', 'No.2', 0.9, (-w / 4 - 0.6, -d / 2 - 0.03, 0.2 + h - 0.9), depth=0.01)
        box('steel_dark', (0.25, 0.3, 0.2), (w / 2 - 2.6, -d / 2 - 0.15, 2.5)); box('lamp', (0.2, 0.05, 0.1), (w / 2 - 2.6, -d / 2 - 0.3, 2.52))
        downpipe(w / 2 + 0.2, -d / 2 - 0.55, 0.2 + h - 0.5); downpipe(-w / 2 - 0.2, -d / 2 - 0.55, 0.2 + h - 0.5)
        for x in (-w / 2 + 0.5, -w / 2 + 1.1): cyl('rust', 0.29, 0.88, (x, -d / 2 - 0.5, 0), 10)

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
    # battens on the board walls (outside), purlins under the tin roof, a tarp lashed over gear, buoys hung on the back wall
    with xf((w / 2, d / 2, 0.15), math.pi): battens(w, 2.75, (), step=0.6)
    for sx in (-1, 1):
        with xf((sx * w / 2, -sx * d / 2, 0.15), sx * math.pi / 2): battens(d, 2.35, (), step=0.6)
    for k in range(4):
        t = (k + 0.5) / 4; y = -d / 2 - 0.5 + t * (d + 0.7); z = 2.5 + t * 0.6 - 0.12
        box2('wood_frame', -w / 2 - 0.2, w / 2 + 0.2, y - 0.05, y + 0.05, z - 0.12, z)
    for x in (-2.6, 2.6): box('steel_dark', (0.06, 0.06, 0.06), (x, -d / 2 + 0.05, 2.36))
    ico('tarp_blue', 0.7, (-0.2, 0.9, 0.15), (1.4, 1.0, 0.9), 2, 0.25, 7, flat_bottom=0.0)
    for k in range(5): ico(['float_orange', 'float_yellow', 'float_white'][k % 3], 0.17, (-3.0 + k * 0.6, d / 2 - 0.35, 1.9 + 0.1 * (k % 2)), sub=1)
    rod('rope', (-3.2, d / 2 - 0.2, 2.2), (-0.4, d / 2 - 0.2, 2.2), 0.015, 4)
    torus('rubber', 0.32, 0.12, (w / 2 + 0.05, 0.6, 1.2), (0, math.pi / 2, 0), 12, 6)  # old tyre fender hung on the side
    signboard('漁具', 1.3, 0.45, (-w / 2 + 1.2, -d / 2 + 0.0, 2.35), board='sign_wood', depth=0.05)
    box('steel_dark', (0.2, 0.2, 0.15), (1.5, -d / 2 + 0.15, 2.25)); box('lamp', (0.14, 0.14, 0.03), (1.5, -d / 2 + 0.15, 2.23))

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
        box('concrete', (4.36, 3.56, 0.3), (0, 0, 0.0))  # plinth
        for sx in (-1, 1):  # parapet coping
            box('alu', (0.06, 3.5, 0.06), (sx * 2.12, 0, 3.0))
        box('alu', (4.3, 0.06, 0.06), (0, -1.72, 3.0)); box('alu', (4.3, 0.06, 0.06), (0, 1.72, 3.0))
        with xf((-0.5 + 0.0, -1.6, 0)):  # porch hood over the door, lamp and the name plaque
            box('plaster_white', (1.5, 0.8, 0.12), (0.5 - 0.0, -0.4, 2.45)); box('lamp', (0.14, 0.06, 0.18), (1.35, -0.05, 2.05))
        signboard('灯台', 0.4, 0.8, (-0.8, -1.62, 2.2), board='granite', ink='ink', frame='granite', vertical=True, depth=0.05)
        tv_antenna((1.2, 0.8, 3.0), 2.4, 0.0)  # radio aerial
    cyl('plaster_white', 3.0, 0.6, (0, 0, 0), 32)
    cyl('granite', 3.15, 0.25, (0, 0, 0), 24)  # stone plinth ring
    for k in range(3):  # tower windows with frames
        z = 4.0 + k * 3.6; t = (z - 0.6) / 13.0; r = 2.3 - 0.85 * t
        a = math.pi * 0.25 + k * math.pi * 0.55
        with xf((r * math.cos(a), r * math.sin(a), z), a + math.pi / 2):
            box('steel_dark', (0.45, 0.12, 0.8), (0, 0, 0)); box('glass', (0.33, 0.14, 0.66), (0, 0, 0.07))
            box('plaster_white', (0.6, 0.25, 0.08), (0, -0.04, 0.82)); box('plaster_white', (0.55, 0.22, 0.06), (0, -0.04, -0.06))
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
    for zz in (zg + 1.25, zg + 2.1, zg + 2.95): torus('steel_dark', 1.1, 0.03, (0, 0, zz), seg=20, rseg=4)  # glazing bars
    for k in range(10):  # diagonal astragals (helical lantern glazing)
        a0, a1 = k / 10 * math.tau, (k + 1) / 10 * math.tau
        rod('steel_dark', (1.1 * math.cos(a0), 1.1 * math.sin(a0), zg + 1.25), (1.1 * math.cos(a1), 1.1 * math.sin(a1), zg + 2.95), 0.015, 4)
    with xf((0, -1.22, zg + 0.35)): box('steel_dark', (0.5, 0.06, 0.85), (0, 0, 0))  # hatch to the gallery
    cyl('steel_dark', 2.25, 0.08, (0, 0, zg + 0.35), 24)
    cyl('steel_dark', 1.3, 0.12, (0, 0, zg + 3.0), 24)
    cyl('steel_dark', 1.3, 1.0, (0, 0, zg + 3.1), 24, r2=0.25)
    cyl('steel_dark', 0.25, 0.25, (0, 0, zg + 4.1), 12, r2=0.15); ico('steel_dark', 0.18, (0, 0, zg + 4.45), sub=1)
    rod('steel_dark', (0, 0, zg + 4.5), (0, 0, zg + 5.3), 0.03, 4)
    rod('steel_dark', (0, 0, zg + 5.0), (0.5, 0, zg + 5.0), 0.015, 3); prism('steel_dark', [(-0.12, zg + 4.9), (0.12, zg + 4.9), (0, zg + 5.15)], 0.02, loc=(0.5, 0, 0))  # vane
    for k in range(4): rod('steel_dark', (0.6 * math.cos(k * math.pi / 2), 0.6 * math.sin(k * math.pi / 2), zg + 3.6), (0, 0, zg + 4.12), 0.02, 3)  # dome ribs
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
    cyl('concrete', 1.85, 0.15, (0, 0, 0), 24)  # step ring
    box2('steel_dark', -0.45, 0.45, -1.24, -1.12, 2.4, 2.5); box2('steel_dark', -0.45, -0.36, -1.24, -1.12, 0.6, 2.4); box2('steel_dark', 0.36, 0.45, -1.24, -1.12, 0.6, 2.4)
    box2('red', -0.6, 0.6, -1.45, -1.0, 2.55, 2.65)  # door hood
    box2('alu', 0.15, 0.25, -1.27, -1.22, 1.4, 1.5)  # handle
    for sx in (-1, 1): rod('steel_dark', (sx * 0.2, 1.2, 0.6), (sx * 0.2, 0.95, 6.45), 0.02, 4)  # service ladder on the back
    for k in range(19):
        t = (k + 0.5) / 19; y = 1.2 - 0.25 * t; z = 0.6 + t * 5.85
        rod('steel_dark', (-0.2, y, z), (0.2, y, z), 0.012, 4)
    for k in range(8):  # brackets under the gallery
        a = k / 8 * math.tau
        rod('red', (0.88 * math.cos(a), 0.88 * math.sin(a), 5.9), (1.2 * math.cos(a), 1.2 * math.sin(a), 6.38), 0.04, 4)
    for k in range(6):  # lantern glazing bars
        a = k / 6 * math.tau + 0.3
        rod('red', (0.51 * math.cos(a), 0.51 * math.sin(a), 7.0), (0.51 * math.cos(a), 0.51 * math.sin(a), 7.9), 0.025, 4)
    rod('steel_dark', (0, 0, 8.6), (0.35, 0, 8.6), 0.012, 3); prism('steel_dark', [(-0.1, 8.52), (0.1, 8.52), (0, 8.72)], 0.02, loc=(0.35, 0, 0))
    cyl('steel_dark', 0.15, 0.4, (0, 0, 8.2 - 0.0), 8, r2=0.08)

def kasagi(w, z, mat, curve=0.25, th=0.32, depth=0.42):
    """Torii top beam with upturned ends (反り)."""
    rings = []
    N = 20
    for i in range(N + 1):
        t = i / N * 2 - 1; x = t * w / 2; zz = z + curve * abs(t) ** 2.6  # straight middle, ends sweeping up (反り)
        e = abs(t) ** 6 * th * 0.25 * (1 if t > 0 else -1)  # slanted end cut (木口), top reaching further out
        g = 1 + 0.12 * abs(t) ** 4  # slight swelling towards the tips
        rings.append([(x - e * 0.3, -depth / 2 * g, zz), (x - e * 0.3, depth / 2 * g, zz), (x + e, depth / 2 * 0.85 * g, zz + th * g), (x + e, -depth / 2 * 0.85 * g, zz + th * g)])
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
    for sx in (-1, 1):
        cyl('vermilion', 0.3, 0.14, (sx * 1.75, 0, H - 0.08), 16)  # 台輪 under the shimaki
        box('black', (0.1, 0.3, 0.22), (sx * 2.1, 0, H - 0.72))   # 楔 wedges at the nuki ends
        box('vermilion', (0.09, 0.27, 0.28), (sx * 2.33, 0, H - 0.75))
        cyl('granite', 0.34, 0.12, (sx * 1.75, 0, 0), 12)          # 亀腹 stone footing
    box('black', (0.36, 0.26, 0.06), (0, 0, H - 0.47))

def irimoya_roof(w, d, z, over=1.2, H=2.45, ug=0.5, mat='copper', t=0.16, lift=0.3, edge='wood_frame', Nx=12, Nu=8, seams=(10, 5)):
    """入母屋 roof with a concave (照り) profile and upturned corners: hipped lower part, gable on top.
    z = eave height. Returns (ridge z, gable x, profile function)."""
    hw, hd = w / 2 + over, d / 2 + over
    gx = hw - hd * ug
    prof = lambda u: z + H * (0.5 * u + 0.5 * u * u)
    def grid(pt, nu, ns):
        v, f = [], []
        for top in (0, 1):
            for i in range(nu + 1):
                for j in range(ns + 1): v.append(pt(i / nu, j / ns * 2 - 1, top))
        n = (nu + 1) * (ns + 1); idx = lambda top, i, j: top * n + i * (ns + 1) + j
        for i in range(nu):
            for j in range(ns):
                f.append((idx(1, i, j), idx(1, i, j + 1), idx(1, i + 1, j + 1), idx(1, i + 1, j)))
                f.append((idx(0, i, j), idx(0, i + 1, j), idx(0, i + 1, j + 1), idx(0, i, j + 1)))
        for j in range(ns): f.append((idx(0, 0, j), idx(0, 0, j + 1), idx(1, 0, j + 1), idx(1, 0, j)))  # eave edge
        for i in range(nu):
            f.append((idx(0, i, 0), idx(1, i, 0), idx(1, i + 1, 0), idx(0, i + 1, 0)))
            f.append((idx(0, i, ns), idx(0, i + 1, ns), idx(1, i + 1, ns), idx(1, i, ns)))
        return mesh(mat, v, f)
    for sg in (-1, 1):
        def front(u, s, top, sg=sg):
            xm = max(hw - hd * u, gx + 0.3)
            return (s * xm, sg * hd * (1 - u), prof(u) + lift * (1 - u) ** 2 * abs(s) ** 6 - (0 if top else t))
        grid(front, Nu, Nx)
        def end(u, s, top, sg=sg):
            uu = u * ug
            return (sg * (hw - hd * uu), s * hd * (1 - uu), prof(uu) + lift * (1 - uu) ** 2 * abs(s) ** 6 - (0 if top else t))
        grid(end, max(2, Nu // 2), Nx - 4)
        if seams:  # 瓦棒 standing seams of the copper sheet, following the curved surface
            for ss, fn, ax in ((seams[0], front, 0), (seams[1], end, 1)):
                for k in range(ss):
                    sv = (k + 0.5) / ss * 2 - 1
                    ring = []
                    for i in range(5):
                        q = Vector(fn(i / 4, sv, 1)); dv = Vector((0.03, 0, 0)) if ax == 0 else Vector((0, 0.03, 0))
                        ring.append([q - dv + Vector((0, 0, 0.005)), q + Vector((0, 0, 0.05)), q + dv + Vector((0, 0, 0.005))])
                    loft(mat, ring, closed=False, cap=False)
        # eave fascia (茅負) following the curved, lifted eave
        pts = [front(0, k / Nx * 2 - 1, 0) for k in range(Nx + 1)]
        loft(edge, [[(p[0], p[1], p[2]), (p[0], p[1] - sg * 0.0, p[2] - 0.14), (p[0], p[1] - sg * 0.07, p[2] - 0.14), (p[0], p[1] - sg * 0.07, p[2])] for p in pts], closed=True, cap=True)
        # hip ridges (隅棟)
        a = Vector((sg * hw, -hd, prof(0) + lift)); b = Vector((sg * gx, -hd * (1 - ug), prof(ug)))
        a2 = Vector((sg * hw, hd, prof(0) + lift))
        for p in (a, a2):
            q = Vector((b.x, math.copysign(b.y, p.y), b.z)); m = (p + q) / 2 + Vector((0, 0, -0.06))
            rod(mat, p + Vector((0, 0, 0.06)), m + Vector((0, 0, 0.08)), 0.08, 6); rod(mat, m + Vector((0, 0, 0.08)), q + Vector((0, 0, 0.08)), 0.08, 6)
            ico(mat, 0.12, (p.x, p.y, p.z + 0.1), (1, 1, 1.3), 1)
    zr = prof(1)
    # gable walls (妻壁) with a grid of timbers, bargeboards (破風) and hanging fish (懸魚)
    for sx in (-1, 1):
        us = [ug + (1 - ug) * k / 6 for k in range(7)]
        poly = [(-hd * (1 - u), prof(u) - t) for u in us] + [(hd * (1 - u), prof(u) - t) for u in reversed(us[:-1])]
        prism('plaster_white', poly, 0.08, loc=(sx * gx, 0, 0))
        for y in (-0.6, 0, 0.6): box('wood_frame', (0.1, 0.08, max(0.1, prof(1 - abs(y) / hd) - prof(ug) - 0.2)), (sx * (gx + 0.03), y, prof(ug) - t))
        xb = sx * (gx + 0.32)
        for sg in (-1, 1):
            pts = [(xb, sg * hd * (1 - u), prof(u) + 0.04) for u in us]
            loft(edge, [[(p[0] - 0.04, p[1], p[2]), (p[0] + 0.04, p[1], p[2]), (p[0] + 0.04, p[1], p[2] - 0.32), (p[0] - 0.04, p[1], p[2] - 0.32)] for p in pts])
        prism('gold', [(-0.22, zr - 0.25), (0.22, zr - 0.25), (0.14, zr - 0.6), (0, zr - 0.72), (-0.14, zr - 0.6)], 0.05, loc=(xb + sx * 0.03, 0, 0))
    ridge_cap(-gx - 0.4, gx + 0.4, zr, mat, noshi=False)
    for sx in (-1, 1): onigawara((sx * (gx + 0.45), 0, zr - 0.05), sx, mat, 0.6)
    return zr, gx, prof

@model('shrine_hall', '社殿(小さな拝殿)', '神社')
def shrine_hall():
    w, d = 5.4, 4.6
    # raised floor on a stone base, veranda (縁) with railing, stone + wooden steps
    box('granite', (w + 1.6, d + 1.6, 0.5), (0, 0, 0))
    box('granite', (w + 1.7, d + 1.7, 0.06), (0, 0, 0.44))
    for x in (-w / 2, -w / 6, w / 6, w / 2):
        for y in (-d / 2, d / 2): cyl('wood_frame', 0.13, 0.5, (x, y, 0.5), 10)
    box('wood_light', (w + 1.0, d + 1.0, 0.12), (0, 0, 1.0))
    box('wood_frame', (w + 1.04, d + 1.04, 0.06), (0, 0, 0.96))
    for i in range(4): box('wood_light', (1.8, 0.3, 0.2 * (i + 1)), (0, -d / 2 - 0.65 - (3 - i) * 0.28, 0.5 + 0 * i))
    for sx in (-1, 1): prism('wood_frame', [(-d / 2 - 0.5, 0.5), (-d / 2 - 1.62, 0.5), (-d / 2 - 0.5, 1.12)], 0.08, loc=(sx * 0.94, 0, 0))  # stair strings
    railing(-w / 2 - 0.5, -1.0, -d / 2 - 0.5, 1.12, 0.6, 'wood_frame', 0.6)
    railing(1.0, w / 2 + 0.5, -d / 2 - 0.5, 1.12, 0.6, 'wood_frame', 0.6)
    for sx in (-1, 1):
        with xf((sx * (w / 2 + 0.5), 0, 0), math.pi / 2): railing(-d / 2 - 0.5, d / 2 + 0.5, 0, 1.12, 0.6, 'wood_frame', 0.6)
    T = 0.12
    fr = side_walls(w, d, 1.12, 2.8, T, 'wood_light', {'front': [(0.4, w - 0.4, 0, 2.4)]})
    with xf(*fr['front'][:2]):
        # lattice doors (格子戸)
        for k in range(3):
            a = 0.4 + (w - 0.8) * k / 3; b = 0.4 + (w - 0.8) * (k + 1) / 3
            box2('wood_frame', a, b, 0.03, 0.08, 0, 0.12); box2('wood_frame', a, b, 0.03, 0.08, 2.3, 2.4)
            for i in range(9): x = a + 0.05 + (b - a - 0.1) * i / 8; bar('wood_frame', x - 0.015, x + 0.015, 0.03, 0.08, 0, 2.4)
            for i in range(1, 8): z = 2.4 * i / 8; bar('wood_frame', a, b, 0.05, 0.07, z - 0.012, z + 0.012)
        box2('black', 0.4, w - 0.4, 0.5, 0.52, 0, 2.4)
    for side in ('left', 'right', 'back'):  # 長押 rails across the plank walls
        with xf(*fr[side][:2]):
            for zz in (0.9, 2.2): box2('wood_frame', 0, fr[side][2], -0.05, 0, zz, zz + 0.1)
    for x in (-w / 2, w / 2):
        for y in (-d / 2, d / 2):
            cyl('vermilion', 0.12, 2.9, (x, y, 1.1), 12)
            box('wood_frame', (0.36, 0.36, 0.12), (x, y, 3.98)); box('wood_frame', (0.26, 0.26, 0.1), (x, y, 3.88))  # 斗 bracket blocks
    for sg in (-1, 1):  # 頭貫 / 桁 beams on the pillar heads
        box2('vermilion', -w / 2 - 0.25, w / 2 + 0.25, sg * d / 2 - 0.08, sg * d / 2 + 0.08, 3.72, 3.9)
        box2('vermilion', sg * w / 2 - 0.08, sg * w / 2 + 0.08, -d / 2 - 0.25, d / 2 + 0.25, 3.72, 3.9)
        box2('wood_frame', -w / 2 - 0.3, w / 2 + 0.3, sg * (d / 2 + 0.05) - 0.1, sg * (d / 2 + 0.05) + 0.1, 3.98, 4.08)
    for x in (-w / 2 + 0.9, 0, w / 2 - 0.9): box('wood_frame', (0.22, 0.22, 0.12), (x, -d / 2 - 0.05, 3.88))  # 間斗束
    # 入母屋 copper roof with rafters underneath
    zr, gx, prof = irimoya_roof(w, d, 3.72, over=1.2, H=2.3, mat='copper', Nx=10, Nu=6)
    for sg in (-1, 1):
        for x in frange(-w / 2 - 0.9, w / 2 + 0.9, 0.5):
            rod('wood_frame', (x, sg * (d / 2 + 0.5), prof(1 - (d / 2 + 0.5) / 3.5) - 0.19), (x, sg * (d / 2 + 1.1), prof(0.03) - 0.19), 0.03, 4)
    for x in (-0.7, 0, 0.7): rod('gold' if x == 0 else 'wood_frame', (x, -0.35, zr + 0.42), (x, 0.35, zr + 0.42), 0.09, 8)
    # shimenawa rope with shide, a big bell (鈴) with a red/white rope (鈴緒)
    rings = []
    for i in range(13):
        t = i / 12; x = -w / 2 + 0.3 + t * (w - 0.6); z = 3.75 - 0.25 * math.sin(t * math.pi)
        r_ = 0.06 + 0.06 * math.sin(t * math.pi)
        rings.append([(x, -d / 2 - 0.25 + r_ * math.cos(a / 8 * math.tau), z + r_ * math.sin(a / 8 * math.tau)) for a in range(8)])
    loft('straw', rings)
    for k in range(4):
        x = -1.6 + k * 1.07
        prism('paper', [(0, 0), (0.12, -0.12), (0, -0.24), (0.12, -0.36), (0, -0.48)], 0.12, loc=(x, -d / 2 - 0.27, 3.55), axis='Y')
    ico('gold', 0.24, (0, -d / 2 - 0.3, 3.22), (1, 1, 0.95), 1)
    box('black', (0.3, 0.04, 0.04), (0, -d / 2 - 0.53, 3.12))
    rod('black', (0, -d / 2 - 0.3, 3.45), (0, -d / 2 - 0.3, 3.6), 0.02, 4)
    for k in range(3): rod(['cloth_red', 'cloth_white', 'cloth_red'][k], (-0.05 + k * 0.05, -d / 2 - 0.3, 1.3), (-0.05 + k * 0.05, -d / 2 - 0.3, 3.0), 0.025, 5)
    # hanging lanterns at the front corners
    for sx in (-1, 1):
        rod('black', (sx * 2.2, -d / 2 - 0.6, 4.0), (sx * 2.2, -d / 2 - 0.6, 3.5), 0.01, 3)
        cyl('black', 0.13, 0.05, (sx * 2.2, -d / 2 - 0.6, 3.45), 8); cyl('lantern_white', 0.15, 0.4, (sx * 2.2, -d / 2 - 0.6, 3.05), 8); cyl('black', 0.13, 0.05, (sx * 2.2, -d / 2 - 0.6, 3.0), 8)
    # offering box (賽銭箱)
    with xf((0, -d / 2 - 0.2, 1.12)):
        box('wood_dark', (1.2, 0.6, 0.7), (0, 0, 0))
        for k in range(6): box('wood_frame', (0.04, 0.6, 0.06), (-0.5 + k * 0.2, 0, 0.7))
        box('gold', (0.9, 0.02, 0.05), (0, -0.31, 0.45)); box('wood_frame', (1.26, 0.66, 0.08), (0, 0, 0))

@model('saisen_box', '賽銭箱', '神社')
def saisen_box():
    box2('wood_frame', -0.64, 0.64, -0.33, 0.33, 0, 0.07)
    box2('wood_dark', -0.6, 0.6, -0.3, 0.3, 0.07, 0.68)
    for sx in (-1, 1):
        for sy in (-1, 1): box2('wood_frame', sx * 0.6 - 0.035, sx * 0.6 + 0.035, sy * 0.3 - 0.035, sy * 0.3 + 0.035, 0.07, 0.68)
    for z0, z1 in ((0.07, 0.14), (0.6, 0.68)): box2('wood_frame', -0.6, 0.6, -0.315, -0.29, z0, z1)
    box2('black', -0.57, 0.57, -0.27, 0.27, 0.66, 0.682)
    box2('wood_frame', -0.64, 0.64, -0.34, -0.27, 0.68, 0.74); box2('wood_frame', -0.64, 0.64, 0.27, 0.34, 0.68, 0.74)
    for sx in (-1, 1): box2('wood_frame', sx * 0.605 - 0.035, sx * 0.605 + 0.035, -0.27, 0.27, 0.68, 0.74)
    for y in frange(-0.24, 0.25, 0.08): prism('wood', [(y - 0.035, 0.69), (y + 0.035, 0.69), (y, 0.78)], 1.14, axis='X')
    for sx in (-1, 1):
        for sy in (-1, 1):
            box2('gold', sx * 0.6 - 0.05, sx * 0.6 + 0.05, sy * 0.305 - 0.045, sy * 0.305 + 0.045, 0.675, 0.745)
            box2('gold', sx * 0.6 - 0.05, sx * 0.6 + 0.05, sy * 0.3 - 0.045, sy * 0.3 + 0.045, 0.07, 0.15)
        cyl('gold', 0.08, 0.01, (sx * 0.635, 0, 0.4), 16, rot=(0, sx * math.pi / 2, 0))
        cyl('wood_dark', 0.05, 0.012, (sx * 0.635, 0, 0.4), 16, rot=(0, sx * math.pi / 2, 0))
    text3d('gold', '賽銭', 0.2, (0, -0.322, 0.38), depth=0.012)

@model('ishidoro', '石灯籠', '神社')
def ishidoro():
    _st_lathe('granite', [(0.48, 0), (0.48, 0.12), (0.42, 0.16), (0.33, 0.22), (0.3, 0.25)], 6)
    _st_lathe('granite', [(0.16, 0.25), (0.13, 0.3), (0.12, 0.6), (0.145, 0.62), (0.145, 0.67), (0.12, 0.69), (0.115, 1.0), (0.15, 1.04)], 12)
    _st_lathe('granite', [(0.15, 1.04), (0.25, 1.1), (0.33, 1.19), (0.37, 1.22), (0.37, 1.31), (0.33, 1.34), (0.27, 1.37), (0.25, 1.4)], 6)
    for k in range(6):  # lotus petals under the middle platform
        a = math.radians(-90 + 60 * k)
        o = ico('granite', 0.07, (0.27 * math.cos(a), 0.27 * math.sin(a), 1.14), (1.3, 0.55, 0.9), 1); o.rotation_euler = (0, 0, a + math.pi / 2)
    _st_lathe('granite', [(0.29, 1.4), (0.29, 1.45)], 6); _st_lathe('granite', [(0.29, 1.83), (0.29, 1.88)], 6)
    for k in range(6):
        a = k * math.pi / 3; box('granite', (0.07, 0.07, 0.38), (0.25 * math.cos(a), 0.25 * math.sin(a), 1.45), (0, 0, a))
    for k in range(6):  # fire box: paper windows front/back, sun windows on the diagonals
        f = math.radians(-90 + 60 * k)
        if k in (0, 3):
            box('lantern_white', (0.2, 0.02, 0.38), (0.19 * math.cos(f), 0.19 * math.sin(f), 1.45), (0, 0, f + math.pi / 2))
            box('granite', (0.2, 0.03, 0.03), (0.215 * math.cos(f), 0.215 * math.sin(f), 1.63), (0, 0, f + math.pi / 2))
        else:
            box('granite', (0.2, 0.04, 0.38), (0.21 * math.cos(f), 0.21 * math.sin(f), 1.45), (0, 0, f + math.pi / 2))
            cyl('lantern_white', 0.06, 0.02, (0.226 * math.cos(f), 0.226 * math.sin(f), 1.66), 10, rot=(math.pi / 2, 0, f + math.pi / 2))
    cyl('lamp', 0.07, 0.2, (0, 0, 1.5), 8)
    loft('granite', [_st_kring(6, 0.3, 0.26, 1.88, 1.88), _st_kring(6, 0.57, 0.48, 1.98, 1.93), _st_kring(6, 0.58, 0.49, 2.04, 1.995),
                     _st_kring(6, 0.44, 0.36, 2.1, 2.08), _st_kring(6, 0.25, 0.21, 2.18, 2.17), _st_kring(6, 0.12, 0.1, 2.24, 2.24)])
    for k in range(6):
        a = k * math.pi / 3; ico('granite', 0.045, (0.59 * math.cos(a), 0.59 * math.sin(a), 2.06), sub=1)
    _st_lathe('granite', [(0.13, 2.23), (0.15, 2.26), (0.11, 2.29), (0.07, 2.3), (0.1, 2.35), (0.095, 2.39), (0.05, 2.43), (0.005, 2.48)], 10)
    ico('moss', 0.2, (0.18, 0.16, 2.11), (1.4, 1, 0.3), 2, 0.3, 3); ico('moss', 0.14, (-0.28, 0.1, 0.17), (1.5, 1, 0.4), 1, 0.3, 5)

@model('komainu', '狛犬', '神社')
def komainu():
    box2('granite', -0.42, 0.42, -0.52, 0.52, 0, 0.12)
    box2('granite', -0.34, 0.34, -0.44, 0.44, 0.12, 0.62)
    box2('rock', -0.25, 0.25, -0.446, -0.44, 0.2, 0.54)
    text3d('ink', '奉納', 0.12, (0, -0.448, 0.37), depth=0.006, vertical=True)
    box2('granite', -0.4, 0.4, -0.5, 0.5, 0.62, 0.72); box2('granite', -0.36, 0.36, -0.46, 0.46, 0.72, 0.76)
    ico('granite', 0.3, (0, 0.02, 0.76), (1.0, 1.45, 0.38), 2, 0.15, 5, flat_bottom=0.0)
    g = 'granite'
    for sx in (-1, 1):
        ico(g, 0.17, (sx * 0.15, 0.17, 0.98), (0.8, 1.3, 1.0), 2, 0.08, 6 + sx)          # haunches
        ico(g, 0.07, (sx * 0.19, -0.03, 0.89), (1.0, 1.4, 0.6), 1)                        # hind paws
        rod(g, (sx * 0.11, -0.16, 1.27), (sx * 0.12, -0.25, 0.9), 0.06, 8, r2=0.05)    # front legs
        ico(g, 0.075, (sx * 0.12, -0.28, 0.89), (1.0, 1.35, 0.6), 1)                      # front paws
        ico(g, 0.05, (sx * 0.15, -0.13, 1.1), (0.8, 1, 1.3), 1)                           # elbow tufts
        ico(g, 0.042, (sx * 0.08, -0.34, 1.68), sub=1)                                    # bulging eyes
        ico('ink', 0.02, (sx * 0.08, -0.374, 1.68), sub=1)
        ico(g, 0.05, (sx * 0.09, -0.32, 1.735), (1.5, 0.8, 0.6), 1)                       # brows
        ico(g, 0.06, (sx * 0.2, -0.2, 1.72), (1.4, 0.5, 0.8), 1)                          # ears
        ico(g, 0.06, (sx * 0.12, 0.42, 1.18), (0.8, 0.8, 1.2), 1)                         # tail curls
    o = ico(g, 0.22, (0, 0.05, 1.18), (0.85, 1.0, 1.35), 2, 0.05, 8); o.rotation_euler = (0.3, 0, 0)   # torso
    ico(g, 0.16, (0, -0.12, 1.3), (1.0, 0.9, 1.2), 2, 0.05, 9)                            # chest
    ico(g, 0.2, (0, -0.03, 1.56), (1.25, 0.8, 1.15), 2, 0.12, 10)                         # mane mass
    for k in range(9):
        a = math.radians(-30 + k * 30)
        ico(g, 0.075, (0.23 * math.cos(a), -0.1, 1.62 + 0.23 * math.sin(a)), sub=1, jitter=0.15, seed=k)
    ico(g, 0.19, (0, -0.2, 1.62), (1.15, 1.0, 0.95), 2, 0.05, 11)                         # head
    ico(g, 0.1, (0, -0.35, 1.58), (1.3, 0.8, 0.7), 2, 0.05, 12)                           # muzzle
    ico(g, 0.045, (0, -0.43, 1.62), (1.2, 1, 0.8), 1)                                     # nose
    ico('ink', 0.05, (0, -0.37, 1.51), (1.4, 0.6, 0.5), 1)                                # open mouth (a-gyo)
    ico(g, 0.08, (0, -0.33, 1.47), (1.1, 0.9, 0.45), 2)                                   # lower jaw
    for k, (y, z, r) in enumerate(((0.33, 1.02, 0.11), (0.4, 1.2, 0.09), (0.36, 1.36, 0.07))):
        ico(g, r, (0, y, z), (1.2, 0.6, 1.2), 2, 0.2, 13 + k)                             # flame tail
    prism('cloth_red', [(-0.15, 0), (0.15, 0), (0, -0.2)], 0.012, loc=(0, -0.27, 1.43), axis='Y', rot=(0.25, 0, 0))   # red bib
    ico('moss', 0.12, (0.28, -0.4, 0.73), (1.4, 1, 0.3), 1, 0.3, 4)

@model('azumaya', '展望台の東屋(四阿)', '灯台・展望台')
def azumaya():
    w = 4.4
    box('planks', (w + 2.0, w + 2.0, 0.2), (0, 0, 0))
    for x in (-w / 2, w / 2):
        for y in (-w / 2, w / 2): box('wood_frame', (0.18, 0.18, 2.6), (x, y, 0.2))
    for sg in (-1, 1):
        box('wood_frame', (w + 0.3, 0.18, 0.22), (0, sg * w / 2, 2.6)); box('wood_frame', (0.18, w + 0.3, 0.22), (sg * w / 2, 0, 2.6))
    hip_roof(w, w, 1.5, 2.85, 'roof_tile', over=0.7, ridge_k=0.0)
    ico('ridge_tile', 0.22, (0, 0, 4.4), (1, 1, 0.7), sub=1)
    for sx in (-1, 1):  # benches inside
        box('wood_light', (0.45, w - 0.6, 0.06), (sx * (w / 2 - 0.4), 0, 0.62))
        for y in (-1.3, 0, 1.3): box('wood_frame', (0.4, 0.06, 0.42), (sx * (w / 2 - 0.4), y, 0.2))
    box('wood_light', (1.2, 0.7, 0.05), (0, 0.5, 0.92)); box('wood_frame', (0.12, 0.12, 0.72), (0, 0.5, 0.2))
    railing(-w / 2, w / 2, w / 2, 0.2, 0.8, 'wood_frame', 0.5)
    for x in (-w / 2, w / 2):
        for y in (-w / 2, w / 2):
            box('granite', (0.34, 0.34, 0.12), (x, y, 0.2))  # stone footings
            for (dx, dy) in ((-math.copysign(0.7, x), 0), (0, -math.copysign(0.7, y))):  # 方杖 knee braces
                rod('wood_frame', (x, y, 2.0), (x + dx, y + dy, 2.62), 0.05, 4)
    for sx in (-1, 1):  # bench backs
        box('wood_light', (0.05, w - 0.6, 0.12), (sx * (w / 2 - 0.15), 0, 0.85))
    cyl('copper', 0.1, 0.15, (0, 0, 4.48), 8, r2=0.06); ico('gold', 0.08, (0, 0, 4.68), sub=1)  # 宝珠 finial

@model('telescope', '有料望遠鏡', '灯台・展望台')
def telescope():
    cyl('st_tele', 0.24, 0.04, (0, 0, 0), 14); cyl('st_tele', 0.18, 0.1, (0, 0, 0.04), 14, r2=0.09)
    _st_lathe('st_tele', [(0.075, 0.14), (0.065, 0.2), (0.065, 0.95), (0.09, 1.0), (0.09, 1.04)], 12)
    box2('st_tele', -0.25, 0.25, -0.06, 0.06, 1.04, 1.08)
    for sx in (-1, 1):
        box2('st_tele', sx * 0.24 - 0.022, sx * 0.24 + 0.022, -0.06, 0.06, 1.04, 1.26)
        cyl('steel_dark', 0.06, 0.02, (sx * 0.26, 0, 1.22), 12, rot=(0, sx * math.pi / 2, 0))
    with xf((0, 0, 1.22), rx=0.15):
        _st_rbox('st_tele', 0.42, 0.38, [(0, 0.08, -0.13), (0, 0.08, 0.1), (0.02, 0.07, 0.13), (0.05, 0.05, 0.145)], k=2)
        for sx in (-1, 1):
            x = sx * 0.11
            rod('st_tele', (x, -0.17, 0.0), (x, -0.4, 0.0), 0.088, 14, r2=0.095)
            torus('black', 0.092, 0.012, (x, -0.4, 0.0), rot=(math.pi / 2, 0, 0), seg=14, rseg=4)
            rod('glass', (x, -0.395, 0.0), (x, -0.402, 0.0), 0.082, 14)
            rod('black', (sx * 0.065, 0.18, 0.04), (sx * 0.065, 0.27, 0.04), 0.035, 10)
            rod('rubber', (sx * 0.065, 0.27, 0.04), (sx * 0.065, 0.31, 0.04), 0.045, 10)
            rod('black', (sx * 0.15, 0.18, -0.06), (sx * 0.2, 0.3, -0.09), 0.02, 6)
        box2('st_tele', -0.13, 0.13, 0.12, 0.2, 0.13, 0.22)
        box2('yellow', -0.12, 0.12, 0.2, 0.206, 0.14, 0.21)
        text3d('ink', '100円', 0.045, (0, 0.208, 0.185), rz=math.pi, depth=0.004)
        box2('metal', -0.03, 0.03, 0.15, 0.17, 0.22, 0.225); box2('black', -0.02, 0.02, 0.155, 0.165, 0.225, 0.227)
        box2('yellow', -0.18, 0.18, -0.191, -0.188, 0.0, 0.05)

@model('info_board', '案内板(港町マップ)', '灯台・展望台')
def info_board():
    for sx in (-1, 1):
        box2('wood_frame', sx * 0.88 - 0.06, sx * 0.88 + 0.06, -0.06, 0.06, 0, 1.66)
        box2('concrete', sx * 0.88 - 0.1, sx * 0.88 + 0.1, -0.1, 0.1, 0, 0.08)
        prism('wood_frame', [(-0.14, 1.62), (0.24, 1.62), (0.05, 1.73)], 0.04, loc=(sx * 0.98, 0, 0), axis='X')
    box2('wood_frame', -0.95, 0.95, -0.05, 0.05, 1.56, 1.63)
    slab('roof_tile', (-1.02, -0.17, 1.62), (1.02, -0.17, 1.62), (-1.02, 0.05, 1.74), (1.02, 0.05, 1.74), t=0.03)
    slab('roof_tile', (1.02, 0.27, 1.62), (-1.02, 0.27, 1.62), (1.02, 0.05, 1.74), (-1.02, 0.05, 1.74), t=0.03)
    rod('ridge_tile', (-1.04, 0.05, 1.745), (1.04, 0.05, 1.745), 0.03, 6)
    with xf((0, 0, 0.56), rx=-0.18):
        box2('wood_frame', -0.82, 0.82, -0.03, 0.04, 0, 0.97)
        box2('st_map_sea', -0.77, 0.77, -0.045, -0.03, 0.05, 0.79)
        box2('sign_blue', -0.77, 0.77, -0.045, -0.03, 0.8, 0.94)
        text3d('ink_white', '海凪の港町', 0.1, (0, -0.05, 0.87), depth=0.008)
        prism('st_map_land', [(-0.77, 0.5), (-0.6, 0.52), (-0.45, 0.42), (-0.25, 0.45), (-0.1, 0.36), (0.1, 0.4), (0.3, 0.3), (0.5, 0.34), (0.77, 0.28), (0.77, 0.79), (-0.77, 0.79)], 0.006, loc=(0, -0.048, 0), axis='Y')
        prism('st_map_hill', [(-0.7, 0.62), (-0.5, 0.77), (-0.2, 0.78), (-0.35, 0.64)], 0.006, loc=(0, -0.051, 0), axis='Y')
        prism('st_map_hill', [(0.3, 0.6), (0.48, 0.77), (0.74, 0.78), (0.74, 0.52)], 0.006, loc=(0, -0.051, 0), axis='Y')
        box2('white', -0.75, 0.75, -0.056, -0.05, 0.47, 0.485)
        box2('white', -0.03, -0.012, -0.056, -0.05, 0.47, 0.72); box2('white', 0.3, 0.75, -0.056, -0.05, 0.38, 0.392)
        box2('white', 0.05, 0.085, -0.056, -0.05, 0.16, 0.4); box2('white', 0.085, 0.42, -0.056, -0.05, 0.16, 0.19)
        box2('vermilion', 0.4, 0.44, -0.058, -0.05, 0.15, 0.22)
        for x in (-0.05, 0.01): box2('vermilion', x - 0.006, x + 0.006, -0.058, -0.05, 0.69, 0.75)
        box2('vermilion', -0.07, 0.03, -0.058, -0.05, 0.74, 0.755)
        for bx, bz in ((-0.5, 0.2), (-0.3, 0.12), (0.25, 0.08)): prism('white', [(bx - 0.04, bz), (bx + 0.04, bz), (bx + 0.025, bz - 0.02), (bx - 0.025, bz - 0.02)], 0.006, loc=(0, -0.053, 0), axis='Y')
        cyl('red', 0.028, 0.012, (-0.2, -0.05, 0.5), 12, rot=(math.pi / 2, 0, 0)); torus('white', 0.04, 0.006, (-0.2, -0.058, 0.5), rot=(math.pi / 2, 0, 0), seg=12, rseg=3)
        prism('ink', [(0.66, 0.66), (0.7, 0.66), (0.68, 0.73)], 0.006, loc=(0, -0.053, 0), axis='Y')
        text3d('ink', 'N', 0.05, (0.68, -0.054, 0.62), depth=0.004)

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
    # mid-size coastal fishing boat: rubbing strake, cap rail and freeing ports on the hull; a two-level wheelhouse with
    # framed windows, wipers, visor, door, ladder and life ring; a lights mast with fish-lamp bulbs (集魚灯), a spinning
    # open-array radar, a foremast with a derrick boom and stays, a steadying sail aft; line hauler, winch, hatches,
    # crates, nets and a windlass with an anchor on the bow.
    L, B, D = 14.0, 3.8, 2.0
    hb, zd, yy = boat_hull(L, B, D, N=40)
    _pv_hull_trim(L, hb, zd, yy, 0.55)
    boat_dress(L, B, hb, zd, yy, '海凪丸')
    dz = zd(0.35); wy = yy(0.33)
    with xf((0, wy, dz)):
        _pv_wheelhouse(2.6, 3.0, 2.0, nfront=3, nside=2, roof_mat='white', door=1)
        with xf((0, 0.2, 2.1)):
            _pv_wheelhouse(2.0, 2.2, 1.1, nfront=3, nside=1, roof_mat='boat_blue', door=0, ring=False, ladder=False)
        # rail round the flying-bridge deck
        rail = [(-1.38, -1.6, 2.65), (1.38, -1.6, 2.65), (1.38, 1.6, 2.65), (0.0, 1.6, 2.65)]
        _pv_tube('pv_chrome', rail, 0.022, 6, cap=False)
        for p in rail[:3] + [(-1.38, 0.0, 2.65), (0.0, -1.6, 2.65), (1.38, 0.0, 2.65)]: rod('pv_chrome', (p[0], p[1], 2.1), p, 0.018, 4)
        _pv_tube('pv_chrome', [(-1.38, -1.6, 2.65), (-1.38, 0.0, 2.65)], 0.022, 6)
        # mast with radar platform, cross-tree with fish lamps, lights and antennas
        _pv_lights_mast(0, -0.3, 3.3, 7.0)
        _pv_rbox('white', (0.5, 0.5, 0.06), (0, -0.3, 3.96), 0.02)
        rod('white', (-1.5, -0.3, 5.6), (1.5, -0.3, 5.6), 0.05, 6)
        for sx in (-1, 1):
            ico('beacon_red' if sx < 0 else 'green', 0.08, (sx * 1.5, -0.3, 5.7), sub=1)
            for k in range(3):
                x = sx * (0.45 + k * 0.38)
                rod('steel_dark', (x, -0.3, 5.6), (x, -0.3, 5.42), 0.01, 3)
                _pv_lathe('lamp', [(0, -0.18), (0.08, -0.14), (0.1, -0.06), (0.06, 0), (0.03, 0.02), (0, 0.02)], (x, -0.3, 5.42), seg=8)
            _pv_stay((0, -0.3, 6.9), (sx * 1.4, 0.6, 0.05))
        ico('white', 0.18, (0.7, 1.1, 3.35), (1, 1, 0.7), 2, flat_bottom=0); cyl('white', 0.05, 0.15, (0.7, 1.1, 3.2), 6)   # GPS dome
        for x, ht in ((-0.8, 2.0), (-0.5, 2.8), (0.9, 2.4)): rod('white', (x, 0.9, 3.3), (x, 0.9, 3.3 + ht), 0.02, 4)
        for sx in (-1, 1):   # searchlights and horn on the roof
            with xf((sx * 0.8, -1.2, 3.3)):
                cyl('steel_dark', 0.04, 0.15, (0, 0, 0), 6)
                with xf((0, 0, 0.25), rx=math.pi / 2): cyl('white', 0.12, 0.2, (0, 0, -0.1), 12); cyl('lamp', 0.1, 0.01, (0, 0, -0.11), 12)
        cyl('pv_chrome', 0.03, 0.25, (0.4, -1.4, 3.35), 8, r2=0.08, rot=(math.pi / 2, 0, 0))
        # exhaust stack
        _pv_rbox('white', (0.35, 0.45, 2.4), (-1.0, 1.25, 1.0), 0.08, segs=2); cyl('black', 0.1, 0.2, (-1.0, 1.25, 3.4), 10)
        # flag
        prism('red', [(-0.3, 6.75), (-0.3, 7.15), (0.35, 6.95)], 0.01, axis='X')
    _pv_radar('fishing_boat_radar', (0, wy - 0.3, dz + 4.4))
    # foremast with derrick boom and stays, stern mast with steadying sail
    fy, fz = yy(0.68), zd(0.68)
    rod('white', (0, fy, fz), (0, fy, fz + 6.0), 0.08, 8)
    rod('white', (-1.2, fy, fz + 4.5), (1.2, fy, fz + 4.5), 0.04, 6)
    for k in range(5): ico('float_yellow' if k % 2 else 'float_orange', 0.16, (-1.0 + k * 0.5, fy, fz + 4.25), sub=2)
    rod('white', (0, fy, fz + 1.0), (0, yy(0.86), fz + 2.6), 0.06, 6)
    rod('rope', (0, yy(0.86), fz + 2.6), (0, yy(0.86), zd(0.86) + 0.6), 0.012, 4); _pv_rbox('steel_dark', (0.1, 0.08, 0.2), (0, yy(0.86), fz + 2.35), 0.02)
    for sx in (-1, 1): _pv_stay((0, fy, fz + 5.9), (sx * hb(0.7) * 0.95, yy(0.7), zd(0.7) + 0.5))
    _pv_stay((0, fy, fz + 5.9), (0, yy(0.97), zd(0.97) + 0.5))
    _pv_stay((0, fy, fz + 5.9), (0, wy - 0.3, dz + 6.8))
    ico('beacon_white', 0.08, (0, fy, fz + 6.08), sub=1)
    sy_, sz = yy(0.04), zd(0.04)
    rod('white', (0, sy_, sz), (0, sy_, sz + 4.0), 0.06, 6)
    prism('cloth_white', [(0, sz + 1.2), (0.0, sz + 3.9), (-1.9, sz + 1.4)], 0.02, loc=(0, sy_ - 0.05, 0), axis='X')
    _pv_tube('rope', [(0, sy_ - 1.9, sz + 1.4), (0, sy_ - 1.6, sz + 0.9), (0.3, sy_ - 1.4, sz + 0.55)], 0.012, 4)
    # deck gear: line hauler, winch, hatches, crates, nets, windlass and anchor
    with xf((1.0, yy(0.55), zd(0.55))):
        _pv_rbox('steel_dark', (0.5, 0.5, 0.75), (0, 0, 0), 0.05)
        torus('yellow', 0.33, 0.09, (0, -0.32, 0.95), rot=(math.pi / 2, 0, 0), seg=16, rseg=6)
        cyl('steel_dark', 0.2, 0.2, (0, -0.2, 0.95), 12, rot=(math.pi / 2, 0, 0))
        for dy in (-0.42, -0.22): cyl('yellow', 0.42, 0.02, (0, dy, 0.95), 16, rot=(math.pi / 2, 0, 0))
    with xf((-0.5, yy(0.5), zd(0.5) + 0.35), ry=math.pi / 2):
        cyl('rust', 0.3, 0.9, (0, 0, -0.45), 14)
        for z in (-0.47, 0.45): cyl('steel_dark', 0.38, 0.03, (0, 0, z), 14)
        torus('rope', 0.31, 0.04, (0, 0, -0.2), seg=14, rseg=4); torus('rope', 0.31, 0.04, (0, 0, 0.1), seg=14, rseg=4)
    _pv_rbox('steel_dark', (0.25, 1.0, 0.7), (-0.5, yy(0.5), zd(0.5)), 0.03)
    for t in (0.62, 0.12):
        _pv_rbox('white', (1.4, 1.2, 0.2), (0, yy(t), zd(t)), 0.05)
        _pv_rbox('pv_paint_white', (1.2, 1.0, 0.04), (0, yy(t), zd(t) + 0.2), 0.02)
        for sx in (-1, 1): _pv_tube('pv_chrome', [(sx * 0.3, yy(t) - 0.35, zd(t) + 0.24), (sx * 0.3, yy(t) - 0.35, zd(t) + 0.3), (sx * 0.3, yy(t) - 0.2, zd(t) + 0.3), (sx * 0.3, yy(t) - 0.2, zd(t) + 0.24)], 0.012, 4)
    for k in range(3):
        for m in range(2): _pv_rbox('crate_blue', (0.6, 0.4, 0.3), (-0.9, yy(0.1) - k * 0.45, zd(0.1) + m * 0.3), 0.02)
    net_pile((0.6, yy(0.16), zd(0.16)), 0.75, 'net')
    with xf((0, yy(0.9), zd(0.9))):   # windlass
        _pv_rbox('steel_dark', (0.6, 0.4, 0.35), (0, 0, 0), 0.04)
        cyl('rust', 0.12, 0.8, (-0.4, 0, 0.35), 12, rot=(0, math.pi / 2, 0))
        _pv_tube('iron', [(0, 0.0, 0.35), (0.0, -0.6, 0.45), (0.0, -1.1, 0.5)], 0.035, 4)
    with xf((0.45, yy(0.965), zd(0.965) + 0.1), rz=0.2):   # anchor stowed on the bow
        rod('iron', (0, 0, 0), (0, -0.0, 0.7), 0.04, 6); rod('iron', (-0.25, 0, 0.1), (0.25, 0, 0.1), 0.04, 6)
        for sx in (-1, 1): prism('iron', [(0, 0), (0.12, 0.0), (0.0, 0.2)], 0.04, loc=(sx * 0.3, 0, 0.1), axis='Y', rot=(0, 0, 0))
    # rudder and propeller (stern = +Y)
    zk = -0.42 * D
    _pv_rbox('antifoul', (0.08, 0.6, 1.0), (0, L / 2 - 0.1, zk - 0.25), 0.03)
    rod('metal', (0, L / 2 - 1.8, zk + 0.25), (0, L / 2 - 0.55, zk + 0.1), 0.05, 8)
    part('fishing_boat_prop', (0, L / 2 - 0.55, zk + 0.1))
    cyl('metal', 0.07, 0.15, (0, L / 2 - 0.55, zk + 0.1), 8, rot=(math.pi / 2, 0, 0))
    for k in range(3): box('metal', (0.07, 0.06, 0.36), (0, L / 2 - 0.55, zk + 0.1), (0, k / 3 * math.tau, 0.3))
    part(None)

@model('fishing_boat_b', '漁船(海栄丸・青)', '船')
def fishing_boat_b():
    # smaller blue-banded boat: wheelhouse right aft with a radar on the roof, mast with lights, floats, winch, crates and a green net
    L, B, D = 12.0, 3.4, 1.8
    hb, zd, yy = boat_hull(L, B, D, bw=0.45, band='boat_blue', sheer=0.6, N=36)
    _pv_hull_trim(L, hb, zd, yy, 0.45)
    boat_dress(L, B, hb, zd, yy, '海栄丸', fenders=4, floats=False)
    dz = zd(0.2); wy = yy(0.2)
    with xf((0, wy, dz)):
        _pv_wheelhouse(2.2, 2.4, 1.9, nfront=3, nside=1, roof_mat='boat_blue', door=-1)
        _pv_lights_mast(0, -0.6, 2.0, 6.3)
        rod('white', (-1.2, -0.6, 4.8), (1.2, -0.6, 4.8), 0.04, 6)
        for sx in (-1, 1):
            ico('beacon_red' if sx < 0 else 'green', 0.07, (sx * 1.2, -0.6, 4.88), sub=1)
            _pv_stay((0, -0.6, 6.2), (sx * 1.3, 0.8, 0.0))
            for k in range(2):
                x = sx * (0.45 + k * 0.4)
                rod('steel_dark', (x, -0.6, 4.8), (x, -0.6, 4.64), 0.01, 3)
                _pv_lathe('lamp', [(0, -0.16), (0.07, -0.12), (0.09, -0.05), (0.05, 0), (0, 0.01)], (x, -0.6, 4.64), seg=8)
        rod('white', (0.7, 0.7, 2.0), (0.7, 0.7, 4.2), 0.02, 4); rod('white', (-0.8, 0.7, 2.0), (-0.8, 0.7, 3.6), 0.02, 4)
        with xf((0.7, -1.0, 2.0)):
            with xf((0, 0, 0.2), rx=math.pi / 2): cyl('white', 0.1, 0.18, (0, 0, -0.09), 12); cyl('lamp', 0.085, 0.01, (0, 0, -0.1), 12)
        _pv_rbox('white', (0.3, 0.4, 2.2), (-0.85, 1.32, 0.8), 0.08, segs=2); cyl('black', 0.09, 0.2, (-0.85, 1.32, 3.0), 10)
    _pv_radar('fishing_boat_b_radar', (0, wy, dz + 2.35), L=1.4)
    for k in range(6): ico(['float_orange', 'float_yellow'][k % 2], 0.22, (-0.5 + (k % 3) * 0.45, yy(0.6) + (k // 3) * 0.45, zd(0.6) + 0.22), sub=2)
    with xf((0.5, yy(0.45), zd(0.45) + 0.4), ry=math.pi / 2):
        cyl('steel_dark', 0.35, 1.0, (0, 0, -0.5), 14)
        for z in (-0.52, 0.5): cyl('yellow', 0.42, 0.03, (0, 0, z), 14)
        torus('rope', 0.36, 0.04, (0, 0, -0.1), seg=14, rseg=4)
    _pv_rbox('steel_dark', (1.1, 0.25, 0.4), (0.5, yy(0.45), zd(0.45)), 0.03)
    for k in range(4): _pv_rbox('crate_blue', (0.6, 0.4, 0.3), (1.0, yy(0.7) + k * 0.45, zd(0.7)), 0.02)
    net_pile((-0.6, yy(0.42), zd(0.42)), 0.7, 'net_green')
    with xf((0, yy(0.88), zd(0.88))):
        _pv_rbox('steel_dark', (0.5, 0.35, 0.3), (0, 0, 0), 0.04); cyl('rust', 0.1, 0.7, (-0.35, 0, 0.3), 12, rot=(0, math.pi / 2, 0))
    rod('white', (0, yy(0.75), zd(0.75)), (0, yy(0.75), zd(0.75) + 3.2), 0.06, 8)
    for sx in (-1, 1): _pv_stay((0, yy(0.75), zd(0.75) + 3.1), (sx * hb(0.78) * 0.95, yy(0.78), zd(0.78) + 0.45))
    zk = -0.42 * D
    _pv_rbox('antifoul', (0.08, 0.5, 0.9), (0, L / 2 - 0.1, zk - 0.2), 0.03)
    part('fishing_boat_b_prop', (0, L / 2 - 0.5, zk + 0.1))
    cyl('metal', 0.06, 0.12, (0, L / 2 - 0.5, zk + 0.1), 8, rot=(math.pi / 2, 0, 0))
    for k in range(3): box('metal', (0.06, 0.06, 0.3), (0, L / 2 - 0.5, zk + 0.1), (0, k / 3 * math.tau, 0.3))
    part(None)

@model('skiff', '小型の和船(船外機付き)', '船')
def skiff():
    # 6 m FRP harbour skiff with an outboard: flared hull with chine and a rising bow, blue sheer band, rubbing strake and
    # a teak gunwale, ribs, floorboards and three thwarts inside; outboard with cowl, tiller, lower unit and propeller;
    # fuel tank, oars, grapnel and rope, a fish crate, a float and fenders.
    L, B, N = 6.0, 1.7, 24
    def half(t): return B / 2 * (0.86 + 0.14 * math.sin(min(1, t / 0.45) * math.pi / 2)) * (1 - (max(0, t - 0.45) / 0.55) ** 1.8 * 0.97)
    def zb(t): return -0.28 + (0 if t < 0.6 else ((t - 0.6) / 0.4) ** 1.6 * 0.72)
    def zt(t): return 0.42 + 0.33 * (max(0, t - 0.55) / 0.45) ** 2
    def Y(t): return L / 2 - t * L
    rings = []
    for i in range(N + 1):
        t = i / N; h, b, top = half(t), zb(t), zt(t)
        side = [(h * 0.45, b + 0.04), (h * 0.9, b + 0.19), (h, b + 0.28), (h * 1.03, top - 0.13), (h * 1.045, top), (h * 0.96 - 0.02, top), (h * 0.9 - 0.03, b + 0.3), (h * 0.45 - 0.02, b + 0.1)]
        ring = [(0.0, b)] + side + [(-x, z) for x, z in reversed(side)]
        rings.append([(x, Y(t), z) for x, z in ring])
    segs = {'antifoul': [(0, 1), (1, 2), (15, 16), (16, 0)], 'white': [(2, 3), (3, 4), (13, 14), (14, 15), (6, 7), (10, 11)], 'boat_blue': [(4, 5), (12, 13)],
            'pv_teak': [(5, 6), (11, 12)], 'deck_green': [(7, 8), (8, 9), (9, 10)]}
    for mat, pairs in segs.items():
        v, f = [], []
        for (a, b) in pairs:
            base = len(v)
            for r in rings: v += [r[a], r[b]]
            for i in range(N): f.append((base + 2 * i, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2))
        mesh(mat, v, f)
    mesh('white', rings[0], [tuple(range(len(rings[0])))])                                            # transom
    for sx in (-1, 1):
        _pv_tube('rubber', [(sx * (half(i / N) * 1.04 + 0.012), Y(i / N), zt(i / N) - 0.05) for i in range(N - 1)], 0.022, 5)     # rubbing strake
    _pv_tube('pv_teak', [(0, Y(t), zb(t) + (zt(t) - zb(t)) * k) for t, k in ((0.86, 0.0), (0.93, 0.3), (0.98, 0.75), (1.0, 1.0))], 0.035, 6)   # stem
    # ribs, floorboards, thwarts with knees
    for i in range(3, N - 3, 3):
        t = i / N; h, b, top = half(t), zb(t), zt(t)
        _pv_tube('pv_teak', [(-h * 0.92 + 0.03, Y(t), top - 0.05), (-h * 0.86, Y(t), b + 0.3), (-h * 0.4, Y(t), b + 0.13), (h * 0.4, Y(t), b + 0.13),
                             (h * 0.86, Y(t), b + 0.3), (h * 0.92 - 0.03, Y(t), top - 0.05)], 0.018, 4, flat=0.6)
    for k in range(5): box('wood_light', (0.12, 3.2, 0.025), (-0.3 + k * 0.15, 0.25, -0.13))
    for t in (0.18, 0.47, 0.7):
        w = half(t) * 0.92 * 2 - 0.06; y = Y(t)
        _pv_rbox('pv_teak', (w, 0.26, 0.04), (0, y, zt(t) - 0.15), 0.012)
        for sx in (-1, 1): _pv_rbox('pv_teak', (0.04, 0.16, 0.12), (sx * (w / 2 - 0.03), y, zt(t) - 0.26), 0.01)
    # cleats
    for p in ((0, Y(0.94), zt(0.94) + 0.01), (-0.6, Y(0.02), zt(0.02) + 0.01), (0.6, Y(0.02), zt(0.02) + 0.01)):
        _pv_rbox('pv_chrome', (0.05, 0.16, 0.02), (p[0], p[1], p[2] + 0.03), 0.008); rod('pv_chrome', p, (p[0], p[1], p[2] + 0.035), 0.012, 6)
    # outboard motor on the transom (stern = +Y)
    with xf((0, L / 2 + 0.06, zt(0))):
        _pv_rbox('steel_dark', (0.18, 0.12, 0.2), (0, -0.04, -0.15), 0.02)                              # clamp bracket
        _pv_rbox('pv_cowl', (0.36, 0.52, 0.42), (0, 0.18, 0.08), 0.1, segs=2)                            # cowl
        _pv_rbox('white', (0.37, 0.53, 0.045), (0, 0.18, 0.22), 0.02)                                    # stripe
        _pv_rbox('pv_cowl', (0.3, 0.42, 0.12), (0, 0.18, -0.05), 0.04)
        _pv_rbox('pv_cowl', (0.14, 0.2, 0.55), (0, 0.18, -0.6), 0.05, segs=2)                            # midsection
        _pv_rbox('pv_cowl', (0.42, 0.4, 0.02), (0, 0.2, -0.72), 0.01)                                   # anti-cavitation plate
        _pv_tube('pv_cowl', [(0, -0.02, -0.84), (0, 0.15, -0.85), (0, 0.38, -0.84)], [0.03, 0.06, 0.035], 8)    # torpedo
        prism('pv_cowl', [(0.05, -0.86), (0.2, -0.86), (0.1, -1.0)], 0.02, axis='Y')                    # skeg
        for k in range(3):
            a = k / 3 * math.tau
            with xf((0, 0.4, -0.84), ry=a):
                mesh('metal', [(0, 0.0, 0.03), (0.04, -0.02, 0.15), (-0.04, 0.02, 0.15), (0, 0.0, 0.03)], [(0, 1, 2)])
                mesh('metal', [(0, 0.0, 0.03), (-0.04, 0.02, 0.15), (0.04, -0.02, 0.15)], [(0, 1, 2)])
        rod('pv_cowl', (0, -0.05, 0.12), (0, -0.62, 0.2), 0.022, 6)                                     # tiller
        _pv_tube('black', [(0, -0.48, 0.18), (0, -0.66, 0.205)], 0.032, 8)
        rod('cloth_red', (0.12, 0.0, 0.25), (0.15, -0.15, 0.2), 0.006, 3)
    # fuel tank with hose, oars, grapnel, rope, crate, float, fenders
    _pv_rbox('red', (0.32, 0.45, 0.24), (0.38, 1.9, -0.12), 0.05, segs=2)
    cyl('black', 0.035, 0.03, (0.38, 1.8, 0.12), 8)
    _pv_tube('black', [(0.38, 1.8, 0.15), (0.2, 2.2, 0.2), (0.06, 2.6, 0.25), (0.05, 2.95, 0.25)], 0.012, 4)
    for sx in (-1, 1):
        rod('pv_teak', (sx * 0.5, -1.2, zt(0.6) - 0.1), (sx * 0.55, 1.4, zt(0.2) - 0.1), 0.022, 6)
        _pv_rbox('pv_teak', (0.12, 0.45, 0.012), (sx * 0.555, 1.35, zt(0.2) - 0.12), 0.004)
    _pv_rbox('crate_blue', (0.55, 0.38, 0.28), (0.15, -0.3, -0.11), 0.02)
    ico('float_orange', 0.17, (-0.35, 0.95, 0.06), sub=2)
    torus('rope', 0.18, 0.03, (0.0, -1.9, zb(0.82) + 0.32), seg=14, rseg=5); torus('rope', 0.14, 0.03, (0.02, -1.88, zb(0.82) + 0.37), seg=14, rseg=5)
    with xf((-0.25, -1.6, zb(0.77) + 0.32)):
        rod('steel_dark', (0, 0, 0.0), (0, 0, 0.3), 0.012, 6)
        for k in range(4): a = k / 4 * math.tau; _pv_tube('steel_dark', [(0, 0, 0.02), (0.08 * math.cos(a), 0.08 * math.sin(a), 0.04), (0.1 * math.cos(a), 0.1 * math.sin(a), 0.1)], 0.008, 4)
    for k, y in enumerate((-0.75, -0.95)):   # fenders stowed on the floorboards
        cyl('white', 0.06, 0.34, (-0.42 + k * 0.13, y, -0.05), 10, rot=(math.pi / 2, 0, 0.15)); rod('rope', (-0.42 + k * 0.13, y - 0.34, -0.05), (-0.3, y - 0.45, -0.1), 0.008, 3)

# ================================================================= harbour modules and props
# ---------------------------------------------------------------- harbour-prop helpers (_hb_*)
PALETTE.update({
    'hb_iron_rust': P((0.36, 0.17, 0.08), 0.9, 0.2), 'hb_iron_worn': P((0.3, 0.29, 0.27), 0.45, 0.7),
    'hb_rubber_worn': P((0.11, 0.11, 0.105), 0.95), 'hb_paint_yellow': P((0.88, 0.62, 0.06), 0.55),
    'hb_slime': P((0.045, 0.06, 0.03), 0.7), 'hb_barnacle': P((0.62, 0.6, 0.52), 0.9),
    'hb_concrete_dark': P((0.72, 0.72, 0.68), 0.95, tex='concrete'), 'hb_concrete_stain': P((0.55, 0.58, 0.5), 0.9, tex='concrete'),
    'hb_ice': P((0.72, 0.86, 0.95), 0.12), 'hb_fish': P((0.42, 0.48, 0.55), 0.3, 0.55), 'hb_fish_back': P((0.08, 0.14, 0.22), 0.35, 0.4),
    'hb_fish_red': P((0.78, 0.2, 0.12), 0.35, 0.2), 'hb_shadow': P((0.01, 0.02, 0.04), 0.9),
    'hb_tape': P((0.62, 0.42, 0.16), 0.3), 'hb_tape_blue': P((0.1, 0.3, 0.7), 0.35), 'hb_styro_dirty': P((0.8, 0.8, 0.74), 0.85),
    'hb_net_heap': P((0.03, 0.11, 0.12), 0.95), 'hb_net_heap2': P((0.09, 0.2, 0.06), 0.95), 'hb_net_trap': P((0.14, 0.32, 0.3), 0.9),
    'hb_net_dark': P((0.04, 0.08, 0.08), 0.95), 'hb_glass_green': P((0.12, 0.42, 0.3), 0.08, 0.1),
    'hb_rope_dark': P((0.32, 0.26, 0.17), 0.95), 'hb_rope_blue': P((0.08, 0.22, 0.5), 0.9), 'hb_rope_white': P((0.85, 0.83, 0.76), 0.9),
    'hb_wood_weather': P((1.3, 1.22, 1.08), 0.9, tex='wood'), 'hb_rope_manila': P((0.36, 0.25, 0.12), 0.95), 'hb_pile_wet': P((0.42, 0.42, 0.36), 0.8, tex='wood_dark'),
    'hb_rock_dark': P((0.68, 0.64, 0.6), 0.95, tex='rock'), 'hb_rock_warm': P((1.1, 0.98, 0.85), 0.95, tex='rock'),
    'hb_rock_wet': P((0.42, 0.42, 0.4), 0.7, tex='rock'), 'hb_paint_blue': P((0.06, 0.28, 0.62), 0.6),
})

def _hb_bm_obj(mat, bm, name='hb'):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    return _take(o, mat)

def _hb_rbox(mat, size, loc, b=0.02, rot=(0, 0, 0)):
    """Box with chamfered edges; size (x, y, z), loc = centre of the bottom face."""
    sx, sy, sz = size; b = min(b, sx * 0.45, sy * 0.45, sz * 0.45)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * sx, v.co.y * sy, (v.co.z + 0.5) * sz))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=b, offset_type='OFFSET', segments=1, profile=0.5, affect='EDGES')
    o = _hb_bm_obj(mat, bm); o.location = loc; o.rotation_euler = rot
    return o

def _hb_tube(mat, pts, r, sides=6, cap=True, radii=None):
    """Sweep a circle along a polyline (parallel-transport frames)."""
    pts = [Vector(p) for p in pts]; n = len(pts); tans = []
    for i in range(n):
        t = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        tans.append(t.normalized() if t.length > 1e-9 else Vector((0, 0, 1)))
    up = Vector((0, 0, 1)) if abs(tans[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = tans[0].cross(up).normalized(); v, f = [], []
    for i in range(n):
        nrm = nrm - tans[i] * nrm.dot(tans[i])
        if nrm.length < 1e-6: nrm = tans[i].orthogonal()
        nrm.normalize(); bn = tans[i].cross(nrm); ri = radii[i] if radii else r
        for j in range(sides):
            a = j / sides * math.tau
            v.append(pts[i] + (nrm * math.cos(a) + bn * math.sin(a)) * ri)
    for i in range(n - 1):
        for j in range(sides):
            j2 = (j + 1) % sides
            f.append((i * sides + j, i * sides + j2, (i + 1) * sides + j2, (i + 1) * sides + j))
    if cap: f += [tuple(reversed(range(sides))), tuple((n - 1) * sides + j for j in range(sides))]
    return mesh(mat, v, f)

def _hb_lathe(mat, prof, seg=16, loc=(0, 0, 0), rot=(0, 0, 0), bump=None, caps=True):
    """Revolve a profile [(r, z)] around Z (r = 0 ends close to a point). bump(i, k) -> radius offset."""
    n = len(prof); v, f = [], []
    for i in range(seg):
        a = i / seg * math.tau
        for k, (r, z) in enumerate(prof):
            rr = r + (bump(i, k) if bump else 0)
            v.append((rr * math.cos(a), rr * math.sin(a), z))
    for i in range(seg):
        i2 = (i + 1) % seg
        for k in range(n - 1): f.append((i * n + k, i2 * n + k, i2 * n + k + 1, i * n + k + 1))
    if caps and prof[0][0] > 1e-4: f.append(tuple(i * n for i in reversed(range(seg))))
    if caps and prof[-1][0] > 1e-4: f.append(tuple(i * n + n - 1 for i in range(seg)))
    o = mesh(mat, v, f); o.location = loc; o.rotation_euler = rot
    return o

def _hb_strands(mat, segs, r):
    """Cheap net/wire strands: an uncapped triangular prism per segment, all in one mesh."""
    v, f = [], []
    for a, b in segs:
        a, b = Vector(a), Vector(b); d = b - a
        if d.length < 1e-6: continue
        d.normalize(); up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
        n1 = d.cross(up).normalized(); n2 = d.cross(n1); k = len(v)
        for p in (a, b):
            for j in range(3):
                an = j / 3 * math.tau + 0.5; v.append(p + (n1 * math.cos(an) + n2 * math.sin(an)) * r)
        for j in range(3):
            j2 = (j + 1) % 3; f.append((k + j, k + j2, k + 3 + j2, k + 3 + j))
    return mesh(mat, v, f)

def _hb_poly_segs(pts): return [(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]

def _hb_fish(loc, L=0.3, rz=0.0, mat='hb_fish', back='hb_fish_back', curl=0.0, roll=0.25):
    """Low-poly fish lying on its side: lofted body + tail fin, length L along local X."""
    st = [(-0.5, 0.012, 0.01), (-0.38, 0.09, 0.05), (-0.15, 0.13, 0.07), (0.15, 0.1, 0.055), (0.36, 0.035, 0.022)]
    with xf(loc, rz=rz, rx=roll):
        rings = []
        for x, h, w in st:
            bend = curl * (x + 0.5) ** 2
            rings.append([Vector((x * L, bend * L + h * L * math.cos(a), w * L * math.sin(a) + h * L * 0.25)) for a in
                          (k / 6 * math.tau for k in range(6))])
        loft(mat, rings)
        tx = 0.36 * L; bend = curl * 0.86 ** 2 * L
        mesh(back, [(tx, bend, 0.01 * L), (0.52 * L, bend + 0.14 * L, 0.01 * L), (0.48 * L, bend, 0.012 * L), (0.52 * L, bend - 0.14 * L, 0.01 * L)], [(0, 1, 2), (0, 2, 3)])
        mesh(back, [(-0.2 * L, 0.13 * L, 0.02 * L), (0.12 * L, 0.11 * L, 0.02 * L), (-0.02 * L, 0.2 * L, 0.02 * L)], [(0, 1, 2)])

def _hb_rock_chunk(mat, r, loc, scale, seed, planes, sub=2, jitter=0.3, freq=1.6):
    """Jittered icosphere cut flat by planes [(point, outward normal)] -> faceted rock block."""
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for vt in bm.verts:
        nn = vt.co.normalized()
        vt.co *= 1 + jitter * (noise.noise(nn * freq + off) * 1.4 + noise.noise(nn * freq * 2.7 + off) * 0.5)
        vt.co = Vector((vt.co.x * scale[0], vt.co.y * scale[1], vt.co.z * scale[2])) + Vector(loc)
    for co, no in planes:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=Vector(co), plane_no=Vector(no).normalized(), clear_outer=True)
        edges = [e for e in bm.edges if e.is_boundary]
        if edges: bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    return _hb_bm_obj(mat, bm, 'rock')

def _hb_dock():
    """Wooden pier deck 4 m (Y) x 3 m (X), deck top at z = 0, piles reach 3.3 m down; tiles seamlessly along Y."""
    rnd = random.Random(11)
    for k in range(20):  # individual deck boards across the pier, a few weathered or slightly sunk
        sink = rnd.choice((0, 0, 0, 0.004, 0.007))
        _hb_rbox(rnd.choice(('wood', 'hb_wood_weather', 'hb_wood_weather', 'wood_grey')), (3.0, 0.186, 0.055 - sink), (0, -1.9 + k * 0.2, -0.055), b=0.01)
    for x in (-1.0, -0.33, 0.33, 1.0): box('wood_dark', (0.1, 4.0, 0.15), (x, 0, -0.205))  # joists
    for sx in (-1, 1):
        _hb_rbox('wood_dark', (0.1, 4.0, 0.3), (sx * 1.45, 0, -0.355), b=0.015)  # fascia / edge beam
        for y in (-1.5, 1.5):
            for z0, z1, m in ((-3.3, -1.5, 'hb_slime'), (-1.5, -0.95, 'hb_pile_wet'), (-0.95, -0.45, 'wood_dark')):
                cyl(m, 0.15, z1 - z0, (sx * 1.25, y, z0), 10, cap=m != 'wood_dark')
            for dz in (-0.27, -0.13):  # through-bolts on the fascia
                cyl('iron', 0.025, 0.02, (sx * 1.5, y, dz - 0.03), 6, rot=(0, sx * math.pi / 2, 0))
            # tyre fender hung on the fascia
            torus('rubber', 0.27, 0.1, (sx * 1.6, y, -0.66), rot=(0, math.pi / 2, 0), seg=10, rseg=5)
            rod('rope', (sx * 1.56, y, -0.4), (sx * 1.53, y, -0.12), 0.015, 4)
        # cross bracing between the piles along the pier
        rod('wood_dark', (sx * 1.25, -1.45, -0.55), (sx * 1.25, 1.45, -2.0), 0.05, 4)
        rod('wood_dark', (sx * 1.25, 1.45, -0.55), (sx * 1.25, -1.45, -2.0), 0.05, 4)
    for y in (-1.5, 1.5):
        _hb_rbox('wood_dark', (2.8, 0.22, 0.24), (0, y, -0.52), b=0.015)  # pile caps
        rod('wood_dark', (-1.2, y, -0.6), (1.2, y, -1.9), 0.045, 4)

@model('dock_straight', '桟橋(直線4m・D1)', '岸壁モジュール')
def dock_straight(): _hb_dock()

@model('dock_end', '桟橋の先端(D4・係船柱付き)', '岸壁モジュール')
def dock_end():
    _hb_dock()
    _hb_bollard((0.9, -1.45, 0), 1.0, seg=10, bolts=4, streaks=False); _hb_bollard((-0.9, -1.45, 0), 1.0, seg=10, bolts=4, streaks=False)
    _hb_rbox('wood_dark', (3.0, 0.15, 0.18), (0, -1.925, 0), b=0.02)  # end kerb
    for x in (-1.3, 0, 1.3): cyl('iron', 0.022, 0.012, (x, -2.0, 0.08), 6, rot=(math.pi / 2, 0, 0))

def _hb_prof_r(prof, z):
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        if z0 <= z <= z1: return r0 + (r1 - r0) * (z - z0) / max(z1 - z0, 1e-6)
    return prof[-1][0]

def _hb_bollard(loc, s=1.0, rope=False, seg=16, bolts=6, rz=0.0, streaks=True):
    """Cast-iron mooring post on a bolted flange: rusty foot, rope-polished head, rust streaks."""
    foot = [(0.25, 0.0), (0.25, 0.035), (0.205, 0.05), (0.165, 0.065), (0.145, 0.1)]
    body = [(0.145, 0.1), (0.13, 0.17), (0.125, 0.3), (0.127, 0.42), (0.145, 0.5), (0.2, 0.548), (0.235, 0.572), (0.235, 0.622)]
    cap = [(0.235, 0.622), (0.205, 0.652), (0.11, 0.672), (0.0, 0.678)]
    with xf(loc, rz=rz, s=s):
        _hb_lathe('hb_iron_rust', foot, seg, caps=False); _hb_lathe('iron', body, seg, caps=False); _hb_lathe('hb_iron_worn', cap, seg, caps=False)
        for k in range(bolts):
            a = (k + 0.5) / bolts * math.tau
            cyl('hb_iron_rust', 0.024, 0.028, (0.215 * math.cos(a), 0.215 * math.sin(a), 0.03), 6)
        for a0, z0, z1 in ((0.5, 0.2, 0.52), (2.3, 0.26, 0.53), (4.0, 0.15, 0.52)) if streaks else ():  # rust streaks running down from the head
            v, f = [], []
            for i in range(4):
                z = z1 - (z1 - z0) * i / 3; w = 0.05 * (1 - i / 4.5); r = _hb_prof_r(body, z) + 0.004
                for da in (-w, 0, w): v.append((r * math.cos(a0 + da / r), r * math.sin(a0 + da / r), z))
            for i in range(3):
                for j in range(2): f.append((i * 3 + j, i * 3 + j + 1, (i + 1) * 3 + j + 1, (i + 1) * 3 + j))
            mesh('hb_iron_rust', v, f)
        if rope:  # mooring line: two and a half turns round the neck, both ends led off to the front
            rr, pts = 0.125 + 0.032, []
            pts += [(0.07, -0.215, 0.03), (0.05, -0.205, 0.07), (0.03, -0.19, 0.13), (0.02, -0.18, 0.2)]
            n = 40
            for i in range(n + 1):
                t = i / n; a = -math.pi / 2 + 0.12 + t * 2.5 * math.tau
                pts.append((rr * math.cos(a) * (1 + 0.04 * math.sin(t * 9)), rr * math.sin(a), 0.24 + t * 0.17))
            pts += [(-0.07, -0.19, 0.36), (-0.1, -0.22, 0.22), (-0.11, -0.215, 0.1), (-0.14, -0.22, 0.04), (-0.19, -0.215, 0.03)]
            _hb_tube('rope', pts, 0.03, 6)
            for p, q in (((0.07, -0.215, 0.03), (0.1, -0.215, 0.03)), ((-0.19, -0.215, 0.03), (-0.22, -0.21, 0.03))):
                rod('hb_rope_white', p, q, 0.031, 6)  # whipped ends

@model('bollard', '係船柱(ビット)', '港の小物')
def bollard(): _hb_bollard((0, 0, 0), 1.3, rope=True)

@model('tire_fender', '防舷タイヤ', '港の小物')
def tire_fender():
    """Old truck tyre hung on the quay wall: lugged tread worn grey, two rope slings to a wall plate."""
    side_a = [(0.235, -0.085), (0.29, -0.13), (0.38, -0.145), (0.455, -0.135), (0.495, -0.105)]
    tread = [(0.495, -0.105), (0.507, -0.05), (0.507, 0.05), (0.495, 0.105)]
    side_b = [(0.495, 0.105), (0.455, 0.135), (0.38, 0.145), (0.29, 0.13), (0.235, 0.085), (0.222, 0.0), (0.235, -0.085)]
    rot = (math.pi / 2, 0, 0); c = (0, 0, 0.36)
    _hb_lathe('rubber', side_a, 28, c, rot, caps=False); _hb_lathe('rubber', side_b, 28, c, rot, caps=False)
    _hb_lathe('hb_rubber_worn', tread, 28, c, rot, caps=False, bump=lambda i, k: 0.022 if k in (1, 2) and (i + (k == 2)) % 2 == 0 else 0.0)
    for sy in (-1, 1): torus('hb_rubber_worn', 0.4, 0.009, (0, sy * 0.143, 0.36), rot=(math.pi / 2, 0, 0), seg=28, rseg=3)  # sidewall ring
    for x in (-0.13, 0.13):
        pts = [(x * 0.6, 0.15, 1.0), (x, 0.16, 0.9)]
        for i in range(13):
            th = -i / 12 * math.tau
            pts.append((x, 0.162 * math.cos(th), 0.725 + 0.162 * math.sin(th)))
        pts += [(x, 0.168, 0.86), (x * 0.75, 0.165, 0.96), (x * 0.5, 0.155, 1.0)]
        _hb_tube('hb_rope_blue', pts, 0.019, 6)
    _hb_rbox('steel_dark', (0.34, 0.025, 0.12), (0, 0.172, 0.9), b=0.008)
    for x in (-0.12, 0.12): cyl('hb_iron_rust', 0.018, 0.02, (x, 0.16, 1.0), 6, rot=(math.pi / 2, 0, 0))

@model('quay_ladder', '岸壁のはしご', '港の小物')
def quay_ladder():
    """Steel quay ladder: yellow above the tide, rust and weed below, wall stand-offs, grab rails over the edge."""
    def zm(z): return 'hb_slime' if z < -1.75 else 'hb_iron_rust' if z < -1.1 else 'hb_paint_yellow'
    Y = -0.12
    for sx in (-1, 1):
        x = sx * 0.22
        for z0, z1 in ((-2.6, -1.75), (-1.75, -1.1), (-1.1, 0.0)):
            cyl(zm(z0), 0.028, z1 - z0, (x, Y, z0), 8, cap=z0 < -2.5)
        pts = [(x, Y, 0.0), (x, Y, 0.55)]
        for i in range(9):
            t = i / 8 * math.pi; pts.append((x, Y + 0.2 - 0.2 * math.cos(t), 0.62 + 0.25 * math.sin(t)))
        pts += [(x, 0.28, 0.45), (x, 0.28, 0.015)]
        _hb_tube('hb_paint_yellow', pts, 0.028, 8)
        _hb_rbox('hb_paint_yellow', (0.08, 0.13, 0.014), (x, 0.28, 0), b=0.004)
        for dy in (-0.045, 0.045): cyl('iron', 0.012, 0.02, (x, 0.28 + dy, 0.0), 6)
        for z in (-2.15, -1.25, -0.35):  # stand-off brackets bolted to the wall
            m = zm(z)
            _hb_rbox(m, (0.05, 0.11, 0.05), (x, -0.06, z - 0.025), b=0.006)
            _hb_rbox(m, (0.09, 0.016, 0.17), (x - sx * 0.01, -0.008, z - 0.085), b=0.004)
            for dx in (-0.03, 0.03): cyl('iron', 0.012, 0.015, (x + dx, -0.016, z + 0.05), 6, rot=(math.pi / 2, 0, 0))
    for k in range(8):
        z = -2.4 + k * 0.3
        _hb_rbox(zm(z), (0.44, 0.032, 0.032), (0, Y, z - 0.016), b=0.008)
    rnd = random.Random(3)
    for k in range(9):  # barnacles round the lowest rungs
        sx = rnd.choice((-1, 1))
        ico('hb_barnacle', 0.022, (sx * 0.22 + rnd.uniform(-0.02, 0.02), Y - 0.02, rnd.uniform(-2.55, -1.9)), (1, 0.8, 1), 1)

@model('tetrapod', 'テトラポッド(消波ブロック)', '岸壁モジュール')
def tetrapod():
    """Wave-breaking block: tapered legs with chamfered, weathered tips, lifting loops on the top leg."""
    c = Vector((0, 0, 1.0))
    dirs = [Vector((0, 0, 1)), Vector((0.943, 0, -0.333)), Vector((-0.471, 0.816, -0.333)), Vector((-0.471, -0.816, -0.333))]
    body = [(0.62, 0.0), (0.6, 0.45), (0.53, 0.85), (0.44, 1.22), (0.405, 1.34)]
    tip = [(0.405, 1.34), (0.37, 1.42), (0.33, 1.45), (0.0, 1.46)]
    for k, d in enumerate(dirs):
        rot = d.to_track_quat('Z', 'Y').to_euler()
        _hb_lathe('concrete', body, 16, c, rot, caps=False)
        _hb_lathe('hb_concrete_stain' if k else 'hb_concrete_dark', tip, 16, c, rot, caps=False)
        # mould parting seam along the leg
        _hb_tube('concrete', [c + d * t + d.orthogonal().normalized() * (r + 0.004) for r, t in ((0.58, 0.5), (0.49, 1.0), (0.41, 1.32))], 0.012, 3)
    ico('concrete', 0.66, c, sub=2)
    for sx in (-1, 1): torus('hb_iron_rust', 0.07, 0.013, (sx * 0.12, 0, 2.46), rot=(math.pi / 2, 0, 0), seg=10, rseg=4)

def _hb_rrect(w, d, c, z):
    hw, hd = w / 2, d / 2
    return [Vector(p) for p in ((-hw + c, -hd, z), (hw - c, -hd, z), (hw, -hd + c, z), (hw, hd - c, z), (hw - c, hd, z), (-hw + c, hd, z), (-hw, hd - c, z), (-hw, -hd + c, z))]

def _hb_crate(loc, rz=0.0, label=None, content=False, seed=0):
    """Blue plastic fish box (トロ箱): tapered walls, rolled rim, hand slots, ribs, embossed co-op name."""
    with xf(loc, rz=rz):
        loft('crate_blue', [_hb_rrect(0.56, 0.36, 0.04, 0.0), _hb_rrect(0.6, 0.4, 0.045, 0.235), _hb_rrect(0.632, 0.432, 0.05, 0.242),
                            _hb_rrect(0.632, 0.432, 0.05, 0.28), _hb_rrect(0.576, 0.376, 0.04, 0.28), _hb_rrect(0.536, 0.336, 0.035, 0.03)])
        for sx in (-1, 1):
            box('hb_shadow', (0.012, 0.15, 0.04), (sx * 0.292, 0, 0.17))
            for x in (-0.17, 0.0, 0.17): box('crate_blue', (0.03, 0.014, 0.2), (x, sx * 0.186, 0.025), rot=(-sx * 0.085, 0, 0))
        if label:
            with xf((0, -0.196, 0.08), rx=0.085): text3d('ink_white', label, 0.085, (0, -0.004, 0.0), depth=0.004)
        if content:
            rnd = random.Random(seed)
            box('hb_ice', (0.52, 0.32, 0.02), (0, 0, 0.175))
            for k in range(4): _hb_fish((rnd.uniform(-0.1, 0.1), -0.11 + k * 0.075, 0.2 + k * 0.006), 0.3, rnd.uniform(-0.25, 0.25) + (k % 2) * math.pi,
                                        'hb_fish_red' if seed % 2 and k == 1 else 'hb_fish', curl=rnd.uniform(-0.15, 0.15))
            for k in range(3): ico('hb_ice', 0.03, (rnd.uniform(-0.22, 0.22), rnd.uniform(-0.13, 0.13), 0.2), (1.2, 1, 0.6), 1)

@model('crates_blue', '魚箱(青・積み重ね)', '港の小物')
def crates_blue():
    rnd = random.Random(5)
    for i in range(2):
        for j in range(2):
            n = 1 + (i + j * 2) % 3
            for k in range(n):
                _hb_crate(((i - 0.5) * 0.66 + rnd.uniform(-0.015, 0.015), (j - 0.5) * 0.46 + rnd.uniform(-0.01, 0.01), k * 0.28), rnd.uniform(-0.05, 0.05),
                          label='海凪' if (i, j, k) == (1, 0, 0) else None, content=k == n - 1 and n == 1, seed=i + j)

def _hb_styro(loc, rz=0.0, mat='styro', tape='hb_tape', label=None, lmat='ink_red', sticker=False, lid=(0, 0, 0), content=False):
    """Styrofoam fish box: rounded edges, grip grooves, stepped lid, packing tape, printed name / paper label."""
    with xf(loc, rz=rz):
        _hb_rbox(mat, (0.7, 0.45, 0.255), (0, 0, 0), 0.018)
        for sx in (-1, 1): box('hb_styro_dirty', (0.008, 0.26, 0.028), (sx * 0.349, 0, 0.17))
        if content:
            box('hb_ice', (0.62, 0.37, 0.01), (0, 0, 0.25))
            for k in range(2): _hb_fish((0.05 - k * 0.12, -0.07 + k * 0.13, 0.27), 0.36, 0.2 + k * math.pi, 'hb_fish_red', curl=0.1)
        with xf((lid[0], lid[1], 0.255 + (0.012 if content else 0)), rz=lid[2]):
            _hb_rbox(mat, (0.72, 0.47, 0.03), (0, 0, 0), 0.012); _hb_rbox(mat, (0.6, 0.35, 0.012), (0, 0, 0.03), 0.005)
        if tape and not content:
            box(tape, (0.05, 0.352, 0.002), (0, 0, 0.297))
            for sy in (-1, 1):
                box(tape, (0.05, 0.064, 0.002), (0, sy * 0.206, 0.285)); box(tape, (0.05, 0.003, 0.15), (0, sy * 0.2365, 0.136))
        if sticker:
            box('paper', (0.17, 0.004, 0.1), (0.19, -0.226, 0.06)); box('ink_red', (0.12, 0.005, 0.012), (0.19, -0.2265, 0.13)); box('ink', (0.1, 0.005, 0.008), (0.19, -0.2265, 0.09))
        if label: text3d(lmat, label, 0.13, (-0.08, -0.2295, 0.12), depth=0.004)

@model('styro_boxes', '発泡スチロール箱', '港の小物')
def styro_boxes():
    rnd = random.Random(8); P_ = 0.297
    for i in range(3):
        n = 3 - i % 2
        for k in range(n):
            top = k == n - 1
            _hb_styro(((i - 1) * 0.74 + rnd.uniform(-0.015, 0.015), rnd.uniform(-0.015, 0.015), k * P_), rnd.uniform(-0.04, 0.04),
                      mat='hb_styro_dirty' if k == 0 else 'styro', tape=('hb_tape', 'hb_tape_blue', None)[(i + k) % 3],
                      label='鮮魚' if (i, k) == (0, 0) else None, lmat='ink_red',
                      sticker=(i, k) in ((1, 0), (2, 0), (2, 1)), lid=(0.05, -0.02, 0.1) if (i == 1 and top) else (0, 0, 0), content=i == 1 and top)

@model('pallet', 'パレット', '港の小物')
def pallet():
    """T11 wooden pallet (1.1 m square): 7 top boards, stringer boards, 9 blocks, 3 bottom runners, nails, painted corners."""
    rnd = random.Random(4)
    for k in range(7):
        y = -0.5 + k * (1.0 / 6); L = 1.1 if k != 5 else 0.96
        _hb_rbox(rnd.choice(('wood', 'wood', 'hb_wood_weather', 'wood_grey')), (L, 0.1, 0.02), ((1.1 - L) / 2, y, 0.122), b=0.005,
                 rot=(0, 0.012 if k == 2 else 0, 0))
        for x in (-0.5, 0.0, 0.5): cyl('iron', 0.006, 0.002, (x, y, 0.142), 4)
    for x in (-0.5, 0.0, 0.5):
        _hb_rbox('wood', (0.1, 1.1, 0.022), (x, 0, 0.1), b=0.005)
        _hb_rbox('hb_wood_weather', (0.1, 1.1, 0.02), (x, 0, 0.0), b=0.005)
        for y in (-0.5, 0.0, 0.5):
            corner = abs(x) > 0.1 and abs(y) > 0.1
            _hb_rbox('hb_paint_blue' if corner else 'wood_dark', (0.1, 0.1, 0.08), (x, y, 0.02), b=0.006)

@model('handcart', '台車(リヤカー)', '港の小物')
def handcart():
    # リヤカー: tubular steel frame with a plywood deck and low pipe sides, two spoked wheels on a cranked axle,
    # a looped draw-bar in front and a prop leg; a folded blue tarp and rope on the deck
    zb = 0.45
    def frame(pts, r=0.018): _pv_tube('cloth_grey', pts, r, 6, cap=False)
    frame([(-0.5, -0.8, zb), (0.5, -0.8, zb), (0.5, 0.8, zb), (-0.5, 0.8, zb), (-0.5, -0.8, zb)], 0.02)
    for y in (-0.4, 0.0, 0.4): rod('cloth_grey', (-0.5, y, zb), (0.5, y, zb), 0.014, 6)
    _pv_rbox('wood_light', (0.98, 1.58, 0.025), (0, 0, zb + 0.01), 0.008)
    for k in range(5): box('wood_frame', (0.004, 1.55, 0.003), (-0.4 + k * 0.2, 0, zb + 0.035))
    for sx in (-1, 1):   # low pipe sides with posts
        frame([(sx * 0.5, -0.8, zb), (sx * 0.5, -0.8, zb + 0.22), (sx * 0.5, 0.8, zb + 0.22), (sx * 0.5, 0.8, zb)], 0.016)
        for y in (-0.4, 0.0, 0.4): rod('cloth_grey', (sx * 0.5, y, zb), (sx * 0.5, y, zb + 0.22), 0.012, 4)
        _pv_wheel((sx * 0.64, 0.1, 0.3), 0.3, 0.045, rim='pv_chrome', seg=20, spokes=12, hub='metal')
        _pv_tube('cloth_grey', [(sx * 0.5, 0.1, zb), (sx * 0.56, 0.1, 0.36), (sx * 0.62, 0.1, 0.3)], 0.02, 6)          # axle drop
        with xf((sx * 0.64, 0.1, 0.3), ry=math.pi / 2):
            _pv_shell('cloth_grey', [(0.35, -0.035, 0.9), (0.355, 0.0, 0.9), (0.35, 0.035, 0.9)], seg=8, t=0.005, a_mid=math.pi)   # mudguard
    frame([(-0.5, 0.8, zb + 0.22), (0.5, 0.8, zb + 0.22)], 0.016); frame([(-0.5, -0.8, zb + 0.22), (0.5, -0.8, zb + 0.22)], 0.016)
    # draw-bar loop
    _pv_tube('cloth_grey', [(-0.42, -0.8, zb), (-0.42, -1.2, zb + 0.18), (-0.38, -1.5, zb + 0.33), (-0.2, -1.6, zb + 0.36), (0.2, -1.6, zb + 0.36),
                            (0.38, -1.5, zb + 0.33), (0.42, -1.2, zb + 0.18), (0.42, -0.8, zb)], 0.022, 8)
    _pv_tube('black', [(-0.18, -1.6, zb + 0.36), (0.18, -1.6, zb + 0.36)], 0.03, 8)                                    # grip
    rod('cloth_grey', (-0.42, -1.1, zb + 0.14), (0.42, -1.1, zb + 0.14), 0.014, 6)
    _pv_tube('cloth_grey', [(0, -0.8, zb), (0, -0.85, 0.2), (0, -0.82, 0.02)], 0.016, 6); _pv_rbox('rubber', (0.08, 0.06, 0.02), (0, -0.82, 0.0), 0.006)
    # load
    _pv_rbox('tarp_blue', (0.8, 0.5, 0.1), (0.0, 0.35, zb + 0.035), 0.04, segs=2)
    _pv_rbox('tarp_blue', (0.76, 0.46, 0.08), (0.02, 0.33, zb + 0.135), 0.035, segs=2)
    torus('rope', 0.14, 0.03, (0.2, -0.4, zb + 0.07), seg=14, rseg=5)
    torus('rope', 0.12, 0.026, (0.22, -0.38, zb + 0.12), seg=14, rseg=5)

@model('forklift', 'フォークリフト', '港の小物')
def forklift():
    # 1.5 t counterbalance forklift: rounded orange body and counterweight with warning stripes, seat, steering, levers,
    # overhead guard with lamps and an amber beacon, two-stage mast with lift cylinder, chains, carriage, backrest and forks
    O = 'orange'
    _pv_rbox(O, (1.06, 1.3, 0.62), (0, 0.15, 0.3), 0.06, segs=2)                                         # main body
    _pv_rbox(O, (1.1, 0.5, 0.88), (0, 0.85, 0.25), 0.12, segs=2)                                        # counterweight
    for k in range(5):                                                                                   # stripes on the counterweight
        x = -0.4 + k * 0.2
        box('black', (0.07, 0.01, 0.2), (x, 1.104, 0.38), (0, 0.6, 0))
    _pv_rbox('steel_dark', (0.98, 0.9, 0.08), (0, 0.15, 0.92), 0.03)                                   # hood
    _pv_rbox('black', (0.9, 0.08, 0.2), (0, 0.62, 0.95), 0.03)
    for sx in (-1, 1):
        _pv_wheel((sx * 0.5, -0.38, 0.3), 0.3, 0.2, rim='yellow', seg=16, lugs=6, side=sx)
        _pv_wheel((sx * 0.48, 0.72, 0.24), 0.24, 0.17, rim='yellow', seg=14, lugs=5, side=sx)
        with xf((sx * 0.5, -0.38, 0.3), ry=math.pi / 2):
            _pv_shell(O, [(0.34, -0.11, 1.0), (0.35, 0.0, 1.0), (0.34, 0.11, 1.0)], seg=8, t=0.02, a_mid=math.pi)    # front fenders
        _pv_rbox('pv_tail_light', (0.1, 0.02, 0.08), (sx * 0.4, 1.1, 0.95), 0.01)
    # seat, steering, levers
    _pv_rbox('pv_seat', (0.5, 0.45, 0.1), (0, 0.3, 1.0), 0.04, segs=2)
    _pv_rbox('pv_seat', (0.5, 0.1, 0.45), (0, 0.53, 1.05), 0.04, segs=2, rot=(-0.15, 0, 0))
    _pv_rbox('steel_dark', (0.6, 0.3, 0.25), (0, -0.28, 0.9), 0.04)                                     # dash/cowl
    rod('steel_dark', (0, -0.25, 1.1), (0, -0.15, 1.42), 0.03, 8)
    torus('black', 0.15, 0.018, (0, -0.15, 1.42), rot=(-0.7, 0, 0), seg=16, rseg=5)
    for k in range(3):
        rod('steel_dark', (0.2 + k * 0.05, -0.35, 1.1), (0.2 + k * 0.05, -0.3, 1.32), 0.009, 4); ico('black', 0.022, (0.2 + k * 0.05, -0.3, 1.33), sub=1)
    # overhead guard
    gz = 2.1
    for sx in (-1, 1):
        _pv_tube('steel_dark', [(sx * 0.45, -0.3, 0.9), (sx * 0.45, -0.4, 1.4), (sx * 0.45, -0.5, gz)], 0.035, 6)
        _pv_tube('steel_dark', [(sx * 0.45, 0.85, 1.1), (sx * 0.45, 0.65, gz)], 0.035, 6)
        _pv_tube('steel_dark', [(sx * 0.47, -0.52, gz), (sx * 0.47, 0.68, gz)], 0.035, 6)
        with xf((sx * 0.45, -0.45, 1.75), rx=math.pi / 2):  # work lamps on the front posts
            cyl('black', 0.06, 0.08, (0, 0, -0.02), 10); cyl('lamp', 0.05, 0.01, (0, 0, -0.03), 10)
        _pv_rbox('black', (0.05, 0.12, 0.08), (sx * 0.55, -0.48, 1.95), 0.012)                      # mirrors
    for k in range(6): box('steel_dark', (0.96, 0.05, 0.04), (0, -0.5 + k * 0.23, gz - 0.02))
    cyl('steel_dark', 0.06, 0.04, (0.3, 0.55, gz + 0.02), 10); _pv_lathe('pv_amber', [(0.05, 0), (0.05, 0.08), (0.035, 0.12), (0, 0.13)], (0.3, 0.55, gz + 0.06), seg=10)
    # mast: outer + inner channels, cross ties, tilt cylinders, lift cylinder, chains
    my = -0.7
    for sx in (-1, 1):
        _pv_rbox('steel_dark', (0.09, 0.12, 2.2), (sx * 0.34, my, 0.12), 0.015)
        _pv_rbox('metal', (0.07, 0.09, 2.25), (sx * 0.27, my - 0.06, 0.2), 0.012)
        rod('steel_dark', (sx * 0.4, -0.2, 0.75), (sx * 0.38, my + 0.05, 1.0), 0.04, 8)
        rod('pv_chrome', (sx * 0.38, my + 0.05, 1.0), (sx * 0.38, my + 0.0, 1.06), 0.022, 6)
        box('black', (0.03, 0.02, 1.7), (sx * 0.15, my - 0.06, 0.6))
        _pv_rbox('black', (0.08, 0.08, 0.06), (sx * 0.38, -0.2, 0.72), 0.01)
    for z in (0.15, 1.2, 2.25): box('steel_dark', (0.76, 0.1, 0.08), (0, my + 0.01, z))
    cyl('steel_dark', 0.055, 1.4, (0, my + 0.04, 0.2), 10); cyl('pv_chrome', 0.035, 0.6, (0, my + 0.04, 1.6), 8)
    torus('steel_dark', 0.06, 0.025, (0, my - 0.06, 2.22), rot=(0, math.pi / 2, 0), seg=10, rseg=4)
    # carriage, backrest, forks
    cy = my - 0.13
    for z in (0.12, 0.48): _pv_rbox('steel_dark', (0.95, 0.06, 0.1), (0, cy, z), 0.015)
    for k in range(7): box('steel_dark', (0.03, 0.03, 0.75), (-0.42 + k * 0.14, cy, 0.55))
    box('steel_dark', (0.95, 0.04, 0.04), (0, cy, 1.28))
    for sx in (-1, 1):
        box('steel_dark', (0.12, 0.05, 0.6), (sx * 0.27, cy - 0.04, 0.05))
        mesh('steel_dark', [(sx * 0.27 + dx, y, z) for y, zt in ((cy - 0.06, 0.065), (cy - 1.15, 0.025)) for dx in (-0.06, 0.06) for z in (0.02, zt)],
             [(0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6)])
    _pv_rbox('rubber', (0.6, 0.1, 0.06), (0, -0.62, 0.35), 0.02)                                        # step

@model('keitora', '軽トラック(白)', '乗り物')
def keitora():
    # Japanese kei truck (cab-over, 1.48 x 3.3 m): rounded cab with a raked windscreen, door windows, mirrors and wipers,
    # round headlamps in the front panel, yellow kei plate, steel wheels with hub caps, a flat bed with three drop sides
    # (あおり) and a pipe headboard guard (鳥居), tail lamps, chassis rails, fuel tank and exhaust underneath.
    W = 0.7   # half width of the body
    side = [(-1.6, 0.5), (-1.63, 0.62), (-1.635, 0.98), (-1.58, 1.07), (-1.34, 1.63), (-1.24, 1.7), (-0.64, 1.71), (-0.57, 1.66), (-0.555, 0.5)]
    rings = []
    for x, ins in ((-W, 0.035), (-W + 0.012, 0.01), (-W + 0.035, 0.0), (W - 0.035, 0.0), (W - 0.012, 0.01), (W, 0.035)):
        cy, cz = -1.1, 1.1
        rings.append([(x, cy + (y - cy) * (1 - ins / 0.55), cz + (z - cz) * (1 - ins / 0.6)) for y, z in side])
    loft('pv_paint_white', rings)
    # glass: windscreen, door windows, rear window
    a = math.atan2(1.34 - 1.58, 1.63 - 1.07)
    with xf((0, -1.565, 1.09), rx=a):
        _pv_rbox('glass', (1.22, 0.02, 0.56), (0, -0.004, 0), 0.02)
        for sx in (-1, 1):
            rod('black', (sx * 0.05, -0.016, 0.03), (sx * 0.5, -0.016, 0.06), 0.008, 4)                    # wipers
    for sx in (-1, 1):
        prism('glass', [(-1.5, 1.12), (-0.66, 1.12), (-0.66, 1.62), (-1.24, 1.62)], 0.02, loc=(sx * (W - 0.002), 0, 0), axis='X')
        prism('pv_paint_white', [(-1.48, 1.08), (-0.6, 1.08), (-0.6, 1.1), (-1.48, 1.1)], 0.03, loc=(sx * (W + 0.005), 0, 0), axis='X')   # belt line
        # door shut lines, handle, mirror
        for p, q in (((-1.5, 1.08), (-1.58, 0.55)), ((-0.62, 1.08), (-0.62, 0.55)), ((-1.58, 0.55), (-0.62, 0.55))):
            rod('steel_dark', (sx * (W + 0.002), p[0], p[1]), (sx * (W + 0.002), q[0], q[1]), 0.005, 3)
        _pv_rbox('steel_dark', (0.025, 0.12, 0.035), (sx * (W + 0.008), -0.78, 0.98), 0.008)
        rod('black', (sx * W, -1.47, 1.15), (sx * (W + 0.07), -1.52, 1.2), 0.012, 4)
        _pv_rbox('black', (0.05, 0.11, 0.15), (sx * (W + 0.07), -1.5, 1.15), 0.015)
        _pv_rbox('glass', (0.09, 0.012, 0.12), (sx * (W + 0.07), -1.556, 1.165), 0.004)
        # round headlamp with a chrome bezel, amber indicator, front corner lamp
        with xf((sx * 0.48, -1.635, 0.8), rx=math.pi / 2):
            cyl('pv_chrome', 0.095, 0.02, (0, 0, -0.01), 14)
            cyl('lamp', 0.078, 0.02, (0, 0, -0.025), 14)
        _pv_rbox('pv_amber', (0.14, 0.03, 0.07), (sx * 0.5, -1.64, 0.63), 0.01)
        # wheels (front under the cab, rear under the bed)
        for y in (-1.05, 0.95):
            _pv_wheel((sx * 0.6, y, 0.28), 0.28, 0.165, rim='pv_chrome', seg=16, lugs=4, side=sx)
        # mud flap behind the front wheel, rear wheel-house liner
        box('rubber', (0.18, 0.015, 0.2), (sx * 0.6, -0.72, 0.18))
    # front panel: grille, badge, bumper, plate
    _pv_rbox('steel_dark', (0.62, 0.03, 0.14), (0, -1.645, 0.72), 0.015)
    for k in range(3): box('black', (0.58, 0.012, 0.012), (0, -1.66, 0.745 + k * 0.035))
    _pv_rbox('pv_chrome', (0.09, 0.012, 0.04), (0, -1.662, 0.9), 0.008)
    _pv_rbox('cloth_grey', (1.42, 0.12, 0.13), (0, -1.64, 0.4), 0.04, segs=2)
    _pv_rbox('pv_plate', (0.33, 0.012, 0.165), (0, -1.705, 0.42), 0.01)
    text3d('ink', '12', 0.07, (0, -1.712, 0.475), depth=0.006); box('ink', (0.08, 0.006, 0.022), (0, -1.712, 0.535))
    # chassis, fuel tank, exhaust
    for sx in (-1, 1): box('steel_dark', (0.08, 3.1, 0.12), (sx * 0.38, 0.0, 0.42))
    box('steel_dark', (0.9, 0.08, 0.1), (0, 0.95, 0.4)); box('steel_dark', (0.9, 0.08, 0.1), (0, -0.2, 0.42))
    _pv_rbox('black', (0.35, 0.45, 0.25), (-0.4, 0.25, 0.3), 0.05, segs=2)
    _pv_tube('metal', [(0.3, -0.4, 0.35), (0.3, 0.6, 0.3), (0.25, 1.3, 0.28), (0.25, 1.52, 0.28)], 0.03, 6)
    cyl('steel_dark', 0.13, 0.24, (-0.12, 0.95, 0.28), 10, rot=(0, math.pi / 2, 0))                                 # rear diff
    rod('steel_dark', (-0.6, 0.95, 0.28), (0.6, 0.95, 0.28), 0.035, 6)
    # flat bed and drop sides (あおり) with pressed ribs, hinges and latches
    bed_y0, bed_y1, bz = -0.47, 1.6, 0.64
    _pv_rbox('pv_paint_white', (1.42, bed_y1 - bed_y0, 0.06), (0, (bed_y0 + bed_y1) / 2, bz), 0.015)
    for k in range(9): box('cloth_grey', (0.012, bed_y1 - bed_y0 - 0.1, 0.012), (-0.6 + k * 0.15, (bed_y0 + bed_y1) / 2, bz + 0.06))
    for sx in (-1, 1):
        _pv_rbox('pv_paint_white', (0.04, bed_y1 - bed_y0, 0.3), (sx * 0.69, (bed_y0 + bed_y1) / 2, bz + 0.06), 0.012)
        for z in (0.12, 0.2, 0.28): box('cloth_grey', (0.012, bed_y1 - bed_y0 - 0.14, 0.018), (sx * 0.713, (bed_y0 + bed_y1) / 2, bz + z))
        for y in (0.0, 1.1): box('steel_dark', (0.02, 0.08, 0.06), (sx * 0.716, y, bz + 0.27))                      # latches
        for y in (-0.2, 0.55, 1.3): box('steel_dark', (0.02, 0.1, 0.04), (sx * 0.716, y, bz + 0.03))                 # hinges
        _pv_rbox('rubber', (0.24, 0.6, 0.03), (sx * 0.6, 0.95, 0.6), 0.01)                                          # rear wheel liners
    _pv_rbox('pv_paint_white', (1.42, 0.04, 0.3), (0, bed_y1 - 0.02, bz + 0.06), 0.012)
    for z in (0.12, 0.2, 0.28): box('cloth_grey', (1.3, 0.012, 0.018), (0, bed_y1 + 0.002, bz + z))
    # headboard guard (鳥居): pipe frame with bars
    gy = bed_y0 + 0.02
    for sx in (-1, 1): rod('cloth_grey', (sx * 0.66, gy, bz + 0.06), (sx * 0.66, gy, 1.66), 0.025, 6)
    rod('cloth_grey', (-0.68, gy, 1.66), (0.68, gy, 1.66), 0.025, 6); rod('cloth_grey', (-0.66, gy, 1.1), (0.66, gy, 1.1), 0.018, 6)
    for k in range(7): rod('cloth_grey', (-0.45 + k * 0.15, gy, bz + 0.36), (-0.45 + k * 0.15, gy, 1.66), 0.01, 4)
    _pv_rbox('pv_paint_white', (1.42, 0.04, 0.3), (0, gy, bz + 0.06), 0.012)
    # rear: tail lamp clusters, bumper step, plate
    for sx in (-1, 1):
        _pv_rbox('black', (0.2, 0.06, 0.11), (sx * 0.56, bed_y1 - 0.02, 0.5), 0.012)
        _pv_rbox('pv_tail_light', (0.1, 0.02, 0.08), (sx * 0.6, bed_y1 + 0.01, 0.515), 0.008)
        _pv_rbox('pv_amber', (0.06, 0.02, 0.08), (sx * 0.505, bed_y1 + 0.01, 0.515), 0.008)
    box('steel_dark', (1.3, 0.07, 0.07), (0, bed_y1 - 0.06, 0.4))
    _pv_rbox('pv_plate', (0.33, 0.012, 0.165), (0, bed_y1 + 0.005, 0.42), 0.01, rot=(0, 0, math.pi))
    text3d('ink', '12', 0.07, (0, bed_y1 + 0.016, 0.475), rz=math.pi, depth=0.006); box('ink', (0.08, 0.006, 0.022), (0, bed_y1 + 0.016, 0.535))
    # load: fish crates and a coil of rope
    for k in range(3): _pv_rbox('crate_blue', (0.6, 0.42, 0.3), (-0.33 + (k % 2) * 0.66, 0.25 + (k // 2) * 0.5, bz + 0.06), 0.02)
    torus('rope', 0.18, 0.035, (0.35, 1.2, bz + 0.1), seg=14, rseg=5)

def net_pile(loc, s=1.0, mat='net'):
    with xf(loc, s=s):
        ico(mat, 0.8, (0, 0, 0), (1.1, 0.9, 0.45), 2, 0.25, int(s * 10), flat_bottom=0)
        for k in range(5): ico('float_yellow' if k % 2 else 'float_orange', 0.1, (math.cos(k * 1.3) * 0.6, math.sin(k * 1.3) * 0.5, 0.25 + 0.05 * k), sub=1)

def float_cluster(loc, seed=0):
    rnd = random.Random(seed)
    with xf(loc):
        for k in range(6):
            ico(rnd.choice(['float_yellow', 'float_orange', 'float_white']), rnd.uniform(0.14, 0.22), (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 0.18 + k * 0.08), sub=2)
        rod('rope', (0, 0, 0), (0.1, 0.1, 0.7), 0.015, 4)

def _hb_heap_fn(a, b, H, seed, cx=0.0, cy=0.0):
    """Height field of a draped net heap: lumpy dome with ridged cloth folds and a wavy outline."""
    rnd = random.Random(seed)
    lumps = [(rnd.uniform(-0.4, 0.4) * a, rnd.uniform(-0.35, 0.35) * b, rnd.uniform(0.3, 0.5) * a, rnd.uniform(0.6, 1.0)) for _ in range(4)]
    folds = [(math.cos(t), math.sin(t), rnd.uniform(6, 13), rnd.uniform(0, 6), rnd.uniform(0.5, 1.0)) for t in (rnd.uniform(0, 3.14) for _ in range(5))]
    ph = rnd.uniform(0, 6)
    def R(th): return 1 + 0.1 * math.sin(3 * th + ph) + 0.06 * math.sin(5 * th + 2 * ph)
    def z(x, y):
        x -= cx; y -= cy
        th = math.atan2(y / b, x / a); q = math.hypot(x / a, y / b) / R(th)
        if q >= 1: return 0.0, q
        env = (1 - q * q) ** 0.8
        lump = sum(w * math.exp(-((x - lx) ** 2 + (y - ly) ** 2) / s ** 2) for lx, ly, s, w in lumps)
        fold = sum(w * (1 - abs(math.sin((x * dx + y * dy) * f + p))) ** 3 for dx, dy, f, p, w in folds)
        return H * env * (0.4 + 0.4 * lump) + 0.16 * H * fold * env ** 0.4, q
    return z, R

def _hb_heap_sheet(mat, zf, R, a, b, cx, cy, NR, NS, lift=None, skirt=True):
    v, f = [], []
    z0, _ = zf(cx, cy); v.append((cx, cy, z0 + (lift(0) if lift else 0)))
    for j in range(1, NR + 1):
        rho = j / NR
        for i in range(NS):
            th = i / NS * math.tau; k = R(th) * rho * (1 + 0.03 * math.sin(i * 2.7 + j))
            x, y = cx + a * k * math.cos(th) * 0.999, cy + b * k * math.sin(th) * 0.999
            z = zf(x, y)[0] + (lift(rho) if lift else 0)
            v.append((x, y, max(z, 0.0) if j < NR else (lift(1) if lift else 0) + zf(x, y)[0]))
    if skirt:
        for i in range(NS):
            th = i / NS * math.tau; k = R(th) * 1.05
            v.append((cx + a * k * math.cos(th), cy + b * k * math.sin(th), -0.015))
    rings = NR + (1 if skirt else 0)
    for i in range(NS):
        i2 = (i + 1) % NS; f.append((0, 1 + i, 1 + i2))
        for j in range(rings - 1):
            o0, o1 = 1 + j * NS, 1 + (j + 1) * NS
            f.append((o0 + i, o1 + i, o1 + i2, o0 + i2))
    return mesh(mat, v, f), v

@model('net_pile', '漁網の山', '港の小物')
def net_pile_m():
    """Gill net heaped on the quay: folded draped mass, a green net layered over it, float line and lead line."""
    a, b, H = 0.93, 0.78, 0.36
    zf, R = _hb_heap_fn(a, b, H, 12)
    _hb_heap_sheet('hb_net_heap', zf, R, a, b, 0, 0, 9, 30)
    # further folds of net slumped over the heap, each ending in a rolled hem
    layers = [lambda x, y: max(zf(x, y)[0], 0)]
    for cx, cy, a2, b2, sd, m, h in ((0.22, 0.15, 0.6, 0.46, 5, 'hb_net_heap2', 0.12), (-0.45, -0.18, 0.46, 0.4, 7, 'hb_net_heap', 0.1),
                                     (0.35, -0.3, 0.42, 0.32, 9, 'hb_net_heap2', 0.08)):
        zf2, R2 = _hb_heap_fn(a2, b2, h, sd, cx, cy)
        def z_top(x, y, zf2=zf2, below=tuple(layers)): return (max(L(x, y) for L in below) + zf2(x, y)[0] + 0.015, 0)
        o, v = _hb_heap_sheet(m, z_top, R2, a2, b2, cx, cy, 6, 22, skirt=False)
        hem = [Vector(p) + Vector((0, 0, 0.01)) for p in v[1 + 5 * 22: 1 + 6 * 22]]
        _hb_tube(m, hem + [hem[0]], 0.026, 4, cap=False)
        layers.append(lambda x, y, zf2=zf2, z_top=z_top: z_top(x, y)[0] if zf2(x, y)[1] < 1 else 0.0)
    def z_all(x, y): return max(L(x, y) for L in layers)
    # float line (head rope) snaking over the heap, floats threaded on it
    pts = []
    for i in range(34):
        t = i / 33; x = -0.95 + 1.75 * t; y = -0.62 + 0.9 * t + 0.28 * math.sin(t * 7.0)
        pts.append(Vector((x, y, z_all(x, y) + 0.025)))
    _hb_tube('rope', pts, 0.012, 4)
    for k in range(3, 33, 3):
        p, q = pts[k - 1], pts[k + 1]; d = (q - p).normalized()
        rod('float_orange' if k % 2 else 'float_yellow', pts[k] - d * 0.06 + Vector((0, 0, 0.02)), pts[k] + d * 0.06 + Vector((0, 0, 0.02)), 0.042, 8)
    # lead line along the front edge, with a loose tail of net on the ground
    lead = []
    for i in range(16):
        th = -math.pi * 0.95 + i / 15 * math.pi * 0.9; k = R(th) * 0.96
        x, y = a * k * math.cos(th), b * k * math.sin(th); lead.append((x, y, max(zf(x, y)[0], 0) + 0.018))
    _hb_tube('hb_net_dark', lead, 0.016, 4)
    for p in lead[2:15:3]: _hb_rbox('steel_dark', (0.05, 0.03, 0.03), (p[0], p[1], p[2] - 0.012), b=0.006)

def _hb_sphere(mat, r, loc, seg=10, rings=6, sq=1.0):
    return _hb_lathe(mat, [(r * math.sin(i / rings * math.pi), -r * sq * math.cos(i / rings * math.pi)) for i in range(rings + 1)], seg, loc)

def _hb_ear_float(loc, r, mat, rz=0.0):
    """Hard plastic net float with two moulded ears (耳付き浮き)."""
    with xf(loc, rz=rz):
        _hb_sphere(mat, r, (0, 0, 0)); torus(mat, r * 0.995, 0.008, (0, 0, 0), seg=10, rseg=3)
        for sx in (-1, 1): torus(mat, 0.032, 0.012, (sx * (r + 0.02), 0, 0), rot=(math.pi / 2, 0, 0), seg=8, rseg=3)

@model('floats', '浮き・ブイ', '港の小物')
def floats():
    """Marker buoy with pole, a heap of eared net floats strung on a rope, a netted glass float and a foam float."""
    with xf((0.42, 0.12, 0)):
        _hb_sphere('float_orange', 0.38, (0, 0, 0.38), 14, 9)
        torus('float_orange', 0.38, 0.012, (0, 0, 0.38), seg=14, rseg=3)
        cyl('float_white', 0.14, 0.03, (0, 0, 0.74), 10)
        cyl('steel_dark', 0.025, 0.3, (0, 0, 0.75), 6); torus('steel_dark', 0.04, 0.01, (0, 0, 1.07), rot=(math.pi / 2, 0, 0), seg=8, rseg=3)
        box('hb_iron_rust', (0.06, 0.06, 0.03), (0, 0, 0.0))
    eff = [((-0.5, -0.18, 0.15), 0.15, 'float_yellow', 0.3), ((-0.2, 0.22, 0.14), 0.14, 'float_orange', 1.2), ((-0.6, 0.28, 0.16), 0.16, 'float_yellow', 2.0),
           ((-0.42, 0.1, 0.42), 0.14, 'float_orange', 0.8), ((-0.15, -0.36, 0.13), 0.13, 'float_white', 2.6)]
    for loc, r, m, rz in eff: _hb_ear_float(loc, r, m, rz)
    # netted green glass float
    g = Vector((0.05, -0.12, 0.15)); _hb_sphere('hb_glass_green', 0.15, g, 12, 7)
    segs = []
    for k in range(4):
        a = k / 4 * math.pi
        segs += _hb_poly_segs([g + Vector((math.cos(a) * math.sin(t) * 0.158, math.sin(a) * math.sin(t) * 0.158, -math.cos(t) * 0.158)) for t in (i / 8 * math.pi for i in range(9))])
    segs += _hb_poly_segs([g + Vector((math.cos(t) * 0.16, math.sin(t) * 0.16, 0)) for t in (i / 12 * math.tau for i in range(13))])
    _hb_strands('rope', segs, 0.008)
    # styrofoam cylinder float lying in front
    rod('float_white', (-0.15, -0.46, 0.1), (0.3, -0.42, 0.1), 0.1, 12)
    rod('rope', (-0.2, -0.465, 0.1), (0.35, -0.415, 0.1), 0.014, 4)
    # rope stringing the floats together, trailing on the ground
    rope = [(0.35, -0.42, 0.1), (0.42, -0.4, 0.02), (0.6, -0.35, 0.02), (0.75, -0.2, 0.02), (0.78, 0.1, 0.02), (0.72, 0.38, 0.02), (0.45, 0.5, 0.015),
            (0.1, 0.42, 0.015), (-0.2 + 0.16, 0.22, 0.14), (-0.42 + 0.16, 0.12, 0.42), (-0.6 + 0.16, 0.3, 0.16), (-0.74, 0.12, 0.02), (-0.78, -0.12, 0.015),
            (-0.5 - 0.17, -0.2, 0.15), (-0.5, -0.35, 0.02), (-0.3, -0.42, 0.13), (-0.2, -0.45, 0.1)]
    _hb_tube('hb_rope_blue', rope, 0.013, 5)

def _hb_trap(loc, rz=0.0, bottom=True, seed=0):
    """Collapsible crab/octopus pot: two steel hoops, diamond-mesh netting, top net with entrance ring."""
    R, H, N = 0.45, 0.5, 9
    with xf(loc, rz=rz):
        for z in ((0.02, H) if bottom else (H,)): torus('steel_dark', R, 0.015, (0, 0, z), seg=10, rseg=3)
        segs = []
        for fam in (1, -1):
            for i in range(N):
                a0 = (i + 0.25 * seed) / N * math.tau; pts = []
                for s in range(3):
                    a = a0 + fam * (s % 2) * math.pi / N; rr = R * (1.05 if s == 1 else 1.0)
                    pts.append((rr * math.cos(a), rr * math.sin(a), 0.02 + s * (H - 0.02) / 2))
                segs += _hb_poly_segs(pts)
        for i in range(6):
            a = i / 6 * math.tau
            segs.append(((R * math.cos(a), R * math.sin(a), H), (0.11 * math.cos(a), 0.11 * math.sin(a), H + 0.04)))
        _hb_strands('hb_net_trap', segs, 0.01)
        torus('hb_rope_white', 0.11, 0.012, (0, 0, H + 0.04), seg=8, rseg=3)
        mesh('hb_net_dark', [(0.43 * math.cos(i / 10 * math.tau), 0.43 * math.sin(i / 10 * math.tau), 0.025) for i in range(10)], [tuple(range(10))])

@model('crab_traps', 'カゴ網(積み重ね)', '港の小物')
def crab_traps():
    rnd = random.Random(2); s = 0
    for i, n in ((0, 2), (1, 3), (2, 1)):
        for k in range(n):
            _hb_trap(((i - 1) * 1.0 + rnd.uniform(-0.02, 0.02), rnd.uniform(-0.02, 0.02), k * 0.53), rnd.uniform(0, 1), bottom=k == 0, seed=s); s += 1
    # a buoy line tied to the top pot and dropped to the ground
    pts = [(0.3, -0.33, 1.6), (0.4, -0.36, 1.45), (0.47, -0.3, 1.1), (0.5, -0.35, 0.7), (0.55, -0.42, 0.3), (0.6, -0.45, 0.03), (0.9, -0.47, 0.02), (1.2, -0.4, 0.02)]
    _hb_tube('hb_rope_blue', pts, 0.013, 4)
    _hb_ear_float((1.3, -0.33, 0.12), 0.12, 'float_orange', 0.4)

@model('rope_coil', 'ロープの束', '港の小物')
def rope_coil():
    """Mooring rope faked down: flat spiral base, three stacked turns, two blue ties, end led off across the top."""
    r, pts = 0.042, []
    for i in range(45):  # flat spiral on the ground
        t = i / 44; a = t * 2 * math.tau; rr = 0.16 + 0.22 * t
        pts.append((rr * math.cos(a), rr * math.sin(a), r))
    for i in range(1, 71):  # stacked turns
        t = i / 70; a = t * 3.1 * math.tau
        rr = 0.38 - 0.015 * t + 0.008 * math.sin(i * 1.3)
        pts.append((rr * math.cos(a), rr * math.sin(a), r + t * 3.1 * 0.082 + 0.004 * math.sin(i * 0.7)))
    e = Vector(pts[-1]); a = 3.1 * math.tau
    pts += [(0.2 * math.cos(a + 0.4), 0.2 * math.sin(a + 0.4), e.z + 0.02), (0.0, -0.08, e.z), (-0.12, -0.3, e.z - 0.02), (-0.18, -0.4, 0.2),
            (-0.2, -0.44, 0.08), (-0.12, -0.45, r), (0.05, -0.42, r)]
    _hb_tube('hb_rope_manila', pts, r, 6)
    rod('hb_rope_white', (0.05, -0.42, r), (0.1, -0.41, r), r * 1.02, 6)
    for a in (0.9, 3.9):  # ties holding the coil together
        c, rad = Vector((0.37 * math.cos(a), 0.37 * math.sin(a), 0)), Vector((math.cos(a), math.sin(a), 0))
        tie = [c + rad * (0.07 * math.cos(t)) + Vector((0, 0, 0.17 + 0.17 * math.sin(t))) for t in (i / 10 * math.tau for i in range(11))]
        _hb_tube('hb_rope_blue', tie, 0.012, 4, cap=False)

@model('market_tent', '青いテント(露店)', '港の小物')
def market_tent():
    """Aluminium-frame event tent: gabled blue canvas with sag, printed valance, weights and stays; folding tables of fish on ice."""
    w, d, E, Rz = 4.0, 3.0, 2.15, 2.62
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * w / 2, sy * d / 2
            box('alu', (0.045, 0.045, E), (x, y, 0)); box('black', (0.26, 0.26, 0.05), (x, y, 0))
            rod('alu', (x, y, E - 0.4), (x - sx * 0.4, y, E - 0.03), 0.014, 4); rod('alu', (x, y, E - 0.4), (x, y - sy * 0.4, E - 0.03), 0.014, 4)
            rod('hb_rope_white', (x, y, E - 0.05), (x + sx * 0.06, y + sy * 0.2, 0.02), 0.006, 4)
            cyl('steel_dark', 0.012, 0.12, (x + sx * 0.06, y + sy * 0.2, 0), 4)
        _hb_rbox('alu', (0.045, d, 0.05), (sx * w / 2, 0, E - 0.05), b=0.008)
    for sy in (-1, 1): _hb_rbox('alu', (w, 0.045, 0.05), (0, sy * d / 2, E - 0.05), b=0.008)
    for x in (-w / 2, 0, w / 2):
        for sy in (-1, 1): rod('alu', (x, sy * d / 2, E), (x, 0, Rz - 0.03), 0.02, 6)
    rod('alu', (-w / 2, 0, Rz - 0.03), (w / 2, 0, Rz - 0.03), 0.022, 6)
    # canvas: two sagging slopes, gable ends, valances (white with blue print on the front)
    ox, oy, NX, NY = w / 2 + 0.08, d / 2 + 0.12, 10, 3
    for sy in (-1, 1):
        v, f = [], []
        for j in range(NY + 1):
            for i in range(NX + 1):
                fx, fy = i / NX, j / NY; x = -ox + 2 * ox * fx; y = sy * oy * (1 - fy)
                z = E - 0.06 + (Rz - E + 0.06) * fy - 0.035 * abs(math.sin(math.pi * x / 2)) * math.sin(math.pi * min(1, fy * 1.15))
                v.append((x, y, z))
        for j in range(NY):
            for i in range(NX): f.append((j * (NX + 1) + i, j * (NX + 1) + i + 1, (j + 1) * (NX + 1) + i + 1, (j + 1) * (NX + 1) + i))
        mesh('tarp_blue', v, f)
        v = []
        for i in range(NX + 1):
            x = -ox + 2 * ox * i / NX; drop = 0.26 + 0.025 * math.cos(i * math.pi)
            v += [(x, sy * oy, E - 0.06), (x, sy * oy, E - 0.06 - drop)]
        mesh('cloth_white' if sy < 0 else 'tarp_blue', v, [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(NX)])
    for sx in (-1, 1): mesh('tarp_blue', [(sx * ox, -oy, E - 0.06), (sx * ox, oy, E - 0.06), (sx * ox, 0, Rz)], [(0, 1, 2)])
    text3d('blue', '朝市', 0.17, (0, -oy - 0.006, E - 0.19), depth=0.006)
    # folding tables with a cloth front, fish on ice in open styrofoam boxes
    for tx in (-0.92, 0.92):
        _hb_rbox('wood_light', (1.8, 0.62, 0.03), (tx, -0.75, 0.7), b=0.008)
        for lx in (-0.82, 0.82):
            for ly in (-0.27, 0.27): rod('alu', (tx + lx, -0.75 + ly, 0), (tx + lx, -0.75 + ly, 0.7), 0.014, 4)
    box('cloth_white', (3.7, 0.01, 0.42), (0, -1.07, 0.3)); box('cloth_navy', (3.7, 0.012, 0.06), (0, -1.071, 0.62))
    for k, x in enumerate((-1.35, -0.45, 0.45, 1.35)):
        with xf((x, -0.75, 0.73), rz=0.04 * (k - 1.5)):
            _hb_rbox('styro', (0.6, 0.42, 0.16), (0, 0, 0), 0.012); box('hb_ice', (0.54, 0.36, 0.01), (0, 0, 0.152))
            for j in range(2):
                _hb_fish((0.0, -0.07 + j * 0.14, 0.17), 0.34 if k % 2 else 0.26, (j % 2) * math.pi + 0.1, 'hb_fish_red' if k == 2 else 'hb_fish', curl=0.1 * (j - 1))
            box('paper', (0.12, 0.004, 0.08), (0.18, -0.215, 0.12)); box('ink_red', (0.08, 0.005, 0.02), (0.18, -0.2165, 0.16))
    _hb_crate((1.3, 0.75, 0), 0.1); _hb_crate((1.32, 0.75, 0.28), -0.05)
    _hb_rbox('steel_dark', (0.32, 0.32, 0.02), (-1.2, 0.5, 0.42), b=0.006)
    for lx in (-0.12, 0.12):
        for ly in (-0.12, 0.12): rod('alu', (-1.2 + lx, 0.5 + ly, 0), (-1.2 + lx * 0.8, 0.5 + ly * 0.8, 0.42), 0.012, 4)

# --- st helpers begin (street props)
def _st_ring(r, n, z, rot=0.0, cx=0.0, cy=0.0):
    return [(cx + r * math.cos(rot + i / n * math.tau), cy + r * math.sin(rot + i / n * math.tau), z) for i in range(n)]

def _st_lathe(mat, prof, n=12, loc=(0, 0, 0), rot=0.0, cap=True):
    """Surface of revolution from prof = [(r, z)] (bottom to top); n sides (6 = hexagonal stone), rot = start angle."""
    return loft(mat, [_st_ring(max(r, 1e-4), n, loc[2] + z, rot, loc[0], loc[1]) for r, z in prof], cap=cap)

def _st_kring(n, Rc, Rm, zc, zm, rot=0.0):
    """Ring of 2n points for an n-sided roof: corners (radius Rc, height zc) alternating with edge midpoints (Rm, zm)."""
    return [((Rc if i % 2 == 0 else Rm) * math.cos(rot + i * math.pi / n), (Rc if i % 2 == 0 else Rm) * math.sin(rot + i * math.pi / n),
             zc if i % 2 == 0 else zm) for i in range(2 * n)]

def _st_rrect(w, d, r, z, k=2, cx=0.0, cy=0.0):
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        for i in range(k + 1):
            a = math.radians(a0 + 90 * i / k)
            pts.append((cx + qx * (w / 2 - r) + r * math.cos(a), cy + qy * (d / 2 - r) + r * math.sin(a), z))
    return pts

def _st_rbox(mat, w, d, prof, k=2, cx=0.0, cy=0.0):
    """Box with rounded vertical edges lofted through prof = [(inset, corner radius, z)]."""
    rings = []
    for ins, r, z in prof:
        ww, dd = w - 2 * ins, d - 2 * ins
        rings.append(_st_rrect(ww, dd, min(r, min(ww, dd) / 2 - 0.001), z, k, cx, cy))
    return loft(mat, rings)

def _st_wavy(mat, x0, x1, z0, z1, y=0.0, t=0.012, amp=0.02, waves=1.5, n=10, phase=0.0):
    """Hanging cloth panel in the XZ plane rippling in Y (ripple grows away from x0, the pole side)."""
    def ring(z):
        f = []
        for i in range(n + 1):
            k = i / n
            f.append((x0 + (x1 - x0) * k, y + amp * k * math.sin(phase + k * waves * math.tau)))
        return [(x, yy - t / 2, z) for x, yy in f] + [(x, yy + t / 2, z) for x, yy in reversed(f)]
    return loft(mat, [ring(z0), ring(z1)])

def _st_chain(pts, z, seg=0.04, mats=('metal', 'steel_dark')):
    """Chain along a polyline [(x, y)] at height z: alternating short rods read as links."""
    k = 0
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, by - ay); n = max(1, round(L / seg))
        for i in range(n):
            t0, t1 = i / n, (i + 1) / n
            rod(mats[k % 2], (ax + (bx - ax) * t0, ay + (by - ay) * t0, z), (ax + (bx - ax) * t1, ay + (by - ay) * t1, z), 0.008 if k % 2 == 0 else 0.005, 4)
            k += 1

def _st_pot(mat, loc, r=0.16, h=0.28, n=10, rot=0.0):
    """Flower pot with a rolled rim and soil."""
    x, y, z = loc
    _st_lathe(mat, [(r * 0.78, 0), (r, h - 0.035), (r + 0.018, h - 0.035), (r + 0.018, h), (r - 0.01, h), (r - 0.012, h - 0.03)], n, (x, y, z), rot)
    cyl('soil', r - 0.012, 0.005, (x, y, z + h - 0.03), n, rot=(0, 0, rot))
# --- st helpers end
# ================================================================= street props
@model('utility_pole', '電柱(変圧器付き)', '道の小物')
def utility_pole():
    R = lambda z: 0.19 - 0.06 * z / 10.5
    cyl('concrete', 0.19, 10.5, (0, 0, 0), 14, r2=0.13); cyl('concrete', 0.13, 0.06, (0, 0, 10.5), 10, r2=0.07)
    for i in range(8):  # yellow/black guard sleeve
        z = 0.25 + i * 0.15; cyl('yellow' if i % 2 == 0 else 'black', R(z) + 0.008, 0.15, (0, 0, z), 14, cap=False)
    def insulator(x, y, z, s=1.0):
        _st_lathe('white', [(0.02 * s, 0), (0.06 * s, 0.03 * s), (0.06 * s, 0.05 * s), (0.035 * s, 0.07 * s), (0.05 * s, 0.1 * s), (0.05 * s, 0.12 * s), (0.02 * s, 0.15 * s)], 8, (x, y, z))
    for z, w, xs in ((9.7, 1.8, (-0.8, -0.4, 0.8)), (9.05, 1.5, (-0.65, 0.65))):  # cross-arms with pin insulators and braces
        box2('steel_dark', -w / 2, w / 2, -0.05, 0.05, z - 0.09, z)
        for sx in (-1, 1): rod('steel_dark', (sx * w * 0.32, 0, z - 0.09), (0, 0, z - 0.6), 0.015, 4)
        torus('steel_dark', R(z) + 0.01, 0.014, (0, 0, z - 0.05), seg=12, rseg=3)
        for x in xs: insulator(x, 0, z)
    with xf((0, 0.42, 6.85)):  # pole transformer
        cyl('st_trafo', 0.24, 0.8, (0, 0, 0), 14); cyl('st_trafo', 0.255, 0.04, (0, 0, -0.03), 14)
        cyl('st_trafo', 0.26, 0.05, (0, 0, 0.8), 14); cyl('st_trafo', 0.24, 0.06, (0, 0, 0.85), 14, r2=0.1)
        for k in range(7):
            a = math.pi * (0.12 + 0.76 * k / 6)
            box('st_trafo', (0.014, 0.05, 0.6), (0.26 * math.cos(a), 0.26 * math.sin(a), 0.1), (0, 0, a - math.pi / 2))
        box2('yellow', -0.08, 0.08, 0.235, 0.25, 0.45, 0.6); box2('white', -0.06, 0.06, 0.236, 0.252, 0.3, 0.38)
        for x in (-0.11, 0.11): insulator(x, 0, 0.9, 0.7)
    for z in (7.05, 7.5):
        box2('steel_dark', -0.04, 0.04, R(z) - 0.02, 0.2, z, z + 0.06); torus('steel_dark', R(z) + 0.01, 0.014, (0, 0, z + 0.03), seg=12, rseg=3)
    for sx in (-1, 1):  # cut-out switches and jumper wires up to the lower arm
        box('white', (0.06, 0.06, 0.24), (sx * 0.3, 0.12, 8.2)); box2('steel_dark', sx * 0.3 - 0.01, sx * 0.3 + 0.01, 0.0, 0.12, 8.3, 8.33)
        rod('black', (sx * 0.11, 0.42, 7.85), (sx * 0.3, 0.12, 8.2), 0.008, 3)
        rod('black', (sx * 0.3, 0.12, 8.44), (sx * 0.65, 0.0, 9.17), 0.008, 3)
    box2('steel_dark', -0.03, 0.03, R(5.5) - 0.02, 0.24, 5.45, 5.55)  # telecom closure
    rod('black', (-0.35, 0.26, 5.5), (0.35, 0.26, 5.5), 0.065, 8)
    for i, z in enumerate(frange(2.5, 8.6, 0.42)):  # step bolts
        s = 1 if i % 2 else -1
        rod('steel_dark', (s * R(z), 0, z), (s * (R(z) + 0.2), 0, z + 0.02), 0.012, 4)
    rod('alu', (0, R(0.1) + 0.02, 0.1), (0, R(6.8) + 0.02, 6.8), 0.016, 6)  # earth wire conduit
    y = -R(2.3) - 0.012  # wrap-around advert: clinic
    box2('white', -0.15, 0.15, y, y + 0.03, 1.6, 2.9); box2('sign_green', -0.15, 0.15, y - 0.003, y + 0.03, 2.78, 2.9); box2('sign_green', -0.15, 0.15, y - 0.003, y + 0.03, 1.6, 1.66)
    text3d('sign_green', '内科', 0.19, (0, y - 0.004, 2.3), depth=0.006, vertical=True)
    text3d('ink', 'クリニック', 0.045, (0, y - 0.004, 1.76), depth=0.004)
    y = -R(3.4) - 0.01  # address plate
    box2('sign_blue', -0.1, 0.1, y, y + 0.025, 3.1, 3.62)
    text3d('ink_white', '一丁目', 0.12, (0, y - 0.003, 3.36), depth=0.005, vertical=True)
    box2('white', -0.07, 0.07, -R(1.55) - 0.01, -R(1.55) + 0.02, 1.47, 1.53)

@model('street_light', '街灯', '道の小物')
def street_light():
    cyl('concrete', 0.16, 0.06, (0, 0, 0), 10)
    _st_lathe('st_galv', [(0.13, 0.06), (0.13, 0.1), (0.11, 0.14), (0.1, 0.55), (0.085, 0.6)], 10)
    box2('st_galv', -0.045, 0.045, -0.112, -0.09, 0.2, 0.42); box2('steel_dark', -0.01, 0.01, -0.116, -0.11, 0.38, 0.4)
    cyl('st_galv', 0.085, 4.4, (0, 0, 0.6), 10, r2=0.06)
    cyl('st_galv', 0.078, 0.05, (0, 0, 2.6), 10)
    box2('white', -0.045, 0.045, -0.085, -0.07, 2.2, 2.36); box2('ink', -0.03, 0.03, -0.088, -0.084, 2.26, 2.3)
    pts = [(0, -0.4 * (1 - math.cos(t / 8 * math.pi / 2)), 4.95 + 0.4 * math.sin(t / 8 * math.pi / 2)) for t in range(9)] + [(0, -0.42, 5.35)]
    for a, b in zip(pts, pts[1:]): rod('st_galv', a, b, 0.045, 8)
    rod('st_galv', (0, 0, 4.55), (0, -0.28, 5.28), 0.018, 6)
    zc = 5.33
    rings = []
    for y, a, b, c in ((-0.38, 0.05, 0.04, 0.035), (-0.44, 0.11, 0.07, 0.045), (-0.56, 0.16, 0.09, 0.05), (-0.72, 0.175, 0.085, 0.05),
                       (-0.86, 0.15, 0.065, 0.045), (-0.95, 0.09, 0.035, 0.035), (-0.975, 0.03, 0.015, 0.02)):
        rings.append([(a * math.cos(i / 8 * math.pi), y, zc + b * math.sin(i / 8 * math.pi)) for i in range(9)] + [(-a * 0.9, y, zc - c), (a * 0.9, y, zc - c)])
    loft('st_galv', rings)
    o = cyl('lamp', 0.11, 0.02, (0, -0.67, zc - 0.068), 14); o.scale = (1.0, 1.5, 1.0)
    cyl('white', 0.025, 0.03, (0, -0.78, zc + 0.07), 8)

@model('vending_machine', '自動販売機', '道の小物')
def vending_machine():
    H = 1.86
    box2('steel_dark', -0.48, 0.48, -0.35, 0.35, 0, 0.06)
    box2('white', -0.5, 0.5, -0.31, 0.37, 0.06, H)
    box2('red', -0.51, 0.51, -0.425, 0.38, H, 2.03); box2('red', -0.49, 0.49, -0.41, 0.37, 2.03, 2.07)
    text3d('ink_white', 'ドリンク', 0.13, (0, -0.428, 1.945), depth=0.008)
    for sx in (-1, 1): box2('red', sx * 0.5 - 0.07, sx * 0.5, -0.41, -0.31, 0.06, H)  # door frame
    box2('red', -0.43, 0.43, -0.41, -0.31, 1.8, H); box2('red', -0.43, 0.43, -0.4, -0.31, 0.06, 0.98)
    box2('vend_panel', -0.43, 0.43, -0.315, -0.31, 0.98, 1.8)  # lit display window (recessed)
    rnd = random.Random(5)
    cans = ['red', 'blue', 'yellow', 'green', 'orange', 'white', 'black', 'cloth_pink', 'gold', 'st_tele', 'navy', 'cloth_khaki']
    for r in range(3):
        zb = 1.0 + r * 0.265
        box2('white', -0.43, 0.43, -0.4, -0.315, zb, zb + 0.02)
        box2('white', -0.43, 0.43, -0.405, -0.4, zb - 0.045, zb + 0.02)
        for c in range(6):
            x = -0.3375 + c * 0.135
            box2('vend_panel', x - 0.025, x + 0.025, -0.41, -0.405, zb - 0.035, zb - 0.012)
            box2('blue' if (r < 2 or c < 3) else 'red', x - 0.03, x + 0.03, -0.408, -0.405, zb - 0.005, zb + 0.012)
            col = rnd.choice(cans); z0 = zb + 0.02
            if r == 0 or (r == 2 and c >= 3):  # PET bottles
                cyl(col, 0.034, 0.11, (x, -0.36, z0), 8); cyl('st_pet', 0.034, 0.05, (x, -0.36, z0 + 0.11), 8, r2=0.016); cyl('white', 0.017, 0.022, (x, -0.36, z0 + 0.16), 6)
            else:
                cyl(col, 0.033, 0.13 if rnd.random() < 0.6 else 0.1, (x, -0.36, z0), 8)
    box2('steel_dark', 0.14, 0.41, -0.415, -0.4, 0.58, 0.95)  # money unit
    box2('metal', 0.33, 0.38, -0.42, -0.415, 0.86, 0.91); box2('black', 0.18, 0.29, -0.42, -0.415, 0.87, 0.89)
    box2('vend_panel', 0.18, 0.29, -0.42, -0.415, 0.8, 0.84); box2('ink', 0.18, 0.29, -0.42, -0.415, 0.64, 0.76)
    box2('metal', 0.34, 0.37, -0.425, -0.415, 0.76, 0.82); box2('black', 0.32, 0.39, -0.425, -0.415, 0.62, 0.69)
    box2('white', -0.41, 0.1, -0.405, -0.4, 0.58, 0.95); box2('blue', -0.41, 0.1, -0.41, -0.405, 0.84, 0.91); box2('orange', -0.41, 0.1, -0.41, -0.405, 0.62, 0.66)
    box2('steel_dark', -0.38, 0.38, -0.415, -0.4, 0.14, 0.44); box2('black', -0.34, 0.34, -0.42, -0.415, 0.18, 0.4)
    box2('metal', -0.32, 0.32, -0.43, -0.42, 0.37, 0.39); box2('steel_dark', -0.5, 0.5, -0.42, -0.31, 0.06, 0.12)
    cyl('metal', 0.016, 0.01, (0.465, -0.41, 1.1), 8, rot=(math.pi / 2, 0, 0))
    for sx in (-1, 1):  # side advert panels
        box2('red', sx * 0.505 - 0.006, sx * 0.505 + 0.006, -0.27, 0.33, 0.3, 1.75)
        box2('white', sx * 0.505 - 0.008, sx * 0.505 + 0.008, -0.27, 0.33, 1.2, 1.26)
        box2('blue', sx * 0.505 - 0.008, sx * 0.505 + 0.008, -0.27, 0.33, 1.3, 1.34)
    for i in range(6): box2('black', -0.3, 0.3, 0.37, 0.38, 0.16 + i * 0.05, 0.185 + i * 0.05)  # back: vent louvres
    for x in (-0.45, -0.25, 0.25, 0.45): box2('alu', x - 0.016, x + 0.016, 0.37, 0.4, 0.08, 1.84)
    box2('alu', -0.5, 0.5, 0.37, 0.395, 1.62, 1.66); box2('paper', -0.12, 0.12, 0.37, 0.376, 1.3, 1.5); box2('yellow', -0.1, 0.1, 0.37, 0.378, 1.1, 1.18)
    rod('rubber', (0.12, 0.375, 0.5), (0.13, 0.39, 0.1), 0.012, 6); rod('rubber', (0.13, 0.39, 0.1), (0.15, 0.4, 0.015), 0.012, 6)

@model('bicycle', '自転車(ママチャリ)', '道の小物')
def bicycle():
    # step-through city bike (ママチャリ): spoked 26" wheels with mudguards, swooping low frame, full chain case,
    # sprung saddle, swept-back bars with grips and a bell, wire front basket with a lamp, rear carrier and a double stand
    R, fy, ry = 0.335, -0.55, 0.55
    F = 'pv_frame_red'
    for y in (fy, ry):
        _pv_wheel((0, y, R), R, 0.038, rim='pv_chrome', seg=22, spokes=14, hub='metal')
        with xf((0, y, R), ry=math.pi / 2):   # mudguard (local -x = up)
            a_mid, ha = (math.pi * 0.92, 1.25) if y < 0 else (math.pi * 1.05, 1.45)
            _pv_shell(F, [(R + 0.03, -0.028, ha), (R + 0.04, 0.0, ha), (R + 0.03, 0.028, ha)], seg=12, t=0.006, a_mid=a_mid)
    bb, head0, head1, seat = (0, 0.05, 0.27), (0, -0.42, 0.66), (0, -0.39, 0.82), (0, 0.17, 0.78)
    _pv_tube(F, [head0, (0, -0.33, 0.45), (0, -0.2, 0.3), (0, -0.05, 0.27), bb], 0.024, 8)                     # low down tube
    _pv_tube(F, [(0, -0.4, 0.72), (0, -0.3, 0.55), (0, -0.15, 0.45), (0, 0.08, 0.42)], 0.016, 8)               # second tube
    _pv_tube(F, [bb, seat], 0.022, 8)
    _pv_tube(F, [head0, head1], 0.028, 8)
    for sx in (-1, 1):
        _pv_tube(F, [(sx * 0.02, 0.15, 0.7), (sx * 0.045, ry, R)], 0.012, 6)                                    # seat stays
        _pv_tube(F, [(sx * 0.02, 0.06, 0.27), (sx * 0.045, ry, R)], 0.013, 6)                                   # chain stays
        _pv_tube(F, [(sx * 0.02, -0.425, 0.65), (sx * 0.05, -0.47, 0.5), (sx * 0.05, fy, R)], 0.013, 6)         # fork blades
    rod('pv_chrome', (0, -0.39, 0.82), (0, -0.38, 0.95), 0.014, 6)
    _pv_tube('pv_chrome', [(-0.29, -0.2, 0.99), (-0.22, -0.3, 0.98), (-0.1, -0.37, 0.96), (0, -0.38, 0.955), (0.1, -0.37, 0.96), (0.22, -0.3, 0.98), (0.29, -0.2, 0.99)], 0.011, 6)
    for sx in (-1, 1):
        _pv_tube('black', [(sx * 0.29, -0.2, 0.99), (sx * 0.27, -0.24, 0.988), (sx * 0.24, -0.29, 0.983)], 0.017, 6)   # grips
        rod('pv_chrome', (sx * 0.19, -0.33, 0.975), (sx * 0.26, -0.29, 0.94), 0.006, 4)                                # brake levers
    ico('pv_chrome', 0.028, (-0.14, -0.37, 0.985), (1, 1, 0.6), 1)                                                 # bell
    rod('pv_chrome', (0, 0.155, 0.74), (0, 0.19, 0.86), 0.013, 6)
    _pv_lathe('pv_seat', [(0.0, 0.0), (0.09, 0.0), (0.1, 0.03), (0.085, 0.055), (0, 0.06)], (0, 0.22, 0.86), seg=12, sx=1.0, sy=1.45,
              f=lambda x, y, z: (x * (0.55 if y < 0 else 1.0), y, z))
    for sx in (-1, 1): _pv_tube('pv_chrome', [(sx * 0.05, 0.27, 0.86), (sx * 0.05, 0.27, 0.83), (sx * 0.035, 0.22, 0.83)], 0.009, 4)   # springs
    # chain case and cranks
    case = [(0.05 + 0.105 * math.cos(a), 0.27 + 0.105 * math.sin(a)) for a in (math.pi / 2 + k / 8 * math.pi for k in range(9))]
    case += [(ry + 0.06 * math.cos(a), R + 0.06 * math.sin(a)) for a in (-math.pi / 2 + k / 6 * math.pi for k in range(7))]
    prism('cloth_grey', case, 0.035, loc=(0.075, 0, 0), axis='X')
    cyl('pv_chrome', 0.03, 0.2, (-0.1, 0.05, 0.27), 8, rot=(0, math.pi / 2, 0))
    for sx, a in ((1, 0.6), (-1, 0.6 + math.pi)):
        p = (sx * 0.1, 0.05 + 0.16 * math.cos(a), 0.27 - 0.16 * math.sin(a))
        rod('metal', (sx * 0.1, 0.05, 0.27), p, 0.012, 4)
        _pv_rbox('black', (0.09, 0.05, 0.022), (p[0] + sx * 0.05, p[1], p[2] - 0.011), 0.006)
    # front basket (wire), lamp
    bx, by, bz, bw, bd, bh = 0, -0.64, 0.73, 0.36, 0.28, 0.24
    for z in (bz, bz + bh):
        pts = [(-bw / 2, by - bd / 2, z), (bw / 2, by - bd / 2, z), (bw / 2, by + bd / 2, z), (-bw / 2, by + bd / 2, z), (-bw / 2, by - bd / 2, z)]
        _pv_tube('pv_chrome', pts, 0.006, 4, cap=False)
    for k in range(7):
        x = -bw / 2 + k * bw / 6
        rod('pv_chrome', (x, by - bd / 2, bz), (x, by - bd / 2, bz + bh), 0.003, 3); rod('pv_chrome', (x, by + bd / 2, bz), (x, by + bd / 2, bz + bh), 0.003, 3)
        rod('pv_chrome', (x, by - bd / 2, bz), (x, by + bd / 2, bz), 0.003, 3)
    for k in range(1, 5):
        y = by - bd / 2 + k * bd / 5
        for sx in (-1, 1): rod('pv_chrome', (sx * bw / 2, y, bz), (sx * bw / 2, y, bz + bh), 0.003, 3)
    rod('pv_chrome', (0, by + bd / 2, bz + 0.05), (0, -0.4, 0.72), 0.01, 4)
    for sx in (-1, 1): rod('pv_chrome', (sx * 0.12, by - bd / 2, bz), (sx * 0.05, fy, R), 0.006, 4)
    with xf((0, by - bd / 2 - 0.02, bz - 0.06), rx=math.pi / 2):
        cyl('pv_chrome', 0.04, 0.07, (0, 0, -0.02), 10); cyl('lamp', 0.032, 0.01, (0, 0, -0.03), 10)
    # rear carrier, reflector, double stand
    for sx in (-1, 1):
        rod('pv_chrome', (sx * 0.1, 0.36, 0.75), (sx * 0.1, 0.8, 0.75), 0.009, 4)
        rod('pv_chrome', (sx * 0.1, 0.72, 0.75), (sx * 0.05, ry, R), 0.008, 4)
        _pv_tube('pv_chrome', [(sx * 0.055, ry, R), (sx * 0.12, ry + 0.12, 0.12), (sx * 0.13, ry + 0.16, 0.0)], 0.009, 4)
    for k in range(4): rod('pv_chrome', (-0.1, 0.4 + k * 0.13, 0.75), (0.1, 0.4 + k * 0.13, 0.75), 0.007, 4)
    rod('pv_chrome', (-0.13, ry + 0.16, 0.01), (0.13, ry + 0.16, 0.01), 0.009, 4)
    _pv_rbox('pv_tail_light', (0.07, 0.015, 0.04), (0, 0.81, 0.71), 0.005)
    torus('steel_dark', 0.05, 0.012, (0, 0.47, 0.5), rot=(0, math.pi / 2, 0), seg=10, rseg=4)                 # ring lock on the stays

@model('ac_outdoor', '室外機', '道の小物')
def ac_outdoor():
    for sx in (-1, 1):
        box2('concrete', sx * 0.28 - 0.07, sx * 0.28 + 0.07, -0.16, 0.16, 0, 0.08)
        box2('steel_dark', sx * 0.3 - 0.025, sx * 0.3 + 0.025, -0.15, 0.15, 0.08, 0.13)
    _st_rbox('st_ac_body', 0.8, 0.29, [(0, 0.025, 0.13), (0, 0.025, 0.665)], k=2, cy=0.005)
    _st_rbox('st_ac_body', 0.81, 0.3, [(0, 0.03, 0.665), (0, 0.03, 0.69), (0.004, 0.026, 0.694)], k=2, cy=0.005)
    cx, cz = -0.1, 0.41
    cyl('black', 0.215, 0.006, (cx, -0.139, cz), 20, rot=(math.pi / 2, 0, 0))
    for k in range(3):
        t = k * math.tau / 3
        prof = [(cx + r * math.cos(t + a), cz + r * math.sin(t + a)) for r, a in ((0.035, -0.4), (0.17, -0.25), (0.19, 0.2), (0.04, 0.45))]
        prism('alu', prof, 0.008, loc=(0, -0.143, 0), axis='Y')
    cyl('alu', 0.035, 0.02, (cx, -0.14, cz), 10, rot=(math.pi / 2, 0, 0))
    for R in (0.075, 0.14, 0.2): torus('st_ac_body', R, 0.006, (cx, -0.155, cz), rot=(math.pi / 2, 0, 0), seg=18, rseg=3)
    torus('st_ac_body', 0.22, 0.012, (cx, -0.15, cz), rot=(math.pi / 2, 0, 0), seg=20, rseg=4)
    for a in (0, math.pi / 2, math.pi / 4, -math.pi / 4):
        rod('st_ac_body', (cx - 0.21 * math.cos(a), -0.155, cz - 0.21 * math.sin(a)), (cx + 0.21 * math.cos(a), -0.155, cz + 0.21 * math.sin(a)), 0.005, 3)
    box2('alu', 0.2, 0.33, -0.146, -0.14, 0.58, 0.6); box2('paper', 0.22, 0.31, -0.146, -0.14, 0.2, 0.26)
    box2('st_ac_body', 0.4, 0.415, -0.1, 0.12, 0.18, 0.5)  # service cover, valves and insulated pipes
    for y, z in ((0.0, 0.24), (0.06, 0.3)):
        rod('gold', (0.415, y, z), (0.435, y, z), 0.014, 6)
        rod('cloth_white', (0.435, y, z), (0.435, y + 0.03, 0.75), 0.02, 6)
    torus('black', 0.035, 0.008, (0.435, 0.035, 0.62), seg=10, rseg=3)
    rod('rubber', (0.3, 0.1, 0.13), (0.34, 0.2, 0.01), 0.01, 4)
    box2('steel_dark', -0.385, 0.35, 0.15, 0.153, 0.15, 0.65)  # back heat-exchanger fins and guard wires
    for i in range(24):
        x = -0.37 + i * 0.03
        box2('alu', x - 0.003, x + 0.003, 0.153, 0.165, 0.16, 0.64)
    for z in (0.25, 0.4, 0.55): rod('steel_dark', (-0.385, 0.17, z), (0.35, 0.17, z), 0.005, 3)
    box2('steel_dark', -0.403, -0.4, -0.12, 0.13, 0.15, 0.65)
    for i in range(9):
        y = -0.11 + i * 0.03
        box2('alu', -0.415, -0.403, y - 0.003, y + 0.003, 0.16, 0.64)

@model('a_frame_sign', '立て看板(黒板)', '道の小物')
def a_frame_sign():
    for sg in (-1, 1):
        with xf((0, sg * 0.17, 0), rx=sg * 0.17):
            for sx in (-1, 1): box2('wood', sx * 0.3 - (0.035 if sx > 0 else 0), sx * 0.3 + (0.035 if sx < 0 else 0), -0.018, 0.018, 0, 0.95)
            box2('wood', -0.265, 0.265, -0.018, 0.018, 0.88, 0.95); box2('wood', -0.265, 0.265, -0.018, 0.018, 0.09, 0.15)
            box2('st_chalkboard', -0.265, 0.265, -0.01, 0.01, 0.15, 0.88)
            o = sg
            box2('wood', -0.265, 0.265, min(o * 0.018, o * 0.05), max(o * 0.018, o * 0.05), 0.15, 0.17)
            box2('st_chalk_white', -0.2, -0.14, min(o * 0.02, o * 0.035), max(o * 0.02, o * 0.035), 0.17, 0.182)
            box2('st_chalk_yellow', -0.1, -0.05, min(o * 0.02, o * 0.035), max(o * 0.02, o * 0.035), 0.17, 0.182)
            y, rz = o * 0.012, (0 if sg < 0 else math.pi)
            fish = [(-0.03 + 0.11 * math.cos(a / 8 * math.tau), 0.32 + 0.05 * math.sin(a / 8 * math.tau)) for a in range(8)]
            prism('st_chalk_white', fish, 0.004, loc=(0, y, 0), axis='Y')
            prism('st_chalk_white', [(0.06, 0.32), (0.15, 0.37), (0.15, 0.27)], 0.004, loc=(0, y, 0), axis='Y')
            box2('st_chalkboard', -0.105, -0.085, y - 0.003 * o - 0.002, y + 0.003 * o + 0.002, 0.33, 0.345)
            for px, pz in ((-0.21, 0.82), (0.21, 0.82), (-0.21, 0.22), (0.2, 0.24)):
                box2('st_chalk_pink', px - 0.012, px + 0.012, y - 0.003, y + 0.003, pz - 0.012, pz + 0.012)
            if sg < 0:
                text3d('st_chalk_white', '本日のランチ', 0.062, (0, -0.013, 0.79), depth=0.004)
                box2('st_chalk_yellow', -0.2, 0.2, -0.0125, -0.01, 0.735, 0.742)
                text3d('st_chalk_yellow', 'うに丼', 0.12, (0, -0.013, 0.6), depth=0.004)
            else:
                text3d('st_chalk_yellow', 'ランチ', 0.1, (0, 0.013, 0.7), rz=rz, depth=0.004)
                box2('st_chalk_white', -0.18, 0.18, 0.01, 0.0125, 0.6, 0.607)
    for sx in (-1, 1):
        rod('metal', (sx * 0.27, -0.012, 0.935), (sx * 0.2, -0.012, 0.935), 0.012, 6)
        rod('metal', (sx * 0.28, -0.11, 0.35), (sx * 0.28, 0.11, 0.35), 0.004, 4)

@model('bench', 'ベンチ(木製)', '道の小物')
def bench():
    for sx in (-0.72, 0.72):
        for prof in ([(-0.22, 0.0), (-0.16, 0.0), (-0.17, 0.39), (-0.215, 0.39)], [(0.13, 0.0), (0.19, 0.0), (0.17, 0.39), (0.12, 0.39)],
                     [(0.12, 0.37), (0.17, 0.37), (0.27, 0.84), (0.23, 0.85)], [(-0.23, 0.355), (0.2, 0.355), (0.2, 0.395), (-0.23, 0.395)],
                     [(-0.25, 0), (-0.12, 0), (-0.12, 0.025), (-0.25, 0.025)], [(0.09, 0), (0.22, 0), (0.22, 0.025), (0.09, 0.025)],
                     [(-0.205, 0.39), (-0.17, 0.39), (-0.18, 0.6), (-0.205, 0.6)]):
            prism('steel_dark', prof, 0.05, loc=(sx, 0, 0), axis='X')
        box2('wood', sx - 0.045, sx + 0.045, -0.25, 0.2, 0.6, 0.635)
    box2('steel_dark', -0.72, 0.72, -0.02, 0.02, 0.32, 0.355)
    for yc in (-0.19, -0.09, 0.01, 0.11): box2('wood', -0.8, 0.8, yc - 0.042, yc + 0.042, 0.395, 0.43)
    for t in (0.22, 0.52, 0.82):
        yc, zc = 0.165 + 0.085 * t, 0.45 + 0.36 * t
        box('wood', (1.6, 0.03, 0.09), (0, yc - 0.03, zc - 0.045), (-0.235, 0, 0))

@model('postbox', '郵便ポスト', '道の小物')
def postbox():
    box2('steel_dark', -0.17, 0.17, -0.15, 0.15, 0, 0.03)
    _st_rbox('st_post_red', 0.14, 0.12, [(0, 0.02, 0.03), (0, 0.02, 0.4)], k=1)
    _st_rbox('st_post_red', 0.42, 0.38, [(-0.012, 0.055, 0.38), (-0.012, 0.055, 0.43), (0, 0.05, 0.44), (0, 0.05, 1.06)], k=2)
    _st_rbox('st_post_red', 0.42, 0.38, [(-0.02, 0.07, 1.06), (-0.02, 0.07, 1.1), (0.0, 0.06, 1.16), (0.05, 0.045, 1.21), (0.11, 0.03, 1.245), (0.16, 0.02, 1.26)], k=2)
    for x0, x1 in ((-0.17, -0.02), (0.02, 0.17)):
        box2('black', x0 + 0.01, x1 - 0.01, -0.197, -0.185, 0.9, 0.93)
        box2('st_post_red', x0, x1, -0.228, -0.188, 0.93, 0.955)
        box2('white', x0 + 0.02, x1 - 0.02, -0.196, -0.188, 0.975, 1.015)
    text3d('ink_white', '〒', 0.17, (0, -0.196, 0.76), depth=0.008)
    text3d('ink_white', 'POST', 0.05, (0, -0.196, 0.64), depth=0.006)
    box2('st_post_red', -0.17, 0.17, -0.198, -0.188, 0.45, 0.59)
    box2('white', -0.1, 0.1, -0.203, -0.197, 0.48, 0.56)
    for z in (0.495, 0.515, 0.535): box2('ink', -0.08, 0.08, -0.205, -0.202, z, z + 0.007)
    cyl('metal', 0.014, 0.008, (0.13, -0.197, 0.52), 8, rot=(math.pi / 2, 0, 0))
    text3d('ink_white', '〒', 0.13, (-0.212, 0, 0.8), rz=-math.pi / 2, depth=0.006)
    text3d('ink_white', '〒', 0.13, (0.212, 0, 0.8), rz=math.pi / 2, depth=0.006)

@model('nobori', 'のぼり旗', '道の小物')
def nobori():
    cyl('steel_dark', 0.15, 0.06, (0, 0, 0), 12, r2=0.14); _st_lathe('cloth_grey', [(0.14, 0.06), (0.13, 0.13), (0.06, 0.17), (0.03, 0.19)], 12)
    cyl('alu', 0.016, 3.0, (0, 0, 0), 8); ico('alu', 0.025, (0, 0, 3.01), sub=1)
    rod('alu', (0, 0, 2.95), (0.53, 0, 2.95), 0.01, 6); ico('alu', 0.016, (0.535, 0, 2.95), sub=1)
    x0, x1, z0, z1, amp = 0.04, 0.52, 0.95, 2.92, 0.018
    _st_wavy('cloth_red', x0, x1, z0, z1, 0, 0.01, amp, 1.2, 10, 0.4)
    _st_wavy('cloth_white', x0, x1, z0 + 0.1, z0 + 0.2, 0, 0.016, amp, 1.2, 10, 0.4)
    _st_wavy('cloth_yellow', x0, x1, z1 - 0.14, z1 - 0.08, 0, 0.016, amp, 1.2, 10, 0.4)
    for z in (1.0, 1.45, 1.9, 2.35, 2.8): torus('cloth_white', 0.026, 0.008, (0.0, 0, z), seg=8, rseg=3)
    for x in (0.1, 0.3, 0.48): torus('cloth_white', 0.022, 0.006, (x, 0, 2.93), rot=(0, math.pi / 2, 0), seg=8, rseg=3)
    text3d('ink_white', '海鮮', 0.28, (0.28, -amp - 0.012, 2.12), depth=0.008, vertical=True)

@model('chochin_hanging', '提灯(吊り下げ)', '道の小物')
def chochin_hanging():
    r, h, N = 0.22, 0.55, 16
    loft('lantern_red', [_st_ring(r * (0.55 + 0.45 * math.sin(i / N * math.pi)) * (1.0 if i % 2 == 0 else 1.022), 14, i / N * h, math.pi / 2) for i in range(N + 1)])
    _st_lathe('black', [(0.11, -0.045), (0.14, -0.035), (0.142, -0.005), (0.128, 0.03)], 14, rot=math.pi / 2)
    _st_lathe('black', [(0.128, h - 0.03), (0.142, h + 0.005), (0.14, h + 0.035), (0.11, h + 0.045)], 14, rot=math.pi / 2)
    rod('black', (0, 0, h + 0.04), (0, 0, h + 0.25), 0.01, 4); torus('black', 0.025, 0.006, (0, 0, h + 0.275), rot=(math.pi / 2, 0, 0), seg=8, rseg=3)
    cyl('black', 0.03, 0.03, (0, 0, -0.075), 8)
    text3d('ink', '祭', 0.19, (0, -0.214, h / 2), depth=0.014)
    text3d('ink', '祭', 0.19, (0, 0.214, h / 2), rz=math.pi, depth=0.014)

@model('street_lantern', '石灯籠風の街灯', '道の小物')
def street_lantern():
    box2('granite', -0.3, 0.3, -0.3, 0.3, 0, 0.1); box2('granite', -0.24, 0.24, -0.24, 0.24, 0.1, 0.2)
    _st_rbox('granite', 0.2, 0.2, [(0, 0.03, 0.2), (0, 0.03, 1.32)], k=1)
    box2('granite', -0.125, 0.125, -0.125, 0.125, 1.2, 1.26)
    _st_lathe('granite', [(0.16, 1.32), (0.3, 1.45), (0.36, 1.49), (0.36, 1.58)], 4, rot=math.pi / 4)
    box2('lantern_white', -0.18, 0.18, -0.18, 0.18, 1.58, 2.02)
    for sx in (-1, 1):
        for sy in (-1, 1): box2('granite', sx * 0.2 - 0.035, sx * 0.2 + 0.035, sy * 0.2 - 0.035, sy * 0.2 + 0.035, 1.58, 2.02)
    for a in range(4):
        with xf((0, 0, 0), rz=a * math.pi / 2):
            for x in (-0.06, 0.06): box2('wood_frame', x - 0.008, x + 0.008, -0.19, -0.18, 1.58, 2.02)
            box2('wood_frame', -0.17, 0.17, -0.19, -0.18, 1.79, 1.805)
            box2('granite', -0.17, 0.17, -0.2, -0.17, 1.58, 1.62)
    loft('granite', [_st_kring(4, 0.3, 0.21, 2.02, 2.02, math.pi / 4), _st_kring(4, 0.47, 0.31, 2.1, 2.07, math.pi / 4), _st_kring(4, 0.48, 0.32, 2.15, 2.12, math.pi / 4),
                     _st_kring(4, 0.28, 0.19, 2.24, 2.23, math.pi / 4), _st_kring(4, 0.1, 0.07, 2.29, 2.29, math.pi / 4)])
    _st_lathe('granite', [(0.06, 2.28), (0.08, 2.31), (0.06, 2.34), (0.075, 2.36), (0.04, 2.4), (0.005, 2.43)], 8)

@model('direction_sign', '道しるべ(方向看板)', '道の小物')
def direction_sign():
    box2('granite', -0.16, 0.16, -0.16, 0.16, 0, 0.12)
    box2('wood', -0.055, 0.055, -0.055, 0.055, 0.12, 2.34)
    prism('wood_frame', [(-0.11, 2.33), (0.11, 2.33), (0, 2.43)], 0.16, axis='Y'); box2('wood_frame', -0.07, 0.07, -0.07, 0.07, 2.29, 2.33)
    for k, (t, a) in enumerate((('港', 0.0), ('神社', math.pi), ('灯台', math.pi * 0.7))):
        with xf((0, 0, 1.95 - k * 0.38), rz=a):
            prism('wood_frame', [(0.06, 0), (0.95, 0), (1.12, 0.15), (0.95, 0.3), (0.06, 0.3)], 0.05, axis='Y')
            prism('sign_wood', [(0.06, 0.025), (0.94, 0.025), (1.08, 0.15), (0.94, 0.275), (0.06, 0.275)], 0.064, axis='Y')
            box2('iron', 0.05, 0.1, -0.038, 0.038, 0.04, 0.26)
            text3d('ink', t, 0.17, (0.52, -0.034, 0.15), depth=0.008)
            text3d('ink', t, 0.17, (0.52, 0.034, 0.15), rz=math.pi, depth=0.008)

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
        _st_lathe('concrete', [(0.17, 0), (0.17, 0.06), (0.13, 0.12), (0.05, 0.14)], 10, (x, 0, 0))
        cyl('alu', 0.026, 1.48, (x, 0, 0.12), 8); cyl('steel_dark', 0.034, 0.06, (x, 0, 1.57), 8)
        rod('blue', (x, -0.03, 1.6), (x, -0.08, 1.6), 0.012, 6); cyl('blue', 0.022, 0.015, (x, -0.08, 1.6), 8, rot=(math.pi / 2, 0, 0))
        cyl('alu', 0.02, 0.17, (x, 0, 1.63), 8); cyl('blue', 0.023, 0.02, (x, 0, 1.8), 8)
        rod('alu', (x, -0.3, 1.72), (x, 0.3, 1.72), 0.016, 6); box2('steel_dark', x - 0.03, x + 0.03, -0.035, 0.035, 1.69, 1.75)
        for y in (-0.22, 0.22):
            for dy in (-0.035, 0.035): rod('alu', (x, y + dy, 1.72), (x, y + dy * 1.4, 1.81), 0.007, 4)
        for y in (-0.3, 0.3): rod('blue', (x, y, 1.72), (x, y * 1.1, 1.72), 0.02, 6)
    for y in (-0.22, 0.22):
        rod('alu', (-1.4, y, 1.76), (1.4, y, 1.76), 0.018, 8)
        for sx in (-1, 1): rod('blue', (sx * 1.4, y, 1.76), (sx * 1.45, y, 1.76), 0.021, 8)
    laundry_line(-1.3, 1.3, -0.22, 1.76, 3); laundry_line(-1.3, 1.3, 0.22, 1.76, 4)

@model('fence_wood', '木の塀(2m)', '住宅の小物')
def fence_wood():
    box2('concrete', -1.045, 1.045, -0.06, 0.06, 0, 0.07)
    for x in (-1.0, 1.0):
        box2('wood_frame', x - 0.045, x + 0.045, -0.045, 0.045, 0.07, 1.26)
        cyl('wood_frame', 0.075, 0.05, (x, 0, 1.3), 4, r2=0.02, rot=(0, 0, math.pi / 4))
    box2('wood_frame', -1.04, 1.04, -0.055, 0.055, 1.24, 1.3)
    for z in (0.3, 0.72, 1.1): box2('wood_frame', -0.96, 0.96, -0.012, 0.012, z, z + 0.06)
    for k in range(13):
        x = -0.9 + k * 0.15; y = -0.025 if k % 2 == 0 else 0.025
        box2('st_cedar' if k % 2 == 0 else 'wood_frame', x - 0.08, x + 0.08, y - 0.011, y + 0.011, 0.08, 1.24)

@model('fence_rail', '白い鉄柵(2m)', '灯台・展望台')
def fence_rail():
    for x in (-1.0, 1.0):
        box2('white', x - 0.07, x + 0.07, -0.05, 0.05, 0, 0.015)
        box2('white', x - 0.025, x + 0.025, -0.025, 0.025, 0.015, 1.06); ico('white', 0.035, (x, 0, 1.08), sub=2)
    box2('white', -1.0, 1.0, -0.03, 0.03, 1.0, 1.03)
    for z in (0.12, 0.88): box2('white', -0.98, 0.98, -0.012, 0.012, z, z + 0.03)
    for x in frange(-0.88, 0.89, 0.125): rod('white', (x, 0, 0.15), (x, 0, 0.88), 0.01, 4)
    for x in frange(-0.8125, 0.82, 0.125): ico('white', 0.016, (x, 0, 0.92), sub=1)

@model('fence_log', '丸太の柵(2m)', '灯台・展望台')
def fence_log():
    for x in (-1.0, 1.0):
        cyl('wood', 0.075, 1.04, (x, 0, 0), 10); cyl('wood_light', 0.066, 0.012, (x, 0, 1.04), 10)
    for z in (0.5, 0.95):
        rod('wood', (-1.08, -0.045, z), (1.08, -0.045, z), 0.052, 9)
        for x in (-1.085, 1.075): rod('wood_light', (x, -0.045, z), (x + 0.01, -0.045, z), 0.046, 9)
        for x in (-1.0, 1.0):
            torus('rope', 0.07, 0.013, (x, -0.02, z), rot=(0.9, 0, 0), seg=8, rseg=3)
    ico('wood', 0.03, (0.4, -0.09, 0.52), (1, 0.6, 1), sub=1)

@model('plant_pots', '植木鉢の寄せ植え', '住宅の小物')
def plant_pots():
    x, y = -0.38, 0.18  # geranium in a big terracotta pot
    _st_pot('terracotta', (x, y, 0), 0.17, 0.3, 10)
    ico('leaf_dark', 0.16, (x, y, 0.42), (1.1, 1.1, 0.7), 2, 0.25, 1); cards('shrub_card', (x, y, 0.45), 0.2, 8, 0.3, 11)
    rnd = random.Random(3)
    for k in range(7):
        a = k * 2.4; rr = rnd.uniform(0.04, 0.15)
        ico('flower_red', 0.045, (x + rr * math.cos(a), y + rr * math.sin(a), 0.55 + rnd.uniform(0, 0.08)), sub=2 if k < 3 else 1)
    x, y = 0.04, 0.24  # hydrangea in a glazed pot
    _st_lathe('st_glaze_blue', [(0.1, 0), (0.15, 0.08), (0.17, 0.2), (0.14, 0.3), (0.155, 0.33), (0.13, 0.33), (0.12, 0.31)], 12, (x, y, 0))
    cyl('soil', 0.12, 0.005, (x, y, 0.31), 10)
    ico('leaf_dark', 0.15, (x, y, 0.45), (1.2, 1.1, 0.7), 2, 0.25, 2); cards('shrub_card', (x, y, 0.48), 0.2, 7, 0.28, 12)
    for k, (dx, dy, dz) in enumerate(((-0.07, -0.04, 0.6), (0.08, -0.02, 0.62), (0.0, 0.08, 0.66))):
        ico('hydrangea', 0.1, (x + dx, y + dy, dz), (1, 1, 0.85), 2, 0.3, 4 + k)
    x, y = 0.45, 0.2  # spring onions in a styrofoam box
    box2('styro', x - 0.2, x + 0.2, y - 0.15, y + 0.15, 0, 0.24); box2('soil', x - 0.18, x + 0.18, y - 0.13, y + 0.13, 0.24, 0.245)
    rnd = random.Random(7)
    for k in range(14):
        bx, by = x + rnd.uniform(-0.15, 0.15), y + rnd.uniform(-0.1, 0.1)
        rod('leaf_light' if k % 3 else 'leaf', (bx, by, 0.24), (bx + rnd.uniform(-0.06, 0.06), by + rnd.uniform(-0.05, 0.05), 0.24 + rnd.uniform(0.3, 0.48)), 0.008, 3, r2=0.003)
    box2('white', x + 0.12, x + 0.15, y - 0.12, y - 0.115, 0.24, 0.36)
    x, y = -0.02, -0.25  # marigolds
    _st_pot('terracotta', (x, y, 0), 0.12, 0.2, 10)
    ico('leaf', 0.12, (x, y, 0.28), (1.1, 1.1, 0.6), 2, 0.25, 5); cards('shrub_card', (x, y, 0.3), 0.14, 6, 0.22, 13)
    for k in range(6):
        a = k * 1.9; ico('flower_yellow' if k % 2 else 'orange', 0.035, (x + 0.08 * math.cos(a), y + 0.08 * math.sin(a), 0.36 + 0.02 * (k % 3)), sub=1)
    x, y = 0.42, -0.23  # aloe in a square concrete planter
    _st_pot('concrete', (x, y, 0), 0.15, 0.22, 4, math.pi / 4)
    for k in range(10):
        a = k * 2.4; lean = 0.08 + 0.1 * (k % 3) / 2
        rod('leaf', (x, y, 0.2), (x + lean * math.cos(a) * 1.6, y + lean * math.sin(a) * 1.6, 0.2 + 0.36 - lean * 0.8), 0.022, 4, r2=0.002)
    x, y = -0.45, -0.22  # morning glory on a bamboo frame
    _st_pot('terracotta', (x, y, 0), 0.12, 0.2, 10)
    for k in range(3):
        a = k * math.tau / 3; rod('bamboo', (x + 0.08 * math.cos(a), y + 0.08 * math.sin(a), 0.17), (x + 0.1 * math.cos(a), y + 0.1 * math.sin(a), 0.82), 0.006, 4)
    for z in (0.5, 0.76): torus('bamboo', 0.095 + (z - 0.5) * 0.06, 0.005, (x, y, z), seg=12, rseg=3)
    cards('shrub_card', (x, y, 0.55), 0.12, 9, 0.15, 14, scale=(1, 1, 2.3))
    for k in range(6):
        a = k * 2.2; ico('hydrangea' if k % 3 else 'cloth_pink', 0.03, (x + 0.11 * math.cos(a), y + 0.11 * math.sin(a), 0.32 + k * 0.08), (1, 1, 0.6), sub=1)

@model('propane', 'プロパンボンベ', '住宅の小物')
def propane():
    box2('concrete', -0.43, 0.43, -0.21, 0.21, 0, 0.05)
    for sx in (-1, 1): box2('steel_dark', sx * 0.41 - 0.02, sx * 0.41 + 0.02, 0.15, 0.19, 0.05, 1.05)
    box2('steel_dark', -0.43, 0.43, 0.15, 0.19, 1.0, 1.04); box2('steel_dark', -0.43, 0.43, 0.15, 0.19, 0.3, 0.33)
    for x in (-0.205, 0.205):
        with xf((x, -0.01, 0.05)):
            cyl('steel_dark', 0.16, 0.07, (0, 0, 0), 14)
            _st_lathe('st_propane', [(0.155, 0.06), (0.175, 0.11), (0.178, 0.2), (0.178, 0.9), (0.17, 0.98), (0.14, 1.04), (0.09, 1.07), (0.05, 1.08)], 14)
            _st_lathe('st_propane', [(0.095, 1.07), (0.105, 1.07), (0.105, 1.2), (0.095, 1.2), (0.095, 1.1)], 12, cap=False)
            cyl('gold', 0.025, 0.09, (0, 0, 1.07), 8); cyl('red', 0.038, 0.016, (0, 0, 1.16), 10)
            rod('gold', (0, 0, 1.12), (0, 0.08, 1.12), 0.012, 6)
            box2('yellow', 0.03, 0.09, -0.112, -0.106, 1.08, 1.15)
            text3d('ink_red', 'LPガス', 0.055, (0, -0.184, 0.7), depth=0.008, vertical=True)
            cyl('white', 0.18, 0.05, (0, 0, 0.88), 14, cap=False)
    box2('alu', -0.06, 0.06, 0.12, 0.18, 0.86, 0.96); cyl('alu', 0.03, 0.02, (0, 0.12, 0.91), 8, rot=(math.pi / 2, 0, 0))
    for sx in (-1, 1): rod('rubber', (sx * 0.205, 0.07, 1.17), (sx * 0.05, 0.14, 0.95), 0.012, 6)
    rod('alu', (0.06, 0.16, 0.9), (0.12, 0.17, 0.9), 0.014, 6); rod('alu', (0.12, 0.17, 0.9), (0.12, 0.17, 0.05), 0.014, 6)
    _st_chain([(-0.41, 0.15), (-0.39, 0.0), (-0.3, -0.15), (-0.205, -0.197), (-0.1, -0.165), (0.0, -0.13), (0.1, -0.165), (0.205, -0.197), (0.3, -0.15), (0.39, 0.0), (0.41, 0.15)], 0.8)

# ================================================================= nature
def tube(mat, pts, radii, verts=8, wob=0.0, seed=0, lobes=0, lobe_amp=0.0, lobe_fade=0.4, cap=True):
    """Smooth swept tube through pts (parallel-transport frames, so trunks and limbs bend without seams); radius per
    point, wob = lumpy bark, lobes = buttress fluting that fades out over the first lobe_fade of the length."""
    pts = [Vector(p) for p in pts]; n = len(pts); rings = []
    t0 = (pts[1] - pts[0]).normalized()
    nrm = t0.cross(Vector((0, 0, 1)) if abs(t0.z) < 0.95 else Vector((1, 0, 0))).normalized()
    off = Vector((seed * 1.3, seed * 0.7, seed * 2.1)); s = 0.0; total = sum((pts[i + 1] - pts[i]).length for i in range(n - 1))
    for i, p in enumerate(pts):
        if i: s += (pts[i] - pts[i - 1]).length
        t = (pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        nrm = (nrm - t * nrm.dot(t)).normalized(); b = t.cross(nrm)
        fl = lobe_amp * max(0.0, 1 - s / total / lobe_fade) if lobes else 0.0
        ring = []
        for j in range(verts):
            a = j / verts * math.tau; dv = nrm * math.cos(a) + b * math.sin(a)
            r = radii[i] * (1 + fl * math.cos(a * lobes + seed))
            if wob: r *= 1 + wob * noise.noise(p * 0.9 + dv * 0.8 + off)
            ring.append(p + dv * r)
        rings.append(ring)
    return loft(mat, rings, cap=cap)

def pine(h, lean, seed, pads=9, reach_k=2.5):
    """Japanese black pine (kuromatsu): a trunk that leans hard at the foot and curls back up with a sideways S, bare
    elbowed limbs, and flat cloud-pruned needle pads (each pad one clump: a flat dark core, needle cards over its top
    and rim, a few under it)."""
    rnd = random.Random(seed)
    az = rnd.uniform(0, math.tau); L = Vector((math.cos(az), math.sin(az), 0)); Sd = Vector((-L.y, L.x, 0))
    H = h * 0.68
    def trunk(t):
        return L * (lean * (1 - (1 - t) ** 2.2)) + Sd * (0.5 * math.sin(t * math.pi * 1.4) * (0.5 + lean * 0.2)) + Vector((0, 0, H * t))
    ts = [-0.03, 0.0, 0.08, 0.18, 0.3, 0.42, 0.55, 0.68, 0.8, 0.9, 1.0]
    tube('bark_pine', [trunk(t) for t in ts], [0.39 if t < 0 else 0.3 * (1 - t) ** 0.9 + 0.07 for t in ts], 9, wob=0.16, seed=seed)
    for k in range(4):  # root flare
        a = az + 0.6 + k * math.tau / 4 + rnd.uniform(-0.4, 0.4); D = Vector((math.cos(a), math.sin(a), 0))
        tube('bark_pine', [D * 0.15 + Vector((0, 0, 0.45)), D * 0.45 + Vector((0, 0, 0.1)), D * 0.8 + Vector((0, 0, -0.08))], [0.2, 0.12, 0.05], 6)
    tfs = sorted(0.32 + 0.6 * k / (pads - 1) + rnd.uniform(-0.04, 0.04) for k in range(pads))
    for k, tf in enumerate(tfs):
        a = az + 0.4 + k * 2.4 + rnd.uniform(-0.35, 0.35); D = Vector((math.cos(a), math.sin(a), 0))
        reach = (1.38 - tf) * reach_k * 0.85 * (1 + 0.22 * math.cos(a - az)) * rnd.uniform(0.85, 1.1)
        s0 = trunk(tf); up = Vector((0, 0, 1))
        p1 = s0 + D * reach * 0.38 + up * 0.3 + Sd * rnd.uniform(-0.2, 0.2)
        p2 = s0 + D * reach * 0.72 - up * 0.08
        end = s0 + D * reach + up * 0.3
        rb = 0.05 + 0.13 * (1.15 - tf)
        tube('bark_pine', [s0, p1, p2, end], [rb, rb * 0.8, rb * 0.6, rb * 0.4], 6, wob=0.1, seed=seed + k)
        pine_pad(end + up * 0.15, 0.62 + (1 - tf) * 0.8, seed * 13 + k)
    pine_pad(trunk(1.0) + Vector((0, 0, 0.3)), 0.95, seed * 13 + 99)

def pine_pad(c, pr, sd, card='pine_card', scale=(1.3, 1.05, 0.34)):
    c = Vector(c); up = Vector((0, 0, 1))
    ico('pine', pr * 0.6, c - up * pr * 0.06, (scale[0] * 1.02, scale[1] * 1.02, scale[2] * 1.05), 2, 0.3, sd)
    sz = pr * 0.5 + 0.32
    cards(card, c, pr, int(34 + pr * 14), sz, sd, scale, up=0.75, flat=0.3, shell=(0.55, 1.0), face=0.55)
    cards(card, c - up * pr * 0.12, pr * 0.85, int(6 + pr * 3), sz * 0.9, sd + 7, (scale[0], scale[1], scale[2] * 0.8), up=-0.9, face=0.3)

@model('tree_pine', '黒松', '自然')
def tree_pine(): pine(9.0, 1.3, 3, 11)

@model('tree_pine_b', '黒松(海辺・傾き)', '自然')
def tree_pine_b(): pine(7.4, 2.3, 7, 9, 2.8)

def canopy(clumps, dark='leaf_dark', card='leaf_card', card_dark='leaf_card_dark', seed=0, size=1.25, per=44, core_sub=2):
    """Broadleaf crown made of leaf clumps (葉房): each clump is a small dark core that hides the gaps, a dome of leaf
    cards standing up on its top and sides, and a few darker cards hanging under it. The game shades every clump
    as its own ball of leaves (sunlit yellow-green top, blue-green underside)."""
    for k, (c, r) in enumerate(clumps):
        ico(dark, r * 0.45, Vector(c) - Vector((0, 0, r * 0.12)), (1, 1, 0.68), core_sub, 0.25, seed + k)
        cards(card, c, r, per, size, seed * 31 + k, (1, 1, 0.75), up=0.7, shell=(0.55, 1.0), face=0.65)
        cards(card_dark, Vector(c) - Vector((0, 0, r * 0.3)), r * 0.85, per // 4, size, seed * 37 + k, (1, 1, 0.5), up=-0.5, face=0.4)

def branch_tree(rnd, trunk_h, trunk_r, limbs, spread, top, clump_r, bark='bark', gnarl=0.0):
    """Trunk that forks into spreading limbs, each limb splitting into twigs; returns the twig tips (clump centres).
    gnarl > 0: the trunk and limbs are one bent, lumpy swept tube each (sakura, camphor) instead of straight rods."""
    lean = Vector((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 0))
    fork = Vector((0, 0, trunk_h)) + lean
    if gnarl:
        side = Vector((-lean.y, lean.x, 0)) * gnarl * 1.5
        tube(bark, [(0, 0, -0.2), (0, 0, 0.3), lean * 0.15 + side * 0.5 + Vector((0, 0, trunk_h * 0.35)),
                    lean * 0.55 - side * 0.4 + Vector((0, 0, trunk_h * 0.7)), fork],
             [trunk_r * 1.08, trunk_r, trunk_r * 0.9, trunk_r * 0.82, trunk_r * 0.74], 10, wob=0.22 * gnarl, seed=3, lobes=4, lobe_amp=0.12, lobe_fade=0.3)
        ico(bark, trunk_r * 0.74, fork, sub=2)
    else:
        rod(bark, (0, 0, -0.2), (lean.x * 0.4, lean.y * 0.4, trunk_h * 0.5), trunk_r, 10, r2=trunk_r * 0.88)
        rod(bark, (lean.x * 0.4, lean.y * 0.4, trunk_h * 0.5), fork, trunk_r * 0.88, 10, r2=trunk_r * 0.7)
        ico(bark, trunk_r * 0.72, fork, sub=1)
    for k in range(4):  # root flare
        a = k * math.pi / 2 + 0.4
        if gnarl:
            D = Vector((math.cos(a), math.sin(a), 0))
            tube(bark, [D * trunk_r * 0.4 + Vector((0, 0, 0.5)), D * trunk_r * 1.1 + Vector((0, 0, 0.12)), D * trunk_r * 2.0 + Vector((0, 0, -0.1))], [trunk_r * 0.45, trunk_r * 0.3, trunk_r * 0.12], 6)
        else:
            rod(bark, (math.cos(a) * trunk_r * 0.5, math.sin(a) * trunk_r * 0.5, 0.45), (math.cos(a) * trunk_r * 1.7, math.sin(a) * trunk_r * 1.7, -0.15), trunk_r * 0.4, 6)
    tips = []
    a0 = rnd.uniform(0, math.tau)
    for k in range(limbs):
        a = a0 + k * math.tau / limbs + rnd.uniform(-0.3, 0.3)
        reach = spread * rnd.uniform(0.55, 0.75)
        mid = fork + Vector((math.cos(a) * reach, math.sin(a) * reach, (top - trunk_h) * rnd.uniform(0.35, 0.55)))
        bend = fork + (mid - fork) * 0.5 + Vector((0, 0, -(top - trunk_h) * 0.12))   # limbs arch out, then rise
        if gnarl:
            kink = Vector((-math.sin(a), math.cos(a), 0)) * gnarl * 0.35 * (1 if k % 2 else -1)
            tube(bark, [fork, fork + (bend - fork) * 0.5 + kink * 0.5, bend + kink, mid], [trunk_r * 0.62, trunk_r * 0.55, trunk_r * 0.46, trunk_r * 0.34], 8, wob=0.15 * gnarl, seed=k)
        else:
            rod(bark, fork, bend, trunk_r * 0.62, 8, r2=trunk_r * 0.5); ico(bark, trunk_r * 0.5, bend, sub=1)
            rod(bark, bend, mid, trunk_r * 0.5, 8, r2=trunk_r * 0.36)
        ico(bark, trunk_r * 0.36, mid, sub=1)
        for j in range(rnd.choice((2, 3))):
            b = a + rnd.uniform(-0.8, 0.8); rr = spread * rnd.uniform(0.25, 0.5)
            tip = mid + Vector((math.cos(b) * rr, math.sin(b) * rr, (top - mid.z) * rnd.uniform(0.3, 0.85)))
            if gnarl:
                tube(bark, [mid, mid + (tip - mid) * 0.5 + Vector((0, 0, -0.15 * gnarl)), tip], [trunk_r * 0.32, trunk_r * 0.22, trunk_r * 0.1], 6)
            else:
                rod(bark, mid, tip, trunk_r * 0.32, 6, r2=trunk_r * 0.12)
            tips.append((tuple(tip), clump_r * rnd.uniform(0.85, 1.15)))
    tips.append(((fork.x, fork.y, top), clump_r * 1.15))   # crown top
    for k in range(3):   # inner clumps fill the middle of the crown
        a = a0 + k * 2.1 + 0.5
        tips.append(((fork.x + math.cos(a) * spread * 0.3, fork.y + math.sin(a) * spread * 0.3, (top + trunk_h) * 0.5 + 0.6), clump_r * 0.95))
    return tips

@model('tree_broadleaf', '広葉樹(クスノキ)', '自然')
def tree_broadleaf():
    rnd = random.Random(4)
    tips = branch_tree(rnd, 2.2, 0.36, 4, 3.4, 6.0, 1.35)
    canopy(tips, seed=4, size=1.5, per=34)

@model('tree_shinboku', 'ご神木(大楠・しめ縄)', '神社')
def tree_shinboku():
    """Sacred camphor (御神木): a massive fluted trunk on buttress roots, five huge limbs arching into a broad crown of
    leaf clumps, and a shimenawa (twisted straw rope) with shide paper streamers and straw tassels."""
    rnd = random.Random(8)
    tube('bark_kusu', [(0, 0, -0.3), (0, 0, 0.7), (0.04, 0.02, 1.8), (0.1, 0.05, 2.9), (0.16, 0.06, 3.9), (0.2, 0.1, 4.7)],
         [1.18, 1.05, 0.97, 0.92, 0.86, 0.8], 16, wob=0.12, seed=8, lobes=5, lobe_amp=0.12, lobe_fade=0.35)
    top = Vector((0.2, 0.1, 4.7)); ico('bark_kusu', 0.8, top, sub=2, jitter=0.15, seed=3)
    for k in range(7):  # buttress roots snaking over the ground
        a = k * math.tau / 7 + rnd.uniform(-0.2, 0.2); D = Vector((math.cos(a), math.sin(a), 0)); Sd = Vector((-D.y, D.x, 0))
        w = rnd.uniform(-0.35, 0.35); ln = rnd.uniform(2.2, 3.2)
        tube('bark_kusu', [D * 0.6 + Vector((0, 0, 1.0)), D * 1.15 + Vector((0, 0, 0.35)), D * 1.8 + Sd * w + Vector((0, 0, 0.08)), D * ln + Sd * w * 2 + Vector((0, 0, -0.12))],
             [0.45, 0.34, 0.2, 0.08], 7, wob=0.15, seed=k)
    cl = []; a0 = rnd.uniform(0, math.tau)
    for k in range(5):  # limbs
        a = a0 + k * math.tau / 5 + rnd.uniform(-0.25, 0.25); D = Vector((math.cos(a), math.sin(a), 0))
        s0 = top + D * 0.3 - Vector((0, 0, 0.5 + 0.25 * (k % 2)))
        bend = s0 + D * 1.3 + Vector((0, 0, 0.9)); mid = s0 + D * rnd.uniform(1.9, 2.3) + Vector((0, 0, rnd.uniform(2.1, 2.7)))
        tube('bark_kusu', [s0, s0 + D * 0.6 + Vector((0, 0, 0.6)), bend, mid], [0.5, 0.42, 0.33, 0.22], 8, wob=0.15, seed=20 + k)
        ico('bark_kusu', 0.22, mid, sub=1)
        for j in range(2):
            b = a + (j - 0.5) * 1.1 + rnd.uniform(-0.3, 0.3)
            tip = mid + Vector((math.cos(b) * rnd.uniform(0.8, 1.2), math.sin(b) * rnd.uniform(0.8, 1.2), rnd.uniform(0.8, 1.8)))
            tube('bark_kusu', [mid, (mid + tip) * 0.5 + Vector((0, 0, -0.1)), tip], [0.2, 0.13, 0.06], 6)
            cl.append((tuple(tip), rnd.uniform(1.75, 2.15)))
    cl.append(((0.2, 0.1, 10.4), 2.25))
    for k in range(4):
        a = a0 + k * 1.57 + 0.7
        cl.append(((math.cos(a) * 1.9, math.sin(a) * 1.9, 8.9), 1.9))
    canopy(cl, seed=8, size=1.6, per=40)
    # shimenawa: two straw strands twisted round each other, tied round the trunk
    R, z0 = 1.09, 2.25
    for s in range(2):
        pts = []
        for i in range(41):
            th = i / 40 * math.tau; tw = th * 9 + s * math.pi
            rr = R + 0.075 * math.cos(tw)
            pts.append((math.cos(th) * rr, math.sin(th) * rr, z0 + 0.075 * math.sin(tw)))
        tube('straw', pts, [0.085] * 41, 6, cap=False)
    for k in range(4):  # shide (zigzag paper) and straw tassels between them, on the front half
        a = -math.pi / 2 + (k - 1.5) * 0.55; D = Vector((math.cos(a), math.sin(a), 0))
        p = D * (R + 0.14) + Vector((0, 0, z0 - 0.08))
        prism('paper', [(0, 0), (0.11, -0.1), (0, -0.22), (0.11, -0.32), (0, -0.44), (0.11, -0.54)], 0.04, loc=tuple(p), axis='Y', rot=(0, 0, a))
        q = Vector(p) + Vector((-D.y, D.x, 0)) * 0.3
        cyl('straw', 0.045, 0.32, (q.x, q.y, z0 - 0.4), 6, r2=0.07)

@model('tree_sakura', '桜', '自然')
def tree_sakura():
    rnd = random.Random(5)
    tips = branch_tree(rnd, 1.45, 0.27, 5, 1.6, 4.5, 0.95, bark='bark_sakura', gnarl=1.0)
    canopy(tips, dark='sakura', card='sakura_card', card_dark='sakura_card', seed=5, size=1.05, per=34)

@model('tree_cedar', '杉', '自然')
def tree_cedar():
    """Japanese cedar (sugi): a tall straight reddish trunk and a narrow cone of drooping foliage tiers, each tier a ring
    of small sagging clumps on short boughs."""
    rnd = random.Random(50)
    tube('wood_red', [(0, 0, -0.2), (0, 0, 2.5), (0.04, 0.02, 6.5), (0.06, 0.0, 10.0), (0.06, 0.0, 12.0)], [0.33, 0.26, 0.17, 0.08, 0.03], 8, wob=0.06)
    for k in range(4):
        a = k * math.pi / 2 + 0.3; D = Vector((math.cos(a), math.sin(a), 0))
        tube('wood_red', [D * 0.12 + Vector((0, 0, 0.5)), D * 0.4 + Vector((0, 0, 0.08)), D * 0.62 + Vector((0, 0, -0.1))], [0.17, 0.1, 0.04], 6)
    tiers = 11
    for k in range(tiers):
        f = k / (tiers - 1); z = 3.0 + f * 8.4; R = 1.58 * (1 - f) ** 1.15 + 0.16
        n = max(1, round(1.4 + R * 2.4)) if k < tiers - 1 else 1
        a0 = rnd.uniform(0, math.tau)
        for j in range(n):
            a = a0 + j * math.tau / n + rnd.uniform(-0.3, 0.3); D = Vector((math.cos(a), math.sin(a), 0))
            rr = R * 0.62 if n > 1 else 0.0; cr = R * 0.42 + 0.28
            c = D * rr + Vector((0, 0, z - cr * 0.3))
            if n > 1: rod('wood_red', (0, 0, z + 0.35), tuple(c + Vector((0, 0, cr * 0.1))), 0.06, 4, r2=0.025)
            sc = (1.25, 1.25, 0.5) if n > 1 else (0.85, 0.85, 1.1)
            ico('pine', cr * 0.55, c, sc, 2 if cr > 0.75 else 1, 0.3, k * 7 + j)
            cards('cedar_card', c, cr, int(12 + cr * 10), cr * 0.45 + 0.28, 500 + k * 13 + j, sc, up=-0.25, shell=(0.55, 1.0), face=0.45)
    cards('cedar_card', (0.06, 0, 11.6), 0.45, 10, 0.55, 599, (0.8, 0.8, 1.4), up=0.6, face=0.5)

@model('bush', '植え込み', '自然')
def bush():
    for k in range(3):
        a = k * 2.1; rod('bark', (0, 0, 0), (math.cos(a) * 0.35, math.sin(a) * 0.3, 0.45), 0.04, 5, r2=0.02)
    cl = [((math.cos(k * 1.26 + 0.3) * 0.6, math.sin(k * 1.26 + 0.3) * 0.5, 0.5 + 0.08 * (k % 2)), 0.48 + 0.05 * (k % 3)) for k in range(5)]
    cl.append(((0.05, 0.02, 0.74), 0.5))
    canopy(cl, dark='leaf_dark', card='shrub_card', card_dark='shrub_card', seed=70, size=0.62, per=30)

@model('hydrangea', '紫陽花', '自然')
def hydrangea():
    cl = [((math.cos(k * 1.57 + 0.4) * 0.5, math.sin(k * 1.57 + 0.4) * 0.42, 0.42), 0.46) for k in range(4)]
    cl.append(((0, 0, 0.66), 0.48))
    canopy(cl, dark='leaf_dark', card='leaf_card', card_dark='leaf_card_dark', seed=80, size=0.6, per=24)
    rnd = random.Random(81)
    for k in range(12):  # mophead flower heads sitting on the leaf mound
        a = k * 2.4 + rnd.uniform(-0.3, 0.3); r = 0.3 + 0.55 * ((k * 0.618) % 1)
        z = 1.02 - r * 0.42 + rnd.uniform(-0.05, 0.05)
        s = rnd.uniform(0.17, 0.22)
        ico('hydrangea' if k % 3 else 'hydrangea_pink', s, (math.cos(a) * r, math.sin(a) * r * 0.9, z), (1, 1, 0.85), 2, 0.3, k)

@model('grass_tuft', '草むら', '自然', lod=False)
def grass_tuft():
    rnd = random.Random(2)
    for k in range(36):
        a = rnd.random() * math.tau; r = 0.35 * rnd.random() ** 0.7
        h = rnd.uniform(0.3, 0.72) * (1.0 - 0.35 * r); lean = rnd.uniform(0.08, 0.28) * (0.6 + r * 1.4)
        ba = a + rnd.uniform(-0.6, 0.6); D = Vector((math.cos(ba), math.sin(ba), 0)); W = Vector((-D.y, D.x, 0))
        p0 = Vector((math.cos(a) * r, math.sin(a) * r, 0)); w = rnd.uniform(0.022, 0.04); tw = rnd.uniform(-0.4, 0.4)
        vs = []
        for t in (0.0, 0.4, 0.75):
            q = p0 + D * lean * t * t + Vector((0, 0, h * t * (1 - 0.3 * lean * t)))
            ww = (W + D * tw * t) * w * (1 - t * 0.75)
            vs += [q - ww, q + ww]
        vs.append(p0 + D * lean + Vector((0, 0, h * (1 - 0.3 * lean))))
        m = 'leaf' if h < 0.4 and k % 2 else ('leaf_light' if k % 4 == 0 else 'grass_blade')
        mesh(m, vs, [(0, 1, 3, 2), (2, 3, 5, 4), (4, 5, 6)])

def _hb_strata(layers, dip, az, base=-0.3, cuts=(), sub=3):
    """Sedimentary rock: stacked chunks cut by parallel tilted bedding planes, plus flat fracture faces.
    layers: [(mat, r, loc, scale, seed, d0, d1)] with d measured along the bedding normal."""
    n = Vector((math.sin(dip) * math.cos(az), math.sin(dip) * math.sin(az), math.cos(dip)))
    for mat, r, loc, scale, seed, d0, d1 in layers:
        planes = [((0, 0, base), (0, 0, -1))]
        if d0 is not None: planes.append((n * d0, -n))
        if d1 is not None: planes.append((n * d1, n))
        _hb_rock_chunk(mat, r, loc, scale, seed, planes + list(cuts), sub=sub, jitter=0.22)  # sub 3 = 320 faces

@model('rock_a', '岩(A)', '自然')
def rock_a():
    cuts = [((1.15, 0.2, 0), (0.95, 0.15, 0.25)), ((-0.6, -0.8, 0), (-0.35, -0.9, 0.2))]
    _hb_strata([('hb_rock_dark', 1.0, (0, 0, 0.3), (1.38, 1.08, 0.85), 1, None, 0.3),
                ('rock', 1.0, (-0.08, 0.05, 0.45), (1.25, 1.0, 0.8), 2, 0.3, 0.78),
                ('hb_rock_warm', 0.8, (-0.22, 0.05, 0.75), (1.1, 0.95, 0.75), 3, 0.78, None)], 0.32, 0.7, cuts=cuts)
    _hb_rock_chunk('rock', 0.32, (1.05, -0.75, 0.05), (1.2, 1, 0.8), 9, [((0, 0, -0.3), (0, 0, -1))], sub=1, jitter=0.25)
    ico('moss', 0.25, (-0.45, 0.25, 1.32), (1.6, 1.1, 0.22), 1, 0.3, 4)

@model('rock_b', '岩(B・平たい)', '自然')
def rock_b():
    cuts = [((1.55, 0, 0), (1, 0.1, 0.15)), ((-1.3, 0.6, 0), (-0.8, 0.6, 0.1))]
    _hb_strata([('hb_rock_dark', 1.0, (0, 0, 0.15), (1.7, 1.3, 0.5), 2, None, 0.18),
                ('rock', 1.0, (-0.12, -0.05, 0.25), (1.5, 1.15, 0.45), 5, 0.18, 0.46),
                ('hb_rock_warm', 0.8, (-0.35, 0.05, 0.45), (1.25, 1.05, 0.4), 7, 0.46, None)], 0.12, 2.2, cuts=cuts)
    _hb_rock_chunk('rock', 0.6, (0.95, 0.55, 0.2), (1, 1, 0.8), 4, [((0, 0, -0.3), (0, 0, -1)), ((0.95, 0.55, 0.55), (0.2, 0, 1))], sub=3, jitter=0.25)
    ico('moss', 0.2, (-0.6, -0.1, 0.76), (1.8, 1.2, 0.18), 1, 0.3, 6)

@model('rock_c', '岩(C・海岸の大岩)', '自然')
def rock_c():
    dip, az = 0.55, -0.4
    cuts = [((2.0, -0.3, 0), (1, -0.25, 0.1)), ((-1.2, -1.6, 0), (-0.4, -1, 0.05))]
    _hb_strata([('hb_rock_wet', 2.0, (0, 0, 1.0), (1.25, 1.05, 1.0), 3, None, 0.35),
                ('hb_rock_dark', 2.0, (-0.1, 0.05, 1.3), (1.15, 1.0, 1.0), 13, 0.35, 1.5),
                ('rock', 1.8, (-0.25, 0.1, 1.6), (1.1, 0.95, 1.0), 23, 1.5, 2.6),
                ('hb_rock_warm', 1.4, (-0.5, 0.15, 2.3), (1.1, 0.95, 0.9), 33, 2.6, None)], dip, az, base=-0.3, cuts=cuts)
    _hb_rock_chunk('hb_rock_dark', 1.3, (1.85, 0.7, 0.55), (1, 1, 0.8), 5, [((0, 0, -0.3), (0, 0, -1)), ((1.85, 0.7, 1.15), (0.3, 0.1, 1))], sub=3, jitter=0.25)
    _hb_rock_chunk('hb_rock_wet', 0.9, (-1.65, -0.85, 0.35), (1, 1, 0.8), 6, [((0, 0, -0.3), (0, 0, -1))], sub=2, jitter=0.25)
    ico('moss', 0.5, (-0.7, 0.3, 3.75), (1.6, 1.1, 0.2), 1, 0.3, 8)

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

@model('nagi', 'なぎ(操作キャラ・港町の子猫)', '人物', lod=False)
def nagi():
    # Original chibi mascot (about 2 heads tall, 1.2 m): an orange tabby kitten in a straw hat, a yellow raincoat,
    # a red neckerchief, a fish-shaped pouch and yellow rain boots. Parts: nagi_head (pivot at the neck),
    # nagi_arm_l/r (shoulders), nagi_leg_l/r (hips), nagi_tail (base of the tail).
    cyl('raincoat', 0.22, 0.34, (0, 0, 0.27), 20, r2=0.16)
    torus('raincoat', 0.215, 0.025, (0, 0, 0.28), seg=20, rseg=6)
    ico('raincoat', 0.16, (0, 0, 0.6), (1.05, 0.95, 0.45), 2)
    for z in (0.36, 0.45, 0.54): ico('white', 0.022, (0, -0.205 + (z - 0.27) * 0.18, z), sub=1)
    ico('raincoat', 0.13, (0, 0.11, 0.6), (1.25, 0.55, 0.6), 2)                       # hood folded on the back
    torus('raincoat', 0.11, 0.02, (0, 0.13, 0.62), rot=(1.2, 0, 0), seg=14, rseg=4)
    for sx in (-1, 1):                                                                  # pocket flaps and seams
        _pv_shell('raincoat', [(0.21, 0.36, 0.22), (0.2, 0.4, 0.22)], seg=4, t=0.012, a_mid=-math.pi / 2 + sx * 0.7)
    rod('raincoat', (0.0, -0.217, 0.29), (0.0, -0.168, 0.6), 0.007, 4)
    torus('cloth_red', 0.12, 0.035, (0, 0, 0.64), seg=18, rseg=6)
    prism('cloth_red', [(-0.07, 0.0), (0.07, 0.0), (0, -0.12)], 0.025, loc=(0, -0.155, 0.63), axis='Y')
    rod('cloth_khaki', (-0.15, -0.1, 0.6), (0.2, -0.05, 0.36), 0.012, 4)
    ico('cloth_blue', 0.075, (0.22, -0.05, 0.34), (1.6, 0.6, 1.0), 2)  # fish pouch
    prism('cloth_blue', [(0, 0), (0.08, 0.06), (0.08, -0.06)], 0.03, loc=(0.335, -0.05, 0.34), axis='Y')
    ico('white', 0.016, (0.165, -0.1, 0.355), sub=1); ico('eye', 0.009, (0.165, -0.112, 0.355), sub=1)
    part('nagi_head', (0, 0, 0.64))
    ico('fur_orange', 0.3, (0, 0, 0.9), (1.12, 1.0, 0.93), 3)
    ico('fur_white', 0.15, (0, -0.215, 0.83), (1.35, 0.55, 0.8), 3)  # muzzle
    for sx in (-1, 1):
        ico('eye', 0.058, (sx * 0.115, -0.262, 0.915), (0.82, 0.42, 1.25), 2)
        ico('white', 0.019, (sx * 0.115 + 0.015, -0.29, 0.945), sub=1)
        ico('white', 0.009, (sx * 0.115 - 0.017, -0.285, 0.89), sub=1)
        ico('cheek', 0.05, (sx * 0.2, -0.215, 0.8), (1.1, 0.35, 0.65), 1)
        for k in (-1, 1): rod('ink', (sx * 0.25, -0.22, 0.83 + k * 0.02), (sx * 0.38, -0.2, 0.84 + k * 0.045), 0.004, 3)  # whiskers
        o = cyl('fur_orange', 0.11, 0.21, (sx * 0.2, 0.0, 1.02), 10, r2=0.0); o.rotation_euler = (0, sx * 0.45, 0)  # ears
        o = cyl('nose_pink', 0.07, 0.15, (sx * 0.2, -0.035, 1.03), 10, r2=0.0); o.rotation_euler = (0, sx * 0.45, 0)
    ico('nose_pink', 0.026, (0, -0.3, 0.865), (1.2, 0.7, 0.8), 2)
    for sx in (-1, 1): rod('ink', (0, -0.3, 0.84), (sx * 0.035, -0.295, 0.815), 0.006, 3)  # mouth
    for k in (-1, 0, 1): ico('fur_dark', 0.05, (k * 0.07, -0.18, 1.07 - abs(k) * 0.02), (0.35, 0.5, 1.0), 1)  # tabby stripes
    with xf((0, 0.06, 1.13), rx=-0.28):  # small straw hat tipped back
        cyl('straw', 0.27, 0.018, (0, 0, 0), 28, r2=0.25)
        ico('straw', 0.16, (0, 0, 0.0), (1, 1, 0.75), 3, flat_bottom=0)
        torus('cloth_red', 0.152, 0.016, (0, 0, 0.03), seg=24, rseg=5)
    part(None)
    for sx, sd in ((-1, 'l'), (1, 'r')):
        part(f'nagi_arm_{sd}', (sx * 0.19, 0, 0.56))
        rod('raincoat', (sx * 0.19, 0, 0.56), (sx * 0.27, -0.03, 0.4), 0.062, 10)
        ico('fur_white', 0.062, (sx * 0.28, -0.035, 0.37), sub=2)
        torus('raincoat', 0.058, 0.016, (sx * 0.268, -0.028, 0.415), rot=(0.18, -sx * 0.45, 0), seg=10, rseg=3)   # sleeve cuff
        part(f'nagi_leg_{sd}', (sx * 0.09, 0, 0.28))
        cyl('fur_orange', 0.068, 0.16, (sx * 0.09, 0, 0.12), 10)
        cyl('raincoat', 0.085, 0.13, (sx * 0.09, 0, 0.0), 12, r2=0.078)  # rain boots
        ico('raincoat', 0.085, (sx * 0.09, -0.05, 0.035), (1, 1.3, 0.55), 2, flat_bottom=-0.035)
        _pv_rbox('pv_shoe_brown', (0.16, 0.24, 0.02), (sx * 0.09, -0.035, 0.0), 0.01)          # sole
        torus('raincoat', 0.08, 0.012, (sx * 0.09, 0, 0.13), seg=10, rseg=3)                   # boot rim
        part(None)
    part('nagi_tail', (0, 0.17, 0.33))
    pts = [(0, 0.17, 0.33), (0, 0.3, 0.38), (0.0, 0.4, 0.52), (0.04, 0.4, 0.68), (0.09, 0.33, 0.78)]
    for i in range(4): rod('fur_orange' if i % 2 == 0 else 'fur_dark', pts[i], pts[i + 1], 0.045 - i * 0.004, 8)
    ico('fur_white', 0.04, pts[-1], sub=1)
    part(None)



PALETTE.update({'shiba_red': P((0.66, 0.26, 0.07), 0.85), 'shiba_cream': P((0.93, 0.84, 0.68), 0.85),
                'shiba_inner': P((0.98, 0.72, 0.62), 0.8), 'shiba_band': P((0.05, 0.1, 0.32), 0.8),
                'shiba_tongue': P((0.95, 0.38, 0.42), 0.4)})

@model('shiba', 'なぎ(操作キャラ・豆柴)', '人物', lod=False)
def shiba():
    # The player: a chibi Shiba Inu (about 2.2 heads tall, 1.25 m) with the breed's markings: red coat, white "urajiro"
    # cheeks, muzzle, chest, belly and paws, "maro" eyebrow dots, pricked triangular ears and a tail curled over the back.
    # A navy bandana with a white wave pattern. Parts (the game nests them: body > head > ears, body > arms, tail):
    # shiba_body (hips), shiba_head (neck), shiba_ear_l/r (ear roots), shiba_arm_l/r (shoulders), shiba_leg_l/r (hips),
    # shiba_tail (tail root).
    part('shiba_body', (0, 0, 0.3))
    ico('shiba_red', 0.22, (0, 0.01, 0.47), (1.0, 0.86, 1.12), 3)                     # torso
    ico('shiba_cream', 0.17, (0, -0.1, 0.47), (0.86, 0.5, 1.12), 3)                   # white chest and belly
    ico('shiba_red', 0.17, (0, 0.06, 0.32), (1.05, 0.95, 0.6), 2)                     # hips
    torus('shiba_band', 0.125, 0.032, (0, 0.0, 0.645), seg=20, rseg=6)                 # bandana round the neck
    prism('shiba_band', [(-0.11, 0.0), (0.11, 0.0), (0, -0.15)], 0.03, loc=(0, -0.13, 0.64), axis='Y')
    for k, (x, z) in enumerate([(-0.05, 0.6), (0.05, 0.6), (0.0, 0.55), (-0.025, 0.515), (0.025, 0.515)]):
        torus('white', 0.017, 0.004, (x, -0.15 - abs(x) * 0.1, z), rot=(math.pi / 2, 0, 0), seg=8, rseg=3)   # wave rings
    part(None)
    part('shiba_head', (0, 0, 0.66))
    ico('shiba_red', 0.3, (0, 0.0, 0.94), (1.12, 0.98, 0.92), 3)                      # head
    for sx in (-1, 1):
        ico('shiba_cream', 0.13, (sx * 0.13, -0.19, 0.84), (1.0, 0.55, 0.78), 3)       # urajiro cheeks
        ico('shiba_cream', 0.03, (sx * 0.1, -0.262, 1.05), (1.35, 0.4, 0.75), 2)       # maro eyebrows
        ico('eye', 0.046, (sx * 0.112, -0.262, 0.945), (0.85, 0.45, 1.12), 2)          # eyes with highlights
        ico('white', 0.016, (sx * 0.112 + 0.012, -0.284, 0.968), sub=1)
        ico('white', 0.007, (sx * 0.112 - 0.014, -0.282, 0.925), sub=1)
        ico('cheek', 0.04, (sx * 0.2, -0.205, 0.86), (1.1, 0.35, 0.6), 1)              # blush
    ico('shiba_cream', 0.12, (0, -0.245, 0.855), (1.05, 0.95, 0.72), 3)                # muzzle
    ico('shiba_cream', 0.11, (0, -0.16, 0.79), (1.2, 0.8, 0.6), 2)                     # chin
    ico('ink', 0.036, (0, -0.352, 0.885), (1.35, 0.8, 0.85), 2)                         # nose
    ico('white', 0.01, (0.012, -0.375, 0.9), sub=1)
    rod('ink', (0, -0.352, 0.86), (0, -0.348, 0.835), 0.006, 3)
    for sx in (-1, 1): _pv_tube('ink', [(0, -0.348, 0.835), (sx * 0.03, -0.345, 0.82), (sx * 0.058, -0.33, 0.835)], 0.006, 4)   # smile
    ico('shiba_tongue', 0.026, (0.0, -0.335, 0.808), (1.1, 0.7, 1.2), 2)                 # tongue
    part(None)
    for sx, sd in ((-1, 'l'), (1, 'r')):
        part(f'shiba_ear_{sd}', (sx * 0.16, -0.01, 1.12))
        with xf((sx * 0.16, -0.01, 1.1), ry=sx * 0.28, rx=0.12):
            o = cyl('shiba_red', 0.105, 0.22, (0, 0, 0), 4, r2=0.0); o.rotation_euler = (0, 0, math.pi / 4); o.scale = (1.0, 0.55, 1.0)
            o = cyl('shiba_inner', 0.075, 0.16, (0, -0.03, 0.01), 4, r2=0.0); o.rotation_euler = (0, 0, math.pi / 4); o.scale = (1.0, 0.3, 1.0)
            o = cyl('shiba_cream', 0.05, 0.08, (0, -0.045, 0.0), 6, r2=0.0); o.scale = (1.0, 0.4, 1.0)   # fluffy inner fur
        part(None)
        part(f'shiba_arm_{sd}', (sx * 0.2, 0, 0.6))
        _pv_tube('shiba_red', [(sx * 0.2, 0, 0.6), (sx * 0.25, -0.02, 0.5), (sx * 0.27, -0.035, 0.41)], [0.068, 0.06, 0.055], 10)
        ico('shiba_cream', 0.062, (sx * 0.275, -0.04, 0.375), (1.0, 1.05, 0.95), 2)    # white paw
        for k in (-1, 0, 1): rod('shiba_red', (sx * 0.275 + k * 0.022, -0.095, 0.375), (sx * 0.275 + k * 0.022, -0.1, 0.36), 0.006, 3)   # toe lines
        part(None)
        part(f'shiba_leg_{sd}', (sx * 0.1, 0, 0.3))
        _pv_tube('shiba_red', [(sx * 0.1, 0.0, 0.3), (sx * 0.1, -0.005, 0.18), (sx * 0.1, 0.0, 0.1)], [0.085, 0.07, 0.062], 10)
        ico('shiba_cream', 0.072, (sx * 0.1, -0.045, 0.045), (1.0, 1.45, 0.62), 2)        # white sock and foot
        for k in (-1, 0, 1): rod('shiba_red', (sx * 0.1 + k * 0.024, -0.15, 0.045), (sx * 0.1 + k * 0.024, -0.15, 0.02), 0.006, 3)
        part(None)
    part('shiba_tail', (0, 0.16, 0.4))
    curl = [(0, 0.16, 0.4), (0, 0.27, 0.48), (0, 0.32, 0.6), (0, 0.27, 0.71), (0, 0.17, 0.73), (0.02, 0.12, 0.66), (0.04, 0.16, 0.6)]
    _pv_tube('shiba_red', curl, [0.07, 0.075, 0.075, 0.07, 0.062, 0.05, 0.035], 10)
    _pv_tube('shiba_cream', [(0, 0.2, 0.42), (0, 0.29, 0.5), (0, 0.32, 0.59)], [0.05, 0.055, 0.045], 8)   # white underside of the curl
    ico('shiba_cream', 0.04, curl[-1], sub=2)
    part(None)


# ================================================================= 江ノ島 (Enoshima) atmosphere
PALETTE.update({'enz_teak': P((0.5, 0.32, 0.17), 0.7), 'enz_sail': P((0.95, 0.94, 0.9), 0.85), 'enz_tb_brown': P((0.26, 0.15, 0.07), 0.85),
                'enz_tb_dark': P((0.09, 0.06, 0.04), 0.85), 'enz_tb_light': P((0.5, 0.36, 0.2), 0.85), 'enz_board_blue': P((0.1, 0.45, 0.8), 0.35),
                'enz_board_white': P((0.93, 0.93, 0.9), 0.35), 'enz_canvas_blue': P((0.05, 0.25, 0.6), 0.9)})

@model('sea_candle', '展望灯台(シーキャンドル風)', '灯台・展望台')
def sea_candle():
    # observation lighthouse in the spirit of Enoshima's Sea Candle: a slim white core wrapped in a twisting lattice,
    # a glazed observation deck, an open roof deck and the lantern on top. Part: sea_candle_lamp (turns).
    cyl('concrete', 5.4, 0.4, (0, 0, 0), 24)                                     # podium
    cyl('plaster_white', 4.6, 3.6, (0, 0, 0.4), 24)                              # entrance pavilion
    for k in range(8):
        a = k / 8 * math.tau
        with xf((math.cos(a) * 4.62, math.sin(a) * 4.62, 0.4), rz=a + math.pi / 2): box('glass', (2.6, 0.06, 2.6), (0, 0, 0.3))
    cyl('white', 4.9, 0.25, (0, 0, 4.0), 24)
    cyl('plaster_white', 1.35, 29.0, (0, 0, 4.2), 16, r2=1.2)                    # core
    # twisting lattice: 10 helical members and rings, wider at the bottom
    N, H0, H1 = 10, 4.2, 29.5
    for k in range(N):
        pts = []
        for j in range(13):
            t = j / 12; z = H0 + (H1 - H0) * t; r = 3.4 - 0.9 * t; a = k / N * math.tau + t * 1.6
            pts.append((math.cos(a) * r, math.sin(a) * r, z))
        _pv_tube('white', pts, 0.12, 5, cap=False)
    for j in range(7):
        t = j / 6; torus('white', 3.4 - 0.9 * t, 0.09, (0, 0, H0 + (H1 - H0) * t), seg=24, rseg=4)
    # glazed observation deck and open roof deck
    cyl('white', 4.4, 0.35, (0, 0, 29.4), 24)
    cyl('glass', 4.1, 2.8, (0, 0, 29.75), 24)
    for k in range(12):
        a = k / 12 * math.tau; rod('white', (math.cos(a) * 4.12, math.sin(a) * 4.12, 29.75), (math.cos(a) * 4.12, math.sin(a) * 4.12, 32.55), 0.06, 4)
    cyl('white', 4.6, 0.3, (0, 0, 32.55), 24)
    torus('alu', 4.45, 0.04, (0, 0, 33.9), seg=32, rseg=4)
    for k in range(16):
        a = k / 16 * math.tau; rod('alu', (math.cos(a) * 4.45, math.sin(a) * 4.45, 32.85), (math.cos(a) * 4.45, math.sin(a) * 4.45, 33.9), 0.03, 4)
    cyl('plaster_white', 1.5, 1.6, (0, 0, 32.85), 16)
    # lantern
    cyl('white', 1.35, 0.25, (0, 0, 34.45), 16)
    part('sea_candle_lamp', (0, 0, 35.6))
    cyl('glass', 1.15, 2.0, (0, 0, 34.7), 16)
    ico('lamp', 0.5, (0, 0, 35.6), (1, 1, 1.2), 2)
    box('lamp', (0.12, 2.0, 0.6), (0, 0, 35.3))
    part(None)
    for k in range(8):
        a = k / 8 * math.tau; rod('white', (math.cos(a) * 1.16, math.sin(a) * 1.16, 34.7), (math.cos(a) * 1.16, math.sin(a) * 1.16, 36.7), 0.035, 4)
    ico('white', 1.25, (0, 0, 36.75), (1, 1, 0.45), 2, flat_bottom=0)
    rod('steel_dark', (0, 0, 37.2), (0, 0, 39.6), 0.05, 5)
    ico('beacon_red', 0.12, (0, 0, 39.7), sub=1)

def _enz_yacht(sails):
    L, B, D = 9.0, 3.0, 1.15
    rings = []
    for i in range(17):
        t = i / 16; y = -L / 2 + L * t                                            # bow (-Y) .. stern (+Y)
        hb = B / 2 * (min(1.0, (t / 0.55)) ** 0.55 if t < 0.55 else 1.0 - 0.12 * (t - 0.55) / 0.45)
        hb = max(0.03, hb); sh = D + 0.25 * (1 - t) ** 2
        rings.append([(-hb, y, sh), (-hb * 0.97, y, 0.35), (-hb * 0.55, y, -0.1), (0, y, -0.28 * (0.3 + 0.7 * math.sin(math.pi * min(1, t * 1.1)))),
                      (hb * 0.55, y, -0.1), (hb * 0.97, y, 0.35), (hb, y, sh)])
    loft('white', rings, closed=False, cap=False)
    deck = [[r[0], ((r[0][0] + r[6][0]) / 2, r[0][1], r[0][2] + 0.06), r[6]] for r in rings]
    loft('enz_teak', deck, closed=False, cap=False)
    loft('boat_blue', [[(r[1][0] * 1.005, r[1][1], 0.33), (r[1][0] * 1.005, r[1][1], 0.42)] for r in rings], closed=False, cap=False)
    loft('boat_blue', [[(r[5][0] * 1.005, r[5][1], 0.42), (r[5][0] * 1.005, r[5][1], 0.33)] for r in rings], closed=False, cap=False)
    box('steel_dark', (0.18, 1.2, 1.4), (0, 0.3, -1.6))                           # fin keel
    box('steel_dark', (0.4, 1.4, 0.3), (0, 0.4, -1.75))
    box('steel_dark', (0.08, 0.6, 1.0), (0, L / 2 - 0.6, -0.9))                   # rudder
    # coachroof with dark windows, cockpit, rails
    box('white', (1.9, 3.2, 0.55), (0, -0.4, D + 0.05)); box('white', (1.7, 2.9, 0.12), (0, -0.4, D + 0.6))
    for sx in (-1, 1): box('glass', (0.02, 2.0, 0.22), (sx * 0.955, -0.5, D + 0.22))
    box('black', (1.6, 1.8, 0.4), (0, 2.6, D - 0.3))                              # cockpit well
    for sx in (-1, 1):
        for y in (-3.6, -1.8, 0.0, 1.8, 3.6): rod('alu', (sx * 1.3 * (0.6 if y < -3 else 1), y, D + 0.1), (sx * 1.3 * (0.6 if y < -3 else 1), y, D + 0.7), 0.02, 4)
        rod('alu', (sx * 0.8, -3.6, D + 0.68), (sx * 1.3, 3.6, D + 0.68), 0.015, 3)
    # rig: mast, boom, stays
    mast = (0, -1.2, D + 0.6)
    rod('alu', mast, (0, -1.2, D + 11.5), 0.07, 8)
    rod('alu', (0, -1.15, D + 1.6), (0, 2.8, D + 1.75), 0.05, 6)                  # boom
    rod('steel_dark', (0, -L / 2 + 0.1, D + 0.5), (0, -1.2, D + 11.0), 0.012, 3)  # forestay
    rod('steel_dark', (0, L / 2 - 0.1, D + 0.4), (0, -1.2, D + 11.3), 0.012, 3)   # backstay
    for sx in (-1, 1): rod('steel_dark', (sx * 1.35, -1.0, D + 0.1), (0, -1.2, D + 9.0), 0.01, 3)
    if sails:
        mesh('enz_sail', [(0, -1.12, D + 1.8), (0, -1.12, D + 11.2), (0.0, 2.7, D + 1.9)], [(0, 1, 2), (0, 2, 1)])
        mesh('enz_sail', [(0, -L / 2 + 0.3, D + 0.7), (0, -1.3, D + 10.5), (0.35, 0.6, D + 0.8)], [(0, 1, 2), (0, 2, 1)])
    else:
        cyl('enz_canvas_blue', 0.2, 3.7, (0, -1.0, D + 1.85), 10).rotation_euler = (-math.pi / 2, 0, 0)   # sail cover on the boom
    for k, y in enumerate((-2.5, 3.2)): ico('cloth_white', 0.18, (1.45, y, 0.5), (0.6, 0.6, 1.4), 1)        # fenders

@model('yacht', 'ヨット(係留)', '船')
def yacht(): _enz_yacht(False)

@model('yacht_sail', 'ヨット(帆走)', '船')
def yacht_sail(): _enz_yacht(True)

@model('parasol', 'ビーチパラソル', '自然')
def parasol():
    rod('alu', (0, 0, -0.3), (0, 0, 2.3), 0.025, 6)
    n = 12
    for k in range(n):
        a0, a1 = k / n * math.tau, (k + 1) / n * math.tau
        mesh('cloth_red' if k % 2 else 'cloth_white', [(0, 0, 2.45), (math.cos(a0) * 1.25, math.sin(a0) * 1.25, 1.95), (math.cos(a1) * 1.25, math.sin(a1) * 1.25, 1.95)], [(0, 1, 2), (0, 2, 1)])
    ico('white', 0.05, (0, 0, 2.47), sub=1)
    box('cloth_blue', (0.9, 1.8, 0.02), (0.4, 0.6, 0.0))                        # beach towel
    box('cloth_yellow', (0.25, 0.25, 0.22), (-0.4, -0.3, 0.0))                  # cool box

@model('surfboards', 'サーフボード(立てかけ)', '自然')
def surfboards():
    for k, (x, col) in enumerate([(-0.35, 'enz_board_blue'), (0.0, 'enz_board_white'), (0.35, 'cloth_yellow')]):
        with xf((x, 0.0, 0.0), rx=-0.18 + k * 0.05):
            ico(col, 0.5, (0, 0, 1.05), (0.28, 0.06, 2.2), 2)
            box('black', (0.02, 0.03, 0.2), (0, 0.04, 0.2))
    box('enz_teak', (1.3, 0.12, 0.1), (0, 0.3, 0.0)); box('enz_teak', (1.3, 0.08, 0.08), (0, 0.38, 1.3))
    for sx in (-1, 1): rod('enz_teak', (sx * 0.6, 0.35, 0), (sx * 0.6, 0.35, 1.4), 0.04, 4)

@model('tonbi', 'トンビ', '動物', lod=False)
def tonbi():
    # black kite circling on thermals: brown body, long fingered wings with pale patches, a slightly forked tail
    _pv_tube('enz_tb_brown', [(0, -0.3, 0.04), (0, -0.22, 0.03), (0, -0.05, 0.01), (0, 0.12, 0.0), (0, 0.3, 0.0)], [0.04, 0.07, 0.085, 0.07, 0.03], 8)
    ico('enz_tb_light', 0.065, (0, -0.31, 0.05), (0.9, 1.1, 0.95), 2)
    _pv_tube('enz_tb_dark', [(0, -0.37, 0.05), (0, -0.4, 0.04)], [0.014, 0.004], 4)
    mesh('enz_tb_brown', [(0, 0.25, 0.01), (-0.12, 0.55, 0.0), (0, 0.5, 0.0), (0.12, 0.55, 0.0)], [(0, 1, 2), (0, 2, 3), (0, 2, 1), (0, 3, 2)])
    st = [(0.0, -0.12, 0.16, 0.035), (0.25, -0.15, 0.2, 0.03), (0.5, -0.15, 0.2, 0.022), (0.72, -0.12, 0.17, 0.015), (0.9, -0.06, 0.1, 0.008)]
    for sx, sd in ((-1, 'l'), (1, 'r')):
        part(f'tonbi_wing_{sd}', (sx * 0.07, 0, 0.03))
        rings = [[(sx * (0.07 + x), le, 0.03 + t), (sx * (0.07 + x), te, 0.03 - t * 0.3), (sx * (0.07 + x), le * 0.4 + te * 0.6, 0.03 - t)] for x, le, te, t in st]
        loft('enz_tb_brown', rings[:4], closed=True, cap=True); loft('enz_tb_dark', rings[3:], closed=True, cap=True)
        ico('enz_tb_light', 0.05, (sx * 0.62, 0.02, 0.025), (1.2, 0.8, 0.2), 1)
        for f in range(5): rod('enz_tb_dark', (sx * 0.95, -0.05 + f * 0.035, 0.03), (sx * (1.08 + 0.02 * (2 - abs(f - 2))), -0.07 + f * 0.045, 0.03), 0.012, 3)   # primaries
        part(None)

def _enz_kanban(text):
    for sx in (-1, 1):
        rod('wood_dark', (sx * 0.28, -0.25, 0), (sx * 0.28, 0.0, 1.7), 0.025, 4); rod('wood_dark', (sx * 0.28, 0.25, 0), (sx * 0.28, 0.0, 1.7), 0.025, 4)
    signboard(text, 0.5, 1.45, (0, -0.07, 1.75), board='white', ink='ink_red', frame='wood_dark', vertical=True, depth=0.04, rz=0.0)

@model('kanban_shirasu', '立て看板(しらす丼)', '道の小物')
def kanban_shirasu(): _enz_kanban('しらす丼')

@model('kanban_tako', '立て看板(たこせんべい)', '道の小物')
def kanban_tako(): _enz_kanban('たこせん')


PALETTE.update({'eno_green': P((0.04, 0.28, 0.12), 0.45), 'eno_cream': P((0.86, 0.8, 0.62), 0.45), 'eno_roof': P((0.45, 0.47, 0.48), 0.6, 0.3),
                'eno_skirt': P((0.08, 0.08, 0.08), 0.6), 'eno_dest': P((0.95, 0.95, 0.9), 0.5, e=(1.0, 0.98, 0.9), es=0.6)})

@model('enoden', '江ノ電風の電車(1両)', '乗り物')
def enoden():
    # a retro coastal tram car: green below, cream above, rounded cab ends with a big two-pane windscreen,
    # a lit destination board 「江ノ島」, headlights, pantograph, bogies. Length 12 m along Y, cab at -Y (the train
    # runs either way; the game couples two cars back to back).
    L, W, F, H = 12.0, 2.5, 0.95, 3.45
    _pv_rbox('eno_green', (W, L - 0.6, 1.25), (0, 0, F), 0.25)                          # lower body
    _pv_rbox('eno_cream', (W, L - 0.6, H - F - 1.25 - 0.25), (0, 0, F + 1.25), 0.25)    # upper body
    _pv_rbox('eno_roof', (W - 0.2, L - 0.9, 0.3), (0, 0, H - 0.3), 0.15)
    box('eno_green', (W + 0.02, L - 0.7, 0.08), (0, 0, F + 1.24))                       # belt line
    for sy, y0 in ((-1, -L / 2 + 0.3), (1, L / 2 - 0.3)):                               # rounded ends
        with xf((0, y0, 0)):
            ico('eno_green', 1.0, (0, 0, F + 0.62), (W / 2, 0.45, 0.62), 2)
            ico('eno_cream', 1.0, (0, 0, F + 1.75), (W / 2, 0.45, 0.55), 2)
    # windows down both sides, doors
    for sx in (-1, 1):
        for k in range(8):
            y = -L / 2 + 1.6 + k * 1.15
            if k in (1, 6): box('glass', (0.04, 0.9, 1.75), (sx * (W / 2 + 0.005), y, F + 0.25)); continue   # door glass
            box('glass', (0.04, 0.85, 0.8), (sx * (W / 2 + 0.005), y, F + 1.4))
    # cab: windscreen, headlights, destination board
    with xf((0, -L / 2 - 0.12, 0)):
        for sx in (-1, 1): box('glass', (0.95, 0.05, 0.85), (sx * 0.5, -0.02, F + 1.35))
        _pv_rbox('eno_dest', (1.2, 0.06, 0.32), (0, -0.04, F + 2.25), 0.04)
        text3d('ink', '江ノ島', 0.2, (0, -0.075, F + 2.36), depth=0.01)
        for sx in (-1, 1):
            cyl('lamp', 0.12, 0.08, (sx * 0.8, -0.03, F + 0.75), 12).rotation_euler = (math.pi / 2, 0, 0)
            cyl('pv_tail_light', 0.06, 0.06, (sx * 0.95, -0.02, F + 0.4), 10).rotation_euler = (math.pi / 2, 0, 0)
        box('eno_skirt', (W - 0.2, 0.15, 0.45), (0, 0.05, 0.4))
    # bogies and wheels, underfloor boxes
    for y in (-L / 2 + 2.2, L / 2 - 2.2):
        box('eno_skirt', (W - 0.5, 2.2, 0.45), (0, y, 0.45))
        for dy in (-0.7, 0.7):
            for sx in (-1, 1): cyl('steel_dark', 0.38, 0.12, (sx * 0.72, y + dy, 0.38), 14).rotation_euler = (0, math.pi / 2, 0)
    box('eno_skirt', (W - 0.6, L - 6.0, 0.4), (0, 0, 0.5))
    # pantograph and roof gear
    with xf((0, -L / 4, H)):
        box('steel_dark', (1.0, 1.0, 0.15), (0, 0, 0))
        for sy in (-1, 1): rod('steel_dark', (0, sy * 0.4, 0.15), (0, sy * 0.05, 1.1), 0.03, 4); rod('steel_dark', (0, sy * 0.05, 1.1), (0, sy * 0.35, 1.7), 0.025, 4)
        box('steel_dark', (1.6, 0.08, 0.06), (0, 0, 1.72))
    _pv_rbox('eno_roof', (1.2, 1.6, 0.35), (0, L / 4, H), 0.1)

@model('eno_station', '小さな駅(江ノ島駅風)', '乗り物')
def eno_station():
    # a small open platform shelter: posts, a tiled roof, a bench and a station sign 「えのしま」
    for x in (-5.5, 0, 5.5):
        for y in (-0.9, 0.9): cyl('wood_dark', 0.08, 2.9, (x, y, 0), 8)
    with xf((0, 0, 2.9)): box('roof_tile', (12.4, 2.8, 0.18), (0, 0, 0))
    box('wood_dark', (12.4, 0.12, 0.3), (0, -1.4, 2.75)); box('wood_dark', (12.4, 0.12, 0.3), (0, 1.4, 2.75))
    for x in (-3, 3): box('wood', (2.0, 0.45, 0.08), (x, 0.6, 0.45)); box('wood_dark', (2.0, 0.08, 0.45), (x, 0.82, 0.5))
    for x in (-3.9, -2.1, 2.1, 3.9): box('steel_dark', (0.06, 0.4, 0.45), (x, 0.6, 0))
    with xf((0, 0, 2.2)):
        box('white', (2.4, 0.08, 0.55), (0, 0, 0)); text3d('navy', 'えのしま', 0.3, (0, -0.05, 0.12), depth=0.01)
        for sx in (-1, 1): rod('steel_dark', (sx * 1.0, 0, 0.55), (sx * 1.0, 0, 0.7), 0.02, 4)


@model('fisherman', '漁師(ゴム前掛け・長靴)', '人物', lod=False)
def fisherman():
    # weathered fisherman: navy work shirt with rolled sleeves, orange rubber apron (前掛け) on a neck strap, white rubber boots,
    # cropped grey hair under a twisted towel (ねじり鉢巻)
    def body():
        x0, y0, z0 = _PV_HC
        rows = [(0.228, 0.42, 1.05), (0.224, 0.6, 1.05), (0.216, 0.8, 1.1), (0.208, 0.95, 1.12), (0.198, 1.05, 0.98), (0.208, 1.16, 0.68), (0.218, 1.26, 0.55), (0.216, 1.33, 0.5)]
        _pv_shell('pv_rubber_orange', rows, seg=8, t=0.012, sy=0.68)
        _pv_shell('pv_rubber_orange', [(0.231, 0.42, 1.06), (0.231, 0.45, 1.06)], seg=8, t=0.016, sy=0.68)   # rolled bottom edge
        for sx in (-1, 1):   # neck strap and waist ties
            a = -math.pi / 2 + sx * 0.5; p0 = (0.216 * math.cos(a), 0.216 * 0.68 * math.sin(a), 1.33)
            _pv_tube('pv_rubber_orange', [p0, (sx * 0.1, -0.08, 1.43), (sx * 0.075, 0.02, 1.47), (sx * 0.02, 0.09, 1.44)], 0.014, 4, flat=0.35)
            a = -math.pi / 2 + sx * 0.98
            _pv_tube('cloth_white', [(0.2 * math.cos(a), 0.2 * 0.68 * math.sin(a), 1.02), (sx * 0.19, 0.0, 1.02), (sx * 0.14, 0.11, 1.02), (0, 0.125, 1.02)], 0.009, 4)
            torus('cloth_white', 0.03, 0.008, (sx * 0.03, 0.13, 1.02), rot=(math.pi / 2, 0, 0), seg=8, rseg=4)
        for k in range(4): ico('white', 0.008, (0, -0.122, 1.12 + k * 0.08), (1, 0.5, 1), 1)   # shirt buttons above the bib
        # twisted towel headband with the knot at the front
        ring = []; n = 16
        for k in range(n + 1):
            a = k / n * math.tau
            ring.append((x0 + 0.139 * math.sin(a), y0 - 0.141 * math.cos(a) + 0.004, z0 + 0.055 + 0.02 * math.cos(a)))
        _pv_tube('cloth_white', ring, [0.018 + 0.006 * (k % 2) for k in range(n + 1)], 5, cap=False)
        ico('cloth_white', 0.026, (x0 + 0.03, y0 - 0.14, z0 + 0.08), (1.2, 0.8, 0.9), 1)
        for sx in (-1, 1): rod('cloth_white', (x0 + 0.03, y0 - 0.15, z0 + 0.09), (x0 + 0.03 + sx * 0.04, y0 - 0.15, z0 + 0.13), 0.01, 4)
        # stubble-grey moustache
        ico('hair_grey', 0.02, (x0, y0 - 0.116, z0 - 0.049), (1.6, 0.5, 0.45), 1)
    _pv_person('fisherman', 1.02, 'cloth_navy', 'cloth_navy', skin='pv_skin_tan', hair='hair_grey', hairstyle='crop', sleeves='rolled',
               shoes='boots', brows=1.4, body=body)

@model('shopkeeper', 'お店のおばちゃん', '人物', lod=False)
def shopkeeper():
    # cheerful shop lady: pink blouse, long khaki skirt, a blue apron with a pocket, navy arm covers, a grey perm with a bun
    def body():
        x0, y0, z0 = _PV_HC
        rows = [(0.288, 0.45, 0.95), (0.278, 0.6, 0.95), (0.245, 0.8, 1.0), (0.212, 0.95, 1.08), (0.205, 1.05, 0.95), (0.21, 1.16, 0.66), (0.218, 1.27, 0.5)]
        _pv_shell('pv_apron_cloth', rows, seg=10, t=0.01, sy=0.8)
        _pv_shell('pv_apron_cloth', [(0.29, 0.66, 0.38), (0.285, 0.8, 0.38)], seg=6, t=0.012, sy=0.81)        # pocket
        _pv_shell('cloth_white', [(0.291, 0.785, 0.385), (0.287, 0.8, 0.385)], seg=6, t=0.013, sy=0.81)        # pocket hem
        for sx in (-1, 1):
            a = -math.pi / 2 + sx * 0.5; p0 = (0.218 * math.cos(a), 0.218 * 0.8 * math.sin(a), 1.27)
            _pv_tube('pv_apron_cloth', [p0, (sx * 0.12, -0.09, 1.38), (sx * 0.1, 0.0, 1.43), (sx * 0.03, 0.08, 1.42)], 0.013, 4, flat=0.4)
            a = -math.pi / 2 + sx * 1.0
            _pv_tube('pv_apron_cloth', [(0.205 * math.cos(a), 0.205 * 0.8 * math.sin(a), 1.02), (sx * 0.19, 0.02, 1.02), (sx * 0.12, 0.12, 1.02), (0, 0.13, 1.02)], 0.01, 4)
            torus('pv_apron_cloth', 0.035, 0.009, (sx * 0.035, 0.135, 1.02), rot=(math.pi / 2, 0.3 * sx, 0), seg=8, rseg=4)
            _pv_tube('pv_apron_cloth', [(0, 0.13, 1.02), (sx * 0.03, 0.14, 0.94), (sx * 0.05, 0.135, 0.88)], 0.009, 4, flat=0.4)
        # perm curls and a bun
        rnd = random.Random(3)
        for k in range(16):
            a = k / 16 * math.tau * 1.0; el = 0.25 + 0.6 * ((k * 7) % 5) / 5
            if abs(math.atan2(math.sin(a), math.cos(a))) < 0.7 and el < 0.6: el = 0.65
            px, py, pz = math.sin(a) * math.cos(el), -math.cos(a) * math.cos(el), math.sin(el)
            ico('hair_grey', 0.038, (x0 + 0.138 * px, y0 + 0.006 + 0.142 * py, z0 + 0.158 * pz), sub=1, jitter=0.15, seed=k)
        ico('hair_grey', 0.058, (x0, y0 + 0.13, z0 + 0.1), (1, 0.9, 0.9), 2, jitter=0.12, seed=5)
        torus('cloth_red', 0.045, 0.01, (x0, y0 + 0.1, z0 + 0.09), rot=(1.2, 0, 0), seg=10, rseg=4)
    _pv_person('shopkeeper', 0.95, 'pv_blouse', 'cloth_khaki', hair='hair_grey', hairstyle='perm', sleeves='cover', shoes='shoe',
               skirt=True, blush=True, body=body, collar='cloth_white')

@model('townsman', '町の人(買い物帰り)', '人物', lod=False)
def townsman():
    # man coming back from the shops: blue cap, green zip jacket over a white tee, khaki chinos, sneakers,
    # and an eco bag with a leek and a daikon sticking out (in the right hand: it swings with the arm)
    def body():
        x0, y0, z0 = _PV_HC
        rod('metal', (0, -0.128, 0.9), (0, -0.133, 1.36), 0.0045, 4)                                     # zip
        _pv_shell('white', [(0.205, 1.3, 0.22), (0.19, 1.39, 0.32)], seg=4, t=0.01, sy=0.66)                # tee at the neck
        _pv_lathe('pv_jacket_dk', [(0.19, 0.905), (0.194, 0.915), (0.19, 0.95), (0.18, 0.955)], seg=14, sy=0.67)   # ribbed hem
        # cap: crown, button, brim; hair shows at the sides and the back
        _pv_dome('cloth_blue', (x0, y0 + 0.01, z0 + 0.012), (0.146, 0.15, 0.158), lambda a: 0.3 if abs(a) < 1.2 else 0.3 - 0.25 * (abs(a) - 1.2) / 1.94, seg=20, rings=6)
        ico('cloth_blue', 0.014, (x0, y0 + 0.01, z0 + 0.172), sub=1)
        _pv_shell('cloth_blue', [(0.14, 0.0, 0.85), (0.24, -0.012, 0.6)], seg=8, t=0.012, c=(x0, y0 + 0.07, z0 + 0.06), sy=0.85)
        text3d('white', 'U', 0.05, (x0, y0 - 0.152, z0 + 0.11), depth=0.01)
    def bag():
        hx, hy, hz = 0.276, -0.04, 0.8
        _pv_rbox('pv_bag', (0.11, 0.3, 0.3), (hx + 0.01, hy, 0.44), 0.03, segs=2)
        for dy in (-0.07, 0.07): _pv_tube('pv_bag', [(hx + 0.01, hy + dy * 1.4, 0.74), (hx + 0.005, hy + dy * 0.6, 0.79), (hx, hy, hz + 0.01)], 0.009, 4, flat=0.5)
        _pv_tube('pv_leek', [(hx + 0.01, hy + 0.06, 0.6), (hx + 0.02, hy + 0.13, 0.85), (hx + 0.03, hy + 0.17, 0.98)], [0.022, 0.02, 0.014], 6)
        _pv_tube('white', [(hx + 0.01, hy + 0.05, 0.55), (hx + 0.012, hy + 0.08, 0.7)], [0.024, 0.024], 6)
        for k in (-1, 1): _pv_tube('pv_leek', [(hx + 0.03, hy + 0.17, 0.97), (hx + 0.03 + k * 0.03, hy + 0.21, 1.05)], [0.01, 0.004], 4)
        o = cyl('white', 0.04, 0.2, (hx + 0.0, hy - 0.08, 0.6), 8, r2=0.035)
        ico('pv_leek', 0.035, (hx, hy - 0.08, 0.81), (1, 1, 0.6), 1)
    _pv_person('townsman', 1.0, 'pv_jacket', 'cloth_khaki', hair='hair', hairstyle='capped', sleeves='long', shoes='sneaker', body=body,
               arm_r=bag)

@model('cat', '猫(茶トラ)', '動物', lod=False)
def cat():
    # orange tabby (茶トラ) standing mid-stride, white chest and socks, green eyes; cat_tail pivots at its base
    _pv_tube('fur_orange', [(0, -0.22, 0.29), (0, -0.17, 0.285), (0, -0.06, 0.262), (0, 0.06, 0.262), (0, 0.16, 0.272), (0, 0.215, 0.275)],
             [0.035, 0.088, 0.09, 0.088, 0.085, 0.035], 12)
    ico('fur_white', 0.075, (0, -0.15, 0.24), (0.85, 1.3, 0.9), 2)                                   # chest / belly
    for k, y in enumerate((-0.08, -0.01, 0.06, 0.13)):                                                 # tabby stripes over the back
        ring = [(0.092 * math.sin(a), y + 0.01 * math.cos(a * 2), 0.262 + 0.092 * math.cos(a)) for a in (i / 6 * 2.2 - 1.1 for i in range(7))]
        _pv_tube('fur_dark', ring, 0.013, 4, cap=False)
    # head
    hc = (0, -0.27, 0.385)
    _pv_lathe('fur_orange', [(0, -0.075), (0.045, -0.07), (0.075, -0.045), (0.088, -0.005), (0.083, 0.035), (0.06, 0.068), (0, 0.08)], hc, seg=14, sy=0.92,
              f=lambda x, y, z: (x * (1.12 if z < 0 else 1.0), y, z))
    ico('fur_white', 0.045, (0, hc[1] - 0.06, hc[2] - 0.03), (1.15, 0.7, 0.75), 2)                   # muzzle
    ico('nose_pink', 0.011, (0, hc[1] - 0.09, hc[2] - 0.012), (1.2, 0.7, 0.8), 1)
    for sx in (-1, 1):
        ico('pv_cat_eye', 0.018, (sx * 0.036, hc[1] - 0.067, hc[2] + 0.015), (1.0, 0.45, 1.0), 2)
        ico('eye', 0.009, (sx * 0.036, hc[1] - 0.074, hc[2] + 0.015), (0.45, 0.4, 1.0), 1)
        ico('white', 0.004, (sx * 0.036 + 0.006, hc[1] - 0.077, hc[2] + 0.024), sub=1)
        o = cyl('fur_orange', 0.04, 0.075, (sx * 0.05, hc[1] + 0.005, hc[2] + 0.045), 6, r2=0.0); o.rotation_euler = (0.15, sx * 0.4, 0)
        o = cyl('nose_pink', 0.026, 0.055, (sx * 0.048, hc[1] - 0.008, hc[2] + 0.05), 6, r2=0.0); o.rotation_euler = (0.15, sx * 0.4, 0)
        for k in (-1, 1): rod('white', (sx * 0.03, hc[1] - 0.085, hc[2] - 0.03), (sx * 0.12, hc[1] - 0.06, hc[2] - 0.03 + k * 0.02), 0.0018, 3)
    ico('fur_dark', 0.03, (0, hc[1] - 0.04, hc[2] + 0.065), (0.5, 0.9, 0.35), 1)
    # legs (mid-stride), white socks
    for sx, y0, fwd in ((-1, -0.16, 0.04), (1, -0.16, -0.03), (-1, 0.15, -0.035), (1, 0.15, 0.03)):
        top = (sx * 0.05, y0, 0.26)
        mid = (sx * 0.052, y0 + fwd * 0.5 + (0.015 if y0 > 0 else -0.005), 0.13)
        bot = (sx * 0.05, y0 + fwd, 0.035)
        _pv_tube('fur_orange', [top, mid, bot], [0.042 if y0 > 0 else 0.035, 0.027, 0.022], 8)
        _pv_tube('fur_white', [(bot[0], bot[1], 0.075), bot], [0.025, 0.024], 8, cap=False)
        ico('fur_white', 0.027, (bot[0], bot[1] - 0.012, 0.018), (1, 1.3, 0.7), 1, flat_bottom=-0.018)
    part('cat_tail', (0, 0.21, 0.28))
    pts = [(0, 0.21, 0.28), (0, 0.29, 0.31), (0, 0.37, 0.38), (0, 0.42, 0.47), (0, 0.42, 0.55), (0, 0.38, 0.59)]
    _pv_tube('fur_orange', pts, [0.03, 0.028, 0.026, 0.024, 0.022, 0.012], 8)
    for i in range(1, 5): torus('fur_dark', 0.026 - i * 0.0012, 0.008, pts[i], rot=((Vector(pts[i + 1]) - Vector(pts[i - 1])).to_track_quat('Z', 'Y').to_euler()), seg=8, rseg=3)
    part(None)

@model('seagull', 'カモメ', '動物', lod=False)
def seagull():
    # black-tailed gull in flight: white body, grey mantle, black wingtips with white mirrors, yellow bill with a red spot
    _pv_tube('fur_white', [(0, -0.22, 0.05), (0, -0.17, 0.035), (0, -0.05, 0.01), (0, 0.08, 0.0), (0, 0.2, 0.01), (0, 0.25, 0.015)],
             [0.035, 0.06, 0.075, 0.068, 0.04, 0.01], 10)
    ico('fur_white', 0.058, (0, -0.24, 0.06), (0.9, 1.15, 0.95), 2)                                        # head
    _pv_tube('pv_beak', [(0, -0.29, 0.055), (0, -0.33, 0.05), (0, -0.355, 0.045), (0, -0.362, 0.035)], [0.016, 0.011, 0.007, 0.003], 6)
    ico('red', 0.005, (0, -0.335, 0.042), sub=1)
    for sx in (-1, 1):
        ico('eye', 0.009, (sx * 0.035, -0.27, 0.075), sub=1)
        ico('pv_feet', 0.013, (sx * 0.025, 0.14, -0.04), (0.7, 2.0, 0.4), 1)                               # tucked feet
    # tail: grey fan with a black band
    mesh('fur_white', [(0, 0.17, 0.02), (-0.075, 0.31, 0.012), (0.075, 0.31, 0.012), (0, 0.17, 0.0), (-0.075, 0.31, 0.004), (0.075, 0.31, 0.004)],
         [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (2, 5, 3, 0), (1, 4, 5, 2)])
    _pv_tube('black', [(-0.072, 0.305, 0.008), (0, 0.312, 0.008), (0.072, 0.305, 0.008)], 0.008, 4, flat=0.5)
    # wings: 6 stations root -> tip, a thin cambered section (LE, top, TE, bottom)
    st = [(0.0, -0.085, 0.11, 0.03, 0.024), (0.18, -0.105, 0.14, 0.062, 0.02), (0.36, -0.11, 0.12, 0.078, 0.015),
          (0.5, -0.085, 0.1, 0.07, 0.011), (0.64, -0.03, 0.11, 0.05, 0.008), (0.78, 0.07, 0.125, 0.025, 0.004)]
    for sx, s in ((-1, 'l'), (1, 'r')):
        part(f'seagull_wing_{s}', (sx * 0.06, 0, 0.03))
        rings = []
        for x, le, te, z, t in st:
            X = sx * (0.06 + x)
            rings.append([(X, le, z), (X, le + (te - le) * 0.3, z + t), (X, te, z - t * 0.2), (X, le + (te - le) * 0.35, z - t * 0.5)])
        loft('pv_gull_grey', rings[:4], closed=True, cap=True)
        loft('black', rings[3:], closed=True, cap=True)
        _pv_tube('fur_white', [rings[0][2], rings[1][2], rings[2][2], rings[3][2]], 0.006, 4)            # white trailing edge
        ico('fur_white', 0.022, (sx * 0.8, 0.075, 0.032), (1.0, 0.8, 0.25), 1)                              # mirror spot
        part(None)

# ---------------------------------------------------------------- _pv_: helpers for people, animals, vehicles and boats
PALETTE.update({
    'pv_skin_tan': P((0.86, 0.56, 0.38), 0.7), 'pv_rubber_orange': P((0.95, 0.33, 0.04), 0.35), 'pv_boot_white': P((0.9, 0.9, 0.86), 0.4),
    'pv_mouth': P((0.45, 0.1, 0.08), 0.6), 'pv_iris': P((0.12, 0.06, 0.03), 0.15), 'pv_gull_grey': P((0.55, 0.6, 0.66), 0.8),
    'pv_beak': P((0.98, 0.75, 0.1), 0.45), 'pv_feet': P((0.95, 0.6, 0.45), 0.7), 'pv_apron_cloth': P((0.35, 0.55, 0.75), 0.9),
    'pv_sneaker': P((0.92, 0.92, 0.9), 0.7), 'pv_shoe_brown': P((0.22, 0.12, 0.06), 0.55), 'pv_leek': P((0.25, 0.55, 0.15), 0.7),
    'pv_bag': P((0.85, 0.78, 0.6), 0.9), 'pv_paint_white': P((0.88, 0.89, 0.88), 0.35), 'pv_chrome': P((0.85, 0.86, 0.88), 0.18, 1.0),
    'pv_plate': P((0.95, 0.8, 0.1), 0.5), 'pv_tail_light': P((0.8, 0.05, 0.03), 0.3, e=(1.0, 0.1, 0.05), es=0.6),
    'pv_amber': P((1.0, 0.5, 0.05), 0.3, e=(1.0, 0.5, 0.05), es=0.4), 'pv_frame_red': P((0.6, 0.06, 0.06), 0.35, 0.3),
    'pv_seat': P((0.08, 0.07, 0.07), 0.55), 'pv_jacket': P((0.06, 0.3, 0.14), 0.85), 'pv_jacket_dk': P((0.03, 0.15, 0.07), 0.9),
    'pv_blouse': P((0.9, 0.38, 0.45), 0.9), 'pv_cat_eye': P((0.55, 0.75, 0.15), 0.2), 'pv_teak': P((0.55, 0.36, 0.2), 0.7), 'pv_cowl': P((0.08, 0.09, 0.1), 0.35),
})

def _pv_lathe(mat, prof, loc=(0, 0, 0), seg=12, sx=1.0, sy=1.0, f=None, a0=-math.pi / 2, cap=True):
    """Closed surface of revolution about Z. prof = [(r, z)] bottom->top; r == 0 at an end makes a pole.
    The section is an ellipse (sx, sy); f(x, y, z) -> (x, y, z) deforms each vertex (local coords)."""
    v, faces, idx = [], [], []
    for (r, z) in prof:
        if r < 1e-5:
            p = f(0.0, 0.0, z) if f else (0.0, 0.0, z)
            idx.append([len(v)] * seg); v.append(p); continue
        row = []
        for j in range(seg):
            a = a0 + math.tau * j / seg
            p = (r * math.cos(a) * sx, r * math.sin(a) * sy, z)
            row.append(len(v)); v.append(f(*p) if f else p)
        idx.append(row)
    for i in range(len(prof) - 1):
        for j in range(seg):
            q = []
            for k in (idx[i][j], idx[i][(j + 1) % seg], idx[i + 1][(j + 1) % seg], idx[i + 1][j]):
                if k not in q: q.append(k)
            if len(q) >= 3: faces.append(tuple(q))
    if cap and prof[0][0] >= 1e-5: faces.append(tuple(reversed(idx[0])))
    if cap and prof[-1][0] >= 1e-5: faces.append(tuple(idx[-1]))
    o = mesh(mat, v, faces); o.location = loc
    return o

def _pv_dome(mat, c, r, cut, seg=16, rings=6):
    """Ellipsoid cap (radii r) above a cut that varies with the angle: cut(a) in -1..1 (normalised height of the rim,
    a = 0 at the front (-Y), +-pi at the back). Closed underneath by the rim polygon. Used for hair and caps."""
    v = [(0.0, 0.0, r[2])]; rows = []
    for i in range(1, rings + 1):
        row = []
        for j in range(seg):
            a = j / seg * math.tau
            th = math.acos(max(-1.0, min(1.0, cut(a if a <= math.pi else a - math.tau)))) * i / rings
            row.append(len(v)); v.append((r[0] * math.sin(th) * math.sin(a), -r[1] * math.sin(th) * math.cos(a), r[2] * math.cos(th)))
        rows.append(row)
    faces = [(0, rows[0][j], rows[0][(j + 1) % seg]) for j in range(seg)]
    for i in range(rings - 1):
        for j in range(seg):
            j2 = (j + 1) % seg; faces.append((rows[i][j], rows[i + 1][j], rows[i + 1][j2], rows[i][j2]))
    faces.append(tuple(reversed(rows[-1])))
    o = mesh(mat, v, faces); o.location = c
    return o

def _pv_tube(mat, pts, rad, seg=8, cap=True, flat=1.0):
    """Tube swept along a polyline with per-point radius (rotation-minimising frames). flat < 1 squashes the
    section along the first normal (straps, ribbons)."""
    pts = [Vector(p) for p in pts]; n = len(pts)
    rad = list(rad) if isinstance(rad, (list, tuple)) else [rad] * n
    tans = []
    for i in range(n):
        d = pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]
        tans.append(d.normalized() if d.length > 1e-9 else Vector((0, 0, 1)))
    ref = Vector((0, 0, 1)) if abs(tans[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = (ref - tans[0] * ref.dot(tans[0])).normalized(); rings = []
    for i in range(n):
        if i:
            nrm = nrm - tans[i] * nrm.dot(tans[i])
            nrm = nrm.normalized() if nrm.length > 1e-9 else nrm
        bi = tans[i].cross(nrm)
        rings.append([tuple(pts[i] + (nrm * math.cos(a) * flat + bi * math.sin(a)) * rad[i]) for a in (k / seg * math.tau for k in range(seg))])
    return loft(mat, rings, closed=True, cap=cap)

def _pv_shell(mat, rows, seg=10, t=0.012, c=(0, 0, 0), sy=1.0, a_mid=-math.pi / 2):
    """Curved sheet (apron, mudguard, cowl): rows = [(r, z, half_angle)] bottom->top, centred on the angle a_mid,
    elliptical (sy). Given thickness t so it is closed and visible from both sides."""
    outer, inner = [], []
    for (r, z, ha) in rows:
        o_, i_ = [], []
        for j in range(seg + 1):
            a = a_mid - ha + 2 * ha * j / seg
            o_.append((c[0] + r * math.cos(a), c[1] + r * math.sin(a) * sy, c[2] + z))
            i_.append((c[0] + (r - t) * math.cos(a), c[1] + (r - t) * math.sin(a) * sy, c[2] + z))
        outer.append(o_); inner.append(i_)
    R, C = len(rows), seg + 1
    v = [p for row in outer for p in row] + [p for row in inner for p in row]; off = R * C
    O = lambda i, j: i * C + j
    f = []
    for i in range(R - 1):
        for j in range(seg):
            f.append((O(i, j), O(i, j + 1), O(i + 1, j + 1), O(i + 1, j)))
            f.append((off + O(i, j), off + O(i + 1, j), off + O(i + 1, j + 1), off + O(i, j + 1)))
    for j in range(seg):
        f.append((O(0, j), off + O(0, j), off + O(0, j + 1), O(0, j + 1)))
        f.append((O(R - 1, j), O(R - 1, j + 1), off + O(R - 1, j + 1), off + O(R - 1, j)))
    for i in range(R - 1):
        f.append((O(i, 0), O(i + 1, 0), off + O(i + 1, 0), off + O(i, 0)))
        f.append((O(i, seg), off + O(i, seg), off + O(i + 1, seg), O(i + 1, seg)))
    return mesh(mat, v, f)

def _pv_rbox(mat, size, loc, bev=0.03, rot=(0, 0, 0), segs=1):
    """Box with chamfered (segs=1) or rounded (segs=2) edges; loc = centre of the bottom face like box()."""
    sx, sy, sz = size
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for vt in bm.verts: vt.co.x *= sx; vt.co.y *= sy; vt.co.z = (vt.co.z + 0.5) * sz
    bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=min(bev, 0.49 * min(size)), segments=segs, profile=0.5, affect='EDGES')
    me = bpy.data.meshes.new('rbox'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('rbox', me); bpy.context.scene.collection.objects.link(o)
    o.location = loc; o.rotation_euler = rot
    return _take(o, mat)

def _pv_wheel(loc, R, W, rim='pv_chrome', tyre='rubber', seg=20, hub=None, spokes=0, spoke_mat='pv_chrome', lugs=4, side=1):
    """Road wheel turning about X, centred on loc: tyre with rounded shoulders and tread grooves, dished rim, hub cap,
    lug nuts (lugs > 0) or wire spokes (spokes > 0). side = +-1: which way the outer face points."""
    with xf(loc, ry=math.pi / 2):
        tr = R - (W * 0.55 if not spokes else W * 1.2)  # rim radius
        _pv_lathe(tyre, [(tr, -W / 2), (R - W * 0.18, -W / 2), (R, -W * 0.3), (R, W * 0.3), (R - W * 0.18, W / 2), (tr, W / 2)], seg=seg, cap=False)
        if spokes:
            torus(rim, tr, W * 0.22, (0, 0, 0), seg=seg, rseg=5)
            cyl(hub or rim, W * 0.35, W * 2.0, (0, 0, -W), 8)
            for k in range(spokes):
                a = k / spokes * math.tau; zz = W * 0.9 * (1 if k % 2 else -1)
                rod(spoke_mat, (0, 0, zz), (tr * math.cos(a + 0.25), tr * math.sin(a + 0.25), 0), 0.0035, 3)
        else:
            s = side
            _pv_lathe(rim, [(0, s * W * 0.1), (tr * 0.32, s * W * 0.12), (tr * 0.45, s * W * 0.32), (tr * 0.9, s * W * 0.36), (tr * 1.02, s * W * 0.46),
                            (tr * 1.02, -s * W * 0.46), (0, -s * W * 0.4)], seg=seg)
            cyl(hub or rim, tr * 0.28, W * 0.12, (0, 0, s * W * 0.3 - (W * 0.12 if s < 0 else 0)), 10)
            for k in range(lugs):
                a = k / lugs * math.tau
                cyl('steel_dark', tr * 0.05, W * 0.08, (tr * 0.38 * math.cos(a), tr * 0.38 * math.sin(a), s * W * 0.32 - (W * 0.08 if s < 0 else 0)), 6)

# ---- townsfolk: stylised anime proportions (about 6 heads), 1.75 m at h = 1, facing -Y.
# Parts as before: <prefix>_leg_l/r pivot at the hip (+-0.09h, 0, 0.84h), <prefix>_arm_l/r pivot at the shoulder (+-0.24h, 0, 1.4h).
_PV_HC = (0.0, -0.005, 1.6)   # head centre

def _pv_head(skin, hair, hairstyle='short', blush=False, brows=1.0):
    x0, y0, z0 = _PV_HC
    def jaw(x, y, z):  # chin a little forward and pointed: anime face
        k = max(0.0, -z / 0.135)
        return (x * (1 - 0.12 * k * k), y - 0.014 * k * (1 if y < 0 else 0.3), z)
    _pv_lathe(skin, [(0, -0.135), (0.05, -0.13), (0.088, -0.108), (0.112, -0.07), (0.124, -0.025), (0.128, 0.02), (0.124, 0.065),
                     (0.105, 0.105), (0.07, 0.133), (0, 0.146)], (x0, y0, z0), seg=16, sy=0.98, f=jaw)
    cyl(skin, 0.048, 0.14, (0, 0.0, 1.37), 10)                                              # neck
    for sx in (-1, 1):
        ex = sx * 0.047
        ico('eye', 0.024, (x0 + ex, y0 - 0.106, z0 - 0.004), (0.7, 0.32, 1.08), 2)             # big dark anime eye
        ico('pv_iris', 0.013, (x0 + ex, y0 - 0.112, z0 - 0.012), (0.8, 0.3, 0.9), 1)           # warm lower iris
        ico('white', 0.0075, (x0 + ex + sx * 0.006, y0 - 0.115, z0 + 0.008), sub=1)            # highlight
        _pv_tube('ink', [(x0 + ex - sx * 0.02, y0 - 0.105, z0 + 0.018), (x0 + ex, y0 - 0.112, z0 + 0.026), (x0 + ex + sx * 0.022, y0 - 0.103, z0 + 0.02)], 0.004, 4)
        _pv_tube(hair, [(x0 + ex - sx * 0.022, y0 - 0.108, z0 + 0.046), (x0 + ex + sx * 0.004, y0 - 0.112, z0 + 0.054 * brows), (x0 + ex + sx * 0.024, y0 - 0.1, z0 + 0.05)], 0.0045 * brows, 4)
        ico(skin, 0.03, (x0 + sx * 0.124, y0 + 0.008, z0 - 0.012), (0.4, 0.65, 1.0), 1)        # ears
        if blush: ico('cheek', 0.02, (x0 + sx * 0.068, y0 - 0.098, z0 - 0.045), (1.0, 0.35, 0.6), 1)
    ico(skin, 0.013, (x0, y0 - 0.123, z0 - 0.032), (0.8, 0.9, 1.0), 1)                          # nose
    _pv_tube('pv_mouth', [(x0 - 0.019, y0 - 0.11, z0 - 0.063), (x0, y0 - 0.117, z0 - 0.07), (x0 + 0.019, y0 - 0.11, z0 - 0.063)], 0.0042, 4)
    if hairstyle is None: return
    lo = {'short': -0.62, 'capped': -0.62, 'crop': -0.45, 'perm': -0.5}[hairstyle]
    def cut(a):
        A = abs(a)
        if A < 0.85: c = 0.36 - (0.15 * abs(math.sin(a * 8.5)) if hairstyle != 'crop' else 0.0)   # spiky fringe
        elif A < 1.5: c = 0.36 + (-0.02 - 0.36) * (A - 0.85) / 0.65
        elif A < 2.6: c = -0.02 + (lo + 0.02) * (A - 1.5) / 1.1
        else: c = lo
        return c
    r = (0.138, 0.142, 0.158) if hairstyle != 'crop' else (0.134, 0.136, 0.15)
    _pv_dome(hair, (x0, y0 + 0.006, z0 - 0.002), r, cut, seg=22, rings=6)
    if hairstyle == 'short':  # a few tufts at the crown and the nape
        for k, (dx, dy, dz) in enumerate(((0.02, 0.06, 0.15), (-0.05, 0.1, 0.11), (0.08, 0.09, 0.07))):
            o = cyl(hair, 0.03, 0.06, (x0 + dx, y0 + dy, z0 + dz), 6, r2=0.0); o.rotation_euler = (-0.9, dx * 6, 0)

def _pv_person(prefix, h, top, bottom, skin='skin', hair='hair', hairstyle='short', sleeves='long', shoes='shoe', skirt=False,
               blush=False, brows=1.0, body=None, arm_r=None, collar=None):
    with xf((0, 0, 0), s=h):
        _pv_head(skin, hair, hairstyle, blush, brows)
        # torso (top colour) with a hem flaring over the trousers, pelvis in the bottom colour
        _pv_lathe(top, [(0.0, 0.88), (0.176, 0.88), (0.19, 0.91), (0.175, 0.97), (0.166, 1.04), (0.178, 1.15), (0.194, 1.25), (0.2, 1.32),
                        (0.188, 1.38), (0.145, 1.425), (0.075, 1.45), (0, 1.455)], seg=14, sy=0.66)
        if skirt:
            _pv_lathe(bottom, [(0.0, 0.4), (0.27, 0.4), (0.272, 0.43), (0.235, 0.62), (0.2, 0.8), (0.176, 0.95), (0.0, 0.95)], seg=16, sy=0.85)
            for k in range(5):  # pleats
                a = -math.pi / 2 + (k - 2) * 0.42
                _pv_tube(bottom, [(0.265 * math.cos(a), 0.265 * 0.85 * math.sin(a), 0.42), (0.19 * math.cos(a), 0.19 * 0.85 * math.sin(a), 0.85)], [0.012, 0.004], 4)
        else:
            _pv_lathe(bottom, [(0.0, 0.76), (0.12, 0.765), (0.172, 0.8), (0.182, 0.86), (0.174, 0.95), (0.0, 0.95)], seg=16, sy=0.72)
        _pv_lathe(collar or top, [(0.064, 1.405), (0.08, 1.425), (0.07, 1.475), (0.058, 1.48)], seg=12, sy=0.92)   # collar
        if body: body()
    for sx, s_ in ((-1, 'l'), (1, 'r')):
        part(f'{prefix}_leg_{s_}', (sx * 0.09 * h, 0, 0.84 * h))
        with xf((0, 0, 0), s=h):
            x = sx * 0.09
            if skirt:
                _pv_tube(skin, [(x, 0, 0.82), (x, 0, 0.47), (x, 0.005, 0.1)], [0.07, 0.056, 0.042], 8)
                _pv_tube('cloth_navy', [(x, 0.004, 0.25), (x, 0.005, 0.07)], [0.046, 0.044], 8)        # socks
            else:
                _pv_tube(bottom, [(x, 0, 0.9), (x, 0, 0.68), (x, -0.006, 0.47), (x, 0.0, 0.26), (x, 0.004, 0.1)], [0.088, 0.08, 0.068, 0.062, 0.066], 8)
                for z in (0.42, 0.5): _pv_tube(bottom, [(x - 0.06, -0.035 - (z - 0.42) * 0.3, z), (x + 0.06, -0.04, z + 0.03)], 0.012, 4)  # knee folds
            if shoes == 'boots':
                _pv_lathe('pv_boot_white', [(0, 0.03), (0.07, 0.03), (0.072, 0.2), (0.077, 0.36), (0.086, 0.4), (0.086, 0.425), (0.066, 0.425), (0.0, 0.41)], (x, 0.008, 0), seg=10)
                ico('pv_boot_white', 0.066, (x, -0.05, 0.055), (0.95, 1.55, 0.85), 2, flat_bottom=-0.04)
                _pv_rbox('rubber', (0.13, 0.25, 0.03), (x, -0.03, 0.0), 0.012)
                _pv_lathe('cloth_navy', [(0.086, 0.4), (0.09, 0.405), (0.09, 0.425), (0.086, 0.43)], (x, 0.008, 0), seg=10)   # top band
            else:
                mat = 'pv_sneaker' if shoes == 'sneaker' else 'pv_shoe_brown'
                ico(mat, 0.06, (x, -0.035, 0.055), (0.95, 1.9, 0.9), 2, flat_bottom=-0.035)
                _pv_rbox('cloth_grey' if shoes == 'sneaker' else 'rubber', (0.115, 0.235, 0.025), (x, -0.035, 0.0), 0.01)
                if shoes == 'sneaker':
                    _pv_tube('cloth_blue', [(x + sx * 0.055, 0.03, 0.04), (x + sx * 0.06, -0.03, 0.06), (x + sx * 0.05, -0.08, 0.04)], 0.008, 4)
                    for k in range(3): rod('white', (x - 0.025, -0.07 + k * 0.025, 0.085 - k * 0.006), (x + 0.025, -0.07 + k * 0.025, 0.085 - k * 0.006), 0.005, 3)
        part(f'{prefix}_arm_{s_}', (sx * 0.24 * h, 0, 1.4 * h))
        with xf((0, 0, 0), s=h):
            ico(top, 0.062, (sx * 0.228, 0, 1.35), (1, 0.95, 1), 2)                               # shoulder
            el, wr = (sx * 0.265, 0.01, 1.11), (sx * 0.272, -0.03, 0.87)
            _pv_tube(top, [(sx * 0.232, 0, 1.4), (sx * 0.255, 0.005, 1.25), el], [0.064, 0.058, 0.053], 8)
            fore = skin if sleeves in ('rolled', 'short') else top
            _pv_tube(fore, [el, (sx * 0.27, -0.01, 0.98), wr], [0.049 if fore == top else 0.043, 0.045 if fore == top else 0.04, 0.039 if fore == top else 0.032], 8)
            if sleeves == 'rolled': torus(top, 0.052, 0.017, el, rot=(0, 0, 0), seg=12, rseg=5)
            elif sleeves == 'long': torus(top, 0.04, 0.011, (wr[0], wr[1] + 0.004, wr[2] + 0.02), seg=12, rseg=4)
            elif sleeves == 'cover':   # shop arm covers (腕カバー) over the forearm
                _pv_tube('cloth_navy', [(el[0], el[1], el[2] + 0.01), (sx * 0.27, -0.01, 0.98), (wr[0], wr[1], wr[2] + 0.005)], [0.054, 0.05, 0.043], 8)
                for p in (el, wr): torus('cloth_navy', 0.045, 0.01, (p[0], p[1], p[2] + 0.01), seg=8, rseg=3)
            ico(skin, 0.045, (sx * 0.274, -0.036, 0.82), (0.55, 0.85, 1.05), 2)                       # hand
            ico(skin, 0.018, (sx * 0.255, -0.068, 0.835), (0.8, 1.0, 1.3), 1)                          # thumb
            if sx > 0 and arm_r: arm_r()
        part(None)

# ---- boats
def _pv_hull_trim(L, hb, zd, yy, bw, N=30):
    """Rubbing strake, bulwark cap rail, freeing ports, bow fairlead and a stern bitt pair for boat_hull()."""
    ts = [i / N for i in range(N + 1)]
    for sx in (-1, 1):
        _pv_tube('rubber', [(sx * (hb(t) + 0.03), yy(t), zd(t) - 0.03) for t in ts[:-1]], 0.04, 5)
        _pv_tube('white', [(sx * (hb(t) * 1.01 - 0.035), yy(t), zd(t) + bw + 0.01) for t in ts[:-1]], 0.05, 5)
        for t in [0.06 + k * 0.08 for k in range(8)]:
            a = math.atan2(hb(t + 0.01) - hb(t - 0.01), 0.02 * L)
            box('steel_dark', (0.03, 0.32, 0.1), (sx * (hb(t) * 1.002 + 0.006), yy(t), zd(t) + 0.04), (0, 0, sx * a))
        with xf((sx * hb(0.03) * 0.75, yy(0.03), zd(0.03))):                                          # stern bitts
            for dy in (-0.15, 0.15): cyl('white', 0.07, 0.35, (0, dy, 0), 10); cyl('white', 0.09, 0.03, (0, dy, 0.35), 10)
            rod('white', (0, -0.15, 0.25), (0, 0.15, 0.25), 0.03, 6)
    _pv_rbox('pv_chrome', (0.22, 0.25, 0.14), (0, yy(0.995), zd(1.0) + bw - 0.05), 0.04)               # bow fairlead

def _pv_wheelhouse(w, d, h, nfront=3, nside=2, roof_mat='boat_blue', door=1, visor=True, ring=True, ladder=True):
    """Wheelhouse at the current transform (bottom centre on the deck, front -Y): rounded box, framed windows with
    wipers, a sun visor, a door with a porthole, handrails, a ladder at the back and a life ring."""
    _pv_rbox('white', (w, d, h), (0, 0, 0), 0.09, segs=2)
    _pv_rbox(roof_mat, (w + 0.24, d + 0.3, 0.1), (0, 0, h), 0.04)
    pw = (w - 0.3) / nfront
    for k in range(nfront):
        x = -w / 2 + 0.15 + pw * (k + 0.5)
        _pv_rbox('black', (pw - 0.04, 0.03, 0.66), (x, -d / 2 - 0.005, h - 0.86), 0.02)
        _pv_rbox('glass', (pw - 0.12, 0.03, 0.56), (x, -d / 2 - 0.015, h - 0.81), 0.015)
        rod('black', (x, -d / 2 - 0.04, h - 0.78), (x - pw * 0.3, -d / 2 - 0.04, h - 0.4), 0.01, 4)
    if visor:
        box(roof_mat, (w, 0.35, 0.04), (0, -d / 2 - 0.15, h - 0.08), (-0.35, 0, 0))
    sw = (d * 0.62 - 0.1) / nside
    for sx in (-1, 1):
        for k in range(nside):
            y = -d / 2 + 0.15 + sw * (k + 0.5)
            _pv_rbox('black', (0.03, sw - 0.06, 0.58), (sx * (w / 2 + 0.005), y, h - 0.82), 0.02)
            _pv_rbox('glass', (0.03, sw - 0.14, 0.48), (sx * (w / 2 + 0.015), y, h - 0.77), 0.015)
        _pv_tube('pv_chrome', [(sx * (w / 2 + 0.06), -d / 2 + 0.2, h - 0.3), (sx * (w / 2 + 0.06), d / 2 - 0.2, h - 0.3)], 0.018, 6)   # handrail
        for y in (-d / 2 + 0.2, d / 2 - 0.2): rod('pv_chrome', (sx * (w / 2), y, h - 0.3), (sx * (w / 2 + 0.06), y, h - 0.3), 0.014, 4)
    if door:   # door aft on one side
        sx = door; y0 = d / 2 - 0.25 - 0.35
        _pv_rbox('pv_paint_white', (0.04, 0.68, h - 0.25), (sx * (w / 2 + 0.01), y0, 0.1), 0.03)
        _pv_rbox('black', (0.05, 0.62, 0.025), (sx * (w / 2 + 0.012), y0, h - 0.17), 0.01)
        with xf((sx * (w / 2 + 0.03), y0, h - 0.65), ry=math.pi / 2):
            torus('pv_chrome', 0.13, 0.02, (0, 0, 0), seg=14, rseg=4); cyl('glass', 0.12, 0.01, (0, 0, 0), 14)
        _pv_rbox('pv_chrome', (0.04, 0.03, 0.12), (sx * (w / 2 + 0.035), y0 - 0.25, h * 0.5), 0.01)
    # back wall: ladder and life ring
    for sx in (-1, 1):
        if ladder: rod('pv_chrome', (sx * 0.2 - 0.5, d / 2 + 0.12, 0.0), (sx * 0.2 - 0.5, d / 2 + 0.12, h + 0.6), 0.02, 6)
    for k in range(int(h / 0.3) + 1 if ladder else 0): rod('pv_chrome', (-0.7, d / 2 + 0.12, 0.3 + k * 0.3), (-0.3, d / 2 + 0.12, 0.3 + k * 0.3), 0.014, 4)
    if ring:
        with xf((0.45, d / 2 + 0.05, h * 0.55), rx=math.pi / 2):
            torus('float_orange', 0.26, 0.06, (0, 0, 0), seg=16, rseg=6)
        for k in range(4):
            a = k * math.pi / 2 + math.pi / 4
            _pv_tube('white', [(0.45 + 0.26 * math.cos(a + da), d / 2 + 0.05, h * 0.55 + 0.26 * math.sin(a + da)) for da in (-0.18, 0.0, 0.18)], 0.066, 6)

def _pv_radar(name_part, pivot, L=1.8):
    """Open-array radar scanner as its own part (it spins about Z at the pivot); the pedestal stays in the body."""
    x, y, z = pivot
    part(name_part, pivot)
    _pv_rbox('white', (0.3, 0.3, 0.2), (x, y, z - 0.1), 0.05, segs=2)
    _pv_rbox('white', (L, 0.14, 0.14), (x, y, z + 0.1), 0.06, segs=2)
    box('steel_dark', (L - 0.1, 0.02, 0.06), (x, y - 0.075, z + 0.14))
    part(None)
    cyl('white', 0.12, 0.22, (x, y, z - 0.32), 10, r2=0.1)

def _pv_stay(a, b, r=0.012): rod('steel_dark', a, b, r, 4)

def _pv_lights_mast(x, y, z0, z1, top='beacon_white'):
    rod('white', (x, y, z0), (x, y, z1), 0.08, 10)
    cyl('steel_dark', 0.07, 0.12, (x, y, z1), 8); ico(top, 0.08, (x, y, z1 + 0.18), sub=2)
    for k in range(2): cyl('beacon_white' if k else 'beacon_red', 0.06, 0.1, (x, y, z1 - 0.4 - k * 0.35), 8)

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
