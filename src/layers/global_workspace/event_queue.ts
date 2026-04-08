import type { WorkspaceEvent } from './workspace_schema'

export interface QueuedWorkspaceEvent {
  event: WorkspaceEvent
  priority: number
  enqueuedAt: number
}

export class WorkspaceEventQueue {
  private queue: QueuedWorkspaceEvent[] = []

  enqueue(event: WorkspaceEvent): void {
    this.queue.push({
      event,
      priority: event.priority,
      enqueuedAt: Date.now(),
    })

    this.queue.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return a.enqueuedAt - b.enqueuedAt
    })
  }

  dequeue(): WorkspaceEvent | undefined {
    const next = this.queue.shift()
    return next?.event
  }

  drain(limit = 100): WorkspaceEvent[] {
    const events: WorkspaceEvent[] = []
    const max = Math.max(1, limit)
    while (events.length < max && this.queue.length > 0) {
      const next = this.dequeue()
      if (!next) break
      events.push(next)
    }
    return events
  }

  size(): number {
    return this.queue.length
  }
}

export const workspaceEventQueue = new WorkspaceEventQueue()
