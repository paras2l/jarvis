import { MediaQuality } from './types'

export interface CinematicProfile {
  profile: 'cinematic-draft' | 'cinematic-standard' | 'cinematic-premium'
  motionTemplate: 'ken-burns-soft' | 'dolly-in' | 'pan-left' | 'pan-right'
  transitions: 'soft-fade' | 'cross-dissolve' | 'cinematic-cut'
  colorGrade: 'neutral' | 'teal-orange' | 'warm-film'
  targetFps: number
  resolutionLabel: '480p' | '720p' | '1080p'
  etaSeconds: number
}

const QUALITY_TO_PROFILE: Record<MediaQuality, CinematicProfile> = {
  draft: {
    profile: 'cinematic-draft',
    motionTemplate: 'ken-burns-soft',
    transitions: 'soft-fade',
    colorGrade: 'neutral',
    targetFps: 24,
    resolutionLabel: '480p',
    etaSeconds: 20,
  },
  standard: {
    profile: 'cinematic-standard',
    motionTemplate: 'dolly-in',
    transitions: 'cross-dissolve',
    colorGrade: 'teal-orange',
    targetFps: 30,
    resolutionLabel: '720p',
    etaSeconds: 45,
  },
  premium: {
    profile: 'cinematic-premium',
    motionTemplate: 'pan-right',
    transitions: 'cinematic-cut',
    colorGrade: 'warm-film',
    targetFps: 60,
    resolutionLabel: '1080p',
    etaSeconds: 90,
  },
}

class CinematicFx {
  resolveProfile(quality: MediaQuality): CinematicProfile {
    return QUALITY_TO_PROFILE[quality]
  }

  summarize(profile: CinematicProfile): string {
    return [
      `${profile.profile}`,
      `${profile.resolutionLabel}@${profile.targetFps}fps`,
      `motion:${profile.motionTemplate}`,
      `transition:${profile.transitions}`,
      `grade:${profile.colorGrade}`,
    ].join(' | ')
  }
}

export const cinematicFx = new CinematicFx()
