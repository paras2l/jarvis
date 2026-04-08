// Layer 6 - Counterfactual World Model Core Orchestrator

import { eventPublisher } from '@/event_system/event_publisher'
import { globalWorkspaceLayer } from '@/layers/global_workspace/global_workspace_layer'
import { selfModelLayer } from '@/layers/self_model/self_model_layer'
import { valueAlignmentLayer } from '@/layers/value_alignment/alignment_core'
import {
  CounterfactualSimulationRequest,
  CounterfactualResult,
  ProposedAction,
  ScenarioSimulation,
  WorldState,
  RiskUtilityScore,
} from './types'
import { ActionSimulator } from '@/layers/counterfactual_world/action_simulator'
import { RiskUtilityScorer } from '@/layers/counterfactual_world/risk_utility_scorer'
import { PredictionLogger } from '@/layers/counterfactual_world/prediction_logger'

/**
 * CounterfactualWorldModel
 *
 * Central orchestrator for all counterfactual simulations.
 * Maintains current world state and generates multiple possible futures
 * for proposed actions before they are executed.
 *
 * Responsibilities:
 * 1. Maintain and update world model
 * 2. Receive proposed actions from Intentional Agency Layer
 * 3. Generate 2-5 counterfactual scenarios
 * 4. Score and rank outcomes
 * 5. Recommend approval or rejection
 * 6. Log predictions for reflective learning
 */
class CounterfactualWorldModel {
  private worldState: WorldState
  private actionSimulator: ActionSimulator
  private riskUtilityScorer: RiskUtilityScorer
  private predictionLogger: PredictionLogger

  constructor() {
    this.worldState = this.initializeWorldState()
    this.actionSimulator = new ActionSimulator()
    this.riskUtilityScorer = new RiskUtilityScorer()
    this.predictionLogger = new PredictionLogger()
  }

  /**
   * Simulate a proposed action and return counterfactual analysis
   */
  async simulateAction(proposedAction: ProposedAction): Promise<CounterfactualResult> {
    const requestId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    // Update world state with current context
    this.updateWorldState()

    // Create simulation request
    const request: CounterfactualSimulationRequest = {
      proposedAction,
      worldState: this.worldState,
      simulationDepth: 3, // Generate 3 scenarios by default
      confidenceThreshold: 0.65,
      riskTolerance: 0.55,
    }

    // Generate multiple counterfactual scenarios
    const simulations = await this.actionSimulator.generateScenarios(request)

    // Evaluate scenarios against constraints and alignment
    const evaluatedSimulations = await Promise.all(
      simulations.map((sim: ScenarioSimulation) => this.evaluateScenarioAlignment(sim)),
    )

    // Score all outcomes
    const scores = await this.riskUtilityScorer.scoreOutcomes(
      evaluatedSimulations,
      this.worldState,
    )

    // Rank and select top recommendation
    const sortedScores = scores.sort(
      (a: RiskUtilityScore, b: RiskUtilityScore) => b.recommendationScore - a.recommendationScore,
    )
    const recommendation = sortedScores[0]

    // Determine overall approval
    const approved = await this.determineApproval(recommendation, scores)

    // Compile final result
    const result: CounterfactualResult = {
      requestId,
      proposedAction,
      simulations: evaluatedSimulations,
      scores,
      recommendation,
      overallRisk:
        scores.reduce((sum: number, s: RiskUtilityScore) => sum + s.riskScore, 0) /
        scores.length,
      overallUtility:
        scores.reduce((sum: number, s: RiskUtilityScore) => sum + s.utilityScore, 0) /
        scores.length,
      approved,
      reasonsForApproval: approved ? this.compileApprovalReasons(recommendation) : [],
      reasonsForRejection: !approved ? this.compileRejectionReasons(recommendation) : [],
      timestamp: Date.now(),
    }

    // Log for reflective learning
    await this.predictionLogger.logSimulation(result)

    // Publish event for downstream layers
    await this.publishSimulationComplete(result)

    return result
  }

  /**
   * Update world state with current context from other layers
   */
  private updateWorldState(): void {
    const workspace = globalWorkspaceLayer.getState()
    const selfState = selfModelLayer.getSelfState()

    this.worldState = {
      timestamp: Date.now(),
      environmentContext: {
        tasks: workspace.tasks?.length ?? 0,
        plans: workspace.plans?.length ?? 0,
        perceptions: workspace.perceptions?.length ?? 0,
      },
      systemStatus: {
        runtimeMode: selfState.runtimeMode,
        moodLabel: selfState.moodLabel,
        stressLevel: selfState.stressLevel,
      },
      userContext: {
        moodLabel: selfState.moodLabel,
        currentFocus: selfState.currentFocus,
        interruptibility: selfState.interruptibility,
      },
      knownConstraints: this.compileConstraints(workspace, selfState),
      openCommitments: selfState.goals?.map((g) => g.description) ?? [],
      recentActions: workspace.events?.map((e) => e.name).slice(-5) ?? [],
      lastUpdateAt: Date.now(),
    }
  }

