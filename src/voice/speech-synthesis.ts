import { localVoiceRuntime } from '@/core/media-ml/runtimes/local-voice-runtime'
import type { VoiceSpeechIntent, VoiceSpeechPlan } from '@/voice/voice-assistant-orchestrator'

export interface SpeechSynthesisOptions {
  intent?: VoiceSpeechIntent
  tempo?: 'fast' | 'normal' | 'slow'
  brevity?: 'short' | 'normal' | 'detailed' | 'auto'
  priority?: 'low' | 'normal' | 'high'
}

interface ResolvedSpeechProfile {
  intent: VoiceSpeechIntent
  tempo: 'fast' | 'normal' | 'slow'
  brevity: 'short' | 'normal' | 'detailed' | 'auto'
  priority: 'low' | 'normal' | 'high'
  rate: number
  pitch: number
  volume: number
}

class SpeechSynthesisRuntime {
  private queue: Array<{ text: string; profile: ResolvedSpeechProfile }> = []
  private flushing = false
  private speaking = false
  private confirmationEvents: number[] = []
  private confirmationShortModeUntil = 0

  private readonly MAX_SPOKEN_CHARS = 1200
  private readonly CHUNK_SIZE = 260
  private readonly CONFIRMATION_BURST_WINDOW_MS = 9_000
  private readonly CONFIRMATION_BURST_THRESHOLD = 3
  private readonly CONFIRMATION_SHORT_MODE_MS = 15_000

  async speak(text: string, options?: SpeechSynthesisOptions | VoiceSpeechPlan): Promise<void> {
    const profile = this.resolveProfile(options)
    const normalized = this.normalizeForSpeech(text, profile)
    if (!normalized) return

    const condensed = this.applyRapidConfirmationShortMode(normalized, profile)
    this.queue.push({ text: condensed, profile })
    await this.flushQueue()
  }

  stop(): void {
    this.queue = []
    this.speaking = false
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }

  isSpeaking(): boolean {
    return this.speaking
  }

  private async flushQueue(): Promise<void> {
    if (this.flushing) return
    this.flushing = true

    try {
      while (this.queue.length) {
        const next = this.queue.shift()
        if (!next) continue
        const chunks = this.chunkSpeech(next.text)
        for (const chunk of chunks) {
          await this.speakChunk(chunk, next.profile)
        }
      }
    } finally {
      this.flushing = false
      this.speaking = false
    }
  }

  private async speakChunk(text: string, profile: ResolvedSpeechProfile): Promise<void> {
    this.speaking = true

    try {
      await localVoiceRuntime.speak(text, {
        rate: profile.rate,
        pitch: profile.pitch,
        volume: profile.volume,
      })
      return
    } catch {
      // Fall through to browser TTS.
    }

    if ('speechSynthesis' in window) {
      await this.speakWithBrowserTts(text, profile)
    }
  }

