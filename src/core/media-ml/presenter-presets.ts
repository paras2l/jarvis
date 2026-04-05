/**
 * Presenter Presets & Avatar Configuration (Phase 4)
 *
 * Defines avatar personas and voice pairings for digital human generation:
 * - Pre-configured presenter templates (professional, casual, energetic, etc.)
 * - Avatar + voice + camera style combinations
 * - Social media format presets (YouTube, TikTok, LinkedIn, etc.)
 */

export type PresenterStyle = 'professional' | 'casual' | 'energetic' | 'warm' | 'authoritative'

export type SocialFormat = 'youtube' | 'tiktok' | 'linkedin' | 'instagram' | 'twitter' | 'generic'

export interface AvatarConfig {
  name: string
  avatarModel: 'liveportrait' | 'hallo' | 'realistic' | 'cartoon'
  voiceProfile: string // references VoiceConfig.id
  style: PresenterStyle
  cameraAngle: 'straight-on' | 'slight-angle' | 'side-profile'
  gestures: 'minimal' | 'natural' | 'expressive'
  backgroundType: 'solid' | 'office' | 'studio' | 'outdoor'
  lightingPreset: 'warm' | 'cool' | 'neutral' | 'cinematic'
}

export interface VoiceConfig {
  id: string
  name: string
  language: string
  gender: string
  age?: string
  accent?: string
  speed: number // 0.8-1.5
  pitch: number // 0.8-1.2
  provider: 'web-speech' | 'kokoro' | 'xtts' // xtts is cloud
}

export interface FormatPreset {
  format: SocialFormat
  title: string
  dimensions: { width: number; height: number }
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3'
  duration: { min: number; max: number } // seconds
  recommendedStyle: PresenterStyle
  recommendedAvatar: string // ref to avatar config
  suggestedSceneCount: number
}

const AVATAR_CONFIGS: Record<string, AvatarConfig> = {
  'professional-alex': {
    name: 'Professional Alex',
    avatarModel: 'liveportrait',
    voiceProfile: 'voice-alex-pro',
    style: 'professional',
    cameraAngle: 'straight-on',
    gestures: 'natural',
    backgroundType: 'office',
    lightingPreset: 'neutral',
  },
  'casual-jordan': {
    name: 'Casual Jordan',
    avatarModel: 'hallo',
    voiceProfile: 'voice-jordan-casual',
    style: 'casual',
    cameraAngle: 'slight-angle',
    gestures: 'expressive',
    backgroundType: 'studio',
    lightingPreset: 'warm',
  },
  'energetic-taylor': {
    name: 'Energetic Taylor',
    avatarModel: 'hallo',
    voiceProfile: 'voice-taylor-energetic',
    style: 'energetic',
    cameraAngle: 'slight-angle',
    gestures: 'expressive',
    backgroundType: 'studio',
    lightingPreset: 'cinematic',
  },
  'warm-morgan': {
    name: 'Warm Morgan',
    avatarModel: 'liveportrait',
    voiceProfile: 'voice-morgan-warm',
    style: 'warm',
    cameraAngle: 'slight-angle',
    gestures: 'natural',
    backgroundType: 'outdoor',
    lightingPreset: 'warm',
  },
  'authoritative-sam': {
    name: 'Authoritative Sam',
    avatarModel: 'realistic',
    voiceProfile: 'voice-sam-authority',
    style: 'authoritative',
    cameraAngle: 'straight-on',
    gestures: 'minimal',
    backgroundType: 'office',
    lightingPreset: 'cool',
  },
}

const VOICE_CONFIGS: Record<string, VoiceConfig> = {
  'voice-alex-pro': {
    id: 'voice-alex-pro',
    name: 'Alex Professional',
    language: 'en',
    gender: 'neutral',
    accent: 'american',
    speed: 1.0,
    pitch: 1.0,
    provider: 'kokoro',
  },
  'voice-jordan-casual': {
    id: 'voice-jordan-casual',
    name: 'Jordan Casual',
    language: 'en',
    gender: 'any',
    speed: 1.05,
    pitch: 0.95,
    provider: 'kokoro',
  },
  'voice-taylor-energetic': {
    id: 'voice-taylor-energetic',
    name: 'Taylor Energetic',
    language: 'en',
    gender: 'any',
    speed: 1.15,
    pitch: 1.05,
    provider: 'kokoro',
  },
  'voice-morgan-warm': {
    id: 'voice-morgan-warm',
    name: 'Morgan Warm',
    language: 'en',
    gender: 'any',
    speed: 0.95,
    pitch: 1.1,
    provider: 'kokoro',
  },
  'voice-sam-authority': {
    id: 'voice-sam-authority',
    name: 'Sam Authority',
    language: 'en',
    gender: 'any',
    speed: 0.9,
    pitch: 0.9,
    provider: 'xtts', // Cloud provider for authoritative tone
  },
}

