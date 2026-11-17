"""
30-second Italian promo, 16:9 (1920x1080, 60 fps): motion graphics, dynamic and hopeful.
128 BPM → 16 bars = exactly 30 s; every cut, wipe and pop lands on the beat.
  spark of light → "Hai un'idea? / Facciamola brillare." → the spark becomes a sun and floods the frame →
  name + rolling services → DROP: three real projects (laptop + phone, live footage, stripe wipes) →
  tilted wall of all projects with the numbers → "Il tuo progetto può essere il prossimo." under a
  rising sun → contact → everything folds back into the spark of frame 0 (seamless loop).
Music: uplifting pop-house in D major (I–V–vi–IV): hopeful piano intro, build with a snare roll,
drop with supersaw chords and a soaring lead, piano anthem, soft outro that flows into the loop.

  .capture/pyenv/Scripts/python.exe scripts/promo_motion.py          (parallel chunks; env CHUNKS, default 12)
  … --frames 0.5,3,…   preview sheet · --audio-only
Output: promo/claudio-taras-promo-it-motion-16x9.mp4
"""
import math
import os
import subprocess
import sys
import wave

import numpy as np
import skia
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import showreel as sr  # noqa: E402  (synth instruments + mixing helpers)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA = os.path.join(ROOT, "public", "media", "projects")
OUT_DIR = os.path.join(ROOT, "promo")
TMP = os.path.join(ROOT, ".capture", "promo")
W, H, FPS = 1920, 1080, 60
CX, CY = W / 2, H / 2
BPM = 128
B = 60 / BPM  # one beat
BAR = 4 * B
DUR = 16 * BAR  # = 30.0 s

INK, CREAM, WHITE = (10, 10, 14), (250, 245, 236), (255, 255, 255)
GOLD, CORAL, GREY = (255, 197, 61), (236, 92, 60), (150, 150, 160)
EMAIL, PHONE = "claudiotaras3@gmail.com", "+39 345 451 0973"

FONTS = "C:/Windows/Fonts"
F_HEAVY = skia.Typeface.MakeFromFile(f"{FONTS}/seguibl.ttf")
F_BOLD = skia.Typeface.MakeFromFile(f"{FONTS}/segoeuib.ttf")
F_SEMI = skia.Typeface.MakeFromFile(f"{FONTS}/seguisb.ttf")
SAMPLING = skia.SamplingOptions(skia.FilterMode.kLinear, skia.MipmapMode.kNone)
rng = np.random.default_rng(7)


def beat(n):
    return n * B


# ------------------------------------------------------------------ easing / drawing helpers


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def prog(t, a, b):
    return clamp((t - a) / (b - a)) if b > a else float(t >= a)


def out(p):  # expo out
    return 1.0 if p >= 1 else 1 - 2 ** (-10 * p)


def inn(p):  # expo in
    return 0.0 if p <= 0 else 2 ** (10 * p - 10)


def io(p):  # expo in-out
    if p <= 0:
        return 0.0
    if p >= 1:
        return 1.0
    return 2 ** (20 * p - 10) / 2 if p < 0.5 else (2 - 2 ** (-20 * p + 10)) / 2


def back(p, s=1.7):  # overshoot then settle
    p = clamp(p) - 1
    return 1 + (s + 1) * p ** 3 + s * p ** 2


def lerp(a, b, p):
    return a + (b - a) * p


def pulse(t, offset=0.0):
    """0→1→0 kick on every beat (fast attack, short decay)."""
    d = (t - offset) % B
    return d / 0.04 if d < 0.04 else math.exp(-(d - 0.04) / 0.16)


def argb(rgb, a=1.0):
    return skia.ColorSetARGB(int(255 * clamp(a)), *rgb)


def paint(rgb, a=1.0, stroke=0.0):
    p = skia.Paint(AntiAlias=True)
    p.setColor(argb(rgb, a))
    if stroke:
        p.setStyle(skia.Paint.kStroke_Style)
        p.setStrokeWidth(stroke)
        p.setStrokeCap(skia.Paint.kRound_Cap)
        p.setStrokeJoin(skia.Paint.kRound_Join)
    return p


def font(face, size):
    f = skia.Font(face, size)
    f.setSubpixel(True)
    f.setEdging(skia.Font.Edging.kAntiAlias)
    return f


def width(s, face, size, track=0.0):
    f = font(face, size)
    if not track:
        return f.measureText(s)
    return sum(f.measureText(ch) for ch in s) + track * size * (len(s) - 1)


def text(c, s, x, y, face, size, rgb, a=1.0, align="center", track=0.0):
    if a <= 0.004 or not s:
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


def masked(c, s, x, y, face, size, rgb, p_in, p_out=0.0, align="center", track=0.0, a=1.0):
    """A line that slides up out of a mask, and up into it again when leaving."""
    if p_in <= 0 or p_out >= 1:
        return
    w = width(s, face, size, track)
    x0 = x - w / 2 if align == "center" else x - w if align == "right" else x
    c.save()
    c.clipRect(skia.Rect.MakeLTRB(x0 - 30, y - size * 1.05, x0 + w + 30, y + size * 0.3))
    dy = (1 - out(p_in)) * size * 1.25 - io(p_out) * size * 1.25
    text(c, s, x, y + dy, face, size, rgb, a, align, track)
    c.restore()


def chars(c, s, x, y, face, size, rgb, t, at, out_at=None, stagger=0.026, dur=0.55, align="center", track=-0.02, a=1.0):
    """Per-letter reveal: each glyph rises out of the baseline mask, one after the other."""
    if t < at:
        return
    w = width(s, face, size, track)
    x0 = x - w / 2 if align == "center" else x - w if align == "right" else x
    f = font(face, size)
    p = paint(rgb, a)
    c.save()
    c.clipRect(skia.Rect.MakeLTRB(x0 - size, y - size * 1.05, x0 + w + size, y + size * 0.3))
    xx = x0
    for i, ch in enumerate(s):
        pi = out(prog(t, at + i * stagger, at + i * stagger + dur))
        po = 0.0 if out_at is None else io(prog(t, out_at + i * stagger * 0.6, out_at + i * stagger * 0.6 + dur * 0.6))
        if pi > 0 and po < 1 and ch != " ":
            c.drawString(ch, xx, y + (1 - pi) * size * 1.2 - po * size * 1.2, f, p)
        xx += f.measureText(ch) + track * size
    c.restore()


def fit(s, face, max_w, start, track=-0.02):
    size = start
    while size > 24 and width(s, face, size, track) > max_w:
        size -= 2
    return size


def rr(c, cx, cy, w, h, r, p):
    r = max(0.0, min(r, w / 2, h / 2))
    c.drawRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(cx - w / 2, cy - h / 2, w, h), r, r), p)


def rr_clip(c, cx, cy, w, h, r):
    r = max(0.0, min(r, w / 2, h / 2))
    c.clipRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(cx - w / 2, cy - h / 2, w, h), r, r), True)


