/**
 * Workspace Subscribers System
 * 
 * High-level reactive patterns for modules to listen to workspace changes
 * and respond intelligently.
 * 
 * This is the Nervous System that connects all modules.
 */

import {
  getCognitiveWorkspace,
  CognitiveWorkspaceController,
} from './workspace_controller.ts'
import type { CognitiveWorkspaceState, WorkspaceChange, EmotionalState } from './workspace_state.ts'

/**
 * Reactive listener for workspace changes
 * 
 * Usage:
 * ```
 * workspaceListener.onEmotionalChange((mood, change) => {
 *   console.log(`Mood changed from ${change.previousValues.currentMood} to ${mood}`)
 * })
 * 
 * workspaceListener.onGoalChange((goal) => {
 *   // React to new goal
 * })
 * ```
 */
export class WorkspaceListener {
  private controller: CognitiveWorkspaceController
  private subscriptionIds: string[] = []

  constructor() {
    this.controller = getCognitiveWorkspace()
  }

  /**
   * Listen for emotional state changes
   */
  public onEmotionalChange(
    callback: (
      newMood: EmotionalState,
      change: WorkspaceChange,
      previousMood: EmotionalState,
    ) => void,
  ): string {
    const subscriptionId = this.controller.subscribe(
      (state: CognitiveWorkspaceState, change: WorkspaceChange) => {
        if (change.changedPaths.includes('emotionalState')) {
          const newMood = state.emotionalState.currentMood
          const previousMood = (change.previousValues.emotionalState?.currentMood ||
            'calm') as EmotionalState
          callback(newMood, change, previousMood)
        }
      },
      ['emotionalState'],
    )
    this.subscriptionIds.push(subscriptionId)
    return subscriptionId
  }

  /**
   * Listen for goal changes
   */
  public onGoalChange(
    callback: (goal: any | null, change: WorkspaceChange) => void,
  ): string {
    const subscriptionId = this.controller.subscribe(
      (state: CognitiveWorkspaceState, change: WorkspaceChange) => {
        if (change.changedPaths.includes('currentGoal')) {
          callback(state.currentGoal || null, change)
        }
      },
      ['currentGoal'],
    )
    this.subscriptionIds.push(subscriptionId)
    return subscriptionId
  }

  /**
   * Listen for task changes
   */
  public onTaskChange(
    callback: (task: any | null, change: WorkspaceChange) => void,
  ): string {
    const subscriptionId = this.controller.subscribe(
      (state: CognitiveWorkspaceState, change: WorkspaceChange) => {
        if (change.changedPaths.includes('activeTask')) {
          callback(state.activeTask || null, change)
        }
      },
      ['activeTask'],
    )
    this.subscriptionIds.push(subscriptionId)
    return subscriptionId
  }

  /**
   * Listen for task state transitions (idle → planning → executing, etc.)
   */
  public onTaskStateTransition(
    callback: (oldState: string, newState: string, task: any) => void,
  ): string {
    const subscriptionId = this.controller.subscribe(
      (state: CognitiveWorkspaceState, change: WorkspaceChange) => {
        if (
          change.changedPaths.includes('activeTask') &&
          change.previousValues.activeTask?.state !==
            change.newValues.activeTask?.state
        ) {
          callback(
            change.previousValues.activeTask?.state || 'none',
            change.newValues.activeTask?.state || 'idle',
            state.activeTask,
          )
        }
      },
    )
    this.subscriptionIds.push(subscriptionId)
    return subscriptionId
  }

  /**
   * Listen for perception (input) changes
   */
  public onPerceptionChange(
    callback: (input: string, change: WorkspaceChange) => void,
  ): string {
    const subscriptionId = this.controller.subscribe(
      (state: CognitiveWorkspaceState, change: WorkspaceChange) => {
        if (change.changedPaths.includes('perception')) {
          callback(state.perception.currentInput, change)
        }
      },
      ['perception'],
    )
    this.subscriptionIds.push(subscriptionId)
    return subscriptionId
  }

  /**
   * Listen for confidence changes
   */
  public onConfidenceChange(
    callback: (confidence: string, change: WorkspaceChange) => void,
  ): string {
    const subscriptionId = this.controller.subscribe(
      (state: CognitiveWorkspaceState, change: WorkspaceChange) => {
        if (change.changedPaths.includes('emotionalState')) {
          callback(state.emotionalState.confidence, change)
        }
      },
      ['emotionalState'],
    )
    this.subscriptionIds.push(subscriptionId)
    return subscriptionId
  }

