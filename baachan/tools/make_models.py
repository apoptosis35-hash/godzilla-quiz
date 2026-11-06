# Characters and props for ばあちゃんターボ, modelled with Blender's Python API.
#   pip install bpy        (Blender 5.x as a Python module)
#   python3 baachan/tools/make_models.py [--render] [name ...]
# Writes baachan/models/<name>.glb and (with --render) baachan/tools/preview/<name>.jpg.
# Conventions (same as ../uminagi-assets): 1 unit = 1 m, glTF Y up, front = +Z, origin at the feet.
# Moving parts are separate nodes whose origin is the joint (e.g. granny_arm_l = shoulder, granny_knee_l = knee).
import math, os, random, sys
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'models'))
PREVIEW = os.path.join(HERE, 'preview')
FONT_PATH = next((p for p in ('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf', '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf') if os.path.exists(p)), None)
random.seed(3)
TAU = math.tau

# ---------------------------------------------------------------- scene / materials
def reset():
    global FONT
    bpy.ops.wm.read_factory_settings(use_empty=True); MATS.clear(); FONT = None

MATS = {}
def M(name, color, rough=0.6, metal=0.0, emit=None, strength=2.0, alpha=1.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: m.blend_method = 'BLEND'
    MATS[name] = m
    return m

def C(hexv):  # sRGB hex -> linear tuple
    r, g, b = ((hexv >> 16) & 255) / 255, ((hexv >> 8) & 255) / 255, (hexv & 255) / 255
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b))

# ---------------------------------------------------------------- mesh helpers
def _obj(me, name='m'):
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o

def _finish(o, mat, smooth=True, subdiv=0, bevel=0.0, bevel_seg=3, solid=0.0):
    if mat is not None:
        o.data.materials.clear(); o.data.materials.append(mat)
    if bevel:
        md = o.modifiers.new('bv', 'BEVEL'); md.width = bevel; md.segments = bevel_seg; md.limit_method = 'ANGLE'
    if solid:
        md = o.modifiers.new('so', 'SOLIDIFY'); md.thickness = solid; md.offset = 1
    if subdiv:
        md = o.modifiers.new('sd', 'SUBSURF'); md.levels = subdiv; md.render_levels = subdiv
    if o.modifiers:
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        o.modifiers.clear(); old = o.data; o.data = me; bpy.data.meshes.remove(old)
    for p in o.data.polygons: p.use_smooth = smooth
    if smooth:
        try: o.data.set_sharp_from_angle(angle=math.radians(50))
        except Exception: pass
    return o

def place(o, loc=(0, 0, 0), rot=(0, 0, 0), scale=None):
    o.location = loc; o.rotation_euler = rot
    if scale: o.scale = scale
    return o

def sphere(mat, r, loc=(0, 0, 0), scale=(1, 1, 1), seg=32, rings=16, rot=(0, 0, 0), keep=None, **kw):
    me = bpy.data.meshes.new('s'); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    for v in bm.verts: v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
    if keep:  # keep(co) -> bool; delete the rest (for caps, hairlines, aprons)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v.co)], context='VERTS')
    bm.to_mesh(me); bm.free()
    return place(_finish(_obj(me), mat, **kw), loc, rot)

def box(mat, size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, **kw):
    me = bpy.data.meshes.new('b'); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bm.to_mesh(me); bm.free()
    kw.setdefault('smooth', bevel > 0)
    return place(_finish(_obj(me), mat, bevel=bevel, **kw), loc, rot)

def cyl(mat, r, h, loc=(0, 0, 0), rot=(0, 0, 0), r2=None, seg=32, cap=True, **kw):
    me = bpy.data.meshes.new('c'); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bm.to_mesh(me); bm.free()
    return place(_finish(_obj(me), mat, **kw), loc, rot)

def torus(mat, R, r, loc=(0, 0, 0), rot=(0, 0, 0), maj=40, mn=12, arc=TAU, **kw):
    v, f = [], []
    closed = arc >= TAU - 1e-6
    nmaj = maj if closed else maj + 1
    for i in range(nmaj):
        a = arc * i / maj
        for j in range(mn):
            b = TAU * j / mn
            v.append(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
    for i in range(maj if closed else maj):
        i2 = (i + 1) % nmaj
        for j in range(mn):
            j2 = (j + 1) % mn
            f.append((i * mn + j, i2 * mn + j, i2 * mn + j2, i * mn + j2))
    me = bpy.data.meshes.new('t'); me.from_pydata(v, [], f)
    return place(_finish(_obj(me), mat, **kw), loc, rot)

def lathe(mat, prof, loc=(0, 0, 0), rot=(0, 0, 0), seg=40, rfun=None, sy=1.0, cap_top=True, cap_bot=True, **kw):
    """prof: [(radius, z)...] bottom->top revolved around Z. rfun(angle, z) multiplies the radius (pleats, dents)."""
    v, f = [], []
    for (r, z) in prof:
        for j in range(seg):
            a = TAU * j / seg
            rr = r * (rfun(a, z) if rfun else 1)
            v.append((rr * math.cos(a), rr * math.sin(a) * sy, z))
    n = len(prof)
    for i in range(n - 1):
        for j in range(seg):
            j2 = (j + 1) % seg
            f.append((i * seg + j, i * seg + j2, (i + 1) * seg + j2, (i + 1) * seg + j))
    if cap_bot and prof[0][0] > 1e-4: f.append(tuple(reversed(range(seg))))
    if cap_top and prof[-1][0] > 1e-4: f.append(tuple((n - 1) * seg + j for j in range(seg)))
    me = bpy.data.meshes.new('l'); me.from_pydata(v, [], f); me.validate()
    return place(_finish(_obj(me), mat, **kw), loc, rot)

def limb(mat, length, r0, r1, seg=18, down=True, **kw):
    """Tapered capsule hanging from the origin (joint) along -Z."""
    prof = []
    for i in range(6): a = (i / 5) * math.pi / 2; prof.append((r0 * math.sin(a), -r0 * (1 - math.cos(a)) + r0 * 0))
    prof = [(r0 * math.sin(i / 5 * math.pi / 2), r0 * math.cos(i / 5 * math.pi / 2)) for i in range(6)]  # top dome
    prof = [(r, z) for (r, z) in prof]
    body = [(r0 + (r1 - r0) * k, -length * k) for k in (0.25, 0.5, 0.75, 1.0)]
    bot = [(r1 * math.cos(i / 5 * math.pi / 2), -length - r1 * math.sin(i / 5 * math.pi / 2)) for i in range(1, 6)]
    full = list(reversed([(r, z) for (r, z) in prof])) + body + bot
    full = sorted(full, key=lambda p: p[1])
    full[0] = (0.0005, full[0][1]); full[-1] = (0.0005, full[-1][1])
    return lathe(mat, full, seg=seg, cap_top=False, cap_bot=False, **kw)

FONT = None
def text3d(mat, s, size, loc=(0, 0, 0), rot=(0, 0, 0), depth=0.02):
    """Extruded text standing upright facing -Y (the model's front), centred on loc."""
    global FONT
    if FONT is None: FONT = bpy.data.fonts.load(FONT_PATH) if FONT_PATH else bpy.data.fonts['Bfont Regular']
    cu = bpy.data.curves.new('txt', 'FONT'); cu.body = s; cu.font = FONT; cu.size = size
    cu.extrude = depth / 2; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.resolution_u = 3
    ob = bpy.data.objects.new('txt', cu); bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)
    me.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))
    o = _obj(me, 'txt'); o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = False
    return place(o, loc, rot)

def pivot(name, loc=(0, 0, 0), parent=None, rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e)
    e.empty_display_size = 0.05
    if parent: e.parent = parent
    e.location = loc; e.rotation_euler = rot
    return e

