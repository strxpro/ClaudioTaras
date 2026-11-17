"""
Builds the portfolio showreel (~56 s, 1280x720, 30 fps) with motion-graphics title cards and a
synthesised soundtrack (Am-F-C-G track + picture-synced sound design) on a 120 BPM grid.

  .capture/pyenv/Scripts/python.exe scripts/showreel.py

Inputs : .data/db.json (project names/colours) and public/media/projects/<slug>/{desktop,mobile}.mp4
Output : public/media/showreel.mp4 + public/media/showreel-poster.webp
Title-card animation follows the slack-gif-creator approach: frames drawn with PIL + easing curves.
"""
import json
import math
import os
import shutil
import subprocess
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, ".capture", "reel")
OUT = os.path.join(ROOT, "public", "media")
W, H, FPS = 1280, 720, 30
BAR = 2.0  # seconds per bar at 120 BPM
SR = 48000
INK, PAPER, ACID = (10, 10, 10), (244, 244, 242), (255, 210, 63)
F_IMPACT = "C:/Windows/Fonts/impact.ttf"
F_BOLD = "C:/Windows/Fonts/arialbd.ttf"
F_REG = "C:/Windows/Fonts/arial.ttf"
SKIP = {"spabinext"}  # password-gated preview, nothing to show yet
CAT = {"website": "WEBSITE", "ecommerce": "E-COMMERCE", "webapp": "WEB APP", "software": "SOFTWARE", "event": "EVENT"}


def font(path, size):
    return ImageFont.truetype(path, size)


def ease_out(t):  # expo out
    return 1 if t >= 1 else 1 - pow(2, -10 * max(0.0, t))


