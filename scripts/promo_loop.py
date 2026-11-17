"""
15-second Italian promo, 16:9 (1920x1080, 60 fps), Apple-ad style, seamless loop.
128 BPM → 8 bars = exactly 15 s; every move lands on a beat. One continuous chain of morphs:
gold square → pill with the name → underline → full-screen colour → kinetic words → browser with
real projects → 3×2 grid of squares that shuffle → square → rolling numbers → services on colour
blocks → contact pills → the pills merge back into the gold square of frame 0 (perfect loop).
Music: upbeat house-pop (I–V–vi–IV in C), rendered over two cycles so the loop point is seamless.

  .capture/pyenv/Scripts/python.exe scripts/promo_loop.py [--frames 0.2,1.0,…] [--audio-only]
Output: promo/claudio-taras-promo-it-loop-16x9.mp4
"""
import math
import os
import subprocess
import sys
import wave

import numpy as np
import skia

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import showreel as sr  # noqa: E402  (synth instruments + mixing helpers)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA = os.path.join(ROOT, "public", "media", "projects")
OUT_DIR = os.path.join(ROOT, "promo")
W, H, FPS = 1920, 1080, 60
BPM = 128
B = 60 / BPM  # one beat
BAR = 4 * B
DUR = 8 * BAR  # = 15.0 s

BLACK, WHITE, GOLD, INK, GREY = (10, 10, 12), (245, 245, 247), (255, 197, 61), (16, 16, 18), (134, 134, 139)
EMAIL, PHONE = "claudiotaras3@gmail.com", "+39 345 451 0973"

FONTS = "C:/Windows/Fonts"
F_HEAVY = skia.Typeface.MakeFromFile(f"{FONTS}/seguibl.ttf")
F_BOLD = skia.Typeface.MakeFromFile(f"{FONTS}/segoeuib.ttf")
F_SEMI = skia.Typeface.MakeFromFile(f"{FONTS}/seguisb.ttf")
SAMPLING = skia.SamplingOptions(skia.FilterMode.kLinear, skia.MipmapMode.kLinear)


def beat(n):
    return n * B


# ------------------------------------------------------------------ easing / helpers


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def prog(t, a, b):
    return clamp((t - a) / (b - a)) if b > a else float(t >= a)


def out(p):  # expo out — Apple's snappy settle
    return 1 if p >= 1 else 1 - 2 ** (-10 * p)


def io(p):  # expo in-out
    if p <= 0:
        return 0.0
    if p >= 1:
        return 1.0
    return 2 ** (20 * p - 10) / 2 if p < 0.5 else (2 - 2 ** (-20 * p + 10)) / 2


def lerp(a, b, p):
    return a + (b - a) * p


def mix(c1, c2, p):
    return tuple(int(lerp(a, b, p)) for a, b in zip(c1, c2))


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


def masked(c, s, x, y, face, size, rgb, p_in, p_out=0.0, align="center", track=-0.03, a=1.0):
    """Text that slides up into a mask and out of it (Apple's line reveal)."""
    if p_in <= 0 or p_out >= 1:
        return
    w = width(s, face, size, track)
    x0 = x - w / 2 if align == "center" else x - w if align == "right" else x
    c.save()
    c.clipRect(skia.Rect.MakeLTRB(x0 - 40, y - size * 1.0, x0 + w + 40, y + size * 0.26))
    dy = (1 - out(p_in)) * size * 1.2 - io(p_out) * size * 1.2
    text(c, s, x, y + dy, face, size, rgb, a, align, track)
    c.restore()


def fit(s, face, max_w, start, track=-0.03):
    size = start
    while size > 30 and width(s, face, size, track) > max_w:
        size -= 4
    return size


def rr(c, cx, cy, w, h, r, p):
    c.drawRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(cx - w / 2, cy - h / 2, w, h), min(r, w / 2, h / 2), min(r, w / 2, h / 2)), p)


