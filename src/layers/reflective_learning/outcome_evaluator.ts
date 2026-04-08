/**
 * Layer 8: Outcome Evaluator
 * Compares predicted vs actual outcomes and computes performance metrics
 */

import { ActionOutcome, OutcomeEvaluation, DetectedPattern } from './types'

export class OutcomeEvaluator {
  private outcomes: Map<string, ActionOutcome> = new Map()
  private evaluations: Map<string, OutcomeEvaluation> = new Map()
  private patterns: DetectedPattern[] = []

  private successRateByActionType: Map<string, number[]> = new Map([
    ['reactive', []],
    ['proactive', []],
    ['exploratory', []],
  ])

  private efficiencyByActionType: Map<string, number[]> = new Map([
    ['reactive', []],
    ['proactive', []],
    ['exploratory', []],
  ])

  constructor() {
    this.initializeMetrics()
  }

  private initializeMetrics(): void {
    // Initialize metric tracking for each action type
    ;['reactive', 'proactive', 'exploratory'].forEach((type) => {
      this.successRateByActionType.set(type, [])
      this.efficiencyByActionType.set(type, [])
    })
  }

  /**
   * Record an action outcome
   */
  recordOutcome(outcome: ActionOutcome): void {
    this.outcomes.set(outcome.actionId, outcome)
  }

