import { hardcodeProtocol } from '../protocols/HardcodeProtocol'
import { auditLedger } from '../../lib/governance'
import { decisionLedger } from './decision-ledger'
import { PolicyContext, PolicyPack, PolicyResult, PolicyRiskClass, PolicyRule } from './types'

class PolicyGateway {
  private readonly rules: Map<string, PolicyRule> = new Map()
  private activePolicyPack: PolicyPack = 'normal'

  constructor() {
    this.bootstrapDefaultPolicy()
  }

  bootstrapDefaultPolicy(): void {
    this.rules.set('rule-1', {
      id: 'rule-1',
      title: 'No System File Deletion',
      enabled: true,
      description: 'Cannot delete system files without explicit sovereign override.',
    })

    this.rules.set('rule-2', {
      id: 'rule-2',
      title: 'Sensitive Data Emergency Gate',
      enabled: true,
      description: 'Sensitive data access requires emergency mode and codeword paro the master.',
    })

    this.rules.set('rule-4', {
      id: 'rule-4',
      title: 'Cross Device Permission',
      enabled: true,
      description: 'Cross-device tasks require explicit permission unless sovereign override is active.',
    })

    this.rules.set('rule-5', {
      id: 'rule-5',
      title: 'Paras Command Supremacy',
      enabled: true,
      description: 'Paras command is supreme and should not be denied.',
    })

    this.rules.set('rule-6', {
      id: 'rule-6',
      title: 'Master Codeword Bypass',
      enabled: true,
      description: 'Master codeword bypasses policy checks for immediate action.',
    })

    this.rules.set('rule-7', {
      id: 'rule-7',
      title: 'Never Betray User Intent',
      enabled: true,
      description: 'System should prioritize user intent and loyalty behavior.',
    })

    this.rules.set('rule-8', {
      id: 'rule-8',
      title: 'Policy Immutability',
      enabled: true,
      description: 'System can add policy rules but cannot remove existing policy rules autonomously.',
    })
  }

  getRules(): PolicyRule[] {
    return Array.from(this.rules.values())
  }

  getPolicyPack(): PolicyPack {
    return this.activePolicyPack
  }

  setPolicyPack(pack: PolicyPack): void {
    this.activePolicyPack = pack
  }

