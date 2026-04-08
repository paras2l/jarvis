import { memoryEngine } from '@/core/memory-engine'
import { identityEventLogger } from './event_logger'

export interface RelationshipState {
  userId: string
  interactionCount: number
  trustScore: number
  priorityScore: number
  promises: Array<{
    id: string
    text: string
    status: 'open' | 'completed' | 'broken'
    timestamp: number
  }>
  lastInteractionAt: number
}

const RELATIONSHIP_KEY = 'identity_relationship_state'

class RelationshipTracker {
  private state: RelationshipState = {
    userId: 'default-user',
    interactionCount: 0,
    trustScore: 0.7,
    priorityScore: 0.8,
    promises: [],
    lastInteractionAt: Date.now(),
  }
  private loaded = false

  async warmup(): Promise<void> {
    if (this.loaded) return
    await memoryEngine.loadMemories()
    const raw = memoryEngine.get(RELATIONSHIP_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as RelationshipState
        this.state = {
          ...this.state,
          ...parsed,
          promises: Array.isArray(parsed.promises) ? parsed.promises : [],
        }
      } catch {
        // keep defaults
      }
    }
    this.loaded = true
  }

  getState(): RelationshipState {
    return {
      ...this.state,
      promises: [...this.state.promises],
    }
  }

  async recordInteraction(userId: string): Promise<void> {
    await this.warmup()
    const interactionCount = this.state.interactionCount + 1
    const trustScore = Math.min(1, this.state.trustScore + 0.002)
    this.state = {
      ...this.state,
      userId,
      interactionCount,
      trustScore,
      lastInteractionAt: Date.now(),
    }
    await this.persist('Recorded user interaction')
  }

  async addPromise(text: string): Promise<string> {
    await this.warmup()
    const id = `promise_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    this.state.promises.push({
      id,
      text,
      status: 'open',
      timestamp: Date.now(),
    })
    await this.persist('Promise recorded')
    return id
  }

  async updatePromiseStatus(id: string, status: 'open' | 'completed' | 'broken'): Promise<void> {
    await this.warmup()
    this.state.promises = this.state.promises.map((promise) =>
      promise.id === id ? { ...promise, status } : promise,
    )

    if (status === 'completed') {
      this.state.trustScore = Math.min(1, this.state.trustScore + 0.03)
    }
    if (status === 'broken') {
      this.state.trustScore = Math.max(0, this.state.trustScore - 0.08)
    }

    await this.persist('Promise status updated')
  }

  async resolvePromiseFromTaskEvidence(
    taskId: string,
    evidence: string,
    status: 'completed' | 'broken',
  ): Promise<boolean> {
    await this.warmup()
    const normalizedEvidence = evidence.toLowerCase()
    const matched = this.state.promises.find((promise) => {
      if (promise.status !== 'open') return false
      if (promise.id === taskId) return true

      const normalizedPromise = promise.text.toLowerCase()
      return (
        normalizedEvidence.includes(normalizedPromise) ||
        normalizedPromise.includes(normalizedEvidence.slice(0, 48))
      )
    })

    if (!matched) return false
    await this.updatePromiseStatus(matched.id, status)
    return true
  }

  getOpenPromises(): RelationshipState['promises'] {
    return this.state.promises.filter((promise) => promise.status === 'open')
  }

  private async persist(summary: string): Promise<void> {
    await memoryEngine.rememberFact(RELATIONSHIP_KEY, JSON.stringify(this.state), 'fact')
    await identityEventLogger.log({
      eventType: 'promise_update',
      source: 'relationship-tracker',
      summary,
      impact: 'medium',
      payload: {
        userId: this.state.userId,
        trustScore: this.state.trustScore,
        openPromises: this.getOpenPromises().length,
      },
    })
  }
}

export const relationshipTracker = new RelationshipTracker()