  /**
   * Evaluate action against predictions
   */
  evaluateAction(
    actionId: string,
    predictedOutcome: string,
    actualOutcome: string,
    predictionAccuracy: number,
  ): OutcomeEvaluation | null {
    const outcome = this.outcomes.get(actionId)
    if (!outcome) {
      console.warn(`[OutcomeEvaluator] No outcome recorded for action ${actionId}`)
      return null
    }

    // Calculate deviation (how much actual differed from predicted)
    const deviationScore = this.calculateDeviation(predictedOutcome, actualOutcome)

    // Calculate timeline deviation
    const timelineDeviation = outcome.completedAt ? outcome.completedAt - outcome.executedAt : 0

    // Get success rate for this action type
    const successRate = this.getSuccessRateForType(outcome.actionType)

    // Calculate efficiency
    const efficiency = this.calculateEfficiency(outcome, successRate)

    const evaluation: OutcomeEvaluation = {
      evaluationId: `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      actionId,
      predictedOutcome,
      actualOutcome,
      predictionAccuracy,
      deviationScore,
      timelineDeviation,
      successRate,
      efficiency,
      timestamp: Date.now(),
      notes: this.generateEvaluationNotes(outcome, deviationScore, efficiency),
    }

    this.evaluations.set(evaluation.evaluationId, evaluation)

    // Update success/efficiency tracking
    if (outcome.success) {
      this.successRateByActionType.get(outcome.actionType)!.push(1)
    } else {
      this.successRateByActionType.get(outcome.actionType)!.push(0)
    }
    this.efficiencyByActionType.get(outcome.actionType)!.push(efficiency)

    // Detect patterns
    this.analyzeForPatterns(evaluation, outcome)

    return evaluation
  }

  /**
   * Calculate how much actual outcome deviated from predicted
   * Returns 0-1 where 0 is perfect match, 1 is complete mismatch
   */
  private calculateDeviation(predicted: string, actual: string): number {
    if (predicted === actual) return 0

    // Simple heuristic: count matching words / total words
    const predictedWords = predicted.toLowerCase().split(/\s+/)
    const actualWords = actual.toLowerCase().split(/\s+/)

    const matchingWords = predictedWords.filter((w) => actualWords.includes(w)).length
    const totalWords = Math.max(predictedWords.length, actualWords.length)

    return 1 - matchingWords / totalWords
  }

  /**
   * Calculate efficiency based on outcome and success rate
   * Returns 0-1 score
   */
  private calculateEfficiency(outcome: ActionOutcome, successRate: number): number {
    let efficiency = successRate

    // Factor in duration if success
    if (outcome.duration && outcome.success) {
      // Penalize longer durations (max 5 seconds considered efficient)
      const durationPenalty = Math.min(outcome.duration / 5000, 1)
      efficiency = (successRate * 0.7) + (1 - durationPenalty) * 0.3
    }

    return Math.max(0, Math.min(1, efficiency))
  }

  /**
   * Get success rate for action type
   */
  private getSuccessRateForType(actionType: 'reactive' | 'proactive' | 'exploratory'): number {
    const results = this.successRateByActionType.get(actionType) || []
    if (results.length === 0) return 0.5 // Default confidence
    return results.reduce((a, b) => a + b, 0) / results.length
  }

  /**
   * Generate human-readable notes on evaluation
   */
  private generateEvaluationNotes(
    outcome: ActionOutcome,
    deviationScore: number,
    efficiency: number,
  ): string {
    const parts: string[] = []

    if (outcome.success) {
      parts.push('Action succeeded')
    } else {
      parts.push('Action failed')
    }

    if (deviationScore < 0.2) {
      parts.push('; outcome matched prediction closely')
    } else if (deviationScore > 0.7) {
      parts.push('; outcome significantly deviated from prediction')
    }

    if (efficiency > 0.8) {
      parts.push('; high efficiency')
    } else if (efficiency < 0.4) {
      parts.push('; low efficiency detected')
    }

    return parts.join('')
  }

  /**
   * Analyze outcomes for patterns
   */
  private analyzeForPatterns(evaluation: OutcomeEvaluation, outcome: ActionOutcome): void {
    // Look for recurring patterns in successes/failures

    // Pattern: High deviation with failures
    if (!outcome.success && evaluation.deviationScore > 0.6) {
      this.addPattern({
        patternId: `pattern_${Date.now()}`,
        type: 'failure_pattern',
        description: `${outcome.actionType} actions with high deviation tendency`,
        frequency: 1,
        affectedActions: [outcome.actionId],
        recommendation: `Improve prediction accuracy for ${outcome.actionType} actions`,
        confidence: 0.7,
        timestamp: Date.now(),
      })
    }

    // Pattern: Low efficiency
    if (outcome.success && evaluation.efficiency < 0.4) {
      this.addPattern({
        patternId: `pattern_${Date.now()}`,
        type: 'inefficiency_pattern',
        description: `${outcome.actionType} actions complete but with low efficiency`,
        frequency: 1,
        affectedActions: [outcome.actionId],
        recommendation: `Optimize ${outcome.actionType} action execution`,
        confidence: 0.6,
        timestamp: Date.now(),
      })
    }
  }

  /**
   * Add or merge pattern detection
   */
  private addPattern(pattern: DetectedPattern): void {
    // Check if similar pattern exists
    const existing = this.patterns.find((p) => p.type === pattern.type && p.description === pattern.description)

    if (existing) {
      existing.frequency++
      existing.confidence = Math.min(1, existing.confidence + 0.05)
      existing.affectedActions.push(...pattern.affectedActions)
    } else {
      this.patterns.push(pattern)
    }
  }

  /**
   * Get all detected patterns
   */
  getDetectedPatterns(): DetectedPattern[] {
    // Filter patterns with sufficient frequency
    return this.patterns.filter((p) => p.frequency >= 2).sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Get evaluation summary
   */
  getEvaluationSummary(actionType?: 'reactive' | 'proactive' | 'exploratory'): {
    totalEvaluations: number
    successRate: number
    averageEfficiency: number
    averageDeviation: number
    upTrendConfidence: number
  } {
    let evaluationList = Array.from(this.evaluations.values())

    if (actionType) {
      const filteredOutcomes = Array.from(this.outcomes.values()).filter((o) => o.actionType === actionType)
      const filteredIds = new Set(filteredOutcomes.map((o) => o.actionId))
      evaluationList = evaluationList.filter((e) => filteredIds.has(e.actionId))
    }

    if (evaluationList.length === 0) {
      return {
        totalEvaluations: 0,
        successRate: 0.5,
        averageEfficiency: 0.5,
        averageDeviation: 0.5,
        upTrendConfidence: 0,
      }
    }

    const successRate =
      evaluationList.filter((e) => {
        const outcome = this.outcomes.get(e.actionId)
        return outcome?.success
      }).length / evaluationList.length

    const averageEfficiency =
      evaluationList.reduce((sum, e) => sum + e.efficiency, 0) / evaluationList.length

    const averageDeviation = evaluationList.reduce((sum, e) => sum + e.deviationScore, 0) / evaluationList.length

    // Calculate trend (are we improving?)
    const recentEvals = evaluationList.slice(-10)
    const olderEvals = evaluationList.slice(0, Math.max(1, evaluationList.length - 10))
    const recentSuccess = recentEvals.filter((e) => this.outcomes.get(e.actionId)?.success).length / recentEvals.length
    const olderSuccess = olderEvals.filter((e) => this.outcomes.get(e.actionId)?.success).length / olderEvals.length
    const upTrendConfidence = Math.max(0, Math.min(1, (recentSuccess - olderSuccess + 1) / 2))

    return {
      totalEvaluations: evaluationList.length,
      successRate,
      averageEfficiency,
      averageDeviation,
      upTrendConfidence,
    }
  }

  /**
   * Get detailed evaluation record
   */
  getEvaluation(evaluationId: string): OutcomeEvaluation | undefined {
    return this.evaluations.get(evaluationId)
  }

  /**
   * Get all evaluations for an action
   */
  getActionEvaluations(actionId: string): OutcomeEvaluation[] {
    return Array.from(this.evaluations.values()).filter((e) => e.actionId === actionId)
  }

  /**
   * Clear old evaluations (keep last N)
   */
  pruneOldEvaluations(keepCount: number = 1000): void {
    if (this.evaluations.size > keepCount) {
      const sorted = Array.from(this.evaluations.entries()).sort((a, b) => b[1].timestamp - a[1].timestamp)
      const toKeep = new Map(sorted.slice(0, keepCount))
      this.evaluations = toKeep
    }
  }
}

// Export singleton instance
export const outcomeEvaluator = new OutcomeEvaluator()