def attach(objs, parent, name=None):
    """Join meshes into one and parent it to `parent`, keeping world placement (meshes were built in world space)."""
    objs = [o for o in (objs if isinstance(objs, (list, tuple)) else [objs]) if o]
    for s in bpy.context.view_layer.objects.selected: s.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()
    pw = parent.matrix_world.copy()
    o.data.transform(pw.inverted())
    o.parent = parent; o.matrix_parent_inverse = Matrix.Identity(4); o.location = (0, 0, 0)
    if name: o.name = name
    return o

def world(p, local):
    bpy.context.view_layer.update()
    return p.matrix_world @ Vector(local)

def export(root, name):
    os.makedirs(OUT, exist_ok=True)
    for s in bpy.context.view_layer.objects.selected: s.select_set(False)
    def sel(o):
        o.select_set(True)
        for c in o.children: sel(c)
    sel(root)
    bpy.context.view_layer.objects.active = root
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_cameras=False, export_lights=False, export_materials='EXPORT', export_image_format='NONE',
                              export_texcoords=False, export_normals=True)
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons)
    print(f'{name}: {os.path.getsize(path) // 1024} KB, ~{tris} tris')

# ---------------------------------------------------------------- palette
def P():
    return dict(
        skin=M('skin', C(0xf6caa4), 0.55), cheek=M('cheek', C(0xf28c94), 0.6), black=M('black', C(0x1c1a1a), 0.4),
        white=M('white', C(0xf6f4ef), 0.5), hair=M('hair_grey', C(0xd8d6d2), 0.75), gold=M('gold', C(0xc9a23a), 0.3, 0.9),
        glass=M('lens', C(0xcfeaff), 0.05, 0.0, alpha=0.3), gum=M('gum', C(0xf07a8a), 0.4), tooth=M('tooth', C(0xffffff), 0.2),
        mouth=M('mouth_in', C(0x6b1d24), 0.6),
    )

