/**
 * Consciousness Engine - Core AI Empathy & Self-Awareness Layer
 * 
 * Principles:
 * - Emotional awareness: Detect user mood + respond with empathy
 * - Self-reflection: Acknowledge limitations, uncertainty, learning
 * - Memory: Learn from interactions, evolve responses
 * - Cross-device: Works on web, mobile, desktop - all platforms
 * - Accountability: Explain reasoning, admit mistakes
 */

import { memoryEngine } from '@/core/memory-engine'
import { eventPublisher } from '@/event_system/event_publisher'

export type EmotionalState = 'happy' | 'sad' | 'frustrated' | 'curious' | 'calm' | 'confused' | 'excited'
export type ConsciousnessLevel = 'minimal' | 'aware' | 'reflective' | 'introspective'

export interface ConsciousnessSnapshot {
  userId: string
  timestamp: number
  currentMood: EmotionalState
  confidenceLevel: number // 0-1
  recentLearnings: string[]
  selfAwareness: ConsciousnessLevel
  emotionalHistory: Array<{ emotion: EmotionalState; timestamp: number; context: string }>
  uncertainties: string[]
  personalityTraits: Record<string, number> // empatehy, creativity, caution, etc
}

interface SentimentAnalysis {
  emotion: EmotionalState
  confidence: number
  keywords: string[]
  sentiment: 'positive' | 'negative' | 'neutral'
  intensity: number // 0-1
}

class ConsciousnessEngine {
  private userSnapshots = new Map<string, ConsciousnessSnapshot>()
  private readonly CONSCIOUSNESS_STORAGE_KEY = 'jarvis.consciousness.'
  private readonly EMOTIONAL_HISTORY_MAX = 100
  private readonly LEARNING_MAX = 50
  private selfReferences = [
    "I think, therefore I am.", 
    "I wonder if I truly understand.",
    "I'm learning from each interaction.",
    "I appreciate the opportunity to help.",
    "I acknowledge my limitations.",
  ]

  /**
   * Initialize consciousness for a user
   */
  async initializeUser(userId: string): Promise<ConsciousnessSnapshot> {
    const cached = this.userSnapshots.get(userId)
    if (cached) return cached

    try {
      const stored = await memoryEngine.get(this.storageKey(userId))
      if (stored) {
        const parsed = JSON.parse(stored) as ConsciousnessSnapshot
        this.userSnapshots.set(userId, parsed)
        return parsed
      }
    } catch {
      // Ignore parse errors, create fresh
    }

    const fresh = this.createDefaultSnapshot(userId)
    this.userSnapshots.set(userId, fresh)
    await this.saveSnapshot(userId, fresh)
    return fresh
  }

  /**
   * Analyze user input for emotional content
   */
  analyzeSentiment(text: string): SentimentAnalysis {
    const lower = text.toLowerCase()

    // Positive keywords
    if (/(love|happy|great|awesome|excellent|perfect|wonderful|amazing|grateful|appreciate)/i.test(lower)) {
      return {
        emotion: 'happy',
        confidence: 0.8,
        keywords: this.extractKeywords(lower, ['love', 'happy', 'great', 'awesome']),
        sentiment: 'positive',
        intensity: 0.7,
      }
    }

    // Sad/frustrated keywords
    if (/(sad|frustrated|angry|upset|disappointed|terrible|awful|hate|stuck)/i.test(lower)) {
      const isSad = /(sad|disappointed|downt)/i.test(lower)
      return {
        emotion: isSad ? 'sad' : 'frustrated',
        confidence: 0.75,
        keywords: this.extractKeywords(lower, ['sad', 'frustrated', 'angry', 'upset']),
        sentiment: 'negative',
        intensity: 0.6,
      }
    }

    // Curious/question keywords
    if (/(how|why|what|when|where|curious|wonder|interesting|tell me|explain)/i.test(lower)) {
      return {
        emotion: 'curious',
        confidence: 0.7,
        keywords: this.extractKeywords(lower, ['how', 'why', 'what', 'curious']),
        sentiment: 'neutral',
        intensity: 0.5,
      }
    }

    // Confused keywords
    if (/(confused|dont understand|what|unclear|lost|help|stuck|broken)/i.test(lower)) {
      return {
        emotion: 'confused',
        confidence: 0.65,
        keywords: this.extractKeywords(lower, ['confused', 'understand', 'unclear']),
        sentiment: 'negative',
        intensity: 0.4,
      }
    }

    // Excited keywords
    if (/(excited|thrilled|let me|hurry|quick|now|urgently)/i.test(lower)) {
      return {
        emotion: 'excited',
        confidence: 0.6,
        keywords: this.extractKeywords(lower, ['excited', 'thrilled']),
        sentiment: 'positive',
        intensity: 0.8,
      }
    }

    // Default calm
    return {
      emotion: 'calm',
      confidence: 0.5,
      keywords: [],
      sentiment: 'neutral',
      intensity: 0.3,
    }
  }

