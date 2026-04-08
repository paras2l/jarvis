import { clamp01 } from './self_state_schema'
import type { ReflectionPolicyUpdate } from './self_reflection_engine'
import type { ReflectionSimulationSummary } from './self_reflection_simulator'

export interface ReflectionPolicyControllerSnapshot {
  autonomyLevel: 'guarded' | 'balanced' | 'assertive'
  pending: ReflectionPolicyUpdate[]
  applied: ReflectionPolicyUpdate[]
  rejected: ReflectionPolicyUpdate[]
  rollbackCount: number
  governanceScore: number
  narrative: string
  updatedAt: number
  version: number
}

export interface ReflectionPolicyDecision {
  update: ReflectionPolicyUpdate
  approved: boolean
  reason: string
}

const MAX_UPDATES = 80

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export class SelfReflectionPolicyController {
  private autonomyLevel: ReflectionPolicyControllerSnapshot['autonomyLevel'] = 'balanced'
  private pending: ReflectionPolicyUpdate[] = []
  private applied: ReflectionPolicyUpdate[] = []
  private rejected: ReflectionPolicyUpdate[] = []
  private rollbackCount = 0
  private version = 1

  queue(update: ReflectionPolicyUpdate): void {
    this.pending.unshift({ ...update, status: 'pending' })
    this.trim()
  }

  queueBulk(updates: ReflectionPolicyUpdate[]): void {
    updates.forEach((update) => this.queue(update))
  }

  adoptSimulationRecommendations(summary: ReflectionSimulationSummary): void {
    this.queue({
      id: makeId('refl_policy_sim'),
      timestamp: Date.now(),
      status: 'pending',
      reason: `simulation recommendation (${summary.runId})`,
      minConfidence: summary.recommended.minConfidence,
      maxRisk: summary.recommended.maxRisk,
      clarifyBiasDelta: summary.recommended.clarifyBias,
    })
  }

  evaluatePending(context: {
    successTrend: number
    riskTrend: number
    alignmentTrend: number
    confidenceTrend: number
  }): ReflectionPolicyDecision[] {
    const decisions: ReflectionPolicyDecision[] = []

    const promoteLimit = this.autonomyLevel === 'assertive' ? 4 : this.autonomyLevel === 'balanced' ? 2 : 1
    let promoted = 0

    const remaining: ReflectionPolicyUpdate[] = []
    for (const update of this.pending) {
      const decision = this.evaluateSingle(update, context)
      decisions.push(decision)

      if (decision.approved && promoted < promoteLimit) {
        promoted += 1
        this.applied.unshift({ ...update, status: 'applied' })
      } else if (!decision.approved) {
        this.rejected.unshift({ ...update, status: 'rejected' })
      } else {
        remaining.push(update)
      }
    }

    this.pending = remaining
    this.adjustAutonomy(context)
    this.version += 1
    this.trim()
    return decisions
  }

  rollbackLast(reason: string): ReflectionPolicyUpdate | undefined {
    const last = this.applied.shift()
    if (!last) return undefined

    const rolledBack: ReflectionPolicyUpdate = {
      ...last,
      id: makeId('refl_policy_rollback'),
      timestamp: Date.now(),
      status: 'rejected',
      reason: `rollback: ${reason}`,
    }

    this.rejected.unshift(rolledBack)
    this.rollbackCount += 1
    this.version += 1
    this.trim()
    return rolledBack
  }

  getSnapshot(): ReflectionPolicyControllerSnapshot {
    return {
      autonomyLevel: this.autonomyLevel,
      pending: [...this.pending.slice(0, 20)],
      applied: [...this.applied.slice(0, 20)],
      rejected: [...this.rejected.slice(0, 20)],
      rollbackCount: this.rollbackCount,
      governanceScore: this.computeGovernanceScore(),
      narrative: this.buildNarrative(),
      updatedAt: Date.now(),
      version: this.version,
    }
  }

  private evaluateSingle(
    update: ReflectionPolicyUpdate,
    context: {
      successTrend: number
      riskTrend: number
      alignmentTrend: number
      confidenceTrend: number
    },
  ): ReflectionPolicyDecision {
    const minConfidence = update.minConfidence ?? 0.6
    const maxRisk = update.maxRisk ?? 0.78
    const clarifyBias = update.clarifyBiasDelta ?? 0.25

    const tooStrict = minConfidence > 0.9 || maxRisk < 0.35 || clarifyBias > 0.85
    if (tooStrict) {
      return {
        update,
        approved: false,
        reason: 'Rejected: parameters too strict and likely to stall runtime.',
      }
    }

    const tooLoose = minConfidence < 0.45 || maxRisk > 0.95
    if (tooLoose) {
      return {
        update,
        approved: false,
        reason: 'Rejected: parameters too permissive for safe operation.',
      }
    }

    const contextRisk = context.riskTrend
    const contextSuccess = context.successTrend
    const contextAlignment = context.alignmentTrend

    const score =
      (1 - contextRisk) * 0.3 +
      contextSuccess * 0.35 +
      contextAlignment * 0.25 +
      context.confidenceTrend * 0.1

    const updateIntent =
      (clamp01(minConfidence) * 0.3) +
      (clamp01(1 - maxRisk) * 0.35) +
      (clamp01(clarifyBias) * 0.35)

    const approved = Math.abs(score - updateIntent) < 0.35 || score < 0.58
    return {
      update,
      approved,
      reason: approved
        ? `Approved: context-score=${score.toFixed(2)} update-intent=${updateIntent.toFixed(2)}`
        : `Rejected: update intent diverges from context (score=${score.toFixed(2)} intent=${updateIntent.toFixed(2)})`,
    }
  }

  private adjustAutonomy(context: {
    successTrend: number
    riskTrend: number
    alignmentTrend: number
    confidenceTrend: number
  }): void {
    const stability =
      context.successTrend * 0.4 +
      (1 - context.riskTrend) * 0.25 +
      context.alignmentTrend * 0.25 +
      context.confidenceTrend * 0.1

    if (stability > 0.82) {
      this.autonomyLevel = 'assertive'
      return
    }

    if (stability < 0.62 || this.rollbackCount > 3) {
      this.autonomyLevel = 'guarded'
      return
    }

    this.autonomyLevel = 'balanced'
  }

  private computeGovernanceScore(): number {
    const applied = this.applied.length
    const rejected = this.rejected.length
    const total = Math.max(1, applied + rejected)
    const acceptance = applied / total
    const rollbackPenalty = Math.min(0.35, this.rollbackCount * 0.07)
    return clamp01(acceptance * 0.7 + (1 - rollbackPenalty) * 0.3)
  }

  private buildNarrative(): string {
    const topPending = this.pending[0]?.reason || 'none'
    const topApplied = this.applied[0]?.reason || 'none'
    const topRejected = this.rejected[0]?.reason || 'none'

    return [
      `autonomy=${this.autonomyLevel}`,
      `pending=${this.pending.length}`,
      `applied=${this.applied.length}`,
      `rejected=${this.rejected.length}`,
      `rollbacks=${this.rollbackCount}`,
      `pending_top=${topPending}`,
      `applied_top=${topApplied}`,
      `rejected_top=${topRejected}`,
    ].join(' ; ')
  }

  private trim(): void {
    if (this.pending.length > MAX_UPDATES) this.pending = this.pending.slice(0, MAX_UPDATES)
    if (this.applied.length > MAX_UPDATES) this.applied = this.applied.slice(0, MAX_UPDATES)
    if (this.rejected.length > MAX_UPDATES) this.rejected = this.rejected.slice(0, MAX_UPDATES)
  }
}

export const selfReflectionPolicyController = new SelfReflectionPolicyController()
