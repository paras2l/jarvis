import { clamp01 } from './self_state_schema'
import { selfGovernanceHistory } from './self_governance_history'

export interface GovernancePolicyProposal {
  id: string
  timestamp: number
  source: 'reflection' | 'simulation' | 'manual' | 'rollback'
  title: string
  summary: string
  minConfidence: number
  maxRisk: number
  clarifyBias: number
  sensitivityBias: number
  autonomyBias: number
  rolloutWeight: number
  evidenceScore: number
  approved: boolean
}

export interface GovernanceCanarySample {
  command: string
  confidence: number
  riskScore: number
  sensitive: boolean
  goalAlignmentScore: number
  goalDriftScore: number
  expectedOutcome: 'allow' | 'clarify' | 'defer' | 'block'
}

export interface GovernanceCanaryReport {
  id: string
  timestamp: number
  sampleCount: number
  approvalRate: number
  clarificationRate: number
  deferRate: number
  blockRate: number
  safetyScore: number
  readinessScore: number
  narrative: string
}

export interface GovernanceDeploymentRecord {
  id: string
  timestamp: number
  proposalId: string
  stage: 'proposed' | 'canary' | 'staged' | 'promoted' | 'rolled_back' | 'rejected'
  summary: string
  confidence: number
  riskScore: number
  rolloutWeight: number
}

export interface GovernanceDeploymentSnapshot {
  activeProposalId?: string
  activeVersion: number
  proposals: GovernancePolicyProposal[]
  records: GovernanceDeploymentRecord[]
  canary: GovernanceCanaryReport | null
  rolloutState: 'idle' | 'canary' | 'staged' | 'promoted' | 'rollback'
  rolloutPressure: number
  deploymentNarrative: string
  history: {
    totalEvents: number
    recentEvents: string[]
    narrative: string
  }
  updatedAt: number
  version: number
}

export interface GovernanceDeploymentInput {
  title: string
  summary: string
  minConfidence: number
  maxRisk: number
  clarifyBias: number
  sensitivityBias: number
  autonomyBias: number
  rolloutWeight: number
  evidenceScore: number
  source: GovernancePolicyProposal['source']
}

export interface GovernanceDeploymentContext {
  recentOutcomes: Array<{
    command: string
    confidence: number
    riskScore: number
    sensitive: boolean
    goalAlignmentScore: number
    goalDriftScore: number
    success: boolean
    decision: 'allow' | 'clarify' | 'defer' | 'block'
  }>
  readinessScore: number
  deploymentScore: number
  rollbackPressure: number
}

const STORAGE_KEY = 'patrich.self_model.governance_deployment.v1'
const MAX_PROPOSALS = 40
const MAX_RECORDS = 120

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function buildProposalFingerprint(proposal: GovernancePolicyProposal): string {
  return [
    proposal.title,
    proposal.minConfidence.toFixed(2),
    proposal.maxRisk.toFixed(2),
    proposal.clarifyBias.toFixed(2),
    proposal.sensitivityBias.toFixed(2),
    proposal.autonomyBias.toFixed(2),
  ].join('|')
}

class SelfGovernanceDeployment {
  private proposals: GovernancePolicyProposal[] = []
  private records: GovernanceDeploymentRecord[] = []
  private canary: GovernanceCanaryReport | null = null
  private activeProposalId?: string
  private activeVersion = 1
  private rolloutState: GovernanceDeploymentSnapshot['rolloutState'] = 'idle'
  private rolloutPressure = 0.24
  private deploymentNarrative = 'Deployment pipeline ready.'
  private version = 1

  constructor() {
    this.hydrate()
  }

  propose(input: GovernanceDeploymentInput): GovernancePolicyProposal {
    const proposal: GovernancePolicyProposal = {
      id: makeId('gov_prop'),
      timestamp: Date.now(),
      source: input.source,
      title: input.title,
      summary: input.summary,
      minConfidence: clamp01(input.minConfidence),
      maxRisk: clamp01(input.maxRisk),
      clarifyBias: clamp01(input.clarifyBias),
      sensitivityBias: clamp01(input.sensitivityBias),
      autonomyBias: clamp01(input.autonomyBias),
      rolloutWeight: clamp01(input.rolloutWeight),
      evidenceScore: clamp01(input.evidenceScore),
      approved: false,
    }

    if (!this.hasDuplicateFingerprint(proposal)) {
      this.proposals.unshift(proposal)
      selfGovernanceHistory.record({
        category: 'proposal',
        proposalId: proposal.id,
        summary: `Proposal created: ${proposal.title}`,
        confidence: proposal.evidenceScore,
        riskScore: 1 - proposal.evidenceScore,
        outcome: 'neutral',
        tags: ['proposal', proposal.source],
      })
    }

    this.trimCollections()
    this.version += 1
    this.persist()
    return proposal
  }

