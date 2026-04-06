import {
  MediaQuality,
  MediaRuntimeAdapter,
  MediaStageType,
  MediaStageRequest,
  MediaStageResult,
  RuntimeEstimate,
} from '../types'
import { mediaCloudClient } from '../cloud-client'

function selectVideoModelName(stage: MediaStageRequest): string {
  if (stage.qualityProfile === 'cinematic-premium') return 'wan-v2'
  if (stage.qualityProfile === 'cinematic-standard') return 'wan-v1'
  return 'ltx-video-fast'
}

/**
 * Dedicated cloud video adapter.
 * It keeps video stage logic isolated so we can later swap WAN/LTX engines
 * without touching orchestrator flow.
 */
class CloudVideoRuntime implements MediaRuntimeAdapter {
  readonly name = 'Supabase Cloud Video Runtime'
  readonly target = 'cloud'
  readonly supportedStages: MediaStageType[] = ['video']

  validateInput(stage: MediaStageRequest): { valid: boolean; message?: string } {
    if (stage.type !== 'video') {
      return { valid: false, message: 'CloudVideoRuntime only supports video stage.' }
    }
    if (!stage.prompt || stage.prompt.trim().length < 3) {
      return { valid: false, message: 'Video prompt too short.' }
    }
    return { valid: true }
  }

  estimateCost(stage: MediaStageRequest, quality: MediaQuality): RuntimeEstimate {
    const baseLatency = quality === 'premium' ? 90000 : quality === 'standard' ? 45000 : 20000
    const credits = quality === 'premium' ? 700 : quality === 'standard' ? 350 : 150
    if (stage.qualityProfile === 'cinematic-premium') {
      return { credits: credits + 120, latencyMs: baseLatency + 15000 }
    }
    return { credits, latencyMs: baseLatency }
  }

  async run(stage: MediaStageRequest, jobId: string): Promise<MediaStageResult> {
    const startedAt = Date.now()

    const createResponse = await mediaCloudClient.createStageJob({
      jobId,
      policy: {
        mode: 'cloud-only',
        quality: stage.qualityProfile === 'cinematic-premium'
          ? 'premium'
          : stage.qualityProfile === 'cinematic-standard'
            ? 'standard'
            : 'draft',
      },
      stage: {
        stageId: stage.id,
        stageType: stage.type,
        prompt: stage.prompt,
        inputAssetUris: stage.inputAssetUris,
        modelName: selectVideoModelName(stage),
      },
    })

    if (!createResponse.accepted) {
      return {
        stageId: stage.id,
        stageType: stage.type,
        runtime: 'cloud',
        success: false,
        warnings: [createResponse.message ?? 'Cloud video intake rejected.'],
        durationMs: Date.now() - startedAt,
        modelVersion: 'cloud-video-rejected',
      }
    }

    for (let attempts = 0; attempts < 20; attempts++) {
      const status = await mediaCloudClient.pollStageJob(createResponse.remoteJobId, stage)

      if (status.status === 'completed') {
        return {
          stageId: stage.id,
          stageType: stage.type,
          runtime: 'cloud',
          success: true,
          artifactUri: status.artifactUri,
          previewUri: status.previewUri,
          durationMs: Date.now() - startedAt,
          modelVersion: status.modelVersion ?? 'cloud-video-v1',
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
          modelVersion: status.modelVersion ?? 'cloud-video-v1',
          error: status.message,
        }
      }

      const backoffMs = Math.min(5000, 500 + attempts * 250)
      await new Promise((resolve) => setTimeout(resolve, backoffMs))
    }

    return {
      stageId: stage.id,
      stageType: stage.type,
      runtime: 'cloud',
      success: false,
      warnings: ['Cloud video stage timed out.'],
      durationMs: Date.now() - startedAt,
      modelVersion: 'cloud-video-timeout',
      error: 'Cloud video stage timed out.',
    }
  }
}

export const cloudVideoRuntime = new CloudVideoRuntime()
