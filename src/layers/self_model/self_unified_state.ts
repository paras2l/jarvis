import type { SelfAwarenessReport } from './self_awareness_report'
import type { SelfContradictionDetectorSnapshot } from './self_contradiction_detector'
import type { SelfNeedsScoreboard } from './self_needs_scoreboard'
import type { SelfNarrationStream } from './self_narration_stream'
import type { SelfNeedKey } from './self_state_schema'
import type { SelfModelState } from './self_state_schema'
import { clamp01 } from './self_state_schema'

export interface SelfUnifiedStateComponents {
  belief: number
  goal: number
  execution: number
  reflection: number
  governance: number
  needs: number
  contradictions: number
  narration: number
}

export interface SelfUnifiedState {
  score: number
  percentage: number
  status: 'forming' | 'integrated' | 'strong' | 'mature'
  dominantFocus: string
  dominantNeed: SelfNeedKey
  dominantTension: string
  narrative: string
  components: SelfUnifiedStateComponents
  updatedAt: number
  version: number
}

function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function statusForScore(score: number): SelfUnifiedState['status'] {
  if (score >= 0.9) return 'mature'
  if (score >= 0.8) return 'strong'
  if (score >= 0.65) return 'integrated'
  return 'forming'
}

export function composeSelfUnifiedState(input: {
  state: SelfModelState
  awareness: SelfAwarenessReport
  needs: SelfNeedsScoreboard
  contradictions: SelfContradictionDetectorSnapshot
  narration: SelfNarrationStream
}): SelfUnifiedState {
  const belief = clamp01(input.state.beliefSnapshot.graphHealth)
  const goal = clamp01(input.state.goalCompass.alignmentScore)
  const execution = clamp01(input.state.executionAdvisor.healthScore)
  const reflection = clamp01(input.state.reflection.successTrend * 0.4 + (1 - input.state.reflection.riskTrend) * 0.25 + input.state.reflection.confidenceTrend * 0.35)
  const governance = clamp01(input.state.reflection.governance.readinessScore * 0.4 + input.state.reflection.governance.deploymentScore * 0.35 + (1 - input.state.reflection.governance.rollbackPressure) * 0.25)
  const needs = clamp01(input.needs.overallScore)
  const contradictions = clamp01(1 - input.contradictions.tensionScore)
  const narration = clamp01(Math.min(1, 0.55 + input.narration.entries.length / 160))

  const score = clamp01(
    average([
      input.awareness.overallScore,
      belief,
      goal,
      execution,
      reflection,
      governance,
      needs,
      contradictions,
      narration,
    ]),
  )

  const dominantNeed: SelfNeedKey = input.needs.needs[0]?.key || 'stability'
  const dominantTension = input.contradictions.findings[0]?.summary || 'none'
  const dominantFocus = input.state.currentFocus || input.state.goalCompass.priorityNarrative.split(' | ')[0] || 'idle'

  return {
    score,
    percentage: Math.round(score * 100),
    status: statusForScore(score),
    dominantFocus,
    dominantNeed,
    dominantTension,
    narrative: [
      `score=${Math.round(score * 100)}%`,
      `status=${statusForScore(score)}`,
      `focus=${dominantFocus}`,
      `need=${dominantNeed}`,
      `tension=${dominantTension}`,
      `thread=${input.narration.currentThread}`,
    ].join(' ; '),
    components: {
      belief,
      goal,
      execution,
      reflection,
      governance,
      needs,
      contradictions,
      narration,
    },
    updatedAt: Date.now(),
    version: 1,
  }
}