def shadow(c, cx, cy, w, h, r, a=0.3, blur=60, dy=36):
    p = paint((0, 0, 0), a)
    p.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, blur / 2))
    rr(c, cx, cy + dy, w * 0.94, h * 0.96, r, p)


def fill(c, rgb, a=1.0):
    c.drawPaint(paint(rgb, a))


def gradient(c, c0, c1, p0=(0, 0), p1=(W, H)):
    g = skia.Paint()
    g.setShader(skia.GradientShader.MakeLinear([skia.Point(*p0), skia.Point(*p1)], [argb(c0), argb(c1)]))
    c.drawPaint(g)


def warm(c, x, y, rad, a, rgb=(64, 44, 14)):
    g = skia.Paint()
    g.setShader(skia.GradientShader.MakeRadial(skia.Point(x, y), rad, [argb(rgb, a), argb(rgb, 0)], [0, 1]))
    c.drawPaint(g)


def spark(c, x, y, r, a=1.0):
    """The gold point of light the film starts and ends on."""
    g = skia.Paint(AntiAlias=True)
    g.setShader(skia.GradientShader.MakeRadial(skia.Point(x, y), r * 5, [argb(GOLD, 0.38 * a), argb(GOLD, 0)], [0, 1]))
    c.drawCircle(x, y, r * 5, g)
    c.drawCircle(x, y, r, paint(GOLD, a))


def rays(c, x, y, r, t, a, grow=1.0, n=16, rgb=GOLD, stroke=6.0, spin=0.22):
    """Sunburst: alternating long/short rays turning slowly around (x, y)."""
    if a <= 0 or grow <= 0:
        return
    p = paint(rgb, a, stroke=stroke)
    for i in range(n):
        ang = t * spin + i * 2 * math.pi / n
        r0 = r * 1.35
        r1 = r0 + r * (0.75 if i % 2 == 0 else 0.42) * grow
        c.drawLine(x + math.cos(ang) * r0, y + math.sin(ang) * r0, x + math.cos(ang) * r1, y + math.sin(ang) * r1, p)


def star(c, x, y, r, rgb, a=1.0, rot=0.0):
    """Four-point sparkle."""
    if a <= 0 or r <= 0:
        return
    path = skia.Path()
    for k in range(8):
        ang = rot + k * math.pi / 4 - math.pi / 2
        rad = r if k % 2 == 0 else r * 0.26
        (path.moveTo if k == 0 else path.lineTo)(x + math.cos(ang) * rad, y + math.sin(ang) * rad)
    path.close()
    c.drawPath(path, paint(rgb, a))


def trim_path(c, path, p, pnt):
    """Draw only the first `p` of a path (stroke 'write-on')."""
    if p <= 0:
        return
    length = skia.PathMeasure(path, False).getLength()
    pnt.setPathEffect(skia.DashPathEffect.Make([length * p, length * 2 + 10], 0))
    c.drawPath(path, pnt)


# motes of light: fixed random params, used by several scenes
MOTES = rng.uniform(0, 1, (70, 5))

# ------------------------------------------------------------------ media (lazy: each chunk loads only what it shows)


def to_image(arr):
    return skia.Image.fromarray(np.ascontiguousarray(arr), colorType=skia.kRGBA_8888_ColorType)


def ffmpeg_rgba(args, w, h):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", *args, "-vf", f"fps=30,scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
                          "-f", "rawvideo", "-pix_fmt", "rgba", "-"], capture_output=True, check=True).stdout
    n = len(raw) // (w * h * 4)
    return np.frombuffer(raw, np.uint8)[: n * w * h * 4].reshape(n, h, w, 4)


_media = {}


def footage(slug, kind, start, w, h, dur=4.4):
    key = (slug, kind)
    if key not in _media:
        arr = ffmpeg_rgba(["-ss", str(start), "-t", str(dur), "-i", os.path.join(MEDIA, slug, f"{kind}.mp4")], w, h)
        _media[key] = [to_image(a) for a in arr]
    return _media[key]


def shot(slug, w, h):
    key = (slug, "shot")
    if key not in _media:
        _media[key] = to_image(ffmpeg_rgba(["-i", os.path.join(MEDIA, slug, "shots", "d01.webp"), "-frames:v", "1"], w, h)[0])
    return _media[key]


# ------------------------------------------------------------------ scene 1 · the spark (beats 0–8, intro)

SPARK_Y = 330


def s_spark(c, t):
    fill(c, INK)
    up = io(prog(t, beat(0.9), beat(1.6)))
    x, y = CX, lerp(CY, SPARK_Y, up)
    grow = io(prog(t, beat(5.0), beat(6.6)))
    warm(c, x, y, lerp(900, 1300, grow), lerp(0.5, 0.8, grow))
    # light gathering into the spark from all around
    fade = prog(t, 0.0, 1.2) * (1 - prog(t, beat(6.5), beat(7.2)))
    if fade > 0:
        for u in MOTES:
            ph = (t * (0.18 + 0.12 * u[0]) + u[1]) % 1
            rad = lerp(1000, 0, ph ** 1.4)
            ang = u[2] * 2 * math.pi + ph * 2.4
            a = math.sin(math.pi * ph) * 0.7 * fade
            c.drawCircle(x + math.cos(ang) * rad, y + math.sin(ang) * rad * 0.7, 1.5 + 2.5 * u[3], paint(GOLD, a))
    r = lerp(10, 66, grow) * (1 + 0.32 * pulse(t))
    # a ring ripples out on every beat
    for k in range(8):
        p = prog(t, beat(k), beat(k) + 0.95)
        if 0 < p < 1:
            c.drawCircle(x, y, r + out(p) * (230 + 200 * grow), paint(GOLD, 0.5 * (1 - p) * min(1, p * 12), stroke=2.5))
    rays(c, x, y, r, t, 0.9, out(prog(t, beat(5.6), beat(6.6))), n=16, stroke=5)
    spark(c, x, y, r)
    # "Hai un'idea?"
    size = 140
    wa, wb = width("Hai ", F_HEAVY, size, -0.02), width("un'idea?", F_HEAVY, size, -0.02)
    x0 = CX - (wa + wb) / 2
    chars(c, "Hai", x0, 690, F_HEAVY, size, WHITE, t, beat(1.0), beat(3.5), align="left")
    chars(c, "un'idea?", x0 + wa, 690, F_HEAVY, size, GOLD, t, beat(1.5), beat(3.5), align="left")
    # "Facciamola brillare."
    wa, wb = width("Facciamola ", F_HEAVY, size, -0.02), width("brillare.", F_HEAVY, size, -0.02)
    x0 = CX - (wa + wb) / 2
    chars(c, "Facciamola", x0, 690, F_HEAVY, size, WHITE, t, beat(4.0), beat(6.7), align="left")
    chars(c, "brillare.", x0 + wa, 690, F_HEAVY, size, GOLD, t, beat(4.5), beat(6.7), align="left")
    for i, (sx, sy, at, s) in enumerate([(x0 + wa + wb + 34, 560, 5.0, 34), (x0 + wa - 10, 545, 5.5, 22), (x0 + wa + wb * 0.55, 742, 6.0, 26)]):
        p = prog(t, beat(at), beat(at) + 0.7)
        if 0 < p < 1:
            star(c, sx, sy, s * back(min(1, p * 2.2)) * (1 - p * 0.6), GOLD, 1 - p ** 3, rot=p * 1.2)
    # the sun floods the frame (→ gold, beat 8)
    wipe = io(prog(t, beat(7.0), beat(8.0)))
    if wipe > 0:
        c.drawCircle(x, y, lerp(r, math.hypot(W, H) + 40, wipe), paint(GOLD))


