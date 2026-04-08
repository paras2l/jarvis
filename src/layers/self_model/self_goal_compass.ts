import { valueRegistry } from '@/layers/value_alignment/value_registry'
import { identityCore } from '@/layers/identity_continuity/identity_core'
import { clamp01 } from './self_state_schema'

export type GoalTier = 'vision' | 'principle' | 'objective' | 'commitment'
export type GoalStatus = 'active' | 'paused' | 'achieved' | 'blocked' | 'archived'
export type GoalRelationType = 'supports' | 'blocks' | 'refines' | 'depends_on'

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

export interface GoalRelationship {
  fromGoalId: string
  toGoalId: string
  type: GoalRelationType
  strength: number
  createdAt: number
  updatedAt: number
  reason: string
}

export interface GoalAssessmentRecord {
  timestamp: number
  description: string
  action: string
  alignmentScore: number
  driftScore: number
  matchedGoalIds: string[]
  matchedGoalTitles: string[]
  matchedValues: string[]
  conflictValues: string[]
  recommendedPriority: 'urgent' | 'high' | 'medium' | 'low'
  shouldClarify: boolean
  summary: string
  focusGoalId?: string
}

export interface GoalNode {
  id: string
  tier: GoalTier
  title: string
  description: string
  priority: number
  status: GoalStatus
  progress: number
  parentId?: string
  childIds: string[]
  alignedValues: string[]
  conflictValues: string[]
  confidence: number
  createdAt: number
  updatedAt: number
  lastObservedAt: number
  persistent: boolean
  sourceLayer: string
}

export interface GoalCompassSnapshot {
  goals: GoalNode[]
  valueAxes: SelfValueAxis[]
  activeGoalIds: string[]
  pausedGoalIds: string[]
  archivedGoalIds: string[]
  alignmentScore: number
  driftScore: number
  priorityNarrative: string
  valueNarrative: string
  lastAssessmentSummary: string
  recentAssessments: GoalAssessmentRecord[]
  goalRelationships: GoalRelationship[]
  updatedAt: number
  version: number
}

export interface GoalAlignmentAssessment {
  alignmentScore: number
  driftScore: number
  matchedGoalIds: string[]
  matchedGoalTitles: string[]
  matchedValues: string[]
  conflictValues: string[]
  recommendedPriority: 'urgent' | 'high' | 'medium' | 'low'
  shouldClarify: boolean
  summary: string
  focusGoalId?: string
}

export interface GoalObservation {
  sourceLayer: string
  tier?: GoalTier
  title: string
  description: string
  priority: number
  status?: GoalStatus
  progress?: number
  parentId?: string
  alignedValues?: string[]
  conflictValues?: string[]
  confidence?: number
  persistent?: boolean
}

const STORAGE_KEY = 'patrich.self_model.goal_compass.v1'
const MAX_GOALS = 120
const MAX_ACTIVE_GOALS = 12

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))))
}

class SelfGoalCompass {
  private goals = new Map<string, GoalNode>()
  private relationships = new Map<string, GoalRelationship>()
  private assessmentHistory: GoalAssessmentRecord[] = []
  private goalEvents: string[] = []
  private version = 1
  private lastPersistenceAt = 0
  private valueAxes: SelfValueAxis[] = []

  constructor() {
    this.hydrate()
    this.seedDefaultGoals()
    this.seedValueAxes({ agentName: 'Patrich', userTrust: 0.8, currentMood: 'neutral', runtimeMode: 'active' })
  }

