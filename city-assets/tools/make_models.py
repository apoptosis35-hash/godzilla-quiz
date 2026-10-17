# Big-city (大都会) model kit: skyscrapers, mid-rise blocks, roads and elevated structures, vehicles, street furniture.
# Built with Blender's Python API on top of the walled-city kit (../../kowloon-assets/tools/make_models.py),
# which itself uses the countryside kit's primitives.
#   pip install bpy pillow
#   python3 tools/make_textures.py                # facades, storefronts, roads, LED ads, signs (textures/)
#   python3 tools/make_models.py [--render] [--demo] [--hi] [names...]
# Conventions: 1 unit = 1 m, Y-up glTF, origin at the centre of the footprint on the ground, front faces +Z.
#   Road pieces are 14 m wide (4 lanes); sidewalks 4 m; elevated decks sit on their own piers (origin on the ground).
import importlib.util, json, math, os, random, sys
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
_spec = importlib.util.spec_from_file_location('kowloon_kit', os.path.join(ROOT, '..', 'kowloon-assets', 'tools', 'make_models.py'))
KW = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(KW)
K = KW.K
K.MODELS.clear()  # keep only the city models below
KW.TEXDIR = os.path.join(ROOT, 'textures')
tbox, bar, T = KW.tbox, KW.bar, KW.T  # textured box, rod, texture material
box, cyl, ico, prism, part, M = K.box, K.cyl, K.ico, K.prism, K.part, K.M

SUFFIX = '_hi' if K.HI else ''
GLB, PREVIEW = os.path.join(ROOT, 'glb' + SUFFIX), os.path.join(ROOT, 'preview' + SUFFIX)
FACADE = (12.0, 14.4)  # metres covered by one facade texture (4 bays x 4 floors)
K.PALETTE.update({
    'roof': ((0.36, 0.36, 0.35), 0.9), 'steel': ((0.55, 0.57, 0.6), 0.35, 1.0), 'steel_dark': ((0.18, 0.19, 0.21), 0.5, 0.8),
    'mullion': ((0.2, 0.22, 0.24), 0.4, 0.8), 'paint_white': ((0.88, 0.88, 0.86), 0.5), 'crane_yellow': ((0.95, 0.7, 0.05), 0.5),
    'red_light': ((1, 0.1, 0.05), 0.4, 0.0, (1.0, 0.08, 0.03), 8.0), 'led_white': ((1, 1, 1), 0.3, 0.0, (0.9, 0.95, 1.0), 6.0),
    'sig_red': ((0.9, 0.05, 0.05), 0.3, 0.0, (1.0, 0.05, 0.02), 4.0), 'sig_green': ((0.05, 0.8, 0.5), 0.3, 0.0, (0.1, 1.0, 0.6), 4.0),
    'sig_off': ((0.1, 0.1, 0.1), 0.3), 'car_red': ((0.6, 0.04, 0.05), 0.25, 0.4), 'car_blue': ((0.1, 0.18, 0.38), 0.25, 0.4),
    'car_silver': ((0.62, 0.63, 0.65), 0.25, 0.6), 'taxi': ((0.95, 0.72, 0.1), 0.3, 0.2), 'bus_body': ((0.85, 0.86, 0.84), 0.35, 0.2),
    'bus_stripe': ((0.1, 0.45, 0.25), 0.4), 'train_body': ((0.78, 0.8, 0.82), 0.3, 0.7), 'train_stripe': ((0.9, 0.45, 0.1), 0.4),
    'tire': ((0.03, 0.03, 0.03), 0.8), 'glass_car': ((0.05, 0.07, 0.1), 0.05), 'lamp_white': ((1, 1, 0.95), 0.3, 0.0, (1.0, 0.95, 0.85), 5.0),
    'brake': ((0.8, 0.05, 0.05), 0.3, 0.0, (1.0, 0.05, 0.05), 2.0), 'zebra': ((0.92, 0.92, 0.9), 0.6), 'yellow_line': ((0.95, 0.75, 0.1), 0.6),
    'barrier': ((0.72, 0.72, 0.7), 0.8), 'net': ((0.15, 0.4, 0.25), 0.9), 'konbini_a': ((0.1, 0.55, 0.35), 0.5), 'konbini_b': ((0.15, 0.35, 0.75), 0.5),
    'soil_dark': ((0.16, 0.12, 0.08), 1.0), 'hydrant': ((0.75, 0.08, 0.06), 0.45),
})

def glassy(name): return T(name, rough=0.2, metal=0.12)
def facade(name, size, loc, rot=(0, 0, 0)):
    return tbox(glassy(name) if name.startswith('glass') else T(name, rough=0.8), size, loc, rot, tile=FACADE)

def tcyl(mat, r, h, z0, verts=48, tile=FACADE):
    """Textured cylinder (round tower): UVs wrap by arc length so the facade keeps its scale."""
    import bmesh
    me = bpy.data.meshes.new('tcyl'); bm = bmesh.new(); uv = bm.loops.layers.uv.new()
    ring = [(r * math.cos(i / verts * math.tau), r * math.sin(i / verts * math.tau)) for i in range(verts)]
    lo = [bm.verts.new((x, y, z0)) for x, y in ring]; hi = [bm.verts.new((x, y, z0 + h)) for x, y in ring]
    arc = math.tau * r / verts
    for i in range(verts):
        j = (i + 1) % verts
        f = bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
        for loop, (u, v) in zip(f.loops, [(i, 0), (i + 1, 0), (i + 1, 1), (i, 1)]):
            loop[uv].uv = (u * arc / tile[0], v * h / tile[1])
    bm.faces.new(list(reversed(lo))); bm.faces.new(hi)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('tcyl', me); bpy.context.scene.collection.objects.link(o)
    return KW._take_m(o, mat, 'cyl')

def roof_cap(w, d, z, parapet=1.0):
    box('roof', (w - 0.4, d - 0.4, 0.3), (0, 0, z))
    for s in (-1, 1):
        box('roof', (w, 0.3, parapet), (0, s * (d / 2 - 0.15), z)); box('roof', (0.3, d, parapet), (s * (w / 2 - 0.15), 0, z))

