# Turns coin_laundry.blend into a short looping clip: slow dolly into the shop, falling rain, a flickering tube.
#   python3 make_scene.py --preview   (or the full build) first, so coin_laundry.blend exists
#   python3 make_video.py [--test]     # renders frames/ with Cycles, then encodes coin_laundry.mp4 with ffmpeg
import math, os, random, subprocess, sys
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES = os.path.join(HERE, 'frames')
TEST = '--test' in sys.argv
FPS, SECONDS = 24, 8
N = FPS * SECONDS

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'coin_laundry.blend'))
scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, N
scene.render.fps = FPS

# camera: a slow push in with a slight drift to the right, like a handheld walk-in
cam = scene.camera
start, end = Vector((2.2, -0.9, 1.38)), Vector((2.55, 0.55, 1.33))
look0, look1 = Vector((3.25, 10.0, 0.82)), Vector((3.7, 10.0, 0.8))
for f in range(1, N + 1):
    k = (f - 1) / (N - 1); e = k * k * (3 - 2 * k)  # ease in-out
    cam.location = start.lerp(end, e) + Vector((0, 0, 0.012 * math.sin(f / FPS * 2.1)))
    cam.rotation_euler = (look0.lerp(look1, e) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.keyframe_insert('location', frame=f); cam.keyframe_insert('rotation_euler', frame=f)

# rain: two stacked copies of the streak field slide down and wrap every 6 m, so it falls forever
rain = bpy.data.objects['rain']
rain2 = rain.copy(); scene.collection.objects.link(rain2); rain2.location.z = 6.0
holder = bpy.data.objects.new('rain_fall', None); scene.collection.objects.link(holder)
rain.parent = holder; rain2.parent = holder
speed = 7.5  # m/s
for f in range(1, N + 1):
    holder.location.z = -((f / FPS * speed) % 6.0)
    holder.keyframe_insert('location', index=2, frame=f)

# the back fluorescent tube is on its way out: its own material and light flicker now and then
tube_mat = bpy.data.materials['tube'].copy(); tube_mat.name = 'tube_flicker'
for n in ('tube3', 'tube3.001'): bpy.data.objects[n].data.materials[0] = tube_mat
emit = tube_mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
light = bpy.data.objects['Area.003'].data
random.seed(11)
bursts = {int(FPS * t) for t in (1.6, 4.9, 6.7)}
level = 1.0
for f in range(1, N + 1):
    if any(0 <= f - b < 9 for b in bursts): level = random.choice([0.05, 0.3, 1.0, 0.1, 0.8])
    else: level = 1.0
    emit.default_value = 22 * level; light.energy = 18 * level
    emit.keyframe_insert('default_value', frame=f); light.keyframe_insert('energy', frame=f)

# render settings tuned for a CPU animation: fewer samples, fixed noise seed, reuse the scene between frames
r = scene.render
r.resolution_x, r.resolution_y, r.resolution_percentage = 1280, 720, 100
scene.camera.data.lens = 20
scene.cycles.samples = 12 if TEST else 14
scene.cycles.use_denoising = True; scene.cycles.denoiser = 'OPENIMAGEDENOISE'
scene.cycles.seed = 7; scene.cycles.use_animated_seed = False
r.use_persistent_data = True
r.use_overwrite = False; r.use_placeholder = True  # rerunning resumes where an interrupted render stopped
r.image_settings.file_format = 'PNG'
os.makedirs(FRAMES, exist_ok=True)
r.filepath = os.path.join(FRAMES, 'f_')
if TEST:
    scene.frame_set(int(N * 0.6)); r.filepath = os.path.join(HERE, 'video_test.png')
    bpy.ops.render.render(write_still=True)
    sys.exit(0)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'coin_laundry_anim.blend'), compress=True)
bpy.ops.render.render(animation=True)
subprocess.run(['ffmpeg', '-y', '-framerate', str(FPS), '-i', os.path.join(FRAMES, 'f_%04d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart', os.path.join(HERE, 'coin_laundry.mp4')], check=True)
print('wrote coin_laundry.mp4')
