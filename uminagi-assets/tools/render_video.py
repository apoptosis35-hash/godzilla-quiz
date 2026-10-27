# A fly-through film of the finished town, path traced with Cycles and dressed for realism:
#   Nishita sky with a procedural cloud deck, an animated Ocean-modifier sea, aerial haze from the mist pass,
#   slight colour / roughness / bump variation on every material, motion blur and a soft bloom.
#   python3 tools/assemble_town.py                      (once: scene/uminagi_town.blend)
#   python3 tools/render_video.py [--size 1280x720] [--samples 40] [--fps 12] [--seconds 16] [--frames a-b] [--test N]
# Frames go to scene/film/####.png; ffmpeg turns them into scene/uminagi_film.mp4 (see the end of the script).
import math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); SCENE = os.path.join(ROOT, 'scene')
args = sys.argv[1:]
def opt(name, default): return args[args.index(name) + 1] if name in args else default
W, H = map(int, opt('--size', '1280x720').split('x')); SAMPLES = int(opt('--samples', '40'))
FPS = int(opt('--fps', '12')); SECONDS = float(opt('--seconds', '16')); TEST = opt('--test', None)
import bpy
from mathutils import Vector

bpy.ops.wm.open_mainfile(filepath=os.path.join(SCENE, 'uminagi_town.blend'))
sc = bpy.context.scene
def g2b(v): return Vector((v[0], -v[2], v[1]))   # game (x, y up, z south) -> Blender (x, -z, y)
def fcurves(ob):   # Blender 4 (action.fcurves) and 5 (layered actions)
    act = ob.animation_data.action if ob.animation_data else None
    if not act: return []
    if hasattr(act, 'fcurves'): return list(act.fcurves)
    return [fc for ly in act.layers for st in ly.strips for cb in st.channelbags for fc in cb.fcurves]

# ---------------------------------------------------------------- render settings
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES
sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.025
sc.cycles.use_denoising = True
try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
sc.cycles.max_bounces = 5; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 2; sc.cycles.transmission_bounces = 4
sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False; sc.cycles.blur_glossy = 1.0
sc.render.use_persistent_data = True
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
sc.render.use_motion_blur = True; sc.render.motion_blur_shutter = 0.12
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
sc.view_settings.view_transform = 'AgX'
looks = [l.identifier for l in sc.view_settings.bl_rna.properties['look'].enum_items]
sc.view_settings.look = next((l for l in ('AgX - Medium High Contrast', 'AgX - Base Contrast') if l in looks), 'None')
sc.view_settings.exposure = -0.35
sc.render.fps = FPS; sc.frame_start = 1; sc.frame_end = int(FPS * SECONDS)

# ---------------------------------------------------------------- sky, sun and clouds
SUN_ELEV, SUN_AZ = 30, 215   # a clear early afternoon, light from the south-west
world = bpy.data.worlds.new('sky'); sc.world = world; world.use_nodes = True
nt = world.node_tree; N, Lk = nt.nodes, nt.links
bg = N['Background']; bg.inputs['Strength'].default_value = 0.14
sky = N.new('ShaderNodeTexSky')
if 'NISHITA' in [e.identifier for e in sky.bl_rna.properties['sky_type'].enum_items]: sky.sky_type = 'NISHITA'
if hasattr(sky, 'sun_elevation'):
    sky.sun_elevation = math.radians(SUN_ELEV); sky.sun_rotation = math.radians(SUN_AZ); sky.air_density = 1.2
    for k, v in (('aerosol_density', 2.0), ('dust_density', 2.0)):
        if hasattr(sky, k): setattr(sky, k, v)
