import apiGateway from '@/core/api-gateway'
import { intelligenceRouter } from '@/core/intelligence-router'
import { localLLM } from '@/core/local-llm'

export type BrainProvider = 'local' | 'openai' | 'gpt' | 'claude' | 'deepseek' | 'custom'
export type BrainTaskClass = 'chat' | 'reasoning' | 'code' | 'vision' | 'research'

export interface ProviderRouteDecision {
  provider: BrainProvider
  taskClass: BrainTaskClass
  reason: string
}

const PROVIDER_PREF_KEY = 'patrich.provider.pref'

interface ProviderPreference {
  chat: BrainProvider
  reasoning: BrainProvider
  code: BrainProvider
  vision: BrainProvider
  research: BrainProvider
}

const DEFAULT_PREF: ProviderPreference = {
  chat: 'local',
  reasoning: 'openai',
  code: 'deepseek',
  vision: 'openai',
  research: 'claude',
}

function loadPreference(): ProviderPreference {
  const envProvider = normalizeProvider((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_LLM_PROVIDER)
  try {
    const raw = localStorage.getItem(PROVIDER_PREF_KEY)
    if (!raw) {
      return {
        ...DEFAULT_PREF,
        reasoning: envProvider || DEFAULT_PREF.reasoning,
      }
    }
    const parsed = JSON.parse(raw) as Partial<ProviderPreference>
    return {
      chat: parsed.chat || DEFAULT_PREF.chat,
      reasoning: parsed.reasoning || envProvider || DEFAULT_PREF.reasoning,
      code: parsed.code || DEFAULT_PREF.code,
      vision: parsed.vision || DEFAULT_PREF.vision,
      research: parsed.research || DEFAULT_PREF.research,
    }
  } catch {
    return { ...DEFAULT_PREF }
  }
}

function normalizeProvider(raw: string | undefined): BrainProvider | undefined {
  const value = String(raw || '').toLowerCase().trim()
  if (value === 'openai') return 'openai'
  if (value === 'gpt') return 'openai'
  if (value === 'claude') return 'claude'
  if (value === 'deepseek') return 'deepseek'
  if (value === 'custom') return 'custom'
  if (value === 'local') return 'local'
  return undefined
}

function savePreference(pref: ProviderPreference): void {
  localStorage.setItem(PROVIDER_PREF_KEY, JSON.stringify(pref))
}

class ProviderMatrixRouter {
  private preference = loadPreference()

  getPreference(): ProviderPreference {
    return { ...this.preference }
  }

  updatePreference(partial: Partial<ProviderPreference>): ProviderPreference {
    this.preference = { ...this.preference, ...partial }
    savePreference(this.preference)
    return this.getPreference()
  }

  decide(taskClass: BrainTaskClass, urgency: 'realtime' | 'normal' | 'background' = 'normal'): ProviderRouteDecision {
    const preferred = this.preference[taskClass]

    if (taskClass === 'chat' && urgency === 'realtime') {
      return {
        provider: 'local',
        taskClass,
        reason: 'Realtime chat prefers local latency path.',
      }
    }

    return {
      provider: preferred,
      taskClass,
      reason: `Route by configured provider preference for ${taskClass}.`,
    }
  }

  async query(prompt: string, options: { taskClass: BrainTaskClass; urgency?: 'realtime' | 'normal' | 'background'; systemPrompt?: string }): Promise<{ content: string; provider: BrainProvider; reason: string }> {
    const decision = this.decide(options.taskClass, options.urgency || 'normal')

    // Local is first-class and fully integrated.
    if (decision.provider === 'local') {
      const local = await localLLM.query(prompt, {
        system: options.systemPrompt,
      })
      if (local.source === 'local' && local.content) {
        return { content: local.content, provider: 'local', reason: decision.reason }
      }
    }

    // Cloud provider fallback through existing api-gateway route.
    const cloudPrompt = options.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt
    const cloud = await apiGateway.queryKnowledge(cloudPrompt)
    const gatewayText = this.extractGatewayContent(cloud)
    if (gatewayText) {
      return { content: gatewayText, provider: decision.provider, reason: decision.reason }
    }

    // Final fallback to existing intelligence-router.
    const fallback = await intelligenceRouter.query(prompt, {
      systemPrompt: options.systemPrompt,
      urgency: options.urgency,
      taskType: options.taskClass === 'code' ? 'code' : options.taskClass === 'research' || options.taskClass === 'reasoning' ? 'analysis' : 'chat',
    })

    return { content: fallback.content, provider: fallback.source === 'local' ? 'local' : 'custom', reason: 'Fallback to intelligence-router composite path.' }
  }

  private extractGatewayContent(response: unknown): string {
    if (!response || typeof response !== 'object') return ''
    const r = response as Record<string, unknown>
    const data = r.data as Record<string, unknown> | undefined
    if (typeof data?.content === 'string') return data.content
    if (Array.isArray(data?.choices)) {
      const c = data.choices as Array<{ message?: { content?: string } }>
      return c[0]?.message?.content || ''
    }
    return ''
  }
}

export const providerMatrixRouter = new ProviderMatrixRouter()
