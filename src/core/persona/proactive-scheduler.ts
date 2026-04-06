import { personaLoopService } from './persona-loop-service'
import { personaTelemetryService } from './persona-telemetry'

class ProactiveScheduler {
  private timer: number | null = null
  private lastGreetingKey = ''

  start(intervalMs = 15 * 60 * 1000): void {
    if (typeof window === 'undefined') return
    if (this.timer) window.clearInterval(this.timer)

    this.timer = window.setInterval(() => {
      const tuned = personaLoopService.tune()
      const now = new Date()
      const hour = now.getHours()
      const segment = hour < 12 ? 'morning' : hour < 18 ? 'focus' : 'evening'
      const greetingKey = `${segment}-${now.toDateString()}`

      const maybeBusy = (window as any).nativeBridge?.checkUserBusy
      if (typeof maybeBusy === 'function') {
        Promise.resolve(maybeBusy()).then((busy: boolean) => {
          personaTelemetryService.recordInterruption(busy)
          if (busy) return
          this.emitPersonaEvent(tuned, segment, greetingKey)
        }).catch(() => {
          this.emitPersonaEvent(tuned, segment, greetingKey)
        })
        return
      }

      this.emitPersonaEvent(tuned, segment, greetingKey)
    }, intervalMs)
  }

  private emitPersonaEvent(tuned: ReturnType<typeof personaLoopService.tune>, segment: string, greetingKey: string): void {
    if (this.lastGreetingKey === greetingKey && segment !== 'focus') {
      return
    }
    this.lastGreetingKey = greetingKey

    window.dispatchEvent(
      new CustomEvent('persona:tuned', {
        detail: {
          ...tuned,
          socialSegment: segment,
          telemetry: personaTelemetryService.get(),
        },
      }),
    )
  }

  stop(): void {
    if (typeof window === 'undefined') return
    if (!this.timer) return
    window.clearInterval(this.timer)
    this.timer = null
  }
}

export const proactiveScheduler = new ProactiveScheduler()