# clouds: a noise field projected onto a high cloud deck (direction / its height), thinned towards the horizon
tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); Lk.new(tc.outputs['Generated'], sep.inputs[0])
mx = N.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; mx.inputs[1].default_value = 0.03; Lk.new(sep.outputs['Z'], mx.inputs[0])
div = N.new('ShaderNodeVectorMath'); div.operation = 'DIVIDE'; Lk.new(tc.outputs['Generated'], div.inputs[0])
comb = N.new('ShaderNodeCombineXYZ'); [Lk.new(mx.outputs[0], comb.inputs[i]) for i in range(3)]; Lk.new(comb.outputs[0], div.inputs[1])
noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 0.9; noise.inputs['Detail'].default_value = 9; noise.inputs['Roughness'].default_value = 0.6
Lk.new(div.outputs[0], noise.inputs['Vector'])
ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position = 0.46; ramp.color_ramp.elements[1].position = 0.66
Lk.new(noise.outputs['Fac'], ramp.inputs['Fac'])
fade = N.new('ShaderNodeMapRange'); fade.inputs['From Min'].default_value = 0.02; fade.inputs['From Max'].default_value = 0.25; Lk.new(sep.outputs['Z'], fade.inputs['Value'])
mask = N.new('ShaderNodeMath'); mask.operation = 'MULTIPLY'; Lk.new(ramp.outputs['Color'], mask.inputs[0]); Lk.new(fade.outputs['Result'], mask.inputs[1])
lum = N.new('ShaderNodeRGBToBW'); Lk.new(sky.outputs['Color'], lum.inputs[0])
cl = N.new('ShaderNodeMath'); cl.operation = 'MULTIPLY'; cl.inputs[1].default_value = 1.5; Lk.new(lum.outputs[0], cl.inputs[0])
cloud = N.new('ShaderNodeCombineColor'); [Lk.new(cl.outputs[0], cloud.inputs[i]) for i in range(3)]
mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; Lk.new(mask.outputs[0], mix.inputs['Factor'])
Lk.new(sky.outputs['Color'], mix.inputs['A']); Lk.new(cloud.outputs[0], mix.inputs['B']); Lk.new(mix.outputs['Result'], bg.inputs['Color'])
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.angle = math.radians(0.8); sun.data.energy = 3.4; sun.data.color = (1.0, 0.95, 0.88)
sun.rotation_euler = (math.radians(90 - SUN_ELEV), 0, math.radians(SUN_AZ + 90))

# ---------------------------------------------------------------- the sea: Ocean modifier waves + a calm far plane
ocean = bpy.data.objects.new('ocean', bpy.data.meshes.new('ocean')); sc.collection.objects.link(ocean)
om = ocean.modifiers.new('ocean', 'OCEAN')
om.geometry_mode = 'GENERATE'; om.resolution = 10; om.spatial_size = 110; om.size = 1.0; om.repeat_x = om.repeat_y = 7
om.wave_scale = 0.6; om.choppiness = 1.15; om.wind_velocity = 8; om.wave_alignment = 0.4; om.random_seed = 7
ocean.location = (-345, -645, 0.02)   # the 770 m patch spans Blender x -400..370, y -700..70 (game z -70..700: the bay and beyond)
om.time = 1.0; om.keyframe_insert('time', frame=1); om.time = 1.0 + SECONDS; om.keyframe_insert('time', frame=sc.frame_end)
for fc in fcurves(ocean):
    for k in fc.keyframe_points: k.interpolation = 'LINEAR'
far = bpy.data.objects.new('farsea', bpy.data.meshes.new('farsea')); sc.collection.objects.link(far)
import bmesh
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6000); bm.to_mesh(far.data); bm.free(); far.location = (0, 0, -0.15)
wm = bpy.data.materials.new('sea_water'); wm.use_nodes = True; p = wm.node_tree.nodes['Principled BSDF']
p.inputs['Base Color'].default_value = (0.012, 0.075, 0.09, 1); p.inputs['Roughness'].default_value = 0.025
p.inputs['Transmission Weight'].default_value = 0.85; p.inputs['IOR'].default_value = 1.333
for o in (ocean, far): o.data.materials.append(wm)