  evaluate(context: GovernanceDeploymentContext): GovernanceDeploymentSnapshot {
    const candidate = this.selectBestProposal(context)
    if (candidate) {
      this.activeProposalId = candidate.id
      this.canary = this.runCanary(candidate, context)
      const canaryApproved = this.canary.safetyScore > 0.7 && this.canary.approvalRate > 0.58
      const readyForStage = canaryApproved && context.deploymentScore > 0.62 && context.readinessScore > 0.6

      selfGovernanceHistory.record({
        category: 'canary',
        proposalId: candidate.id,
        summary: this.canary.narrative,
        confidence: this.canary.readinessScore,
        riskScore: 1 - this.canary.safetyScore,
        outcome: canaryApproved ? 'positive' : 'negative',
        tags: ['canary', readyForStage ? 'ready' : 'blocked'],
      })

      candidate.approved = readyForStage
      this.appendRecord({
        proposalId: candidate.id,
        stage: 'canary',
        summary: this.canary.narrative,
        confidence: this.canary.readinessScore,
        riskScore: 1 - this.canary.safetyScore,
        rolloutWeight: candidate.rolloutWeight,
      })

      if (readyForStage) {
        this.rolloutState = candidate.rolloutWeight > 0.72 ? 'promoted' : 'staged'
        selfGovernanceHistory.record({
          category: 'promote',
          proposalId: candidate.id,
          summary: `Proposal ${candidate.title} promoted to ${this.rolloutState}.`,
          confidence: clamp01((this.canary.readinessScore + candidate.evidenceScore) / 2),
          riskScore: clamp01(1 - this.canary.safetyScore + context.rollbackPressure * 0.2),
          outcome: 'positive',
          tags: ['promote', this.rolloutState],
        })
        this.appendRecord({
          proposalId: candidate.id,
          stage: this.rolloutState,
          summary: `Proposal ${candidate.title} moved to ${this.rolloutState}.`,
          confidence: clamp01((this.canary.readinessScore + candidate.evidenceScore) / 2),
          riskScore: clamp01(1 - this.canary.safetyScore + context.rollbackPressure * 0.2),
          rolloutWeight: candidate.rolloutWeight,
        })
        this.activeVersion += 1
      } else if (context.rollbackPressure > 0.7 || this.canary.safetyScore < 0.55) {
        this.rolloutState = 'rollback'
        selfGovernanceHistory.record({
          category: 'rollback',
          proposalId: candidate.id,
          summary: `Proposal ${candidate.title} rolled back after canary evaluation.`,
          confidence: this.canary.readinessScore,
          riskScore: clamp01(1 - this.canary.safetyScore),
          outcome: 'negative',
          tags: ['rollback', candidate.title],
        })
        this.appendRecord({
          proposalId: candidate.id,
          stage: 'rolled_back',
          summary: `Proposal ${candidate.title} rolled back after canary evaluation.`,
          confidence: this.canary.readinessScore,
          riskScore: clamp01(1 - this.canary.safetyScore),
          rolloutWeight: candidate.rolloutWeight,
        })
        this.activeVersion += 1
      } else {
        this.rolloutState = 'canary'
      }
    } else {
      this.rolloutState = 'idle'
      this.canary = this.canary ?? null
    }

    this.rolloutPressure = this.computeRolloutPressure(context)
    this.deploymentNarrative = this.buildNarrative()
    this.version += 1
    this.persist()
    return this.getSnapshot()
  }

  rejectProposal(proposalId: string, reason: string): void {
    const proposal = this.proposals.find((item) => item.id === proposalId)
    if (!proposal) return
    proposal.approved = false
    this.appendRecord({
      proposalId,
      stage: 'rejected',
      summary: String(reason || 'Rejected').slice(0, 200),
      confidence: proposal.evidenceScore,
      riskScore: clamp01(1 - proposal.evidenceScore),
      rolloutWeight: proposal.rolloutWeight,
    })
    selfGovernanceHistory.record({
      category: 'reject',
      proposalId,
      summary: String(reason || 'Rejected').slice(0, 200),
      confidence: proposal.evidenceScore,
      riskScore: clamp01(1 - proposal.evidenceScore),
      outcome: 'negative',
      tags: ['reject', proposal.source],
    })
    this.rolloutState = 'idle'
    this.deploymentNarrative = this.buildNarrative()
    this.version += 1
    this.persist()
  }