def ease_in_out(t):
    t = min(1.0, max(0.0, t))
    return 4 * t * t * t if t < 0.5 else 1 - pow(-2 * t + 2, 3) / 2


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def light(rgb):
    r, g, b = [c / 255 for c in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45


def masked_text(frame, text, fnt, x, y, fill, progress, anchor_h=None):
    """Text sliding up from behind a mask (line reveal)."""
    bbox = fnt.getbbox(text)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    box_h = anchor_h or int(th * 1.25)
    layer = Image.new("RGBA", (tw + 20, box_h), (0, 0, 0, 0))
    off = int((1 - ease_out(progress)) * box_h)
    ImageDraw.Draw(layer).text((10 - bbox[0], off + (box_h - th) // 2 - bbox[1]), text, font=fnt, fill=fill)
    frame.paste(layer, (int(x) - 10, int(y)), layer)
    return tw


def fit_font(text, path, max_w, start):
    size = start
    while size > 20:
        f = font(path, size)
        b = f.getbbox(text)
        if b[2] - b[0] <= max_w:
            return f
        size -= 4
    return font(path, size)


def save_seq(frames_fn, n, name):
    d = os.path.join(WORK, name)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    for i in range(n):
        frames_fn(i / FPS).save(os.path.join(d, f"{i:04d}.png"))
    out = os.path.join(WORK, f"{name}.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(d, "%04d.png"),
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", out], check=True)
    shutil.rmtree(d, ignore_errors=True)
    return out


# ------------------------------------------------------------------ cards

def intro_frame(t):
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)
    # yellow bar sweep
    sweep = ease_in_out(t / 0.7)
    d.rectangle([0, H * 0.5 - 4, W * sweep, H * 0.5 + 4], fill=ACID)
    big = font(F_IMPACT, 190)
    masked_text(img, "CLAUDIO", big, 90, 120, PAPER, (t - 0.5) / 0.6, 220)
    masked_text(img, "TARAS", big, 90, 330, ACID, (t - 0.7) / 0.6, 220)
    small = font(F_BOLD, 22)
    if t > 1.4:
        a = min(1, (t - 1.4) / 0.4)
        d.text((W - 90, 160), "SHOWREEL 2026", font=small, fill=tuple(int(c * a) for c in PAPER), anchor="ra")
        d.text((W - 90, 192), "WEB DESIGN · DEVELOPMENT · E-COMMERCE", font=font(F_REG, 16), fill=tuple(int(c * a * 0.7) for c in PAPER), anchor="ra")
    # exit: panels wipe up
    if t > 3.3:
        p = ease_in_out((t - 3.3) / 0.7)
        cols = 6
        for c in range(cols):
            delay = abs(c - (cols - 1) / 2) * 0.08
            pp = ease_in_out(min(1, max(0, (t - 3.3 - delay) / 0.55)))
            x0 = c * W / cols
            d.rectangle([x0, H - H * pp, x0 + W / cols + 1, H], fill=ACID)
    return img


def title_frame(p, idx, total):
    accent = hex_rgb(p["accent"])
    fg = INK if light(accent) else PAPER

    def fn(t):
        img = Image.new("RGB", (W, H), ACID)
        d = ImageDraw.Draw(img)
        # accent panel slides in from the right over the yellow
        reveal = ease_out(t / 0.45)
        d.rectangle([W - W * reveal, 0, W, H], fill=accent)
        name = p["name"].upper()
        f = fit_font(name, F_IMPACT, W - 180, 150)
        masked_text(img, name, f, 90, H * 0.5 - 90, fg, (t - 0.18) / 0.5, 190)
        meta = f"{idx:02d} / {total:02d}   ·   {CAT.get(p['category'], '').upper()}   ·   {p['year']}"
        if t > 0.25:
            d.text((92, 80), meta, font=font(F_BOLD, 20), fill=fg)
        host = (p.get("url") or "local build").replace("https://", "").replace("www.", "").rstrip("/")
        if t > 0.35:
            d.text((92, H - 110), host.upper(), font=font(F_REG, 18), fill=fg)
        # progress ticks
        for k in range(total):
            x = 92 + k * 22
            d.rectangle([x, H - 70, x + 14, H - 64], fill=(fg if k < idx else tuple(int(c * 0.35 + a * 0.65) for c, a in zip(fg, accent))))
        return img

    return fn


def outro_frame(t):
    img = Image.new("RGB", (W, H), ACID)
    d = ImageDraw.Draw(img)
    big = font(F_IMPACT, 210)
    masked_text(img, "LET'S", big, 90, 90, INK, (t - 0.1) / 0.6, 240)
    masked_text(img, "TALK", big, 90, 320, INK, (t - 0.3) / 0.6, 240)
    if t > 0.9:
        d.text((W - 90, H - 140), "claudiotaras3@gmail.com", font=font(F_BOLD, 30), fill=INK, anchor="ra")
        d.text((W - 90, H - 95), "CLAUDIO TARAS — WEB DESIGNER & DEVELOPER", font=font(F_REG, 18), fill=INK, anchor="ra")
    # spinning CT mark
    ct = font(F_IMPACT, 120)
    if t > 0.6:
        layer = Image.new("RGBA", (240, 160), (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((20, 0), "CT", font=ct, fill=INK)
        layer = layer.transform(layer.size, Image.AFFINE, (1, 0.25, -30, 0, 1, 0))
        img.paste(layer, (W - 330, 80), layer)
    if t > 3.4:
        p = ease_in_out((t - 3.4) / 0.6)
        d.rectangle([0, 0, W, H * p], fill=INK)
    return img


# ------------------------------------------------------------------ footage

def footage(p, dur, name):
    slug = p["slug"]
    base = os.path.join(ROOT, "public", "media", "projects", slug)
    desk = os.path.join(base, "desktop.mp4")
    mob = os.path.join(base, "mobile.mp4")
    out = os.path.join(WORK, f"{name}.mp4")
    accent = p["accent"].lstrip("#")
    start = 2.4
    has_mob = os.path.exists(mob)
    # desktop: slow push-in inside a dark stage, rounded later by the phone overlay sliding in
    vf = (
        f"[0:v]trim=start={start}:duration={dur},setpts=PTS-STARTPTS,fps={FPS},"
        f"scale=1060:-2,crop=1060:662,"
        f"zoompan=z='1+0.06*on/({dur}*{FPS})':x='iw/2-(iw/zoom/2)':y='0':d=1:s=1060x662:fps={FPS}[d];"
        f"color=c=0x{accent}:s={W}x{H}:d={dur}:r={FPS}[bg];"
        f"[bg][d]overlay=x=48:y=(H-h)/2:shortest=1[v1]"
    )
    inputs = ["-ss", "0", "-i", desk]
    if has_mob:
        vf += (
            f";[1:v]trim=start={start}:duration={dur},setpts=PTS-STARTPTS,fps={FPS},scale=232:-2,"
            f"pad=iw+12:ih+12:6:6:color=0x0a0a0a[m];"
            f"[v1][m]overlay=x='if(lt(t,0.45),{W}-({W}-950)*(1-pow(2,-10*t/0.45)),950)':y=(H-h)/2+30:shortest=1[v]"
        )
        inputs += ["-i", mob]
    else:
        vf += ";[v1]null[v]"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", vf, "-map", "[v]", "-t", str(dur),
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", out], check=True)
    return out


# ------------------------------------------------------------------ audio
# A tiny synth + sampler in numpy. Music: 120 BPM, Am–F–C–G, four-on-the-floor with sidechained
# bass and pad, a pluck arpeggio with ping-pong delay, convolution reverb on a send bus.
# Sound design is locked to the picture: reverse swells into every title, pass-by whooshes that
# follow the sliding panels (panned), sub-drops and glitch cuts into the footage, UI ticks when
# text appears, a stutter gate into the outro and a big hit + tail at the end.

rng = np.random.default_rng(7)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_exp(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def fft_filter(x, lo=None, hi=None, order=2):
    """Zero-phase band filter in the frequency domain (Butterworth-like magnitude)."""
    n = len(x)
    m = 1 << int(np.ceil(np.log2(n * 2)))
    X = np.fft.rfft(x, m)
    f = np.fft.rfftfreq(m, 1 / SR)
    g = np.ones_like(f)
    if hi:
        g /= np.sqrt(1 + (f / hi) ** (2 * order))
    if lo:
        g /= np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * order))
    return np.fft.irfft(X * g, m)[:n]


def saw(f, n, k_max=24, bright=None):
    """Band-limited additive saw; `bright` makes upper harmonics die faster (pluck)."""
    t = np.arange(n) / SR
    x = np.zeros(n)
    ph = rng.random() * 2 * np.pi
    for k in range(1, max(1, min(k_max, int((SR / 2.2) / f))) + 1):
        a = 1.0 / k
        if bright is not None:
            a = a * np.exp(-t * bright * (k - 1))
        x += a * np.sin(2 * np.pi * f * k * t + ph * k)
    return x


CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]  # Am F C G
BASS = [33, 29, 36, 31]
ARP = [0, 1, 2, 3, 2, 1, 3, 2]  # indexes into chord + octave


# ---- instruments
def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 46 + 115 * np.exp(-t * 32)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.2)
    click = fft_filter(rng.standard_normal(n), lo=2500) * np.exp(-t / 0.004) * 0.5
    return np.tanh((body + click) * 1.8) * 0.8


def hat(decay):
    n = int(decay * 7 * SR)
    return fft_filter(rng.standard_normal(n), lo=7000) * env_exp(n, decay) * 0.5


def clap():
    n = int(0.3 * SR)
    x = fft_filter(rng.standard_normal(n), lo=900, hi=4200)
    e = env_exp(n, 0.07)
    for d in (0.0, 0.011, 0.022):
        e = e + np.pad(env_exp(n - int(d * SR), 0.005), (int(d * SR), 0))[:n] * 0.8
    return x * e * 0.5


def crash(dur=1.8):
    n = int(dur * SR)
    return fft_filter(rng.standard_normal(n), lo=3200) * env_exp(n, dur / 4) * 0.45


def pad_chord(notes, dur):
    n = int(dur * SR)
    out = []
    for _ in range(2):  # L / R with independent phases = width
        x = np.zeros(n)
        for m in notes:
            for det in (-0.09, 0.09):
                x += saw(hz(m + det), n, 10)
        out.append(fft_filter(x, lo=140, hi=1600))
    i = np.arange(n)
    env = np.minimum(1, i / (0.3 * SR)) * np.minimum(1, (n - i) / (0.4 * SR))
    return [c * env * 0.022 for c in out]


_bass, _pluck = {}, {}


def bass_note(m):
    if m not in _bass:
        n = int(0.24 * SR)
        t = np.arange(n) / SR
        f = hz(m)
        x = np.sin(2 * np.pi * f * t) + saw(f * 2, n, 6) * 0.22
        env = np.minimum(1, t / 0.004) * (0.55 + 0.45 * np.exp(-t / 0.06)) * np.minimum(1, (n - np.arange(n)) / (0.02 * SR))
        _bass[m] = np.tanh(x * 1.6) * env * 0.42
    return _bass[m]


def pluck(m):
    if m not in _pluck:
        n = int(0.42 * SR)
        t = np.arange(n) / SR
        _pluck[m] = saw(hz(m), n, 16, bright=6.5) * np.exp(-t / 0.15) * np.minimum(1, t / 0.002) * 0.16
    return _pluck[m]


# ---- sound design
def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    p = t / dur
    tone = sum(np.sin(2 * np.pi * np.cumsum(f0 * (1 + 1.5 * p ** 2)) / SR) for f0 in (110, 165, 220.5))
    noise = fft_filter(rng.standard_normal(n), lo=800) * p ** 1.5
    return (tone * 0.12 + noise * 0.5) * p ** 2.2


def swell(dur=1.0):
    """Reverse crash: rises into the hit."""
    return crash(dur)[::-1] * 1.4


def sub_drop(dur=1.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 28 + 72 * np.exp(-t * 3.2)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45) * 0.9


def tick(f=2600):
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + rng.standard_normal(n) * 0.3) * np.exp(-t / 0.005) * 0.35


def thud():
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    return np.tanh(np.sin(2 * np.pi * (60 + 90 * np.exp(-t * 40)) * t) * 2) * np.exp(-t / 0.05) * 0.55


def pop():
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * (900 + 1400 * np.exp(-t * 60)) * t) * np.exp(-t / 0.018) * 0.3


