/**
 * Cognitive Workspace Controller
 * 
 * Central state management for the entire consciousness system.
 * Enforces consistency, tracks changes, and coordinates updates.
 * 
 * This is the Guardian of State.
 */

import {
  CognitiveWorkspaceState,
  createEmptyWorkspaceState,
  WorkspaceUpdate,
  WorkspaceChange,
  WorkspaceSubscription,
  WORKSPACE_PATHS,
} from './workspace_state.ts'

class CognitiveWorkspaceController {
  private state: CognitiveWorkspaceState
  private subscriptions: Map<string, WorkspaceSubscription> = new Map()
  private updateQueue: WorkspaceUpdate[] = []
  private isProcessing = false
  private readonly maxQueueSize = 100
  private changeHistory: WorkspaceChange[] = []
  private readonly maxHistorySize = 500

  constructor(userId?: string) {
    this.state = createEmptyWorkspaceState(userId)
  }

  /**
   * Get current state (read-only snapshot)
   */
  public getState(): Readonly<CognitiveWorkspaceState> {
    return Object.freeze(JSON.parse(JSON.stringify(this.state)))
  }

  /**
   * Get a specific field from state
   */
  public getField<K extends keyof CognitiveWorkspaceState>(
    field: K,
  ): CognitiveWorkspaceState[K] {
    return this.state[field]
  }

  /**
   * Request state update
   * 
   * Updates are queued and processed sequentially to ensure consistency.
   * Each update generates a change event that subscribers are notified of.
   */
  public async updateState(update: WorkspaceUpdate): Promise<void> {
    this.updateQueue.push(update)

    if (this.updateQueue.length > this.maxQueueSize) {
      console.warn(`[CognitiveWorkspace] Update queue exceeded ${this.maxQueueSize}, dropping oldest`)
      this.updateQueue.shift()
    }

    // Process queue asynchronously to batch updates
    if (!this.isProcessing) {
      this.isProcessing = true
      await this.processUpdateQueue()
      this.isProcessing = false
    }
  }

  /**
   * Synchronous update for critical paths
   * 
   * Use sparingly - blocks subscribers until complete
   */
  public updateStateSync(update: WorkspaceUpdate): void {
    this.processUpdate(update)
  }

  /**
   * Direct field update with type safety
   */
  public setField<K extends keyof CognitiveWorkspaceState>(
    field: K,
    value: CognitiveWorkspaceState[K],
    source: string,
    reason?: string,
  ): void {
    if (this.state[field] === value) {
      return // No change needed
    }

    const previousValue = this.state[field]
    this.state[field] = value
    this.state.lastUpdatedAt = Date.now()

    // Emit change
    const change: WorkspaceChange = {
      timestamp: Date.now(),
      source,
      changedPaths: [String(field)],
      previousValues: { [String(field)]: previousValue },
      newValues: { [String(field)]: value },
      reason,
    }

    this.emitChange(change)
  }

  /**
   * Merge partial updates into a field
   */
  public mergeField<K extends keyof CognitiveWorkspaceState>(
    field: K,
    updates: Partial<CognitiveWorkspaceState[K]>,
    source: string,
    reason?: string,
  ): void {
    const currentValue = this.state[field]
    if (typeof currentValue !== 'object' || currentValue === null) {
      throw new Error(`Cannot merge into non-object field: ${String(field)}`)
    }

    const merged = { ...currentValue, ...updates }
    this.setField(field, merged as CognitiveWorkspaceState[K], source, reason)
  }

  /**
   * Subscribe to state changes
   */
  public subscribe(
    callback: (state: Readonly<CognitiveWorkspaceState>, change: WorkspaceChange) => void,
    pathFilter?: string[],
  ): string {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const subscription: WorkspaceSubscription = {
      id: subscriptionId,
      callback,
      pathFilter,
      filter: (change: WorkspaceChange) => {
        if (!pathFilter) return true
        return change.changedPaths.some((path) => pathFilter.includes(path))
      },
    }

    this.subscriptions.set(subscriptionId, subscription)
    return subscriptionId
  }

