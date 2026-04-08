import { AliasMapping, SemanticFact } from './types'

export class SemanticMemory {
  private facts = new Map<string, SemanticFact>()
  private aliases = new Map<string, AliasMapping>()

  upsertFact(
    subject: string,
    predicate: string,
    object: string,
    options: { confidence?: number; aliases?: string[]; source?: string; tags?: string[] } = {},
  ): SemanticFact {
    const key = `${subject}:${predicate}:${object}`.toLowerCase()
    const now = Date.now()
    const existing = this.facts.get(key)

    const fact: SemanticFact = {
      factId: existing?.factId ?? `sf_${now}_${Math.random().toString(36).slice(2, 8)}`,
      subject,
      predicate,
      object,
      confidence: options.confidence ?? existing?.confidence ?? 0.7,
      aliases: options.aliases ?? existing?.aliases,
      source: options.source ?? existing?.source,
      tags: options.tags ?? existing?.tags ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastValidatedAt: now,
    }

    this.facts.set(key, fact)
    return fact
  }

  findFacts(query: string, limit = 50): SemanticFact[] {
    const q = query.toLowerCase()
    return Array.from(this.facts.values())
      .filter((fact) => {
        return (
          fact.subject.toLowerCase().includes(q) ||
          fact.predicate.toLowerCase().includes(q) ||
          fact.object.toLowerCase().includes(q) ||
          (fact.aliases ?? []).some((alias) => alias.toLowerCase().includes(q))
        )
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
  }

  mapAlias(alias: string, canonical: string, category: AliasMapping['category'], confidence = 0.8): AliasMapping {
    const key = alias.trim().toLowerCase()
    const now = Date.now()
    const mapping: AliasMapping = {
      alias,
      canonical,
      category,
      confidence,
      createdAt: this.aliases.get(key)?.createdAt ?? now,
      updatedAt: now,
    }

    this.aliases.set(key, mapping)
    return mapping
  }

  resolveAlias(aliasOrName: string): string {
    const key = aliasOrName.trim().toLowerCase()
    return this.aliases.get(key)?.canonical ?? aliasOrName
  }

  getAliasMappings(limit = 100): AliasMapping[] {
    return Array.from(this.aliases.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
  }

  invalidateStaleFacts(validationWindowMs: number): number {
    const now = Date.now()
    let downgraded = 0

    for (const fact of this.facts.values()) {
      if (fact.lastValidatedAt && now - fact.lastValidatedAt > validationWindowMs) {
        fact.confidence = Math.max(0.1, fact.confidence - 0.1)
        fact.updatedAt = now
        downgraded += 1
      }
    }

    return downgraded
  }

  size(): number {
    return this.facts.size
  }
}

export const semanticMemory = new SemanticMemory()
