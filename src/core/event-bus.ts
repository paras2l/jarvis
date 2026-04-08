import { eventBus } from '@/event_system/event_bus'
import { eventPublisher } from '@/event_system/event_publisher'
import type { EventEnvelope } from '@/event_system/event_types'

export type RuntimeEventMap = {
  'runtime.started': { timestamp: number }
  'runtime.stopped': { timestamp: number }
  'loop.tick': { loopId: string; timestamp: number }
  'context.updated': { snapshot: RuntimeContextSnapshot }
  'prediction.generated': { prediction: PredictionSignal }
  'task.scheduled': { id: string; title: string; runAt: number }
  'task.executed': { id: string; success: boolean; result?: unknown; error?: string }
  'reflection.ready': { reflection: ReflectionSummary }
  'voice.wake': { transcript: string; timestamp: number }
  'voice.command': { command: string; transcript: string; timestamp: number }
  'voice.face_blocked': { transcript: string; reason: string; timestamp: number }
  'vision.snapshot': { text: string; confidence: number; timestamp: number }
}

export interface RuntimeContextSnapshot {
  timestamp: number
  activeWindowTitle: string
  foregroundApp?: string
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'
  recentConversationSummary: string
  systemBusy: boolean
  activeApplications?: string[]
  userActivity?: string
  screenSummary?: string
  pendingNotifications?: Array<{
    source: string
    title: string
    importance: 'info' | 'high' | 'critical'
  }>
  calendarSignals?: string[]
  lastUserCommand?: string
  deviceState?: {
    localDeviceId: string
    localDeviceStatus: 'online' | 'offline' | 'sleep'
    activeDeviceCount: number
    totalDeviceCount: number
    capabilities: string[]
  }
}

export interface PredictionSignal {
  id: string
  reason: string
  confidence: number
  suggestedAction: string
}

export interface ReflectionSummary {
  taskId: string
  success: boolean
  notes: string
  optimization?: string
  timestamp: number
}

type EventKey = keyof RuntimeEventMap
type EventHandler<T extends EventKey> = (payload: RuntimeEventMap[T]) => void | Promise<void>

const LEGACY_TO_SYSTEM_EVENT: Partial<Record<EventKey, 'runtime_started' | 'runtime_stopped' | 'runtime_tick' | 'context_updated' | 'prediction_generated' | 'task_scheduled' | 'task_completed' | 'task_failed' | 'reflection_ready' | 'vision_snapshot'>> = {
  'runtime.started': 'runtime_started',
  'runtime.stopped': 'runtime_stopped',
  'loop.tick': 'runtime_tick',
  'context.updated': 'context_updated',
  'prediction.generated': 'prediction_generated',
  'task.scheduled': 'task_scheduled',
  'reflection.ready': 'reflection_ready',
  'vision.snapshot': 'vision_snapshot',
}

class LegacyRuntimeEventBus {
  private handlers: Map<EventKey, Set<EventHandler<any>>> = new Map()

  on<T extends EventKey>(event: T, handler: EventHandler<T>): () => void {
    const set = this.handlers.get(event) || new Set()
    set.add(handler)
    this.handlers.set(event, set)
    return () => {
      set.delete(handler)
      if (!set.size) {
        this.handlers.delete(event)
      }
    }
  }

  async emit<T extends EventKey>(event: T, payload: RuntimeEventMap[T]): Promise<void> {
    const set = this.handlers.get(event)
    const handlers = set ? Array.from(set) : []
    const localDeliveries = handlers.map((handler) => Promise.resolve(handler(payload)).then(() => undefined))

    let mapped: 'runtime_started' | 'runtime_stopped' | 'runtime_tick' | 'context_updated' | 'prediction_generated' | 'task_scheduled' | 'task_completed' | 'task_failed' | 'reflection_ready' | 'vision_snapshot' | undefined

    if (event === 'task.executed') {
      const taskResult = payload as RuntimeEventMap['task.executed']
      mapped = taskResult.success ? 'task_completed' : 'task_failed'
    } else {
      mapped = LEGACY_TO_SYSTEM_EVENT[event]
    }

    if (mapped) {
      await eventPublisher.publish(mapped, this.mapLegacyPayload(mapped, event, payload), 'runtime')
    }

    await Promise.allSettled(localDeliveries)
  }

  history(limit = 50): Array<EventEnvelope> {
    return eventBus.historyFor('*', limit)
  }

  stats(): { listeners: number; systemListeners: number } {
    return {
      listeners: Array.from(this.handlers.values()).reduce((count, set) => count + set.size, 0),
      systemListeners: eventBus.listenerCount('*'),
    }
  }

  private mapLegacyPayload<T extends EventKey>(
    mapped: 'runtime_started' | 'runtime_stopped' | 'runtime_tick' | 'context_updated' | 'prediction_generated' | 'task_scheduled' | 'task_completed' | 'task_failed' | 'reflection_ready' | 'vision_snapshot',
    event: T,
    payload: RuntimeEventMap[T],
  ): unknown {
    switch (mapped) {
      case 'runtime_started':
        return { timestamp: (payload as RuntimeEventMap['runtime.started']).timestamp, mode: 'runtime' }
      case 'runtime_stopped':
        return { timestamp: (payload as RuntimeEventMap['runtime.stopped']).timestamp }
      case 'runtime_tick':
        return {
          cycle: (payload as RuntimeEventMap['loop.tick']).timestamp,
          timestamp: (payload as RuntimeEventMap['loop.tick']).timestamp,
          queueSize: 0,
        }
      case 'context_updated':
        return payload as RuntimeEventMap['context.updated']
      case 'prediction_generated':
        return payload as RuntimeEventMap['prediction.generated']
      case 'task_scheduled':
        return payload as RuntimeEventMap['task.scheduled']
      case 'task_completed':
      case 'task_failed':
        {
          const taskPayload = payload as RuntimeEventMap['task.executed']
          return {
            taskId: taskPayload.id,
            success: taskPayload.success,
            result: taskPayload.result,
            error: taskPayload.error,
          }
        }
      case 'reflection_ready':
        return payload as RuntimeEventMap['reflection.ready']
      case 'vision_snapshot':
        return payload as RuntimeEventMap['vision.snapshot']
      default:
        return { event, payload }
    }
  }
}

export const runtimeEventBus = new LegacyRuntimeEventBus()
