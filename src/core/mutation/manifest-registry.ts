import { MutationManifest } from './types'

class MutationManifestRegistry {
  private readonly storageKey = 'mutation.manifests.v1'
  private manifests: Map<string, MutationManifest> = new Map()

  constructor() {
    this.hydrate()
  }

  add(manifest: MutationManifest): void {
    this.manifests.set(manifest.id, manifest)
    this.persist()
  }

  get(id: string): MutationManifest | undefined {
    return this.manifests.get(id)
  }

  list(): MutationManifest[] {
    return Array.from(this.manifests.values())
  }

  updateStage(id: string, stage: MutationManifest['stage']): void {
    const m = this.manifests.get(id)
    if (!m) return
    m.stage = stage
    this.manifests.set(id, m)
    this.persist()
  }

  private hydrate(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (!raw) return
      const manifests = JSON.parse(raw) as MutationManifest[]
      this.manifests = new Map(manifests.map((manifest) => [manifest.id, manifest]))
    } catch {
      this.manifests.clear()
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.list()))
    } catch {
      // Ignore persistence failures and keep in-memory behavior.
    }
  }
}

export const mutationManifestRegistry = new MutationManifestRegistry()
