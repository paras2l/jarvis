// Layer 6 - Risk and Utility Scorer
// Calculates numerical scores for simulated outcomes

import { ScenarioSimulation, RiskUtilityScore, WorldState } from './types'

/**
 * RiskUtilityScorer
 *
 * Evaluates each simulated scenario and assigns:
 * - Risk Score: failure probability × severity
 * - Utility Score: expected value contribution toward goals
 * - Reversibility Score: how easily the action can be undone
 * - Recommendation Score: (utility - risk) / reversibility
 */
export class RiskUtilityScorer {
  /**
   * Score all scenario outcomes
   */
  async scoreOutcomes(
    simulations: ScenarioSimulation[],
    worldState: WorldState,
  ): Promise<RiskUtilityScore[]> {
    return simulations.map((sim) => this.scoreSimulation(sim, worldState))
  }

  /**
   * Score a single simulation
   */
  private scoreSimulation(simulation: ScenarioSimulation, worldState: WorldState): RiskUtilityScore {
    const outcome = simulation.dominantOutcome
    const actionId = simulation.proposedAction.id

    // Calculate risk components
    const failureProbability = 1 - outcome.successProbability
    const severityScore = this.calculateSeverity(outcome.predictedSideEffects)
    const riskScore = Math.min(1.0, failureProbability * 0.6 + severityScore * 0.4)

    // Calculate utility components
    const utilityScore = this.calculateUtility(
      simulation.proposedAction.description,
      outcome.successProbability,
      worldState,
    )

    // Calculate reversibility
    const reversibilityScore = outcome.reversible
      ? 0.85 - failureProbability * 0.2
      : Math.max(0.1, 0.3 - outcome.predictedSideEffects.length * 0.1)

    // Identify risk and utility factors
    const riskFactors = this.identifyRiskFactors(outcome, failureProbability, severityScore)
    const utilityFactors = this.identifyUtilityFactors(
      simulation.proposedAction.description,
      worldState,
    )

    // Calculate recommendation score
    const recommendationScore = (utilityScore - riskScore) / Math.max(1, reversibilityScore)

    // Determine if approved
    const { approved, blockedReason } = this.determineApprovalStatus(
      riskScore,
      utilityScore,
      reversibilityScore,
      riskFactors,
    )

    return {
      actionId,
      riskScore: Math.round(riskScore * 100) / 100,
      riskFactors,
      utilityScore: Math.round(utilityScore * 100) / 100,
      utilityFactors,
      reversibilityScore: Math.round(reversibilityScore * 100) / 100,
      recommendationScore: Math.round(recommendationScore * 100) / 100,
      rank: 0, // Will be set after sorting
      approved,
      blockedReason,
    }
  }

  /**
   * Calculate severity score from side effects
   */
  private calculateSeverity(sideEffects: string[]): number {
    if (sideEffects.length === 0) return 0.1

    // High severity indicators
    const severeIndicators = [
      'data loss',
      'crash',
      'corrupt',
      'fail',
      'harm',
      'damage',
      'compromise',
    ]

    let severitySum = 0
    for (const effect of sideEffects) {
      const lowercase = effect.toLowerCase()
      if (severeIndicators.some((ind) => lowercase.includes(ind))) {
        severitySum += 0.8
      } else {
        severitySum += 0.3
      }
    }

    return Math.min(1.0, severitySum / sideEffects.length)
  }

  /**
   * Calculate utility score
   */
  private calculateUtility(
    actionDescription: string,
    successProbability: number,
    worldState: WorldState,
  ): number {
    // Base utility from success probability
    let baseUtility = successProbability * 0.7

    // Bonus for addressing open commitments
    const addressesCommitment = worldState.openCommitments.some(
      (c) => actionDescription.toLowerCase().includes(c.toLowerCase()),
    )
    baseUtility += addressesCommitment ? 0.2 : 0

    // Bonus for proactive improvement
    const isProactive =
      actionDescription.toLowerCase().includes('improve') ||
      actionDescription.toLowerCase().includes('optimize') ||
      actionDescription.toLowerCase().includes('enhance')
    baseUtility += isProactive ? 0.1 : 0

    return Math.min(1.0, baseUtility)
  }

  /**
   * Identify risk factors
   */
  private identifyRiskFactors(
    outcome: any,
    failureProbability: number,
    severityScore: number,
  ): string[] {
    const factors: string[] = []

    if (failureProbability > 0.4) {
      factors.push('Moderate failure risk')
    }

    if (failureProbability > 0.65) {
      factors.push('High failure risk')
    }

    if (severityScore > 0.6) {
      factors.push('Severe consequences if failed')
    }

    if (!outcome.reversible) {
      factors.push('Action is not reversible')
    }

    if (outcome.predictedSideEffects.length > 2) {
      factors.push('Multiple side effects possible')
    }

    return factors
  }

  /**
   * Identify utility factors
   */
  private identifyUtilityFactors(actionDescription: string, worldState: WorldState): string[] {
    const factors: string[] = []

    // Check for alignment with commitments
    if (
      worldState.openCommitments.some((c) =>
        actionDescription.toLowerCase().includes(c.toLowerCase()),
      )
    ) {
      factors.push('Addresses open commitment')
    }

    // Check for improvement focus
    if (actionDescription.toLowerCase().includes('improve')) {
      factors.push('System improvement')
    }

    if (actionDescription.toLowerCase().includes('optimize')) {
      factors.push('Performance optimization')
    }

    if (actionDescription.toLowerCase().includes('learn')) {
      factors.push('Knowledge acquisition')
    }

    return factors
  }

  /**
   * Determine if action should be approved
   */
  private determineApprovalStatus(
    riskScore: number,
    utilityScore: number,
    reversibilityScore: number,
    riskFactors: string[],
  ): { approved: boolean; blockedReason?: string } {
    // Block if too risky and not reversible
    if (riskScore > 0.75 && reversibilityScore < 0.4) {
      return {
        approved: false,
        blockedReason: 'Too risky and not reversible',
      }
    }

    // Block if utility is too low relative to risk
    if (utilityScore < 0.3 && riskScore > 0.6) {
      return {
        approved: false,
        blockedReason: 'Risk outweighs utility',
      }
    }

    // Block if multiple severe risk factors
    const severeFactorCount = riskFactors.filter((f) =>
      f.toLowerCase().includes('high'),
    ).length
    if (severeFactorCount > 2) {
      return {
        approved: false,
        blockedReason: 'Multiple severe risk factors',
      }
    }

    return { approved: true }
  }
}
