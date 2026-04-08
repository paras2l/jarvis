import { selfModelFuzzyMatcher } from './fuzzy_matcher'
import type { PlatformId } from '@/core/platform/types'
import type { SelfGoal, SelfTask, TaskStatus } from './self_state_schema'

export interface TaskResolution {
  intent: string
  canonicalAction: string
  confidence: number
  target?: string
  params?: Record<string, unknown>
}

export class SelfTaskManager {
  private tasks = new Map<string, SelfTask>()
  private goals = new Map<string, SelfGoal>()

  listTasks(): SelfTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  listGoals(): SelfGoal[] {
    return Array.from(this.goals.values()).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async resolveFromInput(input: string, platform?: PlatformId): Promise<TaskResolution> {
    const result = await selfModelFuzzyMatcher.resolve(input, platform)
    return {
      intent: result.intent,
      canonicalAction: result.canonicalAction,
      confidence: result.confidence,
      target: result.target,
      params: result.params,
    }
  }

  createTask(input: {
    description: string
    canonicalAction: string
    confidence: number
    priority?: number
    goalId?: string
    context?: Record<string, unknown>
  }): SelfTask {
    const now = Date.now()
    const task: SelfTask = {
      id: `self_task_${now}_${Math.random().toString(36).slice(2, 7)}`,
      description: input.description,
      canonicalAction: input.canonicalAction,
      status: 'pending',
      priority: input.priority ?? 50,
      confidence: input.confidence,
      goalId: input.goalId,
      context: input.context,
      createdAt: now,
      updatedAt: now,
    }

    this.tasks.set(task.id, task)
    return task
  }

  setTaskStatus(taskId: string, status: TaskStatus, context?: Record<string, unknown>): SelfTask | undefined {
    const task = this.tasks.get(taskId)
    if (!task) return undefined

    const updated: SelfTask = {
      ...task,
      status,
      context: {
        ...(task.context || {}),
        ...(context || {}),
      },
      updatedAt: Date.now(),
    }

    this.tasks.set(taskId, updated)
    return updated
  }

  upsertGoal(goal: Omit<SelfGoal, 'updatedAt'>): SelfGoal {
    const now = Date.now()
    const existing = this.goals.get(goal.id)
    const next: SelfGoal = {
      ...goal,
      progress: Math.max(0, Math.min(1, goal.progress)),
      updatedAt: now,
    }

    if (existing) {
      const merged: SelfGoal = {
        ...existing,
        ...next,
        updatedAt: now,
      }
      this.goals.set(goal.id, merged)
      return merged
    }

    this.goals.set(goal.id, next)
    return next
  }
}

export const selfTaskManager = new SelfTaskManager()
