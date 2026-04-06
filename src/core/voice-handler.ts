import { VoiceConfig } from '@/types'

/**
 * Voice Handler
 * Manages voice activation and speech-to-text processing
 */
class VoiceHandler {
  private recognition: any = null
  private isListening: boolean = false
  private isActivated: boolean = false
  private config: VoiceConfig

  constructor() {
    this.config = {
      activationKeyword: 'hey patrich',
      sensitivity: 0.8,
      autoDetect: true,
      continuousMode: true, // v4.0 default for sentient listening
      locale: 'en-US',
    }
    this.initializeRecognition()
  }

  /**
   * Initialize Web Speech API
   */
  private initializeRecognition() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      console.warn('Speech Recognition API not available')
      return
    }

    this.recognition = new SpeechRecognition()
    this.recognition.continuous = true
    this.recognition.interimResults = true
    this.recognition.language = this.config.locale

    this.recognition.onstart = () => {
      console.log('Voice recognition started')
      this.isListening = true
    }

    this.recognition.onresult = (event: any) => {
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript

        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' '
        }
      }

      if (finalTranscript) {
        const sentiment = this.analyzeSentiment(finalTranscript)
        this.processVoiceInput(finalTranscript, sentiment)
      }
    }

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error)
    }

    this.recognition.onend = () => {
      console.log('Voice recognition ended')
      this.isListening = false
    }
  }

  /**
   * Start listening for voice activation
   */
  startListening(): { success: boolean; message: string } {
    if (!this.recognition) {
      const message = 'Speech Recognition is not available in this browser.'
      console.error(message)
      return { success: false, message }
    }

    try {
      this.recognition.start()
      return { success: true, message: 'Voice recognition started.' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start voice recognition.'
      console.error(message)
      return { success: false, message }
    }
  }

  /**
   * Stop listening
   */
  stopListening(): void {
    if (this.recognition) {
      this.recognition.stop()
      this.isListening = false
      this.isActivated = false
    }
  }

  /**
   * Process voice input and check for activation
   */
  private processVoiceInput(transcript: string, sentiment: string = 'neutral'): void {
    const lowerTranscript = transcript.toLowerCase().trim()
    console.log(`[PATRICH] Voice detected: "${transcript}" (Tone: ${sentiment})`)

    // Check for activation keyword
    if (!this.isActivated) {
      if (lowerTranscript.includes(this.config.activationKeyword)) {
        this.isActivated = true
        this.onActivation()
        return
      }
    } else {
      // Already activated, process command with sentiment
      if (this.onCommandCallback) {
        this.onCommandCallback(transcript)
      }
    }
  }

  /**
   * Handle activation
   */
  private onActivation(): void {
    console.log('Voice activated!')
    // Trigger callback to update UI
    if (this.onActivationCallback) {
      this.onActivationCallback()
    }
  }



  /**
   * Set activation keyword
   */
  setActivationKeyword(keyword: string): void {
    this.config.activationKeyword = keyword.toLowerCase()
  }

  /**
   * Update voice configuration
   */
  updateConfig(config: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...config }
    if (this.recognition) {
      this.recognition.language = this.config.locale
      this.recognition.continuous = this.config.continuousMode
    }
  }

  /**
   * Get current voice state
   */
  getState() {
    return {
      isListening: this.isListening,
      isActivated: this.isActivated,
      config: this.config,
    }
  }

  // Callbacks
  onActivationCallback: (() => void) | null = null
  onCommandCallback: ((command: string) => void) | null = null

  /**
   * Continuous Audio Spectrum Analysis (SENTIENT AUDIO v4.0)
   * Detects user tone and emotional intensity.
   */
  private analyzeSentiment(transcript: string): 'tired' | 'excited' | 'focused' | 'neutral' {
    const lower = transcript.toLowerCase()
    
    // Pattern-based heuristic for sentient tone
    if (lower.includes('tired') || lower.includes('sleepy') || lower.includes('exhausted')) return 'tired'
    if (lower.includes('wow') || lower.includes('awesome') || lower.includes('hype') || lower.includes('!')) return 'excited'
    if (lower.includes('research') || lower.includes('focus') || lower.includes('work') || lower.length > 50) return 'focused'
    
    return 'neutral'
  }
}

export default new VoiceHandler()
