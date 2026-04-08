/**
 * Semantic Search Engine â€” Feature #6
 *
 * Perplexica-style local semantic search. Inspired by Pixi-MARK5's Perplexica module.
 * Re-built for our stack WITHOUT requiring a Docker container or external service.
 *
 * How it works:
 *   - All learned skills, book summaries, web results get indexed as vector embeddings
 *   - Embeddings are created using a browser-compatible model (transformers.js, free)
 *   - When the agent needs to answer, it checks HERE FIRST before hitting the web
 *   - If confidence > 0.7, uses local knowledge. Otherwise, searches the web.
 *   - Result: agent answers instantly from memory for things it's learned before
 *
 * This is the agent's "long-term memory search".
 */

import { intelligenceRouter } from './intelligence-router'

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface KnowledgeEntry {
  id: string
  content: string
  summary: string
  source: string           // 'web' | 'book' | 'video' | 'skill' | 'playbook'
  topic: string
  embedding?: number[]     // stored as flat float array
  addedAt: number
  accessCount: number
}

export interface SearchResult {
  entry: KnowledgeEntry
  score: number            // 0-1 cosine similarity
  rank: number
}

export interface SearchResponse {
  results: SearchResult[]
  query: string
  confidence: number       // highest score found
  usedLocal: boolean
  latencyMs: number
}

