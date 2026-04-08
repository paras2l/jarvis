import { getWhisperConfig } from '@/voice/whisper-recognition'

export interface WhisperBootstrapResult {
  success: boolean
  model?: 'tiny' | 'base' | 'small'
  device?: 'cpu' | 'gpu'
  message?: string
}

class WhisperEngine {
  private initialized = false
  private initPromise: Promise<WhisperBootstrapResult> | null = null

  async initialize(): Promise<WhisperBootstrapResult> {
    if (this.initialized) {
      const cfg = getWhisperConfig()
      return { success: true, model: cfg.model, device: cfg.device }
    }

    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this.bootstrapLocalWhisper()
    const result = await this.initPromise
    if (result.success) {
      this.initialized = true
    }
    this.initPromise = null
    return result
  }

  stop(): void {
    this.initialized = false
  }

  private async bootstrapLocalWhisper(): Promise<WhisperBootstrapResult> {
    const bridge = window.nativeBridge
    const config = getWhisperConfig()

    // On mobile/web runtimes assistantService may be unavailable; renderer voice takes over.
    if (!bridge?.assistantService?.start) {
      return {
        success: true,
        model: config.model,
        device: config.device,
        message: 'Using renderer speech runtime (no Python).',
      }
    }

    const start = await bridge.assistantService.start({
      provider: 'native',
    })

    if (!start.success) {
      return {
        success: true,
        model: config.model,
        device: config.device,
        message: 'Falling back to renderer speech runtime (no Python).',
      }
    }

    return {
      success: true,
      model: config.model,
      device: config.device,
    }
  }

}

export const whisperEngine = new WhisperEngine()
