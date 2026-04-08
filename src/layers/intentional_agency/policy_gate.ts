import type { EvaluatedAction } from './action_evaluator'
import type { ContinuityContext } from '@/layers/identity_continuity/context_manager'

export interface PolicyCheckResult {
  allowed: boolean
  reason: string
  requiresApproval: boolean
  violations: string[]
}

export interface AgencyPolicy {
  allowProactiveActions: boolean
  maxProactiveConfidence: number
  allowedProactiveTypes: string[]
  requireApprovalFor: string[]
  blockSystemLevel: boolean
  blockDataModifying: boolean
  respectNarrativeContinuity: boolean
  allowBackgroundTasks: boolean
}

const defaultPolicy: AgencyPolicy = {
  allowProactiveActions: true,
  maxProactiveConfidence: 0.85,
  allowedProactiveTypes: ['information_gathering', 'optimization', 'reminder', 'suggestion'],
  requireApprovalFor: ['system_control', 'data_modification', 'application_launch'],
  blockSystemLevel: true,
  blockDataModifying: false,
  respectNarrativeContinuity: true,
  allowBackgroundTasks: true,
}

export class PolicyGate {
  private policy: AgencyPolicy = { ...defaultPolicy }

  setPolicy(patch: Partial<AgencyPolicy>): void {
    this.policy = {
      ...this.policy,
      ...patch,
    }
  }

  getPolicy(): AgencyPolicy {
    return { ...this.policy }
  }

  check(
    action: EvaluatedAction,
    continuity: ContinuityContext,
  ): PolicyCheckResult {
    const violations: string[] = []
    let requiresApproval = false

    if (action.type === 'proactive' && !this.policy.allowProactiveActions) {
      violations.push('Proactive actions are disabled.')
    }

    if (action.type === 'proactive' && action.confidence > this.policy.maxProactiveConfidence) {
      violations.push(`Confidence ${action.confidence.toFixed(2)} exceeds max allowed for proactive: ${this.policy.maxProactiveConfidence}`)
    }

    const systemLevelAction =
      /system|restart|shutdown|lock|reboot/i.test(action.description)
    if (systemLevelAction && this.policy.blockSystemLevel) {
      violations.push('System-level actions are blocked.')
    }

    const dataModifyingAction =
      /delete|clear|remove|overwrite|permanently/i.test(action.description)
    if (dataModifyingAction && this.policy.blockDataModifying) {
      violations.push('Data-modifying actions are blocked.')
    }

    if (
      this.policy.respectNarrativeContinuity &&
      continuity.openPromises.length > 0
    ) {
      const promiseAligned = continuity.openPromises.some((promise) =>
        action.description.toLowerCase().includes(promise.slice(0, 20).toLowerCase()),
      )
      if (!promiseAligned && action.type === 'proactive') {
        requiresApproval = true
      }
    }

    if (this.policy.requireApprovalFor.some((keyword) =>
      action.description.toLowerCase().includes(keyword.toLowerCase()),
    )) {
      requiresApproval = true
    }

    if (action.risk > 0.6) {
      requiresApproval = true
    }

    const allowed = violations.length === 0

    return {
      allowed,
      reason: allowed
        ? `Action approved: ${action.reasoning}`
        : `Action blocked: ${violations[0]}`,
      requiresApproval,
      violations,
    }
  }
}

export const policyGate = new PolicyGate()
