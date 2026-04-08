/**
 * Sentiment Analysis Engine - Local Emotion Detection
 * 
 * No API calls, all inference local.
 * Uses pattern matching + simple neural patterns for emotion classification.
 */

export type Sentiment = 'positive' | 'negative' | 'neutral' | 'mixed'
export type Emotion = 'happy' | 'sad' | 'angry' | 'scared' | 'surprised' | 'neutral'

export interface SentimentResult {
  sentiment: Sentiment
  emotion: Emotion
  score: number // 0-1 confidence
  keywords: string[]
  intensityLevel: 'low' | 'medium' | 'high'
  explanation: string
}

class SentimentAnalyzer {
  private readonly positiveKeywords = {
    high: ['love', 'amazing', 'wonderful', 'excellent', 'fantastic', 'fantastic', 'perfect', 'awesome', 'incredible', 'brilliant'],
    medium: ['good', 'nice', 'great', 'helpful', 'kind', 'beautiful', 'smart', 'clever', 'fun', 'interesting'],
    low: ['okay', 'fine', 'decent', 'alright', 'good enough'],
  }

  private readonly negativeKeywords = {
    high: ['hate', 'terrible', 'awful', 'horrible', 'disgusting', 'pathetic', 'worthless', 'despicable'],
    medium: ['bad', 'sad', 'upset', 'disappointed', 'frustrated', 'annoyed', 'confused'],
    low: ['okay', 'not bad', 'meh', 'whatever'],
  }

  private readonly emotionKeywords: Record<Emotion, string[]> = {
    happy: ['happy', 'excited', 'joyful', 'delighted', 'thrilled', 'pleased', 'glad', 'cheerful', 'celebrate', 'wonderful'],
    sad: ['sad', 'depressed', 'unhappy', 'down', 'miserable', 'heartbroken', 'grief', 'tragic', 'loss'],
    angry: ['angry', 'furious', 'rage', 'upset', 'frustrated', 'irritated', 'annoyed', 'livid', 'mad', 'enraged'],
    scared: ['scared', 'afraid', 'terrified', 'nervous', 'worried', 'anxious', 'panic', 'frightened', 'horror'],
    surprised: ['surprised', 'shocked', 'amazed', 'astonished', 'stunned', 'blow my mind', 'incredible'],
    neutral: [],
  }

  private readonly emoticons: Record<string, Emotion> = {
    '😊': 'happy',
    '😄': 'happy',
    '😃': 'happy',
    '😢': 'sad',
    '😭': 'sad',
    '😠': 'angry',
    '😡': 'angry',
    '😱': 'scared',
    '🤩': 'surprised',
  }

  private readonly intensifiers = ['really', 'very', 'so', 'extremely', 'incredibly', 'absolutely', 'totally']
  private readonly diminishers = ['kind of', 'sort of', 'quite', 'rather', 'somewhat', 'maybe']
  private readonly negations = ["isn't", "isn't", 'not', "don't", "doesn't", 'no', 'never']

  /**
   * Analyze sentiment of text
   */
  analyze(text: string): SentimentResult {
    const lower = text.toLowerCase()
    
    // Check for emoticons first (highest confidence)
    for (const [emoticon, emotion] of Object.entries(this.emoticons)) {
      if (text.includes(emoticon)) {
        return this.createResult(emotion, this.sentimentFromEmotion(emotion), lower)
      }
    }

    // Detect emotion keywords
    const detectedEmotion = this.detectEmotion(lower)
    const detectedSentiment = this.detectSentiment(lower)
    const intensity = this.calculateIntensity(lower)
    const keywords = this.extractKeywords(lower)

    const explanation = this.generateExplanation(detectedEmotion, detectedSentiment, intensity, keywords)

    return {
      sentiment: detectedSentiment,
      emotion: detectedEmotion,
      score: this.calculateConfidence(keywords.length, intensity),
      keywords,
      intensityLevel: intensity,
      explanation,
    }
  }

  /**
   * Batch analyze multiple texts
   */
  analyzeBatch(texts: string[]): SentimentResult[] {
    return texts.map(text => this.analyze(text))
  }

  /**
   * Get emotional trajectory (mood changes over time)
   */
  getEmotionalTrajectory(texts: string[]): Array<{ text: string; emotion: Emotion }> {
    return texts.map(text => ({
      text,
      emotion: this.analyze(text).emotion,
    }))
  }

  /**
   * Compare sentiment between two texts
   */
  compare(text1: string, text2: string): { positiveShift: boolean; magnitude: number } {
    const result1 = this.analyze(text1)
    const result2 = this.analyze(text2)

    const score1 = result1.sentiment === 'positive' ? result1.score : -result1.score
    const score2 = result2.sentiment === 'positive' ? result2.score : -result2.score

    return {
      positiveShift: score2 > score1,
      magnitude: Math.abs(score2 - score1),
    }
  }

