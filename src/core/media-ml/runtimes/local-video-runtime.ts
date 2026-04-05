import {
  MediaRuntimeAdapter,
  MediaStageRequest,
  MediaStageResult,
  MediaStageType,
  RuntimeEstimate,
} from '../types'

/**
 * Local Video Generation Runtime (Phase 2)
 *
 * Lightweight video generation for quick previews:
 * - AnimateDiff-style frame interpolation (local Python subprocess)
 * - Takes image + motion prompt → generates short video clip
 * - Fallback: returns static image as video frame (0.5s duration)
 *
 * Lightweight targets: 4-8 frame clips, low resolution
 * Full pipeline: 24-30 frames on cloud GPU
 */
class LocalVideoRuntime implements MediaRuntimeAdapter {
  readonly name = 'Local Video Runtime'
  readonly target = 'local'
  readonly supportedStages: MediaStageType[] = ['video']

  validateInput(stage: MediaStageRequest): { valid: boolean; message?: string } {
    if (stage.type !== 'video') {
      return { valid: false, message: 'This runtime only supports video generation.' }
    }

    if (!stage.prompt || stage.prompt.trim().length < 5) {
      return { valid: false, message: 'Video motion prompt must be at least 5 characters.' }
    }

    // Expect inputAssetUris[0] to be a source image
    if (!stage.inputAssetUris || stage.inputAssetUris.length === 0) {
      return { valid: false, message: 'Video generation requires a source image URI.' }
    }

    return { valid: true }
  }

  estimateCost(stage: MediaStageRequest): RuntimeEstimate {
    if (stage.type !== 'video') {
      return { credits: 0, latencyMs: 0 }
    }

    // Lightweight preview: 4-8 frames at low resolution
    // Estimated: 15-25 seconds on mid-range GPU
    const estimatedLatencyMs = 15000 + Math.random() * 10000

    return {
      credits: 0,
      latencyMs: Math.round(estimatedLatencyMs),
    }
  }

  async run(stage: MediaStageRequest, jobId: string): Promise<MediaStageResult> {
    const startedAt = Date.now()
    const stageId = `video-${jobId}-${Date.now()}`

    try {
      const motionPrompt = stage.prompt || ''
      const sourceImageUri = stage.inputAssetUris?.[0] || ''

      // Try Python AnimateDiff worker
      const videoUri = await this.generateWithAnimateDiff(sourceImageUri, motionPrompt)

      if (videoUri) {
        return {
          stageId,
          stageType: 'video',
          runtime: 'local',
          success: true,
          artifactUri: videoUri,
          previewUri: videoUri,
          modelVersion: 'animatediff-lightweight',
          durationMs: Date.now() - startedAt,
        }
      }

      // Fallback: return static image as single-frame "video"
      return {
        stageId,
        stageType: 'video',
        runtime: 'local',
        success: true,
        artifactUri: sourceImageUri,
        previewUri: sourceImageUri,
        modelVersion: 'static-fallback',
        durationMs: Date.now() - startedAt,
      }
    } catch (error) {
      return {
        stageId,
        stageType: 'video',
        runtime: 'local',
        success: false,
        modelVersion: 'unknown',
        durationMs: Date.now() - startedAt,
        error: String(error),
      }
    }
  }

  private async generateWithAnimateDiff(
    sourceImageUri: string,
    motionPrompt: string
  ): Promise<string | null> {
    try {
      if (typeof window === 'undefined' || !window.nativeBridge) {
        return null
      }

      const pythonScript = `
import os
import sys
from pathlib import Path

try:
  import torch
  from diffusers import AnimateDiffPipeline
  from PIL import Image
  
  device = 'cuda' if torch.cuda.is_available() else 'cpu'
  
  # Load lightweight AnimateDiff
  pipe = AnimateDiffPipeline.from_pretrained(
    'guoyww/animatediff-motion-adapter-v1-5',
    torch_dtype=torch.float16,
    device_map="auto"
  )
  
  # Load source image
  img = Image.open("${sourceImageUri.replace(/\\\\/g, '/')}").convert("RGB")
  img = img.resize((512, 512))
  
  # Generate 4-frame clip with motion
  prompt = "${motionPrompt.replace(/"/g, '\\"')}"
  
  output = pipe(
    prompt=prompt,
    image=img,
    num_frames=4,
    num_inference_steps=10,  # lightweight
    guidance_scale=7.5,
  )
  
  # Save to video file
  output_path = Path.home() / '.antigravity' / 'output.mp4'
  output.frames[0].save(str(output_path), save_all=True, duration=100, loop=0)
  
  print(f"SUCCESS|file://{output_path}|animatediff-lightweight")
except Exception as e:
  print(f"FAILED|{e}|null")
`

      const result = await window.nativeBridge.runShellCommand(
        `python -c "${pythonScript}"`
      )

      const output = typeof result === 'string' ? result : result.output || ''
      if (output.includes('SUCCESS|')) {
        const parts = output.split('|')
        if (parts.length >= 2) {
          const uri = parts[1].trim()
          if (uri.startsWith('file://')) {
            return uri
          }
        }
      }

      return null
    } catch {
      return null
    }
  }
}

export const localVideoRuntime = new LocalVideoRuntime()
