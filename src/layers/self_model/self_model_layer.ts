import { eventPublisher } from '@/event_system/event_publisher'
import { getCognitiveWorkspace } from '@/core/cognitive-workspace'
import { memoryEngine } from '@/core/memory-engine'
import { detectPlatform } from '@/core/platform/platform-detection'
import {
  clamp01,
  createInitialSelfState,
  type SelfModelState,
  type SelfStateTransition,
  validateSelfStatePatch,
} from './self_state_schema'
import { selfBeliefGraph } from './self_belief_graph'
import { selfGoalCompass } from './self_goal_compass'
import { selfExecutionAdvisor } from './self_execution_advisor'
import { selfReflectionEngine } from './self_reflection_engine'
import { calculateSelfAwarenessReport } from './self_awareness_report'
import { detectSelfContradictions } from './self_contradiction_detector'
import { calculateNeedsScoreboard } from './self_needs_scoreboard'
import { selfNarrationStream } from './self_narration_stream'
import { composeSelfUnifiedState } from './self_unified_state'
import { selfTaskManager } from './task_manager'
import { selfModelLogger } from './logging_handler'

class SelfModelLayer {
  private state: SelfModelState = createInitialSelfState('patrich-main', `session_${Date.now()}`)
  private transitionClock = 0
  private lastPriority = 0
  private updateQueue: Promise<void> = Promise.resolve()
  private lastNarrationReason = 'boot'
  private lastNarrationSource: 'bootstrap' | 'input' | 'outcome' | 'transition' | 'goal' | 'system' | 'reflection' | 'network' = 'bootstrap'

  constructor() {
    this.seedBeliefGraph()
    this.seedGoalCompass()
    this.refreshDerivedState()
    void this.syncWorkspaceSnapshot('boot')
  }

  getSelfState(): SelfModelState {
    this.refreshDerivedState()
    return {
      ...this.state,
      goals: [...this.state.goals],
      tasks: [...this.state.tasks],
      constraints: [...this.state.constraints],
      confidenceHistory: [...this.state.confidenceHistory],
      beliefHighlights: [...this.state.beliefHighlights],
      beliefSnapshot: {
        ...this.state.beliefSnapshot,
        beliefHighlights: [...this.state.beliefSnapshot.beliefHighlights],
        dominantDomains: [...this.state.beliefSnapshot.dominantDomains],
        recentBeliefs: [...this.state.beliefSnapshot.recentBeliefs],
        openContradictionSubjects: [...this.state.beliefSnapshot.openContradictionSubjects],
      },
      goalCompass: {
        ...this.state.goalCompass,
        goals: [...this.state.goalCompass.goals],
        valueAxes: [...this.state.goalCompass.valueAxes],
        activeGoalIds: [...this.state.goalCompass.activeGoalIds],
        pausedGoalIds: [...this.state.goalCompass.pausedGoalIds],
        archivedGoalIds: [...this.state.goalCompass.archivedGoalIds],
        recentAssessments: [...this.state.goalCompass.recentAssessments],
        goalRelationships: [...this.state.goalCompass.goalRelationships],
      },
      executionAdvisor: {
        ...this.state.executionAdvisor,
        patterns: [...this.state.executionAdvisor.patterns],
        recentOutcomes: [...this.state.executionAdvisor.recentOutcomes],
        failureHotspots: [...this.state.executionAdvisor.failureHotspots],
      },
      reflection: {
        ...this.state.reflection,
        insights: [...this.state.reflection.insights],
        pendingPolicyUpdates: [...this.state.reflection.pendingPolicyUpdates],
        appliedPolicyUpdates: [...this.state.reflection.appliedPolicyUpdates],
        executionGuardrails: { ...this.state.reflection.executionGuardrails },
        simulation: { ...this.state.reflection.simulation },
        policyController: { ...this.state.reflection.policyController },
        governance: {
          ...this.state.reflection.governance,
          recentRollbacks: [...this.state.reflection.governance.recentRollbacks],
          deployment: {
            ...this.state.reflection.governance.deployment,
            history: {
              ...this.state.reflection.governance.deployment.history,
              recentEvents: [...this.state.reflection.governance.deployment.history.recentEvents],
            },
          },
        },
      },
      contradictionDetector: {
        ...this.state.contradictionDetector,
        subjects: [...this.state.contradictionDetector.subjects],
        findings: this.state.contradictionDetector.findings.map((finding) => ({
          ...finding,
          evidence: [...finding.evidence],
        })),
      },
      needsScoreboard: {
        ...this.state.needsScoreboard,
        needs: this.state.needsScoreboard.needs.map((need) => ({ ...need })),
        priorityOrder: [...this.state.needsScoreboard.priorityOrder],
      },
      narrationStream: {
        ...this.state.narrationStream,
        entries: this.state.narrationStream.entries.map((entry) => ({
          ...entry,
          tags: [...entry.tags],
        })),
      },
      unifiedState: {
        ...this.state.unifiedState,
        components: { ...this.state.unifiedState.components },
      },
    }
  }