# ---------------------------------------------------------------- terrain: tiled grass with large patches of greens and dry
# grass, bare rock on the steep slopes (the game's terrain material is a flat tint at film scale)
TEX = os.path.join(ROOT, 'textures')
def img(n):
    for d in (os.path.join(TEX, '1k'), TEX):
        f = os.path.join(d, n)
        if os.path.exists(f): return bpy.data.images.load(f, check_existing=True)
    return None
def terrain_material():
    m = bpy.data.materials.new('terrain_film'); m.use_nodes = True; nt = m.node_tree; nn, ll = nt.nodes, nt.links
    pb = nn['Principled BSDF']; pb.inputs['Roughness'].default_value = 0.95
    co = nn.new('ShaderNodeTexCoord')
    def tiled(name, scale):
        mp = nn.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale, scale, scale); ll.new(co.outputs['Object'], mp.inputs['Vector'])
        t = nn.new('ShaderNodeTexImage'); t.image = img(name); t.projection = 'BOX'; t.projection_blend = 0.3; ll.new(mp.outputs[0], t.inputs['Vector'])
        return t
    grass, rock = tiled('grass.jpg', 0.28), tiled('rock.jpg', 0.12)
    big = nn.new('ShaderNodeTexNoise'); big.inputs['Scale'].default_value = 0.012; big.inputs['Detail'].default_value = 5; ll.new(co.outputs['Object'], big.inputs['Vector'])
    tint = nn.new('ShaderNodeValToRGB'); r = tint.color_ramp
    r.elements[0].position = 0.35; r.elements[0].color = (0.32, 0.45, 0.16, 1); r.elements[1].position = 0.7; r.elements[1].color = (0.62, 0.58, 0.3, 1)
    mid = r.elements.new(0.52); mid.color = (0.42, 0.52, 0.2, 1)
    ll.new(big.outputs['Fac'], tint.inputs['Fac'])
    gm = nn.new('ShaderNodeMix'); gm.data_type = 'RGBA'; gm.blend_type = 'MULTIPLY'; gm.inputs['Factor'].default_value = 1.0
    ll.new(grass.outputs['Color'], gm.inputs['A']); ll.new(tint.outputs['Color'], gm.inputs['B'])
    br = nn.new('ShaderNodeBrightContrast'); br.inputs['Bright'].default_value = 0.08; ll.new(gm.outputs['Result'], br.inputs['Color'])
    geo = nn.new('ShaderNodeNewGeometry'); sz = nn.new('ShaderNodeSeparateXYZ'); ll.new(geo.outputs['Normal'], sz.inputs[0])
    slope = nn.new('ShaderNodeMapRange'); slope.inputs['From Min'].default_value = 0.62; slope.inputs['From Max'].default_value = 0.8
    slope.inputs['To Min'].default_value = 1.0; slope.inputs['To Max'].default_value = 0.0; ll.new(sz.outputs['Z'], slope.inputs['Value'])
    rm = nn.new('ShaderNodeMix'); rm.data_type = 'RGBA'; ll.new(slope.outputs['Result'], rm.inputs['Factor'])
    ll.new(br.outputs['Color'], rm.inputs['A']); ll.new(rock.outputs['Color'], rm.inputs['B']); ll.new(rm.outputs['Result'], pb.inputs['Base Color'])
    bw = nn.new('ShaderNodeRGBToBW'); ll.new(rm.outputs['Result'], bw.inputs[0])
    bp = nn.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.35; bp.inputs['Distance'].default_value = 0.05
    ll.new(bw.outputs[0], bp.inputs['Height']); ll.new(bp.outputs['Normal'], pb.inputs['Normal'])
    return m
TERRAIN = terrain_material() if img('grass.jpg') else None
if TERRAIN:
    for o in bpy.data.collections['town'].objects:
        if o.type == 'MESH':
            for slot in o.material_slots:
                if slot.material and slot.material.name.split('.')[0] in ('terrain', 'grass'): slot.material = TERRAIN

