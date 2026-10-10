"""Writes the launcher icons into the generated android/ project (run after `npx cap add android`)."""
import os, sys
from PIL import Image, ImageDraw

INDIGO = (59, 58, 134, 255); TEAL = (26, 156, 147, 255); WHITE = (255, 255, 255, 255)

def glyph(size, scale):
    """Ring + check mark on a transparent square; `scale` is the share of the square the ring may use."""
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    c = size / 2; r = size * scale / 2; w = max(3, int(size * 0.07))
    d.arc([c - r, c - r, c + r, c + r], 135, 405, fill=(255, 255, 255, 80), width=w)
    d.arc([c - r, c - r, c + r, c + r], 135, 330, fill=TEAL, width=w)
    pts = [(c - r * .38, c + r * .02), (c - r * .08, c + r * .34), (c + r * .42, c - r * .30)]
    lw = max(4, int(size * 0.065))
    d.line(pts, fill=WHITE, width=lw, joint='curve')
    for p in (pts[0], pts[2]):
        e = lw / 2; d.ellipse([p[0] - e, p[1] - e, p[0] + e, p[1] + e], fill=WHITE)
    return im

res = os.path.join(sys.argv[1], 'app', 'src', 'main', 'res')
legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for dens, px in legacy.items():
    folder = os.path.join(res, 'mipmap-' + dens)
    if not os.path.isdir(folder): continue
    fg = px * 108 // 48                                   # adaptive icon layers are 108dp
    glyph(fg, 0.46).save(os.path.join(folder, 'ic_launcher_foreground.png'))
    sq = Image.new('RGBA', (px, px), (0, 0, 0, 0)); d = ImageDraw.Draw(sq)
    d.rounded_rectangle([0, 0, px - 1, px - 1], radius=px // 5, fill=INDIGO)
    sq.alpha_composite(glyph(px, 0.62)); sq.save(os.path.join(folder, 'ic_launcher.png'))
    rd = Image.new('RGBA', (px, px), (0, 0, 0, 0)); d = ImageDraw.Draw(rd)
    d.ellipse([0, 0, px - 1, px - 1], fill=INDIGO); rd.alpha_composite(glyph(px, 0.60)); rd.save(os.path.join(folder, 'ic_launcher_round.png'))
bg = os.path.join(res, 'values', 'ic_launcher_background.xml')
os.makedirs(os.path.dirname(bg), exist_ok=True)
open(bg, 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#3B3A86</color>\n</resources>\n')
print('icons written')
