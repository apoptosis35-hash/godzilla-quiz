# splash.py ICON W H OUT: launch screen, the icon centred on the game's cream background (opaque)
import sys
from PIL import Image
icon, w, h, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
bg = Image.new('RGBA', (w, h), (255, 246, 228, 255))
s = int(min(w, h) * 0.32)
im = Image.open(icon).convert('RGBA').resize((s, s), Image.LANCZOS)
bg.alpha_composite(im, ((w - s) // 2, (h - s) // 2))
bg.convert('RGB').save(out, optimize=True)
