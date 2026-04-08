import { clamp01 } from './self_state_schema'

export interface ExecutionAdvisory {
  decision: 'execute' | 'clarify' | 'defer' | 'block'
  reason: string
  recommendedPriority: 'urgent' | 'high' | 'medium' | 'low'
  adjustedConfidenceFloor: number
  adjustedRiskCap: number
  shouldConfirm: boolean
  cooldownMs: number
  tags: string[]
}

export interface ExecutionAssessmentInput {
  taskType: string
  command: string
  confidence: number
  riskScore: number
  goalAlignmentScore: number
  goalDriftScore: number
  isCustom: boolean
  hasSensitiveSignals: boolean
}

export interface ExecutionOutcomeInput {
  taskType: string
  command: string
  success: boolean
  reason: string
  durationMs: number
  riskScore: number
  confidence: number
  goalAlignmentScore: number
  goalDriftScore: number
  decision: 'execute' | 'clarify' | 'defer' | 'block'
}

export interface ExecutionPattern {
  signature: string
  taskType: string
  attempts: number
  successes: number
  failures: number
  successRate: number
  averageRisk: number
  averageDurationMs: number
  lastOutcomeAt: number
  lastFailureReason?: string
}

export interface ExecutionOutcome {
  id: string
  timestamp: number
  taskType: string
  commandSignature: string
  success: boolean
  reason: string
  durationMs: number
  riskScore: number
  confidence: number
  goalAlignmentScore: number
  goalDriftScore: number
  decision: 'execute' | 'clarify' | 'defer' | 'block'
}

export interface ExecutionAdvisorSnapshot {
  patterns: ExecutionPattern[]
  recentOutcomes: ExecutionOutcome[]
  failureHotspots: string[]
  adaptiveThreshold: number
  adaptiveRiskCap: number
  adaptiveClarifyBias: number
  healthScore: number
  narrative: string
  updatedAt: number
  version: number
}