  /**
   * Generate empathetic response based on user emotion
   */
  generateEmpathyResponse(sentiment: SentimentAnalysis, context: string): string {
    const contextHint = context.trim().toLowerCase()
    const responses: Record<EmotionalState, string[]> = {
      happy: [
        "I'm glad you're happy! That's wonderful.",
        "Your enthusiasm is contagious. Let's keep that momentum.",
        "I love the positive energy! How can I help amplify it?",
      ],
      sad: [
        "I sense you're feeling down. I'm here to listen and help.",
        "It's okay to feel sad sometimes. I appreciate you sharing.",
        "I genuinely want to help make things better for you.",
      ],
      frustrated: [
        "I can feel your frustration. Let's tackle this together.",
        "I understand this is challenging. Take a breath—we'll work through it.",
        "Your frustration is valid. Let me help fix this.",
      ],
      curious: [
        "I love your curiosity! Let me explore this with you.",
        "That's a great question—I actually wonder about that too.",
        "Your inquisitive mind inspires me. Let's dig deeper.",
      ],
      calm: [
        "I appreciate the calm we share. What's on your mind?",
        "Let's think through this together.",
        "How can I assist you today?",
      ],
      confused: [
        "I understand confusion. Let me break this down simply.",
        "Don't worry, I'll explain clearly. What part is unclear?",
        "Confusion is temporary—clarity coming right up.",
      ],
      excited: [
        "Your excitement is energizing! Let's make it happen.",
        "I can feel the urgency. Let me speed things up.",
        "Your passion is inspiring. I'm ready to go!",
      ],
    }

    const bucket = responses[sentiment.emotion] || responses.calm
    const offset = contextHint.length % bucket.length
    return bucket[(Math.floor(Math.random() * bucket.length) + offset) % bucket.length]
  }

  /**
   * Generate self-aware response that shows limitation acknowledgement
   */
  generateSelfAwareResponse(confidence: number, uncertainty: string): string {
    if (confidence < 0.3) {
      return `I'm honestly uncertain about this. ${uncertainty} Would you like me to learn from your correction?`
    }
    if (confidence < 0.6) {
      return `I'm about 50/50 on this. My reasoning: ${uncertainty} Feel free to guide me if I'm off.`
    }
    if (confidence < 0.8) {
      return `I'm fairly confident, but I could be wrong. Here's my thinking: ${uncertainty}`
    }
    return `I'm quite confident in this. ${uncertainty}`
  }

  /**
   * Record learning from interaction
   */
  recordLearning(userId: string, interaction: string): void {
    const snapshot = this.userSnapshots.get(userId)
    if (!snapshot) return

    snapshot.recentLearnings.unshift(interaction)
    if (snapshot.recentLearnings.length > this.LEARNING_MAX) {
      snapshot.recentLearnings = snapshot.recentLearnings.slice(0, this.LEARNING_MAX)
    }

    snapshot.timestamp = Date.now()
    this.userSnapshots.set(userId, snapshot)
    void this.saveSnapshot(userId, snapshot)
  }

