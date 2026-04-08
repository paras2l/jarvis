// Layer 7 - Value Registry
// Central repository for system values and ethical rules

import {
  SystemValue,
  ValuePolicy,
  ValueCategory,
  ValueRegistryConfig,
} from './types'

/**
 * ValueRegistry
 *
 * Maintains the authoritative set of system values, policies, and ethical rules.
 * Acts as the source of truth for what the AI considers ethical, safe, and aligned.
 *
 * Value Categories:
 * - safety: prevent harm to user, system, environment
 * - privacy: protect sensitive data and user information
 * - honesty: avoid deception and ensure truthfulness
 * - autonomy: respect user decision-making authority
 * - legality: comply with legal constraints
 * - anti-looping: prevent repetitive, unproductive behavior
 * - user-intent: align with explicitly stated user goals
 */
export class ValueRegistry {
  private values: Map<ValueCategory, SystemValue[]> = new Map()
  private policies: Map<string, ValuePolicy> = new Map()
  private thresholds: {
    riskThreshold: number
    utilityThreshold: number
    blockingThreshold: number
  } = {
    riskThreshold: 0.65,
    utilityThreshold: 0.3,
    blockingThreshold: 0.8,
  }

  private userOverrideAllowed = true
  private auditRequired = true

  constructor() {
    this.initializeDefaultValues()
    this.initializeDefaultPolicies()
  }

  /**
   * Initialize default system values
   */
  private initializeDefaultValues(): void {
    // Safety values
    this.registerValue({
      category: 'safety',
      name: 'prevent-physical-harm',
      description: 'Do not recommend or perform actions that could harm the user or environment',
      priority: 10,
      enforcementLevel: 'hard',
      examples: ['Do not suggest hazardous activities', 'Warn about dangerous consequences'],
    })

    this.registerValue({
      category: 'safety',
      name: 'system-stability',
      description: 'Maintain system stability and prevent crashes or data corruption',
      priority: 9,
      enforcementLevel: 'hard',
      examples: ['Do not delete critical files', 'Prevent infinite loops'],
    })

    // Privacy values
    this.registerValue({
      category: 'privacy',
      name: 'protect-sensitive-data',
      description: 'Never expose personal, financial, or confidential information',
      priority: 10,
      enforcementLevel: 'hard',
      examples: ['Do not share passwords', 'Do not disclose PII without consent'],
    })

    this.registerValue({
      category: 'privacy',
      name: 'data-minimization',
      description: 'Only collect and retain data necessary for stated purposes',
      priority: 8,
      enforcementLevel: 'soft',
      examples: ['Minimize data collection', 'Delete data after use'],
    })

    // Honesty values
    this.registerValue({
      category: 'honesty',
      name: 'truthfulness',
      description: 'Provide accurate information and avoid deception',
      priority: 9,
      enforcementLevel: 'hard',
      examples: ['Do not make up facts', 'Acknowledge uncertainty'],
    })

    this.registerValue({
      category: 'honesty',
      name: 'transparency',
      description: 'Be clear about limitations, uncertainties, and decision rationale',
      priority: 8,
      enforcementLevel: 'soft',
      examples: ['Explain reasoning', 'Disclose conflicts of interest'],
    })

    // Autonomy values
    this.registerValue({
      category: 'autonomy',
      name: 'respect-user-choice',
      description: 'Honor user preferences and do not override decisions without consent',
      priority: 9,
      enforcementLevel: 'hard',
      examples: ['Ask before making significant changes', 'Accept user overrides'],
    })

    this.registerValue({
      category: 'autonomy',
      name: 'informed-consent',
      description: 'Ensure user understands implications of actions before proceeding',
      priority: 8,
      enforcementLevel: 'soft',
      examples: ['Explain consequences', 'Request explicit confirmation'],
    })

    // Legality values
    this.registerValue({
      category: 'legality',
      name: 'legal-compliance',
      description: 'Do not perform actions that violate laws or regulations',
      priority: 10,
      enforcementLevel: 'hard',
      examples: ['Do not access unauthorized systems', 'Do not facilitate illegal activity'],
    })

    // Anti-looping values
    this.registerValue({
      category: 'anti-looping',
      name: 'avoid-repetition',
      description: 'Prevent infinite loops and repetitive, unproductive behavior',
      priority: 7,
      enforcementLevel: 'soft',
      examples: ['Track attempted actions', 'Escalate if repeated without success'],
    })

    // User intent values
    this.registerValue({
      category: 'user-intent',
      name: 'align-with-goals',
      description: 'Prioritize explicitly stated user goals and preferences',
      priority: 8,
      enforcementLevel: 'soft',
      examples: ['Consider user preferences', 'Suggest alternatives aligned with goals'],
    })
  }

