# Sign / panel textures for the coin laundry scene, drawn with Pillow and the IPA Gothic font.
import os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'textures')
FONT = next(p for p in ['/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf', '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf'] if os.path.exists(p))
F = lambda s: ImageFont.truetype(FONT, s)
BLUE, NAVY, WHITE, INK = (32, 74, 150), (20, 40, 90), (246, 246, 240), (25, 25, 30)

def aged(im, k=0.06):
    """Slight yellowing and grime so nothing looks brand new."""
    g = Image.effect_noise(im.size, 40).convert('L').filter(ImageFilter.GaussianBlur(6))
    tint = Image.new('RGB', im.size, (225, 215, 180))
    return Image.composite(Image.blend(im, tint, k * 2), im, g.point(lambda v: 255 if v > 150 else int(v * 0.6)))

def usage():
    im = Image.new('RGB', (800, 1100), WHITE); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 800, 150], fill=BLUE); d.text((40, 38), '洗濯機の使い方', font=F(78), fill='white')
    d.rectangle([6, 6, 794, 1094], outline=BLUE, width=10)
    for i, t in enumerate(['洗濯物を入れる', 'コースを選ぶ', '料金を入れる', 'スタートを押す', '終了後、すぐに取り出す']):
        y = 210 + i * 175
        d.ellipse([40, y, 140, y + 100], fill=NAVY); d.text((70, y + 10), str(i + 1), font=F(78), fill='white')
        d.text((165, y + 22), t, font=F(56), fill=INK)
    return aged(im)

def prices():
    im = Image.new('RGB', (800, 1000), WHITE); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 800, 150], fill=BLUE); d.text((250, 38), '料金表', font=F(84), fill='white')
    d.rectangle([6, 6, 794, 994], outline=BLUE, width=10)
    rows = [('洗濯のみ', '12kg', '400円'), ('洗濯+乾燥', '12kg', '600円'), ('乾燥のみ', '14kg', '100円')]
    for i, (a, b, c) in enumerate(rows):
        y = 230 + i * 240
        d.text((40, y), a, font=F(60), fill=INK); d.text((370, y + 4), b, font=F(56), fill=INK); d.text((560, y), c, font=F(64), fill=INK)
        d.line([30, y + 150, 770, y + 150], fill=(180, 190, 210), width=4)
    d.text((610, 790), '/10分', font=F(48), fill=INK)
    return aged(im)

def label(text, size=(600, 200), fg=INK, bg=WHITE, fs=120, vertical=False, border=None):
    im = Image.new('RGB', size, bg); d = ImageDraw.Draw(im)
    if border: d.rectangle([4, 4, size[0] - 5, size[1] - 5], outline=border, width=8)
    if vertical:
        for i, ch in enumerate(text): d.text((size[0] / 2 - fs / 2, 30 + i * fs * 1.1), ch, font=F(fs), fill=fg)
    else:
        w = d.textlength(text, font=F(fs)); d.text(((size[0] - w) / 2, (size[1] - fs) / 2 - 8), text, font=F(fs), fill=fg)
    return aged(im)

def panel(kind, num, kg):
    """Control panel strip above a machine door: number badge, buttons, coin slot, tiny stickers."""
    im = Image.new('RGB', (1000, 360), (40, 52, 80)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 1000, 360], fill=(36, 46, 72))
    d.rectangle([20, 30, 150, 330], fill=(30, 80, 170)); d.text((45, 60), str(num), font=F(150), fill='white')
    d.rectangle([170, 30, 620, 120], fill=(230, 232, 236)); d.text((185, 46), kind, font=F(58), fill=INK)
    d.text((470, 54), kg, font=F(48), fill=(200, 30, 30))
    random.seed(num * 7 + len(kind))
    for i in range(6):
        x = 180 + i * 72
        d.rectangle([x, 150, x + 58, 200], fill=random.choice([(230, 230, 230), (90, 160, 230), (240, 200, 60)]))
        d.text((x + 6, 210), random.choice(['標準', '毛布', 'すすぎ', '脱水', '温水', '冷水']), font=F(22), fill='white')
    d.rectangle([650, 40, 980, 140], fill=(15, 18, 22)); d.text((672, 58), '88:88', font=F(70), fill=(255, 90, 60))
    d.rectangle([680, 170, 760, 320], fill=(20, 20, 24)); d.rectangle([710, 190, 730, 300], fill=(160, 160, 160))  # coin slot
    d.rectangle([800, 170, 960, 230], fill=(240, 240, 235)); d.text((810, 180), '100円玉のみ', font=F(26), fill=INK)
    d.rectangle([800, 250, 960, 320], fill=(250, 210, 40)); d.text((815, 268), 'スタート', font=F(34), fill=INK)
    return aged(im, 0.04)

