import { eventPublisher } from '@/event_system/event_publisher'
import { memoryManager } from '@/layers/memory/memory_manager'
import { aliasNormalizer } from './alias_normalizer'
import { confidenceVerifier } from './confidence_verifier'
import { NormalizedCommand, VoicePerceptionInput } from './types'

export class VoicePerception {
  parse(input: VoicePerceptionInput): { command: NormalizedCommand; clarificationPrompt?: string } {
    const normalized = aliasNormalizer.normalizeText(input.rawText)
    const intent = this.detectIntent(normalized.normalizedText)
    const entities = this.extractEntities(normalized.normalizedText)
    const confidence = this.estimateConfidence(input.rawText, normalized.normalizedText, intent, entities)
    const decision = confidenceVerifier.evaluate(confidence, 'voice perception')

    const command: NormalizedCommand = {
      commandId: `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      originalText: input.rawText,
      normalizedText: normalized.normalizedText,
      intent,
      entities,
      aliasesApplied: normalized.matches.map((m) => ({ from: m.original, to: m.canonical })),
      confidence,
      requiresVerification: Boolean(decision.clarificationPrompt),
      timestamp: input.timestamp,
    }

    memoryManager.putWorking('last_voice_command', command.normalizedText, {
      confidence,
      tags: ['voice', 'command', intent],
      ttlMs: 1000 * 60 * 20,
    })

    memoryManager.recordEpisode('voice_command_perceived', {
      commandId: command.commandId,
      originalText: command.originalText,
      normalizedText: command.normalizedText,
      intent: command.intent,
    }, {
      tags: ['perception', 'voice', command.intent],
      importance: confidence,
      success: decision.accepted,
      summary: decision.reason,
    })

    void eventPublisher.voiceCommandPerceived({
      commandId: command.commandId,
      originalText: command.originalText,
      normalizedText: command.normalizedText,
      intent: command.intent,
      confidence: command.confidence,
      requiresVerification: command.requiresVerification,
    })

    if (decision.clarificationPrompt) {
      void eventPublisher.perceptionConfidenceLow({
        channel: 'voice',
        confidence: command.confidence,
        reason: decision.reason,
        clarificationPrompt: decision.clarificationPrompt,
      })
    }

    return { command, clarificationPrompt: decision.clarificationPrompt }
  }

  private detectIntent(text: string): string {
    const value = text.toLowerCase()

    if (/\b(open|launch|start|run)\b/.test(value)) {
      return 'open_app'
    }
    if (/\b(close|quit|exit|stop)\b/.test(value)) {
      return 'close_app'
    }
    if (/\b(search|find|look up)\b/.test(value)) {
      return 'search'
    }
    if (/\b(create|make|generate|build)\b/.test(value)) {
      return 'create'
    }
    if (/\b(status|state|what is open)\b/.test(value)) {
      return 'query_state'
    }
    return 'general_command'
  }

  private extractEntities(text: string): string[] {
    const cleaned = text
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)

    const stopWords = new Set(['the', 'a', 'an', 'please', 'can', 'you', 'for', 'to', 'my'])
    return cleaned.filter((token) => token.length > 2 && !stopWords.has(token.toLowerCase())).slice(0, 8)
  }

  private estimateConfidence(original: string, normalized: string, intent: string, entities: string[]): number {
    let score = 0.5

    if (intent !== 'general_command') {
      score += 0.2
    }
    if (entities.length > 0) {
      score += Math.min(0.2, entities.length * 0.04)
    }
    if (normalized !== original) {
      score += 0.08
    }
    if (original.trim().length > 8) {
      score += 0.06
    }

    return Math.max(0, Math.min(1, score))
  }
}

export const voicePerception = new VoicePerception()
