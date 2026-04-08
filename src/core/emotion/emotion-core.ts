export type EmotionLabel =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'relaxed'
  | 'fear'

export type ReactionStyle =
  | 'calm_supportive'
  | 'warm_enthusiastic'
  | 'gentle_reassuring'
  | 'firm_precise'
  | 'alert_brief'
  | 'steady_balanced'

export interface EmotionSnapshot {
  emotion: EmotionLabel
  confidence: number
  intensity: number
  valence: number
  arousal: number
  reactionStyle: ReactionStyle
  decayMs: number
  source: 'text' | 'voice' | 'hybrid'
  detectedAt: number
}

export interface EmotionTurn {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface EmotionReactionPolicy {
  trend: 'escalating' | 'cooling' | 'stable' | 'volatile'
  styleBias: 'deescalate' | 'reassure' | 'energize' | 'steady'
  responsePacing: 'brief' | 'balanced' | 'detailed'
  carryOverMs: number
}

export interface ResolvedEmotionState {
  snapshot: EmotionSnapshot
  policy: EmotionReactionPolicy
}

interface EmotionProfile {
  emotion: EmotionLabel
  valence: number
  arousal: number
  baseReactionStyle: ReactionStyle
  decayMs: number
}

const PROFILES: Record<EmotionLabel, EmotionProfile> = {
  neutral: {
    emotion: 'neutral',
    valence: 0,
    arousal: 0.35,
    baseReactionStyle: 'steady_balanced',
    decayMs: 7000,
  },
  happy: {
    emotion: 'happy',
    valence: 0.85,
    arousal: 0.72,
    baseReactionStyle: 'warm_enthusiastic',
    decayMs: 9000,
  },
  sad: {
    emotion: 'sad',
    valence: -0.65,
    arousal: 0.28,
    baseReactionStyle: 'gentle_reassuring',
    decayMs: 12000,
  },
  angry: {
    emotion: 'angry',
    valence: -0.75,
    arousal: 0.82,
    baseReactionStyle: 'firm_precise',
    decayMs: 8000,
  },
  surprised: {
    emotion: 'surprised',
    valence: 0.1,
    arousal: 0.9,
    baseReactionStyle: 'alert_brief',
    decayMs: 5000,
  },
  relaxed: {
    emotion: 'relaxed',
    valence: 0.55,
    arousal: 0.22,
    baseReactionStyle: 'calm_supportive',
    decayMs: 11000,
  },
  fear: {
    emotion: 'fear',
    valence: -0.8,
    arousal: 0.76,
    baseReactionStyle: 'gentle_reassuring',
    decayMs: 7000,
  },
}

const EMOTION_KEYWORDS: Record<EmotionLabel, string[]> = {
  neutral: ['okay', 'fine', 'normal', 'alright'],
  happy: ['happy', 'great', 'awesome', 'nice', 'love', 'excited', 'amazing', 'good'],
  sad: ['sad', 'down', 'upset', 'low', 'hurt', 'disappointed', 'lonely', 'tired'],
  angry: ['angry', 'mad', 'annoyed', 'frustrated', 'hate', 'wtf', 'broken', 'stupid'],
  surprised: ['wow', 'what', 'unexpected', 'surprised', 'really', 'seriously', 'omg'],
  relaxed: ['calm', 'chill', 'relaxed', 'peaceful', 'slow', 'steady'],
  fear: ['afraid', 'scared', 'fear', 'anxious', 'worry', 'panic', 'unsafe'],
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean)
}

function pickReactionStyle(emotion: EmotionLabel, intensity: number): ReactionStyle {
  const profile = PROFILES[emotion]
  if (emotion === 'sad' && intensity > 0.65) return 'calm_supportive'
  if (emotion === 'angry' && intensity > 0.65) return 'firm_precise'
  if (emotion === 'surprised' && intensity > 0.7) return 'alert_brief'
  return profile.baseReactionStyle
}

