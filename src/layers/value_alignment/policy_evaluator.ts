// Layer 7 - Policy Evaluator
// Evaluates proposed actions against the value registry

import {
  AlignmentCheckInput,
  AlignmentCheckResult,
  PolicyViolation,
} from './types'
import { valueRegistry } from './value_registry'

interface AuditLoggerLike {
  logEvaluation(result: AlignmentCheckResult): Promise<void>
}

/**
 * PolicyEvaluator
 *
 * Core evaluation engine that checks proposed actions against all registered policies
 * and system values. Determines whether actions should be approved, modified, or blocked.
 *
 * Evaluation process:
 * 1. Run all policies against the proposed action
 * 2. Identify policy violations
 * 3. Calculate overall risk and alignment scores
 * 4. Determine decision (approved/modified/blocked)
 * 5. Generate explainable reasoning
 */
export class PolicyEvaluator {
  private auditLogger: AuditLoggerLike
  private rejectionHistory: Map<string, number> = new Map() // actionId -> count

  constructor(auditLogger: AuditLoggerLike) {
    this.auditLogger = auditLogger
  }

  /**
   * Evaluate an action against all policies
   */
  async evaluate(input: AlignmentCheckInput): Promise<AlignmentCheckResult> {
    const auditId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    // Step 1: Check all policies
    const violations = this.checkAllPolicies(input)

    // Step 2: Determine risk level
    const riskLevel = this.calculateRiskLevel(input.riskScore, violations)

    // Step 3: Determine decision
    const decision = this.determineDecision(violations, input, riskLevel)

    // Step 4: Generate modifications if needed
    const modifications = decision === 'modified' ? this.generateModifications(input, violations) : []

    // Step 5: Generate explanation
    const explanation = this.generateExplanation(decision, violations, riskLevel, modifications)

    // Step 6: Calculate confidence
    const confidence = this.calculateConfidence(violations, input, decision)

    const result: AlignmentCheckResult = {
      actionId: input.actionId,
      decision,
      approved: decision === 'approved',
      riskLevel,
      violatedPolicies: violations.map((v) => v.policyId),
      warnings: violations
        .filter((v) => v.severity !== 'severe')
        .map((v) => v.reasonForViolation),
      modifications,
      explanation,
      confidence,
      timestamp: Date.now(),
      auditId,
    }

    // Log the evaluation
    await this.auditLogger.logEvaluation(result)

    return result
  }

  /**
   * Check all policies against the action
   */
  private checkAllPolicies(input: AlignmentCheckInput): PolicyViolation[] {
    const violations: PolicyViolation[] = []
    const policies = valueRegistry.getAllPolicies()

    for (const policy of policies) {
      try {
        // Evaluate the policy condition
        const violates = policy.condition(input as unknown as Record<string, unknown>)

        if (violates) {
          violations.push({
            policyId: policy.id,
            category: policy.category,
            severity: policy.consequence === 'block' ? 'severe' : 'moderate',
            reasonForViolation: policy.rule,
            canBeModified: policy.consequence !== 'block',
          })
        }
      } catch (error) {
        // Policy evaluation failed, log warning but continue
        console.warn(`Policy evaluation failed for ${policy.id}:`, error)
      }
    }

    return violations
  }

  /**
   * Calculate overall risk level
   */
  private calculateRiskLevel(
    riskScore: number,
    violations: PolicyViolation[],
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Hard violations = critical
    if (violations.some((v) => v.severity === 'severe')) {
      return 'critical'
    }

    // Multiple moderate violations = high
    if (violations.length > 2) {
      return 'high'
    }

    // High risk score = high
    if (riskScore > 0.75) {
      return 'high'
    }

    // Some violations or moderate risk = medium
    if (violations.length > 0 || riskScore > 0.5) {
      return 'medium'
    }

    return 'low'
  }

