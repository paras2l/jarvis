/**
 * Layer 8: Feedback Collector
 * Gathers and normalizes feedback signals from users, overrides, and environment
 */

import { FeedbackSignal } from './types'

export class FeedbackCollector {
  private feedbackSignals: Map<string, FeedbackSignal> = new Map()
  private feedbackAggregates: Map<string, number> = new Map() // actionId -> feedback score

  private feedbackWeights = {
    user_explicit: 1.0, // Direct user feedback is most important
    user_implicit: 0.6, // Inferred user preference
    environment: 0.4, // Environmental signals are weaker
    system_monitor: 0.3, // System monitoring is weakest
  }

  private feedbackTypeWeights = {
    approval: 1.0,
    rejection: -1.0,
    correction: -0.5,
    optimization: 0.5,
    safety_flag: -10.0, // Safety feedback is critical
  }

  constructor() {
    this.initializeFeedbackMetrics()
  }

  private initializeFeedbackMetrics(): void {
    // Initialize feedback tracking
  }

  /**
   * Record explicit user feedback (e.g., "That was good" or "Stop doing that")
   */
  recordUserFeedback(
    actionId: string,
    feedbackType: 'approval' | 'rejection' | 'correction' | 'optimization',
    intensity: number = 0.8,
    rationale?: string,
  ): FeedbackSignal {
    return this.addFeedback({
      feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      actionId,
      source: 'user_explicit',
      feedbackType,
      intensity: Math.min(1, Math.max(0, intensity)),
      rationale,
      timestamp: Date.now(),
    })
  }

  /**
   * Record implicit user feedback (inferred from behavior)
   */
  recordImplicitFeedback(
    actionId: string,
    feedbackType: 'approval' | 'rejection' | 'correction',
    intensity: number = 0.5,
  ): FeedbackSignal {
    return this.addFeedback({
      feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      actionId,
      source: 'user_implicit',
      feedbackType,
      intensity: Math.min(1, Math.max(0, intensity)),
      timestamp: Date.now(),
    })
  }

  /**
   * Record environmental feedback (system health, errors, latency)
   */
  recordEnvironmentalFeedback(
    actionId: string,
    feedbackType: 'approval' | 'rejection' | 'safety_flag',
    intensity: number = 0.5,
    details?: string,
  ): FeedbackSignal {
    return this.addFeedback({
      feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      actionId,
      source: 'environment',
      feedbackType,
      intensity: Math.min(1, Math.max(0, intensity)),
      rationale: details,
      timestamp: Date.now(),
    })
  }

  /**
   * Record system monitoring feedback (latency, memory, CPU impacts)
   */
  recordSystemFeedback(
    actionId: string,
    feedbackType: 'approval' | 'rejection',
    intensity: number = 0.3,
    reason?: string,
  ): FeedbackSignal {
    return this.addFeedback({
      feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      actionId,
      source: 'system_monitor',
      feedbackType,
      intensity: Math.min(1, Math.max(0, intensity)),
      rationale: reason,
      timestamp: Date.now(),
    })
  }

  /**
   * Internal method to add and aggregate feedback
   */
  private addFeedback(signal: FeedbackSignal): FeedbackSignal {
    this.feedbackSignals.set(signal.feedbackId, signal)

    // Calculate weighted feedback score
    const sourceWeight = this.feedbackWeights[signal.source]
    const typeWeight = this.feedbackTypeWeights[signal.feedbackType]
    const feedbackScore = sourceWeight * typeWeight * signal.intensity

    // Aggregate to action
    const currentScore = this.feedbackAggregates.get(signal.actionId) || 0
    this.feedbackAggregates.set(signal.actionId, currentScore + feedbackScore)

    return signal
  }

  /**
   * Get aggregated feedback score for an action
   * Returns -1.0 (strongly negative) to +1.0 (strongly positive)
   */
  getFeedbackScore(actionId: string): number {
    const score = this.feedbackAggregates.get(actionId) || 0
    // Normalize to -1 to +1 range
    return Math.max(-1, Math.min(1, score / 10))
  }

  /**
   * Get all feedback for an action
   */
  getActionFeedback(actionId: string): FeedbackSignal[] {
    return Array.from(this.feedbackSignals.values()).filter((f) => f.actionId === actionId)
  }

