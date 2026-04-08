import { localVoiceRuntime } from '@/core/media-ml/runtimes/local-voice-runtime'

class SpeechSynthesisRuntime {
  async speak(text: string): Promise<void> {
    if (!text.trim()) return

    try {
      localVoiceRuntime.speak(text)
      return
    } catch {
      // Fall through to browser TTS.
    }

    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1
      utterance.pitch = 1
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    }
  }
}

export const speechSynthesisRuntime = new SpeechSynthesisRuntime()