def rr_clip(c, cx, cy, w, h, r):
    c.clipRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(cx - w / 2, cy - h / 2, w, h), min(r, w / 2, h / 2), min(r, w / 2, h / 2)), True)


def soft_shadow(c, cx, cy, w, h, r, a=0.28, blur=60, dy=40):
    p = paint((0, 0, 0), a)
    p.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, blur / 2))
    rr(c, cx, cy + dy, w * 0.92, h * 0.94, r, p)


def square_bg(c, t, at, rgb, dur=0.36):
    """Background change: a rounded square grows from the centre to cover the frame."""
    p = io(prog(t, at - dur * 0.25, at + dur * 0.75))
    if p <= 0:
        return
    s = lerp(0, math.hypot(W, H) * 1.02, p)
    rr(c, W / 2, H / 2, s, s, lerp(80, 0, p), paint(rgb))


# ------------------------------------------------------------------ media (colour order fixed: RGBA)


def to_image(arr):
    return skia.Image.fromarray(np.ascontiguousarray(arr), colorType=skia.kRGBA_8888_ColorType)


def load(path, w, h):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
                          "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], capture_output=True, check=True).stdout
    return to_image(np.frombuffer(raw, np.uint8).reshape(h, w, 4))


def footage(path, start, dur, w, h):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", f"{start}", "-t", f"{dur}", "-i", path, "-vf",
                          f"fps=30,scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
                         capture_output=True, check=True).stdout
    n = len(raw) // (w * h * 4)
    arr = np.frombuffer(raw, np.uint8)[: n * w * h * 4].reshape(n, h, w, 4)
    return [to_image(a) for a in arr]


print("loading media…")
BW, BH = 1280, 800  # browser window
MONTAGE = [("Villa Dea", "villa-dea", 6.0), ("Gelateria Onda", "onda", 9.0), ("L'Isola del Gioiello", "isola-del-gioiello", 8.0), ("Carruleddhi Show", "carruleddhi-show", 9.0)]
CLIPS = [footage(os.path.join(MEDIA, slug, "desktop.mp4"), st, 1.0, BW, BH - 52) for _, slug, st in MONTAGE]
GRID = [load(os.path.join(MEDIA, s, "shots", f"d{n:02d}.webp"), 600, 600) for s, n in [("shistoria", 3), ("pizzeria", 2), ("grindi-group", 2), ("oltre", 2), ("rena-bianca", 2), ("cagliari-club", 2)]]

# ------------------------------------------------------------------ scenes (each draws the whole frame)

NAME = "Claudio Taras"


def s1_name(c, t):
    """bar 1 · gold square → pill holding the name → the pill drains into an underline, the name turns white."""
    c.clear(argb(BLACK))
    cx, cy = W / 2, H / 2
    name_size = 180
    nw = width(NAME, F_HEAVY, name_size, -0.03)
    pill_w, pill_h = nw + 160, 250
    m1 = io(prog(t, beat(1), beat(1) + 0.38))  # square → pill
    m2 = io(prog(t, beat(2.5), beat(3.4)))  # pill drains to a line
    w = lerp(160, pill_w, m1)
    h = lerp(160, pill_h, m1)
    r = lerp(42, pill_h / 2, m1)
    rot = lerp(0, 90, io(prog(t, beat(0.35), beat(0.95)))) if m1 == 0 else 0  # a quarter turn on beat 1
    # draining: the pill keeps its bottom edge, its top comes down to a 10 px line
    top = cy - h / 2 + lerp(0, h - 10, m2)
    bottom = cy + h / 2
    line_w = lerp(w, nw, m2)
    if m2 > 0:
        r = lerp(r, 5, m2)
    shape = skia.RRect.MakeRectXY(skia.Rect.MakeLTRB(cx - line_w / 2, top, cx + line_w / 2, bottom), min(r, (bottom - top) / 2), min(r, (bottom - top) / 2))
    name_in = prog(t, beat(1.3), beat(2.1))
    # white name (visible where the pill no longer covers)
    if name_in > 0:
        masked(c, NAME, cx, cy + name_size * 0.36, F_HEAVY, name_size, WHITE, name_in)
    c.save()
    c.translate(cx, cy)
    c.rotate(rot)
    c.translate(-cx, -cy)
    c.drawRRect(shape, paint(GOLD))
    c.restore()
    if name_in > 0:
        c.save()
        c.clipRRect(shape, True)
        masked(c, NAME, cx, cy + name_size * 0.36, F_HEAVY, name_size, INK, name_in)
        c.restore()
    # last beat: the underline races across the frame
    sweep = io(prog(t, beat(3.4), beat(4)))
    if sweep > 0:
        c.drawRect(skia.Rect.MakeLTRB(cx - lerp(nw / 2, W, sweep), bottom - 10, cx + lerp(nw / 2, W, sweep), bottom), paint(GOLD))


