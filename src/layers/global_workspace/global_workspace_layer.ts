import { eventBus } from '@/event_system/event_bus'
import { eventPublisher } from '@/event_system/event_publisher'
import type { EventEnvelope, EventPayloadMap, SystemEventName } from '@/event_system/event_types'
import { workspaceArbitrationEngine } from './arbitration_engine'
import { workspaceEventQueue } from './event_queue'
import { workspaceLogger } from './logger'
import {
  clampConfidence,
  createInitialWorkspaceState,
  type GlobalWorkspaceState,
  type WorkspaceEvent,
  type WorkspaceHypothesis,
  type WorkspacePerception,
  type WorkspacePlan,
  type WorkspaceSnapshot,
  type WorkspaceSource,
  type WorkspaceTask,
  validateWorkspacePayload,
} from './workspace_schema'

const MAX_EVENTS = 1200
const MAX_ITEMS_PER_COLLECTION = 300
const MAX_SNAPSHOTS = 250

class GlobalWorkspaceLayer {
  private state: GlobalWorkspaceState = createInitialWorkspaceState()
  private started = false
  private updateQueue: Promise<void> = Promise.resolve()
  private unsubs: Array<() => void> = []

  start(): void {
    if (this.started) return

    this.unsubs.push(
      eventBus.subscribe('context_updated', (envelope) => {
        void this.ingestSystemEvent(envelope)
      }),
      eventBus.subscribe('task_created', (envelope) => {
        void this.ingestSystemEvent(envelope)
      }),
      eventBus.subscribe('task_completed', (envelope) => {
        void this.ingestSystemEvent(envelope)
      }),
      eventBus.subscribe('task_failed', (envelope) => {
        void this.ingestSystemEvent(envelope)
      }),
      eventBus.subscribe('prediction_generated', (envelope) => {
        void this.ingestSystemEvent(envelope)
      }),
      eventBus.subscribe('command_parsed', (envelope) => {
        void this.ingestSystemEvent(envelope)
      }),
      eventBus.subscribe('error_occurred', (envelope) => {
        void this.ingestSystemEvent(envelope)
      }),
    )

    this.started = true
    workspaceLogger.info('workspace_started', 'global_workspace')
  }

  stop(): void {
    this.unsubs.forEach((unsub) => unsub())
    this.unsubs = []
    this.started = false
    workspaceLogger.info('workspace_stopped', 'global_workspace')
  }

  getState(): GlobalWorkspaceState {
    return {
      ...this.state,
      perceptions: [...this.state.perceptions],
      tasks: [...this.state.tasks],
      hypotheses: [...this.state.hypotheses],
      plans: [...this.state.plans],
      events: [...this.state.events],
      snapshots: [...this.state.snapshots],
    }
  }

  latestSnapshot(): WorkspaceSnapshot | undefined {
    return this.state.snapshots[this.state.snapshots.length - 1]
  }

  async publishPerception(input: {
    source: WorkspaceSource
    content: string
    confidence: number
    metadata?: Record<string, unknown>
  }): Promise<void> {
    const perception: WorkspacePerception = {
      id: `gwl_perception_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      source: input.source,
      content: input.content,
      confidence: clampConfidence(input.confidence),
      timestamp: Date.now(),
      metadata: input.metadata,
    }

    await this.withLock(async () => {
      this.state.perceptions.push(perception)
      this.state.perceptions = this.state.perceptions.slice(-MAX_ITEMS_PER_COLLECTION)
      this.captureSnapshot('perception_update')
    })
  }

  async publishHypothesis(input: Omit<WorkspaceHypothesis, 'id' | 'timestamp'>): Promise<void> {
    const hypothesis: WorkspaceHypothesis = {
      id: `gwl_hyp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      statement: input.statement,
      source: input.source,
      confidence: clampConfidence(input.confidence),
      utility: clampConfidence(input.utility),
      expiresAt: input.expiresAt,
      metadata: input.metadata,
    }

    await this.withLock(async () => {
      this.state.hypotheses.push(hypothesis)
      this.state.hypotheses = this.state.hypotheses.slice(-MAX_ITEMS_PER_COLLECTION)
      this.runArbitration('hypothesis_update')
    })
  }

