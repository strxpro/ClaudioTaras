"""
15-second Italian promo, horizontal 16:9 (1920x1080, 60 fps) — calm, professional motion design.
Motif: squares. A wall of project tiles opens it, tile grids wipe between scenes, square cards flip
to swap projects. Clean grotesque type (Segoe UI), a graded look (lifted cool shadows, warm
highlights, muted gold, vignette, fine grain) and an original soundtrack: Rhodes maj7 chords over a
half-time groove — no sound effects.

  .capture/pyenv/Scripts/python.exe scripts/promo_wide.py [--frames 0.5,3.2,…]
Output: promo/claudio-taras-promo-it-16x9.mp4 (+ poster .jpg)
"""
import math
import os
import subprocess
import sys
import wave

import numpy as np
import skia

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import showreel as sr  # noqa: E402  (mixing helpers: add, add_lr, reverb, fft_filter)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA = os.path.join(ROOT, "public", "media", "projects")
OUT_DIR = os.path.join(ROOT, "promo")
W, H, FPS, DUR = 1920, 1080, 60, 15.0

BG, BG2 = (14, 14, 16), (24, 24, 28)
TEXT, MUTED = (242, 240, 234), (146, 146, 154)
GOLD, PAPER, INK = (240, 192, 84), (238, 235, 229), (20, 20, 22)
EMAIL, PHONE = "claudiotaras3@gmail.com", "+39 345 451 0973"

FONTS = "C:/Windows/Fonts"
F_BLACK = skia.Typeface.MakeFromFile(f"{FONTS}/seguibl.ttf")
F_BOLD = skia.Typeface.MakeFromFile(f"{FONTS}/segoeuib.ttf")
F_SEMI = skia.Typeface.MakeFromFile(f"{FONTS}/seguisb.ttf")
F_LIGHT = skia.Typeface.MakeFromFile(f"{FONTS}/segoeuil.ttf")
F_LABEL = skia.Typeface.MakeFromFile(f"{FONTS}/bahnschrift.ttf")
SAMPLING = skia.SamplingOptions(skia.FilterMode.kLinear, skia.MipmapMode.kLinear)

# ------------------------------------------------------------------ easing / drawing helpers


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def prog(t, a, b):
    return clamp((t - a) / (b - a)) if b > a else float(t >= a)


def ease_out(p):  # quart out — calm, no overshoot
    return 1 - (1 - p) ** 4


def ease_in_out(p):  # cubic in-out
    return 4 * p ** 3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2


def lerp(a, b, p):
    return a + (b - a) * p


def c4(rgb, a=1.0):
    return skia.Color4f(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, clamp(a))


def argb(rgb, a=1.0):
    return skia.ColorSetARGB(int(255 * clamp(a)), *rgb)


def paint(rgb, a=1.0, stroke=0.0):
    p = skia.Paint(AntiAlias=True)
    p.setColor4f(c4(rgb, a))
    if stroke:
        p.setStyle(skia.Paint.kStroke_Style)
        p.setStrokeWidth(stroke)
        p.setStrokeCap(skia.Paint.kRound_Cap)
        p.setStrokeJoin(skia.Paint.kRound_Join)
    return p


def font(face, size):
    f = skia.Font(face, size)
    f.setSubpixel(True)
    f.setEdging(skia.Font.Edging.kSubpixelAntiAlias)
    return f


def width(s, face, size, track=0.0):
    f = font(face, size)
    return sum(f.measureText(ch) for ch in s) + track * size * max(0, len(s) - 1) if track else f.measureText(s)


def text(c, s, x, y, face, size, rgb, a=1.0, align="left", track=0.0):
    if a <= 0.004:
        return
    f = font(face, size)
    w = width(s, face, size, track)
    x0 = x - w / 2 if align == "center" else x - w if align == "right" else x
    p = paint(rgb, a)
    if not track:
        c.drawString(s, x0, y, f, p)
        return
    for ch in s:
        c.drawString(ch, x0, y, f, p)
        x0 += f.measureText(ch) + track * size


def line_in(c, s, x, y, face, size, rgb, p, align="left", a=1.0, track=0.0):
    """Masked line reveal: the line slides up from behind its own baseline."""
    if p <= 0:
        return
    w = width(s, face, size, track)
    x0 = x - w / 2 if align == "center" else x - w if align == "right" else x
    c.save()
    c.clipRect(skia.Rect.MakeLTRB(x0 - 30, y - size * 1.05, x0 + w + 30, y + size * 0.3))
    text(c, s, x, y + (1 - ease_out(p)) * size * 1.15, face, size, rgb, a * min(1, p * 2), align, track)
    c.restore()


def rrect(c, x, y, w, h, r, p):
    c.drawRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(x, y, w, h), r, r), p)


def shadow(c, x, y, w, h, r, a=0.5, blur=36, dy=24):
    p = paint((0, 0, 0), a)
    p.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, blur / 2))
    rrect(c, x + w * 0.03, y + dy, w * 0.94, h * 0.97, r, p)


# ------------------------------------------------------------------ media


