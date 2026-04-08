import type {
  EventDispatchOptions,
  EventEnvelope,
  EventHistoryEntry,
  EventListener,
  EventMiddlewareResult,
  EventPattern,
  EventSubscriptionOptions,
  EventPayloadMap,
  SystemEventName,
} from './event_types'
import { createEnvelope, matchesPattern } from './event_types'

type SubscriptionRecord = {
  id: string
  pattern: EventPattern
  listener: EventListener
  once: boolean
  priority: number
}

type AnyEventEnvelope = EventEnvelope<EventPayloadMap[SystemEventName]>
type AnyEventHistoryEntry = EventHistoryEntry<EventPayloadMap[SystemEventName]>

type Middleware = (envelope: AnyEventEnvelope) => Promise<EventMiddlewareResult | void> | EventMiddlewareResult | void

class EventBus {
  private subscriptions = new Map<string, SubscriptionRecord>()
  private history: AnyEventHistoryEntry[] = []
  private middlewares: Middleware[] = []
  private paused = false
  private queue: Array<{ envelope: AnyEventEnvelope; resolve: () => void; reject: (error: unknown) => void }> = []
  private draining = false
  private readonly historyLimit = 1000

  subscribe<TName extends SystemEventName>(
    pattern: EventPattern,
    listener: EventListener<TName>,
    options: EventSubscriptionOptions = {},
  ): () => void {
    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    this.subscriptions.set(id, {
      id,
      pattern,
      listener: listener as EventListener,
      once: Boolean(options.once),
      priority: options.priority ?? 0,
    })

    if (options.replayLast) {
      void this.replay(pattern, listener as EventListener)
    }

    return () => {
      this.subscriptions.delete(id)
    }
  }

  once<TName extends SystemEventName>(
    pattern: EventPattern,
    listener: EventListener<TName>,
    options: Omit<EventSubscriptionOptions, 'once'> = {},
  ): () => void {
    return this.subscribe(pattern, listener, { ...options, once: true })
  }

  use(middleware: Middleware): () => void {
    this.middlewares.push(middleware)
    return () => {
      const index = this.middlewares.indexOf(middleware)
      if (index >= 0) {
        this.middlewares.splice(index, 1)
      }
    }
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
    void this.drainQueue()
  }

  async publish<TName extends SystemEventName>(
    name: TName,
    payload: EventPayloadMap[TName],
    options: EventDispatchOptions = {},
  ): Promise<AnyEventEnvelope> {
    const envelope = createEnvelope(name, payload, options)

    if (this.paused || options.delayMs) {
      return new Promise<AnyEventEnvelope>((resolve, reject) => {
        const enqueue = () => this.queue.push({ envelope, resolve: () => resolve(envelope), reject })
        if (options.delayMs && options.delayMs > 0) {
          globalThis.setTimeout(() => {
            enqueue()
            void this.drainQueue()
          }, options.delayMs)
        } else {
          enqueue()
        }
      })
    }

    await this.dispatch(envelope)
    return envelope
  }

  async replay(pattern: EventPattern, listener: EventListener): Promise<void> {
    for (const item of this.history) {
      if (matchesPattern(pattern, item.name)) {
        await Promise.resolve(listener(item as never))
      }
    }
  }

  historyFor(pattern: EventPattern = '*', limit = 50): EventHistoryEntry[] {
    const rows = this.history.filter((item) => matchesPattern(pattern, item.name))
    return rows.slice(-Math.max(1, limit)).reverse()
  }

  clearHistory(): void {
    this.history = []
  }

  listenerCount(pattern: EventPattern = '*'): number {
    if (pattern === '*') {
      return this.subscriptions.size
    }

    return Array.from(this.subscriptions.values()).filter((record) => {
      if (record.pattern === '*') return true
      if (record.pattern === pattern) return true
      if (record.pattern.endsWith('*')) {
        return String(pattern).startsWith(record.pattern.slice(0, -1))
      }
      return false
    }).length
  }

  stats(): { listeners: number; history: number; queued: number; paused: boolean } {
    return {
      listeners: this.subscriptions.size,
      history: this.history.length,
      queued: this.queue.length,
      paused: this.paused,
    }
  }

  async emit<TName extends SystemEventName>(
    name: TName,
    payload: EventPayloadMap[TName],
    options: EventDispatchOptions = {},
  ): Promise<void> {
    await this.publish(name, payload, options)
  }

  private async dispatch(envelope: AnyEventEnvelope): Promise<void> {
    const startedAt = Date.now()
    let deliveredTo = 0
    let failedToDeliver = 0

    for (const middleware of this.middlewares) {
      const result = await Promise.resolve(middleware(envelope))
      if (result && result.allow === false) {
        this.pushHistory(envelope, deliveredTo, failedToDeliver, Date.now() - startedAt)
        return
      }
    }

    const listeners = Array.from(this.subscriptions.values())
      .filter((record) => matchesPattern(record.pattern, envelope.name))
      .sort((left, right) => right.priority - left.priority)

    for (const record of listeners) {
      try {
        await Promise.resolve(record.listener(envelope as never))
        deliveredTo += 1
      } catch {
        failedToDeliver += 1
      }

      if (record.once) {
        this.subscriptions.delete(record.id)
      }
    }

    this.pushHistory(envelope, deliveredTo, failedToDeliver, Date.now() - startedAt)
  }

  private pushHistory(
    envelope: AnyEventEnvelope,
    deliveredTo: number,
    failedToDeliver: number,
    durationMs: number,
  ): void {
    this.history.push({
      ...envelope,
      deliveredTo,
      failedToDeliver,
      durationMs,
    })

    while (this.history.length > this.historyLimit) {
      this.history.shift()
    }
  }

  private async drainQueue(): Promise<void> {
    if (this.draining || this.paused) return
    this.draining = true

    try {
      while (!this.paused && this.queue.length > 0) {
        const item = this.queue.shift()
        if (!item) continue
        try {
          await this.dispatch(item.envelope)
          item.resolve()
        } catch (error) {
          item.reject(error)
        }
      }
    } finally {
      this.draining = false
    }
  }
}

export const eventBus = new EventBus()
