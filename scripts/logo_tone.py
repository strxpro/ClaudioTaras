"""Trim a captured logo and name it by tone, so the case hero can show it properly:
  logo-light.png  light logo on transparent  -> shown directly on the dark hero
  logo-dark.png   dark/colour logo           -> shown on a white chip
  logo-box.png    opaque image (own bg)      -> shown as-is

usage: python scripts/logo_tone.py <slug> [<slug> ...]   (reads public/media/projects/<slug>/logo-raw.png)
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public" / "media" / "projects"

for slug in sys.argv[1:]:
    d = ROOT / slug
    raw = d / "logo-raw.png"
    if not raw.exists():
        print(f"[{slug}] no logo-raw.png")
        continue
    im = Image.open(raw).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    # a translucent dark plate baked into the logo (e.g. a header backdrop) -> drop it
    lum0 = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) / 255
    plate = (a[..., 3] > 20) & (a[..., 3] < 235) & (lum0 < 0.3)
    if plate.mean() > 0.3:
        a[plate, 3] = 0
        im = Image.fromarray(a.astype(np.uint8), "RGBA")
    alpha = a[..., 3]
    ys, xs = np.nonzero(alpha > 12)
    if len(xs) == 0:
        print(f"[{slug}] empty logo")
        continue
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    a = np.asarray(im).astype(np.float32)
    alpha = a[..., 3]
    solid = alpha > 200
    coverage = solid.mean()
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) / 255
    mean = float(lum[solid].mean()) if solid.any() else 0.0
    if coverage > 0.92:
        tone = "box"
    else:
        tone = "light" if mean > 0.5 else "dark"
    # cap the size (2x capture) — the hero shows it at most ~96px tall
    if im.height > 260:
        im = im.resize((round(im.width * 260 / im.height), 260), Image.LANCZOS)
    for old in d.glob("logo-*.png"):
        if old.name != "logo-raw.png":
            old.unlink()
    out = d / f"logo-{tone}.png"
    im.save(out, optimize=True)
    print(f"[{slug}] {tone}  {im.width}x{im.height}  lum={mean:.2f} cover={coverage:.2f}")