  /**
   * Unsubscribe from state changes
   */
  public unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId)
  }

  /**
   * Record a decision in decision history
   */
  public recordDecision(
    decision: string,
    reasoning: string,
    confidence: 'high' | 'medium' | 'low' | 'unknown',
    basedOn?: string[],
  ): void {
    const decisionId = `dec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    this.state.decisionHistory.push({
      decisionId,
      timestamp: Date.now(),
      decision,
      reasoning,
      confidence,
      basedOn: basedOn || Object.keys(WORKSPACE_PATHS),
    })

    // Keep history bounded
    if (this.state.decisionHistory.length > 1000) {
      this.state.decisionHistory = this.state.decisionHistory.slice(-500)
    }
  }

  /**
   * Get recent decisions
   */
  public getRecentDecisions(count: number = 10): typeof this.state.decisionHistory {
    return this.state.decisionHistory.slice(-count)
  }

  /**
   * Reset to empty state
   */
  public reset(userId?: string): void {
    const oldState = this.state
    this.state = createEmptyWorkspaceState(userId)
    this.changeHistory = []
    this.updateQueue = []

    const change: WorkspaceChange = {
      timestamp: Date.now(),
      source: 'SYSTEM',
      changedPaths: Object.keys(oldState),
      previousValues: oldState,
      newValues: this.state,
      reason: 'Workspace reset',
    }

    this.emitChange(change)
  }

  /**
   * Get change history
   */
  public getChangeHistory(count: number = 50): WorkspaceChange[] {
    return this.changeHistory.slice(-count)
  }

  /**
   * Get workspace diagnostics
   */
  public getDiagnostics() {
    const selfModel = this.state.selfModel
    return {
      stateSnapshot: this.getState(),
      subscriptionCount: this.subscriptions.size,
      updateQueueSize: this.updateQueue.length,
      changeHistorySize: this.changeHistory.length,
      decisionHistorySize: this.state.decisionHistory.length,
      readinessScore: this.state.readinessScore,
      currentMood: this.state.emotionalState.currentMood,
      confidence: this.state.emotionalState.confidence,
      activeTaskState: this.state.activeTask?.state || 'none',
      selfModelBeliefCount: selfModel?.beliefCount ?? 0,
      selfModelContradictions: selfModel?.contradictionCount ?? 0,
      selfModelCoherence: selfModel?.coherenceScore ?? 0,
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────

  private async processUpdateQueue(): Promise<void> {
    while (this.updateQueue.length > 0) {
      const update = this.updateQueue.shift()
      if (update) {
        this.processUpdate(update)
      }
    }
  }

  private processUpdate(update: WorkspaceUpdate): void {
    const previousState = JSON.parse(JSON.stringify(this.state))

    // Apply updates
    Object.entries(update.updates).forEach(([key, value]) => {
      ;(this.state as any)[key] = value
    })

    this.state.lastUpdatedAt = Date.now()

    // Detect changes
    const changedPaths: string[] = []
    const previousValues: Record<string, any> = {}
    const newValues: Record<string, any> = {}

    Object.entries(update.updates).forEach(([key, value]) => {
      if (previousState[key] !== value) {
        changedPaths.push(key)
        previousValues[key] = previousState[key]
        newValues[key] = value
      }
    })

    if (changedPaths.length > 0) {
      const change: WorkspaceChange = {
        timestamp: Date.now(),
        source: update.source,
        changedPaths,
        previousValues,
        newValues,
        reason: update.reason,
      }

      this.emitChange(change)
    }
  }

  private emitChange(change: WorkspaceChange): void {
    // Store in history
    this.changeHistory.push(change)
    if (this.changeHistory.length > this.maxHistorySize) {
      this.changeHistory = this.changeHistory.slice(-Math.ceil(this.maxHistorySize * 0.8))
    }

    // Notify subscribers
    this.subscriptions.forEach((subscription) => {
      try {
        if (subscription.filter && !subscription.filter(change)) {
          return
        }
        subscription.callback(this.getState(), change)
      } catch (error) {
        console.error(`[CognitiveWorkspace] Subscriber error in ${subscription.id}:`, error)
      }
    })
  }
}

/**
 * Singleton controller instance
 */
let globalController: CognitiveWorkspaceController | null = null

/**
 * Get or create the global controller
 */
export function getCognitiveWorkspace(userId?: string): CognitiveWorkspaceController {
  if (!globalController) {
    globalController = new CognitiveWorkspaceController(userId)
  }
  return globalController
}

/**
 * Reset the global controller (for testing)
 */
export function resetCognitiveWorkspace(userId?: string): void {
  if (globalController) {
    globalController.reset(userId)
  } else {
    globalController = new CognitiveWorkspaceController(userId)
  }
}

export { CognitiveWorkspaceController }
export default CognitiveWorkspaceController
