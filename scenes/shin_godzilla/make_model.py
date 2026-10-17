# シン・ゴジラ(第4形態)— a procedural Shin Godzilla built with Blender's Python API.
#   pip install bpy
#   python3 make_model.py [--preview]   # builds shin_godzilla.blend and renders render.png (Cycles)
# Blender coordinates: Z up, the creature faces -Y and stands about 13 units tall (feet at z = 0).
# The body is a metaball sculpture (torso, neck, head, legs, arms, tail) fused with the dorsal plates by a voxel
# remesh; a geometry-nodes modifier then carves the keloid folds and the glowing red cracks.
import math, os, random, sys
import bpy, bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
PREVIEW = '--preview' in sys.argv
random.seed(4)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def link(ob):
    scene.collection.objects.link(ob)
    return ob

# ---------------------------------------------------------------- spline helpers
def catmull(pts, step):
    """Catmull-Rom through pts (tuples of equal length, first three = xyz); resampled every `step` units."""
    P = [Vector(p) for p in pts]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        n = max(2, int((p2.to_3d() - p1.to_3d()).length / step))
        for k in range(n):
            t = k / n
            out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2])
    return out

# ---------------------------------------------------------------- the body (metaballs)
MB = bpy.data.metaballs.new('body_mb')
MB.resolution = MB.render_resolution = 0.07
MB.threshold = 0.6
MB_OB = link(bpy.data.objects.new('body_mb', MB))
K = 1.62  # metaball radius per unit of surface radius (calibrated for dense chains)

def ball(p, r, scale=(1, 1, 1), neg=False, kind='ELLIPSOID'):
    e = MB.elements.new(type=kind)
    e.co = p; e.radius = r * K; e.stiffness = 2.0
    e.size_x, e.size_y, e.size_z = scale
    e.use_negative = neg
    return e

def chain(pts, step=0.18, scale=(1, 1, 1), sparse=1.0):
    """pts: (x, y, z, r). A tube of balls whose radius follows r."""
    for q in catmull(pts, step):
        ball(q.to_3d(), q[3] * 0.62 * sparse, scale)

TORSO = [  # hips -> base of the skull
    (0, 0.55, 2.9, 2.05), (0, 0.05, 4.1, 2.2), (0, -0.25, 5.3, 1.9), (0, -0.25, 6.4, 1.5),
    (0, -0.15, 7.4, 1.15), (0, -0.35, 8.35, 0.9), (0, -0.8, 9.15, 0.72), (0, -1.15, 9.6, 0.6)]
TAIL = [  # root behind the hips -> tip, sweeping back and then rising behind the body
    (0, 1.3, 3.1, 1.6), (0, 2.8, 2.7, 1.25), (0.15, 4.4, 2.8, 0.98), (0.45, 5.9, 3.4, 0.8), (0.7, 7.1, 4.6, 0.64),
    (0.85, 7.9, 6.3, 0.52), (0.95, 8.3, 8.2, 0.43), (0.95, 8.3, 10.1, 0.36), (0.85, 8.0, 11.7, 0.31),
    (0.7, 7.5, 12.9, 0.3), (0.6, 7.0, 13.6, 0.26)]

