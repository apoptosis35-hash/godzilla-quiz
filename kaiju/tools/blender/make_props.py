# Giant everyday props for the stages, modelled with Blender's Python API.
#   pip install bpy   (Blender 5.2 as a module; or: blender -b -P make_props.py)
#   python3 tools/blender/make_props.py [--render]
# Writes models/<name>.glb, tools/blender/props.blend and (with --render) tools/blender/preview/<name>.png.
import math, os, random, sys
import bpy, bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'models')
PREVIEW = os.path.join(HERE, 'preview')
random.seed(7)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections): bpy.data.collections.remove(c)


MATS = {}
def mat(name, color, rough=0.5, metal=0.0, emit=None, strength=1.0):
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
    MATS[name] = m
    return m


def finish(o, m, smooth=True, subdiv=0, angle=40):
    bpy.context.view_layer.objects.active = o
    for s in bpy.context.view_layer.objects.selected: s.select_set(False)
    o.select_set(True)
    if subdiv:
        mod = o.modifiers.new('sub', 'SUBSURF'); mod.levels = subdiv; mod.render_levels = subdiv
        bpy.ops.object.modifier_apply(modifier='sub')
    if smooth: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    else: bpy.ops.object.shade_flat()
    o.data.materials.clear(); o.data.materials.append(m)
    return o


def link(o, col):
    for c in o.users_collection: c.objects.unlink(o)
    col.objects.link(o)
    return o


def sphere(col, name, loc, scale, m, seg=24, rings=12, **kw):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc)
    o = bpy.context.object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return link(finish(o, m, **kw), col)


def cyl(col, name, loc, r, depth, m, verts=32, rot=(0, 0, 0), r2=None, **kw):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name
    return link(finish(o, m, **kw), col)


def torus(col, name, loc, R, r, m, rot=(0, 0, 0), maj=48, mn=16, **kw):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=maj, minor_segments=mn, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name
    return link(finish(o, m, **kw), col)


