/**
 * Task Queue System
 * 
 * Sits between Planning and Action layers.
 * 
 * Flow: Planning Engine creates goals
 *       ↓
 *       Task Queue prioritizes and schedules
 *       ↓
 *       Action Layer executes
 * 
 * Enables:
 * - Parallel task execution
 * - Retry logic with exponential backoff
 * - Task scheduling and dependencies
 * - Priority-based execution
 * - Cancellation and preemption
 */

import { getCognitiveWorkspace } from './workspace_controller.ts'
import type { ActiveTask } from './workspace_state.ts'

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'queued' | 'scheduled' | 'executing' | 'retrying' | 'completed' | 'failed' | 'cancelled'
export type RetryStrategy = 'none' | 'linear' | 'exponential'

/**
 * Task Metadata
 */
export interface QueuedTask extends ActiveTask {
  queueId: string
  priority: TaskPriority
  queueStatus: TaskStatus
  
  // Retry configuration
  retryStrategy: RetryStrategy
  maxRetries: number
  retryCount: number
  retryDelay: number // ms
  
  // Dependencies
  dependsOn?: string[] // taskIds this task depends on
  
  // Scheduling
  scheduledFor?: number // timestamp when to execute
  timeout?: number // ms, max execution time
  
  // Execution context
  attemptNumber: number
  lastAttemptTime?: number
  nextRetryTime?: number
  
  // Tags for filtering
  tags?: string[]
}

/**
 * Task Queue Configuration
 */
export interface TaskQueueConfig {
  maxConcurrent: number // Max parallel tasks
  checkInterval: number // ms between queue checks
  enableAutoRetry: boolean
  defaultRetryStrategy: RetryStrategy
  defaultMaxRetries: number
}

/**
 * Task Queue Manager
 * 
 * Central task scheduling and execution coordinator
 */
export class TaskQueueManager {
  private workspace = getCognitiveWorkspace()
  private queue: Map<string, QueuedTask> = new Map()
  private executing: Set<string> = new Set()
  private config: TaskQueueConfig = {
    maxConcurrent: 4,
    checkInterval: 100,
    enableAutoRetry: true,
    defaultRetryStrategy: 'exponential',
    defaultMaxRetries: 3,
  }
  private checkInterval: ReturnType<typeof setInterval> | null = null

  constructor(config?: Partial<TaskQueueConfig>) {
    this.config = { ...this.config, ...config }
    this.startQueueProcessor()
  }

  /**
   * Add task to queue
   */
  public async enqueueTask(task: Omit<QueuedTask, 'queueId'>): Promise<string> {
    const queueId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const queuedTask: QueuedTask = {
      ...task,
      queueId,
      queueStatus: 'queued',
      retryCount: 0,
      attemptNumber: 1,
      retryDelay: task.retryDelay || 1000,
      retryStrategy: task.retryStrategy || this.config.defaultRetryStrategy,
      maxRetries: task.maxRetries ?? this.config.defaultMaxRetries,
    }

    this.queue.set(queueId, queuedTask)

    // Update workspace
    await this.workspace.updateState({
      source: 'TASK_QUEUE',
      updates: {
        activeTask: {
          ...queuedTask,
          state: 'planning' as const,
          progress: 0,
        },
      },
      reason: `Task queued: ${task.name}`,
    })

    return queueId
  }

  /**
   * Get task from queue
   */
  public getTask(queueId: string): QueuedTask | undefined {
    return this.queue.get(queueId)
  }

  /**
   * Get all queued tasks (not executing)
   */
  public getQueuedTasks(filters?: { priority?: TaskPriority; tags?: string[] }): QueuedTask[] {
    let tasks = Array.from(this.queue.values()).filter((t) => t.queueStatus === 'queued')

    if (filters?.priority) {
      tasks = tasks.filter((t) => t.priority === filters.priority)
    }

    if (filters?.tags) {
      tasks = tasks.filter((t) => t.tags?.some((tag) => filters.tags!.includes(tag)))
    }

    return tasks
  }

  /**
   * Get executing tasks
   */
  public getExecutingTasks(): QueuedTask[] {
    return Array.from(this.executing).map((id) => this.queue.get(id)!).filter(Boolean)
  }

  /**
   * Mark task as executing
   */
  public async startExecution(queueId: string): Promise<void> {
    const task = this.queue.get(queueId)
    if (!task) return

    this.executing.add(queueId)
    task.queueStatus = 'executing'
    task.lastAttemptTime = Date.now()
    task.attemptNumber += 1

    await this.workspace.updateState({
      source: 'TASK_QUEUE',
      updates: {
        activeTask: {
          ...task,
          state: 'executing' as const,
          progress: 0,
        },
      },
      reason: `Execution started: ${task.name} (attempt ${task.attemptNumber})`,
    })
  }

  /**
   * Mark task as completed
   */
  public async completeTask(queueId: string, result?: any): Promise<void> {
    const task = this.queue.get(queueId)
    if (!task) return

    this.executing.delete(queueId)
    task.queueStatus = 'completed'
    task.progress = 100

    await this.workspace.updateState({
      source: 'TASK_QUEUE',
      updates: {
        activeTask: {
          ...task,
          state: 'completed' as const,
          progress: 100,
          outputContext: result,
        },
      },
      reason: `Task completed: ${task.name}`,
    })
  }