ROLE = [("WEB", INK, GOLD), ("DESIGNER", GOLD, BLACK), ("&", INK, WHITE), ("DEVELOPER", WHITE, BLACK)]


def s2_role(c, t):
    """bar 2 · the underline floods up into gold; one huge word per beat, colour blocks swapping."""
    t0 = BAR
    c.clear(argb(BLACK))
    flood = io(prog(t, t0, t0 + 0.32))
    masked(c, NAME, W / 2, H / 2 + 180 * 0.36, F_HEAVY, 180, WHITE, 1.0, prog(t, t0, t0 + 0.2))
    c.drawRect(skia.Rect.MakeLTRB(0, lerp(H / 2 + 115, 0, flood), W, lerp(H / 2 + 125, H, flood)), paint(GOLD))
    for i, (word, fg, bg) in enumerate(ROLE):
        at = t0 + beat(i)
        if i:
            square_bg(c, t, at, bg)
    for i, (word, fg, bg) in enumerate(ROLE):
        at = t0 + beat(i)
        nxt = t0 + beat(i + 1)
        if t < at or t >= nxt + 0.05:
            continue
        size = fit(word, F_HEAVY, W * 0.86, 420)
        pin = prog(t, at + 0.02, at + 0.3)
        c.save()
        s = lerp(1.12, 1.0, out(pin))
        c.translate(W / 2, H / 2)
        c.scale(s, s)
        c.translate(-W / 2, -H / 2)
        masked(c, word, W / 2, H / 2 + size * 0.36, F_HEAVY, size, fg, pin)
        c.restore()


def browser(c, cx, cy, s, t, show_label=True):
    w, h = BW * s, BH * s
    soft_shadow(c, cx, cy, w, h, 22 * s, 0.22, 80, 50)
    rr(c, cx, cy, w, h, 22 * s, paint((28, 28, 30)))
    for k, col in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        c.drawCircle(cx - w / 2 + (30 + k * 26) * s, cy - h / 2 + 26 * s, 7.5 * s, paint(col))
    rr(c, cx, cy - h / 2 + 26 * s, 420 * s, 30 * s, 15 * s, paint((255, 255, 255), 0.08))
    screen = skia.Rect.MakeXYWH(cx - w / 2, cy - h / 2 + 52 * s, w, h - 52 * s)
    c.save()
    c.clipRRect(skia.RRect.MakeRectXY(screen, 0, 0), True)
    t0 = 2 * BAR
    k = min(3, max(0, int((t - t0) / B)))
    for i in range(max(0, k - 1), k + 1):
        at = t0 + beat(i)
        pin = io(prog(t, at, at + 0.3)) if i else 1.0
        frames = CLIPS[i]
        img = frames[min(len(frames) - 1, max(0, int((t - at + 0.2) * 30)))]
        y = screen.top() + (1 - pin) * screen.height()
        c.drawImageRect(img, skia.Rect.MakeXYWH(screen.left(), y, screen.width(), screen.height()), SAMPLING)
    c.restore()
    if show_label:
        label = MONTAGE[k][0]
        lw = width(label, F_BOLD, 34 * s) + 56 * s
        lx, ly = screen.left() + 30 * s + lw / 2, screen.bottom() - 46 * s
        rr(c, lx, ly, lw, 62 * s, 31 * s, paint(BLACK, 0.78))
        at = t0 + beat(k)
        masked(c, label, lx, ly + 12 * s, F_BOLD, 34 * s, WHITE, prog(t, at + 0.08, at + 0.35), track=0)


