import { eventPublisher } from '@/event_system/event_publisher'

export interface ActionLogEntry {
  id: string
  timestamp: number
  actionId: string
  description: string
  type: 'reactive' | 'proactive'
  source: string
  confidence: number
  utility: number
  risk: number
  approved: boolean
  approvedAt?: number
  executed: boolean
  executedAt?: number
  success?: boolean
  error?: string
  reasoning: string
}

export class ActionLogger {
  private logs: ActionLogEntry[] = []
  private readonly maxLogs = 2000

  log(entry: Omit<ActionLogEntry, 'id' | 'timestamp'>): ActionLogEntry {
    const logged: ActionLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      ...entry,
    }

    this.logs.push(logged)
    if (this.logs.length > this.maxLogs) {
      this.logs.splice(0, this.logs.length - this.maxLogs)
    }

    this.publishLogEvent(logged)

    return logged
  }

  approve(actionId: string): void {
    const entry = this.logs.find((l) => l.actionId === actionId)
    if (entry) {
      entry.approvedAt = Date.now()
      entry.approved = true
    }
  }

  execute(actionId: string, result: { success: boolean; error?: string }): void {
    const entry = this.logs.find((l) => l.actionId === actionId)
    if (entry) {
      entry.executedAt = Date.now()
      entry.executed = true
      entry.success = result.success
      entry.error = result.error
    }
  }

  recent(limit = 50): ActionLogEntry[] {
    return this.logs.slice(-Math.max(1, limit))
  }

  getByType(type: 'reactive' | 'proactive', limit = 30): ActionLogEntry[] {
    return this.logs.filter((l) => l.type === type).slice(-Math.max(1, limit))
  }

  private publishLogEvent(entry: ActionLogEntry): void {
    void eventPublisher.actionLogged(
      {
        actionId: entry.actionId,
        description: entry.description,
        type: entry.type,
        confidence: entry.confidence,
        utility: entry.utility,
        timestamp: entry.timestamp,
      },
      'intentional-agency',
    )
  }
}

export const actionLogger = new ActionLogger()
