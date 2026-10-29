# 深夜のコインランドリー — a late-night coin laundry on a rainy street, built with Blender's Python API.
#   pip install bpy pillow
#   python3 make_textures.py            # sign / panel textures (IPA Gothic)
#   python3 make_scene.py [--preview]   # builds coin_laundry.blend and renders render.png (Cycles)
# Blender coordinates: Z up. The shop floor spans x 0..6.4 (glass front at x = 0, street beyond), y -1..11 (back wall).
import math, os, random, sys
import bpy, bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, 'textures')
PREVIEW = '--preview' in sys.argv
FONT = next(p for p in ['/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf', '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf'] if os.path.exists(p))
random.seed(3)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
W, D, H = 6.4, 9.4, 2.6  # room width (x), back wall (y), ceiling

# ---------------------------------------------------------------- materials
MATS = {}
def nodes(m):
    m.use_nodes = True
    nt = m.node_tree
    return nt, nt.nodes, nt.links, nt.nodes['Principled BSDF']

def mat(name, color=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, emit=None, strength=0.0, alpha=1.0, transmission=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name)
    nt, N, L, p = nodes(m)
    p.inputs['Base Color'].default_value = (*color, 1); p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    if emit: p.inputs['Emission Color'].default_value = (*emit, 1); p.inputs['Emission Strength'].default_value = strength
    if transmission: p.inputs['Transmission Weight'].default_value = transmission
    if alpha < 1: p.inputs['Alpha'].default_value = alpha
    MATS[name] = m
    return m

def noise_rough(m, lo, hi, scale=6.0, detail=6):
    """Roughness that wanders between lo and hi (smudges, wet patches)."""
    nt, N, L, p = nodes(m)
    n = N.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail
    r = N.new('ShaderNodeMapRange'); r.inputs['To Min'].default_value = lo; r.inputs['To Max'].default_value = hi
    r.inputs['From Min'].default_value = 0.35; r.inputs['From Max'].default_value = 0.65
    L.new(n.outputs['Fac'], r.inputs['Value']); L.new(r.outputs['Result'], p.inputs['Roughness'])
    return n

def grime(m, base, dark, scale=3.0):
    """Base colour darkened by blotchy dirt."""
    nt, N, L, p = nodes(m)
    n = N.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = 8
    c = N.new('ShaderNodeValToRGB'); c.color_ramp.elements[0].color = (*dark, 1); c.color_ramp.elements[1].color = (*base, 1)
    c.color_ramp.elements[0].position = 0.35; c.color_ramp.elements[1].position = 0.7
    L.new(n.outputs['Fac'], c.inputs['Fac']); L.new(c.outputs['Color'], p.inputs['Base Color'])