  /**
   * Mark task as failed (may retry)
   */
  public async failTask(queueId: string, error: string): Promise<void> {
    const task = this.queue.get(queueId)
    if (!task) return

    this.executing.delete(queueId)
    task.error = error
    task.retryCount += 1

    // Check if should retry
    if (
      this.config.enableAutoRetry &&
      task.retryCount < task.maxRetries
    ) {
      await this.scheduleRetry(queueId)
    } else {
      task.queueStatus = 'failed'
      await this.workspace.updateState({
        source: 'TASK_QUEUE',
        updates: {
          activeTask: {
            ...task,
            state: 'failed' as const,
            error: `Failed after ${task.retryCount} attempts: ${error}`,
          },
        },
        reason: `Task failed: ${task.name}`,
      })
    }
  }

  /**
   * Schedule retry with backoff
   */
  private async scheduleRetry(queueId: string): Promise<void> {
    const task = this.queue.get(queueId)
    if (!task) return

    let delay = task.retryDelay

    if (task.retryStrategy === 'exponential') {
      delay = task.retryDelay * Math.pow(2, task.retryCount - 1)
    } else if (task.retryStrategy === 'linear') {
      delay = task.retryDelay * task.retryCount
    }

    task.queueStatus = 'retrying'
    task.nextRetryTime = Date.now() + delay

    await this.workspace.updateState({
      source: 'TASK_QUEUE',
      updates: {
        activeTask: {
          ...task,
          state: 'blocked' as const,
          progress: 50,
        },
      },
      reason: `Scheduled retry attempt ${task.retryCount + 1} in ${delay}ms`,
    })
  }

  /**
   * Cancel task
   */
  public async cancelTask(queueId: string): Promise<void> {
    const task = this.queue.get(queueId)
    if (!task) return

    this.executing.delete(queueId)
    task.queueStatus = 'cancelled'

    await this.workspace.updateState({
      source: 'TASK_QUEUE',
      updates: {
        activeTask: {
          ...task,
          state: 'failed' as const,
          error: 'Task cancelled by user',
        },
      },
      reason: `Task cancelled: ${task.name}`,
    })
  }

  /**
   * Set task priority
   */
  public setPriority(queueId: string, priority: TaskPriority): void {
    const task = this.queue.get(queueId)
    if (task) {
      task.priority = priority
    }
  }

  /**
   * Process queue: move tasks from queued → executing
   */
  private processQueue(): void {
    // Get tasks ready to execute
    const readyTasks = Array.from(this.queue.values()).filter((task) => {
      // Either queued or retrying and time has passed
      if (task.queueStatus === 'queued') return true
      if (
        task.queueStatus === 'retrying' &&
        task.nextRetryTime &&
        Date.now() >= task.nextRetryTime
      ) {
        task.queueStatus = 'scheduled'
        return true
      }
      return false
    })

    // Check dependencies
    const executableTasks = readyTasks.filter((task) => {
      if (!task.dependsOn || task.dependsOn.length === 0) return true

      return task.dependsOn.every((depId) => {
        const depTask = this.queue.get(depId)
        return depTask?.queueStatus === 'completed'
      })
    })

    // Sort by priority
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 }
    executableTasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

    // Execute up to maxConcurrent
    const availableSlots = this.config.maxConcurrent - this.executing.size
    const toExecute = executableTasks.slice(0, availableSlots)

    toExecute.forEach((task) => {
      this.emitTaskReady(task)
    })
  }

  /**
   * Emit when task is ready to execute
   */
  private emitTaskReady(task: QueuedTask): void {
    // This would be caught by action layer listeners
    // emit('taskQueue:ready', task)
    console.log(`[TaskQueue] Ready to execute: ${task.name} (priority: ${task.priority})`)
  }

  /**
   * Start queue processor loop
   */
  private startQueueProcessor(): void {
    this.checkInterval = setInterval(() => {
      this.processQueue()
    }, this.config.checkInterval)
  }

  /**
   * Stop queue processor
   */
  public stopQueueProcessor(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  /**
   * Get queue diagnostics
   */
  public getDiagnostics() {
    return {
      totalQueued: Array.from(this.queue.values()).length,
      currentlyExecuting: this.executing.size,
      queued: this.getQueuedTasks(),
      executing: this.getExecutingTasks(),
      config: this.config,
      queueHealth: {
        avgWaitTime: this.calculateAvgWaitTime(),
        retryRate: this.calculateRetryRate(),
        failureRate: this.calculateFailureRate(),
      },
    }
  }

  private calculateAvgWaitTime(): number {
    const executing = this.getExecutingTasks()
    if (executing.length === 0) return 0
    const now = Date.now()
    const waitTimes = executing.map((t) => now - (t.startTime || 0))
    return waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
  }

  private calculateRetryRate(): number {
    const allTasks = Array.from(this.queue.values())
    const retriedTasks = allTasks.filter((t) => t.retryCount > 0)
    return allTasks.length > 0 ? retriedTasks.length / allTasks.length : 0
  }

  private calculateFailureRate(): number {
    const allTasks = Array.from(this.queue.values())
    const failedTasks = allTasks.filter((t) => t.queueStatus === 'failed')
    return allTasks.length > 0 ? failedTasks.length / allTasks.length : 0
  }
}

/**
 * Singleton task queue instance
 */
let globalTaskQueue: TaskQueueManager | null = null

export function getTaskQueue(config?: Partial<TaskQueueConfig>): TaskQueueManager {
  if (!globalTaskQueue) {
    globalTaskQueue = new TaskQueueManager(config)
  }
  return globalTaskQueue
}

export function resetTaskQueue(config?: Partial<TaskQueueConfig>): TaskQueueManager {
  globalTaskQueue?.stopQueueProcessor()
  globalTaskQueue = new TaskQueueManager(config)
  return globalTaskQueue
}

export default TaskQueueManager
