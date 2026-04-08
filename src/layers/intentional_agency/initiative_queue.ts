import type { EvaluatedAction } from './action_evaluator'

export interface QueuedAction {
  evaluatedAction: EvaluatedAction
  queuedAt: number
  scheduledFor?: number
  deps: string[]
  priority: number
  approvalRequired: boolean
  userApprovedAt?: number
  executedAt?: number
  result?: {
    success: boolean
    message?: string
  }
}

export class InitiativeQueue {
  private actions: QueuedAction[] = []
  private readonly maxQueueSize = 200

  enqueue(
    evaluated: EvaluatedAction,
    options?: {
      scheduledFor?: number
      deps?: string[]
      approvalRequired?: boolean
    },
  ): QueuedAction {
    const priority = Math.round(evaluated.totalScore * 100)
    const queued: QueuedAction = {
      evaluatedAction: evaluated,
      queuedAt: Date.now(),
      scheduledFor: options?.scheduledFor,
      deps: options?.deps || [],
      priority,
      approvalRequired: options?.approvalRequired ?? (evaluated.risk > 0.5 || evaluated.type === 'proactive'),
    }

    this.actions.push(queued)
    this.sortByPriority()

    if (this.actions.length > this.maxQueueSize) {
      this.actions = this.actions.slice(-this.maxQueueSize)
    }

    return queued
  }

  dequeue(): QueuedAction | undefined {
    return this.actions.shift()
  }

  peek(): QueuedAction | undefined {
    return this.actions[0]
  }

  peekApprovalRequired(): QueuedAction[] {
    return this.actions.filter((action) => action.approvalRequired && !action.userApprovedAt)
  }

  approve(actionId: string): boolean {
    const action = this.actions.find((a) => a.evaluatedAction.id === actionId)
    if (!action) return false
    action.userApprovedAt = Date.now()
    this.sortByPriority()
    return true
  }

  markExecuted(actionId: string, result: { success: boolean; message?: string }): boolean {
    const action = this.actions.find((a) => a.evaluatedAction.id === actionId)
    if (!action) return false
    action.executedAt = Date.now()
    action.result = result
    return true
  }

  reschedule(actionId: string, newScheduleTime: number): boolean {
    const action = this.actions.find((a) => a.evaluatedAction.id === actionId)
    if (!action) return false
    action.scheduledFor = newScheduleTime
    this.sortByPriority()
    return true
  }

  size(): number {
    return this.actions.length
  }

  list(): QueuedAction[] {
    return [...this.actions]
  }

  private sortByPriority(): void {
    this.actions.sort((a, b) => {
      const aReady = !a.approvalRequired && (!a.scheduledFor || a.scheduledFor <= Date.now())
      const bReady = !b.approvalRequired && (!b.scheduledFor || b.scheduledFor <= Date.now())

      if (aReady !== bReady) {
        return aReady ? -1 : 1
      }

      return b.priority - a.priority
    })
  }
}

export const initiativeQueue = new InitiativeQueue()
