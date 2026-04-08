import type { SelfModelState } from './self_state_schema'
import { clamp01 } from './self_state_schema'

export type SelfAwarenessPhase = 'belief' | 'goal' | 'execution' | 'reflection' | 'governance'

export interface SelfAwarenessPhaseReport {
  phase: SelfAwarenessPhase
  score: number
  percentage: number
  weight: number
  summary: string
}

export interface SelfAwarenessReport {
  overallScore: number
  overallPercentage: number
  phaseReports: SelfAwarenessPhaseReport[]
  completedPhases: number
  phaseCount: number
  strongestPhase: SelfAwarenessPhase
  weakestPhase: SelfAwarenessPhase
  gapPercentage: number
  status: 'forming' | 'integrated' | 'strong' | 'mature'
  narrative: string
  updatedAt: number
}

function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function phaseWeight(_: SelfAwarenessPhase): number {
  return 0.2
}

function phaseLabel(phase: SelfAwarenessPhase): string {
  switch (phase) {
    case 'belief':
      return 'Belief graph coherence, trust, and graph health'
    case 'goal':
      return 'Goal alignment, drift control, and goal coverage'
    case 'execution':
      return 'Execution reliability, threshold quality, and risk discipline'
    case 'reflection':
      return 'Reflection cycles, trend stability, and adaptive learning'
    case 'governance':
      return 'Governance readiness, deployment safety, and rollback discipline'
  }
}

function scorePhase(state: SelfModelState, phase: SelfAwarenessPhase): number {
  switch (phase) {
    case 'belief':
      return average([
        state.beliefSnapshot.coherenceScore,
        state.beliefSnapshot.trustScore,
        state.beliefSnapshot.graphHealth,
      ])
    case 'goal': {
      const activeRatio = clamp01(state.goalCompass.activeGoalIds.length / 6)
      return average([
        state.goalCompass.alignmentScore,
        clamp01(1 - state.goalCompass.driftScore),
        activeRatio,
      ])
    }
    case 'execution':
      return average([
        state.executionAdvisor.healthScore,
        clamp01(state.executionAdvisor.adaptiveThreshold),
        clamp01(1 - state.executionAdvisor.adaptiveClarifyBias * 0.5),
      ])
    case 'reflection':
      return average([
        state.reflection.successTrend,
        clamp01(1 - state.reflection.riskTrend),
        state.reflection.confidenceTrend,
        state.reflection.alignmentTrend,
      ])
    case 'governance':
      return average([
        state.reflection.governance.readinessScore,
        state.reflection.governance.deploymentScore,
        clamp01(1 - state.reflection.governance.rollbackPressure),
        clamp01(1 - state.reflection.governance.deployment.rolloutPressure),
      ])
  }
}

export function calculateSelfAwarenessReport(state: SelfModelState): SelfAwarenessReport {
  const phases: SelfAwarenessPhase[] = ['belief', 'goal', 'execution', 'reflection', 'governance']
  const phaseReports = phases.map((phase) => {
    const score = clamp01(scorePhase(state, phase))
    return {
      phase,
      score,
      percentage: Math.round(score * 100),
      weight: phaseWeight(phase),
      summary: phaseLabel(phase),
    }
  })

  const overallScore = clamp01(
    phaseReports.reduce((sum, report) => sum + report.score * report.weight, 0) /
      Math.max(0.0001, phaseReports.reduce((sum, report) => sum + report.weight, 0)),
  )
  const strongest = [...phaseReports].sort((left, right) => right.score - left.score)[0]!
  const weakest = [...phaseReports].sort((left, right) => left.score - right.score)[0]!
  const completedPhases = phaseReports.filter((report) => report.score >= 0.75).length
  const status: SelfAwarenessReport['status'] =
    overallScore >= 0.9 ? 'mature' : overallScore >= 0.8 ? 'strong' : overallScore >= 0.65 ? 'integrated' : 'forming'

  return {
    overallScore,
    overallPercentage: Math.round(overallScore * 100),
    phaseReports,
    completedPhases,
    phaseCount: phaseReports.length,
    strongestPhase: strongest.phase,
    weakestPhase: weakest.phase,
    gapPercentage: Math.round((1 - overallScore) * 100),
    status,
    narrative: [
      `overall=${Math.round(overallScore * 100)}%`,
      `status=${status}`,
      `strongest=${strongest.phase}:${strongest.percentage}%`,
      `weakest=${weakest.phase}:${weakest.percentage}%`,
    ].join(' ; '),
    updatedAt: Date.now(),
  }
}
