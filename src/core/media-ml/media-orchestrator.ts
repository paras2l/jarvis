import { cloudBridge } from '../cloud-bridge'
import { mediaCloudClient } from './cloud-client'
import { cloudMediaRuntime, localMediaRuntime } from './runtimes/mock-runtimes'
import { pythonLocalImageRuntime } from './runtimes/python-local-image-runtime'
import { localVoiceRuntime } from './runtimes/local-voice-runtime'
import { localVideoRuntime } from './runtimes/local-video-runtime'
import { jobHistory } from './job-history'
import { safetyFilter } from './safety-filter'
import { costController } from './cost-controller'
import {
  MediaJobRequest,
  MediaJobResult,
  MediaRuntimeAdapter,
  MediaRuntimePolicy,
  MediaStageProgress,
  MediaStageRequest,
  MediaStageResult,
  MediaStageType,
} from './types'

const DEFAULT_POLICY: MediaRuntimePolicy = {
  mode: 'auto',
  quality: 'draft',
  timeoutMs: 120000,
}

function makeStageId(stageType: MediaStageType): string {
  return `${stageType}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function makeDefaultStages(prompt: string): MediaStageRequest[] {
  return [
    { id: makeStageId('script'), type: 'script', prompt, status: 'pending' },
    { id: makeStageId('voice'), type: 'voice', prompt, status: 'pending' },
    { id: makeStageId('avatar'), type: 'avatar', prompt, status: 'pending' },
    { id: makeStageId('video'), type: 'video', prompt, status: 'pending' },
  ]
}

class MediaOrchestrator {
  private readonly runtimes: MediaRuntimeAdapter[] = [
    pythonLocalImageRuntime,
    localVoiceRuntime,
    localVideoRuntime,
    localMediaRuntime,
    cloudMediaRuntime,
  ]

  async runJob(request: MediaJobRequest): Promise<MediaJobResult> {
    const startedAt = new Date().toISOString()
    const jobId = request.id ?? `media-job-${Date.now()}`
    const policy = request.policy ?? DEFAULT_POLICY
    const stages = request.stages ?? makeDefaultStages(request.prompt)
    const stageResults: MediaStageResult[] = []
    const retryCount = request.retryCount ?? 0

    // Check safety filter
    const safetyCheck = safetyFilter.checkPrompt(request.prompt)
    if (safetyCheck.recommendedAction === 'block') {
      return {
        jobId,
        success: false,
        startedAt,
        completedAt: new Date().toISOString(),
        results: [],
        error: `Safety check failed: ${safetyCheck.violations[0]?.reason || 'Content violates policy'}`,
      }
    }

    // Check cost if cloud mode
    if (policy.mode === 'cloud-only' || policy.mode === 'auto') {
      // Estimate total cost across all stages
      let estimatedCost = 0
      for (const stage of stages) {
        const estimate = costController.estimateStageCost(stage.type, 'default')
        estimatedCost += estimate.estimatedCredits
      }

      const affordability = costController.canAffordJob(estimatedCost)
      if (!affordability.canAfford) {
        return {
          jobId,
          success: false,
          startedAt,
          completedAt: new Date().toISOString(),
          results: [],
          error: affordability.reason || 'Insufficient budget for job',
        }
      }
    }

    for (const stage of stages) {
      const runtime = cloudBridge.chooseRuntime(stage.type, policy)
      const selectedRuntime = this.findRuntime(runtime, stage.type)

      if (!selectedRuntime) {
        const error = `No runtime adapter found for stage ${stage.type} (${runtime}).`
        this.emitProgress({
          jobId,
          stageId: stage.id,
          stageType: stage.type,
          runtime,
          status: 'failed',
          progress: 0,
          message: error,
          updatedAt: new Date().toISOString(),
        })
        return {
          jobId,
          success: false,
          startedAt,
          completedAt: new Date().toISOString(),
          results: stageResults,
          error,
        }
      }

      const validation = selectedRuntime.validateInput(stage)
      if (!validation.valid) {
        const error = validation.message ?? `Invalid input for stage ${stage.type}.`
        this.emitProgress({
          jobId,
          stageId: stage.id,
          stageType: stage.type,
          runtime,
          status: 'failed',
          progress: 0,
          message: error,
          updatedAt: new Date().toISOString(),
        })
        return {
          jobId,
          success: false,
          startedAt,
          completedAt: new Date().toISOString(),
          results: stageResults,
          error,
        }
      }

      this.emitProgress({
        jobId,
        stageId: stage.id,
        stageType: stage.type,
        runtime,
        status: 'running',
        progress: 10,
        message: `${selectedRuntime.name} started ${stage.type} stage.`,
        updatedAt: new Date().toISOString(),
      })

      const result = runtime === 'cloud'
        ? await this.runCloudStage(jobId, stage, policy)
        : await selectedRuntime.run(stage, jobId)
      stageResults.push(result)

      this.emitProgress({
        jobId,
        stageId: stage.id,
        stageType: stage.type,
        runtime,
        status: result.success ? 'completed' : 'failed',
        progress: result.success ? 100 : 0,
        message: result.success
          ? `${stage.type} stage completed (${result.modelVersion}).`
          : `${stage.type} stage failed.`,
        updatedAt: new Date().toISOString(),
      })

      if (!result.success) {
        return {
          jobId,
          success: false,
          startedAt,
          completedAt: new Date().toISOString(),
          results: stageResults,
          error: `Stage ${stage.type} failed.`,
        }
      }
    }

    const result: MediaJobResult = {
      jobId,
      success: true,
      startedAt,
      completedAt: new Date().toISOString(),
      results: stageResults,
    }

    jobHistory.saveJob(jobId, request, result, retryCount)

    // Record cost usage for cloud stages
    if (result.success && result.results) {
      for (const stageResult of result.results) {
        if (stageResult.runtime === 'cloud') {
          // Estimate cost for this stage
          const estimate = costController.estimateStageCost(
            stageResult.stageType,
            stageResult.modelVersion || 'default'
          )
          costController.recordUsage(jobId, stageResult.stageType, estimate.estimatedCredits)
        }
      }
    }

    return result
  }

  private findRuntime(runtimeTarget: 'local' | 'cloud', stageType: MediaStageType): MediaRuntimeAdapter | undefined {
    return this.runtimes.find((adapter) => adapter.target === runtimeTarget && adapter.supportedStages.includes(stageType))
  }

  private async runCloudStage(
    jobId: string,
    stage: MediaStageRequest,
    policy: MediaRuntimePolicy,
  ): Promise<MediaStageResult> {
    const startedAt = Date.now()

    const createResponse = await mediaCloudClient.createStageJob({
      jobId,
      policy,
      stage: {
        stageId: stage.id,
        stageType: stage.type,
        prompt: stage.prompt,
        inputAssetUris: stage.inputAssetUris,
      },
    })

    if (!createResponse.accepted) {
      return {
        stageId: stage.id,
        stageType: stage.type,
        runtime: 'cloud',
        success: false,
        warnings: [createResponse.message ?? 'Cloud job rejected.'],
        durationMs: Date.now() - startedAt,
        modelVersion: 'cloud-unavailable',
      }
    }

    let attempts = 0
    const maxAttempts = 6
    let latestMessage = createResponse.message ?? 'Cloud job queued.'
    let artifactUri: string | undefined
    let previewUri: string | undefined
    let modelVersion = 'golden-cloud-v1'

    while (attempts < maxAttempts) {
      attempts += 1
      const status = await mediaCloudClient.pollStageJob(createResponse.remoteJobId, stage)
      latestMessage = status.message
      artifactUri = status.artifactUri ?? artifactUri
      previewUri = status.previewUri ?? previewUri
      modelVersion = status.modelVersion ?? modelVersion

      this.emitProgress({
        jobId,
        stageId: stage.id,
        stageType: stage.type,
        runtime: 'cloud',
        status: status.status === 'queued' ? 'running' : status.status,
        progress: Math.max(10, Math.min(100, status.progress)),
        message: status.message,
        updatedAt: new Date().toISOString(),
      })

      if (status.status === 'completed') {
        return {
          stageId: stage.id,
          stageType: stage.type,
          runtime: 'cloud',
          success: true,
          artifactUri,
          previewUri,
          durationMs: Date.now() - startedAt,
          modelVersion,
        }
      }

      if (status.status === 'failed') {
        return {
          stageId: stage.id,
          stageType: stage.type,
          runtime: 'cloud',
          success: false,
          warnings: [status.message],
          durationMs: Date.now() - startedAt,
          modelVersion,
        }
      }
    }

    return {
      stageId: stage.id,
      stageType: stage.type,
      runtime: 'cloud',
      success: false,
      warnings: [latestMessage, 'Cloud stage timed out while polling.'],
      durationMs: Date.now() - startedAt,
      modelVersion,
    }
  }

  private emitProgress(payload: MediaStageProgress): void {
    if (typeof window === 'undefined') return

    window.dispatchEvent(new CustomEvent('media:progress', { detail: payload }))

    window.dispatchEvent(new CustomEvent('agent:canvas-update', {
      detail: {
        type: 'media',
        title: `Media Job ${payload.jobId}`,
        content: `${payload.stageType.toUpperCase()} [${payload.runtime}] ${payload.status}: ${payload.message}`,
        lastUpdated: new Date().toLocaleTimeString(),
      },
    }))

    window.dispatchEvent(new CustomEvent('agent-canvas-update', {
      detail: {
        type: 'media',
        title: `Media Job ${payload.jobId}`,
        content: `${payload.stageType.toUpperCase()} [${payload.runtime}] ${payload.status}: ${payload.message}`,
        lastUpdated: new Date().toLocaleTimeString(),
      },
    }))
  }
}

export const mediaOrchestrator = new MediaOrchestrator()
