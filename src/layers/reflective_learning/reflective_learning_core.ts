/**
 * Layer 8: Reflective Learning Core
 * Central orchestrator for the reflective learning system
 * Coordinates outcome evaluation, feedback collection, policy refinement, and confidence calibration
 */

import { OutcomeEvaluation, FeedbackSignal, PolicyUpdate, LearningMetrics, ReflectiveLearningState } from './types'
import { outcomeEvaluator } from './outcome_evaluator'
import { feedbackCollector } from './feedback_collector'
import { policyRefiner } from './policy_refiner'
import { confidenceCalibrator } from './confidence_calibrator'
import { learningLogger } from './learning_logger'
import { eventPublisher } from '../../event_system/event_publisher'

export class ReflectiveLearningCore {
  private state: ReflectiveLearningState = {
    isInitialized: false,
    lastEvaluationTime: 0,
    totalOutcomesEvaluated: 0,
    activeMetrics: this.createEmptyMetrics(),
    pendingPolicyUpdates: [],
    deployedPolicies: [],
    calibrationHistory: [],
    detectedPatterns: [],
  }

  private evaluationCycle = 0
  private readonly POLICY_AUTO_DEPLOY_THRESHOLD = 0.75

  constructor() {
    this.initialize()
  }

  /**
   * Initialize the reflective learning system
   */
  private initialize(): void {
    this.state.isInitialized = true
    console.log('[ReflectiveLearningCore] Initialized')
  }

  /**
   * Main learning cycle: evaluate outcomes, collect feedback, refine policies, calibrate confidence
   */
  async performLearningCycle(): Promise<void> {
    this.evaluationCycle++

    // Step 1: Evaluate recent outcomes
    const evaluations = this.performOutcomeEvaluation()

    // Step 2: Collect and integrate feedback
    this.integrateFeedback()

    // Step 3: Analyze patterns
    const patterns = outcomeEvaluator.getDetectedPatterns()

    // Step 4: Refine policies based on evaluations and patterns
    this.refinePolicies(evaluations, patterns)

    // Step 5: Calibrate confidence based on accuracy
    this.recalibrateConfidence(evaluations)

    // Step 6: Consider auto-deployment of high-confidence policies
    this.considerPolicyDeployment()

    // Step 7: Update system metrics
    this.updateSystemMetrics()

    // Step 8: Publish learning event
    await this.publishLearningEvent()

    this.state.lastEvaluationTime = Date.now()
  }

  /**
   * Evaluate recent outcomes
   */
  private performOutcomeEvaluation(): OutcomeEvaluation[] {
    const evaluations: OutcomeEvaluation[] = []

    // This would normally integrate with the prediction logger from Layer 6
    // For now, we track what we have

    learningLogger.logMetricCalculation('outcome_evaluation_cycle', {
      cycleNumber: this.evaluationCycle,
      timestamp: Date.now(),
    })

    return evaluations
  }

  /**
   * Integrate feedback signals
   */
  private integrateFeedback(): { totalSignals: number; averageFeedbackScore: number } {
    const summary = feedbackCollector.getFeedbackSummary()

    learningLogger.logMetricCalculation('feedback_integration', {
      totalSignals: summary.totalSignals,
      userExplicitCount: summary.userExplicitCount,
      approvalRatio: summary.approvalRatio,
    })

    return {
      totalSignals: summary.totalSignals,
      averageFeedbackScore: summary.approvalRatio,
    }
  }

  /**
   * Refine policies based on observations
   */
  private refinePolicies(evaluations: OutcomeEvaluation[], patterns: any[]): PolicyUpdate[] {
    const updates: PolicyUpdate[] = []

    // Suggest confidence threshold refinement if we have data
    if (evaluations.length > 0) {
      const avgAccuracy = evaluations.reduce((sum, e) => sum + e.predictionAccuracy, 0) / evaluations.length
      const update = policyRefiner.refineConfidenceThreshold(avgAccuracy, evaluations.length)
      if (update) {
        updates.push(update)
        learningLogger.logPolicyUpdate(update)
      }
    }

    // Promote successful patterns
    patterns.forEach((pattern) => {
      const update = policyRefiner.promotePattern(pattern)
      if (update) {
        updates.push(update)
        learningLogger.logPolicyUpdate(update)
      }
    })

    // Suppress harmful patterns
    patterns.forEach((pattern) => {
      const update = policyRefiner.suppressPattern(pattern)
      if (update) {
        updates.push(update)
        learningLogger.logPolicyUpdate(update)
      }
    })

    this.state.pendingPolicyUpdates = policyRefiner.getPendingUpdates()

    return updates
  }

