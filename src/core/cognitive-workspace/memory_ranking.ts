/**
 * Memory Ranking System
 * 
 * Memory recall should rank by:
 * - Relevance (semantic similarity)
 * - Recency (how recent is the memory)
 * - Confidence (how sure are we about it)
 * 
 * Without ranking, memory becomes noisy
 */

import type { MemoryContext } from './workspace_state.ts'

/**
 * Ranked memory item
 */
export interface RankedMemory {
  id: string
  content: string
  timestamp: number
  relevanceScore: number // 0-1
  recencyScore: number // 0-1
  confidenceScore: number // 0-1
  overallScore: number // Weighted combination
  tags?: string[]
  context?: Record<string, any>
}

/**
 * Memory ranking configuration
 */
export interface MemoryRankingConfig {
  // Weighting factors (should sum to ~1.0)
  relevanceWeight: number // Semantic match
  recencyWeight: number // Time-based freshness
  confidenceWeight: number // How sure we are
  
  // Time decay
  dayHalfLife: number // Days until memory "forgets" to 50%
  
  // Filtering
  minRelevanceThreshold: number // 0-1, exclude if below
  minConfidenceThreshold: number // 0-1, exclude if below
  recencyWindow: number // ms, how far back to consider
  
  // Result limiting
  maxResults: number
  minResults: number
}

/**
 * Memory Ranking Engine
 * 
 * Scores and ranks memories for optimal recall
 */
export class MemoryRankingEngine {
  private config: MemoryRankingConfig = {
    relevanceWeight: 0.5,
    recencyWeight: 0.3,
    confidenceWeight: 0.2,
    dayHalfLife: 30, // 30 days until 50% decay
    minRelevanceThreshold: 0.3,
    minConfidenceThreshold: 0.2,
    recencyWindow: 365 * 24 * 60 * 60 * 1000, // 1 year
    maxResults: 10,
    minResults: 3,
  }

  constructor(config?: Partial<MemoryRankingConfig>) {
    this.config = { ...this.config, ...config }
    this.validateWeights()
  }

  /**
   * Rank memories for a query
   * 
   * Returns top-ranked memories sorted by overall score
   */
  public rankMemories(
    memories: RankedMemory[],
    query: string,
    _context?: Record<string, any>,
  ): RankedMemory[] {
    if (memories.length === 0) return []

    const now = Date.now()
    const ranked: RankedMemory[] = []

    for (const memory of memories) {
      // Check recency window
      if (now - memory.timestamp > this.config.recencyWindow) {
        continue
      }

      // Calculate scores
      const relevance = this.calculateRelevanceScore(memory.content, query)
      const recency = this.calculateRecencyScore(memory.timestamp, now)
      const confidence = memory.confidenceScore

      // Apply thresholds
      if (relevance < this.config.minRelevanceThreshold) {
        continue
      }
      if (confidence < this.config.minConfidenceThreshold) {
        continue
      }

      // Calculate overall score
      const overall =
        relevance * this.config.relevanceWeight +
        recency * this.config.recencyWeight +
        confidence * this.config.confidenceWeight

      ranked.push({
        ...memory,
        relevanceScore: relevance,
        recencyScore: recency,
        confidenceScore: confidence,
        overallScore: overall,
      })
    }

    // Sort by overall score
    ranked.sort((a, b) => b.overallScore - a.overallScore)

    // Apply result limits
    const minResults = Math.min(this.config.minResults, ranked.length)
    const maxResults = Math.min(this.config.maxResults, ranked.length)

    return ranked.slice(0, maxResults).length >= minResults
      ? ranked.slice(0, maxResults)
      : ranked.slice(0, minResults)
  }

  /**
   * Calculate relevance score (0-1)
   * 
   * Uses simple keyword matching and semantic similarity
   */
  private calculateRelevanceScore(memoryContent: string, query: string): number {
    const queryTokens = query.toLowerCase().split(/\s+/)
    const contentLower = memoryContent.toLowerCase()

    // Keyword matching
    const matches = queryTokens.filter((token) => contentLower.includes(token))
    const keywordScore = matches.length / queryTokens.length

    // Longer content that matches is slightly penalized (less focused)
    const lengthPenalty = Math.min(memoryContent.length / 1000, 1)
    const relevance = keywordScore * (1 - lengthPenalty * 0.2)

    return Math.min(relevance, 1)
  }

  /**
   * Calculate recency score (0-1)
   * 
   * Uses exponential decay based on half-life
   */
  private calculateRecencyScore(timestamp: number, now: number): number {
    const ageMs = now - timestamp
    const agedays = ageMs / (24 * 60 * 60 * 1000)
    const halfLives = agedays / this.config.dayHalfLife

    // Exponential decay: 0.5^halfLives
    const recency = Math.pow(0.5, halfLives)

    return Math.max(recency, 0.01) // At least 1% to not fully expire
  }