def body():
    chain(TORSO, scale=(1.1, 0.95, 1.0))
    chain(TAIL)
    # the belly sags forward, the chest is a little keeled
    ball((0, -0.9, 4.0), 1.55, (1.15, 1.0, 1.25)); ball((0, -0.95, 5.6), 1.0, (1.2, 0.9, 1.1))
    # head: skull, long snout, heavy protruding lower jaw, mouth carved out with a negative ellipsoid
    ball((0, -1.55, 9.75), 0.55, (0.95, 1.25, 0.8)); ball((0, -2.25, 9.68), 0.38, (1.05, 1.5, 0.75))
    ball((0, -2.75, 9.62), 0.26, (1.1, 1.2, 0.8))
    ball((0, -1.7, 9.3), 0.5, (1.05, 1.3, 0.62)); ball((0, -2.4, 9.25), 0.35, (1.15, 1.45, 0.65))
    ball((0, -2.85, 9.27), 0.22, (1.2, 1.1, 0.8))
    for s in (-1, 1):  # gill-like cheek bulges and brow ridges
        ball((s * 0.42, -1.4, 9.55), 0.3, (0.8, 1.2, 1.0)); ball((s * 0.3, -2.05, 9.92), 0.16, (1.0, 2.0, 0.7))
    ball((0, -2.45, 9.46), 0.33, (1.0, 2.1, 0.24), neg=True)
    # legs: elephantine thighs and short shins, splayed feet
    for s in (-1, 1):
        chain([(s * 1.05, 0.4, 3.2, 1.5), (s * 1.45, 0.0, 2.1, 1.25), (s * 1.6, -0.25, 1.1, 0.95), (s * 1.62, -0.2, 0.45, 0.85)])
        ball((s * 1.65, -0.55, 0.32), 0.62, (1.25, 1.6, 0.6))
    # arms: tiny, held forward, palms up with long splayed fingers
    for s in (-1, 1):
        chain([(s * 1.05, -1.05, 6.45, 0.42), (s * 1.42, -1.45, 5.75, 0.3), (s * 1.38, -2.05, 5.85, 0.22),
               (s * 1.3, -2.45, 6.05, 0.18)], step=0.07)
        ball((s * 1.3, -2.5, 6.08), 0.19, (1.1, 1.0, 0.6))
        for f in range(5):
            a = math.radians(-60 + f * 30) * s
            d = Vector((math.sin(a), -math.cos(a), 0))
            base = Vector((s * 1.3, -2.5, 6.1)) + d * 0.12
            pts = []
            for k in range(4):
                L = 0.17 * (k + 1)
                pts.append((*(base + d * L + Vector((0, 0, 0.08 * k * k))), 0.1 - 0.012 * k))
            chain([(*base, 0.11)] + pts, step=0.025)
    # random lumps over the torso and thighs so the silhouette is not too clean
    for _ in range(70):
        z = random.uniform(1.8, 7.6)
        a = random.uniform(0, 2 * math.pi)
        r = 2.0 if z < 5 else 1.5 - (z - 5) * 0.15
        ball((math.cos(a) * r * 0.9, math.sin(a) * r * 0.8 - 0.1, z), random.uniform(0.25, 0.55))

def metaball_mesh():
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(MB_OB.evaluated_get(dg))
    bpy.data.objects.remove(MB_OB)
    return me

# ---------------------------------------------------------------- dorsal plates
def dorsal_path():
    head_to_hips = [p for p in reversed(TORSO)][1:]
    path = catmull([(x, y, z) for x, y, z, r in head_to_hips[:-1]] + [(x, y, z) for x, y, z, r in TAIL[1:]], 0.05)
    return path

def plate_outline(w, h, lean):
    """Flame-like jagged plate outline in (u along spine, v away from body), root sunk below v = 0."""
    pts = [(-w / 2, -0.45 * h), (w / 2, -0.45 * h)]
    n = random.choice((2, 3, 3, 4))
    xs = [w / 2 - w * (i + 0.5) / n for i in range(n)]
    for i, x in enumerate(xs):
        pts.append((x + w / (2 * n) * random.uniform(0.2, 0.6), h * random.uniform(0.2, 0.45)))  # notch
        th = h * (random.uniform(0.75, 1.0) if i in (1, n // 2) else random.uniform(0.5, 0.85))
        pts.append((x + lean * th + random.uniform(-0.1, 0.1) * w, th))  # tip
    pts.append((-w / 2 - 0.05 * w, h * random.uniform(0.15, 0.35)))
    return pts

def add_plate(bm, origin, T, D, N, w, h, thick):
    out = plate_outline(w, h, random.uniform(-0.35, 0.05))
    front, back = [], []
    for u, v in out:
        t = thick * max(0.35, 1 - 0.65 * max(v, 0) / h)
        bend = 0.12 * h * (max(v, 0) / h) ** 2 * random.uniform(-1, 1)
        p = origin + T * u + D * v + N * bend
        front.append(bm.verts.new(p + N * t / 2)); back.append(bm.verts.new(p - N * t / 2))
    bm.faces.new(front); bm.faces.new(list(reversed(back)))
    n = len(out)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[j], front[i], back[i], back[j]))

