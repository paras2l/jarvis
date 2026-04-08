/**
 * Global Cognitive Workspace State
 * 
 * This is the central nervous system of the Pixi architecture.
 * Every module reads from and writes to this single source of truth.
 * 
 * Flow: UI â†’ Perception â†’ Workspace â†’ Consciousness â†’ Planning â†’ Action â†’ Memory â†’ Reflection â†’ Learning
 */

export type EmotionalState = 'happy' | 'sad' | 'frustrated' | 'confused' | 'excited' | 'calm' | 'uncertain'
export type TaskState = 'idle' | 'planning' | 'executing' | 'blocked' | 'completed' | 'failed'
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown'
export type SituationalContext = 'personal' | 'work' | 'creative' | 'learning' | 'social' | 'maintenance'

export interface SelfModelWorkspaceSnapshot {
  beliefCount: number
  contradictionCount: number
  openContradictions: number
  coherenceScore: number
  trustScore: number
  beliefHighlights: string[]
  dominantDomains: Array<{ domain: string; count: number; averageConfidence: number; openContradictions: number }>
  recentBeliefs: string[]
  openContradictionSubjects: string[]
  revisionCount: number
  edgeCount: number
  graphHealth: number
  updatedAt: number
}

export interface SelfValueAxis {
  name: string
  description: string
  weight: number
  source: string
  category?: string
  enforcementLevel?: 'soft' | 'hard'
  linkedGoalIds?: string[]
  policyIds?: string[]
  confidence?: number
}

export interface SelfGoalRelationship {
  fromGoalId: string
  toGoalId: string
  type: 'supports' | 'blocks' | 'refines' | 'depends_on'
  strength: number
  createdAt: number
  updatedAt: number
  reason: string
}

export interface SelfGoalAssessmentRecord {
  timestamp: number
  description: string
  action: string
  alignmentScore: number
  driftScore: number
  matchedGoalIds: string[]
  matchedValues: string[]
  conflictValues: string[]
  recommendedPriority: 'urgent' | 'high' | 'medium' | 'low'
  shouldClarify: boolean
  summary: string
  focusGoalId?: string
}

/**
 * Perception Layer: What the system senses right now
 */
export interface PerceptionState {
  currentInput: string // The raw input (voice, text, event)
  inputType: 'voice' | 'text' | 'event' | 'notification'
  timestamp: number
  sensoryData?: {
    sentiment?: string
    intensity?: number
    clarity?: number
  }
  contextualCues?: Record<string, any> // Device state, user activity, etc.
}

/**
 * Goal Layer: What the system is trying to achieve
 */
export interface CurrentGoal {
  goalId: string
  description: string
  priority: number // 0-10
  deadline?: number
  confidence: ConfidenceLevel
  steps?: string[]
  currentStep?: number
  isAchieved?: boolean
}

/**
 * Task Layer: What's actively being executed
 */
export interface ActiveTask {
  taskId: string
  name: string
  state: TaskState
  progress: number // 0-100
  startTime: number
  estimatedDuration?: number
  currentAction?: string
  inputContext?: any
  outputContext?: any
  error?: string
  canBeInterrupted?: boolean
}

/**
 * Memory Context: Relevant memories and knowledge
 */
export interface MemoryContext {
  recentMemories: string[] // Most relevant memory IDs
  semanticContext?: Record<string, any> // Semantic search results
  relatedKnowledge?: string[]
  historicalPatterns?: {
    patternId: string
    frequency: number
    lastOccurred: number
  }[]
  userPreferences?: Record<string, any>
}

/**
 * Emotional State: Current mood, confidence, and state
 */
export interface EmotionalStateData {
  currentMood: EmotionalState
  confidence: ConfidenceLevel
  uncertainty: number // 0-1, how uncertain is the system
  energy: number // 0-1, how "active" the system is
  focusLevel: number // 0-1, how focused on current task
  selfAwareness: 'minimal' | 'moderate' | 'high'
  executionStyle: 'cautious' | 'balanced' | 'aggressive'
  lastEmotionShift?: number // timestamp of last emotion change
  emotionHistory?: { mood: EmotionalState; timestamp: number }[]
}

