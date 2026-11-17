"""Cut short, light "how it works" loops from each project's scroll recording.

For every public/media/projects/<slug>/desktop.mp4: 1-4 segments of ~3.4 s spread over the video,
960 px wide, H.264 CRF 30, no audio, faststart -> clips/NN.mp4 + clips/NN.webp poster.

usage: python scripts/clips.py [slug ...]   (all projects when no slug is given)
"""
import json
import shutil
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "public" / "media" / "projects"
LEN = 3.4


def run(*a):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *a], check=True)


def duration(f: Path) -> float:
    # ffprobe when there is one; otherwise ffmpeg's own banner ("Duration: 00:00:41.20") — the static
    # ffmpeg in .capture/bin comes without ffprobe
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(f)], capture_output=True, text=True, check=True).stdout
        return float(json.loads(out)["format"]["duration"])
    except (FileNotFoundError, subprocess.CalledProcessError, KeyError, ValueError):
        err = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(f)], capture_output=True, text=True).stderr
        m = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", err)
        if not m:
            raise RuntimeError(f"no duration for {f}")
        return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


slugs = sys.argv[1:] or sorted(p.name for p in ROOT.iterdir() if (p / "desktop.mp4").exists())
for slug in slugs:
    src = ROOT / slug / "desktop.mp4"
    if not src.exists():
        continue
    d = duration(src)
    n = 1 if d < 12 else 2 if d < 22 else 3 if d < 45 else 4
    out = ROOT / slug / "clips"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    lo, hi = d * 0.06, max(d * 0.06, d - LEN - 0.4)
    starts = [lo + (hi - lo) * (i / (n - 1) if n > 1 else 0) for i in range(n)]
    for i, t in enumerate(starts, 1):
        name = f"{i:02d}"
        run("-ss", f"{t:.2f}", "-t", f"{LEN}", "-i", str(src), "-vf", "scale=960:-2:flags=lanczos,fps=30", "-c:v", "libx264", "-preset", "slow", "-crf", "30",
            "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", str(out / f"{name}.mp4"))
        run("-ss", f"{t:.2f}", "-i", str(src), "-frames:v", "1", "-vf", "scale=960:-2:flags=lanczos", "-quality", "72", str(out / f"{name}.webp"))
    size = sum(f.stat().st_size for f in out.iterdir()) / 1024
    print(f"[{slug}] {n} clips from {d:.1f}s  ({size:.0f} KB)")
