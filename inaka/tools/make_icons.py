# Renders the app icon from the stock models with Blender, then writes the PWA icon sizes.
#   python3 tools/make_icons.py   (needs: pip install bpy pillow)
import math, os
import bpy
from mathutils import Vector
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GLB = os.path.normpath(os.path.join(HERE, '..', '..', 'inaka-assets', 'glb'))
OUT = os.path.normpath(os.path.join(HERE, '..', 'icons'))

bpy.ops.wm.read_factory_settings(use_empty=True)
def imp(name, loc, rz=0.0, s=1.0):
    bpy.ops.import_scene.gltf(filepath=os.path.join(GLB, name + '.glb'))
    for o in bpy.context.selected_objects:
        if o.parent is None: o.location = loc; o.rotation_euler = (0, 0, rz); o.scale = (s, s, s)
imp('kodomo', (0, 0, 0), math.radians(-20))
imp('himawari', (1.3, 2.6, 0), 0.3)
imp('himawari', (-1.6, 3.0, 0), 2.0)
imp('suika', (0.45, -0.35, 0), 0.4, 1.3)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = 64; sc.cycles.use_denoising = True
sc.render.resolution_x = sc.render.resolution_y = 1024
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.35, 0.65, 0.95, 1)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50
cam.location = (0.9, -3.0, 1.2)
cam.rotation_euler = (Vector((0, 0, 0.85)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 4; sun.rotation_euler = (0.8, 0.2, -0.6); sc.collection.objects.link(sun)
bpy.ops.mesh.primitive_plane_add(size=40)
g = bpy.data.materials.new('g'); g.use_nodes = True; g.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.3, 0.55, 0.18, 1)
bpy.context.object.data.materials.append(g)
os.makedirs(OUT, exist_ok=True)
src = os.path.join(OUT, '_render.png'); sc.render.filepath = src
bpy.ops.render.render(write_still=True)
im = Image.open(src).convert('RGB')
for s in (180, 192, 512): im.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f'icon-{s}.png'))
mk = Image.new('RGB', (1024, 1024), (90, 166, 242)); mk.paste(im.resize((820, 820), Image.LANCZOS), (102, 102))
mk.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon-maskable-512.png'))
os.remove(src)
