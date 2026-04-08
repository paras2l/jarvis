import { clamp01 } from './self_state_schema'
import { selfGovernanceDeployment } from './self_governance_deployment'
import { selfGovernanceHistory } from './self_governance_history'

export interface GovernanceGateInput {
  taskType: string
  command: string
  confidence: number
  riskScore: number
  sensitive: boolean
  goalAlignmentScore: number
  goalDriftScore: number
  reflectionMinConfidence: number
  reflectionMaxRisk: number
  simulationConfidence: number
  policyGovernanceScore: number
}

export interface GovernanceGateDecision {
  decision: 'allow' | 'clarify' | 'defer' | 'block'
  reason: string
  adjustedConfidenceFloor: number
  adjustedRiskCap: number
  requireApproval: boolean
  cooldownMs: number
  freezeActive: boolean
  tags: string[]
}

export interface GovernanceOutcomeInput {
  taskType: string
  command: string
  success: boolean
  reason: string
  durationMs: number
  riskScore: number
  confidence: number
  sensitive: boolean
}

interface GovernanceOutcomeRecord extends GovernanceOutcomeInput {
  id: string
  timestamp: number
}

export interface GovernanceSyncInput {
  successTrend: number
  riskTrend: number
  confidenceTrend: number
  alignmentTrend: number
  guardrailMinConfidence: number
  guardrailMaxRisk: number
  simulationConfidence: number
  policyGovernanceScore: number
  pendingPolicyUpdates: number
}

export interface GovernanceSnapshot {
  freezeMode: 'off' | 'monitor' | 'engaged'
  freezeReason: string
  autonomyMode: 'supervised' | 'hybrid' | 'autonomous'
  readinessScore: number
  deploymentScore: number
  rollbackPressure: number
  approvalQueueSize: number
  blockedCount: number
  deferredCount: number
  clarificationCount: number
  appliedCount: number
  recentRollbacks: string[]
  deployment: {
    activeProposalId?: string
    activeVersion: number
    rolloutState: 'idle' | 'canary' | 'staged' | 'promoted' | 'rollback'
    rolloutPressure: number
    proposalCount: number
    recordCount: number
    canaryApprovalRate: number
    canarySafetyScore: number
    deploymentNarrative: string
    history: {
      totalEvents: number
      recentEvents: string[]
      narrative: string
    }
  }
  strategyNarrative: string
  updatedAt: number
  version: number
}

const STORAGE_KEY = 'patrich.self_model.governance_engine.v1'
const MAX_OUTCOMES = 160
const MAX_ROLLBACK_NOTES = 12

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

class SelfGovernanceEngine {
  private outcomes: GovernanceOutcomeRecord[] = []
  private freezeMode: GovernanceSnapshot['freezeMode'] = 'monitor'
  private freezeReason = 'Governance monitor active.'
  private autonomyMode: GovernanceSnapshot['autonomyMode'] = 'hybrid'
  private readinessScore = 0.74
  private deploymentScore = 0.72
  private rollbackPressure = 0.22
  private approvalQueueSize = 0
  private blockedCount = 0
  private deferredCount = 0
  private clarificationCount = 0
  private appliedCount = 0
  private recentRollbacks: string[] = []
  private latestDeploymentSnapshot = selfGovernanceDeployment.getSnapshot()
  private deploymentNarrative = 'Deployment pipeline ready.'
  private strategyNarrative = 'Governance calibration warming up.'
  private version = 1

  constructor() {
    this.hydrate()
  }

