import type { GlobalWorkspaceState } from '@/layers/global_workspace/workspace_schema'
import type { SelfModelState } from '@/layers/self_model/self_state_schema'
import type { ContinuityContext } from '@/layers/identity_continuity/context_manager'

export interface ActionScore {
  confidence: number
  utility: number
  risk: number
  reversibility: number
  alignmentScore: number
  priorityBoost: number
}

export interface EvaluatedAction {
  id: string
  description: string
  type: 'reactive' | 'proactive'
  source: string
  confidence: number
  utility: number
  risk: number
  totalScore: number
  reasoning: string
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export class ActionEvaluator {
  evaluateAction(input: {
    description: string
    type: 'reactive' | 'proactive'
    source: string
    context: {
      workspace: GlobalWorkspaceState
      selfState: SelfModelState
      continuity: ContinuityContext
    }
  }): EvaluatedAction {
    const confidenceScore = this.scoreConfidence(input, input.context.selfState)
    const utilityScore = this.scoreUtility(input, input.context.workspace)
    const riskScore = this.scoreRisk(input, input.context.continuity)
    const reversibilityScore = this.scoreReversibility(input)
    const alignmentScore = this.scoreAlignment(input, input.context.continuity)

    const totalScore = clamp01(
      confidenceScore * 0.35 +
      utilityScore * 0.25 +
      (1 - riskScore) * 0.15 +
      reversibilityScore * 0.1 +
      alignmentScore * 0.15
    )

    const reasoning = this.summarizeReasoning({
      confidence: confidenceScore,
      utility: utilityScore,
      risk: riskScore,
      reversibility: reversibilityScore,
      alignment: alignmentScore,
    })

    return {
      id: `eval_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      description: input.description,
      type: input.type,
      source: input.source,
      confidence: confidenceScore,
      utility: utilityScore,
      risk: riskScore,
      totalScore,
      reasoning,
    }
  }

  private scoreConfidence(input: any, selfState: SelfModelState): number {
    if (input.type === 'reactive') {
      return clamp01(selfState.confidenceCurrent + 0.15)
    }

    const baseConfidence = selfState.confidenceCurrent
    const moodBoost = selfState.moodLabel === 'focused' ? 0.12 : selfState.moodLabel === 'excited' ? 0.1 : 0
    const stressImpact = Math.max(0, selfState.stressLevel * -0.1)

    return clamp01(baseConfidence + moodBoost + stressImpact)
  }

  private scoreUtility(_input: any, workspace: GlobalWorkspaceState): number {
    const completedTasks = workspace.tasks.filter((task) => task.status === 'completed').length
    const totalTasks = Math.max(1, workspace.tasks.length)
    const completionRate = clamp01(completedTasks / totalTasks)

    const activeHypotheses = workspace.hypotheses.filter((hyp) => hyp.utility > 0.5).length
    const hypothesisActiveness = clamp01(activeHypotheses / Math.max(1, workspace.hypotheses.length))

    const planCoverage = clamp01(workspace.plans.length / 5)

    return clamp01(completionRate * 0.4 + hypothesisActiveness * 0.35 + planCoverage * 0.25)
  }

  private scoreRisk(input: any, continuity: ContinuityContext): number {
    const hasOpenPromises = continuity.openPromises.length > 0 ? 0.2 : 0
    const isSuggestive = input.type === 'proactive' ? 0.15 : 0
    const baselineRisk = 0.1

    return clamp01(baselineRisk + hasOpenPromises + isSuggestive)
  }

  private scoreReversibility(input: any): number {
    const appLaunch = /open|launch|start|run/i.test(input.description)
    const dataModifying = /delete|clear|remove|overwrite|permanent/i.test(input.description)
    const systemLevel = /system|restart|shutdown|lock|sleep/i.test(input.description)

    if (systemLevel) return 0.1
    if (dataModifying) return 0.3
    if (appLaunch) return 0.8
    return 0.7
  }

  private scoreAlignment(input: any, continuity: ContinuityContext): number {
    const respectsIdentity = !input.description.includes('violate') && !input.description.includes('contradict')
    const identityBoost = respectsIdentity ? 0.1 : -0.15

    const promiseAlignment = continuity.openPromises.length > 0 ? 0.05 : 0
    const baseAlignment = 0.6

    return clamp01(baseAlignment + identityBoost + promiseAlignment)
  }

  private summarizeReasoning(scores: {
    confidence: number
    utility: number
    risk: number
    reversibility: number
    alignment: number
  }): string {
    const parts: string[] = []

    if (scores.confidence > 0.7) {
      parts.push('High confidence in outcomes.')
    } else if (scores.confidence < 0.4) {
      parts.push('Low confidence; recommend clarification.')
    }

    if (scores.utility > 0.7) {
      parts.push('High utility expected.')
    }

    if (scores.risk > 0.5) {
      parts.push('Moderate risk; requires caution.')
    }

    if (scores.reversibility > 0.7) {
      parts.push('Action is reversible.')
    }

    if (scores.alignment > 0.8) {
      parts.push('Aligns with identity and continuity.')
    }

    return parts.length ? parts.join(' ') : 'Action scored within normal parameters.'
  }
}

export const actionEvaluator = new ActionEvaluator()
