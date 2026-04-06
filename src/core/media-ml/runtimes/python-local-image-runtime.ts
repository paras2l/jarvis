import {
  MediaQuality,
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
  private workerBootstrapped = false

  validateInput(stage: MediaStageRequest): { valid: boolean; message?: string } {
    if (stage.type !== 'image') {
      return { valid: false, message: 'This runtime only supports image generation.' }
    }
    if (!stage.prompt || stage.prompt.trim().length < 5) {
      return { valid: false, message: 'Image prompt must be at least 5 characters.' }
    }
    return { valid: true }
  }

  estimateCost(_stage: MediaStageRequest, _quality: MediaQuality): RuntimeEstimate {
    // Local = 0 credits. Latency depends on hardware.
    return { credits: 0, latencyMs: 12000 }
  }

  async run(stage: MediaStageRequest, _jobId: string): Promise<MediaStageResult> {
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

    const scriptsPathResult = await window.nativeBridge.getPythonScriptsPath?.()
    const workspacePathResult = await window.nativeBridge.getWorkspacePath?.()
    const scriptsDir = scriptsPathResult?.path ?? 'src/core/media-ml/python'
    const workspaceDir = workspacePathResult?.path ?? '.'
    const scriptPath = `${scriptsDir}/diffusion_core.py`

    const queueDirRel = 'py-diffusion-worker/requests'
    const outputPathRel = outputFilename
    const outputPathAbs = `${workspaceDir}/${outputFilename}`

    if (!this.workerBootstrapped) {
      const startCommand = `cmd /c start "" /B python "${scriptPath}" --worker --requests-dir "${queueDirRel}"`
      await window.nativeBridge.runShellCommand(startCommand, { cwd: workspaceDir, timeoutMs: 15000 })
      this.workerBootstrapped = true
    }

    const requestId = `req_${timestamp}_${stageId}`
    const requestPathRel = `${queueDirRel}/${requestId}.json`
    const responsePathRel = `${queueDirRel}/${requestId}.response.json`

    const writeRequest = await window.nativeBridge.writeFile(requestPathRel, JSON.stringify({
      request_id: requestId,
      prompt,
      negative_prompt: 'blurry, low quality, distorted',
      out: outputPathRel,
      model: 'sdxl-turbo',
      steps: 1,
      width: 512,
      height: 512,
      device: 'auto',
    }))

    if (!writeRequest?.success) {
      return {
        success: false,
        error: 'Failed to enqueue image request for Python worker.',
      }
    }

    this.emitProgress({ id: stageId, type: 'image', prompt, status: 'running' } as MediaStageRequest, 'running', 30, 'Queued image job in Python worker...')

    const deadlineMs = Date.now() + 180000
    let workerResponse: { success?: boolean; output_path?: string; model_id?: string; error?: string } | null = null

    while (Date.now() < deadlineMs) {
      const readResult = await window.nativeBridge.readFile(responsePathRel)
      if (readResult?.success && readResult.content) {
        try {
          workerResponse = JSON.parse(readResult.content) as { success?: boolean; output_path?: string; model_id?: string; error?: string }
          break
        } catch {
          // keep polling until valid JSON is available
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500))
    }

    if (!workerResponse) {
      return {
        success: false,
        error: 'Python worker timed out waiting for image response.',
      }
    }

    if (!workerResponse.success) {
      const err = workerResponse.error ?? 'Python command failed.'
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

    this.emitProgress({ id: stageId, type: 'image', prompt, status: 'running' } as MediaStageRequest, 'running', 80, 'Image rendered by Python worker...')

    const filePath = workerResponse.output_path ?? outputPathAbs
    const modelVersion = workerResponse.model_id?.trim() ?? 'sdxl-turbo'

    return {
      success: true,
      artifactUri: `file://${filePath}`,
      previewUri: `file://${filePath}`,
      modelVersion,
    }
  }
}

export const pythonLocalImageRuntime = new PythonLocalImageRuntime()
