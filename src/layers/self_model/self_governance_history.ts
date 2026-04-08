import { clamp01 } from './self_state_schema'

export interface GovernanceHistoryEntry {
  id: string
  timestamp: number
  category: 'proposal' | 'canary' | 'promote' | 'rollback' | 'freeze' | 'unfreeze' | 'reject' | 'deploy'
  proposalId?: string
  summary: string
  confidence: number
  riskScore: number
  outcome: 'positive' | 'neutral' | 'negative'
  tags: string[]
}

export interface GovernanceHistorySnapshot {
  totalEvents: number
  proposalEvents: number
  canaryEvents: number
  promotionEvents: number
  rollbackEvents: number
  freezeEvents: number
  rejectionEvents: number
  deploymentEvents: number
  lastEventAt: number
  recentEvents: GovernanceHistoryEntry[]
  narrative: string
  version: number
}

export interface GovernanceHistoryInput {
  category: GovernanceHistoryEntry['category']
  proposalId?: string
  summary: string
  confidence: number
  riskScore: number
  outcome: GovernanceHistoryEntry['outcome']
  tags?: string[]
}

const STORAGE_KEY = 'patrich.self_model.governance_history.v1'
const MAX_HISTORY = 240

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

class SelfGovernanceHistory {
  private events: GovernanceHistoryEntry[] = []
  private version = 1

  constructor() {
    this.hydrate()
  }

  record(input: GovernanceHistoryInput): GovernanceHistoryEntry {
    const entry: GovernanceHistoryEntry = {
      id: makeId('gov_hist'),
      timestamp: Date.now(),
      category: input.category,
      proposalId: input.proposalId,
      summary: String(input.summary || '').slice(0, 240),
      confidence: clamp01(input.confidence),
      riskScore: clamp01(input.riskScore),
      outcome: input.outcome,
      tags: Array.isArray(input.tags) ? input.tags.slice(0, 8) : [],
    }

    this.events.unshift(entry)
    if (this.events.length > MAX_HISTORY) {
      this.events = this.events.slice(0, MAX_HISTORY)
    }

    this.version += 1
    this.persist()
    return entry
  }

  getSnapshot(): GovernanceHistorySnapshot {
    const recent = this.events.slice(0, 18)
    return {
      totalEvents: this.events.length,
      proposalEvents: this.events.filter((event) => event.category === 'proposal').length,
      canaryEvents: this.events.filter((event) => event.category === 'canary').length,
      promotionEvents: this.events.filter((event) => event.category === 'promote').length,
      rollbackEvents: this.events.filter((event) => event.category === 'rollback').length,
      freezeEvents: this.events.filter((event) => event.category === 'freeze' || event.category === 'unfreeze').length,
      rejectionEvents: this.events.filter((event) => event.category === 'reject').length,
      deploymentEvents: this.events.filter((event) => event.category === 'deploy').length,
      lastEventAt: this.events[0]?.timestamp ?? 0,
      recentEvents: recent,
      narrative: this.buildNarrative(recent),
      version: this.version,
    }
  }

  private buildNarrative(recent: GovernanceHistoryEntry[]): string {
    if (!recent.length) {
      return 'No governance history recorded yet.'
    }

    const top = recent[0]
    return [
      `events=${this.events.length}`,
      `latest=${top.category}:${top.summary}`,
      `positive=${this.events.filter((event) => event.outcome === 'positive').length}`,
      `negative=${this.events.filter((event) => event.outcome === 'negative').length}`,
    ].join(' ; ')
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          events: this.events,
          version: this.version,
        }),
      )
    } catch {
      // Ignore persistence failures.
    }
  }

  private hydrate(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<{ events: GovernanceHistoryEntry[]; version: number }>
      this.events = Array.isArray(parsed.events) ? parsed.events : []
      this.version = typeof parsed.version === 'number' ? parsed.version : 1
    } catch {
      this.events = []
      this.version = 1
    }
  }
}

export const selfGovernanceHistory = new SelfGovernanceHistory()