  getSelfAwarenessReport() {
    return calculateSelfAwarenessReport(this.getSelfState())
  }

  async warmup(): Promise<void> {
    await memoryEngine.loadMemories()
    const preferredMode = memoryEngine.getUserPreference('silent_mode') === 'on' ? 'observe' : 'active'
    selfBeliefGraph.observe({
      sourceLayer: 'warmup',
      reason: 'runtime_mode_refresh',
      domain: 'runtime',
      subject: 'runtime_mode',
      statement: `The runtime is currently in ${preferredMode} mode.`,
      confidence: 0.9,
      polarity: 'affirmed',
      tags: ['runtime', 'warmup'],
    })
    this.seedGoalCompass()
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

    selfBeliefGraph.observe({
      sourceLayer: 'input',
      reason: 'user_intent_detected',
      domain: 'task',
      subject: 'current_user_intent',
      statement: `The active request maps to ${resolved.canonicalAction}.`,
      confidence: resolved.confidence,
      polarity: resolved.confidence >= 0.5 ? 'affirmed' : 'neutral',
      evidence: [input],
      tags: ['user_input', resolved.intent],
    })

    selfGoalCompass.observe({
      sourceLayer: 'input',
      tier: 'objective',
      title: `Respond to ${resolved.intent}`,
      description: `Handle the current request by mapping it to ${resolved.canonicalAction}.`,
      priority: Math.max(5, Math.round(resolved.confidence * 10)),
      status: 'active',
      progress: 0.1,
      alignedValues: ['user-intent', 'truthfulness', 'respect-user-choice'],
      conflictValues: resolved.confidence < 0.5 ? ['informed-consent'] : [],
      confidence: resolved.confidence,
    })

    const inputAssessment = selfGoalCompass.assessExecution({
      description: input,
      action: resolved.canonicalAction,
      confidence: resolved.confidence,
      riskScore: 1 - resolved.confidence,
      contextTags: [resolved.intent, platform, 'user-input'],
    })

    if (inputAssessment.focusGoalId) {
      selfGoalCompass.updateGoalProgress(
        inputAssessment.focusGoalId,
        Math.min(1, 0.15 + resolved.confidence * 0.2),
        `User input reinforces ${inputAssessment.summary}`,
        'input',
      )
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

    selfBeliefGraph.observe({
      sourceLayer: 'task-executor',
      reason: input.success ? 'action_outcome_success' : 'action_outcome_failure',
      domain: 'capability',
      subject: 'task_execution_reliability',
      statement: input.success
        ? 'Task execution is currently reliable enough to continue.'
        : 'Task execution is currently degraded and needs caution.',
      confidence,
      polarity: input.success ? 'affirmed' : 'negative',
      evidence: [input.summary, input.taskId || 'unknown_task'],
      tags: ['task_execution', input.success ? 'success' : 'failure'],
    })

    selfGoalCompass.observe({
      sourceLayer: 'task-executor',
      tier: 'commitment',
      title: input.success ? 'Fulfill current task reliably' : 'Recover from task failure',
      description: input.success
        ? 'Carry current tasks through to completion without sacrificing safety.'
        : 'Restore trust and reduce errors after a failure.',
      priority: input.success ? 8 : 9,
      status: input.success ? 'achieved' : 'blocked',
      progress: input.success ? 1 : 0.35,
      alignedValues: input.success
        ? ['stability', 'truthfulness', 'user_trust']
        : ['safety', 'transparency', 'user_trust'],
      conflictValues: input.success ? [] : ['efficiency'],
      confidence,
    })

    const relatedTask = input.taskId ? selfTaskManager.listTasks().find((task) => task.id === input.taskId) : undefined
    if (relatedTask?.goalId) {
      selfGoalCompass.recordGoalOutcome(relatedTask.goalId, {
        progressDelta: input.success ? 0.12 : -0.08,
        status: input.success ? 'active' : 'blocked',
        reason: input.summary,
        sourceLayer: 'task-executor',
      })
    }

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
    selfGoalCompass.observe({
      sourceLayer: 'planner',
      tier: 'objective',
      title: goal.description,
      description: goal.description,
      priority: goal.priority,
      status: goal.status === 'completed' ? 'achieved' : goal.status === 'blocked' ? 'blocked' : 'active',
      progress: clamp01(goal.progress),
      alignedValues: ['user-intent', 'continuity', 'helpfulness'],
      conflictValues: goal.status === 'blocked' ? ['efficiency'] : [],
      confidence: clamp01(Math.max(0.4, goal.priority / 10)),
    })
    selfBeliefGraph.observe({
      sourceLayer: 'planner',
      reason: 'goal_upsert',
      domain: 'goal',
      subject: `goal_${goal.id}`,
      statement: `${goal.description} is currently ${goal.status} with priority ${goal.priority}.`,
      confidence: clamp01(Math.max(0.35, goal.priority / 10)),
      polarity: goal.status === 'completed' ? 'affirmed' : 'neutral',
      tags: ['goal', goal.status],
    })
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
    this.lastNarrationReason = 'confidence_decay'
    this.lastNarrationSource = 'transition'
    this.refreshDerivedState()
    void this.syncWorkspaceSnapshot('confidence_decay')
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

  private seedBeliefGraph(): void {
    selfBeliefGraph.seedBaseline(this.state.agentId, this.state.runtimeMode, ['chat', 'voice', 'task_execution', 'app_launch'])
  }

  private seedGoalCompass(): void {
    selfGoalCompass.seedBaselineGoals({
      agentName: this.state.agentId,
      userTrust: this.state.beliefSnapshot.trustScore,
      currentMood: this.state.moodLabel,
      runtimeMode: this.state.runtimeMode,
    })
    selfGoalCompass.alignWithIdentity()
  }

  private refreshDerivedState(): void {
    selfBeliefGraph.stabilize()
    const beliefSnapshot = selfBeliefGraph.getWorkspaceSnapshot()
    const goalSnapshot = selfGoalCompass.getSnapshot()
    const goalDiagnostics = selfGoalCompass.getDiagnostics()
    const executionSnapshot = selfExecutionAdvisor.getSnapshot()
    const reflectionSnapshot = selfReflectionEngine.getSnapshot()
    const baseState: SelfModelState = {
      ...this.state,
      beliefSnapshot: {
        ...beliefSnapshot,
        dominantDomains: [...beliefSnapshot.dominantDomains],
        recentBeliefs: [...beliefSnapshot.recentBeliefs],
        openContradictionSubjects: [...beliefSnapshot.openContradictionSubjects],
        beliefHighlights: [...beliefSnapshot.beliefHighlights],
      },
      beliefHighlights: [...beliefSnapshot.beliefHighlights],
      goalCompass: {
        goals: goalSnapshot.goals,
        valueAxes: goalSnapshot.valueAxes,
        activeGoalIds: goalSnapshot.activeGoalIds,
        pausedGoalIds: goalSnapshot.pausedGoalIds,
        archivedGoalIds: goalSnapshot.archivedGoalIds,
        alignmentScore: goalDiagnostics.alignmentScore,
        driftScore: goalDiagnostics.driftScore,
        priorityNarrative: goalSnapshot.priorityNarrative,
        valueNarrative: goalSnapshot.valueNarrative,
        lastAssessmentSummary: goalSnapshot.lastAssessmentSummary,
        recentAssessments: goalSnapshot.recentAssessments,
        goalRelationships: goalSnapshot.goalRelationships,
        updatedAt: goalSnapshot.updatedAt,
        version: goalSnapshot.version,
      },
      executionAdvisor: {
        patterns: executionSnapshot.patterns,
        recentOutcomes: executionSnapshot.recentOutcomes,
        failureHotspots: executionSnapshot.failureHotspots,
        adaptiveThreshold: executionSnapshot.adaptiveThreshold,
        adaptiveRiskCap: executionSnapshot.adaptiveRiskCap,
        adaptiveClarifyBias: executionSnapshot.adaptiveClarifyBias,
        healthScore: executionSnapshot.healthScore,
        narrative: executionSnapshot.narrative,
        updatedAt: executionSnapshot.updatedAt,
        version: executionSnapshot.version,
      },
      reflection: {
        cycleCount: reflectionSnapshot.cycleCount,
        successTrend: reflectionSnapshot.successTrend,
        riskTrend: reflectionSnapshot.riskTrend,
        confidenceTrend: reflectionSnapshot.confidenceTrend,
        alignmentTrend: reflectionSnapshot.alignmentTrend,
        insights: reflectionSnapshot.insights,
        pendingPolicyUpdates: reflectionSnapshot.pendingPolicyUpdates,
        appliedPolicyUpdates: reflectionSnapshot.appliedPolicyUpdates,
        executionGuardrails: reflectionSnapshot.executionGuardrails,
        simulation: reflectionSnapshot.simulation,
        policyController: reflectionSnapshot.policyController,
        governance: reflectionSnapshot.governance,
        lastReflectionSummary: reflectionSnapshot.lastReflectionSummary,
        updatedAt: reflectionSnapshot.updatedAt,
        version: reflectionSnapshot.version,
      },
    }

    const contradictionDetector = detectSelfContradictions({
      beliefSnapshot: baseState.beliefSnapshot,
      goalCompass: baseState.goalCompass,
      executionAdvisor: baseState.executionAdvisor,
      reflection: baseState.reflection,
      narrationThread: baseState.narrationStream.narrative,
    })

    const needsScoreboard = calculateNeedsScoreboard(baseState)
    const narrationStream = selfNarrationStream.composeFromState(baseState, this.lastNarrationReason, this.lastNarrationSource)
    const awarenessReport = calculateSelfAwarenessReport({
      ...baseState,
      contradictionDetector,
      needsScoreboard,
      narrationStream,
      unifiedState: baseState.unifiedState,
    })
    const unifiedState = composeSelfUnifiedState({
      state: {
        ...baseState,
        contradictionDetector,
        needsScoreboard,
        narrationStream,
        unifiedState: baseState.unifiedState,
      },
      awareness: awarenessReport,
      needs: needsScoreboard,
      contradictions: contradictionDetector,
      narration: narrationStream,
    })

    this.state = {
      ...baseState,
      contradictionDetector,
      needsScoreboard,
      narrationStream,
      unifiedState,
    }
  }

  private async syncWorkspaceSnapshot(reason: string): Promise<void> {
    const workspace = getCognitiveWorkspace()
    await workspace.updateState({
      source: 'self-model',
      reason,
      updates: {
        selfModel: this.state.beliefSnapshot,
      },
    })
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
      this.lastNarrationReason = transition.reason
      this.lastNarrationSource = transition.sourceLayer === 'task-executor'
        ? 'outcome'
        : transition.sourceLayer === 'planner'
          ? 'goal'
          : transition.sourceLayer === 'system'
            ? 'system'
            : transition.sourceLayer === 'warmup' || transition.sourceLayer === 'self-model'
              ? 'bootstrap'
              : transition.sourceLayer === 'ncul'
                ? 'input'
                : 'transition'
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

      this.refreshDerivedState()

      this.transitionClock = transition.timestamp
      this.lastPriority = transitionPriority
      selfModelLogger.info('transition_applied', {
        sourceLayer: transition.sourceLayer,
        reason: transition.reason,
        stateVersion: this.state.stateVersion,
      })

      await this.syncWorkspaceSnapshot(transition.reason)
    })

    return this.updateQueue
  }

  private async publishState(reason: string): Promise<void> {
    const snapshot = this.getSelfState()
    const selfAwarenessReport = calculateSelfAwarenessReport(snapshot)
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
          selfAwarenessReport,
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
