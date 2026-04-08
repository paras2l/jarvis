export type TaskPriority = 'low' | 'normal' | 'high' | 'critical'
export type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface TaskContract {
  id: string
  title: string
  description: string
  sourceLayer: string
  priority: TaskPriority
  status: TaskStatus
  createdAt: number
  updatedAt: number
  metadata?: Record<string, unknown>
}

export function validateTaskContract(input: unknown): input is TaskContract {
  if (!input || typeof input !== 'object') return false
  const value = input as Partial<TaskContract>
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.sourceLayer === 'string' &&
    typeof value.priority === 'string' &&
    typeof value.status === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  )
}
