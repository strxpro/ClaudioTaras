"""
30-second cinematic promo (Italian, 16:9, 1920x1080, 60 fps) — a hypnotic particle film.
~7,000 glowing particles flow from one form into the next, spiralling as they morph:
a point of light → a galaxy → "Ogni progetto inizia da un'idea." → the name → a website
wireframe → real projects (the particles take the image's colours, then the footage sharpens out
of the mosaic) → orbits with numbers → the contact → back into the point (seamless loop).
Music: cinematic, hypnotic electronica — pulsing arpeggio, warm pads, a soft drop; no sound effects.

  .capture/pyenv/Scripts/python.exe scripts/promo_cinema.py            (renders in parallel chunks)
  … --frames 3,6.5,…   preview sheet · --audio-only
Output: promo/claudio-taras-promo-it-cinema-16x9.mp4
"""
import math
import os
import subprocess
import sys
import wave

import numpy as np
import skia
from PIL import Image, ImageChops, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import showreel as sr  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA = os.path.join(ROOT, "public", "media", "projects")
OUT_DIR = os.path.join(ROOT, "promo")
TMP = os.path.join(ROOT, ".capture", "promo")
W, H, FPS, DUR = 1920, 1080, 60, 30.0
HW, HH = W // 2, H // 2
CX, CY = W / 2, H / 2
N = 7000
rng = np.random.default_rng(11)

GOLD = np.array([1.0, 0.77, 0.24], np.float32)
WARM = np.array([1.0, 0.93, 0.80], np.float32)
INK, WHITE, GREY = (8, 8, 11), (246, 244, 239), (150, 150, 158)
GOLD8 = (255, 197, 61)
EMAIL, PHONE = "claudiotaras3@gmail.com", "+39 345 451 0973"

FONTS = "C:/Windows/Fonts"
F_HEAVY = skia.Typeface.MakeFromFile(f"{FONTS}/seguibl.ttf")
F_BOLD = skia.Typeface.MakeFromFile(f"{FONTS}/segoeuib.ttf")
F_SEMI = skia.Typeface.MakeFromFile(f"{FONTS}/seguisb.ttf")
F_LIGHT = skia.Typeface.MakeFromFile(f"{FONTS}/segoeuil.ttf")

# per-particle randomness
PHASE = rng.uniform(0, 2 * np.pi, N).astype(np.float32)
DELAY = rng.uniform(0, 1, N).astype(np.float32)
TINT = rng.uniform(0, 1, N).astype(np.float32)
U1 = rng.uniform(0, 1, N).astype(np.float32)
U2 = rng.uniform(0, 1, N).astype(np.float32)
BASE_COL = (GOLD[None, :] * (1 - TINT[:, None] * 0.6) + WARM[None, :] * (TINT[:, None] * 0.6)).astype(np.float32)

# ------------------------------------------------------------------ helpers


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def prog(t, a, b):
    return clamp((t - a) / (b - a)) if b > a else float(t >= a)


def smooth(p):  # smootherstep
    return p * p * p * (p * (p * 6 - 15) + 10)


def ease(p):  # cinematic ease-in-out (sine)
    return 0.5 - 0.5 * math.cos(math.pi * clamp(p))


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


def fade_text(c, s, x, y, face, size, rgb, a, align="center", track=0.0, rise=0.0):
    """Soft cinematic text: fades in while drifting up a few pixels."""
    if a <= 0.004:
        return
    text(c, s, x, y + (1 - a) * rise, face, size, rgb, a, align, track)


# ------------------------------------------------------------------ particle targets


def sample_mask(alpha, n, x0=0, y0=0):
    ys, xs = np.nonzero(alpha > 110)
    idx = rng.integers(0, len(xs), n)
    return np.stack([xs[idx] + x0 + rng.uniform(0, 1, n), ys[idx] + y0 + rng.uniform(0, 1, n)], 1).astype(np.float32)


def text_targets(lines, n=N):
    """lines: [(text, size, y_baseline)] centred → particle positions on the glyphs."""
    buf = np.zeros((H, W, 4), np.uint8)
    c = skia.Surface(buf, colorType=skia.kRGBA_8888_ColorType).getCanvas()
    for s, size, y in lines:
        text(c, s, CX, y, F_HEAVY, size, (255, 255, 255), 1.0, track=-0.02)
    return sample_mask(buf[..., 3], n)


