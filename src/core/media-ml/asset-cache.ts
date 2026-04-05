/**
 * Asset Cache Manager (Phase 2)
 *
 * Manages local caching of generated media artifacts:
 * - Stores audio, images, video previews in localStorage + indexed db
 * - Deduplicates identical prompts to avoid regeneration
 * - Respects device storage quota (5MB default, configurable)
 * - Auto-cleanup of LRU items when quota exceeded
 */

export interface CachedAsset {
  id: string
  contentHash: string // SHA256 of prompt + params
  assetUri: string // file:// or data:// URI
  assetType: 'image' | 'audio' | 'video'
  sizeBytes: number
  prompt: string
  generatedAt: string
  expiresAt: string // TTL for cache invalidation
  hitCount: number // for LRU tracking
  lastAccessedAt: string
}

const STORAGE_KEY = 'antigravity.asset-cache'
const QUOTA_BYTES = 5 * 1024 * 1024 // 5MB
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const MIN_CACHE_SIZE = 100 * 1024 // 100KB minimum to preserve

class AssetCache {
  private cache: Map<string, CachedAsset> = new Map()

  constructor() {
    this.loadFromStorage()
  }

  /**
   * Get cached asset by prompt hash
   */
  get(contentHash: string): CachedAsset | undefined {
    const asset = this.cache.get(contentHash)
    if (!asset) return undefined

    // Check expiration
    if (new Date(asset.expiresAt) < new Date()) {
      this.cache.delete(contentHash)
      return undefined
    }

    // Update access tracking for LRU
    asset.hitCount++
    asset.lastAccessedAt = new Date().toISOString()
    this.saveToStorage()

    return asset
  }

  /**
   * Store generated asset with deduplication
   */
  put(
    contentHash: string,
    assetUri: string,
    assetType: 'image' | 'audio' | 'video',
    prompt: string,
    sizeBytes: number
  ): void {
    const now = new Date()

    const asset: CachedAsset = {
      id: `${assetType}-${Date.now()}-${Math.random()}`,
      contentHash,
      assetUri,
      assetType,
      sizeBytes,
      prompt,
      generatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
      hitCount: 0,
      lastAccessedAt: now.toISOString(),
    }

    this.cache.set(contentHash, asset)
    this.enforceQuota()
    this.saveToStorage()
  }

  /**
   * Generate hash from prompt + params
   */
  hashPrompt(prompt: string, mode: string, quality: string): string {
    const input = `${prompt}|${mode}|${quality}`
    // Simple hash (in production, use crypto.subtle.digest)
    let hash = 0
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32bit integer
    }
    return `hash-${Math.abs(hash)}`
  }

  /**
   * Clear expired and least-recently-used items
   */
  private enforceQuota(): void {
    let totalSize = Array.from(this.cache.values()).reduce((sum, a) => sum + a.sizeBytes, 0)

    // Remove expired
    const now = new Date()
    for (const [key, asset] of this.cache.entries()) {
      if (new Date(asset.expiresAt) < now) {
        this.cache.delete(key)
        totalSize -= asset.sizeBytes
      }
    }

    // If still over quota, remove LRU
    if (totalSize > QUOTA_BYTES) {
      const sorted = Array.from(this.cache.values())
        .sort((a, b) => {
          // Sort by: hit count (ascending), then by access time (ascending)
          const hitDiff = a.hitCount - b.hitCount
          if (hitDiff !== 0) return hitDiff
          return new Date(a.lastAccessedAt).getTime() - new Date(b.lastAccessedAt).getTime()
        })

      // Remove LRU until we're back under quota (or reach minimum)
      for (const asset of sorted) {
        if (totalSize <= QUOTA_BYTES) break
        if (totalSize - asset.sizeBytes < MIN_CACHE_SIZE) break // Protect minimum

        this.cache.delete(asset.contentHash)
        totalSize -= asset.sizeBytes
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear()
    const storage = this.safeStorage()
    if (storage) {
      try {
        storage.removeItem(STORAGE_KEY)
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Get cache stats
   */
  stats() {
    const totalSize = Array.from(this.cache.values()).reduce((sum, a) => sum + a.sizeBytes, 0)
    return {
      itemCount: this.cache.size,
      totalSizeBytes: totalSize,
      quotaBytes: QUOTA_BYTES,
      utilizationPercent: (totalSize / QUOTA_BYTES) * 100,
    }
  }

  /**
   * Load cache from localStorage
   */
  private loadFromStorage(): void {
    const storage = this.safeStorage()
    if (!storage) return

    try {
      const raw = storage.getItem(STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        this.cache.clear()
        for (const item of parsed) {
          this.cache.set(item.contentHash, item)
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }

  /**
   * Persist cache to localStorage
   */
  private saveToStorage(): void {
    const storage = this.safeStorage()
    if (!storage) return

    try {
      const items = Array.from(this.cache.values())
      storage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Quota exceeded or other error
    }
  }

  private safeStorage(): Storage | null {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null
    } catch {
      return null
    }
  }
}

export const assetCache = new AssetCache()
