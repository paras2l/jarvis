import { skillEngine } from '@/core/skill-engine'
import { toolBuilderEngine } from '@/core/tool-builder-engine'
import { JarvisPlanStep } from './types'

class SkillExecutionEngine {
  async executeStep(step: JarvisPlanStep, goal: string): Promise<{ success: boolean; output: string; data?: Record<string, unknown> }> {
    const query = `${step.title}: ${goal}`
    const payload = {
      query,
      goal,
      step: step.title,
      description: step.description,
    }

    const matched = await skillEngine.executeBestMatch(
      `${step.title} ${step.description} ${step.skillHints.join(' ')}`,
      payload,
      {
        command: query,
        source: 'jarvis3.skill-execution',
      },
    )

    if (matched?.success) {
      return {
        success: true,
        output: matched.message,
        data: matched.data,
      }
    }

    const generated = await toolBuilderEngine.buildAndExecute(query, {
      command: query,
      source: 'jarvis3.tool-builder',
    })

    if (generated.success) {
      return {
        success: true,
        output: generated.message,
        data: generated.data,
      }
    }

    return {
      success: false,
      output: generated.message || 'No executable skill was available for this step.',
    }
  }
}

export const skillExecutionEngine = new SkillExecutionEngine()