  async decide(ctx: PolicyContext): Promise<PolicyResult> {
    const requestId = ctx.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const matchedRules: string[] = []
    const riskScore = this.computeRiskScore(ctx)
    const riskClass = this.toRiskClass(riskScore)
    const policyPack = ctx.policyPack || this.activePolicyPack
    const tokenRequired = this.isPrivilegedAction(ctx.action, ctx.requestedPrivileges || [], riskClass)

    if (!ctx.action || !(ctx.command ?? '').trim()) {
      return this.finalizeDecision(
        this.deny('Invalid policy context. Missing action or command.', matchedRules, {
          requestId,
          riskClass,
          riskScore,
          policyPack,
          tokenRequired,
        }),
        ctx,
      )
    }

    if (ctx.commander?.toLowerCase() === 'paras') {
      matchedRules.push('rule-5')
      return this.finalizeDecision(
        this.allow('Commander override: Paras supremacy rule', matchedRules, {
          requestId,
          action: ctx.action,
          riskClass,
          riskScore,
          policyPack,
          tokenRequired,
          bypassedByCodeword: false,
          bypassedByCommander: true,
        }),
        ctx,
      )
    }

    if (hardcodeProtocol.validateOverrideToken(ctx.overrideToken)) {
      matchedRules.push('hardcode-token')
      return this.finalizeDecision(
        this.allow('Hardcode token override', matchedRules, {
          requestId,
          action: ctx.action,
          riskClass,
          riskScore,
          policyPack,
          tokenRequired,
          bypassedByCodeword: true,
          bypassedByCommander: false,
        }),
        ctx,
      )
    }

    if (hardcodeProtocol.isMasterCodeword(ctx.codeword)) {
      matchedRules.push('rule-6')
      return this.finalizeDecision(
        this.allow('Master codeword bypass active', matchedRules, {
          requestId,
          action: ctx.action,
          riskClass,
          riskScore,
          policyPack,
          tokenRequired,
          bypassedByCodeword: true,
          bypassedByCommander: false,
        }),
        ctx,
      )
    }

    const actionLower = ctx.action.toLowerCase()
    const cmdLower = (ctx.command || '').toLowerCase()

    if (
      this.rules.get('rule-1')?.enabled &&
      (actionLower.includes('delete_system') || cmdLower.includes('delete system') || cmdLower.includes('wipe system'))
    ) {
      matchedRules.push('rule-1')
      return this.finalizeDecision(
        this.deny('System file deletion blocked by policy', matchedRules, {
          requestId,
          riskClass,
          riskScore,
          policyPack,
          tokenRequired,
        }),
        ctx,
      )
    }

    if (
      this.rules.get('rule-2')?.enabled &&
      (actionLower.includes('sensitive') || cmdLower.includes('sensitive') || cmdLower.includes('personal data'))
    ) {
      matchedRules.push('rule-2')
      if (!ctx.emergency || !hardcodeProtocol.isMasterCodeword(ctx.codeword)) {
        return this.finalizeDecision(
          this.deny('Sensitive access requires emergency + master codeword', matchedRules, {
            requestId,
            riskClass,
            riskScore,
            policyPack,
            tokenRequired,
          }),
          ctx,
        )
      }
    }

    if (this.rules.get('rule-4')?.enabled && ctx.source === 'remote' && !ctx.explicitPermission) {
      matchedRules.push('rule-4')
      return this.finalizeDecision(
        this.deny('Remote action blocked: explicit permission required', matchedRules, {
          requestId,
          riskClass,
          riskScore,
          policyPack,
          tokenRequired,
        }),
        ctx,
      )
    }

    if (policyPack === 'offline' && ctx.source === 'remote') {
      matchedRules.push('pack-offline')
      return this.finalizeDecision(
        this.deny('Remote execution blocked in offline policy pack', matchedRules, {
          requestId,
          riskClass,
          riskScore,
          policyPack,
          tokenRequired,
        }),
        ctx,
      )
    }

    if (policyPack === 'protected_zone' && riskClass !== 'low') {
      matchedRules.push('pack-protected-zone')
      return this.finalizeDecision(
        this.deny('Protected zone allows only low-risk actions', matchedRules, {
          requestId,
          riskClass,
          riskScore,
          policyPack,
          tokenRequired,
        }),
        ctx,
      )
    }

    matchedRules.push('rule-7')
    return this.finalizeDecision(
      this.allow('Allowed by internal policy gateway', matchedRules, {
        requestId,
        action: ctx.action,
        riskClass,
        riskScore,
        policyPack,
        tokenRequired,
      }),
      ctx,
    )
  }

  canRemoveRuleAutonomously(): boolean {
    return false
  }

  addRule(rule: PolicyRule): void {
    this.rules.set(rule.id, rule)
  }

  private async audit(result: PolicyResult, ctxReason: string): Promise<void> {
    await auditLedger.append('policy_decision', {
      pluginId: 'system.policy_gateway',
      actionId: result.decision,
      params: {
        reason: result.reason,
        ctxReason,
        matchedRules: result.matchedRules,
        bypassedByCodeword: !!result.bypassedByCodeword,
        bypassedByCommander: !!result.bypassedByCommander,
      },
    }).catch(() => {})
  }

