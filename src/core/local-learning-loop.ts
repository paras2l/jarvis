/**
 * Local Learning Loop — Feature #3
 *
 * The agent's self-improvement engine. Inspired by OpenJarvis's continuous learning
 * system — re-invented for our architecture without any fine-tuning infrastructure.
 *
 * How it works:
 *   1. Every successful agent interaction is recorded as a "trace"
 *   2. Successful patterns are compressed into "golden playbooks"
 *   3. These playbooks are:
 *      a) Stored in semantic search index (instant recall)
 *      b) Used to prime the local LLM (zero-shot becomes few-shot)
 *      c) Periodically distilled into compressed "meta-skills"
 *   4. Result: The agent gets measurably better at YOUR specific tasks over time
 *
 * This is how a free, local model eventually matches cloud model quality
 * for tasks you do repeatedly.
 */

import { semanticSearch } from './semantic-search'
import { localLLM } from './local-llm'
import { intelligenceRouter } from './intelligence-router'

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentTrace {
  id: string
  timestamp: number
  input: string             // what the user said
  steps: string[]           // what the agent did
  output: string            // final response
  success: boolean
  userRating?: 1 | 2 | 3 | 4 | 5   // optional explicit feedback
  latencyMs: number
  source: 'local' | 'cloud' | 'hybrid'
  taskType: string
}

export interface GoldenPattern {
  id: string
  pattern: string           // compressed summary of what worked
  examples: Array<{ input: string; output: string }>
  successCount: number
  lastUsed: number
  topic: string
}

// ── LocalLearningLoop ─────────────────────────────────────────────────────

class LocalLearningLoop {
  private traces: AgentTrace[] = []
  private patterns: GoldenPattern[] = []
  private readonly MAX_TRACES = 1000
  private readonly DISTILL_EVERY = 20   // distill every 20 new successes
  private successSinceDistill = 0
  private readonly TRACE_KEY = 'agent-traces'
  private readonly PATTERN_KEY = 'golden-patterns'

