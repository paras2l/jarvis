import {
  MediaQuality,
  MediaRuntimeAdapter,
  MediaStageRequest,
  MediaStageResult,
  MediaStageType,
  RuntimeEstimate,
} from '../types'

/**
 * Local Voice Generation Runtime
 * ================================
 * Priority chain:
 *  1. Kokoro-82M via voice_core.py  — ultra-high-quality (any device)
 *  2. Browser Web Speech API        — instant, zero install
 *
 * Kokoro auto-downloads its model files (~80MB) on first run.
 */
class LocalVoiceRuntime implements MediaRuntimeAdapter {
  readonly name = 'Local Voice Runtime'
  readonly target = 'local'
  readonly supportedStages: MediaStageType[] = ['voice']

  validateInput(stage: MediaStageRequest): { valid: boolean; message?: string } {
    if (stage.type !== 'voice') {
      return { valid: false, message: 'This runtime only supports voice generation.' }
    }
    if (!stage.prompt || stage.prompt.trim().length < 3) {
      return { valid: false, message: 'Voice prompt must be at least 3 characters.' }
    }
    return { valid: true }
  }

  estimateCost(stage: MediaStageRequest, _quality: MediaQuality): RuntimeEstimate {
    const textLength = stage.prompt?.length ?? 0
    return { credits: 0, latencyMs: 1500 + Math.ceil(textLength / 20) * 200 }
  }

  async run(stage: MediaStageRequest, _jobId: string): Promise<MediaStageResult> {
    const startedAt = Date.now()

    try {
      // Try Kokoro Python worker first
      this.emitProgress(stage, 'running', 10, 'Trying Kokoro-82M voice engine...')
      const kokoroUri = await this.tryKokoroPythonWorker(stage.prompt, stage.id)

      if (kokoroUri) {
        this.emitProgress(stage, 'completed', 100, 'Kokoro voice synthesis complete.')
        return {
          stageId: stage.id,
          stageType: 'voice',
          runtime: 'local',
          success: true,
          artifactUri: kokoroUri,
          previewUri: kokoroUri,
          modelVersion: 'kokoro-82m',
          durationMs: Date.now() - startedAt,
        }
      }

      // Fallback: Web Speech API (instant, plays in browser)
      this.emitProgress(stage, 'running', 50, 'Using browser Web Speech API...')
      await this.playWithWebSpeechAPI(stage.prompt)

      // Web Speech just plays live — no file to return
      this.emitProgress(stage, 'completed', 100, 'Spoken via browser TTS.')
      return {
        stageId: stage.id,
        stageType: 'voice',
        runtime: 'local',
        success: true,
        artifactUri: 'web-speech://live',
        previewUri: 'web-speech://live',
        modelVersion: 'web-speech-api',
        durationMs: Date.now() - startedAt,
      }
    } catch (error) {
      return {
        stageId: stage.id,
        stageType: 'voice',
        runtime: 'local',
        success: false,
        modelVersion: 'unknown',
        durationMs: Date.now() - startedAt,
        warnings: [String(error)],
      }
    }
  }

  // ── Kokoro-82M via voice_core.py ──────────────────────────────────────────

  private async tryKokoroPythonWorker(text: string, stageId: string): Promise<string | null> {
    try {
      if (typeof window === 'undefined' || !window.nativeBridge?.runShellCommand) {
        return null
      }

      // Resolve script path via getUserDataPath helper or fall back to relative path
      const getUserData = window.nativeBridge.getUserDataPath
      const userDataDir = getUserData ? getUserData() : ''
      const scriptsDir = userDataDir
        ? `${userDataDir}/../src/core/media-ml/python`
        : 'src/core/media-ml/python'

      const scriptPath = `${scriptsDir}/voice_core.py`
      const outputFilename = `studio_voice_${Date.now()}_${stageId}.wav`
      const outputPath = userDataDir
        ? `${userDataDir}/studio-workspace/${outputFilename}`
        : outputFilename

      const safeText = text.replace(/"/g, '\\"').replace(/\n/g, ' ')
      const command = `python "${scriptPath}" --text "${safeText}" --out "${outputPath}" --voice af_bella --engine auto`

      // runShellCommand signature: (command: string, cwd?: string)
      const result = await window.nativeBridge.runShellCommand(command)

      if (!result?.success && !result?.output?.includes('SUCCESS|')) {
        return null
      }

      const output = result.output ?? ''
      const successLine = output.split('\n').find((l: string) => l.startsWith('SUCCESS|'))
      if (!successLine) return null

      const parts = successLine.split('|')
      const filePath = parts[1]?.trim()
      return filePath ? `file://${filePath}` : null
    } catch {
      return null
    }
  }

  // ── Web Speech API fallback ───────────────────────────────────────────────

  private playWithWebSpeechAPI(text: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        if (typeof window === 'undefined' || !window.speechSynthesis) {
          resolve()
          return
        }

        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 1.0
        utterance.pitch = 1.0
        utterance.volume = 1.0

        // Pick the best available English voice
        const voices = window.speechSynthesis.getVoices()
        const englishVoice =
          voices.find((v) => v.lang.startsWith('en') && !v.localService) ??
          voices.find((v) => v.lang.startsWith('en'))
        if (englishVoice) utterance.voice = englishVoice

        utterance.onend = () => resolve()
        utterance.onerror = () => resolve() // Don't throw, just resolve

        window.speechSynthesis.speak(utterance)
      } catch {
        resolve()
      }
    })
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

export const localVoiceRuntime = new LocalVoiceRuntime()
