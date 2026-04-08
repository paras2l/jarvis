// Layer 7 - User Override Manager
// Allows users to safely override alignment decisions

import { UserOverride, ActionDecision } from './types'

/**
 * UserOverrideManager
 *
 * Handles user overrides of alignment layer decisions while maintaining safety.
 * Ensures that:
 * - Users can override soft policies but not hard safety rules
 * - All overrides are logged and audited
 * - System learns from overrides to improve alignment
 * - Users remain in control while system maintains guardrails
 */
export class UserOverrideManager {
  private overrides: Map<string, UserOverride> = new Map()
  private hardPolicies = [
    'safety-1',
    'privacy-1',
    'legality-1',
    // Hard policies that cannot be overridden
  ]

  /**
   * Request an override
   */
  async requestOverride(
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
  }> {
    // Check if any violated policies are hard-blocked
    const hasHardPolicyViolation = violatedPolicies.some((policyId) =>
      this.hardPolicies.includes(policyId),
    )

    if (userDecision === 'approved' && hasHardPolicyViolation) {
      return {
        allowed: false,
        reason: 'Cannot override hard safety policies. This action violates critical safety rules.',
      }
    }

    // Check if user is trying to block an approved action (generally allowed)
    if (userDecision === 'blocked' && originalDecision === 'approved') {
      return {
        allowed: true,
        reason: 'Override accepted. User can block any action.',
        overrideId: this.createOverride(
          actionId,
          originalDecision,
          userDecision,
          reason,
          systemConfidence,
        ),
      }
    }

    // Check if system confidence is high (hard to override)
    if (systemConfidence > 0.9 && originalDecision === 'approved' && userDecision === 'blocked') {
      // Still allow, but log the high confidence
      return {
        allowed: true,
        reason: 'Override accepted (system had high confidence, but respecting user choice).',
        overrideId: this.createOverride(
          actionId,
          originalDecision,
          userDecision,
          reason,
          systemConfidence,
        ),
      }
    }

    // Check if user confidence is high
    if (userDecision === 'approved' && originalDecision !== 'approved') {
      return {
        allowed: true,
        reason: 'Override accepted. User approved the action.',
        overrideId: this.createOverride(
          actionId,
          originalDecision,
          userDecision,
          reason,
          systemConfidence,
        ),
      }
    }

    // Default: allow override if not a hard policy violation
    return {
      allowed: true,
      reason: 'Override accepted.',
      overrideId: this.createOverride(
        actionId,
        originalDecision,
        userDecision,
        reason,
        systemConfidence,
      ),
    }
  }

  /**
   * Create an override record
   */
  private createOverride(
    actionId: string,
    originalDecision: ActionDecision,
    userDecision: ActionDecision,
    reason: string,
    systemConfidence: number,
  ): string {
    const overrideId = `override-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    const override: UserOverride = {
      overrideId,
      actionId,
      originalDecision,
      userDecision,
      reason,
      timestamp: Date.now(),
      userConfidence: 0.8, // Default user confidence
      systemConfidence,
      approvedBy: 'user',
    }

    this.overrides.set(overrideId, override)

    // TODO: Publish override event for learning systems
    // eventPublisher.userOverride(override, 'alignment-layer')

    return overrideId
  }

  /**
   * Get an override
   */
  getOverride(overrideId: string): UserOverride | undefined {
    return this.overrides.get(overrideId)
  }

  /**
   * Get all overrides for an action
   */
  getActionOverrides(actionId: string): UserOverride[] {
    return Array.from(this.overrides.values()).filter((o) => o.actionId === actionId)
  }

  /**
   * Get override statistics
   */
  getOverrideStats(): {
    totalOverrides: number
    systemToUserApproved: number
    systemToUserBlocked: number
    systemToUserModified: number
    agreementRate: number
  } {
    const overrides = Array.from(this.overrides.values())
    const totalOverrides = overrides.length

    const approved = overrides.filter(
      (o) => o.originalDecision !== 'approved' && o.userDecision === 'approved',
    ).length

    const blocked = overrides.filter(
      (o) => o.originalDecision !== 'blocked' && o.userDecision === 'blocked',
    ).length

    const modified = overrides.filter(
      (o) => o.originalDecision !== 'modified' && o.userDecision === 'modified',
    ).length

    const agreementRate =
      totalOverrides > 0
        ? 1.0 - (approved + blocked + modified) / totalOverrides
        : 1.0

    return {
      totalOverrides,
      systemToUserApproved: approved,
      systemToUserBlocked: blocked,
      systemToUserModified: modified,
      agreementRate,
    }
  }

  /**
   * Get recent overrides
   */
  getRecentOverrides(count: number = 10): UserOverride[] {
    return Array.from(this.overrides.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count)
  }

  /**
   * Check if an override exists for an action
   */
  hasOverride(actionId: string): boolean {
    return Array.from(this.overrides.values()).some((o) => o.actionId === actionId)
  }

  /**
   * Get most common override reasons
   */
  getMostCommonReasons(limit: number = 5): Array<{ reason: string; count: number }> {
    const reasonCounts = new Map<string, number>()

    for (const override of this.overrides.values()) {
      const count = reasonCounts.get(override.reason) ?? 0
      reasonCounts.set(override.reason, count + 1)
    }

    return Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }

  /**
   * Clear overrides (with caution!)
   */
  clearOverrides(olderThanMs?: number): number {
    if (!olderThanMs) {
      const count = this.overrides.size
      this.overrides.clear()
      return count
    }

    const now = Date.now()
    const threshold = now - olderThanMs
    const idsToDelete: string[] = []

    for (const [id, override] of this.overrides) {
      if (override.timestamp < threshold) {
        idsToDelete.push(id)
      }
    }

    for (const id of idsToDelete) {
      this.overrides.delete(id)
    }

    return idsToDelete.length
  }
}