  /**
   * Listen for blocker changes (when system gets stuck)
   */
  public onBlockersChange(
    callback: (blockers: string[], change: WorkspaceChange) => void,
  ): string {
    const subscriptionId = this.controller.subscribe(
      (state: CognitiveWorkspaceState, change: WorkspaceChange) => {
        if (change.changedPaths.includes('blockers')) {
          callback(state.blockers || [], change)
        }
      },
      ['blockers'],
    )
    this.subscriptionIds.push(subscriptionId)
    return subscriptionId
  }

  /**
   * Listen for constraint changes (permissions, safety, resources)
   */
  public onConstraintsChange(
    callback: (constraints: string[], change: WorkspaceChange) => void,
  ): string {
    const subscriptionId = this.controller.subscribe(
      (state: CognitiveWorkspaceState, change: WorkspaceChange) => {
        if (change.changedPaths.includes('activeConstraints')) {
          callback(state.activeConstraints || [], change)
        }
      },
      ['activeConstraints'],
    )
    this.subscriptionIds.push(subscriptionId)
    return subscriptionId
  }

  /**
   * Listen to any changes (broad catch-all)
   */
  public onChange(callback: (state: CognitiveWorkspaceState, change: WorkspaceChange) => void): string {
    const subscriptionId = this.controller.subscribe(callback)
    this.subscriptionIds.push(subscriptionId)
    return subscriptionId
  }

  /**
   * Listen to specific fields changing
   */
  public onFieldChange(
    fields: (keyof CognitiveWorkspaceState)[],
    callback: (state: CognitiveWorkspaceState, change: WorkspaceChange) => void,
  ): string {
    const subscriptionId = this.controller.subscribe(callback, fields.map(String))
    this.subscriptionIds.push(subscriptionId)
    return subscriptionId
  }

  /**
   * Unsubscribe from a specific listener
   */
  public off(subscriptionId: string): void {
    this.controller.unsubscribe(subscriptionId)
    this.subscriptionIds = this.subscriptionIds.filter((id) => id !== subscriptionId)
  }

  /**
   * Unsubscribe from all listeners
   */
  public offAll(): void {
    this.subscriptionIds.forEach((id) => this.controller.unsubscribe(id))
    this.subscriptionIds = []
  }

  /**
   * Get current state for immediate access
   */
  public getState(): Readonly<CognitiveWorkspaceState> {
    return this.controller.getState()
  }
}

/**
 * Create a new listener instance
 * 
 * Each module should have its own listener instance to manage subscriptions
 */
export function createWorkspaceListener(): WorkspaceListener {
  return new WorkspaceListener()
}

/**
 * Singleton instance for cross-module access
 */
let globalListener: WorkspaceListener | null = null

export function getWorkspaceListener(): WorkspaceListener {
  if (!globalListener) {
    globalListener = new WorkspaceListener()
  }
  return globalListener
}

/**
 * Reactive composition helpers for common patterns
 */
export class WorkspaceReactors {
  /**
   * React to goal completion
   */
  static onGoalCompleted(callback: (goal: any) => void): string {
    const listener = createWorkspaceListener()
    return listener.onTaskStateTransition((_oldState, newState) => {
      if (newState === 'completed') {
        const state = listener.getState()
        callback(state.currentGoal)
      }
    })
  }

  /**
   * React to high-anxiety situations (low confidence + negative mood)
   */
  static onHighAnxiety(callback: (state: CognitiveWorkspaceState) => void): string {
    const listener = createWorkspaceListener()
    return listener.onEmotionalChange((newMood) => {
      const state = listener.getState()
      const isLowConfidence = state.emotionalState.confidence === 'low'
      const isNegativeMood = ['sad', 'frustrated', 'confused'].includes(newMood)

      if (isLowConfidence && isNegativeMood) {
        callback(state)
      }
    })
  }

  /**
   * React to task failures
   */
  static onTaskFailed(callback: (task: any, reason?: string) => void): string {
    const listener = createWorkspaceListener()
    return listener.onTaskStateTransition((_oldState, newState) => {
      if (newState === 'failed') {
        const state = listener.getState()
        callback(state.activeTask, state.activeTask?.error)
      }
    })
  }

  /**
   * React to system being blocked
   */
  static onSystemBlocked(callback: (blockers: string[]) => void): string {
    const listener = createWorkspaceListener()
    return listener.onBlockersChange((blockers) => {
      if (blockers.length > 0) {
        callback(blockers)
      }
    })
  }

  /**
   * React when user intent is identified clearly
   */
  static onIntentClarity(threshold: number, callback: (clarity: number) => void): string {
    const listener = createWorkspaceListener()
    return listener.onFieldChange(['userIntentClarityScore'], (state) => {
      if (state.userIntentClarityScore >= threshold) {
        callback(state.userIntentClarityScore)
      }
    })
  }
}

export default WorkspaceListener