SCREEN = (CX - 580, CY - 300, 1160, 652)  # x, y, w, h of the browser's screen
FRAME = (SCREEN[0], SCREEN[1] - 46, SCREEN[2], SCREEN[3] + 46)


def wire_targets(n=N):
    """A website wireframe: browser frame, nav, hero, three cards — drawn as glowing lines."""
    x, y, w, h = FRAME
    segs = []

    def rect(rx, ry, rw, rh):
        segs.extend([((rx, ry), (rx + rw, ry)), ((rx + rw, ry), (rx + rw, ry + rh)), ((rx + rw, ry + rh), (rx, ry + rh)), ((rx, ry + rh), (rx, ry))])

    rect(x, y, w, h)
    segs.append(((x, y + 46), (x + w, y + 46)))
    sx, sy, sw, sh = SCREEN
    segs.append(((sx + 40, sy + 40), (sx + 160, sy + 40)))
    for k in range(4):
        segs.append(((sx + sw - 420 + k * 100, sy + 40), (sx + sw - 350 + k * 100, sy + 40)))
    rect(sx + 40, sy + 90, sw - 80, 250)
    segs.append(((sx + 90, sy + 170), (sx + 600, sy + 170)))
    segs.append(((sx + 90, sy + 215), (sx + 470, sy + 215)))
    rect(sx + 90, sy + 260, 180, 46)
    cw = (sw - 80 - 40) / 3
    for k in range(3):
        rect(sx + 40 + k * (cw + 20), sy + 370, cw, 230)
    lens = np.array([math.dist(a, b) for a, b in segs])
    pick = rng.choice(len(segs), n, p=lens / lens.sum())
    u = rng.uniform(0, 1, n)
    pts = np.array([[lerp(segs[i][0][0], segs[i][1][0], u[k]), lerp(segs[i][0][1], segs[i][1][1], u[k])] for k, i in enumerate(pick)], np.float32)
    return pts + rng.normal(0, 0.8, (n, 2)).astype(np.float32)


def lerp(a, b, p):
    return a + (b - a) * p