def plates(body_me):
    bvh = BVHTree.FromPolygons([v.co.copy() for v in body_me.vertices], [tuple(p.vertices) for p in body_me.polygons])
    path = dorsal_path()
    length = [0.0]
    for a, b in zip(path, path[1:]): length.append(length[-1] + (b - a).length)
    total = length[-1]
    ref = Vector((0, 1, 1)).normalized()
    bm = bmesh.new()
    s = 0.25
    while s < total - 0.4:
        i = next(k for k, l in enumerate(length) if l >= s)
        p = path[i]; T = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        D = (ref - T * ref.dot(T)).normalized()
        f = s / total  # 0 at the skull, 1 at the tail tip
        size = (0.6 + 2.8 * f / 0.12) if f < 0.12 else (3.4 if f < 0.3 else 3.4 - 3.1 * (f - 0.3) / 0.7)
        size *= random.uniform(0.8, 1.1)
        for row in (0, -1, 1):
            if row and size < 0.45: continue
            sc = 1.0 if row == 0 else 0.62
            N0 = T.cross(D).normalized()
            Dr = (Matrix.Rotation(math.radians(38) * row, 3, T) @ D).normalized()
            hit = bvh.ray_cast(p + Dr * 6, -Dr, 12)
            if hit[0] is None: continue
            Nr = T.cross(Dr).normalized()
            rot = Matrix.Rotation(random.uniform(-0.2, 0.2), 3, Dr)
            add_plate(bm, hit[0] - Dr * 0.05, rot @ T, Dr, rot @ Nr,
                      size * sc * random.uniform(0.7, 0.95), size * sc * random.uniform(0.8, 1.15), 0.06 + 0.07 * size * sc)
        s += size * random.uniform(0.32, 0.45)
    me = bpy.data.meshes.new('plates')
    bm.to_mesh(me); bm.free()
    return me

# ---------------------------------------------------------------- skin: folds and cracks (shared by GN and shader)
def crack_net(nt, vec):
    """Builds the shared skin pattern in node tree nt from a position socket; returns (crack 0..1, lumps 0..1, folds 0..1)."""
    N, L = nt.nodes, nt.links
    def node(kind, **inp):
        n = N.new(kind)
        for k, v in inp.items(): n.inputs[k].default_value = v
        return n
    warp = node('ShaderNodeTexNoise', Scale=0.6, Detail=3.0); L.new(vec, warp.inputs['Vector'])
    wsub = node('ShaderNodeVectorMath'); wsub.operation = 'MULTIPLY_ADD'
    wsub.inputs[1].default_value = (0.9, 0.9, 0.9); wsub.inputs[2].default_value = (-0.45, -0.45, -0.45)
    L.new(warp.outputs['Color'], wsub.inputs[0])
    wv = node('ShaderNodeVectorMath'); wv.operation = 'ADD'; L.new(vec, wv.inputs[0]); L.new(wsub.outputs['Vector'], wv.inputs[1])
    stretch = node('ShaderNodeVectorMath'); stretch.operation = 'MULTIPLY'; stretch.inputs[1].default_value = (1.0, 1.0, 0.55)
    L.new(wv.outputs['Vector'], stretch.inputs[0])  # veins run mostly up and down the body
    masks = []
    for scale, width in ((1.3, 0.05), (4.0, 0.1)):
        vo = node('ShaderNodeTexVoronoi', Scale=scale); vo.feature = 'DISTANCE_TO_EDGE'
        vo.inputs['Randomness'].default_value = 0.9
        L.new(stretch.outputs['Vector'], vo.inputs['Vector'])
        mr = node('ShaderNodeMapRange'); mr.interpolation_type = 'SMOOTHSTEP'
        mr.inputs['From Min'].default_value = width; mr.inputs['From Max'].default_value = 0.0
        L.new(vo.outputs['Distance'], mr.inputs['Value']); masks.append(mr.outputs['Result'])
    fine = node('ShaderNodeMath'); fine.operation = 'MULTIPLY'; fine.inputs[1].default_value = 0.85
    L.new(masks[1], fine.inputs[0])
    gate = node('ShaderNodeTexNoise', Scale=0.9, Detail=2.0); L.new(vec, gate.inputs['Vector'])
    gm = node('ShaderNodeMapRange'); gm.inputs['From Min'].default_value = 0.4; gm.inputs['From Max'].default_value = 0.6
    L.new(gate.outputs['Fac'], gm.inputs['Value'])
    fg = node('ShaderNodeMath'); fg.operation = 'MULTIPLY'; L.new(fine.outputs[0], fg.inputs[0]); L.new(gm.outputs['Result'], fg.inputs[1])
    gate2 = node('ShaderNodeTexNoise', Scale=0.45, Detail=1.0); L.new(vec, gate2.inputs['Vector'])
    gm2 = node('ShaderNodeMapRange'); gm2.inputs['From Min'].default_value = 0.38; gm2.inputs['From Max'].default_value = 0.62
    gm2.inputs['To Min'].default_value = 0.15; L.new(gate2.outputs['Fac'], gm2.inputs['Value'])
    big = node('ShaderNodeMath'); big.operation = 'MULTIPLY'; L.new(masks[0], big.inputs[0]); L.new(gm2.outputs['Result'], big.inputs[1])
    crack = node('ShaderNodeMath'); crack.operation = 'MAXIMUM'; L.new(big.outputs[0], crack.inputs[0]); L.new(fg.outputs[0], crack.inputs[1])
    lumps = node('ShaderNodeTexNoise', Scale=2.8, Detail=10.0, Roughness=0.68, Distortion=0.8); L.new(vec, lumps.inputs['Vector'])
    ridge = node('ShaderNodeTexNoise', Scale=3.6, Detail=5.0, Roughness=0.55, Distortion=0.3); ridge.noise_type = 'RIDGED_MULTIFRACTAL'
    L.new(stretch.outputs['Vector'], ridge.inputs['Vector'])  # keloid ridges, also mostly vertical
    rr = node('ShaderNodeMapRange'); rr.inputs['From Min'].default_value = 0.0; rr.inputs['From Max'].default_value = 1.6
    L.new(ridge.outputs['Fac'], rr.inputs['Value'])
    return crack.outputs[0], lumps.outputs['Fac'], rr.outputs['Result']

