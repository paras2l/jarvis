import { appMatcher } from '@/core/app-matcher'
import { brainDirector } from '@/core/brain/brain-director'
import { emotionCore } from '@/core/emotion/emotion-core'
import { memoryEngine } from '@/core/memory-engine'
import { intelligenceRouter } from '@/core/intelligence-router'
import { detectPlatform } from '@/core/platform/platform-detection'
import type { PlatformId } from '@/core/platform/types'
import { selfModelLayer } from '@/layers/self_model/self_model_layer'
import { globalWorkspaceLayer } from '@/layers/global_workspace/global_workspace_layer'
import { metacognitionLayer } from '@/layers/metacognition/metacognition_layer'
import { contextManager } from '@/layers/identity_continuity/context_manager'
import { intentionalAgencyLayer } from '@/layers/intentional_agency/agency_core'

export type NCULIntent =
  | 'open_app'
  | 'web_search'
  | 'knowledge_query'
  | 'chat'
  | 'perform_task'
  | 'system_command'
  | 'multi_task'

export interface NCULTask {
  intent: NCULIntent
  target?: string
  params?: Record<string, unknown>
  confidence: number
}

export interface NCULResponseContext {
  silentMode: boolean
  mood?: string
  userName?: string
  conversationId?: string
}

const TYPO_FIXES: Record<string, string> = {
  whtsapp: 'whatsapp',
  whatsap: 'whatsapp',
  cnva: 'canva',
  vsode: 'vscode',
  vsscode: 'vscode',
  hyy: 'hey',
  helo: 'hello',
  wassup: 'whatsup',
}

const SYSTEM_ACTIONS = ['shutdown', 'restart', 'sleep', 'lock', 'mute', 'volume', 'unmute']

function normalizeText(raw: string): string {
  let text = String(raw || '').toLowerCase().trim()
  text = text.replace(/[.,!?;:()[\]{}"'`~]/g, ' ')
  text = text.replace(/\s+/g, ' ').trim()

  const parts = text.split(' ').map((token) => TYPO_FIXES[token] || token)
  return parts.join(' ').trim()
}

function semanticSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/).filter(Boolean))
  const tb = new Set(b.split(/\s+/).filter(Boolean))
  if (!ta.size || !tb.size) return 0

  let overlap = 0
  ta.forEach((token) => {
    if (tb.has(token)) overlap += 1
  })

  const union = new Set([...ta, ...tb]).size || 1
  return overlap / union
}

class NaturalCommandLayer {
  private readonly appCue = /\b(open|launch|start|run)\b/
  private readonly searchCue = /\b(search|find|look up|google|bing|query)\b/
  private readonly taskCue = /\b(make|build|create|generate|write|plan|automate|schedule|do)\b/
  private readonly multiCue = /\b(and then|then|after that|also)\b/

  normalizeInput(input: string): string {
    return normalizeText(input)
  }

  private extractTargetFromOpen(text: string): string {
    const match = text.match(/(?:open|launch|start|run)\s+(.+)$/i)
    if (!match) return ''

    return match[1]
      .replace(/\b(on|in|using|please|now)\b.*$/i, '')
      .trim()
  }

  private extractSearchQuery(text: string): string {
    const match = text.match(/(?:search|find|look up|google|bing|query)\s+(?:for\s+)?(.+)$/i)
    return match ? match[1].trim() : text.trim()
  }

  private detectSystemCommand(text: string): { matched: boolean; operation?: string; confidence: number } {
    const token = SYSTEM_ACTIONS.find((item) => text.includes(item))
    if (!token) {
      return { matched: false, confidence: 0 }
    }

    const boosted = /\b(system|computer|desktop|machine)\b/.test(text) ? 0.9 : 0.78
    return {
      matched: true,
      operation: token,
      confidence: boosted,
    }
  }

  async detectIntent(input: string, platform?: PlatformId): Promise<NCULTask> {
    await memoryEngine.loadMemories()
    const normalized = this.normalizeInput(input)

    const system = this.detectSystemCommand(normalized)
    if (system.matched) {
      return {
        intent: 'system_command',
        target: system.operation,
        params: { operation: system.operation },
        confidence: system.confidence,
      }
    }

    if (this.appCue.test(normalized)) {
      const targetHint = this.extractTargetFromOpen(normalized)
      const matched = await appMatcher.match(targetHint, platform || detectPlatform())

      return {
        intent: 'open_app',
        target: matched.canonicalName || targetHint,
        params: {
          rawTarget: targetHint,
          shouldClarify: matched.shouldClarify,
          reason: matched.reason,
          learnedAlias: matched.learnedAlias,
        },
        confidence: matched.confidence,
      }
    }

    if (this.searchCue.test(normalized)) {
      const query = this.extractSearchQuery(normalized)
      return {
        intent: 'web_search',
        target: query,
        params: { query },
        confidence: 0.84,
      }
    }

    if (this.multiCue.test(normalized) && (this.appCue.test(normalized) || this.taskCue.test(normalized))) {
      return {
        intent: 'multi_task',
        params: {
          sequence: normalized
            .split(/\b(?:and then|then|after that|also)\b/)
            .map((x) => x.trim())
            .filter(Boolean),
        },
        confidence: 0.83,
      }
    }

    if (this.taskCue.test(normalized)) {
      return {
        intent: 'perform_task',
        target: normalized,
        params: { instruction: normalized },
        confidence: 0.76,
      }
    }

    const sem = semanticSimilarity(normalized, 'hi hello hey whatsup how are you')
    if (sem > 0.2 || normalized.length < 10) {
      return {
        intent: 'chat',
        target: normalized,
        params: { tone: 'casual' },
        confidence: 0.8,
      }
    }

    return {
      intent: 'knowledge_query',
      target: normalized,
      params: { query: normalized },
      confidence: 0.7,
    }
  }

