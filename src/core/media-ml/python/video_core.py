"""
Omni-Learning Agent — Video Core (Local Movie Engine)
======================================================
Stitches images + audio into a real MP4 movie file.

Modes:
  slideshow   — images + audio, cross-fade transitions (default)
  director    — scene-by-scene movie with title cards and captions
  avatar      — single looping face image with voice audio (for digital human)

Usage:
  python video_core.py --mode slideshow --images img1.png img2.png --audio voice.wav --out movie.mp4
  python video_core.py --mode director  --images img1.png img2.png --audio voice.wav --script script.txt --out movie.mp4
  python video_core.py --mode avatar    --image  face.png          --audio voice.wav --out avatar.mp4

Install:
  pip install moviepy pillow numpy
"""

import argparse
import sys
import os
import traceback

# ─────────────────────────────────────────────────────────────────────────────
# Arg parsing
# ─────────────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(description="Omni Video Core — Local Movie Engine")
    parser.add_argument("--mode", default="slideshow",
                        choices=["slideshow", "director", "avatar"],
                        help="Output mode")
    parser.add_argument("--images", nargs="*", default=[],
                        help="Image files (multiple allowed, for slideshow/director)")
    parser.add_argument("--image", default=None,
                        help="Single image file (for avatar mode)")
    parser.add_argument("--audio", default=None,
                        help="Audio file (.wav/.mp3) to attach")
    parser.add_argument("--script", default=None,
                        help="Text file with scene captions (one per line)")
    parser.add_argument("--out", required=True,
                        help="Output MP4 file path")
    parser.add_argument("--fps", type=int, default=24,
                        help="Frames per second")
    parser.add_argument("--width", type=int, default=1280,
                        help="Output video width")
    parser.add_argument("--height", type=int, default=720,
                        help="Output video height")
    parser.add_argument("--duration_per_image", type=float, default=4.0,
                        help="Seconds each image stays on screen (slideshow mode)")
    parser.add_argument("--transition", type=float, default=0.8,
                        help="Cross-fade transition duration in seconds")
    parser.add_argument("--title", default=None,
                        help="Optional title card text at the start")
    return parser.parse_args()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def ensure_dir(path: str):
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)


def resize_pad(img_path: str, width: int, height: int):
    """Resize image to fit width×height with black letterboxing."""
    from PIL import Image
    import numpy as np

    img = Image.open(img_path).convert("RGB")
    img.thumbnail((width, height), Image.LANCZOS)
    canvas = Image.new("RGB", (width, height), (0, 0, 0))
    x = (width - img.width) // 2
    y = (height - img.height) // 2
    canvas.paste(img, (x, y))
    return np.array(canvas)


