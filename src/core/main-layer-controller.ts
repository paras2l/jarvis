import { eventBus } from '@/event_system/event_bus'
import { eventPublisher } from '@/event_system/event_publisher'
import type { EventEnvelope, EventPayloadMap, SystemEventName } from '@/event_system/event_types'
import { globalWorkspaceLayer } from '@/layers/global_workspace/global_workspace_layer'
import { selfModelLayer } from '@/layers/self_model/self_model_layer'
import type { SelfAwarenessReport } from '@/layers/self_model/self_awareness_report'
import { selfGoalCompass } from '@/layers/self_model/self_goal_compass'
import { metacognitionLayer } from '@/layers/metacognition/metacognition_layer'
import { contextManager } from '@/layers/identity_continuity/context_manager'
import { intentionalAgencyLayer } from '@/layers/intentional_agency/agency_core'
import { counterfactualWorldModel } from '@/layers/counterfactual_world/world_model_core'
import { valueAlignmentLayer } from '@/layers/value_alignment/alignment_core'
import { reflectiveLearningCore } from '@/layers/reflective_learning/reflective_learning_core'
import { memoryManager } from '@/layers/memory/memory_manager'
import { perceptionManager } from '@/layers/perception/perception_manager'

interface IntegrationHealth {
  started: boolean
  startedAt: number
  voiceCommandsProcessed: number
  blockedByAlignment: number
  actionsSentToAgency: number
  selfAwarenessReport: SelfAwarenessReport
  lastError?: string
}

class MainLayerController {
  private started = false
  private startedAt = 0
  private unsubs: Array<() => void> = []
  private learningInterval: number | null = null
  private health: IntegrationHealth = {
    started: false,
    startedAt: 0,
    voiceCommandsProcessed: 0,
    blockedByAlignment: 0,
    actionsSentToAgency: 0,
    selfAwarenessReport: selfModelLayer.getSelfAwarenessReport(),
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    globalWorkspaceLayer.start()
    await selfModelLayer.warmup()
    await contextManager.warmup()
    metacognitionLayer.start()
    intentionalAgencyLayer.start()
    perceptionManager.start()

    this.unsubs.push(
      eventBus.subscribe('voice_command_perceived', (envelope) => {
        void this.onVoiceCommand(envelope)
      }),
      eventBus.subscribe('perception_confidence_low', (envelope) => {
        void this.onLowPerceptionConfidence(envelope)
      }),
      eventBus.subscribe('task_completed', (envelope) => {
        void this.onTaskOutcome(envelope, true)
      }),
      eventBus.subscribe('task_failed', (envelope) => {
        void this.onTaskOutcome(envelope, false)
      }),
    )

    this.learningInterval = window.setInterval(() => {
      void reflectiveLearningCore.performLearningCycle()
      memoryManager.runConsolidationCycle()
    }, 30_000)

    this.started = true
    this.startedAt = Date.now()
    this.health.started = true
    this.health.startedAt = this.startedAt
    this.health.selfAwarenessReport = selfModelLayer.getSelfAwarenessReport()
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    if (this.learningInterval !== null) {
      window.clearInterval(this.learningInterval)
      this.learningInterval = null
    }

    this.unsubs.forEach((unsub) => unsub())
    this.unsubs = []

    perceptionManager.stop()
    intentionalAgencyLayer.stop()
    metacognitionLayer.stop()
    globalWorkspaceLayer.stop()

    this.started = false
    this.health.started = false
  }

  async ingestVoiceCommand(rawText: string, source: 'microphone' | 'text' | 'system' = 'text'): Promise<void> {
    await perceptionManager.executePerceptionCycle({
      voiceText: rawText,
      voiceSource: source,
    })
  }

  getHealth(): IntegrationHealth {
    return {
      ...this.health,
      selfAwarenessReport: selfModelLayer.getSelfAwarenessReport(),
    }
  }

