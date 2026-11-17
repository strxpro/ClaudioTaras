"""
15-second Italian promo (9:16, 1080x1920, 60 fps) — Apple-style motion graphics: shape morphs
(dot → pill → squircle → full screen, pill → phone, icon shape morphs), masked kinetic type, real
project footage in a phone, a counter, and an end card with e-mail and phone. Soundtrack: the
showreel synth (scripts/showreel.py) re-arranged at 120 BPM, every cut on a beat.

  .capture/pyenv/Scripts/python.exe scripts/promo.py            (needs: pip install skia-python)
Output: promo/claudio-taras-promo-it-9x16.mp4 (+ poster .jpg)
"""
import math
import os
import subprocess
import sys

import numpy as np
import skia

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import showreel as sr  # noqa: E402  (instruments + mixing helpers)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "promo")
W, H, FPS, DUR = 1080, 1920, 60, 15.0
BEAT = 0.5

INK, ACID, PAPER, WHITE = (10, 10, 10), (255, 210, 63), (244, 244, 242), (255, 255, 255)
EMAIL, PHONE = "claudiotaras3@gmail.com", "+39 345 451 0973"

FONTS = "C:/Windows/Fonts"
F_DISPLAY = skia.Typeface.MakeFromFile(f"{FONTS}/impact.ttf")
F_BOLD = skia.Typeface.MakeFromFile(f"{FONTS}/segoeuib.ttf")
F_SEMI = skia.Typeface.MakeFromFile(f"{FONTS}/seguisb.ttf")

PROJECTS = [  # phone footage: slug, label, category, start second in mobile.mp4
    ("carruleddhi-show", "Carruleddhi Show", "Evento", 4.0),
    ("onda", "Gelateria Onda", "Web app", 6.0),
    ("villa-dea", "Villa Dea", "Sito web", 5.0),
    ("isola-del-gioiello", "L'Isola del Gioiello", "E-commerce", 4.0),
]
CARDS = ["shistoria", "pizzeria", "grindi-group"]

# ------------------------------------------------------------------ easing / helpers


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def prog(t, a, b):
    return clamp((t - a) / (b - a)) if b > a else float(t >= a)


def expo_out(p):
    return 1 if p >= 1 else 1 - 2 ** (-10 * p)


def expo_in_out(p):
    if p <= 0:
        return 0
    if p >= 1:
        return 1
    return 2 ** (20 * p - 10) / 2 if p < 0.5 else (2 - 2 ** (-20 * p + 10)) / 2


def back_out(p, s=1.9):
    p -= 1
    return 1 + p * p * ((s + 1) * p + s)


def lerp(a, b, p):
    return a + (b - a) * p


def color(rgb, a=1.0):
    return skia.Color4f(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, clamp(a))


def paint(rgb, a=1.0, blur=0.0, stroke=0.0):
    p = skia.Paint(AntiAlias=True)
    p.setColor4f(color(rgb, a))
    if stroke:
        p.setStyle(skia.Paint.kStroke_Style)
        p.setStrokeWidth(stroke)
    if blur > 0.25:
        p.setImageFilter(skia.ImageFilters.Blur(blur, blur))
    return p


def font(face, size):
    f = skia.Font(face, size)
    f.setSubpixel(True)
    f.setEdging(skia.Font.Edging.kAntiAlias)
    return f


def width(s, face, size, track=0.0):
    return font(face, size).measureText(s) + track * size * max(0, len(s) - 1)


def fit(s, face, max_w, start):
    size = start
    while size > 20 and width(s, face, size) > max_w:
        size -= 4
    return size


def text(c, s, x, y, face, size, rgb, a=1.0, align="center", blur=0.0, track=0.0):
    """Draw text with its baseline at y; align center/left/right; optional letter tracking."""
    if a <= 0.005:
        return
    f = font(face, size)
    w = width(s, face, size, track)
    x0 = x - w / 2 if align == "center" else x - w if align == "right" else x
    p = paint(rgb, a, blur)
    if not track:
        c.drawString(s, x0, y, f, p)
        return
    for ch in s:
        c.drawString(ch, x0, y, f, p)
        x0 += f.measureText(ch) + track * size


def rise(c, s, x, y, face, size, rgb, p, align="center", a=1.0, track=0.0):
    """Masked line rise (text slides up from behind its own baseline)."""
    if p <= 0:
        return
    asc = size * 0.95
    w = width(s, face, size, track)
    x0 = x - w / 2 if align == "center" else x - w if align == "right" else x
    c.save()
    c.clipRect(skia.Rect.MakeLTRB(x0 - 20, y - asc - 10, x0 + w + 20, y + size * 0.22))
    off = (1 - expo_out(p)) * size * 1.1
    text(c, s, x, y + off, face, size, rgb, a, align, blur=(1 - p) * 6, track=track)
    c.restore()