  evaluateGate(input: GovernanceGateInput): GovernanceGateDecision {
    const confidenceFloor = clamp01(
      Math.max(
        input.reflectionMinConfidence,
        0.58 + (1 - input.simulationConfidence) * 0.18 + input.goalDriftScore * 0.12,
      ),
    )

    const riskCap = clamp01(
      Math.min(
        input.reflectionMaxRisk,
        0.9 - input.riskScore * 0.08 - (1 - input.policyGovernanceScore) * 0.2,
      ),
    )

    const freezeSensitive = this.freezeMode === 'engaged' && input.sensitive
    const weakGovernance = input.policyGovernanceScore < 0.5
    const lowReadiness = this.readinessScore < 0.45

    const shouldBlock =
      freezeSensitive ||
      (input.sensitive && (input.confidence < confidenceFloor || input.riskScore > riskCap)) ||
      (weakGovernance && input.riskScore > 0.72 && input.goalAlignmentScore < 0.6)

    const shouldDefer =
      !shouldBlock &&
      (this.freezeMode === 'engaged' ||
        lowReadiness ||
        (input.riskScore > riskCap + 0.08 && input.confidence < confidenceFloor + 0.05))

    const shouldClarify =
      !shouldBlock &&
      !shouldDefer &&
      (input.confidence < confidenceFloor ||
        input.goalDriftScore > 0.64 ||
        (input.sensitive && input.policyGovernanceScore < 0.65))

    const decision: GovernanceGateDecision['decision'] = shouldBlock
      ? 'block'
      : shouldDefer
        ? 'defer'
        : shouldClarify
          ? 'clarify'
          : 'allow'

    if (decision === 'block') this.blockedCount += 1
    if (decision === 'defer') this.deferredCount += 1
    if (decision === 'clarify') this.clarificationCount += 1
    if (decision === 'allow') this.appliedCount += 1

    const deploymentSnapshot = selfGovernanceDeployment.evaluate({
      recentOutcomes: this.outcomes.slice(0, 24).map((outcome) => ({
        command: outcome.command,
        confidence: outcome.confidence,
        riskScore: outcome.riskScore,
        sensitive: outcome.sensitive,
        goalAlignmentScore: outcome.sensitive ? 0.52 : 0.7,
        goalDriftScore: outcome.sensitive ? 0.58 : 0.28,
        success: outcome.success,
        decision: decision,
      })),
      readinessScore: this.readinessScore,
      deploymentScore: this.deploymentScore,
      rollbackPressure: this.rollbackPressure,
    })

    this.latestDeploymentSnapshot = deploymentSnapshot
    this.deploymentNarrative = deploymentSnapshot.deploymentNarrative
    if (deploymentSnapshot.rolloutState === 'rollback' && deploymentSnapshot.records[0]) {
      this.appendRollback(deploymentSnapshot.records[0].summary)
    }

    this.version += 1
    this.persist()

    return {
      decision,
      reason: [
        `decision=${decision}`,
        `freeze=${this.freezeMode}`,
        `readiness=${this.readinessScore.toFixed(2)}`,
        `deployment=${this.deploymentScore.toFixed(2)}`,
        `rollback=${this.rollbackPressure.toFixed(2)}`,
        `governance=${input.policyGovernanceScore.toFixed(2)}`,
      ].join(', '),
      adjustedConfidenceFloor: confidenceFloor,
      adjustedRiskCap: riskCap,
      requireApproval: input.sensitive || decision !== 'allow' || this.autonomyMode === 'supervised',
      cooldownMs: decision === 'defer' ? 60_000 : decision === 'clarify' ? 15_000 : 0,
      freezeActive: this.freezeMode === 'engaged',
      tags: [input.taskType, decision, this.autonomyMode, this.freezeMode],
    }
  }

  recordOutcome(input: GovernanceOutcomeInput): void {
    const normalized: GovernanceOutcomeRecord = {
      ...input,
      id: makeId('gov_outcome'),
      timestamp: Date.now(),
      confidence: clamp01(input.confidence),
      riskScore: clamp01(input.riskScore),
      durationMs: Math.max(0, input.durationMs),
      reason: String(input.reason || '').slice(0, 220),
    }

    this.outcomes.unshift(normalized)
    if (this.outcomes.length > MAX_OUTCOMES) {
      this.outcomes = this.outcomes.slice(0, MAX_OUTCOMES)
    }

    const recent = this.outcomes.slice(0, 30)
    const failures = recent.filter((item) => !item.success)
    const severeFailures = failures.filter((item) => item.riskScore > 0.72 || item.sensitive)
    const failureRate = failures.length / Math.max(1, recent.length)

    this.rollbackPressure = clamp01(
      failureRate * 0.5 + (severeFailures.length / Math.max(1, recent.length)) * 0.4 + (1 - this.readinessScore) * 0.1,
    )

    this.readinessScore = clamp01(
      this.readinessScore * 0.55 +
        (1 - failureRate) * 0.25 +
        (1 - this.rollbackPressure) * 0.2,
    )

    this.deploymentScore = clamp01(
      this.deploymentScore * 0.6 +
        this.readinessScore * 0.25 +
        (1 - this.rollbackPressure) * 0.15,
    )

    if (severeFailures.length >= 4 || this.rollbackPressure > 0.76) {
      this.freezeMode = 'engaged'
      this.autonomyMode = 'supervised'
      this.freezeReason = 'Freeze engaged due to repeated severe failures and rollback pressure.'
      this.appendRollback(`Auto-freeze: severe_failures=${severeFailures.length} rollback=${this.rollbackPressure.toFixed(2)}`)
    } else if (failureRate > 0.35 || this.rollbackPressure > 0.62) {
      this.freezeMode = 'monitor'
      this.autonomyMode = 'hybrid'
      this.freezeReason = 'Monitor mode due to elevated failure pressure.'
    } else {
      this.freezeMode = 'off'
      this.autonomyMode = this.readinessScore > 0.78 ? 'autonomous' : 'hybrid'
      this.freezeReason = 'No active freeze. Governance allows normal operation.'
    }

    this.strategyNarrative = this.buildNarrative()
    this.version += 1
    this.persist()
  }

