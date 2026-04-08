import { contextAwarenessEngine } from '@/core/context-awareness-engine'
import { predictionEngine } from '@/core/prediction-engine'
import { curiosityEngine } from '@/core/curiosity-engine'
import { reflectionEngine } from '@/core/reflection-engine'
import { runtimeEventBus } from '@/core/event-bus'
import taskExecutor from '@/core/task-executor'
import { runtimePolicyStore } from '@/core/runtime-policy'
import { multimodalVision } from '@/vision/multimodal-vision'
import { Task, ExecutionContext } from '@/types'
import { jarvisOS } from '@/core/jarvis3'

const DEFAULT_LOOP_MS = 12_000

class CognitiveLoopEngine {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private loopId = `cognitive_loop_${Date.now()}`
  private visionTickModulo = 0

  start(intervalMs = DEFAULT_LOOP_MS): void {
    if (this.running) return
    this.running = true

    const policy = runtimePolicyStore.get()
    const effectiveInterval = intervalMs === DEFAULT_LOOP_MS ? policy.loopIntervalMs : intervalMs

    this.timer = setInterval(() => {
      void this.tick()
    }, Math.max(4_000, effectiveInterval))

    void this.tick()
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  isRunning(): boolean {
    return this.running
  }

  private async tick(): Promise<void> {
    const policy = runtimePolicyStore.get()
    await runtimeEventBus.emit('loop.tick', { loopId: this.loopId, timestamp: Date.now() })

    // 1) Perception + context understanding
    const context = await contextAwarenessEngine.collectSnapshot()

    // Light cadence multimodal screen awareness (every 3 ticks when not busy).
    this.visionTickModulo = (this.visionTickModulo + 1) % 3
    if (this.visionTickModulo === 0 && !context.systemBusy) {
      const vision = await multimodalVision.analyzeCurrentScreen('Summarize screen state for autonomous planning.')
      await runtimeEventBus.emit('vision.snapshot', {
        text: vision.summary,
        confidence: vision.confidence,
        timestamp: Date.now(),
      })
    }

    // 2) Reasoning + prediction
    const predictions = await predictionEngine.infer(context)
    const cycle = await jarvisOS.runCognitiveCycle(context, {
      allowAutonomousExecution: policy.autonomyMode === 'autonomous',
      maxAutoGoals: 1,
    })
    const initiatives = cycle.initiatives

    for (const suggestion of initiatives.slice(0, 2)) {
      await runtimeEventBus.emit('prediction.generated', {
        prediction: {
          id: `initiative_${Date.now()}`,
          reason: suggestion,
          confidence: 0.72,
          suggestedAction: cycle.inferredGoals[0]
            ? `proactive_reminder: ${cycle.inferredGoals[0]}`
            : 'proactive_reminder: review suggested initiative',
        },
      })
    }

    // 3) Planning + delegation (safe auto-action rules)
    for (const prediction of predictions) {
      if (!policy.allowPredictionActions || policy.autonomyMode === 'observe') continue
      if (prediction.confidence < 0.75) continue
      const shouldRun = prediction.suggestedAction.startsWith('proactive_reminder:')
      if (!shouldRun) continue

      const command = prediction.suggestedAction.replace('proactive_reminder:', '').trim()
      const task: Task = {
        id: `loop_task_${Date.now()}`,
        command: JSON.stringify({ action: 'chat', message: command }),
        type: 'custom',
        status: 'pending',
        createdAt: new Date(),
      }

      const contextForExecution: ExecutionContext = {
        userId: 'runtime',
        agentId: 'main-agent',
        taskId: task.id,
        device: 'desktop',
        platform: 'windows',
      }

      try {
        const result = await taskExecutor.executeTask(task, contextForExecution)
        await reflectionEngine.reflectTask(task.id, {
          success: true,
          output: JSON.stringify(result),
        })
        await runtimeEventBus.emit('task.executed', { id: task.id, success: true, result })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await reflectionEngine.reflectTask(task.id, { success: false, error: errorMessage })
        await runtimeEventBus.emit('task.executed', {
          id: task.id,
          success: false,
          error: errorMessage,
        })
      }
    }

    // 4) Autonomous curiosity in low-disruption windows
    if (policy.allowCuriosityLearning && !context.systemBusy && context.timeOfDay !== 'night') {
      await curiosityEngine.runLearningCycle('latest AI automation workflow patterns', 'developer docs and changelogs')
    }
  }
}

export const cognitiveLoopEngine = new CognitiveLoopEngine()
