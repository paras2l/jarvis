import { MutationManifest, SandboxResult } from './types'

class MutationSandboxExecutor {
  async run(manifest: MutationManifest): Promise<SandboxResult> {
    const checks = [
      'manifest-shape-valid',
      'rollback-plan-present',
      'capability-list-present',
      'data-access-scope-present',
      'side-effects-declared',
      'owner-protocol-present',
    ]

    if (manifest.immutableBoundaryTouched) {
      return { ok: false, checks, error: 'immutable-boundary-touched' }
    }

    if (!manifest.ownerProtocol || !manifest.dataAccessScope.length || !manifest.sideEffects.length) {
      return { ok: false, checks, error: 'mutation-contract-incomplete' }
    }

    // Skeleton sandbox pass. Week 3 target: replace with real isolated execution.
    return { ok: true, checks }
  }
}

export const mutationSandboxExecutor = new MutationSandboxExecutor()