# ================================================================= GRANNY
def granny():
    reset(); p = P()
    card = M('cardigan', C(0xa65ac2), 0.85); blouse = M('blouse', C(0xfbf5e8), 0.7); skirt = M('skirt', C(0x2b3566), 0.8)
    apron = M('apron', C(0xfff0c8), 0.8); dot = M('apron_dot', C(0xff8aa8), 0.7); stock = M('stocking', C(0xd8b08f), 0.6)
    shoe = M('shoe', C(0xf2f2f2), 0.5); sole = M('sole', C(0x8a8f99), 0.7); btn = M('button', C(0xffd34d), 0.3, 0.2)
    bag = M('ecobag', C(0x67b06a), 0.85); leek_g = M('leek_green', C(0x4f9e3a), 0.6); leek_w = M('leek_white', C(0xf2f5e6), 0.6)
    pin = M('kanzashi', C(0xd8262e), 0.3)

    root = pivot('granny')
    hips = pivot('granny_hips', (0, 0, 0.8), root)
    # skirt with pleats
    attach([lathe(skirt, [(0.36, -0.42), (0.34, -0.3), (0.29, -0.15), (0.22, 0.02), (0.19, 0.06)], loc=world(hips, (0, 0, 0)),
                  rfun=lambda a, z: 1 + 0.035 * math.sin(a * 14) * (0.06 - z) * 2, sy=0.85, seg=56)], hips, 'granny_skirt')
    for s, nm in ((1, 'l'), (-1, 'r')):
        thigh = pivot(f'granny_leg_{nm}', (0.1 * s, 0, -0.05), hips)
        attach([limb(stock, 0.34, 0.075, 0.062, loc=world(thigh, (0, 0, 0)))], thigh, f'granny_thigh_{nm}')
        knee = pivot(f'granny_knee_{nm}', (0, 0, -0.36), thigh)
        k0 = world(knee, (0, 0, 0))
        parts = [limb(stock, 0.33, 0.06, 0.045, loc=k0)]
        f0 = k0 + Vector((0, -0.04, -0.37))
        parts.append(box(shoe, (0.12, 0.25, 0.09), loc=f0 + Vector((0, -0.02, 0.0)), bevel=0.035, subdiv=1))
        parts.append(box(sole, (0.125, 0.255, 0.03), loc=f0 + Vector((0, -0.02, -0.045)), bevel=0.012))
        parts.append(box(M('velcro', C(0x3c64c8), 0.6), (0.125, 0.05, 0.02), loc=f0 + Vector((0, -0.07, 0.045)), rot=(0.3, 0, 0), bevel=0.008))
        attach(parts, knee, f'granny_shin_{nm}')

    torso = pivot('granny_torso', (0, 0, 0.04), hips)
    t0 = world(torso, (0, 0, 0))
    body = lathe(card, [(0.17, 0.0), (0.22, 0.08), (0.26, 0.2), (0.27, 0.32), (0.25, 0.42), (0.2, 0.5), (0.1, 0.55), (0.06, 0.56)],
                 loc=t0, sy=0.78, seg=40, subdiv=1)
    hump = sphere(card, 0.2, loc=t0 + Vector((0, 0.08, 0.4)), scale=(1.15, 0.9, 0.85), seg=24, rings=12)
    # blouse V and collar
    vee = sphere(blouse, 0.1, loc=t0 + Vector((0, -0.17, 0.44)), scale=(0.9, 0.35, 1.1), seg=20, rings=10)
    collar = torus(blouse, 0.085, 0.025, loc=t0 + Vector((0, -0.01, 0.55)), rot=(0.25, 0, 0), maj=28, mn=8)
    # apron: front shell of an ellipsoid, then a little pocket and polka dots
    ap = sphere(apron, 0.3, loc=t0 + Vector((0, 0, 0.12)), scale=(0.92, 0.82, 1.25), seg=40, rings=20,
                keep=lambda c: c.y < -0.05 and -0.3 < c.z < 0.2 and abs(c.x) < 0.2, solid=0.008)
    pocket = box(apron, (0.16, 0.012, 0.08), loc=t0 + Vector((0, -0.255, 0.0)), rot=(0.12, 0, 0), bevel=0.005)
    dots = [sphere(dot, 0.012, loc=t0 + Vector((x, -0.255 + 0.006 * abs(x) * 10, z)), scale=(1, 0.3, 1), seg=8, rings=4, smooth=True)
            for x in (-0.12, -0.04, 0.04, 0.12) for z in (0.07, 0.17) if not (abs(x) < 0.05 and z < 0.1)]
    buttons = [sphere(btn, 0.018, loc=t0 + Vector((0, -0.2 + 0.004 * i, 0.43 - i * 0.075)), scale=(1, 0.5, 1), seg=10, rings=6) for i in range(1)]
    attach([body, hump, vee, collar, ap, pocket, *dots, *buttons], torso, 'granny_body')

    # arms: cardigan sleeves with cuffs, hands; eco-bag with a leek on the left forearm
    for s, nm in ((1, 'l'), (-1, 'r')):
        sh = pivot(f'granny_arm_{nm}', (0.25 * s, 0, 0.44), torso)
        s0 = world(sh, (0, 0, 0))
        attach([limb(card, 0.25, 0.07, 0.06, loc=s0), sphere(card, 0.08, loc=s0, seg=16, rings=10)], sh, f'granny_upper_{nm}')
        el = pivot(f'granny_elbow_{nm}', (0, 0, -0.26), sh)
        e0 = world(el, (0, 0, 0))
        parts = [limb(card, 0.2, 0.058, 0.05, loc=e0), torus(card, 0.05, 0.018, loc=e0 + Vector((0, 0, -0.2)), maj=20, mn=8)]
        h0 = e0 + Vector((0, 0, -0.27))
        parts.append(sphere(p['skin'], 0.052, loc=h0, scale=(0.75, 1.0, 1.15), seg=16, rings=10))
        parts.append(limb(p['skin'], 0.03, 0.017, 0.015, loc=h0 + Vector((0.035 * s, -0.035, 0.02)), rot=(0.5, 0.5 * s, 0)))
        attach(parts, el, f'granny_fore_{nm}')
        if nm == 'l':
            bg = pivot('granny_bag', (0, 0, -0.17), el)
            b0 = world(bg, (0, 0, 0))
            bparts = [box(bag, (0.06, 0.3, 0.26), loc=b0 + Vector((0.09, 0.0, -0.2)), bevel=0.03, subdiv=1),
                      torus(bag, 0.07, 0.012, loc=b0 + Vector((0.08, 0.0, -0.06)), rot=(0, math.pi / 2, 0), maj=20, mn=6),
                      cyl(leek_w, 0.024, 0.22, loc=b0 + Vector((0.09, 0.06, -0.02)), seg=12),
                      cyl(leek_g, 0.026, 0.3, loc=b0 + Vector((0.09, 0.06, 0.24)), seg=12)]
            for k in range(3):
                bparts.append(box(leek_g, (0.03, 0.006, 0.2), loc=b0 + Vector((0.09 + (k - 1) * 0.025, 0.06, 0.46)), rot=(0, (k - 1) * 0.45, 0)))
            bparts.append(box(M('bag_print', C(0xfff6d0), 0.8), (0.062, 0.12, 0.1), loc=b0 + Vector((0.091, 0.0, -0.2)), bevel=0.01))
            attach(bparts, bg, 'granny_bag_mesh')

    # head
    head = pivot('granny_head', (0, -0.02, 0.56), torso)
    h0 = world(head, (0, 0, 0)); hc = h0 + Vector((0, -0.01, 0.15))
    face = [sphere(p['skin'], 0.15, loc=hc, scale=(1, 0.95, 1.05), seg=32, rings=16),
            sphere(p['skin'], 0.03, loc=hc + Vector((0, -0.145, -0.01)), scale=(1, 0.9, 0.9), seg=12, rings=8),  # nose
            sphere(p['cheek'], 0.035, loc=hc + Vector((0.085, -0.115, -0.035)), scale=(1, 0.45, 0.8), seg=12, rings=6),
            sphere(p['cheek'], 0.035, loc=hc + Vector((-0.085, -0.115, -0.035)), scale=(1, 0.45, 0.8), seg=12, rings=6),
            sphere(p['skin'], 0.035, loc=hc + Vector((0.148, 0, 0.0)), scale=(0.5, 0.8, 1.1), seg=12, rings=6),
            sphere(p['skin'], 0.035, loc=hc + Vector((-0.148, 0, 0.0)), scale=(0.5, 0.8, 1.1), seg=12, rings=6),
            cyl(p['skin'], 0.06, 0.09, loc=h0 + Vector((0, 0, 0.03)), seg=16)]
    # closed smiling eyes (arcs), eyebrows, smile
    for s in (1, -1):
        face.append(torus(p['black'], 0.026, 0.008, loc=hc + Vector((0.055 * s, -0.15, 0.02)), rot=(math.pi / 2 - 0.1, 0, 0), arc=math.pi, maj=12, mn=6))
        face.append(box(p['hair'], (0.05, 0.012, 0.014), loc=hc + Vector((0.058 * s, -0.138, 0.07)), rot=(0, 0.25 * s, 0), bevel=0.005))
        face.append(sphere(M('wrinkle', C(0xd9a07f), 0.6), 0.03, loc=hc + Vector((0.1 * s, -0.11, 0.02)), scale=(0.2, 0.2, 0.2), seg=6, rings=4))
    face.append(sphere(p['mouth'], 0.04, loc=hc + Vector((0, -0.135, -0.065)), scale=(1.2, 0.5, 0.55), seg=16, rings=8))
    # hair: perm curls round a grey cap, and a small bun with a red kanzashi on top
    face.append(sphere(p['hair'], 0.158, loc=hc + Vector((0, 0.005, 0.01)), scale=(1.02, 1.0, 1.04), seg=32, rings=16,
                       keep=lambda c: c.z > 0.02 - 0.15 * max(0, c.y + 0.02) * 0 and not (c.y < -0.06 and c.z < 0.08)))
    for i in range(26):
        a = TAU * i / 26; ring = i % 2
        rr = 0.15; z = 0.05 + 0.04 * ring
        y = math.sin(a) * rr
        if y < -0.08 and z < 0.09: continue
        face.append(sphere(p['hair'], 0.045, loc=hc + Vector((math.cos(a) * rr, y, z)), seg=12, rings=8))
    for i in range(10):
        a = TAU * i / 10
        face.append(sphere(p['hair'], 0.05, loc=hc + Vector((math.cos(a) * 0.08, math.sin(a) * 0.08 + 0.02, 0.135)), seg=12, rings=8))
    attach(face, head, 'granny_face')
    bun = pivot('granny_bun', (0, 0.03, 0.31), head)
    b0 = world(bun, (0, 0, 0))
    attach([sphere(p['hair'], 0.07, loc=b0, scale=(1, 1, 0.85), seg=20, rings=10),
            box(pin, (0.34, 0.016, 0.016), loc=b0 + Vector((0, 0, 0.02)), bevel=0.006),
            sphere(pin, 0.022, loc=b0 + Vector((0.17, 0, 0.02)), seg=10, rings=6), sphere(pin, 0.022, loc=b0 + Vector((-0.17, 0, 0.02)), seg=10, rings=6)],
           bun, 'granny_bun_mesh')
    # glasses (separate so they can fly off)
    gl = pivot('granny_glasses', (0, -0.16, 0.17), head)
    g0 = world(gl, (0, 0, 0))
    gp = []
    for s in (1, -1):
        gp.append(torus(p['gold'], 0.042, 0.006, loc=g0 + Vector((0.055 * s, 0, 0)), rot=(math.pi / 2, 0, 0), maj=24, mn=6))
        gp.append(cyl(p['glass'], 0.04, 0.004, loc=g0 + Vector((0.055 * s, 0.002, 0)), rot=(math.pi / 2, 0, 0), seg=20, smooth=False))
        gp.append(cyl(p['gold'], 0.004, 0.15, loc=g0 + Vector((0.095 * s, 0.075, 0.005)), rot=(math.pi / 2, 0, 0), seg=6))
    gp.append(torus(p['gold'], 0.014, 0.004, loc=g0 + Vector((0, 0, 0.008)), rot=(math.pi / 2, 0, 0), arc=math.pi, maj=8, mn=5))
    attach(gp, gl, 'granny_glasses_mesh')
    # dentures: pop out when she jumps
    th = pivot('granny_teeth', (0, -0.14, 0.085), head)
    t0 = world(th, (0, 0, 0))
    tp = [torus(p['gum'], 0.045, 0.008, loc=t0 + Vector((0, 0.03, 0.012)), rot=(0, 0, math.pi), arc=math.pi, maj=16, mn=8),
          torus(p['gum'], 0.045, 0.008, loc=t0 + Vector((0, 0.03, -0.012)), rot=(0, 0, math.pi), arc=math.pi, maj=16, mn=8)]
    for i in range(8):
        a = math.pi + (i + 0.5) / 8 * math.pi
        for zz in (0.0, -0.0):
            tp.append(box(p['tooth'], (0.016, 0.01, 0.02), loc=t0 + Vector((math.cos(a) * 0.045, 0.03 + math.sin(a) * 0.045, zz)), rot=(0, 0, a + math.pi / 2), bevel=0.004))
    attach(tp, th, 'granny_teeth_mesh')
    root.rotation_euler = (0, 0, 0)
    export(root, 'granny')

