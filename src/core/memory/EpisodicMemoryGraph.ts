/**
 * EPISODIC MEMORY GRAPH (The Wisdom Layer)
 * ==========================================
 * Feature X-1: Multi-Year Context & Insight Linking.
 * 
 * Unlike standard RAG, this system maintains a graph of "Wisdom Nodes"
 * linked by temporal and semantic relationships.
 */

import { memoryTierService } from './memory-tier-service'

export interface EpisodeNode {
  id: string
  content: string
  category: 'milestone' | 'preference' | 'insight' | 'project'
  importance: number // 1-10
  timestamp: number
  tags: string[]
  links: string[] // IDs of related episodes
}

export class EpisodicMemoryGraph {
  private nodes: Map<string, EpisodeNode> = new Map()
  private graphVersion: string = 'v4.0'

  /**
   * Promotes a raw memory to a Wisdom Node
   */
  async promoteToEpisode(content: string, category: EpisodeNode['category'], tags: string[] = []): Promise<string> {
    const id = `epi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    
    // Semantic scan for links
    const links = await this.findCrossTemporalLinks(content)

    const node: EpisodeNode = {
      id,
      content,
      category,
      importance: this.calculateImportance(content, category),
      timestamp: Date.now(),
      tags,
      links
    }

    this.nodes.set(id, node)
    
    // Persist to long-term tier
    await memoryTierService.remember(id, JSON.stringify(node), 'wisdom')
    
    console.log(`[WISDOM] New episode anchored: ${id} (${category}) with ${links.length} links.`)
    return id
  }

  /**
   * Finds related episodes across the multi-year spectrum
   */
  async findCrossTemporalLinks(content: string): Promise<string[]> {
    const lower = content.toLowerCase()
    const related: string[] = []

    for (const [id, node] of this.nodes) {
      // Simple semantic/keyword overlap for now
      const match = node.tags.some(t => lower.includes(t.toLowerCase())) || 
                    node.content.toLowerCase().split(' ').some(w => w.length > 4 && lower.includes(w))
      
      if (match) {
        related.push(id)
      }
    }

    return related
  }

  /**
   * Recalls insights based on current context
   */
  async getContextualWisdom(query: string): Promise<EpisodeNode[]> {
    const links = await this.findCrossTemporalLinks(query)
    return links.map(id => this.nodes.get(id)!).filter(Boolean).sort((a, b) => b.importance - a.importance)
  }

  private calculateImportance(content: string, category: EpisodeNode['category']): number {
    let score = 5
    if (category === 'milestone') score += 3
    if (category === 'insight') score += 2
    if (content.length > 200) score += 1
    return Math.min(10, score)
  }

  /**
   * Auto-consolidation: Link new memories to existing graph clusters
   */
  async consolidate() {
    console.log('[WISDOM] Consolidating episodic graph segments...')
    // Logic for garbage collection of low-importance nodes or 
    // structural reinforcement of high-frequency clusters
  }
}

export const episodicMemoryGraph = new EpisodicMemoryGraph()
