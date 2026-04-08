import { clamp01, type SelfModelWorkspaceSnapshot } from './self_state_schema'

export type SelfBeliefDomain =
  | 'identity'
  | 'capability'
  | 'commitment'
  | 'environment'
  | 'goal'
  | 'task'
  | 'safety'
  | 'trust'
  | 'runtime'
  | 'memory'

export type SelfBeliefPolarity = 'affirmed' | 'negative' | 'neutral'
export type SelfBeliefEdgeType = 'supports' | 'contradicts' | 'refines'

export interface SelfBeliefNode {
  id: string
  subjectKey: string
  domain: SelfBeliefDomain
  statement: string
  polarity: SelfBeliefPolarity
  confidence: number
  supportCount: number
  contradictionCount: number
  persistent: boolean
  createdAt: number
  updatedAt: number
  lastObservedAt: number
  sources: string[]
  evidence: string[]
  tags: string[]
}

export interface SelfBeliefRevision {
  id: string
  beliefId: string
  timestamp: number
  sourceLayer: string
  reason: string
  previousStatement?: string
  nextStatement: string
  previousConfidence: number
  nextConfidence: number
  evidence?: string[]
}

export interface SelfBeliefEdge {
  id: string
  fromBeliefId: string
  toBeliefId: string
  type: SelfBeliefEdgeType
  strength: number
  createdAt: number
  updatedAt: number
  sourceLayer: string
  reason: string
  persistent: boolean
}

export interface SelfBeliefContradiction {
  id: string
  subjectKey: string
  domain: SelfBeliefDomain
  primaryBeliefId: string
  secondaryBeliefId: string
  severity: number
  status: 'open' | 'resolved'
  createdAt: number
  resolvedAt?: number
  sourceLayer: string
  reason: string
  evidence: string[]
  resolution?: string
}

export interface SelfBeliefGraphSnapshot {
  beliefs: SelfBeliefNode[]
  edges: SelfBeliefEdge[]
  revisions: SelfBeliefRevision[]
  contradictions: SelfBeliefContradiction[]
  updatedAt: number
  version: number
}

export interface SelfBeliefDomainSummary {
  domain: SelfBeliefDomain
  count: number
  averageConfidence: number
  openContradictions: number
}

export interface SelfBeliefWorkspaceSnapshot extends SelfModelWorkspaceSnapshot {
  dominantDomains: SelfBeliefDomainSummary[]
  recentBeliefs: string[]
  openContradictionSubjects: string[]
  revisionCount: number
  edgeCount: number
  graphHealth: number
}

export interface SelfModelGraphDiagnostics {
  beliefCount: number
  contradictionCount: number
  openContradictions: number
  coherenceScore: number
  trustScore: number
  staleBeliefCount: number
  persistentBeliefCount: number
  revisionCount: number
  edgeCount: number
  dominantDomains: SelfBeliefDomainSummary[]
  openContradictionSubjects: string[]
  graphHealth: number
  lastPersistenceAt: number
  topBeliefs: string[]
}

export interface SelfBeliefObservation {
  sourceLayer: string
  reason: string
  domain: SelfBeliefDomain
  subject: string
  statement: string
  confidence: number
  polarity?: SelfBeliefPolarity
  evidence?: string[]
  tags?: string[]
  persistent?: boolean
}

const STORAGE_KEY = 'patrich.self_model.graph.v1'
const MAX_BELIEFS = 300
const MAX_REVISION_HISTORY = 600
const MAX_CONTRADICTIONS = 300
const MAX_EDGES = 800

function normalizeSubject(value: string): string {
  const normalized = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')

  return normalized || 'unknown_subject'
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function oppositePolarity(polarity: SelfBeliefPolarity): SelfBeliefPolarity {
  if (polarity === 'affirmed') return 'negative'
  if (polarity === 'negative') return 'affirmed'
  return 'neutral'
}

function inferPolarity(statement: string): SelfBeliefPolarity {
  const text = String(statement || '').toLowerCase()
  if (/\b(not|never|cannot|can't|unable|failed|broken|degraded|blocked|missing)\b/.test(text)) {
    return 'negative'
  }
  if (/\b(can|able|ready|working|stable|reliable|available|support|successful)\b/.test(text)) {
    return 'affirmed'
  }
  return 'neutral'
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))))
}

