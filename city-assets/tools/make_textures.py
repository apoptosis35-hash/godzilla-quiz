# Facades, storefronts, road surfaces and LED-screen ads for the big-city kit, drawn with Pillow.
#   python3 tools/make_textures.py   -> textures/*.jpg
# A facade texture covers 4 window bays x 4 floors (12 m x 14.4 m); the models tile it at that size.
import os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'textures'))
JP = '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
S = 512
BX, FY = S // 4, S // 4  # one bay x one floor in pixels

def jitter(c, k=10): return tuple(max(0, min(255, v + random.randint(-k, k))) for v in c)

def glass(seed, tint, frame, lit_p=0.0, spandrel=None):
    """Curtain wall: glass panes reflecting a sky gradient, mullions, optional spandrel bands and lit offices."""
    random.seed(seed)
    im = Image.new('RGB', (S, S)); d = ImageDraw.Draw(im)
    for y in range(S):  # sky reflection gradient, a little different on each floor
        k = (y % FY) / FY
        d.line([0, y, S, y], fill=tuple(int(t * (0.75 + 0.35 * (1 - k))) for t in tint))
    for fy in range(4):
        for bx in range(4):
            x0, y0 = bx * BX, fy * FY
            if random.random() < lit_p:
                d.rectangle([x0 + 4, y0 + 22, x0 + BX - 4, y0 + FY - 6], fill=jitter((236, 228, 200), 12))
                d.rectangle([x0 + 4, y0 + FY - 30, x0 + BX - 4, y0 + FY - 6], fill=(120, 110, 96))  # desks
            for _ in range(2):  # blinds partly down
                if random.random() < 0.35: d.rectangle([x0 + 4, y0 + 18, x0 + BX - 4, y0 + 18 + random.randint(10, 60)], fill=jitter((200, 200, 196), 8))
            if spandrel: d.rectangle([x0, y0, x0 + BX, y0 + 18], fill=spandrel)
            d.rectangle([x0, y0, x0 + 3, y0 + FY], fill=frame); d.rectangle([x0 + BX // 2 - 1, y0 + 18, x0 + BX // 2 + 1, y0 + FY], fill=frame)
            d.rectangle([x0, y0 + 16, x0 + BX, y0 + 19], fill=frame)
    hl = Image.new('L', (S, S), 0); hd = ImageDraw.Draw(hl)  # diagonal sky highlight streak
    hd.polygon([(S * 0.1, 0), (S * 0.45, 0), (S * 0.15, S), (-S * 0.2, S)], fill=50)
    im = Image.composite(Image.new('RGB', (S, S), (230, 240, 250)), im, hl.filter(ImageFilter.GaussianBlur(30)))
    return im

def punched(seed, wall, win=(40, 52, 64), lit_p=0.0, balcony=False):
    """Masonry / concrete facade with punched windows (offices or apartments)."""
    random.seed(seed)
    im = Image.new('RGB', (S, S), wall); d = ImageDraw.Draw(im)
    n = Image.effect_noise((S, S), 30).convert('L').filter(ImageFilter.GaussianBlur(1))
    im = Image.composite(Image.new('RGB', (S, S), tuple(int(v * 0.88) for v in wall)), im, n.point(lambda v: 255 if v > 140 else 0))
    d = ImageDraw.Draw(im)
    for fy in range(4):
        for bx in range(4):
            x0, y0 = bx * BX, fy * FY
            c = jitter((236, 222, 180), 15) if random.random() < lit_p else jitter(win, 6)
            if balcony:
                d.rectangle([x0 + 8, y0 + 14, x0 + BX - 8, y0 + FY - 34], fill=c)
                d.rectangle([x0, y0 + FY - 34, x0 + BX, y0 + FY - 4], fill=tuple(int(v * 0.8) for v in wall))  # balcony slab + parapet
                d.line([x0, y0 + FY - 34, x0 + BX, y0 + FY - 34], fill=(70, 70, 70), width=2)
                if random.random() < 0.3:  # laundry / AC unit on the balcony
                    d.rectangle([x0 + 20, y0 + FY - 52, x0 + 50, y0 + FY - 34], fill=jitter((200, 200, 190)))
            else:
                d.rectangle([x0 + 22, y0 + 26, x0 + BX - 22, y0 + FY - 26], fill=c)
                d.rectangle([x0 + 18, y0 + FY - 26, x0 + BX - 18, y0 + FY - 20], fill=tuple(int(v * 0.75) for v in wall))  # sill
                d.line([x0 + BX // 2, y0 + 26, x0 + BX // 2, y0 + FY - 26], fill=(150, 150, 150), width=2)
    return im

def storefront(seed):
    """Ground-floor shops: glass fronts, warm interiors, awnings and small signs (generic words only)."""
    random.seed(seed)
    im = Image.new('RGB', (S, S // 2), (70, 70, 72)); d = ImageDraw.Draw(im); f = ImageFont.truetype(JP, 26)
    words = ['カフェ', 'ベーカリー', '薬局', '書店', '花屋', 'ラーメン', '雑貨', 'メガネ']
    for i in range(4):
        x0 = i * BX
        col = random.choice([(200, 60, 50), (40, 90, 160), (40, 130, 80), (220, 160, 40), (60, 60, 60)])
        d.rectangle([x0 + 4, 10, x0 + BX - 4, 54], fill=col); d.text((x0 + 10, 18), random.choice(words), font=f, fill='white')
        d.rectangle([x0 + 6, 62, x0 + BX - 6, S // 2 - 6], fill=jitter((236, 214, 170), 16))
        for k in range(3): d.rectangle([x0 + 14 + k * 36, 150, x0 + 40 + k * 36, S // 2 - 6], fill=jitter((150, 110, 80), 30))  # shelves / people
        d.rectangle([x0 + 6, 62, x0 + 9, S // 2], fill=(40, 40, 40)); d.line([x0 + 6, 62, x0 + BX - 6, 62], fill=(40, 40, 40), width=3)
    return im

def ad(seed, title, sub, colors):
    """Generic LED-screen advert (no real brands)."""
    random.seed(seed)
    w, h = 768, 432
    im = Image.new('RGB', (w, h), colors[0]); d = ImageDraw.Draw(im)
    for i in range(12):
        x, y, r = random.uniform(0, w), random.uniform(0, h), random.uniform(30, 160)
        d.ellipse([x - r, y - r, x + r, y + r], fill=random.choice(colors[1:]))
    im = im.filter(ImageFilter.GaussianBlur(18)); d = ImageDraw.Draw(im)
    d.text((40, 120), title, font=ImageFont.truetype(JP, 110), fill='white')
    d.text((44, 280), sub, font=ImageFont.truetype(JP, 48), fill=(255, 255, 255))
    for y in range(0, h, 6): d.line([0, y, w, y], fill=tuple(int(v * 0.6) for v in colors[0]), width=1)  # LED scanlines
    return im

def asphalt(seed):
    random.seed(seed)
    n = Image.effect_noise((S, S), 40).convert('L').point(lambda v: 50 + v // 5)
    im = Image.merge('RGB', [n, n, n.point(lambda v: v + 3)])
    patch = Image.effect_noise((S, S), 60).convert('L').filter(ImageFilter.GaussianBlur(25)).point(lambda v: 255 if v > 150 else 0)
    return Image.composite(Image.new('RGB', (S, S), (48, 48, 50)), im, patch)

def pavers(seed):
    random.seed(seed)
    im = Image.new('RGB', (S, S), (120, 118, 112)); d = ImageDraw.Draw(im)
    t = 64
    for i in range(S // t):
        for j in range(S // t):
            g = random.randint(-12, 10); d.rectangle([i * t + 2, j * t + 2, i * t + t - 2, j * t + t - 2], fill=(172 + g, 168 + g, 158 + g))
    for i in range(S // t): d.rectangle([3 * t + 8, i * t + 4, 4 * t - 8, i * t + t - 4], fill=(222, 188, 40))  # tactile paving
    return im

def board(text, sub, size, bg, fg=(255, 255, 255), fs=110):
    im = Image.new('RGB', size, bg); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(JP, fs); tw = d.textlength(text, font=f)
    d.text(((size[0] - tw) / 2, size[1] * 0.18), text, font=f, fill=fg)
    if sub:
        f2 = ImageFont.truetype(JP, fs // 3); tw = d.textlength(sub, font=f2); d.text(((size[0] - tw) / 2, size[1] * 0.68), sub, font=f2, fill=fg)
    return im

def road_sign():
    im = Image.new('RGB', (768, 384), (20, 70, 160)); d = ImageDraw.Draw(im); f = ImageFont.truetype(JP, 60); f2 = ImageFont.truetype(JP, 34)
    d.rectangle([8, 8, 760, 376], outline='white', width=6)
    d.polygon([(384, 40), (340, 110), (370, 110), (370, 200), (398, 200), (398, 110), (428, 110)], fill='white')
    d.text((300, 210), '都心', font=f, fill='white'); d.text((40, 260), '← 港', font=f, fill='white'); d.text((560, 260), '空港 →', font=f, fill='white')
    d.text((330, 300), 'Downtown', font=f2, fill='white')
    return im

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    save = lambda im, n: im.save(os.path.join(OUT, n + '.jpg'), quality=84)
    save(glass(1, (90, 130, 170), (40, 46, 52), 0.12), 'glass_blue')
    save(glass(2, (90, 140, 130), (190, 196, 200), 0.1, spandrel=(170, 176, 180)), 'glass_green')
    save(glass(3, (60, 66, 80), (24, 26, 30), 0.2, spandrel=(30, 32, 36)), 'glass_dark')
    save(glass(4, (150, 130, 100), (120, 96, 60), 0.15, spandrel=(150, 120, 80)), 'glass_bronze')
    save(punched(5, (198, 190, 176), lit_p=0.2), 'stone_office')
    save(punched(6, (166, 92, 70), lit_p=0.2), 'brick_office')
    save(punched(7, (214, 210, 200), lit_p=0.25, balcony=True), 'apartment')
    save(punched(8, (150, 150, 146), lit_p=0.1), 'concrete_office')
    save(storefront(9), 'storefront')
    for i, (t, s, c) in enumerate([('新発売', 'NEW ARRIVAL', [(20, 30, 90), (220, 40, 120), (40, 200, 255)]), ('SALE', '50%OFF 今週末まで', [(200, 20, 30), (255, 200, 0), (255, 90, 0)]),
                                   ('CITY LIVE', '今夜 19:00 開演', [(10, 10, 20), (120, 40, 255), (0, 220, 200)]), ('24H OPEN', 'いつでも、ここに。', [(0, 90, 60), (0, 200, 120), (230, 255, 120)])]):
        save(ad(i, t, s, c), f'ad{i}')
    save(asphalt(10), 'asphalt'); save(pavers(11), 'pavers')
    save(board('シティ中央駅', 'CITY CENTRAL STATION', (1024, 256), (30, 40, 60), fs=120), 'sign_station')
    save(board('地下鉄', 'SUBWAY', (512, 256), (0, 110, 70)), 'sign_subway')
    save(road_sign(), 'sign_road')
    print('textures ok')
