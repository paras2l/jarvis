class MutationRollbackManager {
  private rollbackStack: string[] = []

  record(versionId: string): void {
    this.rollbackStack.push(versionId)
  }

  lastStable(): string | undefined {
    return this.rollbackStack[this.rollbackStack.length - 1]
  }

  rollback(): { ok: boolean; version?: string } {
    const version = this.lastStable()
    if (!version) return { ok: false }
    return { ok: true, version }
  }
}

export const mutationRollbackManager = new MutationRollbackManager()
