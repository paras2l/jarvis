"""
Omni-Learning Agent — Diffusion Core (Local Image Engine)
=========================================================
Model   : stabilityai/sdxl-turbo  (SDXL Turbo 1-step)
Fallback: stabilityai/stable-diffusion-xl-base-1.0 (CPU compatible)
Usage   : python diffusion_core.py --prompt "your prompt" --out "output.png" [--steps 1] [--width 512] [--height 512]

Install requirements:
    pip install torch torchvision diffusers transformers accelerate pillow

If you have NO GPU, add:  --device cpu --steps 2
"""

import argparse
import sys
import os
import traceback

def parse_args():
    parser = argparse.ArgumentParser(description="Omni Diffusion Core")
    parser.add_argument("--prompt", required=True, help="Image generation prompt")
    parser.add_argument("--negative_prompt", default="blurry, low quality, distorted", 
                       help="Negative prompt")
    parser.add_argument("--out", required=True, help="Output file path (.png)")
    parser.add_argument("--steps", type=int, default=1, help="Inference steps (1 = ultra-fast SDXL-Turbo)")
    parser.add_argument("--width", type=int, default=512, help="Image width")
    parser.add_argument("--height", type=int, default=512, help="Image height")
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda", "mps"],
                       help="Device override (auto = pick best)")
    parser.add_argument("--model", default="sdxl-turbo",
                       choices=["sdxl-turbo", "sdxl", "sd15"],
                       help="Model preset")
    return parser.parse_args()

MODEL_IDS = {
    "sdxl-turbo": "stabilityai/sdxl-turbo",
    "sdxl":       "stabilityai/stable-diffusion-xl-base-1.0",
    "sd15":       "runwayml/stable-diffusion-v1-5",
}

def pick_device(override: str):
    import torch
    if override != "auto":
        return override
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"

def run(args):
    try:
        import torch
        from diffusers import AutoPipelineForText2Image
        from PIL import Image
    except ImportError as e:
        print(f"ERROR|IMPORT_FAILED|{e}", flush=True)
        sys.exit(1)

    device = pick_device(args.device)
    model_id = MODEL_IDS.get(args.model, MODEL_IDS["sdxl-turbo"])

    print(f"INFO|device={device}|model={model_id}", flush=True)

    # Load pipeline
    dtype = torch.float16 if device in ("cuda", "mps") else torch.float32
    
    try:
        pipe = AutoPipelineForText2Image.from_pretrained(
            model_id,
            torch_dtype=dtype,
            use_safetensors=True,
        )
        pipe = pipe.to(device)

        # Enable CPU offload for low memory
        if device == "cpu":
            pipe.enable_attention_slicing()
    except Exception as e:
        print(f"ERROR|LOAD_FAILED|{e}", flush=True)
        sys.exit(1)

    # Run inference
    try:
        guidance = 0.0 if args.model == "sdxl-turbo" else 7.5
        result = pipe(
            prompt=args.prompt,
            negative_prompt=args.negative_prompt,
            num_inference_steps=args.steps,
            guidance_scale=guidance,
            width=args.width,
            height=args.height,
        )
        image: Image.Image = result.images[0]
    except Exception as e:
        print(f"ERROR|INFERENCE_FAILED|{e}", flush=True)
        sys.exit(1)

    # Save output
    out_dir = os.path.dirname(args.out)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    
    try:
        image.save(args.out)
    except Exception as e:
        print(f"ERROR|SAVE_FAILED|{e}", flush=True)
        sys.exit(1)

    print(f"SUCCESS|{args.out}|{model_id}", flush=True)


if __name__ == "__main__":
    try:
        args = parse_args()
        run(args)
    except Exception:
        traceback.print_exc()
        sys.exit(1)
