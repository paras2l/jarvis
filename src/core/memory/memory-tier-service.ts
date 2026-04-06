import { db } from '../../lib/db'

export type MemoryTier = 'session' | 'relationship' | 'task' | 'preference' | 'value'

export type RetentionPolicy = 'discard' | 'summarize' | 'persist_7d' | 'persist_30d' | 'persistent'

export interface TieredMemoryRecord {
  key: string
  value: string
  tier: MemoryTier
  salience: number
  recency: number
  confidence: number
  source: 'chat' | 'system' | 'feedback'
  retentionPolicy: RetentionPolicy
  updatedAt: number
}

class MemoryTierService {
  private records = new Map<string, TieredMemoryRecord>()

  scoreSalience(input: string): number {
    const lower = input.toLowerCase()
    let score = 0.3
    if (lower.includes('important') || lower.includes('remember')) score += 0.35
    if (lower.includes('goal') || lower.includes('deadline')) score += 0.2
    if (lower.includes('never') || lower.includes('always')) score += 0.15
    return Math.min(1, score)
  }

  chooseTier(value: string, salience: number): MemoryTier {
    const lower = value.toLowerCase()
    if (/(prefer|like|dislike|favorite)/.test(lower)) return 'preference'
    if (/(goal|task|deadline|plan|todo)/.test(lower)) return 'task'
    if (/(trust|loyal|value|never|always)/.test(lower)) return 'value'
    if (salience >= 0.7) return 'relationship'
    return 'session'
  }

  chooseRetentionPolicy(tier: MemoryTier, salience: number): RetentionPolicy {
    if (tier === 'value' || tier === 'relationship') return 'persistent'
    if (tier === 'preference') return 'persist_30d'
    if (tier === 'task') return salience > 0.75 ? 'persist_30d' : 'persist_7d'
    return salience < 0.35 ? 'discard' : 'summarize'
  }

  async remember(
    key: string,
    value: string,
    source: TieredMemoryRecord['source'] = 'chat',
  ): Promise<TieredMemoryRecord> {
    const salience = this.scoreSalience(value)
    const tier = this.chooseTier(value, salience)
    const retentionPolicy = this.chooseRetentionPolicy(tier, salience)

    const record: TieredMemoryRecord = {
      key,
      value,
      tier,
      salience,
      recency: Date.now(),
      confidence: 0.85,
      source,
      retentionPolicy,
      updatedAt: Date.now(),
    }

    if (retentionPolicy === 'discard') {
      return record
    }

    this.records.set(key, record)
    await db.memory.upsert({
      key,
      value,
      memory_type: tier === 'value' ? 'goal' : tier === 'preference' ? 'preference' : 'fact',
      confidence: record.confidence,
    }).catch(() => {})

    return record
  }

  get(key: string): TieredMemoryRecord | undefined {
    return this.records.get(key)
  }

  listByTier(tier: MemoryTier): TieredMemoryRecord[] {
    return Array.from(this.records.values()).filter((r) => r.tier === tier)
  }
}

export const memoryTierService = new MemoryTierService()
