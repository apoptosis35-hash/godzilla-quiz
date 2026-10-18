# App icons: the red breakwater lighthouse and the fishing boat on a blue sea, rendered with Blender.
#   pip install bpy pillow ; python3 uminagi/tools/make_icons.py
import math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '../../uminagi-assets/tools'))
sys.argv = [sys.argv[0]]
import bpy
from mathutils import Vector
from PIL import Image
import make_models as mm

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
for n, loc, rz in (('lighthouse_red', (-3.2, 4.0, 0.6), 0.0), ('fishing_boat', (2.2, -1.0, 0.0), math.radians(-35))):
    top, meshes, lod = mm.build(n)
    if lod: bpy.data.objects.remove(lod)
    top.location = loc; top.rotation_euler = (0, 0, rz)
sea = bpy.data.objects.new('sea', bpy.data.meshes.new('sea')); sc.collection.objects.link(sea)
import bmesh
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=200); bm.to_mesh(sea.data); bm.free()
m = bpy.data.materials.new('sea'); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']
p.inputs['Base Color'].default_value = (0.02, 0.18, 0.38, 1); p.inputs['Roughness'].default_value = 0.15
sea.data.materials.append(m)
sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.use_denoising = True
sc.render.resolution_x = sc.render.resolution_y = 1024
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.35, 0.62, 0.95, 1); bg.inputs['Strength'].default_value = 1.0
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 4; sun.rotation_euler = (0.8, 0.2, -0.9); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.lens = 40; sc.collection.objects.link(cam); sc.camera = cam
cam.location = (9.5, -15.5, 6.5)
d = Vector((-0.6, 1.0, 4.2)) - cam.location
cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
out = os.path.join(HERE, '../icons'); os.makedirs(out, exist_ok=True)
sc.render.filepath = os.path.join(out, '_render.png'); bpy.ops.render.render(write_still=True)
im = Image.open(sc.render.filepath).convert('RGB')
for size, name in ((512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'icon-180.png')):
    im.resize((size, size), Image.LANCZOS).save(os.path.join(out, name))
# maskable: keep the subject inside the central safe zone
pad = Image.new('RGB', (1024, 1024), im.getpixel((5, 5)))
pad.paste(im.resize((820, 820), Image.LANCZOS), (102, 102)); pad.resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'icon-maskable-512.png'))
os.remove(sc.render.filepath)
print('icons written')