def podium(w, d, h=5.0):
    """Shops at street level: storefront texture, canopy."""
    tbox(T('storefront', emit=0.6, rough=0.4), (w, d, h), (0, 0, 0), tile=(12, 6))
    box('steel_dark', (w + 1.6, d + 1.6, 0.35), (0, 0, h - 0.6))

def hvac(x, y, z, n=3):
    for i in range(n):
        box('steel', (2.4, 1.6, 1.6), (x + i * 2.8, y, z))
        cyl('steel_dark', 0.6, 0.2, (x + i * 2.8, y, z + 1.6), verts=16)

def aviation_light(x, y, z):
    cyl('steel_dark', 0.05, 0.6, (x, y, z), verts=6); ico('red_light', 0.15, (x, y, z + 0.7), sub=1)

# ================================================================= skyscrapers

@K.model('tower_glass_blue', '超高層ビル(青ガラス・150m)', '超高層ビル')
def tower_glass_blue():
    podium(40, 40, 6)
    box('steel_dark', (36, 36, 2), (0, 0, 6))
    facade('glass_blue', (30, 30, 132), (0, 0, 8))
    facade('glass_blue', (24, 24, 10), (0, 0, 140))
    for sx in (-1, 1):
        for sy in (-1, 1): box('mullion', (0.8, 0.8, 132), (sx * 15, sy * 15, 8))  # corner columns
    roof_cap(24, 24, 150, 1.5); hvac(-6, 4, 150.3)
    cyl('steel', 0.4, 18, (0, 0, 150.3), verts=8); aviation_light(0, 0, 168.3)

@K.model('tower_setback', '超高層ビル(段々の石張り・アールデコ)', '超高層ビル')
def tower_setback():
    podium(38, 38, 6)
    z = 6
    for w, h in ((32, 54), (26, 36), (20, 26), (13, 16)):
        facade('stone_office', (w, w, h), (0, 0, z)); box('roof', (w + 0.8, w + 0.8, 0.8), (0, 0, z + h)); z += h + 0.8
    for k in range(2):  # crown fins
        box('paint_white', (1.2, 13.2, 8), (0, 0, z), rot=(0, 0, k * math.pi / 2))
    prism('steel', [(-6.5, z), (0, z + 18), (6.5, z)], 13, loc=(0, 0, 0))
    prism('steel', [(-6.5, z), (0, z + 18), (6.5, z)], 13, loc=(0, 0, 0), rot=(0, 0, math.pi / 2))
    cyl('steel', 0.3, 20, (0, 0, z + 18), verts=8); aviation_light(0, 0, z + 38)

@K.model('tower_cylinder', '超高層ビル(円筒形・緑ガラス)', '超高層ビル')
def tower_cylinder():
    tcyl(T('storefront', emit=0.6, rough=0.4), 20, 6, 0, tile=(12, 6))
    tcyl(glassy('glass_green'), 16, 118, 6)
    for k in range(6): cyl('mullion', 16.15, 0.5, (0, 0, 6 + k * 23.6), verts=48)
    cyl('roof', 16, 0.4, (0, 0, 124), verts=48); cyl('steel', 10, 6, (0, 0, 124.4), verts=48, r2=8)
    cyl('steel_dark', 8.1, 0.6, (0, 0, 130.4), verts=48); aviation_light(5, 0, 131); aviation_light(-5, 0, 131)

@K.model('tower_twist', '超高層ビル(ねじれ・黒ガラス)', '超高層ビル')
def tower_twist():
    box('steel_dark', (34, 34, 6), (0, 0, 0)); tbox(T('storefront', emit=0.6, rough=0.4), (30, 30, 6), (0, 0, 0), tile=(12, 6))
    for k in range(36):
        rz = math.radians(k * 2.5)
        facade('glass_dark', (24, 24, 3.6), (0, 0, 6 + k * 3.6), rot=(0, 0, rz))
        box('steel_dark', (24.6, 24.6, 0.3), (0, 0, 6 + k * 3.6), rot=(0, 0, rz))
    i0 = len(K.CUR); roof_cap(24, 24, 6 + 36 * 3.6, 1.0)
    for o in K.CUR[i0:]: o.rotation_euler.z = math.radians(35 * 2.5)  # follow the top floor's twist
    aviation_light(0, 0, 6 + 36 * 3.6 + 0.3)

@K.model('tower_bronze', '超高層ビル(ブロンズ・斜めの頂部)', '超高層ビル')
def tower_bronze():
    podium(34, 34, 6)
    facade('glass_bronze', (26, 26, 96), (0, 0, 6))
    prism('steel', [(-13, 102), (13, 102), (13, 120), (-13, 104)], 26)  # sloped crown
    for sx in (-1, 1):
        for sy in (-1, 1): box('mullion', (0.7, 0.7, 96), (sx * 13, sy * 13, 6))  # corner columns
    aviation_light(0, 12, 120.5)

@K.model('office_mid', 'オフィスビル(コンクリート・60m)', '中層ビル')
def office_mid():
    podium(24, 18, 5)
    facade('concrete_office', (24, 18, 55), (0, 0, 5))
    roof_cap(24, 18, 60); hvac(-6, -3, 60.3, 2)
    box('steel', (5, 4, 3), (6, 4, 60.3)); aviation_light(10, 7, 60.3)

@K.model('office_brick', 'オフィスビル(れんが・36m)', '中層ビル')
def office_brick():
    podium(20, 16, 5)
    facade('brick_office', (20, 16, 31), (0, 0, 5))
    box('paint_white', (20.8, 16.8, 1.0), (0, 0, 36))  # cornice
    roof_cap(20, 16, 37, 0.6); hvac(-4, 3, 37.3, 2)

@K.model('apartment_tower', 'タワーマンション(80m)', '中層ビル')
def apartment_tower():
    box('steel_dark', (34, 16, 0.4), (0, 0, 0))
    tbox(T('storefront', emit=0.6, rough=0.4), (30, 12, 5), (0, 0, 0), tile=(12, 6))
    facade('apartment', (30, 12, 75), (0, 0, 5))
    roof_cap(30, 12, 80); box('steel', (6, 4, 4), (-8, 0, 80.3)); aviation_light(14, 5, 80.3)

