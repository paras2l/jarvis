import { eventPublisher } from '../../event_system/event_publisher'
import { episodicMemory } from './episodic_memory'
import { memoryConsolidator } from './memory_consolidator'
import { proceduralMemory } from './procedural_memory'
import { semanticMemory } from './semantic_memory'
import { workingMemory } from './working_memory'
import { MemoryAccessContext, MemoryQuery, MemorySearchResult, MultiTimescaleMemorySnapshot, ProcedureStep } from './types'

export class MemoryManager {
  putWorking(
    key: string,
    value: unknown,
    options: { confidence?: number; tags?: string[]; ttlMs?: number } = {},
  ) {
    const item = workingMemory.put(key, value, options)
    void eventPublisher.memoryRecorded({
      key,
      scope: 'short_term',
      source: 'layer9-memory-manager',
      tags: item.tags,
    })
    return item
  }

  recallWorking(key: string) {
    const item = workingMemory.get(key)
    void eventPublisher.memoryRecalled({
      key,
      hit: Boolean(item),
      scope: 'short_term',
    })
    return item
  }

  recordEpisode(eventType: string, context: Record<string, unknown>, options: { actionId?: string; tags?: string[]; importance?: number; success?: boolean; summary?: string } = {}) {
    const entry = episodicMemory.recordEvent({
      eventType,
      actionId: options.actionId,
      timestamp: Date.now(),
      context,
      outcome: typeof options.success === 'boolean' ? { success: options.success, summary: options.summary ?? eventType } : undefined,
      tags: options.tags ?? [],
      importance: options.importance ?? 0.5,
    })

    void eventPublisher.memoryRecorded({
      key: entry.eventId,
      scope: 'long_term',
      source: 'layer9-memory-manager',
      tags: entry.tags,
    })

    return entry
  }

  addSemanticFact(subject: string, predicate: string, object: string, tags: string[] = [], confidence = 0.75) {
    const fact = semanticMemory.upsertFact(subject, predicate, object, {
      tags,
      confidence,
      source: 'layer9-memory-manager',
    })

    void eventPublisher.memoryRecorded({
      key: `${subject}:${predicate}`,
      scope: 'semantic',
      source: 'layer9-memory-manager',
      tags,
    })

    return fact
  }

  addAlias(alias: string, canonical: string, category: 'app' | 'command' | 'entity' | 'term' = 'term', confidence = 0.85) {
    return semanticMemory.mapAlias(alias, canonical, category, confidence)
  }

  resolveAlias(input: string): string {
    return semanticMemory.resolveAlias(input)
  }

  saveProcedure(
    procedureId: string,
    name: string,
    description: string,
    triggerHints: string[],
    steps: ProcedureStep[],
    tags: string[] = [],
    reliability = 0.7,
  ) {
    return proceduralMemory.upsertProcedure({
      procedureId,
      name,
      description,
      triggerHints,
      steps,
      tags,
      reliability,
    })
  }

  queryAcrossTimescales(query: MemoryQuery, context: MemoryAccessContext = {}): MemorySearchResult[] {
    const requested = query.timescales ?? ['working', 'episodic', 'semantic', 'procedural']
    const minConfidence = query.minConfidence ?? 0
    const limit = query.limit ?? 25
    const terms = (query.queryText ?? '').toLowerCase()
    const results: MemorySearchResult[] = []

    if (requested.includes('working')) {
      const items = workingMemory.query({ ...context, tags: query.tags }, 200)
      for (const item of items) {
        if (item.confidence < minConfidence) {
          continue
        }
        const text = `${item.key} ${String(item.value)}`.toLowerCase()
        const relevance = terms ? (text.includes(terms) ? 0.9 : 0.3) : 0.6
        results.push({
          timescale: 'working',
          id: item.id,
          relevance,
          summary: `${item.key}=${String(item.value).slice(0, 80)}`,
          payload: item,
        })
      }
    }

    if (requested.includes('episodic')) {
      const episodes = query.tags ? episodicMemory.queryByTags(query.tags, 500) : episodicMemory.recent(500)
      for (const event of episodes) {
        if (event.importance < minConfidence) {
          continue
        }
        const text = `${event.eventType} ${JSON.stringify(event.context)}`.toLowerCase()
        const relevance = terms ? (text.includes(terms) ? 0.85 : 0.25) : 0.55
        results.push({
          timescale: 'episodic',
          id: event.eventId,
          relevance,
          summary: `${event.eventType} (${new Date(event.timestamp).toISOString()})`,
          payload: event,
        })
      }
    }

    if (requested.includes('semantic')) {
      const facts = terms ? semanticMemory.findFacts(terms, 500) : semanticMemory.findFacts('', 500)
      for (const fact of facts) {
        if (fact.confidence < minConfidence) {
          continue
        }
        const relevance = terms
          ? `${fact.subject} ${fact.predicate} ${fact.object}`.toLowerCase().includes(terms)
            ? 0.95
            : 0.2
          : 0.65

        results.push({
          timescale: 'semantic',
          id: fact.factId,
          relevance,
          summary: `${fact.subject} ${fact.predicate} ${fact.object}`,
          payload: fact,
        })
      }
    }

    if (requested.includes('procedural')) {
      const procedures = proceduralMemory.findByIntent(terms || context.intent || '', 300)
      for (const procedure of procedures) {
        if (procedure.reliability < minConfidence) {
          continue
        }
        const relevance = terms
          ? `${procedure.name} ${procedure.description}`.toLowerCase().includes(terms)
            ? 0.92
            : 0.3
          : 0.58

        results.push({
          timescale: 'procedural',
          id: procedure.procedureId,
          relevance,
          summary: `${procedure.name} (${procedure.steps.length} steps)`,
          payload: procedure,
        })
      }
    }

    return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit)
  }

  runConsolidationCycle() {
    return memoryConsolidator.consolidate()
  }

  getSnapshot(): MultiTimescaleMemorySnapshot {
    const aliases = semanticMemory.getAliasMappings(20)

    return {
      timestamp: Date.now(),
      workingCount: workingMemory.list(5000).length,
      episodicCount: episodicMemory.size(),
      semanticCount: semanticMemory.size(),
      proceduralCount: proceduralMemory.size(),
      topAliases: aliases,
      health: {
        averageWorkingConfidence: workingMemory.getAverageConfidence(),
        episodicSuccessRate: episodicMemory.getSuccessRate(300),
        semanticValidationCoverage: Math.min(1, semanticMemory.size() > 0 ? aliases.length / Math.max(1, semanticMemory.size()) : 1),
        proceduralReliability: proceduralMemory.getAverageReliability(),
      },
    }
  }
}

export const memoryManager = new MemoryManager()