def image_targets(img_rgb):
    """Particles spread over the screen, each taking the colour of the image under it."""
    sx, sy, sw, sh = SCREEN
    nx = int(math.sqrt(N * sw / sh))
    ny = N // nx
    gx = ((np.arange(nx * ny) % nx) + 0.5 + rng.uniform(-0.3, 0.3, nx * ny)) * sw / nx
    gy = ((np.arange(nx * ny) // nx) + 0.5 + rng.uniform(-0.3, 0.3, nx * ny)) * sh / ny
    extra = N - nx * ny
    gx = np.concatenate([gx, rng.uniform(0, sw, extra)])
    gy = np.concatenate([gy, rng.uniform(0, sh, extra)])
    order = rng.permutation(N)  # so neighbours on screen come from all over the swarm
    gx, gy = gx[order], gy[order]
    small = np.asarray(img_rgb.resize((int(sw), int(sh)), Image.BILINEAR), np.float32) / 255
    cols = small[np.clip(gy.astype(int), 0, int(sh) - 1), np.clip(gx.astype(int), 0, int(sw) - 1)]
    return np.stack([gx + sx, gy + sy], 1).astype(np.float32), cols.astype(np.float32)


def point_state(t):
    r = rng_point_r * (1 + 0.25 * math.sin(t * 3.0))
    return np.stack([CX + r * np.cos(PHASE + t * 2.0), CY + r * np.sin(PHASE * 1.3 + t * 1.6)], 1).astype(np.float32)


rng_point_r = (rng.gamma(1.4, 3.0, N)).astype(np.float32)


def galaxy_state(t):
    r = 560 * np.sqrt(U1) + 6
    arm = (np.floor(U2 * 3) * 2 * np.pi / 3).astype(np.float32)
    a = arm + r / 150 + (U2 * 3 % 1 - 0.5) * 0.9 + t * (0.9 * 90 / (r + 70))
    return np.stack([CX + r * np.cos(a), CY + r * np.sin(a) * 0.52], 1).astype(np.float32)


RING_R = np.array([250, 350, 450], np.float32)


def rings_state(t):
    k = (np.arange(N) % 3)
    r = RING_R[k] + rng_ring_jit
    sp = np.array([0.35, -0.24, 0.17], np.float32)[k]
    a = PHASE + t * sp
    return np.stack([CX + r * np.cos(a), CY + r * np.sin(a) * 0.38], 1).astype(np.float32)


rng_ring_jit = rng.normal(0, 7, N).astype(np.float32)

# ------------------------------------------------------------------ media (lazy: each render chunk loads only what it shows)

PROJECTS = [("Villa Dea", "Sito web · Aglientu, Sardegna", "villa-dea", 5.0), ("Gelateria Onda", "Web app · Santa Teresa Gallura", "onda", 9.0), ("L'Isola del Gioiello", "E-commerce · Santa Teresa Gallura", "isola-del-gioiello", 8.0)]
_stills, _clips = {}, {}


def ffmpeg_rgb(args, w, h):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", *args, "-vf", f"fps=30,scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True, check=True).stdout
    n = len(raw) // (w * h * 3)
    return np.frombuffer(raw, np.uint8)[: n * w * h * 3].reshape(n, h, w, 3)


def still(k):
    if k not in _stills:
        _, _, slug, st = PROJECTS[k]
        _stills[k] = Image.fromarray(ffmpeg_rgb(["-ss", str(st), "-i", os.path.join(MEDIA, slug, "desktop.mp4"), "-frames:v", "1"], int(SCREEN[2]), int(SCREEN[3]))[0])
    return _stills[k]


def clip(k):
    if k not in _clips:
        _, _, slug, st = PROJECTS[k]
        _clips[k] = ffmpeg_rgb(["-ss", str(st), "-t", "4.6", "-i", os.path.join(MEDIA, slug, "desktop.mp4")], int(SCREEN[2]), int(SCREEN[3]))
    return _clips[k]


_targets = {}


def T(key):
    """Static targets, built once per process."""
    if key not in _targets:
        if key == "idea":
            _targets[key] = (text_targets([("Ogni progetto", 150, 470), ("inizia da un'idea.", 150, 640)]), None)
        elif key == "name":
            _targets[key] = (text_targets([("Claudio Taras", 210, 590)]), None)
        elif key == "wire":
            _targets[key] = (wire_targets(), None)
        elif key == "contact":
            _targets[key] = (text_targets([("Parliamo del", 128, 330), ("tuo progetto.", 128, 470)]), None)
        elif key.startswith("img"):
            _targets[key] = image_targets(still(int(key[3])))
    return _targets[key]


# state = function of t → (positions, colours or None, particle gain)
STATES = {
    "point": lambda t: (point_state(t), None, 1.0, 0.0),
    "galaxy": lambda t: (galaxy_state(t), None, 1.0, 0.0),
    "idea": lambda t: (*T("idea"), 1.0, 0.0),
    "name": lambda t: (*T("name"), 1.0, 0.0),
    "wire": lambda t: (*T("wire"), 0.9, 0.0),
    "img0": lambda t: (*T("img0"), 0.35, 1.0),
    "img1": lambda t: (*T("img1"), 0.35, 1.0),
    "img2": lambda t: (*T("img2"), 0.35, 1.0),
    "rings": lambda t: (rings_state(t), None, 0.85, 0.0),
    "contact": lambda t: (*T("contact"), 1.0, 0.0),
}

# timeline: (start, end, from, to); between transitions the 'to' state holds
TIMELINE = [
    (1.1, 3.0, "point", "galaxy"),
    (4.0, 5.7, "galaxy", "idea"),
    (6.9, 8.5, "idea", "name"),
    (9.7, 11.1, "name", "wire"),
    (11.7, 13.1, "wire", "img0"),
    (15.0, 16.5, "img0", "img1"),
    (18.0, 19.5, "img1", "img2"),
    (20.7, 22.2, "img2", "rings"),
    (23.4, 24.9, "rings", "contact"),
    (28.5, 30.0, "contact", "point"),
]


def particles(t):
    """Positions, colours and intensity of every particle at time t."""
    cur = "point"
    for t0, t1, a, b in TIMELINE:
        if t < t0:
            break
        if t <= t1:
            pa, ca, ga, ma = STATES[a](t)
            pb, cb, gb, mb = STATES[b](t)
            p = (t - t0) / (t1 - t0)
            q = np.clip((p - DELAY * 0.35) / 0.65, 0, 1)
            e = (q * q * q * (q * (q * 6 - 15) + 10))[:, None]
            pos = pa + (pb - pa) * e
            arc = np.sin(np.pi * e[:, 0])
            # spiral while travelling: rotate around the centre, breathe outwards, drift on a soft noise
            ang = arc * (1.1 + 0.6 * U1)
            dx, dy = pos[:, 0] - CX, pos[:, 1] - CY
            ca_, sa_ = np.cos(ang), np.sin(ang)
            pos = np.stack([CX + (dx * ca_ - dy * sa_) * (1 + 0.12 * arc), CY + (dx * sa_ + dy * ca_) * (1 + 0.12 * arc)], 1)
            pos[:, 0] += arc * 46 * np.cos(PHASE + t * 1.7)
            pos[:, 1] += arc * 46 * np.sin(PHASE * 1.3 + t * 1.3)
            cA = BASE_COL if ca is None else ca
            cB = BASE_COL if cb is None else cb
            col = cA + (cB - cA) * e
            gain = (ga + (gb - ga) * e[:, 0]) * (1 + 0.5 * arc)
            m = (ma + (mb - ma) * e[:, 0]).astype(np.float32)
            return pos.astype(np.float32), col, gain, m
        cur = b
    pos, col, g, m = STATES[cur](t)
    shimmer = np.stack([np.sin(t * 2.1 + PHASE), np.cos(t * 1.7 + PHASE * 1.7)], 1) * 0.9
    return (pos + shimmer).astype(np.float32), (BASE_COL if col is None else col), np.full(N, g, np.float32) * (0.8 + 0.2 * np.sin(t * 3 + PHASE)), np.full(N, m, np.float32)


def box_blur(a, r):
    for ax in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[ax] = (r + 1, r)
        cs = np.cumsum(np.pad(a, pad, mode="edge"), axis=ax)
        a = (np.take(cs, range(2 * r + 1, cs.shape[ax]), axis=ax) - np.take(cs, range(0, cs.shape[ax] - 2 * r - 1), axis=ax)) / (2 * r + 1)
    return a


def particle_layers(t, fade=1.0):
    """Half-res core (bilinear splats) + quarter-res bloom, both as full-size RGB PIL images."""
    pos, col, gain, m = particles(t)
    # slow, hypnotic camera drift on the whole swarm
    ang = 0.025 * math.sin(t * 0.21)
    sc = 1 + 0.02 * math.sin(t * 0.33)
    dx, dy = pos[:, 0] - CX, pos[:, 1] - CY
    x = (CX + (dx * math.cos(ang) - dy * math.sin(ang)) * sc) / 2
    y = (CY + (dx * math.sin(ang) + dy * math.cos(ang)) * sc) / 2
    ix, iy = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    ok = (ix >= 0) & (iy >= 0) & (ix < HW - 1) & (iy < HH - 1)
    ix, iy, fx, fy = ix[ok], iy[ok], (x - np.floor(x))[ok], (y - np.floor(y))[ok]
    # sparkle: full for the gold swarm, faint when the particles are building an image
    w0 = (col[ok] * (gain[ok] * fade * (1 - 0.88 * m[ok]))[:, None] * 0.55).astype(np.float32)
    idx = np.concatenate([iy * HW + ix, iy * HW + ix + 1, (iy + 1) * HW + ix, (iy + 1) * HW + ix + 1])
    wts = np.concatenate([(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy])
    acc = np.empty((HH * HW, 3), np.float32)
    for ch in range(3):
        acc[:, ch] = np.bincount(idx, weights=np.tile(w0[:, ch], 4) * wts, minlength=HH * HW)
    acc = acc.reshape(HH, HW, 3)
    core = 1 - np.exp(-acc * 1.7)
    small = acc.reshape(HH // 4, 4, HW // 4, 4, 3).sum(axis=(1, 3))
    glow = 1 - np.exp(-box_blur(box_blur(box_blur(small, 3), 3), 3) * 0.22)  # 3 box passes ≈ round gaussian
    core_im = Image.fromarray((core * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)
    glow_im = Image.fromarray((np.clip(glow, 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)
    mosaic = None
    if m.max() > 0.01:
        # big soft colour dots at quarter resolution: a weighted average gives the image's true colours
        QW, QH = W // 4, H // 4
        qx, qy = x[ok] / 2, y[ok] / 2
        jx, jy = np.floor(qx).astype(np.int64), np.floor(qy).astype(np.int64)
        good = (jx >= 0) & (jy >= 0) & (jx < QW - 1) & (jy < QH - 1)
        jx, jy, gx_, gy_ = jx[good], jy[good], (qx - np.floor(qx))[good], (qy - np.floor(qy))[good]
        mw = (m[ok][good] * fade).astype(np.float32)
        cc = col[ok][good]
        qi = np.concatenate([jy * QW + jx, jy * QW + jx + 1, (jy + 1) * QW + jx, (jy + 1) * QW + jx + 1])
        qw = np.concatenate([(1 - gx_) * (1 - gy_), gx_ * (1 - gy_), (1 - gx_) * gy_, gx_ * gy_]) * np.tile(mw, 4)
        wsum = np.bincount(qi, weights=qw, minlength=QH * QW).reshape(QH, QW)
        csum = np.stack([np.bincount(qi, weights=qw * np.tile(cc[:, ch], 4), minlength=QH * QW).reshape(QH, QW) for ch in range(3)], 2)
        wsum_b = box_blur(box_blur(wsum[..., None], 2), 1)[..., 0]
        csum_b = box_blur(box_blur(csum, 2), 1)
        rgb = csum_b / np.maximum(wsum_b, 1e-6)[..., None]
        alpha = np.clip(wsum_b * 2.6, 0, 1) ** 0.8
        mosaic = (Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR),
                  Image.fromarray((alpha * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR))
    return core_im, glow_im, mosaic


# ------------------------------------------------------------------ frame


def background(c, t):
    c.clear(argb(INK))
    g = skia.Paint()
    pulse = 0.5 + 0.5 * math.sin(t * 0.8)
    g.setShader(skia.GradientShader.MakeRadial(skia.Point(CX, CY), 1100, [argb((40, 30, 12), 0.55 + 0.1 * pulse), argb(INK, 0.0)], [0, 1]))
    c.drawRect(skia.Rect.MakeWH(W, H), g)


SCREEN_MASK = None


def screen_mask():
    global SCREEN_MASK
    if SCREEN_MASK is None:
        m = Image.new("L", (int(SCREEN[2]), int(SCREEN[3])), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, int(SCREEN[2]) - 1, int(SCREEN[3]) - 1], radius=10, fill=255)
        SCREEN_MASK = m
    return SCREEN_MASK


# when each project's sharp footage is on screen: (fade in start, fade in end, fade out start, fade out end)
SHARP = [(12.7, 13.5, 14.9, 15.25), (16.1, 16.9, 17.9, 18.25), (19.1, 19.9, 20.6, 20.95)]


def project_alpha(t):
    for k, (a0, a1, b0, b1) in enumerate(SHARP):
        if a0 <= t <= b1:
            return k, ease(prog(t, a0, a1)) * (1 - ease(prog(t, b0, b1)))
    return None, 0.0


def draw_frame(buf, c, t):
    background(c, t)
    k, pa = project_alpha(t)
    chrome = max(prog(t, 11.9, 12.9) * (1 - prog(t, 20.6, 21.2)), 0)
    if chrome > 0:  # browser chrome around the screen while projects are on
        x, y, w, h = FRAME
        rr = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(x, y, w, h), 14, 14)
        sp = paint((0, 0, 0), 0.5 * chrome)
        sp.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 30))
        c.drawRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(x + 30, y + 40, w - 60, h), 14, 14), sp)
        c.drawRRect(rr, paint((24, 24, 27), chrome))
        for i, colr in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
            c.drawCircle(x + 28 + i * 24, y + 23, 7, paint(colr, chrome))
    base = Image.fromarray(np.ascontiguousarray(buf[..., :3]))
    if k is not None and pa > 0:
        frames = clip(k)
        fr = frames[min(len(frames) - 1, int(max(0, t - SHARP[k][0]) * 30))]
        im = Image.fromarray(fr)
        mask = screen_mask() if pa >= 0.999 else screen_mask().point(lambda v, a=pa: int(v * a))
        base.paste(im, (int(SCREEN[0]), int(SCREEN[1])), mask)
    # particles fade while the sharp image holds, and come back to break it apart
    fade = 1 - 0.85 * pa
    core, glow, mosaic = particle_layers(t, fade)
    if mosaic is not None:
        base = Image.composite(mosaic[0], base, mosaic[1])
    base = ImageChops.add(ImageChops.add(base, core), glow)
    buf[..., :3] = np.asarray(base)
    overlays(c, t, k, pa)
    vignette(c)


