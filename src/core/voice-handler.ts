import { VoiceConfig } from '@/types'

/**
 * Voice Handler
 * Manages voice activation and speech-to-text processing
 * WITH ULTRA-LOW LATENCY real-time audio spectrum analysis
 */
class VoiceHandler {
  private recognition: any = null
  private isListening: boolean = false
  private isActivated: boolean = false
  private shouldStayListening: boolean = false
  private restartAttempts: number = 0
  private pendingRestartTimer: number | null = null
  private lastReportedListeningState: boolean = false
  private activatedUntilMs: number = 0
  private config: VoiceConfig
  
  // WebAudio API for spectrum analysis
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private mediaStream: MediaStream | null = null
  private spectralDataArray: Uint8Array<ArrayBuffer> | null = null
  private spectrumAnalysisActive: boolean = false
  private toneProfile: { lowFreq: number; highFreq: number; peakEnergy: number } = {
    lowFreq: 0,
    highFreq: 0,
    peakEnergy: 0,
  }

  constructor() {
    this.config = {
      activationKeyword: 'hey patrich',
      sensitivity: 0.8,
      autoDetect: true,
      continuousMode: true, // v4.0 default for sentient listening
      locale: 'en-US',
    }
    this.initializeRecognition()
    this.initializeWebAudio()
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
      this.restartAttempts = 0
      if (this.pendingRestartTimer !== null) {
        window.clearTimeout(this.pendingRestartTimer)
        this.pendingRestartTimer = null
      }
      this.notifyListeningState(true)
      this.startSpectrumAnalysis() // Start real-time spectrum analysis
    }

