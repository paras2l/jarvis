export type PixiStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked'

export type PixiAgentRole =
  | 'ManagerAgent'
  | 'ResearchAgent'
  | 'AnalysisAgent'
  | 'CodingAgent'
  | 'VideoAgent'
  | 'AutomationAgent'
  | 'CommunicationAgent'
  | 'LearningAgent'
  | 'PredictionAgent'
  | 'MonitoringAgent'

export type PixiStepKind =
  | 'research'
  | 'analysis'
  | 'code'
  | 'creative'
  | 'market'
  | 'automation'
  | 'communication'
  | 'summary'

export interface PixiPlanStep {
  id: string
  title: string
  description: string
  kind: PixiStepKind
  role: PixiAgentRole
  skillHints: string[]
  requiresApproval: boolean
  dependsOn: string[]
}

export interface PixiPlan {
  id: string
  goal: string
  interpretedIntent: string
  createdAt: number
  steps: PixiPlanStep[]
}

export interface PixiStepExecutionResult {
  stepId: string
  status: PixiStepStatus
  output: string
  data?: Record<string, unknown>
  error?: string
  startedAt: number
  finishedAt: number
}

export interface PixiExecutionReport {
  plan: PixiPlan
  status: 'completed' | 'partial' | 'failed'
  summary: string
  results: PixiStepExecutionResult[]
  completedAt: number
  context?: PixiContextModel
  worldModelDecision?: PixiWorldModelDecision
}

export interface PixiContextModel {
  observedAt: number
  currentApplication: string
  activeApplications: string[]
  userActivity: string
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'
  systemBusy: boolean
  pendingNotificationCount: number
  calendarSignals: string[]
  lastUserCommand?: string
  contextUrgency: 'low' | 'medium' | 'high'
  contextSummary: string
  deviceState?: {
    localDeviceId: string
    localDeviceStatus: 'online' | 'offline' | 'sleep'
    activeDeviceCount: number
    totalDeviceCount: number
    capabilities: string[]
  }
}

export interface PixiWorldModelDecision {
  selectedStrategyId: string
  selectedRationale: string
  options: Array<{
    strategyId: string
    title: string
    risk: 'low' | 'medium' | 'high'
    confidence: number
    rationale: string
  }>
}

export interface PixiAssignedStep extends PixiPlanStep {
  assignedAgentId: string
  assignedAgentName: string
}

export interface PixiAssignedPlan {
  plan: PixiPlan
  assignments: PixiAssignedStep[]
}

export interface PixiApprovalRequest {
  id: string
  action: string
  reason: string
  payload?: Record<string, unknown>
}

export interface PixiApprovalDecision {
  approved: boolean
  reason?: string
}