def vignette(c):
    v = skia.Paint()
    v.setShader(skia.GradientShader.MakeRadial(skia.Point(CX, CY), W * 0.7, [argb((0, 0, 0), 0), argb((0, 0, 0), 0), argb((0, 0, 0), 0.5)], [0, 0.6, 1]))
    c.drawRect(skia.Rect.MakeWH(W, H), v)


NUMBERS = [("13+", "progetti online", 21.6), ("7", "anni di esperienza", 22.3), ("6", "lingue", 23.0)]


def overlays(c, t, k, pa):
    """Sharp type that settles over the particles (they keep glowing underneath)."""
    a = ease(prog(t, 5.4, 6.0)) * (1 - ease(prog(t, 6.8, 7.1)))
    fade_text(c, "Ogni progetto", CX, 470, F_HEAVY, 150, WHITE, a * 0.9, track=-0.02)
    fade_text(c, "inizia da un'idea.", CX, 640, F_HEAVY, 150, GOLD8, a * 0.9, track=-0.02)
    a = ease(prog(t, 8.3, 8.9)) * (1 - ease(prog(t, 9.6, 9.9)))
    fade_text(c, "Claudio Taras", CX, 590, F_HEAVY, 210, WHITE, a * 0.92, track=-0.02)
    fade_text(c, "Web designer & developer", CX, 690, F_LIGHT, 54, WHITE, ease(prog(t, 8.6, 9.2)) * (1 - ease(prog(t, 9.6, 9.9))), rise=14)
    a = ease(prog(t, 10.6, 11.1)) * (1 - ease(prog(t, 11.6, 11.9)))
    fade_text(c, "DAL DESIGN AL CODICE", CX, FRAME[1] + FRAME[3] + 80, F_SEMI, 30, WHITE, a * 0.8, track=0.3)
    if k is not None and pa > 0:
        name, meta, *_ = PROJECTS[k]
        x = SCREEN[0]
        y = FRAME[1] + FRAME[3] + 70
        fade_text(c, name, x, y, F_HEAVY, 52, WHITE, pa, align="left", track=-0.01, rise=12)
        fade_text(c, meta, x + SCREEN[2], y, F_LIGHT, 30, WHITE, pa * 0.8, align="right", rise=12)
        fade_text(c, f"0{k + 1} / 03", x, FRAME[1] - 30, F_SEMI, 24, GOLD8, pa * 0.9, align="left", track=0.25)
    for i, (num, label, at) in enumerate(NUMBERS):
        nxt = NUMBERS[i + 1][2] if i + 1 < len(NUMBERS) else 23.9
        a = ease(prog(t, at, at + 0.32)) * (1 - ease(prog(t, nxt - 0.24, nxt)))  # one after the other, never overlapping
        if a > 0:
            s = 1 + (1 - a) * 0.08
            c.save()
            c.translate(CX, CY)
            c.scale(s, s)
            c.translate(-CX, -CY)
            fade_text(c, num, CX, CY + 60, F_HEAVY, 220, WHITE, a, track=-0.03)
            fade_text(c, label, CX, CY + 130, F_LIGHT, 44, WHITE, a * 0.85)
            c.restore()
    a = ease(prog(t, 24.6, 25.3)) * (1 - ease(prog(t, 28.3, 28.8)))
    fade_text(c, "Parliamo del", CX, 330, F_HEAVY, 128, WHITE, a * 0.92, track=-0.02)
    fade_text(c, "tuo progetto.", CX, 470, F_HEAVY, 128, GOLD8, a * 0.92, track=-0.02)
    for i, (label, kind) in enumerate([(EMAIL, "mail"), (PHONE, "phone")]):
        b = ease(prog(t, 25.1 + i * 0.25, 25.8 + i * 0.25)) * (1 - ease(prog(t, 28.3, 28.8)))
        if b <= 0:
            continue
        y = 640 + i * 96
        w = width(label, F_SEMI, 50) + 80
        x0 = CX - w / 2
        fade_text(c, label, x0 + 80, y, F_SEMI, 50, WHITE, b, align="left", rise=10)
        ic = paint(GOLD8, b, stroke=3.4)
        iy = y + (1 - b) * 10
        if kind == "mail":
            c.drawRoundRect(skia.Rect.MakeXYWH(x0, iy - 38, 52, 38), 7, 7, ic)
            pth = skia.Path()
            pth.moveTo(x0 + 4, iy - 34)
            pth.lineTo(x0 + 26, iy - 16)
            pth.lineTo(x0 + 48, iy - 34)
            c.drawPath(pth, ic)
        else:
            c.drawRoundRect(skia.Rect.MakeXYWH(x0 + 12, iy - 48, 30, 52), 7, 7, ic)
            c.drawLine(x0 + 22, iy - 6, x0 + 32, iy - 6, ic)
    b = ease(prog(t, 25.8, 26.5)) * (1 - ease(prog(t, 28.3, 28.8)))
    fade_text(c, "Claudio Taras  ·  Web designer & developer", CX, 930, F_LIGHT, 30, GREY, b, track=0.02)


