import { eventPublisher } from '@/event_system/event_publisher'
import { memoryEngine } from '@/core/memory-engine'
import { detectPlatform } from '@/core/platform/platform-detection'
import {
  clamp01,
  createInitialSelfState,
  type SelfModelState,
  type SelfStateTransition,
  validateSelfStatePatch,
} from './self_state_schema'
import { selfTaskManager } from './task_manager'
import { selfModelLogger } from './logging_handler'

class SelfModelLayer {
  private state: SelfModelState = createInitialSelfState('patrich-main', `session_${Date.now()}`)
  private transitionClock = 0
  private lastPriority = 0
  private updateQueue: Promise<void> = Promise.resolve()

  getSelfState(): SelfModelState {
    return {
      ...this.state,
      goals: [...this.state.goals],
      tasks: [...this.state.tasks],
      constraints: [...this.state.constraints],
      confidenceHistory: [...this.state.confidenceHistory],
    }
  }

  async warmup(): Promise<void> {
    await memoryEngine.loadMemories()
    const preferredMode = memoryEngine.getUserPreference('silent_mode') === 'on' ? 'observe' : 'active'
    await this.applyTransition({
      sourceLayer: 'self-model',
      reason: 'warmup',
      priority: 30,
      timestamp: Date.now(),
      patch: {
        runtimeMode: preferredMode,
      },
    })
  }

  async onUserInput(input: string): Promise<void> {
    const platform = detectPlatform()
    const resolved = await selfTaskManager.resolveFromInput(input, platform)

    if (resolved.intent !== 'chat' && resolved.intent !== 'knowledge_query') {
      const task = selfTaskManager.createTask({
        description: input,
        canonicalAction: resolved.canonicalAction,
        confidence: resolved.confidence,
        context: {
          intent: resolved.intent,
          target: resolved.target,
          params: resolved.params,
          platform,
        },
      })

      selfModelLogger.info('task_created_from_input', { taskId: task.id, intent: resolved.intent })
    }

    const mood = this.inferMood(input)
    const confidence = this.recomputeConfidence(this.state.confidenceCurrent, resolved.confidence, 'input')

    await this.applyTransition({
      sourceLayer: 'ncul',
      reason: 'user_input',
      priority: 40,
      timestamp: Date.now(),
      patch: {
        moodLabel: mood.label,
        moodIntensity: mood.intensity,
        stressLevel: mood.stress,
        confidenceCurrent: confidence,
        currentFocus: resolved.canonicalAction,
      },
    })

    await this.publishState('user_input_processed')
  }

  async onSystemEvent(eventName: string, payload?: Record<string, unknown>): Promise<void> {
    const now = Date.now()
    const eventId = `self_evt_${now}_${Math.random().toString(36).slice(2, 7)}`
    await this.applyTransition({
      sourceLayer: 'system',
      reason: eventName,
      priority: 50,
      timestamp: now,
      patch: {
        lastEventId: eventId,
      },
    })

    selfModelLogger.info('system_event', { eventName, payload, eventId })
    await this.publishState('system_event_processed')
  }

  async onActionOutcome(input: {
    taskId?: string
    success: boolean
    summary: string
    confidenceHint?: number
  }): Promise<void> {
    if (input.taskId) {
      selfTaskManager.setTaskStatus(input.taskId, input.success ? 'completed' : 'failed', {
        summary: input.summary,
      })
    }

    const base = input.confidenceHint ?? this.state.confidenceCurrent
    const confidence = this.recomputeConfidence(base, input.success ? 0.2 : -0.25, 'outcome')

    await this.applyTransition({
      sourceLayer: 'task-executor',
      reason: input.success ? 'task_success' : 'task_failure',
      priority: input.success ? 45 : 55,
      timestamp: Date.now(),
      patch: {
        confidenceCurrent: confidence,
        currentFocus: input.success ? 'ready' : 'recovery',
        stressLevel: clamp01(input.success ? this.state.stressLevel - 0.08 : this.state.stressLevel + 0.14),
      },
    })

    await this.publishState(input.success ? 'action_succeeded' : 'action_failed')
  }

  async addOrUpdateGoal(goal: {
    id: string
    description: string
    priority: number
    status: 'active' | 'blocked' | 'deferred' | 'completed'
    progress: number
  }): Promise<void> {
    selfTaskManager.upsertGoal(goal)
    await this.applyTransition({
      sourceLayer: 'planner',
      reason: 'goal_upsert',
      priority: 42,
      timestamp: Date.now(),
      patch: {},
    })
    await this.publishState('goal_upserted')
  }

