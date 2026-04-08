// Layer 6 - Prediction Logger
// Logs predicted vs actual outcomes for reflective learning

import { CounterfactualResult, PredictionLogEntry } from './types'

/**
 * PredictionLogger
 *
 * Records all counterfactual simulations and their actual outcomes.
 * Provides feedback for the Reflective Learning Layer to improve
 * future prediction accuracy.
 *
 * Tracks:
 * - Predicted outcomes
 * - Actual outcomes
 * - Prediction accuracy
 * - Confidence levels
 * - Discrepancies
 */
export class PredictionLogger {
  private predictions: Map<string, PredictionLogEntry> = new Map()
  private accuracyHistory: number[] = []

  /**
   * Log a new simulation
   */
  async logSimulation(result: CounterfactualResult): Promise<void> {
    const predictionId = `pred-${result.requestId}`

    const entry: PredictionLogEntry = {
      predictionId,
      actionId: result.proposedAction.id,
      predictedOutcome: result.recommendation as any,
      predictionAccuracy: 0, // Will be updated when actual outcome is recorded
      predictionConfidence: result.recommendation.utilityScore, // Use utility as confidence proxy
      timestamp: Date.now(),
    }

    this.predictions.set(predictionId, entry)

    // TODO: Publish to event system for Reflective Learning Layer
    // eventPublisher.predictionLogged(entry, 'counterfactual-world')
  }

  /**
   * Record the actual outcome of a previously simulated action
   */
  async recordActualOutcome(
    predictionId: string,
    actualOutcome: Record<string, unknown>,
  ): Promise<void> {
    const entry = this.predictions.get(predictionId)
    if (!entry) {
      console.warn(`Prediction ${predictionId} not found in log`)
      return
    }

    // Update entry with actual outcome
    entry.actualOutcome = actualOutcome as any
    entry.completedAt = Date.now()

    // Calculate accuracy
    entry.predictionAccuracy = this.calculateAccuracy(entry.predictedOutcome, actualOutcome)

    // Track discrepancies
    entry.discrepancy = this.identifyDiscrepancy(entry.predictedOutcome, actualOutcome)

    // Update accuracy history
    this.accuracyHistory.push(entry.predictionAccuracy)

    // Keep history bounded (last 100 predictions)
    if (this.accuracyHistory.length > 100) {
      this.accuracyHistory.shift()
    }

    // TODO: Publish to event system for Reflective Learning Layer
    // eventPublisher.outcomeRecorded(entry, 'counterfactual-world')
  }

  /**
   * Calculate prediction accuracy
   */
  private calculateAccuracy(predicted: any, actual: any): number {
    // If actual success matches predicted success, score +0.5
    let score = 0

    if (predicted.predictedSuccess === (actual.success ?? true)) {
      score += 0.5
    }

    // If side effects count is within 1 of prediction, score +0.3
    const predictedEffectCount = predicted.predictedSideEffects?.length ?? 0
    const actualEffectCount = actual.sideEffects?.length ?? 0
    if (Math.abs(predictedEffectCount - actualEffectCount) <= 1) {
      score += 0.3
    }

    // If duration is within 20%, score +0.2
    const predictedDuration = predicted.estimatedDuration ?? 0
    const actualDuration = actual.duration ?? 0
    if (predictedDuration > 0 && actualDuration > 0) {
      const difference = Math.abs(predictedDuration - actualDuration)
      const tolerance = predictedDuration * 0.2
      if (difference <= tolerance) {
        score += 0.2
      }
    }

    return Math.min(1.0, score)
  }

  /**
   * Identify discrepancies between prediction and reality
   */
  private identifyDiscrepancy(predicted: any, actual: any): string | undefined {
    const discrepancies: string[] = []

    // Check success prediction
    if (predicted.predictedSuccess !== (actual.success ?? true)) {
      const actualStatus = actual.success ? 'succeeded' : 'failed'
      discrepancies.push(`Success prediction was wrong (action ${actualStatus})`)
    }

    // Check side effects
    const predictedEffects = predicted.predictedSideEffects?.length ?? 0
    const actualEffects = actual.sideEffects?.length ?? 0
    if (Math.abs(predictedEffects - actualEffects) > 1) {
      discrepancies.push(`Side effects: predicted ${predictedEffects}, actual ${actualEffects}`)
    }

    // Check duration
    const predictedDuration = predicted.estimatedDuration ?? 0
    const actualDuration = actual.duration ?? 0
    if (predictedDuration > 0 && actualDuration > 0) {
      const difference = Math.abs(predictedDuration - actualDuration)
      const tolerance = predictedDuration * 0.2
      if (difference > tolerance) {
        const ratio = (actualDuration / predictedDuration).toFixed(2)
        discrepancies.push(`Duration: predicted ${predictedDuration}ms, actual ${actualDuration}ms (${ratio}x)`)
      }
    }

    return discrepancies.length > 0 ? discrepancies.join('; ') : undefined
  }

  /**
   * Get prediction accuracy statistics
   */
  async getAccuracyStats(): Promise<{
    totalPredictions: number
    averageAccuracy: number
    recentTrend: 'improving' | 'stable' | 'declining'
  }> {
    const totalPredictions = this.predictions.size
    const averageAccuracy =
      this.accuracyHistory.length > 0
        ? this.accuracyHistory.reduce((a, b) => a + b, 0) / this.accuracyHistory.length
        : 0

    // Calculate trend from last 10 predictions
    let recentTrend: 'improving' | 'stable' | 'declining' = 'stable'
    if (this.accuracyHistory.length >= 10) {
      const recent = this.accuracyHistory.slice(-10)
      const older = this.accuracyHistory.slice(-20, -10)

      if (older.length > 0) {
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length

        if (recentAvg > olderAvg + 0.05) {
          recentTrend = 'improving'
        } else if (recentAvg < olderAvg - 0.05) {
          recentTrend = 'declining'
        }
      }
    }

    return {
      totalPredictions,
      averageAccuracy: Math.round(averageAccuracy * 100) / 100,
      recentTrend,
    }
  }

  /**
   * Get prediction log entry
   */
  async getLogEntry(predictionId: string): Promise<PredictionLogEntry | undefined> {
    return this.predictions.get(predictionId)
  }

  /**
   * Get all predictions with actual outcomes
   */
  async getCompletedPredictions(): Promise<PredictionLogEntry[]> {
    return Array.from(this.predictions.values()).filter((e) => e.actualOutcome)
  }

  /**
   * Get pending predictions (without actual outcomes)
   */
  async getPendingPredictions(): Promise<PredictionLogEntry[]> {
    return Array.from(this.predictions.values()).filter((e) => !e.actualOutcome)
  }
}