@K.model('apartment_mid', 'マンション(30m)', '中層ビル')
def apartment_mid():
    facade('apartment', (20, 12, 30), (0, 0, 0))
    box('paint_white', (6, 3, 3.5), (0, -7.5, 0)); box('roof', (7, 4, 0.3), (0, -7.5, 3.5))  # entrance canopy
    roof_cap(20, 12, 30, 0.8)

@K.model('dept_store', '百貨店(大型ビジョン付き)', '中層ビル')
def dept_store():
    podium(50, 40, 6)
    facade('stone_office', (50, 40, 28), (0, 0, 6))
    tbox(T('ad0', emit=4, rough=0.3), (20, 0.4, 11.25), (-10, -20.3, 14), tile='fit')
    box('steel_dark', (21, 0.8, 12.2), (-10, -19.9, 13.5))
    tbox(T('ad1', emit=4, rough=0.3), (0.4, 14, 8), (25.3, -8, 20), tile='fit')
    roof_cap(50, 40, 34); hvac(5, 8, 34.3, 4)

@K.model('station_building', '駅ビル(シティ中央駅)', '中層ビル')
def station_building():
    facade('glass_dark', (80, 30, 18), (0, 0, 0))
    tbox(T('storefront', emit=0.6, rough=0.4), (80.2, 30.2, 5), (0, 0, 0), tile=(12, 6))
    box('steel', (40, 10, 0.6), (0, -19, 6)); [box('steel', (0.4, 0.4, 6), (x, -23.5, 0)) for x in (-19, -6, 6, 19)]
    tbox(T('sign_station', emit=3, rough=0.3), (24, 0.3, 6), (0, -15.2, 10), tile='fit')
    roof_cap(80, 30, 18, 1.2); hvac(-30, 6, 18.3, 5)

@K.model('parking_garage', '立体駐車場', '中層ビル')
def parking_garage():
    W, D = 30, 40
    for k in range(5):
        box('barrier', (W, D, 0.4), (0, 0, k * 3.2))
        if k: box('barrier', (W, 0.25, 1.0), (0, -D / 2, k * 3.2 + 0.4)); box('barrier', (0.25, D, 1.0), (W / 2, 0, k * 3.2 + 0.4))
    for x in range(-12, 13, 8):
        for y in range(-16, 17, 8): box('barrier', (0.6, 0.6, 16), (x, y, 0))
    for k in range(4): box('yellow_line', (W - 2, 0.15, 0.02), (0, -12 + k * 8, 0.4 + 3.2))
    box('konbini_b', (3, 0.3, 3), (W / 2 - 3, -D / 2 - 0.2, 14)); ico('led_white', 0.6, (W / 2 - 3, -D / 2 - 0.4, 15.5), sub=1)

@K.model('shop_row', '商店建築(3階建て)', '低層')
def shop_row():
    podium(24, 12, 4.5)
    facade('brick_office', (24, 12, 6), (0, 0, 4.5)); roof_cap(24, 12, 10.5, 0.8)
    for i in range(3): box(['konbini_a', 'car_red', 'konbini_b'][i], (7, 1.2, 0.15), (-8 + i * 8, -6.6, 3.6), rot=(-0.3, 0, 0))

@K.model('konbini', 'コンビニ(ブランドなし)', '低層')
def konbini():
    W, D, H = 16, 11, 4.2
    box('paint_white', (W, D, H), (0, 0, 0))
    for z, m in ((3.2, 'konbini_a'), (2.9, 'konbini_b')): box(m, (W + 0.1, D + 0.1, 0.3), (0, 0, z))
    tbox(T('storefront', emit=1.2, rough=0.3), (W - 2, 0.1, 2.6), (0, -D / 2 - 0.02, 0.1), tile=(12, 6))
    box('glass_car', (2.0, 0.12, 2.4), (-3, -D / 2 - 0.05, 0.1))
    box('steel', (W + 0.4, D + 0.4, 0.3), (0, 0, H))
    for i in range(3): box('paint_white', (1.0, 0.8, 1.9), (W / 2 - 2 - i * 1.1, -D / 2 - 0.5, 0))  # vending machines
    for i in range(3): box('led_white', (0.8, 0.05, 1.0), (W / 2 - 2 - i * 1.1, -D / 2 - 0.92, 0.7))

# ================================================================= towers, cranes, construction

@K.model('broadcast_tower', '電波塔(200m)', 'タワー・工事')
def broadcast_tower():
    H = 150
    legs = [Vector((math.cos(a) * 18, math.sin(a) * 18, 0)) for a in (0, 2.094, 4.189)]
    top = [Vector((math.cos(a) * 3, math.sin(a) * 3, H)) for a in (0, 2.094, 4.189)]
    for a, b in zip(legs, top): bar('car_red', a, b, 0.7, verts=8)
    for k in range(1, 15):  # bracing rings and diagonals, alternating red/white
        t0, t1 = (k - 1) / 15, k / 15
        p0 = [a.lerp(b, t0) for a, b in zip(legs, top)]; p1 = [a.lerp(b, t1) for a, b in zip(legs, top)]
        m = 'paint_white' if k % 2 else 'car_red'
        for i in range(3):
            bar(m, p1[i], p1[(i + 1) % 3], 0.25, verts=6); bar(m, p0[i], p1[(i + 1) % 3], 0.18, verts=6)
    cyl('steel', 9, 8, (0, 0, 95), verts=24); tcyl(glassy('glass_dark'), 9.2, 4, 97, verts=24, tile=(12, 4))  # observation deck
    cyl('steel', 7, 4, (0, 0, 125), verts=24)
    bar('paint_white', (0, 0, H), (0, 0, H + 50), 0.8, verts=8); aviation_light(0, 0, H + 50); aviation_light(0, 0, 104)