def skin_nodes():
    ng = bpy.data.node_groups.new('skin_folds_and_cracks', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    for name, val in (('Crack Depth', 0.07), ('Lump Height', 0.2), ('Fold Height', 0.09)):
        s = ng.interface.new_socket(name, in_out='INPUT', socket_type='NodeSocketFloat'); s.default_value = val
    N, L = ng.nodes, ng.links
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    pos = N.new('GeometryNodeInputPosition'); nor = N.new('GeometryNodeInputNormal')
    crack, lumps, folds = crack_net(ng, pos.outputs['Position'])
    def math(op, a, b):
        m = N.new('ShaderNodeMath'); m.operation = op
        for i, x in enumerate((a, b)):
            if isinstance(x, (int, float)): m.inputs[i].default_value = x
            else: L.new(x, m.inputs[i])
        return m.outputs[0]
    h = math('ADD', math('MULTIPLY', math('SUBTRACT', lumps, 0.5), gi.outputs['Lump Height']),
             math('MULTIPLY', math('SUBTRACT', folds, 0.5), gi.outputs['Fold Height']))
    h = math('SUBTRACT', h, math('MULTIPLY', crack, gi.outputs['Crack Depth']))
    off = N.new('ShaderNodeVectorMath'); off.operation = 'SCALE'
    L.new(nor.outputs['Normal'], off.inputs[0]); L.new(h, off.inputs['Scale'])
    rest = N.new('GeometryNodeStoreNamedAttribute'); rest.data_type = 'FLOAT_VECTOR'; rest.inputs['Name'].default_value = 'rest'
    L.new(gi.outputs['Geometry'], rest.inputs['Geometry']); L.new(pos.outputs['Position'], rest.inputs['Value'])
    sp = N.new('GeometryNodeSetPosition'); L.new(rest.outputs['Geometry'], sp.inputs['Geometry']); L.new(off.outputs['Vector'], sp.inputs['Offset'])
    L.new(sp.outputs['Geometry'], go.inputs['Geometry'])
    return ng

# ---------------------------------------------------------------- materials
def skin_material():
    m = bpy.data.materials.new('shin_skin'); m.use_nodes = True
    nt = m.node_tree; N, L = nt.nodes, nt.links; p = N['Principled BSDF']
    at = N.new('ShaderNodeAttribute'); at.attribute_name = 'rest'
    crack, lumps, folds = crack_net(nt, at.outputs['Vector'])
    # charcoal skin, lighter and more silvery on the raised folds
    tone = N.new('ShaderNodeMath'); tone.operation = 'MULTIPLY_ADD'
    L.new(folds, tone.inputs[0]); tone.inputs[1].default_value = 0.5; L.new(lumps, tone.inputs[2])
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.45; ramp.color_ramp.elements[0].color = (0.012, 0.01, 0.01, 1)
    ramp.color_ramp.elements[1].position = 0.8; ramp.color_ramp.elements[1].color = (0.075, 0.07, 0.07, 1)
    sc = N.new('ShaderNodeMath'); sc.operation = 'DIVIDE'; L.new(tone.outputs[0], sc.inputs[0]); sc.inputs[1].default_value = 1.5
    L.new(sc.outputs[0], ramp.inputs['Fac'])
    red = N.new('ShaderNodeMix'); red.data_type = 'RGBA'
    L.new(crack, red.inputs['Factor']); L.new(ramp.outputs['Color'], red.inputs['A']); red.inputs['B'].default_value = (0.3, 0.01, 0.006, 1)
    L.new(red.outputs['Result'], p.inputs['Base Color'])
    p.inputs['Emission Color'].default_value = (1.0, 0.09, 0.02, 1)
    glow = N.new('ShaderNodeMath'); glow.operation = 'POWER'; L.new(crack, glow.inputs[0]); glow.inputs[1].default_value = 2.0
    gs = N.new('ShaderNodeMath'); gs.operation = 'MULTIPLY'; L.new(glow.outputs[0], gs.inputs[0]); gs.inputs[1].default_value = 0.35
    L.new(gs.outputs[0], p.inputs['Emission Strength'])
    rough = N.new('ShaderNodeMapRange'); L.new(lumps, rough.inputs['Value'])
    rough.inputs['To Min'].default_value = 0.78; rough.inputs['To Max'].default_value = 0.42
    L.new(rough.outputs['Result'], p.inputs['Roughness'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; bump.inputs['Distance'].default_value = 0.03
    L.new(tone.outputs[0], bump.inputs['Height']); L.new(bump.outputs['Normal'], p.inputs['Normal'])
    p.inputs['Subsurface Weight'].default_value = 0.05; p.inputs['Subsurface Radius'].default_value = (0.3, 0.05, 0.03)
    return m

def simple_mat(name, color, rough, emit=None, strength=0):
    m = bpy.data.materials.new(name); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1); p.inputs['Roughness'].default_value = rough
    if emit: p.inputs['Emission Color'].default_value = (*emit, 1); p.inputs['Emission Strength'].default_value = strength
    return m

# ---------------------------------------------------------------- teeth, eyes, claws
def cone(bm, base, tip, r, sides=6):
    axis = (tip - base).normalized()
    a = axis.orthogonal().normalized(); b = axis.cross(a)
    ring = [bm.verts.new(base + (a * math.cos(t) + b * math.sin(t)) * r * random.uniform(0.75, 1.15))
            for t in (2 * math.pi * k / sides for k in range(sides))]
    top = bm.verts.new(tip)
    for i in range(sides): bm.faces.new((ring[i], ring[(i + 1) % sides], top))
    bm.faces.new(list(reversed(ring)))

def teeth_and_claws():
    bm = bmesh.new()
    for upper in (True, False):  # crooked, uneven rows; some teeth jut outward past the lips
        for k in range(-15, 16):
            t = k / 15 * 1.4 + random.uniform(-0.04, 0.04)
            x, y = 0.3 * math.sin(t), -2.45 - 0.62 * math.cos(t) + 0.05
            z0 = 9.53 if upper else 9.41
            L = random.uniform(0.04, 0.14) * (1.15 if abs(k) < 8 else 0.75)
            out = Vector((math.sin(t), -math.cos(t), 0)) * random.uniform(-0.01, 0.05)
            tip = Vector((x, y, z0 + (-L if upper else L))) + out + Vector((random.uniform(-0.02, 0.02), random.uniform(-0.02, 0.02), 0))
            cone(bm, Vector((x, y, z0 + (0.06 if upper else -0.06))), tip, random.uniform(0.016, 0.032), 5)
    for s in (-1, 1):  # toe claws
        for k in range(4):
            a = math.radians(-50 + 33 * k)
            base = Vector((s * 1.65 + math.sin(a) * 0.7, -0.55 - math.cos(a) * 0.95, 0.2))
            cone(bm, base, base + Vector((math.sin(a) * 0.35, -math.cos(a) * 0.35, -0.17)), 0.12, 7)
    me = bpy.data.meshes.new('teeth_claws'); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new('teeth_claws', me))
    ob.data.materials.append(simple_mat('tooth', (0.22, 0.18, 0.13), 0.5))
    for poly in me.polygons: poly.use_smooth = False
    eye = simple_mat('eye', (0.004, 0.003, 0.003), 0.15)
    for s in (-1, 1):  # tiny dull eyes set far back on the head
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.065, location=(s * 0.4, -1.95, 9.86), segments=16, ring_count=10)
        bpy.context.object.name = 'eye'; bpy.context.object.data.materials.append(eye)
        bpy.ops.object.shade_smooth()

