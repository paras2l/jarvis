import { providerMatrixRouter } from '@/core/provider-matrix-router'
import { vfxEngine } from '@/core/vfx-engine'
import { researchKnowledgeEngine } from './research-knowledge-engine'

class CreativeProductionEngine {
  async createFromGoal(goal: string): Promise<{ success: boolean; output: string; data?: Record<string, unknown> }> {
    const research = await researchKnowledgeEngine.gather(goal)

    const script = await providerMatrixRouter.query(
      `Create a production-ready script for this creative goal:\n${goal}\n\nResearch context:\n${research.summary}`,
      { taskClass: 'chat', urgency: 'normal' },
    )

    const visuals = await providerMatrixRouter.query(
      `Generate visual storyboard prompts for this script:\n${script.content}`,
      { taskClass: 'chat', urgency: 'normal' },
    )

    const render = await vfxEngine.executeMediaTask(`Create a short draft video storyboard for: ${goal}`)

    return {
      success: render.status === 'completed',
      output: render.status === 'completed'
        ? `Creative production completed. Output: ${render.outputFile}`
        : `Creative production draft prepared. Render status: ${render.status}`,
      data: {
        script: script.content,
        storyboard: visuals.content,
        renderOutput: render.outputFile,
        researchSummary: research.summary,
      },
    }
  }
}

export const creativeProductionEngine = new CreativeProductionEngine()
