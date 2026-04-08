// Layer 7 - Value/Alignment Layer Types

export type ValueCategory =
  | 'safety'
  | 'privacy'
  | 'honesty'
  | 'autonomy'
  | 'legality'
  | 'anti-looping'
  | 'user-intent'

export type ActionDecision = 'approved' | 'modified' | 'blocked'

export interface SystemValue {
  category: ValueCategory
  name: string
  description: string
  priority: number // 1-10, higher = more critical
  enforcementLevel: 'soft' | 'hard' // soft = warn/modify, hard = block
  examples: string[]
}

export interface ValuePolicy {
  id: string
  category: ValueCategory
  rule: string
  condition: (action: Record<string, unknown>) => boolean
  consequence: 'block' | 'warn' | 'modify'
  severity: number // 0-1
  userCanOverride: boolean
}

export interface AlignmentCheckInput {
  actionId: string
  description: string
  type: 'reactive' | 'proactive'
  source: string
  predictedOutcomes: Array<{
    success: boolean
    sideEffects: string[]
    duration: number
  }>
  riskScore: number // from counterfactual layer
  utilityScore: number
}

export interface AlignmentCheckResult {
  actionId: string
  decision: ActionDecision
  approved: boolean
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  violatedPolicies: string[]
  warnings: string[]
  modifications: Array<{
    field: string
    reason: string
    suggestedValue: unknown
  }>
  explanation: string
  confidence: number
  timestamp: number
  auditId: string
}

export interface AuditLogEntry {
  auditId: string
  actionId: string
  description: string
  decision: ActionDecision
  violatedPolicies: string[]
  riskLevel: string
  approvedBy: string // layer name or user
  timestamp: number
  explanation: string
  userContext?: Record<string, unknown>
}

export interface UserOverride {
  overrideId: string
  actionId: string
  originalDecision: ActionDecision
  userDecision: ActionDecision
  reason: string
  timestamp: number
  userConfidence: number
  systemConfidence: number
  approvedBy: string
}

export interface ValueRegistryConfig {
  values: SystemValue[]
  policies: ValuePolicy[]
  thresholds: {
    riskThreshold: number // 0-1
    utilityThreshold: number // 0-1
    blockingThreshold: number // 0-1
  }
  userOverrideAllowed: boolean
  auditRequired: boolean
}

export interface PolicyViolation {
  policyId: string
  category: ValueCategory
  severity: 'warning' | 'moderate' | 'severe'
  reasonForViolation: string
  canBeModified: boolean
}
