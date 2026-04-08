import { eventPublisher } from '@/event_system/event_publisher'
import { narrativeMemory } from './narrative_memory'

export interface IdentityEventLog {
  id: string
  timestamp: number
  eventType: 'identity_update' | 'narrative_update' | 'promise_update' | 'context_resolution'
  source: string
  summary: string
  impact: 'low' | 'medium' | 'high'
  payload?: Record<string, unknown>
}

class IdentityEventLogger {
  private logs: IdentityEventLog[] = []
  private readonly maxLogs = 1200

  async log(entry: Omit<IdentityEventLog, 'id' | 'timestamp'>): Promise<IdentityEventLog> {
    const log: IdentityEventLog = {
      id: `id_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      ...entry,
    }

    this.logs.push(log)
    if (this.logs.length > this.maxLogs) {
      this.logs.splice(0, this.logs.length - this.maxLogs)
    }

    await narrativeMemory.append({
      type: 'system',
      summary: log.summary,
      source: log.source,
      importance: log.impact === 'high' ? 0.9 : log.impact === 'medium' ? 0.6 : 0.35,
      metadata: {
        eventType: log.eventType,
        payload: log.payload,
      },
    })

    await eventPublisher.publish(
      'reflection_ready',
      {
        reflection: {
          taskId: log.id,
          success: true,
          notes: log.summary,
          timestamp: log.timestamp,
        },
      },
      'identity-continuity',
    )

    return log
  }

  recent(limit = 100): IdentityEventLog[] {
    return this.logs.slice(-Math.max(1, limit)).reverse()
  }
}

export const identityEventLogger = new IdentityEventLogger()