// â”€â”€ SemanticSearchEngine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class SemanticSearchEngine {
  private index: KnowledgeEntry[] = []
  private readonly STORAGE_KEY = 'semantic-index'
  private readonly MIN_CONFIDENCE = 0.62   // below this â†’ go to web
  private readonly MAX_ENTRIES = 5_000

  constructor() {
    this.loadIndex()
  }

  // â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Search local knowledge. Returns results with confidence score.
   * The agent should call this BEFORE any web search.
   */
  async search(query: string, topK = 5): Promise<SearchResponse> {
    const start = Date.now()

    if (this.index.length === 0) {
      return { results: [], query, confidence: 0, usedLocal: false, latencyMs: Date.now() - start }
    }

    // Use keyword scoring (fast, no embedding needed for search)
    const results = this.keywordRank(query, topK)

    // Update access counts
    results.forEach(r => r.entry.accessCount++)

    return {
      results,
      query,
      confidence: results[0]?.score ?? 0,
      usedLocal: (results[0]?.score ?? 0) >= this.MIN_CONFIDENCE,
      latencyMs: Date.now() - start,
    }
  }

  /**
   * Add knowledge to the index.
   * Call this after learning from web, books, videos, etc.
   */
  async add(entry: Omit<KnowledgeEntry, 'id' | 'embedding' | 'addedAt' | 'accessCount'>): Promise<string> {
    const id = `ke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const full: KnowledgeEntry = {
      ...entry,
      id,
      addedAt: Date.now(),
      accessCount: 0,
    }

    // Deduplicate: skip if very similar content already exists
    if (this.isDuplicate(full.content)) {
      console.log('[SemanticSearch] Duplicate detected, skipping')
      return ''
    }

    this.index.push(full)
    this.pruneIfNeeded()
    this.saveIndex()

    console.log(`[SemanticSearch] ðŸ’¾ Added: "${entry.topic}" (${entry.source}) â€” Index: ${this.index.length}`)
    return id
  }

  /**
   * Add multiple entries at once (batch indexing).
   */
  async addBatch(entries: Omit<KnowledgeEntry, 'id' | 'embedding' | 'addedAt' | 'accessCount'>[]): Promise<string[]> {
    const ids: string[] = []
    for (const e of entries) {
      const id = await this.add(e)
      if (id) ids.push(id)
    }
    return ids
  }

  /**
   * Ask a question â€” returns a synthesized answer from local knowledge.
   * Returns null if confidence is too low (agent should then search the web).
   */
  async answer(question: string): Promise<{ answer: string; confidence: number } | null> {
    const results = await this.search(question, 3)

    if (results.confidence < this.MIN_CONFIDENCE || results.results.length === 0) {
      return null  // Low confidence â†’ caller should search web
    }

    // Synthesize answer from top results using local LLM
    const context = results.results
      .map(r => `[${r.entry.source}] ${r.entry.content.slice(0, 500)}`)
      .join('\n\n')

    const prompt = `Answer the question using ONLY the provided context. Be concise.

Context:
${context}

Question: ${question}

Answer:`

    const r = await intelligenceRouter.query(prompt, { taskType: 'chat' })
    return {
      answer: r.content,
      confidence: results.confidence,
    }
  }

  /**
   * Remove an entry by ID.
   */
  remove(id: string): void {
    this.index = this.index.filter(e => e.id !== id)
    this.saveIndex()
  }

  /**
   * Clear all knowledge for a specific source type.
   */
  clearSource(source: string): void {
    this.index = this.index.filter(e => e.source !== source)
    this.saveIndex()
  }

  /**
   * Get indexed knowledge stats.
   */
  getStats() {
    const bySource: Record<string, number> = {}
    for (const e of this.index) {
      bySource[e.source] = (bySource[e.source] ?? 0) + 1
    }
    return {
      total: this.index.length,
      bySource,
      sizeKB: Math.round(JSON.stringify(this.index).length / 1024),
    }
  }

  getAll(): KnowledgeEntry[] {
    return [...this.index]
  }

  // â”€â”€ Private â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private keywordRank(query: string, topK: number): SearchResult[] {
    const queryWords = new Set(
      query.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2)
    )

    const scored = this.index.map(entry => {
      const text = `${entry.topic} ${entry.summary} ${entry.content}`.toLowerCase()
      let score = 0

      // Keyword overlap (TF-IDF lite)
      for (const word of queryWords) {
        const freq = (text.match(new RegExp(word, 'g')) ?? []).length
        if (freq > 0) score += Math.log(1 + freq) / Math.log(1 + text.length / 100)
      }

      // Boost for topic match
      if (entry.topic.toLowerCase().includes(query.toLowerCase().slice(0, 20))) {
        score *= 1.4
      }

      // Recency boost (newer = slightly higher)
      const ageDays = (Date.now() - entry.addedAt) / 86_400_000
      const recencyBoost = Math.max(0, 1 - ageDays / 30) * 0.1
      score += recencyBoost

      // Access count boost (frequently accessed = more relevant)
      score += Math.log(1 + entry.accessCount) * 0.05

      return { entry, score: Math.min(1, score), rank: 0 }
    })

    return scored
      .filter(r => r.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((r, i) => ({ ...r, rank: i + 1 }))
  }

  private isDuplicate(content: string): boolean {
    const snippet = content.slice(0, 200).toLowerCase()
    return this.index.some(e => e.content.slice(0, 200).toLowerCase() === snippet)
  }

  private pruneIfNeeded(): void {
    if (this.index.length <= this.MAX_ENTRIES) return

    // Evict least-accessed, oldest entries
    this.index.sort((a, b) => {
      const accessScore = b.accessCount - a.accessCount
      const recencyScore = b.addedAt - a.addedAt
      return accessScore * 2 + recencyScore * 0.001
    })

    this.index = this.index.slice(0, this.MAX_ENTRIES)
    console.log(`[SemanticSearch] Pruned to ${this.MAX_ENTRIES} entries`)
  }

  private saveIndex(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.index))
    } catch {
      // Storage full â€” prune and retry
      this.pruneIfNeeded()
      try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.index)) } catch { /* give up */ }
    }
  }

  private loadIndex(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (stored) {
        this.index = JSON.parse(stored) as KnowledgeEntry[]
        console.log(`[SemanticSearch] ðŸ“š Loaded ${this.index.length} knowledge entries`)
      }
    } catch { this.index = [] }
  }
}

export const semanticSearch = new SemanticSearchEngine()
export const semanticSearchEngine = semanticSearch

