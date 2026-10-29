# Grimy surfaces and shop signs for the walled-city model kit, drawn with Pillow.
#   python3 tools/make_textures.py   -> textures/*.jpg
import math, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'textures'))
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
S = 512

def noise(size, blur, seed):
    random.seed(seed)
    im = Image.effect_noise((size, size), 64).convert('L')
    return im.filter(ImageFilter.GaussianBlur(blur))

def streaks(im, seed, n=70, dark=(40, 38, 32), alpha=90):
    """Rain streaks and drip stains running down from the top and from window sills."""
    random.seed(seed)
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    for _ in range(n):
        x = random.uniform(0, S); y0 = random.choice([0, random.uniform(0, S)]); L = random.uniform(40, 300); w = random.uniform(2, 12)
        for k in range(int(L)):
            a = int(alpha * (1 - k / L) * random.uniform(0.6, 1))
            d.line([(x + math.sin(k * 0.05) * 1.5, y0 + k), (x + w + math.sin(k * 0.05) * 1.5, y0 + k)], fill=(*dark, a))
    ov = ov.filter(ImageFilter.GaussianBlur(1.5))
    out = im.convert('RGBA'); out.alpha_composite(ov); return out.convert('RGB')

def blotches(im, seed, color=(60, 55, 45), strength=0.35):
    n = noise(S, 18, seed).point(lambda v: max(0, (v - 120) * 3))
    return Image.composite(Image.blend(im, Image.new('RGB', im.size, color), strength), im, n)

def paint(base, seed):
    im = Image.new('RGB', (S, S), base)
    im = Image.blend(im, Image.merge('RGB', [noise(S, 2, seed)] * 3), 0.08)
    # peeled patches showing grey concrete
    random.seed(seed); d = ImageDraw.Draw(im)
    for _ in range(9):
        x, y, r = random.uniform(0, S), random.uniform(0, S), random.uniform(6, 30)
        d.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=(118, 116, 108))
    im = blotches(im, seed + 1)
    return streaks(im, seed + 2)