class SelfBeliefGraph {
  private beliefs = new Map<string, SelfBeliefNode>()
  private edges: SelfBeliefEdge[] = []
  private revisions: SelfBeliefRevision[] = []
  private contradictions: SelfBeliefContradiction[] = []
  private version = 1
  private lastPersistenceAt = 0

  constructor() {
    this.hydrate()
  }

  observe(input: SelfBeliefObservation): SelfBeliefNode {
    const now = Date.now()
    const subjectKey = normalizeSubject(input.subject)
    const polarity = input.polarity ?? inferPolarity(input.statement)
    const confidence = clamp01(input.confidence)
    const persistent = input.persistent ?? true
    const existing = this.findBestMatch(subjectKey, input.domain, polarity)
    const counterpart = this.findBestMatch(subjectKey, input.domain, oppositePolarity(polarity))

    let belief: SelfBeliefNode
    if (existing) {
      const previousStatement = existing.statement
      const previousConfidence = existing.confidence
      belief = {
        ...existing,
        statement: input.statement,
        polarity,
        confidence: this.blendConfidence(existing.confidence, confidence),
        supportCount: existing.supportCount + 1,
        contradictionCount: existing.contradictionCount,
        persistent: existing.persistent || persistent,
        updatedAt: now,
        lastObservedAt: now,
        sources: uniqueStrings([...existing.sources, input.sourceLayer]),
        evidence: uniqueStrings([...existing.evidence, ...(input.evidence || []), input.reason]),
        tags: uniqueStrings([...existing.tags, ...(input.tags || []), input.domain]),
      }

      this.beliefs.set(existing.id, belief)
      this.revisions.push({
        id: makeId('self_rev'),
        beliefId: belief.id,
        timestamp: now,
        sourceLayer: input.sourceLayer,
        reason: input.reason,
        previousStatement,
        nextStatement: input.statement,
        previousConfidence,
        nextConfidence: belief.confidence,
        evidence: input.evidence,
      })
    } else {
      belief = {
        id: makeId('self_belief'),
        subjectKey,
        domain: input.domain,
        statement: input.statement,
        polarity,
        confidence,
        supportCount: 1,
        contradictionCount: 0,
        persistent,
        createdAt: now,
        updatedAt: now,
        lastObservedAt: now,
        sources: [input.sourceLayer],
        evidence: uniqueStrings([...(input.evidence || []), input.reason]),
        tags: uniqueStrings([...(input.tags || []), input.domain]),
      }

      this.beliefs.set(belief.id, belief)
      this.revisions.push({
        id: makeId('self_rev'),
        beliefId: belief.id,
        timestamp: now,
        sourceLayer: input.sourceLayer,
        reason: input.reason,
        nextStatement: input.statement,
        previousConfidence: 0,
        nextConfidence: belief.confidence,
        evidence: input.evidence,
      })
    }

    this.recordSupportEdge(belief, input)

    if (counterpart) {
      const contradiction = this.recordContradiction({
        sourceLayer: input.sourceLayer,
        reason: input.reason,
        subjectKey,
        domain: input.domain,
        primaryBeliefId: belief.id,
        secondaryBeliefId: counterpart.id,
        evidence: uniqueStrings([...(input.evidence || []), input.reason, counterpart.statement]),
        severity: Math.max(0.25, Math.abs(belief.confidence - counterpart.confidence)),
      })

      if (contradiction && this.shouldAutoResolve(belief, counterpart, contradiction.severity)) {
        this.resolveContradiction(contradiction.id, `${input.reason} (auto-resolved by stronger evidence)`, belief.id)
      }
    }

    this.trimCollections()
    this.recomputeVersion()
    this.persist()
    return belief
  }

