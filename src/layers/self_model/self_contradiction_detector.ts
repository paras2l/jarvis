import type { SelfExecutionAdvisorSnapshot, SelfGoalCompassSnapshot, SelfModelWorkspaceSnapshot, SelfReflectionSnapshot } from './self_state_schema'
import { clamp01 } from './self_state_schema'

export type SelfContradictionSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface SelfContradictionFinding {
  id: string
  domain: 'belief' | 'goal' | 'execution' | 'reflection' | 'governance' | 'narration'
  subject: string
  severity: SelfContradictionSeverity
  tension: number
  summary: string
  evidence: string[]
}

export interface SelfContradictionDetectorSnapshot {
  openCount: number
  criticalCount: number
  resolvedCount: number
  tensionScore: number
  subjects: string[]
  findings: SelfContradictionFinding[]
  narrative: string
  updatedAt: number
  version: number
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function severityForTension(tension: number): SelfContradictionSeverity {
  if (tension >= 0.85) return 'critical'
  if (tension >= 0.65) return 'high'
  if (tension >= 0.4) return 'medium'
  return 'low'
}

function clampTension(value: number): number {
  return clamp01(value)
}

export function detectSelfContradictions(input: {
  beliefSnapshot: SelfModelWorkspaceSnapshot
  goalCompass: SelfGoalCompassSnapshot
  executionAdvisor: SelfExecutionAdvisorSnapshot
  reflection: SelfReflectionSnapshot
  narrationThread?: string
}): SelfContradictionDetectorSnapshot {
  const findings: SelfContradictionFinding[] = []

  if (input.beliefSnapshot.openContradictions > 0 || input.beliefSnapshot.contradictionCount > 0) {
    const tension = clampTension(
      Math.min(1, 0.35 + input.beliefSnapshot.openContradictions * 0.12 + input.beliefSnapshot.contradictionCount * 0.04),
    )
    findings.push({
      id: makeId('self_contra'),
      domain: 'belief',
      subject: input.beliefSnapshot.openContradictionSubjects[0] || 'belief_graph',
      severity: severityForTension(tension),
      tension,
      summary: `${input.beliefSnapshot.openContradictions} open belief contradictions require consolidation.`,
      evidence: [...input.beliefSnapshot.openContradictionSubjects.slice(0, 4)],
    })
  }

  if (input.goalCompass.driftScore > 0.32) {
    const tension = clampTension(0.3 + input.goalCompass.driftScore * 0.7)
    findings.push({
      id: makeId('self_contra'),
      domain: 'goal',
      subject: input.goalCompass.priorityNarrative || 'goal_alignment',
      severity: severityForTension(tension),
      tension,
      summary: 'Goal drift is high enough to threaten coherent prioritization.',
      evidence: [input.goalCompass.valueNarrative, input.goalCompass.lastAssessmentSummary],
    })
  }

  if (input.executionAdvisor.healthScore < 0.72 || input.executionAdvisor.failureHotspots.length > 0) {
    const tension = clampTension(0.28 + (1 - input.executionAdvisor.healthScore) * 0.6)
    findings.push({
      id: makeId('self_contra'),
      domain: 'execution',
      subject: input.executionAdvisor.failureHotspots[0] || 'execution_reliability',
      severity: severityForTension(tension),
      tension,
      summary: 'Execution reliability is not yet stable enough to be assumed.',
      evidence: input.executionAdvisor.failureHotspots.slice(0, 4),
    })
  }

  if (input.reflection.governance.rollbackPressure > 0.42 || input.reflection.pendingPolicyUpdates.length > 2) {
    const tension = clampTension(
      0.26 + input.reflection.governance.rollbackPressure * 0.6 + input.reflection.pendingPolicyUpdates.length * 0.04,
    )
    findings.push({
      id: makeId('self_contra'),
      domain: 'governance',
      subject: input.reflection.governance.strategyNarrative || 'governance',
      severity: severityForTension(tension),
      tension,
      summary: 'Governance is accumulating pressure and should remain under active oversight.',
      evidence: [input.reflection.governance.deployment.deploymentNarrative, input.reflection.policyController.narrative],
    })
  }

  if (input.narrationThread && /conflict|unclear|contradict|doubt/i.test(input.narrationThread)) {
    const tension = 0.48
    findings.push({
      id: makeId('self_contra'),
      domain: 'narration',
      subject: 'self_narration',
      severity: severityForTension(tension),
      tension,
      summary: 'Narration contains internal uncertainty markers.',
      evidence: [input.narrationThread.slice(0, 220)],
    })
  }

  const criticalCount = findings.filter((finding) => finding.severity === 'critical').length
  const tensionScore = clampTension(
    findings.length
      ? findings.reduce((sum, finding) => sum + finding.tension, 0) / findings.length
      : 0.08,
  )

  return {
    openCount: findings.length,
    criticalCount,
    resolvedCount: Math.max(0, input.beliefSnapshot.contradictionCount - input.beliefSnapshot.openContradictions),
    tensionScore,
    subjects: Array.from(new Set(findings.map((finding) => finding.subject))).slice(0, 8),
    findings,
    narrative: findings.length
      ? `open=${findings.length}; critical=${criticalCount}; tension=${Math.round(tensionScore * 100)}%`
      : 'No active contradictions detected.',
    updatedAt: Date.now(),
    version: 1,
  }
}