# ------------------------------------------------------------------ rendering (parallel chunks)


def render_chunk(i, n, path):
    buf = np.zeros((H, W, 4), np.uint8)
    buf[..., 3] = 255
    c = skia.Surface(buf, colorType=skia.kRGBA_8888_ColorType).getCanvas()
    total = int(round(DUR * FPS))
    a, b = total * i // n, total * (i + 1) // n
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-g", "60", path], stdin=subprocess.PIPE)
    for f in range(a, b):
        draw_frame(buf, c, f / FPS)
        ff.stdin.write(buf.tobytes())
        if (f - a) % 120 == 0:
            print(f"  chunk {i}: {f / FPS:5.1f}s", flush=True)
    ff.stdin.close()
    ff.wait()


# ------------------------------------------------------------------ music: cinematic, hypnotic (96 BPM, 12 bars = 30 s)

SR = sr.SR
BPM = 96
B = 60 / BPM
BAR = 4 * B
CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 60], [55, 59, 62, 66]]  # Am7 Fmaj7 C(add) G(maj7-ish)
ROOTS = [33, 29, 36, 31]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def sub(m, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = (1 - np.exp(-t / 0.01)) * np.exp(-t / 0.35)
    return np.sin(2 * np.pi * hz(m) * t) * env * 0.5


def soft_kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 46 + 80 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.2) * 0.9


