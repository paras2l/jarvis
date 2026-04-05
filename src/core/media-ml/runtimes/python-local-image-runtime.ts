import {
  MediaRuntimeAdapter,
  MediaStageRequest,
  MediaStageResult,
  MediaStageType,
  RuntimeEstimate,
} from '../types'

/**
 * Python Local Image Generation Runtime
 * ======================================
 * Calls the persistent diffusion_core.py worker via the Electron native bridge.
 * Works on any device — GPU for speed, CPU for compatibility.
 *
 * Requires: Python 3.9+ with packages from media-ml/python/requirements.txt
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

  estimateCost(_stage: MediaStageRequest): RuntimeEstimate {
    // Local = 0 credits. Latency depends on hardware.
    return { credits: 0, latencyMs: 12000 }
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

    // Emit progress event
    this.emitProgress(stage, 'running', 10, 'Spawning Python inference worker...')

    const result = await this.callDiffusionCore(stage.prompt, stage.id)

    if (!result.success) {
      return {
        stageId: stage.id,
        stageType: 'image',
        runtime: 'local',
        success: false,
        warnings: [result.error ?? 'Python diffusion worker failed.'],
        durationMs: Date.now() - startedAt,
        modelVersion: 'python-image-v1',
      }
    }

    this.emitProgress(stage, 'completed', 100, 'Image generated successfully.')

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

  private emitProgress(
    stage: MediaStageRequest,
    status: string,
    progress: number,
    message: string
  ) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('media:progress', {
          detail: { stageId: stage.id, stageType: stage.type, runtime: 'local', status, progress, message },
        })
      )
    }
  }

  private async callDiffusionCore(
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
        error: 'Native bridge unavailable. Run the app in Electron to use local image generation.',
      }
    }

    const timestamp = Date.now()
    const outputFilename = `studio_image_${timestamp}_${stageId}.png`

    // Get the path to diffusion_core.py
    const scriptsPathResult = await window.nativeBridge.getPythonScriptsPath?.()
    const scriptsDir = scriptsPathResult?.path ?? 'src/core/media-ml/python'
    const scriptPath = `${scriptsDir}/diffusion_core.py`

    const workspaceResult = await window.nativeBridge.getWorkspacePath?.()
    const workspaceDir = workspaceResult?.path ?? '.'
    const outputPath = `${workspaceDir}/${outputFilename}`

    // Build the command — use sdxl-turbo for speed, auto-detect device
    const safePropmt = prompt.replace(/"/g, '\\"')
    const command = `python "${scriptPath}" --prompt "${safePropmt}" --out "${outputPath}" --model sdxl-turbo --steps 1`

    this.emitProgress({ id: stageId, type: 'image', prompt, status: 'running' } as MediaStageRequest, 'running', 30, 'Loading model...')

    const result = await window.nativeBridge.runShellCommand(command, { timeoutMs: 300_000 })

    if (!result?.success) {
      const err = result?.error ?? 'Python command failed.'
      // Check if it's a "not installed" error
      if (err.includes('ModuleNotFoundError') || err.includes('No module named')) {
        return {
          success: false,
          error: `Python packages missing. Run: pip install -r src/core/media-ml/python/requirements.txt`,
        }
      }
      if (err.includes('python') && err.toLowerCase().includes('not recognized')) {
        return {
          success: false,
          error: `Python not found. Install Python 3.9+ from python.org and add it to PATH.`,
        }
      }
      return { success: false, error: err }
    }

    this.emitProgress({ id: stageId, type: 'image', prompt, status: 'running' } as MediaStageRequest, 'running', 80, 'Saving image...')

    // Parse the output line: SUCCESS|<path>|<model>
    const output = result.output ?? ''
    const successLine = output.split('\n').find((l: string) => l.startsWith('SUCCESS|'))

    if (!successLine) {
      return {
        success: false,
        error: result.error || 'Diffusion worker completed but no SUCCESS line found.',
      }
    }

    const parts = successLine.split('|')
    const filePath = parts[1] ?? outputPath
    const modelVersion = parts[2]?.trim() ?? 'sdxl-turbo'

    return {
      success: true,
      artifactUri: `file://${filePath}`,
      previewUri: `file://${filePath}`,
      modelVersion,
    }
  }
}

export const pythonLocalImageRuntime = new PythonLocalImageRuntime()