@K.model('tower_crane', 'タワークレーン', 'タワー・工事')
def tower_crane():
    H = 60
    for x in (-1, 1):
        for y in (-1, 1): bar('crane_yellow', (x, y, 0), (x, y, H), 0.12, verts=6)
    for k in range(int(H / 2.5)):
        z = k * 2.5
        for (a, b) in [((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))]:
            bar('crane_yellow', (*a, z), (*b, z + 2.5), 0.05, verts=4)
    box('crane_yellow', (2.6, 2.6, 3), (0, 0, H)); box('glass_car', (2.0, 0.1, 1.5), (0, -1.35, H + 1.0))
    for x0, x1, h in ((0, 50, 2.0), (0, -16, 2.0)):
        for y in (-0.9, 0.9): bar('crane_yellow', (x0, y, H + 3), (x1, y, H + 3), 0.1, verts=4)
        bar('crane_yellow', (x0, 0, H + 3 + h), (x1, 0, H + 3 + h * 0.5), 0.08, verts=4)
        for k in range(int(abs(x1 - x0) / 3)):
            xx = x0 + math.copysign(k * 3, x1)
            bar('crane_yellow', (xx, -0.9, H + 3), (xx + math.copysign(3, x1), 0, H + 3 + h * 0.8), 0.05, verts=4)
    box('barrier', (5, 3, 3), (-14, 0, H + 1)); bar('steel_dark', (0, 0, H + 3), (0, 0, H + 12), 0.15)
    for x in (25, 48): bar('steel_dark', (x, 0, H + 6), (0, 0, H + 12), 0.03, verts=4)
    bar('steel_dark', (30, 0, H + 2.8), (30, 0, H - 20), 0.03, verts=4); box('steel_dark', (1.2, 1.2, 1.0), (30, 0, H - 21))
    aviation_light(0, 0, H + 12); aviation_light(50, 0, H + 3.2)

@K.model('construction_frame', '建設中の鉄骨ビル', 'タワー・工事')
def construction_frame():
    W, n = 20, 10
    for k in range(n + 1):
        z = k * 4
        if 0 < k < n - 2: box('barrier', (W, W, 0.3), (0, 0, z - 0.3))  # poured floors; the top ones are still bare steel
        for x in range(-10, 11, 5):
            bar('steel_dark', (x, -10, z), (x, 10, z), 0.18, verts=4); bar('steel_dark', (-10, x, z), (10, x, z), 0.18, verts=4)
    for x in range(-10, 11, 5):
        for y in range(-10, 11, 5): bar('steel_dark', (x, y, 0), (x, y, n * 4), 0.22, verts=4)
    for s in (-1, 1): box('net', (W + 0.4, 0.1, 16), (0, s * 10.2, 4))  # safety netting
    for i in range(5): bar('crane_yellow', (-12, -12, i * 4), (-12, -12, i * 4 + 4), 0.06)  # hoist mast
    box('barrier', (W + 6, 0.2, 3), (0, -13, 0)); box('paint_white', (W + 6, 0.21, 0.4), (0, -13, 2.3))

# ================================================================= roads and elevated structures

@K.model('road_straight', '道路(4車線・20m)', '道路')
def road_straight():
    tbox(T('asphalt', rough=0.85), (14, 20, 0.1), (0, 0, 0), tile=6)
    for k in range(5):
        for x in (-3.5, 3.5): box('zebra', (0.15, 3, 0.012), (x, -8 + k * 4, 0.1))
    for x in (-0.15, 0.15): box('yellow_line', (0.15, 20, 0.012), (x, 0, 0.1))
    for x in (-6.7, 6.7): box('zebra', (0.15, 20, 0.012), (x, 0, 0.1))

@K.model('road_crossing', '交差点(横断歩道付き)', '道路')
def road_crossing():
    tbox(T('asphalt', rough=0.85), (14, 14, 0.1), (0, 0, 0), tile=6)
    for s in (-1, 1):
        for k in range(8):
            box('zebra', (0.5, 3.5, 0.012), (-6 + k * 1.2 + 0.6, s * 5.0, 0.1))  # along x edges
            box('zebra', (3.5, 0.5, 0.012), (s * 5.0, -6 + k * 1.2 + 0.6, 0.1))

@K.model('sidewalk', '歩道(4m・縁石つき)', '道路')
def sidewalk():
    tbox(T('pavers', rough=0.8), (4, 20, 0.2), (0, 0, 0), tile=4)
    box('barrier', (0.25, 20, 0.22), (-2.0, 0, 0))

@K.model('highway', '高架道路(40m・橋脚つき)', '道路')
def highway():
    Z = 12
    for y in (-14, 14):
        box('barrier', (3.0, 3.0, Z - 1.6), (0, y, 0)); box('barrier', (16, 3.2, 1.6), (0, y, Z - 1.6))
    box('barrier', (20, 40, 1.2), (0, 0, Z - 0.2))
    tbox(T('asphalt', rough=0.85), (18, 40, 0.05), (0, 0, Z + 1.0), tile=6)
    for s in (-1, 1): box('barrier', (0.5, 40, 1.1), (s * 9.75, 0, Z + 1.0))
    box('barrier', (0.6, 40, 0.9), (0, 0, Z + 1.0))
    for k in range(5):
        for x in (-4.5, 4.5): box('zebra', (0.15, 4, 0.01), (x, -16 + k * 8, Z + 1.05))
    for y in (-15, 5):
        bar('steel', (-9.7, y, Z + 2), (-9.7, y, Z + 11), 0.15); bar('steel', (-9.7, y, Z + 11), (-7, y, Z + 11.6), 0.1)
        box('led_white', (0.9, 0.4, 0.15), (-6.7, y, Z + 11.4))
    for s in (-1, 1): box('steel', (0.08, 40, 2.4), (s * 10.0, 0, Z + 2.1))  # noise barrier panels