  /**
   * Recalibrate confidence for modules and action types
   */
  private recalibrateConfidence(_evaluations: OutcomeEvaluation[]): void {
    // Would normally iterate through outcomes and record accuracies
    const stats = confidenceCalibrator.getConfidenceStatistics()

    if (stats.recentCalibrations > 0) {
      learningLogger.logMetricCalculation('confidence_calibration', stats)
    }
  }

  /**
   * Auto-deploy high-confidence policies
   */
  private considerPolicyDeployment(): void {
    const pending = policyRefiner.getPendingUpdates()

    pending.forEach((update) => {
      if (update.confidence >= this.POLICY_AUTO_DEPLOY_THRESHOLD) {
        const deployed = policyRefiner.deployUpdate(update.updateId)
        if (deployed) {
          this.state.deployedPolicies.push(update)
          learningLogger.logPolicyUpdate(update)
        }
      }
    })
  }

  /**
   * Update aggregate system metrics
   */
  private updateSystemMetrics(): void {
    const outcomeStats = outcomeEvaluator.getEvaluationSummary()
    const feedbackStats = feedbackCollector.getFeedbackSummary()
    const confidenceStats = confidenceCalibrator.getConfidenceStatistics()
    const refinerStats = policyRefiner.getRefinerSummary()

    this.state.activeMetrics = {
      metricsId: `metrics_${Date.now()}`,
      period: {
        startTime: this.state.lastEvaluationTime,
        endTime: Date.now(),
        sampleCount: outcomeStats.totalEvaluations,
      },

      outcomeMetrics: {
        totalActionsEvaluated: outcomeStats.totalEvaluations,
        successfulActions: Math.round(outcomeStats.successRate * outcomeStats.totalEvaluations),
        successRate: outcomeStats.successRate,
        averageEfficiency: outcomeStats.averageEfficiency,
        predictivePrecision: 1 - outcomeStats.averageDeviation,
        deviationTolerance: outcomeStats.averageDeviation,
      },

      feedbackMetrics: {
        totalFeedbackSignals: feedbackStats.totalSignals,
        userExplicitFeedback: feedbackStats.userExplicitCount,
        userImplicitFeedback: feedbackStats.userImplicitCount,
        environmentalSignals: feedbackStats.environmentalCount,
        averageFeedbackIntensity: feedbackStats.averageIntensity,
      },

      learningMetrics: {
        policiesRefined: outcomeStats.totalEvaluations > 0 ? Math.ceil(outcomeStats.totalEvaluations / 10) : 0,
        policiesDeployed: refinerStats.deployedUpdates,
        policiesRolledBack: refinerStats.rolledBackUpdates,
        confidenceAdjustments: confidenceStats.recentCalibrations,
        averageConfidenceShift: 0.05, // Placeholder
      },

      performanceMetrics: {
        overallSystemAccuracy: outcomeStats.successRate,
        taskCompletionRate: outcomeStats.successRate,
        averageTaskDuration: 1000, // Placeholder
        errorRate: 1 - outcomeStats.successRate,
      },
    }

    learningLogger.logMetricCalculation('system_metrics', {
      metricsId: this.state.activeMetrics.metricsId,
      period: this.state.activeMetrics.period,
      outcomeMetrics: this.state.activeMetrics.outcomeMetrics,
      feedbackMetrics: this.state.activeMetrics.feedbackMetrics,
      learningMetrics: this.state.activeMetrics.learningMetrics,
      performanceMetrics: this.state.activeMetrics.performanceMetrics,
    })
    this.state.totalOutcomesEvaluated += outcomeStats.totalEvaluations
  }

  /**
   * Publish learning event to event bus
   */
  private async publishLearningEvent(): Promise<void> {
    await eventPublisher.learningCycleMetricsUpdated({
      cycleNumber: this.evaluationCycle,
      duration: Date.now() - this.state.lastEvaluationTime,
      outcomeEvaluations: this.state.activeMetrics.outcomeMetrics.totalActionsEvaluated,
      feedbackSignals: this.state.activeMetrics.feedbackMetrics.totalFeedbackSignals,
      policiesRefined: this.state.activeMetrics.learningMetrics.policiesRefined,
      confidenceAdjustments: this.state.activeMetrics.learningMetrics.confidenceAdjustments,
      detectedPatterns: this.state.detectedPatterns.length,
      systemConfidence: this.getLearningSystemSummary().systemConfidence,
      successRate: this.state.activeMetrics.outcomeMetrics.successRate,
      averageEfficiency: this.state.activeMetrics.outcomeMetrics.averageEfficiency,
    })
  }