# ------------------------------------------------------------------ scene 2 · name + rolling services (beats 8–16, build)

DECOR = [  # kind, x, y, size, colour, beat in, spin
    ("ring", 250, 210, 70, INK, 8.6, 0.0), ("dot", 1660, 230, 26, WHITE, 8.85, 0.0), ("plus", 190, 860, 40, INK, 9.1, 0.6),
    ("grid", 1700, 860, 18, INK, 9.35, 0.0), ("squiggle", 560, 950, 120, WHITE, 9.6, 0.0), ("square", 1380, 150, 64, WHITE, 9.85, 0.35),
    ("half", 1500, 960, 54, INK, 10.1, 0.2), ("star", 420, 150, 34, WHITE, 10.35, 0.5), ("dot", 860, 130, 14, INK, 10.6, 0.0),
    ("ring", 1820, 520, 40, WHITE, 10.85, 0.0), ("star", 110, 520, 26, INK, 11.1, -0.4),
]
SERVICES = [("siti web", 10.0), ("negozi online", 11.0), ("web app", 12.0), ("marketing", 13.0)]


def decor(c, kind, x, y, s, rgb, rot):
    if kind == "ring":
        c.drawCircle(x, y, s, paint(rgb, 1, stroke=7))
    elif kind == "dot":
        c.drawCircle(x, y, s, paint(rgb))
    elif kind == "plus":
        p = paint(rgb, 1, stroke=11)
        c.save()
        c.rotate(math.degrees(rot), x, y)
        c.drawLine(x - s, y, x + s, y, p)
        c.drawLine(x, y - s, x, y + s, p)
        c.restore()
    elif kind == "grid":
        for i in range(3):
            for j in range(3):
                c.drawCircle(x + (i - 1) * s * 2.2, y + (j - 1) * s * 2.2, s * 0.42, paint(rgb))
    elif kind == "squiggle":
        path = skia.Path()
        for k in range(41):
            px = x - s + k * s / 20
            py = y + math.sin(k / 40 * 4 * math.pi + rot * 3) * s * 0.18
            (path.moveTo if k == 0 else path.lineTo)(px, py)
        c.drawPath(path, paint(rgb, 1, stroke=8))
    elif kind == "square":
        c.save()
        c.rotate(math.degrees(rot), x, y)
        rr(c, x, y, s * 2, s * 2, s * 0.4, paint(rgb, 1, stroke=7))
        c.restore()
    elif kind == "half":
        c.save()
        c.rotate(math.degrees(rot), x, y)
        path = skia.Path()
        path.addArc(skia.Rect.MakeXYWH(x - s, y - s, 2 * s, 2 * s), 180, 180)
        path.close()
        c.drawPath(path, paint(rgb))
        c.restore()
    elif kind == "star":
        star(c, x, y, s, rgb, 1, rot)


def s_name(c, t):
    fill(c, GOLD)
    t0 = beat(8)
    lt = t - t0
    gone = io(prog(t, beat(15.0), beat(15.6)))
    for i, (kind, x, y, s, rgb, at, spin) in enumerate(DECOR):
        sc = back(prog(t, beat(at), beat(at) + 0.5)) * (1 - gone) * (1 + 0.08 * pulse(t))
        if sc <= 0.01:
            continue
        fy = math.sin(t * 1.4 + i) * 10
        decor(c, kind, x + math.cos(t * 0.9 + i * 2) * 8, y + fy, s * sc, rgb, spin * t + i)
    size = fit("Claudio Taras", F_HEAVY, 1500, 210)
    c.save()
    zoom = 1 + 0.03 * prog(lt, 0, BAR * 2)
    c.translate(CX, 520)
    c.scale(zoom, zoom)
    c.translate(-CX, -520)
    chars(c, "Claudio Taras", CX, 520, F_HEAVY, size, INK, t, t0 + 0.08, beat(14.9), stagger=0.03)
    c.restore()
    # "Creo [siti web]" — the pill resizes to every word, the words roll through it on the beat
    fs = 52
    k = max(0, sum(1 for _, at in SERVICES if t >= beat(at)) - 1)
    w_cur = width(SERVICES[k][0], F_BOLD, fs)
    w_prev = width(SERVICES[k - 1][0], F_BOLD, fs) if k > 0 else w_cur
    ch = io(prog(t, beat(SERVICES[k][1]), beat(SERVICES[k][1]) + 0.32)) if k > 0 else 1.0
    pill_in = out(prog(t, beat(9.85), beat(9.85) + 0.5))
    pill_w = (lerp(w_prev, w_cur, ch) + 76) * pill_in * (1 - gone)
    creo = width("Creo", F_SEMI, 56)
    total = creo + 26 + pill_w
    x0 = CX - total / 2
    masked(c, "Creo", x0, 712, F_SEMI, 56, INK, prog(t, beat(9.7), beat(9.7) + 0.45), prog(t, beat(14.9), beat(15.3)), align="left")
    if pill_w > 4:
        px = x0 + creo + 26 + pill_w / 2
        rr(c, px, 692, pill_w, 96, 48, paint(INK))
        c.save()
        rr_clip(c, px, 692, pill_w, 96, 48)
        word_y = 692 + fs * 0.36
        if k > 0 and ch < 1:
            text(c, SERVICES[k - 1][0], px, word_y - io(ch) * 100, F_BOLD, fs, WHITE)
            text(c, SERVICES[k][0], px, word_y + (1 - io(ch)) * 100, F_BOLD, fs, GOLD if k % 2 else WHITE)
        else:
            text(c, SERVICES[k][0], px, word_y + (1 - out(prog(t, beat(10.0), beat(10.0) + 0.4))) * 100, F_BOLD, fs, GOLD if k % 2 else WHITE)
        c.restore()


# ------------------------------------------------------------------ scenes 3–5 · projects (beats 16–40, the drop)

PROJECTS = [
    dict(name=["Villa Dea"], meta="Sito web  ·  Aglientu, Sardegna", tags=["Sito web", "Prenotazioni dirette"], slug="villa-dea", d=6.0, m=0.2,
         bg=((255, 122, 82), (255, 196, 112)), fg=INK, acc=WHITE, acc_fg=INK),
    dict(name=["Gelateria", "Onda"], meta="Web app  ·  Santa Teresa Gallura", tags=["Web app", "Gusti di oggi"], slug="onda", d=9.0, m=1.0,
         bg=((255, 168, 200), (255, 230, 150)), fg=INK, acc=(222, 52, 116), acc_fg=WHITE),
    dict(name=["L'Isola", "del Gioiello"], meta="E-commerce  ·  Santa Teresa Gallura", tags=["E-commerce", "Prenota e prova"], slug="isola-del-gioiello", d=8.0, m=12.0,
         bg=((10, 20, 42), (36, 56, 100)), fg=WHITE, acc=GOLD, acc_fg=INK),
]
P_BEAT = [16, 24, 32]
BSW, BSH, BAR_H = 960, 600, 44  # browser screen + top bar
PSW, PSH = 270, 584  # phone screen (mobile recordings are 480×1038)