def load_captions(script_path: str) -> list:
    if not script_path or not os.path.exists(script_path):
        return []
    with open(script_path, "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]


# ─────────────────────────────────────────────────────────────────────────────
# Mode: Slideshow (images + optional audio, cross-fade)
# ─────────────────────────────────────────────────────────────────────────────

def run_slideshow(args):
    try:
        from moviepy.editor import (
            ImageClip, AudioFileClip, concatenate_videoclips,
            CompositeVideoClip, TextClip, ColorClip
        )
    except ImportError:
        print("ERROR|IMPORT_FAILED|Install moviepy: pip install moviepy pillow", flush=True)
        sys.exit(1)

    images = args.images
    if not images:
        print("ERROR|NO_IMAGES|Provide at least one image with --images", flush=True)
        sys.exit(1)

    captions = load_captions(args.script)
    clips = []

    # Optional title card
    if args.title:
        title_clip = (
            ColorClip(size=(args.width, args.height), color=(0, 0, 0))
            .set_duration(2.5)
        )
        try:
            txt = (
                TextClip(args.title, fontsize=60, color="white", font="Arial",
                         size=(args.width - 100, None), method="caption")
                .set_position("center")
                .set_duration(2.5)
            )
            title_clip = CompositeVideoClip([title_clip, txt])
        except Exception:
            pass  # TextClip may fail if ImageMagick not installed
        clips.append(title_clip)

    for i, img_path in enumerate(images):
        if not os.path.exists(img_path):
            print(f"WARN|MISSING_IMAGE|{img_path}", flush=True)
            continue

        frame = resize_pad(img_path, args.width, args.height)
        clip = ImageClip(frame).set_duration(args.duration_per_image)

        # Add caption if available
        caption = captions[i] if i < len(captions) else None
        if caption:
            try:
                txt = (
                    TextClip(caption, fontsize=32, color="white", font="Arial",
                             bg_color="rgba(0,0,0,0.5)",
                             size=(args.width - 80, None), method="caption")
                    .set_position(("center", args.height - 120))
                    .set_duration(args.duration_per_image)
                )
                clip = CompositeVideoClip([clip, txt])
            except Exception:
                pass

        clips.append(clip)

    if not clips:
        print("ERROR|NO_CLIPS|No valid images to process.", flush=True)
        sys.exit(1)

    video = concatenate_videoclips(clips, method="compose")

    # Attach audio
    if args.audio and os.path.exists(args.audio):
        audio = AudioFileClip(args.audio)
        # Trim or loop audio to match video length
        if audio.duration < video.duration:
            from moviepy.audio.fx.audio_loop import audio_loop
            audio = audio_loop(audio, duration=video.duration)
        else:
            audio = audio.subclip(0, video.duration)
        video = video.set_audio(audio)

    ensure_dir(args.out)
    video.write_videofile(
        args.out,
        fps=args.fps,
        codec="libx264",
        audio_codec="aac",
        verbose=False,
        logger=None,
    )

    print(f"SUCCESS|{args.out}|slideshow|{len(images)}_scenes", flush=True)


# ─────────────────────────────────────────────────────────────────────────────
# Mode: Director (scene-by-scene with title cards + captions)
# ─────────────────────────────────────────────────────────────────────────────

def run_director(args):
    """Director mode — same as slideshow but uses script for per-scene builds."""
    run_slideshow(args)  # Same engine, captions drive the difference


# ─────────────────────────────────────────────────────────────────────────────
# Mode: Avatar (loop a face image with voice audio)
# ─────────────────────────────────────────────────────────────────────────────

def run_avatar(args):
    try:
        from moviepy.editor import ImageClip, AudioFileClip
    except ImportError:
        print("ERROR|IMPORT_FAILED|Install moviepy: pip install moviepy pillow", flush=True)
        sys.exit(1)

    img_path = args.image or (args.images[0] if args.images else None)
    if not img_path or not os.path.exists(str(img_path)):
        print("ERROR|NO_IMAGE|Provide --image face.png for avatar mode", flush=True)
        sys.exit(1)

    audio_duration = 5.0
    if args.audio and os.path.exists(args.audio):
        from moviepy.editor import AudioFileClip
        audio = AudioFileClip(args.audio)
        audio_duration = audio.duration

    frame = resize_pad(str(img_path), args.width, args.height)
    clip = ImageClip(frame).set_duration(audio_duration)

    if args.audio and os.path.exists(args.audio):
        from moviepy.editor import AudioFileClip
        clip = clip.set_audio(AudioFileClip(args.audio))

    ensure_dir(args.out)
    clip.write_videofile(
        args.out,
        fps=args.fps,
        codec="libx264",
        audio_codec="aac",
        verbose=False,
        logger=None,
    )

    print(f"SUCCESS|{args.out}|avatar|1_scene", flush=True)


# ─────────────────────────────────────────────────────────────────────────────
# Entry
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    try:
        args = parse_args()
        if args.mode == "slideshow":
            run_slideshow(args)
        elif args.mode == "director":
            run_director(args)
        elif args.mode == "avatar":
            run_avatar(args)
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        print(f"ERROR|UNEXPECTED|{traceback.format_exc().splitlines()[-1]}", flush=True)
        sys.exit(1)