  seedBaseline(agentId: string, runtimeMode: string, capabilities: string[]): void {
    if (this.beliefs.size > 0) {
      return
    }

    const identityBelief = this.observe({
      sourceLayer: 'bootstrap',
      reason: 'identity_seed',
      domain: 'identity',
      subject: 'core_identity',
      statement: `I am the persistent assistant runtime for ${agentId}.`,
      confidence: 0.92,
      polarity: 'affirmed',
      tags: ['identity', 'bootstrap'],
    })

    const safetyBelief = this.observe({
      sourceLayer: 'bootstrap',
      reason: 'safety_seed',
      domain: 'safety',
      subject: 'high_risk_actions_require_approval',
      statement: 'High-risk actions require approval before execution.',
      confidence: 0.98,
      polarity: 'affirmed',
      tags: ['safety', 'bootstrap'],
    })

    const runtimeBelief = this.observe({
      sourceLayer: 'bootstrap',
      reason: 'runtime_seed',
      domain: 'runtime',
      subject: 'runtime_mode',
      statement: `The runtime is currently in ${runtimeMode} mode.`,
      confidence: 0.86,
      polarity: 'affirmed',
      tags: ['runtime', 'bootstrap'],
    })

    this.recordEdge({
      fromBeliefId: identityBelief.id,
      toBeliefId: safetyBelief.id,
      type: 'supports',
      strength: 0.92,
      sourceLayer: 'bootstrap',
      reason: 'Identity backbone supports safety defaults',
      persistent: true,
    })

    this.recordEdge({
      fromBeliefId: identityBelief.id,
      toBeliefId: runtimeBelief.id,
      type: 'supports',
      strength: 0.9,
      sourceLayer: 'bootstrap',
      reason: 'Identity backbone supports runtime continuity',
      persistent: true,
    })

    capabilities.forEach((capability) => {
      const capabilityBelief = this.observe({
        sourceLayer: 'bootstrap',
        reason: 'capability_seed',
        domain: 'capability',
        subject: `capability_${capability}`,
        statement: `Capability available: ${capability}.`,
        confidence: 0.8,
        polarity: 'affirmed',
        tags: ['capability', 'bootstrap'],
      })

      this.recordEdge({
        fromBeliefId: runtimeBelief.id,
        toBeliefId: capabilityBelief.id,
        type: 'supports',
        strength: 0.78,
        sourceLayer: 'bootstrap',
        reason: `Runtime continuity depends on ${capability}`,
        persistent: true,
      })
    })
  }

  getSnapshot(): SelfBeliefGraphSnapshot {
    return {
      beliefs: this.listBeliefs(),
      edges: [...this.edges],
      revisions: [...this.revisions],
      contradictions: [...this.contradictions],
      updatedAt: Date.now(),
      version: this.version,
    }
  }

  getDiagnostics(): SelfModelGraphDiagnostics {
    const beliefs = this.listBeliefs()
    const now = Date.now()
    const openContradictions = this.contradictions.filter((item) => item.status === 'open')
    const staleBeliefCount = beliefs.filter((belief) => now - belief.lastObservedAt > 6 * 60 * 60 * 1000).length
    const persistentBeliefCount = beliefs.filter((belief) => belief.persistent).length
    const trustBeliefs = beliefs.filter((belief) => belief.domain === 'capability' || belief.domain === 'trust' || belief.domain === 'identity')
    const averageTrust = trustBeliefs.length
      ? trustBeliefs.reduce((sum, belief) => sum + belief.confidence, 0) / trustBeliefs.length
      : 0.72
    const contradictionPenalty = Math.min(0.65, openContradictions.length * 0.11)
    const stalenessPenalty = Math.min(0.35, staleBeliefCount * 0.05)
    const coherenceScore = clamp01(1 - contradictionPenalty - stalenessPenalty)
    const dominantDomains = this.getDomainSummaries(5)
    const openContradictionSubjects = Array.from(new Set(openContradictions.map((item) => item.subjectKey))).slice(0, 6)
    const graphHealth = clamp01(
      coherenceScore * 0.55 +
        clamp01(1 - openContradictions.length / 8) * 0.2 +
        clamp01(1 - staleBeliefCount / 12) * 0.15 +
        clamp01(1 - this.edges.length / 200) * 0.1,
    )

    return {
      beliefCount: beliefs.length,
      contradictionCount: this.contradictions.length,
      openContradictions: openContradictions.length,
      coherenceScore,
      trustScore: clamp01(averageTrust * coherenceScore),
      staleBeliefCount,
      persistentBeliefCount,
      revisionCount: this.revisions.length,
      edgeCount: this.edges.length,
      dominantDomains,
      openContradictionSubjects,
      graphHealth,
      lastPersistenceAt: this.lastPersistenceAt,
      topBeliefs: this.getHighlights(5),
    }
  }

  getHighlights(limit = 5): string[] {
    return this.listBeliefs()
      .slice(0, Math.max(1, limit))
      .map((belief) => `${belief.domain}: ${belief.statement} (${belief.confidence.toFixed(2)})`)
  }