def browser(c, cx, cy, img, rot=0.0):
    w, h = BSW, BSH + BAR_H
    c.save()
    c.translate(cx, cy)
    c.rotate(rot)
    shadow(c, 0, 0, w, h, 20, 0.32, 80, 44)
    rr(c, 0, 0, w, h, 20, paint((250, 250, 250)))
    for k, col in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        c.drawCircle(-w / 2 + 26 + k * 22, -h / 2 + BAR_H / 2, 6.5, paint(col))
    rr(c, 0, -h / 2 + BAR_H / 2, 380, 24, 12, paint((0, 0, 0), 0.06))
    c.clipRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(-w / 2, -h / 2, w, h), 20, 20), True)
    c.drawImageRect(img, skia.Rect.MakeXYWH(-w / 2, -h / 2 + BAR_H, BSW, BSH), SAMPLING)
    c.restore()


def phone(c, cx, cy, img, rot=0.0):
    bz = 11
    w, h = PSW + 2 * bz, PSH + 2 * bz
    c.save()
    c.translate(cx, cy)
    c.rotate(rot)
    shadow(c, 0, 0, w, h, 46, 0.4, 70, 40)
    rr(c, 0, 0, w, h, 46, paint((16, 16, 18)))
    rr(c, 0, 0, w - 1, h - 1, 46, paint((90, 90, 98), 1, stroke=2))
    rr_clip(c, 0, 0, PSW, PSH, 36)
    c.drawImageRect(img, skia.Rect.MakeXYWH(-PSW / 2, -PSH / 2, PSW, PSH), SAMPLING)
    c.restore()


def project_scene(c, t, k):
    pr = PROJECTS[k]
    t0 = beat(P_BEAT[k])
    lt = t - t0
    fg, acc = pr["fg"], pr["acc"]
    flip = k == 1
    sgn = -1 if flip else 1
    gradient(c, *pr["bg"], (0, 0) if not flip else (W, 0), (W, H) if not flip else (0, H))
    # giant outlined name drifting behind everything
    mq = " ".join(pr["name"]).upper() + "   ·   "
    mf = font(F_HEAVY, 300)
    unit = mf.measureText(mq)
    off = (lt + 4) * 150 * sgn
    x = -(off % unit)
    mp = paint(fg, 0.13, stroke=2.5)
    while x < W:
        c.drawString(mq, x, CY + 105, mf, mp)
        x += unit
    # soft disc behind the devices, breathing with the beat
    dcx = CX + sgn * 300
    c.drawCircle(dcx, CY, (330 + 14 * pulse(t)) * out(prog(lt, 0, 0.8)), paint(acc, 0.13 if fg == INK else 0.08))
    # devices: laptop rises in, phone pops in a beat later; slow parallax while they hold
    e_b = out(prog(lt, -0.1, 0.8))
    e_p = back(prog(lt, 0.35, 1.05), 1.4)
    leave = inn(prog(lt, 2 * BAR - 0.5, 2 * BAR))
    fi = max(0, int((lt + 0.4) * 30))
    desk = footage(pr["slug"], "desktop", pr["d"], BSW, BSH)
    mob = footage(pr["slug"], "mobile", pr["m"], PSW, PSH)
    bx = CX + sgn * 235 + lt * 6 * sgn
    by = 545 + (1 - e_b) * 820 - leave * 140
    browser(c, bx, by, desk[min(len(desk) - 1, fi)], (1 - e_b) * -9 * sgn)
    if e_p > 0:
        px = CX + sgn * 770 + (1 - e_p) * 520 * sgn
        py = 650 - lt * 14 - leave * 220
        phone(c, px, py, mob[min(len(mob) - 1, fi)], (1 - min(1, e_p)) * 14 * sgn)
    # text column
    tx = 120 if not flip else W - 120
    al = "left" if not flip else "right"
    ex = beat(P_BEAT[k] + 7.0)
    masked(c, f"0{k + 1}", tx if not flip else tx - width(" / 03", F_BOLD, 34), 230, F_BOLD, 34, acc, prog(lt, beat(0.5), beat(0.5) + 0.4), prog(t, ex, ex + 0.3), align=al)
    masked(c, " / 03", tx + width(f"0{k + 1}", F_BOLD, 34) if not flip else tx, 230, F_BOLD, 34, fg, prog(lt, beat(0.6), beat(0.6) + 0.4), prog(t, ex, ex + 0.3), align=al, a=0.5)
    ln = 190 * out(prog(lt, beat(0.6), beat(1.6))) * (1 - io(prog(t, ex, ex + 0.35)))
    if ln > 1:
        lx0 = tx if not flip else tx - 190
        c.drawLine(lx0, 262, lx0 + 190, 262, paint(fg, 0.22, stroke=3))
        prog_w = 190 * prog(lt, 0, 2 * BAR)
        c.drawLine(lx0 if not flip else lx0 + 190 - min(ln, prog_w), 262, (lx0 + min(ln, prog_w)) if not flip else lx0 + 190, 262, paint(acc, 1, stroke=3))
    size = min(fit(s, F_HEAVY, 540, 118) for s in pr["name"])
    y = 420 if len(pr["name"]) == 2 else 470
    for i, line in enumerate(pr["name"]):
        chars(c, line, tx, y + i * size * 0.98, F_HEAVY, size, fg, t, t0 + beat(0.9 + i * 0.35), ex, align=al)
    y_meta = y + (len(pr["name"]) - 1) * size * 0.98 + 82
    masked(c, pr["meta"], tx, y_meta, F_SEMI, 31, fg, prog(lt, beat(2.0), beat(2.0) + 0.45), prog(t, ex, ex + 0.3), align=al, a=0.78)
    pxx = tx
    for i, tag in enumerate(pr["tags"]):
        tw = width(tag, F_SEMI, 27) + 48
        s = back(prog(lt, beat(2.6 + i * 0.5), beat(2.6 + i * 0.5) + 0.45)) * (1 - io(prog(t, ex + i * 0.05, ex + 0.3 + i * 0.05)))
        cx_ = pxx + tw / 2 if not flip else pxx - tw / 2
        if s > 0.01:
            c.save()
            c.translate(cx_, y_meta + 76)
            c.scale(s, s)
            rr(c, 0, 0, tw, 56, 28, paint(acc if i == 0 else fg, 1 if i == 0 else 0.9, stroke=0 if i == 0 else 2.5))
            text(c, tag, 0, 9.5, F_SEMI, 27, pr["acc_fg"] if i == 0 else fg)
            c.restore()
        pxx += (tw + 14) * (1 if not flip else -1)


