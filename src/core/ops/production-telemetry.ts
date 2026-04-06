import { protocolOrchestrator } from '../protocols/ProtocolOrchestrator'
import { decisionLedger } from '../policy/decision-ledger'
import { mutationLedger } from '../mutation/mutation-ledger'
import { quarantineRegistry } from '../mutation/quarantine-registry'
import { METRIC_THRESHOLDS } from './metric-thresholds'

export interface ProductionTelemetrySnapshot {
  generatedAt: number
  protocol: {
    totalExecutions: number
    successRate: number
    avgLatencyMs: number
    quarantined: number
    failing: number
    degraded: number
  }
  policy: {
    decisions: number
    denyRate: number
    highRiskDecisions: number
  }
  mutation: {
    totalEntries: number
    failureRate: number
    quarantined: number
  }
  releaseGate: {
    pass: boolean
    failedChecks: string[]
  }
}

export function collectProductionTelemetrySnapshot(): ProductionTelemetrySnapshot {
  const metrics = protocolOrchestrator.getMetrics()
  const health = protocolOrchestrator.getHealthReport()
  const decisions = decisionLedger.list(300)
  const mutationEntries = mutationLedger.list(300)

  const denyCount = decisions.filter((d) => d.policyResult === 'deny').length
  const denyRate = decisions.length > 0 ? denyCount / decisions.length : 0
  const highRiskDecisions = decisions.filter((d) => d.riskClass === 'high' || d.riskClass === 'critical').length

  const failedMutations = mutationEntries.filter((m) => m.deploymentState === 'quarantined' || m.deploymentState === 'rolled_back').length
  const mutationFailureRate = mutationEntries.length > 0 ? failedMutations / mutationEntries.length : 0

  const failing = Object.values(health).filter((h) => h.status === 'failing').length
  const degraded = Object.values(health).filter((h) => h.status === 'degraded').length

  const failedChecks: string[] = []
  if (denyRate > METRIC_THRESHOLDS.policyDenyRateMax) {
    failedChecks.push(`policy deny rate ${denyRate.toFixed(2)} > ${METRIC_THRESHOLDS.policyDenyRateMax}`)
  }
  if (mutationFailureRate > METRIC_THRESHOLDS.mutationFailureRateMax) {
    failedChecks.push(`mutation failure rate ${mutationFailureRate.toFixed(2)} > ${METRIC_THRESHOLDS.mutationFailureRateMax}`)
  }
  if (metrics.avgLatencyMs > METRIC_THRESHOLDS.avgDecisionLatencyMsMax) {
    failedChecks.push(`decision latency ${metrics.avgLatencyMs.toFixed(1)}ms > ${METRIC_THRESHOLDS.avgDecisionLatencyMsMax}ms`)
  }

  return {
    generatedAt: Date.now(),
    protocol: {
      totalExecutions: metrics.totalExecutions,
      successRate: metrics.successRate,
      avgLatencyMs: metrics.avgLatencyMs,
      quarantined: quarantineRegistry.list().length,
      failing,
      degraded,
    },
    policy: {
      decisions: decisions.length,
      denyRate,
      highRiskDecisions,
    },
    mutation: {
      totalEntries: mutationEntries.length,
      failureRate: mutationFailureRate,
      quarantined: mutationEntries.filter((m) => m.deploymentState === 'quarantined').length,
    },
    releaseGate: {
      pass: failedChecks.length === 0,
      failedChecks,
    },
  }
}