def letters(c, s, x, y, face, size, rgb, t, start, stagger=0.045, dur=0.5, align="center"):
    """Per-letter masked rise with stagger (kinetic title)."""
    f = font(face, size)
    w = width(s, face, size)
    x0 = x - w / 2 if align == "center" else x
    asc = size * 0.95
    for i, ch in enumerate(s):
        cw = f.measureText(ch)
        p = prog(t, start + i * stagger, start + i * stagger + dur)
        if p > 0:
            c.save()
            c.clipRect(skia.Rect.MakeLTRB(x0 - 4, y - asc - 6, x0 + cw + 4, y + size * 0.2))
            off = (1 - expo_out(p)) * size
            c.drawString(ch, x0, y + off, f, paint(rgb, 1, (1 - p) * 8))
            c.restore()
        x0 += cw


def rrect(c, cx, cy, w, h, r, p):
    c.drawRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(cx - w / 2, cy - h / 2, w, h), r, r), p)


def shadow(c, cx, cy, w, h, r, a=0.45, blur=40, dy=30):
    rrect(c, cx, cy + dy, w * 0.94, h * 0.96, r, paint(INK, a, blur))


# ------------------------------------------------------------------ media


def footage(slug, start, dur, w, h):
    """Frames (30 fps) of a project's phone recording, cropped to w×h, as skia images."""
    src = os.path.join(ROOT, "public", "media", "projects", slug, "mobile.mp4")
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-ss", f"{start}", "-t", f"{dur}", "-i", src, "-vf",
         f"fps=30,scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
        capture_output=True, check=True).stdout
    n = len(raw) // (w * h * 4)
    arr = np.frombuffer(raw, np.uint8)[: n * w * h * 4].reshape(n, h, w, 4)
    return [skia.Image.fromarray(np.ascontiguousarray(a)) for a in arr]


def still(path, w, h):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
                          "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], capture_output=True, check=True).stdout
    return skia.Image.fromarray(np.frombuffer(raw, np.uint8).reshape(h, w, 4).copy())


SCREEN_W, SCREEN_H = 488, 1046
print("loading footage…")
CLIPS = [footage(s, st, 1.2, SCREEN_W, SCREEN_H) for s, _, _, st in PROJECTS]
CARD_IMG = [still(os.path.join(ROOT, "public", "media", "projects", s, "shots", "d02.webp"), 640, 400) for s in CARDS]
SAMPLING = skia.SamplingOptions(skia.FilterMode.kLinear)

# ------------------------------------------------------------------ shape morph (icons)


def shape_points(kind, cx, cy, r, n=96):
    """n points around a shape's outline, starting at the top, clockwise — so shapes can morph."""
    pts = []
    if kind == "circle":
        for i in range(n):
            a = -math.pi / 2 + 2 * math.pi * i / n
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        return pts
    if kind == "square":
        corners = [(cx, cy - r), (cx + r, cy - r), (cx + r, cy + r), (cx - r, cy + r), (cx - r, cy - r), (cx, cy - r)]
    elif kind == "triangle":
        corners = [(cx, cy - r * 1.1), (cx + r * 1.05, cy + r * 0.75), (cx - r * 1.05, cy + r * 0.75), (cx, cy - r * 1.1)]
    else:  # star
        corners = []
        for k in range(11):
            a = -math.pi / 2 + math.pi * k / 5
            rr = r * 1.12 if k % 2 == 0 else r * 0.5
            corners.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    seg = [math.dist(corners[i], corners[i + 1]) for i in range(len(corners) - 1)]
    total = sum(seg)
    for i in range(n):
        d = total * i / n
        k = 0
        while d > seg[k]:
            d -= seg[k]
            k += 1
        q = d / seg[k]
        a, b = corners[k], corners[k + 1]
        pts.append((lerp(a[0], b[0], q), lerp(a[1], b[1], q)))
    return pts


def draw_shape(c, pts, p):
    path = skia.Path()
    path.moveTo(*pts[0])
    for x, y in pts[1:]:
        path.lineTo(x, y)
    path.close()
    c.drawPath(path, p)


def icon_envelope(c, cx, cy, s, rgb):
    p = paint(rgb, 1, stroke=s * 0.09)
    p.setStrokeJoin(skia.Paint.kRound_Join)
    c.drawRoundRect(skia.Rect.MakeXYWH(cx - s / 2, cy - s * 0.36, s, s * 0.72), s * 0.1, s * 0.1, p)
    path = skia.Path()
    path.moveTo(cx - s / 2 + s * 0.06, cy - s * 0.28)
    path.lineTo(cx, cy + s * 0.06)
    path.lineTo(cx + s / 2 - s * 0.06, cy - s * 0.28)
    c.drawPath(path, p)


def icon_phone(c, cx, cy, s, rgb):
    p = paint(rgb, 1, stroke=s * 0.09)
    c.drawRoundRect(skia.Rect.MakeXYWH(cx - s * 0.3, cy - s / 2, s * 0.6, s), s * 0.12, s * 0.12, p)
    c.drawLine(cx - s * 0.08, cy + s * 0.36, cx + s * 0.08, cy + s * 0.36, p)


