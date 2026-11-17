"""Silent hero background montage: 2.4 s from every project's desktop recording.
usage: .capture/pyenv/Scripts/python.exe scripts/hero_reel.py  ->  public/media/reel.{mp4,webm} + reel-poster.webp"""
import json
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, ".capture", "hero-reel")
os.makedirs(WORK, exist_ok=True)
db = json.load(open(os.path.join(ROOT, ".data", "db.json"), encoding="utf8"))
parts = []
for p in sorted(db["projects"], key=lambda p: p["order"]):
    src = os.path.join(ROOT, "public", "media", "projects", p["slug"], "desktop.mp4")
    if p.get("locked") or not os.path.exists(src):
        continue
    out = os.path.join(WORK, f"{len(parts):02d}.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "3.5", "-t", "2.4", "-i", src, "-vf",
                    "scale=1280:800:force_original_aspect_ratio=increase,crop=1280:800,fps=30,format=yuv420p",
                    "-an", "-c:v", "libx264", "-crf", "20", out], check=True)
    parts.append(out)
lst = os.path.join(WORK, "list.txt")
open(lst, "w").write("".join(f"file '{p.replace(os.sep, '/')}'\n" for p in parts))
media = os.path.join(ROOT, "public", "media")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c:v", "libx264", "-crf", "28",
                "-preset", "slow", "-movflags", "+faststart", "-an", os.path.join(media, "reel.mp4")], check=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c:v", "libvpx-vp9", "-b:v", "0",
                "-crf", "40", "-row-mt", "1", "-an", os.path.join(media, "reel.webm")], check=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "1", "-i", os.path.join(media, "reel.mp4"), "-frames:v", "1",
                "-quality", "70", os.path.join(media, "reel-poster.webp")], check=True)
print("hero reel:", len(parts), "clips,", round(os.path.getsize(os.path.join(media, "reel.mp4")) / 1e6, 1), "MB")
