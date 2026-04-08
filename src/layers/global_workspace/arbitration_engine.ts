import type {
  WorkspaceHypothesis,
  WorkspacePlan,
  WorkspaceTask,
} from './workspace_schema'

export interface ArbitrationResult {
  selectedHypothesisId?: string
  selectedPlanId?: string
  conflicts: string[]
  notes: string
}

function timeDecay(timestamp: number, halfLifeMs = 5 * 60_000): number {
  const age = Math.max(0, Date.now() - timestamp)
  const decay = Math.exp((-Math.log(2) * age) / halfLifeMs)
  return Math.max(0.1, Math.min(1, decay))
}

export class WorkspaceArbitrationEngine {
  selectBestHypothesis(hypotheses: WorkspaceHypothesis[]): WorkspaceHypothesis | undefined {
    if (!hypotheses.length) return undefined

    return [...hypotheses]
      .map((h) => ({
        hypothesis: h,
        score: h.confidence * 0.6 + h.utility * 0.3 + timeDecay(h.timestamp) * 0.1,
      }))
      .sort((a, b) => b.score - a.score)[0]?.hypothesis
  }

  selectBestPlan(plans: WorkspacePlan[]): WorkspacePlan | undefined {
    if (!plans.length) return undefined

    return [...plans]
      .map((p) => ({
        plan: p,
        score: p.confidence * 0.55 + p.utility * 0.35 + timeDecay(p.timestamp) * 0.1,
      }))
      .sort((a, b) => b.score - a.score)[0]?.plan
  }

  detectTaskConflicts(tasks: WorkspaceTask[]): string[] {
    const conflicts: string[] = []
    const activeHigh = tasks.filter(
      (task) => (task.status === 'active' || task.status === 'pending') && task.priority >= 80,
    )

    for (let i = 0; i < activeHigh.length; i++) {
      for (let j = i + 1; j < activeHigh.length; j++) {
        const a = activeHigh[i]
        const b = activeHigh[j]
        if (a.description.toLowerCase() === b.description.toLowerCase()) {
          conflicts.push(`Conflicting duplicate high-priority tasks: ${a.id} and ${b.id}`)
        }
      }
    }

    return conflicts
  }

  arbitrate(input: {
    hypotheses: WorkspaceHypothesis[]
    plans: WorkspacePlan[]
    tasks: WorkspaceTask[]
  }): ArbitrationResult {
    const bestHypothesis = this.selectBestHypothesis(input.hypotheses)
    const bestPlan = this.selectBestPlan(input.plans)
    const conflicts = this.detectTaskConflicts(input.tasks)

    const notes = conflicts.length
      ? 'Arbitration selected best candidates with active task conflicts requiring mitigation.'
      : 'Arbitration selected highest-scoring coherent hypothesis and plan.'

    return {
      selectedHypothesisId: bestHypothesis?.id,
      selectedPlanId: bestPlan?.id,
      conflicts,
      notes,
    }
  }
}

export const workspaceArbitrationEngine = new WorkspaceArbitrationEngine()