# ------------------------------------------------------------------ scenes


def s1_intro(c, t):
    """0–1.5 · dot → pill → squircle → full screen, "CIAO" inside."""
    c.clear(color(INK).toColor())
    cx, cy = W / 2, H / 2
    if t < 0.3:
        r = 48 * back_out(prog(t, 0, 0.3))
        c.drawCircle(cx, cy, max(0, r), paint(ACID))
        return
    if t < 0.65:
        p = expo_in_out(prog(t, 0.3, 0.65))
        w, h = lerp(96, 620, p), lerp(96, 170, p)
        r = h / 2
        rot = 0
    elif t < 0.95:
        p = expo_in_out(prog(t, 0.65, 0.95))
        w, h = lerp(620, 460, p), lerp(170, 460, p)
        r = lerp(85, 110, p)
        rot = lerp(0, -8, p)
    else:
        p = expo_in_out(prog(t, 0.95, 1.45))
        w, h = lerp(460, W * 1.08, p), lerp(460, H * 1.04, p)
        r = lerp(110, 0, p)
        rot = lerp(-8, 0, p)
    c.save()
    c.translate(cx, cy)
    c.rotate(rot)
    c.translate(-cx, -cy)
    rrect(c, cx, cy, w, h, r, paint(ACID))
    c.clipRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(cx - w / 2, cy - h / 2, w, h), r, r), True)
    pin = prog(t, 0.42, 0.7)
    out = prog(t, 1.0, 1.35)
    if pin > 0 and out < 1:
        size = 128 * (1 + out * 1.8)
        text(c, "CIAO!", cx, cy + size * 0.36 + (1 - expo_out(pin)) * 120, F_DISPLAY, size, INK, 1 - out, blur=out * 18)
    c.restore()


def s2_name(c, t):
    """1.5–3.5 · on yellow: SONO / CLAUDIO / TARAS, role, three chips that morph out of dots."""
    c.clear(color(ACID).toColor())
    exit_p = expo_in_out(prog(t, 3.18, 3.5))
    c.save()
    s = 1 + exit_p * 0.12
    c.translate(W / 2, H * 0.5)
    c.scale(s, s)
    c.translate(-W / 2, -H * 0.5)
    if exit_p > 0:
        c.saveLayerAlpha(None, int(255 * (1 - exit_p)))
    rise(c, "SONO", W / 2, H * 0.36, F_SEMI, 58, INK, prog(t, 1.5, 1.9), track=0.32)
    size = fit("CLAUDIO", F_DISPLAY, W * 0.88, 330)
    letters(c, "CLAUDIO", W / 2, H * 0.5, F_DISPLAY, size, INK, t, 1.55)
    letters(c, "TARAS", W / 2, H * 0.5 + size * 0.86, F_DISPLAY, size, INK, t, 1.78)
    rise(c, "WEB DESIGNER & DEVELOPER", W / 2, H * 0.5 + size * 1.32, F_BOLD, 46, INK, prog(t, 2.25, 2.7), track=0.12)
    chips = ["23 anni", "7 anni sul web", "Italia · Europa"]
    widths = [width(x, F_BOLD, 40) + 64 for x in chips]
    total = sum(widths) + 24 * (len(chips) - 1)
    x = W / 2 - total / 2
    for i, label in enumerate(chips):
        p = prog(t, 2.55 + i * 0.14, 2.95 + i * 0.14)
        if p > 0:
            cw = widths[i]
            e = expo_out(p)
            w = lerp(34, cw, e)
            cxp = x + cw / 2
            cy = H * 0.82
            rrect(c, cxp, cy, w, 84, 42, paint(INK, min(1, p * 3)))
            if p > 0.35:
                text(c, label, cxp, cy + 14, F_BOLD, 40, ACID, prog(t, 2.65 + i * 0.14, 2.9 + i * 0.14))
        x += widths[i] + 24
    if exit_p > 0:
        c.restore()
    c.restore()
    # circle wipe to black from the bottom
    if t > 3.2:
        p = expo_in_out(prog(t, 3.2, 3.5))
        c.drawCircle(W / 2, H * 1.05, p * H * 1.3, paint(INK))


WORDS = ["SITI WEB", "E-COMMERCE", "WEB APP", "BRAND"]
SWAP = [3.6, 4.1, 4.6, 5.1]


