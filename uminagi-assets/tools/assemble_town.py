# Rebuilds the whole Uminagi town in Blender from the game's exported layout:
#   scene/ground.glb       generated ground (terrain, terraces, walls, stairs, quays) exported from the game
#   scene/placements.json  every model placement (position, rotation, scale) exported from the game
# Each kit model is built once with make_models.py (the same code that writes glb/) and placed as linked
# collection instances, so the .blend stays small and editable.
#   node ../uminagi/tools/export_scene.mjs      (writes the two files above; needs the game served over http)
#   python3 tools/assemble_town.py [--glb]      -> scene/uminagi_town.blend (+ scene/uminagi_town.glb with --glb)
import json, math, os, sys
sys.argv = [sys.argv[0]] + [a for a in sys.argv[1:]]
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); SCENE = os.path.join(ROOT, 'scene')
sys.path.insert(0, HERE)
import bpy
from mathutils import Matrix, Euler, Vector
import make_models as mm

data = json.load(open(os.path.join(SCENE, 'placements.json')))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
kit = bpy.data.collections.new('kit'); scene.collection.children.link(kit)
town = bpy.data.collections.new('town'); scene.collection.children.link(town)
names = sorted({p['model'] for p in data['placements']})
protos = {}
for n in names:
    top, meshes, lod = mm.build(n)
    col = bpy.data.collections[n]
    scene.collection.children.unlink(col); kit.children.link(col)
    if lod: bpy.data.objects.remove(lod)
    protos[n] = col
    print('built', n, flush=True)
# the kit stays out of the render / view layer; the town uses instances of it
for c in bpy.context.view_layer.layer_collection.children['kit'].children: c.exclude = True
# ground from the game (glTF Y-up -> Blender Z-up handled by the importer)
bpy.ops.import_scene.gltf(filepath=os.path.join(SCENE, 'ground.glb'))
for o in bpy.context.selected_objects:
    for c in o.users_collection: c.objects.unlink(o)
    town.objects.link(o)
# glTF (x, y, z) -> Blender (x, -z, y); rotations about glTF Y become rotations about Blender Z
for i, p in enumerate(data['placements']):
    x, y, z = p['p']; rx, ry, rz = p['r']
    inst = bpy.data.objects.new(f"{p['model']}.{i:04d}", None)
    inst.instance_type = 'COLLECTION'; inst.instance_collection = protos[p['model']]
    m = Matrix.Translation((x, -z, y)) @ Euler((0, 0, ry), 'XYZ').to_matrix().to_4x4() @ Euler((rx, -rz, 0), 'XYZ').to_matrix().to_4x4() @ Matrix.Scale(p['s'], 4)
    inst.matrix_world = m
    town.objects.link(inst)
print(len(data['placements']), 'instances')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SCENE, 'uminagi_town.blend'), compress=True)
if '--glb' in sys.argv:
    bpy.context.view_layer.update()
    for o in bpy.context.view_layer.objects: o.select_set(o.name in town.objects)
    bpy.ops.export_scene.gltf(filepath=os.path.join(SCENE, 'uminagi_town.glb'), export_format='GLB', use_selection=True, export_gpu_instances=True,
                              export_apply=True, export_yup=True, export_image_format='NONE', export_cameras=False, export_lights=False)
