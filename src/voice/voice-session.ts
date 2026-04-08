import { speechRecognitionRuntime } from '@/voice/speech-recognition'
import { speechSynthesisRuntime } from '@/voice/speech-synthesis'
import { wakeWordDetector } from '@/voice/wake-word'
import { runtimeEventBus } from '@/core/event-bus'

class VoiceSession {
  private running = false
  private unbind: (() => void) | null = null
  private activatedUntil = 0

  start(): void {
    if (this.running) return
    this.running = true

    speechRecognitionRuntime.start()
    this.unbind = speechRecognitionRuntime.onTranscript((payload) => {
      if (!payload.isFinal) return
      void this.handleTranscript(payload.transcript)
    })
  }

  stop(): void {
    this.running = false
    if (this.unbind) {
      this.unbind()
      this.unbind = null
    }
    speechRecognitionRuntime.stop()
  }

  async speak(text: string): Promise<void> {
    await speechSynthesisRuntime.speak(text)
  }

  private async handleTranscript(transcript: string): Promise<void> {
    const matched = wakeWordDetector.match(transcript)
    const now = Date.now()

    if (matched.detected) {
      this.activatedUntil = now + 15_000
      await runtimeEventBus.emit('voice.wake', { transcript, timestamp: now })
      if (matched.commandText.trim()) {
        await runtimeEventBus.emit('voice.command', {
          command: matched.commandText.trim(),
          transcript,
          timestamp: now,
        })
      }
      return
    }

    if (now <= this.activatedUntil) {
      await runtimeEventBus.emit('voice.command', {
        command: transcript.trim(),
        transcript,
        timestamp: now,
      })
    }
  }
}

export const voiceSession = new VoiceSession()
