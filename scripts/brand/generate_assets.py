#!/usr/bin/env python3
"""
Genera logo, icone e immagini di condivisione con la palette CORE829:
  Obsidian Black #111217 · Ice Grey #DFE5EB · Racing Red #EF233C
Uso:  python3 scripts/brand/generate_assets.py [cartella-che-contiene-i-4-repository]
Richiede Pillow e numpy; font: Inter e JetBrains Mono (installati nel sistema).
Il marchio (due anelli "CO") non viene ridisegnato: si usa la maschera del logo bianco ufficiale.
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
P = lambda *a: os.path.join(ROOT, *a)

OBSIDIAN = (0x11, 0x12, 0x17)
ICE = (0xDF, 0xE5, 0xEB)
RED = (0xEF, 0x23, 0x3C)
WHITE = (255, 255, 255)

INTER = "/usr/share/fonts/opentype/inter/Inter-{w}.otf"
MONO = "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-{w}.ttf"
font = lambda path, w, size: ImageFont.truetype(path.format(w=w), size)

# ---- Maschera del marchio (dal logo bianco ufficiale, alta risoluzione) --------------------------
_src = Image.open(P("portal.core829.net", "public", "brand", "core829-logo-white.webp")).convert("RGBA")
MASK = _src.split()[3]  # canale alfa = forma del marchio (589 x 400)
MARK_RATIO = MASK.width / MASK.height

def mark(color, width):
    """Marchio di un solo colore, largo `width` px (alta qualita': ridimensionamento Lanczos)."""
    h = round(width / MARK_RATIO)
    m = MASK.resize((width, h), Image.LANCZOS)
    img = Image.new("RGBA", (width, h), color + (0,))
    img.putalpha(m)
    return img

def rounded_mask(size, radius, ss=4):
    m = Image.new("L", (size * ss, size * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size * ss - 1, size * ss - 1), radius=radius * ss, fill=255)
    return m.resize((size, size), Image.LANCZOS)

def tile(size, mark_frac=0.62, radius_frac=0.22, rounded=True, bg=OBSIDIAN):
    """Icona: tessera Obsidian con il marchio bianco centrato (margini sicuri: il marchio non viene mai tagliato)."""
    img = Image.new("RGBA", (size, size), bg + (255,))
    mk = mark(WHITE, round(size * mark_frac))
    img.alpha_composite(mk, ((size - mk.width) // 2, (size - mk.height) // 2))
    if rounded:
        img.putalpha(rounded_mask(size, round(size * radius_frac)))
    return img

# ---- Sfondi per le immagini di condivisione ----------------------------------------------------
def grid(img, step=60, alpha=9):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for x in range(0, img.width, step): d.line((x, 0, x, img.height), fill=ICE + (alpha,), width=1)
    for y in range(0, img.height, step): d.line((0, y, img.width, y), fill=ICE + (alpha,), width=1)
    img.alpha_composite(layer)

def glow(img, center, radius, color=RED, strength=0.55):
    """Alone morbido di Racing Red (gaussiano) che sfuma nell'Obsidian."""
    w, h = img.size
    layer = Image.new("L", (w, h), 0)
    ImageDraw.Draw(layer).ellipse((center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius), fill=int(255 * strength))
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.55))
    red = Image.new("RGBA", (w, h), color + (255,))
    red.putalpha(layer)
    img.alpha_composite(red)

def og_base():
    img = Image.new("RGBA", (1200, 630), OBSIDIAN + (255,))
    grid(img)
    return img

def text(img, xy, s, fnt, fill, anchor="la", spacing=0):
    ImageDraw.Draw(img).text(xy, s, font=fnt, fill=fill, anchor=anchor, spacing=spacing)

def save_png(img, path, rgb=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    (img.convert("RGB") if rgb else img).save(path, optimize=True)
    print("ok", os.path.relpath(path, ROOT))

def save_ico(path, sizes=(16, 32, 48)):
    # Per le dimensioni piccole il marchio e' piu' grande nella tessera: resta leggibile in una scheda del browser.
    imgs = [tile(s, mark_frac=0.74, radius_frac=0.2) for s in sizes]
    imgs[-1].save(path, format="ICO", sizes=[(s, s) for s in sizes], append_images=imgs[:-1])
    print("ok", os.path.relpath(path, ROOT))

# =============================================================================================
# 1) LOGO NERO -> Obsidian (stessa tela 500x500 e stessa posizione dei file attuali)
# =============================================================================================
def black_logo(path):
    old = Image.open(path)
    canvas = Image.new("RGBA", old.size, (0, 0, 0, 0))
    mk = mark(OBSIDIAN, 363)  # larghezza del marchio nei file attuali (bbox 68..431)
    canvas.alpha_composite(mk, (68, 126 + (246 - mk.height) // 2))
    canvas.save(path, format="WEBP", lossless=True, quality=100, method=6)
    print("ok", os.path.relpath(path, ROOT))

black_logo(P("portal.core829.net", "public", "brand", "core829-logo.webp"))
black_logo(P("core829.net-new", "public", "core829-logo", "829black trsp.webp"))
black_logo(P("core829-bookings", "public", "core829branding", "core829-logo.webp"))

# =============================================================================================
# 2) ICONE
# =============================================================================================
for repo, d in [("portal.core829.net", ("src", "app")), ("core829.net-new", ("app",)), ("core829-bookings", ("src", "app"))]:
    save_png(tile(512), P(repo, *d, "icon.png"))
    save_png(tile(180, mark_frac=0.64, radius_frac=0.0, rounded=False), P(repo, *d, "apple-icon.png"), rgb=True)
save_png(tile(192), P("portal.core829.net", "public", "brand", "icon-192.png"))
save_png(tile(512), P("portal.core829.net", "public", "brand", "icon-512.png"))
for repo, d in [("portal.core829.net", ("src", "app")), ("core829-bookings", ("src", "app")), ("core829crm-new", ("src", "app"))]:
    save_ico(P(repo, *d, "favicon.ico"))

# =============================================================================================
# 3) IMMAGINI DI CONDIVISIONE 1200x630
# =============================================================================================
# --- Portale clienti
img = og_base()
glow(img, (930, 300), 330, strength=0.55)
mk = mark(WHITE, 150)
img.alpha_composite(mk, (84, 66))
ImageDraw.Draw(img).rectangle((84, 226, 140, 228), fill=RED)
text(img, (158, 226), "PORTALE CLIENTI", font(MONO, "Regular", 24), ICE, "lm")
text(img, (84, 262), "Il tuo spazio\ncon CORE829", font(INTER, "SemiBold", 86), WHITE, "la", spacing=4)
text(img, (86, 492), "Progetti, fatture, abbonamenti e documenti\nin un unico posto.", font(INTER, "Regular", 31), (0xA9, 0xB2, 0xBE), "la", spacing=10)
save_png(img, P("portal.core829.net", "src", "app", "opengraph-image.png"), rgb=True)
save_png(img, P("portal.core829.net", "src", "app", "twitter-image.png"), rgb=True)

# --- Sito core829.net
img = og_base()
glow(img, (600, 300), 360, strength=0.5)
mk = mark(WHITE, 330)
img.alpha_composite(mk, ((1200 - mk.width) // 2, 118))
text(img, (600, 440), "CORE829", font(INTER, "Bold", 84), WHITE, "mm")
ImageDraw.Draw(img).rectangle((548, 500, 652, 504), fill=RED)
text(img, (600, 552), "Digital Agency · Custom Servers · Web · Software", font(INTER, "Regular", 28), (0xA9, 0xB2, 0xBE), "mm")
save_png(img, P("core829.net-new", "public", "og-image.png"))

# --- Bookings: marchio CORE829 (alta risoluzione) + marchio Bookings (asset in scripts/brand/assets), su Racing Red
HERE = os.path.dirname(os.path.abspath(__file__))
sun = Image.open(os.path.join(HERE, "assets", "bookings-sun-mark.png")).convert("RGBA")
H = 190
core = mark(WHITE, round(H * MARK_RATIO))
sun = sun.resize((round(sun.width * H / sun.height), H), Image.LANCZOS)
gap = 70
total = core.width + gap + sun.width
vig = Image.new("L", (1200, 630), 0)
ImageDraw.Draw(vig).ellipse((-300, -380, 1500, 1010), fill=255)
vig = vig.filter(ImageFilter.GaussianBlur(160))
img = Image.composite(Image.new("RGBA", (1200, 630), RED + (255,)), Image.new("RGBA", (1200, 630), (0x9B, 0x0F, 0x22, 255)), vig)
x0 = (1200 - total) // 2
img.alpha_composite(core, (x0, 130))
img.alpha_composite(sun, (x0 + core.width + gap, 130))
text(img, (600, 430), "Bookings", font(INTER, "SemiBold", 64), WHITE, "mm")
text(img, (600, 500), "Prenota un appuntamento online", font(INTER, "Regular", 29), (0xFF, 0xE8, 0xEB), "mm")
save_png(img, P("core829-bookings", "src", "app", "opengraph-image.png"), rgb=True)
save_png(img, P("core829-bookings", "src", "app", "twitter-image.png"), rgb=True)