def glitch(dur=0.16):
    n = int(dur * SR)
    out = np.zeros(n)
    pos = 0
    while pos < n:
        seg = min(int(rng.uniform(0.01, 0.028) * SR), n - pos)
        t = np.arange(seg) / SR
        if rng.random() < 0.35:
            x = rng.standard_normal(seg) * 0.6
        else:
            x = np.round(np.sign(np.sin(2 * np.pi * rng.choice([220, 330, 440, 660, 880, 1320]) * t)) * 3) / 3
        out[pos : pos + seg] = x * (1 if rng.random() < 0.75 else 0)
        pos += seg
    return fft_filter(out, hi=7000) * 0.22


def passby(dur=0.5, p0=0.8, p1=-0.8):
    """Filtered-noise whoosh: brightest in the middle (doppler-ish), panned from p0 to p1."""
    n = int(dur * SR)
    x = rng.standard_normal(n)
    out = np.empty(n)
    y1 = y2 = 0.0
    for i in range(n):
        fc = 450 + 7200 * math.sin(math.pi * i / n) ** 1.3
        a = math.exp(-2 * math.pi * fc / SR)
        y1 = (1 - a) * x[i] + a * y1
        y2 = (1 - a) * y1 + a * y2
        out[i] = y2
    out *= np.sin(np.pi * np.linspace(0, 1, n)) ** 1.8 * 1.3
    pan = np.linspace(p0, p1, n)
    return out * np.cos((pan + 1) * np.pi / 4) * 1.41, out * np.sin((pan + 1) * np.pi / 4) * 1.41


