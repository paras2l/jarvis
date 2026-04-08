import { reflectiveLearningCore } from '@/layers/reflective_learning/reflective_learning_core'
import { clamp01 } from './self_state_schema'
import { selfReflectionSimulator } from './self_reflection_simulator'
import { selfReflectionPolicyController } from './self_reflection_policy_controller'
import { selfGovernanceEngine } from './self_governance_engine'

export interface ReflectionInput {
  taskId: string
  taskType: string
  command: string
  success: boolean
  reason: string
  durationMs: number
  confidence: number
  riskScore: number
  alignmentScore: number
  driftScore: number
  decision: 'execute' | 'clarify' | 'defer' | 'block'
  sensitive: boolean
}

export interface ReflectionGuardrails {
  minConfidence: number
  maxRisk: number
  clarifyBias: number
  blockSensitiveWhenUncertain: boolean
}

export interface ReflectionInsight {
  id: string
  timestamp: number
  category: 'reliability' | 'risk' | 'clarity' | 'alignment' | 'efficiency'
  severity: 'low' | 'medium' | 'high'
  summary: string
  recommendation: string
  confidence: number
}

export interface ReflectionPolicyUpdate {
  id: string
  timestamp: number
  status: 'pending' | 'applied' | 'rejected'
  reason: string
  minConfidence?: number
  maxRisk?: number
  clarifyBiasDelta?: number
}

export interface ReflectionSnapshot {
  cycleCount: number
  successTrend: number
  riskTrend: number
  confidenceTrend: number
  alignmentTrend: number
  insights: ReflectionInsight[]
  pendingPolicyUpdates: ReflectionPolicyUpdate[]
  appliedPolicyUpdates: ReflectionPolicyUpdate[]
  executionGuardrails: ReflectionGuardrails
  simulation: {
    lastRunAt: number
    scenarioCount: number
    recommendedMinConfidence: number
    recommendedMaxRisk: number
    recommendedClarifyBias: number
    confidence: number
    narrative: string
  }
  policyController: {
    autonomyLevel: 'guarded' | 'balanced' | 'assertive'
    governanceScore: number
    pending: number
    applied: number
    rejected: number
    rollbacks: number
    narrative: string
  }
  governance: {
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
    strategyNarrative: string
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
  }
  lastReflectionSummary: string
  updatedAt: number
  version: number
}

const STORAGE_KEY = 'Pixi.self_model.reflection_engine.v1'
const MAX_HISTORY = 240
const MAX_INSIGHTS = 80
const MAX_UPDATES = 60

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function normalizeCommand(command: string): string {
  return String(command || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 140)
}

class SelfReflectionEngine {
  private history: ReflectionInput[] = []
  private insights: ReflectionInsight[] = []
  private pendingPolicyUpdates: ReflectionPolicyUpdate[] = []
  private appliedPolicyUpdates: ReflectionPolicyUpdate[] = []
  private executionGuardrails: ReflectionGuardrails = {
    minConfidence: 0.62,
    maxRisk: 0.78,
    clarifyBias: 0.25,
    blockSensitiveWhenUncertain: true,
  }
  private cycleCount = 0
  private version = 1

  constructor() {
    this.hydrate()
  }

  ingestOutcome(input: ReflectionInput): ReflectionSnapshot {
    const normalized: ReflectionInput = {
      ...input,
      command: normalizeCommand(input.command),
      confidence: clamp01(input.confidence),
      riskScore: clamp01(input.riskScore),
      alignmentScore: clamp01(input.alignmentScore),
      driftScore: clamp01(input.driftScore),
      durationMs: Math.max(0, input.durationMs),
    }

    this.history.unshift(normalized)
    this.trimCollections()

    reflectiveLearningCore.recordActionOutcome(
      input.taskId,
      input.decision === 'execute' ? 'reactive' : input.decision === 'defer' ? 'proactive' : 'exploratory',
      input.success,
      input.durationMs,
      {
        taskType: input.taskType,
        riskScore: input.riskScore,
        confidence: input.confidence,
        alignmentScore: input.alignmentScore,
        decision: input.decision,
      },
    )

    if (!input.success && input.decision !== 'block') {
      reflectiveLearningCore.recordEnvironmentalFeedback(
        input.taskId,
        'rejection',
        0.7,
        input.reason,
      )
    }

    this.runReflectionCycle()
    this.version += 1
    this.persist()
    return this.getSnapshot()
  }

