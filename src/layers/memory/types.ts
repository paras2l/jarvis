export type MemoryTimescale = 'working' | 'episodic' | 'semantic' | 'procedural'

export interface MemoryAccessContext {
  taskId?: string
  goal?: string
  intent?: string
  tags?: string[]
  recencyBias?: number
}

export interface WorkingMemoryItem {
  id: string
  key: string
  value: unknown
  confidence: number
  tags: string[]
  createdAt: number
  updatedAt: number
  expiresAt?: number
  accessCount: number
}

export interface EpisodicEvent {
  eventId: string
  eventType: string
  actionId?: string
  timestamp: number
  context: Record<string, unknown>
  outcome?: {
    success: boolean
    summary: string
    score?: number
  }
  correlationId?: string
  tags: string[]
  importance: number
}

export interface SemanticFact {
  factId: string
  subject: string
  predicate: string
  object: string
  confidence: number
  aliases?: string[]
  source?: string
  tags: string[]
  createdAt: number
  updatedAt: number
  lastValidatedAt?: number
}

export interface AliasMapping {
  alias: string
  canonical: string
  category: 'app' | 'command' | 'entity' | 'term'
  confidence: number
  createdAt: number
  updatedAt: number
}

export interface ProcedureStep {
  id: string
  description: string
  command?: string
  expectedResult?: string
  timeoutMs?: number
}

export interface ProcedureTemplate {
  procedureId: string
  name: string
  description: string
  triggerHints: string[]
  steps: ProcedureStep[]
  tags: string[]
  reliability: number
  usageCount: number
  successCount: number
  failureCount: number
  createdAt: number
  updatedAt: number
}

export interface ConsolidationCandidate {
  key: string
  value: unknown
  confidence: number
  confirmationCount: number
  observedAt: number[]
  tags: string[]
}

export interface MemoryDecayPolicy {
  workingTtlMs: number
  episodicRetentionMs: number
  semanticValidationMs: number
  minConfidenceToPersist: number
  proceduralMinReliability: number
}

export interface ConsolidationResult {
  consolidatedWorkingItems: number
  episodicEventsCreated: number
  semanticFactsCreated: number
  proceduresUpdated: number
  decayedWorkingItems: number
  decayedEpisodes: number
  timestamp: number
}

export interface MemoryQuery {
  queryText?: string
  tags?: string[]
  timescales?: MemoryTimescale[]
  minConfidence?: number
  limit?: number
}

export interface MemorySearchResult {
  timescale: MemoryTimescale
  id: string
  relevance: number
  summary: string
  payload: unknown
}

export interface MultiTimescaleMemorySnapshot {
  timestamp: number
  workingCount: number
  episodicCount: number
  semanticCount: number
  proceduralCount: number
  topAliases: AliasMapping[]
  health: {
    averageWorkingConfidence: number
    episodicSuccessRate: number
    semanticValidationCoverage: number
    proceduralReliability: number
  }
}
