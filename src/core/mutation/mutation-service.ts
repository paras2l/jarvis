import { mutationManifestRegistry } from './manifest-registry'
import { mutationBoundaryGuard } from './boundary-guard'
import { mutationSandboxExecutor } from './sandbox-executor'
import { mutationCanaryManager } from './canary-manager'
import { mutationRollbackManager } from './rollback-manager'
import { quarantineRegistry } from './quarantine-registry'
import { MutationManifest } from './types'
import { featureRegistry } from './feature-registry'
import { mutationLedger } from './mutation-ledger'

class MutationService {
  async propose(manifest: MutationManifest): Promise<{ ok: boolean; reason: string }> {
    mutationManifestRegistry.add({ ...manifest, stage: 'proposed' })

    const guard = mutationBoundaryGuard.assertAllowed(manifest)
    if (!guard.ok) {
      mutationManifestRegistry.updateStage(manifest.id, 'quarantined')
      quarantineRegistry.add(manifest.id)
      mutationLedger.append({ ...manifest, stage: 'quarantined' }, 1, [guard.reason])
      return { ok: false, reason: guard.reason }
    }

    mutationManifestRegistry.updateStage(manifest.id, 'validated')

    const riskScore = this.scoreRisk(manifest)
    if ((manifest.risk === 'medium' || manifest.risk === 'high' || manifest.risk === 'critical') && !manifest.approval?.approvedByUser) {
      mutationManifestRegistry.updateStage(manifest.id, 'awaiting_signoff')
      mutationLedger.append({ ...manifest, stage: 'awaiting_signoff' }, riskScore, ['waiting-user-signoff'])
      return { ok: false, reason: 'user-signoff-required' }
    }

    const sandbox = await mutationSandboxExecutor.run(manifest)
    if (!sandbox.ok) {
      mutationManifestRegistry.updateStage(manifest.id, 'quarantined')
      quarantineRegistry.add(manifest.id)
      featureRegistry.disable(manifest.id)
      mutationLedger.append({ ...manifest, stage: 'quarantined' }, riskScore, sandbox.checks)
      return { ok: false, reason: sandbox.error || 'sandbox-failed' }
    }

    mutationManifestRegistry.updateStage(manifest.id, 'sandboxed')
    mutationManifestRegistry.updateStage(manifest.id, 'canary')
    mutationLedger.append({ ...manifest, stage: 'canary' }, riskScore, sandbox.checks)

    const inCanary = mutationCanaryManager.shouldRouteToCanary()
    featureRegistry.registerFromManifest(manifest)
    if (!inCanary) {
      mutationManifestRegistry.updateStage(manifest.id, 'promoted')
      mutationRollbackManager.record(manifest.id)
      mutationLedger.updateState(manifest.id, 'promoted')
      return { ok: true, reason: 'promoted' }
    }

    return { ok: true, reason: 'canary-active' }
  }

  rollbackLast(): { ok: boolean; version?: string } {
    const rollback = mutationRollbackManager.rollback()
    if (rollback.ok && rollback.version) {
      featureRegistry.disable(rollback.version)
      mutationLedger.updateState(rollback.version, 'rolled_back', rollback.version)
    }
    return rollback
  }

  reportCanaryOutcome(featureId: string, healthy: boolean): void {
    if (healthy) {
      featureRegistry.enable(featureId)
      mutationManifestRegistry.updateStage(featureId, 'promoted')
      mutationLedger.updateState(featureId, 'promoted')
      return
    }

    quarantineRegistry.add(featureId)
    featureRegistry.disable(featureId)
    mutationManifestRegistry.updateStage(featureId, 'quarantined')
    mutationLedger.updateState(featureId, 'quarantined')
  }

  private scoreRisk(manifest: MutationManifest): number {
    const base = manifest.risk === 'critical'
      ? 0.95
      : manifest.risk === 'high'
      ? 0.75
      : manifest.risk === 'medium'
      ? 0.5
      : 0.25
    const boundaryPenalty = manifest.immutableBoundaryTouched ? 0.2 : 0
    const scopePenalty = manifest.dataAccessScope.includes('device_control') ? 0.15 : 0
    return Math.min(1, base + boundaryPenalty + scopePenalty)
  }
}

export const mutationService = new MutationService()