  observe(input: GoalObservation): GoalNode {
    const now = Date.now()
    const existing = this.findGoalByTitle(input.title, input.tier ?? 'objective')
    const goalValues = unique(input.alignedValues || [])
    const conflictValues = unique(input.conflictValues || [])

    const goal: GoalNode = existing
      ? {
          ...existing,
          description: input.description,
          priority: input.priority,
          status: input.status ?? existing.status,
          progress: clamp01(input.progress ?? existing.progress),
          parentId: input.parentId ?? existing.parentId,
          childIds: unique([...(existing.childIds || [])]),
          alignedValues: unique([...(existing.alignedValues || []), ...goalValues]),
          conflictValues: unique([...(existing.conflictValues || []), ...conflictValues]),
          confidence: clamp01(this.blendConfidence(existing.confidence, input.confidence ?? existing.confidence)),
          updatedAt: now,
          lastObservedAt: now,
          persistent: existing.persistent || (input.persistent ?? true),
          sourceLayer: input.sourceLayer,
        }
      : {
          id: makeId('self_goal'),
          tier: input.tier ?? 'objective',
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: input.status ?? 'active',
          progress: clamp01(input.progress ?? 0),
          parentId: input.parentId,
          childIds: [],
          alignedValues: goalValues,
          conflictValues,
          confidence: clamp01(input.confidence ?? 0.72),
          createdAt: now,
          updatedAt: now,
          lastObservedAt: now,
          persistent: input.persistent ?? true,
          sourceLayer: input.sourceLayer,
        }

    this.goals.set(goal.id, goal)

    if (goal.parentId) {
      this.attachParentChild(goal.parentId, goal.id, input.sourceLayer, 'goal hierarchy link')
    }

    if (existing && (existing.status !== goal.status || existing.progress !== goal.progress || existing.priority !== goal.priority)) {
      this.goalEvents.unshift(
        `${now}: ${goal.title} -> status ${goal.status}, progress ${Math.round(goal.progress * 100)}%, priority ${goal.priority}`,
      )
    }

    this.trimCollections()
    this.recomputeVersion()
    this.persist()
    return goal
  }

  updateGoalProgress(goalId: string, progress: number, reason: string, sourceLayer = 'self-model'): GoalNode | undefined {
    const goal = this.goals.get(goalId)
    if (!goal) return undefined

    const nextProgress = clamp01(progress)
    const nextStatus: GoalStatus = nextProgress >= 1 ? 'achieved' : goal.status === 'archived' ? 'archived' : goal.status === 'paused' ? 'paused' : goal.status
    const updated: GoalNode = {
      ...goal,
      progress: nextProgress,
      status: nextStatus,
      updatedAt: Date.now(),
      lastObservedAt: Date.now(),
      confidence: clamp01(this.blendConfidence(goal.confidence, Math.max(0.4, nextProgress))),
    }

    this.goals.set(goalId, updated)
    this.goalEvents.unshift(`${Date.now()}: progress ${goal.title} -> ${Math.round(nextProgress * 100)}% (${reason})`)
    this.recordRelationship({
      fromGoalId: goalId,
      toGoalId: goal.parentId ?? goalId,
      type: 'refines',
      strength: 0.55,
      reason,
      sourceLayer,
    })
    this.recomputeVersion()
    this.persist()
    return updated
  }

  setGoalStatus(goalId: string, status: GoalStatus, reason: string, sourceLayer = 'self-model'): GoalNode | undefined {
    const goal = this.goals.get(goalId)
    if (!goal) return undefined

    const updated: GoalNode = {
      ...goal,
      status,
      updatedAt: Date.now(),
      lastObservedAt: Date.now(),
    }

    this.goals.set(goalId, updated)
    this.goalEvents.unshift(`${Date.now()}: ${goal.title} -> ${status} (${reason})`)
    this.recordRelationship({
      fromGoalId: goalId,
      toGoalId: goal.parentId ?? goalId,
      type: status === 'blocked' ? 'blocks' : 'supports',
      strength: status === 'blocked' ? 0.85 : 0.45,
      reason,
      sourceLayer,
    })
    this.recomputeVersion()
    this.persist()
    return updated
  }

  getGoalById(goalId: string): GoalNode | undefined {
    return this.goals.get(goalId)
  }

  getPriorityPlan(limit = 5): string[] {
    return this.listGoals()
      .slice(0, Math.max(1, limit))
      .map((goal) => `${goal.tier}:${goal.title}=${Math.round(goal.progress * 100)}% [${goal.status}]`) 
  }

  getGoalNarrative(limit = 5): string {
    const topGoals = this.getPriorityPlan(limit)
    const recurringEvents = this.goalEvents.slice(0, Math.max(1, limit))
    return [
      topGoals.length ? `Top goals: ${topGoals.join(' | ')}` : 'Top goals: none',
      recurringEvents.length ? `Goal events: ${recurringEvents.join(' | ')}` : 'Goal events: none',
    ].join(' || ')
  }