def bell(m, dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(m)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 2.01 * t) * np.exp(-t / 0.4)) * np.exp(-t / 0.9) * (1 - np.exp(-t / 0.004)) * 0.12


def build_cycle(off, music, drums, send, kicks, arp_bus):
    s16 = B / 4
    K, CL, SH = soft_kick(), sr.clap(), sr.hat(0.03)
    for bar in range(12):
        t_bar = off + bar * BAR
        ci = bar % 4
        energy = [0.6, 0.65, 0.72, 0.8, 0.9, 1, 1, 1, 1, 0.72, 0.68, 0.62][bar]
        sr.add_lr(music, sr.pad_chord(CHORDS[ci], BAR + 0.6), t_bar, 0.6 + 0.6 * energy, send, 0.45)
        # hypnotic 16th arpeggio (up–down through the chord + octave)
        tones = CHORDS[ci] + [CHORDS[ci][0] + 12]
        pattern = [0, 2, 4, 1, 3, 4, 2, 0]
        for j in range(16):
            note = tones[pattern[j % 8]] + 12
            sr.add(arp_bus, sr.pluck(note), t_bar + j * s16, 0.55 * energy, -0.35 if j % 2 else 0.35, send, 0.4)
            for k in (1, 2):
                sr.add(arp_bus, sr.pluck(note), t_bar + j * s16 + k * B * 0.75, 0.55 * energy * 0.33 ** k, 0.6 if k % 2 else -0.6)
        if bar >= 2 and bar != 11:  # sub pulse
            for q in range(4):
                sr.add(music, sub(ROOTS[ci] + 12, B * 0.9), t_bar + q * B, 0.8 * min(1, energy + 0.2))
        if 5 <= bar <= 8:  # the drop: kick, claps, shaker
            for q in range(4):
                sr.add(drums, K, t_bar + q * B, 0.95)
                kicks.append(t_bar + q * B)
                if q in (1, 3):
                    sr.add(drums, CL, t_bar + q * B, 0.55, 0.0, send, 0.7)
            for j in range(16):
                sr.add(drums, SH, t_bar + j * s16 + (0.02 if j % 2 else 0), 0.22 if j % 2 else 0.32, 0.3)
        if bar >= 9:  # a gentle bell melody under the contact
            mel = {9: [(0, 76), (1.5, 74)], 10: [(0, 72), (1, 74), (2, 76)], 11: [(0, 81)]}.get(bar, [])
            for beat_, m in mel:
                sr.add(music, bell(m), t_bar + beat_ * B, 1.0, 0.15, send, 0.8)


