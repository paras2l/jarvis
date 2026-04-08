import { cloudBridge } from '../cloud-bridge'
import { cinematicFx } from './cinematic-fx'
import { MediaRuntimePolicy, MediaStageRequest, MediaStageType } from './types'

export interface CloudStagePayload {
  stageId: string
  stageType: MediaStageType
  prompt: string
  inputAssetUris?: string[]
  modelName?: string
}

export interface CloudJobCreateRequest {
  jobId: string
  stage: CloudStagePayload
  policy: MediaRuntimePolicy
}

export interface CloudJobCreateResponse {
  accepted: boolean
  remoteJobId: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  message?: string
}

export interface CloudJobStatusResponse {
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress: number
  message: string
  artifactUri?: string
  previewUri?: string
  modelVersion?: string
}

export interface DeadLetterEntry {
  gpuJobId: string
  mediaJobId: string
  stageType: MediaStageType
  prompt: string
  modelName?: string
  reason: string
  createdAt: string
  inputAssetUris?: string[]
}

const DEAD_LETTER_STORAGE_KEY = 'antigravity.media.deadletters'

class MediaCloudClient {
  private readonly simulatedPollCounts = new Map<string, number>()
  private readonly realtimeStatus = new Map<string, { status: 'queued' | 'running' | 'completed' | 'failed'; progress: number; resultUrl?: string }>()
  private readonly unsubscribers = new Map<string, () => void>()
  private readonly stageMeta = new Map<string, {
    mediaJobId: string
    stageType: MediaStageType
    prompt: string
    inputAssetUris?: string[]
    modelName?: string
  }>()
  private readonly transientFailures = new Map<string, number>()

  isConfigured(): boolean {
    return true
  }

  async createStageJob(payload: CloudJobCreateRequest): Promise<CloudJobCreateResponse> {
    try {
      const mediaJobId = await cloudBridge.saveMediaJobStart(
        payload.stage.prompt,
        'cloud',
        payload.policy.quality,
      )
      const effectiveMediaJobId = mediaJobId ?? payload.jobId

      const gpuJobId = await cloudBridge.submitGpuJob({
        mediaJobId: effectiveMediaJobId,
        stageType: payload.stage.stageType,
        prompt: payload.stage.prompt,
        inputUrls: payload.stage.inputAssetUris,
        modelName: payload.stage.modelName,
      })

      if (gpuJobId) {
        this.stageMeta.set(gpuJobId, {
          mediaJobId: effectiveMediaJobId,
          stageType: payload.stage.stageType,
          prompt: payload.stage.prompt,
          inputAssetUris: payload.stage.inputAssetUris,
          modelName: payload.stage.modelName,
        })
        this.ensureRealtimeSubscription(gpuJobId)
        return {
          accepted: true,
          remoteJobId: gpuJobId,
          status: 'queued',
          message: 'Stage queued in Supabase GPU queue.',
        }
      }

      return {
        accepted: false,
        remoteJobId: '',
        status: 'failed',
        message: 'Supabase worker queue unavailable. GPU stage could not be queued.',
      }
    } catch (error) {
      return {
        accepted: false,
        remoteJobId: '',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Cloud job creation failed.',
      }
    }
  }

