import { MediaRuntimePolicy, MediaStageRequest, MediaStageType } from './types'

export interface CloudStagePayload {
  stageId: string
  stageType: MediaStageType
  prompt: string
  inputAssetUris?: string[]
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

function getCloudEdgeEndpoint(): string | null {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_MEDIA_CLOUD_EDGE_URL
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()

  try {
    const fromStorage = window.localStorage.getItem('antigravity.media.cloud.edgeUrl')
    return fromStorage && fromStorage.trim() ? fromStorage.trim() : null
  } catch {
    return null
  }
}

class MediaCloudClient {
  isConfigured(): boolean {
    return Boolean(getCloudEdgeEndpoint())
  }

  async createStageJob(payload: CloudJobCreateRequest): Promise<CloudJobCreateResponse> {
    const endpoint = getCloudEdgeEndpoint()
    if (!endpoint) {
      return {
        accepted: true,
        remoteJobId: `sim-${payload.jobId}-${payload.stage.stageId}`,
        status: 'queued',
        message: 'Cloud endpoint not configured. Using simulated cloud job.',
      }
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createMediaJob', payload }),
      })

      if (!response.ok) {
        return {
          accepted: false,
          remoteJobId: '',
          status: 'failed',
          message: `Cloud intake failed: ${response.status} ${response.statusText}`,
        }
      }

      const data = await response.json() as Partial<CloudJobCreateResponse>
      return {
        accepted: data.accepted ?? true,
        remoteJobId: data.remoteJobId ?? `remote-${payload.jobId}-${payload.stage.stageId}`,
        status: data.status ?? 'queued',
        message: data.message,
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
    const endpoint = getCloudEdgeEndpoint()
    if (!endpoint) {
      await new Promise((resolve) => setTimeout(resolve, 1100))
      return {
        status: 'completed',
        progress: 100,
        message: `Simulated cloud completion for ${stage.type}.`,
        artifactUri: `cloud://media/${remoteJobId}/artifact`,
        previewUri: `cloud://media/${remoteJobId}/preview`,
        modelVersion: stage.type === 'video' ? 'cogvideo-gpu-v1' : 'golden-cloud-v1',
      }
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getMediaJobStatus', payload: { remoteJobId } }),
      })

      if (!response.ok) {
        return {
          status: 'failed',
          progress: 0,
          message: `Cloud status failed: ${response.status} ${response.statusText}`,
        }
      }

      const data = await response.json() as Partial<CloudJobStatusResponse>
      return {
        status: data.status ?? 'running',
        progress: data.progress ?? 0,
        message: data.message ?? 'Cloud worker running...',
        artifactUri: data.artifactUri,
        previewUri: data.previewUri,
        modelVersion: data.modelVersion,
      }
    } catch (error) {
      return {
        status: 'failed',
        progress: 0,
        message: error instanceof Error ? error.message : 'Cloud status polling failed.',
      }
    }
  }
}

export const mediaCloudClient = new MediaCloudClient()
