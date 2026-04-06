import { MutationManifest, MutationRisk } from './types'

export interface FeatureRegistryEntry {
  featureId: string
  version: string
  ownerProtocol: string
  dependencyGraph: string[]
  riskClass: MutationRisk
  healthScore: number
  disableSwitch: boolean
  updatedAt: number
}

class FeatureRegistry {
  private readonly storageKey = 'mutation.featureRegistry.v1'
  private entries = new Map<string, FeatureRegistryEntry>()

  constructor() {
    this.hydrate()
  }

  registerFromManifest(manifest: MutationManifest): void {
    const current = this.entries.get(manifest.id)
    const nextVersion = current ? this.bumpPatch(current.version) : '1.0.0'

    this.entries.set(manifest.id, {
      featureId: manifest.id,
      version: nextVersion,
      ownerProtocol: manifest.ownerProtocol,
      dependencyGraph: manifest.dependencyGraph,
      riskClass: manifest.risk,
      healthScore: manifest.healthScore ?? 1,
      disableSwitch: !!manifest.disableSwitch,
      updatedAt: Date.now(),
    })
    this.persist()
  }

  disable(featureId: string): void {
    const found = this.entries.get(featureId)
    if (!found) return
    found.disableSwitch = true
    found.updatedAt = Date.now()
    this.entries.set(featureId, found)
    this.persist()
  }

  enable(featureId: string): void {
    const found = this.entries.get(featureId)
    if (!found) return
    found.disableSwitch = false
    found.updatedAt = Date.now()
    this.entries.set(featureId, found)
    this.persist()
  }

  get(featureId: string): FeatureRegistryEntry | undefined {
    return this.entries.get(featureId)
  }

  list(): FeatureRegistryEntry[] {
    return Array.from(this.entries.values())
  }

  private bumpPatch(version: string): string {
    const [major, minor, patch] = version.split('.').map((v) => Number(v) || 0)
    return `${major}.${minor}.${patch + 1}`
  }

  private hydrate(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (!raw) return
      const entries = JSON.parse(raw) as FeatureRegistryEntry[]
      this.entries = new Map(entries.map((entry) => [entry.featureId, entry]))
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

export const featureRegistry = new FeatureRegistry()