def concrete(seed):
    im = Image.merge('RGB', [noise(S, 1.2, seed).point(lambda v: 90 + v // 3)] * 3)
    im = Image.blend(im, Image.new('RGB', im.size, (128, 124, 114)), 0.5)
    return streaks(blotches(im, seed + 1, (50, 48, 40), 0.45), seed + 2, 90)

def mosaic(seed, a=(214, 220, 222), b=(170, 196, 214)):
    random.seed(seed)
    im = Image.new('RGB', (S, S), (120, 120, 116)); d = ImageDraw.Draw(im)
    t = 16
    for i in range(S // t):
        for j in range(S // t):
            c = a if random.random() < 0.7 else b
            c = tuple(max(0, min(255, v + random.randint(-14, 8))) for v in c)
            if random.random() < 0.02: continue  # missing tiles
            d.rectangle([i * t + 1, j * t + 1, i * t + t - 2, j * t + t - 2], fill=c)
    return streaks(blotches(im, seed + 1, (70, 64, 50), 0.4), seed + 2, 80)

def rust(seed):
    """Corrugated tin: stripes plus orange-brown rust bleeding down."""
    im = Image.new('RGB', (S, S), (120, 124, 126)); d = ImageDraw.Draw(im)
    for x in range(0, S, 16):
        d.rectangle([x, 0, x + 7, S], fill=(146, 150, 152)); d.line([x + 8, 0, x + 8, S], fill=(80, 82, 84), width=2)
    r = noise(S, 10, seed).point(lambda v: max(0, (v - 110) * 4))
    im = Image.composite(Image.new('RGB', im.size, (128, 66, 32)), im, r)
    return streaks(im, seed + 1, 60, (90, 45, 20), 120)

def shutter(seed):
    im = Image.new('RGB', (S, S), (150, 150, 146)); d = ImageDraw.Draw(im)
    for y in range(0, S, 12):
        d.rectangle([0, y, S, y + 9], fill=(160, 160, 155)); d.line([0, y + 10, S, y + 10], fill=(90, 90, 88), width=2)
    random.seed(seed)
    for _ in range(6):  # graffiti-ish scribbles and posters
        x, y = random.uniform(20, 400), random.uniform(20, 400)
        d.rectangle([x, y, x + random.uniform(40, 90), y + random.uniform(50, 100)], fill=random.choice([(220, 210, 180), (200, 60, 50), (240, 240, 230)]))
    return streaks(blotches(im, seed + 2, (60, 55, 45), 0.4), seed + 3, 50)

SHOPS = [('牙科', (255, 60, 70)), ('診所', (90, 200, 255)), ('麵家', (255, 200, 60)), ('冰室', (120, 255, 160)), ('士多', (255, 120, 220)), ('理髮', (255, 255, 255)),
         ('五金', (255, 150, 40)), ('洗衣', (110, 180, 255)), ('粥麵', (255, 90, 90)), ('跌打', (255, 230, 90)), ('茶餐廳', (255, 110, 70)), ('旅館', (180, 140, 255))]

def sign(text, color, vertical, seed):
    """Neon-style sign: coloured characters with a glow on a dark board (used for emission too)."""
    w, h = (256, 768) if vertical else (768, 256)
    im = Image.new('RGB', (w, h), (20, 18, 22)); d = ImageDraw.Draw(im)
    d.rectangle([6, 6, w - 7, h - 7], outline=color, width=6)
    f = ImageFont.truetype(FONT, 190 if vertical else 170)
    glow = Image.new('RGB', (w, h), (0, 0, 0)); g = ImageDraw.Draw(glow)
    for dd in (g, d):
        if vertical:
            step = (h - 60) / len(text)
            for i, ch in enumerate(text): dd.text((w / 2 - 95, 30 + i * step), ch, font=f, fill=color)
        else:
            tw = d.textlength(text, font=f); dd.text(((w - tw) / 2, 30), text, font=f, fill=color)
    im = ImageChops.add(im, glow.filter(ImageFilter.GaussianBlur(12)))
    return im

def letterbox():
    im = Image.new('RGB', (S, S), (90, 96, 92)); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT, 22)
    for i in range(6):
        for j in range(8):
            x, y = 12 + i * 82, 12 + j * 62
            d.rectangle([x, y, x + 74, y + 54], fill=(150, 156, 150)); d.rectangle([x + 18, y + 8, x + 56, y + 16], fill=(30, 30, 30))
            d.text((x + 6, y + 26), f'{j + 1}{chr(65 + i)}', font=f, fill=(30, 30, 30))
    return streaks(im, 3, 30)

def window_lit(seed):
    """Interior seen through a lit window: warm light, curtain, shelf silhouettes."""
    random.seed(seed)
    base = random.choice([(255, 214, 150), (230, 240, 255), (255, 190, 120), (200, 255, 220)])
    im = Image.new('RGB', (128, 128), base); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, random.randint(20, 60), 128], fill=tuple(int(v * 0.6) for v in base))  # curtain
    for _ in range(3): d.rectangle([random.randint(40, 100), random.randint(40, 110), random.randint(100, 128), 128], fill=tuple(int(v * 0.35) for v in base))
    return im.filter(ImageFilter.GaussianBlur(1.5))

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    save = lambda im, n: im.save(os.path.join(OUT, n + '.jpg'), quality=82)
    save(concrete(1), 'concrete'); save(concrete(7), 'concrete_dark')
    for n, c, s in (('paint_green', (150, 178, 150), 11), ('paint_pink', (196, 150, 146), 12), ('paint_cream', (206, 196, 162), 13), ('paint_blue', (140, 166, 180), 14)):
        save(paint(c, s), n)
    save(mosaic(21), 'mosaic'); save(mosaic(22, (220, 210, 190), (190, 170, 150)), 'mosaic_beige')
    save(rust(31), 'rust_tin'); save(shutter(41), 'shutter'); save(letterbox(), 'letterbox')
    for i, (t, c) in enumerate(SHOPS):
        save(sign(t, c, i % 2 == 0 and i < 10, i), f'sign{i}')  # 0-9 alternate; 茶餐廳 and 旅館 are horizontal
    for i in range(4): save(window_lit(i), f'window_lit{i}')
    print('textures ok')