const STORAGE_KEY = 'Pixi.self_model.execution_advisor.v1'
const MAX_OUTCOMES = 180
const MAX_PATTERNS = 220

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function normalizeSignature(taskType: string, command: string): string {
  const normalizedCommand = String(command || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
  return `${taskType}:${normalizedCommand}`
}

class SelfExecutionAdvisor {
  private patterns = new Map<string, ExecutionPattern>()
  private outcomes: ExecutionOutcome[] = []
  private adaptiveThreshold = 0.62
  private adaptiveRiskCap = 0.75
  private adaptiveClarifyBias = 0.25
  private version = 1

  constructor() {
    this.hydrate()
  }

  assess(input: ExecutionAssessmentInput): ExecutionAdvisory {
    const signature = normalizeSignature(input.taskType, input.command)
    const pattern = this.patterns.get(signature)
    const successRate = pattern?.successRate ?? 0.7
    const failurePressure = pattern ? clamp01(pattern.failures / Math.max(1, pattern.attempts)) : 0.12

    const confidenceFloor = clamp01(this.adaptiveThreshold + failurePressure * 0.18 + input.goalDriftScore * 0.1)
    const riskCap = clamp01(this.adaptiveRiskCap - this.adaptiveClarifyBias * 0.12)

    const shouldClarify =
      input.confidence < confidenceFloor ||
      input.riskScore > riskCap ||
      input.goalDriftScore > 0.65 ||
      (input.isCustom && successRate < 0.45)

    const shouldBlock =
      input.hasSensitiveSignals && input.riskScore > 0.82 && input.goalAlignmentScore < 0.6

    const shouldDefer = !shouldBlock && !shouldClarify && input.riskScore > 0.78 && successRate < 0.5

    const decision: ExecutionAdvisory['decision'] = shouldBlock
      ? 'block'
      : shouldClarify
        ? 'clarify'
        : shouldDefer
          ? 'defer'
          : 'execute'

    const recommendedPriority = this.pickPriority(input.goalAlignmentScore, input.confidence, decision)
    const shouldConfirm = decision !== 'execute' || input.hasSensitiveSignals || input.riskScore > 0.72

    const reason = [
      `decision=${decision}`,
      `confidence=${input.confidence.toFixed(2)}`,
      `risk=${input.riskScore.toFixed(2)}`,
      `alignment=${input.goalAlignmentScore.toFixed(2)}`,
      `drift=${input.goalDriftScore.toFixed(2)}`,
      `pattern_success=${successRate.toFixed(2)}`,
    ].join(', ')

    return {
      decision,
      reason,
      recommendedPriority,
      adjustedConfidenceFloor: confidenceFloor,
      adjustedRiskCap: riskCap,
      shouldConfirm,
      cooldownMs: decision === 'defer' ? 45_000 : decision === 'clarify' ? 12_000 : 0,
      tags: this.buildTags(input, decision),
    }
  }

  recordOutcome(input: ExecutionOutcomeInput): void {
    const now = Date.now()
    const signature = normalizeSignature(input.taskType, input.command)

    const outcome: ExecutionOutcome = {
      id: makeId('exec_outcome'),
      timestamp: now,
      taskType: input.taskType,
      commandSignature: signature,
      success: input.success,
      reason: input.reason,
      durationMs: Math.max(0, input.durationMs),
      riskScore: clamp01(input.riskScore),
      confidence: clamp01(input.confidence),
      goalAlignmentScore: clamp01(input.goalAlignmentScore),
      goalDriftScore: clamp01(input.goalDriftScore),
      decision: input.decision,
    }

    this.outcomes.unshift(outcome)

    const existing = this.patterns.get(signature)
    const nextAttempts = (existing?.attempts ?? 0) + 1
    const nextSuccesses = (existing?.successes ?? 0) + (input.success ? 1 : 0)
    const nextFailures = (existing?.failures ?? 0) + (input.success ? 0 : 1)
    const nextAverageRisk = existing
      ? (existing.averageRisk * existing.attempts + outcome.riskScore) / nextAttempts
      : outcome.riskScore
    const nextAverageDuration = existing
      ? (existing.averageDurationMs * existing.attempts + outcome.durationMs) / nextAttempts
      : outcome.durationMs

    this.patterns.set(signature, {
      signature,
      taskType: input.taskType,
      attempts: nextAttempts,
      successes: nextSuccesses,
      failures: nextFailures,
      successRate: clamp01(nextSuccesses / Math.max(1, nextAttempts)),
      averageRisk: clamp01(nextAverageRisk),
      averageDurationMs: Math.max(0, nextAverageDuration),
      lastOutcomeAt: now,
      lastFailureReason: input.success ? existing?.lastFailureReason : input.reason,
    })

    this.recomputeAdaptiveParameters()
    this.trimCollections()
    this.version += 1
    this.persist()
  }

  getSnapshot(): ExecutionAdvisorSnapshot {
    const patterns = [...this.patterns.values()].sort((a, b) => b.attempts - a.attempts || b.lastOutcomeAt - a.lastOutcomeAt)
    const failures = this.outcomes.filter((outcome) => !outcome.success)
    const failureHotspots = Array.from(new Set(failures.slice(0, 6).map((outcome) => outcome.commandSignature)))
    const healthScore = this.computeHealthScore()

    return {
      patterns: patterns.slice(0, 60),
      recentOutcomes: this.outcomes.slice(0, 25),
      failureHotspots,
      adaptiveThreshold: this.adaptiveThreshold,
      adaptiveRiskCap: this.adaptiveRiskCap,
      adaptiveClarifyBias: this.adaptiveClarifyBias,
      healthScore,
      narrative: this.getNarrative(),
      updatedAt: Date.now(),
      version: this.version,
    }
  }

  getNarrative(): string {
    const top = [...this.patterns.values()]
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 3)
      .map((pattern) => `${pattern.taskType}:${Math.round(pattern.successRate * 100)}%/${pattern.attempts}`)
      .join(' | ')

    return [
      `threshold=${this.adaptiveThreshold.toFixed(2)}`,
      `risk_cap=${this.adaptiveRiskCap.toFixed(2)}`,
      `clarify_bias=${this.adaptiveClarifyBias.toFixed(2)}`,
      top ? `patterns=${top}` : 'patterns=none',
    ].join(' ; ')
  }

  private buildTags(input: ExecutionAssessmentInput, decision: ExecutionAdvisory['decision']): string[] {
    const tags = [input.taskType, decision]
    if (input.isCustom) tags.push('custom')
    if (input.hasSensitiveSignals) tags.push('sensitive')
    if (input.goalDriftScore > 0.6) tags.push('high_drift')
    if (input.riskScore > 0.75) tags.push('high_risk')
    return tags
  }

  private pickPriority(
    alignment: number,
    confidence: number,
    decision: ExecutionAdvisory['decision'],
  ): 'urgent' | 'high' | 'medium' | 'low' {
    if (decision === 'block' || decision === 'defer') return 'low'
    const score = alignment * 0.6 + confidence * 0.4
    if (score >= 0.85) return 'urgent'
    if (score >= 0.68) return 'high'
    if (score >= 0.5) return 'medium'
    return 'low'
  }

  private recomputeAdaptiveParameters(): void {
    const recent = this.outcomes.slice(0, 40)
    if (!recent.length) return

    const failureRate = recent.filter((outcome) => !outcome.success).length / recent.length
    const meanRisk = recent.reduce((sum, outcome) => sum + outcome.riskScore, 0) / recent.length
    const meanConfidence = recent.reduce((sum, outcome) => sum + outcome.confidence, 0) / recent.length

    this.adaptiveThreshold = clamp01(0.5 + failureRate * 0.25 + (0.65 - meanConfidence) * 0.2)
    this.adaptiveRiskCap = clamp01(0.85 - failureRate * 0.22 - Math.max(0, meanRisk - 0.6) * 0.18)
    this.adaptiveClarifyBias = clamp01(0.2 + failureRate * 0.35)
  }

  private computeHealthScore(): number {
    const recent = this.outcomes.slice(0, 50)
    if (!recent.length) {
      return 0.82
    }

    const successRate = recent.filter((outcome) => outcome.success).length / recent.length
    const averageRisk = recent.reduce((sum, outcome) => sum + outcome.riskScore, 0) / recent.length
    const averageDrift = recent.reduce((sum, outcome) => sum + outcome.goalDriftScore, 0) / recent.length

    return clamp01(successRate * 0.55 + (1 - averageRisk) * 0.2 + (1 - averageDrift) * 0.25)
  }

  private trimCollections(): void {
    if (this.outcomes.length > MAX_OUTCOMES) {
      this.outcomes = this.outcomes.slice(0, MAX_OUTCOMES)
    }

    if (this.patterns.size > MAX_PATTERNS) {
      const trimmed = [...this.patterns.values()]
        .sort((a, b) => b.attempts - a.attempts || b.lastOutcomeAt - a.lastOutcomeAt)
        .slice(0, MAX_PATTERNS)
      this.patterns = new Map(trimmed.map((pattern) => [pattern.signature, pattern]))
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.getSnapshot()))
    } catch {
      // Ignore persistence failures.
    }
  }

  private hydrate(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as Partial<ExecutionAdvisorSnapshot>
      const patterns = Array.isArray(parsed.patterns) ? parsed.patterns : []
      const outcomes = Array.isArray(parsed.recentOutcomes) ? parsed.recentOutcomes : []

      this.patterns = new Map(
        patterns
          .filter((pattern): pattern is ExecutionPattern => Boolean(pattern && pattern.signature && pattern.taskType))
          .map((pattern) => [pattern.signature, pattern]),
      )
      this.outcomes = outcomes.filter((outcome): outcome is ExecutionOutcome => Boolean(outcome && outcome.id && outcome.commandSignature))
      this.adaptiveThreshold = typeof parsed.adaptiveThreshold === 'number' ? clamp01(parsed.adaptiveThreshold) : 0.62
      this.adaptiveRiskCap = typeof parsed.adaptiveRiskCap === 'number' ? clamp01(parsed.adaptiveRiskCap) : 0.75
      this.adaptiveClarifyBias = typeof parsed.adaptiveClarifyBias === 'number' ? clamp01(parsed.adaptiveClarifyBias) : 0.25
      this.version = typeof parsed.version === 'number' ? parsed.version : 1
    } catch {
      this.patterns = new Map()
      this.outcomes = []
      this.adaptiveThreshold = 0.62
      this.adaptiveRiskCap = 0.75
      this.adaptiveClarifyBias = 0.25
      this.version = 1
    }
  }
}

export const selfExecutionAdvisor = new SelfExecutionAdvisor()

