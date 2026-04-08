// Layer 6 - Scenario Manager
// Manages multiple counterfactual scenarios, dependencies, and pruning

import { ScenarioSimulation } from './types'

/**
 * ScenarioManager
 *
 * Manages multiple counterfactual scenarios, including:
 * - Scenario dependencies and relationships
 * - Reversibility tracking
 * - Scenario pruning (removing unrealistic or low-utility scenarios)
 * - Multi-step action planning
 */
export class ScenarioManager {
  private scenarios: Map<string, ScenarioSimulation> = new Map()

  /**
   * Add a scenario to tracking
   */
  addScenario(scenario: ScenarioSimulation): void {
    this.scenarios.set(scenario.scenarioId, scenario)
  }

  /**
   * Get all tracked scenarios
   */
  getScenarios(): ScenarioSimulation[] {
    return Array.from(this.scenarios.values())
  }

  /**
   * Get scenario by ID
   */
  getScenario(scenarioId: string): ScenarioSimulation | undefined {
    return this.scenarios.get(scenarioId)
  }

  /**
   * Prune unrealistic or low-utility scenarios
   */
  pruneScenarios(minProbability: number = 0.01, _minUtility: number = 0.2): void {
    const toPrune: string[] = []

    for (const [id, scenario] of this.scenarios) {
      // Remove scenarios below minimum probability
      if (scenario.scenarioProbability < minProbability) {
        toPrune.push(id)
        continue
      }

      // Remove scenarios with very low utility (all outcomes failed)
      const hasAnySuccess = scenario.possibleOutcomes.some((o) => o.predictedSuccess)
      if (!hasAnySuccess && !scenario.proposedAction.description.includes('risk')) {
        toPrune.push(id)
      }
    }

    for (const id of toPrune) {
      this.scenarios.delete(id)
    }
  }

  /**
   * Analyze scenario dependencies
   */
  analyzeDependencies(scenarioId: string): {
    dependencies: string[]
    dependents: string[]
    cyclic: boolean
  } {
    const scenario = this.scenarios.get(scenarioId)
    if (!scenario) {
      return { dependencies: [], dependents: [], cyclic: false }
    }

    const dependencies = scenario.dependencies

    // Find scenarios that depend on this one
    const dependents: string[] = []
    for (const [id, s] of this.scenarios) {
      if (id !== scenarioId && s.dependencies.includes(scenarioId)) {
        dependents.push(id)
      }
    }

    // Check for cycles
    const cyclic = this.detectCycle(scenarioId)

    return { dependencies, dependents, cyclic }
  }

  /**
   * Detect cyclic dependencies
   */
  private detectCycle(scenarioId: string, visited: Set<string> = new Set()): boolean {
    if (visited.has(scenarioId)) {
      return true
    }

    visited.add(scenarioId)

    const scenario = this.scenarios.get(scenarioId)
    if (!scenario) {
      return false
    }

    for (const depId of scenario.dependencies) {
      if (this.detectCycle(depId, new Set(visited))) {
        return true
      }
    }

    return false
  }

  /**
   * Calculate reversibility for a scenario
   */
  calculateReversibility(scenarioId: string): number {
    const scenario = this.scenarios.get(scenarioId)
    if (!scenario) {
      return 0
    }

    const outcome = scenario.dominantOutcome

    // Base reversibility from outcome
    let reversibility = outcome.reversible ? 0.8 : 0.3

    // Adjust based on side effects
    reversibility -= outcome.predictedSideEffects.length * 0.15

    // Adjust based on duration (longer actions are harder to undo)
    const durationFactor = Math.min(0.3, outcome.estimatedDuration / 60000) // Max 0.3 penalty
    reversibility -= durationFactor

    return Math.max(0.1, reversibility)
  }

  /**
   * Get reversible scenarios only
   */
  getReversibleScenarios(minReversibility: number = 0.5): ScenarioSimulation[] {
    return Array.from(this.scenarios.values()).filter(
      (s) => this.calculateReversibility(s.scenarioId) >= minReversibility,
    )
  }

  /**
   * Simulate a sequence of actions
   */
  simulateActionSequence(actionSequence: string[]): {
    feasible: boolean
    totalDuration: number
    cumulativeRisk: number
    reversible: boolean
  } {
    let totalDuration = 0
    let cumulativeRisk = 1.0
    let reversible = true

    for (const actionId of actionSequence) {
      const scenario = Array.from(this.scenarios.values()).find(
        (s) => s.proposedAction.id === actionId,
      )

      if (!scenario) {
        return {
          feasible: false,
          totalDuration,
          cumulativeRisk,
          reversible: false,
        }
      }

      const outcome = scenario.dominantOutcome
      totalDuration += outcome.estimatedDuration
      cumulativeRisk *= outcome.successProbability
      reversible = reversible && outcome.reversible
    }

    // Sequence is feasible if cumulative success probability > 0.5
    const feasible = cumulativeRisk > 0.5

    return {
      feasible,
      totalDuration,
      cumulativeRisk,
      reversible,
    }
  }

  /**
   * Get scenarios by constraint satisfaction
   */
  getConstraintSatisfyingScenarios(constraints: string[]): ScenarioSimulation[] {
    return Array.from(this.scenarios.values()).filter((scenario) => {
      // Check if scenario's constraints include all required constraints
      return constraints.every((c) => scenario.constraints.includes(c))
    })
  }

  /**
   * Clear all scenarios
   */
  clear(): void {
    this.scenarios.clear()
  }

  /**
   * Get scenario statistics
   */
  getStatistics(): {
    totalScenarios: number
    averageProbability: number
    averageReversibility: number
    highRiskScenarios: number
  } {
    const scenarios = Array.from(this.scenarios.values())

    if (scenarios.length === 0) {
      return {
        totalScenarios: 0,
        averageProbability: 0,
        averageReversibility: 0,
        highRiskScenarios: 0,
      }
    }

    const avgProb = scenarios.reduce((sum, s) => sum + s.scenarioProbability, 0) / scenarios.length
    const avgReversibility =
      scenarios.reduce((sum, s) => sum + this.calculateReversibility(s.scenarioId), 0) /
      scenarios.length

    const highRisk = scenarios.filter(
      (s) => s.dominantOutcome.predictedSideEffects.length > 2,
    ).length

    return {
      totalScenarios: scenarios.length,
      averageProbability: Math.round(avgProb * 100) / 100,
      averageReversibility: Math.round(avgReversibility * 100) / 100,
      highRiskScenarios: highRisk,
    }
  }
}
