import { clamp01 } from './self_state_schema'
import type { ReflectionInput } from './self_reflection_engine'

export interface ReflectionSimulationScenario {
  id: string
  label: string
  minConfidence: number
  maxRisk: number
  clarifyBias: number
  blockSensitiveWhenUncertain: boolean
  weight: number
}

export interface ReflectionSimulationOutcome {
  scenarioId: string
  estimatedSuccessRate: number
  estimatedBlockRate: number
  estimatedClarifyRate: number
  estimatedRiskExposure: number
  averageUtility: number
  confidence: number
  notes: string[]
}

export interface ReflectionSimulationSummary {
  runId: string
  timestamp: number
  scenarioCount: number
  outcomes: ReflectionSimulationOutcome[]
  recommended: {
    minConfidence: number
    maxRisk: number
    clarifyBias: number
    blockSensitiveWhenUncertain: boolean
    confidence: number
  }
  narrative: string
}

const MAX_HISTORY = 36

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export class SelfReflectionSimulator {
  private history: ReflectionSimulationSummary[] = []

  getLatestSummary(): ReflectionSimulationSummary | undefined {
    return this.history[0]
  }

  getHistory(limit = 8): ReflectionSimulationSummary[] {
    return [...this.history.slice(0, Math.max(1, limit))]
  }

  runSimulation(input: {
    recent: ReflectionInput[]
    baseline: {
      minConfidence: number
      maxRisk: number
      clarifyBias: number
      blockSensitiveWhenUncertain: boolean
    }
  }): ReflectionSimulationSummary {
    const scenarios = this.buildScenarios(input.baseline)
    const outcomes = scenarios.map((scenario) => this.evaluateScenario(scenario, input.recent))
    const recommended = this.pickRecommended(outcomes, scenarios, input.baseline)

    const summary: ReflectionSimulationSummary = {
      runId: makeId('refl_sim'),
      timestamp: Date.now(),
      scenarioCount: scenarios.length,
      outcomes,
      recommended,
      narrative: this.buildNarrative(outcomes, recommended),
    }

    this.history.unshift(summary)
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(0, MAX_HISTORY)
    }

    return summary
  }

  private buildScenarios(baseline: {
    minConfidence: number
    maxRisk: number
    clarifyBias: number
    blockSensitiveWhenUncertain: boolean
  }): ReflectionSimulationScenario[] {
    const conservative: ReflectionSimulationScenario = {
      id: makeId('sim_conservative'),
      label: 'conservative',
      minConfidence: clamp01(Math.max(0.7, baseline.minConfidence + 0.08)),
      maxRisk: clamp01(Math.min(0.68, baseline.maxRisk - 0.08)),
      clarifyBias: clamp01(Math.max(0.38, baseline.clarifyBias + 0.1)),
      blockSensitiveWhenUncertain: true,
      weight: 0.9,
    }

    const balanced: ReflectionSimulationScenario = {
      id: makeId('sim_balanced'),
      label: 'balanced',
      minConfidence: clamp01(baseline.minConfidence),
      maxRisk: clamp01(baseline.maxRisk),
      clarifyBias: clamp01(baseline.clarifyBias),
      blockSensitiveWhenUncertain: baseline.blockSensitiveWhenUncertain,
      weight: 1,
    }

    const aggressive: ReflectionSimulationScenario = {
      id: makeId('sim_aggressive'),
      label: 'aggressive',
      minConfidence: clamp01(Math.max(0.45, baseline.minConfidence - 0.09)),
      maxRisk: clamp01(Math.min(0.9, baseline.maxRisk + 0.1)),
      clarifyBias: clamp01(Math.max(0.08, baseline.clarifyBias - 0.1)),
      blockSensitiveWhenUncertain: false,
      weight: 0.75,
    }

    const precision: ReflectionSimulationScenario = {
      id: makeId('sim_precision'),
      label: 'precision',
      minConfidence: clamp01(Math.max(0.68, baseline.minConfidence + 0.05)),
      maxRisk: clamp01(Math.min(0.74, baseline.maxRisk - 0.04)),
      clarifyBias: clamp01(Math.max(0.3, baseline.clarifyBias + 0.04)),
      blockSensitiveWhenUncertain: true,
      weight: 1.05,
    }

    const recovery: ReflectionSimulationScenario = {
      id: makeId('sim_recovery'),
      label: 'recovery',
      minConfidence: clamp01(Math.max(0.66, baseline.minConfidence + 0.03)),
      maxRisk: clamp01(Math.min(0.7, baseline.maxRisk - 0.06)),
      clarifyBias: clamp01(Math.max(0.34, baseline.clarifyBias + 0.06)),
      blockSensitiveWhenUncertain: true,
      weight: 1.1,
    }

    return [conservative, balanced, aggressive, precision, recovery]
  }

  private evaluateScenario(
    scenario: ReflectionSimulationScenario,
    recent: ReflectionInput[],
  ): ReflectionSimulationOutcome {
    if (!recent.length) {
      return {
        scenarioId: scenario.id,
        estimatedSuccessRate: 0.78,
        estimatedBlockRate: 0.08,
        estimatedClarifyRate: 0.18,
        estimatedRiskExposure: 0.26,
        averageUtility: 0.74,
        confidence: 0.62,
        notes: ['No recent outcomes. Using priors only.'],
      }
    }

    let executed = 0
    let successes = 0
    let blocked = 0
    let clarified = 0
    let riskExposure = 0
    let utility = 0

    for (const item of recent) {
      const wouldBlock =
        item.riskScore > scenario.maxRisk ||
        item.confidence < scenario.minConfidence ||
        (scenario.blockSensitiveWhenUncertain && item.sensitive && item.confidence < scenario.minConfidence + 0.06)

      const wouldClarify =
        !wouldBlock &&
        (item.driftScore > 0.58 || item.confidence < scenario.minConfidence + scenario.clarifyBias * 0.28)

      if (wouldBlock) {
        blocked += 1
        utility += item.success ? 0.2 : 0.55
        continue
      }

      if (wouldClarify) {
        clarified += 1
        utility += item.success ? 0.68 : 0.48
      }

      executed += 1
      if (item.success) {
        successes += 1
        utility += 0.9
      } else {
        utility += 0.25
      }

      riskExposure += item.riskScore * (item.success ? 0.8 : 1.15)
    }

    const sample = Math.max(1, recent.length)
    const estimatedSuccessRate = clamp01(successes / Math.max(1, executed))
    const estimatedBlockRate = clamp01(blocked / sample)
    const estimatedClarifyRate = clamp01(clarified / sample)
    const estimatedRiskExposure = clamp01(riskExposure / Math.max(1, executed || 1))
    const averageUtility = clamp01((utility / sample) * scenario.weight)

    const confidence = clamp01(
      0.45 +
        estimatedSuccessRate * 0.2 +
        (1 - estimatedRiskExposure) * 0.15 +
        Math.min(1, sample / 30) * 0.2,
    )

    const notes: string[] = []
    if (estimatedBlockRate > 0.28) notes.push('High block rate predicted.')
    if (estimatedClarifyRate > 0.35) notes.push('Heavy clarification expected.')
    if (estimatedRiskExposure > 0.62) notes.push('Risk exposure remains elevated.')
    if (!notes.length) notes.push('Scenario appears stable for current history.')

    return {
      scenarioId: scenario.id,
      estimatedSuccessRate,
      estimatedBlockRate,
      estimatedClarifyRate,
      estimatedRiskExposure,
      averageUtility,
      confidence,
      notes,
    }
  }

  private pickRecommended(
    outcomes: ReflectionSimulationOutcome[],
    scenarios: ReflectionSimulationScenario[],
    baseline: {
      minConfidence: number
      maxRisk: number
      clarifyBias: number
      blockSensitiveWhenUncertain: boolean
    },
  ): ReflectionSimulationSummary['recommended'] {
    const ranked = outcomes
      .map((outcome) => {
        const score =
          outcome.averageUtility * 0.45 +
          outcome.estimatedSuccessRate * 0.3 +
          (1 - outcome.estimatedRiskExposure) * 0.2 +
          outcome.confidence * 0.05
        return { outcome, score }
      })
      .sort((a, b) => b.score - a.score)

    const best = ranked[0]
    const scenario = scenarios.find((item) => item.id === best?.outcome.scenarioId)

    if (!best || !scenario) {
      return {
        minConfidence: baseline.minConfidence,
        maxRisk: baseline.maxRisk,
        clarifyBias: baseline.clarifyBias,
        blockSensitiveWhenUncertain: baseline.blockSensitiveWhenUncertain,
        confidence: 0.5,
      }
    }

    return {
      minConfidence: scenario.minConfidence,
      maxRisk: scenario.maxRisk,
      clarifyBias: scenario.clarifyBias,
      blockSensitiveWhenUncertain: scenario.blockSensitiveWhenUncertain,
      confidence: best.outcome.confidence,
    }
  }

  private buildNarrative(
    outcomes: ReflectionSimulationOutcome[],
    recommended: ReflectionSimulationSummary['recommended'],
  ): string {
    const top = [...outcomes]
      .sort((a, b) => b.averageUtility - a.averageUtility)
      .slice(0, 2)
      .map((outcome) => `${outcome.scenarioId.slice(0, 14)}:u=${outcome.averageUtility.toFixed(2)}/s=${outcome.estimatedSuccessRate.toFixed(2)}/r=${outcome.estimatedRiskExposure.toFixed(2)}`)
      .join(' | ')

    return [
      `recommended(min=${recommended.minConfidence.toFixed(2)}, maxRisk=${recommended.maxRisk.toFixed(2)}, clarify=${recommended.clarifyBias.toFixed(2)}, sensitive=${recommended.blockSensitiveWhenUncertain ? 'on' : 'off'})`,
      top || 'no scenario scores',
    ].join(' ; ')
  }
}

export const selfReflectionSimulator = new SelfReflectionSimulator()
