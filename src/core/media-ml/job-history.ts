import { MediaJobRequest, MediaJobResult } from './types'

export interface StoredJobRecord {
  id: string
  prompt: string
  mode: 'auto' | 'local-only' | 'cloud-only'
  quality: 'draft' | 'standard' | 'premium'
  result: MediaJobResult
  createdAt: string
  completedAt: string
  retryCount: number
}

const STORAGE_KEY = 'antigravity.media.job-history'
const MAX_STORED_JOBS = 50

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

class JobHistory {
  loadHistory(): StoredJobRecord[] {
    const storage = safeStorage()
    if (!storage) return []

    try {
      const raw = storage.getItem(STORAGE_KEY)
      if (!raw) return []

      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  saveJob(
    id: string,
    request: MediaJobRequest,
    result: MediaJobResult,
    retryCount: number = 0
  ): void {
    const storage = safeStorage()
    if (!storage) return

    const record: StoredJobRecord = {
      id,
      prompt: request.prompt,
      mode: request.policy?.mode ?? 'auto',
      quality: request.policy?.quality ?? 'draft',
      result,
      createdAt: new Date().toISOString(),
      completedAt: result.completedAt,
      retryCount,
    }

    const history = this.loadHistory()
    history.unshift(record)

    const trimmed = history.slice(0, MAX_STORED_JOBS)

    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    } catch {
      // Quota exceeded or other storage error
    }
  }

  clearHistory(): void {
    const storage = safeStorage()
    if (!storage) return

    try {
      storage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore
    }
  }

  getJobById(jobId: string): StoredJobRecord | undefined {
    const history = this.loadHistory()
    return history.find((job) => job.id === jobId)
  }
}

export const jobHistory = new JobHistory()
