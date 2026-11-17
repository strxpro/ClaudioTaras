"""Contact sheet of a project's screenshots (numbered) for quick visual review.
usage: .capture/pyenv/Scripts/python.exe scripts/sheet.py <slug>  ->  .capture/check/sheet-<slug>.png"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
slug = sys.argv[1]
d = os.path.join(ROOT, "public", "media", "projects", slug, "shots")
files = sorted(f for f in os.listdir(d) if f.endswith(".webp"))
TW = 300
tiles = []
for f in files:
    im = Image.open(os.path.join(d, f)).convert("RGB")
    h = int(im.height * TW / im.width)
    im = im.resize((TW, min(h, 420)) if h <= 420 else (TW, h)).crop((0, 0, TW, min(h, 420)))
    tiles.append((f, im))
cols = 6
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (TW + 8), rows * 440), (30, 30, 30))
dr = ImageDraw.Draw(sheet)
fnt = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 16)
for i, (f, im) in enumerate(tiles):
    x, y = (i % cols) * (TW + 8), (i // cols) * 440
    sheet.paste(im, (x, y + 18))
    dr.text((x + 4, y), f, font=fnt, fill=(255, 210, 63))
out = os.path.join(ROOT, ".capture", "check", f"sheet-{slug}.png")
sheet.save(out)
print(out, len(files))
