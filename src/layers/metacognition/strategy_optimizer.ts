import type { EvaluationScore } from './evaluation_metrics'

export interface StrategySnapshot {
  executionThreshold: number
  explorationMode: boolean
  failureStreak: number
  successStreak: number
  updatedAt: number
}

export interface StrategyHistoryEntry {
  id: string
  timestamp: number
  reason: string
  before: StrategySnapshot
  after: StrategySnapshot
  metrics: EvaluationScore
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export class StrategyOptimizer {
  private strategy: StrategySnapshot = {
    executionThreshold: 0.7,
    explorationMode: false,
    failureStreak: 0,
    successStreak: 0,
    updatedAt: Date.now(),
  }

  private history: StrategyHistoryEntry[] = []

  getStrategy(): StrategySnapshot {
    return { ...this.strategy }
  }

  getHistory(limit = 50): StrategyHistoryEntry[] {
    return this.history.slice(-Math.max(1, limit))
  }

  applyEvaluation(metrics: EvaluationScore): StrategySnapshot {
    const before = this.getStrategy()
    const next = { ...before }

    if (metrics.utilityScore < 0.45 || metrics.taskCompletionRate < 0.4) {
      next.failureStreak += 1
      next.successStreak = 0
      next.executionThreshold = clamp(next.executionThreshold + 0.03, 0.62, 0.9)
    } else {
      next.successStreak += 1
      next.failureStreak = 0
      next.executionThreshold = clamp(next.executionThreshold - 0.02, 0.6, 0.85)
    }

    next.explorationMode = next.failureStreak >= 3
    next.updatedAt = Date.now()

    this.strategy = next
    this.history.push({
      id: `meta_strategy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      reason: next.explorationMode ? 'failure_streak_exploration' : 'metric_adjustment',
      before,
      after: this.getStrategy(),
      metrics,
    })

    if (this.history.length > 400) {
      this.history.splice(0, this.history.length - 400)
    }

    return this.getStrategy()
  }
}

export const strategyOptimizer = new StrategyOptimizer()