  async pollStageJob(remoteJobId: string, stage: MediaStageRequest): Promise<CloudJobStatusResponse> {
    if (remoteJobId.startsWith('sim-')) {
      const currentPolls = (this.simulatedPollCounts.get(remoteJobId) ?? 0) + 1
      this.simulatedPollCounts.set(remoteJobId, currentPolls)
      const profile = cinematicFx.resolveProfile(
        stage.qualityProfile === 'cinematic-premium'
          ? 'premium'
          : stage.qualityProfile === 'cinematic-standard'
            ? 'standard'
            : 'draft',
      )

      await new Promise((resolve) => setTimeout(resolve, 1100))

      if (currentPolls < 3) {
        return {
          status: 'running',
          progress: 25 + currentPolls * 20,
          message: `No-GPU cinematic pipeline rendering preview sequence (${cinematicFx.summarize(profile)}).`,
          modelVersion: 'cinematic-fx-v1',
        }
      }

      this.simulatedPollCounts.delete(remoteJobId)
      return {
        status: 'completed',
        progress: 100,
        message: `Cinematic no-GPU completion for ${stage.type} (${profile.resolutionLabel}).`,
        artifactUri: `cloud://media/${remoteJobId}/artifact`,
        previewUri: `cloud://media/${remoteJobId}/preview`,
        modelVersion: stage.type === 'video' ? 'cinematic-fx-v1' : 'golden-cloud-v1',
      }
    }

    try {
      const live = this.realtimeStatus.get(remoteJobId)
      if (live) {
        if (live.status === 'failed') {
          await this.markFailed(remoteJobId, 'Remote worker reported failed status.')
          this.cleanupRealtime(remoteJobId)
          return {
            status: 'failed',
            progress: 0,
            message: 'Remote worker failed the stage.',
          }
        }

        if (live.status === 'completed') {
          await this.markCompleted(remoteJobId)
          this.cleanupRealtime(remoteJobId)
          return {
            status: 'completed',
            progress: 100,
            message: 'Remote worker completed stage.',
            artifactUri: live.resultUrl,
            previewUri: live.resultUrl,
            modelVersion: 'gpu-worker-v1',
          }
        }

        return {
          status: 'running',
          progress: live.progress,
          message: live.status === 'running'
            ? 'Remote worker is rendering the stage...'
            : 'Stage queued in remote worker queue...',
          modelVersion: 'gpu-worker-v1',
        }
      }

      const gpuResult = await cloudBridge.pollGpuJob(remoteJobId)
      if (!gpuResult) {
        return {
          status: 'running',
          progress: 20,
          message: 'Waiting for remote worker to pick up the stage...',
          modelVersion: 'cloud-worker-pending',
        }
      }

      if (gpuResult.status === 'failed') {
        const failureReason = gpuResult.error ?? 'Remote worker failed the stage.'
        const retryOutcome = await cloudBridge.retryGpuJobOrDeadLetter(remoteJobId, failureReason)
        if (retryOutcome.retried) {
          return {
            status: 'running',
            progress: 25,
            message: `Retry queued (${retryOutcome.retryCount}/${retryOutcome.maxRetries}) after worker failure.`,
            modelVersion: 'gpu-worker-v1',
          }
        }

        await this.markFailed(remoteJobId, failureReason)
        this.cleanupRealtime(remoteJobId)
        return {
          status: 'failed',
          progress: 0,
          message: retryOutcome.deadLettered
            ? `Dead-lettered after ${retryOutcome.retryCount}/${retryOutcome.maxRetries} attempts: ${failureReason}`
            : failureReason,
        }
      }

      if (gpuResult.status === 'done') {
        await this.markCompleted(remoteJobId)
        this.cleanupRealtime(remoteJobId)
        return {
          status: 'completed',
          progress: 100,
          message: 'Remote worker completed stage.',
          artifactUri: gpuResult.resultUrl,
          previewUri: gpuResult.resultUrl,
          modelVersion: 'gpu-worker-v1',
        }
      }

      return {
        status: 'running',
        progress: gpuResult.status === 'processing' ? 65 : 35,
        message: gpuResult.status === 'processing'
          ? 'Remote worker is rendering the stage...'
          : 'Stage queued in remote worker queue...',
        modelVersion: 'gpu-worker-v1',
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Cloud status polling failed.'
      const failures = (this.transientFailures.get(remoteJobId) ?? 0) + 1
      this.transientFailures.set(remoteJobId, failures)

      if (failures >= 5) {
        await this.markFailed(remoteJobId, `Polling exhausted after ${failures} failures: ${errorMessage}`)
        this.cleanupRealtime(remoteJobId)
        return {
          status: 'failed',
          progress: 0,
          message: `Polling exhausted after ${failures} failures: ${errorMessage}`,
        }
      }

      return {
        status: 'running',
        progress: 20,
        message: `Transient polling issue (${failures}/5): ${errorMessage}`,
      }
    }
  }

  private ensureRealtimeSubscription(gpuJobId: string): void {
    if (this.unsubscribers.has(gpuJobId)) return

    const unsubscribe = cloudBridge.subscribeToGpuJob(gpuJobId, (status, resultUrl) => {
      if (status === 'failed') {
        this.realtimeStatus.set(gpuJobId, { status: 'failed', progress: 0, resultUrl })
        return
      }

      if (status === 'done') {
        this.realtimeStatus.set(gpuJobId, { status: 'completed', progress: 100, resultUrl })
        return
      }

      if (status === 'processing') {
        this.realtimeStatus.set(gpuJobId, { status: 'running', progress: 70, resultUrl })
        return
      }

      this.realtimeStatus.set(gpuJobId, { status: 'queued', progress: 30, resultUrl })
    })

    this.unsubscribers.set(gpuJobId, unsubscribe)
  }

  private cleanupRealtime(gpuJobId: string): void {
    const unsub = this.unsubscribers.get(gpuJobId)
    if (unsub) unsub()
    this.unsubscribers.delete(gpuJobId)
    this.realtimeStatus.delete(gpuJobId)
    this.transientFailures.delete(gpuJobId)
  }

  private async markCompleted(gpuJobId: string): Promise<void> {
    const meta = this.stageMeta.get(gpuJobId)
    if (!meta) return
    await cloudBridge.saveMediaJobComplete(meta.mediaJobId, true)
    this.stageMeta.delete(gpuJobId)
  }

  private async markFailed(gpuJobId: string, reason: string): Promise<void> {
    const meta = this.stageMeta.get(gpuJobId)
    if (meta) {
      await cloudBridge.saveMediaJobComplete(meta.mediaJobId, false, reason)
      this.recordDeadLetter({
        gpuJobId,
        mediaJobId: meta.mediaJobId,
        stageType: meta.stageType,
        prompt: meta.prompt,
        modelName: meta.modelName,
        reason,
        createdAt: new Date().toISOString(),
        inputAssetUris: meta.inputAssetUris,
      })
      this.stageMeta.delete(gpuJobId)
    }
  }

  listDeadLetters(): DeadLetterEntry[] {
    return this.readDeadLetters()
  }

  clearDeadLetters(): void {
    this.writeDeadLetters([])
  }

  async replayDeadLetter(gpuJobId: string): Promise<{ ok: boolean; message: string; remoteJobId?: string }> {
    const deadLetters = this.readDeadLetters()
    const entry = deadLetters.find((item) => item.gpuJobId === gpuJobId)
    if (!entry) {
      return { ok: false, message: 'Dead-letter entry not found.' }
    }

    try {
      const replayGpuJobId = await cloudBridge.submitGpuJob({
        mediaJobId: entry.mediaJobId,
        stageType: entry.stageType,
        prompt: entry.prompt,
        inputUrls: entry.inputAssetUris,
        modelName: entry.modelName,
      })

      if (!replayGpuJobId) {
        return { ok: false, message: 'Remote queue unavailable for replay.' }
      }

      this.stageMeta.set(replayGpuJobId, {
        mediaJobId: entry.mediaJobId,
        stageType: entry.stageType,
        prompt: entry.prompt,
        inputAssetUris: entry.inputAssetUris,
        modelName: entry.modelName,
      })
      this.ensureRealtimeSubscription(replayGpuJobId)
      this.removeDeadLetter(gpuJobId)

      return {
        ok: true,
        message: `Replay queued for ${entry.stageType} stage.`,
        remoteJobId: replayGpuJobId,
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Dead-letter replay failed.',
      }
    }
  }

  private recordDeadLetter(entry: DeadLetterEntry): void {
    const current = this.readDeadLetters()
    current.unshift(entry)
    this.writeDeadLetters(current.slice(0, 50))
  }

  private removeDeadLetter(gpuJobId: string): void {
    const current = this.readDeadLetters()
    this.writeDeadLetters(current.filter((entry) => entry.gpuJobId !== gpuJobId))
  }

  private readDeadLetters(): DeadLetterEntry[] {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem(DEAD_LETTER_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed as DeadLetterEntry[]
    } catch {
      return []
    }
  }

  private writeDeadLetters(entries: DeadLetterEntry[]): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(DEAD_LETTER_STORAGE_KEY, JSON.stringify(entries))
    } catch {
      // Ignore localStorage failures.
    }
  }
}

export const mediaCloudClient = new MediaCloudClient()
