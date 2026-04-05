import {
  MediaRuntimeAdapter,
  MediaStageRequest,
  MediaStageResult,
  MediaStageType,
  RuntimeEstimate,
} from '../types'

/**
 * Python Local Image Generation Runtime
 *
 * Bridges to local Python environment running image generation via:
 * - Diffusers library (SDXL, Flux, etc.)
 * - Installed as a subprocess worker
 * - Returns local file artifacts and preview URIs
 *
 * Requires: Python 3.9+, torch, diffusers, PIL installed in system Python
 */
class PythonLocalImageRuntime implements MediaRuntimeAdapter {
  readonly name = 'Python Local Image Runtime'
  readonly target = 'local'
  readonly supportedStages: MediaStageType[] = ['image']

  validateInput(stage: MediaStageRequest): { valid: boolean; message?: string } {
    if (stage.type !== 'image') {
      return { valid: false, message: 'This runtime only supports image generation.' }
    }

    if (!stage.prompt || stage.prompt.trim().length < 5) {
      return { valid: false, message: 'Image prompt must be at least 5 characters.' }
    }

    return { valid: true }
  }

  estimateCost(stage: MediaStageRequest): RuntimeEstimate {
    if (stage.type !== 'image') {
      return { credits: 0, latencyMs: 0 }
    }

    const estimatedLatencyMs = 8000 + Math.random() * 4000

    return {
      credits: 0,
      latencyMs: Math.round(estimatedLatencyMs),
    }
  }

  async run(stage: MediaStageRequest): Promise<MediaStageResult> {
    const startedAt = Date.now()

    if (stage.type !== 'image') {
      return {
        stageId: stage.id,
        stageType: stage.type,
        runtime: 'local',
        success: false,
        warnings: ['Not an image stage.'],
        durationMs: 0,
        modelVersion: 'python-image-v1',
      }
    }

    const result = await this.callPythonImageWorker(stage.prompt, stage.id)

    if (!result.success) {
      return {
        stageId: stage.id,
        stageType: 'image',
        runtime: 'local',
        success: false,
        warnings: [result.error ?? 'Python worker failed.'],
        durationMs: Date.now() - startedAt,
        modelVersion: 'python-image-v1',
      }
    }

    return {
      stageId: stage.id,
      stageType: 'image',
      runtime: 'local',
      success: true,
      artifactUri: result.artifactUri,
      previewUri: result.previewUri,
      durationMs: Date.now() - startedAt,
      modelVersion: result.modelVersion ?? 'sdxl-turbo-local',
    }
  }

  private async callPythonImageWorker(
    prompt: string,
    stageId: string
  ): Promise<{
    success: boolean
    artifactUri?: string
    previewUri?: string
    modelVersion?: string
    error?: string
  }> {
    if (typeof window === 'undefined' || !window.nativeBridge?.runShellCommand) {
      return {
        success: false,
        error: 'Native bridge not available. Python worker requires shell command support.',
      }
    }

    const timestamp = Date.now()
    const outputPath = `antigravity_image_${timestamp}_${stageId}.png`

    const pythonScript = `
import sys
try:
    from diffusers import AutoPipelineForText2Image
    import torch
    
    prompt = """${prompt.replace(/"/g, '\\"')}"""
    
    pipeline = AutoPipelineForText2Image.from_pretrained(
        "stabilityai/sdxl-turbo",
        torch_dtype=torch.float16,
        variant="fp16"
    )
    pipeline.to("cuda" if torch.cuda.is_available() else "cpu")
    
    image = pipeline(prompt=prompt, num_inference_steps=1, guidance_scale=0.0).images[0]
    image.save("${outputPath}")
    
    print(f"SUCCESS|${outputPath}|sdxl-turbo")
except Exception as e:
    print(f"ERROR|{str(e)}", file=sys.stderr)
    sys.exit(1)
`.trim()

    const scriptPath = `python_image_worker_${timestamp}.py`

    try {
      const writeResult = await window.nativeBridge.writeFile?.(scriptPath, pythonScript)
      if (!writeResult?.success) {
        return { success: false, error: 'Failed to write Python worker script.' }
      }

      const runResult = await window.nativeBridge.runShellCommand?.(`python "${scriptPath}"`)

      if (!runResult?.success) {
        return {
          success: false,
          error: runResult?.error ?? 'Python worker execution failed.',
        }
      }

      const output = runResult.output ?? ''
      const lines = output.split('\n')
      const successLine = lines.find((line) => line.startsWith('SUCCESS|'))

      if (!successLine) {
        return {
          success: false,
          error: 'Python worker did not produce a SUCCESS output.',
        }
      }

      const parts = successLine.split('|')
      const filePath = parts[1] ?? outputPath
      const modelVersion = parts[2] ?? 'sdxl-turbo'

      return {
        success: true,
        artifactUri: `file://${filePath}`,
        previewUri: `file://${filePath}`,
        modelVersion,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Python worker error.',
      }
    }
  }
}

export const pythonLocalImageRuntime = new PythonLocalImageRuntime()
