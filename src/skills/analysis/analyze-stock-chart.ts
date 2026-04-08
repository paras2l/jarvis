import { researchEngine } from '@/core/research-engine'
import { SkillDefinition } from '@/core/skills/types'

export const analyzeStockChartSkill: SkillDefinition = {
  id: 'builtin.analyze-stock-chart',
  name: 'Analyze Stock Chart',
  description: 'Summarizes market context for a ticker or chart URL and highlights notable signals.',
  category: 'analysis',
  tags: ['stock', 'chart', 'finance', 'analysis'],
  aliases: ['analyze chart', 'stock analysis', 'market chart'],
  version: '1.0.0',
  origin: 'builtin',
  enabled: true,
  permissions: ['web_research'],
  handler: async (input, _context, api) => {
    const payload = typeof input === 'string' ? { query: input } : (input as Record<string, unknown>)
    const query = String(payload?.ticker || payload?.symbol || payload?.query || payload?.url || '').trim()

    if (!query) {
      return {
        success: false,
        message: 'No ticker or chart reference was provided.',
      }
    }

    const research = await researchEngine.researchTopic(`stock chart analysis ${query}`, {
      sourceHint: 'market-research',
      maxSources: 4,
    })

    const local = await api.search.search(query, 3)
    const summary = research.summary || `Market context gathered for ${query}.`
    const highlights = [
      `Local confidence: ${Math.round(local.confidence * 100)}%`,
      ...research.sources.slice(0, 3).map((source: { title: string }) => source.title),
    ]

    return {
      success: true,
      message: summary,
      data: {
        query,
        highlights,
        sources: research.sources,
      },
    }
  },
}