  /**
   * Rank by emotional context
   * 
   * Boost memories from similar emotional states
   */
  public rankByEmotionalContext(
    memories: RankedMemory[],
    currentMood: string,
    _context?: Record<string, any>,
  ): RankedMemory[] {
    const ranked = [...memories]

    ranked.forEach((m) => {
      const moodMatch = m.context?.mood === currentMood ? 1.2 : 0.8
      m.overallScore *= moodMatch
    })

    ranked.sort((a, b) => b.overallScore - a.overallScore)
    return ranked.slice(0, this.config.maxResults)
  }

  /**
   * Boost related memories
   * 
   * If a memory is highly relevant, boost similar memories
   */
  public boostRelatedMemories(
    memories: RankedMemory[],
    primaryMemory: RankedMemory,
    boostFactor: number = 1.1,
  ): RankedMemory[] {
    const ranked = [...memories]

    const primaryTags = primaryMemory.tags || []
    ranked.forEach((m) => {
      if (m.id === primaryMemory.id) return

      const sharedTags = (m.tags || []).filter((tag) => primaryTags.includes(tag))
      if (sharedTags.length > 0) {
        m.overallScore *= boostFactor
      }
    })

    ranked.sort((a, b) => b.overallScore - a.overallScore)
    return ranked.slice(0, this.config.maxResults)
  }

  /**
   * Decay memory confidence over time
   * 
   * Old memories should have lower confidence (might be outdated)
   */
  public applyConfidenceDecay(timestamp: number, now: number = Date.now()): number {
    const ageMs = now - timestamp
    const agedays = ageMs / (24 * 60 * 60 * 1000)

    // Linear decay: lose 1% confidence per day
    const decayFactor = Math.max(1 - agedays * 0.01, 0.1)

    return decayFactor
  }

  /**
   * Get memory score breakdown
   * 
   * For debugging and understanding why a memory was ranked
   */
  public getScoreBreakdown(memory: RankedMemory): {
    relevance: { score: number; contribution: number }
    recency: { score: number; contribution: number }
    confidence: { score: number; contribution: number }
    overall: number
  } {
    return {
      relevance: {
        score: memory.relevanceScore,
        contribution: memory.relevanceScore * this.config.relevanceWeight,
      },
      recency: {
        score: memory.recencyScore,
        contribution: memory.recencyScore * this.config.recencyWeight,
      },
      confidence: {
        score: memory.confidenceScore,
        contribution: memory.confidenceScore * this.config.confidenceWeight,
      },
      overall: memory.overallScore,
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<MemoryRankingConfig>): void {
    this.config = { ...this.config, ...updates }
    this.validateWeights()
  }

  /**
   * Get configuration
   */
  public getConfig(): MemoryRankingConfig {
    return { ...this.config }
  }

  /**
   * Validate weight configuration
   */
  private validateWeights(): void {
    const total =
      this.config.relevanceWeight + this.config.recencyWeight + this.config.confidenceWeight

    if (Math.abs(total - 1.0) > 0.01) {
      console.warn(
        `[MemoryRanking] Weights sum to ${total}, not 1.0. Results may be skewed.`,
      )
    }
  }
}

/**
 * Convert MemoryContext to RankedMemory array
 */
export function contextToMemories(context: MemoryContext, now: number = Date.now()): RankedMemory[] {
  const memories: RankedMemory[] = []

  // Convert recent memories
  context.recentMemories?.forEach((id) => {
    memories.push({
      id,
      content: id,
      timestamp: now,
      relevanceScore: 0.8,
      recencyScore: 1.0,
      confidenceScore: 0.9,
      overallScore: 0, // Will be calculated
    })
  })

  // Convert semantic context
  if (context.semanticContext) {
    Object.entries(context.semanticContext).forEach(([key, value]) => {
      memories.push({
        id: key,
        content: JSON.stringify(value),
        timestamp: now,
        relevanceScore: 0.7,
        recencyScore: 0.9,
        confidenceScore: 0.8,
        overallScore: 0,
        context: value,
      })
    })
  }

  // Convert historical patterns
  context.historicalPatterns?.forEach((pattern) => {
    memories.push({
      id: pattern.patternId,
      content: pattern.patternId,
      timestamp: pattern.lastOccurred,
      relevanceScore: 0.6,
      recencyScore: 0.7,
      confidenceScore: 0.75,
      overallScore: 0,
      context: { frequency: pattern.frequency },
    })
  })

  return memories
}

/**
 * Singleton ranking engine instance
 */
let globalRankingEngine: MemoryRankingEngine | null = null

export function getMemoryRankingEngine(
  config?: Partial<MemoryRankingConfig>,
): MemoryRankingEngine {
  if (!globalRankingEngine) {
    globalRankingEngine = new MemoryRankingEngine(config)
  }
  return globalRankingEngine
}

export function resetMemoryRankingEngine(
  config?: Partial<MemoryRankingConfig>,
): MemoryRankingEngine {
  globalRankingEngine = new MemoryRankingEngine(config)
  return globalRankingEngine
}

export default MemoryRankingEngine
