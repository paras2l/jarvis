import { researchEngine } from '@/core/research-engine'
import { SkillDefinition } from '@/core/skills/types'

export const summarizeDocumentSkill: SkillDefinition = {
  id: 'builtin.summarize-document',
  name: 'Summarize Document',
  description: 'Condenses a document, article, or pasted text into a concise brief.',
  category: 'research',
  tags: ['summarize', 'document', 'brief', 'research'],
  aliases: ['summarize text', 'brief document', 'digest document'],
  version: '1.0.0',
  origin: 'builtin',
  enabled: true,
  permissions: ['memory_write', 'semantic_search'],
  handler: async (input, _context, api) => {
    const payload = typeof input === 'string' ? { text: input } : (input as Record<string, unknown>)
    const text = String(payload?.text || payload?.document || payload?.content || '').trim()
    const topic = String(payload?.topic || payload?.title || 'document').trim()

    if (!text) {
      return {
        success: false,
        message: 'No document text was provided.',
      }
    }

    const result = await researchEngine.summarizeText(text, topic)
    await api.search.add({
      content: text.slice(0, 8_000),
      summary: result.summary,
      source: 'skill',
      topic,
    })

    return {
      success: true,
      message: result.summary,
      data: {
        highlights: result.highlights,
      },
    }
  },
}
