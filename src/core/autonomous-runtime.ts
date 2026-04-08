import { cognitiveLoopEngine } from '@/core/cognitive-loop-engine'
import { runtimeEventBus } from '@/core/event-bus'
import { taskScheduler } from '@/core/task-scheduler'
import { getDeviceMesh } from '@/core/device-mesh'
import { getDeviceBridge } from '@/core/device-bridge'
import taskExecutor from '@/core/task-executor'
import agentEngine from '@/core/agent-engine'
import { reflectionEngine } from '@/core/reflection-engine'
import { runtimePolicyStore } from '@/core/runtime-policy'
import { providerMatrixRouter } from '@/core/provider-matrix-router'
import { agentFrameworkAdapters } from '@/core/agent-framework-adapters'
import { voiceSession } from '@/voice/voice-session'
import { hybridBackendCoordinator } from '@/core/hybrid-backend'
import { jarvisOS } from '@/core/jarvis3'

class AutonomousRuntime {
  private started = false
  private mesh = getDeviceMesh()
  private bridge = getDeviceBridge()
  private unsubs: Array<() => void> = []

  async start(): Promise<void> {
    if (this.started) return

    this.mesh.registerDevice(this.mesh.getLocalDevice())
    this.mesh.startHeartbeat()
    await hybridBackendCoordinator.start()
    this.bridge.registerTaskExecutor(async (task) => {
      return taskExecutor.executeTask(task, {
        userId: 'mesh-runtime',
        agentId: 'main-agent',
        taskId: task.id,
        device: this.mesh.getLocalDevice().type === 'mobile' ? 'mobile' : 'desktop',
        platform: this.mesh.getLocalDevice().platform,
      })
    })

    taskScheduler.setupMorningBriefing()
    const initialPolicy = runtimePolicyStore.get()
    agentFrameworkAdapters.updateConfig({ selected: initialPolicy.orchestrationFramework })
    this.attachEventHandlers()
    cognitiveLoopEngine.start(initialPolicy.loopIntervalMs)
    voiceSession.start()

    this.started = true
    await runtimeEventBus.emit('runtime.started', { timestamp: Date.now() })
  }

  async stop(): Promise<void> {
    if (!this.started) return
    cognitiveLoopEngine.stop()
    this.mesh.stopHeartbeat()
    await hybridBackendCoordinator.stop()
    voiceSession.stop()
    this.unsubs.forEach((unsub) => unsub())
    this.unsubs = []
    this.started = false
    await runtimeEventBus.emit('runtime.stopped', { timestamp: Date.now() })
  }

  isRunning(): boolean {
    return this.started
  }

  private attachEventHandlers(): void {
    this.unsubs.push(
      runtimeEventBus.on('voice.wake', async () => {
        if (!runtimePolicyStore.get().proactiveVoice) return
        await voiceSession.speak('I am listening.')
      }),
      runtimeEventBus.on('voice.command', async ({ command }) => {
        const policy = runtimePolicyStore.get()
        if (!policy.allowVoiceCommandExecution || policy.autonomyMode === 'observe') {
          return
        }

        if (jarvisOS.shouldUseOrchestration(command)) {
          const report = await jarvisOS.executeGoal(command)
          await reflectionEngine.reflectTask(report.plan.id, {
            success: report.status !== 'failed',
            output: report.summary,
            error: report.status === 'failed' ? report.summary : undefined,
          })
          if (policy.proactiveVoice) {
            await voiceSession.speak(report.summary)
          }
          return
        }

        agentFrameworkAdapters.updateConfig({ selected: policy.orchestrationFramework })

        const mainAgent = agentEngine.getAllAgents().find((agent) => agent.type === 'main') || agentEngine.initializeMainAgent('runtime-user')
        const orchestrated = await agentFrameworkAdapters.execute({
          goal: command,
          context: { source: 'voice.command' },
        })

        const rewritePrompt = `Rewrite this as a concise executable assistant instruction without changing intent: ${orchestrated.output || command}`
        const refined = await providerMatrixRouter.query(rewritePrompt, {
          taskClass: 'reasoning',
          urgency: 'realtime',
        })

        const parsed = taskExecutor.parseCommand(refined.content || command)
        const task = taskExecutor.createTask(parsed)
        const executed = await agentEngine.routeAndExecuteTask(mainAgent.id, task, parsed.targetDevice)

        const success = Boolean((executed as { status?: string }).status === 'completed')
        await reflectionEngine.reflectTask(task.id, {
          success,
          output: success ? 'voice command execution completed' : undefined,
          error: success ? undefined : 'voice command execution failed',
        })

        if (success && policy.proactiveVoice) {
          await voiceSession.speak('Done.')
        }
      }),
      runtimeEventBus.on('prediction.generated', async ({ prediction }) => {
        if (!runtimePolicyStore.get().proactiveVoice) return
        if (prediction.confidence < 0.85) return
        await voiceSession.speak(`Heads up. ${prediction.reason}`)
      }),
    )
  }
}

export const autonomousRuntime = new AutonomousRuntime()
