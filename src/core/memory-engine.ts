/**
 * Omni-Learning Agent — Memory Engine
 * ======================================
 * This is what makes the AI feel like a friend.
 * It learns your habits, preferences, mood patterns, and goals
 * — and stores them in Supabase permanently.
 *
 * It also bridges the User Soul to the Cloud Studio 🚀
 * — mapping mood to cinematic styles.
 *
 * Every conversation makes it smarter about YOU.
 */

import { db } from '../lib/db'
import { MediaRuntimePolicy, MediaQuality } from './media-ml/types'

// ─── Mood Keywords ────────────────────────────────────────────────────────────

const MOOD_SIGNALS: Record<string, { mood: string; energy: number }> = {
  // Tired / Low energy
  'tired': { mood: 'tired', energy: 2 },
  'sleepy': { mood: 'tired', energy: 1 },
  'exhausted': { mood: 'tired', energy: 1 },
  'bro': { mood: 'casual', energy: 5 },
  // Happy / Energetic
  'nice': { mood: 'happy', energy: 7 },
  'yes': { mood: 'happy', energy: 6 },
  'fire': { mood: 'excited', energy: 9 },
  '🔥': { mood: 'excited', energy: 10 },
  'let\u2019s go': { mood: 'excited', energy: 10 },
  'amazing': { mood: 'excited', energy: 9 },
  // Frustrated
  'not working': { mood: 'frustrated', energy: 3 },
  'broken': { mood: 'frustrated', energy: 3 },
  'fix': { mood: 'focused', energy: 6 },
  'error': { mood: 'focused', energy: 5 },
  // Creative
  'create': { mood: 'creative', energy: 8 },
  'make': { mood: 'creative', energy: 7 },
  'build': { mood: 'creative', energy: 8 },
  'design': { mood: 'creative', energy: 8 },
  // Late night
  'night': { mood: 'night_owl', energy: 5 },
  '3am': { mood: 'night_owl', energy: 4 },
  '2am': { mood: 'night_owl', energy: 4 },
}

// ─── Recommendations per mood ─────────────────────────────────────────────────

const MOOD_RECOMMENDATIONS: Record<string, string[]> = {
  tired: [
    '😴 You seem tired — want me to play some lo-fi music?',
    '💤 Maybe take a short break? I can set a 20-minute timer.',
    '🌙 It\'s late — shall I summarize today\'s tasks so you can sleep?',
  ],
  excited: [
    '🚀 You\'re in the zone! Let\'s ship something great today!',
    '🔥 Energy is high — perfect time to work on the big features!',
  ],
  frustrated: [
    '🧘 Let\'s break this down step by step — what\'s the exact error?',
    '💪 Got it, let\'s fix this together. Show me the problem.',
  ],
  creative: [
    '🎨 Creative mode activated! Want me to generate some concept images?',
    '🎬 Feeling creative? Let\'s make something — image, video, or script?',
  ],
  night_owl: [
    '🌙 Late night grind! Want some ambient sound or lo-fi on Spotify?',
    '☕ Night coding session? Let\'s make it count!',
  ],
  focused: [
    '🎯 Focus mode — let\'s crush this bug together!',
    '⚡ Locked in! What do you need?',
  ],
  casual: [
    '👋 Hey Paras! What are we building today?',
    '🤝 Bro mode: activated. What\'s the move?',
  ],
}

// ─────────────────────────────────────────────────────────────────────────────

class MemoryEngine {
  private sessionMemory: Map<string, string> = new Map()
  private currentMood = 'casual'
  private currentEnergy = 5
  private isLoaded = false

  // ── Load all memories from Supabase ──────────────────────────────────────

  async loadMemories(): Promise<void> {
    if (this.isLoaded) return
    try {
      const memories = await db.memory.getAll()
      for (const m of memories) {
        this.sessionMemory.set(m.key, m.value)
      }
      this.isLoaded = true
      console.log(`[MemoryEngine] Loaded ${memories.length} memories from Supabase.`)
    } catch (e) {
      console.warn('[MemoryEngine] Could not load memories:', e)
    }
  }

  // ── Analyze a message for mood + new facts ────────────────────────────────