function computeIntensity(matches: number, tokenCount: number): number {
  if (tokenCount <= 0) return 0.35
  const density = matches / tokenCount
  return clamp(0.35 + density * 2.1, 0.2, 1)
}

function computeConfidence(topScore: number, totalHits: number): number {
  if (totalHits <= 0) return 0.32
  const dominance = topScore / Math.max(1, totalHits)
  return clamp(0.42 + dominance * 0.52, 0.32, 0.97)
}

function toMoodLabel(emotion: EmotionLabel): string {
  switch (emotion) {
    case 'happy':
      return 'excited'
    case 'sad':
      return 'tired'
    case 'angry':
      return 'frustrated'
    case 'surprised':
      return 'focused'
    case 'relaxed':
      return 'calm'
    case 'fear':
      return 'stressed'
    default:
      return 'neutral'
  }
}

class EmotionCore {
  private lastResolved: EmotionSnapshot | null = null

  analyzeText(text: string, source: EmotionSnapshot['source'] = 'text'): EmotionSnapshot {
    const tokens = tokenize(text)
    const scores: Record<EmotionLabel, number> = {
      neutral: 0,
      happy: 0,
      sad: 0,
      angry: 0,
      surprised: 0,
      relaxed: 0,
      fear: 0,
    }

    for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS) as Array<[EmotionLabel, string[]]>) {
      for (const keyword of keywords) {
        if (tokens.includes(keyword)) {
          scores[emotion] += 1
        }
      }
    }

    const totalHits = Object.values(scores).reduce((sum, score) => sum + score, 0)
    const ranked = (Object.entries(scores) as Array<[EmotionLabel, number]>).sort((a, b) => b[1] - a[1])
    const [topEmotion, topScore] = ranked[0]

    const confidence = computeConfidence(topScore, totalHits)
    const downgradedEmotion: EmotionLabel = confidence < 0.45 ? 'neutral' : topEmotion
    const intensity = downgradedEmotion === 'neutral'
      ? 0.3
      : computeIntensity(topScore, Math.max(1, tokens.length))
    const profile = PROFILES[downgradedEmotion]

    return {
      emotion: downgradedEmotion,
      confidence,
      intensity,
      valence: profile.valence,
      arousal: profile.arousal,
      reactionStyle: pickReactionStyle(downgradedEmotion, intensity),
      decayMs: profile.decayMs,
      source,
      detectedAt: Date.now(),
    }
  }

  resolveWithDecay(base: EmotionSnapshot, recentTurns: EmotionTurn[] = []): ResolvedEmotionState {
    const now = Date.now()
    const userTurns = recentTurns
      .filter((turn) => turn.role === 'user')
      .slice(-6)

    if (!userTurns.length) {
      const policy = this.buildReactionPolicy(base, this.lastResolved)
      this.lastResolved = base
      return { snapshot: base, policy }
    }

    const scores: Record<EmotionLabel, number> = {
      neutral: 0,
      happy: 0,
      sad: 0,
      angry: 0,
      surprised: 0,
      relaxed: 0,
      fear: 0,
    }

    let weightedValence = base.valence * 1.4
    let weightedArousal = base.arousal * 1.4
    let weightedIntensity = base.intensity * 1.4
    let weightedConfidence = base.confidence * 1.4
    let totalWeight = 1.4
    scores[base.emotion] += 1.4 * Math.max(0.2, base.confidence)

    for (const turn of userTurns) {
      const inferred = this.analyzeText(turn.content, 'text')
      const ageMs = Math.max(0, now - turn.timestamp)
      const weight = Math.exp(-ageMs / Math.max(1000, inferred.decayMs))
      totalWeight += weight
      weightedValence += inferred.valence * weight
      weightedArousal += inferred.arousal * weight
      weightedIntensity += inferred.intensity * weight
      weightedConfidence += inferred.confidence * weight
      scores[inferred.emotion] += weight * Math.max(0.2, inferred.confidence)
    }

    const ranked = (Object.entries(scores) as Array<[EmotionLabel, number]>).sort((a, b) => b[1] - a[1])
    const dominant = ranked[0]?.[0] || base.emotion
    const confidence = clamp(weightedConfidence / Math.max(totalWeight, 1), 0.32, 0.97)
    const resolvedEmotion: EmotionLabel = confidence < 0.45 ? 'neutral' : dominant
    const profile = PROFILES[resolvedEmotion]
    const intensity = clamp(weightedIntensity / Math.max(totalWeight, 1), 0.2, 1)

    const resolved: EmotionSnapshot = {
      emotion: resolvedEmotion,
      confidence,
      intensity,
      valence: clamp(weightedValence / Math.max(totalWeight, 1), -1, 1),
      arousal: clamp(weightedArousal / Math.max(totalWeight, 1), 0, 1),
      reactionStyle: pickReactionStyle(resolvedEmotion, intensity),
      decayMs: profile.decayMs,
      source: base.source,
      detectedAt: now,
    }

    const policy = this.buildReactionPolicy(resolved, this.lastResolved)
    this.lastResolved = resolved
    return { snapshot: resolved, policy }
  }

  buildReactionPolicy(current: EmotionSnapshot, previous?: EmotionSnapshot | null): EmotionReactionPolicy {
    if (!previous) {
      return {
        trend: 'stable',
        styleBias: current.emotion === 'happy' ? 'energize' : current.emotion === 'sad' || current.emotion === 'fear' ? 'reassure' : 'steady',
        responsePacing: current.arousal > 0.78 ? 'brief' : current.emotion === 'sad' ? 'detailed' : 'balanced',
        carryOverMs: current.decayMs,
      }
    }

    const arousalDelta = current.arousal - previous.arousal
    const valenceDelta = current.valence - previous.valence
    const emotionShifted = current.emotion !== previous.emotion
    const volatility = Math.abs(arousalDelta) + (emotionShifted ? 0.35 : 0)

    let trend: EmotionReactionPolicy['trend'] = 'stable'
    if (volatility > 0.6) trend = 'volatile'
    else if (arousalDelta > 0.1 || valenceDelta < -0.15) trend = 'escalating'
    else if (arousalDelta < -0.1 || valenceDelta > 0.15) trend = 'cooling'

    let styleBias: EmotionReactionPolicy['styleBias'] = 'steady'
    if (current.emotion === 'angry' || current.emotion === 'fear' || trend === 'escalating') styleBias = 'deescalate'
    else if (current.emotion === 'sad') styleBias = 'reassure'
    else if (current.emotion === 'happy' && current.intensity > 0.55) styleBias = 'energize'

    const responsePacing: EmotionReactionPolicy['responsePacing'] =
      trend === 'volatile' || current.arousal > 0.82
        ? 'brief'
        : current.emotion === 'sad' || current.emotion === 'fear'
          ? 'detailed'
          : 'balanced'

    return {
      trend,
      styleBias,
      responsePacing,
      carryOverMs: Math.round((current.decayMs + previous.decayMs) / 2),
    }
  }

  toMoodLabel(emotion: EmotionLabel): string {
    return toMoodLabel(emotion)
  }

  serialize(snapshot: EmotionSnapshot): string {
    return [
      `emotion=${snapshot.emotion}`,
      `confidence=${snapshot.confidence.toFixed(2)}`,
      `intensity=${snapshot.intensity.toFixed(2)}`,
      `valence=${snapshot.valence.toFixed(2)}`,
      `arousal=${snapshot.arousal.toFixed(2)}`,
      `reaction=${snapshot.reactionStyle}`,
      `decayMs=${snapshot.decayMs}`,
      `source=${snapshot.source}`,
    ].join(' ; ')
  }
}

export const emotionCore = new EmotionCore()
