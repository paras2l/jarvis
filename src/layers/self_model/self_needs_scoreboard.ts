import { clamp01 } from './self_state_schema'

export type SelfNeedKey = 'safety' | 'clarity' | 'trust' | 'progress' | 'autonomy' | 'learning' | 'stability'

export interface SelfNeedScore {
  key: SelfNeedKey
  satisfaction: number
  priority: number
  rationale: string
}

export interface SelfNeedsScoreboard {
  overallScore: number
  overallPressure: number
  needs: SelfNeedScore[]
  priorityOrder: SelfNeedKey[]
  narrative: string
  updatedAt: number
  version: number
}

function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function mapPriority(score: number): number {
  return clamp01(1 - score)
}

function sortByPressure(needs: SelfNeedScore[]): SelfNeedScore[] {
  return [...needs].sort((left, right) => right.priority - left.priority || left.satisfaction - right.satisfaction)
}

export interface SelfNeedsScoreboardStateInput {
  beliefSnapshot: {
    graphHealth: number
    trustScore: number
    contradictionCount: number
    openContradictions?: number
  }
  goalCompass: {
    activeGoalIds: string[]
    alignmentScore: number
    driftScore: number
  }
  executionAdvisor: {
    healthScore: number
    adaptiveClarifyBias: number
  }
  reflection: {
    successTrend: number
    confidenceTrend: number
    alignmentTrend: number
    riskTrend: number
    executionGuardrails: { clarifyBias: number }
    policyController: { autonomyLevel: 'guarded' | 'balanced' | 'assertive'; governanceScore: number }
    governance: {
      readinessScore: number
      rollbackPressure: number
      autonomyMode: 'restricted' | 'hybrid' | 'autonomous' | 'supervised'
    }
  }
  confidenceCurrent: number
  stressLevel: number
}

function activeGoalRatio(state: SelfNeedsScoreboardStateInput): number {
  return clamp01(state.goalCompass.activeGoalIds.length / 6)
}

function trustBase(state: SelfNeedsScoreboardStateInput): number {
  return average([state.beliefSnapshot.trustScore, state.reflection.policyController.governanceScore, state.confidenceCurrent])
}

export function calculateNeedsScoreboard(state: SelfNeedsScoreboardStateInput): SelfNeedsScoreboard {
  const safety = clamp01(
    average([
      state.beliefSnapshot.graphHealth,
      state.reflection.governance.readinessScore,
      state.executionAdvisor.healthScore,
      clamp01(1 - state.reflection.governance.rollbackPressure),
    ]),
  )

  const clarity = clamp01(
    average([
      clamp01(1 - state.goalCompass.driftScore),
      clamp01(1 - state.reflection.executionGuardrails.clarifyBias * 0.8),
      clamp01(1 - (state.beliefSnapshot.openContradictions ?? state.beliefSnapshot.contradictionCount) / 6),
    ]),
  )

  const trust = clamp01(
    average([
      trustBase(state),
      clamp01(1 - state.executionAdvisor.adaptiveClarifyBias * 0.4),
      clamp01(1 - state.reflection.governance.rollbackPressure * 0.5),
    ]),
  )

  const progress = clamp01(
    average([
      state.goalCompass.alignmentScore,
      activeGoalRatio(state),
      state.reflection.successTrend,
    ]),
  )

  const autonomy = clamp01(
    average([
      state.reflection.governance.autonomyMode === 'autonomous' ? 1 : state.reflection.governance.autonomyMode === 'hybrid' ? 0.68 : 0.42,
      state.reflection.policyController.autonomyLevel === 'assertive'
        ? 0.9
        : state.reflection.policyController.autonomyLevel === 'balanced'
          ? 0.7
          : 0.45,
      state.executionAdvisor.healthScore,
    ]),
  )

  const learning = clamp01(
    average([
      state.reflection.confidenceTrend,
      state.reflection.alignmentTrend,
      clamp01(1 - state.reflection.riskTrend),
    ]),
  )

  const stability = clamp01(
    average([
      state.confidenceCurrent,
      clamp01(1 - state.stressLevel),
      clamp01(1 - state.beliefSnapshot.contradictionCount / 10),
    ]),
  )

  const needs: SelfNeedScore[] = [
    { key: 'safety', satisfaction: safety, priority: mapPriority(safety), rationale: 'Belief, governance, and execution safety.' },
    { key: 'clarity', satisfaction: clarity, priority: mapPriority(clarity), rationale: 'Goal drift and ambiguity reduction.' },
    { key: 'trust', satisfaction: trust, priority: mapPriority(trust), rationale: 'User trust and internal policy trust.' },
    { key: 'progress', satisfaction: progress, priority: mapPriority(progress), rationale: 'Forward motion on active goals.' },
    { key: 'autonomy', satisfaction: autonomy, priority: mapPriority(autonomy), rationale: 'Safe independent action capacity.' },
    { key: 'learning', satisfaction: learning, priority: mapPriority(learning), rationale: 'Reflection, calibration, and adaptation.' },
    { key: 'stability', satisfaction: stability, priority: mapPriority(stability), rationale: 'Emotional and operational steadiness.' },
  ]

  const sorted = sortByPressure(needs)
  const overallScore = clamp01(average(sorted.map((need) => need.satisfaction)))
  const overallPressure = clamp01(1 - overallScore)

  return {
    overallScore,
    overallPressure,
    needs: sorted,
    priorityOrder: sorted.map((need) => need.key),
    narrative: `top=${sorted[0]?.key || 'none'}; pressure=${Math.round(overallPressure * 100)}%; safety=${Math.round(safety * 100)}%; clarity=${Math.round(clarity * 100)}%; trust=${Math.round(trust * 100)}%`,
    updatedAt: Date.now(),
    version: 1,
  }
}
