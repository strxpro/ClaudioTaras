"""
Site audio from the Ocular Sounds FX bundle → public/sound.

  music.mp3  ambient bed: "Light As A Feather" (A maj) ×2 → "Water Harp" (E maj) ×2 → "Cloud Supplies"
             (D maj) ×2, levels matched, long equal-power crossfades (the player crossfades the end back
             into the start, so the ~2 min piece loops forever without a seam)
  *.wav/mp3  UI effects, trimmed, filtered and levelled

usage: .capture/pyenv/Scripts/python.exe scripts/build-sound.py
needs an ffmpeg with libmp3lame (FFMPEG env or the one below).
"""
import os, subprocess, numpy as np

FF = os.environ.get("FFMPEG", r"F:\Luma\node_modules\ffmpeg-static\ffmpeg.exe")
LIB = r"F:\Ocular Sounds - The Ultimate Sound FX Bundle"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sound")
SR = 44100
os.makedirs(OUT, exist_ok=True)


def find(folder, start):
    for n in sorted(os.listdir(os.path.join(LIB, folder))):
        if n.startswith(start):
            return os.path.join(LIB, folder, n)
    raise SystemExit(f"missing: {folder}/{start}")


def load(path, ch=2):
    raw = subprocess.run([FF, "-v", "quiet", "-i", path, "-ac", str(ch), "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).copy()


def rms(x):
    return float(np.sqrt((x ** 2).mean()) + 1e-9)


def save(x, name, mp3=None):
    x = np.clip(x, -1, 1).astype(np.float32)
    ch = x.shape[1]
    args = [FF, "-v", "quiet", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-i", "-"]
    path = os.path.join(OUT, name)
    if mp3:
        args += ["-c:a", "libmp3lame", "-b:a", mp3, path]
    else:
        args += ["-c:a", "pcm_s16le", path]
    subprocess.run(args, input=x.tobytes(), check=True)
    print(f"{name:16} {len(x) / SR:6.2f}s {os.path.getsize(path) / 1024:7.1f} KB")


def fade(x, fin=0.0, fout=0.0):
    n = len(x)
    if fin:
        k = min(n, int(fin * SR))
        x[:k] *= np.linspace(0, 1, k)[:, None]
    if fout:
        k = min(n, int(fout * SR))
        x[-k:] *= (np.cos(np.linspace(0, np.pi / 2, k)) ** 2)[:, None] ** 0.5
    return x


# ---------------------------------------------------------------- music
def loop(start, times):
    x = load(find("Airy Drones", start))
    x *= 10 ** (-20 / 20) / rms(x)  # every bed at the same loudness
    return np.concatenate([x] * times)


def xfade(a, b, sec):
    k = int(sec * SR)
    t = np.linspace(0, np.pi / 2, k)[:, None]
    mid = a[-k:] * np.cos(t) + b[:k] * np.sin(t)  # equal power
    return np.concatenate([a[:-k], mid, b[k:]])


music = loop("DSGNDron_Light As A Feather", 2)
music = xfade(music, loop("DSGNDron_Water Harp", 2), 7)
music = xfade(music, loop("DSGNDron_Cloud Supplies", 2), 7)
music *= 10 ** (-1.5 / 20) / max(1e-6, float(np.abs(music).max()))
save(music, "music.mp3", "96k")

# ---------------------------------------------------------------- effects
def fx(folder, start, name, seconds=None, ch=1, peak_db=-3.0, fout=0.04, filt=None, mp3=None):
    path = find(folder, start)
    x = load(path, ch)
    if filt:  # run an ffmpeg filter over it
        raw = subprocess.run([FF, "-v", "quiet", "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-i", "-", "-af", filt, "-f", "f32le", "-"], input=x.tobytes(), capture_output=True).stdout
        x = np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).copy()
    # drop leading silence so the sound lands on the click
    a = np.abs(x).max(axis=1)
    on = int(np.argmax(a > a.max() * 0.02))
    x = x[max(0, on - 32):]
    if seconds:
        x = x[: int(seconds * SR)]
    x *= 10 ** (peak_db / 20) / max(1e-6, float(np.abs(x).max()))
    save(fade(x, 0.002, fout), name, mp3)


fx("Camera Shutters", "COMCam_Very Short Click", "tap.wav", 0.14, filt="highpass=f=280,lowpass=f=6500")
fx("Camera Shutters", "COMCam_Very Short Shutter, High End", "tick.wav", 0.09, filt="highpass=f=900,lowpass=f=7000", peak_db=-6)
fx("Quick Whips", "DSGNWhsh_Short Whip, Short Whoosh 26", "pop.wav", 0.2, fout=0.06)
fx("Short Whooshes", "DSGNWhsh_Quick Whoosh, Deep, Filtered, Right to Left", "swipe.mp3", 1.0, ch=2, fout=0.25, mp3="128k")
fx("Short Whooshes", "DSGNWhsh_Quick Whoosh, Soft, White Noise", "whoosh.mp3", 1.25, ch=2, fout=0.35, mp3="128k")
fx("Short Whooshes", "DSGNWhsh_Quick Whoosh, Deep, Filtered, Cloudy", "transition.mp3", 1.7, ch=2, fout=0.4, mp3="128k")
fx("Magic Spells", "MAGSpel_Blessing Magic, Musical Buff Spell Launch 1", "chime.mp3", 1.9, ch=2, fout=0.6, mp3="128k")
