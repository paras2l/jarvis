import { intelligenceRouter } from './intelligence-router'
import { memoryEngine } from './memory-engine'
import { semanticSearchEngine } from './semantic-search'
import { db } from '../lib/db'

export interface ResearchSource {
  title: string
  url?: string
  excerpt?: string
}

export interface ResearchResult {
  topic: string
  summary: string
  sources: ResearchSource[]
  localKnowledge: boolean
  confidence: number
}

export interface SummarizeResult {
  success: boolean
  summary: string
  highlights: string[]
}

class ResearchEngine {
  async researchTopic(
    topic: string,
    options: { sourceHint?: string; maxSources?: number } = {},
  ): Promise<ResearchResult> {
    const normalizedTopic = topic.trim()
    const maxSources = Math.max(1, Math.min(8, options.maxSources ?? 5))
    const local = await semanticSearchEngine.search(normalizedTopic, maxSources)

    if (local.usedLocal && local.results.length > 0) {
      const summary = await this.summarizeFromEntries(normalizedTopic, local.results.map((result) => ({
        title: result.entry.topic,
        url: undefined,
        excerpt: result.entry.summary || result.entry.content,
      })))

      return {
        topic: normalizedTopic,
        summary,
        sources: local.results.map((result) => ({
          title: result.entry.topic,
          excerpt: result.entry.summary || result.entry.content.slice(0, 400),
        })),
        localKnowledge: true,
        confidence: local.confidence,
      }
    }

    const sources = await this.fetchExternalSources(normalizedTopic, maxSources)
    const summary = await this.synthesizeSummary(normalizedTopic, sources, options.sourceHint)
    await this.storeResearch(normalizedTopic, summary, sources, options.sourceHint)

    return {
      topic: normalizedTopic,
      summary,
      sources,
      localKnowledge: false,
      confidence: Math.min(1, Math.max(0.35, sources.length ? 0.6 + sources.length * 0.05 : 0.35)),
    }
  }

  async summarizeText(text: string, topic = 'document'): Promise<SummarizeResult> {
    const trimmed = text.trim()
    if (!trimmed) {
      return {
        success: false,
        summary: 'No text provided.',
        highlights: [],
      }
    }

    const sentences = trimmed
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)

    const highlights = sentences.slice(0, 4).map((sentence) => sentence.trim()).filter(Boolean)
    const prompt = `Summarize this ${topic} in a crisp, practical way. Focus on decisions, facts, and action items.\n\n${trimmed.slice(0, 8000)}`
    const routed = await intelligenceRouter.query(prompt, {
      urgency: 'background',
      taskType: 'analysis',
      systemPrompt: 'You are JARVIS. Produce a concise, accurate summary with practical highlights.',
    })

    const summary = routed.content?.trim() || highlights.join(' ')
    return {
      success: true,
      summary,
      highlights: highlights.slice(0, 5),
    }
  }

  async openExternal(url: string): Promise<{ success: boolean; message: string }> {
    if (!url) {
      return { success: false, message: 'No URL provided.' }
    }

    try {
      if (typeof window !== 'undefined' && window.nativeBridge?.openExternal) {
        const result = await window.nativeBridge.openExternal(url)
        return {
          success: result.success,
          message: result.message || (result.success ? `Opened ${url}.` : `Unable to open ${url}.`),
        }
      }

      window.open(url, '_blank', 'noopener,noreferrer')
      return { success: true, message: `Opened ${url}.` }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  private async fetchExternalSources(topic: string, maxSources: number): Promise<ResearchSource[]> {
    const results: ResearchSource[] = []

    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(topic)}&format=json&no_redirect=1&no_html=1&t=jarvis`
      const response = await fetch(ddgUrl)
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>
        const relatedTopics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : []

        for (const item of relatedTopics) {
          if (results.length >= maxSources) break
          if (!item || typeof item !== 'object') continue

          const value = item as Record<string, unknown>
          const title = String(value.Text || value.FirstURL || topic).trim()
          const url = String(value.FirstURL || '').trim() || undefined
          const excerpt = String(value.Text || '').trim() || undefined

          if (title) {
            results.push({ title, url, excerpt })
          }
        }
      }
    } catch {
      // Ignore search failures and fall back to local synthesis below.
    }

    if (!results.length) {
      results.push({
        title: topic,
        excerpt: `No live web results were available for ${topic}.`,
      })
    }

    return results.slice(0, maxSources)
  }

  private async synthesizeSummary(topic: string, sources: ResearchSource[], sourceHint?: string): Promise<string> {
    const joinedSources = sources
      .map((source, index) => `Source ${index + 1}: ${source.title}\n${source.excerpt ?? ''}`)
      .join('\n\n')

    const prompt = `Synthesize a research brief for ${topic}. Use the provided sources and keep the answer concrete.\n${sourceHint ? `Source hint: ${sourceHint}\n` : ''}\n${joinedSources}`
    const result = await intelligenceRouter.query(prompt, {
      urgency: 'background',
      taskType: 'analysis',
      systemPrompt: 'You are JARVIS. Synthesize research into a concise brief with practical takeaways.',
    })

    return result.content?.trim() || `Research collected for ${topic}.`
  }

  private async summarizeFromEntries(topic: string, sources: ResearchSource[]): Promise<string> {
    const joinedSources = sources
      .map((source, index) => `Source ${index + 1}: ${source.title}\n${source.excerpt ?? ''}`)
      .join('\n\n')

    const result = await intelligenceRouter.query(
      `Summarize the local knowledge on ${topic}. Keep it short and useful.\n\n${joinedSources}`,
      {
        urgency: 'background',
        taskType: 'analysis',
        systemPrompt: 'You are JARVIS. Summarize the local knowledge clearly and accurately.',
      }
    )

    return result.content?.trim() || `Local knowledge found for ${topic}.`
  }

  private async storeResearch(topic: string, summary: string, sources: ResearchSource[], sourceHint?: string): Promise<void> {
    const content = [summary, ...sources.map((source) => `${source.title}: ${source.excerpt ?? ''}`)].join('\n')
    await semanticSearchEngine.add({
      content,
      summary,
      source: sourceHint || 'web',
      topic,
    })

    await memoryEngine.rememberFact(`research_${topic.toLowerCase().replace(/\W+/g, '_')}`, summary.slice(0, 500), 'goal')
    await db.akasha.archive({
      source_type: sourceHint || 'web',
      original_content: content.slice(0, 8_000),
      compressed_summary: summary.slice(0, 1_000),
    }).catch(() => {})
  }
}

export const researchEngine = new ResearchEngine()
