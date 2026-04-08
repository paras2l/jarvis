import { runtimeEventBus } from '@/core/event-bus'
import { runtimePolicyStore } from '@/core/runtime-policy'

export interface RuntimeStatusSnapshot {
  running: boolean
  lastTickAt: number
  lastContextAt: number
  lastPredictionReason?: string
  lastVisionAt: number
  queuedMessages: number
  activeMode: string
}

class RuntimeStatusStore {
  private status: RuntimeStatusSnapshot = {
    running: false,
    lastTickAt: 0,
    lastContextAt: 0,
    lastVisionAt: 0,
    queuedMessages: 0,
    activeMode: runtimePolicyStore.get().autonomyMode,
  }
  private listeners = new Set<(status: RuntimeStatusSnapshot) => void>()

  constructor() {
    runtimeEventBus.on('runtime.started', () => {
      this.patch({ running: true })
    })
    runtimeEventBus.on('runtime.stopped', () => {
      this.patch({ running: false })
    })
    runtimeEventBus.on('loop.tick', ({ timestamp }) => {
      this.patch({ lastTickAt: timestamp, activeMode: runtimePolicyStore.get().autonomyMode })
    })
    runtimeEventBus.on('context.updated', ({ snapshot }) => {
      this.patch({ lastContextAt: snapshot.timestamp })
    })
    runtimeEventBus.on('prediction.generated', ({ prediction }) => {
      this.patch({ lastPredictionReason: prediction.reason })
    })
    runtimeEventBus.on('vision.snapshot', ({ timestamp }) => {
      this.patch({ lastVisionAt: timestamp })
    })
  }

  get(): RuntimeStatusSnapshot {
    return { ...this.status }
  }

  setQueuedMessages(count: number): void {
    this.patch({ queuedMessages: Math.max(0, count) })
  }

  subscribe(listener: (status: RuntimeStatusSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.get())
    return () => this.listeners.delete(listener)
  }

  private patch(partial: Partial<RuntimeStatusSnapshot>): void {
    this.status = { ...this.status, ...partial }
    this.listeners.forEach((listener) => listener(this.get()))
  }
}

export const runtimeStatusStore = new RuntimeStatusStore()