@K.model('rail_viaduct', '鉄道の高架橋(40m)', '道路')
def rail_viaduct():
    Z = 9
    for y in (-15, 15): box('barrier', (2.0, 2.4, Z - 1), (0, y, 0)); box('barrier', (10, 2.6, 1.0), (0, y, Z - 1))
    box('barrier', (11, 40, 1.0), (0, 0, Z))
    for s in (-1, 1): box('barrier', (0.3, 40, 1.0), (s * 5.35, 0, Z + 1.0))
    for x0 in (-2.4, 2.4):
        tbox(T('asphalt', rough=0.9), (3.2, 40, 0.25), (x0, 0, Z + 1.0), tile=4)
        for k in range(60): box('barrier', (2.4, 0.2, 0.15), (x0, -19.7 + k * 0.67, Z + 1.25))
        for dx in (-0.55, 0.55): box('steel', (0.08, 40, 0.15), (x0 + dx, 0, Z + 1.4))
    for y in (-12, 8):  # catenary portals
        for s in (-1, 1): bar('steel_dark', (s * 5.2, y, Z + 1), (s * 5.2, y, Z + 8.5), 0.15)
        bar('steel_dark', (-5.2, y, Z + 8.5), (5.2, y, Z + 8.5), 0.1)
    for x0 in (-2.4, 2.4): bar('steel_dark', (x0, -20, Z + 6.6), (x0, 20, Z + 6.6), 0.02, verts=4)  # contact wires

@K.model('ped_bridge', '歩道橋(道路をまたぐ)', '道路')
def ped_bridge():
    L, Z = 22, 5.2
    box('paint_white', (3, L, 0.5), (0, 0, Z))
    for s in (-1, 1):
        box('steel', (0.1, L, 1.1), (s * 1.45, 0, Z + 0.5)); box('car_blue', (0.12, L, 0.15), (s * 1.45, 0, Z + 1.55))
        for x in (-1.2, 1.2): box('paint_white', (0.4, 0.4, Z), (x, s * (L / 2 - 1), 0))
        n = 26
        for i in range(n):  # stairs down at both ends, turning outward
            box('paint_white', (3, 0.32, Z / n * (i + 1)), (0, s * (L / 2 + 0.16 + 0.3 * (n - 1 - i)), 0))
        box('steel', (0.08, 8.0, 1.1), (1.5, s * (L / 2 + 4), Z / 2), rot=(s * -0.58, 0, 0))

@K.model('subway_entrance', '地下鉄の入口', '道路')
def subway_entrance():
    box('paint_white', (3.4, 7, 1.1), (0, 0, 0))
    box('soil_dark', (2.8, 6.2, 0.02), (0, 0.2, 1.1))
    for i in range(14): box('barrier', (2.8, 0.42, 0.18), (0, -2.6 + i * 0.42, 1.0 - i * 0.18 - 0.2))
    for x in (-1.6, 1.6): box('steel', (0.1, 0.1, 2.6), (x, -3.3, 1.1)); box('steel', (0.1, 0.1, 2.6), (x, 3.3, 1.1))
    box('glass_car', (3.6, 7.2, 0.15), (0, 0, 3.7)); box('steel', (3.7, 7.3, 0.08), (0, 0, 3.85))
    tbox(T('sign_subway', emit=2, rough=0.3), (2.4, 0.15, 1.2), (0, -3.5, 3.95), tile='fit')

# ================================================================= street furniture

@K.model('traffic_light', '信号機(車両・歩行者)', '街の小物')
def traffic_light():
    cyl('steel_dark', 0.14, 6.2, (0, 0, 0), verts=12)
    bar('steel_dark', (0, 0, 5.8), (0, -5.2, 5.8), 0.08)
    box('steel_dark', (0.4, 1.4, 0.45), (0, -4.6, 5.3))
    for i, m in enumerate(['sig_green', 'sig_off', 'sig_off']):
        cyl(m, 0.14, 0.06, (-0.21, -4.6 - 0.45 + i * 0.45, 5.52), rot=(0, math.pi / 2, 0), verts=16)
    box('steel_dark', (0.4, 0.4, 0.9), (0, -0.3, 2.4))
    cyl('sig_red', 0.12, 0.05, (0, -0.52, 3.05), rot=(math.pi / 2, 0, 0), verts=12); cyl('sig_off', 0.12, 0.05, (0, -0.52, 2.65), rot=(math.pi / 2, 0, 0), verts=12)
    box('paint_white', (0.25, 0.15, 0.3), (0.2, -0.1, 1.0))  # push button box

@K.model('street_light', '街灯(LED・二灯)', '街の小物')
def street_light():
    cyl('steel', 0.12, 9, (0, 0, 0), verts=12, r2=0.08)
    for s in (-1, 1):
        bar('steel', (0, 0, 8.6), (s * 2.2, 0, 9.1), 0.06); box('steel', (0.9, 0.35, 0.15), (s * 2.5, 0, 9.0)); box('led_white', (0.8, 0.28, 0.02), (s * 2.5, 0, 8.98))

@K.model('road_sign', '道路案内標識', '街の小物')
def road_sign():
    cyl('steel', 0.15, 6.5, (0, 0, 0), verts=10)
    bar('steel', (0, 0, 6.2), (0, -5, 6.2), 0.1)
    tbox(T('sign_road', emit=0.3, rough=0.4), (4.2, 0.1, 2.1), (0, -3.5, 4.2), tile='fit')

@K.model('bus_shelter', 'バス停(ガラスの屋根)', '街の小物')
def bus_shelter():
    box('steel', (4.4, 1.8, 0.12), (0, 0, 2.6)); box('glass_car', (4.2, 1.6, 0.05), (0, 0, 2.55))
    for x in (-2.1, 2.1): box('steel', (0.12, 0.12, 2.6), (x, 0.7, 0))
    box('glass_car', (4.2, 0.05, 2.2), (0, 0.8, 0.3))
    tbox(T('ad3', emit=2, rough=0.3), (0.08, 1.4, 2.0), (2.2, 0, 0.3), tile='fit')
    box('steel', (3.0, 0.4, 0.06), (-0.4, 0.5, 0.45))
    cyl('steel', 0.05, 2.8, (-2.8, -0.6, 0), verts=8); cyl('car_blue', 0.4, 0.05, (-2.8, -0.6, 2.6), verts=20, rot=(math.pi / 2, 0, 0))

@K.model('bench_city', 'ベンチ(街)', '街の小物')
def bench_city():
    for k in range(4): box('wood_light', (1.8, 0.1, 0.04), (0, -0.2 + k * 0.12, 0.45))
    for x in (-0.75, 0.75): box('steel_dark', (0.06, 0.5, 0.45), (x, 0, 0))

