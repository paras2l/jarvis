"""
Omni-Learning Agent - Diffusion Core (Local Image Engine)
=========================================================

Modes:
    1) One-shot CLI:
         python diffusion_core.py --prompt "your prompt" --out "output.png"

    2) Long-running worker mode (file-queue based):
         python diffusion_core.py --worker --requests-dir "py-diffusion-worker/requests"

Worker protocol:
    - Request file:  <requests-dir>/req_<id>.json
    - Response file: <requests-dir>/req_<id>.response.json

Request JSON fields:
    {
        "request_id": "abc123",
        "prompt": "...",
        "negative_prompt": "...",
        "out": "studio-workspace/output.png",
        "steps": 1,
        "width": 512,
        "height": 512,
        "device": "auto",
        "model": "sdxl-turbo"
    }

Install requirements:
    pip install torch torchvision diffusers transformers accelerate pillow
"""

from __future__ import annotations

import argparse
import json
import time
import sys
import traceback
from pathlib import Path
from typing import Any, Sequence, TypedDict


MODEL_IDS: dict[str, str] = {
    "sdxl-turbo": "stabilityai/sdxl-turbo",
    "sdxl": "stabilityai/stable-diffusion-xl-base-1.0",
    "sd15": "runwayml/stable-diffusion-v1-5",
}


class WorkerRequest(TypedDict, total=False):
    request_id: str
    prompt: str
    negative_prompt: str
    out: str
    steps: int
    width: int
    height: int
    device: str
    model: str


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Omni Diffusion Core")
    parser.add_argument("--prompt", required=True, help="Image generation prompt")
    parser.add_argument(
        "--negative_prompt",
        default="blurry, low quality, distorted",
        help="Negative prompt",
    )
    parser.add_argument("--out", required=True, help="Output file path (.png)")
    parser.add_argument(
        "--steps",
        type=int,
        default=1,
        help="Inference steps (1 = ultra-fast SDXL-Turbo)",
    )
    parser.add_argument("--width", type=int, default=512, help="Image width")
    parser.add_argument("--height", type=int, default=512, help="Image height")
    parser.add_argument(
        "--device",
        default="auto",
        choices=["auto", "cpu", "cuda", "mps"],
        help="Device override (auto = pick best)",
    )
    parser.add_argument(
        "--model",
        default="sdxl-turbo",
        choices=["sdxl-turbo", "sdxl", "sd15"],
        help="Model preset",
    )
    parser.add_argument(
        "--worker",
        action="store_true",
        help="Run as long-lived worker and process JSON requests from --requests-dir.",
    )
    parser.add_argument(
        "--requests-dir",
        default="py-diffusion-worker/requests",
        help="Queue directory for worker mode.",
    )
    parser.add_argument(
        "--poll-interval-ms",
        type=int,
        default=300,
        help="Worker polling interval in milliseconds.",
    )
    parser.add_argument(
        "--idle-timeout-ms",
        type=int,
        default=0,
        help="If >0, worker exits after this idle duration.",
    )
    return parser.parse_args(argv)


def pick_device(override: str) -> str:
    import torch

    if override != "auto":
        return override

    if torch.cuda.is_available():
        return "cuda"

    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"

    return "cpu"


def load_pipeline(model_id: str, device: str) -> tuple[Any, Any]:
    import torch
    from diffusers import AutoPipelineForText2Image

    dtype = torch.float16 if device in ("cuda", "mps") else torch.float32

    pipeline = AutoPipelineForText2Image.from_pretrained(
        model_id,
        torch_dtype=dtype,
        use_safetensors=True,
    )
    pipeline = pipeline.to(device)

    if device == "cpu":
        pipeline.enable_attention_slicing()

    return pipeline, dtype


def generate_image(
    pipeline: Any,
    prompt: str,
    negative_prompt: str,
    steps: int,
    width: int,
    height: int,
    model_key: str,
) -> Any:
    guidance = 0.0 if model_key == "sdxl-turbo" else 7.5
    result = pipeline(
        prompt=prompt,
        negative_prompt=negative_prompt,
        num_inference_steps=steps,
        guidance_scale=guidance,
        width=width,
        height=height,
    )
    return result.images[0]


def save_image(image: Any, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)


