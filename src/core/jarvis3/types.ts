export type JarvisStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked'

export type JarvisAgentRole =
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

export type JarvisStepKind =
  | 'research'
  | 'analysis'
  | 'code'
  | 'creative'
  | 'market'
  | 'automation'
  | 'communication'
  | 'summary'

export interface JarvisPlanStep {
  id: string
  title: string
  description: string
  kind: JarvisStepKind
  role: JarvisAgentRole
  skillHints: string[]
  requiresApproval: boolean
  dependsOn: string[]
}

export interface JarvisPlan {
  id: string
  goal: string
  interpretedIntent: string
  createdAt: number
  steps: JarvisPlanStep[]
}

export interface JarvisStepExecutionResult {
  stepId: string
  status: JarvisStepStatus
  output: string
  data?: Record<string, unknown>
  error?: string
  startedAt: number
  finishedAt: number
}

export interface JarvisExecutionReport {
  plan: JarvisPlan
  status: 'completed' | 'partial' | 'failed'
  summary: string
  results: JarvisStepExecutionResult[]
  completedAt: number
  context?: JarvisContextModel
  worldModelDecision?: JarvisWorldModelDecision
}

export interface JarvisContextModel {
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

export interface JarvisWorldModelDecision {
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

export interface JarvisAssignedStep extends JarvisPlanStep {
  assignedAgentId: string
  assignedAgentName: string
}

export interface JarvisAssignedPlan {
  plan: JarvisPlan
  assignments: JarvisAssignedStep[]
}

export interface JarvisApprovalRequest {
  id: string
  action: string
  reason: string
  payload?: Record<string, unknown>
}

export interface JarvisApprovalDecision {
  approved: boolean
  reason?: string
}