def s3_words(c, t):
    """3.5–6.0 · CREO [rolling word in a pill that morphs to fit] CHE VENDONO."""
    c.clear(color(INK).toColor())
    to_phone = expo_in_out(prog(t, 5.82, 6.0))
    a_text = 1 - to_phone
    rise(c, "CREO", W / 2, H * 0.37, F_DISPLAY, 230, WHITE, prog(t, 3.5, 3.85), a=a_text)
    wsize = 150
    pads = [width(w, F_DISPLAY, wsize) + 110 for w in WORDS]
    k = max(i for i, s in enumerate(SWAP) if t >= s) if t >= SWAP[0] else 0
    pw = pads[k]
    if k > 0:
        pw = lerp(pads[k - 1], pads[k], expo_in_out(prog(t, SWAP[k], SWAP[k] + 0.3)))
    pill_in = back_out(prog(t, 3.55, 3.95))
    cy = H * 0.5
    pw *= pill_in
    ph = 210
    # the pill becomes the phone of the next scene
    phone = (W / 2, H * 0.47, 520, 1078, 76)
    cx_, cy_, w_, h_, r_ = (lerp(W / 2, phone[0], to_phone), lerp(cy, phone[1], to_phone), lerp(pw, phone[2], to_phone), lerp(ph, phone[3], to_phone), lerp(ph / 2, phone[4], to_phone))
    if pw > 2:
        rrect(c, cx_, cy_, w_, h_, r_, paint(ACID))
        c.save()
        c.clipRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(cx_ - w_ / 2, cy_ - h_ / 2, w_, h_), r_, r_), True)
        for i, word in enumerate(WORDS):
            pin = prog(t, SWAP[i], SWAP[i] + 0.32)
            pout = prog(t, SWAP[i + 1], SWAP[i + 1] + 0.28) if i + 1 < len(SWAP) else 0
            if pin <= 0 or pout >= 1:
                continue
            y = cy + wsize * 0.36 + (1 - expo_out(pin)) * 170 - expo_in_out(pout) * 170
            text(c, word, W / 2, y, F_DISPLAY, wsize, INK, a_text * (1 - pout), blur=(1 - pin) * 10 + pout * 10)
        c.restore()
    rise(c, "CHE VENDONO.", W / 2, H * 0.65, F_DISPLAY, 150, WHITE, prog(t, 5.3, 5.65), a=a_text)
    u = expo_out(prog(t, 5.55, 5.85))
    if u > 0 and a_text > 0:
        uw = width("CHE VENDONO.", F_DISPLAY, 150) * u
        c.drawRect(skia.Rect.MakeXYWH(W / 2 - width("CHE VENDONO.", F_DISPLAY, 150) / 2, H * 0.65 + 26, uw, 12), paint(ACID, a_text))


PHONE_SWITCH = [6.0, 6.85, 7.7, 8.55]


def phone_frame(c, cx, cy, s, t):
    w, h, r = 520 * s, 1078 * s, 76 * s
    shadow(c, cx, cy, w, h, r, 0.6, 50, 40)
    rrect(c, cx, cy, w, h, r, paint((24, 24, 24)))
    rrect(c, cx, cy, w, h, r, paint(WHITE, 0.16, stroke=2))
    sw, sh, sr_ = SCREEN_W * s, SCREEN_H * s, 58 * s
    rect = skia.Rect.MakeXYWH(cx - sw / 2, cy - sh / 2, sw, sh)
    c.save()
    c.clipRRect(skia.RRect.MakeRectXY(rect, sr_, sr_), True)
    c.drawRect(rect, paint(INK))
    for i, start in enumerate(PHONE_SWITCH):
        pin = expo_in_out(prog(t, start, start + 0.32)) if i else 1
        nxt = PHONE_SWITCH[i + 1] if i + 1 < len(PHONE_SWITCH) else 99
        pout = expo_in_out(prog(t, nxt, nxt + 0.32))
        if t < start or pout >= 1:
            continue
        frames = CLIPS[i]
        img = frames[min(len(frames) - 1, int((t - start) * 30))]
        y = rect.top() + (1 - pin) * sh - pout * sh * 0.35
        c.save()
        if pout > 0:
            c.saveLayerAlpha(None, int(255 * (1 - pout * 0.6)))
        c.drawImageRect(img, skia.Rect.MakeXYWH(rect.left(), y, sw, sh), SAMPLING)
        if pout > 0:
            c.restore()
        c.restore()
    c.restore()
    rrect(c, cx, rect.top() + 34 * s, 150 * s, 42 * s, 21 * s, paint(INK))  # dynamic island