  getWorkspaceSnapshot(): SelfBeliefWorkspaceSnapshot {
    const diagnostics = this.getDiagnostics()
    return {
      beliefCount: diagnostics.beliefCount,
      contradictionCount: diagnostics.contradictionCount,
      openContradictions: diagnostics.openContradictions,
      coherenceScore: diagnostics.coherenceScore,
      trustScore: diagnostics.trustScore,
      beliefHighlights: diagnostics.topBeliefs,
      dominantDomains: diagnostics.dominantDomains,
      recentBeliefs: this.listBeliefs()
        .slice(0, 5)
        .map((belief) => `${belief.domain}: ${belief.statement}`),
      openContradictionSubjects: diagnostics.openContradictionSubjects,
      revisionCount: diagnostics.revisionCount,
      edgeCount: diagnostics.edgeCount,
      graphHealth: diagnostics.graphHealth,
      updatedAt: Date.now(),
    }
  }

  getBeliefsByDomain(domain: SelfBeliefDomain): SelfBeliefNode[] {
    return this.listBeliefs().filter((belief) => belief.domain === domain)
  }

  getBeliefBySubject(subject: string, domain?: SelfBeliefDomain): SelfBeliefNode | undefined {
    const subjectKey = normalizeSubject(subject)
    return this.listBeliefs().find((belief) => belief.subjectKey === subjectKey && (!domain || belief.domain === domain))
  }

  getRelatedBeliefs(beliefId: string, limit = 6): SelfBeliefNode[] {
    const relatedIds = this.edges
      .filter((edge) => edge.fromBeliefId === beliefId || edge.toBeliefId === beliefId)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, Math.max(1, limit))
      .map((edge) => (edge.fromBeliefId === beliefId ? edge.toBeliefId : edge.fromBeliefId))