# ---- mixing helpers
def add(bus, sig, at, gain=1.0, pan=0.0, send=None, amount=0.0):
    i = int(at * SR)
    if i < 0:
        sig, i = sig[-i:], 0
    if i >= bus.shape[1]:
        return
    sig = sig[: bus.shape[1] - i] * gain
    l, r = math.cos((pan + 1) * math.pi / 4) * 1.41, math.sin((pan + 1) * math.pi / 4) * 1.41
    bus[0, i : i + len(sig)] += sig * l
    bus[1, i : i + len(sig)] += sig * r
    if send is not None and amount:
        send[0, i : i + len(sig)] += sig * l * amount
        send[1, i : i + len(sig)] += sig * r * amount


def add_lr(bus, lr, at, gain=1.0, send=None, amount=0.0):
    i = int(at * SR)
    for ch in range(2):
        sig = lr[ch][: max(0, bus.shape[1] - i)] * gain
        bus[ch, i : i + len(sig)] += sig
        if send is not None and amount:
            send[ch, i : i + len(sig)] += sig * amount


def reverb(x, seconds=2.4):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros_like(x)
    m = 1 << int(np.ceil(np.log2(x.shape[1] + n)))
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-t / (seconds / 6.9))
        ir = fft_filter(ir, lo=220, hi=5200)
        ir[: int(0.02 * SR)] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        out[ch] = np.fft.irfft(np.fft.rfft(x[ch], m) * np.fft.rfft(ir, m), m)[: x.shape[1]]
    return out


