/**
 * Quality Controller & Performance Gates (Phase 5)
 *
 * Manages quality targets and validates against performance metrics:
 * - Quality tier definitions (draft, standard, premium)
 * - Performance gates (min FPS, max latency, resolution requirements)
 * - Auto-downgrade if resources constrained
 * - Quality monitoring and recommendations
 */

export type QualityTier = 'draft' | 'standard' | 'premium'

export interface QualityMetrics {
  resolution: { width: number; height: number }
  fps: number
  codec: string
  bitrate: number // kbps
  maxLatencyMs: number
  colorDepth: number // bits per channel
}

export interface QualityGate {
  metric: string
  threshold: number
  operator: '>' | '<' | '==' | '>=' | '<='
  severity: 'warning' | 'error'
}

// Quality tier definitions
const QUALITY_TIERS: Record<QualityTier, QualityMetrics> = {
  draft: {
    resolution: { width: 640, height: 360 },
    fps: 24,
    codec: 'h264',
    bitrate: 1000, // 1 Mbps
    maxLatencyMs: 60000, // 1 minute acceptable
    colorDepth: 8,
  },
  standard: {
    resolution: { width: 1280, height: 720 },
    fps: 30,
    codec: 'h265',
    bitrate: 3000, // 3 Mbps
    maxLatencyMs: 30000, // 30 seconds
    colorDepth: 10,
  },
  premium: {
    resolution: { width: 1920, height: 1080 },
    fps: 60,
    codec: 'h265',
    bitrate: 8000, // 8 Mbps
    maxLatencyMs: 15000, // 15 seconds
    colorDepth: 10,
  },
}

// Default quality gates per tier
const QUALITY_GATES: Record<QualityTier, QualityGate[]> = {
  draft: [
    { metric: 'latency', threshold: 60000, operator: '<', severity: 'warning' },
    { metric: 'fps', threshold: 20, operator: '>=', severity: 'warning' },
  ],
  standard: [
    { metric: 'latency', threshold: 30000, operator: '<', severity: 'error' },
    { metric: 'fps', threshold: 25, operator: '>=', severity: 'error' },
    { metric: 'resolution', threshold: 1280 * 720, operator: '>=', severity: 'warning' },
  ],
  premium: [
    { metric: 'latency', threshold: 15000, operator: '<', severity: 'error' },
    { metric: 'fps', threshold: 50, operator: '>=', severity: 'error' },
    { metric: 'resolution', threshold: 1920 * 1080, operator: '>=', severity: 'error' },
    { metric: 'bitrate', threshold: 7000, operator: '>=', severity: 'warning' },
  ],
}

export interface QualityReport {
  tier: QualityTier
  metrics: QualityMetrics
  gatesPassed: number
  gatesFailed: number
  warnings: string[]
  errors: string[]
  recommendation?: QualityTier // Recommended downgrade if failing
}

class QualityController {
  /**
   * Get quality metrics for a tier
   */
  getQualityMetrics(tier: QualityTier): QualityMetrics {
    return QUALITY_TIERS[tier] || QUALITY_TIERS.standard
  }

  /**
   * Validate performance against quality gates
   */
  validateQuality(tier: QualityTier, measurements: Record<string, number>): QualityReport {
    const metrics = QUALITY_TIERS[tier]
    const gates = QUALITY_GATES[tier] || []

    const warnings: string[] = []
    const errors: string[] = []
    let gatesPassed = 0
    let gatesFailed = 0

    for (const gate of gates) {
      const value = measurements[gate.metric]
      if (value === undefined) {
        continue
      }

      let gatePassed = false
      switch (gate.operator) {
        case '>':
          gatePassed = value > gate.threshold
          break
        case '<':
          gatePassed = value < gate.threshold
          break
        case '>=':
          gatePassed = value >= gate.threshold
          break
        case '<=':
          gatePassed = value <= gate.threshold
          break
        case '==':
          gatePassed = value === gate.threshold
          break
      }

      if (gatePassed) {
        gatesPassed++
      } else {
        gatesFailed++
        const msg = `${gate.metric} ${gate.operator} ${gate.threshold} (actual: ${value})`
        if (gate.severity === 'error') {
          errors.push(msg)
        } else {
          warnings.push(msg)
        }
      }
    }

    // Recommend downgrade if many failures
    let recommendation: QualityTier | undefined
    if (errors.length > 0) {
      if (tier === 'premium') {
        recommendation = 'standard'
      } else if (tier === 'standard') {
        recommendation = 'draft'
      }
    }

    return {
      tier,
      metrics,
      gatesPassed,
      gatesFailed,
      warnings,
      errors,
      recommendation,
    }
  }

  /**
   * Auto-select quality tier based on device capabilities
   */
  selectTierForDevice(capabilities: {
    gpuMemoryMB?: number
    cpuCores?: number
    ramGB?: number
    networkSpeedMbps?: number
  }): QualityTier {
    // Simple heuristics
    const gpuMemory = capabilities.gpuMemoryMB || 0
    const ram = capabilities.ramGB || 0
    const network = capabilities.networkSpeedMbps || 0

    // Premium: high-end GPU, 16GB+ RAM, 25+ Mbps network
    if (gpuMemory > 6000 && ram >= 16 && network >= 25) {
      return 'premium'
    }

    // Standard: 4GB+ GPU, 8GB+ RAM, 10+ Mbps network
    if (gpuMemory >= 4000 && ram >= 8 && network >= 10) {
      return 'standard'
    }

    // Draft: constrained resources
    return 'draft'
  }

  /**
   * Estimate processing time for quality tier
   */
  estimateProcessingTime(tier: QualityTier, contentLengthSeconds: number): number {
    // Rough estimates (these would be trained on real data)
    const baseTimes: Record<QualityTier, number> = {
      draft: 2, // 2x realtime
      standard: 5, // 5x realtime
      premium: 15, // 15x realtime
    }

    const factor = baseTimes[tier]
    return contentLengthSeconds * factor
  }

  /**
   * Get recommended tier for use case
   */
  recommendTierForUseCase(useCase: string): QualityTier {
    const recommendations: Record<string, QualityTier> = {
      preview: 'draft',
      prototype: 'draft',
      internal: 'standard',
      presentation: 'standard',
      social: 'standard',
      broadcast: 'premium',
      cinema: 'premium',
      archive: 'premium',
    }

    return recommendations[useCase.toLowerCase()] || 'standard'
  }

  /**
   * Calculate file size estimate for quality tier and duration
   */
  estimateFileSize(tier: QualityTier, durationSeconds: number): number {
    const metrics = QUALITY_TIERS[tier]
    // bitrate (kbps) * duration (s) * 1000 (bytes) / 8 = bytes
    return (metrics.bitrate * durationSeconds * 1000) / 8
  }

  /**
   * Get human-readable size
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

export const qualityController = new QualityController()
