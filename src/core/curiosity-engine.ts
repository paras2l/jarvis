import { intelligenceRouter } from '@/core/intelligence-router'

export interface CuriosityLearningArtifact {
  id: string
  topic: string
  source: string
  summary: string
  extractedWorkflow: string[]
  createdAt: number
}

const CURIOSITY_STORAGE_KEY = 'Pixi.curiosity.artifacts'

class CuriosityEngine {
  private enabled = true

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  async runLearningCycle(topic: string, sourceHint: string): Promise<CuriosityLearningArtifact | null> {
    if (!this.enabled) return null

    const prompt = [
      `Research topic: ${topic}`,
      `Source context: ${sourceHint}`,
      'Return a compact learning brief with:',
      '1) core idea',
      '2) a reusable workflow in 3-5 steps',
      '3) one caution',
    ].join('\n')

    const response = await intelligenceRouter.query(prompt, {
      urgency: 'background',
      taskType: 'analysis',
    })

    const summary = response.content || 'No summary generated'
    const extractedWorkflow = this.extractWorkflow(summary)

    const artifact: CuriosityLearningArtifact = {
      id: `curiosity_${Date.now()}`,
      topic,
      source: sourceHint,
      summary,
      extractedWorkflow,
      createdAt: Date.now(),
    }

    this.persistArtifact(artifact)
    return artifact
  }

  listArtifacts(limit = 20): CuriosityLearningArtifact[] {
    return this.loadArtifacts().slice(-Math.max(1, limit)).reverse()
  }

  private extractWorkflow(summary: string): string[] {
    const lines = summary
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^[-*\d]/.test(line))
      .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
      .filter(Boolean)

    if (lines.length) return lines.slice(0, 6)
    return ['Capture objective', 'Gather references', 'Execute', 'Review result']
  }

  private persistArtifact(artifact: CuriosityLearningArtifact): void {
    const current = this.loadArtifacts()
    current.push(artifact)
    localStorage.setItem(CURIOSITY_STORAGE_KEY, JSON.stringify(current.slice(-200)))
  }

  private loadArtifacts(): CuriosityLearningArtifact[] {
    try {
      const raw = localStorage.getItem(CURIOSITY_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as CuriosityLearningArtifact[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
}

export const curiosityEngine = new CuriosityEngine()

