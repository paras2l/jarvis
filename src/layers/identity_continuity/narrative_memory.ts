import { memoryEngine } from '@/core/memory-engine'

export interface NarrativeEvent {
  id: string
  timestamp: number
  type: 'conversation' | 'task' | 'system' | 'relationship' | 'identity'
  summary: string
  source: string
  importance: number
  metadata?: Record<string, unknown>
}

const NARRATIVE_KEY = 'identity_narrative_events'
const MAX_EVENTS = 1000

class NarrativeMemory {
  private events: NarrativeEvent[] = []
  private loaded = false

  async warmup(): Promise<void> {
    if (this.loaded) return
    await memoryEngine.loadMemories()
    const raw = memoryEngine.get(NARRATIVE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as NarrativeEvent[]
        this.events = Array.isArray(parsed) ? parsed.slice(-MAX_EVENTS) : []
      } catch {
        this.events = []
      }
    }
    this.loaded = true
  }

  async append(input: Omit<NarrativeEvent, 'id' | 'timestamp'>): Promise<NarrativeEvent> {
    await this.warmup()
    const event: NarrativeEvent = {
      id: `narr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      ...input,
      importance: Math.max(0, Math.min(1, input.importance)),
    }

    this.events.push(event)
    this.events = this.events.slice(-MAX_EVENTS)
    await memoryEngine.rememberFact(NARRATIVE_KEY, JSON.stringify(this.events), 'fact')
    return event
  }

  recent(limit = 20): NarrativeEvent[] {
    return this.events.slice(-Math.max(1, limit)).reverse()
  }

  queryRelevant(query: string, limit = 10): NarrativeEvent[] {
    const normalized = query.toLowerCase().trim()
    if (!normalized) return this.recent(limit)

    const scored = this.events
      .map((event) => {
        const body = `${event.summary} ${JSON.stringify(event.metadata || {})}`.toLowerCase()
        const hit = body.includes(normalized) ? 2 : 0
        const tokenHits = normalized
          .split(/\s+/)
          .filter(Boolean)
          .reduce((acc, token) => acc + (body.includes(token) ? 1 : 0), 0)
        const score = hit + tokenHits + event.importance
        return { event, score }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, limit))

    return scored.map((item) => item.event)
  }
}

export const narrativeMemory = new NarrativeMemory()