  syncFromReflection(input: GovernanceSyncInput): void {
    this.approvalQueueSize = Math.max(0, input.pendingPolicyUpdates)

    const trendReadiness = clamp01(
      input.successTrend * 0.35 +
        (1 - input.riskTrend) * 0.25 +
        input.confidenceTrend * 0.2 +
        input.alignmentTrend * 0.2,
    )

    const deploymentFromSignals = clamp01(
      input.policyGovernanceScore * 0.45 + input.simulationConfidence * 0.35 + (1 - this.rollbackPressure) * 0.2,
    )

    this.readinessScore = clamp01(this.readinessScore * 0.5 + trendReadiness * 0.5)
    this.deploymentScore = clamp01(this.deploymentScore * 0.45 + deploymentFromSignals * 0.55)

    if (input.guardrailMinConfidence > 0.76 && input.guardrailMaxRisk < 0.6) {
      this.autonomyMode = 'supervised'
    } else if (this.readinessScore > 0.8 && this.rollbackPressure < 0.3) {
      this.autonomyMode = 'autonomous'
    } else {
      this.autonomyMode = 'hybrid'
    }

    this.strategyNarrative = this.buildNarrative()
    this.version += 1
    this.persist()
  }

  rollbackLast(reason: string): void {
    this.freezeMode = 'monitor'
    this.autonomyMode = 'supervised'
    this.rollbackPressure = clamp01(this.rollbackPressure + 0.14)
    this.appendRollback(String(reason || 'Manual rollback invoked.').slice(0, 180))
    this.strategyNarrative = this.buildNarrative()
    this.version += 1
    this.persist()
  }

  getSnapshot(): GovernanceSnapshot {
    const historySnapshot = selfGovernanceHistory.getSnapshot()
    return {
      freezeMode: this.freezeMode,
      freezeReason: this.freezeReason,
      autonomyMode: this.autonomyMode,
      readinessScore: this.readinessScore,
      deploymentScore: this.deploymentScore,
      rollbackPressure: this.rollbackPressure,
      approvalQueueSize: this.approvalQueueSize,
      blockedCount: this.blockedCount,
      deferredCount: this.deferredCount,
      clarificationCount: this.clarificationCount,
      appliedCount: this.appliedCount,
      recentRollbacks: [...this.recentRollbacks],
      deployment: {
        activeProposalId: this.latestDeploymentSnapshot.activeProposalId,
        activeVersion: this.latestDeploymentSnapshot.activeVersion,
        rolloutState: this.latestDeploymentSnapshot.rolloutState,
        rolloutPressure: this.latestDeploymentSnapshot.rolloutPressure,
        proposalCount: this.latestDeploymentSnapshot.proposals.length,
        recordCount: this.latestDeploymentSnapshot.records.length,
        canaryApprovalRate: this.latestDeploymentSnapshot.canary?.approvalRate ?? 0,
        canarySafetyScore: this.latestDeploymentSnapshot.canary?.safetyScore ?? 0,
        deploymentNarrative: this.latestDeploymentSnapshot.deploymentNarrative,
        history: {
          totalEvents: historySnapshot.totalEvents,
          recentEvents: historySnapshot.recentEvents.slice(0, 5).map((eventEntry) => `${eventEntry.category}:${eventEntry.summary}`),
          narrative: historySnapshot.narrative,
        },
      },
      strategyNarrative: this.strategyNarrative,
      updatedAt: Date.now(),
      version: this.version,
    }
  }

  private appendRollback(note: string): void {
    this.recentRollbacks.unshift(note)
    if (this.recentRollbacks.length > MAX_ROLLBACK_NOTES) {
      this.recentRollbacks = this.recentRollbacks.slice(0, MAX_ROLLBACK_NOTES)
    }
  }

