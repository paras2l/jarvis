import { PixiContextModel, PixiPlan, PixiWorldModelDecision } from './types'

class WorldModelingEngine {
  simulate(goal: string, plan: PixiPlan, context: PixiContextModel): PixiWorldModelDecision {
    const options: PixiWorldModelDecision['options'] = []

    const cautiousScore = this.scoreOption('cautious', goal, plan, context)
    options.push({
      strategyId: 'cautious',
      title: 'Low-risk staged execution',
      risk: 'low',
      confidence: cautiousScore,
      rationale: 'Executes steps sequentially with strict dependency and approval checks.',
    })

    const balancedScore = this.scoreOption('balanced', goal, plan, context)
    options.push({
      strategyId: 'balanced',
      title: 'Balanced execution',
      risk: 'medium',
      confidence: balancedScore,
      rationale: 'Runs straightforward steps quickly while preserving approval gates for sensitive operations.',
    })

    const aggressiveScore = this.scoreOption('aggressive', goal, plan, context)
    options.push({
      strategyId: 'aggressive',
      title: 'Fast execution',
      risk: 'high',
      confidence: aggressiveScore,
      rationale: 'Optimizes speed and throughput, suitable only for low-risk contexts.',
    })

    const selected = options.slice().sort((a, b) => b.confidence - a.confidence)[0]

    return {
      selectedStrategyId: selected.strategyId,
      selectedRationale: selected.rationale,
      options,
    }
  }

  private scoreOption(mode: 'cautious' | 'balanced' | 'aggressive', goal: string, plan: PixiPlan, context: PixiContextModel): number {
    let score = mode === 'balanced' ? 0.7 : mode === 'cautious' ? 0.65 : 0.55

    if (context.systemBusy) {
      if (mode === 'cautious') score += 0.2
      if (mode === 'aggressive') score -= 0.2
    }

    if (context.pendingNotificationCount > 3) {
      if (mode === 'cautious') score += 0.1
      if (mode === 'aggressive') score -= 0.1
    }

    const lowerGoal = goal.toLowerCase()
    if (/(financial|trade|transfer|delete|system modification|account)/.test(lowerGoal)) {
      if (mode === 'cautious') score += 0.25
      if (mode === 'aggressive') score -= 0.35
    }

    if (plan.steps.length >= 5) {
      if (mode === 'balanced') score += 0.1
      if (mode === 'aggressive') score -= 0.05
    }

    return Math.max(0.1, Math.min(0.99, Number(score.toFixed(2))))
  }
}

export const worldModelingEngine = new WorldModelingEngine()