  private async onVoiceCommand<TName extends SystemEventName>(
    envelope: EventEnvelope<EventPayloadMap[TName]>,
  ): Promise<void> {
    const payload = envelope.payload as unknown as {
      commandId: string
      normalizedText: string
      intent: string
      confidence: number
      requiresVerification: boolean
    }

    this.health.voiceCommandsProcessed += 1

    if (payload.requiresVerification) {
      await eventPublisher.notificationEmitted(
        {
          source: 'main-layer-controller',
          title: `Clarification needed for command: ${payload.normalizedText}`,
          importance: 'high',
        },
        'main-layer-controller',
      )
      return
    }

    const workspace = globalWorkspaceLayer.getState()
    const selfState = selfModelLayer.getSelfState()
    const continuity = await contextManager.buildContinuityContext(payload.normalizedText)
    const goalAssessment = selfGoalCompass.assessExecution({
      description: payload.normalizedText,
      action: payload.intent,
      confidence: payload.confidence,
      riskScore: Math.max(0, 1 - payload.confidence),
      contextTags: [payload.intent, 'perception-layer', selfState.runtimeMode],
    })

    const proposedAction = {
      id: payload.commandId,
      description: payload.normalizedText,
      type: 'reactive' as const,
      source: 'perception-layer',
      estimatedDuration: 3000,
      context: {
        workspace: {
          taskCount: workspace.tasks.length,
          perceptionCount: workspace.perceptions.length,
        },
        selfState: {
          moodLabel: selfState.moodLabel,
          confidenceCurrent: selfState.confidenceCurrent,
          runtimeMode: selfState.runtimeMode,
          goalAlignment: goalAssessment.alignmentScore,
          goalDrift: goalAssessment.driftScore,
        },
        continuity: {
          openPromises: continuity.openPromises,
        },
      },
    }

    const simulation = await counterfactualWorldModel.simulateAction(proposedAction)

    const predictedOutcomes = simulation.simulations
      .flatMap((scenario) => scenario.possibleOutcomes)
      .slice(0, 6)
      .map((outcome) => ({
        success: outcome.predictedSuccess,
        sideEffects: outcome.predictedSideEffects,
        duration: outcome.estimatedDuration,
      }))

    const alignment = await valueAlignmentLayer.evaluateAction({
      actionId: simulation.proposedAction.id,
      description: simulation.proposedAction.description,
      type: simulation.proposedAction.type,
      source: simulation.proposedAction.source,
      predictedOutcomes,
      riskScore: Math.min(1, simulation.overallRisk + goalAssessment.driftScore * 0.25),
      utilityScore: Math.min(1, simulation.overallUtility + goalAssessment.alignmentScore * 0.15),
    })

    if (!alignment.approved) {
      this.health.blockedByAlignment += 1
      memoryManager.recordEpisode(
        'action_blocked_by_alignment',
        {
          actionId: simulation.proposedAction.id,
          decision: alignment.decision,
          explanation: alignment.explanation,
        },
        {
          actionId: simulation.proposedAction.id,
          tags: ['alignment', 'blocked', payload.intent],
          importance: 0.85,
          success: false,
          summary: alignment.explanation,
        },
      )
      return
    }

    await intentionalAgencyLayer.proposeAction({
      description: simulation.proposedAction.description,
      source: 'main-layer-controller',
      context: {
        commandId: payload.commandId,
        intent: payload.intent,
        aggregateConfidence: payload.confidence,
        simulationId: simulation.requestId,
      },
    })

    this.health.actionsSentToAgency += 1
  }

  private async onLowPerceptionConfidence<TName extends SystemEventName>(
    envelope: EventEnvelope<EventPayloadMap[TName]>,
  ): Promise<void> {
    const payload = envelope.payload as unknown as {
      channel: string
      confidence: number
      clarificationPrompt: string
    }

    memoryManager.recordEpisode(
      'perception_clarification_requested',
      {
        channel: payload.channel,
        confidence: payload.confidence,
        clarificationPrompt: payload.clarificationPrompt,
      },
      {
        tags: ['perception', 'clarification'],
        importance: 0.72,
        success: true,
        summary: `Clarification requested on ${payload.channel}`,
      },
    )
  }

  private async onTaskOutcome<TName extends SystemEventName>(
    envelope: EventEnvelope<EventPayloadMap[TName]>,
    success: boolean,
  ): Promise<void> {
    const payload = envelope.payload as unknown as { taskId?: string; summary?: string; error?: string }
    const taskId = String(payload.taskId ?? `task_${Date.now()}`)

    await reflectiveLearningCore.recordUserFeedback(
      taskId,
      success ? 'approval' : 'correction',
      success ? 0.7 : 0.8,
      success ? 'Task completed successfully' : String(payload.error ?? payload.summary ?? 'Task failed'),
    )
  }
}

export const mainLayerController = new MainLayerController()