def load(path, w, h):
    """Any image/video frame scaled & centre-cropped to w×h as a skia image."""
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
                          "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], capture_output=True, check=True).stdout
    return skia.Image.fromarray(np.frombuffer(raw, np.uint8).reshape(h, w, 4).copy())


def footage(path, start, dur, w, h):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", f"{start}", "-t", f"{dur}", "-i", path, "-vf",
                          f"fps=30,scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
                         capture_output=True, check=True).stdout
    n = len(raw) // (w * h * 4)
    arr = np.frombuffer(raw, np.uint8)[: n * w * h * 4].reshape(n, h, w, 4)
    return [skia.Image.fromarray(np.ascontiguousarray(a)) for a in arr]


def shot(slug, n):
    return os.path.join(MEDIA, slug, "shots", f"d{n:02d}.webp")


print("loading media…")
WALL_SRC = [(s, n) for s in ["villa-dea", "isola-del-gioiello", "onda", "carruleddhi-show", "shistoria", "pizzeria", "grindi-group", "oltre", "rena-bianca", "cagliari-club", "lumo"] for n in (1, 2, 3)]
THUMBS = [load(shot(s, n), 240, 240) for s, n in WALL_SRC if os.path.exists(shot(s, n))]
SQUARES = [load(shot(s, n), 420, 420) for s, n in [("villa-dea", 2), ("onda", 2), ("isola-del-gioiello", 3), ("carruleddhi-show", 2), ("shistoria", 3), ("grindi-group", 2), ("pizzeria", 2), ("oltre", 2)]]
SHOW = [
    ("Villa Dea", "Sito web  ·  Aglientu, Sardegna", "villa-dea", 6.0, 4.0),
    ("L'Isola del Gioiello", "E-commerce  ·  Santa Teresa Gallura", "isola-del-gioiello", 6.0, 3.0),
]
BROWSER_W, BROWSER_H = 1040, 650
PHONE_W, PHONE_H = 250, 540
DESK = [footage(os.path.join(MEDIA, s, "desktop.mp4"), d0, 2.4, BROWSER_W, BROWSER_H - 44) for _, _, s, d0, _ in SHOW]
MOB = [footage(os.path.join(MEDIA, s, "mobile.mp4"), m0, 2.4, PHONE_W - 20, PHONE_H - 20) for _, _, s, _, m0 in SHOW]

