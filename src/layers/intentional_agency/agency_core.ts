import { eventBus } from '@/event_system/event_bus'
import { eventPublisher } from '@/event_system/event_publisher'
import type { EventEnvelope, EventPayloadMap, SystemEventName } from '@/event_system/event_types'
import { globalWorkspaceLayer } from '@/layers/global_workspace/global_workspace_layer'
import { selfModelLayer } from '@/layers/self_model/self_model_layer'
import { contextManager } from '@/layers/identity_continuity/context_manager'
import { actionEvaluator } from './action_evaluator'
import { initiativeQueue } from './initiative_queue'
import { policyGate } from './policy_gate'
import { actionLogger } from './action_logger'

export interface ProposedAction {
  description: string
  source: string
  context?: Record<string, unknown>
}

class IntentionalAgencyLayer {
  private started = false
  private unsubs: Array<() => void> = []
  private processingIntervalId: number | null = null

  start(): void {
    if (this.started) return

    this.unsubs.push(
      eventBus.subscribe('task_completed', (envelope) => {
        void this.onTaskOutcome(envelope, true)
      }),
      eventBus.subscribe('task_failed', (envelope) => {
        void this.onTaskOutcome(envelope, false)
      }),
      eventBus.subscribe('context_updated', () => {
        void this.evaluatePotentialActions()
      }),
    )

    this.processingIntervalId = window.setInterval(() => {
      void this.processQueue()
    }, 8000)

    this.started = true
  }

  stop(): void {
    this.unsubs.forEach((unsub) => unsub())
    this.unsubs = []
    if (this.processingIntervalId !== null) {
      window.clearInterval(this.processingIntervalId)
      this.processingIntervalId = null
    }
    this.started = false
  }

  async proposeAction(action: ProposedAction): Promise<void> {
    const workspace = globalWorkspaceLayer.getState()
    const selfState = selfModelLayer.getSelfState()
    const continuity = await contextManager.buildContinuityContext(action.description)

    const evaluated = actionEvaluator.evaluateAction({
      description: action.description,
      type: 'proactive',
      source: action.source,
      context: {
        workspace,
        selfState,
        continuity,
      },
    })

    const policyResult = policyGate.check(evaluated, continuity)

    if (!policyResult.allowed) {
      actionLogger.log({
        actionId: evaluated.id,
        description: action.description,
        type: 'proactive',
        source: action.source,
        confidence: evaluated.confidence,
        utility: evaluated.utility,
        risk: evaluated.risk,
        approved: false,
        executed: false,
        reasoning: policyResult.reason,
      })
      return
    }

    initiativeQueue.enqueue(evaluated, {
      approvalRequired: policyResult.requiresApproval,
    })

    actionLogger.log({
      actionId: evaluated.id,
      description: action.description,
      type: 'proactive',
      source: action.source,
      confidence: evaluated.confidence,
      utility: evaluated.utility,
      risk: evaluated.risk,
      approved: false,
      executed: false,
      reasoning: evaluated.reasoning,
    })

    if (!policyResult.requiresApproval) {
      await this.approveAndQueue(evaluated.id)
    } else {
      await eventPublisher.notificationEmitted(
        {
          source: 'intentional-agency',
          title: `Proposed action awaiting approval: ${action.description}`,
          importance: 'high',
        },
        'intentional-agency',
      )
    }
  }

  async approveAction(actionId: string): Promise<boolean> {
    const approved = initiativeQueue.approve(actionId)
    if (approved) {
      actionLogger.approve(actionId)
      await this.approveAndQueue(actionId)
    }
    return approved
  }

  private async approveAndQueue(_actionId: string): Promise<void> {
    const toPeek = initiativeQueue.peek()
    while (toPeek) {
      const action = initiativeQueue.dequeue()
      if (!action) break

      await eventPublisher.agencyActionReady(
        {
          actionId: action.evaluatedAction.id,
          description: action.evaluatedAction.description,
          confidence: action.evaluatedAction.confidence,
          utility: action.evaluatedAction.utility,
        },
        'intentional-agency',
      )
    }
  }

  private async onTaskOutcome<TName extends SystemEventName>(
    _envelope: EventEnvelope<EventPayloadMap[TName]>,
    success: boolean,
  ): Promise<void> {
    if (success) {
      await this.evaluatePotentialActions()
    }
  }

  private async evaluatePotentialActions(): Promise<void> {
    const workspace = globalWorkspaceLayer.getState()
    const selfState = selfModelLayer.getSelfState()
    const continuity = await contextManager.buildContinuityContext('autonomous-evaluation')

    const potentialActions: ProposedAction[] = []

    if (workspace.tasks.some((t) => t.status === 'failed')) {
      potentialActions.push({
        description: 'Analyze recent failed tasks and propose recovery steps.',
        source: 'workspace-monitor',
      })
    }

    if (selfState.stressLevel > 0.7) {
      potentialActions.push({
        description: 'Suggest stress-reduction techniques or pause high-pressure tasks.',
        source: 'self-model-monitor',
      })
    }

    if (continuity.openPromises.length > 0 && workspace.tasks.length < 2) {
      potentialActions.push({
        description: `Initiate work on open promise: ${continuity.openPromises[0]}`,
        source: 'narrative-continuity-monitor',
      })
    }

    for (const action of potentialActions) {
      await this.proposeAction(action)
    }
  }

  private async processQueue(): Promise<void> {
    const approval = initiativeQueue.peekApprovalRequired()
    if (approval.length > 0) {
      return
    }

    const next = initiativeQueue.peek()
    if (!next) return

    const dequeued = initiativeQueue.dequeue()
    if (!dequeued) return

    await this.publishAgencyEvent('executing', {
      actionId: dequeued.evaluatedAction.id,
      description: dequeued.evaluatedAction.description,
      type: dequeued.evaluatedAction.type,
    })

    try {
      actionLogger.execute(dequeued.evaluatedAction.id, { success: true })
      await this.publishAgencyEvent('completed', {
        actionId: dequeued.evaluatedAction.id,
        success: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      actionLogger.execute(dequeued.evaluatedAction.id, { success: false, error: message })
      await this.publishAgencyEvent('failed', {
        actionId: dequeued.evaluatedAction.id,
        error: message,
      })
    }
  }

  private publishAgencyEvent(name: string, _payload: Record<string, unknown>): Promise<void> {
    void eventPublisher.notificationEmitted(
      {
        source: 'intentional-agency',
        title: `Agency event: ${name}`,
        importance: 'info',
      },
      'intentional-agency',
    )
    return Promise.resolve()
  }
}

export const intentionalAgencyLayer = new IntentionalAgencyLayer()
