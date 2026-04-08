export type GoalStatus = 'active' | 'blocked' | 'deferred' | 'completed'
export type TaskStatus = 'pending' | 'active' | 'waiting' | 'completed' | 'failed'
export type ConstraintType = 'safety' | 'permission' | 'resource' | 'operational'

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

  return { valid: true }
}