    return relatedIds
      .map((relatedId) => this.beliefs.get(relatedId))
      .filter((belief): belief is SelfBeliefNode => Boolean(belief))
  }

  resolveContradiction(contradictionId: string, resolution: string, preferredBeliefId?: string): boolean {
    const contradiction = this.contradictions.find((item) => item.id === contradictionId)
    if (!contradiction || contradiction.status === 'resolved') {
      return false
    }

    contradiction.status = 'resolved'
    contradiction.resolvedAt = Date.now()
    contradiction.resolution = resolution

    const primary = this.beliefs.get(contradiction.primaryBeliefId)
    const secondary = this.beliefs.get(contradiction.secondaryBeliefId)
    const preferred = preferredBeliefId ? this.beliefs.get(preferredBeliefId) : undefined
    const winner = preferred ?? primary ?? secondary
    const loser = winner?.id === contradiction.primaryBeliefId ? secondary : primary

    if (winner) {
      winner.supportCount += 1
      winner.confidence = clamp01(winner.confidence + 0.05)
      winner.updatedAt = Date.now()
      winner.lastObservedAt = Date.now()
      this.beliefs.set(winner.id, winner)
    }

    if (loser) {
      loser.confidence = clamp01(loser.confidence - 0.08)
      loser.updatedAt = Date.now()
      this.beliefs.set(loser.id, loser)
    }

    this.recordEdge({
      fromBeliefId: contradiction.primaryBeliefId,
      toBeliefId: contradiction.secondaryBeliefId,
      type: 'refines',
      strength: 0.35,
      sourceLayer: 'self-model',
      reason: resolution,
      persistent: true,
    })

    this.recomputeVersion()
    this.persist()
    return true
  }

  stabilize(): void {
    const open = this.contradictions.filter((item) => item.status === 'open')
    for (const contradiction of open) {
      const primary = this.beliefs.get(contradiction.primaryBeliefId)
      const secondary = this.beliefs.get(contradiction.secondaryBeliefId)
      if (!primary || !secondary) {
        continue
      }

      if (this.shouldAutoResolve(primary, secondary, contradiction.severity)) {
        this.resolveContradiction(contradiction.id, 'Auto-stabilized due to strong supporting evidence', primary.confidence >= secondary.confidence ? primary.id : secondary.id)
      }
    }
  }

  private listBeliefs(): SelfBeliefNode[] {
    return Array.from(this.beliefs.values()).sort((a, b) => this.rankBelief(b) - this.rankBelief(a))
  }

  private rankBelief(belief: SelfBeliefNode): number {
    const recencyHours = Math.max(1, (Date.now() - belief.lastObservedAt) / (60 * 60 * 1000))
    const recencyScore = 1 / recencyHours
    const supportScore = Math.min(1, belief.supportCount / 5)
    const contradictionPenalty = Math.min(0.5, belief.contradictionCount * 0.08)
    return belief.confidence * 0.55 + supportScore * 0.25 + recencyScore * 0.15 - contradictionPenalty
  }

  private blendConfidence(current: number, incoming: number): number {
    return clamp01(current * 0.7 + incoming * 0.3)
  }

  private findBestMatch(subjectKey: string, domain: SelfBeliefDomain, polarity: SelfBeliefPolarity): SelfBeliefNode | undefined {
    return this.listBeliefs().find(
      (belief) => belief.subjectKey === subjectKey && belief.domain === domain && belief.polarity === polarity,
    )
  }

  private recordContradiction(input: {
    sourceLayer: string
    reason: string
    subjectKey: string
    domain: SelfBeliefDomain
    primaryBeliefId: string
    secondaryBeliefId: string
    evidence: string[]
    severity: number
  }): SelfBeliefContradiction | undefined {
    const pairKey = [input.primaryBeliefId, input.secondaryBeliefId].sort().join('::')
    const existing = this.contradictions.find(
      (contradiction) =>
        contradiction.status === 'open' &&
        [contradiction.primaryBeliefId, contradiction.secondaryBeliefId].sort().join('::') === pairKey,
    )

    if (existing) {
      existing.severity = Math.max(existing.severity, input.severity)
      existing.evidence = uniqueStrings([...existing.evidence, ...input.evidence])
      this.recordEdge({
        fromBeliefId: input.primaryBeliefId,
        toBeliefId: input.secondaryBeliefId,
        type: 'contradicts',
        strength: clamp01(input.severity),
        sourceLayer: input.sourceLayer,
        reason: input.reason,
        persistent: true,
      })
      return existing
    }

    const contradiction: SelfBeliefContradiction = {
      id: makeId('self_contra'),
      subjectKey: input.subjectKey,
      domain: input.domain,
      primaryBeliefId: input.primaryBeliefId,
      secondaryBeliefId: input.secondaryBeliefId,
      severity: clamp01(input.severity),
      status: 'open',
      createdAt: Date.now(),
      sourceLayer: input.sourceLayer,
      reason: input.reason,
      evidence: uniqueStrings(input.evidence),
    }

    this.contradictions.push(contradiction)

    this.recordEdge({
      fromBeliefId: input.primaryBeliefId,
      toBeliefId: input.secondaryBeliefId,
      type: 'contradicts',
      strength: clamp01(input.severity),
      sourceLayer: input.sourceLayer,
      reason: input.reason,
      persistent: true,
    })

    const primary = this.beliefs.get(input.primaryBeliefId)
    const secondary = this.beliefs.get(input.secondaryBeliefId)
    if (primary) {
      primary.contradictionCount += 1
      primary.confidence = clamp01(primary.confidence - 0.03)
      primary.updatedAt = Date.now()
      this.beliefs.set(primary.id, primary)
    }
    if (secondary) {
      secondary.contradictionCount += 1
      secondary.confidence = clamp01(secondary.confidence - 0.05)
      secondary.updatedAt = Date.now()
      this.beliefs.set(secondary.id, secondary)
    }

    return contradiction
  }

  private recordSupportEdge(belief: SelfBeliefNode, input: SelfBeliefObservation): void {
    const anchor = this.getBeliefBySubject(input.subject, input.domain)
    if (!anchor || anchor.id === belief.id) {
      return
    }

    this.recordEdge({
      fromBeliefId: anchor.id,
      toBeliefId: belief.id,
      type: input.polarity === 'negative' ? 'refines' : 'supports',
      strength: clamp01(Math.max(0.35, belief.confidence)),
      sourceLayer: input.sourceLayer,
      reason: input.reason,
      persistent: input.persistent ?? true,
    })
  }

  private recordEdge(input: {
    fromBeliefId: string
    toBeliefId: string
    type: SelfBeliefEdgeType
    strength: number
    sourceLayer: string
    reason: string
    persistent: boolean
  }): void {
    const existing = this.edges.find(
      (edge) =>
        edge.fromBeliefId === input.fromBeliefId &&
        edge.toBeliefId === input.toBeliefId &&
        edge.type === input.type,
    )

    if (existing) {
      existing.strength = Math.max(existing.strength, clamp01(input.strength))
      existing.updatedAt = Date.now()
      existing.reason = input.reason
      return
    }

    this.edges.push({
      id: makeId('self_edge'),
      fromBeliefId: input.fromBeliefId,
      toBeliefId: input.toBeliefId,
      type: input.type,
      strength: clamp01(input.strength),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceLayer: input.sourceLayer,
      reason: input.reason,
      persistent: input.persistent,
    })

    if (this.edges.length > MAX_EDGES) {
      this.edges = this.edges.slice(-MAX_EDGES)
    }
  }

  private getDomainSummaries(limit = 5): SelfBeliefDomainSummary[] {
    const beliefs = this.listBeliefs()
    const domainMap = new Map<SelfBeliefDomain, { count: number; confidenceSum: number; openContradictions: number }>()

    beliefs.forEach((belief) => {
      const current = domainMap.get(belief.domain) || { count: 0, confidenceSum: 0, openContradictions: 0 }
      current.count += 1
      current.confidenceSum += belief.confidence
      domainMap.set(belief.domain, current)
    })

    this.contradictions.forEach((contradiction) => {
      if (contradiction.status !== 'open') return
      const current = domainMap.get(contradiction.domain) || { count: 0, confidenceSum: 0, openContradictions: 0 }
      current.openContradictions += 1
      domainMap.set(contradiction.domain, current)
    })

    return Array.from(domainMap.entries())
      .map(([domain, value]) => ({
        domain,
        count: value.count,
        averageConfidence: value.count ? value.confidenceSum / value.count : 0,
        openContradictions: value.openContradictions,
      }))
      .sort((a, b) => b.count - a.count || b.averageConfidence - a.averageConfidence)
      .slice(0, Math.max(1, limit))
  }

  private shouldAutoResolve(primary: SelfBeliefNode, secondary: SelfBeliefNode, severity: number): boolean {
    const confidenceGap = Math.abs(primary.confidence - secondary.confidence)
    const recencyGapMs = Math.abs(primary.lastObservedAt - secondary.lastObservedAt)
    return severity < 0.45 && confidenceGap > 0.25 && recencyGapMs > 30 * 60 * 1000
  }

  private trimCollections(): void {
    if (this.beliefs.size > MAX_BELIEFS) {
      const trimmed = this.listBeliefs().slice(0, MAX_BELIEFS)
      this.beliefs = new Map(trimmed.map((belief) => [belief.id, belief]))
    }

    if (this.revisions.length > MAX_REVISION_HISTORY) {
      this.revisions = this.revisions.slice(-MAX_REVISION_HISTORY)
    }

    if (this.contradictions.length > MAX_CONTRADICTIONS) {
      this.contradictions = this.contradictions.slice(-MAX_CONTRADICTIONS)
    }

    if (this.edges.length > MAX_EDGES) {
      this.edges = this.edges.slice(-MAX_EDGES)
    }
  }

  private recomputeVersion(): void {
    this.version += 1
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') {
      return
    }

    try {
      const payload: SelfBeliefGraphSnapshot = this.getSnapshot()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
      this.lastPersistenceAt = Date.now()
    } catch {
      // Ignore persistence failures and keep the in-memory graph alive.
    }
  }

  private hydrate(): void {
    if (typeof localStorage === 'undefined') {
      return
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as Partial<SelfBeliefGraphSnapshot>
      const beliefs = Array.isArray(parsed.beliefs) ? parsed.beliefs : []
      const edges = Array.isArray(parsed.edges) ? parsed.edges : []
      const revisions = Array.isArray(parsed.revisions) ? parsed.revisions : []
      const contradictions = Array.isArray(parsed.contradictions) ? parsed.contradictions : []

      this.beliefs = new Map(
        beliefs
          .filter((belief): belief is SelfBeliefNode => Boolean(belief && belief.id && belief.subjectKey && belief.domain && belief.statement))
          .map((belief) => [belief.id, belief]),
      )
      this.edges = edges.filter((edge): edge is SelfBeliefEdge => Boolean(edge && edge.id && edge.fromBeliefId && edge.toBeliefId))
      this.revisions = revisions.filter((revision): revision is SelfBeliefRevision => Boolean(revision && revision.id && revision.beliefId))
      this.contradictions = contradictions.filter((item): item is SelfBeliefContradiction => Boolean(item && item.id && item.primaryBeliefId))
      this.version = typeof parsed.version === 'number' ? parsed.version : 1
      this.lastPersistenceAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
    } catch {
      this.beliefs = new Map()
      this.edges = []
      this.revisions = []
      this.contradictions = []
      this.version = 1
      this.lastPersistenceAt = 0
    }
  }
}

export const selfBeliefGraph = new SelfBeliefGraph()