# ------------------------------------------------------------------ scene 6 · wall of projects + numbers (beats 40–48)

WALL = ["villa-dea", "onda", "isola-del-gioiello", "cagliari-club", "carruleddhi-show", "grindi-group", "il-girasole", "lumo", "oltre", "pizzeria", "rena-bianca", "shistoria"]
TW, TH = 480, 300
NUMBERS = [("13+", "progetti online", 40.15, 13), ("7", "anni di esperienza", 42.0, 7), ("6", "lingue", 44.0, 6), ("100%", "su misura", 46.0, 100)]


def s_wall(c, t):
    t0 = beat(40)
    lt = t - t0
    fill(c, INK)
    ent = out(prog(lt, -0.1, 1.1))
    c.save()
    c.translate(CX, CY)
    c.rotate(lerp(-24, -12, ent))
    s = lerp(1.45, 1.0, ent) * (1 + 0.012 * max(0, lt))
    c.scale(s, s)
    gap, unit = 26, TW + 26
    for r in range(-3, 4):
        yy = r * (TH + gap)
        speed = (120 + 30 * abs(r)) * (1 if r % 2 else -1)
        off = (lt + 3) * speed
        j0 = math.floor((-1700 - off) / unit)
        for j in range(j0, j0 + 9):
            xx = j * unit + off
            img = shot(WALL[(j + r * 5) % len(WALL)], TW, TH)
            c.save()
            rr_clip(c, xx, yy, TW, TH, 16)
            c.drawImageRect(img, skia.Rect.MakeXYWH(xx - TW / 2, yy - TH / 2, TW, TH), SAMPLING)
            c.restore()
    c.restore()
    # darken the middle so the numbers read
    g = skia.Paint()
    g.setShader(skia.GradientShader.MakeRadial(skia.Point(CX, CY), 1100, [argb(INK, 0.86), argb(INK, 0.55)], [0.25, 1]))
    c.drawPaint(g)
    for i, (num, label, at, n) in enumerate(NUMBERS):
        nxt = NUMBERS[i + 1][2] if i + 1 < len(NUMBERS) else 47.6
        if t < beat(at) or t > beat(nxt) + 0.4:
            continue
        if n >= 10:
            v = int(round(n * out(prog(t, beat(at), beat(at) + 0.55))))
            num = f"{v}{num[len(str(n)):]}"
        p_in, p_out = prog(t, beat(at), beat(at) + 0.38), prog(t, beat(nxt) - 0.08, beat(nxt) + 0.2)
        masked(c, num, CX, CY + 70, F_HEAVY, 270, WHITE, p_in, p_out, track=-0.03)
        masked(c, label, CX, CY + 160, F_SEMI, 52, GOLD, prog(t, beat(at) + 0.08, beat(at) + 0.46), p_out)
        ring = out(prog(t, beat(at), beat(at) + 0.8))
        if ring < 1:
            c.drawCircle(CX, CY - 20, 120 + ring * 420, paint(GOLD, 0.6 * (1 - ring), stroke=3))


# ------------------------------------------------------------------ scene 7 · hope (beats 48–56, the anthem)

HZ = 905  # horizon


def s_hope(c, t):
    t0 = beat(48)
    lt = t - t0
    fill(c, CREAM)
    warm(c, CX, HZ, 1100, 0.22 * out(prog(lt, 0, 2)), (255, 170, 80))
    rise = out(prog(lt, 0.0, 2.4))
    sun_r = 270
    sy = lerp(HZ + sun_r + 30, HZ + 30, rise) - max(0, lt - 2.4) * 8
    c.save()
    c.clipRect(skia.Rect.MakeLTRB(0, 0, W, HZ))
    rays(c, CX, sy, sun_r, t, 0.55, out(prog(lt, 0.6, 1.8)), n=24, rgb=(255, 176, 60), stroke=7, spin=0.12)
    gp = skia.Paint(AntiAlias=True)
    gp.setShader(skia.GradientShader.MakeLinear([skia.Point(0, sy - sun_r), skia.Point(0, sy + sun_r * 0.2)], [argb((255, 210, 90)), argb((255, 128, 76))]))
    c.drawCircle(CX, sy, sun_r, gp)
    c.restore()
    # motes rising from the horizon
    for u in MOTES[:46]:
        ph = (lt * (0.12 + 0.1 * u[0]) + u[1]) % 1
        mx = u[2] * W + math.sin(lt * 1.2 + u[3] * 6) * 18
        my = HZ - ph * 760
        c.drawCircle(mx, my, 2 + 4 * u[4], paint((255, 160, 60), math.sin(math.pi * ph) * 0.6 * prog(lt, 0.2, 1.0)))
    hl = out(prog(lt, 0.0, 0.9))
    c.drawLine(CX - hl * W * 0.5, HZ, CX + hl * W * 0.5, HZ, paint(INK, 0.85, stroke=3))
    ex = beat(55.0)
    size = 132
    chars(c, "Il tuo progetto", CX, 300, F_HEAVY, size, INK, t, beat(48.4), ex)
    chars(c, "può essere", CX, 440, F_HEAVY, size, INK, t, beat(49.2), ex)
    chars(c, "il prossimo.", CX, 580, F_HEAVY, size, CORAL, t, beat(50.0), ex)
    # hand-drawn swoosh under "il prossimo."
    w = width("il prossimo.", F_HEAVY, size, -0.02)
    path = skia.Path()
    path.moveTo(CX - w / 2 + 10, 622)
    path.quadTo(CX, 600, CX + w / 2 - 6, 618)
    sp = paint(GOLD, 1, stroke=12)
    trim_path(c, path, out(prog(t, beat(51.0), beat(52.0))) * (1 - io(prog(t, ex, ex + 0.4))), sp)
    for i, (sx_, sy_, at) in enumerate([(CX + w / 2 + 40, 470, 51.5), (CX - w / 2 - 50, 520, 52.0), (CX + w / 2 + 10, 650, 52.5)]):
        p = prog(t, beat(at), beat(at) + 0.8)
        if 0 < p < 1:
            star(c, sx_, sy_, 28 * back(min(1, p * 2.2)) * (1 - p * 0.5), GOLD, 1 - p ** 3, rot=p)


# ------------------------------------------------------------------ scene 8 · contact (beats 56–64, outro → back to the spark)

DOT_R = 26


def contact_layout():
    size = 230
    ww = width("Parliamo", F_HEAVY, size, -0.02)
    total = ww + 22 + 2 * DOT_R
    x0 = CX - total / 2
    return size, x0, ww


