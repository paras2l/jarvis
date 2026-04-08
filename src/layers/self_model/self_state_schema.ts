export type GoalStatus = 'active' | 'blocked' | 'deferred' | 'completed'
export type TaskStatus = 'pending' | 'active' | 'waiting' | 'completed' | 'failed'
export type ConstraintType = 'safety' | 'permission' | 'resource' | 'operational'

export interface SelfModelWorkspaceSnapshot {
  beliefCount: number
  contradictionCount: number
  openContradictions: number
  coherenceScore: number
  trustScore: number
  beliefHighlights: string[]
  dominantDomains: Array<{ domain: string; count: number; averageConfidence: number; openContradictions: number }>
  recentBeliefs: string[]
  openContradictionSubjects: string[]
  revisionCount: number
  edgeCount: number
  graphHealth: number
  updatedAt: number
}

export type SelfGoalStatus = 'active' | 'paused' | 'achieved' | 'blocked' | 'archived'
export type SelfGoalTier = 'vision' | 'principle' | 'objective' | 'commitment'

export interface SelfValueAxis {
  name: string
  description: string
  weight: number
  source: string
  category?: string
  enforcementLevel?: 'soft' | 'hard'
  linkedGoalIds?: string[]
  policyIds?: string[]
  confidence?: number
}

export interface SelfGoalRelationship {
  fromGoalId: string
  toGoalId: string
  type: 'supports' | 'blocks' | 'refines' | 'depends_on'
  strength: number
  createdAt: number
  updatedAt: number
  reason: string
}

export interface SelfGoalAssessmentRecord {
  timestamp: number
  description: string
  action: string
  alignmentScore: number
  driftScore: number
  matchedGoalIds: string[]
  matchedValues: string[]
  conflictValues: string[]
  recommendedPriority: 'urgent' | 'high' | 'medium' | 'low'
  shouldClarify: boolean
  summary: string
  focusGoalId?: string
}

export interface SelfExecutionPattern {
  signature: string
  taskType: string
  attempts: number
  successes: number
  failures: number
  successRate: number
  averageRisk: number
  averageDurationMs: number
  lastOutcomeAt: number
  lastFailureReason?: string
}

export interface SelfExecutionOutcome {
  id: string
  timestamp: number
  taskType: string
  commandSignature: string
  success: boolean
  reason: string
  durationMs: number
  riskScore: number
  confidence: number
  goalAlignmentScore: number
  goalDriftScore: number
  decision: 'execute' | 'clarify' | 'defer' | 'block'
}

export interface SelfExecutionAdvisorSnapshot {
  patterns: SelfExecutionPattern[]
  recentOutcomes: SelfExecutionOutcome[]
  failureHotspots: string[]
  adaptiveThreshold: number
  adaptiveRiskCap: number
  adaptiveClarifyBias: number
  healthScore: number
  narrative: string
  updatedAt: number
  version: number
}

export interface SelfReflectionInsight {
  id: string
  timestamp: number
  category: 'reliability' | 'risk' | 'clarity' | 'alignment' | 'efficiency'
  severity: 'low' | 'medium' | 'high'
  summary: string
  recommendation: string
  confidence: number
}

export interface SelfReflectionPolicyUpdate {
  id: string
  timestamp: number
  status: 'pending' | 'applied' | 'rejected'
  reason: string
  minConfidence?: number
  maxRisk?: number
  clarifyBiasDelta?: number
}

