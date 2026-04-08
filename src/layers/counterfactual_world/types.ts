// Layer 6 - Counterfactual World Model Types

export interface SimulatedOutcome {
  scenarioId: string
  actionId: string
  description: string
  predictedSuccess: boolean
  successProbability: number
  predictedSideEffects: string[]
  reversible: boolean
  estimatedDuration: number // milliseconds
  confidence: number // 0-1
  timestamp: number
}

export interface ScenarioSimulation {
  scenarioId: string
  proposedAction: ProposedAction
  possibleOutcomes: SimulatedOutcome[]
  dominantOutcome: SimulatedOutcome
  scenarioProbability: number
  dependencies: string[]
  constraints: string[]
}

export interface ProposedAction {
  id: string
  description: string
  type: 'reactive' | 'proactive'
  source: string
  estimatedDuration: number
  context: {
    workspace: Record<string, unknown>
    selfState: Record<string, unknown>
    continuity: Record<string, unknown>
  }
}

export interface RiskUtilityScore {
  actionId: string
  riskScore: number // 0-1, higher = more risky
  riskFactors: string[]
  utilityScore: number // 0-1, higher = more valuable
  utilityFactors: string[]
  reversibilityScore: number // 0-1, higher = more reversible
  recommendationScore: number // combined: (utility - risk) / reversibility
  rank: number
  approved: boolean
  blockedReason?: string
}

export interface PredictionLogEntry {
  predictionId: string
  actionId: string
  predictedOutcome: SimulatedOutcome
  actualOutcome?: SimulatedOutcome
  predictionAccuracy: number // 0-1
  predictionConfidence: number // 0-1
  executedAt?: number
  completedAt?: number
  discrepancy?: string
  timestamp: number
}

export interface WorldState {
  timestamp: number
  environmentContext: Record<string, unknown>
  systemStatus: Record<string, unknown>
  userContext: Record<string, unknown>
  knownConstraints: string[]
  openCommitments: string[]
  recentActions: string[]
  lastUpdateAt: number
}

export interface CounterfactualSimulationRequest {
  proposedAction: ProposedAction
  worldState: WorldState
  simulationDepth: number // 2-5 scenarios
  confidenceThreshold: number // 0-1
  riskTolerance: number // 0-1
}

export interface CounterfactualResult {
  requestId: string
  proposedAction: ProposedAction
  simulations: ScenarioSimulation[]
  scores: RiskUtilityScore[]
  recommendation: RiskUtilityScore
  overallRisk: number
  overallUtility: number
  approved: boolean
  reasonsForApproval: string[]
  reasonsForRejection: string[]
  timestamp: number
}