# ---------------------------------------------------------------- materials: nothing is perfectly uniform
SKIP = ('glass', 'water', 'sea', 'window', 'lamp', 'glow', 'neon', 'eye', 'ink', 'canvas')
for m in bpy.data.materials:
    if not m.use_nodes or m in (wm, TERRAIN) or any(s in m.name.lower() for s in SKIP): continue
    nt = m.node_tree; pb = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not pb: continue
    co = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.6; nz.inputs['Detail'].default_value = 6
    nt.links.new(co.outputs['Object'], nz.inputs['Vector'])
    vr = nt.nodes.new('ShaderNodeMapRange'); vr.inputs['To Min'].default_value = 0.86; vr.inputs['To Max'].default_value = 1.08
    nt.links.new(nz.outputs['Fac'], vr.inputs['Value'])
    bc = pb.inputs['Base Color']; mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    if bc.is_linked: nt.links.new(bc.links[0].from_socket, mul.inputs['A'])
    else: mul.inputs['A'].default_value = bc.default_value
    comb = nt.nodes.new('ShaderNodeCombineColor'); [nt.links.new(vr.outputs['Result'], comb.inputs[i]) for i in range(3)]
    nt.links.new(comb.outputs[0], mul.inputs['B']); nt.links.new(mul.outputs['Result'], bc)
    rg = pb.inputs['Roughness']
    if not rg.is_linked:
        r0 = rg.default_value; rr = nt.nodes.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = max(0.02, r0 - 0.08); rr.inputs['To Max'].default_value = min(1.0, r0 + 0.08)
        nt.links.new(nz.outputs['Fac'], rr.inputs['Value']); nt.links.new(rr.outputs['Result'], rg)
    if not pb.inputs['Normal'].is_linked:
        fine = nt.nodes.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 40; fine.inputs['Detail'].default_value = 4
        nt.links.new(co.outputs['Object'], fine.inputs['Vector'])
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.06
        nt.links.new(fine.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], pb.inputs['Normal'])

# ---------------------------------------------------------------- the camera's flight (game coordinates)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 26; cam.data.clip_start = 0.1; cam.data.clip_end = 6000
tgt = bpy.data.objects.new('cam_target', None); sc.collection.objects.link(tgt)
tr = cam.constraints.new('TRACK_TO'); tr.target = tgt; tr.track_axis = 'TRACK_NEGATIVE_Z'; tr.up_axis = 'UP_Y'
# (time 0..1, camera position, look-at point); a y of ('g', h) means h metres above the ground there
dg = bpy.context.evaluated_depsgraph_get()
def ground(x, z):
    hit, loc, *_ = sc.ray_cast(dg, Vector((x, -z, 400)), Vector((0, 0, -1)))
    return loc.z if hit else 0.0
def pt(v): return (v[0], ground(v[0], v[2]) + v[1][1] if isinstance(v[1], tuple) else v[1], v[2])
PATH = [
    (0.00, (130, 70, 215), (-10, 12, -30)),            # high over the sea, the whole bay
    (0.20, (45, 24, 90), (-5, 4, 5)),                  # gliding in over the breakwater
    (0.36, (2, ('g', 1.7), 20.6), (-12, ('g', 0.6), 19)),    # low along the quay, past ぽっけ and ノリ
    (0.48, (30, ('g', 1.9), 20), (40, ('g', 3), -30)), # along the quay towards the foot of the street
    (0.58, (40, ('g', 2.2), -10), (40, ('g', 2.6), -60)),    # into the street, above the road
    (0.70, (40, ('g', 2.2), -52), (40, ('g', 3.2), -95)),    # up the street
    (0.78, (40, ('g', 2.4), -78), (40, ('g', 3.6), -110)),
    (0.86, (40, ('g', 3.0), -95), (10, ('g', 8), -120)),     # the plaza at the top
    (1.00, (-20, 60, -40), (-115, 30, -30)),           # rising out to the lighthouse hill and the sea
]
for t, c, l in PATH:
    f = 1 + round(t * (sc.frame_end - 1))
    cam.location = g2b(pt(c)); cam.keyframe_insert('location', frame=f)
    tgt.location = g2b(pt(l)); tgt.keyframe_insert('location', frame=f)