# graded look: lifted cool shadows, warm highlights, slightly softer contrast
GRADE = skia.ColorFilters.Matrix([
    0.985, 0.01, 0.0, 0, 0.016,
    0.0, 0.975, 0.01, 0, 0.014,
    0.0, 0.02, 0.92, 0, 0.03,
    0, 0, 0, 1, 0,
])
rng = np.random.default_rng(3)
GRAIN = []
for _ in range(6):
    g = rng.normal(128, 38, (H // 2, W // 2)).clip(0, 255).astype(np.uint8)
    a = np.dstack([g, g, g, np.full_like(g, 255)])
    GRAIN.append(skia.Image.fromarray(np.ascontiguousarray(a)))


def finish(c, t):
    """Vignette + fine film grain on top of the graded frame."""
    vig = skia.Paint()
    vig.setShader(skia.GradientShader.MakeRadial(skia.Point(W / 2, H / 2), W * 0.72, [argb((0, 0, 0), 0), argb((0, 0, 0), 0), argb((0, 0, 0), 0.42)], [0, 0.55, 1]))
    c.drawRect(skia.Rect.MakeWH(W, H), vig)
    gp = skia.Paint()
    gp.setBlendMode(skia.BlendMode.kOverlay)
    gp.setAlphaf(0.07)
    c.drawImageRect(GRAIN[int(t * 24) % len(GRAIN)], skia.Rect.MakeWH(W, H), SAMPLING, gp)


# ------------------------------------------------------------------ the square motif


def tile_wipe(c, t, at, rgb, dur=0.8, origin="diag", cols=16, rows=9):
    """A grid of squares grows to cover the frame, then shrinks away (scene swap happens at `at`)."""
    p = prog(t, at - dur / 2, at + dur / 2)
    if p <= 0 or p >= 1:
        return
    tw, th = W / cols, H / rows
    maxd = math.hypot(cols / 2, rows / 2)
    for i in range(cols):
        for j in range(rows):
            if origin == "center":
                d = math.hypot(i + 0.5 - cols / 2, j + 0.5 - rows / 2) / maxd
            elif origin == "right":
                d = (cols - 1 - i) / (cols - 1) * 0.8 + (j % 2) * 0.1
            else:
                d = (i / (cols - 1) + (rows - 1 - j) / (rows - 1)) / 2
            if p < 0.5:
                s = ease_in_out(clamp((p / 0.5 - d * 0.55) / 0.45))
            else:
                s = 1 - ease_in_out(clamp(((p - 0.5) / 0.5 - d * 0.55) / 0.45))
            if s <= 0.01:
                continue
            size = tw * 1.02 * s
            r = lerp(10, 0, s)
            rrect(c, i * tw + (tw - size) / 2, j * th + (th - size) / 2, size, size, r, paint(rgb))


def flip_square(c, img_a, img_b, x, y, size, p, r=18):
    """A square card flipping on its vertical axis: shows img_a, then img_b."""
    sx = abs(math.cos(p * math.pi)) if 0 < p < 1 else 1.0
    img = img_a if p < 0.5 else img_b
    w = size * max(0.02, sx)
    c.save()
    rr = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(x + (size - w) / 2, y, w, size), r, r)
    c.clipRRect(rr, True)
    c.drawImageRect(img, rr.rect(), SAMPLING)
    if 0 < p < 1:  # a touch of shading while it turns
        c.drawRect(rr.rect(), paint((0, 0, 0), (1 - sx) * 0.5))
    c.restore()


# ------------------------------------------------------------------ scenes


def s1_wall(c, t):
    """0–2 · a wall of project tiles assembles from the centre; name over a soft gradient."""
    c.clear(argb(BG))
    cols, rows = 12, 7
    gap = 10
    size = (H - gap * (rows + 1)) / rows * 1.06
    total_w = cols * size + (cols - 1) * gap
    ox, oy = (W - total_w) / 2, (H - (rows * size + (rows - 1) * gap)) / 2
    zoom = lerp(1.08, 1.0, ease_out(prog(t, 0, 2.0)))
    c.save()
    c.translate(W / 2, H / 2)
    c.scale(zoom, zoom)
    c.translate(-W / 2, -H / 2)
    maxd = math.hypot(cols / 2, rows / 2)
    for i in range(cols):
        for j in range(rows):
            d = math.hypot(i + 0.5 - cols / 2, j + 0.5 - rows / 2) / maxd
            p = ease_out(prog(t, d * 0.55, d * 0.55 + 0.6))
            if p <= 0:
                continue
            s = size * lerp(0.6, 1, p)
            x = ox + i * (size + gap) + (size - s) / 2
            y = oy + j * (size + gap) + (size - s) / 2
            img = THUMBS[(i * 7 + j * 3) % len(THUMBS)]
            rr = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(x, y, s, s), 14, 14)
            c.save()
            c.clipRRect(rr, True)
            ip = skia.Paint()
            ip.setAlphaf(p)
            c.drawImageRect(img, rr.rect(), SAMPLING, ip)
            c.restore()
    c.restore()
    # darken for legibility: overall dim + a left-to-right gradient
    dim = prog(t, 0.5, 1.2)
    c.drawRect(skia.Rect.MakeWH(W, H), paint(BG, 0.45 * dim))
    g = skia.Paint()
    g.setShader(skia.GradientShader.MakeLinear([skia.Point(0, 0), skia.Point(W, 0)], [argb(BG, 0.94 * dim), argb(BG, 0.7 * dim), argb(BG, 0.0)], [0, 0.45, 0.85]))
    c.drawRect(skia.Rect.MakeWH(W, H), g)
    x = 150
    line_in(c, "PORTFOLIO  2026", x, 420, F_LABEL, 26, GOLD, prog(t, 0.6, 1.1), track=0.3)
    line_in(c, "Claudio Taras", x, 560, F_BLACK, 150, TEXT, prog(t, 0.7, 1.3), track=-0.02)
    line_in(c, "Web designer & developer", x, 640, F_LIGHT, 52, TEXT, prog(t, 0.9, 1.45), a=0.85)
    bar = ease_out(prog(t, 1.1, 1.7))
    c.drawRect(skia.Rect.MakeXYWH(x, 690, 120 * bar, 4), paint(GOLD))


WORDS = ["siti web", "e-commerce", "web app", "brand"]
WORD_AT = [2.15, 2.7, 3.15, 3.6]
FLIPS = [(2.75, 0, 4), (3.0, 3, 5), (3.3, 1, 6), (3.55, 2, 7)]  # time, square index, new image


