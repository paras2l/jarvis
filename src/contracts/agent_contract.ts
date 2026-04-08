export type AgentRole = 'main' | 'planner' | 'critic' | 'executor' | 'observer'

export interface AgentContract {
  agentId: string
  role: AgentRole
  capabilities: string[]
  active: boolean
  confidence: number
  lastHeartbeat: number
}

export interface AgentResultContract {
  taskId: string
  agentId: string
  success: boolean
  summary: string
  error?: string
  durationMs?: number
  confidence?: number
}

export function validateAgentResult(input: unknown): input is AgentResultContract {
  if (!input || typeof input !== 'object') return false
  const value = input as Partial<AgentResultContract>
  return (
    typeof value.taskId === 'string' &&
    typeof value.agentId === 'string' &&
    typeof value.success === 'boolean' &&
    typeof value.summary === 'string'
  )
}
