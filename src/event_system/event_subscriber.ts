import { eventBus } from './event_bus'
import type { EventEnvelope, EventPattern, EventSubscriptionOptions, SystemEventName } from './event_types'

export interface SubscriptionHandle {
  id: string
  pattern: EventPattern
  unsubscribe: () => void
}

class EventSubscriber {
  subscribe<TName extends SystemEventName>(
    pattern: EventPattern,
    listener: (envelope: EventEnvelope<TName extends SystemEventName ? unknown : never>) => void | Promise<void>,
    options: EventSubscriptionOptions = {},
  ): SubscriptionHandle {
    const unsubscribe = eventBus.subscribe(pattern, listener as never, options)
    return {
      id: `handle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      pattern,
      unsubscribe,
    }
  }

  once<TName extends SystemEventName>(
    pattern: EventPattern,
    listener: (envelope: EventEnvelope<TName extends SystemEventName ? unknown : never>) => void | Promise<void>,
    options: Omit<EventSubscriptionOptions, 'once'> = {},
  ): SubscriptionHandle {
    const unsubscribe = eventBus.once(pattern, listener as never, options)
    return {
      id: `once_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      pattern,
      unsubscribe,
    }
  }

  onContext(listener: (envelope: EventEnvelope) => void | Promise<void>) {
    return this.subscribe('context_updated', listener)
  }

  onTaskUpdates(listener: (envelope: EventEnvelope) => void | Promise<void>) {
    return this.subscribe('task_*', listener)
  }

  onCommands(listener: (envelope: EventEnvelope) => void | Promise<void>) {
    return this.subscribe('command_*', listener)
  }

  onErrors(listener: (envelope: EventEnvelope) => void | Promise<void>) {
    return this.subscribe('error_occurred', listener)
  }

  onMemory(listener: (envelope: EventEnvelope) => void | Promise<void>) {
    return this.subscribe('memory_*', listener)
  }
}

export const eventSubscriber = new EventSubscriber()