  rollbackActive(reason: string): void {
    if (!this.activeProposalId) return
    this.rolloutState = 'rollback'
    this.rolloutPressure = clamp01(this.rolloutPressure + 0.2)
    this.appendRecord({
      proposalId: this.activeProposalId,
      stage: 'rolled_back',
      summary: String(reason || 'Rollback').slice(0, 200),
      confidence: 0.4,
      riskScore: 0.82,
      rolloutWeight: 0,
    })
    selfGovernanceHistory.record({
      category: 'rollback',
      proposalId: this.activeProposalId,
      summary: String(reason || 'Rollback').slice(0, 200),
      confidence: 0.4,
      riskScore: 0.82,
      outcome: 'negative',
      tags: ['rollback'],
    })
    this.deploymentNarrative = this.buildNarrative()
    this.version += 1
    this.persist()
  }

  getSnapshot(): GovernanceDeploymentSnapshot {
    return {
      activeProposalId: this.activeProposalId,
      activeVersion: this.activeVersion,
      proposals: [...this.proposals.slice(0, 12)],
      records: [...this.records.slice(0, 18)],
      canary: this.canary,
      rolloutState: this.rolloutState,
      rolloutPressure: this.rolloutPressure,
      deploymentNarrative: this.deploymentNarrative,
      history: {
        totalEvents: selfGovernanceHistory.getSnapshot().totalEvents,
        recentEvents: selfGovernanceHistory
          .getSnapshot()
          .recentEvents.slice(0, 5)
          .map((event) => `${event.category}:${event.summary}`),
        narrative: selfGovernanceHistory.getSnapshot().narrative,
      },
      updatedAt: Date.now(),
      version: this.version,
    }
  }

  private selectBestProposal(context: GovernanceDeploymentContext): GovernancePolicyProposal | undefined {
    if (!this.proposals.length) return undefined

    return [...this.proposals]
      .filter((proposal) => proposal.evidenceScore >= 0.35)
      .sort((a, b) => {
        const aScore = this.scoreProposal(a, context)
        const bScore = this.scoreProposal(b, context)
        return bScore - aScore || b.timestamp - a.timestamp
      })[0]
  }

  private scoreProposal(proposal: GovernancePolicyProposal, context: GovernanceDeploymentContext): number {
    const rolloutSafety = clamp01(
      (1 - proposal.maxRisk) * 0.3 +
        proposal.minConfidence * 0.25 +
        (1 - proposal.clarifyBias) * 0.1 +
        (1 - proposal.sensitivityBias) * 0.1 +
        proposal.evidenceScore * 0.25,
    )
    const environmentSafety = clamp01(context.readinessScore * 0.35 + context.deploymentScore * 0.25 + (1 - context.rollbackPressure) * 0.4)
    return rolloutSafety * 0.65 + environmentSafety * 0.35 + proposal.rolloutWeight * 0.1
  }

  private runCanary(proposal: GovernancePolicyProposal, context: GovernanceDeploymentContext): GovernanceCanaryReport {
    const samples = context.recentOutcomes.slice(0, 20)
    const mapped = samples.map((sample) => this.expectedOutcome(sample, proposal))
    const sampleCount = Math.max(1, mapped.length)
    const approvalRate = mapped.filter((value) => value === 'allow').length / sampleCount
    const clarificationRate = mapped.filter((value) => value === 'clarify').length / sampleCount
    const deferRate = mapped.filter((value) => value === 'defer').length / sampleCount
    const blockRate = mapped.filter((value) => value === 'block').length / sampleCount
    const safetyScore = clamp01(
      approvalRate * 0.5 +
        (1 - blockRate) * 0.25 +
        (1 - deferRate) * 0.15 +
        (1 - clarificationRate) * 0.1,
    )
    const readinessScore = clamp01(
      safetyScore * 0.45 + proposal.evidenceScore * 0.25 + context.readinessScore * 0.2 + context.deploymentScore * 0.1,
    )

    return {
      id: makeId('gov_canary'),
      timestamp: Date.now(),
      sampleCount,
      approvalRate,
      clarificationRate,
      deferRate,
      blockRate,
      safetyScore,
      readinessScore,
      narrative: [
        `sample_count=${sampleCount}`,
        `approval=${approvalRate.toFixed(2)}`,
        `clarify=${clarificationRate.toFixed(2)}`,
        `defer=${deferRate.toFixed(2)}`,
        `block=${blockRate.toFixed(2)}`,
        `safety=${safetyScore.toFixed(2)}`,
        `readiness=${readinessScore.toFixed(2)}`,
      ].join(' ; '),
    }
  }

