#!/usr/bin/env python3
"""Export a Vox video page to MP4.

Frame-accurate: the page exposes window.__seek(t), so every frame is captured at its exact
time in headless Chromium and piped straight into ffmpeg (H.264, yuv420p, optional voiceover).

Usage:
  python3 cli/export.py <slug> [--aspect 9x16|16x9] [--fps 30] [--crf 18] [--preset slow]

Needs: Python 3.9+, `pip install playwright && python3 -m playwright install chromium`, and ffmpeg on PATH.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--aspect", default="9x16", choices=["9x16", "16x9"])
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--crf", type=int, default=18, help="lower = better quality, bigger file (16-20 is high quality)")
    ap.add_argument("--preset", default="slow", help="x264 preset: slower = smaller file, same quality")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found on PATH. Install it (apt install ffmpeg / brew install ffmpeg / winget install ffmpeg).")
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("Playwright not installed. Run: pip install playwright && python3 -m playwright install chromium")

    proj = ROOT / "projects" / args.slug
    html = proj / "video.html"
    if not html.exists():
        sys.exit(f"No video page at {html}. Build the video with: node cli/voxcut.js")
    out_dir = proj / "export"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"{args.slug}-{args.aspect}.mp4"
    voice = proj / "voice" / "voiceover.wav"
    W, H = (1080, 1920) if args.aspect == "9x16" else (1920, 1080)

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu", "--font-render-hinting=none"])
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        page.goto(f"{html.as_uri()}?aspect={args.aspect}&clean=1")
        page.wait_for_function("window.__ready === true", timeout=60000)
        page.evaluate("document.fonts.ready")
        duration = float(page.evaluate("window.__duration"))
        missing = page.evaluate("window.__missing")
        if missing:
            print(f"warning: missing images shown as placeholders: {', '.join(missing)}")
        frames = int(round(duration * args.fps))
        print(f"Rendering {frames} frames at {args.fps} fps ({duration:.1f}s, {W}x{H}) ...")

        cmd = ["ffmpeg", "-y", "-loglevel", "error",
               "-f", "image2pipe", "-framerate", str(args.fps), "-c:v", "png", "-i", "-"]
        if voice.exists():
            cmd += ["-i", str(voice)]
        cmd += ["-map", "0:v", "-c:v", "libx264", "-preset", args.preset, "-crf", str(args.crf),
                "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
        if voice.exists():
            cmd += ["-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest"]
        cmd += [str(out)]
        ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)

        t0 = time.time()
        try:
            for i in range(frames):
                page.evaluate(f"window.__seek({i / args.fps})")
                ff.stdin.write(page.screenshot(type="png"))
                if i and i % (args.fps * 5) == 0:
                    done = i / frames
                    eta = (time.time() - t0) / done * (1 - done)
                    print(f"  {int(done * 100)}%  ~{int(eta)}s left")
        finally:
            ff.stdin.close()
            code = ff.wait()
            browser.close()
        if code != 0:
            sys.exit(f"ffmpeg failed with exit code {code}")

    mb = out.stat().st_size / 1e6
    print(f"Done: {out.relative_to(ROOT)} ({mb:.1f} MB)")


if __name__ == "__main__":
    main()
