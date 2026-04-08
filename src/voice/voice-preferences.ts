import { speechSynthesisRuntime, type VoicePersonality } from '@/voice/speech-synthesis'

export interface VoicePreferences {
  personality: VoicePersonality
  volumeLevel: number // 0-1
  pitchMultiplier: number // 0.5-2
  rateMultiplier: number // 0.5-2
  enableAutoPersonality: boolean // Auto-adapt personality to context
}

const DEFAULT_PREFERENCES: VoicePreferences = {
  personality: 'cute',
  volumeLevel: 0.97,
  pitchMultiplier: 1.0,
  rateMultiplier: 1.0,
  enableAutoPersonality: true,
}

const VOICE_PREFS_KEY = 'jarvis:voice-preferences'

class VoicePreferencesManager {
  private prefs: VoicePreferences = { ...DEFAULT_PREFERENCES }

  constructor() {
    this.loadPreferences()
    this.applyPreferences()
  }

  /**
   * Load preferences from localStorage
   */
  private loadPreferences(): void {
    try {
      const stored = localStorage.getItem(VOICE_PREFS_KEY)
      if (stored) {
        this.prefs = { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) }
      }
    } catch (err) {
      console.error('Failed to load voice preferences:', err)
      this.prefs = { ...DEFAULT_PREFERENCES }
    }
  }

  /**
   * Save preferences to localStorage
   */
  private savePreferences(): void {
    try {
      localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify(this.prefs))
    } catch (err) {
      console.error('Failed to save voice preferences:', err)
    }
  }

  /**
   * Apply current preferences to the speech runtime
   */
  private applyPreferences(): void {
    speechSynthesisRuntime.setPersonality(this.prefs.personality)
  }

  /**
   * Get all preferences
   */
  getPreferences(): VoicePreferences {
    return { ...this.prefs }
  }

  /**
   * Set personality (cute, professional, warm, energetic, calm)
   */
  setPersonality(personality: VoicePersonality): void {
    this.prefs.personality = personality
    this.applyPreferences()
    this.savePreferences()
  }

  /**
   * Get current personality
   */
  getPersonality(): VoicePersonality {
    return this.prefs.personality
  }

  /**
   * Quick switch to cute voice (sweet female tone)
   */
  switchToCuteVoice(): void {
    this.setPersonality('cute')
  }

  /**
   * Quick switch to professional voice
   */
  switchToProfessionalVoice(): void {
    this.setPersonality('professional')
  }

  /**
   * Quick switch to warm voice
   */
  switchToWarmVoice(): void {
    this.setPersonality('warm')
  }

  /**
   * Quick switch to energetic voice
   */
  switchToEnergeticVoice(): void {
    this.setPersonality('energetic')
  }

  /**
   * Quick switch to calm voice
   */
  switchToCalmVoice(): void {
    this.setPersonality('calm')
  }

  /**
   * Set volume level (0-1)
   */
  setVolumeLevel(volume: number): void {
    this.prefs.volumeLevel = Math.max(0, Math.min(1, volume))
    this.savePreferences()
  }

  /**
   * Get volume level
   */
  getVolumeLevel(): number {
    return this.prefs.volumeLevel
  }

  /**
   * Set pitch multiplier for accent/personality (0.5-2)
   */
  setPitchMultiplier(multiplier: number): void {
    this.prefs.pitchMultiplier = Math.max(0.5, Math.min(2, multiplier))
    this.savePreferences()
  }

  /**
   * Get pitch multiplier
   */
  getPitchMultiplier(): number {
    return this.prefs.pitchMultiplier
  }

  /**
   * Set rate multiplier for speed (0.5-2)
   */
  setRateMultiplier(multiplier: number): void {
    this.prefs.rateMultiplier = Math.max(0.5, Math.min(2, multiplier))
    this.savePreferences()
  }

  /**
   * Get rate multiplier
   */
  getRateMultiplier(): number {
    return this.prefs.rateMultiplier
  }

  /**
   * Enable/disable auto-personality adaptation
   */
  setAutoPersonality(enabled: boolean): void {
    this.prefs.enableAutoPersonality = enabled
    this.savePreferences()
  }

  /**
   * Check if auto-personality is enabled
   */
  isAutoPersonalityEnabled(): boolean {
    return this.prefs.enableAutoPersonality
  }

  /**
   * Reset to default preferences
   */
  resetToDefaults(): void {
    this.prefs = { ...DEFAULT_PREFERENCES }
    this.applyPreferences()
    this.savePreferences()
  }

  /**
   * Get a description of current personality settings
   */
  describe(): string {
    const personality = this.prefs.personality
    const descriptions: Record<VoicePersonality, string> = {
      cute: '🎀 Sweet & Cute - Friendly, higher pitch, warm tone',
      warm: '🌞 Warm & Friendly - Approachable, natural warmth',
      professional: '💼 Professional - Clear, neutral, business-ready',
      energetic: '⚡ Energetic & Dynamic - Fast-paced, exciting delivery',
      calm: '🧘 Calm & Peaceful - Slow, soothing, relaxing',
    }
    return descriptions[personality]
  }
}

export const voicePreferencesManager = new VoicePreferencesManager()