@K.model('tree_planter', '街路樹(植え込み)', '街の小物')
def tree_planter():
    box('barrier', (1.6, 1.6, 0.5), (0, 0, 0)); box('soil_dark', (1.4, 1.4, 0.02), (0, 0, 0.5))
    cyl('bark', 0.14, 3.2, (0, 0, 0.5), verts=8, r2=0.1)
    for i, (p, r) in enumerate([((0, 0, 4.4), 1.5), ((0.8, 0.3, 3.8), 1.0), ((-0.7, -0.3, 3.9), 1.0), ((0, 0.8, 4.0), 0.9)]):
        ico('leaf', r, p, scale=(1, 1, 0.85), sub=1, jitter=0.15, seed=i)

@K.model('fire_hydrant', '消火栓', '街の小物')
def fire_hydrant():
    cyl('hydrant', 0.16, 0.7, (0, 0, 0), verts=12); ico('hydrant', 0.17, (0, 0, 0.7), scale=(1, 1, 0.6), sub=2)
    for a in (0, math.pi): cyl('hydrant', 0.07, 0.14, (0.15 * math.cos(a), 0, 0.45), rot=(0, math.pi / 2, 0), verts=10)

@K.model('recycle_bins', '分別ゴミ箱', '街の小物')
def recycle_bins():
    for i, m in enumerate(['konbini_b', 'konbini_a', 'paint_white']):
        box(m, (0.45, 0.45, 1.0), (-0.5 + i * 0.5, 0, 0)); box('steel_dark', (0.22, 0.03, 0.08), (-0.5 + i * 0.5, -0.23, 0.82))

@K.model('vending_row', '自動販売機の列', '街の小物')
def vending_row():
    for i, m in enumerate(['car_red', 'konbini_b', 'paint_white']):
        box(m, (1.0, 0.8, 1.85), (-1.1 + i * 1.1, 0, 0)); box('led_white', (0.85, 0.04, 0.9), (-1.1 + i * 1.1, -0.42, 0.85))
        box('steel_dark', (0.7, 0.05, 0.2), (-1.1 + i * 1.1, -0.42, 0.2))

@K.model('bollards', '車止め', '街の小物')
def bollards():
    for i in range(5): cyl('steel', 0.08, 0.9, (-2 + i, 0, 0), verts=12); cyl('car_red' if i % 2 else 'zebra', 0.085, 0.08, (-2 + i, 0, 0.7), verts=12)

@K.model('big_screen', '大型ビジョン(壁掛け 12m)', '街の小物')
def big_screen():
    """Origin where it touches the wall (bottom centre); faces +Z."""
    box('steel_dark', (12.6, 0.8, 7.4), (0, -0.4, 0))
    tbox(T('ad2', emit=5, rough=0.3), (12, 0.1, 6.75), (0, -0.85, 0.3), tile='fit')

@K.model('rooftop_billboard', '屋上の看板', '屋上')
def rooftop_billboard():
    for x in (-5, 0, 5):
        bar('steel_dark', (x, 0.5, 0), (x, 0.5, 9), 0.12); bar('steel_dark', (x, 2.5, 0), (x, 0.6, 8), 0.08)
    tbox(T('ad1', emit=3, rough=0.3), (14, 0.3, 7.9), (0, 0, 4), tile='fit')
    for x in (-5, 0, 5): bar('steel_dark', (x, -1.2, 3.8), (x, 0, 3.8), 0.04); box('led_white', (0.5, 0.2, 0.1), (x, -1.2, 3.8))

@K.model('rooftop_hvac', '屋上の空調設備', '屋上')
def rooftop_hvac():
    hvac(-2.8, 0, 0, 3)
    for i in range(2): cyl('steel', 1.4, 2.6, (-1.5 + i * 3.2, 3.2, 0), verts=24, r2=1.2); cyl('steel_dark', 1.0, 0.3, (-1.5 + i * 3.2, 3.2, 2.6), verts=20)
    bar('steel', (-4, -1, 1.2), (5, -1, 1.2), 0.18)

@K.model('helipad', 'ヘリポート(屋上)', '屋上')
def helipad():
    box('barrier', (22, 22, 0.4), (0, 0, 0)); cyl('roof', 9, 0.05, (0, 0, 0.4), verts=48)
    cyl('zebra', 8.6, 0.06, (0, 0, 0.4), verts=48); cyl('roof', 8.2, 0.07, (0, 0, 0.4), verts=48)
    for x in (-2.2, 2.2): box('zebra', (0.9, 6, 0.08), (x, 0, 0.42))
    box('zebra', (4.4, 0.9, 0.08), (0, 0, 0.42))
    for k in range(12): a = k / 12 * math.tau; cyl('sig_green', 0.12, 0.15, (math.cos(a) * 10.5, math.sin(a) * 10.5, 0.4), verts=8)

# ================================================================= vehicles

def car_body(L, W, mat, roof_h=1.45, cabin=(0.25, 0.7)):
    """Sedan-like body along Y (front = -Y): lower box, glass cabin, wheels."""
    prism(mat, [(-L / 2, 0.3), (-L / 2, 0.75), (-L / 2 + 0.25, 0.95), (L / 2 - 0.2, 0.95), (L / 2, 0.8), (L / 2, 0.3)], W, axis='Y', rot=(0, 0, math.pi / 2))
    c0, c1 = -L / 2 + L * cabin[0], -L / 2 + L * cabin[1]
    prism('glass_car', [(c0, 0.94), (c0 + 0.55, roof_h), (c1 - 0.35, roof_h), (c1, 0.94)], W - 0.16, axis='Y', rot=(0, 0, math.pi / 2))
    prism(mat, [(c0 + 0.6, roof_h - 0.02), (c1 - 0.4, roof_h - 0.02), (c1 - 0.42, roof_h + 0.03), (c0 + 0.62, roof_h + 0.03)], W - 0.14, axis='Y', rot=(0, 0, math.pi / 2))
    for y in (-L / 2 + 0.75, L / 2 - 0.75):
        for s in (-1, 1): cyl('tire', 0.32, 0.22, (s * (W / 2 - 0.12) - 0.11, y, 0.32), rot=(0, math.pi / 2, 0), verts=14)
    for s in (-1, 1):
        box('lamp_white', (0.3, 0.04, 0.1), (s * (W / 2 - 0.3), -L / 2 - 0.01, 0.65)); box('brake', (0.3, 0.04, 0.1), (s * (W / 2 - 0.3), L / 2 + 0.01, 0.68))

