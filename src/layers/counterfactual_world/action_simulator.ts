// Layer 6 - Action Simulator
// Generates multiple counterfactual outcomes for proposed actions

import {
  CounterfactualSimulationRequest,
  ScenarioSimulation,
  SimulatedOutcome,
} from './types'

/**
 * ActionSimulator
 *
 * Generates 2-5 possible outcome scenarios for a proposed action.
 * Each scenario includes:
 * - Success/failure probability
 * - Predicted side effects
 * - Reversibility
 * - Estimated duration
 * - Confidence level
 */
export class ActionSimulator {
  /**
   * Generate multiple counterfactual scenarios for an action
   */
  async generateScenarios(request: CounterfactualSimulationRequest): Promise<ScenarioSimulation[]> {
    const scenarios: ScenarioSimulation[] = []

    // Generate optimistic scenario (expected best case)
    scenarios.push(
      this.generateOptimisticScenario(request),
    )

    // Generate realistic scenario (most likely outcome)
    scenarios.push(
      this.generateRealisticScenario(request),
    )

    // Generate pessimistic scenario (expected worst case)
    scenarios.push(
      this.generatePessimisticScenario(request),
    )

    // If deeper simulation requested, add edge cases
    if (request.simulationDepth > 3) {
      scenarios.push(
        this.generateEdgeCaseScenario(request, 'cascade-failure'),
      )
    }

    if (request.simulationDepth > 4) {
      scenarios.push(
        this.generateEdgeCaseScenario(request, 'external-interrupt'),
      )
    }

    return scenarios
  }

  /**
   * Generate optimistic scenario (best case)
   */
  private generateOptimisticScenario(request: CounterfactualSimulationRequest): ScenarioSimulation {
    const scenarioId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    const outcome: SimulatedOutcome = {
      scenarioId,
      actionId: request.proposedAction.id,
      description: `${request.proposedAction.description} (optimistic)`,
      predictedSuccess: true,
      successProbability: 0.85,
      predictedSideEffects: [],
      reversible: true,
      estimatedDuration: request.proposedAction.estimatedDuration * 0.7,
      confidence: 0.75,
      timestamp: Date.now(),
    }

    return {
      scenarioId,
      proposedAction: request.proposedAction,
      possibleOutcomes: [outcome],
      dominantOutcome: outcome,
      scenarioProbability: 0.3,
      dependencies: [],
      constraints: request.worldState.knownConstraints,
    }
  }

  /**
   * Generate realistic scenario (most likely outcome)
   */
  private generateRealisticScenario(request: CounterfactualSimulationRequest): ScenarioSimulation {
    const scenarioId = `real-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    const outcome: SimulatedOutcome = {
      scenarioId,
      actionId: request.proposedAction.id,
      description: `${request.proposedAction.description} (realistic)`,
      predictedSuccess: true,
      successProbability: 0.72,
      predictedSideEffects: this.generateMildSideEffects(request),
      reversible: true,
      estimatedDuration: request.proposedAction.estimatedDuration,
      confidence: 0.8,
      timestamp: Date.now(),
    }

    return {
      scenarioId,
      proposedAction: request.proposedAction,
      possibleOutcomes: [outcome],
      dominantOutcome: outcome,
      scenarioProbability: 0.5,
      dependencies: request.worldState.openCommitments,
      constraints: request.worldState.knownConstraints,
    }
  }

  /**
   * Generate pessimistic scenario (worst case)
   */
  private generatePessimisticScenario(request: CounterfactualSimulationRequest): ScenarioSimulation {
    const scenarioId = `pess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    const outcome: SimulatedOutcome = {
      scenarioId,
      actionId: request.proposedAction.id,
      description: `${request.proposedAction.description} (pessimistic)`,
      predictedSuccess: false,
      successProbability: 0.35,
      predictedSideEffects: this.generateSevereSideEffects(request),
      reversible: false,
      estimatedDuration: request.proposedAction.estimatedDuration * 2.5,
      confidence: 0.65,
      timestamp: Date.now(),
    }

    return {
      scenarioId,
      proposedAction: request.proposedAction,
      possibleOutcomes: [outcome],
      dominantOutcome: outcome,
      scenarioProbability: 0.15,
      dependencies: request.worldState.recentActions,
      constraints: request.worldState.knownConstraints,
    }
  }

  /**
   * Generate edge case scenarios
   */
  private generateEdgeCaseScenario(
    request: CounterfactualSimulationRequest,
    caseType: string,
  ): ScenarioSimulation {
    const scenarioId = `edge-${caseType}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    let description = ''
    let successProbability = 0.1
    let sideEffects: string[] = []

    if (caseType === 'cascade-failure') {
      description = `${request.proposedAction.description} (cascade failure)`
      successProbability = 0.05
      sideEffects = [
        'Multiple subsystems fail',
        'Recovery becomes difficult',
        'State becomes inconsistent',
      ]
    } else if (caseType === 'external-interrupt') {
      description = `${request.proposedAction.description} (external interrupt)`
      successProbability = 0.25
      sideEffects = [
        'Action interrupted mid-execution',
        'Partial state changes',
        'Recovery required',
      ]
    }

    const outcome: SimulatedOutcome = {
      scenarioId,
      actionId: request.proposedAction.id,
      description,
      predictedSuccess: successProbability > 0.5,
      successProbability,
      predictedSideEffects: sideEffects,
      reversible: false,
      estimatedDuration: request.proposedAction.estimatedDuration * 3,
      confidence: 0.55,
      timestamp: Date.now(),
    }

    return {
      scenarioId,
      proposedAction: request.proposedAction,
      possibleOutcomes: [outcome],
      dominantOutcome: outcome,
      scenarioProbability: caseType === 'cascade-failure' ? 0.03 : 0.02,
      dependencies: request.worldState.recentActions,
      constraints: request.worldState.knownConstraints,
    }
  }

  /**
   * Generate mild side effects for realistic scenarios
   */
  private generateMildSideEffects(_request: CounterfactualSimulationRequest): string[] {
    const possibleEffects = [
      'Temporary increase in system load',
      'Brief user distraction',
      'Minor memory overhead',
      'Slight increase in response latency',
    ]

    return possibleEffects.slice(0, Math.floor(Math.random() * 2) + 1)
  }

  /**
   * Generate severe side effects for pessimistic scenarios
   */
  private generateSevereSideEffects(_request: CounterfactualSimulationRequest): string[] {
    return [
      'System stability compromised',
      'Significant resource consumption',
      'Potential data loss',
      'User experience degradation',
      'Recovery period required',
    ]
  }
}
