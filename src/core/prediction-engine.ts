import { PredictionSignal, RuntimeContextSnapshot, runtimeEventBus } from '@/core/event-bus'

class PredictionEngine {
  private cooldownByReason = new Map<string, number>()

  async infer(context: RuntimeContextSnapshot): Promise<PredictionSignal[]> {
    const predictions: PredictionSignal[] = []
    const active = `${context.activeWindowTitle} ${context.foregroundApp || ''}`.toLowerCase()

    if (this.isOffCooldown('trading_research', 5 * 60_000) && /(tradingview|binance|metatrader|stocks?|crypto)/i.test(active)) {
      predictions.push(this.createSignal(
        'trading_research',
        'Detected trading workflow in foreground app.',
        0.82,
        'launch_research_agent: gather market news and summarize actionable events'
      ))
    }

    if (this.isOffCooldown('focus_break', 30 * 60_000) && context.timeOfDay === 'night' && context.systemBusy) {
      predictions.push(this.createSignal(
        'focus_break',
        'Sustained late-night intensive activity detected.',
        0.64,
        'proactive_reminder: suggest hydration and a 5-minute reset'
      ))
    }

    for (const prediction of predictions) {
      await runtimeEventBus.emit('prediction.generated', { prediction })
    }

    return predictions
  }

  private createSignal(id: string, reason: string, confidence: number, suggestedAction: string): PredictionSignal {
    this.cooldownByReason.set(id, Date.now())
    return {
      id: `${id}_${Date.now()}`,
      reason,
      confidence,
      suggestedAction,
    }
  }

  private isOffCooldown(reason: string, cooldownMs: number): boolean {
    const last = this.cooldownByReason.get(reason)
    if (!last) return true
    return Date.now() - last >= cooldownMs
  }
}

export const predictionEngine = new PredictionEngine()
