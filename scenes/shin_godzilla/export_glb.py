# Exports shin_godzilla.blend as shin_godzilla.glb, light enough for a phone browser (iPhone Safari, AR Quick Look).
#   python3 export_glb.py
# glTF cannot carry the procedural skin shader, so the folds and red cracks are baked into vertex colours:
# a second geometry-nodes pass evaluates the same pattern (crack_net) on the rest position the skin modifier stored.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_model as mm
import bpy
import numpy as np

TARGET_TRIS = 90_000  # light enough for iPhone Safari and in-app browsers

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'shin_godzilla.blend'))
ob = bpy.data.objects['shin_godzilla']
dec = ob.modifiers.new('phone', 'DECIMATE')
ob.modifiers.move(len(ob.modifiers) - 1, 2)  # after the remesh and smooth, before the skin carving

def bake_nodes():
    ng = bpy.data.node_groups.new('bake_skin_colors', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = ng.nodes, ng.links
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    rest = N.new('GeometryNodeInputNamedAttribute'); rest.data_type = 'FLOAT_VECTOR'; rest.inputs['Name'].default_value = 'rest'
    crack, lumps, folds = mm.crack_net(ng, rest.outputs['Attribute'])
    tone = N.new('ShaderNodeMath'); tone.operation = 'MULTIPLY_ADD'  # same mix as skin_material()
    L.new(folds, tone.inputs[0]); tone.inputs[1].default_value = 0.5; L.new(lumps, tone.inputs[2])
    geo = gi.outputs['Geometry']
    for name, sock in (('crack', crack), ('tone', tone.outputs[0])):
        st = N.new('GeometryNodeStoreNamedAttribute'); st.data_type = 'FLOAT'; st.inputs['Name'].default_value = name
        L.new(geo, st.inputs['Geometry']); L.new(sock, st.inputs['Value']); geo = st.outputs['Geometry']
    L.new(geo, go.inputs['Geometry'])
    return ng

ob.modifiers.new('bake', 'NODES').node_group = bake_nodes()

# size the decimation from the remeshed face count
dec.ratio = 1.0
dg = bpy.context.evaluated_depsgraph_get()
tris = sum(len(p.vertices) - 2 for p in ob.evaluated_get(dg).data.polygons)
dec.ratio = min(1.0, TARGET_TRIS / tris)
dg = bpy.context.evaluated_depsgraph_get()
me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)

def attr(name):
    a = np.empty(len(me.vertices), np.float32); me.attributes[name].data.foreach_get('value', a); return a

crack, tone = attr('crack'), attr('tone')
# skin_material()'s colour ramp, a little brighter because a phone viewer has no emission or bounce light
t = np.clip((tone / 1.5 - 0.45) / (0.8 - 0.45), 0, 1)[:, None]
skin = (1 - t) * np.array([0.012, 0.01, 0.01]) + t * np.array([0.065, 0.06, 0.06])
c = np.clip((crack - 0.3) / 0.4, 0, 1)[:, None]
c = c * c * (3 - 2 * c)  # vertices are coarser than the shader's pixels, so keep only the cores of the cracks
rgb = (1 - c) * skin + c * np.array([0.45, 0.02, 0.01])
col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
col.data.foreach_set('color', np.hstack([rgb, np.ones((len(rgb), 1))]).astype(np.float32).ravel())
for name in ('rest', 'crack', 'tone'):
    me.attributes.remove(me.attributes[name])

m = bpy.data.materials.new('shin_skin_baked'); m.use_nodes = True
nt = m.node_tree; p = nt.nodes['Principled BSDF']
ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'
nt.links.new(ca.outputs['Color'], p.inputs['Base Color'])
p.inputs['Roughness'].default_value = 0.62
me.materials.clear(); me.materials.append(m)
me.validate(); ob.modifiers.clear(); ob.data = me

for o in list(bpy.data.objects):
    if o.type in ('CAMERA', 'LIGHT') or o.name == 'ground': bpy.data.objects.remove(o)
bpy.data.objects['rig_root'].rotation_euler = (0, 0, 0)  # face the viewer (+Z in glTF)
for o in bpy.data.objects: o.select_set(True)

out = os.path.join(HERE, 'shin_godzilla.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True,
                          export_vertex_color='ACTIVE', export_yup=True)
print('exported', out, len(me.polygons), 'faces', os.path.getsize(out) // 1024, 'KB')

import base64, struct

# a compact packed mesh for viewer/index.html, which draws it with plain WebGL (no library, no network):
# u32 nverts, u32 ntris, f32 center[3], f32 half[3]; i16 positions (normalised to the box), i8 normals, u8 sRGB colours,
# u32 triangle indices. The page is built from viewer/template.html with the data inlined as base64.
dg = bpy.context.evaluated_depsgraph_get()
P, Nn, C, I = [], [], [], []
base = 0
FIXED = {'teeth_claws': (0.55, 0.5, 0.42), 'eye': (0.01, 0.01, 0.01)}
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    m = o.evaluated_get(dg).to_mesh(); m.transform(o.matrix_world); m.calc_loop_triangles()
    n = len(m.vertices)
    co = np.empty(n * 3, np.float32); m.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    nr = np.empty(n * 3, np.float32); m.vertices.foreach_get('normal', nr); nr = nr.reshape(-1, 3)
    if 'Col' in m.color_attributes:
        cl = np.empty(n * 4, np.float32); m.color_attributes['Col'].data.foreach_get('color', cl); cl = cl.reshape(-1, 4)[:, :3]
    else:
        cl = np.tile(np.array(next(v for k, v in FIXED.items() if o.name.startswith(k)), np.float32) ** 2.2, (n, 1))
    tri = np.empty(len(m.loop_triangles) * 3, np.int64); m.loop_triangles.foreach_get('vertices', tri)
    P.append(co[:, [0, 2, 1]] * [1, 1, -1]); Nn.append(nr[:, [0, 2, 1]] * [1, 1, -1]); C.append(cl); I.append(tri + base)
    base += n
    o.evaluated_get(dg).to_mesh_clear()
P, Nn, C, I = (np.concatenate(a) for a in (P, Nn, C, I))
lo, hi = P.min(0), P.max(0); center, half = (lo + hi) / 2, (hi - lo) / 2
q = np.round((P - center) / half * 32767).astype('<i2')
nq = np.round(np.clip(Nn, -1, 1) * 127).astype('i1')
cq = np.round(np.clip(C, 0, 1) ** (1 / 2.2) * 255).astype('u1')
pad = lambda b: b + b'\0' * (-len(b) % 4)
blob = (struct.pack('<II6f', len(P), len(I) // 3, *center, *half) + pad(q.tobytes()) + pad(nq.tobytes()) + pad(cq.tobytes())
        + I.astype('<u4').tobytes())
with open(os.path.join(HERE, 'viewer', 'poster.jpg'), 'rb') as f: poster = base64.b64encode(f.read()).decode()
with open(os.path.join(HERE, 'viewer', 'template.html'), encoding='utf-8') as f: page = f.read()
page = page.replace('__MODEL_B64__', base64.b64encode(blob).decode()).replace('__POSTER_B64__', poster)
with open(os.path.join(HERE, 'viewer', 'index.html'), 'w', encoding='utf-8') as f: f.write(page)
print('viewer', len(P), 'verts', len(I) // 3, 'tris', len(page) // 1024, 'KB')
