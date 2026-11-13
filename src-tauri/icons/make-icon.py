"""Renders AppIcon.icon/Assets/background.png: a white bandage with a grey pad and breathing holes,
lying diagonally on a dark graphite background, with a soft shadow and a light bevel.
The image is a full square; macOS rounds the corners.

Usage: python3 make-icon.py [out.png]   (needs Pillow, so not with -I)
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SIZE = 1024
SS = 4  # supersampling for the shapes
RADIUS = SIZE * 0.2237  # corner radius of the system mask, used for the rim
C = SIZE / 2
LENGTH, WIDTH, ANGLE = 800, 280, 40  # bandage size in px and rotation in degrees

GRAPHITE = ((0x26, 0x27, 0x2B), (0x0E, 0x0E, 0x10))
STRIP = ((0xFF, 0xFF, 0xFF), (0xDD, 0xDF, 0xE3))
PAD = ((0xC4, 0xC7, 0xCD), (0x8E, 0x92, 0x99))


def ss_mask(draw_fn):
    m = Image.new("L", (SIZE * SS, SIZE * SS), 0)
    draw_fn(ImageDraw.Draw(m), SS)
    return m.resize((SIZE, SIZE), Image.LANCZOS)


def linear(c0, c1, angle=90):
    """Linear gradient from c0 to c1; angle 90 runs top to bottom."""
    # A rotated square of side 364 still covers its central 256 square at any angle.
    g = Image.linear_gradient("L").resize((364, 364), Image.BICUBIC).rotate(90 - angle, resample=Image.BICUBIC)
    g = g.crop((54, 54, 310, 310)).resize((SIZE, SIZE), Image.BICUBIC)
    return Image.composite(Image.new("RGB", (SIZE, SIZE), c1), Image.new("RGB", (SIZE, SIZE), c0), g)


def layer(color, mask, opacity=1.0):
    l = Image.new("RGBA", (SIZE, SIZE), color)
    l.putalpha(mask.point(lambda v: round(v * opacity)))
    return l


def fill(img, colors, mask, angle=60):
    g = linear(*colors, angle).convert("RGBA")
    g.putalpha(mask)
    img.alpha_composite(g)


def circle(cx, cy, r):
    return ss_mask(lambda d, s: d.ellipse(((cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s), fill=255))


def rrect(w, h, r):
    return ss_mask(lambda d, s: d.rounded_rectangle(((C - w / 2) * s, (C - h / 2) * s, (C + w / 2) * s, (C + h / 2) * s), r * s, fill=255))


def rotated(mask):
    return mask.rotate(ANGLE, resample=Image.BICUBIC, center=(C, C))


def main(out):
    img = linear(*GRAPHITE).convert("RGBA")

    # Strip with a soft shadow under it and a bevel: lit top edge, darker bottom edge.
    band = rotated(rrect(LENGTH, WIDTH, WIDTH / 2))
    img.alpha_composite(layer((0, 0, 0), ImageChops.offset(band, 0, 16).filter(ImageFilter.GaussianBlur(22)), 0.6))
    fill(img, STRIP, band)
    lit = ImageChops.subtract(band, ImageChops.offset(band, 0, 5)).filter(ImageFilter.GaussianBlur(2))
    shade = ImageChops.subtract(band, ImageChops.offset(band, 0, -5)).filter(ImageFilter.GaussianBlur(3))
    img.alpha_composite(layer((255, 255, 255), lit, 0.5))
    img.alpha_composite(layer((0, 0, 0), shade, 0.25))

    # Pad in the middle, slightly sunk.
    pad = rotated(rrect(LENGTH * 0.36, WIDTH * 0.78, 22))
    fill(img, PAD, pad)
    img.alpha_composite(layer((0, 0, 0), ImageChops.subtract(pad, ImageChops.offset(pad, 0, -4)).filter(ImageFilter.GaussianBlur(2)), 0.18))

    # Breathing holes on both ends of the strip and on the pad.
    holes = Image.new("L", (SIZE, SIZE), 0)
    for side in (-1, 1):
        for dx in (0.31, 0.41):
            for dy in (-0.2, 0.2):
                holes = ImageChops.lighter(holes, circle(C + side * dx * LENGTH, C + dy * WIDTH, WIDTH * 0.045))
    for dx in (-0.08, 0, 0.08):
        for dy in (-0.18, 0.18):
            holes = ImageChops.lighter(holes, circle(C + dx * LENGTH, C + dy * WIDTH, WIDTH * 0.04))
    img.alpha_composite(layer((0, 0, 0), rotated(holes), 0.22))

    # Soft highlight at the top and a faint rim along the system mask.
    hl = linear((255, 255, 255), (0, 0, 0)).convert("L").point(lambda v: max(0, v - 170) * 2)
    img.alpha_composite(layer((255, 255, 255), hl, 0.10))
    rim = ss_mask(lambda d, s: d.rounded_rectangle((2 * s, 2 * s, (SIZE - 2) * s, (SIZE - 2) * s), (RADIUS - 2) * s, outline=255, width=3 * s))
    img.alpha_composite(layer((255, 255, 255), ImageChops.multiply(rim, linear((255,) * 3, (30,) * 3).convert("L")), 0.25))

    img.convert("RGB").save(out)
    print("wrote", out)


main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "AppIcon.icon", "Assets", "background.png"))