for ob in (cam, tgt):
    for fc in fcurves(ob):
        for k in fc.keyframe_points: k.interpolation = 'BEZIER'; k.handle_left_type = k.handle_right_type = 'AUTO_CLAMPED'

# ---------------------------------------------------------------- compositing: aerial haze from the mist pass, soft bloom
vl = sc.view_layers[0]; vl.use_pass_mist = True
sc.world.mist_settings.start = 40; sc.world.mist_settings.depth = 1400; sc.world.mist_settings.falloff = 'QUADRATIC'
# (Blender 5: the compositor is a node group with a group output; shader Mix / Math nodes work in it)
if hasattr(sc.render, 'compositor_device'): sc.render.compositor_device = 'CPU'   # no GPU / EGL here
ct = bpy.data.node_groups.new('film', 'CompositorNodeTree'); sc.compositing_node_group = ct
ct.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
rl = ct.nodes.new('CompositorNodeRLayers'); out = ct.nodes.new('NodeGroupOutput')
fm = ct.nodes.new('ShaderNodeMath'); fm.operation = 'MULTIPLY'; fm.inputs[1].default_value = 0.3
haze = ct.nodes.new('ShaderNodeMix'); haze.data_type = 'RGBA'; haze.inputs['B'].default_value = (0.55, 0.68, 0.86, 1)
ct.links.new(rl.outputs['Mist'], fm.inputs[0]); ct.links.new(fm.outputs[0], haze.inputs['Factor'])
ct.links.new(rl.outputs['Image'], haze.inputs['A'])
glare = ct.nodes.new('CompositorNodeGlare')
for k, v in (('Type', 'Bloom'), ('Threshold', 1.0), ('Strength', 0.25)):
    try: glare.inputs[k].default_value = v
    except Exception as e: print('glare', k, e)
ct.links.new(haze.outputs['Result'], glare.inputs['Image']); ct.links.new(glare.outputs[0], out.inputs[0])

# ---------------------------------------------------------------- --check: frames where the camera comes within 1.5 m of anything
if '--check' in args:
    dirs = [Vector(d).normalized() for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, -1), (0, 0, 1), (1, 1, 0), (-1, 1, 0), (1, -1, 0), (-1, -1, 0))]
    for f in range(sc.frame_start, sc.frame_end + 1):
        sc.frame_set(f); dgf = bpy.context.evaluated_depsgraph_get(); c = cam.matrix_world.translation.copy()
        near, what = 9, ''
        for d in dirs:
            hit, loc, _n, _i, ob, _m = sc.ray_cast(dgf, c, d, distance=1.5)
            if hit and (loc - c).length < near: near, what = (loc - c).length, ob.name if ob else '?'
        if near < 1.5: print(f'CLOSE frame {f}: {near:.2f} m at {tuple(round(v, 1) for v in c)} ({what})', flush=True)
    print('check done'); sys.exit(0)

# ---------------------------------------------------------------- render
OUT = os.path.join(SCENE, 'film'); os.makedirs(OUT, exist_ok=True)
if TEST:
    sc.frame_set(int(TEST)); sc.render.filepath = os.path.join(SCENE, f'film_test_{TEST}.png'); bpy.ops.render.render(write_still=True)
else:
    a, b = map(int, opt('--frames', f'{sc.frame_start}-{sc.frame_end}').split('-'))
    sc.frame_start, sc.frame_end = a, b; sc.render.filepath = os.path.join(OUT, '')
    bpy.ops.render.render(animation=True)
# then: ffmpeg -framerate 12 -i scene/film/%04d.png -vf "minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:vsbmc=1" -c:v libx264 -crf 18 -pix_fmt yuv420p scene/uminagi_film.mp4