export interface SelfReflectionSnapshot {
  cycleCount: number
  successTrend: number
  riskTrend: number
  confidenceTrend: number
  alignmentTrend: number
  insights: SelfReflectionInsight[]
  pendingPolicyUpdates: SelfReflectionPolicyUpdate[]
  appliedPolicyUpdates: SelfReflectionPolicyUpdate[]
  executionGuardrails: {
    minConfidence: number
    maxRisk: number
    clarifyBias: number
    blockSensitiveWhenUncertain: boolean
  }
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

export interface SelfContradictionFinding {
  id: string
  domain: 'belief' | 'goal' | 'execution' | 'reflection' | 'governance' | 'narration'
  subject: string
  severity: 'low' | 'medium' | 'high' | 'critical'
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

export type SelfNarrationSource = 'bootstrap' | 'input' | 'outcome' | 'transition' | 'goal' | 'system' | 'reflection' | 'network'

export interface SelfNarrationEntry {
  id: string
  timestamp: number
  source: SelfNarrationSource
  focus: string
  summary: string
  confidence: number
  tags: string[]
}

export interface SelfNarrationStream {
  entries: SelfNarrationEntry[]
  currentThread: string
  lastEventAt: number
  narrative: string
  updatedAt: number
  version: number
}

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
  dominantNeed: SelfNeedKey | 'stability'
  dominantTension: string
  narrative: string
  components: SelfUnifiedStateComponents
  updatedAt: number
  version: number
}

export interface SelfGoalNode {
  id: string
  tier: SelfGoalTier
  title: string
  description: string
  priority: number
  status: SelfGoalStatus
  progress: number
  parentId?: string
  childIds: string[]
  alignedValues: string[]
  conflictValues: string[]
  confidence: number
  createdAt: number
  updatedAt: number
  lastObservedAt: number
  persistent: boolean
}

export interface SelfGoalCompassSnapshot {
  goals: SelfGoalNode[]
  valueAxes: SelfValueAxis[]
  activeGoalIds: string[]
  pausedGoalIds: string[]
  archivedGoalIds: string[]
  alignmentScore: number
  driftScore: number
  priorityNarrative: string
  valueNarrative: string
  lastAssessmentSummary: string
  recentAssessments: SelfGoalAssessmentRecord[]
  goalRelationships: SelfGoalRelationship[]
  updatedAt: number
  version: number
}

export interface SelfGoal {
  id: string
  description: string
  priority: number
  status: GoalStatus
  progress: number
  updatedAt: number
}

export interface SelfTask {
  id: string
  description: string
  canonicalAction: string
  status: TaskStatus
  priority: number
  confidence: number
  goalId?: string
  context?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface SelfConstraint {
  id: string
  type: ConstraintType
  rule: string
  active: boolean
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export interface SelfCapabilityState {
  available: string[]
  degraded: string[]
  unavailable: string[]
}

export interface SelfModelState {
  agentId: string
  sessionId: string
  runtimeMode: 'active' | 'observe' | 'idle'
  goals: SelfGoal[]
  tasks: SelfTask[]
  confidenceCurrent: number
  confidenceHistory: Array<{ timestamp: number; value: number }>
  moodLabel: 'calm' | 'focused' | 'excited' | 'stressed' | 'neutral'
  moodIntensity: number
  stressLevel: number
  constraints: SelfConstraint[]
  capabilities: SelfCapabilityState
  currentFocus: string
  interruptibility: 'high' | 'medium' | 'low'
  lastUpdateTs: number
  stalenessMs: number
  stateVersion: number
  beliefSnapshot: SelfModelWorkspaceSnapshot
  beliefHighlights: string[]
  goalCompass: SelfGoalCompassSnapshot
  executionAdvisor: SelfExecutionAdvisorSnapshot
  reflection: SelfReflectionSnapshot
  contradictionDetector: SelfContradictionDetectorSnapshot
  needsScoreboard: SelfNeedsScoreboard
  narrationStream: SelfNarrationStream
  unifiedState: SelfUnifiedState
  lastDecisionId?: string
  lastEventId?: string
  lastErrorId?: string
}

export interface SelfStateTransition {
  sourceLayer: string
  reason: string
  priority: number
  timestamp: number
  patch: Partial<SelfModelState>
}

export function createInitialSelfState(agentId: string, sessionId: string): SelfModelState {
  const now = Date.now()
  return {
    agentId,
    sessionId,
    runtimeMode: 'active',
    goals: [],
    tasks: [],
    confidenceCurrent: 0.72,
    confidenceHistory: [{ timestamp: now, value: 0.72 }],
    moodLabel: 'neutral',
    moodIntensity: 0.4,
    stressLevel: 0.25,
    constraints: [
      {
        id: 'constraint_safety_default',
        type: 'safety',
        rule: 'Never execute high-risk actions without explicit policy approval.',
        active: true,
        severity: 'critical',
      },
    ],
    capabilities: {
      available: ['chat', 'voice', 'task_execution', 'app_launch'],
      degraded: [],
      unavailable: [],
    },
    currentFocus: 'idle',
    interruptibility: 'high',
    lastUpdateTs: now,
    stalenessMs: 0,
    stateVersion: 1,
    beliefSnapshot: {
      beliefCount: 0,
      contradictionCount: 0,
      openContradictions: 0,
      coherenceScore: 1,
      trustScore: 0.72,
      beliefHighlights: [],
      dominantDomains: [],
      recentBeliefs: [],
      openContradictionSubjects: [],
      revisionCount: 0,
      edgeCount: 0,
      graphHealth: 1,
      updatedAt: now,
    },
    beliefHighlights: [],
    goalCompass: {
      goals: [],
      valueAxes: [],
      activeGoalIds: [],
      pausedGoalIds: [],
      archivedGoalIds: [],
      alignmentScore: 1,
      driftScore: 0,
      priorityNarrative: 'No goals established yet.',
      valueNarrative: 'No value axes established yet.',
      lastAssessmentSummary: 'No goal assessments recorded yet.',
      recentAssessments: [],
      goalRelationships: [],
      updatedAt: now,
      version: 1,
    },
    executionAdvisor: {
      patterns: [],
      recentOutcomes: [],
      failureHotspots: [],
      adaptiveThreshold: 0.62,
      adaptiveRiskCap: 0.75,
      adaptiveClarifyBias: 0.25,
      healthScore: 0.8,
      narrative: 'Execution advisor warming up.',
      updatedAt: now,
      version: 1,
    },
    reflection: {
      cycleCount: 0,
      successTrend: 0.75,
      riskTrend: 0.3,
      confidenceTrend: 0.72,
      alignmentTrend: 0.78,
      insights: [],
      pendingPolicyUpdates: [],
      appliedPolicyUpdates: [],
      executionGuardrails: {
        minConfidence: 0.62,
        maxRisk: 0.78,
        clarifyBias: 0.25,
        blockSensitiveWhenUncertain: true,
      },
      simulation: {
        lastRunAt: 0,
        scenarioCount: 0,
        recommendedMinConfidence: 0.62,
        recommendedMaxRisk: 0.78,
        recommendedClarifyBias: 0.25,
        confidence: 0.5,
        narrative: 'Simulation not executed yet.',
      },
      policyController: {
        autonomyLevel: 'balanced',
        governanceScore: 0.75,
        pending: 0,
        applied: 0,
        rejected: 0,
        rollbacks: 0,
        narrative: 'Policy controller warming up.',
      },
      governance: {
        freezeMode: 'monitor',
        freezeReason: 'Governance monitor active.',
        autonomyMode: 'hybrid',
        readinessScore: 0.74,
        deploymentScore: 0.72,
        rollbackPressure: 0.22,
        approvalQueueSize: 0,
        blockedCount: 0,
        deferredCount: 0,
        clarificationCount: 0,
        appliedCount: 0,
        recentRollbacks: [],
        strategyNarrative: 'Governance calibration warming up.',
        deployment: {
          activeVersion: 1,
          rolloutState: 'idle',
          rolloutPressure: 0.24,
          proposalCount: 0,
          recordCount: 0,
          canaryApprovalRate: 0,
          canarySafetyScore: 0,
          deploymentNarrative: 'Deployment pipeline ready.',
          history: {
            totalEvents: 0,
            recentEvents: [],
            narrative: 'No governance history recorded yet.',
          },
        },
      },
      lastReflectionSummary: 'Reflection engine warming up.',
      updatedAt: now,
      version: 1,
    },
    contradictionDetector: {
      openCount: 0,
      criticalCount: 0,
      resolvedCount: 0,
      tensionScore: 0.08,
      subjects: [],
      findings: [],
      narrative: 'No contradictions detected yet.',
      updatedAt: now,
      version: 1,
    },
    needsScoreboard: {
      overallScore: 0.76,
      overallPressure: 0.24,
      needs: [],
      priorityOrder: ['safety', 'clarity', 'trust', 'progress', 'autonomy', 'learning', 'stability'],
      narrative: 'Needs scoreboard warming up.',
      updatedAt: now,
      version: 1,
    },
    narrationStream: {
      entries: [],
      currentThread: 'boot',
      lastEventAt: now,
      narrative: 'Self-narration warming up.',
      updatedAt: now,
      version: 1,
    },
    unifiedState: {
      score: 0.78,
      percentage: 78,
      status: 'integrated',
      dominantFocus: 'boot',
      dominantNeed: 'safety',
      dominantTension: 'none',
      narrative: 'Unified self-state warming up.',
      components: {
        belief: 1,
        goal: 1,
        execution: 0.8,
        reflection: 0.78,
        governance: 0.76,
        needs: 0.76,
        contradictions: 0.92,
        narration: 0.5,
      },
      updatedAt: now,
      version: 1,
    },
  }
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function validateSelfStatePatch(patch: Partial<SelfModelState>): { valid: boolean; error?: string } {
  if (patch.confidenceCurrent !== undefined && (patch.confidenceCurrent < 0 || patch.confidenceCurrent > 1)) {
    return { valid: false, error: 'confidenceCurrent must be between 0 and 1' }
  }

  if (patch.moodIntensity !== undefined && (patch.moodIntensity < 0 || patch.moodIntensity > 1)) {
    return { valid: false, error: 'moodIntensity must be between 0 and 1' }
  }

  if (patch.stressLevel !== undefined && (patch.stressLevel < 0 || patch.stressLevel > 1)) {
    return { valid: false, error: 'stressLevel must be between 0 and 1' }
  }

  if (patch.goalCompass !== undefined) {
    if (patch.goalCompass.alignmentScore < 0 || patch.goalCompass.alignmentScore > 1) {
      return { valid: false, error: 'goalCompass.alignmentScore must be between 0 and 1' }
    }
    if (patch.goalCompass.driftScore < 0 || patch.goalCompass.driftScore > 1) {
      return { valid: false, error: 'goalCompass.driftScore must be between 0 and 1' }
    }
  }

  if (patch.beliefSnapshot !== undefined) {
    if (patch.beliefSnapshot.coherenceScore < 0 || patch.beliefSnapshot.coherenceScore > 1) {
      return { valid: false, error: 'beliefSnapshot.coherenceScore must be between 0 and 1' }
    }
    if (patch.beliefSnapshot.trustScore < 0 || patch.beliefSnapshot.trustScore > 1) {
      return { valid: false, error: 'beliefSnapshot.trustScore must be between 0 and 1' }
    }
    if (patch.beliefSnapshot.graphHealth < 0 || patch.beliefSnapshot.graphHealth > 1) {
      return { valid: false, error: 'beliefSnapshot.graphHealth must be between 0 and 1' }
    }
  }

  if (patch.executionAdvisor !== undefined) {
    if (patch.executionAdvisor.adaptiveThreshold < 0 || patch.executionAdvisor.adaptiveThreshold > 1) {
      return { valid: false, error: 'executionAdvisor.adaptiveThreshold must be between 0 and 1' }
    }
    if (patch.executionAdvisor.adaptiveRiskCap < 0 || patch.executionAdvisor.adaptiveRiskCap > 1) {
      return { valid: false, error: 'executionAdvisor.adaptiveRiskCap must be between 0 and 1' }
    }
    if (patch.executionAdvisor.adaptiveClarifyBias < 0 || patch.executionAdvisor.adaptiveClarifyBias > 1) {
      return { valid: false, error: 'executionAdvisor.adaptiveClarifyBias must be between 0 and 1' }
    }
    if (patch.executionAdvisor.healthScore < 0 || patch.executionAdvisor.healthScore > 1) {
      return { valid: false, error: 'executionAdvisor.healthScore must be between 0 and 1' }
    }
  }

  if (patch.reflection !== undefined) {
    if (patch.reflection.successTrend < 0 || patch.reflection.successTrend > 1) {
      return { valid: false, error: 'reflection.successTrend must be between 0 and 1' }
    }
    if (patch.reflection.riskTrend < 0 || patch.reflection.riskTrend > 1) {
      return { valid: false, error: 'reflection.riskTrend must be between 0 and 1' }
    }
    if (patch.reflection.confidenceTrend < 0 || patch.reflection.confidenceTrend > 1) {
      return { valid: false, error: 'reflection.confidenceTrend must be between 0 and 1' }
    }
    if (patch.reflection.alignmentTrend < 0 || patch.reflection.alignmentTrend > 1) {
      return { valid: false, error: 'reflection.alignmentTrend must be between 0 and 1' }
    }
    if (patch.reflection.executionGuardrails.minConfidence < 0 || patch.reflection.executionGuardrails.minConfidence > 1) {
      return { valid: false, error: 'reflection.executionGuardrails.minConfidence must be between 0 and 1' }
    }
    if (patch.reflection.executionGuardrails.maxRisk < 0 || patch.reflection.executionGuardrails.maxRisk > 1) {
      return { valid: false, error: 'reflection.executionGuardrails.maxRisk must be between 0 and 1' }
    }
    if (patch.reflection.executionGuardrails.clarifyBias < 0 || patch.reflection.executionGuardrails.clarifyBias > 1) {
      return { valid: false, error: 'reflection.executionGuardrails.clarifyBias must be between 0 and 1' }
    }
    if (patch.reflection.simulation.confidence < 0 || patch.reflection.simulation.confidence > 1) {
      return { valid: false, error: 'reflection.simulation.confidence must be between 0 and 1' }
    }
    if (patch.reflection.policyController.governanceScore < 0 || patch.reflection.policyController.governanceScore > 1) {
      return { valid: false, error: 'reflection.policyController.governanceScore must be between 0 and 1' }
    }
    if (patch.reflection.governance.readinessScore < 0 || patch.reflection.governance.readinessScore > 1) {
      return { valid: false, error: 'reflection.governance.readinessScore must be between 0 and 1' }
    }
    if (patch.reflection.governance.deploymentScore < 0 || patch.reflection.governance.deploymentScore > 1) {
      return { valid: false, error: 'reflection.governance.deploymentScore must be between 0 and 1' }
    }
    if (patch.reflection.governance.rollbackPressure < 0 || patch.reflection.governance.rollbackPressure > 1) {
      return { valid: false, error: 'reflection.governance.rollbackPressure must be between 0 and 1' }
    }
    if (patch.reflection.governance.deployment.rolloutPressure < 0 || patch.reflection.governance.deployment.rolloutPressure > 1) {
      return { valid: false, error: 'reflection.governance.deployment.rolloutPressure must be between 0 and 1' }
    }
    if (patch.reflection.governance.deployment.canaryApprovalRate < 0 || patch.reflection.governance.deployment.canaryApprovalRate > 1) {
      return { valid: false, error: 'reflection.governance.deployment.canaryApprovalRate must be between 0 and 1' }
    }
    if (patch.reflection.governance.deployment.canarySafetyScore < 0 || patch.reflection.governance.deployment.canarySafetyScore > 1) {
      return { valid: false, error: 'reflection.governance.deployment.canarySafetyScore must be between 0 and 1' }
    }
  }

  return { valid: true }
}