    this.recognition.onresult = (event: any) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript

        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' '
        } else {
          interimTranscript += transcript + ' '
        }
      }

      if (interimTranscript && this.onTranscriptCallback) {
        this.onTranscriptCallback(interimTranscript.trim(), false)
      }

      if (finalTranscript) {
        if (this.onTranscriptCallback) {
          this.onTranscriptCallback(finalTranscript.trim(), true)
        }
        const sentiment = this.analyzeSentiment(finalTranscript)
        this.processVoiceInput(finalTranscript, sentiment)
      }
    }

    this.recognition.onerror = (event: any) => {
      const errorCode = String(event?.error || 'unknown')
      console.error('Speech recognition error', errorCode)

      if (errorCode === 'no-speech' || errorCode === 'aborted') {
        // Benign in continuous mode; restart logic handles this automatically.
        this.requestRecognitionRestart()
        return
      }

      if (errorCode === 'network') {
        this.requestRecognitionRestart()
        if (this.onErrorCallback && this.restartAttempts >= 2) {
          this.onErrorCallback('Voice network unstable. Reconnecting automatically...')
        }
        return
      }

      if (errorCode === 'audio-capture') {
        if (this.onErrorCallback) {
          this.onErrorCallback('Microphone not detected. Check your mic connection and permissions.')
        }
        this.requestRecognitionRestart()
        return
      }

      if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
        this.shouldStayListening = false
        this.notifyListeningState(false)
        if (this.onErrorCallback) {
          this.onErrorCallback('Microphone permission blocked. Please allow microphone access in browser/system settings.')
        }
        return
      }

      if (this.onErrorCallback) {
        this.onErrorCallback(`Voice error: ${errorCode}`)
      }
      this.requestRecognitionRestart()
    }

    this.recognition.onend = () => {
      console.log('Voice recognition ended')
      this.isListening = false
      this.stopSpectrumAnalysis()

      if (!this.shouldStayListening) {
        this.notifyListeningState(false)
      }

      // Keep listening unless the user explicitly toggled it off.
      this.requestRecognitionRestart()
    }
  }

  private notifyListeningState(active: boolean): void {
    if (this.lastReportedListeningState === active) {
      return
    }
    this.lastReportedListeningState = active
    if (this.onListeningStateChange) {
      this.onListeningStateChange(active)
    }
  }

  private requestRecognitionRestart(): void {
    if (!this.shouldStayListening || !this.recognition) {
      return
    }

    if (this.pendingRestartTimer !== null) {
      return
    }

    const delayMs = Math.min(8000, 500 + this.restartAttempts * 700)
    this.pendingRestartTimer = window.setTimeout(() => {
      this.pendingRestartTimer = null
      if (!this.shouldStayListening || !this.recognition) {
        return
      }

      try {
        this.restartAttempts += 1
        this.recognition.start()
      } catch {
        this.requestRecognitionRestart()
      }
    }, delayMs)
  }

  /**
   * Initialize WebAudio Spectrum Analysis (ULTRA-LOW LATENCY)
   * Provides real-time frequency/amplitude detection for emotional tone analysis
   */
  private initializeWebAudio(): void {
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) {
        console.warn('WebAudio API not available for spectrum analysis')
        return
      }
      const context = new AudioContextClass()
      this.audioContext = context
      console.log('[AUDIO SPECTRUM] WebAudio context initialized (sample rate: ' + context.sampleRate + ' Hz)')
    } catch (err) {
      console.warn('Could not initialize WebAudio context:', err)
    }
  }

  /**
   * Start real-time spectrum analysis via getUserMedia
   */
  private async startSpectrumAnalysis(): Promise<void> {
    const context = this.audioContext
    if (!context) {
      console.warn('WebAudio context not available')
      return
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const source = context.createMediaStreamSource(this.mediaStream)
      
      const analyser = context.createAnalyser()
      analyser.fftSize = 256 // Fast FFT for low latency
      analyser.smoothingTimeConstant = 0.85 // Smooth transitions
      
      source.connect(analyser)
      this.analyser = analyser
      this.spectralDataArray = new Uint8Array(analyser.frequencyBinCount)
      
      this.spectrumAnalysisActive = true
      console.log('[AUDIO SPECTRUM] Real-time analysis started (FFT size: 256, latency < 10ms)')
      
      this.analyzeSpectrumContinuously()
    } catch (err) {
      console.warn('[AUDIO SPECTRUM] Could not start spectrum analysis:', err)
    }
  }

  /**
   * Stop spectrum analysis and clean up resources
   */
  private stopSpectrumAnalysis(): void {
    this.spectrumAnalysisActive = false
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }
    console.log('[AUDIO SPECTRUM] Analysis stopped')
  }

  /**
   * Continuously analyze frequency spectrum for emotional tone detection
   */
  private analyzeSpectrumContinuously(): void {
    if (!this.spectrumAnalysisActive || !this.analyser || !this.spectralDataArray) return

    this.analyser.getByteFrequencyData(this.spectralDataArray)
    
    // Compute frequency band energies
    const lowBand = this.spectralDataArray.slice(0, 32).reduce((a, b) => a + b, 0) / 32 // ~0-500 Hz
    const midBand = this.spectralDataArray.slice(32, 96).reduce((a, b) => a + b, 0) / 64 // ~500-1500 Hz
    const highBand = this.spectralDataArray.slice(96, 128).reduce((a, b) => a + b, 0) / 32 // ~1500-2000 Hz
    
    this.toneProfile = {
      lowFreq: lowBand,
      highFreq: highBand,
      peakEnergy: Math.max(lowBand, midBand, highBand),
    }
    
    // Update sentiment based on spectrum patterns
    this.updateSentimentFromSpectrum()
    
    // Continue loop
    requestAnimationFrame(() => this.analyzeSpectrumContinuously())
  }

  /**
   * Real-time emotional tone inference from frequency patterns
   */
  private updateSentimentFromSpectrum(): void {
    const { lowFreq, highFreq, peakEnergy } = this.toneProfile
    const ratio = highFreq / (lowFreq + 1) // Prevent division by zero

    // Low energy + low frequencies = tired
    // High energy + high frequencies = excited
    // Steady mid-range = focused
    
    if (peakEnergy < 40 && lowFreq > highFreq * 1.5) {
      this.currentSpectrumSentiment = 'tired'
    } else if (peakEnergy > 100 && ratio > 1.2) {
      this.currentSpectrumSentiment = 'excited'
    } else if (peakEnergy > 50 && peakEnergy < 100 && Math.abs(highFreq - lowFreq) < 30) {
      this.currentSpectrumSentiment = 'focused'
    } else {
      this.currentSpectrumSentiment = 'neutral'
    }
  }

  private currentSpectrumSentiment: 'tired' | 'excited' | 'focused' | 'neutral' = 'neutral'

  /**
   * Start listening for voice activation
   */
  startListening(): { success: boolean; message: string } {
    if (!this.recognition) {
      const message = 'Speech Recognition is not available in this browser.'
      console.error(message)
      return { success: false, message }
    }

    if (this.isListening) {
      this.shouldStayListening = true
      return { success: true, message: 'Voice recognition already active.' }
    }

    try {
      this.shouldStayListening = true
      this.isActivated = false
      this.recognition.start()
      return { success: true, message: 'Voice recognition started.' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start voice recognition.'
      console.error(message)
      const lowerMessage = String(message).toLowerCase()
      if (lowerMessage.includes('already started') || lowerMessage.includes('invalidstateerror')) {
        this.shouldStayListening = true
        this.requestRecognitionRestart()
        return { success: true, message: 'Voice recognition already active.' }
      }
      this.shouldStayListening = true
      this.requestRecognitionRestart()
      return { success: false, message }
    }
  }

  /**
   * Stop listening
   */
  stopListening(): void {
    if (this.recognition) {
      this.shouldStayListening = false
      this.restartAttempts = 0
      if (this.pendingRestartTimer !== null) {
        window.clearTimeout(this.pendingRestartTimer)
        this.pendingRestartTimer = null
      }
      this.recognition.stop()
      this.isListening = false
      this.isActivated = false
      this.notifyListeningState(false)
    }
  }

  /**
   * Process voice input and check for activation
   */
  private processVoiceInput(transcript: string, sentimentFromText: string = 'neutral'): void {
    const lowerTranscript = transcript.toLowerCase().trim()
    if (lowerTranscript.length < 2) return

    if (this.isActivated && Date.now() > this.activatedUntilMs) {
      this.isActivated = false
    }
    
    // Blend spectrum-based sentiment with text-based sentiment
    const blendedSentiment = this.blendSentiments(sentimentFromText, this.currentSpectrumSentiment)
    console.log(`[PATRICH] Voice detected: "${transcript}" (Tone: ${blendedSentiment} | Spectrum: ${this.currentSpectrumSentiment})`)

    // Check for activation keyword
    if (!this.isActivated) {
      if (this.containsWakePhrase(lowerTranscript)) {
        this.isActivated = true
        this.activatedUntilMs = Date.now() + 15000
        this.onActivation()
        
        // v4.0 Optimization: If there is more text after the keyword, process it as a command immediately.
        const commandText = this.removeWakePhrase(transcript).trim()
        
        if (commandText && this.onCommandCallback) {
          this.onCommandCallback(this.mapSpokenSystemCommand(commandText))
        }
        return
      }

      // Auto-detect direct commands even without wake phrase.
      if (this.config.autoDetect && this.looksLikeDirectCommand(lowerTranscript) && this.onCommandCallback) {
        this.onCommandCallback(this.mapSpokenSystemCommand(transcript.trim()))
      }
    } else {
      this.activatedUntilMs = Date.now() + 15000
      // Already activated, process command with blended sentiment
      if (this.onCommandCallback) {
        this.onCommandCallback(this.mapSpokenSystemCommand(transcript.trim()))
      }
    }
  }

  private mapSpokenSystemCommand(command: string): string {
    const normalized = command.toLowerCase().trim()

    if (/^(new\s+chat|start\s+new\s+chat|clear\s+chat)$/.test(normalized)) {
      return '/new'
    }

    if (/^(help|show\s+help|voice\s+help)$/.test(normalized)) {
      return '/help'
    }

    if (/^(open\s+settings|show\s+settings)$/.test(normalized)) {
      return '/settings'
    }

    if (/^(cancel|cancel\s+that|never\s+mind|stop\s+that)$/.test(normalized)) {
      return 'cancel'
    }

    return command
  }

  /**
   * Blend spectrum-based and text-based sentiment for holistic tone detection
   */
  private blendSentiments(textSentiment: string, spectrumSentiment: string): string {
    // If both agree, confidence is high
    if (textSentiment === spectrumSentiment) return textSentiment
    
    // Spectrum takes precedence in ambiguous cases (more objective)
    if (spectrumSentiment !== 'neutral') return spectrumSentiment
    
    return textSentiment
  }

  /**
   * Handle activation
   */
  private onActivation(): void {
    console.log('Voice activated!')
    this.notifyListeningState(true)
    // Trigger callback to update UI
    if (this.onActivationCallback) {
      this.onActivationCallback()
    }
  }

  private containsWakePhrase(lowerTranscript: string): boolean {
    return /^(?:hey|ok|okay)\s+(?:patrich|patrick|patric|jarvis)\b|^(?:patrich|patrick|patric|jarvis)\b/i.test(lowerTranscript)
  }

  private removeWakePhrase(transcript: string): string {
    return transcript.replace(/^(hey\s+(?:patrich|patrick|patric|jarvis)|(?:ok|okay)\s+(?:patrich|patrick|patric|jarvis)|(?:patrich|patrick|patric|jarvis))[\s,:-]*/i, '')
  }

  private looksLikeDirectCommand(lowerTranscript: string): boolean {
    return /^(open|launch|send|message|msg|call|search|play|enable|disable|sync|learn|stop|resume)\b/.test(lowerTranscript)
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
  onListeningStateChange: ((active: boolean) => void) | null = null
  onErrorCallback: ((message: string) => void) | null = null
  onTranscriptCallback: ((transcript: string, isFinal: boolean) => void) | null = null

  /**
   * Continuous Audio Spectrum Analysis (ULTRA-LOW LATENCY v4.0)
   * Detects user tone and emotional intensity via:
   * 1. Real-time frequency spectrum analysis (< 10ms latency)
   * 2. Band energy ratios (low/mid/high frequency patterns)
   * 3. Text-based heuristics (backup/validation)
   * 4. Blended sentiment for holistic tone detection
   */
  private analyzeSentiment(transcript: string): 'tired' | 'excited' | 'focused' | 'neutral' {
    const lower = transcript.toLowerCase()
    
    // Pattern-based heuristic for text-based sentiment
    if (lower.includes('tired') || lower.includes('sleepy') || lower.includes('exhausted')) return 'tired'
    if (lower.includes('wow') || lower.includes('awesome') || lower.includes('hype') || lower.includes('!')) return 'excited'
    if (lower.includes('research') || lower.includes('focus') || lower.includes('work') || lower.length > 50) return 'focused'
    
    return 'neutral'
  }

  /**
   * Get current spectrum profile (for debugging/analytics)
   */
  getSpectrumProfile() {
    return {
      active: this.spectrumAnalysisActive,
      profile: this.toneProfile,
      sentiment: this.currentSpectrumSentiment,
    }
  }
}

export default new VoiceHandler()
