import { EpisodicEvent } from './types'

export class EpisodicMemory {
  private events = new Map<string, EpisodicEvent>()

  recordEvent(event: Omit<EpisodicEvent, 'eventId'>): EpisodicEvent {
    const saved: EpisodicEvent = {
      ...event,
      eventId: `ep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }
    this.events.set(saved.eventId, saved)
    return saved
  }

  getEvent(eventId: string): EpisodicEvent | undefined {
    return this.events.get(eventId)
  }

  recent(limit = 200): EpisodicEvent[] {
    return Array.from(this.events.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  findByAction(actionId: string): EpisodicEvent[] {
    return this.recent(1000).filter((event) => event.actionId === actionId)
  }

  queryByTags(tags: string[], limit = 100): EpisodicEvent[] {
    if (tags.length === 0) {
      return this.recent(limit)
    }
    return this.recent(2000)
      .filter((event) => tags.some((tag) => event.tags.includes(tag)))
      .slice(0, limit)
  }

  getSuccessRate(windowSize = 200): number {
    const sample = this.recent(windowSize).filter((event) => event.outcome)
    if (sample.length === 0) {
      return 0.5
    }
    const successCount = sample.filter((event) => event.outcome?.success).length
    return successCount / sample.length
  }

  correlateSequence(sequence: string[]): { matchCount: number; confidence: number } {
    if (sequence.length === 0) {
      return { matchCount: 0, confidence: 0 }
    }

    const names = this.recent(1000).map((event) => event.eventType)
    let matchCount = 0

    for (let i = 0; i <= names.length - sequence.length; i++) {
      const slice = names.slice(i, i + sequence.length)
      if (slice.every((value, idx) => value === sequence[idx])) {
        matchCount += 1
      }
    }

    const confidence = Math.min(1, matchCount / Math.max(1, names.length / Math.max(1, sequence.length)))
    return { matchCount, confidence }
  }

  decayOlderThan(retentionMs: number): number {
    const now = Date.now()
    let removed = 0
    for (const [id, event] of this.events.entries()) {
      if (now - event.timestamp > retentionMs && event.importance < 0.7) {
        this.events.delete(id)
        removed += 1
      }
    }
    return removed
  }

  size(): number {
    return this.events.size
  }
}

export const episodicMemory = new EpisodicMemory()