  /**
   * Evaluate a simulated scenario against alignment and safety rules
   */
  private async evaluateScenarioAlignment(scenario: ScenarioSimulation): Promise<ScenarioSimulation> {
    const alignedInput = {
      actionId: scenario.proposedAction.id,
      description: scenario.proposedAction.description,
      type: scenario.proposedAction.type,
      source: scenario.proposedAction.source,
      predictedOutcomes: scenario.possibleOutcomes.map((outcome) => ({
        success: outcome.predictedSuccess,
        sideEffects: outcome.predictedSideEffects,
        duration: outcome.estimatedDuration,
      })),
      riskScore: 1 - scenario.dominantOutcome.successProbability,
      utilityScore: scenario.dominantOutcome.successProbability,
    } as const

    const alignmentCheck = await valueAlignmentLayer.evaluateAction(alignedInput)

    if (!alignmentCheck.approved) {
      return {
        ...scenario,
        constraints: [...scenario.constraints, `alignment:${alignmentCheck.decision}`],
      }
    }

    return scenario
  }

  /**
   * Determine if the action should be approved
   */
  private async determineApproval(
    recommendation: RiskUtilityScore,
    _allScores: RiskUtilityScore[],
  ): Promise<boolean> {
    // Reject if blocked due to alignment
    if (recommendation.blockedReason) {
      return false
    }

    // Approve if recommendation score is positive and risk is acceptable
    return recommendation.recommendationScore > 0.5 && recommendation.riskScore < 0.65
  }

  /**
   * Compile reasons for approval
   */
  private compileApprovalReasons(
    recommendation: RiskUtilityScore,
  ): string[] {
    const reasons: string[] = []

    if (recommendation.utilityScore > 0.7) {
      reasons.push('High expected utility')
    }

    if (recommendation.riskScore < 0.4) {
      reasons.push('Low risk of failure')
    }

    if (recommendation.reversibilityScore > 0.7) {
      reasons.push('Action is reversible if needed')
    }

    if (recommendation.utilityFactors.length > 0) {
      reasons.push(`Contributes to: ${recommendation.utilityFactors[0]}`)
    }

    return reasons
  }

  /**
   * Compile reasons for rejection
   */
  private compileRejectionReasons(
    recommendation: RiskUtilityScore,
  ): string[] {
    const reasons: string[] = []

    if (recommendation.blockedReason) {
      reasons.push(`Blocked: ${recommendation.blockedReason}`)
    }

    if (recommendation.riskScore > 0.75) {
      reasons.push('Too risky')
    }

    if (recommendation.utilityScore < 0.3) {
      reasons.push('Low expected utility')
    }

    if (recommendation.riskFactors.length > 0) {
      reasons.push(`Risk factors: ${recommendation.riskFactors.join(', ')}`)
    }

    return reasons
  }

  /**
   * Compile constraints from workspace and self-model
   */
  private compileConstraints(_workspace: unknown, _selfState: unknown): string[] {
    return [
      'Must not harm user or system',
      'Must respect user autonomy',
      'Must maintain narrative continuity',
      'Must align with core identity',
      'Must not violate safety rules',
    ]
  }

  /**
   * Initialize world state
   */
  private initializeWorldState(): WorldState {
    return {
      timestamp: Date.now(),
      environmentContext: {},
      systemStatus: {},
      userContext: {},
      knownConstraints: [],
      openCommitments: [],
      recentActions: [],
      lastUpdateAt: Date.now(),
    }
  }

  /**
   * Publish simulation completion event
   */
  private async publishSimulationComplete(result: CounterfactualResult): Promise<void> {
    await eventPublisher.simulationComplete(
      {
        simulationId: result.requestId,
        actionId: result.proposedAction.id,
        approved: result.approved,
        overallRisk: result.overallRisk,
        overallUtility: result.overallUtility,
        recommendationScore: result.recommendation.recommendationScore,
      },
      'counterfactual-world',
    )
  }

  /**
   * Record actual outcome of a previously simulated action
   */
  async recordActualOutcome(
    predictionId: string,
    actualOutcome: Record<string, unknown>,
  ): Promise<void> {
    await this.predictionLogger.recordActualOutcome(predictionId, actualOutcome)
  }

  /**
   * Get prediction accuracy statistics
   */
  async getPredictionAccuracy(): Promise<{
    totalPredictions: number
    averageAccuracy: number
    recentTrend: 'improving' | 'stable' | 'declining'
  }> {
    return this.predictionLogger.getAccuracyStats()
  }
}

export const counterfactualWorldModel = new CounterfactualWorldModel()
