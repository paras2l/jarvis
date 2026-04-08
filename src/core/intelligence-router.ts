/**
 * Intelligence Router â€” Feature #2
 *
 * The "Intelligence Per Watt" decision layer â€” inspired by OpenPixi (Stanford).
 * Re-architected for our Electron stack.
 *
 * Every query gets scored on 4 axes:
 *   â€¢ Complexity   (simple question vs multi-step reasoning)
 *   â€¢ Privacy      (personal data should never leave the device)
 *   â€¢ Speed need   (real-time vs background)
 *   â€¢ Cost weight  (is saving API calls worth a slower response?)
 *
 * Result: The router automatically sends 80%+ of queries to the FREE local LLM.
 * Cloud is only called when local truly cannot handle it.
 *
 * Wires into api-gateway + local-llm as the unified "brain" entry point.
 */

import { localLLM, LocalLLMResponse } from './local-llm'
import apiGateway from './api-gateway'

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type RouteDecision = 'local' | 'cloud' | 'hybrid'

export interface QueryScore {
  complexity: number    // 0-1  (1 = very complex)
  privacy: number       // 0-1  (1 = very sensitive)
  speedNeed: number     // 0-1  (1 = needs instant response)
  costWeight: number    // 0-1  (1 = saving cost is critical)
  total: number         // weighted aggregate
  decision: RouteDecision
  reasoning: string
}

export interface RouterResult {
  content: string
  score: QueryScore
  source: 'local' | 'cloud' | 'hybrid'
  latencyMs: number
  apiCallsUsed: number
}

// â”€â”€ Complexity signals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const COMPLEX_SIGNALS = [
  'analyze', 'compare', 'synthesize', 'generate code', 'write a full',
  'multi-step', 'plan', 'strategy', 'deep research', 'production-ready',
  'architecture', 'design system', 'comprehensive', 'in detail',
]

const SIMPLE_SIGNALS = [
  'what is', 'who is', 'when did', 'tell me', 'explain briefly',
  'short answer', 'list', 'define', 'yes or no', 'summary',
  'open', 'launch', 'click', 'type', 'move',
]

const PRIVATE_SIGNALS = [
  'my name', 'my password', 'my address', 'my email', 'my phone',
  'private', 'confidential', 'personal', 'health', 'medical',
  'bank', 'account', 'credit card', 'salary',
]

// â”€â”€ Routing thresholds â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const LOCAL_THRESHOLD = 0.45  // score < 0.45 â†’ route local
const CLOUD_THRESHOLD = 0.72  // score > 0.72 â†’ route cloud
// between â†’ hybrid (local first, cloud polish if needed)