def run(args: argparse.Namespace) -> int:
    try:
        import torch  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as error:
        print(f"ERROR|IMPORT_FAILED|{error}", flush=True)
        return 1

    device = pick_device(args.device)
    model_key = args.model if args.model in MODEL_IDS else "sdxl-turbo"
    model_id = MODEL_IDS[model_key]

    print(f"INFO|device={device}|model={model_id}", flush=True)

    try:
        pipeline, _ = load_pipeline(model_id, device)
    except Exception as error:
        print(f"ERROR|LOAD_FAILED|{error}", flush=True)
        return 1

    try:
        image = generate_image(
            pipeline,
            prompt=args.prompt,
            negative_prompt=args.negative_prompt,
            steps=args.steps,
            width=args.width,
            height=args.height,
            model_key=model_key,
        )
    except Exception as error:
        print(f"ERROR|INFERENCE_FAILED|{error}", flush=True)
        return 1

    output_path = Path(args.out)
    try:
        save_image(image, output_path)
    except Exception as error:
        print(f"ERROR|SAVE_FAILED|{error}", flush=True)
        return 1

    print(f"SUCCESS|{output_path}|{model_id}", flush=True)
    return 0


def load_pipeline_cached(cache: dict[str, Any], model_key: str, device: str) -> tuple[Any, str]:
    selected_model_key = model_key if model_key in MODEL_IDS else "sdxl-turbo"
    model_id = MODEL_IDS[selected_model_key]
    cache_key = f"{selected_model_key}:{device}"

    if cache_key not in cache:
        pipeline, _ = load_pipeline(model_id, device)
        cache[cache_key] = pipeline

    return cache[cache_key], model_id


def run_single_request(cache: dict[str, Any], request: WorkerRequest) -> dict[str, Any]:
    request_id = str(request.get("request_id") or f"req-{int(time.time() * 1000)}")
    prompt = str(request.get("prompt") or "")
    if not prompt.strip():
        return {"request_id": request_id, "success": False, "error": "Missing prompt"}

    output_path = Path(str(request.get("out") or ""))
    if not str(output_path).strip():
        return {"request_id": request_id, "success": False, "error": "Missing out path"}

    model_key = str(request.get("model") or "sdxl-turbo")
    device = pick_device(str(request.get("device") or "auto"))
    negative_prompt = str(request.get("negative_prompt") or "blurry, low quality, distorted")
    steps = int(request.get("steps") or 1)
    width = int(request.get("width") or 512)
    height = int(request.get("height") or 512)

    try:
        pipeline, model_id = load_pipeline_cached(cache, model_key, device)
    except Exception as error:
        return {
            "request_id": request_id,
            "success": False,
            "error": f"LOAD_FAILED|{error}",
        }

    try:
        image = generate_image(
            pipeline,
            prompt=prompt,
            negative_prompt=negative_prompt,
            steps=steps,
            width=width,
            height=height,
            model_key=model_key,
        )
    except Exception as error:
        return {
            "request_id": request_id,
            "success": False,
            "error": f"INFERENCE_FAILED|{error}",
        }

    try:
        save_image(image, output_path)
    except Exception as error:
        return {
            "request_id": request_id,
            "success": False,
            "error": f"SAVE_FAILED|{error}",
        }

    return {
        "request_id": request_id,
        "success": True,
        "output_path": str(output_path),
        "model_id": model_id,
    }


def run_worker(args: argparse.Namespace) -> int:
    requests_dir = Path(args.requests_dir)
    requests_dir.mkdir(parents=True, exist_ok=True)
    cache: dict[str, Any] = {}

    poll_interval = max(50, int(args.poll_interval_ms)) / 1000.0
    idle_timeout_ms = max(0, int(args.idle_timeout_ms))
    last_activity_ms = int(time.time() * 1000)

    print(f"WORKER_READY|{requests_dir}", flush=True)

    while True:
        request_files = sorted(
            f
            for f in requests_dir.glob("*.json")
            if not f.name.endswith(".response.json")
        )

        if request_files:
            last_activity_ms = int(time.time() * 1000)

        for request_file in request_files:
            try:
                raw = request_file.read_text(encoding="utf-8")
                request: WorkerRequest = json.loads(raw)
            except Exception as error:
                response = {
                    "request_id": request_file.stem,
                    "success": False,
                    "error": f"REQUEST_PARSE_FAILED|{error}",
                }
                response_file = request_file.with_suffix(".response.json")
                response_file.write_text(json.dumps(response), encoding="utf-8")
                try:
                    request_file.unlink(missing_ok=True)
                except Exception:
                    pass
                continue

            response = run_single_request(cache, request)
            response_file = request_file.with_suffix(".response.json")
            response_file.write_text(json.dumps(response), encoding="utf-8")

            print(
                f"WORKER_DONE|{response.get('request_id')}|{response.get('success')}",
                flush=True,
            )

            try:
                request_file.unlink(missing_ok=True)
            except Exception:
                pass

        if idle_timeout_ms > 0:
            idle_ms = int(time.time() * 1000) - last_activity_ms
            if idle_ms >= idle_timeout_ms:
                print("WORKER_IDLE_EXIT", flush=True)
                return 0

        time.sleep(poll_interval)


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = parse_args(argv)
        if args.worker:
            return run_worker(args)
        return run(args)
    except Exception:
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
