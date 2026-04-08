import { memoryEngine } from '@/core/memory-engine'
import { researchEngine } from '@/core/research-engine'
import { semanticSearchEngine } from '@/core/semantic-search'

export interface KnowledgeBrief {
  topic: string
  summary: string
  sources: Array<{ title: string; url?: string; excerpt?: string }>
  confidence: number
}

class ResearchKnowledgeEngine {
  async gather(topic: string): Promise<KnowledgeBrief> {
    const result = await researchEngine.researchTopic(topic, {
      sourceHint: 'jarvis3-research',
      maxSources: 6,
    })

    await memoryEngine.rememberFact(
      `jarvis3_research_${topic.toLowerCase().replace(/\W+/g, '_')}`,
      result.summary.slice(0, 600),
      'fact',
    )

    return {
      topic: result.topic,
      summary: result.summary,
      sources: result.sources,
      confidence: result.confidence,
    }
  }

  async ingestDocument(topic: string, content: string): Promise<KnowledgeBrief> {
    const summarized = await researchEngine.summarizeText(content, topic)
    await semanticSearchEngine.add({
      content: content.slice(0, 10_000),
      summary: summarized.summary,
      source: 'document',
      topic,
    })

    await memoryEngine.rememberFact(
      `jarvis3_document_${topic.toLowerCase().replace(/\W+/g, '_')}`,
      summarized.summary.slice(0, 600),
      'fact',
    )

    return {
      topic,
      summary: summarized.summary,
      sources: [{ title: topic, excerpt: summarized.highlights.join(' | ') }],
      confidence: summarized.success ? 0.75 : 0.4,
    }
  }
}

export const researchKnowledgeEngine = new ResearchKnowledgeEngine()
