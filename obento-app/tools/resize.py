# resize.py SRC SIZE OUT [flat]: square icon at SIZE px; "flat" removes transparency (App Store icons must be opaque)
import sys
from PIL import Image
src, size, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
im = Image.open(src).convert('RGBA').resize((size, size), Image.LANCZOS)
if len(sys.argv) > 4 and sys.argv[4] == 'flat':
    bg = Image.new('RGBA', im.size, (255, 246, 228, 255)); bg.alpha_composite(im); im = bg.convert('RGB')
im.save(out, optimize=True)