  private speakWithBrowserTts(text: string, profile: ResolvedSpeechProfile): Promise<void> {
    return new Promise((resolve) => {
      try {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = profile.rate
        utterance.pitch = profile.pitch
        utterance.volume = profile.volume

        const voices = window.speechSynthesis.getVoices()
        const preferredVoice =
          voices.find((v) => /en/i.test(v.lang) && /female|zira|aria|samantha|alloy/i.test(v.name)) ||
          voices.find((v) => /en/i.test(v.lang))

        if (preferredVoice) {
          utterance.voice = preferredVoice
        }

        utterance.onend = () => resolve()
        utterance.onerror = () => resolve()
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utterance)
      } catch {
        resolve()
      }
    })
  }

  private normalizeForSpeech(input: string, profile: ResolvedSpeechProfile): string {
    let text = String(input || '').trim()
    if (!text) return ''

    text = text.replace(/```[\s\S]*?```/g, ' code block omitted ')
    text = text.replace(/`([^`]+)`/g, '$1')
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    text = text.replace(/https?:\/\/\S+/gi, 'link')
    text = text.replace(/[\r\n]+/g, '. ')
    text = text.replace(/\s+/g, ' ').trim()

    const budget = this.getCharacterBudget(profile)
    if (text.length > budget) {
      text = text.slice(0, budget)
      text = text.replace(/\s+\S*$/, '').trim()
      text = `${text}.`
    }

    return text
  }

  private resolveProfile(options?: SpeechSynthesisOptions | VoiceSpeechPlan): ResolvedSpeechProfile {
    const intent = options?.intent || 'conversation'
    const tempo = options?.tempo || this.defaultTempoForIntent(intent)
    const brevity = options?.brevity || this.defaultBrevityForIntent(intent)
    const priority = options?.priority || 'normal'

    const tempoRate = tempo === 'fast' ? 1.18 : tempo === 'slow' ? 0.92 : 1.02
    const intentPitch = intent === 'confirmation' ? 1.02 : intent === 'error' ? 0.96 : 1
    const priorityVolume = priority === 'high' ? 1 : priority === 'low' ? 0.92 : 0.97

    return {
      intent,
      tempo,
      brevity,
      priority,
      rate: tempoRate,
      pitch: intentPitch,
      volume: priorityVolume,
    }
  }

  private defaultTempoForIntent(intent: VoiceSpeechIntent): 'fast' | 'normal' | 'slow' {
    if (intent === 'confirmation' || intent === 'action') return 'fast'
    if (intent === 'research' || intent === 'conversation' || intent === 'error') return 'slow'
    return 'normal'
  }

  private defaultBrevityForIntent(intent: VoiceSpeechIntent): 'short' | 'normal' | 'detailed' | 'auto' {
    if (intent === 'confirmation') return 'short'
    if (intent === 'research' || intent === 'conversation') return 'detailed'
    return 'normal'
  }

  private getCharacterBudget(profile: ResolvedSpeechProfile): number {
    if (profile.brevity === 'short') return 180
    if (profile.brevity === 'normal') return 520
    if (profile.brevity === 'detailed') return this.MAX_SPOKEN_CHARS
    if (profile.intent === 'confirmation') return 140
    if (profile.intent === 'research') return 900
    return 420
  }

  private applyRapidConfirmationShortMode(text: string, profile: ResolvedSpeechProfile): string {
    if (!this.isConfirmationLike(profile.intent, text)) {
      return text
    }

    const now = Date.now()
    this.confirmationEvents = this.confirmationEvents.filter((t) => now - t <= this.CONFIRMATION_BURST_WINDOW_MS)
    this.confirmationEvents.push(now)

    if (this.confirmationEvents.length >= this.CONFIRMATION_BURST_THRESHOLD) {
      this.confirmationShortModeUntil = now + this.CONFIRMATION_SHORT_MODE_MS
    }

    if (now > this.confirmationShortModeUntil) {
      return text
    }

    if (profile.intent === 'error') {
      return 'Could not do that.'
    }
    if (profile.intent === 'system') {
      return 'System command done.'
    }
    if (profile.intent === 'memory') {
      return 'Saved.'
    }

    return 'Done.'
  }

  private isConfirmationLike(intent: VoiceSpeechIntent, text: string): boolean {
    if (intent === 'confirmation' || intent === 'action' || intent === 'system' || intent === 'memory' || intent === 'error') {
      return true
    }

    const normalized = text.toLowerCase()
    return /^(done\.?|ok\.?|completed\.?|saved\.?|cancelled\.?|failed\.?)/.test(normalized)
  }

  private chunkSpeech(text: string): string[] {
    if (text.length <= this.CHUNK_SIZE) return [text]

    const chunks: string[] = []
    let remaining = text

    while (remaining.length > this.CHUNK_SIZE) {
      const slice = remaining.slice(0, this.CHUNK_SIZE)
      const boundary = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '), slice.lastIndexOf(', '))
      const cut = boundary > 80 ? boundary + 1 : this.CHUNK_SIZE
      chunks.push(remaining.slice(0, cut).trim())
      remaining = remaining.slice(cut).trim()
    }

    if (remaining) {
      chunks.push(remaining)
    }

    return chunks.filter((chunk) => chunk.length > 0)
  }
}

export const speechSynthesisRuntime = new SpeechSynthesisRuntime()
