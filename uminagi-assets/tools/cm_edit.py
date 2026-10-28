"""Cut the 海凪の港町 commercial together: shots -> one 1280x720 24 fps stream, captions drawn on with PIL
(pop-in, fade-out), the original jingle (cm_music.py) underneath.
usage: python3 cm_edit.py CONFIG.json OUT.mp4
CONFIG: {"font": "...ttf", "music": "...wav",
         "shots": [{"src": "a.mp4" | "frames/dir", "from": seconds, "dur": seconds}, ...],
         "captions": [{"text": "...", "t0": s, "t1": s, "size": px, "y": 0..1, "sub": "...", "kind": "title|line|end"}]}
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1280, 720, 24
cfg = json.load(open(sys.argv[1])); OUT = sys.argv[2]
FONT = cfg['font']

def shot_frames(s):
    """decode one shot to W x H RGB frames"""
    src, n = s['src'], round(s['dur'] * FPS)
    if os.path.isdir(src):
        files = sorted(f for f in os.listdir(src) if f.endswith(('.jpg', '.png')))
        k0 = round(s.get('from', 0) * FPS)
        for i in range(n):
            f = files[min(len(files) - 1, k0 + i)]
            yield np.asarray(Image.open(os.path.join(src, f)).convert('RGB').resize((W, H), Image.LANCZOS))
        return
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-ss', str(s.get('from', 0)), '-i', src, '-t', str(s['dur'] + 0.5),
                          '-vf', f'scale={W}:{H}:flags=lanczos,fps={FPS}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    last = None
    for i in range(n):
        b = p.stdout.read(W * H * 3)
        if len(b) == W * H * 3: last = np.frombuffer(b, np.uint8).reshape(H, W, 3)
        yield last
    p.kill()

def text_layer(text, size, sub=None, sub_size=None, color=(255, 255, 255), edge=(32, 70, 110)):
    """a caption as an RGBA image: rounded bold letters, a thick soft-blue edge and a drop shadow"""
    f = ImageFont.truetype(FONT, size); lines = text.split('\n')
    fs = ImageFont.truetype(FONT, sub_size or int(size * 0.38)) if sub else None
    pad = int(size * 0.35)
    boxes = [f.getbbox(l) for l in lines]
    tw = max(b[2] - b[0] for b in boxes); lh = int(size * 1.2)
    th = lh * len(lines) + (int(fs.size * 1.6) if sub else 0)
    if sub: tw = max(tw, fs.getbbox(sub)[2])
    img = Image.new('RGBA', (tw + pad * 2, th + pad * 2), (0, 0, 0, 0))
    def draw(dst, fill, stroke, off=(0, 0)):
        d = ImageDraw.Draw(dst)
        for k, l in enumerate(lines):
            w = f.getbbox(l)[2]
            d.text(((img.width - w) / 2 + off[0], pad + k * lh + off[1]), l, font=f, fill=fill, stroke_width=stroke, stroke_fill=fill if stroke and fill[3] < 255 else edge + (255,))
        if sub:
            w = fs.getbbox(sub)[2]
            d.text(((img.width - w) / 2 + off[0], pad + lh * len(lines) + int(fs.size * 0.3) + off[1]), sub, font=fs, fill=fill, stroke_width=max(2, stroke // 2), stroke_fill=edge + (255,))
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0)); draw(sh, (0, 20, 40, 110), int(size * 0.12), (0, int(size * 0.06)))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(size * 0.06)))
    draw(img, color + (255,), max(3, int(size * 0.09)))
    return img

def ease_pop(u):   # 0..1 -> scale with a little overshoot
    u = min(1, max(0, u)); return 1 + 0.12 * np.sin(u * np.pi) * (1 - u) - 0.25 * (1 - u) ** 3

caps = []
for c in cfg['captions']:
    caps.append(dict(c, img=text_layer(c['text'], c.get('size', 72), c.get('sub'), c.get('sub_size'), tuple(c.get('color', (255, 255, 255))))))

def composite(frame, t):
    im = Image.fromarray(frame).convert('RGBA')
    for c in caps:
        if not (c['t0'] <= t < c['t1']): continue
        a = min(1, (t - c['t0']) / 0.25, (c['t1'] - t) / 0.35)
        s = ease_pop((t - c['t0']) / 0.4)
        if c.get('band'):   # a soft dark band behind lower captions for legibility
            band = Image.new('RGBA', (W, H), (0, 0, 0, 0)); bd = ImageDraw.Draw(band)
            y = int(c.get('y', 0.82) * H); hh = int(c['img'].height * 0.55)
            for k in range(hh * 2):
                v = int(70 * a * (1 - abs(k - hh) / hh) ** 0.7); bd.line([(0, y - hh + k), (W, y - hh + k)], fill=(10, 25, 45, v))
            im.alpha_composite(band)
        ci = c['img'] if abs(s - 1) < 1e-3 else c['img'].resize((max(1, int(c['img'].width * s)), max(1, int(c['img'].height * s))), Image.LANCZOS)
        if a < 1: ci = ci.copy(); ci.putalpha(ci.getchannel('A').point(lambda v: int(v * a)))
        x = int(c.get('x', 0.5) * W - ci.width / 2); y = int(c.get('y', 0.82) * H - ci.height / 2)
        im.alpha_composite(ci, (max(0, x), max(0, y)))
    return np.asarray(im.convert('RGB'))

total = sum(s['dur'] for s in cfg['shots'])
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                        '-i', cfg['music'], '-t', str(total), '-af', f'afade=t=out:st={total - 0.6}:d=0.6',
                        '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT], stdin=subprocess.PIPE)
t = 0.0; k = 0
for si, s in enumerate(cfg['shots']):
    fade_in = s.get('fade_in', 0); fade_out = s.get('fade_out', 0); n = round(s['dur'] * FPS)
    for i, fr in enumerate(shot_frames(s)):
        if s.get('zoom'):   # a slow push-in (also hides a held last frame)
            z = 1 + (s['zoom'] - 1) * (i / max(1, n - 1)) ** 0.8; cw, ch = int(W / z), int(H / z)
            x0, y0 = (W - cw) // 2, int((H - ch) * s.get('zoom_y', 0.5))
            fr = np.asarray(Image.fromarray(fr[y0:y0 + ch, x0:x0 + cw]).resize((W, H), Image.BICUBIC))
        fr = fr.astype(np.float32)
        if s.get('dim_from') is not None and i >= s['dim_from'] * FPS:   # darken under the end card
            fr *= 1 - s.get('dim', 0.3) * min(1, (i - s['dim_from'] * FPS) / (0.6 * FPS))
        if fade_in and i < fade_in * FPS: fr *= i / (fade_in * FPS)
        if fade_out and i > n - fade_out * FPS: fr *= max(0, (n - i) / (fade_out * FPS))
        if s.get('white_in') and i < s['white_in'] * FPS:   # a bright flash into the shot
            u = i / (s['white_in'] * FPS); fr = fr * u + 255 * (1 - u)
        out = composite(np.clip(fr, 0, 255).astype(np.uint8), k / FPS)
        enc.stdin.write(out.tobytes()); k += 1
    print('shot', si, s['src'], n, 'frames', flush=True)
enc.stdin.close(); enc.wait()
print('wrote', OUT, k, 'frames')
