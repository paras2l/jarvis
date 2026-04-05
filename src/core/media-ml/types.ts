export type MediaStageType = 'script' | 'voice' | 'image' | 'video' | 'avatar' | 'camera'

export type MediaRuntimeTarget = 'local' | 'cloud'

export type MediaStageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type MediaQuality = 'draft' | 'standard' | 'premium'

export interface MediaRuntimePolicy {
  mode: 'auto' | 'local-only' | 'cloud-only'
  quality: MediaQuality
  maxBudgetCredits?: number
  timeoutMs?: number
}

export interface MediaStageRequest {
  id: string
  type: MediaStageType
  prompt: string
  inputAssetUris?: string[]
  runtime?: MediaRuntimeTarget
  status: MediaStageStatus
}

export interface MediaJobRequest {
  id?: string
  prompt: string
  stages?: MediaStageRequest[]
  policy?: MediaRuntimePolicy
  retryCount?: number
}

export interface MediaStageProgress {
  jobId: string
  stageId: string
  stageType: MediaStageType
  runtime: MediaRuntimeTarget
  status: MediaStageStatus
  progress: number
  message: string
  updatedAt: string
}

export interface MediaStageResult {
  stageId: string
  stageType: MediaStageType
  runtime: MediaRuntimeTarget
  success: boolean
  artifactUri?: string
  previewUri?: string
  warnings?: string[]
  durationMs: number
  modelVersion: string
  error?: string // Error message if stage failed
}

export interface MediaJobResult {
  jobId: string
  success: boolean
  startedAt: string
  completedAt: string
  results: MediaStageResult[]
  error?: string
}

export interface RuntimeEstimate {
  credits: number
  latencyMs: number
}

export interface MediaRuntimeAdapter {
  name: string
  target: MediaRuntimeTarget
  supportedStages: MediaStageType[]
  validateInput(stage: MediaStageRequest): { valid: boolean; message?: string }
  estimateCost(stage: MediaStageRequest, quality: MediaQuality): RuntimeEstimate
  run(stage: MediaStageRequest, jobId: string): Promise<MediaStageResult>
}
