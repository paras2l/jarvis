import { ProcedureTemplate } from './types'

export class ProceduralMemory {
  private procedures = new Map<string, ProcedureTemplate>()

  upsertProcedure(
    input: Omit<ProcedureTemplate, 'createdAt' | 'updatedAt' | 'usageCount' | 'successCount' | 'failureCount'>,
  ): ProcedureTemplate {
    const now = Date.now()
    const existing = this.procedures.get(input.procedureId)

    const merged: ProcedureTemplate = {
      ...input,
      usageCount: existing?.usageCount ?? 0,
      successCount: existing?.successCount ?? 0,
      failureCount: existing?.failureCount ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    this.procedures.set(merged.procedureId, merged)
    return merged
  }

  getProcedure(procedureId: string): ProcedureTemplate | undefined {
    return this.procedures.get(procedureId)
  }

  findByIntent(intent: string, limit = 20): ProcedureTemplate[] {
    const q = intent.toLowerCase()
    return Array.from(this.procedures.values())
      .filter((procedure) => {
        const inName = procedure.name.toLowerCase().includes(q)
        const inDescription = procedure.description.toLowerCase().includes(q)
        const inHints = procedure.triggerHints.some((hint) => hint.toLowerCase().includes(q))
        const inTags = procedure.tags.some((tag) => tag.toLowerCase().includes(q))
        return inName || inDescription || inHints || inTags
      })
      .sort((a, b) => b.reliability - a.reliability)
      .slice(0, limit)
  }

  recordExecution(procedureId: string, success: boolean): ProcedureTemplate | undefined {
    const procedure = this.procedures.get(procedureId)
    if (!procedure) {
      return undefined
    }

    procedure.usageCount += 1
    if (success) {
      procedure.successCount += 1
    } else {
      procedure.failureCount += 1
    }

    const rate = procedure.successCount / Math.max(1, procedure.usageCount)
    procedure.reliability = 0.7 * procedure.reliability + 0.3 * rate
    procedure.updatedAt = Date.now()

    return procedure
  }

  adaptProcedure(
    procedureId: string,
    options: { promoteTriggerHint?: string; appendTag?: string; reliabilityDelta?: number },
  ): ProcedureTemplate | undefined {
    const procedure = this.procedures.get(procedureId)
    if (!procedure) {
      return undefined
    }

    if (options.promoteTriggerHint && !procedure.triggerHints.includes(options.promoteTriggerHint)) {
      procedure.triggerHints.push(options.promoteTriggerHint)
    }

    if (options.appendTag && !procedure.tags.includes(options.appendTag)) {
      procedure.tags.push(options.appendTag)
    }

    if (typeof options.reliabilityDelta === 'number') {
      procedure.reliability = Math.max(0, Math.min(1, procedure.reliability + options.reliabilityDelta))
    }

    procedure.updatedAt = Date.now()
    return procedure
  }

  pruneLowReliability(minReliability: number): number {
    let removed = 0
    for (const [id, procedure] of this.procedures.entries()) {
      if (procedure.reliability < minReliability && procedure.usageCount >= 3) {
        this.procedures.delete(id)
        removed += 1
      }
    }
    return removed
  }

  list(limit = 200): ProcedureTemplate[] {
    return Array.from(this.procedures.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
  }

  getAverageReliability(): number {
    const values = Array.from(this.procedures.values())
    if (values.length === 0) {
      return 0.5
    }
    return values.reduce((sum, p) => sum + p.reliability, 0) / values.length
  }

  size(): number {
    return this.procedures.size
  }
}

export const proceduralMemory = new ProceduralMemory()
