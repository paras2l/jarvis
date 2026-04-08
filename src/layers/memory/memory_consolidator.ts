import { episodicMemory } from './episodic_memory'
import { proceduralMemory } from './procedural_memory'
import { semanticMemory } from './semantic_memory'
import { workingMemory } from './working_memory'
import { ConsolidationResult, MemoryDecayPolicy } from './types'

export class MemoryConsolidator {
  private readonly policy: MemoryDecayPolicy = {
    workingTtlMs: 1000 * 60 * 30,
    episodicRetentionMs: 1000 * 60 * 60 * 24 * 14,
    semanticValidationMs: 1000 * 60 * 60 * 24 * 7,
    minConfidenceToPersist: 0.65,
    proceduralMinReliability: 0.35,
  }

  consolidate(): ConsolidationResult {
    const now = Date.now()
    const workingItems = workingMemory.list(500)

    let episodicEventsCreated = 0
    let semanticFactsCreated = 0
    let proceduresUpdated = 0
    let consolidatedWorkingItems = 0

    for (const item of workingItems) {
      if (item.confidence < this.policy.minConfidenceToPersist) {
        continue
      }

      episodicMemory.recordEvent({
        eventType: 'working_memory_consolidated',
        timestamp: now,
        context: { key: item.key, value: item.value },
        tags: [...item.tags, 'consolidated'],
        importance: Math.min(1, item.confidence),
      })
      episodicEventsCreated += 1

      if (typeof item.value === 'string' || typeof item.value === 'number' || typeof item.value === 'boolean') {
        semanticMemory.upsertFact(item.key, 'has_value', String(item.value), {
          confidence: item.confidence,
          source: 'memory_consolidator',
          tags: item.tags,
        })
        semanticFactsCreated += 1
      }

      if (item.tags.includes('procedure_feedback') && typeof item.value === 'string') {
        const match = proceduralMemory.findByIntent(item.value, 1)[0]
        if (match) {
          proceduralMemory.adaptProcedure(match.procedureId, { appendTag: 'refined_from_feedback', reliabilityDelta: 0.02 })
          proceduresUpdated += 1
        }
      }

      consolidatedWorkingItems += 1
    }

    const decayedWorkingItems = workingMemory.decayExpired()
    const decayedEpisodes = episodicMemory.decayOlderThan(this.policy.episodicRetentionMs)
    semanticMemory.invalidateStaleFacts(this.policy.semanticValidationMs)
    proceduralMemory.pruneLowReliability(this.policy.proceduralMinReliability)

    return {
      consolidatedWorkingItems,
      episodicEventsCreated,
      semanticFactsCreated,
      proceduresUpdated,
      decayedWorkingItems,
      decayedEpisodes,
      timestamp: now,
    }
  }

  getPolicy(): MemoryDecayPolicy {
    return { ...this.policy }
  }
}

export const memoryConsolidator = new MemoryConsolidator()