  /**
   * Get feedback summary
   */
  getFeedbackSummary(): {
    totalSignals: number
    userExplicitCount: number
    userImplicitCount: number
    environmentalCount: number
    systemMonitorCount: number
    averageIntensity: number
    approvalRatio: number
  } {
    const signals = Array.from(this.feedbackSignals.values())

    return {
      totalSignals: signals.length,
      userExplicitCount: signals.filter((s) => s.source === 'user_explicit').length,
      userImplicitCount: signals.filter((s) => s.source === 'user_implicit').length,
      environmentalCount: signals.filter((s) => s.source === 'environment').length,
      systemMonitorCount: signals.filter((s) => s.source === 'system_monitor').length,
      averageIntensity: signals.length > 0 ? signals.reduce((sum, s) => sum + s.intensity, 0) / signals.length : 0,
      approvalRatio:
        signals.length > 0
          ? signals.filter((s) => s.feedbackType === 'approval').length / signals.length
          : 0.5,
    }
  }

  /**
   * Get critical safety flags
   */
  getSafetyFlags(): FeedbackSignal[] {
    return Array.from(this.feedbackSignals.values()).filter((f) => f.feedbackType === 'safety_flag')
  }

  /**
   * Get most critical feedback signals (by intensity)
   */
  getMostIntenseFeedback(limit: number = 10): FeedbackSignal[] {
    return Array.from(this.feedbackSignals.values())
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, limit)
  }

  /**
   * Get feedback trend for an action (is feedback improving?)
   */
  getFeedbackTrend(actionId: string): number {
    const feedback = this.getActionFeedback(actionId)
    if (feedback.length < 2) return 0

    const recent = feedback.slice(-5)
    const older = feedback.slice(0, Math.max(1, feedback.length - 5))

    const recentScore =
      recent.reduce((sum, f) => sum + (this.feedbackTypeWeights[f.feedbackType] * f.intensity), 0) / recent.length

    const olderScore =
      older.reduce((sum, f) => sum + (this.feedbackTypeWeights[f.feedbackType] * f.intensity), 0) / older.length

    return recentScore - olderScore // Positive = improving, Negative = degrading
  }

  /**
   * Normalize feedback from different sources into [-1, 1] scale
   */
  getNormalizedFeedback(actionId: string): number {
    const feedback = this.getActionFeedback(actionId)
    if (feedback.length === 0) return 0

    const weightedSum = feedback.reduce((sum, f) => {
      const sourceWeight = this.feedbackWeights[f.source]
      const typeWeight = this.feedbackTypeWeights[f.feedbackType]
      return sum + sourceWeight * typeWeight * f.intensity
    }, 0)

    const maxPossible = feedback.length * Math.max(...Object.values(this.feedbackWeights)) * 1.0 * 1.0

    return weightedSum / (maxPossible || 1)
  }

  /**
   * Clear old feedback (keep last N)
   */
  pruneOldFeedback(keepCount: number = 500): void {
    if (this.feedbackSignals.size > keepCount) {
      const sorted = Array.from(this.feedbackSignals.entries()).sort((a, b) => b[1].timestamp - a[1].timestamp)
      const toKeep = new Map(sorted.slice(0, keepCount))
      this.feedbackSignals = toKeep

      // Recalculate aggregates
      this.feedbackAggregates.clear()
      Array.from(toKeep.values()).forEach((signal) => {
        const sourceWeight = this.feedbackWeights[signal.source]
        const typeWeight = this.feedbackTypeWeights[signal.feedbackType]
        const feedbackScore = sourceWeight * typeWeight * signal.intensity
        const currentScore = this.feedbackAggregates.get(signal.actionId) || 0
        this.feedbackAggregates.set(signal.actionId, currentScore + feedbackScore)
      })
    }
  }

  /**
   * Get feedback statistics by source
   */
  getStatisticsBySource(source: 'user_explicit' | 'user_implicit' | 'environment' | 'system_monitor'): {
    count: number
    averageIntensity: number
    approvalRate: number
    rejectionRate: number
  } {
    const feedback = Array.from(this.feedbackSignals.values()).filter((f) => f.source === source)

    if (feedback.length === 0) {
      return {
        count: 0,
        averageIntensity: 0,
        approvalRate: 0,
        rejectionRate: 0,
      }
    }

    const approvalCount = feedback.filter((f) => f.feedbackType === 'approval').length
    const rejectionCount = feedback.filter((f) => f.feedbackType === 'rejection').length

    return {
      count: feedback.length,
      averageIntensity: feedback.reduce((sum, f) => sum + f.intensity, 0) / feedback.length,
      approvalRate: approvalCount / feedback.length,
      rejectionRate: rejectionCount / feedback.length,
    }
  }
}

// Export singleton instance
export const feedbackCollector = new FeedbackCollector()
