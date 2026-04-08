import voiceHandler from '@/core/voice-handler'
import { runtimePolicyStore } from '@/core/runtime-policy'
import { whisperEngine } from '@/voice/whisper-engine'

export interface SpeechRecognitionEventPayload {
  transcript: string
  isFinal: boolean
  source: 'assistant-service' | 'renderer'
}

class SpeechRecognitionRuntime {
  private started = false
  private unbindAssistant: (() => void) | null = null
  private listeners = new Set<(payload: SpeechRecognitionEventPayload) => void>()

  start(): void {
    if (this.started) return
    this.started = true

    const service = window.nativeBridge?.assistantService
    const policy = runtimePolicyStore.get()

    if (policy.voiceBackend === 'whisper') {
      void this.startWhisperRuntime()
      return
    }

    if (service?.onEvent) {
      this.unbindAssistant = service.onEvent((payload) => {
        if (payload.type !== 'transcript' || !payload.transcript) return
        this.emit({
          transcript: payload.transcript,
          isFinal: true,
          source: 'assistant-service',
        })
      })
    }

    voiceHandler.onTranscriptCallback = (transcript, isFinal) => {
      this.emit({ transcript, isFinal, source: 'renderer' })
    }

    const state = voiceHandler.getState()
    if (!state.isListening) {
      voiceHandler.startListening()
    }
  }

  stop(): void {
    this.started = false
    whisperEngine.stop()
    if (this.unbindAssistant) {
      this.unbindAssistant()
      this.unbindAssistant = null
    }
    voiceHandler.stopListening()
  }

  onTranscript(listener: (payload: SpeechRecognitionEventPayload) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(payload: SpeechRecognitionEventPayload): void {
    this.listeners.forEach((listener) => listener(payload))
  }

  private async startWhisperRuntime(): Promise<void> {
    const service = window.nativeBridge?.assistantService

    if (service?.onEvent) {
      this.unbindAssistant = service.onEvent((payload) => {
        if (payload.type !== 'transcript' || !payload.transcript) return
        this.emit({ transcript: payload.transcript, isFinal: true, source: 'assistant-service' })
      })
    }

    const init = await whisperEngine.initialize()
    if (init.success) {
      return
    }

    // Keep voice runtime usable even if whisper init fails.
    voiceHandler.onTranscriptCallback = (transcript, isFinal) => {
      this.emit({ transcript, isFinal, source: 'renderer' })
    }
    const state = voiceHandler.getState()
    if (!state.isListening) {
      voiceHandler.startListening()
    }
  }
}

export const speechRecognitionRuntime = new SpeechRecognitionRuntime()