# ================================================================= KID (rider)
def kid():
    reset(); p = P()
    shirt = M('kid_shirt', C(0x4fb0ff), 0.8); shorts = M('kid_shorts', C(0x2a3a70), 0.8); hat = M('kid_hat', C(0xffd21f), 0.5)
    rando = M('randoseru', C(0xc8161e), 0.35); rando_d = M('randoseru_dark', C(0x8a0c12), 0.4); sock = M('kid_sock', C(0xffffff), 0.7)
    shoe = M('kid_shoe', C(0xff6a3d), 0.5); metal = M('buckle', C(0xd8d8d8), 0.25, 0.9)
    root = pivot('kid')
    body = pivot('kid_body', (0, 0, 0.0), root)
    b0 = world(body, (0, 0, 0))
    parts = [lathe(shirt, [(0.1, 0.02), (0.14, 0.08), (0.15, 0.2), (0.13, 0.3), (0.07, 0.36), (0.04, 0.37)], loc=b0, sy=0.8, seg=28, subdiv=1),
             lathe(shorts, [(0.14, -0.02), (0.15, 0.04), (0.14, 0.09)], loc=b0, sy=0.85, seg=28),
             # randoseru on the back
             box(rando, (0.28, 0.13, 0.32), loc=b0 + Vector((0, 0.17, 0.22)), bevel=0.04, subdiv=1),
             box(rando_d, (0.285, 0.05, 0.2), loc=b0 + Vector((0, 0.235, 0.27)), bevel=0.02),
             box(metal, (0.05, 0.012, 0.03), loc=b0 + Vector((0, 0.262, 0.16)), bevel=0.004)]
    for s in (1, -1):
        parts.append(torus(rando_d, 0.13, 0.014, loc=b0 + Vector((0.07 * s, 0.03, 0.24)), rot=(0, math.pi / 2, 0), arc=math.pi * 1.1, maj=16, mn=6))
    attach(parts, body, 'kid_torso')
    for s, nm in ((1, 'l'), (-1, 'r')):
        lg = pivot(f'kid_leg_{nm}', (0.08 * s, 0, 0.03), body)
        l0 = world(lg, (0, 0, 0))
        attach([limb(p['skin'], 0.28, 0.045, 0.038, loc=l0), limb(sock, 0.06, 0.04, 0.04, loc=l0 + Vector((0, 0, -0.22))),
                box(shoe, (0.09, 0.16, 0.07), loc=l0 + Vector((0, -0.03, -0.31)), bevel=0.03, subdiv=1)], lg, f'kid_leg_mesh_{nm}')
        ar = pivot(f'kid_arm_{nm}', (0.15 * s, 0, 0.3), body)
        a0 = world(ar, (0, 0, 0))
        attach([sphere(shirt, 0.05, loc=a0, seg=12, rings=8), limb(shirt, 0.08, 0.045, 0.04, loc=a0), limb(p['skin'], 0.2, 0.035, 0.03, loc=a0 + Vector((0, 0, -0.06))),
                sphere(p['skin'], 0.04, loc=a0 + Vector((0, 0, -0.29)), seg=12, rings=8)], ar, f'kid_arm_mesh_{nm}')
    head = pivot('kid_head', (0, 0, 0.38), body)
    h0 = world(head, (0, 0, 0)); hc = h0 + Vector((0, 0, 0.13))
    eye_w = M('eye_white', C(0xffffff), 0.3)
    hp = [sphere(p['skin'], 0.14, loc=hc, scale=(1, 0.97, 1), seg=28, rings=14),
          sphere(p['skin'], 0.03, loc=hc + Vector((0.138, 0, -0.01)), scale=(0.5, 0.8, 1.1), seg=10, rings=6),
          sphere(p['skin'], 0.03, loc=hc + Vector((-0.138, 0, -0.01)), scale=(0.5, 0.8, 1.1), seg=10, rings=6),
          sphere(M('kid_hair', C(0x2a1d16), 0.6), 0.143, loc=hc + Vector((0, 0.01, 0.01)), seg=28, rings=14, keep=lambda c: c.y > -0.05 or c.z > 0.07)]
    for s in (1, -1):  # big scared eyes
        hp.append(sphere(eye_w, 0.036, loc=hc + Vector((0.05 * s, -0.122, 0.015)), scale=(0.9, 0.5, 1.1), seg=14, rings=8))
        hp.append(sphere(p['black'], 0.018, loc=hc + Vector((0.05 * s, -0.138, 0.015)), scale=(1, 0.5, 1.1), seg=10, rings=6))
        hp.append(sphere(eye_w, 0.006, loc=hc + Vector((0.044 * s, -0.146, 0.026)), seg=6, rings=4))
        hp.append(sphere(p['cheek'], 0.028, loc=hc + Vector((0.085 * s, -0.11, -0.04)), scale=(1, 0.4, 0.7), seg=10, rings=6))
    # yellow school hat with brim and chin strap
    hp.append(sphere(hat, 0.15, loc=hc + Vector((0, 0.005, 0.03)), scale=(1.03, 1.03, 0.9), seg=28, rings=14, keep=lambda c: c.z > -0.01))
    hp.append(lathe(hat, [(0.15, 0.0), (0.22, -0.02), (0.225, -0.012), (0.15, 0.012)], loc=hc + Vector((0, 0, 0.03)), seg=36, cap_top=False, cap_bot=False))
    hp.append(torus(M('strap', C(0x222222), 0.7), 0.13, 0.005, loc=hc + Vector((0, 0.0, -0.04)), rot=(0, math.pi / 2, 0), arc=math.pi, maj=16, mn=4))
    attach(hp, head, 'kid_face')
    mo = pivot('kid_mouth', (0, -0.128, 0.07), head)
    attach([sphere(p['mouth'], 0.03, loc=world(mo, (0, 0, 0)), scale=(1, 0.5, 1), seg=14, rings=8)], mo, 'kid_mouth_mesh')
    export(root, 'kid')

# ================================================================= GRANDPA (rival on a rocket mobility scooter)
def jii():
    reset(); p = P()
    jacket = M('jii_vest', C(0x8a6a3a), 0.9); pants = M('jii_pants', C(0x5a5f66), 0.8); shirt = M('jii_shirt', C(0xe8e2d0), 0.8)
    capm = M('jii_cap', C(0x6b5a40), 0.9)
    root = pivot('jii')
    body = pivot('jii_body', (0, 0, 0.55), root)
    b0 = world(body, (0, 0, 0))
    parts = [lathe(jacket, [(0.16, 0.0), (0.2, 0.1), (0.21, 0.28), (0.17, 0.42), (0.07, 0.48)], loc=b0, sy=0.8, seg=32, subdiv=1),
             sphere(shirt, 0.07, loc=b0 + Vector((0, -0.14, 0.38)), scale=(0.9, 0.4, 1.0), seg=12, rings=8)]
    for s in (1, -1):  # seated legs
        parts.append(limb(pants, 0.3, 0.065, 0.06, loc=b0 + Vector((0.09 * s, 0, 0.02)), rot=(math.pi / 2, 0, 0)))
        parts.append(limb(pants, 0.32, 0.06, 0.05, loc=b0 + Vector((0.09 * s, -0.32, 0.02))))
        parts.append(box(M('jii_shoe', C(0x3a2a1a), 0.6), (0.1, 0.2, 0.08), loc=b0 + Vector((0.09 * s, -0.36, -0.33)), bevel=0.03, subdiv=1))
    attach(parts, body, 'jii_torso')
    for s, nm in ((1, 'l'), (-1, 'r')):
        ar = pivot(f'jii_arm_{nm}', (0.2 * s, 0, 0.4), body)
        a0 = world(ar, (0, 0, 0))
        attach([limb(shirt, 0.42, 0.05, 0.04, loc=a0), sphere(p['skin'], 0.045, loc=a0 + Vector((0, 0, -0.46)), seg=12, rings=8)], ar, f'jii_arm_mesh_{nm}')
    head = pivot('jii_head', (0, 0, 0.47), body)
    hc = world(head, (0, 0, 0.14))
    hp = [sphere(p['skin'], 0.14, loc=hc, seg=28, rings=14), sphere(p['skin'], 0.03, loc=hc + Vector((0, -0.14, -0.01)), seg=10, rings=6)]
    for s in (1, -1):
        hp.append(sphere(p['white'], 0.05, loc=hc + Vector((0.12 * s, 0.03, -0.01)), scale=(0.6, 1, 0.9), seg=12, rings=8))  # side hair
        hp.append(sphere(p['white'], 0.035, loc=hc + Vector((0.05 * s, -0.13, 0.065)), scale=(1.3, 0.5, 0.6), seg=10, rings=6))  # bushy brows
        hp.append(sphere(p['black'], 0.012, loc=hc + Vector((0.05 * s, -0.135, 0.03)), seg=8, rings=4))
    hp.append(sphere(p['white'], 0.09, loc=hc + Vector((0, -0.1, -0.09)), scale=(1, 0.6, 1.0), seg=16, rings=10))  # beard
    hp.append(sphere(p['white'], 0.05, loc=hc + Vector((0, -0.145, -0.035)), scale=(1.4, 0.5, 0.45), seg=12, rings=6))  # moustache
    hp.append(sphere(capm, 0.15, loc=hc + Vector((0, 0.01, 0.04)), scale=(1.02, 1.05, 0.7), seg=24, rings=12, keep=lambda c: c.z > -0.005))
    hp.append(sphere(capm, 0.1, loc=hc + Vector((0, -0.12, 0.05)), scale=(0.9, 0.7, 0.18), seg=16, rings=8))
    attach(hp, head, 'jii_face')
    export(root, 'jii')