def s_contact(c, t):
    t0 = beat(56)
    lt = t - t0
    fill(c, INK)
    size, x0, ww = contact_layout()
    home = io(prog(t, beat(62.0), beat(63.85)))
    dx0, dy0 = x0 + ww + 22 + DOT_R, 470 - DOT_R
    dx, dy = lerp(dx0, CX, home), lerp(dy0, CY, home)
    warm(c, dx, dy, lerp(1100, 900, home), 0.5)
    for u in MOTES[:40]:  # drifting dust, gone before the loop point
        ph = (lt * (0.05 + 0.05 * u[0]) + u[1]) % 1
        a = math.sin(math.pi * ph) * 0.45 * prog(lt, 0.1, 0.8) * (1 - prog(t, beat(61.0), beat(62.5)))
        if a > 0:
            c.drawCircle(u[2] * W, H - ph * H, 1.5 + 2 * u[3], paint(GOLD, a))
    chars(c, "Parliamo", x0, 470, F_HEAVY, size, WHITE, t, t0 + 0.06, beat(61.6), align="left", stagger=0.032)
    # the full stop is the spark: it pops in, beats, and at the end flies home to the centre
    r = lerp(DOT_R * back(prog(t, beat(57.0), beat(57.0) + 0.45)), 10, home)
    if r > 0.3:
        for kk in range(57, 62):
            p = prog(t, beat(kk), beat(kk) + 0.9)
            if 0 < p < 1:
                c.drawCircle(dx, dy, r + out(p) * 160, paint(GOLD, 0.45 * (1 - p) * min(1, p * 12), stroke=2.5))
        spark(c, dx, dy, r * (1 + 0.18 * pulse(t) * (1 - home)))
    # contact pills
    ew, pw = width(EMAIL, F_BOLD, 44) + 150, width(PHONE, F_BOLD, 46) + 150
    gap = 36
    xs = [CX - (ew + gap + pw) / 2 + ew / 2, CX + (ew + gap + pw) / 2 - pw / 2]
    for k_, (label, fs, w_full, filled, at) in enumerate([(EMAIL, 44, ew, False, 57.75), (PHONE, 46, pw, True, 58.25)]):
        grow = back(prog(t, beat(at), beat(at) + 0.5), 1.2)
        shrink = io(prog(t, beat(61.3 + k_ * 0.12), beat(62.1 + k_ * 0.12)))
        if grow <= 0.01 or shrink >= 0.99:
            continue
        px = lerp(xs[k_], dx, shrink)
        py = lerp(690, dy, shrink)
        w, h = lerp(lerp(104, w_full, min(1, grow)) * max(grow, 0.0), 0, shrink), 104 * (1 - shrink)
        if filled:
            rr(c, px, py, w, h, h / 2, paint(GOLD))
        else:
            rr(c, px, py, w, h, h / 2, paint(WHITE, 0.07))
            rr(c, px, py, w, h, h / 2, paint(WHITE, 0.75, stroke=3))
        la = prog(t, beat(at) + 0.2, beat(at) + 0.55) * (1 - shrink)
        if la > 0:
            c.save()
            rr_clip(c, px, py, w, h, h / 2)
            fgc = INK if filled else WHITE
            ix = px - w_full / 2 + 62
            icon = paint(fgc, la, stroke=4)
            if filled:
                c.drawRoundRect(skia.Rect.MakeXYWH(ix - 4, py - 28, 32, 54), 8, 8, icon)
                c.drawLine(ix + 7, py + 16, ix + 17, py + 16, icon)
            else:
                c.drawRoundRect(skia.Rect.MakeXYWH(ix - 12, py - 20, 50, 38), 7, 7, icon)
                pth = skia.Path()
                pth.moveTo(ix - 8, py - 16)
                pth.lineTo(ix + 13, py + 1)
                pth.lineTo(ix + 34, py - 16)
                c.drawPath(pth, icon)
            text(c, label, ix + 56, py + fs * 0.35, F_BOLD, fs, fgc, la, align="left")
            c.restore()
    masked(c, "Claudio Taras   ·   Web designer & developer", CX, H - 96, F_SEMI, 30, GREY, prog(t, beat(58.75), beat(58.75) + 0.5), prog(t, beat(61.4), beat(61.9)), track=0.02)


# ------------------------------------------------------------------ timeline + transitions

SCENES = [(0, s_spark), (8, s_name), (16, lambda c, t: project_scene(c, t, 0)), (24, lambda c, t: project_scene(c, t, 1)),
          (32, lambda c, t: project_scene(c, t, 2)), (40, s_wall), (48, s_hope), (56, s_contact)]
# at beat → (style, colour of the leading bars)
TRANS = {16: ("left", INK), 24: ("up", WHITE), 32: ("right", GOLD), 40: ("diag", GOLD), 48: ("iris", GOLD), 56: ("left", CORAL)}
T_LEAD, T_TAIL = 0.44, 0.12


def bars_path(style, p, n=7, stagger=0.07):
    """Union of staggered bars covering the frame as p goes 0→1."""
    path = skia.Path()
    span = 1 - stagger * (n - 1)
    for i in range(n):
        q = io(clamp((p - i * stagger) / span))
        if q <= 0:
            continue
        if style == "left":
            bh = H / n
            path.addRect(skia.Rect.MakeLTRB(W * (1 - q), i * bh - 1, W + 1, (i + 1) * bh + 1))
        elif style == "right":
            bh = H / n
            path.addRect(skia.Rect.MakeLTRB(-1, i * bh - 1, W * q, (i + 1) * bh + 1))
        elif style == "up":
            bw = W / n
            path.addRect(skia.Rect.MakeLTRB(i * bw - 1, H * (1 - q), (i + 1) * bw + 1, H + 1))
        elif style == "diag":  # drawn in a canvas rotated by 24°, so it needs a bigger span
            span_w, bw = 2600, 2600 / n
            path.addRect(skia.Rect.MakeLTRB(CX - span_w / 2 + i * bw - 1, CY + 1300 - 2600 * q, CX - span_w / 2 + (i + 1) * bw + 1, CY + 1300))
    return path


def transition(c, t, at_beat, prev_fn, next_fn):
    style, lead = TRANS[at_beat]
    T = beat(at_beat)
    pa = prog(t, T - T_LEAD, T - 0.04)  # leading colour bars
    pb = prog(t, T - T_LEAD + 0.13, T + T_TAIL)  # the next scene, revealed behind them
    c.save()
    prev_fn(c, t)
    c.restore()
    for p, draw in ((pa, lambda: fill(c, lead)), (pb, lambda: next_fn(c, t))):
        if p <= 0:
            continue
        c.save()
        if style == "iris":
            path = skia.Path()
            path.addCircle(CX, CY, io(p) * (math.hypot(W, H) / 2 + 10))
            c.clipPath(path, True)
        elif style == "diag":
            c.rotate(24, CX, CY)
            c.clipPath(bars_path(style, p), True)
            c.rotate(-24, CX, CY)
        else:
            c.clipPath(bars_path(style, p), True)
        draw()
        c.restore()


def draw_frame(c, t):
    for i, (bt, fn) in enumerate(SCENES):
        if bt in TRANS and beat(bt) - T_LEAD <= t < beat(bt) + T_TAIL:
            transition(c, t, bt, SCENES[i - 1][1], fn)
            return
    idx = max(i for i, (bt, _) in enumerate(SCENES) if t >= beat(bt))
    c.save()
    SCENES[idx][1](c, t)
    c.restore()


# ------------------------------------------------------------------ rendering (parallel chunks)