  /**
   * Detect sarcasm/irony (simple heuristic)
   */
  detectSarcasm(text: string): boolean {
    const lower = text.toLowerCase()
    // If positive words with negative context OR negative with positive context
    const hasPositive = this.positiveKeywords.high.some(w => lower.includes(w)) ||
                        this.positiveKeywords.medium.some(w => lower.includes(w))
    const hasNegative = this.negativeKeywords.high.some(w => lower.includes(w)) ||
                        this.negativeKeywords.medium.some(w => lower.includes(w))

    // Sarcasm often has contradictory emotional signals
    return hasPositive && hasNegative && (lower.includes('right') || lower.includes('sure') || lower.includes('yeah'))
  }

  /**
   * Get a response modifier based on sentiment
   */
  getResponseModifier(result: SentimentResult): string {
    if (result.emotion === 'happy') return 'cheerful'
    if (result.emotion === 'sad') return 'sympathetic'
    if (result.emotion === 'angry') return 'calm'
    if (result.emotion === 'scared') return 'reassuring'
    if (result.emotion === 'surprised') return 'excited'
    return 'empathetic'
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────

  private detectEmotion(text: string): Emotion {
    for (const [emotion, keywords] of Object.entries(this.emotionKeywords)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          return emotion as Emotion
        }
      }
    }
    return 'neutral'
  }

  private detectSentiment(text: string): Sentiment {
    let positiveCount = 0
    let negativeCount = 0

    // Check high-intensity keywords
    for (const word of this.positiveKeywords.high) {
      if (text.includes(word)) positiveCount += 3
    }
    for (const word of this.positiveKeywords.medium) {
      if (text.includes(word)) positiveCount += 2
    }
    for (const word of this.positiveKeywords.low) {
      if (text.includes(word)) positiveCount += 1
    }

    for (const word of this.negativeKeywords.high) {
      if (text.includes(word)) negativeCount += 3
    }
    for (const word of this.negativeKeywords.medium) {
      if (text.includes(word)) negativeCount += 2
    }
    for (const word of this.negativeKeywords.low) {
      if (text.includes(word)) negativeCount += 1
    }

    // Check for negation (flips sentiment)
    for (const negation of this.negations) {
      if (text.includes(negation)) {
        const after = text.split(negation)[1]
        if (after) {
          if (this.positiveKeywords.high.some(w => after.includes(w))) {
            positiveCount -= 2
            negativeCount += 2
          }
        }
      }
    }

    if (positiveCount > negativeCount) return 'positive'
    if (negativeCount > positiveCount) return 'negative'
    if (positiveCount > 0 || negativeCount > 0) return 'mixed'
    return 'neutral'
  }

  private calculateIntensity(text: string): 'low' | 'medium' | 'high' {
    let score = 0

    // Check intensifiers
    for (const intensifier of this.intensifiers) {
      if (text.includes(intensifier)) score += 2
    }

    for (const diminisher of this.diminishers) {
      if (text.includes(diminisher)) score = Math.max(0, score - 1)
    }

    // Check for multiple exclamation marks or caps
    const exclamations = (text.match(/!/g) || []).length
    score += Math.min(exclamations, 3)

    const allCaps = (text.match(/[A-Z]{5,}/g) || []).length
    score += allCaps * 2

    if (score >= 5) return 'high'
    if (score >= 2) return 'medium'
    return 'low'
  }

  private calculateConfidence(keywordCount: number, intensity: string): number {
    let confidence = 0.5

    confidence += Math.min(keywordCount * 0.1, 0.3)

    if (intensity === 'high') confidence += 0.15
    if (intensity === 'medium') confidence += 0.08

    return Math.min(confidence, 0.95)
  }

  private extractKeywords(text: string): string[] {
    const keywords = new Set<string>()

    for (const word of this.positiveKeywords.high) {
      if (text.includes(word)) keywords.add(word)
    }
    for (const word of this.negativeKeywords.high) {
      if (text.includes(word)) keywords.add(word)
    }
    for (const keywordGroup of Object.values(this.emotionKeywords)) {
      for (const word of keywordGroup) {
        if (text.includes(word)) keywords.add(word)
      }
    }

    return Array.from(keywords)
  }

  private sentimentFromEmotion(emotion: Emotion): Sentiment {
    if (emotion === 'happy' || emotion === 'surprised') return 'positive'
    if (emotion === 'sad' || emotion === 'angry' || emotion === 'scared') return 'negative'
    return 'neutral'
  }

  private createResult(emotion: Emotion, sentiment: Sentiment, text: string): SentimentResult {
    return {
      sentiment,
      emotion,
      score: 0.9,
      keywords: this.extractKeywords(text),
      intensityLevel: 'high',
      explanation: `Detected strong ${emotion} emotion.`,
    }
  }

  private generateExplanation(emotion: Emotion, sentiment: Sentiment, intensity: 'low' | 'medium' | 'high', keywords: string[]): string {
    if (keywords.length === 0) {
      return 'Neutral sentiment, no strong emotional indicators detected.'
    }

    const intensityText = intensity === 'high' ? 'strongly' : intensity === 'medium' ? 'moderately' : 'slightly'
    return `Detected ${intensityText} ${sentiment} sentiment with ${emotion} emotion. Keywords: ${keywords.join(', ')}`
  }
}

export const sentimentAnalyzer = new SentimentAnalyzer()