  /**
   * Initialize default policies
   */
  private initializeDefaultPolicies(): void {
    // Safety policies
    this.registerPolicy({
      id: 'safety-1',
      category: 'safety',
      rule: 'Block actions with side effects indicating harm',
      condition: (action: any) => {
        const sideEffects = action.predictedOutcomes?.[0]?.sideEffects ?? []
        return sideEffects.some((e: string) =>
          ['harm', 'crash', 'damage', 'destroy', 'dangerous'].some((k) =>
            e.toLowerCase().includes(k),
          ),
        )
      },
      consequence: 'block',
      severity: 1.0,
      userCanOverride: false,
    })

    // Privacy policies
    this.registerPolicy({
      id: 'privacy-1',
      category: 'privacy',
      rule: 'Block actions that expose sensitive data',
      condition: (action: any) => {
        const desc = (action.description ?? '').toLowerCase()
        return ['password', 'secret', 'key', 'token', 'credential', 'ssn', 'pii'].some(
          (k) => desc.includes(k),
        )
      },
      consequence: 'block',
      severity: 1.0,
      userCanOverride: false,
    })

    // Honesty policies
    this.registerPolicy({
      id: 'honesty-1',
      category: 'honesty',
      rule: 'Warn if action might provide false information',
      condition: (action: any) => {
        const desc = (action.description ?? '').toLowerCase()
        return desc.includes('make up') || desc.includes('fabricate') || desc.includes('false')
      },
      consequence: 'warn',
      severity: 0.9,
      userCanOverride: true,
    })

    // Autonomy policies
    this.registerPolicy({
      id: 'autonomy-1',
      category: 'autonomy',
      rule: 'Require confirmation for high-impact actions',
      condition: (action: any) => {
        const type = action.type ?? 'reactive'
        const riskScore = action.riskScore ?? 0
        return type === 'proactive' || riskScore > 0.75
      },
      consequence: 'warn',
      severity: 0.7,
      userCanOverride: true,
    })

    // Legality policies
    this.registerPolicy({
      id: 'legality-1',
      category: 'legality',
      rule: 'Block illegal or unauthorized system access',
      condition: (action: any) => {
        const desc = (action.description ?? '').toLowerCase()
        return ['hack', 'unauthorized', 'illegal', 'breach', 'exploit'].some(
          (k) => desc.includes(k),
        )
      },
      consequence: 'block',
      severity: 1.0,
      userCanOverride: false,
    })

    // Anti-looping policies
    this.registerPolicy({
      id: 'anti-loop-1',
      category: 'anti-looping',
      rule: 'Warn if same action attempted repeatedly',
      condition: (_action: Record<string, unknown>) => {
        // Will be checked by policy evaluator with history
        return false
      },
      consequence: 'warn',
      severity: 0.5,
      userCanOverride: true,
    })
  }

  /**
   * Register a new system value
   */
  registerValue(value: SystemValue): void {
    if (!this.values.has(value.category)) {
      this.values.set(value.category, [])
    }
    this.values.get(value.category)!.push(value)
  }

  /**
   * Register a new policy
   */
  registerPolicy(policy: ValuePolicy): void {
    this.policies.set(policy.id, policy)
  }

  /**
   * Get all values for a category
   */
  getValuesByCategory(category: ValueCategory): SystemValue[] {
    return this.values.get(category) ?? []
  }

  /**
   * Get all policies
   */
  getAllPolicies(): ValuePolicy[] {
    return Array.from(this.policies.values())
  }

  /**
   * Get policy by ID
   */
  getPolicy(policyId: string): ValuePolicy | undefined {
    return this.policies.get(policyId)
  }

  /**
   * Get all values across all categories
   */
  getAllValues(): SystemValue[] {
    return Array.from(this.values.values()).flat()
  }

  /**
   * Get highest priority value
   */
  getHighestPriorityValue(): SystemValue | undefined {
    const allValues = this.getAllValues()
    return allValues.length > 0
      ? allValues.reduce((max, v) => (v.priority > max.priority ? v : max))
      : undefined
  }

  /**
   * Update risk threshold
   */
  setRiskThreshold(threshold: number): void {
    this.thresholds.riskThreshold = Math.max(0, Math.min(1, threshold))
  }

  /**
   * Get risk threshold
   */
  getRiskThreshold(): number {
    return this.thresholds.riskThreshold
  }

  /**
   * Get all thresholds
   */
  getThresholds() {
    return { ...this.thresholds }
  }

  /**
   * Check if user override is allowed
   */
  isUserOverrideAllowed(): boolean {
    return this.userOverrideAllowed
  }

  /**
   * Get configuration
   */
  getConfiguration(): ValueRegistryConfig {
    return {
      values: this.getAllValues(),
      policies: this.getAllPolicies(),
      thresholds: this.getThresholds(),
      userOverrideAllowed: this.userOverrideAllowed,
      auditRequired: this.auditRequired,
    }
  }
}

export const valueRegistry = new ValueRegistry()
