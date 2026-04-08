import { codeExecutionEngine } from '@/core/code-execution-engine'
import { providerMatrixRouter } from '@/core/provider-matrix-router'

class DevelopmentAutomationEngine {
  async execute(goal: string): Promise<{ success: boolean; output: string; data?: Record<string, unknown> }> {
    const refined = await providerMatrixRouter.query(
      `Refine this software development goal into an implementation-ready brief:\n${goal}`,
      { taskClass: 'code', urgency: 'normal' },
    )

    const build = await codeExecutionEngine.buildProject(refined.content || goal)

    return {
      success: build.success,
      output: build.message,
      data: {
        projectPath: build.projectPath,
        filesWritten: build.filesWritten,
        refinedGoal: refined.content,
      },
    }
  }
}

export const developmentAutomationEngine = new DevelopmentAutomationEngine()
