import { eventPublisher } from '@/event_system/event_publisher'
import { globalWorkspaceLayer } from '@/layers/global_workspace/global_workspace_layer'
import { memoryManager } from '@/layers/memory/memory_manager'
import { SensorSignal } from './types'

export class SensorMonitor {
  private recentSignals: SensorSignal[] = []

  async ingestSignal(input: Omit<SensorSignal, 'signalId'>): Promise<SensorSignal> {
    const signal: SensorSignal = {
      ...input,
      signalId: `signal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }

    this.recentSignals.unshift(signal)
    this.recentSignals = this.recentSignals.slice(0, 300)

    await globalWorkspaceLayer.publishPerception({
      source: 'perception',
      content: `${signal.channel}:${signal.level} ${signal.message}`,
      confidence: signal.confidence,
      metadata: {
        signalId: signal.signalId,
        channel: signal.channel,
        level: signal.level,
      },
    })

    memoryManager.recordEpisode('sensor_signal_detected', {
      signalId: signal.signalId,
      channel: signal.channel,
      level: signal.level,
      message: signal.message,
      data: signal.data,
    }, {
      tags: ['perception', 'sensor', signal.channel, signal.level],
      importance: signal.level === 'critical' ? 0.95 : signal.confidence,
      success: signal.level !== 'critical',
      summary: signal.message,
    })

    void eventPublisher.sensorSignalDetected({
      signalId: signal.signalId,
      channel: signal.channel,
      level: signal.level,
      message: signal.message,
      confidence: signal.confidence,
    })

    return signal
  }

  listRecent(limit = 50): SensorSignal[] {
    return this.recentSignals.slice(0, limit)
  }

  getChannelHealth(): Record<string, { count: number; criticalCount: number; avgConfidence: number }> {
    const grouped: Record<string, { count: number; criticalCount: number; confidenceSum: number }> = {}

    for (const signal of this.recentSignals) {
      const key = signal.channel
      if (!grouped[key]) {
        grouped[key] = { count: 0, criticalCount: 0, confidenceSum: 0 }
      }
      grouped[key].count += 1
      grouped[key].confidenceSum += signal.confidence
      if (signal.level === 'critical') {
        grouped[key].criticalCount += 1
      }
    }

    const health: Record<string, { count: number; criticalCount: number; avgConfidence: number }> = {}
    for (const key of Object.keys(grouped)) {
      const entry = grouped[key]
      health[key] = {
        count: entry.count,
        criticalCount: entry.criticalCount,
        avgConfidence: entry.count > 0 ? entry.confidenceSum / entry.count : 0,
      }
    }
    return health
  }
}

export const sensorMonitor = new SensorMonitor()
