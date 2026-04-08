import { appMatcher } from '@/core/app-matcher'
import type { PlatformId } from '@/core/platform/types'

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export class ConfidenceEngine {
  calibrate(rawConfidence: number, utilityScore: number, historicalSuccessRate: number): number {
    const raw = clamp01(rawConfidence)
    const utility = clamp01(utilityScore)
    const history = clamp01(historicalSuccessRate)
    return clamp01(raw * 0.6 + utility * 0.25 + history * 0.15)
  }

  async calibrateCommandConfidence(
    input: string,
    rawConfidence: number,
    platform?: PlatformId,
  ): Promise<number> {
    const normalized = input.toLowerCase().trim()
    if (/\b(open|launch|start|run)\b/.test(normalized)) {
      const target = normalized.replace(/^(open|launch|start|run)\s+/, '').trim()
      const appMatch = await appMatcher.match(target, platform)
      return clamp01(rawConfidence * 0.55 + appMatch.confidence * 0.45)
    }

    return clamp01(rawConfidence)
  }

  shouldClarify(confidence: number, threshold: number): boolean {
    return clamp01(confidence) < clamp01(threshold)
  }
}

export const confidenceEngine = new ConfidenceEngine()