const FORMAT_PRESETS: Record<SocialFormat, FormatPreset> = {
  youtube: {
    format: 'youtube',
    title: 'YouTube Video',
    dimensions: { width: 1920, height: 1080 },
    aspectRatio: '16:9',
    duration: { min: 180, max: 900 }, // 3-15 minutes
    recommendedStyle: 'professional',
    recommendedAvatar: 'professional-alex',
    suggestedSceneCount: 5,
  },
  tiktok: {
    format: 'tiktok',
    title: 'TikTok Short',
    dimensions: { width: 1080, height: 1920 },
    aspectRatio: '9:16',
    duration: { min: 15, max: 60 }, // 15-60 seconds
    recommendedStyle: 'energetic',
    recommendedAvatar: 'energetic-taylor',
    suggestedSceneCount: 3,
  },
  linkedin: {
    format: 'linkedin',
    title: 'LinkedIn Post',
    dimensions: { width: 1200, height: 627 },
    aspectRatio: '16:9',
    duration: { min: 30, max: 300 }, // 30 seconds to 5 minutes
    recommendedStyle: 'professional',
    recommendedAvatar: 'professional-alex',
    suggestedSceneCount: 4,
  },
  instagram: {
    format: 'instagram',
    title: 'Instagram Reel',
    dimensions: { width: 1080, height: 1920 },
    aspectRatio: '9:16',
    duration: { min: 15, max: 90 }, // 15-90 seconds
    recommendedStyle: 'casual',
    recommendedAvatar: 'casual-jordan',
    suggestedSceneCount: 3,
  },
  twitter: {
    format: 'twitter',
    title: 'Twitter/X Video',
    dimensions: { width: 1280, height: 720 },
    aspectRatio: '16:9',
    duration: { min: 30, max: 120 }, // 30-120 seconds
    recommendedStyle: 'energetic',
    recommendedAvatar: 'energetic-taylor',
    suggestedSceneCount: 2,
  },
  generic: {
    format: 'generic',
    title: 'Generic Format',
    dimensions: { width: 1920, height: 1080 },
    aspectRatio: '16:9',
    duration: { min: 60, max: 600 },
    recommendedStyle: 'professional',
    recommendedAvatar: 'professional-alex',
    suggestedSceneCount: 4,
  },
}

class PresenterPresets {
  /**
   * Get avatar configuration by name
   */
  getAvatar(avatarId: string): AvatarConfig | undefined {
    return AVATAR_CONFIGS[avatarId]
  }

  /**
   * List all available avatars
   */
  listAvatars(): AvatarConfig[] {
    return Object.values(AVATAR_CONFIGS)
  }

  /**
   * Get voice configuration by ID
   */
  getVoice(voiceId: string): VoiceConfig | undefined {
    return VOICE_CONFIGS[voiceId]
  }

  /**
   * List all available voices
   */
  listVoices(): VoiceConfig[] {
    return Object.values(VOICE_CONFIGS)
  }

  /**
   * Get format preset (YouTube, TikTok, etc.)
   */
  getFormat(format: SocialFormat): FormatPreset {
    return FORMAT_PRESETS[format] || FORMAT_PRESETS.generic
  }

  /**
   * Get recommended avatar for a style
   */
  getAvatarForStyle(style: PresenterStyle): AvatarConfig {
    const matches = Object.values(AVATAR_CONFIGS).filter((a) => a.style === style)
    return matches.length > 0 ? matches[0] : AVATAR_CONFIGS['professional-alex']!
  }

  /**
   * Get recommended preset for a format
   */
  getPresetForFormat(format: SocialFormat): AvatarConfig {
    const preset = FORMAT_PRESETS[format]
    return this.getAvatar(preset.recommendedAvatar) || AVATAR_CONFIGS['professional-alex']!
  }

  /**
   * Suggest avatar based on content type
   */
  suggestAvatar(contentType: string): AvatarConfig {
    const suggestions: Record<string, string> = {
      tutorial: 'casual-jordan',
      news: 'authoritative-sam',
      promotion: 'energetic-taylor',
      interview: 'warm-morgan',
      product: 'professional-alex',
    }

    const avatarId = suggestions[contentType.toLowerCase()] || 'professional-alex'
    return AVATAR_CONFIGS[avatarId] || AVATAR_CONFIGS['professional-alex']!
  }
}

export const presenterPresets = new PresenterPresets()