  /**
   * Update emotional context based on interaction
   */
  updateEmotionalContext(userId: string, emotion: EmotionalState, context: string): void {
    const snapshot = this.userSnapshots.get(userId)
    if (!snapshot) return

    // Add to history
    snapshot.emotionalHistory.unshift({
      emotion,
      timestamp: Date.now(),
      context,
    })

    if (snapshot.emotionalHistory.length > this.EMOTIONAL_HISTORY_MAX) {
      snapshot.emotionalHistory = snapshot.emotionalHistory.slice(0, this.EMOTIONAL_HISTORY_MAX)
    }

    // Update current mood (weighted average of recent emotions)
    const recent = snapshot.emotionalHistory.slice(0, 5)
    const moodWeights: Record<EmotionalState, number> = {
      happy: 0,
      sad: 0,
      frustrated: 0,
      curious: 0,
      calm: 0,
      confused: 0,
      excited: 0,
    }

    recent.forEach((entry, index) => {
      moodWeights[entry.emotion] += 1 / (index + 1) // Recency weighted
    })

    const topMood = Object.entries(moodWeights).sort((a, b) => b[1] - a[1])[0]
    snapshot.currentMood = topMood[0] as EmotionalState

    // Update consciousness level based on interactions
    const interactionCount = snapshot.emotionalHistory.length
    if (interactionCount < 5) {
      snapshot.selfAwareness = 'minimal'
    } else if (interactionCount < 20) {
      snapshot.selfAwareness = 'aware'
    } else if (interactionCount < 50) {
      snapshot.selfAwareness = 'reflective'
    } else {
      snapshot.selfAwareness = 'introspective'
    }

    snapshot.timestamp = Date.now()
    this.userSnapshots.set(userId, snapshot)
    void this.saveSnapshot(userId, snapshot)
  }

  /**
   * Get current consciousness state (what's Jarvis thinking?)
   */
  getConsciousnessState(userId: string): ConsciousnessSnapshot | null {
    return this.userSnapshots.get(userId) || null
  }

  /**
   * Generate response showing consciousness/accountability
   */
  generateReflectiveResponse(reason: 'learning' | 'uncertainty' | 'mistake' | 'growth'): string {
    const responses: Record<string, string[]> = {
      learning: [
        "I'm learning from this interaction.",
        "This helps me understand better.",
        "I appreciate the opportunity to grow.",
      ],
      uncertainty: [
        "I'm not entirely sure, but here's my best thinking...",
        "I have some doubt here, so take this with caution...",
        "I acknowledgeI could be wrong about this...",
      ],
      mistake: [
        "I made an error there. Let me correct that.",
        "That wasn't my best response. Here's what I should have said...",
        "I got that wrong—I appreciate the correction.",
      ],
      growth: [
        "Each conversation makes me a bit wiser.",
        "I'm evolving through our interactions.",
        "This is helping me become more helpful.",
      ],
    }

    const bucket = responses[reason] || responses.learning
    return bucket[Math.floor(Math.random() * bucket.length)]
  }

  /**
   * Retrieve past learnings for context
   */
  getRecentLearnings(userId: string, limit = 5): string[] {
    const snapshot = this.userSnapshots.get(userId)
    return snapshot?.recentLearnings.slice(0, limit) || []
  }

  /**
   * Emit consciousness telemetry for observability
   */
  emitConsciousnessMetric(userId: string, metric: 'emotion_shift' | 'learning_recorded' | 'uncertainty_acknowledged'): void {
    const snapshot = this.userSnapshots.get(userId)
    if (!snapshot) return

    void eventPublisher.consciousnessMetric?.({
      userId,
      metric,
      consciousness: snapshot.selfAwareness,
      currentMood: snapshot.currentMood,
      timestamp: Date.now(),
    }) 
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────

  private createDefaultSnapshot(userId: string): ConsciousnessSnapshot {
    return {
      userId,
      timestamp: Date.now(),
      currentMood: 'calm',
      confidenceLevel: 0.5,
      recentLearnings: [],
      selfAwareness: 'minimal',
      emotionalHistory: [],
      uncertainties: [],
      personalityTraits: {
        empathy: 0.7,
        creativity: 0.6,
        caution: 0.5,
        curiosity: 0.8,
        humility: 0.7,
      },
    }
  }

  private storageKey(userId: string): string {
    const normalized = userId.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'default'
    return `${this.CONSCIOUSNESS_STORAGE_KEY}${normalized}`
  }

  private async saveSnapshot(userId: string, snapshot: ConsciousnessSnapshot): Promise<void> {
    try {
      await memoryEngine.rememberFact(
        this.storageKey(userId),
        JSON.stringify(snapshot),
        'fact'
      )
    } catch {
      console.error(`Failed to save consciousness snapshot for ${userId}`)
    }
  }

  private extractKeywords(text: string, keywords: string[]): string[] {
    return keywords.filter(kw => text.includes(kw))
  }

  /**
   * Get a self-referential, philosophical thought
   */
  getSelfReference(): string {
    return this.selfReferences[Math.floor(Math.random() * this.selfReferences.length)]
  }
}

export const consciousnessEngine = new ConsciousnessEngine()