  decayConfidenceIfStale(maxStaleMs = 120_000): void {
    const now = Date.now()
    const stale = now - this.state.lastUpdateTs
    if (stale < maxStaleMs) {
      return
    }

    const decayAmount = Math.min(0.15, stale / 1_000_000)
    const next = clamp01(this.state.confidenceCurrent - decayAmount)
    this.state = {
      ...this.state,
      confidenceCurrent: next,
      confidenceHistory: [...this.state.confidenceHistory, { timestamp: now, value: next }].slice(-200),
      stalenessMs: stale,
      lastUpdateTs: now,
      stateVersion: this.state.stateVersion + 1,
    }
  }

  private inferMood(input: string): { label: SelfModelState['moodLabel']; intensity: number; stress: number } {
    const text = input.toLowerCase()
    if (/error|failed|not working|broken|stuck/.test(text)) {
      return { label: 'stressed', intensity: 0.78, stress: 0.72 }
    }
    if (/build|focus|debug|analyze|research/.test(text)) {
      return { label: 'focused', intensity: 0.74, stress: 0.45 }
    }
    if (/awesome|great|lets go|ship|excited/.test(text)) {
      return { label: 'excited', intensity: 0.8, stress: 0.32 }
    }
    if (/hi|hello|hey|bro|buddy/.test(text)) {
      return { label: 'calm', intensity: 0.55, stress: 0.25 }
    }
    return { label: 'neutral', intensity: 0.45, stress: 0.35 }
  }

  private recomputeConfidence(current: number, signal: number, mode: 'input' | 'outcome'): number {
    const next = mode === 'input' ? current * 0.75 + signal * 0.25 : current + signal
    return clamp01(next)
  }

  private async applyTransition(transition: SelfStateTransition): Promise<void> {
    this.updateQueue = this.updateQueue.then(async () => {
      const validation = validateSelfStatePatch(transition.patch)
      if (!validation.valid) {
        selfModelLogger.error('invalid_state_patch', {
          sourceLayer: transition.sourceLayer,
          reason: transition.reason,
          error: validation.error,
        })
        return
      }

      const transitionPriority = transition.priority
      const isOlder = transition.timestamp < this.transitionClock
      const lowerPriority = transitionPriority < this.lastPriority

      if (isOlder && lowerPriority) {
        selfModelLogger.warn('transition_rejected_priority', {
          sourceLayer: transition.sourceLayer,
          reason: transition.reason,
          transitionPriority,
          lastPriority: this.lastPriority,
        })
        return
      }

      const now = Date.now()
      const updatedConfidence =
        transition.patch.confidenceCurrent !== undefined
          ? clamp01(transition.patch.confidenceCurrent)
          : this.state.confidenceCurrent

      this.state = {
        ...this.state,
        ...transition.patch,
        tasks: selfTaskManager.listTasks(),
        goals: selfTaskManager.listGoals(),
        confidenceCurrent: updatedConfidence,
        confidenceHistory: [
          ...this.state.confidenceHistory,
          { timestamp: now, value: updatedConfidence },
        ].slice(-200),
        stalenessMs: 0,
        lastUpdateTs: now,
        stateVersion: this.state.stateVersion + 1,
      }

      this.transitionClock = transition.timestamp
      this.lastPriority = transitionPriority
      selfModelLogger.info('transition_applied', {
        sourceLayer: transition.sourceLayer,
        reason: transition.reason,
        stateVersion: this.state.stateVersion,
      })
    })

    return this.updateQueue
  }

  private async publishState(reason: string): Promise<void> {
    const snapshot = this.getSelfState()
    await eventPublisher.contextUpdated(
      {
        snapshot: {
          timestamp: snapshot.lastUpdateTs,
          activeWindowTitle: 'self-model-layer',
          foregroundApp: snapshot.currentFocus,
          timeOfDay: this.getTimeOfDay(),
          recentConversationSummary: `focus=${snapshot.currentFocus}; confidence=${snapshot.confidenceCurrent.toFixed(2)}; mood=${snapshot.moodLabel}`,
          systemBusy: snapshot.tasks.some((task) => task.status === 'active' || task.status === 'waiting'),
          activeApplications: [],
          userActivity: reason,
          screenSummary: 'self-model-publish',
          pendingNotifications: [],
          calendarSignals: [],
          lastUserCommand: snapshot.currentFocus,
        },
      },
      'self-model',
    )
  }

  private getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours()
    if (hour < 12) return 'morning'
    if (hour < 17) return 'afternoon'
    if (hour < 21) return 'evening'
    return 'night'
  }
}

export const selfModelLayer = new SelfModelLayer()