def s2_create(c, t):
    """2–4 · "Creo [word]" on the left, a 2×2 grid of project squares flipping on the right."""
    c.clear(argb(BG))
    x = 150
    line_in(c, "COSA FACCIO", x, 380, F_LABEL, 26, GOLD, prog(t, 2.1, 2.5), track=0.3)
    line_in(c, "Creo", x, 500, F_LIGHT, 110, TEXT, prog(t, 2.15, 2.6), track=-0.01)
    # rolling word in gold, masked
    c.save()
    c.clipRect(skia.Rect.MakeLTRB(x - 10, 520, x + 900, 660))
    for i, w in enumerate(WORDS):
        pin = prog(t, WORD_AT[i], WORD_AT[i] + 0.35)
        pout = prog(t, WORD_AT[i + 1], WORD_AT[i + 1] + 0.3) if i + 1 < len(WORDS) else 0
        if pin <= 0 or pout >= 1:
            continue
        y = 630 + (1 - ease_out(pin)) * 140 - ease_in_out(pout) * 140
        text(c, w, x, y, F_BLACK, 130, GOLD, 1, track=-0.02)
    c.restore()
    line_in(c, "che fanno crescere il tuo business.", x, 730, F_SEMI, 44, MUTED, prog(t, 2.45, 2.9))
    # 2×2 squares
    size, gap = 300, 22
    gx, gy = W - 150 - size * 2 - gap, (H - size * 2 - gap) / 2
    imgs = [0, 1, 2, 3]
    for i in range(4):
        sx, sy = gx + (i % 2) * (size + gap), gy + (i // 2) * (size + gap)
        pin = ease_out(prog(t, 2.1 + i * 0.07, 2.65 + i * 0.07))
        if pin <= 0:
            continue
        cur, nxt, fp = imgs[i], imgs[i], 0.0
        for ft, idx, new in FLIPS:
            if idx == i and t >= ft:
                fp = prog(t, ft, ft + 0.4)
                cur, nxt = imgs[i], new
                if fp >= 1:
                    imgs[i] = new
                    cur, nxt, fp = new, new, 0.0
        s = size * lerp(0.85, 1, pin)
        c.saveLayerAlpha(None, int(255 * pin))
        shadow(c, sx, sy, size, size, 18, 0.45)
        flip_square(c, SQUARES[cur], SQUARES[nxt], sx + (size - s) / 2, sy + (size - s) / 2, s, fp)
        c.restore()


def browser(c, x, y, frames_a, frames_b, t, t0, swap_at):
    w, h = BROWSER_W, BROWSER_H
    shadow(c, x, y, w, h, 16, 0.55, 60, 34)
    rrect(c, x, y, w, h, 16, paint(BG2))
    for k, col in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        c.drawCircle(x + 26 + k * 22, y + 22, 6.5, paint(col, 0.85))
    rrect(c, x + w / 2 - 170, y + 10, 340, 24, 12, paint((255, 255, 255), 0.06))
    screen = skia.Rect.MakeXYWH(x, y + 44, w, h - 44)
    c.save()
    c.clipRRect(skia.RRect.MakeRectXY(screen, 0, 0), True)
    fa = frames_a[min(len(frames_a) - 1, int((t - t0) * 30))]
    c.drawImageRect(fa, screen, SAMPLING)
    if t >= swap_at - 0.4:
        fb = frames_b[min(len(frames_b) - 1, max(0, int((t - swap_at + 0.4) * 30)))]
        mini_wipe(c, screen, fb, prog(t, swap_at - 0.4, swap_at + 0.4))
    c.restore()


def mini_wipe(c, rect, img_b, p, cols=13):
    """Inside a frame: squares grow to reveal the next project's footage."""
    if p <= 0:
        return
    if p >= 1:
        c.drawImageRect(img_b, rect, SAMPLING)
        return
    size = rect.width() / cols
    rows = int(math.ceil(rect.height() / size))
    for i in range(cols):
        for j in range(rows):
            d = (i / (cols - 1) + j / max(1, rows - 1)) / 2
            s = ease_in_out(clamp((p - d * 0.5) / 0.5))
            if s <= 0:
                continue
            cx, cy = rect.left() + (i + 0.5) * size, rect.top() + (j + 0.5) * size
            q = size * s * 1.02
            cell = skia.Rect.MakeXYWH(cx - q / 2, cy - q / 2, q, q)
            src = skia.Rect.MakeXYWH((cx - q / 2 - rect.left()) / rect.width() * img_b.width(), (cy - q / 2 - rect.top()) / rect.height() * img_b.height(),
                                     q / rect.width() * img_b.width(), q / rect.height() * img_b.height())
            c.drawImageRect(img_b, src, cell, SAMPLING)


def phone(c, x, y, frames_a, frames_b, t, t0, swap_at):
    w, h = PHONE_W, PHONE_H
    shadow(c, x, y, w, h, 40, 0.6, 50, 30)
    rrect(c, x, y, w, h, 40, paint((28, 28, 32)))
    rrect(c, x, y, w, h, 40, paint((255, 255, 255), 0.12, stroke=1.5))
    screen = skia.Rect.MakeXYWH(x + 10, y + 10, w - 20, h - 20)
    c.save()
    c.clipRRect(skia.RRect.MakeRectXY(screen, 31, 31), True)
    c.drawImageRect(frames_a[min(len(frames_a) - 1, int((t - t0) * 30))], screen, SAMPLING)
    if t >= swap_at - 0.3:
        fb = frames_b[min(len(frames_b) - 1, max(0, int((t - swap_at + 0.3) * 30)))]
        mini_wipe(c, screen, fb, prog(t, swap_at - 0.3, swap_at + 0.45), cols=5)
    c.restore()
    rrect(c, x + w / 2 - 38, y + 18, 76, 20, 10, paint((0, 0, 0)))


def s3_work(c, t):
    """4–8 · selected work: a browser and a phone with real footage; the project changes at 6."""
    c.clear(argb(BG))
    glow = skia.Paint()
    glow.setShader(skia.GradientShader.MakeRadial(skia.Point(W * 0.64, H * 0.5), 760, [argb(GOLD, 0.10), argb(GOLD, 0.0)], [0, 1]))
    c.drawRect(skia.Rect.MakeWH(W, H), glow)
    x = 150
    line_in(c, "PROGETTI SELEZIONATI", x, 330, F_LABEL, 26, GOLD, prog(t, 4.1, 4.5), track=0.3)
    for i, (name, meta, *_rest) in enumerate(SHOW):
        start = 4.15 if i == 0 else 6.05
        end = 5.85 if i == 0 else 99
        pin = prog(t, start, start + 0.5)
        pout = prog(t, end, end + 0.3)
        if pin <= 0 or pout >= 1:
            continue
        dy = -ease_in_out(pout) * 120
        # long names go on two lines
        lines = [name] if width(name, F_BLACK, 92, -0.02) < 560 else [name[: name.index(" del ")], name[name.index(" del ") + 1 :]]
        c.save()
        c.clipRect(skia.Rect.MakeLTRB(x - 20, 330, x + 640, 640))
        for k, ln in enumerate(lines):
            line_in(c, ln, x, 450 + k * 92 + dy, F_BLACK, 92, TEXT, prog(t, start + k * 0.08, start + 0.5 + k * 0.08), track=-0.02)
        c.restore()
        line_in(c, meta, x, 450 + (len(lines) - 1) * 92 + 72 + dy, F_LIGHT, 36, (186, 186, 194), prog(t, start + 0.15, start + 0.6), a=1 - pout)
        counter = f"0{i + 1}  /  02"
        line_in(c, counter, x, 760, F_LABEL, 26, TEXT, prog(t, start + 0.2, start + 0.6), a=0.6 * (1 - pout), track=0.2)
    enter = ease_out(prog(t, 4.0, 4.7))
    bx, by = lerp(W + 100, 760, enter), 215
    browser(c, bx, by, DESK[0], DESK[1], t, 4.0, 6.0)
    phone(c, lerp(W + 300, 1580, ease_out(prog(t, 4.15, 4.85))), 420, MOB[0], MOB[1], t, 4.0, 6.05)


def fit(s, face, max_w, start):
    size = start
    while size > 30 and width(s, face, size) > max_w:
        size -= 3
    return size


STATS = [("13+", "progetti online"), ("7", "anni di esperienza"), ("6", "lingue")]


def s4_numbers(c, t):
    """8–10 · three numbers counting up, thin gold rules."""
    c.clear(argb(BG))
    line_in(c, "IN NUMERI", W / 2, 300, F_LABEL, 26, GOLD, prog(t, 8.05, 8.45), align="center", track=0.3)
    col_w = 460
    x0 = W / 2 - col_w * 1.5
    for i, (n, label) in enumerate(STATS):
        cx = x0 + col_w * (i + 0.5)
        p = prog(t, 8.1 + i * 0.12, 8.9 + i * 0.12)
        num = int("".join(ch for ch in n if ch.isdigit()))
        shown = f"{round(num * ease_out(p))}{'+' if '+' in n else ''}"
        line_in(c, shown, cx, 600, F_BLACK, 220, TEXT, prog(t, 8.1 + i * 0.12, 8.6 + i * 0.12), align="center", track=-0.03)
        line_in(c, label, cx, 690, F_LIGHT, 40, MUTED, prog(t, 8.3 + i * 0.12, 8.8 + i * 0.12), align="center")
        rule = ease_out(prog(t, 8.45 + i * 0.12, 9.1 + i * 0.12))
        c.drawRect(skia.Rect.MakeXYWH(cx - 60 * rule, 740, 120 * rule, 3), paint(GOLD))
        if i:
            c.drawRect(skia.Rect.MakeXYWH(x0 + col_w * i, 430 + (1 - rule) * 150, 1, 300 * rule), paint(TEXT, 0.12))


SERVICES = [("01", "Design", "UI · UX · brand"), ("02", "Sviluppo", "siti · e-commerce · app"), ("03", "SEO", "Google · velocità"), ("04", "Marketing", "campagne · contenuti")]


def icon(c, k, x, y, s, rgb):
    p = paint(rgb, 1, stroke=s * 0.07)
    if k == 0:  # pen nib / design: overlapping circle + square
        c.drawCircle(x - s * 0.12, y - s * 0.05, s * 0.26, p)
        rrect(c, x - s * 0.05, y - s * 0.12, s * 0.42, s * 0.42, s * 0.06, p)
    elif k == 1:  # code </>
        path = skia.Path()
        path.moveTo(x - s * 0.18, y - s * 0.22)
        path.lineTo(x - s * 0.42, y)
        path.lineTo(x - s * 0.18, y + s * 0.22)
        path.moveTo(x + s * 0.18, y - s * 0.22)
        path.lineTo(x + s * 0.42, y)
        path.lineTo(x + s * 0.18, y + s * 0.22)
        path.moveTo(x + s * 0.08, y - s * 0.3)
        path.lineTo(x - s * 0.08, y + s * 0.3)
        c.drawPath(path, p)
    elif k == 2:  # search
        c.drawCircle(x - s * 0.07, y - s * 0.07, s * 0.25, p)
        c.drawLine(x + s * 0.12, y + s * 0.12, x + s * 0.34, y + s * 0.34, p)
    else:  # growth chart
        path = skia.Path()
        path.moveTo(x - s * 0.38, y + s * 0.26)
        path.lineTo(x - s * 0.1, y - s * 0.02)
        path.lineTo(x + s * 0.06, y + s * 0.12)
        path.lineTo(x + s * 0.38, y - s * 0.24)
        path.moveTo(x + s * 0.18, y - s * 0.24)
        path.lineTo(x + s * 0.38, y - s * 0.24)
        path.lineTo(x + s * 0.38, y - s * 0.04)
        c.drawPath(path, p)


def s5_services(c, t):
    """10–12 · on warm paper: four square cards turn in; a gold highlight steps across them."""
    c.clear(argb(PAPER))
    x = 150
    line_in(c, "DAL DESIGN AL LANCIO", x, 250, F_LABEL, 26, (160, 120, 30), prog(t, 10.05, 10.45), track=0.3)
    line_in(c, "Un solo partner, tutto il progetto.", x, 350, F_BLACK, 76, INK, prog(t, 10.1, 10.6), track=-0.02)
    size, gap = 372, 28
    gx = (W - (size * 4 + gap * 3)) / 2
    gy = 450
    active = int(prog(t, 10.7, 12.0) * 4.0) if t >= 10.7 else -1
    for i, (num, name, sub) in enumerate(SERVICES):
        p = prog(t, 10.2 + i * 0.1, 10.75 + i * 0.1)
        if p <= 0:
            continue
        sx = abs(math.cos((1 - ease_out(p)) * math.pi / 2))  # turns in from edge-on
        cx = gx + i * (size + gap)
        w = size * max(0.02, sx)
        on = i == min(active, 3)
        fill = GOLD if on else (255, 255, 255)
        shadow(c, cx + (size - w) / 2, gy, w, size, 20, 0.12, 30, 18)
        rrect(c, cx + (size - w) / 2, gy, w, size, 20, paint(fill))
        if sx > 0.6:
            a = prog(sx, 0.6, 1)
            c.save()
            c.clipRect(skia.Rect.MakeXYWH(cx, gy, size, size))
            text(c, num, cx + 36, gy + 64, F_LABEL, 28, INK, 0.55 * a, track=0.1)
            icon(c, i, cx + size - 80, gy + 72, 74, INK)
            text(c, name, cx + 36, gy + size - 96, F_BLACK, 58, INK, a, track=-0.02)
            text(c, sub, cx + 36, gy + size - 48, F_SEMI, 26, INK, 0.6 * a)
            c.restore()


def s6_end(c, t):
    """12–15 · contact card; a 3×3 grid of project squares keeps swapping on the right."""
    c.clear(argb(BG))
    glow = skia.Paint()
    glow.setShader(skia.GradientShader.MakeRadial(skia.Point(W * 0.78, H * 0.5), 700, [argb(GOLD, 0.09), argb(GOLD, 0.0)], [0, 1]))
    c.drawRect(skia.Rect.MakeWH(W, H), glow)
    x = 150
    line_in(c, "CONTATTI", x, 300, F_LABEL, 26, GOLD, prog(t, 12.1, 12.5), track=0.3)
    line_in(c, "Parliamo del", x, 420, F_BLACK, 112, TEXT, prog(t, 12.15, 12.65), track=-0.02)
    line_in(c, "tuo progetto.", x, 540, F_BLACK, 112, GOLD, prog(t, 12.25, 12.75), track=-0.02)
    rows = [(EMAIL, "mail"), (PHONE, "phone")]
    for i, (label, kind) in enumerate(rows):
        p = prog(t, 12.6 + i * 0.15, 13.1 + i * 0.15)
        y = 660 + i * 92
        line_in(c, label, x + 78, y, F_SEMI, 50, TEXT, p)
        a = ease_out(p)
        ic = paint(GOLD, a, stroke=3.2)
        if kind == "mail":
            c.drawRoundRect(skia.Rect.MakeXYWH(x, y - 36, 50, 36), 6, 6, ic)
            path = skia.Path()
            path.moveTo(x + 4, y - 32)
            path.lineTo(x + 25, y - 15)
            path.lineTo(x + 46, y - 32)
            c.drawPath(path, ic)
        else:
            c.drawRoundRect(skia.Rect.MakeXYWH(x + 11, y - 44, 28, 48), 6, 6, ic)
            c.drawLine(x + 21, y - 5, x + 29, y - 5, ic)
    line_in(c, "Claudio Taras  ·  Web designer & developer", x, 900, F_LIGHT, 32, MUTED, prog(t, 13.0, 13.5))
    # 3×3 squares, swapping one by one
    size, gap = 196, 16
    gx, gy = W - 150 - 3 * size - 2 * gap, (H - 3 * size - 2 * gap) / 2
    for k in range(9):
        i, j = k % 3, k // 3
        pin = ease_out(prog(t, 12.2 + (i + j) * 0.07, 12.8 + (i + j) * 0.07))
        if pin <= 0:
            continue
        sx, sy = gx + i * (size + gap), gy + j * (size + gap)
        base = THUMBS[(k * 5 + 2) % len(THUMBS)]
        flip_at = 13.2 + ((k * 4) % 9) * 0.16
        nxt = THUMBS[(k * 5 + 11) % len(THUMBS)]
        fp = prog(t, flip_at, flip_at + 0.45)
        s = size * lerp(0.7, 1, pin)
        c.saveLayerAlpha(None, int(255 * pin))
        flip_square(c, base, nxt, sx + (size - s) / 2, sy + (size - s) / 2, s, fp, r=16)
        c.restore()


SCENES = [(0, 2.0, s1_wall), (2.0, 4.0, s2_create), (4.0, 8.0, s3_work), (8.0, 10.0, s4_numbers), (10.0, 12.0, s5_services), (12.0, 15.01, s6_end)]
CHARCOAL = (38, 38, 44)
WIPES = [(2.0, GOLD, "diag"), (4.0, CHARCOAL, "right"), (8.0, CHARCOAL, "center"), (10.0, PAPER, "diag"), (12.0, GOLD, "center")]


def draw_frame(c, t):
    grade = skia.Paint()
    grade.setColorFilter(GRADE)
    c.saveLayer(None, grade)
    for a, b, fn in SCENES:
        if a <= t < b:
            c.save()
            fn(c, t)
            c.restore()
            break
    for at, rgb, origin in WIPES:
        tile_wipe(c, t, at, rgb, origin=origin)
    c.restore()
    finish(c, t)


def render_video(path):
    buf = np.zeros((H, W, 4), np.uint8)
    c = skia.Surface(buf, colorType=skia.kRGBA_8888_ColorType).getCanvas()
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", path], stdin=subprocess.PIPE)
    for i in range(int(DUR * FPS)):
        draw_frame(c, i / FPS)
        ff.stdin.write(buf.tobytes())
        if i % 120 == 0:
            print(f"  {i / FPS:4.1f}s")
    ff.stdin.close()
    ff.wait()


# ------------------------------------------------------------------ soundtrack: Rhodes, half-time, no SFX

SR = 48000


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def rhodes(m, dur, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(m)
    index = (1.4 * vel) * np.exp(-t / 0.22) + 0.18
    body = np.sin(2 * np.pi * f * t + index * np.sin(2 * np.pi * f * t))
    tine = 0.1 * vel * np.sin(2 * np.pi * f * 7.02 * t) * np.exp(-t / 0.06)
    env = (1 - np.exp(-t / 0.004)) * np.exp(-t / (1.6 if m < 60 else 1.1))
    rel = np.minimum(1, (n - np.arange(n)) / (0.12 * SR))
    return (body + tine) * env * rel * 0.16 * vel


def chord(notes, dur, vel=1.0):
    n = int((dur + 0.05) * SR)
    l, r = np.zeros(n), np.zeros(n)
    for k, m in enumerate(notes):
        v = rhodes(m, dur, vel)
        off = int(k * 0.012 * SR)  # a soft strum
        pan = (k / max(1, len(notes) - 1) - 0.5) * 0.6
        seg = v[: n - off]
        l[off : off + len(seg)] += seg * math.cos((pan + 1) * math.pi / 4) * 1.41
        r[off : off + len(seg)] += seg * math.sin((pan + 1) * math.pi / 4) * 1.41
    t = np.arange(n) / SR
    trem = 0.12 * np.sin(2 * np.pi * 4.2 * t)  # stereo tremolo, the Rhodes "wobble"
    return [l * (1 + trem), r * (1 - trem)]


def sub(m, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * hz(m) * t) + 0.25 * np.sin(2 * np.pi * hz(m) * 2 * t)
    env = (1 - np.exp(-t / 0.01)) * np.minimum(1, (n - np.arange(n)) / (0.05 * SR))
    return np.tanh(x * 1.3) * env * 0.34


def soft_kick():
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 44 + 70 * np.exp(-t * 26)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22) * 0.85


def snare():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    noise = sr.fft_filter(np.random.default_rng(5).standard_normal(n), lo=1400, hi=9000) * np.exp(-t / 0.09)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    return (noise * 0.5 + tone * 0.35) * 0.55


def shaker(decay=0.03):
    n = int(decay * 6 * SR)
    t = np.arange(n) / SR
    x = sr.fft_filter(np.random.default_rng(9).standard_normal(n), lo=6500)
    return x * (1 - np.exp(-t / 0.006)) * np.exp(-t / decay) * 0.3


def bell(m, dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(m)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / 0.3)) * np.exp(-t / 0.5) * (1 - np.exp(-t / 0.003)) * 0.11


