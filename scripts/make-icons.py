"""Draws the app icon set into assets/ (run: python3 scripts/make-icons.py, needs Pillow).

A white event ticket with a sparkle, on the brand purple. Drawn at 4x and
downsampled for smooth edges.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "assets"
S = 4  # supersampling factor
N = 1024 * S

PURPLE_TOP = (124, 50, 158)
PURPLE_BOTTOM = (78, 27, 102)
PURPLE = (110, 42, 140)
GOLD = (215, 169, 59)
WHITE = (255, 255, 255)


def gradient(size):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size - 2)
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(PURPLE_TOP, PURPLE_BOTTOM)) + (255,)
    return img


def sparkle(draw, cx, cy, r, fill):
    """Four-pointed star with concave sides."""
    pts = []
    import math

    for i in range(16):
        ang = math.pi / 2 + i * math.pi / 8
        # tips at 0, 4, 8, 12; waist elsewhere
        k = i % 4
        rad = r if k == 0 else r * (0.26 if k == 2 else 0.4)
        pts.append((cx + rad * math.cos(ang), cy - rad * math.sin(ang)))
    draw.polygon(pts, fill=fill)


def ticket_layer(scale, ink=WHITE, star=PURPLE, dot=GOLD, mono=False):
    """Ticket centred on a transparent N x N canvas. `scale` is ticket width / canvas."""
    layer = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    w = N * scale
    h = w * 0.62
    x0, y0 = (N - w) / 2, (N - h) / 2
    x1, y1 = x0 + w, y0 + h
    d.rounded_rectangle((x0, y0, x1, y1), radius=h * 0.16, fill=ink)

    # Notches either side of the perforation, punched out of the ticket.
    stub_x = x0 + w * 0.70
    notch = h * 0.13
    mask = Image.new("L", (N, N), 255)
    md = ImageDraw.Draw(mask)
    for cy in (y0, y1):
        md.ellipse((stub_x - notch, cy - notch, stub_x + notch, cy + notch), fill=0)
    # Perforation dashes.
    dash_w = w * 0.018
    gap = h * 0.075
    y = y0 + notch + gap * 0.8
    while y + gap * 0.55 < y1 - notch - gap * 0.3:
        md.rounded_rectangle((stub_x - dash_w / 2, y, stub_x + dash_w / 2, y + gap * 0.55), radius=dash_w / 2, fill=0)
        y += gap
    if mono:
        # Monochrome icons are a single colour: cut the sparkle and dot out too.
        sparkle(md, x0 + w * 0.36, (y0 + y1) / 2, h * 0.34, 0)
        r = h * 0.11
        md.ellipse((x0 + w * 0.85 - r, (y0 + y1) / 2 - r, x0 + w * 0.85 + r, (y0 + y1) / 2 + r), fill=0)
    alpha = Image.composite(layer.getchannel("A"), Image.new("L", (N, N), 0), mask)
    layer.putalpha(alpha)
    if not mono:
        d = ImageDraw.Draw(layer)
        sparkle(d, x0 + w * 0.36, (y0 + y1) / 2, h * 0.34, star)
        r = h * 0.11
        d.ellipse((x0 + w * 0.85 - r, (y0 + y1) / 2 - r, x0 + w * 0.85 + r, (y0 + y1) / 2 + r), fill=dot)
    return layer


def save(img, name, size=1024, mode="RGBA"):
    img.resize((size, size), Image.LANCZOS).convert(mode).save(ASSETS / name)


bg = gradient(1024).resize((N, N), Image.BICUBIC)
icon = Image.alpha_composite(bg, ticket_layer(0.66))
save(icon, "icon.png", mode="RGB")
save(icon, "favicon.png", size=48, mode="RGB")
save(bg, "android-icon-background.png")
# Adaptive icons are cropped to a circle/squircle of ~66% of the canvas.
save(ticket_layer(0.5), "android-icon-foreground.png")
save(ticket_layer(0.5, ink=WHITE, mono=True), "android-icon-monochrome.png")

# Splash: the icon as a rounded tile on a transparent canvas.
tile = Image.new("RGBA", (N, N), (0, 0, 0, 0))
m = Image.new("L", (N, N), 0)
ImageDraw.Draw(m).rounded_rectangle((0, 0, N - 1, N - 1), radius=N * 0.225, fill=255)
tile.paste(icon, (0, 0), m)
save(tile, "splash-icon.png")
print("Wrote icons to", ASSETS)