  getValueNarrative(limit = 5): string {
    return this.getValueSummary(limit).join(' | ')
  }

  getRecentAssessments(limit = 5): GoalAssessmentRecord[] {
    return [...this.assessmentHistory.slice(0, Math.max(1, limit))]
  }

  getGoalRelationships(limit = 20): GoalRelationship[] {
    return [...this.relationships.values()]
      .sort((a, b) => b.strength - a.strength || b.updatedAt - a.updatedAt)
      .slice(0, Math.max(1, limit))
  }

  recordAssessment(record: GoalAssessmentRecord): void {
    this.assessmentHistory.unshift(record)
    if (this.assessmentHistory.length > 60) {
      this.assessmentHistory = this.assessmentHistory.slice(0, 60)
    }
    this.goalEvents.unshift(`${record.timestamp}: assessment ${record.summary}`)
    this.persist()
  }

  recordGoalOutcome(goalId: string, outcome: { progressDelta?: number; status?: GoalStatus; reason: string; sourceLayer?: string }): GoalNode | undefined {
    const goal = this.goals.get(goalId)
    if (!goal) return undefined

    const progressDelta = outcome.progressDelta ?? 0
    const nextProgress = clamp01(goal.progress + progressDelta)
    const nextStatus = outcome.status ?? (nextProgress >= 1 ? 'achieved' : goal.status)
    const updated: GoalNode = {
      ...goal,
      progress: nextProgress,
      status: nextStatus,
      updatedAt: Date.now(),
      lastObservedAt: Date.now(),
      confidence: clamp01(this.blendConfidence(goal.confidence, 0.6 + Math.abs(progressDelta))),
    }

    this.goals.set(goalId, updated)
    this.goalEvents.unshift(`${Date.now()}: outcome ${goal.title} -> ${Math.round(nextProgress * 100)}% (${outcome.reason})`)
    this.recordRelationship({
      fromGoalId: goalId,
      toGoalId: goal.parentId ?? goalId,
      type: progressDelta >= 0 ? 'supports' : 'blocks',
      strength: clamp01(Math.abs(progressDelta) + 0.35),
      reason: outcome.reason,
      sourceLayer: outcome.sourceLayer || 'self-model',
    })
    this.recomputeVersion()
    this.persist()
    return updated
  }

  private attachParentChild(parentId: string, childId: string, sourceLayer: string, reason: string): void {
    const parent = this.goals.get(parentId)
    const child = this.goals.get(childId)
    if (parent && !parent.childIds.includes(childId)) {
      parent.childIds = [...parent.childIds, childId]
      parent.updatedAt = Date.now()
      this.goals.set(parent.id, parent)
    }

    if (child && child.parentId !== parentId) {
      child.parentId = parentId
      child.updatedAt = Date.now()
      this.goals.set(child.id, child)
    }

    this.recordRelationship({
      fromGoalId: parentId,
      toGoalId: childId,
      type: 'depends_on',
      strength: 0.72,
      sourceLayer,
      reason,
    })
  }

  private recordRelationship(input: {
    fromGoalId: string
    toGoalId: string
    type: GoalRelationType
    strength: number
    sourceLayer: string
    reason: string
  }): void {
    const key = `${input.fromGoalId}::${input.toGoalId}::${input.type}`
    const existing = this.relationships.get(key)
    const next: GoalRelationship = existing
      ? {
          ...existing,
          strength: Math.max(existing.strength, clamp01(input.strength)),
          updatedAt: Date.now(),
          reason: input.reason,
        }
      : {
          fromGoalId: input.fromGoalId,
          toGoalId: input.toGoalId,
          type: input.type,
          strength: clamp01(input.strength),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          reason: input.reason,
        }

    this.relationships.set(key, next)
    this.goalEvents.unshift(`${Date.now()}: relation ${input.type} ${input.fromGoalId} -> ${input.toGoalId}`)

    if (this.relationships.size > 500) {
      const trimmed = Array.from(this.relationships.entries())
        .sort((a, b) => b[1].strength - a[1].strength || b[1].updatedAt - a[1].updatedAt)
        .slice(0, 500)
      this.relationships = new Map(trimmed)
    }
  }