  private buildNarrative(): string {
    return [
      `freeze=${this.freezeMode}`,
      `autonomy=${this.autonomyMode}`,
      `readiness=${this.readinessScore.toFixed(2)}`,
      `deploy=${this.deploymentScore.toFixed(2)}`,
      `rollback=${this.rollbackPressure.toFixed(2)}`,
      `approval_queue=${this.approvalQueueSize}`,
      `pipeline=${this.deploymentNarrative}`,
      this.recentRollbacks[0] ? `last_rollback=${this.recentRollbacks[0]}` : 'last_rollback=none',
    ].join(' ; ')
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          outcomes: this.outcomes,
          freezeMode: this.freezeMode,
          freezeReason: this.freezeReason,
          autonomyMode: this.autonomyMode,
          readinessScore: this.readinessScore,
          deploymentScore: this.deploymentScore,
          rollbackPressure: this.rollbackPressure,
          approvalQueueSize: this.approvalQueueSize,
          blockedCount: this.blockedCount,
          deferredCount: this.deferredCount,
          clarificationCount: this.clarificationCount,
          appliedCount: this.appliedCount,
          recentRollbacks: this.recentRollbacks,
          strategyNarrative: this.strategyNarrative,
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

      const parsed = JSON.parse(raw) as Partial<{
        outcomes: GovernanceOutcomeRecord[]
        freezeMode: GovernanceSnapshot['freezeMode']
        freezeReason: string
        autonomyMode: GovernanceSnapshot['autonomyMode']
        readinessScore: number
        deploymentScore: number
        rollbackPressure: number
        approvalQueueSize: number
        blockedCount: number
        deferredCount: number
        clarificationCount: number
        appliedCount: number
        recentRollbacks: string[]
        strategyNarrative: string
        version: number
      }>

      this.outcomes = Array.isArray(parsed.outcomes) ? parsed.outcomes : []
      this.freezeMode =
        parsed.freezeMode === 'off' || parsed.freezeMode === 'monitor' || parsed.freezeMode === 'engaged'
          ? parsed.freezeMode
          : 'monitor'
      this.freezeReason = typeof parsed.freezeReason === 'string' ? parsed.freezeReason : 'Governance monitor active.'
      this.autonomyMode =
        parsed.autonomyMode === 'supervised' || parsed.autonomyMode === 'hybrid' || parsed.autonomyMode === 'autonomous'
          ? parsed.autonomyMode
          : 'hybrid'
      this.readinessScore = typeof parsed.readinessScore === 'number' ? clamp01(parsed.readinessScore) : 0.74
      this.deploymentScore = typeof parsed.deploymentScore === 'number' ? clamp01(parsed.deploymentScore) : 0.72
      this.rollbackPressure = typeof parsed.rollbackPressure === 'number' ? clamp01(parsed.rollbackPressure) : 0.22
      this.approvalQueueSize = typeof parsed.approvalQueueSize === 'number' ? Math.max(0, parsed.approvalQueueSize) : 0
      this.blockedCount = typeof parsed.blockedCount === 'number' ? Math.max(0, parsed.blockedCount) : 0
      this.deferredCount = typeof parsed.deferredCount === 'number' ? Math.max(0, parsed.deferredCount) : 0
      this.clarificationCount = typeof parsed.clarificationCount === 'number' ? Math.max(0, parsed.clarificationCount) : 0
      this.appliedCount = typeof parsed.appliedCount === 'number' ? Math.max(0, parsed.appliedCount) : 0
      this.recentRollbacks = Array.isArray(parsed.recentRollbacks) ? parsed.recentRollbacks.slice(0, MAX_ROLLBACK_NOTES) : []
      this.strategyNarrative = typeof parsed.strategyNarrative === 'string' ? parsed.strategyNarrative : this.buildNarrative()
      this.version = typeof parsed.version === 'number' ? parsed.version : 1
    } catch {
      this.outcomes = []
      this.freezeMode = 'monitor'
      this.freezeReason = 'Governance monitor active.'
      this.autonomyMode = 'hybrid'
      this.readinessScore = 0.74
      this.deploymentScore = 0.72
      this.rollbackPressure = 0.22
      this.approvalQueueSize = 0
      this.blockedCount = 0
      this.deferredCount = 0
      this.clarificationCount = 0
      this.appliedCount = 0
      this.recentRollbacks = []
      this.strategyNarrative = 'Governance calibration warming up.'
      this.version = 1
    }
  }
}

export const selfGovernanceEngine = new SelfGovernanceEngine()