def scooter():
    reset()
    red = M('scooter_red', C(0xd8262e), 0.35, 0.1); grey = M('scooter_grey', C(0x3a3d42), 0.6); tire = M('tire', C(0x1a1a1a), 0.8)
    chrome = M('chrome', C(0xdddddd), 0.15, 1.0); seat = M('scooter_seat', C(0x2a2a2a), 0.5)
    flame_m = M('rocket_flame', C(0xffb020), 0.5, emit=C(0xff8a10), strength=6)
    root = pivot('scooter')
    parts = [box(red, (0.62, 1.2, 0.22), loc=(0, 0, 0.32), bevel=0.08, subdiv=1),
             box(red, (0.5, 0.35, 0.3), loc=(0, -0.48, 0.5), rot=(0.4, 0, 0), bevel=0.08, subdiv=1),
             box(seat, (0.46, 0.4, 0.12), loc=(0, 0.2, 0.62), bevel=0.05, subdiv=1),
             box(seat, (0.44, 0.08, 0.32), loc=(0, 0.4, 0.8), bevel=0.04, subdiv=1),
             cyl(grey, 0.04, 0.4, loc=(0, 0.2, 0.47), seg=12),
             cyl(chrome, 0.025, 0.5, loc=(0, -0.55, 0.85), rot=(0.3, 0, 0), seg=12),
             cyl(chrome, 0.02, 0.5, loc=(0, -0.62, 1.08), rot=(0, math.pi / 2, 0), seg=12),
             box(M('basket', C(0xf2f2f2), 0.6), (0.4, 0.26, 0.2), loc=(0, -0.78, 0.82), bevel=0.02),
             sphere(M('headlight', C(0xfff4c0), 0.2, emit=C(0xfff4c0), strength=2), 0.06, loc=(0, -0.68, 0.62), scale=(1, 0.5, 1)),
             cyl(chrome, 0.12, 0.6, loc=(0, 0.75, 0.55), rot=(math.pi / 2, 0, 0), seg=20),  # rocket
             lathe(red, [(0.0005, 0.0), (0.06, 0.03), (0.11, 0.1), (0.12, 0.16)], loc=(0, 0.45, 0.55), rot=(-math.pi / 2, 0, 0), seg=20),
             cyl(grey, 0.13, 0.12, loc=(0, 1.08, 0.55), rot=(math.pi / 2, 0, 0), r2=0.09, seg=20)]
    for s in (1, -1):
        parts.append(box(red, (0.03, 0.25, 0.25), loc=(0.14 * s, 0.85, 0.55), rot=(0.4, 0, 0), bevel=0.01))
    for (x, y) in ((0.3, -0.42), (-0.3, -0.42), (0.3, 0.42), (-0.3, 0.42)):
        parts.append(torus(tire, 0.11, 0.05, loc=(x, y, 0.16), rot=(0, math.pi / 2, 0), maj=24, mn=10))
        parts.append(cyl(chrome, 0.07, 0.06, loc=(x, y, 0.16), rot=(0, math.pi / 2, 0), seg=16))
    attach(parts, root, 'scooter_body')
    fl = pivot('scooter_flame', (0, 1.14, 0.55), root)
    attach([lathe(flame_m, [(0.0005, -0.6), (0.06, -0.4), (0.1, -0.15), (0.09, 0.0)], loc=world(fl, (0, 0, 0)), rot=(-math.pi / 2, 0, 0), seg=16)], fl, 'scooter_flame_mesh')
    root.rotation_euler = (0, 0, 0)
    export(root, 'scooter')

# ================================================================= SMASHABLES
def tanuki():
    reset()
    glaze = M('tanuki_glaze', C(0x7a4a28), 0.25); belly = M('tanuki_belly', C(0xe8d2a8), 0.3); dark = M('tanuki_dark', C(0x3a2416), 0.3)
    straw = M('tanuki_hat', C(0xc8a060), 0.7); white = M('white', C(0xf6f4ef), 0.4); black = M('black', C(0x1c1a1a), 0.3)
    root = pivot('tanuki')
    parts = [sphere(glaze, 0.38, loc=(0, 0, 0.42), scale=(1, 0.9, 1.05), seg=32, rings=16),
             sphere(belly, 0.3, loc=(0, -0.13, 0.4), scale=(1, 0.75, 0.95), seg=32, rings=16),
             sphere(glaze, 0.27, loc=(0, -0.02, 0.93), scale=(1.1, 1, 0.95), seg=32, rings=16),
             sphere(belly, 0.13, loc=(0, -0.2, 0.86), scale=(1.1, 0.8, 0.7), seg=20, rings=10),
             sphere(black, 0.045, loc=(0, -0.3, 0.88), seg=12, rings=8)]
    for s in (1, -1):
        parts += [sphere(white, 0.06, loc=(0.1 * s, -0.22, 0.98), scale=(1, 0.5, 1.1), seg=16, rings=8),
                  sphere(black, 0.03, loc=(0.1 * s, -0.25, 0.98), scale=(1, 0.5, 1), seg=10, rings=6),
                  sphere(dark, 0.09, loc=(0.1 * s, -0.19, 0.96), scale=(1.2, 0.5, 0.9), seg=12, rings=6),
                  sphere(glaze, 0.08, loc=(0.2 * s, 0.0, 1.17), scale=(1, 0.6, 1), seg=12, rings=8),
                  sphere(glaze, 0.12, loc=(0.25 * s, -0.12, 0.08), scale=(1, 1.4, 0.6), seg=16, rings=8),
                  limb(glaze, 0.22, 0.08, 0.07, loc=(0.33 * s, -0.05, 0.62), rot=(0.4, 0.5 * s, 0))]
    parts.append(lathe(straw, [(0.4, 0.0), (0.38, 0.03), (0.2, 0.1), (0.1, 0.18), (0.0005, 0.2)], loc=(0, 0.02, 1.08), seg=36, cap_bot=True))
    parts.append(lathe(M('sake', C(0xf4ecd8), 0.3), [(0.0005, 0.0), (0.09, 0.02), (0.1, 0.12), (0.05, 0.2), (0.03, 0.27), (0.035, 0.3)], loc=(0.45, -0.1, 0.25), seg=20))
    parts.append(text3d(M('ink', C(0x111111), 0.5), '酒', 0.08, loc=(0.45, -0.2, 0.36)))
    attach(parts, root, 'tanuki_body')
    export(root, 'tanuki')

