/**
 * Layer 8: Policy Refiner
 * Analyzes performance data and proposes policy adjustments
 */

import { PolicyUpdate, DetectedPattern } from './types'

export class PolicyRefiner {
  private proposedUpdates: Map<string, PolicyUpdate> = new Map()
  private deployedUpdates: Map<string, PolicyUpdate> = new Map()
  private rolledBackUpdates: Map<string, PolicyUpdate> = new Map()

  private readonly CONSERVATIVE_THRESHOLD = 0.7 // Confidence needed to deploy

  constructor() {
    this.initializePolicies()
  }

  private initializePolicies(): void {
    // Initialize policy refinement tracking
  }

  /**
   * Propose a policy adjustment based on evaluation data
   */
  proposePolicyUpdate(
    policyName: string,
    updateType: 'threshold_adjustment' | 'pattern_promotion' | 'pattern_suppression' | 'strategy_refinement',
    currentValue: number | string,
    suggestedValue: number | string,
    confidence: number,
    supportingEvidence: string[],
    estimatedImpact: { successRateChange: number; efficiencyChange: number; riskChange: number },
  ): PolicyUpdate {
    const update: PolicyUpdate = {
      updateId: `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      policyName,
      updateType,
      currentValue,
      suggestedValue,
      confidence: Math.min(1, Math.max(0, confidence)),
      supportingEvidence,
      affectedMetrics: this.estimateAffectedMetrics(policyName),
      estimatedImpact,
      timestamp: Date.now(),
      status: 'pending',
    }

    this.proposedUpdates.set(update.updateId, update)
    return update
  }

  /**
   * Estimate which metrics will be affected by a policy change
   */
  private estimateAffectedMetrics(policyName: string): string[] {
    const metricMap: Record<string, string[]> = {
      'safety-threshold': ['safety_violations', 'system_errors', 'user_overrides'],
      'planning-horizon': ['task_completion_rate', 'efficiency', 'memory_usage'],
      'confidence-ceiling': ['action_accuracy', 'user_satisfaction', 'error_rate'],
      'action-timeout': ['task_duration', 'efficiency', 'system_load'],
      'feedback-weight': ['learning_speed', 'policy_convergence', 'user_alignment'],
      'module-trust': ['action_approval_rate', 'system_reliability', 'user_confidence'],
    }

    return metricMap[policyName] || ['general_performance']
  }

  /**
   * Refine confidence thresholds based on accuracy
   */
  refineConfidenceThreshold(baselineAccuracy: number, observations: number): PolicyUpdate | null {
    if (observations < 10) {
      return null // Not enough data
    }

    const currentThreshold = 0.6 // Default confidence threshold
    let suggestedThreshold = currentThreshold

    // If accuracy is high, we can be more aggressive
    if (baselineAccuracy > 0.85) {
      suggestedThreshold = 0.5
    } else if (baselineAccuracy < 0.6) {
      suggestedThreshold = 0.75
    }

    if (Math.abs(suggestedThreshold - currentThreshold) < 0.05) {
      return null // Too small a change
    }

    return this.proposePolicyUpdate(
      'confidence-ceiling',
      'threshold_adjustment',
      currentThreshold,
      suggestedThreshold,
      0.65,
      [
        `Observed accuracy: ${(baselineAccuracy * 100).toFixed(1)}%`,
        `Sample size: ${observations} actions`,
      ],
      {
        successRateChange: (suggestedThreshold - currentThreshold) * 0.1,
        efficiencyChange: (suggestedThreshold - currentThreshold) * 0.05,
        riskChange: (currentThreshold - suggestedThreshold) * 0.15, // More aggressive = more risk
      },
    )
  }

  /**
   * Refine safety policy based on violations
   */
  refineSafetyPolicy(violationRate: number, observations: number): PolicyUpdate | null {
    if (observations < 20) {
      return null
    }

    const currentThreshold = 0.8
    let suggestedThreshold = currentThreshold

    if (violationRate > 0.1) {
      // Too many violations, be stricter
      suggestedThreshold = 0.85
    } else if (violationRate < 0.02 && observations > 100) {
      // Very few violations, can relax slightly
      suggestedThreshold = 0.75
    }

    if (Math.abs(suggestedThreshold - currentThreshold) < 0.05) {
      return null
    }

    return this.proposePolicyUpdate(
      'safety-threshold',
      'threshold_adjustment',
      currentThreshold,
      suggestedThreshold,
      0.85,
      [
        `Observed violation rate: ${(violationRate * 100).toFixed(2)}%`,
        `Sample size: ${observations} actions`,
      ],
      {
        successRateChange: -Math.abs(suggestedThreshold - currentThreshold) * 0.05,
        efficiencyChange: -Math.abs(suggestedThreshold - currentThreshold) * 0.1,
        riskChange: -(suggestedThreshold - currentThreshold), // Stricter = less risk
      },
    )
  }

  /**
   * Promote a successful pattern to policy
   */
  promotePattern(pattern: DetectedPattern): PolicyUpdate | null {
    if (pattern.type !== 'success_pattern' || pattern.frequency < 5) {
      return null
    }

    return this.proposePolicyUpdate(
      `promoted_${pattern.patternId}`,
      'pattern_promotion',
      'inactive',
      'active',
      pattern.confidence,
      [`Pattern observed ${pattern.frequency} times`, `Confidence: ${(pattern.confidence * 100).toFixed(1)}%`],
      {
        successRateChange: 0.1,
        efficiencyChange: 0.05,
        riskChange: 0,
      },
    )
  }

  /**
   * Suppress a harmful or ineffective pattern
   */
  suppressPattern(pattern: DetectedPattern): PolicyUpdate | null {
    if (pattern.type !== 'failure_pattern' && pattern.type !== 'inefficiency_pattern') {
      return null
    }

    if (pattern.frequency < 3) {
      return null
    }

    return this.proposePolicyUpdate(
      `suppressed_${pattern.patternId}`,
      'pattern_suppression',
      'active',
      'blocked',
      pattern.confidence,
      [`Pattern observed ${pattern.frequency} times`, `Recommendation: ${pattern.recommendation}`],
      {
        successRateChange: 0.05,
        efficiencyChange: -0.02,
        riskChange: -0.3,
      },
    )
  }

  /**
   * Refine action planning horizon based on accuracy
   */
  refinePlanningHorizon(accuracyByDepth: Map<number, number>): PolicyUpdate | null {
    if (accuracyByDepth.size === 0) {
      return null
    }

    let bestDepth = 1
    let bestAccuracy = 0

    for (const [depth, accuracy] of accuracyByDepth) {
      if (accuracy > bestAccuracy) {
        bestAccuracy = accuracy
        bestDepth = depth
      }
    }

    const currentHorizon = 5 // Default planning depth
    if (bestDepth === currentHorizon || Math.abs(bestDepth - currentHorizon) < 1) {
      return null
    }

    return this.proposePolicyUpdate(
      'planning-horizon',
      'strategy_refinement',
      currentHorizon,
      bestDepth,
      Math.max(0.6, bestAccuracy),
      [
        `Best accuracy at depth ${bestDepth}: ${(bestAccuracy * 100).toFixed(1)}%`,
        `Current horizon: ${currentHorizon}, Suggested: ${bestDepth}`,
      ],
      {
        successRateChange: (bestAccuracy - 0.7) * 0.2,
        efficiencyChange: bestDepth < currentHorizon ? 0.1 : -0.05,
        riskChange: bestDepth > currentHorizon ? 0.1 : 0,
      },
    )
  }

  /**
   * Approve and deploy a proposed policy update
   */
  deployUpdate(updateId: string): boolean {
    const update = this.proposedUpdates.get(updateId)
    if (!update) {
      console.warn(`[PolicyRefiner] Update ${updateId} not found`)
      return false
    }

    if (update.confidence < this.CONSERVATIVE_THRESHOLD) {
      console.warn(`[PolicyRefiner] Update ${updateId} confidence too low: ${update.confidence}`)
      return false
    }

    update.status = 'deployed'
    this.proposedUpdates.delete(updateId)
    this.deployedUpdates.set(updateId, update)

    return true
  }

  /**
   * Rollback a deployed policy update
   */
  rollbackUpdate(updateId: string, _reason?: string): boolean {
    const update = this.deployedUpdates.get(updateId)
    if (!update) {
      console.warn(`[PolicyRefiner] Update ${updateId} not deployed`)
      return false
    }

    update.status = 'rolled_back'
    this.deployedUpdates.delete(updateId)
    this.rolledBackUpdates.set(updateId, update)

    return true
  }

  /**
   * Get all pending policy updates
   */
  getPendingUpdates(): PolicyUpdate[] {
    return Array.from(this.proposedUpdates.values()).sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Get all deployed updates
   */
  getDeployedUpdates(): PolicyUpdate[] {
    return Array.from(this.deployedUpdates.values())
  }

  /**
   * Get update by ID
   */
  getUpdate(updateId: string): PolicyUpdate | undefined {
    return (
      this.proposedUpdates.get(updateId) ||
      this.deployedUpdates.get(updateId) ||
      this.rolledBackUpdates.get(updateId)
    )
  }

  /**
   * Get summary of policy refinement activity
   */
  getRefinerSummary(): {
    pendingUpdates: number
    deployedUpdates: number
    rolledBackUpdates: number
    highConfidenceUpdates: number
  } {
    return {
      pendingUpdates: this.proposedUpdates.size,
      deployedUpdates: this.deployedUpdates.size,
      rolledBackUpdates: this.rolledBackUpdates.size,
      highConfidenceUpdates: Array.from(this.proposedUpdates.values()).filter(
        (u) => u.confidence >= this.CONSERVATIVE_THRESHOLD,
      ).length,
    }
  }

  /**
   * Clear old updates (keep last N of each type)
   */
  pruneOldUpdates(keepCount: number = 100): void {
    const prune = (map: Map<string, PolicyUpdate>) => {
      if (map.size > keepCount) {
        const sorted = Array.from(map.entries()).sort((a, b) => b[1].timestamp - a[1].timestamp)
        const toKeep = new Map(sorted.slice(0, keepCount))
        map.clear()
        toKeep.forEach((v, k) => map.set(k, v))
      }
    }

    prune(this.proposedUpdates)
    prune(this.deployedUpdates)
    prune(this.rolledBackUpdates)
  }

  /**
   * Get updates by type
   */
  getUpdatesByType(
    type: 'threshold_adjustment' | 'pattern_promotion' | 'pattern_suppression' | 'strategy_refinement',
  ): PolicyUpdate[] {
    const all = [
      ...Array.from(this.proposedUpdates.values()),
      ...Array.from(this.deployedUpdates.values()),
      ...Array.from(this.rolledBackUpdates.values()),
    ]
    return all.filter((u) => u.updateType === type)
  }
}

// Export singleton instance
export const policyRefiner = new PolicyRefiner()