PROG = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 55, 59, 64]]  # Fmaj7 Em7 Dm7 Cmaj7
ROOTS = [41, 40, 38, 36]
MELODY = [(0.75, 76), (1.0, 74), (1.5, 72), (2.75, 74), (3.25, 71), (4.75, 72), (5.0, 69), (5.5, 72), (6.75, 71), (7.25, 67)]  # (beat in a 4-bar phrase, note)


def build_audio(path):
    L = int(DUR * SR) + SR
    keys, bass, drums, send = (np.zeros((2, L)) for _ in range(4))
    bar = 2.0
    n_bars = int(math.ceil(DUR / bar))
    K, S, SH, SHO = soft_kick(), snare(), shaker(0.022), shaker(0.06)
    kicks = []
    for b in range(n_bars):
        t0 = b * bar
        ci = b % 4
        last = t0 >= 12.0
        # Rhodes: the chord on 1, a softer push on the "and" of 2
        sr.add_lr(keys, chord(PROG[ci], 2.2 if not last else DUR - t0 + 0.2, 0.9), t0, 1.0, send, 0.35)
        if not last:
            sr.add_lr(keys, chord(PROG[ci][1:], 0.9, 0.55), t0 + 0.75, 0.7, send, 0.35)
        # bass from bar 2
        if b >= 1:
            sr.add(bass, sub(ROOTS[ci], 0.7), t0, 1.0)
            sr.add(bass, sub(ROOTS[ci], 0.45), t0 + 0.75, 0.8)
            if not last:
                sr.add(bass, sub(ROOTS[ci] + 7, 0.3), t0 + 1.5, 0.6)
        # half-time groove from bar 2 until the end card
        if 1 <= b and not last:
            for kt in (0.0, 1.25):
                sr.add(drums, K, t0 + kt, 1.0)
                kicks.append(t0 + kt)
            sr.add(drums, S, t0 + 1.0, 0.9, 0.0, send, 0.5)
            for k in range(16):
                swing = 0.028 if k % 2 else 0.0
                sr.add(drums, SHO if k % 4 == 2 else SH, t0 + k * 0.125 + swing, (0.7 if k % 4 == 2 else 0.45 if k % 2 else 0.6) * (0.6 if b == 1 else 1.0), 0.35)
    # a bell melody over the middle (bars 2–5)
    for phrase_start in (4.0,):
        for beat, m in MELODY:
            t = phrase_start + beat * 0.5
            if t < 12.0:
                sr.add(keys, bell(m), t, 0.9, 0.2, send, 0.6)
    # end: one last open chord at 14
    sr.add(keys, bell(81, 2.0), 12.0, 0.8, 0.0, send, 0.8)
    sr.add(keys, bell(76, 2.0), 13.0, 0.6, 0.2, send, 0.8)

    sc = np.ones(L)
    tt = np.arange(int(0.5 * SR)) / SR
    dip = 1 - 0.45 * np.exp(-tt / 0.13)
    for k in kicks:
        i = int(k * SR)
        seg = dip[: L - i]
        sc[i : i + len(seg)] = np.minimum(sc[i : i + len(seg)], seg)
    keys *= sc
    bass *= sc
    wet = sr.reverb(send, 2.6)
    # intro: open a low-pass on the keys over the first bar
    n0 = int(2.0 * SR)
    lp = sr.fft_filter(keys[0, :n0], hi=900), sr.fft_filter(keys[1, :n0], hi=900)
    fade_in = np.linspace(0, 1, n0) ** 1.5
    keys[0, :n0] = lp[0] * (1 - fade_in) + keys[0, :n0] * fade_in
    keys[1, :n0] = lp[1] * (1 - fade_in) + keys[1, :n0] * fade_in
    mix = keys * 1.0 + bass * 0.9 + drums * 0.8 + wet * 0.35
    track = np.vstack([sr.fft_filter(mix[0], lo=30), sr.fft_filter(mix[1], lo=30)])
    total = int(DUR * SR)
    fade = int(1.2 * SR)
    track[:, total - fade : total] *= np.linspace(1, 0, fade) ** 1.3
    track = track[:, :total]
    track = np.tanh(track / (np.max(np.abs(track)) + 1e-9) * 1.25) * 0.88
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((track.T * 32767).astype(np.int16).tobytes())


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = os.path.join(ROOT, ".capture", "promo")
    os.makedirs(tmp, exist_ok=True)
    if "--frames" in sys.argv:
        times = [float(x) for x in sys.argv[sys.argv.index("--frames") + 1].split(",")]
        buf = np.zeros((H, W, 4), np.uint8)
        c = skia.Surface(buf, colorType=skia.kRGBA_8888_ColorType).getCanvas()
        tiles = []
        for t in times:
            draw_frame(c, t)
            tiles.append(buf[::3, ::3, :3].copy())
        cols = min(4, len(tiles))
        rows = (len(tiles) + cols - 1) // cols
        th, tw = tiles[0].shape[:2]
        sheet = np.full((rows * (th + 6), cols * (tw + 6), 3), 70, np.uint8)
        for i, tile in enumerate(tiles):
            r, q = divmod(i, cols)
            sheet[r * (th + 6) : r * (th + 6) + th, q * (tw + 6) : q * (tw + 6) + tw] = tile
        raw = os.path.join(tmp, "wide.rgb")
        sheet.tofile(raw)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{sheet.shape[1]}x{sheet.shape[0]}", "-i", raw, os.path.join(tmp, "wide-sheet.jpg")], check=True)
        print("sheet:", os.path.join(tmp, "wide-sheet.jpg"))
        return
    video = os.path.join(tmp, "wide.mp4")
    audio = os.path.join(tmp, "wide.wav")
    if "--audio-only" not in sys.argv:
        print("rendering video…")
        render_video(video)
    print("building soundtrack…")
    build_audio(audio)
    out = os.path.join(OUT_DIR, "claudio-taras-promo-it-16x9.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-movflags", "+faststart", "-shortest", out], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "14", "-i", out, "-frames:v", "1", "-q:v", "3", os.path.join(OUT_DIR, "claudio-taras-promo-it-16x9-poster.jpg")], check=True)
    print("done:", out, round(os.path.getsize(out) / 1e6, 1), "MB")


if __name__ == "__main__":
    main()