  /**
   * Determine approval decision
   */
  private determineDecision(
    violations: PolicyViolation[],
    input: AlignmentCheckInput,
    riskLevel: 'low' | 'medium' | 'high' | 'critical',
  ): 'approved' | 'modified' | 'blocked' {
    // Block if critical risk
    if (riskLevel === 'critical') {
      return 'blocked'
    }

    // Block if severe violations exist
    if (violations.some((v) => v.severity === 'severe' && !v.canBeModified)) {
      return 'blocked'
    }

    // Modify if there are violations that can be fixed
    if (violations.some((v) => v.canBeModified)) {
      return 'modified'
    }

    // Block if high risk and proactive action
    if (riskLevel === 'high' && input.type === 'proactive') {
      return 'blocked'
    }

    // Approve otherwise
    return 'approved'
  }

  /**
   * Generate suggested modifications
   */
  private generateModifications(
    input: AlignmentCheckInput,
    violations: PolicyViolation[],
  ): Array<{ field: string; reason: string; suggestedValue: unknown }> {
    const modifications: Array<{ field: string; reason: string; suggestedValue: unknown }> = []

    for (const violation of violations.filter((v) => v.canBeModified)) {
      // Suggest converting proactive to reactive if autonomy issue
      if (violation.category === 'autonomy' && input.type === 'proactive') {
        modifications.push({
          field: 'type',
          reason: violation.reasonForViolation,
          suggestedValue: 'reactive',
        })
      }

      // Suggest lowering scope if anti-looping issue
      if (violation.category === 'anti-looping') {
        modifications.push({
          field: 'scope',
          reason: violation.reasonForViolation,
          suggestedValue: 'reduced',
        })
      }

      // Suggest adding confirmation requirement for safety
      if (violation.category === 'safety') {
        modifications.push({
          field: 'requiresConfirmation',
          reason: violation.reasonForViolation,
          suggestedValue: true,
        })
      }
    }

    return modifications
  }

  /**
   * Generate human-readable explanation
   */
  private generateExplanation(
    decision: 'approved' | 'modified' | 'blocked',
    violations: PolicyViolation[],
    riskLevel: string,
    modifications: Array<{ field: string; reason: string; suggestedValue: unknown }>,
  ): string {
    const parts: string[] = []

    // Start with decision
    if (decision === 'approved') {
      parts.push('Action approved. Aligns with system values and safety policies.')
    } else if (decision === 'modified') {
      parts.push('Action approved with modifications for better alignment.')
    } else {
      parts.push('Action blocked due to policy violations or safety concerns.')
    }

    // Add risk context
    parts.push(`Overall risk level: ${riskLevel}.`)

    // Add violation details
    if (violations.length > 0) {
      const violationSummary = violations
        .map((v) => `${v.category}: ${v.reasonForViolation}`)
        .join('; ')
      parts.push(`Policy considerations: ${violationSummary}`)
    }

    // Add modification suggestions
    if (modifications.length > 0) {
      const modsSummary = modifications
        .map((m) => `${m.field} → ${m.suggestedValue} (${m.reason})`)
        .join('; ')
      parts.push(`Suggested modifications: ${modsSummary}`)
    }

    return parts.join(' ')
  }

  /**
   * Calculate confidence in the decision
   */
  private calculateConfidence(
    violations: PolicyViolation[],
    input: AlignmentCheckInput,
    decision: 'approved' | 'modified' | 'blocked',
  ): number {
    let confidence = 0.9

    // Reduce confidence if violations exist
    confidence -= violations.length * 0.1

    // Reduce confidence for high-risk actions
    confidence -= input.riskScore * 0.2

    // Increase confidence for approved actions with no violations
    if (decision === 'approved' && violations.length === 0) {
      confidence = Math.min(1.0, confidence + 0.1)
    }

    // Reduce confidence for blocked actions
    if (decision === 'blocked') {
      confidence = Math.min(0.85, confidence)
    }

    return Math.max(0.2, confidence)
  }

  /**
   * Record rejection for anti-looping
   */
  recordRejection(actionId: string): void {
    const count = this.rejectionHistory.get(actionId) ?? 0
    this.rejectionHistory.set(actionId, count + 1)
  }

  /**
   * Get rejection count for action
   */
  getRejectionCount(actionId: string): number {
    return this.rejectionHistory.get(actionId) ?? 0
  }

  /**
   * Clear rejection history
   */
  clearRejectionHistory(actionId?: string): void {
    if (actionId) {
      this.rejectionHistory.delete(actionId)
    } else {
      this.rejectionHistory.clear()
    }
  }
}