def s4_phone(c, t):
    """6.0–9.5 · real projects in a phone, names swapping, then cards + a counter."""
    c.clear(color(INK).toColor())
    # glow behind the phone
    c.drawCircle(W / 2, H * 0.47, 520, paint(ACID, 0.12, 120))
    k = max(i for i, s in enumerate(PHONE_SWITCH) if t >= s)
    # giant outline name drifting behind
    name = PROJECTS[k][1].upper()
    gs = 300
    drift = (t - PHONE_SWITCH[k]) * -260
    text(c, name, W * 0.5 + 300 + drift, H * 0.52, F_DISPLAY, gs, WHITE, 0.09, align="center")
    rise(c, "PROGETTI VERI.", W / 2, H * 0.11, F_DISPLAY, 130, WHITE, prog(t, 6.05, 6.4))
    side = expo_in_out(prog(t, 8.55, 9.05))
    zoom = expo_in_out(prog(t, 9.28, 9.5))
    c.save()
    zs = 1 + zoom * 0.7
    c.translate(W / 2, H / 2)
    c.scale(zs, zs)
    c.translate(-W / 2, -H / 2)
    # cards fly in from the right, behind the phone
    for i, img in enumerate(CARD_IMG):
        p = expo_out(prog(t, 8.6 + i * 0.1, 9.1 + i * 0.1))
        if p <= 0:
            continue
        cx = lerp(W + 400, W * 0.7 + i * 26, p)
        cy = H * 0.36 + i * 250
        c.save()
        c.translate(cx, cy)
        c.rotate(lerp(14, -6 + i * 5, p))
        rr = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(-320 * 0.8, -200 * 0.8, 640 * 0.8, 400 * 0.8), 26, 26)
        c.drawRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(-250, -140, 512, 330), 26, 26), paint(INK, 0.5, 30))
        c.save()
        c.clipRRect(rr, True)
        c.drawImageRect(img, rr.rect(), SAMPLING)
        c.restore()
        c.restore()
    px = lerp(W / 2, W * 0.34, side)
    ps = lerp(1.0, 0.78, side)
    phone_frame(c, px, H * 0.47, ps, t)
    c.restore()
    # caption under the phone
    if side < 1:
        for i, (_, label, cat, _) in enumerate(PROJECTS):
            pin = prog(t, PHONE_SWITCH[i] + (0.1 if i else 0.15), PHONE_SWITCH[i] + 0.45)
            nxt = PHONE_SWITCH[i + 1] if i + 1 < len(PHONE_SWITCH) else 8.55
            pout = prog(t, nxt, nxt + 0.2)
            if pin > 0 and pout < 1:
                a = (1 - pout) * (1 - side)
                rise(c, label, W / 2, H * 0.92, F_BOLD, 56, WHITE, pin, a=a)
                rise(c, cat.upper(), W / 2, H * 0.955, F_SEMI, 32, ACID, pin, a=a, track=0.25)
    # counter
    cp = prog(t, 8.65, 9.2)
    if cp > 0:
        n = int(round(13 * expo_out(cp)))
        a = 1 - zoom
        rise(c, f"{n}+", W * 0.72, H * 0.86, F_DISPLAY, 210, ACID, prog(t, 8.6, 8.9), a=a)
        rise(c, "PROGETTI ONLINE", W * 0.72, H * 0.905, F_BOLD, 40, WHITE, prog(t, 8.75, 9.05), a=a, track=0.1)
    if zoom > 0:
        c.drawRect(skia.Rect.MakeWH(W, H), paint(PAPER, zoom))


SERVICES = [("DESIGN.", "circle"), ("SVILUPPO.", "square"), ("SEO.", "triangle"), ("MARKETING.", "star")]
SLAM = [9.5, 10.0, 10.5, 11.0]


def s5_services(c, t):
    """9.5–12.0 · DESIGN. SVILUPPO. SEO. MARKETING. — slam in, a yellow icon morphs alongside."""
    c.clear(color(PAPER).toColor())
    size = 160
    x = W * 0.08
    ys = [H * 0.3 + i * size * 1.02 for i in range(4)]
    k = max(i for i, s in enumerate(SLAM) if t >= s)
    for i, (word, _) in enumerate(SERVICES):
        p = prog(t, SLAM[i], SLAM[i] + 0.35)
        if p <= 0:
            continue
        cur = i == k
        rgb = INK
        a = 1 if cur else 0.22
        c.save()
        sc = back_out(p, 2.4) if p < 1 else 1
        c.translate(x, ys[i])
        c.scale(lerp(1.25, 1, min(1, sc)), lerp(1.25, 1, min(1, sc)))
        c.translate(-x, -ys[i])
        rise(c, word, x, ys[i], F_DISPLAY, size, rgb, p, align="left", a=a)
        c.restore()
    # morphing icon: follows the current word, shapes morph one into the next
    ix = W - 130
    iy = ys[k] - size * 0.36
    if k > 0:
        mp = expo_in_out(prog(t, SLAM[k], SLAM[k] + 0.4))
        my = lerp(ys[k - 1] - size * 0.36, iy, mp)
        a_pts = shape_points(SERVICES[k - 1][1], ix, my, 70)
        b_pts = shape_points(SERVICES[k][1], ix, my, 70)
        pts = [(lerp(a[0], b[0], mp), lerp(a[1], b[1], mp)) for a, b in zip(a_pts, b_pts)]
    else:
        r = 70 * back_out(prog(t, 9.55, 9.9))
        pts = shape_points("circle", ix, iy, max(1, r))
    end = expo_in_out(prog(t, 11.78, 12.0))
    if end > 0:  # the icon grows into a black circle that covers everything
        circ = shape_points("circle", ix, iy, 70 + end * H * 1.4)
        pts = [(lerp(a[0], b[0], min(1, end * 3)), lerp(a[1], b[1], min(1, end * 3))) for a, b in zip(pts, circ)]
        draw_shape(c, pts, paint(INK))
    else:
        c.save()
        c.translate(ix, iy)
        c.rotate((t - 9.5) * 40)
        c.translate(-ix, -iy)
        draw_shape(c, pts, paint(ACID))
        c.restore()
    # one person, all of it
    bp = expo_out(prog(t, 11.35, 11.7))
    if bp > 0 and end < 0.3:
        label = "TUTTO DA UNA SOLA PERSONA."
        lw = width(label, F_BOLD, 48, 0.06)
        c.drawRect(skia.Rect.MakeXYWH(W / 2 - lw / 2 - 18, H * 0.86 - 50, (lw + 36) * bp, 72), paint(ACID))
        text(c, label, W / 2, H * 0.86, F_BOLD, 48, INK, prog(t, 11.45, 11.7), track=0.06)