  getGuardrails(context: {
    taskType: string
    sensitive: boolean
    goalDrift: number
    riskScore: number
  }): ReflectionGuardrails {
    const guardrails = { ...this.executionGuardrails }

    if (context.goalDrift > 0.65) {
      guardrails.minConfidence = clamp01(Math.max(guardrails.minConfidence, 0.72))
      guardrails.maxRisk = clamp01(Math.min(guardrails.maxRisk, 0.68))
      guardrails.clarifyBias = clamp01(Math.max(guardrails.clarifyBias, 0.35))
    }

    if (context.sensitive && context.riskScore > 0.7) {
      guardrails.minConfidence = clamp01(Math.max(guardrails.minConfidence, 0.76))
      guardrails.maxRisk = clamp01(Math.min(guardrails.maxRisk, 0.62))
      guardrails.blockSensitiveWhenUncertain = true
    }

    return guardrails
  }

  getSnapshot(): ReflectionSnapshot {
    const trend = this.computeTrends()
    const latestSimulation = selfReflectionSimulator.getLatestSummary()
    const policySnapshot = selfReflectionPolicyController.getSnapshot()
    const governanceSnapshot = selfGovernanceEngine.getSnapshot()
    return {
      cycleCount: this.cycleCount,
      successTrend: trend.successTrend,
      riskTrend: trend.riskTrend,
      confidenceTrend: trend.confidenceTrend,
      alignmentTrend: trend.alignmentTrend,
      insights: [...this.insights.slice(0, 10)],
      pendingPolicyUpdates: [...this.pendingPolicyUpdates.slice(0, 10)],
      appliedPolicyUpdates: [...this.appliedPolicyUpdates.slice(0, 10)],
      executionGuardrails: { ...this.executionGuardrails },
      simulation: {
        lastRunAt: latestSimulation?.timestamp ?? 0,
        scenarioCount: latestSimulation?.scenarioCount ?? 0,
        recommendedMinConfidence: latestSimulation?.recommended.minConfidence ?? this.executionGuardrails.minConfidence,
        recommendedMaxRisk: latestSimulation?.recommended.maxRisk ?? this.executionGuardrails.maxRisk,
        recommendedClarifyBias: latestSimulation?.recommended.clarifyBias ?? this.executionGuardrails.clarifyBias,
        confidence: latestSimulation?.recommended.confidence ?? 0.5,
        narrative: latestSimulation?.narrative ?? 'Simulation not executed yet.',
      },
      policyController: {
        autonomyLevel: policySnapshot.autonomyLevel,
        governanceScore: policySnapshot.governanceScore,
        pending: policySnapshot.pending.length,
        applied: policySnapshot.applied.length,
        rejected: policySnapshot.rejected.length,
        rollbacks: policySnapshot.rollbackCount,
        narrative: policySnapshot.narrative,
      },
      governance: {
        freezeMode: governanceSnapshot.freezeMode,
        freezeReason: governanceSnapshot.freezeReason,
        autonomyMode: governanceSnapshot.autonomyMode,
        readinessScore: governanceSnapshot.readinessScore,
        deploymentScore: governanceSnapshot.deploymentScore,
        rollbackPressure: governanceSnapshot.rollbackPressure,
        approvalQueueSize: governanceSnapshot.approvalQueueSize,
        blockedCount: governanceSnapshot.blockedCount,
        deferredCount: governanceSnapshot.deferredCount,
        clarificationCount: governanceSnapshot.clarificationCount,
        appliedCount: governanceSnapshot.appliedCount,
        recentRollbacks: governanceSnapshot.recentRollbacks,
        strategyNarrative: governanceSnapshot.strategyNarrative,
        deployment: governanceSnapshot.deployment,
      },
      lastReflectionSummary: this.getNarrative(),
      updatedAt: Date.now(),
      version: this.version,
    }
  }

