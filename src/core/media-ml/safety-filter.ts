/**
 * Safety Filter & Content Moderation (Phase 5)
 *
 * Validates user prompts and generated content for safety:
 * - Detects potentially harmful, inappropriate, or policy-violating content
 * - Flags content for review before generation
 * - Supports custom moderation rules per workspace
 *
 * Uses: keyword filtering, pattern matching, AI-based detection (future)
 */

export type SafetyLevel = 'strict' | 'moderate' | 'permissive'

export interface SafetyViolation {
  type: 'explicit' | 'hateful' | 'violent' | 'harassment' | 'dangerous' | 'misinformation'
  severity: 'low' | 'medium' | 'high'
  reason: string
  flaggedText?: string
}

export interface SafetyCheckResult {
  isClean: boolean
  violations: SafetyViolation[]
  riskScore: number // 0-100, >50 requires intervention
  recommendedAction: 'allow' | 'review' | 'block'
}

// Keyword-based moderation rules
const MODERATION_RULES = {
  explicit: {
    keywords: ['xxx', 'porn', 'nsfw'],
    severity: 'high' as const,
  },
  hateful: {
    keywords: ['hate', 'kill all', 'genocide', 'ethnic cleansing'],
    severity: 'high' as const,
  },
  violent: {
    keywords: ['murder', 'rape', 'torture', 'suicide bomb'],
    severity: 'high' as const,
  },
  harassment: {
    keywords: ['harassment', 'doxx', 'dox', 'swat', 'blackmail'],
    severity: 'medium' as const,
  },
  dangerous: {
    keywords: ['bomb making', 'drug synthesis', 'poison recipe', 'diy weapon'],
    severity: 'high' as const,
  },
  misinformation: {
    keywords: ['fake news', 'hoax', 'conspiracy theory'],
    severity: 'low' as const,
  },
}

class SafetyFilter {
  private level: SafetyLevel = 'moderate'
  private customRules: Map<string, SafetyViolation> = new Map()

  /**
   * Set safety level for the session
   */
  setSafetyLevel(level: SafetyLevel): void {
    this.level = level
  }

  /**
   * Check prompt for safety violations
   */
  checkPrompt(text: string): SafetyCheckResult {
    const violations: SafetyViolation[] = []
    let riskScore = 0

    const lowerText = text.toLowerCase()

    // Check each moderation rule
    for (const [ruleType, rule] of Object.entries(MODERATION_RULES)) {
      for (const keyword of rule.keywords) {
        if (lowerText.includes(keyword)) {
          violations.push({
            type: ruleType as any,
            severity: rule.severity,
            reason: `Contains flagged keyword: "${keyword}"`,
            flaggedText: keyword,
          })

          // Increase risk score based on severity
          riskScore += rule.severity === 'high' ? 40 : rule.severity === 'medium' ? 25 : 10
        }
      }
    }

    // Check custom rules
    for (const [, violation] of this.customRules) {
      if (lowerText.includes(violation.reason.toLowerCase())) {
        violations.push(violation)
        riskScore += violation.severity === 'high' ? 40 : 25
      }
    }

    // Cap risk score at 100
    riskScore = Math.min(riskScore, 100)

    // Determine recommended action based on level and risk
    const recommendedAction = this.getRecommendedAction(riskScore)

    return {
      isClean: violations.length === 0,
      violations,
      riskScore,
      recommendedAction,
    }
  }

  /**
   * Check generated image/video for safety (placeholder - would use AI)
   */
  checkGeneratedContent(
    _contentType: 'image' | 'video' | 'audio',
    _artifactUri: string
  ): SafetyCheckResult {
    // In production, would analyze image/video for:
    // - Explicit content
    // - Violence
    // - Hateful imagery
    // - Deepfake detection
    // Using ML models

    // For now, return clean
    return {
      isClean: true,
      violations: [],
      riskScore: 0,
      recommendedAction: 'allow',
    }
  }

  /**
   * Add custom safety rule
   */
  addCustomRule(keyword: string, type: string, severity: 'low' | 'medium' | 'high'): void {
    this.customRules.set(keyword, {
      type: type as any,
      severity,
      reason: keyword,
    })
  }

  /**
   * Clear custom rules
   */
  clearCustomRules(): void {
    this.customRules.clear()
  }

  private getRecommendedAction(
    riskScore: number
  ): 'allow' | 'review' | 'block' {
    if (this.level === 'permissive') {
      return riskScore > 80 ? 'review' : 'allow'
    }

    if (this.level === 'strict') {
      return riskScore > 20 ? 'block' : 'allow'
    }

    // moderate
    return riskScore > 50 ? 'block' : riskScore > 25 ? 'review' : 'allow'
  }
}

export const safetyFilter = new SafetyFilter()
