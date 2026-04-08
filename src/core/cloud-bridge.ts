/**
 * Omni-Learning Agent — Cloud Bridge
 * ====================================
 * Routes media stages to local or cloud (Supabase GPU queue) based on policy.
 * Now fully connected to Supabase!
 */

import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { MediaRuntimePolicy, MediaStageType } from './media-ml/types'

class CloudBridge {
  private isOnline = false
  private lastCheck = 0
  private checkIntervalMs = 30_000 // check connectivity every 30s

  // ── Connectivity ──────────────────────────────────────────────────────────

  async checkOnline(): Promise<boolean> {
    const now = Date.now()
    if (now - this.lastCheck < this.checkIntervalMs) return this.isOnline

    try {
      const { error } = await supabase.from('user_profiles').select('id').limit(1)
      this.isOnline = !error
    } catch {
      this.isOnline = false
    }

    this.lastCheck = now
    return this.isOnline
  }

  // ── Runtime Selection ─────────────────────────────────────────────────────

  chooseRuntime(
    stageType: MediaStageType,
    policy: MediaRuntimePolicy
  ): 'local' | 'cloud' {
    if (policy.mode === 'local-only') return 'local'
    if (policy.mode === 'cloud-only') return 'cloud'

    // Auto: heavy stages prefer cloud (when online), light stages stay local.
    // Image and video are the primary GPU-offload targets.
    const cloudPreferredStages: MediaStageType[] = ['image', 'video', 'avatar']
    const alwaysLocalStages: MediaStageType[] = ['script', 'camera']

    if (alwaysLocalStages.includes(stageType)) return 'local'
    if (!this.isOnline) return 'local'

    if (stageType === 'image') {
      return policy.quality === 'draft' ? 'local' : 'cloud'
    }

    if (cloudPreferredStages.includes(stageType)) return 'cloud'

    return 'local' // Default to local
  }

  // ── GPU Job Queue (Submit a job to Supabase for cloud rendering) ──────────

  async submitGpuJob(payload: {
    mediaJobId: string
    stageType: string
    prompt: string
    inputUrls?: string[]
    modelName?: string
    maxRetries?: number
  }): Promise<string | null> {
    return db.media.queueGpuJob(payload)
  }

  async pollGpuJob(gpuJobId: string): Promise<{
    status: 'queued' | 'processing' | 'done' | 'failed'
    resultUrl?: string
    error?: string
    retryCount?: number
    maxRetries?: number
    workerId?: string
    lastHeartbeatAt?: string
  } | null> {
    const result = await db.media.pollGpuJob(gpuJobId)
    if (!result) return null
    return {
      status: result.status as 'queued' | 'processing' | 'done' | 'failed',
      resultUrl: result.result_url ?? undefined,
      error: result.error ?? undefined,
      retryCount: result.retry_count ?? undefined,
      maxRetries: result.max_retries ?? undefined,
      workerId: result.worker_id ?? undefined,
      lastHeartbeatAt: result.last_heartbeat_at ?? undefined,
    }
  }

  async retryGpuJobOrDeadLetter(gpuJobId: string, reason: string): Promise<{ retried: boolean; deadLettered: boolean; retryCount: number; maxRetries: number }> {
    return db.media.retryGpuJobOrDeadLetter(gpuJobId, reason)
  }

  async recoverStaleGpuJobs(staleAfterMinutes = 10): Promise<number> {
    return db.media.recoverStaleGpuJobs(staleAfterMinutes)
  }

  async heartbeatGpuJob(gpuJobId: string, workerId: string): Promise<void> {
    await db.media.heartbeatGpuJob(gpuJobId, workerId)
  }

  async logWorkerHeartbeat(workerId: string, status = 'online', metadata?: Record<string, unknown>): Promise<void> {
    await db.workers.heartbeat(workerId, status, metadata)
  }

  // ── Real-time Subscription (Listen for GPU job completion) ───────────────

  subscribeToGpuJob(
    gpuJobId: string,
    onUpdate: (status: string, resultUrl?: string) => void
  ) {
    const channel = supabase
      .channel(`gpu_job_${gpuJobId}`)
      .on(
        'postgres_changes' as never,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gpu_job_queue',
          filter: `id=eq.${gpuJobId}`,
        },
        (payload: { new: { status: string; result_url?: string } }) => {
          onUpdate(payload.new.status, payload.new.result_url)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }

  // ── Media Job Persistence ─────────────────────────────────────────────────

  async saveMediaJobStart(prompt: string, mode: string, quality: string): Promise<string | null> {
    return db.media.createJob({ prompt, mode, quality, status: 'running' })
  }

  async saveMediaJobComplete(jobId: string, success: boolean, error?: string) {
    await db.media.updateJob(jobId, {
      status: success ? 'completed' : 'failed',
      completed_at: new Date().toISOString(),
      error,
    })
  }

  // ── Task Logging ──────────────────────────────────────────────────────────

  async logTask(command: string, intent: string, status: string, durationMs?: number) {
    await db.tasks.log({ command, intent, status, duration_ms: durationMs })
  }

  // ── User Memory ───────────────────────────────────────────────────────────

  async rememberUserFact(key: string, value: string, type: 'habit' | 'preference' | 'fact' | 'goal' | 'mood_pattern' = 'fact') {
    await db.memory.upsert({ memory_type: type, key, value })
  }

  async getUserMemory(): Promise<Record<string, string>> {
    const memories = await db.memory.getAll()
    return Object.fromEntries(memories.map((m: { key: string; value: string }) => [m.key, m.value]))
  }

  // ── Mood ──────────────────────────────────────────────────────────────────

  async logMood(mood: string, energy: number, detectedFrom = 'message_tone') {
    await db.mood.log({ mood, energy, detected_from: detectedFrom })
  }
}

export const cloudBridge = new CloudBridge()