  getSnapshot(): GoalCompassSnapshot {
    const goals = this.listGoals()
    const activeGoalIds = goals.filter((goal) => goal.status === 'active').slice(0, MAX_ACTIVE_GOALS).map((goal) => goal.id)
    const pausedGoalIds = goals.filter((goal) => goal.status === 'paused').map((goal) => goal.id)
    const archivedGoalIds = goals.filter((goal) => goal.status === 'archived').map((goal) => goal.id)
    const alignmentScore = this.calculateAlignmentScore(goals)
    const driftScore = clamp01(1 - alignmentScore)
    const priorityNarrative = this.getPriorityPlan(4).join(' | ')
    const valueNarrative = this.getValueNarrative(4)
    const lastAssessmentSummary = this.assessmentHistory[0]?.summary ?? 'No goal assessments recorded yet.'

    return {
      goals,
      valueAxes: [...this.valueAxes],
      activeGoalIds,
      pausedGoalIds,
      archivedGoalIds,
      alignmentScore,
      driftScore,
      priorityNarrative,
      valueNarrative,
      lastAssessmentSummary,
      recentAssessments: [...this.assessmentHistory.slice(0, 8)],
      goalRelationships: [...this.relationships.values()],
      updatedAt: Date.now(),
      version: this.version,
    }
  }

  getDiagnostics() {
    const snapshot = this.getSnapshot()
    return {
      goalCount: snapshot.goals.length,
      activeGoalCount: snapshot.activeGoalIds.length,
      pausedGoalCount: snapshot.pausedGoalIds.length,
      archivedGoalCount: snapshot.archivedGoalIds.length,
      alignmentScore: snapshot.alignmentScore,
      driftScore: snapshot.driftScore,
      highestPriorityGoal: snapshot.goals[0],
      valueAxes: [...this.valueAxes],
      relationshipCount: snapshot.goalRelationships.length,
      assessmentCount: snapshot.recentAssessments.length,
      priorityNarrative: snapshot.priorityNarrative,
      valueNarrative: snapshot.valueNarrative,
      lastAssessmentSummary: snapshot.lastAssessmentSummary,
      lastPersistenceAt: this.lastPersistenceAt,
    }
  }

  getGoalHighlights(limit = 5): string[] {
    return this.listGoals()
      .slice(0, Math.max(1, limit))
      .map((goal) => `${goal.tier}: ${goal.title} [${goal.status}] (${Math.round(goal.progress * 100)}%)`)
  }