  private runReflectionCycle(): void {
    this.cycleCount += 1
    const recent = this.history.slice(0, 24)
    if (!recent.length) return

    const failed = recent.filter((item) => !item.success)
    const failureRate = failed.length / recent.length
    const highRiskFailures = failed.filter((item) => item.riskScore > 0.7).length
    const lowConfidenceFailures = failed.filter((item) => item.confidence < 0.6).length
    const driftFailures = failed.filter((item) => item.driftScore > 0.6).length

    const nextMinConfidence = clamp01(0.55 + failureRate * 0.3 + (lowConfidenceFailures / Math.max(1, recent.length)) * 0.15)
    const nextMaxRisk = clamp01(0.88 - failureRate * 0.25 - (highRiskFailures / Math.max(1, recent.length)) * 0.2)
    const nextClarifyBias = clamp01(0.18 + failureRate * 0.4 + (driftFailures / Math.max(1, recent.length)) * 0.2)

    const changed =
      Math.abs(this.executionGuardrails.minConfidence - nextMinConfidence) > 0.03 ||
      Math.abs(this.executionGuardrails.maxRisk - nextMaxRisk) > 0.03 ||
      Math.abs(this.executionGuardrails.clarifyBias - nextClarifyBias) > 0.03

    if (changed) {
      this.pendingPolicyUpdates.unshift({
        id: makeId('refl_policy'),
        timestamp: Date.now(),
        status: 'pending',
        reason: `failure_rate=${failureRate.toFixed(2)} high_risk_failures=${highRiskFailures}`,
        minConfidence: nextMinConfidence,
        maxRisk: nextMaxRisk,
        clarifyBiasDelta: clamp01(Math.abs(nextClarifyBias - this.executionGuardrails.clarifyBias)),
      })
    }

    this.executionGuardrails = {
      minConfidence: nextMinConfidence,
      maxRisk: nextMaxRisk,
      clarifyBias: nextClarifyBias,
      blockSensitiveWhenUncertain: failureRate > 0.18,
    }

    const simulationSummary = selfReflectionSimulator.runSimulation({
      recent,
      baseline: this.executionGuardrails,
    })

    selfReflectionPolicyController.adoptSimulationRecommendations(simulationSummary)

    const policyDecisions = selfReflectionPolicyController.evaluatePending(this.computeTrends())
    const approvedPolicies = policyDecisions.filter((decision) => decision.approved)
    const rejectedPolicies = policyDecisions.filter((decision) => !decision.approved)

    approvedPolicies.forEach((decision) => {
      if (decision.update.minConfidence !== undefined) {
        this.executionGuardrails.minConfidence = clamp01((this.executionGuardrails.minConfidence + decision.update.minConfidence) / 2)
      }
      if (decision.update.maxRisk !== undefined) {
        this.executionGuardrails.maxRisk = clamp01((this.executionGuardrails.maxRisk + decision.update.maxRisk) / 2)
      }
      if (decision.update.clarifyBiasDelta !== undefined) {
        this.executionGuardrails.clarifyBias = clamp01((this.executionGuardrails.clarifyBias + decision.update.clarifyBiasDelta) / 2)
      }
    })

    rejectedPolicies.slice(0, 1).forEach((decision) => {
      if (decision.update.maxRisk !== undefined && decision.update.maxRisk < 0.45) {
        selfReflectionPolicyController.rollbackLast('Rejected overly strict maxRisk policy')
      }
    })

    const trend = this.computeTrends()
    const policySnapshot = selfReflectionPolicyController.getSnapshot()
    selfGovernanceEngine.syncFromReflection({
      successTrend: trend.successTrend,
      riskTrend: trend.riskTrend,
      confidenceTrend: trend.confidenceTrend,
      alignmentTrend: trend.alignmentTrend,
      guardrailMinConfidence: this.executionGuardrails.minConfidence,
      guardrailMaxRisk: this.executionGuardrails.maxRisk,
      simulationConfidence: simulationSummary.recommended.confidence,
      policyGovernanceScore: policySnapshot.governanceScore,
      pendingPolicyUpdates: policySnapshot.pending.length,
    })

    this.promotePolicyUpdates()
    this.generateInsights(recent)
    void reflectiveLearningCore.performLearningCycle()
  }

  private promotePolicyUpdates(): void {
    if (!this.pendingPolicyUpdates.length) return
    const promoteCount = Math.min(2, this.pendingPolicyUpdates.length)
    for (let index = 0; index < promoteCount; index += 1) {
      const update = this.pendingPolicyUpdates[index]
      if (!update) continue
      update.status = 'applied'
      this.appliedPolicyUpdates.unshift({ ...update })
    }
    this.pendingPolicyUpdates = this.pendingPolicyUpdates.slice(promoteCount)
  }

  private generateInsights(recent: ReflectionInput[]): void {
    const failures = recent.filter((item) => !item.success)
    const successRate = 1 - failures.length / Math.max(1, recent.length)
    const avgRisk = recent.reduce((sum, item) => sum + item.riskScore, 0) / Math.max(1, recent.length)
    const avgAlignment = recent.reduce((sum, item) => sum + item.alignmentScore, 0) / Math.max(1, recent.length)

    this.insights.unshift({
      id: makeId('refl_insight'),
      timestamp: Date.now(),
      category: successRate < 0.6 ? 'reliability' : avgRisk > 0.6 ? 'risk' : 'alignment',
      severity: successRate < 0.45 || avgRisk > 0.75 ? 'high' : successRate < 0.7 ? 'medium' : 'low',
      summary: `Recent success=${successRate.toFixed(2)}, risk=${avgRisk.toFixed(2)}, alignment=${avgAlignment.toFixed(2)}.`,
      recommendation:
        successRate < 0.6
          ? 'Increase clarification and reduce risk appetite for repeated command signatures.'
          : avgRisk > 0.6
            ? 'Apply stricter risk caps and require confirmation for sensitive contexts.'
            : 'Maintain current strategy and continue incremental calibration.',
      confidence: clamp01(0.55 + (1 - avgRisk) * 0.25 + avgAlignment * 0.2),
    })
  }

