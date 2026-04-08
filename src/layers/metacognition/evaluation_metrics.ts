import type { GlobalWorkspaceState } from '@/layers/global_workspace/workspace_schema'
import type { SelfModelState } from '@/layers/self_model/self_state_schema'

export interface EvaluationScore {
  goalSuccess: number
  actionRelevance: number
  confidenceAccuracy: number
  responseLatency: number
  taskCompletionRate: number
  utilityScore: number
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export class EvaluationMetrics {
  evaluate(workspace: GlobalWorkspaceState, selfState: SelfModelState): EvaluationScore {
    const tasks = workspace.tasks
    const completed = tasks.filter((task) => task.status === 'completed').length
    const failed = tasks.filter((task) => task.status === 'failed').length
    const active = tasks.filter((task) => task.status === 'active' || task.status === 'pending').length
    const total = Math.max(1, tasks.length)

    const taskCompletionRate = clamp01(completed / total)
    const failureRate = clamp01(failed / total)

    const goalCount = Math.max(1, selfState.goals.length)
    const goalProgress =
      selfState.goals.reduce((sum, goal) => sum + clamp01(goal.progress), 0) / goalCount

    const actionRelevance = clamp01(1 - Math.max(0, active - completed) / Math.max(1, total + completed))

    const selectedHypothesis = workspace.hypotheses.find(
      (item) => item.id === workspace.selectedHypothesisId,
    )

    const confidenceAccuracy = selectedHypothesis
      ? clamp01(1 - Math.abs(selectedHypothesis.confidence - selfState.confidenceCurrent))
      : clamp01(0.7 - failureRate * 0.4)

    const latestEvents = workspace.events.slice(-40)
    const ageMs = latestEvents.length
      ? Date.now() - latestEvents[Math.max(0, latestEvents.length - 1)].timestamp
      : 2000
    const responseLatency = clamp01(1 - ageMs / 120_000)

    const utilityScore = clamp01(
      goalProgress * 0.3 +
        actionRelevance * 0.2 +
        confidenceAccuracy * 0.2 +
        responseLatency * 0.1 +
        taskCompletionRate * 0.2,
    )

    return {
      goalSuccess: goalProgress,
      actionRelevance,
      confidenceAccuracy,
      responseLatency,
      taskCompletionRate,
      utilityScore,
    }
  }
}

export const evaluationMetrics = new EvaluationMetrics()