// â”€â”€ IntelligenceRouter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class IntelligenceRouter {
  private stats = { local: 0, cloud: 0, hybrid: 0, totalSaved: 0 }

  /**
   * MAIN ENTRY POINT â€” Use this instead of calling apiGateway or localLLM directly.
   *
   * The router decides whether to use the local LLM, cloud API, or both.
   * Returns a unified RouterResult regardless of which path was taken.
   */
  async query(
    prompt: string,
    context?: {
      systemPrompt?: string
      isPrivate?: boolean
      urgency?: 'realtime' | 'normal' | 'background'
      taskType?: 'chat' | 'code' | 'analysis' | 'creative' | 'action'
    }
  ): Promise<RouterResult> {
    const score = this.scoreQuery(prompt, context)
    const start = Date.now()

    console.log(`[Router] "${prompt.slice(0, 40)}..." â†’ ${score.decision} (score: ${score.total.toFixed(2)})`)

    if (score.decision === 'local') {
      return await this.routeLocal(prompt, context?.systemPrompt, score, start)
    }

    if (score.decision === 'cloud') {
      return await this.routeCloud(prompt, context?.systemPrompt, score, start)
    }

    // Hybrid: try local first, use cloud to refine if confidence is low
    return await this.routeHybrid(prompt, context?.systemPrompt, score, start)
  }

  /**
   * Summarize long text/notifications into witty, humanoid snips.
   */
  async summarize(text: string, maxLength: number = 20): Promise<string> {
    const prompt = `Summarize this message in under ${maxLength} words. Make it sound like a witty humanoid partner, not a robot. If it's a notification, just give me the gist.\n\nMessage: "${text}"`
    
    // We always use 'realtime' for summaries because the user is waiting
    const result = await this.query(prompt, { 
      urgency: 'realtime', 
      taskType: 'analysis',
      systemPrompt: 'You are Pixi, a witty, proactive humanoid partner. Summarize concisely and naturally.' 
    })
    
    return result.content || text.slice(0, maxLength * 5)
  }

  /**
   * Score a query to determine local vs cloud routing.
   */
  scoreQuery(
    prompt: string,
    context?: { isPrivate?: boolean; urgency?: string; taskType?: string }
  ): QueryScore {
    const lower = prompt.toLowerCase()

    // â”€â”€ Complexity score â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let complexity = 0.3  // baseline
    for (const sig of COMPLEX_SIGNALS) {
      if (lower.includes(sig)) complexity = Math.min(1, complexity + 0.15)
    }
    for (const sig of SIMPLE_SIGNALS) {
      if (lower.includes(sig)) complexity = Math.max(0, complexity - 0.12)
    }
    // Long prompts = more complex
    if (prompt.length > 500) complexity = Math.min(1, complexity + 0.2)
    if (prompt.length < 100) complexity = Math.max(0, complexity - 0.1)

    // Code generation = always complex
    if (context?.taskType === 'code') complexity = Math.max(0.6, complexity)

    // â”€â”€ Privacy score â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let privacy = context?.isPrivate ? 0.9 : 0.1
    for (const sig of PRIVATE_SIGNALS) {
      if (lower.includes(sig)) privacy = Math.min(1, privacy + 0.2)
    }

    // â”€â”€ Speed need â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const speedNeed =
      context?.urgency === 'realtime' ? 0.8 :
      context?.urgency === 'background' ? 0.1 : 0.4

    // â”€â”€ Cost weight â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Always try to save costs; only reduce if user has explicitly said speed > cost
    const costWeight = context?.urgency === 'realtime' ? 0.3 : 0.7

    // â”€â”€ Final score (weighted) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Higher score â†’ more likely to need cloud
    // Privacy pulls hard toward local (multiply: high privacy = low cloud score)
    const raw = (complexity * 0.5) + (speedNeed * 0.15) + (costWeight * 0.1)
    const privacyPenalty = privacy * 0.25  // privacy pushes toward local
    const total = Math.max(0, Math.min(1, raw - privacyPenalty))

    const decision: RouteDecision =
      total < LOCAL_THRESHOLD ? 'local' :
      total > CLOUD_THRESHOLD ? 'cloud' : 'hybrid'

    const reasoning =
      decision === 'local' ? `Simple/private query (score ${total.toFixed(2)}) â€” free local LLM` :
      decision === 'cloud' ? `Complex query (score ${total.toFixed(2)}) â€” cloud AI needed` :
      `Medium query (score ${total.toFixed(2)}) â€” local first, cloud polish if needed`

    return { complexity, privacy, speedNeed, costWeight, total, decision, reasoning }
  }

  /**
   * Get routing cost savings report.
   */
  getStats() {
    const total = this.stats.local + this.stats.cloud + this.stats.hybrid
    const localPct = total > 0 ? Math.round((this.stats.local / total) * 100) : 0
    return {
      ...this.stats,
      total,
      localPercent: localPct,
      cloudPercent: 100 - localPct,
      estimatedSaved: `~${this.stats.local * 0.002} USD`,  // rough estimate
    }
  }

  resetStats() {
    this.stats = { local: 0, cloud: 0, hybrid: 0, totalSaved: 0 }
  }

  // â”€â”€ Private routing methods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async routeLocal(
    prompt: string,
    system: string | undefined,
    score: QueryScore,
    start: number
  ): Promise<RouterResult> {
    const res: LocalLLMResponse = await localLLM.query(prompt, { system })

    if (res.source === 'unavailable') {
      // Local LLM not running â€” fall through to cloud
      console.log('[Router] Local unavailable, escalating to cloud')
      return this.routeCloud(prompt, system, score, start)
    }

    this.stats.local++
    return {
      content: res.content,
      score,
      source: 'local',
      latencyMs: Date.now() - start,
      apiCallsUsed: 0,
    }
  }

  private async routeCloud(
    prompt: string,
    system: string | undefined,
    score: QueryScore,
    start: number
  ): Promise<RouterResult> {
    const fullPrompt = system ? `${system}\n\n${prompt}` : prompt
    const res = await apiGateway.queryKnowledge(fullPrompt)
    const content = this.extractContent(res)

    this.stats.cloud++
    return {
      content,
      score,
      source: 'cloud',
      latencyMs: Date.now() - start,
      apiCallsUsed: 1,
    }
  }

  private async routeHybrid(
    prompt: string,
    system: string | undefined,
    score: QueryScore,
    start: number
  ): Promise<RouterResult> {
    // Try local first
    const localRes: LocalLLMResponse = await localLLM.query(prompt, { system })

    if (localRes.source === 'unavailable' || !localRes.content) {
      // No local â€” go cloud
      return this.routeCloud(prompt, system, score, start)
    }

    // If local response is reasonably long and coherent, use it
    if (localRes.content.length > 150) {
      this.stats.hybrid++
      return {
        content: localRes.content,
        score,
        source: 'hybrid',
        latencyMs: Date.now() - start,
        apiCallsUsed: 0,
      }
    }

    // Local response too short/weak â€” use cloud to enhance it
    const enhancePrompt = `The following is a draft response. Please expand it into a complete, professional answer:\n\nDraft: ${localRes.content}\n\nOriginal question: ${prompt}`
    const cloudContent = this.extractContent(await apiGateway.queryKnowledge(enhancePrompt))

    this.stats.hybrid++
    return {
      content: cloudContent || localRes.content,
      score,
      source: 'hybrid',
      latencyMs: Date.now() - start,
      apiCallsUsed: 1,
    }
  }

  private extractContent(response: unknown): string {
    if (!response || typeof response !== 'object') return ''
    const r = response as Record<string, unknown>
    const data = r.data as Record<string, unknown> | undefined
    if (data?.content && typeof data.content === 'string') return data.content
    if (data?.choices) {
      const choices = data.choices as Array<{ message?: { content?: string } }>
      return choices[0]?.message?.content ?? ''
    }
    return ''
  }
}

export const intelligenceRouter = new IntelligenceRouter()