@K.model('car_sedan', '乗用車(セダン)', '乗り物')
def car_sedan(): car_body(4.6, 1.8, 'car_silver')

@K.model('car_red', '乗用車(赤・ハッチバック)', '乗り物')
def car_red(): car_body(4.0, 1.7, 'car_red', roof_h=1.5, cabin=(0.28, 0.85))

@K.model('taxi', 'タクシー', '乗り物')
def taxi():
    car_body(4.7, 1.7, 'taxi', roof_h=1.5)
    box('paint_white', (0.5, 0.2, 0.22), (0, 0, 1.53)); box('lamp_white', (0.46, 0.21, 0.06), (0, 0, 1.6))

@K.model('city_bus', '路線バス', '乗り物')
def city_bus():
    L, W, H = 11, 2.5, 3.0
    box('bus_body', (W, L, H - 0.4), (0, 0, 0.4)); box('bus_stripe', (W + 0.02, L + 0.02, 0.35), (0, 0, 0.8))
    for s in (-1, 1):
        for i in range(6): box('glass_car', (0.04, 1.4, 1.0), (s * (W / 2 + 0.01), -3.8 + i * 1.6, 1.6))
    box('glass_car', (W - 0.2, 0.04, 1.5), (0, -L / 2 - 0.01, 1.2)); box('led_white', (1.6, 0.05, 0.25), (0, -L / 2 - 0.02, 2.75))
    box('glass_car', (0.05, 1.0, 2.2), (-W / 2 - 0.02, -3.2, 0.5)); box('glass_car', (0.05, 1.0, 2.2), (-W / 2 - 0.02, 1.0, 0.5))
    box('steel', (1.6, 2.6, 0.3), (0, 2, H))
    for y in (-3.3, 3.5):
        for s in (-1, 1): cyl('tire', 0.48, 0.3, (s * (W / 2 - 0.15) - 0.15, y, 0.48), rot=(0, math.pi / 2, 0), verts=16)
    for s in (-1, 1): box('lamp_white', (0.3, 0.04, 0.15), (s * 0.9, -L / 2 - 0.02, 0.7)); box('brake', (0.25, 0.04, 0.3), (s * 1.0, L / 2 + 0.02, 0.8))

@K.model('box_truck', 'トラック(箱型)', '乗り物')
def box_truck():
    box('paint_white', (2.3, 2.0, 2.2), (0, -2.9, 0.5)); box('glass_car', (2.1, 0.05, 0.9), (0, -3.91, 1.6))
    box('paint_white', (2.4, 5.6, 2.6), (0, 1.0, 0.9)); box('konbini_b', (2.42, 5.62, 0.3), (0, 1.0, 2.6))
    box('steel_dark', (1.6, 7.6, 0.3), (0, 0, 0.6))
    for y in (-2.9, 1.0, 2.6):
        for s in (-1, 1): cyl('tire', 0.48, 0.3, (s * 1.05 - 0.15, y, 0.48), rot=(0, math.pi / 2, 0), verts=16)
    for s in (-1, 1): box('lamp_white', (0.3, 0.04, 0.15), (s * 0.85, -3.92, 0.8))

@K.model('commuter_train', '通勤電車(1両・20m)', '乗り物')
def commuter_train():
    L, W, H = 20, 2.9, 3.6
    box('train_body', (W, L, H - 0.8), (0, 0, 0.8)); box('train_stripe', (W + 0.02, L + 0.02, 0.25), (0, 0, 1.7))
    prism('train_body', [(-W / 2, H), (-W / 2 + 0.3, H + 0.25), (W / 2 - 0.3, H + 0.25), (W / 2, H)], L - 0.2, axis='Y')
    for s in (-1, 1):
        for i in range(4):
            y = -7.5 + i * 5
            box('glass_car', (0.04, 1.3, 1.9), (s * (W / 2 + 0.01), y, 0.95))
            if i < 3: box('glass_car', (0.04, 2.6, 0.9), (s * (W / 2 + 0.01), y + 2.5, 2.0))
        box('glass_car', (W - 0.3, 0.04, 1.0), (0, s * (L / 2 + 0.01), 2.0))
        for y in (-0.9, 0.9): box('lamp_white', (0.25, 0.04, 0.12), (y, s * (L / 2 + 0.02), 1.2))
        for yb in (-L / 2 + 3, L / 2 - 3):
            box('steel_dark', (2.2, 2.8, 0.6), (0, yb, 0.25))
            for dy in (-0.9, 0.9): cyl('tire', 0.43, 0.12, (s * 0.72 - 0.06, yb + dy, 0.45), rot=(0, math.pi / 2, 0), verts=12)
    box('steel_dark', (1.2, 2.0, 0.4), (0, 4, H + 0.2))  # pantograph base
    bar('steel', (0, 3.4, H + 0.6), (0, 4.4, H + 1.6), 0.03); bar('steel', (0, 4.6, H + 0.6), (0, 4.4, H + 1.6), 0.03); box('steel', (1.6, 0.1, 0.05), (0, 4.4, H + 1.6))

# ---------------------------------------------------------------- export / preview / demo
export, bounds = KW.export, K.bounds

def setup_render():
    cam = KW.setup_render()
    bpy.data.objects['floor'].data.materials[0] = M('roof')
    return cam