def s3_work(c, t):
    """bar 3 · a square opens into a browser window; a real project per beat slides through it."""
    t0 = 2 * BAR
    c.clear(argb(BLACK))
    dev = fit("DEVELOPER", F_HEAVY, W * 0.86, 420)
    masked(c, "DEVELOPER", W / 2, H / 2 + dev * 0.36, F_HEAVY, dev, WHITE, 1.0, prog(t, t0, t0 + 0.22))
    square_bg(c, t, t0, WHITE, 0.4)
    grow = io(prog(t, t0 + 0.12, t0 + 0.5))
    if grow < 1:
        w = lerp(220, BW * 0.9, grow)
        h = lerp(220, BH * 0.9, grow)
        rr(c, W / 2, H / 2, w, h, lerp(56, 22, grow), paint((28, 28, 30)))
        return
    s = lerp(0.9, 0.96, prog(t, t0 + 0.42, t0 + BAR))  # slow push-in
    browser(c, W / 2, H / 2 + 6, s, t)
    masked(c, "PROGETTI VERI", W / 2, 96, F_BOLD, 34, INK, prog(t, t0 + 0.3, t0 + 0.6), track=0.18, a=0.55)


def grid_cells():
    size, gap = 300, 24
    gx = W / 2 - (3 * size + 2 * gap) / 2 + size / 2
    gy = H / 2 - (2 * size + gap) / 2 + size / 2
    return [(gx + (i % 3) * (size + gap), gy + (i // 3) * (size + gap), size) for i in range(6)]


SWAPS = [(1, 0, 4), (2, 2, 3), (3, 1, 5)]  # beat in bar 4, cells swapping


def s4_grid(c, t):
    """bar 4 · the browser breaks into a 3×2 grid of squares; pairs swap places on the beat; all fold into one square."""
    t0 = 3 * BAR
    c.clear(argb(WHITE))
    split = io(prog(t, t0, t0 + 0.4))
    fold = io(prog(t, t0 + beat(3.25), t0 + BAR))
    cells = grid_cells()
    bw, bh = BW * 0.96, (BH - 52) * 0.96
    bx0, by0 = W / 2 - bw / 2, H / 2 + 6 - (BH * 0.96) / 2 + 52 * 0.96
    # where each tile currently sits (follows the swaps)
    order = list(range(6))
    for b, a1, a2 in SWAPS:
        at = t0 + beat(b)
        if t >= at + 0.42:
            order[a1], order[a2] = order[a2], order[a1]
    for img_i in range(6):
        slot = order.index(img_i)
        tx, ty, ts = cells[slot]
        # in the middle of a swap: travel on an arc between the two slots
        for b, a1, a2 in SWAPS:
            at = t0 + beat(b)
            p = io(prog(t, at, at + 0.42))
            if 0 < p < 1:
                prev = list(range(6))
                for b2, x1, x2 in SWAPS:
                    if t0 + beat(b2) < at:
                        prev[x1], prev[x2] = prev[x2], prev[x1]
                if img_i in (prev[a1], prev[a2]):
                    src_slot = prev.index(img_i)
                    dst_slot = a2 if src_slot == a1 else a1
                    (x1, y1, _), (x2, y2, _) = cells[src_slot], cells[dst_slot]
                    tx, ty = lerp(x1, x2, p), lerp(y1, y2, p) - math.sin(p * math.pi) * 90 * (1 if src_slot < dst_slot else -1)
        # split: from the browser sub-rect to the grid cell
        col, row = img_i % 3, img_i // 3
        sx = bx0 + (col + 0.5) * bw / 3
        sy = by0 + (row + 0.5) * bh / 2
        cx, cy = lerp(sx, tx, split), lerp(sy, ty, split)
        w, h = lerp(bw / 3, ts, split), lerp(bh / 2, ts, split)
        r = lerp(0, 28, split)
        # fold: everything into one gold square in the centre
        cx, cy = lerp(cx, W / 2, fold), lerp(cy, H / 2, fold)
        w, h = lerp(w, 220, fold), lerp(h, 220, fold)
        r = lerp(r, 56, fold)
        c.save()
        if split > 0.05 and fold < 0.9:
            soft_shadow(c, cx, cy, w, h, r, 0.14 * (1 - fold), 40, 22)
        rr_clip(c, cx, cy, w, h, r)
        c.drawImageRect(GRID[img_i], skia.Rect.MakeXYWH(cx - w / 2, cy - h / 2, w, h), SAMPLING)
        if split < 0.5:  # the browser's last frame cross-fades into the tiles while they split
            last = CLIPS[3][-1]
            sub = skia.Rect.MakeXYWH(col * last.width() / 3, row * last.height() / 2, last.width() / 3, last.height() / 2)
            fp = skia.Paint()
            fp.setAlphaf(1 - split / 0.5)
            c.drawImageRect(last, sub, skia.Rect.MakeXYWH(cx - w / 2, cy - h / 2, w, h), SAMPLING, fp)
        if fold > 0:
            c.drawRect(skia.Rect.MakeXYWH(cx - w / 2, cy - h / 2, w, h), paint(GOLD, fold))
        c.restore()


NUMBERS = [("13+", "progetti online"), ("7", "anni di esperienza"), ("6", "lingue"), ("100%", "su misura")]


def s5_numbers(c, t):
    """bar 5 · the square floods the frame gold; a giant number rolls on every beat."""
    t0 = 4 * BAR
    c.clear(argb(WHITE))
    flood = io(prog(t, t0, t0 + 0.34))
    s = lerp(220, math.hypot(W, H) * 1.02, flood)
    rr(c, W / 2, H / 2, s, s, lerp(56, 0, flood), paint(GOLD))
    if flood < 0.6:
        return
    for i, (num, label) in enumerate(NUMBERS):
        at = t0 + beat(i) + 0.06
        nxt = t0 + beat(i + 1) + 0.06 if i < 3 else 99
        if t < at or t > nxt + 0.4:
            continue
        pin = prog(t, at, at + 0.32)
        pout = prog(t, nxt, nxt + 0.3)
        masked(c, num, W / 2, H / 2 + 150, F_HEAVY, 480, INK, pin, pout, track=-0.04)
        masked(c, label, W / 2, H / 2 + 290, F_BOLD, 58, INK, prog(t, at + 0.06, at + 0.36), pout, track=0)


SERVICES = [("Design.", WHITE, BLACK), ("Sviluppo.", INK, GOLD), ("SEO.", INK, WHITE), ("Marketing.", GOLD, BLACK)]


def s6_services(c, t):
    """bar 6 · services, one per beat, each on its own colour block."""
    t0 = 5 * BAR
    c.clear(argb(GOLD))
    po = prog(t, t0, t0 + 0.25)  # the last number leaves under the first colour block
    masked(c, NUMBERS[-1][0], W / 2, H / 2 + 150, F_HEAVY, 480, INK, 1.0, po, track=-0.04)
    masked(c, NUMBERS[-1][1], W / 2, H / 2 + 290, F_BOLD, 58, INK, 1.0, po, track=0)
    for i, (word, fg, bg) in enumerate(SERVICES):
        square_bg(c, t, t0 + beat(i), bg)
    for i, (word, fg, bg) in enumerate(SERVICES):
        at = t0 + beat(i)
        if t < at or t >= at + B + 0.05:
            continue
        size = fit(word, F_HEAVY, W * 0.78, 300)
        pin = prog(t, at + 0.04, at + 0.32)
        masked(c, word, W / 2, H / 2 + size * 0.36, F_HEAVY, size, fg, pin)


def contact_pills(t, t0):
    """Positions/sizes of the two contact pills and their merge back into the square (bar 8)."""
    ew = width(EMAIL, F_BOLD, 50) + 170
    pw = width(PHONE, F_BOLD, 54) + 170
    merge = io(prog(t, t0 + BAR + beat(2.2), t0 + BAR + beat(3.0)))
    to_sq = io(prog(t, t0 + BAR + beat(3.0), t0 + 2 * BAR - 0.04))
    ey, py = H / 2 + 160, H / 2 + 300
    return ew, pw, ey, py, merge, to_sq


def s7_contact(c, t):
    """bars 7–8 · contact card; at the end the pills merge into the gold square of frame 0."""
    t0 = 6 * BAR
    c.clear(argb(BLACK))  # continues from "Marketing." on black
    mk = fit("Marketing.", F_HEAVY, W * 0.78, 300)
    masked(c, "Marketing.", W / 2, H / 2 + mk * 0.36, F_HEAVY, mk, GOLD, 1.0, prog(t, t0, t0 + 0.24))
    ew, pw, ey, py, merge, to_sq = contact_pills(t, t0)
    text_out = prog(t, t0 + BAR + beat(1.8), t0 + BAR + beat(2.5))
    masked(c, "Parliamo del", W / 2, H / 2 - 150, F_HEAVY, 130, WHITE, prog(t, t0 + 0.05, t0 + 0.4), text_out)
    masked(c, "tuo progetto.", W / 2, H / 2 - 20, F_HEAVY, 130, GOLD, prog(t, t0 + 0.15, t0 + 0.5), text_out)
    # email pill (outline) and phone pill (gold) grow out of dots, then merge and become the square
    for k, (label, size, y, w_full, filled) in enumerate([(EMAIL, 50, ey, ew, False), (PHONE, 54, py, pw, True)]):
        grow = out(prog(t, t0 + beat(1) + k * 0.12, t0 + beat(2) + k * 0.12))
        if grow <= 0:
            continue
        w = lerp(90, w_full, grow)
        h = 116
        cy = y
        # merge: both pills travel to the centre and take the phone pill's shape
        cy = lerp(cy, H / 2, merge)
        w = lerp(w, pw * 0.7, merge)
        # → the 160 px gold square of the opening frame
        w = lerp(w, 160, to_sq)
        h = lerp(h, 160, to_sq)
        r = lerp(h / 2, 42, to_sq)
        a_fill = 1.0 if filled else merge
        if not filled:
            rr(c, W / 2, cy, w, h, r, paint(WHITE, 0.08 * (1 - merge)))
            rr(c, W / 2, cy, w, h, r, paint(WHITE, 0.7 * (1 - merge), stroke=3))
        if a_fill > 0:
            rr(c, W / 2, cy, w, h, r, paint(GOLD, a_fill))
        la = prog(t, t0 + beat(1.5) + k * 0.12, t0 + beat(2.2) + k * 0.12) * (1 - text_out)
        if la > 0:
            c.save()
            rr_clip(c, W / 2, cy, w, h, r)
            fg = INK if filled else WHITE
            x0 = W / 2 - w_full / 2 + 74
            icon = paint(fg, la, stroke=4)
            if filled:  # phone
                c.drawRoundRect(skia.Rect.MakeXYWH(x0 - 4, cy - 30, 34, 58), 8, 8, icon)
                c.drawLine(x0 + 8, cy + 18, x0 + 18, cy + 18, icon)
            else:  # envelope
                c.drawRoundRect(skia.Rect.MakeXYWH(x0 - 12, cy - 22, 52, 40), 7, 7, icon)
                path = skia.Path()
                path.moveTo(x0 - 8, cy - 18)
                path.lineTo(x0 + 14, cy)
                path.lineTo(x0 + 36, cy - 18)
                c.drawPath(path, icon)
            text(c, label, x0 + 64, cy + size * 0.36, F_BOLD, size, fg, la, align="left")
            c.restore()
    masked(c, "Claudio Taras  ·  Web designer & developer", W / 2, H - 70, F_SEMI, 30, GREY, prog(t, t0 + beat(2), t0 + beat(2.6)), text_out, track=0.02)


SCENES = [(0, BAR, s1_name), (BAR, 2 * BAR, s2_role), (2 * BAR, 3 * BAR, s3_work), (3 * BAR, 4 * BAR, s4_grid), (4 * BAR, 5 * BAR, s5_numbers), (5 * BAR, 6 * BAR, s6_services), (6 * BAR, DUR + 1, s7_contact)]


def draw_frame(c, t):
    for a, b, fn in SCENES:
        if a <= t < b:
            c.save()
            fn(c, t)
            c.restore()
            return


def render_video(path):
    buf = np.zeros((H, W, 4), np.uint8)
    c = skia.Surface(buf, colorType=skia.kRGBA_8888_ColorType).getCanvas()
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", path], stdin=subprocess.PIPE)
    n = int(round(DUR * FPS))
    for i in range(n):
        draw_frame(c, i / FPS)
        ff.stdin.write(buf.tobytes())
        if i % 120 == 0:
            print(f"  {i / FPS:4.1f}s")
    ff.stdin.close()
    ff.wait()


# ------------------------------------------------------------------ music: house-pop, 128 BPM, seamless loop

SR = sr.SR
PROG = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]  # C G Am F
ROOTS = [36, 43, 45, 41]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def stab(notes, dur=0.22):
    """House chord stab: detuned saws through a closing low-pass."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for m in notes:
        for det in (-0.12, 0.0, 0.12):
            x += sr.saw(hz(m + det), n, 18)
    x = sr.fft_filter(x, lo=180, hi=3200)
    return x * np.exp(-t / 0.075) * (1 - np.exp(-t / 0.003)) * 0.07


def keys(notes, dur):
    """Bright electric-piano chord for the breakdown."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for m in notes:
        f = hz(m + 12)
        x += np.sin(2 * np.pi * f * t + (0.9 * np.exp(-t / 0.2) + 0.1) * np.sin(2 * np.pi * f * t))
    return x * np.exp(-t / 0.9) * (1 - np.exp(-t / 0.004)) * np.minimum(1, (n - np.arange(n)) / (0.1 * SR)) * 0.09


def build_cycle(L, offset, drums, music, send, kicks):
    """One 8-bar cycle starting at `offset` seconds."""
    K, CL = sr.kick(), sr.clap()
    HC, HO = sr.hat(0.012), sr.hat(0.06)
    s16 = B / 4
    for bar in range(8):
        t_bar = offset + bar * BAR
        ci = bar % 4
        breakdown = bar == 6  # contact card: lighter
        build = bar == 7
        # pad under everything
        sr.add_lr(music, sr.pad_chord(PROG[ci], BAR + 0.3), t_bar, 0.55 if not breakdown else 0.8, send, 0.4)
        if breakdown:
            sr.add(music, keys(PROG[ci], BAR), t_bar, 1.0, 0.0, send, 0.5)
        for j in range(16):
            t = t_bar + j * s16
            beat_i, sub = divmod(j, 4)
            if not breakdown and sub == 0:
                sr.add(drums, K, t, 1.0)
                kicks.append(t)
            if beat_i in (1, 3) and sub == 0:
                sr.add(drums, CL, t, 0.85 if not breakdown else 0.6, -0.05, send, 0.35)
            if build and j >= 8:  # clap roll into the loop point
                sr.add(drums, CL, t, 0.25 + 0.06 * (j - 8), 0.1, send, 0.25)
            if sub == 2:
                sr.add(drums, HO, t, 0.36, 0.3)
            elif not breakdown:
                sr.add(drums, HC, t, (0.35, 0.16, 0, 0.2)[sub], 0.25)
            # offbeat house stabs
            if sub == 2 and not breakdown:
                sr.add(music, stab(PROG[ci]), t, 1.0, -0.2 if beat_i % 2 else 0.2, send, 0.25)
            # bass: root on the offbeat 8ths, octave jump at the end of the bar
            if sub == 2 or (j == 14):
                sr.add(music, sr.bass_note(ROOTS[ci] + (12 if j == 14 else 0)), t, 1.0 if not breakdown else 0.6)
        # pluck hook on bars 3–6 (the busiest scenes)
        if 2 <= bar <= 5:
            hook = [0, 2, 3, 2, 1, 2, 3, 3]
            for k, idx in enumerate(hook):
                if k in (3, 7):
                    continue
                tones = PROG[ci] + [PROG[ci][0] + 12]
                sr.add(music, sr.pluck(tones[idx] + 12), t_bar + k * (B / 2), 0.7, 0.3 if k % 2 else -0.3, send, 0.35)


def build_audio(path):
    # two cycles; keep the second so tails from bar 8 spill into bar 1 exactly as in the loop
    L = int(2 * DUR * SR) + SR
    drums, music, send = (np.zeros((2, L)) for _ in range(3))
    kicks = []
    for cyc in range(2):
        build_cycle(L, cyc * DUR, drums, music, send, kicks)
    sc = np.ones(L)
    tt = np.arange(int(0.4 * SR)) / SR
    dip = 1 - 0.65 * np.exp(-tt / 0.1)
    for k in kicks:
        i = int(k * SR)
        seg = dip[: L - i]
        sc[i : i + len(seg)] = np.minimum(sc[i : i + len(seg)], seg)
    music *= sc
    wet = sr.reverb(send, 2.0)
    mix_ = drums * 0.85 + music + wet * 0.3
    track = np.vstack([sr.fft_filter(mix_[0], lo=30), sr.fft_filter(mix_[1], lo=30)])
    a, b = int(DUR * SR), int(2 * DUR * SR)
    track = track[:, a:b]
    track = np.tanh(track / (np.max(np.abs(track)) + 1e-9) * 1.5) * 0.9
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
        sheet = np.full((rows * (th + 6), cols * (tw + 6), 3), 90, np.uint8)
        for i, tile in enumerate(tiles):
            r, q = divmod(i, cols)
            sheet[r * (th + 6) : r * (th + 6) + th, q * (tw + 6) : q * (tw + 6) + tw] = tile
        raw = os.path.join(tmp, "loop.rgb")
        sheet.tofile(raw)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{sheet.shape[1]}x{sheet.shape[0]}", "-i", raw, os.path.join(tmp, "loop-sheet.jpg")], check=True)
        print("sheet:", os.path.join(tmp, "loop-sheet.jpg"))
        return
    video = os.path.join(tmp, "loop.mp4")
    audio = os.path.join(tmp, "loop.wav")
    if "--audio-only" not in sys.argv:
        print("rendering video…")
        render_video(video)
    print("building soundtrack…")
    build_audio(audio)
    out_path = os.path.join(OUT_DIR, "claudio-taras-promo-it-loop-16x9.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-movflags", "+faststart", "-shortest", out_path], check=True)
    print("done:", out_path, round(os.path.getsize(out_path) / 1e6, 1), "MB")


if __name__ == "__main__":
    main()