def s6_end(c, t):
    """12.0–15.0 · CT, PARLIAMO DEL TUO PROGETTO., e-mail and phone pills morphing out of dots."""
    c.clear(color(INK).toColor())
    breathe = 0.5 + 0.5 * math.sin((t - 12) * 2.4)
    c.drawCircle(W / 2, H * 0.27, 300 + breathe * 30, paint(ACID, 0.14 + breathe * 0.05, 110))
    p = expo_out(prog(t, 12.0, 12.5))
    if p > 0:
        c.save()
        s = lerp(0.55, 1, p)
        c.translate(W / 2, H * 0.3)
        c.scale(s, s)
        c.skew(-0.2, 0)
        c.translate(-W / 2, -H * 0.3)
        text(c, "CT", W / 2, H * 0.3, F_DISPLAY, 300, ACID, p, blur=(1 - p) * 14)
        c.restore()
    rise(c, "PARLIAMO DEL", W / 2, H * 0.44, F_DISPLAY, 140, WHITE, prog(t, 12.2, 12.6))
    rise(c, "TUO PROGETTO.", W / 2, H * 0.44 + 134, F_DISPLAY, 140, ACID, prog(t, 12.3, 12.7))
    for i, (label, icon, filled) in enumerate([(EMAIL, icon_envelope, False), (PHONE, icon_phone, True)]):
        pp = prog(t, 12.65 + i * 0.18, 13.15 + i * 0.18)
        if pp <= 0:
            continue
        size = 54 if filled else 50
        full = width(label, F_BOLD, size) + 190
        e = expo_out(pp)
        w = lerp(84, full, e)
        cy = H * 0.65 + i * 160
        ph = 124
        if filled:
            rrect(c, W / 2, cy, w, ph, ph / 2, paint(ACID))
        else:
            rrect(c, W / 2, cy, w, ph, ph / 2, paint(WHITE, 0.08))
            rrect(c, W / 2, cy, w, ph, ph / 2, paint(WHITE, 0.6, stroke=3))
        if pp > 0.3:
            c.save()
            c.clipRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(W / 2 - w / 2, cy - ph / 2, w, ph), ph / 2, ph / 2), True)
            a = prog(t, 12.8 + i * 0.18, 13.2 + i * 0.18)
            fg = INK if filled else WHITE
            x0 = W / 2 - full / 2 + 80
            icon(c, x0, cy, 48, fg)
            text(c, label, x0 + 50, cy + size * 0.36, F_BOLD, size, fg, a, align="left")
            c.restore()
    rise(c, "CLAUDIO TARAS · WEB DESIGNER & DEVELOPER", W / 2, H * 0.9, F_SEMI, 32, WHITE, prog(t, 13.2, 13.6), a=0.6, track=0.08)


SCENES = [(0, 1.5, s1_intro), (1.5, 3.5, s2_name), (3.5, 6.0, s3_words), (6.0, 9.5, s4_phone), (9.5, 12.0, s5_services), (12.0, 15.01, s6_end)]


def render_video(path):
    buf = np.zeros((H, W, 4), np.uint8)
    surface = skia.Surface(buf, colorType=skia.kRGBA_8888_ColorType)
    c = surface.getCanvas()
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", path],
        stdin=subprocess.PIPE)
    n = int(DUR * FPS)
    for i in range(n):
        t = i / FPS
        for a, b, fn in SCENES:
            if a <= t < b:
                c.save()
                fn(c, t)
                c.restore()
                break
        ff.stdin.write(buf.tobytes())
        if i % 60 == 0:
            print(f"  {t:4.1f}s")
    ff.stdin.close()
    ff.wait()


# ------------------------------------------------------------------ soundtrack


