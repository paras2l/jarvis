export type PolicyDecision = 'allow' | 'deny'
export type PolicyRiskClass = 'low' | 'medium' | 'high' | 'critical'
export type PolicyPack = 'normal' | 'critical_work' | 'offline' | 'protected_zone'

export interface PolicyDecisionTokenClaims {
  requestId: string
  agentId: string
  action: string
  riskClass: PolicyRiskClass
  issuedAt: number
  expiresAt: number
  policyPack: PolicyPack
}

export interface PolicyContext {
  requestId?: string
  agentId: string
  action: string
  command: string
  riskScore?: number
  targetApp?: string
  targetDeviceId?: string
  deviceState?: 'idle' | 'busy' | 'offline' | 'unknown'
  locationContext?: string
  requestedPrivileges?: string[]
  occurredAt?: number
  policyPack?: PolicyPack
  explicitPermission?: boolean
  emergency?: boolean
  commander?: string
  codeword?: string
  overrideToken?: string
  source: 'local' | 'remote' | 'protocol'
}

export interface PolicyResult {
  requestId: string
  decision: PolicyDecision
  issuer: string
  riskClass: PolicyRiskClass
  riskScore: number
  reason: string
  policyPack: PolicyPack
  tokenRequired: boolean
  decisionToken?: string
  tokenExpiresAt?: number
  bypassedByCodeword?: boolean
  bypassedByCommander?: boolean
  matchedRules: string[]
  timestamp: number
}

export interface PolicyRule {
  id: string
  title: string
  enabled: boolean
  description: string
}