# ---------------------------------------------------------------- assemble
def build():
    body()
    body_me = metaball_mesh()
    plate_me = plates(body_me)
    bm = bmesh.new(); bm.from_mesh(body_me); bm.from_mesh(plate_me)
    me = bpy.data.meshes.new('shin_godzilla'); bm.to_mesh(me); bm.free()
    bpy.data.meshes.remove(body_me); bpy.data.meshes.remove(plate_me)
    ob = link(bpy.data.objects.new('shin_godzilla', me))
    rm = ob.modifiers.new('fuse', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.032 if not PREVIEW else 0.045; rm.use_smooth_shade = True
    sm = ob.modifiers.new('soften', 'SMOOTH'); sm.factor = 0.6; sm.iterations = 3
    gn = ob.modifiers.new('skin', 'NODES'); gn.node_group = skin_nodes()
    ob.data.materials.append(skin_material())
    teeth_and_claws()
    # everything rotates together so the head turns toward the camera's left, like the reference shot
    root = link(bpy.data.objects.new('rig_root', None))
    for o in scene.objects:
        if o is not root: o.parent = root
    root.rotation_euler = (0, 0, math.radians(-38))
    return ob

def stage():
    ground = bpy.data.meshes.new('ground'); bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60); bm.to_mesh(ground); bm.free()
    g = link(bpy.data.objects.new('ground', ground)); g.data.materials.append(simple_mat('asphalt', (0.05, 0.05, 0.05), 0.9))
    w = bpy.data.worlds.new('overcast'); scene.world = w; w.use_nodes = True
    N, L = w.node_tree.nodes, w.node_tree.links
    sky = N.new('ShaderNodeTexGradient'); tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Generated'], sep.inputs[0])
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0.62, 0.64, 0.68, 1)
    ramp.color_ramp.elements[1].position = 0.6; ramp.color_ramp.elements[1].color = (0.95, 0.96, 0.98, 1)
    L.new(sep.outputs['Z'], ramp.inputs['Fac']); L.new(ramp.outputs['Color'], N['Background'].inputs['Color'])
    N['Background'].inputs['Strength'].default_value = 1.4
    sun = link(bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')))
    sun.data.energy = 1.6; sun.data.angle = math.radians(25); sun.data.color = (1.0, 0.97, 0.93)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-110))

def camera_and_render():
    cam = link(bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))); scene.camera = cam
    cam.data.lens = 40
    cam.location = (5.5, -15.5, 2.2)
    target = Vector((0.6, -1.0, 7.6))
    if '--head' in sys.argv:  # close-up for checking the face and hands
        cam.data.lens = 70; cam.location = (2.5, -9.5, 8.0); target = Vector((-0.6, -2.0, 8.4))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    r = scene.render
    r.engine = 'CYCLES'; scene.cycles.device = 'CPU'
    scene.cycles.samples = 24 if PREVIEW else 128
    scene.cycles.use_denoising = True; scene.cycles.adaptive_threshold = 0.02
    scene.cycles.max_bounces = 6
    r.resolution_x, r.resolution_y = 1200, 1600
    r.resolution_percentage = 40 if PREVIEW else 100
    scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
    r.image_settings.file_format = 'PNG'
    r.filepath = os.path.join(HERE, 'render_preview.png' if PREVIEW else 'render.png')

build(); stage(); camera_and_render()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'shin_godzilla.blend' if not PREVIEW else 'preview.blend'), compress=True)
bpy.ops.render.render(write_still=True)
print('rendered', scene.render.filepath)
