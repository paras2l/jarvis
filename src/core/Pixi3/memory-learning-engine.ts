import { memoryEngine } from '@/core/memory-engine'
import { executionMemory } from '@/core/learning/execution-memory'
import { PixiExecutionReport } from './types'

class MemoryLearningEngine {
  async recordReport(report: PixiExecutionReport): Promise<void> {
    const summary = report.summary.slice(0, 900)
    await memoryEngine.rememberFact(
      `Pixi3_goal_${report.plan.id}`,
      `${report.plan.goal} | ${summary}`,
      'goal',
    )

    for (const step of report.results) {
      executionMemory.recordReflection({
        taskId: `${report.plan.id}:${step.stepId}`,
        success: step.status === 'completed',
        notes: step.output.slice(0, 300),
        optimization: step.status === 'completed'
          ? 'Reuse this approach in future plans.'
          : `Investigate failure path: ${step.error || 'unknown error'}`,
        timestamp: step.finishedAt,
      })
    }
  }
}

export const memoryLearningEngine = new MemoryLearningEngine()