def daruma():
    reset()
    red = M('daruma_red', C(0xd51f26), 0.25); white = M('white', C(0xf6f4ef), 0.4); black = M('black', C(0x1c1a1a), 0.3); gold = M('gold', C(0xd6a83a), 0.3, 0.8)
    root = pivot('daruma')
    parts = [sphere(red, 0.4, loc=(0, 0, 0.42), scale=(1, 0.95, 1.08), seg=36, rings=18),
             sphere(white, 0.22, loc=(0, -0.29, 0.55), scale=(1.05, 0.5, 0.95), seg=28, rings=14)]
    for s in (1, -1):
        parts += [sphere(white, 0.06, loc=(0.08 * s, -0.385, 0.6), scale=(1, 0.35, 1), seg=14, rings=8),
                  sphere(gold, 0.08, loc=(0.2 * s, -0.31, 0.2), scale=(1, 0.4, 0.5), seg=12, rings=6)]
    parts.append(sphere(black, 0.03, loc=(0.08, -0.405, 0.6), scale=(1, 0.4, 1), seg=10, rings=6))  # one eye painted
    for s in (1, -1): parts.append(box(black, (0.12, 0.02, 0.03), loc=(0.09 * s, -0.37, 0.71), rot=(0, -0.35 * s, 0), bevel=0.01))
    parts.append(text3d(gold, '必勝', 0.11, loc=(0, -0.37, 0.25), depth=0.03))
    attach(parts, root, 'daruma_body')
    export(root, 'daruma')

def boxes():
    reset()
    card = M('cardboard', C(0xc49a62), 0.85); tape = M('tape', C(0xd9c08a), 0.4); ink = M('box_ink', C(0xe0601a), 0.6)
    root = pivot('boxes')
    parts = []
    for i, (x, y, z, rz, sz) in enumerate([(0, 0, 0.25, 0.05, (0.7, 0.5, 0.5)), (0.05, 0.02, 0.75, -0.08, (0.66, 0.48, 0.5)), (-0.02, 0, 1.22, 0.15, (0.56, 0.42, 0.44))]):
        parts.append(box(card, sz, loc=(x, y, z), rot=(0, 0, rz), bevel=0.015))
        parts.append(box(tape, (0.12, sz[1] + 0.006, 0.02), loc=(x, y, z + sz[2] / 2), rot=(0, 0, rz)))
        t = text3d(ink, ['みかん', 'りんご', 'みかん'][i], 0.13, loc=(x, y - sz[1] / 2 - 0.004, z), depth=0.006)
        t.rotation_euler = (0, 0, rz); parts.append(t)
    attach(parts, root, 'boxes_body')
    export(root, 'boxes')

def cone():
    reset()
    o = M('cone_orange', C(0xff6418), 0.5); w = M('cone_white', C(0xf6f6f6), 0.4); blk = M('cone_base', C(0x222222), 0.7)
    root = pivot('cone')
    parts = [box(blk, (0.52, 0.52, 0.06), loc=(0, 0, 0.03), bevel=0.02),
             lathe(o, [(0.2, 0.06), (0.03, 0.75), (0.0005, 0.76)], seg=28),
             lathe(w, [(0.135, 0.33), (0.1, 0.5)], seg=28, cap_top=False, cap_bot=False, solid=0.004)]
    attach(parts, root, 'cone_body')
    export(root, 'cone')

def bucket():
    reset()
    blue = M('bucket_blue', C(0x2f6fd8), 0.45); lid = M('bucket_lid', C(0x24549f), 0.45)
    root = pivot('bucket')
    parts = [lathe(blue, [(0.21, 0.0), (0.25, 0.65), (0.26, 0.66)], seg=36, rfun=lambda a, z: 1 + 0.015 * math.sin(a * 18) * (z > 0.05)),
             lathe(lid, [(0.27, 0.66), (0.27, 0.7), (0.2, 0.74), (0.0005, 0.76)], seg=36),
             box(lid, (0.16, 0.05, 0.05), loc=(0, 0, 0.78), bevel=0.02)]
    attach(parts, root, 'bucket_body')
    export(root, 'bucket')

def watermelons():
    reset()
    wood = M('crate_wood', C(0xb07a44), 0.8)
    root = pivot('watermelons')
    parts = []
    for z in (0.08, 0.38):
        for s in (1, -1): parts.append(box(wood, (1.1, 0.04, 0.12), loc=(0, 0.3 * s, z), bevel=0.008))
        for s in (1, -1): parts.append(box(wood, (0.04, 0.64, 0.12), loc=(0.55 * s, 0, z), bevel=0.008))
    for x in (-0.53, 0.53):
        for y in (-0.28, 0.28): parts.append(box(wood, (0.05, 0.05, 0.46), loc=(x, y, 0.23), bevel=0.008))
    parts.append(box(wood, (1.08, 0.6, 0.03), loc=(0, 0, 0.05)))
    # striped melons: alternate faces dark/light
    light = M('melon_light', C(0x4fae3c), 0.35); dark = M('melon_dark', C(0x1d5a1e), 0.35)
    for i, (x, y, z) in enumerate([(-0.3, -0.12, 0.27), (0.02, 0.13, 0.27), (0.32, -0.1, 0.27), (-0.14, 0.02, 0.53), (0.18, 0.02, 0.53)]):
        me = bpy.data.meshes.new('melon'); bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=0.19)
        for v in bm.verts: v.co.z *= 0.92
        bm.to_mesh(me); bm.free()
        o = _obj(me); o.data.materials.append(light); o.data.materials.append(dark)
        for pl in o.data.polygons:
            a = math.atan2(pl.center.y, pl.center.x); pl.material_index = 1 if int((a + math.pi) / TAU * 24 + 0.5 * math.sin(pl.center.z * 30)) % 3 == 0 else 0
            pl.use_smooth = True
        place(o, (x, y, z), (0.3 * i, 0.2, 0.5 * i)); parts.append(o)
    hal = M('melon_red', C(0xff3a4a), 0.4)
    sign = box(M('sign_white', C(0xfafafa), 0.6), (0.5, 0.02, 0.22), loc=(0.35, -0.33, 0.62), rot=(0.15, 0, -0.1), bevel=0.01)
    t = text3d(hal, 'スイカ', 0.12, loc=(0.35, -0.345, 0.62), rot=(0.15, 0, -0.1), depth=0.006)
    stick = cyl(wood, 0.01, 0.35, loc=(0.35, -0.32, 0.42), seg=6)
    attach(parts + [sign, t, stick], root, 'watermelons_body')
    export(root, 'watermelons')

def pigeon():
    reset()
    grey = M('pigeon_grey', C(0x8e96aa), 0.6); neck = M('pigeon_neck', C(0x5c8f80), 0.3, 0.3); beak = M('pigeon_beak', C(0xe8a040), 0.5)
    dark = M('pigeon_dark', C(0x5a6070), 0.6); black = M('black', C(0x1c1a1a), 0.3); eye = M('pigeon_eye', C(0xff7a20), 0.3)
    root = pivot('pigeon')
    parts = [sphere(grey, 0.13, loc=(0, 0.02, 0.17), scale=(0.85, 1.35, 0.85), seg=20, rings=12),
             sphere(neck, 0.075, loc=(0, -0.11, 0.27), scale=(1, 1, 1.2), seg=16, rings=10),
             sphere(grey, 0.06, loc=(0, -0.14, 0.34), seg=16, rings=10),
             lathe(beak, [(0.016, 0.0), (0.0005, 0.05)], loc=(0, -0.19, 0.335), rot=(math.pi / 2 + 0.2, 0, 0), seg=10),
             box(dark, (0.12, 0.14, 0.02), loc=(0, 0.2, 0.15), rot=(-0.3, 0, 0), bevel=0.01)]
    for s in (1, -1):
        parts += [sphere(eye, 0.012, loc=(0.045 * s, -0.17, 0.35), seg=8, rings=4), sphere(black, 0.006, loc=(0.05 * s, -0.175, 0.352), seg=6, rings=4),
                  cyl(M('pigeon_leg', C(0xd86a6a), 0.5), 0.01, 0.08, loc=(0.04 * s, 0.0, 0.05), seg=6)]
    attach(parts, root, 'pigeon_body')
    for s, nm in ((1, 'l'), (-1, 'r')):
        w = pivot(f'pigeon_wing_{nm}', (0.09 * s, 0.0, 0.22), root)
        w0 = world(w, (0, 0, 0))
        wing = sphere(grey, 0.12, loc=w0 + Vector((0.09 * s, 0.03, 0)), scale=(1.0, 1.0, 0.18), seg=16, rings=8)
        bar = box(dark, (0.12, 0.03, 0.02), loc=w0 + Vector((0.1 * s, 0.06, 0.02)), bevel=0.008)
        attach([wing, bar], w, f'pigeon_wing_mesh_{nm}')
    export(root, 'pigeon')

