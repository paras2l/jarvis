"""
Omni-Learning Agent — Voice Core (Local TTS Engine)
====================================================
Model   : hexgrad/Kokoro-82M  (ultra-fast, high quality TTS — 82M params)
Fallback: espeak / pyttsx3    (CPU-only, zero-download)
Usage   : python voice_core.py --text "Hello world" --out "output.wav" [--voice af_bella] [--speed 1.0]

Install requirements:
    pip install kokoro-onnx soundfile numpy
    # OR for fallback only:
    pip install pyttsx3

Voice options (Kokoro): af_bella, af_sarah, am_adam, af_nicole, bf_emma
"""

import argparse
import sys
import os
import traceback


def parse_args():
    parser = argparse.ArgumentParser(description="Omni Voice Core")
    parser.add_argument("--text", required=True, help="Text to synthesize")
    parser.add_argument("--out", required=True, help="Output WAV file path")
    parser.add_argument("--voice", default="af_bella",
                        help="Kokoro voice ID (default: af_bella)")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")
    parser.add_argument("--engine", default="auto",
                        choices=["auto", "kokoro", "pyttsx3", "espeak"],
                        help="TTS engine (auto = try kokoro first)")
    return parser.parse_args()


# ── Kokoro Engine ─────────────────────────────────────────────────────────────

def run_kokoro(text: str, voice: str, speed: float, out_path: str) -> bool:
    try:
        from kokoro_onnx import Kokoro
        import soundfile as sf
        import numpy as np
    except ImportError:
        return False

    try:
        model_path = os.path.join(os.path.dirname(__file__), "kokoro-v0_19.onnx")
        voices_path = os.path.join(os.path.dirname(__file__), "voices.bin")

        # Auto-download model files if not present
        if not os.path.exists(model_path):
            print("INFO|Downloading Kokoro model files...", flush=True)
            import urllib.request
            KOKORO_MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/kokoro-v0_19.onnx"
            KOKORO_VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/voices.bin"
            urllib.request.urlretrieve(KOKORO_MODEL_URL, model_path)
            urllib.request.urlretrieve(KOKORO_VOICES_URL, voices_path)
            print("INFO|Kokoro model downloaded.", flush=True)

        kokoro = Kokoro(model_path, voices_path)
        samples, sample_rate = kokoro.create(text, voice=voice, speed=speed, lang="en-us")

        out_dir = os.path.dirname(out_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        sf.write(out_path, np.array(samples), sample_rate)
        return True

    except Exception as e:
        print(f"WARN|Kokoro failed: {e}", flush=True)
        return False


# ── pyttsx3 Fallback (Offline, No GPU) ───────────────────────────────────────

def run_pyttsx3(text: str, speed: float, out_path: str) -> bool:
    try:
        import pyttsx3
    except ImportError:
        return False

    try:
        engine = pyttsx3.init()
        rate = engine.getProperty("rate")
        engine.setProperty("rate", int(rate * speed))

        out_dir = os.path.dirname(out_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        engine.save_to_file(text, out_path)
        engine.runAndWait()
        return True
    except Exception as e:
        print(f"WARN|pyttsx3 failed: {e}", flush=True)
        return False


# ── espeak Fallback (Linux/System) ───────────────────────────────────────────

def run_espeak(text: str, speed: float, out_path: str) -> bool:
    try:
        import subprocess, shutil
        if not shutil.which("espeak"):
            return False

        out_dir = os.path.dirname(out_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        wpm = int(175 * speed)
        result = subprocess.run(
            ["espeak", "-w", out_path, "-s", str(wpm), text],
            capture_output=True
        )
        return result.returncode == 0
    except Exception as e:
        print(f"WARN|espeak failed: {e}", flush=True)
        return False


# ── Main ──────────────────────────────────────────────────────────────────────

def run(args):
    text = args.text
    out = args.out
    engine = args.engine

    if engine in ("auto", "kokoro"):
        if run_kokoro(text, args.voice, args.speed, out):
            print(f"SUCCESS|{out}|kokoro-82m", flush=True)
            return

    if engine in ("auto", "pyttsx3"):
        if run_pyttsx3(text, args.speed, out):
            print(f"SUCCESS|{out}|pyttsx3", flush=True)
            return

    if engine in ("auto", "espeak"):
        if run_espeak(text, args.speed, out):
            print(f"SUCCESS|{out}|espeak", flush=True)
            return

    print("ERROR|ALL_ENGINES_FAILED|Install kokoro-onnx, pyttsx3, or espeak", flush=True)
    sys.exit(1)


if __name__ == "__main__":
    try:
        args = parse_args()
        run(args)
    except Exception:
        traceback.print_exc()
        sys.exit(1)
