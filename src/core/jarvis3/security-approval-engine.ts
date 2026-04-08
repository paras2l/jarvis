import { policyGateway } from '@/core/policy/PolicyGateway'
import { getAuthenticatedContext } from '@/core/security/auth-context'
import { JarvisApprovalDecision, JarvisApprovalRequest } from './types'

type ApprovalHandler = (request: JarvisApprovalRequest) => Promise<JarvisApprovalDecision> | JarvisApprovalDecision

type SecurityRisk = 'low' | 'medium' | 'high' | 'critical'

class SecurityApprovalEngine {
  private approvalHandler: ApprovalHandler | null = null

  registerApprovalHandler(handler: ApprovalHandler): void {
    this.approvalHandler = handler
  }

  classifyRisk(action: string): SecurityRisk {
    const lower = action.toLowerCase()
    if (/(trade|buy|sell|transfer|payment|bank|wallet|delete system|account operation)/.test(lower)) return 'critical'
    if (/(install|uninstall|system modification|shell|execute)/.test(lower)) return 'high'
    if (/(automation|file operation|close app|open and control)/.test(lower)) return 'medium'
    return 'low'
  }

  async enforcePolicy(action: string): Promise<{ allowed: boolean; reason: string }> {
    const auth = await getAuthenticatedContext()
    const decision = await policyGateway.decide({
      requestId: `jarvis3_policy_${Date.now()}`,
      agentId: 'jarvis-os',
      action: 'jarvis3_action',
      command: action,
      source: 'local',
      explicitPermission: true,
      requestedPrivileges: ['orchestration'],
      deviceState: 'busy',
      occurredAt: Date.now(),
      policyPack: policyGateway.getPolicyPack(),
      commander: auth.commander,
      codeword: auth.codeword,
      emergency: /(emergency|urgent)/i.test(action),
    })

    if (decision.decision === 'deny') {
      return { allowed: false, reason: decision.reason || 'Policy denied action.' }
    }

    return { allowed: true, reason: decision.reason || 'Policy allowed action.' }
  }

  async requestApproval(action: string, reason: string, payload?: Record<string, unknown>): Promise<JarvisApprovalDecision> {
    const policy = await this.enforcePolicy(action)
    if (!policy.allowed) {
      return { approved: false, reason: policy.reason }
    }

    const risk = this.classifyRisk(action)
    if (risk === 'low' || risk === 'medium') {
      return { approved: true, reason: 'Non-critical action approved by policy.' }
    }

    if (!this.approvalHandler) {
      return {
        approved: false,
        reason: 'Critical action requires explicit user approval handler.',
      }
    }

    return this.approvalHandler({
      id: `approval_${Date.now()}`,
      action,
      reason,
      payload,
    })
  }
}

export const securityApprovalEngine = new SecurityApprovalEngine()
