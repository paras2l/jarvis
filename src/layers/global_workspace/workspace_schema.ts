export type WorkspaceSource =
  | 'self_model'
  | 'perception'
  | 'task_manager'
  | 'planner'
  | 'metacognition'
  | 'memory'
  | 'action'
  | 'system'

export interface WorkspacePerception {
  id: string
  source: WorkspaceSource
  content: string
  confidence: number
  timestamp: number
  metadata?: Record<string, unknown>
}

export interface WorkspaceTask {
  id: string
  description: string
  source: WorkspaceSource
  priority: number
  status: 'pending' | 'active' | 'blocked' | 'completed' | 'failed'
  confidence: number
  timestamp: number
  metadata?: Record<string, unknown>
}

export interface WorkspaceHypothesis {
  id: string
  statement: string
  source: WorkspaceSource
  confidence: number
  utility: number
  timestamp: number
  expiresAt?: number
  metadata?: Record<string, unknown>
}

export interface WorkspacePlan {
  id: string
  goal: string
  steps: string[]
  source: WorkspaceSource
  confidence: number
  utility: number
  timestamp: number
  metadata?: Record<string, unknown>
}

export interface WorkspaceEvent {
  id: string
  name: string
  source: WorkspaceSource
  timestamp: number
  payload: Record<string, unknown>
  priority: number
}

export interface WorkspaceSnapshot {
  id: string
  timestamp: number
  perceptions: WorkspacePerception[]
  tasks: WorkspaceTask[]
  hypotheses: WorkspaceHypothesis[]
  plans: WorkspacePlan[]
  lastEvents: WorkspaceEvent[]
  selectedHypothesisId?: string
  selectedPlanId?: string
  arbitrationNotes?: string
}

export interface GlobalWorkspaceState {
  perceptions: WorkspacePerception[]
  tasks: WorkspaceTask[]
  hypotheses: WorkspaceHypothesis[]
  plans: WorkspacePlan[]
  events: WorkspaceEvent[]
  snapshots: WorkspaceSnapshot[]
  selectedHypothesisId?: string
  selectedPlanId?: string
  arbitrationNotes?: string
}

export function createInitialWorkspaceState(): GlobalWorkspaceState {
  return {
    perceptions: [],
    tasks: [],
    hypotheses: [],
    plans: [],
    events: [],
    snapshots: [],
  }
}

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function validateWorkspacePayload(payload: Record<string, unknown>): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'payload must be an object' }
  }

  if ('confidence' in payload) {
    const c = Number(payload.confidence)
    if (!Number.isFinite(c) || c < 0 || c > 1) {
      return { valid: false, error: 'confidence must be between 0 and 1' }
    }
  }

  return { valid: true }
}