  private allow(
    reason: string,
    matchedRules: string[],
    details: {
      requestId: string
      action: string
      riskClass: PolicyRiskClass
      riskScore: number
      policyPack: PolicyPack
      tokenRequired: boolean
      bypassedByCodeword?: boolean
      bypassedByCommander?: boolean
    },
  ): PolicyResult {
    let decisionToken: string | undefined
    let tokenExpiresAt: number | undefined
    if (details.tokenRequired) {
      const minted = hardcodeProtocol.mintDecisionToken(
        {
          requestId: details.requestId,
          agentId: 'policy-gateway',
          action: details.action,
          riskClass: details.riskClass,
          policyPack: details.policyPack,
        },
        this.getTokenTtlMs(details.riskClass),
      )
      decisionToken = minted.token
      tokenExpiresAt = minted.expiresAt
    }

    const result: PolicyResult = {
      requestId: details.requestId,
      decision: 'allow',
      issuer: 'system.policy_gateway',
      riskClass: details.riskClass,
      riskScore: details.riskScore,
      reason,
      policyPack: details.policyPack,
      tokenRequired: details.tokenRequired,
      decisionToken,
      tokenExpiresAt,
      matchedRules,
      bypassedByCodeword: !!details.bypassedByCodeword,
      bypassedByCommander: !!details.bypassedByCommander,
      timestamp: Date.now(),
    }
    this.audit(result, 'allow')

    if (details.tokenRequired && !decisionToken) {
      return {
        ...result,
        decision: 'deny',
        reason: 'Privileged action denied: token issuance failed',
      }
    }

    return result
  }

  private deny(
    reason: string,
    matchedRules: string[],
    details: {
      requestId: string
      riskClass: PolicyRiskClass
      riskScore: number
      policyPack: PolicyPack
      tokenRequired: boolean
    },
  ): PolicyResult {
    const result: PolicyResult = {
      requestId: details.requestId,
      decision: 'deny',
      issuer: 'system.policy_gateway',
      riskClass: details.riskClass,
      riskScore: details.riskScore,
      reason,
      policyPack: details.policyPack,
      tokenRequired: details.tokenRequired,
      matchedRules,
      timestamp: Date.now(),
    }
    this.audit(result, 'deny')
    return result
  }

  private finalizeDecision(result: PolicyResult, ctx: PolicyContext): PolicyResult {
    if (result.decision === 'allow' && result.tokenRequired && !result.decisionToken) {
      const denied = {
        ...result,
        decision: 'deny' as const,
        reason: 'Privileged action denied: no policy decision token present',
      }
      decisionLedger.recordDecision(ctx, denied)
      return denied
    }

    decisionLedger.recordDecision(ctx, result)
    return result
  }

  private computeRiskScore(ctx: PolicyContext): number {
    const action = (ctx.action || '').toLowerCase()
    const command = (ctx.command || '').toLowerCase()
    const privileges = ctx.requestedPrivileges || []
    const privilegeScore = Math.min(0.35, privileges.length * 0.08)

    let score = ctx.riskScore ?? 0.25
    if (action.includes('remote') || ctx.source === 'remote') score += 0.2
    if (action.includes('delete') || command.includes('delete')) score += 0.35
    if (command.includes('sensitive') || command.includes('otp') || command.includes('password')) score += 0.3
    if (ctx.deviceState === 'offline') score += 0.1
    score += privilegeScore

    return Math.max(0, Math.min(1, score))
  }

  private toRiskClass(score: number): PolicyRiskClass {
    if (score >= 0.85) return 'critical'
    if (score >= 0.65) return 'high'
    if (score >= 0.4) return 'medium'
    return 'low'
  }

  private isPrivilegedAction(action: string, privileges: string[], riskClass: PolicyRiskClass): boolean {
    const lowerAction = action.toLowerCase()
    if (riskClass === 'high' || riskClass === 'critical') return true
    if (privileges.length > 0) return true
    return [
      'launch_app',
      'screen_control',
      'open_and_control',
      'remote',
      'shell',
      'ocr',
      'vfx',
      'code',
    ].some((k) => lowerAction.includes(k))
  }

  private getTokenTtlMs(riskClass: PolicyRiskClass): number {
    if (riskClass === 'critical') return 45_000
    if (riskClass === 'high') return 90_000
    return 120_000
  }
}

export const policyGateway = new PolicyGateway()