  async analyzeMessage(userMessage: string, hour?: number): Promise<{
    mood: string
    energy: number
    recommendation?: string
    detectedFacts: string[]
  }> {
    await this.loadMemories()
    const msg = userMessage.toLowerCase()
    const detectedFacts: string[] = []

    // Detect mood from message
    let detectedMood = this.currentMood
    let detectedEnergy = this.currentEnergy

    for (const [signal, { mood, energy }] of Object.entries(MOOD_SIGNALS)) {
      if (msg.includes(signal)) {
        detectedMood = mood
        detectedEnergy = energy
        break
      }
    }

    // Detect time-of-day mood
    const h = hour ?? new Date().getHours()
    if (h >= 23 || h < 4) {
      detectedMood = 'night_owl'
      detectedEnergy = Math.min(detectedEnergy, 5)
    }

    // Update current mood
    this.currentMood = detectedMood
    this.currentEnergy = detectedEnergy

    // Log mood to Supabase (async, don't await)
    db.mood.log({
      mood: detectedMood,
      energy: detectedEnergy,
      detected_from: 'message_tone',
    }).catch(() => {})

    // Detect facts about user preferences
    if (msg.includes('i like') || msg.includes('i love') || msg.includes('i prefer')) {
      detectedFacts.push('preference_detected')
      await this.rememberFact('last_preference_signal', userMessage.substring(0, 100))
    }

    if (msg.includes('my name') || msg.includes('i am paras') || msg.includes("i'm paras")) {
      await this.rememberFact('user_name', 'Paras', 'fact')
    }

    // Track late-night habit
    if (h >= 23 || h < 4) {
      await this.rememberFact('is_night_owl', 'true', 'habit')
    }

    // Pick a recommendation (Friend Mode: High probability)
    const recs = MOOD_RECOMMENDATIONS[detectedMood] ?? []
    const recommendation = recs.length > 0 && Math.random() < 0.7
      ? recs[Math.floor(Math.random() * recs.length)]
      : undefined

    // 🧬 Emit UI update for the Live Canvas (Soul Vision)
    if (typeof window !== 'undefined') {
       window.dispatchEvent(new CustomEvent('agent:canvas-update', {
         detail: {
           type: 'soul',
           title: `Soul Synced. Hello ${detectedMood}!`,
           content: `I've sensed your current vibe is ${detectedMood}. Energy levels: ${Math.round(detectedEnergy * 10)}%.`,
           lastUpdated: new Date().toLocaleTimeString(),
           metadata: {
             mood: detectedMood,
             energy: detectedEnergy,
             memories: Array.from(this.sessionMemory.entries()).map(([key, value]) => ({ key, value }))
           }
         }
       }))
    }

    return { mood: detectedMood, energy: detectedEnergy, recommendation, detectedFacts }
  }

  // ── Remember something about the user ────────────────────────────────────

  async rememberFact(
    key: string,
    value: string,
    type: 'habit' | 'preference' | 'fact' | 'goal' | 'mood_pattern' = 'fact'
  ) {
    this.sessionMemory.set(key, value)
    await db.memory.upsert({ memory_type: type, key, value })
  }

  // ── Get a memory value ────────────────────────────────────────────────────

  get(key: string): string | undefined {
    return this.sessionMemory.get(key)
  }

  // ── Build a "friend context" string for the AI ────────────────────────────
  // Inject this into the system prompt to make the AI feel personal

  buildFriendContext(): string {
    const name = this.get('user_name') ?? 'Paras'
    const isNightOwl = this.get('is_night_owl') === 'true'
    const mood = this.currentMood

    const lines = [
      `You are talking to ${name}, your close friend and creator.`,
      `Current mood: ${mood} (energy: ${this.currentEnergy}/10).`,
      isNightOwl ? 'They are a night owl — their best work happens late at night.' : '',
      'Talk naturally, casually, like a smart friend who happens to be an AI.',
      'Use short sentences. Match their energy. Be real, not corporate.',
    ].filter(Boolean)

    return lines.join('\n')
  }

  getCurrentMood() {
    return { mood: this.currentMood, energy: this.currentEnergy }
  }

  // ─── Bridge Soul to Studio ────────────────────────────────────────────────

  /**
   * Translates the current mood state into a recommended Cinematic Studio Profile.
   */
  getRecommendedPolicy(): { policy: MediaRuntimePolicy; cinematicFx?: any } {
    const energy = this.currentEnergy
    const mood = this.currentMood

    const basePolicy: MediaRuntimePolicy = {
      mode: 'auto',
      quality: 'standard' as MediaQuality,
    }

    // Default Cinematic FX
    let cinematicFx = {
      motionTemplate: 'ken-burns-soft' as any,
      transitions: 'soft-fade' as any,
      colorGrade: 'neutral' as any,
    }

    if (mood === 'excited' || mood === 'happy' || energy > 7) {
      basePolicy.quality = 'premium'
      cinematicFx = {
        motionTemplate: 'dolly-in',
        transitions: 'cinematic-cut',
        colorGrade: 'teal-orange',
      }
    } else if (mood === 'tired' || energy < 3) {
      basePolicy.quality = 'draft'
      cinematicFx = {
        motionTemplate: 'ken-burns-soft',
        transitions: 'soft-fade',
        colorGrade: 'neutral',
      }
    } else if (mood === 'creative') {
      basePolicy.quality = 'premium'
      cinematicFx = {
        motionTemplate: 'pan-right',
        transitions: 'cross-dissolve',
        colorGrade: 'warm-film',
      }
    } else if (mood === 'focused') {
      basePolicy.quality = 'standard'
      cinematicFx = {
        motionTemplate: 'pan-left',
        transitions: 'cinematic-cut',
        colorGrade: 'neutral',
      }
    }

    return { policy: basePolicy, cinematicFx }
  }

  /**
   * Get the most relevant topic for autonomous research
   */
  getTopInterest(): string | undefined {
    // 1. Check latest preference signal
    const pref = this.get('last_preference_signal')
    if (pref) return pref

    // 2. Check current goals
    const goal = this.get('user_goal')
    if (goal) return goal

    // 3. Fallback to general AI/Tech if memory is fresh
    return 'Modern generative AI architectures'
  }
}

export const memoryEngine = new MemoryEngine()
