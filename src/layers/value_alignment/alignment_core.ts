// Layer 7 - Value and Alignment Layer - Core Orchestrator
// Ties together policy evaluation, auditing, and user overrides

import { eventPublisher } from '../../event_system/event_publisher'
import { AlignmentCheckInput, AlignmentCheckResult, ActionDecision } from './types'
import { valueRegistry } from './value_registry'
import { PolicyEvaluator } from './policy_evaluator'
import { AuditLogger } from './audit_logger'
import { UserOverrideManager } from './user_override_manager'

/**
 * ValueAlignmentLayer
 *
 * Central orchestrator for the Value/Alignment system.
 * Ensures all actions respect system values, safety constraints, and user preferences.
 *
 * Responsibilities:
 * 1. Evaluate actions against value policies
 * 2. Determine approval/modification/blocking decisions
 * 3. Log all decisions for transparency
 * 4. Handle user overrides safely
 * 5. Provide explainability for alignment decisions
 */
class ValueAlignmentLayer {
  private auditLogger: AuditLogger
  private policyEvaluator: PolicyEvaluator
  private userOverrideManager: UserOverrideManager

  constructor() {
    this.auditLogger = new AuditLogger()
    this.policyEvaluator = new PolicyEvaluator(this.auditLogger)
    this.userOverrideManager = new UserOverrideManager()
  }

  /**
   * Main entry point: evaluate an action for alignment
   */
  async evaluateAction(input: AlignmentCheckInput): Promise<AlignmentCheckResult> {
    // Evaluate against all policies and thresholds
    const result = await this.policyEvaluator.evaluate(input)

    // Publish evaluation event
    await this.publishAlignmentEvent(result)

    return result
  }

  /**
   * Handle a user override of an alignment decision
   */
  async handleUserOverride(
    actionId: string,
    originalDecision: ActionDecision,
    userDecision: ActionDecision,
    reason: string,
    systemConfidence: number,
    violatedPolicies: string[],
  ): Promise<{
    allowed: boolean
    reason: string
    overrideId?: string
    explanation?: string
  }> {
    const override = await this.userOverrideManager.requestOverride(
      actionId,
      originalDecision,
      userDecision,
      reason,
      systemConfidence,
      violatedPolicies,
    )

    if (override.allowed) {
      // Publish override event
      await this.publishOverrideEvent({
        actionId,
        originalDecision,
        userDecision,
        overrideId: override.overrideId,
        reason,
      })
    }

    return override
  }

  /**
   * Get statistics and health check for alignment layer
   */
  getLayerHealth(): {
    totalEvaluations: number
    approvalRate: number
    blockRate: number
    userAgreementRate: number
    lastEvaluationTime: number
  } {
    const auditStats = this.auditLogger.getStatistics()
    const overrideStats = this.userOverrideManager.getOverrideStats()

    return {
      totalEvaluations: auditStats.totalEvaluations,
      approvalRate: auditStats.approvalRate,
      blockRate: auditStats.blockRate,
      userAgreementRate: overrideStats.agreementRate,
      lastEvaluationTime: Date.now(),
    }
  }

  /**
   * Get audit trail
   */
  getAuditTrail(count: number = 50) {
    return this.auditLogger.getRecentLogs(count)
  }

  /**
   * Get value registry configuration
   */
  getValueConfiguration() {
    return valueRegistry.getConfiguration()
  }

  /**
   * Get explanation for a decision
   */
  getDecisionExplanation(auditId: string): string | undefined {
    return this.auditLogger.getExplanation(auditId)
  }

  /**
   * Publish alignment evaluation event
   */
  private async publishAlignmentEvent(result: AlignmentCheckResult): Promise<void> {
    await eventPublisher.alignmentEvaluated(
      {
        actionId: result.actionId,
        decision: result.decision,
        riskLevel: result.riskLevel,
        violatedPolicies: result.violatedPolicies,
        confidence: result.confidence,
      },
      'alignment-layer',
    )
  }

  /**
   * Publish user override event
   */
  private async publishOverrideEvent(override: {
    actionId: string
    originalDecision: ActionDecision
    userDecision: ActionDecision
    overrideId?: string
    reason: string
  }): Promise<void> {
    await eventPublisher.userOverrideOccurred(
      {
        actionId: override.actionId,
        originalDecision: override.originalDecision,
        userDecision: override.userDecision,
        reason: override.reason,
      },
      'alignment-layer',
    )
  }

  /**
   * Get all core components (for testing/debugging)
   */
  getComponents() {
    return {
      valueRegistry,
      policyEvaluator: this.policyEvaluator,
      auditLogger: this.auditLogger,
      userOverrideManager: this.userOverrideManager,
    }
  }
}

export const valueAlignmentLayer = new ValueAlignmentLayer()

