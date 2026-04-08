import { executionMemory } from '@/core/learning/execution-memory'
import { ReflectionSummary, runtimeEventBus } from '@/core/event-bus'

class ReflectionEngine {
  async reflectTask(taskId: string, result: { success: boolean; output?: string; error?: string }): Promise<ReflectionSummary> {
    const notes = result.success
      ? 'Execution completed successfully. Preserve sequence for reuse.'
      : `Execution failed. Cause: ${result.error || 'unknown'}`

    const optimization = result.success
      ? 'Consider transforming this into a reusable macro skill.'
      : 'Retry with additional context or capability reroute.'

    const reflection: ReflectionSummary = {
      taskId,
      success: result.success,
      notes,
      optimization,
      timestamp: Date.now(),
    }

    executionMemory.recordReflection(reflection)
    await runtimeEventBus.emit('reflection.ready', { reflection })
    return reflection
  }
}

export const reflectionEngine = new ReflectionEngine()