  private computeTrends(): {
    successTrend: number
    riskTrend: number
    confidenceTrend: number
    alignmentTrend: number
  } {
    const recent = this.history.slice(0, 30)
    if (!recent.length) {
      return {
        successTrend: 0.75,
        riskTrend: 0.3,
        confidenceTrend: 0.72,
        alignmentTrend: 0.78,
      }
    }

    const successTrend = recent.filter((item) => item.success).length / recent.length
    const riskTrend = recent.reduce((sum, item) => sum + item.riskScore, 0) / recent.length
    const confidenceTrend = recent.reduce((sum, item) => sum + item.confidence, 0) / recent.length
    const alignmentTrend = recent.reduce((sum, item) => sum + item.alignmentScore, 0) / recent.length

    return {
      successTrend: clamp01(successTrend),
      riskTrend: clamp01(riskTrend),
      confidenceTrend: clamp01(confidenceTrend),
      alignmentTrend: clamp01(alignmentTrend),
    }
  }

  private getNarrative(): string {
    const trend = this.computeTrends()
    const topInsight = this.insights[0]?.summary || 'No insights yet.'
    const simulation = selfReflectionSimulator.getLatestSummary()
    const policySnapshot = selfReflectionPolicyController.getSnapshot()
    const governanceSnapshot = selfGovernanceEngine.getSnapshot()
    return [
      `success=${trend.successTrend.toFixed(2)}`,
      `risk=${trend.riskTrend.toFixed(2)}`,
      `confidence=${trend.confidenceTrend.toFixed(2)}`,
      `alignment=${trend.alignmentTrend.toFixed(2)}`,
      `guardrails(min=${this.executionGuardrails.minConfidence.toFixed(2)},maxRisk=${this.executionGuardrails.maxRisk.toFixed(2)},clarify=${this.executionGuardrails.clarifyBias.toFixed(2)})`,
      `simulation=${simulation ? simulation.narrative : 'none'}`,
      `policy=${policySnapshot.narrative}`,
      `governance=${governanceSnapshot.strategyNarrative}`,
      `insight=${topInsight}`,
    ].join(' ; ')
  }

  private trimCollections(): void {
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(0, MAX_HISTORY)
    }
    if (this.insights.length > MAX_INSIGHTS) {
      this.insights = this.insights.slice(0, MAX_INSIGHTS)
    }
    if (this.pendingPolicyUpdates.length > MAX_UPDATES) {
      this.pendingPolicyUpdates = this.pendingPolicyUpdates.slice(0, MAX_UPDATES)
    }
    if (this.appliedPolicyUpdates.length > MAX_UPDATES) {
      this.appliedPolicyUpdates = this.appliedPolicyUpdates.slice(0, MAX_UPDATES)
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          history: this.history,
          insights: this.insights,
          pendingPolicyUpdates: this.pendingPolicyUpdates,
          appliedPolicyUpdates: this.appliedPolicyUpdates,
          executionGuardrails: this.executionGuardrails,
          cycleCount: this.cycleCount,
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
        history: ReflectionInput[]
        insights: ReflectionInsight[]
        pendingPolicyUpdates: ReflectionPolicyUpdate[]
        appliedPolicyUpdates: ReflectionPolicyUpdate[]
        executionGuardrails: ReflectionGuardrails
        cycleCount: number
        version: number
      }>

      this.history = Array.isArray(parsed.history) ? parsed.history : []
      this.insights = Array.isArray(parsed.insights) ? parsed.insights : []
      this.pendingPolicyUpdates = Array.isArray(parsed.pendingPolicyUpdates) ? parsed.pendingPolicyUpdates : []
      this.appliedPolicyUpdates = Array.isArray(parsed.appliedPolicyUpdates) ? parsed.appliedPolicyUpdates : []
      this.executionGuardrails = parsed.executionGuardrails
        ? {
            minConfidence: clamp01(parsed.executionGuardrails.minConfidence),
            maxRisk: clamp01(parsed.executionGuardrails.maxRisk),
            clarifyBias: clamp01(parsed.executionGuardrails.clarifyBias),
            blockSensitiveWhenUncertain: Boolean(parsed.executionGuardrails.blockSensitiveWhenUncertain),
          }
        : this.executionGuardrails
      this.cycleCount = typeof parsed.cycleCount === 'number' ? parsed.cycleCount : 0
      this.version = typeof parsed.version === 'number' ? parsed.version : 1
    } catch {
      this.history = []
      this.insights = []
      this.pendingPolicyUpdates = []
      this.appliedPolicyUpdates = []
      this.executionGuardrails = {
        minConfidence: 0.62,
        maxRisk: 0.78,
        clarifyBias: 0.25,
        blockSensitiveWhenUncertain: true,
      }
      this.cycleCount = 0
      this.version = 1
    }
  }
}

export const selfReflectionEngine = new SelfReflectionEngine()

