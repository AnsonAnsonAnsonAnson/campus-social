"""Draws the app icon set into assets/ (run: python3 scripts/make-icons.py, needs Pillow).

A white event ticket with a sparkle on the brand colour, plus the iOS 18+
dark and tinted variants and the splash mark. Drawn at 4x and downsampled
for smooth edges. The colours must match BRAND in src/lib/theme.ts; set
BRAND=jade (etc.) and OUT=some/dir to draw another brand somewhere else.
"""
import os
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(os.environ.get("OUT") or Path(__file__).resolve().parent.parent / "assets")
ASSETS.mkdir(parents=True, exist_ok=True)
S = 4  # supersampling factor
N = 1024 * S


def rgb(hex_):
    return tuple(int(hex_[i : i + 2], 16) for i in (1, 3, 5))


# Background (`main`, flat; top/bottom are kept for reference), ticket colour, sparkle (brand), dot (accent); dark icon uses `main` for the ticket.
BRANDS = {
    "lime": dict(top="#C8F35C", bottom="#97C526", main="#B8F02E", ticket="#0A0A0B", dot="#E0186F", dot_dark="#EA3887"),
    "tomato": dict(top="#CE5332", bottom="#A33012", main="#C73B16", ticket="#FFFFFF", dot="#2443B5", dot_dark="#455FC0"),
    "ultramarine": dict(top="#3D57CF", bottom="#1D34A4", main="#2340C8", ticket="#FFFFFF", dot="#F06A28", dot_dark="#F28048"),
    "cherry": dict(top="#C14238", bottom="#972118", main="#B8281D", ticket="#FFFFFF", dot="#F2C24E", dot_dark="#F4CB69"),
    "periwinkle": dict(top="#5372CD", bottom="#304EA2", main="#3B5FC6", ticket="#FFFFFF", dot="#E2522A", dot_dark="#E66C4A"),
    "teal": dict(top="#2F6570", bottom="#10424B", main="#13505C", ticket="#FFFFFF", dot="#C8562A", dot_dark="#D06F4A"),
    "butter": dict(top="#F4CF61", bottom="#C6A53E", main="#F2C94C", ticket="#14110F", dot="#2443B5", dot_dark="#455FC0"),
    "pool": dict(top="#3A80C8", bottom="#195B9D", main="#1F6FC0", ticket="#FFFFFF", dot="#F3D046", dot_dark="#F5D762"),
    "oxblood": dict(top="#8C3830", bottom="#661810", main="#7C1D14", ticket="#FFFFFF", dot="#D9A46A", dot_dark="#DFB280"),
    "strawberry": dict(top="#DE678A", bottom="#B24364", main="#D9527A", ticket="#14110F", dot="#5B8FD9", dot_dark="#74A0DF"),
    "cobaltcherry": dict(top="#4456B9", bottom="#223490", main="#2A3FAF", ticket="#FFFFFF", dot="#B12A1F", dot_dark="#BD4A41"),
    "cobalt": dict(top="#3D63FF", bottom="#1A3CC4", main="#2450F0", ticket="#FFFFFF", dot="#FF6F0F", dot_dark="#FF8A3D"),
}
B = BRANDS[os.environ.get("BRAND", "lime")]
COBALT_TOP = rgb(B["top"])
COBALT_BOTTOM = rgb(B["bottom"])
COBALT = rgb(B["main"])
TANGERINE = rgb(B["dot"])
TICKET = rgb(B["ticket"])
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)


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


def ticket_layer(scale, ink=None, star=COBALT, dot=TANGERINE, mono=False):
    """Ticket centred on a transparent N x N canvas. `scale` is ticket width / canvas."""
    ink = ink or TICKET
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


# Flat brand colour, no gradient: the palette used as is.
bg = Image.new("RGBA", (N, N), COBALT + (255,))
icon = Image.alpha_composite(bg, ticket_layer(0.66))
save(icon, "icon.png", mode="RGB")
save(icon, "favicon.png", size=48, mode="RGB")
# iOS 18+ home screen: dark mode shows a brand-coloured ticket on black; tinted mode
# recolours a greyscale icon, so the ticket is white and the dot mid-grey.
black = Image.new("RGBA", (N, N), BLACK + (255,))
save(Image.alpha_composite(black, ticket_layer(0.66, ink=COBALT, star=BLACK, dot=rgb(B["dot_dark"]))), "icon-dark.png", mode="RGB")
save(Image.alpha_composite(black, ticket_layer(0.66, ink=WHITE, star=BLACK, dot=(150, 150, 150))), "icon-tinted.png", mode="RGB")
save(bg, "android-icon-background.png")
# Adaptive icons are cropped to a circle/squircle of ~66% of the canvas.
save(ticket_layer(0.5), "android-icon-foreground.png")
save(ticket_layer(0.5, ink=WHITE, mono=True), "android-icon-monochrome.png")

# Splash: the white ticket alone, drawn on the brand colour set in app.json.
save(ticket_layer(0.9), "splash-icon.png")
print("Wrote icons to", ASSETS)
