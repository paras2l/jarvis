import { appIndexer } from '@/core/platform/app-indexer'
import { getAppRegistry } from '@/core/app-registry'
import { detectPlatform } from '@/core/platform/platform-detection'
import type { PlatformId } from '@/core/platform/types'
import { memoryEngine } from '@/core/memory-engine'

export interface AppMatchResult {
  matched: boolean
  target: string
  canonicalName?: string
  confidence: number
  reason: string
  shouldClarify: boolean
  learnedAlias?: string
}

type InstalledAppMetadata = {
  appName: string
  packageName?: string
  bundleId?: string
  executableName?: string
  deepLinks?: string[]
  categories?: string[]
  sensitive?: boolean
}

const EXECUTION_THRESHOLD = 0.7

function normalize(value: string): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '')
}

function tokenize(value: string): Set<string> {
  return new Set(
    String(value || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((t) => t.trim())
      .filter(Boolean),
  )
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }

  return dp[m][n]
}

function semanticSimilarity(a: string, b: string): number {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (!ta.size || !tb.size) return 0

  let intersection = 0
  for (const token of ta) {
    if (tb.has(token)) intersection += 1
  }
  const union = new Set([...ta, ...tb]).size || 1
  return intersection / union
}

class AppMatcher {
  private registry = getAppRegistry()
  private cache: Map<string, string> = new Map()
  private lastScanAt = 0

  async syncInstalledApps(platform?: PlatformId): Promise<{ success: boolean; message: string; scanned: number }> {
    const resolved = platform || detectPlatform()
    if (resolved !== 'windows' && resolved !== 'macos') {
      return {
        success: true,
        message: `Installed app scan skipped on ${resolved}; fuzzy matching still available from known profiles.`,
        scanned: 0,
      }
    }

    let scanned = 0
    if (typeof window !== 'undefined' && window.nativeBridge?.getInstalledAppsMetadata) {
      const result = await window.nativeBridge.getInstalledAppsMetadata(resolved)
      if (result.success) {
        scanned = appIndexer.ingestInstalledApps(resolved, (result.apps || []) as Array<Record<string, unknown>>)
        for (const app of (result.apps || []) as InstalledAppMetadata[]) {
          this.cache.set(normalize(app.appName), app.appName)
        }
      }
    }

    this.lastScanAt = Date.now()
    return {
      success: true,
      message: `Installed app scan complete on ${resolved}. Learned ${scanned} metadata profile(s).`,
      scanned,
    }
  }

  async match(inputTarget: string, platform?: PlatformId): Promise<AppMatchResult> {
    const target = String(inputTarget || '').trim()
    if (!target) {
      return {
        matched: false,
        target,
        confidence: 0,
        reason: 'empty_target',
        shouldClarify: true,
      }
    }

    if (Date.now() - this.lastScanAt > 5 * 60_000) {
      await this.syncInstalledApps(platform)
    }

    const aliasMap = memoryEngine.getAliasMap()
    const normalizedTarget = normalize(target)
    const memorized = aliasMap[normalizedTarget]
    if (memorized) {
      return {
        matched: true,
        target,
        canonicalName: memorized,
        confidence: 0.96,
        reason: 'memory_alias',
        shouldClarify: false,
      }
    }

    const registryResult = this.registry.findApp(target)
    if (registryResult) {
      await this.learnAlias(target, registryResult.name)
      return {
        matched: true,
        target,
        canonicalName: registryResult.name,
        confidence: 0.93,
        reason: 'registry_match',
        shouldClarify: false,
        learnedAlias: normalizedTarget,
      }
    }

    const known = appIndexer.listKnownApps()
    const candidates = new Set<string>(known)
    this.cache.forEach((name) => candidates.add(name))

    let bestName = ''
    let bestScore = 0

    for (const candidate of candidates) {
      const normalizedCandidate = normalize(candidate)
      if (!normalizedCandidate) continue

      const maxLen = Math.max(normalizedTarget.length, normalizedCandidate.length) || 1
      const levScore = 1 - levenshtein(normalizedTarget, normalizedCandidate) / maxLen
      const semScore = semanticSimilarity(target, candidate)
      const contains =
        normalizedCandidate.includes(normalizedTarget) || normalizedTarget.includes(normalizedCandidate)
          ? 1
          : 0
      const composite = levScore * 0.65 + semScore * 0.25 + contains * 0.1

      if (composite > bestScore) {
        bestScore = composite
        bestName = candidate
      }
    }

    if (bestScore >= EXECUTION_THRESHOLD && bestName) {
      await this.learnAlias(target, bestName)
      return {
        matched: true,
        target,
        canonicalName: bestName,
        confidence: Number(bestScore.toFixed(3)),
        reason: 'fuzzy_match',
        shouldClarify: false,
        learnedAlias: normalizedTarget,
      }
    }

    return {
      matched: false,
      target,
      canonicalName: bestName || undefined,
      confidence: Number(bestScore.toFixed(3)),
      reason: 'low_confidence',
      shouldClarify: true,
    }
  }

  async learnAlias(alias: string, canonicalName: string): Promise<void> {
    const normalizedAlias = normalize(alias)
    if (!normalizedAlias || !canonicalName.trim()) return

    await memoryEngine.rememberAlias(normalizedAlias, canonicalName.trim())
    this.cache.set(normalizedAlias, canonicalName.trim())
  }
}

export const appMatcher = new AppMatcher()