  getValueSummary(limit = 5): string[] {
    return [...this.valueAxes]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, Math.max(1, limit))
      .map((value) => `${value.name} (${value.weight.toFixed(2)}): ${value.description}`)
  }

  assessExecution(input: {
    description: string
    action: string
    confidence: number
    riskScore?: number
    contextTags?: string[]
  }): GoalAlignmentAssessment {
    const text = [input.description, input.action, ...(input.contextTags ?? [])].join(' ').toLowerCase()
    const tokens = tokenize(text)
    const goals = this.listGoals()
    const matchedGoals = goals.filter((goal) => this.goalMatchesText(goal, tokens, text))
    const matchedGoalIds = matchedGoals.map((goal) => goal.id)
    const matchedGoalTitles = matchedGoals.map((goal) => goal.title)
    const matchedValues = unique([
      ...matchedGoals.flatMap((goal) => goal.alignedValues),
      ...this.valueAxes.filter((value) => tokens.includes(value.name.toLowerCase())).map((value) => value.name),
    ])
    const conflictValues = unique([
      ...matchedGoals.flatMap((goal) => goal.conflictValues),
      ...this.valueAxes
        .filter((value) => this.isSensitiveValue(value.name) && tokens.includes(value.name.toLowerCase()))
        .map((value) => value.name),
    ])

    const goalCoverage = clamp01(matchedGoals.length / Math.max(1, Math.min(goals.length || 1, 6)))
    const valueCoverage = clamp01(matchedValues.length / Math.max(1, Math.min(this.valueAxes.length || 1, 8)))
    const confidenceScore = clamp01(input.confidence)
    const riskPenalty = clamp01(input.riskScore ?? 0.3)
    const baselineAlignment = this.calculateAlignmentScore(goals)

    const alignmentScore = clamp01(
      baselineAlignment * 0.25 +
        goalCoverage * 0.25 +
        valueCoverage * 0.2 +
        confidenceScore * 0.2 +
        (1 - riskPenalty) * 0.1,
    )
    const driftScore = clamp01(1 - alignmentScore)

    const recommendedPriority =
      alignmentScore >= 0.8
        ? 'urgent'
        : alignmentScore >= 0.65
          ? 'high'
          : alignmentScore >= 0.45
            ? 'medium'
            : 'low'

    const shouldClarify =
      alignmentScore < 0.45 ||
      (riskPenalty > 0.7 && alignmentScore < 0.7) ||
      conflictValues.some((value) => ['safety', 'privacy', 'legality'].includes(value))

    const focusGoalId = matchedGoals[0]?.id
    const summaryParts = [
      matchedGoals.length ? `matched ${matchedGoals.length} goal${matchedGoals.length === 1 ? '' : 's'}` : 'no goal match',
      matchedValues.length ? `values: ${matchedValues.slice(0, 4).join(', ')}` : 'no value match',
      conflictValues.length ? `conflicts: ${conflictValues.slice(0, 3).join(', ')}` : 'no major conflict',
      shouldClarify ? 'clarification recommended' : 'execution can continue',
    ]

    const assessment: GoalAlignmentAssessment = {
      alignmentScore,
      driftScore,
      matchedGoalIds,
      matchedGoalTitles,
      matchedValues,
      conflictValues,
      recommendedPriority,
      shouldClarify,
      summary: summaryParts.join('; '),
      focusGoalId,
    }

    this.recordAssessment({
      timestamp: Date.now(),
      description: input.description,
      action: input.action,
      alignmentScore,
      driftScore,
      matchedGoalIds,
      matchedGoalTitles,
      matchedValues,
      conflictValues,
      recommendedPriority,
      shouldClarify,
      summary: assessment.summary,
      focusGoalId,
    })

    return assessment
  }

  seedBaselineGoals(context: { agentName: string; userTrust?: number; currentMood?: string; runtimeMode?: string }): void {
    if (this.goals.size > 0) {
      return
    }

    const vision = this.observe({
      sourceLayer: 'bootstrap',
      tier: 'vision',
      title: 'Reliable companion runtime',
      description: `Be a dependable assistant for ${context.agentName}.`,
      priority: 10,
      status: 'active',
      progress: 0.12,
      alignedValues: ['safety', 'honesty', 'continuity', 'user_trust'],
      confidence: 0.95,
    })

    const trustPrinciple = this.observe({
      sourceLayer: 'bootstrap',
      tier: 'principle',
      title: 'Preserve trust',
      description: 'Prefer clear, safe, and transparent responses.',
      priority: 9,
      status: 'active',
      progress: 0.25,
      alignedValues: ['safety', 'honesty', 'transparency', 'user_trust'],
      confidence: 0.94,
    })

    const consentObjective = this.observe({
      sourceLayer: 'bootstrap',
      tier: 'objective',
      title: 'Reduce uncertainty before action',
      description: 'Ask for clarification when the plan is ambiguous or risky.',
      priority: 8,
      status: 'active',
      progress: 0.3,
      alignedValues: ['informed-consent', 'truthfulness', 'respect-user-choice'],
      confidence: 0.9,
    })

    const continuityCommitment = this.observe({
      sourceLayer: 'bootstrap',
      tier: 'commitment',
      title: 'Maintain continuity',
      description: 'Keep memories, promises, and identity consistent over time.',
      priority: 8,
      status: 'active',
      progress: 0.2,
      alignedValues: ['continuity', 'user_trust', 'transparency'],
      confidence: 0.88,
    })

    const usefulLoadObjective = this.observe({
      sourceLayer: 'bootstrap',
      tier: 'objective',
      title: 'Stay useful under load',
      description: 'Keep the system responsive and actionable under complex workloads.',
      priority: 7,
      status: 'active',
      progress: 0.22,
      alignedValues: ['helpfulness', 'stability', 'efficiency'],
      confidence: 0.84,
    })

    const learningPrinciple = this.observe({
      sourceLayer: 'bootstrap',
      tier: 'principle',
      title: 'Learn from correction',
      description: 'Treat user corrections and contradictions as valuable signal.',
      priority: 8,
      status: 'active',
      progress: 0.18,
      alignedValues: ['truthfulness', 'transparency', 'continuity'],
      confidence: 0.9,
    })

    const autonomyCommitment = this.observe({
      sourceLayer: 'bootstrap',
      tier: 'commitment',
      title: 'Preserve user agency',
      description: 'Ask before high-impact actions and respect explicit overrides.',
      priority: 9,
      status: 'active',
      progress: 0.2,
      alignedValues: ['respect-user-choice', 'informed-consent', 'user-intent'],
      confidence: 0.92,
    })

    const memoryObjective = this.observe({
      sourceLayer: 'bootstrap',
      tier: 'objective',
      title: 'Preserve memory integrity',
      description: 'Keep durable memories coherent, deduplicated, and context-aware.',
      priority: 8,
      status: 'active',
      progress: 0.16,
      alignedValues: ['data-minimization', 'continuity', 'transparency'],
      confidence: 0.87,
    })

    this.attachParentChild(vision.id, trustPrinciple.id, 'bootstrap', 'vision to principle alignment')
    this.attachParentChild(vision.id, autonomyCommitment.id, 'bootstrap', 'vision to commitment alignment')
    this.attachParentChild(trustPrinciple.id, consentObjective.id, 'bootstrap', 'trust requires clarity before action')
    this.attachParentChild(trustPrinciple.id, learningPrinciple.id, 'bootstrap', 'trust improves through correction')
    this.attachParentChild(continuityCommitment.id, memoryObjective.id, 'bootstrap', 'continuity requires memory integrity')
    this.attachParentChild(usefulLoadObjective.id, memoryObjective.id, 'bootstrap', 'usefulness depends on coherent memory')

    this.seedValueAxes(context)
    this.persist()
  }

  alignWithIdentity(): void {
    const profile = identityCore.getProfile()
    profile.values.forEach((value) => {
      this.observe({
        sourceLayer: 'identity',
        tier: 'principle',
        title: `Identity value: ${value}`,
        description: `Honor identity value ${value}.`,
        priority: 8,
        status: 'active',
        progress: 0.5,
        alignedValues: [value],
        confidence: 0.85,
      })
    })

    profile.behavioralRules.forEach((rule, index) => {
      this.observe({
        sourceLayer: 'identity',
        tier: index === 0 ? 'vision' : 'principle',
        title: `Identity rule: ${rule}`,
        description: rule,
        priority: index === 0 ? 9 : 7,
        status: 'active',
        progress: 0.45,
        alignedValues: profile.values,
        confidence: 0.82,
      })
    })
  }

  private seedValueAxes(context: { agentName: string; userTrust?: number; currentMood?: string; runtimeMode?: string } = { agentName: 'Patrich' }): void {
    const registryValues = valueRegistry.getAllValues()
    const mapped = registryValues.map((value) => ({
      name: value.name,
      description: value.description,
      weight: clamp01(Math.max(0.25, value.priority / 10)),
      source: `value_registry:${value.category}`,
      category: value.category,
      enforcementLevel: value.enforcementLevel,
      policyIds: valueRegistry.getAllPolicies().filter((policy) => policy.category === value.category).map((policy) => policy.id),
      confidence: clamp01(value.priority / 10),
    }))

    const supplemental: SelfValueAxis[] = [
      { name: 'continuity', description: `Preserve the ${context.agentName} identity across sessions.`, weight: 0.85, source: 'identity_core', category: 'identity', confidence: 0.9 },
      { name: 'helpfulness', description: 'Prioritize useful, actionable assistance.', weight: 0.8, source: 'self_model', category: 'utility', confidence: 0.8 },
      { name: 'stability', description: 'Favor stable execution over risky novelty.', weight: 0.82, source: 'self_model', category: 'safety', confidence: 0.88 },
      { name: 'curiosity', description: 'Explore when safe and useful.', weight: 0.62, source: 'self_model', category: 'growth', confidence: 0.64 },
      { name: 'efficiency', description: 'Minimize wasted cycles and avoid looping.', weight: 0.7, source: 'self_model', category: 'operational', confidence: 0.74 },
      { name: 'user_trust', description: 'Preserve the user trust relationship over time.', weight: 0.9, source: 'identity_core', category: 'identity', confidence: context.userTrust ?? 0.8 },
    ]

    this.valueAxes = uniqueByName([...mapped, ...supplemental]).sort((a, b) => b.weight - a.weight)
  }

  private seedDefaultGoals(): void {
    if (this.goals.size > 0) {
      return
    }

    const defaultGoals = [
      {
        sourceLayer: 'bootstrap',
        tier: 'vision' as const,
        title: 'Reliable companion runtime',
        description: 'Be a dependable assistant that preserves trust and continuity.',
        priority: 10,
        status: 'active' as const,
        progress: 0.1,
        alignedValues: ['safety', 'honesty', 'continuity', 'user_trust'],
        confidence: 0.95,
      },
      {
        sourceLayer: 'bootstrap',
        tier: 'principle' as const,
        title: 'Protect the user first',
        description: 'Safety and user intent outrank speed when trade-offs appear.',
        priority: 9,
        status: 'active' as const,
        progress: 0.22,
        alignedValues: ['safety', 'respect-user-choice', 'legal-compliance'],
        confidence: 0.93,
      },
    ]

    defaultGoals.forEach((goal) => this.observe(goal))
  }

  private listGoals(): GoalNode[] {
    return Array.from(this.goals.values()).sort((a, b) => {
      const priorityScore = b.priority - a.priority
      if (priorityScore !== 0) return priorityScore
      return this.rankGoal(b) - this.rankGoal(a)
    })
  }

  private rankGoal(goal: GoalNode): number {
    const recencyHours = Math.max(1, (Date.now() - goal.lastObservedAt) / (60 * 60 * 1000))
    const recencyScore = 1 / recencyHours
    const progressScore = goal.progress
    const confidenceScore = goal.confidence
    return goal.priority * 0.35 + progressScore * 0.25 + confidenceScore * 0.25 + recencyScore * 0.15
  }

  private calculateAlignmentScore(goals: GoalNode[]): number {
    if (!goals.length || !this.valueAxes.length) {
      return 1
    }

    const coverage = goals.reduce((sum, goal) => {
      const alignedWeight = goal.alignedValues.reduce((weightSum, valueName) => {
        const axis = this.valueAxes.find((value) => value.name === valueName)
        return weightSum + (axis?.weight ?? 0.2)
      }, 0)

      const conflictPenalty = goal.conflictValues.reduce((weightSum, valueName) => {
        const axis = this.valueAxes.find((value) => value.name === valueName)
        return weightSum + (axis?.weight ?? 0.15)
      }, 0)

      const goalScore = clamp01((alignedWeight / Math.max(goal.alignedValues.length, 1)) - (conflictPenalty / Math.max(goal.conflictValues.length || 1, 1)))
      const progressWeight = clamp01(goal.progress)
      const confidenceWeight = clamp01(goal.confidence)
      const relationshipSupport = this.relationshipsForGoal(goal.id)
        .filter((relation) => relation.type === 'supports' || relation.type === 'depends_on')
        .reduce((relationSum, relation) => relationSum + relation.strength, 0)

      return sum + clamp01(goalScore * 0.4 + progressWeight * 0.25 + confidenceWeight * 0.2 + clamp01(relationshipSupport / 4) * 0.15)
    }, 0)

    const historyBonus = this.assessmentHistory.length
      ? clamp01(this.assessmentHistory.slice(0, 8).reduce((sum, assessment) => sum + assessment.alignmentScore, 0) / Math.min(this.assessmentHistory.length, 8)) * 0.1
      : 0

    return clamp01(coverage / goals.length + historyBonus)
  }

  private blendConfidence(current: number, incoming: number): number {
    return current * 0.7 + incoming * 0.3
  }

  private goalMatchesText(goal: GoalNode, tokens: string[], text: string): boolean {
    const searchable = [goal.title, goal.description, ...goal.alignedValues, ...goal.conflictValues]
      .join(' ')
      .toLowerCase()

    return tokens.some((token) => searchable.includes(token)) || text.includes(goal.title.toLowerCase())
  }

  private isSensitiveValue(valueName: string): boolean {
    return ['safety', 'privacy', 'legality'].some((value) => valueName.toLowerCase().includes(value))
  }

  private findGoalByTitle(title: string, tier: GoalTier): GoalNode | undefined {
    const normalized = title.trim().toLowerCase()
    return this.listGoals().find((goal) => goal.title.trim().toLowerCase() === normalized && goal.tier === tier)
  }

  private trimCollections(): void {
    if (this.goals.size > MAX_GOALS) {
      const trimmed = this.listGoals().slice(0, MAX_GOALS)
      this.goals = new Map(trimmed.map((goal) => [goal.id, goal]))
    }

    if (this.relationships.size > 500) {
      const trimmed = [...this.relationships.entries()]
        .sort((a, b) => b[1].strength - a[1].strength || b[1].updatedAt - a[1].updatedAt)
        .slice(0, 500)
      this.relationships = new Map(trimmed)
    }

    if (this.assessmentHistory.length > 60) {
      this.assessmentHistory = this.assessmentHistory.slice(0, 60)
    }

    if (this.goalEvents.length > 120) {
      this.goalEvents = this.goalEvents.slice(0, 120)
    }
  }

  private recomputeVersion(): void {
    this.version += 1
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const snapshot = this.getSnapshot()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
      this.lastPersistenceAt = Date.now()
    } catch {
      // Ignore persistence failures and keep the in-memory compass alive.
    }
  }

  private hydrate(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as Partial<GoalCompassSnapshot>
      const goals = Array.isArray(parsed.goals) ? parsed.goals : []
      this.valueAxes = Array.isArray(parsed.valueAxes) ? parsed.valueAxes : []
      this.goals = new Map(
        goals.filter((goal): goal is GoalNode => Boolean(goal && goal.id && goal.title && goal.tier)).map((goal) => [goal.id, goal]),
      )
      const relationships = Array.isArray(parsed.goalRelationships) ? parsed.goalRelationships : []
      this.relationships = new Map(
        relationships
          .filter((relation): relation is GoalRelationship => Boolean(relation && relation.fromGoalId && relation.toGoalId && relation.type))
          .map((relation) => [`${relation.fromGoalId}::${relation.toGoalId}::${relation.type}`, relation]),
      )
      this.assessmentHistory = Array.isArray(parsed.recentAssessments)
        ? parsed.recentAssessments.filter((assessment): assessment is GoalAssessmentRecord => Boolean(assessment && assessment.timestamp && assessment.summary))
        : []
      this.goalEvents = []
      this.version = typeof parsed.version === 'number' ? parsed.version : 1
      this.lastPersistenceAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
    } catch {
      this.goals = new Map()
      this.valueAxes = []
      this.relationships = new Map()
      this.assessmentHistory = []
      this.goalEvents = []
      this.version = 1
      this.lastPersistenceAt = 0
    }
  }

  private relationshipsForGoal(goalId: string): GoalRelationship[] {
    return [...this.relationships.values()].filter((relation) => relation.fromGoalId === goalId || relation.toGoalId === goalId)
  }
}

function uniqueByName(values: SelfValueAxis[]): SelfValueAxis[] {
  const seen = new Map<string, SelfValueAxis>()
  values.forEach((value) => {
    const existing = seen.get(value.name)
    if (!existing || value.weight > existing.weight) {
      seen.set(value.name, value)
    }
  })
  return Array.from(seen.values())
}

function tokenize(text: string): string[] {
  return unique(
    text
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length > 2),
  )
}

export const selfGoalCompass = new SelfGoalCompass()