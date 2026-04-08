import { eventPublisher } from '@/event_system/event_publisher'

export interface SelfModelLogEntry {
  id: string
  level: 'info' | 'warn' | 'error'
  event: string
  timestamp: number
  context?: Record<string, unknown>
}

export class SelfModelLoggingHandler {
  private readonly maxEntries = 500
  private readonly entries: SelfModelLogEntry[] = []

  info(event: string, context?: Record<string, unknown>): void {
    this.append('info', event, context)
  }

  warn(event: string, context?: Record<string, unknown>): void {
    this.append('warn', event, context)
  }

  error(event: string, context?: Record<string, unknown>): void {
    this.append('error', event, context)
    void eventPublisher.errorOccurred(
      {
        component: 'self-model-layer',
        operation: event,
        message: 'Self-model layer error event recorded',
        context,
      },
      'self-model',
    )
  }

  recent(limit = 50): SelfModelLogEntry[] {
    return this.entries.slice(-Math.max(1, limit))
  }

  private append(level: SelfModelLogEntry['level'], event: string, context?: Record<string, unknown>): void {
    const entry: SelfModelLogEntry = {
      id: `self_log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      level,
      event,
      timestamp: Date.now(),
      context,
    }

    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
  }
}

export const selfModelLogger = new SelfModelLoggingHandler()