/**
 * Predictions: What the system expects to happen
 */
export interface Predictions {
  nextLikelyActions?: string[]
  expectedOutcome?: string
  successProbability?: number // 0-1
  riskFactors?: string[]
  opportunityWindow?: number // ms window for time-sensitive decisions
  predictedChallenges?: string[]
}

/**
 * Decision Trace: Why things happened (for interpretability)
 */
export interface DecisionTrace {
  decisionId: string
  timestamp: number
  decision: string
  reasoning: string
  alternatives?: string[]
  selectedAlternative?: string
  confidence: ConfidenceLevel
  basedOn?: string[] // Which workspace fields influenced this
}

/**
 * Main Cognitive Workspace State
 * 
 * This is THE central state. All modules read and write here.
 */
export interface CognitiveWorkspaceState {
  // Basic metadata
  id: string
  userId?: string
  createdAt: number
  lastUpdatedAt: number

  // The flow states
  perception: PerceptionState
  currentGoal?: CurrentGoal
  activeTask?: ActiveTask
  memoryContext: MemoryContext
  emotionalState: EmotionalStateData
  predictions: Predictions

  // Decision history for learning
  decisionHistory: DecisionTrace[]

  // Current interaction layer
  situationalContext: SituationalContext
  userIntentClarityScore: number // 0-1, how clear is what user wants
  selfModel?: SelfModelWorkspaceSnapshot

  // System readiness
  readinessScore: number // 0-100
  activeConstraints?: string[] // Safety, permissions, resources
  blockers?: string[] // What's preventing progress
}

/**
 * Workspace Update Payload
 * 
 * Modules should request updates through the controller
 */
export interface WorkspaceUpdate {
  source: string // Which module is updating
  updates: Partial<CognitiveWorkspaceState>
  reason?: string
  timestamp?: number
}

/**
 * Workspace Subscription
 * 
 * Modules can subscribe to specific state changes
 */
export interface WorkspaceSubscription {
  id: string
  callback: (state: CognitiveWorkspaceState, change: WorkspaceChange) => void
  filter?: (change: WorkspaceChange) => boolean // Only trigger on certain changes
  pathFilter?: string[] // Only watch specific paths like ['emotionalState', 'activeTask']
}

/**
 * What changed in the workspace
 */
export interface WorkspaceChange {
  timestamp: number
  source: string
  changedPaths: string[]
  previousValues: Record<string, any>
  newValues: Record<string, any>
  reason?: string
}

/**
 * Default/Empty Workspace State
 */
export function createEmptyWorkspaceState(userId?: string): CognitiveWorkspaceState {
  const now = Date.now()
  return {
    id: `workspace_${userId}_${now}`,
    userId,
    createdAt: now,
    lastUpdatedAt: now,
    perception: {
      currentInput: '',
      inputType: 'text',
      timestamp: now,
    },
    memoryContext: {
      recentMemories: [],
    },
    emotionalState: {
      currentMood: 'calm',
      confidence: 'unknown',
      uncertainty: 0.5,
      energy: 0.5,
      focusLevel: 0.5,
      selfAwareness: 'moderate',
      executionStyle: 'balanced',
    },
    predictions: {
      nextLikelyActions: [],
    },
    decisionHistory: [],
    situationalContext: 'personal',
    userIntentClarityScore: 0,
    readinessScore: 50,
  }
}

/**
 * State path constants (for type-safe field access)
 */
export const WORKSPACE_PATHS = {
  PERCEPTION: 'perception',
  CURRENT_GOAL: 'currentGoal',
  ACTIVE_TASK: 'activeTask',
  MEMORY_CONTEXT: 'memoryContext',
  EMOTIONAL_STATE: 'emotionalState',
  PREDICTIONS: 'predictions',
  DECISION_HISTORY: 'decisionHistory',
  SITUATIONAL_CONTEXT: 'situationalContext',
  READINESS_SCORE: 'readinessScore',
  ACTIVE_CONSTRAINTS: 'activeConstraints',
  BLOCKERS: 'blockers',
  SELF_MODEL: 'selfModel',
} as const