def build_audio(path):
    SR = sr.SR
    L = int(DUR * SR) + SR
    drums, music, fx, send = (np.zeros((2, L)) for _ in range(4))
    drop, end = 1.5, 12.0
    K, CL, HC, HO = sr.kick(), sr.clap(), sr.hat(0.012), sr.hat(0.05)

    # pad: Am under the intro, progression with the beat, a long Am under the end card
    sr.add_lr(music, sr.pad_chord(sr.CHORDS[0], 1.9), 0.0, 0.7, send, 0.3)
    t = drop
    while t < end - 1e-6:
        ci = int(round((t - drop) / 2.0)) % 4
        sr.add_lr(music, sr.pad_chord(sr.CHORDS[ci], 2.4), t, 1.0, send, 0.25)
        t += 2.0
    sr.add_lr(music, sr.pad_chord(sr.CHORDS[0], DUR - end + 0.3), end, 1.3, send, 0.7)

    kicks = []
    s16 = 0.125
    n16 = int(round((end - drop) / s16))
    for j in range(n16):
        t = drop + j * s16
        pos, ci = j % 16, (j // 16) % 4
        if j % 4 == 0:
            sr.add(drums, K, t, 1.0)
            kicks.append(t)
        if pos in (4, 12):
            sr.add(drums, CL, t, 0.8, -0.05, send, 0.35)
        if j >= n16 - 8:  # clap roll into the end card
            sr.add(drums, CL, t, 0.3 + 0.06 * (j - (n16 - 8)), 0.1, send, 0.3)
        sr.add(drums, HO if j % 4 == 2 else HC, t, 0.3 if j % 4 == 2 else (0.42, 0.2, 0, 0.24)[j % 4], 0.3)
        if j % 2 == 0:
            sr.add(music, sr.bass_note(sr.BASS[ci] + (12 if pos == 14 else 0)), t, 1.05)
        tones = sr.CHORDS[ci] + [sr.CHORDS[ci][0] + 12]
        note = tones[sr.ARP[j % 8]] + 12
        sr.add(music, sr.pluck(note), t, 0.8, 0.25 if j % 2 else -0.25, send, 0.3)
        for k in (1, 2):
            sr.add(music, sr.pluck(note), t + k * 0.375, 0.8 * 0.36 ** k, 0.7 if k % 2 else -0.7)
    # end card: soft hats + plucks, no kick
    for j in range(int((DUR - end) / s16)):
        t = end + j * s16
        if j % 2 == 0:
            sr.add(drums, HC, t, 0.15, 0.3)
        if j % 4 == 0 and t < DUR - 0.8:
            sr.add(music, sr.pluck([69, 72, 76, 81][(j // 4) % 4]), t, 0.45, 0.2, send, 0.6)

    # picture-synced sound design
    sr.add(fx, sr.pop(), 0.02, 0.9, 0, send, 0.4)
    sr.add(fx, sr.thud(), 0.0, 0.5)
    sr.add_lr(fx, sr.passby(0.36, -0.7, 0.7), 0.3, 0.5)
    sr.add(fx, sr.tick(2600), 0.66, 0.5, 0, send, 0.3)
    sr.add(fx, sr.riser(1.5), 0.0, 0.9, 0, send, 0.3)
    sr.add(fx, sr.swell(0.6), 0.9, 0.7)
    sr.add(fx, sr.crash(2.0), drop, 0.9, 0, send, 0.6)
    sr.add(fx, sr.sub_drop(1.4), drop, 0.9)
    for i in range(7):  # CLAUDIO letters
        sr.add(fx, sr.tick(2200 + 120 * i), 1.55 + i * 0.045, 0.22, (i - 3) / 6, send, 0.2)
    for i in range(3):  # chips
        sr.add(fx, sr.pop(), 2.6 + i * 0.14, 0.55, -0.4 + i * 0.4, send, 0.3)
    sr.add(fx, sr.swell(0.5), 3.0, 0.6)
    sr.add_lr(fx, sr.passby(0.4, 0, 0), 3.2, 0.6, send, 0.2)
    sr.add(fx, sr.thud(), 3.5, 0.6)
    for s in SWAP[1:]:  # word swaps
        sr.add(fx, sr.glitch(0.1), s - 0.04, 0.5, 0.2)
        sr.add(fx, sr.tick(3000), s, 0.4, -0.2, send, 0.3)
    sr.add(fx, sr.thud(), 5.3, 0.6)
    sr.add_lr(fx, sr.passby(0.32, -0.8, 0.8), 5.55, 0.4)
    sr.add_lr(fx, sr.passby(0.4, 0, 0), 5.75, 0.6, send, 0.2)
    sr.add(fx, sr.crash(1.4), 6.0, 0.45, 0, send, 0.5)
    for s in PHONE_SWITCH[1:]:
        sr.add_lr(fx, sr.passby(0.32, 0.3, -0.3), s - 0.05, 0.4)
        sr.add(fx, sr.pop(), s + 0.25, 0.35, 0.3, send, 0.3)
    for i in range(13):  # counter
        sr.add(fx, sr.tick(1800 + 90 * i), 8.65 + 0.55 * (1 - 2 ** (-10 * (i / 13))) , 0.2, 0.4, send, 0.2)
    for i in range(3):
        sr.add_lr(fx, sr.passby(0.35, 0.9, 0.2), 8.6 + i * 0.1, 0.25)
    sr.add(fx, sr.riser(0.6), 8.9, 0.6)
    sr.add(fx, sr.crash(1.6), 9.5, 0.6, 0, send, 0.5)
    for s in SLAM:  # services slam
        sr.add(fx, sr.thud(), s, 0.9, 0, send, 0.3)
        sr.add(fx, sr.clap(), s, 0.25, 0, send, 0.4)
    sr.add(fx, sr.pop(), 11.4, 0.5, 0, send, 0.4)
    a, b = int((end - 0.5) * SR), int(end * SR)  # stutter into the end card
    gate = ((np.arange(b - a) // int(0.0625 * SR)) % 2 == 0).astype(float)
    music[:, a:b] *= gate
    drums[:, a:b] *= gate
    sr.add(fx, sr.swell(0.9), end - 0.9, 0.9, 0, send, 0.3)
    sr.add(fx, sr.crash(3.0), end, 1.0, 0, send, 0.8)
    sr.add(fx, sr.sub_drop(2.2), end, 1.0)
    sr.add(fx, K, end, 1.0)
    for i in range(2):
        sr.add(fx, sr.pop(), 12.65 + i * 0.18, 0.6, -0.3 + i * 0.6, send, 0.5)
    sr.add(fx, sr.tick(2400), 12.2, 0.3, 0, send, 0.4)

    sc = np.ones(L)
    tt = np.arange(int(0.45 * SR)) / SR
    dip = 1 - 0.72 * np.exp(-tt / 0.11)
    for k in kicks:
        i = int(k * SR)
        seg = dip[: L - i]
        sc[i : i + len(seg)] = np.minimum(sc[i : i + len(seg)], seg)
    music *= sc
    wet = sr.reverb(send, 2.2)
    mix = drums * 0.85 + music + fx * 0.9 + wet * 0.3
    track = np.vstack([sr.fft_filter(mix[0], lo=28), sr.fft_filter(mix[1], lo=28)])
    fade = int(0.7 * SR)
    total = int(DUR * SR)
    track[:, total - fade : total] *= np.linspace(1, 0, fade)
    track = track[:, :total]
    track = np.tanh(track / (np.max(np.abs(track)) + 1e-9) * 1.6) * 0.9
    import wave

    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((track.T * 32767).astype(np.int16).tobytes())


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = os.path.join(ROOT, ".capture", "promo")
    os.makedirs(tmp, exist_ok=True)
    video = os.path.join(tmp, "video.mp4")
    audio = os.path.join(tmp, "audio.wav")
    if "--frames" in sys.argv:  # preview stills: --frames 0.5,2.4,…  → .capture/promo/sheet.jpg
        times = [float(x) for x in sys.argv[sys.argv.index("--frames") + 1].split(",")]
        buf = np.zeros((H, W, 4), np.uint8)
        c = skia.Surface(buf, colorType=skia.kRGBA_8888_ColorType).getCanvas()
        tiles = []
        for t in times:
            for a, b, fn in SCENES:
                if a <= t < b:
                    c.save()
                    fn(c, t)
                    c.restore()
            tiles.append(buf[::3, ::3, :3].copy())
        cols = min(6, len(tiles))
        rows = (len(tiles) + cols - 1) // cols
        th, tw = tiles[0].shape[:2]
        sheet = np.full((rows * (th + 8), cols * (tw + 8), 3), 60, np.uint8)
        for i, tile in enumerate(tiles):
            r, q = divmod(i, cols)
            sheet[r * (th + 8) : r * (th + 8) + th, q * (tw + 8) : q * (tw + 8) + tw] = tile
        raw = os.path.join(tmp, "sheet.rgb")
        sheet.tofile(raw)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{sheet.shape[1]}x{sheet.shape[0]}", "-i", raw, os.path.join(tmp, "sheet.jpg")], check=True)
        print("sheet:", os.path.join(tmp, "sheet.jpg"))
        return
    if "--audio-only" not in sys.argv:
        print("rendering video…")
        render_video(video)
    print("building soundtrack…")
    build_audio(audio)
    out = os.path.join(OUT_DIR, "claudio-taras-promo-it-9x16.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", out], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "13.8", "-i", out, "-frames:v", "1", "-q:v", "3",
                    os.path.join(OUT_DIR, "claudio-taras-promo-it-poster.jpg")], check=True)
    print("done:", out, round(os.path.getsize(out) / 1e6, 1), "MB")


if __name__ == "__main__":
    main()