  /**
   * Record an action outcome for learning
   */
  recordActionOutcome(
    actionId: string,
    actionType: 'reactive' | 'proactive' | 'exploratory',
    success: boolean,
    duration?: number,
    context?: Record<string, unknown>,
  ): void {
    outcomeEvaluator.recordOutcome({
      actionId,
      actionType,
      timestamp: Date.now(),
      executedAt: Date.now() - (duration || 0),
      completedAt: Date.now(),
      success,
      duration,
      outcomeSummary: success ? 'Action completed successfully' : 'Action failed',
      contextSnapshot: context || {},
    })
  }

  /**
   * Record user feedback for an action
   */
  recordUserFeedback(
    actionId: string,
    feedbackType: 'approval' | 'rejection' | 'correction' | 'optimization',
    intensity?: number,
    rationale?: string,
  ): FeedbackSignal {
    const signal = feedbackCollector.recordUserFeedback(actionId, feedbackType, intensity, rationale)
    learningLogger.logFeedbackIntegration(actionId, feedbackType, feedbackCollector.getFeedbackScore(actionId))
    return signal
  }

  /**
   * Record environmental feedback
   */
  recordEnvironmentalFeedback(
    actionId: string,
    feedbackType: 'approval' | 'rejection' | 'safety_flag',
    intensity?: number,
    details?: string,
  ): FeedbackSignal {
    const signal = feedbackCollector.recordEnvironmentalFeedback(actionId, feedbackType, intensity, details)
    learningLogger.logFeedbackIntegration(actionId, feedbackType, feedbackCollector.getFeedbackScore(actionId))
    return signal
  }

  /**
   * Get current learning system state
   */
  getState(): ReflectiveLearningState {
    return {
      ...this.state,
      pendingPolicyUpdates: policyRefiner.getPendingUpdates(),
      deployedPolicies: policyRefiner.getDeployedUpdates(),
    }
  }

  /**
   * Get learning summary
   */
  getLearningSystemSummary(): {
    evaluationCycles: number
    totalOutcomesEvaluated: number
    successRate: number
    averageEfficiency: number
    pendingPolicies: number
    deployedPolicies: number
    systemConfidence: number
  } {
    const outcomeStats = outcomeEvaluator.getEvaluationSummary()
    const refinerStats = policyRefiner.getRefinerSummary()
    const confidenceStats = confidenceCalibrator.getConfidenceStatistics()

    return {
      evaluationCycles: this.evaluationCycle,
      totalOutcomesEvaluated: this.state.totalOutcomesEvaluated,
      successRate: outcomeStats.successRate,
      averageEfficiency: outcomeStats.averageEfficiency,
      pendingPolicies: refinerStats.pendingUpdates,
      deployedPolicies: refinerStats.deployedUpdates,
      systemConfidence: confidenceStats.averageModuleConfidence,
    }
  }

  /**
   * Deploy a pending policy update
   */
  deployPolicyUpdate(updateId: string): boolean {
    return policyRefiner.deployUpdate(updateId)
  }

  /**
   * Rollback a deployed policy update
   */
  rollbackPolicyUpdate(updateId: string): boolean {
    return policyRefiner.rollbackUpdate(updateId)
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): LearningMetrics {
    return {
      metricsId: '',
      period: { startTime: 0, endTime: 0, sampleCount: 0 },
      outcomeMetrics: {
        totalActionsEvaluated: 0,
        successfulActions: 0,
        successRate: 0.5,
        averageEfficiency: 0.5,
        predictivePrecision: 0.5,
        deviationTolerance: 0.5,
      },
      feedbackMetrics: {
        totalFeedbackSignals: 0,
        userExplicitFeedback: 0,
        userImplicitFeedback: 0,
        environmentalSignals: 0,
        averageFeedbackIntensity: 0,
      },
      learningMetrics: {
        policiesRefined: 0,
        policiesDeployed: 0,
        policiesRolledBack: 0,
        confidenceAdjustments: 0,
        averageConfidenceShift: 0,
      },
      performanceMetrics: {
        overallSystemAccuracy: 0.5,
        taskCompletionRate: 0.5,
        averageTaskDuration: 0,
        errorRate: 0.5,
      },
    }
  }

  /**
   * Get detailed metrics
   */
  getMetrics(): LearningMetrics {
    return this.state.activeMetrics
  }

  /**
   * Get learning logs
   */
  getRecentLogs(limit: number = 50): any[] {
    return learningLogger.getRecentEntries(limit)
  }

  /**
   * Export learning analytics
   */
  exportAnalytics(): string {
    return learningLogger.exportAsJSON({
      limit: 1000,
    })
  }
}

// Export singleton instance
export const reflectiveLearningCore = new ReflectiveLearningCore()
