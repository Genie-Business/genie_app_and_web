"""
Run: python packages/config/brand/make-app-icons.py   (needs Pillow + numpy)

Generate genie app-icon + launch-screen assets from the official logo glyph.

The source glyph (packages/config/brand/LOGO.png) is only ~116x180px, so it is
re-rendered crisp at any size: upscale the antialiased alpha, smooth, threshold
to a binary mask at 8x the target, then box-downsample (clean AA edges).
Everything is a flat single-colour shape, so this is lossless in spirit.
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")).replace("\\", "/")
SRC = f"{REPO}/packages/config/brand/LOGO.png"
MOBILE = f"{REPO}/apps/mobile"
VIOLET = (0x6D, 0x28, 0xD9)
WHITE = (255, 255, 255)
SS = 8  # supersample factor for the binary mask


def load_glyph_alpha():
    im = Image.open(SRC).convert("RGBA")
    a = np.array(im)[:, :, 3]
    cols = (a > 20).any(axis=0)
    # first column run = the glyph (the wordmark follows after a gap)
    x0 = int(np.argmax(cols))
    x1 = x0
    while x1 + 1 < len(cols) and cols[x1 + 1]:
        x1 += 1
    sub = a[:, x0 : x1 + 1]
    rows = np.where((sub > 20).any(axis=1))[0]
    y0, y1 = int(rows.min()), int(rows.max())
    pad = 3
    crop = a[y0 - pad : y1 + 1 + pad, x0 - pad : x1 + 1 + pad]
    return Image.fromarray(crop), pad


GLYPH_ALPHA, PAD = load_glyph_alpha()
NATIVE_H = GLYPH_ALPHA.height - 2 * PAD  # tight glyph height in source px


def render_mask(target_h):
    """Tight-cropped glyph alpha (L) whose *glyph* height is ~target_h px."""
    scale = target_h / NATIVE_H
    ss_scale = scale * SS
    big_w = max(1, round(GLYPH_ALPHA.width * ss_scale))
    big_h = max(1, round(GLYPH_ALPHA.height * ss_scale))
    big = GLYPH_ALPHA.resize((big_w, big_h), Image.BICUBIC)
    big = big.filter(ImageFilter.GaussianBlur(radius=0.45 * ss_scale))
    arr = np.asarray(big, dtype=np.float32) / 255.0
    binary = Image.fromarray(((arr > 0.5) * 255).astype(np.uint8))
    out_w = max(1, round(big_w / SS))
    out_h = max(1, round(big_h / SS))
    mask = binary.resize((out_w, out_h), Image.BOX)
    # trim to the tight bbox
    bbox = mask.point(lambda v: 255 if v > 8 else 0).getbbox()
    return mask.crop(bbox)


def glyph_geometry(mask):
    """(bbox-centre/centroid blended centre, max radius) in mask px."""
    arr = np.asarray(mask, dtype=np.float32) / 255.0
    ys, xs = np.nonzero(arr > 0.5)
    bbox_c = np.array([(xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2])
    w = arr[ys, xs]
    centroid = np.array([(xs * w).sum() / w.sum(), (ys * w).sum() / w.sum()])
    centre = (bbox_c + centroid) / 2  # optical centre
    r = np.sqrt((xs - centre[0]) ** 2 + (ys - centre[1]) ** 2).max()
    return centre, r


def glyph_at_radius(max_radius_px):
    """Mask scaled so its farthest point from the optical centre = max_radius_px."""
    m0 = render_mask(1000)
    _, r0 = glyph_geometry(m0)
    m = render_mask(round(1000 * max_radius_px / r0))
    centre, _ = glyph_geometry(m)
    return m, centre


def paste_centered(canvas, mask, centre, colour, canvas_size):
    layer = Image.new("RGBA", mask.size, colour + (0,))
    layer.putalpha(mask)
    ox = round(canvas_size / 2 - centre[0])
    oy = round(canvas_size / 2 - centre[1])
    canvas.alpha_composite(layer, (ox, oy))
    return canvas


def save(img, path, **kw):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, **kw)
    print("wrote", path.replace(REPO + "/", ""), img.size, f"{os.path.getsize(path)//1024}KB")


S = 1024

# ── Adaptive icon foreground (+ monochrome): white glyph ───────────────────
# flutter_launcher_icons wraps the foreground in <inset 16%>, i.e. draws it at
# 68% of the 108dp canvas. The adaptive safe zone is a 66dp circle = radius
# 0.3055 of the canvas, so size the artwork such that AFTER the inset the
# glyph's farthest point sits at ~0.298 of the canvas: 0.298 / 0.68.
INSET_SCALE = 0.68
m, c = glyph_at_radius((0.298 / INSET_SCALE) * S)
fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
paste_centered(fg, m, c, WHITE, S)
save(fg, f"{MOBILE}/assets/icon/icon-foreground.png", optimize=True)

# ── Legacy Android (pre-8) rounded square, bigger glyph ────────────────────
m2, c2 = glyph_at_radius(0.352 * S)
rounded = Image.new("RGBA", (S, S), (0, 0, 0, 0))
mask_rr = Image.new("L", (S * 4, S * 4), 0)
ImageDraw.Draw(mask_rr).rounded_rectangle((0, 0, S * 4 - 1, S * 4 - 1), radius=int(S * 4 * 0.225), fill=255)
mask_rr = mask_rr.resize((S, S), Image.LANCZOS)
bg = Image.new("RGBA", (S, S), VIOLET + (255,))
rounded.paste(bg, (0, 0), mask_rr)
paste_centered(rounded, m2, c2, WHITE, S)
save(rounded, f"{MOBILE}/assets/icon/icon-android.png", optimize=True)

# ── iOS: full-bleed square, no alpha (the OS applies its own mask) ─────────
ios = Image.new("RGBA", (S, S), VIOLET + (255,))
paste_centered(ios, m2, c2, WHITE, S)
save(ios.convert("RGB"), f"{MOBILE}/assets/icon/icon-ios.png", optimize=True)

# ── In-app glyph (hi-res replacement for the 62x96 one) ────────────────────
inapp = render_mask(384)
for name, colour in (("genie-glyph-white.png", WHITE), ("genie-glyph.png", VIOLET)):
    layer = Image.new("RGBA", inapp.size, colour + (0,))
    layer.putalpha(inapp)
    save(layer, f"{MOBILE}/assets/brand/{name}", optimize=True)

# ── Native Android launch glyph (white) at 72dp for each density ───────────
for folder, px in (("mdpi", 72), ("hdpi", 108), ("xhdpi", 144), ("xxhdpi", 216), ("xxxhdpi", 288)):
    g = render_mask(px)
    layer = Image.new("RGBA", g.size, WHITE + (0,))
    layer.putalpha(g)
    save(layer, f"{MOBILE}/android/app/src/main/res/drawable-{folder}/launch_glyph.png", optimize=True)