def lathe(col, name, profile, m, steps=40, loc=(0, 0, 0), **kw):
    """Revolve a list of (radius, z) points around Z."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    rings = []
    for i in range(steps):
        a = i / steps * math.tau
        rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z in profile])
    for i in range(steps):
        A, B = rings[i], rings[(i + 1) % steps]
        for k in range(len(profile) - 1):
            bm.faces.new((A[k], B[k], B[k + 1], A[k + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); o.location = loc
    col.objects.link(o)
    return finish(o, m, **kw)


def new_model(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    root = bpy.data.objects.new(name, None)
    col.objects.link(root)
    return col, root


def parent_all(col, root):
    for o in col.objects:
        if o is not root and o.parent is None:
            mw = o.matrix_world.copy(); o.parent = root; o.matrix_world = mw


# ---------------------------------------------------------------- models (1 unit = 1 cm of the real object)

def rubber_duck():
    col, root = new_model('duck')
    yel = mat('duck_yellow', (1.0, 0.72, 0.02), 0.28)
    ora = mat('duck_beak', (1.0, 0.25, 0.02), 0.35)
    blk = mat('duck_eye', (0.01, 0.01, 0.01), 0.08)
    wht = mat('duck_eye_white', (0.95, 0.95, 0.95), 0.2)
    body = sphere(col, 'body', (0, 0, 3.4), (5.6, 4.2, 3.6), yel, subdiv=1)
    # pull a tail up at the back
    for v in body.data.vertices:
        if v.co.x < -3.2 and v.co.z > 3.4: v.co.z += (-3.2 - v.co.x) * 1.1; v.co.x -= 0.4
        if v.co.z < 1.2: v.co.z = 1.2 + (v.co.z - 1.2) * 0.35  # flat bottom so it floats
    sphere(col, 'head', (2.6, 0, 8.2), (2.9, 2.8, 2.8), yel, subdiv=1)
    sphere(col, 'beak', (5.3, 0, 7.6), (1.7, 1.45, 0.62), ora, subdiv=1)
    for s in (1, -1):
        sphere(col, 'eye_w', (4.35, s * 1.35, 9.0), (0.62, 0.5, 0.75), wht, seg=16, rings=8)
        sphere(col, 'eye', (4.82, s * 1.45, 9.05), (0.28, 0.3, 0.42), blk, seg=16, rings=8)
        wing = sphere(col, 'wing', (-0.6, s * 3.9, 4.4), (2.8, 0.75, 1.5), yel, subdiv=1)
        wing.rotation_euler = (s * -0.18, -0.35, 0)
    parent_all(col, root)
    return col


def donut():
    col, root = new_model('donut')
    dough = mat('donut_dough', (0.78, 0.45, 0.18), 0.7)
    icing = mat('donut_icing', (1.0, 0.42, 0.62), 0.22)
    R, r = 5.0, 2.6
    torus(col, 'dough', (0, 0, r), R, r, dough, maj=56, mn=20)
    # icing: top half of a slightly fatter torus with a wavy drip edge
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r * 1.06, major_segments=72, minor_segments=24, location=(0, 0, r))
    ic = bpy.context.object; ic.name = 'icing'
    bm = bmesh.new(); bm.from_mesh(ic.data)
    for v in bm.verts:
        a = math.atan2(v.co.y, v.co.x)
        edge = -0.5 + 0.55 * math.sin(a * 7) + 0.3 * math.sin(a * 13 + 1)
        if v.co.z < edge: v.co.z = edge  # squash the lower half into a thin sheet...
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.co.z <= -0.45 + 0.85 for v in f.verts) and f.calc_center_median().z < -0.2], context='FACES')
    bm.to_mesh(ic.data); bm.free()
    ic.data.update()
    sol = ic.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.18
    link(finish(ic, icing), col)
    bpy.context.view_layer.objects.active = ic; bpy.ops.object.modifier_apply(modifier='sol')
    # sprinkles
    cols = [(1, 1, 1), (0.2, 0.6, 1.0), (1.0, 0.85, 0.1), (0.3, 0.85, 0.35), (0.6, 0.25, 0.9)]
    sm = [mat(f'sprinkle{i}', c, 0.3) for i, c in enumerate(cols)]
    parts = []
    for i in range(70):
        a = random.uniform(0, math.tau); t = random.uniform(-1.1, 1.1)
        rr = R + math.sin(t) * r * 1.08; z = r + math.cos(t) * r * 1.08 + 0.12
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.13, depth=0.75, location=(math.cos(a) * rr, math.sin(a) * rr, z),
                                            rotation=(random.uniform(0, 3), random.uniform(0, 3), random.uniform(0, 3)))
        o = bpy.context.object; o.data.materials.append(sm[i % len(sm)]); parts.append(o)
    for o in bpy.context.view_layer.objects.selected: o.select_set(False)
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    sp = bpy.context.object; sp.name = 'sprinkles'; bpy.ops.object.shade_flat(); link(sp, col)
    parent_all(col, root)
    return col


def mug():
    col, root = new_model('mug')
    cer = mat('mug_ceramic', (0.05, 0.32, 0.75), 0.18)
    rim = mat('mug_inner', (0.95, 0.94, 0.9), 0.15)
    cof = mat('mug_coffee', (0.12, 0.05, 0.02), 0.06)
    out = [(0.0, 0.0), (3.6, 0.0), (3.9, 0.25), (4.0, 1.0), (4.0, 9.4), (4.1, 9.9), (3.95, 10.15)]
    lathe(col, 'body', out, cer, steps=48)
    inner = [(3.95, 10.15), (3.75, 9.9), (3.7, 9.0), (3.7, 1.2), (3.4, 0.8), (0.0, 0.8)]
    lathe(col, 'inner', inner, rim, steps=48)
    cyl(col, 'coffee', (0, 0, 8.2), 3.72, 0.05, cof, verts=48)
    h = torus(col, 'handle', (4.5, 0, 5.2), 2.4, 0.62, cer, rot=(math.pi / 2, 0, 0), maj=32, mn=12)
    bm = bmesh.new(); bm.from_mesh(h.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.x < -1.4], context='VERTS')
    for v in bm.verts: v.co.z *= 1.18
    bm.to_mesh(h.data); bm.free()
    parent_all(col, root)
    return col


def cactus():
    col, root = new_model('cactus')
    pot = mat('pot_terracotta', (0.72, 0.28, 0.12), 0.85)
    soil = mat('pot_soil', (0.13, 0.08, 0.05), 1.0)
    grn = mat('cactus_green', (0.12, 0.42, 0.16), 0.55)
    pink = mat('cactus_flower', (1.0, 0.22, 0.52), 0.4, emit=(1.0, 0.2, 0.5), strength=0.4)
    spine = mat('cactus_spine', (0.95, 0.92, 0.75), 0.4)
    prof = [(0.0, 0.0), (3.2, 0.0), (3.4, 0.2), (4.2, 5.4), (4.9, 5.5), (5.0, 7.0), (4.6, 7.1), (4.5, 6.6), (0.0, 6.6)]
    lathe(col, 'pot', prof, pot, steps=40, angle=30)
    cyl(col, 'soil', (0, 0, 6.65), 4.45, 0.1, soil, verts=40)

    def ribbed(name, base, length, rad, axis=(0, 0, 1)):
        # star-section column with a domed top: classic saguaro ribs
        ribs, steps = 10, 14
        prof = []
        for k in range(steps + 1):
            t = k / steps
            z = t * length
            rr = rad if t < 0.75 else rad * math.cos((t - 0.75) / 0.25 * math.pi / 2) ** 0.6
            prof.append((max(rr, 0.001), z))
        o = lathe(col, name, prof, grn, steps=ribs * 4, angle=60)
        for v in o.data.vertices:
            a = math.atan2(v.co.y, v.co.x)
            k = 1 + 0.09 * math.cos(a * ribs)
            v.co.x *= k; v.co.y *= k
        o.location = base
        o.rotation_euler = Vector((0, 0, 1)).rotation_difference(Vector(axis)).to_euler()
        return o

    ribbed('trunk', (0, 0, 6.5), 15, 2.2)
    for s, h, L in ((1, 11, 5.2), (-1, 14, 4.2)):
        cyl(col, 'elbow', (s * 3.0, 0, 6.5 + h - 0.6), 1.25, 3.6, grn, verts=20, rot=(0, math.pi / 2, 0))
        ribbed('arm', (s * 4.4, 0, 6.5 + h - 1.2), L, 1.3)
    for i in range(5):
        a = i / 5 * math.tau
        sphere(col, 'petal', (math.cos(a) * 0.75, math.sin(a) * 0.75, 21.6), (0.9, 0.9, 0.35), pink, seg=12, rings=6)
    sphere(col, 'flower_c', (0, 0, 21.8), (0.45, 0.45, 0.3), mat('flower_c', (1, 0.85, 0.2), 0.5), seg=12, rings=6)
    parts = []
    for i in range(60):
        a = random.uniform(0, math.tau); z = random.uniform(8, 20)
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.07, depth=0.7, location=(math.cos(a) * 2.45, math.sin(a) * 2.45, z),
                                        rotation=(0, math.pi / 2, a))
        o = bpy.context.object; o.data.materials.append(spine); parts.append(o)
    for o in bpy.context.view_layer.objects.selected: o.select_set(False)
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join(); sp = bpy.context.object; sp.name = 'spines'; link(sp, col)
    parent_all(col, root)
    return col


def alarm_clock():
    col, root = new_model('clock')
    red = mat('clock_red', (0.85, 0.05, 0.05), 0.25, 0.6)
    chrome = mat('clock_chrome', (0.9, 0.9, 0.92), 0.12, 1.0)
    face = mat('clock_face', (0.97, 0.96, 0.9), 0.4, emit=(1, 0.97, 0.85), strength=0.25)
    ink = mat('clock_ink', (0.03, 0.03, 0.04), 0.4)
    Y = math.pi / 2
    cyl(col, 'case', (0, 0, 7.0), 5.6, 3.6, red, verts=48, rot=(Y, 0, 0), angle=50)
    torus(col, 'bezel', (0, -1.85, 7.0), 5.25, 0.42, chrome, rot=(Y, 0, 0), maj=48, mn=10)
    cyl(col, 'face', (0, -1.82, 7.0), 5.0, 0.05, face, verts=48, rot=(Y, 0, 0))
    for i in range(12):
        a = i / 12 * math.tau
        big = i % 3 == 0
        bpy.ops.mesh.primitive_cube_add(size=1, location=(math.sin(a) * 4.2, -1.9, 7 + math.cos(a) * 4.2), rotation=(0, a, 0))
        o = bpy.context.object; o.scale = (0.22 if big else 0.12, 0.05, 0.9 if big else 0.5); o.name = 'tick'
        bpy.ops.object.transform_apply(scale=True); link(finish(o, ink, smooth=False), col)
    # hands are separate objects pivoting at the dial centre, so the game can turn them
    for name, L, w in (('hand_hour', 2.6, 0.32), ('hand_min', 3.8, 0.2)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, L / 2 - 0.4))
        o = bpy.context.object; o.scale = (w, 0.06, L); bpy.ops.object.transform_apply(scale=True, location=True)
        o.name = name; o.location = (0, -1.96 if name == 'hand_min' else -1.92, 7.0)
        o.rotation_euler.y = math.radians(60 if name == 'hand_min' else -60)  # 10:10 for the photo
        link(finish(o, ink, smooth=False), col)
    cyl(col, 'pin', (0, -2.0, 7.0), 0.3, 0.2, chrome, verts=16, rot=(Y, 0, 0))
    for s in (1, -1):
        b = sphere(col, 'bell', (s * 3.6, 0, 12.4), (2.1, 2.1, 2.1), chrome, seg=32, rings=16)
        bm = bmesh.new(); bm.from_mesh(b.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if Vector(v.co).dot(Vector((-s * 0.5, 0, -0.87))) > 0.15], context='VERTS')  # open towards the case
        bm.to_mesh(b.data); bm.free()
        sol = b.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.15
        bpy.context.view_layer.objects.active = b; bpy.ops.object.modifier_apply(modifier='sol')
        cyl(col, 'leg', (s * 3.2, 0, 0.9), 0.35, 2.4, chrome, verts=12, rot=(0, s * 0.45, 0))
        sphere(col, 'foot', (s * 3.7, 0, 0.0 + 0.35), (0.55, 0.55, 0.35), chrome, seg=12, rings=6)
    cyl(col, 'stem', (0, 0, 12.9), 0.25, 1.6, chrome, verts=12)
    sphere(col, 'striker', (0, 0, 13.8), (0.55, 0.55, 0.55), chrome, seg=12, rings=6)
    torus(col, 'handle', (0, 0.0, 12.6), 2.6, 0.22, chrome, rot=(Y, 0, 0), maj=32, mn=8)
    h = [o for o in col.objects if o.name.startswith('handle')][0]
    bm = bmesh.new(); bm.from_mesh(h.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < 0.3], context='VERTS')  # local y = world z after rotation: keep the top arc
    bm.to_mesh(h.data); bm.free()
    h.location.z = 12.2
    parent_all(col, root)
    return col


MODELS = {'duck': rubber_duck, 'donut': donut, 'mug': mug, 'cactus': cactus, 'clock': alarm_clock}


def export(col, path):
    for o in bpy.context.view_layer.objects.selected: o.select_set(False)
    for o in col.objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_cameras=False, export_lights=False, export_materials='EXPORT')


def render(col, path):
    sc = bpy.context.scene
    for c in sc.collection.children: sc.view_layers[0].layer_collection.children[c.name].exclude = c is not col
    objs = [o for o in col.objects if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(b) for o in objs for b in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ctr, size = (lo + hi) / 2, (hi - lo).length
    cam = sc.camera
    d = Vector((0.55, -1.0, 0.42)).normalized()
    cam.location = ctr + d * size * 1.55
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def setup_render():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48; sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.film_transparent = False
    w = bpy.data.worlds.new('w'); sc.world = w; w.color = (0.32, 0.36, 0.42)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.lens = 50
    sc.collection.objects.link(cam); sc.camera = cam
    for loc, e, s in (((-30, -40, 50), 3.5, 'SUN'),):
        L = bpy.data.objects.new('sun', bpy.data.lights.new('sun', s)); L.data.energy = e
        L.rotation_euler = (0.75, 0.2, -0.6); sc.collection.objects.link(L)
    floor = bpy.data.objects.new('floor', bpy.data.meshes.new('floor')); sc.collection.objects.link(floor)
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=200); bm.to_mesh(floor.data); bm.free()
    floor.data.materials.append(mat('floor', (0.5, 0.52, 0.55), 0.9))


if __name__ == '__main__':
    reset()
    os.makedirs(OUT, exist_ok=True)
    cols = {name: fn() for name, fn in MODELS.items()}
    for name, col in cols.items():
        export(col, os.path.join(OUT, name + '.glb'))
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in col.objects if o.type == 'MESH')
        print(f'{name}: {tris} tris')
    if '--render' in sys.argv:
        os.makedirs(PREVIEW, exist_ok=True)
        setup_render()
        for name, col in cols.items(): render(col, os.path.join(PREVIEW, name + '.png'))
        for c in bpy.context.scene.collection.children: bpy.context.scene.view_layers[0].layer_collection.children[c.name].exclude = False
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'props.blend'), compress=True)
