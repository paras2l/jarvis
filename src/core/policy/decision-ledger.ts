import { PolicyResult, PolicyContext } from './types'
import { auditLedger } from '../../lib/governance'

export interface DecisionLedgerEntry {
  requestId: string
  riskClass: PolicyResult['riskClass']
  riskScore: number
  policyResult: PolicyResult['decision']
  issuer: string
  tokenId?: string
  tokenExpiration?: number
  finalOutcome?: 'success' | 'failed'
  action: string
  commandPreview: string
  requestedPrivileges: string[]
  targetApp?: string
  targetDeviceId?: string
  createdAt: number
}

class DecisionLedger {
  private entries = new Map<string, DecisionLedgerEntry>()

  recordDecision(ctx: PolicyContext, result: PolicyResult): void {
    const tokenId = result.decisionToken ? result.decisionToken.slice(0, 22) : undefined
    const entry: DecisionLedgerEntry = {
      requestId: result.requestId,
      riskClass: result.riskClass,
      riskScore: result.riskScore,
      policyResult: result.decision,
      issuer: result.issuer,
      tokenId,
      tokenExpiration: result.tokenExpiresAt,
      action: ctx.action,
      commandPreview: (ctx.command || '').slice(0, 180),
      requestedPrivileges: ctx.requestedPrivileges || [],
      targetApp: ctx.targetApp,
      targetDeviceId: ctx.targetDeviceId,
      createdAt: Date.now(),
    }

    this.entries.set(entry.requestId, entry)

    auditLedger.append('decision_ledger', {
      pluginId: 'system.policy_gateway',
      actionId: result.decision,
      params: entry,
    }).catch(() => {})
  }

  finalizeOutcome(requestId: string, success: boolean): void {
    const entry = this.entries.get(requestId)
    if (!entry) return
    entry.finalOutcome = success ? 'success' : 'failed'
    this.entries.set(requestId, entry)
  }

  get(requestId: string): DecisionLedgerEntry | undefined {
    return this.entries.get(requestId)
  }

  list(limit = 100): DecisionLedgerEntry[] {
    return Array.from(this.entries.values()).slice(-limit)
  }
}

export const decisionLedger = new DecisionLedger()