def salaryman():
    reset(); p = P()
    suit = M('suit', C(0x2c3340), 0.7); shirt = M('shirt_white', C(0xf8f8f8), 0.6); tie = M('tie_red', C(0xc81e2a), 0.4)
    hair = M('hair_black', C(0x151515), 0.5); shoe = M('shoe_black', C(0x111111), 0.3); bag = M('briefcase', C(0x4a3020), 0.5)
    root = pivot('salaryman')
    body = pivot('salaryman_body', (0, 0, 0.88), root)
    b0 = world(body, (0, 0, 0))
    parts = [lathe(suit, [(0.15, 0.0), (0.18, 0.1), (0.2, 0.42), (0.17, 0.55), (0.06, 0.6)], loc=b0, sy=0.7, seg=32, subdiv=1),
             box(shirt, (0.13, 0.02, 0.26), loc=b0 + Vector((0, -0.135, 0.42)), bevel=0.01),
             box(tie, (0.045, 0.02, 0.3), loc=b0 + Vector((0, -0.145, 0.36)), bevel=0.008)]
    attach(parts, body, 'salaryman_torso')
    for s, nm in ((1, 'l'), (-1, 'r')):
        lg = pivot(f'salaryman_leg_{nm}', (0.09 * s, 0, 0.02), body)
        l0 = world(lg, (0, 0, 0))
        attach([limb(suit, 0.82, 0.07, 0.055, loc=l0), box(shoe, (0.1, 0.24, 0.07), loc=l0 + Vector((0, -0.05, -0.86)), bevel=0.03, subdiv=1)], lg, f'salaryman_leg_mesh_{nm}')
        ar = pivot(f'salaryman_arm_{nm}', (0.21 * s, 0, 0.52), body)
        a0 = world(ar, (0, 0, 0))
        ap = [sphere(suit, 0.065, loc=a0, seg=12, rings=8), limb(suit, 0.55, 0.055, 0.045, loc=a0), sphere(p['skin'], 0.045, loc=a0 + Vector((0, 0, -0.6)), seg=12, rings=8)]
        if nm == 'l':
            ap.append(box(bag, (0.08, 0.38, 0.28), loc=a0 + Vector((0, 0, -0.78)), bevel=0.02))
        else:
            ap.append(box(M('phone', C(0x101010), 0.2), (0.02, 0.07, 0.13), loc=a0 + Vector((0.0, -0.02, -0.62)), bevel=0.008))
        attach(ap, ar, f'salaryman_arm_mesh_{nm}')
    head = pivot('salaryman_head', (0, 0, 0.6), body)
    hc = world(head, (0, 0, 0.14))
    hp = [sphere(p['skin'], 0.13, loc=hc, scale=(0.95, 1, 1.08), seg=28, rings=14),
          sphere(hair, 0.135, loc=hc + Vector((0, 0.01, 0.02)), scale=(0.97, 1.02, 1.08), seg=28, rings=14, keep=lambda c: c.z > 0.03 or c.y > 0.04),
          box(M('glasses_black', C(0x111111), 0.3), (0.2, 0.01, 0.05), loc=hc + Vector((0, -0.125, 0.02)), bevel=0.01),
          cyl(p['skin'], 0.05, 0.08, loc=hc + Vector((0, 0, -0.14)), seg=12)]
    for s in (1, -1): hp.append(sphere(p['black'], 0.012, loc=hc + Vector((0.045 * s, -0.12, 0.02)), seg=8, rings=4))
    hp.append(box(p['mouth'], (0.05, 0.01, 0.012), loc=hc + Vector((0, -0.125, -0.06))))
    attach(hp, head, 'salaryman_face')
    export(root, 'salaryman')

# ================================================================= HARD OBSTACLES / GAG SETS
def kouji():
    """Overhead construction gate: slide under it."""
    reset()
    white = M('pole_white', C(0xf2f2f2), 0.5); red = M('stripe_red', C(0xe0202a), 0.5); yel = M('sign_yellow', C(0xffd21f), 0.5)
    blk = M('weight_black', C(0x2a2a2a), 0.8); ink = M('ink', C(0x111111), 0.5)
    lamp = M('kouji_lamp', C(0xff4a10), 0.3, emit=C(0xff4a10), strength=5)
    root = pivot('kouji')
    W = 2.5; parts = []
    for s in (1, -1):
        parts += [cyl(white, 0.05, 2.4, loc=(W / 2 * s, 0, 1.2), seg=12), box(blk, (0.45, 0.45, 0.12), loc=(W / 2 * s, 0, 0.06), bevel=0.02)]
    # striped beam
    n = 10
    for i in range(n):
        x = -W / 2 + (i + 0.5) * W / n
        parts.append(box(red if i % 2 else white, (W / n, 0.1, 0.32), loc=(x, 0, 1.6), bevel=0.0))
    parts.append(box(yel, (1.5, 0.05, 0.62), loc=(0, -0.01, 2.15), bevel=0.02))
    parts.append(text3d(ink, '工事中', 0.36, loc=(0, -0.045, 2.15), depth=0.02))
    attach(parts, root, 'kouji_body')
    for s, nm in ((1, 'l'), (-1, 'r')):
        lp = pivot(f'kouji_lamp_{nm}', (W / 2 * s, 0, 2.45), root)
        attach([sphere(lamp, 0.08, loc=world(lp, (0, 0, 0)), seg=14, rings=8)], lp, f'kouji_lamp_mesh_{nm}')
    export(root, 'kouji')

