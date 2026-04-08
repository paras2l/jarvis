import { speechRecognitionRuntime } from '@/voice/speech-recognition'
import { speechSynthesisRuntime, type SpeechSynthesisOptions } from '@/voice/speech-synthesis'
import { wakeWordDetector } from '@/voice/wake-word'
import { faceGate } from '@/voice/face-gate'
import { runtimeEventBus } from '@/core/event-bus'

class VoiceSession {
  private running = false
  private unbind: (() => void) | null = null
  private activatedUntil = 0
  private lastTranscriptKey = ''
  private lastTranscriptAt = 0
  private readonly ACTIVATION_WINDOW_MS = 20_000
  private readonly TRANSCRIPT_DEDUPE_WINDOW_MS = 2_200

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

  async speak(text: string, options?: SpeechSynthesisOptions): Promise<void> {
    await speechSynthesisRuntime.speak(text, options)
  }

  private async handleTranscript(transcript: string): Promise<void> {
    const text = transcript.trim()
    if (!text) return

    if (this.isIgnorableTranscript(text)) {
      return
    }

    if (this.isDuplicateTranscript(text)) {
      return
    }

    const matched = wakeWordDetector.match(transcript)
    const now = Date.now()

    if (matched.detected) {
      this.stopSpeechForUserTurn()
      const gate = await faceGate.authorizeForVoiceCommand()
      if (!gate.allowed) {
        await runtimeEventBus.emit('voice.face_blocked', {
          transcript: text,
          reason: gate.reason || 'Face authentication required',
          timestamp: now,
        })
        return
      }
      this.activatedUntil = now + this.ACTIVATION_WINDOW_MS
      await runtimeEventBus.emit('voice.wake', { transcript: text, timestamp: now })
      if (matched.commandText.trim()) {
        await runtimeEventBus.emit('voice.command', {
          command: matched.commandText.trim(),
          transcript: text,
          timestamp: now,
        })
      }
      return
    }

    if (this.looksLikeDirectCommand(text)) {
      this.stopSpeechForUserTurn()
      const gate = await faceGate.authorizeForVoiceCommand()
      if (!gate.allowed) {
        await runtimeEventBus.emit('voice.face_blocked', {
          transcript: text,
          reason: gate.reason || 'Face authentication required',
          timestamp: now,
        })
        return
      }
      await runtimeEventBus.emit('voice.command', {
        command: text,
        transcript: text,
        timestamp: now,
      })
      return
    }

    if (now <= this.activatedUntil) {
      this.stopSpeechForUserTurn()
      const gate = await faceGate.authorizeForVoiceCommand()
      if (!gate.allowed) {
        await runtimeEventBus.emit('voice.face_blocked', {
          transcript: text,
          reason: gate.reason || 'Face authentication required',
          timestamp: now,
        })
        return
      }
      this.activatedUntil = now + this.ACTIVATION_WINDOW_MS
      await runtimeEventBus.emit('voice.command', {
        command: text,
        transcript: text,
        timestamp: now,
      })
    }
  }

  private looksLikeDirectCommand(text: string): boolean {
    return /^(open|launch|run|start|search|find|fetch|show|call|message|send|play|create|build|write|remember|recall|summarize|explain|stop|cancel|confirm|continue|resume)\b/i.test(text)
  }

  private isIgnorableTranscript(text: string): boolean {
    const normalized = text.toLowerCase().trim()
    return /^(um+|uh+|hmm+|okay+|ok+|right+|yeah+|yes+|no+|huh+)$/.test(normalized)
  }

  private isDuplicateTranscript(text: string): boolean {
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim()
    const now = Date.now()
    const isDuplicate =
      normalized.length > 0 &&
      this.lastTranscriptKey === normalized &&
      now - this.lastTranscriptAt <= this.TRANSCRIPT_DEDUPE_WINDOW_MS

    this.lastTranscriptKey = normalized
    this.lastTranscriptAt = now

    return isDuplicate
  }

  private stopSpeechForUserTurn(): void {
    if (speechSynthesisRuntime.isSpeaking()) {
      speechSynthesisRuntime.stop()
    }
  }
}

export const voiceSession = new VoiceSession()
