import { supabase } from '../../lib/supabase'

export type UserMood = 'neutral' | 'happy' | 'tired' | 'focused' | 'frustrated' | 'creative'
export type EnergyLevel = 1 | 2 | 3 | 4 | 5

export interface SoulState {
  mood: UserMood
  energy: EnergyLevel
  lastMessageAt: number
  sentimentScore: number
}

const MOOD_KEYWORDS: Record<string, { mood: UserMood; weight: number }> = {
  'happy': { mood: 'happy', weight: 2 },
  'excited': { mood: 'happy', weight: 3 },
  'tired': { mood: 'tired', weight: 2 },
  'sleepy': { mood: 'tired', weight: 3 },
  'stuck': { mood: 'frustrated', weight: 2 },
  'error': { mood: 'frustrated', weight: 1 },
  'amazing': { mood: 'creative', weight: 2 },
  'cool': { mood: 'happy', weight: 1 },
  'bored': { mood: 'neutral', weight: 1 },
  'focused': { mood: 'focused', weight: 2 },
  'work': { mood: 'focused', weight: 1 },
}

class MoodEngine {
  private state: SoulState = {
    mood: 'neutral',
    energy: 3,
    lastMessageAt: Date.now(),
    sentimentScore: 0,
  }

  private userTag = 'paras'

  getMood(): UserMood {
    return this.state.mood
  }

  getEnergy(): EnergyLevel {
    return this.state.energy
  }

  async analyze(content: string) {
    const now = Date.now()
    const timeGap = now - this.state.lastMessageAt
    
    // 1. Energy Detection (based on speed)
    // Faster replies = higher energy
    let energyChange = 0
    if (timeGap < 5000) energyChange = 1
    if (timeGap > 60000) energyChange = -1
    
    this.state.energy = Math.max(1, Math.min(5, this.state.energy + energyChange)) as EnergyLevel
    this.state.lastMessageAt = now

    // 2. Keyword Sentiment
    const words = content.toLowerCase().split(/\s+/)
    let detectedMood: UserMood | null = null
    
    for (const word of words) {
      if (MOOD_KEYWORDS[word]) {
        detectedMood = MOOD_KEYWORDS[word].mood
        this.state.sentimentScore += MOOD_KEYWORDS[word].weight
      }
    }

    if (detectedMood) {
      this.state.mood = detectedMood
    }

    // 3. Proactive Sync to Supabase
    await this.syncToCloud(content)
    
    return this.state
  }

  getState() {
    return this.state
  }

  private async syncToCloud(content: string) {
    try {
      await supabase.from('mood_log').insert({
        user_tag: this.userTag,
        mood: this.state.mood,
        energy: this.state.energy,
        detected_from: content.substring(0, 100),
        recommendations: this.getRecommendations()
      })
    } catch (err) {
      console.warn('[MoodEngine] Failed to sync mood:', err)
    }
  }

  getRecommendations() {
    const recs = []
    if (this.state.mood === 'tired') {
      recs.push({ type: 'vfx', value: 'ken-burns-soft', label: 'Calm Cinematic Motion' })
    }
    if (this.state.energy > 4) {
      recs.push({ type: 'vfx', value: 'dolly-in', label: 'Dynamic Action Zoom' })
    }
    if (this.state.mood === 'creative') {
      recs.push({ type: 'quality', value: 'premium', label: 'Switch to High Fidelity' })
    }
    return recs
  }
}

export const moodEngine = new MoodEngine()
