import {
  MediaQuality,
  MediaRuntimeAdapter,
  MediaStageRequest,
  MediaStageResult,
  MediaStageType,
  RuntimeEstimate,
} from '../types'

/**
 * Local Video Runtime
 * ====================
 * Calls video_core.py via the Electron native bridge to assemble a real MP4.
 *
 * Requires: pip install moviepy pillow numpy
 *
 * Modes (chosen automatically based on available assets):
 *  - slideshow : multiple images + audio → slideshow movie
 *  - director  : images + audio + script captions → cinematic movie
 *  - avatar    : single face image + voice audio → talking-head video
 */
class LocalVideoRuntime implements MediaRuntimeAdapter {
  readonly name = 'Local Video Runtime'
  readonly target = 'local'
  readonly supportedStages: MediaStageType[] = ['video', 'avatar']

  validateInput(stage: MediaStageRequest): { valid: boolean; message?: string } {
    if (stage.type !== 'video' && stage.type !== 'avatar') {
      return { valid: false, message: 'This runtime only supports video and avatar stages.' }
    }
    if (!stage.prompt || stage.prompt.trim().length < 3) {
      return { valid: false, message: 'Video prompt must be at least 3 characters.' }
    }
    return { valid: true }
  }

  estimateCost(_stage: MediaStageRequest, _quality: MediaQuality): RuntimeEstimate {
    // Video is free locally — just takes time
    return { credits: 0, latencyMs: 25000 }
  }

  async run(stage: MediaStageRequest, _jobId: string): Promise<MediaStageResult> {
    const startedAt = Date.now()

    try {
      this.emitProgress(stage, 'running', 5, 'Preparing video pipeline...')

      const result = await this.callVideoCore(stage)

      if (!result.success) {
        return {
          stageId: stage.id,
          stageType: stage.type,
          runtime: 'local',
          success: false,
          warnings: [result.error ?? 'Video core failed.'],
          durationMs: Date.now() - startedAt,
          modelVersion: 'moviepy-local',
        }
      }

      this.emitProgress(stage, 'completed', 100, 'Movie rendered successfully! 🎬')

      return {
        stageId: stage.id,
        stageType: stage.type,
        runtime: 'local',
        success: true,
        artifactUri: result.artifactUri,
        previewUri: result.artifactUri,
        durationMs: Date.now() - startedAt,
        modelVersion: result.mode ?? 'moviepy-slideshow',
      }
    } catch (error) {
      return {
        stageId: stage.id,
        stageType: stage.type,
        runtime: 'local',
        success: false,
        warnings: [String(error)],
        durationMs: Date.now() - startedAt,
        modelVersion: 'moviepy-local',
      }
    }
  }

  // ── video_core.py caller ─────────────────────────────────────────────────

  private async callVideoCore(stage: MediaStageRequest): Promise<{
    success: boolean
    artifactUri?: string
    mode?: string
    error?: string
  }> {
    if (typeof window === 'undefined' || !window.nativeBridge?.runShellCommand) {
      return {
        success: false,
        error: 'Native bridge unavailable. Run the app in Electron to use local video generation.',
      }
    }

    const getUserData = window.nativeBridge.getUserDataPath
    const userDataDir = getUserData ? getUserData() : ''
    const scriptsDir = userDataDir
      ? `${userDataDir}/../src/core/media-ml/python`
      : 'src/core/media-ml/python'
    const scriptPath = `${scriptsDir}/video_core.py`
    const workspaceDir = userDataDir ? `${userDataDir}/studio-workspace` : '.'

    const timestamp = Date.now()
    const outputFilename = `studio_video_${timestamp}_${stage.id}.mp4`
    const outputPath = `${workspaceDir}/${outputFilename}`

    // ── Gather assets from inputAssetUris ──────────────────────────────────
    const assets = stage.inputAssetUris ?? []

    // Separate images and audio based on extension
    const imageFiles = assets
      .filter((u) => /\.(png|jpg|jpeg|webp|bmp)$/i.test(u))
      .map((u) => u.replace(/^file:\/\//, ''))

    const audioFile = assets
      .find((u) => /\.(wav|mp3|ogg|flac)$/i.test(u))
      ?.replace(/^file:\/\//, '')

    // ── Choose mode ─────────────────────────────────────────────────────────
    let mode = 'slideshow'
    if (stage.type === 'avatar') mode = 'avatar'
    else if (imageFiles.length > 0) mode = 'director'

    this.emitProgress(stage, 'running', 20, `Building ${mode} movie from ${imageFiles.length} scenes...`)

    // ── Build command ───────────────────────────────────────────────────────
    let command = `python "${scriptPath}" --mode ${mode} --out "${outputPath}" --fps 24 --width 1280 --height 720`

    if (mode === 'avatar' && imageFiles.length > 0) {
      command += ` --image "${imageFiles[0]}"`
    } else if (imageFiles.length > 0) {
      const imageArgs = imageFiles.map((f) => `"${f}"`).join(' ')
      command += ` --images ${imageArgs}`
    }

    if (audioFile) {
      command += ` --audio "${audioFile}"`
    }

    // Pass the prompt as title
    const safeTitle = stage.prompt.substring(0, 60).replace(/"/g, '\\"')
    command += ` --title "${safeTitle}"`

    this.emitProgress(stage, 'running', 40, 'Rendering frames...')

    const result = await window.nativeBridge.runShellCommand(command)

    if (!result?.success && !result?.output?.includes('SUCCESS|')) {
      const err = result?.error ?? 'Video core failed.'
      if (err.includes('ModuleNotFoundError') || err.includes('No module named')) {
        return {
          success: false,
          error: 'MoviePy not installed. Run: pip install moviepy pillow numpy',
        }
      }
      return { success: false, error: err }
    }

    const output = result.output ?? ''
    const successLine = output.split('\n').find((l: string) => l.startsWith('SUCCESS|'))

    if (!successLine) {
      return {
        success: false,
        error: result.error || 'Video core did not produce a SUCCESS line.',
      }
    }

    const parts = successLine.split('|')
    const filePath = parts[1]?.trim()
    const detectedMode = parts[2]?.trim() ?? mode

    return {
      success: true,
      artifactUri: `file://${filePath}`,
      mode: detectedMode,
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
          detail: {
            stageId: stage.id,
            stageType: stage.type,
            runtime: 'local',
            status,
            progress,
            message,
          },
        })
      )
    }
  }
}

export const localVideoRuntime = new LocalVideoRuntime()