def build_audio(path):
    L = int(2 * DUR * SR) + SR
    music, drums, send, arp = (np.zeros((2, L)) for _ in range(4))
    kicks = []
    for cyc in range(2):
        build_cycle(cyc * DUR, music, drums, send, kicks, arp)
    # the arpeggio opens up over the first five bars (filter sweep by cross-fading a dark copy)
    dark = np.vstack([sr.fft_filter(arp[0], hi=900), sr.fft_filter(arp[1], hi=900)])
    tt = (np.arange(L) / SR) % DUR
    openf = 0.35 + 0.65 * np.clip(tt / (5 * BAR), 0, 1) ** 1.5
    openf = np.where(tt > 9 * BAR, np.clip(1 - (tt - 9 * BAR) / (3 * BAR) * 0.7, 0.3, 1), openf)
    arp = dark * (1 - openf) + arp * openf
    sc = np.ones(L)
    dip_t = np.arange(int(0.45 * SR)) / SR
    dip = 1 - 0.5 * np.exp(-dip_t / 0.12)
    for k in kicks:
        i = int(k * SR)
        seg = dip[: L - i]
        sc[i : i + len(seg)] = np.minimum(sc[i : i + len(seg)], seg)
    music *= sc
    arp *= sc
    wet = sr.reverb(send, 3.2)
    mix_ = music + arp + drums * 0.8 + wet * 0.38
    track = np.vstack([sr.fft_filter(mix_[0], lo=28), sr.fft_filter(mix_[1], lo=28)])
    track = track[:, int(DUR * SR) : int(2 * DUR * SR)]
    track = np.tanh(track / (np.max(np.abs(track)) + 1e-9) * 1.75) * 0.9
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
        render_chunk(i, n, os.path.join(TMP, f"cin_{i:02d}.mp4"))
        return
    if "--frames" in args:
        times = [float(x) for x in args[args.index("--frames") + 1].split(",")]
        buf = np.zeros((H, W, 4), np.uint8)
        buf[..., 3] = 255
        c = skia.Surface(buf, colorType=skia.kRGBA_8888_ColorType).getCanvas()
        tiles = []
        for t in times:
            draw_frame(buf, c, t)
            tiles.append(np.asarray(Image.fromarray(buf[..., :3]).resize((W // 3, H // 3), Image.BILINEAR)))
        cols = min(4, len(tiles))
        rows = (len(tiles) + cols - 1) // cols
        th, tw = tiles[0].shape[:2]
        sheet = np.full((rows * (th + 6), cols * (tw + 6), 3), 70, np.uint8)
        for k, tile in enumerate(tiles):
            r, q = divmod(k, cols)
            sheet[r * (th + 6) : r * (th + 6) + th, q * (tw + 6) : q * (tw + 6) + tw] = tile
        Image.fromarray(sheet).save(os.path.join(TMP, "cinema-sheet.jpg"), quality=88)
        print("sheet:", os.path.join(TMP, "cinema-sheet.jpg"))
        return
    audio = os.path.join(TMP, "cinema.wav")
    if "--audio-only" not in args:
        n = int(os.environ.get("CHUNKS", "6"))
        print(f"rendering in {n} parallel chunks…")
        procs = [subprocess.Popen([sys.executable, os.path.abspath(__file__), "--chunk", f"{i}/{n}"], cwd=ROOT) for i in range(n)]
        if any(p.wait() for p in procs):
            sys.exit("a chunk failed")
        lst = os.path.join(TMP, "cin_list.txt")
        with open(lst, "w") as f:
            f.write("".join(f"file '{os.path.join(TMP, f'cin_{i:02d}.mp4').replace(os.sep, '/')}'\n" for i in range(n)))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", os.path.join(TMP, "cinema.mp4")], check=True)
    print("building soundtrack…")
    build_audio(audio)
    out = os.path.join(OUT_DIR, "claudio-taras-promo-it-cinema-16x9.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(TMP, "cinema.mp4"), "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", out], check=True)
    print("done:", out, round(os.path.getsize(out) / 1e6, 1), "MB")


if __name__ == "__main__":
    main()