  async createAdaptiveResponse(
    input: string,
    context: NCULResponseContext,
    options?: { persistContext?: boolean },
  ): Promise<string> {
    await memoryEngine.loadMemories()
    const normalized = this.normalizeInput(input)
    const emotionSnapshot = emotionCore.analyzeText(normalized)
    const brainEnvelope = await brainDirector.buildAdaptivePromptEnvelope({
      text: normalized,
      silentMode: context.silentMode,
      mood: context.mood || emotionCore.toMoodLabel(emotionSnapshot.emotion),
      emotionSnapshot,
      userName: context.userName,
      recentTurns: memoryEngine.getConversationContext(8),
    })

    const recent = memoryEngine
      .getConversationContext(8)
      .map((item) => `${item.role}: ${item.content}`)
      .join('\n')

    const friendContext = memoryEngine.buildFriendContext()
    const continuity = await contextManager.buildContinuityContext(input, context.userName || 'default-user')
    const preferenceSummary = [
      `Silent mode: ${context.silentMode ? 'on' : 'off'}`,
      `Mood: ${context.mood || memoryEngine.getCurrentMood().mood}`,
      `User: ${context.userName || memoryEngine.get('user_name') || 'Paras'}`,
      `Greeting style: ${memoryEngine.getUserPreference('greeting_style') || 'natural'}`,
      `Identity context: ${continuity.identityContext}`,
      `Relationship context: ${continuity.relationshipContext}`,
      `Open promises: ${continuity.openPromises.join(' | ') || 'none'}`,
    ].join('\n')

    const prompt = [
      'Generate a dynamic and context-aware response.',
      'Do not use canned templates. Keep it concise and human.',
      'If the input is a greeting, vary wording naturally.',
      '',
      `User input: ${normalized}`,
      '',
      'Conversation context:',
      recent || '(no recent context)',
      '',
      'Preferences:',
      preferenceSummary,
      '',
      'Brain guidance:',
      brainEnvelope,
    ].join('\n')

    const response = await intelligenceRouter.query(prompt, {
      systemPrompt: friendContext,
      urgency: 'normal',
      taskType: 'chat',
    })

    const content = response.content?.trim() || 'I am here. Tell me what you want to do next.'

    if (options?.persistContext !== false) {
      await memoryEngine.appendConversationContext('user', input)
      await memoryEngine.appendConversationContext('assistant', content)
    }

    await brainDirector.storeResponseMemory({
      text: input,
      silentMode: context.silentMode,
      mood: context.mood || emotionCore.toMoodLabel(emotionSnapshot.emotion),
      emotionSnapshot,
      userName: context.userName,
      recentTurns: memoryEngine.getConversationContext(8),
    }, content)

    return content
  }

  async interpret(input: string, platform?: PlatformId): Promise<NCULTask> {
    const task = await this.detectIntent(input, platform)
    await selfModelLayer.onUserInput(input)
    await contextManager.publishContextToWorkspace(input)

    // Opportunistically remember shorthand when user says "x means y".
    const normalized = this.normalizeInput(input)
    const aliasMatch = normalized.match(/^([a-z0-9\s]+)\s+(?:means|is|refers to)\s+([a-z0-9\s]+)$/i)
    if (aliasMatch) {
      await memoryEngine.rememberAlias(aliasMatch[1].trim(), aliasMatch[2].trim())
    }

    return task
  }

  async warmup(platform?: PlatformId): Promise<void> {
    await memoryEngine.loadMemories()
    await contextManager.warmup()
    await selfModelLayer.warmup()
    globalWorkspaceLayer.start()
    metacognitionLayer.start()
    intentionalAgencyLayer.start()
    await selfModelLayer.onSystemEvent('workspace_started', {
      component: 'global_workspace',
    })
    await appMatcher.syncInstalledApps(platform || detectPlatform())
  }
}

export const naturalCommandLayer = new NaturalCommandLayer()