def render_chunk(i, n, path):
    buf = np.zeros((H, W, 4), np.uint8)
    c = skia.Surface(buf, colorType=skia.kRGBA_8888_ColorType).getCanvas()
    total = int(round(DUR * FPS))
    a, b = total * i // n, total * (i + 1) // n
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-g", "60", path], stdin=subprocess.PIPE)
    for f in range(a, b):
        draw_frame(c, f / FPS)
        ff.stdin.write(buf.tobytes())
    ff.stdin.close()
    ff.wait()
    print(f"  chunk {i} done", flush=True)


# ------------------------------------------------------------------ music: hopeful pop-house, D major, 128 BPM, 16 bars

SR = sr.SR
CH = [[62, 66, 69], [61, 64, 69], [62, 66, 71], [62, 67, 71]]  # D  A/C#  Bm  G
ROOTS = [38, 33, 35, 31]
MEL = [  # the hook: (beat, length, midi) — climbs F#→A→B, then settles
    [(0, 0.5, 69), (0.5, 0.5, 74), (1, 1, 78), (2, 0.5, 76), (2.5, 0.5, 74), (3, 1, 76)],
    [(0, 0.5, 73), (0.5, 0.5, 76), (1, 1, 81), (2, 0.5, 78), (2.5, 1.5, 76)],
    [(0, 0.5, 74), (0.5, 0.5, 78), (1, 1, 83), (2, 0.5, 81), (2.5, 0.5, 78), (3, 1, 81)],
    [(0, 1, 83), (1, 0.5, 81), (1.5, 0.5, 79), (2, 1, 78), (3, 1, 76)],
]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


_cache = {}


def cached(key, fn):
    if key not in _cache:
        _cache[key] = fn()
    return _cache[key]


def piano(m, dur=1.8):
    def make():
        n = int(dur * SR)
        t = np.arange(n) / SR
        f = hz(m)
        x = np.zeros(n)
        for k in range(1, 9):
            fk = f * k * math.sqrt(1 + 0.00035 * k * k)
            if fk > SR / 2.3:
                break
            x += np.sin(2 * np.pi * fk * t) * (1 / k ** 1.35) * np.exp(-t / (1.3 / (1 + 0.7 * (k - 1))))
        hammer = sr.fft_filter(sr.rng.standard_normal(n), lo=900, hi=5000) * np.exp(-t / 0.006) * 0.25
        env = np.minimum(1, t / 0.002) * np.minimum(1, (n - np.arange(n)) / (0.12 * SR))
        return (x + hammer) * env * 0.1
    return cached(("piano", m, dur), make)


def supersaw(ci, dur):
    def make():
        n = int(dur * SR)
        notes = CH[ci] + [CH[ci][0] + 12]
        outp = []
        for side in (1, -1):
            x = np.zeros(n)
            for m in notes:
                for det in (-0.16, -0.06, 0.06, 0.16):
                    x += sr.saw(hz(m + det * side + 0.02 * side), n, 18)
            outp.append(sr.fft_filter(x, lo=220, hi=4200))
        i = np.arange(n)
        env = np.minimum(1, i / (0.015 * SR)) * np.minimum(1, (n - i) / (0.1 * SR))
        return [o * env * 0.011 for o in outp]
    return cached(("ss", ci, dur), make)


def lead(m, dur):
    def make():
        n = int((dur + 0.3) * SR)
        t = np.arange(n) / SR
        x = sum(sr.saw(hz(m + d), n, 22) for d in (-0.08, 0.0, 0.08)) + 0.5 * np.sin(2 * np.pi * hz(m) * t)
        x = sr.fft_filter(x, lo=280, hi=5200)
        env = np.minimum(1, t / 0.008) * (0.72 + 0.28 * np.exp(-t / 0.12))
        env *= np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.09))
        return x * env * 0.05
    return cached(("lead", m, dur), make)


def bell(m, dur=1.6):
    def make():
        n = int(dur * SR)
        t = np.arange(n) / SR
        f = hz(m)
        x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.3) + 0.15 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / 0.15)
        return x * np.exp(-t / 0.7) * np.minimum(1, t / 0.002) * 0.1
    return cached(("bell", m, dur), make)


def snare():
    def make():
        n = int(0.28 * SR)
        t = np.arange(n) / SR
        body = np.sin(2 * np.pi * (185 + 60 * np.exp(-t * 40)) * t) * np.exp(-t / 0.05) * 0.5
        noise = sr.fft_filter(sr.rng.standard_normal(n), lo=1400, hi=9000) * np.exp(-t / 0.09) * 0.7
        return (body + noise) * 0.55
    return cached("snare", make)


def sub(m, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * hz(m) * t) * (1 - np.exp(-t / 0.01)) * np.exp(-t / 0.3) * 0.5


