import { MutationManifest } from './types'

const IMMUTABLE_PATHS = [
  'src/core/protocols/HardcodeProtocol.ts',
  'src/core/protocols/CustodianProtocol.ts',
  'src/core/policy/PolicyGateway.ts',
  'src/core/agent-engine.ts',
]

class MutationBoundaryGuard {
  touchesImmutableBoundary(targetFiles: string[]): boolean {
    return targetFiles.some((p) => IMMUTABLE_PATHS.includes(p))
  }

  assertAllowed(manifest: MutationManifest): { ok: boolean; reason: string } {
    if (this.touchesImmutableBoundary(manifest.targetFiles)) {
      return { ok: false, reason: 'Mutation touches immutable boundary paths' }
    }

    if (!manifest.rollbackPlan.trim()) {
      return { ok: false, reason: 'Rollback plan is required' }
    }

    if (!manifest.capabilities.length) {
      return { ok: false, reason: 'Capabilities must be declared' }
    }

    if (!manifest.dataAccessScope.length) {
      return { ok: false, reason: 'Data access scope must be declared' }
    }

    if (!manifest.sideEffects.length) {
      return { ok: false, reason: 'Side effects must be declared' }
    }

    if (!manifest.ownerProtocol.trim()) {
      return { ok: false, reason: 'Owner protocol is required' }
    }

    return { ok: true, reason: 'Boundary check passed' }
  }
}

export const mutationBoundaryGuard = new MutationBoundaryGuard()