def build_audio(total, title_starts):
    L = int(total * SR) + SR
    drums, music, fx, send = (np.zeros((2, L)) for _ in range(4))
    drop, end = 4.0, total - 4.0  # beat runs from the drop to the outro
    s16 = 0.125
    K, CL = kick(), clap()
    HC, HO = hat(0.012), hat(0.05)

    # pad: Am under the intro, the progression with the beat, one long Am under the outro
    t = 0.0
    while t < end - 1e-6:
        ci = 0 if t < drop else int(round((t - drop) / BAR)) % 4
        add_lr(music, pad_chord(CHORDS[ci], BAR + 0.4), t, 0.8 if t < drop else 1.0, send, 0.25)
        t += BAR
    add_lr(music, pad_chord(CHORDS[0], total - end + 0.2), end, 1.2, send, 0.6)

    kicks = []
    n16 = int(round((end - drop) / s16))
    for j in range(n16):
        t = drop + j * s16
        pos, ci = j % 16, (j // 16) % 4
        last_bar = j >= n16 - 16
        grow = min(1.0, 0.55 + 0.45 * j / n16)  # the track builds up over the reel
        if j % 4 == 0:
            add(drums, K, t, 1.0)
            kicks.append(t)
        if pos in (4, 12):
            add(drums, CL, t, 0.75, -0.05, send, 0.35)
        if last_bar and pos >= 8:  # clap roll into the outro
            add(drums, CL, t, 0.25 + 0.5 * (pos - 8) / 8, 0.1, send, 0.3)
        if j % 4 == 2:
            add(drums, HO, t, 0.32, 0.35)
        else:
            add(drums, HC, t, (0.42, 0.18, 0, 0.22)[j % 4] * grow, 0.25)
        if j % 2 == 0:
            add(music, bass_note(BASS[ci] + (12 if pos == 14 else 0)), t, 1.0)
        tones = CHORDS[ci] + [CHORDS[ci][0] + 12]
        note = tones[ARP[j % 8]] + 12
        g = 0.75 * grow
        add(music, pluck(note), t, g, 0.25 if j % 2 else -0.25, send, 0.3)
        for k in (1, 2, 3):  # ping-pong delay (dotted eighth)
            add(music, pluck(note), t + k * 0.375, g * 0.38 ** k, 0.7 if k % 2 else -0.7)

    # ---- picture-synced design
    add(fx, riser(4.0), 0.0, 0.9, 0, send, 0.3)
    add_lr(fx, passby(0.75, -0.8, 0.8), 0.0, 0.5)  # yellow bar sweeps left to right
    for at in (0.5, 0.7):  # CLAUDIO / TARAS
        add(fx, thud(), at, 0.8, 0, send, 0.3)
        add(fx, tick(3000), at, 0.6, 0.3, send, 0.4)
    for k, at in enumerate((1.4, 1.47)):
        add(fx, tick(2400 + 300 * k), at, 0.5, 0.4, send, 0.4)
    add_lr(fx, passby(0.7, 0, 0), 3.3, 0.6, send, 0.2)  # panels wipe up

    for i, t0 in enumerate(title_starts):
        side = 1 if i % 2 == 0 else -1
        add(fx, swell(1.0), t0 - 1.0, 0.7, 0, send, 0.2)
        add(fx, crash(), t0, 0.55 if i else 0.85, 0, send, 0.5)
        add(fx, sub_drop(), t0, 0.5 if i else 0.9)
        add_lr(fx, passby(0.45, 0.85, -0.85), t0, 0.55, send, 0.15)  # accent panel slides in from the right
        add(fx, tick(2800), t0 + 0.25, 0.45, -0.4, send, 0.4)  # meta text
        add(fx, tick(2200), t0 + 0.35, 0.4, -0.5, send, 0.4)  # host text
        add(fx, glitch(), t0 + 0.86, 0.6, side * 0.3)  # glitch into the cut
        add(fx, thud(), t0 + 1.0, 0.6)
        add_lr(fx, passby(0.42, 0.9, 0.35), t0 + 1.0, 0.35)  # phone slides in
        add(fx, pop(), t0 + 1.45, 0.5, 0.4, send, 0.4)  # and lands

    # stutter gate on music + drums for the last half bar before the outro
    a, b = int((end - 0.5) * SR), int(end * SR)
    gate = ((np.arange(b - a) // int(0.0625 * SR)) % 2 == 0).astype(float)
    music[:, a:b] *= gate
    drums[:, a:b] *= gate

    add(fx, swell(1.2), end - 1.2, 0.9, 0, send, 0.3)
    add(fx, crash(3.0), end, 1.0, 0, send, 0.8)
    add(fx, sub_drop(2.2), end, 1.0)
    add(fx, K, end, 1.0)
    for at in (end + 0.1, end + 0.3):  # LET'S / TALK
        add(fx, thud(), at, 0.7, 0, send, 0.4)
    add(fx, pop(), end + 0.6, 0.6, 0.5, send, 0.5)  # CT mark
    for k in range(7):  # the e-mail "types" in
        add(fx, tick(2000 + 180 * (k % 3)), end + 0.9 + k * 0.045, 0.35, 0.35, send, 0.3)
    add_lr(fx, passby(0.65, 0, 0), end + 3.35, 0.7, send, 0.4)  # ink wipe down

    # sidechain: the kick ducks bass, pad and arp
    sc = np.ones(L)
    tt = np.arange(int(0.45 * SR)) / SR
    dip = 1 - 0.72 * np.exp(-tt / 0.11)
    for k in kicks:
        i = int(k * SR)
        seg = dip[: L - i]
        sc[i : i + len(seg)] = np.minimum(sc[i : i + len(seg)], seg)
    music *= sc

    wet = reverb(send, 2.4)
    mix = drums * 0.85 + music + fx * 0.9 + wet * 0.32
    track = np.vstack([fft_filter(mix[0], lo=28), fft_filter(mix[1], lo=28)])
    fade = int(0.9 * SR)
    track[:, int(total * SR) - fade : int(total * SR)] *= np.linspace(1, 0, fade)
    track = track[:, : int(total * SR)]
    track = np.tanh(track / (np.max(np.abs(track)) + 1e-9) * 1.6) * 0.9
    path = os.path.join(WORK, "audio.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((track.T * 32767).astype(np.int16).tobytes())
    return path


# ------------------------------------------------------------------ main

def main():
    os.makedirs(WORK, exist_ok=True)
    with open(os.path.join(ROOT, ".data", "db.json"), encoding="utf8") as f:
        db = json.load(f)
    projects = [p for p in sorted(db["projects"], key=lambda p: p["order"]) if p["published"] and p["slug"] not in SKIP
                and os.path.exists(os.path.join(ROOT, "public", "media", "projects", p["slug"], "desktop.mp4"))]
    total_p = len(projects)
    segs, title_starts = [], []
    t = 0.0
    if "--audio-only" in sys.argv:  # re-mix the soundtrack onto the last rendered picture
        title_starts = [4.0 + i * BAR * 2 for i in range(total_p)]
        t = 4.0 + total_p * BAR * 2 + 4.0
        mux(os.path.join(WORK, "video.mp4"), build_audio(t, title_starts), t)
        return
    segs.append(save_seq(intro_frame, int(4 * FPS), "s000_intro"))
    t += 4.0
    for i, p in enumerate(projects, 1):
        title_starts.append(t)
        segs.append(save_seq(title_frame(p, i, total_p), int(1.0 * FPS), f"s{i:03d}a_title"))
        segs.append(footage(p, 3.0, f"s{i:03d}b_foot"))
        t += BAR * 2
        print("segment", i, p["name"])
    segs.append(save_seq(outro_frame, int(4 * FPS), "s999_outro"))
    t += 4.0
    lst = os.path.join(WORK, "list.txt")
    with open(lst, "w") as f:
        f.write("".join(f"file '{s.replace(os.sep, '/')}'\n" for s in segs))
    video = os.path.join(WORK, "video.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video], check=True)
    mux(video, build_audio(t, title_starts), t)


def mux(video, audio, t):
    out = os.path.join(OUT, "showreel.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
                    "-movflags", "+faststart", "-shortest", out], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "1.6", "-i", out, "-frames:v", "1", "-quality", "75",
                    os.path.join(OUT, "showreel-poster.webp")], check=True)
    print("showreel:", round(t, 1), "s,", round(os.path.getsize(out) / 1e6, 1), "MB")


if __name__ == "__main__":
    main()