  constructor() {
    this.loadFromStorage()
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Record an agent interaction as a trace.
   * Call this after EVERY successful (or failed) agent response.
   */
  record(trace: Omit<AgentTrace, 'id' | 'timestamp'>): void {
    const full: AgentTrace = {
      ...trace,
      id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      timestamp: Date.now(),
    }

    this.traces.push(full)

    if (trace.success) {
      this.successSinceDistill++

      // Add to semantic search for instant recall
      semanticSearch.add({
        content: `Input: ${trace.input}\n\nOutput: ${trace.output}`,
        summary: trace.input.slice(0, 100),
        source: 'playbook',
        topic: this.inferTopic(trace.input),
      })

      // Trigger distillation periodically
      if (this.successSinceDistill >= this.DISTILL_EVERY) {
        this.successSinceDistill = 0
        this.distillAsync()
      }
    }

    // Keep traces bounded
    if (this.traces.length > this.MAX_TRACES) {
      this.traces.shift()
    }

    this.saveToStorage()
  }

  /**
   * Rate the last response. 4-5 stars locks it as a golden pattern immediately.
   */
  rateLastResponse(stars: 1 | 2 | 3 | 4 | 5): void {
    const last = this.traces[this.traces.length - 1]
    if (!last) return
    last.userRating = stars

    if (stars >= 4) {
      this.createGoldenPattern([last])
    }
    this.saveToStorage()
  }

  /**
   * Get "primers" — examples of successful past interactions to include in LLM prompt.
   * This is what makes the local LLM act like it's been trained on your tasks.
   */
  getPrimers(query: string, count = 3): string {
    if (this.patterns.length === 0) return ''

    // Find patterns relevant to this query
    const topic = this.inferTopic(query)
    const relevant = this.patterns
      .filter(p => p.topic.toLowerCase().includes(topic.toLowerCase()) || topic.includes(p.topic.toLowerCase()))
      .sort((a, b) => b.successCount - a.successCount)
      .slice(0, count)

    if (relevant.length === 0) return ''

    const examples = relevant
      .flatMap(p => p.examples.slice(0, 1))
      .slice(0, count)
      .map(e => `User: ${e.input}\nAssistant: ${e.output}`)
      .join('\n\n')

    return `Here are examples of how to handle similar tasks:\n${examples}\n\n`
  }

  /**
   * Get learning statistics.
   */
  getStats() {
    const successRate = this.traces.filter(t => t.success).length / Math.max(1, this.traces.length)
    const avgLatency = this.traces.reduce((sum, t) => sum + t.latencyMs, 0) / Math.max(1, this.traces.length)
    const localRate = this.traces.filter(t => t.source === 'local').length / Math.max(1, this.traces.length)

    return {
      totalTraces: this.traces.length,
      goldenPatterns: this.patterns.length,
      successRate: Math.round(successRate * 100),
      avgLatencyMs: Math.round(avgLatency),
      localPercent: Math.round(localRate * 100),
      topTopics: this.getTopTopics(),
    }
  }

  /**
   * Export all traces + patterns for Supabase sync (future).
   */
  export() {
    return { traces: this.traces, patterns: this.patterns }
  }

  /**
   * Import from Supabase sync (future).
   */
  import(data: { traces?: AgentTrace[]; patterns?: GoldenPattern[] }): void {
    if (data.traces) this.traces = [...this.traces, ...data.traces]
    if (data.patterns) this.patterns = [...this.patterns, ...data.patterns]
    this.deduplicatePatterns()
    this.saveToStorage()
  }

  // ── Private: Distillation ─────────────────────────────────────────────

  private async distillAsync(): Promise<void> {
    console.log('[LearningLoop] 🧬 Distilling new patterns...')

    // Take recent successful traces
    const recentSuccess = this.traces
      .filter(t => t.success && (t.userRating ?? 3) >= 3)
      .slice(-this.DISTILL_EVERY)

    if (recentSuccess.length < 5) return

    // Group by topic
    const byTopic = new Map<string, AgentTrace[]>()
    for (const trace of recentSuccess) {
      const topic = this.inferTopic(trace.input)
      if (!byTopic.has(topic)) byTopic.set(topic, [])
      byTopic.get(topic)!.push(trace)
    }

    // Create golden patterns for each topic cluster
    for (const [topic, group] of byTopic.entries()) {
      if (group.length >= 2) {
        await this.createGoldenPattern(group, topic)
      }
    }

    this.saveToStorage()
    console.log(`[LearningLoop] ✅ Distilled ${this.patterns.length} total patterns`)
  }

  private async createGoldenPattern(
    traces: AgentTrace[],
    _topic?: string
  ): Promise<void> {
    const topic = _topic ?? this.inferTopic(traces[0].input)
    const examples = traces.map(t => ({ input: t.input, output: t.output })).slice(0, 5)

    // Use LLM to compress the pattern
    let pattern = ''
    const compress = await intelligenceRouter.query(
      `Summarize the common pattern in these successful AI interactions in 1-2 sentences:
${examples.map(e => `- User said: "${e.input.slice(0, 80)}" → Agent did: "${e.output.slice(0, 80)}"`).join('\n')}`,
      { urgency: 'background' }
    )
    pattern = compress.content

    // Check if pattern for this topic already exists
    const existing = this.patterns.find(p => p.topic === topic)
    if (existing) {
      existing.successCount += traces.length
      existing.lastUsed = Date.now()
      existing.examples = [...existing.examples, ...examples].slice(-10)  // keep last 10
      existing.pattern = pattern
    } else {
      this.patterns.push({
        id: `pat_${Date.now()}`,
        pattern,
        examples,
        successCount: traces.length,
        lastUsed: Date.now(),
        topic,
      })
    }

    // Limit patterns
    if (this.patterns.length > 200) {
      this.patterns.sort((a, b) => b.successCount - a.successCount)
      this.patterns = this.patterns.slice(0, 200)
    }
  }

  private inferTopic(input: string): string {
    const lower = input.toLowerCase()
    if (lower.includes('code') || lower.includes('build') || lower.includes('create app')) return 'coding'
    if (lower.includes('video') || lower.includes('edit') || lower.includes('capcut')) return 'video-editing'
    if (lower.includes('blender') || lower.includes('vfx') || lower.includes('render')) return 'vfx'
    if (lower.includes('search') || lower.includes('find') || lower.includes('look up')) return 'research'
    if (lower.includes('whatsapp') || lower.includes('message') || lower.includes('send')) return 'messaging'
    if (lower.includes('open') || lower.includes('launch') || lower.includes('start')) return 'app-control'
    if (lower.includes('learn') || lower.includes('read') || lower.includes('book')) return 'learning'
    return 'general'
  }

  private getTopTopics(): Array<{ topic: string; count: number }> {
    const counts = new Map<string, number>()
    for (const t of this.traces) {
      const topic = this.inferTopic(t.input)
      counts.set(topic, (counts.get(topic) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }

  private deduplicatePatterns(): void {
    const seen = new Set<string>()
    this.patterns = this.patterns.filter(p => {
      if (seen.has(p.topic)) return false
      seen.add(p.topic)
      return true
    })
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.TRACE_KEY, JSON.stringify(this.traces.slice(-500)))
      localStorage.setItem(this.PATTERN_KEY, JSON.stringify(this.patterns))
    } catch { /* ignore storage errors */ }
  }

  private loadFromStorage(): void {
    try {
      const traces = localStorage.getItem(this.TRACE_KEY)
      const patterns = localStorage.getItem(this.PATTERN_KEY)
      if (traces) this.traces = JSON.parse(traces) as AgentTrace[]
      if (patterns) this.patterns = JSON.parse(patterns) as GoldenPattern[]
      console.log(`[LearningLoop] 🧬 Loaded ${this.traces.length} traces, ${this.patterns.length} patterns`)
    } catch {
      this.traces = []
      this.patterns = []
    }
  }
}

export const learningLoop = new LocalLearningLoop()