def demo(out):
    """A downtown block at dusk: towers around a crossing, elevated highway, traffic. Shows how the pieces fit."""
    sc = bpy.context.scene
    for c in sc.view_layers[0].layer_collection.children: c.exclude = True
    random.seed(9)
    root = bpy.data.collections.new('demo'); sc.collection.children.link(root)
    def inst(name, loc, rz=0.0):
        o = bpy.data.objects.new(name + '_i', None); o.instance_type = 'COLLECTION'; o.instance_collection = bpy.data.collections[name]
        o.location = loc; o.rotation_euler = (0, 0, rz); root.objects.link(o)
    # street grid: a north-south avenue (x = 0) and an east-west street (y = 0)
    inst('road_crossing', (0, 0, 0))
    for k in range(1, 7):
        inst('road_straight', (0, 7 + 10 + (k - 1) * 20, 0)); inst('road_straight', (0, -17 - (k - 1) * 20, 0))
        inst('road_straight', (17 + (k - 1) * 20, 0, 0), math.pi / 2); inst('road_straight', (-17 - (k - 1) * 20, 0, 0), math.pi / 2)
    for sx in (-1, 1):
        for k in range(6):
            rz = 0 if sx > 0 else math.pi  # curb (local -X) towards the avenue
            inst('sidewalk', (sx * 9, 17 + k * 20, 0), rz)
            inst('sidewalk', (sx * 9, -17 - k * 20, 0), rz)
            inst('sidewalk', (17 + k * 20, sx * 9, 0), math.pi / 2 * sx); inst('sidewalk', (-17 - k * 20, sx * 9, 0), math.pi / 2 * sx)
    blocks = [((-36, 40), 'tower_glass_blue'), ((36, 42), 'tower_setback'), ((-34, -40), 'dept_store'), ((40, -44), 'tower_cylinder'),
              ((-90, 50), 'tower_twist'), ((90, 60), 'tower_bronze'), ((-80, -90), 'apartment_tower'), ((85, -85), 'office_mid'),
              ((0, 140), 'broadcast_tower'), ((-30, 100), 'office_brick'), ((30, 100), 'apartment_mid'), ((-130, 0), 'station_building'),
              ((130, 10), 'parking_garage'), ((-30, -100), 'construction_frame'), ((40, -110), 'shop_row'), ((-140, 90), 'tower_glass_blue'),
              ((150, 120), 'tower_setback'), ((-120, -140), 'tower_cylinder'), ((120, -150), 'tower_twist')]
    for (x, y), n in blocks: inst(n, (x, y, 0), random.choice([0, math.pi / 2, math.pi, -math.pi / 2]))
    inst('tower_crane', (-12, -100, 0), 0.6); inst('konbini', (22, 22, 0), math.pi)
    inst('highway', (-60, 0, 0), math.pi / 2); inst('highway', (-100, 0, 0), math.pi / 2); inst('highway', (-20, 0, 0), math.pi / 2)
    for (x, y, rz) in [(7.5, 7.5, 0), (-7.5, -7.5, math.pi), (7.5, -7.5, math.pi / 2), (-7.5, 7.5, -math.pi / 2)]: inst('traffic_light', (x, y, 0.2), rz)
    for y in range(-90, 100, 20):
        if abs(y) > 10: inst('street_light', (-8.0, y, 0.2)); inst('street_light', (8.0, y + 10, 0.2))
    for i, (n, x, y, rz) in enumerate([('taxi', 3.5, -30, 0), ('city_bus', -3.5, 26, math.pi), ('car_sedan', 1.5, -55, 0), ('car_red', -1.5, 48, math.pi),
                                         ('box_truck', 5.2, 60, 0), ('car_sedan', 25, -1.5, math.pi / 2), ('taxi', -40, 3.5, -math.pi / 2), ('car_red', 60, 1.5, math.pi / 2)]):
        inst(n, (x, y, 0.1), rz)
    inst('ped_bridge', (0, -28, 0), math.pi / 2); inst('bus_shelter', (9.5, 24, 0.2), math.pi / 2)
    for y in (30, 70): inst('tree_planter', (-9.5, y, 0.2)); inst('tree_planter', (9.5, -y, 0.2))
    cam = sc.camera
    sc.render.resolution_x, sc.render.resolution_y = 1280, 860
    sc.cycles.samples = 64
    cam.data.lens = 24
    cam.location = (14, -70, 22)
    cam.rotation_euler = (Vector((-6, 40, 40)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    w = sc.world; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.32, 0.42, 0.62, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    sun = bpy.data.objects['sun']; sun.data.energy = 2.5; sun.data.color = (1.0, 0.72, 0.45); sun.rotation_euler = (math.radians(78), 0, math.radians(-120))
    bpy.data.objects['floor'].location.z = -0.01
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    names = [a for a in argv if not a.startswith('--')] or list(K.MODELS)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(GLB, exist_ok=True)
    meta_path = os.path.join(ROOT, f'models{SUFFIX}.json')
    meta = {m['name']: m for m in json.load(open(meta_path))} if os.path.exists(meta_path) else {}
    objs = {}
    for n in names:
        top, meshes = objs[n] = K.build(n)
        export(top, meshes, os.path.join(GLB, n + '.glb'))
        lo, hi = bounds(meshes); ext = hi - lo
        _, jp, cat = K.MODELS[n]
        meta[n] = {'name': n, 'jp': jp, 'category': cat, 'size_m': [round(v, 2) for v in (ext.x, ext.z, ext.y)],
                   'tris': sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons),
                   'materials': sorted({m.name for o in meshes for m in o.data.materials}), 'kb': round(os.path.getsize(os.path.join(GLB, n + '.glb')) / 1024, 1)}
        print(f"{n:20s} {jp:26s} {meta[n]['tris']:6d} tris  {meta[n]['size_m']}")
    json.dump([meta[k] for k in K.MODELS if k in meta], open(meta_path, 'w'), ensure_ascii=False, indent=1)
    if '--render' in argv or '--demo' in argv: setup_render()
    if '--render' in argv:
        os.makedirs(PREVIEW, exist_ok=True)
        for n, (top, meshes) in objs.items(): KW.render(n, meshes, os.path.join(PREVIEW, n + '.jpg'))
    if '--demo' in argv: demo(os.path.join(ROOT, f'demo{SUFFIX}.jpg'))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, f'city{SUFFIX}.blend'), compress=True)
