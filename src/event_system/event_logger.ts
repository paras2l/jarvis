import { eventSubscriber } from './event_subscriber'
import { eventBus } from './event_bus'
import type { EventEnvelope, EventHistoryEntry } from './event_types'

type LogSink = 'console' | 'memory' | 'storage'

class EventLogger {
  private enabled = true
  private sinks: LogSink[] = ['console', 'storage']
  private storageKey = 'Pixi.event.log'
  private logCount = 0

  constructor() {
    this.attachDefaultListeners()
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  configure(sinks: LogSink[]): void {
    this.sinks = Array.from(new Set(sinks))
  }

  getRecent(limit = 100): EventHistoryEntry[] {
    return eventBus.historyFor('*', limit)
  }

  record(envelope: EventEnvelope, outcome: { deliveredTo: number; failedToDeliver: number; durationMs: number }): void {
    if (!this.enabled) return

    this.logCount += 1
    const line = {
      logId: this.logCount,
      eventId: envelope.id,
      name: envelope.name,
      source: envelope.source,
      timestamp: envelope.timestamp,
      correlationId: envelope.correlationId,
      payload: envelope.payload,
      deliveredTo: outcome.deliveredTo,
      failedToDeliver: outcome.failedToDeliver,
      durationMs: outcome.durationMs,
    }

    if (this.sinks.includes('console')) {
      console.log(`[EventLogger] ${envelope.name}`, line)
    }

    if (this.sinks.includes('storage')) {
      this.persist(line)
    }

    if (this.sinks.includes('memory')) {
      void this.persistToMemory(envelope)
    }
  }

  private attachDefaultListeners(): void {
    eventSubscriber.subscribe('*', async (envelope) => {
      if (!this.enabled) return
      this.record(envelope, {
        deliveredTo: eventBus.listenerCount(envelope.name),
        failedToDeliver: 0,
        durationMs: 0,
      })
    }, { priority: -1000 })
  }

  private persist(entry: Record<string, unknown>): void {
    try {
      const existing = this.loadStorage()
      existing.push(entry)
      localStorage.setItem(this.storageKey, JSON.stringify(existing.slice(-1000)))
    } catch {
      // Ignore storage failures.
    }
  }

  private async persistToMemory(envelope: EventEnvelope): Promise<void> {
    if (typeof window === 'undefined') return
    try {
      const bridge = window.nativeBridge as { memory?: { save?: (key: string, value: Record<string, unknown>) => Promise<void> } } | undefined
      if (bridge?.memory?.save) {
        await bridge.memory.save(`event:${envelope.name}:${envelope.id}`, {
          event: envelope.name,
          source: envelope.source,
          payload: envelope.payload,
          timestamp: envelope.timestamp,
        })
      }
    } catch {
      // Memory bridge is optional.
    }
  }

  private loadStorage(): Record<string, unknown>[] {
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (!raw) return []
      const parsed = JSON.parse(raw) as Record<string, unknown>[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
}

export const eventLogger = new EventLogger()

