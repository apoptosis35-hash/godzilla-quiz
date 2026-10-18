# High-quality stills of the whole town with Cycles (path tracing, physical sky, depth of field off, denoised).
#   python3 tools/assemble_town.py          (once: scene/uminagi_town.blend)
#   python3 tools/render_town.py [--samples 128] [--size 1920x1080] [view names...]
# Writes scene/render_<view>.jpg. Camera positions are given in game (three.js) coordinates and converted here.
import math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); SCENE = os.path.join(ROOT, 'scene')
args = sys.argv[1:]
def opt(name, default):
    return args[args.index(name) + 1] if name in args else default
SAMPLES = int(opt('--samples', '96')); W, H = map(int, opt('--size', '1920x1080').split('x'))
names = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or not args[i - 1].startswith('--'))]
import bpy
from mathutils import Vector

# name: (camera xyz, target xyz) in game coordinates (+X east, +Y up, +Z south), lens mm, sun (elevation, azimuth) degrees
VIEWS = {
    'overview': ((95, 55, 175), (-25, 12, -35), 32, (38, 135)),
    'harbour': ((-40, 7, 40), (5, 4, 0), 30, (40, 150)),
    'street': ((40, 6.5, -4), (40, 8, -60), 28, (55, 120)),
    'terraces': ((10, 22, -20), (-20, 8, -70), 30, (45, 140)),
    'hill': ((-60, 45, 20), (-120, 30, -20), 30, (35, 160)),
    'evening': ((95, 55, 175), (-25, 12, -35), 32, (6, 250)),
}
names = names or list(VIEWS)
bpy.ops.wm.open_mainfile(filepath=os.path.join(SCENE, 'uminagi_town.blend'))
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.cycles.max_bounces = 6; sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 92
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast' if 'AgX - Medium High Contrast' in [l.identifier for l in sc.view_settings.bl_rna.properties['look'].enum_items] else 'None'

# sea: a large glossy, slightly rippled water plane at y = 0
sea = bpy.data.objects.new('sea', bpy.data.meshes.new('sea')); sc.collection.objects.link(sea)
import bmesh
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=3000); bm.to_mesh(sea.data); bm.free()
m = bpy.data.materials.new('sea_water'); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
p.inputs['Base Color'].default_value = (0.01, 0.07, 0.12, 1); p.inputs['Roughness'].default_value = 0.04
p.inputs['Transmission Weight'].default_value = 0.6; p.inputs['IOR'].default_value = 1.333
tex = nt.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = 0.6; tex.inputs['Detail'].default_value = 6
bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.12
nt.links.new(tex.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
sea.data.materials.append(m)

world = bpy.data.worlds.new('sky'); sc.world = world; world.use_nodes = True
sky = world.node_tree.nodes.new('ShaderNodeTexSky')
sky.sky_type = 'NISHITA' if 'NISHITA' in [e.identifier for e in sky.bl_rna.properties['sky_type'].enum_items] else sky.sky_type
world.node_tree.links.new(sky.outputs['Color'], world.node_tree.nodes['Background'].inputs['Color'])
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.12
sc.view_settings.exposure = -0.6
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.angle = math.radians(0.6); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.clip_end = 4000

def g2b(v):  # game (x, y-up, z-south) -> Blender (x, -z, y)
    return Vector((v[0], -v[2], v[1]))

for n in names:
    (c, t, lens, (elev, az)) = VIEWS[n]
    cam.location = g2b(c); cam.rotation_euler = (g2b(t) - g2b(c)).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = lens
    if hasattr(sky, 'sun_elevation'):
        sky.sun_elevation = math.radians(elev); sky.sun_rotation = math.radians(az)
    sun.rotation_euler = (math.radians(90 - elev), 0, math.radians(az + 90))
    sun.data.energy = 3.2 if elev > 15 else 2.0
    sun.data.color = (1.0, 0.97, 0.92) if elev > 15 else (1.0, 0.62, 0.38)
    sc.render.filepath = os.path.join(SCENE, f'render_{n}.jpg')
    bpy.ops.render.render(write_still=True)
    print('rendered', n, flush=True)