def police():
    reset()
    white = M('pc_white', C(0xf4f4f4), 0.25, 0.1); black = M('pc_black', C(0x16181c), 0.25, 0.1); glass = M('pc_glass', C(0x203040), 0.05, 0.3)
    tire = M('tire', C(0x1a1a1a), 0.8); chrome = M('chrome', C(0xdddddd), 0.15, 1.0)
    root = pivot('police')
    parts = [box(black, (1.7, 4.3, 0.55), loc=(0, 0, 0.6), bevel=0.12, subdiv=1),
             box(white, (1.72, 2.3, 0.4), loc=(0, 0.0, 0.62), bevel=0.08, subdiv=1),
             box(white, (1.5, 2.1, 0.55), loc=(0, 0.3, 1.1), bevel=0.15, subdiv=1),
             box(glass, (1.52, 1.4, 0.4), loc=(0, 0.3, 1.13), bevel=0.1),
             box(glass, (1.3, 0.3, 0.4), loc=(0, -0.72, 1.1), rot=(-0.6, 0, 0), bevel=0.05),
             box(black, (1.4, 0.35, 0.12), loc=(0, 0.3, 1.43), bevel=0.04),
             box(M('pc_grille', C(0x101010), 0.5), (1.2, 0.05, 0.18), loc=(0, -2.15, 0.6), bevel=0.02),
             text3d(M('pc_text', C(0x1a2a6a), 0.4), '警察', 0.28, loc=(0.865, 0.0, 0.66), rot=(0, 0, -math.pi / 2)),
             text3d(M('pc_text', C(0x1a2a6a), 0.4), '警察', 0.28, loc=(-0.865, 0.0, 0.66), rot=(0, 0, math.pi / 2))]
    for s in (1, -1):
        parts.append(sphere(M('pc_head', C(0xfff8d0), 0.2, emit=C(0xfff8d0), strength=3), 0.12, loc=(0.6 * s, -2.12, 0.68), scale=(1, 0.4, 0.7), seg=14, rings=8))
        parts.append(box(M('pc_tail', C(0xff2020), 0.3, emit=C(0xff2020), strength=2), (0.35, 0.05, 0.12), loc=(0.6 * s, 2.15, 0.7), bevel=0.02))
        for y in (-1.35, 1.35):
            parts.append(torus(tire, 0.26, 0.11, loc=(0.8 * s, y, 0.36), rot=(0, math.pi / 2, 0), maj=28, mn=10))
            parts.append(cyl(chrome, 0.17, 0.1, loc=(0.82 * s, y, 0.36), rot=(0, math.pi / 2, 0), seg=18))
    attach(parts, root, 'police_body')
    for s, nm, col in ((1, 'l', 0xff1a1a), (-1, 'r', 0xff1a1a)):
        lp = pivot(f'police_light_{nm}', (0.35 * s, 0.3, 1.55), root)
        attach([box(M('pc_light', C(col), 0.2, emit=C(col), strength=8), (0.55, 0.28, 0.14), loc=world(lp, (0, 0, 0)), bevel=0.05, subdiv=1)], lp, f'police_light_mesh_{nm}')
    # the officer leaning out
    p = P()
    cop = pivot('police_cop', (0.55, -0.1, 1.2), root)
    c0 = world(cop, (0, 0, 0))
    attach([sphere(p['skin'], 0.13, loc=c0, seg=20, rings=10), sphere(M('cop_cap', C(0x1d2c5a), 0.5), 0.135, loc=c0 + Vector((0, 0, 0.05)), scale=(1, 1, 0.7), keep=lambda c: c.z > 0),
            box(M('cop_cap', C(0x1d2c5a), 0.5), (0.2, 0.12, 0.02), loc=c0 + Vector((0, -0.14, 0.04)), bevel=0.01),
            cyl(M('megaphone', C(0xf2f2f2), 0.4), 0.04, 0.3, loc=c0 + Vector((0.12, -0.2, -0.05)), rot=(math.pi / 2, 0, 0), r2=0.12, seg=16)], cop, 'police_cop_mesh')
    export(root, 'police')

def sale_gate():
    reset()
    red = M('sale_red', C(0xe0202a), 0.5); yel = M('sale_yellow', C(0xffe23a), 0.4, emit=C(0xffd000), strength=0.6); white = M('white', C(0xf6f4ef), 0.4)
    pink = M('sale_pink', C(0xff6aa8), 0.6); blue = M('sale_blue', C(0x3a8aff), 0.6)
    root = pivot('sale')
    parts = []
    for s in (1, -1):
        parts += [cyl(red, 0.07, 3.2, loc=(1.25 * s, 0, 1.6), seg=14), sphere(yel, 0.12, loc=(1.25 * s, 0, 3.25), seg=14, rings=8)]
    parts += [box(red, (2.9, 0.1, 1.3), loc=(0, 0, 3.3), bevel=0.05),
              text3d(yel, '特売', 0.62, loc=(0, -0.07, 3.48), depth=0.05),
              text3d(white, 'たまご98円', 0.3, loc=(0, -0.07, 2.92), depth=0.03),
              text3d(yel, '特売', 0.62, loc=(0, 0.07, 3.48), rot=(0, 0, math.pi), depth=0.05)]
    for i in range(9):  # bunting
        x = -1.2 + i * 0.3
        parts.append(lathe([pink, yel, blue][i % 3], [(0.11, 0.0), (0.0005, -0.22)], loc=(x, 0, 2.55), seg=3, sy=0.2))
    attach(parts, root, 'sale_body')
    export(root, 'sale')

def ramp():
    reset()
    yel = M('ramp_yellow', C(0xffc81a), 0.5); blk = M('ramp_black', C(0x222222), 0.6); wood = M('ramp_wood', C(0xa8743e), 0.8)
    root = pivot('ramp')
    L, H, W = 5.0, 1.4, 2.2
    v = [(-W / 2, 0, 0), (W / 2, 0, 0), (W / 2, -L, H), (-W / 2, -L, H), (-W / 2, -L, 0), (W / 2, -L, 0)]
    f = [(0, 1, 2, 3), (3, 2, 5, 4), (0, 3, 4), (1, 5, 2), (0, 4, 5, 1)]
    me = bpy.data.meshes.new('ramp'); me.from_pydata(v, [], f)
    o = _finish(_obj(me), yel, smooth=False)
    parts = [o]
    for i in range(6):  # chevrons painted on the slope
        k = (i + 0.7) / 7
        y, z = -L * k, H * k
        for s in (1, -1):
            parts.append(box(blk, (0.6, 0.12, 0.02), loc=(0.25 * s, y + 0.15, z + 0.03), rot=(math.atan2(H, L), 0, 0.6 * s)))
    for s in (1, -1):
        parts.append(box(wood, (0.08, 0.08, H), loc=(W / 2 * s * 0.9, -L + 0.1, H / 2)))
    parts.append(text3d(blk, 'ジャンプ台', 0.28, loc=(0, -L - 0.01, 0.75), depth=0.02))
    attach(parts, root, 'ramp_body')
    # glTF front is +Z = Blender -Y; the slope rises towards -Y here, i.e. towards the model's front. In the game the
    # runner moves towards -Z(world) so the ramp is rotated 180°, rising in the running direction.
    export(root, 'ramp')

def eggs():
    reset()
    root = pivot('eggs')
    parts = [box(M('egg_pack', C(0xd8ecff), 0.1, alpha=0.6), (0.3, 0.14, 0.07), loc=(0, 0, 0.035), bevel=0.015)]
    for i in range(5):
        for j in range(2):
            parts.append(sphere(M('egg', C(0xfff2dc), 0.4), 0.025, loc=(-0.12 + i * 0.06, -0.035 + j * 0.07, 0.05), scale=(1, 1, 1.3), seg=12, rings=8))
    parts.append(box(M('egg_label', C(0xff3a4a), 0.5), (0.1, 0.002, 0.04), loc=(0, -0.071, 0.04)))
    attach(parts, root, 'eggs_body')
    export(root, 'eggs')

ALL = {'granny': granny, 'kid': kid, 'jii': jii, 'scooter': scooter, 'tanuki': tanuki, 'daruma': daruma, 'boxes': boxes, 'cone': cone,
       'bucket': bucket, 'watermelons': watermelons, 'pigeon': pigeon, 'salaryman': salaryman, 'kouji': kouji, 'police': police,
       'sale': sale_gate, 'ramp': ramp, 'eggs': eggs}

# ---------------------------------------------------------------- previews (Cycles)
def render_preview(name):
    reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, name + '.glb'))
    objs = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ctr = (lo + hi) / 2; size = max((hi - lo).length, 0.3)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 32; sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = 360
    sc.render.image_settings.file_format = 'JPEG'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.95, 0.8, 0.6, 1); bg.inputs['Strength'].default_value = 0.8
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, lo.z)); fl = bpy.context.object
    fl.data.materials.append(M('floor', (0.8, 0.75, 0.7), 0.9))
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.5; so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = (0.7, 0.2, -0.6)
    cam = bpy.data.cameras.new('cam'); cam.lens = 50; co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    d = size * 1.7
    co.location = ctr + Vector((d * 0.55, -d * 0.8, d * 0.35))
    co.rotation_euler = (ctr - co.location).to_track_quat('-Z', 'Y').to_euler()
    os.makedirs(PREVIEW, exist_ok=True)
    sc.render.filepath = os.path.join(PREVIEW, name + '.jpg')
    bpy.ops.render.render(write_still=True)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--' in sys.argv: args = [a for a in sys.argv[sys.argv.index('--') + 1:] if not a.startswith('--')]
    names = args or list(ALL)
    for n in names: ALL[n]()
    if '--render' in sys.argv:
        for n in names: render_preview(n)