def build_cycle(off, drums, music, synth, send, kicks):
    K, CL = sr.kick(), sr.clap()
    HC, HO = sr.hat(0.012), sr.hat(0.07)
    SN = snare()
    s16 = B / 4
    for bar in range(16):
        tb = off + bar * BAR
        ci = bar % 4
        chord = CH[ci]
        intro, build, drop, anthem, outro = bar < 2, 2 <= bar < 4, 4 <= bar < 12, 12 <= bar < 14, bar >= 14
        # warm pad under everything
        sr.add_lr(music, sr.pad_chord(chord, BAR + 0.4), tb, (0.9 if intro or outro else 0.6), send, 0.45)
        # piano: hopeful pulsing chords (quarters in the intro/outro, 8ths when it builds and in the anthem)
        if intro or outro or build or anthem:
            step = 1.0 if (intro or outro or bar == 2) else 0.5
            for q in np.arange(0, 4, step):
                vel = (1.0 if q == 0 else 0.62) * (0.8 if anthem else 1.0)
                for m_ in chord:
                    sr.add(music, piano(m_ + (12 if anthem else 0)), tb + q * B, vel, 0.15, send, 0.35)
                if q == 0:
                    sr.add(music, piano(ROOTS[ci] + 12), tb, 0.9, -0.1, send, 0.2)
        # the hook, hinted on bells at the start, full on the lead in the drop, sung high in the anthem
        mel = MEL[ci]
        if bar == 1 or outro:
            for bt, ln, m_ in mel:
                sr.add(music, bell(m_ + 12), tb + bt * B, 0.55 if bar == 1 else 0.75, 0.2, send, 0.7)
        if drop:
            for bt, ln, m_ in mel:
                sr.add(synth, lead(m_, ln * B), tb + bt * B, 1.0, -0.1, send, 0.3)
                if bar >= 8:
                    sr.add(synth, lead(m_ + 12, ln * B), tb + bt * B, 0.38, 0.25, send, 0.3)
        if anthem:
            for bt, ln, m_ in mel:
                sr.add(synth, lead(m_ + 12, ln * B), tb + bt * B, 0.75, 0.1, send, 0.4)
                sr.add(music, bell(m_ + 12), tb + bt * B, 0.6, -0.25, send, 0.5)
        # supersaw chords with sidechain pump
        if drop or anthem:
            sr.add_lr(synth, supersaw(ci, BAR), tb, 1.0, send, 0.2)
        # pluck arpeggio: 16ths, opening up through the build
        if build or drop or anthem:
            tones = chord + [chord[0] + 12]
            pat = [0, 1, 2, 3, 2, 1, 3, 2]
            g_arp = (0.35 if bar == 2 else 0.6) if build else 0.55
            for j in range(16):
                sr.add(synth, sr.pluck(tones[pat[j % 8]] + 12), tb + j * s16, g_arp, -0.35 if j % 2 else 0.35, send, 0.3)
        # bass: offbeat 8ths (from the second half of the build); soft sub pulse in the intro/outro
        if bar == 3 or drop or anthem:
            for q in range(4):
                if bar == 3 and q == 3:
                    continue
                sr.add(synth, sr.bass_note(ROOTS[ci] + 12), tb + q * B + B / 2, 1.0)
                sr.add(synth, sr.bass_note(ROOTS[ci] + 12), tb + q * B + B * 0.75, 0.55)
        if intro or outro:
            for q in range(4):
                sr.add(music, sub(ROOTS[ci] + 12, B * 0.9), tb + q * B, 0.5 if outro else 0.35 + 0.15 * bar)
        # drums
        if bar == 1 or outro and bar == 14:
            for j in range(8):
                sr.add(drums, HC, tb + j * B / 2, 0.18 if j % 2 else 0.28, 0.25)
        if build:
            for q in range(4):
                if bar == 3 and q == 3:
                    continue  # breath before the drop
                sr.add(drums, K, tb + q * B, 0.7 if bar == 2 else 0.85)
                kicks.append(tb + q * B)
            for j in range(16):
                sr.add(drums, HC, tb + j * s16, 0.14 + 0.06 * (j % 2 == 0), 0.25)
            if bar == 3:  # snare roll: 8ths then 16ths, crescendo
                for j in range(16):
                    if j < 8 and j % 2:
                        continue
                    sr.add(drums, SN, tb + j * s16, 0.25 + 0.55 * j / 15, 0.0, send, 0.25)
                sr.add(drums, sr.swell(BAR), tb, 0.8)
        if drop or anthem:
            for q in range(4):
                sr.add(drums, K, tb + q * B, 1.0)
                kicks.append(tb + q * B)
                if q in (1, 3):
                    sr.add(drums, CL, tb + q * B, 0.85, -0.05, send, 0.35)
                    sr.add(drums, SN, tb + q * B, 0.35, 0.05, send, 0.2)
                sr.add(drums, HO, tb + q * B + B / 2, 0.34, 0.3)
            for j in range(16):
                if j % 4 != 2:
                    sr.add(drums, HC, tb + j * s16, (0.3, 0.14, 0, 0.2)[j % 4], -0.25)
            if bar in (4, 8, 12):
                sr.add(drums, sr.crash(2.2), tb, 0.75, 0.0, send, 0.3)
            if bar in (7, 11):  # fills into the next section
                for j in (12, 13, 14, 15):
                    sr.add(drums, SN, tb + j * s16, 0.45 + 0.1 * (j - 12), 0.0, send, 0.25)
            if bar == 11:
                sr.add(drums, sr.swell(BAR * 0.5), tb + BAR * 0.5, 0.7)
        if bar == 14:
            sr.add(drums, sr.crash(2.6), tb, 0.45, 0.0, send, 0.5)


def build_audio(path):
    L = int(2 * DUR * SR) + SR
    drums, music, synth, send = (np.zeros((2, L)) for _ in range(4))
    kicks = []
    for cyc in range(2):  # render twice, keep the second: tails of the outro flow into the intro
        build_cycle(cyc * DUR, drums, music, synth, send, kicks)
    sc = np.ones(L)
    tt = np.arange(int(0.4 * SR)) / SR
    dip = 1 - 0.62 * np.exp(-tt / 0.11)
    for k in kicks:
        i = int(k * SR)
        seg = dip[: L - i]
        sc[i : i + len(seg)] = np.minimum(sc[i : i + len(seg)], seg)
    synth *= sc
    music *= 0.55 + 0.45 * sc
    wet = sr.reverb(send, 2.6)
    mix_ = drums * 0.8 + music + synth + wet * 0.32
    track = np.vstack([sr.fft_filter(mix_[0], lo=30), sr.fft_filter(mix_[1], lo=30)])
    track = track[:, int(DUR * SR) : int(2 * DUR * SR)]
    track = np.tanh(track / (np.max(np.abs(track)) + 1e-9) * 1.7) * 0.9
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((track.T * 32767).astype(np.int16).tobytes())


# ------------------------------------------------------------------ main


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    args = sys.argv[1:]
    if "--chunk" in args:
        i, n = (int(x) for x in args[args.index("--chunk") + 1].split("/"))
        render_chunk(i, n, os.path.join(TMP, f"mot_{i:02d}.mp4"))
        return
    if "--frames" in args:
        times = [float(x) for x in args[args.index("--frames") + 1].split(",")]
        buf = np.zeros((H, W, 4), np.uint8)
        c = skia.Surface(buf, colorType=skia.kRGBA_8888_ColorType).getCanvas()
        tiles = []
        for t in times:
            draw_frame(c, t)
            tiles.append(np.asarray(Image.fromarray(np.ascontiguousarray(buf[..., :3])).resize((W // 3, H // 3), Image.BILINEAR)))
        cols = min(4, len(tiles))
        rows = (len(tiles) + cols - 1) // cols
        th, tw = tiles[0].shape[:2]
        sheet = np.full((rows * (th + 6), cols * (tw + 6), 3), 70, np.uint8)
        for k, tile in enumerate(tiles):
            r, q = divmod(k, cols)
            sheet[r * (th + 6) : r * (th + 6) + th, q * (tw + 6) : q * (tw + 6) + tw] = tile
        out_p = os.path.join(TMP, os.environ.get("SHEET", "motion-sheet.jpg"))
        Image.fromarray(sheet).save(out_p, quality=88)
        print("sheet:", out_p)
        return
    audio = os.path.join(TMP, "motion.wav")
    video = os.path.join(TMP, "motion.mp4")
    if "--audio-only" not in args:
        n = int(os.environ.get("CHUNKS", "12"))
        print(f"rendering in {n} parallel chunks…", flush=True)
        procs = [subprocess.Popen([sys.executable, os.path.abspath(__file__), "--chunk", f"{i}/{n}"], cwd=ROOT) for i in range(n)]
        if any(p.wait() for p in procs):
            sys.exit("a chunk failed")
        lst = os.path.join(TMP, "mot_list.txt")
        with open(lst, "w") as f:
            f.write("".join(f"file '{os.path.join(TMP, f'mot_{i:02d}.mp4').replace(os.sep, '/')}'\n" for i in range(n)))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video], check=True)
    print("building soundtrack…", flush=True)
    build_audio(audio)
    out_path = os.path.join(OUT_DIR, "claudio-taras-promo-it-motion-16x9.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", out_path], check=True)
    print("done:", out_path, round(os.path.getsize(out_path) / 1e6, 1), "MB")


if __name__ == "__main__":
    main()
