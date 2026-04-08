import { MemoryAccessContext, WorkingMemoryItem } from './types'

export class WorkingMemory {
  private items = new Map<string, WorkingMemoryItem>()

  put(
    key: string,
    value: unknown,
    options: { confidence?: number; tags?: string[]; ttlMs?: number } = {},
  ): WorkingMemoryItem {
    const now = Date.now()
    const existing = this.items.get(key)
    const item: WorkingMemoryItem = {
      id: existing?.id ?? `wm_${now}_${Math.random().toString(36).slice(2, 8)}`,
      key,
      value,
      confidence: options.confidence ?? existing?.confidence ?? 0.6,
      tags: options.tags ?? existing?.tags ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      expiresAt: options.ttlMs ? now + options.ttlMs : existing?.expiresAt,
      accessCount: existing?.accessCount ?? 0,
    }

    this.items.set(key, item)
    return item
  }

  get(key: string): WorkingMemoryItem | undefined {
    const item = this.items.get(key)
    if (!item) {
      return undefined
    }

    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.items.delete(key)
      return undefined
    }

    item.accessCount += 1
    item.updatedAt = Date.now()
    return item
  }

  remove(key: string): boolean {
    return this.items.delete(key)
  }

  list(limit = 100): WorkingMemoryItem[] {
    return Array.from(this.items.values())
      .filter((item) => !item.expiresAt || item.expiresAt >= Date.now())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
  }

  query(context: MemoryAccessContext, limit = 20): WorkingMemoryItem[] {
    const tags = context.tags ?? []
    const bias = context.recencyBias ?? 0.6

    return this.list(500)
      .map((item) => {
        const tagScore = tags.length === 0 ? 0.5 : tags.filter((t) => item.tags.includes(t)).length / tags.length
        const recencyScore = Math.max(0, 1 - (Date.now() - item.updatedAt) / (1000 * 60 * 60))
        const relevance = tagScore * (1 - bias) + recencyScore * bias
        return { item, relevance }
      })
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit)
      .map((x) => x.item)
  }

  decayExpired(): number {
    let removed = 0
    const now = Date.now()
    for (const [key, item] of this.items.entries()) {
      if (item.expiresAt && item.expiresAt < now) {
        this.items.delete(key)
        removed += 1
      }
    }
    return removed
  }

  getAverageConfidence(): number {
    const values = this.list(1000)
    if (values.length === 0) {
      return 0.5
    }
    return values.reduce((sum, item) => sum + item.confidence, 0) / values.length
  }
}

export const workingMemory = new WorkingMemory()
