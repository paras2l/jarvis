import { intelligenceRouter } from '../intelligence-router'
import { memoryEngine } from '../memory-engine'
import { db } from '../../lib/db'

interface CuriosityResult {
  topic: string
  insight: string
  shouldAnnounce: boolean
}

/**
 * Curiosity Engine (Phase 9)
 * Handles autonomous research cadence and persistence.
 */
class CuriosityEngine {
  async runDailyPulse(): Promise<CuriosityResult | null> {
    const topic = memoryEngine.getTopInterest()
    if (!topic) return null

    const alreadyRan = await db.curiosity.hasRunToday(topic)
    if (alreadyRan) return null

    const thought = await intelligenceRouter.query(
      `I am proactively researching this user interest: "${topic}". Give one concise, witty humanoid insight I can share naturally in conversation. Keep it under 35 words.`,
      { urgency: 'background', taskType: 'analysis' },
    )

    const insight = thought.content?.trim()
    if (!insight) return null

    await db.curiosity.logRun(topic, insight)

    return {
      topic,
      insight,
      shouldAnnounce: Math.random() > 0.45,
    }
  }
}

export const curiosityEngine = new CuriosityEngine()