def badge(text):
    im = Image.new('RGB', (300, 380), (30, 80, 170)); d = ImageDraw.Draw(im)
    d.text((40, 30), text[:2], font=F(150), fill='white'); d.text((80, 200), text[2:], font=F(120), fill='white')
    return im

def sticker(seed):
    random.seed(seed)
    im = Image.new('RGB', (300, 400), random.choice([(250, 220, 40), (255, 255, 255), (250, 240, 200)])); d = ImageDraw.Draw(im)
    d.rectangle([10, 10, 290, 70], fill=random.choice([(220, 30, 30), (30, 80, 170), (20, 20, 20)]))
    d.text((20, 18), random.choice(['ご注意', 'お願い', '注意']), font=F(44), fill='white')
    for i in range(7): d.rectangle([20, 100 + i * 40, 20 + random.randint(140, 260), 118 + i * 40], fill=(60, 60, 60))
    return im

def poster(seed, title):
    random.seed(seed)
    im = Image.new('RGB', (400, 560), (235, 240, 250)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 400, 110], fill=random.choice([(30, 80, 170), (40, 120, 200)])); d.text((20, 26), title, font=F(52), fill='white')
    d.ellipse([110, 150, 290, 330], fill=(60, 90, 150)); d.rectangle([140, 300, 260, 420], fill=(60, 90, 150))
    for i in range(4): d.rectangle([30, 440 + i * 26, 30 + random.randint(200, 340), 454 + i * 26], fill=(80, 80, 90))
    return aged(im, 0.1)

def clock():
    im = Image.new('RGBA', (512, 512), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse([6, 6, 506, 506], fill=(245, 245, 240), outline=(60, 60, 60), width=18)
    import math
    for i in range(60):
        a = i / 60 * math.tau; r1 = 220 if i % 5 else 195
        d.line([256 + math.sin(a) * r1, 256 - math.cos(a) * r1, 256 + math.sin(a) * 232, 256 - math.cos(a) * 232], fill=INK, width=10 if i % 5 == 0 else 3)
    for v, L, w in ((23.5 / 12, 130, 16), (40 / 60, 190, 10)):  # 23:40
        a = v * math.tau
        d.line([256, 256, 256 + math.sin(a) * L, 256 - math.cos(a) * L], fill=INK, width=w)
    d.ellipse([240, 240, 272, 272], fill=INK)
    return im

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    usage().save(f'{OUT}/sign_usage.png'); prices().save(f'{OUT}/sign_prices.png')
    label('乾燥機', (700, 220), fs=140).save(f'{OUT}/sign_dryer.png')
    label('関係者以外立入禁止', (420, 300), fg=(200, 20, 20), fs=56, border=(200, 20, 20)).save(f'{OUT}/sign_staff.png')
    label('開放厳禁', (180, 620), fg=(200, 20, 20), fs=120, vertical=True, border=(200, 20, 20)).save(f'{OUT}/sign_door.png')
    for i, (k, kg) in enumerate([('洗濯乾燥', '22kg'), ('洗濯乾燥', '22kg'), ('洗濯', '12kg')]):
        panel(k, 2 if i < 2 else 2, kg).save(f'{OUT}/panel_washer{i}.png')
    panel('乾燥機', 1, '14kg').save(f'{OUT}/panel_dryer.png')
    badge('22kg').save(f'{OUT}/badge22.png'); badge('12kg').save(f'{OUT}/badge12.png')
    for i in range(6): sticker(i).save(f'{OUT}/sticker{i}.png')
    poster(1, '防犯のお願い').save(f'{OUT}/poster0.png'); poster(2, 'お知らせ').save(f'{OUT}/poster1.png')
    clock().save(f'{OUT}/clock.png')
    print('textures ok')
