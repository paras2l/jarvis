import { naturalCommandLayer } from '@/core/natural-command-layer'
import { brainDirector } from '@/core/brain/brain-director'
import { emotionCore, type EmotionSnapshot } from '@/core/emotion/emotion-core'
import { intelligenceRouter } from '@/core/intelligence-router'
import { memoryEngine } from '@/core/memory-engine'
import voiceHandler from '@/core/voice-handler'

export interface ChatResponseInput {
  text: string
  fromVoice?: boolean
  silentMode: boolean
  mood?: string
}

export interface ChatResponseOutput {
  content: string
  shouldSpeak: boolean
  confidence: number
  intent: string
}

type ContextTurn = {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

function semanticSimilarity(a: string, b: string): number {
  const aa = new Set(a.toLowerCase().split(/\W+/).filter(Boolean))
  const bb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean))
  if (!aa.size || !bb.size) return 0

  let overlap = 0
  aa.forEach((token) => {
    if (bb.has(token)) overlap += 1
  })

  return overlap / Math.max(aa.size, bb.size)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function pickResponseStyle(mood: string, intent: string, emotion: EmotionSnapshot): string {
  if (intent === 'open_app' || intent === 'multi_task') {
    return 'brief-actionable'
  }

  if ((emotion.emotion === 'angry' || emotion.emotion === 'fear') && emotion.intensity > 0.55) {
    return 'calm-deescalating'
  }
  if (emotion.emotion === 'sad' && emotion.intensity > 0.5) {
    return 'gentle-reassuring'
  }
  if (emotion.emotion === 'happy' && emotion.intensity > 0.55) {
    return 'warm-energetic'
  }

  const normalizedMood = mood.toLowerCase()
  if (normalizedMood.includes('focused')) {
    return 'concise-technical'
  }
  if (normalizedMood.includes('tired')) {
    return 'calm-supportive'
  }
  if (normalizedMood.includes('excited') || normalizedMood.includes('creative')) {
    return 'energetic-creative'
  }
  return 'friendly-natural'
}

class ChatResponseEngine {
  private buildContextTurns(limit = 12): ContextTurn[] {
    return memoryEngine.getConversationContext(limit)
  }

  private buildContextDigest(turns: ContextTurn[]): string {
    if (!turns.length) return 'No prior context in memory.'

    return turns
      .map((turn) => {
        const time = new Date(turn.timestamp).toLocaleTimeString()
        return `[${time}] ${turn.role}: ${turn.content}`
      })
      .join('\n')
  }

  private shouldDiversify(candidate: string, priorAssistant: string[]): boolean {
    return priorAssistant.some((item) => semanticSimilarity(item, candidate) > 0.85)
  }

  private async diversifyResponse(candidate: string): Promise<string> {
    const rewrite = await intelligenceRouter.query(
      [
        'Rewrite the response with the same meaning but different wording.',
        'Keep it short, natural, and avoid repetitive sentence structure.',
        '',
        `Original: ${candidate}`,
      ].join('\n'),
      {
        urgency: 'normal',
        taskType: 'chat',
        systemPrompt: memoryEngine.buildFriendContext(),
      },
    )
    return rewrite.content?.trim() || candidate
  }

  private calculateConfidence(intentConfidence: number, source: 'local' | 'cloud' | 'hybrid'): number {
    const sourceBoost = source === 'local' ? 0.02 : source === 'hybrid' ? 0.04 : 0.06
    return clamp(intentConfidence + sourceBoost, 0, 0.99)
  }

  private async buildPrompt(input: ChatResponseInput, intent: string, style: string, contextDigest: string, emotionSnapshot: EmotionSnapshot): Promise<string> {
    const brainEnvelope = await brainDirector.buildAdaptivePromptEnvelope({
      text: input.text,
      intent,
      silentMode: input.silentMode,
      mood: input.mood,
      emotionSnapshot,
      userName: memoryEngine.get('user_name') || 'Paras',
      recentTurns: memoryEngine.getConversationContext(12),
    })

    return [
      'You are Pixi, a context-aware personal AI companion.',
      'Generate one high-quality response for the user message.',
      'Rules:',
      '- No canned or repetitive templates.',
      '- Be helpful, grounded, and concise.',
      `- Style mode: ${style}.`,
      `- Intent: ${intent}.`,
      `- Silent mode active: ${input.silentMode ? 'yes' : 'no'}.`,
      '',
      'Recent context:',
      contextDigest,
      '',
      'Brain guidance:',
      brainEnvelope,
      '',
      `User message: ${input.text}`,
    ].join('\n')
  }

  private async maybeSpeak(output: string, shouldSpeak: boolean): Promise<void> {
    if (!shouldSpeak) return
    await voiceHandler.enqueueSpeech({
      text: output,
      requiresAudioConfirmation: true,
    })
  }

  async generate(input: ChatResponseInput): Promise<ChatResponseOutput> {
    await memoryEngine.loadMemories()

    const parsed = await naturalCommandLayer.interpret(input.text)

    const turns = this.buildContextTurns(12)
    const priorAssistant = turns.filter((item) => item.role === 'assistant').map((item) => item.content)
    const baseEmotion = emotionCore.analyzeText(input.text)
    const resolvedEmotion = emotionCore.resolveWithDecay(baseEmotion, turns)
    const emotionSnapshot = resolvedEmotion.snapshot
    const mood = input.mood || emotionCore.toMoodLabel(emotionSnapshot.emotion) || memoryEngine.getCurrentMood().mood
    const style = pickResponseStyle(mood, parsed.intent, emotionSnapshot)
    const contextDigest = this.buildContextDigest(turns)

    const prompt = await this.buildPrompt(input, parsed.intent, style, contextDigest, emotionSnapshot)

    const routed = await intelligenceRouter.query(prompt, {
      taskType: 'chat',
      urgency: 'normal',
      systemPrompt: memoryEngine.buildFriendContext(),
    })

    const adaptiveFallback = await naturalCommandLayer.createAdaptiveResponse(input.text, {
      silentMode: input.silentMode,
      mood,
      userName: memoryEngine.get('user_name') || 'Paras',
    }, { persistContext: false })

    let finalContent = routed.content?.trim() || adaptiveFallback

    if (this.shouldDiversify(finalContent, priorAssistant)) {
      finalContent = await this.diversifyResponse(finalContent)
    }

    const shouldSpeak = !input.silentMode && Boolean(input.fromVoice)
    await this.maybeSpeak(finalContent, shouldSpeak)

    await memoryEngine.appendConversationContext('user', input.text)
    await memoryEngine.appendConversationContext('assistant', finalContent)

    await brainDirector.storeResponseMemory({
      text: input.text,
      intent: parsed.intent,
      silentMode: input.silentMode,
      mood,
      emotionSnapshot,
      userName: memoryEngine.get('user_name') || 'Paras',
      recentTurns: turns,
    }, finalContent)

    return {
      content: finalContent,
      shouldSpeak,
      confidence: this.calculateConfidence(parsed.confidence, routed.source),
      intent: parsed.intent,
    }
  }
}

export const chatResponseEngine = new ChatResponseEngine()

