import { appMatcher } from '@/core/app-matcher'
import type { PlatformId } from '@/core/platform/types'

export interface FuzzyActionResult {
  intent: 'open_app' | 'web_search' | 'knowledge_query' | 'chat' | 'perform_task' | 'system_command' | 'multi_task'
  canonicalAction: string
  confidence: number
  target?: string
  params?: Record<string, unknown>
}

const ACTION_MAP: Array<{
  canonicalAction: string
  intent: FuzzyActionResult['intent']
  phrases: string[]
}> = [
  { canonicalAction: 'launch_app', intent: 'open_app', phrases: ['open', 'launch', 'start', 'run'] },
  { canonicalAction: 'web_search', intent: 'web_search', phrases: ['search', 'find', 'look up', 'google'] },
  { canonicalAction: 'system_control', intent: 'system_command', phrases: ['shutdown', 'restart', 'sleep', 'lock'] },
  { canonicalAction: 'multi_task', intent: 'multi_task', phrases: ['then', 'after that', 'and then'] },
  { canonicalAction: 'perform_task', intent: 'perform_task', phrases: ['create', 'build', 'generate', 'write'] },
]

function normalize(value: string): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function tokenize(value: string): Set<string> {
  return new Set(normalize(value).split(' ').filter(Boolean))
}

function semanticSimilarity(a: string, b: string): number {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (!ta.size || !tb.size) return 0

  let overlap = 0
  for (const token of ta) {
    if (tb.has(token)) overlap += 1
  }

  const union = new Set([...ta, ...tb]).size || 1
  return overlap / union
}

export class SelfModelFuzzyMatcher {
  async resolve(input: string, platform?: PlatformId): Promise<FuzzyActionResult> {
    const normalized = normalize(input)

    let best: { action: string; intent: FuzzyActionResult['intent']; score: number } | null = null

    for (const item of ACTION_MAP) {
      for (const phrase of item.phrases) {
        const direct = normalized.includes(phrase) ? 1 : 0
        const score = Math.max(direct, semanticSimilarity(normalized, phrase))
        if (!best || score > best.score) {
          best = { action: item.canonicalAction, intent: item.intent, score }
        }
      }
    }

    if (best?.intent === 'open_app') {
      const target = normalized.replace(/^(open|launch|start|run)\s+/, '').trim()
      const app = await appMatcher.match(target, platform)
      return {
        intent: 'open_app',
        canonicalAction: 'launch_app',
        confidence: Math.max(0.65, app.confidence),
        target: app.canonicalName || target,
        params: {
          shouldClarify: app.shouldClarify,
          rawTarget: target,
          appReason: app.reason,
        },
      }
    }

    if (best) {
      return {
        intent: best.intent,
        canonicalAction: best.action,
        confidence: Number(best.score.toFixed(3)),
      }
    }

    return {
      intent: 'chat',
      canonicalAction: 'knowledge_query',
      confidence: 0.6,
      target: normalized,
      params: { query: normalized },
    }
  }
}

export const selfModelFuzzyMatcher = new SelfModelFuzzyMatcher()
