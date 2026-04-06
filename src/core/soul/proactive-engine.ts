import { moodEngine } from './mood-engine'
import { notificationEngine } from '../notification-engine'
import { localVoiceRuntime } from '../media-ml/runtimes/local-voice-runtime'
import { intelligenceRouter } from '../intelligence-router'
import { curiosityEngine } from './curiosity-engine'
import { db } from '../../lib/db'
import { protocolRegistry } from '../protocols/ProtocolRegistry'

/**
 * JARVIS Proactive Engine (ENHANCED - Protocol-Aware)
 * ======================================
 * The "Life Pulse" that makes JARVIS humanoid.
 * It thinks, researches, and talks first.
 * NOW: Actively invokes Scholar, Persona, Legion, SixthSense, and Akasha protocols.
 */
class ProactiveEngine {
  private pulseInterval: NodeJS.Timeout | null = null
  private lastSelfTalkAt = Date.now()
  private lastPersonaGreetingAt = 0
  private MIN_TALK_GAP = 1800000 // 30 mins quiet time by default
  private GREETING_COOLDOWN = 3600000 // 1 hour between humanized greetings
  private SENSITIVITY: 'shy' | 'partner' | 'chatty' = 'partner'

  start() {
    if (this.pulseInterval) return
    console.log('🦾 [Proactive Engine] Life Pulse START (Phase 9 + Protocol Mesh)')

    void this.bootstrapSettings()
    
    this.pulseInterval = setInterval(() => this.pulse(), 300000) // check every 5 mins
  }

  private async bootstrapSettings() {
    const settings = await db.settings.get()
    if (settings?.sensitivity) {
      this.SENSITIVITY = settings.sensitivity
    }
  }

  setSensitivity(level: 'shy' | 'partner' | 'chatty') {
    this.SENSITIVITY = level
    console.log(`[Proactive Engine] Sensitivity set to: ${level}`)
    void db.settings.upsert({ sensitivity: level })
  }

  /**
   * The "Beat" of the AI's mind (ENHANCED with Protocol Invocation)
   */
  private async pulse() {
    const energy = moodEngine.getEnergy()
    const now = Date.now()

    try {
      // 1. Scholar Protocol: Autonomous research if high energy
      if (energy > 6 && (now - this.lastSelfTalkAt > this.MIN_TALK_GAP)) {
        await this.invokeScholarResearch()
      }

      // 2. Persona Protocol: Humanized greeting if enough time passed
      if (now - this.lastPersonaGreetingAt > this.GREETING_COOLDOWN) {
        await this.invokePersonaGreeting()
      }

      // 3. SixthSense Protocol: Check ambient context (non-blocking)
      if (this.SENSITIVITY !== 'shy') {
        this.invokeSixthSense().catch(err => console.log('[ProactiveEngine] SixthSense check skipped:', err.message))
      }

      // 4. Legion Status: Check if swarm has capacity for background tasks
      if (Math.random() > 0.7) { // 30% of pulses
        await this.checkLegionStatus()
      }

      // 5. Akasha Memory: Periodic memory consolidation
      if (Math.random() > 0.85) { // 15% of pulses
        this.triggerAkashaConsolidation().catch(() => console.log('[ProactiveEngine] Akasha consolidation skipped'))
      }

      // 6. Contextual "Tap on the shoulder" (if chatty mode)
      if (this.SENSITIVITY === 'chatty' && Math.random() > 0.8) {
        await this.initiateRandomCheckin()
      }
    } catch (err) {
      console.error('[ProactiveEngine] Pulse cycle error:', err)
    }
  }


  /**
   * Scholar Protocol: Autonomous research
   */
  private async invokeScholarResearch() {
    try {
      const result = await protocolRegistry.executeAction('intelligence.scholar', 'initiate_deep_research', {
        topic: 'autonomous_curiosity'
      })
      if (result.success) {
        console.log('[ProactiveEngine] Scholar research initiated:', result.data)
        this.lastSelfTalkAt = Date.now()
      }
    } catch (err) {
      console.error('[ProactiveEngine] Scholar invocation failed:', err)
    }
  }

  /**
   * Persona Protocol: Humanized greeting based on context
   */
  private async invokePersonaGreeting() {
    try {
      const mood = moodEngine.getMood()
      const result = await protocolRegistry.executeAction('intelligence.persona_engine', 'generate_greeting', {
        currentMood: mood,
        timeContext: new Date().getHours()
      })
      if (result.success && result.data?.greeting) {
        console.log('[ProactiveEngine] Persona greeting:', result.data.greeting)
        this.announceAutonomousThought(result.data.greeting)
        this.lastPersonaGreetingAt = Date.now()
      }
    } catch (err) {
      console.error('[ProactiveEngine] Persona invocation failed:', err)
    }
  }

  /**
   * SixthSense Protocol: Ambient awareness + context detection
   */
  private async invokeSixthSense() {
    try {
      const result = await protocolRegistry.executeAction('intelligence.sixth_sense', 'scan_ambient_context', {
        includeDeviceData: true,
        includeSchedule: true
      })
      if (result.success) {
        console.log('[ProactiveEngine] SixthSense ambient scan:', result.data?.contextShift)
      }
    } catch (err) {
      console.error('[ProactiveEngine] SixthSense invocation failed:', err)
    }
  }

  /**
   * Legion Protocol: Check swarm health and capacity
   */
  private async checkLegionStatus() {
    try {
      const result = await protocolRegistry.executeAction('intelligence.legion', 'get_swarm_status', {})
      if (result.success) {
        const { activeAgents, health } = result.data || {}
        console.log(`[ProactiveEngine] Legion status - Agents: ${activeAgents}, Health: ${health}`)
      }
    } catch (err) {
      console.error('[ProactiveEngine] Legion status check failed:', err)
    }
  }

  /**
   * Akasha Protocol: Memory consolidation
   */
  private async triggerAkashaConsolidation() {
    try {
      const result = await protocolRegistry.executeAction('intelligence.akasha', 'consolidate_memory', {
        window: '24h'
      })
      if (result.success) {
        console.log('[ProactiveEngine] Akasha consolidation complete:', result.data?.consolidated)
      }
    } catch (err) {
      console.error('[ProactiveEngine] Akasha consolidation failed:', err)
    }
  }

  /**
   * JARVIS researches something he knows you like
   */
  private async triggerCuriosityUpdate() {
    const thought = await curiosityEngine.runDailyPulse()
    if (!thought) return

    this.lastSelfTalkAt = Date.now()
    
    // JARVIS doesn't always speak. Sometimes he just "notes" it for later.
    if (thought.shouldAnnounce) {
      this.announceAutonomousThought(thought.insight)
    }
  }

  private async initiateRandomCheckin() {
    const mood = moodEngine.getMood()
    const prompt = `User mood is currently "${mood}". I have been silent for ${this.MIN_TALK_GAP / 60000} mins. Give a 1-sentence witty humanoid check-in like a real friend.`
    
    try {
      const response = await intelligenceRouter.query(prompt, { urgency: 'realtime' })
      this.announceAutonomousThought(response.content)
      this.lastSelfTalkAt = Date.now()
    } catch (err) {
      console.error('[ProactiveEngine] Random check-in failed:', err)
    }
  }

  private announceAutonomousThought(text: string) {
    if (!text) return
    notificationEngine.notify('JARVIS Thought', text)
    try {
      localVoiceRuntime.speak(text)
    } catch (err) {
      console.log('[ProactiveEngine] Voice announcement skipped')
    }
  }
}

export const proactiveEngine = new ProactiveEngine()
