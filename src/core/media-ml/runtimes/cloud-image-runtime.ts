import {
  MediaQuality,
  MediaRuntimeAdapter,
  MediaStageRequest,
  MediaStageResult,
  MediaStageType,
  RuntimeEstimate,
} from '../types'
import { mediaCloudClient } from '../cloud-client'

function selectImageModelName(stage: MediaStageRequest): string {
  if (stage.qualityProfile === 'cinematic-premium') return 'sdxl-turbo'
  if (stage.qualityProfile === 'cinematic-standard') return 'sdxl-turbo'
  return 'sdxl-turbo'
}

/**
 * Dedicated cloud image adapter.
 * Routes image generation through the Supabase GPU worker queue so heavy
 * image jobs use remote GPU capacity instead of local fallback.
 */
class CloudImageRuntime implements MediaRuntimeAdapter {
  readonly name = 'Supabase Cloud Image Runtime'
  readonly target = 'cloud'
  readonly supportedStages: MediaStageType[] = ['image']

  validateInput(stage: MediaStageRequest): { valid: boolean; message?: string } {
    if (stage.type !== 'image') {
      return { valid: false, message: 'CloudImageRuntime only supports image stage.' }
    }
    if (!stage.prompt || stage.prompt.trim().length < 3) {
      return { valid: false, message: 'Image prompt too short.' }
    }
    return { valid: true }
  }

  estimateCost(stage: MediaStageRequest, quality: MediaQuality): RuntimeEstimate {
    const baseLatency = quality === 'premium' ? 45000 : quality === 'standard' ? 22000 : 12000
    const credits = quality === 'premium' ? 220 : quality === 'standard' ? 120 : 40
    return {
      credits: stage.qualityProfile === 'cinematic-premium' ? credits + 30 : credits,
      latencyMs: stage.qualityProfile === 'cinematic-premium' ? baseLatency + 8000 : baseLatency,
    }
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
        modelName: selectImageModelName(stage),
      },
    })

    if (!createResponse.accepted) {
      return {
        stageId: stage.id,
        stageType: stage.type,
        runtime: 'cloud',
        success: false,
        warnings: [createResponse.message ?? 'Cloud image intake rejected.'],
        durationMs: Date.now() - startedAt,
        modelVersion: 'cloud-image-rejected',
        error: createResponse.message,
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
          modelVersion: status.modelVersion ?? 'cloud-image-v1',
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
          modelVersion: status.modelVersion ?? 'cloud-image-v1',
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
      warnings: ['Cloud image stage timed out.'],
      durationMs: Date.now() - startedAt,
      modelVersion: 'cloud-image-timeout',
      error: 'Cloud image stage timed out.',
    }
  }
}

export const cloudImageRuntime = new CloudImageRuntime()