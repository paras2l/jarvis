export type MutationRisk = 'low' | 'medium' | 'high' | 'critical'
export type MutationStage =
  | 'proposed'
  | 'validated'
  | 'awaiting_signoff'
  | 'sandboxed'
  | 'canary'
  | 'promoted'
  | 'rolled_back'
  | 'quarantined'

export type DataAccessScope = 'none' | 'memory' | 'task' | 'filesystem' | 'network' | 'device_control'

export interface MutationApproval {
  approvedByUser: boolean
  approverId?: string
  approvedAt?: number
}

export interface MutationManifest {
  id: string
  title: string
  createdAt: number
  requestedBy: string
  ownerProtocol: string
  capabilities: string[]
  dataAccessScope: DataAccessScope[]
  sideEffects: string[]
  targetFiles: string[]
  dependencyGraph: string[]
  rollbackPlan: string
  risk: MutationRisk
  healthScore?: number
  disableSwitch?: boolean
  approval?: MutationApproval
  immutableBoundaryTouched: boolean
  stage: MutationStage
}

export interface SandboxResult {
  ok: boolean
  checks: string[]
  error?: string
}

export interface MutationLedgerEntry {
  proposalId: string
  generatedDiffHash: string
  testReport: string[]
  riskScore: number
  deploymentState: MutationStage
  rollbackId?: string
  recordedAt: number
}
