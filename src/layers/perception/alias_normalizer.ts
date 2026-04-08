import { memoryManager } from '@/layers/memory/memory_manager'

interface AliasMatch {
  original: string
  canonical: string
  confidence: number
}

export class AliasNormalizer {
  private staticAliases = new Map<string, string>([
    ['vs code', 'Visual Studio Code'],
    ['vscode', 'Visual Studio Code'],
    ['code', 'Visual Studio Code'],
    ['chrome', 'Google Chrome'],
    ['edge', 'Microsoft Edge'],
    ['terminal', 'Windows PowerShell'],
    ['cmd', 'Command Prompt'],
    ['canva', 'Canva'],
  ])

  normalizeText(text: string): { normalizedText: string; matches: AliasMatch[] } {
    let normalized = text
    const matches: AliasMatch[] = []

    for (const [alias, canonical] of this.staticAliases.entries()) {
      const pattern = new RegExp(`\\b${this.escapeRegex(alias)}\\b`, 'gi')
      if (pattern.test(normalized)) {
        normalized = normalized.replace(pattern, canonical)
        matches.push({ original: alias, canonical, confidence: 0.9 })
      }
    }

    return { normalizedText: normalized, matches }
  }

  resolveEntity(entity: string): AliasMatch {
    const fromSemantic = memoryManager.resolveAlias(entity)
    if (fromSemantic !== entity) {
      return { original: entity, canonical: fromSemantic, confidence: 0.92 }
    }

    const direct = this.staticAliases.get(entity.trim().toLowerCase())
    if (direct) {
      return { original: entity, canonical: direct, confidence: 0.9 }
    }

    const fuzzy = this.fuzzyLookup(entity)
    if (fuzzy) {
      return fuzzy
    }

    return { original: entity, canonical: entity, confidence: 0.55 }
  }

  learnAlias(alias: string, canonical: string, confidence = 0.8): void {
    this.staticAliases.set(alias.trim().toLowerCase(), canonical)
    memoryManager.addAlias(alias, canonical, 'term', confidence)
  }

  private fuzzyLookup(input: string): AliasMatch | undefined {
    const clean = input.trim().toLowerCase()
    if (!clean) {
      return undefined
    }

    let best: { alias: string; canonical: string; score: number } | undefined

    for (const [alias, canonical] of this.staticAliases.entries()) {
      const score = this.similarity(clean, alias)
      if (!best || score > best.score) {
        best = { alias, canonical, score }
      }
    }

    if (!best || best.score < 0.72) {
      return undefined
    }

    return {
      original: input,
      canonical: best.canonical,
      confidence: Math.min(0.88, best.score),
    }
  }

  private similarity(a: string, b: string): number {
    if (a === b) {
      return 1
    }
    const maxLen = Math.max(a.length, b.length)
    if (maxLen === 0) {
      return 1
    }

    const distance = this.levenshtein(a, b)
    return 1 - distance / maxLen
  }

  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = []

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          )
        }
      }
    }

    return matrix[b.length][a.length]
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}

export const aliasNormalizer = new AliasNormalizer()