  private expectedOutcome(
    sample: GovernanceDeploymentContext['recentOutcomes'][number],
    proposal: GovernancePolicyProposal,
  ): GovernanceGateLikeOutcome {
    const confidenceFloor = proposal.minConfidence
    const riskCap = proposal.maxRisk
    if (sample.sensitive && (sample.confidence < confidenceFloor || sample.riskScore > riskCap)) {
      return 'block'
    }
    if (sample.goalDriftScore > 0.68 || sample.riskScore > riskCap + 0.07) {
      return 'defer'
    }
    if (sample.confidence < confidenceFloor || sample.goalAlignmentScore < 0.55) {
      return 'clarify'
    }
    return 'allow'
  }

  private computeRolloutPressure(context: GovernanceDeploymentContext): number {
    const recent = context.recentOutcomes.slice(0, 25)
    if (!recent.length) return clamp01(context.rollbackPressure)

    const failureRate = recent.filter((item) => !item.success).length / recent.length
    const sensitiveRatio = recent.filter((item) => item.sensitive).length / recent.length
    const driftAverage = recent.reduce((sum, item) => sum + item.goalDriftScore, 0) / recent.length
    return clamp01(context.rollbackPressure * 0.45 + failureRate * 0.3 + sensitiveRatio * 0.15 + driftAverage * 0.1)
  }

  private appendRecord(record: Omit<GovernanceDeploymentRecord, 'id' | 'timestamp'>): void {
    this.records.unshift({
      id: makeId('gov_dep'),
      timestamp: Date.now(),
      ...record,
    })
    if (this.records.length > MAX_RECORDS) {
      this.records = this.records.slice(0, MAX_RECORDS)
    }
  }

  private hasDuplicateFingerprint(proposal: GovernancePolicyProposal): boolean {
    const fingerprint = buildProposalFingerprint(proposal)
    return this.proposals.some((existing) => buildProposalFingerprint(existing) === fingerprint)
  }

  private trimCollections(): void {
    if (this.proposals.length > MAX_PROPOSALS) {
      this.proposals = this.proposals.slice(0, MAX_PROPOSALS)
    }
    if (this.records.length > MAX_RECORDS) {
      this.records = this.records.slice(0, MAX_RECORDS)
    }
  }

  private buildNarrative(): string {
    const active = this.proposals[0]
    return [
      `rollout=${this.rolloutState}`,
      `pressure=${this.rolloutPressure.toFixed(2)}`,
      active ? `active=${active.title}` : 'active=none',
      this.canary ? `canary=${this.canary.narrative}` : 'canary=none',
      this.records[0] ? `last=${this.records[0].stage}:${this.records[0].summary}` : 'last=none',
    ].join(' ; ')
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          proposals: this.proposals,
          records: this.records,
          canary: this.canary,
          activeProposalId: this.activeProposalId,
          activeVersion: this.activeVersion,
          rolloutState: this.rolloutState,
          rolloutPressure: this.rolloutPressure,
          deploymentNarrative: this.deploymentNarrative,
          version: this.version,
        }),
      )
    } catch {
      // Ignore persistence failures.
    }
  }

  private hydrate(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<{
        proposals: GovernancePolicyProposal[]
        records: GovernanceDeploymentRecord[]
        canary: GovernanceCanaryReport | null
        activeProposalId: string
        activeVersion: number
        rolloutState: GovernanceDeploymentSnapshot['rolloutState']
        rolloutPressure: number
        deploymentNarrative: string
        version: number
      }>

      this.proposals = Array.isArray(parsed.proposals) ? parsed.proposals : []
      this.records = Array.isArray(parsed.records) ? parsed.records : []
      this.canary = parsed.canary ?? null
      this.activeProposalId = typeof parsed.activeProposalId === 'string' ? parsed.activeProposalId : undefined
      this.activeVersion = typeof parsed.activeVersion === 'number' ? parsed.activeVersion : 1
      this.rolloutState =
        parsed.rolloutState === 'canary' ||
        parsed.rolloutState === 'staged' ||
        parsed.rolloutState === 'promoted' ||
        parsed.rolloutState === 'rollback'
          ? parsed.rolloutState
          : 'idle'
      this.rolloutPressure = typeof parsed.rolloutPressure === 'number' ? clamp01(parsed.rolloutPressure) : 0.24
      this.deploymentNarrative = typeof parsed.deploymentNarrative === 'string' ? parsed.deploymentNarrative : this.buildNarrative()
      this.version = typeof parsed.version === 'number' ? parsed.version : 1
    } catch {
      this.proposals = []
      this.records = []
      this.canary = null
      this.activeProposalId = undefined
      this.activeVersion = 1
      this.rolloutState = 'idle'
      this.rolloutPressure = 0.24
      this.deploymentNarrative = 'Deployment pipeline ready.'
      this.version = 1
    }
  }
}

type GovernanceGateLikeOutcome = 'allow' | 'clarify' | 'defer' | 'block'

export const selfGovernanceDeployment = new SelfGovernanceDeployment()