def img_mat(name, file, rough=0.55, emit=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name)
    nt, N, L, p = nodes(m)
    t = N.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(TEX, file))
    L.new(t.outputs['Color'], p.inputs['Base Color']); p.inputs['Roughness'].default_value = rough
    if emit:
        L.new(t.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = emit
    if t.image.depth == 32 or file.endswith('clock.png'):
        L.new(t.outputs['Alpha'], p.inputs['Alpha'])
    MATS[name] = m
    return m

def build_materials():
    f = mat('floor', rough=0.3)  # vinyl tiles: brick texture squares, dirt, wet sheen
    nt, N, L, p = nodes(f)
    b = N.new('ShaderNodeTexBrick'); b.offset = 0; b.squash = 1; b.inputs['Scale'].default_value = 1.0
    b.inputs['Mortar Size'].default_value = 0.004; b.inputs['Brick Width'].default_value = 0.3; b.inputs['Row Height'].default_value = 0.3
    b.inputs['Color1'].default_value = (0.46, 0.38, 0.24, 1); b.inputs['Color2'].default_value = (0.42, 0.35, 0.22, 1); b.inputs['Mortar'].default_value = (0.36, 0.3, 0.19, 1)
    tc = N.new('ShaderNodeTexCoord'); L.new(tc.outputs['Object'], b.inputs['Vector'])
    n = N.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 1.6; n.inputs['Detail'].default_value = 10
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 0.85
    L.new(b.outputs['Color'], mix.inputs['A']); L.new(n.outputs['Color'], mix.inputs['B']); L.new(mix.outputs['Result'], p.inputs['Base Color'])
    r = N.new('ShaderNodeMapRange'); r.inputs['From Min'].default_value = 0.4; r.inputs['From Max'].default_value = 0.62
    r.inputs['To Min'].default_value = 0.04; r.inputs['To Max'].default_value = 0.32
    n2 = N.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 0.9; n2.inputs['Detail'].default_value = 4
    L.new(n2.outputs['Fac'], r.inputs['Value']); L.new(r.outputs['Result'], p.inputs['Roughness'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.15
    L.new(b.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], p.inputs['Normal'])

    w = mat('wall', rough=0.85); grime(w, (0.46, 0.44, 0.38), (0.28, 0.26, 0.21), 2.5)
    mat('ceiling', (0.32, 0.32, 0.3), 0.9)
    s = mat('steel', (0.66, 0.66, 0.64), 0.26, 1.0); noise_rough(s, 0.2, 0.3, 3)
    nt, N, L, p = nodes(s); p.inputs['Anisotropic'].default_value = 0.25
    mat('chrome', (0.85, 0.85, 0.85), 0.12, 1.0)
    mat('alu', (0.7, 0.71, 0.72), 0.35, 1.0)
    mat('alu_dark', (0.35, 0.35, 0.36), 0.4, 1.0)
    mat('rubber', (0.03, 0.03, 0.03), 0.7)
    mat('drum', (0.25, 0.25, 0.26), 0.35, 1.0)
    g = mat('door_glass', (0.02, 0.025, 0.03), 0.05, 0.0, transmission=0.0); g.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = 1.0
    gl = mat('glass', (0.9, 0.95, 1.0), 0.0, transmission=1.0)
    nt, N, L, p = nodes(gl); p.inputs['IOR'].default_value = 1.02
    v = N.new('ShaderNodeTexVoronoi'); v.inputs['Scale'].default_value = 60; v.feature = 'DISTANCE_TO_EDGE'
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.03  # rain drops on the glass
    L.new(v.outputs['Distance'], bump.inputs['Height']); L.new(bump.outputs['Normal'], p.inputs['Normal'])
    mat('tube', (1, 1, 1), 0.3, emit=(0.92, 0.98, 1.0), strength=22)
    mat('fixture', (0.85, 0.85, 0.82), 0.5)
    mat('plastic_white', (0.78, 0.78, 0.75), 0.45)
    mat('plastic_grey', (0.45, 0.46, 0.46), 0.5)
    mat('table_top', (0.8, 0.8, 0.78), 0.35)
    mat('black', (0.02, 0.02, 0.02), 0.5)
    mat('mat_rug', (0.03, 0.035, 0.04), 1.0)
    mat('wood_door', (0.45, 0.45, 0.43), 0.6, 0.2)
    mat('ac', (0.85, 0.85, 0.82), 0.4)
    mat('leaf', (0.05, 0.16, 0.04), 0.6)
    mat('pot', (0.25, 0.2, 0.16), 0.8)
    mat('basket', (0.85, 0.85, 0.8), 0.5)
    mat('letter', (0.92, 0.92, 0.92), 0.4, emit=(1, 1, 1), strength=0.15)
    a = mat('asphalt', (0.07, 0.07, 0.075), 0.06); noise_rough(a, 0.01, 0.35, 0.5, 8)  # puddles mirror the lamps
    nt, N, L, p = nodes(a)
    n = N.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 40; bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.05
    L.new(n.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], p.inputs['Normal'])
    mat('curb', (0.07, 0.07, 0.075), 0.1)
    mat('house', (0.06, 0.06, 0.07), 0.8)
    mat('roof', (0.04, 0.04, 0.05), 0.6)
    mat('window_warm', (1, 0.8, 0.5), 0.5, emit=(1.0, 0.72, 0.42), strength=14)
    mat('window_dim', (0.3, 0.35, 0.4), 0.5, emit=(0.5, 0.6, 0.75), strength=0.6)
    mat('lamp_led', (1, 1, 1), 0.3, emit=(0.85, 0.92, 1.0), strength=80)
    mat('lamp_sodium', (1, 0.7, 0.3), 0.3, emit=(1.0, 0.6, 0.25), strength=60)
    mat('pole', (0.12, 0.12, 0.12), 0.5, 0.6)
    mat('tree', (0.006, 0.012, 0.007), 0.9)
    r = mat('rain', (0.8, 0.85, 0.9), 0.2, emit=(0.6, 0.7, 0.85), strength=0.35, alpha=0.25)

# ---------------------------------------------------------------- primitives
def box(name, m, size, loc, rot=(0, 0, 0), bevel=0.0):
    """size (x, y, z); loc is the centre of the bottom face."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1], loc[2] + size[2] / 2), rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        b = o.modifiers.new('b', 'BEVEL'); b.width = bevel; b.segments = 2
    o.data.materials.append(MATS[m] if isinstance(m, str) else m)
    return o

def cyl(name, m, r, depth, loc, rot=(0, 0, 0), verts=32):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object; o.name = name; o.data.materials.append(MATS[m] if isinstance(m, str) else m)
    bpy.ops.object.shade_smooth()
    return o

def torus(name, m, R, r, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot, major_segments=64, minor_segments=16)
    o = bpy.context.object; o.name = name; o.data.materials.append(MATS[m]); bpy.ops.object.shade_smooth()
    return o

def tube(name, m, a, b, r=0.015):
    a, b = Vector(a), Vector(b); d = b - a
    o = cyl(name, m, r, d.length, (a + b) / 2, verts=12)
    o.rotation_euler = Vector((0, 0, 1)).rotation_difference(d).to_euler()
    return o

def img_plane(name, m, center, right, up, w, h):
    """Quad facing (right x up) with UVs 0..1, for signs and panels."""
    c, r, u = Vector(center), Vector(right).normalized() * w / 2, Vector(up).normalized() * h / 2
    me = bpy.data.meshes.new(name)
    me.from_pydata([c - r - u, c + r - u, c + r + u, c - r + u], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(); [setattr(uv.data[i], 'uv', t) for i, t in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)])]
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); o.data.materials.append(m)
    return o

def text(body, size, loc, rot, m='letter', extrude=0.002):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    o = bpy.context.object; o.data.body = body; o.data.font = bpy.data.fonts.load(FONT); o.data.size = size; o.data.extrude = extrude
    o.data.materials.append(MATS[m])
    return o

# Facing helpers: machines along the right wall face -X; their "right" (as seen from the front) is -Y.
FACE_X = dict(right=(0, -1, 0), up=(0, 0, 1))

# ---------------------------------------------------------------- the room
def room():
    box('floor', 'floor', (W + 0.2, D + 1.2, 0.02), (W / 2, D / 2 - 0.6, -0.02))
    box('ceiling', 'ceiling', (W + 0.2, D + 1.2, 0.05), (W / 2, D / 2 - 0.6, H))
    for i in range(1, 6):  # ceiling panel seams
        box(f'seam{i}', 'fixture', (W, 0.02, 0.01), (W / 2, i * 2 - 0.6, H - 0.01))
    box('back_wall', 'wall', (W + 0.2, 0.15, H), (W / 2, D + 0.075, 0))
    box('right_wall', 'wall', (0.15, D + 1.2, H), (W + 0.075, D / 2 - 0.6, 0))
    box('left_wall_back', 'wall', (0.25, 3.5, H), (-0.05, D - 1.75, 0))  # solid wall behind the glass front
    box('pillar', 'wall', (0.35, 0.3, H), (0.12, 7.4, 0))
    for x0, y0, l, ax in ((0, D, W, 'x'), (W, -1, D + 1, 'y')):  # skirting boards
        if ax == 'x': box('skirt', 'plastic_grey', (l, 0.02, 0.08), (x0 + l / 2, y0 - 0.01, 0))
        else: box('skirt', 'plastic_grey', (0.02, l, 0.08), (x0 - 0.01, y0 + l / 2, 0))
    # glass storefront: aluminium frames, big panes, transom
    for y in (-1.0, 1.4, 4.0, 7.25):
        box('mullion', 'alu', (0.12, 0.1, H), (0.05, y, 0))
    box('sill', 'alu', (0.18, 8.3, 0.12), (0.05, 3.1, 0))
    box('transom', 'alu', (0.14, 8.3, 0.1), (0.05, 3.1, 2.05))
    box('head', 'alu_dark', (0.2, 8.3, 0.14), (0.05, 3.1, H - 0.14))
    for y0, y1 in ((-1.0, 1.4), (1.4, 4.0), (4.0, 7.25)):
        box('pane', 'glass', (0.012, y1 - y0 - 0.1, 1.9), (0.02, (y0 + y1) / 2, 0.12))
        box('pane_top', 'glass', (0.012, y1 - y0 - 0.1, 0.45), (0.02, (y0 + y1) / 2, 2.15))
    box('door_handle', 'alu', (0.04, 0.03, 0.5), (0.1, 1.3, 0.85))
    # lettering on the glass, readable from inside
    rot = (math.radians(90), 0, math.radians(90))
    text('コインランドリー', 0.26, (0.045, 2.15, 1.42), rot)
    text('年中無休', 0.17, (0.045, 2.15, 1.08), rot)
    text('6:00-24:00', 0.17, (0.045, 2.15, 0.82), rot)
    img_plane('sign_door', img_mat('sign_door', 'sign_door.png'), (0.06, 4.15, 1.45), (0, 1, 0), (0, 0, 1), 0.16, 0.55)

def back_wall():
    y = D - 0.005
    box('door', 'wood_door', (0.95, 0.05, 2.05), (3.75, y - 0.02, 0))
    box('door_frame_l', 'alu_dark', (0.05, 0.08, 2.1), (3.25, y - 0.02, 0)); box('door_frame_r', 'alu_dark', (0.05, 0.08, 2.1), (4.25, y - 0.02, 0))
    box('door_frame_t', 'alu_dark', (1.05, 0.08, 0.05), (3.75, y - 0.02, 2.08))
    cyl('door_knob', 'chrome', 0.03, 0.08, (4.1, y - 0.08, 1.0), rot=(math.radians(90), 0, 0))
    right, up = (1, 0, 0), (0, 0, 1)
    img_plane('sign_staff', img_mat('sign_staff', 'sign_staff.png'), (3.75, y - 0.05, 1.55), right, up, 0.42, 0.3)
    img_plane('poster0', img_mat('poster0', 'poster0.png'), (2.55, y - 0.01, 1.5), right, up, 0.36, 0.5)
    img_plane('poster1', img_mat('poster1', 'poster1.png'), (2.98, y - 0.01, 1.5), right, up, 0.36, 0.5)
    box('notice_box', 'plastic_grey', (0.5, 0.05, 0.35), (2.8, y - 0.03, 0.95))
    cyl('clock_rim', 'plastic_grey', 0.17, 0.05, (4.05, y - 0.03, 2.3), rot=(math.radians(90), 0, 0))
    img_plane('clock', img_mat('clock', 'clock.png', 0.4), (4.05, y - 0.06, 2.3), right, up, 0.32, 0.32)
    box('ac', 'ac', (0.85, 0.24, 0.28), (2.45, y - 0.12, 2.1), bevel=0.03)
    box('ac_vent', 'plastic_grey', (0.75, 0.02, 0.04), (2.45, y - 0.25, 2.12))
    box('cabinet', 'plastic_white', (0.5, 0.4, 0.8), (2.95, y - 0.2, 0), bevel=0.01)
    # small table with a laundry basket and a potted plant, stools
    box('side_table', 'table_top', (0.75, 0.45, 0.03), (1.2, D - 0.3, 0.72))
    for dx in (-0.33, 0.33):
        for dy in (-0.18, 0.18): tube('leg', 'alu', (1.2 + dx, D - 0.3 + dy, 0), (1.2 + dx, D - 0.3 + dy, 0.72), 0.012)
    box('basket', 'basket', (0.45, 0.32, 0.22), (1.05, D - 0.3, 0.75), bevel=0.02)
    cyl('pot', 'pot', 0.1, 0.18, (1.42, D - 0.25, 0.84))
    for i in range(14):  # leaves
        a = i / 14 * math.tau; L = random.uniform(0.25, 0.4)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(1.42 + math.cos(a) * L * 0.5, D - 0.25 + math.sin(a) * L * 0.5, 0.98 + L * 0.5), segments=8, ring_count=4)
        o = bpy.context.object; o.scale = (L * 0.5, 0.06, 0.03); o.rotation_euler = (random.uniform(-0.6, 0.6), random.uniform(-0.8, -0.3), a)
        o.data.materials.append(MATS['leaf'])
    for x in (2.0, 3.0):  # stools
        cyl('stool_seat', 'plastic_white', 0.16, 0.04, (x, D - 1.4 + (x - 2) * 0.3, 0.55))
        for i in range(4):
            a = i / 4 * math.tau + 0.4
            tube('stool_leg', 'alu', (x + math.cos(a) * 0.16, D - 1.4 + (x - 2) * 0.3 + math.sin(a) * 0.16, 0), (x + math.cos(a) * 0.11, D - 1.4 + (x - 2) * 0.3 + math.sin(a) * 0.11, 0.55), 0.01)
    # wall fan high up on the left wall
    fx, fy = 0.25, D - 1.6
    box('fan_mount', 'plastic_white', (0.06, 0.12, 0.12), (fx - 0.1, fy, 2.15))
    cyl('fan_motor', 'plastic_white', 0.08, 0.16, (fx + 0.02, fy, 2.2), rot=(0, math.radians(80), math.radians(15)))
    torus('fan_guard', 'chrome', 0.2, 0.006, (fx + 0.14, fy + 0.03, 2.18), rot=(0, math.radians(80), math.radians(15)))
    for i in range(3):
        a = i / 3 * math.tau
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(fx + 0.13, fy + 0.03 + math.cos(a) * 0.09, 2.18 + math.sin(a) * 0.09), segments=12, ring_count=6)
        o = bpy.context.object; o.scale = (0.01, 0.06, 0.1); o.rotation_euler = (a, 0, 0); o.data.materials.append(MATS['plastic_white'])
    box('intercom', 'plastic_white', (0.03, 0.12, 0.18), (0.08, 8.6, 1.35))

def washer(y, i, big=True):
    """Front-loading washer against the right wall, door facing -X."""
    w, d, h = 1.12, 0.95, 1.62
    x0 = W - d
    box(f'washer{i}', 'steel', (d, w - 0.02, h), (W - d / 2, y, 0), bevel=0.02)
    box(f'washer{i}_base', 'alu_dark', (d - 0.05, w - 0.06, 0.08), (W - d / 2 + 0.02, y, 0))
    img_plane(f'washer{i}_panel', img_mat(f'panel_washer{i % 3}', f'panel_washer{i % 3}.png', 0.4, 0.4), (x0 - 0.004, y, h - 0.2), **FACE_X, w=w - 0.08, h=0.3)
    img_plane(f'washer{i}_badge', img_mat('badge22' if big else 'badge12', 'badge22.png' if big else 'badge12.png', 0.4), (x0 - 0.004, y + 0.38, 1.18), **FACE_X, w=0.18, h=0.23)
    zc, R = 0.82, 0.36
    rot = (0, math.radians(90), 0)
    torus(f'washer{i}_rim', 'chrome', R, 0.045, (x0 - 0.04, y - 0.02, zc), rot)
    torus(f'washer{i}_gasket', 'rubber', R - 0.05, 0.03, (x0 - 0.02, y - 0.02, zc), rot)
    cyl(f'washer{i}_glass', 'door_glass', R - 0.03, 0.03, (x0 - 0.05, y - 0.02, zc), rot)
    cyl(f'washer{i}_drum', 'drum', R - 0.06, 0.02, (x0 + 0.25, y - 0.02, zc), rot)
    box(f'washer{i}_handle', 'chrome', (0.05, 0.05, 0.22), (x0 - 0.05, y - 0.02 - R + 0.03, zc - 0.11), bevel=0.01)
    for k in range(2):
        img_plane(f'washer{i}_sticker{k}', img_mat(f'sticker{(i + k) % 6}', f'sticker{(i + k) % 6}.png', 0.5), (x0 - 0.004, y + 0.36 - k * 0.72, 0.62 + k * 0.6), **FACE_X, w=0.09, h=0.12)
    img_plane(f'washer{i}_s2', img_mat(f'sticker{(i + 3) % 6}', f'sticker{(i + 3) % 6}.png', 0.5), (x0 - 0.052, y - 0.02, zc + 0.12), **FACE_X, w=0.1, h=0.07)

def dryer(y, z, i):
    w, d, h = 0.9, 0.85, 0.92
    x0 = W - d
    box(f'dryer{i}', 'steel', (d, w - 0.02, h - 0.01), (W - d / 2, y, z), bevel=0.015)
    img_plane(f'dryer{i}_panel', img_mat('panel_dryer', 'panel_dryer.png', 0.4, 0.4), (x0 - 0.004, y, z + h - 0.11), **FACE_X, w=w - 0.08, h=0.17)
    zc, R = z + 0.4, 0.3
    rot = (0, math.radians(90), 0)
    torus(f'dryer{i}_rim', 'chrome', R, 0.035, (x0 - 0.035, y, zc), rot)
    cyl(f'dryer{i}_glass', 'door_glass', R - 0.02, 0.02, (x0 - 0.04, y, zc), rot)
    cyl(f'dryer{i}_drum', 'drum', R - 0.04, 0.02, (x0 + 0.3, y, zc), rot)
    img_plane(f'dryer{i}_sticker', img_mat(f'sticker{i % 6}', f'sticker{i % 6}.png', 0.5), (x0 - 0.004, y + 0.3, zc + 0.05), **FACE_X, w=0.08, h=0.1)

def machines():
    for i, y in enumerate([-0.15, 1.0, 2.15, 3.3]): washer(y, i, big=i < 3)
    for c, y in enumerate([5.2, 6.12, 7.04, 7.96]):
        dryer(y, 0.08, c * 2); dryer(y, 1.0, c * 2 + 1)
        box('dryer_plinth', 'alu_dark', (0.82, 0.88, 0.08), (W - 0.42, y, 0))
    box('dryer_header', 'wall', (0.9, 3.9, 0.65), (W - 0.45, 6.58, H - 0.65))
    img_plane('sign_dryer', img_mat('sign_dryer', 'sign_dryer.png'), (W - 0.905, 5.6, 2.3), **FACE_X, w=0.62, h=0.2)
    img_plane('sign_usage', img_mat('sign_usage', 'sign_usage.png', 0.5, 0.05), (W - 0.005, 3.45, 2.06), **FACE_X, w=0.64, h=0.88)
    img_plane('sign_prices', img_mat('sign_prices', 'sign_prices.png', 0.5, 0.05), (W - 0.005, 2.05, 2.1), **FACE_X, w=0.64, h=0.8)

def furniture():
    # aluminium bench along the window
    bx, y0, y1 = 0.85, 1.7, 3.85
    for k in range(5): box('bench_slat', 'alu', (0.075, y1 - y0, 0.025), (bx - 0.18 + k * 0.09, (y0 + y1) / 2, 0.44), bevel=0.008)
    for k in range(3): box('bench_back', 'alu', (0.025, y1 - y0, 0.075), (bx - 0.27, (y0 + y1) / 2, 0.62 + k * 0.1), rot=(0, math.radians(-10), 0), bevel=0.008)
    for y in (y0 + 0.15, y1 - 0.15):
        tube('bench_leg', 'alu', (bx - 0.2, y, 0), (bx - 0.2, y, 0.44)); tube('bench_leg', 'alu', (bx + 0.2, y, 0), (bx + 0.2, y, 0.44))
        tube('bench_rail', 'alu', (bx - 0.2, y, 0.08), (bx + 0.2, y, 0.08)); tube('bench_back_post', 'alu', (bx - 0.25, y, 0.44), (bx - 0.31, y, 0.9))
    # folding table with a wire cart below
    tx, ty = 3.55, 6.2
    box('table', 'table_top', (1.35, 0.8, 0.04), (tx, ty, 0.84), bevel=0.01)
    for dx in (-0.6, 0.6):
        for dy in (-0.33, 0.33): tube('table_leg', 'alu_dark', (tx + dx, ty + dy, 0), (tx + dx, ty + dy, 0.84), 0.02)
    cx, cy = tx, ty - 0.05
    for z in (0.3, 0.62):  # wire basket: rim + mesh
        for s in (-1, 1):
            tube('cart_rim', 'chrome', (cx - 0.35, cy + s * 0.25, z), (cx + 0.35, cy + s * 0.25, z), 0.006)
            tube('cart_rim', 'chrome', (cx + s * 0.35, cy - 0.25, z), (cx + s * 0.35, cy + 0.25, z), 0.006)
    for k in range(15):
        x = cx - 0.35 + k * 0.05
        for s in (-1, 1): tube('cart_wire', 'chrome', (x, cy + s * 0.25, 0.3), (x, cy + s * 0.25, 0.62), 0.003)
    for k in range(11):
        y = cy - 0.25 + k * 0.05
        for s in (-1, 1): tube('cart_wire', 'chrome', (cx + s * 0.35, y, 0.3), (cx + s * 0.35, y, 0.62), 0.003)
    for dx in (-0.33, 0.33):
        for dy in (-0.23, 0.23):
            tube('cart_post', 'chrome', (cx + dx, cy + dy, 0.06), (cx + dx, cy + dy, 0.62), 0.008)
            cyl('caster', 'rubber', 0.035, 0.025, (cx + dx, cy + dy, 0.035), rot=(math.radians(90), 0, 0), verts=16)
    # entrance mat, umbrella stand, rubbish bin, a floor drain
    box('mat', 'mat_rug', (1.0, 1.4, 0.012), (1.35, 0.35, 0), bevel=0.01)
    box('umbrella_stand', 'alu_dark', (0.35, 0.6, 0.45), (0.35, -0.55, 0))
    for k in range(2):
        tube('umbrella', 'black', (0.3 + k * 0.08, -0.5 - k * 0.12, 0.05), (0.32 + k * 0.12, -0.42 - k * 0.1, 1.0), 0.03)
        torus('umbrella_hook', 'black', 0.06, 0.012, (0.38 + k * 0.12, -0.42 - k * 0.1, 1.03), rot=(math.radians(90), 0, 0))
    bin_ = box('bin', 'plastic_white', (0.45, 0.42, 0.62), (4.9, 0.05, 0), bevel=0.02)
    t = bin_.modifiers.new('taper', 'SIMPLE_DEFORM'); t.deform_method = 'TAPER'; t.factor = -0.15; t.deform_axis = 'Z'
    box('drain', 'black', (0.12, 0.12, 0.004), (4.5, 4.6, 0))

def ceiling_lights():
    for i, y in enumerate([1.6, 4.3, 6.9, 8.4]):
        x = 3.6 if i < 3 else 3.2
        box(f'fixture{i}', 'fixture', (0.32, 1.3, 0.06), (x, y, H - 0.065), bevel=0.01)
        for dx in (-0.07, 0.07): cyl(f'tube{i}', 'tube', 0.016, 1.22, (x + dx, y, H - 0.085), rot=(math.radians(90), 0, 0), verts=12)
        bpy.ops.object.light_add(type='AREA', location=(x, y, H - 0.11))
        L = bpy.context.object; L.data.shape = 'RECTANGLE'; L.data.size = 0.25; L.data.size_y = 1.2
        L.data.energy = 30 if i < 3 else 18; L.data.color = (0.93, 0.98, 1.0)
    box('vent', 'plastic_grey', (0.5, 0.5, 0.02), (4.2, 3.0, H - 0.02))
    box('vent2', 'plastic_grey', (0.4, 0.4, 0.02), (4.6, 8.8, H - 0.02))

# ---------------------------------------------------------------- outside: wet street, houses, street lamps, rain
def street():
    box('sidewalk', 'curb', (2.0, 60, 0.12), (-1.0, 10, -0.12))
    box('road', 'asphalt', (30, 80, 0.02), (-17, 10, -0.16))
    box('curb', 'curb', (0.2, 60, 0.15), (-2.05, 10, -0.16))
    for k in range(10):  # white road edge line
        box('line', 'letter', (0.1, 2.5, 0.005), (-2.6, -6 + k * 5, -0.14))
    for j, (hx, hy, hw, hd, hh) in enumerate([(-14, -4, 7, 6, 6.5), (-13, 5, 6, 7, 5.5), (-15, 14, 8, 6, 7), (-12, 24, 5, 7, 6), (-22, 32, 9, 7, 8), (-6, 36, 8, 6, 6)]):
        box(f'house{j}', 'house', (hw, hd, hh), (hx, hy, -0.15))
        box(f'roof{j}', 'roof', (hw + 0.6, hd + 0.6, 0.3), (hx, hy, hh - 0.15))
        for k in range(4):
            wy = hy - hd / 2 + 1 + k * (hd - 2) / 3
            for z in (1.6, 4.0):
                if random.random() < 0.55:
                    box('win', random.choice(['window_warm', 'window_dim', 'window_warm']), (0.05, 0.9, 0.9), (hx + hw / 2 + 0.02, wy, z))
    for j, (x, y, h, m) in enumerate([(-2.6, 4.5, 4.6, 'lamp_led'), (-3.5, 11, 3.8, 'lamp_led'), (-10, 22, 5, 'lamp_sodium'), (-8.5, 7, 4.2, 'lamp_sodium'), (-6, 30, 4.5, 'lamp_led')]):
        tube(f'pole{j}', 'pole', (x, y, -0.15), (x, y, h), 0.06)
        tube(f'arm{j}', 'pole', (x, y, h), (x + 0.6, y, h + 0.1), 0.03)
        box(f'lamp{j}', m, (0.45, 0.2, 0.06), (x + 0.75, y, h + 0.02))
        bpy.ops.object.light_add(type='POINT', location=(x + 0.75, y, h - 0.15))
        L = bpy.context.object; L.data.energy = 1100 if m == 'lamp_led' else 650; L.data.shadow_soft_size = 0.15
        L.data.color = (0.82, 0.9, 1.0) if m == 'lamp_led' else (1.0, 0.62, 0.3)
    box('vending_out', mat('vend_glow', (1, 1, 1), 0.3, emit=(0.8, 0.9, 1.0), strength=6), (0.7, 1.0, 1.8), (-7.0, 10.5, -0.15))
    box('vending_body', 'plastic_white', (0.75, 1.05, 0.25), (-6.95, 10.5, 1.65))
    for j in range(8):  # tree silhouettes and hedges
        bpy.ops.mesh.primitive_ico_sphere_add(radius=random.uniform(1.2, 2.2), location=(random.uniform(-13, -9), random.uniform(-6, 30), random.uniform(2.5, 3.5)), subdivisions=2)
        o = bpy.context.object; o.scale = (1, 1, 1.3); o.data.materials.append(MATS['tree']); bpy.ops.object.shade_smooth()
    # rain: thin streaks outside the glass
    bm = bmesh.new()
    for _ in range(900 if PREVIEW else 2600):
        x, y, z = random.uniform(-12, -0.3), random.uniform(-4, 30), random.uniform(-0.1, 6)
        l = random.uniform(0.25, 0.45); s = 0.004
        v = [bm.verts.new(c) for c in ((x - s, y, z), (x + s, y, z), (x + s * 0.2, y + 0.03, z + l), (x - s * 0.2, y + 0.03, z + l))]
        bm.faces.new(v)
    me = bpy.data.meshes.new('rain'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('rain', me); scene.collection.objects.link(o); o.data.materials.append(MATS['rain'])

# ---------------------------------------------------------------- camera, world, render settings
def camera_and_render():
    cam = bpy.data.objects.new('camera', bpy.data.cameras.new('camera')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = 22; cam.data.sensor_width = 36
    cam.location = (2.2, -0.9, 1.38)
    target = Vector((3.25, 10.0, 0.82))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    w = bpy.data.worlds.new('night'); scene.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.006, 0.009, 0.018, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    r = scene.render
    r.engine = 'CYCLES'; scene.cycles.device = 'CPU'
    scene.cycles.samples = 48 if PREVIEW else 160
    scene.cycles.use_denoising = True; scene.cycles.adaptive_threshold = 0.02
    scene.cycles.max_bounces = 8; scene.cycles.transmission_bounces = 8; scene.cycles.volume_bounces = 0
    scene.cycles.sample_clamp_indirect = 4.0; scene.cycles.blur_glossy = 1.0
    r.resolution_x, r.resolution_y = 1536, 1024
    r.resolution_percentage = 50 if PREVIEW else 100
    scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = -0.1
    r.image_settings.file_format = 'PNG'
    r.filepath = os.path.join(HERE, 'render_preview.png' if PREVIEW else 'render.png')

build_materials()
room(); back_wall(); machines(); furniture(); ceiling_lights(); street(); camera_and_render()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'coin_laundry.blend'), compress=True)
bpy.ops.render.render(write_still=True)
print('rendered', scene.render.filepath)
