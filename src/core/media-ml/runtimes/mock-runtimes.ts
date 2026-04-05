import {
  MediaQuality,
  MediaRuntimeAdapter,
  MediaStageRequest,
  MediaStageResult,
  MediaStageType,
  RuntimeEstimate,
} from '../types'

function getModelVersion(stageType: MediaStageType, target: 'local' | 'cloud'): string {
  if (stageType === 'voice') return target === 'local' ? 'kokoro-preview-v1' : 'xtts-cloud-v1'
  if (stageType === 'video') return target === 'local' ? 'animdiff-preview-v1' : 'cogvideo-gpu-v1'
  if (stageType === 'avatar') return target === 'local' ? 'liveportrait-lite-v1' : 'liveportrait-hq-v1'
  if (stageType === 'image') return target === 'local' ? 'sdxl-turbo-v1' : 'flux-proxy-v1'
  return target === 'local' ? 'local-template-v1' : 'cloud-template-v1'
}

function makeArtifactUri(jobId: string, stage: MediaStageRequest, target: 'local' | 'cloud'): string {
  const scheme = target === 'local' ? 'local://media' : 'cloud://media'
  return `${scheme}/${jobId}/${stage.type}/${stage.id}`
}

function makePreviewText(stage: MediaStageRequest): string {
  const normalized = stage.prompt.trim().replace(/\s+/g, ' ')
  return [
    `Scene Goal: ${normalized}`,
    'Shot 1: Establishing shot with soft cinematic lighting.',
    'Shot 2: Mid shot with actor motion and focused expression.',
    'Shot 3: Close-up with emotional voice emphasis.',
    'Camera: Slow dolly-in, 24fps, smooth easing.',
  ].join('\n')
}

function estimateBase(stage: MediaStageType): number {
  if (stage === 'script') return 150
  if (stage === 'voice') return 700
  if (stage === 'image') return 1200
  if (stage === 'avatar') return 1800
  if (stage === 'camera') return 450
  return 2500
}

class MockRuntime implements MediaRuntimeAdapter {
  constructor(
    public readonly name: string,
    public readonly target: 'local' | 'cloud',
    public readonly supportedStages: MediaStageType[],
    private readonly speedMultiplier: number,
    private readonly creditMultiplier: number,
  ) {}

  validateInput(stage: MediaStageRequest): { valid: boolean; message?: string } {
    if (!stage.prompt || stage.prompt.trim().length < 3) {
      return { valid: false, message: 'Prompt too short for media generation.' }
    }
    return { valid: true }
  }

  estimateCost(stage: MediaStageRequest, quality: MediaQuality): RuntimeEstimate {
    const qualityFactor = quality === 'draft' ? 0.7 : quality === 'standard' ? 1 : 1.5
    const latencyMs = Math.round(estimateBase(stage.type) * this.speedMultiplier * qualityFactor)
    const credits = Math.max(1, Math.round((estimateBase(stage.type) / 1000) * this.creditMultiplier * qualityFactor))
    return { credits, latencyMs }
  }

  async run(stage: MediaStageRequest, jobId: string): Promise<MediaStageResult> {
    const startedAt = Date.now()
    const estimate = this.estimateCost(stage, 'standard')

    if (this.target === 'local' && stage.type === 'voice' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(stage.prompt.slice(0, 220))
      utterance.rate = 1
      utterance.pitch = 1
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
      await new Promise((resolve) => setTimeout(resolve, 300))
    } else {
      await new Promise((resolve) => setTimeout(resolve, estimate.latencyMs))
    }

    const localScriptPreview = this.target === 'local' && stage.type === 'script'
      ? `data:text/plain;charset=utf-8,${encodeURIComponent(makePreviewText(stage))}`
      : undefined

    return {
      stageId: stage.id,
      stageType: stage.type,
      runtime: this.target,
      success: true,
      artifactUri: makeArtifactUri(jobId, stage, this.target),
      previewUri: localScriptPreview ?? (makeArtifactUri(jobId, stage, this.target) + '/preview'),
      warnings: this.target === 'local' ? ['Preview quality mode used.'] : [],
      durationMs: Date.now() - startedAt,
      modelVersion: getModelVersion(stage.type, this.target),
    }
  }
}

export const localMediaRuntime = new MockRuntime(
  'Local Media Runtime',
  'local',
  ['script', 'voice', 'image', 'video', 'avatar', 'camera'],
  0.75,
  0,
)

export const cloudMediaRuntime = new MockRuntime(
  'Golden Power Cloud Runtime',
  'cloud',
  ['script', 'voice', 'image', 'video', 'avatar', 'camera'],
  1.1,
  2,
)