  async publishPlan(input: Omit<WorkspacePlan, 'id' | 'timestamp'>): Promise<void> {
    const plan: WorkspacePlan = {
      id: `gwl_plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      goal: input.goal,
      steps: [...input.steps],
      source: input.source,
      confidence: clampConfidence(input.confidence),
      utility: clampConfidence(input.utility),
      metadata: input.metadata,
    }

    await this.withLock(async () => {
      this.state.plans.push(plan)
      this.state.plans = this.state.plans.slice(-MAX_ITEMS_PER_COLLECTION)
      this.runArbitration('plan_update')
    })
  }

  private async ingestSystemEvent<TName extends SystemEventName>(
    envelope: EventEnvelope<EventPayloadMap[TName]>,
  ): Promise<void> {
    const payload = envelope.payload as unknown as Record<string, unknown>
    const validation = validateWorkspacePayload(payload)

    if (!validation.valid) {
      workspaceLogger.warn('payload_rejected', String(envelope.name), { error: validation.error })
      return
    }

    const workspaceEvent: WorkspaceEvent = {
      id: envelope.id,
      name: envelope.name,
      source: this.mapEventSource(envelope.name),
      timestamp: envelope.timestamp,
      payload,
      priority: this.mapEventPriority(envelope.name),
    }

    workspaceEventQueue.enqueue(workspaceEvent)
    await this.flushEventQueue()
  }

  private mapEventSource(name: string): WorkspaceSource {
    if (name.includes('task')) return 'task_manager'
    if (name.includes('context')) return 'self_model'
    if (name.includes('prediction')) return 'metacognition'
    if (name.includes('command')) return 'action'
    if (name.includes('error')) return 'system'
    return 'system'
  }

  private mapEventPriority(name: string): number {
    if (name === 'error_occurred') return 95
    if (name === 'task_failed') return 90
    if (name === 'task_completed') return 70
    if (name === 'task_created') return 75
    if (name === 'context_updated') return 65
    return 50
  }

  private async flushEventQueue(): Promise<void> {
    await this.withLock(async () => {
      const queued = workspaceEventQueue.drain(120)
      if (!queued.length) return

      for (const entry of queued) {
        this.state.events.push(entry)
        if (entry.name === 'context_updated') {
          this.applyContextEvent(entry)
        }
        if (entry.name === 'task_created') {
          this.applyTaskCreatedEvent(entry)
        }
        if (entry.name === 'task_completed' || entry.name === 'task_failed') {
          this.applyTaskOutcomeEvent(entry)
        }
        if (entry.name === 'prediction_generated') {
          this.applyPredictionEvent(entry)
        }
      }

      this.state.events = this.state.events.slice(-MAX_EVENTS)
      this.runArbitration('event_flush')
      this.captureSnapshot('event_flush')
    })
  }

  private applyContextEvent(event: WorkspaceEvent): void {
    const snapshot = event.payload.snapshot as Record<string, unknown> | undefined
    const summary = String(snapshot?.recentConversationSummary || 'context update')
    this.state.perceptions.push({
      id: `gwl_ctx_${event.timestamp}_${Math.random().toString(36).slice(2, 6)}`,
      source: 'self_model',
      content: summary,
      confidence: 0.82,
      timestamp: event.timestamp,
      metadata: event.payload,
    })
    this.state.perceptions = this.state.perceptions.slice(-MAX_ITEMS_PER_COLLECTION)
  }

  private applyTaskCreatedEvent(event: WorkspaceEvent): void {
    const task: WorkspaceTask = {
      id: String(event.payload.taskId || `gwl_task_${Date.now()}`),
      description: String(event.payload.title || event.payload.command || 'task created'),
      source: 'task_manager',
      priority: Number(event.payload.priority || 50),
      status: 'pending',
      confidence: 0.75,
      timestamp: event.timestamp,
      metadata: event.payload,
    }

    this.upsertTask(task)
  }

  private applyTaskOutcomeEvent(event: WorkspaceEvent): void {
    const taskId = String(event.payload.taskId || '')
    if (!taskId) return

    const status: WorkspaceTask['status'] = event.name === 'task_completed' ? 'completed' : 'failed'
    const existing = this.state.tasks.find((task) => task.id === taskId)

    if (existing) {
      this.upsertTask({
        ...existing,
        status,
        confidence: status === 'completed' ? 0.9 : 0.35,
        timestamp: event.timestamp,
        metadata: { ...(existing.metadata || {}), ...event.payload },
      })
      return
    }

    this.upsertTask({
      id: taskId,
      description: String(event.payload.summary || 'task outcome'),
      source: 'task_manager',
      priority: 50,
      status,
      confidence: status === 'completed' ? 0.86 : 0.32,
      timestamp: event.timestamp,
      metadata: event.payload,
    })
  }

  private applyPredictionEvent(event: WorkspaceEvent): void {
    const prediction = event.payload.prediction as Record<string, unknown> | undefined
    if (!prediction) return

    this.state.hypotheses.push({
      id: String(prediction.id || `gwl_pred_${Date.now()}`),
      statement: String(prediction.reason || 'prediction'),
      source: 'metacognition',
      confidence: clampConfidence(Number(prediction.confidence || 0.6)),
      utility: 0.6,
      timestamp: event.timestamp,
      metadata: prediction,
    })
    this.state.hypotheses = this.state.hypotheses.slice(-MAX_ITEMS_PER_COLLECTION)
  }

  private upsertTask(task: WorkspaceTask): void {
    const index = this.state.tasks.findIndex((item) => item.id === task.id)
    if (index >= 0) {
      this.state.tasks[index] = task
    } else {
      this.state.tasks.push(task)
    }
    this.state.tasks = this.state.tasks.slice(-MAX_ITEMS_PER_COLLECTION)
  }

  private runArbitration(reason: string): void {
    // Time decay on stale hypotheses before selection.
    const now = Date.now()
    this.state.hypotheses = this.state.hypotheses
      .map((hyp) => {
        const staleMs = Math.max(0, now - hyp.timestamp)
        const adjusted = clampConfidence(hyp.confidence - staleMs / 10_000_000)
        return { ...hyp, confidence: adjusted }
      })
      .filter((hyp) => hyp.confidence > 0.05)

    const arbitration = workspaceArbitrationEngine.arbitrate({
      hypotheses: this.state.hypotheses,
      plans: this.state.plans,
      tasks: this.state.tasks,
    })

    this.state.selectedHypothesisId = arbitration.selectedHypothesisId
    this.state.selectedPlanId = arbitration.selectedPlanId
    this.state.arbitrationNotes = arbitration.notes

    if (arbitration.conflicts.length) {
      workspaceLogger.warn('workspace_conflicts_detected', 'arbitration', {
        reason,
        conflicts: arbitration.conflicts,
      })
      void eventPublisher.notificationEmitted(
        {
          source: 'global_workspace',
          title: `Workspace conflicts: ${arbitration.conflicts.length}`,
          importance: 'high',
        },
        'global_workspace',
      )
    }
  }

  private captureSnapshot(reason: string): void {
    const snapshot: WorkspaceSnapshot = {
      id: `gwl_snapshot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      perceptions: this.state.perceptions.slice(-80),
      tasks: this.state.tasks.slice(-80),
      hypotheses: this.state.hypotheses.slice(-80),
      plans: this.state.plans.slice(-80),
      lastEvents: this.state.events.slice(-120),
      selectedHypothesisId: this.state.selectedHypothesisId,
      selectedPlanId: this.state.selectedPlanId,
      arbitrationNotes: this.state.arbitrationNotes,
    }

    this.state.snapshots.push(snapshot)
    this.state.snapshots = this.state.snapshots.slice(-MAX_SNAPSHOTS)
    workspaceLogger.info('workspace_snapshot', 'global_workspace', {
      reason,
      snapshotId: snapshot.id,
      taskCount: snapshot.tasks.length,
      hypothesisCount: snapshot.hypotheses.length,
    })
  }

  private async withLock(fn: () => Promise<void> | void): Promise<void> {
    this.updateQueue = this.updateQueue.then(async () => {
      await Promise.resolve(fn())
    })
    return this.updateQueue
  }
}

export const globalWorkspaceLayer = new GlobalWorkspaceLayer()
