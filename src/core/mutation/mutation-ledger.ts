import { MutationLedgerEntry, MutationManifest } from './types'
import { auditLedger } from '../../lib/governance'

class MutationLedger {
  private readonly storageKey = 'mutation.ledger.v1'
  private entries = new Map<string, MutationLedgerEntry>()

  constructor() {
    this.hydrate()
  }

  append(manifest: MutationManifest, riskScore: number, testReport: string[]): MutationLedgerEntry {
    const entry: MutationLedgerEntry = {
      proposalId: manifest.id,
      generatedDiffHash: this.hash(`${manifest.id}:${manifest.title}:${manifest.createdAt}`),
      testReport,
      riskScore,
      deploymentState: manifest.stage,
      recordedAt: Date.now(),
    }

    this.entries.set(manifest.id, entry)
    this.persist()
    auditLedger.append('mutation_ledger', {
      pluginId: 'system.mutation',
      actionId: manifest.stage,
      params: entry,
    }).catch(() => {})

    return entry
  }

  updateState(proposalId: string, state: MutationLedgerEntry['deploymentState'], rollbackId?: string): void {
    const found = this.entries.get(proposalId)
    if (!found) return
    found.deploymentState = state
    if (rollbackId) found.rollbackId = rollbackId
    this.entries.set(proposalId, found)
    this.persist()
  }

  list(limit = 100): MutationLedgerEntry[] {
    return Array.from(this.entries.values()).slice(-limit)
  }

  private hash(input: string): string {
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i)
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
    }
    return (hash >>> 0).toString(16)
  }

  private hydrate(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (!raw) return
      const entries = JSON.parse(raw) as MutationLedgerEntry[]
      this.entries = new Map(entries.map((entry) => [entry.proposalId, entry]))
    } catch {
      this.entries.clear()
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(Array.from(this.entries.values())))
    } catch {
      // Ignore persistence failures and keep in-memory behavior.
    }
  }
}

export const mutationLedger = new MutationLedger()
